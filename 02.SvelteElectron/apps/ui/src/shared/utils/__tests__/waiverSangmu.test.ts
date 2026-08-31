import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **웨이버 청구가 상무를 데려갔다** (2026-08-31).
 *
 * 상무에 군인이 아닌 사람이 2~5명 있었다 — 전원 독립리그 생성 선수,
 * 26~33세(상무 상한 초과), 부대·입대년·원소속 없음. **기록이 답을 줬다:**
 * 전원의 이력이 `2026:waiver_claim→IND_SANGMU_PHOENIX` 였다.
 *
 * 🔴 `waiver_claim` **만** 목적지 팀을 NPC 소속에서 역산한다:
 *
 * ```rust
 *   let mut cands = size.iter()
 *       .filter(|(t, _)| npcs.iter().any(|n| n.current_team == **t && ...))
 *   cands.sort_by(|a, b| a.1.cmp(&b.1)...);   // 인원이 적은 팀부터
 * ```
 *
 * 다른 배정 경로는 TS 가 넘긴 `independentTeamIds`(상무 제외)를 쓰는데
 * 여기만 자기가 만든다. 게다가 **인원이 적은 팀부터** 고르니 정원 26인
 * 상무가 **늘 1순위**였다 — 다른 독립팀은 30~45명이다.
 *
 * ⚠ 역산으로 목적지를 찾는 자리는 **여기 하나뿐**이다(실측). 나머지 아홉은
 *   이미 아는 팀의 인원을 셀 뿐이다.
 *
 * ⚠ `draftDestinationTeams` 는 상무를 거르고 주석까지 달아 뒀다
 *   ("5시즌 뒤 상무 45명이 전원 미지명자"). **다른 길이 남아 있었다** —
 *   이 저장소에서 "한 경로만 고치고 됐다고 읽는다"가 여덟 번째다.
 *
 * 실측 (씨앗 20260803 · 3시즌):
 * ```
 *   전   26 → 26 → 40 → 38 → 31   {military 26, active/미필 5}
 *   후   26 → 26 → 39 → 35 → 26   {military/현역 26}  비군인 0명
 * ```
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("웨이버 — 군팀은 청구 대상이 아니다", () => {
  const NE = read("apps/ui/src/shared/utils/npcEngine.ts");
  const ST = read("packages/engine-native/src/sim_types.rs");
  const NS = read("packages/engine-native/src/npc_sim.rs");

  /** 🔴 `serde(default)` 라 안 넘기면 조용히 예전 동작이 된다 — 여기가 문지기다 */
  it("TS 가 제외 목록을 넘긴다", () => {
    expect(NE).toContain("waiverExcludeTeams: [...SANGMU_TEAM_IDS],");
    expect(NE).toContain('import { SANGMU_TEAM_IDS } from "./ids";');
  });

  it("엔진이 그 값을 받는다", () => {
    expect(ST).toContain("pub waiver_exclude_teams: Vec<String>,");
    expect(NS).toContain("params.waiver_exclude_teams.iter().cloned().collect();");
  });

  /** ⚠ 받기만 하고 안 쓰면 죽은 갈래다 */
  it("후보에서 실제로 뺀다", () => {
    expect(NS).toContain(".filter(|(t, _)| !exclude_teams.contains(*t))");
    // 역산 갈래가 그 바로 뒤에 있어야 한다 — 순서가 바뀌면 의미가 없다
    const i = NS.indexOf(".filter(|(t, _)| !exclude_teams.contains(*t))");
    const j = NS.indexOf("n.current_team == **t && n.current_league == league", i);
    expect(j).toBeGreaterThan(i);
  });
});
