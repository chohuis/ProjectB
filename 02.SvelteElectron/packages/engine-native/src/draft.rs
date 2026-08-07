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
use crate::sim_types::{NpcCareerEvent, NpcSaveState};

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

/// 지명 순번 구간별 계약. `until_pick` 이하면 이 줄이 적용된다
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PickContract {
    pub until_pick: i32,
    pub salary: i64,
    pub bonus: i64,
}

/// 신인 계약 규칙.
///
/// KBO 신인은 **연봉이 최저연봉으로 균일하고 차등은 계약금이 진다.**
/// 예전 TS 표는 1순위 연봉 9,000만원(규정 위반)에 하위 지명 1,500만원
/// (최저연봉 3,000만원 미달)이었다 — 양쪽으로 다 틀렸다.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftContractRules {
    pub duration_years: i32,
    pub by_pick: Vec<PickContract>,
    #[serde(default = "default_index_min")]
    pub team_index_min: f64,
    #[serde(default = "default_index_max")]
    pub team_index_max: f64,
}

fn default_index_min() -> f64 { 0.85 }
fn default_index_max() -> f64 { 1.15 }

impl DraftContractRules {
    /// (연봉, 계약금, 계약연수). 팀 예산 지수는 **계약금에만** 곱한다 —
    /// 연봉은 규정상 균일이라 팀 사정이 못 건드린다
    pub fn for_pick(&self, pick_no: i32, team_index: f64) -> (i64, i64, i32) {
        let row = self.by_pick.iter()
            .find(|r| pick_no <= r.until_pick)
            .or_else(|| self.by_pick.last());
        let Some(row) = row else { return (0, 0, self.duration_years) };
        let idx = team_index.clamp(self.team_index_min, self.team_index_max);
        let bonus = ((row.bonus as f64 * idx) / 100.0).round() as i64 * 100;
        (row.salary, bonus, self.duration_years)
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftRules {
    pub rounds: i32,
    /// 나이 게이트. 예전 값 18은 **고3 나이**라 재학생이 후보에 섞였다
    pub age_min: i32,
    pub age_max: i32,
    pub early_entry: EarlyEntryRules,
    /// **이 라운드 이하 지명자는 1군에서 시작한다** (특급 신인).
    /// 0이면 전원 2군. 나머지 신인의 1군 진입은 Phase 7-2 승강 로직이 맡는다
    #[serde(default)]
    pub first_team_rounds: i32,
    #[serde(default)]
    pub contract: Option<DraftContractRules>,
    /// 미지명자가 **다시 신청할 수 있는 햇수.**
    ///
    /// ⚠ 예전엔 이게 없어서 `age_max`(29)까지 열려 있었다. 소속이 없어진
    /// 사람은 매년 후보로 돌아오는데, 경력의 마지막이 고교면 "고졸"로 잡혀
    /// **29세가 '고교' 출신으로 드래프트 보드에 떴다.**
    #[serde(default = "default_reentry_max_years")]
    pub reentry_max_years: i32,
}

fn default_reentry_max_years() -> i32 { 2 }

/// 첫 드래프트를 보는 나이. 고3은 19세, 대4는 23세다
const FIRST_DRAFT_AGE_HS: i32 = 19;
const FIRST_DRAFT_AGE_UNIV: i32 = 23;

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
    /// 고교 졸업 학년 (rosterRules.LEAGUE_HIGHSCHOOL.gradeMax)
    #[serde(default = "default_hs_grade_max")]
    pub highschool_grade_max: u8,
}

fn default_univ_grade_max() -> u8 { 4 }
fn default_hs_grade_max() -> u8 { 3 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectCandidatesResult {
    pub candidates: Vec<DraftCandidate>,
    /// 경로별 인원 — 로그·화면용 (고졸/대졸/대학 재학/독립 순)
    pub counts: [usize; 4],
}

/// 이 선수가 드래프트를 신청할 수 있는 경로. 자격이 없으면 None
fn route_of(npc: &NpcSaveState, rules: &DraftRules, p: &SelectCandidatesParams) -> Option<DraftRoute> {
    // 복무 중·은퇴자는 후보가 아니다. 상무가 독립리그 소속이라
    // 리그로만 거르면 복무자가 드래프트에 나온다
    if npc.career_status != "active" { return None; }
    if npc.age < rules.age_min || npc.age > rules.age_max { return None; }

    // ⚠ **외국인은 신인 드래프트 대상이 아니다.** KBO 드래프트는 국내 아마추어
    // 몫이고, 외국인은 보유 한도(팀당 3명)가 걸린 별도 경로로만 들어온다.
    //
    // 이게 없어서 **퇴출된 용병이 독립리그로 흘러간 뒤 드래프트로 KBL에 다시
    // 지명됐다** — 그 경로는 한도를 안 봐서 팀당 6명까지 찼다(실측).
    //
    //     Trevor Curtis  draft_picked LEAGUE_INDEPENDENT→LEAGUE_KBL
    //     Brett Palmer   draft_picked LEAGUE_INDEPENDENT→LEAGUE_KBL
    //
    // ⚠ 국적으로 거른다 — 리그로 거르면 못 잡는다. **그 사람은 그 시점에
    // 독립리그 소속**이고, 독립리그는 외국인 개념이 없는 리그다.
    if npc.nationality.as_deref().unwrap_or("KOR") != "KOR" { return None; }

    match npc.current_league.as_str() {
        // **졸업 예정자.** 드래프트는 졸업 전(11월)에 한다 — 실제 KBO도 그렇고,
        // 그래야 관전 화면(W47)과 실제 지명이 같은 명단을 본다.
        // 저학년은 학년 게이트로 막힌다 (나이 게이트만으로는 못 막는다)
        "LEAGUE_HIGHSCHOOL" => (npc.grade? >= p.highschool_grade_max)
            .then_some(DraftRoute::HighschoolGraduate),

        "LEAGUE_UNIVERSITY" => {
            let grade = npc.grade?;
            if grade >= p.university_grade_max {
                return Some(DraftRoute::UniversityGraduate);
            }
            let min = *rules.early_entry.university_by_grade.get(grade.saturating_sub(1) as usize)?;
            (npc_core_ovr(npc) >= min).then_some(DraftRoute::UniversityEarly)
        }

        "LEAGUE_INDEPENDENT" => {
            (npc_core_ovr(npc) >= rules.early_entry.independent).then_some(DraftRoute::Independent)
        }

        // 이미 졸업해 소속이 사라진 사람 (구 세이브·시즌 종료 후 재실행 경로).
        // **마지막 경력 기록의 리그**로 고졸/대졸을 가른다 — school_id로는 못 가른다:
        // 고교 팀도 대학 팀도 refs에 schoolId가 있다
        DRAFT_POOL_LEAGUE => {
            let from_univ = matches!(
                npc.career_history.last().map(|e| e.league_id.as_str()),
                Some("LEAGUE_UNIVERSITY")
            );
            // ⚠ **재도전에 기한을 둔다.** 없으면 `age_max`까지 매년 돌아와
            // 29세가 "고졸"로 보드에 뜬다. 기한이 지나면 후보가 아니고,
            // 진로 배정(`Placer`)이 대학·독립·2군으로 보내거나 은퇴시킨다.
            let first = if from_univ { FIRST_DRAFT_AGE_UNIV } else { FIRST_DRAFT_AGE_HS };
            if npc.age > first + rules.reentry_max_years { return None; }
            Some(if from_univ { DraftRoute::UniversityGraduate } else { DraftRoute::HighschoolGraduate })
        }
        _ => None,
    }
}

pub fn select_candidates(params: SelectCandidatesParams) -> SelectCandidatesResult {
    let mut candidates = Vec::new();
    let mut counts = [0usize; 4];

    for npc in &params.npcs {
        let Some(route) = route_of(npc, &params.rules, &params) else { continue };
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

// ── 진로 배정 ───────────────────────────────────────────────────────────────

/// 야구를 그만둔 사람에게 붙는 이벤트. 저장 슬림화가 이걸 보고 판단한다
pub const QUIT_EVENT: &str = "quit_baseball";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacementRules {
    pub university_max: usize,
    pub independent_max: usize,
    /// 이 나이를 넘으면 독립리그도 안 받는다 (rosterRules.LEAGUE_INDEPENDENT.ageMax)
    pub independent_age_max: i32,
    /// 대학이 **한 해에** 팀당 받을 수 있는 인원 (정원 ÷ 학년 수).
    ///
    /// ⚠ 없으면 팀 정원(`university_max`)만 보고 채워서 **학년 균형이 깨진다.**
    /// 한 해에 많이 받으면 4년 뒤 그 코호트가 한꺼번에 빠져나가고 다시 크게
    /// 받는 4년 주기가 생긴다 — 실측 대학 유입이 194~558로 진동했고,
    /// 저점 해의 고교 졸업생은 갈 곳이 없어 대량으로 야구를 그만뒀다
    /// (포기 630~1,163명). 어느 해에 태어났느냐가 운명을 가르면 안 된다.
    #[serde(default)]
    pub university_annual_max: Option<usize>,
    /// 프로 2군 팀당 정원. 0이면 2군을 목적지로 안 쓴다(구 페이로드 호환)
    #[serde(default)]
    pub farm_max: usize,
    /// 육성선수 연봉(만원). 여기로 들어온 사람은 **육성선수 신분**이다.
    ///
    /// ⚠ **최저연봉(3000)보다 낮아야 한다.** 같거나 높으면 드래프트로
    /// 들어올 이유가 없어진다 — 지명은 계약금이 붙고 육성은 안 붙는데,
    /// 연봉까지 같으면 하위 라운드 지명이 무의미해진다.
    /// KBO 육성선수도 최저연봉 보장이 없다.
    ///
    /// `None`이면 무계약(연봉 0·기간 0) — 배선 전 동작 그대로다
    #[serde(default)]
    pub development_salary: Option<i64>,
}

/// 갈 곳 없는 선수들의 진로를 정한다.
///
/// **세 종류가 같은 로직을 탄다** — 미지명 졸업생 · 방출된 프로 · FA 미계약자.
/// 셋 다 "소속이 없어진 사람"이고, 따로 짜면 셋 중 하나가 반드시 어긋난다.
///
/// ⚠ **대학은 고교 졸업자만 갈 수 있다.** 예전엔 경로를 안 보고 남는 자리부터
/// 채워서 **대졸 미지명자가 대학 1학년으로 다시 입학**했다. 스태프와 달리
/// 선수의 `대학 → 대학`은 학적이 허용하지 않는다 (`_ledger.md` P6-9).
pub struct Placer<'a> {
    /// 팀 → (투수, 야수)
    roster: std::collections::HashMap<String, (usize, usize)>,
    /// 팀 → 전문 요원(포수) 수.
    ///
    /// ⚠ **투수/야수 비율만 보면 자리는 못 본다.** `find_slot`이 비율만
    /// 맞추므로 야수 자리가 남으면 포수든 외야수든 그냥 넣었다 — 대학은
    /// 승강도 육성선수도 없어서 한 번 생긴 포수 공백이 **안 메워진다**
    /// (실측 대학 1팀이 포수 0명으로 시즌을 났다).
    /// 이 프로젝트에서 반복된 "몇 명은 맞고 어느 자리가 틀렸다"의 그 형태다.
    specialists: std::collections::HashMap<String, usize>,
    /// 팀 → 이번 배치에서 대학이 새로 받은 인원 (학년 균형용)
    univ_intake: std::collections::HashMap<String, usize>,
    university: &'a [String],
    independent: &'a [String],
    /// 프로 2군. **방출된 프로 선수가 갈 첫 자리다** —
    /// 독립리그보다 먼저 본다(현실에서도 다른 팀 팜과 계약한다)
    farm: &'a [String],
    rules: PlacementRules,
}

impl<'a> Placer<'a> {
    pub fn new(
        npcs: &[NpcSaveState],
        university: &'a [String],
        independent: &'a [String],
        farm: &'a [String],
        rules: PlacementRules,
    ) -> Self {
        let univ: std::collections::HashSet<&str> = university.iter().map(|s| s.as_str()).collect();
        let ind: std::collections::HashSet<&str> = independent.iter().map(|s| s.as_str()).collect();
        let frm: std::collections::HashSet<&str> = farm.iter().map(|s| s.as_str()).collect();
        let mut roster = std::collections::HashMap::new();
        let mut specialists: std::collections::HashMap<String, usize> = std::collections::HashMap::new();
        for npc in npcs {
            // ⚠ **부상자도 로스터를 차지한다.** `active`만 세면 그만큼 빈자리로
            // 착각해 정원을 넘겨 배치한다 — 실측에서 독립리그가 정원 300인데
            // 410명(41/팀)까지 불어났다. 자리를 비우는 건 은퇴뿐이다.
            if npc.career_status == "retired" { continue; }
            let t = npc.current_team.as_str();
            if !univ.contains(t) && !ind.contains(t) && !frm.contains(t) { continue; }
            let e = roster.entry(npc.current_team.clone()).or_insert((0usize, 0usize));
            if npc.player_type == "pitcher" { e.0 += 1; } else { e.1 += 1; }
            if crate::tuning::is_specialist_position(&npc.position) {
                *specialists.entry(npc.current_team.clone()).or_insert(0) += 1;
            }
        }
        Self { roster, specialists, univ_intake: std::collections::HashMap::new(),
               university, independent, farm, rules }
    }

    /// 이미 자리를 잡은 사람을 로스터 집계에서 빼둔다 (지명된 재학생 등)
    pub fn forget(&mut self, npc: &NpcSaveState) {
        if let Some(e) = self.roster.get_mut(&npc.current_team) {
            if npc.player_type == "pitcher" { e.0 = e.0.saturating_sub(1); }
            else { e.1 = e.1.saturating_sub(1); }
        }
        if crate::tuning::is_specialist_position(&npc.position) {
            if let Some(c) = self.specialists.get_mut(&npc.current_team) {
                *c = c.saturating_sub(1);
            }
        }
    }

    /// 팀별 빈 슬롯 탐색. 포지션 수요 우선(strict), 없으면 슬롯만 본다
    ///
    /// `annual_max`가 있으면 **이번 배치에서 그 팀이 받은 인원**도 함께 본다.
    /// 대학의 학년 균형이 이걸로 유지된다.
    /// ⚠ **단계가 셋이다.** 예전엔 투수/야수 비율만 보는 두 단계였고,
    /// 그래서 야수 자리가 남으면 포수든 외야수든 그냥 넣었다 — 대학은
    /// 승강도 육성선수도 없어 **한 번 생긴 포수 공백이 안 메워진다.**
    ///
    ///   0단계  그 전문 요원이 **0명인 팀** (포수 지원자일 때만)
    ///   1단계  보직 비율이 맞는 팀
    ///   2단계  자리만 남으면
    ///
    /// 0단계를 비율보다 **앞**에 두는 게 핵심이다. 뒤에 두면 비율이 맞는
    /// 팀이 먼저 채가서 정작 포수 없는 팀은 계속 비어 있다.
    fn find_slot(
        &mut self, want_pitcher: bool, position: &str,
        teams: &[String], max: usize, annual_max: Option<usize>,
    ) -> Option<String> {
        let specialist = crate::tuning::is_specialist_position(position);
        for stage in 0u8..3 {
            if stage == 0 && !specialist { continue; }
            let mut best: Option<(String, usize)> = None;
            for tid in teams {
                let (p, b) = self.roster.get(tid).copied().unwrap_or((0, 0));
                let total = p + b;
                if total >= max { continue; }
                if let Some(am) = annual_max {
                    if self.univ_intake.get(tid).copied().unwrap_or(0) >= am { continue; }
                }
                if stage == 0 {
                    // 그 자리가 이미 있는 팀은 건너뛴다
                    if self.specialists.get(tid).copied().unwrap_or(0) > 0 { continue; }
                } else if stage == 1 {
                    let ratio = if total > 0 { p as f64 / total as f64 } else { 0.5 };
                    // 투수 비율 >0.65면 투수 사양, <0.55면 야수 사양
                    if want_pitcher && ratio > 0.65 { continue; }
                    if !want_pitcher && ratio < 0.55 { continue; }
                }
                let slots = max - total;
                if best.as_ref().map_or(true, |(_, s)| slots > *s) {
                    best = Some((tid.clone(), slots));
                }
            }
            if let Some((tid, _)) = best {
                let e = self.roster.entry(tid.clone()).or_insert((0, 0));
                if want_pitcher { e.0 += 1; } else { e.1 += 1; }
                if specialist { *self.specialists.entry(tid.clone()).or_insert(0) += 1; }
                return Some(tid);
            }
        }
        None
    }

    /// `allow_university`는 **고교 졸업자만 true**여야 한다
    pub fn place(
        &mut self,
        npc: &mut NpcSaveState,
        year: i32,
        event_type: &str,
        reason: &str,
        allow_university: bool,
    ) {
        let is_pitcher = npc.player_type == "pitcher";
        let from_team = (!npc.current_team.is_empty()).then(|| npc.current_team.clone());

        let placed = allow_university
            .then(|| self.find_slot(
                is_pitcher, &npc.position, self.university, self.rules.university_max,
                self.rules.university_annual_max,
            ))
            .flatten()
            .map(|t| (t, "LEAGUE_UNIVERSITY"))
            .or_else(|| {
                // ⚠ **프로 2군이 독립리그보다 먼저다.**
                //
                // 2군은 유입이 드래프트 하위 라운드 지명 하나뿐인데 1군이
                // 콜업으로 계속 빼간다 — 실측에서 야수 29명에 **투수 6명**이
                // 됐고 오프시즌에도 회복이 없었다. 1군의 `fill_first_teams`에
                // 해당하는 보충 경로가 2군엔 없다.
                //
                // 현실에서도 방출된 프로 선수는 독립리그보다 **다른 팀 팜과
                // 계약**하는 게 자연스럽다. `find_slot`이 포지션 수요를 보므로
                // 모자란 보직으로 들어간다.
                (self.rules.farm_max > 0)
                    .then(|| self.find_slot(is_pitcher, &npc.position, self.farm, self.rules.farm_max, None))
                    .flatten()
                    .map(|t| (t, "LEAGUE_KBL_FARM"))
            })
            .or_else(|| {
                // 독립리그는 나이 제한이 있다. 서른 넘은 미지명자를 받으면
                // 독립 로스터가 은퇴 직전 선수로만 채워진다
                (npc.age <= self.rules.independent_age_max)
                    .then(|| self.find_slot(
                        is_pitcher, &npc.position, self.independent, self.rules.independent_max, None,
                    ))
                    .flatten()
                    .map(|t| (t, "LEAGUE_INDEPENDENT"))
            });

        match placed {
            Some((tid, league)) => {
                let dest = match league {
                    "LEAGUE_UNIVERSITY" => "대학리그",
                    "LEAGUE_KBL_FARM"   => "2군",
                    _                    => "독립리그",
                };
                npc.career_events.push(NpcCareerEvent {
                    year,
                    event_type: event_type.into(),
                    from_team_id: from_team,
                    to_team_id: Some(tid.clone()),
                    from_league_id: None,
                    to_league_id: Some(league.into()),
                    detail: Some(format!("{reason} → {dest}")),
                });
                // 대학 연간 유입 카운터 — 학년 균형의 근거다
                if league == "LEAGUE_UNIVERSITY" {
                    *self.univ_intake.entry(tid.clone()).or_insert(0) += 1;
                }
                npc.current_league = league.into();
                npc.current_team = tid;
                npc.grade = (league == "LEAGUE_UNIVERSITY").then_some(1);
                npc.current_salary = 0;
                npc.contract_years = 0;

                // ── 육성선수 ────────────────────────────────────────
                // 프로 2군으로 갔으면 **드래프트 지명자와 다른 신분**이다.
                // 계약금이 없고, 연봉이 최저연봉 아래고, 단년이고, 입단
                // 연도엔 5월까지 1군에 못 올라간다.
                //
                // ⚠ 소속이 아니라 신분을 남긴다. 강등된 정식 선수도 2군에
                // 있으므로 리그 ID로 판정하면 그 사람까지 육성선수가 된다
                if league == "LEAGUE_KBL_FARM" {
                    if let Some(sal) = self.rules.development_salary {
                        npc.current_salary = sal;
                        npc.contract_years = 1;   // 단년 — 한 해 안에 증명해야 한다
                    }
                    npc.development_since = Some(year);
                }
            }
            None => {
                npc.career_events.push(NpcCareerEvent {
                    year,
                    event_type: QUIT_EVENT.into(),
                    from_team_id: from_team,
                    to_team_id: None,
                    from_league_id: None,
                    to_league_id: None,
                    detail: Some(format!("{reason} → 야구를 그만둔다")),
                });
                npc.career_status = "retired".into();
                npc.current_league = "LEAGUE_RETIRED".into();
                npc.current_team = String::new();
                npc.grade = None;
                npc.current_salary = 0;
                npc.contract_years = 0;
            }
        }
    }
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
        select_candidates(SelectCandidatesParams {
            npcs, rules: rules(), university_grade_max: 4, highschool_grade_max: 3,
        })
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
    fn 미지명자는_정해진_햇수까지만_다시_신청한다() {
        // ⚠ 예전엔 `age_max`(29)까지 열려 있어 **29세가 "고졸"로 드래프트에
        // 나왔다.** 첫 드래프트 나이(고졸 19 · 대졸 23)에서 `reentry_max_years`
        // 만큼만 재도전한다.
        let max = rules().reentry_max_years;
        assert_eq!(max, 2, "픽스처가 바뀌면 아래 나이도 같이 봐야 한다");

        for age in 19..=21 {
            let n = with_last_league(npc("HS", DRAFT_POOL_LEAGUE, None, 65.0, age), "LEAGUE_HIGHSCHOOL");
            assert_eq!(select(vec![n]).candidates.len(), 1, "고졸 {age}세는 후보여야 한다");
        }
        for age in 22..=29 {
            let n = with_last_league(npc("HS", DRAFT_POOL_LEAGUE, None, 65.0, age), "LEAGUE_HIGHSCHOOL");
            assert_eq!(select(vec![n]).candidates.len(), 0, "고졸 {age}세는 기한이 지났다");
        }
        for age in 23..=25 {
            let n = with_last_league(npc("UV", DRAFT_POOL_LEAGUE, None, 65.0, age), "LEAGUE_UNIVERSITY");
            assert_eq!(select(vec![n]).candidates.len(), 1, "대졸 {age}세는 후보여야 한다");
        }
        for age in 26..=29 {
            let n = with_last_league(npc("UV", DRAFT_POOL_LEAGUE, None, 65.0, age), "LEAGUE_UNIVERSITY");
            assert_eq!(select(vec![n]).candidates.len(), 0, "대졸 {age}세는 기한이 지났다");
        }
    }

    #[test]
    fn 외국인은_드래프트_후보가_아니다() {
        // ⚠ 퇴출된 용병이 독립리그로 흘러간 뒤 **드래프트로 KBL에 다시 지명**됐다.
        // 그 경로는 외국인 보유 한도(3명)를 안 봐서 팀당 6명까지 찼다(실측).
        //
        // 리그가 아니라 **국적**으로 거른다 — 그 시점 소속은 독립리그다.
        let mut fgn = npc("FGN", "LEAGUE_INDEPENDENT", None, 70.0, 26);
        fgn.nationality = Some("USA".into());
        assert_eq!(select(vec![fgn]).candidates.len(), 0, "외국인이 후보가 됐다");

        // 국적이 없으면 국내 선수다 — 기존 데이터가 전부 그렇다
        let dom = npc("DOM", "LEAGUE_INDEPENDENT", None, 70.0, 26);
        assert_eq!(select(vec![dom]).candidates.len(), 1);
    }

    #[test]
    fn 재학생은_재수_기한과_무관하다() {
        // 기한은 **소속이 없어진 사람**에게만 건다. 고3·대4는 나이가 어떻든 후보다
        let hs3 = npc("HS3", "LEAGUE_HIGHSCHOOL", Some(3), 65.0, 22);
        assert_eq!(select(vec![hs3]).candidates.len(), 1);
    }

    #[test]
    fn 후보는_중복되지_않는다() {
        // 한 사람이 졸업 경로와 얼리 경로에 동시에 들어가면 드래프트에 두 번 나온다
        let r = select(vec![
            npc("G3", "LEAGUE_HIGHSCHOOL", Some(3), 70.0, 19),
            npc("U4", "LEAGUE_UNIVERSITY", Some(4), 70.0, 23),
            npc("U2", "LEAGUE_UNIVERSITY", Some(2), 90.0, 21),
            npc("IN", "LEAGUE_INDEPENDENT", None, 90.0, 24),
        ]);
        let ids: std::collections::HashSet<&str> =
            r.candidates.iter().map(|c| c.npc_id.as_str()).collect();
        assert_eq!(ids.len(), r.candidates.len(), "같은 선수가 두 번 들어갔다");
        assert_eq!(r.candidates.len(), 4);
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
    fn 고교는_졸업반만_후보다() {
        // 드래프트는 졸업 전(11월)이라 고3(19세)이 후보다.
        // 저학년은 나이가 아니라 **학년**이 막는다 — 고2도 19세일 수 있다
        let g3 = npc("G3", "LEAGUE_HIGHSCHOOL", Some(3), 70.0, 19);
        let g2 = npc("G2", "LEAGUE_HIGHSCHOOL", Some(2), 90.0, 19);
        let r = select(vec![g3, g2]);
        assert_eq!(r.candidates.len(), 1, "고2가 후보에 섞였다");
        assert_eq!(r.candidates[0].npc_id, "G3");
    }

    #[test]
    fn 대학_졸업반은_졸업_경로로_후보가_된다() {
        // 드래프트가 졸업 전이므로 대4는 재학 상태로 후보에 든다
        let r = select(vec![npc("A", "LEAGUE_UNIVERSITY", Some(4), 60.0, 23)]);
        assert_eq!(r.counts[DraftRoute::UniversityGraduate as usize], 1);
    }

    #[test]
    fn 라운드_수가_규칙에서_온다() {
        assert!(rules().rounds > 0);
    }

    fn contract() -> DraftContractRules {
        rules().contract.expect("draftRules.contract 없음")
    }

    #[test]
    fn 신인_연봉이_최저연봉_아래로_안_내려간다() {
        // 예전 TS 표는 하위 지명이 1,500만원이라 KBL 최저연봉 3,000만원 미달이었다
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).unwrap();
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        let min_salary = v["salaryRules"]["minSalary"]["LEAGUE_KBL"].as_i64()
            .expect("minSalary.LEAGUE_KBL 없음");

        let c = contract();
        for pick in [1, 5, 30, 80, 110] {
            let (salary, _, _) = c.for_pick(pick, 1.0);
            assert!(salary >= min_salary, "{pick}순위 연봉 {salary} < 최저 {min_salary}");
        }
    }

    #[test]
    fn 신인_연봉은_균일하고_차등은_계약금이_진다() {
        // KBO 신인 규정이 그렇다. 연봉으로 차등을 주면 규정 위반이 된다
        let c = contract();
        let (s1, b1, _) = c.for_pick(1, 1.0);
        let (s_last, b_last, _) = c.for_pick(110, 1.0);
        assert_eq!(s1, s_last, "신인 연봉은 순번과 무관해야 한다");
        assert!(b1 > b_last * 5, "계약금이 순번을 반영해야 한다: {b1} vs {b_last}");
    }

    #[test]
    fn 계약금이_순번을_따라_단조감소한다() {
        let c = contract();
        let mut prev = i64::MAX;
        for pick in 1..=120 {
            let (_, bonus, _) = c.for_pick(pick, 1.0);
            assert!(bonus <= prev, "{pick}순위에서 계약금이 다시 올랐다: {prev} → {bonus}");
            prev = bonus;
        }
    }

    #[test]
    fn 팀_예산이_계약금만_움직인다() {
        let c = contract();
        let (rich_s, rich_b, _) = c.for_pick(1, 5.0);   // clamp 위로
        let (poor_s, poor_b, _) = c.for_pick(1, 0.1);   // clamp 아래로
        assert_eq!(rich_s, poor_s, "연봉은 팀 사정을 안 탄다");
        assert!(rich_b > poor_b, "계약금은 팀 예산을 반영한다");
    }

    #[test]
    fn 특급_신인만_1군에서_시작한다() {
        let r = rules();
        assert!(r.first_team_rounds >= 0);
        // 전 라운드가 1군 직행이면 정원이 매년 110명씩 밀려 리그가 무너진다
        assert!(r.first_team_rounds < r.rounds,
            "1군 직행 {}라운드가 전체 {}라운드와 같으면 전원 직행이다",
            r.first_team_rounds, r.rounds);
    }

    // ── 진로 배정 ────────────────────────────────────────────

    fn placement() -> PlacementRules {
        PlacementRules {
            university_max: 40, independent_max: 45, independent_age_max: 31,
            university_annual_max: None,   // 연간 상한 없음 = 기존 동작
            farm_max: 0,                   // 2군을 목적지로 안 씀 = 기존 동작
            development_salary: None,
        }
    }

    #[test]
    fn 이군으로_간_사람은_육성선수다() {
        // ⚠ 이 경로는 **배선이 빠져 한 번도 안 돌았다.** `farm_max`는 34로
        // 계산되고 Rust 갈래도 있었는데, TS가 `farmTeamIds`를 안 넘겨서
        // 팀 목록이 빈 배열이었다 — 상한 34가 쓰인 적이 없다.
        let farm = vec!["TEAM_KBL_A_2".to_string()];
        let mut p = Placer::new(&[], &[], &[], &farm, PlacementRules {
            farm_max: 34, development_salary: Some(2000), ..placement()
        });

        // 대졸 미지명자 — 대학은 못 가고 2군으로 간다
        let mut n = npc("U", "LEAGUE_UNIVERSITY", Some(4), 58.0, 22);
        p.place(&mut n, 2026, "draft_undrafted", "미지명", false);

        assert_eq!(n.current_league, "LEAGUE_KBL_FARM");
        assert_eq!(n.development_since, Some(2026), "육성선수 신분이 안 붙었다");
        // 최저연봉(3000)보다 낮아야 한다 — 같으면 하위 라운드 지명이 무의미해진다
        assert_eq!(n.current_salary, 2000);
        assert_eq!(n.contract_years, 1, "육성선수는 단년이다");
    }

    #[test]
    fn 대학과_독립으로_간_사람은_육성선수가_아니다() {
        // 신분은 **소속이 아니라 계약**이다. 2군이 아닌 곳으로 갔으면
        // `development_since`가 붙으면 안 된다
        let univ = vec!["TEAM_UNIV_A".to_string()];
        let indie = vec!["TEAM_IND_A".to_string()];
        let farm = vec!["TEAM_KBL_A_2".to_string()];
        let mut p = Placer::new(&[], &univ, &indie, &farm, PlacementRules {
            farm_max: 34, development_salary: Some(2000), ..placement()
        });

        let mut hs = npc("HS", DRAFT_POOL_LEAGUE, None, 60.0, 20);
        p.place(&mut hs, 2026, "draft_undrafted", "미지명", true);
        assert_eq!(hs.current_league, "LEAGUE_UNIVERSITY");
        assert_eq!(hs.development_since, None);
        assert_eq!(hs.current_salary, 0);
    }

    #[test]
    fn 대학은_고교_졸업자만_간다() {
        // 예전엔 경로를 안 봐서 대졸 미지명자가 대학 1학년으로 다시 입학했다
        let univ = vec!["TEAM_UNIV_A".to_string()];
        let indie = vec!["TEAM_IND_A".to_string()];
        let mut p = Placer::new(&[], &univ, &indie, &[], placement());

        let mut hs = npc("HS", DRAFT_POOL_LEAGUE, None, 60.0, 20);
        p.place(&mut hs, 2026, "draft_undrafted", "미지명", true);
        assert_eq!(hs.current_league, "LEAGUE_UNIVERSITY");
        assert_eq!(hs.grade, Some(1));

        let mut uv = npc("UV", DRAFT_POOL_LEAGUE, None, 60.0, 24);
        p.place(&mut uv, 2026, "draft_undrafted", "미지명", false);
        assert_eq!(uv.current_league, "LEAGUE_INDEPENDENT", "대졸은 대학 재입학 불가");
        assert_eq!(uv.grade, None);
    }


    /// 포수 지원자를 **포수 없는 팀으로** 보낸다.
    ///
    /// ⚠ 예전엔 `find_slot`이 투수/야수 비율만 봤다. 야수 자리가 남으면
    /// 포수든 외야수든 그냥 넣었고, **대학은 승강도 육성선수도 없어서**
    /// 한 번 생긴 포수 공백이 안 메워진다(실측 대학 1팀이 포수 0명으로
    /// 시즌을 났다). 이 프로젝트에서 반복된 "몇 명은 맞고 어느 자리가
    /// 틀렸다"의 그 형태다.
    #[test]
    fn 포수는_포수_없는_팀으로_간다() {
        let univ = vec!["TEAM_UNIV_HASC".to_string(), "TEAM_UNIV_NONE".to_string()];
        // HASC엔 포수가 있고 NONE엔 없다. **자리는 HASC가 더 많이 남게** 둔다 —
        // 자리 수만 보면 HASC로 가므로, 이 검사가 자리 공백 우선을 실제로 본다
        let mut existing = vec![];
        existing.push({ let mut n = npc("C1", "LEAGUE_UNIVERSITY", Some(2), 60.0, 20);
                        n.player_type = "batter".into(); n.position = "C".into();
                        n.current_team = "TEAM_UNIV_HASC".into(); n });
        for i in 0..12 {
            let mut n = npc(&format!("F{i}"), "LEAGUE_UNIVERSITY", Some(2), 60.0, 20);
            n.player_type = "batter".into(); n.position = "1B".into();
            n.current_team = "TEAM_UNIV_NONE".into();
            existing.push(n);
        }

        let mut p = Placer::new(&existing, &univ, &[], &[], placement());
        let mut c = npc("NEWC", DRAFT_POOL_LEAGUE, None, 60.0, 19);
        c.player_type = "batter".into();
        c.position = "C".into();
        p.place(&mut c, 2026, "draft_undrafted", "미지명", true);

        assert_eq!(c.current_team, "TEAM_UNIV_NONE",
            "포수가 이미 포수 있는 팀으로 갔다: {}", c.current_team);
    }

    /// 자리 공백 우선이 **보직 균형을 깨지 않는다.**
    ///
    /// 0단계가 비율 검사를 건너뛰므로, 포수만 우대하다 투수/야수 비율이
    /// 무너지면 이번엔 등판이 안 돈다 — 이 세션에서 한쪽 하한을 걸면
    /// 반대쪽이 밀리는 걸 여섯 번 겪었다.
    #[test]
    fn 포수_우선이_보직_균형을_깨지_않는다() {
        let univ = vec!["TEAM_UNIV_A".to_string()];
        let mut p = Placer::new(&[], &univ, &[], &[], placement());
        // 포수가 아닌 야수는 0단계를 안 탄다 — 비율 검사를 정상적으로 받는다
        let mut b = npc("B1", DRAFT_POOL_LEAGUE, None, 60.0, 19);
        b.player_type = "batter".into();
        b.position = "1B".into();
        p.place(&mut b, 2026, "draft_undrafted", "미지명", true);
        assert_eq!(b.current_league, "LEAGUE_UNIVERSITY");

        // 투수도 마찬가지다
        let mut pi = npc("P1", DRAFT_POOL_LEAGUE, None, 60.0, 19);
        p.place(&mut pi, 2026, "draft_undrafted", "미지명", true);
        assert_eq!(pi.current_league, "LEAGUE_UNIVERSITY");
    }

    /// 포수가 **이미 다 있으면** 평소대로 배정한다 (0단계가 비어도 안 막힌다)
    #[test]
    fn 포수가_다_있으면_평소대로_배정한다() {
        let univ = vec!["TEAM_UNIV_A".to_string()];
        let mut existing = vec![];
        let mut n = npc("C1", "LEAGUE_UNIVERSITY", Some(2), 60.0, 20);
        n.player_type = "batter".into(); n.position = "C".into();
        n.current_team = "TEAM_UNIV_A".into();
        existing.push(n);

        let mut p = Placer::new(&existing, &univ, &[], &[], placement());
        let mut c = npc("NEWC", DRAFT_POOL_LEAGUE, None, 60.0, 19);
        c.player_type = "batter".into();
        c.position = "C".into();
        p.place(&mut c, 2026, "draft_undrafted", "미지명", true);
        assert_eq!(c.current_team, "TEAM_UNIV_A",
            "0단계가 비었다고 배정 자체가 막히면 안 된다");
    }

    #[test]
    fn 나이가_지나면_독립리그도_안_받는다() {
        let indie = vec!["TEAM_IND_A".to_string()];
        let mut p = Placer::new(&[], &[], &indie, &[], placement());
        let mut old = npc("OLD", "LEAGUE_KBL", None, 60.0, placement().independent_age_max + 1);
        p.place(&mut old, 2026, "release", "방출", false);
        assert_eq!(old.career_status, "retired");
        assert_eq!(old.career_events.last().unwrap().event_type, QUIT_EVENT);
    }

    #[test]
    fn 자리가_없으면_야구를_그만둔다() {
        // 목적지 목록이 비면 갈 곳이 없다
        let mut p = Placer::new(&[], &[], &[], &[], placement());
        let mut n = npc("A", DRAFT_POOL_LEAGUE, None, 60.0, 20);
        p.place(&mut n, 2026, "draft_undrafted", "미지명", true);
        assert_eq!(n.career_status, "retired");
        assert_eq!(n.current_league, "LEAGUE_RETIRED");
        assert!(n.current_team.is_empty());
        assert_eq!(n.career_events.last().unwrap().event_type, QUIT_EVENT,
            "그만둔 사람은 QUIT_EVENT로 표시돼야 저장 슬림화가 구분할 수 있다");
    }

    #[test]
    fn 정원이_차면_다음_사람은_다른_리그로_간다() {
        let univ = vec!["TEAM_UNIV_A".to_string()];
        let indie = vec!["TEAM_IND_A".to_string()];
        let rules = PlacementRules {
            university_max: 1, independent_max: 1, independent_age_max: 31,
            university_annual_max: None, farm_max: 0, development_salary: None,
        };
        let mut p = Placer::new(&[], &univ, &indie, &[], rules);

        let mut a = npc("A", DRAFT_POOL_LEAGUE, None, 60.0, 20);
        let mut b = npc("B", DRAFT_POOL_LEAGUE, None, 60.0, 20);
        let mut c = npc("C", DRAFT_POOL_LEAGUE, None, 60.0, 20);
        p.place(&mut a, 2026, "draft_undrafted", "미지명", true);
        p.place(&mut b, 2026, "draft_undrafted", "미지명", true);
        p.place(&mut c, 2026, "draft_undrafted", "미지명", true);

        assert_eq!(a.current_league, "LEAGUE_UNIVERSITY");
        assert_eq!(b.current_league, "LEAGUE_INDEPENDENT");
        assert_eq!(c.career_status, "retired");
    }

    #[test]
    fn 배정되면_계약이_초기화된다() {
        // 프로에서 방출된 선수가 옛 연봉을 들고 독립리그로 가면 안 된다
        let indie = vec!["TEAM_IND_A".to_string()];
        let mut p = Placer::new(&[], &[], &indie, &[], placement());
        let mut n = npc("A", "LEAGUE_KBL", None, 60.0, 26);
        n.current_salary = 50_000;
        n.contract_years = 3;
        p.place(&mut n, 2026, "release", "방출", false);
        assert_eq!(n.current_league, "LEAGUE_INDEPENDENT");
        assert_eq!(n.current_salary, 0);
        assert_eq!(n.contract_years, 0);
    }
}
