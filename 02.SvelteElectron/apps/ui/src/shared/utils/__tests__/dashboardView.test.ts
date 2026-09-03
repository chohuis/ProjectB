import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildRankList, buildTableRows, buildTableView, cellAlign, cellText, deltaMark,
  deltaText, inferAlign, isNumericCell, resolveColumns,
} from "../dashboardView";
import { parseDashboardLabels, tableCopy, tableLabelBlock } from "../dashboardCopy";
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
    expect(deltaMark(0)).toEqual({ dir: "flat", n: 0, text: "—" });
  });

  it("부호를 뒤집지 않는다 — 만드는 쪽이 맞춰 보낸다", () => {
    expect(deltaMark(2), "오른 것을 내린 것으로 그린다").toEqual({ dir: "up", n: 2, text: "↑2" });
    expect(deltaMark(-1)).toEqual({ dir: "down", n: 1, text: "↓1" });
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
    const rows = buildTableRows({ ...md, rows: md.rows.map((r) => ({ ...r, myTeam: false })), highlightRow: 2 });
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
    expect(TABLE, "StatTable 이 행을 스스로 만든다").toContain("buildTableView(metadata");
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

// ── 묶음 1 — 문안이 붙은 표 셋 (PLAN_MESSAGE_DASHBOARDS §4) ─────
//
// 🔴 **열 이름을 코드에서 세지 않는다.** 이 아래 검사는 전부 실제
//    `messages/dashboard_labels.json`(B-21)을 읽어서 잰다 — 데이터가 바뀌면
//    여기가 같이 움직여야 한다. 기대값을 코드에 박으면 두 벌이 된다.

const MASTER = join(SRC_DIR, "../../..", "resource/data/master");
const LABELS_RAW = JSON.parse(
  readFileSync(join(MASTER, "messages/dashboard_labels.json"), "utf8"),
);
const LABELS = parseDashboardLabels(LABELS_RAW);
const STORE = read("shared/stores/master.ts");

describe("문안 — 정본은 dashboard_labels.json 이다", () => {
  it("실제 파일이 그대로 읽힌다", () => {
    expect(LABELS, "문안을 못 읽었다 — 표가 키 이름으로 그려진다").not.toBeNull();
    expect(LABELS!.common.emptyCell, "빈 칸 기호가 없다").toBeTruthy();
  });

  it("master 로더가 이 파일을 부른다", () => {
    expect(STORE, "로더가 안 읽는다 — 화면이 언제나 키를 그린다")
      .toContain("messages/dashboard_labels.json");
    expect(STORE).toContain("parseDashboardLabels");
  });

  /** ⚠ 「빈 문안」과 「문안 없음」이 같아 보이면 부르는 쪽이 기본값을 못 고른다 */
  it("없는 종류는 null 이다", () => {
    expect(tableLabelBlock(LABELS, "그런종류없음")).toBeNull();
    expect(tableLabelBlock(null, "digest")).toBeNull();
  });

  /** 표 안의 표는 점으로 한 칸씩 내려간다 */
  it("계약 인센티브를 점으로 찾는다", () => {
    const inc = tableLabelBlock(LABELS, "contractSigned.incentives");
    expect(inc, "표 안의 표를 못 찾는다 — 인센티브가 키 이름으로 그려진다").not.toBeNull();
    expect(Object.keys(inc!.columns ?? {}).length, "인센티브 열이 없다").toBeGreaterThan(0);
  });

  /**
   * 🔴 **못 읽어도 표를 안 없앤다.** 값은 이미 소식에 실려 왔다 —
   *    열 이름 자리에 키를 그대로 쓴다.
   */
  it("문안이 없으면 키를 그대로 쓴다", () => {
    const copy = tableCopy(null, "digest");
    const cols = resolveColumns(
      { type: "table", kind: "digest", columns: [], rows: [{ w: 3, l: 1 }] }, copy,
    );
    expect(cols.map((c) => c.label), "없는 말을 지어냈다").toEqual(["w", "l"]);
    expect(copy.emptyCell, "빈 칸 기호까지 사라지면 표가 안 읽힌다").toBe("—");
  });
});

describe("묶음 1-① 다이제스트 순위표", () => {
  const copy = tableCopy(LABELS, "digest");
  const rows: TableMetadata["rows"] = [
    { rank: 1, teamId: "창원 스타스", w: 38, l: 22, pct: ".633", delta: 1 },
    { rank: 2, teamId: "인천 파이러츠", w: 33, l: 27, pct: ".550", delta: -2, myTeam: true },
    { rank: 3, teamId: "부산 웨이브스", w: 30, l: 30, pct: ".500", delta: 0 },
  ];

  /**
   * 🔴 **생산부가 열을 안 실어 보내도 표가 선다** — A 가 넘길 것은 값이다.
   *    열 순서는 문안이 선언한 순서다.
   */
  it("열을 안 보내도 문안 순서로 선다", () => {
    const v = buildTableView({ type: "table", kind: "digest", columns: [], rows }, copy);
    expect(v.columns.map((c) => c.key)).toEqual(Object.keys(copy.columns));
    expect(v.columns[0].label).toBe(LABELS_RAW.table.digest.columns.rank);
  });

  /** ⚠ 빈 선택 열을 그리면 표가 넓어지고 1366×768 에서 밀린다 */
  it("선택 열은 값이 있을 때만 그린다", () => {
    const bare = buildTableView({ type: "table", kind: "digest", columns: [], rows }, copy);
    expect(bare.columns.some((c) => c.key === "streak"), "빈 열을 그렸다").toBe(false);
    const withStreak = buildTableView(
      { type: "table", kind: "digest", columns: [],
        rows: rows.map((r) => ({ ...r, streak: "3연승" })) }, copy,
    );
    expect(withStreak.columns.map((c) => c.key)).toContain("streak");
  });

  it("내 팀 행을 굵게 그린다", () => {
    const v = buildTableView({ type: "table", kind: "digest", columns: [], rows }, copy);
    expect(v.rows.map((r) => r.highlight)).toEqual([false, true, false]);
  });

  /** ⚠ 변동 글자는 데이터의 틀이다 — 코드가 「↑2」 를 짓지 않는다 */
  it("변동은 문안의 틀로 그린다", () => {
    const v = buildTableView(
      { type: "table", kind: "digest", columns: [], rows, deltaKey: "delta" }, copy,
    );
    expect(v.deltaLabel, "변동 열 이름을 코드가 지었다")
      .toBe(LABELS_RAW.table.digest.optionalColumns.delta);
    expect(deltaText(v.rows[0].delta, copy)).toBe(
      String(LABELS_RAW.table.digest.delta.up).split("{n}").join("1"));
    expect(deltaText(v.rows[2].delta, copy)).toBe(LABELS_RAW.table.digest.delta.flat);
  });

  /** 🔴 「모름」은 「변동 없음」과 달라야 한다 (§3-1) */
  it("지난 값이 없으면 변동 열이 통째로 없다", () => {
    const v = buildTableView({ type: "table", kind: "digest", columns: [], rows }, copy);
    expect(v.deltaLabel, "모르는데 변동 열을 그렸다").toBeNull();
    expect(deltaText(null, copy)).toBe(LABELS_RAW.table.digest.delta.unknown);
  });

  it("행이 없으면 문안의 한 줄을 대신 그린다", () => {
    const v = buildTableView({ type: "table", kind: "digest", columns: [], rows: [] }, copy);
    expect(v.rows.length).toBe(0);
    expect(v.empty).toBe(LABELS_RAW.table.digest.empty);
    expect(v.columns.length, "행이 없다고 머리글까지 사라지면 안 된다").toBeGreaterThan(0);
    expect(v.footnote).toBe(LABELS_RAW.table.digest.footnote);
  });
});

describe("묶음 1-② 프로·독립 시즌 결산", () => {
  /** 한 줄에 여섯 값이 뭉쳐 있던 자리다 — 항목·값 두 칸으로 가른다 */
  for (const kind of ["seasonEndPro", "seasonEndIndie"]) {
    it(kind + " — 항목 열의 키가 문안의 이름으로 바뀐다", () => {
      const copy = tableCopy(LABELS, kind);
      const v = buildTableView({
        type: "table", kind, columns: [],
        rows: [{ item: "era", value: "2.94" }, { item: "k", value: 151 }],
      }, copy);
      const names = v.rows.map((r) => r.cells[0].text);
      expect(names, "키를 그대로 그렸다 — 「era」 가 화면에 나온다")
        .toEqual([LABELS_RAW.table[kind].rows.era, LABELS_RAW.table[kind].rows.k]);
      expect(v.columns.map((c) => c.label))
        .toEqual([LABELS_RAW.table[kind].columns.item, LABELS_RAW.table[kind].columns.value]);
    });
  }

  /** ⚠ 지난해 값은 출처가 없을 수 있다 (`_measured` — statLine 이 문자열이다) */
  it("지난해 열은 실어 보낼 때만 뜬다", () => {
    const copy = tableCopy(LABELS, "seasonEndPro");
    const bare = buildTableView({
      type: "table", kind: "seasonEndPro", columns: [], rows: [{ item: "w", value: 13 }],
    }, copy);
    expect(bare.columns.map((c) => c.key), "값이 없는데 열을 그렸다").not.toContain("prev");
    const withPrev = buildTableView({
      type: "table", kind: "seasonEndPro", columns: [],
      rows: [{ item: "w", value: 13, prev: 9 }],
    }, copy);
    expect(withPrev.columns[withPrev.columns.length - 1].label)
      .toBe(LABELS_RAW.table.seasonEndPro.optionalColumns.prev);
  });

  it("모르는 항목 키는 지우지 않고 그대로 둔다", () => {
    const copy = tableCopy(LABELS, "seasonEndPro");
    const v = buildTableView({
      type: "table", kind: "seasonEndPro", columns: [], rows: [{ item: "qs", value: 14 }],
    }, copy);
    expect(v.rows[0].cells[0].text, "빈 칸이 되면 왜 비었는지 화면에 안 남는다").toBe("qs");
  });
});

describe("묶음 1-③ 계약 완료 조건 표", () => {
  const copy = tableCopy(LABELS, "contractSigned");

  /** 열 선언이 없는 자리다 — 항목·값 두 칸은 `common.itemValue` 가 든다 */
  it("항목·값 두 칸이 공통 문안에서 온다", () => {
    const v = buildTableView({
      type: "table", kind: "contractSigned", columns: [],
      rows: [{ item: "salary", value: "18,000만원" }, { item: "years", value: "2년" }],
    }, copy);
    expect(v.columns.map((c) => c.label))
      .toEqual([LABELS_RAW.common.itemValue.item, LABELS_RAW.common.itemValue.value]);
    expect(v.rows[0].cells[0].text).toBe(LABELS_RAW.table.contractSigned.rows.salary);
  });

  /**
   * 🔴 **표가 둘일 때만 이름을 단다.** 하나뿐이면 소식 제목이 이미 그
   *    이름이라 위에 한 줄 더 두면 부제가 된다.
   */
  it("표가 하나면 이름을 안 달고, 둘이면 단다", () => {
    const one = buildTableView({
      type: "table", kind: "contractSigned", columns: [], rows: [],
    }, copy);
    expect(one.title, "표가 하나인데 부제를 달았다").toBe("");

    const two = buildTableView({
      type: "table", kind: "contractSigned", columns: [], rows: [],
      extra: { type: "table", kind: "contractSigned.incentives", columns: [], rows: [] },
    }, copy, true);
    expect(two.title).toBe(LABELS_RAW.table.contractSigned.title);
  });

  it("인센티브는 열이 아예 달라 두 번째 표로 선다", () => {
    const inc = tableCopy(LABELS, "contractSigned.incentives");
    const v = buildTableView({
      type: "table", kind: "contractSigned.incentives", columns: [],
      rows: [{ name: "등판", condition: "25회 이상", amount: "+1,500만원" }],
    }, inc, true);
    expect(v.columns.map((c) => c.label))
      .toEqual(Object.values(LABELS_RAW.table.contractSigned.incentives.columns));
    expect(v.title).toBe(LABELS_RAW.table.contractSigned.incentives.title);
    expect(v.empty).toBe(LABELS_RAW.table.contractSigned.incentives.empty);
  });

  it("화면이 두 번째 표를 그린다", () => {
    expect(TABLE, "extra 를 안 그린다 — 인센티브가 사라진다").toContain("metadata.extra");
    expect(TYPES, "규격에 두 번째 표 자리가 없다").toContain("extra?: TableMetadata");
  });
});

describe("정렬 — 글자 열이 숫자에 붙어 오른쪽에 서지 않는다 (1366×768 실측)", () => {
  const copy = tableCopy(LABELS, "digest");
  const rows: TableMetadata["rows"] = [
    { rank: 1, teamId: "부산 웨이브스", w: 38, l: 22, pct: ".633" },
    { rank: 2, teamId: "창원 스타스", w: 35, l: 25, pct: ".583" },
  ];

  /**
   * ⚠ 열 이름이 문안에서 오므로 생산부가 `align` 을 실어 보낼 자리가 없다 —
   *   값으로 정한다. 첫 판 스크린샷에서 팀 이름이 오른쪽에 붙어 있었다.
   */
  it("팀 이름 열은 왼쪽, 숫자 열은 오른쪽이다", () => {
    const v = buildTableView({ type: "table", kind: "digest", columns: [], rows }, copy);
    const by = Object.fromEntries(v.columns.map((c) => [c.key, c.align]));
    expect(by.teamId, "팀 이름이 숫자에 붙어 오른쪽에 선다").toBe("left");
    expect(by.w).toBe("right");
    expect(by.pct, "승률은 숫자다").toBe("right");
    expect(by.rank).toBe("right");
  });

  it("인센티브의 조건 칸도 글자라 왼쪽이다", () => {
    const inc = tableCopy(LABELS, "contractSigned.incentives");
    const v = buildTableView({
      type: "table", kind: "contractSigned.incentives", columns: [],
      rows: [{ name: "등판", condition: "25회 이상", amount: "+1,500만원" }],
    }, inc);
    expect(v.columns.map((c) => c.align)).toEqual(["left", "left", "left"]);
  });

  /** 생산부가 실어 보낸 `align` 이 값 추론을 이긴다 — 대진의 가운데 칸이 그 자리다 */
  it("열이 정렬을 실어 보내면 그게 이긴다", () => {
    const v = buildTableView({
      type: "table", kind: "bracket",
      columns: [{ key: "round", label: "라운드" }, { key: "home", label: "", align: "center" }],
      rows: [{ round: "8강", home: "한성고" }],
    }, tableCopy(LABELS, "tourOpen"));
    expect(v.columns[1].align).toBe("center");
  });

  it("값이 없으면 첫 열만 왼쪽이라는 기본이 남는다", () => {
    expect(inferAlign("w", [])).toBeNull();
    expect(inferAlign("w", [{ w: null }])).toBeNull();
  });
});
