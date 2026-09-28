"use strict";
/**
 * **게임 스토어 경로의 소스를 한 덩이로 읽는다** — `.cjs` 검사용.
 *
 * TS 쪽 짝은 `apps/ui/src/shared/stores/__tests__/gamePathSrc.ts` 다. 둘이
 * 같은 것을 읽어야 한다 — Ⅱ-2 로 store 안의 게임 로직이 `usecases/gameStore/`
 * 로 나가면 `stores/game.ts` 만 읽던 검사가 통째로 빨개진다(동작은 그대로인데).
 *
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`).
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const STORE = path.join(ROOT, "apps", "ui", "src", "shared", "stores", "game.ts");
const CHUNKS = path.join(ROOT, "apps", "ui", "src", "shared", "usecases", "gameStore");

/** `stores/game.ts` + `usecases/gameStore/*.ts` 전부 */
function gamePathSrc() {
  const parts = [fs.readFileSync(STORE, "utf8")];
  if (fs.existsSync(CHUNKS)) {
    for (const f of fs.readdirSync(CHUNKS)) {
      if (f.endsWith(".ts")) parts.push(fs.readFileSync(path.join(CHUNKS, f), "utf8"));
    }
  }
  return parts.join("\n");
}

module.exports = { gamePathSrc };
