// OnePitch Electron REPL 드라이버.
//
// 화면은 자동 테스트가 못 본다 — 이 프로젝트에서 이미 그 종류의 결함이 여러 번
// 나왔다(상무 모달 `curYear` ReferenceError로 모달이 통째로 안 열린 건 등).
// 이 스크립트는 앱을 실제로 띄우고 stdin 명령으로 조작해 스크린샷을 남긴다.
//
// 실행:
//   npm run dev:ui                      # 다른 창에서 Vite (5174)
//   node scripts/drive.mjs              # 이 REPL
//
// Windows에선 xvfb가 필요 없다. 창이 실제로 뜬다.
import { _electron as electron } from "playwright-core";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOT_DIR = process.env.SCREENSHOT_DIR
  ?? path.join(APP_DIR, "resource/logs/shots");
fs.mkdirSync(SHOT_DIR, { recursive: true });

const DEV_URL = process.env.VITE_DEV_SERVER_URL ?? "http://localhost:5174";

let app = null;
let page = null;

const electronBin = process.platform === "win32"
  ? path.join(APP_DIR, "node_modules/electron/dist/electron.exe")
  : process.platform === "darwin"
    ? path.join(APP_DIR, "node_modules/electron/dist/Electron.app/Contents/MacOS/Electron")
    : path.join(APP_DIR, "node_modules/electron/dist/electron");

const COMMANDS = {
  async launch() {
    if (app) return console.log("already launched");
    // ⚠ **`ELECTRON_RUN_AS_NODE`를 반드시 지운다.**
    // 이 프로젝트의 헤드리스 테스트가 전부 그 변수를 쓰기 때문에 셸에 남아 있기
    // 쉬운데, 켜져 있으면 Electron이 창 없이 순수 Node로 돌아 `protocol`이
    // undefined가 된다 — main.cjs가 153줄에서 죽고 Playwright는
    // "Process failed to launch!"만 뱉어 원인이 안 보인다.
    const env = { ...process.env, VITE_DEV_SERVER_URL: DEV_URL };
    delete env.ELECTRON_RUN_AS_NODE;

    app = await electron.launch({
      executablePath: electronBin,
      args: [path.join(APP_DIR, "apps/desktop/main.cjs")],
      env,
      timeout: 60_000,
    });
    // ⚠ **`firstWindow()`는 DevTools를 준다.** dev 모드에서 main.cjs가
    // devtools를 열기 때문에 창이 둘이고 그쪽이 먼저 잡힌다. URL로 골라야 한다.
    await app.firstWindow();
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
      page = app.windows().find((w) => !w.url().startsWith("devtools://"));
      if (page) break;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (!page) { console.log("ERROR: 앱 창을 못 찾았다"); return; }
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 30_000 });
    } catch { /* 무시하고 아래에서 상태를 찍는다 */ }
    page.on("console", (m) => {
      const t = m.type();
      if (t === "error" || t === "warning") console.log(`[page ${t}]`, m.text().slice(0, 300));
    });
    page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 300)));
    console.log("launched:", page.url());
  },

  async ss(name) {
    if (!page) return console.log("ERROR: launch first");
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + ".png");
    // ⚠ 주자 스프라이트가 0.8초마다 깜박여서(`gbcBlink`) 기본 옵션으로는
    // "waiting for fonts/animations"에서 30초를 다 쓰고 실패한다.
    try {
      await page.screenshot({ path: f, animations: "disabled", timeout: 15_000 });
      console.log("screenshot:", f);
    } catch (e) {
      console.log("screenshot 실패:", e.message.split("\n")[0]);
    }
  },

  /** DOM 클릭 — 좌표 계산을 안 거치므로 겹친 레이어에 안 막힌다 */
  async click(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log("click", sel, "→", await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.click(); return "OK";
    }, sel));
  },

  async "click-text"(text) {
    if (!page) return console.log("ERROR: launch first");
    console.log("click-text", JSON.stringify(text), "→", await page.evaluate((t) => {
      const els = [...document.querySelectorAll("button, a, [role='button'], li, td, tr")];
      const el = els.find((e) => e.textContent?.trim() === t)
              ?? els.find((e) => e.textContent?.includes(t));
      if (!el) return "NOT_FOUND";
      el.click(); return "OK: " + el.tagName + " " + (el.className || "");
    }, text));
  },

  async dblclick(sel) {
    if (!page) return console.log("ERROR: launch first");
    console.log("dblclick", sel, "→", await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      return "OK";
    }, sel));
  },

  /** fill <css-sel>|<값> — Svelte가 듣도록 input 이벤트까지 보낸다 */
  async fill(arg) {
    if (!page) return console.log("ERROR: launch first");
    const [sel, ...rest] = arg.split("|");
    try {
      await page.fill(sel.trim(), rest.join("|"));
      console.log("fill", sel.trim(), "→ OK");
    } catch (e) { console.log("fill ERROR:", e.message.split("\n")[0]); }
  },

  async type(t) { if (page) await page.keyboard.type(t, { delay: 25 }); },
  async press(k) { if (page) await page.keyboard.press(k); },

  async wait(sel) {
    if (!page) return console.log("ERROR: launch first");
    try { await page.waitForSelector(sel, { timeout: 20_000 }); console.log("found:", sel); }
    catch { console.log("TIMEOUT:", sel); }
  },

  async sleep(ms) { await new Promise((r) => setTimeout(r, Number(ms) || 1000)); console.log("slept", ms); },

  /**
   * advance <n> — n주 진행. 막는 것들을 스스로 치운다.
   *
   * 주간 진행은 pendingAction 하나만 걸려도 멈춘다(이벤트 선택·메시지·브리핑).
   * 한 주씩 손으로 스크립트를 짜면 금방 수십 줄이 되므로 여기서 돌린다.
   * **경기 화면(MatchPage)이 뜨면 즉시 멈춘다** — 그게 보통 보러 온 것이다.
   */
  /** advance <n> [멈출 CSS 선택자] */
  async advance(nArg) {
    if (!page) return console.log("ERROR: launch first");
    const [nStr, ...rest] = String(nArg).trim().split(/\s+/);
    const n = Number(nStr) || 1;
    const stopSel = rest.join(" ") || null;
    for (let i = 0; i < n; i++) {
      for (let guard = 0; guard < 12; guard++) {
        const state = await page.evaluate((stopSel) => {
          // 보러 온 화면에 닿으면 멈춘다
          if (stopSel && document.querySelector(stopSel)) return "MATCH";
          if (document.querySelector(".retro-field, .scoreboard-wrap")) return "MATCH";
          // 경기로 가는 길: 브리핑 → 경기 상태 → 직접 플레이
          const play = document.querySelector("button.btn-play:not([disabled])");
          if (play) { play.click(); return "PLAY"; }
          const brief = document.querySelector("button.confirm-btn");
          if (brief) { brief.click(); return "BRIEF"; }
          // 선택 대기 — 소식의 선택지 버튼
          const opt = document.querySelector("button.opt");
          if (opt) { opt.click(); return "CHOSE"; }
          // 선택 대기 항목이 접혀 있으면 펼친다
          const pend = document.querySelector(".item.pending");
          if (pend) { pend.click(); return "OPENED"; }
          // 모달의 확인/닫기류
          const btns = [...document.querySelectorAll("button")];
          const confirm = btns.find((b) => /^(확인|닫기|계속|시작|넘어가기)$/.test(b.innerText.trim()));
          if (confirm) { confirm.click(); return "CONFIRM"; }
          const go = document.querySelector(".go");
          if (go && !go.disabled) { go.click(); return "GO"; }
          return "STUCK";
        }, stopSel);
        if (state === "MATCH") { console.log(`week ${i}: 목표 화면 도달`); return; }
        await new Promise((r) => setTimeout(r, state === "GO" ? 4500 : 1200));
        if (state === "GO") break;
        if (state === "STUCK") { console.log(`week ${i}: STUCK`); return; }
      }
      const label = await page.evaluate(() => document.querySelector(".go")?.innerText ?? "(없음)");
      const wk = await page.evaluate(() => document.querySelector(".wk")?.innerText ?? "");
      console.log(`  week ${i + 1}: ${wk} · 버튼 "${label}"`);
    }
  },

  async eval(expr) {
    if (!page) return console.log("ERROR: launch first");
    try { console.log(JSON.stringify(await page.evaluate(expr), null, 1)); }
    catch (e) { console.log("ERROR:", e.message); }
  },

  async text(sel) {
    if (!page) return console.log("ERROR: launch first");
    const t = await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? "(null)", sel || null);
    console.log(t.slice(0, 3000));
  },

  async windows() {
    if (!app) return console.log("ERROR: launch first");
    for (const w of app.windows()) console.log(" ", w.url());
  },

  async quit() { if (app) await app.close().catch(() => {}); app = null; page = null; },
  help() { console.log("commands:", Object.keys(COMMANDS).join(", ")); },
};

async function run(line) {
  const s = line.trim();
  if (!s || s.startsWith("#")) return;
  const i = s.indexOf(" ");
  const cmd = i < 0 ? s : s.slice(0, i);
  const arg = i < 0 ? "" : s.slice(i + 1);
  const fn = COMMANDS[cmd];
  if (!fn) return console.log("unknown:", cmd, "— try: help");
  try { await fn(arg); } catch (e) { console.log("ERROR:", e.message); }
}

console.log("dev server:", DEV_URL, "· shots →", SHOT_DIR);

// 스크립트 모드 — 명령을 한 줄씩 적은 파일을 주면 다 돌고 끝난다.
// tmux가 없는 환경(Windows Git Bash)에서 REPL을 원격 조작할 수 없어 넣었다.
const scriptArg = process.argv[2];
if (scriptArg) {
  const lines = fs.readFileSync(scriptArg, "utf8").split(/\r?\n/);
  for (const l of lines) {
    if (l.trim() && !l.trim().startsWith("#")) console.log(`\n$ ${l.trim()}`);
    await run(l);
  }
  await COMMANDS.quit();
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "driver> " });
rl.on("line", async (line) => {
  await run(line);
  if (line.trim() === "quit") { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on("close", async () => { await COMMANDS.quit(); process.exit(0); });

console.log('OnePitch driver — "help" for commands, "launch" to start');
rl.prompt();
