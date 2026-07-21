import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/my_player/my_player_screen.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('my player screen renders the 4 tabs and status content for a live game', (tester) async {
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
    expect(find.text('커리어'), findsOneWidget);
    expect(find.text('재정'), findsOneWidget);
    expect(find.text('능력치'), findsOneWidget);
    expect(find.text('구속'), findsOneWidget, reason: '3열 표에 라벨로 뜸 — 레이더 차트 쪽 라벨은 Canvas에 직접 그려서 위젯 트리엔 안 잡힘');
    expect(find.text('보유 구종'), findsOneWidget);

    // 커리어 탭 — 뉴게임 직후라 "입학" 한 건만 있어야 함(create_protagonist
    // 가 남긴 enrollment 이벤트, §6-52). `pumpAndSettle` 대신 이 파일
    // 위쪽과 같은 패턴(진짜 이벤트 루프로 델레이 후 일반 `pump`) — 이
    // 탭은 `teamNamesProvider`(frb 비동기 호출)를 처음 구독해서
    // `pumpAndSettle`이 그 native 호출을 기다리다 타임아웃남.
    await tester.tap(find.text('커리어'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 400)); // TabBarView 전환 애니메이션(기본 300ms) 완료까지
    await tester.runAsync(() => Future.delayed(const Duration(milliseconds: 500)));
    await tester.pump();
    expect(find.textContaining('입학'), findsOneWidget);
  });
}
