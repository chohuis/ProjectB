"use strict";
/**
 * A 계측 — **타자 노림수(결정 ⑩)와 결정구(결정 ⑪) 전후.**
 *
 *   npm run probe:a:read
 *   npm run probe:a:read -- --games 400
 *
 * 🔴 **게임 루프를 안 탄다.** `runSimpleGame` 으로 엔진만 직접 부른다 —
 *   `probe:a:tempo`(결정 ⑧⑨)와 같은 자리·같은 방법이다. 커리어를 굴려 재면
 *   진로가 갈려 표본이 흔들린다(`BALANCE_BASELINE_101.md` §3 이 그 기록이다).
 *
 * 모드는 환경변수 둘로 가른다 — **한 프로세스에서 다 돈다.** Rust 가 매
 * 투구마다 `std::env::var` 로 읽는다(`tuning.rs batter_read_mode`·`putaway_mode`).
 *
 *     끔(전)      PB_BATTER_READ=0 PB_PUTAWAY=0  ← ⑩⑪ 이전과 **완전히 같다**
 *     노림수만    PB_BATTER_READ=1 PB_PUTAWAY=0     (투수 반복 페널티도 절반으로)
 *     결정구만    PB_BATTER_READ=0 PB_PUTAWAY=1
 *     둘 다(후)   PB_BATTER_READ=1 PB_PUTAWAY=1
 *
 * ⚠ **⑩ 을 끄면 투수 쪽 반복 페널티도 예전 크기(−1/−2/−4)로 돌아간다.**
 *   절반을 타자 쪽으로 옮긴 것이 결정 ⑩ 의 일부라서다 — 한쪽만 되돌리면
 *   「전」이 예전과 다른 상태가 되어 비교가 안 된다.
 *
 * 🔴 **두 번째 표가 이 계측의 목적이다** — 구종 개수(2·3·4·5)별 피안타율.
 *   노림수가 들어오기 전에는 arsenal 이 넓어도 산식상 이득이 거의 없었다.
 *   여기서 「넓을수록 낫다」가 안 나오면 ⑩ 이 제 일을 못 한 것이다.
 *
 * ⚠ **피안타율의 분모는 주인공이 상대한 타석이다** — `plate_appearances`
 *   (`GameSummary`)에서 볼넷을 뺀 타수를 쓴다. `pitches`·`whiffs` 는 양쪽
 *   반 합계라 분모가 안 맞아 헛스윙률만 참고로 둔다.
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
  { key: "끔(전)",     read: "0", put: "0" },
  { key: "노림수만(⑩)", read: "1", put: "0" },
  { key: "결정구만(⑪)", read: "0", put: "1" },
  { key: "둘 다(후)",   read: "1", put: "1" },
];

/** `probe:a:tempo` 와 **같은 투수**다 — 두 계측을 나란히 읽으려면 입력이 같아야 한다 */
const BASE_ARSENAL = [
  { type: "fastball", grade: 3 }, { type: "slider", grade: 3 },
  { type: "curve", grade: 2 }, { type: "changeup", grade: 2 },
];

/**
 * 구종 개수 표의 투수 — **등급 합을 맞춘다.** 개수만 늘리면서 등급도 같이
 * 늘면 「구종이 많아 유리한지, 잘 다듬어 유리한지」를 못 가른다.
 * ⚠ 결정구(⑪)가 걸리게 **하나만 4등급**으로 둔다(전부 같은 등급이면
 *   `is_putaway_pitch` 가 아무것도 결정구로 안 본다 — 그게 규칙이다).
 */
const KINDS = ["fastball", "slider", "curve", "changeup", "forkball"];
const arsenalOf = (n) => KINDS.slice(0, n).map((type, i) => ({ type, grade: i === 1 ? 4 : 3 }));

/**
 * 🔴 **바탕 품질을 맞춘 사다리** — 위 `arsenalOf` 로는 구종 개수를 못 잰다.
 *
 * `tuning.rs pitch_base` 는 구종마다 다르다(직구 59 … 너클 50). 그래서 구종을
 * 늘리면 **개수가 늘어나는 동시에 평균 바탕 품질이 내려간다** — 둘이 반대
 * 방향이라 「넓어서 유리한지, 바탕이 나빠 불리한지」를 못 가른다. 실제로
 * `arsenalOf` 사다리는 2개 .251 → 5개 .268 로 **넓을수록 나빠 보였다.**
 *
 * 여기서는 바탕이 비슷한 구종만 골라 그 힘을 죽인다:
 *   직구 59 · 커터 56 · 슬라이더 56 · 스플리터 54 · 커브 54  (평균 56.5 → 55.8)
 * ⚠ **전부 3등급이다.** 하나만 올리면 그게 결정구가 되어 ⑪ 이 섞인다 —
 *   이 표는 ⑩ 만 본다(`is_putaway_pitch` 는 등급이 다 같으면 거짓이다).
 */
const FLAT_KINDS = ["fastball", "cutter", "slider", "splitter", "curve"];
const flatArsenalOf = (n) => FLAT_KINDS.slice(0, n).map((type) => ({ type, grade: 3 }));

const pitcher = (ovr, arsenal) => ({
  velocity: ovr, movement: ovr, command: ovr, control: ovr,
  stamina: 100, staminaCap: ovr, clutch: ovr, mentalResil: ovr, arsenal,
});

function runGames(arsenal) {
  let h = 0, k = 0, bb = 0, pa = 0, p = 0, w = 0, games = 0, err = null;
  const bySeed = [];
  for (const seed of SEEDS) {
    let sh = 0, sk = 0, sbb = 0, spa = 0, sp = 0, sw = 0, sg = 0;
    for (let i = 0; i < GAMES; i++) {
      const res = JSON.parse(engine.runSimpleGame(JSON.stringify({
        seed: seed + i, protagonistOvr: OVR, opponentOvr: OVR, pitcher: pitcher(OVR, arsenal),
      })));
      if (res.error) { err = res.error; break; }
      sh += res.hits; sk += res.strikeouts; sbb += res.walks;
      spa += res.plateAppearances ?? 0;
      sp += res.pitches ?? 0; sw += res.whiffs ?? 0;
      sg++;
    }
    h += sh; k += sk; bb += sbb; pa += spa; p += sp; w += sw; games += sg;
    bySeed.push({ seed, ...rates(sh, sk, sbb, spa, sp, sw, sg) });
    if (err) break;
  }
  return { games, err, bySeed, ...rates(h, k, bb, pa, p, w, games) };
}

/** 원시 합계 → 비율. **한 자리에서만 만든다** — 씨앗별과 합계가 갈리면 안 된다 */
function rates(h, k, bb, pa, p, w, games) {
  const evt = h + k + bb;
  const ab = pa - bb;   // 타수 = 타석 − 볼넷 (희생타는 이 엔진에 따로 안 샌다)
  return {
    타석: pa,
    피안타율: ab > 0 ? h / ab : null,
    헛스윙률: p > 0 ? (w / p) * 100 : null,
    피안타비중: evt > 0 ? h / evt : null,
    삼진비중: evt > 0 ? k / evt : null,
    볼넷비중: evt > 0 ? bb / evt : null,
  };
}

const f2 = (v) => (v === null || v === undefined ? "  —  " : v.toFixed(2));
const f3 = (v) => (v === null || v === undefined ? "  —  " : v.toFixed(3));
const d3 = (a, b) => (a === null || b === null ? "—" : (a - b >= 0 ? "+" : "") + (a - b).toFixed(3));

(() => {
  // ── ① 모드 넷 ──────────────────────────────────────────────
  const rows = MODES.map((m) => {
    process.env.PB_BATTER_READ = m.read;
    process.env.PB_PUTAWAY = m.put;
    return { ...m, ...runGames(BASE_ARSENAL) };
  });
  const base = rows[0];
  console.log("");
  console.log(`── 노림수(⑩) · 결정구(⑪) 전후 — 엔진 직접 호출 · 씨앗 ${SEEDS.join("/")} × ${GAMES}경기 ──`);
  console.log("");
  console.log("모드           경기   피안타율  헛스윙률   피안타비중  삼진비중  볼넷비중");
  for (const r of rows) {
    if (r.err) { console.log(`${r.key.padEnd(13)} FAIL ${r.err}`); continue; }
    console.log(
      `${r.key.padEnd(13)} ${String(r.games).padStart(5)}     ${f3(r.피안타율)}` +
      `   ${f2(r.헛스윙률).padStart(6)}%   ${f3(r.피안타비중).padStart(8)}  ${f3(r.삼진비중).padStart(7)}  ${f3(r.볼넷비중).padStart(7)}`
    );
  }
  console.log("");
  console.log("── 끔 대비 차 ─────────────────────────────────────────");
  for (const r of rows.slice(1)) {
    if (r.err || base.err) continue;
    console.log(
      `${r.key.padEnd(13)} 피안타율 ${d3(r.피안타율, base.피안타율).padStart(7)}` +
      `   헛스윙률 ${d3(r.헛스윙률, base.헛스윙률).padStart(7)}%p` +
      `   삼진 ${d3(r.삼진비중, base.삼진비중).padStart(7)}   볼넷 ${d3(r.볼넷비중, base.볼넷비중).padStart(7)}`
    );
  }
  console.log("");
  console.log("── 씨앗별 피안타율 (모드별) ────────────────────────────");
  console.log("씨앗          " + rows.map((r) => r.key.padEnd(13)).join(""));
  for (let i = 0; i < SEEDS.length; i++) {
    console.log(String(SEEDS[i]).padEnd(14) +
      rows.map((r) => (r.bySeed && r.bySeed[i] ? f3(r.bySeed[i].피안타율) : "  —  ").padEnd(13)).join(""));
  }

  // ── ② 구종 개수 ────────────────────────────────────────────
  console.log("");
  console.log("── 구종 개수별 피안타율 — **이게 결정 ⑩ 의 목적이다** ──");
  console.log("");
  for (const m of [MODES[0], MODES[3]]) {
    process.env.PB_BATTER_READ = m.read;
    process.env.PB_PUTAWAY = m.put;
    const cells = [2, 3, 4, 5].map((n) => ({ n, ...runGames(arsenalOf(n)) }));
    const two = cells[0];
    console.log(`  [${m.key}]  구종수   피안타율   2개 대비   헛스윙률   삼진비중`);
    for (const c of cells) {
      console.log(
        `           ${String(c.n).padStart(5)}      ${f3(c.피안타율)}     ${d3(c.피안타율, two.피안타율).padStart(7)}` +
        `    ${f2(c.헛스윙률).padStart(6)}%   ${f3(c.삼진비중).padStart(7)}`
      );
    }
    console.log("");
  }
  // ── ③ 구종 개수 (바탕 품질을 맞춘 사다리) ─────────────────
  console.log("── 구종 개수별 피안타율 · **바탕 품질을 맞춘 사다리** ──");
  console.log("   (직구59·커터56·슬라이더56·스플리터54·커브54 · 전부 3등급 — ⑪ 은 안 걸린다)");
  console.log("");
  const flat = {};
  for (const m of [MODES[0], MODES[1]]) {
    process.env.PB_BATTER_READ = m.read;
    process.env.PB_PUTAWAY = m.put;
    flat[m.key] = [2, 3, 4, 5].map((n) => ({ n, ...runGames(flatArsenalOf(n)) }));
    const two = flat[m.key][0];
    console.log(`  [${m.key}]  구종수   피안타율   2개 대비   헛스윙률   삼진비중`);
    for (const c of flat[m.key]) {
      console.log(
        `           ${String(c.n).padStart(5)}      ${f3(c.피안타율)}     ${d3(c.피안타율, two.피안타율).padStart(7)}` +
        `    ${f2(c.헛스윙률).padStart(6)}%   ${f3(c.삼진비중).padStart(7)}`
      );
    }
    console.log("");
  }
  console.log("  ⑩ 이 구종 개수에 준 몫 (끔 → 노림수만 · 음수면 넓을수록 이득) ──");
  for (let i = 0; i < 4; i++) {
    const off = flat[MODES[0].key][i], on = flat[MODES[1].key][i];
    console.log(`    구종 ${on.n}개   피안타율 ${f3(off.피안타율)} → ${f3(on.피안타율)}   차 ${d3(on.피안타율, off.피안타율)}`);
  }
  console.log("");

  // ── ④ 산식 입력을 직접 센다 ────────────────────────────────
  //
  // 🔴 **피안타율로는 못 가른다.** 위 표의 잡음 폭이 ±0.010 인데 노림수
  //   회피가 주는 몫은 그보다 작다. 결과 말고 **입력**을 세면 또렷하다 —
  //   구종을 넓히면 「읽히는 빈도·크기」가 정말 주는가.
  console.log("── 구종 개수 → 얼마나 읽히나 (산식 입력 직접 계측) ──");
  console.log("");
  console.log("  구종수   휘두른공당 읽힌 몫   읽힌 비율   휘두른 공");
  process.env.PB_BATTER_READ = "1";
  process.env.PB_PUTAWAY = "0";
  for (const n of [2, 3, 4, 5]) {
    engine.resetReadTallyNative();
    runGames(flatArsenalOf(n));
    const t = JSON.parse(engine.readTallyStatsNative());
    console.log(
      `  ${String(n).padStart(5)}      ${f3(t["휘두른공당평균읽힌몫"]).padStart(10)}` +
      `        ${(t["읽힌비율"] * 100).toFixed(1).padStart(6)}%   ${String(t["휘두른공"]).padStart(8)}`
    );
  }
  console.log("");
  console.log("  ⚠ **분모는 휘두른 공이다** — 노림수는 콘택트 품질에 걸리므로 타자가");
  console.log("    안 휘두른 공은 이 카운터를 안 탄다.");
  console.log("  ⚠ **양쪽 반 합계**다 — 상대 투수의 공도 같은 카운터를 탄다. 주인공");
  console.log("    arsenal 만 바꾸면 절반만 움직이므로 실제 구종 효과는 약 두 배다.");
  console.log("");
  console.log("⚠ 리그 ERA·타율은 커리어 층이라 여기 안 나온다 — `probe:d:loc` 가 그 자리다.");
  console.log("");
})();
