// 투구수별 의무 휴식 (Phase 5-8)
//
// DESIGN §7.2 · 02_고교.md §4-3 · 03_대학.md §4-5 · 04_독립.md §4 — 전 리그 공통 표다.
// 상한만 리그별로 다르고(고교 105 / 그 외 120) 휴식 규칙 자체는 같다.
//
// **일 단위**로 판정한다. 주 단위(`lastPitchedWeek`)로는 표현이 안 된다 —
// 고교 주말리그는 토·일 이틀 연속이라 "토요일 105구 던지고 일요일 또"가
// 주 단위 검사로는 걸러지지 않는다. 5-3~5-7에서 리그별 요일을 다르게 깐 이유가 이것.

use serde::{Deserialize, Serialize};

/// 당일 투구수 → 다음 등판까지 **쉬어야 하는 날 수**.
///
/// 0 = 다음날 등판 가능. 5 = 5일 쉬고 6일째 등판 가능.
pub fn mandatory_rest_days(pitches: u32) -> u32 {
    match pitches {
        0..=30 => 0,
        31..=45 => 1,
        46..=60 => 2,
        61..=75 => 3,
        76..=95 => 4,
        _ => 5,
    }
}

fn is_leap(y: i64) -> bool {
    y % 4 == 0 && (y % 100 != 0 || y % 400 == 0)
}

/// "YYYY-MM-DD" → 일련일(에폭 무관, 차이 계산 전용). 파싱 실패 시 None.
pub fn date_ordinal(date: &str) -> Option<i64> {
    let b = date.as_bytes();
    if b.len() < 10 {
        return None;
    }
    let y: i64 = date.get(0..4)?.parse().ok()?;
    let m: i64 = date.get(5..7)?.parse().ok()?;
    let d: i64 = date.get(8..10)?.parse().ok()?;
    if !(1..=12).contains(&m) || !(1..=31).contains(&d) {
        return None;
    }
    // 3월을 연초로 보는 표준 변환 — 윤년 분기가 사라져 식이 짧아진다
    let a = (14 - m) / 12;
    let yy = y + 4800 - a;
    let mm = m + 12 * a - 3;
    let _ = is_leap(y);
    Some(d + (153 * mm + 2) / 5 + 365 * yy + yy / 4 - yy / 100 + yy / 400 - 32045)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestCheckParams {
    /// 마지막 등판 날짜 "YYYY-MM-DD". 미등판이면 빈 문자열
    pub last_pitched_date: String,
    /// 그날 던진 투구 수
    pub last_pitch_count: u32,
    /// 등판하려는 경기 날짜
    pub game_date: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestCheckResult {
    pub available: bool,
    /// 필요한 휴식일
    pub required_rest_days: u32,
    /// 실제로 쉰 날 수 (마지막 등판일과의 차이 − 1). 미등판이면 -1
    pub actual_rest_days: i64,
}

/// 의무 휴식을 채웠는가.
///
/// 날짜가 비었거나 파싱이 안 되면 **막지 않는다** — 데이터가 없다는 이유로
/// 선수를 못 던지게 하면 새 세이브·마이그레이션 직후에 리그가 멈춘다.
pub fn check_rest(p: RestCheckParams) -> RestCheckResult {
    let required = mandatory_rest_days(p.last_pitch_count);
    if p.last_pitched_date.is_empty() {
        return RestCheckResult { available: true, required_rest_days: required, actual_rest_days: -1 };
    }
    let (last, game) = match (date_ordinal(&p.last_pitched_date), date_ordinal(&p.game_date)) {
        (Some(a), Some(b)) => (a, b),
        _ => return RestCheckResult { available: true, required_rest_days: required, actual_rest_days: -1 },
    };
    // 같은 날 재등판은 없다. 다음날이면 사이에 쉰 날은 0.
    let rested = game - last - 1;
    RestCheckResult {
        available: rested >= required as i64,
        required_rest_days: required,
        actual_rest_days: rested,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rest_table_matches_design() {
        assert_eq!(mandatory_rest_days(0), 0);
        assert_eq!(mandatory_rest_days(30), 0);
        assert_eq!(mandatory_rest_days(31), 1);
        assert_eq!(mandatory_rest_days(45), 1);
        assert_eq!(mandatory_rest_days(46), 2);
        assert_eq!(mandatory_rest_days(60), 2);
        assert_eq!(mandatory_rest_days(61), 3);
        assert_eq!(mandatory_rest_days(75), 3);
        assert_eq!(mandatory_rest_days(76), 4);
        assert_eq!(mandatory_rest_days(95), 4);
        assert_eq!(mandatory_rest_days(96), 5);
        assert_eq!(mandatory_rest_days(120), 5);
    }

    #[test]
    fn weekend_back_to_back_is_blocked() {
        // 고교 주말리그: 토요일 105구 → 일요일 등판 불가 (5일 필요)
        let r = check_rest(RestCheckParams {
            last_pitched_date: "2026-05-02".into(),
            last_pitch_count: 105,
            game_date: "2026-05-03".into(),
        });
        assert!(!r.available);
        assert_eq!(r.required_rest_days, 5);
        assert_eq!(r.actual_rest_days, 0);
    }

    #[test]
    fn short_outing_allows_next_day() {
        let r = check_rest(RestCheckParams {
            last_pitched_date: "2026-05-02".into(),
            last_pitch_count: 25,
            game_date: "2026-05-03".into(),
        });
        assert!(r.available);
    }

    #[test]
    fn crosses_month_and_year() {
        // 2026-12-31에 100구 → 5일 휴식 → 2027-01-06부터 가능
        let blocked = check_rest(RestCheckParams {
            last_pitched_date: "2026-12-31".into(), last_pitch_count: 100,
            game_date: "2027-01-05".into(),
        });
        assert!(!blocked.available, "rested={}", blocked.actual_rest_days);
        let ok = check_rest(RestCheckParams {
            last_pitched_date: "2026-12-31".into(), last_pitch_count: 100,
            game_date: "2027-01-06".into(),
        });
        assert!(ok.available, "rested={}", ok.actual_rest_days);
    }

    #[test]
    fn missing_date_never_blocks() {
        let r = check_rest(RestCheckParams {
            last_pitched_date: "".into(), last_pitch_count: 120,
            game_date: "2026-05-03".into(),
        });
        assert!(r.available);
    }
}
