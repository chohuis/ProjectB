# TEST SCENARIOS

## Match Outcome Parity (Auto vs Interactive)

### Goal
- Auto simulation and interactive play must use the same post-game pipeline.
- For the same final game outcome stats, progression updates must match.

### Scope
- `apps/ui/src/pages/main/MainPage.svelte`
- `apps/ui/src/shared/usecases/applyGameOutcome.ts`
- `apps/ui/src/shared/utils/growthEngine.ts` (IPC 래퍼 — 실제 로직은 `packages/engine-native/src/growth_engine.rs`)

> **주의**: `growthEngine.ts`는 Rust DLL IPC 래퍼입니다. 성장 계산 로직 자체는
> `packages/engine-native/src/growth_engine.rs`의 `calc_training_growth` / `calc_game_growth`에 있습니다.
> 성장 로직 수정 시 Rust 파일을 수정하고 `npm run build:native`를 실행하세요.

### Scenario A: Auto path
1. Open a pending game in `messages` tab.
2. Click `자동 시뮬`.
3. Confirm updates after processing:
   - schedule result recorded
   - pending game action resolved
   - protagonist patch applied (`fatigue/condition/morale`, growth)
   - fame and achievement metrics updated
   - game result message added

### Scenario B: Interactive path
1. Open the same kind of pending game.
2. Click `직접 플레이` and finish match.
3. Confirm the same update categories as Scenario A.

### Parity checks
- The same `UnifiedGameOutcome` fields produce equivalent post-processing:
  - score/win-loss-draw handling
  - strikeouts/hitsAllowed/walksAllowed input to growth pipeline
  - save metric rule (`won && week > 3 && diff <= 3`)
  - achievement evaluation path

### Draw handling check
- Draw game must keep:
  - `loserId = null` in stored `MatchResult`
  - growth and metrics computed without win bonus
  - no invalid `W/L` decision for protagonist line

---

## Regression Smoke (Recommended)
- Run at least 5 auto games and 5 interactive games.
- Verify no runtime errors and no unresolved `game` pending action remains.
- Verify saved state reloads without mismatch in schedule and player stats.

---

## IPC Path Smoke (Phase 5/6 이후 필수)

Phase 5/6에서 Rust DLL로 이전된 핵심 IPC 경로를 수동으로 점검합니다.

| 경로 | 검증 항목 |
|---|---|
| `growth:calcTraining` | 주차 훈련 후 능력치 XP 변화 |
| `growth:calcGame` | 경기 후 능력치/사기 변화 |
| `week:calcInjury` | 고피로 2주 이상 시 부상 이벤트 발생 |
| `week:calcExamResult` | 시험 주차 성적 처리 |
| `week:calcHsAdmissions` | W52 입시 합격 결과 |
| `npc:simGame` | NPC 경기 시뮬 결과 |
| `schedule:allLeagues` | 시즌 시작 시 전체 리그 일정 생성 |
| `postseason:buildKbl` | KBL 포스트시즌 브래킷 생성 |

---

## Notes
- Deterministic seed replay is not fully wired in core engine yet.
- Current parity target is post-processing equivalence for the same final outcome data.
- 성장 엔진, 부상 엔진, 입시 엔진 등 핵심 로직은 Rust DLL 내에 있으므로 TypeScript 단위 테스트 대신 IPC 경로 통합 검증을 우선합니다.
