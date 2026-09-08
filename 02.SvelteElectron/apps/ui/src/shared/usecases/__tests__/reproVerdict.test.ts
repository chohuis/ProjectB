/**
 * `check:measurerepro` 의 판정 — **멈춘 판에 초록을 찍지 않는가.**
 *
 * 🔴 왜 있나 (2026-09-08 · A). 그 검사는 「두 판이 같은가」만 물었다. 그래서
 *   두 판이 **같은 자리에서 같이 멈추면** 통과했다 — 「멈춘 것이 재현되면
 *   초록」이다. 실제로 씨앗 20260802 이 `정지 2026W32` 로 서는데 ✅ 가 찍혔고,
 *   그 초록 때문에 하루가 지났다. 판정을 10분짜리 판 없이 때릴 수 있게
 *   `scripts/perf/reproVerdict.cjs` 로 꺼냈고, 여기서 못박는다.
 */
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require_ = createRequire(import.meta.url);
const { verdict } = require_(
  resolve(__dirname, "../../../../../../scripts/perf/reproVerdict.cjs"),
) as { verdict: (rows: Record<string, unknown>[]) => { ok: boolean; lines: string[] } };

/** `probe-d-dr-worker.cjs` 의 `RESULT` 줄 모양 */
const done = (over: Partial<Record<string, unknown>> = {}) => ({
  run: 1, why: "완주", 지명: "6R 58P TEAM_KBL_SUWON_KNIGHTS_1", 대학합격: null,
  독립합격: null, 병역: "미필", ovr: 75, velocity: 76, ...over,
});

describe("재현 검사 판정", () => {
  it("두 판이 완주하고 같으면 초록", () => {
    const v = verdict([done({ run: 1 }), done({ run: 2 })]);
    expect(v.ok).toBe(true);
  });

  it("🔴 두 판이 **같은 자리에서 같이 멈추면** 빨강이다 — 예전엔 여기가 초록이었다", () => {
    const stalled = { why: "정지 2026W32", stopWhy: "정지: 진로 최종 선택" };
    const v = verdict([done({ run: 1, ...stalled }), done({ run: 2, ...stalled })]);
    expect(v.ok).toBe(false);
    expect(v.lines.join("\n")).toContain("완주 못 했다");
    // 사유를 같이 적는다 — 「정지」만으로는 설계대로 멈춘 것과 못 가린다
    expect(v.lines.join("\n")).toContain("정지: 진로 최종 선택");
  });

  it("한 판만 멈춰도 빨강", () => {
    const v = verdict([done({ run: 1 }), done({ run: 2, why: "4시즌 넘김" })]);
    expect(v.ok).toBe(false);
  });

  it("완주했는데 결과가 갈리면 빨강 — 재현성 쪽 판정은 그대로다", () => {
    const v = verdict([done({ run: 1, ovr: 75 }), done({ run: 2, ovr: 73 })]);
    expect(v.ok).toBe(false);
    expect(v.lines.join("\n")).toContain("안 같다");
  });

  it("판이 안 끝났으면 그것부터 말한다 — 재현 여부를 가릴 것이 없다", () => {
    const v = verdict([{ run: 1, fail: "RESULT 못 읽음" }, done({ run: 2 })]);
    expect(v.ok).toBe(false);
    expect(v.lines.join("\n")).toContain("판이 안 끝났다");
  });
});
