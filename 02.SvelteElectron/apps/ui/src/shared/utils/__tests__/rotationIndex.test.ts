import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTeamRoster } from "../rosterEngine";
import type { EntityRow } from "../../stores/master";

// ── 로테이션 인덱스가 실제로 선발을 바꾼다 ─────────────────────
//
// ⚠ **이 결함은 소스를 읽어선 못 잡았다.** 인덱스는 저장되고, 갱신되고,
// 다음 경기로 넘어갔다 — 배선을 따라가면 전부 정상이었다. 그런데 정작
// 쓰이는 자리가 없었다:
//
//   정의  buildTeamRoster(..., currentWeek, teamGameCount, leagueId, rotationSense, ...)
//   호출  buildTeamRoster(..., week,        homeRotIdx,    leagueId, homeHandlePersonnel)
//
// 타입이 둘 다 number라 조용히 통과했고, `getTeamRotation`은 그 값을
// `void gameCount;`로 버렸다. 매 경기 `rotation[0]`(OVR 1위)이 선발이었다.
//
// 실측: 한 투수가 시즌 **186이닝 · 36등판**(팀 공식경기 거의 전부). 나머지
// 투수는 연습경기에만 나와 리그 이닝 중앙이 **3.3**이었다. 그 위에서 잰
// NPC ERA·OVR 상관과 드래프트 대응표가 전부 어긋나 있었다.
//
// **그래서 이 검사는 실제로 함수를 부른다.** 소스 문자열 검사는 같은
// 결함을 또 놓친다 — 인자 자리가 바뀌어도 문자열은 그대로다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/**
 * SP 넷을 가진 팀 하나 — OVR이 서로 달라 순서가 구분된다.
 *
 * ⚠ `role`·`teamId`·`status`는 **최상위**다 (`getTeamPlayers`가 거기서
 * 거른다). `details.player`에만 넣으면 로스터가 통째로 비어 검사가
 * "선발이 undefined"로 실패한다 — 처음에 그렇게 짰다.
 */
function makeTeam(teamId: string): EntityRow[] {
  const row = (id: string, player: Record<string, unknown>) => ({
    id, role: "player", teamId, status: "active",
    details: { player },
  }) as unknown as EntityRow;

  const sp = (n: number, ovr: number) =>
    row(`PLY_SP_${n}`, {
      teamId, playerType: "pitcher", position: "SP",
      pitching: { ovr }, batting: { ovr: 20 }, age: 18,
    });
  // 타자도 있어야 라인업이 선다 — 로테이션 판정엔 안 쓰인다
  const bat = (n: number) =>
    row(`PLY_BAT_${n}`, {
      teamId, playerType: "batter", position: "CF",
      batting: { ovr: 60 }, pitching: { ovr: 0 }, age: 18,
    });

  return [
    sp(1, 78), sp(2, 72), sp(3, 66), sp(4, 60),
    ...Array.from({ length: 9 }, (_, i) => bat(i)),
  ];
}

describe("로테이션 인덱스", () => {
  const entities = makeTeam("TEAM_X");
  const starterAt = (rotIdx: number) =>
    buildTeamRoster({ teamId: "TEAM_X", entities, maxRotation: 3, rotIdx }).rotation[0];

  it("인덱스가 다르면 선발이 다르다", () => {
    // 이게 깨지면 한 투수가 시즌을 다 던진다
    expect(starterAt(0)).not.toBe(starterAt(1));
    expect(starterAt(1)).not.toBe(starterAt(2));
  });

  it("3인 로테이션이 세 명을 모두 쓴다", () => {
    const seen = new Set([starterAt(0), starterAt(1), starterAt(2)]);
    expect(seen.size).toBe(3);
  });

  it("한 바퀴 돌면 처음으로 돌아온다", () => {
    expect(starterAt(3)).toBe(starterAt(0));
    expect(starterAt(4)).toBe(starterAt(1));
  });

  it("0번은 OVR 1위다 — 회전이 순서를 뒤집지는 않는다", () => {
    expect(starterAt(0)).toBe("PLY_SP_1");
    expect(starterAt(1)).toBe("PLY_SP_2");
  });

  it("명단 자체는 그대로다 — 회전이 인원을 바꾸지 않는다", () => {
    const a = [...buildTeamRoster({ teamId: "TEAM_X", entities, maxRotation: 3, rotIdx: 0 }).rotation].sort();
    const b = [...buildTeamRoster({ teamId: "TEAM_X", entities, maxRotation: 3, rotIdx: 2 }).rotation].sort();
    expect(a).toEqual(b);
  });

  it("큰 인덱스도 안전하다", () => {
    expect(starterAt(300)).toBe(starterAt(0));
  });

  describe("배선", () => {
    it("인자를 객체로 받는다 — 자리 뒤바뀜이 다시 안 생기게", () => {
      const src = read("apps/ui/src/shared/utils/rosterEngine.ts");
      expect(src).toMatch(/export function buildTeamRoster\(p: BuildRosterParams\)/);
      expect(src).toMatch(/rotIdx\?: number;/);
    });

    it("주인공 팀 경기도 옵션을 넘긴다", () => {
      // 예전엔 `simulateGame(home, away, entities)`만 불러서 기본값이 들어갔다:
      // 피로 없음 · rotIdx 0 · rotationSize 5 · leagueId "" (통합 엔진 미적용)
      // · npcLiveStats 없음(생성값 OVR). 값이 있고 타입도 맞아 조용했다
      const g = read("apps/ui/src/shared/usecases/weekPhases/games.ts");
      for (const k of ["conditions:", "homeRotIdx", "rotationSize:", "npcLiveStats:", "leagueId,"]) {
        expect(g).toContain(k);
      }
      expect(g).toMatch(/nextHomeRotIdx: sim\.nextHomeRotIdx/);
    });

    it("공식경기도 로테이션·피로를 얹는다", () => {
      // 세 경로(공식·연습·같은리그NPC)가 같은 상태를 다르게 다루면 어긋난다
      const s = read("apps/ui/src/shared/stores/season.ts");
      expect(s).toMatch(/applyMatchResult\([\s\S]{0,400}rot\?: \{/);
      expect(s).toMatch(/\.\.\.\(rot \? \{[\s\S]{0,300}teamRotationIndex/);
    });
  });
});
