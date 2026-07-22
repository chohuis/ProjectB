import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:app/src/rust/api/game.dart';
import 'package:app/features/game/game_provider.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';

/// 메시지함 탭 미확인 뱃지(I7) — [04_메시지함](../../../04_UI기획/04_메시지함.md)
/// §2 "비긴급 미확인 건수 표시". `homeSummaryProvider`(home_dashboard.dart)
/// 와 같은 관례로 `currentDay`를 키로 삼아 "진행"을 누를 때마다 다시
/// 조회되게 한다. 긴급(블로킹) 이벤트는 진행 자체가 막혀 뱃지 대상이
/// 아니다(놓칠 수가 없음) — `getInbox()`의 `!read` 건수만 센다.
final unreadInboxCountProvider = FutureProvider.family<int, int>((ref, _) async {
  final messages = await getInbox();
  return messages.where((m) => !m.read).length;
});

/// [00_개요](../../../04_UI기획/00_개요.md) §5 "반응형 원칙" — 데스크톱은
/// 사이드 내비, 모바일은 바텀 내비로 같은 목적지를 노출한다. 결정 1의
/// "▶ 진행(Continue)은 허브가 아니라 상시 고정 동작"을 문자 그대로
/// 구현하려면 Continue 버튼을 셸 레벨로 끌어올려 어느 탭에서든 눌리게
/// 해야 하는데, 그러려면 진행 결과(PendingAction 자동 진입)를 셸이
/// 대신 라우팅해야 해 훨씬 큰 리팩터가 된다 — 이번 스코프는 "진행"
/// 화면(`GameScreen`, 매치·PendingAction UI+Continue 버튼을 이미 갖고
/// 있음)을 5번째 목적지로 두는 실용적 축소판(10_구현_Phase_계획.md
/// §6-33 스코프 판단 참고). 브레이크포인트 600은 Material 컴팩트/미디엄
/// 경계를 그대로 쓴 placeholder — 문서에 정확한 수치가 없는 열린 세부.
class AppShell extends ConsumerWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  static const _destinations = [
    (path: '/game', icon: Icons.sports_baseball, label: '홈'),
    (path: '/game/my-player', icon: Icons.person, label: '내 정보'),
    (path: '/game/inbox', icon: Icons.mail_outline, label: '메시지함'),
    (path: '/game/league', icon: Icons.emoji_events, label: '리그'),
    (path: '/game/records', icon: Icons.history_edu, label: '기록'),
  ];

  static const wideBreakpoint = 600.0;

  /// 정확히 일치하는 목적지를 먼저 찾는다 — '/game'(홈)이 다른 모든
  /// 목적지의 URL 접두어라(예: '/game/my-player'), prefix 매칭만 하면
  /// '/game'이 리스트 맨 앞이라 항상 먼저 걸려서 다른 탭을 눌러도
  /// 선택 표시가 홈에 고정되는 버그가 있었다(대화 2026-07-21). exact
  /// match를 우선하고, 그래도 없을 때만(하위 라우트가 생기면 대비)
  /// prefix로 폴백한다.
  int _indexFor(String location) {
    final exact = _destinations.indexWhere((d) => location == d.path);
    if (exact >= 0) return exact;
    final prefix = _destinations.indexWhere((d) => location.startsWith('${d.path}/'));
    return prefix < 0 ? 0 : prefix;
  }

  void _onSelect(BuildContext context, int index) => context.go(_destinations[index].path);

  Widget _icon(IconData icon, int index, int unreadCount) {
    final base = Icon(icon);
    if (_destinations[index].path != '/game/inbox' || unreadCount == 0) return base;
    return Stack(
      clipBehavior: Clip.none,
      children: [
        base,
        Positioned(right: -6, top: -4, child: AppBadge(count: unreadCount)),
      ],
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final location = GoRouterState.of(context).uri.toString();
    final index = _indexFor(location);
    final wide = MediaQuery.sizeOf(context).width >= wideBreakpoint;

    final currentDay = ref.watch(gameControllerProvider.select((s) => s.meta?.currentDay.toInt()));
    final unreadCount = currentDay == null ? 0 : ref.watch(unreadInboxCountProvider(currentDay)).value ?? 0;

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            AppSidebar(destinations: _destinations, selectedIndex: index, unreadCount: unreadCount, onSelect: (i) => _onSelect(context, i)),
            const VerticalDivider(width: 1),
            Expanded(child: child),
          ],
        ),
      );
    }

    return Scaffold(
      body: child,
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => _onSelect(context, i),
        destinations: [
          for (var i = 0; i < _destinations.length; i++)
            NavigationDestination(icon: _icon(_destinations[i].icon, i, unreadCount), label: _destinations[i].label),
        ],
      ),
    );
  }
}

/// 와이드(데스크톱) 전용 사이드바 — 참고 디자인(대화 2026-07-22)의 "로고+
/// 앱이름 헤더 → 아이콘+라벨이 한 줄에, 뱃지는 오른쪽 정렬"을 재현한
/// 리스트형 레이아웃. 기존 Material `NavigationRail`(아이콘 위·라벨
/// 아래, 좁은 폭)을 대체 — 모바일 `NavigationBar`는 이미 적절한 모바일
/// 관례라 그대로 둔다. 공개 클래스인 이유: 위젯 테스트(`app_shell_widget_test.dart`)
/// 가 `find.byType`으로 이 타입을 직접 찾아야 함.
class AppSidebar extends StatelessWidget {
  const AppSidebar({super.key, required this.destinations, required this.selectedIndex, required this.unreadCount, required this.onSelect});

  final List<({String path, IconData icon, String label})> destinations;
  final int selectedIndex;
  final int unreadCount;
  final ValueChanged<int> onSelect;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 220,
      color: AppColors.surfaceHigh,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Padding(
            padding: EdgeInsets.fromLTRB(16, 20, 16, 16),
            child: Row(
              children: [
                Icon(Icons.sports_baseball, color: AppColors.accent),
                SizedBox(width: 10),
                Text('OnePitch', style: TextStyle(color: AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.bold)),
              ],
            ),
          ),
          const Divider(height: 1),
          const SizedBox(height: 8),
          for (var i = 0; i < destinations.length; i++)
            _SidebarItem(
              icon: destinations[i].icon,
              label: destinations[i].label,
              selected: i == selectedIndex,
              badgeCount: destinations[i].path == '/game/inbox' ? unreadCount : 0,
              onTap: () => onSelect(i),
            ),
        ],
      ),
    );
  }
}

class _SidebarItem extends StatelessWidget {
  const _SidebarItem({required this.icon, required this.label, required this.selected, required this.badgeCount, required this.onTap});

  final IconData icon;
  final String label;
  final bool selected;
  final int badgeCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final color = selected ? AppColors.accent : AppColors.textSecondary;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(8),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: selected ? AppColors.accentContainer : Colors.transparent, borderRadius: BorderRadius.circular(8)),
        child: Row(
          children: [
            Icon(icon, color: color, size: 20),
            const SizedBox(width: 12),
            Expanded(child: Text(label, style: TextStyle(color: color, fontSize: 13, fontWeight: selected ? FontWeight.w600 : FontWeight.normal))),
            if (badgeCount > 0) AppBadge(count: badgeCount),
          ],
        ),
      ),
    );
  }
}
