import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';

/// [07_전환화면](../../../../04_UI기획/07_전환화면.md) §1 FA·재계약 협상
/// (`contractNego` PendingAction) — 06_시장_계약.md §2 양방향 카운터오퍼.
/// `payload.kind`가 `"FA"`면 여러 팀 오퍼 비교, `"재계약"`이면 현 소속팀
/// 오퍼 1개뿐. **참고 정보 병기(팀 자원·최근 주목도·평가 등급 흐름)와
/// 세금 미리보기는 생략** — 팀 자원(②자원)은 이 PendingAction의 payload
/// 자체엔 없고(엔진이 오퍼 계산에는 반영하지만 결과만 넘김), 개인재정
/// 세금 시스템(08_개인_재정)은 아직 엔진에 없음(§6-22에서 이미 확인).
/// 역제안은 §2-1 "라운드 상한 1회"로 단순화된 엔진 설계(§6-19)와
/// 맞춰, 금액을 한 번 입력해 제출하면 그 자리에서 수락/거절이 확정된다.
class ContractNegoView extends StatelessWidget {
  const ContractNegoView({super.key, required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  Widget build(BuildContext context) {
    final payload = _decode(action.payloadJson);
    final kind = payload['kind']?.toString() ?? '';
    final offers = (payload['offers'] as List?)?.cast<Map<String, dynamic>>() ?? [];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(kind == 'FA' ? 'FA 오퍼 비교' : '재계약 제안', style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 12),
        Expanded(
          child: ListView(
            children: [
              for (final o in offers) _OfferCard(offer: o, action: action, controller: controller),
            ],
          ),
        ),
        const SizedBox(height: 8),
        OutlinedButton(onPressed: () => controller.respond(action.id, 'reject'), child: const Text('전부 거절')),
      ],
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

class _OfferCard extends StatefulWidget {
  const _OfferCard({required this.offer, required this.action, required this.controller});
  final Map<String, dynamic> offer;
  final PendingActionInfo action;
  final GameController controller;

  @override
  State<_OfferCard> createState() => _OfferCardState();
}

class _OfferCardState extends State<_OfferCard> {
  final _counterController = TextEditingController();
  bool _countering = false;

  @override
  Widget build(BuildContext context) {
    final teamId = widget.offer['team_id']?.toString() ?? '?';
    final salary = widget.offer['salary']?.toString() ?? '?';
    final years = widget.offer['years']?.toString() ?? '?';
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(teamId, style: const TextStyle(fontWeight: FontWeight.bold)),
            Text('연봉 $salary · $years년'),
            const SizedBox(height: 8),
            if (!_countering)
              Wrap(
                spacing: 8,
                children: [
                  ElevatedButton(onPressed: () => widget.controller.respond(widget.action.id, 'accept:$teamId'), child: const Text('수락')),
                  OutlinedButton(onPressed: () => setState(() => _countering = true), child: const Text('역제안')),
                ],
              )
            else
              Row(
                children: [
                  Expanded(
                    child: TextField(
                      controller: _counterController,
                      keyboardType: TextInputType.number,
                      decoration: const InputDecoration(labelText: '희망 연봉'),
                    ),
                  ),
                  const SizedBox(width: 8),
                  ElevatedButton(
                    onPressed: () {
                      final amount = int.tryParse(_counterController.text.trim());
                      if (amount != null) {
                        widget.controller.respond(widget.action.id, 'counter:$teamId:$amount');
                      }
                    },
                    child: const Text('제출'),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
