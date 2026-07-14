import 'dart:io';

import 'package:test/test.dart';
import 'package:tool/src/content_seed.dart';

void main() {
  test('buildSeedPayload groups rivals/season_ranks/titles onto team_history', () {
    final dir = Directory.systemTemp.createTempSync('onepitch_seed_test_');
    addTearDown(() => dir.deleteSync(recursive: true));

    File('${dir.path}/leagues.csv').writeAsStringSync('id,name\nleague:x,X리그\n');
    File('${dir.path}/teams.csv').writeAsStringSync(
      'id,league_id,school_id,stadium_id,name,region,type,color\n'
      'team:a,league:x,,stadium:s,A팀,서울,육성형,빨강\n'
      'team:b,league:x,,stadium:s,B팀,부산,도전형,파랑\n',
    );
    File('${dir.path}/stadiums.csv').writeAsStringSync('id,name,park_factor\nstadium:s,S구장,중립\n');
    File('${dir.path}/team_traits.csv').writeAsStringSync(
      'team_id,philosophy,resource,status\nteam:a,전통/정통,안정,중견\nteam:b,스몰볼,알뜰,언더독\n',
    );
    File('${dir.path}/team_org.csv').writeAsStringSync('team_id,founded_year,budget\nteam:a,2020,\n');
    File('${dir.path}/team_rivals.csv').writeAsStringSync(
      'team_a,team_b,description\nteam:a,team:b,"서울 vs 부산, 지역 라이벌"\n',
    );
    File('${dir.path}/team_season_ranks.csv').writeAsStringSync(
      'team_id,season,rank\nteam:a,S-1,1\nteam:b,S-1,2\n',
    );
    File('${dir.path}/team_titles.csv').writeAsStringSync(
      'competition,season,team_id,result\nX컵,S-1,team:a,우승\n',
    );

    final payload = buildSeedPayload(dir.path);

    expect(payload['teams'], hasLength(2));
    expect(payload['team_history'], hasLength(2));

    final teamA = (payload['team_history'] as List).firstWhere((h) => h['team_id'] == 'team:a');
    expect(teamA['founded_year'], 2020);
    expect(teamA['budget'], isNull);
    expect(teamA['rivals'], [
      {'with': 'team:b', 'description': '서울 vs 부산, 지역 라이벌'}
    ]);
    expect(teamA['season_ranks'], {'S-1': 1});
    expect(teamA['titles'], [
      {'competition': 'X컵', 'season': 'S-1', 'result': '우승'}
    ]);

    final teamB = (payload['team_history'] as List).firstWhere((h) => h['team_id'] == 'team:b');
    expect(teamB['founded_year'], isNull);
    expect(teamB['rivals'], [
      {'with': 'team:a', 'description': '서울 vs 부산, 지역 라이벌'}
    ]);
    expect(teamB['titles'], isEmpty);
  });

  test('missing optional CSV files yield empty lists, not errors', () {
    final dir = Directory.systemTemp.createTempSync('onepitch_seed_test_empty_');
    addTearDown(() => dir.deleteSync(recursive: true));

    final payload = buildSeedPayload(dir.path);

    expect(payload['leagues'], isEmpty);
    expect(payload['teams'], isEmpty);
    expect(payload['team_history'], isEmpty);
  });
}
