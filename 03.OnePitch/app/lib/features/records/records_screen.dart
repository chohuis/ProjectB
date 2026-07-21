import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/team_names.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/career_timeline_view.dart';

/// 기록 허브 — [03_기록](../../../../04_UI기획/03_기록.md) 히스토리 로그
/// 6종 + 업적 = 7탭. **5개는 실제 데이터로 채운다**: 경기 로그(`game_log`,
/// 매 등판 전체 보존) · 계약·이력(`league_transactions`의 `contract`/`trade`
/// 종류) · 부상·재활(`protagonist.injury.history`, 발생 시점만 — 치료법·
/// 복귀 확정은 로그에 안 남음) · 커리어(`career_events`, `CareerTimelineView`
/// 공용 위젯 — 내 정보 "커리어" 탭과 동일, I7 27차분에서 이미 만들어져
/// 있었는데 이 화면에만 안 물려 있었음) · 업적(`achievement_progress` +
/// content.db `achievements`, I8 3차분부터 실제 달성 로직이 동작).
///
/// **나머지 2탭은 "미구현"/부분 구현**: 관계는 `relationships`가 감독
/// 관계도만 채워지고 있어(§6-59) 팀동료 관계까지는 여전히 없음 —
/// 정직하게 스코프를 한정해 보여준다(관계 탭 부분 구현). 수상·기록
/// (개인기록·시상 판정 로직 자체가 없음)만 완전 미구현으로 남는다.
class RecordsScreen extends StatelessWidget {
  const RecordsScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return DefaultTabController(
      length: 7,
      child: Scaffold(
        appBar: AppBar(
          title: const Text('기록'),
          bottom: const TabBar(
            isScrollable: true,
            tabs: [
              Tab(text: '경기 로그'),
              Tab(text: '계약·이력'),
              Tab(text: '부상·재활'),
              Tab(text: '관계'),
              Tab(text: '수상·기록'),
              Tab(text: '커리어'),
              Tab(text: '업적'),
            ],
          ),
        ),
        body: const TabBarView(
          children: [
            _GameLogTab(),
            _ContractHistoryTab(),
            _InjuryHistoryTab(),
            _RelationshipsTab(),
            _UnimplementedTab(message: '개인기록·시상식 판정 로직은 아직 엔진에 구현되지 않았습니다.'),
            CareerTimelineView(),
            _AchievementsTab(),
          ],
        ),
      ),
    );
  }
}

class _UnimplementedTab extends StatelessWidget {
  const _UnimplementedTab({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(message, textAlign: TextAlign.center, style: const TextStyle(color: AppColors.textSecondary)),
      ),
    );
  }
}

class _GameLogTab extends StatefulWidget {
  const _GameLogTab();

  @override
  State<_GameLogTab> createState() => _GameLogTabState();
}

class _GameLogTabState extends State<_GameLogTab> {
  List<GameLogEntry>? _entries;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final entries = await getGameLog();
    if (mounted) setState(() => _entries = entries.reversed.toList());
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    if (entries == null) return const LoadingIndicator();
    if (entries.isEmpty) return const Center(child: Text('아직 등판 기록이 없습니다.'));
    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        return ListView.builder(
          itemCount: entries.length,
          itemBuilder: (context, i) {
            final e = entries[i];
            final detail = _decode(e.detailJson);
            final opponentId = detail['opponent']?.toString();
            return ListTile(
              leading: CircleAvatar(child: Text('${detail['grade'] ?? '?'}')),
              title: Text('시즌 ${e.season} · vs ${opponentId == null ? '?' : (names[opponentId] ?? opponentId)}'),
              subtitle: Text('실점 ${detail['runs_allowed'] ?? '?'}'),
            );
          },
        );
      },
    );
  }

  Map<String, dynamic> _decode(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }
}

class _ContractHistoryTab extends StatefulWidget {
  const _ContractHistoryTab();

  @override
  State<_ContractHistoryTab> createState() => _ContractHistoryTabState();
}

class _ContractHistoryTabState extends State<_ContractHistoryTab> {
  List<LeagueTransactionEntry>? _entries;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final entries = await getContractHistory();
    if (mounted) setState(() => _entries = entries.reversed.toList());
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    if (entries == null) return const LoadingIndicator();
    if (entries.isEmpty) return const Center(child: Text('아직 계약·트레이드 이력이 없습니다.'));
    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        return ListView.builder(
          itemCount: entries.length,
          itemBuilder: (context, i) {
            final e = entries[i];
            final detail = _decode(e.detailJson);
            return ListTile(title: Text('Day ${e.day} · ${_summary(e.kind, detail, names)}'));
          },
        );
      },
    );
  }

  String _name(Map<String, String> names, dynamic teamId) {
    final id = teamId?.toString();
    if (id == null) return '?';
    return names[id] ?? id;
  }

  String _summary(String kind, Map<String, dynamic> detail, Map<String, String> names) {
    if (kind == 'trade') return '트레이드: ${_name(names, detail['from'])} → ${_name(names, detail['to'])}';
    final event = detail['event'];
    if (event == 'release') return '방출: ${_name(names, detail['team_id'])} (연봉 ${detail['salary']})';
    if (event == 'sign') return '계약 체결: ${_name(names, detail['team_id'])} (연봉 ${detail['salary']}, ${detail['years']}년)';
    return kind;
  }

  Map<String, dynamic> _decode(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }
}

class _InjuryHistoryTab extends StatefulWidget {
  const _InjuryHistoryTab();

  @override
  State<_InjuryHistoryTab> createState() => _InjuryHistoryTabState();
}

class _InjuryHistoryTabState extends State<_InjuryHistoryTab> {
  List<InjuryLogEntry>? _entries;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final entries = await getInjuryHistory();
    if (mounted) setState(() => _entries = entries.reversed.toList());
  }

  @override
  Widget build(BuildContext context) {
    final entries = _entries;
    if (entries == null) return const LoadingIndicator();
    if (entries.isEmpty) return const Center(child: Text('아직 부상 이력이 없습니다.'));
    return ListView.builder(
      itemCount: entries.length,
      itemBuilder: (context, i) {
        final e = entries[i];
        return ListTile(title: Text('Day ${e.day} · ${e.part_} (${e.severity})'));
      },
    );
  }
}

/// 관계 탭 — 팀동료 관계 데이터 자체가 엔진에 없어(§6-59 이후 반복 확인)
/// **감독 관계만** 정직하게 보여준다. `getRelationships()`는 현재
/// 소속팀이 없으면(입대·미배정 등) 빈 목록을 준다.
class _RelationshipsTab extends StatefulWidget {
  const _RelationshipsTab();

  @override
  State<_RelationshipsTab> createState() => _RelationshipsTabState();
}

class _RelationshipsTabState extends State<_RelationshipsTab> {
  List<RelationshipInfo>? _relationships;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final relationships = await getRelationships();
    if (mounted) setState(() => _relationships = relationships);
  }

  @override
  Widget build(BuildContext context) {
    final relationships = _relationships;
    if (relationships == null) return const LoadingIndicator();
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Padding(
          padding: EdgeInsets.all(16),
          child: Text('팀동료와의 관계는 아직 없습니다 — 지금은 감독과의 관계만 보여줍니다.', style: TextStyle(color: AppColors.textSecondary)),
        ),
        if (relationships.isEmpty)
          const Expanded(child: Center(child: Text('현재 소속팀이 없습니다.')))
        else
          Expanded(
            child: ListView.builder(
              itemCount: relationships.length,
              itemBuilder: (context, i) {
                final r = relationships[i];
                return ListTile(
                  leading: const Icon(Icons.groups_outlined, color: AppColors.accent),
                  title: Text('${r.name} (${r.role})'),
                  subtitle: Text('관계도 ${r.value} · 아크 단계 ${r.arcStage}'),
                );
              },
            ),
          ),
      ],
    );
  }
}

/// 업적 탭 — `getAchievements()`는 content.db `achievements` 정의 전부를
/// 기준으로(아직 한 번도 달성 못 한 것도 포함) 반환한다.
class _AchievementsTab extends StatefulWidget {
  const _AchievementsTab();

  @override
  State<_AchievementsTab> createState() => _AchievementsTabState();
}

class _AchievementsTabState extends State<_AchievementsTab> {
  List<AchievementInfo>? _achievements;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final achievements = await getAchievements();
    if (mounted) setState(() => _achievements = achievements);
  }

  @override
  Widget build(BuildContext context) {
    final achievements = _achievements;
    if (achievements == null) return const LoadingIndicator();
    if (achievements.isEmpty) return const Center(child: Text('아직 등록된 업적이 없습니다.'));
    return ListView.builder(
      itemCount: achievements.length,
      itemBuilder: (context, i) {
        final a = achievements[i];
        return ListTile(
          leading: Icon(
            a.achieved ? Icons.emoji_events : Icons.emoji_events_outlined,
            color: a.achieved ? AppColors.gold : AppColors.textSecondary,
          ),
          title: Text(a.label, style: TextStyle(color: a.achieved ? AppColors.textPrimary : AppColors.textSecondary)),
          subtitle: Text(a.achieved ? '${a.category} · Day ${a.achievedDay}에 달성' : '${a.category} · 미달성'),
        );
      },
    );
  }
}
