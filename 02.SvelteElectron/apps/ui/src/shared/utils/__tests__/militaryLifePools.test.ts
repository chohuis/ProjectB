import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { lifeCandidatePool } from "../militaryLifeRules";
import type { MilitaryLifeEvent } from "../../types/militaryLife";

/**
 * 🔴 **같은 결함이 두 번 났다 — 셋째를 막는다.**
 *
 * 새 게임의 일반병 입대는 예외 없이 `militaryLife` 를 만들고, 그러면 주간
 * 이벤트는 `runMilitaryLifeWeek` 하나가 뽑는다. 그 자리에서 후보 배열을 손으로
 * 이어 붙이다가 풀을 **두 번 빠뜨렸다**:
 *
 * | 언제 | 빠진 풀 | 종수 | 어떻게 알았나 |
 * |---|---|---|---|
 * | 2026-09-08 | `military_general` | 20 | B 제보 |
 * | 2026-09-12 | `military_common` | 18 | D 0단계 실측 |
 *
 * 빠진 풀은 **아무 소리도 안 낸다.** 게임은 돌고 이야기만 사라진다 — 이
 * 저장소가 제일 많이 밟은 형태다. 그래서 합치는 자리를 `lifeCandidatePool`
 * 함수 하나로 꺼내고, 여기서 **실제 JSON 을 읽어** 셋이 다 들었는지 센다.
 *
 * ⚠ **id 로 센다**(종수로 세지 않는다). 콘텐츠가 늘면 종수는 바뀌지만
 *   「그 풀이 통째로 빠졌나」는 안 바뀐다 — 잣대가 콘텐츠를 따라다니면 안 된다.
 * ⚠ 상무(체육부대)는 이 경로로 안 온다 — 옛 갈래가 `common`+`sports` 를
 *   원래대로 읽는다. 여기 검사 대상이 아니다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const pool = (name: string) =>
  (
    JSON.parse(readFileSync(resolve(MASTER, `events/pools/${name}.json`), "utf8")) as {
      events: Array<{ id: string; choices?: unknown[] }>;
    }
  ).events;

const LIFE = pool("military_life") as unknown as MilitaryLifeEvent[];
const GENERAL = pool("military_general");
const COMMON = pool("military_common");

const built = lifeCandidatePool({
  militaryLifeEvents: LIFE,
  militaryGeneralEvents: GENERAL as never,
  militaryCommonEvents: COMMON as never,
});
const gotIds = new Set(built.map((e) => e.id));

describe("현역 주간 이벤트 후보 — 세 풀이 다 든다", () => {
  for (const [name, src] of [
    ["military_life", LIFE as Array<{ id: string; choices?: unknown[] }>],
    ["military_general", GENERAL],
    ["military_common", COMMON],
  ] as const) {
    it(`${name} 이 후보에 든다`, () => {
      // 선택지가 없는 종은 `toLifeEvent` 가 버린다 — 그건 의도다(고를 게 없다)
      const want = src.filter((e) => (e.choices?.length ?? 0) > 0).map((e) => e.id);
      expect(
        want.length,
        `${name} 에 선택지 있는 종이 하나도 없다 — 잣대가 헛돈다`,
      ).toBeGreaterThan(0);
      const missing = want.filter((id) => !gotIds.has(id));
      expect(missing, `${name} 이 후보에서 통째로 빠졌다 — 새 게임에서 안 뜬다`).toEqual([]);
    });
  }

  it("세 풀은 id 가 하나도 안 겹친다 — 합쳐도 서로 안 먹는다", () => {
    const all = [...LIFE, ...GENERAL, ...COMMON].map((e) => e.id);
    expect(all.length - new Set(all).size, "id 가 겹치면 한쪽이 조용히 사라진다").toBe(0);
  });

  it("빼면 걸린다 — 대조군", () => {
    // 🔴 잣대가 실제로 무엇을 보는지 못박는다. `common` 을 빼고 부르면
    //   위 검사가 실패해야 한다 — 안 그러면 검사가 헛돌고 있는 것이다.
    const without = lifeCandidatePool({
      militaryLifeEvents: LIFE,
      militaryGeneralEvents: GENERAL as never,
      militaryCommonEvents: [],
    });
    const ids = new Set(without.map((e) => e.id));
    expect(COMMON.every((e) => !ids.has(e.id))).toBe(true);
  });
});
