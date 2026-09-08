"use strict";
/**
 * 로스터가 **언제** 줄어드는가 — `npm run check:rostertrend`
 *
 * KBL 1군이 생성 30명인데 실측이 21~22명이다(`test:rosterbalance`).
 * 규칙은 하한 26 · 상한 34라 **규칙을 못 지키고 있다.**
 *
 * "생성부터 미달인지, 주차마다 빠지는지, 오프시즌에 한 번에 빠지는지"를
 * 갈라야 원인이 정해진다:
 *   · 생성부터 미달   → 생성 규칙·배치 문제
 *   · 주차마다 조금씩 → 은퇴·부상·방출이 상시로 샌다
 *   · 오프시즌에 급감 → 은퇴·방출 판정이 과하거나 유입이 모자라다
 *
 * ⚠ **주 단위로 본다.** 시점 두 개(오프시즌직후·시즌종료)만 보면 그 사이가
 * 통째로 안 보인다 — `test:rosterbalance`가 그래서 원인을 못 짚었다.
 *
 * ⚠ **`test:rosterbalance`와 값이 다른 건 정상이다.** 저쪽은 시즌마다
 * `Math.min`으로 **최악값을 누적**한다(전 구간 어느 한 순간 어느 한 팀).
 * 여기는 **마지막 시점의 중앙값·최소**다. 5시즌 실측에서 저쪽 야수 10 ·
 * 여기 최소 13이 나왔는데 **둘 다 맞다.** 나란히 놓고 "어긋난다"고 읽으면
 * 없는 결함을 파게 된다 — 실제로 그러했다.
 *
 * ⚠ **게임 경로를 그대로 탄다.** `repo:syncNpcs`를 가로채 **실제로 저장되는
 * 명단**을 센다. 스토어를 직접 읽으면 배선을 안 보게 된다.
 *
 * ── 2026-09-06: 계기에서 **검사로** 승격 ─────────────────────────
 * 여기가 통과/실패를 안 걸어서 **대학이 정원 32에 20으로 생성되는 걸 아무도
 * 못 봤다**(`roster_gen.rs` 예산 산식이 아마추어에도 돌았다 — 실측 평균 20.2).
 * 표만 찍는 계기는 사람이 안 볼 때 아무것도 안 지킨다.
 *
 * 이제 마지막 시점에 **팀 평균이 정원 대비 하한** 아래면 실패한다:
 *   · 연봉이 없는 리그(고교·대학) → `rosterSize × FLOOR_RATIO`
 *     예산이 정원을 못 정하므로 `rosterSize`가 그대로 목표다
 *   · 연봉이 있는 리그 → `rosterMin`
 *     팀 예산이 정원을 정하는 게 **설계**라 `rosterSize`를 기준으로 삼으면
 *     가난한 팀이 정상인데도 빨강이 된다. 규칙 파일이 정한 하한을 본다
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const SEED = arg("seed", 20260731);
const LEAGUE = "LEAGUE_KBL";
const FARM = "LEAGUE_KBL_FARM";
/** 프로 1군 셋 — "몇 팀이 야수 부족인가"를 리그별로 센다 */
const PRO_ONE = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
/** 코드가 채우려는 값(`tuning.rs FIRST_TEAM_MIN_BATTERS`)과 검사 기준 */
const BAT_TARGET = 14;
const BAT_CHECK = 12;

/**
 * 정원 대비 하한 — **제안값이다**(`docs/BALANCE_BACKLOG.md`).
 *
 * 0.85 를 고른 근거: 대학은 매 시즌 종료에 4학년(정원의 1/4)이 한꺼번에
 * 나가고 신입이 그 자리를 메우므로, 경계 시점에 한 학년 몫이 잠깐 빈다.
 * 그게 0.75 다. 0.85 는 "한 학년이 통째로 비는 것보다는 낫다"는 선이고,
 * 고친 뒤 실측(3시즌 뒤 대학 평균 32.7 / 32 = 1.02)과 여유가 크다.
 */
const FLOOR_RATIO = 0.85;

/** 정원 대비를 재는 리그 — 로스터 규칙에 `rosterSize`가 있는 리그 전부 */
const CENSUS_LEAGUES = [
  "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
  "LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_ABL", "LEAGUE_JBL",
];

const rows = [];
/** 마지막 시점의 리그별 팀 인원 — 게이트가 이걸 본다 */
let lastCensus = new Map();
let pending = null;   // 다음 저장에 붙일 주차 표시

function onSync(npcs) {
  const one = new Map();   // 팀 → [야수, 투수]
  const two = new Map();
  for (const n of npcs) {
    if (!n || n.careerStatus !== "active") continue;
    const t = n.currentTeam;
    if (!t) continue;
    const bag = n.currentLeague === LEAGUE ? one
      : n.currentLeague === FARM ? two : null;
    if (!bag) continue;
    if (!bag.has(t)) bag.set(t, [0, 0]);
    const e = bag.get(t);
    if (n.playerType === "pitcher") e[1]++; else e[0]++;
  }
  const stat = (m) => {
    const tot = [...m.values()].map(([b, p]) => b + p).sort((a, b) => a - b);
    const bat = [...m.values()].map(([b]) => b).sort((a, b) => a - b);
    if (!tot.length) return { teams: 0, med: 0, min: 0, medBat: 0 };
    return {
      teams: tot.length,
      med: tot[Math.floor(tot.length / 2)],
      min: tot[0],
      medBat: bat[Math.floor(bat.length / 2)],
    };
  };
  // 리그별 "야수 부족 팀 수" — 중앙값만 보면 몇 팀이 모자란지 안 보인다
  const perLeague = {};
  for (const lid of PRO_ONE) {
    const m = new Map();
    for (const n of npcs) {
      if (!n || n.careerStatus !== "active") continue;
      if (n.currentLeague !== lid || !n.currentTeam) continue;
      if (!m.has(n.currentTeam)) m.set(n.currentTeam, 0);
      if (n.playerType !== "pitcher") m.set(n.currentTeam, m.get(n.currentTeam) + 1);
    }
    const bats = [...m.values()];
    perLeague[lid] = {
      teams: bats.length,
      under14: bats.filter((b) => b < BAT_TARGET).length,
      under12: bats.filter((b) => b < BAT_CHECK).length,
      min: bats.length ? Math.min(...bats) : 0,
    };
  }
  rows.push({ tag: pending ?? "?", one: stat(one), two: stat(two), perLeague });

  // 🔴 **정원 대비 인구조사** — 게이트가 보는 값이다.
  //   `active`만 세지 않는다. 부상자도 로스터를 차지한다(자리를 비우는 건
  //   은퇴뿐이다 — `generateFreshmenV3` 주석과 같은 기준).
  const census = new Map();
  for (const n of npcs) {
    if (!n || n.careerStatus === "retired") continue;
    if (!n.currentTeam || !n.currentLeague) continue;
    if (!CENSUS_LEAGUES.includes(n.currentLeague)) continue;
    let m = census.get(n.currentLeague);
    if (!m) { m = new Map(); census.set(n.currentLeague, m); }
    m.set(n.currentTeam, (m.get(n.currentTeam) ?? 0) + 1);
  }
  if (census.size) lastCensus = census;
}

headless.setInterceptor(async (channel, args, call) => {
  if (channel === "repo:call" && args[0] === "syncNpcs") {
    try {
      const p = typeof args[1] === "string" ? JSON.parse(args[1]) : args[1];
      if (p && Array.isArray(p.npcs)) onSync(p.npcs);
    } catch { /* 계측이 진행을 막지 않는다 */ }
  }
  return await call();
});

async function main() {
  const { app, tmp } = await headless.boot("rostertrend");
  try {
    await app.boot({ slotId: "RT", worldSeed: SEED, seasonYear: 2026 });
    pending = `${app.currentSeason()} 생성직후`;

    const start = app.currentSeason();
    let guard = 0;
    const stallGuard = makeStallGuard();
    // 🔴 **정착 주차까지 더 돈다** (2026-09-06). 시즌 경계에서 멈추면 마지막
    //   스냅샷이 **졸업 직후·신입 직전**에 걸린다 — 고교가 평균 19.3(정원 31)
    //   으로 찍혔는데 다음 주에 1,020명이 들어와 31로 돌아온다. 없는 결함을
    //   가리키는 계기다. 새 시즌 초반까지 돌려 **채워진 뒤**를 잰다.
    const SETTLE_WEEK = 6;
    const done = () => app.currentSeason() > start + SEASONS
      || (app.currentSeason() === start + SEASONS && app.currentWeek() >= SETTLE_WEEK);
    while (guard++ < (SEASONS + 1) * 52 * 60 && !done()) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      pending = `${s0} W${w0}`;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        pending = `${s0} 시즌종료`;
        await app.seasonRollover();
        pending = `${app.currentSeason()} 롤오버직후`;
        continue;
      }
      await app.autoRun();
      // 한 바퀴 안 움직인 것은 정지 pending 을 민 정상 경로일 수 있다 — `perf/weekLoop.cjs` 머리말
      if (stallGuard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }

    console.log(`[로스터 추이] 씨앗 ${SEED} · ${SEASONS}시즌 · 규칙 1군 하한 26 · 상한 34\n`);
    console.log("  시점              1군 중앙/최소(야수)   2군 중앙/최소(야수)");
    let prev = null;
    for (const r of rows) {
      const a = r.one, b = r.two;
      const drop = prev !== null && a.med < prev ? `  ↓${prev - a.med}` : "";
      console.log(
        `  ${String(r.tag).padEnd(16)}` +
        `${String(a.med).padStart(4)}/${String(a.min).padStart(2)}(${String(a.medBat).padStart(2)})` +
        `${" ".repeat(11)}` +
        `${String(b.med).padStart(4)}/${String(b.min).padStart(2)}(${String(b.medBat).padStart(2)})` +
        drop,
      );
      prev = a.med;
    }

    if (rows.length >= 2) {
      const first = rows[0].one.med, last = rows[rows.length - 1].one.med;
      console.log("");
      console.log(`  1군 중앙값  ${first} → ${last}`);
      // 가장 크게 떨어진 구간 — 원인을 짚는 자리다
      let worst = { at: "", d: 0 };
      for (let i = 1; i < rows.length; i++) {
        const d = rows[i - 1].one.med - rows[i].one.med;
        if (d > worst.d) worst = { at: rows[i].tag, d };
      }
      if (worst.d > 0) console.log(`  제일 크게 떨어진 자리  ${worst.at}  (-${worst.d})`);
      else console.log("  줄어든 구간이 없다 — 생성부터 미달이라는 뜻이다");

      // 🔴 **몇 팀이 모자란가** — 중앙값이 14라도 바닥이 얇으면 그 팀은 타순을 못 짠다
      const last2 = rows[rows.length - 1].perLeague ?? {};
      console.log("");
      console.log(`  마지막 시점 · 리그별 야수 부족 팀 (목표 ${BAT_TARGET} · 검사 ${BAT_CHECK})`);
      for (const [lid, v] of Object.entries(last2)) {
        console.log(`    ${lid.replace("LEAGUE_", "").padEnd(6)} ${v.teams}팀 중  ` +
          `<${BAT_TARGET}: ${v.under14}팀 · <${BAT_CHECK}: ${v.under12}팀 · 최소 ${v.min}명`);
      }
    }

    // ── 정원 대비 게이트 ────────────────────────────────────────
    const rulesFile = JSON.parse(require("node:fs").readFileSync(
      path.join(headless.ROOT, "resource/data/master/players/generation_rules.json"), "utf8"));
    const rr = rulesFile.rosterRules;
    // 연봉이 있는 리그 = `leagueMult`에 항목이 있는 리그. `roster_gen.rs`의
    // `budget_sizes_roster`와 **같은 기준**이다 — 다르면 재는 자리와 고친
    // 자리가 갈린다
    const paid = new Set(Object.keys(rulesFile.salaryRules?.leagueMult ?? {}));

    console.log("");
    console.log(`  마지막 시점 · 정원 대비 (하한: 무보수 리그 정원×${FLOOR_RATIO} · 보수 리그 rosterMin)`);
    const fails = [];
    for (const lid of CENSUS_LEAGUES) {
      const m = lastCensus.get(lid);
      const r = rr[lid];
      if (!m || !m.size || !r) { console.log(`    ${lid.padEnd(20)} (명단 0 — 못 잼)`); continue; }
      const counts = [...m.values()].sort((a, b) => a - b);
      const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
      const isPaid = paid.has(lid);
      const floor = isPaid ? r.rosterMin : Math.round(r.rosterSize * FLOOR_RATIO);
      const ok = avg >= floor;
      if (!ok) fails.push(`${lid} 평균 ${avg.toFixed(1)} < 하한 ${floor}`);
      console.log(`    ${lid.padEnd(20)} ${String(counts.length).padStart(3)}팀 · ` +
        `평균 ${avg.toFixed(1).padStart(5)} / 정원 ${String(r.rosterSize).padStart(2)} ` +
        `(${((avg / r.rosterSize) * 100).toFixed(0)}%) · 최소 ${String(counts[0]).padStart(2)} · ` +
        `하한 ${String(floor).padStart(2)}${isPaid ? "(예산제)" : ""}  ${ok ? "OK" : "FAIL"}`);
    }

    console.log("");
    if (fails.length) {
      console.error(`[check-rostertrend] FAIL ${fails.length}건`);
      for (const f of fails) console.error(`  · ${f}`);
      process.exitCode = 1;
    } else {
      console.log("[check-rostertrend] PASS — 모든 리그가 정원 하한을 지킨다");
    }
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[check-rostertrend] 실패:", e); process.exit(1); });
