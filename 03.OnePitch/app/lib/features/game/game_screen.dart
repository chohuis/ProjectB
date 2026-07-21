import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';
import 'injury_treatment_view.dart';
import 'career_choice_view.dart';
import 'contract_nego_view.dart';
import 'trade_decision_view.dart';
import 'retirement_view.dart';
import 'match_visuals.dart';
import 'package:app/shared/error_banner.dart';
import 'package:app/shared/design/widgets.dart';

/// 진행(Continue) + 매치 + 결과요약을 한 화면에 압축한 I7 1차분 최소
/// 슬라이스. [05_매치](../../../../04_UI기획/05_매치.md)의 다이아몬드·
/// 존그리드 CustomPainter 비주얼은 I7 8차분에서 `match_visuals.dart`로
/// 추가됨 — 단, "자동" 모드는 엔진이 경기 전체를 한 번에 시뮬레이션해
/// 중간 스냅샷이 없어 상황판이 안 뜬다(수동 매 구·반자동 결정적
/// 순간에서만 실제로 보임, 10_구현_Phase_계획.md §6-31 참고). `game`·
/// `injuryTreatment`·`contractNego`·`tradeDecision`·`careerChoice`·
/// `draft`·`retirement` — PendingAction 8종 전부 전용 화면을 갖췄다.
/// "▶ 진행" 버튼은 하단 대신 AppBar 우측(이전엔 은퇴 아이콘 자리)으로
/// 옮겼다 — 자발적 은퇴 트리거는 이번에 같이 뺐음(대화 2026-07-21,
/// "우선" 없앤다고 해서 다른 자리로의 이전은 아직 안 함 — 강제 은퇴
/// PendingAction(`retirement_view.dart`)은 그대로 남아 영향 없음).
class GameScreen extends ConsumerWidget {
  const GameScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(gameControllerProvider);
    final controller = ref.read(gameControllerProvider.notifier);

    if (!state.hasActiveGame) {
      return const Scaffold(body: Center(child: Text('활성 게임이 없습니다 — 뉴게임부터 시작하세요.')));
    }

    return Scaffold(
      appBar: AppBar(
        title: Text(state.status?.name ?? ''),
        actions: [
          if (state.matchStep == null)
            IconButton(
              icon: state.busy
                  ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Icon(Icons.play_arrow),
              tooltip: '진행',
              onPressed: state.busy || state.pending.isNotEmpty ? null : controller.continueGame,
            ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _StatusBar(state: state),
            const SizedBox(height: 16),
            if (state.error != null) ErrorBanner(message: '오류: ${state.error}'),
            Expanded(child: _MainArea(state: state, controller: controller)),
          ],
        ),
      ),
    );
  }
}

/// 프로토타입 `.kpi-row`(HomeDashboard.svelte) — 라벨+큰 숫자 타일을
/// 가로로 나열. Day·시즌·피로·사기를 항상 한눈에 보이게.
class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.state});
  final GameState state;

  @override
  Widget build(BuildContext context) {
    final meta = state.meta;
    final liveState = _liveState(state.status?.liveStateJson);
    final fatigue = liveState['피로도'];
    final morale = liveState['사기'];

    return Row(
      children: [
        if (meta != null) ...[
          Expanded(child: KpiTile(label: 'Day', value: '${meta.currentDay}')),
          const SizedBox(width: 8),
          Expanded(child: KpiTile(label: '시즌', value: '${meta.season}')),
          const SizedBox(width: 8),
        ],
        if (fatigue != null) ...[
          Expanded(child: KpiTile(label: '피로도', value: '$fatigue')),
          const SizedBox(width: 8),
        ],
        if (morale != null) Expanded(child: KpiTile(label: '사기', value: '$morale')),
      ],
    );
  }

  Map _liveState(String? json) {
    if (json == null) return const {};
    try {
      return jsonDecode(json) as Map;
    } catch (_) {
      return const {};
    }
  }
}

/// PendingAction·매치 단계가 바뀔 때마다 화면이 순간적으로 뚝 끊겨
/// 바뀌던 걸 완충 — 내용을 고를 때 같이 정한 `key`(상태 종류별로 다름)
/// 가 달라지면 `AnimatedSwitcher`가 짧은 크로스페이드로 넘어간다.
class _MainArea extends StatelessWidget {
  const _MainArea({required this.state, required this.controller});
  final GameState state;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final (key, child) = _content();
    return AnimatedSwitcher(
      duration: const Duration(milliseconds: 200),
      child: KeyedSubtree(key: ValueKey(key), child: child),
    );
  }

  (String, Widget) _content() {
    final step = state.matchStep;
    if (step is MatchStepInfo_AwaitingPitch) {
      return ('pitch', _PitchPicker(state: state, controller: controller, awaiting: step));
    }
    if (step is MatchStepInfo_GameOver) {
      return ('gameOver', _GameOverSummary(step: step, controller: controller));
    }
    if (state.pending.isEmpty) {
      return ('idle', const Center(child: Text('다음 정지점까지 진행할 준비가 됐습니다.')));
    }
    final action = state.pending.first;
    final key = '${action.kind}:${action.id}';
    switch (action.kind) {
      case 'game':
        return (key, _PregameModePicker(action: action, controller: controller));
      case 'injuryTreatment':
        return (key, InjuryTreatmentView(action: action, controller: controller));
      case 'careerChoice':
        return (key, CareerChoiceView(action: action, controller: controller));
      case 'draft':
        return (key, DraftResultView(action: action, controller: controller));
      case 'contractNego':
        return (key, ContractNegoView(action: action, controller: controller));
      case 'tradeDecision':
        return (key, TradeDecisionView(action: action, controller: controller));
      case 'retirement':
        return (key, RetirementView(action: action, controller: controller));
      default:
        return (key, _GenericPendingActionView(action: action, controller: controller));
    }
  }
}

class _PregameModePicker extends StatelessWidget {
  const _PregameModePicker({required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('주인공 등판 경기 — 모드를 선택하세요.', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: ['자동', '수동', '반자동']
              .map((mode) => ElevatedButton(onPressed: () => controller.respond(action.id, mode), child: Text(mode)))
              .toList(),
        ),
      ],
    );
  }
}

class _PitchPicker extends StatelessWidget {
  const _PitchPicker({required this.state, required this.controller, required this.awaiting});
  final GameState state;
  final GameController controller;
  final MatchStepInfo_AwaitingPitch awaiting;

  List<String> _pitches() {
    try {
      final raw = jsonDecode(state.status!.pitchesJson) as List;
      return raw.map((e) => e.toString()).toList();
    } catch (_) {
      return ['포심 패스트볼'];
    }
  }

  @override
  Widget build(BuildContext context) {
    final pitchAction = state.pending.where((p) => p.kind == 'pitch').firstOrNull;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        MatchScoreboard(
          inning: awaiting.inning,
          topOfInning: awaiting.topOfInning,
          outs: awaiting.outs,
          bases: awaiting.bases,
          homeRuns: awaiting.homeRuns,
          awayRuns: awaiting.awayRuns,
          balls: awaiting.balls,
          strikes: awaiting.strikes,
        ),
        const SizedBox(height: 8),
        Text(
          '${awaiting.batterId} 상대${awaiting.highLeverage ? ' · 클러치 상황' : ''}',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        const Text('구종'),
        Wrap(spacing: 8, children: _pitches().map((p) => ChoiceChip(label: Text(p), selected: false, onSelected: (_) {})).toList()),
        const SizedBox(height: 12),
        const Text('코스'),
        const SizedBox(height: 4),
        Expanded(
          child: Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 280, maxHeight: 280),
              child: StrikeZoneGrid(
                courses: courseNames(),
                enabled: pitchAction != null,
                onSelect: (course) => controller.respond(pitchAction!.id, '${_pitches().first}:$course'),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class _GameOverSummary extends StatelessWidget {
  const _GameOverSummary({required this.step, required this.controller});
  final MatchStepInfo_GameOver step;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('경기 종료', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
          const SizedBox(height: 8),
          Text('홈 ${step.homeRuns} : 원정 ${step.awayRuns}'),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: controller.dismissMatchResult, child: const Text('확인')),
        ],
      ),
    );
  }
}

class _GenericPendingActionView extends StatefulWidget {
  const _GenericPendingActionView({required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  State<_GenericPendingActionView> createState() => _GenericPendingActionViewState();
}

class _GenericPendingActionViewState extends State<_GenericPendingActionView> {
  final _choiceController = TextEditingController();

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('${widget.action.kind} — 전용 화면은 후속 서브분', style: const TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Text(widget.action.payloadJson),
        const SizedBox(height: 12),
        TextField(controller: _choiceController, decoration: const InputDecoration(labelText: 'choice_id (개발자용)')),
        const SizedBox(height: 8),
        ElevatedButton(
          onPressed: () => widget.controller.respond(widget.action.id, _choiceController.text.trim()),
          child: const Text('응답 전송'),
        ),
      ],
    );
  }
}
