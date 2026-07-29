"use strict";
// Phase 5-4 고교 전국대회 5종 검증
// 실행: npm run test:tournament
//
// 지키려는 것:
//  1) 기획서(02_고교.md §4-2)의 대진 크기·부전승 수가 정확히 재현되는가
//  2) 권역 크기가 6~20으로 갈려도 참가 배분이 왜곡되지 않는가
//  3) 브래킷이 끝까지 굴러가 우승팀 1팀이 나오는가

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
const regionsMap = {};
for (const t of refs.teams) {
  if (t.leagueId !== "LEAGUE_HIGHSCHOOL") continue;
  (regionsMap[t.stadium] ??= []).push(t.id);
}
const HS_TEAMS = Object.values(regionsMap).flat().sort();

// 대회 카탈로그 (정본 = seeds/onepitch/tournaments.csv)
const tours = fs.readFileSync(
  path.join(__dirname, "../resource/data/seeds/onepitch/tournaments.csv"), "utf8")
  .trim().split(/\r?\n/).slice(1).map((line) => {
    const [id, leagueId, name, flower, startWeek, endWeek, totalSlots, wildcardSlots,
           seedSource, perGroupSlots, wildcardMaxGroupRank, autoSeedsFirst, order] = line.split(",");
    return { id, leagueId, name, flower, startWeek: +startWeek, endWeek: +endWeek,
             totalSlots: +totalSlots, wildcardSlots: +wildcardSlots, seedSource,
             perGroupSlots: perGroupSlots ? +perGroupSlots : null,
             wildcardMaxGroupRank: wildcardMaxGroupRank ? +wildcardMaxGroupRank : null,
             autoSeedsFirst: autoSeedsFirst === "1",
             order: +order };
  });
const hsTours = tours.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL");
const univTours = tours.filter((t) => t.leagueId === "LEAGUE_UNIVERSITY");

// 결정적 가짜 순위 — 팀ID 해시로 승률을 만든다 (Math.random 금지 규칙 준수)
const winPct = {};
for (const t of HS_TEAMS) {
  let h = 0;
  for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0;
  winPct[t] = (h % 1000) / 1000;
}
const regions = Object.entries(regionsMap)
  .map(([regionId, teams]) => ({ regionId, rankedTeams: [...teams].sort((a, b) => winPct[b] - winPct[a] || a.localeCompare(b)) }))
  .sort((a, b) => a.regionId.localeCompare(b.regionId));

// ── 1. 카탈로그 ──────────────────────────────────────────────
console.log("대회 카탈로그");
for (const t of hsTours) console.log(`    ${t.name.padEnd(6)} W${String(t.startWeek).padStart(2)}~${t.endWeek}  ${String(t.totalSlots).padStart(3)}팀 (WC ${t.wildcardSlots})`);
console.log("");
check("고교 대회 5종", hsTours.length === 5, `got ${hsTours.length}`);
check("고교 대회 기간이 겹치지 않음",
  hsTours.slice(1).every((t, i) => t.startWeek > hsTours[i].endWeek),
  hsTours.map((t) => `${t.startWeek}-${t.endWeek}`).join(" "));

// ── 2. 기획서 대진표와 일치하는가 ─────────────────────────────
// 02_고교.md §4-2: 32강(5R) · 32강(5R) · 48강 부전승16(6R) · 128대진 부전승26(7R) · 32대진 부전승8(5R)
const EXPECT = {
  TOUR_HS_GAENARI:   { size: 32,  rounds: 5, byes: 0 },
  TOUR_HS_JANGMI:    { size: 32,  rounds: 5, byes: 0 },
  TOUR_HS_MUGUNGHWA: { size: 64,  rounds: 6, byes: 16 },
  TOUR_HS_GUKHWA:    { size: 128, rounds: 7, byes: 26 },
  TOUR_HS_PAEWANG:   { size: 32,  rounds: 5, byes: 8 },
};

const selPayload = (t, rs) => ({
  regions: rs, winPct,
  totalSlots: t.totalSlots, wildcardSlots: t.wildcardSlots,
  perGroupSlots: t.perGroupSlots, wildcardMaxGroupRank: t.wildcardMaxGroupRank,
  autoSeedsFirst: t.autoSeedsFirst,
});

const brackets = {};
for (const t of hsTours) {
  const sel = J("selectTournamentEntrantsNative", selPayload(t, regions));
  check(`${t.name} 참가 ${t.totalSlots}팀 선발`,
    sel.seededTeams.length === t.totalSlots,
    `got ${sel.seededTeams.length}`);
  check(`${t.name} 참가팀 중복 없음`,
    new Set(sel.seededTeams).size === sel.seededTeams.length);
  check(`${t.name} WC ${t.wildcardSlots}장`,
    sel.wildcards.length === t.wildcardSlots, `got ${sel.wildcards.length}`);

  const b = J("generateTournamentBracketNative", {
    tournamentId: t.id, leagueId: t.leagueId, seededTeams: sel.seededTeams,
    startWeek: t.startWeek, endWeek: t.endWeek,
    protagonistTeamId: HS_TEAMS[0], seasonYear: 2026,
  });
  brackets[t.id] = { def: t, bracket: b, sel };

  const e = EXPECT[t.id];
  check(`${t.name} 대진 ${e.size} · ${e.rounds}R · 부전승 ${e.byes} (기획서 §4-2)`,
    b.bracketSize === e.size && b.totalRounds === e.rounds && b.byeCount === e.byes,
    `got size=${b.bracketSize} rounds=${b.totalRounds} byes=${b.byeCount}`);

  // 부전승은 상위 시드가 받는다
  const byeWinners = b.matches.filter((m) => m.round === 1 && m.isBye).map((m) => m.winnerTeamId);
  const topSeeds = sel.seededTeams.slice(0, e.byes);
  check(`${t.name} 부전승은 상위 ${e.byes}시드`,
    byeWinners.length === e.byes && byeWinners.every((w) => topSeeds.includes(w)),
    `부전승 ${byeWinners.length}팀`);

  // 1시드와 2시드는 결승에서만 만난다
  if (e.size >= 4) {
    const r1 = b.matches.filter((m) => m.round === 1);
    const half = r1.length / 2;
    const sideOf = (team) => {
      const i = r1.findIndex((m) => m.homeTeamId === team || m.awayTeamId === team);
      return i < half ? "L" : "R";
    };
    check(`${t.name} 1·2시드가 반대편 대진`,
      sideOf(sel.seededTeams[0]) !== sideOf(sel.seededTeams[1]));
  }
}

// ── 3. 권역 배분이 비례하는가 ─────────────────────────────────
// 기획서는 12권역 기준 "권역당 상위 2"였다. v2는 8권역·크기 6~20이라
// 균등 배분하면 6팀 권역이 67% 진출하는 왜곡이 생긴다 → 비례 배분으로 바꿨다.
console.log("\n무궁화기(48팀) 권역 배분");
const mq = brackets.TOUR_HS_MUGUNGHWA.sel.regionQuota;
let quotaSum = 0;
for (const r of regions) {
  const q = mq[r.regionId] ?? 0;
  quotaSum += q;
  const pct = (q / r.rankedTeams.length * 100).toFixed(0);
  console.log(`    ${r.regionId.replace("STADIUM_", "").padEnd(14)} ${String(r.rankedTeams.length).padStart(2)}팀 → ${q}장 (${pct}%)`);
}
check("자동 시드 합 = 총참가 − WC", quotaSum === 48 - 12, `got ${quotaSum}`);
check("모든 권역에 최소 1장", regions.every((r) => (mq[r.regionId] ?? 0) >= 1));
check("권역 진출률 편차 ≤ 15%p", (() => {
  const rates = regions.map((r) => (mq[r.regionId] ?? 0) / r.rankedTeams.length);
  return Math.max(...rates) - Math.min(...rates) <= 0.15;
})(), (() => {
  const rates = regions.map((r) => (mq[r.regionId] ?? 0) / r.rankedTeams.length);
  return `${(Math.min(...rates) * 100).toFixed(0)}%~${(Math.max(...rates) * 100).toFixed(0)}%`;
})());
check("배분 수가 권역 팀 수를 넘지 않음",
  regions.every((r) => (mq[r.regionId] ?? 0) <= r.rankedTeams.length));

// 국화기는 전원 참가
check("국화기 = 고교 102팀 전원",
  brackets.TOUR_HS_GUKHWA.sel.seededTeams.length === 102 &&
  new Set(brackets.TOUR_HS_GUKHWA.sel.seededTeams).size === 102);

// ── 4. 브래킷을 끝까지 굴린다 ────────────────────────────────
// 승자는 "상위 시드가 이긴다"로 결정 — 결정적이고, 결승에 1시드가 와야 정상
console.log("\n국화기 128대진 전 라운드 진행");
{
  const { def, sel } = brackets.TOUR_HS_GUKHWA;
  const seedOf = new Map(sel.seededTeams.map((t, i) => [t, i]));
  let b = brackets.TOUR_HS_GUKHWA.bracket;

  for (let r = 1; r <= b.totalRounds; r++) {
    const sched = J("tournamentRoundScheduleNative", { bracket: b, round: r });
    const live = b.matches.filter((m) => m.round === r && !m.isBye && m.homeTeamId && m.awayTeamId);
    check(`  R${r} 치를 경기 ${live.length}건이 일정으로 나옴`,
      sched.length === live.length, `일정 ${sched.length} vs 대진 ${live.length}`);
    check(`  R${r} 일정 항목에 빈 팀 없음`,
      sched.every((s) => s.homeTeamId && s.awayTeamId));

    const results = live.map((m) => ({
      matchId: m.id,
      winnerTeamId: seedOf.get(m.homeTeamId) < seedOf.get(m.awayTeamId) ? m.homeTeamId : m.awayTeamId,
    }));
    b = J("advanceTournamentRoundNative", {
      bracket: b, round: r, results, protagonistTeamId: HS_TEAMS[0],
    });
  }

  const champ = JSON.parse(engine.tournamentChampionNative(JSON.stringify(b)));
  check("우승팀이 나옴", typeof champ === "string" && champ.length > 0, `got ${champ}`);
  check("상위 시드 승 규칙에서 1시드 우승", champ === sel.seededTeams[0],
    `champ=${champ} seed1=${sel.seededTeams[0]}`);
  const decided = b.matches.filter((m) => m.winnerTeamId).length;
  check("전 경기 승자 확정", decided === b.matches.length,
    `${decided}/${b.matches.length}`);
}

// ── 5. 잘못된 승자는 무시된다 ────────────────────────────────
{
  const { bracket } = brackets.TOUR_HS_GAENARI;
  const m = bracket.matches.find((x) => x.round === 1 && !x.isBye);
  const after = J("advanceTournamentRoundNative", {
    bracket, round: 1,
    results: [{ matchId: m.id, winnerTeamId: "TEAM_HS_존재하지않음" }],
    protagonistTeamId: HS_TEAMS[0],
  });
  const same = after.matches.find((x) => x.id === m.id);
  check("참가하지 않은 팀은 승자로 안 올라감", same.winnerTeamId == null,
    `got ${same.winnerTeamId}`);
}

// ── 6. 결정성 ────────────────────────────────────────────────
{
  const t = hsTours[0];
  const a = engine.selectTournamentEntrantsNative(JSON.stringify(selPayload(t, regions)));
  const bb = engine.selectTournamentEntrantsNative(JSON.stringify(selPayload(t, [...regions].reverse())));
  check("권역 입력 순서가 바뀌어도 같은 선발", a === bb);
}

// ── 7. 대회 날짜가 대회 기간 안에 ────────────────────────────
for (const { def, bracket } of Object.values(brackets)) {
  check(`${def.name} 전 라운드가 W${def.startWeek}~${def.endWeek} 안에`,
    bracket.matches.every((m) => m.week >= def.startWeek && m.week <= def.endWeek),
    `${Math.min(...bracket.matches.map((m) => m.week))}~${Math.max(...bracket.matches.map((m) => m.week))}`);
  const rounds = [...new Set(bracket.matches.map((m) => m.round))].sort((a, b) => a - b);
  const dates = rounds.map((r) => bracket.matches.find((m) => m.round === r).gameDate);
  check(`${def.name} 라운드 날짜가 순차 진행`,
    dates.every((d, i) => i === 0 || d > dates[i - 1]), dates.join(" "));
}

// ── 8. 대학 왕중왕전 (Phase 5-5c) ────────────────────────────
// 기획서 §4-1: 8팀 = 조 1위 자동 5 + 조 2위 중 승률 상위 3(WC).
// 시드는 조 1위 5팀이 상위(부전승 우선), WC 3팀이 하위.
// 고교의 "권역 크기 비례 배분"으로는 이 규칙을 표현할 수 없어 조당 고정 인원 모드를 넣었다.
console.log("\n대학 왕중왕전");
{
  const uMap = {};
  for (const t of refs.teams) {
    if (t.leagueId !== "LEAGUE_UNIVERSITY") continue;
    (uMap[t.stadium] ??= []).push(t.id);
  }
  const uWinPct = {};
  for (const t of Object.values(uMap).flat()) {
    let h = 0;
    for (let i = 0; i < t.length; i++) h = (h * 37 + t.charCodeAt(i)) >>> 0;
    uWinPct[t] = (h % 1000) / 1000;
  }
  const uRegions = Object.entries(uMap)
    .map(([regionId, teams]) => ({
      regionId,
      rankedTeams: [...teams].sort((a, b) => uWinPct[b] - uWinPct[a] || a.localeCompare(b)),
    }))
    .sort((a, b) => a.regionId.localeCompare(b.regionId));

  const wjw = univTours.find((t) => t.id === "TOUR_UNIV_WANGJUNGWANG");
  check("왕중왕전이 카탈로그에 있음", !!wjw);
  check("왕중왕전 조당 1팀 자동 · WC 조2위까지 · 자동시드 우선",
    wjw.perGroupSlots === 1 && wjw.wildcardMaxGroupRank === 2 && wjw.autoSeedsFirst === true,
    `perGroup=${wjw.perGroupSlots} wcMax=${wjw.wildcardMaxGroupRank} autoFirst=${wjw.autoSeedsFirst}`);

  const sel = J("selectTournamentEntrantsNative", {
    regions: uRegions, winPct: uWinPct,
    totalSlots: wjw.totalSlots, wildcardSlots: wjw.wildcardSlots,
    perGroupSlots: wjw.perGroupSlots, wildcardMaxGroupRank: wjw.wildcardMaxGroupRank,
    autoSeedsFirst: wjw.autoSeedsFirst,
  });

  check("참가 8팀", sel.seededTeams.length === 8, `got ${sel.seededTeams.length}`);
  check("WC 3장", sel.wildcards.length === 3, `got ${sel.wildcards.length}`);
  check("조당 자동 진출 정확히 1팀",
    uRegions.every((r) => sel.regionQuota[r.regionId] === 1),
    JSON.stringify(sel.regionQuota));

  const groupWinners = uRegions.map((r) => r.rankedTeams[0]);
  const groupSeconds = uRegions.map((r) => r.rankedTeams[1]);
  check("자동 진출 = 조 1위 5팀",
    groupWinners.every((t) => sel.seededTeams.includes(t)));
  check("WC는 전부 조 2위",
    sel.wildcards.every((t) => groupSeconds.includes(t)),
    sel.wildcards.join(" "));
  check("조 3위 이하는 WC로 안 뽑힘",
    sel.wildcards.every((t) => !uRegions.some((r) => r.rankedTeams.slice(2).includes(t))));

  // 시드 순서: 조 1위 5팀이 1~5번, WC 3팀이 6~8번
  check("시드 1~5 = 조 1위 (부전승 우선)",
    sel.seededTeams.slice(0, 5).every((t) => groupWinners.includes(t)),
    sel.seededTeams.slice(0, 5).join(" "));
  check("시드 6~8 = WC",
    sel.seededTeams.slice(5).every((t) => sel.wildcards.includes(t)));

  const b = J("generateTournamentBracketNative", {
    tournamentId: wjw.id, leagueId: wjw.leagueId, seededTeams: sel.seededTeams,
    startWeek: wjw.startWeek, endWeek: wjw.endWeek,
    protagonistTeamId: sel.seededTeams[0], seasonYear: 2026,
  });
  check("8대진 3R 부전승 0 (기획서 8강 단판 3R)",
    b.bracketSize === 8 && b.totalRounds === 3 && b.byeCount === 0,
    `size=${b.bracketSize} rounds=${b.totalRounds} byes=${b.byeCount}`);
  check("전 라운드가 W11~12 안에",
    b.matches.every((m) => m.week >= 11 && m.week <= 12));

  // 끝까지 굴려 우승팀 1팀
  const seedOf = new Map(sel.seededTeams.map((t, i) => [t, i]));
  let cur = b;
  for (let r = 1; r <= cur.totalRounds; r++) {
    const live = cur.matches.filter((m) => m.round === r && !m.isBye && m.homeTeamId && m.awayTeamId);
    cur = J("advanceTournamentRoundNative", {
      bracket: cur, round: r, protagonistTeamId: sel.seededTeams[0],
      results: live.map((m) => ({
        matchId: m.id,
        winnerTeamId: seedOf.get(m.homeTeamId) < seedOf.get(m.awayTeamId) ? m.homeTeamId : m.awayTeamId,
      })),
    });
  }
  const champ = JSON.parse(engine.tournamentChampionNative(JSON.stringify(cur)));
  check("우승팀 = 1시드 (상위시드 승 규칙)", champ === sel.seededTeams[0], `got ${champ}`);
  check("총 7경기", cur.matches.length === 7, `got ${cur.matches.length}`);

  // 고교와 겹치지 않는 규칙: 고교는 비례 배분 그대로여야 한다
  const hsSel = J("selectTournamentEntrantsNative", selPayload(hsTours[2], regions));
  check("고교 무궁화기는 여전히 비례 배분 (조당 고정 아님)",
    new Set(Object.values(hsSel.regionQuota)).size > 1,
    JSON.stringify(hsSel.regionQuota));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
