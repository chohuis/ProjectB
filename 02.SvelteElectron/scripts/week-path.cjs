"use strict";
/**
 * **주간 진행 경로의 소스를 한 덩이로 읽는다** — `scripts/` 쪽 정본.
 * (2026-09-30 · Ⅱ-1 쪼개기)
 *
 * 🔴 왜 있나. `apps/ui/src/shared/usecases/__tests__/weekPathSrc.ts` 와 **똑같은
 *   이유**다. 이 저장소의 배선 검사는 `advanceWeek.ts` 를 **글자로** 읽어
 *   「그 줄이 있는가」를 본다. 블록을 `weekPhases/` 로 옮기면 그 줄이 다른
 *   파일로 가고 검사가 통째로 빨개진다 — 동작은 하나도 안 바뀌었는데도.
 *
 *   vitest 쪽은 2026-09-21 에 그 덩이를 만들었는데 **`scripts/` 쪽은 안
 *   만들었다.** 그래서 이번(09-30)에 절 여덟을 옮기자 `test:staff` ·
 *   `test:finance` · `test:sentencebank` 가 한꺼번에 빨개졌다. 같은 함정을
 *   두 번 밟은 것이라 여기도 덩이를 둔다.
 *
 * ⚠ **덩이로 읽는 것이 느슨해지는 것은 아니다.** 옮겨진 줄은 여전히 주간 진행
 *   경로 안에 있어야 하고, 지워지면 그대로 빨강이다. 잃는 것은 「어느 파일에
 *   있는가」 하나뿐인데, 그건 애초에 이 검사들이 지키려던 것이 아니다.
 *
 * ⚠ **「없다」를 묻는 검사는 이걸 쓰지 마라.** 경로를 넓히면 남의 절에 있는
 *   같은 글자에 걸려 늘 빨강이다 — 「있다」는 넓게 · 「없다」는 좁게.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const USECASES = path.join(ROOT, "apps/ui/src/shared/usecases");
const PHASES = path.join(USECASES, "weekPhases");

/** `advanceWeek.ts` + `weekPhases/*.ts` 전부 (`__tests__` 는 뺀다) */
function weekPathSrc() {
  const parts = [fs.readFileSync(path.join(USECASES, "advanceWeek.ts"), "utf-8")];
  for (const f of fs.readdirSync(PHASES)) {
    if (!f.endsWith(".ts")) continue;
    parts.push(fs.readFileSync(path.join(PHASES, f), "utf-8"));
  }
  return parts.join("\n");
}

/**
 * **띄어쓰기를 한 칸으로 눌러 준다** — 줄바꿈·들여쓰기가 사라진다.
 *
 * 🔴 새 `weekPhases/*.ts` 는 `.prettierignore` 밖이다(A-6 이 그 목록을 줄이는
 *   쪽이다). 그래서 커밋 훅이 긴 식을 줄마다 접고, 줄바꿈에 기대는 잣대가
 *   깨진다. 눌러 놓고 비교하면 서식이 바뀌어도 안 깨진다.
 *
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`) — 글자를 하나씩 훑는다.
 * ⚠ 문자열 리터럴 **안의** 띄어쓰기도 같이 눌린다. 문안을 글자 그대로 봐야
 *   하는 검사는 `weekPathSrc()` 를 쓴다.
 */
function weekPathFlat() {
  const src = weekPathSrc();
  const out = [];
  let prevSpace = true;
  for (const ch of src) {
    const isSpace = ch === " " || ch === "\n" || ch === "\t" || ch === "\r";
    if (isSpace) {
      if (!prevSpace) out.push(" ");
      prevSpace = true;
    } else {
      out.push(ch);
      prevSpace = false;
    }
  }
  return out.join("");
}

module.exports = { weekPathSrc, weekPathFlat };
