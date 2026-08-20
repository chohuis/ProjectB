"use strict";
/**
 * 티어별 구장 좌표 산출 — `resource/park/_spec/anchors.json`을 만든다.
 * 실행: npm run fit:park
 *
 * ## 왜 필요한가
 *
 * 원본 GIF 3개는 **각각 따로 그린 구장**이다. 크기부터 다르고
 * (1306x1204 / 1317x1194 / 1308x1203) 내야 다이아몬드 위치도 다르다.
 * 구장 27장은 각자 제 티어 기준 그림을 충실히 따랐으므로, 좌표도 티어마다
 * 있어야 한다. 게임은 지금까지 프로 GIF 하나만 하드코딩으로 띄웠기 때문에
 * 이 어긋남이 드러나지 않았을 뿐이다.
 *
 * ## 어떻게
 *
 * 앵커 13개를 티어마다 손으로 재지 않는다. **베이스 4개의 대응점**으로
 * 축별 1차 변환(x' = ax + b, y' = cy + d)을 최소제곱 적합한 뒤 프로 앵커
 * 전체에 먹인다. 이러면 "스프라이트 발밑은 베이스보다 조금 위"라는 관계가
 * 세 티어에서 똑같이 유지된다 — 앵커를 하나씩 재면 그 관계가 티어마다
 * 조금씩 달라져 주자만 어색해진다.
 *
 * ## 🔴 2026-08-20 — 이 도구는 지금 정본이 아니다
 *
 * **"프로 좌표는 손대지 않는다"는 전제가 틀렸다.** 프로 앵커 자체가 그림과
 * 어긋나 있었는데(다이아몬드가 세로로 17% 길고 마운드가 홈→2루 72% 지점),
 * 그 프로에 대학·고교를 맞추었으니 **셋이 같이 틀어졌다.** 1루수·3루수가
 * 베이스보다 42px 위 잔디에 떠 있었고 투수는 마운드보다 69px 위였다.
 *
 * 지금 `anchors.json`에 든 값은 **구장 27장을 전부 재서 잡은 것**이다
 * (04 `data/parks.json`). 티어마다 픽셀 단위로 같은 값이 나왔다.
 * **이 스크립트를 그대로 다시 돌리면 옛 값으로 되돌아간다.**
 * 고치려면 프로도 그림에서 재야 하고, 마운드는 축별 1차 변환으로 안 맞는다
 * (앵커는 홈→2루의 72%인데 그림은 64%다 — 투수판을 따로 재야 한다).
 * `parkAnchorGeometry.test.ts`가 되돌아가는 것을 잡는다.
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");

const SPEC = path.join(__dirname, "../resource/park/_spec");
const read = (p) => PNG.sync.read(fs.readFileSync(p));

// BaseballField의 viewBox. 이미지가 이 상자 안에 xMidYMid meet으로 들어간다
const CW = 1000, CH = 920;

/** 코드 좌표계 ↔ 이미지 픽셀. preserveAspectRatio="xMidYMid meet" */
function mapping(img) {
  const s = Math.min(CW / img.width, CH / img.height);
  const ox = (CW - img.width * s) / 2, oy = (CH - img.height * s) / 2;
  return {
    toCode: (x, y) => [x * s + ox, y * s + oy],
    toPx: (x, y) => [(x - ox) / s, (y - oy) / s],
  };
}

/**
 * 창 안에서 흰 덩어리(베이스) 하나를 찾는다.
 * 파울라인은 가늘고 길어서 종횡비로 걸러낸다.
 */
function findBase(img, cxPx, cyPx, win) {
  const { width: w, height: h, data } = img;
  const x0 = Math.max(0, Math.round(cxPx - win)), x1 = Math.min(w, Math.round(cxPx + win));
  const y0 = Math.max(0, Math.round(cyPx - win)), y1 = Math.min(h, Math.round(cyPx + win));

  const isW = (x, y) => {
    const p = (y * w + x) << 2;
    return data[p] > 200 && data[p + 1] > 200 && data[p + 2] > 190;
  };
  const seen = new Set();
  let best = null;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const key = y * w + x;
    if (!isW(x, y) || seen.has(key)) continue;
    const stack = [[x, y]]; seen.add(key);
    let n = 0, sx = 0, sy = 0, mnx = w, mxx = 0, mny = h, mxy = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop();
      n++; sx += cx; sy += cy;
      if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx;
      if (cy < mny) mny = cy; if (cy > mxy) mxy = cy;
      for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < x0 || ny < y0 || nx >= x1 || ny >= y1) continue;
        const k = ny * w + nx;
        if (!seen.has(k) && isW(nx, ny)) { seen.add(k); stack.push([nx, ny]); }
      }
    }
    const bw = mxx - mnx + 1, bh = mxy - mny + 1;
    const ratio = Math.max(bw / bh, bh / bw);
    // 베이스만 남긴다. 실측한 베이스는 전부 26x22 이하이고,
    // **타자 박스 외곽선은 32~45로 뚜렷이 크다** — 창을 넓혔더니 고교 홈플레이트가
    // 박스에 밀려 x가 20px 어긋났다. 크기로 가르는 게 거리로 가르는 것보다 확실하다.
    // 2루는 원경이라 작다 (대학 기준 15x10, 약 100px).
    if (n < 45 || n > 900 || ratio > 2.6 || bw > 30 || bh > 28) continue;
    const d = Math.hypot(sx / n - cxPx, sy / n - cyPx);
    // 큰 덩어리를 먼저 — 베이스는 꽉 찬 흰 도형이고 남은 잡티는 잘다.
    // 크기가 비슷하면 창 중심에 가까운 쪽.
    if (!best || n > best.n * 1.25 || (n > best.n * 0.8 && d < best.d)) {
      best = { x: sx / n, y: sy / n, n, bw, bh, d };
    }
  }
  return best;
}

// ── 프로 정본 (지금 코드에 있는 값. 바꾸지 않는다) ────────────────
const PRO_FIELD = {
  HOME: [497, 790], B1: [715, 580], B2: [497, 454], B3: [280, 580], P: [497, 548],
};
const PRO_DEFENSE = {
  P: [497, 548], C: [497, 800], "1B": [710, 588], "2B": [600, 508], SS: [387, 508],
  "3B": [272, 588], LF: [242, 518], CF: [497, 434], RF: [752, 518],
};
/** 스프라이트 미세 오프셋 — 티어가 달라도 그대로 쓴다 (발밑 규칙) */
const OFFSETS = {
  batter: { dx: 34, dy: -22 },
  runner: { B1: [14, -18], B2: [0, -20], B3: [-14, -18] },
};

const TIERS = {
  pro:        "reference_pro.png",
  university: "reference_university.png",
  highschool: "reference_highschool.png",
};

/** 베이스를 찾을 때 쓰는 시작 추정 — 프로 좌표를 그 그림 픽셀로 옮긴 값 */
const BASE_KEYS = ["HOME", "B1", "B2", "B3"];

function measureBases(img) {
  const map = mapping(img);
  const out = {};
  for (const k of BASE_KEYS) {
    const [cx, cy] = PRO_FIELD[k];
    // 프로 좌표는 발밑이라 베이스보다 위에 있다. 아래로 훑도록 창을 내린다
    const guessCode = [cx, cy + 45];
    const [gx, gy] = map.toPx(guessCode[0], guessCode[1]);
    // 창을 넉넉히 — 85로는 대학 2루가 2px 차이로 밖에 있었다
    const b = findBase(img, gx, gy, 120);
    out[k] = b ? { px: [b.x, b.y], code: map.toCode(b.x, b.y), n: b.n } : null;
  }
  return out;
}

/** y = a*x + b 최소제곱 */
function fit1d(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
  const a = den === 0 ? 1 : num / den;
  return { a, b: my - a * mx };
}

const measured = {};
for (const [tier, f] of Object.entries(TIERS)) {
  const img = read(path.join(SPEC, f));
  measured[tier] = { img: `${img.width}x${img.height}`, bases: measureBases(img) };
}

console.log("기준 그림에서 찾은 베이스 (코드 좌표계 1000x920)\n");
console.log("  티어         이미지        HOME            1루             2루             3루");
for (const [tier, m] of Object.entries(measured)) {
  const cells = BASE_KEYS.map((k) => {
    const b = m.bases[k];
    return (b ? `${b.code[0].toFixed(0)},${b.code[1].toFixed(0)}` : "못찾음").padEnd(15);
  });
  console.log(`  ${tier.padEnd(12)} ${m.img.padEnd(12)} ${cells.join(" ")}`);
}

// 프로 기준 대응으로 티어별 변환 적합
const proBases = measured.pro.bases;
const transforms = { pro: { x: { a: 1, b: 0 }, y: { a: 1, b: 0 } } };

for (const tier of ["university", "highschool"]) {
  const tb = measured[tier].bases;
  const usable = BASE_KEYS.filter((k) => proBases[k] && tb[k]);
  if (usable.length < 3) {
    console.error(`\nFAIL ${tier}: 대응점이 ${usable.length}개뿐이라 변환을 못 맞춘다`);
    process.exit(1);
  }
  const px = usable.map((k) => proBases[k].code[0]);
  const tx = usable.map((k) => tb[k].code[0]);
  const py = usable.map((k) => proBases[k].code[1]);
  const ty = usable.map((k) => tb[k].code[1]);
  transforms[tier] = { x: fit1d(px, tx), y: fit1d(py, ty), usedPoints: usable };
}

console.log("\n적합된 변환 (프로 좌표 → 티어 좌표)");
for (const [tier, t] of Object.entries(transforms)) {
  console.log(`  ${tier.padEnd(12)} x' = ${t.x.a.toFixed(4)}x ${t.x.b >= 0 ? "+" : "-"} ${Math.abs(t.x.b).toFixed(1)}` +
    `   y' = ${t.y.a.toFixed(4)}y ${t.y.b >= 0 ? "+" : "-"} ${Math.abs(t.y.b).toFixed(1)}` +
    (t.usedPoints ? `   (대응 ${t.usedPoints.length}점)` : ""));
}

// 잔차 — 변환이 실제로 맞나
console.log("\n적합 잔차 (px, 코드 좌표계)");
for (const tier of ["university", "highschool"]) {
  const t = transforms[tier], tb = measured[tier].bases;
  const res = BASE_KEYS.filter((k) => proBases[k] && tb[k]).map((k) => {
    const [pxx, pyy] = proBases[k].code;
    const ex = t.x.a * pxx + t.x.b, ey = t.y.a * pyy + t.y.b;
    return { k, d: Math.hypot(ex - tb[k].code[0], ey - tb[k].code[1]) };
  });
  console.log(`  ${tier.padEnd(12)} ` + res.map((r) => `${r.k} ${r.d.toFixed(1)}`).join("  ") +
    `   최대 ${Math.max(...res.map((r) => r.d)).toFixed(1)}`);
}

// ── 결과 조립 ──────────────────────────────────────────────────
const apply = (t, [x, y]) => [
  Math.round(t.x.a * x + t.x.b),
  Math.round(t.y.a * y + t.y.b),
];

const out = {
  _note: "티어별 구장 좌표. scripts/fit-park-anchors.cjs가 생성한다 — 손으로 고치지 말 것.",
  _why: "원본 구장 그림 3장이 각각 따로 그려져 내야 위치가 다르다. 구장 27장은 각자 제 티어 기준을 따랐으므로 좌표도 티어마다 있어야 한다.",
  _method: "프로 좌표는 정본 그대로 두고, 베이스 4점 대응으로 축별 1차 변환을 적합해 나머지 티어로 옮긴다.",
  coordSpace: { width: CW, height: CH, note: "BaseballField의 viewBox. 이미지는 xMidYMid meet으로 이 상자에 들어간다" },
  anchorMeaning: "스프라이트의 발이 놓이는 지점. 베이스 그림의 중심이 아니라 그보다 조금 위다. 스프라이트는 (x-24, y-44)에 48x52로 그려진다.",
  spriteOffsets: OFFSETS,
  tiers: {},
  _measured: {},
};

for (const tier of Object.keys(TIERS)) {
  const t = transforms[tier];
  out.tiers[tier] = {
    field: Object.fromEntries(Object.entries(PRO_FIELD).map(([k, v]) => [k, apply(t, v)])),
    defense: Object.fromEntries(Object.entries(PRO_DEFENSE).map(([k, v]) => [k, apply(t, v)])),
  };
  out._measured[tier] = {
    image: measured[tier].img,
    bases: Object.fromEntries(BASE_KEYS.map((k) => [k, measured[tier].bases[k]
      ? measured[tier].bases[k].code.map((v) => Math.round(v)) : null])),
    transform: { x: t.x, y: t.y },
  };
}

console.log("\n산출된 티어별 좌표");
for (const [tier, v] of Object.entries(out.tiers)) {
  console.log(`  ${tier}`);
  console.log(`    field   ` + Object.entries(v.field).map(([k, p]) => `${k} ${p[0]},${p[1]}`).join("  "));
  console.log(`    defense ` + Object.entries(v.defense).map(([k, p]) => `${k} ${p[0]},${p[1]}`).join("  "));
}

const dst = path.join(SPEC, "anchors.json");
fs.writeFileSync(dst, JSON.stringify(out, null, 2) + "\n", "utf8");
console.log(`\n→ ${path.relative(process.cwd(), dst)}`);

// ── UI가 쓸 TS 모듈도 같이 낸다 ────────────────────────────────
//
// 런타임에 fetch 하지 않는다. 좌표는 화면 기하이지 밸런스 수치가 아니라서
// 비동기로 늦게 오면 첫 프레임이 엉뚱한 자리에 그려진다. `index.d.ts`처럼
// **생성물이므로 손으로 고치지 말 것.**
const stadiums = JSON.parse(fs.readFileSync(path.join(SPEC, "stadiums.json"), "utf8"));
const TIER_KEY = { "프로": "pro", "대학": "university", "독립": "university", "고교": "highschool" };

const pt = (p) => `{ x: ${p[0]}, y: ${p[1]} }`;
const tierBlock = (t) => {
  const v = out.tiers[t];
  return `  ${t}: {
    field: {
      home: ${pt(v.field.HOME)}, first: ${pt(v.field.B1)}, second: ${pt(v.field.B2)},
      third: ${pt(v.field.B3)}, mound: ${pt(v.field.P)},
    },
    defense: [
${Object.entries(v.defense).map(([k, p]) => `      { pos: "${k}", x: ${p[0]}, y: ${p[1]} },`).join("\n")}
    ],
  },`;
};

const ts = `// 이 파일은 \`npm run fit:park\`이 만든다. **직접 편집하지 말 것.**
//
// 원본 구장 그림 3장(probaseball / universitybaseball / highschoolbaseball)은
// 각각 따로 그려져 내야 다이아몬드 위치가 다르다. 구장 27장은 각자 제 티어
// 기준 그림을 따랐으므로 좌표도 티어마다 있어야 한다.
//
// 프로 좌표는 예전부터 쓰던 정본 그대로다. 나머지 두 티어는 베이스 4점
// 대응으로 축별 1차 변환을 적합해 옮겼다 — 그래야 "스프라이트 발밑은
// 베이스보다 조금 위"라는 관계가 세 티어에서 똑같이 유지된다.
//
// 적합 잔차: 대학 최대 ${(() => {
    const t = transforms.university, tb = measured.university.bases;
    return Math.max(...BASE_KEYS.filter((k) => proBases[k] && tb[k]).map((k) => {
      const [x, y] = proBases[k].code;
      return Math.hypot(t.x.a * x + t.x.b - tb[k].code[0], t.y.a * y + t.y.b - tb[k].code[1]);
    })).toFixed(1);
  })()}px · 고교 최대 ${(() => {
    const t = transforms.highschool, tb = measured.highschool.bases;
    return Math.max(...BASE_KEYS.filter((k) => proBases[k] && tb[k]).map((k) => {
      const [x, y] = proBases[k].code;
      return Math.hypot(t.x.a * x + t.x.b - tb[k].code[0], t.y.a * y + t.y.b - tb[k].code[1]);
    })).toFixed(1);
  })()}px (좌표계 ${CW}x${CH})

export type ParkTier = "pro" | "university" | "highschool";

export interface ParkPoint { x: number; y: number }
export interface ParkDefender { pos: string; x: number; y: number }
export interface ParkCoords {
  field: { home: ParkPoint; first: ParkPoint; second: ParkPoint; third: ParkPoint; mound: ParkPoint };
  defense: readonly ParkDefender[];
}

/** BaseballField의 viewBox */
export const PARK_VIEWBOX = { width: ${CW}, height: ${CH} } as const;

/** 스프라이트 미세 오프셋 — 티어와 무관하게 같다 */
export const PARK_SPRITE_OFFSETS = {
  batter: { dx: ${OFFSETS.batter.dx}, dy: ${OFFSETS.batter.dy} },
  runner: {
    first:  { dx: ${OFFSETS.runner.B1[0]}, dy: ${OFFSETS.runner.B1[1]} },
    second: { dx: ${OFFSETS.runner.B2[0]}, dy: ${OFFSETS.runner.B2[1]} },
    third:  { dx: ${OFFSETS.runner.B3[0]}, dy: ${OFFSETS.runner.B3[1]} },
  },
} as const;

export const PARK_COORDS: Record<ParkTier, ParkCoords> = {
${["pro", "university", "highschool"].map(tierBlock).join("\n")}
};

/** 구장 → 티어. 여기 없는 구장(해외 등)은 프로 기본값으로 떨어진다 */
export const PARK_TIER_OF: Record<string, ParkTier> = {
${stadiums.map((s) => `  ${s.id}: "${TIER_KEY[s.tier]}",`).join("\n")}
};

/** 그림이 있는 구장 목록 — 없으면 티어 기본 그림을 쓴다 */
export const PARK_IMAGES: ReadonlySet<string> = new Set([
${stadiums.map((s) => `  "${s.id}",`).join("\n")}
]);
`;

const tsDst = path.join(__dirname, "../apps/ui/src/shared/utils/parkAnchors.ts");
fs.writeFileSync(tsDst, ts, "utf8");
console.log(`→ ${path.relative(process.cwd(), tsDst)}`);
