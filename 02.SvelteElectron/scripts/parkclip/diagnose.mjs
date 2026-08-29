/** 왜 잘리나 — 사슬을 한 단계씩 잰다 */
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

const browser = await pw.chromium.launch({ channel: "msedge" });
for (const v of [{ width: 1920, height: 1080 }, { width: 1600, height: 900 }, { width: 1280, height: 720 }]) {
  const ctx = await browser.newContext({ viewport: v, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(PAGE, { waitUntil: "load" });
  const d = await page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const row = (name, el) => {
      const b = el.getBoundingClientRect(), cs = getComputedStyle(el);
      return {
        name,
        h: +b.height.toFixed(1), w: +b.width.toFixed(1),
        cssHeight: cs.height, cssMaxH: cs.maxHeight, cssMinH: cs.minHeight,
        ar: cs.aspectRatio, align: cs.alignItems, alignSelf: cs.alignSelf,
        overflow: cs.overflowY,
      };
    };
    const chain = [
      ["match-engine-empty", ".match-engine-empty"], ["engine-grid", ".engine-grid"],
      ["left-column", ".left-column"], ["scene-panel", ".scene-panel"],
      ["scene-layout", ".scene-layout"], ["field-stage-wrap", ".field-stage-wrap"],
      ["wrapper", ".wrapper"], ["viewport", ".viewport"], ["svg.field", "svg.field"],
    ].map(([n, s]) => row(n, q(s)));

    // scene-panel의 내용 상자 안에서 field가 쓸 수 있는 높이
    const sp = q(".scene-panel"), spb = sp.getBoundingClientRect(), spc = getComputedStyle(sp);
    const head = q(".panel-head").getBoundingClientRect();
    const avail = spb.bottom - parseFloat(spc.borderBottomWidth) - parseFloat(spc.paddingBottom) - head.bottom;
    const vp = q(".viewport").getBoundingClientRect();
    return { chain, avail: +avail.toFixed(1), want: +vp.height.toFixed(1), vpWidth: +vp.width.toFixed(1) };
  });
  console.log(`\n══ ${v.width}x${v.height} ═════════════════════════════════`);
  console.log("  요소                 폭 x 높이        height    max-height  min-height  aspect-ratio  overflow");
  for (const r of d.chain) {
    console.log("  " + r.name.padEnd(20) + `${r.w}x${r.h}`.padEnd(17)
      + String(r.cssHeight).padEnd(10) + String(r.cssMaxH).padEnd(12)
      + String(r.cssMinH).padEnd(12) + String(r.ar).padEnd(14) + r.overflow);
  }
  console.log(`  → 구장이 쓸 수 있는 높이 ${d.avail}px · 실제로 차지한 높이 ${d.want}px (폭 ${d.vpWidth} × 0.92)`);
  console.log(`  → 넘친 만큼 ${(d.want - d.avail).toFixed(1)}px 가 scene-panel의 overflow:hidden에 잘린다`);
  await ctx.close();
}
await browser.close();
