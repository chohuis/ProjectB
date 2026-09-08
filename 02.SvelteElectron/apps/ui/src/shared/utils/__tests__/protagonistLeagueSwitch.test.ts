import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { switchProtagonistLeague } from "../protagonistLeagueSwitch";
import type { LeagueSeasonState, ScheduleEntry, Standing } from "../../types/season";
type PlayerSeasonStats = LeagueSeasonState["stats"][string];

// 강등(1군 → 2군) 뒤 주인공 일정이 옛 리그에 남던 결함 (C 눈확인 09-02) — 순수 함수로 잰다.
const game = (id: string, home: string, away: string, mine: boolean, week = 10): ScheduleEntry =>
  ({ id, week, homeTeamId: home, awayTeamId: away, isProtagonistGame: mine, gameDate: "2026-06-01", result: null } as unknown as ScheduleEntry);
const st = (teamId: string, wins: number): Standing => ({ teamId, wins, losses: 0 } as unknown as Standing);

function state() {
  const stats = (o: Record<string, { g: number }>) => o as unknown as Record<string, PlayerSeasonStats>;
  const leagueSchedules: Record<string, ScheduleEntry[]> = {
    LEAGUE_KBL_FARM: [game("f1", "T_A_2", "T_B_2", false), game("f2", "T_B_2", "T_C_2", false)],
    LEAGUE_ABL: [game("a1", "X", "Y", false)],
  };
  const leagueState: Record<string, LeagueSeasonState> = {
    LEAGUE_KBL: { standings: [st("T_A_1", 5)], stats: {}, playerConditions: {}, teamRotationIndex: {} },
    LEAGUE_KBL_FARM: { standings: [st("T_A_2", 2)], stats: stats({ npc: { g: 1 } }), playerConditions: {}, teamRotationIndex: { T_A_2: 3 } },
  };
  return {
    leagueId: "LEAGUE_KBL",
    schedule: [game("k1", "T_A_1", "T_B_1", true), game("k2", "T_B_1", "T_C_1", false)],
    standings: [st("T_A_1", 5)],
    stats: stats({ hero: { g: 3 } }),
    leagueSchedules,
    leagueState,
  };
}

describe("switchProtagonistLeague — 승강 때 주인공 일정을 맞바꾼다", () => {
  it("강등: 2군 일정이 s.schedule 로 오고 주인공 팀 경기에 표시가 켜진다 · 1군 일정은 배경으로 돌아간다", () => {
    const s = state();
    const n = switchProtagonistLeague(s, "LEAGUE_KBL_FARM", "T_A_2");
    expect(n.leagueId).toBe("LEAGUE_KBL_FARM");
    expect(n.schedule.map((e) => e.id)).toEqual(["f1", "f2"]);
    expect(n.schedule.map((e) => e.isProtagonistGame)).toEqual([true, false]);
    expect(n.leagueSchedules.LEAGUE_KBL_FARM).toBeUndefined();
    expect(n.leagueSchedules.LEAGUE_KBL?.map((e) => e.id)).toEqual(["k1", "k2"]);
    // 옛 일정의 주인공 표시는 꺼진다 — 배경 시뮬이 그대로 돌린다
    expect(n.leagueSchedules.LEAGUE_KBL?.every((e) => e.isProtagonistGame === false)).toBe(true);
    expect(n.leagueSchedules.LEAGUE_ABL?.map((e) => e.id)).toEqual(["a1"]);
  });

  it("순위·스탯도 같이 — 옛 것은 leagueState[from] 으로, 새 것은 leagueState[to] 에서", () => {
    const n = switchProtagonistLeague(state(), "LEAGUE_KBL_FARM", "T_A_2");
    expect(n.standings).toEqual([st("T_A_2", 2)]);
    expect(n.stats).toEqual({ npc: { g: 1 } });
    expect(n.leagueState.LEAGUE_KBL.standings).toEqual([st("T_A_1", 5)]);
    expect(n.leagueState.LEAGUE_KBL.stats).toEqual({ hero: { g: 3 } });
    // 새 리그의 로테이션 인덱스는 보존된다
    expect(n.leagueState.LEAGUE_KBL_FARM.teamRotationIndex).toEqual({ T_A_2: 3 });
  });

  it("승격(되돌아옴): 두 번 바꾸면 원래 리그 일정·표시로 돌아온다", () => {
    const down = switchProtagonistLeague(state(), "LEAGUE_KBL_FARM", "T_A_2");
    const up = switchProtagonistLeague(down, "LEAGUE_KBL", "T_A_1");
    expect(up.leagueId).toBe("LEAGUE_KBL");
    expect(up.schedule.map((e) => [e.id, e.isProtagonistGame])).toEqual([["k1", true], ["k2", false]]);
    expect(up.leagueSchedules.LEAGUE_KBL_FARM?.map((e) => e.id)).toEqual(["f1", "f2"]);
  });

  it("같은 리그 안에서 팀만 바뀌면(트레이드) 일정은 그대로, 표시만 새 팀으로", () => {
    const n = switchProtagonistLeague(state(), "LEAGUE_KBL", "T_C_1");
    expect(n.schedule.map((e) => [e.id, e.isProtagonistGame])).toEqual([["k1", false], ["k2", true]]);
    expect(n.leagueSchedules).toEqual(state().leagueSchedules);
  });

  it("새 리그 일정이 배경에 없으면 아무것도 안 바꾼다 — 시즌 여는 자리가 맡는다", () => {
    const s = state();
    expect(switchProtagonistLeague(s, "LEAGUE_JBL", "Z")).toBe(s);
  });

  it("원본을 안 건드린다", () => {
    const s = state();
    switchProtagonistLeague(s, "LEAGUE_KBL_FARM", "T_A_2");
    expect(s.leagueId).toBe("LEAGUE_KBL");
    expect(s.schedule[0].isProtagonistGame).toBe(true);
    expect(s.leagueSchedules.LEAGUE_KBL_FARM).toHaveLength(2);
  });

  /**
   * 🔴 **둘은 짝이다.** 소속·리그를 바꾸는 쪽(`setProtagonistTeam`)과 일정·순위표를
   *   맞바꾸는 쪽(`switchProtagonistLeague`) 중 하나만 부르면 **순위표만 맞고
   *   일정은 옛 리그**가 된다(2026-09-02 실측 · 상대가 전부 옛 팀이었다).
   *
   * ⚠ 2026-09-08 에 그 짝이 `applyProtagonistTierMove` **한 자리로 모였다**
   *   (L2 — 통지의 `rosterMove` 가 같은 이동을 해야 해서 꺼냈다). 지켜야 할
   *   자리가 하나로 줄었으니 검사도 그 자리를 본다.
   */
  it("승강 정본이 setProtagonistTeam 바로 뒤에 이 교체를 부른다", () => {
    const src = readFileSync(resolve(__dirname, "../../usecases/weekPhases/market.ts"), "utf8");
    const at = src.indexOf("gameStore.setProtagonistTeam(toTeamId, toLeague);");
    expect(at).toBeGreaterThan(0);
    expect(src.slice(at, at + 200)).toContain("seasonStore.switchProtagonistLeague(toLeague, toTeamId)");
  });

  it("월간 승강 기계가 store 를 직접 안 건드리고 그 정본을 부른다 — 두 벌이 되면 한쪽만 고쳐진다", () => {
    const src = readFileSync(resolve(__dirname, "../../usecases/weekPhases/market.ts"), "utf8");
    // 옛 사본(주인공 전용 인라인 이동)이 되살아나면 여기서 걸린다
    expect(src).not.toContain("gameStore.setProtagonistTeam(protoTo,");
    expect(src).toContain("applyProtagonistTierMove(protoTo, weekNum)");
  });
});
