import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/content_db.dart';
import 'package:app/shared/slot_paths.dart';
import 'package:app/src/rust/api/game.dart';

/// [08_은퇴](../../../04_UI기획/08_은퇴.md) §4-1 "확인 후 메인 메뉴로
/// 복귀" — 은퇴든 앱 최초 실행이든 이 화면(루트 라우트)이 종착점.
/// [02_데이터](../../../03_설계/02_데이터.md) §4 슬롯 수명주기(I7 9차분) —
/// 기존 슬롯 "이어하기" 목록 + "새로 시작"(캐릭터 생성 폼으로 이동).
class MainMenuScreen extends ConsumerStatefulWidget {
  /// `slotsDirectoryResolver`·`contentDbPathResolver`는 기본적으로
  /// `resolveSlotsDirectory`/`resolveContentDbPath`(둘 다 실제 앱 데이터
  /// 폴더, `path_provider` 필요)를 쓴다 — `flutter test` 환경엔 그
  /// 플러그인이 없어(`MissingPluginException`), 위젯 테스트는 이 생성자
  /// 파라미터로 순수 임시 경로를 주입한다.
  const MainMenuScreen({super.key, this.slotsDirectoryResolver = resolveSlotsDirectory, this.contentDbPathResolver = resolveContentDbPath});

  final Future<Directory> Function() slotsDirectoryResolver;
  final Future<String> Function() contentDbPathResolver;

  @override
  ConsumerState<MainMenuScreen> createState() => _MainMenuScreenState();
}

class _MainMenuScreenState extends ConsumerState<MainMenuScreen> {
  List<SlotSummary> _slots = const [];
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadSlots();
  }

  Future<void> _loadSlots() async {
    setState(() => _loading = true);
    try {
      final dir = await widget.slotsDirectoryResolver();
      final slots = await listSlots(dir: dir.path);
      if (!mounted) return;
      setState(() {
        _slots = slots;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = '$e';
        _loading = false;
      });
    }
  }

  Future<void> _continueSlot(SlotSummary slot) async {
    final contentDbPath = await widget.contentDbPathResolver();
    final ok = await ref.read(gameControllerProvider.notifier).openSlot(slotPath: slot.path, contentDbPath: contentDbPath);
    if (ok && mounted) context.go('/game');
  }

  Future<void> _deleteSlot(SlotSummary slot) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        title: const Text('슬롯을 삭제하시겠습니까?'),
        content: Text('"${slot.name}" 세이브가 영구히 삭제됩니다.'),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
          TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('삭제')),
        ],
      ),
    );
    if (confirmed == true) {
      await deleteSlot(slotPath: slot.path);
      await _loadSlots();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('OnePitch')),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (_error != null) Text('슬롯 목록을 불러오지 못했습니다: $_error', style: const TextStyle(color: Colors.red)),
                  Text('이어하기', style: Theme.of(context).textTheme.titleMedium),
                  const SizedBox(height: 8),
                  Expanded(
                    child: _slots.isEmpty
                        ? const Center(child: Text('저장된 세이브가 없습니다.'))
                        : ListView(
                            children: [
                              for (final slot in _slots)
                                Card(
                                  child: ListTile(
                                    title: Text(slot.name),
                                    subtitle: Text('Day ${slot.currentDay} · 시즌 ${slot.season}${slot.retired ? ' · 은퇴' : ''}'),
                                    onTap: () => _continueSlot(slot),
                                    trailing: IconButton(icon: const Icon(Icons.delete_outline), onPressed: () => _deleteSlot(slot)),
                                  ),
                                ),
                            ],
                          ),
                  ),
                  const SizedBox(height: 8),
                  SizedBox(width: double.infinity, child: ElevatedButton(onPressed: () => context.push('/new-game'), child: const Text('새로 시작'))),
                ],
              ),
            ),
    );
  }
}
