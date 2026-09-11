import { describe, it, expect } from "vitest";
import {
  buildRows,
  countByGroup,
  sortRows,
  previewLine,
  relationTag,
  type OffseasonEvent,
  type PersonLookup,
} from "../offseasonReport";

const ev = (kind: string, npcId: string, fromTeamId?: string, detail?: string): OffseasonEvent => ({
  kind,
  npcId,
  fromTeamId,
  detail,
});

const who = (npcId: string, name: string, age = 25, position = "SS"): PersonLookup => ({
  npcId,
  name,
  age,
  position,
});

describe("사람 단위 병합", () => {
  it("⚠ 한 사람의 두 사건이 두 줄로 나오지 않는다", () => {
    // 류혁식은 `→ 2군 (야수 자리 확보)` 뒤에 `방출 (점수 65)`로 목록 양쪽 끝에
    // 떨어져 있어 모순처럼 읽혔다. 실제로는 *2군에 내려갔다 방출* 한 사건이다
    const rows = buildRows({
      events: [
        ev("demote_fielder", "N1", "TEAM_KBL_SEOUL_ROYALS_1"),
        ev("release_score", "N1", "TEAM_KBL_SEOUL_ROYALS_2", "65"),
      ],
      people: [who("N1", "류혁식")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].reason).toBe("2군 → 방출");
    expect(rows[0].group).toBe("release");
  });

  it("결론은 마지막 사건이다 — 순서가 곧 경과다", () => {
    const rows = buildRows({
      events: [ev("promote", "N1", "T_1"), ev("release_roster", "N1", "T_1")],
      people: [who("N1", "가")],
    });
    expect(rows[0].group).toBe("release");

    const flipped = buildRows({
      events: [ev("release_roster", "N1", "T_1"), ev("promote", "N1", "T_1")],
      people: [who("N1", "가")],
    });
    expect(flipped[0].group).toBe("move");
  });

  it("같은 말이 반복되면 결론만 쓴다", () => {
    const rows = buildRows({
      events: [ev("demote_roster", "N1", "T_1"), ev("demote_fielder", "N1", "T_1")],
      people: [who("N1", "가")],
    });
    expect(rows[0].reason).toBe("2군 (야수 자리)"); // "2군 → 2군"이 아니다
  });

  it("팀은 마지막 사건의 소속 — 방출된 자리가 맞다", () => {
    const rows = buildRows({
      events: [ev("demote_fielder", "N1", "TEAM_A_1"), ev("release_score", "N1", "TEAM_A_2", "65")],
      people: [who("N1", "가")],
    });
    expect(rows[0].teamId).toBe("TEAM_A_2");
  });

  it("소속이 빈 사건만 있어도 앞선 소속을 살린다", () => {
    const rows = buildRows({
      events: [ev("release_roster", "N1", "TEAM_A_1"), ev("retire_no_team", "N1")],
      people: [who("N1", "가")],
    });
    expect(rows[0].teamId).toBe("TEAM_A_1");
  });
});

describe("이름 조회", () => {
  it("⚠ 못 찾은 사람 자리에 ID를 채우지 않는다 — 그게 이번에 고친 결함이다", () => {
    const rows = buildRows({ events: [ev("retire_age", "N9", "T_1")], people: [] });
    expect(rows[0].name).toBe("(기록 없음)");
    expect(rows[0].name).not.toContain("N9");
  });

  it("모르는 종류는 지어내지 않고 버린다", () => {
    const rows = buildRows({
      events: [ev("나중에 생길 무언가", "N1", "T_1"), ev("retire_age", "N2", "T_1")],
      people: [who("N1", "가"), who("N2", "나")],
    });
    expect(rows.map((r) => r.npcId)).toEqual(["N2"]);
  });
});

describe("내 팀 판정", () => {
  it("⚠ 2군도 내 팀이다", () => {
    const rows = buildRows({
      events: [ev("release_roster", "N1", "TEAM_KBL_SEOUL_ROYALS_2")],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(true);
  });

  it("다른 구단은 아니다", () => {
    const rows = buildRows({
      events: [ev("release_roster", "N1", "TEAM_KBL_BUSAN_WAVES_1")],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(false);
  });

  it("소속이 없으면 내 팀이 아니다", () => {
    const rows = buildRows({
      events: [ev("retire_no_team", "N1")],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(false);
  });
});

describe("집계와 정렬", () => {
  it("헤드라인은 사건이 아니라 사람 수다", () => {
    const counts = countByGroup(
      buildRows({
        events: [
          ev("demote_fielder", "N1", "T_1"),
          ev("release_score", "N1", "T_2", "65"),
          ev("retire_age", "N2", "T_1"),
        ],
        people: [who("N1", "가"), who("N2", "나")],
      }),
    );
    expect(counts).toEqual({ retire: 1, release: 1, move: 0, fa: 0 });
  });

  it("내 팀 → 아는 사람 → 나머지 순으로 올라온다", () => {
    const rows = buildRows({
      events: [
        ev("retire_age", "N1", "TEAM_B_1"),
        ev("retire_age", "N2", "TEAM_C_1"),
        ev("retire_age", "N3", "TEAM_A_1"),
      ],
      people: [who("N1", "남", 40), who("N2", "지인", 39), who("N3", "우리", 20)],
      myTeamId: "TEAM_A_1",
      relations: new Map([["N2", "동료"]]),
    });
    expect(sortRows(rows).map((r) => r.npcId)).toEqual(["N3", "N2", "N1"]);
  });

  it("preview가 규모를 말한다 — 예전엔 logs[0]이라 'FA 미계약 2명'만 떴다", () => {
    expect(previewLine({ retire: 852, release: 81, move: 17, fa: 2 })).toBe(
      "은퇴 852 · 방출 81 · 승격·강등 17 · FA 미계약 2",
    );
    expect(previewLine({ retire: 0, release: 0, move: 0, fa: 0 })).toBe("특별한 이동이 없었다");
  });
});

describe("인연 라벨", () => {
  it("⚠ 친밀도가 아니라 관계 종류다 — 화면에 '이수욱 중립'으로 떴었다", () => {
    expect(relationTag("teammate")).toBe("동료");
    expect(relationTag("rival")).toBe("라이벌");
  });

  it("선수가 아닌 관계는 목록에 안 붙는다", () => {
    for (const k of ["manager", "coach", "owner", ""]) {
      expect(relationTag(k)).toBeNull();
    }
  });
});

describe("FA 계약 — 간 곳이 있는 사건", () => {
  const evTo = (
    npcId: string,
    from: string | undefined,
    to: string,
    detail?: string,
  ): OffseasonEvent => ({ kind: "fa_contract", npcId, fromTeamId: from, toTeamId: to, detail });

  it("🔴 fa_contract가 알려진 종류다 — 매핑이 없으면 화면이 조용히 걸러낸다", () => {
    // Rust가 사건을 남기기 시작했는데 여기 KIND에 없어서,
    // 계측에는 보이는데 오프시즌 소식에만 안 뜬다. 오류는 안 난다.
    const rows = buildRows({
      events: [evTo("N1", "T_OLD_1", "T_NEW_1", "20000→35000·82")],
      people: [who("N1", "장민호")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].group).toBe("fa");
    expect(rows[0].reason).toBe("FA 계약");
  });

  it("팀은 **간 곳**을 보여준다 — FA는 어디로 갔나가 요점이다", () => {
    const rows = buildRows({
      events: [evTo("N1", "T_OLD_1", "T_NEW_1")],
      people: [who("N1", "가")],
    });
    expect(rows[0].teamId).toBe("T_NEW_1");
  });

  it("⚠ 내 팀이 **데려온** FA도 내 것으로 잡힌다", () => {
    // 떠난 팀만 보면 영입이 안 잡힌다 — 그게 가장 보고 싶은 소식인데도.
    const rows = buildRows({
      events: [evTo("N1", "TEAM_KBL_BUSAN_WAVES_1", "TEAM_KBL_SEOUL_ROYALS_1")],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(true);
  });

  it("내 팀에서 **나간** FA도 여전히 잡힌다", () => {
    const rows = buildRows({
      events: [evTo("N1", "TEAM_KBL_SEOUL_ROYALS_1", "TEAM_KBL_BUSAN_WAVES_1")],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(true);
  });

  it("상관없는 팀끼리의 계약은 내 것이 아니다 — 대조군", () => {
    const rows = buildRows({
      events: [evTo("N1", "TEAM_KBL_BUSAN_WAVES_1", "TEAM_KBL_DAEGU_TIGERS_1")],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(false);
  });

  it("간 곳이 없는 사건은 예전대로 떠난 팀을 보인다 — 회귀 방지", () => {
    const rows = buildRows({
      events: [ev("release_roster", "N1", "T_OLD_1", "70")],
      people: [who("N1", "가")],
    });
    expect(rows[0].teamId).toBe("T_OLD_1");
  });
});
