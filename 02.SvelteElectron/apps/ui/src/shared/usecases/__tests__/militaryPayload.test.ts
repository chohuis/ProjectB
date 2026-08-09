import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// ── 정수형 페이로드에 소수를 넘기지 않는다 ──────────────────────
//
// Rust `MilitaryWeekPayload`는 스탯이 전부 `u32`/`i32`인데 주인공 스탯은
// 소수다(피로 62.125 · 스태미나 54.3). serde가 소수를 정수로 못 받아
// **호출 전체가 `{error}`로 떨어졌고**, TS가 그걸 확인 없이 읽어
// `undefined`가 스탯에 들어가 **피로가 NaN이 됐다.**
//
// 그래서 **군 복무 주간 계산이 통째로 안 돌고 있었다** — 계급별 스탯 변화도,
// 사기·피로 변화도 전부. 전역해서 훈련 계산이 도는 순간 터졌다.
// 60회 진로 조사에서 10회가 이걸로 죽었고 **전부 군 경로**였다.
//
// ⚠ 이 검사는 두 가지를 본다. 하나만 보면 다음에 또 놓친다:
//   ① 넘기는 쪽이 반올림하는가
//   ② 받는 쪽이 `{error}`를 삼키지 않는가  ← 이게 없어서 조용히 NaN이 됐다

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("군 복무 주간 계산 페이로드", () => {
  it("스탯을 정수로 반올림해서 넘긴다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    const call = s.slice(s.indexOf("weekCalcMilitary("), s.indexOf("weekCalcMilitary(") + 900);
    for (const f of ["stamina", "recovery", "command", "control", "velocity", "morale", "fatigue"]) {
      expect(call, `${f}가 반올림 없이 넘어간다`).toMatch(
        new RegExp(`${f}:\\s*Math\\.round\\(`),
      );
    }
  });

  it("결과의 오류를 삼키지 않는다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/\[군 복무\] 주간 계산 실패/);
  });

  it("Rust 쪽이 여전히 정수형이다 — f64로 바뀌면 반올림이 불필요해진다", () => {
    // 전제가 바뀌면 이 검사가 알려준다. 그때 위 두 검사를 다시 판단하면 된다
    const s = read("packages/engine-native/src/week_engine.rs");
    expect(s).toMatch(/pub struct MilitaryWeekPayload[\s\S]{0,600}pub fatigue: i32/);
  });

  it("다른 페이로드에 같은 함정이 없다 — 정수형에 소수 스탯을 받는 구조체", () => {
    // ⚠ 개별 확인이 아니라 **전수**로 본다. 군 복무만 고치고 끝내면
    // 다음 IPC에서 같은 모양이 또 생긴다.
    const FLOATY = new Set(["stamina", "recovery", "command", "control", "velocity",
      "movement", "mentality", "clutch", "hold_runners", "fatigue", "condition", "morale"]);
    const dir = resolve(ROOT, "packages/engine-native/src");
    const bad: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".rs"))) {
      const s = readFileSync(resolve(dir, f), "utf8");
      for (const m of s.matchAll(/pub struct (\w*(?:Payload|Params))\b[^{]*\{([\s\S]*?)\n\}/g)) {
        if (m[1] === "MilitaryWeekPayload") continue;      // 알려진 자리 — 위에서 반올림한다
        for (const fm of m[2].matchAll(/pub (\w+):\s*(?:u8|u32|i32|usize|u64|i64)\b/g)) {
          if (FLOATY.has(fm[1])) bad.push(`${m[1]}.${fm[1]}`);
        }
      }
    }
    expect(bad, `정수형인데 소수 스탯이 올 수 있다:\n  ${bad.join("\n  ")}`).toEqual([]);
  });
});
