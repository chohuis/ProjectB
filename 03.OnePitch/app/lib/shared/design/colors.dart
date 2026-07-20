import 'package:flutter/material.dart';

/// [02.SvelteElectron](../../../../../02.SvelteElectron) 프로토타입의
/// 다크 네이비 스포츠매니지먼트 톤을 그대로 옮긴 팔레트(`apps/ui/src/styles.css`·
/// 각 `.svelte` 컴포넌트의 실제 CSS 값에서 추출, 대화 설계 2026-07-20) —
/// Material 3 기본(둥근 라운딩+그림자 elevation) 대신 **색상 레이어링
/// (어두운 배경 위로 점점 밝아지는 패널)+얇은 테두리**로 구조를 표현하는
/// 스타일. 라이트 테마는 없음 — 참고 프로토타입 자체가 다크 전용이라
/// 이 세션은 다크 하나만 충실히 옮기는 데 집중.
class AppColors {
  AppColors._();

  // 배경 — 레이어 0(가장 어두움)부터 위로.
  static const scaffoldBg = Color(0xFF0F1522);
  static const gradientEdge = Color(0xFF203050);
  static const surfaceLow = Color(0xFF13223D); // 카드 안 중첩 박스(.action-box 등)
  static const surface = Color(0xFF161F33); // 기본 카드(.card, .kpi)
  static const surfaceHigh = Color(0xFF1C2438); // 내비 버튼(.nav button)
  static const surfaceHighest = Color(0xFF1D2840); // 아이콘 버튼·팝업

  // 테두리
  static const border = Color(0xFF2D3956);
  static const borderStrong = Color(0xFF355182);

  // 텍스트
  static const textPrimary = Color(0xFFEEF5FF);
  static const textSecondary = Color(0xFF9EB6DE);
  static const textMuted = Color(0xFFDCE5F7);

  // 강조(선택·활성 상태)
  static const accent = Color(0xFF6FA2FF);
  static const accentContainer = Color(0xFF2D3F68);
  static const accentStrong = Color(0xFF4F86E8);

  // 시맨틱(상태 표시)
  static const safe = Color(0xFF79E0A2);
  static const warn = Color(0xFFFFD78A);
  static const danger = Color(0xFFFF9B8A);
  static const dangerStrong = Color(0xFFB7242E);
  static const dangerContainer = Color(0xFF3A0C0C);
  static const gold = Color(0xFFE8A820);
  static const goldStrong = Color(0xFFB87800);
}
