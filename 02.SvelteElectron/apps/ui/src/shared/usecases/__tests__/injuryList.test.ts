import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 부상자 명단(IL) — 3단계.
 *
 * 🔴 **부상자가 정원을 차지하고 있었다.** 콜업 판정에서는 이미 빼는데
 *   (`injuredPlayerIds`) **정원 계산에는 남아서**, 대체 선수가 올라오면
 *   상한을 넘었다.
 *
 *   실제 야구의 IL 이 하는 일이 이것이다 — **자리를 비운다.**
 *
 * ⚠ 콜업은 1:1 교체(`replacesPlayerId`)라 정원이 안 늘어난다. IL 로 자리를
 *   비워 놔도 채울 길이 없어서, **IL 수만큼 순증**을 허용해야 한다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("부상자 명단(IL)", () => {
  const src = strip(read("apps/ui/src/shared/usecases/weekPhases/market.ts"));

  it("정원을 IL 제외로 센다", () => {
    expect(src.includes("const ilCount = active.filter"), "IL 인원").toBe(true);
    expect(src.includes("const activeCount = active.length - ilCount"), "정원").toBe(true);
  });

  it("콜다운 판정도 IL 제외 수를 쓴다", () => {
    // 부상자를 세면 하한을 넘은 줄 알고 내려서 1군이 마른다
    expect(src.includes("currentRosterSize: activeCount"), "엔진에 넘기는 정원").toBe(true);
    expect(src.includes("activeCount > minRosterSize"), "하한 판정").toBe(true);
  });

  it("IL 만큼 순증을 허용하되 상한을 안 넘는다", () => {
    // 순증이 무한하면 IL 이 로스터 상한을 통째로 무력화한다
    expect(src.includes("urgentSlots")).toBe(true);
    expect(src.includes("activeCount >= maxRosterSize"), "상한에서 멈춘다").toBe(true);
    expect(src.includes("maxRosterSize - activeCount"), "남은 자리만큼").toBe(true);
  });

  it("정원을 넘으면 상시에도 내린다", () => {
    // 🔴 콜다운이 정기(월 첫 주)에만 최대 2명이라 순증을 못 따라갔다.
    //   실측: IL 제외 기준으로도 4~12팀 초과 → 1~7팀으로 줄었다.
    expect(src.includes("const overCap = activeCount > maxRosterSize")).toBe(true);
    expect(src.includes("(!urgentOnly || overCap)")).toBe(true);
  });

  it("초과분만큼 내린다", () => {
    // 2명 고정이면 크게 넘친 팀이 여러 주 걸린다
    expect(src.includes("activeCount - maxRosterSize")).toBe(true);
  });

  it("⚠ 상시 콜다운은 **초과일 때만** 돈다", () => {
    // 늘 돌면 매주 로스터가 출렁인다 — 기존 주석의 경고다
    expect(src.includes("if (!urgentOnly && activeCount > minRosterSize)"),
      "무조건 상시로 바꾸면 안 된다").toBe(false);
  });
});
