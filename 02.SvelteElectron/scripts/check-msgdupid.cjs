"use strict";
/**
 * **같은 소식 id 가 두 번 나는가** — `npm run check:msgdupid`
 *
 * 🔴 왜 필요한가 (2026-09-05 실사용자 신고 · 09-06 원인 확정):
 *
 *   대회 본선 한 경기가 무승부로 끝나 승자가 안 찍혔고, 그 라운드가
 *   **주마다 다시 확정되면서** `msg-tour-my-TOUR_HS_JANGMI-r1-2028` 이
 *   소식함에 둘 들어갔다. Svelte 5 는 키가 겹치면 렌더 도중 **던진다** —
 *   반응성이 통째로 멎어 화면이 굳고 탭 전환조차 안 됐다.
 *
 *   화면 쪽은 이제 사본을 걷어낸다(`dedupeMailbox`). 그런데 **걷어냈다는
 *   사실을 아무도 안 보면 소식 한 통이 그냥 사라진다** — 증상은 사라지고
 *   원인은 남는다. 이 검사가 그 자리를 지킨다.
 *
 * ⚠ **`check:msgdup` 과 다른 것을 본다.**
 *
 *     check:msgdup     같은 id 로 **다른 소식**   (내용 충돌)
 *     check:msgdupid   같은 id 가 **두 번**       (진행 로직이 두 번 돌았다)
 *
 *   내용이 같아도 두 번 나면 결함이다 — 만드는 쪽이 같은 일을 두 번 했다는
 *   뜻이고, 대회 라운드 재확정이 정확히 그 꼴이었다.
 *
 * ⚠ **상한(50)에 안 걸린다.** `mailboxDupStats` 는 메일함에 **넣는 문**에서
 *   세므로, 밀려나 사라진 소식도 빠짐없이 잡힌다. `check:msgdup` 이 소식함을
 *   훑느라 놓치던 구멍이 여기엔 없다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const { makeStallGuard } = require(path.join(process.cwd(), "scripts/perf/weekLoop.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 3);
const SEED = arg("seed", 20260731);

async function main() {
  const { app, tmp } = await headless.boot("msgdupid");
  try {
    await app.boot({ slotId: "MI", worldSeed: SEED, seasonYear: 2026 });
    app.resetMailboxDup();

    const start = app.currentSeason();
    let guard = 0;
    const stallGuard = makeStallGuard();
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
      if (app.retired()) break;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      await app.autoRun();
      // 한 바퀴 안 움직인 것은 정지 pending 을 민 정상 경로일 수 있다 — `perf/weekLoop.cjs` 머리말
      if (stallGuard.hit(app.currentWeek() !== w0 || app.currentSeason() !== s0)) break;
    }

    const r = app.mailboxDupProbe();
    const dropped = r["버려진사본"] ?? 0;
    const byId = r["id별"] ?? {};
    const kinds = Object.entries(byId).sort((a, b) => b[1] - a[1]);

    console.log(`[소식 id 사본] 씨앗 ${SEED} · ${SEASONS}시즌 · 진행 ${guard}회`);
    if (dropped === 0) {
      console.log("  ok  같은 id 가 두 번 난 적이 없다");
    } else {
      console.log(`  FAIL  사본 ${dropped}통이 버려졌다 — 만드는 쪽이 같은 일을 두 번 했다`);
      for (const [id, n] of kinds.slice(0, 12)) console.log(`    ${n}회  ${id}`);
    }
    process.exit(dropped === 0 ? 0 : 1);
  } finally {
    await headless.cleanup(tmp);
  }
}

main().catch((e) => { console.error("[check-msgdupid] 실패:", e); process.exit(1); });
