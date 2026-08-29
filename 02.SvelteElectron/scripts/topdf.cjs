"use strict";
/** HTML → PDF. 프로젝트에 있는 Electron 을 그대로 쓴다 (별도 설치 없음)
 *
 *  ⚠ 폰트가 Google Fonts 에서 온다 — `document.fonts.ready` 를 기다리지 않으면
 *    폴백으로 굳은 채 찍힌다. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const SRC = process.argv[2];
const OUT = process.argv[3];

// ⚠ **표준 용지를 쓴다.** 처음엔 픽셀 크기를 micron 으로 넘겼는데
//   MediaBox 가 25,165,824 로 튀어 **한 장짜리 거대 페이지**가 나왔다 —
//   모바일 뷰어가 못 연다. `A4` + landscape 는 값이 정해져 있어 안전하다.
const W = 1123;                          // A4 가로 폭 @96dpi — 창 크기용
const H = 794;

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    width: W,
    height: H,
    webPreferences: { offscreen: true },
  });
  await win.loadFile(SRC);

  // 폰트와 배치가 끝날 때까지 기다린다
  await win.webContents.executeJavaScript(
    "new Promise(r => { document.fonts.ready.then(() =>"
    + " requestAnimationFrame(() => setTimeout(r, 600))); })",
  );
  const h = await win.webContents.executeJavaScript(
    "document.documentElement.scrollHeight",
  );
  console.log(`  본문 높이 ${h}px · 폭 ${W}px`);

  const pdf = await win.webContents.printToPDF({
    pageSize: "A4",
    landscape: true,
    printBackground: true,
    margins: { marginType: "custom", top: 0.3, bottom: 0.3, left: 0.35, right: 0.35 },
    preferCSSPageSize: false,
  });
  fs.writeFileSync(OUT, pdf);
  console.log(`  ${path.basename(OUT)} · ${(pdf.length / 1024).toFixed(0)}KB`);
  app.quit();
}).catch((e) => { console.error("실패:", e && e.message); app.exit(1); });
