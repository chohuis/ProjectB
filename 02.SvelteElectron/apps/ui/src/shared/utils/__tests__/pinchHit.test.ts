import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getTeamBench, buildTeamRoster } from "../rosterEngine";
import type { EntityRow } from "../../stores/master";

/**
 * **대타** (7단계 · 2026-08-30).
 *
 * 🔴 **엔진에 자리를 만들어도 벤치가 안 넘어오면 죽은 갈래다.**
 *
 * `buildTeamRoster` 가 라인업 **9명만** 내고 있었다. 그래서 대타 판정을
 * 넣어도 벤치가 늘 비어 한 번도 안 돌았을 것이다. `serde(default)` 라
 * **오류도 안 난다** — 배선 누락이 "아무 일도 안 일어남"으로만 나타난다.
 * 이 파일이 지키는 게 그 다섯 층이다:
 *
 * ```
 *   ① 로스터    buildTeamRoster → bench
 *   ② 리그 경기 gameSimulator → homeBench/awayBench
 *   ③ 주인공    MatchPage → homeBench/awayBench (절대 좌표로 갈라 넣는다)
 *   ④ 엔진 입력 StartMatchOpts.home_bench
 *   ⑤ 엔진 판정 대타 교체 + 기록
 * ```
 *
 * 실측 (`node scripts/probe-pinchhit.cjs --games 300` · 씨앗 3개):
 *   팀당 경기당 0.85 / 1.19 / 1.40회 · 벤치 없이 돌리면 **0회**
 *   (KBO 는 1~2회)
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const bat = (id: string, ovr: number): EntityRow => ({
  // ⚠ `role`·`teamId`·`status` 는 **최상위**다 — `getTeamPlayers` 가
  //   거기서 거른다. `details.player` 에만 넣으면 로스터가 통째로 비고
  //   검사가 조용히 0을 낸다 — 처음에 그렇게 짠다.
  id, name: id, role: "player", teamId: "TEAM_X", status: "active",
  details: {
    player: {
      teamId: "TEAM_X", playerType: "batter", position: "LF", age: 25,
      batting: {
        ovr, contact: ovr, power: ovr, eye: ovr, discipline: ovr,
        speed: ovr, baseInstinct: ovr, battingClutch: ovr,
        bunting: ovr, fielding: ovr, arm: ovr,
      },
    },
  },
} as unknown as EntityRow);

const pit = (id: string, ovr: number): EntityRow => ({
  id, name: id, role: "player", teamId: "TEAM_X", status: "active",
  details: {
    player: {
      teamId: "TEAM_X", playerType: "pitcher", position: "SP", age: 25,
      pitching: { ovr, command: ovr, velocity: ovr, stamina: ovr, control: ovr, movement: ovr },
    },
  },
} as unknown as EntityRow);

describe("대타 — 벤치가 실제로 만들어진다", () => {
  // 타자 14 + 투수 5 — 라인업 9를 채우고도 남는다
  const entities: EntityRow[] = [
    ...Array.from({ length: 14 }, (_, i) => bat(`B${i}`, 80 - i)),
    ...Array.from({ length: 5 }, (_, i) => pit(`P${i}`, 70 - i)),
  ];

  it("라인업에 안 든 타자로 벤치를 만든다", () => {
    const lineup = ["B0", "B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"];
    const bench = getTeamBench("TEAM_X", entities, lineup);
    expect(bench.length).toBe(4);
    // 🔴 라인업과 겹치면 자기 자신으로 교체된다
    for (const id of bench) expect(lineup).not.toContain(id);
  });

  it("투수는 벤치에 안 넣는다", () => {
    const bench = getTeamBench("TEAM_X", entities, []);
    for (const id of bench) expect(id.startsWith("P")).toBe(false);
  });

  /** 🔴 여기가 예전에 없던 것이다 — 라인업 9명만 나왔다 */
  it("buildTeamRoster 가 벤치를 낸다", () => {
    const r = buildTeamRoster({ teamId: "TEAM_X", entities, maxRotation: 3 });
    expect(r.lineup.length).toBe(9);
    expect(r.bench.length).toBeGreaterThan(0);
    for (const id of r.bench) expect(r.lineup).not.toContain(id);
  });

  it("타자가 모자라면 빈 벤치다 — 터지지 않는다", () => {
    const few = [bat("S0", 70), bat("S1", 69), pit("SP0", 70)];
    expect(getTeamBench("TEAM_X", few, ["S0", "S1"])).toEqual([]);
  });
});

describe("대타 — 다섯 층이 이어져 있다", () => {
  const GS = read("apps/ui/src/shared/utils/gameSimulator.ts");
  const MP = read("apps/ui/src/pages/match/MatchPage.svelte");
  const TY = read("packages/engine-native/src/types.rs");
  const ME = read("packages/engine-native/src/match_engine.rs");

  it("② 리그 경기가 벤치를 넘긴다", () => {
    expect(GS).toContain("homeBench:    toSimBatters(homeRoster.bench)");
    expect(GS).toContain("awayBench:    toSimBatters(awayRoster.bench)");
    // 엔진 호출까지 가야 한다 — params 에만 담고 안 보내면 죽은 갈래다
    expect(GS).toContain("homeBench: (params.homeBench ?? []).map(toEngineBatter)");
    expect(GS).toContain("awayBench: (params.awayBench ?? []).map(toEngineBatter)");
  });

  /**
   * ⚠ 엔진 opts 의 벤치는 **절대 좌표**(홈/원정)다 — 라인업과 달리
   *   `myTeamLineup` 같은 별칭이 없다. 뒤집어 넣으면 상대 벤치가
   *   우리 타순으로 들어간다.
   */
  it("③ 주인공 경기가 홈/원정을 갈라 넘긴다", () => {
    expect(MP).toContain("function buildBenchForTeam(teamId: string)");
    expect(MP).toContain("isHome ? { homeBench: myBench } : { awayBench: myBench }");
    expect(MP).toContain("isHome ? { awayBench: oppBench } : { homeBench: oppBench }");
  });

  it("④ 엔진이 벤치를 받는다", () => {
    expect(TY).toContain("pub home_bench: Option<Vec<BatterStats>>");
    expect(TY).toContain("pub away_bench: Option<Vec<BatterStats>>");
    // 상태에도 있어야 소모분이 이어진다
    expect(TY).toContain("pub home_bench_used: usize");
    expect(ME).toContain("home_bench: opts.home_bench.clone().unwrap_or_default()");
  });

  /** ⚠ 비면 예전 동작이다 — 구 세이브가 죽으면 안 된다 */
  it("벤치가 없으면 예전과 같게 돈다", () => {
    expect(ME).toContain("used < bench.len()");
  });

  it("⑤ 대타가 타순 자리를 물려받는다", () => {
    expect(ME).toContain("pinch_state.home_lineup[slot] = picked");
    expect(ME).toContain("pinch_state.home_bench_used += 1");
  });

  /**
   * 🔴 로그가 `pre_state.logs` 로 가면 **한 줄도 안 나간다** — 마지막
   * 조합이 `state.logs` 를 복사하기 때문이다. 처음에 그렇게 짰다가
   * 프로브가 0을 내서 드러났다.
   */
  it("교체 로그가 화면까지 나간다", () => {
    expect(ME).toContain("let mut pinch_log: Option<String> = None;");
    expect(ME).toContain("let narrative_logs: Vec<String> = pinch_log.into_iter()");
    expect(ME).not.toContain("pinch_state.logs.push");
  });
});
