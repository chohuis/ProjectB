import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { seasonStore } from "../season";

/**
 * **문장 기억은 시즌 상태가 아니다** (2026-09-07 · `check:reportbank` 실측).
 *
 * 🔴 `makeEmptySeason` 이 `sentenceMemory: {}` 로 두는 바람에 **해가 바뀌거나
 *    무대를 열 때마다 「직전 제외」가 초기화**됐다. 그러면 소식함에
 *    「W52 주간 훈련 결과 / W1 주간 훈련 결과」처럼 같은 제목이 두 줄 붙는다 —
 *    15년 헤드리스에서 훈련 3건 · 내 몸 4건이 실제로 그렇게 났다.
 *    `worldSeed` 가 같은 자리에서 같은 이유로 사라지던 것과 같은 형태다.
 *
 * ⚠ **`triggeredEvents` 와 다르다.** 그쪽은 `once_per_season` 정책의 입력이라
 *    시즌마다 비우는 게 맞다. 여기는 「직전에 쓴 문장」이고 그건 해가 바뀐다고
 *    달라지지 않는다.
 *
 * ⚠ **스토어는 파일 안에서 하나다.** 기억이 검사끼리 쌓이므로 **키 하나씩**
 *    본다 — 통째로 견주면 앞 검사가 남긴 키에 걸린다(그 자체가 「안 지운다」의
 *    증거이긴 하다).
 */
const memOf = (k: string) => (get(seasonStore).sentenceMemory ?? {})[k];

describe("sentenceMemory 는 시즌을 넘어 산다", () => {
  it("startNewSeason(롤오버)이 안 지운다", () => {
    seasonStore.initSeason("LEAGUE_KBL", 2031, 52, ["T_A", "T_B"]);
    seasonStore.recordSentencePicks({ "carry#rollover": 4 });
    seasonStore.startNewSeason();
    expect(memOf("carry#rollover"), "롤오버가 문장 기억을 지웠다").toBe(4);
  });

  it("initSeason(무대 열기)도 안 지운다", () => {
    seasonStore.recordSentencePicks({ "carry#init": 1 });
    // 입대·프로 개막이 이 문을 지난다
    seasonStore.initSeason("LEAGUE_MILITARY", 2032, 52, []);
    expect(memOf("carry#init"), "무대를 여니 문장 기억이 사라졌다").toBe(1);
  });

  /** ⚠ 시즌마다 비워야 하는 것까지 같이 들고 가면 안 된다 */
  it("triggeredEvents 는 그대로 비운다", () => {
    seasonStore.recordTriggeredEvents({ EVT_X: 12 });
    seasonStore.recordSentencePicks({ "carry#both": 0 });
    seasonStore.startNewSeason();
    expect(get(seasonStore).triggeredEvents, "시즌 트리거까지 들고 갔다").toEqual({});
    expect(memOf("carry#both")).toBe(0);
  });
});
