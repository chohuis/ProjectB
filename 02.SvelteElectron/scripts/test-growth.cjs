#!/usr/bin/env node
// ── NPC 성장 회귀 ────────────────────────────────────────────────
//
// **이 검사가 없어서 세계가 조용히 말라붙었다.**
//
// 두 결함이 겹쳐 있었고 둘 다 어떤 테스트에도 안 걸렸다.
//
//  ① 생성기가 매긴 `ovr`이 자기 스탯과 불일치 — 스탯은 `ovr` 기준 음수
//     오프셋으로 만드는데(command −5, recovery −6, clutch −8,
//     holdRunners −10) 그 스탯을 OVR 공식에 넣으면 다른 값이 나왔다.
//     투수 −2.1, 타자 −4.0~−4.8. 첫 주간 성장에서 엔진이 재계산하는
//     순간 전 세계가 일제히 내려앉았고, 매 시즌 신규 생성분이 같은
//     손실을 다시 겪었다.
//
//  ② 성장 속도가 목표의 약 1/15 — 17세 유망주가 스탯 하나를 +1 올리는
//     데 85주가 걸렸다. 고교 3년을 다 뛰어도 OVR이 1도 안 올랐다.
//     반면 30세 감퇴는 정상 작동해서 1군 상위가 88 → 81 → 77로 무너졌다.
//
// 검사 셋:
//   G1  생성 OVR 정합    — 저장된 ovr == 스탯 재계산 ovr
//   G2  규칙/폴백 일치   — generation_rules.json과 Rust 폴백 표가 같은가
//   G3  목표 성장 곡선   — 실제로 한 시즌 굴려 나이대별 OVR 증가량 확인
//
//   node scripts/test-growth.cjs           전체
//   node scripts/test-growth.cjs --only G3

const path = require("path");
const fs = require("fs");

const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1] : null; })();
const log = (s) => process.stdout.write(s + "\n");

const R = (p) => JSON.parse(fs.readFileSync(path.join(process.cwd(), p), "utf8"));
const RULES = R("resource/data/master/players/generation_rules.json");
const XP = RULES.growthRules?.xp;

// OVR 공식 — Rust `calc_npc_*_ovr`과 같아야 한다.
// ⚠ 여기 두 번째로 적는 셈이지만, **대조가 목적**이라 의도적이다.
// 한쪽이 바뀌면 G1이 깨져서 알려준다 (조용히 어긋나는 게 최악이다).
const ovrP = (p) => Math.round(
  (p.velocity * 2.5 + p.command * 2.5 + p.control * 2.0 + p.movement * 1.5 + p.stamina * 1.5
   + p.mentality * 1.0 + p.recovery * 0.5 + p.clutch * 0.3 + p.holdRunners * 0.2) / 12);
const ovrB = (b) => Math.round(
  (b.contact * 2.0 + b.power * 1.8 + b.eye * 1.5 + b.discipline * 1.2 + b.speed * 1.3
   + b.baseInstinct * 0.7 + b.bunting * 0.3 + b.platoon * 0.3 + b.fielding * 1.3
   + b.arm * 0.8 + b.battingClutch * 0.6) / 11.8);

// 목표 곡선 (시즌당 OVR 증가). 규칙 파일 `_note`에 적힌 것과 같다.
// 허용 오차가 넓은 이유: 잠재력 soft cap·성적 계수·난수(0.85~1.15)가
// 겹쳐서 개인 편차가 크다. 여기서 보려는 건 **자릿수가 맞는가**다 —
// 지금까지의 실패는 +4.5여야 할 값이 +0.3이었던 종류다.
const TARGET = [
  { bucket: "~18",   want: 4.5, min: 2.5, max: 7.0 },
  { bucket: "19-21", want: 4.0, min: 2.0, max: 6.5 },
  { bucket: "22-24", want: 2.5, min: 1.0, max: 4.5 },
  { bucket: "25-27", want: 1.5, min: 0.4, max: 3.0 },
  { bucket: "28-30", want: 0.6, min: 0.0, max: 2.0 },
];

const CHECKS = [];

// ── G1: 생성 OVR 정합 ────────────────────────────────────────────
CHECKS.push({
  id: "G1",
  name: "생성 OVR 정합 — 저장된 ovr이 자기 스탯과 맞는가",
  run() {
    const engine = require(path.join(process.cwd(), "packages/engine-native"));
    const hs = RULES.rosterRules.LEAGUE_HIGHSCHOOL;
    const rows = JSON.parse(engine.generateFreshmenNative(JSON.stringify({
      schoolId: "SCHOOL_HS_GROWTHTEST", teamId: "TEAM_HS_GROWTHTEST",
      annualRosterSize: 400,
      pitchingOvrMin: hs.pitchingOvrMin, pitchingOvrMax: hs.pitchingOvrMax,
      battingOvrMin: hs.battingOvrMin, battingOvrMax: hs.battingOvrMax,
      devRateMin: hs.devRateMin, devRateMax: hs.devRateMax,
      namedNpcs: [], seasonYear: 2026, idOffset: 0,
    })));
    if (rows.length < 100) throw new Error(`생성 인원 부족 ${rows.length}`);

    const bad = [];
    for (const n of rows) {
      if (n.pitching && ovrP(n.pitching) !== n.pitching.ovr) {
        bad.push(`투수 ${n.npcId}: 저장 ${n.pitching.ovr} vs 재계산 ${ovrP(n.pitching)}`);
      }
      if (n.batting && ovrB(n.batting) !== n.batting.ovr) {
        bad.push(`타자 ${n.npcId}: 저장 ${n.batting.ovr} vs 재계산 ${ovrB(n.batting)}`);
      }
    }
    if (bad.length > 0) {
      throw new Error(`${bad.length}건 불일치 (표본 ${rows.length})\n  ` + bad.slice(0, 5).join("\n  "));
    }
    return `${rows.length}명 전원 일치`;
  },
});

// ── G2: 규칙 파일과 Rust 폴백 표 일치 ────────────────────────────
CHECKS.push({
  id: "G2",
  name: "성장 수치 정본 — 규칙 파일과 Rust 폴백이 같은가",
  run() {
    if (!XP) throw new Error("generation_rules.json growthRules.xp 없음");
    for (const k of ["multiplierPitcher", "multiplierBatter"]) {
      if (typeof XP[k] !== "number" || XP[k] <= 0) throw new Error(`${k} 값이 이상하다: ${XP[k]}`);
    }
    if (!Array.isArray(XP.ageBands) || XP.ageBands.length === 0) throw new Error("ageBands 비었음");
    // 오름차순이어야 "첫 매치" 탐색이 맞는다
    for (let i = 1; i < XP.ageBands.length; i++) {
      if (XP.ageBands[i].maxAge <= XP.ageBands[i - 1].maxAge) {
        throw new Error(`ageBands가 오름차순이 아니다: ${JSON.stringify(XP.ageBands)}`);
      }
    }
    // 성장이 나이에 따라 단조 감소해야 한다 (어린 선수가 더 큰다)
    for (let i = 1; i < XP.ageBands.length; i++) {
      if (XP.ageBands[i].f > XP.ageBands[i - 1].f) {
        throw new Error(`나이 들수록 성장이 빨라진다 — ${XP.ageBands[i - 1].maxAge}세 ${XP.ageBands[i - 1].f} → ${XP.ageBands[i].maxAge}세 ${XP.ageBands[i].f}`);
      }
    }

    // Rust 폴백 표와 대조 — 코드에 표를 두 번 적은 셈이므로 어긋나면 잡는다
    const rs = fs.readFileSync(path.join(process.cwd(), "packages/engine-native/src/npc_sim.rs"), "utf8");
    const body = rs.split("fn age_growth_factor(age: i32)")[1] ?? "";
    const arms = [...body.slice(0, 400).matchAll(/(?:\.\.=|=>\s*)?(\d+)\s*=>\s*([\d.]+)/g)]
      .map((m) => ({ maxAge: Number(m[1]), f: Number(m[2]) }));
    const mismatch = [];
    for (const band of XP.ageBands) {
      if (band.maxAge >= 99) continue;   // Rust는 `_ => 0.0`으로 받는다
      const hit = arms.find((a) => a.maxAge === band.maxAge);
      if (!hit) { mismatch.push(`Rust 폴백에 ${band.maxAge}세 칸이 없다`); continue; }
      if (Math.abs(hit.f - band.f) > 1e-9) {
        mismatch.push(`${band.maxAge}세: 규칙 ${band.f} vs Rust 폴백 ${hit.f}`);
      }
    }
    // 폴백 배율도 대조
    const mp = rs.match(/if npc\.player_type == "pitcher" \{ ([\d.]+) \} else \{ ([\d.]+) \}/);
    if (!mp) mismatch.push("Rust 폴백 배율을 못 찾았다");
    else {
      if (Math.abs(Number(mp[1]) - XP.multiplierPitcher) > 1e-9) {
        mismatch.push(`투수 배율: 규칙 ${XP.multiplierPitcher} vs Rust 폴백 ${mp[1]}`);
      }
      if (Math.abs(Number(mp[2]) - XP.multiplierBatter) > 1e-9) {
        mismatch.push(`타자 배율: 규칙 ${XP.multiplierBatter} vs Rust 폴백 ${mp[2]}`);
      }
    }
    // perf_factor 폴백도 대조 — 여기가 어긋나면 리그 전체 성장이 조용히 눌린다
    const nb = rs.match(/r\.no_perf_base\)\.unwrap_or\(([\d.]+)\)/);
    if (!nb) mismatch.push("Rust 폴백 noPerfBase를 못 찾았다");
    else if (Math.abs(Number(nb[1]) - XP.noPerfBase) > 1e-9) {
      mismatch.push(`noPerfBase: 규칙 ${XP.noPerfBase} vs Rust 폴백 ${nb[1]}`);
    }
    for (const [k, rustKey] of [["offseason", "offseason"], ["preseason", "preseason"],
                                ["postseason", "postseason"], ["season", "season"]]) {
      const m = rs.match(new RegExp(`w\\.${rustKey}\\)\\.unwrap_or\\(([\\d.]+)\\)`));
      if (!m) { mismatch.push(`Rust 폴백 phaseWeight.${k}를 못 찾았다`); continue; }
      if (Math.abs(Number(m[1]) - XP.phaseWeight[k]) > 1e-9) {
        mismatch.push(`phaseWeight.${k}: 규칙 ${XP.phaseWeight[k]} vs Rust 폴백 ${m[1]}`);
      }
    }

    if (mismatch.length > 0) throw new Error(mismatch.join("\n  "));
    return `${XP.ageBands.length}구간 · 배율 투 ${XP.multiplierPitcher} / 타 ${XP.multiplierBatter}`
      + ` · 무경기 ${XP.noPerfBase} · 오프시즌 ${XP.phaseWeight.offseason} — 규칙과 폴백 일치`;
  },
});

// ── G4: 노화가 실제로 걸리는가 ───────────────────────────────────
CHECKS.push({
  id: "G4",
  name: "노화 — 나이 든 선수가 실제로 내려가는가",
  run() {
    const engine = require(path.join(process.cwd(), "packages/engine-native"));
    const ctx = [{ teamId: "T", facilityTier: "1군", facilityFactor: 1.0, managerDevelopment: 50, coachTeaching: 50 }];

    // 52주를 굴려 OVR 변화를 본다. `agingDebt`를 왕복시키는 것까지 포함해서
    // 검사한다 — **그 왕복이 끊기면 노화가 통째로 사라진다.**
    const season = (age) => {
      let npc = {
        npcId: "X", teamId: "T", playerType: "pitcher", age,
        developmentRate: 50, potentialHidden: 85,
        pitching: {
          ovr: 75, stamina: 75, velocity: 75, command: 75, control: 75,
          movement: 75, mentality: 75, recovery: 75, clutch: 75, holdRunners: 75,
        },
        pitchingXp: {}, battingXp: {}, agingDebt: {},
        peakOvr: 75, currentFame: 50, pitches: [], pitcherRole: "SP",
      };
      for (let w = 0; w < 52; w++) {
        const r = JSON.parse(engine.npcCalcWeeklyGrowth(JSON.stringify({
          npcs: [npc], teamContexts: ctx, perfData: {},
          currentPhase: "season", monthIndex: 0, pitchCatalogIds: [],
        })));
        const u = r.updated?.[0];
        if (!u) throw new Error("npcCalcWeeklyGrowth가 결과를 안 냈다");
        npc = { ...npc, pitching: u.pitching, pitchingXp: u.pitchingXp, agingDebt: u.agingDebt, peakOvr: u.peakOvr };
      }
      return { ovr: npc.pitching.ovr - 75, vel: npc.pitching.velocity - 75 };
    };

    // 연간 감퇴 총량에서 나온 기대치. 성장이 일부 상쇄하므로 하한만 본다.
    const WANT = [
      { age: 31, maxOvr: 0,    note: "30대 초반은 완만" },
      { age: 34, maxOvr: -1.5, note: "30대 중반은 뚜렷" },
      { age: 37, maxOvr: -2.5, note: "30대 후반은 급격" },
    ];
    const lines = [], bad = [];
    for (const w of WANT) {
      const r = season(w.age);
      lines.push(`  ${w.age}세  OVR ${r.ovr >= 0 ? "+" : ""}${r.ovr} · velocity ${r.vel >= 0 ? "+" : ""}${r.vel}  (${w.note})`);
      if (r.ovr > w.maxOvr) bad.push(`${w.age}세: OVR ${r.ovr} — ${w.maxOvr} 이하여야 한다`);
      if (r.vel >= 0)       bad.push(`${w.age}세: velocity가 안 내려갔다 (${r.vel}) — 노화가 반올림에 삼켜지는 상태`);
    }
    log(lines.join("\n"));
    if (bad.length > 0) throw new Error(bad.join("\n  "));
    return "30세 이상이 실제로 감퇴한다";
  },
});

// ── G3: 목표 성장 곡선 (한 시즌 실측) ────────────────────────────
CHECKS.push({
  id: "G3",
  name: "목표 성장 곡선 — 한 시즌 굴려 나이대별 OVR 증가 확인",
  async run() {
    const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
    const { app, tmp } = await headless.boot("gro");
    try {
      await app.boot({ slotId: "GRO", worldSeed: 20260731, seasonYear: 2026 });
      app.ovrMark();

      let guard = 0;
      while (guard++ < 900) {
        const before = app.currentWeek();
        await app.autoRun();
        if (app.currentWeek() > before) continue;
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        if (await app.pushCareerForward()) continue;
        if (app.isSeasonEnded()) break;     // 롤오버 **전**에 잰다 (나이가 안 오른 상태)
        throw new Error(`막힘 W${before} pending=${app.pendingKind()}`);
      }

      const d = app.ovrDelta();
      const lines = [];
      const bad = [];
      // 고교·대학·1군을 합쳐서 본다 — 무대별 시설 계수 차이는 여기 관심사가 아니다
      const merged = {};
      for (const buckets of Object.values(d)) {
        for (const [b, v] of Object.entries(buckets)) {
          const m = (merged[b] ??= { sum: 0, n: 0, up: 0 });
          m.sum += v.d * v.n; m.n += v.n; m.up += v.up;
        }
      }
      for (const t of TARGET) {
        const m = merged[t.bucket];
        if (!m || m.n < 20) { lines.push(`  ${t.bucket.padEnd(6)} 표본 부족 (건너뜀)`); continue; }
        const got = m.sum / m.n;
        const upPct = Math.round((m.up / m.n) * 100);
        lines.push(`  ${t.bucket.padEnd(6)} ${got >= 0 ? "+" : ""}${got.toFixed(2)} (목표 +${t.want}, n${m.n}, 상승 ${upPct}%)`);
        if (got < t.min || got > t.max) {
          bad.push(`${t.bucket}: ${got.toFixed(2)} — 허용 ${t.min}~${t.max} 밖 (목표 ${t.want})`);
        }
      }
      log(lines.join("\n"));
      if (bad.length > 0) throw new Error(bad.join("\n  "));
      return "전 구간 목표 범위 안";
    } finally {
      headless.cleanup(tmp);
    }
  },
});

(async () => {
  const targets = only ? CHECKS.filter((c) => c.id === only) : CHECKS;
  if (targets.length === 0) { log(`알 수 없는 검사: ${only}`); process.exit(1); }

  log("");
  log("── NPC 성장 회귀 ─────────────────────────────────────────");
  let failed = 0;
  for (const c of targets) {
    const t0 = Date.now();
    try {
      const detail = await c.run();
      log(`  ok  ${c.id} ${c.name}`);
      log(`      ${detail}  (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    } catch (e) {
      failed++;
      log(`  FAIL ${c.id} ${c.name}`);
      log(`      ${String(e && e.message || e).split("\n").slice(0, 8).join("\n      ")}`);
    }
  }
  log("");
  log(failed === 0 ? "NPC 성장 회귀 통과" : `NPC 성장 회귀 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + (e && e.stack || e)); process.exit(1); });
