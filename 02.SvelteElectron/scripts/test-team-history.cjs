"use strict";
// 팀 상세 화면 데이터 검증
// 실행: npm run test:teamhistory
//
// Phase 5-1에서 refs를 시드 CSV로 다시 만들며 history 모양이 바뀌었는데 화면은
// v1 필드를 계속 읽었다. 팀 상세는 빈 값을 보여줬고, **새 게임 팀 선택은
// `recentRecords.length`가 undefined.length라 렌더가 터졌다.**
//
// 이 테스트는 refs 데이터가 화면이 기대하는 모양인지, 그리고 화면 소스에
// v1 필드가 남아 있지 않은지를 본다.

const path = require("node:path");
const fs = require("node:fs");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}

const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const DOMESTIC = ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL"];
const teams = refs.teams.filter((t) => DOMESTIC.includes(t.leagueId));

// ── 1. refs 데이터가 v2 모양인가 ──────────────────────────────
console.log("refs history 모양");
{
  const withHistory = teams.filter((t) => t.history);
  console.log(`    국내 ${teams.length}팀 · history 보유 ${withHistory.length}팀`);
  check("전 팀에 history가 있다", withHistory.length === teams.length,
    `${withHistory.length}/${teams.length}`);
  check("seasonRanks가 있다",
    teams.every((t) => Array.isArray(t.history.seasonRanks)),
    teams.filter((t) => !Array.isArray(t.history.seasonRanks)).length + "팀 없음");
  check("titles가 있다", teams.every((t) => Array.isArray(t.history.titles)));
  check("rivals가 있다", teams.every((t) => Array.isArray(t.history.rivals)));

  // v1 필드는 없어야 한다 — 있으면 화면이 또 그걸 읽을 유혹이 생긴다
  const V1 = ["founded", "nationalTitles", "proPlayers", "recentRecords", "titleYears", "peakEra", "summary", "rival"];
  const leaked = [];
  for (const t of teams) for (const k of V1) if (k in t.history) leaked.push(`${t.id}.${k}`);
  check("v1 필드가 남아 있지 않다", leaked.length === 0, leaked.slice(0, 5).join(", "));
}

// ── 2. 화면이 실제로 채울 값이 있는가 ─────────────────────────
console.log("\n화면에 뜰 값");
{
  const ranked = teams.filter((t) => (t.history.seasonRanks ?? []).length > 0);
  const titled = teams.filter((t) =>
    (t.history.titles ?? []).some((x) => x.result === "우승"));
  const rivaled = teams.filter((t) => (t.history.rivals ?? []).length > 0);
  const budgeted = teams.filter((t) => t.history.budget);
  console.log(`    과거순위 ${ranked.length}팀 · 우승기록 ${titled.length}팀 · 라이벌 ${rivaled.length}팀 · 예산 ${budgeted.length}팀`);

  check("과거 시즌 순위가 대부분 팀에 있다", ranked.length >= teams.length * 0.9,
    `${ranked.length}/${teams.length}`);
  check("우승 기록이 있는 팀이 존재한다", titled.length > 0);
  check("라이벌이 있는 팀이 존재한다", rivaled.length > 0);
  check("예산이 있는 팀이 존재한다", budgeted.length > 0);

  // 라이벌 참조가 실제 팀을 가리키는가 (화면이 이름을 찾는다)
  const allIds = new Set(refs.teams.map((t) => t.id));
  const brokenRivals = [];
  for (const t of teams) {
    for (const r of t.history.rivals ?? []) {
      if (!allIds.has(r.with)) brokenRivals.push(`${t.id} → ${r.with}`);
    }
  }
  check("라이벌 참조가 전부 실재 팀", brokenRivals.length === 0, brokenRivals.slice(0, 3).join(", "));

  // titles의 season이 seasonRanks의 season과 같은 체계인가
  // (화면이 시즌으로 조인해 "그 시즌 우승 대회"를 붙인다)
  let joinable = 0;
  for (const t of teams) {
    const seasons = new Set((t.history.seasonRanks ?? []).map((s) => s.season));
    if ((t.history.titles ?? []).some((x) => seasons.has(x.season))) joinable++;
  }
  console.log(`    시즌 키로 조인 가능한 팀: ${joinable}`);
  check("titles.season과 seasonRanks.season이 같은 체계", joinable > 0,
    "조인되는 팀이 없다 — 화면의 '그 시즌 우승 대회'가 항상 빈다");
}

// ── 3. 샘플 렌더 (사람이 눈으로 확인) ─────────────────────────
console.log("\n샘플 — 한성고");
{
  const t = teams.find((x) => x.id === "TEAM_HS_HANSEONG") ?? teams[0];
  const h = t.history;
  const wins = (h.titles ?? []).filter((x) => x.result === "우승");
  const byComp = {};
  for (const w of wins) byComp[w.competition] = (byComp[w.competition] ?? 0) + 1;
  console.log(`    ${t.name} (★${t.power})`);
  console.log(`      창단 ${h.foundedYear ?? "-"} · 대회 우승 ${wins.length}회 · 예산 ${h.budget ? Math.round(h.budget / 100000000) + "억" : "-"}`);
  console.log(`      우승: ${Object.entries(byComp).map(([c, n]) => `${c.replace(/^고교\s*/, "")} ${n}회`).join(" · ") || "없음"}`);
  const ranks = [...(h.seasonRanks ?? [])].sort((a, b) => b.season.localeCompare(a.season));
  for (const sr of ranks) {
    const won = (h.titles ?? []).filter((x) => x.season === sr.season && x.result === "우승")
      .map((x) => x.competition.replace(/^고교\s*/, ""));
    console.log(`      ${sr.season}  ${sr.rank}위  ${won.join(" · ")}`);
  }
  const rv = (h.rivals ?? []).map((r) => {
    const rt = refs.teams.find((x) => x.id === r.with);
    return `${rt?.name ?? r.with}${r.desc ? ` (${r.desc})` : ""}`;
  });
  console.log(`      라이벌: ${rv.join(" / ") || "없음"}`);

  check("샘플 팀에 표시할 값이 하나라도 있다",
    wins.length > 0 || ranks.length > 0 || rv.length > 0);
}

// ── 4. 화면 소스에 v1 필드가 없는가 ───────────────────────────
console.log("\n화면 소스");
{
  const screens = {
    "팀 상세 모달": "../apps/ui/src/features/team/ui/TeamDetailModal.svelte",
    "새 게임 팀 선택": "../apps/ui/src/pages/new-game/NewGamePage.svelte",
  };
  // history 컨텍스트에서만 의미가 있는 이름들
  const V1_PATTERNS = [
    [/\bh\.founded\b|history\.founded\b/, "history.founded"],
    [/nationalTitles/, "nationalTitles"],
    [/proPlayers/, "proPlayers"],
    [/recentRecords/, "recentRecords"],
    [/titleYears/, "titleYears"],
    [/peakEra/, "peakEra"],
    [/history\.summary/, "history.summary"],
    [/history\?\.rival\b|history\.rival\b/, "history.rival (단수)"],
  ];
  /**
   * 주석을 제거한 코드만 남긴다.
   *
   * 줄 앞머리로 거르면 여러 줄 주석의 **본문 줄**이 코드로 잡힌다 —
   * "왜 v1 필드를 버렸는지" 설명하느라 그 이름들이 주석에 등장하기 때문이다.
   * 블록 주석(`/* *\/`)·HTML 주석(`<!-- -->`)·줄 주석을 실제로 걷어낸다.
   */
  function stripComments(src) {
    return src
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  }

  for (const [label, rel] of Object.entries(screens)) {
    const code = stripComments(fs.readFileSync(path.join(__dirname, rel), "utf8"));
    for (const [re, name] of V1_PATTERNS) {
      check(`  ${label}: ${name} 안 씀`, !re.test(code));
    }
  }
  const master = stripComments(fs.readFileSync(
    path.join(__dirname, "../apps/ui/src/shared/stores/master.ts"), "utf8"));
  check("  TeamHistory 타입에 v1 필드 없음",
    !/recentRecords|nationalTitles|titleYears|peakEra/.test(master));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
