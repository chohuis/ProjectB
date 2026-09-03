import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRankList, buildTableRows, cellAlign, cellText, deltaMark, isNumericCell,
} from "../dashboardView";
import type { RankListMetadata, TableMetadata, Top10Metadata } from "../../types/main";

/**
 * 소식 대시보드 표시부 (PLAN_MESSAGE_DASHBOARDS §2·§3).
 *
 * 🔴 **행을 컴포넌트 안에서 만들면 여기가 한 줄도 못 잰다.** 이 저장소의
 *    vitest 는 `environment: "node"` 라 `.svelte` 를 못 띄운다 —
 *    `myBodyReportView` 가 같은 이유로 갈라져 나왔고 이 파일이 그 짝이다.
 */

const SRC_DIR = join(__dirname, "../../..");
const read = (p: string) => readFileSync(join(SRC_DIR, p), "utf8");

const TABLE = read("features/messages/ui/StatTable.svelte");
const TIMELINE = read("features/messages/ui/TimelinePanel.svelte");
const RANK = read("features/messages/ui/RankListPanel.svelte");
const NEWS = read("pages/news/NewsPage.svelte");
const TYPES = read("shared/types/main.ts");

describe("변동 표시 — 모름과 변동 없음을 가른다", () => {
  /**
   * 🔴 **`0` 으로 채우면 「변동 없음」과 「모름」이 같아 보인다** (§3-1).
   *    첫 달·첫 시즌엔 지난 값이 아예 없다 — 그때는 칸을 안 그려야 한다.
   */
  it("값이 없으면 아무것도 안 그린다", () => {
    expect(deltaMark(undefined), "모르는데 칸을 그린다").toBeNull();
    expect(deltaMark(null)).toBeNull();
    expect(deltaMark(Number.NaN), "숫자가 아닌데 그린다").toBeNull();
  });

  it("0 은 「변동 없음」으로 그린다", () => {
    expect(deltaMark(0)).toEqual({ dir: "flat", text: "—" });
  });

  it("부호를 뒤집지 않는다 — 만드는 쪽이 맞춰 보낸다", () => {
    expect(deltaMark(2), "오른 것을 내린 것으로 그린다").toEqual({ dir: "up", text: "↑2" });
    expect(deltaMark(-1)).toEqual({ dir: "down", text: "↓1" });
  });
});

describe("칸 — 정렬과 글자", () => {
  it("기본은 첫 열만 왼쪽이다", () => {
    expect(cellAlign({ key: "team", label: "팀" }, 0)).toBe("left");
    expect(cellAlign({ key: "w", label: "승" }, 1)).toBe("right");
  });

  /** 대진은 두 팀 이름 칸이 가운데다 — 열이 실어 보내면 기본을 덮는다 */
  it("열이 정렬을 실어 보내면 그게 이긴다", () => {
    expect(cellAlign({ key: "home", label: "", align: "center" }, 1)).toBe("center");
    expect(cellAlign({ key: "round", label: "라운드", align: "right" }, 0)).toBe("right");
  });

  it("빈 칸은 대시다 — 표가 어디서 끊겼는지 보여야 한다", () => {
    expect(cellText(undefined)).toBe("—");
    expect(cellText(null)).toBe("—");
    expect(cellText("")).toBe("—");
  });

  it("숫자를 반올림하지 않는다 — 자릿수에 뜻이 있다", () => {
    expect(cellText(".633"), "승률의 앞 0 을 지우거나 자릿수를 바꿨다").toBe(".633");
    expect(cellText("168.1")).toBe("168.1");
    expect(cellText(0), "0 을 빈 값으로 봤다").toBe("0");
  });

  it("숫자 칸을 골라낸다", () => {
    expect(isNumericCell(38)).toBe(true);
    expect(isNumericCell("3 : 5")).toBe(true);
    expect(isNumericCell("창원 스타스")).toBe(false);
    expect(isNumericCell(undefined)).toBe(false);
  });
});

describe("표 — 행 만들기", () => {
  const md: TableMetadata = {
    type: "table", kind: "digest",
    columns: [
      { key: "team", label: "팀" },
      { key: "w", label: "승" },
      { key: "l", label: "패" },
    ],
    rows: [
      { team: "창원 스타스", w: 38, l: 22, d: 1 },
      { team: "인천 파이러츠", w: 33, l: 27, d: 0, myTeam: true },
      { team: "부산 웨이브스", w: 30, d: -2 },
    ],
    deltaKey: "d",
  };

  it("열 수만큼 칸을 만든다 — 값이 없어도 칸을 안 뺀다", () => {
    const rows = buildTableRows(md);
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.cells, "칸 수가 어긋나면 표가 통째로 밀린다").toHaveLength(3);
    }
    expect(rows[2].cells[2].text, "없는 값을 빈 칸으로 뒀다").toBe("—");
  });

  /**
   * ⚠ 대진은 **내 팀 행이 라운드마다 하나씩 여럿**이라 `highlightRow` 인덱스
   *   하나로는 모자란다 — 행이 든 `myTeam` 을 본다 (§3).
   */
  it("행의 `myTeam` 으로도 강조한다", () => {
    const rows = buildTableRows(md);
    expect(rows[1].highlight, "내 팀 행을 안 짚는다").toBe(true);
    expect(rows[0].highlight).toBe(false);
  });

  it("`highlightRow` 하나짜리도 받는다", () => {
    const rows = buildTableRows({ ...md, rows: md.rows.map((r) => ({ ...r, myTeam: undefined })), highlightRow: 2 });
    expect(rows[2].highlight).toBe(true);
    expect(rows[0].highlight).toBe(false);
  });

  it("`deltaKey` 가 없으면 변동을 안 만든다", () => {
    const rows = buildTableRows({ ...md, deltaKey: undefined });
    for (const r of rows) expect(r.delta, "지난 값이 없는데 변동을 그린다").toBeNull();
  });

  it("`myTeam` 은 열이 아니라 표시다 — 칸으로 새지 않는다", () => {
    const rows = buildTableRows(md);
    const texts = rows[1].cells.map((c) => c.text);
    expect(texts, "표시가 칸으로 새어 나왔다").not.toContain("○");
  });
});

describe("순위 — 두 규격이 한 모양으로 모인다", () => {
  const top10: Top10Metadata = {
    type: "top10", playerType: "pitcher", week: 12, seasonYear: 2027,
    columns: [
      { label: "통합", heroRank: 42, entries: [
        { id: "PLY_HERO", name: "나", teamName: "북악고", rank: 1 },
        { id: "NPC_1", name: "김투수", teamName: "유성고", rank: 2 },
      ] },
      { label: "3학년", heroRank: null, entries: [] },
      { label: "2학년", heroRank: null, entries: [] },
      { label: "1학년", heroRank: null, entries: [] },
    ],
  };

  it("TOP10 은 네 칸 그대로다", () => {
    const v = buildRankList(top10);
    expect(v.columns).toHaveLength(4);
    expect(v.columns[0].entries[0].isMe, "내 줄을 안 짚는다").toBe(true);
    expect(v.columns[0].heroRank).toBe(42);
    expect(v.subtitle).toContain("투수");
  });

  /** ⚠ TOP10 에는 지난 값을 저장하는 자리가 없다 — 변동을 지어내면 안 된다 */
  it("TOP10 에는 변동이 없다", () => {
    const v = buildRankList(top10);
    expect(v.columns[0].entries[0].delta, "없는 지난 값으로 변동을 지어냈다").toBeNull();
  });

  it("순위 목록은 한 칸이다", () => {
    const md: RankListMetadata = {
      type: "rankList", kind: "tourChamp", title: "무궁화기 최종 순위",
      items: [
        { rank: 1, label: "한성고", sub: "우승" },
        { rank: 2, label: "북악고", sub: "준우승", isMe: true, delta: 3 },
      ],
    };
    const v = buildRankList(md);
    expect(v.columns, "한 줄 목록을 네 칸으로 쪼갰다").toHaveLength(1);
    expect(v.subtitle).toBe("무궁화기 최종 순위");
    expect(v.columns[0].entries[1].isMe).toBe(true);
    expect(v.columns[0].entries[1].delta?.text).toBe("↑3");
    expect(v.columns[0].entries[0].delta, "변동을 안 실었는데 그린다").toBeNull();
    expect(v.columns[0].entries[0].id, "id 가 없는 순위인데 상세를 열 수 있다").toBe("");
  });
});

describe("배선 — 화면이 셋을 다 그린다", () => {
  it("`NewsPage` 에 세 갈래가 다 있다", () => {
    for (const t of ["table", "rankList", "timeline"]) {
      expect(NEWS, `metadata.type "${t}" 갈래가 없다 — 구조가 잡힌 값이 본문 텍스트로 나간다`)
        .toContain(`selected.metadata?.type === "${t}"`);
    }
    expect(NEWS).toContain("<StatTable metadata=");
    expect(NEWS).toContain("<TimelinePanel metadata=");
  });

  /** ✅ `ProspectTop10Panel` → `RankListPanel` (§6 ④ 확정) */
  it("옛 이름이 한 군데도 안 남았다", () => {
    expect(NEWS, "옛 이름으로 부르는 자리가 남았다").not.toContain("ProspectTop10Panel");
    expect(NEWS, "TOP10 도 새 이름으로 부른다").toContain("<RankListPanel metadata=");
  });

  /**
   * 🔴 **표 19종에 컴포넌트를 19개 만들지 않는다** (§2). 갈래가 늘면 이
   *    검사가 먼저 깨진다 — 그게 이 검사의 역할이다.
   */
  it("표는 컴포넌트 하나로 끝난다", () => {
    expect(TABLE.includes("export let metadata: TableMetadata"),
      "StatTable 이 표 규격을 안 받는다").toBe(true);
  });

  /** ⚠ 행을 화면에서 만들면 위 검사들이 한 줄도 못 잰다 */
  it("화면은 행을 스스로 만들지 않는다", () => {
    expect(TABLE, "StatTable 이 행을 스스로 만든다").toContain("buildTableRows(metadata)");
    expect(RANK, "RankListPanel 이 두 규격을 화면에서 가른다").toContain("buildRankList(metadata)");
  });

  /** ⚠ 넘치는 표가 상세 칸을 밀면 본문이 통째로 옆으로 흐른다 (1366×768) */
  it("표는 자기 안에서 가로로 스크롤한다", () => {
    expect(TABLE, "가로 넘침을 안 막는다 — 본문이 옆으로 흐른다").toContain("overflow-x: auto");
  });

  /** ⚠ 타임라인은 만드는 쪽이 실어 보낸 차례 그대로다 — `when` 은 꼴이 제각각이다 */
  it("타임라인이 순서를 다시 정하지 않는다", () => {
    expect(TIMELINE, "화면이 정렬한다 — 만드는 쪽과 두 벌이 된다").not.toContain(".sort(");
  });

  it("세 규격이 `MessageItem.metadata` 유니온에 다 들어갔다", () => {
    for (const t of ["TableMetadata", "RankListMetadata", "TimelineMetadata"]) {
      expect(TYPES, `${t} 가 유니온에 없다 — 만드는 쪽이 타입을 못 쓴다`)
        .toContain(t);
    }
  });
});
