#!/usr/bin/env node
// ── 진로·훈련 분기 조사 ──────────────────────────────────────────
//
//   node scripts/study-careers.cjs --runs 12 --weeks 440
//   node scripts/study-careers.cjs --runs 60 --shards 5 --shard 2   (병렬 조각)
//
// **육성 시뮬이니까 되는 길을 다 밟아 본다.** 진로 정책과 훈련 계획을 섞어
// 커리어를 끝까지 돌리고, 각 회차가 어떤 선택이었고 어디로 갔는지 남긴다.
//
// 보고 싶은 경로들:
//   고교 → 프로 직행
//   고교 → 대학 4년 → 프로
//   고교 → 대학 → **드래프트 탈락** → 독립
//   고교 → 독립 → (재도전)
//   고교 → 즉시 입대
//
// ⚠ **주차를 넉넉히 준다.** 대학은 4년(208주)이라 220주로는 진학 직후에서
// 끊긴다. 실제로 시범에서 "대학만" 회차가 **155주에 진학하는데 151주에서
// 가드가 소진돼** 고교에 갇힌 것처럼 보였다 — 없는 결함을 만들 뻔했다.
//
// ⚠ **난수는 시드로 돌린다.** `Math.random()`을 쓰면 같은 조사를 두 번 못 한다.
//
// ⚠ 시작 팀은 못 바꾼다(`perfEntry.boot`가 고교 팀을 알파벳 순 첫 번째로
// 고정한다). 다양성은 `worldSeed`가 만든다 — 세계의 로스터·능력치가 바뀐다.

const fs = require("node:fs");
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const RUNS   = arg("runs", 12);
const WEEKS  = arg("weeks", 440);
const SEED0  = arg("seed", 20260810);
const SHARDS = arg("shards", 1);
const SHARD  = arg("shard", 0);
const ARM    = (process.argv.indexOf("--arm")!==-1)?process.argv[process.argv.indexOf("--arm")+1]:"base";
// 안(arm)별 주인공 튜닝 — 세계는 안 건드린다
// 시작 OVR 56(현재)에서 4씩 올린다. F는 능력치 대신 선발 기회를 준다
const ARMS = { A:{}, B:{ovrDelta:4}, C:{ovrDelta:8}, D:{ovrDelta:12}, E:{ovrDelta:16}, F:{forceStarter:true},
               base:{}, startovr:{ovrDelta:6}, growth:{devRateMult:1.3} };

const TAG = (ARM!=="base"?`-${ARM}`:"") + (SHARDS > 1 ? `-s${SHARD}` : "");
const PROGRESS = path.join(process.cwd(), `resource/logs/career-study${TAG}.log`);
const OUT      = path.join(process.cwd(), `resource/logs/career-study${TAG}.json`);
fs.mkdirSync(path.dirname(PROGRESS), { recursive: true });
fs.writeFileSync(PROGRESS, "");
// stdout만 쓰면 파이프에 통째로 버퍼링돼 몇 시간짜리 실행의 진행이 안 보인다
const log = (s) => {
  process.stdout.write(s + "\n");
  try { fs.appendFileSync(PROGRESS, s + "\n"); } catch { /* 기록 실패가 조사를 멈출 이유는 아니다 */ }
};
const pad = (s, n) => String(s).padEnd(n);

/** 시드 난수 — 같은 조사를 다시 돌릴 수 있어야 한다 */
function rngOf(seed) {
  let x = seed >>> 0;
  return () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; };
}

/** 진로 정책 — 밟아 볼 갈래 */
const POLICIES = [
  { name: "전부신청",   p: { draft: true,  university: true,  independent: true } },
  { name: "프로직행",   p: { draft: true,  university: false, independent: false } },
  { name: "대학우선",   p: { draft: false, university: true,  independent: false } },
  { name: "독립우선",   p: { draft: false, university: false, independent: true } },
  { name: "드래+대학",  p: { draft: true,  university: true,  independent: false } },
  { name: "드래+독립",  p: { draft: true,  university: false, independent: true } },
  { name: "대학+독립",  p: { draft: false, university: true,  independent: true } },
  { name: "지명거부",   p: { draft: true,  university: true,  independent: true, rejectDraft: true } },
  { name: "즉시입대",   p: { draft: false, university: false, independent: false, enlistNow: true } },
];

/** 투수 훈련 프로그램 — 슬롯에 넣을 수 있는 것들 */
const SLOT_POOL = ["TRN_CTRL_CMD", "TRN_VEL", "TRN_MOVEMENT", "TRN_MENTAL_P", "TRN_STAMINA", "TRN_RECOVERY"];
const PITCHES = ["PITCH_SLIDER", "PITCH_CURVE", "PITCH_CHANGEUP", "PITCH_SPLITTER",
                 "PITCH_SINKER", "PITCH_CUTTER", "PITCH_FORKBALL", "PITCH_KNUCKLEBALL"];

/**
 * 훈련 계획을 시드로 뽑는다 — **구종을 배우는가**가 핵심 변수다.
 *
 * ⚠ 시범에서 구종이 전부 `FASTBALL1`이었다. 화면 기본 계획에 구종 개발이
 * 없어서 커리어 내내 하나도 안 배운다 — 고정 계획으로 돌리면 구종 축이
 * 조사에 아예 안 담긴다.
 */
function randomPlan(rnd) {
  // ⚠ **계획을 안 건드리는 갈래가 있어야 한다.** 매주 `setTrainingSlots`를
  // 부르면 `userSet: true`가 되고 `applyRecommendedTraining`이 가드에서
  // 빠진다 — **자동 추천 경로를 한 번도 안 탄다.** 실제로 그래서 A-2(자동
  // 진행이 구종을 배우게 한 변경)의 효과를 20회 규모로 못 쟀다.
  //
  // 플레이어가 계획을 안 짜고 자동 진행만 쓰는 건 흔한 플레이라 조사에 있어야 한다.
  if (rnd() < 0.34) return { name: "자동추천", slots: null, pitch: null };

  const devPitch = rnd() < 0.55;           // 절반 남짓은 구종을 배운다
  const pool = [...SLOT_POOL];
  const take = () => pool.splice(Math.floor(rnd() * pool.length), 1)[0];
  const slots = devPitch
    ? [take(), take(), "TRN_PITCH_DEV"]
    : [take(), take(), take()];
  const pitch = devPitch ? PITCHES[Math.floor(rnd() * PITCHES.length)] : null;
  return {
    name: devPitch ? `구종(${pitch.replace("PITCH_", "")})` : "스탯만",
    slots, pitch,
  };
}

(async () => {
  log("");
  log(`── 진로·훈련 분기 조사 [${ARM}] (${RUNS}회${SHARDS > 1 ? ` · 조각 ${SHARD}/${SHARDS}` : ""}) ──`);

  let tmp = null;
  const rows = [];
  try {
    const boot = await headless.boot(`study${TAG}`);
    tmp = boot.tmp;
    const app = boot.app;

    for (let i = 0; i < RUNS; i++) {
     // ⚠ **회차 단위로 잡는다.** 예전엔 catch가 루프 **밖에** 있어서 한 회차가
     // 터지면 **그 조각 12회가 통째로 날아갔다** — 실제로 조각 셋이 1~3회만
     // 남기고 끝났다. 실패도 결과다: 무엇이 터졌는지 적고 다음으로 간다.
     try {
      const idx = SHARD + i * SHARDS;           // 조각이 겹치지 않게 건너뛴다
      const seed = SEED0 + idx * 7919;
      const rnd  = rngOf(seed);
      const pol  = POLICIES[idx % POLICIES.length];
      const plan = randomPlan(rnd);
      const slotId = `ST${String(idx).padStart(3, "0")}`;

      await app.boot({ slotId, worldSeed: seed, seasonYear: 2026 });
      app.setCareerPolicy({
        draft: false, university: false, independent: false,
        enlistNow: false, rejectDraft: false, rejectTrade: false, ...pol.p,
      });
      app.tuneProtagonist(ARMS[ARM] ?? {});
      // slots가 null이면 손대지 않는다 — 자동 추천이 돌게 둔다
      if (plan.slots) app.setTrainingSlots(plan.slots);
      if (plan.pitch) app.startPitchDev(plan.pitch);

      const start = app.careerProbe();
      // ⚠ 원값과 표시값을 따로 둔다. 표시용 "@N주"를 붙인 배열에 대고 중복을
      // 판정했더니 매번 다르다고 나와 같은 단계가 세 번 찍히고 팀이동이 부풀었다
      let lastTeam = start.팀, lastStage = start.단계;
      const teamsSeen = [start.팀];
      const stagesSeen = [start.단계];
      let atDraft = null, hsEndOvr = null, univEndOvr = null, draftApply = null;
      const hsSeasons = [];   // 고교 시즌별 포지션·등판·이닝
      let pitchLearned = start.구종;

      // ⚠ **가드를 넉넉히.** autoRun은 헛도는 회차가 진행한 회차보다 훨씬 많다
      let guard = 0, elapsed = 0;
      while (guard++ < WEEKS * 60 && elapsed < WEEKS) {
        const w0 = app.currentWeek(), s0 = app.currentSeason();
        if (app.retired()) break;
        if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
        // ⚠ **진로 결정 직후에 잡는다.** `pushCareerForward`가 신청·지명·수락을
        // 전부 처리하고 continue로 빠지므로, 루프 아래에서 재면 신청 기록이
        // 살아 있는 순간을 한 번도 안 지난다 — 실측에서 20회 전부 null이었다
        if (await app.pushCareerForward()) {
          const da = app.draftApplyProbe();
          if (da.신청여부 != null || da.지명됨 != null) draftApply = { ...(draftApply ?? {}), ...da };
          const cc = app.careerProbe();
          if (cc.지명) atDraft = cc.지명;
          continue;
        }
        if (app.isSeasonEnded()) {
          // ⚠ **롤오버 전에 잡는다.** 넘어가면 그 시즌 기록이 초기화된다
          if (lastStage === "highschool") hsSeasons.push({ ...app.armProbe(), 등판분포: (app.hsPitcherLoadProbe ? app.hsPitcherLoadProbe() : null) });
          await app.seasonRollover(); continue;
        }
        // ⚠ **매주 다시 넣는다.** `runAutoAdvance`의 `applyRecommendedTraining`이
        // 주마다 계획을 하드코딩 추천으로 덮어쓴다 — 그 추천에는 구종 개발이
        // 없어서, 안 되돌리면 조사의 훈련 축이 통째로 사라진다(실측으로 확인).
        if (plan.slots) app.setTrainingSlots(plan.slots);
        if ((ARMS[ARM] ?? {}).forceStarter) app.forceStarter();
        await app.autoRun();

        const w = app.currentWeek(), s = app.currentSeason();
        if (w === w0 && s === s0) continue;
        elapsed += (s > s0) ? Math.max(1, w) : (w - w0);

        const c = app.careerProbe();
        if (c.팀 !== lastTeam)    { teamsSeen.push(`${c.팀}@${elapsed}주`);   lastTeam = c.팀; }
        if (c.단계 !== lastStage) {
          if (lastStage === "highschool") hsEndOvr = c.OVR;
          if (lastStage === "university") univEndOvr = c.OVR;
          stagesSeen.push(`${c.단계}@${elapsed}주`); lastStage = c.단계;
        }
        // 지명 결과는 계약을 수락하면 지워진다 — 보이는 즉시 잡는다
        if (c.지명) atDraft = c.지명;
        const da = app.draftApplyProbe();
        if (da.신청여부 != null) draftApply = da;
        if (c.구종) pitchLearned = c.구종;
      }

      const end = app.careerProbe();
      const stopped = elapsed < WEEKS
        ? `${app.retired() ? "은퇴" : "정지"} · pending ${app.pendingKind() ?? "없음"} · ${app.stopReason() ?? "사유없음"}`
        : null;

      rows.push({
        회차: idx + 1, 정책: pol.name, 훈련: plan.name, 슬롯: plan.slots, 개발구종: plan.pitch ?? "-",
        seed, 경과주: elapsed,
        OVR: { 시작: start.OVR, 고교말: hsEndOvr, 대학말: univEndOvr, 최종: end.OVR },
        지명: atDraft ?? "-",
        경로: stagesSeen.join(" → "),
        팀이동: teamsSeen.length - 1, 팀들: teamsSeen,
        최종: { 단계: end.단계, 리그: end.리그, 나이: end.나이 },
        고교시즌: hsSeasons,
        수상: (app.careerProbe().수상 ?? []),
        경력기록수: (app.careerProbe().경력기록수 ?? 0),
        산식내역: (app.careerProbe().산식내역 ?? null),
        좌석: (app.draftSeatProbe ? app.draftSeatProbe() : null),
        드래프트신청: draftApply,
        구종: pitchLearned || "없음",
        병역: end.병역, 은퇴: end.은퇴, 중단: stopped,
      });

      const r = rows[rows.length - 1];
      log(`  ${pad(r.회차, 4)} ${pad(r.정책, 10)} ${pad(r.훈련, 16)} ${pad(r.경로, 52)}` +
          ` OVR ${r.OVR.시작}→${r.OVR.최종}  이동${r.팀이동}  ${pad(r.지명, 30)} 구종 ${r.구종}` +
          (r.은퇴 ? `  [은퇴 ${r.은퇴}]` : "") + (r.중단 ? `  [${r.중단}]` : ""));
      fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));   // 중간에 죽어도 남는다
     } catch (e) {
      const msg = String((e && e.message) || e).slice(0, 200);
      log(`  ${pad(SHARD + i * SHARDS + 1, 4)} [회차 실패] ${msg}`);
      rows.push({ 회차: SHARD + i * SHARDS + 1, 실패: msg });
      fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
     }
    }
  } catch (e) {
    log(`  실패: ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  } finally {
    if (tmp) await headless.cleanup(tmp);
  }

  fs.writeFileSync(OUT, JSON.stringify(rows, null, 2));
  log("");
  log(`  ${rows.length}회 기록 → ${OUT}`);
})();
