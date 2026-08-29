/**
 * 해상도 × 구장 전수 계측.
 *
 * 재는 것 셋:
 *  ① `.viewport`가 조상 클립 상자를 얼마나 벗어나나 (px)
 *  ② 앵커(홈·포수·타자·수비 아홉·주자)가 보이나
 *  ③ 오른쪽 칸 높이를 바꿔도 왼쪽 기하가 같은가 (모델 가정 검증)
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
// ⚠ Windows 절대 경로를 `import`에 그대로 주면 ERR_UNSUPPORTED_ESM_URL_SCHEME이다
//   (CLAUDE.md에 적힌 그 함정 — `npm run smoke`가 통째로 안 돌던 원인).
const require_ = createRequire(import.meta.url);
const pw = require_("playwright-core");

// 산출물은 저장소 밖 임시 폴더에 둔다 — git에 안 들어간다
const HERE = path.join(os.tmpdir(), "projectb-parkclip");
fs.mkdirSync(HERE, { recursive: true });
const PAGES = path.join(HERE, "pages");

/**
 * CSS 픽셀 기준 뷰포트. Electron은 `fullscreen: true`라 화면 크기 그대로 뜨고,
 * Windows 배율(125·150%)이 CSS 픽셀을 나눈다 — 그래서 실제로 겪는 값은
 * 모니터 해상도가 아니라 아래 값들이다.
 */
const RESOLUTIONS = [
  { w: 1366, h: 768, note: "노트북 FHD 미만" },
  { w: 1280, h: 720, note: "FHD @150%" },
  { w: 1536, h: 864, note: "FHD @125%" },
  { w: 1600, h: 900, note: "창모드 최소(minWidth/minHeight)" },
  { w: 1707, h: 960, note: "QHD @150%" },
  { w: 1920, h: 1080, note: "FHD @100%" },
  { w: 1920, h: 1200, note: "16:10" },
  { w: 2048, h: 1152, note: "QHD @125%" },
  { w: 2560, h: 1440, note: "QHD @100%" },
  { w: 3840, h: 2160, note: "4K @100%" },
];

const IN_PAGE = () => {
  const clipOf = (el) => {
    // overflow가 visible이 아닌 조상들의 패딩 상자를 전부 교집합한다
    let r = { l: -1e9, t: -1e9, rr: 1e9, b: 1e9 };
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      const oy = cs.overflowY, ox = cs.overflowX;
      if (ox !== "visible" || oy !== "visible") {
        const bb = n.getBoundingClientRect();
        const bl = parseFloat(cs.borderLeftWidth), bt = parseFloat(cs.borderTopWidth);
        const br = parseFloat(cs.borderRightWidth), bbw = parseFloat(cs.borderBottomWidth);
        r = {
          l: Math.max(r.l, bb.left + bl), t: Math.max(r.t, bb.top + bt),
          rr: Math.min(r.rr, bb.right - br), b: Math.min(r.b, bb.bottom - bbw),
        };
      }
      n = n.parentElement;
    }
    return r;
  };

  const vp = document.querySelector(".viewport");
  const svg = document.querySelector("svg.field");
  const sp = document.querySelector(".scene-panel");
  const sl = document.querySelector(".scene-layout");
  const fw = document.querySelector(".field-stage-wrap");
  const wr = document.querySelector(".wrapper");

  const vr = vp.getBoundingClientRect();
  const clip = clipOf(vp.parentElement);   // viewport 자신의 overflow는 빼고 조상만

  const ctm = svg.getScreenCTM();
  const toScreen = (x, y) => {
    const p = new DOMPoint(x, y).matrixTransform(ctm);
    return { x: p.x, y: p.y };
  };

  const svgClip = clipOf(svg);   // viewport의 overflow:hidden 포함
  const anchors = [...document.querySelectorAll("[data-anchor]")].map((g) => {
    const x = +g.dataset.x, y = +g.dataset.y;
    const s = toScreen(x, y);
    const R = 17;
    const inside =
      s.x - R >= svgClip.l - 0.5 && s.x + R <= svgClip.rr + 0.5 &&
      s.y - R >= svgClip.t - 0.5 && s.y + R <= svgClip.b + 0.5;
    const centerInside =
      s.x >= svgClip.l && s.x <= svgClip.rr && s.y >= svgClip.t && s.y <= svgClip.b;
    return { k: g.dataset.anchor, vx: x, vy: y, sx: +s.x.toFixed(1), sy: +s.y.toFixed(1), inside, centerInside };
  });

  // viewBox 좌표계에서 실제로 보이는 세로 범위
  const inv = ctm.inverse();
  const top = new DOMPoint(vr.left + vr.width / 2, Math.max(clip.t, vr.top)).matrixTransform(inv);
  const bot = new DOMPoint(vr.left + vr.width / 2, Math.min(clip.b, vr.bottom)).matrixTransform(inv);

  const box = (el) => { const b = el.getBoundingClientRect(); return { w: +b.width.toFixed(1), h: +b.height.toFixed(1), top: +b.top.toFixed(1), bottom: +b.bottom.toFixed(1) }; };

  return {
    scenePanel: box(sp), sceneLayout: box(sl), fieldWrap: box(fw), wrapper: box(wr),
    viewport: box(vp), svg: box(svg),
    clip: { t: +clip.t.toFixed(1), b: +clip.b.toFixed(1), l: +clip.l.toFixed(1), r: +clip.rr.toFixed(1) },
    cutBottom: +Math.max(0, vr.bottom - clip.b).toFixed(1),
    cutTop: +Math.max(0, clip.t - vr.top).toFixed(1),
    cutLeft: +Math.max(0, clip.l - vr.left).toFixed(1),
    cutRight: +Math.max(0, vr.right - clip.rr).toFixed(1),
    visibleVb: { top: +top.y.toFixed(1), bottom: +bot.y.toFixed(1) },
    viewportMinHeightHit: Math.abs(vp.getBoundingClientRect().height - 280) < 0.6,
    anchors,
  };
};

const browser = await pw.chromium.launch({ channel: "msedge" });
const files = fs.readdirSync(PAGES).filter((f) => f.endsWith(".html"));
const out = [];

for (const res of RESOLUTIONS) {
  const ctx = await browser.newContext({ viewport: { width: res.w, height: res.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  for (const f of files) {
    await page.goto(pathToFileURL(path.join(PAGES, f)).href, { waitUntil: "load" });
    const m = await page.evaluate(IN_PAGE);
    const [stadium, rr] = f.replace(".html", "").split("__r");
    out.push({ res: `${res.w}x${res.h}`, note: res.note, stadium, right: +rr, tier: await page.evaluate(() => document.body.dataset.tier), ...m });
  }
  await ctx.close();
  process.stdout.write(`  ${res.w}x${res.h} 완료\n`);
}
await browser.close();

fs.writeFileSync(path.join(HERE, "result.json"), JSON.stringify(out, null, 1));
console.log(`\n측정 ${out.length}건 → result.json`);
