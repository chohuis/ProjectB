import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/match_visuals.dart';

/// [05_매치](../../../04_UI기획/05_매치.md) §2·§4 CustomPainter 비주얼
/// (`MatchScoreboard`·`PitchTargetCanvas`) — 순수 Flutter 위젯(엔진 세션
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

  testWidgets('PitchTargetCanvas reports the tapped position as a zone coordinate', (tester) async {
    Offset? target;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PitchTargetCanvas(target: null, onTargetChanged: (t) => target = t),
        ),
      ),
    );

    // 캔버스 정중앙을 탭하면 존 좌표 (0,0)(한가운데)이 나와야 한다.
    await tester.tapAt(tester.getCenter(find.byType(PitchTargetCanvas)));
    expect(target, isNotNull);
    expect(target!.dx, closeTo(0.0, 0.01));
    expect(target!.dy, closeTo(0.0, 0.01));
  });

  testWidgets('PitchTargetCanvas ignores taps when disabled', (tester) async {
    Offset? target;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: PitchTargetCanvas(target: null, enabled: false, onTargetChanged: (t) => target = t),
        ),
      ),
    );

    await tester.tapAt(tester.getCenter(find.byType(PitchTargetCanvas)));
    expect(target, isNull);
  });
}
