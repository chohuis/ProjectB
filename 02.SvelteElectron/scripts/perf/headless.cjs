"use strict";
/**
 * 렌더러 코드를 노드에서 돌리는 장치 (Phase 8).
 *
 * `measure-perf.cjs`(계측)와 `test-savebatch.cjs`(회귀)가 **같이 쓴다.**
 * 두 벌로 두면 하나만 고쳐지고 다른 쪽이 조용히 다른 세계를 돌게 된다
 * (Phase 7 교훈 #1 — 표를 두 번째로 적고 있다면 이미 드리프트다).
 *
 * ── 핵심: 아무것도 재현하지 않는다 ───────────────────────────────
 * `electron` 모듈을 가짜로 갈아끼우고 **진짜 `main.cjs`·`preload.cjs`를 로드**한다.
 * 그래서 IPC 채널 표(60여 개)도, 브릿지 메서드 표(120개)도 여기 없다.
 * 저쪽이 바뀌면 이 장치가 자동으로 따라간다.
 *
 * 미등록 채널을 만나면 **조용히 넘기지 않고 던진다** — 어떤 경로가 통째로
 * 빠진 걸 모르는 게 제일 나쁘다 (Phase 7 교훈 #6).
 */

const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "../..");

// ── 가짜 electron ────────────────────────────────────────────────
const handlers = new Map();
const missing = new Set();

const noop = () => {};
const fakeWebContents = {
  on: noop, send: noop, setWindowOpenHandler: noop,
  openDevTools: noop, closeDevTools: noop,
};
class FakeBrowserWindow {
  constructor() { this.webContents = fakeWebContents; }
  loadURL() {} isDestroyed() { return true; }
  static getAllWindows() { return []; }
}

let USER_DATA = "";

/**
 * IPC 가로채기 훅. `null`이면 그냥 통과한다.
 * `(channel, args, invoke) => Promise<any>` — invoke를 부르는 건 훅 책임이다.
 */
let interceptor = null;
function setInterceptor(fn) { interceptor = fn; }

const fakeElectron = {
  app: {
    isPackaged: false,
    whenReady: () => Promise.resolve(),
    getPath: () => USER_DATA,
    on: noop,
    quit: noop,
  },
  BrowserWindow: FakeBrowserWindow,
  ipcMain: {
    handle(channel, fn) { handlers.set(channel, fn); },
    removeHandler(channel) { handlers.delete(channel); },
  },
  ipcRenderer: {
    async invoke(channel, ...args) {
      const fn = handlers.get(channel);
      if (!fn) {
        missing.add(channel);
        throw new Error(`[headless] 미등록 IPC 채널: ${channel}`);
      }
      const call = () => fn({}, ...args);
      return interceptor ? await interceptor(channel, args, call) : await call();
    },
    on: noop,
  },
  contextBridge: {
    exposeInMainWorld(name, api) { globalThis[`__bridge_${name}`] = api; },
  },
  session: { defaultSession: { webRequest: { onHeadersReceived: noop } } },
  protocol: { registerSchemesAsPrivileged: noop, handle: noop },
  net: { fetch: () => { throw new Error("net.fetch는 이 경로에 없다"); } },
};

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "electron") return fakeElectron;
  return origLoad.call(this, request, ...rest);
};

// ── 부팅 ─────────────────────────────────────────────────────────
function bundleEntry(outFile) {
  require("esbuild").buildSync({
    entryPoints: [path.join(__dirname, "perfEntry.ts")],
    bundle: true, platform: "node", format: "cjs", target: "node18",
    outfile: outFile,
    logLevel: "warning",  // svelte/store는 순수 JS라 노드에서 그대로 돈다
  });
}

/**
 * 임시 디렉터리를 만들고 · main/preload를 로드하고 · `window`를 심고 ·
 * 번들된 렌더러 진입점을 돌려준다.
 */
async function boot(prefix) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${prefix}-`));
  const bundleFile = path.join(tmp, "perfEntry.cjs");

  const t0 = Date.now();
  bundleEntry(bundleFile);
  const bundleMs = Date.now() - t0;

  USER_DATA = tmp;
  fs.mkdirSync(path.join(tmp, "saves"), { recursive: true });
  require(path.join(ROOT, "apps/desktop/main.cjs"));
  // 등록은 app.whenReady().then(...) 안에서 일어난다 — 마이크로태스크를 흘려보낸다
  for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r));
  if (handlers.size === 0) throw new Error("[headless] main.cjs가 IPC를 하나도 등록하지 않았다");

  require(path.join(ROOT, "apps/desktop/preload.cjs"));
  const bridge = globalThis.__bridge_projectB;
  if (!bridge?.engine) throw new Error("[headless] preload.cjs가 projectB를 노출하지 않았다");

  globalThis.window = globalThis;
  globalThis.window.projectB = bridge;
  globalThis.localStorage = {
    _m: new Map(),
    getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
    setItem(k, v) { this._m.set(k, String(v)); },
    removeItem(k) { this._m.delete(k); },
  };

  return { app: require(bundleFile), tmp, bundleMs, bridge };
}

/** better-sqlite3 핸들이 열린 채라 Windows에서 지워지지 않는다 — 실패해도 무시 */
function cleanup(tmp) {
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* temp는 OS가 치운다 */ }
}

module.exports = { ROOT, boot, cleanup, setInterceptor, missing, handlers };
