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

/// 캐릭터 생성 — [06_캐릭터생성](../../../../04_UI기획/06_캐릭터생성.md) 7단계를
/// 이번 서브분은 2페이지(개인 신체 → 야구 정보)로 압축했다(지역별 학교
/// 브라우징·2구종 선택 단계는 그 문서 자체가 "열린 세부 — 아트 단계"로
/// 이미 미뤄둔 항목이라 뒤로 미룸). 1페이지(개인 신체 — 이름·생일·키·
/// 몸무게·혈액형·출신지역·등번호)는 시뮬레이션에 쓰이지 않는 순수 표시용
/// 플레이버 데이터(대화 2026-07-20)라 `newGame` 직후 `setProtagonistProfile`
/// 로 별도 저장된다.
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
  String? _contentDbPath;
  List<TeamOption> _schools = [];
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
      final schools = await listHsTeams(contentDbPath: path);
      setState(() {
        _contentDbPath = path;
        _schools = schools;
        _selectedSchoolId = schools.isNotEmpty ? schools.first.teamId : null;
        _loading = false;
      });
    } catch (e) {
      setState(() {
        _loadError = '$e';
        _loading = false;
      });
    }
  }

  String _schoolLabel(TeamOption t) {
    try {
      final meta = jsonDecode(t.metaJson);
      final name = meta is Map ? meta['name'] : null;
      return '${name ?? t.teamId} (${t.philosophy}·${t.resource}·${t.status})';
    } catch (_) {
      return '${t.teamId} (${t.philosophy}·${t.resource}·${t.status})';
    }
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
              child: _page == 0
                  ? KeyedSubtree(key: const ValueKey('personal'), child: _buildPersonalPage())
                  : KeyedSubtree(key: const ValueKey('baseball'), child: _buildBaseballPage(gameState)),
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

  Widget _buildBaseballPage(GameState gameState) {
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
          const SizedBox(height: 16),
          DropdownButtonFormField<String>(
            initialValue: _selectedSchoolId,
            decoration: const InputDecoration(labelText: '학교 (고교 리그)'),
            items: _schools.map((t) => DropdownMenuItem(value: t.teamId, child: Text(_schoolLabel(t)))).toList(),
            onChanged: (v) => setState(() => _selectedSchoolId = v),
          ),
          const SizedBox(height: 32),
          if (gameState.error != null) ErrorBanner(message: '오류: ${gameState.error}'),
          Row(
            children: [
              OutlinedButton(onPressed: gameState.busy ? null : () => setState(() => _page = 0), child: const Text('이전')),
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
