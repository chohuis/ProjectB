"use strict";
// 1군 ↔ 2군 승강 회귀 검증 (Phase 7-2)
// 실행: npm run test:promotion
//
// 설계 정본은 `docs/design/promotion.md`, 수치는 `generation_rules.json`의
// `promotionRules`.
//
// **여기서 검사하는 건 전부 실제로 있었던 결함이다:**
//  1. 강등이 팀만 바꾸고 리그를 안 바꿔 2군 선수가 1군으로 집계됐다
//  2. 주인공이 프로가 아니면 프로 세계의 승강이 통째로 멈췄다
//  3. 로스터 상한 35가 코드에 박혀 규칙 파일(34)과 달랐다
//  4. 판정이 성적을 아예 안 봐서 부진한 베테랑이 자리를 지켰다

const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
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

const MARKET = "apps/ui/src/shared/usecases/weekPhases/market.ts";
const ADVANCE = "apps/ui/src/shared/usecases/advanceWeek.ts";
const PROMO = gr.promotionRules;

// ── 1. 규칙 정본 ──────────────────────────────────────────────
console.log("규칙 정본");
{
  check("promotionRules가 있다", !!PROMO);
  check("성적을 본다 (formWeight > 0)", PROMO.formWeight > 0, String(PROMO.formWeight));
  check("성적이 능력치를 지우지 않는다 (formWeight × formSpan < 15)",
    PROMO.formWeight * PROMO.formSpan < 15,
    `${PROMO.formWeight} × ${PROMO.formSpan}`);
  check("부진 기준이 성적 폭 안에 있다",
    PROMO.slumpScore < 0 && PROMO.slumpScore > -PROMO.formSpan, String(PROMO.slumpScore));
  check("표본 하한이 있다 (요행 승격 방지)",
    PROMO.pitcherFullInnings > 0 && PROMO.batterFullPa > 0);
}

// ── 2. 소스 가드 ──────────────────────────────────────────────
console.log("\n소스 가드");
{
  const market = stripComments(read(MARKET));

  // 로스터 상한을 코드에 박으면 규칙 파일과 어긋난다 (실제로 35 vs 34였다)
  check("maxRosterSize를 코드에 박지 않는다",
    !/maxRosterSize:\s*\d+/.test(market),
    (market.match(/maxRosterSize:\s*\d+/) ?? [""])[0]);

  // 강등은 팀과 리그를 같이 바꿔야 한다.
  //
  // ⚠ 예전엔 `currentLeague: toTeam.endsWith("_2") ? ...` **구현 방식을**
  // 정규식으로 고정했다. 그래서 파생을 `ids.leagueOfTeam`으로 옮기자
  // **동작은 그대로인데 검사가 깨졌다.** 검사는 "무엇을 하는가"를 봐야지
  // "어떻게 적는가"를 보면 안 된다 — 리팩터링을 막고, 통과해도 의미가 없다.
  check("승강이 currentLeague도 바꾼다",
    /currentLeague:\s*leagueOfTeam\(/.test(market)
    || /currentLeague:\s*to[A-Za-z]*\.endsWith/.test(market)
    || /currentLeague:\s*.*LEAGUE_KBL_FARM/.test(market));

  // 팀→리그 파생은 `ids.ts`가 정본이다 (CLAUDE.md: ID 파생 규칙은 거기 하나)
  // ⚠ `LEAGUE_FREE_AGENT`·`LEAGUE_RETIRED`는 **팀이 없는 상태**라 파생 대상이
  // 아니다 — 예외로 둔다. 그 외 리그 문자열이 대입되면 팀과 어긋날 수 있다.
  const hardcoded = market.match(/currentLeague:\s*"LEAGUE_[A-Z_]+"/g) ?? [];
  const bad = hardcoded.filter((h) => !/FREE_AGENT|RETIRED/.test(h));
  check("리그를 팀 ID에서 파생한다 (소속 리그 하드코딩 금지)",
    bad.length === 0, bad.join(" · "));

  // 주인공이 프로가 아니어도 돌아야 한다
  check("careerStage로 승강을 막지 않는다",
    !/isProStage[\s\S]{0,80}return logs/.test(market));

  // 주인공을 강등 대상에서 빼면 성적과 무관하게 1군에 남는다
  check("주인공을 콜다운에서 제외하지 않는다",
    !/playerId === g\.protagonist\.id\)\s*continue/.test(market));

  const advance = stripComments(read(ADVANCE));
  check("연 2회 고정 트리거가 사라졌다",
    !/weekInYear === 20 \|\| weekInYear === 43/.test(advance));
  check("월간 정기 + 상시 두 경로를 부른다",
    /processProTeamCallupCalldown\([\s\S]{0,120}urgentOnly/.test(advance));
}

// ── 3. 성적 판정 ──────────────────────────────────────────────
console.log("\n성적 판정");
const PROFILE = {
  ownerSpendingWillingness: 50, stability: 50, developmentFocus: 50,
  discipline: 50, ownerPatience: 50, winNowPressure: 50, scoutingQuality: 50,
  prestige: 50, marketAppeal: 50, clubhouseCulture: 50, medicalQuality: 50, farmInvestment: 50,
};
const ref = (id, ovr, perf) => ({
  id, position: "SP", age: 26, ovr, salary: 5000, remainingYears: 2,
  proServiceYears: 4, isProspect: false, personality: null, fame: 0,
  ...(perf ? { perf } : {}),
});
const pitcherPerf = (innings, era) => ({ games: 20, innings, era, whip: 1.3 });
{
  const full = PROMO.pitcherFullInnings;

  // 능력치가 같으면 성적이 나쁜 쪽이 밀려난다
  const res = call("evalCallupCandidatesNative", {
    teamProfile: PROFILE,
    farmPlayers: [ref("FARM", 68, pitcherPerf(full, PROMO.pitcherEraBaseline / 2))],
    activePlayers: [
      ref("GOOD", 70, pitcherPerf(full, PROMO.pitcherEraBaseline / 2)),
      ref("BAD", 70, pitcherPerf(full, PROMO.pitcherEraBaseline * 2.5)),
    ],
    injuredPlayerIds: [], currentMonth: 5, promotionRules: PROMO,
  });
  const c = res.candidates[0];
  check("부진한 선수가 교체 대상으로 뽑힌다", c?.replacesPlayerId === "BAD",
    c?.replacesPlayerId ?? "후보 없음");
  check("사유가 부진으로 남는다", c?.reason === "slump_replacement", c?.reason ?? "-");

  // 표본이 적으면 성적이 덜 반영된다 — 몇 이닝 던지고 0점대인 선수가
  // 시즌 내내 던진 에이스를 밀어내면 안 된다
  const small = call("evalCallupCandidatesNative", {
    teamProfile: PROFILE,
    farmPlayers: [ref("FLUKE", 60, pitcherPerf(full / 20, 0.5))],
    activePlayers: [ref("ACE", 78, pitcherPerf(full, PROMO.pitcherEraBaseline * 0.6))],
    injuredPlayerIds: [], currentMonth: 5, promotionRules: PROMO,
  });
  check("표본 적은 호투가 에이스를 밀어내지 않는다", small.candidates.length === 0,
    `${small.candidates.length}건`);

  // 기록이 없으면 능력치만 본다
  const noStats = call("evalCallupCandidatesNative", {
    teamProfile: PROFILE,
    farmPlayers: [ref("HIGH", 80)],
    activePlayers: [ref("LOW", 55)],
    injuredPlayerIds: [], currentMonth: 5, promotionRules: PROMO,
  });
  check("기록이 없으면 능력치로 판정한다", noStats.candidates.length === 1,
    `${noStats.candidates.length}건`);

  // 부상이면 사유가 부상 대체다 — 상시 콜업이 이걸로 걸러낸다
  const inj = call("evalCallupCandidatesNative", {
    teamProfile: PROFILE,
    farmPlayers: [ref("SUB", 65)],
    activePlayers: [ref("HURT", 70)],
    injuredPlayerIds: ["HURT"], currentMonth: 5, promotionRules: PROMO,
  });
  check("부상이면 사유가 injury_replacement다",
    inj.candidates[0]?.reason === "injury_replacement", inj.candidates[0]?.reason ?? "-");
}

// ── 4. 콜다운도 성적을 본다 ───────────────────────────────────
console.log("\n콜다운");
{
  const full = PROMO.pitcherFullInnings;
  // ⚠ **실제 로스터 크기로 부른다.** 예전엔 선수 둘만 넘겼는데, 콜다운이
  // 보직 하한(`tuning.rs` FIRST_TEAM_MIN_BATTERS 14 / _PITCHERS 12)을 보게 된
  // 뒤로는 둘뿐인 로스터가 "양쪽 다 하한 이하"라 강등이 아예 안 나온다.
  // 판정 자체는 멀쩡한데 **테스트 전제가 현실에 없는 로스터**였던 것이다.
  //
  // 채우는 선수는 능력치를 높게 준다 — 강등 점수가 낮아 후보를 안 뺏는다.
  //
  // ⚠ 투수 채움을 RP로만 두면 안 된다. 선발 하한(FIRST_TEAM_MIN_STARTERS 6)이
  // 생긴 뒤로는 SLUMP·HOT 둘뿐인 선발진이 하한 이하라 **둘 다 후보에서 빠지고**
  // 판정 대상이 야수(BAT0)로 넘어간다. 실제 1군은 선발을 10명 안팎 들고 있다.
  const filler = (id, pos) => ({ ...ref(id, 82), position: pos });
  const bench = [
    ...Array.from({ length: 16 }, (_, i) => filler(`BAT${i}`, "1B")),
    ...Array.from({ length: 7 }, (_, i) => filler(`SP${i}`, "SP")),
    ...Array.from({ length: 6 }, (_, i) => filler(`PIT${i}`, "RP")),
  ];
  const active = [
    ref("SLUMP", 66, pitcherPerf(full, PROMO.pitcherEraBaseline * 2.5)),
    ref("HOT", 66, pitcherPerf(full, PROMO.pitcherEraBaseline / 2)),
    ...bench,
  ];
  const res = call("evalCalldownCandidatesNative", {
    teamProfile: PROFILE,
    activePlayers: active,
    currentRosterSize: active.length, maxRosterSize: active.length - 1,
    promotionRules: PROMO,
  });
  check("능력치가 같으면 부진한 쪽이 먼저 내려간다",
    res.candidates[0]?.playerId === "SLUMP", res.candidates[0]?.playerId ?? "-");

  // 보직 하한 — 강등이 로스터 구성을 무너뜨리면 안 된다.
  // **한쪽만 걸면 반대쪽이 밀린다**(실측: 야수 하한만 걸었더니 투수 9~11 → 5).
  const onlyPitchers = Array.from({ length: 20 }, (_, i) => filler(`P${i}`, "RP"))
    .concat(Array.from({ length: 14 }, (_, i) => filler(`B${i}`, "1B")));
  const lockBat = call("evalCalldownCandidatesNative", {
    teamProfile: PROFILE, activePlayers: onlyPitchers,
    currentRosterSize: onlyPitchers.length, maxRosterSize: onlyPitchers.length - 3,
    promotionRules: PROMO,
  });
  check("야수가 하한이면 투수만 내려간다",
    lockBat.candidates.length === 3 && lockBat.candidates.every((c) => c.playerId.startsWith("P")),
    lockBat.candidates.map((c) => c.playerId).join(","));

  const both = Array.from({ length: 12 }, (_, i) => filler(`P${i}`, "RP"))
    .concat(Array.from({ length: 14 }, (_, i) => filler(`B${i}`, "1B")));
  const stop = call("evalCalldownCandidatesNative", {
    teamProfile: PROFILE, activePlayers: both,
    currentRosterSize: both.length, maxRosterSize: both.length - 3,
    promotionRules: PROMO,
  });
  check("양쪽 다 하한이면 강등을 멈춘다 (정원 초과를 감수)",
    stop.candidates.length === 0, `${stop.candidates.length}건`);
}

// ── 5. 한 시즌 — 출렁임이 폭주하지 않는가 ─────────────────────
console.log("\n한 시즌 출렁임");
{
  const KBL1 = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));
  const MONTH_STARTS = [1, 5, 9, 13, 17, 21, 25];
  const WEEKS = 26;
  let seed = 20260731;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

  const players = new Map();
  for (const farm of [false, true]) {
    const lid = farm ? "LEAGUE_KBL_FARM" : "LEAGUE_KBL";
    const teams = KBL1.map((t) => ({
      teamId: farm ? t.id.replace(/_1$/, "_2") : t.id, schoolId: "", power: t.power,
    }));
    const gen = call("generateLeagueRosterNative", {
      leagueId: lid, seasonYear: 2026, worldSeed: 4242, teams, rules: gr.rosterRules[lid],
      salaryRules: gr.salaryRules, powerRules: gr.powerRules,
      entryRules: gr.careerHistoryRules.entry,
    }).npcs;
    for (const g of gen) {
      const ovr = (g.abilities.pitching ?? g.abilities.batting).ovr;
      players.set(g.npcId, {
        atFarm: farm, team1: g.currentTeam.replace(/_2$/, "_1"),
        ref: { id: g.npcId, position: g.position, age: g.age, ovr, salary: g.salary,
               remainingYears: g.contractYears, proServiceYears: g.proServiceYears,
               isProspect: farm, personality: null, fame: 0 },
        ip: 0, er: 0, pa: 0, ob: 0, games: 0,
      });
    }
  }

  const isP = (pos) => ["SP", "RP", "CP", "P"].includes(pos);
  const moves = new Map();
  let urgentMoves = 0;

  for (let week = 1; week <= WEEKS; week++) {
    for (const p of players.values()) {
      const share = p.atFarm ? 0.6 : 1.0;
      const skill = (p.ref.ovr - 60) / 20;
      if (isP(p.ref.position)) {
        const ip = (p.ref.position === "SP" ? 5.5 : 1.5) * share;
        const era = Math.max(0.5, 4.5 - skill * 2 + (rnd() - 0.5) * 3);
        p.ip += ip; p.er += (era * ip) / 9; p.games++;
      } else {
        const pa = 4.2 * share;
        p.pa += pa; p.ob += Math.max(0.35, 0.7 + skill * 0.15 + (rnd() - 0.5) * 0.35) * pa; p.games++;
      }
    }
    const urgentOnly = !MONTH_STARTS.includes(week);
    const pending = [];
    for (const t of KBL1) {
      const mine = [...players.values()].filter((p) => p.team1 === t.id);
      const withPerf = (p) => ({ ...p.ref, ...(isP(p.ref.position)
        ? (p.ip > 0 ? { perf: { games: p.games, innings: p.ip, era: (p.er * 9) / p.ip, whip: 1.3 } } : {})
        : (p.pa > 0 ? { perf: { games: p.games, plateAppearances: Math.round(p.pa), ops: p.ob / p.pa } } : {})) });
      const active = mine.filter((p) => !p.atFarm).map(withPerf);
      const farm = mine.filter((p) => p.atFarm).map(withPerf);
      if (!active.length || !farm.length) continue;

      const res = call("evalCallupCandidatesNative", {
        teamProfile: PROFILE, farmPlayers: farm, activePlayers: active,
        injuredPlayerIds: [], currentMonth: Math.ceil(week / 4.34), promotionRules: PROMO,
      });
      const picked = urgentOnly
        ? res.candidates.filter((c) => c.reason === "injury_replacement" || c.reason === "slump_replacement").slice(0, 1)
        : res.candidates.slice(0, 2);
      for (const c of picked) pending.push([c.playerId, false], [c.replacesPlayerId, true]);

      if (!urgentOnly && active.length > gr.rosterRules.LEAGUE_KBL.rosterMin) {
        const cd = call("evalCalldownCandidatesNative", {
          teamProfile: PROFILE, activePlayers: active,
          currentRosterSize: active.length, maxRosterSize: gr.rosterRules.LEAGUE_KBL.rosterMax,
          promotionRules: PROMO,
        });
        for (const c of cd.candidates.slice(0, 2)) pending.push([c.playerId, true]);
      }
    }
    for (const [id, toFarm] of pending) {
      const p = players.get(id);
      if (!p || p.atFarm === toFarm) continue;
      p.atFarm = toFarm;
      moves.set(id, (moves.get(id) ?? 0) + 1);
      if (urgentOnly) urgentMoves++;
    }
  }

  const total = [...moves.values()].reduce((a, b) => a + b, 0);
  const worst = Math.max(0, ...moves.values());
  const churn = [...moves.values()].filter((n) => n >= 4).length;
  console.log(`    이동 ${total}건 · 움직인 선수 ${moves.size}명 · ` +
    `최다 ${worst}회 · 4회+ ${churn}명 (상시 ${urgentMoves}건)`);

  check("승강이 실제로 일어난다", total > 0);
  check("한 선수가 매주 오르내리지는 않는다", worst < WEEKS / 2, `최다 ${worst}회`);
  check("출렁이는 선수가 전체의 10% 미만이다",
    churn / players.size < 0.10, `${churn}/${players.size}`);

  // 1군 정원이 상한을 안 넘는가
  const per = new Map();
  for (const p of players.values()) {
    if (p.atFarm) continue;
    per.set(p.team1, (per.get(p.team1) ?? 0) + 1);
  }
  const max = gr.rosterRules.LEAGUE_KBL.rosterMax;
  const over = [...per.entries()].filter(([, n]) => n > max);
  console.log(`    1군 팀당 ${Math.min(...per.values())}~${Math.max(...per.values())}명 (상한 ${max})`);
  check("승강이 1군 상한을 깨지 않는다", over.length === 0,
    over.map(([t, n]) => `${t}:${n}`).join(","));

  // 콜업은 1:1 교체라 정원을 안 늘린다. 콜다운만 나가면 1군이 마른다 —
  // 실제로 한 시즌에 30명 → 16명이 됐다
  const min = gr.rosterRules.LEAGUE_KBL.rosterMin;
  const under = [...per.entries()].filter(([, n]) => n < min);
  check("승강이 1군을 말리지 않는다 (하한 유지)", under.length === 0,
    under.map(([t, n]) => `${t}:${n}`).join(","));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
