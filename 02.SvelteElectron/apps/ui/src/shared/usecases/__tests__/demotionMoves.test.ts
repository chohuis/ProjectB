/**
 * **「받아들인다」를 고르면 진짜로 내려가는가** — 테스터가 겪은 자리
 * (2026-09-08 · A · L2·L4).
 *
 * 🔴 신고: 「2군으로 가라는 메시지가 왔고 **가겠다고 했는데도 안 내려갔다**」.
 *   무대 이동을 말하는 이벤트 23건 중 상태를 바꾸는 것이 0건이었다 —
 *   승강 기계는 `market.ts` 에 있는데 **거기 닿는 문이 없었다.**
 *
 * ⚠ **끝에서 끝까지는 `npm run probe:a:demote` 가 잰다**(프로까지 실제로 가서
 *   진짜 이벤트 엔진이 통지를 내고 `applyDecision` 으로 고른다 · 10분).
 *   여기는 그 판을 매번 못 돌리므로 **문이 열려 있는지**를 빠르게 지킨다:
 *   갈래가 통지면 움직이고, 이벤트면 안 움직인다.
 *
 * ⚠ **`market.ts` 의 정본을 그대로 부른다** — 사본을 만들면 사본을 재게 된다.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { get } from "svelte/store";
import { gameStore } from "../../stores/game";
import { seasonStore } from "../../stores/season";
import { applySideEffects } from "../decisions";
import { primeTeamLeagueMap } from "../../utils/ids";
import type { ScheduleEntry } from "../../types/season";

const T1 = "TEAM_KBL_BUSAN_WAVES_1";
const T2 = "TEAM_KBL_BUSAN_WAVES_2";

const entry = (id: string, leagueId: string, home: string): ScheduleEntry =>
  ({ id, leagueId, week: 3, gameDate: "2029-05-01", homeTeamId: home, awayTeamId: "X",
     isProtagonistGame: false, phase: "season" } as unknown as ScheduleEntry);

beforeEach(() => {
  // 팀 → 리그 표. 이게 없으면 `leagueOfTeam` 이 접두사 폴백으로 떨어진다
  primeTeamLeagueMap([
    { id: T1, leagueId: "LEAGUE_KBL" },
    { id: T2, leagueId: "LEAGUE_KBL" },
  ]);
  gameStore.setProtagonistTeam(T1, "LEAGUE_KBL");
  // 진짜 store 손잡이로 세운다 — 검사용 뒷문을 만들면 그 뒷문을 재게 된다
  seasonStore.initSeason("LEAGUE_KBL", 2029, 52, []);
  seasonStore.setSchedule([entry("K1", "LEAGUE_KBL", T1)]);
  seasonStore.injectLeagueEntries("LEAGUE_KBL_FARM", [entry("F1", "LEAGUE_KBL_FARM", T2)]);
  while (get(seasonStore).currentWeek < 15) seasonStore.advanceWeek();
});

describe("강등 통지 — 고르면 세계가 움직인다", () => {
  it("🔴 통지에서 `rosterMove: demote` 를 고르면 소속·리그·**일정**이 다 2군으로 간다", async () => {
    await applySideEffects({ rosterMove: "demote" }, { lane: "notice" });

    const p = get(gameStore).protagonist;
    const s = get(seasonStore);
    expect(p.teamId).toBe(T2);
    expect(p.leagueId).toBe("LEAGUE_KBL_FARM");
    // ⚠ **일정이 핵심이다.** 소속만 바뀌고 일정이 안 바뀌면 순위표만 맞고
    //   상대가 전부 옛 리그 팀이 된다(2026-09-02 실측 자리)
    expect(s.leagueId).toBe("LEAGUE_KBL_FARM");
    expect(s.schedule.map((e) => e.id)).toEqual(["F1"]);
  });

  it("일어난 일로 남는다 — 통지가 `outcome_within` 으로 그걸 읽는다", async () => {
    await applySideEffects({ rosterMove: "demote" }, { lane: "notice" });
    const outs = get(gameStore).protagonist.recentOutcomes ?? [];
    expect(outs[outs.length - 1]).toMatchObject({ kind: "demote", week: 15 });
  });

  it("🔴 갈래가 통지가 아니면 **안 움직인다** — 주사위가 부른 것은 상태를 못 바꾼다", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await applySideEffects({ rosterMove: "demote" });   // 갈래 없음 = 이벤트

    expect(get(gameStore).protagonist.teamId).toBe(T1);
    expect(get(seasonStore).leagueId).toBe("LEAGUE_KBL");
    // 조용히 넘어가지 않는다 — 「아무 일도 안 일어남」이 제일 나쁘다
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("이미 2군이면 아무 일도 안 한다 — 같은 팀으로 옮기며 일정만 갈리면 안 된다", async () => {
    gameStore.setProtagonistTeam(T2, "LEAGUE_KBL_FARM");
    await applySideEffects({ rosterMove: "demote" }, { lane: "notice" });
    expect(get(gameStore).protagonist.teamId).toBe(T2);
  });

  it("1·2군이 없는 무대(고교)면 조용히 아무 일도 안 한다", async () => {
    gameStore.setProtagonistTeam("TEAM_HS_AEWOL", "LEAGUE_HIGHSCHOOL");
    await applySideEffects({ rosterMove: "demote" }, { lane: "notice" });
    expect(get(gameStore).protagonist.teamId).toBe("TEAM_HS_AEWOL");
  });
});
