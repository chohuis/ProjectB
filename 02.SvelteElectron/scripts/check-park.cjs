"use strict";
/**
 * 구장 이미지 27장 검사. 실행: npm run check:park
 *
 * ⚠ **기하가 맞는지가 크기보다 훨씬 중요하다.**
 * 게임은 이 그림들 위에 선수 스프라이트를 고정 좌표로 얹는다. 다이아몬드가
 * 몇십 픽셀만 밀려도 투수가 마운드 밖에 서고 주자가 베이스 옆에 뜬다.
 *
 * 좌표는 티어마다 다르다 — 원본 구장 그림 세 장이 각각 따로 그려졌기
 * 때문이다. 그래서 각 그림을 **제 티어 좌표**로 검사한다.
 * (좌표 산출은 `npm run fit:park`)
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = (() => { try { return require("pngjs"); } catch { return {}; } })();

const PARK = path.join(__dirname, "../resource/park");
const SPEC = path.join(PARK, "_spec");
const stadiums = JSON.parse(fs.readFileSync(path.join(SPEC, "stadiums.json"), "utf8"));
const A = JSON.parse(fs.readFileSync(path.join(SPEC, "anchors.json"), "utf8"));

const CW = A.coordSpace.width, CH = A.coordSpace.height;
const TIER_KEY = { "프로": "pro", "대학": "university", "독립": "university", "고교": "highschool" };
const REF_FILE = {
  pro: "reference_pro.png",
  university: "reference_university.png",
  highschool: "reference_highschool.png",
};

let failed = 0, warned = 0;
const fail = (m) => { failed++; console.error(`FAIL  ${m}`); };
const warn = (m) => { warned++; console.warn(`WARN  ${m}`); };
const ok   = (m) => console.log(`  ok  ${m}`);

/** PNG 헤더에서 크기만 (pngjs 없이도 된다) */
function pngSize(file) {
  const b = fs.readFileSync(file).subarray(0, 34);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

console.log(`구장 이미지 검사 — 기대 ${stadiums.length}장\n`);

// ── ① 파일 존재 · 이름 ─────────────────────────────────────────
console.log("① 파일 존재 · 이름");
const expected = stadiums.map((s) => `${s.id}.png`);
const present = fs.readdirSync(PARK).filter((f) => f.startsWith("STADIUM_") && f.endsWith(".png"));
const missing = expected.filter((f) => !present.includes(f));
const extra = present.filter((f) => !expected.includes(f));
if (missing.length) fail(`빠진 파일 ${missing.length}장: ${missing.join(" ")}`);
else ok(`${expected.length}장 전부 있다`);
if (extra.length) warn(`stadiums.json에 없는 파일: ${extra.join(" ")}`);

// ── ② 캔버스 크기 ──────────────────────────────────────────────
console.log("\n② 캔버스 크기");
const sizes = new Map();
for (const f of expected) {
  const p = path.join(PARK, f);
  if (!fs.existsSync(p)) continue;
  const s = pngSize(p);
  if (!s) { fail(`${f} PNG가 아니다`); continue; }
  const key = `${s.w}x${s.h}`;
  if (!sizes.has(key)) sizes.set(key, []);
  sizes.get(key).push(f);
}
for (const [key, files] of sizes) console.log(`      ${key.padEnd(10)} ${files.length}장`);
if (sizes.size === 1) {
  const [gw, gh] = [...sizes.keys()][0].split("x").map(Number);
  // 좌표는 preserveAspectRatio="xMidYMid meet"으로 맞춰지므로 크기 자체보다
  // **비율**이 같은지가 중요하다. 비율이 같으면 리샘플링으로 흡수된다.
  const ar = (gw / gh) / (CW / CH);
  ok(`전부 ${gw}x${gh} (한 가지 크기)`);
  if (Math.abs(ar - 1) > 0.02) fail(`비율이 좌표계(${CW}x${CH})와 ${((ar - 1) * 100).toFixed(1)}% 다르다`);
} else {
  fail(`크기가 제각각이다 (${sizes.size}종) — 한 좌표계를 못 쓴다`);
}

// ── ③ 앵커가 제 지형지물 위에 있나 (티어별 좌표로) ────────────
console.log("\n③ 앵커 지면 — 각 그림을 제 티어 좌표로 검사");
if (!PNG) {
  warn("pngjs가 없어 픽셀 검사를 건너뛴다 (npm i -D pngjs)");
} else {
  const read = (p) => PNG.sync.read(fs.readFileSync(p));
  const sampler = (img) => {
    const s = Math.min(CW / img.width, CH / img.height);
    const ox = (CW - img.width * s) / 2, oy = (CH - img.height * s) / 2;
    return (x, y) => {
      const sx = Math.min(img.width - 1, Math.max(0, Math.round((x - ox) / s)));
      const sy = Math.min(img.height - 1, Math.max(0, Math.round((y - oy) / s)));
      const i = (img.width * sy + sx) << 2;
      return [img.data[i], img.data[i + 1], img.data[i + 2]];
    };
  };
  const isSoil  = ([r, g, b]) => r > g + 8 && r > b + 8;
  const isGrass = ([r, g, b]) => g > r + 8 && g > b + 8;
  /**
   * 주변 9칸을 **흙·잔디·그 외** 셋으로 나눈다. 도트 한 점으로 판정하지 않는다.
   *
   * ⚠ 처음엔 "흙 비율"만 재고 낮으면 잔디라고 했는데 **거짓 실패가 났다.**
   * 별빛구장(야간)의 홈플레이트에서 9칸 중 잔디는 0칸이었다 — 플레이트 그림과
   * 그림자가 "흙이 아님"으로 잡혔을 뿐이고 다이아몬드는 제자리였다.
   * 지면이 틀렸다고 말하려면 **반대쪽 지면이 실제로 거기 있어야** 한다.
   */
  const groundAt = (px, x, y) => {
    let soil = 0, grass = 0;
    for (const dx of [-6, 0, 6]) for (const dy of [-6, 0, 6]) {
      const c = px(x + dx, y + dy);
      if (isSoil(c)) soil++; else if (isGrass(c)) grass++;
    }
    return { soil: soil / 9, grass: grass / 9 };
  };
  const anchorsOf = (tier) => {
    const t = A.tiers[tier];
    return [
      ...Object.entries(t.field).map(([k, p]) => [k, p]),
      ...Object.entries(t.defense).map(([k, p]) => [k, p]),
    ];
  };

  // 기준 그림에서 각 앵커의 지면을 먼저 재둔다
  const refGround = {};
  for (const [tier, f] of Object.entries(REF_FILE)) {
    const px = sampler(read(path.join(SPEC, f)));
    refGround[tier] = anchorsOf(tier).map(([, p]) => groundAt(px, p[0], p[1]));
  }

  const bad = [];
  for (const s of stadiums) {
    const p = path.join(PARK, `${s.id}.png`);
    if (!fs.existsSync(p)) continue;
    const tier = TIER_KEY[s.tier] ?? "pro";
    const px = sampler(read(p));
    const list = anchorsOf(tier);
    const mism = [];
    list.forEach(([code, pt], i) => {
      const want = refGround[tier][i];
      const got = groundAt(px, pt[0], pt[1]);
      // 기준이 흙이었는데 **잔디가 실제로 깔려 있으면** 밀린 것이다
      if (want.soil >= 0.7 && got.grass >= 0.7) mism.push(`${code}:흙→잔디`);
      else if (want.grass >= 0.7 && got.soil >= 0.7) mism.push(`${code}:잔디→흙`);
    });
    if (mism.length) {
      bad.push(s.id);
      console.log(`      ${s.id.padEnd(28)} ${mism.join(" ")}`);
    }
  }
  if (bad.length === 0) ok(`${stadiums.length}장 전부 앵커가 기준과 같은 지면 위에 있다`);
  else fail(`${bad.length}장에서 앵커가 다른 지면 위에 있다 — 다이아몬드가 밀렸다`);

  // ── ④ 고교는 외야까지 흙바닥인가 ─────────────────────────────
  console.log("\n④ 고교 8장 — 외야까지 흙바닥인가");
  const OUT = [[330, 400], [497, 360], [670, 400]];
  let hsBad = 0;
  for (const s of stadiums) {
    const p = path.join(PARK, `${s.id}.png`);
    if (!fs.existsSync(p)) continue;
    const px = sampler(read(p));
    const frac = OUT.reduce((a, [x, y]) => a + soilFrac(px, x, y), 0) / OUT.length;
    if (s.tier === "고교" && frac < 0.5) {
      hsBad++; fail(`${s.id} 외야에 잔디가 있다 (흙 ${(frac * 100).toFixed(0)}%)`);
    } else if (s.tier !== "고교" && frac > 0.7) {
      warn(`${s.id} 외야가 흙이다 (${s.tier}인데 흙 ${(frac * 100).toFixed(0)}%)`);
    }
  }
  if (hsBad === 0) ok("고교는 흙, 나머지는 잔디");
}

console.log("\n" + "─".repeat(56));
if (failed > 0) { console.error(`실패 ${failed}건 · 경고 ${warned}건`); process.exit(1); }
console.log(`통과 · 경고 ${warned}건`);
