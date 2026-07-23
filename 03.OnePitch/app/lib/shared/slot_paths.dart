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

/// 세이브 슬롯 상한(대화 2026-07-24) — 예전엔 밀리초 타임스탬프로 파일명을
/// 지어 "새로하기"를 누를 때마다 파일이 무한정 쌓였다. 이제 고정 3개
/// 슬롯(`slot_1.db`~`slot_3.db`)만 존재하고, "새로하기"가 그중 하나를
/// 고르게(비어 있으면 바로, 있으면 덮어쓰기 확인 후) 한다.
const maxSlots = 3;

/// 슬롯 인덱스(1~[maxSlots])에 대응하는 고정 파일 경로.
String slotPathForIndex(Directory dir, int index) => '${dir.path}/slot_$index.db';
