import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';

enum _CalendarMode { monthly, weekly }

enum _Outcome { win, loss, draw, upcoming }

const _weekdayLabels = ['일', '월', '화', '수', '목', '금', '토'];

/// 리그 화면 "일정" 탭(대화 2026-07-25) — 예전엔 "Day N — vs 상대"를
/// 그냥 세로로 나열했는데, 며칠 간격으로 경기가 있는지·쉬는 날이 언제인지
/// 한눈에 안 들어온다는 지적으로 주간/월간 캘린더 그리드로 교체.
/// `getTeamSchedule`은 이번 시즌 것만 돌려주므로(시즌 경계마다 `schedule`
/// 테이블이 통째로 갈아끼워짐) 연도 경계를 넘나드는 다중 시즌 데이터가
/// 섞일 걱정은 없다. 요일은 별도 엔진 API 없이 `DateTime.weekday`로
/// 클라이언트에서 계산(이 게임의 캘린더 에폭이 실제 그레고리력에 그대로
/// 매핑돼 있어 안전).
class ScheduleCalendarTab extends StatefulWidget {
  const ScheduleCalendarTab({super.key, required this.teamId});
  final String teamId;

  @override
  State<ScheduleCalendarTab> createState() => _ScheduleCalendarTabState();
}

class _ScheduleCalendarTabState extends State<ScheduleCalendarTab> {
  List<ScheduleGameInfo>? _games;
  Map<DateTime, ScheduleGameInfo> _byDate = {};
  DateTime? _today;
  DateTime? _nextGameDate;
  _CalendarMode _mode = _CalendarMode.monthly;
  DateTime? _focusedMonth; // 월간 뷰가 보여주는 달의 1일
  DateTime? _focusedWeekStart; // 주간 뷰가 보여주는 주의 일요일

  @override
  void didUpdateWidget(covariant ScheduleCalendarTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.teamId != widget.teamId) _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  DateTime _dateOnly(DateTime d) => DateTime(d.year, d.month, d.day);

  DateTime _weekStartFor(DateTime d) => _dateOnly(d).subtract(Duration(days: d.weekday % 7));

  Future<void> _load() async {
    setState(() => _games = null);
    final games = await getTeamSchedule(teamId: widget.teamId);
    final meta = await getMetaStatus();

    final byDate = <DateTime, ScheduleGameInfo>{};
    for (final g in games) {
      final cal = calendarDateForDay(day: g.day);
      byDate[DateTime(cal.year.toInt(), cal.month.toInt(), cal.day.toInt())] = g;
    }

    final todayCal = calendarDateForDay(day: meta.currentDay);
    final today = DateTime(todayCal.year.toInt(), todayCal.month.toInt(), todayCal.day.toInt());

    final nextGameDate = byDate.keys.where((d) => !d.isBefore(today) && byDate[d]!.resultJson == null).fold<DateTime?>(
          null,
          (min, d) => min == null || d.isBefore(min) ? d : min,
        );

    if (!mounted) return;
    setState(() {
      _games = games;
      _byDate = byDate;
      _today = today;
      _nextGameDate = nextGameDate;
      _focusedMonth = DateTime(today.year, today.month);
      _focusedWeekStart = _weekStartFor(today);
    });
  }

  _Outcome _outcomeFor(ScheduleGameInfo g) {
    if (g.resultJson == null) return _Outcome.upcoming;
    try {
      final v = jsonDecode(g.resultJson!);
      final homeRuns = v['home'] as int;
      final awayRuns = v['away'] as int;
      final isHome = g.home == widget.teamId;
      final myRuns = isHome ? homeRuns : awayRuns;
      final oppRuns = isHome ? awayRuns : homeRuns;
      if (myRuns > oppRuns) return _Outcome.win;
      if (myRuns < oppRuns) return _Outcome.loss;
      return _Outcome.draw;
    } catch (_) {
      return _Outcome.upcoming;
    }
  }

  Color _outcomeColor(_Outcome o) => switch (o) {
        _Outcome.win => AppColors.safe,
        _Outcome.loss => AppColors.danger,
        _Outcome.draw => AppColors.warn,
        _Outcome.upcoming => AppColors.textSecondary,
      };

  String _outcomeLabel(_Outcome o) => switch (o) {
        _Outcome.win => '승',
        _Outcome.loss => '패',
        _Outcome.draw => '무',
        _Outcome.upcoming => '예정',
      };

  void _openDay(DateTime date, ScheduleGameInfo g, Map<String, String> names) {
    final isHome = g.home == widget.teamId;
    final opponentId = isHome ? g.away : g.home;
    final opponent = names[opponentId] ?? opponentId;
    final outcome = _outcomeFor(g);
    String scoreText = '예정';
    if (g.resultJson != null) {
      try {
        final v = jsonDecode(g.resultJson!);
        scoreText = '홈 ${v['home']} : 원정 ${v['away']}';
      } catch (_) {
        scoreText = '결과 있음';
      }
    }
    showDialog<void>(
      context: context,
      builder: (_) => AlertDialog(
        backgroundColor: AppColors.scaffoldBg,
        title: Text('${date.year}년 ${date.month}월 ${date.day}일'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('상대: $opponent (${isHome ? '홈' : '원정'})', style: const TextStyle(color: AppColors.textPrimary)),
            const SizedBox(height: 6),
            Text(scoreText, style: TextStyle(color: _outcomeColor(outcome))),
          ],
        ),
        actions: [TextButton(onPressed: () => Navigator.pop(context), child: const Text('닫기'))],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final games = _games;
    final today = _today;
    if (games == null || today == null) return const LoadingIndicator();
    if (games.isEmpty) return const Center(child: Text('일정이 없습니다.'));

    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        return Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
              child: Row(
                children: [
                  SegmentedButton<_CalendarMode>(
                    segments: const [
                      ButtonSegment(value: _CalendarMode.monthly, label: Text('월간')),
                      ButtonSegment(value: _CalendarMode.weekly, label: Text('주간')),
                    ],
                    selected: {_mode},
                    onSelectionChanged: (s) => setState(() => _mode = s.first),
                  ),
                  const Spacer(),
                  TextButton(
                    onPressed: () => setState(() {
                      _focusedMonth = DateTime(today.year, today.month);
                      _focusedWeekStart = _weekStartFor(today);
                    }),
                    child: const Text('오늘'),
                  ),
                ],
              ),
            ),
            Expanded(
              child: _mode == _CalendarMode.monthly ? _buildMonth(names) : _buildWeek(names),
            ),
          ],
        );
      },
    );
  }

  Widget _buildMonth(Map<String, String> names) {
    final month = _focusedMonth!;
    final firstOfMonth = DateTime(month.year, month.month, 1);
    final daysInMonth = DateTime(month.year, month.month + 1, 0).day;
    final leadingBlanks = firstOfMonth.weekday % 7; // 일요일 시작
    final totalCells = ((leadingBlanks + daysInMonth) / 7).ceil() * 7;

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: () => setState(() => _focusedMonth = DateTime(month.year, month.month - 1)),
              ),
              SizedBox(
                width: 140,
                child: Text('${month.year}년 ${month.month}월', textAlign: TextAlign.center, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: () => setState(() => _focusedMonth = DateTime(month.year, month.month + 1)),
              ),
            ],
          ),
        ),
        Row(
          children: [
            for (final label in _weekdayLabels) Expanded(child: Center(child: Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)))),
          ],
        ),
        Expanded(
          child: GridView.builder(
            padding: const EdgeInsets.all(6),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(crossAxisCount: 7, childAspectRatio: 0.9),
            itemCount: totalCells,
            itemBuilder: (context, i) {
              final dayNum = i - leadingBlanks + 1;
              if (dayNum < 1 || dayNum > daysInMonth) return const SizedBox.shrink();
              final date = DateTime(month.year, month.month, dayNum);
              final game = _byDate[date];
              final isToday = date == _today;
              final isNext = date == _nextGameDate;
              return _DayCell(
                key: ValueKey('day-${date.year}-${date.month}-${date.day}'),
                dayNum: dayNum,
                game: game,
                isToday: isToday,
                isNext: isNext,
                compact: true,
                opponentLabel: game == null
                    ? null
                    : (names[game.home == widget.teamId ? game.away : game.home] ?? (game.home == widget.teamId ? game.away : game.home)),
                outcomeColor: game == null ? null : _outcomeColor(_outcomeFor(game)),
                onTap: game == null ? null : () => _openDay(date, game, names),
              );
            },
          ),
        ),
      ],
    );
  }

  Widget _buildWeek(Map<String, String> names) {
    final weekStart = _focusedWeekStart!;
    final weekEnd = weekStart.add(const Duration(days: 6));
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              IconButton(
                icon: const Icon(Icons.chevron_left),
                onPressed: () => setState(() => _focusedWeekStart = weekStart.subtract(const Duration(days: 7))),
              ),
              Text(
                '${weekStart.month}/${weekStart.day} ~ ${weekEnd.month}/${weekEnd.day}',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
              IconButton(
                icon: const Icon(Icons.chevron_right),
                onPressed: () => setState(() => _focusedWeekStart = weekStart.add(const Duration(days: 7))),
              ),
            ],
          ),
        ),
        Expanded(
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 12),
            itemCount: 7,
            separatorBuilder: (_, _) => const SizedBox(height: 8),
            itemBuilder: (context, i) {
              final date = weekStart.add(Duration(days: i));
              final game = _byDate[date];
              final isToday = date == _today;
              final isNext = date == _nextGameDate;
              final opponentId = game == null ? null : (game.home == widget.teamId ? game.away : game.home);
              return _WeekRow(
                date: date,
                weekdayLabel: _weekdayLabels[date.weekday % 7],
                game: game,
                isToday: isToday,
                isNext: isNext,
                opponentLabel: opponentId == null ? null : (names[opponentId] ?? opponentId),
                isHome: game?.home == widget.teamId,
                outcome: game == null ? null : _outcomeFor(game),
                outcomeColor: game == null ? null : _outcomeColor(_outcomeFor(game)),
                outcomeLabel: game == null ? null : _outcomeLabel(_outcomeFor(game)),
                onTap: game == null ? null : () => _openDay(date, game, names),
              );
            },
          ),
        ),
      ],
    );
  }
}

class _DayCell extends StatelessWidget {
  const _DayCell({
    super.key,
    required this.dayNum,
    required this.game,
    required this.isToday,
    required this.isNext,
    required this.compact,
    required this.opponentLabel,
    required this.outcomeColor,
    required this.onTap,
  });

  final int dayNum;
  final ScheduleGameInfo? game;
  final bool isToday;
  final bool isNext;
  final bool compact;
  final String? opponentLabel;
  final Color? outcomeColor;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.all(2),
        padding: const EdgeInsets.all(4),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: isToday ? AppColors.accentStrong : (isNext ? AppColors.gold : AppColors.border), width: isToday || isNext ? 2 : 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('$dayNum', style: TextStyle(color: isToday ? AppColors.accentStrong : AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
            if (opponentLabel != null) ...[
              const SizedBox(height: 2),
              Expanded(
                child: Text(
                  opponentLabel!,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(color: outcomeColor, fontSize: 10, fontWeight: FontWeight.w600),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _WeekRow extends StatelessWidget {
  const _WeekRow({
    required this.date,
    required this.weekdayLabel,
    required this.game,
    required this.isToday,
    required this.isNext,
    required this.opponentLabel,
    required this.isHome,
    required this.outcome,
    required this.outcomeColor,
    required this.outcomeLabel,
    required this.onTap,
  });

  final DateTime date;
  final String weekdayLabel;
  final ScheduleGameInfo? game;
  final bool isToday;
  final bool isNext;
  final String? opponentLabel;
  final bool? isHome;
  final _Outcome? outcome;
  final Color? outcomeColor;
  final String? outcomeLabel;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      color: isToday ? AppColors.surfaceHigh : AppColors.surface,
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      child: InkWell(
        onTap: onTap,
        child: Row(
          children: [
            SizedBox(
              width: 56,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('${date.month}/${date.day}', style: TextStyle(color: isToday ? AppColors.accentStrong : AppColors.textPrimary, fontWeight: FontWeight.w700)),
                  Text(weekdayLabel, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                ],
              ),
            ),
            Expanded(
              child: opponentLabel == null
                  ? const Text('경기 없음', style: TextStyle(color: AppColors.textSecondary))
                  : Text('vs $opponentLabel (${isHome == true ? '홈' : '원정'})', style: const TextStyle(color: AppColors.textPrimary)),
            ),
            if (outcomeLabel != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(color: outcomeColor!.withValues(alpha: 0.15), border: Border.all(color: outcomeColor!), borderRadius: BorderRadius.circular(4)),
                child: Text(outcomeLabel!, style: TextStyle(color: outcomeColor, fontSize: 11, fontWeight: FontWeight.w700)),
              ),
            if (isNext) const Padding(padding: EdgeInsets.only(left: 6), child: Text('다음 경기', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 11))),
          ],
        ),
      ),
    );
  }
}
