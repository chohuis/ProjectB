#!/usr/bin/env node
/**
 * **이름을 댄 규칙이 몇 시즌에 몇 번 뜨는가.**
 *
 *   npx cross-env ELECTRON_RUN_AS_NODE=1 npx electron scripts/measure-eventrules.cjs [규칙ID ...]
 *
 * `measure:eventfunnel`은 상위 N종만 찍는다. **안 보이는 것과 안 뜬 것은
 * 다르다** — 새로 만든 이벤트는 대개 하위라 목록에 아예 안 나타난다.
 *
 * 🔴 **시즌 경계마다 찍어 증가분을 본다.** 총합만 보면 "한 시즌에 두 번"과
 * "두 시즌에 한 번씩"을 못 가른다. `once_per_season`이 시즌을 넘어 다시
 * 뜨는지를 이걸로 확인했다(2026-08-25 — `EVT_COND_TEAM_SUCCESS`가
 * 2029·2030·2031에 한 번씩).
 *
 * ⚠ 잡음이 있다. Rust `thread_rng`가 씨앗을 못 받는 자리가 남아 있어
 * 같은 씨앗도 실행마다 조금 흔들린다(결정성 정책 — `02/CLAUDE.md`).
 * 한 자리 차이로 판단하지 않는다.
 */
const headless = require("./perf/headless.cjs");

const DEFAULT_IDS = [
  "EVT_COND_STAT_MILESTONE", "EVT_COND_TEAM_SUCCESS", "EVT_COND_FATIGUE_WARNING",
  "EVT_COND_PEAK_FORM", "EVT_COND_SLUMP", "EVT_RAND_BULLPEN_EXTRA",
  "EVT_RAND_LOCAL_INTERVIEW", "EVT_RAND_SENIOR_ADVICE",
  "EVT_RAND_SOCIAL_MEDIA_MENTION", "EVT_RAND_TEAM_MEAL",
  "EVT_HS_LIFE_FRIEND_VISIT", "EVT_UNIV_LIFE_FRIEND_VISIT",
];
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 6);
const SEED = arg("seed", 20260803);
const IDS = process.argv.slice(2).filter((a) => a.startsWith("EVT_"));
const WATCH = IDS.length ? IDS : DEFAULT_IDS;

(async () => {
  const boot = await headless.boot("evtrules");
  const app = boot.app;
  await app.boot({ slotId: "EVTR", worldSeed: SEED, seasonYear: 2026 });
  // --nodraft와 같은 경로 고정. 드래프트가 걸리면 커리어가 갈려 비교가 안 된다
  app.setCareerPolicy({ draft: false, university: false, independent: true });
  app.resetEventFunnel();

  const start = app.currentSeason();
  const take = () => Object.fromEntries(WATCH.map((id) => [id, app.eventRuleProbe(id).발동]));
  const snaps = [];
  let seen = app.currentSeason();

  let guard = 0;
  while (guard++ < 12000) {
    if (app.currentSeason() - start >= SEASONS) break;
    if (app.retired()) break;
    if (app.currentSeason() !== seen) { snaps.push({ 시즌: seen, ...take() }); seen = app.currentSeason(); }
    const before = app.currentWeek();
    await app.autoRun();
    if (app.currentWeek() > before) continue;
    if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
    if (await app.pushCareerForward()) continue;
    if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
    break;
  }
  snaps.push({ 시즌: seen, ...take() });

  const log = (s) => process.stdout.write(s + "\n");
  log("");
  log(`  씨앗 ${SEED} · ${start}~${app.currentSeason()} · 독립 고정 · 칸은 그 시즌 증가분`);
  log("");
  const hdr = "  규칙".padEnd(36) + snaps.map((s) => String(s.시즌).padStart(7)).join("") + "     합계";
  log(hdr);
  log("  " + "─".repeat(hdr.length - 2));
  for (const id of WATCH) {
    let prev = 0;
    const cells = snaps.map((s) => { const d = s[id] - prev; prev = s[id]; return String(d).padStart(7); });
    log("  " + id.padEnd(34) + cells.join("") + String(prev).padStart(9));
  }
  log("");
  log("  ⚠ 잡음이 있다 — 한 자리 차이로 판단하지 않는다 (결정성 정책)");
  log("");
  boot.cleanup?.();
  process.exit(0);
})();
