import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';
import 'package:app/shared/design/widgets.dart';

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
        BaseDiamondIndicator(bases: bases),
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

/// 진루 다이아몬드 인디케이터(대화 2026-07-25) — `MatchScoreboard`가 쓰던
/// 다이아몬드를 별도 공개 위젯으로 뽑았다. 사용자가 "진루표는 원래
/// 다이아몬드 모양 그대로 살려야 한다"고 명시해, 구장 배경 이미지 위에
/// 오버레이할 때도 이 위젯을 그대로 재사용(형태는 동일, 점유 베이스 색만
/// 타격팀 학교색으로 바꿔 끼울 수 있게 `occupiedColor`를 노출).
class BaseDiamondIndicator extends StatelessWidget {
  const BaseDiamondIndicator({super.key, required this.bases, this.occupiedColor = AppColors.accent, this.size = 56});

  final List<bool> bases; // [1루, 2루, 3루]
  final Color occupiedColor;
  final double size;

  @override
  Widget build(BuildContext context) {
    return SizedBox(width: size, height: size, child: CustomPaint(painter: _DiamondPainter(bases: bases, occupiedColor: occupiedColor)));
  }
}

class _DiamondPainter extends CustomPainter {
  _DiamondPainter({required this.bases, this.occupiedColor = AppColors.accent});
  final List<bool> bases; // [1루, 2루, 3루]
  final Color occupiedColor;

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
      canvas.drawCircle(pos, 6, Paint()..color = occupied ? occupiedColor : AppColors.border);
    }

    drawBase(first, _occupied(0));
    drawBase(second, _occupied(1));
    drawBase(third, _occupied(2));
    canvas.drawCircle(home, 4, Paint()..color = AppColors.textSecondary);
  }

  @override
  bool shouldRepaint(covariant _DiamondPainter oldDelegate) =>
      oldDelegate.occupiedColor != occupiedColor ||
      oldDelegate.bases.length != bases.length ||
      List.generate(bases.length, (i) => bases[i] != oldDelegate.bases[i]).contains(true);
}

/// 투구 위치 조준 캔버스(대화 2026-07-25, 매치 화면 재설계) — 예전 3×3
/// 이산 그리드(`StrikeZoneGrid`) 대신 탭한 정확한 위치를 그대로 연속좌표
/// (x,y — 스트라이크존 기준 -1.0~1.0, 그 밖은 볼 영역)로 변환해 넘긴다.
/// 엔진 `sim::pitch`의 `edge_level = (|x|+|y|)/2` 공식이 볼 영역까지
/// 자연스럽게 처리하므로 여기서는 좌표 변환+시각화만 담당(판정은 전부
/// 엔진). 캔버스 안쪽 60%(비율 0.2~0.8)가 스트라이크존, 바깥 20% 여백이
/// "볼 영역"(고의 유인구 조준용, 다른 배경 톤으로 구분) — 탭은 크로스헤어만
/// 옮기고 실제 제출은 안 한다(제출은 호출부의 "던지기" 버튼).
class PitchTargetCanvas extends StatelessWidget {
  const PitchTargetCanvas({super.key, required this.target, required this.onTargetChanged, this.enabled = true});

  /// 마지막으로 고른 존 좌표(아직 안 골랐으면 null).
  final Offset? target;
  final ValueChanged<Offset> onTargetChanged;
  final bool enabled;

  static const _zoneMin = 0.2;
  static const _zoneMax = 0.8;
  static const _zoneSpan = _zoneMax - _zoneMin;

  Offset _toZoneCoords(Offset local, Size size) {
    final px = (local.dx / size.width).clamp(-0.5, 1.5);
    final py = (local.dy / size.height).clamp(-0.5, 1.5);
    final x = (px - _zoneMin) / _zoneSpan * 2 - 1;
    final y = 1 - (py - _zoneMin) / _zoneSpan * 2;
    return Offset(x, y);
  }

  Offset _toLocalFraction(Offset zoneCoords) {
    final px = _zoneMin + (zoneCoords.dx + 1) / 2 * _zoneSpan;
    final py = _zoneMin + (1 - zoneCoords.dy) / 2 * _zoneSpan;
    return Offset(px, py);
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: 1,
      child: LayoutBuilder(
        builder: (context, constraints) {
          final size = Size(constraints.maxWidth, constraints.maxHeight);
          void handle(Offset local) {
            if (!enabled) return;
            onTargetChanged(_toZoneCoords(local, size));
          }

          final markerFraction = target == null ? null : _toLocalFraction(target!);
          final inBallZone = target != null && (target!.dx.abs() > 1.0 || target!.dy.abs() > 1.0);

          return GestureDetector(
            onTapDown: (d) => handle(d.localPosition),
            onPanUpdate: (d) => handle(d.localPosition),
            child: Stack(
              clipBehavior: Clip.none,
              children: [
                Positioned.fill(child: CustomPaint(painter: const _PitchZonePainter())),
                if (markerFraction != null)
                  Positioned(
                    left: (markerFraction.dx * size.width - 11).clamp(-11, size.width - 11),
                    top: (markerFraction.dy * size.height - 11).clamp(-11, size.height - 11),
                    child: _Crosshair(color: inBallZone ? AppColors.warn : AppColors.accentStrong),
                  ),
              ],
            ),
          );
        },
      ),
    );
  }
}

class _Crosshair extends StatelessWidget {
  const _Crosshair({required this.color});
  final Color color;

  @override
  Widget build(BuildContext context) {
    return IgnorePointer(
      child: SizedBox(width: 22, height: 22, child: CustomPaint(painter: _CrosshairPainter(color: color))),
    );
  }
}

class _CrosshairPainter extends CustomPainter {
  _CrosshairPainter({required this.color});
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;
    final center = Offset(size.width / 2, size.height / 2);
    canvas.drawCircle(center, 9, paint);
    canvas.drawLine(Offset(center.dx - 11, center.dy), Offset(center.dx + 11, center.dy), paint);
    canvas.drawLine(Offset(center.dx, center.dy - 11), Offset(center.dx, center.dy + 11), paint);
  }

  @override
  bool shouldRepaint(covariant _CrosshairPainter oldDelegate) => oldDelegate.color != color;
}

class _PitchZonePainter extends CustomPainter {
  const _PitchZonePainter();

  static const _zoneMin = 0.2;
  static const _zoneMax = 0.8;

  @override
  void paint(Canvas canvas, Size size) {
    // 볼 영역 — 바깥 배경톤.
    canvas.drawRect(Rect.fromLTWH(0, 0, size.width, size.height), Paint()..color = AppColors.surfaceLow);

    final zoneRect = Rect.fromLTRB(size.width * _zoneMin, size.height * _zoneMin, size.width * _zoneMax, size.height * _zoneMax);
    canvas.drawRect(zoneRect, Paint()..color = AppColors.scaffoldBg);

    final outer = Paint()
      ..color = AppColors.borderStrong
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5;
    canvas.drawRect(zoneRect, outer);

    final inner = Paint()
      ..color = AppColors.border
      ..style = PaintingStyle.stroke
      ..strokeWidth = 1;
    for (var i = 1; i < 3; i++) {
      final dx = zoneRect.left + zoneRect.width / 3 * i;
      canvas.drawLine(Offset(dx, zoneRect.top), Offset(dx, zoneRect.bottom), inner);
      final dy = zoneRect.top + zoneRect.height / 3 * i;
      canvas.drawLine(Offset(zoneRect.left, dy), Offset(zoneRect.right, dy), inner);
    }
  }

  @override
  bool shouldRepaint(covariant _PitchZonePainter oldDelegate) => false;
}

/// 투수 스태미나 게이지(대화 2026-07-25, 경기 화면 비주얼 강화) —
/// `MatchStepInfo_AwaitingPitch.fatigue`(§6-N에서 신설, `PitcherChangeDecision`
/// 이 이미 쓰던 값과 같은 출처)를 그대로 시각화. 내 정보 탭의 `_LiveGauge`
/// 와 반대로 "낮을수록 좋음" 색상 매핑(피로도가 높을수록 위험).
class PitcherStaminaGauge extends StatelessWidget {
  const PitcherStaminaGauge({super.key, required this.fatigue, required this.pitchesThrown});

  final double fatigue;
  final int pitchesThrown;

  Color get _color {
    if (fatigue >= 70) return AppColors.danger;
    if (fatigue >= 50) return AppColors.warn;
    return AppColors.safe;
  }

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Text('스태미나', style: TextStyle(color: AppColors.textSecondary, fontSize: 12)),
        const SizedBox(width: 8),
        Expanded(
          child: ClipRRect(
            borderRadius: BorderRadius.circular(4),
            child: LinearProgressIndicator(
              value: 1.0 - (fatigue / 100).clamp(0.0, 1.0),
              minHeight: 8,
              backgroundColor: AppColors.surfaceLow,
              valueColor: AlwaysStoppedAnimation<Color>(_color),
            ),
          ),
        ),
        const SizedBox(width: 8),
        Text('$pitchesThrown구', style: const TextStyle(color: AppColors.textSecondary, fontSize: 12)),
      ],
    );
  }
}

/// 상황 로그(대화 2026-07-25) — 엔진은 자동 시뮬 구간(다른 타자·다른
/// 하프이닝)의 개별 결과를 노출하지 않아 진짜 매 구 단위 플레이바이플레이는
/// 구조적으로 불가능(10_구현_Phase_계획.md §6-31 스코프 판단 참고). 대신
/// 매치 화면이 실제로 관찰한 상태 변화(득점·이닝 전환·아웃 증가)를
/// 호출부(`MatchScreen`)가 누적해 넘겨준 걸 그대로 나열만 한다.
class MatchLogPanel extends StatelessWidget {
  const MatchLogPanel({super.key, required this.lines});

  final List<String> lines;

  @override
  Widget build(BuildContext context) {
    if (lines.isEmpty) return const SizedBox.shrink();
    return AppPanel(
      color: AppColors.surfaceLow,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          for (final line in lines.take(6))
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 2),
              child: Text(line, style: const TextStyle(color: AppColors.textMuted, fontSize: 12)),
            ),
        ],
      ),
    );
  }
}
