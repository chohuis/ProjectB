import 'dart:math';

import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';

/// 내 선수 "상태" 탭의 능력치 9종 시각화(대화 2026-07-21) — 축 9개짜리
/// 레이더(스파이더) 차트. `match_visuals.dart`·`hs_rank_trend_chart.dart`
/// 와 같은 CustomPainter 패턴 재사용, 새 차트 라이브러리 없음. 값은
/// 20~80 스케일([01_선수_능력치](../../../../02_기획/육성코어/01_선수_능력치.md)
/// §7)을 0~1로 정규화해서 반지름에 매핑.
class StatRadarChart extends StatelessWidget {
  const StatRadarChart({super.key, required this.stats});

  /// (라벨, 20~80 값) 9개, 축 배치 순서 그대로.
  final List<(String label, double value)> stats;

  @override
  Widget build(BuildContext context) {
    return AspectRatio(aspectRatio: 1, child: CustomPaint(painter: _RadarPainter(stats: stats)));
  }
}

class _RadarPainter extends CustomPainter {
  _RadarPainter({required this.stats});
  final List<(String label, double value)> stats;

  static const _labelMargin = 28.0;

  @override
  void paint(Canvas canvas, Size size) {
    final n = stats.length;
    if (n < 3) return;
    final center = Offset(size.width / 2, size.height / 2);
    final maxRadius = min(size.width, size.height) / 2 - _labelMargin;

    double angleFor(int i) => -pi / 2 + 2 * pi * i / n;
    Offset pointFor(int i, double radiusFraction) => center + Offset(cos(angleFor(i)), sin(angleFor(i))) * maxRadius * radiusFraction;

    final ringPaint = Paint()
      ..color = AppColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (final level in [0.25, 0.5, 0.75, 1.0]) {
      final ring = Path();
      for (var i = 0; i < n; i++) {
        final p = pointFor(i, level);
        if (i == 0) {
          ring.moveTo(p.dx, p.dy);
        } else {
          ring.lineTo(p.dx, p.dy);
        }
      }
      ring.close();
      canvas.drawPath(ring, ringPaint);
    }

    for (var i = 0; i < n; i++) {
      canvas.drawLine(center, pointFor(i, 1.0), ringPaint);
      final labelPos = center + Offset(cos(angleFor(i)), sin(angleFor(i))) * (maxRadius + 14);
      final tp = TextPainter(
        text: TextSpan(text: stats[i].$1, style: const TextStyle(fontSize: 10, color: AppColors.textSecondary)),
        textDirection: TextDirection.ltr,
      )..layout();
      tp.paint(canvas, labelPos - Offset(tp.width / 2, tp.height / 2));
    }

    final dataPath = Path();
    for (var i = 0; i < n; i++) {
      final t = ((stats[i].$2 - 20) / 60).clamp(0.0, 1.0);
      final p = pointFor(i, t);
      if (i == 0) {
        dataPath.moveTo(p.dx, p.dy);
      } else {
        dataPath.lineTo(p.dx, p.dy);
      }
    }
    dataPath.close();
    canvas.drawPath(dataPath, Paint()..color = AppColors.accent.withValues(alpha: 0.25));
    canvas.drawPath(
      dataPath,
      Paint()
        ..color = AppColors.accent
        ..style = PaintingStyle.stroke
        ..strokeWidth = 2,
    );
  }

  @override
  bool shouldRepaint(covariant _RadarPainter oldDelegate) => oldDelegate.stats != stats;
}
