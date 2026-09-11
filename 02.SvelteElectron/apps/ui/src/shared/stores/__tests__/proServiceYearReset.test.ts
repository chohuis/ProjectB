import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 프로 연차는 **팀을 옮겨도 유지된다.**
 *
 * 🔴 예전엔 `signContract`·`setPendingNextContract`가
 * `proServiceYears: isNewTeam ? 0 : ...`이었다. `isNewTeam`은 "프로에 처음
 * 들어왔다"가 아니라 **"팀이 바뀌었다"**라서, FA 이적·트레이드·2군 이동으로
 * `teamId`가 바뀔 때마다 연차가 사라졌다.
 * 실측(씨앗 424242 · 12시즌): 연차 **4 → 0**. 그러면 FA 자격(5년)에 영영
 * 못 닿고 은퇴 판정도 어긋난다.
 *
 * ⚠ **소스를 훑는 검사다.** 스토어 메서드라 상태를 세우는 비용이 커서 이렇게
 * 했다 — 배선까지는 못 본다. 다만 이 패턴이 되살아나는 건 잡는다.
 * ⚠ 통합 실행으로는 재현이 어렵다. 주인공이 프로에 가서 이적까지 하는 전개가
 * 실행마다 갈린다(시즌 진행 비결정성). 그래서 소스로 고정한다.
 */
const SRC = readFileSync(resolve(__dirname, "../game.ts"), "utf8");

describe("프로 연차 리셋 방지", () => {
  it("🔴 팀이 바뀌었다고 연차를 0으로 되돌리지 않는다", () => {
    expect(SRC, "proServiceYears를 isNewTeam으로 0으로 되돌리는 코드가 살아 있다").not.toMatch(
      /proServiceYears:\s*isNewTeam\s*\?\s*0/,
    );
  });

  it("계약 서명이 기존 연차를 그대로 넘긴다", () => {
    // signContract · setPendingNextContract 둘 다
    const hits = SRC.match(/proServiceYears:\s*s\.protagonist\.proServiceYears,/g) ?? [];
    expect(hits.length, "계약 경로 둘 다 연차를 유지해야 한다").toBeGreaterThanOrEqual(2);
  });

  it("⚠ 죽은 변수를 남기지 않는다 — isNewTeam은 더 쓰지 않는다", () => {
    expect(SRC, "isNewTeam 선언이 남아 있다(쓰이지 않는다)").not.toMatch(/const isNewTeam\s*=/);
  });
});
