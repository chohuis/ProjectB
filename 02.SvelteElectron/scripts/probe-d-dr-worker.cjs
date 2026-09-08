"use strict";
/**
 * DR 워커 — 프리셋·씨앗 **한 판**만 돈다. `probe-d-dr-draft.cjs`가 자식
 * 프로세스로 띄운다.
 *
 * ⚠ **한 프로세스 = 한 판이다.** `headless.boot()`가 부르는 `apps/desktop/main.cjs`는
 * node의 require 캐시를 타서, 같은 프로세스에서 두 번째로 `headless.boot()`를
 * 부르면 첫 판의 핸들러가 그대로 남는다(모듈 전역 상태가 안 끊긴다).
 * 프리셋마다 다른 주인공을 재는 이 계측은 판마다 새 프로세스가 안전하다.
 *
 * ⚠ **동시성 경고(2026-09-06 실사고)** — 오케스트레이터에서 여러 판을
 *   동시에 띄우면(동시성 2 이상 × 여러 스크립트 동시 실행) CPU 경합으로
 *   판마다 실제 걸리는 시간이 2~4배로 늘어 타임아웃에 전부 걸렸다(12판
 *   전부 "RESULT 못 읽음"). **한 번에 하나씩** 돌린다.
 *
 * 이 판이 고교 3~4년을 지나므로(DR 자체 목적), 같은 판에서 E2절(경기 출전이
 * 성장에 얼마나 기여하나)의 "고교" 행도 같이 뽑는다 — 오케스트레이터의
 * 코치 지시(2026-09-06): "E2 는 따로 돌리지 말고 DR·LOC 판에서 같이 뽑아라."
 * 훈련은 조건 없이 매주 돌므로 "경기 있던 주"와 "없던 주"의 스탯 증가분
 * 차이로 경기 1회의 증분을 역산한다(`probe-morale.cjs`와 같은 방식).
 *
 * 🔴 **훈련 몰빵은 DR 의 정본이 아니다(코치 정정 2026-09-06).** 결정 ⑭(시작
 *   능력치) 전후 비교는 **보통 플레이어가 그냥 두는 기본 훈련**(부팅 시
 *   기본 배정)을 기준으로 해야 한다 — 실제로 balanced 프리셋이 몰빵 전엔
 *   2R11P 지명이었는데 몰빵 뒤엔 대학합격으로 바뀌었다(드래프트가 훈련
 *   배분에 민감하다는 증거). 기본값은 **기본 훈련**이고, `PB_TRAIN_MONO=1`을
 *   주면 몰빵(주 슬롯만) 모드로 돈다 — 두 값을 다 재서 "훈련 배분 민감도"로
 *   나란히 남긴다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
const PRESET = process.env.PB_START_PRESET || "balanced";
const POLICY = { draft: true, university: true, independent: true };
const velKmh = (v) => Math.round((100 + v * 0.65) * 10) / 10;
const stat3 = (a) => (a.velocity ?? 0) + (a.command ?? 0) + (a.control ?? 0);
const avg = (v) => v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 1000) / 1000 : null;

(async () => {
  const { app, tmp } = await headless.boot(`dr-${PRESET}-${SEED}`);
  let why = "미도달(4시즌 안에 결판 안 남)";
  /** 주가 안 넘어간 판의 `autoAdvanceStore.stopReason` — 「정지」의 사유다 */
  let stopWhy = null;
  /** 주·시즌이 **연속으로** 안 움직였나 — 셈은 `perf/weekLoop.cjs` 가 갖는다 */
  const stallGuard = makeStallGuard();
  let lastCareer = null;
  // E2용 — 주 슬롯 몰빵 훈련 기준 고교 등판주/없는주 스탯 증가분
  const e2 = { 등판주: [], 없는주: [], 게임수: [], 연간: [] };
  let prevStat = null, prevG = 0;
  try {
    await app.boot({ slotId: "DR" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    const first = await app.trainingProbe();
    if (process.env.PB_TRAIN_MONO === "1") app.setTrainingSlots([first.계획[0]]);
    prevStat = stat3(app.protagonistAbilities());
    const start = app.currentSeason();
    let guard = 0;
    // ⚠ **`careerResults`는 선택이 확정되면 지워진다** — `chooseDraft`/
    //   `chooseSchoolOrIndependent`가 `gameStore.clearCareerResults()`를
    //   부른다(`careerDecision.ts`). 그래서 "무대가 바뀐 뒤"에 `careerProbe()`를
    //   찍으면 지명/대학합격/독립합격이 전부 null로 되돌아간 걸 보게 된다
    //   (실측 2026-09-06 — balanced 프리셋 판이 그렇게 나왔다). **바뀌기 전
    //   마지막으로 본 값**을 따로 들고 있는다.
    while (guard++ < 4 * 52 * 40) {
      const cpNow = app.careerProbe();
      if (cpNow.지명 != null || cpNow.대학합격 != null || cpNow.독립합격 != null) lastCareer = cpNow;
      const stage = app.protagonistState().stage;
      const mil = app.pathSignals().military;
      if (stage !== "highschool" || mil === "현역" || mil === "군필") { why = "완주"; break; }
      if (app.currentSeason() - start >= 4) { why = "4시즌 넘김"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      // ⚠ **막는 것을 하나라도 치웠으면 정지 셈을 0 으로 되돌린다.** 한 주에
      //   정지 pending 이 연달아 셋 뜨는 자리가 있다(진로 허브 → 결과 → 지명 통보).
      //   그때마다 `runOneWeek` 이 주를 안 넘기고 돌아오므로, 되돌리지 않으면
      //   **정상 경로가 STUCK_LIMIT 을 채운다**
      if (app.pendingKind() === "draftObserve") { stallGuard.hit(true); await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) { stallGuard.hit(true); continue; }
      if (await app.pushPendingForward()) { stallGuard.hit(true); continue; } // salaryNegotiation 등 계약 후속
      if (app.isSeasonEnded()) {
        const st = app.protagonistStatProbe();
        // ⚠ 선발 등판(`선발`)도 남긴다 — 결정 ⑭ 가 「1학년이 선발을 잡나」를
        //   이 값으로 잰다(OVR 을 내리면 자리 경쟁이 따라 움직인다)
        if (st && st.역할 === "투수" && (st.경기 ?? 0) > 0) e2.연간.push({ g: st.경기, ip: st.ip, gs: st.선발 ?? 0 });
        await app.seasonRollover();
        prevG = 0; prevStat = stat3(app.protagonistAbilities());
        continue;
      }
      await app.runOneWeek(); // ⚠ E2 주별 델타를 재려면 한 주씩 가야 한다(autoRun은 여러 주를 건너뛴다)
      const w1 = app.currentWeek(), s1 = app.currentSeason();
      if (s1 === s0) {
        const stAfter = app.protagonistStatProbe();
        const gNow = (stAfter && stAfter.역할 === "투수") ? (stAfter.경기 ?? 0) : 0;
        const gDelta = gNow - prevG; prevG = gNow;
        const curStat = stat3(app.protagonistAbilities());
        const delta = curStat - prevStat; prevStat = curStat;
        if (gDelta > 0) { e2.등판주.push(delta); e2.게임수.push(gDelta); } else e2.없는주.push(delta);
      }
      // 🔴 **주가 안 넘어갔다고 곧바로 「정지」로 적지 않는다** (2026-09-08 · A).
      //   `advanceWeek` 은 주를 안 넘긴 채 **정지 pending 을 밀어넣고** 돌아오는
      //   경로가 여럿이다(연봉협상·FA·트레이드·은퇴 권고·체육부대 …). 사람이면
      //   모달을 눌러 넘어가는 정상 경로인데, 예전 이 줄은 그때도 똑같이
      //   「정지」라고 적고 판을 끝냈다 — 위 `pushCareerForward`·
      //   `pushPendingForward` 가 처리할 기회를 **안 주고** 끊은 것이다.
      //   한 바퀴 더 돌려 보고, **연속으로** 아무것도 안 움직일 때만 적는다.
      if (stallGuard.hit(w1 !== w0 || s1 !== s0)) { why = `정지 ${s0}W${w0}`; stopWhy = app.stopReason(); break; }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  const cp = lastCareer || app.careerProbe();
  const ab = app.protagonistAbilities();
  const result = {
    preset: PRESET, seed: SEED, why, stopWhy,
    // 🔴 **삼킨 예외 횟수** (2026-09-09 · 계측 2-1). 0 이 아니면 이 판의 숫자는
    //   의심해야 한다 — `runAutoAdvance` 는 예외를 잡아 stopReason 에만 남긴다
    예외: app.exceptionProbe(),
    trainMode: process.env.PB_TRAIN_MONO === "1" ? "몰빵" : "기본",
    지명: cp.지명 ?? null, 대학합격: cp.대학합격 ?? null, 독립합격: cp.독립합격 ?? null,
    병역: cp.병역 ?? null, ovr: ab.ovr ?? null, velocity: ab.velocity ?? null,
    velKmh: velKmh(ab.velocity ?? 0),
    e2고교: {
      연간등판: avg(e2.연간.map((x) => x.g)), 연간이닝: avg(e2.연간.map((x) => x.ip)), 표본시즌: e2.연간.length,
      // 결정 ⑭ — 학년별로 본다. 첫 칸이 1학년이다
      시즌별: e2.연간.map((x) => ({ 등판: x.g, 선발: x.gs ?? 0, 이닝: Math.round(x.ip * 10) / 10 })),
      없는주: avg(e2.없는주), 없는주n: e2.없는주.length,
      등판주: avg(e2.등판주), 등판주n: e2.등판주.length,
      주당게임: avg(e2.게임수),
    },
  };
  await headless.cleanup(tmp);
  console.log("RESULT " + JSON.stringify(result));
})();
