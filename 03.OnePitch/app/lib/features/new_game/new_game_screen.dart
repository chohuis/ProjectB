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

String _formatBudget(double won) => '${(won / 100000000).toStringAsFixed(1)}억원';

/// 캐릭터 생성 — [06_캐릭터생성](../../../../04_UI기획/06_캐릭터생성.md) 7단계를
/// 이번 서브분은 3페이지(개인 신체 → 투수 정보 → 학교 선택)로 압축했다
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
/// 라이벌·예산(KpiTile)·"로스터" 탭(`_SchoolRosterTab`, 실제 게임 시작 후
/// 나올 로스터를 `_worldSeed`로 미리 계산해서 보여줌, 대화 2026-07-23).
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

  // 투수 정보
  String _handedness = '우완';
  String _archetype = '강속구형';
  final List<PitcherArchetypeInfo> _archetypeInfo = pitcherArchetypeInfo();
  final List<String> _exposedStats = exposedStatNames();

  // 학교 선택(지역 → 학교 → 상세 확인)
  String? _contentDbPath;
  List<HsSchoolDetail> _schools = [];
  String? _selectedRegion;
  String? _selectedSchoolId;
  bool _loading = true;
  String? _loadError;

  // 캐릭터 생성 화면 진입 시 한 번만 확정(대화 2026-07-23) — 학교 로스터
  // 미리보기(`_SchoolRosterTab`)와 실제 `_submit()`이 같은 시드를 써야
  // 미리 보여준 로스터와 실제 시작 후 로스터가 정확히 일치한다.
  late final int _worldSeed;

  @override
  void initState() {
    super.initState();
    _worldSeed = Random().nextInt(1 << 31);
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
          const Text('투수 정보', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 18)),
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _handedness,
            decoration: const InputDecoration(labelText: '투구'),
            items: const [
              DropdownMenuItem(value: '우완', child: Text('우완')),
              DropdownMenuItem(value: '좌완', child: Text('좌완')),
            ],
            onChanged: (v) => setState(() => _handedness = v ?? _handedness),
          ),
          const SizedBox(height: 16),
          const Text('투수 타입', style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
          const SizedBox(height: 8),
          IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                for (var i = 0; i < _archetypeInfo.length; i++) ...[
                  if (i > 0) const SizedBox(width: 10),
                  Expanded(
                    child: _ArchetypeCard(
                      info: _archetypeInfo[i],
                      exposedStats: _exposedStats,
                      selected: _archetype == _archetypeInfo[i].name,
                      onTap: () => setState(() => _archetype = _archetypeInfo[i].name),
                    ),
                  ),
                ],
              ],
            ),
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
          width: 760,
          height: 760,
          child: DefaultTabController(
            length: 2,
            child: Column(
              children: [
                const TabBar(tabs: [Tab(text: '기본'), Tab(text: '로스터')]),
                const SizedBox(height: 12),
                Expanded(
                  child: TabBarView(
                    children: [
                      _SchoolBasicTab(school: t, ranks: ranks, titles: titles, rivals: rivals),
                      _SchoolRosterTab(contentDbPath: _contentDbPath!, worldSeed: _worldSeed, teamId: t.teamId),
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
          canonicalSeed: _worldSeed,
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

/// 학교 상세 다이얼로그 "기본" 탭 — 최근성적·우승기록·라이벌·예산·구장.
/// 로스터는 별 탭(`_SchoolRosterTab`)으로 분리(대화 2026-07-21) — 한
/// 화면에 다 몰아넣으면 스크롤이 생겨 "드래그 휠"이 보이던 걸 탭으로
/// 나눠 각 탭이 다이얼로그 높이(760) 안에 다 들어오게 함. 우승기록·라이벌
/// 학교는 세로로 쌓지 않고 `IntrinsicHeight`+`Row`로 나란히 배치 —
/// 내용 개수가 학교마다 달라도 둘 중 더 큰 쪽에 자동으로 높이가
/// 맞춰지고, 세로 스택보다 전체 높이가 줄어 스크롤도 덜 생김(대화
/// 2026-07-22).
class _SchoolBasicTab extends StatelessWidget {
  const _SchoolBasicTab({required this.school, required this.ranks, required this.titles, required this.rivals});

  final HsSchoolDetail school;
  final List<(int year, int rank)> ranks;
  final List<(int year, String competition, String result)> titles;
  final List<String> rivals;

  @override
  Widget build(BuildContext context) {
    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(school.region, style: const TextStyle(color: AppColors.textSecondary)),
          const SizedBox(height: 12),
          Row(
            children: [
              Expanded(child: KpiTile(label: '별점', value: hsStarString(school.stars.toInt()), icon: Icons.star, iconColor: AppColors.gold)),
              const SizedBox(width: 8),
              Expanded(
                child: KpiTile(label: '연간 예산', value: _formatBudget(school.budget), icon: Icons.account_balance_wallet, iconColor: AppColors.safe),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: KpiTile(
                  label: '홈구장',
                  value: '${school.stadiumName}(${school.parkFactor})',
                  icon: Icons.stadium,
                  iconColor: AppColors.accent,
                ),
              ),
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
                                  Expanded(child: Text('${title.$1}년 ${title.$2} ${title.$3}')),
                                ],
                              ),
                            ),
                      ],
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: AppPanel(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Text('라이벌 학교', style: TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 4),
                        if (rivals.isEmpty) const Text('없음', style: TextStyle(color: AppColors.textSecondary)) else for (final r in rivals) Text(r),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// 스탯 JSON의 숫자 필드 평균 — "OVR"류 통합 능력치(대화 2026-07-23,
/// 상세 스탯을 두 줄로 나열하던 걸 접고 이름 옆 숫자 하나로). 이 스케일이
/// 이미 01_선수_능력치.md §7 "실제 MLB 스카우팅 스케일(20~80)과 동일
/// 관례"라 평균 반올림만으로 바로 그 스케일의 OVR이 된다 — 새 계산식
/// 필요 없음.
int _ovr(String statsJson) {
  try {
    final v = jsonDecode(statsJson);
    if (v is! Map) return 0;
    final nums = v.values.whereType<num>().toList();
    if (nums.isEmpty) return 0;
    return (nums.reduce((a, b) => a + b) / nums.length).round();
  } catch (_) {
    return 0;
  }
}

Color _ovrColor(int ovr) {
  if (ovr >= 55) return AppColors.safe;
  if (ovr >= 40) return AppColors.accent;
  return AppColors.textSecondary;
}

class _OvrBadge extends StatelessWidget {
  const _OvrBadge({required this.ovr});

  final int ovr;

  @override
  Widget build(BuildContext context) {
    final color = _ovrColor(ovr);
    return Container(
      width: 30,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color.withValues(alpha: 0.15), border: Border.all(color: color), borderRadius: BorderRadius.circular(4)),
      child: Text('$ovr', style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}

/// "로스터" 탭(대화 2026-07-23) — `_worldSeed`(캐릭터 생성 화면 진입 시
/// 고정)로 실제 게임 시작 후 생성될 로스터를 그대로 미리 계산해 보여준다
/// (`preview_hs_roster`, `generate_league_roster`와 완전히 같은 값이 나옴을
/// 엔진 테스트로 보장). 카드형 배치(리뷰 피드백 2026-07-23) — 캐릭터
/// 생성 페이지의 투수 타입 카드(`_ArchetypeCard`)와 같은 결: 왼쪽에 구단주
/// /감독/코치 카드(구단주는 이름만, 감독·코치는 이름+OVR), 오른쪽에 투수
/// /타자 카드(각각 내부 스크롤, 이름+포지션+OVR 한 줄).
class _SchoolRosterTab extends StatefulWidget {
  const _SchoolRosterTab({required this.contentDbPath, required this.worldSeed, required this.teamId});

  final String contentDbPath;
  final int worldSeed;
  final String teamId;

  @override
  State<_SchoolRosterTab> createState() => _SchoolRosterTabState();
}

class _SchoolRosterTabState extends State<_SchoolRosterTab> {
  List<RosterPlayerInfo>? _roster;

  @override
  void didUpdateWidget(covariant _SchoolRosterTab oldWidget) {
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
    final roster = await previewHsRoster(contentDbPath: widget.contentDbPath, worldSeed: widget.worldSeed, teamId: widget.teamId);
    if (mounted) setState(() => _roster = roster);
  }

  @override
  Widget build(BuildContext context) {
    final roster = _roster;
    if (roster == null) return const LoadingIndicator();
    if (roster.isEmpty) return const Center(child: Text('로스터가 없습니다.'));

    final owner = roster.where((p) => p.position == '구단주').firstOrNull;
    final manager = roster.where((p) => p.position == '감독').firstOrNull;
    final coach = roster.where((p) => p.position == '코치').firstOrNull;
    final pitchers = roster.where((p) => p.position == '선발투수' || p.position == '구원투수').toList();
    final batters = roster.where((p) => !['구단주', '감독', '코치', '선발투수', '구원투수'].contains(p.position)).toList();

    return Row(
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
                // 구단주는 상세 능력치를 안 보여줌(요청 2026-07-23) — 이름만.
                if (label != '구단주') ...[const SizedBox(width: 6), _OvrBadge(ovr: _ovr(p.statsJson))],
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
                final grade = p.age - 16; // 17~19세 = 1~3학년(대화 2026-07-23)
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          '${p.name} · ${p.position} · $grade학년',
                          style: const TextStyle(color: AppColors.textPrimary, fontSize: 11),
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                      _OvrBadge(ovr: _ovr(p.statsJson)),
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
}

/// 투수 타입 선택 카드(대화 2026-07-23, 메탈슬러그·`02.SvelteElectron`
/// 참고) — 드롭다운 대신 타입별 우세 스탯 그래프+습득 가능 구종을 보여줘
/// 고르기 전에 타입 차이를 바로 알 수 있게 함.
class _ArchetypeCard extends StatelessWidget {
  const _ArchetypeCard({required this.info, required this.exposedStats, required this.selected, required this.onTap});

  final PitcherArchetypeInfo info;
  final List<String> exposedStats;
  final bool selected;
  final VoidCallback onTap;

  // 밴드 중앙값(실제 생성값 근처)/80(전체 스케일) — 이론상 최대가 아니라
  // 실제 지표에 맞춰 막대 길이를 보정(대화 2026-07-23, 리뷰 피드백).
  // 색은 여전히 우세/중간/기타 구간 구분용으로 유지.
  ({double fraction, Color color}) _tierFor(String stat) {
    final i = exposedStats.indexOf(stat);
    final midpoint = i >= 0 && i < info.statMidpoints.length ? info.statMidpoints[i] : 0.0;
    final color = info.primaryStats.contains(stat)
        ? AppColors.accent
        : info.minorStats.contains(stat)
        ? AppColors.gold
        : AppColors.border;
    return (fraction: (midpoint / 80.0).clamp(0.0, 1.0), color: color);
  }

  // 실제로 게임 시작 시 받는 구종만(대화 2026-07-23) — 강속구/체력/돌부처형은
  // 포심 1개뿐, 제구형만 자동으로 후보 하나가 더 배정된다
  // (`create_protagonist`의 대응 규칙과 일치, engine 쪽도 함께 변경됨).
  List<String> get _actualPitches => ['포심 패스트볼', if (info.name == '제구형' && info.pitchPool.isNotEmpty) info.pitchPool.first];

  @override
  Widget build(BuildContext context) {
    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: AppPanel(
        borderColor: selected ? AppColors.accent : AppColors.border,
        color: selected ? AppColors.accentContainer : AppColors.surface,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(info.name, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.bold, fontSize: 14)),
            const SizedBox(height: 8),
            for (final stat in exposedStats)
              Padding(
                padding: const EdgeInsets.only(bottom: 3),
                child: Row(
                  children: [
                    SizedBox(width: 44, child: Text(stat, style: const TextStyle(color: AppColors.textSecondary, fontSize: 10))),
                    Expanded(
                      child: Container(
                        height: 6,
                        alignment: Alignment.centerLeft,
                        decoration: BoxDecoration(color: AppColors.surfaceLow, borderRadius: BorderRadius.circular(3)),
                        child: FractionallySizedBox(
                          widthFactor: _tierFor(stat).fraction,
                          child: Container(decoration: BoxDecoration(color: _tierFor(stat).color, borderRadius: BorderRadius.circular(3))),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            const SizedBox(height: 6),
            const Text('보유 구종', style: TextStyle(color: AppColors.textSecondary, fontSize: 10)),
            const SizedBox(height: 4),
            Wrap(
              spacing: 4,
              runSpacing: 4,
              children: [
                for (final pitch in _actualPitches)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.surfaceHigh,
                      border: Border.all(color: AppColors.border),
                      borderRadius: BorderRadius.circular(999),
                    ),
                    child: Text(pitch, style: const TextStyle(color: AppColors.textMuted, fontSize: 10)),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
