import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:app/src/rust/api/game.dart';
import 'package:app/shared/design/colors.dart';
import 'package:app/shared/loading_indicator.dart';
import 'package:app/shared/team_names.dart';

/// 커리어 타임라인 — 입학·진로선택 갈림길(드래프트/대학/독립/입대)·병역
/// 만료·은퇴를 시간순으로. `getCareerEvents()`가 반환하는 각 항목의
/// `detailJson` 구조는 `kind`별로 다르므로 종류마다 따로 포맷한다.
/// 내 정보 "커리어" 탭(`my_player_screen.dart`)과 기록 허브 "커리어" 탭
/// (`records_screen.dart`) 둘 다 같은 데이터·같은 서술을 보여주므로 공용
/// 위젯으로 뺐다.
class CareerTimelineView extends ConsumerStatefulWidget {
  const CareerTimelineView({super.key});

  @override
  ConsumerState<CareerTimelineView> createState() => _CareerTimelineViewState();
}

class _CareerTimelineViewState extends ConsumerState<CareerTimelineView> {
  List<CareerEventInfo>? _events;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    final events = await getCareerEvents();
    if (mounted) setState(() => _events = events);
  }

  Map<String, dynamic> _decode(String json) {
    try {
      final v = jsonDecode(json);
      return v is Map<String, dynamic> ? v : {};
    } catch (_) {
      return {};
    }
  }

  IconData _iconFor(String kind) => switch (kind) {
    'enrollment' => Icons.school,
    'career_choice' => Icons.route,
    'military_discharge' => Icons.military_tech,
    'retirement' => Icons.flag_circle_outlined,
    _ => Icons.circle,
  };

  String _reasonLabel(String reason) => switch (reason) {
    'voluntary' => '자발적',
    'decline' => '노쇠',
    'injury' => '부상',
    _ => reason,
  };

  String _describe(CareerEventInfo e, Map<String, String> names) {
    final detail = _decode(e.detailJson);
    String name(String? id) => id == null ? '?' : (names[id] ?? id);
    switch (e.kind) {
      case 'enrollment':
        return '${name(detail['school_team_id']?.toString())} 입학';
      case 'career_choice':
        final choice = detail['choice']?.toString();
        switch (choice) {
          case '프로':
            return '${name(detail['team_id']?.toString())} 프로 지명(연봉 ${detail['salary'] ?? '?'})';
          case '대학':
            return '${name(detail['team_id']?.toString())} 진학';
          case '독립':
            return '${name(detail['team_id']?.toString())} 독립구단 입단';
          case '입대':
            return '군 입대';
          default:
            return choice ?? '진로 선택';
        }
      case 'military_discharge':
        return '전역 — ${name(detail['team_id']?.toString())} 복귀';
      case 'retirement':
        return '은퇴(${_reasonLabel(detail['reason']?.toString() ?? '')})';
      default:
        return e.kind;
    }
  }

  @override
  Widget build(BuildContext context) {
    final events = _events;
    if (events == null) return const LoadingIndicator();
    if (events.isEmpty) return const Center(child: Text('아직 커리어 기록이 없습니다.'));
    final names = ref.watch(teamNamesProvider).value ?? const {};

    return ListView.builder(
      padding: const EdgeInsets.all(16),
      itemCount: events.length,
      itemBuilder: (context, i) {
        final e = events[i];
        final date = calendarDateForDay(day: e.day);
        return ListTile(
          leading: Icon(_iconFor(e.kind), color: AppColors.accent),
          title: Text(_describe(e, names)),
          subtitle: Text('${date.year}년 ${date.month}월 ${date.day}일'),
        );
      },
    );
  }
}
