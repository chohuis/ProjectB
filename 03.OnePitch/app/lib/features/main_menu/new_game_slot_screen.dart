import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import 'package:app/shared/slot_paths.dart';
import 'package:app/shared/error_banner.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/src/rust/api/game.dart';

/// "새로하기" — 캐릭터 생성으로 바로 들어가지 않고 먼저 슬롯([maxSlots]개
/// 고정)을 고르게 한다(대화 2026-07-24, "슬롯이 무한정 늘어난다"는 지적
/// 계기). `ContinueGameScreen`과 같은 결이지만 목록이 항상 정확히
/// [maxSlots]행 — 비어 있으면 바로 캐릭터 생성으로, 이미 세이브가 있으면
/// 덮어쓰기 확인 후 캐릭터 생성으로 넘어간다.
class NewGameSlotScreen extends StatefulWidget {
  /// `slotsDirectoryResolver`는 기본적으로 `resolveSlotsDirectory`(실제
  /// 앱 데이터 폴더, `path_provider` 필요)를 쓴다 — `flutter test` 환경엔
  /// 그 플러그인이 없어(`MissingPluginException`), 위젯 테스트는 이
  /// 생성자 파라미터로 순수 임시 경로를 주입한다(`ContinueGameScreen`과
  /// 같은 패턴).
  const NewGameSlotScreen({super.key, this.slotsDirectoryResolver = resolveSlotsDirectory});

  final Future<Directory> Function() slotsDirectoryResolver;

  @override
  State<NewGameSlotScreen> createState() => _NewGameSlotScreenState();
}

class _NewGameSlotScreenState extends State<NewGameSlotScreen> {
  List<SlotSummary?>? _slots; // index i == 슬롯 (i+1), null이면 빈 슬롯
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
      final existing = await listSlots(dir: dir.path);
      final slots = <SlotSummary?>[];
      for (var i = 1; i <= maxSlots; i++) {
        final path = slotPathForIndex(dir, i);
        SlotSummary? match;
        for (final s in existing) {
          if (s.path == path) {
            match = s;
            break;
          }
        }
        slots.add(match);
      }
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

  Future<void> _pickSlot(int index, SlotSummary? existing) async {
    final dir = await widget.slotsDirectoryResolver();
    final path = slotPathForIndex(dir, index);
    if (existing != null) {
      if (!mounted) return;
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('슬롯을 덮어쓰시겠습니까?'),
          content: Text('"${existing.name}" 세이브가 사라지고 새 캐릭터를 만듭니다.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('취소')),
            TextButton(onPressed: () => Navigator.pop(context, true), child: const Text('덮어쓰기')),
          ],
        ),
      );
      if (confirmed != true) return;
      await deleteSlot(slotPath: path);
    }
    if (!mounted) return;
    context.push('/new-game', extra: path);
  }

  @override
  Widget build(BuildContext context) {
    final slots = _slots;
    return Scaffold(
      appBar: AppBar(title: const Text('새로하기 — 슬롯 선택')),
      body: AnimatedSwitcher(
        duration: const Duration(milliseconds: 200),
        child: _loading || slots == null
            ? const LoadingIndicator(key: ValueKey('loading'))
            : Padding(
                key: const ValueKey('loaded'),
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    if (_error != null) ErrorBanner(message: '슬롯 목록을 불러오지 못했습니다: $_error'),
                    Expanded(
                      child: ListView(
                        children: [
                          for (var i = 0; i < slots.length; i++)
                            _SlotCard(index: i + 1, slot: slots[i], onTap: () => _pickSlot(i + 1, slots[i])),
                        ],
                      ),
                    ),
                  ],
                ),
              ),
      ),
    );
  }
}

class _SlotCard extends StatelessWidget {
  const _SlotCard({required this.index, required this.slot, required this.onTap});

  final int index;
  final SlotSummary? slot;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final s = slot;
    return Card(
      child: ListTile(
        title: Text('슬롯 $index'),
        subtitle: Text(s == null ? '비어 있음' : '${s.name} — Day ${s.currentDay} · 시즌 ${s.season}${s.retired ? ' · 은퇴' : ''}'),
        trailing: s == null ? const Icon(Icons.add) : const Icon(Icons.refresh),
        onTap: onTap,
      ),
    );
  }
}
