import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 슬롯을 바꾸면 시즌 종료 가드를 되돌려야 한다.
 *
 * 🔴 `_lastWorldSeasonEndYear`는 `seasonRollover.ts`의 **모듈 지역 변수**라
 * 프로세스가 살아 있는 동안 남는다. 앱을 안 끄고 다른 슬롯을 불러오면
 * **앞 게임의 연도가 남아 그 해 시즌 종료가 통째로 스킵된다** —
 * 순위·수상·오프시즌(은퇴·방출·FA·드래프트)·구단 성향 갱신이 전부.
 *
 * `resetWorldSeasonEndGuard()`는 정확히 이걸 위해 만들어졌는데
 * **호출부가 0건이었다**(2026-08-24 확인). 주석만 있고 아무도 안 불렀다.
 *
 * ⚠ **헤드리스 계측으로는 못 잡는다.** 매번 새 프로세스라 가드가 늘 초기값이다.
 *   그래서 소스로 고정한다.
 */
const SRC = readFileSync(
  resolve(__dirname, "../slotLifecycleV3.ts"), "utf8",
);

describe("시즌 종료 가드 리셋", () => {
  it("🔴 슬롯 로드가 가드를 되돌린다", () => {
    const load = SRC.slice(SRC.indexOf("export async function loadGameV3"));
    const body = load.slice(0, load.indexOf("\n}"));
    expect(body, "loadGameV3가 resetWorldSeasonEndGuard를 안 부른다")
      .toContain("resetWorldSeasonEndGuard()");
  });

  it("🔴 새 게임도 가드를 되돌린다", () => {
    const nw = SRC.slice(SRC.indexOf("export async function startNewGameV3"));
    const body = nw.slice(0, nw.indexOf("\n}"));
    expect(body, "startNewGameV3가 resetWorldSeasonEndGuard를 안 부른다")
      .toContain("resetWorldSeasonEndGuard()");
  });

  it("가드 리셋 함수가 여전히 export되어 있다 — 대조군", () => {
    const roll = readFileSync(
      resolve(__dirname, "../../usecases/seasonRollover.ts"), "utf8",
    );
    expect(roll).toMatch(/export function resetWorldSeasonEndGuard/);
  });
});
