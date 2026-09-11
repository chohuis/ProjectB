import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * **시즌이 넘어가도 기록 칸이 살아남는가** (2026-08-28).
 *
 * 🔴 KBO 기록표 전 칸을 채워 놓고 `history_lb_stats`엔 그 칸을 안 만들었다.
 *   저장 코드도 안 넣었다. 그래서 **시즌이 넘어가는 순간** 2루타·3루타·
 *   득점·사구·희생번트·희생플라이·피홈런·득점권이 통째로 사라졌고,
 *   화면(`PlayerDetailModal`)은 과거 연도 행에서 전부 `—`였다.
 *
 * ⚠ **네 층을 다 봐야 한다.** 하나만 넓히면 조용히 null이 된다:
 *
 *     스키마(db.cjs v12) → INSERT(main.cjs) → 저장(seasonRollover) → 복원(LeaguePage)
 *
 * 실측: 12칸 전부 저장→조회 왕복 확인.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const PIT = ["hr_p", "hbp_p", "risp_ab_p", "risp_h_p"];
const BAT = ["b2", "b3", "r_b", "hbp_b", "sac", "sf", "risp_ab_b", "risp_h_b"];

describe("과거 시즌 기록 칸", () => {
  const DB = read("apps/desktop/ipc/db.cjs");
  const MAIN = read("apps/desktop/main.cjs");
  const ROLL = read("apps/ui/src/shared/usecases/seasonRollover.ts");
  const LP = read("apps/ui/src/pages/league/LeaguePage.svelte");

  it("스키마에 12칸이 있다", () => {
    expect(DB).toContain("if (currentVersion < 12) {");
    for (const c of [...PIT, ...BAT]) expect(DB, c).toContain(`"${c}"`);
  });

  /** 🔴 v12를 v11 **앞**에 넣으면 뒤 블록이 버전을 덮어써 영원히 다시 돈다 */
  it("v12가 v11 뒤에 온다", () => {
    expect(DB.indexOf("currentVersion < 12")).toBeGreaterThan(DB.indexOf("currentVersion < 11"));
  });

  it("INSERT가 12칸을 싣는다", () => {
    for (const c of [...PIT, ...BAT]) expect(MAIN, c).toContain(c);
    // 자리표시자 수가 컬럼 수와 맞는가 — 어긋나면 런타임에 죽는다
    const at = MAIN.indexOf("INSERT OR REPLACE INTO history_lb_stats");
    const body = MAIN.slice(at, MAIN.indexOf("`", at));
    const cols = body.slice(body.indexOf("(") + 1, body.lastIndexOf(")")).split(",").length;
    const marks = (body.match(/\?/g) ?? []).length;
    // ⚠ v13(수비 4칸)에서 44 → 48. **이 숫자를 안 고치면 v13이 빨간불이다**
    expect(marks, `컬럼 ${cols} · 자리표시자 ${marks}`).toBe(48);
  });

  it("저장이 12칸을 보낸다", () => {
    for (const k of [
      "hrP:",
      "hbpP:",
      "rispAbP:",
      "rispHP:",
      "b2:",
      "b3:",
      "rB:",
      "hbpB:",
      "sac:",
      "sf:",
      "rispAbB:",
      "rispHB:",
    ]) {
      expect(ROLL, k).toContain(k);
    }
  });

  it("복원이 12칸을 되살린다", () => {
    for (const c of [...PIT, ...BAT]) expect(LP, c).toContain(`r.${c}`);
  });

  /**
   * 🔴 **`?? 0`으로 채우지 않는다.** v12 이전 세이브엔 값이 없고, 0으로 채우면
   *   "피홈런 0개인 투수"가 되어 기록이 거짓이 된다 — `season-helpers`가
   *   같은 이유로 `undefined`를 지키고 있다.
   */
  it("구 세이브를 0으로 채우지 않는다", () => {
    expect(LP).toContain("...(r.hr_p  != null ? { hr:  r.hr_p  } : {})");
    expect(LP.includes("hr: r.hr_p ?? 0")).toBe(false);
    expect(LP.includes("b2: r.b2 ?? 0")).toBe(false);
  });
});
