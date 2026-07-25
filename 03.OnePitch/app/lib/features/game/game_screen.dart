import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';
import 'injury_treatment_view.dart';
import 'career_choice_view.dart';
import 'contract_nego_view.dart';
import 'trade_decision_view.dart';
import 'retirement_view.dart';
import 'home_dashboard.dart';
import 'package:app/shared/error_banner.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/design/colors.dart';

/// 홈 화면 — "진행(Continue)"과 대시보드, `game`을 제외한 PendingAction
/// (`injuryTreatment`·`contractNego`·`tradeDecision`·`careerChoice`·
/// `draft`·`retirement`)의 전용 화면 전환만 담당한다. 실제 매치 비주얼
/// (`match_visuals.dart`의 다이아몬드·존그리드·스태미나 게이지)과 매치
/// 진행 UI는 전용 라우트 `/game/match`(`match_screen.dart`)로 분리됐고,
/// `game` PendingAction의 모드 선택(자동/수동/반자동)도 이 화면이 아니라
/// 메시지함(`InboxScreen`)에서 이뤄진다(대화 2026-07-25 재설계 — "경기
/// 화면은 새 페이지로, 진입은 메시지로"). "▶ 진행" 버튼은 하단 대신
/// AppBar 우측(이전엔 은퇴 아이콘 자리)에 있다 — 자발적 은퇴 트리거는
/// 이번에 같이 뺐음(대화 2026-07-21, "우선" 없앤다고 해서 다른 자리로의
/// 이전은 아직 안 함 — 강제 은퇴 PendingAction(`retirement_view.dart`)은
/// 그대로 남아 영향 없음).
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
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8),
              child: FilledButton.icon(
                icon: state.busy
                    ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                    : const Icon(Icons.play_arrow),
                label: const Text('진행'),
                onPressed: state.busy || state.pending.isNotEmpty ? null : controller.continueGame,
              ),
            ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _StatusBar(state: state),
            if (state.meta != null) ...[const SizedBox(height: 12), HomeDashboardCards(currentDay: state.meta!.currentDay.toInt())],
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
/// 가로로 나열. 피로도·사기는 뺐다(대화 2026-07-21) — 내 정보 탭의
/// `_LiveGauge` 3종(피로도·폼·사기)이 이미 결정 4(게이지 바) 그대로
/// 보여주고 있어 홈에서 중복시킬 필요가 없다고 판단, 그 자리는 실제
/// 게임 정보 카드(`HomeDashboardCards`)로 돌림. Day 숫자 대신 실제
/// 날짜(캘린더 시스템, `calendarDateForDay`)를 보여준다.
class _StatusBar extends StatelessWidget {
  const _StatusBar({required this.state});
  final GameState state;

  @override
  Widget build(BuildContext context) {
    final meta = state.meta;
    if (meta == null) return const SizedBox.shrink();
    final date = calendarDateForDay(day: meta.currentDay);

    return Row(
      children: [
        Expanded(child: KpiTile(label: '오늘', value: '${date.year}년 ${date.month}월 ${date.day}일', icon: Icons.calendar_today, iconColor: AppColors.accent)),
        const SizedBox(width: 8),
        Expanded(child: KpiTile(label: '시즌', value: '${meta.season}', icon: Icons.flag, iconColor: AppColors.gold)),
      ],
    );
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
    // 매치가 진행 중이면(예: 메시지함에서 모드를 고른 뒤 `/game/match`로
    // 넘어갔다가 바텀/사이드 내비로 홈에 돌아온 경우) 여기서 다시 그리지
    // 않고 복귀 버튼만 — 실제 매치 화면은 `MatchScreen`(`/game/match`)
    // 전용(대화 2026-07-25 재설계).
    if (state.matchStep != null) {
      return ('matchInProgress', const _MatchInProgressPrompt());
    }
    if (state.pending.isEmpty) {
      return ('idle', const Center(child: Text('다음 정지점까지 진행할 준비가 됐습니다.')));
    }
    final action = state.pending.first;
    final key = '${action.kind}:${action.id}';
    switch (action.kind) {
      case 'game':
        return (key, const _GameMessageHint());
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

/// 매치가 진행 중일 때 홈 화면(`/game`)이 보여주는 복귀 안내 — 실제
/// 매치 UI는 전용 라우트(`/game/match`)에만 있다.
class _MatchInProgressPrompt extends StatelessWidget {
  const _MatchInProgressPrompt();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('진행 중인 경기가 있습니다.', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          ElevatedButton.icon(
            icon: const Icon(Icons.sports_baseball),
            label: const Text('경기 화면으로 이동'),
            onPressed: () => context.push('/game/match'),
          ),
        ],
      ),
    );
  }
}

/// `'game'` PendingAction 진입점(대화 2026-07-25 재설계) — 예전엔 여기서
/// 바로 모드(자동/수동/반자동)를 고르고 매치 화면까지 인라인으로
/// 이어졌지만, 이제 진입 자체를 메시지함(`InboxScreen`)으로 옮겼다 —
/// "경기화면 진입도 메시지로 와서 고르는" 요청 반영. 이 카드는 "진행"
/// 버튼이 계속 막혀있는 이유를 알려주고 메시지함으로 안내만 한다.
class _GameMessageHint extends StatelessWidget {
  const _GameMessageHint();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.mail_outline, size: 40, color: AppColors.accent),
          const SizedBox(height: 12),
          const Text('다음 경기가 준비됐습니다.', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 4),
          const Text('메시지함에서 모드를 선택하세요.', style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 16),
          ElevatedButton.icon(
            icon: const Icon(Icons.mail_outline),
            label: const Text('메시지함 열기'),
            onPressed: () => context.go('/game/inbox'),
          ),
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
