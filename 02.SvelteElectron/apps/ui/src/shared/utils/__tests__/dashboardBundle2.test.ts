import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import {
  buildTableView, inferAlign, isScoreCell, ID_COLUMN_KIND, ID_LIST_COLUMN_KIND,
  type NameLookup,
} from "../dashboardView";
import { parseDashboardLabels, tableCopy } from "../dashboardCopy";
import type { TableMetadata } from "../../types/main";

/**
 * 묶음 2 표시부 — 경기 결과 · 내 경기 · 트레이드 · 강등 · 웨이버
 * (`PLAN_MESSAGE_DASHBOARDS.md` §1·§4).
 *
 * 🔴 **여기는 표시부만이다.** 값을 배열로 만드는 생산부(`weekPhases/market.ts`
 *    등)는 A 몫이라 안 건드렸다 — 그래서 검사도 **값이 없거나 낯설 때 화면이
 *    어떻게 서는가**를 본다. 값이 붙으면 그대로 돈다.
 *
 * 🔴 **id 를 이름으로 바꾸는 자리가 화면인 이유**가 이 파일의 절반이다.
 *    이름은 표시 언어를 타므로(`teamMap`·`entityMap` 이 `language` 파생이다)
 *    생산부가 이름을 굳혀 실으면 영어로 바꿔도 그 소식만 한글로 남는다.
 */
const MASTER = resolve(__dirname, "../../../../../../resource/data/master");
const LABELS = parseDashboardLabels(
  JSON.parse(readFileSync(join(MASTER, "messages/dashboard_labels.json"), "utf8")),
);
const TABLE_SRC = readFileSync(
  join(__dirname, "../../../features/messages/ui/StatTable.svelte"), "utf8");

/** 이름표 — 아는 id 만 답한다. 모르는 id 는 화면이 그대로 둬야 한다 */
const NAMES: NameLookup = {
  team:   (id) => ({ TEAM_A: "북악고", TEAM_B: "한성고" })[id],
  person: (id) => ({ NPC_1: "김민수", NPC_2: "박정호" })[id],
};

const view = (md: TableMetadata, names?: NameLookup) =>
  buildTableView(md, tableCopy(LABELS, md.kind), false, names);
const textsOf = (v: ReturnType<typeof view>, ri = 0) => v.rows[ri].cells.map((c) => c.text);

describe("문안이 다섯 자리를 갖는다", () => {
  it("종류 다섯이 dashboard_labels.json 에 있다", () => {
    for (const k of ["leagueResults", "officialResult", "npcTrade", "demote", "waiver"]) {
      expect(tableCopy(LABELS, k).title, `${k} 문안이 없다`).not.toBe("");
    }
  });

  it("빈 표의 한 줄도 종류마다 따로다", () => {
    // 「경기가 없었다」와 「말소된 선수가 없다」는 다른 말이다 — 하나로 묶으면 뜻이 샌다
    const empties = ["leagueResults", "officialResult", "npcTrade", "demote", "waiver"]
      .map((k) => tableCopy(LABELS, k).empty);
    expect(new Set(empties).size).toBe(empties.length);
  });
});

describe("경기 결과 — 점수는 가운데다", () => {
  const md: TableMetadata = {
    type: "table", kind: "leagueResults", columns: [],
    rows: [{ away: "한성고", score: "1 : 3", home: "북악고" }],
  };

  it("문안이 선언한 순서로 열이 선다", () => {
    // 원정이 먼저다 — 본문 줄과 같은 방향이어야 한다(사용자 U6)
    expect(view(md).columns.map((c) => c.key)).toEqual(["away", "score", "home"]);
    expect(view(md).columns.map((c) => c.label)).toEqual(["원정", "점수", "홈"]);
  });

  it("점수 칸은 가운데, 팀 이름은 왼쪽", () => {
    // ⚠ `isNumericCell` 이 `3 : 1` 을 숫자로 본다(구분자에 `:` 가 있다) —
    //   그대로 두면 오른쪽에 붙어 두 팀 이름 사이에서 한쪽으로 쏠린다
    const cols = view(md).columns;
    expect(cols[0].align).toBe("left");
    expect(cols[1].align).toBe("center");
    expect(cols[2].align).toBe("left");
  });

  it("점수 꼴을 가른다", () => {
    expect(isScoreCell("3 : 1")).toBe(true);
    expect(isScoreCell("10:0")).toBe(true);
    expect(isScoreCell("3 : 1 : 2"), "세 토막은 점수가 아니다").toBe(false);
    expect(isScoreCell("연장 : 승"), "숫자가 아니면 점수가 아니다").toBe(false);
    expect(isScoreCell(12)).toBe(false);
  });

  it("행이 없어도 머리글이 선다", () => {
    const empty = view({ ...md, rows: [] });
    expect(empty.columns).toHaveLength(3);
    expect(empty.empty).toBe("이번 주에는 경기가 없었습니다.");
  });
});

describe("내 경기 — 항목·값 두 칸이다", () => {
  const md: TableMetadata = {
    type: "table", kind: "officialResult", columns: [],
    rows: [{ item: "ip", value: "6.0" }, { item: "dec", value: "승" }],
  };

  it("열이 항목·값 둘이다", () => {
    expect(view(md).columns.map((c) => c.key)).toEqual(["item", "value"]);
  });

  it("항목 값이 문안을 거친다 — 「ip」 가 아니라 「IP」 다", () => {
    expect(textsOf(view(md))).toEqual(["IP", "6.0"]);
    expect(textsOf(view(md), 1)).toEqual(["결과", "승"]);
  });

  it("연습경기도 같은 행 이름을 쓴다", () => {
    const friendly = view({ ...md, kind: "friendlyResult" });
    expect(textsOf(friendly)[0]).toBe("IP");
    expect(friendly.empty).toBe("이번 연습경기에는 나가지 않았습니다.");
  });
});

describe("트레이드 — 구단 id 가 이름이 된다", () => {
  const md: TableMetadata = {
    type: "table", kind: "npcTrade", columns: [],
    rows: [{ teamId: "TEAM_A", players: ["NPC_1", "NPC_2"] } as never],
  };

  it("id 열이 이름으로 바뀐다", () => {
    expect(textsOf(view(md, NAMES))[0]).toBe("북악고");
  });

  it("모르는 id 는 그대로 둔다 — 빈 칸이면 왜 비었는지 안 남는다", () => {
    const unknown = view({ ...md, rows: [{ teamId: "TEAM_ZZ", players: [] } as never] }, NAMES);
    expect(textsOf(unknown)[0]).toBe("TEAM_ZZ");
  });

  it("이름표가 없어도 표가 선다 — id 를 그대로 그린다", () => {
    expect(textsOf(view(md))[0]).toBe("TEAM_A");
  });

  it("여럿이 든 칸은 이름을 이어 붙인다", () => {
    expect(textsOf(view(md, NAMES))[1]).toBe("김민수 · 박정호");
  });

  it("생산부가 문자열을 보내도 그대로 그린다", () => {
    // 규격이 아직 배열을 안 담는다 — 어느 쪽이 와도 안 깨져야 한다
    const asText = view({ ...md, rows: [{ teamId: "TEAM_B", players: "김민수, 박정호" }] }, NAMES);
    expect(textsOf(asText)).toEqual(["한성고", "김민수, 박정호"]);
  });

  it("id 열은 왼쪽이다 — 숫자 id 가 오른쪽에 서지 않게", () => {
    expect(inferAlign("teamId", [{ teamId: 12 }])).toBe("left");
    expect(ID_COLUMN_KIND.teamId).toBe("team");
    expect(ID_LIST_COLUMN_KIND.players).toBe("person");
  });
});

describe("엔트리 말소 — 비고는 문안이 만든다", () => {
  const md: TableMetadata = {
    type: "table", kind: "demote", columns: [],
    rows: [{ npcId: "NPC_1", note: 10 }],
  };

  it("선수 id 가 이름이 된다", () => {
    expect(textsOf(view(md, NAMES))[0]).toBe("김민수");
  });

  it("주 수만 실어도 문장이 된다", () => {
    // 🔴 문장을 소식에 굳혀 보내면 화면이 바뀔 때 지난 소식만 옛 문장으로 남는다
    expect(textsOf(view(md, NAMES))[1]).toBe("10주간 재등록 불가");
  });

  it("비고 칸은 왼쪽이다 — 숫자로 실려 와도 찍히는 건 문장이다", () => {
    expect(view(md, NAMES).columns[1].align).toBe("left");
  });

  it("어떤 행에만 비고가 있으면 나머지는 빈 칸이다 — 말을 지어내지 않는다", () => {
    const mixed = view({ ...md, rows: [{ npcId: "NPC_1", note: 10 }, { npcId: "NPC_2" }] }, NAMES);
    expect(textsOf(mixed, 1)).toEqual(["박정호", "—"]);
  });

  it("아무 행에도 비고가 없으면 그 열을 아예 안 세운다", () => {
    // 묶음 1 이 그은 선이다 — 빈 열을 그리면 표가 넓어져 1366×768 에서 밀린다
    const bare = view({ ...md, rows: [{ npcId: "NPC_2" }] }, NAMES);
    expect(bare.columns.map((c) => c.key)).toEqual(["npcId"]);
  });
});

describe("웨이버 공시 — 한 열이다", () => {
  const md: TableMetadata = {
    type: "table", kind: "waiver", columns: [], rows: [{ npcId: "NPC_2" }],
  };

  it("선수 이름 한 열", () => {
    const v = view(md, NAMES);
    expect(v.columns.map((c) => c.label)).toEqual(["선수"]);
    expect(textsOf(v)).toEqual(["박정호"]);
  });

  it("아무도 없으면 그 종류의 한 줄이 뜬다", () => {
    expect(view({ ...md, rows: [] }).empty).toBe("공시된 선수가 없습니다.");
  });
});

describe("등판 없음 — 빈 칸과 뜻이 다르다", () => {
  const md: TableMetadata = {
    type: "table", kind: "tourMy", columns: [],
    rows: [{ round: "8강", opp: "한성고", score: "3 : 1", result: "승", myLine: "" }],
  };

  it("내 기록이 비면 「등판 없음」이다", () => {
    // 경기는 있었고 내가 안 나간 것이다 — `—` 로 두면 왜 비었는지 안 남는다
    const v = view(md);
    const cell = v.rows[0].cells.find((c) => c.key === "myLine");
    expect(cell?.text).toBe("등판 없음");
  });

  it("대표팀 전적도 같다", () => {
    const natl = view({
      type: "table", kind: "natlResult", columns: [],
      rows: [
        { opp: "일본", score: "2 : 4", myLine: "5이닝 2실점" },
        { opp: "대만", score: "6 : 1", myLine: null },
      ],
    });
    expect(natl.rows[1].cells.find((c) => c.key === "myLine")?.text).toBe("등판 없음");
  });

  it("값이 있으면 그대로다", () => {
    const v = view({ ...md, rows: [{ ...md.rows[0], myLine: "6이닝 1실점" }] });
    expect(v.rows[0].cells.find((c) => c.key === "myLine")?.text).toBe("6이닝 1실점");
  });
});

describe("이름을 화면이 붙인다 — 배선", () => {
  it("StatTable 이 언어 파생 스토어에서 이름을 찾는다", () => {
    expect(TABLE_SRC, "teamMap 을 안 읽는다").toContain("teamMap");
    expect(TABLE_SRC, "entityMap 을 안 읽는다").toContain("entityMap");
    expect(TABLE_SRC, "이름표를 안 넘긴다").toContain("names");
  });
});
