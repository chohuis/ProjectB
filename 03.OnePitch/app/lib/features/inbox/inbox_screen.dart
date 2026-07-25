import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/team_names.dart';

/// [04_메시지함](../../../../04_UI기획/04_메시지함.md) — "단일 채널": 선택지
/// 없는 알림(`inbox` 테이블, `getInbox()`)과 선택지 있는 이벤트
/// (`pending_actions.type='event'`, `getPendingActions()`)를 병합해서 한
/// 화면에서 보여준다. `gameControllerProvider.pending`에만 기대지 않는
/// 이유: 그 상태는 `continueGame()`/`respond()`를 한 번이라도 호출해야
/// 채워지므로(`GameController.build() => const GameState()`), 앱을 새로
/// 열고 메시지함부터 들어가면 실제로 대기 중인 이벤트를 놓친다 — 이
/// 화면은 두 API를 직접 조회한다.
///
/// 메일함형 리디자인(대화 2026-07-22, `02.SvelteElectron`의
/// `MessagesPage.svelte` 참고, 1차 리뷰 피드백으로 2차 조정) — 카테고리는
/// 아직 없는 데이터(구단·학교 개별 발신)를 지어내지 않도록 이벤트/시스템/
/// 일반 3종으로만 나누고, 발신처·제목은 `kind`에서 파생한 정형 문구로
/// 채워 실제 메일함처럼 헤더-제목-본문이 분리되게 했다.
class InboxScreen extends ConsumerStatefulWidget {
  const InboxScreen({super.key});

  @override
  ConsumerState<InboxScreen> createState() => _InboxScreenState();
}

enum _RowKind { message, event, game }

enum _Category { event, game, system, general }

enum _Sort { newest, oldest }

({String label, Color color}) _categoryInfo(_Category c) => switch (c) {
      _Category.event => (label: '이벤트', color: AppColors.warn),
      _Category.game => (label: '경기', color: AppColors.accentStrong),
      _Category.system => (label: '시스템', color: AppColors.accent),
      _Category.general => (label: '일반', color: AppColors.gold),
    };

_Category _categoryFor(String kind) => switch (kind) {
      'event' => _Category.event,
      'game' => _Category.game,
      'injury_warning' => _Category.system,
      _ => _Category.general,
    };

// 발신처 — 사람 이름은 지어내지 않고(스키마에 코치별 발신 데이터 없음)
// 소속 부서 수준으로만 표시.
String _senderFor(String kind) => switch (kind) {
      'enrollment' => '학교',
      'callup' || 'demotion' => '구단',
      'injury_warning' => '의무팀',
      'achievement' => '기록실',
      'event' => '이벤트',
      'game' => '구단',
      _ => '시스템',
    };

// `inbox`/이벤트 둘 다 본문만 있고 별도 제목 칼럼이 없어(§06_스키마), kind
// 기준 정형 제목을 붙여 메일처럼 헤더-제목-본문을 분리한다.
String _subjectFor(String kind) => switch (kind) {
      'enrollment' => '입학 소식',
      'callup' => '콜업 통보',
      'demotion' => '강등 통보',
      'injury_warning' => '부상 경고',
      'achievement' => '기록 달성',
      'event' => '이벤트 발생',
      'game' => '경기 안내',
      _ => '알림',
    };

Color _toneColor(String tone) => switch (tone) {
      'positive' => AppColors.safe,
      'negative' => AppColors.danger,
      'mixed' => AppColors.warn,
      _ => AppColors.textSecondary,
    };

String _formatDay(int day) {
  final date = calendarDateForDay(day: day);
  return '${date.year}년 ${date.month}월 ${date.day}일';
}

class _InboxRow {
  const _InboxRow({
    required this.id,
    required this.rowKind,
    required this.kind,
    required this.day,
    required this.body,
    required this.read,
    required this.blocking,
    this.choices = const [],
    this.gameId,
    this.homeTeamId,
    this.awayTeamId,
  });

  final String id;
  final _RowKind rowKind;
  final String kind; // 원본 `inbox.kind`/이벤트는 'event' 고정 — 카테고리·제목 매핑용
  final int day;
  final String body;
  final bool read;
  final bool blocking; // pending_actions 유래 — 응답 전까지 진행을 막음
  final List<({String id, String label, String tone, String hint})> choices;

  // `_RowKind.game` 전용 — 프리게임 브리핑(`_GameScoutingSection`)이
  // `getPregameScouting`을 호출하는 데 필요한 원본 payload 필드.
  final String? gameId;
  final String? homeTeamId;
  final String? awayTeamId;

  _Category get category => _categoryFor(kind);
  String get sender => _senderFor(kind);
  String get subject => _subjectFor(kind);
}

class _InboxScreenState extends ConsumerState<InboxScreen> {
  List<_InboxRow>? _rows;
  _Category? _filter; // null == 전체
  bool _unreadOnly = false;
  _Sort _sort = _Sort.newest;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final messages = await getInbox();
    final pending = await getPendingActions();
    // 'game' 행 본문에 상대팀 이름을 넣기 위한 조회 — 팀 목록은 세션당
    // 한 번만 로드되는 캐시(`teamNamesProvider`)라 매번 불러도 부담 없음.
    final teamNames = await ref.read(teamNamesProvider.future);
    final myTeam = await getCurrentTeamInfo();

    final rows = <_InboxRow>[
      for (final m in messages)
        _InboxRow(id: m.id, rowKind: _RowKind.message, kind: m.kind, day: m.day.toInt(), body: m.body, read: m.read, blocking: false),
      for (final p in pending.where((p) => p.kind == 'event')) ..._eventRows(p),
      for (final p in pending.where((p) => p.kind == 'game')) ..._gameRows(p, teamNames, myTeam?.teamId),
    ];

    if (mounted) setState(() => _rows = rows);
  }

  Iterable<_InboxRow> _eventRows(PendingActionInfo action) sync* {
    try {
      final payload = jsonDecode(action.payloadJson) as Map<String, dynamic>;
      final choicesRaw = (payload['choices'] as List?) ?? const [];
      yield _InboxRow(
        id: action.id,
        rowKind: _RowKind.event,
        kind: 'event',
        day: action.createdDay.toInt(),
        body: payload['body']?.toString() ?? '',
        read: false,
        blocking: true,
        choices: [
          for (final c in choicesRaw)
            (
              id: (c as Map)['id']?.toString() ?? '',
              label: c['label']?.toString() ?? '',
              // 구버전 세이브(엔진이 tone/hint를 안 넣던 시절 payload) 방어.
              tone: c['tone']?.toString() ?? 'neutral',
              hint: c['hint']?.toString() ?? '',
            ),
        ],
      );
    } catch (_) {
      // payload가 예상 형태가 아니면 이 행은 목록에서 조용히 뺀다 — 게임
      // 진행 흐름(GameScreen의 폴백 뷰)에서는 여전히 응답 가능.
    }
  }

  /// 경기 진입 메시지(대화 2026-07-25 재설계) — 예전엔 `GameScreen`이
  /// 자동/수동 선택을 인라인으로 보여줬지만, 이제 그 선택 자체가 여기서
  /// 이뤄진다. 고른 뒤 매치 세션이 실제로 시작되면(`matchStep`이 채워지면)
  /// `_openMessage`가 `/game/match`로 넘긴다. 반자동 모드는 폐지(대화
  /// 2026-07-25, 07_매치_엔진.md §4)돼 자동/수동 둘만 남았다.
  Iterable<_InboxRow> _gameRows(PendingActionInfo action, Map<String, String> teamNames, String? myTeamId) sync* {
    try {
      final payload = jsonDecode(action.payloadJson) as Map<String, dynamic>;
      final home = payload['home']?.toString() ?? '';
      final away = payload['away']?.toString() ?? '';
      final isHome = myTeamId != null && home == myTeamId;
      final opponentId = isHome ? away : home;
      final opponentName = teamNames[opponentId] ?? opponentId;
      yield _InboxRow(
        id: action.id,
        rowKind: _RowKind.game,
        kind: 'game',
        day: action.createdDay.toInt(),
        body: 'vs $opponentName (${isHome ? '홈' : '원정'}) — 경기 진행 방식을 선택하세요.',
        read: false,
        blocking: true,
        choices: const [
          (id: '자동', label: '자동 진행', tone: 'neutral', hint: 'AI가 경기를 전부 진행합니다'),
          (id: '수동', label: '수동 플레이', tone: 'neutral', hint: '매 구 직접 결정합니다'),
        ],
        gameId: payload['game_id']?.toString(),
        homeTeamId: home,
        awayTeamId: away,
      );
    } catch (_) {
      // payload가 예상 형태가 아니면 목록에서 조용히 뺀다(_eventRows와 동일 방어).
    }
  }

  List<_InboxRow> _visibleRows(List<_InboxRow> rows) {
    var filtered = rows.toList();
    if (_unreadOnly) {
      filtered = filtered.where((r) => r.blocking || !r.read).toList();
    }
    if (_filter != null) {
      filtered = filtered.where((r) => r.category == _filter).toList();
    }

    filtered.sort((a, b) {
      if (a.blocking != b.blocking) return a.blocking ? -1 : 1;
      return _sort == _Sort.newest ? b.day.compareTo(a.day) : a.day.compareTo(b.day);
    });
    return filtered;
  }

  Future<void> _openMessage(_InboxRow row) async {
    if (row.rowKind == _RowKind.message && !row.read) {
      await markInboxRead(id: row.id);
      await _load();
    }
    if (!mounted) return;
    await showDialog<void>(
      context: context,
      builder: (_) => _MessageDetailDialog(row: row, onRespond: (choiceId) => _respond(row.id, choiceId)),
    );
    if (!mounted) return;
    // 경기 모드를 골라 매치 세션이 실제로 시작됐으면(자동/수동 둘 다
    // `resolveChoice`가 `matchStep`을 채워 돌려준다) 전용 화면으로 이동 —
    // "경기 화면 진입도 메시지로" 요청의 마지막 연결 지점.
    if (row.rowKind == _RowKind.game) {
      final step = ref.read(gameControllerProvider).matchStep;
      if (step != null) {
        context.push('/game/match');
        return;
      }
    }
    await _load();
  }

  Future<void> _respond(String actionId, String choiceId) async {
    await ref.read(gameControllerProvider.notifier).respond(actionId, choiceId);
  }

  Future<void> _markAllRead() async {
    final rows = _rows;
    if (rows == null) return;
    final unread = rows.where((r) => r.rowKind == _RowKind.message && !r.read);
    await Future.wait(unread.map((r) => markInboxRead(id: r.id)));
    await _load();
  }

  @override
  Widget build(BuildContext context) {
    final rows = _rows;
    if (rows == null) return const LoadingIndicator();

    final visible = _visibleRows(rows);
    final hasUnreadMessages = rows.any((r) => r.rowKind == _RowKind.message && !r.read);

    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(12, 12, 12, 0),
          child: _FilterBar(
            rows: rows,
            filter: _filter,
            unreadOnly: _unreadOnly,
            sort: _sort,
            canMarkAllRead: hasUnreadMessages,
            onFilterChanged: (c) => setState(() => _filter = c),
            onUnreadOnlyChanged: (v) => setState(() => _unreadOnly = v),
            onSortChanged: (s) => setState(() => _sort = s),
            onMarkAllRead: _markAllRead,
          ),
        ),
        Expanded(
          child: visible.isEmpty
              ? const Center(child: Text('메시지함이 비어 있습니다.'))
              : ListView.separated(
                  padding: const EdgeInsets.all(12),
                  itemCount: visible.length,
                  separatorBuilder: (_, _) => const SizedBox(height: 8),
                  itemBuilder: (context, i) => _InboxTile(row: visible[i], onTap: () => _openMessage(visible[i])),
                ),
        ),
      ],
    );
  }
}

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.rows,
    required this.filter,
    required this.unreadOnly,
    required this.sort,
    required this.canMarkAllRead,
    required this.onFilterChanged,
    required this.onUnreadOnlyChanged,
    required this.onSortChanged,
    required this.onMarkAllRead,
  });

  final List<_InboxRow> rows;
  final _Category? filter;
  final bool unreadOnly;
  final _Sort sort;
  final bool canMarkAllRead;
  final ValueChanged<_Category?> onFilterChanged;
  final ValueChanged<bool> onUnreadOnlyChanged;
  final ValueChanged<_Sort> onSortChanged;
  final VoidCallback onMarkAllRead;

  int _countFor(_Category? c) => c == null ? rows.length : rows.where((r) => r.category == c).length;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      color: AppColors.surfaceLow,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.center,
        children: [
          Expanded(
            child: Wrap(
              spacing: 8,
              runSpacing: 8,
              crossAxisAlignment: WrapCrossAlignment.center,
              children: [
                ChoiceChip(label: Text('전체 (${rows.length})'), selected: filter == null && !unreadOnly, onSelected: (_) {
                  onFilterChanged(null);
                  onUnreadOnlyChanged(false);
                }),
                ChoiceChip(
                  label: Text('읽지않음 (${rows.where((r) => r.blocking || !r.read).length})'),
                  selected: unreadOnly,
                  onSelected: (v) => onUnreadOnlyChanged(v),
                ),
                for (final c in _Category.values)
                  ChoiceChip(
                    label: Text('${_categoryInfo(c).label} (${_countFor(c)})'),
                    selected: filter == c,
                    onSelected: (v) => onFilterChanged(v ? c : null),
                  ),
              ],
            ),
          ),
          IconButton(
            tooltip: sort == _Sort.newest ? '최신순' : '오래된순',
            icon: Icon(sort == _Sort.newest ? Icons.arrow_downward : Icons.arrow_upward, size: 18),
            onPressed: () => onSortChanged(sort == _Sort.newest ? _Sort.oldest : _Sort.newest),
          ),
          TextButton(onPressed: canMarkAllRead ? onMarkAllRead : null, child: const Text('모두 읽음')),
        ],
      ),
    );
  }
}

class _TagChip extends StatelessWidget {
  const _TagChip({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.15),
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label, style: TextStyle(color: color, fontSize: 10, fontWeight: FontWeight.w700)),
    );
  }
}

/// 메일함형 목록 행 — 헤더(카테고리+발신처+날짜) / 제목(안읽음 점 포함) /
/// 본문 미리보기 3단 구성(참고 `MessagesPage.svelte`의 `.mail-item`).
class _InboxTile extends StatelessWidget {
  const _InboxTile({required this.row, required this.onTap});

  final _InboxRow row;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final info = _categoryInfo(row.category);
    final unread = row.blocking || !row.read;
    return Container(
      decoration: BoxDecoration(
        color: unread ? AppColors.surfaceHigh : AppColors.surface,
        border: Border.all(color: row.blocking ? AppColors.accentStrong : AppColors.border),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          borderRadius: BorderRadius.circular(8),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
            decoration: BoxDecoration(border: Border(left: BorderSide(color: info.color, width: 3))),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _TagChip(label: info.label, color: info.color),
                    const SizedBox(width: 6),
                    Text(row.sender, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text(_formatDay(row.day), style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
                  ],
                ),
                const SizedBox(height: 4),
                Row(
                  children: [
                    if (unread)
                      const Padding(
                        padding: EdgeInsets.only(right: 6),
                        child: Icon(Icons.circle, size: 7, color: AppColors.accentStrong),
                      ),
                    Expanded(
                      child: Text(
                        row.subject,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(color: AppColors.textPrimary, fontSize: 14, fontWeight: FontWeight.w700),
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 2),
                Text(row.body, maxLines: 1, overflow: TextOverflow.ellipsis, style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                if (row.blocking) ...[
                  const SizedBox(height: 6),
                  _TagChip(label: '선택 대기', color: AppColors.warn),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// 메시지 상세 — FM/OOTP류 참고(대화 2026-07-22): 큰 패널로 헤더/메타/
/// 본문/선택지를 분리하고, 선택 후에도 다이얼로그를 닫지 않고 그 안에서
/// "선택 완료" 결과를 바로 보여준다(카톡형 스낵바 알림보다 시스템 느낌).
class _MessageDetailDialog extends StatefulWidget {
  const _MessageDetailDialog({required this.row, required this.onRespond});

  final _InboxRow row;
  final Future<void> Function(String choiceId) onRespond;

  @override
  State<_MessageDetailDialog> createState() => _MessageDetailDialogState();
}

class _MessageDetailDialogState extends State<_MessageDetailDialog> {
  ({String id, String label, String tone, String hint})? _resolved;
  bool _resolving = false;

  Future<void> _choose(({String id, String label, String tone, String hint}) choice) async {
    setState(() => _resolving = true);
    await widget.onRespond(choice.id);
    if (!mounted) return;
    if (widget.row.rowKind == _RowKind.game) {
      // "선택 완료" 패널을 보여줄 필요 없이 바로 매치 화면으로 넘어간다 —
      // 다이얼로그 자신의 context로 닫아야 `_openMessage`의 `showDialog`
      // 대기가 풀리고 그 다음 라우팅 분기를 탈 수 있다.
      Navigator.pop(context);
      return;
    }
    setState(() {
      _resolving = false;
      _resolved = choice;
    });
  }

  @override
  Widget build(BuildContext context) {
    final row = widget.row;
    final info = _categoryInfo(row.category);

    // 학교 상세 팝업(`new_game_screen.dart`의 `SizedBox(width: 760, height:
    // 760)`)과 같은 고정 크기 — 메시지 길이에 따라 팝업이 들쭉날쭉해지지
    // 않도록(대화 2026-07-23) 내용과 무관하게 항상 같은 크기로 연다.
    return Dialog(
      backgroundColor: AppColors.scaffoldBg,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14), side: const BorderSide(color: AppColors.borderStrong)),
      child: SizedBox(
        width: 760,
        height: 760,
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 14, 8, 12),
              child: Row(
                children: [
                  _TagChip(label: info.label, color: info.color),
                  const SizedBox(width: 10),
                  Expanded(child: Text(row.subject, style: const TextStyle(color: AppColors.textPrimary, fontSize: 17, fontWeight: FontWeight.w700))),
                  IconButton(icon: const Icon(Icons.close, size: 18), onPressed: () => Navigator.pop(context)),
                ],
              ),
            ),
            Container(height: 1, color: AppColors.border),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: Row(
                children: [
                  Text('발신: ${row.sender}', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                  const SizedBox(width: 8),
                  const Text('·', style: TextStyle(color: AppColors.textSecondary)),
                  const SizedBox(width: 8),
                  Text(_formatDay(row.day), style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
                ],
              ),
            ),
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(row.body, style: const TextStyle(color: AppColors.textMuted, fontSize: 14, height: 1.5)),
                    if (row.rowKind == _RowKind.game && row.gameId != null && row.homeTeamId != null && row.awayTeamId != null) ...[
                      const SizedBox(height: 12),
                      _GameScoutingSection(gameId: row.gameId!, homeTeamId: row.homeTeamId!, awayTeamId: row.awayTeamId!),
                    ],
                  ],
                ),
              ),
            ),
            if (row.blocking && row.choices.isNotEmpty) ...[
              Container(height: 1, color: AppColors.border),
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 16),
                child: _resolved != null
                    ? _ResultPanel(choice: _resolved!)
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('선택지', style: TextStyle(color: AppColors.textSecondary, fontSize: 12, fontWeight: FontWeight.w600)),
                          const SizedBox(height: 8),
                          Wrap(
                            spacing: 8,
                            runSpacing: 8,
                            children: [
                              for (final choice in row.choices)
                                _ChoiceButton(choice: choice, enabled: !_resolving, onPressed: () => _choose(choice)),
                            ],
                          ),
                        ],
                      ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// 프리게임 브리핑(대화 2026-07-25) — `02.SvelteElectron`의
/// `PreGameBriefingModal.svelte` 참고, 모바일 메시지 다이얼로그 안에
/// 들어갈 만큼 축약: 상대 선발 1명 + 상위 타자 3명 + 날씨·파크팩터.
/// `getPregameScouting`이 실제 매치가 시작될 때와 같은 결정적 값(로테이션
/// 순번·시드 고정 날씨)을 미리 계산해주므로 여기서 새 판정을 하지 않는다.
class _GameScoutingSection extends StatefulWidget {
  const _GameScoutingSection({required this.gameId, required this.homeTeamId, required this.awayTeamId});

  final String gameId;
  final String homeTeamId;
  final String awayTeamId;

  @override
  State<_GameScoutingSection> createState() => _GameScoutingSectionState();
}

class _GameScoutingSectionState extends State<_GameScoutingSection> {
  late final Future<PregameScoutingInfo> _future =
      getPregameScouting(gameId: widget.gameId, homeTeamId: widget.homeTeamId, awayTeamId: widget.awayTeamId);

  @override
  Widget build(BuildContext context) {
    return FutureBuilder<PregameScoutingInfo>(
      future: _future,
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const Padding(padding: EdgeInsets.symmetric(vertical: 8), child: LoadingIndicator());
        }
        final scouting = snapshot.data!;
        return Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(color: AppColors.surfaceLow, border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                children: [
                  const Text('스카우팅 리포트', style: TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w700)),
                  const Spacer(),
                  _TagChip(label: scouting.weather, color: AppColors.accent),
                  const SizedBox(width: 6),
                  _TagChip(label: scouting.parkFactorLabel, color: AppColors.gold),
                ],
              ),
              const SizedBox(height: 10),
              const Text('상대 선발', style: TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              Text(
                '${scouting.starterName} — 구속 ${scouting.starterVelocity.round()} · 제구 ${scouting.starterControl.round()} · 구위 ${scouting.starterStuff.round()}',
                style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
              ),
              const SizedBox(height: 10),
              const Text('주의 타자', style: TextStyle(color: AppColors.textSecondary, fontSize: 11, fontWeight: FontWeight.w600)),
              const SizedBox(height: 2),
              for (final batter in scouting.topBatters)
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 1),
                  child: Text(
                    '${batter.name} — 파워 ${batter.power.round()} · 컨택 ${batter.contact.round()} · 선구 ${batter.eye.round()}',
                    style: const TextStyle(color: AppColors.textPrimary, fontSize: 13),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _ChoiceButton extends StatelessWidget {
  const _ChoiceButton({required this.choice, required this.onPressed, this.enabled = true});

  final ({String id, String label, String tone, String hint}) choice;
  final VoidCallback onPressed;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(choice.tone);
    return SizedBox(
      width: 220,
      child: OutlinedButton(
        onPressed: enabled ? onPressed : null,
        style: OutlinedButton.styleFrom(
          backgroundColor: color.withValues(alpha: 0.12),
          foregroundColor: AppColors.textPrimary,
          side: BorderSide(color: color),
          alignment: Alignment.centerLeft,
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(choice.label, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
            if (choice.hint.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(choice.hint, style: TextStyle(color: color, fontSize: 11)),
              ),
          ],
        ),
      ),
    );
  }
}

class _ResultPanel extends StatelessWidget {
  const _ResultPanel({required this.choice});

  final ({String id, String label, String tone, String hint}) choice;

  @override
  Widget build(BuildContext context) {
    final color = _toneColor(choice.tone);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: color.withValues(alpha: 0.12), border: Border.all(color: color), borderRadius: BorderRadius.circular(8)),
      child: Row(
        children: [
          Icon(Icons.check_circle, color: color, size: 18),
          const SizedBox(width: 8),
          Text(choice.label, style: const TextStyle(color: AppColors.textPrimary, fontWeight: FontWeight.w600)),
          if (choice.hint.isNotEmpty) ...[
            const Spacer(),
            Text(choice.hint, style: TextStyle(color: color, fontSize: 12)),
          ],
        ],
      ),
    );
  }
}
