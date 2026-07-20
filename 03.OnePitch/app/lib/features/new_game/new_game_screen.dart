import 'dart:convert';
import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/content_db.dart';
import 'package:app/shared/slot_paths.dart';

/// 뉴게임 — [06_캐릭터생성](../../../../04_UI기획/06_캐릭터생성.md) 7단계를
/// 이번 서브분은 하나의 폼으로 압축했다(지역별 학교 브라우징·2구종 선택
/// 단계는 그 문서 자체가 "열린 세부 — 아트 단계"로 이미 미뤄둔 항목이라
/// 뒤로 미룸). 이름·좌우투·학교·투수 타입만 고르면 뉴게임이 실제로
/// 동작한다는 걸 증명하는 최소 슬라이스.
class NewGameScreen extends ConsumerStatefulWidget {
  const NewGameScreen({super.key});

  @override
  ConsumerState<NewGameScreen> createState() => _NewGameScreenState();
}

class _NewGameScreenState extends ConsumerState<NewGameScreen> {
  final _nameController = TextEditingController(text: '무명');
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
    _loadSchools();
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

  @override
  Widget build(BuildContext context) {
    final gameState = ref.watch(gameControllerProvider);

    ref.listen(gameControllerProvider, (previous, next) {
      if (next.hasActiveGame && !(previous?.hasActiveGame ?? false)) {
        context.go('/game');
      }
    });

    return Scaffold(
      appBar: AppBar(title: const Text('뉴게임 — 캐릭터 생성')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _loadError != null
          ? Center(child: Text('content.db 로드 실패: $_loadError'))
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TextField(controller: _nameController, decoration: const InputDecoration(labelText: '이름')),
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
                  if (gameState.error != null) Text('오류: ${gameState.error}', style: const TextStyle(color: Colors.red)),
                  ElevatedButton(
                    onPressed: gameState.busy || _selectedSchoolId == null || _contentDbPath == null
                        ? null
                        : () async {
                            final slotPath = await newSlotPath();
                            if (!context.mounted) return;
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
                                );
                          },
                    child: gameState.busy ? const CircularProgressIndicator() : const Text('게임 시작'),
                  ),
                ],
              ),
            ),
    );
  }
}
