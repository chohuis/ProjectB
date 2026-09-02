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
import * as os from "node:os";
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
    // 🔴 **`DRIVE_EXE` 가 있으면 패키지 실행파일을 띄운다** (2026-09-02 · smoke:dist).
    //   `release/win-unpacked/OnePitch.exe` 는 dist/ui 를 자기 안에서 읽으므로
    //   Vite 주소도, main.cjs 인자도 넘기지 않는다 — 넘기면 dev 모드로 오해한다.
    //   나머지(임시 저장소·창 고르기·스크린샷)는 같다.
    const packed = process.env.DRIVE_EXE
      ? path.resolve(APP_DIR, process.env.DRIVE_EXE)
      : null;
    if (packed && !fs.existsSync(packed)) {
      fail(`ERROR: DRIVE_EXE 가 없다: ${packed} — 먼저 npm run pack`);
      return;
    }
    const env = packed
      ? { ...process.env }
      : { ...process.env, VITE_DEV_SERVER_URL: DEV_URL };
    delete env.ELECTRON_RUN_AS_NODE;

    app = await electron.launch({
      executablePath: packed ?? electronBin,
      // ⚠ **`DRIVE_USER_DATA=1`이면 임시 저장소로 띄운다.**
      // 세이브 슬롯이 셋뿐이라 다 차 있으면 새 게임을 못 만든다. 확인하려고
      // 사용자 세이브를 지우거나 앞으로 돌리면 **그 세이브가 바뀐다** —
      // 화면 확인은 새 게임으로 하라는 규칙과도 어긋난다.
      args: [
        ...(packed ? [] : [path.join(APP_DIR, "apps/desktop/main.cjs")]),
        ...(process.env.DRIVE_USER_DATA
          ? ["--user-data-dir=" + fs.mkdtempSync(path.join(os.tmpdir(), "drive-udd-"))]
          : []),
      ],
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
    if (!page) { fail("ERROR: 앱 창을 못 찾았다"); return; }
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
    if (!page) return fail("ERROR: launch first");
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + ".png");
    // ⚠ `animations: "disabled"`는 애니메이션을 **되감아 멈추길 기다린다.**
    // 주자 스프라이트(`gbcBlink`)처럼 무한 반복이면 그 대기가 안 끝나 타임아웃이
    // 난다. 깜박이는 한 컷이 못 찍는 것보다 낫다 — 기다리지 않는다.
    //
    // 대신 앱의 "애니메이션 줄이기"를 잠깐 켠다. 이건 CSS가 즉시 반응하므로
    // 되감기를 기다리지 않는다.
    const hadReduce = await page.evaluate(() => {
      const had = document.documentElement.hasAttribute("data-reduce-motion");
      document.documentElement.setAttribute("data-reduce-motion", "");
      return had;
    }).catch(() => true);
    try {
      await page.screenshot({ path: f, animations: "allow", timeout: 20_000 });
      console.log("screenshot:", f);
    } catch (e) {
      console.log("screenshot 실패:", e.message.split("\n")[0]);
    } finally {
      // 원래 꺼져 있었으면 되돌린다 — 찍느라 앱 상태를 바꿔 두면 안 된다
      if (!hadReduce) {
        try {
          await page.evaluate(() => document.documentElement.removeAttribute("data-reduce-motion"));
        } catch { /* 창이 닫혔을 수 있다 */ }
      }
    }
  },

  /** DOM 클릭 — 좌표 계산을 안 거치므로 겹친 레이어에 안 막힌다 */
  async click(sel) {
    if (!page) return fail("ERROR: launch first");
    console.log("click", sel, "→", await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.click(); return "OK";
    }, sel));
  },

  async "click-text"(text) {
    if (!page) return fail("ERROR: launch first");
    console.log("click-text", JSON.stringify(text), "→", await page.evaluate((t) => {
      const els = [...document.querySelectorAll("button, a, [role='button'], li, td, tr")];
      const el = els.find((e) => e.textContent?.trim() === t)
              ?? els.find((e) => e.textContent?.includes(t));
      if (!el) return "NOT_FOUND";
      el.click(); return "OK: " + el.tagName + " " + (el.className || "");
    }, text));
  },

  async dblclick(sel) {
    if (!page) return fail("ERROR: launch first");
    console.log("dblclick", sel, "→", await page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return "NOT_FOUND";
      el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
      return "OK";
    }, sel));
  },

  /** fill <css-sel>|<값> — Svelte가 듣도록 input 이벤트까지 보낸다 */
  async fill(arg) {
    if (!page) return fail("ERROR: launch first");
    const [sel, ...rest] = arg.split("|");
    try {
      await page.fill(sel.trim(), rest.join("|"));
      console.log("fill", sel.trim(), "→ OK");
    } catch (e) { fail("fill ERROR:", e.message.split("\n")[0]); }
  },

  async type(t) { if (page) await page.keyboard.type(t, { delay: 25 }); },
  async press(k) { if (page) await page.keyboard.press(k); },

  async wait(sel) {
    if (!page) return fail("ERROR: launch first");
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
    if (!page) return fail("ERROR: launch first");
    const parts = String(nArg).trim().split(/\s+/);
    const n = Number(parts[0]) || 1;
    // `--auto` — 경기를 직접 플레이하지 않고 자동 시뮬로 넘긴다.
    // 경기 밖 화면(리그·대회 등)을 보려면 경기에서 멈추면 안 된다.
    const auto = parts.includes("--auto");
    const stopSel = parts.slice(1).filter((x) => x !== "--auto").join(" ") || null;
    for (let i = 0; i < n; i++) {
      for (let guard = 0; guard < 12; guard++) {
        const state = await page.evaluate(({ stopSel, auto }) => {
          // 보러 온 화면에 닿으면 멈춘다
          if (stopSel && document.querySelector(stopSel)) return "MATCH";
          if (!auto && document.querySelector(".retro-field, .scoreboard-wrap")) return "MATCH";
          // 경기 화면에 들어와 있으면 나간다 (--auto)
          const exit = document.querySelector(".exit-btn");
          if (auto && exit) { exit.click(); return "EXIT"; }
          // 경기로 가는 길: 브리핑 → 경기 상태 → 직접 플레이(또는 자동 시뮬)
          const sim = document.querySelector("button.btn-auto:not([disabled])");
          if (auto && sim) { sim.click(); return "SIM"; }
          const play = auto ? null : document.querySelector("button.btn-play:not([disabled])");
          if (play) { play.click(); return "PLAY"; }
          const brief = document.querySelector("button.confirm-btn");
          if (brief) { brief.click(); return "BRIEF"; }
          // 선택 대기 — 소식의 선택지 버튼
          const opt = document.querySelector("button.opt");
          if (opt) { opt.click(); return "CHOSE"; }
          // 선택 대기 항목이 접혀 있으면 펼친다
          const pend = document.querySelector(".item.pending");
          if (pend) { pend.click(); return "OPENED"; }

          // ── 반드시 골라야 넘어가는 모달들 ──────────────────────
          //
          // ⚠ **닫기가 없다.** 부상 치료·진로 선택·계약은 사용자가 결정해야
          // 하는 일이라 취소 버튼이 없고, 그래서 `.go`가 disabled로 남는다.
          // 여기서 안 골라 주면 드라이버가 `STUCK:go가 disabled`로 멈춘다.
          //
          // ⚠ **클래스만 보고 아무거나 누르면 안 된다.** 진로 허브와 계약
          // 협상의 `.opt-btn`은 결정이 아니라 **설정 토글**이라 누르면 켰다
          // 껐다만 반복하고, 허브의 `.opt-btn.danger`는 **즉시 입대**다.
          // 모달마다 "진행되는 버튼"을 따로 짚는다.

          // 부상 치료 — 첫 번째 치료법을 고른다
          const injury = document.querySelector(".option-card");
          if (injury) { injury.click(); return "INJURY"; }

          // 진로 허브 — 지원할 곳을 하나 켠 뒤 신청 완료.
          // `.danger`(즉시 입대)는 절대 안 누른다
          const hubSubmit = document.querySelector("button.submit");
          if (hubSubmit) {
            if (hubSubmit.disabled) {
              const toggle = [...document.querySelectorAll("button.opt-btn")]
                .find((b) => !b.classList.contains("danger"));
              if (toggle) { toggle.click(); return "HUB_TOGGLE"; }
            } else { hubSubmit.click(); return "HUB_SUBMIT"; }
          }

          // 계약 협상 — 팀 제시를 그대로 받는다 (역제안·거부는 안 고른다)
          const acceptOffer = document.querySelector("button.btn-accept:not([disabled])");
          if (acceptOffer) { acceptOffer.click(); return "CONTRACT"; }

          // 진로 결과에서 갈 곳 고르기 — 첫 번째(대개 드래프트).
          // ⚠ 허브(`button.submit`)와 계약(`button.btn-accept`)에도 `.opt-btn`이
          // 있는데 그쪽은 **설정 토글**이라 여기서 누르면 무한 반복이 된다.
          // 두 모달이 없을 때만 진로 결과로 본다.
          const otherModal = document.querySelector("button.submit, button.btn-accept");
          const resultPick = document.querySelector(".opt-btn:not(.danger)");
          if (resultPick && !otherModal) { resultPick.click(); return "CAREER_PICK"; }
          // 모달의 확인/닫기류
          const btns = [...document.querySelectorAll("button")];
          const confirm = btns.find((b) => /^(확인|닫기|계속|시작|넘어가기)$/.test(b.innerText.trim()));
          if (confirm) { confirm.click(); return "CONFIRM"; }
          const go = document.querySelector(".go");
          if (go && !go.disabled) { go.click(); return "GO"; }
          // 왜 막혔는지 말한다 — "STUCK"만 던지면 앱을 다시 띄워 손으로 뒤져야 한다
          return "STUCK:" + (go ? (go.disabled ? "go가 disabled" : "?") : ".go 없음")
            + " | " + (document.body.innerText.slice(0, 60).replace(/\s+/g, " "));
        }, { stopSel, auto });
        if (state === "MATCH") { console.log(`week ${i}: 목표 화면 도달`); return; }
        await new Promise((r) => setTimeout(r, state === "GO" || state === "SIM" ? 5000 : 1200));
        if (state === "GO") break;
        if (state.startsWith("STUCK")) { console.log(`week ${i}: ${state}`); return; }
      }
      const label = await page.evaluate(() => document.querySelector(".go")?.innerText ?? "(없음)");
      const wk = await page.evaluate(() => document.querySelector(".wk")?.innerText ?? "");
      console.log(`  week ${i + 1}: ${wk} · 버튼 "${label}"`);
    }
  },

  async eval(expr) {
    if (!page) return fail("ERROR: launch first");
    try { console.log(JSON.stringify(await page.evaluate(expr), null, 1)); }
    catch (e) { fail("ERROR:", e.message); }
  },

  async text(sel) {
    if (!page) return fail("ERROR: launch first");
    const t = await page.evaluate((s) => (s ? document.querySelector(s) : document.body)?.innerText ?? "(null)", sel || null);
    console.log(t.slice(0, 3000));
  },

  async windows() {
    if (!app) return fail("ERROR: launch first");
    for (const w of app.windows()) console.log(" ", w.url());
  },

  /**
   * 창 크기를 바꾼다 — `resize 1366x768`
   *
   * 🔴 **`page.setViewportSize()` 는 Electron 에서 안 먹는다.** 창 자체를
   *   바꿔야 한다. 그래서 해상도별 확인을 하려면 이 명령이 필요하다 —
   *   없이 찍으면 전부 최대화 크기로 나온다(실제로 스크린샷 5장 중
   *   경기 화면만 1920×1079 로 찍혔다).
   *
   * ⚠ **최대화·전체화면을 먼저 풀어야 `setContentSize` 가 먹는다.**
   *   안 풀면 **조용히 무시**되고 계속 최대 크기로 찍힌다 — 오류도 안 난다.
   * ⚠ `setMinimumSize(1,1)` 도 필요하다. 최소 크기가 걸려 있으면
   *   작은 해상도(1280×720)에서 그만큼만 줄어든다.
   */
  async resize(arg) {
    if (!app) return fail("ERROR: launch first");
    const m = String(arg).trim().match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (!m) return console.log("usage: resize 1366x768");
    const w = Number(m[1]), h = Number(m[2]);
    const got = await app.evaluate(({ BrowserWindow }, s) => {
      // ⚠ DevTools 창을 고르면 엉뚱한 걸 줄인다 — url 로 거른다
      const win = BrowserWindow.getAllWindows()
        .find((x) => !x.webContents.getURL().startsWith("devtools://"));
      if (!win) return null;
      if (win.isFullScreen()) win.setFullScreen(false);
      if (win.isMaximized()) win.unmaximize();
      win.setResizable(true);
      win.setMinimumSize(1, 1);
      win.setContentSize(s.w, s.h);
      const [cw, ch] = win.getContentSize();
      return { cw, ch };
    }, { w, h });
    if (!got) return fail("ERROR: window not found");
    // 실제로 그 크기가 됐는지 되읽는다 — 조용히 무시되는 걸 잡는다
    console.log(`resize → ${got.cw}x${got.ch}` +
      (got.cw !== w || got.ch !== h ? `  ⚠ 요청 ${w}x${h} 와 다르다` : ""));
  },

  async quit() { if (app) await app.close().catch(() => {}); app = null; page = null; },
  help() { console.log("commands:", Object.keys(COMMANDS).join(", ")); },
};

// 🔴 **ERROR 를 찍었으면 실패로 끝낸다.** smoke:dist 가 launch 에서 60초 타임아웃을
// 내고 뒤 명령 여덟 개가 전부 "launch first" 였는데 종료 코드가 0 이었다 —
// 게이트로 못 쓴다. 스크립트 모드는 ERROR 가 한 줄이라도 있으면 1 로 끝난다.
let failed = false;
function fail(...parts) { failed = true; console.log(...parts); }

async function run(line) {
  const s = line.trim();
  if (!s || s.startsWith("#")) return;
  const i = s.indexOf(" ");
  const cmd = i < 0 ? s : s.slice(0, i);
  const arg = i < 0 ? "" : s.slice(i + 1);
  const fn = COMMANDS[cmd];
  if (!fn) return console.log("unknown:", cmd, "— try: help");
  try { await fn(arg); } catch (e) { fail("ERROR:", e.message); }
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
  process.exit(failed ? 1 : 0);
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
