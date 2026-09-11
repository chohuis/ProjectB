import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { syncProtagonistLeagueUpdate } from "../backgroundLeague";
import type { SeasonStoreState } from "../season";
import type { MatchResult } from "../../types/season";

/**
 * **주인공 팀 선발 로테이션이 정규 경기에서도 돈다** (2026-09-01 · 트랙 C 가 찾았다).
 *
 * ## 🔴 무엇이 빠져 있었나
 *
 * 주인공 경기 결과를 처리하는 경로가 둘인데 **한쪽만 로테이션을 올렸다**:
 *
 * ```
 *   친선·대회·그룹   recordGameResult(...) → nextHomeRotIdx/nextAwayRotIdx 를 넘긴다  ○
 *   정규 리그        applyGameOutcome:349  applyMatchResult(id, result)              ✗
 *                    → leagueId 도 rot 도 안 넘긴다. 그러면 `if (!leagueId) return`
 *                      에 걸려 leagueState 를 아예 안 건드린다
 *                    → 바로 다음 줄 `syncProtagonistLeagueResult` 가 리그 상태를
 *                      맡는데, 그쪽이 로테이션을 안 올렸다
 * ```
 *
 * 배경 팀은 `simulateBackgroundWeek` 가 올리고 친선은 명시로 넘기는데
 * **정규 경기만 빠져 있었다.**
 *
 * ## ⚠ 왜 `applyMatchResult` 로 안 고쳤나
 *
 * 거기 `rot` 인자가 이미 있지만, 쓰려면 `leagueId` 를 같이 넘겨야 한다.
 * 그러면 **바로 다음 줄의 `syncProtagonistLeagueUpdate` 와 리그 순위·기록을
 * 두 번 누적**한다. 리그 상태를 맡은 쪽에 넣는 게 맞다.
 *
 * ## ⚠ 실측으로는 아직 못 갈랐다 — 고교로는 안 보인다
 *
 * 고교 3시즌 · 주인공 팀 로테이션 (수정 전 → 후):
 *
 * ```
 *   전  44 · 46 · 41 · 43
 *   후  41 · 43 · 45 · 47
 * ```
 *
 * 겹친다. **고교 주인공 경기는 대부분 대회·친선이라 이 경로를 거의 안 탄다.**
 * 프로(주인공이 KBL)에서 재야 드러난다 — 그때까지는 이 검사가 전제를 지킨다.
 *
 * 🔴 **중복 증가는 아니다.** `recordGameResult` 호출부 둘이 전부 친선 블록
 * 안이고, 정규 분기는 `applyMatchResult(id, result)` 하나뿐임을 확인했다.
 * 아래 세 번째 검사가 그 전제를 못박는다 — 깨지면 이중 증가가 된다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const emptyResult = (): MatchResult =>
  ({
    homeScore: 3,
    awayScore: 1,
    winnerId: "TEAM_A",
    loserId: "TEAM_B",
    playerLines: [],
    events: [],
  }) as unknown as MatchResult;

const stateWith = (rot: Record<string, number>): SeasonStoreState =>
  ({
    leagueState: {
      LEAGUE_KBL: {
        standings: [],
        stats: {},
        playerConditions: {},
        teamRotationIndex: rot,
      },
    },
  }) as unknown as SeasonStoreState;

describe("주인공 팀 로테이션", () => {
  it("정규 경기 결과가 양 팀 로테이션을 한 칸씩 올린다", () => {
    const next = syncProtagonistLeagueUpdate(
      stateWith({ TEAM_A: 5, TEAM_B: 9 }),
      "LEAGUE_KBL",
      emptyResult(),
      "TEAM_A",
      "TEAM_B",
    );
    const idx = next.leagueState.LEAGUE_KBL.teamRotationIndex;
    expect(idx.TEAM_A).toBe(6);
    expect(idx.TEAM_B).toBe(10);
  });

  /** 값이 없던 팀도 0에서 시작해 올라야 한다 — 첫 경기가 그렇다 */
  it("기록이 없던 팀은 0에서 1이 된다", () => {
    const next = syncProtagonistLeagueUpdate(
      stateWith({}),
      "LEAGUE_KBL",
      emptyResult(),
      "TEAM_A",
      "TEAM_B",
    );
    const idx = next.leagueState.LEAGUE_KBL.teamRotationIndex;
    expect(idx.TEAM_A).toBe(1);
    expect(idx.TEAM_B).toBe(1);
  });

  /**
   * 🔴 **이중 증가 방지.** 정규 분기가 `recordGameResult`(로테이션을 넘기는
   *   쪽)를 부르기 시작하면 같은 경기에 두 번 오른다.
   *   호출부가 **친선 블록 안 둘뿐**이라는 전제를 지킨다.
   */
  it("정규 분기는 applyMatchResult 에 leagueId·rot 를 안 넘긴다", () => {
    const S = read("apps/ui/src/shared/usecases/applyGameOutcome.ts");
    // 이 한 줄이 정규 분기다 — 인자가 둘뿐이어야 한다
    expect(S).toContain("seasonStore.applyMatchResult(outcome.scheduleId, matchResult);");
    // 그리고 리그 상태는 바로 다음 줄이 맡는다
    expect(S).toContain(
      "seasonStore.syncProtagonistLeagueResult(protagonist.leagueId, matchResult,",
    );
  });

  /** 배경·친선이 올리는 자리는 그대로여야 한다 — 한쪽만 고치면 또 어긋난다 */
  it("배경 경기와 친선 경기의 로테이션 갱신이 그대로다", () => {
    const B = read("apps/ui/src/shared/stores/backgroundLeague.ts");
    expect(B).toContain("[item.homeTeamId]: sim.nextHomeRotIdx,");
    const A = read("apps/ui/src/shared/usecases/recordGameResult.ts");
    expect(A).toContain("{ nextHomeRotIdx, nextAwayRotIdx, pitcherConditions },");
  });
});
