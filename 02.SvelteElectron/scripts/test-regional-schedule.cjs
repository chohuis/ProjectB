"use strict";
// Phase 5-3 권역 주말리그 스케줄러 검증
// 실행: npm run test:regional
//
// 핵심 불변식: **권역 크기가 6~20팀으로 갈려도 팀당 경기 수는 균등**해야 한다.
// v1은 리그 전체에 cycles를 줘서 팀당 경기가 권역 크기에 휘둘렸다(5~19경기).

const path = require("node:path");
const fs = require("node:fs");
const engine = require("../packages/engine-native");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));

// 권역 = 거점구장 공유 그룹 (leagueTeams.generated.ts의 HS_REGIONS와 같은 기준)
const regionsMap = {};
for (const t of refs.teams) {
  if (t.leagueId !== "LEAGUE_HIGHSCHOOL") continue;
  (regionsMap[t.stadium] ??= []).push(t.id);
}
const regions = Object.entries(regionsMap)
  .map(([regionId, teams]) => ({ regionId, teams: teams.sort() }))
  .sort((a, b) => a.regionId.localeCompare(b.regionId));

const TARGET = 20;
const PROTAG = regions[0].teams[0];

function gen(seasonYear = 2026) {
  const raw = engine.generateRegionalScheduleNative(JSON.stringify({
    leagueId: "LEAGUE_HIGHSCHOOL", regions, targetGames: TARGET,
    startWeek: 2, endWeek: 45, protagonistTeamId: PROTAG, seasonYear,
  }));
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`생성 실패: ${parsed.error}`);
  return parsed;
}

// ── 1. 권역 구성 ──────────────────────────────────────────────
console.log(`권역 ${regions.length}개 / 고교 ${regions.reduce((a, r) => a + r.teams.length, 0)}팀`);
for (const r of regions) console.log(`    ${r.regionId.replace("STADIUM_", "").padEnd(14)} ${String(r.teams.length).padStart(2)}팀`);
console.log("");
check("8권역", regions.length === 8, `got ${regions.length}`);
check("고교 102팀", regions.reduce((a, r) => a + r.teams.length, 0) === 102);
check("권역 크기 편차 존재 (6~20)",
  Math.min(...regions.map((r) => r.teams.length)) === 6 &&
  Math.max(...regions.map((r) => r.teams.length)) === 20);

// ── 2. 핵심: 팀당 경기 수 균등 ────────────────────────────────
const entries = gen();
const played = {};
for (const e of entries) {
  played[e.homeTeamId] = (played[e.homeTeamId] ?? 0) + 1;
  played[e.awayTeamId] = (played[e.awayTeamId] ?? 0) + 1;
}
const counts = Object.values(played);
check(`전 팀이 정확히 ${TARGET}경기`,
  counts.length === 102 && counts.every((c) => c === TARGET),
  `분포: ${JSON.stringify([...new Set(counts)].sort((a, b) => a - b))}, 팀수 ${counts.length}`);

// 권역별로도 균등한가 (작은 권역이 바퀴를 더 도는지)
for (const r of regions) {
  const c = r.teams.map((t) => played[t] ?? 0);
  check(`  · ${r.regionId.replace("STADIUM_", "")} (${r.teams.length}팀) 전원 ${TARGET}경기`,
    c.every((x) => x === TARGET), `got ${[...new Set(c)]}`);
}

// ── 3. 권역 간 대전이 없어야 한다 ─────────────────────────────
const regionOf = {};
for (const r of regions) for (const t of r.teams) regionOf[t] = r.regionId;
const crossRegion = entries.filter((e) => regionOf[e.homeTeamId] !== regionOf[e.awayTeamId]);
check("권역 간 대전 없음", crossRegion.length === 0,
  crossRegion.length ? `${crossRegion.length}건, 예: ${crossRegion[0].homeTeamId} vs ${crossRegion[0].awayTeamId}` : "");

// ── 4. 자기 자신과 대전 없음 ──────────────────────────────────
check("자기 대전 없음", entries.every((e) => e.homeTeamId !== e.awayTeamId));

// ── 5. 경기 ID 유일 ───────────────────────────────────────────
const ids = entries.map((e) => e.id);
check("경기 ID 유일", ids.length === new Set(ids).size,
  `${ids.length}건 중 고유 ${new Set(ids).size}`);

// ── 6. 주차 범위 ──────────────────────────────────────────────
check("주차가 2~45 안에", entries.every((e) => e.week >= 2 && e.week <= 45),
  `범위 ${Math.min(...entries.map((e) => e.week))}~${Math.max(...entries.map((e) => e.week))}`);

// ── 7. 주말 배치 (토·일) ──────────────────────────────────────
// to_game_date의 day_offset 6·7 = 시즌 시작(3/1) 기준 오프셋이라 실제 요일은
// 연도에 따라 달라진다. 여기서는 "두 종류의 날짜에만 배치된다"만 확인한다.
const daysPerWeek = {};
for (const e of entries) (daysPerWeek[e.week] ??= new Set()).add(e.gameDate);
const maxDays = Math.max(...Object.values(daysPerWeek).map((s) => s.size));
check("한 주에 최대 2일만 사용 (주말리그)", maxDays <= 2, `최대 ${maxDays}일`);

// ── 8. 결정성 ─────────────────────────────────────────────────
check("같은 입력 → 같은 출력", JSON.stringify(gen()) === JSON.stringify(entries));

// ── 9. 주인공 경기 표시 ───────────────────────────────────────
const protagGames = entries.filter((e) => e.isProtagonistGame);
check(`주인공 경기 ${TARGET}건 표시`, protagGames.length === TARGET, `got ${protagGames.length}`);

// ── 10. 총 경기 수 ────────────────────────────────────────────
// 팀당 20경기 × 102팀 ÷ 2 = 1,020경기 (DESIGN.md §2 계산의 근거)
check("총 1,020경기", entries.length === 1020, `got ${entries.length}`);

console.log(`\n총 ${entries.length}경기 / ${regions.length}권역`);

// ── 11. 대학 5조 정규리그 (Phase 5-5b) ───────────────────────
// 조당 10팀 단일 라운드로빈 = 9경기, 조 45경기 × 5조 = 225경기 (03_대학.md §4-1)
console.log("\n대학 5조 정규리그");
{
  const groupsMap = {};
  for (const t of refs.teams) {
    if (t.leagueId !== "LEAGUE_UNIVERSITY") continue;
    (groupsMap[t.stadium] ??= []).push(t.id);
  }
  // 조별 요일 — 정본 seeds/onepitch/league_groups.csv
  const meta = {};
  for (const line of fs.readFileSync(
    path.join(__dirname, "../resource/data/seeds/onepitch/league_groups.csv"), "utf8")
    .trim().split(/\r?\n/).slice(1)) {
    const [leagueId, stadiumId, label, days] = line.split(",");
    if (leagueId === "LEAGUE_UNIVERSITY") meta[stadiumId] = { label, days: days.split("|").map(Number) };
  }

  const univRegions = Object.entries(groupsMap)
    .map(([regionId, teams]) => ({
      regionId, teams: teams.sort(), dayOffsets: meta[regionId]?.days ?? [],
    }))
    .sort((a, b) => a.regionId.localeCompare(b.regionId));

  for (const r of univRegions) {
    console.log(`    ${meta[r.regionId]?.label ?? "?"}조 ${r.regionId.replace("STADIUM_", "").padEnd(16)} ${r.teams.length}팀  요일오프셋 [${r.dayOffsets}]`);
  }

  const UNIV_TARGET = 9;
  const univ = JSON.parse(engine.generateRegionalScheduleNative(JSON.stringify({
    leagueId: "LEAGUE_UNIVERSITY", regions: univRegions, targetGames: UNIV_TARGET,
    startWeek: 1, endWeek: 10, protagonistTeamId: univRegions[0].teams[0],
    seasonYear: 2026, idPrefix: "UNIVR", defaultDayOffsets: [],
  })));
  if (!Array.isArray(univ)) throw new Error(`대학 생성 실패: ${univ.error}`);

  check("대학 5조", univRegions.length === 5, `got ${univRegions.length}`);
  check("대학 50팀", univRegions.reduce((a, r) => a + r.teams.length, 0) === 50);
  check("전 조 10팀 균등", univRegions.every((r) => r.teams.length === 10));

  const uPlayed = {};
  for (const e of univ) {
    uPlayed[e.homeTeamId] = (uPlayed[e.homeTeamId] ?? 0) + 1;
    uPlayed[e.awayTeamId] = (uPlayed[e.awayTeamId] ?? 0) + 1;
  }
  check(`전 팀 ${UNIV_TARGET}경기 (단일 라운드로빈)`,
    Object.keys(uPlayed).length === 50 && Object.values(uPlayed).every((c) => c === UNIV_TARGET),
    `분포 ${[...new Set(Object.values(uPlayed))]}, 팀수 ${Object.keys(uPlayed).length}`);
  check("총 225경기", univ.length === 225, `got ${univ.length}`);

  // 단일 라운드로빈 = 같은 상대를 두 번 만나지 않는다
  const pairs = univ.map((e) => [e.homeTeamId, e.awayTeamId].sort().join("|"));
  check("같은 상대 재대결 없음", new Set(pairs).size === pairs.length,
    `${pairs.length}건 중 고유 ${new Set(pairs).size}`);

  const uGroupOf = {};
  for (const r of univRegions) for (const t of r.teams) uGroupOf[t] = r.regionId;
  check("조 간 대전 없음", univ.every((e) => uGroupOf[e.homeTeamId] === uGroupOf[e.awayTeamId]));
  check("경기 ID 유일", new Set(univ.map((e) => e.id)).size === univ.length);
  check("ID 접두사 UNIVR", univ.every((e) => e.id.startsWith("UNIVR_")));
  check("주차가 1~10 안에", univ.every((e) => e.week >= 1 && e.week <= 10),
    `${Math.min(...univ.map((e) => e.week))}~${Math.max(...univ.map((e) => e.week))}`);

  // 핵심: 조마다 요일이 실제로 다른가 (dayOffsets가 먹었는가)
  const weekdayKinds = (stadiumId) => {
    const teams = new Set(groupsMap[stadiumId]);
    const s = new Set();
    for (const e of univ) if (teams.has(e.homeTeamId)) s.add(new Date(e.gameDate).getUTCDay());
    return s.size;
  };
  for (const r of univRegions) {
    const want = new Set(r.dayOffsets).size;
    check(`  · ${meta[r.regionId]?.label}조 요일 ${want}종`,
      weekdayKinds(r.regionId) === want,
      `실제 ${weekdayKinds(r.regionId)}종`);
  }
  check("A조(4요일) > C조(2요일)",
    weekdayKinds("STADIUM_MIREU") > weekdayKinds("STADIUM_GEUMGANG_UNIV"),
    `A=${weekdayKinds("STADIUM_MIREU")} C=${weekdayKinds("STADIUM_GEUMGANG_UNIV")}`);

  // 대학은 평일, 고교는 주말 — 요일이 겹치면 안 된다
  const hsWeekdays = new Set(entries.map((e) => new Date(e.gameDate).getUTCDay()));
  const univWeekdays = new Set(univ.map((e) => new Date(e.gameDate).getUTCDay()));
  check("대학 평일 · 고교 주말 — 요일 안 겹침",
    [...univWeekdays].every((d) => !hsWeekdays.has(d)),
    `고교 [${[...hsWeekdays].sort()}] 대학 [${[...univWeekdays].sort()}]`);

  console.log(`\n대학 총 ${univ.length}경기 / ${univRegions.length}조`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
