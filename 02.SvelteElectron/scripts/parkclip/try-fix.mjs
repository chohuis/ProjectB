/**
 * 고침 후보를 하네스에 얹어 재본다. **앱 코드는 안 건드린다** —
 * `addStyleTag`으로 브라우저에서만 덮어쓴다.
 */
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

const CANDIDATES = {
  "① 지금 (고침 없음)": "",

  "② wrapper만 늘린다": `
    .field-stage-wrap { align-items: stretch; }
    .wrapper { height: 100%; min-height: 0; }`,

  "③ 높이에서 뽑는다 (틀이 구장을 감싼다)": `
    .field-stage-wrap { align-items: stretch; }
    .wrapper { height: 100%; min-height: 0; display: flex; justify-content: center; }
    .viewport { height: 100%; width: auto; max-width: 100%; max-height: 100%; min-height: 0; }`,

  "④ ③ + min-height 제거": `
    .field-stage-wrap { align-items: stretch; }
    .wrapper { height: 100%; min-height: 0; display: flex; justify-content: center; }
    .viewport { height: 100%; width: auto; max-width: 100%; max-height: 100%; min-height: 0; aspect-ratio: 1000 / 920; }`,
};

const RES = [
  [1366, 768], [1280, 720], [1536, 864], [1600, 900], [1707, 960],
  [1920, 1080], [1920, 1200], [2048, 1152], [2560, 1440], [3840, 2160],
];

const PROBE = () => {
  const clipOf = (el) => {
    let r = { t: -1e9, b: 1e9, l: -1e9, rr: 1e9 }; let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowY !== "visible" || cs.overflowX !== "visible") {
        const bb = n.getBoundingClientRect();
        r = { t: Math.max(r.t, bb.top + parseFloat(cs.borderTopWidth)),
              b: Math.min(r.b, bb.bottom - parseFloat(cs.borderBottomWidth)),
              l: Math.max(r.l, bb.left + parseFloat(cs.borderLeftWidth)),
              rr: Math.min(r.rr, bb.right - parseFloat(cs.borderRightWidth)) };
      }
      n = n.parentElement;
    }
    return r;
  };
  const vp = document.querySelector(".viewport");
  const svg = document.querySelector("svg.field");
  const vr = vp.getBoundingClientRect();
  const sr = svg.getBoundingClientRect();
  const clip = clipOf(vp.parentElement);
  const ctm = svg.getScreenCTM();
  const svgClip = clipOf(svg);
  const hidden = [...document.querySelectorAll("[data-anchor]")].filter((g) => {
    const p = new DOMPoint(+g.dataset.x, +g.dataset.y).matrixTransform(ctm);
    return !(p.x >= svgClip.l && p.x <= svgClip.rr && p.y >= svgClip.t && p.y <= svgClip.b);
  }).map((g) => g.dataset.anchor);
  return {
    cut: +Math.max(0, vr.bottom - clip.b).toFixed(1),
    vpW: +vr.width.toFixed(0), vpH: +vr.height.toFixed(0),
    vpAr: +(vr.width / vr.height).toFixed(3),
    svgW: +sr.width.toFixed(0), svgH: +sr.height.toFixed(0),
    hidden,
  };
};

const browser = await pw.chromium.launch({ channel: "msedge" });
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();

for (const [name, css] of Object.entries(CANDIDATES)) {
  console.log(`\n══ ${name} ${"═".repeat(Math.max(0, 52 - name.length))}`);
  console.log("  해상도       구장 폭x높이    틀 비율   안 잘림   안 보이는 앵커");
  console.log("  " + "-".repeat(74));
  for (const [w, h] of RES) {
    await page.setViewportSize({ width: w, height: h });
    await page.goto(pathToFileURL(path.join(HERE, "pages", "STADIUM_GEUMGANG_UNIV__r90.html")).href, { waitUntil: "load" });
    if (css) await page.addStyleTag({ content: css });
    const r = await page.evaluate(PROBE);
    console.log("  " + `${w}x${h}`.padEnd(13)
      + `${r.vpW}x${r.vpH}`.padEnd(15)
      + String(r.vpAr).padStart(7)
      + (r.cut > 0.5 ? `  잘림 ${r.cut}` : "      OK").padStart(10)
      + "   " + (r.hidden.length ? r.hidden.join(",") : "-"));
  }
}
await browser.close();
console.log("\n  ⚠ 틀 비율 1.087이면 테두리가 구장을 정확히 감싼다 (viewBox 1000/920)");
