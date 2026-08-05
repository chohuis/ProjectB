"use strict";
/**
 * 구장 그림 위에 그 티어의 앵커를 찍어 눈으로 확인한다.
 * 실행: node scripts/park-overlay.cjs STADIUM_MIREU,STADIUM_HANGANG [출력폴더]
 *
 * 수치만 보면 놓친다 — 잔차가 작아도 엉뚱한 걸 베이스로 잡았을 수 있다.
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const PARK = path.join(__dirname, "../resource/park");
const SPEC = path.join(PARK, "_spec");
const A = JSON.parse(fs.readFileSync(path.join(SPEC, "anchors.json"), "utf8"));
const stadiums = JSON.parse(fs.readFileSync(path.join(SPEC, "stadiums.json"), "utf8"));

const TIER_KEY = { "프로": "pro", "대학": "university", "독립": "university", "고교": "highschool" };
const CW = A.coordSpace.width, CH = A.coordSpace.height;

const OUT = process.argv[3] || path.join(__dirname, "_overlay");
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

function draw(id) {
  const s = stadiums.find((x) => x.id === id);
  if (!s) { console.error(`${id}: stadiums.json에 없다`); return; }
  const tier = TIER_KEY[s.tier];
  const set = A.tiers[tier];
  const img = PNG.sync.read(fs.readFileSync(path.join(PARK, `${id}.png`)));

  // 코드 좌표 → 이미지 픽셀 (xMidYMid meet의 역)
  const sc = Math.min(CW / img.width, CH / img.height);
  const ox = (CW - img.width * sc) / 2, oy = (CH - img.height * sc) / 2;
  const toPx = (x, y) => [Math.round((x - ox) / sc), Math.round((y - oy) / sc)];

  const put = (x, y, c) => {
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const i = (img.width * y + x) << 2;
    img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
  };
  const mark = (cx, cy, col) => {
    for (let d = 4; d <= 18; d++) { put(cx + d, cy, col); put(cx - d, cy, col); put(cx, cy + d, col); put(cx, cy - d, col); }
    for (let t = 0; t < 72; t++) {
      const r = (t / 72) * Math.PI * 2;
      put(cx + Math.round(9 * Math.cos(r)), cy + Math.round(9 * Math.sin(r)), col);
    }
  };

  // 베이스 = 빨강, 수비 위치 = 청록
  for (const [, p] of Object.entries(set.field)) mark(...toPx(p[0], p[1]), [255, 40, 40]);
  for (const [, p] of Object.entries(set.defense)) mark(...toPx(p[0], p[1]), [0, 255, 255]);

  const dst = path.join(OUT, `${id}.png`);
  fs.writeFileSync(dst, PNG.sync.write(img));
  console.log(`${dst}  (${s.tier} → ${tier})`);
}

for (const id of (process.argv[2] || "").split(",").filter(Boolean)) draw(id.replace(/\.png$/, ""));
