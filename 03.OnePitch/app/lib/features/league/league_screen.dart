import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/shared/loading_indicator.dart';

const _leagueLabels = {
  'league:hs': '고교',
  'league:univ': '대학',
  'league:independent': '독립',
  'league:pro': '프로',
  'league:pro_farm': '프로(2군)',
};

/// 리그 허브 — [02_리그](../../../../04_UI기획/02_리그.md) 로스터·일정·
/// 순위·라이벌 4탭. 결정5 "전 팀 풀 스카우팅"에 따라 소속팀뿐 아니라
/// 172팀 전부 열람 가능(리그 선택→팀 선택 드롭다운 2단).
///
/// **엔진에 없는 값은 생략**: 코치/감독/구단주(스태프 시스템 자체가
/// 미구현, I3 스코프아웃) · NPC 개인 통산 성적(계속 이월 항목) · 타자
/// 유형 태그(엔진에 계산 로직 없음) · 전력★ 대비 순위 이변 강조(★ 조회
/// 없음) · 개인 라이벌 관계·아크 비교(`relationships` 테이블이 스키마만
/// 있고 채우는 로직이 없음 — 팀 레벨 라이벌 목록만 표시).
class LeagueScreen extends ConsumerStatefulWidget {
  const LeagueScreen({super.key});

  @override
  ConsumerState<LeagueScreen> createState() => _LeagueScreenState();
}

class _LeagueScreenState extends ConsumerState<LeagueScreen> {
  String? _selectedLeague;
  String? _selectedTeamId;
  List<TeamOption> _teamsInLeague = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    final own = await getCurrentTeamInfo();
    final league = own?.leagueId ?? 'league:hs';
    final teams = await listTeams(leagueId: league);
    setState(() {
      _selectedLeague = league;
      _teamsInLeague = teams;
      _selectedTeamId = own?.teamId ?? (teams.isNotEmpty ? teams.first.teamId : null);
      _loading = false;
    });
  }

  Future<void> _onLeagueChanged(String? league) async {
    if (league == null) return;
    final teams = await listTeams(leagueId: league);
    setState(() {
      _selectedLeague = league;
      _teamsInLeague = teams;
      _selectedTeamId = teams.isNotEmpty ? teams.first.teamId : null;
    });
  }

  @override
  Widget build(BuildContext context) {
    final hasActiveGame = ref.watch(gameControllerProvider).hasActiveGame;
    if (!hasActiveGame) {
      return const Scaffold(body: Center(child: Text('활성 게임이 없습니다.')));
    }
    if (_loading || _selectedTeamId == null) {
      return const Scaffold(body: LoadingIndicator());
    }

    return DefaultTabController(
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('리그'),
          bottom: const TabBar(tabs: [Tab(text: '로스터'), Tab(text: '일정'), Tab(text: '순위'), Tab(text: '라이벌')]),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  DropdownButton<String>(
                    value: _selectedLeague,
                    items: _leagueLabels.entries.map((e) => DropdownMenuItem(value: e.key, child: Text(e.value))).toList(),
                    onChanged: _onLeagueChanged,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: DropdownButton<String>(
                      isExpanded: true,
                      value: _selectedTeamId,
                      items: _teamsInLeague.map((t) => DropdownMenuItem(value: t.teamId, child: Text(_teamLabel(t)))).toList(),
                      onChanged: (v) => setState(() => _selectedTeamId = v),
                    ),
                  ),
                ],
              ),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _RosterTab(teamId: _selectedTeamId!),
                  _ScheduleTab(teamId: _selectedTeamId!),
                  _StandingsTab(leagueId: _selectedLeague!, highlightTeamId: _selectedTeamId!),
                  _RivalsTab(teamId: _selectedTeamId!),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  String _teamLabel(TeamOption t) {
    try {
      final meta = jsonDecode(t.metaJson);
      final name = meta is Map ? meta['name'] : null;
      return name?.toString() ?? t.teamId;
    } catch (_) {
      return t.teamId;
    }
  }
}

class _RosterTab extends StatefulWidget {
  const _RosterTab({required this.teamId});
  final String teamId;

  @override
  State<_RosterTab> createState() => _RosterTabState();
}

class _RosterTabState extends State<_RosterTab> {
  List<RosterPlayerInfo>? _roster;

  @override
  void didUpdateWidget(covariant _RosterTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.teamId != widget.teamId) _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _roster = null);
    final roster = await listRoster(teamId: widget.teamId);
    if (mounted) setState(() => _roster = roster);
  }

  @override
  Widget build(BuildContext context) {
    final roster = _roster;
    if (roster == null) return const LoadingIndicator();
    if (roster.isEmpty) return const Center(child: Text('로스터가 없습니다.'));
    return ListView.builder(
      itemCount: roster.length,
      itemBuilder: (context, i) {
        final p = roster[i];
        return ListTile(
          title: Text('${p.name} (${p.position}, ${p.age}세)'),
          subtitle: Text(_statsSummary(p.statsJson)),
        );
      },
    );
  }

  String _statsSummary(String statsJson) {
    try {
      final v = jsonDecode(statsJson);
      if (v is! Map) return '';
      final entries = v.entries.where((e) => e.value is num).take(4);
      return entries.map((e) => '${e.key} ${(e.value as num).round()}').join(' · ');
    } catch (_) {
      return '';
    }
  }
}

class _ScheduleTab extends StatefulWidget {
  const _ScheduleTab({required this.teamId});
  final String teamId;

  @override
  State<_ScheduleTab> createState() => _ScheduleTabState();
}

class _ScheduleTabState extends State<_ScheduleTab> {
  List<ScheduleGameInfo>? _games;
  int _currentDay = 0;

  @override
  void didUpdateWidget(covariant _ScheduleTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.teamId != widget.teamId) _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _games = null);
    final games = await getTeamSchedule(teamId: widget.teamId);
    final meta = await getMetaStatus();
    if (mounted) {
      setState(() {
        _games = games;
        _currentDay = meta.currentDay;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final games = _games;
    if (games == null) return const LoadingIndicator();
    if (games.isEmpty) return const Center(child: Text('일정이 없습니다.'));
    final nextDay = games.map((g) => g.day).where((d) => d > _currentDay).fold<int?>(null, (min, d) => min == null || d < min ? d : min);
    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        return ListView.builder(
          itemCount: games.length,
          itemBuilder: (context, i) {
            final g = games[i];
            final opponentId = g.home == widget.teamId ? g.away : g.home;
            final opponent = names[opponentId] ?? opponentId;
            final isNext = g.day == nextDay;
            final scoreText = _scoreText(g);
            return ListTile(
              tileColor: isNext ? Colors.amber.withValues(alpha: 0.15) : null,
              title: Text('Day ${g.day} — vs $opponent (${g.home == widget.teamId ? '홈' : '원정'})'),
              subtitle: Text(scoreText),
              trailing: isNext ? const Text('다음 경기', style: TextStyle(fontWeight: FontWeight.bold)) : null,
            );
          },
        );
      },
    );
  }

  String _scoreText(ScheduleGameInfo g) {
    if (g.resultJson == null) return '예정';
    try {
      final v = jsonDecode(g.resultJson!);
      return '결과: 홈 ${v['home']} : 원정 ${v['away']}';
    } catch (_) {
      return '결과 있음';
    }
  }
}

class _StandingsTab extends StatefulWidget {
  const _StandingsTab({required this.leagueId, required this.highlightTeamId});
  final String leagueId;
  final String highlightTeamId;

  @override
  State<_StandingsTab> createState() => _StandingsTabState();
}

class _StandingsTabState extends State<_StandingsTab> {
  List<StandingsRowInfo>? _rows;

  @override
  void didUpdateWidget(covariant _StandingsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.leagueId != widget.leagueId) _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _rows = null);
    final rows = await getStandings(leagueId: widget.leagueId);
    if (mounted) setState(() => _rows = rows);
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    if (rows == null) return const LoadingIndicator();
    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        return ListView.builder(
          itemCount: rows.length,
          itemBuilder: (context, i) {
            final r = rows[i];
            return ListTile(
              tileColor: r.teamId == widget.highlightTeamId ? Colors.amber.withValues(alpha: 0.15) : null,
              leading: Text('${r.rank}'),
              title: Text(names[r.teamId] ?? r.teamId),
              trailing: Text('${r.wins}승 ${r.losses}패 ${r.ties}무'),
            );
          },
        );
      },
    );
  }
}

class _RivalsTab extends StatefulWidget {
  const _RivalsTab({required this.teamId});
  final String teamId;

  @override
  State<_RivalsTab> createState() => _RivalsTabState();
}

class _RivalsTabState extends State<_RivalsTab> {
  String? _rivalsJson;
  bool _loaded = false;

  @override
  void didUpdateWidget(covariant _RivalsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.teamId != widget.teamId) _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() {
      _rivalsJson = null;
      _loaded = false;
    });
    final rivals = await getTeamRivals(teamId: widget.teamId);
    if (mounted) {
      setState(() {
        _rivalsJson = rivals;
        _loaded = true;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (!_loaded) return const LoadingIndicator();
    final rivals = _parseRivals(_rivalsJson);
    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text('팀 라이벌', style: TextStyle(fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            if (rivals.isEmpty)
              const Text('등록된 라이벌 팀이 없습니다.')
            else
              Wrap(
                spacing: 8,
                children: [
                  for (final r in rivals)
                    Tooltip(
                      message: r.description,
                      child: Chip(label: Text(names[r.withTeamId] ?? r.withTeamId)),
                    ),
                ],
              ),
            const SizedBox(height: 24),
            const Text(
              '개인 라이벌(관계도·아크 진행) 시스템은 아직 엔진에 구현되지 않았습니다.\n후속 서브분에서 추가됩니다.',
              style: TextStyle(color: Colors.grey),
            ),
          ],
        );
      },
    );
  }

  /// `team_history.rivals`는 `[{"description","with"(team_id)}]` 형태
  /// (`with`는 team_id라 표시하려면 `teamNamesProvider`로 이름을 조회해야
  /// 함) — 예전엔 이 구조를 그냥 `.toString()`해버려 Dart Map 덤프가
  /// 그대로 칩에 찍히던 버그가 있었음.
  List<({String withTeamId, String description})> _parseRivals(String? json) {
    if (json == null) return const [];
    try {
      final v = jsonDecode(json);
      if (v is! List) return const [];
      return v
          .whereType<Map>()
          .map((e) => (withTeamId: e['with']?.toString() ?? '?', description: e['description']?.toString() ?? ''))
          .toList();
    } catch (_) {
      return const [];
    }
  }
}
