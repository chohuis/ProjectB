import { describe, it, expect } from "vitest";
import { postingInterest, POSTING_INTEREST_MIN, type PostingInput } from "../postingInterest";

/**
 * 해외 구단 관심도 — **팀 상대로 갈리는가.**
 *
 * 🔴 1단계에서 후보 풀만 열었더니 **OVR 75~77에게 해외 제안이 84%**였다.
 *   조건이 없으면 KBL에 남을 이유가 사라진다.
 *
 * ⚠ 실측(2026-08-27) 팀 로스터 평균 — 이 검사가 쓰는 근거다:
 *     ABL 1군 최강 85 · 최약 73 · JBL 1군 최강 84 · 최약 69
 *     ABL 2군 66 · JBL 2군 63
 */

/** 그 평균 근처로 팀 하나를 만든다 — 실제 로스터 모양(±6)을 흉내낸다 */
const team = (mean: number, n = 12): number[] =>
  Array.from({ length: n }, (_, i) => mean - 6 + (i / (n - 1)) * 12);

function mk(over: Partial<PostingInput> = {}): PostingInput {
  return {
    teamPitcherOvrs: team(80), pitchingOvr: 76, scoutScore: 40,
    fame: 40, proServiceYears: 5, awardCount: 0, ...over,
  };
}

describe("포스팅 관심도", () => {
  it("같은 선수라도 팀이 세면 관심이 낮다", () => {
    const weak = postingInterest(mk({ teamPitcherOvrs: team(73) }));   // ABL 최약
    const strong = postingInterest(mk({ teamPitcherOvrs: team(85) })); // ABL 최강
    expect(weak).toBeGreaterThan(strong);
  });

  // 🔴 팀 간 격차(11~15)가 리그 차이(7)보다 크다 — 그게 실제로 갈려야 한다
  it("팀 간 격차가 관심도에 실제로 나타난다", () => {
    const weak = postingInterest(mk({ teamPitcherOvrs: team(73) }));
    const strong = postingInterest(mk({ teamPitcherOvrs: team(85) }));
    expect(weak - strong).toBeGreaterThan(20);
  });

  it("잘하면 관심이 높다", () => {
    expect(postingInterest(mk({ pitchingOvr: 88 })))
      .toBeGreaterThan(postingInterest(mk({ pitchingOvr: 68 })));
  });

  it("성적이 좋으면 관심이 오른다", () => {
    expect(postingInterest(mk({ recentEra: 2.5 })))
      .toBeGreaterThan(postingInterest(mk({ recentEra: 5.5 })));
  });

  // ⚠ 없는 것을 나쁨으로 보면 안 된다 — 부상·2군 체류로 표본이 없을 수 있다
  it("성적이 없으면 중립이다 — 벌하지 않는다", () => {
    const none = postingInterest(mk({ recentEra: undefined }));
    const bad  = postingInterest(mk({ recentEra: 6.5 }));
    const good = postingInterest(mk({ recentEra: 2.5 }));
    expect(none).toBeGreaterThan(bad);
    expect(none).toBeLessThan(good);
  });

  it("수상과 명성이 관심을 올린다", () => {
    expect(postingInterest(mk({ awardCount: 2 }))).toBeGreaterThan(postingInterest(mk()));
    expect(postingInterest(mk({ fame: 90 }))).toBeGreaterThan(postingInterest(mk({ fame: 20 })));
  });

  // ⚠ 어릴수록 산다 — 서른 넘어 나가는 건 드물다
  it("연차가 너무 적거나 많으면 깎인다", () => {
    const mid = postingInterest(mk({ proServiceYears: 5 }));
    expect(postingInterest(mk({ proServiceYears: 1 }))).toBeLessThan(mid);
    expect(postingInterest(mk({ proServiceYears: 13 }))).toBeLessThan(mid);
  });

  /**
   * 🔴 **팀 로스터가 안 넘어와도 전 구단이 무관심이 되면 안 된다.**
   *   배선이 빠졌을 때 "아무도 안 부른다"로 나타나면 원인을 못 찾는다.
   */
  it("팀 로스터가 비어도 실력을 본다 — 조용히 0이 되지 않는다", () => {
    const empty = postingInterest(mk({ teamPitcherOvrs: [], pitchingOvr: 90 }));
    expect(empty).toBeGreaterThan(POSTING_INTEREST_MIN);
  });

  it("0~100 안이다", () => {
    for (const ovr of [40, 55, 70, 85, 99]) {
      for (const mean of [60, 73, 80, 85]) {
        const v = postingInterest(mk({ pitchingOvr: ovr, teamPitcherOvrs: team(mean) }));
        expect(v, `OVR ${ovr} · 팀 ${mean}`).toBeGreaterThanOrEqual(0);
        expect(v, `OVR ${ovr} · 팀 ${mean}`).toBeLessThanOrEqual(100);
      }
    }
  });

  // 🔴 이게 이번 단계가 막으려는 것이다
  it("평범한 KBL 선수가 ABL 최강팀의 관심을 못 받는다", () => {
    const v = postingInterest(mk({ pitchingOvr: 76, teamPitcherOvrs: team(85) }));
    expect(v, `관심도 ${v.toFixed(1)}`).toBeLessThan(POSTING_INTEREST_MIN);
  });

  it("잘 키운 선수는 약체 팀의 관심을 받는다", () => {
    const v = postingInterest(mk({ pitchingOvr: 84, teamPitcherOvrs: team(73),
      scoutScore: 55, recentEra: 3.1 }));
    expect(v, `관심도 ${v.toFixed(1)}`).toBeGreaterThan(POSTING_INTEREST_MIN);
  });
});
