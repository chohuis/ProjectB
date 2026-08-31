import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { careerTotalsOf } from "../careerSummary";
import type { CareerSeasonRecord } from "../../types/save";

/**
 * **화면이 표시하는 값이 실제로 채워지는가** (2026-08-28).
 *
 * 감사에서 "화면은 표시하는데 채우는 코드가 없거나 늘 기본값"인 자리를 찾았다.
 * 여기 셋을 못박는다:
 *
 *   ① 리그 버킷이 로드에서 정리를 안 거쳤다 — **리더보드가 읽는 쪽**인데
 *      `hydrateFromSlot`은 주인공 개인 버킷만 `sanitizeStatsRecord`에 넣었다.
 *   ② 통산 출루율 식이 시즌 식과 달랐다 — 분자에 사구가 없고 분모가 `pa`라
 *      **희생번트가 들어갔다**(야구 규칙은 AB+BB+HBP+SF).
 *   ③ `StatusPage`에 **타자 분기가 없었다** — 집계는 되는데 표시할 코드가
 *      없어 주인공이 타자면 "시즌 누적 집계 중"만 떴다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const rec = (stats: CareerSeasonRecord["stats"]): CareerSeasonRecord =>
  ({ year: 2030, leagueId: "LEAGUE_KBL", teamId: "T", statLine: "", ovr: 70,
     awards: [], stats } as CareerSeasonRecord);

describe("기록 표시 배선", () => {
  it("리그 버킷도 로드에서 정리한다", () => {
    const S = read("apps/ui/src/shared/stores/season.ts");
    expect(S).toContain("stats: sanitizeStatsRecord(m.stats)");
  });

  /**
   * ⚠ **`migrateLeagueState` 안에서 하면 안 된다** — 그 함수는 **경기마다** 돈다
   *   (`backgroundLeague`). 전 리그 성적을 매번 훑으면 주 진행이 느려진다.
   */
  it("경기마다 도는 자리에서는 정리하지 않는다", () => {
    const H = read("apps/ui/src/shared/utils/season-helpers.ts");
    const at = H.indexOf("export function migrateLeagueState");
    const body = H.slice(at, H.indexOf("\n}", at));
    expect(body.includes("sanitizeStatsRecord")).toBe(false);
  });

  /** 🔴 통산 OBP가 시즌 OBP와 같은 식이어야 한다 */
  it("통산 출루율이 사구를 세고 희생번트를 안 센다", () => {
    // AB 100 · H 30 · BB 10 · HBP 5 · SAC 4 · SF 1
    // OBP = (30+10+5) / (100+10+5+1) = 45/116 = .388
    const t = careerTotalsOf([rec({
      type: "batter", g: 100, pa: 120, ab: 100, h: 30, hr: 5, rbi: 20,
      sb: 0, bb: 10, k: 20, avg: 0.3, obp: 0, slg: 0.5, ops: 0,
      hbp: 5, sac: 4, sf: 1,
    } as CareerSeasonRecord["stats"])]);
    expect(t.batting?.obp).toBe(".388");
  });

  /** ⚠ 구 세이브엔 사구·희생타가 없다 — 옛 식(AB+BB)으로 떨어져야 한다 */
  it("구 세이브는 옛 식으로 떨어진다", () => {
    // (30+10) / (100+10) = .364
    const t = careerTotalsOf([rec({
      type: "batter", g: 100, pa: 110, ab: 100, h: 30, hr: 5, rbi: 20,
      sb: 0, bb: 10, k: 20, avg: 0.3, obp: 0, slg: 0.5, ops: 0,
    } as CareerSeasonRecord["stats"])]);
    expect(t.batting?.obp).toBe(".364");
  });

  /** 🔴 없는 것과 0을 가른다 — 0이면 "통산 피홈런 0인 투수"가 되어 거짓이다 */
  it("구 세이브의 없는 칸을 0으로 만들지 않는다", () => {
    const t = careerTotalsOf([rec({
      type: "pitcher", g: 30, gs: 30, w: 10, l: 10, sv: 0, hd: 0,
      ip: 180, er: 60, h: 170, k: 150, bb: 50, era: 3.0, whip: 1.2,
    } as CareerSeasonRecord["stats"])]);
    expect(t.pitching?.hr).toBeUndefined();
    expect(t.pitching?.hbp).toBeUndefined();
  });

  it("있으면 통산으로 합친다", () => {
    const one = { type: "pitcher", g: 30, gs: 30, w: 10, l: 10, sv: 0, hd: 0,
      ip: 180, er: 60, h: 170, k: 150, bb: 50, era: 3.0, whip: 1.2,
      hr: 14, hbp: 6 } as CareerSeasonRecord["stats"];
    const t = careerTotalsOf([rec(one), rec(one)]);
    expect(t.pitching?.hr).toBe(28);
    expect(t.pitching?.hbp).toBe(12);
  });

  /** 🔴 집계는 되는데 표시할 코드가 없었다 */
  it("성적 화면에 타자 분기가 있다", () => {
    const SP = read("apps/ui/src/pages/status/StatusPage.svelte");
    expect(SP).toContain('selectedSeasonStats?.type === "batter"');
    for (const k of ['"2B"', '"3B"', '"R"', '"HBP"', '"SAC"', '"SF"', '"OPS"']) {
      expect(SP, k).toContain(k);
    }
  });
});
