"use strict";
// Phase 5-7 프로 포스트시즌 검증 (1군 5강 사다리 · 2군 축약 PO)
// 실행: npm run test:propo
//
// 지키려는 것:
//  1) 기획서(01_프로.md §4) 5강 사다리가 정확한가 — 특히 **3위가 빠지지 않는가**
//     (v1 6강 브래킷은 WC 5vs6 → 준PO 4위 → PO 2위로 3위가 통째로 누락됐다)
//  2) WC 어드밴티지("4위 1승, 5위 2승")가 실제로 작동하는가
//  3) 2군 축약 사다리가 전부 단판인가
//  4) 배경 자동처리가 어드밴티지를 삼키지 않는가

const path = require("node:path");
const fs = require("node:fs");
const engine = require("../packages/engine-native");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const J = (fn, p) => {
  const r = JSON.parse(engine[fn](JSON.stringify(p)));
  if (r && typeof r === "object" && !Array.isArray(r) && r.error) throw new Error(`${fn}: ${r.error}`);
  return r;
};

const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const KBL = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1")).map((t) => t.id).sort();
const FARM = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_2")).map((t) => t.id).sort();

/** 순위 1~n을 그대로 주는 가짜 순위표 (index 0 = 1위) */
const mkStandings = (teams) => teams.map((teamId, i) => ({
  teamId, wins: 100 - i * 5, losses: 44 + i * 5, draws: 0,
  winPct: (100 - i * 5) / 144,
  runsFor: 700 - i * 10, runsAgainst: 600 + i * 10, streak: "", last10: "",
}));

// ── 1군 5강 사다리 ────────────────────────────────────────────
console.log("프로 1군 5강 와일드카드 사다리");
const kblSt = mkStandings(KBL);
const R = KBL;  // 순위 = 배열 순서
const kbl = J("buildKblBracketNative", { standings: kblSt });
const byId = Object.fromEntries(kbl.map((s) => [s.id, s]));

for (const s of kbl) {
  const home = s.homeTeamId ? s.homeTeamId.replace("TEAM_KBL_", "").replace("_1", "") : "(대기)";
  const away = s.awayTeamId ? s.awayTeamId.replace("TEAM_KBL_", "").replace("_1", "") : `(${s.awayFrom} 승자)`;
  console.log(`    ${s.round.padEnd(8)} ${home} vs ${away}  ${s.bestOf}전${Math.ceil((s.bestOf + 1) / 2)}승  시작 ${s.homeWins}-${s.awayWins}`);
}
console.log("");

check("시리즈 4개 (WC·준PO·PO·KS)", kbl.length === 4, `got ${kbl.length}`);
check("WC = 4위 vs 5위 (5강 — 6강 아님)",
  byId.KBL_WC?.homeTeamId === R[3] && byId.KBL_WC?.awayTeamId === R[4],
  `${byId.KBL_WC?.homeTeamId} vs ${byId.KBL_WC?.awayTeamId}`);
check("준PO = 3위 vs WC승자  ← v1 버그(3위 누락) 회귀 방지",
  byId.KBL_PREP?.homeTeamId === R[2] && byId.KBL_PREP?.awayFrom === "KBL_WC",
  `home=${byId.KBL_PREP?.homeTeamId} (3위=${R[2]})`);
check("PO = 2위 vs 준PO승자",
  byId.KBL_PO?.homeTeamId === R[1] && byId.KBL_PO?.awayFrom === "KBL_PREP");
check("KS = 1위 직행 vs PO승자",
  byId.KBL_KS?.homeTeamId === R[0] && byId.KBL_KS?.awayFrom === "KBL_PO");

// 1~5위가 전부 어딘가에 등장한다 (v1은 3위가 없었다)
const appear = new Set(kbl.flatMap((s) => [s.homeTeamId, s.awayTeamId]).filter(Boolean));
check("1~5위 전원이 대진에 등장", R.slice(0, 5).every((t) => appear.has(t)),
  R.slice(0, 5).filter((t) => !appear.has(t)).join(",") || "누락 없음");
check("6위 이하는 등장 안 함", R.slice(5).every((t) => !appear.has(t)));

check("준PO·PO 5전3승", byId.KBL_PREP?.bestOf === 5 && byId.KBL_PO?.bestOf === 5);
check("KS 7전4승", byId.KBL_KS?.bestOf === 7);
check("사다리 연결 (WC→준PO→PO→KS)",
  byId.KBL_WC?.nextSeriesId === "KBL_PREP" &&
  byId.KBL_PREP?.nextSeriesId === "KBL_PO" &&
  byId.KBL_PO?.nextSeriesId === "KBL_KS" &&
  byId.KBL_KS?.nextSeriesId == null);

// ── WC 어드밴티지 ─────────────────────────────────────────────
// "5위는 2승, 4위는 1승만 해도 진출" — 홈 1승을 안고 시작하는 3전2승으로 표현
console.log("\n와일드카드 어드밴티지");
check("WC는 3전2승 · 홈 1승 선취 상태로 시작",
  byId.KBL_WC?.bestOf === 3 && byId.KBL_WC?.homeWins === 1 && byId.KBL_WC?.awayWins === 0,
  `bo${byId.KBL_WC?.bestOf} ${byId.KBL_WC?.homeWins}-${byId.KBL_WC?.awayWins}`);
{
  // 4위가 1승 → 즉시 진출
  const a = J("applyGameToSeriesNative", { series: byId.KBL_WC, winnerId: R[3] });
  check("4위가 1승하면 바로 진출", a.winner === R[3], `winner=${a.winner}`);

  // 5위가 1승 → 아직 미결
  const b1 = J("applyGameToSeriesNative", { series: byId.KBL_WC, winnerId: R[4] });
  check("5위가 1승해도 미결 (1-1)",
    b1.winner == null && b1.homeWins === 1 && b1.awayWins === 1,
    `winner=${b1.winner} ${b1.homeWins}-${b1.awayWins}`);
  // 5위가 2승 → 진출
  const b2 = J("applyGameToSeriesNative", { series: b1, winnerId: R[4] });
  check("5위는 2연승해야 진출", b2.winner === R[4], `winner=${b2.winner}`);
  check("WC는 최대 2경기", b2.homeWins + b2.awayWins - 1 === 2,
    `치른 경기 ${b2.homeWins + b2.awayWins - 1}`);
}

// ── 배경 자동처리가 어드밴티지를 지키는가 ─────────────────────
// resolveNonProtagonistSeries는 승수를 0부터 다시 세면 안 된다
console.log("\n배경 자동처리");
{
  let wcWins4th = 0;
  let lostHeadStart = 0;
  const TRIALS = 200;
  for (let i = 0; i < TRIALS; i++) {
    const resolved = J("resolveNonProtagonistSeriesNative", {
      bracket: kbl, protagonistTeamId: "TEAM_NOBODY",
    });
    const wc = resolved.find((s) => s.id === "KBL_WC");
    if (wc.winner === R[3]) wcWins4th++;
    // 어드밴티지가 살아 있으면 홈 승수는 절대 1 밑으로 못 내려간다
    if (wc.homeWins < 1) lostHeadStart++;
  }
  check("배경 처리 후에도 홈 1승 유지 (어드밴티지 안 삼킴)",
    lostHeadStart === 0, `${lostHeadStart}/${TRIALS}회 소실`);
  // 4위 승률: 1승 선취 + 5할 코인플립 → 이론상 75%
  const rate = wcWins4th / TRIALS;
  check("4위 WC 통과율이 5할보다 확실히 높음 (기대 ~75%)",
    rate > 0.6 && rate < 0.9, `${(rate * 100).toFixed(0)}%`);

  const resolved = J("resolveNonProtagonistSeriesNative", {
    bracket: kbl, protagonistTeamId: "TEAM_NOBODY",
  });
  check("전 시리즈가 한 번에 정리됨", resolved.every((s) => !!s.winner),
    resolved.filter((s) => !s.winner).map((s) => s.id).join(","));
  const ks = resolved.find((s) => s.id === "KBL_KS");
  check("한국시리즈 우승팀이 1~5위 중 하나",
    R.slice(0, 5).includes(ks.winner), `champ=${ks.winner}`);
  check("KS 승수 합이 4~7 (7전4승)",
    ks.homeWins + ks.awayWins >= 4 && ks.homeWins + ks.awayWins <= 7,
    `${ks.homeWins}-${ks.awayWins}`);
}

// ── 2군 축약 사다리 ───────────────────────────────────────────
console.log("\n프로 2군 축약 포스트시즌");
{
  const farmSt = mkStandings(FARM);
  const F = FARM;
  const farm = J("buildFarmBracketNative", { standings: farmSt });
  const fid = Object.fromEntries(farm.map((s) => [s.id, s]));

  for (const s of farm) {
    const home = s.homeTeamId.replace("TEAM_KBL_", "").replace("_2", "");
    const away = s.awayTeamId ? s.awayTeamId.replace("TEAM_KBL_", "").replace("_2", "") : `(${s.awayFrom} 승자)`;
    console.log(`    ${s.round.padEnd(10)} ${home} vs ${away}  ${s.bestOf}전`);
  }

  check("시리즈 3개", farm.length === 3, `got ${farm.length}`);
  check("준결승 = 3위 vs 4위",
    fid.FARM_SEMI?.homeTeamId === F[2] && fid.FARM_SEMI?.awayTeamId === F[3]);
  check("PO = 2위 vs 준결승승자",
    fid.FARM_PO?.homeTeamId === F[1] && fid.FARM_PO?.awayFrom === "FARM_SEMI");
  check("결승 = 1위 vs PO승자",
    fid.FARM_FINAL?.homeTeamId === F[0] && fid.FARM_FINAL?.awayFrom === "FARM_PO");
  check("전부 단판 (1군 5강처럼 무겁게 안 감)",
    farm.every((s) => s.bestOf === 1), farm.map((s) => s.bestOf).join(","));
  check("어드밴티지 없음 (홈 선취승 0)",
    farm.every((s) => s.homeWins === 0 && s.awayWins === 0));
  check("상위 4팀만 참가", (() => {
    const seen = new Set(farm.flatMap((s) => [s.homeTeamId, s.awayTeamId]).filter(Boolean));
    return F.slice(0, 4).every((t) => seen.has(t)) && F.slice(4).every((t) => !seen.has(t));
  })());

  const resolved = J("resolveNonProtagonistSeriesNative", {
    bracket: farm, protagonistTeamId: "TEAM_NOBODY",
  });
  check("끝까지 굴러 우승팀 1팀", !!resolved.find((s) => s.id === "FARM_FINAL")?.winner);
  check("총 3경기 (단판 × 3)",
    resolved.reduce((a, s) => a + s.homeWins + s.awayWins, 0) === 3,
    `${resolved.reduce((a, s) => a + s.homeWins + s.awayWins, 0)}`);
}

// ── 팀 수 부족 방어 ───────────────────────────────────────────
console.log("\n방어");
check("1군 5팀 미만이면 빈 브래킷",
  J("buildKblBracketNative", { standings: mkStandings(KBL.slice(0, 4)) }).length === 0);
check("2군 4팀 미만이면 빈 브래킷",
  J("buildFarmBracketNative", { standings: mkStandings(FARM.slice(0, 3)) }).length === 0);
check("정확히 5팀이면 1군 사다리 성립",
  J("buildKblBracketNative", { standings: mkStandings(KBL.slice(0, 5)) }).length === 4);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
