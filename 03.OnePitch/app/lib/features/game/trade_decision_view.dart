import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/team_names.dart';
import 'game_provider.dart';

/// [07_전환화면](../../../../04_UI기획/07_전환화면.md) §2 트레이드 오퍼
/// (`tradeDecision` PendingAction) — 06_시장_계약.md §4. **팀 전력★·
/// 역할·연고 비교 뷰는 생략** — 전력★ 조회 쿼리가 아직 없음(§6-23에서
/// 이미 확인). `can_reject`가 false면(노트레이드 조항 없음) 거부 버튼
/// 자체를 숨긴다 — 백엔드도 그 경우 `reject`를 에러로 처리하므로
/// (§6-19) UI에서 먼저 걸러주는 게 맞다.
class TradeDecisionView extends StatelessWidget {
  const TradeDecisionView({super.key, required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final payload = _decode(action.payloadJson);
    final fromTeamId = payload['from_team_id']?.toString() ?? '?';
    final toTeamId = payload['to_team_id']?.toString() ?? '?';
    final kind = payload['kind']?.toString() ?? '';
    final counterpart = payload['counterpart']?.toString();
    final canReject = payload['can_reject'] == true;

    return Consumer(
      builder: (context, ref, _) {
        final names = ref.watch(teamNamesProvider).value ?? const {};
        final fromTeam = names[fromTeamId] ?? fromTeamId;
        final toTeam = names[toTeamId] ?? toTeamId;
        return Center(
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('트레이드 오퍼 — $kind', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
                  const SizedBox(height: 8),
                  Text('$fromTeam → $toTeam'),
                  if (counterpart != null) Text('교환 상대: $counterpart'),
                  if (!canReject)
                    const Padding(padding: EdgeInsets.only(top: 8), child: Text('노트레이드 조항이 없어 거부할 수 없습니다.', style: TextStyle(color: Colors.grey))),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 8,
                    children: [
                      ElevatedButton(onPressed: () => controller.respond(action.id, 'accept'), child: const Text('수락')),
                      if (canReject) OutlinedButton(onPressed: () => controller.respond(action.id, 'reject'), child: const Text('거부')),
                    ],
                  ),
                ],
              ),
            ),
          ),
        );
      },
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
