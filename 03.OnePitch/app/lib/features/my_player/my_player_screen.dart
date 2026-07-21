import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/error_banner.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/career_timeline_view.dart';
import 'stat_radar_chart.dart';

/// 내 선수 허브 — [01_내선수](../../../../04_UI기획/01_내선수.md) 상태·훈련·
/// 재정 3탭 + 커리어 탭(대화 2026-07-21 신설). 능력치 3분류 그룹핑·색상은
/// UI 표시 포맷일 뿐(계산·판정 아님 — 03_구조.md §3 "UI가 해도 됨: 숫자
/// 포맷"에 해당)이라 엔진을 거치지 않고 여기서 직접 반올림·색 매핑한다.
///
/// **엔진에 아직 없는 파생값은 명시적으로 생략**: 역할(선발/불펜/마무리)·
/// 명성 라벨은 그 값 자체가 엔진에 없다(역할은 항상 선발 완투 placeholder,
/// 명성은 09_평가_시스템 §4-1이 이미 미구현으로 명시). 구종 마스터리
/// 라벨도 05_구종_시스템의 마스터리 단계·코치 보너스 시스템 자체가
/// 엔진에 없어(코치 시스템 자체가 I6 이월 항목) 이름만 표시 — 신규 습득
/// (카탈로그에서 골라 훈련 슬롯에 배정)까지만 이번에 지원. 재정 탭은
/// 08_개인_재정 시스템 전체가 미구현이라 안내 문구만 둔다. 커리어 탭은
/// 입학·진로선택 갈림길(드래프트/대학/독립/입대)·병역 만료·은퇴를
/// 시간순으로 — 트레이드·계약은 이미 기록 허브 "계약·이력" 탭이 보여줘
/// 여기 안 겹친다.
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
      length: 4,
      child: Scaffold(
        appBar: AppBar(
          title: Text(status.name),
          bottom: const TabBar(tabs: [Tab(text: '상태'), Tab(text: '훈련'), Tab(text: '커리어'), Tab(text: '재정')]),
        ),
        body: Column(
          children: [
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Text(_loadingTeam ? '소속팀 조회 중…' : _teamName()),
            ),
            Expanded(
              child: TabBarView(
                children: [
                  _StatusTab(status: status),
                  _TrainingTab(knownPitchesJson: status.pitchesJson),
                  const CareerTimelineView(),
                  const _FinanceTab(),
                ],
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

    final statEntries = [
      for (final category in _statCategories.values) for (final name in category) (name, (stats[name] as num?)?.toDouble() ?? 50.0),
    ];

    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        const Text('능력치', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 8),
        Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: _StatTable(entries: statEntries)),
            const SizedBox(width: 16),
            SizedBox(width: 200, height: 200, child: StatRadarChart(stats: statEntries)),
          ],
        ),
        const SizedBox(height: 16),
        // 구종·라이브상태를 세로로 각각 화면 끝까지 늘어놓지 않고 카드
        // 2개를 나란히 — 세로 공간을 훨씬 덜 쓰게 돼 탭 안에서 스크롤
        // 없이 다 보이는 게 목적(대화 2026-07-21).
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('보유 구종', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      Wrap(spacing: 6, runSpacing: 6, children: pitches.map((p) => Chip(label: Text(p))).toList()),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('라이브상태', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      _LiveGauge(label: '피로도', value: (liveState['피로도'] as num?)?.toDouble() ?? 0.0),
                      _LiveGauge(label: '컨디션(폼)', value: (liveState['폼'] as num?)?.toDouble() ?? 50.0),
                      _LiveGauge(label: '사기', value: (liveState['사기'] as num?)?.toDouble() ?? 50.0),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
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

/// 능력치 9종을 3열 표로 — 예전엔 피지컬/기술/멘탈 3개 그룹으로 나눠
/// `Chip`을 `Wrap`했는데, 칩 너비가 텍스트 길이마다 달라 줄이 안 맞았다
/// (대화 2026-07-21). `Table`(기본 테두리 없음)로 바꿔 각 칸 폭을 열
/// 단위로 맞추고, 칸 안에서 라벨은 왼쪽·수치는 오른쪽에 정렬한다. 행
/// 순서는 원래 카테고리 순서(피지컬→기술→멘탈)를 그대로 유지해 헤더
/// 없이도 자연스럽게 묶여 보이게 한다.
class _StatTable extends StatelessWidget {
  const _StatTable({required this.entries});
  final List<(String name, double value)> entries;

  static const _columns = 3;

  @override
  Widget build(BuildContext context) {
    final rows = <TableRow>[];
    for (var i = 0; i < entries.length; i += _columns) {
      rows.add(
        TableRow(
          children: [for (var c = 0; c < _columns; c++) if (i + c < entries.length) _statCell(entries[i + c]) else const SizedBox.shrink()],
        ),
      );
    }
    return Table(
      defaultVerticalAlignment: TableCellVerticalAlignment.middle,
      columnWidths: const {0: FlexColumnWidth(), 1: FlexColumnWidth(), 2: FlexColumnWidth()},
      children: rows,
    );
  }

  Widget _statCell((String, double) entry) {
    final (name, v) = entry;
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8, horizontal: 8),
      child: Row(
        children: [
          Text(name, style: const TextStyle(color: AppColors.textSecondary)),
          const Spacer(),
          Text('${_bucketed(v)}', style: TextStyle(fontWeight: FontWeight.bold, color: _statColor(v))),
        ],
      ),
    );
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

/// 훈련 탭 — "능력치 훈련"과 "신규 구종 습득"을 별도 카드로 나눴다(대화
/// 2026-07-21). 신규 구종 습득의 엔진 로직(`pitch_weeks` 진행도 추적)
/// 자체는 이미 있었고, 막혀있던 유일한 이유는 전체 구종 카탈로그를 조회할
/// API가 없었던 것뿐 — `pitchTypeNames()` 신설로 그 공백만 메운다.
/// 마스터리 5단계·코치 전문 보너스(05_구종_시스템.md §2·§3)는 코치
/// 시스템 자체가 없어(I6 이월) 훨씬 큰 별도 과제로 이월.
class _TrainingTab extends StatefulWidget {
  const _TrainingTab({required this.knownPitchesJson});
  final String knownPitchesJson;

  @override
  State<_TrainingTab> createState() => _TrainingTabState();
}

class _TrainingTabState extends State<_TrainingTab> {
  List<String> _stats = [];
  List<String> _intensities = [];
  List<String> _learnablePitches = [];
  String? _primary;
  String? _secondary1;
  String? _secondary2;
  String _intensity = '보통';
  String? _newPitch;
  bool _loading = true;
  bool _saving = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  List<String> _knownPitches() {
    try {
      final v = jsonDecode(widget.knownPitchesJson);
      return v is List ? v.map((e) => e.toString()).toList() : [];
    } catch (_) {
      return [];
    }
  }

  Future<void> _load() async {
    final stats = exposedStatNames();
    final intensities = trainingIntensityNames();
    final catalog = await pitchTypeNames();
    final known = _knownPitches().toSet();
    final config = await getTrainingConfig();
    setState(() {
      _stats = stats;
      _intensities = intensities;
      _learnablePitches = catalog.where((p) => !known.contains(p)).toList();
      _primary = config?.primaryStat ?? stats.first;
      _secondary1 = config != null && config.secondaryStats.isNotEmpty ? config.secondaryStats[0] : stats[1];
      _secondary2 = config != null && config.secondaryStats.length > 1 ? config.secondaryStats[1] : stats[2];
      _intensity = config?.intensity ?? '보통';
      _newPitch = config?.newPitch;
      _loading = false;
    });
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      await setTraining(
        primaryStat: _primary!,
        secondaryStat1: _secondary1!,
        secondaryStat2: _secondary2!,
        intensity: _intensity,
        newPitch: _newPitch,
      );
    } catch (e) {
      setState(() => _error = '$e');
    } finally {
      setState(() => _saving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const LoadingIndicator();
    return ListView(
      padding: const EdgeInsets.all(16),
      children: [
        // 좌측 훈련·우측 구종 — 위아래로 쌓지 않고 반으로 나눠 나란히
        // (대화 2026-07-21).
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('능력치 훈련', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      const Text('주슬롯', style: TextStyle(color: AppColors.textSecondary)),
                      _statDropdown(_primary, (v) => setState(() => _primary = v)),
                      const SizedBox(height: 8),
                      const Text('보조슬롯 1', style: TextStyle(color: AppColors.textSecondary)),
                      _statDropdown(_secondary1, (v) => setState(() => _secondary1 = v)),
                      const SizedBox(height: 8),
                      const Text('보조슬롯 2', style: TextStyle(color: AppColors.textSecondary)),
                      _statDropdown(_secondary2, (v) => setState(() => _secondary2 = v)),
                      const SizedBox(height: 8),
                      const Text('강도', style: TextStyle(color: AppColors.textSecondary)),
                      Wrap(
                        spacing: 8,
                        children: _intensities
                            .map((i) => ChoiceChip(label: Text(i), selected: _intensity == i, onSelected: (_) => setState(() => _intensity = i)))
                            .toList(),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('신규 구종 습득', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      if (_learnablePitches.isEmpty)
                        const Text('이미 카탈로그 10종을 전부 익혔습니다.', style: TextStyle(color: AppColors.textSecondary))
                      else
                        DropdownButtonFormField<String?>(
                          initialValue: _newPitch,
                          decoration: const InputDecoration(labelText: '연마할 구종'),
                          items: [
                            const DropdownMenuItem(value: null, child: Text('선택 안 함')),
                            for (final p in _learnablePitches) DropdownMenuItem(value: p, child: Text(p)),
                          ],
                          onChanged: (v) => setState(() => _newPitch = v),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),
        if (_error != null) ErrorBanner(message: '오류: $_error'),
        ElevatedButton(
          onPressed: _saving ? null : _save,
          child: _saving ? const CircularProgressIndicator() : const Text('저장'),
        ),
      ],
    );
  }

  Widget _statDropdown(String? value, ValueChanged<String?> onChanged) {
    return DropdownButton<String>(
      value: value,
      isExpanded: true,
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
