/**
 * 경기 화면 구장 잘림 계측 — 하네스 생성기
 *
 * 코드를 고치지 않는다. 진짜 소스에서 **CSS와 구조를 기계적으로 뽑아** 붙인다.
 *  - styles.css            전역 토큰·타이포
 *  - MatchPage.svelte      <style> 통째로
 *  - BaseballField.svelte  <style> 통째로 + SVG 구조
 *  - parkAnchors.ts        좌표 정본
 *
 * ⚠ 오른쪽 칸(right-column)은 Svelte 제어문 53개라 그대로 못 옮긴다.
 *   대신 **높이를 두 가지로** 넣어 왼쪽 기하가 안 변하는지 같이 잰다.
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";

import { fileURLToPath } from "node:url";
// 이 파일은 <repo>/02.SvelteElectron/scripts/parkclip/ 에 있다
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
// 산출물은 저장소 밖 임시 폴더에 둔다 — git에 안 들어간다
const OUT = path.join(os.tmpdir(), "projectb-parkclip");
fs.mkdirSync(OUT, { recursive: true });

const styleOf = (p) => {
  const s = fs.readFileSync(path.join(ROOT, p), "utf8");
  const i = s.indexOf("<style>");
  return s.slice(i + 7, s.lastIndexOf("</style>"));
};

const globalCss = fs.readFileSync(path.join(ROOT, "apps/ui/src/styles.css"), "utf8");
const matchCss = styleOf("apps/ui/src/pages/match/MatchPage.svelte");
const fieldCss = styleOf("apps/ui/src/features/match-view/ui/BaseballField.svelte");

const anchors = await import(
  pathToFileURL(path.join(ROOT, "apps/ui/src/shared/utils/parkAnchors.ts")).href
);
const { PARK_COORDS, PARK_TIER_OF, PARK_IMAGES, PARK_VIEWBOX } = anchors;

const PARK_DIR = pathToFileURL(path.join(ROOT, "resource/park")).href;

/** 9이닝 스코어보드 — 실제 마크업 그대로, 표현식만 값으로 바꿨다 */
const innings = Array.from({ length: 9 }, (_, i) => i + 1);
const scoreRow = (team, mark) => `
  <tr${mark ? ' class="my-team-row"' : ""}>
    <th class="team-col"><span class="team-cell"><span style="display:inline-block;width:16px;height:16px;background:#8899aa;border-radius:3px"></span><span class="team-name">${team}</span></span></th>
    ${innings.map((n) => `<td${n === 5 ? ' class="current-inning"' : ""}>${n <= 4 ? 0 : ""}</td>`).join("")}
    <td class="rhe r-col">0</td><td class="rhe">3</td><td class="rhe">0</td><td class="rhe">2</td>
  </tr>`;

const lineup = (side) => `
  <aside class="lineup-panel" aria-label="${side} lineup">
    <h3>${side === "away" ? "원정 타순" : "홈 타순"}</h3>
    <ol class="lineup-list">
      ${Array.from({ length: 9 }, (_, i) =>
        `<li${i === 2 ? ' class="at-bat"' : ""}><span class="lu-no">${i + 1}</span><span class="lu-name">선수${i + 1}</span></li>`
      ).join("")}
    </ol>
  </aside>`;

/** BaseballField의 SVG — 구조·속성을 원본 그대로 옮긴다 */
function fieldSvg(coords, imageUrl) {
  const R = 17;
  const d = coords.defense
    .map((p) => `
      <g data-anchor="${p.pos}" data-x="${p.x}" data-y="${p.y}">
        <ellipse cx="${p.x + 1}" cy="${p.y + R * 0.86}" rx="${R * 0.92}" ry="${R * 0.28}" fill="rgba(0,0,0,0.35)"/>
        <circle cx="${p.x}" cy="${p.y}" r="${R}" fill="#7a8a99" stroke="#e8e8c8" stroke-width="3"/>
        <text x="${p.x}" y="${p.y}" text-anchor="middle" dominant-baseline="central"
          font-size="${p.pos.length > 1 ? 13 : 16}" font-weight="800"
          font-family="'Courier New',monospace" fill="#0a1018">${p.pos}</text>
      </g>`)
    .join("");
  const f = coords.field;
  // 타자·주자 — PARK_SPRITE_OFFSETS를 적용한 실제 자리
  const o = anchors.PARK_SPRITE_OFFSETS;
  const bat = { x: f.home.x + o.batter.dx, y: f.home.y + o.batter.dy };
  const runners = [
    { k: "R1", x: f.first.x + o.runner.first.dx, y: f.first.y + o.runner.first.dy },
    { k: "R2", x: f.second.x + o.runner.second.dx, y: f.second.y + o.runner.second.dy },
    { k: "R3", x: f.third.x + o.runner.third.dx, y: f.third.y + o.runner.third.dy },
  ];
  const mk = (k, x, y, fill) => `
      <g data-anchor="${k}" data-x="${x}" data-y="${y}">
        <circle cx="${x}" cy="${y}" r="${R}" fill="${fill}" stroke="#f0ecc8" stroke-width="3"/>
      </g>`;
  return `
    <svg class="field retro-field" viewBox="0 0 ${PARK_VIEWBOX.width} ${PARK_VIEWBOX.height}" preserveAspectRatio="xMidYMid meet">
      <image href="${imageUrl}" x="0" y="0" width="1000" height="920" preserveAspectRatio="xMidYMid meet"/>
      <g data-anchor="HOMEPLATE" data-x="${f.home.x}" data-y="${f.home.y}">
        <rect x="${f.home.x - 5}" y="${f.home.y - 5}" width="10" height="10" fill="#ff00ff"/>
      </g>
      ${d}
      ${mk("BATTER", bat.x, bat.y, "#b0503f")}
      ${runners.map((r) => mk(r.k, r.x, r.y, "#b0503f")).join("")}
      <rect x="${f.home.x - 4}" y="${f.home.y - 45 - 4}" width="8" height="8" fill="#f0ecc8" stroke="#c8c8a0"/>
    </svg>`;
}

/** 오른쪽 칸 — 자연 높이를 인자로 조절해 왼쪽에 영향이 있는지 본다 */
function rightColumn(rows) {
  const panel = (h) => `<div class="panel" style="min-height:${h}px"><h2>칸</h2></div>`;
  return `
  <div class="right-column">
    <div class="pair-row">${panel(rows)}${panel(rows)}</div>
    <div class="pair-row">${panel(rows)}${panel(rows)}</div>
    <div class="panel watch-panel">${panel(rows)}</div>
  </div>`;
}

function html(stadiumId, rightRows) {
  const tier = PARK_TIER_OF[stadiumId] ?? "pro";
  const coords = PARK_COORDS[tier];
  const img = PARK_IMAGES.has(stadiumId)
    ? `${PARK_DIR}/${stadiumId}.png`
    : `${PARK_DIR}/${{ pro: "probaseball", university: "universitybaseball", highschool: "highschoolbaseball" }[tier]}.gif`;

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>park clip harness</title>
<style>${globalCss}</style>
<style>${matchCss}</style>
<style>${fieldCss}</style>
<style>
  /* 하네스 전용 — 진짜 앱에는 없다. 스크롤바가 계측을 흔들지 않게만 한다 */
  html, body { margin:0; padding:0; overflow:hidden; }
</style>
</head><body data-stadium="${stadiumId}" data-tier="${tier}">
<section class="match-engine-empty" aria-label="match engine workspace">
  <div class="match-bar">
    <span class="mode-chip">마운드</span>
    <span class="bar-inning">5회초</span>
    <span class="bar-park">
      <span class="chip-mini">맑음</span>
      <span class="chip-mini">${stadiumId || "기본"}</span>
    </span>
    <button class="exit-btn" type="button">나가기</button>
  </div>

  <div class="scoreboard-wrap">
    <table class="scoreboard" aria-label="baseball scoreboard">
      <thead><tr><th class="team-col">팀</th>
        ${innings.map((n) => `<th${n === 5 ? ' class="current-inning"' : ""}>${n}</th>`).join("")}
        <th>R</th><th>H</th><th>E</th><th>B</th></tr></thead>
      <tbody>${scoreRow("원정팀", false)}${scoreRow("홈팀", true)}</tbody>
    </table>
  </div>

  <div class="engine-grid">
    <div class="left-column">
      <section class="scene-panel" aria-label="match scene">
        <div class="panel-head">
          <span class="inning-badge">5회초</span>
          <span class="pos-badge">선택: P</span>
        </div>
        <div class="scene-layout">
          ${lineup("away")}
          <div class="field-stage-wrap">
            <div class="wrapper">
              <div class="viewport retro-viewport">
                ${fieldSvg(coords, img)}
              </div>
            </div>
          </div>
          ${lineup("home")}
        </div>
      </section>
      <section class="play-text-panel" aria-label="play by play"><p>중계</p></section>
    </div>
    ${rightColumn(rightRows)}
  </div>
</section>
</body></html>`;
}

// ── 파일로 굽는다 ──────────────────────────────────────────────
const dir = path.join(OUT, "pages");
fs.mkdirSync(dir, { recursive: true });
const ids = [...Object.keys(PARK_TIER_OF), ""]; // "" = 구장 미정(해외 포함) 기본값
let n = 0;
for (const id of ids) {
  for (const rr of [90, 260]) {
    fs.writeFileSync(path.join(dir, `${id || "_DEFAULT"}__r${rr}.html`), html(id, rr));
    n++;
  }
}
console.log(`하네스 ${n}장 · 구장 ${ids.length}종 × 오른쪽칸 2가지`);
console.log(`  ${dir}`);
