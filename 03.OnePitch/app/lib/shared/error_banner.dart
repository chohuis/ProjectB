import 'package:flutter/material.dart';

/// 그동안 화면마다 제각각 `Text('오류: $e', color: Colors.red)`로
/// 흩어져 있던 에러 표시를 하나로 통일 — 대부분 폼 제출 실패·엔진 예외
/// 처럼 사라지지 않고 계속 봐야 하는 메시지라 스낵바(사라짐)보다
/// 화면에 남는 배너가 맞다고 판단.
class ErrorBanner extends StatelessWidget {
  const ErrorBanner({super.key, required this.message});
  final String message;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: double.infinity,
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(color: scheme.errorContainer, borderRadius: BorderRadius.circular(8)),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(Icons.error_outline, color: scheme.onErrorContainer, size: 20),
          const SizedBox(width: 8),
          Expanded(child: Text(message, style: TextStyle(color: scheme.onErrorContainer))),
        ],
      ),
    );
  }
}
