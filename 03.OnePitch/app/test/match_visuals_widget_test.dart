import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/match_visuals.dart';

/// [05_매치](../../../04_UI기획/05_매치.md) §2·§4 CustomPainter 비주얼
/// (`MatchScoreboard`·`StrikeZoneGrid`) — 순수 Flutter 위젯(엔진 세션
/// 불필요)이라 다른 전용화면 테스트와 달리 `RustLib.init`/`runAsync` 없이
/// 바로 `pumpWidget`.
void main() {
  testWidgets('MatchScoreboard renders inning, score, count and out dots without error', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: MatchScoreboard(
            inning: 5,
            topOfInning: true,
            outs: 2,
            bases: [true, false, true],
            homeRuns: 3,
            awayRuns: 1,
            balls: 2,
            strikes: 1,
          ),
        ),
      ),
    );

    expect(find.text('▲ 5회'), findsOneWidget);
    expect(find.text('원정 1 : 홈 3'), findsOneWidget);
    expect(find.text('B2-S1'), findsOneWidget);
  });

  testWidgets('StrikeZoneGrid renders all 9 courses and reports the tapped one', (tester) async {
    String? tapped;
    const courses = [
      'HighInside', 'HighCenter', 'HighOutside',
      'MidInside', 'MidCenter', 'MidOutside',
      'LowInside', 'LowCenter', 'LowOutside',
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StrikeZoneGrid(courses: courses, onSelect: (c) => tapped = c),
        ),
      ),
    );

    expect(find.text('한가운데'), findsOneWidget);
    await tester.tap(find.text('한가운데'));
    expect(tapped, 'MidCenter');
  });

  testWidgets('StrikeZoneGrid ignores taps when disabled', (tester) async {
    String? tapped;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: StrikeZoneGrid(courses: const ['MidCenter'], enabled: false, onSelect: (c) => tapped = c),
        ),
      ),
    );

    await tester.tap(find.text('한가운데'));
    expect(tapped, isNull);
  });
}
