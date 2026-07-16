import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';

/// 내 선수 허브 — [01_내선수](../../../../04_UI기획/01_내선수.md) 상태·훈련·
/// 재정 3탭. 능력치 3분류 그룹핑·색상은 UI 표시 포맷일 뿐(계산·판정 아님
/// — 03_구조.md §3 "UI가 해도 됨: 숫자 포맷"에 해당)이라 엔진을 거치지
/// 않고 여기서 직접 반올림·색 매핑한다.
///
/// **엔진에 아직 없는 파생값은 명시적으로 생략**: 나이·역할(선발/불펜/
/// 마무리)·명성 라벨은 그 값 자체가 엔진에 없다(나이는 진로 갈림길과
/// 함께 후속, 역할은 항상 선발 완투 placeholder, 명성은 09_평가_시스템
/// §4-1이 이미 미구현으로 명시). 구종 마스터리 라벨도 05_구종_시스템의
/// 마스터리 시스템 자체가 엔진에 없어 이름만 표시. 재정 탭은
/// 08_개인_재정 시스템 전체가 미구현이라 안내 문구만 둔다.
class MyPlayerScreen extends ConsumerStatefulWidget {
  const MyPlayerScreen({super.key});

  @override
  ConsumerState<MyPlayerScreen> createState() => _MyPlayerScreenState();
}

class _MyPlayerScreenState extends ConsumerState<MyPlayerScreen> {
  TeamOption? _team;
  bool _loadingTeam = true;

  @override
  void initState() {
    super.initState();
    _loadTeam();
  }

  Future<void> _loadTeam() async {
    final team = await getCurrentTeamInfo();
    if (mounted) setState(() => _team = team);
    setState(() => _loadingTeam = false);
  }

  String _teamName() {
    if (_team == null) return '무소속';
    try {
      final meta = jsonDecode(_team!.metaJson);
      return meta is Map ? (meta['name']?.toString() ?? _team!.teamId) : _team!.teamId;
    } catch (_) {
      return _team!.teamId;
    }
  }

  @override
  Widget build(BuildContext context) {
    final status = ref.watch(gameControllerProvider).status;
    if (status == null) {
      return const Scaffold(body: Center(child: Text('활성 게임이 없습니다.')));
    }

    return DefaultTabController(
      length: 3,
      child: Scaffold(
        appBar: AppBar(
          title: Text(status.name),
          bottom: const TabBar(tabs: [Tab(text: '상태'), Tab(text: '훈련'), Tab(text: '재정')]),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(_loadingTeam ? '소속팀 조회 중…' : _teamName()),
            ),
            Expanded(
              child: TabBarView(
                children: [_StatusTab(status: status), _TrainingTab(), const _FinanceTab()],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

const _statCategories = {
  '피지컬': ['구속', '체력', '회복력'],
  '기술': ['제구', '구위', '경기운영'],
  '멘탈': ['클러치', '침착함', '리더십'],
};

/// 표시용 3단위 반올림(20·23·26···80) — [01_선수_능력치](../../../../02_기획/육성코어/01_선수_능력치.md)
/// §7. 내부 연속치는 그대로 두고 화면 숫자만 버킷화 — 계산이 아니라 포맷.
int _bucketed(double v) => (20 + 3 * ((v - 20) / 3).round()).clamp(20, 80).toInt();

/// 낮음→높음 색 스펙트럼 placeholder — 정확한 구간·색상은
/// [01_내선수](../../../../04_UI기획/01_내선수.md) §5가 이미 "아트 단계"로
/// 미뤄둔 항목이라 기능만 있는 최소 그라데이션.
Color _statColor(double v) {
  final t = ((v - 20) / 60).clamp(0.0, 1.0);
  return Color.lerp(Colors.redAccent, Colors.greenAccent.shade700, t)!;
}

class _StatusTab extends StatelessWidget {
  const _StatusTab({required this.status});
  final ProtagonistStatusInfo status;

  @override
  Widget build(BuildContext context) {
    final stats = _decodeMap(status.statsJson);
    final liveState = _decodeMap(status.liveStateJson);
    final pitches = _decodeList(status.pitchesJson);

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        for (final entry in _statCategories.entries) ...[
          Text(entry.key, style: const TextStyle(fontWeight: FontWeight.bold)),
          const SizedBox(height: 8),
          Wrap(
            spacing: 16,
            runSpacing: 8,
            children: entry.value.map((name) {
              final v = (stats[name] as num?)?.toDouble() ?? 50.0;
              return Chip(
                label: Text('$name ${_bucketed(v)}'),
                backgroundColor: _statColor(v).withValues(alpha: 0.25),
              );
            }).toList(),
          ),
          const SizedBox(height: 16),
        ],
        const Text('보유 구종', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Wrap(spacing: 8, children: pitches.map((p) => Chip(label: Text(p))).toList()),
        const SizedBox(height: 16),
        const Text('라이브상태', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        _LiveGauge(label: '피로도', value: (liveState['피로도'] as num?)?.toDouble() ?? 0.0),
        _LiveGauge(label: '컨디션(폼)', value: (liveState['폼'] as num?)?.toDouble() ?? 50.0),
        _LiveGauge(label: '사기', value: (liveState['사기'] as num?)?.toDouble() ?? 50.0),
      ],
    );
  }

  Map<String, dynamic> _decodeMap(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  List<String> _decodeList(String json) {
    try {
      final v = jsonDecode(json);
      return v is List ? v.map((e) => e.toString()).toList() : [];
    } catch (_) {
      return [];
    }
  }
}

class _LiveGauge extends StatelessWidget {
  const _LiveGauge({required this.label, required this.value});
  final String label;
  final double value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          SizedBox(width: 100, child: Text(label)),
          Expanded(child: LinearProgressIndicator(value: (value / 100).clamp(0.0, 1.0))),
          const SizedBox(width: 8),
          Text(value.toStringAsFixed(0)),
        ],
      ),
    );
  }
}

class _TrainingTab extends StatefulWidget {
  @override
  State<_TrainingTab> createState() => _TrainingTabState();
}

class _TrainingTabState extends State<_TrainingTab> {
  List<String> _stats = [];
  List<String> _intensities = [];
  String? _primary;
  String? _secondary1;
  String? _secondary2;
  String _intensity = '보통';
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final stats = exposedStatNames();
    final intensities = trainingIntensityNames();
    final config = await getTrainingConfig();
    setState(() {
      _stats = stats;
      _intensities = intensities;
      _primary = config?.primaryStat ?? stats.first;
      _secondary1 = config != null && config.secondaryStats.isNotEmpty ? config.secondaryStats[0] : stats[1];
      _secondary2 = config != null && config.secondaryStats.length > 1 ? config.secondaryStats[1] : stats[2];
      _intensity = config?.intensity ?? '보통';
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await setTraining(primaryStat: _primary!, secondaryStat1: _secondary1!, secondaryStat2: _secondary2!, intensity: _intensity);
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('능력치 주슬롯', style: TextStyle(fontWeight: FontWeight.bold)),
          _statDropdown(_primary, (v) => setState(() => _primary = v)),
          const SizedBox(height: 12),
          const Text('능력치 보조슬롯 1', style: TextStyle(fontWeight: FontWeight.bold)),
          _statDropdown(_secondary1, (v) => setState(() => _secondary1 = v)),
          const SizedBox(height: 12),
          const Text('능력치 보조슬롯 2', style: TextStyle(fontWeight: FontWeight.bold)),
          _statDropdown(_secondary2, (v) => setState(() => _secondary2 = v)),
          const SizedBox(height: 12),
          const Text('강도', style: TextStyle(fontWeight: FontWeight.bold)),
          Wrap(
            spacing: 8,
            children: _intensities
                .map((i) => ChoiceChip(label: Text(i), selected: _intensity == i, onSelected: (_) => setState(() => _intensity = i)))
                .toList(),
          ),
          const SizedBox(height: 8),
          const Text('구종 슬롯(신규 습득)은 후속 서브분에서 추가됩니다.', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 20),
          if (_error != null) Text('오류: $_error', style: const TextStyle(color: Colors.red)),
          ElevatedButton(
            onPressed: _saving ? null : _save,
            child: _saving ? const CircularProgressIndicator() : const Text('저장'),
          ),
        ],
      ),
    );
  }

  Widget _statDropdown(String? value, ValueChanged<String?> onChanged) {
    return DropdownButton<String>(
      value: value,
      items: _stats.map((s) => DropdownMenuItem(value: s, child: Text(s))).toList(),
      onChanged: onChanged,
    );
  }
}

class _FinanceTab extends StatelessWidget {
  const _FinanceTab();

  @override
  Widget build(BuildContext context) {
    return const Center(
      child: Padding(
        padding: EdgeInsets.all(24),
        child: Text('재정 시스템(08_개인_재정)은 아직 엔진에 구현되지 않았습니다.\n후속 서브분에서 추가됩니다.', textAlign: TextAlign.center),
      ),
    );
  }
}
