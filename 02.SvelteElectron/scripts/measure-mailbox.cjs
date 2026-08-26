#!/usr/bin/env node
/**
 * **소식함이 무엇으로 차는가.**
 *
 *   npm run measure:mailbox -- --seasons 6 --path indie
 *
 * 🔴 이 트랙은 지금까지 **이벤트 쪽만** 쟀다. 그런데 소식함에는 두 계통이
 * 같이 들어온다:
 *
 *     이벤트 규칙 (603종)      조건 → 추첨. 주당 1칸 상한을 먹는다
 *     코드 소식 (45자리)       코드가 때가 되면 직접 만든다. 상한이 없다
 *
 * `trimMailbox`는 **둘을 구분하지 않는다.** 상한(200)에 닿으면 순서는
 * ① 미결 선택지 → ② 안 읽음 → ③ 읽음이지 "이벤트냐 알림이냐"가 아니다.
 * 그래서 **코드 소식이 이야기를 밀어낼 수 있다.**
 *
 * 2026-08-26에 랜덤 추첨률을 26% → 48%로 올렸는데, 소식함이 이미 코드
 * 소식으로 차 있으면 그 증가분이 그대로 밀려난다. 그걸 확인하려고 만들었다.
 */
const headless = require("./perf/headless.cjs");

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 6);
const SEED = arg("seed", 20260803);
const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ:  { draft: false, university: true,  independent: false },
  draft: { draft: true,  university: false, independent: true },
  army:  { draft: false, university: false, independent: true, enlistNow: true },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "indie";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

/**
 * 종류 → 계통. **이벤트가 만든 소식은 `msg-evt-` 접두사가 아니다** —
 * `ruleToOutput`이 규칙 id를 그대로 쓴다. 그래서 `msg-`로 시작하면
 * 코드 소식, 아니면 이벤트로 가른다.
 */
const isCodeMsg = (kind) => kind.startsWith("msg-");

(async () => {
  const boot = await headless.boot("mailbox");
  const app = boot.app;
  await app.boot({ slotId: "MBOX", worldSeed: SEED, seasonYear: 2026 });
  app.setCareerPolicy(POLICY);
  app.resetEventFunnel();

  const start = app.currentSeason();
  let guard = 0;
  while (guard++ < 12000) {
    if (app.currentSeason() - start >= SEASONS) break;
    if (app.retired()) break;
    const before = app.currentWeek();
    await app.autoRun();
    if (app.currentWeek() > before) continue;
    if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
    if (await app.pushCareerForward()) continue;
    if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
    break;
  }

  const prod = app.mailboxProduceProbe();
  const box = app.mailboxProbe();
  const funnel = app.eventFunnelProbe();
  const kinds = prod.종류별 ?? {};

  let evt = 0, code = 0;
  const evtRows = [], codeRows = [];
  for (const [k, n] of Object.entries(kinds)) {
    if (isCodeMsg(k)) { code += n; codeRows.push([k, n]); }
    else { evt += n; evtRows.push([k, n]); }
  }
  const total = evt + code;
  const weeks = funnel.주수 || 1;

  const log = (s) => process.stdout.write(s + "\n");
  const pct = (a, b) => (b ? ((a / b) * 100).toFixed(1) + "%" : "-");
  log("");
  log(`  씨앗 ${SEED} · ${SEASONS}시즌 · ${weeks}주 · 경로 ${PATH_KEY}`);
  log("");
  log("  ── 생산 (밀려났든 남았든 만들어진 전부) ─────────────────");
  log(`    코드 소식   ${String(code).padStart(6)}통   ${pct(code, total).padStart(7)}   주당 ${(code / weeks).toFixed(2)}`);
  log(`    이벤트      ${String(evt).padStart(6)}통   ${pct(evt, total).padStart(7)}   주당 ${(evt / weeks).toFixed(2)}`);
  log(`    합계        ${String(total).padStart(6)}통                주당 ${(total / weeks).toFixed(2)}`);
  log("");
  log("  ── 소식함 (지금 남아 있는 것) ──────────────────────────");
  log(`    보유 ${box.보유}/${box.상한}   ·   밀려남(누계) ${box["밀려남(누계)"]}통   ·   안 읽음 ${box["안읽음"] ?? "?"}`);
  log(`    밀려남 비율  ${pct(box["밀려남(누계)"], total)}   ← 만든 것 중 이만큼이 사라졌다`);
  log("");
  log("  ── 코드 소식 상위 20종 ─────────────────────────────────");
  for (const [k, n] of codeRows.sort((a, b) => b[1] - a[1]).slice(0, 20)) {
    log(`    ${String(n).padStart(5)}   ${(n / weeks).toFixed(2).padStart(5)}/주   ${k}`);
  }
  log("");
  log("  ── 이벤트 상위 10종 ────────────────────────────────────");
  for (const [k, n] of evtRows.sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    log(`    ${String(n).padStart(5)}   ${(n / weeks).toFixed(2).padStart(5)}/주   ${k}`);
  }
  log("");
  log("  ⚠ `trimMailbox`는 두 계통을 구분하지 않는다 — 상한에 닿으면");
  log("    ① 미결 선택지 → ② 안 읽음 → ③ 읽음 순서다");
  log("");
  boot.cleanup?.();
  process.exit(0);
})();
