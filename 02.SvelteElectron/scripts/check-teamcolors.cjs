#!/usr/bin/env node
// 팀 색 검사 — 기본은 **검증**, `--write`면 국내 팀에 보조색을 배정한다.
//
//   npm run check:teamcolors           지금 데이터가 규칙을 지키는지 본다
//   node scripts/check-teamcolors.cjs --write   국내 팀 보조색을 새로 배정한다
//
// ⚠ 파생이 아니라 **데이터로 넣는다**(사용자 확정 B안). 나중에 팀별로 손으로
// 덮어쓸 수 있어야 하고, 그러려면 값이 파일에 있어야 한다.
//
// 짝은 실제 야구 유니폼 배색에서 온다. 남색↔빨강, 노랑↔검정처럼 관습이 있는
// 조합을 쓰고, 같은 색 라벨을 가진 팀들이 전부 똑같아지지 않게 팀 ID로
// 후보 중 하나를 결정적으로 고른다.
//
// 검증 두 가지를 통과해야 파일을 쓴다:
//   1. 보조색 위에 흰 글씨 — 대비 4.5:1 이상 (CTA 버튼)
//   2. 주색과 보조색의 색상 거리 60도 이상 (또는 무채색)

const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.cwd();
const FILE = path.join(ROOT, "resource/data/master/entities/refs.json");

// ── 색 유틸 ───────────────────────────────────────────────
const srgb = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function rgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.substr(i, 2), 16) / 255);
}
function lum(hex) {
  const [r, g, b] = rgb(hex).map(srgb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function Lstar(hex) {
  const y = lum(hex);
  return y <= 0.008856 ? y * 903.3 : 116 * Math.pow(y, 1 / 3) - 16;
}
/** 흰 글씨와의 대비비 */
function contrastWhite(hex) {
  return 1.05 / (lum(hex) + 0.05);
}
function hue(hex) {
  const [r, g, b] = rgb(hex);
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d < 0.02) return null;              // 무채색
  let h;
  if (mx === r) h = ((g - b) / d) % 6;
  else if (mx === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
function hueGap(a, b) {
  const ha = hue(a), hb = hue(b);
  if (ha === null || hb === null) return 999;   // 무채색은 항상 통과
  const d = Math.abs(ha - hb);
  return Math.min(d, 360 - d);
}

// ── 배색표 ────────────────────────────────────────────────
//
// 각 색 라벨에 어울리는 보조색 후보. 전부 흰 글씨가 얹히는 값이라
// L*이 낮거나 채도가 높다. 흰색·크림은 CTA로 못 쓰므로 넣지 않았다.
const PAIRS = {
  // ⚠ 검정(#1A1A1A)은 후보에 안 넣는다. 대비가 17:1이라 무조건 통과해서
  // 3분의 1이 검정으로 몰렸다(실측 57/182팀). 아래가 전부 실패할 때만
  // FALLBACK에서 검정이 나온다.
  //
  // ⚠ 금색은 #B8860B가 아니라 #8A6512다. 원래 값은 흰 글씨 대비가
  // 3.25:1이라 CTA로 못 쓴다 — 그래서 배정이 0팀이었다.
  "남색": ["#C8102E", "#8A6512", "#C1500F"],
  "파랑": ["#C8102E", "#8A6512", "#8A3B12"],
  "하늘": ["#123A6B", "#7B1E2B", "#8A3B12"],
  "청록": ["#C1500F", "#7B1E2B", "#123A6B"],
  "초록": ["#8A6512", "#7B1E2B", "#33296E"],
  "연두": ["#1A3C1F", "#33296E", "#7B1E2B"],
  "카키": ["#8A3B12", "#123A6B", "#6E1F4D"],
  "노랑": ["#123A6B", "#0F6B3C", "#6E1F4D"],
  "감귤": ["#123A6B", "#0E5A63", "#1A3C1F"],
  "주황": ["#123A6B", "#0E5A63", "#33296E"],
  "빨강": ["#123A6B", "#8A6512", "#0E5A63"],
  "자주": ["#8A6512", "#0F6B3C", "#0E5A63"],
  "분홍": ["#123A6B", "#0F6B3C", "#1A3C1F"],
  "보라": ["#8A6512", "#0F6B3C", "#C1500F"],
  "갈색": ["#0E5A63", "#123A6B", "#0F6B3C"],
  "회색": ["#C8102E", "#123A6B", "#0F6B3C"],
  "검정": ["#8A6512", "#C8102E", "#0F6B3C"],
};
// 라벨이 없거나 표에 없을 때
// 위 후보가 전부 탈락했을 때만 — 여기서 검정이 나온다
const FALLBACK = ["#123A6B", "#C8102E", "#7B1E2B", "#1A1A1A"];

/** 팀 ID로 후보 중 하나를 결정적으로 고른다 — 같은 라벨끼리 다 똑같아지지 않게 */
function pick(list, teamId) {
  let h = 2166136261;
  for (const ch of teamId) h = ((h ^ ch.charCodeAt(0)) * 16777619) >>> 0;
  return list[h % list.length];
}

// ── 실행 ─────────────────────────────────────────────────
const raw = fs.readFileSync(FILE, "utf8");
const data = JSON.parse(raw);
const teams = Array.isArray(data.teams) ? data.teams : Object.values(data.teams || {});

const DOMESTIC = new Set([
  "LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL",
]);

const WRITE = process.argv.includes("--write");

// ── 검증 모드 (기본) ──────────────────────────────────────
//
// ⚠ **파일에 있는 값을 그대로 본다.** 예전엔 미리보기가 메모리에서 다시
// 배정한 뒤 검증해서 무조건 통과했다 — 검사가 아니라 자기 확인이었다.
if (!WRITE) {
  const bad = [];
  let dom = 0;
  for (const t of teams) {
    if (!DOMESTIC.has(t.leagueId)) continue;   // 해외는 확장팩 · 기존 데이터 유지
    dom++;
    const c = t.colors || [];
    if (c.length < 2) { bad.push(`${t.id} ${t.name} — 색이 ${c.length}개`); continue; }
    const cr = contrastWhite(c[1]);
    if (cr < 4.5) bad.push(`${t.id} ${t.name} — 보조색 ${c[1]} 흰글씨 대비 ${cr.toFixed(2)}:1 (4.5 미만)`);
    const g = hueGap(c[0], c[1]);
    if (g < 60) bad.push(`${t.id} ${t.name} — 주색·보조색 색상차 ${g.toFixed(0)}° (60 미만)`);
  }
  console.log(`팀 색 검사 — 국내 ${dom}팀`);
  if (bad.length === 0) {
    console.log("  ok  전부 통과 (보조색 존재 · 흰글씨 대비 4.5:1 · 색상차 60°)");
    process.exit(0);
  }
  console.log(`FAIL  위반 ${bad.length}건`);
  console.log(bad.slice(0, 15).map((s2) => "  " + s2).join("\n"));
  if (bad.length > 15) console.log(`  … 외 ${bad.length - 15}건`);
  process.exit(1);
}

// ── 배정 모드 (--write) ───────────────────────────────────
let added = 0, skipped = 0;
const fails = [];
const sample = [];

for (const t of teams) {
  if (!DOMESTIC.has(t.leagueId)) { skipped++; continue; }
  if ((t.colors || []).length >= 2) { skipped++; continue; }

  const primary = t.colors[0];
  const cands = PAIRS[t.colorLabel] ?? FALLBACK;

  // 후보를 순서대로 보며 두 검증을 통과하는 첫 값을 쓴다
  const ordered = [pick(cands, t.id), ...cands, ...FALLBACK];
  let chosen = null;
  for (const c of ordered) {
    if (contrastWhite(c) < 4.5) continue;
    if (hueGap(primary, c) < 60) continue;
    chosen = c;
    break;
  }
  if (!chosen) {
    fails.push(`${t.id} ${t.name} ${primary} (${t.colorLabel}) — 통과 후보 없음`);
    continue;
  }
  t.colors = [primary, chosen];
  added++;
  if (sample.length < 14 && t.leagueId === "LEAGUE_KBL") {
    sample.push(`  ${t.name.padEnd(16)} ${primary} + ${chosen}  ` +
      `L*${Lstar(primary).toFixed(0).padStart(2)} → ${Lstar(chosen).toFixed(0).padStart(2)} · ` +
      `대비 ${contrastWhite(chosen).toFixed(1)}:1 · 색상차 ${hueGap(primary, chosen) === 999 ? "무채" : hueGap(primary, chosen).toFixed(0) + "°"}`);
  }
}

console.log(`보조색 추가 ${added}팀 · 건너뜀 ${skipped}팀`);
if (sample.length) { console.log("\nKBL 예시:"); console.log(sample.join("\n")); }

// ── 전수 검증 ─────────────────────────────────────────────
const bad = [];
for (const t of teams) {
  const c = t.colors || [];
  if (c.length < 2) { bad.push(`${t.id} — 색이 ${c.length}개`); continue; }
  if (contrastWhite(c[1]) < 4.5) bad.push(`${t.id} ${t.name} — 보조색 대비 ${contrastWhite(c[1]).toFixed(2)}:1`);
  if (hueGap(c[0], c[1]) < 60) bad.push(`${t.id} ${t.name} — 색상차 ${hueGap(c[0], c[1]).toFixed(0)}°`);
}
console.log(`\n전수 검증 ${teams.length}팀 → 위반 ${bad.length}건`);
if (bad.length) {
  console.log(bad.slice(0, 12).map((s) => "  " + s).join("\n"));
  if (bad.length > 12) console.log(`  … 외 ${bad.length - 12}건`);
}

if (fails.length) {
  console.log(`\n배정 실패 ${fails.length}건`);
  console.log(fails.slice(0, 8).map((s) => "  " + s).join("\n"));
}

const write = process.argv.includes("--write");
if (!write) { console.log("\n(미리보기만 — 적용하려면 --write)"); process.exit(0); }

// 해외 팀 위반은 기존 데이터라 그대로 둔다. 국내 배정 실패만 막는다.
if (fails.length) { console.error("\n국내 배정 실패가 있어 쓰지 않는다"); process.exit(1); }
fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + "\n", "utf8");
console.log("\nrefs.json 갱신 완료");
