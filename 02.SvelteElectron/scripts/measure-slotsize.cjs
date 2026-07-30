// D-4b 선행 실측: npc 한 행이 실제로 몇 바이트고 어느 컬럼이 차지하는가.
//
// 예측하지 않는다 — "은퇴자를 슬림 보존한다"는 결정은 무엇을 자를지 정해야
// 의미가 있고, 그건 컬럼별 실측 없이는 고를 수 없다.
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/measure-slotsize.cjs

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const ROOT = path.resolve(__dirname, "..");
const slotdb = require(path.join(ROOT, "apps/desktop/ipc/slotdb.cjs"));
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

// ── 실제 로스터를 만든다 (국내 전 리그) ────────────────────────
const SANGMU = "TEAM_IND_SANGMU_PHOENIX";
const teamsOf = (lid, farm = false) =>
  refs.teams
    .filter((t) => t.leagueId === lid && t.id !== SANGMU
      && (lid !== "LEAGUE_KBL" || t.id.endsWith(farm ? "_2" : "_1")))
    .map((t) => ({ teamId: t.id, schoolId: t.schoolId ?? "", power: t.power }));

const npcs = [];
for (const [lid, teams] of [
  ["LEAGUE_HIGHSCHOOL", teamsOf("LEAGUE_HIGHSCHOOL")],
  ["LEAGUE_UNIVERSITY", teamsOf("LEAGUE_UNIVERSITY")],
  ["LEAGUE_INDEPENDENT", teamsOf("LEAGUE_INDEPENDENT")],
  ["LEAGUE_KBL", teamsOf("LEAGUE_KBL")],
  ["LEAGUE_KBL_FARM", teamsOf("LEAGUE_KBL", true)],
]) {
  const gen = call("generateLeagueRosterNative", {
    leagueId: lid, seasonYear: 2026, worldSeed: 4242, teams, rules: gr.rosterRules[lid],
    salaryRules: gr.salaryRules, powerRules: gr.powerRules,
    entryRules: gr.careerHistoryRules.entry,
  });
  npcs.push(...gen.npcs);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "slotsize-"));
const mgr = slotdb.createManager(tmp);
slotdb.dispatch(mgr, "createSlot", {
  slotId: "S1", worldSeed: 4242, protagonist: {}, season: {}, npcs,
});

const file = fs.readdirSync(tmp).find((f) => f.endsWith(".db"));
const bytes = fs.statSync(path.join(tmp, file)).size;
console.log(`npc ${npcs.length}명 · slot.db ${(bytes / 1024 / 1024).toFixed(2)} MB`);
console.log(`행당 평균 ${Math.round(bytes / npcs.length)} B\n`);

// ── 컬럼별 크기 ────────────────────────────────────────────────
const rows = slotdb.dispatch(mgr, "getAllNpcs", { slotId: "S1" });
const sizeOf = (v) => (v === undefined || v === null ? 0 : JSON.stringify(v).length);

const parts = {
  abilities: 0, "  └ pitching/batting": 0, "  └ positionRatings": 0, "  └ pitches": 0,
  xp: 0, form: 0, personality: 0, extra: 0, "그 외 스칼라": 0,
};
for (const r of rows) {
  parts.abilities += sizeOf(r.abilities);
  parts["  └ pitching/batting"] += sizeOf(r.abilities?.pitching) + sizeOf(r.abilities?.batting);
  parts["  └ positionRatings"] += sizeOf(r.abilities?.positionRatings);
  parts["  └ pitches"] += sizeOf(r.abilities?.pitches);
  parts.xp += sizeOf(r.xp);
  parts.form += sizeOf(r.form);
  parts.personality += sizeOf(r.personality);
  parts.extra += sizeOf(r.extra);
  const whole = sizeOf(r);
  parts["그 외 스칼라"] += whole - sizeOf(r.abilities) - sizeOf(r.xp)
    - sizeOf(r.form) - sizeOf(r.personality) - sizeOf(r.extra);
}

const total = Object.entries(parts)
  .filter(([k]) => !k.startsWith("  "))
  .reduce((a, [, v]) => a + v, 0);
console.log("컬럼별 (JSON 문자열 기준)");
for (const [k, v] of Object.entries(parts)) {
  const pct = k.startsWith("  ") ? "" : ` (${((v / total) * 100).toFixed(1)}%)`;
  console.log(`  ${k.padEnd(22)} ${String(Math.round(v / rows.length)).padStart(5)} B/행${pct}`);
}
console.log(`  ${"합계".padEnd(22)} ${String(Math.round(total / rows.length)).padStart(5)} B/행`);

// ── 슬림화하면 얼마나 줄까 ─────────────────────────────────────
// 후보: 성장에만 쓰는 것(xp·form·pitches)을 비운다. 화면이 보여주는
// 능력치·성격은 남긴다 — 지우면 은퇴 선수 상세가 빈 껍데기가 된다
const cut = rows.reduce((a, r) =>
  a + sizeOf(r.xp) + sizeOf(r.form) + sizeOf(r.abilities?.pitches), 0);
console.log(`\n슬림 대상(xp + form + pitches): ${Math.round(cut / rows.length)} B/행 = 전체의 ${((cut / total) * 100).toFixed(1)}%`);
console.log(`은퇴자 1만 명이면 약 ${(cut / rows.length * 10000 / 1024 / 1024).toFixed(1)} MB 절약`);

mgr.closeAll();
fs.rmSync(tmp, { recursive: true, force: true });
