import 'package:go_router/go_router.dart';
import 'package:app/features/main_menu/main_menu_screen.dart';
import 'package:app/features/main_menu/continue_game_screen.dart';
import 'package:app/features/main_menu/new_game_slot_screen.dart';
import 'package:app/features/new_game/new_game_screen.dart';
import 'package:app/features/game/game_screen.dart';
import 'package:app/features/game/match_screen.dart';
import 'package:app/features/my_player/my_player_screen.dart';
import 'package:app/features/league/league_screen.dart';
import 'package:app/features/records/records_screen.dart';
import 'package:app/features/inbox/inbox_screen.dart';
import 'package:app/shared/app_shell.dart';

/// 루트(`/`)는 새로하기·이어하기·종료 3버튼 메인 메뉴 — 은퇴 화면의
/// "메인 메뉴로 복귀"(§4-1)가 가리키는 곳도 바로 여기다. "이어하기"의
/// 슬롯 목록은 `/continue`(`ContinueGameScreen`)로 분리돼 있다. "새로하기"도
/// 캐릭터 생성으로 바로 안 가고 `/new-game-slot`(`NewGameSlotScreen`)에서
/// 먼저 슬롯(최대 3개, `slot_paths.dart`의 `maxSlots`)을 고른 뒤
/// `/new-game`으로 그 경로를 `extra`로 넘긴다(대화 2026-07-24, 세이브
/// 슬롯 상한 도입).
/// `/game` 이하 4허브(+진행)는 `ShellRoute`로 묶여 `AppShell`(I7 10차분,
/// 반응형 사이드/바텀 내비)이 공통 셸을 그린다 — `context.go`로 형제
/// 목적지끼리 전환되므로(스택에 안 쌓임) 각 허브 화면에 뒤로가기
/// 화살표가 자동으로 안 붙는다.
/// `/game/match`는 의도적으로 `ShellRoute` **밖** — 매치는 사이드/바텀
/// 내비 없이 화면 전체를 차지하는 별도 페이지(대화 2026-07-25 재설계,
/// `02.SvelteElectron`의 `{#if activeMatchContext}` 풀스크린 전환 패턴
/// 참고). `context.push`로 진입해 스택에 쌓이므로 뒤로가기·닫기 버튼이
/// 자연스럽게 동작한다.
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const MainMenuScreen()),
    GoRoute(path: '/continue', builder: (context, state) => const ContinueGameScreen()),
    GoRoute(path: '/new-game-slot', builder: (context, state) => const NewGameSlotScreen()),
    GoRoute(path: '/new-game', builder: (context, state) => NewGameScreen(slotPath: state.extra as String)),
    GoRoute(path: '/game/match', builder: (context, state) => const MatchScreen()),
    ShellRoute(
      builder: (context, state, child) => AppShell(child: child),
      routes: [
        GoRoute(path: '/game', builder: (context, state) => const GameScreen()),
        GoRoute(path: '/game/my-player', builder: (context, state) => const MyPlayerScreen()),
        GoRoute(path: '/game/league', builder: (context, state) => const LeagueScreen()),
        GoRoute(path: '/game/records', builder: (context, state) => const RecordsScreen()),
        GoRoute(path: '/game/inbox', builder: (context, state) => const InboxScreen()),
      ],
    ),
  ],
);
