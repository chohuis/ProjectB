import 'package:flutter/material.dart';

import 'colors.dart';

/// 프로토타입의 `.card`/`.action-box` — `Card`의 그림자 기반 elevation
/// 대신 배경색+얇은 테두리로 구조를 표현하는 패널. 화면 곳곳의 임의
/// `Container`/`Card`를 이걸로 통일.
class AppPanel extends StatelessWidget {
  const AppPanel({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(12),
    this.color,
    this.borderColor,
    this.borderRadius = 10,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color? color;
  final Color? borderColor;
  final double borderRadius;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color ?? AppColors.surface,
        border: Border.all(color: borderColor ?? AppColors.border),
        borderRadius: BorderRadius.circular(borderRadius),
      ),
      child: child,
    );
  }
}

/// 프로토타입의 `.badge`/`.badge-gold`/`.badge-red` — 알림 개수 표시용
/// 작은 pill. 지금 당장 배지가 필요한 화면은 없지만(메시지함이 아직
/// placeholder라 읽지 않은 개수 자체가 없음) 나중에 붙일 자리를
/// 미리 통일해둠.
class AppBadge extends StatelessWidget {
  const AppBadge({super.key, required this.count, this.color = AppColors.accentStrong});

  final int count;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final label = count > 99 ? '99+' : '$count';
    return Container(
      constraints: const BoxConstraints(minWidth: 20, minHeight: 20),
      padding: const EdgeInsets.symmetric(horizontal: 6),
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, borderRadius: BorderRadius.circular(999)),
      child: Text(label, style: const TextStyle(color: AppColors.textPrimary, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}

/// 프로토타입의 `.kpi` — 라벨+큰 숫자 통계 타일(`HomeDashboard.svelte`
/// 상단 KPI 행). 진행 화면 상태바·내 선수 요약 등 "숫자 하나를 크게
/// 보여주는" 자리에 공통으로 씀.
class KpiTile extends StatelessWidget {
  const KpiTile({super.key, required this.label, required this.value, this.valueColor});

  final String label;
  final String value;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    return AppPanel(
      color: AppColors.surfaceLow,
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(label, style: const TextStyle(color: AppColors.textSecondary, fontSize: 11)),
          const SizedBox(height: 3),
          Text(value, style: TextStyle(color: valueColor ?? AppColors.textPrimary, fontSize: 16, fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}
