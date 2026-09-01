import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **회피한 경기도 선수 기록이 남아야 한다** (2026-09-01 · 트랙 C 가 잡았다).
 *
 * ## 🔴 무엇이 틀렸었나
 *
 * `MainPage` 의 "회피" 갈래가 `weekCalcNpcFallback` 을 부르고 그 반환을
 * `playerLines: []` 로 감쌌다. 그 엔진 함수는 **점수 넷만** 돌려준다:
 *
 * ```rust
 * pub struct NpcFallbackResult {
 *     pub home_score: u32, pub away_score: u32,
 *     pub winner_id: String, pub loser_id: String,
 * }
 * ```
 *
 * 이름 그대로 **폴백**이고, `backgroundLeague` 는 시뮬이 실패했을 때
 * (`!sim.result.winnerId`) **만** 그리로 간다. 회피 갈래는 처음부터 그걸 썼다.
 *
 * 결과: 점수는 나오고 순위도 오르는데 **그 경기의 선수 기록만 통째로 없다.**
 * 순위표로는 안 보인다 — 회피를 자주 쓰면 시즌 성적이 조용히 비어 간다.
 *
 * ## ⚠ 왜 화면에서 못 고쳤나
 *
 * 진짜 시뮬은 엔티티·컨디션·로테이션·부상·라이브스탯·구장·씨앗을 다 모아야
 * 부른다. `pages/` 는 C 소유이고 `stores/` 는 A 소유라 **화면에서 모으면
 * 경계도 넘는다.** 그래서 A 가 usecase 로 감쌌다 — 화면은 한 줄만 부른다.
 *
 * ## ⚠ 폴백을 지우지 않는다
 *
 * 로스터가 비면 시뮬이 여전히 실패하고, 그때는 점수라도 나와야 일정이 안
 * 막힌다. **`null` 을 돌려주고 호출부가 예전 경로로 가게** 둔다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("회피 경기 시뮬", () => {
  const S = read("apps/ui/src/shared/usecases/simulateSkippedGame.ts");

  /** 🔴 배경 리그와 **같은 함수**를 써야 한다 — 다른 걸 쓰면 또 갈린다 */
  it("배경 경기와 같은 시뮬 경로를 쓴다", () => {
    expect(S).toContain('import { runSimBatch } from "../stores/backgroundLeague";');
    expect(S).toContain("const simmed = await runSimBatch(");
  });

  /**
   * ⚠ **빈 `playerLines` 를 성공으로 치면 안 된다.** `runSimBatch` 는 시뮬이
   *   실패하면 스스로 폴백을 태우고 `playerLines: []` 를 돌려준다 —
   *   그걸 성공으로 돌려주면 "고쳤는데 여전히 빈다"를 못 가린다.
   */
  it("선수 기록이 비면 null 을 돌려준다", () => {
    expect(S).toContain("hit.result.playerLines.length === 0) return null;");
  });

  /** 시뮬에 필요한 재료를 빠뜨리면 조용히 나빠진다 — 배경과 같은 것을 넘긴다 */
  it("구장·씨앗·컨디션·로테이션을 넘긴다", () => {
    expect(S).toContain("const parkRefs = { teams: m.teams ?? [], stadiums: m.stadiums ?? [] };");
    expect(S).toContain("s.worldSeed,");
    expect(S).toContain("conditions: lState?.playerConditions ?? {},");
    expect(S).toContain("homeRotIdx: lState?.teamRotationIndex?.[entry.homeTeamId] ?? 0,");
  });

  /**
   * 🔴 **폴백 함수의 반환 모양이 바뀌면 이 수정의 근거가 사라진다.**
   *   지금은 점수 넷뿐이라 선수 기록이 없다 — 그게 전제다.
   */
  it("엔진 폴백은 여전히 점수만 돌려준다", () => {
    const W = read("packages/engine-native/src/week_engine.rs");
    expect(W).toContain("pub struct NpcFallbackResult {");
    expect(W).toContain("pub home_score: u32,");
    expect(W).toContain("pub winner_id: String,");
    // 선수 기록 칸이 생기면 이 검사가 깨진다 — 그때 이 우회를 다시 본다
    expect(W).not.toContain("pub player_lines:");
  });
});
