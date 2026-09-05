// ── 주인공 OVR — **파생값의 정본** ────────────────────────────────
//
// 🔴 **세 벌이었다** (2026-09-06 실측).
//
//     stores/game.ts  normalizeProtagonist   불러올 때 다시 계산한다
//     Rust growth_engine.rs                  성장 로그가 있을 때만 다시 계산한다
//     …그리고 아무 데도 없는 자리 하나         이벤트로 능력치가 바뀌는 자리
//
//   `applyEffectToProtagonist` 는 `statDelta` 로 능력치를 올리면서 **OVR 은
//   안 건드렸다.** 주석엔 "`ovr`은 파생값이라 못 바꾼다 — 능력치에서
//   계산된다"고 적혀 있는데, **계산하는 코드가 그 자리에 없었다.**
//
//   그래서 이벤트로 오른 만큼 OVR 이 뒤처졌고, **불러오기 전까지 안 맞았다.**
//   왕복 검사(`check:roundtrip`)가 그것을 이렇게 잡았다:
//
//       protagonist.json:protagonist.batting.ovr   30 → 35
//
//   (투구 쪽이 안 잡힌 건 투수 주인공이 매주 투구 훈련을 해서 Rust 의
//   재계산이 자주 돌았기 때문이다 — 타격은 그 길이 거의 안 열린다.
//   즉 **투구도 같은 결함이었고 증상만 덜했다.**)
//
// ⚠ **화면만의 문제가 아니다.** `pitching.ovr` 은 주인공을 NPC 로 볼 때의
//   `overall` 로 나간다(`stores/game.ts` 의 `toNpcView`) — 스카우트·드래프트
//   순위가 그 값을 읽는다.
//
// ⚠ Rust 에도 같은 식이 있다(`growth_engine.rs` `calc_pitching_ovr` ·
//   `calc_batting_ovr`). 언어가 달라 합칠 수는 없으니 **계수가 갈리지
//   않는지 `ovrFormula.test.ts` 가 두 파일을 맞춰 본다.**

import type { PitchingAttributes, BattingAttributes } from "../types/save";

/** 투구 OVR — 가중합 ÷ 12.0 */
export function pitchingOvrOf(p: PitchingAttributes): number {
  return Math.round((
    p.velocity    * 2.5 +
    p.command     * 2.5 +
    p.control     * 2.0 +
    p.movement    * 1.5 +
    p.stamina     * 1.5 +
    p.mentality   * 1.0 +
    p.recovery    * 0.5 +
    (p.clutch      ?? 50) * 0.3 +
    (p.holdRunners ?? 50) * 0.2
  ) / 12.0);
}

/** 타격 OVR — 가중합 ÷ 11.8 */
export function battingOvrOf(b: BattingAttributes): number {
  return Math.round((
    b.contact       * 2.0 +
    b.power         * 1.8 +
    b.eye           * 1.5 +
    b.discipline    * 1.2 +
    b.speed         * 1.3 +
    (b.baseInstinct ?? 50) * 0.7 +
    (b.bunting      ?? 45) * 0.3 +
    (b.platoon      ?? 50) * 0.3 +
    b.fielding      * 1.3 +
    b.arm           * 0.8 +
    b.battingClutch * 0.6
  ) / 11.8);
}
