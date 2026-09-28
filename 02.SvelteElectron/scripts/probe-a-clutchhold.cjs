"use strict";
/**
 * A 계측 — **위기집중력(`clutch`)·견제력(`holdRunners`)이 경기 결과에 닿는 양.**
 * (2026-09-28 · 결정 ④ 0단계 · 정본 `docs/SIM_103_CLUTCH_PLATOON_2026-09-28.md`)
 *
 *   node scripts/probe-a-clutchhold.cjs            (= npm run probe:a:clutchhold)
 *   node scripts/probe-a-clutchhold.cjs --games 300
 *
 * 🔴 **왜 `probe:a:read` 로는 못 재나.** 저쪽은 `runSimpleGame` 을 쓰는데 그
 *   반환(`GameSummary`)에 **득점권도 도루도 없다.** 이 두 스탯이 걸리는 자리가
 *   바로 거기다 — 합계 피안타율로 보면 희석돼 0 으로 보인다. 그래서 리그 경기와
 *   **같은 경로**(`startMatchNative` → `simToGameEnd` ·
 *   `measure-league-games.cjs` 가 하는 그대로)를 타고 끝난 상태를 직접 읽는다.
 *
 * ⚠ **`ELECTRON_RUN_AS_NODE` 가 필요 없다** — 엔진 `.node` 를 맨 node 가 바로
 *   읽는다(`probe:a:slotmult` 과 같은 자리). electron 동시 실행 한도를 안 먹는다.
 *
 * ── 함정 셋. **이걸 모르면 「죽었다」고 잘못 적는다** ─────────────────────
 *
 * 🔴 **① 라인업에 `id` 가 없으면 도루가 기록에 안 쌓인다.** `batterMean` 만
 *   주면 엔진이 합성 타자를 만드는데 그 타자에게 `id` 가 없다. 그러면 주자의
 *   `player_id` 가 `None` 이라 `attempt_steals` 가 넘기는 `stole_ids` ·
 *   `caught_ids` 가 비고 `sb`/`cs` 가 **한 건도 안 오른다** — 판정은 도는데
 *   셀 자리가 없다. 실측: 로그엔 「도루 성공」·「견제사」가 찍히는데 `sb`=0.
 *   리그 경기는 `gameSimulator.ts toEngineBatter` 가 `id` 를 넣으므로 이
 *   함정은 **계측에만** 있다.
 *
 * 🔴 **② 주자 `speed` 가 75 이하면 도루 시도가 구조적으로 0 이다.**
 *   `tuning.rs steal_second_probs` 의 시도식이
 *   `(speed − 75) × 0.008 × (instinct/75) × hold_factor` 라 **75 미만은 음수 →
 *   0 으로 깎인다.** 그래서 「OVR 60 타자 아홉」으로 재면 도루가 0 이고
 *   `holdRunners` 는 **정의상** 아무 데도 안 닿는다. 아래는 주자 `speed` 를
 *   **81**(그 상수 주석이 적어 둔 실측 중앙값)으로 둔다 — 그게 리그에서
 *   도루를 실제로 하는 주자다.
 *
 * 🔴 **③ `risp_ab`/`risp_h` 는 풀 엔진에서 안 쌓인다** (2026-09-28 실측).
 *   올리는 자리가 `npc_sim.rs`(간이 모델)뿐이고 `match_engine.rs` 에는
 *   **한 줄도 없다** — 어댑터(`collect_player_lines`)가 0 을 그대로 실어
 *   나른다. `FULL_ENGINE_LEAGUES` 가 전 무대라서 **리그 전체 득점권 성적이
 *   0** 이다. 그래서 이 프로브는 득점권 칸을 **찍기만 하고 0 이면 0 이라고
 *   적는다** — 배선이 이어지면 저절로 값이 든다.
 *
 * ── 무엇을 어떻게 가르나 — **한 번에 한 스탯만** ──────────────────────
 *
 *   ① 위기집중력 clutch 30 vs 90 · 경기 전체   (holdRunners 50 고정)
 *   ② 위기집중력 clutch 30 vs 90 · **9회 1점차 반이닝만**
 *        → `clutch_modifier` 는 `inning/inningLimit ≥ 0.67` **그리고**
 *          3점차 이내에서만 0 이 아니다. 경기 전체 평균으로는 그 자리가
 *          4분의 1 이라 묻힌다 — 걸리는 자리만 떼어 재는 표가 이것이다.
 *   ③ 견제력 holdRunners 30 vs 90 · 경기 전체  (clutch 50 고정)
 *        → 도루 시도 · 성공 · 성공률 · 견제사
 */
const path = require("node:path");
const engine = require(path.join(process.cwd(), "packages/engine-native"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
/** 씨앗마다 몇 경기 — 씨앗 셋이라 합계는 이 값의 세 배다 */
const GAMES = arg("games", 300);
const SEEDS = (process.env.PF_SEEDS || "20260802,777,31337").split(",").map((s) => Number(s.trim()));
const OVR = arg("ovr", 60);
/** 주자 발 — 위 함정 ② */
const RUNNER_SPEED = arg("speed", 81);

/** 재는 스탯 빼고 **전부 같은 투수**다 — 다르면 무엇이 움직였는지 못 가른다 */
function pitcherOf(clutch, hold) {
  return {
    velocity: OVR, movement: OVR, command: OVR, control: OVR,
    staminaCap: 100, mentalResil: OVR,
    clutch, holdRunners: hold,
    arsenal: [
      { type: "fastball", grade: 3 }, { type: "slider", grade: 3 },
      { type: "curve", grade: 2 }, { type: "changeup", grade: 2 },
    ],
  };
}

/** ⚠ 아홉 명이 다 같은 타자다 — 타자 쪽에 분산을 주면 잡음만 늘어난다 */
function lineupOf(prefix, speed) {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `${prefix}${i + 1}`, name: `${prefix}${i + 1}`,
    contact: OVR, power: OVR, eye: OVR, discipline: OVR,
    battingClutch: OVR, platoon: 50,
    speed, baseInstinct: 75, bunting: OVR,
    fielding: OVR, arm: OVR,
  }));
}

function optsOf(seed, i, clutch, hold) {
  return {
    leagueId: "LEAGUE_KBL",
    protagonistSide: "home",
    role: "SP",
    inningLimit: 9,
    extraInningLimit: 9,          // 연장을 끊는다 — 이닝이 들쭉날쭉하면 분모가 흔들린다
    batterMean: OVR,
    homeLineup: lineupOf("HM", OVR),
    awayLineup: lineupOf("AW", RUNNER_SPEED),
    initialStamina: 100,
    initialMental: 100,
    pitchLimitOverride: 400,      // 완투시킨다 — 중간에 내려가면 남은 이닝이 대조군 몫이 된다
    weather: "sunny",
    park: "neutral",
    protagonistPitcher: pitcherOf(clutch, hold),
    seed: seed + i,
  };
}

function start(o) {
  const st = JSON.parse(engine.startMatchNative(JSON.stringify(o)));
  if (st.error) throw new Error(`startMatch: ${st.error}`);
  return st;
}

/** 경기 전체 — 씨앗마다 GAMES 판 */
function runFullGames(clutch, hold) {
  const t = { outs: 0, er: 0, k: 0, bb: 0, h: 0, ab: 0, rispAb: 0, rispH: 0,
              sb: 0, cs: 0, pick: 0, games: 0, runs: 0 };
  for (const seed of SEEDS) {
    for (let i = 0; i < GAMES; i++) {
      const fin = JSON.parse(engine.simToGameEnd(JSON.stringify(start(optsOf(seed, i, clutch, hold)))));
      if (fin.error) throw new Error(`simToGameEnd: ${fin.error}`);
      t.outs += fin.outsSinceEntry ?? 0;
      t.er   += fin.erSinceEntry ?? 0;
      t.k    += fin.kSinceEntry ?? 0;
      t.bb   += fin.bbSinceEntry ?? 0;
      for (const b of fin.awayBatLines ?? []) {
        t.ab += b.ab ?? 0; t.h += b.h ?? 0;
        t.rispAb += b.rispAb ?? 0; t.rispH += b.rispH ?? 0;
        t.sb += b.sb ?? 0; t.cs += b.cs ?? 0;
      }
      for (const l of fin.logs ?? []) if (l.startsWith("견제사")) t.pick++;
      t.runs += fin.score?.away ?? 0;
      t.games++;
    }
  }
  const ip = t.outs / 3;
  const att = t.sb + t.cs;
  return {
    games: t.games,
    선발IP: t.games ? ip / t.games : null,
    피안타율: t.ab > 0 ? t.h / t.ab : null,
    득점권타수: t.rispAb,
    득점권피안타율: t.rispAb > 0 ? t.rispH / t.rispAb : null,
    ERA: ip > 0 ? (t.er * 9) / ip : null,
    실점9: t.games ? t.runs / t.games : null,
    삼진9: ip > 0 ? (t.k * 9) / ip : null,
    도루시도: att, 도루성공: t.sb, 도루실패: t.cs, 견제사: t.pick,
    도루성공률: att > 0 ? t.sb / att : null,
    시도경기당: t.games ? att / t.games : null,
  };
}

/**
 * 9회 1점차 반이닝만 — `clutch_modifier` 가 0 이 아닌 자리.
 *
 * ⚠ **`rngSeed` 를 손으로 심는다.** 상태를 JSON 으로 왕복하면 엔진이 심은
 *   u64 씨앗이 double 정밀도에 깎인다(1.3e19). 두 arm 이 같은 난수를 타야
 *   비교가 되므로 작은 정수로 덮는다.
 */
function runLateClose(clutch, hold) {
  const t = { h: 0, runs: 0, k: 0, bb: 0, halves: 0 };
  for (const seed of SEEDS) {
    for (let i = 0; i < GAMES; i++) {
      const st = start(optsOf(seed, i, clutch, hold));
      st.inning = 9;
      st.half = "top";                  // 원정 공격 = 주인공이 던진다
      st.outs = 0;
      st.count = { balls: 0, strikes: 0 };
      st.score = { home: 1, away: 0 };  // 1점차 — 압박이 제일 큰 쪽
      st.runners = { first: null, second: null, third: null };
      st.rngSeed = seed * 100000 + i;
      const r = JSON.parse(engine.simHalfInning(JSON.stringify(st)));
      if (r.error) throw new Error(`simHalfInning: ${r.error}`);
      t.h += r.hits ?? 0; t.runs += r.runs ?? 0;
      t.k += r.strikeouts ?? 0; t.bb += r.walks ?? 0;
      t.halves++;
    }
  }
  return {
    반이닝: t.halves,
    반이닝당안타: t.halves ? t.h / t.halves : null,
    반이닝당실점: t.halves ? t.runs / t.halves : null,
    반이닝당삼진: t.halves ? t.k / t.halves : null,
    반이닝당볼넷: t.halves ? t.bb / t.halves : null,
  };
}

const f2 = (v) => (v === null || v === undefined ? "  —  " : v.toFixed(2));
const f3 = (v) => (v === null || v === undefined ? "  —  " : v.toFixed(3));
const d3 = (a, b) => (a === null || b === null ? "—" : (a - b >= 0 ? "+" : "") + (a - b).toFixed(3));

(() => {
  const N = SEEDS.length * GAMES;
  console.log("");
  console.log(`── ④ 위기집중력 · 견제력이 결과에 닿는 양 — 리그 경기 경로 · 씨앗 ${SEEDS.join("/")} × ${GAMES} = ${N} ──`);
  console.log(`   투수 OVR ${OVR} · 주자 speed ${RUNNER_SPEED} · 9이닝 · 중립 구장`);
  console.log("");

  const c30 = runFullGames(30, 50);
  const c90 = runFullGames(90, 50);
  console.log("[① 위기집중력 clutch · 경기 전체]  (holdRunners 50 고정)");
  console.log("  clutch  선발IP  피안타율  득점권타수  득점권피안타율   ERA   실점9  삼진9");
  for (const [k, r] of [[30, c30], [90, c90]]) {
    console.log(`  ${String(k).padStart(6)}  ${f2(r.선발IP).padStart(5)}    ${f3(r.피안타율)}` +
      `    ${String(r.득점권타수).padStart(7)}        ${f3(r.득점권피안타율)}     ${f2(r.ERA).padStart(5)}` +
      `  ${f2(r.실점9).padStart(5)}  ${f2(r.삼진9).padStart(5)}`);
  }
  console.log(`  차(90−30)  피안타율 ${d3(c90.피안타율, c30.피안타율)}   ERA ${d3(c90.ERA, c30.ERA)}` +
    `   실점9 ${d3(c90.실점9, c30.실점9)}   삼진9 ${d3(c90.삼진9, c30.삼진9)}`);
  console.log("  ⚠ 득점권타수 0 이면 배선이 없는 것이다(머리말 함정 ③) — 성적이 0 인 게 아니다.");
  console.log("");

  const l30 = runLateClose(30, 50);
  const l90 = runLateClose(90, 50);
  console.log("[② 위기집중력 clutch · **9회 1점차 반이닝만**]  ← 걸리는 자리");
  console.log("  clutch   반이닝   반이닝당안타   실점   삼진   볼넷");
  for (const [k, r] of [[30, l30], [90, l90]]) {
    console.log(`  ${String(k).padStart(6)}   ${String(r.반이닝).padStart(6)}       ${f3(r.반이닝당안타)}` +
      `   ${f3(r.반이닝당실점)}  ${f3(r.반이닝당삼진)}  ${f3(r.반이닝당볼넷)}`);
  }
  console.log(`  차(90−30)  안타 ${d3(l90.반이닝당안타, l30.반이닝당안타)}` +
    `   실점 ${d3(l90.반이닝당실점, l30.반이닝당실점)}   삼진 ${d3(l90.반이닝당삼진, l30.반이닝당삼진)}`);
  console.log("");

  const h30 = runFullGames(50, 30);
  const h90 = runFullGames(50, 90);
  console.log("[③ 견제력 holdRunners · 경기 전체]  (clutch 50 고정)");
  console.log("  hold  선발IP  도루시도  성공  실패  성공률  경기당시도  견제사  피안타율  실점9");
  for (const [k, r] of [[30, h30], [90, h90]]) {
    console.log(`  ${String(k).padStart(4)}  ${f2(r.선발IP).padStart(5)}  ${String(r.도루시도).padStart(7)}` +
      ` ${String(r.도루성공).padStart(5)} ${String(r.도루실패).padStart(5)}   ${f3(r.도루성공률)}` +
      `    ${f3(r.시도경기당)}   ${String(r.견제사).padStart(5)}    ${f3(r.피안타율)}  ${f2(r.실점9).padStart(5)}`);
  }
  console.log(`  차(90−30)  시도 ${h90.도루시도 - h30.도루시도}   성공 ${h90.도루성공 - h30.도루성공}` +
    `   성공률 ${d3(h90.도루성공률, h30.도루성공률)}   경기당시도 ${d3(h90.시도경기당, h30.시도경기당)}` +
    `   견제사 ${h90.견제사 - h30.견제사}   실점9 ${d3(h90.실점9, h30.실점9)}`);
  console.log("");
  console.log("  ⚠ 두 arm 의 `선발IP` 가 다르면 그 표는 못 읽는 표다(머리말).");
  console.log("");
})();
