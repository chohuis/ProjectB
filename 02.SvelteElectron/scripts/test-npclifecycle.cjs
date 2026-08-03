#!/usr/bin/env node
// ── NPC 생애 추적 ────────────────────────────────────────────────
//
// **표시한 선수를 여러 시즌 따라가며 개인 이력이 앞뒤가 맞는지 본다.**
//
// ⚠ 기존 검사는 전부 집계다 — 누적 은퇴 수, 연령 분포, FA·트레이드 건수,
// 리그별 인원. 그런데 이 작업에서 잡은 결함(세이브 0, 도루 0, 병역 정원 누수,
// CP 미생성)이 **전부 집계로는 정상**이었다. 총원·평균·건수는 맞는데
// 개인의 이력이 어긋나는 층이 따로 있다:
//
//   · 팀을 옮겼는데 옛 팀에 그대로 있다 (총원이 맞아 안 보인다)
//   · 은퇴했는데 다음 시즌 다시 뛴다
//   · 커리어 이벤트는 `trade`인데 소속은 안 바뀐다
//   · 나이가 한 해 안 먹거나 두 살 먹는다
//   · 없는 팀으로 간다 (실제로 있었던 결함이다 — TEAM_SPORTS_UNIT)
//
// 주인공도 코호트에 넣는다. **주인공만 다른 경로를 타는지**가 핵심이다 —
// 이 작업에서 은퇴·면제·수상이 전부 "NPC는 되는데 주인공은 안 되는" 결함이었다.
//
//   npm run test:npclifecycle
//   node scripts/test-npclifecycle.cjs --seasons 10 --verbose

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 8);
const SEED = arg("seed", 20260803);
const verbose = process.argv.includes("--verbose");

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
const problems = [];
function check(name, bad, sample) {
  if (bad === 0) { log(`  ok  ${name}`); return; }
  failed++;
  log(`FAIL  ${name} — ${bad}건`);
  for (const s of (sample ?? []).slice(0, 3)) log(`        ${s}`);
}

// 추적 대상. **주인공은 pickCohort가 항상 넣는다**
const COHORT = {
  "LEAGUE_HIGHSCHOOL:1": 20,
  "LEAGUE_HIGHSCHOOL:2": 20,
  "LEAGUE_HIGHSCHOOL:3": 20,
  "LEAGUE_UNIVERSITY": 10,
  "LEAGUE_INDEPENDENT": 10,
  "LEAGUE_KBL": 10,
  "LEAGUE_ABL": 10,
  "LEAGUE_JBL": 10,
};

// 리그 이동이 말이 되는가. **없는 경로로 점프하면 잡는다**
//
// 고교 → 대학·독립·프로2군(드래프트)·상무·은퇴가 정상이다.
// 고교 → 프로 1군 직행은 드래프트 상위 지명이라 허용한다(`firstTeamRounds`).
const OK_MOVE = {
  LEAGUE_HIGHSCHOOL: ["LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL",
    "LEAGUE_KBL_FARM", "LEAGUE_DRAFT_POOL", "LEAGUE_RETIRED", "LEAGUE_MILITARY"],
  LEAGUE_UNIVERSITY: ["LEAGUE_INDEPENDENT", "LEAGUE_KBL", "LEAGUE_KBL_FARM",
    "LEAGUE_DRAFT_POOL", "LEAGUE_RETIRED", "LEAGUE_MILITARY"],
  LEAGUE_INDEPENDENT: ["LEAGUE_KBL", "LEAGUE_KBL_FARM", "LEAGUE_DRAFT_POOL",
    "LEAGUE_RETIRED", "LEAGUE_MILITARY", "LEAGUE_UNIVERSITY"],
  LEAGUE_KBL: ["LEAGUE_KBL_FARM", "LEAGUE_INDEPENDENT", "LEAGUE_RETIRED",
    "LEAGUE_MILITARY", "LEAGUE_ABL", "LEAGUE_JBL"],
  LEAGUE_KBL_FARM: ["LEAGUE_KBL", "LEAGUE_INDEPENDENT", "LEAGUE_RETIRED",
    "LEAGUE_MILITARY", "LEAGUE_DRAFT_POOL"],
  LEAGUE_ABL: ["LEAGUE_ABL_FARM", "LEAGUE_KBL", "LEAGUE_JBL", "LEAGUE_RETIRED"],
  LEAGUE_JBL: ["LEAGUE_JBL_FARM", "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_RETIRED"],
  LEAGUE_ABL_FARM: ["LEAGUE_ABL", "LEAGUE_RETIRED", "LEAGUE_INDEPENDENT"],
  LEAGUE_JBL_FARM: ["LEAGUE_JBL", "LEAGUE_RETIRED", "LEAGUE_INDEPENDENT"],
  LEAGUE_MILITARY: ["LEAGUE_INDEPENDENT", "LEAGUE_KBL", "LEAGUE_KBL_FARM",
    "LEAGUE_RETIRED", "LEAGUE_UNIVERSITY"],
  LEAGUE_DRAFT_POOL: ["LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL",
    "LEAGUE_KBL_FARM", "LEAGUE_RETIRED", "LEAGUE_MILITARY"],
};

(async () => {
  log("");
  log("── NPC 생애 추적 ────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("npclife");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "NPCLIFE", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: true, independent: true });

    const cohort = app.pickCohort(COHORT, SEED);
    const ids = cohort.map((c) => c.id);
    const labelOf = new Map(cohort.map((c) => [c.id, c.label]));
    log(`      추적 ${ids.length}명 (주인공 포함)`);
    // ⚠ 해외는 출시 범위 밖이라 로스터가 없을 수 있다 — 몇 명 잡혔는지 찍는다
    const byLabel = {};
    for (const c of cohort) byLabel[c.label] = (byLabel[c.label] ?? 0) + 1;
    log(`      ${Object.entries(byLabel).map(([k, v]) => `${k}:${v}`).join(" · ")}`);

    // 시즌별 스냅샷
    const hist = [];   // [{ year, snap }]
    let guard = 0;
    while (guard++ < 6000) {
      if (hist.length >= SEASONS) break;
      if (app.retired() && hist.length >= 1) {
        // 주인공이 은퇴해도 세계는 계속 돈다 — NPC 추적을 이어간다
      }
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        hist.push({ year: app.currentSeason(), snap: app.cohortSnapshot(ids) });
        await app.seasonRollover();
        continue;
      }
      break;
    }
    if (hist.length < 2) { log(`시즌을 ${hist.length}번밖에 못 넘겼다`); failed++; return; }
    log(`      ${hist[0].year}~${hist[hist.length - 1].year} · ${hist.length}시즌`);

    // ⚠ **연도가 건너뛰는 건 정상일 수 있다.**
    //
    // 주인공이 드래프트를 수락하면 `careerDecision`이 그 해 세계를 닫고
    // (`runWorldSeasonEnd`) 다음 해를 연다 — 그러면 이 루프가 그 해의
    // `isSeasonEnded()`를 못 본다. **세계는 정상적으로 처리됐고 수집만 건너뛴다.**
    //
    // 처음엔 이걸 "한 해가 통째로 사라진다"는 결함으로 읽고 `advanceSeasonYear`에
    // 가드까지 넣었다. 근거 없는 추측이었다 — 검사가 관측 못 한 것과 일어나지
    // 않은 것은 다르다.
    //
    // 뒤로 가거나 3년 이상 뛰면 그건 진짜 이상이다.
    const skipped = [];
    for (let i = 1; i < hist.length; i++) {
      const d = hist[i].year - hist[i - 1].year;
      if (d < 1 || d > 2) skipped.push(`${hist[i - 1].year} → ${hist[i].year} (${d}년)`);
    }
    check("연도가 뒤로 가거나 크게 뛰지 않는다", skipped.length, skipped);

    // ── 개인별 이력 검사 ────────────────────────────────────
    const bad = {
      나이: [], 경로: [], 팀없음: [], 은퇴후부활: [], 소속유령: [], 성장역전: [],
    };

    for (const id of ids) {
      const label = labelOf.get(id);
      let retiredAt = null;
      for (let i = 1; i < hist.length; i++) {
        const prev = hist[i - 1].snap[id];
        const cur = hist[i].snap[id];
        if (!prev || !cur) continue;
        const y = hist[i].year;
        const who = `${label} ${id.slice(-6)}`;

        // ① 나이는 **지난 햇수만큼** 는다
        //
        // ⚠ 처음엔 "매년 한 살"로 봤는데, 스냅샷이 매년 찍히는 게 아니다 —
        // 드래프트 수락처럼 시즌을 중간에 닫는 경로가 있으면 한 해를 건너뛴다.
        // 그래서 **연도 차이와 나이 차이를 맞대야** 한다. 이걸 몰라
        // 50건을 결함으로 올렸다(전부 정상이었다).
        const years = hist[i].year - hist[i - 1].year;
        const d = (cur.나이 ?? 0) - (prev.나이 ?? 0);
        if (cur.상태 !== "retired" && d !== years) {
          bad.나이.push(`${who} ${y}: ${prev.나이}→${cur.나이} (${d >= 0 ? "+" : ""}${d}, ${years}년 경과)`);
        }

        // ② 리그 이동이 유효한 경로인가
        if (prev.리그 !== cur.리그) {
          const ok = OK_MOVE[prev.리그];
          if (ok && !ok.includes(cur.리그)) {
            bad.경로.push(`${who} ${y}: ${prev.리그} → ${cur.리그}`);
          }
        }

        // ③ 소속 팀이 실재하는가
        if (!cur.팀존재) bad.팀없음.push(`${who} ${y}: 팀 ${cur.팀}`);

        // ④ 은퇴 후 다시 뛰지 않는가
        if (cur.상태 === "retired" && retiredAt == null) retiredAt = y;
        if (retiredAt != null && cur.상태 !== "retired") {
          bad.은퇴후부활.push(`${who} ${retiredAt} 은퇴 → ${y} ${cur.상태}`);
          retiredAt = null;
        }

        // ⑤ 활동 중인데 소속이 없다
        //
        // ⚠ **복무 중은 예외다.** 일반병 입대자는 `LEAGUE_MILITARY` + 팀 없음이
        // 의도된 설계다(`stores/game.ts` 일반병 강제 입대). 처음엔 이걸 몰라
        // 10건을 결함으로 올렸다 — 검사가 설계를 모르면 멀쩡한 걸 잡는다.
        const inService = cur.상태 === "military" || cur.리그 === "LEAGUE_MILITARY";
        if (cur.상태 !== "retired" && cur.리그 !== "LEAGUE_RETIRED" && !inService && !cur.팀) {
          bad.소속유령.push(`${who} ${y}: ${cur.리그} 팀없음`);
        }

        // ⑥ 성장 방향 — 10대~20대 초반에 크게 떨어지면 이상하다
        //    (부상 후유증이 있으니 폭을 넉넉히 준다. **방향만** 본다)
        if (cur.상태 !== "retired" && (cur.나이 ?? 0) <= 23 && prev.ovr > 0) {
          if (cur.ovr < prev.ovr - 8) {
            bad.성장역전.push(`${who} ${y}: ${cur.나이}세인데 OVR ${prev.ovr}→${cur.ovr}`);
          }
        }
      }
      if (verbose) {
        const arc = hist.map((h) => {
          const v = h.snap[id];
          return v ? `${h.year}:${(v.리그 ?? "").replace("LEAGUE_", "")}/${v.나이}세/${v.ovr}` : `${h.year}:-`;
        }).join("  ");
        log(`      ${label} ${id.slice(-6)}  ${arc}`);
      }
    }

    check("나이가 매년 한 살씩 는다", bad.나이.length, bad.나이);
    check("리그 이동이 유효한 경로다", bad.경로.length, bad.경로);
    check("소속 팀이 실재한다", bad.팀없음.length, bad.팀없음);
    check("은퇴 후 다시 뛰지 않는다", bad.은퇴후부활.length, bad.은퇴후부활);
    check("활동 중이면 소속이 있다", bad.소속유령.length, bad.소속유령);
    check("어린 선수가 급락하지 않는다", bad.성장역전.length, bad.성장역전);

    // ── 흐름 요약 — 세계가 실제로 돌았는가 ──────────────────
    const last = hist[hist.length - 1].snap;
    const first = hist[0].snap;
    let moved = 0, retired = 0, stayed = 0;
    for (const id of ids) {
      const a = first[id], b = last[id];
      if (!a || !b) continue;
      if (b.상태 === "retired") retired++;
      else if (a.리그 !== b.리그) moved++;
      else stayed++;
    }
    log("");
    log(`      ${hist.length}시즌 뒤 — 리그이동 ${moved} · 은퇴 ${retired} · 제자리 ${stayed}`);
    // ⚠ **아무도 안 움직이면 세계가 멈춘 것이다.** 8시즌이면 고교생은
    // 전원 졸업해서 어디론가 가야 한다
    check("추적 대상이 실제로 움직인다", moved + retired === 0 ? 1 : 0,
      [`이동 0 · 은퇴 0 — 세계가 멈췄다`]);
  } catch (e) {
    failed++;
    log(`FAIL  ${String((e && e.message) || e).split("\n").slice(0, 6).join("\n      ")}`);
  } finally {
    if (tmp) headless.cleanup(tmp);
  }

  log("");
  log(failed === 0 ? "NPC 생애 추적 통과" : `NPC 생애 추적 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + ((e && e.stack) || e)); process.exit(1); });
