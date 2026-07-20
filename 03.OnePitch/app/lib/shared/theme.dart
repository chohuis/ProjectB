import 'package:flutter/material.dart';

import 'design/colors.dart';

/// [02.SvelteElectron](../../../../02.SvelteElectron) 프로토타입의 다크
/// 네이비 톤을 그대로 옮긴 테마(대화 설계 2026-07-20) — "그라운드 그린"
/// `ColorScheme.fromSeed` 1차 시도를 대체. Material 3 기본 라운딩+그림자
/// elevation 대신 색상 레이어링+얇은 테두리로 구조를 표현하는 그
/// 프로토타입 스타일을 재현한다. 참고 대상 자체가 다크 전용이라 이
/// 테마도 다크 하나뿐(라이트 변형은 없음, `main.dart`가 `ThemeMode.dark`
/// 로 고정).
ThemeData onePitchTheme() {
  const colorScheme = ColorScheme.dark(
    surface: AppColors.scaffoldBg,
    onSurface: AppColors.textPrimary,
    surfaceContainerLowest: AppColors.scaffoldBg,
    surfaceContainerLow: AppColors.surfaceLow,
    surfaceContainer: AppColors.surface,
    surfaceContainerHigh: AppColors.surfaceHigh,
    surfaceContainerHighest: AppColors.surfaceHighest,
    primary: AppColors.accent,
    onPrimary: AppColors.textPrimary,
    primaryContainer: AppColors.accentContainer,
    onPrimaryContainer: AppColors.textPrimary,
    secondary: AppColors.accentStrong,
    onSecondary: AppColors.textPrimary,
    outline: AppColors.border,
    outlineVariant: AppColors.borderStrong,
    error: AppColors.danger,
    onError: AppColors.textPrimary,
    errorContainer: AppColors.dangerContainer,
    onErrorContainer: AppColors.danger,
  );

  final panelBorder = RoundedRectangleBorder(borderRadius: BorderRadius.circular(10), side: const BorderSide(color: AppColors.border));

  return ThemeData(
    useMaterial3: true,
    colorScheme: colorScheme,
    scaffoldBackgroundColor: AppColors.scaffoldBg,
    canvasColor: AppColors.scaffoldBg,
    dividerColor: AppColors.border,
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surfaceHigh,
      foregroundColor: AppColors.textPrimary,
      elevation: 0,
      surfaceTintColor: Colors.transparent,
    ),
    cardTheme: CardThemeData(color: AppColors.surface, elevation: 0, shape: panelBorder),
    listTileTheme: const ListTileThemeData(iconColor: AppColors.textSecondary, textColor: AppColors.textPrimary),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: AppColors.surfaceHigh,
      indicatorColor: AppColors.accentContainer,
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      selectedIconTheme: const IconThemeData(color: AppColors.accent),
      unselectedIconTheme: const IconThemeData(color: AppColors.textSecondary),
      selectedLabelTextStyle: const TextStyle(color: AppColors.accent, fontSize: 12),
      unselectedLabelTextStyle: const TextStyle(color: AppColors.textSecondary, fontSize: 12),
    ),
    navigationBarTheme: NavigationBarThemeData(
      backgroundColor: AppColors.surfaceHigh,
      indicatorColor: AppColors.accentContainer,
      indicatorShape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      iconTheme: WidgetStateProperty.resolveWith(
        (states) => IconThemeData(color: states.contains(WidgetState.selected) ? AppColors.accent : AppColors.textSecondary),
      ),
      labelTextStyle: WidgetStateProperty.resolveWith(
        (states) => TextStyle(color: states.contains(WidgetState.selected) ? AppColors.accent : AppColors.textSecondary, fontSize: 11),
      ),
    ),
    elevatedButtonTheme: ElevatedButtonThemeData(
      style: ElevatedButton.styleFrom(
        backgroundColor: AppColors.accentContainer,
        foregroundColor: AppColors.textPrimary,
        elevation: 0,
        side: const BorderSide(color: AppColors.borderStrong),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(
        foregroundColor: AppColors.textPrimary,
        side: const BorderSide(color: AppColors.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
      ),
    ),
    textButtonTheme: TextButtonThemeData(style: TextButton.styleFrom(foregroundColor: AppColors.accent)),
    chipTheme: ChipThemeData(
      backgroundColor: AppColors.surfaceLow,
      side: const BorderSide(color: AppColors.border),
      labelStyle: const TextStyle(color: AppColors.textMuted, fontSize: 12),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceLow,
      labelStyle: const TextStyle(color: AppColors.textSecondary),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.border)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(8), borderSide: const BorderSide(color: AppColors.accent)),
    ),
    dividerTheme: const DividerThemeData(color: AppColors.border, thickness: 1, space: 1),
    tabBarTheme: const TabBarThemeData(
      labelColor: AppColors.accent,
      unselectedLabelColor: AppColors.textSecondary,
      indicatorColor: AppColors.accent,
    ),
    dialogTheme: DialogThemeData(backgroundColor: AppColors.surface, shape: panelBorder),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: AppColors.accent),
  );
}
