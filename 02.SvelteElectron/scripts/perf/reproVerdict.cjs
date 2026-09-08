"use strict";
/**
 * `check:measurerepro` 의 **판정만** 따로 뽑아 둔 것.
 *
 * 🔴 왜 나눴나 (2026-09-08 · A). 이 검사가 **멈춘 판에 초록을 찍고 있었다.**
 *   판정이 `keyOf` 비교(두 판이 같은가) 하나뿐이라, 두 판이 **같은 자리에서
 *   같이 멈추면** 통과했다 — 「멈춘 것이 재현되면 초록」이다. 실제로 씨앗
 *   20260802 이 「정지 2026W32」로 서는데 ✅ 가 찍혔고, 그 초록 때문에
 *   하루가 지났다.
 *
 *   판정이 스크립트 본문에 섞여 있으면 **그게 맞는지 물어볼 방법이 없다**
 *   (판을 10분씩 돌려야 한다). 그래서 순수 함수로 꺼내 회귀가 직접 때린다
 *   (`__tests__/reproVerdict.test.ts`).
 */

/** 판 하나의 결과. `probe-d-dr-worker.cjs` 의 `RESULT` 줄이 이 모양이다 */
/**
 * @param {Array<Record<string, unknown>>} rows
 * @returns {{ ok: boolean, lines: string[] }}
 */
function verdict(rows) {
  const lines = [];
  if (rows.length === 0) return { ok: false, lines: ["❌ 판이 하나도 없다"] };

  // ① 안 끝난 판 — 재현 여부를 가릴 것도 없다
  const failed = rows.filter((r) => r.fail);
  if (failed.length > 0) {
    lines.push("❌ 판이 안 끝났다 — 재현 여부를 못 가린다");
    for (const r of failed) lines.push(`   ${r.run}: ${r.fail}`);
    return { ok: false, lines };
  }

  // ② **완주 못 한 판은 재현 여부와 무관하게 빨강이다.** 여기가 없어서
  //    「정지 2026W32」가 두 판 똑같이 나오고도 초록이었다
  const stalled = rows.filter((r) => r.why !== "완주");
  if (stalled.length > 0) {
    lines.push(`❌ ${stalled.length}판이 완주 못 했다 — 진행이 막히는 자리가 있다`);
    for (const r of stalled) lines.push(`   ${r.run}: ${r.why}${r.stopWhy ? ` — ${r.stopWhy}` : ""}`);
    return { ok: false, lines };
  }

  // ③ 그 다음에야 「같은가」를 묻는다
  const keys = rows.map(keyOf);
  if (!keys.every((k) => k === keys[0])) {
    lines.push(`❌ ${rows.length}회가 안 같다 — 아직 씨앗 밖의 난수가 남아 있다`);
    keys.forEach((k, i) => lines.push(`   ${i + 1}: ${k}`));
    return { ok: false, lines };
  }

  lines.push(`✅ ${rows.length}회 전부 같다 — ${keys[0]}`);
  return { ok: true, lines };
}

/** 비교하는 값 — 진로 결말과 3년차 능력치. 여기가 같으면 3년이 같게 흘렀다는 뜻이다 */
function keyOf(r) {
  return JSON.stringify({
    지명: r.지명 ?? null, 대학합격: r.대학합격 ?? null, 독립합격: r.독립합격 ?? null,
    병역: r.병역 ?? null, ovr: r.ovr ?? null, velocity: r.velocity ?? null, why: r.why ?? null,
  });
}

module.exports = { verdict, keyOf };
