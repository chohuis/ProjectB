"use strict";
/**
 * D 계측(2026-09-07) — 주당 「고르는 것」이 몇 개 뜨는가, 무대별로.
 *
 * 🔴 게임 코드·데이터는 안 건드린다 — 여기와 `perfEntry.ts`의
 *   `armWeeklyChoiceLog`/`weeklyChoiceLogDump`/`eventEmittedByRuleFull`만
 *   새로 얹은 계기다.
 *
 * `runAutoAdvance`는 사건 결정(`type:"message"`)을 **한 틱 안에서 조용히
 * 자동으로 골라 버린다** — 밖에서 `pendingKind()`로 훑으면 하나도 안
 * 보인다. 실제(수동) 플레이는 `advanceWeek`의 "미결정 메시지 확인"
 * 블록이 **미결 선택지가 하나라도 있으면 그 주를 막는다** — 그래서
 * "몇 개가 뜨는가"·"멈췄는가"는 pendingKind()가 아니라 **소식함에 실제로
 * 뭐가 새로 들어왔는가**로 잰다(`armWeeklyChoiceLog`가 store 구독으로
 * 주 경계마다 찍는다 — `autoRun()` 한 틱이 여러 주를 삼켜도 놓치지 않는다).
 *
 * 시스템 경로(계약·FA·진로 등)는 `STOP_PENDING`이라 `runAutoAdvance`가
 * 실제로 멈추고 돌아온다 — 그건 기존 `probe-paths.cjs`와 같은 방식으로
 * 바깥 루프에서 그대로 잡는다.
 *
 *   PF_SEED=20260802 PF_YEARS=7 npm run probe:d:wc -- --path univ
 */
const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const YEARS = Number(process.env.PF_YEARS || 12);

const PATHS = {
  // 🔴 **`overseas` 는 네 줄 다 적는다** (2026-09-07).
  //
  //   기본이 true(DEFAULT_POLICY)인데다 해외 2군은 2026-09-02 부터
  //   **신청이 아니라 제안**이라(허브에서 안 골라도 온다) 안 끄면 어느
  //   경로로 돌리든 해외 2군이 먼저 뽑힌다 — "indie" 라벨로 돌린 판이
  //   실제로는 해외 2군 55주를 쟀다.
  //
  //   ⚠ **끈다고 안 끝났다.** `overseas: false` 를 적어도 `perfEntry` 의
  //     선택 갈래가 정책을 안 보고 있어 여전히 해외로 갔다(D 실측 2판).
  //     그건 같은 날 `perfEntry.pushCareerForward` 에서 고쳤다 —
  //     **여기만 고쳤으면 라벨과 실제가 계속 갈렸다.**
  indie: { draft: false, university: false, independent: true,  overseas: false },
  univ:  { draft: false, university: true,  independent: false, overseas: false },
  pro:   { draft: true,  university: false, independent: false, overseas: false },
  mil:   { draft: false, university: false, independent: false, overseas: false },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "univ";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

// ── 규칙 메타 (게임 데이터 파일을 그대로 읽기만 한다 — 고치지 않는다) ──
const EV_ROOT = path.join(process.cwd(), "resource/data/master/events");
function loadDir(dir) {
  const full = path.join(EV_ROOT, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(full, f), "utf8")));
}
const ruleMeta = new Map(); // ruleId -> { type, tier, poolId }
for (const r of loadDir("mandatory"))   ruleMeta.set(r.id, { type: "mandatory",   tier: r.tier || null, poolId: null });
for (const r of loadDir("conditional")) ruleMeta.set(r.id, { type: "conditional", tier: r.tier || null, poolId: null });
for (const sub of ["media", "social", "team_life"]) {
  for (const r of loadDir(`random/${sub}`)) ruleMeta.set(r.id, { type: "random", tier: r.tier || null, poolId: r.poolId || null });
}

function ruleIdOf(msgId) {
  const m = /^evt-(.+)-\d{4}-w\d+$/.exec(msgId);
  return m ? m[1] : null;
}

// 실제(수동) 진행을 막는 시스템 pendingAction — runAutoAdvance.ts STOP_PENDING과 동일
const STOP_PENDING = new Set([
  "careerChoiceHub", "careerResults", "careerChoice", "draftObserve", "draftNotification",
  "retirementAsk", "salaryNegotiation", "optionClause", "faMarket", "trade",
]);

function stageKeyOf(stage, grade, farm) {
  if (stage === "highschool") return `hs_g${grade ?? "?"}`;
  if (stage === "university") return "university";
  if (stage === "independent") return "independent";
  if (stage === "military") return "military";
  if (/^pro/.test(stage)) return farm ? "pro_farm" : "pro_top";
  return stage;
}

(async () => {
  const { app, tmp } = await headless.boot(`wc-${PATH_KEY}`);
  const systemStops = []; // { year, week, stageKey, kind }
  let why = "완주";
  try {
    await app.boot({ slotId: "PP", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    app.armWeeklyChoiceLog();
    app.resetEventFunnel();

    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      if (app.currentWeek() > w0 || app.currentSeason() > s0) continue;
      const kind = app.pendingKind();
      if (kind && STOP_PENDING.has(kind)) {
        const sig = app.pathSignals();
        const wsd = app.weekStageDump();
        systemStops.push({
          year: sig.year, week: sig.week,
          stageKey: stageKeyOf(sig.stage, wsd.grade, sig.farm),
          kind,
        });
      }
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushPendingForward()) continue;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0} pending=${kind}`; break; }
    }
  } catch (e) {
    why = `예외 ${(e && e.stack) || e}`;
  }

  const log = app.weeklyChoiceLogDump();

  // ── 무대별 집계 ──────────────────────────────────────────────
  const stages = new Map(); // stageKey -> { weekSet, perWeek: Map<wk,{event:{mandatory,conditional,urgent,random,byPool},system,readonly}>, maxChoices, stalledWeeks }
  function stageOf(k) {
    if (!stages.has(k)) stages.set(k, { weekSet: new Set(), perWeek: new Map() });
    return stages.get(k);
  }
  function wkOf(st, wk) {
    if (!st.perWeek.has(wk)) {
      st.perWeek.set(wk, {
        mandatory: 0, conditional: 0, urgent: 0, random: 0,
        byPool: {}, system: 0, readonly: 0,
      });
    }
    return st.perWeek.get(wk);
  }

  for (const row of log.weeks) {
    const sk = stageKeyOf(row.stage, row.grade, row.farm);
    const st = stageOf(sk);
    const wk = `${row.year}W${row.week}`;
    st.weekSet.add(wk);
  }

  for (const m of log.messages) {
    const sk = stageKeyOf(m.stage, m.grade, m.farm);
    const st = stageOf(sk);
    const wk = `${m.year}W${m.week}`;
    st.weekSet.add(wk);
    const rec = wkOf(st, wk);
    const isEvt = m.id.startsWith("evt-");
    if (m.decision) {
      if (isEvt) {
        const rid = ruleIdOf(m.id);
        const meta = rid ? ruleMeta.get(rid) : null;
        if (meta) {
          rec[meta.type] = (rec[meta.type] || 0) + 1;
          if (meta.tier === "urgent") rec.urgent++;
          if (meta.type === "random" && meta.poolId) {
            rec.byPool[meta.poolId] = (rec.byPool[meta.poolId] || 0) + 1;
          }
        } else {
          // evt- 이지만 규칙 메타를 못 찾음 — 사라졌거나 이름이 바뀐 규칙
          rec.conditional = (rec.conditional || 0) + 1;
        }
      } else {
        rec.system++;
      }
    } else {
      rec.readonly++;
    }
  }

  for (const s of systemStops) {
    const st = stageOf(s.stageKey);
    const wk = `${s.year}W${s.week}`;
    st.weekSet.add(wk);
    const rec = wkOf(st, wk);
    rec.system++;
  }

  const report = {};
  for (const [sk, st] of stages) {
    const weeks = st.weekSet.size;
    let sumEventChoice = 0, sumSystemChoice = 0, sumReadonly = 0, stalled = 0, maxChoice = 0;
    let sumMandatory = 0, sumConditional = 0, sumUrgent = 0, sumRandom = 0;
    const poolSums = {};
    for (const wk of st.weekSet) {
      const rec = st.perWeek.get(wk) || { mandatory: 0, conditional: 0, urgent: 0, random: 0, byPool: {}, system: 0, readonly: 0 };
      const eventChoice = (rec.mandatory || 0) + (rec.conditional || 0) + (rec.random || 0);
      const systemChoice = rec.system || 0;
      sumEventChoice += eventChoice;
      sumSystemChoice += systemChoice;
      sumReadonly += rec.readonly || 0;
      sumMandatory += rec.mandatory || 0;
      sumConditional += rec.conditional || 0;
      sumUrgent += rec.urgent || 0;
      sumRandom += rec.random || 0;
      for (const [pid, n] of Object.entries(rec.byPool || {})) poolSums[pid] = (poolSums[pid] || 0) + n;
      const totalChoice = eventChoice + systemChoice;
      if (totalChoice > 0) stalled++;
      if (totalChoice > maxChoice) maxChoice = totalChoice;
    }
    report[sk] = {
      weeks,
      avgEventChoice: weeks ? sumEventChoice / weeks : 0,
      avgSystemChoice: weeks ? sumSystemChoice / weeks : 0,
      avgReadonly: weeks ? sumReadonly / weeks : 0,
      stalledRatio: weeks ? stalled / weeks : 0,
      maxChoice,
      avgMandatory: weeks ? sumMandatory / weeks : 0,
      avgConditional: weeks ? sumConditional / weeks : 0,
      avgUrgent: weeks ? sumUrgent / weeks : 0,
      avgRandom: weeks ? sumRandom / weeks : 0,
      poolSums, // 절대건수 — 최종 표에서 여러 경로를 합쳐 주당 평균을 낼 때 weeks 합계로 나눈다
    };
  }

  const outDir = path.join(process.cwd(), "resource/logs/d-weekly-choices");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, `raw-${PATH_KEY}.json`), JSON.stringify({
    path: PATH_KEY, seed: SEED, years: YEARS, why,
    report, systemStopsCount: systemStops.length,
    weeksTotal: log.weeks.length, messagesTotal: log.messages.length,
  }, null, 2));

  console.log(`── ${PATH_KEY} (씨앗 ${SEED} · ${YEARS}시즌 상한) ──`);
  console.log(`[END] ${why}`);
  for (const [sk, r] of Object.entries(report)) {
    console.log(`  ${sk}: 주${r.weeks} 이벤트선택${r.avgEventChoice.toFixed(2)}/주 시스템선택${r.avgSystemChoice.toFixed(2)}/주 읽기${r.avgReadonly.toFixed(2)}/주 멈춘비율${(r.stalledRatio*100).toFixed(1)}% 최대${r.maxChoice}`);
  }
  await headless.cleanup(tmp);
})();
