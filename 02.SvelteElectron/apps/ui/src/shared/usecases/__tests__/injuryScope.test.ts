import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 부상이 **전 리그에서** 나는가 (3단계 선행).
 *
 * 🔴 `processNpcInjuries` 가 `s.schedule` 만 훑고 있었다 — 그건 **주인공 리그**
 *   일정이다. 나머지는 `s.leagueSchedules` 에 따로 있는데 안 봤다.
 *   그래서 **주인공이 고교생이면 프로 선수는 아무도 안 다쳤다.**
 *
 *   실측(씨앗 111 · 2시즌):
 *       고교(주인공 리그)  3,060명 중 부상 227~291명
 *       프로 1군+2군       2,600명 중 부상   0~6명   ← 고치기 전
 *       프로 1군+2군                       207~265명 ← 고친 뒤
 *
 * ⚠ 데이터는 다 있었다 — 배경 리그도 `playerLines` 를 만든다
 *   (KBL 780경기 16,345줄). **보는 쪽만 좁았다.**
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

/** 주석을 지운다 — 안 쓰는 이유를 적어 둔 주석이 통과시키면 안 된다 */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("부상 범위", () => {
  const src = strip(read("apps/ui/src/shared/usecases/weekPhases/injuries.ts"));

  it("주인공 리그 밖도 훑는다", () => {
    expect(src.includes("s.leagueSchedules"), "배경 리그 일정을 본다").toBe(true);
    expect(src.includes("allSchedules"), "일정 묶음").toBe(true);
  });

  it("주인공 일정도 여전히 넣는다", () => {
    // 배경만 보면 주인공 리그가 빠진다 — 반대 방향 실수
    expect(src.includes("[s.schedule]")).toBe(true);
  });

  it("증분 캐시를 그대로 쓴다", () => {
    // 리그가 늘어도 매주 **새 주차만** 훑어야 한다.
    // 캐시를 안 쓰면 5,600명 × 9리그를 매주 다시 센다
    expect(src.includes("lastScannedWeek")).toBe(true);
    expect(src.includes("entry.week <= _injuryAppCache.lastScannedWeek")).toBe(true);
  });

  it("주인공은 NPC 부상 경로에서 뺀다", () => {
    // 주인공 부상은 따로 있다 — 두 경로가 같은 사람을 다치게 하면 안 된다
    expect(src.includes("line.playerId === protagonistId")).toBe(true);
  });
});
