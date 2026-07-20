import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/game/retirement_view.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// [08_은퇴](../../../04_UI기획/08_은퇴.md) 화면이 실제 엔진 상태
/// (`careerSummary`/`careerTimeline`)를 정확히 읽어와 렌더링하는지 —
/// `careerSummary`는 활성 세션이 있어야 호출 가능해(엔진이 `with_state`
/// 로 전역 세션을 요구) 다른 전용화면 테스트들의 순수 합성 payload
/// 패턴을 못 쓰고, 실제 `newGame` + `declareRetirement()`로 만든 진짜
/// `retirement` PendingAction을 사용한다.
void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('RetirementView renders career totals and dismissing it navigates back to the root route', (tester) async {
    late ProviderContainer container;
    late PendingActionInfo action;

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await newGame(
        contentDbPath: '../engine/content.db',
        canonicalSeed: 555,
        name: '은퇴위젯테스트',
        handedness: '우완',
        schoolTeamId: teams.first.teamId,
        archetype: '강속구형',
      );
      await declareRetirement();
      final pending = await getPendingActions();
      action = pending.first;
      container = ProviderContainer();
    });

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: GoRouter(
              initialLocation: '/retirement',
              routes: [
                GoRoute(path: '/', builder: (context, state) => const Scaffold(body: Text('메인 메뉴'))),
                GoRoute(
                  path: '/retirement',
                  builder: (context, state) =>
                      Scaffold(body: RetirementView(action: action, controller: container.read(gameControllerProvider.notifier))),
                ),
              ],
            ),
          ),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 300));
      await tester.pump();
    });
    await tester.pump();

    expect(find.text('은퇴'), findsWidgets);
    expect(find.textContaining('경기'), findsWidgets);
    expect(find.text('확인 — 메인 메뉴로'), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('확인 — 메인 메뉴로'));
      await Future.delayed(const Duration(milliseconds: 200));
    });
    await tester.pumpAndSettle();

    expect(find.text('메인 메뉴'), findsOneWidget, reason: '은퇴 확인 후 메인 메뉴(root route)로 돌아가야 함');

    container.dispose();
  });
}
