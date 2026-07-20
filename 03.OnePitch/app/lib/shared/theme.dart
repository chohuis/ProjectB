import 'package:flutter/material.dart';

/// "그라운드 그린" 테마(대화 설계 2026-07-20) — 야구장 잔디를 연상시키는
/// 초록을 시드로 Material 3 `ColorScheme.fromSeed`를 돌려 라이트/다크
/// 둘 다 자동으로 파생시킨다. 세부 톤(팀 컬러 연동 등)은 여전히 열린
/// 세부 — 이번엔 "기본 Material 느낌"부터 벗어나는 최소 투자.
const _groundGreen = Color(0xFF2E6B2E);

ThemeData onePitchTheme(Brightness brightness) {
  final colorScheme = ColorScheme.fromSeed(seedColor: _groundGreen, brightness: brightness);
  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: colorScheme.surface,
    appBarTheme: AppBarTheme(
      backgroundColor: colorScheme.primaryContainer,
      foregroundColor: colorScheme.onPrimaryContainer,
      elevation: 0,
    ),
    cardTheme: CardThemeData(
      elevation: 1,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: colorScheme.surfaceContainer,
      indicatorColor: colorScheme.primaryContainer,
      selectedIconTheme: IconThemeData(color: colorScheme.onPrimaryContainer),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: colorScheme.surfaceContainer,
      indicatorColor: colorScheme.primaryContainer,
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10))),
    ),
    chipTheme: ChipThemeData(
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      side: BorderSide.none,
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
    ),
  );
}
