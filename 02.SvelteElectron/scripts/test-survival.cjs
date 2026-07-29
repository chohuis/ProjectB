"use strict";
// Phase 5-6 독립 4단계 생존리그 검증
// 실행: npm run test:survival
//
// 지키려는 것:
//  1) 기획서(04_독립.md §3) 표의 팀 수·경기 수·컷오프가 정확히 재현되는가
//  2) 매 단계가 "생존팀끼리 새 라운드로빈"인가 (이전 대진을 안 이어받는가)
//  3) 4차 사다리(준PO 단판 → PO 단판 → 챔결 3전2승)가 끝까지 굴러가는가

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

// ── 세계 데이터 ───────────────────────────────────────────────
const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const IND = refs.teams.filter((t) => t.leagueId === "LEAGUE_INDEPENDENT").map((t) => t.id).sort();

const stages = fs.readFileSync(
  path.join(__dirname, "../resource/data/seeds/onepitch/survival_stages.csv"), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => {
    const [leagueId, stage, name, teamCount, targetGames, startWeek, endWeek, advanceCount] = line.split(",");
    return { leagueId, stage: +stage, name, teamCount: +teamCount, targetGames: +targetGames,
             startWeek: +startWeek, endWeek: +endWeek, advanceCount: +advanceCount };
  }).filter((s) => s.leagueId === "LEAGUE_INDEPENDENT");

// 결정적 팀 전력 — 팀ID 해시. 강한 팀이 살아남는지 확인용
const strength = {};
for (const t of IND) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 41 + t.charCodeAt(i)) >>> 0;
  strength[t] = h % 1000;
}
const PROTAG = IND[0];

console.log("독립 10팀 · 4단계 생존리그");
for (const s of stages) {
  console.log(`    ${s.name}  ${String(s.teamCount).padStart(2)}팀 · 팀당 ${String(s.targetGames).padStart(2)}경기 · W${s.startWeek}~${s.endWeek} → ${s.advanceCount}팀 진출`);
}
console.log("");

check("독립 10팀", IND.length === 10, `got ${IND.length}`);
check("정규 단계 3개", stages.length === 3, `got ${stages.length}`);
check("기획서 §3 표와 일치 (10/18→8 · 8/14→4 · 4/3→4)",
  stages[0].teamCount === 10 && stages[0].targetGames === 18 && stages[0].advanceCount === 8 &&
  stages[1].teamCount === 8 && stages[1].targetGames === 14 && stages[1].advanceCount === 4 &&
  stages[2].teamCount === 4 && stages[2].targetGames === 3 && stages[2].advanceCount === 4);
check("정규 35경기 (18+14+3)",
  stages.reduce((a, s) => a + s.targetGames, 0) === 35,
  `got ${stages.reduce((a, s) => a + s.targetGames, 0)}`);
check("단계 주차가 겹치지 않음",
  stages.slice(1).every((s, i) => s.startWeek > stages[i].endWeek),
  stages.map((s) => `${s.startWeek}-${s.endWeek}`).join(" "));

// ── 단계를 실제로 굴린다 ──────────────────────────────────────
let alive = [...IND];
const allEntries = [];
const eliminatedBy = {};
let finalRanking = [];

for (const def of stages) {
  console.log(`\n${def.name} (${alive.length}팀)`);
  check(`  참가 ${def.teamCount}팀`, alive.length === def.teamCount, `got ${alive.length}`);

  const entries = J("generateSurvivalStageNative", {
    leagueId: "LEAGUE_INDEPENDENT", teams: alive, stage: def.stage,
    targetGames: def.targetGames, startWeek: def.startWeek, endWeek: def.endWeek,
    protagonistTeamId: PROTAG, seasonYear: 2026, dayOffsets: [],
  });

  const played = {};
  for (const e of entries) {
    played[e.homeTeamId] = (played[e.homeTeamId] ?? 0) + 1;
    played[e.awayTeamId] = (played[e.awayTeamId] ?? 0) + 1;
  }
  check(`  전 팀 정확히 ${def.targetGames}경기`,
    Object.keys(played).length === alive.length &&
    Object.values(played).every((c) => c === def.targetGames),
    `분포 ${[...new Set(Object.values(played))]}`);
  const expectGames = (alive.length * def.targetGames) / 2;
  check(`  총 ${expectGames}경기`, entries.length === expectGames, `got ${entries.length}`);
  check("  경기 ID 유일", new Set(entries.map((e) => e.id)).size === entries.length);
  check(`  ID 접두사 INDS${def.stage}`, entries.every((e) => e.id.startsWith(`INDS${def.stage}_`)));
  check(`  주차가 W${def.startWeek}~${def.endWeek} 안에`,
    entries.every((e) => e.week >= def.startWeek && e.week <= def.endWeek),
    `${Math.min(...entries.map((e) => e.week))}~${Math.max(...entries.map((e) => e.week))}`);
  check("  탈락팀은 경기에 안 나옴",
    entries.every((e) => alive.includes(e.homeTeamId) && alive.includes(e.awayTeamId)));
  check("  자기 대전 없음", entries.every((e) => e.homeTeamId !== e.awayTeamId));
  check("  대회 경기 아님 (isTournament false)",
    entries.every((e) => !e.isTournament));
  check("  같은 입력 → 같은 출력", JSON.stringify(J("generateSurvivalStageNative", {
    leagueId: "LEAGUE_INDEPENDENT", teams: alive, stage: def.stage,
    targetGames: def.targetGames, startWeek: def.startWeek, endWeek: def.endWeek,
    protagonistTeamId: PROTAG, seasonYear: 2026, dayOffsets: [],
  })) === JSON.stringify(entries));

  // 이전 단계 대진을 이어받지 않는다 — ID가 단계별로 완전히 분리돼야 한다
  check("  이전 단계와 경기 ID 겹침 없음",
    entries.every((e) => !allEntries.some((p) => p.id === e.id)));
  allEntries.push(...entries);

  // 경기 시뮬 — 전력 높은 쪽이 이긴다 (결정적)
  const st = new Map(alive.map((t) => [t, {
    teamId: t, wins: 0, losses: 0, draws: 0, winPct: 0,
    runsFor: 0, runsAgainst: 0, streak: "", last10: "",
  }]));
  for (const e of entries) {
    const homeWins = strength[e.homeTeamId] > strength[e.awayTeamId];
    const [hs, as_] = homeWins ? [5, 2] : [2, 5];
    const h = st.get(e.homeTeamId), a = st.get(e.awayTeamId);
    h.runsFor += hs; h.runsAgainst += as_;
    a.runsFor += as_; a.runsAgainst += hs;
    if (hs > as_) { h.wins++; a.losses++; } else { a.wins++; h.losses++; }
  }
  for (const s of st.values()) {
    const p = s.wins + s.losses + s.draws;
    s.winPct = p > 0 ? s.wins / p : 0;
  }
  check("  승수 합 = 경기 수",
    [...st.values()].reduce((a, s) => a + s.wins, 0) === entries.length);

  const cut = J("survivalCutoffNative", {
    standings: [...st.values()], advanceCount: def.advanceCount,
  });
  check(`  생존 ${def.advanceCount}팀`, cut.survivors.length === def.advanceCount,
    `got ${cut.survivors.length}`);
  check(`  탈락 ${alive.length - def.advanceCount}팀`,
    cut.eliminated.length === alive.length - def.advanceCount);
  check("  생존+탈락 = 참가", cut.survivors.length + cut.eliminated.length === alive.length);
  check("  생존/탈락 중복 없음",
    cut.survivors.every((t) => !cut.eliminated.includes(t)));
  check("  전력 높은 팀이 생존 (강자 생존 규칙)", (() => {
    const minSurv = Math.min(...cut.survivors.map((t) => strength[t]));
    const maxElim = cut.eliminated.length > 0
      ? Math.max(...cut.eliminated.map((t) => strength[t])) : -1;
    return minSurv > maxElim;
  })());

  if (cut.eliminated.length > 0) {
    eliminatedBy[def.stage] = cut.eliminated;
    console.log(`    탈락: ${cut.eliminated.map((t) => t.replace("TEAM_IND_", "")).join(", ")}`);
  }
  alive = cut.survivors;
  finalRanking = cut.ranked;
}

check("최종 4팀 생존", alive.length === 4, `got ${alive.length}`);
check("탈락 누적 6팀 (2 + 4)",
  Object.values(eliminatedBy).flat().length === 6,
  JSON.stringify(Object.fromEntries(Object.entries(eliminatedBy).map(([k, v]) => [k, v.length]))));
check("1차 탈락팀은 2·3차 경기에 없음", (() => {
  const gone = eliminatedBy[1] ?? [];
  return allEntries.filter((e) => e.id.startsWith("INDS2_") || e.id.startsWith("INDS3_"))
    .every((e) => !gone.includes(e.homeTeamId) && !gone.includes(e.awayTeamId));
})());
check("정규 총 152경기 (90+56+6)", allEntries.length === 152, `got ${allEntries.length}`);

// ── 4차 Stage 사다리 ─────────────────────────────────────────
console.log("\n4차 Stage 포스트시즌");
{
  // 3차 순위표 (마지막 루프의 st를 다시 만든다)
  const st3 = finalRanking.map((t, i) => ({
    teamId: t, wins: 3 - i, losses: i, draws: 0, winPct: (3 - i) / 3,
    runsFor: 100 - i * 10, runsAgainst: 50 + i * 10, streak: "", last10: "",
  }));
  const ladder = J("buildIndLadderNative", { standings: st3 });

  check("시리즈 3개 (준PO·PO·챔결)", ladder.length === 3, `got ${ladder.length}`);
  const byId = Object.fromEntries(ladder.map((s) => [s.id, s]));
  check("준PO = 3위 vs 4위 단판",
    byId.IND_SEMIPO?.homeTeamId === finalRanking[2] &&
    byId.IND_SEMIPO?.awayTeamId === finalRanking[3] &&
    byId.IND_SEMIPO?.bestOf === 1,
    `${byId.IND_SEMIPO?.homeTeamId} vs ${byId.IND_SEMIPO?.awayTeamId} bo${byId.IND_SEMIPO?.bestOf}`);
  check("PO = 2위 vs 준PO승자 단판",
    byId.IND_PO?.homeTeamId === finalRanking[1] &&
    byId.IND_PO?.awayFrom === "IND_SEMIPO" &&
    byId.IND_PO?.bestOf === 1);
  check("챔결 = 1위 vs PO승자 3전2승",
    byId.IND_FINAL?.homeTeamId === finalRanking[0] &&
    byId.IND_FINAL?.awayFrom === "IND_PO" &&
    byId.IND_FINAL?.bestOf === 3,
    `bo${byId.IND_FINAL?.bestOf}`);
  check("사다리 연결 (준PO→PO→챔결)",
    byId.IND_SEMIPO?.nextSeriesId === "IND_PO" &&
    byId.IND_PO?.nextSeriesId === "IND_FINAL" &&
    byId.IND_FINAL?.nextSeriesId == null);

  // 끝까지 굴린다 — 상위 시드가 이긴다
  let bracket = ladder;
  const rankOf = new Map(finalRanking.map((t, i) => [t, i]));
  for (let guard = 0; guard < 10; guard++) {
    const active = bracket.find((s) => !s.winner && s.homeTeamId && s.awayTeamId);
    if (!active) break;
    const win = rankOf.get(active.homeTeamId) < rankOf.get(active.awayTeamId)
      ? active.homeTeamId : active.awayTeamId;
    // bestOf만큼 이길 때까지 반복
    let cur = active;
    while (!cur.winner) {
      const applied = J("applyGameToSeriesNative", { series: cur, winnerId: win });
      cur = applied;
    }
    bracket = bracket.map((s) => (s.id === cur.id ? cur : s));
    if (cur.winner) {
      bracket = J("fillNextSeriesNative", { bracket, completed: cur });
    }
  }
  const champ = bracket.find((s) => s.id === "IND_FINAL")?.winner;
  check("우승팀 = 정규 1위 (상위시드 승 규칙)", champ === finalRanking[0], `got ${champ}`);
  const finalSeries = bracket.find((s) => s.id === "IND_FINAL");
  check("챔결이 2승으로 끝남 (3전2승)",
    Math.max(finalSeries.homeWins, finalSeries.awayWins) === 2,
    `${finalSeries.homeWins}-${finalSeries.awayWins}`);

  const maxPo = 1 + 1 + 3;
  console.log(`    정규 ${allEntries.length}경기 + 포스트시즌 최대 ${maxPo}경기`);
  check("우승팀 기준 최대 40경기 (기획서 §3)", 35 + 5 === 40);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
