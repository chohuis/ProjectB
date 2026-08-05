"use strict";
/**
 * 어두운 화면의 색을 라이트 토큰으로 옮긴다.
 *
 *   node scripts/to-light.cjs <파일> [--apply]
 *
 * 옮길 화면이 열넷이라 손으로 하면 파일마다 다른 값이 나온다. 여기서
 * **역할로 분류**해 같은 규칙을 먹인다 — 색 하나하나가 아니라 색이 하는 일로.
 *
 * ⚠ **자동 변환은 초안이다.** 돌린 뒤 반드시 눈으로 본다. 특히
 *   - 의미색(초록/빨강/호박)은 배경인지 글자인지에 따라 다르게 간다
 *   - 팀 색(`--t-*`)이 들어갈 자리는 기계가 못 고른다
 *
 * 분류 기준
 *   명도 L*      역할              토큰
 *   ~22          바탕              --panel / --panel-sunk (색조 있으면 옅은 틴트)
 *   22~34        테두리            --line / --line-strong
 *   34~52        약한 글자         --ink-mute
 *   52~66        중간 글자         --ink-mid
 *   66~          밝은 글자         --ink  (의미색이면 --ok/--bad/--warn)
 */
const fs = require("node:fs");

const parse = (h) => {
  const x = h.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16) / 255);
};
const lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const Lstar = (h) => {
  const [r, g, b] = parse(h).map(lin);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y <= 216 / 24389 ? (y * 24389) / 27 : Math.cbrt(y) * 116 - 16;
};
const chroma = (h) => { const [r, g, b] = parse(h); return Math.max(r, g, b) - Math.min(r, g, b); };
const hue = (h) => {
  const [r, g, b] = parse(h);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), c = mx - mn;
  if (c < 0.04) return null;
  let x = mx === r ? ((g - b) / c) % 6 : mx === g ? (b - r) / c + 2 : (r - g) / c + 4;
  x *= 60;
  return x < 0 ? x + 360 : x;
};

/** 색조 계열 — 파랑/회색은 "중성"으로 본다(이 프로젝트의 기본 지면색이다) */
function family(h) {
  const c = chroma(h), u = hue(h);
  if (u == null || c < 0.06) return "neutral";
  if (u >= 90 && u < 165) return "green";
  if (u >= 340 || u < 20) return "red";
  if (u >= 20 && u < 60) return "amber";
  if (u >= 250 && u < 320) return "purple";
  return "neutral";           // 파랑·청록은 이 화면들의 중성색이다
}

const TINT = {
  green:  "rgba(31, 122, 71, 0.10)",
  red:    "rgba(179, 49, 31, 0.09)",
  amber:  "rgba(154, 101, 16, 0.12)",
  purple: "rgba(90, 58, 168, 0.10)",
};
const TINT_LINE = {
  green:  "rgba(31, 122, 71, 0.28)",
  red:    "rgba(179, 49, 31, 0.26)",
  amber:  "rgba(154, 101, 16, 0.30)",
  purple: "rgba(90, 58, 168, 0.26)",
};
const SEMANTIC = { green: "var(--ok)", red: "var(--bad)", amber: "var(--warn)", purple: "#5B3AA8" };

function mapColor(h) {
  const L = Lstar(h), f = family(h);
  if (L < 22) {
    if (f !== "neutral") return TINT[f];
    // 가장 어두운 층이 카드다. 그보다 조금 밝은 층은 가라앉은 면
    return L < 13 ? "var(--panel)" : "var(--panel-sunk)";
  }
  if (L < 34) {
    if (f !== "neutral") return TINT_LINE[f];
    return "var(--line)";
  }
  if (L < 52) return f !== "neutral" ? SEMANTIC[f] : "var(--ink-mute)";
  if (L < 66) return f !== "neutral" ? SEMANTIC[f] : "var(--ink-mid)";
  return f !== "neutral" ? SEMANTIC[f] : "var(--ink)";
}

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) { console.error("사용: node scripts/to-light.cjs <파일> [--apply]"); process.exit(1); }

const src = fs.readFileSync(file, "utf8");
const i = src.indexOf("<style>");
if (i < 0) { console.error("style 블록이 없다"); process.exit(1); }
const head = src.slice(0, i), css = src.slice(i);

const seen = new Map();
const out = css.replace(/#[0-9a-fA-F]{6}\b/g, (h) => {
  const to = mapColor(h);
  if (!seen.has(h)) seen.set(h, { to, n: 0, L: Lstar(h), f: family(h) });
  seen.get(h).n++;
  return to;
});

const rows = [...seen.entries()].sort((a, b) => a[1].L - b[1].L);
console.log(`${file}\n색 ${rows.length}종\n`);
console.log("  원본      L*    계열      →  토큰                          쓰임");
for (const [h, v] of rows) {
  console.log(`  ${h}  ${v.L.toFixed(1).padStart(5)}  ${v.f.padEnd(8)}  →  ${v.to.padEnd(28)} x${v.n}`);
}

if (apply) {
  fs.writeFileSync(file, head + out, "utf8");
  console.log("\n적용했다. ⚠ 반드시 눈으로 볼 것 — 자동 변환은 초안이다.");
} else {
  console.log("\n(미리보기. 적용하려면 --apply)");
}
