import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:app/main.dart';
import 'package:app/src/rust/frb_generated.dart';
import 'package:integration_test/integration_test.dart';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  setUpAll(() async => await RustLib.init());
  testWidgets('app boots into the main menu, 새로하기 leads to the character creation screen', (WidgetTester tester) async {
    await tester.pumpWidget(const ProviderScope(child: OnePitchApp()));
    await tester.pump();
    expect(find.text('새로하기'), findsOneWidget);

    await tester.tap(find.text('새로하기'));
    await tester.pumpAndSettle();
    expect(find.text('캐릭터 생성'), findsOneWidget);
  });
}
