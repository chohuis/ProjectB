#!/usr/bin/env node
// ── 커리어 경로 회귀 ─────────────────────────────────────────────
//
// **결함 26건이 전부 "안 밟아본 자리"에서 나왔다.** 헤드리스가 늘 같은 한
// 갈래(고교→드래프트→프로)만 돌았기 때문이다. 대학 4학년 졸업·군 복무 왕복·
// 2군 강등·지명 거부는 코드만 있고 한 번도 실행된 적이 없었다.
//
// 여기서는 **경로별로 정책을 바꿔가며 실제로 끝까지 민다.** 판정은 "예외가
// 없다"가 아니라 "그 무대에 실제로 도달했는가"다 — 예외 없이 엉뚱한 데로
// 새는 게 지금까지의 실패 방식이었다.
//
//   node scripts/test-careerpaths.cjs            전체
//   node scripts/test-careerpaths.cjs --only T2  하나만
//
// 각 경로는 독립 슬롯을 쓰고, 실패해도 나머지를 계속 돈다.

const path = require("path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = 20260731;
const args = process.argv.slice(2);
const only = (() => { const i = args.indexOf("--only"); return i >= 0 ? args[i + 1] : null; })();
const verbose = args.includes("--verbose");

const log = (s) => process.stdout.write(s + "\n");
const vlog = (s) => { if (verbose) log("      " + s); };

// ── 공통 드라이버 ────────────────────────────────────────────────
//
// `rt2.cjs` 계열 스크립트가 매번 이 루프를 다시 적고 있었다. 한 곳에 둔다.
async function drive(app, opts) {
  const { maxSeasons = 8, until, onSeason } = opts;
  const start = app.currentSeason();
  let guard = 0;
  const trail = [];

  while (guard++ < 2000) {
    if (until && until(app)) return { hit: true, trail };
    if (app.retired()) return { hit: false, trail, reason: "은퇴" };
    if (app.currentSeason() - start >= maxSeasons) return { hit: false, trail, reason: "시즌 상한" };

    const before = app.currentWeek();
    if (opts.applyPolicy) opts.applyPolicy();
    await app.autoRun();               // 오류를 삼키지 않는다 (throw)
    if (app.currentWeek() > before) continue;

    if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }

    const stBefore = app.protagonistState();
    const decided = await app.pushCareerForward();
    if (decided) {
      trail.push(`${app.currentSeason()}W${before} ${decided}`);
      vlog(trail[trail.length - 1]);
      // ⚠ 결정 **직전** 상태를 넘긴다. 롤오버 뒤에 재면 이미 나이가 한 번
      // 올라 있어서 "2년 복무" 검사가 1년으로 보인다(실제로 그렇게 틀렸다)
      if (opts.onDecision) opts.onDecision(app, decided, stBefore);
      continue;
    }

    if (app.isSeasonEnded()) {
      const y = app.currentSeason();
      await app.seasonRollover();
      if (onSeason) onSeason(app, y);
      vlog(`[시즌] ${y}→${app.currentSeason()} ${JSON.stringify(app.protagonistState())}`);
      continue;
    }
    return { hit: false, trail, reason: `막힘 W${before} pending=${app.pendingKind()} stop=${app.stopReason()}` };
  }
  return { hit: false, trail, reason: "반복 상한" };
}

// ── 경로 정의 ────────────────────────────────────────────────────
//
// `check`는 **도달했는지**를 본다. throw하면 실패다.
const PATHS = [
  {
    id: "T1",
    name: "대학 4년 → 졸업 → 드래프트 → 프로",
    // 고교에서는 드래프트를 안 넣고 대학만 넣는다. 대학에 들어가면
    // 드래프트를 넣는다 — "대학 경유 → 프로"가 이 경로의 정의다.
    policy: (stage) => stage === "highschool"
      ? { draft: false, university: true, independent: false }
      : { draft: true, university: false, independent: false },
    maxSeasons: 12,
    until: (a) => a.careerStage().startsWith("pro"),
    check(app, r) {
      if (!r.hit) throw new Error(`프로에 도달 못 함 — ${r.reason}`);
      const seen = r.trail.join(" ");
      if (!/careerChoice\(university\)/.test(seen)) throw new Error("대학 진학을 안 거쳤다");
      const st = app.protagonistState();
      if (st.proServiceYears == null) throw new Error("proServiceYears 없음");
      return `대학 경유 → ${st.team} (${st.age}세)`;
    },
    // 대학 재학 중 학년이 실제로 올라갔는지 같이 본다
    watch(app, out) {
      const st = app.protagonistState();
      if (st.stage === "university" && st.grade != null) out.grades.add(st.grade);
    },
  },
  {
    id: "T2",
    name: "즉시 입대 → 복무 → 전역 → 복귀",
    policy: { enlistNow: true },
    maxSeasons: 10,
    until: (a) => {
      const st = a.protagonistState();
      return st.militaryStatus === "군필" || st.stage !== "military" && st.serviceWeeks > 0;
    },
    // ⚠ 검사가 약하면 **엉뚱한 결말을 통과시킨다.** 처음엔 "stage != military"와
    // "militaryStatus != 미필"만 봤는데, 21세가 고등학교로 돌아가고 연도·나이가
    // 안 오른 상태를 그대로 ok로 찍었다. 전역은 세 가지를 동시에 만족해야 한다.
    check(app, r, out) {
      const st = app.protagonistState();
      if (st.stage === "military") throw new Error(`복무 중에서 안 벗어났다 (${st.serviceWeeks}주)`);
      if (st.militaryStatus === "미필") throw new Error(`전역 처리가 안 됐다 — status=${st.militaryStatus}`);
      // ① 학교로 돌아가지 않는다 (careerTransition이 "고교 재입학 불가"를 명시)
      if (st.stage === "highschool" || st.stage === "university") {
        throw new Error(`전역 후 학교로 돌아갔다 — stage=${st.stage} (${st.age}세)`);
      }
      // ② 단계와 리그가 짝이 맞는다
      const LEAGUE_OF = { independent: "LEAGUE_INDEPENDENT", pro_kbl: "LEAGUE_KBL" };
      const want = LEAGUE_OF[st.stage];
      if (want && st.league !== want) throw new Error(`단계와 리그가 어긋난다 — ${st.stage} / ${st.league}`);
      // ③ 복무한 만큼 세계가 흘렀다 (52주 시즌 × 2)
      if (out.enlistAge != null && st.age - out.enlistAge < 2) {
        throw new Error(`복무 2년인데 나이가 ${out.enlistAge}→${st.age} — 세계가 안 흘렀다`);
      }
      return `전역 → ${st.stage}/${st.league} (${st.militaryStatus}, ${out.enlistAge}→${st.age}세)`;
    },
    onDecision(app, decided, stBefore, out) {
      if (decided.includes("enlist") && out.enlistAge == null) out.enlistAge = stBefore.age;
    },
  },
  {
    id: "T4",
    name: "지명 거부 → 대안 경로",
    policy: { draft: true, university: true, independent: true, rejectDraft: true },
    maxSeasons: 8,
    until: (a) => ["university", "independent", "military"].includes(a.careerStage()),
    check(app, r) {
      if (!r.hit) throw new Error(`대안 경로에 도달 못 함 — ${r.reason}`);
      const seen = r.trail.join(" ");
      if (!/reject/.test(seen)) throw new Error("거부 경로를 안 탔다");
      return `거부 → ${app.careerStage()}`;
    },
  },
  {
    id: "T5",
    name: "미지명·갈 곳 없음 → 현역 입대",
    // 드래프트만 넣고 폴백을 비운다 — 미지명이면 갈 곳이 없다
    policy: { draft: true, university: false, independent: false },
    maxSeasons: 8,
    until: (a) => a.careerStage() === "military" || a.careerStage().startsWith("pro"),
    check(app, r) {
      if (!r.hit) throw new Error(`결말에 도달 못 함 — ${r.reason}`);
      // 지명을 받았으면 그것대로 정상이다 (폴백은 미지명일 때만 의미가 있다)
      return app.careerStage() === "military" ? "미지명 → 현역 입대" : "지명받음 (폴백 미발동)";
    },
  },
  {
    id: "T6",
    name: "독립리그 → 재지명 → 프로",
    // 고교에서는 독립만, 독립에 들어가면 드래프트를 넣는다.
    // (전 단계 draft:false로 두면 독립에서 재지원을 안 해 영영 프로에 못 간다 —
    //  T1과 같은 배선 오류였다)
    policy: (stage) => stage === "highschool"
      ? { draft: false, university: false, independent: true }
      : { draft: true, university: false, independent: false },
    maxSeasons: 12,
    until: (a) => a.careerStage().startsWith("pro"),
    check(app, r) {
      const st = app.protagonistState();
      if (!r.hit) throw new Error(`프로 재지명에 도달 못 함 (지금 ${st.stage}) — ${r.reason}`);
      if (!r.trail.join(" ").includes("independent")) throw new Error("독립리그를 안 거쳤다");
      return `독립 경유 → ${st.team}`;
    },
  },
];

// ── 실행 ─────────────────────────────────────────────────────────
(async () => {
  const targets = only ? PATHS.filter((p) => p.id === only) : PATHS;
  if (targets.length === 0) { log(`[경로회귀] --only ${only} 는 없는 경로다`); process.exit(1); }

  log("");
  log("── 커리어 경로 회귀 ──────────────────────────────────────");
  let failed = 0;

  for (const p of targets) {
    const t0 = Date.now();
    let tmp = null;
    try {
      const boot = await headless.boot(p.id.toLowerCase());
      tmp = boot.tmp;
      const app = boot.app;
      await app.boot({ slotId: p.id, worldSeed: SEED, seasonYear: 2026 });
      const applyPolicy = () => app.setCareerPolicy(
        typeof p.policy === "function" ? p.policy(app.careerStage()) : p.policy);
      applyPolicy();

      const out = { grades: new Set(), enlistAge: null };
      const r = await drive(app, {
        maxSeasons: p.maxSeasons,
        until: p.until,
        applyPolicy,
        onSeason: p.watch ? (a) => p.watch(a, out) : undefined,
        onDecision: p.onDecision ? (a, d, st) => p.onDecision(a, d, st, out) : undefined,
      });
      const detail = p.check(app, r, out);
      log(`  ok  ${p.id} ${p.name}`);
      log(`      ${detail}  (${((Date.now() - t0) / 1000).toFixed(1)}초)`);
    } catch (e) {
      failed++;
      log(`  FAIL ${p.id} ${p.name}`);
      log(`      ${String(e && e.message || e).split("\n").slice(0, 6).join("\n      ")}`);
    } finally {
      if (tmp) headless.cleanup(tmp);
    }
  }

  log("");
  log(failed === 0 ? "커리어 경로 회귀 통과" : `커리어 경로 회귀 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + (e && e.stack || e)); process.exit(1); });
