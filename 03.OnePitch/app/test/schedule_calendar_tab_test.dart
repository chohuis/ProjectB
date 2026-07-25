import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/league/schedule_calendar_tab.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

Future<void> _resolveNonGamePendingAction(PendingActionInfo action) async {
  final payload = jsonDecode(action.payloadJson);
  final choices = payload is Map ? payload['choices'] as List<dynamic>? : null;
  final choiceId = (choices != null && choices.isNotEmpty) ? (choices.first as Map)['id'] as String : '자동';
  await resolveChoice(actionId: action.id, choiceId: choiceId);
}

void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('schedule calendar renders a monthly grid with real game results and supports navigation', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    late String teamId;
    late CalendarDateInfo today;
    late CalendarDateInfo firstGameDate;
    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      teamId = teams.first.teamId;
      await container.read(gameControllerProvider.notifier).startNewGame(
            contentDbPath: '../engine/content.db',
            canonicalSeed: 424242,
            name: '캘린더테스트',
            handedness: '우완',
            schoolTeamId: teamId,
            archetype: '강속구형',
          );

      // 며칠 진행시켜 실제 결과가 섞인 일정을 만든다.
      var pending = await advance();
      for (var i = 0; i < 30; i++) {
        final meta = await getMetaStatus();
        if (meta.currentDay >= 10) break;
        if (pending.isNotEmpty) {
          final action = pending.first;
          if (action.kind == 'game') {
            await resolveChoice(actionId: action.id, choiceId: '자동');
          } else {
            await _resolveNonGamePendingAction(action);
          }
        }
        pending = await advance();
      }
      final meta = await getMetaStatus();
      today = calendarDateForDay(day: meta.currentDay);

      final games = await getTeamSchedule(teamId: teamId);
      final firstGame = games.reduce((a, b) => a.day < b.day ? a : b);
      firstGameDate = calendarDateForDay(day: firstGame.day);
    });

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(home: Scaffold(body: ScheduleCalendarTab(teamId: teamId))),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 400));
      await tester.pump();
    });

    // 월간 헤더가 오늘이 속한 달을 정확히 보여주는지.
    expect(find.text('${today.year}년 ${today.month}월'), findsOneWidget);

    // 실제 첫 경기가 있는 날짜 칸이 렌더되는지(어떤 팀이든 시즌 첫 경기일은
    // 팀 소속 권역에 따라 달라지므로 하드코딩 대신 실제 일정에서 계산).
    final earlyDayFinder = find.byKey(ValueKey('day-${firstGameDate.year}-${firstGameDate.month}-${firstGameDate.day}'));
    expect(earlyDayFinder, findsOneWidget);

    // 날짜 칸을 탭하면 상세 다이얼로그가 뜨는지.
    await tester.tap(earlyDayFinder);
    await tester.pumpAndSettle();
    expect(find.textContaining('상대:'), findsOneWidget);
    await tester.tap(find.text('닫기'));
    await tester.pumpAndSettle();

    // 다음 달 화살표 → 헤더가 바뀌고, "오늘" 버튼으로 복귀.
    await tester.tap(find.byIcon(Icons.chevron_right));
    await tester.pump();
    expect(find.text('${today.year}년 ${today.month}월'), findsNothing);
    await tester.tap(find.text('오늘'));
    await tester.pump();
    expect(find.text('${today.year}년 ${today.month}월'), findsOneWidget);

    // 주간 토글 — 실제 상대 이름이 들어간 행이 최소 하나는 보여야 함.
    await tester.tap(find.text('주간'));
    await tester.pumpAndSettle();
    expect(find.textContaining('vs '), findsWidgets);
  }, timeout: const Timeout(Duration(minutes: 2)));
}
