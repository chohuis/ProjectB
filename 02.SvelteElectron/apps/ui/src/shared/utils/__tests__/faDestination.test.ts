import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { faDestinationLeagues } from "../faEngine";
import { ALL_TEAMS_BY_LEAGUE } from "../leagueScheduler";

/**
 * **FA로 어디까지 갈 수 있는가.**
 *
 * 🔴 예전엔 자기 리그 팀만 후보였다(`faEngine.ts:73`). 그 한 줄이
 *   **나가는 길(KBL→해외)과 돌아오는 길(해외→KBL)을 동시에** 막았다 —
 *   NPC는 이미 오가는데(`market.ts`) 주인공만 못 갔다.
 *
 * ⚠ **2군은 열지 않는다.** refs에서 KBL 1군(`_1`)과 2군(`_2`)이 **같은
 *   `leagueId`**를 써서, 리그로만 거르면 2군이 들어온다 —
 *   실측으로 `TEAM_KBL_CHANGWON_STARS_2`와 3년 계약이 된 적이 있다.
 *   `ALL_TEAMS_BY_LEAGUE`가 1군·2군을 나눠 담는 것이 그 방어다.
 */

const PRO = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];

describe("FA 목적지", () => {
  it("프로끼리는 서로 오간다 — 나가는 길과 돌아오는 길이 같다", () => {
    for (const from of PRO) {
      const dest = faDestinationLeagues(from);
      for (const to of PRO) expect(dest, `${from} → ${to}`).toContain(to);
    }
  });

  // 🔴 2군 계약은 FA가 아니다 — 3단계(아마추어 직행)가 따로 연다
  it("목적지에 2군이 없다", () => {
    for (const from of PRO) {
      for (const lid of faDestinationLeagues(from)) {
        expect(lid, `${from}의 목적지`).not.toMatch(/_FARM$/);
      }
    }
  });

  it("아마추어는 FA가 없다 — 원래 리그만", () => {
    for (const from of ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"]) {
      expect(faDestinationLeagues(from)).toEqual([from]);
    }
  });

  /**
   * 🔴 **후보 팀에 2군 ID가 하나도 없어야 한다.**
   *   목적지 리그가 맞아도 그 리그의 팀 목록에 2군이 섞이면 소용없다.
   */
  it("목적지 리그의 팀 목록에 2군 ID가 없다", () => {
    for (const from of PRO) {
      for (const lid of faDestinationLeagues(from)) {
        const ids = ALL_TEAMS_BY_LEAGUE[lid] ?? [];
        expect(ids.length, `${lid} 팀 목록이 비었다`).toBeGreaterThan(0);
        const farm = ids.filter((id) => id.endsWith("_2"));
        expect(farm, `${lid}에 2군: ${farm.join(", ")}`).toEqual([]);
      }
    }
  });

  /**
   * ⚠ **Rust가 다시 거르면 안 된다.** 두 곳이 같은 일을 하면 한쪽만
   *   고쳤을 때 아무 일도 안 일어난다 — 실제로 그래서 한 번 헛돌았다.
   */
  it("Rust는 리그로 다시 거르지 않는다", () => {
    const src = readFileSync(
      resolve(__dirname, "../../../../../../packages/engine-native/src/player_engine.rs"),
      "utf8",
    );
    const at = src.indexOf("pub fn generate_fa_offers");
    expect(at, "generate_fa_offers를 못 찾았다").toBeGreaterThan(0);
    const body = src.slice(at, at + 1200);
    expect(body).not.toMatch(/t\.league_id == params\.league_id/);
  });
});
