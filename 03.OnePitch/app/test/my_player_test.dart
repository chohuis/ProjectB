import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// 내 선수 허브가 호출하는 엔진 함수들을 UI 없이 직접 검증 — 상태/훈련
/// 탭이 실제로 읽고 쓸 데이터가 브리지 경유로 정확히 오가는지.
void main() {
  setUpAll(() async => await RustLib.init());

  test('team info, exposed stats, and training config round-trip through the bridge', () async {
    final teams = await listHsTeams(contentDbPath: '../engine/content.db');
    await newGame(
      contentDbPath: '../engine/content.db',
      canonicalSeed: 555,
      name: '내선수테스트',
      handedness: '우완',
      schoolTeamId: teams.first.teamId,
      archetype: '제구형',
    );

    final team = await getCurrentTeamInfo();
    expect(team, isNotNull);
    expect(team!.teamId, teams.first.teamId);

    final stats = exposedStatNames();
    expect(stats.length, 9);
    expect(stats, containsAll(['구속', '체력', '회복력', '제구', '구위', '경기운영', '클러치', '침착함', '리더십']));

    final intensities = trainingIntensityNames();
    expect(intensities, ['약', '보통', '강']);

    final types = trainingTypeOptions();
    expect(types.length, 6);
    expect(types.map((t) => t.id), containsAll(['strength', 'conditioning', 'bullpen', 'sim_game', 'pressure', 'leadership']));
    final bullpen = types.firstWhere((t) => t.id == 'bullpen');
    expect(bullpen.stats, ['제구', '구위']);

    expect(await getTrainingConfig(), isNull, reason: 'training not configured yet');

    await setTraining(primaryTraining: 'bullpen', secondaryTraining: 'pressure', intensity: '강');
    final config = await getTrainingConfig();
    expect(config, isNotNull);
    expect(config!.primaryTraining, 'bullpen');
    expect(config.secondaryTraining, 'pressure');
    expect(config.intensity, '강');
    expect(config.newPitch, isNull);
  });
}
