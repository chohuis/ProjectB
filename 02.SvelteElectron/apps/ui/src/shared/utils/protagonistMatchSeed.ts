import { seedOf } from "./seedOf";
import { isMeasureMode } from "./measureMode";

// ── 주인공 경기 씨앗 ───────────────────────────────────────────────────────
//
// 🔴 **주인공 경기만 재현이 안 됐다** (2026-09-07 실측). 리그 경기
// (`gameSimulator.ts`)는 `worldSeed`에서 씨앗을 파생해 넘기는데, 주인공
// 경기 호출부(`runAutoAdvance.handleGame` · `MainPage` · `MatchPage`)는
// 씨앗을 아예 안 넘겨서 Rust가 `thread_rng`로 떨어졌다. 그 탓에 같은
// 씨앗·프리셋·훈련으로 고교 3년을 돌려도 드래프트가 **2R11P → 10R91P →
// 5R47P** 로 매번 달랐다(`BALANCE_BASELINE_101.md` §2).
//
// ⚠ **실제 플레이는 그대로 둔다.** 게임 전체 결정성은 목표가 아니다
// (`CLAUDE.md`). 계측 모드에서만 씨앗을 넘긴다 — 그래야 전후를 잰다.
//
// ⚠ **무엇을 섞느냐가 뜻을 정한다** (`seedOf.ts` 머리말과 같은 규약):
//   · `worldSeed` — 세이브를 가른다
//   · 시즌·주차 — 같은 판의 다른 경기를 가른다
//   · 일정 id — 같은 주에 두 경기가 있어도(더블헤더·대회) 안 겹친다
//
// ⚠ **0을 안 돌려준다** — 엔진이 0을 "씨앗 없음"으로 읽어 `thread_rng`로
//   샌다(`lib.rs start_match_native`). `seedOf`가 이미 0을 피한다.

/**
 * 계측 모드일 때만 주인공 경기 씨앗을 돌려준다. 아니면 `undefined` —
 * 호출부가 `...(seed === undefined ? {} : { seed })` 로 펴서 넘긴다.
 */
export function protagonistMatchSeed(
  worldSeed: number | undefined,
  season: number,
  week: number,
  scheduleId: string,
): number | undefined {
  if (!isMeasureMode()) return undefined;
  return seedOf(worldSeed ?? 0, season, week, scheduleId);
}
