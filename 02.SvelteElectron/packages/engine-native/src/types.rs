use std::collections::HashMap;
use serde::{Deserialize, Serialize};

// ── 기본 열거형 ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum HalfInning {
    #[serde(rename = "top")] Top,
    #[serde(rename = "bottom")] Bottom,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitcherRole {
    SP, RP, CP,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchType {
    #[serde(rename = "fastball")]   Fastball,
    #[serde(rename = "sinker")]     Sinker,
    #[serde(rename = "cutter")]     Cutter,
    #[serde(rename = "slider")]     Slider,
    #[serde(rename = "curve")]      Curve,
    #[serde(rename = "changeup")]   Changeup,
    #[serde(rename = "splitter")]   Splitter,
    #[serde(rename = "forkball")]   Forkball,
    #[serde(rename = "screwball")]  Screwball,
    #[serde(rename = "knuckleball")]Knuckleball,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchStrategy {
    #[serde(rename = "aggressive")] Aggressive,
    #[serde(rename = "balanced")]   Balanced,
    #[serde(rename = "safe")]       Safe,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchPower {
    #[serde(rename = "low")]    Low,
    #[serde(rename = "normal")] Normal,
    #[serde(rename = "high")]   High,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum WeatherType {
    #[serde(rename = "sunny")]     Sunny,
    #[serde(rename = "cloudy")]    Cloudy,
    #[serde(rename = "rainy")]     Rainy,
    #[serde(rename = "windy_in")]  WindyIn,
    #[serde(rename = "windy_out")] WindyOut,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ParkType {
    #[serde(rename = "neutral")]      Neutral,
    #[serde(rename = "pitcher_park")] PitcherPark,
    #[serde(rename = "hitter_park")]  HitterPark,
    #[serde(rename = "dome")]         Dome,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum FieldPosition {
    P, C,
    #[serde(rename = "1B")] B1,
    #[serde(rename = "2B")] B2,
    #[serde(rename = "3B")] B3,
    SS, LF, CF, RF,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum BallHitType {
    #[serde(rename = "groundBall")] GroundBall,
    #[serde(rename = "flyBall")]    FlyBall,
    #[serde(rename = "lineDrive")]  LineDrive,
    #[serde(rename = "popup")]      Popup,
    #[serde(rename = "bunt")]       Bunt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum PitchResultCode {
    /// 스트라이크 — **투구 하나의 결과**다. 3스트라이크째면 아래 삼진으로 좁힌다.
    #[serde(rename = "STRIKE_SWING")]   StrikeSwing,
    #[serde(rename = "STRIKE_LOOK")]    StrikeLook,
    /// 삼진 — **타자가 물러났다.**
    ///
    /// 🔴 예전엔 이게 없어서 3스트라이크째에도 `StrikeLook`이 그대로 나갔다.
    ///   화면은 "루킹"이라고만 했고 **타자가 아웃된 걸 말할 방법이 없었다.**
    ///   인플레이 아웃이 넷으로 쪼개진 것과 같은 이유다(`narrow_inplay_out`).
    #[serde(rename = "STRIKEOUT_SWING")] StrikeoutSwing,
    #[serde(rename = "STRIKEOUT_LOOK")]  StrikeoutLook,
    #[serde(rename = "BALL")]           Ball,
    #[serde(rename = "FOUL")]           Foul,
    /// 인플레이 아웃 — **중간값이다.** 타구 종류와 병살 여부가 정해지기 전
    /// 단계에서만 쓰고, 최종 결과로는 아래 넷 중 하나로 좁힌다
    /// (`narrow_inplay_out`). 화면이 "아웃!" 하나로만 받던 시절의 코드다.
    #[serde(rename = "INPLAY_OUT")]     InplayOut,
    #[serde(rename = "GROUND_OUT")]     GroundOut,
    #[serde(rename = "FLY_OUT")]        FlyOut,
    #[serde(rename = "LINE_OUT")]       LineOut,
    #[serde(rename = "DOUBLE_PLAY")]    DoublePlay,
    /// 삼중살 — 아웃 셋을 한 번에. **무사 · 주자 둘 이상**에서만 난다.
    /// ⚠ 실제 KBO 는 시즌 0~2건이다 — 아주 드물게 둔다.
    #[serde(rename = "TRIPLE_PLAY")]    TriplePlay,
    #[serde(rename = "FIELDING_ERROR")] FieldingError,
    #[serde(rename = "HIT_SINGLE")]     HitSingle,
    #[serde(rename = "HIT_DOUBLE")]     HitDouble,
    #[serde(rename = "HIT_TRIPLE")]     HitTriple,
    #[serde(rename = "HOME_RUN")]       HomeRun,
    #[serde(rename = "WALK")]           Walk,
    /// 사구 — **볼넷과 다른 사건이다.** 타수가 아니고, 출루율 분모에 들어가며,
    /// 투수 기록에도 따로 남는다(KBO 투수 표의 HBP).
    #[serde(rename = "HIT_BY_PITCH")]   HitByPitch,
    /// 수비 방해 — 포수가 타자 스윙을 방해했다. 타자가 1루로 간다.
    ///
    /// ⚠ **타수가 아니다**(볼넷과 같은 취급). 결과 코드가 따로 있어야
    ///   타율 분모가 안 부푼다.
    /// ⚠ 주루 방해와 **다른 사건**이다 — 저쪽은 야수가 주자를 막는다.
    #[serde(rename = "INTERFERENCE")]   Interference,
    /// 희생번트 — 타수가 아니다. `bunting` 능력치가 성공을 가른다.
    /// 🔴 그 능력치는 성장 엔진에 **있는데 경기에서 안 쓰이고 있었다.**
    #[serde(rename = "SAC_BUNT")]       SacBunt,
    /// 스퀴즈 — 3루 주자를 번트로 불러들인다. `SacBunt` 와 진루가 다르다
    SqueezeBunt,
    /// 희생플라이 — 타수가 아니다. 3루 주자가 뜬공에 홈으로 들어온다.
    /// ⚠ `npc_sim`엔 이 갈래가 이미 있었는데 **아웃으로만 세고** 있었다.
    #[serde(rename = "SAC_FLY")]        SacFly,
    #[serde(rename = "GAME_OVER")]      GameOver,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum ExitReason {
    #[serde(rename = "pitch_limit")]  PitchLimit,
    #[serde(rename = "stamina")]      Stamina,
    #[serde(rename = "performance")]  Performance,
    #[serde(rename = "tactical")]     Tactical,
}

// ── 좌표 ──────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct XY {
    pub x: f64,
    pub y: f64,
}

// ── 스탯 구조체 ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PitcherStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub command: f64,
    pub velocity: f64,
    #[serde(rename = "staminaCap")]   pub stamina_cap: f64,
    #[serde(rename = "mentalResil")]  pub mental_resil: f64,
    pub control: f64,
    pub movement: f64,
    pub clutch: f64,
    #[serde(rename = "holdRunners")] pub hold_runners: f64,
    /// 보유 구종. **비면 패스트볼 하나로 던진다** (구 세이브·데이터 결손 대비).
    ///
    /// ⚠ 예전엔 이 필드가 아예 없었고 `auto_pick_decision`이 Fastball/Slider/
    /// Changeup을 하드코딩으로 뽑았다 — **너클볼을 마스터해도 안 던졌다.**
    #[serde(default)]
    pub arsenal: Vec<ArsenalPitch>,
}

/// 보유 구종 한 종. `grade`는 1~5 숙련도다.
///
/// 숙련도는 **두 곳에 걸린다** (설계 확정): 선택 빈도와 공의 품질.
/// 그래야 "주무기"가 저절로 생기고 경기 로그가 읽힌다.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct ArsenalPitch {
    #[serde(rename = "type")]
    pub pitch_type: PitchType,
    pub grade: u8,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PartialPitcherStats {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    /// 보유 구종. 안 넘기면 패스트볼 하나로 던진다
    #[serde(default)]
    pub arsenal: Option<Vec<ArsenalPitch>>,
    /// **지금 익히는 중인 구종의 난이도** (0~3). 있으면 제구가 흔들린다.
    /// `pitch_catalog.json`의 `formDifficulty`가 정본이다.
    #[serde(default)]
    pub developing_difficulty: Option<f64>,
    pub command: Option<f64>,
    pub velocity: Option<f64>,
    #[serde(rename = "staminaCap")]  pub stamina_cap: Option<f64>,
    #[serde(rename = "mentalResil")] pub mental_resil: Option<f64>,
    pub control: Option<f64>,
    pub movement: Option<f64>,
    pub clutch: Option<f64>,
    #[serde(rename = "holdRunners")] pub hold_runners: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BatterStats {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub contact: f64,
    pub power: f64,
    pub eye: f64,
    pub discipline: f64,
    #[serde(rename = "battingClutch")] pub batting_clutch: f64,
    pub platoon: f64,
    pub speed: f64,
    #[serde(rename = "baseInstinct")] pub base_instinct: f64,
    /// 번트 — 희생번트 성공률을 가른다.
    ///
    /// 🔴 이 능력치는 성장 엔진에 **있는데 경기에 안 오고 있었다**. 올려도
    ///   아무 일이 안 일어나는 죽은 값이었다(2026-08-28에 이어 붙였다).
    /// ⚠ `default`다 — 안 넘기면 50(보통)으로 본다. 그래서 배선이 빠져도
    ///   게임이 안 죽지만, **그 상태면 번트가 다시 죽는다.**
    #[serde(default)]
    pub bunting: Option<f64>,
    pub fielding: f64,
    pub arm: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunnerStats {
    /// 🔴 **누가 나가 있는지** (2026-08-28). 없으면 홈을 밟아도 그 득점을
    ///   사람에게 못 붙인다 — KBO 타자 표의 R 칸이 그것이다.
    ///
    /// ⚠ 배경 리그(`npc_sim`)는 진작 lineup 인덱스를 들고 다녔다("누가 나가
    ///   있는지를 안 들고 다니면 도루를 누구에게 붙일지 알 수 없다"). 주인공
    ///   경기만 그 개선이 안 돼 있었다 — **두 경로가 다른 잣대**였다.
    ///
    /// ⚠ `default`다. 구 세이브의 경기 상태에는 없다.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub player_id: Option<String>,
    pub speed: f64,
    pub instinct: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchRunners {
    pub first: Option<RunnerStats>,
    pub second: Option<RunnerStats>,
    pub third: Option<RunnerStats>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchCount {
    pub balls: u8,
    pub strikes: u8,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchScore {
    pub home: i32,
    pub away: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InningScores {
    pub home: Vec<i32>,
    pub away: Vec<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ManagerStats {
    #[serde(rename = "tacticalIQ")]     pub tactical_iq: f64,
    #[serde(rename = "bullpenRead")]    pub bullpen_read: f64,
    #[serde(rename = "offenseMind")]    pub offense_mind: f64,
    pub motivator: f64,
    #[serde(rename = "clutchDecision")] pub clutch_decision: f64,
    /// 감독 스타일이 정하는 작전 배수. **1.0이 예전 동작이다.**
    ///
    /// 🔴 스타일 9종이 저장되고 팀 상세에 표시까지 되는데 경기에선
    ///   아무것도 안 바꿨다 — 공격 지향 감독이 번트를 제일 많이 댈 수
    ///   있었다.
    /// ⚠ `serde(default)` 라 **안 넘겨도 조용히 통과한다.**
    /// ⚠ **TS 는 camelCase 로 보낸다** — 이 구조체엔 `rename_all` 이
    ///   없어서 이름을 명시해야 한다. 안 붙이면 `bunt_mult` 를
    ///   기대해서 **조용히 기본값(1.0)으로 돌아간다.**
    #[serde(default = "one", rename = "buntMult")]  pub bunt_mult: f64,
    #[serde(default = "one", rename = "stealMult")] pub steal_mult: f64,
}

fn one() -> f64 { 1.0 }

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct PartialManagerStats {
    #[serde(default, rename = "buntMult")]  pub bunt_mult: Option<f64>,
    #[serde(default, rename = "stealMult")] pub steal_mult: Option<f64>,
    #[serde(rename = "tacticalIQ")]     pub tactical_iq: Option<f64>,
    #[serde(rename = "bullpenRead")]    pub bullpen_read: Option<f64>,
    #[serde(rename = "offenseMind")]    pub offense_mind: Option<f64>,
    pub motivator: Option<f64>,
    #[serde(rename = "clutchDecision")] pub clutch_decision: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NpcPitcherTracker {
    pub my: f64,
    pub opponent: f64,
}

/// 한 팀의 투수진 — 선발 → 불펜 → 마무리 순.
///
/// ⚠ **비어 있으면 예전 동작이다.** 기존 단일 `my_npc_pitcher` /
/// `opponent_npc_pitcher`를 그대로 쓴다. 통합(C단계)을 한 번에 바꾸지 않고
/// 큐가 채워진 쪽만 새 경로를 타게 해서, 어긋나면 어디서인지 좁힐 수 있게 한다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitcherQueue {
    /// 등판 순서대로. 0번이 선발이다
    #[serde(default)]
    pub pitchers: Vec<PartialPitcherStats>,
    /// 지금 던지는 투수의 인덱스
    #[serde(default)]
    pub current: usize,
    /// 투수별 최대 아웃 수 — `sim_max_outs` 상당. 비면 상한 없음
    #[serde(default)]
    pub max_outs: Vec<i32>,
    /// 현재 투수가 잡은 아웃
    #[serde(default)]
    pub outs_by_current: i32,
    /// 투수별 누적 기록 (C-2). 큐와 같은 순서다 — 비면 아무것도 안 쌓는다
    #[serde(default)]
    pub lines: Vec<PitcherLineAccum>,
    /// 리그 투구수 상한 (고교 105 · 그 외 120). 0이면 상한 없음
    #[serde(default)]
    pub pitch_limit: f64,
}

/// 투수 한 명의 경기 기록 (C-2) — `npc_sim::PitAccum`과 같은 항목이다.
///
/// ⚠ **지금 엔진은 주인공 것만 쌓는다**(`k_since_entry` 등). 교체된 투수들의
/// 성적이 안 남아서, 통합하면 리그 순위표·성적표가 통째로 빈다.
/// `sim_game`은 `PitAccum`/`BatAccum`으로 전원을 쌓아 `player_lines`를 만든다 —
/// 그 계약을 만족해야 순위표가 안 깨진다.
/// 한 이닝의 투수 성적.
///
/// 🔴 예전엔 **합계만** 있어서 6이닝 3실점이 "고르게"인지 "한 이닝에
///   몰아서"인지 구분이 안 됐다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InningLine {
    pub inning: i32,
    pub pc: i32,
    pub er: i32,
    pub outs: i32,
}

/// 구종 하나의 성적.
///
/// ⚠ 지표를 늘리면 경기 로그가 무거워진다 — 셋으로 족하다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchMixLine {
    /// 그 구종을 던진 수
    pub pc: i32,
    /// 그 구종으로 잡은 삼진 — **결정구가 뭔지 보여준다**
    pub k: i32,
    /// 그 구종으로 맞은 안타
    pub h: i32,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitcherLineAccum {
    pub player_id: String,
    /// 폭투 — KBO 투수 표의 WP. **포일(PB)은 포수 것이라 여기 없다.**
    #[serde(default)]
    pub wp: i32,
    /// 보크 — KBO 투수 표의 BK. **판정만 하고 안 세면 화면에서
    /// "왜 주자가 갔지"만 남는다.**
    #[serde(default)]
    pub bk: i32,
    /// 구종별 성적. **안 던진 구종은 안 실린다** — 10종을 배열로 두면
    /// 대부분 0인 칸이 매 경기 로그에 쌓인다.
    #[serde(default)]
    pub pitch_mix: std::collections::HashMap<String, PitchMixLine>,
    /// 이닝별 성적. 몇 회에 무너졌는지는 합계로 못 본다.
    #[serde(default)]
    pub by_inning: Vec<InningLine>,
    pub outs: i32,
    pub er: i32,
    pub h: i32,
    /// 피홈런 — `h`에 뭉개고 있었다
    pub hr: i32,
    /// 사구 (KBO 투수 표의 HBP). 볼넷과 다른 사건이다
    pub hbp: i32,
    pub k: i32,
    pub bb: i32,
    pub pc: i32,
    pub risp_ab: i32,
    pub risp_h: i32,
}

/// 타자 한 명의 경기 기록 (C-3) — `npc_sim::BatAccum`과 같은 항목이다.
///
/// ⚠ **투수만 쌓으면 순위표의 절반이 빈다.** 타율·홈런·타점왕이 안 나오고
/// 팀 득점도 선수별로 안 갈린다. `sim_game`은 `BatAccum`으로 전원을 쌓는다.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterLineAccum {
    /// 도루자 — `sb` 와 짝이다
    pub cs: i32,
    /// 포일 — KBO 포수 기록의 PB. **폭투(WP)와 다르다** — 저쪽은
    /// 투수가 못 던진 것이고 이건 포수가 못 잡은 것이다.
    /// ⚠ 타자 줄에 있지만 **그 이닝 포수**의 기록이다.
    #[serde(default)]
    pub pb: i32,
    pub player_id: String,
    /// 수비 기록 — **선수별로 한 건도 안 쌓이고 있었다** (2026-08-29).
    /// `DefenseStat`은 팀 단위 하나라 골든글러브를 뽑을 근거가 없었다.
    /// ⚠ 전부 `default`다 — 구 세이브의 로그엔 없다.
    #[serde(default)] pub errors: i32,
    #[serde(default)] pub assists: i32,
    #[serde(default)] pub putouts: i32,
    pub ab: i32,
    pub h: i32,
    /// 2루타·3루타 — 엔진은 처음부터 갈라 만드는데 `h`로 뭉개고 있었다
    pub b2: i32,
    pub b3: i32,
    pub hr: i32,
    /// 득점 — **홈을 밟은 사람 것**이다. 타점과 다르다
    pub r: i32,
    /// 사구·희생번트·희생플라이 — **셋 다 타수가 아니다.**
    /// 타석(PA)과 출루율(OBP) 식이 이 값들을 봐야 한다
    pub hbp: i32,
    pub sac: i32,
    pub sf: i32,
    pub rbi: i32,
    pub bb: i32,
    pub k: i32,
    pub sb: i32,
    pub risp_ab: i32,
    pub risp_h: i32,
}

impl PitcherQueue {
    pub fn is_empty(&self) -> bool { self.pitchers.is_empty() }
    /// 지금 투수를 바꿔야 하는가 — 아웃 한계 **또는 투구수 상한**을 넘었을 때.
    ///
    /// ⚠ **투구수도 봐야 한다.** 아웃 한계만 보면 7이닝에 114구를 던진 선발이
    /// 그대로 남는다(실측). 고교 상한이 105구라 그 전에 내려가야 한다 —
    /// `sim_game`은 아웃만 보지만 이쪽 엔진엔 투구수 개념이 이미 있다.
    pub fn should_switch(&self) -> bool {
        let pitch_limit = self.pitch_limit;
        if self.pitchers.is_empty() { return false; }
        if self.current + 1 >= self.pitchers.len() { return false; }
        let over_outs = match self.max_outs.get(self.current) {
            Some(&m) if m > 0 => self.outs_by_current >= m,
            _ => false,
        };
        let over_pitches = self.lines.get(self.current)
            .map(|l| pitch_limit > 0.0 && l.pc as f64 >= pitch_limit)
            .unwrap_or(false);
        over_outs || over_pitches
    }
    pub fn advance(&mut self) {
        if self.current + 1 < self.pitchers.len() {
            self.current += 1;
            self.outs_by_current = 0;
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FielderStats {
    pub position: FieldPosition,
    /// 🔴 **누가 수비했는지** (2026-08-29). 예전엔 `name`뿐이라 —
    ///   주인공 경기는 **사람 이름**(동명이인을 못 가린다),
    ///   리그 경기는 **포지션 문자열**(신원이 아예 없다)이었다.
    ///   실책·보살을 선수에게 달 방법이 없었다.
    /// ⚠ `default`다 — 구 세이브의 스냅샷엔 없다.
    #[serde(rename = "playerId", default)]
    pub player_id: String,
    pub name: String,
    pub fielding: f64,
    pub arm: f64,
    pub speed: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DefenseStat {
    pub errors: u32,
    pub assists: u32,
    #[serde(rename = "throwOuts")]  pub throw_outs: u32,
    #[serde(rename = "throwSafes")] pub throw_safes: u32,
}

// ── 타자 스탯 누적 (인터랙티브 경기용) ───────────────────────────────────────

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct BatterStatAccum {
    pub pa: u32,
    pub ab: u32,
    pub h: u32,
    pub hr: u32,
    pub rbi: u32,
    pub bb: u32,
    pub k: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BatterLine {
    pub player_id: String,
    pub pa: u32,
    pub ab: u32,
    pub h: u32,
    pub hr: u32,
    pub rbi: u32,
    pub bb: u32,
    pub k: u32,
}

// ── 등판 조건 ─────────────────────────────────────────────────────────────────
fn default_score_diff_cap() -> i32 { 6 }
fn default_min_lead_diff()   -> i32 { 1 }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum EntryTrigger {
    #[serde(rename = "inning_start")]
    InningStart { inning: u8 },
    #[serde(rename = "mid_inning")]
    MidInning {
        inning: u8,
        #[serde(rename = "maxOuts")] max_outs: u8,
        #[serde(rename = "scoreDiffCap", default = "default_score_diff_cap")] score_diff_cap: i32,
    },
    #[serde(rename = "close_game")]
    CloseGame {
        #[serde(rename = "inningThreshold")] inning_threshold: u8,
        #[serde(rename = "maxLeadDiff")]     max_lead_diff: i32,
        #[serde(rename = "minLeadDiff", default = "default_min_lead_diff")] min_lead_diff: i32,
    },
    #[serde(rename = "manual")]
    Manual { inning: u8, half: HalfInning, outs: u8, runners: MatchRunners },
}

// ── 인플레이 ──────────────────────────────────────────────────────────────────

/// 구장 담장 — 좌·중·우 거리(m)와 펜스 높이(m).
///
/// 🔴 예전엔 `ParkType` 4종(중립·투수친화·타자친화·돔)만 왔고 그것도
///   타율 보정 ±3점으로만 쓰였다. **거리 개념이 없어 같은 타구가
///   어느 구장에서나 똑같이 홈런이었다.**
///
/// ⚠ 안 넘기면 중립 기본값이다 — 예전과 같게 돈다.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParkDims {
    pub lf: f64,
    pub cf: f64,
    pub rf: f64,
    pub fence: f64,
}

impl Default for ParkDims {
    /// 중립 구장 평균 — 실측(2026-08-30) `stadiums.json` 중립 9개
    fn default() -> Self {
        ParkDims { lf: 98.4, cf: 122.1, rf: 98.6, fence: 3.1 }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BallInPlay {
    #[serde(rename = "hitType")]  pub hit_type: BallHitType,
    pub zone: FieldPosition,
    pub hardness: u8,
    /// 비거리(m) — **결과가 정해진 뒤 붙는 값이 아니다.** 담장을 넘는지
    /// 이걸로 가른다.
    /// ⚠ `default` 다 — 구 세이브 로그엔 없다.
    #[serde(default)]
    pub distance: f64,
    /// 발사각(도). 뜬공이 높고 땅볼이 낮다
    #[serde(default)]
    pub launch_angle: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FieldingResult {
    pub fielder: FielderStats,
    #[serde(rename = "isError")]           pub is_error: bool,
    #[serde(rename = "threwTo", skip_serializing_if = "Option::is_none")]
    pub threw_to: Option<FieldPosition>,
    #[serde(rename = "throwResult", skip_serializing_if = "Option::is_none")]
    pub throw_result: Option<String>,
    #[serde(rename = "runnerExtraAdvance")] pub runner_extra_advance: i32,
}

// ── 애니메이션 큐 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum AnimationCue {
    #[serde(rename = "ball_pitch")]
    BallPitch { from: XY, to: XY, duration: u32 },
    #[serde(rename = "ball_batted")]
    BallBatted { from: XY, to: XY, arc: f64, #[serde(rename = "hitType")] hit_type: BallHitType, duration: u32 },
    #[serde(rename = "fielder_move")]
    FielderMove { position: FieldPosition, to: XY, duration: u32 },
    #[serde(rename = "ball_throw")]
    BallThrow { from: XY, to: XY, duration: u32 },
    #[serde(rename = "runner_advance")]
    RunnerAdvance {
        #[serde(rename = "runnerId")] runner_id: String,
        #[serde(rename = "toBase")]   to_base: String,
        duration: u32,
    },
    #[serde(rename = "show_result")]
    ShowResult { text: String, tone: String, x: f64, y: f64 },
}

// ── 전체 경기 상태 ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchState {
    pub match_id: String,
    pub inning: u8,
    pub inning_limit: u8,
    /// **연장 상한.** 이 회를 넘기고도 동점이면 무승부다.
    ///
    /// ⚠ `0`이면 **무제한** — 승부가 날 때까지 한다(예전 동작).
    ///   대회·포스트시즌은 승자가 나와야 하므로 0으로 둔다.
    ///   정규리그만 12를 넘긴다(KBO 규정).
    #[serde(default)]
    pub extra_inning_limit: u8,
    pub half: HalfInning,
    pub outs: u8,
    pub count: MatchCount,
    pub runners: MatchRunners,
    pub score: MatchScore,
    pub inning_scores: InningScores,
    pub pitch_count: u32,
    /// 이 경기의 투구수 상한 (리그별 — 고교 105 / 그 외 120, Phase 5-8).
    /// 세이브 호환을 위해 default: 미지정이면 0이고 그때는 전역 상수로 떨어진다.
    #[serde(default)]
    pub pitch_limit: f64,
    #[serde(default)]
    pub pitch_soft: f64,
    /// 선발 아웃 예산 계수 (1.1 A②). 0 이면 1.0 — 구 상태 JSON 호환
    #[serde(default)]
    pub starter_outs_factor: f64,
    /// 의무 휴식이 안 차 이 경기엔 주인공(불펜)이 못 나온다 (§6-1-4)
    #[serde(default)]
    pub protagonist_rest_blocked: bool,

    pub protagonist_side: String,

    pub protagonist_pitcher: PitcherStats,
    pub my_npc_pitcher: PitcherStats,
    pub opponent_npc_pitcher: PitcherStats,

    pub home_lineup: Vec<BatterStats>,
    /// 벤치 — 대타·대주자 후보.
    ///
    /// ⚠ **비면 교체가 없다** — 예전과 같게 돈다.
    /// ⚠ `PitcherQueue` 와 같은 방식이다: 쓴 사람은 앞에서부터 소모한다.
    #[serde(default)]
    pub home_bench: Vec<BatterStats>,
    /// 주인공이 **아예 없는 경기**인가 — 리그 시뮬이 그렇다.
    ///
    /// 🔴 `role: "SP"` 면 `is_immediate` 로 1구부터 주인공이 던지는데,
    ///   리그 시뮬은 주인공이 없어서 `pitcher` 를 안 넘긴다. 그래서
    ///   **기본값 투수(50/52/55…)가 홈 마운드에 섰다** — 홈이 원정보다
    ///   2.2점을 더 줬고 홈 승률이 33% 였다(같은 로스터끼리 붙여 실측).
    ///
    /// ⚠ **추론으로 끄지 않는다.** `tuning.cjs` 는 일부러 `pitcher` 없이
    ///   합성 주인공을 돌린다 — 그쪽은 기본값이 의도다.
    /// ⚠ `default` 는 false 다 — 안 넘기면 예전과 완전히 같게 돈다.
    #[serde(default)]
    pub no_protagonist: bool,
    #[serde(default)]
    pub away_bench: Vec<BatterStats>,
    /// 이미 교체로 나간 벤치 인원 수 — 앞에서부터 쓴다
    #[serde(default)]
    pub home_bench_used: usize,
    #[serde(default)]
    pub away_bench_used: usize,
    pub away_lineup: Vec<BatterStats>,
    pub home_lineup_index: usize,
    pub away_lineup_index: usize,
    pub batter_mean: f64,

    pub role: PitcherRole,
    pub entry_trigger: EntryTrigger,
    pub protagonist_has_entered: bool,
    pub protagonist_exited: bool,
    pub pitch_count_since_entry: u32,
    pub protagonist_stamina: f64,
    pub protagonist_mental: f64,
    #[serde(default)]
    pub k_since_entry: u32,
    #[serde(default)]
    pub h_since_entry: u32,
    #[serde(default)]
    pub bb_since_entry: u32,
    #[serde(default)]
    pub outs_since_entry: u32,
    /// 등판 중 실점. **자책/비자책을 구분하지 않는다** — 이 모델엔 실책 실점을
    /// 따로 추적할 근거가 얇다. 예전엔 이 필드가 아예 없어서 호출측이
    /// `피안타 × 0.35`로 자책점을 **역산**했고, 피안타가 부풀면 ERA가 그대로
    /// 따라 올라갔다(실측 ERA 14.78)
    #[serde(default)]
    pub er_since_entry: u32,

    /// 타자 기록 (C-3) — 홈/원정. 비면 아무것도 안 쌓는다
    #[serde(default)]
    pub home_bat_lines: Vec<BatterLineAccum>,
    #[serde(default)]
    pub away_bat_lines: Vec<BatterLineAccum>,
    /// 투수진 — **비면 예전 동작**(단일 npc 투수)이다 (C-1)
    #[serde(default)]
    pub my_queue: PitcherQueue,
    #[serde(default)]
    pub opponent_queue: PitcherQueue,
    pub npc_pitcher_stamina: NpcPitcherTracker,
    pub npc_pitcher_mental: NpcPitcherTracker,
    pub npc_pitcher_pitch_count: NpcPitcherTracker,

    pub inherited_runners: MatchRunners,

    pub my_manager: ManagerStats,
    pub opponent_manager: ManagerStats,
    pub mound_visits_left: i32,
    pub last_mound_visit_pitch: i32,

    pub pre_entry_logs: Vec<String>,
    pub last_pitch_types: Vec<PitchType>,
    /**
     * 직전 투구의 **구속(km/h)** — 완급 조절의 입력 (결정 ⑧ · 2026-09-07).
     *
     * 🔴 **한 칸이면 된다.** 낙차는 「직전 공과 이번 공」이고, 다섯 칸을
     *   들면 「최근 다섯 중 제일 느린 것과의 차」 같은 다른 규칙이 슬쩍
     *   가능해진다 — 그건 완급 조절이 아니라 구종 다양성이다.
     * ⚠ **없으면 없는 것이다.** 첫 공·타자 교체 직후는 견줄 값이 없어
     *   가산이 0 이다. 0.0 을 채우면 「느린 공이 있었다」가 되어 첫 공이
     *   늘 큰 낙차로 잡힌다.
     * ⚠ `#[serde(default)]` — 옛 세이브·옛 스냅샷에 이 칸이 없다.
     */
    #[serde(default)]
    pub last_pitch_speed: Option<f64>,
    /**
     * 최근 5구의 **코스 칸** — 코스 반복 페널티의 입력 (결정 ⑨ · 2026-09-07).
     *
     * 3×3 존 격자(1~9)로 접고 존 밖은 칸 하나(0)다. `last_pitch_types` 와
     * 같은 길이·같은 규칙으로 민다 — 두 페널티가 같은 창을 봐야 「구종은
     * 바꿨는데 코스가 같다」가 제대로 잡힌다.
     */
    #[serde(default)]
    pub last_pitch_zones: Vec<u8>,

    pub weather: WeatherType,
    pub park: ParkType,
    /// 담장 — **안 넘기면 중립 기본값**이라 예전과 같게 돈다
    #[serde(default)]
    pub park_dims: ParkDims,

    pub is_finished: bool,
    pub logs: Vec<String>,
    /// **주인공 쪽 수비진.**
    ///
    /// 🔴 예전엔 이게 전부였다 — `resolve_fielding_result`가 **반과 무관하게**
    ///   이 배열만 봤다. 즉 **원정 수비가 존재하지 않았고**, 홈(또는 주인공)
    ///   팀 9명이 양 팀 이닝을 다 지켰다. 선수별 수비 기록을 달면 그 사람들이
    ///   **상대 수비 기록까지 먹는다.** (2026-08-29)
    pub fielders: Vec<FielderStats>,
    /// 상대 쪽 수비진. **비면 예전 동작**(양 반 모두 `fielders`)이다.
    #[serde(default)]
    pub opponent_fielders: Vec<FielderStats>,
    pub defense_stat: DefenseStat,
    #[serde(default)]
    pub batter_accum: HashMap<String, BatterStatAccum>,

    /// 난수 씨앗 — **0이면 씨앗을 안 쓴다**(`thread_rng`, 매번 다른 결과).
    ///
    /// 리그 경기는 씨앗을 넘겨 **같은 세이브를 다시 열어도 같은 결과**가
    /// 나오게 한다. 주인공 경기는 **계측 모드에서만** 씨앗을 받는다
    /// (사용자 확정 2026-09-07 · `apps/ui/src/shared/utils/measureMode.ts`) —
    /// 실제 플레이에서 "세이브를 다시 열어 운을 다시 굴릴 수 있게 할 것인가"는
    /// 게임 설계 판단이고, 지금 답은 **안 준다**(예전 그대로 `thread_rng`)다.
    ///
    /// ⚠ **경기가 진행되면 이 값을 갱신한다.** 안 그러면 `simToGameEnd`를
    /// 두 번 부를 때 같은 난수를 다시 쓴다.
    /// 세이브 호환을 위해 `default` — 옛 세이브엔 이 필드가 없고 그때 0이다.
    #[serde(default)]
    pub rng_seed: u64,
}

// ── 투구 결정 / 결과 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchDecision {
    pub pitch_type: PitchType,
    pub location: u8,
    pub target: Option<XY>,
    pub strategy: PitchStrategy,
    pub power: PitchPower,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PitchOutcome {
    pub result_code: PitchResultCode,
    pub quality: f64,
    pub comment: String,
    pub ball_in_play: Option<BallInPlay>,
    pub fielding_result: Option<FieldingResult>,
    pub animation_cues: Vec<AnimationCue>,
    pub landing_target: XY,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MidGameInjury {
    pub injury_type: String,   // InjuryType ID
    pub severity: String,      // "light" | "moderate" | "severe"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MatchStepResult {
    pub next_state: MatchState,
    pub outcome: PitchOutcome,
    pub mid_game_injury: Option<MidGameInjury>,
    /// 사람이 읽는 문장만. 도루·주루·실책 같은 **한 투구 안에서 벌어진 부수 사건**이다.
    /// 개발자용 한 줄(`build_pitch_log`)은 여기 안 섞는다 — 화면이 그대로 찍는다.
    pub narrative_logs: Vec<String>,
}

// ── 반이닝 시뮬 결과 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AtBatLog {
    pub pitcher_name: String,
    pub batter_name: String,
    pub result_code: PitchResultCode,
    pub pitch_count: u32,
    pub runs_scored: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HalfInningSimResult {
    pub next_state: MatchState,
    pub runs: i32,
    pub hits: i32,
    pub walks: i32,
    pub strikeouts: i32,
    pub logs: Vec<String>,
    pub at_bats: Vec<AtBatLog>,
    /**
     * 던진 공 수 · 헛스윙 수 — **헛스윙률(SwStr%)의 재료다** (결정 ⑧⑨ 계측).
     *
     * 🔴 **투구 품질이 움직였는지는 안타·삼진만으로는 늦게 보인다.** 완급·
     *   코스는 공 하나하나의 품질을 미는 것이라 타석 결과까지 가면 수비·
     *   운이 섞인다. 헛스윙은 그 사이에 있는 유일한 원시 사건이다.
     * ⚠ `#[serde(default)]` — 옛 스냅샷에 없다.
     */
    #[serde(default)]
    pub pitches: i32,
    #[serde(default)]
    pub whiffs: i32,
}

// ── 게임 페이즈 결과 ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "phase")]
pub enum GamePhaseResult {
    #[serde(rename = "pre_entry_sim")]   PreEntrySim,
    #[serde(rename = "protagonist_entry")] ProtagonistEntry { state: MatchState },
    #[serde(rename = "protagonist_pitch")] ProtagonistPitch,
    #[serde(rename = "auto_batting")]    AutoBatting { result: HalfInningSimResult },
    #[serde(rename = "protagonist_exit")]
    ProtagonistExit { reason: ExitReason, state: MatchState },
    #[serde(rename = "post_exit_sim")]   PostExitSim,
    #[serde(rename = "game_over")]       GameOver { state: MatchState, summary: String },
}

// ── 강판 판단 ─────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProtagonistExitCheck {
    pub should_exit: bool,
    pub reason: Option<ExitReason>,
}

// ── startMatch 옵션 ────────────────────────────────────────────────────────────

/// 마무리 진입 문 (규칙 파일 `rosterOpsRules.closerGate.<리그>` · 1.1 A② §6-1-3)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloserGate {
    pub inning_threshold: u8,
    pub max_lead_diff: i32,
    pub min_lead_diff: i32,
}

/// 의무 휴식 검사 재료 — 세이브의 `lastPitchedDate`·`lastPitchCount` 와 이 경기 날짜 (§6-1-4)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestGuard {
    pub last_pitched_date: String,
    pub last_pitch_count: u32,
    pub game_date: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct MatchStartOptions {
    pub match_id: Option<String>,
    /// 이 경기가 속한 리그 — 투구수 상한이 리그별이다 (Phase 5-8)
    pub league_id: Option<String>,
    /// 리그별 선발 투구수 상한 — 규칙 파일 `rosterOpsRules.starterPitchLimit` (1.1 A② · §6-1-2 ②).
    /// 없으면 `tuning::league_pitch_limit` 폴백. 소프트캡은 이 값의 0.75
    #[serde(default)]
    pub pitch_limit_override: Option<f64>,
    /// 선발 아웃 예산 계수 — `rosterOpsRules.starterOutsFactor` (§6-1-2 ③ · 고교 0.80 제안). 없거나 0 이면 1.0
    #[serde(default)]
    pub starter_outs_factor: Option<f64>,
    /// 마무리 진입 문 — `rosterOpsRules.closerGate` (§6-1-3 · 고교 8회 고정 제안). 없으면 감독 clutchDecision 으로
    #[serde(default)]
    pub closer_gate: Option<CloserGate>,
    /// 의무 휴식 검사 재료 — 불펜(RP/CP) 주인공이 직전 등판 뒤 쉬어야 할 날이 안 찼으면 이 경기엔 못 나온다
    /// (§6-1-4 · 고교 마무리는 `reliever_would_pitch` 를 안 타서 연투가 안 막히던 결함)
    #[serde(default)]
    pub rest_guard: Option<RestGuard>,
    /// 추천 밖 깊이 `over = max(0, rank − seats)` (1.1 A④ §5-c).
    ///
    /// 0 이거나 없으면 예전과 같다. 1 이상이면 불펜·마무리 **진입 문턱이 그만큼 늦어진다** —
    /// 자리 밖 투수는 늦게, 여유 있는 상황에만 나간다.
    #[serde(default)]
    pub role_depth: Option<u32>,
    pub inning_limit: Option<u8>,
    /// 연장 상한. 없거나 0이면 무제한(예전 동작). 정규리그만 12를 넘긴다
    #[serde(default)]
    pub extra_inning_limit: Option<u8>,
    pub protagonist_side: Option<String>,
    pub role: Option<PitcherRole>,
    pub entry_trigger: Option<EntryTrigger>,
    pub protagonist_pitcher: Option<PartialPitcherStats>,
    pub pitcher: Option<PartialPitcherStats>,           // legacy alias
    pub opponent_pitcher: Option<PartialPitcherStats>,
    pub npc_starter_pitcher: Option<PartialPitcherStats>,
    pub home_lineup: Option<Vec<BatterStats>>,
    /// 벤치 — **안 넘기면 교체가 없다**(예전 동작)
    #[serde(default)]
    pub home_bench: Option<Vec<BatterStats>>,
    /// 주인공이 없는 경기 — **리그 시뮬은 반드시 켠다**
    #[serde(default)]
    pub no_protagonist: Option<bool>,
    #[serde(default)]
    pub away_bench: Option<Vec<BatterStats>>,
    pub away_lineup: Option<Vec<BatterStats>>,
    pub opponent_lineup: Option<Vec<BatterStats>>,      // legacy
    pub my_team_lineup: Option<Vec<BatterStats>>,
    pub batter_mean: Option<f64>,
    pub initial_stamina: Option<f64>,
    pub initial_mental: Option<f64>,
    pub my_manager: Option<PartialManagerStats>,
    pub opponent_manager: Option<PartialManagerStats>,
    pub weather: Option<WeatherType>,
    pub park: Option<ParkType>,
    #[serde(default)]
    pub park_dims: Option<ParkDims>,
    pub fielders: Option<Vec<FielderStats>>,
    /// 상대 수비진. ⚠ **안 넘기면 상대 이닝도 내 수비수가 지킨다**
    #[serde(default)]
    pub opponent_fielders: Option<Vec<FielderStats>>,
    /// 투수진 (C-1). 안 주면 예전처럼 단일 투수로 돈다
    #[serde(default)]
    pub my_pitchers: Option<Vec<PartialPitcherStats>>,
    #[serde(default)]
    pub opponent_pitchers: Option<Vec<PartialPitcherStats>>,
    /// 난수 씨앗 — **안 주면 `thread_rng`**(예전 그대로 매번 다른 결과).
    ///
    /// 리그 경기(`gameSimulator.ts`)가 넘긴다. 주인공 경기는 안 넘긴다.
    /// ⚠ **0은 "씨앗 없음"으로 친다** — `MatchState.rng_seed`가 그 규약이다
    #[serde(default)]
    pub seed: Option<u64>,
}

// ── 헤드리스 게임 시뮬 파라미터 ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunSimpleGameParams {
    pub pitcher: Option<PartialPitcherStats>,
    pub opponent_ovr: f64,
    pub protagonist_ovr: Option<f64>,
    /**
     * 씨앗. **0 이거나 없으면 `thread_rng`** — 예전과 같게 돈다.
     *
     * 🔴 씨앗이 없어서 이 문으로는 **전후 비교를 못 했다** (2026-09-07).
     *   튜닝 랩·감사가 평균만 보고 있어 안 걸렸는데, 결정 하나를 켜고 끄며
     *   재려면 같은 씨앗이어야 한다. `startMatchNative` 가 이미 같은 규약
     *   (0 = 씨앗 없음)을 쓴다 — 여기만 안 따르고 있었다.
     */
    #[serde(default)]
    pub seed: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameSummary {
    pub home_score: i32,
    pub away_score: i32,
    pub strikeouts: i32,
    pub hits: i32,
    pub walks: i32,
    pub at_bat_logs: Vec<AtBatLog>,
    pub summary: String,
    /// 던진 공 수 — 양쪽 반 합계 (헛스윙률의 분모)
    #[serde(default)]
    pub pitches: i32,
    /// 헛스윙 — `STRIKE_SWING` + `STRIKEOUT_SWING`
    #[serde(default)]
    pub whiffs: i32,
    /// 주인공이 상대한 **타석** 수 — 피안타율의 분모(타수 = 타석 − 볼넷)를
    /// 만들려고 둔다(결정 ⑩ 구종 개수 실측). 위 hits/walks 와 **같은 반**만
    /// 센다 — pitches/whiffs 는 양쪽 반 합계라 분모가 안 맞는다
    #[serde(default)]
    pub plate_appearances: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FinishMatchResult {
    pub next_state: MatchState,
    pub summary: String,
    /// ⚠ **`player_lines`가 정본이다.** 이건 `batter_accum`에서 오는 구
    ///   경로라 2루타·3루타·득점·사구·희생타가 없다. 읽는 쪽이 아직 있어 남긴다
    pub batter_lines: Vec<BatterLine>,
    /// 🔴 **이 필드가 없었다** (2026-08-28). `match.cjs`가 세 자리에서
    ///   `result.playerLines ?? []`로 받고 있어 **주인공 경기는 늘 빈 배열**이었다.
    ///   그래서 (a) 화면이 자책점을 `피안타 × 0.35`로 되돌아가 지어내고,
    ///   (b) 주인공만 피홈런·사구·득점권이 안 쌓이고,
    ///   (c) `applyGameOutcome`이 빈 배열을 보고 **경기를 한 판 더 돌려서**
    ///       그 결과를 동료·상대 성적에 넣었다 — 화면에서 본 경기와 다른 경기다.
    pub player_lines: Vec<crate::sim_types::PlayerGameLine>,
    pub protagonist_entered: bool,
}
