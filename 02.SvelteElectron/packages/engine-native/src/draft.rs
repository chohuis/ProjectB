// 신인 드래프트 — 후보 자격 (Phase 7-1 D-2)
//
// 예전엔 후보가 **졸업생뿐**이었다. 고3 졸업자와 대학 4학년 졸업자만
// `LEAGUE_DRAFT_POOL`로 옮겨져 드래프트에 나왔고, 대학 저학년과 독립리그
// 선수는 영원히 신청할 수 없었다.
//
// 이제 두 종류의 후보가 있다:
//
//   졸업 후보  소속이 사라진 사람 (고3 졸업 · 대4 졸업). 지명되든 안 되든
//              어딘가로 가야 한다 — 미지명이면 진로 배정을 받는다
//   신청 후보  소속을 **유지한 채** 신청한 사람 (대학 재학생 · 독립리그).
//              지명되면 팀을 떠나고, **미지명이면 제자리다**
//
// 이 구분이 중요하다. 신청 후보를 졸업 후보처럼 드래프트 풀로 옮기면
// 미지명일 때 돌아갈 팀이 없어져 대학 재학생이 매년 사라진다.
//
// 저학년이 전원 신청하면 대학 리그가 해마다 흔들리므로, 신청 의사를 확률이
// 아니라 **능력치 하한**으로 정한다 — "지명될 만한 실력이면 신청한다".
// 결정적이고 화면에 설명할 수 있다.

use serde::{Deserialize, Serialize};

use crate::npc_sim::npc_core_ovr;
use crate::sim_types::NpcSaveState;

/// 소속이 사라져 드래프트 풀에 들어간 선수의 리그 ID
pub const DRAFT_POOL_LEAGUE: &str = "LEAGUE_DRAFT_POOL";

// ── 규칙 (generation_rules.json draftRules) ─────────────────────────────────

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EarlyEntryRules {
    /// 대학 재학생 학년별 OVR 하한. 인덱스 0 = 1학년.
    /// 졸업반(gradeMax)은 여기 없다 — 졸업이라 자동으로 후보다
    pub university_by_grade: Vec<f64>,
    /// 독립리그 선수 OVR 하한. 소속 연차와 무관하게 매년 신청할 수 있다
    pub independent: f64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRules {
    pub rounds: i32,
    /// 나이 게이트. 예전 값 18은 **고3 나이**라 재학생이 후보에 섞였다
    pub age_min: i32,
    pub age_max: i32,
    pub early_entry: EarlyEntryRules,
}

// ── 후보 ────────────────────────────────────────────────────────────────────

/// 후보가 어디서 왔나. 미지명 처리와 화면 표기가 갈린다
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DraftRoute {
    /// 고교 졸업 — 소속 없음
    HighschoolGraduate,
    /// 대학 졸업 — 소속 없음
    UniversityGraduate,
    /// 대학 재학 중 신청 — 소속 유지
    UniversityEarly,
    /// 독립리그에서 신청 — 소속 유지
    Independent,
}

impl DraftRoute {
    /// 미지명일 때 진로 배정을 받아야 하는가. 소속을 유지한 신청자는 제자리다
    pub fn needs_placement(self) -> bool {
        matches!(self, DraftRoute::HighschoolGraduate | DraftRoute::UniversityGraduate)
    }

    pub fn label(self) -> &'static str {
        match self {
            DraftRoute::HighschoolGraduate => "고졸",
            DraftRoute::UniversityGraduate => "대졸",
            DraftRoute::UniversityEarly    => "대학 재학",
            DraftRoute::Independent        => "독립",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftCandidate {
    pub npc_id: String,
    pub route: DraftRoute,
    pub ovr: f64,
    pub age: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCandidatesParams {
    pub npcs: Vec<NpcSaveState>,
    pub rules: DraftRules,
    /// 대학 졸업 학년 (rosterRules.LEAGUE_UNIVERSITY.gradeMax)
    #[serde(default = "default_univ_grade_max")]
    pub university_grade_max: u8,
}

fn default_univ_grade_max() -> u8 { 4 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCandidatesResult {
    pub candidates: Vec<DraftCandidate>,
    /// 경로별 인원 — 로그·화면용 (고졸/대졸/대학 재학/독립 순)
    pub counts: [usize; 4],
}

/// 이 선수가 드래프트를 신청할 수 있는 경로. 자격이 없으면 None
fn route_of(npc: &NpcSaveState, rules: &DraftRules, univ_grade_max: u8) -> Option<DraftRoute> {
    // 복무 중·은퇴자는 후보가 아니다. 상무가 독립리그 소속이라
    // 리그로만 거르면 복무자가 드래프트에 나온다
    if npc.career_status != "active" { return None; }
    if npc.age < rules.age_min || npc.age > rules.age_max { return None; }

    match npc.current_league.as_str() {
        DRAFT_POOL_LEAGUE => {
            // 소속이 사라진 사람. **마지막 경력 기록의 리그**로 고졸/대졸을 가른다 —
            // `advance_all_grades`가 풀로 보내기 직전에 그 해 기록을 남긴다.
            // school_id로는 못 가른다: 고교 팀도 대학 팀도 refs에 schoolId가 있다
            let last = npc.career_history.last().map(|e| e.league_id.as_str());
            Some(match last {
                Some("LEAGUE_UNIVERSITY") => DraftRoute::UniversityGraduate,
                _ => DraftRoute::HighschoolGraduate,
            })
        }
        "LEAGUE_UNIVERSITY" => {
            let grade = npc.grade?;
            if grade >= univ_grade_max { return None; }  // 졸업반은 졸업 경로로 온다
            let min = *rules.early_entry.university_by_grade.get(grade.saturating_sub(1) as usize)?;
            (npc_core_ovr(npc) >= min).then_some(DraftRoute::UniversityEarly)
        }
        "LEAGUE_INDEPENDENT" => {
            (npc_core_ovr(npc) >= rules.early_entry.independent).then_some(DraftRoute::Independent)
        }
        _ => None,
    }
}

pub fn select_candidates(params: SelectCandidatesParams) -> SelectCandidatesResult {
    let mut candidates = Vec::new();
    let mut counts = [0usize; 4];

    for npc in &params.npcs {
        let Some(route) = route_of(npc, &params.rules, params.university_grade_max) else { continue };
        counts[route as usize] += 1;
        candidates.push(DraftCandidate {
            npc_id: npc.npc_id.clone(),
            route,
            ovr: npc_core_ovr(npc),
            age: npc.age,
        });
    }

    // OVR 내림차순 — 지명 시뮬이 이 순서를 전제하지는 않지만,
    // 로그와 화면이 그대로 쓰므로 여기서 한 번만 정렬한다
    candidates.sort_by(|a, b| b.ovr.partial_cmp(&a.ovr).unwrap_or(std::cmp::Ordering::Equal));

    SelectCandidatesResult { candidates, counts }
}

// ── 테스트 ──────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// **실데이터를 읽는다.** 인라인 규칙으로 두면 게임과 달라져
    /// 테스트가 거짓 안심을 준다 (docs/design/roster.md §10)
    fn rules() -> DraftRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["draftRules"].clone()).expect("draftRules 파싱 실패")
    }

    fn npc(id: &str, league: &str, grade: Option<u8>, ovr: f64, age: i32) -> NpcSaveState {
        let mut n: NpcSaveState = serde_json::from_str(&format!(r#"{{
            "npcId": "{id}", "name": "테스트", "playerType": "pitcher", "position": "SP",
            "age": {age}, "schoolId": "SCHOOL_X", "graduationYear": 2026, "careerStatus": "active",
            "currentLeague": "{league}", "currentTeam": "TEAM_X", "militaryStatus": "미필",
            "developmentRate": 60, "careerHistory": [], "achievements": [],
            "pitching": {{ "ovr": {ovr}, "stamina": 50, "velocity": 50, "command": 50,
                "control": 50, "movement": 50, "mentality": 50, "recovery": 50,
                "clutch": 50, "holdRunners": 50 }}
        }}"#)).expect("픽스처 파싱");
        n.grade = grade;
        n
    }

    /// 졸업 직전 시즌 기록 — 이걸로 고졸/대졸이 갈린다
    fn with_last_league(mut n: NpcSaveState, league_id: &str) -> NpcSaveState {
        n.career_history.push(crate::sim_types::NpcCareerEntry {
            year: 2026,
            league_id: league_id.into(),
            team_id: "TEAM_X".into(),
            stat_line: "-".into(),
            highlights: vec![],
        });
        n
    }

    fn select(npcs: Vec<NpcSaveState>) -> SelectCandidatesResult {
        select_candidates(SelectCandidatesParams { npcs, rules: rules(), university_grade_max: 4 })
    }

    #[test]
    fn 졸업생은_마지막_경력_리그로_고졸_대졸이_갈린다() {
        let hs = with_last_league(npc("HS", DRAFT_POOL_LEAGUE, None, 65.0, 20), "LEAGUE_HIGHSCHOOL");
        let uv = with_last_league(npc("UV", DRAFT_POOL_LEAGUE, None, 65.0, 24), "LEAGUE_UNIVERSITY");

        let r = select(vec![hs, uv]);
        assert_eq!(r.counts[DraftRoute::HighschoolGraduate as usize], 1);
        assert_eq!(r.counts[DraftRoute::UniversityGraduate as usize], 1);
    }

    #[test]
    fn 대학_졸업반은_재학_경로로_중복되지_않는다() {
        // grade 4는 advance_all_grades가 이미 졸업시켜 풀로 보낸다.
        // 여기서 또 잡으면 같은 사람이 후보에 두 번 들어간다
        let r = select(vec![npc("A", "LEAGUE_UNIVERSITY", Some(4), 90.0, 23)]);
        assert_eq!(r.candidates.len(), 0);
    }

    #[test]
    fn 대학_저학년은_능력치가_되어야_신청한다() {
        let rl = rules();
        let min1 = rl.early_entry.university_by_grade[0];
        let ok  = npc("OK",  "LEAGUE_UNIVERSITY", Some(1), min1, 20);
        let low = npc("LOW", "LEAGUE_UNIVERSITY", Some(1), min1 - 1.0, 20);

        let r = select(vec![ok, low]);
        assert_eq!(r.candidates.len(), 1, "하한 미달은 신청하지 않는다");
        assert_eq!(r.candidates[0].npc_id, "OK");
    }

    #[test]
    fn 학년이_올라갈수록_신청_문턱이_낮아진다() {
        let by = rules().early_entry.university_by_grade;
        assert!(by.len() >= 3, "1~3학년 하한이 있어야 한다");
        for w in by.windows(2) {
            assert!(w[1] <= w[0], "상급생 문턱이 더 높으면 얼리 신청이 뒤집힌다: {by:?}");
        }
    }

    #[test]
    fn 소속을_유지한_신청자는_미지명이어도_제자리다() {
        assert!(!DraftRoute::UniversityEarly.needs_placement());
        assert!(!DraftRoute::Independent.needs_placement());
        assert!(DraftRoute::HighschoolGraduate.needs_placement());
        assert!(DraftRoute::UniversityGraduate.needs_placement());
    }

    #[test]
    fn 복무자는_후보가_아니다() {
        // 상무는 독립리그 소속이라 리그로만 거르면 그대로 들어온다
        let mut m = npc("M", "LEAGUE_INDEPENDENT", None, 90.0, 22);
        m.career_status = "military".into();
        assert_eq!(select(vec![m]).candidates.len(), 0);
    }

    #[test]
    fn 나이_게이트가_고교_재학생을_막는다() {
        let rl = rules();
        // 고3이 19세다 (design/roster.md §1). 게이트 하한이 그보다 높아야
        // 재학생이 안 섞인다
        assert!(rl.age_min > 19, "age_min {} 이면 고3이 후보가 된다", rl.age_min);
        let young = npc("Y", DRAFT_POOL_LEAGUE, None, 90.0, rl.age_min - 1);
        assert_eq!(select(vec![young]).candidates.len(), 0);
    }

    #[test]
    fn 라운드_수가_규칙에서_온다() {
        assert!(rules().rounds > 0);
    }
}
