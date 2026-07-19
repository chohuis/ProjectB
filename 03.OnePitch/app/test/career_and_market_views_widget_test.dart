import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/career_choice_view.dart';
import 'package:app/features/game/contract_nego_view.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/features/game/trade_decision_view.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// [07_전환화면](../../../04_UI기획/07_전환화면.md) §1~§4의 4종 전용화면
/// (`contractNego`·`tradeDecision`·`careerChoice`·`draft`) — 합성
/// `PendingActionInfo`로 렌더링·버튼 탭 배선을 검증한다. 백엔드에
/// 실제로 연결된 pending action이 아니므로 응답 호출은 조용히 no-op
/// (§6-25의 `InjuryTreatmentView` 테스트와 같은 방식).
void main() {
  setUpAll(() async => await RustLib.init());

  late ProviderContainer container;

  setUp(() {
    container = ProviderContainer();
  });
  tearDown(() => container.dispose());

  Future<void> pumpAndSettleView(WidgetTester tester, Widget child) async {
    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(container: container, child: MaterialApp(home: Scaffold(body: child))),
      );
      await Future.delayed(const Duration(milliseconds: 200));
      await tester.pump();
    });
    await tester.pump();
  }

  testWidgets('CareerChoiceView renders the 3 options and can respond', (tester) async {
    const action = PendingActionInfo(
      id: 'pending:career',
      kind: 'careerChoice',
      urgency: 'urgent',
      createdDay: 10,
      payloadJson: '{"drafted":false,"options":["대학","독립","입대"]}',
    );
    await pumpAndSettleView(
      tester,
      CareerChoiceView(action: action, controller: container.read(gameControllerProvider.notifier)),
    );

    expect(find.text('대학'), findsOneWidget);
    expect(find.text('독립'), findsOneWidget);
    expect(find.text('입대'), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('선택').first);
      await Future.delayed(const Duration(milliseconds: 100));
    });
    await tester.pump();
  });

  testWidgets('DraftResultView renders the drafted team and salary', (tester) async {
    const action = PendingActionInfo(
      id: 'pending:draft',
      kind: 'draft',
      urgency: 'urgent',
      createdDay: 10,
      payloadJson: '{"drafted":true,"team_id":"team:seoul_royals","salary":9000}',
    );
    await pumpAndSettleView(
      tester,
      DraftResultView(action: action, controller: container.read(gameControllerProvider.notifier)),
    );

    expect(find.textContaining('team:seoul_royals'), findsOneWidget);
    expect(find.textContaining('9000'), findsOneWidget);
  });

  testWidgets('ContractNegoView renders offers and allows accept/counter', (tester) async {
    const action = PendingActionInfo(
      id: 'pending:contract',
      kind: 'contractNego',
      urgency: 'urgent',
      createdDay: 10,
      payloadJson: '{"kind":"FA","offers":[{"team_id":"team:a","salary":8000,"years":3},{"team_id":"team:b","salary":7500,"years":2}]}',
    );
    await pumpAndSettleView(
      tester,
      ContractNegoView(action: action, controller: container.read(gameControllerProvider.notifier)),
    );

    expect(find.text('team:a'), findsOneWidget);
    expect(find.text('team:b'), findsOneWidget);
    expect(find.text('수락'), findsNWidgets(2));

    await tester.runAsync(() async {
      await tester.tap(find.text('수락').first);
      await Future.delayed(const Duration(milliseconds: 100));
    });
    await tester.pump();
  });

  testWidgets('TradeDecisionView hides the reject button when there is no no-trade clause', (tester) async {
    const action = PendingActionInfo(
      id: 'pending:trade',
      kind: 'tradeDecision',
      urgency: 'urgent',
      createdDay: 10,
      payloadJson: '{"from_team_id":"team:a","to_team_id":"team:b","kind":"현금","counterpart":null,"can_reject":false}',
    );
    await pumpAndSettleView(
      tester,
      TradeDecisionView(action: action, controller: container.read(gameControllerProvider.notifier)),
    );

    expect(find.text('수락'), findsOneWidget);
    expect(find.text('거부'), findsNothing);
  });
}
