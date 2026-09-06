// ── 계측 모드 ──────────────────────────────────────────────────────────────
//
// 🔴 **주인공 경기는 실제 플레이에서 씨앗을 안 받는다** (사용자 확정 2026-09-07).
// 게임 전체 결정성은 목표가 아니고 **계측이 재현되는 수준**까지만이다
// (`CLAUDE.md`). 그래서 씨앗을 넘길지 말지를 여기 한 곳에서 가른다.
//
// ── 왜 `__PB_MEASURE__` 인가 (정본을 하나로 · 2026-09-07) ─────────────────
//
// 후보가 둘이었다:
//   · `DRIVE_USER_DATA=1` — 실제 앱을 띄우는 네 스크립트(`smoke:dist`,
//     `measure:role`, `probe:hscloser`, `probe:military`)의 **사용자 데이터
//     디렉터리 스위치**다. 계측을 뜻하는 이름이 아니고, 쓰는 곳도 저 넷뿐이다.
//   · **헤드리스 부팅** — `scripts/perf/headless.cjs`의 `boot()`. 재현성을
//     보는 계측(`probe-d-*`)·회귀(`test-savebatch`)가 **전부** 여기를 지난다.
//
// 그래서 정본은 헤드리스 부팅이다. `boot()`이 번들을 `require` 하기 전에
// `globalThis.__PB_MEASURE__ = true` 를 심는다. 실제 Electron 렌더러에는
// 그 값을 심는 곳이 없으므로 **실제 플레이는 늘 false** 다.
//
// ⚠ 여기를 켜면 주인공 경기·투자가 씨앗 아래로 들어간다. **게임 규칙은
//   한 줄도 안 바뀐다** — 난수의 출처만 `thread_rng` → `StdRng(씨앗)` 이다.

/** 계측 모드인가 — 헤드리스 부팅에서만 참이다 */
export function isMeasureMode(): boolean {
  return (globalThis as { __PB_MEASURE__?: boolean }).__PB_MEASURE__ === true;
}
