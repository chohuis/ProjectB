"use strict";
/**
 * **「주가 안 넘어갔다」를 한 번 보고 판단하지 않는다** (2026-09-08 · A).
 *
 * ── 왜 있나 ────────────────────────────────────────────────────
 * 계측·검사 스크립트 스무 남짓이 전부 같은 줄을 베껴 갖고 있었다:
 *
 *     await app.autoRun();                       // 또는 runOneWeek()
 *     if (app.currentWeek() === w0 && …) break;  // ← 「막혔다」
 *
 * 🔴 **그 판단이 틀렸다.** `advanceWeek` 은 **주를 안 넘긴 채 정지 pending 을
 *   밀어넣고** 돌아오는 경로가 여럿이다 — 드래프트 관전·부상 치료·연봉 협상·
 *   FA·트레이드·은퇴 권고·체육부대가 그렇다. 사람이면 모달을 눌러 넘어가는
 *   **정상 경로**인데, 위 한 줄은 그때도 똑같이 「막혔다」로 읽고 판을 끊는다.
 *   바깥 루프가 그 pending 을 치울 기회를 **안 주는 것**이다.
 *
 * ── 실측 (2026-09-08) ──────────────────────────────────────────
 * `check:measurerepro` 의 씨앗 20260802 이 「정지 2026W32」로 섰다. 잡아 보니
 * 엔진은 멀쩡했다 — 그 주 pending 이 `[injuryTreatment, draftObserve]` 였고,
 * `runAutoAdvance` 가 앞의 것을 처리한 뒤 `draftObserve` 에서 **설계대로**
 * 멈춘 것이다(`정지: 진로 최종 선택`). 바깥 루프가 한 바퀴만 더 돌았으면
 * `skipDraftObserve()` 로 지나갔다. **엔진 결함이 아니라 계측 결함이었다.**
 *
 * ── 그래서 무엇을 하나 ─────────────────────────────────────────
 * **연속으로** 안 움직일 때만 막힌 것으로 센다. 한 바퀴는 pending 을 미는
 * 정상 경로일 수 있다.
 *
 * ⚠ 상한이 **8** 인 이유 — 한 주에 정지 pending 이 **연달아** 뜨는 자리가 있다.
 *   진로 허브 → 드래프트 결과 → 지명 통보가 셋이고, 거기에 부상 치료·컨디션
 *   경고·드래프트 관전이 얹히면 대여섯이 된다. 그때마다 `runOneWeek()` 이
 *   주를 안 넘기고 돌아오므로 상한이 3 이면 **정상 경로가 채운다.**
 *   더 정확하게 하려면 바깥 루프가 pending 을 하나 치울 때마다 `hit(true)` 로
 *   셈을 되돌리면 된다(`probe-d-dr-worker.cjs` 가 그렇게 한다).
 *
 *     const guard = makeStallGuard();
 *     …
 *     const w0 = app.currentWeek(), s0 = app.currentSeason();
 *     await app.autoRun();
 *     if (guard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
 *
 * ⚠ **진짜로 막힌 자리는 엔진이 먼저 말한다.** `runAutoAdvance` 가 같은
 *   pending 이 50회 돌아오면 `오류: 주 진행이 막혔다 — …` 로 멈춘다. 여기는
 *   그 앞단의 **오탐만** 걷어내는 자리다.
 */

/**
 * @param {number} limit 연속 몇 번 안 움직여야 막힌 것으로 볼지 (기본 8)
 */
function makeStallGuard(limit = 8) {
  let n = 0;
  return {
    /**
     * @param {boolean} moved 이번 바퀴에 주·시즌이 움직였나
     * @returns {boolean} 연속 `limit` 회 안 움직였다 — 이제 막힌 것으로 본다
     */
    hit(moved) { n = moved ? 0 : n + 1; return n >= limit; },
    /** 지금까지 연속 몇 번 안 움직였나 */
    count() { return n; },
  };
}

module.exports = { makeStallGuard };
