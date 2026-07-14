import 'dart:io';

import 'package:tool/src/cargo_bridge.dart';
import 'package:tool/src/content_seed.dart';

String repoRootFromScript() {
  // bin/tool.dart -> tool/ -> repo root (03.OnePitch/)
  final scriptDir = File(Platform.script.toFilePath()).parent;
  return scriptDir.parent.parent.path;
}

Future<int> main(List<String> arguments) async {
  if (arguments.length < 2 || arguments[0] != 'content') {
    stderr.writeln('usage: dart run tool content <seed|validate> [--dry-run]');
    return 64;
  }

  final repoRoot = repoRootFromScript();
  final seedDir = '$repoRoot/data/seed';
  final engineDir = '$repoRoot/engine';
  final dbPath = '$engineDir/content.db';

  switch (arguments[1]) {
    case 'seed':
      final dryRun = arguments.contains('--dry-run');
      final json = buildSeedPayloadJson(seedDir);
      final jsonPath = await writeTempJson(json);
      try {
        return await runSeedContent(
          engineDir: engineDir,
          args: [dbPath, jsonPath, if (dryRun) '--dry-run'],
        );
      } finally {
        await File(jsonPath).delete();
      }
    case 'validate':
      return await runSeedContent(engineDir: engineDir, args: [dbPath, '--validate']);
    default:
      stderr.writeln('unknown content subcommand: ${arguments[1]}');
      return 64;
  }
}
