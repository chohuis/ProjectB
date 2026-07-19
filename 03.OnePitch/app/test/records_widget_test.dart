import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/records/records_screen.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('records screen renders all 7 tabs', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await container
          .read(gameControllerProvider.notifier)
          .startNewGame(
            contentDbPath: '../engine/content.db',
            canonicalSeed: 2222,
            name: '기록화면테스트',
            handedness: '우완',
            schoolTeamId: teams.first.teamId,
            archetype: '체력형',
          );
    });

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: const MaterialApp(home: RecordsScreen()),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 500));
      await tester.pump();
    });
    await tester.pump();

    expect(find.text('경기 로그'), findsOneWidget);
    expect(find.text('계약·이력'), findsOneWidget);
    expect(find.text('부상·재활'), findsOneWidget);
    expect(find.text('관계'), findsOneWidget);
    expect(find.text('수상·기록'), findsOneWidget);
    expect(find.text('커리어'), findsOneWidget);
    expect(find.text('업적'), findsOneWidget);
    expect(find.text('아직 등판 기록이 없습니다.'), findsOneWidget);
  });
}
