"use strict";
/** **`resolve_contact` 가 어느 밴드에서 도는가** — 실제 로스터로 잰다.
 *
 *  🔴 왜 필요한가 (2026-09-01)
 *
 *  KBL 실측이 이렇다:
 *  ```
 *    리그타율 .272   출루 .338   장타 .464   ERA 5.24   K/9 10.7
 *    KBO      .265        .340        .390       4.5        7.5
 *  ```
 *  타율·출루는 맞는데 **장타율만 크게 높다.** 삼진은 KBO보다 3개나 많은데
 *  ERA 가 높다 — **안타 수가 아니라 안타 하나의 무게**가 문제라는 뜻이다.
 *
 *  `resolve_contact` 의 밴드 표는 구간마다 장타 비중이 다르다. 낮은
 *  `contact_q` 밴드일수록 2루타·3루타·홈런이 늘어난다. **어느 밴드에서
 *  도는지 모르면 어느 줄을 만질지 못 정한다** — 밴드가 여섯이라 한 곳만
 *  고치면 다른 구간이 어긋난다.
 *
 *  ⚠ `match_engine.rs` 머리말이 "표 주석은 contact_q 약 56 이라는데 실측
 *    BABIP 은 44.7% 였다 — 더 낮은 밴드에서 돈다는 뜻"이라고 **적어 두고
 *    끝나 있다.** 그 실측은 엔진 직접 호출(OVR 70 대 70 균일)이었다.
 *    여기서는 **실제 로스터**로 잰다 — 능력치가 흩어져 있으면 분포가 다르다.
 *
 *  ⚠ **카운터가 `thread_local!` 이다.** 배경 리그가 여러 스레드에서 돌면
 *    스레드마다 따로 쌓여 합계가 실제보다 적게 나온다. 그래서 **스윙 수가
 *    말이 되는지** 같이 찍는다 — 경기 수 대비 너무 적으면 그 함정이다.
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 1);
const SEED = arg("seed", 20260802);

(async () => {
  const { app, tmp } = await headless.boot("cband");
  let why = "완주";
  try {
    await app.boot({ slotId: "CB", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    // 세계 생성 중의 스윙은 안 센다 — 시즌이 시작한 뒤부터
    await app.resetContactBands();

    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < SEASONS * 52 * 60 && app.currentSeason() < start + SEASONS) {
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

    const bands = await app.contactBands();
    console.log("\n[밴드] 씨앗 " + SEED + " · " + SEASONS + "시즌");
    console.log("  " + JSON.stringify(bands));

    // ⚠ **스윙 수가 말이 되는가.** KBL 156경기만 해도 한 경기 60~80스윙이라
    //   1만 회는 넘어야 한다. 훨씬 적으면 thread_local 함정이다.
    const total = Number(bands["스윙"] ?? 0);
    console.log("  스윙 " + total + " — " + (total < 5000
      ? "🔴 너무 적다. thread_local 로 갈렸을 수 있다"
      : "표본은 충분하다"));

    // 🔴 담장 재확인이 홈런을 몇 개 만들었나 — 양방향 순증
    try {
      const fm = await app.fenceMoves();
      console.log("  [담장] " + JSON.stringify(fm));
    } catch (e) { console.log("  [담장] " + (e && e.message)); }

    // 같은 실행에서 리그 지표도 같이 본다 — 따로 재면 씨앗이 어긋난다
    try {
      const b = app.battingProbe ? app.battingProbe() : null;
      if (b && b.KBL) {
        const k = b.KBL;
        console.log("  KBL 리그타율 " + k.리그타율 + " · 장타 " + k.리그장타
          + " · ERA " + k.리그ERA + " · K9 " + k["9이닝당K"]);
      }
    } catch { /* 프로브 이름이 다르면 건너뛴다 */ }
  } catch (e) { why = "예외: " + (e && e.message); }

  console.log("[END] " + why + " · 시즌 " + app.currentSeason());
  headless.cleanup(tmp);
  process.exit(0);
})();
