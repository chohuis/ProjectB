import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';

/// [07_전환화면](../../../../04_UI기획/07_전환화면.md) §3 진로선택
/// (`careerChoice` PendingAction) — 고교 3학년 드래프트 미지명 시에만
/// 뜬다(지명됐으면 [DraftResultView] 참고). §E "갈림길 A 종합" 표의
/// 트레이드오프를 그대로 옮긴 3버튼. 지역/학교 브라우징 없이 자동
/// 배정(엔진이 리그 내 균등 랜덤 — I6 9차분 스코프 판단 참고)이라
/// "어느 학교/팀으로 갈지"는 선택 후 결과로만 알 수 있다.
class CareerChoiceView extends StatelessWidget {
  const CareerChoiceView({super.key, required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  static const _options = [
    (label: '대학', detail: '소요 4년 · 완성도↑·재평가 기회, 다만 늦어짐(4년 진학 후 재드래프트)'),
    (label: '독립', detail: '소요 1~2년 · 재도전·실전 지속, 다만 무대 수준·주목도 낮고 불확실'),
    (label: '입대', detail: '소요 ~2년 · 병역을 조기에 이행, 복무 후 독립리그로 재도전'),
  ];

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Text('드래프트 미지명 — 다음 경로를 선택하세요.', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 16),
        for (final o in _options)
          Card(
            child: ListTile(
              title: Text(o.label, style: const TextStyle(fontWeight: FontWeight.bold)),
              subtitle: Text(o.detail),
              trailing: ElevatedButton(onPressed: () => controller.respond(action.id, o.label), child: const Text('선택')),
            ),
          ),
      ],
    );
  }
}

/// [07_전환화면](../../../../04_UI기획/07_전환화면.md) §4 드래프트 결과
/// (`draft` PendingAction) — 이 서브분의 엔진 설계상 이 PendingAction은
/// **지명된 경우에만** 생성된다(미지명은 [CareerChoiceView]로 바로 감).
/// "라운드/픽 순위"는 §F "드래프트 라운드 수는 열린 세부"라 아직 계산
/// 안 됨 — 팀·연봉만 표시.
class DraftResultView extends StatelessWidget {
  const DraftResultView({super.key, required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final payload = _decode(action.payloadJson);
    final teamId = payload['team_id']?.toString() ?? '?';
    final salary = payload['salary']?.toString() ?? '?';
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Text('🎉 드래프트 지명!', style: TextStyle(fontWeight: FontWeight.bold, fontSize: 20)),
          const SizedBox(height: 8),
          Text('지명 구단: $teamId'),
          Text('계약 연봉: $salary'),
          const SizedBox(height: 16),
          ElevatedButton(onPressed: () => controller.respond(action.id, '확인'), child: const Text('확인')),
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
