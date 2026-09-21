import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **주간 진행 경로의 소스를 한 덩이로 읽는다** (2026-09-21 · A-4 쪼개기).
 *
 * 🔴 왜 있나. 이 저장소의 배선 검사는 `advanceWeek.ts` 를 **글자로** 읽어
 *   「그 줄이 있는가」를 본다. 그런데 A-4 로 블록을 `weekPhases/` 로 옮기면
 *   그 줄이 다른 파일로 가고 **검사가 통째로 빨개진다** — 동작은 하나도
 *   안 바뀌었는데도.
 *
 *   파일 이름을 검사마다 고치면 다음 쪼개기 때 또 같은 일을 한다. 그래서
 *   **경로 전체를 한 덩이로** 준다. 「주간 진행 어딘가에 이 줄이 있다」가
 *   이 검사들이 실제로 묻고 싶은 것이다.
 *
 * ⚠ **덩이로 읽는 것이 느슨해지는 것은 아니다.** 옮겨진 줄은 여전히 주간
 *   진행 경로 안에 있어야 하고, 지워지면 그대로 빨강이다. 잃는 것은
 *   「어느 파일에 있는가」 하나뿐인데, 그건 애초에 이 검사들이 지키려던
 *   것이 아니다.
 */
const USECASES = resolve(__dirname, "..");
const PHASES = resolve(USECASES, "weekPhases");

/** `advanceWeek.ts` + `weekPhases/*.ts` 전부 */
export const weekPathSrc = (): string =>
  [
    readFileSync(resolve(USECASES, "advanceWeek.ts"), "utf8"),
    ...readdirSync(PHASES)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => readFileSync(resolve(PHASES, f), "utf8")),
  ].join("\n");

/** 줄 단위로 훑고 싶을 때 — 대조군 검사가 쓴다 */
export const weekPathLines = (): string[] => weekPathSrc().split("\n");

/**
 * **띄어쓰기를 한 칸으로 눌러 준다** — 줄바꿈·들여쓰기가 사라진다.
 *
 * 🔴 왜 필요한가 (A-6 · `.prettierignore` 줄이기). 이 저장소의 배선 검사는
 *   소스를 **글자로** 읽는데, prettier 가 긴 식을 여러 줄로 접으면 그 글자가
 *   깨진다. 그래서 「검사가 읽는 파일」을 통째로 `.prettierignore` 에 넣어
 *   왔고, 그 목록이 59 개까지 자랐다.
 *
 *   눌러 놓고 비교하면 **서식이 바뀌어도 안 깨진다.** 검사가 실제로 묻는 것은
 *   「이 조건이 있는가」이지 「몇 줄로 적혔는가」가 아니다.
 *
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`) — 글자를 하나씩 훑는다.
 * ⚠ 문자열 리터럴 **안의** 띄어쓰기도 같이 눌린다. 문안을 글자 그대로 봐야
 *   하는 검사는 `weekPathSrc()` 를 쓴다.
 */
export const weekPathFlat = (): string => {
  const src = weekPathSrc();
  const out: string[] = [];
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
};
