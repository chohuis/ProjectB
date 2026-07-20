import 'dart:io';

import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

/// 앱 최초 진입점(루트 `/`) — 타이틀 없이 새로하기·이어하기·종료 3버튼만
/// 배치. 화면 정중앙이 아니라 **하단 쪽**에 버튼을 두고 위쪽을 비워둬
/// 추후 로고가 들어올 자리를 확보(대화 2026-07-20). 슬롯 목록·로딩 등
/// "이어하기"의 실제 내용은 `continue_game_screen.dart`(I7 9차분 로직
/// 이전)로 분리됐다.
class MainMenuScreen extends StatelessWidget {
  const MainMenuScreen({super.key, this.onExit = _defaultExit});

  /// 위젯 테스트에서 실제 프로세스 종료를 막기 위한 주입 지점.
  final VoidCallback onExit;

  static void _defaultExit() => exit(0);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Column(
          children: [
            // 로고 자리 — 위쪽 여백을 버튼 블록보다 크게 잡아 화면 상단~
            // 중앙을 비워둔다. 지금은 빈 자리, 로고 에셋이 생기면 여기에.
            const Expanded(flex: 5, child: SizedBox.shrink()),
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                _MenuButton(label: '새로하기', onPressed: () => context.push('/new-game')),
                const SizedBox(height: 16),
                _MenuButton(label: '이어하기', onPressed: () => context.push('/continue')),
                const SizedBox(height: 16),
                _MenuButton(label: '종료', onPressed: onExit),
              ],
            ),
            const SizedBox(height: 80),
          ],
        ),
      ),
    );
  }
}

class _MenuButton extends StatelessWidget {
  const _MenuButton({required this.label, required this.onPressed});
  final String label;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 240,
      height: 56,
      child: ElevatedButton(onPressed: onPressed, child: Text(label, style: const TextStyle(fontSize: 18))),
    );
  }
}
