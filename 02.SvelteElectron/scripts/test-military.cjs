"use strict";
// 병역 · 국가대표 회귀 검증 (Phase 7-3)
// 실행: npm run test:military
//
// 설계 정본은 `docs/design/military.md`, 수치는 `generation_rules.json`의
// `militaryRules` · `internationalRules`.
//
// **여기서 검사하는 건 전부 실제로 있었던 결함이다:**
//  1. 연간 입대 20명이 코드에 박혀 상무가 정원(26)의 1.5배로 유지됐다
//  2. 상무 후보 풀에 2군이 빠져 갓 지명된 신인은 후보조차 못 됐다
//  3. NpcCareerEventType union이 Rust가 쓰는 문자열을 몰라 경력 화면이
//     release·quit_baseball을 조용히 건너뛰었다

const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

let failed = 0;
const check = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/^\s*\*.*$/gm, "");
const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

const MIL = gr.militaryRules;
const INTL = gr.internationalRules;

// ── 1. 상무 규칙 정본 ─────────────────────────────────────────
console.log("상무 규칙");
{
  check("militaryRules가 있다", !!MIL);
  check("정원·복무기간·구단 상한이 규칙 파일에 있다",
    typeof MIL.rosterSize === "number" && typeof MIL.serviceMonths === "number"
    && typeof MIL.maxPerTeam === "number");

  const serviceYears = Math.max(1, Math.round(MIL.serviceMonths / 12));
  const intake = Math.max(1, Math.round(MIL.rosterSize / serviceYears));
  const steady = intake * serviceYears;
  console.log(`    정원 ${MIL.rosterSize} · 복무 ${serviceYears}년 · 연 ${intake}명 → 정상상태 ${steady}명`);
  check("연간 입대가 정원을 유지한다 (±10%)",
    Math.abs(steady - MIL.rosterSize) <= MIL.rosterSize * 0.1,
    `정상상태 ${steady} vs 정원 ${MIL.rosterSize}`);

  // 상무는 career_status가 "military"라 로스터 캡(active만 센다)이 안 걸린다.
  // 연간 입대 인원이 유일한 제어라 코드에 박혀 있으면 안 된다
  const game = stripComments(read("apps/ui/src/shared/stores/game.ts"));
  check("연간 입대 인원을 코드에 박지 않는다",
    !/maxTotal:\s*Math\.min\(\s*\d+/.test(game),
    (game.match(/maxTotal:\s*Math\.min\(\s*\d+/) ?? [""])[0]);
  check("구단 상한도 코드에 박지 않는다",
    !/maxPerTeam:\s*\d+/.test(game),
    (game.match(/maxPerTeam:\s*\d+/) ?? [""])[0]);

  // 2군 유망주가 상무의 주 공급원이다. Phase 7-1 이후 신인 대부분이 2군에서
  // 시작하므로 FARM이 빠지면 갓 지명된 선수는 후보조차 못 된다
  // game.ts에 `proLeagues`가 여럿이다 (FA 추적용도 있다) — **상무 후보를 만드는
  // 그 Set**만 봐야 한다. `milCandidates` 바로 앞의 것을 고른다
  const block = game.match(
    /const proLeagues = new Set\(\[([\s\S]*?)\]\);[\s\S]{0,600}?milCandidates/);
  const leagues = [...(block?.[1] ?? "").matchAll(/"(LEAGUE_[A-Z_]+)"/g)].map((m) => m[1]);
  check("상무 후보 풀에 2군이 들어 있다", leagues.includes("LEAGUE_KBL_FARM"),
    leagues.length ? leagues.join(",") : "상무 후보 Set을 못 찾음");
}

// ── 2. 대회 일정 ──────────────────────────────────────────────
console.log("\n국제대회 일정");
{
  check("internationalRules가 있다", !!INTL);
  check("대회가 정의돼 있다", Array.isArray(INTL.tournaments) && INTL.tournaments.length > 0);

  // 사용자 확정: 한 해에 두 대회가 열리지 않는다
  const collisions = [];
  for (let y = 2026; y < 2066; y++) {
    const hit = INTL.tournaments.filter((t) => t.cycleYears > 0 && y % t.cycleYears === t.yearMod);
    if (hit.length > 1) collisions.push(`${y}:${hit.map((t) => t.id).join("+")}`);
  }
  check("한 해에 두 대회가 안 열린다 (40년 스캔)", collisions.length === 0,
    collisions.slice(0, 3).join(" "));

  const held = [];
  for (let y = 2026; y < 2030; y++) {
    const t = INTL.tournaments.find((t) => t.cycleYears > 0 && y % t.cycleYears === t.yearMod);
    held.push(`${y}:${t?.name ?? "-"}`);
  }
  console.log(`    ${held.join(" · ")}`);
  check("주기가 돌면 대회가 여러 번 열린다",
    held.filter((h) => !h.endsWith("-")).length >= 2);

  for (const t of INTL.tournaments) {
    check(`${t.name}: 면제 기준이 참가국 수 안이다`,
      t.exemptionRank < t.fieldSize, `${t.exemptionRank}위 / ${t.fieldSize}개국`);
    check(`${t.name}: 대회가 시즌 안에서 끝난다`,
      t.week + t.durationWeeks <= 52, `W${t.week}+${t.durationWeeks}`);
  }
}

// ── 3. 발탁 ───────────────────────────────────────────────────
console.log("\n발탁");
const yearWith = (() => {
  for (let y = 2026; y < 2040; y++) {
    if (INTL.tournaments.some((t) => y % t.cycleYears === t.yearMod)) return y;
  }
  throw new Error("대회가 열리는 해가 없다");
})();
const defOf = (y) => INTL.tournaments.find((t) => y % t.cycleYears === t.yearMod);
{
  const t = defOf(yearWith);
  const cand = (i, ovr, pitcher, team, age = 25) => ({
    npcId: `P${i}`, name: `선수${i}`, teamId: team,
    position: pitcher ? "SP" : "1B", ovr, age, form: 0, isProtagonist: false,
  });
  // 한 팀에 몰아넣어 구단 상한이 걸리는지 본다
  const pool = [
    ...Array.from({ length: 40 }, (_, i) => cand(i, 92 - i * 0.1, i % 2 === 0, "TEAM_A")),
    ...Array.from({ length: 80 }, (_, i) => cand(100 + i, 78, i % 2 === 0, `TEAM_${i % 12}`)),
  ];
  const res = call("selectNationalSquadNative", {
    candidates: pool, rules: INTL, year: yearWith, worldSeed: 42,
  });
  check(`${t.name} 정원 ${t.rosterSize}명을 채운다`, res.squad.length === t.rosterSize,
    String(res.squad.length));
  check("같은 선수가 두 번 뽑히지 않는다",
    new Set(res.squad).size === res.squad.length);

  const teamOf = new Map(pool.map((c) => [c.npcId, c.teamId]));
  const per = new Map();
  for (const id of res.squad) per.set(teamOf.get(id), (per.get(teamOf.get(id)) ?? 0) + 1);
  const over = [...per.entries()].filter(([, n]) => n > INTL.maxPerTeam);
  check(`한 구단에서 ${INTL.maxPerTeam}명을 넘지 않는다`, over.length === 0,
    over.map(([t, n]) => `${t}:${n}`).join(","));

  const old = call("selectNationalSquadNative", {
    candidates: [cand(1, 99, true, "TEAM_A", INTL.ageMax + 1)],
    rules: INTL, year: yearWith, worldSeed: 42,
  });
  check("나이 상한을 넘으면 발탁되지 않는다", old.squad.length === 0);

  const noYear = (() => {
    for (let y = 2026; y < 2040; y++) if (!defOf(y)) return y;
    return null;
  })();
  check("대회가 없는 해가 있다 (매년 열리면 병역이 무의미해진다)", noYear !== null);
  if (noYear) {
    const none = call("selectNationalSquadNative", {
      candidates: pool, rules: INTL, year: noYear, worldSeed: 42,
    });
    check("대회 없는 해엔 발탁도 없다", none.squad.length === 0 && !none.tournament);
  }
}

// ── 4. 대회 결과 ──────────────────────────────────────────────
console.log("\n대회 결과");
{
  for (const t of INTL.tournaments) {
    let outOfRange = 0, wrongExempt = 0;
    for (let seed = 0; seed < 300; seed++) {
      const r = call("simulateTournamentNative", {
        tournament: t, squadStrength: 50 + (seed % 50), year: 2030, worldSeed: seed,
      });
      if (r.rank < 1 || r.rank > t.fieldSize) outOfRange++;
      if (r.exemption && (t.exemptionRank === 0 || r.rank > t.exemptionRank)) wrongExempt++;
    }
    check(`${t.name}: 순위가 참가국 수 안이다`, outOfRange === 0, `${outOfRange}건`);
    check(`${t.name}: 면제가 규칙대로만 나온다`, wrongExempt === 0, `${wrongExempt}건`);
  }

  const t = INTL.tournaments.reduce((a, b) => (a.fieldSize >= b.fieldSize ? a : b));
  const avg = (strength) => {
    let sum = 0;
    for (let seed = 0; seed < 300; seed++) {
      sum += call("simulateTournamentNative", {
        tournament: t, squadStrength: strength, year: 2030, worldSeed: seed,
      }).rank;
    }
    return sum / 300;
  };
  const strong = avg(90), weak = avg(60);
  console.log(`    ${t.name}: 강팀 평균 ${strong.toFixed(1)}위 · 약팀 평균 ${weak.toFixed(1)}위`);
  check("강한 대표팀이 평균적으로 더 높은 순위를 낸다", strong < weak);
}

// ── 5. 배선 ───────────────────────────────────────────────────
console.log("\n배선");
{
  const market = stripComments(read("apps/ui/src/shared/usecases/weekPhases/market.ts"));
  // 차출자를 부상자와 같이 넘겨야 대회 기간에 1군이 안 빈다
  check("대표 차출자가 승강의 결원 목록에 합쳐진다",
    /nationalDuty/.test(market), "market.ts에 nationalDuty 없음");

  const advance = stripComments(read("apps/ui/src/shared/usecases/advanceWeek.ts"));
  check("주간 진행이 국가대표 훅을 부른다", /runNationalTeamWeek/.test(advance));

  // Rust가 쓰는 이벤트 문자열을 TS union이 알아야 경력 화면이 안 건너뛴다
  const save = read("apps/ui/src/shared/types/save.ts");
  const union = save.match(/export type NpcCareerEventType =([\s\S]*?);/)?.[1] ?? "";
  const rustEvents = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, "packages/engine-native/src"))) {
    if (!f.endsWith(".rs")) continue;
    const src = read(`packages/engine-native/src/${f}`);
    for (const m of src.matchAll(/"(draft_picked|draft_undrafted|release|quit_baseball|retirement|military_enlist|military_discharge|military_exempt)"/g)) {
      rustEvents.add(m[1]);
    }
  }
  const missing = [...rustEvents].filter((e) => !union.includes(`"${e}"`));
  check("Rust가 쓰는 경력 이벤트를 TS union이 전부 안다", missing.length === 0,
    missing.join(","));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
