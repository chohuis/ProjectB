"use strict";
// Phase 5-5d 조별예선 검증 (대학 은하기·여명기)
// 실행: npm run test:groupstage
//
// 지키려는 것:
//  1) 기획서(03_대학.md §4-2)의 조 수·조당 팀 수·본선 진출 수가 정확한가
//  2) 추첨이 시드를 무시하고 섞이는가 (기획서: "완전 랜덤, 시드 없음")
//  3) 그러면서도 worldSeed가 같으면 같은 조가 나오는가 (프로젝트 결정성 원칙)
//  4) 예선 → 본선 8강으로 이어지는가

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
const uMap = {};
for (const t of refs.teams) {
  if (t.leagueId !== "LEAGUE_UNIVERSITY") continue;
  (uMap[t.stadium] ??= []).push(t.id);
}
const UNIV_TEAMS = Object.values(uMap).flat().sort();

const winPct = {};
for (const t of UNIV_TEAMS) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 37 + t.charCodeAt(i)) >>> 0;
  winPct[t] = (h % 1000) / 1000;
}
const uRegions = Object.entries(uMap)
  .map(([regionId, teams]) => ({
    regionId, rankedTeams: [...teams].sort((a, b) => winPct[b] - winPct[a] || a.localeCompare(b)),
  }))
  .sort((a, b) => a.regionId.localeCompare(b.regionId));

const tours = fs.readFileSync(
  path.join(__dirname, "../resource/data/seeds/onepitch/tournaments.csv"), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => {
    const c = line.split(",");
    return {
      id: c[0], leagueId: c[1], name: c[2], startWeek: +c[4], endWeek: +c[5],
      totalSlots: +c[6], wildcardSlots: +c[7], seedSource: c[8],
      perGroupSlots: c[9] ? +c[9] : null, wildcardMaxGroupRank: c[10] ? +c[10] : null,
      autoSeedsFirst: c[11] === "1",
      groupCount: c[12] ? +c[12] : null, advancePerGroup: c[13] ? +c[13] : null,
      qualifyWeeks: +c[14] || 0,
    };
  });

// 기획서 §4-2 표
const EXPECT = {
  TOUR_UNIV_EUNHA:     { slots: 24, groups: 8, perGroup: 3, advance: 1, qualiGames: 3 * 8 },
  TOUR_UNIV_YEOMYEONG: { slots: 20, groups: 4, perGroup: 5, advance: 2, qualiGames: 10 * 4 },
};

const WORLD_SEED = 20260730;
const PROTAG = UNIV_TEAMS[0];

for (const def of tours.filter((t) => EXPECT[t.id])) {
  const e = EXPECT[def.id];
  console.log(`\n${def.name} (${def.totalSlots}팀 → ${def.groupCount}조 → 본선 8강)`);

  // ── 참가팀 선발 ────────────────────────────────────────────
  const sel = J("selectTournamentEntrantsNative", {
    regions: uRegions, winPct,
    totalSlots: def.totalSlots, wildcardSlots: def.wildcardSlots,
    perGroupSlots: def.perGroupSlots, wildcardMaxGroupRank: def.wildcardMaxGroupRank,
    autoSeedsFirst: def.autoSeedsFirst,
  });
  check(`참가 ${e.slots}팀`, sel.seededTeams.length === e.slots, `got ${sel.seededTeams.length}`);
  check(`조당 자동 진출 ${def.perGroupSlots}팀`,
    uRegions.every((r) => sel.regionQuota[r.regionId] === def.perGroupSlots),
    JSON.stringify(sel.regionQuota));
  check(`WC ${def.wildcardSlots}장`, sel.wildcards.length === def.wildcardSlots);
  check("참가팀 중복 없음", new Set(sel.seededTeams).size === sel.seededTeams.length);

  // ── 조 추첨 ────────────────────────────────────────────────
  const mk = (seed, year = 2026) => J("buildGroupStageNative", {
    tournamentId: def.id, leagueId: def.leagueId, seededTeams: sel.seededTeams,
    groupCount: def.groupCount, advancePerGroup: def.advancePerGroup,
    startWeek: def.startWeek, endWeek: def.startWeek + def.qualifyWeeks - 1,
    protagonistTeamId: PROTAG, seasonYear: year, worldSeed: seed, dayOffsets: [],
  });
  const stage = mk(WORLD_SEED);

  check(`${e.groups}조`, stage.groups.length === e.groups, `got ${stage.groups.length}`);
  check(`조당 ${e.perGroup}팀`,
    stage.groups.every((g) => g.teams.length === e.perGroup),
    stage.groups.map((g) => g.teams.length).join(","));
  check("전 참가팀이 어느 한 조에",
    new Set(stage.groups.flatMap((g) => g.teams)).size === e.slots);
  check(`조당 본선 진출 ${e.advance}`, stage.advancePerGroup === e.advance);
  check("조 라벨 A~",
    stage.groups.map((g) => g.label).join("") === "ABCDEFGH".slice(0, e.groups));

  // 예선 경기 수 = 조당 라운드로빈 nC2 × 조 수
  check(`예선 ${e.qualiGames}경기`, stage.matches.length === e.qualiGames,
    `got ${stage.matches.length}`);
  check("예선 경기 전부 isTournament", stage.matches.every((m) => m.isTournament === true));
  check("예선 경기 ID 유일",
    new Set(stage.matches.map((m) => m.id)).size === stage.matches.length);
  check("조 간 대전 없음", (() => {
    const gOf = {};
    for (const g of stage.groups) for (const t of g.teams) gOf[t] = g.label;
    return stage.matches.every((m) => gOf[m.homeTeamId] === gOf[m.awayTeamId]);
  })());
  check("조 안에서 전원 서로 한 번씩", (() => {
    for (const g of stage.groups) {
      const seen = new Set();
      for (const m of stage.matches) {
        if (!g.teams.includes(m.homeTeamId)) continue;
        seen.add([m.homeTeamId, m.awayTeamId].sort().join("|"));
      }
      if (seen.size !== (g.teams.length * (g.teams.length - 1)) / 2) return false;
    }
    return true;
  })());
  check(`예선이 W${def.startWeek}~${def.startWeek + def.qualifyWeeks - 1} 안에`,
    stage.matches.every((m) => m.week >= def.startWeek && m.week <= def.startWeek + def.qualifyWeeks - 1));

  // ── 추첨 성질 ──────────────────────────────────────────────
  // 시드를 무시하고 섞였는가: 상위 시드가 조에 순서대로 박혀 있으면 안 된다
  const seedOf = new Map(sel.seededTeams.map((t, i) => [t, i]));
  const topSeedGroups = sel.seededTeams
    .slice(0, e.groups)
    .map((t) => stage.groups.findIndex((g) => g.teams.includes(t)));
  check("상위 시드가 조에 순서대로 박히지 않음 (시드 없는 추첨)",
    new Set(topSeedGroups).size < e.groups || topSeedGroups.some((v, i) => v !== i),
    topSeedGroups.join(","));

  // 결정성: 같은 seed → 같은 조
  check("같은 worldSeed → 같은 조",
    JSON.stringify(mk(WORLD_SEED).groups) === JSON.stringify(stage.groups));
  // 다른 세이브 → 다른 조 ('죽음의 조'가 플레이마다 달라야 한다)
  check("다른 worldSeed → 다른 조",
    JSON.stringify(mk(WORLD_SEED + 1).groups) !== JSON.stringify(stage.groups));
  check("다음 시즌 → 다른 조",
    JSON.stringify(mk(WORLD_SEED, 2027).groups) !== JSON.stringify(stage.groups));

  // ── 예선 진행 → 본선 ───────────────────────────────────────
  // 승자는 "시드가 높은 쪽" — 결정적. 조 1위는 그 조 최상위 시드가 된다.
  const results = stage.matches.map((m) => {
    const homeWins = seedOf.get(m.homeTeamId) < seedOf.get(m.awayTeamId);
    return { matchId: m.id, homeScore: homeWins ? 5 : 1, awayScore: homeWins ? 1 : 5 };
  });
  const played = J("applyGroupResultsNative", { stage, results });

  const totalGames = played.groups.reduce(
    (a, g) => a + g.standings.reduce((b, s) => b + s.wins + s.losses + s.draws, 0), 0);
  check("전 경기가 조 순위에 반영", totalGames === e.qualiGames * 2,
    `${totalGames} vs ${e.qualiGames * 2}`);
  check("조별 승수 합 = 조 경기 수", played.groups.every((g) => {
    const w = g.standings.reduce((a, s) => a + s.wins, 0);
    return w === (g.teams.length * (g.teams.length - 1)) / 2;
  }));

  const q = JSON.parse(engine.groupStageQualifiersNative(JSON.stringify(played)));
  check("본선 진출 8팀", q.qualified.length === 8, `got ${q.qualified.length}`);
  check("진출팀 중복 없음", new Set(q.qualified).size === q.qualified.length);
  check("진출팀은 각 조 상위권", (() => {
    for (const g of played.groups) {
      const inHere = q.qualified.filter((t) => g.teams.includes(t));
      if (inHere.length !== e.advance) return false;
    }
    return true;
  })(), q.qualified.length + "팀");
  check("조 1위가 전부 포함 (조당 최상위 시드)", (() => {
    for (const g of played.groups) {
      const best = [...g.teams].sort((a, b) => seedOf.get(a) - seedOf.get(b))[0];
      if (!q.qualified.includes(best)) return false;
    }
    return true;
  })());
  if (e.advance === 1) {
    check("은하기는 조 1위만 (조당 정확히 1팀)",
      played.groups.every((g) => q.qualified.filter((t) => g.teams.includes(t)).length === 1));
  }

  // 본선 8강
  const finalStart = def.startWeek + def.qualifyWeeks;
  const b = J("generateTournamentBracketNative", {
    tournamentId: def.id, leagueId: def.leagueId, seededTeams: q.qualified,
    startWeek: finalStart, endWeek: def.endWeek,
    protagonistTeamId: PROTAG, seasonYear: 2026,
  });
  check("본선 8대진 3R 부전승 0",
    b.bracketSize === 8 && b.totalRounds === 3 && b.byeCount === 0,
    `size=${b.bracketSize} rounds=${b.totalRounds} byes=${b.byeCount}`);
  check(`본선이 W${finalStart}~${def.endWeek} 안에 (예선과 안 겹침)`,
    b.matches.every((m) => m.week >= finalStart && m.week <= def.endWeek) &&
    stage.matches.every((m) => m.week < finalStart));
  check("본선 총 7경기", b.matches.length === 7);

  // 끝까지 굴린다
  const fSeed = new Map(q.qualified.map((t, i) => [t, i]));
  let cur = b;
  for (let r = 1; r <= cur.totalRounds; r++) {
    const live = cur.matches.filter((m) => m.round === r && !m.isBye && m.homeTeamId && m.awayTeamId);
    cur = J("advanceTournamentRoundNative", {
      bracket: cur, round: r, protagonistTeamId: PROTAG,
      results: live.map((m) => ({
        matchId: m.id,
        winnerTeamId: fSeed.get(m.homeTeamId) < fSeed.get(m.awayTeamId) ? m.homeTeamId : m.awayTeamId,
      })),
    });
  }
  const champ = JSON.parse(engine.tournamentChampionNative(JSON.stringify(cur)));
  check("우승팀 = 본선 1시드", champ === q.qualified[0], `got ${champ}`);

  console.log(`    예선 ${stage.matches.length} + 본선 ${b.matches.length} = ${stage.matches.length + b.matches.length}경기`);
}

// ── 대학 대회 3종이 시기적으로 안 겹치는가 ────────────────────
console.log("\n대학 대회 일정");
{
  const uT = tours.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY")
    .sort((a, b) => a.startWeek - b.startWeek);
  for (const t of uT) {
    const q = t.qualifyWeeks > 0
      ? ` (예선 W${t.startWeek}~${t.startWeek + t.qualifyWeeks - 1} · 본선 W${t.startWeek + t.qualifyWeeks}~${t.endWeek})`
      : "";
    console.log(`    ${t.name.padEnd(6)} W${String(t.startWeek).padStart(2)}~${t.endWeek}${q}`);
  }
  check("대학 대회 3종", uT.length === 3, `got ${uT.length}`);
  check("대회 기간이 겹치지 않음",
    uT.slice(1).every((t, i) => t.startWeek > uT[i].endWeek),
    uT.map((t) => `${t.startWeek}-${t.endWeek}`).join(" "));
  check("정규리그(W1~10) 끝난 뒤에 시작", uT.every((t) => t.startWeek > 10),
    uT.map((t) => t.startWeek).join(","));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
