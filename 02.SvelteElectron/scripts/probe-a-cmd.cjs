"use strict";
/**
 * A 계측 — **제구가 좋을수록 유리한가.**
 *
 *   npm run probe:a:cmd
 *   npm run probe:a:cmd -- --games 400
 *
 * 🔴 **이 저장소는 이 방향이 뒤집힌 적이 있다.** 2026-08-11 실측에서 OVR 55 →
 *   80 으로 올리자 ERA 가 **오히려 나빠졌다** — 로케이션 품질을 착탄점의
 *   중심거리로만 봤는데 `pick_target` 이 대개 존 안을 겨냥해서, 제구가 나빠
 *   흩어질수록 일부가 가장자리로 가 품질이 올라갔기 때문이다. 육성 게임에서
 *   **능력치를 올리면 손해**라는 건 다른 어떤 수치보다 큰 결함이다.
 *
 * 그 결함은 2026-09-08 재측에서 사라졌고(아래 값), 그래서 결정 ⑦ 은 착탄
 * 기준을 그대로 두는 쪽으로 닫혔다(`tuning.rs` 「로케이션 품질」 절).
 * **이 계측은 그 뒤로 「다시 뒤집히지 않았나」를 지키는 자리로 남긴다.**
 *
 *   확정 시점 값 (씨앗 20260802/777/31337 × 300경기 · 도장 939a3f28c4e9):
 *     제구 40 → .334   제구 62 → .276   제구 80 → .242   (40→80 −0.093)
 *
 * ⚠ **구속·무브는 묶는다.** 같이 올리면 「제구가 듣는가」를 못 가른다 —
 *   `calculate_pitch_quality` 는 velocity·movement 에도 계수를 준다.
 * ⚠ ① 절의 띠는 `audit-engine.cjs` ② 절과 **같은 숫자다** — 두 곳에 다른
 *   기대치를 적으면 한쪽만 고쳐진 채로 남는다.
 */
const path = require("node:path");
const engine = require(path.join(process.cwd(), "packages/engine-native"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const GAMES = arg("games", 300);
const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => Number(s.trim()));

/** 구종 넷·등급 셋 — `probe:a:read` 의 바탕 맞춘 사다리와 같은 꼴 */
const ARSENAL = [
  { type: "fastball", grade: 3 }, { type: "cutter", grade: 3 },
  { type: "slider", grade: 3 }, { type: "curve", grade: 3 },
];

const pitcher = (cmd) => ({
  velocity: 62, movement: 62, command: cmd, control: cmd,
  stamina: 100, staminaCap: 62, clutch: 62, mentalResil: 62, arsenal: ARSENAL,
});

function run(p) {
  let h = 0, k = 0, bb = 0, pa = 0, pit = 0, w = 0;
  for (const seed of SEEDS) {
    for (let i = 0; i < GAMES; i++) {
      const res = JSON.parse(engine.runSimpleGame(JSON.stringify({
        seed: seed + i, protagonistOvr: 62, opponentOvr: 62, pitcher: p,
      })));
      if (res.error) throw new Error(res.error);
      h += res.hits; k += res.strikeouts; bb += res.walks;
      pa += res.plateAppearances ?? 0; pit += res.pitches ?? 0; w += res.whiffs ?? 0;
    }
  }
  const evt = h + k + bb, ab = pa - bb;
  return {
    피안타율: ab > 0 ? h / ab : null,
    피안타비중: evt > 0 ? h / evt : null,
    삼진비중: evt > 0 ? k / evt : null,
    볼넷비중: evt > 0 ? bb / evt : null,
    헛스윙률: pit > 0 ? (w / pit) * 100 : null,
  };
}

const f3 = (v) => (v === null ? "  —  " : v.toFixed(3));
const f2 = (v) => (v === null ? "  —  " : v.toFixed(2));
const d3 = (a, b) => (a - b >= 0 ? "+" : "") + (a - b).toFixed(3);
/** `audit-engine.cjs` ② 절과 **같은 띠**다 */
const BANDS = { 피안타비중: [0.45, 0.62], 볼넷비중: [0.08, 0.20], 삼진비중: [0.25, 0.45] };

(() => {
  let failed = 0;
  console.log("");
  console.log(`── 제구 응답성 — 엔진 직접 호출 · 씨앗 ${SEEDS.join("/")} × ${GAMES}경기 ──`);
  console.log("");
  console.log("① 감사 띠 안에 드는가 (제구 62 · `audit:engine` ② 절과 같은 띠)");
  console.log("");
  const mid = run(pitcher(62));
  for (const [name, [lo, hi]] of Object.entries(BANDS)) {
    const v = mid[name], ok = v >= lo && v <= hi;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name.padEnd(10)} ${f3(v)}   (기대 ${lo}~${hi})`);
  }
  console.log(`       헛스윙률   ${f2(mid.헛스윙률)}%`);

  console.log("");
  console.log("② 🔴 제구가 좋을수록 유리한가 — **뒤집히면 여기서 잡는다**");
  console.log("   (구속·무브는 62 로 묶고 command·control 만 움직인다)");
  console.log("");
  const lo = run(pitcher(40)), hi = run(pitcher(80));
  const delta = hi.피안타율 - lo.피안타율;
  console.log(`  제구40 ${f3(lo.피안타율)}   제구62 ${f3(mid.피안타율)}   제구80 ${f3(hi.피안타율)}   40→80 ${d3(hi.피안타율, lo.피안타율)}`);
  const ok = delta < -0.005;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"} ${ok ? "제구가 듣는다" : "🔴 제구가 안 듣거나 뒤집혔다 — tuning.rs 「로케이션 품질」 절을 읽어라"}`);
  console.log("");
  console.log(failed === 0 ? "제구 응답성 통과" : `❌ ${failed}건 실패`);
  console.log("");
  process.exit(failed === 0 ? 0 : 1);
})();
