import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/loading_indicator.dart';

/// 홈 대시보드 — 1순위 3종(다음 경기·최근 등판·우리팀 순위)+2순위 2종
/// (훈련 현황·커리어 스냅샷, 대화 2026-07-21). 전부 이미 있던 엔진
/// API(`getTeamSchedule`·`getGameLog`·`getStandings`·`getTrainingConfig`·
/// `careerSummary`) 조합일 뿐, 새 엔진 작업은 없다. `currentDay`를 키로
/// 하는 `FutureProvider.family`라 "진행"을 눌러 날짜가 바뀔 때마다
/// 자연스럽게 다시 조회된다.
class HomeSummary {
  const HomeSummary({
    this.nextGame,
    this.nextGameOpponentId,
    this.nextGameIsHome,
    this.recentGameOpponentId,
    this.recentGameGrade,
    this.recentGameRunsAllowed,
    this.teamRank,
    this.leagueTeamCount,
    this.training,
    this.career,
    this.unreadInjuryWarning,
  });

  final ScheduleGameInfo? nextGame;
  final String? nextGameOpponentId;
  final bool? nextGameIsHome;

  final String? recentGameOpponentId;
  final String? recentGameGrade;
  final int? recentGameRunsAllowed;

  final int? teamRank;
  final int? leagueTeamCount;

  final TrainingConfigInfo? training;
  final CareerSummary? career;

  /// 부상 전조 경고(§6-64) — 메시지함(`inbox`)의 첫 실사용. 전용 메시지함
  /// 화면은 I7/I8 범위라 이번엔 최소한으로 홈에 배너 1개만 노출.
  final InboxMessageInfo? unreadInjuryWarning;
}

final homeSummaryProvider = FutureProvider.family<HomeSummary, int>((ref, currentDay) async {
  final team = await getCurrentTeamInfo();
  if (team == null) return const HomeSummary();

  ScheduleGameInfo? nextGame;
  String? nextGameOpponentId;
  bool? nextGameIsHome;
  try {
    final schedule = await getTeamSchedule(teamId: team.teamId);
    final upcoming = schedule.where((g) => g.day >= currentDay && g.resultJson == null).toList()..sort((a, b) => a.day.compareTo(b.day));
    if (upcoming.isNotEmpty) {
      nextGame = upcoming.first;
      nextGameIsHome = nextGame.home == team.teamId;
      nextGameOpponentId = nextGameIsHome ? nextGame.away : nextGame.home;
    }
  } catch (_) {
    // 홈 대시보드 보조 정보라 실패해도 카드가 "정보 없음"으로 조용히
    // 빠지면 충분 — 진행 자체를 막을 이유가 없음.
  }

  String? recentGameOpponentId;
  String? recentGameGrade;
  int? recentGameRunsAllowed;
  try {
    final logs = await getGameLog();
    if (logs.isNotEmpty) {
      final detail = jsonDecode(logs.last.detailJson);
      if (detail is Map) {
        recentGameOpponentId = detail['opponent']?.toString();
        recentGameGrade = detail['grade']?.toString();
        recentGameRunsAllowed = (detail['runs_allowed'] as num?)?.toInt();
      }
    }
  } catch (_) {}

  int? teamRank;
  int? leagueTeamCount;
  try {
    final standings = await getStandings(leagueId: team.leagueId);
    leagueTeamCount = standings.length;
    for (final row in standings) {
      if (row.teamId == team.teamId) {
        teamRank = row.rank.toInt();
        break;
      }
    }
  } catch (_) {}

  TrainingConfigInfo? training;
  try {
    training = await getTrainingConfig();
  } catch (_) {}

  CareerSummary? career;
  try {
    career = await careerSummary();
  } catch (_) {}

  InboxMessageInfo? unreadInjuryWarning;
  try {
    final inbox = await getInbox();
    unreadInjuryWarning = inbox.where((m) => m.kind == 'injury_warning' && !m.read).firstOrNull;
  } catch (_) {}

  return HomeSummary(
    nextGame: nextGame,
    nextGameOpponentId: nextGameOpponentId,
    nextGameIsHome: nextGameIsHome,
    recentGameOpponentId: recentGameOpponentId,
    recentGameGrade: recentGameGrade,
    recentGameRunsAllowed: recentGameRunsAllowed,
    teamRank: teamRank,
    leagueTeamCount: leagueTeamCount,
    training: training,
    career: career,
    unreadInjuryWarning: unreadInjuryWarning,
  );
});

class HomeDashboardCards extends ConsumerWidget {
  const HomeDashboardCards({super.key, required this.currentDay});
  final int currentDay;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(homeSummaryProvider(currentDay));
    final names = ref.watch(teamNamesProvider).value ?? const {};

    return summaryAsync.when(
      data: (summary) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (summary.unreadInjuryWarning != null) ...[
            _InjuryWarningBanner(message: summary.unreadInjuryWarning!),
            const SizedBox(height: 12),
          ],
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _NextGameCard(summary: summary, names: names)),
                const SizedBox(width: 12),
                Expanded(child: _RecentGameCard(summary: summary, names: names)),
                const SizedBox(width: 12),
                Expanded(child: _StandingCard(summary: summary)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Expanded(child: _TrainingCard(summary: summary)),
                const SizedBox(width: 12),
                Expanded(child: _CareerCard(summary: summary)),
              ],
            ),
          ),
        ],
      ),
      loading: () => const SizedBox(height: 88, child: Center(child: LoadingIndicator())),
      error: (_, _) => const SizedBox.shrink(),
    );
  }
}

/// 부상 전조 경고 배너(§6-64) — 탭하면 메시지함(I7)으로 이동해 전체
/// 목록에서 확인·읽음 처리할 수 있다.
class _InjuryWarningBanner extends StatelessWidget {
  const _InjuryWarningBanner({required this.message});
  final InboxMessageInfo message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return InkWell(
      onTap: () => context.go('/game/inbox'),
      borderRadius: BorderRadius.circular(8),
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: scheme.errorContainer, borderRadius: BorderRadius.circular(8)),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Icon(Icons.warning_amber_rounded, color: scheme.onErrorContainer, size: 20),
            const SizedBox(width: 8),
            Expanded(child: Text(message.body, style: TextStyle(color: scheme.onErrorContainer))),
          ],
        ),
      ),
    );
  }
}

class _NextGameCard extends StatelessWidget {
  const _NextGameCard({required this.summary, required this.names});
  final HomeSummary summary;
  final Map<String, String> names;

  @override
  Widget build(BuildContext context) {
    final game = summary.nextGame;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('다음 경기', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          if (game == null)
            const Text('예정된 경기 없음', style: TextStyle(color: AppColors.textSecondary))
          else ...[
            Text('Day ${game.day} · ${summary.nextGameIsHome == true ? '홈' : '원정'}', style: const TextStyle(color: AppColors.textSecondary)),
            const SizedBox(height: 2),
            Text(names[summary.nextGameOpponentId] ?? summary.nextGameOpponentId ?? '?', style: const TextStyle(fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}

class _RecentGameCard extends StatelessWidget {
  const _RecentGameCard({required this.summary, required this.names});
  final HomeSummary summary;
  final Map<String, String> names;

  @override
  Widget build(BuildContext context) {
    final opponentId = summary.recentGameOpponentId;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('최근 등판', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          if (opponentId == null)
            const Text('등판 기록 없음', style: TextStyle(color: AppColors.textSecondary))
          else ...[
            Text('vs ${names[opponentId] ?? opponentId}', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text(
              '${summary.recentGameGrade ?? '?'}등급 · 실점 ${summary.recentGameRunsAllowed ?? '?'}',
              style: const TextStyle(color: AppColors.textSecondary),
            ),
          ],
        ],
      ),
    );
  }
}

class _StandingCard extends StatelessWidget {
  const _StandingCard({required this.summary});
  final HomeSummary summary;

  @override
  Widget build(BuildContext context) {
    final rank = summary.teamRank;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('우리팀 순위', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          if (rank == null)
            const Text('순위 정보 없음', style: TextStyle(color: AppColors.textSecondary))
          else
            Text('$rank위${summary.leagueTeamCount != null ? ' / ${summary.leagueTeamCount}팀' : ''}', style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _TrainingCard extends StatelessWidget {
  const _TrainingCard({required this.summary});
  final HomeSummary summary;

  @override
  Widget build(BuildContext context) {
    final training = summary.training;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('훈련 현황', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          if (training == null)
            const Text('훈련 미설정 — 내 정보에서 설정하세요', style: TextStyle(color: AppColors.textSecondary))
          else ...[
            Text('주력: ${training.primaryStat} · 강도 ${training.intensity}', style: const TextStyle(fontWeight: FontWeight.w600)),
            if (training.secondaryStats.isNotEmpty) ...[
              const SizedBox(height: 2),
              Text('보조: ${training.secondaryStats.join(', ')}', style: const TextStyle(color: AppColors.textSecondary)),
            ],
          ],
        ],
      ),
    );
  }
}

class _CareerCard extends StatelessWidget {
  const _CareerCard({required this.summary});
  final HomeSummary summary;

  @override
  Widget build(BuildContext context) {
    final career = summary.career;
    return AppPanel(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('커리어 스냅샷', style: TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 6),
          if (career == null || career.games == 0)
            const Text('등판 기록 없음', style: TextStyle(color: AppColors.textSecondary))
          else ...[
            Text('${career.games}경기 ${career.wins}승 ${career.losses}패', style: const TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 2),
            Text('ERA ${career.era.toStringAsFixed(2)} · 탈삼진 ${career.strikeouts}', style: const TextStyle(color: AppColors.textSecondary)),
          ],
        ],
      ),
    );
  }
}
