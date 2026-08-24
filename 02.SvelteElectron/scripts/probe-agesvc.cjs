"use strict";
/** 세계 생성 직후 리그별 나이·연차 — KBL만 젊은 게 생성 탓인지 그 뒤 흐름 탓인지 가른다.
 *  ⚠ 오프시즌 페이로드로 재면 이미 드래프트·콜업이 지나간 뒤다. */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 20260731);
(async () => {
  const { app, tmp } = await headless.boot("age");
  try {
    await app.boot({ slotId: "AG", worldSeed: SEED, seasonYear: 2026 });
    const show = (tag, probe) => {
    console.log("[" + tag + "] 씨앗 " + SEED);
    for (const lg of Object.keys(probe).sort()) {
      const v = probe[lg];
      console.log("  " + lg.padEnd(22)
        + String(v["인원"]).padStart(5) + "명"
        + " · 나이 " + v["나이최소"] + "~" + v["나이최대"] + " 중앙 " + String(v["나이중앙"]).padStart(2)
        + " · 연차 중앙 " + String(v["연차중앙"]).padStart(2) + " 최대 " + String(v["연차최대"]).padStart(2)
        + " · 7년차+ " + String(v["7년차+"]).padStart(4)
        + "(" + (v["7년차+"] / v["인원"] * 100).toFixed(0).padStart(2) + "%)"
        + " · 30세+ " + String(v["30세+"]).padStart(4)
        + " · [결함] 30세+인데 3년차 미만 " + v["30세+인데3년차미만"]);
    }
    };
    show("생성 직후", app.ageServiceProbe());
    const snapA = app.svcSnapshot();
    // 한 시즌만 돌린다 — 무너지는 게 첫 시즌 안이라면 여기서 보인다
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 52 * 60 && app.currentSeason() < start + 1) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    console.log("");
    show("1시즌 뒤 " + app.currentSeason(), app.ageServiceProbe());
    const snapB = app.svcSnapshot();
    let down = 0, up = 0, same = 0, gone = 0;
    const cases = [];
    for (const id of Object.keys(snapA)) {
      const A = snapA[id], B = snapB[id];
      if (!B) { gone++; continue; }
      if (B[0] < A[0]) { down++; cases.push([A[2].split("|")[1], B[2].split("|")[1], A[0], B[0]]); }
      else if (B[0] > A[0]) up++; else same++;
    }
    console.log("");
    console.log("[추적] 생성 직후 " + Object.keys(snapA).length + "명 중");
    console.log("  연차 증가 " + up + " · 그대로 " + same + " · [결함] 감소 " + down + " · 목록에서 사라짐 " + gone);
    const from = {}, to = {};
    for (const c of cases) { from[c[0]] = (from[c[0]] || 0) + 1; to[c[1]] = (to[c[1]] || 0) + 1; }
    console.log("  [나간 팀] " + Object.entries(from).sort((x,y)=>y[1]-x[1]).slice(0,6).map(e=>e[0].replace(/^TEAM_/,"")+"="+e[1]).join(" "));
    console.log("  [간 팀]   " + Object.entries(to).sort((x,y)=>y[1]-x[1]).slice(0,6).map(e=>e[0].replace(/^TEAM_/,"")+"="+e[1]).join(" "));
    console.log("  [연차] 잃은 총합 " + cases.reduce((a2,c)=>a2+(c[2]-c[3]),0) + "년 · 평균 " + (cases.reduce((a2,c)=>a2+(c[2]-c[3]),0)/cases.length).toFixed(1));
  } catch (e) { console.log("[예외] " + (e && e.message) + " " + (e && e.stack || "").split(String.fromCharCode(10))[1]); }
  await headless.cleanup(tmp);
})();
