import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';
import 'match_visuals.dart';
import 'match_boxscore.dart';
import 'match_stadium.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/features/new_game/hs_school_region_map.dart';

/// 경기 전용 풀스크린 화면(대화 2026-07-25 재설계) — 예전엔 `GameScreen`
/// 의 일부(`_MainArea`)가 매치 상태에 따라 인라인으로 바뀌던 것을 별도
/// 라우트(`/game/match`, ShellRoute 밖이라 사이드/바텀 내비 없음)로
/// 분리했다. 진입은 더 이상 홈 화면 버튼이 아니라 메시지함(`InboxScreen`
/// 의 `'game'` PendingAction 행)에서 모드(자동/수동/반자동)를 고른 뒤
/// `matchStep`이 채워지면 여기로 push된다 — `02.SvelteElectron`의
/// `{#if activeMatchContext} <MatchPage/>` 풀스크린 전환 패턴 참고.
class MatchScreen extends ConsumerStatefulWidget {
  const MatchScreen({super.key});

  @override
  ConsumerState<MatchScreen> createState() => _MatchScreenState();
}

class _MatchScreenState extends ConsumerState<MatchScreen> {
  final List<String> _log = [];

  /// 상황 로그 한 줄 누적(`match_visuals.dart`의 `MatchLogPanel` 문서
  /// 참고) — 엔진이 자동 시뮬 구간의 개별 결과를 노출하지 않아 진짜
  /// 매 구 단위 중계는 불가능하므로, 이 화면이 실제로 받은 두 스냅샷을
  /// 비교해 관찰 가능한 변화(득점·이닝 전환·아웃 증가)만 기록한다.
  int? _inningOf(MatchStepInfo? step) {
    if (step is MatchStepInfo_AwaitingPitch) return step.inning;
    if (step is MatchStepInfo_PitcherChangeDecision) return step.inning;
    return null;
  }

  bool? _topOfInningOf(MatchStepInfo? step) {
    if (step is MatchStepInfo_AwaitingPitch) return step.topOfInning;
    if (step is MatchStepInfo_PitcherChangeDecision) return step.topOfInning;
    return null;
  }

  void _appendTransition(MatchStepInfo? prev, MatchStepInfo? next) {
    if (next == null) return;
    String? line;

    if (next is MatchStepInfo_AwaitingPitch) {
      if (prev == null) {
        line = '경기 시작 — ${next.inning}회 ${next.topOfInning ? '초' : '말'}';
      } else if (prev is MatchStepInfo_AwaitingPitch && (prev.homeRuns != next.homeRuns || prev.awayRuns != next.awayRuns)) {
        line = '득점! 원정 ${next.awayRuns} : 홈 ${next.homeRuns}';
      } else if (_inningOf(prev) != next.inning || _topOfInningOf(prev) != next.topOfInning) {
        line = '${next.inning}회 ${next.topOfInning ? '초' : '말'} 시작';
      } else if (prev is MatchStepInfo_AwaitingPitch && next.outs > prev.outs) {
        line = '${next.outs}아웃';
      }
    } else if (next is MatchStepInfo_PitcherChangeDecision) {
      line = '투수 교체 판단 — ${next.inning}회 ${next.topOfInning ? '초' : '말'}';
    } else if (next is MatchStepInfo_GameOver) {
      line = '경기 종료 — 원정 ${next.awayRuns} : 홈 ${next.homeRuns}';
    }

    if (line != null) {
      _log.insert(0, line);
      if (_log.length > 20) _log.removeRange(20, _log.length);
    }
  }

  @override
  Widget build(BuildContext context) {
    ref.listen<GameState>(gameControllerProvider, (previous, next) {
      if (previous?.matchStep != next.matchStep) {
        setState(() => _appendTransition(previous?.matchStep, next.matchStep));
      }
    });

    final state = ref.watch(gameControllerProvider);
    final controller = ref.read(gameControllerProvider.notifier);
    final step = state.matchStep;
    final teamNames = ref.watch(teamNamesProvider).value ?? const <String, String>{};

    // `ref.listen`은 "이 위젯이 뜬 이후의 변화"만 잡는다 — 메시지함에서
    // 막 push돼 들어왔을 때 이미 matchStep이 채워져 있으면 그 첫 스텝은
    // listen이 못 잡으므로, 로그가 비어있는데 스텝이 있으면 한 번 수동
    // 반영(빌드 중 setState를 바로 부르면 안 되니 다음 프레임으로 미룸).
    if (_log.isEmpty && step != null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && _log.isEmpty) setState(() => _appendTransition(null, step));
      });
    }

    return Scaffold(
      appBar: AppBar(
        title: const Text('경기'),
        leading: IconButton(icon: const Icon(Icons.close), onPressed: () => context.go('/game')),
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: _body(state, controller, step, teamNames),
        ),
      ),
    );
  }

  Widget _body(GameState state, GameController controller, MatchStepInfo? step, Map<String, String> teamNames) {
    if (step is MatchStepInfo_AwaitingPitch) {
      return _MatchLayout(
        info: _MatchInfoColumn(awaiting: step, log: _log, teamNames: teamNames, protagonistName: state.status?.name ?? '나'),
        controls: _PitchControls(state: state, controller: controller, awaiting: step),
      );
    }
    if (step is MatchStepInfo_PitcherChangeDecision) {
      return _PitcherChangeDecisionView(state: state, controller: controller, decision: step);
    }
    if (step is MatchStepInfo_GameOver) {
      return _GameOverSummary(step: step, controller: controller);
    }
    return const _NoActiveMatch();
  }
}

/// 직접 `/game/match`로 딥링크되거나(테스트 등), 경기가 이미 끝난 뒤
/// 뒤로가기로 다시 들어온 경우의 방어적 빈 상태.
class _NoActiveMatch extends StatelessWidget {
  const _NoActiveMatch();

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Icon(Icons.sports_baseball, size: 40, color: AppColors.textSecondary),
          const SizedBox(height: 12),
          const Text('진행 중인 경기가 없습니다.', style: TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: () => context.go('/game'), child: const Text('홈으로')),
        ],
      ),
    );
  }
}

/// 좌(정보)/우(조작) 배치(대화 2026-07-25, 02.SvelteElectron 참고 후
/// 재설계) — 600px 이상은 `AppShell.wideBreakpoint`와 같은 기준으로 좌우
/// 2열, 그 밑은 세로로(정보 → 조작 순서, "읽기 → 하기" 흐름 유지).
class _MatchLayout extends StatelessWidget {
  const _MatchLayout({required this.info, required this.controls});
  final Widget info;
  final Widget controls;

  static const wideBreakpoint = 600.0;

  @override
  Widget build(BuildContext context) {
    final wide = MediaQuery.sizeOf(context).width >= wideBreakpoint;
    if (wide) {
      return Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(child: SingleChildScrollView(child: info)),
          const SizedBox(width: 16),
          Expanded(child: SingleChildScrollView(child: controls)),
        ],
      );
    }
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [info, const SizedBox(height: 16), controls],
      ),
    );
  }
}

const _sectionLabelStyle = TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600);

/// 좌측 정보 스택(대화 2026-07-25 재설계) — 박스스코어(1~N회 안타·볼넷·
/// 득점) → 구장(도트아트+주자 바둑알+우측상단 이닝/스코어/B-S-O 오버레이)
/// → 상황 로그 → 타자·투수 카드(좌우) 순서. `getMatchVenue()`로 홈/원정
/// 팀 id와 구장 id를 얻어야 박스스코어 라벨·구장 해시·주자 팀색을 전부
/// 채울 수 있어, 이 컬럼 전체를 하나의 `FutureBuilder`로 감싼다.
class _MatchInfoColumn extends StatelessWidget {
  const _MatchInfoColumn({required this.awaiting, required this.log, required this.teamNames, required this.protagonistName});
  final MatchStepInfo_AwaitingPitch awaiting;
  final List<String> log;
  final Map<String, String> teamNames;
  final String protagonistName;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<MatchVenueInfo?>(
      future: getMatchVenue(),
      builder: (context, venueSnapshot) {
        final venue = venueSnapshot.data;
        final homeLabel = venue == null ? '홈' : (teamNames[venue.homeTeamId] ?? venue.homeTeamId);
        final awayLabel = venue == null ? '원정' : (teamNames[venue.awayTeamId] ?? venue.awayTeamId);
        final battingTeamId = venue == null ? null : (awaiting.topOfInning ? venue.awayTeamId : venue.homeTeamId);
        final pitchingTeamId = venue == null ? null : (awaiting.topOfInning ? venue.homeTeamId : venue.awayTeamId);
        final runnerColor = battingTeamId == null ? AppColors.accent : hsSchoolColor(battingTeamId);
        final fielderColor = pitchingTeamId == null ? AppColors.textSecondary : hsSchoolColor(pitchingTeamId);

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('박스스코어', style: _sectionLabelStyle),
            const SizedBox(height: 6),
            FutureBuilder<String?>(
              future: getInningLog(),
              builder: (context, logSnapshot) {
                return BoxScoreTable(entries: parseInningLog(logSnapshot.data), homeLabel: homeLabel, awayLabel: awayLabel, currentInning: awaiting.inning);
              },
            ),
            const SizedBox(height: 16),
            const Text('경기장', style: _sectionLabelStyle),
            const SizedBox(height: 6),
            FutureBuilder<BatterProfileInfo>(
              key: ValueKey(awaiting.batterId),
              future: getBatterProfile(npcId: awaiting.batterId),
              builder: (context, batterSnapshot) {
                return StadiumFieldView(
                  stadiumId: venue?.stadiumId ?? 'default',
                  bases: awaiting.bases,
                  runnerColor: runnerColor,
                  fielderColor: fielderColor,
                  batterHandedness: batterSnapshot.data?.handedness ?? '우타',
                  inning: awaiting.inning,
                  topOfInning: awaiting.topOfInning,
                  outs: awaiting.outs,
                  balls: awaiting.balls,
                  strikes: awaiting.strikes,
                  homeRuns: awaiting.homeRuns,
                  awayRuns: awaiting.awayRuns,
                  lastFielderPosition: awaiting.lastFielderPosition,
                  lastPlayWasError: awaiting.lastPlayWasError,
                  lastPlayWasHit: awaiting.lastPlayWasHit,
                  lastPlayWasHomeRun: awaiting.lastPlayWasHomeRun,
                );
              },
            ),
            const SizedBox(height: 8),
            MatchLogPanel(lines: log),
            const SizedBox(height: 16),
            const Text('타자·투수 정보', style: _sectionLabelStyle),
            const SizedBox(height: 6),
            IntrinsicHeight(
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Expanded(child: _BatterInfoCard(npcId: awaiting.batterId, highLeverage: awaiting.highLeverage)),
                  const SizedBox(width: 8),
                  Expanded(child: _PitcherInfoCard(name: protagonistName, fatigue: awaiting.fatigue, pitchesThrown: awaiting.pitchesThrown)),
                ],
              ),
            ),
          ],
        );
      },
    );
  }
}

/// 상대 타자 정보 카드(대화 2026-07-25, 시즌/이번경기 기록 확장) —
/// 능력치(`getBatterProfile`) + 이번 경기 라인(`getBatterGameStats`) +
/// 시즌 전체 라인(`getPlayerSeasonBattingStats`)을 한 번에 조회.
/// `batterId`가 바뀔 때만 다시 조회되게 `ValueKey`로 위젯을 갈아끼운다.
class _BatterInfoCard extends StatelessWidget {
  const _BatterInfoCard({required this.npcId, required this.highLeverage});
  final String npcId;
  final bool highLeverage;

  Future<(BatterProfileInfo, PlayerBattingStats, PlayerBattingStats)> _load() async {
    final profile = await getBatterProfile(npcId: npcId);
    final gameLine = await getBatterGameStats(npcId: npcId);
    final seasonLine = await getPlayerSeasonBattingStats(npcId: npcId);
    return (profile, gameLine, seasonLine);
  }

  String _avgLine(String label, PlayerBattingStats s) {
    final avg = s.battingAverage.toStringAsFixed(3).replaceFirst('0.', '.');
    return '$label 타율 $avg · 안타 ${s.hits} · 볼넷 ${s.walks} · 삼진 ${s.strikeouts}';
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<(BatterProfileInfo, PlayerBattingStats, PlayerBattingStats)>(
      key: ValueKey(npcId),
      future: _load(),
      builder: (context, snapshot) {
        final data = snapshot.data;
        return AppPanel(
          color: AppColors.surfaceLow,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                '${data?.$1.name ?? '상대 타자'} 상대${highLeverage ? ' · 클러치 상황' : ''}',
                style: const TextStyle(fontWeight: FontWeight.bold),
              ),
              if (data != null) ...[
                const SizedBox(height: 6),
                Text(
                  '컨택 ${data.$1.contact.round()} · 파워 ${data.$1.power.round()} · 선구안 ${data.$1.eye.round()}',
                  style: const TextStyle(color: AppColors.textMuted, fontSize: 12),
                ),
                const SizedBox(height: 6),
                Text(_avgLine('이번 경기', data.$2), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                Text(_avgLine('시즌 전체', data.$3), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// 주인공(투수) 정보 카드(대화 2026-07-25) — 스태미나·투구수(기존
/// `PitcherStaminaGauge`)에 이번 시즌 성적(`getProtagonistSeasonSummary`)을
/// 더했다. 주인공은 항상 투수 아키타입이라(`CareerSummary` 문서 참고)
/// 타자 카드처럼 타율 대신 ERA·WHIP 계열 지표를 보여준다.
class _PitcherInfoCard extends StatelessWidget {
  const _PitcherInfoCard({required this.name, required this.fatigue, required this.pitchesThrown});
  final String name;
  final double fatigue;
  final int pitchesThrown;

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<CareerSummary>(
      future: getProtagonistSeasonSummary(),
      builder: (context, snapshot) {
        final season = snapshot.data;
        return AppPanel(
          color: AppColors.surfaceLow,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('$name (나)', style: const TextStyle(fontWeight: FontWeight.bold)),
              const SizedBox(height: 6),
              PitcherStaminaGauge(fatigue: fatigue, pitchesThrown: pitchesThrown),
              if (season != null) ...[
                const SizedBox(height: 6),
                Text(
                  '이번 시즌 ${season.wins}승 ${season.losses}패 · ERA ${season.era.toStringAsFixed(2)}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
                Text(
                  '탈삼진 ${season.strikeouts} · WHIP ${season.whip.toStringAsFixed(2)}',
                  style: const TextStyle(color: AppColors.textSecondary, fontSize: 11),
                ),
              ],
            ],
          ),
        );
      },
    );
  }
}

/// 우측 조작 영역 — 구종 / 구위(3단계) / 위치 잡기(볼 영역 포함 연속좌표
/// 조준) / 던지기 버튼 순서(대화 2026-07-25 "이렇게 되면 될 것 같다").
/// 위치를 탭해도 바로 제출되지 않고, 4가지(구종·구위·위치)를 다 고른 뒤
/// "던지기"를 눌러야 `resolveChoice`가 호출된다.
class _PitchControls extends StatefulWidget {
  const _PitchControls({required this.state, required this.controller, required this.awaiting});
  final GameState state;
  final GameController controller;
  final MatchStepInfo_AwaitingPitch awaiting;

  @override
  State<_PitchControls> createState() => _PitchControlsState();
}

class _PitchControlsState extends State<_PitchControls> {
  String? _selectedPitch;
  String _power = '보통';
  Offset? _target;

  /// `pitchesJson`은 마스터리 객체 배열(`{"name","stage","weeks"}`,
  /// 05_구종_시스템.md §2)이라 이름만 뽑아야 한다 — 전체 맵을 `.toString()`
  /// 하면 구종 칩에 raw JSON이 그대로 노출되는 버그(2026-07-25, 매치 화면
  /// 캡쳐 검증 중 발견 — 인라인이던 시절부터 있던 기존 버그).
  List<String> _pitches() {
    try {
      final raw = jsonDecode(widget.state.status!.pitchesJson) as List;
      final names = raw.map((e) => (e as Map)['name']?.toString()).whereType<String>().toList();
      return names.isEmpty ? ['포심 패스트볼'] : names;
    } catch (_) {
      return ['포심 패스트볼'];
    }
  }

  void _throw(PendingActionInfo pitchAction) {
    final target = _target;
    final pitch = _selectedPitch;
    if (target == null || pitch == null) return;
    final x = target.dx.toStringAsFixed(3);
    final y = target.dy.toStringAsFixed(3);
    widget.controller.respond(pitchAction.id, '$pitch:$x:$y:$_power');
    // 다음 구를 위해 위치만 초기화 — 구종·구위는 그대로 유지하는 게
    // 같은 구종을 연달아 던지는 흔한 흐름에 더 편하다.
    setState(() => _target = null);
  }

  @override
  Widget build(BuildContext context) {
    final pitchAction = widget.state.pending.where((p) => p.kind == 'pitch').firstOrNull;
    final enabled = pitchAction != null;
    final readyToThrow = enabled && _selectedPitch != null && _target != null;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      mainAxisSize: MainAxisSize.min,
      children: [
        const Text('구종', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          runSpacing: 8,
          children: _pitches()
              .map((p) => ChoiceChip(label: Text(p), selected: _selectedPitch == p, onSelected: enabled ? (_) => setState(() => _selectedPitch = p) : null))
              .toList(),
        ),
        const SizedBox(height: 16),
        const Text('구위', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 6),
        Wrap(
          spacing: 8,
          children: powerNames().map((p) => ChoiceChip(label: Text(p), selected: _power == p, onSelected: enabled ? (_) => setState(() => _power = p) : null)).toList(),
        ),
        const SizedBox(height: 16),
        const Text('위치 잡기', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        const Text('바깥 여백은 볼 영역 — 유인구도 노릴 수 있습니다.', style: TextStyle(color: AppColors.textSecondary, fontSize: 11)),
        const SizedBox(height: 6),
        Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 320, maxHeight: 320),
            child: PitchTargetCanvas(target: _target, enabled: enabled, onTargetChanged: (t) => setState(() => _target = t)),
          ),
        ),
        const SizedBox(height: 16),
        SizedBox(
          width: double.infinity,
          child: ElevatedButton(
            onPressed: readyToThrow ? () => _throw(pitchAction) : null,
            child: const Text('던지기'),
          ),
        ),
      ],
    );
  }
}

/// 감독 개입(§8) 수동 모드 — [07_매치_엔진](../../../../02_기획/육성코어/07_매치_엔진.md)
/// §8 "이닝 종료마다 판단 기회". `MatchScoreboard`는 재사용하지 않는다 —
/// 하프이닝 경계라 outs·bases가 항상 리셋 상태라 보여줄 게 없다.
class _PitcherChangeDecisionView extends StatelessWidget {
  const _PitcherChangeDecisionView({required this.state, required this.controller, required this.decision});
  final GameState state;
  final GameController controller;
  final MatchStepInfo_PitcherChangeDecision decision;

  @override
  Widget build(BuildContext context) {
    final action = state.pending.where((p) => p.kind == 'pitcherChange').firstOrNull;
    final inningLabel = '${decision.inning}회 ${decision.topOfInning ? '초' : '말'}';
    final opinion = decision.managerRecommendsPull ? '감독 의견: 교체 권장' : '감독 의견: 유지 권장';
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('투수 교체', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
        const SizedBox(height: 8),
        Text('$inningLabel · 홈 ${decision.homeRuns} : 원정 ${decision.awayRuns}'),
        const SizedBox(height: 4),
        Text('투구수 ${decision.pitchesThrown}구 · 피로도 ${decision.fatigue.toStringAsFixed(0)}'),
        const SizedBox(height: 4),
        Text(opinion, style: const TextStyle(color: AppColors.textSecondary)),
        const SizedBox(height: 16),
        Wrap(
          spacing: 8,
          children: ['유지', '교체', '감독에게 맡기기']
              .map((label) => ElevatedButton(onPressed: action == null ? null : () => controller.respond(action.id, label), child: Text(label)))
              .toList(),
        ),
      ],
    );
  }
}

class _GameOverSummary extends StatelessWidget {
  const _GameOverSummary({required this.step, required this.controller});
  final MatchStepInfo_GameOver step;
  final GameController controller;

  void _confirm(BuildContext context) {
    controller.dismissMatchResult();
    context.go('/game');
  }

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
          ElevatedButton(onPressed: () => _confirm(context), child: const Text('확인')),
        ],
      ),
    );
  }
}
