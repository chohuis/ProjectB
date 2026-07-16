import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/my_player/my_player_screen.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('my player screen renders the 3 tabs and status content for a live game', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    // frb 비동기 호출(실제 네이티브 스레드 경유)은 위젯 테스트의 가짜
    // 시계 안에서 안 풀릴 수 있어 `runAsync`로 진짜 이벤트 루프를 잠깐 빌린다.
    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await container
          .read(gameControllerProvider.notifier)
          .startNewGame(
            contentDbPath: '../engine/content.db',
            canonicalSeed: 777,
            name: '위젯테스트',
            handedness: '우완',
            schoolTeamId: teams.first.teamId,
            archetype: '체력형',
          );
    });

    await tester.pumpWidget(
      UncontrolledProviderScope(
        container: container,
        child: const MaterialApp(home: MyPlayerScreen()),
      ),
    );
    await tester.runAsync(() => Future.delayed(const Duration(milliseconds: 200)));
    await tester.pump();

    expect(find.text('상태'), findsOneWidget);
    expect(find.text('훈련'), findsOneWidget);
    expect(find.text('재정'), findsOneWidget);
    expect(find.text('피지컬'), findsOneWidget);
    expect(find.text('기술'), findsOneWidget);
    expect(find.text('멘탈'), findsOneWidget);
    expect(find.text('보유 구종'), findsOneWidget);
  });
}
