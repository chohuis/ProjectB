import 'dart:convert';

import 'package:flutter/material.dart';

import 'colors.dart';

/// 선수/스태프 능력치·구종 마스터리를 화면에 보여줄 때 공통으로 쓰는
/// 작은 헬퍼 모음(대화 2026-07-24) — 캐릭터 생성 로스터 미리보기·내
/// 정보·리그 로스터 탭 세 곳에서 각자 따로 갖고 있던 걸 하나로 합침.

/// 스탯 JSON의 숫자 필드 평균 — "OVR"류 통합 능력치. 이 스탯 스케일이
/// 이미 01_선수_능력치.md §7 "실제 MLB 스카우팅 스케일(20~80)과 동일
/// 관례"라 평균 반올림만으로 바로 그 스케일의 OVR이 된다.
int ovrOf(String statsJson) {
  try {
    final v = jsonDecode(statsJson);
    if (v is! Map) return 0;
    final nums = v.values.whereType<num>().toList();
    if (nums.isEmpty) return 0;
    return (nums.reduce((a, b) => a + b) / nums.length).round();
  } catch (_) {
    return 0;
  }
}

Color ovrColor(int ovr) {
  if (ovr >= 55) return AppColors.safe;
  if (ovr >= 40) return AppColors.accent;
  return AppColors.textSecondary;
}

class OvrBadge extends StatelessWidget {
  const OvrBadge({super.key, required this.ovr});

  final int ovr;

  @override
  Widget build(BuildContext context) {
    final color = ovrColor(ovr);
    return Container(
      width: 30,
      height: 20,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color.withValues(alpha: 0.15), border: Border.all(color: color), borderRadius: BorderRadius.circular(4)),
      child: Text('$ovr', style: TextStyle(color: color, fontSize: 11, fontWeight: FontWeight.bold)),
    );
  }
}

/// `protagonist.pitches`(05_구종_시스템.md §2, 대화 2026-07-23) —
/// `{name, stage(1~5), weeks}` 객체 배열. `stage`는 1=습작·2=연마·3=실전·
/// 4=주무기·5=필살기.
typedef PitchMastery = ({String name, int stage, int weeks});

List<PitchMastery> decodePitchMastery(String json) {
  try {
    final v = jsonDecode(json);
    if (v is! List) return [];
    return v.whereType<Map>().map((m) {
      return (
        name: m['name']?.toString() ?? '',
        stage: (m['stage'] as num?)?.toInt() ?? 1,
        weeks: (m['weeks'] as num?)?.toInt() ?? 0,
      );
    }).toList();
  } catch (_) {
    return [];
  }
}

const masteryStageLabels = {1: '습작', 2: '연마', 3: '실전', 4: '주무기', 5: '필살기'};

Color masteryStageColor(int stage) {
  if (stage >= 4) return AppColors.safe;
  if (stage >= 2) return AppColors.accent;
  return AppColors.textSecondary;
}

/// 구종명 좌측·마스터리 단계 우측(리뷰 피드백 2026-07-24) — 카드 전체
/// 너비를 그대로 쓰는 한 줄짜리 행이라 이름 길이와 무관하게 모든 행이
/// 같은 너비를 갖는다(가장 긴 이름에 맞추는 효과를 텍스트 폭 계산 없이
/// 얻음).
class PitchMasteryRow extends StatelessWidget {
  const PitchMasteryRow({super.key, required this.pitch});
  final PitchMastery pitch;

  @override
  Widget build(BuildContext context) {
    final color = masteryStageColor(pitch.stage);
    final label = masteryStageLabels[pitch.stage] ?? '습작';
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        border: Border.all(color: color),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        children: [
          Expanded(child: Text(pitch.name, style: const TextStyle(color: AppColors.textPrimary, fontSize: 13))),
          Text(label, style: TextStyle(color: color, fontSize: 12, fontWeight: FontWeight.bold)),
        ],
      ),
    );
  }
}
