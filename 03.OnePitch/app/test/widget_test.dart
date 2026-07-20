import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/main.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async {
    await RustLib.init();
  });

  testWidgets('app boots into the main menu screen', (WidgetTester tester) async {
    // 루트는 새로하기·이어하기·종료 3버튼 메인 메뉴다(shared/router.dart
    // 참고). 슬롯 목록 로딩(`path_provider` 필요)은 `/continue`
    // (`ContinueGameScreen`)로 분리돼 이 화면 자체는 비동기 의존성이
    // 없다 — 3버튼이 뜨는지만 스모크 테스트.
    await tester.pumpWidget(const ProviderScope(child: OnePitchApp()));
    await tester.pump();

    expect(find.text('새로하기'), findsOneWidget);
    expect(find.text('이어하기'), findsOneWidget);
    expect(find.text('종료'), findsOneWidget);
  });
}
