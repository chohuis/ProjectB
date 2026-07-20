import 'package:flutter/material.dart';

/// 화면마다 맨 `CircularProgressIndicator()`만 흩어져 있던 걸 한 위젯으로
/// 모음 — 지금은 스피너+선택적 라벨뿐이지만, 나중에 화면별 스켈레톤으로
/// 바꾸더라도 이 자리 하나만 고치면 전체에 반영된다.
class LoadingIndicator extends StatelessWidget {
  const LoadingIndicator({super.key, this.label});
  final String? label;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const CircularProgressIndicator(),
          if (label != null) ...[const SizedBox(height: 12), Text(label!, style: Theme.of(context).textTheme.bodySmall)],
        ],
      ),
    );
  }
}
