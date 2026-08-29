"use strict";
/** 죽은 갈래 훑기 — **호출을 본다. 주석을 세지 않는다.**
 *
 *  ⚠ 여기서 "0건"이 곧 결함은 아니다 — 화면이 늦게 붙는 중일 수 있다.
 *    **목록을 내는 것까지가 이 스크립트 몫**이고, 판단은 사람이 한다. */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = process.cwd();
const SRC = path.join(ROOT, "apps/ui/src");
const read = (p) => fs.readFileSync(p, "utf8");
const NL = String.fromCharCode(10);

/** 디렉터리를 훑어 파일 목록을 만든다 */
function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

const files = walk(SRC);
const bodies = new Map();
for (const f of files) bodies.set(f, read(f));

// ── ① 고아 컴포넌트 — 어디서도 import 되지 않는 .svelte ──────
const orphans = [];
for (const f of files) {
  if (!f.endsWith(".svelte")) continue;
  const base = path.basename(f, ".svelte");
  if (base === "App") continue;               // 진입점
  let used = 0;
  for (const [g, body] of bodies) {
    if (g === f) continue;
    if (body.includes(base + ".svelte") || body.includes('from "./' + base + '"')) used++;
  }
  if (used === 0) orphans.push({ f: path.relative(ROOT, f), lines: read(f).split(NL).length });
}

// ── ② napi 로 내보냈는데 **아무도 안 부르는** 엔진 함수 ─────
//
// 🔴 처음엔 TS 본문에서 이름을 찾았는데 **틀렸다.** `preload` 가 이름을
//   바꿔 노출한다 — `faGenerateOffers` 가 `generateFaOffersNative` 를 부른다.
//   그래서 TS 에는 `Native` 이름이 아예 없다. **배선 층을 봐야 한다.**
const libRs = read(path.join(ROOT, "packages/engine-native/src/lib.rs"));
const exported = [];
{
  const lines = libRs.split(NL);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].indexOf("pub fn ");
    if (m < 0) continue;
    const near = lines.slice(Math.max(0, i - 4), i).join(NL);
    if (!near.includes("#[napi")) continue;
    const rest = lines[i].slice(m + 7);
    const name = rest.slice(0, rest.indexOf("("));
    if (name) exported.push(name.trim());
  }
}
const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const tsBody = [...bodies.values()].join(NL);
// 🔴 **데스크톱 쪽을 통째로 본다.** 처음엔 main.cjs·preload.cjs 둘만 읽어
//   경기 엔진 9건을 "죽었다"고 냈다 — 실제로는 `ipc/match.cjs` 가
//   `core.stepPitch(...)` 로 부르고 있었다. **폴더를 봐야 한다.**
let desktopBody = "";
for (const f of walk(path.join(ROOT, "apps/desktop"))) desktopBody += read(f);
// 스크립트(계측·하네스)도 부르는 쪽이다
let scriptsBody = "";
for (const f of walk(path.join(ROOT, "scripts"))) scriptsBody += read(f);

const unusedEngine = [];
for (const fn of exported) {
  const c = camel(fn);
  // ⚠ 배선 층이 `Native` 접미사를 떼고 부르기도 한다
  //   (`stepPitchNative` → `core.stepPitch`). 둘 다 본다.
  const bare = c.endsWith("Native") ? c.slice(0, -6) : c;
  const hay = desktopBody + tsBody + scriptsBody;
  if (hay.includes(c) || hay.includes(bare + "(")) continue;
  unusedEngine.push(c);
}

// ── 출력 ─────────────────────────────────────────────────────
console.log("화면 " + files.filter((f) => f.endsWith(".svelte")).length + "개 · "
  + "엔진 export " + exported.length + "개");

console.log(NL + "[고아 화면] 어디서도 import 안 되는 .svelte — " + orphans.length + "건");
for (const o of orphans.sort((a, b) => b.lines - a.lines)) {
  console.log("  " + String(o.lines).padStart(5) + "줄  " + o.f);
}

console.log(NL + "[안 불리는 엔진 함수] 어느 층에서도 이름이 안 나온다 — "
  + unusedEngine.length + "건");
for (const u of unusedEngine) console.log("  " + u);
