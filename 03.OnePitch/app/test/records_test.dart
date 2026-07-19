import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

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
    while (pending.isEmpty && guard < 10) {
      pending = await advance();
      guard++;
    }
    expect(pending, isNotEmpty);
    expect(pending.first.kind, 'game');
    await resolveChoice(actionId: pending.first.id, choiceId: '자동');

    final logs = await getGameLog();
    expect(logs, isNotEmpty);
    expect(logs.first.season, 0);
  }, timeout: const Timeout(Duration(minutes: 2)));
}
