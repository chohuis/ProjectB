import 'package:flutter/material.dart';

/// [04_메시지함](../../../../04_UI기획/04_메시지함.md) — 이벤트·캐릭터
/// 콘텐츠가 있어야 채울 수 있는 인박스라(I8 콘텐츠 저작 전제, 여러
/// Phase 기록에서 이미 보류 확정) 지금은 4허브 내비게이션 목적지만
/// 확보해두는 자리표시자.
class InboxPlaceholderScreen extends StatelessWidget {
  const InboxPlaceholderScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Center(child: Text('메시지함은 콘텐츠 저작(I8) 이후에 채워집니다.'));
  }
}
