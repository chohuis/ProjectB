import 'package:go_router/go_router.dart';
import 'package:app/features/new_game/new_game_screen.dart';
import 'package:app/features/game/game_screen.dart';

/// I7 1차분 라우트 2개뿐 — 4허브·전용화면은 후속 서브분에서 추가.
final appRouter = GoRouter(
  initialLocation: '/',
  routes: [
    GoRoute(path: '/', builder: (context, state) => const NewGameScreen()),
    GoRoute(path: '/game', builder: (context, state) => const GameScreen()),
  ],
);
