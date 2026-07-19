import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/game/injury_treatment_view.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('injury treatment view renders the comparison table and can respond', (tester) async {
    final container = ProviderContainer();
    addTearDown(container.dispose);

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await container
          .read(gameControllerProvider.notifier)
          .startNewGame(
            contentDbPath: '../engine/content.db',
            canonicalSeed: 3333,
            name: '부상화면테스트',
            handedness: '우완',
            schoolTeamId: teams.first.teamId,
            archetype: '제구형',
          );
    });

    const action = PendingActionInfo(
      id: 'pending:fake-injury',
      kind: 'injuryTreatment',
      urgency: 'urgent',
      createdDay: 10,
      payloadJson: '{"부위":"어깨","심각도":"중등","day":10}',
    );

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(
              body: InjuryTreatmentView(action: action, controller: container.read(gameControllerProvider.notifier)),
            ),
          ),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 300));
      await tester.pump();
    });
    await tester.pump();

    expect(find.text('부상 발생: 어깨 (중등)'), findsOneWidget);
    expect(find.text('수술'), findsWidgets);
    expect(find.text('재활'), findsWidgets);
    expect(find.text('무리한 복귀'), findsWidgets);

    // 버튼을 눌러도(가짜 action_id라 백엔드에서 조용히 no-op) 크래시가 안 나는지 확인.
    await tester.runAsync(() async {
      await tester.tap(find.widgetWithText(ElevatedButton, '재활'));
      await Future.delayed(const Duration(milliseconds: 200));
    });
    await tester.pump();
  });
}
