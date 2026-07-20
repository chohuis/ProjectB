import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';

/// [05_매치](../../../../04_UI기획/05_매치.md) §2 "상시 경기 상황판" —
/// 다이아몬드+주자·이닝·스코어·B-S-O를 CustomPainter로 그린다. **"자동"
/// 모드 도중엔 이 위젯을 못 씀** — 엔진이 자동 모드 전체를 한 번의 호출로
/// 끝까지 시뮬레이션해 중간 스냅샷 자체가 없기 때문(엔진을 매 구·매
/// 하프이닝마다 멈추도록 재설계해야 하는 별도 스코프, 10_구현_Phase_계획.md
/// §6-31 참고) — 수동 매 구·반자동 결정적 순간(`MatchStepInfo_AwaitingPitch`)
/// 에서만 실제로 뜬다.
class MatchScoreboard extends StatelessWidget {
  const MatchScoreboard({
    super.key,
    required this.inning,
    required this.topOfInning,
    required this.outs,
    required this.bases,
    required this.homeRuns,
    required this.awayRuns,
    required this.balls,
    required this.strikes,
  });

  final int inning;
  final bool topOfInning;
  final int outs;
  final List<bool> bases;
  final int homeRuns;
  final int awayRuns;
  final int balls;
  final int strikes;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        SizedBox(width: 56, height: 56, child: CustomPaint(painter: _DiamondPainter(bases: bases))),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('${topOfInning ? '▲' : '▼'} $inning회', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary)),
              Text('원정 $awayRuns : 홈 $homeRuns', style: const TextStyle(color: AppColors.textMuted)),
              Row(
                children: [
                  Text('B$balls-S$strikes', style: const TextStyle(color: AppColors.textMuted)),
                  const SizedBox(width: 10),
                  ...List.generate(
                    3,
                    (i) => Padding(
                      padding: const EdgeInsets.only(right: 2),
                      child: Icon(Icons.circle, size: 10, color: i < outs ? AppColors.danger : AppColors.border),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _DiamondPainter extends CustomPainter {
  _DiamondPainter({required this.bases});
  final List<bool> bases; // [1루, 2루, 3루]

  bool _occupied(int i) => bases.length > i && bases[i];

  @override
  void paint(Canvas canvas, Size size) {
    final cx = size.width / 2;
    final cy = size.height / 2;
    final r = size.width / 2 * 0.85;

    final home = Offset(cx, cy + r);
    final first = Offset(cx + r, cy);
    final second = Offset(cx, cy - r);
    final third = Offset(cx - r, cy);

    final linePaint = Paint()
      ..color = AppColors.borderStrong
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2;
    final path = Path()
      ..moveTo(home.dx, home.dy)
      ..lineTo(first.dx, first.dy)
      ..lineTo(second.dx, second.dy)
      ..lineTo(third.dx, third.dy)
      ..close();
    canvas.drawPath(path, linePaint);

    void drawBase(Offset pos, bool occupied) {
      canvas.drawCircle(pos, 6, Paint()..color = occupied ? AppColors.accent : AppColors.border);
    }

    drawBase(first, _occupied(0));
    drawBase(second, _occupied(1));
    drawBase(third, _occupied(2));
    canvas.drawCircle(home, 4, Paint()..color = AppColors.textSecondary);
  }

  @override
  bool shouldRepaint(covariant _DiamondPainter oldDelegate) =>
      oldDelegate.bases.length != bases.length || List.generate(bases.length, (i) => bases[i] != oldDelegate.bases[i]).contains(true);
}

/// [05_매치](../../../../04_UI기획/05_매치.md) §4 "코스 선택: 스트라이크존
/// 3×3 그리드" — `courses`는 엔진 `Course::ALL`과 같은 행 우선(row-major)
/// 순서(위→중간→아래, 안쪽→가운데→바깥쪽)라는 전제로 그대로 3×3에 배치.
class StrikeZoneGrid extends StatelessWidget {
  const StrikeZoneGrid({super.key, required this.courses, required this.onSelect, this.enabled = true});

  final List<String> courses;
  final void Function(String course) onSelect;
  final bool enabled;

  static const _labels = {
    'HighInside': '높은 안쪽',
    'HighCenter': '높은 가운데',
    'HighOutside': '높은 바깥쪽',
    'MidInside': '중간 안쪽',
    'MidCenter': '한가운데',
    'MidOutside': '중간 바깥쪽',
    'LowInside': '낮은 안쪽',
    'LowCenter': '낮은 가운데',
    'LowOutside': '낮은 바깥쪽',
  };

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: Stack(
        children: [
          const Positioned.fill(child: CustomPaint(painter: _ZoneGridPainter())),
          Positioned.fill(
            child: GridView.count(
              crossAxisCount: 3,
              physics: const NeverScrollableScrollPhysics(),
              children: [
                for (final course in courses)
                  InkWell(
                    onTap: enabled ? () => onSelect(course) : null,
                    child: Center(
                      child: Text(_labels[course] ?? course, style: const TextStyle(fontSize: 11, color: AppColors.textMuted), textAlign: TextAlign.center),
                    ),
                  ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ZoneGridPainter extends CustomPainter {
  const _ZoneGridPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final outer = Paint()
      ..color = AppColors.borderStrong
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), outer);

    final inner = Paint()
      ..color = AppColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (var i = 1; i < 3; i++) {
      canvas.drawLine(Offset(size.width / 3 * i, 0), Offset(size.width / 3 * i, size.height), inner);
      canvas.drawLine(Offset(0, size.height / 3 * i), Offset(size.width, size.height / 3 * i), inner);
    }
  }

  @override
  bool shouldRepaint(covariant _ZoneGridPainter oldDelegate) => false;
}
