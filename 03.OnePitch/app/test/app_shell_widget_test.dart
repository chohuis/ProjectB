import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:app/shared/app_shell.dart';

/// [00_개요](../../../04_UI기획/00_개요.md) §5 "반응형 원칙" — 데스크톱은
/// 사이드 내비(`NavigationRail`), 모바일은 바텀 내비(`NavigationBar`).
/// 실제 허브 화면 대신 더미 텍스트 화면으로 셸의 반응형 전환·목적지
/// 이동 로직만 순수하게 검증(엔진 세션 불필요).
void main() {
  Widget buildApp() {
    final router = GoRouter(
      initialLocation: '/game',
      routes: [
        ShellRoute(
          builder: (context, state, child) => AppShell(child: child),
          routes: [
            GoRoute(path: '/game', builder: (context, state) => const Text('진행 화면')),
            GoRoute(path: '/game/my-player', builder: (context, state) => const Text('내 선수 화면')),
          ],
        ),
      ],
    );
    return MaterialApp.router(routerConfig: router);
  }

  testWidgets('shows a NavigationRail on wide screens and switches destinations', (tester) async {
    tester.view.physicalSize = const Size(1200, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.byType(NavigationRail), findsOneWidget);
    expect(find.byType(NavigationBar), findsNothing);
    expect(find.text('진행 화면'), findsOneWidget);
    expect(tester.widget<NavigationRail>(find.byType(NavigationRail)).selectedIndex, 0);

    await tester.tap(find.text('내 정보'));
    await tester.pumpAndSettle();

    expect(find.text('내 선수 화면'), findsOneWidget);
    expect(
      tester.widget<NavigationRail>(find.byType(NavigationRail)).selectedIndex,
      1,
      reason: "'/game'이 다른 모든 목적지의 URL 접두어라 prefix 매칭만 쓰면 선택 표시가 항상 홈에 고정되는 버그가 있었음(대화 2026-07-21)",
    );
  });

  testWidgets('shows a bottom NavigationBar on narrow screens', (tester) async {
    tester.view.physicalSize = const Size(400, 800);
    tester.view.devicePixelRatio = 1.0;
    addTearDown(tester.view.resetPhysicalSize);
    addTearDown(tester.view.resetDevicePixelRatio);

    await tester.pumpWidget(buildApp());
    await tester.pumpAndSettle();

    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    expect(find.text('진행 화면'), findsOneWidget);
  });
}
