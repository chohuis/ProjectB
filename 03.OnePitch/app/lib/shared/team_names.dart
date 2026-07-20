import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/api/game.dart';

/// `teams.meta`(JSON)에서 표시용 이름을 꺼낸다 — 실패하거나 없으면
/// `team:xxx` 형태의 원시 id로 폴백(전혀 안 뜨는 것보단 나음).
String teamDisplayName(String metaJson, String fallbackTeamId) {
  try {
    final meta = jsonDecode(metaJson);
    if (meta is Map && meta['name'] != null) return meta['name'].toString();
  } catch (_) {
    // meta가 없거나 JSON이 아니면 폴백.
  }
  return fallbackTeamId;
}

/// `team_id` 문자열만 갖고 있는 화면(계약 협상·트레이드·드래프트 결과 등
/// PendingAction payload는 이름을 안 실어줌 — I6 9차분 설계상 엔진은
/// 결과만 넘기고 표시용 이름은 Dart가 조회)에서 쓰는 전역 캐시.
/// `listTeams`가 172여 팀 전부를 한 번에 주므로 세션당 한 번만 로드하면
/// 충분해 `FutureProvider`(Riverpod가 자동 캐시)로 둔다.
final teamNamesProvider = FutureProvider<Map<String, String>>(
  (ref) async {
    final teams = await listTeams(leagueId: null);
    return {for (final t in teams) t.teamId: teamDisplayName(t.metaJson, t.teamId)};
  },
  // 활성 게임이 없는 상태(예: 합성 payload로 렌더링되는 위젯 테스트)에서
  // 호출되면 계속 실패하는 게 당연해 — 재시도해봤자 저절로 낫는 조건이
  // 아니라 자동 재시도(기본 동작)를 꺼둔다.
  retry: (retryCount, error) => null,
);
