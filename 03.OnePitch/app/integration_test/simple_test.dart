import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/main.dart';
import 'package:app/src/rust/frb_generated.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => await RustLib.init());
  testWidgets('app boots into the new-game screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: OnePitchApp()));
    await tester.pump();
    expect(find.text('뉴게임 — 캐릭터 생성'), findsOneWidget);
  });
}
