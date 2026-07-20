import 'dart:io';

import 'package:path_provider/path_provider.dart';

/// [02_데이터](../../../03_설계/02_데이터.md) §4 "파일=슬롯" — 세이브
/// 슬롯(`slot_<id>.db`)이 실제로 저장되는 폴더. content.db와 같은 앱
/// 지원 폴더 하위에 `slots/`로 분리해둔다.
Future<Directory> resolveSlotsDirectory() async {
  final base = await getApplicationSupportDirectory();
  final dir = Directory('${base.path}/slots');
  if (!await dir.exists()) {
    await dir.create(recursive: true);
  }
  return dir;
}

/// 새 슬롯 파일 경로 — 밀리초 타임스탬프로 유일성 보장.
Future<String> newSlotPath() async {
  final dir = await resolveSlotsDirectory();
  return '${dir.path}/slot_${DateTime.now().millisecondsSinceEpoch}.db';
}
