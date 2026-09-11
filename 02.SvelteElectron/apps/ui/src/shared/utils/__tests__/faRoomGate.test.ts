import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { FA_INTEREST_MIN } from "../faEngine";

/**
 * **주인공 FA가 갈 수 없는 팀까지 세고 있었다.**
 *
 * 🔴 NPC FA는 후보를 고를 때 `npc_sim.rs`의 `open`으로 **정원 여유와 외국인
 *   한도를 둘 다** 본다("여유를 안 보면 FA가 캡을 통과한다"). 주인공 경로엔
 *   그 문지기가 **통째로 없었다** — 정원이 찬 팀도 제안을 보냈다.
 *
 * ⚠ **문턱으로 가릴 일이 아니었다.** 관심도가 이산값이라 문턱은 전부/전무로만
 *   갈린다 — 실측(2026-08-27): 40 → 평균 16.9개 · 45 → 1.1개. 사이가 없다.
 *   제안이 많았던 건 문턱이 낮아서가 아니라 **갈 수 없는 팀을 셌기** 때문이다.
 *
 * ⚠ 정규식을 안 쓴다 — 이스케이프가 어긋나면 검사가 조용히 헛돈다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (rel: string) => readFileSync(resolve(ROOT, rel), "utf8");

const TS = read("apps/ui/src/shared/utils/faEngine.ts");
const RULES = JSON.parse(read("resource/data/master/players/generation_rules.json")) as {
  faRules?: { bidInterestMin?: number };
  foreignRules?: { leagues?: string[]; perTeam?: number; maxPitchers?: number };
};

describe("주인공 FA 후보 문지기", () => {
  it("정원이 찬 팀은 후보에서 뺀다", () => {
    expect(TS.includes("activeCountOf(team.id) >= rosterMaxOf(team.leagueId)")).toBe(true);
    // 🔴 걸러 놓고 안 쓰면 아무 일도 안 일어난다 — 실제로 pool에 물렸는지 본다
    expect(TS.includes("poolAll0.filter((t) => hasRoomFor(")).toBe(true);
  });

  it("외국인 보유 한도도 같이 본다", () => {
    expect(TS.includes("held >= f.perTeam")).toBe(true);
    expect(TS.includes("pit >= f.maxPitchers")).toBe(true);
    // 규칙 파일에 그 값이 실제로 있어야 문지기가 산다
    expect(RULES.foreignRules?.perTeam).toBeGreaterThan(0);
    expect(RULES.foreignRules?.maxPitchers).toBeGreaterThan(0);
  });

  /**
   * 🔴 **`isForeignInQuotaLeague`를 쓰면 안 된다.** 그건 "한도가 있는 리그에서
   *   외국인인가"라 **한국인이 ABL에 갈 때도 참**이다 — 나가는 길이 막힌다.
   *   목적지 리그 기준으로 묻는 건 `isForeignPlayer(리그, 국적)`이다.
   *
   * ⚠ **호출을 본다 — 주석은 세지 않는다.** `isForeignInQuotaLeague`는 왜 안
   *   쓰는지 설명하려고 주석에 이름이 남아 있다. 파일 전체에서 찾으면
   *   그 주석이 걸려 **검사가 거짓으로 실패한다.**
   */
  it("한도는 목적지 리그 기준으로 묻는다", () => {
    expect(TS.includes("isForeignPlayer(team.leagueId, nationality)")).toBe(true);
    expect(TS.includes("isForeignInQuotaLeague(")).toBe(false);
  });

  /**
   * 🔴 **표를 두 번 적지 않는다.** NPC FA가 `faRules.bidInterestMin`을 쓴다 —
   *   주인공이 다른 숫자를 쓰면 같은 판정에 잣대가 둘이 된다.
   */
  it("관심도 문턱을 NPC와 같은 파일에서 읽는다", () => {
    expect(TS.includes("rules.faRules?.bidInterestMin ?? FA_INTEREST_MIN")).toBe(true);
    // 폴백 상수도 규칙 파일과 같아야 한다 — 어긋나면 파일을 못 읽을 때만 조용히 갈린다
    expect(FA_INTEREST_MIN).toBe(RULES.faRules?.bidInterestMin);
  });

  /**
   * ⚠ **규칙 파일을 한 번만 연다.** 예전엔 리그 배수만 따로 읽었다 —
   *   정원·문턱까지 각각 읽으면 같은 파일을 세 번 열고 표가 흩어진다.
   */
  it("규칙 파일을 한 번만 읽는다", () => {
    const n = TS.split("loadRosterRules").length - 1;
    expect(n).toBe(2); // import 한 번 + 호출 한 번
  });
});
