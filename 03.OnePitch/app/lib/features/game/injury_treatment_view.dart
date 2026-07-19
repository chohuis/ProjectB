import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';

/// [07_전환화면](../../../../04_UI기획/07_전환화면.md) §5 부상 치료 선택
/// (`injuryTreatment` PendingAction) — 전용화면 5종 중 지금 유일하게
/// 실전에서 발동 가능(나머지 4종은 진로 갈림길이 엔진에 없어 아직
/// 못 걸림). 3옵션(수술/재활/무리한복귀) × 이탈기간·재발위험·완치도
/// 비교표 + 부상 정보. **"팀 성적 압박 상황" 맥락 표시는 생략**(문서가
/// "무리한 복귀 딜레마"의 서사적 맥락으로 언급했지만, 그 압박을 수치화할
/// 엔진 값이 따로 없어 이번 스코프에선 순수 트레이드오프 비교표만).
class InjuryTreatmentView extends StatelessWidget {
  const InjuryTreatmentView({super.key, required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final payload = _decode(action.payloadJson);
    final part = payload['부위']?.toString() ?? '?';
    final severity = payload['심각도']?.toString() ?? '경미';
    final options = treatmentOptions(severity: severity);

    return SingleChildScrollView(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('부상 발생: $part ($severity)', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 4),
          const Text('치료법을 선택하세요 — 선택은 즉시 확정되고, 효과(복귀일)는 회복 기간이 지나야 나타납니다.', style: TextStyle(color: Colors.grey)),
          const SizedBox(height: 16),
          Table(
            border: TableBorder.all(color: Colors.grey.shade300),
            columnWidths: const {0: FlexColumnWidth(1.2), 1: FlexColumnWidth(1), 2: FlexColumnWidth(1), 3: FlexColumnWidth(1)},
            children: [
              const TableRow(
                decoration: BoxDecoration(color: Color(0x11000000)),
                children: [
                  Padding(padding: EdgeInsets.all(8), child: Text('치료법', style: TextStyle(fontWeight: FontWeight.bold))),
                  Padding(padding: EdgeInsets.all(8), child: Text('이탈기간', style: TextStyle(fontWeight: FontWeight.bold))),
                  Padding(padding: EdgeInsets.all(8), child: Text('재발위험', style: TextStyle(fontWeight: FontWeight.bold))),
                  Padding(padding: EdgeInsets.all(8), child: Text('완치도', style: TextStyle(fontWeight: FontWeight.bold))),
                ],
              ),
              for (final o in options)
                TableRow(
                  children: [
                    Padding(padding: const EdgeInsets.all(8), child: Text(o.name)),
                    Padding(padding: const EdgeInsets.all(8), child: Text('${o.recoveryDays}일')),
                    Padding(padding: const EdgeInsets.all(8), child: Text(o.riskLabel)),
                    Padding(padding: const EdgeInsets.all(8), child: Text(o.recoveryQualityLabel)),
                  ],
                ),
            ],
          ),
          const SizedBox(height: 16),
          Wrap(
            spacing: 8,
            children: options.map((o) => ElevatedButton(onPressed: () => controller.respond(action.id, o.name), child: Text(o.name))).toList(),
          ),
        ],
      ),
    );
  }

  Map<String, dynamic> _decode(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }
}
