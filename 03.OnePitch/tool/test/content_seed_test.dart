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
    expect(payload['pitch_types'], isEmpty);
    expect(payload['name_pools'], isEmpty);
    expect(payload['generation_rules'], isEmpty);
    expect(payload['personality_rules'], isEmpty);
    expect(payload['world_config'], isEmpty);
  });

  test('name_pools.csv groups by locale+kind into one names array per group', () {
    final dir = Directory.systemTemp.createTempSync('onepitch_seed_test_names_');
    addTearDown(() => dir.deleteSync(recursive: true));

    File('${dir.path}/name_pools.csv').writeAsStringSync(
      'locale,kind,name\nkr,surname,김\nkr,surname,이\nkr,given,민준\nen,surname,Kim\n',
    );

    final pools = buildSeedPayload(dir.path)['name_pools'] as List;
    expect(pools, hasLength(3));

    final krSurname = pools.firstWhere((p) => p['id'] == 'namepool:kr_surname');
    expect(krSurname['locale'], 'kr');
    expect(krSurname['kind'], 'surname');
    expect(krSurname['names'], ['김', '이']);
  });

  test('generation_rules.toml/personality_rules.toml/world_config.toml parse into payload', () {
    final dir = Directory.systemTemp.createTempSync('onepitch_seed_test_toml_');
    addTearDown(() => dir.deleteSync(recursive: true));

    File('${dir.path}/generation_rules.toml').writeAsStringSync(
      '[league."league:x"]\nroster_size = 20\n',
    );
    File('${dir.path}/personality_rules.toml').writeAsStringSync(
      '[context."role:감독"]\nrelation = { "사교적" = 2 }\n',
    );
    File('${dir.path}/world_config.toml').writeAsStringSync('canonical_seed = 42\n');

    final payload = buildSeedPayload(dir.path);

    expect(payload['generation_rules'], [
      {
        'league_id': 'league:x',
        'rules': {'roster_size': 20}
      }
    ]);
    expect(payload['personality_rules'], [
      {
        'context': 'role:감독',
        'trait_weights': {
          'relation': {'사교적': 2}
        }
      }
    ]);
    expect(payload['world_config'], [
      {'key': 'canonical_seed', 'value': '42'}
    ]);
  });
}
