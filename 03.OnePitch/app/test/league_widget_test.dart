import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/league/league_screen.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('league screen renders the 4 tabs and defaults to the protagonist team', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await container
          .read(gameControllerProvider.notifier)
          .startNewGame(
            contentDbPath: '../engine/content.db',
            canonicalSeed: 999,
            name: '리그위젯테스트',
            handedness: '좌완',
            schoolTeamId: teams.first.teamId,
            archetype: '강속구형',
          );
    });

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: LeagueScreen()),
        ),
      );
      // LeagueScreen._init()도 frb 비동기 호출이라 위젯의 initState가 끝날
      // 실제 이벤트 루프 시간을 준다.
      await Future.delayed(const Duration(milliseconds: 500));
      await tester.pump();
    });
    await tester.pump();

    expect(find.text('로스터'), findsOneWidget);
    expect(find.text('일정'), findsOneWidget);
    expect(find.text('순위'), findsOneWidget);
    expect(find.text('라이벌'), findsOneWidget);
  });
}
