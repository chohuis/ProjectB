import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/features/game/career_choice_view.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// 회귀 테스트 — 예전엔 `contractNego`/`tradeDecision`/`draft` 같은
/// PendingAction 화면들이 `team_id`(예: `team:seoul_royals`)를 그대로
/// 찍고 있었다. `teamNamesProvider`(`shared/team_names.dart`)로 고친 뒤
/// **활성 게임이 있을 때 실제 팀 이름이 뜨는지** 여기서 검증한다 —
/// 다른 전용화면 위젯 테스트들은 합성 payload+활성 게임 없음이라 이름
/// 조회가 항상 실패해 원시 id로 폴백하는 경로만 우연히 통과했었다.
void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('DraftResultView resolves the real team name, not the raw team_id', (tester) async {
    late ProviderContainer container;
    late String teamId;
    late String teamName;

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      await newGame(
        contentDbPath: '../engine/content.db',
        canonicalSeed: 4242,
        name: '팀명테스트',
        handedness: '우완',
        schoolTeamId: teams.first.teamId,
        archetype: '강속구형',
      );
      final proTeams = await listTeams(leagueId: 'league:pro');
      teamId = proTeams.first.teamId;
      teamName = teamDisplayName(proTeams.first.metaJson, teamId);
      container = ProviderContainer();
    });

    // 실제 드래프트 지명 시나리오와 같은 형태의 payload — team_id만 옴.
    final action = PendingActionInfo(
      id: 'pending:draft',
      kind: 'draft',
      urgency: 'urgent',
      createdDay: 10,
      payloadJson: '{"drafted":true,"team_id":"$teamId","salary":9000}',
    );

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp(
            home: Scaffold(body: DraftResultView(action: action, controller: container.read(gameControllerProvider.notifier))),
          ),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 300));
      await tester.pump();
    });
    await tester.pump();

    expect(find.textContaining(teamName), findsOneWidget, reason: '팀 실명($teamName)이 떠야 함 — 원시 id($teamId)가 아니라');
    expect(find.textContaining(teamId), findsNothing, reason: '원시 team_id가 화면에 그대로 노출되면 안 됨');

    container.dispose();
  });
}
