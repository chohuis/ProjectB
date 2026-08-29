/** ③을 갈무리하고, min-height를 남겼을 때도 안전한지 본다 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const pw = require_("playwright-core");

// 산출물은 저장소 밖 임시 폴더에 둔다 — git에 안 들어간다
const HERE = path.join(os.tmpdir(), "projectb-parkclip");
fs.mkdirSync(HERE, { recursive: true });
const SHOTS = path.join(HERE, "shots");

const FIX = `
  .field-stage-wrap { align-items: stretch; }
  .wrapper { height: 100%; min-height: 0; display: flex; justify-content: center; }
  .viewport { height: 100%; width: auto; max-width: 100%; max-height: 100%; min-height: 0; }`;

/** min-height: 280px를 그대로 두면? */
const FIX_KEEP_MIN = FIX.replace("min-height: 0; }", "min-height: 280px; }");

const browser = await pw.chromium.launch({ channel: "msedge" });
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

const probe = () => {
  const vp = document.querySelector(".viewport").getBoundingClientRect();
  const sp = document.querySelector(".scene-panel"), cs = getComputedStyle(sp);
  const b = sp.getBoundingClientRect();
  const clipB = b.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
  return { cut: +Math.max(0, vp.bottom - clipB).toFixed(1), w: +vp.width.toFixed(0), h: +vp.height.toFixed(0) };
};

console.log("min-height: 280px 를 남기면 — 창을 낮출 때 다시 잘리나\n");
console.log("  창 크기        min-height 0        min-height 280px");
console.log("  " + "-".repeat(58));
for (const [w, h] of [[1600, 900], [1366, 600], [1600, 520], [1920, 460], [1280, 420]]) {
  await page.setViewportSize({ width: w, height: h });
  const row = [];
  for (const css of [FIX, FIX_KEEP_MIN]) {
    await page.goto(pathToFileURL(path.join(HERE, "pages", "STADIUM_SEOUL_GUARDIANS__r90.html")).href, { waitUntil: "load" });
    await page.addStyleTag({ content: css });
    const r = await page.evaluate(probe);
    row.push(`${r.w}x${r.h}` + (r.cut > 0.5 ? ` 잘림${r.cut}` : " OK"));
  }
  console.log("  " + `${w}x${h}`.padEnd(15) + row[0].padEnd(20) + row[1]);
}

// 갈무리
for (const [w, h] of [[1920, 1080], [2560, 1440]]) {
  await page.setViewportSize({ width: w, height: h });
  await page.goto(pathToFileURL(path.join(HERE, "pages", "STADIUM_SEOUL_GUARDIANS__r90.html")).href, { waitUntil: "load" });
  await page.addStyleTag({ content: FIX });
  await page.screenshot({ path: path.join(SHOTS, `FIXED_pro_${w}x${h}.png`) });
  console.log(`\n  갈무리 FIXED_pro_${w}x${h}.png`);
}
await browser.close();
