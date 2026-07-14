import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/main.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async {
    await RustLib.init();
  });

  testWidgets('frb greet smoke test', (WidgetTester tester) async {
    await tester.pumpWidget(const MyApp());

    expect(find.textContaining('Hello, Tom'), findsOneWidget);
  });
}
