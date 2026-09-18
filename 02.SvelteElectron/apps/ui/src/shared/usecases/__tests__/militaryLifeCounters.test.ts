import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **군 전용 계수기 배선** (2026-09-18 · D ·
 * `docs/SIM_102_YARDSTICK_2026-09-18.md` ⓑ).
 *
 * 군 복무 주는 등급 시스템(eventFunnel)을 애초에 안 타서 `tierCounters`가
 * 못 본다 — 그래서 `militaryLife.ts`에 계측 전용 계수기(`militaryLifeCounters`)를
 * 심었다. 실제 플레이 경로가 안 바뀌었는지가 이 검사의 핵심이다:
 *
 *   ① 늘리는 자리 둘 다 `isMeasureMode()` 가드 뒤에 있다 — 가드를 빼면 이 검사가 죽는다
 *   ② 헤드리스 프로브(`perfEntry.ts`)가 **같은 객체**를 읽는다 — 따로 사본을 만들면
 *      판 JSON은 늘 0을 찍는데 아무도 모른다(값과 읽는 자리가 따로 노는 함정)
 *   ③ 계측 워커가 그 프로브를 실제로 부른다(초기화 + 해마다 델타) — 안 부르면
 *      ①②가 다 맞아도 판 JSON에는 안 실린다
 */
const ROOT = resolve(__dirname, "../../../../../..");
const MIL_SRC = readFileSync(resolve(__dirname, "../militaryLife.ts"), "utf8");
const PERF_SRC = readFileSync(resolve(ROOT, "scripts/perf/perfEntry.ts"), "utf8");
const WORKER_SRC = readFileSync(resolve(ROOT, "scripts/probe-a-simrun-worker.cjs"), "utf8");

describe("군 전용 계수기 — 계측 모드 배선", () => {
  it("캘린더 히트는 isMeasureMode() 가드 뒤에서만 늘어난다", () => {
    expect(MIL_SRC).toContain("if (isMeasureMode()) militaryLifeCounters.캘린더++;");
  });

  it("40% 뽑기 성공은 isMeasureMode() 가드 뒤에서만 늘어난다", () => {
    expect(MIL_SRC).toContain("if (isMeasureMode()) militaryLifeCounters.뽑기++;");
  });

  it("대조군 — 가드 없이 늘어나는 자리가 새로 생기면 잡는다", () => {
    // ⚠ 위 두 검사가 문자열이 "어딘가에 있다"만 보므로, 가드 없는 증가문이
    //   섞여 들어와도 안 걸릴 수 있다 — 늘어나는 문장 자체를 전수로 훑어
    //   전부 같은 줄에 `isMeasureMode()`가 있는지 본다.
    const bumps = [...MIL_SRC.matchAll(/militaryLifeCounters\.(캘린더|뽑기)\+\+/g)];
    expect(bumps.length, "늘리는 자리가 없다 — 훅이 빠졌다").toBeGreaterThan(0);
    for (const m of bumps) {
      const lineStart = MIL_SRC.lastIndexOf("\n", m.index) + 1;
      const line = MIL_SRC.slice(lineStart, MIL_SRC.indexOf("\n", m.index));
      expect(line, `가드 없이 늘어난다: ${line}`).toContain("isMeasureMode()");
    }
  });

  it("헤드리스 프로브가 같은 객체를 읽는다 — 사본을 따로 만들지 않는다", () => {
    expect(PERF_SRC).toContain('} from "../../apps/ui/src/shared/usecases/militaryLife";');
    expect(PERF_SRC).toContain("militaryLifeCounters,");
    expect(PERF_SRC).toContain("resetMilitaryLifeCounters,");
    // 읽는 함수가 진짜 그 값을 돌려준다 — 새 객체를 만들어 늘 {0,0}을 내는
    // 가짜 구현이면 여기서 걸린다
    expect(PERF_SRC).toContain("export function militaryCounters(");
    expect(PERF_SRC).toContain("return { ...militaryLifeCounters };");
  });

  it("계측 워커가 초기화·해마다 델타 양쪽에서 실제로 부른다", () => {
    expect(WORKER_SRC).toContain("app.resetMilitaryCounters();");
    expect(WORKER_SRC).toContain("app.militaryCounters();");
    // simYearRow에 델타가 실제로 넘어간다 — 계산만 하고 안 넘기면 판 JSON엔 0이다
    expect(WORKER_SRC).toContain("app.simYearRow(d, now.통지 - prev.통지, yearAt, milD)");
  });
});
