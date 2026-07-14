import 'dart:convert';

import 'seed_csv.dart';

/// Assembles the JSON payload consumed by `engine`'s `seed_content` Rust
/// binary from the flat, git-diffable CSVs under data/seed/ (07_데이터관리.md
/// §3-1). Rows are grouped/nested here (rivals·season_ranks·titles → JSON
/// arrays on team_history) because content.db keeps those as JSON columns
/// (06_스키마.md §3) while the seed source stays normalized/flat for review.
Map<String, dynamic> buildSeedPayload(String seedDir) {
  final leagues = readSeedCsv('$seedDir/leagues.csv');
  final schools = readSeedCsv('$seedDir/schools.csv');
  final stadiums = readSeedCsv('$seedDir/stadiums.csv');
  final teams = readSeedCsv('$seedDir/teams.csv');
  final teamTraits = readSeedCsv('$seedDir/team_traits.csv');
  final teamOrg = readSeedCsv('$seedDir/team_org.csv');
  final teamRivals = readSeedCsv('$seedDir/team_rivals.csv');
  final teamSeasonRanks = readSeedCsv('$seedDir/team_season_ranks.csv');
  final teamTitles = readSeedCsv('$seedDir/team_titles.csv');

  final teamOrgById = {for (final r in teamOrg) r['team_id']!: r};

  final rivalsByTeam = <String, List<Map<String, String>>>{};
  for (final r in teamRivals) {
    final a = r['team_a']!;
    final b = r['team_b']!;
    final desc = r['description'] ?? '';
    rivalsByTeam.putIfAbsent(a, () => []).add({'with': b, 'description': desc});
    rivalsByTeam.putIfAbsent(b, () => []).add({'with': a, 'description': desc});
  }

  final seasonRanksByTeam = <String, Map<String, int>>{};
  for (final r in teamSeasonRanks) {
    seasonRanksByTeam.putIfAbsent(r['team_id']!, () => {})[r['season']!] = int.parse(r['rank']!);
  }

  final titlesByTeam = <String, List<Map<String, String>>>{};
  for (final r in teamTitles) {
    titlesByTeam.putIfAbsent(r['team_id']!, () => []).add({
      'competition': r['competition'] ?? '',
      'season': r['season'] ?? '',
      'result': r['result'] ?? '',
    });
  }

  return {
    'leagues': [
      for (final r in leagues) {'id': r['id'], 'meta': {'name': r['name']}}
    ],
    'schools': [
      for (final r in schools) {'id': r['id'], 'region': r['region'], 'meta': {'name': r['name']}}
    ],
    'stadiums': [
      for (final r in stadiums)
        {'id': r['id'], 'name': r['name'], 'park_factor': r['park_factor']}
    ],
    'teams': [
      for (final r in teams)
        {
          'id': r['id'],
          'league_id': r['league_id'],
          'stadium_id': nullIfEmpty(r['stadium_id']),
          'color': nullIfEmpty(r['color']),
          'meta': {
            'name': r['name'],
            'region': r['region'],
            'type': r['type'],
            if (nullIfEmpty(r['school_id']) != null) 'school_id': r['school_id'],
          },
        }
    ],
    'team_traits': [
      for (final r in teamTraits)
        {
          'team_id': r['team_id'],
          'philosophy': r['philosophy'],
          'resource': r['resource'],
          'status': r['status'],
        }
    ],
    'team_history': [
      for (final r in teams)
        {
          'team_id': r['id'],
          'founded_year': intOrNull(teamOrgById[r['id']]?['founded_year']),
          'budget': intOrNull(teamOrgById[r['id']]?['budget']),
          'rivals': rivalsByTeam[r['id']] ?? [],
          'season_ranks': seasonRanksByTeam[r['id']] ?? {},
          'titles': titlesByTeam[r['id']] ?? [],
        }
    ],
  };
}

String buildSeedPayloadJson(String seedDir) => jsonEncode(buildSeedPayload(seedDir));
