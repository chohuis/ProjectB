// ── 커리어 이벤트 유형 이름 ─────────────────────────────────────
//
// 🔴 **번역이 화면마다 따로 있었고, 폴백이 원문이었다.** 표에 없는 유형이 오면
//    `foreign_signing` 같은 코드가 그대로 화면에 떴다(2026-08-26 실측).
//    엔진이 유형을 늘리면 그때마다 화면 셋을 각각 고쳐야 했다.

/**
 * 유형 → 사람이 읽는 이름.
 *
 * ⚠ **엔진이 내는 것과 TS가 내는 것이 섞여 있다.** Rust `npc_sim`이
 *   `demote_roster`·`release_score`처럼 사유까지 나눠 내고,
 *   TS 쪽은 `fa_signed`·`draft_picked`를 낸다. 둘 다 여기 모은다.
 */
const LABEL: Record<string, string> = {
  // 입단·이적
  draft_picked:     "드래프트 지명",
  draft_undrafted:  "미지명",
  fa_signed:        "FA 취득",
  fa_contract:      "FA 계약",
  fa_unsigned:      "FA 미계약",
  // FA 미계약 뒤 — 원소속으로 돌아가거나, 갈 곳이 없으면 은퇴다.
  // ⚠ **"야구를 그만둔다"가 아니다.** 예전엔 진로 배정으로 넘겨서 프로
  //   경력자가 미지명 졸업생과 같은 통에서 `quit_baseball`이 됐다
  //   (실측 2026-08-27: 미계약자의 67%).
  fa_rehome:        "FA 미계약 · 원소속 잔류",
  // FA 미계약 → 원소속도 막혀 독립에서 재도전 (2026-08-29)
  fa_independent:   "독립 재도전",
  fa_unsigned_retire: "FA 미계약 은퇴",
  trade:            "트레이드",
  foreign_signing:  "용병 영입",
  promote:          "1군 승격",
  // 강등 — 사유가 다르면 다른 일이다
  demote_roster:    "2군 강등",
  demote_fielder:   "2군 강등(야수 정원)",
  // 방출 — 정원 초과와 성적 부진은 다른 일이다
  release_roster:   "방출(정원)",
  release_score:    "방출(성적)",
  release:          "방출",
  development_expired: "육성 만료",
  // 은퇴
  retirement:       "은퇴",
  retired:          "은퇴",
  retire_age:       "은퇴(나이)",
  retire_no_team:   "은퇴(무소속)",
  // 병역
  military_enlist:    "입대",
  military_discharge: "전역",
  // 기타
  position_change:  "보직 변경",
};

/**
 * 모르는 유형이 와도 **코드를 그대로 보여주지 않는다.**
 *
 * 🔴 폴백이 원문이면 엔진이 유형을 늘릴 때마다 화면에 영어가 샌다 —
 *   그게 아무 로그도 안 남는 결함의 모양이다.
 * ⚠ 대신 밑줄을 띄어쓰기로 바꿔 **읽을 수는 있게** 한다. 빈칸으로 두면
 *   무슨 일이 있었는지 자체가 사라진다.
 */
export function careerEventLabel(eventType: string): string {
  return LABEL[eventType] ?? eventType.replace(/_/g, " ");
}

/** 검사·게이트용 — 아는 유형 목록 */
export const KNOWN_CAREER_EVENTS: readonly string[] = Object.keys(LABEL);
