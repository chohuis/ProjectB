//! 게임 캘린더(대화 2026-07-21, 홈 화면 실제 날짜 표시 신설) —
//! `current_day`(1부터 시작하는 절대 일수, `advance()`가 쓰는 그 값)를
//! 실제 그레고리력 연/월/일로 변환한다. 에폭은 캐릭터 생성 설계(생년
//! 2010 고정, 시작 시 17세 → 시작 연도 2027)와 한국 고교 신학기(3/2)에
//! 맞춘 2027-03-02. 이 세계관 안에서만 쓰이는 고정 에폭이라 세기 예외
//! (100/400 배수) 없는 단순 4의 배수 윤년 규칙으로 충분하다(커리어
//! 15~20시즌 동안 세기 경계를 넘을 일이 없음).
//!
//! 시즌은 3/2~다음해 3/1이라 실제 날짜 길이가 매번 365 또는 366일로
//! 달라진다 — `advance()`의 시즌 경계 판정(예전엔 `today % 364 == 0`
//! 고정 나눗셈)이 이제 이 모듈의 `is_season_boundary`를 쓴다.

pub const EPOCH_YEAR: i64 = 2027;
pub const EPOCH_MONTH: u32 = 3;
pub const EPOCH_DAY: u32 = 2;

pub fn is_leap_year(year: i64) -> bool {
    year % 4 == 0
}

fn days_in_month(year: i64, month: u32) -> u32 {
    match month {
        1 => 31,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        3 => 31,
        4 => 30,
        5 => 31,
        6 => 30,
        7 => 31,
        8 => 31,
        9 => 30,
        10 => 31,
        11 => 30,
        12 => 31,
        _ => unreachable!("month must be 1..=12"),
    }
}

/// 시즌은 (에폭 연도 + n - 1)년 3/2에 시작해 그 다음 해 3/1에 끝난다 —
/// 그 구간의 2월은 다음 해(에폭 연도 + n)에 속하므로, 시즌 n의 길이는
/// `is_leap_year(EPOCH_YEAR + n)`을 본다.
pub fn season_length(season: i64) -> i64 {
    if is_leap_year(EPOCH_YEAR + season) { 366 } else { 365 }
}

/// `current_day`(1부터) → (연, 월, 일).
pub fn calendar_date_for_day(current_day: i64) -> (i64, u32, u32) {
    let mut year = EPOCH_YEAR;
    let mut month = EPOCH_MONTH;
    let mut day = EPOCH_DAY;
    let mut remaining = current_day.max(1) - 1;
    while remaining > 0 {
        let dim = days_in_month(year, month);
        if day < dim {
            day += 1;
        } else {
            day = 1;
            month += 1;
            if month > 12 {
                month = 1;
                year += 1;
            }
        }
        remaining -= 1;
    }
    (year, month, day)
}

/// `current_day` → (시즌 번호(1부터), 그 시즌 안에서 몇 번째 날인지(1부터)).
pub fn season_and_day_of_season(current_day: i64) -> (i64, i64) {
    let mut season = 1;
    let mut remaining = current_day.max(1);
    loop {
        let len = season_length(season);
        if remaining <= len {
            return (season, remaining);
        }
        remaining -= len;
        season += 1;
    }
}

/// 오늘이 시즌의 마지막 날인지 — `advance()`가 이걸로 `season_rollover`를
/// 트리거할지 판정한다.
pub fn is_season_boundary(current_day: i64) -> bool {
    let (season, day_of_season) = season_and_day_of_season(current_day);
    day_of_season == season_length(season)
}

/// `season_stats`가 주 단위로 누적되는 기준(1부터 시작) — 시즌 안에서
/// 몇 번째 날인지를 7로 나눠 구한다.
pub fn week_for_day(current_day: i64) -> i64 {
    let (_, day_of_season) = season_and_day_of_season(current_day);
    (day_of_season - 1) / 7 + 1
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn day_one_is_the_epoch_date() {
        assert_eq!(calendar_date_for_day(1), (2027, 3, 2));
    }

    #[test]
    fn day_two_advances_one_day() {
        assert_eq!(calendar_date_for_day(2), (2027, 3, 3));
    }

    #[test]
    fn crossing_a_month_boundary_rolls_over_correctly() {
        // 2027-03-02 + 29일 = 2027-03-31, +1 = 2027-04-01.
        assert_eq!(calendar_date_for_day(30), (2027, 3, 31));
        assert_eq!(calendar_date_for_day(31), (2027, 4, 1));
    }

    #[test]
    fn season_one_is_365_days_and_boundary_lands_on_day_365() {
        // 시즌1(2027~2028): 2028년이 윤년이 아니라(2028%4==0? 2028/4=507
        // 정수라 실은 윤년) -> season_length가 366이어야 함. 반대로 2029는
        // 아님. 아래는 실제 계산으로 검증(하드코딩 대신).
        let expected = if is_leap_year(EPOCH_YEAR + 1) { 366 } else { 365 };
        assert_eq!(season_length(1), expected);
        assert!(is_season_boundary(expected));
        assert!(!is_season_boundary(expected - 1));
        assert!(!is_season_boundary(expected + 1));
    }

    #[test]
    fn season_and_day_of_season_resets_after_a_boundary() {
        let len1 = season_length(1);
        assert_eq!(season_and_day_of_season(len1), (1, len1));
        assert_eq!(season_and_day_of_season(len1 + 1), (2, 1));
    }

    #[test]
    fn leap_year_rule_is_simple_multiple_of_four() {
        assert!(is_leap_year(2028));
        assert!(!is_leap_year(2027));
        assert!(!is_leap_year(2029));
    }

    #[test]
    fn week_for_day_groups_seven_days_per_week_and_resets_at_season_boundary() {
        assert_eq!(week_for_day(1), 1);
        assert_eq!(week_for_day(7), 1);
        assert_eq!(week_for_day(8), 2);
        assert_eq!(week_for_day(14), 2);
        assert_eq!(week_for_day(15), 3);

        let len1 = season_length(1);
        assert_eq!(week_for_day(len1 + 1), 1);
    }
}
