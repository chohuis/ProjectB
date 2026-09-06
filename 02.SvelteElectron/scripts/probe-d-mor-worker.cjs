"use strict";
/**
 * MOR 워커 — 고교 사기 분포, 씨앗 하나만 돈다. `probe-d-mor-morale.cjs`가
 * 자식 프로세스로 띄운다(같은 프로세스에서 `headless.boot()`를 두 번 부르면
 * 두 번째 판이 첫 판 상태를 들고 나온다는 걸 실측으로 확인했다 — 씨앗을
 * 바꿔도 로스터 체크섬이 그대로였다).
 *
 * 고교 3년(대학 진학 여부로 무대가 안 갈리게 `university:false·independent:false`
 * — 고3 말에 다음 진로가 갈리기 **전**까지만 본다) 동안 주별 사기 절대값과,
 * 그 주가 패배주/승리주/없는주 중 무엇인지를 함께 찍는다.
 *
 * ⚠ **"부진 주"는 못 잰다** — 승패 외에 그 경기의 실점·자책 같은 성적을
 *   주 단위로 주는 프로브가 없다(`s.stats[pid]`는 시즌 누적이라 "이번 주
 *   실점"을 못 뽑는다). 패배 여부만 잰다. 문서에도 그렇게 적는다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const SEED = Number(process.env.PF_SEED || 20260802);
// 고교만 본다 — 3학년 말 진로 갈림길 전에 멈춘다(대학·독립 정책은 무의미해진다)
const POLICY = { draft: false, university: false, independent: false };

(async () => {
  const { app, tmp } = await headless.boot(`mor-${SEED}`);
  let why = "완주(고교 졸업)";
  const weekly = []; // {morale, isGame, isLoss, isWin}
  try {
    await app.boot({ slotId: "MOR" + SEED, worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    let prev = app.moraleWLProbe();
    let guard = 0;
    while (guard++ < 4 * 52 * 40) {
      if (app.protagonistState().stage !== "highschool") { why = "고교 이탈"; break; }
      if (app.pathSignals().military && app.pathSignals().military !== "미필") { why = "군 전환"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); prev = app.moraleWLProbe(); continue; }
      if (await app.pushCareerForward()) { prev = app.moraleWLProbe(); continue; }
      if (await app.pushPendingForward()) { prev = app.moraleWLProbe(); continue; }
      if (app.isSeasonEnded()) { await app.seasonRollover(); prev = app.moraleWLProbe(); continue; }
      await app.runOneWeek();
      const cur = app.moraleWLProbe();
      if (app.currentWeek() > w0 || app.currentSeason() > s0) {
        const played = cur.gp - prev.gp;
        const lossDelta = cur.l - prev.l;
        const winDelta = cur.w - prev.w;
        weekly.push({
          morale: cur.morale,
          delta: cur.morale - prev.morale,
          isGame: played > 0,
          isLoss: played > 0 && lossDelta > 0,
          isWin: played > 0 && winDelta > 0,
        });
      }
      prev = cur;
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  await headless.cleanup(tmp);
  console.log("RESULT " + JSON.stringify({ seed: SEED, why, weekly }));
})();
