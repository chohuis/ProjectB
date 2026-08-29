/**
 * 광택이 글자 대비를 얼마나 깎나 — **실제로 칠해진 픽셀**을 읽어 잰다.
 *
 * 검사(`stoneMarkTeams.test.ts`)는 `contrast(팀색, inkFor(팀색))`을 잰다.
 * 그런데 화면에는 그 위에 광택 그라디언트가 한 겹 더 올라간다.
 * **재는 색과 칠해지는 색이 다르다.**
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";
const require_ = createRequire(import.meta.url);
const pw = require_("playwright-core");

import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const TEAMS = path.join(ROOT, "resource/data/master/teams");

const walk = (d) => fs.readdirSync(d, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const teams = walk(TEAMS).filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(f, "utf8")))
  .filter((j) => j.colors)
  .map((j) => ({ id: j.teamId ?? "?", main: j.colors[0], sub: j.colors[1] }));

const OUT = path.join(os.tmpdir(), "projectb-parkclip");
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "teams.json"), JSON.stringify(teams));

const browser = await pw.chromium.launch({ channel: "msedge" });
const page = await (await browser.newContext({ deviceScaleFactor: 1 })).newPage();
await page.goto("about:blank");

const result = await page.evaluate(async (teams) => {
  const R = 17, RIM = R * 0.16, S = 80;   // 실제 반지름 17, 확대해 그린다
  const K = 4;                            // 4배로 그려 표본을 넉넉히

  const rgbOf = (hex) => {
    const h = hex.replace("#", "").trim();
    const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    const n = parseInt(s.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const lum = (rgb) => {
    const [r, g, b] = rgb.map((v) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const la = lum(a), lb = lum(b); const [hi, lo] = la > lb ? [la, lb] : [lb, la]; return (hi + 0.05) / (lo + 0.05); };
  const inkFor = (hex) => { const l = lum(rgbOf(hex)); return ((l + 0.05) / 0.05) >= (1.05 / (l + 0.05)) ? [20, 20, 26] : [255, 255, 255]; };

  const svgOf = (main, sub, gloss) => `<svg xmlns="http://www.w3.org/2000/svg" width="${S * K}" height="${S * K}" viewBox="0 0 ${S} ${S}">
    <defs><radialGradient id="g" cx="33%" cy="30%" r="78%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="42%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.42"/>
    </radialGradient></defs>
    <rect width="${S}" height="${S}" fill="#3f6b45"/>
    <circle cx="${S / 2}" cy="${S / 2}" r="${R}" fill="${main}" stroke="${sub}" stroke-width="${RIM}"/>
    ${gloss ? `<circle cx="${S / 2}" cy="${S / 2}" r="${R - RIM / 2}" fill="url(#g)"/>` : ""}
  </svg>`;

  const cvs = document.createElement("canvas");
  cvs.width = S * K; cvs.height = S * K;
  const ctx = cvs.getContext("2d");

  /** 글자가 놓이는 자리(알 중앙) 둘레에서 평균색을 읽는다 */
  const sample = async (svg) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg); });
    ctx.clearRect(0, 0, cvs.width, cvs.height);
    ctx.drawImage(img, 0, 0);
    // 글자 상자(대략 폭 2R*0.7 × 높이 2R*0.5) 안을 훑는다
    const cx = (S / 2) * K, cy = (S / 2) * K;
    const hw = R * 0.7 * K, hh = R * 0.5 * K;
    const d = ctx.getImageData(Math.round(cx - hw), Math.round(cy - hh), Math.round(hw * 2), Math.round(hh * 2)).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return [r / n, g / n, b / n];
  };

  const out = [];
  for (const t of teams) {
    const ink = inkFor(t.main);
    const withG = await sample(svgOf(t.main, t.sub, true));
    const noG = await sample(svgOf(t.main, t.sub, false));
    out.push({
      id: t.id, main: t.main,
      test: contrast(rgbOf(t.main), ink),   // 검사가 재는 값
      real: contrast(withG, ink),           // 광택 있음 — 실제
      flat: contrast(noG, ink),             // 광택 없음
      inkWhite: ink[0] === 255,
    });
  }
  return out;
}, teams);

await browser.close();

const bad = result.filter((r) => r.real < 4.0);
const worse = result.filter((r) => r.real < r.test - 0.05);
console.log(`팀 ${result.length}개\n`);
console.log(`  검사가 재는 값(광택 전)이 4.0 미만        ${result.filter((r) => r.test < 4).length}개`);
console.log(`  실제로 칠해진 값(광택 후)이 4.0 미만      ${bad.length}개   ← 검사가 못 잡는다`);
console.log(`  광택 때문에 대비가 떨어진 팀              ${worse.length}개`);
console.log(`  광택을 빼면 4.0 미만                     ${result.filter((r) => r.flat < 4).length}개\n`);

const show = [...result].sort((a, b) => a.real - b.real).slice(0, 12);
console.log("  가장 나쁜 12팀           검사값   광택O   광택X   글자");
console.log("  " + "-".repeat(62));
for (const r of show) {
  console.log("  " + String(r.id).slice(0, 22).padEnd(23) + r.main.padEnd(9)
    + r.test.toFixed(2).padStart(6) + r.real.toFixed(2).padStart(8) + r.flat.toFixed(2).padStart(8)
    + (r.inkWhite ? "   흰" : "   검"));
}
fs.writeFileSync(path.join(OUT, "gloss-contrast.json"), JSON.stringify(result, null, 1));
