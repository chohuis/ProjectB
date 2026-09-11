import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildTeamRoster, starterOfRotation } from "../rosterEngine";
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
// 투수는 연습경기에만 나와 리그 이닝 중앙이 **3.3**이었다.
//
// ── 2026-08-28에 같은 자리에서 **반대 결함**이 나왔다 ─────────
//
// 위 결함을 고치면서 `buildTeamRoster`가 명단을 **미리 돌려서** 넘기게
// 됐는데, **받는 쪽도 돌리고 있었다.** 같은 일을 하는 자리가 넷이었고
// 두 규칙으로 갈려 있었다:
//
//   npc_sim `build_pit_queue`   rotation[rot_idx % len]   → base[(2·k) % len]
//   mergeConditions             rotation[rotIdx % len]    → base[(2·k) % len]
//   simulateWithMatchEngine     rotation.slice(0, 1)      → base[k % len]
//   applyGameOutcome            base[rotIdx % len]        → base[k % len]
//
// 결과: **실제로 던진 투수와 `lastStartGameCount`를 받는 투수가 달랐다.**
// 던진 사람은 불펜으로 기록되고 안 던진 사람이 선발로 기록됐다.
//
// **그래서 검사가 보는 자리를 옮겼다.** 명단을 만드는 함수가 아니라
// **선발을 고르는 함수 하나**(`starterOfRotation`)를 본다 — 그게 정본이고,
// 네 자리가 전부 그걸 부르는지도 함께 본다.

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
  const row = (id: string, player: Record<string, unknown>) =>
    ({
      id,
      role: "player",
      teamId,
      status: "active",
      details: { player },
    }) as unknown as EntityRow;

  const sp = (n: number, ovr: number) =>
    row(`PLY_SP_${n}`, {
      teamId,
      playerType: "pitcher",
      position: "SP",
      pitching: { ovr },
      batting: { ovr: 20 },
      age: 18,
    });
  // 타자도 있어야 라인업이 선다 — 로테이션 판정엔 안 쓰인다
  const bat = (n: number) =>
    row(`PLY_BAT_${n}`, {
      teamId,
      playerType: "batter",
      position: "CF",
      batting: { ovr: 60 },
      pitching: { ovr: 0 },
      age: 18,
    });

  return [
    sp(1, 78),
    sp(2, 72),
    sp(3, 66),
    sp(4, 60),
    ...Array.from({ length: 9 }, (_, i) => bat(i)),
  ];
}

describe("로테이션 인덱스", () => {
  const entities = makeTeam("TEAM_X");
  const rotation = buildTeamRoster({ teamId: "TEAM_X", entities, maxRotation: 3 }).rotation;
  const starterAt = (rotIdx: number) => starterOfRotation(rotation, rotIdx);

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

  it("큰 인덱스도 안전하다", () => {
    expect(starterAt(300)).toBe(starterAt(0));
  });

  it("명단이 비면 undefined다 — 던지지 않는다", () => {
    expect(starterOfRotation([], 3)).toBeUndefined();
  });

  /**
   * 🔴 **짝수 로테이션이 반만 쓰이지 않는다.** 두 번 돌리면 `gcd(2, len)`이
   *   1이 아닌 길이(4·6…)에서 **자리 절반이 영영 안 나온다.** 5인·3인은
   *   홀수라 두 번 돌려도 전부 나오므로, 4인으로 재야 이 결함이 보인다.
   */
  it("4인 로테이션이 네 명을 모두 쓴다", () => {
    const rot4 = buildTeamRoster({ teamId: "TEAM_X", entities, maxRotation: 4 }).rotation;
    expect(rot4).toHaveLength(4);
    const seen = new Set([0, 1, 2, 3].map((k) => starterOfRotation(rot4, k)));
    expect(seen.size).toBe(4);
  });

  describe("배선", () => {
    it("명단을 만드는 자리는 돌리지 않는다", () => {
      // 🔴 여기서 돌리면 받는 쪽과 합쳐 두 번이 된다
      const src = read("apps/ui/src/shared/utils/rosterEngine.ts");
      expect(src).toContain("export function buildTeamRoster(p: BuildRosterParams)");
      expect(src.includes("base.slice(rotIdx % base.length)")).toBe(false);
      // 인덱스 자체를 안 받는다 — 받으면 언젠가 또 쓴다
      expect(src.includes("rotIdx?: number;")).toBe(false);
    });

    it("선발을 고르는 네 자리가 같은 함수를 쓴다", () => {
      // 🔴 손으로 색인한 자리가 하나라도 남으면 규칙이 다시 둘이 된다
      const files = [
        "apps/ui/src/shared/utils/gameSimulator.ts",
        "apps/ui/src/shared/utils/matchLineupBuilder.ts",
        "apps/ui/src/shared/usecases/applyGameOutcome.ts",
      ];
      for (const f of files) {
        expect(read(f), f).toContain("starterOfRotation(");
      }
      // 옛 규칙이 돌아오지 않는다
      const gs = read("apps/ui/src/shared/utils/gameSimulator.ts");
      expect(gs.includes("homeRotation.slice(0, 1)")).toBe(false);
      expect(gs.includes("params.homeRotation.slice(0, 1)")).toBe(false);
    });

    it("Rust도 같은 규칙이다", () => {
      // npc_sim 갈래는 지금 어느 리그도 안 타지만(`FULL_ENGINE_LEAGUES`가
      // 전부다), 명단이 안 돌아간 채 오므로 색인은 여기서 한 번 한다
      const rs = read("packages/engine-native/src/npc_sim.rs");
      expect(rs).toContain("q.push(rotation[rot_idx % rotation.len()].clone());");
    });

    it("주인공 팀 경기도 옵션을 넘긴다", () => {
      // 예전엔 `simulateGame(home, away, entities)`만 불러서 기본값이 들어갔다:
      // 피로 없음 · rotIdx 0 · rotationSize 5 · leagueId "" (통합 엔진 미적용)
      // · npcLiveStats 없음(생성값 OVR). 값이 있고 타입도 맞아 조용했다
      const g = read("apps/ui/src/shared/usecases/weekPhases/games.ts");
      for (const k of [
        "conditions:",
        "homeRotIdx",
        "rotationSize:",
        "npcLiveStats:",
        "leagueId,",
      ]) {
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
