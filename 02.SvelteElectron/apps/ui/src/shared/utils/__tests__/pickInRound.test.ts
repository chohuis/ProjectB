import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pickInRound } from "../draftSystem";

// 지명 통보 창이 `pickNo % 8 || 8`이었다. 팀은 10개인데 8로 나눴다 —
// 전체 56번(6R 6순위)이 "6라운드 8순위"로 떴다. 보드 화면은 같은 결함을
// 먼저 고쳤는데 통보 창에만 옛 식이 남아 있었다.

describe("pickInRound — 전체 순번에서 라운드 안 순위를 뽑는다", () => {
  it("라운드 첫 픽은 1번이다", () => {
    expect(pickInRound(1, 1, 10)).toBe(1);
    expect(pickInRound(11, 2, 10)).toBe(1);
    expect(pickInRound(101, 11, 10)).toBe(1);
  });

  it("라운드 마지막 픽은 팀 수와 같다", () => {
    expect(pickInRound(10, 1, 10)).toBe(10);
    expect(pickInRound(110, 11, 10)).toBe(10);
  });

  it("실제로 어긋났던 값 — 56번은 6라운드 6순위다", () => {
    // 옛 식 `56 % 8 || 8`은 8을 냈다
    expect(pickInRound(56, 6, 10)).toBe(6);
    expect(56 % 8 || 8).toBe(8); // 대조군: 옛 식이 틀렸음을 못박는다
  });

  it("팀 수를 안 주면 KBL 팀 수를 쓴다 — 화면이 숫자를 적을 일이 없다", () => {
    expect(pickInRound(56, 6)).toBe(pickInRound(56, 6, 10));
  });

  it("10팀 11라운드 110픽 전부 1~10 범위 안에 든다", () => {
    for (let p = 1; p <= 110; p++) {
      const round = Math.ceil(p / 10);
      const inRound = pickInRound(p, round, 10);
      expect(inRound).toBeGreaterThanOrEqual(1);
      expect(inRound).toBeLessThanOrEqual(10);
    }
  });

  it("팀이 늘어도 따라온다 — 상수를 복사한 자리가 있으면 여기서 갈린다", () => {
    expect(pickInRound(13, 2, 12)).toBe(1);
  });
});

describe("식이 화면에 다시 복제되지 않았는지", () => {
  // ⚠ 이 검사가 없으면 같은 결함이 세 번째 화면에서 또 생긴다.
  // 실제로 보드는 고쳤는데 통보 창은 안 고쳐진 채 몇 달을 갔다.
  const read = (p: string) => readFileSync(resolve(__dirname, "../../../", p), "utf8");

  it("지명 통보 창이 팀 수를 직접 적지 않는다", () => {
    const s = read("features/contract/ui/DraftNotificationModal.svelte");
    expect(s).not.toMatch(/pickNo\s*%\s*\d+/);
    expect(s).toContain("pickInRound");
  });

  it("드래프트 보드도 같은 함수를 쓴다", () => {
    const s = read("features/career/ui/DraftBoardModal.svelte");
    expect(s).toContain("pickInRound");
  });
});
