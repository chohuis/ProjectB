import 'dart:convert';

import 'seed_csv.dart';
import 'seed_toml.dart';

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
  final pitchTypes = readSeedCsv('$seedDir/pitch_types.csv');
  final namePools = readSeedCsv('$seedDir/name_pools.csv');
  final generationRules = readSeedToml('$seedDir/generation_rules.toml')['league'] as Map<String, dynamic>? ?? {};
  final personalityRules = readSeedToml('$seedDir/personality_rules.toml')['context'] as Map<String, dynamic>? ?? {};
  final worldConfig = readSeedToml('$seedDir/world_config.toml');
  final events = readSeedToml('$seedDir/events.toml')['event'] as List<dynamic>? ?? [];
  final achievements = readSeedToml('$seedDir/achievements.toml')['achievement'] as List<dynamic>? ?? [];
  final narrativeTemplates = readSeedToml('$seedDir/narrative_templates.toml')['template'] as List<dynamic>? ?? [];

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

  final namePoolGroups = <String, List<String>>{};
  for (final r in namePools) {
    final key = '${r['locale']} ${r['kind']}';
    namePoolGroups.putIfAbsent(key, () => []).add(r['name'] ?? '');
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
    'pitch_types': [
      for (final r in pitchTypes) {'id': r['id'], 'family': r['family'], 'name': r['name']}
    ],
    'name_pools': [
      for (final entry in namePoolGroups.entries)
        () {
          final parts = entry.key.split(' ');
          final locale = parts[0];
          final kind = parts[1];
          return {
            'id': 'namepool:${locale}_$kind',
            'locale': locale,
            'kind': kind,
            'names': entry.value,
          };
        }()
    ],
    'generation_rules': [
      for (final e in generationRules.entries) {'league_id': e.key, 'rules': e.value}
    ],
    'personality_rules': [
      for (final e in personalityRules.entries) {'context': e.key, 'trait_weights': e.value}
    ],
    'world_config': [
      for (final e in worldConfig.entries) {'key': e.key, 'value': e.value.toString()}
    ],
    // I8 1차분(콘텐츠 저작 파이프라인) — events/achievements는 trigger·
    // choices·effects가 중첩 구조라 CSV 대신 나머지 nested 콘텐츠(generation_rules
    // 등)와 같은 TOML 소스를 쓴다([[event]] 배열-of-테이블, §02_이벤트.md §2).
    // 캐릭터는 절차적 생성이라(01_캐릭터.md §6) seed 대상이 아님.
    'events': [
      for (final e in events)
        {
          'id': e['id'],
          'stage': e['stage'],
          'week': e['week'],
          'type': e['type'],
          'urgency': e['urgency'],
          'trigger': e['trigger'],
          'body': e['body'],
          'choices': e['choices'],
        }
    ],
    'achievements': [
      for (final a in achievements)
        {
          'id': a['id'],
          'category': a['category'],
          'condition': a['condition'],
          'meta': a['meta'],
        }
    ],
    'narrative_templates': [
      for (final t in narrativeTemplates)
        {
          'id': t['id'],
          'category': t['category'],
          'template': t['template'],
          'variants': t['variants'],
        }
    ],
  };
}

String buildSeedPayloadJson(String seedDir) => jsonEncode(buildSeedPayload(seedDir));
