import 'dart:io';

import 'package:toml/toml.dart';

/// Reads a TOML seed file into a map. Returns an empty map if the file
/// doesn't exist — same "missing = not authored yet" tolerance as
/// [readSeedCsv] (see seed_csv.dart).
Map<String, dynamic> readSeedToml(String path) {
  final file = File(path);
  if (!file.existsSync()) return {};
  return TomlDocument.parse(file.readAsStringSync()).toMap();
}
