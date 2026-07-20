import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

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
class AppShell extends StatelessWidget {
  const AppShell({super.key, required this.child});
  final Widget child;

  static const _destinations = [
    (path: '/game', icon: Icons.sports_baseball, label: '진행'),
    (path: '/game/my-player', icon: Icons.person, label: '내 선수'),
    (path: '/game/league', icon: Icons.emoji_events, label: '리그'),
    (path: '/game/records', icon: Icons.history_edu, label: '기록'),
    (path: '/game/inbox', icon: Icons.mail_outline, label: '메시지함'),
  ];

  static const wideBreakpoint = 600.0;

  int _indexFor(String location) {
    final i = _destinations.indexWhere((d) => location == d.path || location.startsWith('${d.path}/'));
    return i < 0 ? 0 : i;
  }

  void _onSelect(BuildContext context, int index) => context.go(_destinations[index].path);

  @override
  Widget build(BuildContext context) {
    final location = GoRouterState.of(context).uri.toString();
    final index = _indexFor(location);
    final wide = MediaQuery.sizeOf(context).width >= wideBreakpoint;

    if (wide) {
      return Scaffold(
        body: Row(
          children: [
            NavigationRail(
              selectedIndex: index,
              onDestinationSelected: (i) => _onSelect(context, i),
              labelType: NavigationRailLabelType.all,
              destinations: [for (final d in _destinations) NavigationRailDestination(icon: Icon(d.icon), label: Text(d.label))],
            ),
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
        destinations: [for (final d in _destinations) NavigationDestination(icon: Icon(d.icon), label: d.label)],
      ),
    );
  }
}
