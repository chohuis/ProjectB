"use strict";
/** 리그별 트레이드가 어디서 막히는가 — autoLog 를 켜서 그대로 받는다.
 *
 *  `market.ts` 가 이미 네 줄을 찍는다:
 *    [트레이드윈도우] <리그> W<주> 시작 / npcRows=N
 *    [트레이드] 팀로스터: ...
 *    [트레이드] 제안 생성: N건 | 자산풀: M명
 *    (끝에) 성사 x / 가치거절 y / 의료거절 z
 *
 *  ⚠ 예전 주석이 "setLogFile 은 헤드리스에서 두 번 실패했다"고 적어 뒀는데,
 *    `log:write` 는 main.cjs 에 있고 헤드리스가 main.cjs 를 싣는다.
 *    isDev 라 `resource/logs/` 로 떨어진다. */
const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PT_SEED || 20260803);
const YEARS = Number(process.env.PT_YEARS || 3);
const LOG = "probe-trade.log";
// 🔴 **헤드리스는 `resource/logs` 가 아니라 임시 userData 로 쓴다.**
//   `main.cjs` 의 `isDev = !!process.env.VITE_DEV_SERVER_URL` 가 false 라
//   `logsDir = userDataDir/logs` 로 간다. 예전에 두 번 실패한 게 이것이다 —
//   **경로를 부팅 뒤에 정한다.**
let LOGPATH = null;

(async () => {
  const { app, tmp } = await headless.boot("tradeprobe");
  LOGPATH = path.join(tmp, "logs", LOG);
  let why = "완주";
  try {
    await app.boot({ slotId: "PT", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });
    app.setLogFile(LOG);
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      why = "막힘: " + (app.stopReason() ?? "?");
      break;
    }
  } catch (e) { why = "예외: " + (e && e.message); }

  // 🔴 **`setLogFile` 이 정한 이름이 안 남는다.** 자동 진행이 시작될 때
  //   `autoAdvance` 가 자기 파일명(`auto-advance-<시각>.log`)으로 덮어쓴다.
  //   그래서 지정한 이름만 찾으면 늘 "비었다"로 나온다 — **폴더를 통째로 읽는다.**
  const LOGDIR = path.dirname(LOGPATH);
  let txt = "";
  try {
    for (const f of fs.readdirSync(LOGDIR)) {
      if (!f.endsWith(".log")) continue;
      txt += fs.readFileSync(path.join(LOGDIR, f), "utf8") + "\n";
    }
  } catch { /* 폴더가 없으면 빈 채로 둔다 */ }
  if (!txt) { console.log("[트레이드로그] 비었다 — 로그가 한 줄도 안 쌓였다"); }
  else {
    // 리그별로 모은다. 로그 한 줄이 어느 리그인지는 `[트레이드윈도우] <리그>` 가 말한다
    const lines = txt.split("\n");
    const per = {};
    let cur = "?";
    for (const ln of lines) {
      const w = ln.indexOf("[트레이드윈도우] ");
      if (w >= 0) {
        const rest = ln.slice(w + "[트레이드윈도우] ".length);
        const lg = rest.split(" ")[0];
        if (lg.startsWith("LEAGUE_")) cur = lg.replace("LEAGUE_", "");
        if (!per[cur]) per[cur] = { 창: 0, npc: 0, 제안: 0, 자산: 0, 성사: 0 };
        if (rest.includes("npcRows=")) {
          per[cur].npc = Math.max(per[cur].npc, Number(rest.split("npcRows=")[1]) || 0);
        } else { per[cur].창++; }
        continue;
      }
      if (!per[cur]) per[cur] = { 창: 0, npc: 0, 제안: 0, 자산: 0, 성사: 0 };
      const g = ln.indexOf("[트레이드] 제안 생성: ");
      if (g >= 0) {
        const rest = ln.slice(g + "[트레이드] 제안 생성: ".length);
        per[cur].제안 += Number(rest.split("건")[0]) || 0;
        const a = rest.indexOf("자산풀: ");
        if (a >= 0) per[cur].자산 = Math.max(per[cur].자산, Number(rest.slice(a + 5).split("명")[0]) || 0);
      }
      // 🔴 **성사는 `[트레이드성사]` 줄을 직접 센다.**
      //   예전엔 `성사 x / 가치거절 y` 를 찾았는데 **그건 로그에 없다** —
      //   `logEvent` 의 `extra` 라 autoLog 로 안 나간다. 엉뚱한 줄에서
      //   숫자를 긁어 세 리그가 전부 같은 값으로 나왔다.
      const d = ln.indexOf("[트레이드성사] LEAGUE_");
      if (d >= 0) {
        const lg2 = ln.slice(d + "[트레이드성사] ".length).split(" ")[0].replace("LEAGUE_", "");
        if (!per[lg2]) per[lg2] = { 창: 0, npc: 0, 제안: 0, 자산: 0, 성사: 0 };
        per[lg2].성사++;
      }
    }
    console.log("[트레이드분해] 씨앗 " + SEED + " · " + YEARS + "시즌");
    for (const [lg, v] of Object.entries(per)) {
      console.log("   " + lg.padEnd(12)
        + " 창 " + String(v.창).padStart(2)
        + " · npc " + String(v.npc).padStart(4)
        + " · 자산풀 " + String(v.자산).padStart(4)
        + " · 제안 " + String(v.제안).padStart(4)
        + " · 성사 " + String(v.성사).padStart(3));
    }
  }
  try { console.log("[연봉무게] " + JSON.stringify(app.salaryWeightProbe())); }
  catch (e) { console.log("[연봉무게] " + (e && e.message)); }
  // 원본 로그를 꺼내 둔다 — 파서를 못 믿을 때 직접 봐야 한다
  if (process.env.PT_DUMP) {
    try {
      fs.mkdirSync(process.env.PT_DUMP, { recursive: true });
      for (const f of fs.readdirSync(LOGDIR)) {
        fs.copyFileSync(path.join(LOGDIR, f), path.join(process.env.PT_DUMP, f));
      }
      console.log("[덤프] " + process.env.PT_DUMP);
    } catch (e) { console.log("[덤프실패] " + (e && e.message)); }
  }
  console.log("[END] " + why + " · 시즌 " + app.currentSeason());
  headless.cleanup(tmp);
  process.exit(0);
})();
