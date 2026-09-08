"use strict";
/**
 * **또래 분포 대비 시작 능력치** — 결정 ⑭ (2026-09-09 · A).
 *
 * 사용자 확정 방법 (c): 드래프트 결과는 잡음이 크니 **NPC 분포 대비 백분위**로
 * 값을 정한다. 여기서 그 분포를 잰다 — 새 게임을 만들기만 하고 한 주도 안 돈다.
 *
 *   PF_SEED=20260802 npm run probe:a:startovr
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEEDS = String(process.env.PF_SEEDS || "20260802,777,31337").split(",").map(Number);
/** 재고 싶은 값 — `PB_MINE="ovr:velocity"` 로 바꾼다 */
const MINE = String(process.env.PB_MINE || "").split(":").map(Number);
/** 지금 프리셋 넷 — `[이름, ovr, velocity]`. 값이 바뀌면 여기도 바꾼다 */
const PRESETS = [
  ["균형형", 61, 61], ["파워피처", 59, 69], ["제구형", 59, 48], ["체력형", 60, 58],
];

(async () => {
  for (const seed of SEEDS) {
    const { app, tmp } = await headless.boot(`startovr-${seed}`);
    try {
      await app.boot({ slotId: "SO" + seed, worldSeed: seed, seasonYear: 2026 });
      const mine = MINE.length === 2 && MINE.every(Number.isFinite)
        ? { ovr: MINE[0], velocity: MINE[1] } : undefined;
      const r = app.hsGradeOvrProbe(mine);
      console.log(`\n[시작 능력치 기준] 씨앗 ${seed}`);
      for (const g of ["1학년", "2학년", "3학년"]) {
        const b = r[g];
        console.log(`  ${g} n=${String(b.n).padStart(4)}  OVR 중앙 ${String(b.OVR.중앙).padStart(2)}`
          + ` · 상위25 ${String(b.OVR.상위25).padStart(2)} · 상위10 ${String(b.OVR.상위10).padStart(2)}`
          + ` · 상위5 ${String(b.OVR.상위5).padStart(2)} · 최고 ${String(b.OVR.최고).padStart(2)}`
          + `  |  구속 중앙 ${b.구속.중앙}(${b.구속.중앙kmh}) 최고 ${b.구속.최고}(${b.구속.최고kmh})`);
      }
      if (r.내값) console.log(`  내값 ${JSON.stringify(r.내값)}`);
      // 프리셋 넷이 1학년 분포에서 어디쯤인가 — **값을 정하는 자리다**
      for (const [name, o, v] of PRESETS) {
        const x = app.hsGradeOvrProbe({ ovr: o, velocity: v }).내값;
        console.log(`    ${name.padEnd(9)} OVR ${String(o).padStart(2)} (${String(x.ovr백분위).padStart(4)}%)`
          + ` · 구속 ${String(v).padStart(2)} = ${x.구속kmh}km/h (${x.구속백분위}%)`);
      }
    } finally {
      await headless.cleanup(tmp);
    }
  }
})();
