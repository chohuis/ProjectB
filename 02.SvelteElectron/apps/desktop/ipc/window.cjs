"use strict";
/**
 * 창 크기 제어.
 *
 * ⚠ **렌더러가 부르는 크기를 그대로 믿지 않는다.** `localStorage`는 사람이
 * 고칠 수 있고 옛 저장값도 온다. 여기 목록에 있는 값만 받는다 — 임의 크기를
 * 받으면 창이 화면 밖으로 나가거나 최소 크기 아래로 줄어든다.
 *
 * ⚠ 목록은 `apps/ui/src/shared/stores/settings.ts`의 `WindowSize`와 **같아야
 * 한다.** 한쪽만 늘리면 새 항목이 조용히 무시된다.
 */

/** 받아들이는 크기. `BrowserWindow`의 minWidth 1200 / minHeight 720 이상이어야 한다 */
const SIZES = {
  "1280x800":  { width: 1280, height: 800 },
  "1440x900":  { width: 1440, height: 900 },
  "1600x900":  { width: 1600, height: 900 },
  "1920x1080": { width: 1920, height: 1080 },
};

function register(ipcMain, { getWindow }) {
  ipcMain.handle("window:setSize", (_event, size) => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return { ok: false, reason: "no-window" };

    if (size === "fullscreen") {
      win.setFullScreen(true);
      return { ok: true, mode: "fullscreen" };
    }

    const spec = SIZES[size];
    if (!spec) return { ok: false, reason: "unknown-size" };

    // 전체화면에서 창 모드로 돌아올 때는 먼저 풀어야 크기가 먹는다
    if (win.isFullScreen()) win.setFullScreen(false);
    if (win.isMaximized()) win.unmaximize();

    win.setSize(spec.width, spec.height);
    win.center();
    return { ok: true, mode: "windowed", ...spec };
  });

  ipcMain.handle("window:getState", () => {
    const win = getWindow();
    if (!win || win.isDestroyed()) return { ok: false };
    const [width, height] = win.getSize();
    return { ok: true, width, height, fullscreen: win.isFullScreen() };
  });
}

module.exports = { register, SIZES };
