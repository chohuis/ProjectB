#!/usr/bin/env node
// ── 훈련 실측 (Phase 0) ───────────────────────────────────────────
//
//   npm run measure:training
//   node scripts/measure-training.cjs --weeks 160
//
// **고치기 전에 숫자를 잡는다.** 지금은 화면과 엔진이 서로 다른 값을 쓰는
// 상태라(화면 피로 +7 / 엔진 −4.25) "좋아졌다"를 잴 기준이 아예 없다.
//
// 잡는 것:
//   ① 주인공 OVR 궤적 — NPC 목표 곡선(고교 3년 55→68)과 대조할 값
//   ② 스탯별 상승 분해 — 어느 스탯이 실제로 크는가
//   ③ 피로 궤적 — 구간 승수(70/80/90에서 1.5/2.5/4.0)에 실제로 걸리는가
//   ④ **focus 배선** — 화면 id가 마스터에 없어 조회가 죽는지 런타임 확인
//
// ⚠ 판정이 아니라 계측이다. 여기 숫자를 보고 수치를 정하는 건 사람이다.
//
// 설계: docs/design/training.md §4 Phase 0

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const WEEKS = arg("weeks", 160);
const SEED = arg("seed", 20260808);

const log = (s) => process.stdout.write(s + "\n");
const pad = (s, n) => String(s).padEnd(n);
const num = (v, n = 4) => String(v).padStart(n);

(async () => {
  log("");
  log("── 훈련 실측 ─────────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("training");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "TRN", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const first = await app.trainingProbe();
    log(`  시작   ${first.단계} ${first.나이}세 · OVR ${first.OVR}`);
    log(`  계획   ${JSON.stringify(first.계획)}`);
    log("");

    // ── 배선 확인 (P0-5) ────────────────────────────────────────
    log("  ── focus 배선 ──");
    log(`    마스터 프로그램 ${first["마스터 프로그램 수"]}종`);
    log(`    주 프로그램      ${first.계획[0]}`);
    log(`    → focus          ${first["주 프로그램 focus"] ?? "null  ← 마스터에 그 id가 없다"}`);
    log(`    → trainingArea   ${first.trainingArea === "" ? '""    ← 코치 담당영역 보너스가 죽는다' : first.trainingArea}`);
    log("");

    // ⚠ 경과 주는 직접 센다 — `currentWeek()`은 시즌마다 리셋된다
    const marks = [];
    let guard = 0, elapsed = 0;
    let prevOvr = first.OVR;
    const health = { totalWeeks: 0, highFatigueWeeks: 0, lowConditionWeeks: 0, injuryCount: 0 };

    while (guard++ < WEEKS * 40 && elapsed < WEEKS) {
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.retired()) { log(`  (은퇴 — ${elapsed}주)`); break; }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      // ⚠ **`seasonHealth`는 시즌마다 리셋된다.** 마지막 값만 보면 "총 40주"가
      // 나오는데 실제로는 191주를 돌았다 — 커리어 전체를 말하려면 넘어가기
      // **직전에** 걷어야 한다. (그냥 마지막 값을 쓰면 5분의 1만 보고 말한다.)
      if (app.isSeasonEnded()) {
        const beforeRoll = await app.trainingProbe();
        if (beforeRoll.건강) {
          health.totalWeeks       += beforeRoll.건강.totalWeeks;
          health.highFatigueWeeks += beforeRoll.건강.highFatigueWeeks;
          health.lowConditionWeeks += beforeRoll.건강.lowConditionWeeks;
          health.injuryCount      += beforeRoll.건강.injuryCount;
        }
        await app.seasonRollover();
        continue;
      }
      // ⚠ `autoRun`은 한 번에 여러 주를 밀고 간다. 그래서 **여기서 찍는 값은
      // 표본이지 전수가 아니다** — 191주에 표본이 12개였다. 피로처럼 주마다
      // 오르내리는 것은 이 표본으로 말하면 안 된다. 아래에서 게임이 매주 세는
      // `seasonHealth` 카운터를 쓴다. (`oneWeek()`으로 한 주씩 밀어도 되지만
      // 그건 선택 대기를 못 넘어 1주에서 선다.)
      await app.autoRun();

      const w = app.currentWeek(), s = app.currentSeason();
      if (w === w0 && s === s0) continue;
      elapsed += (s > s0) ? Math.max(1, w) : (w - w0);

      const t = await app.trainingProbe();
      if (elapsed % 26 === 0) {
        marks.push({ elapsed, ...t, delta: Math.round((t.OVR - prevOvr) * 10) / 10 });
        log(`  누적${num(elapsed)}주  ${pad(t.단계, 11)}${t.나이}세  OVR ${num(t.OVR, 5)}` +
            ` (+${(t.OVR - prevOvr).toFixed(1)})  피로 ${num(t.피로, 3)}  컨디션 ${num(t.컨디션, 3)}`);
        prevOvr = t.OVR;
      }
    }

    const last = await app.trainingProbe();
    log(`  경과 ${elapsed}주 · ${last.시즌} W${app.currentWeek()}`);
    if (elapsed < WEEKS) {
      log(`  ⚠ 요청 ${WEEKS}주를 못 채웠다 — 정지 ${app.pendingKind() ?? "없음"}` +
          ` · 사유 ${app.stopReason() ?? "없음"}`);
    }

    log("");
    log("  ── 최종 상태 ──");
    log(`    ${last.단계} ${last.나이}세 · OVR ${first.OVR} → ${last.OVR}` +
        `  (${elapsed}주에 +${(last.OVR - first.OVR).toFixed(1)})`);
    log(`    스탯  ${JSON.stringify(last.스탯)}`);
    log(`    구종  ${last.보유구종.join(", ") || "없음"}` +
        (last.개발중구종 ? `  · 개발중 ${last.개발중구종}` : ""));

    log("");
    // ⚠ **표본을 세지 않는다.** `autoRun`이 한 번에 여러 주를 밀어서 매 반복마다
    // 찍으면 191주에 표본이 12개가 된다 — 그 평균은 191주의 평균이 아니다.
    // `seasonHealth`는 `advanceWeek`이 **매주** 세는 카운터라 전수다.
    log("  ── 피로 궤적 (게임 카운터 · 전수) ──");
    // 마지막(진행 중) 시즌분을 더한다
    const cur = last.건강;
    const h = cur ? {
      totalWeeks: health.totalWeeks + cur.totalWeeks,
      highFatigueWeeks: health.highFatigueWeeks + cur.highFatigueWeeks,
      lowConditionWeeks: health.lowConditionWeeks + cur.lowConditionWeeks,
      injuryCount: health.injuryCount + cur.injuryCount,
    } : null;
    if (!h || !h.totalWeeks) {
      log("    seasonHealth가 비었다 — 카운터가 안 도는 것이다");
    } else {
      const pct = (v) => ((v / h.totalWeeks) * 100).toFixed(0);
      log(`    총 ${h.totalWeeks}주  ·  피로>70 ${h.highFatigueWeeks}주 (${pct(h.highFatigueWeeks)}%)` +
          `  ·  컨디션<60 ${h.lowConditionWeeks}주 (${pct(h.lowConditionWeeks)}%)` +
          `  ·  부상 ${h.injuryCount}회`);
      if (h.highFatigueWeeks === 0) {
        log("    ← 피로 구간 승수(70/80/90)에 한 번도 안 걸렸다. 지금은 죽은 규칙이다");
      }
    }

    log("");
    log("  ── 시즌당 OVR (NPC 목표: ~18세 +4.5 · 19~21 +4.0) ──");
    for (const m of marks) log(`    누적${num(m.elapsed)}주  ${pad(m.단계, 11)}${m.나이}세  +${m.delta}`);
  } catch (e) {
    log(`  실패: ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  } finally {
    if (tmp) await headless.cleanup(tmp);
  }
})();
