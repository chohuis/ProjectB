import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";

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
 *
 * 🔴 **소스 문자열을 자르던 검사였다** (2026-09-05에 고쳤다). `slotdb.cjs`에서
 *    SELECT 절을 `indexOf`로 잘라 정규식으로 훑었는데, 칼럼 목록을 상수로
 *    빼자 자르는 자리가 어긋나 **빈 문자열을 검사하며 통과**하려 했다.
 *    지금은 SQL을 만들 때 쓰는 **그 배열**(`RETIRED_NPC_COLUMNS`)을 그대로
 *    읽는다 — 목록이 바뀌면 검사도 같이 움직인다.
 *
 * 짝: `retiredNpcContract.test.ts` — 이 목록으로 읽은 행이 Rust 계약을
 *     만족하는지 **진짜 바이너리**에 넣어 본다.
 */
const require_ = createRequire(import.meta.url);
const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = resolve(HERE, "../../../../../..");
const slotdb = require_(resolve(ROOT, "apps/desktop/ipc/slotdb.cjs")) as {
  RETIRED_NPC_COLUMNS: string[];
};
const COLS = slotdb.RETIRED_NPC_COLUMNS;

describe("은퇴자 로드 분리", () => {
  it("은퇴자에게 무거운 json 칼럼을 안 읽는다", () => {
    for (const heavy of [
      "abilities_json",
      "xp_json",
      "form_json",
      "personality_json",
      "injury_json",
      "extra_json",
      "stats_json",
      "emotion_json",
      "highlights_json",
    ]) {
      expect(COLS, `은퇴자 조회에 ${heavy}가 들어 있다 — 절감이 사라진다`).not.toContain(heavy);
    }
  });

  it("이름과 소속은 남긴다 (ID로 떨어지면 안 된다)", () => {
    for (const keep of ["npc_id", "name", "current_team", "current_league"]) {
      expect(COLS, `은퇴자 조회에 ${keep}가 없다 — 화면이 ID를 흘린다`).toContain(keep);
    }
  });

  it("스칼라 칼럼은 다 읽는다 — 좁게 읽으면 저장이 지운다", () => {
    // 🔴 `military_status`가 빠져서 실사용자 세이브가 죽었다 (2026-09-05).
    //    좁게 읽은 값이 `syncNpcs`의 폴백으로 되쓰여 은퇴자 869명이 전원
    //    「미필」·성장률 50·잠재 75·연봉 0이 돼 있었다. 스칼라는 크기가
    //    고정이라 아껴서 얻는 게 없다 — 아끼는 건 블롭뿐이다.
    for (const scalar of [
      "military_status",
      "military_json",
      "development_rate",
      "potential_hidden",
      "salary",
      "contract_years",
      "pro_service_years",
      "age",
      "career_status",
    ]) {
      expect(COLS, `은퇴자 조회에 ${scalar}가 없다 — 저장이 폴백값으로 덮는다`).toContain(scalar);
    }
  });
});
