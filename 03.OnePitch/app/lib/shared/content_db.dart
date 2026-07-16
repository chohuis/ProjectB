import 'dart:io';

import 'package:flutter/services.dart' show rootBundle;
import 'package:path_provider/path_provider.dart';

/// content.db는 Flutter 에셋(번들)으로 배포되지만([02_데이터](../../../03_설계/02_데이터.md)
/// §3 "번들: Flutter 앱 에셋"), SQLite를 여는 Rust 엔진은 실제 파일시스템
/// 경로가 필요하다 — 앱 데이터 폴더로 한 번 복사해두고 그 경로를 돌려준다.
Future<String> resolveContentDbPath() async {
  final dir = await getApplicationSupportDirectory();
  final file = File('${dir.path}/content.db');
  if (!await file.exists()) {
    final bytes = await rootBundle.load('assets/content.db');
    await file.writeAsBytes(bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes));
  }
  return file.path;
}
