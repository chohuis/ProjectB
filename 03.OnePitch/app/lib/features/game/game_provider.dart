import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
export 'game_state.dart';
import 'game_state.dart';

/// 뉴게임·진행·PendingAction 응답을 엔진에 위임하는 얇은 컨트롤러 — 여기
/// 자체엔 게임 판정 로직이 없다(전부 `api::game`을 거쳐 Rust가 계산).
class GameController extends Notifier<GameState> {
  @override
  GameState build() => const GameState();

  Future<void> startNewGame({
    required String contentDbPath,
    required int canonicalSeed,
    required String name,
    required String handedness,
    required String schoolTeamId,
    required String archetype,
  }) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      await newGame(
        contentDbPath: contentDbPath,
        canonicalSeed: canonicalSeed,
        name: name,
        handedness: handedness,
        schoolTeamId: schoolTeamId,
        archetype: archetype,
      );
      await _refresh();
      state = state.copyWith(hasActiveGame: true, busy: false);
    } catch (e) {
      state = state.copyWith(busy: false, error: '$e');
    }
  }

  Future<void> continueGame() async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final pending = await advance();
      await _refresh();
      state = state.copyWith(pending: pending, busy: false);
    } catch (e) {
      state = state.copyWith(busy: false, error: '$e');
    }
  }

  Future<void> respond(String actionId, String choiceId) async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      final step = await resolveChoice(actionId: actionId, choiceId: choiceId);
      final pending = await getPendingActions();
      await _refresh();
      if (step != null) {
        state = state.copyWith(pending: pending, matchStep: step, busy: false);
      } else {
        state = state.copyWith(pending: pending, busy: false, clearMatchStep: true);
      }
    } catch (e) {
      state = state.copyWith(busy: false, error: '$e');
    }
  }

  void dismissMatchResult() {
    state = state.copyWith(clearMatchStep: true);
  }

  /// 자발적 은퇴(08_은퇴.md §1) — 플레이어가 임의 시점에 직접 선언한다.
  /// 엔진이 `retirement` PendingAction을 만들어두므로, 여기선 그걸
  /// `pending`에 반영해 `RetirementView`로 라우팅되게만 한다.
  Future<void> retire() async {
    state = state.copyWith(busy: true, clearError: true);
    try {
      await declareRetirement();
      final pending = await getPendingActions();
      await _refresh();
      state = state.copyWith(pending: pending, busy: false);
    } catch (e) {
      state = state.copyWith(busy: false, error: '$e');
    }
  }

  Future<void> _refresh() async {
    final status = await getProtagonistStatus();
    final meta = await getMetaStatus();
    state = state.copyWith(status: status, meta: meta);
  }
}

final gameControllerProvider = NotifierProvider<GameController, GameState>(GameController.new);
