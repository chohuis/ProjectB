// 🔴 **`deny` 였는데 한 번도 안 돌았다** (2026-09-11 · 개선 5).
//
//   `#![deny(clippy::all)]` 이 맨 윗줄에 있었지만 `cargo build` 는 clippy 를
//   안 본다 — **`cargo clippy` 를 돌린 사람이 없었다.** 오늘 처음 돌리니
//   **lib 62건 · 검사까지 113건**이 한꺼번에 터졌다(전부 `deny` 라 오류다).
//   CI 워크플로가 GitHub 가 안 읽는 폴더에 있던 것과 **같은 모양**이다 —
//   잣대는 있는데 돌지 않았다.
//
//   그래서 `warn` 으로 내리고 **CI 에 `cargo clippy` 를 넣었다.** 수가 보인다.
//   ⚠ **이건 임시다.** 0 으로 내린 뒤 `deny` 로 되돌린다
//   (그때 CI 에도 `-D warnings` 를 붙인다). 지금 `deny` 로 두면 CI 가
//   첫날부터 빨강이라 아무도 안 본다.
//
// ── **113 → 62** (2026-09-21 · A-6). lib 62 → 22 · 검사까지 113 → 62 ──
//
//   🔴 `cargo clippy --fix` 가 **한 건도 안 먹고 있었다.** 「38건을 고칠 수
//   있다」고 말만 하고 아무것도 안 바뀌기에 로그를 끝까지 읽으니:
//   제안 둘이 `E0502`(빌림 충돌)를 내는데, **한 자리가 깨지면 cargo 는 그
//   배치의 수정을 전부 되돌린다.** 그 둘에 `#[allow]` 를 WHY 와 함께 달자
//   나머지 40건이 한 번에 들어갔다(`npc_sim.rs` 의 `advance_all_grades` ·
//   `run_offseason`). 도구가 「안 된다」고 말한 게 아니라 **조용히 되돌리고
//   있었다** — 이 저장소가 반복해 본 형태다.
//
//   **남은 62 — 손으로 봐야 하는 것들이다**(기계가 못 고친다):
//     38  `assertions_on_constants`  검사 안의 `assert!` 가 상수로 접힌다.
//                                    한 건씩 「무엇을 지키던 검사였나」를 봐야 한다
//      9  `manual_clamp`             `.max(a).min(b)` → `.clamp(a,b)`.
//                                    🔴 **밸런스 식이다**(OVR·연봉 산식). NaN 에서
//                                    동작이 갈리고 TS 검사가 그 글자를 못박고 있다 —
//                                    밸런스 동결 중이라 손대지 않았다
//      8  `too_many_arguments`       `#[allow]` 를 달지 서명을 쪼갤지 판단이 필요하다
//      7  그 밖(범위 루프 2 · Default 뒤 필드대입 2 · ptr_arg · 불필요 괄호 · 문서)
//
//   ⚠ **동작은 한 줄도 안 바뀌었다** — `check:measurerepro` 2회가 고치기 전과
//   **같은 값**을 냈다(대학합격3 · 3년차 OVR 70 · 구속 72 · 완주).
//
// ── **62 → 0 · `deny` 복원** (2026-09-21 · A-7) ─────────────────────────────
//
//   위에 적힌 「0 으로 내린 뒤 `deny` 로 되돌린다」를 지금 한다.
//   CI 의 clippy 단계에도 `-D warnings` 를 붙였다 — 이제 관문이다.
//
//   처리:
//     38  `assertions_on_constants`  **지우지 않았다.** 전부 밸런스 상수가
//                                    실측 범위 안에 있는지 보는 검사다. 양변이
//                                    상수라 접히는 것이 목적이라 검사 모듈 여덟에
//                                    `#![allow]` + 이유를 달았다(사용자 확정)
//      9  `manual_clamp`             **식은 한 글자도 안 바꿨다.** NaN 에서
//                                    `clamp` 와 동작이 갈리고 TS 검사가 그 글자를
//                                    못박는다 — 자리마다 `#[allow]` + 이유(사용자 확정)
//      7  `too_many_arguments`       **전부 내부 함수라 구조체로 묶었다** —
//                                    `Stuff`/`BatEye` · `HalfInning`/`HalfInningCarry` ·
//                                    `NormalizeCtx` · `ReleaseCtx` · `PitchTrainingInput`.
//                                    napi 경계 함수는 하나도 안 건드렸다
//      8  그 밖                      범위 루프 2 · `Default` 뒤 필드대입 2 ·
//                                    `ptr_arg` · `nonminimal_bool` · `if_same_then_else` ·
//                                    문서 목록 들여쓰기
//
//   🔴 **문서 경고 하나가 진짜 결함이었다.** `doc_list_item_without_indentation`
//   이 짚은 자리는 `roster_gen.rs` 에서 **`gen_pitches` 의 설명이 `pick_age` 위에
//   붙어 있던 것**이다. 사이 빈 줄이 없어 두 함수의 주석이 한 덩어리가 됐고,
//   `pick_age` 가 구종 설명을 달고 있었다. 서식 잔소리처럼 보이던 줄이 **잘못
//   붙은 문서**를 가리키고 있었다.
//
//   ⚠ **동작은 한 줄도 안 바뀌었다** — 이번엔 `check:measurerepro` 를 못 썼다
//   (D 가 24판을 6병렬로 돌리는 중이라 electron 안전선이 꽉 찼다).
//   대신 **고치기 전 트리에서 먼저** 씨앗 고정 검사 여덟을 써서 값을 박고
//   (`clippy_freeze_tests` — `npc_sim` · `group_stage` · `roster_gen` ·
//   `team_engine`) 고친 뒤 같은 값이 나오는지 봤다. 경기 한 판 JSON 통째 ·
//   타석 2만 번 분포 · 루상 처리 88칸 · 추첨 · 용병 생성 · 강등 자격 표 32칸.
#![deny(clippy::all)]

//! ## 「안 읽는 칸」 — `#[allow(dead_code)] // payload 미러` 가 붙은 구조체들
//!
//! 2026-09-11(개선 5)에 `cargo build` 경고 **35 → 0** 으로 내렸다. 그중 19 개가
//! 「field is never read」였고, **하나도 빠짐없이 `Deserialize` 전용 구조체**였다.
//!
//! 이 크레이트의 입구는 전부 「TS 가 JSON 을 말아 넘기면 serde 가 편다」 꼴이다.
//! 그래서 구조체는 **payload 의 거울**이다 — 칸이 있다는 것이 곧 「이 값이 온다」는
//! 뜻이고, Rust 가 지금 그 칸을 안 본다고 지우면 **계약이 안 보이게 된다.**
//! (지우면 serde 는 조용히 무시하므로 깨지지도 않는다 — 그래서 더 나쁘다.)
//!
//! 「죽은 것」과 「아직 안 부른 것」은 다르다. 죽은 것은 지웠다(함수 넷·구조체
//! 하나·메서드 둘·변수 일곱). 여기 남은 것은 **계약이라 지우면 안 되는 것**이다.
//!
//! ⚠ 그러니 이 표시를 **새 코드에 습관으로 붙이지 마라.** 붙일 자리는 둘뿐이다:
//!   ① serde payload 미러 ② 검사만 부르는 규칙 함수(그쪽은 이유를 따로 적었다).

use napi_derive::napi;
// 씨앗 기반 난수 — 리그 경기 재현성. `StdRng::seed_from_u64`가 이 트레이트에 있다
use rand::{Rng, SeedableRng};

mod hmac;
mod crypto;
mod types;
mod tuning;
mod match_engine;
mod sim_types;
mod npc_sim;
mod growth_engine;
mod player_engine;
mod pitcher_role;
mod schedule_engine;
mod tournament;
mod group_stage;
mod survival;
mod rest_rules;
mod staff_gen;
mod staff_lifecycle;
mod postseason_engine;
mod week_engine;
mod team_engine;
mod player_agent;
mod scouting_engine;
mod roster_gen;
mod synthetic_trajectory;
mod relationship;
mod career_history;
mod military_roster;
mod draft;
mod national_team;
mod free_agency;
mod finance;
mod campus_events;

use types::*;
use sim_types::*;
use growth_engine::*;
use player_engine::*;
use schedule_engine::*;
use postseason_engine::*;

// ── HMAC (Phase 1) ────────────────────────────────────────────────────────────

/// 세이브 데이터 HMAC-SHA256 서명 (키는 바이너리 내부)
#[napi]
pub fn compute_save_sig(snapshot: String) -> String {
    hmac::compute_save_sig(&snapshot)
}

/// 세이브 데이터 암호화 → base64(nonce || ciphertext)
#[napi]
pub fn encrypt_save_native(plaintext: String) -> String {
    crypto::encrypt_save(&plaintext)
}

/// 세이브 데이터 복호화 (구 평문 포맷 자동 감지)
#[napi]
pub fn decrypt_save_native(ciphertext: String) -> String {
    crypto::decrypt_save(&ciphertext).unwrap_or_default()
}

/// 서명 검증 — 일치하면 true
#[napi]
pub fn verify_save_sig(snapshot: String, sig: String) -> bool {
    hmac::verify_save_sig(&snapshot, &sig)
}

// ── 매치 엔진 (Phase 2) ───────────────────────────────────────────────────────

fn parse_err(fn_name: &str, e: serde_json::Error) -> String {
    serde_json::json!({ "error": format!("[engine-native] {}: {}", fn_name, e) }).to_string()
}

// ── 파싱 실패는 **어느 칸이었는지** 같이 적는다 (2026-09-26 · A) ─────────────
//
// 🔴 **줄·칸만으로는 아무것도 못 찾았다.** 09-25 24판 다섯 번째 #8 이
//   `matchToSimResultNative: control character (U+0000~U+001F) found while
//   parsing a string` 로 죽었는데, 남은 것은 그 한 줄뿐이었다. payload 는
//   4만 바이트가 넘고(실측: 평균 42KB · 자유 문자열 칸 410개) 프로세스는
//   이미 끝나 있어서, 어느 이름·어느 로그 줄이 깨졌는지 알 길이 없었다.
//   같은 씨앗 재실행에 재현도 안 됐다 —
//   **한 번 나고 사라지는 결함은 메시지가 곧 증거다.**
//
// 그래서 파싱 실패 자리는 serde 가 말한 위치를 입력에서 **도려내** 같이 싣는다.
//   · 가장 가까운 앞쪽 `"키":` → 어느 칸이었나
//   · 그 앞뒤 바이트 → 무엇이 들어 있었나
//   · 제어문자는 `\uXXXX` 로 적는다 — 메시지에 **생 제어문자를 남기지 않는다**
//     (09-25 보고서가 그 바이트 둘을 그대로 먹어 파일이 깨졌다 · `6def47067`)
//
// ⚠ **`parse_err` 와 갈라 쓴다.** 입력을 들고 있는 자리(역직렬화)는 `parse_err_at`,
//   입력이 없는 자리(`/serialize`)는 `parse_err` 다. 새 `#[napi]` 입구를 만들면
//   파싱 쪽은 `parse_err_at` 을 쓴다 — 서식은 한 곳(`parse_err`)에서만 만든다.

/// 역직렬화 실패 — 입력의 그 자리를 함께 적는다.
fn parse_err_at(fn_name: &str, e: serde_json::Error, input: &str) -> String {
    let site = failure_site(input, &e);
    serde_json::json!({
        "error": format!("[engine-native] {}: {} · {}", fn_name, e, site)
    }).to_string()
}

/// serde 가 말한 줄·칸을 입력의 바이트 위치로 바꾸고 그 자리를 도려낸다.
fn failure_site(input: &str, e: &serde_json::Error) -> String {
    let b = input.as_bytes();
    // serde_json 의 `line()` 은 1부터, `column()` 은 그 줄에서 읽은 바이트 수다.
    let mut off = 0usize;
    let mut line = 1usize;
    while line < e.line() && off < b.len() {
        if b[off] == b'\n' {
            line += 1;
        }
        off += 1;
    }
    let off = off.saturating_add(e.column().saturating_sub(1)).min(b.len());
    let from = off.saturating_sub(60);
    let to = off.saturating_add(20).min(b.len());
    format!(
        "칸 `{}` · {}바이트째(전체 {}) · …{}⟪여기⟫{}…",
        nearest_key(b, off),
        off,
        b.len(),
        escape_ctrl(&b[from..off]),
        escape_ctrl(&b[off..to]),
    )
}

/// 그 위치보다 앞에서 가장 가까운 `"키":` 의 키 이름. 못 찾으면 `?`.
///
/// ⚠ 배열 안에서 깨지면 **그 배열을 물고 있는 키**가 나온다 — `logs` 처럼
///   같은 칸이 여럿일 때 몇 번째인지는 아래 바이트 창으로 본다.
fn nearest_key(b: &[u8], off: usize) -> String {
    let mut i = off.min(b.len());
    while i >= 2 {
        if b[i - 1] == b':' && b[i - 2] == b'"' {
            let end = i - 2;
            let mut s = end;
            while s > 0 && b[s - 1] != b'"' {
                s -= 1;
            }
            return String::from_utf8_lossy(&b[s..end]).into_owned();
        }
        i -= 1;
    }
    "?".to_string()
}

/// 제어문자를 `\uXXXX` 로 적는다. 깨진 UTF-8 은 대체 문자로 흘린다
/// (바이트 창을 자르면 글자 가운데가 갈릴 수 있다 — 그래도 보여 주는 게 낫다).
fn escape_ctrl(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() + 8);
    for ch in String::from_utf8_lossy(bytes).chars() {
        let c = ch as u32;
        if c < 0x20 || c == 0x7f {
            out.push_str(&format!("\\u{:04x}", c));
        } else {
            out.push(ch);
        }
    }
    out
}

/// 초기 경기 상태 생성
/// 계측 전용 — contact_q 밴드 분포를 읽는다 (릴리스 동작에 영향 없음)
#[napi]
pub fn contact_band_stats_native() -> String {
    let (bands, avg) = match_engine::read_contact_bands();
    serde_json::json!({
        "bands": bands, "avgContactQ": (avg * 100.0).round() / 100.0,
        "labels": ["72+", "60~72", "52~60", "45~52", "38~45", "<38"],
    }).to_string()
}

/// 계측 전용 — 담장 재확인이 결과를 몇 번 바꿨나 (양방향)
#[napi]
pub fn fence_move_stats_native() -> String {
    let m = match_engine::read_fence_moves();
    serde_json::json!({
        "moves": m,
        "labels": ["HR→2루타", "HR→3루타", "HR→뜬공아웃", "2루타→HR", "3루타→HR", "그라운드HR"],
        "홈런_강등": m[0] + m[1] + m[2],
        "홈런_승격": m[3] + m[4] + m[5],
        "홈런_순증": (m[3] + m[4] + m[5]) as i64 - (m[0] + m[1] + m[2]) as i64,
        "승격비율": match_engine::read_promo_ratio(),
        "승격비율_구간": ["1.00~1.02","1.02~1.05","1.05~1.10","1.10~1.20","1.20~1.35","1.35+"],
    }).to_string()
}

/// **폭투 깔때기** — 밸런스 ④ 의 손잡이를 정하는 값 (2026-09-01).
///
/// 총량(KBL 팀당 20.3)만으로는 **문턱을 내릴지 확률을 올릴지** 못 정한다.
/// 둘이 포일에 반대로 작용하기 때문이다 — 포일은 이미 하한 아래(4.6/팀)다.
///
/// ```
///   [1]→[2] 이 좁다   문턱(WILD_PITCH_DISTANCE 1.55)이 병목
///   [2]→[3] 이 좁다   확률(WILD_PITCH_BASE_PROB 0.16)이 병목
/// ```
#[napi]
pub fn wp_funnel_stats_native() -> String {
    let f = match_engine::read_wp_funnel();
    let pct = |a: u64, b: u64| if b == 0 { 0.0 } else { (a as f64 / b as f64 * 1000.0).round() / 10.0 };
    serde_json::json!({
        "전체투구": f[0],
        "주자있고_안휘두름": f[1],
        "폭투후보_존밖": f[2],
        "폭투": f[3],
        "포일": f[4],
        // 각 단계에서 몇 %가 남는가 — **좁아지는 자리가 병목이다**
        "기회율_퍼센트": pct(f[1], f[0]),
        "후보율_퍼센트": pct(f[2], f[1]),
        "폭투전환_퍼센트": pct(f[3], f[2]),
        "포일전환_퍼센트": pct(f[4], f[1] - f[2]),
    }).to_string()
}

/// 계측 전용 — 카운터 초기화
#[napi]
pub fn reset_contact_bands_native() -> String {
    match_engine::reset_contact_bands();
    "{\"ok\":true}".to_string()
}

/// 계측 전용 — 타자 노림수(결정 ⑩)가 얼마나 자주·크게 걸렸나.
///
/// **구종 개수가 산식에 들어오는지**를 재는 자리다. 피안타율로는 잡음에
/// 묻혀서 안 보인다 — `match_engine::READ_TALLY` 머리말 참고.
#[napi]
pub fn read_tally_stats_native() -> String {
    let (avg, rate, pitches) = match_engine::read_read_tally();
    // ⚠ 분모는 **휘두른 공**이다 — `match_engine::READ_TALLY` 머리말 참고
    serde_json::json!({
        "휘두른공당평균읽힌몫": (avg * 1000.0).round() / 1000.0,
        "읽힌비율": (rate * 10000.0).round() / 10000.0,
        "휘두른공": pitches,
    }).to_string()
}

/// 계측 전용 — 노림수 카운터 초기화
#[napi]
pub fn reset_read_tally_native() -> String {
    match_engine::reset_read_tally();
    "{\"ok\":true}".to_string()
}

/// C-3 어댑터(완성) — 끝난 경기를 리그 계약(SimGameResult) 전체로 바꾼다.
/// rot_idx·pitcher_conditions까지 채운다 — 안 넘기면 투수가 무한정 던진다.
#[napi]
pub fn match_to_sim_result_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P {
        state: types::MatchState,
        home_team_id: String,
        away_team_id: String,
        week: i32,
        #[serde(default)] conditions: std::collections::HashMap<String, sim_types::SimPlayerCondition>,
        #[serde(default)] home_rot_idx: usize,
        #[serde(default)] away_rot_idx: usize,
    }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("matchToSimResultNative", e, &params_json),
    };
    let r = match_engine::to_sim_game_result(&p.state, &p.home_team_id, &p.away_team_id,
        p.week, &p.conditions, p.home_rot_idx, p.away_rot_idx);
    serde_json::to_string(&r).unwrap_or_else(|e| parse_err("matchToSimResultNative/serialize", e))
}

/// C-3 어댑터 — 끝난 경기를 리그 계약(MatchResult)으로 바꾼다.
/// **변환만 한다.** 누락이 있으면 여기가 아니라 누적(C-1·C-2)이 안 된 것이다.
#[napi]
pub fn match_to_result_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { state: types::MatchState, home_team_id: String, away_team_id: String }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("matchToResultNative", e, &params_json),
    };
    let r = match_engine::to_match_result(&p.state, &p.home_team_id, &p.away_team_id);
    serde_json::to_string(&r).unwrap_or_else(|e| parse_err("matchToResultNative/serialize", e))
}

/// 상태가 든 씨앗으로 한 번 돌리고 **다음 호출이 이어받을 씨앗**을 남긴다.
///
/// 🔴 **씨앗이 0이면 예전 그대로 `thread_rng`다** — 실제 플레이가 그쪽이다.
/// 계측 모드(`headless.boot()`가 심는 `__PB_MEASURE__`)에서만 호출부가
/// `startMatch`에 씨앗을 넘기고, 그 뒤로는 상태가 씨앗을 물고 다닌다.
///
/// ⚠ **돌린 뒤 씨앗을 갈아 끼운다.** 준 씨앗을 그대로 두면 다음 호출이
/// 같은 난수열을 처음부터 다시 쓴다(`start_match_native`가 먼저 겪은 함정).
/// 0은 "씨앗 없음"이라 `| 1`로 피한다.
///
/// ⚠ 상태를 안 돌려주는 갈래(`GamePhaseResult::PreEntrySim` 등)는 씨앗을
/// 못 갈아 끼운다 — 그때는 다음 호출이 같은 씨앗에서 다시 시작한다.
/// **재현은 되지만** 두 호출의 난수열이 겹친다는 뜻이다. 그 갈래들은
/// 난수를 안 쓰고 분기만 하므로(→ `advance_game_phase`) 실해가 없다.
/// ⚠ 넘어오는 건 `&mut &mut dyn RngCore` 다 — `match_engine` 쪽 함수들이
/// `&mut impl Rng`(즉 `Sized`)를 받으므로 `dyn` 을 한 겹 더 싸야 통과한다.
/// 그 한 겹 덕에 씨앗 갈래와 `thread_rng` 갈래를 **같은 클로저 하나로** 쓴다.
fn seeded<T>(
    seed: u64,
    run: impl FnOnce(&mut &mut dyn rand::RngCore) -> T,
    stamp: impl FnOnce(&mut T, u64),
) -> T {
    if seed != 0 {
        let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
        let mut dyn_rng: &mut dyn rand::RngCore = &mut rng;
        let mut out = run(&mut dyn_rng);
        let next = rng.gen::<u64>() | 1;
        stamp(&mut out, next);
        out
    } else {
        let mut rng = rand::thread_rng();
        let mut dyn_rng: &mut dyn rand::RngCore = &mut rng;
        run(&mut dyn_rng)
    }
}

/// 경기 상태를 만든다.
///
/// **씨앗을 주면 재현된다** — 같은 씨앗·같은 입력이면 언제 몇 번을 돌려도
/// 같은 경기가 된다. 리그 경기(`gameSimulator.ts`)가 그렇게 부른다.
/// 주인공 경기는 **계측 모드에서만** 씨앗을 받는다(`measureMode.ts`) —
/// 실제 플레이는 안 주므로 예전 그대로 `thread_rng`다.
#[napi]
pub fn start_match_native(options_json: String) -> String {
    let opts: MatchStartOptions = match serde_json::from_str(&options_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("startMatchNative", e, &options_json),
    };
    // ⚠ **0은 "씨앗 없음"이다.** `MatchState.rng_seed`가 0을 그 뜻으로 쓰므로
    // 여기서도 같게 본다 — 안 그러면 씨앗 0을 준 경기가 상태에선 씨앗 없음이
    // 되어 두 번째 호출부터 조용히 `thread_rng`로 새 버린다
    let state = match opts.seed.filter(|s| *s != 0) {
        Some(seed) => {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            let mut st = match_engine::create_initial_match_state(&opts, &mut rng);
            // **다음 호출이 이어받을 씨앗**을 남긴다. 준 씨앗을 그대로 두면
            // `simToGameEnd`가 라인업을 만들 때 쓴 난수를 처음부터 다시 쓴다
            st.rng_seed = rng.gen::<u64>() | 1;
            st
        }
        None => {
            let mut rng = rand::thread_rng();
            match_engine::create_initial_match_state(&opts, &mut rng)
        }
    };
    serde_json::to_string(&state).unwrap_or_else(|e| parse_err("startMatchNative/serialize", e))
}

/// 주인공 인터랙티브 투구 (1구)
#[napi]
pub fn step_pitch_native(state_json: String, decision_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("stepPitchNative/state", e, &state_json),
    };
    let decision: PitchDecision = match serde_json::from_str(&decision_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("stepPitchNative/decision", e, &decision_json),
    };
    if !match_engine::is_protagonist_pitching(&state) {
        return serde_json::json!({ "error": "현재 주인공 투구 차례가 아닙니다." }).to_string();
    }
    // 상태가 든 씨앗을 이어받는다 — 0이면 예전 그대로 `thread_rng`(실제 플레이)
    let result = seeded(
        state.rng_seed,
        |rng| match_engine::step_pitch_core(&state, &decision, true, rng),
        |r, next| r.next_state.rng_seed = next,
    );
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("stepPitchNative/serialize", e))
}

/// 경기 종료 처리
#[napi]
pub fn finish_match_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("finishMatchNative", e, &state_json),
    };
    let result = match_engine::finish_match(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("finishMatchNative/serialize", e))
}

/// 현재 주인공 투구 차례 여부
#[napi]
pub fn is_protagonist_pitching_native(state_json: String) -> bool {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(_) => return false,
    };
    match_engine::is_protagonist_pitching(&state)
}

/// 다음 게임 페이즈 결정 (orchestrator)
#[napi]
pub fn advance_game_phase_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("advanceGamePhaseNative", e, &state_json),
    };
    // 상태가 든 씨앗을 이어받는다 — 0이면 예전 그대로 `thread_rng`(실제 플레이).
    // ⚠ 상태를 돌려주는 갈래에만 다음 씨앗을 심는다(→ `seeded` 머리말)
    let result = seeded(
        state.rng_seed,
        |rng| match_engine::advance_game_phase(&state, rng),
        |r, next| match r {
            GamePhaseResult::ProtagonistEntry { state } => state.rng_seed = next,
            GamePhaseResult::ProtagonistExit { state, .. } => state.rng_seed = next,
            GamePhaseResult::AutoBatting { result } => result.next_state.rng_seed = next,
            GamePhaseResult::GameOver { state, .. } => state.rng_seed = next,
            _ => {}
        },
    );
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceGamePhaseNative/serialize", e))
}

/// 등판 트리거 충족 시점까지 자동 시뮬
#[napi]
pub fn sim_until_entry(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("simUntilEntry", e, &state_json),
    };
    // 🔴 **여기가 주인공 경기의 큰 구멍이었다** — 등판 전 이닝을 통째로
    //    돌리면서 `thread_rng`였다. `simToGameEnd`만 씨앗을 이어받고 있었다.
    let result = seeded(
        state.rng_seed,
        |rng| match_engine::auto_simulate_until_entry(&state, rng),
        |s, next| s.rng_seed = next,
    );
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simUntilEntry/serialize", e))
}

/// 게임 종료까지 자동 시뮬
#[napi]
pub fn sim_to_game_end(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("simToGameEnd", e, &state_json),
    };
    // 상태가 씨앗을 들고 있으면 이어받는다 — `startMatchNative`가 심어 둔다.
    // 0이면 예전 그대로 `thread_rng`다
    let result = seeded(
        state.rng_seed,
        |rng| match_engine::auto_simulate_to_game_end(&state, rng),
        |s, next| s.rng_seed = next,
    );
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simToGameEnd/serialize", e))
}

/// 반이닝 자동 시뮬
#[napi]
pub fn sim_half_inning(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("simHalfInning", e, &state_json),
    };
    let result = seeded(
        state.rng_seed,
        |rng| match_engine::auto_simulate_half_inning(&state, rng),
        |r, next| r.next_state.rng_seed = next,
    );
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simHalfInning/serialize", e))
}

/// 감독 자동 마운드 방문 체크
#[napi]
pub fn auto_mound_visit_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("autoMoundVisitNative", e, &state_json),
    };
    let result = match_engine::auto_mound_visit_if_needed(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("autoMoundVisitNative/serialize", e))
}

/// 마운드 방문 적용
#[napi]
pub fn request_mound_visit_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("requestMoundVisitNative", e, &state_json),
    };
    let result = match_engine::request_mound_visit(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("requestMoundVisitNative/serialize", e))
}

/// 주인공 강판 판단
#[napi]
pub fn should_protagonist_exit_native(state_json: String) -> String {
    let state: MatchState = match serde_json::from_str(&state_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("shouldProtagonistExitNative", e, &state_json),
    };
    let result = match_engine::should_protagonist_exit(&state);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("shouldProtagonistExitNative/serialize", e))
}

/// 헤드리스 게임 시뮬 (튜닝 랩용)
#[napi]
pub fn run_simple_game(params_json: String) -> String {
    let params: RunSimpleGameParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("runSimpleGame", e, &params_json),
    };
    // ⚠ **0은 「씨앗 없음」이다** — `startMatchNative` 와 같은 규약이다
    let result = match params.seed.filter(|s| *s != 0) {
        Some(seed) => {
            let mut rng = rand::rngs::StdRng::seed_from_u64(seed);
            match_engine::run_simple_game(&params, &mut rng)
        }
        None => {
            let mut rng = rand::thread_rng();
            match_engine::run_simple_game(&params, &mut rng)
        }
    };
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runSimpleGame/serialize", e))
}

// ── NPC 시뮬 (Phase 3) ────────────────────────────────────────────────────────

/// NPC 게임 헤드리스 시뮬
#[napi]
pub fn sim_game_native(params_json: String) -> String {
    let params: SimGameParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("simGameNative", e, &params_json),
    };
    let result = npc_sim::sim_game(&params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simGameNative/serialize", e))
}

/// 오프시즌 전체 처리
#[napi]
pub fn run_offseason_native(params_json: String) -> String {
    let params: OffseasonParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("runOffseasonNative", e, &params_json),
    };
    let result = npc_sim::run_offseason(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runOffseasonNative/serialize", e))
}

/// 고교 학년 진급
#[napi]
pub fn advance_grades_native(params_json: String) -> String {
    let params: AdvanceGradesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("advanceGradesNative", e, &params_json),
    };
    let result = npc_sim::advance_grades(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceGradesNative/serialize", e))
}

/// NPC 주간 성장/하락 처리
#[napi]
pub fn npc_calc_weekly_growth(params_json: String) -> String {
    let params: MonthlyNpcGrowthParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("npcCalcWeeklyGrowth", e, &params_json),
    };
    let result = npc_sim::calc_weekly_npc_growth(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("npcCalcWeeklyGrowth/serialize", e))
}

/// 신입생 벌크 생성
#[napi]
pub fn generate_freshmen_native(params_json: String) -> String {
    let params: GenerateFreshmenParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("generateFreshmenNative", e, &params_json),
    };
    let result = npc_sim::generate_freshmen(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateFreshmenNative/serialize", e))
}

/// FA 시장 정산 — 등급·계약·보상선수를 한 번에
#[napi]
pub fn resolve_fa_market_native(params_json: String) -> String {
    let params: free_agency::FaMarketParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("resolveFaMarketNative", e, &params_json),
    };
    let result = free_agency::resolve_market(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("resolveFaMarketNative/serialize", e))
}

// ── 개인 재정 (Phase 7-5 F-3) ─────────────────────────────────
//
// 화면은 결과를 **표시만** 한다. 예전 FinancePage는 Svelte 안에서 OVR·사기로
// 수입을 즉석 계산해 `money`와 무관한 숫자를 보여주고 있었다.

/// 주간 수입·지출·세금. `money`에 더할 순현금을 낸다
#[napi]
pub fn calc_club_expense_native(params_json: String) -> String {
    let params: finance::ClubExpenseParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err_at("calcClubExpenseNative", e, &params_json),
    };
    serde_json::to_string(&finance::calc_club_expense(params))
        .unwrap_or_else(|e| parse_err("calcClubExpenseNative/serialize", e))
}

#[napi]
pub fn calc_club_revenue_native(params_json: String) -> String {
    let params: finance::ClubRevenueParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err_at("calcClubRevenueNative", e, &params_json),
    };
    serde_json::to_string(&finance::calc_club_revenue(params))
        .unwrap_or_else(|e| parse_err("calcClubRevenueNative/serialize", e))
}

#[napi]
pub fn calc_weekly_finance_native(params_json: String) -> String {
    let params: finance::WeeklyFinanceParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcWeeklyFinanceNative", e, &params_json),
    };
    serde_json::to_string(&finance::calc_weekly_finance(params))
        .unwrap_or_else(|e| parse_err("calcWeeklyFinanceNative/serialize", e))
}

/// 명성 연동 스폰서 오퍼. 학생·독립은 빈 결과 (아마추어 규정)
#[napi]
pub fn calc_sponsor_offers_native(params_json: String) -> String {
    let params: finance::SponsorOfferParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcSponsorOffersNative", e, &params_json),
    };
    serde_json::to_string(&finance::calc_sponsor_offers(params))
        .unwrap_or_else(|e| parse_err("calcSponsorOffersNative/serialize", e))
}

/// 개인 트레이닝 구독 보너스 — **팀 자원에 반비례**한다
#[napi]
pub fn calc_training_bonus_native(params_json: String) -> String {
    let params: finance::TrainingBonusParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcTrainingBonusNative", e, &params_json),
    };
    serde_json::to_string(&finance::calc_training_bonus(params))
        .unwrap_or_else(|e| parse_err("calcTrainingBonusNative/serialize", e))
}

/// 시즌말 투자 정산. 원금 손실 가능, 전액 소실은 없음
#[napi]
pub fn resolve_investment_native(params_json: String) -> String {
    let params: finance::InvestmentParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("resolveInvestmentNative", e, &params_json),
    };
    serde_json::to_string(&finance::resolve_investment(params))
        .unwrap_or_else(|e| parse_err("resolveInvestmentNative/serialize", e))
}

/// 사치품 소비 — 동료면 관계도, 자기 소비면 성격에 따라 명성 ±
#[napi]
pub fn calc_luxury_native(params_json: String) -> String {
    let params: finance::LuxuryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcLuxuryNative", e, &params_json),
    };
    serde_json::to_string(&finance::calc_luxury(params))
        .unwrap_or_else(|e| parse_err("calcLuxuryNative/serialize", e))
}

// ── 대학 비경기성 이벤트 (Phase 7-7) ─────────────────────────

/// 전국대학선수쇼케이스 — 팀 추천 + 주목도 상위 + 구단 지명 세 경로
#[napi]
pub fn run_showcase_native(params_json: String) -> String {
    let params: campus_events::ShowcaseParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err_at("runShowcaseNative", e, &params_json),
    };
    serde_json::to_string(&campus_events::run_showcase(params))
        .unwrap_or_else(|e| parse_err("runShowcaseNative/serialize", e))
}

/// 대학 올스타전(북 vs 남) — 포지션 쿼터 + 대학당 캡
#[napi]
pub fn run_allstar_native(params_json: String) -> String {
    let params: campus_events::AllStarParams = match serde_json::from_str(&params_json) {
        Ok(v) => v, Err(e) => return parse_err_at("runAllstarNative", e, &params_json),
    };
    serde_json::to_string(&campus_events::run_allstar(params))
        .unwrap_or_else(|e| parse_err("runAllstarNative/serialize", e))
}

/// 국가대표 발탁 — 그 해 대회가 없으면 빈 결과
#[napi]
pub fn select_national_squad_native(params_json: String) -> String {
    let params: national_team::SelectSquadParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("selectNationalSquadNative", e, &params_json),
    };
    let result = national_team::select_squad(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("selectNationalSquadNative/serialize", e))
}

/// 국제대회 결과 — 경기는 시뮬하지 않고 대표팀 전력으로 순위를 뽑는다
#[napi]
pub fn simulate_tournament_native(params_json: String) -> String {
    let params: national_team::TournamentParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("simulateTournamentNative", e, &params_json),
    };
    let result = national_team::simulate_tournament(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("simulateTournamentNative/serialize", e))
}

/// 드래프트 후보 선정 — 졸업생 + 대학 재학 얼리 신청 + 독립리그 신청
#[napi]
pub fn select_draft_candidates_native(params_json: String) -> String {
    let params: draft::SelectCandidatesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("selectDraftCandidatesNative", e, &params_json),
    };
    let result = draft::select_candidates(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("selectDraftCandidatesNative/serialize", e))
}

/// NPC 드래프트 시뮬
#[napi]
pub fn run_draft_native(params_json: String) -> String {
    let params: DraftSimParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("runDraftNative", e, &params_json),
    };
    let result = npc_sim::run_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("runDraftNative/serialize", e))
}

/// 드래프트 결과 NPC에 적용
#[napi]
pub fn apply_draft_native(params_json: String) -> String {
    let params: ApplyDraftParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("applyDraftNative", e, &params_json),
    };
    let result = npc_sim::apply_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("applyDraftNative/serialize", e))
}

/// 배경 고교 졸업생 드래프트 시뮬레이션

#[napi]
pub fn determine_protagonist_draft_native(params_json: String) -> String {
    let params: ProtagonistDraftParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("determineProtagonistDraftNative", e, &params_json),
    };
    let result = npc_sim::determine_protagonist_draft(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("determineProtagonistDraftNative/serialize", e))
}


/// 주인공 학년 진급
#[napi]
pub fn advance_protagonist_grade_native(params_json: String) -> String {
    let params: ProtagonistGradeParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("advanceProtagonistGradeNative", e, &params_json),
    };
    let result = npc_sim::advance_protagonist_grade(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceProtagonistGradeNative/serialize", e))
}

/// HS + 대학 전체 학년 진급 (단일 호출)
#[napi]
pub fn advance_all_grades_native(params_json: String) -> String {
    let params: AdvanceGradesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("advanceAllGradesNative", e, &params_json),
    };
    let result = npc_sim::advance_all_grades(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceAllGradesNative/serialize", e))
}

/// 전체 NPC 나이 +1 (학년 진급 이후 단일 호출)
#[napi]
pub fn advance_all_ages_native(params_json: String) -> String {
    let params: AdvanceAllAgesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("advanceAllAgesNative", e, &params_json),
    };
    let result = npc_sim::advance_all_ages(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("advanceAllAgesNative/serialize", e))
}

// ── 성장 엔진 (Phase 4) ───────────────────────────────────────────────────────

/// 주간 훈련 성장 계산
#[napi]
pub fn calc_training_growth_native(params_json: String) -> String {
    let params: TrainingGrowthParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcTrainingGrowthNative", e, &params_json),
    };
    let result = growth_engine::calc_training_growth(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcTrainingGrowthNative/serialize", e))
}

/// 훈련 계획 미리보기 — **실제 계산과 같은 `plan_load`를 쓴다.**
///
/// 훈련 화면이 자기 식으로 예상치를 만들던 시절엔 슬롯 배수(0.5)도 피로 구간
/// 승수(1.5/2.5/4.0)도 몰라서, 화면은 "피로 +7"이라 하고 엔진은 −4.25를
/// 적용했다 — 부호가 반대였다. 화면은 이제 계산하지 않고 묻는다.
#[napi]
pub fn preview_training_native(params_json: String) -> String {
    let params: growth_engine::TrainingPreviewParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("previewTrainingNative", e, &params_json),
    };
    let result = growth_engine::preview_training(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("previewTrainingNative/serialize", e))
}

/// 훈련 효율 계수 — **화면에 보여 줄 계수 셋과 그 곱.**
///
/// 🔴 이 셋이 TS(`utils/growthEngine.ts`)에 **옮겨 적혀** 있었다 (결정 ④).
///   훈련 화면의 「이번 주 훈련 성과」와 소식 선택지의 「→ 훈련 효율 ±N%」가
///   그 사본을 썼고, 검사는 **Rust 파일을 문자열로 읽어** 식이 그대로인지
///   보는 것으로 겨우 막고 있었다. 계수가 나는 자리를 여기 하나로 모은다 —
///   `week_xp` 도 같은 함수(`condition_factor` 셋)를 부른다.
///
/// ⚠ **여럿을 한 번에 묻는다**(`queries`). 화면은 「지금」과 「고른 뒤」를
///   나란히 재는데 하나씩 물으면 선택지마다 왕복이 둘씩 생긴다.
#[napi]
pub fn training_efficiency_native(params_json: String) -> String {
    let params: growth_engine::TrainingEfficiencyParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("trainingEfficiencyNative", e, &params_json),
    };
    let result = growth_engine::training_efficiency(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("trainingEfficiencyNative/serialize", e))
}

/// 이번 주 부상 확률 — **`calc_injury`가 굴리는 것과 같은 식이다.**
/// 훈련 화면이 예상 피로로 이걸 물어 "부상위험 N%"를 낸다.
#[napi]
pub fn injury_chance_native(params_json: String) -> String {
    let p: week_engine::InjuryPayload = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("injuryChanceNative", e, &params_json),
    };
    // 유예 주는 "임계를 넘은 첫 주"라 화면 미리보기에서는 알 수 없다 — 안전하게 false
    let chance = week_engine::injury_trigger_chance(&p, false);
    serde_json::to_string(&serde_json::json!({ "chance": chance }))
        .unwrap_or_else(|e| parse_err("injuryChanceNative/serialize", e))
}

/// 폼 무너짐 조회 — **경기에 걸리는 것과 같은 식이다.**
/// 훈련·내 정보 화면이 "제구 −3 · 커맨드 −2"를 이걸로 띄운다.
#[napi]
pub fn form_penalty_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { difficulty: f64, control: f64 }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("formPenaltyNative", e, &params_json),
    };
    let (cmd, ctl) = tuning::form_penalty(p.difficulty, p.control);
    serde_json::to_string(&serde_json::json!({ "command": cmd, "control": ctl }))
        .unwrap_or_else(|e| parse_err("formPenaltyNative/serialize", e))
}

/// 경기 성장 계산
#[napi]
pub fn calc_game_growth_native(params_json: String) -> String {
    let params: GameGrowthParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcGameGrowthNative", e, &params_json),
    };
    let result = growth_engine::calc_game_growth(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcGameGrowthNative/serialize", e))
}

/// 주인공 에이징 (시즌 종료 1회 호출)
#[napi]
pub fn calc_protagonist_aging_native(params_json: String) -> String {
    let params: growth_engine::ProtagonistAgingParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcProtagonistAgingNative", e, &params_json),
    };
    let result = growth_engine::calc_protagonist_aging(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcProtagonistAgingNative/serialize", e))
}

// ── 플레이어 엔진 (Phase 4) ───────────────────────────────────────────────────

/// 진로 선택 → 다음 스텝
#[napi]
pub fn resolve_career_choice_native(params_json: String) -> String {
    let params: ResolveChoiceParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("resolveCareerChoiceNative", e, &params_json),
    };
    let result = player_engine::resolve_career_choice(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("resolveCareerChoiceNative/serialize", e))
}

/// 고교 투수 포지션 배정 (SP / RP)
#[napi]
pub fn assign_highschool_position_native(params_json: String) -> String {
    let params: AssignHighschoolPositionParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("assignHighschoolPositionNative", e, &params_json),
    };
    let result = player_engine::assign_highschool_position(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("assignHighschoolPositionNative/serialize", e))
}

/// 투수 보직 추천 — 세부 능력치 적합도 + 팀내 자리 경쟁 (PLAN_ROLE_RECOMMEND §2·§3 · 1.1 A①).
/// 규칙(가중치·구종 계수)은 TS 가 `generation_rules.json` `pitcherRoleRules` 에서 읽어 넘긴다
#[napi]
pub fn recommend_pitcher_role_native(params_json: String) -> String {
    let params: pitcher_role::RecommendRoleParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("recommendPitcherRoleNative", e, &params_json),
    };
    let result = pitcher_role::recommend_pitcher_role(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("recommendPitcherRoleNative/serialize", e))
}

/// 주인공 투수 역할 배정
#[napi]
pub fn assign_protagonist_role_native(params_json: String) -> String {
    let params: AssignRoleParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("assignProtagonistRoleNative", e, &params_json),
    };
    let result = player_engine::assign_protagonist_role(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("assignProtagonistRoleNative/serialize", e))
}

/// 불펜 등판 판정
#[napi]
pub fn reliever_would_pitch_native(params_json: String) -> String {
    let params: RelieverPitchParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("relieverWouldPitchNative", e, &params_json),
    };
    let result = player_engine::reliever_would_pitch(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("relieverWouldPitchNative/serialize", e))
}

/// 선발 등판 판정 — 추천 밖 깊이만큼 그 주 등판을 건너뛴다 (1.1 A④ §5-a)
#[napi]
pub fn starter_would_start_native(params_json: String) -> String {
    let params: player_engine::StarterStartParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("starterWouldStartNative", e, &params_json),
    };
    let result = player_engine::starter_would_start(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("starterWouldStartNative/serialize", e))
}

/// 시즌 레이팅 계산
#[napi]
pub fn calc_season_rating_native(params_json: String) -> String {
    let params: CalcSeasonRatingParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcSeasonRatingNative", e, &params_json),
    };
    let result = player_engine::calc_season_rating(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcSeasonRatingNative/serialize", e))
}

/// 시장 연봉 계산
#[napi]
pub fn calc_market_salary_native(params_json: String) -> String {
    let params: CalcMarketSalaryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcMarketSalaryNative", e, &params_json),
    };
    let result = player_engine::calc_market_salary(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcMarketSalaryNative/serialize", e))
}

/// 제안 연봉 계산
#[napi]
pub fn calc_offered_salary_native(params_json: String) -> String {
    let params: CalcOfferedSalaryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcOfferedSalaryNative", e, &params_json),
    };
    let result = player_engine::calc_offered_salary(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcOfferedSalaryNative/serialize", e))
}

/// 주인공 제안 연봉 계산 (시즌 스탯 반영)
#[napi]
pub fn calc_offered_salary_for_protagonist_native(params_json: String) -> String {
    let params: CalcOfferedSalaryForProtagonistParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcOfferedSalaryForProtagonistNative", e, &params_json),
    };
    let result = player_engine::calc_offered_salary_for_protagonist(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcOfferedSalaryForProtagonistNative/serialize", e))
}

/// NPC 재계약 연봉 계산
#[napi]
pub fn calc_npc_renewal_salary_native(params_json: String) -> String {
    let params: player_engine::CalcNpcRenewalSalaryParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcNpcRenewalSalaryNative", e, &params_json),
    };
    let result = player_engine::calc_npc_renewal_salary(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcNpcRenewalSalaryNative/serialize", e))
}

/// 성적 점수 (−1 ~ +1) — **승강 판정이 쓰는 그 함수를 그대로 연다.**
///
/// 외국인 재계약이 능력치·나이만 봤다. 성적을 넣으려면 눈금이 필요한데,
/// TS에 다시 구현하면 표가 둘이 되어 "승강은 잘했다는데 재계약은 불가"가
/// 나온다(`CLAUDE.md`: 코드에 표를 두 번 적지 말 것 — Phase 7에서 15건).
///
/// 표본 보정이 함수 안에 있다 — 투수 40이닝·타자 120타석 미만이면 그
/// 비율만큼만 반영되고 0이닝이면 0이다. 기존 주석이 걱정하던 "표본이 얇은
/// 선수를 억울하게 자른다"가 여기서 이미 풀린다.
#[napi]
pub fn form_score_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P {
        perf: Option<sim_types::RosterPerf>,
        is_pitcher: bool,
        #[serde(default)]
        rules: Option<team_engine::PromotionRules>,
    }
    let p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("formScoreNative", e, &params_json),
    };
    let rules = p.rules.unwrap_or_default();
    let v = team_engine::form_score(p.perf.as_ref(), p.is_pitcher, &rules);
    serde_json::to_string(&v).unwrap_or_else(|e| parse_err("formScoreNative/serialize", e))
}

/// 포지션 공백 메우기 — **시즌 중에도 부를 수 있게 연다.**
///
/// 🔴 이 함수는 `normalize_offseason_npcs` 안에만 있어 **오프시즌에 한 번**
/// 돌았다. 그런데 공백은 시즌 중에 생긴다:
///
///   ① 1군 포수가 0명이 된다            부상·방출·은퇴
///   ② 콜업이 2군 마지막 포수를 올린다   (1군 0명이 2군 0명보다 나쁘다)
///   ③ 2군 포수가 0명이 된다
///   ④ 아무도 안 메운다                 이 함수가 오프시즌 전용이라
///
/// ④가 이 export로 닫힌다. 실제 야구도 포수가 없으면 다른 야수가 마스크를 쓴다.
///
/// ⚠ **공백이 있는 팀의 선수만 보낸다.** 전량(7,332명)을 주마다 왕복시키면
/// 이 프로젝트가 줄인 IPC를 도로 까먹는다. 공백은 리그당 1~4팀이다.
/// 팀 안 등번호를 유일하게 만든다 — **문제가 있는 팀의 선수만 보낸다.**
///
/// ⚠ 팀 선수를 **모두** 보내야 한다. 빈 번호를 팀 단위로 세므로 일부만
///   보내면 이미 쓰는 번호를 다시 준다.
#[napi]
pub fn fix_jersey_numbers_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P {
        npcs: Vec<sim_types::NpcSaveState>,
        /// 팀 id → 영구결번. ⚠ `serde(default)` 라 **안 넘겨도 통과한다** —
        /// 그래서 배선 검사가 이걸 따로 본다.
        #[serde(default)]
        retired_numbers: std::collections::HashMap<String, Vec<i32>>,
    }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Change { npc_id: String, team_id: String, from: i32, to: i32 }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct R { changes: Vec<Change> }
    let mut p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("fixJerseyNumbersNative", e, &params_json),
    };
    let before: Vec<i32> = p.npcs.iter().map(|n| n.jersey_number).collect();
    npc_sim::fix_jersey_numbers(&mut p.npcs, &p.retired_numbers);
    // **바뀐 사람만 돌려준다** — 전량을 얹으면 다른 필드까지 덮어쓴다
    let changes: Vec<Change> = p.npcs.iter().zip(before.iter())
        .filter(|(n, b)| n.jersey_number != **b)
        .map(|(n, b)| Change {
            npc_id: n.npc_id.clone(),
            team_id: n.current_team.clone(),
            from: *b,
            to: n.jersey_number,
        })
        .collect();
    serde_json::to_string(&R { changes })
        .unwrap_or_else(|e| parse_err("fixJerseyNumbersNative/serialize", e))
}

#[napi]
pub fn fix_position_gaps_native(params_json: String) -> String {
    #[derive(serde::Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct P { npcs: Vec<sim_types::NpcSaveState>, season_year: i32 }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct Change { npc_id: String, team_id: String, from: String, to: String }
    #[derive(serde::Serialize)]
    #[serde(rename_all = "camelCase")]
    struct R { changes: Vec<Change> }
    let mut p: P = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("fixPositionGapsNative", e, &params_json),
    };
    let before: Vec<String> = p.npcs.iter().map(|n| n.position.clone()).collect();
    npc_sim::fix_position_gaps(&mut p.npcs, p.season_year);
    // **바뀐 사람만 돌려준다.** 전량을 돌려주면 호출부가 그걸 스토어에 얹으면서
    // 다른 필드까지 덮어쓴다 — 그 사이 다른 처리가 바꾼 값이 사라진다
    let changes: Vec<Change> = p.npcs.iter().zip(before.iter())
        .filter(|(n, b)| n.position != **b)
        .map(|(n, b)| Change {
            npc_id: n.npc_id.clone(),
            team_id: n.current_team.clone(),
            from: b.clone(),
            to: n.position.clone(),
        })
        .collect();
    serde_json::to_string(&R { changes })
        .unwrap_or_else(|e| parse_err("fixPositionGapsNative/serialize", e))
}

/// NPC 재계약 기간 계산
#[napi]
pub fn calc_npc_contract_years_native(params_json: String) -> String {
    let params: player_engine::CalcNpcContractYearsParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcNpcContractYearsNative", e, &params_json),
    };
    let result = player_engine::calc_npc_contract_years(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcNpcContractYearsNative/serialize", e))
}

/// FA 오퍼 생성
#[napi]
pub fn generate_fa_offers_native(params_json: String) -> String {
    let params: GenerateFaOffersParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("generateFaOffersNative", e, &params_json),
    };
    let result = player_engine::generate_fa_offers(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateFaOffersNative/serialize", e))
}

/// 드래프트 순위/계약금 계산
#[napi]
pub fn calc_draft_rank_native(params_json: String) -> String {
    let params: CalcDraftRankParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcDraftRankNative", e, &params_json),
    };
    let result = player_engine::calc_draft_rank(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcDraftRankNative/serialize", e))
}

/// 체육부대 후보 30명 공개 (W50 루머)
#[napi]
pub fn calc_sports_unit_candidates_native(params_json: String) -> String {
    let params: SportsUnitCandidatesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcSportsUnitCandidatesNative", e, &params_json),
    };
    let result = npc_sim::calc_sports_unit_candidates(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcSportsUnitCandidatesNative/serialize", e))
}

/// **유망주 순위 (주간 TOP10)** — 점수 계산과 정렬을 함께 한다.
///
/// 🔴 이 계산이 통째로 TS(`top10Engine.ts`)에 있었다. `simNpcScout`는
///   id 뒷자리로 만드는 **유사난수**였다 — `Math.random()`은 아니지만
///   난수를 TS가 만드는 것은 같다.
/// ⚠ **정렬까지 여기서 한다.** 점수만 돌려주면 동점 처리가 두 곳에서 갈린다.
#[napi]
pub fn calc_prospect_rank_native(params_json: String) -> String {
    let params: player_engine::ProspectRankParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcProspectRankNative", e, &params_json),
    };
    let result = player_engine::calc_prospect_rank(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcProspectRankNative/serialize", e))
}

/// **주인공의 잠재력·성장률** — 새 게임에서 한 번 굴린다.
///
/// 🔴 이 둘을 **화면(`NewGamePage.svelte`)이 `Math.random()`으로 굴리고
///   있었다.** NPC는 `roster_gen`이 만드는데 주인공만 화면에서 만들었다.
/// ⚠ **분포는 안 바꿨다** — 옮기기만 했다. 값은 `protagonistRules`가 정본이다.
#[napi]
pub fn gen_protagonist_hidden_native(params_json: String) -> String {
    let params: roster_gen::ProtagonistHiddenParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("genProtagonistHiddenNative", e, &params_json),
    };
    let result = roster_gen::gen_protagonist_hidden(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("genProtagonistHiddenNative/serialize", e))
}

/// **투수 승패 판정** — W · L · SV · HD · ND.
///
/// 🔴 **이 규칙이 두 벌이었다.** `npc_sim`의 클로저 안에 갇혀 있어서
///   TS(`applyGameOutcome.ts`)가 손으로 옮겨 적었고, 그 사본이 이미
///   갈라져 있었다 — 세이브 조건과 여유 점수가 달랐다.
///   **주인공만 다른 승패 규칙**을 쓰고 있었다는 뜻이다.
///
/// ⚠ 이걸 내보내는 이유는 하나다 — TS가 규칙을 **다시 적지 않게** 하려고.
#[napi]
pub fn calc_pitcher_decision_native(params_json: String) -> String {
    let params: npc_sim::PitcherDecisionParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcPitcherDecisionNative", e, &params_json),
    };
    let result = npc_sim::calc_pitcher_decision(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcPitcherDecisionNative/serialize", e))
}

/// 체육부대 최종 선발 (W52 입대 신청자 기준)
#[napi]
pub fn calc_sports_unit_selection_native(params_json: String) -> String {
    let params: SportsUnitSelectionParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcSportsUnitSelectionNative", e, &params_json),
    };
    let result = npc_sim::calc_sports_unit_selection(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcSportsUnitSelectionNative/serialize", e))
}

/// 일반병 입대 대상 랜덤 선택 (시즌당 max_count명 상한)
#[napi]
pub fn pick_general_enlistees_native(params_json: String) -> String {
    let params: PickGeneralEnlisteesParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("pickGeneralEnlisteesNative", e, &params_json),
    };
    let result = npc_sim::pick_general_enlistees(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("pickGeneralEnlisteesNative/serialize", e))
}

/// 조기 입대 자발적 선택 결정 (25~27세 주전 경쟁 탈락 KBL 선수)
#[napi]
pub fn calc_early_enlist_decisions_native(params_json: String) -> String {
    let params: CalcEarlyEnlistParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcEarlyEnlistDecisionsNative", e, &params_json),
    };
    let result = npc_sim::calc_early_enlist_decisions(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcEarlyEnlistDecisionsNative/serialize", e))
}

/// 독립리그 KBL 스카우트 제의 계산
#[napi]
pub fn calc_indie_scout_offer_native(params_json: String) -> String {
    let params: player_engine::IndieScoutOfferParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("calcIndieScoutOfferNative", e, &params_json),
    };
    let result = player_engine::calc_indie_scout_offer(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("calcIndieScoutOfferNative/serialize", e))
}

// ── 스케줄 엔진 ───────────────────────────────────────────────────────────────

/// 권역 주말리그 — 권역 크기가 달라도 팀당 경기 수를 균등하게 (Phase 5-3)
#[napi]
pub fn generate_regional_schedule_native(p: String) -> String {
    let params: GenerateRegionalScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateRegionalScheduleNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_regional_schedule(params))
        .unwrap_or_else(|e| parse_err("generateRegionalScheduleNative/serialize", e))
}

// ── 토너먼트 (Phase 5-4) ──────────────────────────────────────────────────────

/// 권역 순위 → 전국대회 참가팀 선발 (권역 크기 비례 배분 + 와일드카드)
#[napi]
pub fn select_tournament_entrants_native(p: String) -> String {
    let params: tournament::SelectEntrantsParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("selectTournamentEntrantsNative", e, &p),
    };
    serde_json::to_string(&tournament::select_tournament_entrants(params))
        .unwrap_or_else(|e| parse_err("selectTournamentEntrantsNative/serialize", e))
}

/// 시드 순 참가팀 → 전 라운드 브래킷 뼈대 (부전승 자동 반영)
#[napi]
pub fn generate_tournament_bracket_native(p: String) -> String {
    let params: tournament::GenerateTournamentParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateTournamentBracketNative", e, &p),
    };
    serde_json::to_string(&tournament::generate_tournament_bracket(params))
        .unwrap_or_else(|e| parse_err("generateTournamentBracketNative/serialize", e))
}

/// 한 라운드 결과 반영 → 다음 라운드 대진 확정
#[napi]
pub fn advance_tournament_round_native(p: String) -> String {
    let params: tournament::AdvanceTournamentParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("advanceTournamentRoundNative", e, &p),
    };
    serde_json::to_string(&tournament::advance_tournament_round(params))
        .unwrap_or_else(|e| parse_err("advanceTournamentRoundNative/serialize", e))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct BracketRoundQuery {
    bracket: tournament::TournamentBracket,
    round: u32,
}

/// 해당 라운드에서 **실제로 치를** 경기만 일정 형태로 (부전승·미확정 제외)
#[napi]
pub fn tournament_round_schedule_native(p: String) -> String {
    let q: BracketRoundQuery = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("tournamentRoundScheduleNative", e, &p),
    };
    serde_json::to_string(&tournament::bracket_to_schedule(&q.bracket, q.round))
        .unwrap_or_else(|e| parse_err("tournamentRoundScheduleNative/serialize", e))
}

/// 프로 2군 축약 포스트시즌 — 상위 4팀 단판 사다리 (Phase 5-7)
#[napi]
pub fn build_farm_bracket_native(p: String) -> String {
    let params: postseason_engine::BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("buildFarmBracketNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::build_farm_bracket(params))
        .unwrap_or_else(|e| parse_err("buildFarmBracketNative/serialize", e))
}

// ── 스태프 생성 (Phase 6A) ────────────────────────────────────────────────────

/// 팀 목록 + 생성 규칙 → 스태프 전원 (worldSeed 결정적)
#[napi]
pub fn generate_staff_native(p: String) -> String {
    let params: staff_gen::GenerateStaffParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateStaffNative", e, &p),
    };
    serde_json::to_string(&staff_gen::generate_staff(params))
        .unwrap_or_else(|e| parse_err("generateStaffNative/serialize", e))
}

/// 시즌 종료 → 스태프 나이·경력성장·은퇴·경질·이동 (Phase 6B)
#[napi]
pub fn advance_staff_season_native(p: String) -> String {
    let params: staff_lifecycle::AdvanceStaffParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("advanceStaffSeasonNative", e, &p),
    };
    serde_json::to_string(&staff_lifecycle::advance_staff_season(params))
        .unwrap_or_else(|e| parse_err("advanceStaffSeasonNative/serialize", e))
}

// ── 군경팀 로스터 (Phase 6.5) ────────────────────────────────────────────────

/// 상무 로스터 — 복무 중인 선수 + 계급 + 전역 연도 (원소속은 실재 팀에서 지정)
#[napi]
pub fn generate_military_roster_native(p: String) -> String {
    let params: military_roster::GenerateMilitaryRosterParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateMilitaryRosterNative", e, &p),
    };
    serde_json::to_string(&military_roster::generate_military_roster(params))
        .unwrap_or_else(|e| parse_err("generateMilitaryRosterNative/serialize", e))
}

// ── 경력 이력 (Phase 6.5) ────────────────────────────────────────────────────

/// 새 게임 시점의 과거 경력 (입단·이적) — slot.db transactions로 들어간다
#[napi]
pub fn generate_career_history_native(p: String) -> String {
    let params: career_history::GenerateCareerHistoryParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateCareerHistoryNative", e, &p),
    };
    serde_json::to_string(&career_history::generate_career_history(params))
        .unwrap_or_else(|e| parse_err("generateCareerHistoryNative/serialize", e))
}

// ── 관계도 (Phase 6C) ────────────────────────────────────────────────────────

/// 새로 만난 사람들의 초기 관계값 (중립 0 + 성향 편차)
#[napi]
pub fn init_relations_native(p: String) -> String {
    let params: relationship::InitRelationParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("initRelationsNative", e, &p),
    };
    serde_json::to_string(&relationship::init_relations(params))
        .unwrap_or_else(|e| parse_err("initRelationsNative/serialize", e))
}

/// 주간 관계 갱신 — contact가 together인 상대만 움직인다
#[napi]
pub fn weekly_relations_native(p: String) -> String {
    let params: relationship::WeeklyRelationParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weeklyRelationsNative", e, &p),
    };
    serde_json::to_string(&relationship::weekly_relations(params))
        .unwrap_or_else(|e| parse_err("weeklyRelationsNative/serialize", e))
}

/// 시즌 종료 — together는 총평 가산, apart는 감쇠, ended는 동결
#[napi]
pub fn season_relations_native(p: String) -> String {
    let params: relationship::SeasonRelationParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("seasonRelationsNative", e, &p),
    };
    serde_json::to_string(&relationship::season_relations(params))
        .unwrap_or_else(|e| parse_err("seasonRelationsNative/serialize", e))
}

/// 팀 이동 감쇠 (감쇠 후 보존 — 행은 남는다)
#[napi]
pub fn relation_move_decay_native(p: String) -> String {
    let params: relationship::MoveDecayParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("relationMoveDecayNative", e, &p),
    };
    serde_json::to_string(&relationship::move_decay(params))
        .unwrap_or_else(|e| parse_err("relationMoveDecayNative/serialize", e))
}

/// 관계 → 실제 판정 보정 (보직 OVR 평가 · 훈련 효율)
#[napi]
pub fn relation_effects_native(p: String) -> String {
    let params: relationship::RelationEffectParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("relationEffectsNative", e, &p),
    };
    serde_json::to_string(&relationship::relation_effects(params))
        .unwrap_or_else(|e| parse_err("relationEffectsNative/serialize", e))
}

/// 7단계 라벨 표. TS `types/relationship.ts`의 미러가 어긋났는지 대조하는 데 쓴다
#[napi]
pub fn relation_label_table_native() -> String {
    serde_json::to_string(&relationship::label_table())
        .unwrap_or_else(|e| parse_err("relationLabelTableNative/serialize", e))
}

// ── 의무 휴식 (Phase 5-8) ─────────────────────────────────────────────────────

/// 투구수별 의무 휴식을 채웠는지 (일 단위 — 주 단위로는 주말 연투가 안 걸린다)
#[napi]
pub fn check_pitcher_rest_native(p: String) -> String {
    let params: rest_rules::RestCheckParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("checkPitcherRestNative", e, &p),
    };
    serde_json::to_string(&rest_rules::check_rest(params))
        .unwrap_or_else(|e| parse_err("checkPitcherRestNative/serialize", e))
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PitchLimitQuery { league_id: String }

/// 리그별 투구수 상한 (고교 105 / 그 외 120)
#[napi]
pub fn league_pitch_limit_native(p: String) -> String {
    let q: PitchLimitQuery = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("leaguePitchLimitNative", e, &p),
    };
    serde_json::to_string(&serde_json::json!({
        "hard": tuning::league_pitch_limit(&q.league_id),
        "soft": tuning::league_pitch_soft(&q.league_id),
    })).unwrap_or_else(|e| parse_err("leaguePitchLimitNative/serialize", e))
}

// ── 독립 생존리그 (Phase 5-6) ─────────────────────────────────────────────────

/// 한 단계 일정 — 생존팀끼리 새 라운드로빈
#[napi]
pub fn generate_survival_stage_native(p: String) -> String {
    let params: survival::SurvivalStageParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateSurvivalStageNative", e, &p),
    };
    serde_json::to_string(&survival::generate_survival_stage(params))
        .unwrap_or_else(|e| parse_err("generateSurvivalStageNative/serialize", e))
}

/// 단계 종료 → 생존팀·탈락팀 판정
#[napi]
pub fn survival_cutoff_native(p: String) -> String {
    let params: survival::SurvivalCutoffParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("survivalCutoffNative", e, &p),
    };
    serde_json::to_string(&survival::survival_cutoff(params))
        .unwrap_or_else(|e| parse_err("survivalCutoffNative/serialize", e))
}

/// 4차 Stage 사다리 — 준PO(단판) → PO(단판) → 챔피언결정전(3전2승)
#[napi]
pub fn build_ind_ladder_native(p: String) -> String {
    let params: survival::BuildIndLadderParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("buildIndLadderNative", e, &p),
    };
    serde_json::to_string(&survival::build_ind_ladder(params))
        .unwrap_or_else(|e| parse_err("buildIndLadderNative/serialize", e))
}

// ── 조별예선 (Phase 5-5d) ─────────────────────────────────────────────────────

/// 참가팀 → 조 추첨 + 예선 일정 (worldSeed 결정적)
#[napi]
pub fn build_group_stage_native(p: String) -> String {
    let params: group_stage::BuildGroupStageParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("buildGroupStageNative", e, &p),
    };
    serde_json::to_string(&group_stage::build_group_stage(params))
        .unwrap_or_else(|e| parse_err("buildGroupStageNative/serialize", e))
}

/// 예선 경기 결과 → 조 순위 반영
#[napi]
pub fn apply_group_results_native(p: String) -> String {
    let params: group_stage::ApplyGroupResultsParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("applyGroupResultsNative", e, &p),
    };
    serde_json::to_string(&group_stage::apply_group_results(params))
        .unwrap_or_else(|e| parse_err("applyGroupResultsNative/serialize", e))
}

/// 예선 통과팀 (본선 시드 순)
#[napi]
pub fn group_stage_qualifiers_native(p: String) -> String {
    let stage: group_stage::GroupStage = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("groupStageQualifiersNative", e, &p),
    };
    serde_json::to_string(&group_stage::group_stage_qualifiers(&stage))
        .unwrap_or_else(|e| parse_err("groupStageQualifiersNative/serialize", e))
}

/// 우승팀 (결승 승자 미정이면 null) — 시즌 종료 시상·기록용
#[napi]
pub fn tournament_champion_native(p: String) -> String {
    let b: tournament::TournamentBracket = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("tournamentChampionNative", e, &p),
    };
    serde_json::to_string(&tournament::tournament_champion(&b))
        .unwrap_or_else(|e| parse_err("tournamentChampionNative/serialize", e))
}

#[napi]
pub fn generate_schedule_native(p: String) -> String {
    let params: GenerateScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateScheduleNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_schedule(params))
        .unwrap_or_else(|e| parse_err("generateScheduleNative/serialize", e))
}

#[napi]
pub fn generate_kbl_schedule_native(p: String) -> String {
    let params: GenerateProScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateKblScheduleNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_kbl_schedule(params))
        .unwrap_or_else(|e| parse_err("generateKblScheduleNative/serialize", e))
}

#[napi]
pub fn generate_abl_schedule_native(p: String) -> String {
    let params: GenerateProScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateAblScheduleNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_abl_schedule(params))
        .unwrap_or_else(|e| parse_err("generateAblScheduleNative/serialize", e))
}

#[napi]
pub fn generate_jbl_schedule_native(p: String) -> String {
    let params: GenerateProScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateJblScheduleNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_jbl_schedule(params))
        .unwrap_or_else(|e| parse_err("generateJblScheduleNative/serialize", e))
}

#[napi]
pub fn generate_league_schedule_native(p: String) -> String {
    let params: GenerateLeagueScheduleParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateLeagueScheduleNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_league_schedule(params))
        .unwrap_or_else(|e| parse_err("generateLeagueScheduleNative/serialize", e))
}

#[napi]
pub fn generate_all_league_schedules_native(p: String) -> String {
    let params: GenerateAllLeagueSchedulesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("generateAllLeagueSchedulesNative", e, &p),
    };
    serde_json::to_string(&schedule_engine::generate_all_league_schedules(params))
        .unwrap_or_else(|e| parse_err("generateAllLeagueSchedulesNative/serialize", e))
}

// ── 포스트시즌 엔진 ───────────────────────────────────────────────────────────

#[napi]
pub fn build_kbl_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("buildKblBracketNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::build_kbl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildKblBracketNative/serialize", e))
}

#[napi]
pub fn build_abl_bracket_native(p: String) -> String {
    let params: BuildAblBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("buildAblBracketNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::build_abl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildAblBracketNative/serialize", e))
}

#[napi]
pub fn build_jbl_bracket_native(p: String) -> String {
    let params: BuildBracketParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("buildJblBracketNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::build_jbl_bracket(params))
        .unwrap_or_else(|e| parse_err("buildJblBracketNative/serialize", e))
}

#[napi]
pub fn apply_game_to_series_native(p: String) -> String {
    let params: ApplyGameToSeriesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("applyGameToSeriesNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::apply_game_to_series(params))
        .unwrap_or_else(|e| parse_err("applyGameToSeriesNative/serialize", e))
}

#[napi]
pub fn fill_next_series_native(p: String) -> String {
    let params: FillNextSeriesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("fillNextSeriesNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::fill_next_series(params))
        .unwrap_or_else(|e| parse_err("fillNextSeriesNative/serialize", e))
}

#[napi]
pub fn resolve_non_protagonist_series_native(p: String) -> String {
    let params: ResolveNpcSeriesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("resolveNonProtagonistSeriesNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::resolve_non_protagonist_series(params))
        .unwrap_or_else(|e| parse_err("resolveNonProtagonistSeriesNative/serialize", e))
}

#[napi]
pub fn make_series_game_native(p: String) -> String {
    let params: MakeSeriesGameParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("makeSeriesGameNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::make_series_game(params))
        .unwrap_or_else(|e| parse_err("makeSeriesGameNative/serialize", e))
}

#[napi]
pub fn shuffle_abl_conferences_native(p: String) -> String {
    let params: ShuffleAblConferencesParams = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("shuffleAblConferencesNative", e, &p),
    };
    serde_json::to_string(&postseason_engine::shuffle_abl_conferences(params))
        .unwrap_or_else(|e| parse_err("shuffleAblConferencesNative/serialize", e))
}

// ── 주간 엔진 ─────────────────────────────────────────────────────────────────

#[napi]
pub fn week_calc_facility_eff_native(p: String) -> String {
    let params: week_engine::FacilityEffPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcFacilityEffNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_facility_eff(params))
        .unwrap_or_else(|e| parse_err("weekCalcFacilityEffNative/serialize", e))
}

#[napi]
pub fn week_calc_injury_native(p: String) -> String {
    let params: week_engine::InjuryPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcInjuryNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_injury(params))
        .unwrap_or_else(|e| parse_err("weekCalcInjuryNative/serialize", e))
}

#[napi]
pub fn week_calc_hs_admissions_native(p: String) -> String {
    let params: week_engine::HsAdmissionsPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcHsAdmissionsNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_hs_admissions(params))
        .unwrap_or_else(|e| parse_err("weekCalcHsAdmissionsNative/serialize", e))
}


#[napi]
pub fn week_calc_exam_result_native(p: String) -> String {
    let params: week_engine::ExamPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcExamResultNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_exam_result(params))
        .unwrap_or_else(|e| parse_err("weekCalcExamResultNative/serialize", e))
}

#[napi]
pub fn week_calc_weekly_study_native(p: String) -> String {
    let params: week_engine::WeeklyStudyPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcWeeklyStudyNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_weekly_study(params))
        .unwrap_or_else(|e| parse_err("weekCalcWeeklyStudyNative/serialize", e))
}

#[napi]
pub fn week_calc_semester_result_native(p: String) -> String {
    let params: week_engine::SemesterPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcSemesterResultNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_semester_result(params))
        .unwrap_or_else(|e| parse_err("weekCalcSemesterResultNative/serialize", e))
}

/// 현역 병영생활 주간 계산 (PLAN_MILITARY_LIFE 4부 §26) — 상무는 `week_calc_military_native` 그대로
#[napi]
pub fn week_calc_military_life_native(p: String) -> String {
    let params: week_engine::MilitaryLifeWeekPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcMilitaryLifeNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_military_life_week(params))
        .unwrap_or_else(|e| parse_err("weekCalcMilitaryLifeNative/serialize", e))
}

#[napi]
pub fn week_calc_military_native(p: String) -> String {
    let params: week_engine::MilitaryWeekPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcMilitaryNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_military_week(params))
        .unwrap_or_else(|e| parse_err("weekCalcMilitaryNative/serialize", e))
}

#[napi]
pub fn week_calc_npc_fallback_native(p: String) -> String {
    let params: week_engine::NpcFallbackPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcNpcFallbackNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_npc_fallback(params))
        .unwrap_or_else(|e| parse_err("weekCalcNpcFallbackNative/serialize", e))
}

#[napi]
pub fn week_roll_random_batch_native(count: u32, seed: u32) -> String {
    serde_json::to_string(&week_engine::roll_random_batch(count, seed))
        .unwrap_or_else(|e| parse_err("weekRollRandomBatchNative/serialize", e))
}

#[napi]
pub fn week_calc_npc_injuries_native(p: String) -> String {
    let params: week_engine::NpcInjuriesPayload = match serde_json::from_str(&p) {
        Ok(v) => v, Err(e) => return parse_err_at("weekCalcNpcInjuriesNative", e, &p),
    };
    serde_json::to_string(&week_engine::calc_npc_injuries(params))
        .unwrap_or_else(|e| parse_err("weekCalcNpcInjuriesNative/serialize", e))
}

// ── roster_gen (R3a: Lazy 리그 로스터 생성) ──────────────────────────────────

/// 리그 활성화 시점 로스터 생성 — worldSeed 결정적 (DESIGN.md §8.3)
#[napi]
pub fn generate_league_roster_native(params_json: String) -> String {
    let params: roster_gen::GenerateLeagueRosterParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("generateLeagueRosterNative", e, &params_json),
    };
    let result = roster_gen::generate_league_roster(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateLeagueRosterNative/serialize", e))
}

/// 외국인 교체 영입 — 시즌 종료 후 빈 슬롯만큼 새 용병을 만든다 (F-4).
/// 확장팩(ABL·JBL)이 닫혀 있어도 KBL 외국인 자리가 비지 않게 하는 경로다
#[napi]
pub fn generate_foreign_players_native(params_json: String) -> String {
    let params: roster_gen::GenerateForeignParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("generateForeignPlayersNative", e, &params_json),
    };
    let result = roster_gen::generate_foreign_players(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("generateForeignPlayersNative/serialize", e))
}

/// 타 리그 Named NPC 주간 합성 성적 — worldSeed 결정적 (DESIGN.md §4.2, R3b)
#[napi]
pub fn synthetic_weekly_perf_native(params_json: String) -> String {
    let params: synthetic_trajectory::SyntheticWeeklyPerfParams = match serde_json::from_str(&params_json) {
        Ok(v) => v,
        Err(e) => return parse_err_at("syntheticWeeklyPerfNative", e, &params_json),
    };
    let result = synthetic_trajectory::synthetic_weekly_perf(params);
    serde_json::to_string(&result).unwrap_or_else(|e| parse_err("syntheticWeeklyPerfNative/serialize", e))
}

// ── scouting_engine ───────────────────────────────────────────────────────────

// 🔴 **여기 열여섯 자리가 JSON 을 손으로 이었다** (2026-09-26 고침 · A).
//
//   `Err(e) => format!(r#"{{"error":"{}"}}"#, e)` 였다. serde 의 오류 메시지는
//   **깨진 데이터를 그대로 물고 온다** — 실측으로 확인했다
//   (`scripts/probe-a-jsonctrl.cjs` ②: `unknown variant \`P<개행>제어\``).
//   그 메시지에 `"` 나 제어문자가 있으면 이 `format!` 은 **JSON 이 아닌 문자열**을
//   내고, TS 쪽 `JSON.parse` 가 「Bad control character in string literal」로
//   죽는다. 엔진이 보낸 진짜 이유는 그 자리에서 사라진다.
//
//   `serde_json::json!`(→ `parse_err`)은 이스케이프를 해 준다. **서식은 한
//   곳에서만 만든다** — 손으로 잇는 자리를 남기면 언젠가 그 하나가 터진다.
//
//   ⚠ `unwrap_or_default()` 도 같이 걷었다. 직렬화가 실패하면 **빈 문자열**을
//     돌려줘서 TS 가 「Unexpected end of JSON input」을 봤다 — 어느 함수가
//     무엇에 실패했는지 한 글자도 안 남았다.

#[napi]
pub fn apply_scouting_noise_native(params_json: String) -> String {
    match serde_json::from_str(&params_json) {
        Ok(p) => serde_json::to_string(&scouting_engine::apply_scouting_noise(p))
            .unwrap_or_else(|e| parse_err("applyScoutingNoiseNative/serialize", e)),
        Err(e) => parse_err_at("applyScoutingNoiseNative", e, &params_json),
    }
}

// ── team_engine ───────────────────────────────────────────────────────────────

/// ⚠ `$js_name` 은 TS 가 부르는 이름이다 — 메시지가 나머지 240 자리와 같은
///   이름을 말해야 그 한 줄만 보고 호출부를 찾을 수 있다.
macro_rules! napi_team {
    ($fn_name:ident, $js_name:literal, $rust_fn:expr) => {
        #[napi]
        pub fn $fn_name(params_json: String) -> String {
            match serde_json::from_str(&params_json) {
                Ok(p) => serde_json::to_string(&$rust_fn(p))
                    .unwrap_or_else(|e| parse_err(concat!($js_name, "/serialize"), e)),
                Err(e) => parse_err_at($js_name, e, &params_json),
            }
        }
    };
}

napi_team!(eval_callup_candidates_native,     "evalCallupCandidatesNative",     team_engine::eval_callup_candidates);
napi_team!(eval_calldown_candidates_native,   "evalCalldownCandidatesNative",   team_engine::eval_calldown_candidates);
napi_team!(eval_release_priority_native,      "evalReleasePriorityNative",      team_engine::eval_release_priority);
napi_team!(eval_fa_bid_native,                "evalFaBidNative",                team_engine::eval_fa_bid);
napi_team!(eval_retirement_suggestion_native, "evalRetirementSuggestionNative", team_engine::eval_retirement_suggestion);
napi_team!(generate_trade_proposals_native,   "generateTradeProposalsNative",   team_engine::generate_trade_proposals);
napi_team!(eval_trade_value_native,           "evalTradeValueNative",           team_engine::eval_trade_value);
napi_team!(eval_medical_test_native,          "evalMedicalTestNative",          team_engine::eval_medical_test);
napi_team!(calc_win_now_pressure_update_native, "calcWinNowPressureUpdateNative", team_engine::calc_win_now_pressure_update);
napi_team!(calc_scouting_improvement_native,  "calcScoutingImprovementNative",  team_engine::calc_scouting_improvement);

// ── player_agent ──────────────────────────────────────────────────────────────

napi_team!(player_eval_fa_decision_native,         "playerEvalFaDecisionNative",         player_agent::player_eval_fa_decision);
napi_team!(player_eval_trade_response_native,      "playerEvalTradeResponseNative",      player_agent::player_eval_trade_response);
napi_team!(player_eval_retirement_response_native, "playerEvalRetirementResponseNative", player_agent::player_eval_retirement_response);
napi_team!(player_rank_fa_offers_native,           "playerRankFaOffersNative",           player_agent::player_rank_fa_offers);

#[napi]
pub fn update_player_loyalty_native(params_json: String) -> String {
    match serde_json::from_str::<player_agent::UpdateLoyaltyParams>(&params_json) {
        Ok(p) => serde_json::to_string(&player_agent::update_player_loyalty(p))
            .unwrap_or_else(|e| parse_err("updatePlayerLoyaltyNative/serialize", e)),
        Err(e) => parse_err_at("updatePlayerLoyaltyNative", e, &params_json),
    }
}

// ── 재현 검사 — JSON 제어문자 (2026-09-26 · A) ────────────────────────────────
//
// 🔴 **가설과 실측**. 09-25 24판 다섯 번째 #8 이 `matchToSimResultNative` 에서
//   `control character (U+0000~U+001F) found while parsing a string` 로 죽었고
//   같은 씨앗 재실행엔 재현되지 않았다. 세운 가설은 둘이었다:
//
//     ① 자유 문자열 칸(이름·팀 id·로그 문안)에 제어문자가 들어 있었다
//     ② 그 문자열을 **이스케이프 없이 이은 자리**가 있다
//
//   ①은 **틀렸다.** `JSON.stringify`·`serde_json::to_string` 둘 다 U+0000~U+001F
//   를 반드시 이스케이프한다 — 실제 경로 60경기(payload 평균 42KB · 자유 문자열
//   칸 410개)에 여섯 가지 제어문자를 심고 재도 **생 제어문자 0건 · 예외 0건**
//   이었다(`scripts/probe-a-jsonctrl.cjs` ①②).
//   ②는 **맞았다** — `napi_team!` 매크로를 포함한 열여섯 자리가
//   `format!(r#"{{"error":"{}"}}"#, e)` 로 JSON 을 손으로 이었다.
//
//   아래 검사가 그 둘을 못박는다. `parse_err_at` 이 **어느 칸이었는지**
//   말하는지도 같이 본다 — 다시 한 번 나고 사라지면 그 한 줄이 유일한 증거다.
#[cfg(test)]
mod json_ctrl_tests {
    use super::*;

    /// 이 크레이트가 내는 오류 JSON 은 **언제나 파싱된다.** 손으로 이으면 깨진다
    fn err_message(raw: &str) -> String {
        let v: serde_json::Value =
            serde_json::from_str(raw).expect("오류 JSON 자체가 파싱돼야 한다");
        v["error"].as_str().unwrap_or_default().to_string()
    }

    /// ① 이름에 제어문자가 있어도 **정상 직렬화 경로는 멀쩡하다**
    #[test]
    fn 제어문자가_든_이름은_이스케이프돼_통과한다() {
        for c in ['\u{0}', '\u{1f}', '\n', '\u{8}'] {
            let payload = serde_json::json!({
                "state": { "matchId": format!("M{}끝", c) },
                "homeTeamId": format!("TEAM_A{}", c),
            })
            .to_string();
            // 직렬화가 생 제어문자를 남기지 않는다
            assert!(
                !payload.bytes().any(|b| b < 0x20),
                "serde_json 이 제어문자를 그대로 냈다: {:?}",
                c
            );
            // 그래서 되읽기도 된다
            let back: serde_json::Value = serde_json::from_str(&payload).unwrap();
            assert_eq!(back["homeTeamId"].as_str().unwrap(), format!("TEAM_A{}", c));
        }
    }

    /// ② 생 제어문자가 낀 입력 — 옛 결함의 재현. 메시지가 **어느 칸**인지 말해야 한다
    #[test]
    fn 생_제어문자는_어느_칸이었는지_말한다() {
        // 손으로 이은 JSON — `format!` 로 잇던 자리가 정확히 이 꼴을 만들었다
        let broken = "{\"homeTeamId\":\"TEAM_A\u{1f}B\",\"week\":3}";
        let e = serde_json::from_str::<serde_json::Value>(broken).unwrap_err();
        let raw = parse_err_at("matchToSimResultNative", e, broken);
        let msg = err_message(&raw);

        assert!(msg.contains("control character"), "옛 예외와 같은 꼴이어야 한다: {msg}");
        assert!(msg.contains("칸 `homeTeamId`"), "어느 칸인지 말해야 한다: {msg}");
        // 메시지에 생 제어문자를 남기지 않는다 — 09-25 보고서가 그 바이트를 먹었다
        assert!(
            !msg.bytes().any(|b| b < 0x20),
            "메시지에 생 제어문자가 남았다: {msg:?}"
        );
        assert!(msg.contains("\\u001f"), "그 바이트를 글자로 적어야 한다: {msg}");
    }

    /// ③ 깊은 자리에서 깨져도 칸 이름을 짚는다 — 옛 payload 는 4만 바이트였다
    #[test]
    fn 깊은_자리도_칸_이름을_짚는다() {
        let mut broken = String::from("{\"state\":{\"logs\":[\"1회 플레이볼\",\"2회 ");
        broken.push('\u{3}');
        broken.push_str("헛스윙\"]}}");
        let e = serde_json::from_str::<serde_json::Value>(&broken).unwrap_err();
        let msg = err_message(&parse_err_at("simToGameEnd", e, &broken));
        assert!(msg.contains("칸 `logs`"), "로그 칸을 짚어야 한다: {msg}");
        assert!(msg.contains("2회"), "그 앞 글자를 보여 줘야 한다: {msg}");
    }

    /// ④ 오류 메시지가 깨진 데이터를 물고 와도 **오류 JSON 은 파싱된다**
    ///
    /// 손으로 잇던 열여섯 자리가 깨졌던 지점이다 — serde 는 `unknown variant`
    /// 같은 메시지에 원본 글자를 그대로 넣는다.
    #[test]
    fn 오류_메시지가_따옴표를_물어도_결과는_멀쩡하다() {
        let broken = "{\"position\":\"P\\\"괄호\"}";
        #[derive(serde::Deserialize, Debug)]
        struct P {
            #[allow(dead_code)]
            position: types::FieldPosition,
        }
        let e = serde_json::from_str::<P>(broken).unwrap_err();
        let raw = parse_err_at("evalTradeValueNative", e, broken);
        // 손으로 이었으면 여기서 깨졌다
        let msg = err_message(&raw);
        assert!(msg.contains("evalTradeValueNative"), "{msg}");
    }
}
