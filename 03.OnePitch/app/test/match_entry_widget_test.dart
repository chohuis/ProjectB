import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:app/features/game/match_screen.dart';
import 'package:app/features/inbox/inbox_screen.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// `game_loop_test.dart`와 같은 패턴 — 'game'이 아닌 PendingAction은
/// 첫 선택지(없으면 '자동')로 넘기고 계속 진행.
Future<void> _resolveNonGamePendingAction(PendingActionInfo action) async {
  final payload = jsonDecode(action.payloadJson);
  final choices = payload is Map ? payload['choices'] as List<dynamic>? : null;
  final choiceId = (choices != null && choices.isNotEmpty) ? (choices.first as Map)['id'] as String : '자동';
  await resolveChoice(actionId: action.id, choiceId: choiceId);
}

/// 경기 화면 재설계(대화 2026-07-25) 왕복 검증 — 메시지함에서 'game'
/// PendingAction 행을 열어 "수동"을 고르면 다이얼로그가 스스로 닫히고
/// `/game/match`(별도 풀스크린 라우트)로 넘어가 실제 매치 UI가 뜨는지.
void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('choosing 수동 on a game message navigates to the full-screen match route', (tester) async {
    late ProviderContainer container;

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await newGame(
        contentDbPath: '../engine/content.db',
        canonicalSeed: 424242424,
        name: '매치진입테스트',
        handedness: '우완',
        schoolTeamId: teams.first.teamId,
        archetype: '강속구형',
      );

      // 'game' PendingAction이 뜰 때까지 진행(§`game_loop_test.dart`와
      // 동일 가드) — 로테이션 경쟁에서 밀린 날엔 다른 PendingAction이
      // 먼저 뜰 수 있어 그건 넘기고 계속.
      List<PendingActionInfo> pending = await advance();
      var guard = 0;
      while ((pending.isEmpty || pending.first.kind != 'game') && guard < 60) {
        if (pending.isNotEmpty) {
          await _resolveNonGamePendingAction(pending.first);
        }
        pending = await advance();
        guard++;
      }
      expect(pending, isNotEmpty, reason: 'advance() should eventually stop at a game PendingAction');
      expect(pending.first.kind, 'game');

      container = ProviderContainer();
    });
    addTearDown(container.dispose);

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: GoRouter(
              initialLocation: '/',
              routes: [
                GoRoute(path: '/', builder: (context, state) => const Scaffold(body: InboxScreen())),
                GoRoute(path: '/game/match', builder: (context, state) => const MatchScreen()),
                GoRoute(path: '/game', builder: (context, state) => const Scaffold(body: Text('홈 화면'))),
                GoRoute(path: '/game/inbox', builder: (context, state) => const Scaffold(body: InboxScreen())),
              ],
            ),
          ),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 400));
      await tester.pump();
    });

    // 메시지함에 '경기' 카테고리 행이 실제로 보이는지.
    expect(find.textContaining('경기 진행 방식을 선택하세요'), findsOneWidget);

    // 다이얼로그를 열면 그 안의 스카우팅 리포트(`_GameScoutingSection`)가
    // 진짜 native 비동기 호출(`getPregameScouting`)을 트리거한다 —
    // `pumpAndSettle`은 fake-async 존 안에서 그걸 못 풀어 타임아웃나므로
    // `runAsync`+수동 딜레이 패턴(이 레포의 다른 위젯 테스트와 동일 관례).
    await tester.runAsync(() async {
      await tester.tap(find.textContaining('경기 진행 방식을 선택하세요'));
      await Future.delayed(const Duration(milliseconds: 400));
    });
    await tester.pump();

    expect(find.text('수동 플레이'), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('수동 플레이'));
      await Future.delayed(const Duration(milliseconds: 400));
    });
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 300));

    // 다이얼로그가 스스로 닫히고 `/game/match`로 넘어가 실제 매치 UI가 떠야 함.
    expect(find.text('수동 플레이'), findsNothing, reason: '다이얼로그가 닫혔어야 함');
    expect(find.widgetWithText(AppBar, '경기'), findsOneWidget);
    expect(find.text('위치 잡기'), findsOneWidget, reason: '수동 모드는 AwaitingPitch로 바로 이어져 위치 조준 UI가 보여야 함');
  }, timeout: const Timeout(Duration(minutes: 2)));
}
