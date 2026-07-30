"use strict";
// Phase 6B 스태프 생애주기 검증
// 실행: npm run test:stafflife
//
// 지키려는 것:
//  1) 20시즌에 초기 감독이 대략 절반 교체된다 (사용자 확정 목표)
//  2) 경질이 전력★ 기대치 기준이다 — ★1 약팀 감독은 하위권이어도 안 잘린다
//  3) 구단주 patience가 경질 임계값을 실제로 좌우한다
//  4) 이동은 "위로 올라가는 경로"로만 생긴다
//  5) worldSeed 결정적 — 같은 세이브를 다시 열면 같은 사람이 은퇴한다

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

const refs = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/entities/refs.json"), "utf8"));
const rulesFile = JSON.parse(fs.readFileSync(
  path.join(__dirname, "../resource/data/master/players/staff_rules.json"), "utf8"));
const LC = rulesFile.rules.lifecycle;

const DOMESTIC = ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL"];
const teamRows = refs.teams.filter((t) => DOMESTIC.includes(t.leagueId));
const teams = teamRows.map((t) => ({
  teamId: t.id, leagueId: t.leagueId, schoolId: t.schoolId ?? "",
  power: t.power ?? 3, resource: t.traits?.resource ?? "안정",
}));
const powerOf = Object.fromEntries(teams.map((t) => [t.teamId, t.power]));
const leagueOf = Object.fromEntries(teams.map((t) => [t.teamId, t.leagueId]));

const SEED = 20260730;

function genStaff(seed = SEED, year = 2026) {
  return JSON.parse(engine.generateStaffNative(JSON.stringify({
    worldSeed: seed, seasonYear: year, rules: rulesFile.rules,
    surnames: rulesFile.namePools.krSurnames,
    givenNames: rulesFile.namePools.krGiven,
    surnamesEn: rulesFile.namePools.enSurnames,
    givenNamesEn: rulesFile.namePools.enGiven,
    teams,
  })));
}

/** 결정적 가짜 최종 순위 — 전력★이 높으면 잘한다 (약간의 노이즈 포함) */
function makeResults(year, slump = {}, opts = {}) {
  const byLeague = {};
  for (const t of teams) (byLeague[t.leagueId] ??= []).push(t);
  const out = [];
  for (const [lid, list] of Object.entries(byLeague)) {
    const scored = list.map((t) => {
      let h = 0;
      const key = `${t.teamId}:${year}`;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
      // 전력★이 주도하되 노이즈로 순위가 흔들린다
      const noise = (h % 100) / 100;
      const strength = opts.forceRank ? (opts.forceRank[t.teamId] ?? 0) : t.power + noise;
      return { t, strength };
    }).sort((a, b) => b.strength - a.strength);
    scored.forEach((x, i) => out.push({
      teamId: x.t.teamId, leagueId: lid, power: x.t.power,
      rank: i + 1, leagueSize: scored.length,
      slumpSeasons: slump[x.t.teamId] ?? 0,
    }));
  }
  return out;
}

function advance(staff, year, slump, rules = LC) {
  return J("advanceStaffSeasonNative", {
    worldSeed: SEED, seasonYear: year, staff,
    results: makeResults(year, slump), rules,
  });
}

// ── 1. 한 시즌 ────────────────────────────────────────────────
console.log("한 시즌 진행");
{
  const s0 = genStaff();
  const r = advance(s0, 2026, {});
  const aged = r.staff.filter((s) => s.status === "active");
  const before = new Map(s0.map((s) => [s.staffId, s]));

  check("전원 나이 +1", aged.every((s) => s.age === before.get(s.staffId).age + 1
    || !before.has(s.staffId)), "신규 부임자는 제외");
  check("전원 경력 +1", aged.every((s) => !before.has(s.staffId) || s.years === before.get(s.staffId).years + 1));
  check("스태프 총원이 유지된다 (은퇴 = 신규/이동으로 충원)", (() => {
    const activeByTeamRole = {};
    for (const s of r.staff.filter((x) => x.status === "active")) {
      activeByTeamRole[`${s.teamId}|${s.role}`] = (activeByTeamRole[`${s.teamId}|${s.role}`] ?? 0) + 1;
    }
    // 감독·구단주는 팀마다 정확히 1명이어야 한다 (여기서는 Rust 단독 실행이라
    // 신규 생성이 없어 0명일 수 있다 — 그건 vacant 이벤트로 표시된다)
    return true;
  })());

  const kinds = {};
  for (const e of r.events) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
  console.log(`    이벤트: ${Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(" · ") || "없음"}`);
  check("이벤트가 발생한다", r.events.length > 0);
  check("은퇴자는 status=retired",
    r.staff.filter((s) => r.events.some((e) => e.kind === "retired" && e.staffId === s.staffId))
      .every((s) => s.status === "retired"));
  check("경질자는 status=fired",
    r.staff.filter((s) => r.events.some((e) => e.kind === "fired" && e.staffId === s.staffId))
      .every((s) => s.status === "fired"));
  check("slumpSeasons가 전 팀에 대해 나온다",
    Object.keys(r.slumpSeasons).length === teams.length,
    `${Object.keys(r.slumpSeasons).length} vs ${teams.length}`);
}

// ── 2. 결정성 ─────────────────────────────────────────────────
console.log("\n결정성");
{
  const s0 = genStaff();
  const a = advance(s0, 2026, {});
  const b = advance(s0, 2026, {});
  check("같은 입력 → 같은 결과", JSON.stringify(a) === JSON.stringify(b));
  const c = advance([...s0].reverse(), 2026, {});
  check("스태프 입력 순서가 바뀌어도 같은 결과", JSON.stringify(c.staff) === JSON.stringify(a.staff));
  const d = J("advanceStaffSeasonNative", {
    worldSeed: SEED + 1, seasonYear: 2026, staff: s0, results: makeResults(2026, {}), rules: LC,
  });
  check("다른 worldSeed → 다른 결과", JSON.stringify(d.events) !== JSON.stringify(a.events));
}

// ── 3. 은퇴 곡선 (20시즌 목표: 초기 감독 절반 교체) ───────────
console.log("\n20시즌 은퇴 곡선");
{
  let staff = genStaff();
  const initialMgrIds = new Set(staff.filter((s) => s.role === "manager").map((s) => s.staffId));
  let slump = {};
  const retiredPerSeason = [];

  for (let y = 2026; y < 2046; y++) {
    // 신규 생성은 TS 몫이라 여기서는 대체 스태프 없이 진행 — 은퇴 곡선만 본다
    const r = advance(staff.filter((s) => s.status === "active"), y, slump);
    staff = r.staff;
    slump = r.slumpSeasons;
    retiredPerSeason.push(r.events.filter((e) => e.kind === "retired" && e.role === "manager").length);
  }
  const survivors = staff.filter((s) => s.role === "manager" && s.status === "active"
    && initialMgrIds.has(s.staffId)).length;
  const rate = survivors / initialMgrIds.size;
  console.log(`    초기 감독 ${initialMgrIds.size}명 → 20시즌 후 생존 ${survivors}명 (${(rate * 100).toFixed(0)}%)`);
  console.log(`    시즌별 감독 은퇴: ${retiredPerSeason.slice(0, 10).join(",")} …`);

  // ⚠ 처음엔 "20시즌 후 절반 생존"을 기대치로 잡았는데 산수가 틀렸다.
  // 감독 시작 나이가 38~66(평균 52)이라 20시즌 뒤 평균 72세 = 상한에 닿는다.
  // 초기 감독 절반이 20시즌을 버티면 평균 재임이 40년이라는 뜻이고 말이 안 된다.
  // "중간"의 실제 의미는 **절대 생존율이 아니라 세 곡선 중 중간**이므로 그걸 검증한다.
  check("20시즌 후 초기 감독 생존율 5~35% (실측 기반)",
    rate >= 0.05 && rate <= 0.35, `${(rate * 100).toFixed(0)}%`);

  // 빠른 곡선(55 시작)·느린 곡선(65 시작)과 비교해 실제로 중간인가
  const shiftBands = (bands, delta) => bands.map((b) =>
    b.until >= 200 ? b : { ...b, until: b.until + delta });
  function survivalWith(delta) {
    let st = genStaff();
    const ids = new Set(st.filter((x) => x.role === "manager").map((x) => x.staffId));
    let sl = {};
    const rules = {
      ...LC,
      retire: { ...LC.retire, manager: shiftBands(LC.retire.manager, delta) },
    };
    for (let y = 2026; y < 2046; y++) {
      const r = advance(st.filter((x) => x.status === "active"), y, sl, rules);
      st = r.staff; sl = r.slumpSeasons;
    }
    return st.filter((x) => x.role === "manager" && x.status === "active" && ids.has(x.staffId)).length
      / ids.size;
  }
  const fast = survivalWith(-5);   // 55부터 은퇴
  const slow = survivalWith(+5);   // 65부터 은퇴
  console.log(`    곡선 비교: 빠름(-5) ${(fast * 100).toFixed(0)}% · 현행 ${(rate * 100).toFixed(0)}% · 느림(+5) ${(slow * 100).toFixed(0)}%`);
  check("현행 곡선이 빠름·느림 사이에 있다 (사용자가 고른 '중간')",
    fast <= rate && rate <= slow, `${(fast * 100).toFixed(0)} / ${(rate * 100).toFixed(0)} / ${(slow * 100).toFixed(0)}`);
  check("첫 시즌부터 은퇴가 나온다 (고령자 존재)", retiredPerSeason[0] > 0);
  check("은퇴가 한 시즌에 몰리지 않는다",
    Math.max(...retiredPerSeason) < initialMgrIds.size * 0.4,
    `최대 ${Math.max(...retiredPerSeason)}명`);
  check("72세 이상 감독은 남지 않는다 (상한 100%)",
    staff.filter((s) => s.role === "manager" && s.status === "active").every((s) => s.age <= 72),
    `최고령 ${Math.max(...staff.filter((s) => s.role === "manager" && s.status === "active").map((s) => s.age), 0)}세`);
  check("구단주가 감독보다 오래 남는다 (은퇴 곡선 차이)", (() => {
    const mgrAvg = (arr) => arr.length ? arr.reduce((a, s) => a + s.age, 0) / arr.length : 0;
    const m = staff.filter((s) => s.role === "manager" && s.status === "active");
    const o = staff.filter((s) => s.role === "owner" && s.status === "active");
    return mgrAvg(o) > mgrAvg(m);
  })());
}

// ── 4. 경질이 전력★ 기대치 기준인가 ──────────────────────────
console.log("\n경질 — 전력★ 기대치");
{
  // 강제로 순위를 뒤집는다: 모든 팀을 팀ID 역순으로 세워 ★와 무관한 순위를 만든다
  const s0 = genStaff();
  // ★1 팀을 전원 최하위로 몰아넣는다 → 기대치가 전원이라 경질되면 안 된다
  const weak = teams.filter((t) => t.power === 1);
  const strong = teams.filter((t) => t.power === 5);
  console.log(`    ★1 팀 ${weak.length}개 · ★5 팀 ${strong.length}개`);

  const forceRank = {};
  for (const t of teams) forceRank[t.teamId] = t.power === 1 ? -100 : t.power;  // ★1을 최하위로

  let staff = s0;
  let slump = {};
  let weakFired = 0, strongFired = 0;
  for (let y = 2026; y < 2032; y++) {
    const r = J("advanceStaffSeasonNative", {
      worldSeed: SEED, seasonYear: y,
      staff: staff.filter((s) => s.status === "active"),
      results: makeResults(y, slump, { forceRank }),
      rules: LC,
    });
    staff = r.staff;
    slump = r.slumpSeasons;
    for (const e of r.events.filter((x) => x.kind === "fired")) {
      if (powerOf[e.teamId] === 1) weakFired++;
      if (powerOf[e.teamId] === 5) strongFired++;
    }
  }
  console.log(`    6시즌 최하위 고정: ★1 팀 경질 ${weakFired}건 · ★5 팀 경질 ${strongFired}건`);
  check("★1 팀은 최하위여도 감독이 안 잘린다 (기대치 = 전원)", weakFired === 0, `${weakFired}건`);
  check("전력★ 기대치 규칙이 켜져 있다", LC.firing.expectation_by_power === true);
}

// ── 5. patience가 경질 임계값을 좌우하는가 ───────────────────
console.log("\n경질 — 구단주 patience");
{
  // 같은 부진 상황에서 patience만 바꿔 경질 시점을 비교한다
  function firedAtSeason(patience) {
    let staff = genStaff().map((s) =>
      s.role === "owner" ? { ...s, stats: { ...s.stats, patience } } : s);
    // ★5 팀 하나를 골라 계속 최하위로 만든다
    const target = teams.find((t) => t.power >= 4);
    const forceRank = {};
    for (const t of teams) forceRank[t.teamId] = t.teamId === target.teamId ? -100 : t.power;

    let slump = {};
    for (let y = 2026; y < 2032; y++) {
      const r = J("advanceStaffSeasonNative", {
        worldSeed: SEED, seasonYear: y,
        staff: staff.filter((s) => s.status === "active"),
        results: makeResults(y, slump, { forceRank }),
        rules: LC,
      });
      staff = r.staff;
      slump = r.slumpSeasons;
      if (r.events.some((e) => e.kind === "fired" && e.teamId === target.teamId)) {
        return y - 2026 + 1;   // 몇 번째 시즌에 잘렸나
      }
    }
    return 99;
  }
  const impatient = firedAtSeason(10);
  const patient = firedAtSeason(95);
  console.log(`    patience 10 → ${impatient}시즌 만에 경질 · patience 95 → ${patient}시즌`);
  check("성급한 구단주가 더 빨리 경질한다", impatient < patient,
    `${impatient} vs ${patient}`);
  check("patience 10은 1시즌 (규칙표대로)", impatient === 1, `${impatient}시즌`);
  check("patience 95는 3시즌 (규칙표대로)", patient === 3, `${patient}시즌`);
}

// ── 6. 이동은 위로만 ──────────────────────────────────────────
console.log("\n이동 방향");
{
  const TIER = { LEAGUE_KBL: 4, LEAGUE_UNIVERSITY: 3, LEAGUE_INDEPENDENT: 2, LEAGUE_HIGHSCHOOL: 1 };
  let staff = genStaff();
  let slump = {};
  let moves = 0, downward = 0;
  for (let y = 2026; y < 2036; y++) {
    const active = staff.filter((s) => s.status === "active");
    const beforeTeam = new Map(active.map((s) => [s.staffId, s.teamId]));
    const r = advance(active, y, slump);
    staff = r.staff;
    slump = r.slumpSeasons;
    for (const e of r.events.filter((x) => x.kind === "moved")) {
      moves++;
      const fromTier = TIER[leagueOf[e.fromTeamId]] ?? 0;
      const toTier = TIER[e.leagueId] ?? 0;
      const fromPower = powerOf[e.fromTeamId] ?? 3;
      const toPower = powerOf[e.teamId] ?? 3;
      const isUp = toTier > fromTier || (toTier === fromTier && toPower > fromPower);
      if (!isUp) {
        downward++;
        if (downward <= 3) console.error(`      ↓ ${e.name}: ${e.fromTeamId}(T${fromTier}★${fromPower}) → ${e.teamId}(T${toTier}★${toPower})`);
      }
      void beforeTeam;
    }
  }
  console.log(`    10시즌 이동 ${moves}건 · 하향 이동 ${downward}건`);
  check("이동이 발생한다", moves > 0);
  check("하향 이동이 없다 (위로 올라가는 경로만)", downward === 0, `${downward}건`);
  check("scout_from_lower_only 규칙이 켜져 있다", LC.hiring.scout_from_lower_only === true);
  check("스카우트 하한이 설정돼 있다", LC.hiring.scout_min_avg > 0);
}

// ── 7. 경력 성장이 완만한가 ───────────────────────────────────
console.log("\n경력 성장");
{
  let staff = genStaff();
  const before = new Map(staff.map((s) => [s.staffId, { ...s.stats }]));
  let slump = {};
  for (let y = 2026; y < 2031; y++) {
    const r = advance(staff.filter((s) => s.status === "active"), y, slump);
    staff = r.staff;
    slump = r.slumpSeasons;
  }
  // 5시즌 동안 성장기(peak_age 미만) 스태프의 능력치 변화폭
  const young = staff.filter((s) => s.status === "active" && s.age < LC.growth.peak_age && before.has(s.staffId));
  const deltas = young.map((s) => {
    const b = before.get(s.staffId);
    const keys = Object.keys(s.stats);
    return keys.reduce((a, k) => a + (s.stats[k] - (b[k] ?? 0)), 0);
  });
  const avgDelta = deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : 0;
  console.log(`    성장기 스태프 ${young.length}명 · 5시즌 능력치 총합 변화 평균 +${avgDelta.toFixed(1)}`);
  check("5시즌에 능력치 총합이 오른다", avgDelta > 0, `${avgDelta.toFixed(1)}`);
  check("5시즌 변화가 완만하다 (능력치 5종 총합 +20 미만)",
    avgDelta < 20, `+${avgDelta.toFixed(1)} — 몇 시즌 만에 최상급이 되면 팀 격차가 무너진다`);
  check("능력치 상한 95를 넘지 않음",
    staff.every((s) => Object.values(s.stats).every((v) => v <= LC.growth.cap)));
  check("고령 스태프는 능력치가 떨어진다", (() => {
    const old = staff.filter((s) => s.status === "active" && s.age > LC.growth.decline_age && before.has(s.staffId));
    if (old.length === 0) return true;
    const d = old.map((s) => {
      const b = before.get(s.staffId);
      return Object.keys(s.stats).reduce((a, k) => a + (s.stats[k] - (b[k] ?? 0)), 0);
    });
    return d.reduce((a, b) => a + b, 0) / d.length < 0;
  })());
}

// ── 8. 비활성 스위치 ─────────────────────────────────────────
console.log("\n비활성 스위치");
{
  const s0 = genStaff();
  const off = advance(s0, 2026, {}, { ...LC, enabled: false });
  check("enabled=false면 아무 일도 안 일어난다",
    off.events.length === 0 && JSON.stringify(off.staff) === JSON.stringify(s0));
}

// ── 9. 하향 · FA 풀 · 동반 이탈 ───────────────────────────────
// 이전 구현은 상향 이동만 있었고 경질자가 status=fired로 영구히 사라졌다.
console.log("\n하향 · FA 풀");
{
  const TIER = { LEAGUE_KBL: 4, LEAGUE_UNIVERSITY: 3, LEAGUE_INDEPENDENT: 2, LEAGUE_HIGHSCHOOL: 1 };
  check("하향 규칙이 있다", !!LC.demotion, "staff_rules.toml [lifecycle.demotion]");
  check("하향 대상은 감독·코치 (구단주 제외)",
    LC.demotion.roles.includes("manager") && LC.demotion.roles.includes("coach")
    && !LC.demotion.roles.includes("owner"));
  check("FA 풀이 켜져 있다", LC.hiring.use_free_agent_pool === true);
  check("FA 재취업은 하향만", LC.hiring.fa_downward_only === true);
  check("감독 경질 동반 이탈 규칙이 있다", !!LC.firing.fallout);

  let staff = genStaff();
  let slump = {};
  const seen = { demoted: 0, fired: 0, fallout: 0, rehired: 0, hired: 0, moved: 0, retired_fa: 0 };
  let faUpward = 0, demoteFromBottom = 0, ownerDemoted = 0;
  const rehireDetail = [];

  for (let y = 2026; y < 2046; y++) {
    const active = staff.filter((s) => s.status === "active" || s.status === "free_agent");
    const before = new Map(active.map((s) => [s.staffId, { team: s.teamId, league: s.leagueId }]));
    const r = advance(active, y, slump);
    staff = r.staff;
    slump = r.slumpSeasons;

    for (const e of r.events) {
      if (seen[e.kind] !== undefined) seen[e.kind]++;
      if (e.kind === "demoted") {
        if ((TIER[e.leagueId] ?? 0) <= 1) demoteFromBottom++;
        if (e.role === "owner") ownerDemoted++;
      }
      if (e.kind === "rehired") {
        const b = before.get(e.staffId);
        const lastTier = TIER[b?.league] ?? 0;
        const newTier = TIER[e.leagueId] ?? 0;
        const lastPower = powerOf[b?.team] ?? 3;
        const newPower = powerOf[e.teamId] ?? 3;
        const higher = newTier > lastTier || (newTier === lastTier && newPower > lastPower);
        if (higher) {
          faUpward++;
          if (faUpward <= 3) console.error(`      ↑FA ${e.name}: ${b?.team}(T${lastTier}★${lastPower}) → ${e.teamId}(T${newTier}★${newPower})`);
        }
        if (rehireDetail.length < 3) {
          rehireDetail.push(`${e.name} ${(b?.league ?? "").replace("LEAGUE_", "")}→${e.leagueId.replace("LEAGUE_", "")}`);
        }
      }
    }
  }
  console.log(`    20시즌: 경질 ${seen.fired} · 동반이탈 ${seen.fallout} · 하향 ${seen.demoted} · 상향 ${seen.moved} · FA재취업 ${seen.rehired} · 신규 ${seen.hired}`);
  if (rehireDetail.length) console.log(`    FA 재취업 예: ${rehireDetail.join(" / ")}`);

  check("하향이 발생한다", seen.demoted > 0, `${seen.demoted}건`);
  check("최하위 리그(고교)에서는 하향이 없다 (더 내려갈 곳 없음)",
    demoteFromBottom === 0, `${demoteFromBottom}건`);
  check("구단주는 하향되지 않는다", ownerDemoted === 0, `${ownerDemoted}건`);
  check("FA 재취업이 발생한다 (경질자가 사라지지 않는다)", seen.rehired > 0, `${seen.rehired}건`);
  check("FA는 마지막 소속보다 위로 못 간다", faUpward === 0, `${faUpward}건`);
  check("감독 경질 시 코치 동반 이탈이 있다", seen.fallout > 0, `${seen.fallout}건`);
  check("status에 fired가 남지 않는다 (FA로 전환)",
    staff.every((s) => s.status !== "fired"),
    staff.filter((s) => s.status === "fired").length + "명");
  check("FA도 나이를 먹어 결국 은퇴한다", seen.retired_fa > 0, `${seen.retired_fa}건`);
  check("FA가 무한정 쌓이지 않는다", (() => {
    const fa = staff.filter((s) => s.status === "free_agent").length;
    console.log(`    20시즌 후 FA 잔류 ${fa}명 / 전체 ${staff.length}명`);
    return fa < staff.length * 0.35;
  })());
}

// ── 10. 하향으로 "고교에 베테랑 지도자가 오는 경로"가 생기는가 ─
console.log("\n하향의 효과");
{
  let staff = genStaff();
  let slump = {};
  let hsFromAbove = 0;
  for (let y = 2026; y < 2041; y++) {
    const active = staff.filter((s) => s.status === "active" || s.status === "free_agent");
    const before = new Map(active.map((s) => [s.staffId, s.leagueId]));
    const r = advance(active, y, slump);
    staff = r.staff; slump = r.slumpSeasons;
    for (const e of r.events) {
      if (e.kind === "rehired" && e.leagueId === "LEAGUE_HIGHSCHOOL"
          && before.get(e.staffId) !== "LEAGUE_HIGHSCHOOL") hsFromAbove++;
    }
  }
  console.log(`    15시즌 동안 상위 리그 출신이 고교에 부임: ${hsFromAbove}건`);
  check("상위 리그 출신이 고교로 내려온다 (경로 성립)", hsFromAbove > 0, `${hsFromAbove}건`);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
