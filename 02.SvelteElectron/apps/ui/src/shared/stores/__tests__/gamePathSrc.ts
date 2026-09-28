import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **게임 스토어 경로의 소스를 한 덩이로 읽는다** (2026-09-27 · Ⅱ-2 쪼개기).
 *
 * 🔴 왜 있나. `weekPathSrc` 와 같은 이유다. 이 저장소의 배선 검사 **스물다섯
 *   자리**가 `stores/game.ts` 를 **글자로** 읽어 「그 줄이 있는가」를 본다.
 *   Ⅱ-2 로 store 안의 게임 로직을 `usecases/gameStore/` 로 옮기면 그 줄이
 *   다른 파일로 가고 **검사가 통째로 빨개진다** — 동작은 하나도 안 바뀌었는데도.
 *
 *   파일 이름을 검사마다 고치면 다음 덩이를 옮길 때 또 같은 일을 한다.
 *   그래서 **경로 전체를 한 덩이로** 준다. 「게임 스토어 어딘가에 이 줄이
 *   있다」가 이 검사들이 실제로 묻고 싶은 것이다.
 *
 * ⚠ **덩이로 읽는 것이 느슨해지는 것은 아니다.** 옮겨진 줄은 여전히 이
 *   경로 안에 있어야 하고, 지워지면 그대로 빨강이다. 잃는 것은 「어느 파일에
 *   있는가」 하나뿐인데, 그건 애초에 이 검사들이 지키려던 것이 아니다.
 *
 * ⚠ `usecases/gameStore/` 가 아직 없어도 된다 — 덩이가 하나도 안 나갔을 때는
 *   `game.ts` 하나다. 검사 문장은 그때나 지금이나 같다.
 */
const STORES = resolve(__dirname, "..");
const CHUNKS = resolve(STORES, "..", "usecases", "gameStore");

/** `stores/game.ts` + `usecases/gameStore/*.ts` 전부 (`__tests__` 는 뺀다) */
export const gamePathSrc = (): string =>
  [
    readFileSync(resolve(STORES, "game.ts"), "utf8"),
    ...(existsSync(CHUNKS)
      ? readdirSync(CHUNKS)
          .filter((f) => f.endsWith(".ts"))
          .map((f) => readFileSync(resolve(CHUNKS, f), "utf8"))
      : []),
  ].join("\n");

/** 줄 단위로 훑고 싶을 때 — 대조군 검사가 쓴다 */
export const gamePathLines = (): string[] => gamePathSrc().split("\n");

/**
 * **띄어쓰기를 한 칸으로 눌러 준다** — `weekPathFlat` 과 같은 규칙이다.
 *
 * 새 파일은 `.prettierignore` 에 안 넣는다(A-6 이 그 목록을 줄이는 쪽이다).
 * 그래서 커밋 훅이 긴 식을 줄마다 접고, 글자 검사가 그걸로 깨진다. 눌러 놓고
 * 비교하면 서식이 바뀌어도 안 깨진다.
 *
 * ⚠ 정규식을 안 쓴다(`CLAUDE.md`) — 글자를 하나씩 훑는다.
 * ⚠ 문자열 리터럴 **안의** 띄어쓰기도 같이 눌린다. 문안을 글자 그대로 봐야
 *   하는 검사는 `gamePathSrc()` 를 쓴다.
 */
export const gamePathFlat = (): string => {
  const src = gamePathSrc();
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
