import 'dart:io';

import 'package:csv/csv.dart';

/// Reads a CSV seed file (UTF-8, header row) into a list of column-name-keyed
/// rows. Returns an empty list if the file doesn't exist — seed sources are
/// authored incrementally (per 07_데이터관리.md §3-3), so a missing file just
/// means "no rows for this table yet", not an error.
List<Map<String, String>> readSeedCsv(String path) {
  final file = File(path);
  if (!file.existsSync()) return [];

  final raw = file.readAsStringSync();
  final rows = const CsvToListConverter(eol: '\n', shouldParseNumbers: false)
      .convert(raw.replaceAll('\r\n', '\n'), eol: '\n');
  if (rows.isEmpty) return [];

  final header = rows.first.map((c) => c.toString().trim()).toList();
  return rows.skip(1).where((r) => r.isNotEmpty && r.any((c) => c.toString().trim().isNotEmpty)).map((r) {
    final map = <String, String>{};
    for (var i = 0; i < header.length; i++) {
      map[header[i]] = i < r.length ? r[i].toString().trim() : '';
    }
    return map;
  }).toList();
}

String? nullIfEmpty(String? s) => (s == null || s.isEmpty) ? null : s;

int? intOrNull(String? s) => nullIfEmpty(s) == null ? null : int.parse(s!);
