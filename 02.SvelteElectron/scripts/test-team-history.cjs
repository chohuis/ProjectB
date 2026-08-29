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

// ── 연표 SQL — `season:getTeamHistory` 가 쓰는 그 문장 ──────────────
//
// 🔴 **순위는 저장돼 있지 않다.** `history_standings` 에 승·패·승률만 있어서
//   같은 해 같은 리그 안에서 세야 한다. 그때 **2군을 빼야** 한다 —
//   `refs` 가 1군·팜을 **같은 `leagueId`** 로 담고 `_1`/`_2` 로만 갈리기
//   때문이다. 안 거르면 ABL 순위가 16팀이 아니라 32팀 중에서 매겨진다.
//   ⚠ KBL 은 `LEAGUE_KBL`/`LEAGUE_KBL_FARM` 으로 갈려 있어 **안 걸린다** —
//     해외만 같은 id 를 쓴다. 그래서 이 함정은 늦게 드러난다.
//
// ⚠ `better-sqlite3` 는 Electron 용으로 빌드돼 있어 **node 로는 안 돈다.**
//   이 검사는 `ELECTRON_RUN_AS_NODE=1 electron` 으로 실행된다.
{
  const Database = require(path.join(__dirname, "../node_modules/better-sqlite3"));
  const db = new Database(":memory:");
  db.exec(`CREATE TABLE history_standings (
    slot_id TEXT NOT NULL, season_year INTEGER NOT NULL,
    league_id TEXT NOT NULL, team_id TEXT NOT NULL,
    wins INTEGER NOT NULL DEFAULT 0, losses INTEGER NOT NULL DEFAULT 0,
    draws INTEGER NOT NULL DEFAULT 0, win_pct REAL NOT NULL DEFAULT 0,
    runs_for INTEGER NOT NULL DEFAULT 0, runs_against INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (slot_id, season_year, league_id, team_id))`);

  const ins = db.prepare(`INSERT INTO history_standings
    (slot_id, season_year, league_id, team_id, wins, losses, draws, win_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  // ABL 처럼 1군·2군이 **같은 leagueId** 인 경우를 만든다 — 이게 함정이다
  for (const r of [
    [2027, "LEAGUE_ABL", "TEAM_A_1", 90, 60, 0, 0.600],
    [2027, "LEAGUE_ABL", "TEAM_B_1", 95, 55, 0, 0.633],
    [2027, "LEAGUE_ABL", "TEAM_C_1", 70, 80, 0, 0.467],
    [2027, "LEAGUE_ABL", "TEAM_A_2", 99, 51, 0, 0.660],   // 2군 — 제외돼야
    [2027, "LEAGUE_ABL", "TEAM_B_2", 98, 52, 0, 0.653],   // 2군 — 제외돼야
    [2028, "LEAGUE_ABL", "TEAM_A_1", 99, 51, 0, 0.660],
    [2028, "LEAGUE_ABL", "TEAM_B_1", 80, 70, 0, 0.533],
    [2028, "LEAGUE_ABL", "TEAM_C_1", 75, 75, 0, 0.500],
  ]) ins.run("S1", ...r);

  // ⚠ **`main.cjs` 의 문장과 같아야 한다.** 아래 검사가 그것도 본다.
  const SQL = `SELECT h1.season_year, h1.league_id, h1.wins, h1.losses, h1.draws,
          h1.win_pct, h1.runs_for, h1.runs_against,
          (SELECT COUNT(*) + 1 FROM history_standings h2
            WHERE h2.slot_id = h1.slot_id
              AND h2.season_year = h1.season_year
              AND h2.league_id = h1.league_id
              AND substr(h2.team_id, -2) = substr(h1.team_id, -2)
              AND (h2.win_pct > h1.win_pct
                   OR (h2.win_pct = h1.win_pct AND h2.wins > h1.wins))
          ) AS rank,
          (SELECT COUNT(*) FROM history_standings h3
            WHERE h3.slot_id = h1.slot_id
              AND h3.season_year = h1.season_year
              AND h3.league_id = h1.league_id
              AND substr(h3.team_id, -2) = substr(h1.team_id, -2)
          ) AS teams
     FROM history_standings h1
    WHERE h1.slot_id = ? AND h1.team_id = ?
    ORDER BY h1.season_year`;

  const out = db.prepare(SQL).all("S1", "TEAM_A_1");
  check("연표: 두 시즌이 나온다", out.length === 2, `${out.length}행`);
  check("연표: 2군을 빼고 순위를 센다 (2위)", out[0] && out[0].rank === 2,
    out[0] ? `${out[0].rank}위` : "행 없음");
  check("연표: 팀 수도 2군을 뺀다 (3팀)", out[0] && out[0].teams === 3,
    out[0] ? `${out[0].teams}팀` : "행 없음");
  check("연표: 이듬해 1위", out[1] && out[1].rank === 1,
    out[1] ? `${out[1].rank}위` : "행 없음");
  check("연표: 연도 오름차순", out.length === 2 && out[0].season_year < out[1].season_year);

  // 🔴 **2군도 제 순위가 나와야 한다.** 2군을 통째로 빼던 시절엔
  //   2군 자신도 빠져 `1위 / 0팀` 이 나왔다(실측).
  const farm = db.prepare(SQL).all("S1", "TEAM_A_2");
  check("연표: 2군도 제 순위가 있다 (1위/2팀)",
    farm[0] && farm[0].rank === 1 && farm[0].teams === 2,
    farm[0] ? `${farm[0].rank}위/${farm[0].teams}팀` : "행 없음");

  // 🔴 **화면이 쓰는 문장과 같은지 본다.** 여기만 고치고 `main.cjs` 를 안
  //   고치면 검사는 통과하는데 게임은 틀린 순위를 보여준다.
  const mainSrc = fs.readFileSync(path.join(__dirname, "../apps/desktop/main.cjs"), "utf8");
  check("연표: main.cjs 가 2군을 거른다",
    mainSrc.includes("season:getTeamHistory")
    && mainSrc.includes("substr(h2.team_id, -2) = substr(h1.team_id, -2)")
    && mainSrc.includes("substr(h3.team_id, -2) = substr(h1.team_id, -2)"));
  // 🔴 **문자열만 보면 안 된다.** `LIKE ... ESCAPE '\\'` 를 쓰던 시절,
  //   이 검사는 통과했는데 **실제 SQL 은 못 돌았다** — 백틱 템플릿 안에서
  //   백슬래시가 JS 에 먹혀 `ESCAPE ''` 가 됐다.
  //   실행까지 보는 건 `scripts/probe-timeline.cjs` 다.
  check("연표: main.cjs 가 LIKE ESCAPE 를 안 쓴다",
    !mainSrc.includes("NOT LIKE '%\\_2'"));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
