#!/usr/bin/env node
"use strict";
/**
 * **`.node` 가 낡았는지 본다** — Rust 소스 해시 대 빌드 산물 대조
 * (2026-09-04 · A · `BUILD_ARTIFACTS_2026-09-04.md` §3 「남은 위험」 첫 줄).
 *
 * ── 왜 필요한가 ────────────────────────────────────────────────
 * `packages/engine-native/*.node` 는 **git 에 없다**(gitignore). 그런데 Rust
 * 를 고치고 `npm run build:native` 를 안 돌리면 **옛 엔진 그대로 돈다** —
 * 아무 데서도 안 알려 준다. 09-04 에 D 의 NPC 덤프가 빨갛게 나온 게 그것
 * 때문이었다(계약 상한 위반 57%·73%). 규칙은 이미 고쳐져 있었고 **바이너리만
 * 옛것**이었다. 하루를 그걸 찾는 데 썼다.
 *
 * ── 왜 시각(mtime)으로 안 보나 ─────────────────────────────────
 * 🔴 **`.node` 의 시각은 못 믿는다.** cargo 가 캐시를 맞히면
 * (`Finished in 0.08s`) **바이너리를 새로 안 쓴다** — napi 는 `index.js`·
 * `index.d.ts` 만 다시 뱉고 `.node` 는 그대로 둔다. 실측: 09-04 08:58 에
 * `build:native` 를 돌렸는데 `index.js` 는 08:58, `.node` 는 **09-03 19:39**.
 * 그러니 「최근에 빌드했나」를 파일 시각으로 물으면 늘 「아니다」가 나온다.
 *
 * ── 그래서 무엇을 보나 ─────────────────────────────────────────
 * **내용을 본다.** `build:native` 가 성공하면 그 순간의 **소스 해시**를
 * 산물 옆에 적어 둔다(`.native-stamp.json`). 나중에 소스를 다시 해싱해
 * 그 값과 대조한다.
 *
 *   - 소스가 그대로 → cargo 가 캐시를 맞혔든 다시 컴파일했든 **상관없다.**
 *     둘 다 `.node` 가 이 소스에서 나온 게 맞다. **캐시가 안 보이게 된다.**
 *   - 소스가 달라졌는데 도장은 옛 해시 → **낡았다.** 그 자리에서 말한다.
 *   - `.node` 자체가 바뀌었다(다른 빌드가 덮었다·손으로 복사했다)
 *     → 산물 해시도 같이 적어 뒀으므로 그것도 잡는다.
 *
 * ── 어디서 부르나 ──────────────────────────────────────────────
 *   ① `npm run build:native` 끝 — 도장을 **찍는다** (`--write`)
 *   ② `scripts/perf/headless.cjs` 의 `boot()` 맨 앞 — 계측·회귀가 다 여기를
 *      지난다. 낡았으면 **던진다** (계측을 시작하기 전에)
 *   ③ `nativeStamp.test.ts` — ①②의 배선과 해시 규칙을 못박는다
 *
 * 전자(앱 본체)에서는 안 본다 — 포장된 앱에는 Rust 소스가 없다.
 *
 * 쓰는 법:
 *   npm run build:native                    빌드하고 도장까지 찍는다
 *   npm run check:native                    대조만 한다 (낡았으면 exit 1)
 *   node scripts/native-stamp.cjs --write   도장만 찍는다
 */

const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const NATIVE_DIR = path.join(ROOT, "packages", "engine-native");
const STAMP_FILE = path.join(NATIVE_DIR, ".native-stamp.json");

/** 도장을 무시하고 지나가게 하는 탈출구 (Rust 도구가 없는 자리용) */
const ESCAPE_ENV = "PB_ALLOW_STALE_NATIVE";

/**
 * 해싱 대상 — **엔진 바이너리를 바꾸는 것 전부, 그 이상은 아니다.**
 *
 * `src` 아래 `.rs` 전부 + `Cargo.toml` + `Cargo.lock` + `build.rs`.
 * `target/` 은 산물이라 뺀다. `index.js`·`index.d.ts` 도 뺀다 — napi 가
 * 소스에서 만드는 것이지 소스가 아니다(게다가 저 둘은 커밋돼 있다).
 */
function listSourceFiles() {
  const out = [];
  for (const rel of ["Cargo.toml", "Cargo.lock", "build.rs"]) {
    const p = path.join(NATIVE_DIR, rel);
    if (fs.existsSync(p)) out.push(p);
  }
  const srcDir = path.join(NATIVE_DIR, "src");
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".rs")) out.push(p);
    }
  };
  if (fs.existsSync(srcDir)) walk(srcDir);
  // 순서가 해시에 들어가므로 정렬해 둔다 — 파일 시스템이 주는 순서에 안 기댄다
  return out.sort();
}

/**
 * 파일 목록 하나를 해시 하나로 — **경로와 내용을 함께** 넣는다.
 *
 * 내용만 넣으면 파일 이름만 바꾼 것을 못 잡고, 경로만 넣으면 내용 변경을 못
 * 잡는다. 길이도 넣어 이어붙이기 모호함(`ab`+`c` 대 `a`+`bc`)을 없앤다.
 *
 * 목록·기준 경로를 인자로 받는 건 **검사가 임시 폴더로 규칙을 확인**할 수
 * 있게 하려는 것이다 — 진짜 Rust 소스를 건드려 보지 않아도 된다.
 */
function hashFiles(files, baseDir) {
  const h = createHash("sha256");
  for (const f of [...files].sort()) {
    const rel = path.relative(baseDir, f).split(path.sep).join("/");
    const buf = fs.readFileSync(f);
    h.update(rel + "|" + buf.length + "|");
    h.update(buf);
  }
  return h.digest("hex");
}

function computeSourceHash() {
  const files = listSourceFiles();
  return { hash: hashFiles(files, NATIVE_DIR), fileCount: files.length };
}

/** 현재 플랫폼의 `.node` 하나를 찾는다 (napi 는 트리플당 한 개를 놓는다) */
function findNodeBinary() {
  if (!fs.existsSync(NATIVE_DIR)) return null;
  const hits = fs.readdirSync(NATIVE_DIR).filter((f) => f.endsWith(".node")).sort();
  return hits.length > 0 ? path.join(NATIVE_DIR, hits[0]) : null;
}

function hashFile(p) {
  return createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function readStamp() {
  if (!fs.existsSync(STAMP_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(STAMP_FILE, "utf8"));
  } catch {
    return null;  // 깨진 도장은 없는 것과 같이 다룬다 — 다시 빌드하면 낫는다
  }
}

/** 빌드 직후 도장을 찍는다. `.node` 가 없으면 그 자체가 실패다 */
function writeStamp() {
  const nodePath = findNodeBinary();
  if (!nodePath) {
    return {
      ok: false, reason: "NO_BINARY",
      message: `${NATIVE_DIR} 에 .node 가 없다 — 빌드가 성공했다는데 산물이 없다`,
    };
  }
  const src = computeSourceHash();
  const stat = fs.statSync(nodePath);
  const stamp = {
    sourceHash: src.hash,
    sourceFiles: src.fileCount,
    nodeFile: path.basename(nodePath),
    nodeSize: stat.size,
    nodeHash: hashFile(nodePath),
    builtAt: new Date().toISOString(),
  };
  fs.writeFileSync(STAMP_FILE, JSON.stringify(stamp, null, 2) + "\n", "utf8");
  return { ok: true, stamp, stampFile: STAMP_FILE };
}

/**
 * 대조한다. 안 맞을 때 돌려주는 `reason` 넷:
 *
 *   `NO_BINARY`    `.node` 가 없다
 *   `NO_STAMP`     도장이 없다 — 이 사슬로 빌드한 적이 없다
 *   `STALE`        소스가 도장보다 앞서 있다 (**이게 잡으려던 것**)
 *   `NODE_CHANGED` `.node` 가 도장이 적어 둔 것과 다르다
 */
function checkStamp() {
  const nodePath = findNodeBinary();
  if (!nodePath) {
    return { ok: false, reason: "NO_BINARY", message: "engine-native 바이너리(.node)가 없다" };
  }
  const stamp = readStamp();
  if (!stamp) {
    return {
      ok: false, reason: "NO_STAMP", nodePath,
      message: "빌드 도장(.native-stamp.json)이 없다 — 이 .node 가 어느 소스에서 나왔는지 아무도 모른다",
    };
  }
  const src = computeSourceHash();
  if (src.hash !== stamp.sourceHash) {
    return {
      ok: false, reason: "STALE", nodePath, stamp, sourceHash: src.hash,
      message: `Rust 소스가 바뀌었는데 다시 안 빌드했다 — 지금 도는 엔진은 ${stamp.builtAt} 것이다`,
    };
  }
  const nodeHash = hashFile(nodePath);
  if (nodeHash !== stamp.nodeHash) {
    return {
      ok: false, reason: "NODE_CHANGED", nodePath, stamp, nodeHash,
      message: ".node 가 도장을 찍은 뒤에 바뀌었다 (다른 빌드가 덮었거나 손으로 복사했다)",
    };
  }
  return { ok: true, stamp, nodePath };
}

/**
 * 계측·회귀 진입점이 부르는 자리. **낡았으면 던진다** — 옛 엔진으로 잰 숫자는
 * 틀린 숫자고, 틀린 줄 모르는 게 제일 비싸다.
 *
 * `PB_ALLOW_STALE_NATIVE=1` 이면 빨간 줄만 찍고 지나간다 (Rust 도구가 없는 자리).
 */
function assertFresh({ label = "headless" } = {}) {
  const res = checkStamp();
  if (res.ok) return res;

  const lines = [
    `[${label}] 🔴 네이티브 엔진이 소스와 안 맞는다 — ${res.reason}`,
    `  ${res.message}`,
    `  고치는 법: npm run build:native`,
    `  (정말 이대로 돌리려면 ${ESCAPE_ENV}=1)`,
  ];
  if (process.env[ESCAPE_ENV]) {
    for (const l of lines) console.warn(l);
    console.warn(`  ⚠ ${ESCAPE_ENV} 가 켜져 있어 그대로 간다 — 이 판의 숫자는 근거로 쓰지 마라`);
    return res;
  }
  throw new Error(lines.join("\n"));
}

module.exports = {
  ROOT, NATIVE_DIR, STAMP_FILE, ESCAPE_ENV,
  listSourceFiles, hashFiles, computeSourceHash, findNodeBinary,
  readStamp, writeStamp, checkStamp, assertFresh,
};

// ── CLI ──────────────────────────────────────────────────────────
if (require.main === module) {
  const mode = process.argv.includes("--check") ? "check" : "write";
  if (mode === "write") {
    const r = writeStamp();
    if (!r.ok) { console.error(`[native-stamp] 🔴 ${r.message}`); process.exit(1); }
    console.log(`[native-stamp] ${r.stamp.nodeFile} ← 소스 ${r.stamp.sourceFiles}개 · ${r.stamp.sourceHash.slice(0, 12)}`);
  } else {
    const r = checkStamp();
    if (r.ok) {
      console.log(`[native-stamp] ✅ ${r.stamp.nodeFile} 은 지금 소스에서 나온 것이다 (${r.stamp.builtAt})`);
    } else {
      console.error(`[native-stamp] 🔴 ${r.reason} — ${r.message}`);
      console.error(`[native-stamp]    고치는 법: npm run build:native`);
      process.exit(1);
    }
  }
}
