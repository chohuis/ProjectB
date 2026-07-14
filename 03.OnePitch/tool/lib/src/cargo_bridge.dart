import 'dart:convert';
import 'dart:io';

/// Content seed's actual DB writes live in the Rust `seed_content` binary
/// (engine crate) so the schema/upsert logic has exactly one owner —
/// rusqlite's "bundled" SQLite, no native lib to vendor for Dart on top of
/// what the Windows cargokit path issue already taught us (see
/// 09_개발환경_세팅.md §3). This Dart CLI only parses/assembles seed data and
/// shells out for the write.
Future<int> runSeedContent({
  required String engineDir,
  required List<String> args,
}) async {
  final result = await Process.run(
    'cargo',
    ['run', '--quiet', '--bin', 'seed_content', '--', ...args],
    workingDirectory: engineDir,
  );
  stdout.write(result.stdout);
  stderr.write(result.stderr);
  return result.exitCode;
}

Future<String> writeTempJson(String json) async {
  final file = await File(
    '${Directory.systemTemp.path}${Platform.pathSeparator}onepitch_seed_${DateTime.now().microsecondsSinceEpoch}.json',
  ).create();
  await file.writeAsString(json, encoding: utf8);
  return file.path;
}
