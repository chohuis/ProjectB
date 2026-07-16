import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// 리그 허브가 호출하는 엔진 함수들을 UI 없이 직접 검증.
void main() {
  setUpAll(() async => await RustLib.init());

  test('team listing, roster, schedule, standings, and rivals all round-trip through the bridge', () async {
    final hsTeams = await listHsTeams(contentDbPath: '../engine/content.db');
    await newGame(
      contentDbPath: '../engine/content.db',
      canonicalSeed: 888,
      name: '리그테스트',
      handedness: '우완',
      schoolTeamId: hsTeams.first.teamId,
      archetype: '돌부처형',
    );

    final own = await getCurrentTeamInfo();
    expect(own, isNotNull);
    expect(own!.leagueId, 'league:hs');

    final teamsInLeague = await listTeams(leagueId: 'league:hs');
    expect(teamsInLeague, isNotEmpty);
    expect(teamsInLeague.every((t) => t.leagueId == 'league:hs'), isTrue);

    final allTeams = await listTeams(leagueId: null);
    expect(allTeams.length, greaterThan(teamsInLeague.length));

    final roster = await listRoster(teamId: own.teamId);
    expect(roster, isNotEmpty);
    expect(roster.any((p) => p.position == '선발투수'), isTrue);

    final schedule = await getTeamSchedule(teamId: own.teamId);
    expect(schedule, isNotEmpty);
    expect(schedule.every((g) => g.home == own.teamId || g.away == own.teamId), isTrue);

    final standings = await getStandings(leagueId: 'league:hs');
    expect(standings.any((s) => s.teamId == own.teamId), isTrue);
    expect(standings.first.rank, 1);

    // 라이벌은 콘텐츠 유무에 따라 null일 수 있음 — 호출 자체가 에러 없이 되는지만 확인.
    await getTeamRivals(teamId: own.teamId);
  });
}
