import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/design/player_badges.dart';
import 'tournament_bracket_screen.dart';

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
          bottom: const TabBar(tabs: [Tab(text: '로스터'), Tab(text: '일정'), Tab(text: '진행중인 대회'), Tab(text: '라이벌')]),
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
                  _CompetitionsTab(teamId: _selectedTeamId!),
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

/// "로스터" 탭(재정비 대화 2026-07-24) — 예전엔 감독/코치/구단주가
/// `list_roster`에 필터 없이 섞여 나와(발견한 버그, 스탯도 전술력 같은
/// 낯선 필드) 선수단 리스트 사이에 낯선 항목이 끼어 있었다. 지금은
/// `listRoster`(선수만)와 `listTeamStaff`(스태프만)로 분리해서 받고,
/// 캐릭터 생성 화면의 로스터 미리보기(`new_game_screen.dart`의
/// `_SchoolRosterTab`)와 같은 카드형 배치를 재사용한다.
class _RosterTab extends StatefulWidget {
  const _RosterTab({required this.teamId});
  final String teamId;

  @override
  State<_RosterTab> createState() => _RosterTabState();
}

class _RosterTabState extends State<_RosterTab> {
  List<RosterPlayerInfo>? _roster;
  List<RosterPlayerInfo>? _staff;

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
    setState(() {
      _roster = null;
      _staff = null;
    });
    final results = await Future.wait([listRoster(teamId: widget.teamId), listTeamStaff(teamId: widget.teamId)]);
    if (mounted) {
      setState(() {
        _roster = results[0];
        _staff = results[1];
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final roster = _roster;
    final staff = _staff;
    if (roster == null || staff == null) return const LoadingIndicator();
    if (roster.isEmpty && staff.isEmpty) return const Center(child: Text('로스터가 없습니다.'));

    final owner = staff.where((p) => p.position == '구단주').firstOrNull;
    final manager = staff.where((p) => p.position == '감독').firstOrNull;
    final coach = staff.where((p) => p.position == '코치').firstOrNull;
    final pitchers = roster.where((p) => p.position == '선발투수' || p.position == '구원투수').toList();
    final batters = roster.where((p) => p.position != '선발투수' && p.position != '구원투수').toList();

    return Padding(
      padding: const EdgeInsets.all(12),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            flex: 2,
            child: Column(
              children: [
                Expanded(child: _StaffCard(label: '구단주', person: owner)),
                const SizedBox(height: 8),
                Expanded(child: _StaffCard(label: '감독', person: manager)),
                const SizedBox(height: 8),
                Expanded(child: _StaffCard(label: '코치', person: coach)),
              ],
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 3,
            child: Column(
              children: [
                Expanded(child: _PlayerListCard(label: '투수', players: pitchers)),
                const SizedBox(height: 8),
                Expanded(child: _PlayerListCard(label: '타자', players: batters)),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _StaffCard extends StatelessWidget {
  const _StaffCard({required this.label, required this.person});

  final String label;
  final RosterPlayerInfo? person;

  @override
  Widget build(BuildContext context) {
    final p = person;
    return AppPanel(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
          const SizedBox(height: 4),
          if (p == null)
            const Text('-', style: TextStyle(color: AppColors.textSecondary, fontSize: 12))
          else
            Row(
              children: [
                Expanded(child: Text(p.name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 12), overflow: TextOverflow.ellipsis)),
                if (label != '구단주') ...[const SizedBox(width: 6), OvrBadge(ovr: ovrOf(p.statsJson))],
              ],
            ),
        ],
      ),
    );
  }
}

class _PlayerListCard extends StatelessWidget {
  const _PlayerListCard({required this.label, required this.players});

  final String label;
  final List<RosterPlayerInfo> players;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('$label (${players.length})', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
          const SizedBox(height: 4),
          Expanded(
            child: ListView.builder(
              itemCount: players.length,
              itemBuilder: (context, i) {
                final p = players[i];
                final pitchSummary = _pitchSummary(p.pitchesJson);
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 3),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Expanded(
                            child: Text(
                              '${p.name} · ${p.position} · ${p.age}세',
                              style: const TextStyle(color: AppColors.textPrimary, fontSize: 12),
                              overflow: TextOverflow.ellipsis,
                            ),
                          ),
                          OvrBadge(ovr: ovrOf(p.statsJson)),
                        ],
                      ),
                      if (pitchSummary.isNotEmpty)
                        Padding(
                          padding: const EdgeInsets.only(top: 1),
                          child: Text(pitchSummary, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
                        ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }

  // 투수 보유 구종을 마스터리 단계와 함께 압축 표시(04_UI기획/02_리그.md
  // §1 "투수 보유 구종") — 목록 화면이라 `PitchMasteryRow`(내 정보 화면용
  // 큰 배지)를 그대로 쓰면 너무 길어져서, 한 줄 요약 텍스트로 축약.
  String _pitchSummary(String? pitchesJson) {
    if (pitchesJson == null) return '';
    final pitches = decodePitchMastery(pitchesJson);
    if (pitches.isEmpty) return '';
    return pitches.map((p) => '${p.name}(${masteryStageLabels[p.stage] ?? '습작'})').join(' · ');
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

/// "진행중인 대회" 탭(대화 2026-07-26, 예전 "순위" 탭을 대체) — 리그
/// 순위 카드(항상 1개, 탭하면 기존 `_StandingsTab`을 다이얼로그로) +
/// 이번 시즌 참가한 대회 카드(탭하면 `TournamentBracketScreen`으로).
/// 대회 카드는 우승/탈락이 확정돼도 그 시즌 동안 유지되고, 시즌이
/// 바뀌면 자연히 사라졌다가 다시 참가하면 새로 나타난다(엔진이 이미
/// `season`으로 걸러줌 — 여기선 그대로 표시만).
class _CompetitionsTab extends StatefulWidget {
  const _CompetitionsTab({required this.teamId});
  final String teamId;

  @override
  State<_CompetitionsTab> createState() => _CompetitionsTabState();
}

class _CompetitionsTabState extends State<_CompetitionsTab> {
  List<CompetitionCardInfo>? _cards;

  @override
  void didUpdateWidget(covariant _CompetitionsTab oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.teamId != widget.teamId) _load();
  }

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() => _cards = null);
    final cards = await listActiveCompetitions(teamId: widget.teamId);
    if (mounted) setState(() => _cards = cards);
  }

  void _openCard(CompetitionCardInfo card) {
    if (card.kind == 'league') {
      showDialog<void>(
        context: context,
        builder: (context) => Dialog(
          child: SizedBox(
            width: 480,
            height: 560,
            child: Column(
              children: [
                Padding(
                  padding: const EdgeInsets.all(12),
                  child: Row(
                    children: [
                      const Expanded(child: Text('리그 순위', style: TextStyle(fontWeight: FontWeight.bold))),
                      IconButton(icon: const Icon(Icons.close), onPressed: () => Navigator.pop(context)),
                    ],
                  ),
                ),
                Expanded(child: _StandingsTab(leagueId: card.id, highlightTeamId: widget.teamId)),
              ],
            ),
          ),
        ),
      );
    } else {
      Navigator.of(context).push(MaterialPageRoute(builder: (context) => TournamentBracketScreen(tournamentId: card.id)));
    }
  }

  @override
  Widget build(BuildContext context) {
    final cards = _cards;
    if (cards == null) return const LoadingIndicator();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final card in cards) ...[
          _CompetitionCard(card: card, onTap: () => _openCard(card)),
          const SizedBox(height: 8),
        ],
        if (cards.length == 1)
          const Padding(
            padding: EdgeInsets.only(top: 8),
            child: Text('아직 참가 중인 대회가 없습니다.', style: TextStyle(color: AppColors.textSecondary)),
          ),
      ],
    );
  }
}

class _CompetitionCard extends StatelessWidget {
  const _CompetitionCard({required this.card, required this.onTap});
  final CompetitionCardInfo card;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final statusColor = card.isChampion
        ? AppColors.safe
        : card.isEliminated
        ? AppColors.textSecondary
        : AppColors.accent;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: AppPanel(
        child: Row(
          children: [
            if (card.isChampion) const Padding(padding: EdgeInsets.only(right: 8), child: Icon(Icons.emoji_events, color: AppColors.safe)),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(card.name, style: const TextStyle(fontWeight: FontWeight.bold)),
                  const SizedBox(height: 4),
                  Text(card.statusSummary, style: TextStyle(color: statusColor)),
                ],
              ),
            ),
            const Icon(Icons.chevron_right, color: AppColors.textSecondary),
          ],
        ),
      ),
    );
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
              style: TextStyle(color: AppColors.textSecondary),
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
