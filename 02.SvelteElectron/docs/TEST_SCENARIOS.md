# TEST SCENARIOS

## Match Outcome Parity (Auto vs Interactive)

### Goal
- Auto simulation and interactive play must use the same post-game pipeline.
- For the same final game outcome stats, progression updates must match.

### Scope
- `apps/ui/src/pages/main/MainPage.svelte`
- `apps/ui/src/shared/usecases/applyGameOutcome.ts`
- `apps/ui/src/shared/utils/growthEngine.ts`

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

## Regression Smoke (Recommended)
- Run at least 5 auto games and 5 interactive games.
- Verify no runtime errors and no unresolved `game` pending action remains.
- Verify saved state reloads without mismatch in schedule and player stats.

## Notes
- Deterministic seed replay is not fully wired in core engine yet.
- Current parity target is post-processing equivalence for the same final outcome data.

