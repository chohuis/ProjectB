import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:app/src/rust/api/game.dart';

/// 기록 허브 — [03_기록](../../../../04_UI기획/03_기록.md) 히스토리 로그
/// 6종 + 업적 = 7탭. **엔진에 실제 데이터가 있는 3개만 실제로 채운다**:
/// 경기 로그(`game_log`, 매 등판 전체 보존) · 계약·이력(`league_transactions`
/// 의 `contract`/`trade` 종류 — 이번 서브분에서 계약 이벤트 로깅을 새로
/// 추가함) · 부상·재활(`protagonist.injury.history`, 발생 시점만 —
/// 치료법·복귀 확정은 로그에 안 남음).
///
/// **나머지 4탭은 "미구현" 안내만**: 관계(`relationships` 테이블이
/// 스키마만 있고 채우는 로직 없음 — 관계 시스템 자체 미구현) · 수상·기록
/// (개인기록·시상 판정 로직 없음) · 커리어(진로선택/병역/은퇴결정을
/// 영구 로그로 남기는 코드가 없음 — `enlist`/`discharge`/`retire`도
/// NPC 전용이라 주인공에겐 아직 적용도 안 됨) · 업적(`achievement_progress`
/// 테이블이 스키마만 있고 달성 조건 정의·체크 로직이 없음 — I8 콘텐츠
/// 저작 단계 전제).
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
            _UnimplementedTab(message: '관계 시스템(라이벌·멘토·코치와의 관계도·아크)은 아직 엔진에 구현되지 않았습니다.'),
            _UnimplementedTab(message: '개인기록·시상식 판정 로직은 아직 엔진에 구현되지 않았습니다.'),
            _UnimplementedTab(message: '진로선택·병역·은퇴 등 커리어 분기점을 영구 기록으로 남기는 로직은 아직 없습니다.'),
            _UnimplementedTab(message: '업적(달성 조건·진행도) 시스템은 콘텐츠 저작 단계와 함께 후속 구현됩니다.'),
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
        child: Text(message, textAlign: TextAlign.center, style: const TextStyle(color: Colors.grey)),
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
    if (entries == null) return const Center(child: CircularProgressIndicator());
    if (entries.isEmpty) return const Center(child: Text('아직 등판 기록이 없습니다.'));
    return ListView.builder(
      itemCount: entries.length,
      itemBuilder: (context, i) {
        final e = entries[i];
        final detail = _decode(e.detailJson);
        return ListTile(
          leading: CircleAvatar(child: Text('${detail['grade'] ?? '?'}')),
          title: Text('시즌 ${e.season} · vs ${detail['opponent'] ?? '?'}'),
          subtitle: Text('실점 ${detail['runs_allowed'] ?? '?'}'),
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
    if (entries == null) return const Center(child: CircularProgressIndicator());
    if (entries.isEmpty) return const Center(child: Text('아직 계약·트레이드 이력이 없습니다.'));
    return ListView.builder(
      itemCount: entries.length,
      itemBuilder: (context, i) {
        final e = entries[i];
        final detail = _decode(e.detailJson);
        return ListTile(title: Text('Day ${e.day} · ${_summary(e.kind, detail)}'));
      },
    );
  }

  String _summary(String kind, Map<String, dynamic> detail) {
    if (kind == 'trade') return '트레이드: ${detail['from']} → ${detail['to']}';
    final event = detail['event'];
    if (event == 'release') return '방출: ${detail['team_id']} (연봉 ${detail['salary']})';
    if (event == 'sign') return '계약 체결: ${detail['team_id']} (연봉 ${detail['salary']}, ${detail['years']}년)';
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
    if (entries == null) return const Center(child: CircularProgressIndicator());
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
