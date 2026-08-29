use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── NPC 능력치 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPitchingAttrs {
    pub ovr: f64,
    pub stamina: f64,
    pub velocity: f64,
    pub command: f64,
    pub control: f64,
    pub movement: f64,
    pub mentality: f64,
    pub recovery: f64,
    pub clutch: f64,
    pub hold_runners: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcBattingAttrs {
    pub ovr: f64,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
    pub speed: f64,
    pub base_instinct: f64,
    pub bunting: f64,
    pub platoon: f64,
    pub fielding: f64,
    pub arm: f64,
    pub batting_clutch: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPitchEntry {
    pub id: String,
    pub grade: u8,   // 1~5
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPitchTraining {
    pub pitch_id: String,
    pub progress: f64,   // 0.0 ~ 100.0
    pub is_new: bool,    // true: 발견(새 구종), false: 등급 업
}

// ── NPC 커리어 기록 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcCareerEntry {
    pub year: i32,
    pub league_id: String,
    pub team_id: String,
    pub stat_line: String,
    pub highlights: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcCareerEvent {
    pub year: i32,
    pub event_type: String,  // "draft_picked"|"draft_undrafted"|"trade"|"fa_signed"|"military_enlist"|"military_discharge"|"retirement"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_team_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_league_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_league_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

// ── NPC 저장 상태 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcSaveState {
    pub npc_id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name_en: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nationality: Option<String>,  // "KOR"|"JPN"|"USA"|"OTHER"; None → "KOR" 폴백
    pub player_type: String,
    pub position: String,
    /// 등번호. **0 은 "아직 없음"이다** — `fix_jersey_numbers` 가 채운다.
    ///
    /// ⚠ `serde(default)` 라 안 넘겨도 통과한다. 그래서 이 필드가 **없던**
    ///   시절에도 오류 없이 돌았고, 화면에만 0번으로 나왔다.
    #[serde(default)]
    pub jersey_number: i32,
    pub age: i32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub grade: Option<u8>,
    pub school_id: String,
    pub graduation_year: i32,
    pub career_status: String,
    pub current_league: String,
    pub current_team: String,
    pub military_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_enlist_year: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_discharge_year: Option<i32>,
    #[serde(default)]
    pub current_salary: i64,
    #[serde(default = "default_one")]
    pub contract_years: i32,
    #[serde(default)]
    pub sports_unit_selected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_unit: Option<String>,       // "sports" | "general" — **복무 중일 때만**
    /// 다녀온 부대. **전역 뒤에도 남는다.**
    ///
    /// ⚠ 전역이 `military_unit`을 `None`으로 지워서 **상무 출신인지 현역
    /// 출신인지가 사라졌다.** 20시즌 장부에서 상무 입대가 마지막 2년(복무 중인
    /// 인원)만 잡히고 나머지 19년치가 전부 현역으로 집계됐다 — 실제로는
    /// 매년 상무 13 + 현역 30이 정상 작동하고 있었는데 기록만 없었다.
    ///
    /// 선수 상세·인생 기록이 "상무 출신"을 보여주려면 이 값이 있어야 한다.
    #[serde(default)]
    pub military_served_unit: Option<String>,
    /// 군 계급. **Rust는 안 쓰지만 반드시 들고 있어야 한다** —
    /// 이 필드가 없으면 NPC가 Rust를 한 번 통과할 때마다 계급이 사라지고,
    /// `syncNpcs`가 INSERT OR REPLACE라 다음 저장에서 DB의 계급까지 지워진다.
    /// (military_roster.rs가 복무 개월로 정한 값이 정본 — design/roster.md §7)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub military_rank: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_league_id: Option<String>,  // 입대 전 리그 (전역 시 복귀)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub original_team_id: Option<String>,    // 입대 전 팀 (전역 시 복귀)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitching: Option<NpcPitchingAttrs>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub batting: Option<NpcBattingAttrs>,
    pub development_rate: i32,
    #[serde(default = "default_potential")]
    pub potential_hidden: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pro_service_years: Option<i32>,
    /// 육성선수로 입단한 연도. `None`이면 정식 등록 선수다.
    ///
    /// ⚠ **신분이지 소속이 아니다.** 2군에 있다고 육성선수가 아니고,
    /// 정식 등록 선수도 강등되면 2군에 있는다. 리그 ID로 판정하면
    /// 드래프트 지명자가 육성선수 대우를 받는다.
    ///
    /// KBO: 육성선수는 정원 밖 인원이고 최저연봉(3000만원) 보장이 없으며,
    /// **입단 연도에는 5월 1일 이후에만** 1군 등록이 된다. 그 제한을
    /// 거는 곳이 `registrable`이다
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub development_since: Option<i32>,
    /// 마지막 재계약 판정 시점의 OVR. 육성선수에게만 있다.
    ///
    /// 육성선수는 단년 계약이라 해마다 "성장했는가"를 묻는다. 그 비교 기준이
    /// 이 값이고, 판정할 때마다 갱신된다.
    ///
    /// ⚠ **입단 시점으로 고정하면 안 된다.** 육성선수는 열여덟·아홉이라
    /// 입단 대비로는 거의 다 성장해 아무도 안 나간다 — 자리가 안 열려서
    /// 실측 다섯 시즌 내내 미지명자 유입이 0이었던 그 상태가 그대로 남는다.
    ///
    /// ⚠ **왕복에 안 실으면 사라진다.** 없으면 첫 판정에서 비교 기준이 없어
    /// 전원 재계약이 된다. 저장은 `npcAdapter`의 `extra`다
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub development_ovr: Option<i32>,
    pub career_history: Vec<NpcCareerEntry>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub career_events: Vec<NpcCareerEvent>,
    pub achievements: Vec<String>,
    #[serde(default)]
    pub fame: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub personality: Option<NpcPersonality>,
}

// ── 시즌 종료 요약 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SeasonEndSummary {
    pub retired_count: i32,
    pub military_enlisted_count: i32,
    pub military_discharged_count: i32,
    pub fa_count: i32,
    /// FA 계약 성사 · 미계약 인원.
    ///
    /// 🔴 **여기서 세는 이유** — 이 둘은 `events` 채널로만 나가고
    /// `npc.career_events`에는 안 들어간다. `careerEventTally`(= `careerEvents`를
    /// 세는 프로브)로 재면 **늘 0**이라, 2026-08-26까지 "미계약률 0%"로
    /// 잘못 기록돼 있었다. 실측은 40%대였다.
    /// **사건을 만드는 자리에서 센다.**
    #[serde(default)]
    pub fa_signed_count: i32,
    #[serde(default)]
    pub fa_unsigned_count: i32,
    /// 리그별 `"계약/미계약"` — **원소속 리그 기준**이다.
    ///
    /// ⚠ 총합만 보면 뜻을 못 읽는다. FA 전환자는 KBL 1군보다 많고
    ///   대부분 2군·독립이다 — **2군 선수가 못 구하는 것과 1군 주전이
    ///   못 구하는 건 다른 일이다.**
    #[serde(default)]
    pub fa_by_league: std::collections::HashMap<String, (i32, i32)>,
    /// FA 재배치 루프에 들어온 **비활성**(은퇴·군복무) 인원.
    /// 계측용이다 — 0이 아니면 진입 조건이 새는 것이다.
    #[serde(default)]
    pub fa_inactive_seen: i32,
    /// 원소속이 `LEAGUE_RETIRED`인 채로 FA에 온 사람과, 그중 전역자.
    /// 갈 팀이 없어 **100% 미계약**이 된다. 경로를 가리는 계측이다.
    #[serde(default)]
    pub fa_retired_origin: (i32, i32),
    pub univ_graduated_count: i32,
    #[serde(default)]
    pub military_enlisted_sports: Vec<String>,   // 체육부대 입대자 이름
    #[serde(default)]
    pub military_enlisted_general: Vec<String>,  // 일반부대 입대자 이름
    #[serde(default)]
    pub military_discharged_names: Vec<String>,  // 전역자 이름
}

// ── 오프시즌 처리 결과 (mailboxEntry는 TS에서 생성) ──────────────────────────

/// 오프시즌에 한 사람에게 일어난 일.
///
/// ⚠ **여기서 문장을 만들지 않는다.** 예전엔 `logs`에
/// `format!("{} 방출 (로스터 초과 {league_id})", npc.name)`처럼 조립해 보냈고,
/// 그 문자열이 그대로 화면에 찍혔다. 이름·팀·사유가 한 덩어리로 붙은 뒤라
/// 화면은 **팀 ID를 이름으로 못 바꾸고, 종류별로 못 묶고, 내 팀 것만 못 골랐다.**
/// 실제로 `LEAGUE_KBL_FARM` · `TEAM_UNIV_ASAN`이 사용자 화면에 그대로 떴다.
///
/// ⚠ **이름을 넣지 않는다.** 화면이 `npcId`로 조회한다 — 은퇴자도 `npcs`에
/// 남으므로 조회된다. 이름을 여기 넣으면 개명·표기 변경이 소식에만 안 따라온다.
///
/// ⚠ `from_team_id`는 **반드시 여기 담는다.** 은퇴·방출은 직후에
/// `current_team`을 비우므로, 이걸 안 남기면 어느 팀에서 나갔는지가 사라진다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffseasonEvent {
    /// `retire_age` | `retire_no_team` | `release_roster` | `release_score`
    /// | `demote` | `promote` | `fa_unsigned`
    pub kind: String,
    pub npc_id: String,
    /// 사건 당시 소속. 없을 수 있다(소속이 이미 빈 사람)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_team_id: Option<String>,
    /// 간 곳. **팀 ID다 — 이름도 문장도 아니다.**
    /// 화면이 ID를 이름으로 바꾼다 — `detail`에 박아 넣으면 `TEAM_KBL_...`이
    /// 그대로 뜼다. 이 파일 위쪽 주석이 경계하는 바로 그것이다.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub to_team_id: Option<String>,
    /// 사유의 부가 정보. **문장이 아니라 값이다** (`"65"` 같은 점수)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffseasonOutput {
    pub npcs: Vec<NpcSaveState>,
    pub pending_draft: Vec<NpcSaveState>,
    pub summary: SeasonEndSummary,
    /// 총계 몇 줄만. **개별 사건은 `events`에 있다.**
    ///
    /// ⚠ 예전엔 여기 213줄이 들어왔고 호출측이 `[...result.logs, ...st.logs]
    /// .slice(0, 30)`으로 최근 활동 로그에 부었다 — **시즌 마지막 주에 뭘 했든
    /// 전부 대학팀 수비 조정 이야기로 덮였다.**
    pub logs: Vec<String>,
    #[serde(default)]
    pub events: Vec<OffseasonEvent>,
}

// ── 학년 진급 결과 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeAdvanceResult {
    pub updated: Vec<NpcSaveState>,
    pub hs_graduated: Vec<NpcSaveState>,    // HS grade 3 → 드래프트 풀
    pub univ_graduated: Vec<NpcSaveState>,  // 대학 grade 4 → 드래프트 풀
}

// ── 전체 나이 증가 입력 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceAllAgesParams {
    pub npcs: Vec<NpcSaveState>,
}

// ── 신입생 생성 파라미터 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateFreshmenParams {
    pub school_id: String,
    pub team_id: String,
    pub annual_roster_size: i32,
    pub pitching_ovr_min: f64,
    pub pitching_ovr_max: f64,
    pub batting_ovr_min: f64,
    pub batting_ovr_max: f64,
    pub dev_rate_min: f64,
    pub dev_rate_max: f64,
    /// 천장(`potential_hidden`) 계산에 쓸 상한. 없으면 `*_ovr_max` 중 큰 값.
    ///
    /// ⚠ **육성선수 때문에 갈라놨다.** 천장은 `ovr_max * pot_mult`인데,
    /// 육성선수의 시작 능력치를 낮추려고 `ovr_max`를 내리면 **천장까지 같이
    /// 내려간다.** 그러면 "지금은 약하지만 클 수 있다"가 아니라 그냥 약한
    /// 선수가 되고, 육성선수가 프로가 되는 경로 자체가 없어진다
    /// (사용자 확정 2026-08-07: 범위는 낮추되 천장은 안 낮춘다)
    #[serde(default)]
    pub potential_ovr_max: Option<f64>,
    pub named_npcs: Vec<NpcSaveState>,
    pub season_year: i32,
    pub id_offset: i32,
    /// **채워야 할 자리** — 앞에서부터 순서대로 배정한다. 모자라면 무작위로 넘어간다.
    ///
    /// ⚠ 예전엔 포지션이 `POSITIONS[rand]`, 투수 여부가 `rand < 0.3`이었다.
    /// 평균으로는 균등해도 **팀 단위 편차가 해마다 누적**된다 — 포수는 8분의 1이라
    /// 신입생 8명이면 포수 0명일 확률이 34%다. 3학년이 매년 졸업으로 빠지는데
    /// 포수가 안 들어오는 해가 겹치면 0이 된다(실측 고교 102팀 중 31팀이
    /// 어느 해엔가 포수 0명).
    ///
    /// 투수 보직("SP"/"RP")도 여기 넣는다 — 투수/야수 비율도 같은 이유로 흔들린다
    /// (실측 고교 최소 투수 4명).
    #[serde(default)]
    pub needed_positions: Vec<String>,
    /// 무작위 폴백의 투수 비율. **로스터 생성(`pitcher_ratio` 0.45)과 같아야 한다.**
    ///
    /// ⚠ 예전엔 0.3이 박혀 있었다. 생성은 45%인데 신입생은 30%만 투수라
    /// **세대가 교체될수록 리그가 30%로 수렴한다** — 30명 로스터 기준 투수
    /// 13.5명 → 9명이다. 실측 고교 23/102팀 투수 미달, 프로 구단당 총량 11~13명
    /// (하한 21). 2군에 육성선수를 넣어도 안 풀린 이유가 이것이다.
    /// **상류가 마르면 하류에서 아무리 퍼도 안 찬다.**
    #[serde(default)]
    pub pitcher_ratio: f64,
    /// 재능 분포. **정본은 `generation_rules.json`의 `talentRules`다.**
    ///
    /// ⚠ 예전엔 `potential_hidden`이 `ovr_max * 1.15` **고정값**이었다 —
    /// 난수가 없어 고교 신입생 1,020명이 매년 전원 같은 천장(80.5)을 가졌다.
    /// **파이프라인 전체에 재능 편차가 없으니 새 에이스가 안 나온다.**
    /// 창단 KBL 세대(92~99)가 은퇴하면 그 자리를 아무도 못 채웠다 —
    /// 실측 6시즌 OVR 상위25% 89.3 → 82.1, 분산 22.0 → 10.7.
    #[serde(default)]
    pub talent: Option<TalentRulesPayload>,
    /// 이름 풀. **없으면 내장 한국식 풀이 나온다.**
    ///
    /// ⚠ 해외 리그 신인 배정(`generateOverseasIntakeV3`)이 이걸 안 넘겨서
    /// **ABL·JBL 941명 중 931명이 한국 이름**이었다(실측). 나고야 팀에
    /// "김우찬"이 뛰었다. 정본은 `generation_rules.json rosterRules[리그].namePool`.
    #[serde(default)]
    pub name_pool: Option<crate::roster_gen::NamePool>,
}

/// `tuning::TalentRules`의 직렬화 형태. 필드가 빠지면 그 항목만 폴백을 쓴다.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TalentRulesPayload {
    #[serde(default)] pub potential_mult_min: Option<f64>,
    #[serde(default)] pub potential_mult_max: Option<f64>,
    #[serde(default)] pub tail_rate: Option<f64>,
    #[serde(default)] pub tail_potential_mult_min: Option<f64>,
    #[serde(default)] pub tail_potential_mult_max: Option<f64>,
    #[serde(default)] pub tail_dev_rate_min: Option<f64>,
    #[serde(default)] pub tail_dev_rate_max: Option<f64>,
}

impl TalentRulesPayload {
    pub fn resolve(this: Option<&Self>) -> crate::tuning::TalentRules {
        let d = crate::tuning::TalentRules::default();
        match this {
            None => d,
            Some(p) => crate::tuning::TalentRules {
                pot_mult_min:      p.potential_mult_min.unwrap_or(d.pot_mult_min),
                pot_mult_max:      p.potential_mult_max.unwrap_or(d.pot_mult_max),
                tail_rate:         p.tail_rate.unwrap_or(d.tail_rate),
                tail_pot_mult_min: p.tail_potential_mult_min.unwrap_or(d.tail_pot_mult_min),
                tail_pot_mult_max: p.tail_potential_mult_max.unwrap_or(d.tail_pot_mult_max),
                tail_dev_min:      p.tail_dev_rate_min.unwrap_or(d.tail_dev_min),
                tail_dev_max:      p.tail_dev_rate_max.unwrap_or(d.tail_dev_max),
            },
        }
    }
}

// ── 드래프트 관련 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftPick {
    pub round: i32,
    pub pick: i32,
    pub team_id: String,
    pub npc_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSimResult {
    pub year: i32,
    pub picks: Vec<DraftPick>,
    pub undrafted_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistDraftOutcome {
    pub drafted: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub round: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pick: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub team_id: Option<String>,
    /// 점수 내역. **어느 항이 결과를 미는지 재기 위한 것**이다.
    ///
    /// 항이 여섯이라 합만 보면 못 고친다 — 실제로 백분위가 다 먹고 있는데
    /// 대회 항을 만지는 식의 헛수고를 이걸 안 싣고 여러 번 했다.
    /// 화면은 안 읽는다(조사·검사 전용).
    pub breakdown: DraftScoreBreakdown,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftScoreBreakdown {
    /// 또래 대비 백분위 0~100
    pub percentile: f64,
    /// OVR 정규화 0~100
    pub ovr_norm: f64,
    /// 둘의 가중평균
    pub base: f64,
    pub ace_bonus: f64,
    pub tour_adj: f64,
    pub award_adj: f64,
    pub scout_adj: f64,
    pub injury_pen: f64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedNpcMeta {
    pub npc_id: String,
    pub pro_potential_tier: String,
}

/// 팀이 무엇이 모자란가. 호출부가 1군+2군을 합쳐 센다 —
/// 지명자는 대부분 2군에서 시작하므로 조직 전체로 봐야 한다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamNeed {
    /// 투수가 하한보다 몇 명 모자란가 (0이면 충분하다)
    #[serde(default)]
    pub pitchers: i32,
    /// 야수가 하한보다 몇 명 모자란가
    #[serde(default)]
    pub batters: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DraftSimParams {
    pub candidates: Vec<NpcSaveState>,
    pub named_metas: Vec<NamedNpcMeta>,
    pub year: i32,
    pub rounds: i32,
    pub team_ids: Vec<String>,
    /// 팀별 부족 보직 — `teamId -> (투수부족, 야수부족)`. 없으면 팀 사정을 안 본다.
    ///
    /// 🔴 예전엔 팀 ID만 받아서 **팀이 뭐가 모자란지 전혀 몰랐다.** 야수가
    /// 10명인 팀도 최고점 투수가 남아 있으면 그 투수를 뽑았다. 트레이드는
    /// 포지션을 보는데(a_cnt >= 3 && b_cnt <= 1) 드래프트만 안 봤다.
    #[serde(default)]
    pub team_needs: std::collections::HashMap<String, TeamNeed>,
    /// 부족 보직 가점. 0이면 예전 그대로다.
    ///
    /// ⚠ **능력치를 뒤집지 않을 만큼만 준다.** 지명자 점수 폭이 18.2이고
    /// 라운드 노이즈가 최대 ±3이다. 나이 프리미엄을 +26까지 올렸다가
    /// **OVR 55(19세)가 1순위, OVR 82(26세)가 미지명**이 된 적이 있다.
    #[serde(default)]
    pub need_bonus: f64,
    /// 가점이 최대가 되는 부족 인원. 0이면 1명만 벗어나도 최대다.
    ///
    /// ⚠ **없으면 가점이 항상 최대로 붙는다.** 실측: 목표 비율에서 한 명만
    /// 벗어나도 부족 판정이 나는데 조직이 68명이라 정확히 맞는 팀이 없다 —
    /// **부족팀 지명 110회 중 110회가 부족 보직**이었다(충족률 100%).
    /// 능력치 차이를 항상 이기면 "업사이드 프리미엄 +26" 때와 같은 결과가 된다.
    #[serde(default)]
    pub need_saturation: f64,
    /// 지명 대상 풀 = 지명 수 × 이 배수. 정본은
    /// `generation_rules.json`의 `draftRules.boardCandidateMultiplier`다.
    /// 없으면 2 (110지명이면 220명이 경쟁한다)
    #[serde(default = "default_pool_multiplier")]
    pub pool_multiplier: usize,
}

fn default_pool_multiplier() -> usize { 2 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyDraftParams {
    pub npcs: Vec<NpcSaveState>,
    pub result: DraftSimResult,
    #[serde(default)]
    pub university_team_ids: Vec<String>,
    #[serde(default)]
    pub independent_team_ids: Vec<String>,
    /// 프로 2군 팀. **방출자·미계약 FA가 갈 첫 자리다** — 없으면 2군은
    /// 드래프트 하위 라운드로만 채워져 투수가 마른다(실측 야수 29/투수 6)
    #[serde(default)]
    pub farm_team_ids: Vec<String>,
    /// 신인 계약 (generation_rules.json draftRules.contract).
    /// 없으면 계약이 안 붙는다 — 신인이 연봉 0으로 시작한다
    #[serde(default)]
    pub contract: Option<crate::draft::DraftContractRules>,
    /// 이 라운드 이하 지명자는 1군에서 시작한다 (draftRules.firstTeamRounds).
    /// 0이면 전원 2군
    #[serde(default)]
    pub first_team_rounds: i32,
    /// 팀 예산 지수 (팀 예산 / 리그 평균). 계약금에 곱한다
    #[serde(default)]
    pub team_index: std::collections::HashMap<String, f64>,
    /// 미지명자 진로 배정 상한 (rosterRules에서 온다)
    #[serde(default)]
    pub placement: Option<crate::draft::PlacementRules>,
    /// 방출 2단계 (faRules.release). 없으면 1단계(정원 초과)만 돈다
    #[serde(default)]
    pub release_rules: Option<crate::free_agency::ReleaseRules>,
    /// 연봉 산식. 독립리그로 배정되는 사람의 연봉을 여기서 낸다.
    /// 없으면 연봉 0으로 들어간다 — 그러면 같은 리그 안에 연봉 있는 사람과
    /// 없는 사람이 섞이고, 팀 평균이 눌려 과지급 판정이 죽는다
    #[serde(default)]
    pub salary_rules: Option<crate::npc_sim::SalaryRules>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistDraftParams {
    pub scout_score: f64,
    pub pitching_ovr: f64,
    pub year: i32,
    pub team_ids: Vec<String>,
    /// **같은 해 지명 대상 투수들의 OVR.** 드래프트는 절대값이 아니라
    /// 상대평가다 — 세계 전력이 바뀌어도 "리그에서 몇 번째냐"는 안 흔들린다.
    /// 비어 있으면 백분위를 못 내므로 OVR을 그대로 백분위로 쓴다(폴백).
    #[serde(default)]
    pub peer_ovrs: Vec<f64>,
    /// 팀 투수 중 내 순위 (1 = 에이스). 없으면 보정 없음
    #[serde(default)]
    pub team_ace_rank: Option<i32>,
    /// **고교 한 시즌 평균** 대회 점수. 미진출 10 · 4강 30 · 준우승 60 · 우승 100
    /// (거기에 시즌 수상 1개당 +15).
    ///
    /// ⚠ 예전엔 "0~100, 50이 평범"이라 적어 놓고 TS가 **3시즌 합계**를 넘겼다.
    /// 게다가 그 합계를 만드는 `calcHsBaseballScore`가 `careerRecords`를 읽는데
    /// 그게 **항상 비어 있어서**(결산 모달을 열어야만 쌓였다) 실제로는 늘 0이
    /// 넘어왔다 — 전원이 `(0-50)*0.3 = -15`를 똑같이 먹는, 아무것도 가르지
    /// 못하는 항이었다.
    #[serde(default)]
    pub tournament_score: Option<f64>,
    /// 고교 3년간 받은 **부문상** 수 (MVP 제외)
    #[serde(default)]
    pub award_titles: Option<i32>,
    /// 고교 3년간 받은 **MVP** 수
    #[serde(default)]
    pub award_mvps: Option<i32>,
    /// 중등도 부상 — 염증·햄스트링·뇌진탕 류. 흔하고 잘 낫는다
    ///
    /// ⚠ 예전엔 `major_injuries` 하나로 **중등도부터 수술까지 뭉뚱그려**
    /// 건당 -12를 먹였다. 상한도 없어서 실측 감점이 **-252**까지 갔고
    /// (`clamp` 때문에 그냥 0점), 팔꿈치 염증 두 번이 UCL 파열과 같은 무게였다.
    /// 실측 30커리어 중 6명이 이 항 하나로 미지명이었다.
    #[serde(default)]
    pub moderate_injuries: Option<i32>,
    /// 중상 — UCL 부분파열·회전근 손상·허리 디스크·입스
    #[serde(default)]
    pub severe_injuries: Option<i32>,
    /// 수술 — 스카우트가 제일 무겁게 보는 것
    #[serde(default)]
    pub surgery_injuries: Option<i32>,
}

// ── 체육부대 선발 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitCandidate {
    pub id: String,
    pub name: String,
    pub ovr: f64,
    pub team_id: String,
    pub position: String,
    pub is_protagonist: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitCandidatesParams {
    pub candidates: Vec<SportsUnitCandidate>,
    pub top_n: usize,   // 30
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitCandidatesResult {
    pub top_candidates: Vec<SportsUnitCandidate>,
    pub protagonist_rank: Option<usize>,  // 1-based, None이면 30위 밖
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitSelectionParams {
    pub applicants: Vec<SportsUnitCandidate>,
    pub max_total: usize,      // 10
    pub max_per_team: usize,   // 3
    /// 그해 전역하는 사람들의 포지션 — Phase 1이 그 자리를 먼저 채운다.
    ///
    /// 🔴 비어 있으면 **Phase 1이 통째로 안 돌고** OVR 순으로만 뽑는다.
    ///    호출부가 `&[]`를 넘기고 있어서 그러했다 — 상무가 포지션
    ///    균형을 잃고 유격수 없는 팀이 된다.
    #[serde(default)]
    pub vacating_positions: Vec<String>,
    /// Phase 1(공백 포지션 채우기)이 정원에서 **가져갈 수 있는 몫**.
    ///
    /// 🔴 없으면 Phase 1이 **정원을 전부 먹고 Phase 2가 한 번도 안 돈다.**
    ///    상무 정원 26 / 복무 2년이라 매년 전역자가 정원(13)과 같아서
    ///    구조적으로 그렇게 된다 — 실측(8시즌) 전역자 포지션이
    ///    1 → 17 → 21 → 13 → 13건이었고 첫 해 말고는 늘 정원 이상이었다.
    ///
    /// ⚠ 그러면 `max_per_team`(팀당 3명)도 같이 죽는다 — 그 가드는 Phase 2에만
    ///   있고 Phase 1은 팀을 안 본다. 한 팀에서 열 명이 가도 안 막혔다.
    ///
    /// ⚠ `None`이면 **예전 동작**(상한 없음)이다. 호출부가 값을 안 넘겨도
    ///   게임이 안 죽는다 — 배선이 빠지면 옛 결함으로 조용히 돌아간다.
    ///   정본은 `militaryRules.phase1Ratio`다.
    #[serde(default)]
    pub phase1_max: Option<usize>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SportsUnitSelectionResult {
    pub protagonist_selected: bool,
    pub selected_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickGeneralEnlisteesParams {
    pub ids: Vec<String>,
    pub max_count: usize,
    pub seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PickGeneralEnlisteesResult {
    pub selected_ids: Vec<String>,
}

// ── 조기 입대 자발적 선택 ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EarlyEnlistCandidate {
    pub id: String,
    pub age: u32,
    pub ovr_rank_pct: f64,     // 0=최하위, 1=최상위 (리그 내 상대적 위치)
    pub playing_time_pct: f64, // 0=출장 없음, 1=전경기 출장
    pub contract_years_left: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcEarlyEnlistParams {
    pub candidates: Vec<EarlyEnlistCandidate>,
    pub seed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalcEarlyEnlistResult {
    pub early_enlist_ids: Vec<String>,
}

// ── 드래프트 보드 타입 제거됨 (2026-08-12) ───────────────────────
//
// DraftBoardCandidate / DraftBoardPick / DraftBoardParams /
// DraftBoardResult — run_draft_board 전용이었고 그 함수를 지웠다
// (npc_sim.rs의 제거 주석 참고).
//
// TS 쪽 DraftBoardPick은 남아 있다. 이름은 같지만 다른 것이다 —
// 그건 processNpcDraft가 남긴 지명 로그를 화면이 읽는 타입이다.

// ── 게임 시뮬 파라미터 ────────────────────────────────────────────────────────

fn default_stamina_cap() -> f64 { 60.0 }
fn default_one() -> i32 { 1 }
fn default_potential() -> f64 { 75.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimPitcher {
    pub id: String,
    pub velocity: f64,
    pub movement: f64,
    pub command: f64,
    pub control: f64,
    pub stamina: f64,
    #[serde(default = "default_stamina_cap")]
    pub stamina_cap: f64,
    /// 위기 집중력. **없으면 50(무보정)** — 구 페이로드·감사 스크립트 호환
    #[serde(default = "default_neutral_stat")]
    pub clutch: f64,
    #[serde(default = "default_neutral_stat")]
    pub mentality: f64,
    /// 견제력 — 도루 시도를 누른다. 없으면 50(무보정)
    #[serde(default = "default_neutral_stat")]
    pub hold_runners: f64,
}

pub(crate) fn default_neutral_stat() -> f64 { 50.0 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimBatter {
    pub id: String,
    /// 수비 포지션 — **도루 저지에 포수를 찾는 데 쓴다.**
    ///
    /// ⚠ 없으면 빈 문자열이라 포수를 못 찾고 중립(50)이 된다.
    ///   `match_engine`은 `fielders`로 포수를 찾는데 리그 시뮬엔 그게 없었다 —
    ///   **두 모델이 다른 척도를 쓰면 주인공 기록과 리그 기록이 갈린다**
    ///   (`match_engine`의 도루 주석이 같은 함정을 적어 뒀다).
    #[serde(default)]
    pub position: String,
    /// 송구. 포수일 때 도루 저지에 걸린다. 없으면 50(중립)이다
    #[serde(default = "default_neutral_stat")]
    pub arm: f64,
    /// 번트 — 희생번트 성공률. 없으면 50(중립).
    /// 🔴 성장 엔진엔 있는데 **경기에 안 오고 있던 값**이다
    #[serde(default = "default_neutral_stat")]
    pub bunting: f64,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
    /// 승부처 집중력. 없으면 50(무보정)
    #[serde(default = "default_neutral_stat")]
    pub batting_clutch: f64,
    /// 주력·주루 판단 — **도루에 쓴다.**
    ///
    /// ⚠ 능력치는 처음부터 `BattingAttributes`에 있었는데 리그 시뮬이 안 받아서
    /// `sb: 0`이 하드코딩돼 있었다. 없으면 50(평균)이라 구 페이로드는
    /// 도루가 거의 안 나온다 — 값이 0으로 떨어져 이상해지는 것보다 낫다.
    #[serde(default = "default_neutral_stat")]
    pub speed: f64,
    #[serde(default = "default_neutral_stat")]
    pub base_instinct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimPlayerCondition {
    pub fatigue: f64,
    pub last_pitched_week: i32,
    pub pitch_outs_last: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimGameParams {
    /// 세계 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// 🔴 **TS는 이미 `worldSeed`·`scheduleId`를 넘기고 있었다**
    ///    (`gameSimulator.ts`). 근데 이 구조체가 그 둘을 안 받아서
    ///    serde가 조용히 버렸다 — NPC 경기가 실행마다 다른 결과를 냈고,
    ///    그 성적이 순위·은퇴·방출·FA·연봉까지 번졌다.
    #[serde(default)]
    pub world_seed: u32,
    /// 경기 식별자 — 씨앗에 섞어 **경기마다 다른 수열**을 만든다.
    /// 안 섞으면 같은 주의 모든 경기가 같은 난수를 받는다.
    #[serde(default)]
    pub schedule_id: String,
    pub home_rotation: Vec<SimPitcher>,
    pub away_rotation: Vec<SimPitcher>,
    pub home_bullpen: Vec<SimPitcher>,
    pub away_bullpen: Vec<SimPitcher>,
    pub home_closer: Option<SimPitcher>,
    pub away_closer: Option<SimPitcher>,
    pub home_lineup: Vec<SimBatter>,
    pub away_lineup: Vec<SimBatter>,
    pub home_rot_idx: usize,
    pub away_rot_idx: usize,
    pub conditions: HashMap<String, SimPlayerCondition>,
    pub week: i32,
    pub home_team_id: String,
    pub away_team_id: String,
}

// ── 게임 시뮬 결과 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "role")]
pub enum PlayerGameLine {
    #[serde(rename = "pitcher")]
    Pitcher {
        #[serde(rename = "playerId")]
        player_id: String,
        ip: f64,
        er: i32,
        h: i32,
        /// 피홈런. **엔진은 처음부터 홈런을 따로 만들었는데 안 세고 있었다**
        /// (2026-08-28). KBO 투수 표의 HR 칸이다.
        /// ⚠ `default`다 — 구 세이브의 로그엔 없다.
        #[serde(default)]
        hr: i32,
        k: i32,
        bb: i32,
        /// 사구 — 볼넷과 **다른 사건**이다. ⚠ 구 세이브 로그엔 없다
        #[serde(default)]
        hbp: i32,
        pc: i32,
        decision: String,
        /// **선발 등판인가.** 화면 넷이 GS(선발)를 표시하는데 이 값이 없어서
        /// `accumulateStats`가 올릴 근거가 없었다 — 전원 0이었다.
        /// ⚠ `default`다: 구 세이브의 로그엔 없다
        #[serde(default)]
        gs: bool,
        /// 득점권 피안타율 — 위기 보정이 성적을 만드는지 보여주는 유일한 창구다.
        /// 시즌 ERA로는 못 본다(득점권은 전체 타석의 25%뿐이라 희석된다).
        #[serde(rename = "rispAb", default)]
        risp_ab: i32,
        #[serde(rename = "rispH", default)]
        risp_h: i32,
    },
    #[serde(rename = "batter")]
    Batter {
        #[serde(rename = "playerId")]
        player_id: String,
        ab: i32,
        h: i32,
        /// 2루타·3루타. **안타 하나로 뭉개고 있었다** — 그래서 SLG가
        /// `(h + hr*3)/ab`라는 근사였다(장타를 단타로 셌다).
        /// ⚠ `default`다 — 구 세이브의 로그엔 없다.
        #[serde(default)]
        b2: i32,
        #[serde(default)]
        b3: i32,
        hr: i32,
        /// 득점 — **홈을 밟은 사람 것**이다. 타점(rbi)과 다르다.
        #[serde(default)]
        r: i32,
        /// 사구·희생번트·희생플라이 — **셋 다 타수가 아니다.**
        /// 타석(PA)과 출루율(OBP) 식이 이 값들을 봐야 한다.
        /// ⚠ 구 세이브 로그엔 없다.
        #[serde(default)]
        hbp: i32,
        #[serde(default)]
        sac: i32,
        #[serde(default)]
        sf: i32,
        rbi: i32,
        bb: i32,
        k: i32,
        sb: i32,
        /// 득점권 타율 — 투수 쪽과 짝이다
        #[serde(rename = "rispAb", default)]
        risp_ab: i32,
        #[serde(rename = "rispH", default)]
        risp_h: i32,
        /// 수비 기록 — 실책·보살·자살. **선수별로 한 건도 안 쌓이고 있었다**
        /// (2026-08-29). 골든글러브의 근거다.
        /// ⚠ `default`다 — 구 세이브 로그엔 없다.
        #[serde(default)] e: i32,
        #[serde(default)] a: i32,
        #[serde(default)] po: i32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchResult {
    pub home_score: i32,
    pub away_score: i32,
    pub winner_id: String,
    /// 🔴 **무승부면 `None`이다** (2026-08-29). 예전엔 `String`이라 동점이
    /// 나도 한쪽이 패자로 적혔다 — TS는 처음부터 `loserId: string | null`로
    /// 무승부를 기다리고 있었는데 Rust가 null을 못 보냈다.
    pub loser_id: Option<String>,
    pub player_lines: Vec<PlayerGameLine>,
    pub events: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SimGameResult {
    pub result: MatchResult,
    pub next_home_rot_idx: i32,
    pub next_away_rot_idx: i32,
    pub pitcher_conditions: HashMap<String, SimPlayerCondition>,
}

// ── 주인공 학년 진급 결과 ─────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistGradeResult {
    pub new_grade: serde_json::Value,
    pub is_graduating: bool,
}

/// 웨이버 공시 규칙. **없으면 안 돈다** — 예전 동작이다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WaiverRules {
    #[serde(default)]
    pub enabled: bool,
    /// 그 팀 최약체보다 이만큼 나으면 데려간다 (음수면 조금 못해도)
    #[serde(default)]
    pub ovr_margin: f64,
    /// 한 팀이 한 오프시즌에 데려갈 최대 인원
    #[serde(default)]
    pub max_per_team: i32,
}

// ── 오프시즌 입력 ────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OffseasonParams {
    /// 세계 씨앗. **오프시즌 난수의 뿌리다** — 없으면 0이라 모든 세계가
    /// 같은 전개를 낸다. 연도와 섞어 해마다 다른 수열을 만든다.
    #[serde(default)]
    pub world_seed: u32,
    pub npcs: Vec<NpcSaveState>,
    /// 웨이버 공시. ⚠ `serde(default)` 라 **안 넘겨도 통과한다** —
    /// 그래서 배선 검사가 TS 가 넘기는지 따로 본다.
    #[serde(default)]
    pub waiver_rules: Option<WaiverRules>,
    pub pending_draft: Vec<NpcSaveState>,
    pub season_year: i32,
    // TS에서 FA/은퇴 결정을 완료한 named NPC ID 목록 — Rust FA 로직 스킵 대상
    #[serde(default)]
    pub named_npc_ids: Vec<String>,
    /// 연봉 규칙 (generation_rules.json salaryRules). 안 넘어오면 폴백을 쓴다 —
    /// 규칙 누락이 연봉을 0으로 만들어 세이브를 망가뜨리지 않게
    #[serde(default)]
    pub salary_rules: Option<crate::npc_sim::SalaryRules>,
    /// 팀당 유지 인원 상한 (generation_rules.json rosterRules[리그]).
    /// 안 넘어오면 상한 자체가 없어 로스터가 무한히 부푼다
    #[serde(default)]
    pub roster_limits: std::collections::HashMap<String, crate::npc_sim::RosterLimit>,
    /// 방출·FA 미계약자가 갈 곳. 안 넘어오면 그 사람들은 전부 은퇴 처리된다
    #[serde(default)]
    pub university_team_ids: Vec<String>,
    #[serde(default)]
    pub independent_team_ids: Vec<String>,
    /// 프로 2군 팀. **방출자·미계약 FA가 갈 첫 자리다** — 없으면 2군은
    /// 드래프트 하위 라운드로만 채워져 투수가 마른다(실측 야수 29/투수 6)
    #[serde(default)]
    pub farm_team_ids: Vec<String>,
    #[serde(default)]
    pub placement: Option<crate::draft::PlacementRules>,
    /// 방출 2단계 (faRules.release). 없으면 1단계(정원 초과)만 돈다
    #[serde(default)]
    pub release_rules: Option<crate::free_agency::ReleaseRules>,
    /// **독립리그 재도전 나이 상한** (`faRules.independentAgeMax`).
    ///
    /// FA 미계약자가 원소속 재계약도 못 하면 이 나이 이하일 때만 독립으로
    /// 간다 — 넘으면 은퇴다.
    /// ⚠ `None`이면 갈래가 **통째로 꺼진다**(예전 동작: 바로 은퇴).
    #[serde(default)]
    pub fa_independent_age_max: Option<i32>,
    /// 🔴 **그해 성적 평점** (npcId → 0~100). 없으면 능력치로 떨어진다.
    ///
    /// 방출 판정이 `recent_performance_rating`에 능력치를 넣고 있었다 —
    /// "오프시즌엔 시즌 기록이 이미 정산돼 넘어오지 않는다"고 적혀 있었는데,
    /// 실제로는 **호출부 바로 위에서 같은 값을 쓰고 있었다**(seasonRollover가
    /// `leagueState[리그].stats`를 연감에 넘긴다). 안 넘어온 것뿐이다.
    ///
    /// 눈금은 `market.ts`의 `calcNpcPerfScore`가 정본이다 —
    /// 투수 ERA 2.50=80 · 4.00=50 · 6.00=10 / 타자 OPS .900=85 · .700=50.
    /// 기준선 50이 `eval_release_priority`의 `50 - rating`과 같은 눈금이다.
    /// 표본 미달(투수 5이닝·타자 30타수)이면 그 함수가 50(중립)을 준다.
    #[serde(default)]
    pub perf_scores: std::collections::HashMap<String, f64>,
    /// 구단 성향 (teamId → 12축). 없으면 전 팀이 `default()`(전 항목 50)다.
    ///
    /// `eval_release_priority`가 이미 쓰고 있는데 오프시즌이 `default()`를
    /// 넘겨 **한 번도 발동한 적이 없었다** — 어느 구단이든 방출 기준이 같았다:
    ///
    ///     if profile.stability > 70 && age >= 30 { score -= 10 }
    ///     if profile.win_now_pressure > 80 { score *= 1.3 }
    #[serde(default)]
    pub team_profiles: std::collections::HashMap<String, ProTeamProfile>,
    /// 팀별 연봉 상한 (만원). 팀 예산에서 유도한다 — 없으면 입찰이 안 돈다.
    #[serde(default)]
    pub team_payroll_cap: std::collections::HashMap<String, i64>,
    /// FA 입찰 성립 임계값. 0이면 **입찰을 안 하고 예전대로 아무 팀에나 배정**한다.
    ///
    /// 🔴 예전엔 FA 재배치가 "정원 여유가 있는 팀 아무 데나"였다 —
    /// 구단이 원하는지·얼마를 줄지·선수가 받아들일지가 전부 빠져 있었고
    /// **미계약이 0건**이었다(실측 5시즌). 구단 입찰 판정(`eval_fa_bid`)은
    /// 구현돼 있는데 아무도 안 불렀다.
    ///
    /// ⚠ `interest_level`은 기본 50에서 시작한다 — 아무 이유가 없어도 50이다.
    #[serde(default)]
    pub fa_bid_interest_min: f64,
    /// FA 성적 배수의 폭 (`faRules.perfSpan`). 0이면 성적을 안 본다 — 예전 동작.
    ///
    /// 적용은 `1 + (score/50 - 1) * span`이다. span 0.3이면 성적 0점이 0.7배·
    /// 50점이 1.0배·100점이 1.3배다.
    ///
    /// ⚠ **재계약에는 안 걸린다.** 구단이 불러 압도하는 재계약과 시장이 값을
    ///   매기는 FA는 다른 자리다.
    #[serde(default)]
    pub fa_perf_span: f64,
    /// 재계약 성적 배수의 폭 (`faRules.renewPerfSpan`). 0이면 성적을 안 본다.
    ///
    /// ⚠ **FA보다 좁아야 한다.** 구단이 불러 압도하는 자리라 시장보다
    ///   보수적이어야 한다. 같거나 크면 FA를 갈 이유가 없어진다.
    #[serde(default)]
    pub renew_perf_span: f64,
    /// FA 입찰 상한의 **하한** (`faRules.bidFloorRatio`). 팀 총연봉에 곱한다.
    ///
    /// 🔴 **상한이 음수가 되는 팀이 있었다**(2026-08-24 실측). 상한은
    ///   `잔여예산 × 0.35`인데 잔여예산은 `총연봉 × 지수 × 1.25 - 총연봉`이라
    ///   **예산 지수가 0.8 미만이면 음수**다. 그러면 `.max(1500)`이 걸려
    ///   그 구단은 매년 최저액만 부르고 FA를 영영 못 잡는다.
    ///   대전 팬텀스(지수 0.515)가 3시즌 내내 상한 -2.4억이었다.
    ///
    /// ⚠ `.max(1500)`은 **의도가 아니라 우연**이었다 — 음수를 막으려 둔
    ///   바닥이 "가난한 구단의 정책"으로 굳어 있었다.
    ///
    /// 0이면 하한이 없다 — 예전 동작.
    #[serde(default)]
    pub fa_bid_floor_ratio: f64,
    /// 외국인 보유 한도가 걸리는 리그 (generation_rules.json `foreignRules.leagues`).
    /// 비면 외국인 개념이 없는 세계 — 구 세이브·구 페이로드가 그렇다
    #[serde(default)]
    pub foreign_leagues: Vec<String>,
    /// 리그별 자국 국적 (`rosterRules[리그].nationality`, 없으면 KOR).
    ///
    /// ⚠ **외국인은 국적이 아니라 리그 기준 상대 개념이다.** `!= "KOR"`로 보면
    /// ABL(USA)·JBL(JPN) 로스터 전원이 외국인이 된다
    #[serde(default)]
    pub home_nationality: std::collections::HashMap<String, String>,
    /// 팀당 외국인 보유 한도 (`foreignRules.perTeam`). 없으면 한도 없음.
    ///
    /// 🔴 **FA 재배치가 이걸 안 봤다.** 정원(로스터 상한)만 보고 붙여서
    /// ABL·JBL 출신 FA가 KBL 팀에 쌓였다 — 실측 총원 113명(규칙대로면 30명).
    #[serde(default)]
    pub foreign_per_team: Option<i32>,
    /// 팀당 외국인 **투수** 한도 (`foreignRules.maxPitchers`)
    #[serde(default)]
    pub foreign_max_pitchers: Option<i32>,
}

// ── 학년 진급 입력 ───────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdvanceGradesParams {
    pub npcs: Vec<NpcSaveState>,
    pub season_year: i32,
}

// ── 주인공 학년 입력 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistGradeParams {
    pub current_grade: i32,
    pub current_age: i32,
}

// ── NPC 월간 성장 타입 ────────────────────────────────────────────────────────

/// 팀 환경 정보 (시설·감독·코치)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcTeamContext {
    pub team_id: String,
    pub facility_tier: String,       // "1군"|"2군"|"고교"|"대학"|"독립"
    /// 무대별 성장 계수. **정본은 `generation_rules.json`의
    /// `growthRules.facilityFactor`**이고 TS가 그 값을 넘긴다.
    /// 없으면 아래 폴백 표를 쓴다 (구 호출부 호환)
    #[serde(default)]
    pub facility_factor: Option<f64>,
    pub manager_development: f64,    // 0~99
    pub coach_teaching: f64,         // 0~99
}

/// 나이 구간별 성장 계수 한 칸 — `maxAge` 이하에 `f`를 적용
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgeGrowthBand {
    pub max_age: i32,
    pub f: f64,
}

/// NPC 성장 속도 규칙.
///
/// ⚠ **정본은 `generation_rules.json`의 `growthRules.xp`다.**
/// 예전엔 이 수치가 전부 Rust에 박혀 있었고, 그 값으로는 17세 유망주가
/// 스탯 하나를 +1 올리는 데 **85주**가 걸렸다 — 고교 3년을 다 뛰어도
/// OVR이 1도 안 올랐다. 반면 30세 감퇴는 정상 작동해서, 세계 평균이
/// 매년 내려앉았다(1군 상위 88 → 81 → 77).
///
/// 투수와 타자에 배율을 따로 두는 이유: XP 배분 가중치가 커버하는 OVR
/// 비중이 다르다. 투수는 12 중 8.5(velocity·command·control·movement),
/// 타자는 11.8 중 6.6(contact·eye·speed·power)이라 같은 XP로도 투수가
/// 더 오른다. 같은 목표 곡선에 맞추려면 배율이 달라야 한다.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthXpRules {
    pub multiplier_pitcher: f64,
    pub multiplier_batter: f64,
    /// 오름차순이어야 한다 — 첫 번째로 `age <= max_age`인 칸을 쓴다
    pub age_bands: Vec<AgeGrowthBand>,
    /// 경기 기록이 없는 선수의 성적 계수.
    ///
    /// 배경 NPC는 대부분 경기 라인에 안 올라 여기 걸린다. 예전 값 **0.40**은
    /// "출전 못 하면 훈련도 무의미"에 가까웠고, 오프시즌 가중치 0.20과
    /// 겹치면 0.08까지 떨어졌다 — 리그 전체 성장이 목표의 1/4로 눌린
    /// 주된 이유다.
    #[serde(default)]
    pub no_perf_base: Option<f64>,
    /// 단계별 성적 가중치. `training_factor`는 오프시즌을 1.50으로 밀어주는데
    /// 여기가 0.20이면 서로 상쇄된다 — 오프시즌은 원래 훈련기다.
    #[serde(default)]
    pub phase_weight: Option<PhaseWeights>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhaseWeights {
    pub offseason: f64,
    pub preseason: f64,
    pub postseason: f64,
    pub season: f64,
}

/// 이전 달 경기 성적
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcMonthlyPerf {
    pub games_played: i32,
    pub era: Option<f64>,
    pub batting_avg: Option<f64>,
}

/// 월간 성장 계산 입력 단위 (모든 선수 NPC 동일 구조)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcLiveInput {
    pub npc_id: String,
    pub team_id: String,
    pub player_type: String,   // "pitcher" | "batter"
    pub age: i32,
    pub development_rate: i32,
    pub potential_hidden: Option<f64>,  // 60~99; None → 75
    pub pitching: Option<NpcPitchingAttrs>,
    pub batting: Option<NpcBattingAttrs>,
    #[serde(default)]
    pub pitching_xp: HashMap<String, f64>,
    #[serde(default)]
    pub batting_xp: HashMap<String, f64>,
    pub peak_ovr: Option<f64>,
    #[serde(default)]
    pub current_fame: f64,
    #[serde(default)]
    pub pitches: Vec<NpcPitchEntry>,
    #[serde(default)]
    pub pitcher_role: String,   // "SP" | "RP" | "CP"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_in_training: Option<NpcPitchTraining>,
    /// 스탯별 **미반영 노화 누적분**.
    ///
    /// ⚠ 이게 없던 시절 노화는 **전 연령에서 통째로 사라졌다.** 감퇴를
    /// 스탯에서 직접 빼는데 `clamp_stat`이 매번 `round()`를 하고, 주당
    /// 감퇴량은 연 2.5를 52로 나눈 **0.048**이라 75 − 0.048 = 74.95 →
    /// 75로 되돌아갔다. 35세 투수를 52주 굴려도 스탯이 하나도 안 변했다.
    /// 성장은 XP를 쌓아 임계값에서 +1 하므로 멀쩡했는데 노화만 이랬다.
    ///
    /// 이제 성장과 대칭으로 **1.0을 넘을 때 −1**을 적용한다.
    #[serde(default)]
    pub aging_debt: HashMap<String, f64>,
}

/// 월간 성장 계산 출력 단위
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcLiveOutput {
    pub npc_id: String,
    pub pitching: Option<NpcPitchingAttrs>,
    pub batting: Option<NpcBattingAttrs>,
    pub pitching_xp: HashMap<String, f64>,
    pub batting_xp: HashMap<String, f64>,
    pub peak_ovr: f64,
    #[serde(default)]
    pub fame_delta: f64,
    #[serde(default)]
    pub pitches: Vec<NpcPitchEntry>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pitch_in_training: Option<NpcPitchTraining>,
    /// 미반영 노화 누적분 — 다음 주에 그대로 되돌려 받는다
    #[serde(default)]
    pub aging_debt: HashMap<String, f64>,
}

/// 월간 성장 전체 파라미터
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyNpcGrowthParams {
    /// 판정 씨앗. **0이면 예전 그대로 `thread_rng`다**(구 페이로드 호환).
    ///
    /// ⚠ 성장은 **능력치**를 만들고 능력치가 성적을 만든다 — 씨앗이 없으면
    ///   같은 세이브가 실행마다 다른 리그로 갈라진다.
    #[serde(default)]
    pub seed: u32,
    pub npcs: Vec<NpcLiveInput>,
    pub team_contexts: Vec<NpcTeamContext>,
    #[serde(default)]
    pub perf_data: HashMap<String, NpcMonthlyPerf>,
    pub current_phase: String,   // "preseason"|"season"|"postseason"|"offseason"
    pub month_index: i32,        // 0~11
    #[serde(default)]
    pub pitch_catalog_ids: Vec<String>,
    /// 없으면 Rust 폴백 표를 쓴다 — 정본은 `generation_rules.json`
    #[serde(default)]
    pub xp_rules: Option<GrowthXpRules>,
}

/// 월간 성장 결과
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyNpcGrowthResult {
    pub updated: Vec<NpcLiveOutput>,
}

// ── 팀 프로필 ─────────────────────────────────────────────────────────────────

/// 팀 성향. `Default`는 **전 항목 50(중립)** — 오프시즌 방출 판정처럼
/// 팀별 프로필을 들고 오지 않는 경로에서 쓴다. 0으로 두면 모든 팀이
/// "안정성 0 · 성적압박 0"이 되어 판정이 한쪽으로 쏠린다
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProTeamProfile {
    pub owner_spending_willingness: f64,
    pub stability: f64,
    pub development_focus: f64,
    pub discipline: f64,
    pub owner_patience: f64,
    pub win_now_pressure: f64,
    pub scouting_quality: f64,
    pub prestige: f64,
    pub market_appeal: f64,
    pub clubhouse_culture: f64,
    pub medical_quality: f64,
    pub farm_investment: f64,
}

impl Default for ProTeamProfile {
    fn default() -> Self {
        Self {
            owner_spending_willingness: 50.0, stability: 50.0, development_focus: 50.0,
            discipline: 50.0, owner_patience: 50.0, win_now_pressure: 50.0,
            scouting_quality: 50.0, prestige: 50.0, market_appeal: 50.0,
            clubhouse_culture: 50.0, medical_quality: 50.0, farm_investment: 50.0,
        }
    }
}

// ── 선수 성향 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NpcPersonality {
    pub loyalty: f64,
    pub ambition: f64,
    pub greed: f64,
    pub competitive_drive: f64,
    pub stability_preference: f64,
    #[serde(default)]
    pub professionalism: f64,
    pub overseas_ambition: f64,
    pub market_preference: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub home_team_id: Option<String>,
}

// ── 스카우팅 타입 ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingInputPlayer {
    pub player_id: String,
    pub true_ovr: f64,
    pub true_potential: Option<f64>,
    pub true_personality: Option<NpcPersonality>,
    pub fame: f64,
    pub age: i32,
    pub is_own_player: bool,
    pub is_prospect: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutedPlayer {
    pub player_id: String,
    pub scouted_ovr: f64,
    pub scouted_potential: Option<f64>,
    pub scouted_personality: Option<NpcPersonality>,
    pub confidence: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingNoiseParams {
    pub scouting_quality: f64,
    pub players: Vec<ScoutingInputPlayer>,
    pub season_year: u32,
    pub team_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScoutingNoiseResult {
    pub scouted: Vec<ScoutedPlayer>,
}

// ── 팀 엔진 공통 타입 ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterPlayerRef {
    pub id: String,
    pub position: String,
    pub age: i32,
    pub ovr: f64,
    pub salary: i64,
    pub remaining_years: i32,
    pub pro_service_years: i32,
    pub is_prospect: bool,
    pub personality: Option<NpcPersonality>,
    pub fame: f64,
    /// 올 시즌 성적. **승강 판정의 주 입력이다** (사용자 확정 2026-07-30:
    /// "최근 성적 위주 + 능력치 보정"). 표본이 없으면 전부 0이고,
    /// 그때는 `form_score`가 능력치만 보게 된다
    #[serde(default)]
    pub perf: Option<RosterPerf>,
    /// 외국인 선수인가. **1군 전용이라 2군 강등 후보에서 빼야 한다.**
    /// 없으면 false — 구 페이로드는 전원 내국인으로 읽힌다
    #[serde(default)]
    pub is_foreign: bool,
    /// 지금 1군에 등록할 수 있는가. 육성선수는 **입단 연도 5월 전까지** false다.
    ///
    /// ⚠ **2군 정원에는 그대로 센다.** 후보에서만 빼야 한다 — 아예 빼면
    /// 2군이 얇아 보여서 육성선수를 또 만들고, 그게 다음 해에 다시 못 올라간다
    ///
    /// 없으면 true — 정식 등록 선수와 구 페이로드는 전부 등록 가능이다
    #[serde(default = "default_true")]
    pub registrable: bool,
}

fn default_true() -> bool { true }

/// 승강 판정용 시즌 성적. 투수/타자 중 해당 쪽만 채워진다
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RosterPerf {
    #[serde(default)]
    pub games: i32,
    /// 투수
    #[serde(default)]
    pub innings: f64,
    #[serde(default)]
    pub era: f64,
    #[serde(default)]
    pub whip: f64,
    /// 타자
    #[serde(default)]
    pub plate_appearances: i32,
    #[serde(default)]
    pub ops: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TradeAsset {
    pub player_id: String,
    pub team_id: String,
    pub position: String,
    pub age: i32,
    pub ovr: f64,
    pub true_ovr: f64,
    pub salary: i64,
    pub remaining_years: i32,
    pub is_prospect: bool,
    pub personality: Option<NpcPersonality>,
    // 의료 정보 (메디컬 테스트용)
    #[serde(default)]
    pub injury_severity: Option<String>,  // null/"light"/"moderate"/"severe"/"surgery"
    #[serde(default)]
    pub injury_weeks_left: i32,
    #[serde(default)]
    pub career_injury_count: i32,
    #[serde(default)]
    pub has_steroid_history: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FaPlayerRef {
    pub id: String,
    pub position: String,
    pub age: i32,
    pub ovr: f64,
    pub market_value: i64,
    pub demand_salary: i64,
    pub demand_years: i32,
    pub fame: f64,
    pub personality: Option<NpcPersonality>,
    pub pro_service_years: i32,
    pub current_league: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContractOfferResult {
    pub offer_salary: i64,
    pub offer_years: i32,
    pub signing_bonus: i64,
    pub team_option_years: i32,
    pub player_option_years: i32,
    pub no_trade_clause: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamWithRoster {
    pub team_id: String,
    pub league_id: String,
    pub profile: ProTeamProfile,
    pub active_roster: Vec<String>,
    pub farm_roster: Vec<String>,
    pub salary_cap: i64,
    pub current_payroll: i64,
    // 트레이드 컨텍스트
    #[serde(default)]
    pub win_pct: f64,                        // 현재 승률 → buyer/seller 모드 판단
    #[serde(default)]
    pub injured_positions: Vec<String>,      // 부상 중인 포지션 → 긴급 보강 필요
    #[serde(default)]
    pub expiring_contract_ids: Vec<String>,  // 잔여 1년 이하 선수 ID → 선점 트레이드
}
