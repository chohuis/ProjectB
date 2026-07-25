import 'dart:math' as math;

import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';
import 'match_visuals.dart';

/// 구장 이미지 위 고정 지점 하나(0~1 비율 좌표) — 실제 사진(`probaseball.gif`
/// 계열) 위에 그리드를 겹쳐 육안으로 정밀 보정한 값(대화 2026-07-25).
/// 27개 구장 GIF가 전부 같은 원본 사진의 색조 보정판이라(구조는 동일)
/// 이 좌표 하나로 전 구장에 공용으로 쓸 수 있다.
class _FieldCoord {
  const _FieldCoord(this.x, this.y);
  final double x;
  final double y;
}

/// 베이스·타석·수비 9자리 좌표표(대화 2026-07-25) — "각 위치를 좌표로
/// 정해서 그 위에 선수를 그려달라"는 요청 반영. 베이스 4곳(홈·1·2·3루)은
/// 실제 흰색 마커 위에 원을 겹쳐 그려보며 픽셀 단위로 보정했다. 수비
/// 9자리(P~RF)의 "위치"(어디 서 있는지) 자체는 표준 대형을 흉내 낸
/// 장식(엔진이 실시간 좌표를 시뮬레이션하진 않음, 대화에서 사용자가
/// "장식이어도 추가" 확인) — 다만 어느 자리가 "방금 그 타구를 처리했는지"
/// 는 실제 판정 결과(`resolve_in_play_result`의 포지션별 개인 수비
/// 스탯 적용)라 `StadiumFieldView.lastFielderPosition`으로 해당 배지가
/// 진짜로 하이라이트되고(Phase 4), 홈플레이트에서 그 배지까지 공이
/// 실제로 날아가는 애니메이션의 종착점으로도 쓰인다(Phase A, 대화
/// 2026-07-25 후속).
class FieldCoords {
  FieldCoords._();

  static const home = _FieldCoord(0.500, 0.878);
  static const first = _FieldCoord(0.708, 0.658);
  static const second = _FieldCoord(0.497, 0.548);
  static const third = _FieldCoord(0.270, 0.658);

  /// 타석(우타자는 3루측, 좌타자는 1루측 — 실제 타격 자세와 동일 관례).
  static const rhbBox = _FieldCoord(0.4595, 0.875);
  static const lhbBox = _FieldCoord(0.527, 0.875);

  /// 수비 9자리(장식용, 표준 대형 근사).
  static const pitcher = _FieldCoord(0.500, 0.672);
  static const catcher = _FieldCoord(0.500, 0.920);
  static const firstBaseman = _FieldCoord(0.660, 0.645);
  static const secondBaseman = _FieldCoord(0.610, 0.640);
  static const shortstop = _FieldCoord(0.375, 0.640);
  static const thirdBaseman = _FieldCoord(0.310, 0.645);
  static const leftField = _FieldCoord(0.250, 0.400);
  static const centerField = _FieldCoord(0.500, 0.380);
  static const rightField = _FieldCoord(0.750, 0.400);

  static const fielders = <String, _FieldCoord>{
    'P': pitcher,
    'C': catcher,
    '1B': firstBaseman,
    '2B': secondBaseman,
    'SS': shortstop,
    '3B': thirdBaseman,
    'LF': leftField,
    'CF': centerField,
    'RF': rightField,
  };

  /// 내야 4자리 — 땅볼 느낌(낮은 궤적)으로 애니메이션할지 판단에 씀.
  static const infieldBadges = <String>{'1B', '2B', '3B', 'SS'};
}

/// 엔진 `resolve_in_play_result`가 돌려주는 한글 포지션명 → 배지 라벨
/// (대화 2026-07-25, Phase 4 하이라이트용) — 투수·포수는 애초에 후보에서
/// 빠져 있어 매핑 없음.
const _koreanPositionToBadge = <String, String>{
  '1루수': '1B',
  '2루수': '2B',
  '3루수': '3B',
  '유격수': 'SS',
  '좌익수': 'LF',
  '중견수': 'CF',
  '우익수': 'RF',
};

double _lerp(double a, double b, double t) => a + (b - a) * t;

/// 구장 배경(대화 2026-07-25, 매치 화면 재설계) — 절차적 실시간 렌더링→
/// 전 구장 공용 실사 GIF 한 장→구장별 절차 생성 도트아트 PNG를 차례로
/// 시도했으나, 마지막 걸 본 사용자가 "도트 아트 말고 아까 02 버전(=
/// `02.SvelteElectron` 레트로 GBC 모드의 실사 픽셀아트 `probaseball.gif`)
/// 디자인으로"를 요청. 구조(관중석·담장 모양)까지 27종으로 새로 그리는
/// 건 手작업 아트 없인 그 화질을 못 따라가므로, 사용자가 직접 고른
/// 절충안대로 **원본 사진 한 장을 구장마다 색조·채도·밝기·대비만 다르게
/// 보정**해 `assets/stadium/{key}.gif`(27종+`default.gif`, Python/Pillow로
/// 사전 생성)로 반입했다. 이어서 사용자가 "베이스·타석·수비 위치를 좌표로
/// 잡아서 그 위에 바둑알처럼 선수를 그려달라"고 요청 — `FieldCoords`에
/// 정밀 보정한 좌표로 주자(실제 데이터)·타자(핸드니스 실제 데이터)·수비
/// 9명(장식용 고정 대형)을 이미지 위에 직접 오버레이한다. 우측상단엔
/// 기존 다이아몬드 인디케이터+이닝/스코어/B-S-O도 그대로 유지(중복이어도
/// 한눈에 보기 편하다고 사용자가 확인). 이어서 "수비수는 실제 데이터가
/// 있냐"는 질문에 답하는 과정에서 개인 포지션별 수비 스탯이 실제로는
/// 전혀 안 쓰이던 걸 발견 — 엔진 `resolve_in_play_result`를 확장해
/// 타구 유형(땅볼/뜬공/직선타)에서 실제 처리 포지션을 뽑고 그 포지션
/// 선수 개인 수비 스탯으로 실책 확률을 계산하도록 고쳤다(Phase 1~3,
/// `sim::match_.rs`). `lastFielderPosition`/`lastPlayWasError`는 그
/// 결과를 `AwaitingPitch`로 노출한 값 — 방금 처리한 배지를 성공(파랑)/
/// 실책(빨강)으로 하이라이트해 장식이던 9자리 배지가 실제 판정과
/// 연결되게 한다(Phase 4). 이어서(Phase A, 대화 2026-07-25 후속) 홈플레이트
/// →처리 포지션으로 공이 실제로 날아가는 애니메이션을 추가 — 내야는
/// 낮고 빠른 궤적, 외야는 높은 아치, 안타(`lastPlayWasHit`)는 그 포지션을
/// 지나쳐 더 나가고, 홈런(`lastPlayWasHomeRun`)은 담장 밖까지 계속
/// 날아간다. 새 좌표 캘리브레이션 없이 기존 9자리 좌표를 종착점으로
/// 재사용(파울라인·담장 좌표는 여전히 스코프 밖 — 나중에 진짜 필요해지면).
class StadiumFieldView extends StatefulWidget {
  const StadiumFieldView({
    super.key,
    required this.stadiumId,
    required this.bases,
    required this.runnerColor,
    required this.fielderColor,
    required this.batterHandedness,
    required this.inning,
    required this.topOfInning,
    required this.outs,
    required this.balls,
    required this.strikes,
    required this.homeRuns,
    required this.awayRuns,
    this.lastFielderPosition,
    this.lastPlayWasError = false,
    this.lastPlayWasHit = false,
    this.lastPlayWasHomeRun = false,
  });

  /// 엔진 `MatchVenueInfo.stadiumId`(예: `"stadium:busan_waves"`) 그대로 —
  /// `:` 뒤쪽을 잘라 자산 키로 쓴다. 알 수 없는/누락된 값이면 `default.gif`.
  final String stadiumId;
  final List<bool> bases;
  final Color runnerColor;

  /// 수비팀(투구 중인 팀) 색 — 9자리 장식 수비수 배지에 쓴다.
  final Color fielderColor;

  /// `BatterProfileInfo.handedness`("좌타"/"우타"/"양타") 그대로 —
  /// 타자를 홈플레이트 좌/우 타석 중 어느 쪽에 그릴지 결정. 양타는
  /// 우타석으로 고정(엔진이 실제 어느 쪽으로 섰는지 구분 안 함).
  final String batterHandedness;

  final int inning;
  final bool topOfInning;
  final int outs;
  final int balls;
  final int strikes;
  final int homeRuns;
  final int awayRuns;

  /// `MatchStepInfo_AwaitingPitch.lastFielderPosition`(대화 2026-07-25,
  /// Phase 4) — 한글 포지션명. 방금 전 타석이 인플레이가 아니었거나
  /// 하프이닝이 막 시작됐으면 `null`(아무 배지도 하이라이트/애니메이션
  /// 안 됨).
  final String? lastFielderPosition;

  /// `lastFielderPosition`이 있을 때만 의미 있음 — 실책이면 빨강, 아니면
  /// (정상 아웃/안타) 파랑 하이라이트.
  final bool lastPlayWasError;

  /// `lastFielderPosition`이 있을 때만 의미 있음(Phase A) — 안타(단타/
  /// 2루타/3루타/홈런)였는지. 공 애니메이션이 그 포지션에서 멈출지
  /// (아웃·실책) 지나쳐 더 나갈지(안타) 결정한다.
  final bool lastPlayWasHit;

  /// `lastPlayWasHit`의 부분집합 — 홈런이면 공이 담장 밖까지 계속 날아간다.
  final bool lastPlayWasHomeRun;

  // 생성된 GIF의 실제 픽셀 비율(480×443) — 배경이 잘리지 않게 이 비율
  // 그대로 AspectRatio를 잡는다.
  static const _imageAspectRatio = 480 / 443;

  @override
  State<StadiumFieldView> createState() => _StadiumFieldViewState();
}

class _StadiumFieldViewState extends State<StadiumFieldView> with SingleTickerProviderStateMixin {
  late final AnimationController _ballController;

  @override
  void initState() {
    super.initState();
    _ballController = AnimationController(vsync: this, duration: const Duration(milliseconds: 500), value: 1.0);
  }

  @override
  void didUpdateWidget(covariant StadiumFieldView oldWidget) {
    super.didUpdateWidget(oldWidget);
    // "직전엔 없다가 이번에 생겼다" — 이게 진짜 새 플레이라는 신호(대화
    // 2026-07-25). 엔진이 매 응답마다 한 번 쓰고 바로 지우기 때문에, 값
    // 자체가 이전과 같은 포지션이어도(예: 유격수가 연속으로 처리) 항상
    // null→값 전이가 일어난다 — 단순 `!=` 비교로는 이 경우를 놓친다.
    if (widget.lastFielderPosition != null && oldWidget.lastFielderPosition == null) {
      final badge = _koreanPositionToBadge[widget.lastFielderPosition];
      final isInfield = badge != null && FieldCoords.infieldBadges.contains(badge);
      _ballController.duration = widget.lastPlayWasHomeRun
          ? const Duration(milliseconds: 700)
          : (isInfield ? const Duration(milliseconds: 350) : const Duration(milliseconds: 500));
      _ballController.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _ballController.dispose();
    super.dispose();
  }

  bool _occupied(int i) => widget.bases.length > i && widget.bases[i];

  String get _assetKey {
    final key = widget.stadiumId.contains(':') ? widget.stadiumId.split(':').last : widget.stadiumId;
    return key.isEmpty ? 'default' : key;
  }

  /// 홈플레이트→처리 포지션 애니메이션의 현재 프레임 좌표. 애니메이션이
  /// 끝났거나(값 1.0) 방금 플레이가 없으면 `null`(공 안 그림).
  _FieldCoord? _ballCoordAt(double t) {
    final posName = widget.lastFielderPosition;
    if (posName == null || t >= 1.0) return null;
    final badge = _koreanPositionToBadge[posName];
    final target = badge == null ? null : FieldCoords.fielders[badge];
    if (target == null) return null;
    final isInfield = FieldCoords.infieldBadges.contains(badge);

    // 안타/홈런이면 그 포지션에서 멈추지 않고 홈→포지션 방향선을 따라
    // 더 나간다(홈런은 훨씬 더 멀리, 담장 밖 취급).
    var endX = target.x;
    var endY = target.y;
    if (widget.lastPlayWasHomeRun) {
      endX = (target.x + (target.x - FieldCoords.home.x) * 0.6).clamp(0.02, 0.98);
      endY = (target.y - 0.12).clamp(0.03, 1.0);
    } else if (widget.lastPlayWasHit) {
      endX = (target.x + (target.x - FieldCoords.home.x) * 0.25).clamp(0.02, 0.98);
      endY = (target.y - (isInfield ? 0.05 : 0.03)).clamp(0.03, 1.0);
    }

    final x = _lerp(FieldCoords.home.x, endX, t);
    final yGround = _lerp(FieldCoords.home.y, endY, t);
    final liftAmplitude = widget.lastPlayWasHomeRun ? 0.16 : (isInfield ? 0.018 : 0.10);
    final lift = liftAmplitude * math.sin(math.pi * t);
    return _FieldCoord(x, yGround - lift);
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: StadiumFieldView._imageAspectRatio,
      child: DecoratedBox(
        decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(7),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final w = constraints.maxWidth;
              final h = constraints.maxHeight;

              Offset px(_FieldCoord c) => Offset(c.x * w, c.y * h);
              final highlightedBadge = widget.lastFielderPosition == null ? null : _koreanPositionToBadge[widget.lastFielderPosition];
              final highlightColor = widget.lastPlayWasError ? AppColors.danger : AppColors.accent;

              Widget marker(_FieldCoord c, {required double radius, required Color color, String? label, Color? labelColor, Color? highlight}) {
                final p = px(c);
                return Positioned(
                  left: p.dx - radius,
                  top: p.dy - radius,
                  child: Container(
                    width: radius * 2,
                    height: radius * 2,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: color,
                      shape: BoxShape.circle,
                      border: Border.all(color: highlight ?? Colors.black.withValues(alpha: 0.45), width: highlight != null ? 3 : 1.2),
                      boxShadow: highlight != null ? [BoxShadow(color: highlight.withValues(alpha: 0.75), blurRadius: 7, spreadRadius: 1.5)] : null,
                    ),
                    child: label == null
                        ? null
                        : Text(label, style: TextStyle(color: labelColor ?? Colors.white, fontSize: radius * 0.85, fontWeight: FontWeight.bold)),
                  ),
                );
              }

              return Stack(
                children: [
                  Positioned.fill(
                    child: Image.asset(
                      'assets/stadium/$_assetKey.gif',
                      fit: BoxFit.cover,
                      errorBuilder: (context, error, stackTrace) => Image.asset('assets/stadium/default.gif', fit: BoxFit.cover),
                    ),
                  ),
                  // 수비 9자리(장식) — 맨 아래 레이어, 주자·타자가 그 위로.
                  // 방금 처리한 포지션은 성공(파랑)/실책(빨강) 하이라이트.
                  for (final entry in FieldCoords.fielders.entries)
                    marker(
                      entry.value,
                      radius: w * 0.026,
                      color: widget.fielderColor.withValues(alpha: 0.85),
                      label: entry.key,
                      labelColor: Colors.white,
                      highlight: entry.key == highlightedBadge ? highlightColor : null,
                    ),
                  // 타자 — 손잡이에 맞는 타석에.
                  marker(
                    widget.batterHandedness == '좌타' ? FieldCoords.lhbBox : FieldCoords.rhbBox,
                    radius: w * 0.03,
                    color: AppColors.textPrimary,
                    label: '타',
                    labelColor: AppColors.scaffoldBg,
                  ),
                  // 주자(바둑알) — 실제 진루 데이터.
                  if (_occupied(0)) marker(FieldCoords.first, radius: w * 0.032, color: widget.runnerColor),
                  if (_occupied(1)) marker(FieldCoords.second, radius: w * 0.032, color: widget.runnerColor),
                  if (_occupied(2)) marker(FieldCoords.third, radius: w * 0.032, color: widget.runnerColor),
                  // 홈→처리 포지션 공 애니메이션(Phase A) — 방금 플레이가
                  // 있고 재생 중일 때만.
                  AnimatedBuilder(
                    animation: _ballController,
                    builder: (context, _) {
                      final coord = _ballCoordAt(_ballController.value);
                      if (coord == null) return const SizedBox.shrink();
                      final p = px(coord);
                      const r = 5.0;
                      return Positioned(
                        left: p.dx - r,
                        top: p.dy - r,
                        child: Container(
                          key: const ValueKey('stadium-ball'),
                          width: r * 2,
                          height: r * 2,
                          decoration: BoxDecoration(
                            color: Colors.white,
                            shape: BoxShape.circle,
                            border: Border.all(color: Colors.black.withValues(alpha: 0.4), width: 1),
                            boxShadow: const [BoxShadow(color: Colors.black38, blurRadius: 2)],
                          ),
                        ),
                      );
                    },
                  ),
                  Positioned(
                    top: 8,
                    right: 8,
                    child: _ScoreOverlay(
                      bases: widget.bases,
                      runnerColor: widget.runnerColor,
                      inning: widget.inning,
                      topOfInning: widget.topOfInning,
                      outs: widget.outs,
                      balls: widget.balls,
                      strikes: widget.strikes,
                      homeRuns: widget.homeRuns,
                      awayRuns: widget.awayRuns,
                    ),
                  ),
                ],
              );
            },
          ),
        ),
      ),
    );
  }
}

class _ScoreOverlay extends StatelessWidget {
  const _ScoreOverlay({
    required this.bases,
    required this.runnerColor,
    required this.inning,
    required this.topOfInning,
    required this.outs,
    required this.balls,
    required this.strikes,
    required this.homeRuns,
    required this.awayRuns,
  });

  final List<bool> bases;
  final Color runnerColor;
  final int inning;
  final bool topOfInning;
  final int outs;
  final int balls;
  final int strikes;
  final int homeRuns;
  final int awayRuns;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(8),
      decoration: BoxDecoration(color: AppColors.scaffoldBg.withValues(alpha: 0.82), borderRadius: BorderRadius.circular(8), border: Border.all(color: AppColors.border)),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.end,
        mainAxisSize: MainAxisSize.min,
        children: [
          BaseDiamondIndicator(bases: bases, occupiedColor: runnerColor, size: 44),
          const SizedBox(height: 4),
          Text('${topOfInning ? '▲' : '▼'} $inning회', style: const TextStyle(fontWeight: FontWeight.bold, color: AppColors.textPrimary, fontSize: 12)),
          Text('원정 $awayRuns : 홈 $homeRuns', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
          Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Text('B$balls-S$strikes', style: const TextStyle(color: AppColors.textMuted, fontSize: 11)),
              const SizedBox(width: 6),
              ...List.generate(
                3,
                (i) => Padding(
                  padding: const EdgeInsets.only(left: 2),
                  child: Icon(Icons.circle, size: 8, color: i < outs ? AppColors.danger : AppColors.border),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
