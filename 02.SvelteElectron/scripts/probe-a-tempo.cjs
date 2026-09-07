"use strict";
/**
 * A 계측 — **완급 조절(결정 ⑧)과 코스 반복 페널티(결정 ⑨) 전후.**
 *
 *   npm run probe:a:tempo
 *   npm run probe:a:tempo -- --games 400
 *
 * 🔴 **게임 루프를 안 탄다.** `runSimpleGame` 으로 엔진만 직접 부른다
 *   (`audit:engine` 과 같은 자리). 커리어를 굴려 재면 진로가 갈려 표본이
 *   흔들리는데(`BALANCE_BASELINE_101.md` §3 이 그 기록이다), 두 결정은
 *   **투구 하나의 품질**을 미는 것이라 그 층에서 재는 게 맞다.
 *
 * 🔴 **헛스윙률이 이 계측의 중심이다.** 완급·코스는 공 하나의 품질을 밀고,
 *   그게 제일 먼저 드러나는 원시 사건이 헛스윙이다 — 안타·ERA 까지 가면
 *   수비와 운이 섞여 방향이 흐려진다(§3 의 「주인공 개인은 못 가른다」가
 *   그 이야기다).
 *
 * 모드는 환경변수 둘로 가른다 — **한 프로세스에서 다 돈다.** Rust 가 매
 * 투구마다 `std::env::var` 로 읽으므로(`tuning.rs tempo_mode`·`course_mode`)
 * 배선이 따로 필요 없다.
 *
 *     끔(전)      PB_TEMPO=0 PB_COURSE=0   ← 결정 ⑧⑨ 이전과 **완전히 같다**
 *     완급만      PB_TEMPO=1 PB_COURSE=0
 *     코스만      PB_TEMPO=0 PB_COURSE=1
 *     둘 다(후)   PB_TEMPO=1 PB_COURSE=1
 *
 * ⚠ **씨앗 셋을 판마다 같은 순서로 쓴다.** 모드가 난수를 더 먹는 자리가
 *   하나 있어(코스 재추첨) 같은 씨앗이어도 공 하나하나는 갈린다 — 그래서
 *   경기 수를 늘려 평균으로 본다. 「같은 경기」 비교가 아니라 「같은 분포」
 *   비교다.
 */
const path = require("node:path");
const engine = require(path.join(process.cwd(), "packages/engine-native"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const GAMES = arg("games", 300);
const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => Number(s.trim()));
const OVR = arg("ovr", 62);

const MODES = [
  { key: "끔(전)",    tempo: "0", course: "0" },
  { key: "완급만(⑧)", tempo: "1", course: "0" },
  { key: "코스만(⑨)", tempo: "0", course: "1" },
  { key: "둘 다(후)", tempo: "1", course: "1" },
];

/**
 * 감사와 **같은 평균 선수**를 쓴다 — 입력이 같아야 출력 차이가 모드 차이다.
 * ⚠ 구종을 여럿 준다. 직구만 쥐여 주면 낙차가 늘 0 이라 결정 ⑧ 이 아무
 *   일도 안 한 것처럼 보인다 — 그건 계측이 만든 착시다.
 */
const pitcher = (ovr) => ({
  velocity: ovr, movement: ovr, command: ovr, control: ovr,
  stamina: 100, staminaCap: ovr, clutch: ovr, mentalResil: ovr,
  arsenal: [
    { type: "fastball", grade: 3 }, { type: "slider", grade: 3 },
    { type: "curve", grade: 2 }, { type: "changeup", grade: 2 },
  ],
});

function runMode(mode) {
  process.env.PB_TEMPO = mode.tempo;
  process.env.PB_COURSE = mode.course;
  let h = 0, k = 0, bb = 0, p = 0, w = 0, games = 0, err = null;
  // 🔴 **씨앗마다 따로도 남긴다.** 합계만 보면 방향이 씨앗 하나에서 온 것인지
  //   셋 다에서 온 것인지 못 가른다 — 기준선 §3 이 씨앗별로 적힌 이유다
  const bySeed = [];
  for (const seed of SEEDS) {
    let sh = 0, sk = 0, sbb = 0, sp = 0, sw = 0, sg = 0;
    for (let i = 0; i < GAMES; i++) {
      const res = JSON.parse(engine.runSimpleGame(JSON.stringify({
        seed: seed + i, protagonistOvr: OVR, opponentOvr: OVR, pitcher: pitcher(OVR),
      })));
      if (res.error) { err = res.error; break; }
      sh += res.hits; sk += res.strikeouts; sbb += res.walks;
      sp += res.pitches ?? 0; sw += res.whiffs ?? 0;
      sg++;
    }
    h += sh; k += sk; bb += sbb; p += sp; w += sw; games += sg;
    bySeed.push({ seed, ...rates(sh, sk, sbb, sp, sw, sg) });
    if (err) break;
  }
  return { ...mode, games, err, bySeed, ...rates(h, k, bb, p, w, games) };
}

/** 원시 합계 → 비율. **한 자리에서만 만든다** — 씨앗별과 합계가 갈리면 안 된다 */
function rates(h, k, bb, p, w, games) {
  const evt = h + k + bb;
  return {
    투구: p,
    헛스윙률: p > 0 ? (w / p) * 100 : null,
    피안타비중: evt > 0 ? h / evt : null,
    삼진비중: evt > 0 ? k / evt : null,
    볼넷비중: evt > 0 ? bb / evt : null,
    경기당투구: games > 0 ? p / games : null,
  };
}

const f2 = (v) => (v === null ? "  —  " : v.toFixed(2));
const f3 = (v) => (v === null ? "  —  " : v.toFixed(3));

(() => {
  const rows = MODES.map(runMode);
  const base = rows[0];
  console.log("");
  console.log(`── 완급(⑧) · 코스(⑨) 전후 — 엔진 직접 호출 · 씨앗 ${SEEDS.join("/")} × ${GAMES}경기 ──`);
  console.log("");
  console.log("모드          경기   투구수   헛스윙률   피안타비중  삼진비중  볼넷비중   경기당투구");
  for (const r of rows) {
    if (r.err) { console.log(`${r.key.padEnd(12)} FAIL ${r.err}`); continue; }
    console.log(
      `${r.key.padEnd(12)} ${String(r.games).padStart(5)} ${String(r.투구).padStart(8)}` +
      `   ${f2(r.헛스윙률).padStart(6)}%   ${f3(r.피안타비중).padStart(8)}  ${f3(r.삼진비중).padStart(7)}` +
      `  ${f3(r.볼넷비중).padStart(7)}   ${f2(r.경기당투구).padStart(8)}`
    );
  }
  console.log("");
  console.log("── 끔 대비 차 ─────────────────────────────────────────");
  for (const r of rows.slice(1)) {
    if (r.err || base.err) continue;
    const d = (a, b) => (a === null || b === null ? "—" : (a - b >= 0 ? "+" : "") + (a - b).toFixed(3));
    console.log(
      `${r.key.padEnd(12)} 헛스윙률 ${d(r.헛스윙률, base.헛스윙률).padStart(7)}%p` +
      `   피안타 ${d(r.피안타비중, base.피안타비중).padStart(7)}` +
      `   삼진 ${d(r.삼진비중, base.삼진비중).padStart(7)}` +
      `   볼넷 ${d(r.볼넷비중, base.볼넷비중).padStart(7)}`
    );
  }
  console.log("");
  console.log("── 씨앗별 헛스윙률 (모드별) ────────────────────────────");
  console.log("씨앗          " + rows.map((r) => r.key.padEnd(11)).join(""));
  for (let i = 0; i < SEEDS.length; i++) {
    const cells = rows.map((r) => (r.bySeed && r.bySeed[i] ? f2(r.bySeed[i].헛스윙률) + "%" : "  —  ").padEnd(11));
    console.log(String(SEEDS[i]).padEnd(14) + cells.join(""));
  }
  console.log("");
  console.log("⚠ 리그 ERA·타율·주인공 ERA 는 커리어 층이라 여기 안 나온다 —");
  console.log("  `probe:a:tempo:career` 가 그 자리다(`probe:d:loc` 와 같은 방법).");
  console.log("");
})();
