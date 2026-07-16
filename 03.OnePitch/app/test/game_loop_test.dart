import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// I7 1차분의 완료 기준("뉴게임→진행→경기→시즌종료가 실제로 동작") 자체를
/// Dart↔Rust 브리지 경유로 증명하는 테스트 — UI는 건드리지 않고
/// `api::game`을 직접 호출한다. `content.db` 경로는 에셋 번들 대신
/// 엔진 크레이트에 체크인된 파일을 상대경로로 직접 가리킨다(테스트
/// 실행 cwd = `app/` 패키지 루트).
void main() {
  setUpAll(() async => await RustLib.init());

  test('new game -> advance -> resolve a protagonist game -> keeps advancing into a new season', () async {
    final teams = await listHsTeams(contentDbPath: '../engine/content.db');
    expect(teams, isNotEmpty);

    await newGame(
      contentDbPath: '../engine/content.db',
      canonicalSeed: 20260716,
      name: '루프테스트',
      handedness: '우완',
      schoolTeamId: teams.first.teamId,
      archetype: '강속구형',
    );

    final status = await getProtagonistStatus();
    expect(status.name, '루프테스트');

    // 정지점(주인공 경기)까지 진행 — advance()가 배경 시즌을 계속 시뮬레이션.
    List<PendingActionInfo> pending = await advance();
    var guard = 0;
    while (pending.isEmpty && guard < 5) {
      pending = await advance();
      guard++;
    }
    expect(pending, isNotEmpty, reason: 'advance() should eventually stop at a PendingAction');
    expect(pending.first.kind, 'game');

    // "자동" 모드로 경기를 한 번에 완주.
    final step = await resolveChoice(actionId: pending.first.id, choiceId: '자동');
    expect(step, isA<MatchStepInfo_GameOver>());

    final metaAfterGame = await getMetaStatus();
    expect(metaAfterGame.currentDay, greaterThan(0));

    // 시즌 경계(364일)를 실제로 넘기는지 — advance()를 반복 호출해 day가
    // 계속 전진하는지, season_rollover가 패닉 없이 동작하는지 확인.
    var lastDay = metaAfterGame.currentDay;
    for (var i = 0; i < 400; i++) {
      final result = await advance();
      final meta = await getMetaStatus();
      expect(meta.currentDay, greaterThanOrEqualTo(lastDay), reason: 'day should never go backwards');
      lastDay = meta.currentDay;
      if (result.isNotEmpty && result.first.kind == 'game') {
        await resolveChoice(actionId: result.first.id, choiceId: '자동');
      }
      if (meta.season >= 1) break;
    }
    final finalMeta = await getMetaStatus();
    expect(finalMeta.season, greaterThanOrEqualTo(1), reason: 'expected at least one season boundary to be crossed');
  }, timeout: const Timeout(Duration(minutes: 5)));
}
