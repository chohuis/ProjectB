import 'package:go_router/go_router.dart';
import 'package:app/features/new_game/new_game_screen.dart';
import 'package:app/features/game/game_screen.dart';
import 'package:app/features/my_player/my_player_screen.dart';
import 'package:app/features/league/league_screen.dart';

/// 4허브·전용화면은 하나씩 추가되는 중 — 지금은 뉴게임·진행/매치·내 선수
/// 허브뿐. 종합 내비게이션 셸(사이드/바텀 내비)은 반응형 레이아웃
/// 서브분에서 한 번에 정리할 예정이라, 그때까진 각 화면이 직접
/// `context.go`로 이동.
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const NewGameScreen()),
    GoRoute(path: '/game', builder: (context, state) => const GameScreen()),
    GoRoute(path: '/game/my-player', builder: (context, state) => const MyPlayerScreen()),
    GoRoute(path: '/game/league', builder: (context, state) => const LeagueScreen()),
  ],
);
