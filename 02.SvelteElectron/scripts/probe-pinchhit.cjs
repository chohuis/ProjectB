"use strict";
/**
 * 대타 빈도 — **경기당 몇 번 나는가.** `node scripts/probe-pinchhit.cjs`
 *
 * ## 왜 따로 만드나
 *
 * 대타는 **기록 항목이 없다.** 세이브 어디에도 "대타 출장"이 안 남고,
 * 리그 집계로는 `타자 수`가 조금 는 것으로만 보인다(팀당 17.4 → 18.8).
 * 그건 **몇 명이 나왔나**지 **몇 번 나왔나**가 아니다 — 같은 사람이 스무 번
 * 나와도 1로 센다. **모수를 봐야 확률을 정한다.**
 *
 * 여기서는 엔진 로그(`대타 — 이름`)를 직접 센다. 경기 단위라 절대값이 나온다.
 *
 * ⚠ **로스터·라인업·벤치는 `measure-league-games-real.cjs`에서 가져온다** —
 *   사본을 두 번 적으면 두 계측이 다른 것을 재게 된다.
 * ⚠ 실제 KBO 는 팀당 경기당 1~2회다.
 *
 *   node scripts/probe-pinchhit.cjs --games 300
 *   node scripts/probe-pinchhit.cjs --games 300 --nobench   ← 대조군
 */
const path = require("node:path");
const engine = require(path.resolve(__dirname, "../packages/engine-native"));
const shared = require(path.resolve(__dirname, "measure-league-games-real.cjs"));

const argn = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (Number(process.argv[i + 1]) || d) : d;
};
const GAMES = Math.max(1, argn("games", 300));
const SEED = argn("seed", 20260820);
const NOBENCH = process.argv.includes("--nobench");

function main() {
  const home = shared.squad(shared.roster("TEAM_HOME", SEED));
  const away = shared.squad(shared.roster("TEAM_AWAY", SEED + 1));

  let total = 0, gamesWith = 0, maxOne = 0;
  const names = new Set();

  for (let i = 0; i < GAMES; i++) {
    const opts = {
      leagueId: "LEAGUE_KBL", protagonistSide: "home", role: "SP",
      inningLimit: 9, seed: SEED + i,
      homeLineup: home.lineup, awayLineup: away.lineup,
      // ⚠ 안 넘기면 엔진이 빈 벤치로 돌아 대타가 한 번도 안 난다(대조군)
      ...(NOBENCH ? {} : { homeBench: home.bench, awayBench: away.bench }),
      myPitchers: home.pitchersOf(i), opponentPitchers: away.pitchersOf(i),
      fielders: shared.fieldersFrom(home.lineup),
    };
    const st = engine.startMatchNative(JSON.stringify(opts));
    if (JSON.parse(st).error) throw new Error("startMatch 실패");
    const fin = JSON.parse(engine.simToGameEnd(st));
    if (fin.error) throw new Error(`simToGameEnd: ${fin.error}`);

    const hits = (fin.logs ?? []).filter((l) => String(l).startsWith("대타 —"));
    for (const l of hits) names.add(String(l));
    total += hits.length;
    if (hits.length > 0) gamesWith++;
    if (hits.length > maxOne) maxOne = hits.length;
  }

  console.log(`[대타] ${GAMES}경기 · 씨앗 ${SEED}${NOBENCH ? " · 벤치 없음(대조군)" : ""}`);
  console.log(`  총 ${total}회 · 경기당 ${(total / GAMES).toFixed(2)}회`
    + ` · 팀당 경기당 ${(total / GAMES / 2).toFixed(2)}회`);
  console.log(`  대타가 난 경기 ${(gamesWith / GAMES * 100).toFixed(1)}%`
    + ` · 한 경기 최다 ${maxOne}회 · 서로 다른 대타 ${names.size}명`);
}

main();
