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
console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
