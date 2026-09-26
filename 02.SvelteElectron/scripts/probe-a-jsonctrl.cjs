"use strict";
/**
 * **`matchToSimResultNative` 제어문자 예외의 경로를 잰다** (2026-09-26 · A).
 *
 *   npm run probe:a:jsonctrl            # 기본 200경기
 *   node scripts/probe-a-jsonctrl.cjs --games 1000
 *
 * ## 무엇을 재나
 *
 * 09-25 24판 다섯 번째 #8 에서 한 번 났다:
 * `matchToSimResultNative: control character (U+0000~U+001F) found while
 * parsing a string`. 같은 씨앗 재실행엔 재현되지 않았다.
 *
 * 그 예외는 `lib.rs` 의 `match_to_sim_result_native` 가 **받은 문자열을
 * `serde_json::from_str` 로 펴다가** 낸 것이다(`parse_err` 첫 인자가 그 이름).
 * 그러니 물음은 하나다 — **`JSON.stringify` 가 만든 문자열에 생 제어문자가
 * 들어갈 수 있나.**
 *
 * 네 가지를 나란히 재서 답한다:
 *
 *   ① 실제 경로 — 진짜 로스터로 N경기를 `startMatch → simToGameEnd →
 *      matchToSimResultNative` 로 돌리고, 넘기는 문자열을 **바이트 단위로**
 *      훑어 0x00~0x1f 가 있는지 센다(정규식 안 쓴다).
 *   ② 자유 문자열 칸에 제어문자를 심고 **`JSON.stringify` 를 거쳐** 넘긴다
 *      (선수 이름 · 팀 id · 구종 이름). 이스케이프되면 예외가 안 나야 한다.
 *   ③ 같은 제어문자를 **`JSON.stringify` 를 안 거치고** 문자열에 직접 끼워
 *      넘긴다 — 손으로 JSON 을 이으면 어떻게 죽는지(대조군).
 *   ④ 예외가 났을 때 메시지가 **어느 칸이었는지 말해 주나.**
 *
 * ⚠ 이 프로브는 `measure-league-games-real.cjs` 의 로스터·라인업을 그대로
 *   쓴다(사본을 두 번 적으면 갈린다).
 */
const path = require("node:path");
const engine = require(path.resolve(__dirname, "../packages/engine-native"));
const { roster, squad, fieldersFrom, SEED } = require(path.resolve(__dirname,
  "./measure-league-games-real.cjs"));

const GAMES = (() => {
  const i = process.argv.indexOf("--games");
  return i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 200) : 200;
})();

/** 생 제어문자(0x00~0x1f)를 바이트로 센다 — 문자열 안/밖을 따라간다 */
function scanCtrl(s) {
  const buf = Buffer.from(s, "utf8");
  let inStr = false, esc = false;
  const hits = [];
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (esc) { esc = false; continue; }
    if (inStr && b === 0x5c) { esc = true; continue; }
    if (b === 0x22) { inStr = !inStr; continue; }
    if (b < 0x20) hits.push({ offset: i, byte: b, inStr });
  }
  return { bytes: buf.length, hits };
}

function callSim(payloadJson) {
  const raw = engine.matchToSimResultNative(payloadJson);
  const out = JSON.parse(raw);
  return { out, raw };
}

function finishedGame(home, away, i) {
  const opts = {
    leagueId: "LEAGUE_KBL", protagonistSide: "home", role: "SP",
    noProtagonist: true, inningLimit: 9, seed: SEED + i,
    homeLineup: home.lineup, awayLineup: away.lineup,
    homeBench: home.bench, awayBench: away.bench,
    myPitchers: home.pitchersOf(i), opponentPitchers: away.pitchersOf(i),
    fielders: fieldersFrom(home.lineup), opponentFielders: fieldersFrom(away.lineup),
  };
  const st = engine.startMatchNative(JSON.stringify(opts));
  const stp = JSON.parse(st);
  if (stp.error) throw new Error(`startMatch: ${stp.error}`);
  const fin = JSON.parse(engine.simToGameEnd(st));
  if (fin.error) throw new Error(`simToGameEnd: ${fin.error}`);
  return fin;
}

/** `gameSimulator.ts` 의 payload 를 그대로 만든다 */
function simPayload(fin) {
  return {
    state: fin,
    homeTeamId: "TEAM_HOME", awayTeamId: "TEAM_AWAY",
    week: 10, conditions: {},
    homeRotIdx: 0, awayRotIdx: 0,
  };
}

function main() {
  const home = squad(roster("TEAM_HOME", SEED));
  const away = squad(roster("TEAM_AWAY", SEED + 1));

  // ── ① 실제 경로 ────────────────────────────────────────────────
  let maxBytes = 0, sumBytes = 0, ctrlHits = 0, errs = 0, logLines = 0;
  for (let i = 0; i < GAMES; i++) {
    const fin = finishedGame(home, away, i);
    logLines = Math.max(logLines, Array.isArray(fin.logs) ? fin.logs.length : 0);
    const json = JSON.stringify(simPayload(fin));
    const sc = scanCtrl(json);
    maxBytes = Math.max(maxBytes, sc.bytes);
    sumBytes += sc.bytes;
    ctrlHits += sc.hits.length;
    const { out } = callSim(json);
    if (out.error) { errs++; if (errs <= 3) console.log("  예외:", out.error); }
  }
  console.log(`① 실제 경로 ${GAMES}경기`);
  console.log(`   payload 바이트  최대 ${maxBytes} · 평균 ${Math.round(sumBytes / GAMES)}`);
  console.log(`   logs 줄 최대    ${logLines}`);
  console.log(`   생 제어문자     ${ctrlHits}건`);
  console.log(`   파싱 예외       ${errs}건`);

  // ── ② 자유 문자열 칸에 제어문자 — `JSON.stringify` 를 거친다 ────
  //
  // 자유 문자열 칸만 고른다. `role`·`weather`·`park`·`half`·`entryTrigger`·
  // `lastPitchTypes` 는 enum 이라 글자를 붙이면 **다른 오류**(unknown variant)가
  // 나서 이 물음을 못 가린다. 잎 이름이 아래 목록인 칸과 로그 배열만 건드린다.
  // ⚠ `position` 은 빼 뒀다 — `FielderStats.position` 이 enum 이라 여기 넣으면
  //   제어문자와 무관한 `unknown variant` 로 죽어 물음이 가려진다(실측).
  const FREE_KEYS = new Set(["name", "id", "playerId", "matchId"]);
  const LOG_KEYS = new Set(["logs", "preEntryLogs"]);
  function poison(node, key, c, tally) {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        if (typeof node[i] === "string" && LOG_KEYS.has(key)) { node[i] += c + "제어"; tally.n++; }
        else poison(node[i], key, c, tally);
      }
      return;
    }
    if (node === null || typeof node !== "object") return;
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (typeof v === "string" && FREE_KEYS.has(k)) { node[k] = v + c + "제어"; tally.n++; }
      else poison(v, k, c, tally);
    }
  }

  const CTRL = ["\u0000", "\u001f", "\n", "\r", "\t", "\u0008"];
  const fin = finishedGame(home, away, 0);
  console.log(`② 자유 문자열 칸에 제어문자 + JSON.stringify (${CTRL.length}가지)`);
  for (const c of CTRL) {
    const hex = "0x" + c.charCodeAt(0).toString(16).padStart(2, "0");
    const p = simPayload(JSON.parse(JSON.stringify(fin)));
    const tally = { n: 0 };
    poison(p.state, "state", c, tally);
    p.homeTeamId = "TEAM_HOME" + c;
    p.awayTeamId = "TEAM_AWAY" + c;
    // 컨디션 맵의 **키**도 자유 문자열이다(선수 id)
    p.conditions = { ["NPC_X" + c]: { fatigue: 0, lastPitchedWeek: 0, pitchOutsLast: 0 } };
    const json = JSON.stringify(p);
    const sc = scanCtrl(json);
    const { out } = callSim(json);
    console.log(`   ${hex}  심은 칸 ${tally.n} · 생제어문자 ${sc.hits.length}건 · `
      + (out.error ? `🔴 ${out.error}` : "✅ 통과"));
  }

  // ── ③ 대조군 — `JSON.stringify` 를 안 거치고 손으로 끼운다 ──────
  console.log("③ 대조군 — 손으로 끼운 생 제어문자");
  for (const c of ["\u0000", "\u001f", "\n"]) {
    const hex = "0x" + c.charCodeAt(0).toString(16).padStart(2, "0");
    const base = JSON.stringify(simPayload(fin));
    // 첫 문자열 값 안에 생 바이트를 끼운다
    const at = base.indexOf('"TEAM_HOME"') + 6;
    const broken = base.slice(0, at) + c + base.slice(at);
    const sc = scanCtrl(broken);
    const { out } = callSim(broken);
    console.log(`   ${hex}  생제어문자 ${sc.hits.length}건 · `
      + (out.error ? `🔴 ${out.error}` : "✅ 통과(?!)"));
  }
}

if (require.main === module) main();
