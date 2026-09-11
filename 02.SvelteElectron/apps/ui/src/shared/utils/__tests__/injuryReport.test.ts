import { describe, it, expect } from "vitest";
import {
  buildRows,
  countByClass,
  sortRows,
  previewLine,
  classify,
  type InjuryEvent,
  type PersonLookup,
} from "../injuryReport";

const ev = (o: Partial<InjuryEvent> = {}): InjuryEvent => ({
  npcId: "N1",
  injuryType: "UCL_PARTIAL",
  severity: "moderate",
  weeks: 4,
  week: 10,
  teamId: "TEAM_A_1",
  ...o,
});
const who = (npcId: string, name: string, age = 25): PersonLookup => ({
  npcId,
  name,
  age,
  position: "SP",
});

describe("등급", () => {
  it("심한 순서로 갈린다", () => {
    expect(classify(ev({ retired: true, severity: "surgery" }), 20)).toBe("retired");
    expect(classify(ev({ severity: "surgery", weeks: 40 }), 20)).toBe("surgery");
    expect(classify(ev({ weeks: 25 }), 20)).toBe("season_out");
    expect(classify(ev({ weeks: 10 }), 20)).toBe("long");
    expect(classify(ev({ weeks: 3 }), 20)).toBe("short");
  });

  it("⚠ 수술이 시즌 아웃보다 위다 — 능력치가 영구히 깎인다", () => {
    expect(classify(ev({ severity: "surgery", weeks: 56 }), 20)).toBe("surgery");
  });

  it("⚠ 시즌 남은 주를 모르면 시즌 아웃이라고 하지 않는다", () => {
    expect(classify(ev({ weeks: 25 }), 0)).toBe("long");
  });

  it("경계 — 남은 주와 같으면 시즌 아웃이다", () => {
    expect(classify(ev({ weeks: 20 }), 20)).toBe("season_out");
    expect(classify(ev({ weeks: 19 }), 20)).toBe("long");
  });
});

describe("사람 단위 병합", () => {
  it("⚠ 한 달에 두 번 다치면 더 심한 쪽이 결론이다", () => {
    const rows = buildRows({
      events: [
        ev({ npcId: "N1", weeks: 3, week: 9 }),
        ev({ npcId: "N1", severity: "surgery", weeks: 40, week: 11 }),
      ],
      people: [who("N1", "가")],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].cls).toBe("surgery");
  });

  it("순서가 뒤집혀도 결론은 같다 — 경과가 아니라 상태다", () => {
    const rows = buildRows({
      events: [
        ev({ npcId: "N1", severity: "surgery", weeks: 40, week: 9 }),
        ev({ npcId: "N1", weeks: 3, week: 11 }),
      ],
      people: [who("N1", "가")],
    });
    expect(rows[0].cls).toBe("surgery");
  });

  it("같은 등급이면 나중 것 — 더 최근 상태다", () => {
    const rows = buildRows({
      events: [
        ev({ npcId: "N1", weeks: 3, week: 9, injuryType: "A" }),
        ev({ npcId: "N1", weeks: 3, week: 11, injuryType: "B" }),
      ],
      people: [who("N1", "가")],
    });
    expect(rows[0].injuryType).toBe("B");
  });

  it("못 찾은 사람 자리에 ID를 채우지 않는다", () => {
    const rows = buildRows({ events: [ev({ npcId: "N9" })], people: [] });
    expect(rows[0].name).toBe("(기록 없음)");
    expect(rows[0].name).not.toContain("N9");
  });
});

describe("내 팀", () => {
  it("⚠ 2군도 내 팀이다", () => {
    const rows = buildRows({
      events: [ev({ teamId: "TEAM_KBL_SEOUL_ROYALS_2" })],
      people: [who("N1", "가")],
      myTeamId: "TEAM_KBL_SEOUL_ROYALS_1",
    });
    expect(rows[0].mine).toBe(true);
  });
});

describe("집계와 정렬", () => {
  it("사람 수를 센다 — 두 번 다쳐도 하나", () => {
    const counts = countByClass(
      buildRows({
        events: [
          ev({ npcId: "N1", weeks: 3 }),
          ev({ npcId: "N1", severity: "surgery", weeks: 40 }),
          ev({ npcId: "N2", weeks: 3 }),
        ],
        people: [who("N1", "가"), who("N2", "나")],
        weeksLeftInSeason: 20,
      }),
    );
    expect(counts).toEqual({ retired: 0, surgery: 1, season_out: 0, long: 0, short: 1 });
  });

  it("내 팀 → 아는 사람 → 오래 빠지는 순", () => {
    const rows = buildRows({
      events: [
        ev({ npcId: "N1", teamId: "TEAM_B_1", weeks: 30 }),
        ev({ npcId: "N2", teamId: "TEAM_C_1", weeks: 20 }),
        ev({ npcId: "N3", teamId: "TEAM_A_1", weeks: 2 }),
      ],
      people: [who("N1", "남"), who("N2", "지인"), who("N3", "우리")],
      myTeamId: "TEAM_A_1",
      relations: new Map([["N2", "동료"]]),
    });
    expect(sortRows(rows).map((r) => r.npcId)).toEqual(["N3", "N2", "N1"]);
  });

  it("⚠ preview에 단기를 앞세우지 않는다 — 수술 3건이 묻힌다", () => {
    expect(previewLine({ retired: 1, surgery: 3, season_out: 0, long: 4, short: 200 })).toBe(
      "부상 은퇴 1 · 수술 3 · 장기 4",
    );
    expect(previewLine({ retired: 0, surgery: 0, season_out: 0, long: 0, short: 12 })).toBe(
      "가벼운 부상 12건",
    );
    expect(previewLine({ retired: 0, surgery: 0, season_out: 0, long: 0, short: 0 })).toBe(
      "새 부상이 없었다",
    );
  });
});
