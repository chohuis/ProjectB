/**
 * **지금 화면을 잠가야 하는가** — 주 진행 중이거나 경기 차례일 때.
 *
 * 🔴 실제 플레이에서 나온 것이다(2026-08-28): "다음 주 진행"을 누른 뒤
 *   **탭을 옮길 수 있었고**, 경기 차례에도 다른 화면으로 갈 수 있었다.
 *   진행이 끝나기 전에 화면을 바꾸면 반쯤 갱신된 상태를 보게 된다.
 *
 * ⚠ **여기 로직을 넣지 않는다.** `advancing`은 `TopHeader`가 켜고 끄고,
 *   경기 차례인지는 `seasonStore`의 대기 동작이 이미 안다 —
 *   이 스토어는 **화면 사이에 값을 나르기만** 한다
 *   (CLAUDE.md: store는 상태 보관 + 얇은 패처).
 *
 * ⚠ **`advancing`을 `TopHeader` 안에만 두면 안 된다.** 거기 지역 변수라
 *   내비게이션이 볼 방법이 없었다 — 그게 이 결함의 원인이다.
 */
import { writable } from "svelte/store";

export const advancingStore = writable(false);
