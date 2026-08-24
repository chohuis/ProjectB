import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 은퇴자를 로드에서 가볍게 읽는가.
 *
 * 🔴 `getAllNpcs`가 `SELECT * FROM npc`였다. 은퇴자의 능력치·성적·이력 블롭까지
 *    전부 실렸다. 실측(씨앗 20260731 · 3시즌): 9,769명 중 은퇴자 3,458명(35%),
 *    로드 무게 **17,003KB → 12,040KB (29.2% 절감)**.
 *
 * ⚠ **행 자체를 빼면 안 된다.** 관계도·커리어 결산이 `npcs`에서 `personId`로
 *   이름을 찾는다 — 빼면 은퇴한 감독·동료가 ID로 떨어진다.
 *   그래서 이름·소속은 남기고 무거운 json 칼럼만 안 읽는다.
 */
const DB = readFileSync(
  join(__dirname, "../../../../../desktop/ipc/slotdb.cjs"), "utf8");

describe("은퇴자 로드 분리", () => {
  it("`SELECT * FROM npc`를 통째로 읽지 않는다", () => {
    expect(DB, "필터 없는 전체 조회가 살아 있다")
      .not.toMatch(/getAllNpcs\(db\)\s*\{\s*return db\.prepare\("SELECT \* FROM npc"\)/);
  });

  it("현역과 은퇴자를 갈라 읽는다", () => {
    expect(DB).toMatch(/career_status != 'retired'/);
    expect(DB).toMatch(/career_status = 'retired'/);
  });

  it("은퇴자에게 무거운 json 칼럼을 안 읽는다", () => {
    const m = DB.match(/FROM npc WHERE career_status = 'retired'/);
    expect(m, "은퇴자 전용 조회가 없다").toBeTruthy();
    // 은퇴자 SELECT 절에 블롭 칼럼이 들어가면 절감이 사라진다
    const sel = DB.slice(DB.indexOf("const retired = db.prepare("),
                         DB.indexOf("career_status = 'retired'"));
    for (const heavy of ["abilities_json", "stats_json", "emotion_json",
                         "highlights_json", "xp_json"]) {
      expect(sel, `은퇴자 조회에 ${heavy}가 들어 있다 — 절감이 사라진다`)
        .not.toMatch(new RegExp(heavy));
    }
  });

  it("이름과 소속은 남긴다 (ID로 떨어지면 안 된다)", () => {
    const sel = DB.slice(DB.indexOf("const retired = db.prepare("),
                         DB.indexOf("career_status = 'retired'"));
    for (const keep of ["npc_id", "name", "current_team", "current_league"]) {
      expect(sel, `은퇴자 조회에 ${keep}가 없다 — 화면이 ID를 흘린다`)
        .toMatch(new RegExp(keep));
    }
  });
});
