// ── 육성선수 신분 ────────────────────────────────────────────────────────
//
// KBO 육성선수(2015년 이전 명칭 "신고선수"):
//
//   - **정원 밖 인원**이다. 정식 등록 선수 정원을 안 먹는다
//   - **최저연봉 보장이 없다.** 드래프트 지명자는 3000만원 + 계약금인데
//     육성선수는 그 아래고 계약금이 없다
//   - **입단 연도에는 5월 1일 이후에만 1군 등록**이 된다
//     (2015년 이전엔 6월 1일이었다)
//
// 게임에서 이 신분이 붙는 사람은 **드래프트 미지명자·방출된 프로·미계약 FA**다.
// 셋 다 `Placer`(Rust `draft.rs`)의 같은 경로를 타고 프로 2군으로 간다.
//
// ⚠ **소속이 아니라 신분이다.** 2군에 있다고 육성선수가 아니다 — 강등된 정식
// 등록 선수도 2군에 있다. 리그 ID(`_2` 접미사)로 판정하면 드래프트 상위
// 지명자가 육성선수 대우를 받는다. 정본은 `NpcSaveState.developmentSince`
// 하나뿐이고, 그 값은 `Placer`가 2군에 배정할 때만 쓴다.

/**
 * 육성선수의 1군 등록이 풀리는 달. KBO 규정의 5월 1일.
 *
 * ⚠ **입단 연도에만 걸린다.** 다음 해부터는 정식 등록 선수와 같다 —
 * 매년 5월까지 묶으면 육성선수가 영영 못 올라와서 "노력하면 프로가 된다"는
 * 전제 자체가 없어진다.
 */
export const DEV_REGISTRATION_MONTH = 5;

/**
 * 지금 1군에 등록할 수 있는가.
 *
 * 엔진의 `RosterPlayerRef.registrable`로 넘어가고, 콜업 후보에서만 뺀다.
 * **2군 정원 계산에는 그대로 센다** — 아예 빼면 2군이 얇아 보여서 육성선수를
 * 또 만들고, 그 사람도 다음 해까지 못 올라온다.
 */
export function isRegistrable(
  developmentSince: number | undefined | null,
  seasonYear: number,
  month: number,
): boolean {
  if (developmentSince == null) return true; // 정식 등록 선수
  if (developmentSince < seasonYear) return true; // 입단 연도가 지났다
  return month >= DEV_REGISTRATION_MONTH;
}

/** 화면 표기용 — 육성선수인가 (연도 무관) */
export function isDevelopmentPlayer(developmentSince: number | undefined | null): boolean {
  return developmentSince != null;
}
