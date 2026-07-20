import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';

import 'package:app/features/game/game_provider.dart';
import 'package:app/features/main_menu/main_menu_screen.dart';
import 'package:app/src/rust/api/game.dart';
import 'package:app/src/rust/frb_generated.dart';

/// [08_은퇴](../../../04_UI기획/08_은퇴.md) §4-1 "메인 메뉴로 복귀" +
/// [02_데이터](../../../03_설계/02_데이터.md) §4 슬롯 수명주기(I7 9차분) —
/// 실제 `newGame(slotPath: ...)`로 진짜 파일 슬롯을 만들고, `MainMenuScreen`
/// 이 그걸 목록에서 찾아 이어하기까지 되는지 검증한다. `resolveSlotsDirectory`
/// (path_provider 필요, `flutter test`엔 플러그인이 없음)는 순수 임시
/// 디렉터리로 갈아끼워(`slotsDirectoryResolver` 주입) 우회.
void main() {
  setUpAll(() async => await RustLib.init());

  testWidgets('MainMenuScreen lists an existing slot and continuing it activates the game', (tester) async {
    late ProviderContainer container;
    late String slotPath;
    final tempDir = Directory.systemTemp.createTempSync('onepitch_main_menu_test_');

    await tester.runAsync(() async {
      final teams = await listHsTeams(contentDbPath: '../engine/content.db');
      slotPath = '${tempDir.path}/slot_test.db';
      await newGame(
        contentDbPath: '../engine/content.db',
        canonicalSeed: 777,
        name: '메인메뉴테스트',
        handedness: '우완',
        schoolTeamId: teams.first.teamId,
        archetype: '강속구형',
        slotPath: slotPath,
      );
      container = ProviderContainer();
    });

    await tester.runAsync(() async {
      await tester.pumpWidget(
        UncontrolledProviderScope(
          container: container,
          child: MaterialApp.router(
            routerConfig: GoRouter(
              initialLocation: '/',
              routes: [
                GoRoute(
                  path: '/',
                  builder: (context, state) => MainMenuScreen(
                    slotsDirectoryResolver: () async => tempDir,
                    contentDbPathResolver: () async => '../engine/content.db',
                  ),
                ),
                GoRoute(path: '/game', builder: (context, state) => const Scaffold(body: Text('게임 화면'))),
              ],
            ),
          ),
        ),
      );
      await Future.delayed(const Duration(milliseconds: 300));
      await tester.pump();
    });
    await tester.pump();

    expect(find.text('메인메뉴테스트'), findsOneWidget);

    await tester.runAsync(() async {
      await tester.tap(find.text('메인메뉴테스트'));
      await Future.delayed(const Duration(milliseconds: 300));
    });
    await tester.pumpAndSettle();

    expect(find.text('게임 화면'), findsOneWidget, reason: '슬롯 이어하기는 /game으로 이동해야 함');
    expect(container.read(gameControllerProvider).hasActiveGame, isTrue);

    // 정리 생략 — 엔진이 전역 싱글톤 세션 하나뿐이라(api::game 모듈 문서
    // 참고) 방금 로드한 슬롯 파일 핸들이 이 테스트 프로세스 안에 계속
    // 열려있고, 그걸 닫는 API가 없어(세션 교체만 가능) Windows에서
    // 삭제가 항상 파일잠금 에러가 난다. 유일 이름 OS 임시폴더(`createTempSync`)
    // 라 남겨둬도 다른 테스트·다음 실행에 영향 없음.
    container.dispose();
  });
}
