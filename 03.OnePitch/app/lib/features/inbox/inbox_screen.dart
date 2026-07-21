import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/loading_indicator.dart';

/// [04_메시지함](../../../../04_UI기획/04_메시지함.md) — "단일 채널": 선택지
/// 없는 알림(`inbox` 테이블, `getInbox()`)과 선택지 있는 이벤트
/// (`pending_actions.type='event'`, `getPendingActions()`)를 병합해서 한
/// 화면에서 보여준다. `gameControllerProvider.pending`에만 기대지 않는
/// 이유: 그 상태는 `continueGame()`/`respond()`를 한 번이라도 호출해야
/// 채워지므로(`GameController.build() => const GameState()`), 앱을 새로
/// 열고 메시지함부터 들어가면 실제로 대기 중인 이벤트를 놓친다 — 이
/// 화면은 두 API를 직접 조회한다.
class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

enum _RowKind { message, event }

class _InboxRow {
  const _InboxRow({
    required this.id,
    required this.kind,
    required this.day,
    required this.body,
    required this.read,
    required this.blocking,
    this.choices = const [],
  });

  final String id;
  final _RowKind kind;
  final int day;
  final String body;
  final bool read;
  final bool blocking; // pending_actions 유래 — 응답 전까지 진행을 막음
  final List<({String id, String label})> choices;
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  List<_InboxRow>? _rows;
  final Set<String> _expanded = {};

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final messages = await getInbox();
    final pending = await getPendingActions();

    final rows = <_InboxRow>[
      for (final m in messages)
        _InboxRow(id: m.id, kind: _RowKind.message, day: m.day.toInt(), body: m.body, read: m.read, blocking: false),
      for (final p in pending.where((p) => p.kind == 'event')) ..._eventRows(p),
    ];

    // [04_메시지함](../../../../04_UI기획/04_메시지함.md) §2 — 긴급(블로킹)
    // 최상단 고정 → 나머지 최신순.
    rows.sort((a, b) {
      if (a.blocking != b.blocking) return a.blocking ? -1 : 1;
      return b.day.compareTo(a.day);
    });

    if (mounted) setState(() => _rows = rows);
  }

  Iterable<_InboxRow> _eventRows(PendingActionInfo action) sync* {
    try {
      final payload = jsonDecode(action.payloadJson) as Map<String, dynamic>;
      final choicesRaw = (payload['choices'] as List?) ?? const [];
      yield _InboxRow(
        id: action.id,
        kind: _RowKind.event,
        day: action.createdDay.toInt(),
        body: payload['body']?.toString() ?? '',
        read: false,
        blocking: true,
        choices: [
          for (final c in choicesRaw)
            (id: (c as Map)['id']?.toString() ?? '', label: c['label']?.toString() ?? ''),
        ],
      );
    } catch (_) {
      // payload가 예상 형태가 아니면 이 행은 목록에서 조용히 뺀다 — 게임
      // 진행 흐름(GameScreen의 폴백 뷰)에서는 여전히 응답 가능.
    }
  }

  Future<void> _openMessage(_InboxRow row) async {
    setState(() => _expanded.add(row.id));
    if (row.kind == _RowKind.message && !row.read) {
      await markInboxRead(id: row.id);
      _load();
    }
  }

  Future<void> _respond(String actionId, String choiceId) async {
    await ref.read(gameControllerProvider.notifier).respond(actionId, choiceId);
    _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    if (rows == null) return const LoadingIndicator();
    if (rows.isEmpty) return const Center(child: Text('메시지함이 비어 있습니다.'));

    return ListView.separated(
      padding: const EdgeInsets.all(12),
      itemCount: rows.length,
      separatorBuilder: (_, _) => const SizedBox(height: 8),
      itemBuilder: (context, i) => _InboxTile(
        row: rows[i],
        expanded: _expanded.contains(rows[i].id),
        onTap: () => _openMessage(rows[i]),
        onChoice: (choiceId) => _respond(rows[i].id, choiceId),
      ),
    );
  }
}

class _InboxTile extends StatelessWidget {
  const _InboxTile({required this.row, required this.expanded, required this.onTap, required this.onChoice});

  final _InboxRow row;
  final bool expanded;
  final VoidCallback onTap;
  final ValueChanged<String> onChoice;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      borderColor: row.blocking ? AppColors.accentStrong : AppColors.border,
      child: InkWell(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                if (row.blocking)
                  const Padding(
                    padding: EdgeInsets.only(right: 6),
                    child: Icon(Icons.priority_high, size: 16, color: AppColors.accentStrong),
                  ),
                Expanded(
                  child: Text(
                    row.body,
                    maxLines: expanded ? null : 1,
                    overflow: expanded ? TextOverflow.visible : TextOverflow.ellipsis,
                  ),
                ),
                if (!row.blocking && !row.read)
                  const Padding(padding: EdgeInsets.only(left: 6), child: Icon(Icons.circle, size: 8, color: AppColors.accentStrong)),
                const SizedBox(width: 8),
                Text('Day ${row.day}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
              ],
            ),
            if (expanded && row.kind == _RowKind.event && row.choices.isNotEmpty) ...[
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  for (final choice in row.choices) ElevatedButton(onPressed: () => onChoice(choice.id), child: Text(choice.label)),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
