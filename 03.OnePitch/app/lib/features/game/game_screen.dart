import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';
import 'injury_treatment_view.dart';

/// 진행(Continue) + 매치 + 결과요약을 한 화면에 압축한 I7 1차분 최소
/// 슬라이스 — [05_매치](../../../../04_UI기획/05_매치.md)의 다이아몬드·
/// 존그리드 비주얼(CustomPainter)은 후속 서브분("최소 루프가 실제로
/// 동작"이라는 완료 기준엔 텍스트/버튼으로도 충분). `game`·
/// `injuryTreatment`([InjuryTreatmentView] 참고, I7 5차분에서 전용화면
/// 추가)는 전용 화면이 있고, 나머지 4종(`contractNego`·`tradeDecision`·
/// `careerChoice`·`draft`)은 진로 갈림길이 엔진에 없어 실전에서 아직
/// 발동 자체가 안 돼(§6-19·§6-24에서 이미 확인) 원시 payload 조회
/// 폴백(개발자용)으로만 남겨둔다.
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
          IconButton(icon: const Icon(Icons.person), tooltip: '내 선수', onPressed: () => context.push('/game/my-player')),
          IconButton(icon: const Icon(Icons.emoji_events), tooltip: '리그', onPressed: () => context.push('/game/league')),
          IconButton(icon: const Icon(Icons.history_edu), tooltip: '기록', onPressed: () => context.push('/game/records')),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _StatusBar(state: state),
            const SizedBox(height: 16),
            if (state.error != null) Text('오류: ${state.error}', style: const TextStyle(color: Colors.red)),
            Expanded(child: _MainArea(state: state, controller: controller)),
            const SizedBox(height: 8),
            if (state.matchStep == null)
              ElevatedButton(
                onPressed: state.busy || state.pending.isNotEmpty ? null : controller.continueGame,
                child: state.busy ? const CircularProgressIndicator() : const Text('▶ 진행'),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.state});
  final GameState state;

  @override
  Widget build(BuildContext context) {
    final meta = state.meta;
    return Row(
      children: [
        if (meta != null) Text('Day ${meta.currentDay} · 시즌 ${meta.season}'),
        const Spacer(),
        if (state.status != null) Text(_liveStateSummary(state.status!.liveStateJson)),
      ],
    );
  }

  String _liveStateSummary(String json) {
    try {
      final v = jsonDecode(json) as Map;
      final fatigue = v['피로도'];
      final morale = v['사기'];
      return [if (fatigue != null) '피로 $fatigue', if (morale != null) '사기 $morale'].join(' · ');
    } catch (_) {
      return '';
    }
  }
}

class _MainArea extends StatelessWidget {
  const _MainArea({required this.state, required this.controller});
  final GameState state;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final step = state.matchStep;
    if (step is MatchStepInfo_AwaitingPitch) {
      return _PitchPicker(state: state, controller: controller, awaiting: step);
    }
    if (step is MatchStepInfo_GameOver) {
      return _GameOverSummary(step: step, controller: controller);
    }
    if (state.pending.isEmpty) {
      return const Center(child: Text('다음 정지점까지 진행할 준비가 됐습니다.'));
    }
    final action = state.pending.first;
    if (action.kind == 'game') {
      return _PregameModePicker(action: action, controller: controller);
    }
    if (action.kind == 'injuryTreatment') {
      return InjuryTreatmentView(action: action, controller: controller);
    }
    return _GenericPendingActionView(action: action, controller: controller);
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
        Text(
          '${awaiting.batterId} 상대 · B${awaiting.balls}-S${awaiting.strikes}'
          '${awaiting.highLeverage ? ' · 클러치 상황' : ''}',
          style: const TextStyle(fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 12),
        const Text('구종'),
        Wrap(spacing: 8, children: _pitches().map((p) => ChoiceChip(label: Text(p), selected: false, onSelected: (_) {})).toList()),
        const SizedBox(height: 12),
        const Text('코스 (3×3)'),
        Expanded(
          child: GridView.count(
            crossAxisCount: 3,
            children: courseNames()
                .map(
                  (course) => Padding(
                    padding: const EdgeInsets.all(2),
                    child: ElevatedButton(
                      onPressed: pitchAction == null
                          ? null
                          : () => controller.respond(pitchAction.id, '${_pitches().first}:$course'),
                      child: Text(course, style: const TextStyle(fontSize: 11)),
                    ),
                  ),
                )
                .toList(),
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
