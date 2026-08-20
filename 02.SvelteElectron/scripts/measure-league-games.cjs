"use strict";
/**
 * 리그 경기 분포 계측 — `npm run measure:leaguegames`
 *
 * ## 왜 필요한가
 *
 * 리그 경기에 **씨앗을 넣기 전후로 분포가 같은지** 보려고 만들었다.
 * 씨앗 고정은 "매번 다른 결과 중 하나"를 "정해진 하나"로 만들 뿐이므로
 * 평균·분산은 그대로여야 한다. 어긋나면 씨앗 배선이 틀린 것이다.
 *
 * ## 무엇을 재나
 *
 * 리그 경기의 실제 경로를 탄다 — `gameSimulator.ts:360`이 하는 그대로
 * `startMatchNative` → `simToGameEnd`다. (`calc_npc_fallback`은 **폴백**이라
 * 여기서 안 쓴다 — 로그가 "[폴백SIM] 주인공리그 엔티티없음"인 자리다.)
 *
 * ⚠ **라인업은 엔진이 만든 합성이다**(`batterMean`). 절대 분포를 논할 땐
 * 실제 로스터로 재야 하지만, 여기 목적은 **같은 입력으로 전후를 견주는
 * 것**이라 합성으로 충분하다. 그 한계를 알고 쓴다.
 */
const path = require("node:path");
const engine = require(path.resolve(__dirname, "../packages/engine-native"));

const GAMES = (() => {
  const i = process.argv.indexOf("--games");
  return i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 2000) : 2000;
})();

/** 씨앗을 넘길 수 있으면 넘긴다 — 아직 엔진이 안 받으면 그냥 무시된다 */
const SEED = (() => {
  const i = process.argv.indexOf("--seed");
  return i !== -1 ? Number(process.argv[i + 1]) : null;
})();

function playOne(index) {
  const opts = {
    leagueId: "LEAGUE_KBL",
    protagonistSide: "home",
    role: "SP",
    inningLimit: 9,
    batterMean: 55,
    initialStamina: 82,
    initialMental: 74,
    weather: "sunny",
    park: "neutral",
  };
  // 씨앗을 주면 경기마다 다르게 — 한 씨앗으로 전 경기를 돌리면 2,000경기가
  // 같은 결과가 되어 분포가 아니라 한 점이 된다
  if (SEED !== null) opts.seed = SEED + index;

  const st = JSON.parse(engine.startMatchNative(JSON.stringify(opts)));
  if (st.error) throw new Error(`startMatch: ${st.error}`);
  const fin = JSON.parse(engine.simToGameEnd(JSON.stringify(st)));
  if (fin.error) throw new Error(`simToGameEnd: ${fin.error}`);
  return fin;
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

function stats(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    mean: Number(mean.toFixed(3)),
    sd: Number(Math.sqrt(varr).toFixed(3)),
    p10: pct(sorted, 10), p50: pct(sorted, 50), p90: pct(sorted, 90),
    min: sorted[0], max: sorted[n - 1],
  };
}

function main() {
  const home = [], away = [], total = [], pitches = [];
  let homeWins = 0, draws = 0, shutouts = 0;

  for (let i = 0; i < GAMES; i++) {
    const f = playOne(i);
    const h = f.score?.home ?? 0;
    const a = f.score?.away ?? 0;
    home.push(h); away.push(a); total.push(h + a);
    pitches.push(f.pitchCount ?? 0);
    if (h > a) homeWins++;
    else if (h === a) draws++;
    if (h === 0 || a === 0) shutouts++;
  }

  console.log(`[리그경기] ${GAMES}경기 · 씨앗 ${SEED === null ? "없음(thread_rng)" : SEED}`);
  console.log("  홈 득점  ", stats(home));
  console.log("  원정 득점", stats(away));
  console.log("  합계 득점", stats(total));
  console.log("  투구수   ", stats(pitches));
  console.log(`  홈 승률 ${(homeWins / GAMES * 100).toFixed(1)}% · 무승부 ${(draws / GAMES * 100).toFixed(1)}%`
    + ` · 완봉 낀 경기 ${(shutouts / GAMES * 100).toFixed(1)}%`);
}

main();
