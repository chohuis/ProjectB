import 'package:app/src/rust/api/game.dart';

/// I7 1차분의 최소 게임 상태 — Rust 엔진 결과의 얇은 캐시일 뿐, 계산·판정은
/// 전부 엔진이 끝낸 값([03_구조](../../../../03_설계/03_구조.md) §3 "UI에
/// 로직 0"). `matchStep`이 `AwaitingPitch`면 매치 세션이 진행 중이라는 뜻.
class GameState {
  final bool hasActiveGame;
  final bool busy;
  final String? error;
  final ProtagonistStatusInfo? status;
  final MetaStatusInfo? meta;
  final List<PendingActionInfo> pending;
  final MatchStepInfo? matchStep;
  final List<int> lastGameResult; // [homeRuns, awayRuns], 결과 요약 화면용

  const GameState({
    this.hasActiveGame = false,
    this.busy = false,
    this.error,
    this.status,
    this.meta,
    this.pending = const [],
    this.matchStep,
    this.lastGameResult = const [],
  });

  GameState copyWith({
    bool? hasActiveGame,
    bool? busy,
    String? error,
    bool clearError = false,
    ProtagonistStatusInfo? status,
    MetaStatusInfo? meta,
    List<PendingActionInfo>? pending,
    MatchStepInfo? matchStep,
    bool clearMatchStep = false,
    List<int>? lastGameResult,
  }) {
    return GameState(
      hasActiveGame: hasActiveGame ?? this.hasActiveGame,
      busy: busy ?? this.busy,
      error: clearError ? null : (error ?? this.error),
      status: status ?? this.status,
      meta: meta ?? this.meta,
      pending: pending ?? this.pending,
      matchStep: clearMatchStep ? null : (matchStep ?? this.matchStep),
      lastGameResult: lastGameResult ?? this.lastGameResult,
    );
  }
}
