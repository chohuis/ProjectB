import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// 'game'이 아닌 PendingAction(청백전 로테이션 경쟁에서 밀려 벤치된 날
/// 뜨는 이벤트 등, 대화 2026-07-26)이 먼저 뜨면 첫 선택지로 넘기고
/// 계속 진행 — 이 테스트가 검증하려는 건 "언젠가 주인공 경기가 뜬다"지
/// "제일 처음 뜨는 PendingAction이 무조건 경기다"가 아니다.
Future<void> _resolveNonGamePendingAction(PendingActionInfo action) async {
  final payload = jsonDecode(action.payloadJson);
  final choices = payload is Map ? payload['choices'] as List<dynamic>? : null;
  final choiceId = (choices != null && choices.isNotEmpty) ? (choices.first as Map)['id'] as String : '자동';
  await resolveChoice(actionId: action.id, choiceId: choiceId);
}

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
    // 로테이션 경쟁에서 밀려 벤치된 날엔 'game'이 아닌 다른 PendingAction이
    // 먼저 뜰 수 있어(대화 2026-07-26) 그런 것들은 넘기고 계속 진행한다.
    List<PendingActionInfo> pending = await advance();
    var guard = 0;
    // 이벤트 콘텐츠 확대(대화 2026-07-25, 고교 1차 배치 8개 추가)로 확률형
    // 이벤트 발동 빈도가 늘어 guard를 20→60으로 올림(§6-N).
    while ((pending.isEmpty || pending.first.kind != 'game') && guard < 60) {
      if (pending.isNotEmpty) {
        await _resolveNonGamePendingAction(pending.first);
      }
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
      if (result.isNotEmpty) {
        if (result.first.kind == 'game') {
          await resolveChoice(actionId: result.first.id, choiceId: '자동');
        } else {
          await _resolveNonGamePendingAction(result.first);
        }
      }
      if (meta.season >= 1) break;
    }
    final finalMeta = await getMetaStatus();
    expect(finalMeta.season, greaterThanOrEqualTo(1), reason: 'expected at least one season boundary to be crossed');
  }, timeout: const Timeout(Duration(minutes: 5)));
}
