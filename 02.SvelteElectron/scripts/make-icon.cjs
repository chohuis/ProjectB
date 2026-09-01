#!/usr/bin/env node
/**
 * **임시 앱 아이콘을 만든다** — `build/icon.ico`.
 *
 *   node scripts/make-icon.cjs
 *
 * 🔴 Steam 빌드에 아이콘이 없어 기본 Electron 아이콘이 붙고 있었다
 * (사용자 확정 2026-09-01 "임시 아이콘을 만들어라").
 *
 * ⚠ **임시다.** 그림 파일이 생기면 이 스크립트를 지우고 `build/icon.ico`를
 *   그걸로 갈아라 — `package.json`의 `build.win.icon`은 그대로 두면 된다.
 *
 * ## 왜 코드로 그리나
 *
 * 이미지 도구가 없다. 그래서 픽셀을 직접 채우고 PNG로 인코딩해 ICO 로 감싼다.
 * 외부 의존성이 없다 — `zlib` 하나만 쓴다.
 *
 * ⚠ Windows 아이콘은 **여러 크기를 한 파일에** 담는다. 하나만 넣으면 작업
 *   표시줄에서 뭉개진다 — 16·32·48·64·128·256 여섯을 넣는다.
 *
 * ⚠ ICO 는 256 을 **0 으로 적는다**(1바이트 필드라 256 이 안 들어간다).
 *   이걸 모르면 256 짜리가 통째로 무시된다.
 */
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

// ── 그림 ──────────────────────────────────────────────────────
//
// 야구공. 흰 공에 빨간 실밥 둘.
//
// 실밥은 **공 중심에서 벗어난 원의 호**다. 좌우 대칭이고 가운데가 바깥으로
// 볼록해야 야구공으로 읽힌다 — 안쪽으로 볼록하면 눈알처럼 보인다.
const BALL   = [250, 250, 246];   // 살짝 따뜻한 흰색. 순백은 화면에서 뜬다
const SEAM   = [200,  42,  42];
const SHADOW = [ 20,  26,  40];   // 바닥 그림자 — 평평해 보이지 않게

/** 한 변 `n` 픽셀짜리 RGBA 버퍼를 그린다 */
function draw(n) {
  const buf = Buffer.alloc(n * n * 4);          // 0 = 투명
  const c = (n - 1) / 2;
  const R = n * 0.46;                            // 공 반지름
  // 실밥 원 — **호가 바깥으로 볼록해야** 야구공으로 읽힌다.
  //
  // 좌측 실밥은 중심이 **오른쪽**에 있는 원의 왼쪽 호다:
  //   x(y) = c + off - √(r² - (y-c)²)     y=c 에서 가장 왼쪽
  //
  // ⚠ 처음에 `off < r` 관계를 뒤집어 잡아 호가 안쪽으로 볼록했다 —
  //   두 실밥이 한가운데서 교차해 **벤 다이어그램**이 됐다.
  //   `r - off` 가 실밥의 가장 깊은 지점이고 공 반지름(0.46)보다 작아야 한다.
  const seamOff = n * 0.26;
  const seamR   = n * 0.60;     // r - off = 0.34n — 공 반지름(0.46n)의 74% 지점
  const seamW   = Math.max(1, n * 0.020);        // 본선 — 작은 크기에서 안 사라지게
  // 바느질 자국. 본선만 있으면 눈(目) 모양으로 읽힌다 — 이게 야구공으로
  // 만든다. 호를 따라 일정 간격으로 두께를 키워 튀어나온 땀을 낸다
  const stitchStep = seamR * 0.13;
  const stitchLen  = stitchStep * 0.42;
  const stitchW    = Math.max(2, n * 0.062);
  const put = (x, y, rgb, a) => {
    const i = (y * n + x) * 4;
    buf[i] = rgb[0]; buf[i + 1] = rgb[1]; buf[i + 2] = rgb[2]; buf[i + 3] = a;
  };
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = x - c, dy = y - c;
      const d = Math.hypot(dx, dy);
      if (d > R + 0.7) continue;                 // 공 밖
      // 가장자리를 한 픽셀 부드럽게 — 안 하면 계단이 심하다
      const edge = Math.max(0, Math.min(1, R + 0.5 - d));
      // 오른쪽 아래로 갈수록 살짝 어둡게 — 입체감
      const shade = 1 - Math.max(0, (dx + dy) / (R * 2)) * 0.22;
      const base = BALL.map((v) => Math.round(v * shade));
      put(x, y, base, Math.round(255 * edge));
      // 실밥 둘 — 좌우 대칭. `s = +1` 이 좌측 실밥(중심이 오른쪽)이다
      for (const s of [1, -1]) {
        const sx = x - (c + s * seamOff);
        const sd = Math.hypot(sx, dy);
        // 호 위 어디인가 — 바느질 간격을 여기서 잰다
        const arc = Math.atan2(dy, sx) * seamR;
        const m = ((arc % stitchStep) + stitchStep) % stitchStep;
        const w = m < stitchLen ? stitchW : seamW;
        // 그 원의 **반대쪽 호**는 공 밖이라 저절로 걸러진다
        if (Math.abs(sd - seamR) < w / 2) put(x, y, SEAM, Math.round(255 * edge));
      }
    }
  }
  // 바닥 그림자 — 공 아래쪽 얇은 타원
  const sy = c + R * 0.94, sr = R * 0.72;
  for (let y = Math.floor(sy - 3); y <= Math.ceil(sy + 3) && y < n; y++) {
    if (y < 0) continue;
    for (let x = 0; x < n; x++) {
      const t = Math.hypot((x - c) / sr, (y - sy) / (n * 0.028));
      if (t > 1) continue;
      const i = (y * n + x) * 4;
      if (buf[i + 3] > 0) continue;              // 공을 덮지 않는다
      put(x, y, SHADOW, Math.round(90 * (1 - t)));
    }
  }
  return buf;
}

// ── PNG 인코딩 ────────────────────────────────────────────────

const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

function png(n, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8;    // 채널당 8비트
  ihdr[9] = 6;    // RGBA
  // 10·11·12 = 압축 0 · 필터 0 · 인터레이스 0
  // 각 줄 앞에 필터 바이트가 붙는다 — 이걸 빼면 PNG 가 통째로 안 읽힌다
  const raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) {
    raw[y * (n * 4 + 1)] = 0;
    rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ── ICO 로 감싸기 ─────────────────────────────────────────────

const SIZES = [16, 32, 48, 64, 128, 256];
const imgs = SIZES.map((n) => ({ n, buf: png(n, draw(n)) }));

const dir = Buffer.alloc(6);
dir.writeUInt16LE(0, 0); dir.writeUInt16LE(1, 2); dir.writeUInt16LE(imgs.length, 4);

let offset = 6 + imgs.length * 16;
const entries = imgs.map(({ n, buf }) => {
  const e = Buffer.alloc(16);
  // ⚠ 256 은 0 으로 적는다 — 1바이트 필드다
  e[0] = n === 256 ? 0 : n;
  e[1] = n === 256 ? 0 : n;
  e[2] = 0; e[3] = 0;
  e.writeUInt16LE(1, 4);        // planes
  e.writeUInt16LE(32, 6);       // bpp
  e.writeUInt32LE(buf.length, 8);
  e.writeUInt32LE(offset, 12);
  offset += buf.length;
  return e;
});

const out = Buffer.concat([dir, ...entries, ...imgs.map((i) => i.buf)]);
const dest = path.join(__dirname, "..", "build", "icon.ico");
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);

// PNG 한 장도 남긴다 — Steam 스토어·리눅스 빌드가 쓴다
const p256 = path.join(__dirname, "..", "build", "icon.png");
fs.writeFileSync(p256, imgs[imgs.length - 1].buf);

console.log(`[아이콘] ${dest}  ${out.length.toLocaleString()}바이트 · ${SIZES.join("·")}px`);
console.log(`[아이콘] ${p256}  ${imgs[imgs.length - 1].buf.length.toLocaleString()}바이트 · 256px`);
