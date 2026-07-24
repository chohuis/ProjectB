import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// 'game'이 아닌 PendingAction(청백전 로테이션 경쟁에서 밀려 벤치된 날
/// 다른 이벤트가 먼저 뜰 수 있음, 대화 2026-07-26)을 첫 선택지로 넘기고
/// 계속 진행.
Future<void> _resolveNonGamePendingAction(PendingActionInfo action) async {
  final payload = jsonDecode(action.payloadJson);
  final choices = payload is Map ? payload['choices'] as List<dynamic>? : null;
  final choiceId = (choices != null && choices.isNotEmpty) ? (choices.first as Map)['id'] as String : '자동';
  await resolveChoice(actionId: action.id, choiceId: choiceId);
}

/// 기록 허브가 호출하는 엔진 함수들을 UI 없이 직접 검증.
void main() {
  setUpAll(() async => await RustLib.init());

  test('game log, contract history, and injury history all round-trip through the bridge', () async {
    final hsTeams = await listHsTeams(contentDbPath: '../engine/content.db');
    await newGame(
      contentDbPath: '../engine/content.db',
      canonicalSeed: 1111,
      name: '기록위젯테스트',
      handedness: '우완',
      schoolTeamId: hsTeams.first.teamId,
      archetype: '강속구형',
    );

    // 새 게임 직후엔 전부 비어있어야 함.
    expect(await getGameLog(), isEmpty);
    expect(await getContractHistory(), isEmpty);
    expect(await getInjuryHistory(), isEmpty);

    // advance() + resolveChoice("자동")로 실제 경기를 완주시키면 game_log가 채워진다.
    var pending = await advance();
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
    expect(pending, isNotEmpty);
    expect(pending.first.kind, 'game');
    await resolveChoice(actionId: pending.first.id, choiceId: '자동');

    final logs = await getGameLog();
    expect(logs, isNotEmpty);
    // 로테이션 경쟁에서 밀리면 첫 실제 등판이 시즌 0이 아니라 그 다음
    // 시즌으로 넘어갈 수 있다(대화 2026-07-26) — 이 테스트가 검증하려는
    // 건 "game_log가 브리지를 왕복한다"지 "반드시 시즌 0에 첫 등판한다"가
    // 아니므로 정확한 시즌 값 대신 유효한 범위인지만 확인한다.
    expect(logs.first.season, greaterThanOrEqualTo(0));
  }, timeout: const Timeout(Duration(minutes: 2)));
}
