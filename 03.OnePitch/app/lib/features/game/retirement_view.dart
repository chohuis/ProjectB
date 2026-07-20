import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:app/src/rust/api/game.dart';
import 'game_provider.dart';

/// [08_은퇴](../../../../04_UI기획/08_은퇴.md) — 은퇴 트리거 3종(자발적/
/// 노쇠·방출압박/부상강제) 전부 이 화면 하나로 귀결(`retirement`
/// PendingAction). §2 구성요소 6종 중 **통산 기록 대시보드**·**커리어
/// 타임라인**만 실제 데이터로 채운다 — 하이라이트 자동선정·명예 요소
/// (수상·타이틀)·명성 등급 비례 은퇴식 연출은 업적·라이벌 아크 등
/// 아직 엔진에 없는 시스템에 의존해(I6 10차분 조사로 확인, 10_구현_Phase_계획.md
/// §6-29) I8 콘텐츠 저작 이후로 이월. 서술형 내레이션도 템플릿 조립기
/// (콘텐츠/06_서술_템플릿) 없이 트리거별 고정 문구로 대체한 최소 버전.
class RetirementView extends StatefulWidget {
  const RetirementView({super.key, required this.action, required this.controller});
  final PendingActionInfo action;
  final GameController controller;

  @override
  State<RetirementView> createState() => _RetirementViewState();
}

class _RetirementViewState extends State<RetirementView> {
  CareerSummary? _summary;
  List<SeasonLine> _timeline = const [];

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final summary = await careerSummary();
    final timeline = await careerTimeline();
    if (!mounted) return;
    setState(() {
      _summary = summary;
      _timeline = timeline;
    });
  }

  Map<String, dynamic> _decode(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  String get _flavorText {
    switch (_decode(widget.action.payloadJson)['reason']) {
      case 'decline':
        return '나이와 함께 기회도 줄어들었다. 이제는 마운드를 내려올 시간.';
      case 'injury':
        return '거듭된 부상이 결국 발목을 잡았다. 더는 던질 수 없는 몸.';
      default:
        return '스스로 마운드를 내려오기로 했다. 후회는 없다.';
    }
  }

  @override
  Widget build(BuildContext context) {
    final summary = _summary;
    if (summary == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('은퇴', style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(_flavorText, style: const TextStyle(fontStyle: FontStyle.italic)),
        const SizedBox(height: 16),
        const Text('통산 기록', style: TextStyle(fontWeight: FontWeight.bold)),
        const SizedBox(height: 4),
        Wrap(
          spacing: 16,
          runSpacing: 4,
          children: [
            Text('${summary.games}경기'),
            Text('${summary.wins}승 ${summary.losses}패 ${summary.noDecisions}노디시전'),
            Text('탈삼진 ${summary.strikeouts}'),
            Text('이닝 ${summary.inningsPitched}'),
            Text('평균자책 ${summary.era.toStringAsFixed(2)}'),
          ],
        ),
        const SizedBox(height: 16),
        const Text('시즌별 커리어', style: TextStyle(fontWeight: FontWeight.bold)),
        Expanded(
          child: _timeline.isEmpty
              ? const Center(child: Text('기록된 시즌이 없습니다.'))
              : ListView(children: [for (final line in _timeline) _SeasonRow(line: line)]),
        ),
        const SizedBox(height: 8),
        Center(
          child: ElevatedButton(
            onPressed: () async {
              await widget.controller.respond(widget.action.id, '확인');
              if (context.mounted) context.go('/');
            },
            child: const Text('확인 — 메인 메뉴로'),
          ),
        ),
      ],
    );
  }
}

class _SeasonRow extends StatelessWidget {
  const _SeasonRow({required this.line});
  final SeasonLine line;

  Map<String, dynamic> _decode(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  @override
  Widget build(BuildContext context) {
    final v = _decode(line.lineJson);
    final wins = v['wins'] ?? 0;
    final losses = v['losses'] ?? 0;
    final games = (v['games'] as num?)?.toInt() ?? 0;
    const maxGamesScale = 30; // 시즌당 최대 등판 수 근사 — 정확한 스케일 미정 placeholder
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        children: [
          SizedBox(width: 64, child: Text('시즌 ${line.season}')),
          Expanded(child: LinearProgressIndicator(value: (games / maxGamesScale).clamp(0.0, 1.0))),
          const SizedBox(width: 8),
          Text('$wins승 $losses패'),
        ],
      ),
    );
  }
}
