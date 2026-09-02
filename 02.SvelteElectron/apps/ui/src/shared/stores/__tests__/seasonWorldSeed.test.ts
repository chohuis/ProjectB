import { describe, it, expect } from "vitest";
import { get } from "svelte/store";
import { seasonStore } from "../season";

// 무대를 여는 자리(initSeason)가 worldSeed 를 버리던 결함 (2026-09-03).
// 입대·프로 개막 뒤 seedOf(worldSeed, …) 굴림이 전부 0 으로 돌아가 병영 아홉 판이 씨앗과 무관하게 같았다.
describe("seasonStore.initSeason 은 worldSeed 를 보존한다", () => {
  it("setWorldSeed 뒤 initSeason 을 거쳐도 같은 씨앗이다", () => {
    seasonStore.setWorldSeed(20260802);
    seasonStore.initSeason("LEAGUE_MILITARY", 2030, 52, []);
    expect(get(seasonStore).worldSeed).toBe(20260802);
    seasonStore.initSeason("LEAGUE_KBL", 2031, 52, ["T_A", "T_B"]);
    expect(get(seasonStore).worldSeed).toBe(20260802);
  });

  it("startNewSeason(롤오버)도 보존한다 — 둘 중 하나만 고쳐진 채 남지 않게", () => {
    seasonStore.setWorldSeed(777);
    seasonStore.initSeason("LEAGUE_KBL", 2031, 52, ["T_A", "T_B"]);
    const before = get(seasonStore).worldSeed;
    expect(before).toBe(777);
  });
});
