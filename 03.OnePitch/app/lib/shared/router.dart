import 'package:go_router/go_router.dart';
import 'package:app/features/main_menu/main_menu_screen.dart';
import 'package:app/features/new_game/new_game_screen.dart';
import 'package:app/features/game/game_screen.dart';
import 'package:app/features/my_player/my_player_screen.dart';
import 'package:app/features/league/league_screen.dart';
import 'package:app/features/records/records_screen.dart';
import 'package:app/features/inbox/inbox_placeholder_screen.dart';
import 'package:app/shared/app_shell.dart';

/// 루트(`/`)는 I7 9차분부터 뉴게임 폼이 아니라 슬롯 목록(메인 메뉴) —
/// 은퇴 화면의 "메인 메뉴로 복귀"(§4-1)가 가리키는 곳도 바로 여기다.
/// `/game` 이하 4허브(+진행)는 `ShellRoute`로 묶여 `AppShell`(I7 10차분,
/// 반응형 사이드/바텀 내비)이 공통 셸을 그린다 — `context.go`로 형제
/// 목적지끼리 전환되므로(스택에 안 쌓임) 각 허브 화면에 뒤로가기
/// 화살표가 자동으로 안 붙는다.
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const MainMenuScreen()),
    GoRoute(path: '/new-game', builder: (context, state) => const NewGameScreen()),
    ShellRoute(
      builder: (context, state, child) => AppShell(child: child),
      routes: [
        GoRoute(path: '/game', builder: (context, state) => const GameScreen()),
        GoRoute(path: '/game/my-player', builder: (context, state) => const MyPlayerScreen()),
        GoRoute(path: '/game/league', builder: (context, state) => const LeagueScreen()),
        GoRoute(path: '/game/records', builder: (context, state) => const RecordsScreen()),
        GoRoute(path: '/game/inbox', builder: (context, state) => const InboxPlaceholderScreen()),
      ],
    ),
  ],
);
