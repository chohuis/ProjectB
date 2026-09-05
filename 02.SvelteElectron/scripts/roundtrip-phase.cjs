"use strict";
/**
 * `check-roundtrip.cjs` 의 **한 국면**을 도는 자식 프로세스.
 *
 * 🔴 **왜 프로세스를 나누는가**: 진짜 "껐다 켰다"를 재현하려면 저장한
 *   프로세스와 불러오는 프로세스가 **달라야** 한다 — 같은 프로세스면 모듈
 *   전역(스토어)이 그대로 남아 있어서, 디스크에서 안 읽히는 값도 메모리에
 *   남은 채로 다시 저장된다. **그러면 유실이 안 보인다.**
 *   (`headless.boot` 머리말이 같은 이유를 적어 뒀다.)
 *
 * 사용:
 *   node roundtrip-phase.cjs new  <userData> <slot> <seed> <seasons>
 *   node roundtrip-phase.cjs load <userData> <slot>
 */
const path = require("node:path");
const ROOT = process.cwd();
const headless = require(path.join(ROOT, "scripts/perf/headless.cjs"));

const [, , MODE, USERDATA, SLOT, SEED, SEASONS] = process.argv;

async function main() {
  const { app } = await headless.boot(`roundtrip-${MODE}`, { userDataDir: USERDATA });

  if (MODE === "new") {
    await app.boot({ slotId: SLOT, worldSeed: Number(SEED), seasonYear: 2026 });
    const start = app.currentSeason();
    const want = Number(SEASONS);
    let guard = 0;
    while (guard++ < want * 52 * 60 && app.currentSeason() < start + want) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0 && app.currentSeason() === s0) break;
    }
    // 🔴 **시즌 경계에서 멈추면 안 된다.** 시즌이 넘어가면 `season_stats` ·
    //   `player_condition` · `team_rotation` 이 비워진다 — 그 표들이 0행인
    //   채로 왕복을 재면 **그 세 표는 한 칸도 안 본 것**이 된다.
    //   시즌 중간(20주차 언저리)에서 멈춰야 표가 다 차 있다.
    let guard2 = 0;
    while (guard2++ < 40 && app.currentWeek() < 20 && !app.retired()) {
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      if (app.currentWeek() === w0) break;
    }
    await app.saveSlot();
    console.log(`[new] ${app.currentSeason()}년 ${app.currentWeek()}주차까지 진행하고 저장했다`);
  } else if (MODE === "load") {
    // 🔴 **여기가 검사의 핵심이다.** 불러오기가 좁으면 여기서 스토어에
    //   안 담기고, 바로 뒤 저장이 그 자리를 폴백값으로 덮는다.
    if (!(await app.bootContinue(SLOT))) throw new Error("bootContinue false — 세이브를 못 열었다");
    await app.saveSlot();
    console.log("[load] 불러오고 그대로 다시 저장했다");
  } else {
    throw new Error(`알 수 없는 국면: ${MODE}`);
  }
  // ⚠ 정리하지 않는다 — 부모가 db 를 읽어야 한다
  process.exit(0);
}

main().catch((e) => { console.error(`[roundtrip-${MODE}] 실패:`, e && e.stack || e); process.exit(1); });
