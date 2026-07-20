import 'package:go_router/go_router.dart';
import 'package:app/features/main_menu/main_menu_screen.dart';
import 'package:app/features/new_game/new_game_screen.dart';
import 'package:app/features/game/game_screen.dart';
import 'package:app/features/my_player/my_player_screen.dart';
import 'package:app/features/league/league_screen.dart';
import 'package:app/features/records/records_screen.dart';

/// 4허브·전용화면은 하나씩 추가되는 중 — 지금은 메인메뉴·뉴게임·진행/매치·
/// 내 선수 허브뿐. 종합 내비게이션 셸(사이드/바텀 내비)은 반응형 레이아웃
/// 서브분에서 한 번에 정리할 예정이라, 그때까진 각 화면이 직접
/// `context.go`로 이동. 루트(`/`)는 I7 9차분부터 뉴게임 폼이 아니라
/// 슬롯 목록(메인 메뉴) — 은퇴 화면의 "메인 메뉴로 복귀"(§4-1)가 가리키는
/// 곳도 바로 여기다.
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const MainMenuScreen()),
    GoRoute(path: '/new-game', builder: (context, state) => const NewGameScreen()),
    GoRoute(path: '/game', builder: (context, state) => const GameScreen()),
    GoRoute(path: '/game/my-player', builder: (context, state) => const MyPlayerScreen()),
    GoRoute(path: '/game/league', builder: (context, state) => const LeagueScreen()),
    GoRoute(path: '/game/records', builder: (context, state) => const RecordsScreen()),
  ],
);
