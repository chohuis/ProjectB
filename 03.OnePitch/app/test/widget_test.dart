import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

import 'package:app/main.dart';
import 'package:app/src/rust/frb_generated.dart';

void main() {
  setUpAll(() async {
    await RustLib.init();
  });

  testWidgets('app boots into the main menu screen', (WidgetTester tester) async {
    // 루트는 I7 9차분부터 뉴게임 폼이 아니라 메인 메뉴(슬롯 목록)다
    // (shared/router.dart 참고). 슬롯 목록 로딩(`path_provider` 필요)은
    // 이 순수 pumpWidget 경로엔 그 플러그인이 없어 계속 로딩중 스피너로
    // 멎어있지만(MissingPluginException — 실제 앱 실행 시엔 정상 동작,
    // `MainMenuScreen` 위젯 테스트가 주입 가능한 리졸버로 따로 검증함),
    // 여기선 그와 무관하게 화면 자체가 뜨는지(타이틀)만 스모크 테스트.
    await tester.pumpWidget(const ProviderScope(child: OnePitchApp()));
    await tester.pump();

    expect(find.text('OnePitch'), findsOneWidget);
  });
}
