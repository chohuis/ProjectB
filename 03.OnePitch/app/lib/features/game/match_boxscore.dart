import 'dart:convert';

import 'package:flutter/material.dart';

import 'package:app/shared/design/colors.dart';

/// 박스스코어 한 하프이닝 줄(엔진 migration v26, 대화 2026-07-25) —
/// `getInningLog()`가 주는 `[{"inning","top_of_inning","runs","hits","walks"}]`
/// JSON 배열의 원소 하나.
class BoxScoreEntry {
  const BoxScoreEntry({required this.inning, required this.topOfInning, required this.runs, required this.hits, required this.walks});

  final int inning;
  final bool topOfInning;
  final int runs;
  final int hits;
  final int walks;

  factory BoxScoreEntry.fromJson(Map<String, dynamic> j) => BoxScoreEntry(
    inning: (j['inning'] as num).toInt(),
    topOfInning: j['top_of_inning'] as bool,
    runs: (j['runs'] as num).toInt(),
    hits: (j['hits'] as num).toInt(),
    walks: (j['walks'] as num).toInt(),
  );
}

/// `getInningLog()` 원시 JSON 문자열 → 파싱된 목록. 세션이 없거나(`null`)
/// 형식이 예상과 다르면 빈 목록(테이블은 그냥 빈 채로 렌더).
List<BoxScoreEntry> parseInningLog(String? raw) {
  if (raw == null) return const [];
  try {
    final list = jsonDecode(raw) as List;
    return list.map((e) => BoxScoreEntry.fromJson(e as Map<String, dynamic>)).toList();
  } catch (_) {
    return const [];
  }
}

/// 박스스코어 테이블(대화 2026-07-25, 매치 화면 재설계) — 1회부터
/// (연장 포함 실제 진행된 회까지, 최소 9칸) 원정/홈 2행, 각 칸엔 그
/// 하프이닝 득점. 우측에 R/H/BB 합계 칸. `entries`는 완료된(즉
/// 하프이닝 경계를 넘긴) 하프이닝만 담고 있어 — 지금 진행 중인
/// 하프이닝의 실시간 점수는 상단 구장 뷰의 스코어 오버레이가 담당.
/// 칸 너비는 고정폭 가로 스크롤 대신 `Expanded`로 균등 분배 — 그
/// 아래 구장 뷰(`StadiumFieldView`, 컬럼 전체 폭을 채움)와 좌우 폭이
/// 어긋나지 않게(대화 2026-07-25 후속 수정 "박스스코어 좌측에 맞춰서
/// 너비 좀 맞추고").
class BoxScoreTable extends StatelessWidget {
  const BoxScoreTable({super.key, required this.entries, required this.homeLabel, required this.awayLabel, this.currentInning});

  final List<BoxScoreEntry> entries;
  final String homeLabel;
  final String awayLabel;
  final int? currentInning;

  static const _labelWidth = 56.0;

  BoxScoreEntry? _find(int inning, bool top) {
    for (final e in entries) {
      if (e.inning == inning && e.topOfInning == top) return e;
    }
    return null;
  }

  int _sum(bool top, int Function(BoxScoreEntry) pick) => entries.where((e) => e.topOfInning == top).fold(0, (s, e) => s + pick(e));

  @override
  Widget build(BuildContext context) {
    final maxInning = entries.fold<int>(9, (m, e) => e.inning > m ? e.inning : m);
    final lastInning = (currentInning != null && currentInning! > maxInning) ? currentInning! : maxInning;
    final innings = [for (var i = 1; i <= lastInning; i++) i];

    Widget cell(String text, {bool header = false, bool bold = false}) => Expanded(
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(
          color: header ? AppColors.textSecondary : AppColors.textPrimary,
          fontSize: 11,
          fontWeight: bold ? FontWeight.bold : FontWeight.normal,
        ),
      ),
    );

    Widget row(String label, bool top) => Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(
            width: _labelWidth,
            child: Text(label, style: const TextStyle(color: AppColors.textMuted, fontSize: 12, fontWeight: FontWeight.w600), overflow: TextOverflow.ellipsis),
          ),
          for (final i in innings) cell(_find(i, top)?.runs.toString() ?? ''),
          const SizedBox(width: 8),
          cell(_sum(top, (e) => e.runs).toString(), bold: true),
          cell(_sum(top, (e) => e.hits).toString()),
          cell(_sum(top, (e) => e.walks).toString()),
        ],
      ),
    );

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          children: [
            const SizedBox(width: _labelWidth),
            for (final i in innings) cell('$i', header: true),
            const SizedBox(width: 8),
            cell('R', header: true),
            cell('H', header: true),
            cell('BB', header: true),
          ],
        ),
        const Divider(color: AppColors.border, height: 8),
        row(awayLabel, true),
        row(homeLabel, false),
      ],
    );
  }
}
