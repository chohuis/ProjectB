"use strict";
/** 인쇄 스타일이 실제로 어떻게 보이는지 눈으로 확인한다.
 *
 *  ⚠ `@media print` 를 `@media all` 로 바꾼 사본을 띄운다 — 화면 스타일만
 *    보고 "괜찮겠지" 하면 표가 잘려 나가는 걸 못 잡는다. */
const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");

const SRC = process.argv[2];
const OUT = process.argv[3];
const W = Number(process.env.SHOT_W || 1123);
const TOP = Number(process.env.SHOT_TOP || 0);
const H = Number(process.env.SHOT_H || 1600);

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const tmp = SRC.replace(/\.html$/, ".printview.html");
  fs.writeFileSync(tmp, fs.readFileSync(SRC, "utf8").replace("@media print {", "@media all {"));

  const win = new BrowserWindow({ show: false, width: W, height: H });
  await win.loadFile(tmp);
  await win.webContents.executeJavaScript(
    "new Promise(r => { document.fonts.ready.then(() =>"
    + " requestAnimationFrame(() => setTimeout(r, 500))); })",
  );
  if (TOP > 0) {
    await win.webContents.executeJavaScript(`window.scrollTo(0, ${TOP})`);
    await new Promise((r) => setTimeout(r, 300));
  }
  const img = await win.webContents.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log(`  ${OUT} · ${(img.toPNG().length / 1024).toFixed(0)}KB`);
  fs.unlinkSync(tmp);
  app.quit();
}).catch((e) => { console.error("실패:", e && e.message); app.exit(1); });
