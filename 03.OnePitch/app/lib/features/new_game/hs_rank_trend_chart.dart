import 'dart:math' show min, max;

import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';

/// 학교 선택 상세 다이얼로그의 "최근 5시즌 순위" — 텍스트 나열 대신
/// 미니 라인차트로(대화 2026-07-21). `match_visuals.dart`의 다이아몬드·
/// 존그리드와 같은 CustomPainter 패턴을 재사용 — 서드파티 차트 라이브러리
/// 없이 점 5개짜리 선 하나만 그리면 충분해서 새 의존성을 안 들인다.
/// Y축은 순위를 반전(1위가 위)해서 "위로 갈수록 좋다"는 직관을 살린다.
/// 위·아래에 라벨 전용 여백(`_topLabelSpace`/`_bottomLabelSpace`)을 따로
/// 잡아둬야 1위(맨 위) 점의 "n위" 라벨이 패널 상단에 안 잘린다(첫
/// 구현에서 겹쳐 보이던 버그 수정, 대화 2026-07-21).
class HsRankTrendChart extends StatelessWidget {
  const HsRankTrendChart({super.key, required this.ranks});

  final List<(int year, int rank)> ranks;

  @override
  Widget build(BuildContext context) {
    if (ranks.isEmpty) {
      return const SizedBox(height: 100, child: Center(child: Text('기록 없음', style: TextStyle(color: AppColors.textSecondary))));
    }
    return SizedBox(height: 110, width: double.infinity, child: CustomPaint(painter: _RankTrendPainter(ranks: ranks)));
  }
}

class _RankTrendPainter extends CustomPainter {
  _RankTrendPainter({required this.ranks});
  final List<(int year, int rank)> ranks;

  static const _topLabelSpace = 20.0;
  static const _bottomLabelSpace = 18.0;

  @override
  void paint(Canvas canvas, Size size) {
    final chartHeight = size.height - _topLabelSpace - _bottomLabelSpace;
    final minRank = ranks.map((r) => r.$2).reduce(min).toDouble();
    final maxRank = ranks.map((r) => r.$2).reduce(max).toDouble();
    final range = maxRank - minRank < 1 ? 1.0 : maxRank - minRank;

    double xFor(int i) => ranks.length == 1 ? size.width / 2 : size.width * i / (ranks.length - 1);
    double yFor(int rank) => _topLabelSpace + (rank - minRank) / range * chartHeight;

    final linePaint = Paint()
      ..color = AppColors.accent
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final path = Path();
    for (var i = 0; i < ranks.length; i++) {
      final p = Offset(xFor(i), yFor(ranks[i].$2));
      if (i == 0) {
        path.moveTo(p.dx, p.dy);
      } else {
        path.lineTo(p.dx, p.dy);
      }
    }
    canvas.drawPath(path, linePaint);

    for (var i = 0; i < ranks.length; i++) {
      final (year, rank) = ranks[i];
      final p = Offset(xFor(i), yFor(rank));
      canvas.drawCircle(p, 3.5, Paint()..color = AppColors.accent);

      final rankPainter = TextPainter(
        text: TextSpan(text: '$rank위', style: const TextStyle(color: AppColors.textPrimary, fontSize: 10)),
        textDirection: TextDirection.ltr,
      )..layout();
      rankPainter.paint(canvas, Offset(p.dx - rankPainter.width / 2, p.dy - rankPainter.height - 6));

      final yearPainter = TextPainter(
        text: TextSpan(text: '$year', style: const TextStyle(color: AppColors.textSecondary, fontSize: 10)),
        textDirection: TextDirection.ltr,
      )..layout();
      yearPainter.paint(canvas, Offset(p.dx - yearPainter.width / 2, size.height - _bottomLabelSpace + 4));
    }
  }

  @override
  bool shouldRepaint(covariant _RankTrendPainter oldDelegate) => oldDelegate.ranks != ranks;
}
