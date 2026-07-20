import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:app/src/rust/frb_generated.dart';
import 'package:app/shared/router.dart';
import 'package:app/shared/theme.dart';

Future<void> main() async {
  await RustLib.init();
  runApp(const ProviderScope(child: OnePitchApp()));
}

class OnePitchApp extends StatelessWidget {
  const OnePitchApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp.router(
      title: 'OnePitch',
      theme: onePitchTheme(),
      themeMode: ThemeMode.dark,
      routerConfig: appRouter,
    );
  }
}
