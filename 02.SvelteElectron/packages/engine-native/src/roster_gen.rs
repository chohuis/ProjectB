// ── R3a-2: Lazy 리그 로스터 생성 (DESIGN.md §8.3) ────────────────────────────
// 원칙:
//  - worldSeed 결정적: 같은 시드 = 같은 로스터 (팀별 독립 시드 — 팀 추가가 다른 팀에 영향 없음)
//  - 출력 shape = slotdb.cjs npc INSERT 입력과 동일 (TS 접착 코드 최소화)
//  - 포지션 커버리지 보장: 야수 8포지션 각 1명 이상, SP 최소 3명
//  - personality는 생성 시점 확정 (호출 시점 해시 폴백 금지 — R1 부채 #8)

use serde::{Deserialize, Serialize};
use crate::npc_sim::{
    LcgRand, gen_name, make_pitching, make_batting, estimate_salary_and_contract,
    POSITIONS, SURNAMES, SYLLABLES_A, SYLLABLES_B,
};
use crate::sim_types::{NpcPitchingAttrs, NpcBattingAttrs};

// ── 입력 ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSpec {
    pub team_id: String,
    #[serde(default)]
    pub school_id: String,
    /// 팀 예산 / 리그 평균 예산. TS가 refs에서 계산해 넘긴다 (없으면 1.0 = 평균팀).
    /// 부유한 팀이 더 주는 걸 연봉에 반영하는 유일한 입력이다
    #[serde(default)]
    pub salary_index: Option<f64>,
    /// 팀 전력★ 1~5 (refs.teams[].power). 없으면 pivot(=평범한 팀)으로 본다.
    /// 이게 없어서 **명문교와 약팀의 로스터가 똑같았다** (고교 상관계수 −0.05)
    #[serde(default)]
    pub power: Option<f64>,
    /// 팀 연간 예산(만원) — **인원을 여기에 맞춘다** (사용자 확정 2026-08-31).
    ///
    /// 🔴 예전엔 전 팀이 똑같이 `rosterSize` 명이었다. 예산은 `salary_index`
    ///   로 **연봉에만** 갔고 인원엔 안 갔다 — 예산 2.6억인 팀이 총연봉
    ///   4.25억(예산의 163%)을 안고 시작했다.
    /// ⚠ 없으면 예전과 같다 — `roster_size` 그대로.
    /// ⚠ `roster_min` 아래로는 안 내린다. 경기는 치러야 한다.
    #[serde(default)]
    pub budget: Option<i64>,
    /// 예산의 몇 %를 **선수 연봉에** 쓰나 (0.5~1.0). 나머지는 FA·트레이드·
    /// 드래프트에 남긴다 — **다 쓰는 팀과 아껴 두는 팀이 있어야 한다**
    /// (사용자 확정 2026-08-31). 없으면 1.0(다 쓴다).
    #[serde(default)]
    pub spend_ratio: Option<f64>,
    /// 같은 돈을 **인원 많이**(0) 쓰나 **선수 좋게**(1) 쓰나. 없으면 0.5.
    ///
    /// 🔴 이게 없으면 색깔이 안 난다 — 실측에서 평균 OVR 62 이하면
    ///   원주(2.6억)를 뺀 전 팀이 상한 45로 붙어 **다시 균일해진다.**
    #[serde(default)]
    pub quality_bias: Option<f64>,
}

fn default_pitcher_ratio() -> f64 { 0.45 }

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterRules {
    pub roster_size: i32,
    /// 정원 하한 — **예산이 인원을 줄여도 여기 아래로는 안 내린다.**
    ///
    /// ⚠ 규칙 파일에 있는데 **구조체가 안 받고 있었다** — 지금까지는
    ///   쓰는 데가 없어서 드러나지 않았다(`serde` 가 조용히 무시한다).
    /// ⚠ 없으면 타순 9명이 하한이다 — 경기를 못 치르면 그건 로스터가 아니다.
    #[serde(default)]
    pub roster_min: Option<i32>,
    /// 정원 상한 — **부유한 팀은 기준보다 많이 데린다.**
    /// ⚠ 규칙 파일에 있는데 구조체가 안 받고 있었다(`roster_min` 과 같다).
    #[serde(default)]
    pub roster_max: Option<i32>,
    pub pitching_ovr_min: f64,
    pub pitching_ovr_max: f64,
    pub batting_ovr_min: f64,
    pub batting_ovr_max: f64,
    pub dev_rate_min: f64,
    pub dev_rate_max: f64,
    /// 학년제(고교 1~3, 대학 1~4). 0이면 무학년(프로/독립)
    #[serde(default)]
    pub grade_max: i32,
    /// 학년제: age = age_base + grade / 무학년: age_min..=age_max 균등
    #[serde(default)]
    pub age_base: i32,
    #[serde(default)]
    pub age_min: i32,
    #[serde(default)]
    pub age_max: i32,
    #[serde(default = "default_pitcher_ratio")]
    pub pitcher_ratio: f64,
    /// 프로 리그: 연봉/계약 생성
    #[serde(default)]
    pub with_contract: bool,
    /// 기본 국적 (KBL/고교/대학/독립=KOR, ABL=USA, JBL=JPN)
    #[serde(default)]
    pub nationality: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamePool {
    pub surnames: Vec<String>,
    pub given_a: Vec<String>,
    pub given_b: Vec<String>,
    /// true면 서양식 "Given Sur" 형식
    #[serde(default)]
    pub western: bool,
    /// 성과 이름 사이 구분자. **일본식은 성-이름 순에 띄어쓰기가 붙는다**
    /// (사토 하루토). 한국식은 빈 문자열이라 붙여 쓴다(김우찬).
    ///
    /// ⚠ 이게 없어서 일본 리그를 만들 방법이 없었다 — `western: true`는
    /// 이름-성 순이라 순서가 뒤집히고, `false`는 "사토하루토"가 된다.
    #[serde(default)]
    pub sep: String,
    /// 짝 표기 — **인덱스가 위 배열과 1:1이어야 한다.**
    ///
    /// 원본이 한글인 풀(일본)은 `*_en`을, 원본이 영문인 풀(서양)은 `*_ko`를
    /// 채운다. 비어 있으면 그 방향 표기가 없다는 뜻이고, 그때는 원본을 그대로
    /// 쓴다 — **영어 화면에 한글이 남는 것보다 낫다고 보지 않지만, 없는 값을
    /// 지어내는 것보다는 낫다.** 검사가 빈 짝을 잡는다.
    #[serde(default)] pub surnames_en: Vec<String>,
    #[serde(default)] pub given_a_en: Vec<String>,
    #[serde(default)] pub surnames_ko: Vec<String>,
    #[serde(default)] pub given_a_ko: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLeagueRosterParams {
    pub league_id: String,
    pub season_year: i32,
    pub world_seed: u32,
    pub teams: Vec<TeamSpec>,
    pub rules: RosterRules,
    #[serde(default)]
    pub name_pool: Option<NamePool>,
    /// npcId 접두 (기본: 리그 코드 자동)
    #[serde(default)]
    pub id_prefix: Option<String>,
    /// 연봉 규칙 (generation_rules.json salaryRules). 없으면 폴백
    #[serde(default)]
    pub salary_rules: Option<crate::npc_sim::SalaryRules>,
    /// 전력★ → OVR 보정 규칙 (generation_rules.json powerRules). 없으면 보정 없음
    #[serde(default)]
    pub power_rules: Option<PowerRules>,
    /// 입단 경로 규칙 (generation_rules.json careerHistoryRules.entry).
    /// 연차를 여기서 역산한다 — 무작위로 뽑으면 출신 분포가 뒤집힌다
    #[serde(default)]
    pub entry_rules: Option<crate::career_history::EntryRules>,
    /// 외국인 선수 슬롯 (generation_rules.json foreignRules). None이면 전원 내국인
    #[serde(default)]
    pub foreign: Option<ForeignSlots>,
    /// 재능 분포 (generation_rules.json talentRules). 신입생 생성과 **같은 정본**을 쓴다 —
    /// 여기만 분산이 있고 신입생은 고정값이면 창단 세대만 에이스가 된다
    #[serde(default)]
    pub talent: Option<crate::sim_types::TalentRulesPayload>,
    /// 새 게임 시점의 **병역 이력** (generation_rules.json `militaryRules.pastService`).
    /// 없으면 예전 동작 — 한국인은 전원 미필이다 (B-29 D-5)
    #[serde(default)]
    pub past_service: Option<PastServiceRules>,
}

/// 새 게임 NPC 의 병역을 나이로 채운다 (B-29 D-5 · 사용자 확정 ④).
///
/// 🔴 예전엔 **한국인 전원이 미필**이었다 — 37세 KBL 베테랑도 그랬다.
/// 입대 게이트(상무 20~29 · 일반병 28/26 · 조기 25~27)에 30대는 어느 문에도
/// 안 걸리니 **영원히 미필로 남는다.**
///
/// ⚠ **과거 성적에 복무 공백은 안 만든다**(사용자 확정 · 1.0.1 뒤). 여기서
/// 채우는 건 상태뿐이다.
/// ⚠ 값의 정본은 규칙 파일이다 — 코드에 나이·비율을 안 박는다.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PastServiceRules {
    /// 이 나이 미만은 전원 미필
    pub undecided_below: i32,
    /// 이 나이 이상은 전원 군필
    pub served_from: i32,
    /// 그 사이 나이의 군필 비율 (%). 씨앗 난수로 가른다
    pub served_pct: f64,
    /// 군필 중 상무(체육부대) 출신 비율 (%). 나머지는 현역이다
    #[serde(default)]
    pub sports_pct: f64,
}

/// 다녀온 부대 — 세이브의 `military.servedUnit` 과 **같은 자리**다.
///
/// ⚠ 복무 **중**(`unit`)이 아니다. 새 게임의 프로 선수는 이미 전역한
/// 사람들이라 다녀온 자리만 채운다.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenMilitary {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub served_unit: Option<String>,
}

/// 나이로 병역을 정한다. 한국인이 아니면 「면제」다(예전과 같다).
///
/// ⚠ **씨앗 난수다.** 같은 세계를 다시 열면 같은 사람이 같은 상태여야 한다 —
/// `npc_id` 를 섞어 선수마다 독립 스트림을 만든다.
fn past_service_of(
    rules: Option<&PastServiceRules>, npc_id: &str, age: i32, is_korean: bool,
) -> (String, Option<GenMilitary>) {
    if !is_korean { return ("면제".into(), None); }
    let Some(r) = rules else { return ("미필".into(), None); };
    if age < r.undecided_below { return ("미필".into(), None); }

    let mut rng = LcgRand::new(hash_str(npc_id) ^ 0x4D49_4C54);
    if age < r.served_from && rng.next() * 100.0 >= r.served_pct {
        return ("미필".into(), None);
    }
    let unit = if rng.next() * 100.0 < r.sports_pct { "sports" } else { "general" };
    ("군필".into(), Some(GenMilitary { served_unit: Some(unit.into()) }))
}

/// 외국인 선수 규칙 — **KBL은 진행 중인 리그라 시작 시점에 이미 있어야 한다.**
///
/// ⚠ `ovr_min`~`ovr_max` 폭이 넓은 건 의도다(사용자 확정) — 대박/쪽박 편차.
/// 팀당 `per_team`명이 각자 독립 추첨이라 어떤 팀은 에이스를, 어떤 팀은
/// 실패작을 데려온다. 그게 초기 전력 차가 된다.
///
/// ⚠ **1군에만 넣는다.** 2군에 두면 보유 한도 계산이 흐려지고, 실제 KBO도
/// 외국인은 1군 등록이 원칙이다.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignSlots {
    pub per_team: usize,
    /// 그중 투수 수 (KBO는 출전 3명 중 투수 최대 2명)
    pub max_pitchers: usize,
    pub ovr_min: f64,
    pub ovr_max: f64,
    pub nationality: String,
    pub dev_rate_min: f64,
    pub dev_rate_max: f64,
    pub age_min: i32,
    pub age_max: i32,
    /// 서양식 이름 풀. 없으면 내장 풀(한국식)이라 이름이 어색해진다
    #[serde(default)]
    pub name_pool: Option<NamePool>,
}

/// 팀 전력★이 로스터 수준을 정한다.
///
/// 예전엔 전력★이 로스터에 전혀 안 닿았다 — ★5 명문교와 ★1 약팀의 선수가
/// 같은 분포였고, 그래서 전국대회 우승팀이 매년 무작위로 바뀌었다.
/// 스태프 생성은 이미 같은 축을 쓴다 (`staff_rules.toml [power_bonus]`).
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PowerRules {
    /// 보정 0이 되는 기준 전력 (보통 3)
    pub pivot: f64,
    /// 전력 한 단계당 OVR 이동폭
    pub ovr_shift_per_star: f64,
}

// ── 출력 (slotdb npc INSERT shape) ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenAbilities {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitching: Option<NpcPitchingAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting: Option<NpcBattingAttrs>,
    /// 투수만. 야수는 빈 배열이 아니라 아예 없다
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitches: Option<Vec<crate::sim_types::NpcPitchEntry>>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenPersonality {
    pub loyalty: f64,
    pub ambition: f64,
    pub greed: f64,
    pub competitive_drive: f64,
    pub stability_preference: f64,
    pub professionalism: f64,
    pub overseas_ambition: f64,
    pub market_preference: f64,
    pub home_team_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenNpc {
    pub npc_id: String,
    pub name: String,
    pub name_en: String,
    pub is_named: bool,
    pub player_type: String,
    pub position: String,
    pub handedness: String,
    pub jersey_number: i32,
    pub age: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grade: Option<i32>,
    pub school_id: String,
    pub graduation_year: i32,
    pub nationality: String,
    pub career_status: String,
    pub current_league: String,
    pub current_team: String,
    pub salary: i64,
    pub contract_years: i32,
    pub pro_service_years: i32,
    pub military_status: String,
    /// 다녀온 부대 (B-29 D-5). 미필·면제면 아예 안 실린다
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military: Option<GenMilitary>,
    pub development_rate: i32,
    pub potential_hidden: i32,
    pub abilities: GenAbilities,
    pub personality: GenPersonality,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateLeagueRosterResult {
    pub npcs: Vec<GenNpc>,
}

// ── 내부 헬퍼 ────────────────────────────────────────────────────────────────

fn hash_str(s: &str) -> u32 {
    s.bytes().fold(0u32, |acc, b| acc.wrapping_mul(131).wrapping_add(b as u32))
}

fn league_code(league_id: &str) -> &'static str {
    match league_id {
        "LEAGUE_HIGHSCHOOL"  => "HS",
        "LEAGUE_UNIVERSITY"  => "UV",
        "LEAGUE_INDEPENDENT" => "IN",
        "LEAGUE_KBL"         => "KB",
        "LEAGUE_KBL_FARM"    => "KF",
        "LEAGUE_ABL"         => "AB",
        "LEAGUE_ABL_FARM"    => "AF",
        "LEAGUE_JBL"         => "JB",
        "LEAGUE_JBL_FARM"    => "JF",
        _                    => "XX",
    }
}

/// npcId에 넣을 팀 식별자.
///
/// 예전엔 `hash_str(team_id) % 10000`이었다. 4자리(1만 버킷)에 182팀을 넣으면
/// 생일 문제로 충돌이 사실상 확실하고, 실제로 `TEAM_UNIV_NAMGANG`과
/// `TEAM_UNIV_SEORAK`이 같은 5898로 접혀 **ID가 통째로 겹쳤다**
/// (`UNIQUE constraint failed: npc.npc_id`).
///
/// 스태프는 처음부터 `staff:{team_id}_MGR`로 팀 ID를 그대로 썼다 — 같은 방식으로
/// 맞춘다. 팀 ID가 유일하므로 **구조적으로** 충돌이 불가능해진다.
fn team_tag(team_id: &str) -> &str {
    team_id.strip_prefix("TEAM_").unwrap_or(team_id)
}

// ── 구종 생성 (Phase 6.5) ────────────────────────────────────────────────────
//
// 예전엔 생성물에 구종이 아예 없었다. 프로 투수가 패스트볼도 없이 시작했고,
// 주간 성장(`decide_pitch_training`)이 매년 0에서부터 구종을 채워 넣었다.
// 경기 결과에는 영향이 없지만(SimPitcher가 구종을 안 본다) 화면과 성장에 쓰인다.
//
// 목표 구종 수는 성장 로직과 **같은 규칙**을 쓴다 — 생성이 목표보다 많이 주면
// 성장 로직이 할 일이 없고, 적게 주면 신인이 매년 새 구종만 배운다.

/// 성장 로직 `npc_pitch_target`과 같은 값이어야 한다 (npc_sim.rs)
fn pitch_target(position: &str, velocity: f64) -> usize {
    match position {
        "SP" => if velocity >= 70.0 { 4 } else { 5 },
        "CP" => if velocity >= 70.0 { 2 } else if velocity >= 60.0 { 3 } else { 4 },
        _    => if velocity >= 65.0 { 3 } else { 4 },
    }
}

/// 구종 카탈로그 — `training/pitch_catalog.json`과 같은 ID여야 한다.
/// (그 파일은 콘텐츠라 Rust가 읽지 않는다. 어긋나면 화면이 이름을 못 찾는다 —
///  `npm run test:rostergen`이 두 목록을 대조한다)
const PITCH_FASTBALL: &str = "PITCH_FASTBALL";
const PITCH_BREAKING: [&str; 4] = ["PITCH_SLIDER", "PITCH_CURVE", "PITCH_CUTTER", "PITCH_SINKER"];
const PITCH_OFFSPEED: [&str; 4] = ["PITCH_CHANGEUP", "PITCH_SPLITTER", "PITCH_FORKBALL", "PITCH_SCREWBALL"];
const PITCH_SPECIAL:  &str = "PITCH_KNUCKLEBALL";

/// 투수 한 명의 구종 세트.
///
/// - **패스트볼은 항상 있다.** 그게 없는 투수는 없다
/// - 보유 수는 목표치에 성숙도(나이·OVR)를 곱한다 — 신인은 덜 갖추고 시작한다
/// - 변화구·오프스피드를 섞는다. 한 계열만 갖는 투수가 나오지 않게
/// - 너클볼은 특수구다. 낮은 확률로만, 그리고 **주무기로만** 준다
/// 나이를 **27세 근처가 가장 두꺼운 피라미드**로 뽑는다 (삼각분포).
///
/// 🔴 **예전엔 균등이었다.** `age_min..=age_max`가 20~37이라 30세 이상이
///   **47%**가 되고, 연차는 `age - entry_age`로 역산하므로 **7년차 이상이
///   44%**인 역피라미드가 나왔다(실측 2026-08-26 · KBL 1군 300명 · 3회).
///   그래서 첫 시즌에 베테랑이 53% → 18%로 주저앉는 것처럼 보였다 —
///   실제로는 **시뮬 쪽 18%가 자연스럽고 생성이 노인 리그를 만들고 있었다.**
///
/// 최빈값은 구간의 **41% 지점**이다. KBL(20~37)에서 27세가 나오는 값이고
/// (사용자 확정 2026-08-26), 구간이 다른 리그도 같은 비율로 따라간다 —
/// 독립(20~31)은 24.5세, ABL(21~38)은 28세다.
///
/// ⚠ **학년제 리그는 여기 안 온다.** 고교·대학은 `age_base + grade`다.
fn pick_age(min: i32, max: i32, rng: &mut LcgRand) -> i32 {
    let span = (max - min).max(0) as f64;
    if span <= 0.0 { return min; }
    const PEAK: f64 = 0.41;
    let u = rng.next();
    // 삼각분포 역함수 — 최빈값 왼쪽/오른쪽을 따로 푼다
    let t = if u < PEAK { (u * PEAK).sqrt() }
            else { 1.0 - ((1.0 - u) * (1.0 - PEAK)).sqrt() };
    min + (t * span).round() as i32
}

fn gen_pitches(
    position: &str,
    velocity: f64,
    ovr: f64,
    age: i32,
    rng: &mut LcgRand,
) -> Vec<crate::sim_types::NpcPitchEntry> {
    use crate::sim_types::NpcPitchEntry;

    let target = pitch_target(position, velocity);

    // 성숙도 0.5~1.0 — 20세 OVR50이 0.5, 28세 이상 OVR80+가 1.0
    let age_f = ((age - 19).max(0) as f64 / 9.0).min(1.0);
    let ovr_f = ((ovr - 45.0).max(0.0) / 35.0).min(1.0);
    let maturity = 0.5 + 0.5 * (age_f * 0.45 + ovr_f * 0.55);
    let count = ((target as f64 * maturity).round() as usize).clamp(1, target);

    let mut out: Vec<NpcPitchEntry> = Vec::new();

    // ① 패스트볼 — grade는 구속이 정한다
    let fb_grade = if velocity >= 75.0 { 5 } else if velocity >= 65.0 { 4 }
                   else if velocity >= 55.0 { 3 } else { 2 };
    out.push(NpcPitchEntry { id: PITCH_FASTBALL.to_string(), grade: fb_grade });
    if count == 1 { return out; }

    // ② 주무기 — OVR이 높을수록 잘 여문다. 너클볼은 여기서만 나온다
    let ace = ovr >= 72.0;
    let main_grade: u8 = if ovr >= 78.0 { 5 } else if ovr >= 66.0 { 4 } else { 3 };
    let knuckle = ace && rng.next() < 0.04;
    let main_id = if knuckle {
        PITCH_SPECIAL.to_string()
    } else if rng.next() < 0.55 {
        PITCH_BREAKING[(rng.next() * PITCH_BREAKING.len() as f64) as usize % PITCH_BREAKING.len()].to_string()
    } else {
        PITCH_OFFSPEED[(rng.next() * PITCH_OFFSPEED.len() as f64) as usize % PITCH_OFFSPEED.len()].to_string()
    };
    out.push(NpcPitchEntry { id: main_id.clone(), grade: main_grade });

    // ③ 나머지 — 주무기와 **다른 계열**을 우선해 한쪽으로 몰리지 않게 한다
    let main_is_breaking = PITCH_BREAKING.contains(&main_id.as_str());
    let mut pool: Vec<&str> = if main_is_breaking {
        PITCH_OFFSPEED.iter().chain(PITCH_BREAKING.iter()).copied().collect()
    } else {
        PITCH_BREAKING.iter().chain(PITCH_OFFSPEED.iter()).copied().collect()
    };
    pool.retain(|id| *id != main_id);

    while out.len() < count && !pool.is_empty() {
        let idx = (rng.next() * pool.len() as f64) as usize % pool.len();
        let id = pool.remove(idx);
        // 곁가지 구종은 주무기보다 여물지 않았다
        let g = (main_grade as i32 - 1 - (rng.next() * 2.0) as i32).clamp(1, 4) as u8;
        out.push(NpcPitchEntry { id: id.to_string(), grade: g });
    }
    out
}

fn pick<'a>(list: &'a [String], rng: &mut LcgRand) -> &'a str {
    &list[(rng.next() * list.len() as f64) as usize % list.len()]
}

/// 리그별 이름 풀로 이름을 만든다. `npc_sim::generate_freshmen`도 쓴다 —
/// **해외 리그 신인이 한국 이름으로 나오던 것**을 막으려면 같은 함수여야 한다
pub fn gen_name_from_pool(pool: &NamePool, rng: &mut LcgRand) -> (String, String) {
    gen_name_pooled(pool, rng)
}

/// (한글, 로마자). **인덱스로 뽑아 두 표기가 같은 사람을 가리키게 한다** —
/// 값을 따로 뽑으면 영어로 바꿨을 때 다른 사람이 된다.
///
/// 로마자는 **이름-성** 순으로 통일한다(`Takumi Yamaguchi` · `Shane Grant`).
/// 한글은 리그마다 다르다 — 한국은 붙여 쓰고(김우찬) 일본은 띄어 쓴다
/// (야마구치 다쿠미 · `sep`).
fn gen_name_pooled(pool: &NamePool, rng: &mut LcgRand) -> (String, String) {
    let i = idx(pool.surnames.len(), rng);
    let j = idx(pool.given_a.len(), rng);
    let k = if pool.given_b.is_empty() { 0 } else { idx(pool.given_b.len(), rng) };

    let at = |v: &Vec<String>, n: usize| v.get(n).cloned().unwrap_or_default();
    let sur = at(&pool.surnames, i);
    let a   = at(&pool.given_a, j);
    let b   = if pool.given_b.is_empty() { String::new() } else { at(&pool.given_b, k) };

    if pool.western {
        // 원본이 영문이다. 한글 짝이 없으면 영문을 그대로 쓴다
        let en = format!("{} {}", a, sur);
        let ko_sur = pool.surnames_ko.get(i).cloned().unwrap_or_else(|| sur.clone());
        let ko_a   = pool.given_a_ko.get(j).cloned().unwrap_or_else(|| a.clone());
        (format!("{} {}", ko_a, ko_sur), en)
    } else {
        // 원본이 한글이다. 구분자는 성 뒤에만 — 한국식 두 음절은 붙여 쓴다
        let ko = format!("{}{}{}{}", sur, pool.sep, a, b);
        let en_sur = pool.surnames_en.get(i).cloned().unwrap_or_else(|| sur.clone());
        let en_a   = pool.given_a_en.get(j).cloned().unwrap_or_else(|| a.clone());
        (ko, format!("{} {}", en_a, en_sur))
    }
}

fn idx(len: usize, rng: &mut LcgRand) -> usize {
    if len == 0 { return 0 }
    (rng.next() * len as f64) as usize % len
}

fn gen_name_builtin(rng: &mut LcgRand) -> (String, String) {
    let _ = (SURNAMES.len(), SYLLABLES_A.len(), SYLLABLES_B.len()); // npc_sim 풀 사용 명시
    gen_name(rng)
}

fn gen_personality(rng: &mut LcgRand) -> GenPersonality {
    let r = |rng: &mut LcgRand, min: f64, span: f64| (min + rng.next() * span).round();
    GenPersonality {
        loyalty:              r(rng, 40.0, 40.0),
        ambition:             r(rng, 30.0, 65.0),
        greed:                r(rng, 25.0, 55.0),
        competitive_drive:    r(rng, 40.0, 45.0),
        stability_preference: r(rng, 25.0, 60.0),
        professionalism:      r(rng, 50.0, 30.0),
        overseas_ambition:    r(rng, 5.0,  45.0),
        market_preference:    r(rng, 35.0, 45.0),
        home_team_id:         None,
    }
}

// ── 본체 ─────────────────────────────────────────────────────────────────────

pub fn generate_league_roster(p: GenerateLeagueRosterParams) -> GenerateLeagueRosterResult {
    let mut npcs: Vec<GenNpc> = Vec::new();
    let prefix = p.id_prefix.clone().unwrap_or_else(|| league_code(&p.league_id).to_string());
    let nationality = p.rules.nationality.clone().unwrap_or_else(|| "KOR".into());

    let salary_rules = p.salary_rules.clone().unwrap_or_default();
    let roster = p.rules.roster_size.max(1);
    // 🔴 **타순 9명을 구조적으로 보장한다.**
    //
    //    예전엔 `pitcher_ratio`만 곱해서 정원이 작으면 야수가 9명 아래로 떨어졌다.
    //    실측(2026-08-25 · 3회 반복): 고교 `rosterMin 18 × 0.55 = 야수 9.9명`이라
    //    반올림에서 **타순 미달이 5~6팀** 나왔다(`test:rosterbalance` FAIL).
    //
    //    ⚠ 정원(`roster_size`)을 올리는 건 밸런스 수치라 안 건드린다.
    //      **같은 인원 안에서** 야수 몫을 먼저 떼고 나머지를 투수에게 준다.
    //      정원이 9명도 안 되면 그건 여기서 못 고친다 — 그때는 전원 야수다.
    const BATTING_ORDER: i32 = 9;

    // 🔴 **예산 한 명분** — 팀 정원을 여기서 나눈다.
    //   생성 OVR 범위의 중앙값으로 잡는다. 정확한 평균은 만들어 봐야 알지만,
    //   그러면 난수 순서가 흔들려 같은 씨앗이 다른 로스터를 낸다.
    //   ⚠ 실측 평균 1,410만원 · 이 추정 1,318만원 — 7% 차이다.
    let per_head: f64 = {
        let mid = (p.rules.batting_ovr_min + p.rules.batting_ovr_max) as f64 / 2.0;
        let mult = salary_rules.league_mult.get(&p.league_id).copied().unwrap_or(1.0);
        let floor = salary_rules.min_salary.get(&p.league_id).copied().unwrap_or(0.0);
        (salary_rules.ovr_base * salary_rules.ovr_growth.powf(mid - salary_rules.ovr_pivot)
            * mult).max(floor).max(1.0)
    };
    // 정원 하한 — 예산이 아무리 적어도 경기는 치러야 한다
    let roster_min = p.rules.roster_min.unwrap_or(BATTING_ORDER).max(BATTING_ORDER);
    // 정원 상한 — 부유한 팀은 기준(`roster_size`)보다 많이 데릴 수 있다.
    // ⚠ 없으면 기준이 곧 상한이다(예전 동작).
    let roster_max = p.rules.roster_max.unwrap_or(roster).max(roster_min);

    for team in &p.teams {
        // 전력★ → OVR 이동폭. 규칙이 없으면 0 (구 동작)
        let power_shift = match (&p.power_rules, team.power) {
            (Some(pr), Some(pw)) => (pw - pr.pivot) * pr.ovr_shift_per_star,
            _ => 0.0,
        };

        // 🔴 **예산이 정원을 정한다.** 없으면 리그 정원 그대로(예전 동작).
        //   ⚠ 타순 9명 보장을 **팀 정원에서 다시** 계산한다 — 리그 공통값을
        //     쓰면 인원이 줄어든 팀에서 야수가 9명 아래로 떨어진다.
        // 🔴 **인원과 수준을 같이 정한다.** 예산이 총량이고, `quality_bias`
        //   가 그 총량을 인원 쪽으로 쓸지 수준 쪽으로 쓸지 가른다.
        //   ⚠ 수준을 올리면 1인 연봉이 **지수로** 뛴다(OVR 62 → 74 가 3배).
        //     그래서 질적 팀은 인원이 확 줄고, 그게 팀 색깔이 된다.
        let qbias = team.quality_bias.unwrap_or(0.5).clamp(0.0, 1.0);
        let spend = team.spend_ratio.unwrap_or(1.0).clamp(0.3, 1.0);
        // 수준 이동폭 — 리그 OVR 범위의 얼마를 쓸지.
        //
        // ⚠ 0.35 였을 때 KBL 평균 OVR 이 69.1~72.2(**3.1 차**)뿐이었다.
        //   예산이 120~350억으로 3배 차인데 그게 안 보였다. 0.60 이면
        //   폭이 ±7.8 이라 부유한 팀과 가난한 팀이 실제로 갈린다.
        // ⚠ 전 범위(1.0)를 쓰면 질적 팀이 리그 최고 대역만 뽑아 정원이
        //   한 자리가 된다 — 연봉이 지수라 그렇다.
        let ovr_span = (p.rules.batting_ovr_max - p.rules.batting_ovr_min) * 0.60;
        let team_ovr = (p.rules.batting_ovr_min + p.rules.batting_ovr_max) / 2.0
            + (qbias - 0.5) * ovr_span;
        let team_head_cost = {
            let mult = salary_rules.league_mult.get(&p.league_id).copied().unwrap_or(1.0);
            let floor = salary_rules.min_salary.get(&p.league_id).copied().unwrap_or(0.0);
            (salary_rules.ovr_base
                * salary_rules.ovr_growth.powf(team_ovr - salary_rules.ovr_pivot)
                * mult).max(floor).max(1.0)
        };
        let roster = match team.budget {
            Some(b) if b > 0 => (((b as f64 * spend) / team_head_cost).floor() as i32)
                .clamp(roster_min, roster_max),
            _ => roster,
        };
        let raw_pitcher_n = ((roster as f64) * p.rules.pitcher_ratio).round() as i32;
        let pitcher_n = raw_pitcher_n.min((roster - BATTING_ORDER).max(0));
        // 정본은 `tuning::SP_SHARE_OF_PITCHERS` — 충원 경로도 같은 값을 봐야 한다
        let sp_n = (pitcher_n as f64 * crate::tuning::SP_SHARE_OF_PITCHERS).round().max(3.0) as i32;
        let batter_n = roster - pitcher_n;

        // 팀별 독립 시드 — 팀 목록 순서/구성 변경이 다른 팀 로스터에 영향 없음
        let seed = p.world_seed
            ^ hash_str(&team.team_id)
            ^ (p.season_year as u32).wrapping_mul(2654435761);
        let mut rng = LcgRand::new(seed);
        let talent = crate::sim_types::TalentRulesPayload::resolve(p.talent.as_ref());

        // 외국인 슬롯 — **자리를 늘리지 않고 내국인 자리를 대체한다.**
        // 투수는 선발 앞자리(0..), 야수는 야수 첫 자리(pitcher_n..)에 넣는다.
        // 그래야 정원도 포지션 분포도 그대로다.
        let (fgn_p, fgn_b) = match &p.foreign {
            Some(f) => {
                let fp = f.max_pitchers.min(f.per_team) as i32;
                (fp.min(sp_n), (f.per_team as i32 - fp).min(batter_n))
            }
            None => (0, 0),
        };

        for i in 0..roster {
            let is_pitcher = i < pitcher_n;
            // ⚠ None일 때 rng 호출 순서가 예전과 **완전히 같아야** 한다 —
            // 아래 분기들은 전부 None 갈래에서 기존 코드를 그대로 탄다.
            let fgn: Option<&ForeignSlots> = match &p.foreign {
                Some(f) if i < fgn_p || (i >= pitcher_n && i < pitcher_n + fgn_b) => Some(f),
                _ => None,
            };
            let position = if is_pitcher {
                // ⚠ **마무리(CP)가 한 명도 생성되지 않았다.**
                //
                // 투수를 SP/RP로만 나눴다. 그런데 `rosterEngine.getTeamBullpen`은
                // 마무리를 **CP 포지션에서만** 고르고(`cpSorted[0]?.id ?? ""`),
                // 없으면 빈 문자열이라 `homeCloser: null`이 넘어간다 —
                // 그래서 **리그 전체 세이브가 0**이었다(규정투수 94~110명 전원).
                //
                // 불펜 첫 자리를 마무리로 둔다. 생성 순서가 능력치 순은 아니지만
                // 팀마다 정확히 1명이 보장되고, 실제 기용은 `getTeamBullpen`이
                // 컨디션·능력치로 다시 고른다.
                if i < sp_n { "SP".to_string() }
                else if i == sp_n { "CP".to_string() }
                else { "RP".to_string() }
            } else {
                // 8포지션을 **두 바퀴** 돈 뒤에야 랜덤으로 넘어간다.
                //
                // 한 바퀴만 돌던 시절엔 나머지가 전부 랜덤이라 특정 포지션이 1명으로
                // 남았다(프로 28명 로스터에서 2루·좌익·중견이 1명씩). 그 1명이 다치면
                // 그 자리가 통째로 빈다. 백업 1명까지는 구조로 보장한다.
                //
                // 야수가 16명이 안 되는 리그는 두 바퀴가 안 돌지만, 그때도 최소
                // 한 바퀴(8포지션 전원)는 보장된다 — 아래 나머지 연산이 그대로 처리한다.
                let bi = (i - pitcher_n) as usize;
                let np = POSITIONS.len();
                if bi < np * 2 {
                    POSITIONS[bi % np].to_string()
                } else if bi == np * 2 {
                    // 🔴 **세 번째 포수** (2026-08-31 · 사용자 확정).
                    //
                    //   두 바퀴를 돈 **바로 다음 한 명**을 포수로 못박는다.
                    //   예전엔 여기부터 랜덤이라 8분의 1 확률이었다.
                    //
                    // 🔴 왜 포수만인가 — **대학이 마르기 때문이다.**
                    //   고교 졸업 1,020명/년 중 포수 68명 → 대학 유입 400명 중
                    //   27명 → 팀당 **0.53명/년**. 대학이 4년간 필요한 2.1명과
                    //   **정확히 같아** 여유가 0이었고, 분산만으로 절반 가까운
                    //   팀이 0명이 됐다(실측 3회: 포수 0팀이 3·4·6팀).
                    //
                    // ⚠ **대학은 전과·전학이 없다**(사용자 확정) — 한 번 없으면
                    //   4년 내내 없다. 그래서 공급 쪽에서 풀어야 한다.
                    // ⚠ 야수가 17명 미만인 리그는 여기 안 닿는다 — 예전과 같다.
                    POSITIONS[0].to_string()
                } else {
                    POSITIONS[(rng.next() * np as f64) as usize % np].to_string()
                }
            };

            // 학년/나이 — 외국인은 전성기 나이대에서 뽑는다(유망주를 데려오지 않는다)
            let (grade, age, graduation_year) = if let Some(f) = fgn {
                (None, pick_age(f.age_min, f.age_max, &mut rng), 0)
            } else if p.rules.grade_max > 0 {
                let g = (i % p.rules.grade_max) + 1;
                (Some(g), p.rules.age_base + g, p.season_year + (p.rules.grade_max - g))
            } else {
                (None, pick_age(p.rules.age_min, p.rules.age_max, &mut rng), 0)
            };

            // 능력치 — 투수도 최소 타격치 보유 (교류전/지명타자 부재 대비).
            // 전력★ 보정은 **구간 전체를 민다** — 폭은 그대로 두고 중심만 옮긴다.
            // 그래야 약팀에서도 특급 유망주가 나올 수 있다(폭이 좁아지지 않는다).
            //
            // ⚠ **외국인은 전력★ 보정을 받지 않는다.** 영입은 팀 전력이 아니라
            // 추첨에 가깝다 — 약팀이 대박을 뽑고 강팀이 쪽박을 차는 게 정상이다.
            // 폭이 넓은 것도 의도다(사용자 확정): 팀당 독립 추첨이라 초기 전력차가 된다.
            let (ovr_p, ovr_b) = if let Some(f) = fgn {
                let o = (f.ovr_min + rng.next() * (f.ovr_max - f.ovr_min)).clamp(20.0, 99.0);
                (o, o)
            } else {
                ((p.rules.pitching_ovr_min + rng.next() * (p.rules.pitching_ovr_max - p.rules.pitching_ovr_min)
                    + power_shift).clamp(20.0, 99.0),
                 (p.rules.batting_ovr_min  + rng.next() * (p.rules.batting_ovr_max  - p.rules.batting_ovr_min)
                    + power_shift).clamp(20.0, 99.0))
            };
            let abilities = if is_pitcher {
                let pitching = make_pitching(ovr_p.round(), &mut rng);
                // 구종은 구속·보직·나이·OVR이 정한다 (Phase 6.5).
                // 예전엔 아예 없어서 프로 투수가 패스트볼도 없이 시작했다.
                let pitches = gen_pitches(&position, pitching.velocity, ovr_p, age, &mut rng);
                GenAbilities {
                    pitching: Some(pitching),
                    batting:  Some(make_batting((ovr_b * 0.55).round(), &mut rng)),
                    pitches:  Some(pitches),
                }
            } else {
                GenAbilities {
                    pitching: None,
                    batting:  Some(make_batting(ovr_b.round(), &mut rng)),
                    pitches:  None,
                }
            };

            let core_ovr = if is_pitcher { ovr_p } else { ovr_b };
            // 재능은 **천장과 속도를 같이** 뽑는다 — 신입생 생성과 같은 정본이다
            let (dv_min, dv_max) = match fgn {
                Some(f) => (f.dev_rate_min, f.dev_rate_max),
                None => (p.rules.dev_rate_min, p.rules.dev_rate_max),
            };
            let (pot_mult, dev_rate) = crate::tuning::sample_talent(
                &talent, dv_min, dv_max, rng.next(), rng.next(), rng.next());
            let pot_cap  = match fgn {
                Some(f) => f.ovr_max,
                None => p.rules.pitching_ovr_max.max(p.rules.batting_ovr_max),
            };
            // ⚠ **유망주를 예산에 묶는 건 아직 안 됐다** (2026-08-31).
            //   `pot_cap * pot_mult` 에 편향을 곱해 봤는데 **전부 천장(84/74)에
            //   붙어** 아무 차이가 안 났고, 전력★ 보정으로 `core_ovr` 이
            //   천장을 넘으면 clamp 가 터졌다(검사 2건이 잡았다).
            //   편향은 곱셈이 아니라 `pot_mult` 샘플링 자체에 넣어야 한다.
            let potential = (pot_cap * pot_mult).round().clamp(core_ovr.round(), 99.0);

            let handedness = if rng.next() < (if is_pitcher { 0.30 } else { 0.35 }) { "L" } else { "R" };

            // 프로 무학년: 경력 연차. **연봉보다 먼저 정해야 한다** — 연차가 연봉의 입력이다.
            //
            // 나이에 하한을 건다. 예전엔 `rand(0, age-20)`이라 **37세 0년차**가 나왔다.
            // 실제로는 나이가 많으면 그만큼 뛰었다 — 늦깎이라도 한계가 있다.
            // 하한 = 고졸 입단(20세) 기준 경과 연수의 절반. 대졸·군필·독립 출신이
            // 늦게 들어온 경우를 그 폭이 흡수한다.
            //
            // 외국인은 **이 리그 연차가 짧다.** entry_rules로 역산하면 30세가
            // 10년차가 돼 FA 자격까지 얻는다 — 그건 국내 육성 경로의 규칙이다.
            let pro_service_years = if fgn.is_some() {
                (rng.next() * 3.0) as i32
            } else if p.rules.grade_max == 0 && p.rules.with_contract {
                match &p.entry_rules {
                    // **입단 경로를 먼저 뽑고 연차를 역산한다.**
                    // 연차를 균등하게 뽑으면 입단 나이가 중간값에 몰려 출신 분포가
                    // 뒤집힌다 — 실제로 대졸 57% / 고졸 28%가 나왔다(KBO는 반대다).
                    Some(er) => {
                        let entry_age = crate::career_history::pick_entry_age(er, &mut rng);
                        (age - entry_age).max(0)
                    }
                    // 규칙이 없으면 구 동작 — 나이 하한만 건다(37세 0년차 방지)
                    None => {
                        let elapsed = (age - 20).max(0);
                        let min_svc = elapsed / 2;
                        let span = (elapsed - min_svc).max(0);
                        min_svc + (rng.next() * (span + 1) as f64) as i32
                    }
                }
            } else { 0 };

            let (salary, contract_years) = if p.rules.with_contract {
                let (s, y) = estimate_salary_and_contract(
                    core_ovr, &p.league_id, pro_service_years, age,
                    team.salary_index.unwrap_or(1.0), &salary_rules, &mut rng);
                // 외국인은 **단년 계약**이 원칙이다(KBO 동일). 매 시즌 재계약/교체가
                // 걸리게 하려면 여기서 1년으로 못박아야 한다
                if fgn.is_some() { (s, 1) } else { (s, y) }
            } else {
                (0, 0)
            };

            let (name, name_en) = match fgn.and_then(|f| f.name_pool.as_ref()).or(p.name_pool.as_ref()) {
                Some(pool) => gen_name_pooled(pool, &mut rng),
                None => gen_name_builtin(&mut rng),
            };

            let npc_id = format!("PLY_{}{:02}_{}_{:03}",
                prefix, p.season_year % 100, team_tag(&team.team_id), i + 1);
            // ⚠ **선수마다 독립 스트림**이다 — 로스터 rng 를 쓰면 병역 하나가
            //   뒤 선수의 이름·능력치를 통째로 밀어 같은 씨앗이 다른 세계가 된다
            let (ms, mil) = past_service_of(
                p.past_service.as_ref(), &npc_id, age, fgn.is_none() && nationality == "KOR");

            npcs.push(GenNpc {
                npc_id,
                name, name_en,
                is_named: false,
                player_type: if is_pitcher { "pitcher".into() } else { "batter".into() },
                position,
                handedness: handedness.into(),
                jersey_number: i + 1,
                age,
                grade,
                school_id: team.school_id.clone(),
                graduation_year,
                nationality: fgn.map_or_else(|| nationality.clone(), |f| f.nationality.clone()),
                career_status: "active".into(),
                current_league: p.league_id.clone(),
                current_team: team.team_id.clone(),
                salary, contract_years, pro_service_years,
                military_status: ms,
                military: mil,
                development_rate: dev_rate.round() as i32,
                potential_hidden: potential as i32,
                abilities,
                personality: gen_personality(&mut rng),
            });
        }
    }

    GenerateLeagueRosterResult { npcs }
}

// ── 외국인 교체 영입 (F-4) ───────────────────────────────────────────────────
//
// 시즌이 끝나면 부진한 용병이 빠지고 그 자리가 빈다. **확장팩이 닫혀 있으면
// ABL·JBL에서 데려올 수가 없으므로 새로 만든다**(사용자 확정).
//
// 초기 로스터(`generate_league_roster`)와 **같은 규칙·같은 폭**을 쓴다 —
// 여기서 따로 좁히면 2년차부터 세계 수준이 슬금슬금 달라진다.

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignRequest {
    pub team_id: String,
    /// 이 팀이 이번에 채울 투수 수
    pub pitchers: usize,
    /// 이 팀이 이번에 채울 야수 수
    pub batters: usize,
    #[serde(default)]
    pub salary_index: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateForeignParams {
    pub league_id: String,
    pub season_year: i32,
    pub world_seed: u32,
    pub requests: Vec<ForeignRequest>,
    pub foreign: ForeignSlots,
    #[serde(default)]
    pub salary_rules: Option<crate::npc_sim::SalaryRules>,
    /// 같은 해에 두 번 부를 때 ID가 겹치지 않게 하는 오프셋
    #[serde(default)]
    pub id_offset: i32,
    /// 재능 분포 (generation_rules.json talentRules) — 세 생성 경로가 같은 정본을 쓴다
    #[serde(default)]
    pub talent: Option<crate::sim_types::TalentRulesPayload>,
}

pub fn generate_foreign_players(p: GenerateForeignParams) -> GenerateLeagueRosterResult {
    let f = &p.foreign;
    let salary_rules = p.salary_rules.clone().unwrap_or_default();
    let mut npcs: Vec<GenNpc> = Vec::new();

    for req in &p.requests {
        let total = req.pitchers + req.batters;
        if total == 0 { continue; }

        // 팀·연도별 독립 시드. 요청 순서가 바뀌어도 같은 결과가 나온다
        let seed = p.world_seed
            ^ hash_str(&req.team_id)
            ^ (p.season_year as u32).wrapping_mul(40503)
            ^ 0x464f_5247;   // "FORG" — 초기 로스터와 시드가 겹치지 않게
        let mut rng = LcgRand::new(seed);
        let talent = crate::sim_types::TalentRulesPayload::resolve(p.talent.as_ref());

        for i in 0..total {
            let is_pitcher = i < req.pitchers;
            // 투수는 선발 우선(용병 투수는 선발로 쓴다), 야수는 중심타선 자리
            let position = if is_pitcher {
                if i == 0 { "SP" } else if i == 1 { "SP" } else { "RP" }
            } else {
                // 외야·1루 — 용병 타자가 실제로 서는 자리다
                ["LF", "1B", "RF", "3B"][(i - req.pitchers) % 4]
            }.to_string();

            let span = (f.age_max - f.age_min).max(0);
            let age = f.age_min + (rng.next() * (span + 1) as f64) as i32;

            // ⚠ 폭은 초기 로스터와 같다 — 대박/쪽박 편차가 매년 이어져야 한다
            let ovr = (f.ovr_min + rng.next() * (f.ovr_max - f.ovr_min)).clamp(20.0, 99.0);

            let abilities = if is_pitcher {
                let pitching = make_pitching(ovr.round(), &mut rng);
                let pitches = gen_pitches(&position, pitching.velocity, ovr, age, &mut rng);
                GenAbilities {
                    pitching: Some(pitching),
                    batting:  Some(make_batting((ovr * 0.55).round(), &mut rng)),
                    pitches:  Some(pitches),
                }
            } else {
                GenAbilities {
                    pitching: None,
                    batting:  Some(make_batting(ovr.round(), &mut rng)),
                    pitches:  None,
                }
            };

            // 용병도 같은 정본을 쓴다 — 여기만 따로 두면 정본이 셋이 된다
            let (pot_mult, dev_rate) = crate::tuning::sample_talent(
                &talent, f.dev_rate_min, f.dev_rate_max, rng.next(), rng.next(), rng.next());
            let potential = (f.ovr_max * pot_mult).round().clamp(ovr.round(), 99.0);
            let handedness = if rng.next() < (if is_pitcher { 0.30 } else { 0.35 }) { "L" } else { "R" };

            // 새로 온 용병은 이 리그 연차가 0이다
            let (salary, _years) = estimate_salary_and_contract(
                ovr, &p.league_id, 0, age,
                req.salary_index.unwrap_or(1.0), &salary_rules, &mut rng);

            let (name, name_en) = match f.name_pool.as_ref() {
                Some(pool) => gen_name_pooled(pool, &mut rng),
                None => gen_name_builtin(&mut rng),
            };

            npcs.push(GenNpc {
                // `F`가 들어가 초기 로스터 ID와 절대 겹치지 않는다
                npc_id: format!("PLY_F{}{:02}_{}_{:03}",
                    league_code(&p.league_id), p.season_year % 100,
                    team_tag(&req.team_id), p.id_offset + i as i32 + 1),
                name, name_en,
                is_named: false,
                player_type: if is_pitcher { "pitcher".into() } else { "batter".into() },
                position,
                handedness: handedness.into(),
                // 등번호는 뒷번호대 — 기존 로스터와 부딪히지 않게
                jersey_number: 60 + i as i32,
                age,
                grade: None,
                school_id: String::new(),
                graduation_year: 0,
                nationality: f.nationality.clone(),
                career_status: "active".into(),
                current_league: p.league_id.clone(),
                current_team: req.team_id.clone(),
                salary,
                // 외국인은 단년 계약이다 — 매 시즌 재계약 판정을 받는다
                contract_years: 1,
                pro_service_years: 0,
                military_status: "면제".into(),
                // 외국인 교체 영입 — 전원 면제라 다녀온 부대가 없다
                military: None,
                development_rate: dev_rate.round() as i32,
                potential_hidden: potential as i32,
                abilities,
                personality: gen_personality(&mut rng),
            });
        }
    }

    GenerateLeagueRosterResult { npcs }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    /// 실데이터(generation_rules.json)의 리그 규칙을 읽고 로스터 크기만 덮어쓴다.
    ///
    /// 인라인 규칙으로 두면 실제 게임과 달라져 테스트가 거짓 안심을 준다 —
    /// 실제로 `with_contract: false`인 인라인 규칙 때문에 연봉 테스트가
    /// 연봉 0을 검사하고 있었다.
    fn league_rules(league: &str, size: i32) -> RosterRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        let mut r: RosterRules = serde_json::from_value(v["rosterRules"][league].clone())
            .unwrap_or_else(|e| panic!("{league} rosterRules 파싱 실패: {e}"));
        r.roster_size = size;
        r
    }

    fn gen(league: &str, team_ids: &[&str], size: i32) -> Vec<GenNpc> {
        gen_with(league, &team_ids.iter().map(|t| (*t, None, None)).collect::<Vec<_>>(), size)
    }

    /// (팀ID, 전력★, 예산지수)로 생성 — 실데이터 규칙을 읽어 쓴다
    fn gen_with(
        league: &str,
        teams: &[(&str, Option<f64>, Option<f64>)],
        size: i32,
    ) -> Vec<GenNpc> {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        let salary_rules: Option<crate::npc_sim::SalaryRules> =
            serde_json::from_value(v["salaryRules"].clone()).ok();
        let power_rules: Option<PowerRules> =
            serde_json::from_value(v["powerRules"].clone()).ok();
        // 입단 경로 규칙도 실데이터에서 — 연차·출신이 여기서 나온다
        let entry_rules: Option<crate::career_history::EntryRules> =
            serde_json::from_value(v["careerHistoryRules"]["entry"].clone()).ok();

        generate_league_roster(GenerateLeagueRosterParams {
            league_id: league.to_string(),
            talent: None,
            season_year: 2029,
            world_seed: 4242,
            teams: teams.iter().map(|(t, pw, si)| TeamSpec {
                team_id: t.to_string(), school_id: String::new(),
                salary_index: *si, power: *pw, budget: None, spend_ratio: None, quality_bias: None
            }).collect(),
            rules: league_rules(league, size),
            name_pool: None,
            id_prefix: None,
            salary_rules, power_rules, entry_rules,
            foreign: None,
            // 실데이터에서 — 병역 회귀가 규칙 파일 값을 그대로 재야 한다
            past_service: serde_json::from_value(v["militaryRules"]["pastService"].clone()).ok(),
        }).npcs
    }

    /// 실데이터 `foreignRules`를 읽는다 — 인라인 값을 두면 규칙을 바꿨을 때
    /// 이 테스트가 거짓 안심을 준다
    fn foreign_rules() -> ForeignSlots {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["foreignRules"].clone()).expect("foreignRules 파싱 실패")
    }

    /// 외국인 교체 영입(F-4) — **요청한 수와 보직이 그대로 나와야 한다.**
    /// 여기가 어긋나면 보유 한도가 매 시즌 조금씩 밀린다.
    #[test]
    fn 외국인_교체_영입은_요청한_구성대로_만든다() {
        let f = foreign_rules();
        let out = generate_foreign_players(GenerateForeignParams {
            league_id: "LEAGUE_KBL".into(),
            talent: None,
            season_year: 2030,
            world_seed: 4242,
            requests: vec![
                ForeignRequest { team_id: "TEAM_KBL_A_1".into(), pitchers: 2, batters: 1, salary_index: None },
                ForeignRequest { team_id: "TEAM_KBL_B_1".into(), pitchers: 0, batters: 1, salary_index: None },
                ForeignRequest { team_id: "TEAM_KBL_C_1".into(), pitchers: 0, batters: 0, salary_index: None },
            ],
            foreign: f.clone(),
            salary_rules: None,
            id_offset: 0,
        }).npcs;

        assert_eq!(out.len(), 4, "요청 합계와 다르다");
        let a: Vec<_> = out.iter().filter(|n| n.current_team == "TEAM_KBL_A_1").collect();
        assert_eq!(a.iter().filter(|n| n.player_type == "pitcher").count(), 2);
        assert_eq!(a.iter().filter(|n| n.player_type == "batter").count(), 1);
        assert!(out.iter().all(|n| n.current_team != "TEAM_KBL_C_1"), "0명 요청에도 만들었다");

        for n in &out {
            assert_eq!(n.nationality, f.nationality);
            // 단년 계약이 아니면 매 시즌 교체 판정이 막힌다
            assert_eq!(n.contract_years, 1, "{} 계약연수", n.name);
            assert_eq!(n.military_status, "면제");
            assert!(n.age >= f.age_min && n.age <= f.age_max, "{} 나이 {}", n.name, n.age);
            // 초기 로스터 ID와 절대 겹치면 안 된다 (INSERT가 UNIQUE로 죽는다)
            assert!(n.npc_id.starts_with("PLY_F"), "{}", n.npc_id);
        }
        let ids: HashSet<&str> = out.iter().map(|n| n.npc_id.as_str()).collect();
        assert_eq!(ids.len(), out.len(), "npc_id 중복");
    }

    /// 초기 로스터(F-2a)의 보유 한도. **`test-roster-gen.cjs`와 겹치지만
    /// 여기서 먼저 깨지는 편이 낫다** — cargo test가 훨씬 빠르다.
    #[test]
    fn 초기_로스터_외국인은_보유_한도를_지킨다() {
        let f = foreign_rules();
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).unwrap();
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        let rules: RosterRules = serde_json::from_value(v["rosterRules"]["LEAGUE_KBL"].clone()).unwrap();

        let teams: Vec<TeamSpec> = ["TEAM_KBL_A_1", "TEAM_KBL_B_1", "TEAM_KBL_C_1"].iter()
            .map(|t| TeamSpec { team_id: t.to_string(), school_id: String::new(),
                                salary_index: None, power: None, budget: None, spend_ratio: None, quality_bias: None })
            .collect();
        let n_teams = teams.len();
        let size = rules.roster_size;
        let out = generate_league_roster(GenerateLeagueRosterParams {
            league_id: "LEAGUE_KBL".into(), season_year: 2029, world_seed: 4242,
            teams, rules, name_pool: None, id_prefix: None,
            salary_rules: None, power_rules: None, entry_rules: None,
            foreign: Some(f.clone()), talent: None, past_service: None,
        }).npcs;

        // 외국인이 자리를 **늘리지 않는다** — 정원은 그대로다
        assert_eq!(out.len(), n_teams * size as usize);
        for t in ["TEAM_KBL_A_1", "TEAM_KBL_B_1", "TEAM_KBL_C_1"] {
            let fg: Vec<_> = out.iter()
                .filter(|n| n.current_team == t && n.nationality == f.nationality).collect();
            assert_eq!(fg.len(), f.per_team, "{t} 보유 수");
            assert!(fg.iter().filter(|n| n.player_type == "pitcher").count() <= f.max_pitchers,
                    "{t} 투수 한도");
        }
    }

    /// **이 테스트가 없어서 `UNIQUE constraint failed: npc.npc_id`가 실사용에서 터졌다.**
    ///
    /// npcId가 `hash_str(team_id) % 10000`을 쓰던 시절, 4자리(1만 버킷)에 182팀을
    /// 넣으면 생일 문제로 충돌이 사실상 확실했다. 실제로 TEAM_UNIV_NAMGANG과
    /// TEAM_UNIV_SEORAK이 같은 5898로 접혀 두 팀 로스터 ID가 통째로 겹쳤다.
    ///
    /// **합성 팀명(T00~T49)으로는 안 잡힌다** — 우연히 안 겹칠 수 있다.
    /// refs.json의 실제 팀 목록을 읽어 국내 전 팀을 한 번에 검사한다.
    #[test]
    fn npc_id는_국내_전_팀에서_유일하다() {
        let refs_src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/entities/refs.json"
        )).expect("refs.json 없음");
        let refs: serde_json::Value = serde_json::from_str(&refs_src).expect("refs.json 파싱 실패");
        let teams = refs["teams"].as_array().expect("teams 배열 없음");

        let pick = |pred: &dyn Fn(&str, &str) -> bool| -> Vec<String> {
            teams.iter().filter_map(|t| {
                let id = t["id"].as_str()?;
                let lid = t["leagueId"].as_str()?;
                if pred(id, lid) { Some(id.to_string()) } else { None }
            }).collect()
        };

        let plan: Vec<(&str, Vec<String>, i32)> = vec![
            ("LEAGUE_HIGHSCHOOL",  pick(&|_, l| l == "LEAGUE_HIGHSCHOOL"), 30),
            ("LEAGUE_UNIVERSITY",  pick(&|_, l| l == "LEAGUE_UNIVERSITY"), 32),
            ("LEAGUE_INDEPENDENT", pick(&|_, l| l == "LEAGUE_INDEPENDENT"), 30),
            ("LEAGUE_KBL",         pick(&|i, l| l == "LEAGUE_KBL" && i.ends_with("_1")), 30),
            ("LEAGUE_KBL_FARM",    pick(&|i, l| l == "LEAGUE_KBL" && i.ends_with("_2")), 34),
        ];

        let mut seen: HashSet<String> = HashSet::new();
        let mut dups: Vec<String> = Vec::new();
        let mut total = 0usize;
        let mut team_count = 0usize;
        for (lid, ids, size) in &plan {
            assert!(!ids.is_empty(), "{lid} 팀이 refs에 없다");
            team_count += ids.len();
            let refs_v: Vec<&str> = ids.iter().map(|s| s.as_str()).collect();
            let npcs = gen(lid, &refs_v, *size);
            total += npcs.len();
            for n in &npcs {
                if !seen.insert(n.npc_id.clone()) { dups.push(n.npc_id.clone()); }
            }
        }
        assert!(dups.is_empty(),
            "국내 {team_count}팀 {total}명 중 npcId 중복 {}건 (예: {:?})",
            dups.len(), &dups[..dups.len().min(3)]);
        assert_eq!(seen.len(), total);
    }

    /// 이름이 비슷한 팀은 해시가 겹치기 쉬웠다 — 팀 ID를 그대로 쓰면 구조적으로 불가능하다
    #[test]
    fn 같은_리그_다른_팀은_id가_안_겹친다() {
        let npcs = gen("LEAGUE_UNIVERSITY", &["TEAM_UNIV_NAMGANG", "TEAM_UNIV_SEORAK"], 32);
        let a: HashSet<_> = npcs.iter().filter(|n| n.current_team == "TEAM_UNIV_NAMGANG")
            .map(|n| n.npc_id.clone()).collect();
        let b: HashSet<_> = npcs.iter().filter(|n| n.current_team == "TEAM_UNIV_SEORAK")
            .map(|n| n.npc_id.clone()).collect();
        assert!(!a.is_empty() && !b.is_empty());
        assert!(a.is_disjoint(&b), "두 팀의 npcId가 겹친다: {:?}", a.intersection(&b).next());
    }

    /// 1군/2군은 팀 ID 접미사(_1/_2)만 다르다 — 그것만으로 갈려야 한다
    #[test]
    fn 팜팀과_1군은_id가_안_겹친다() {
        let first = gen("LEAGUE_KBL", &["TEAM_KBL_SEOUL_1"], 30);
        let farm  = gen("LEAGUE_KBL_FARM", &["TEAM_KBL_SEOUL_2"], 34);
        let a: HashSet<_> = first.iter().map(|n| n.npc_id.clone()).collect();
        let b: HashSet<_> = farm.iter().map(|n| n.npc_id.clone()).collect();
        assert!(a.is_disjoint(&b));
        // 팜 리그가 league_code에 없으면 "XX"로 떨어진다 — 접두사도 확인한다
        assert!(farm[0].npc_id.starts_with("PLY_KF"), "팜 접두사가 틀렸다: {}", farm[0].npc_id);
    }

    /// **한국 나이 체계 — 고1이 17세다.**
    ///
    /// 이 테스트가 없어서 두 가지가 동시에 어긋나 있었다:
    ///  1. NPC 고1이 16세인데 **주인공은 17세로 시작**했다 (같은 학년, 다른 나이)
    ///  2. 고3이 18세라 졸업하면 19세인데 프로 최소 나이가 20세 —
    ///     **진학·입단 사이에 1년 구멍**이 있었다
    ///
    /// 실데이터(generation_rules.json)로 검사한다 — 인라인 규칙으로는 실제 게임과
    /// 달라질 수 있다.
    #[test]
    fn 나이_체계가_진로를_끊지_않는다() {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).expect("파싱 실패");
        let r = &v["rosterRules"];
        let num = |lid: &str, k: &str| r[lid][k].as_i64().expect(&format!("{lid}.{k} 없음"));

        // 학년제: age = ageBase + grade
        let hs_base = num("LEAGUE_HIGHSCHOOL", "ageBase");
        let hs_max_grade = num("LEAGUE_HIGHSCHOOL", "gradeMax");
        let uv_base = num("LEAGUE_UNIVERSITY", "ageBase");
        let uv_max_grade = num("LEAGUE_UNIVERSITY", "gradeMax");

        assert_eq!(hs_base + 1, 17, "고1이 17세가 아니다 (ageBase {hs_base})");
        assert_eq!(uv_base + 1, 20, "대1이 20세가 아니다 (ageBase {uv_base})");

        let hs_grad = hs_base + hs_max_grade;      // 고3 나이
        let uv_grad = uv_base + uv_max_grade;      // 대4 나이
        assert_eq!(hs_grad, 19, "고3이 19세가 아니다");
        assert_eq!(uv_grad, 23, "대4가 23세가 아니다");

        // 졸업 다음 해 나이로 각 진로에 들어갈 수 있어야 한다 — 여기가 구멍이었다
        let after_hs = hs_grad + 1;                // 20
        for lid in ["LEAGUE_INDEPENDENT", "LEAGUE_KBL", "LEAGUE_KBL_FARM"] {
            let lo = num(lid, "ageMin");
            assert!(after_hs >= lo,
                "{lid} 최소 나이 {lo} > 고졸 다음해 {after_hs} — 진로에 {}년 구멍", lo - after_hs);
        }
        assert_eq!(after_hs, uv_base + 1, "고졸 다음해와 대1 나이가 다르다");

        // 대졸도 프로 나이 범위 안이어야 한다
        let after_uv = uv_grad + 1;                // 24
        let kbl_lo = num("LEAGUE_KBL", "ageMin");
        let kbl_hi = num("LEAGUE_KBL", "ageMax");
        assert!(after_uv >= kbl_lo && after_uv <= kbl_hi,
            "대졸 다음해 {after_uv}가 프로 범위 {kbl_lo}~{kbl_hi} 밖이다");
    }

    /// 투수는 구종을 갖고 시작한다 — 예전엔 0종이었다.
    ///
    /// 경기 결과에는 영향이 없지만(SimPitcher가 구종을 안 본다) 화면과 성장에 쓰인다.
    /// 프로 투수가 패스트볼도 없이 시작하는 건 그 자체로 틀렸다.
    #[test]
    fn 투수는_구종을_갖고_시작한다() {
        let npcs = gen("LEAGUE_KBL", &["TEAM_KBL_A", "TEAM_KBL_B"], 30);
        let pitchers: Vec<_> = npcs.iter().filter(|n| n.player_type == "pitcher").collect();
        let batters:  Vec<_> = npcs.iter().filter(|n| n.player_type != "pitcher").collect();
        assert!(!pitchers.is_empty() && !batters.is_empty());

        for p in &pitchers {
            let ps = p.abilities.pitches.as_ref().expect("투수에 구종이 없다");
            assert!(!ps.is_empty(), "구종 0종인 투수");
            assert!(ps.iter().any(|x| x.id == PITCH_FASTBALL),
                "패스트볼 없는 투수: {:?}", ps.iter().map(|x| &x.id).collect::<Vec<_>>());
            assert!(ps.iter().all(|x| (1..=5).contains(&x.grade)),
                "구종 grade가 1~5 밖");
            // 같은 구종을 두 번 갖지 않는다
            let mut ids: Vec<&str> = ps.iter().map(|x| x.id.as_str()).collect();
            ids.sort_unstable();
            let n = ids.len();
            ids.dedup();
            assert_eq!(ids.len(), n, "구종 중복");
        }
        // 야수는 구종이 **없어야** 한다 (빈 배열이 아니라 아예 없음)
        for b in &batters {
            assert!(b.abilities.pitches.is_none(), "야수에 구종이 붙었다");
        }
    }

    /// 생성 구종 수가 성장 로직의 목표치를 넘지 않아야 한다.
    /// 넘으면 성장 로직(`decide_pitch_training`)이 할 일이 없어진다.
    #[test]
    fn 구종_수가_성장_목표를_넘지_않는다() {
        let npcs = gen("LEAGUE_KBL", &["TEAM_KBL_A"], 30);
        for p in npcs.iter().filter(|n| n.player_type == "pitcher") {
            let ps = p.abilities.pitches.as_ref().unwrap();
            let vel = p.abilities.pitching.as_ref().unwrap().velocity;
            let target = pitch_target(&p.position, vel);
            assert!(ps.len() <= target,
                "{} 구속{vel}: 구종 {}종 > 목표 {target}종", p.position, ps.len());
        }
    }

    /// 전력★이 로스터 수준을 정한다.
    ///
    /// 이게 없어서 **명문교와 약팀의 로스터가 똑같았다** (고교 상관계수 −0.05).
    /// 전국대회 우승팀이 매년 무작위로 바뀌었고, 팀 선택에 의미가 없었다.
    #[test]
    fn 전력이_높은_팀이_실제로_강하다() {
        let teams = [("TEAM_KBL_S5", Some(5.0), None), ("TEAM_KBL_S1", Some(1.0), None)];
        let npcs = gen_with("LEAGUE_KBL", &teams, 30);
        let avg = |tid: &str| {
            let v: Vec<f64> = npcs.iter().filter(|n| n.current_team == tid)
                .map(|n| n.abilities.pitching.as_ref().map(|p| p.ovr)
                    .or_else(|| n.abilities.batting.as_ref().map(|b| b.ovr)).unwrap_or(0.0))
                .collect();
            v.iter().sum::<f64>() / v.len() as f64
        };
        let strong = avg("TEAM_KBL_S5");
        let weak   = avg("TEAM_KBL_S1");
        assert!(strong > weak + 8.0,
            "★5({strong:.1})가 ★1({weak:.1})보다 충분히 강하지 않다");
    }

    /// 약팀에서도 특급이 나올 수 있어야 한다 — 보정은 **폭이 아니라 중심**을 민다.
    /// 폭까지 좁히면 약팀에 유망주가 영영 안 나오고 드래프트가 심심해진다.
    #[test]
    fn 전력_보정이_능력치_폭을_좁히지_않는다() {
        let s5 = gen_with("LEAGUE_KBL", &[("T5", Some(5.0), None)], 30);
        let s1 = gen_with("LEAGUE_KBL", &[("T1", Some(1.0), None)], 30);
        let spread = |v: &[GenNpc]| {
            let o: Vec<f64> = v.iter().map(|n| n.abilities.pitching.as_ref().map(|p| p.ovr)
                .or_else(|| n.abilities.batting.as_ref().map(|b| b.ovr)).unwrap_or(0.0)).collect();
            o.iter().cloned().fold(f64::MIN, f64::max) - o.iter().cloned().fold(f64::MAX, f64::min)
        };
        let (a, b) = (spread(&s5), spread(&s1));
        assert!((a - b).abs() < 12.0, "★5 폭 {a:.1} vs ★1 폭 {b:.1} — 한쪽이 눌렸다");
    }

    /// 연봉은 OVR·연차·팀 예산을 **전부** 본다.
    /// 예전엔 OVR 선형이라 0년차와 12년차가 같은 연봉이었다.
    #[test]
    fn 연봉이_연차와_팀예산을_반영한다() {
        let npcs = gen_with("LEAGUE_KBL", &[("T", Some(3.0), Some(1.0))], 30);
        let rookies: Vec<i64> = npcs.iter().filter(|n| n.pro_service_years <= 2).map(|n| n.salary).collect();
        let vets:    Vec<i64> = npcs.iter().filter(|n| n.pro_service_years >= 8).map(|n| n.salary).collect();
        if !rookies.is_empty() && !vets.is_empty() {
            let ra = rookies.iter().sum::<i64>() as f64 / rookies.len() as f64;
            let va = vets.iter().sum::<i64>() as f64 / vets.len() as f64;
            assert!(va > ra * 1.3, "베테랑 평균 {va:.0} vs 신인 {ra:.0} — 연차가 안 먹는다");
        }

        // 팀 예산이 총액을 가른다 (전력은 같게 두고 예산만 바꾼다)
        let rich = gen_with("LEAGUE_KBL", &[("R", Some(3.0), Some(1.4))], 30);
        let poor = gen_with("LEAGUE_KBL", &[("P", Some(3.0), Some(0.6))], 30);
        let sum = |v: &[GenNpc]| v.iter().map(|n| n.salary).sum::<i64>();
        assert!(sum(&rich) > sum(&poor),
            "부유한 팀 총연봉 {} <= 궁핍한 팀 {}", sum(&rich), sum(&poor));
    }

    /// 리그 최저연봉 아래로 내려가지 않는다
    #[test]
    fn 최저연봉선을_지킨다() {
        let npcs = gen_with("LEAGUE_KBL", &[("T", Some(1.0), Some(0.5))], 30);
        for n in &npcs {
            assert!(n.salary >= 3000, "{} 연봉 {} < 최저 3000", n.npc_id, n.salary);
        }
    }

    /// 나이와 연차가 어긋나지 않는다 — 예전엔 **37세 0년차**가 나왔다
    #[test]
    fn 연차가_나이와_맞는다() {
        let npcs = gen_with("LEAGUE_KBL", &[("T", Some(3.0), Some(1.0))], 30);
        for n in &npcs {
            assert!(n.pro_service_years <= n.age - 20,
                "{}세 {}년차 — 고졸 입단(20세)보다 오래 뛰었다", n.age, n.pro_service_years);
            // 서른 넘어 신인은 없다
            if n.age >= 30 {
                assert!(n.pro_service_years >= 3,
                    "{}세인데 {}년차 — 늦깎이라도 한계가 있다", n.age, n.pro_service_years);
            }
        }
    }

    /// 병역이 나이를 본다 (B-29 D-5 · 사용자 확정 ④).
    ///
    /// 🔴 예전엔 **한국인 전원이 미필**이었다 — 37세 KBL 베테랑도 그랬고,
    /// 입대 게이트가 20~29세라 30대는 어느 문에도 안 걸려 영원히 미필이었다.
    #[test]
    fn 새_게임_병역이_나이를_본다() {
        let npcs = gen_with("LEAGUE_KBL", &[("T", Some(3.0), Some(1.0))], 30);
        let kor: Vec<&GenNpc> = npcs.iter().filter(|n| n.nationality == "KOR").collect();
        assert!(!kor.is_empty(), "한국인이 한 명도 없다 — 표본이 없다");

        let rules = past_service_rules();
        for n in &kor {
            if n.age < rules.undecided_below {
                assert_eq!(n.military_status, "미필",
                    "{}세인데 {} — 그 나이엔 아직 안 갔다", n.age, n.military_status);
            } else if n.age >= rules.served_from {
                assert_eq!(n.military_status, "군필",
                    "{}세인데 {} — 서른 넘은 미필이 남으면 영원히 미필이다",
                    n.age, n.military_status);
            }
            // 군필이면 다녀온 부대가 있어야 한다 — 없으면 상무/현역 구분이 사라진다
            if n.military_status == "군필" {
                assert!(n.military.as_ref().and_then(|m| m.served_unit.as_ref()).is_some(),
                    "{}세 군필인데 다녀온 부대가 없다", n.age);
            } else {
                assert!(n.military.is_none(), "미필인데 부대 기록이 있다");
            }
        }
        // 사이 나이대는 **갈려야** 한다 — 한쪽만 나오면 확률이 죽은 것이다
        let between: Vec<&&GenNpc> = kor.iter()
            .filter(|n| n.age >= rules.undecided_below && n.age < rules.served_from).collect();
        if between.len() >= 20 {
            let served = between.iter().filter(|n| n.military_status == "군필").count();
            assert!(served > 0 && served < between.len(),
                "26~28세 {}명이 전부 한쪽이다 (군필 {served})", between.len());
        }
    }

    /// 외국인은 예전 그대로 면제다 — 나이 규칙이 국적을 안 가리면 안 된다
    #[test]
    fn 외국인은_병역이_면제다() {
        let npcs = gen_with("LEAGUE_KBL", &[("T", Some(3.0), Some(1.0))], 30);
        for n in npcs.iter().filter(|n| n.nationality != "KOR") {
            assert_eq!(n.military_status, "면제", "{} 국적인데 {}", n.nationality, n.military_status);
        }
    }

    /// 같은 씨앗이면 같은 병역이어야 한다 — 세계를 다시 열면 같은 사람이다
    #[test]
    fn 병역은_씨앗에_대해_재현된다() {
        let a = gen_with("LEAGUE_KBL", &[("T", Some(3.0), Some(1.0))], 30);
        let b = gen_with("LEAGUE_KBL", &[("T", Some(3.0), Some(1.0))], 30);
        let key = |v: &[GenNpc]| v.iter()
            .map(|n| format!("{}:{}", n.npc_id, n.military_status)).collect::<Vec<_>>();
        assert_eq!(key(&a), key(&b));
    }

    /// 검사 기댓값도 **규칙 파일에서** 읽는다 — 나이를 여기 또 적으면 두 벌이 된다
    fn past_service_rules() -> PastServiceRules {
        let src = std::fs::read_to_string(concat!(
            env!("CARGO_MANIFEST_DIR"), "/../../resource/data/master/players/generation_rules.json"
        )).expect("generation_rules.json 없음");
        let v: serde_json::Value = serde_json::from_str(&src).unwrap();
        serde_json::from_value(v["militaryRules"]["pastService"].clone())
            .expect("militaryRules.pastService 가 없다 — 규칙 파일이 정본이다")
    }

    /// 야수 8포지션에 백업까지 있어야 한다 (한 명이 다치면 자리가 비지 않게)
    #[test]
    fn 야수_8포지션에_백업이_있다() {
        const FIELD: [&str; 8] = ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
        for size in [30, 32, 34] {
            let npcs = gen("LEAGUE_KBL", &["TEAM_KBL_A"], size);
            for pos in FIELD {
                let n = npcs.iter().filter(|x| x.position == pos).count();
                assert!(n >= 2, "로스터 {size}명인데 {pos}가 {n}명 — 백업이 없다");
            }
        }
    }

    #[test]
    fn 팀마다_마무리가_있다() {
        // ⚠ **투수를 SP/RP로만 만들었다.** `rosterEngine.getTeamBullpen`은
        // 마무리를 CP 포지션에서만 고르므로 CP가 0명이면 마무리가 빈 문자열이
        // 되고, 엔진에 `homeCloser: null`이 넘어가 **세이브가 리그 전체에서 0**이
        // 된다. 아무 오류도 안 나고, 집계로도 "접전이 적었나"로 읽힌다 —
        // 수상 자격선 점검에서 규정투수 94~110명 전원의 sv가 0인 걸 보고서야 알았다.
        for size in [30, 32, 34] {
            let npcs = gen("LEAGUE_KBL", &["TEAM_KBL_A"], size);
            let cp = npcs.iter().filter(|x| x.position == "CP").count();
            assert!(cp >= 1, "로스터 {size}명인데 마무리가 {cp}명");
            // 선발도 로테이션이 돌 만큼은 있어야 한다 — CP를 늘리다 SP를 깎으면 안 된다
            let sp = npcs.iter().filter(|x| x.position == "SP").count();
            assert!(sp >= 5, "로스터 {size}명인데 선발이 {sp}명 — 로테이션이 안 돈다");
        }
    }
}

// ── 주인공 숨은 값 (2026-08-28) ──────────────────────────────────────────────

/// **주인공의 잠재력·성장률.**
///
/// 🔴 이 둘을 **`NewGamePage.svelte`가 `Math.random()`으로 굴리고 있었다.**
///   NPC는 여기 `roster_gen`이 만드는데 **주인공만 화면에서 만들었다** —
///   CLAUDE.md 아키텍처가 금지하는 자리다("apps/ui는 화면 렌더링만").
///
/// ⚠ **분포는 안 바꿨다.** 옮기기만 했다. 값은 `protagonistRules`가 정본이고
///   주인공과 NPC 고교가 **일부러 다르다**(주인공 devRate 73~88 · NPC 45~75) —
///   예전에 주인공이 또래보다 느려 백분위 1%까지 밀린 걸 고친 결과다.
///   규칙 파일 주석에 근거가 있다.
///
/// ⚠ 씨앗이 0이면 `thread_rng`다 — 예전 동작(매번 다름)이다.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistHiddenParams {
    #[serde(default)]
    pub seed: u32,
    pub potential_min: i32,
    pub potential_max: i32,
    pub dev_rate_min: i32,
    pub dev_rate_max: i32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistHiddenResult {
    pub potential_hidden: i32,
    pub development_rate: i32,
}

pub fn gen_protagonist_hidden(p: ProtagonistHiddenParams) -> ProtagonistHiddenResult {
    let mut rng: Box<dyn rand::RngCore> = if p.seed != 0 {
        Box::new(crate::npc_sim::LcgRand::new(p.seed | 1))
    } else {
        Box::new(rand::thread_rng())
    };
    // ⚠ 하한이 상한보다 크면 하한을 쓴다 — 규칙 파일이 뒤집혀도 안 죽는다
    // ⚠ 하한이 상한보다 크면 하한을 쓴다 — 규칙 파일이 뒤집혀도 안 죽는다
    let mut pick = |lo: i32, hi: i32| -> i32 {
        if hi <= lo { return lo; }
        lo + (rng.next_u32() as f64 / u32::MAX as f64 * (hi - lo + 1) as f64) as i32
    };
    let potential_hidden = pick(p.potential_min, p.potential_max);
    let development_rate = pick(p.dev_rate_min, p.dev_rate_max);
    ProtagonistHiddenResult { potential_hidden, development_rate }
}
