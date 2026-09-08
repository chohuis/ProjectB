/**
 * 「주가 안 넘어갔다」를 **한 번 보고** 판단하면 안 된다 — 그 규칙을 못박는다.
 *
 * 🔴 왜 있나 (2026-09-08 · A). `check:measurerepro` 의 씨앗 20260802 이
 *   「정지 2026W32」로 섰는데, 엔진은 멀쩡했다. 그 주 pending 이
 *   `[injuryTreatment, draftObserve]` 였고 `runAutoAdvance` 가 앞의 것을
 *   처리한 뒤 뒤의 것에서 **설계대로** 멈춘 것이다(`draftObserve` 는
 *   `STOP_PENDING`). 바깥 계측 루프가 **한 바퀴만 더** 돌았으면
 *   `skipDraftObserve()` 로 지나갔는데, 주가 그대로인 걸 보고 바로 끊었다.
 *
 *   같은 한 줄이 계측·검사 스무 남짓에 베껴져 있었다. `makeStallGuard` 가
 *   그 판단을 한 곳에 모은 것이고, 여기서 그 셈이 맞는지 본다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require_ = createRequire(import.meta.url);
const { makeStallGuard } = require_(
  resolve(__dirname, "../../../../../../scripts/perf/weekLoop.cjs"),
) as { makeStallGuard: (limit?: number) => { hit(moved: boolean): boolean; count(): number } };

describe("makeStallGuard — 연속으로 안 움직일 때만 막힌 것으로 센다", () => {
  it("한 바퀴 안 움직인 것으로는 안 걸린다 — 정지 pending 을 민 정상 경로다", () => {
    const g = makeStallGuard();
    expect(g.hit(false)).toBe(false);
    expect(g.count()).toBe(1);
  });

  it("중간에 한 번이라도 움직이면 셈이 0 으로 돌아간다", () => {
    const g = makeStallGuard();
    g.hit(false);
    g.hit(false);
    expect(g.count()).toBe(2);
    expect(g.hit(true)).toBe(false);
    expect(g.count()).toBe(0);
    // 다시 두 번 안 움직여도 아직 아니다
    expect(g.hit(false)).toBe(false);
    expect(g.hit(false)).toBe(false);
  });

  it("기본 상한 8 — 일곱 번까지는 아니고 여덟 번째에 막힌 것으로 본다", () => {
    const g = makeStallGuard();
    for (let i = 0; i < 7; i++) expect(g.hit(false)).toBe(false);
    expect(g.hit(false)).toBe(true);
  });

  it("상한을 3 으로 주면 세 번째에 걸린다 — 바깥 루프가 셈을 되돌려 줄 때 쓰는 값이다", () => {
    const g = makeStallGuard(3);
    expect(g.hit(false)).toBe(false);
    expect(g.hit(false)).toBe(false);
    expect(g.hit(false)).toBe(true);
  });

  it("상한을 1 로 주면 예전 규칙과 같아진다 — 그게 오탐이 나던 규칙이다", () => {
    const g = makeStallGuard(1);
    expect(g.hit(false)).toBe(true);
  });

  it("실제로 겪은 차례를 그대로 돌린다 — injuryTreatment 뒤 draftObserve 는 정지가 아니다", () => {
    const g = makeStallGuard();
    // ① runOneWeek: injuryTreatment 를 처리하고 draftObserve 에서 멈춘다 (주 그대로)
    expect(g.hit(false)).toBe(false);
    // ② 바깥 루프가 draftObserve 를 건너뛰고 다시 한 주 — 주가 넘어간다
    expect(g.hit(true)).toBe(false);
    expect(g.count()).toBe(0);
  });
});
