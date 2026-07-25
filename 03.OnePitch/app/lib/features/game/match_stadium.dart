import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';
import 'match_visuals.dart';

/// 구장 배경(대화 2026-07-25, 매치 화면 재설계) — 처음엔 해시 기반 절차적
/// 실시간 렌더링을, 다음엔 `02.SvelteElectron`의 실사 픽셀아트 GIF 하나를
/// 전 구장 공용으로 시도했지만, 사용자가 "구장마다 이미지가 있어야 하고
/// 그 이미지도 구장 특징에 맞춰 생성해야 한다"고 요청 — content.db의
/// 27개 stadium 행(파크팩터+돔 여부+이름 성격)마다 Python/Pillow로 도트
/// 아트 PNG를 하나씩 미리 구워 `assets/stadium/{key}.png`에 반입했다
/// (파크팩터→담장 크기·색, "돔" 포함 이름→실내 지붕, "○○구장"(향토
/// 이름)↔"○○파크/필드/스타디움/아레나"(프로 마스코트 이름)→배경이
/// 산 실루엣이냐 도시 스카이라인이냐, 나머지는 stadium_id 해시로 색조
/// 지터). 그 위에 이닝·스코어·B-S-O·진루 다이아몬드(`BaseDiamondIndicator`,
/// `match_visuals.dart` 공용 위젯 — "진루표는 원래 다이아몬드 모양 그대로"
/// 요청 반영)를 우측상단에 오버레이.
class StadiumFieldView extends StatelessWidget {
  const StadiumFieldView({
    super.key,
    required this.stadiumId,
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

  /// 엔진 `MatchVenueInfo.stadiumId`(예: `"stadium:busan_waves"`) 그대로 —
  /// `:` 뒤쪽을 잘라 자산 키로 쓴다. 알 수 없는/누락된 값이면 `default.png`.
  final String stadiumId;
  final List<bool> bases;
  final Color runnerColor;
  final int inning;
  final bool topOfInning;
  final int outs;
  final int balls;
  final int strikes;
  final int homeRuns;
  final int awayRuns;

  // 생성된 PNG의 실제 픽셀 비율(500×460) — 배경이 잘리지 않게 이 비율
  // 그대로 AspectRatio를 잡는다.
  static const _imageAspectRatio = 500 / 460;

  String get _assetKey {
    final key = stadiumId.contains(':') ? stadiumId.split(':').last : stadiumId;
    return key.isEmpty ? 'default' : key;
  }

  @override
  Widget build(BuildContext context) {
    return AspectRatio(
      aspectRatio: _imageAspectRatio,
      child: DecoratedBox(
        decoration: BoxDecoration(border: Border.all(color: AppColors.border), borderRadius: BorderRadius.circular(8)),
        child: ClipRRect(
          borderRadius: BorderRadius.circular(7),
          child: Stack(
            children: [
              Positioned.fill(
                child: Image.asset(
                  'assets/stadium/$_assetKey.png',
                  fit: BoxFit.cover,
                  errorBuilder: (context, error, stackTrace) => Image.asset('assets/stadium/default.png', fit: BoxFit.cover),
                ),
              ),
              Positioned(
                top: 8,
                right: 8,
                child: _ScoreOverlay(
                  bases: bases,
                  runnerColor: runnerColor,
                  inning: inning,
                  topOfInning: topOfInning,
                  outs: outs,
                  balls: balls,
                  strikes: strikes,
                  homeRuns: homeRuns,
                  awayRuns: awayRuns,
                ),
              ),
            ],
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
