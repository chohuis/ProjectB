import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/content_db.dart';
import 'package:app/shared/slot_paths.dart';
import 'package:app/shared/error_banner.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'hs_school_region_map.dart';
import 'hs_rank_trend_chart.dart';

/// 캐릭터 생성 — [06_캐릭터생성](../../../../04_UI기획/06_캐릭터생성.md) 7단계를
/// 이번 서브분은 3페이지(개인 신체 → 야구 정보 → 학교 선택)로 압축했다
/// (2구종 선택 단계는 그 문서 자체가 "열린 세부 — 아트 단계"로 이미
/// 미뤄둔 항목이라 뒤로 미룸). 1페이지(개인 신체 — 이름·생일·키·몸무게·
/// 혈액형·출신지역·등번호)는 시뮬레이션에 쓰이지 않는 순수 표시용
/// 플레이버 데이터(대화 2026-07-20)라 `newGame` 직후 `setProtagonistProfile`
/// 로 별도 저장된다. 3페이지(학교 선택)는 원래 설계(§1 3~4단계)대로
/// 지역(8권역) 선택 → 그 지역 학교 목록 2단계로 나뉘며, 팀특성 3슬롯은
/// 화면에 안 보인다 — [07_주인공_생성](../../../../02_기획/07_주인공_생성.md)
/// §3-2 "정보 전부 공개" 원칙(강점·약점을 알고 고르는 전략적 선택)을
/// 사용자 요청으로 뒤집은 것(대화 2026-07-20). 학교 리스트는 이름+고유
/// 색+실측 별점만 보이고(권역 안에서 별점 내림차순), 탭하면 상세
/// 다이얼로그가 뜨고 거기서 "확인"을 눌러야 실제로 선택된다 — 리스트
/// 한 줄로는 담을 수 없는 정보라 2단계로 분리. 다이얼로그는 기존
/// 디자인 시스템(`AppPanel`/`KpiTile`)으로 대시보드처럼 구성 —
/// `HsRankTrendChart`(최근 5시즌 순위 라인차트)·우승기록(최신순 칩)·
/// 라이벌·예산(KpiTile). "선수단·코칭스태프"는 자리만 예약하고 안내
/// 문구만 둠 — 실제 로스터는 뉴게임 이후에야 생성되고 감독·코치
/// 시스템 자체가 아직 없어(I6 이월) 지금 채우면 나중에 걷어낼 가짜
/// 데이터가 될 뿐이라 `RecordsScreen`의 "미구현 안내" 패턴을 그대로
/// 따름(대화 2026-07-21).
class NewGameScreen extends ConsumerStatefulWidget {
  const NewGameScreen({super.key});

  @override
  ConsumerState<NewGameScreen> createState() => _NewGameScreenState();
}

class _NewGameScreenState extends ConsumerState<NewGameScreen> {
  int _page = 0;

  // 개인 신체
  final _nameController = TextEditingController(text: '무명');
  int _birthMonth = 3;
  int _birthDay = 15;
  final _heightController = TextEditingController(text: '175');
  final _weightController = TextEditingController(text: '68');
  String _bloodType = 'O';
  String _hometown = '서울';
  final _jerseyController = TextEditingController(text: '1');
  List<String> _bloodTypes = const [];
  List<String> _hometowns = const [];

  // 야구 정보
  String _handedness = '우완';
  String _archetype = '강속구형';

  // 학교 선택(지역 → 학교 → 상세 확인)
  String? _contentDbPath;
  List<HsSchoolDetail> _schools = [];
  String? _selectedRegion;
  String? _selectedSchoolId;
  bool _loading = true;
  String? _loadError;

  static const _archetypes = ['강속구형', '제구형', '체력형', '돌부처형'];

  @override
  void initState() {
    super.initState();
    _bloodTypes = bloodTypeNames();
    _hometowns = hometownRegionNames();
    if (_bloodTypes.isNotEmpty) _bloodType = _bloodTypes.first;
    if (_hometowns.isNotEmpty) _hometown = _hometowns.first;
    _loadSchools();
  }

  @override
  void dispose() {
    _nameController.dispose();
    _heightController.dispose();
    _weightController.dispose();
    _jerseyController.dispose();
    super.dispose();
  }

  Future<void> _loadSchools() async {
    try {
      final path = await resolveContentDbPath();
      final schools = await listHsSchoolDetails(contentDbPath: path);
      setState(() {
        _contentDbPath = path;
        _schools = schools;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loadError = '$e';
        _loading = false;
      });
    }
  }

  /// 8권역(§3-1) 순서 그대로 그룹핑 — 순서는 `hometownRegionNames()`와
  /// 동일한 엔진 상수(`HOMETOWN_REGIONS`)를 그대로 재사용. 권역 안에서는
  /// 별점 내림차순(대화 2026-07-21).
  Map<String, List<HsSchoolDetail>> _schoolsByRegion() {
    final grouped = <String, List<HsSchoolDetail>>{};
    for (final t in _schools) {
      final region = hsRegionOf(t.region);
      grouped.putIfAbsent(region, () => []).add(t);
    }
    for (final list in grouped.values) {
      list.sort((a, b) => b.stars.compareTo(a.stars));
    }
    return grouped;
  }

  HsSchoolDetail? _schoolOf(String teamId) {
    for (final t in _schools) {
      if (t.teamId == teamId) return t;
    }
    return null;
  }

  static int _maxDayFor(int month) {
    switch (month) {
      case 4:
      case 6:
      case 9:
      case 11:
        return 30;
      case 2:
        return 28; // 생년 2010 고정(윤년 아님).
      default:
        return 31;
    }
  }

  double _parsePositive(TextEditingController c, double fallback) {
    final v = double.tryParse(c.text.trim());
    return (v != null && v > 0) ? v : fallback;
  }

  int _parseJersey() {
    final v = int.tryParse(_jerseyController.text.trim());
    return (v != null && v >= 1 && v <= 99) ? v : 1;
  }

  @override
  Widget build(BuildContext context) {
    final gameState = ref.watch(gameControllerProvider);

    ref.listen(gameControllerProvider, (previous, next) {
      if (next.hasActiveGame && !(previous?.hasActiveGame ?? false)) {
        context.go('/game');
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('캐릭터 생성')),
      body: _loading
          ? const LoadingIndicator()
          : _loadError != null
          ? Center(child: Text('content.db 로드 실패: $_loadError'))
          : AnimatedSwitcher(
              duration: const Duration(milliseconds: 200),
              child: switch (_page) {
                0 => KeyedSubtree(key: const ValueKey('personal'), child: _buildPersonalPage()),
                1 => KeyedSubtree(key: const ValueKey('baseball'), child: _buildBaseballPage()),
                _ => KeyedSubtree(key: ValueKey('school:$_selectedRegion'), child: _buildSchoolPage(gameState)),
              },
            ),
    );
  }

  Widget _buildPersonalPage() {
    final maxDay = _maxDayFor(_birthMonth);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('개인 신체', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 16),
          TextField(controller: _nameController, decoration: const InputDecoration(labelText: '이름')),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: _birthMonth,
                  decoration: const InputDecoration(labelText: '생일(월)'),
                  items: [for (var m = 1; m <= 12; m++) DropdownMenuItem(value: m, child: Text('$m월'))],
                  onChanged: (v) => setState(() {
                    _birthMonth = v ?? _birthMonth;
                    if (_birthDay > _maxDayFor(_birthMonth)) _birthDay = _maxDayFor(_birthMonth);
                  }),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: DropdownButtonFormField<int>(
                  initialValue: _birthDay,
                  decoration: const InputDecoration(labelText: '생일(일)'),
                  items: [for (var d = 1; d <= maxDay; d++) DropdownMenuItem(value: d, child: Text('$d일'))],
                  onChanged: (v) => setState(() => _birthDay = v ?? _birthDay),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          Row(
            children: [
              Expanded(
                child: TextField(
                  controller: _heightController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: '키', suffixText: 'cm'),
                ),
              ),
              const SizedBox(width: 16),
              Expanded(
                child: TextField(
                  controller: _weightController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(labelText: '몸무게', suffixText: 'kg'),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _bloodType,
            decoration: const InputDecoration(labelText: '혈액형'),
            items: _bloodTypes.map((b) => DropdownMenuItem(value: b, child: Text(b))).toList(),
            onChanged: (v) => setState(() => _bloodType = v ?? _bloodType),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _hometown,
            decoration: const InputDecoration(labelText: '출신지역'),
            items: _hometowns.map((h) => DropdownMenuItem(value: h, child: Text(h))).toList(),
            onChanged: (v) => setState(() => _hometown = v ?? _hometown),
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _jerseyController,
            keyboardType: TextInputType.number,
            decoration: const InputDecoration(labelText: '등번호', suffixText: '번'),
          ),
          const SizedBox(height: 32),
          Align(alignment: Alignment.centerRight, child: ElevatedButton(onPressed: () => setState(() => _page = 1), child: const Text('다음'))),
        ],
      ),
    );
  }

  Widget _buildBaseballPage() {
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Text('야구 정보', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _handedness,
            decoration: const InputDecoration(labelText: '투구/타격'),
            items: const [
              DropdownMenuItem(value: '우완', child: Text('우완')),
              DropdownMenuItem(value: '좌완', child: Text('좌완')),
            ],
            onChanged: (v) => setState(() => _handedness = v ?? _handedness),
          ),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _archetype,
            decoration: const InputDecoration(labelText: '투수 타입'),
            items: _archetypes.map((a) => DropdownMenuItem(value: a, child: Text(a))).toList(),
            onChanged: (v) => setState(() => _archetype = v ?? _archetype),
          ),
          const SizedBox(height: 32),
          Row(
            children: [
              OutlinedButton(onPressed: () => setState(() => _page = 0), child: const Text('이전')),
              const Spacer(),
              ElevatedButton(onPressed: () => setState(() => _page = 2), child: const Text('다음')),
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildSchoolPage(GameState gameState) {
    final grouped = _schoolsByRegion();
    final selectedName = _selectedSchoolId == null ? null : _schoolOf(_selectedSchoolId!)?.name;
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            _selectedRegion == null ? '학교 선택 — 지역' : '학교 선택 — $_selectedRegion',
            style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 18),
          ),
          if (selectedName != null) ...[
            const SizedBox(height: 4),
            Text('선택됨: $selectedName', style: Theme.of(context).textTheme.bodyMedium),
          ],
          const SizedBox(height: 16),
          Expanded(
            child: _selectedRegion == null
                ? ListView(
                    children: [
                      for (final region in [..._hometowns, hsUnknownRegion].where(grouped.containsKey))
                        Card(
                          child: ListTile(
                            title: Text(region),
                            trailing: Text('${grouped[region]!.length}개교'),
                            onTap: () => setState(() => _selectedRegion = region),
                          ),
                        ),
                    ],
                  )
                : ListView(
                    children: [
                      for (final t in grouped[_selectedRegion] ?? const <HsSchoolDetail>[])
                        Card(
                          color: t.teamId == _selectedSchoolId ? Theme.of(context).colorScheme.primaryContainer : null,
                          child: ListTile(
                            leading: CircleAvatar(backgroundColor: hsSchoolColor(t.teamId), radius: 8),
                            title: Text(t.name),
                            trailing: Text(hsStarString(t.stars.toInt())),
                            onTap: () => _openSchoolDetail(t),
                          ),
                        ),
                    ],
                  ),
          ),
          const SizedBox(height: 16),
          if (gameState.error != null) ErrorBanner(message: '오류: ${gameState.error}'),
          Row(
            children: [
              OutlinedButton(
                onPressed: gameState.busy
                    ? null
                    : () => setState(() {
                        if (_selectedRegion != null) {
                          _selectedRegion = null;
                        } else {
                          _page = 1;
                        }
                      }),
                child: const Text('이전'),
              ),
              const Spacer(),
              ElevatedButton(
                onPressed: gameState.busy || _selectedSchoolId == null || _contentDbPath == null ? null : _submit,
                child: gameState.busy ? const CircularProgressIndicator() : const Text('게임 시작'),
              ),
            ],
          ),
        ],
      ),
    );
  }

  /// "S-n" 시즌 라벨(게임 내부 실제 식별자, 엔진 쪽은 안 건드림) → 실제
  /// 연표 표시로 변환하는 순수 포맷팅. 2026년을 기준으로 역산(S-1=2025
  /// ... S-5=2021, 대화 2026-07-21) — 형식이 안 맞으면 원본 라벨 그대로.
  static const _seasonAnchorYear = 2026;

  int? _yearForSeasonLabel(String label) {
    final match = RegExp(r'^S-(\d+)$').firstMatch(label);
    if (match == null) return null;
    return _seasonAnchorYear - int.parse(match.group(1)!);
  }

  List<(int year, int rank)> _parseSeasonRanks(String json) {
    try {
      final v = jsonDecode(json);
      if (v is! Map) return const [];
      final entries = v.entries.map((e) => (_yearForSeasonLabel(e.key as String) ?? 0, (e.value as num).toInt())).toList();
      entries.sort((a, b) => a.$1.compareTo(b.$1)); // 오래된 → 최신
      return entries;
    } catch (_) {
      return const [];
    }
  }

  /// 최신순 정렬(대화 2026-07-21) — 대시보드는 "최근 성과부터" 훑어보는
  /// 용도라 최근 5시즌 그래프(오래된→최신)와는 반대 방향이 자연스럽다.
  List<(int year, String competition, String result)> _parseTitles(String json) {
    try {
      final v = jsonDecode(json);
      if (v is! List) return const [];
      final entries = v.whereType<Map>().map((m) {
        final label = m['season']?.toString();
        final year = (label == null ? null : _yearForSeasonLabel(label)) ?? 0;
        return (year, m['competition']?.toString() ?? '', m['result']?.toString() ?? '');
      }).toList();
      entries.sort((a, b) => b.$1.compareTo(a.$1));
      return entries;
    } catch (_) {
      return const [];
    }
  }

  String _formatBudget(double won) => '${(won / 100000000).toStringAsFixed(1)}억원';

  /// "학교명(지역)"만 — 설명 문구는 뺌(대화 2026-07-21, §6-44의 서사형
  /// 문구가 정보 과다라는 피드백).
  List<String> _parseRivals(String json) {
    try {
      final v = jsonDecode(json);
      if (v is! List) return const [];
      return v.whereType<Map>().map((m) {
        final withId = m['with']?.toString();
        final rival = withId == null ? null : _schoolOf(withId);
        if (rival == null) return '?';
        return '${rival.name}(${hsRegionOf(rival.region)})';
      }).toList();
    } catch (_) {
      return const [];
    }
  }

  void _openSchoolDetail(HsSchoolDetail t) {
    final ranks = _parseSeasonRanks(t.seasonRanksJson);
    final titles = _parseTitles(t.titlesJson);
    final rivals = _parseRivals(t.rivalsJson);

    showDialog<void>(
      context: context,
      builder: (context) => AlertDialog(
        title: Row(
          children: [
            CircleAvatar(backgroundColor: hsSchoolColor(t.teamId), radius: 8),
            const SizedBox(width: 8),
            Expanded(child: Text(t.name)),
          ],
        ),
        content: SizedBox(
          width: 520,
          child: SingleChildScrollView(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(t.region, style: const TextStyle(color: AppColors.textSecondary)),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(child: KpiTile(label: '별점', value: hsStarString(t.stars.toInt()))),
                    const SizedBox(width: 8),
                    Expanded(child: KpiTile(label: '연간 예산', value: _formatBudget(t.budget))),
                    const SizedBox(width: 8),
                    Expanded(child: KpiTile(label: '홈구장', value: '${t.stadiumName}(${t.parkFactor})')),
                  ],
                ),
                const SizedBox(height: 12),
                AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [const Text('최근 5시즌 순위', style: TextStyle(fontWeight: FontWeight.bold)), const SizedBox(height: 4), HsRankTrendChart(ranks: ranks)],
                  ),
                ),
                const SizedBox(height: 12),
                AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('우승 기록', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 8),
                      if (titles.isEmpty)
                        const Text('없음', style: TextStyle(color: AppColors.textSecondary))
                      else
                        for (final title in titles)
                          Padding(
                            padding: const EdgeInsets.symmetric(vertical: 2),
                            child: Row(
                              children: [
                                const Icon(Icons.emoji_events, size: 16, color: AppColors.gold),
                                const SizedBox(width: 6),
                                Text('${title.$1}년 ${title.$2} ${title.$3}'),
                              ],
                            ),
                          ),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      const Text('라이벌', style: TextStyle(fontWeight: FontWeight.bold)),
                      const SizedBox(height: 4),
                      if (rivals.isEmpty)
                        const Text('없음', style: TextStyle(color: AppColors.textSecondary))
                      else
                        for (final r in rivals) Text(r),
                    ],
                  ),
                ),
                const SizedBox(height: 12),
                AppPanel(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: const [
                      Text('선수단 · 코칭스태프', style: TextStyle(fontWeight: FontWeight.bold)),
                      SizedBox(height: 4),
                      Text(
                        '추후 공개 — 실제 선수단은 게임 시작 후 생성되고, 감독·코치 시스템은 아직 준비 중입니다.',
                        style: TextStyle(color: AppColors.textSecondary),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context), child: const Text('취소')),
          ElevatedButton(
            onPressed: () {
              setState(() => _selectedSchoolId = t.teamId);
              Navigator.pop(context);
            },
            child: const Text('확인'),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final slotPath = await newSlotPath();
    if (!mounted) return;
    await ref
        .read(gameControllerProvider.notifier)
        .startNewGame(
          contentDbPath: _contentDbPath!,
          canonicalSeed: Random().nextInt(1 << 31),
          name: _nameController.text.trim().isEmpty ? '무명' : _nameController.text.trim(),
          handedness: _handedness,
          schoolTeamId: _selectedSchoolId!,
          archetype: _archetype,
          slotPath: slotPath,
          birthMonth: _birthMonth,
          birthDay: _birthDay,
          heightCm: _parsePositive(_heightController, 175),
          weightKg: _parsePositive(_weightController, 68),
          bloodType: _bloodType,
          hometown: _hometown,
          jerseyNumber: _parseJersey(),
        );
  }
}
