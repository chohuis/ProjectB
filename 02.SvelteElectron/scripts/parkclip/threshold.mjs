/** 폭마다 — 잘리지 않으려면 창 높이가 얼마여야 하나 */
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
const PAGE = pathToFileURL(path.join(HERE, "pages", "STADIUM_SEOUL_GUARDIANS__r90.html")).href;

const cut = async (page, w, h) => {
  await page.setViewportSize({ width: w, height: h });
  return page.evaluate(() => {
    const sp = document.querySelector(".scene-panel"), cs = getComputedStyle(sp);
    const b = sp.getBoundingClientRect();
    const clipB = b.bottom - parseFloat(cs.borderBottomWidth) - parseFloat(cs.paddingBottom);
    const vp = document.querySelector(".viewport").getBoundingClientRect();
    return Math.max(0, vp.bottom - clipB);
  });
};

const browser = await pw.chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
await page.goto(PAGE, { waitUntil: "load" });

console.log("  창 폭    안 잘리는 최소 높이   그때 화면비   실제 16:9 높이   16:9에서 잘리는 양");
console.log("  " + "-".repeat(84));
for (const w of [1280, 1366, 1440, 1536, 1600, 1707, 1920, 2048, 2560, 3840]) {
  let lo = 400, hi = 4000, need = null;
  for (let i = 0; i < 18; i++) {
    const mid = Math.round((lo + hi) / 2);
    const c = await cut(page, w, mid);
    if (c <= 0.5) { need = mid; hi = mid; } else lo = mid + 1;
  }
  const h169 = Math.round(w * 9 / 16);
  const c169 = await cut(page, w, h169);
  console.log("  " + String(w).padEnd(9)
    + String(need ?? ">4000").padStart(12)
    + ("  " + (w / (need ?? 1)).toFixed(2) + ":1").padStart(16)
    + String(h169).padStart(14)
    + (c169 > 0.5 ? `${c169.toFixed(0)}px` : "없음").padStart(20));
}
await browser.close();
