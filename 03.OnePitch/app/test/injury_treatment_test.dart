import 'package:flutter_test/flutter_test.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// treatmentOptions()는 순수 계산(동기)이라 게임 세션 없이도 직접
/// 검증 가능 — [07_전환화면](../../../../04_UI기획/07_전환화면.md) §5의
/// 3옵션 비교표가 기대하는 상대적 트레이드오프(이탈기간: 무리한복귀 <
/// 재활 < 수술)를 확인.
void main() {
  setUpAll(() async => await RustLib.init());

  test('treatmentOptions returns the 3 documented options with the expected recovery ordering', () {
    final options = treatmentOptions(severity: '중등');
    expect(options.map((o) => o.name).toList(), ['수술', '재활', '무리한 복귀']);

    final surgery = options.firstWhere((o) => o.name == '수술');
    final rehab = options.firstWhere((o) => o.name == '재활');
    final rushed = options.firstWhere((o) => o.name == '무리한 복귀');
    expect(rushed.recoveryDays, lessThan(rehab.recoveryDays));
    expect(rehab.recoveryDays, lessThan(surgery.recoveryDays));
  });
}
