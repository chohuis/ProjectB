import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STORY_NPC_ROLES, isStoryNpcRole, nextStoryNpcs, storyNpcIdOf } from "../storyNpcRegistry";

/**
 * 🔴 **죽은 칸 5** (2026-09-21). `compare` 조건이 749종 중 **한 자리도 안 쓰였다** —
 *   NPC 가 런타임 생성이라 데이터에 적을 수 있는 `npcId` 가 세상에 없었기 때문이다.
 *   이름표(`role`)를 적고 등록부가 사람을 댄다.
 *
 * ⚠ 여기서 보는 것 셋: ① 정해지는 규칙 ② **한 번 정해지면 안 바뀐다**
 *   ③ 바뀐 게 없으면 `null`(세이브를 매주 더럽히지 않는다).
 */
describe("이야기 인물 등록부 — 정해지는 규칙", () => {
  const teammates = [
    { npcId: "PLY_C", age: 19 },
    { npcId: "PLY_A", age: 18 },
    { npcId: "PLY_B", age: 18 },
    { npcId: "PLY_OLD", age: 30 },
  ];

  it("라이벌 — 처음 맞붙은 상대 선발이 박힌다", () => {
    expect(nextStoryNpcs(undefined, { facedRivalId: "PLY_X" })).toEqual({ rival: "PLY_X" });
  });

  it("🔴 한 번 박히면 안 덮는다 — 라이벌이 매주 바뀌면 이야기가 아니다", () => {
    expect(nextStoryNpcs({ rival: "PLY_X" }, { facedRivalId: "PLY_Y" })).toBeNull();
  });

  it("맞붙은 사람이 없는 주는 아무 일도 안 한다", () => {
    expect(nextStoryNpcs(undefined, { facedRivalId: null })).toBeNull();
    expect(nextStoryNpcs(undefined, {})).toBeNull();
  });

  it("후배 — 지도를 한 번이라도 한 뒤(menteeCount ≥ 1) 가장 어린 팀 동료", () => {
    expect(nextStoryNpcs(undefined, { menteeCount: 1, teammates, myAge: 22 })).toEqual({
      // 18살 둘 중 id 오름차순 — 같은 세상이면 같은 답이 나와야 한다
      mentee: "PLY_A",
    });
  });

  it("지도한 적이 없으면 후배가 안 정해진다 — 「지도한 후배」가 조건이다", () => {
    expect(nextStoryNpcs(undefined, { menteeCount: 0, teammates, myAge: 22 })).toBeNull();
    expect(nextStoryNpcs(undefined, { teammates, myAge: 22 })).toBeNull();
  });

  it("나보다 어린 사람만 후보다 — 서른 살 팀 동료는 후배가 아니다", () => {
    expect(
      nextStoryNpcs(undefined, {
        menteeCount: 3,
        teammates: [{ npcId: "PLY_OLD", age: 30 }],
        myAge: 22,
      }),
    ).toBeNull();
  });

  it("둘이 같은 주에 정해질 수도 있다", () => {
    expect(
      nextStoryNpcs(undefined, { facedRivalId: "PLY_X", menteeCount: 1, teammates, myAge: 22 }),
    ).toEqual({ rival: "PLY_X", mentee: "PLY_A" });
  });

  it("이미 있는 칸은 그대로 두고 빈 칸만 채운다", () => {
    expect(
      nextStoryNpcs(
        { rival: "PLY_X" },
        { facedRivalId: "PLY_Y", menteeCount: 1, teammates, myAge: 22 },
      ),
    ).toEqual({ rival: "PLY_X", mentee: "PLY_A" });
  });
});

describe("이름표 풀기", () => {
  it("`npcId` 가 이긴다 · 없으면 등록부 · 그것도 없으면 undefined", () => {
    const reg = { rival: "PLY_R" };
    expect(storyNpcIdOf(reg, { npcId: "PLY_D", role: "rival" })).toBe("PLY_D");
    expect(storyNpcIdOf(reg, { role: "rival" })).toBe("PLY_R");
    expect(storyNpcIdOf(reg, { role: "mentee" })).toBeUndefined();
    expect(storyNpcIdOf(undefined, { role: "rival" })).toBeUndefined();
    expect(storyNpcIdOf(reg, {})).toBeUndefined();
  });

  it("아는 이름표만 참이다", () => {
    for (const r of STORY_NPC_ROLES) expect(isStoryNpcRole(r)).toBe(true);
    expect(isStoryNpcRole("rivals")).toBe(false);
    expect(isStoryNpcRole("")).toBe(false);
  });
});

/**
 * 🔴 **이름표마다 채우는 갈래가 있어야 한다.** 없으면 데이터가 그 이름표를 적어도
 *   등록부가 영원히 비고 조건은 한 번도 안 참이 된다 — 아무 소리도 안 난다.
 *   이 저장소가 반복해 겪은 「에러 없이 아무 일도 안 일어남」의 형태다.
 */
describe("이름표 셋은 같이 움직인다", () => {
  const SRC = readFileSync(resolve(__dirname, "../storyNpcRegistry.ts"), "utf8");

  it("모든 이름표에 채우는 갈래가 있다", () => {
    const body = SRC.slice(SRC.indexOf("export function nextStoryNpcs"));
    for (const r of STORY_NPC_ROLES) expect(body.includes(`add.${r} =`)).toBe(true);
  });

  it("로더가 모르는 이름표를 던진다 — 검사와 타입이 갈리지 않게", () => {
    const master = readFileSync(resolve(__dirname, "../../stores/master.ts"), "utf8");
    expect(master.includes("isStoryNpcRole(c.role)")).toBe(true);
  });

  it("등록부가 세이브 칸이다 — 저장을 안 타면 다음 주에 라이벌이 사라진다", () => {
    const save = readFileSync(resolve(__dirname, "../../types/save.ts"), "utf8");
    expect(save.includes("storyNpcs?: Record<string, string>")).toBe(true);
  });
});
