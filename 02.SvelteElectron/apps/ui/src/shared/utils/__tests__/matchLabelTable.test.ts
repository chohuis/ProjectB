import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 경기 결과 코드 표 — **엔진이 코드를 늘리면 여기서 깨진다.** (2026-09-01)
 *
 * 🔴 실제로 새어 나갔다. 엔진이 3스트라이크째에 코드를 좁히면서
 *   (`STRIKE_* → STRIKEOUT_*`) 표가 안 따라와 경기 화면에
 *   **`STRIKEOUT_SWING` 이라는 영문이 그대로 떴다.**
 *
 *       투수: 송세준 / 타자: 김혁환 → STRIKEOUT_SWING (4구)   ← 실측
 *
 *   세어 보니 빠진 게 하나가 아니었다 — `match.cjs` 에 **아홉**,
 *   화면 표에 **하나**(`SQUEEZE`). 드문 코드라 아무도 못 봤을 뿐이다.
 *
 * ⚠ **`match.cjs` 머리말이 이미 경고하고 있었다** —
 *   *"예전엔 같은 표가 네 군데였다 … 자동 시뮬은 '삼진'이라 하고 직접
 *   던지면 '헛스윙 스트라이크'가 나오는 식으로 어긋났다."*
 *   한 번 합쳤는데 **다시 갈렸다.** 주석은 갈림을 못 막는다 — 검사가 막는다.
 *
 * ⚠ 목록을 손으로 적지 않는다. 적으면 엔진이 늘 때 검사가 검사를 안 하게 된다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** 정본 — Rust 의 `code_str` 사상표 */
function engineCodes(): string[] {
  const rs = read("packages/engine-native/src/match_engine.rs");
  const i = rs.indexOf("let code_str = match code {");
  const block = rs.slice(i, rs.indexOf("};", i));
  return [...block.matchAll(/=>\s*"([A-Z_]+)"/g)].map((m) => m[1]);
}

/**
 * 표의 키를 긁는다.
 * ⚠ 줄 첫머리만 잡으면 한 줄에 둘 있는 항목을 놓친다
 *   (`STRIKE_SWING: "헛스윙", STRIKE_LOOK: "루킹",`).
 */
function tableKeys(path: string, marker: string): string[] {
  const src = read(path);
  const i = src.indexOf(marker);
  const block = src.slice(i, src.indexOf("};", i));
  return [...block.matchAll(/([A-Z_]{3,}):/g)].map((m) => m[1]);
}

const UI_PATH = "apps/ui/src/shared/utils/matchResult.ts";
const IPC_PATH = "apps/desktop/ipc/match.cjs";

describe("엔진 코드를 두 표가 다 안다", () => {
  it("엔진에서 코드를 읽었다", () => {
    const codes = engineCodes();
    expect(codes.length, "Rust 에서 코드를 못 읽었다 — 정규식이 소스와 어긋났다").toBeGreaterThan(
      15,
    );
    expect(codes).toContain("STRIKEOUT_SWING");
  });

  it("화면 표(`matchResult.ts`)가 다 안다", () => {
    const keys = tableKeys(UI_PATH, "const FLASH_LABEL");
    const missing = engineCodes().filter((c) => !keys.includes(c));
    expect(missing, `표에 없는 코드: ${missing.join(", ")}`).toEqual([]);
  });

  it("IPC 표(`match.cjs`)가 다 안다", () => {
    const keys = tableKeys(IPC_PATH, "const AUTO_SIM_AB_LABEL");
    const missing = engineCodes().filter((c) => !keys.includes(c));
    expect(missing, `표에 없는 코드: ${missing.join(", ")}`).toEqual([]);
  });

  it("타입 유니온(`PitchResultCode`)도 다 안다", () => {
    const src = read(UI_PATH);
    const uni = src.slice(
      src.indexOf("export type PitchResultCode ="),
      src.indexOf("export type BallHitType"),
    );
    const declared = [...uni.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
    const missing = engineCodes().filter((c) => !declared.includes(c));
    expect(missing, `유니온에 없는 코드: ${missing.join(", ")}`).toEqual([]);
  });

  /** 반대 방향 — 엔진이 지운 코드가 표에 남아 있으면 죽은 줄이다 */
  it("표에만 있고 엔진엔 없는 코드가 없다", () => {
    const codes = engineCodes();
    for (const [name, keys] of [
      ["matchResult.ts", tableKeys(UI_PATH, "const FLASH_LABEL")],
      ["match.cjs", tableKeys(IPC_PATH, "const AUTO_SIM_AB_LABEL")],
    ] as const) {
      // 표 이름 자체(`FLASH_LABEL`)는 키가 아니다
      const stale = keys.filter((c) => !codes.includes(c) && !c.endsWith("_LABEL"));
      expect(stale, `${name} 에 죽은 코드: ${stale.join(", ")}`).toEqual([]);
    }
  });
});

/**
 * 🔴 **폴백이 원문이면 안 된다.** 표에 없는 코드가 화면에 영문으로 **조용히**
 *    새는 게 이 결함의 몸통이었다. 눈에 띄게 낸다(`[?CODE]`).
 */
describe("폴백이 원문이 아니다", () => {
  it("화면 쪽", () => {
    const src = read(UI_PATH);
    expect(src, "FLASH_LABEL[code] ?? code — 원문이 샌다").not.toMatch(
      /FLASH_LABEL\[code\]\s*\?\?\s*code/,
    );
    expect(src).toContain("[?${code}]");
  });

  it("IPC 쪽", () => {
    const src = read(IPC_PATH);
    expect(src, "?? ab.resultCode — 원문이 샌다").not.toMatch(/\?\?\s*ab\.resultCode/);
    expect(src).toContain("[?${code}]");
  });
});
