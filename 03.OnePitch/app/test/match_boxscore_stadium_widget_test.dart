import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/match_boxscore.dart';
import 'package:app/features/game/match_stadium.dart';
import 'package:app/features/game/match_visuals.dart';
import 'package:app/shared/design/colors.dart';

/// 박스스코어·구장 도트아트(대화 2026-07-25, 매치 화면 재설계) — 순수
/// Flutter 위젯(엔진 세션 불필요)이라 `match_visuals_widget_test.dart`와
/// 같은 패턴으로 바로 `pumpWidget`.
void main() {
  group('parseInningLog', () {
    test('parses a valid inning log JSON array', () {
      const raw = '[{"inning":1,"top_of_inning":true,"runs":2,"hits":3,"walks":1},'
          '{"inning":1,"top_of_inning":false,"runs":0,"hits":1,"walks":0}]';
      final entries = parseInningLog(raw);
      expect(entries, hasLength(2));
      expect(entries[0].inning, 1);
      expect(entries[0].topOfInning, true);
      expect(entries[0].runs, 2);
      expect(entries[1].topOfInning, false);
    });

    test('returns an empty list for null or malformed input', () {
      expect(parseInningLog(null), isEmpty);
      expect(parseInningLog('not json'), isEmpty);
      expect(parseInningLog('{}'), isEmpty);
    });
  });

  testWidgets('BoxScoreTable renders inning headers and R/H/BB totals', (tester) async {
    final entries = [
      const BoxScoreEntry(inning: 1, topOfInning: true, runs: 2, hits: 3, walks: 1),
      const BoxScoreEntry(inning: 1, topOfInning: false, runs: 1, hits: 2, walks: 0),
      const BoxScoreEntry(inning: 2, topOfInning: true, runs: 0, hits: 0, walks: 0),
    ];

    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: BoxScoreTable(entries: entries, homeLabel: '홈팀', awayLabel: '원정팀', currentInning: 2),
        ),
      ),
    );

    expect(find.text('홈팀'), findsOneWidget);
    expect(find.text('원정팀'), findsOneWidget);
    // 원정 합계 — 1회 2점 + 2회 0점 = R2, 안타 3, 볼넷 1.
    expect(find.text('2'), findsWidgets);
    expect(find.text('3'), findsWidgets);
    expect(find.text('R'), findsOneWidget);
    expect(find.text('H'), findsOneWidget);
    expect(find.text('BB'), findsOneWidget);
  });

  testWidgets('BoxScoreTable renders without error when there are no entries yet', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: BoxScoreTable(entries: [], homeLabel: '홈팀', awayLabel: '원정팀', currentInning: 1),
        ),
      ),
    );

    expect(find.text('홈팀'), findsOneWidget);
    expect(find.text('1'), findsOneWidget); // 1회 헤더만 있고 점수는 없음.
  });

  testWidgets('StadiumFieldView renders the field, runners and score overlay without error', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: StadiumFieldView(
            stadiumId: 'stadium:busan_waves',
            bases: [true, false, true],
            runnerColor: Colors.red,
            fielderColor: Colors.blueGrey,
            batterHandedness: '좌타',
            inning: 3,
            topOfInning: true,
            outs: 1,
            balls: 2,
            strikes: 1,
            homeRuns: 4,
            awayRuns: 2,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();

    expect(find.text('▲ 3회'), findsOneWidget);
    expect(find.text('원정 2 : 홈 4'), findsOneWidget);
    expect(find.text('B2-S1'), findsOneWidget);
    expect(find.byType(BaseDiamondIndicator), findsOneWidget);
    // 수비 9자리(장식) 라벨이 전부 그려지는지 — P/C/1B/2B/SS/3B/LF/CF/RF.
    for (final label in const ['P', 'C', '1B', '2B', 'SS', '3B', 'LF', 'CF', 'RF']) {
      expect(find.text(label), findsOneWidget, reason: '$label 수비 배지가 있어야 함');
    }
  });

  testWidgets('StadiumFieldView highlights the fielder badge that just made the play', (tester) async {
    Widget buildView({required String? lastFielderPosition, required bool lastPlayWasError}) => MaterialApp(
      home: Scaffold(
        body: StadiumFieldView(
          stadiumId: 'stadium:busan_waves',
          bases: const [false, false, false],
          runnerColor: Colors.red,
          fielderColor: Colors.blueGrey,
          batterHandedness: '우타',
          inning: 1,
          topOfInning: true,
          outs: 1,
          balls: 0,
          strikes: 0,
          homeRuns: 0,
          awayRuns: 0,
          lastFielderPosition: lastFielderPosition,
          lastPlayWasError: lastPlayWasError,
        ),
      ),
    );

    Color? ssBorderColor() {
      final container = tester.widget<Container>(find.ancestor(of: find.text('SS'), matching: find.byType(Container)).first);
      final decoration = container.decoration as BoxDecoration;
      return decoration.border?.top.color;
    }

    // 유격수가 정상 아웃을 처리 — 파란(accent) 하이라이트.
    await tester.pumpWidget(buildView(lastFielderPosition: '유격수', lastPlayWasError: false));
    expect(ssBorderColor(), AppColors.accent);

    // 유격수가 실책 — 빨간(danger) 하이라이트로 바뀜.
    await tester.pumpWidget(buildView(lastFielderPosition: '유격수', lastPlayWasError: true));
    expect(ssBorderColor(), AppColors.danger);

    // 방금 플레이가 없으면(K/BB 등) 아무 배지도 하이라이트 안 됨.
    await tester.pumpWidget(buildView(lastFielderPosition: null, lastPlayWasError: false));
    expect(ssBorderColor(), isNot(anyOf(AppColors.accent, AppColors.danger)));
  });

  testWidgets('StadiumFieldView animates a ball from home plate to the fielder and then hides it', (tester) async {
    Widget buildView({required String? lastFielderPosition}) => MaterialApp(
      home: Scaffold(
        body: StadiumFieldView(
          stadiumId: 'stadium:busan_waves',
          bases: const [false, false, false],
          runnerColor: Colors.red,
          fielderColor: Colors.blueGrey,
          batterHandedness: '우타',
          inning: 1,
          topOfInning: true,
          outs: 1,
          balls: 0,
          strikes: 0,
          homeRuns: 0,
          awayRuns: 0,
          lastFielderPosition: lastFielderPosition,
        ),
      ),
    );

    const ballKey = ValueKey('stadium-ball');

    // 처음엔 방금 플레이가 없어 공이 안 보임.
    await tester.pumpWidget(buildView(lastFielderPosition: null));
    expect(find.byKey(ballKey), findsNothing);

    // null→값 전이(유격수, 내야라 350ms짜리 낮은 궤적)로 애니메이션 시작.
    await tester.pumpWidget(buildView(lastFielderPosition: '유격수'));
    expect(find.byKey(ballKey), findsOneWidget, reason: '애니메이션 시작 직후엔 공이 보여야 함');

    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(ballKey), findsOneWidget, reason: '재생 중(200ms/350ms)엔 계속 보여야 함');

    await tester.pump(const Duration(milliseconds: 200));
    expect(find.byKey(ballKey), findsNothing, reason: '애니메이션이 끝나면(400ms>350ms) 공이 사라져야 함');
  });

  testWidgets('StadiumFieldView falls back to the default asset for an unknown stadium id', (tester) async {
    await tester.pumpWidget(
      const MaterialApp(
        home: Scaffold(
          body: StadiumFieldView(
            stadiumId: 'stadium:does_not_exist',
            bases: [false, false, false],
            runnerColor: Colors.green,
            fielderColor: Colors.blueGrey,
            batterHandedness: '우타',
            inning: 1,
            topOfInning: true,
            outs: 0,
            balls: 0,
            strikes: 0,
            homeRuns: 0,
            awayRuns: 0,
          ),
        ),
      ),
    );
    await tester.pumpAndSettle();
    expect(tester.takeException(), isNull);
  });

  testWidgets('StadiumFieldView re-renders without error when bases/score change', (tester) async {
    Widget buildView({required List<bool> bases, required int homeRuns}) => MaterialApp(
      home: Scaffold(
        body: StadiumFieldView(
          stadiumId: 'stadium:seoul_cobras',
          bases: bases,
          runnerColor: Colors.blue,
          fielderColor: Colors.blueGrey,
          batterHandedness: '양타',
          inning: 1,
          topOfInning: true,
          outs: 0,
          balls: 0,
          strikes: 0,
          homeRuns: homeRuns,
          awayRuns: 0,
        ),
      ),
    );

    await tester.pumpWidget(buildView(bases: const [false, false, false], homeRuns: 0));
    expect(tester.takeException(), isNull);
    await tester.pumpWidget(buildView(bases: const [true, true, false], homeRuns: 1));
    expect(tester.takeException(), isNull);
  });
}
