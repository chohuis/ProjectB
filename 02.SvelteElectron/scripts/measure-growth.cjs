"use strict";
/**
 * 주인공 성장 계측 — `npm run measure:growth`
 *
 * ## 왜 필요한가
 *
 * 캘린더 v2로 정규시즌이 **50주 → 24주**가 됐다. "시즌 중 성장 기회가
 * 절반이 된다"고 봤는데, 코드를 읽어 보니 **훈련 성장은 조건 없이 매주
 * 돈다**(부상 때만 걸린다). 그렇다면 총량은 안 변하고 바뀌는 건
 * **경기를 뛰며 얻는 것**뿐이다.
 *
 * 읽어서 짐작하지 말고 **잰다.** 한 시즌을 돌려 OVR·경험이 얼마나 오르는지
 * 본다. 캘린더를 되돌려 다시 재면 A/B가 된다.
 *
 * ## 🔴 두 번 헛짚었다 (2026-08-20)
 *
 * ①  — **인자를 안 받는다.** 1을 넘겨도 정지 조건까지 통째로
 *    돈다. 주별 추이가 전부 같은 값으로 나와 "W1에 이미 다 컸다"로 읽혔다.
 * ②  — 딱 한 주만 돌지만 **정지 조건을 안 푼다.** 여덟 번 불러도
 *    주차가 W1에 머문다(실측). 경기·소식이 큐에 걸려 진행이 막힌다.
 *
 * → **주별 추이를 재려면 정지 조건을 풀면서 한 주씩 가야 한다.** 은
 *   W40·W51에서만 멈추므로 그 사이 구간을 못 가른다. 계측 장치를 더 만들어야
 *   한다 — 그건 별도 작업이다.
 *
 * ⚠ **자동 진행 경로를 쓴다** — `advanceWeek`를 실제로 돌린다. 성장 함수를
 * 직접 부르면 배선을 안 보게 된다(이 프로젝트가 여러 번 당한 형태다).
 */
const path = require("node:path");
const headless = require("./perf/headless.cjs");

const SEED = (() => {
  const i = process.argv.indexOf("--seed");
  return i !== -1 ? Number(process.argv[i + 1]) || 20260731 : 20260731;
})();
const WEEKS = (() => {
  const i = process.argv.indexOf("--weeks");
  return i !== -1 ? Number(process.argv[i + 1]) || 51 : 51;
})();

function ovrOf(st) {
  // protagonistState가 ovr을 최상위에 준다 — 안쪽 pitching을 뒤지면 null이다
  return st && typeof st.ovr === "number" ? st.ovr : null;
}

async function main() {
  const { app, tmp } = await headless.boot("growth");
  try {
    await app.boot({ slotId: "GROWTH", worldSeed: SEED, seasonYear: 2026 });

    const before = app.protagonistState();
    const ovr0 = ovrOf(before);

    // 주마다 OVR을 찍는다 — 어느 구간에서 크는지 봐야 "시즌 중"과
    // "오프시즌"을 가를 수 있다
    // ⚠ **OVR은 정수라 미세 성장을 못 본다.** W6에 70이 되면 그 뒤로 안
    // 움직이는 것처럼 보인다 — 세부 능력치의 합을 같이 잰다
    const detail = () => {
      const pit = app.protagonistAbilities() || {};
      const keys = ["velocity", "command", "control", "movement", "stamina"];
      let sum = 0;
      for (const k of keys) if (typeof pit[k] === "number") sum += pit[k];
      return Math.round(sum * 100) / 100;
    };

    // ⚠ **한 주씩 못 간다.** `oneWeek()`는 정지 조건을 안 풀어 W1에 머물고,
    // `autoRun()`은 인자를 무시하고 정지 조건까지 통째로 돈다.
    // → `autoRun()`을 **한 번만** 불러 W40(오프시즌 시작)까지 가게 하고
    //   그 구간의 성장을 잰다. 구간을 더 잘게 못 나누는 건 한계다
    const trail = [];
    const d0 = detail();
    await app.autoRun();
    const mid = app.protagonistState();
    trail.push({ week: 1, gameWeek: mid.week, ovr: ovrOf(mid), detail: detail() });

    const after = app.protagonistState();
    const ovr1 = ovrOf(after);

    const d1 = detail();
    console.log(`[성장] 씨앗 ${SEED} · ${WEEKS}주`);
    console.log(`  OVR ${ovr0} → ${ovr1}  (+${(ovr1 - ovr0).toFixed(2)})`);
    console.log(`  세부합 ${d0} → ${d1}  (+${(d1 - d0).toFixed(2)})`);

    // 구간별 — 정규(W5~28) 안팎을 가른다
    const inSeason = trail.filter((t) => t.week >= 5 && t.week <= 28);
    const offSeason = trail.filter((t) => t.week < 5 || t.week > 28);
    const gain = (arr) => {
      if (arr.length < 2) return 0;
      const a = arr[0].detail, b = arr[arr.length - 1].detail;
      return (typeof a === "number" && typeof b === "number") ? b - a : 0;
    };
    console.log(`  정규(W5~28) 구간 +${gain(inSeason).toFixed(2)}`);
    console.log(`  그 밖 구간      +${gain(offSeason).toFixed(2)}`);
    console.log("  주별:", trail.filter((t) => t.week % 6 === 0)
      .map((t) => `W${t.week} ${t.detail}`).join(" · "));
    console.log("  실제 주차:", trail.slice(0,8).map((t) => `${t.week}→W${t.gameWeek}`).join(" · "));
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[measure-growth] 실패:", e); process.exit(1); });
