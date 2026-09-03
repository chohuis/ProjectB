/**
 * 소식 대시보드 문안 — **정본은 `resource/data/master/messages/dashboard_labels.json`이다** (B-21).
 *
 * 🔴 **코드에 열 이름·문장을 적지 않는다.** 이 파일은 그 JSON의 모양(타입)과
 * 찾는 규칙만 갖는다. 「승」·「패」·「연봉」을 코드에 한 벌 더 두면 한쪽만
 * 고쳐진 채 남는다 — `roleChoiceCopy.ts`(B-12)·`contractCopy.ts`(B-13)가
 * 먼저 같은 선을 그었다.
 *
 * ## 못 읽으면 표를 안 없앤다
 *
 * 보직 소식은 문안이 없으면 **소식 자체를 안 만든다**. 표는 다르다 — 값이
 * 이미 소식에 실려 왔고 화면이 그걸 그리는 자리다. 문안이 없으면
 * **열 이름 자리에 키를 그대로 쓰고 빈 칸은 `—`** 다. 말을 지어내지 않는다.
 *
 * ## 종류 이름은 점으로 잇는다
 *
 * `kind` 는 `TableMetadata.kind` 그대로이고 이 파일의 `table` 아래 키다
 * (`_coverage` 가 대응표의 정본). 계약 인센티브처럼 **표 안의 표**는
 * `"contractSigned.incentives"` 로 온다 — 점으로 한 칸씩 내려간다.
 */

/** 형태를 가리지 않고 쓰는 것 (`common`) */
export interface DashboardCommon {
  itemValue: { item: string; value: string };
  emptyCell: string;
  emptyTable: string;
  myMark: string;
  recordTail: string;
}

/** 표 한 종류의 문안. 전부 선택이다 — 데이터가 자리마다 다르게 채운다 */
export interface TableLabelBlock {
  title?: string;
  /** `{ metadata 키: 열 이름 }` */
  columns?: Record<string, string>;
  /** 생산부가 실어 보내면 그리는 열 (무·연속·최근10·변동·지난해) */
  optionalColumns?: Record<string, string>;
  /** 항목·값 두 칸짜리 표의 **행 이름** — `{ metadata 키: 행 이름 }` */
  rows?: Record<string, string>;
  empty?: string;
  footnote?: string;
  /** 변동 칸의 틀. `{n}` 하나뿐이라 조사가 안 붙는다 */
  delta?: { up?: string; down?: string; flat?: string; unknown?: string };
  /** 표 안의 표 (계약 인센티브) — 점으로 이어 찾는다 */
  [nested: string]: unknown;
}

export interface DashboardLabels {
  common: DashboardCommon;
  table: Record<string, TableLabelBlock>;
  rankList: Record<string, TableLabelBlock>;
  timeline: Record<string, TableLabelBlock>;
  /**
   * 기록 탭 카드 둘 — 계약 이력 · 대회 전적 (§7-4).
   *
   * 🔴 **소식이 아니라 화면이 부르는 표다.** 그래서 `table` 아래가 아니라
   *    따로 선다. 그리는 컴포넌트는 같은 `StatTable` 이고 `kind` 만
   *    `"recordTab.contractHistory"` 처럼 뿌리를 달고 온다.
   */
  recordTab: Record<string, TableLabelBlock>;
}

/**
 * 문안의 뿌리들 — `kind` 첫 조각이 이 중 하나면 거기서부터 내려간다.
 *
 * ⚠ **`table` 이 기본이다.** 소식 19자리가 뿌리 없이 `"digest"` 로 오므로
 *   못 박으면 그 열아홉이 다 깨진다.
 */
const LABEL_ROOTS = ["table", "rankList", "timeline", "recordTab"] as const;

/**
 * 읽은 JSON을 받는다. **모양만 본다** — 종류가 19개라 하나하나 있는지 세지
 * 않는다. 없는 종류는 찾을 때 `null` 이 되고 화면이 키를 그대로 쓴다.
 *
 * ⚠ `common` 이 없으면 통째로 못 쓴다 — `emptyCell` 하나가 표 전체의 빈 칸을
 *   정하기 때문이다.
 */
export function parseDashboardLabels(raw: unknown): DashboardLabels | null {
  const o = raw as Partial<DashboardLabels> | null;
  if (!o || typeof o !== "object") return null;
  const c = o.common;
  if (!c || typeof c !== "object") return null;
  if (!c.itemValue?.item || !c.itemValue?.value || !c.emptyCell || !c.emptyTable) return null;
  if (!o.table || typeof o.table !== "object") return null;
  return {
    common: {
      itemValue: { item: c.itemValue.item, value: c.itemValue.value },
      emptyCell: c.emptyCell,
      emptyTable: c.emptyTable,
      myMark: c.myMark ?? "",
      recordTail: c.recordTail ?? "",
    },
    table: o.table,
    rankList: o.rankList ?? {},
    timeline: o.timeline ?? {},
    recordTab: o.recordTab ?? {},
  };
}

/**
 * 종류 하나의 문안 덩어리를 찾는다. 점으로 이어진 이름은 한 칸씩 내려간다 —
 * `"contractSigned.incentives"` 는 `table.contractSigned.incentives` 다.
 *
 * ⚠ **없으면 `null` 이다.** 빈 객체를 돌려주면 「문안이 없다」와 「문안이 비었다」가
 *   같아 보이고, 부르는 쪽이 기본값을 못 고른다.
 */
export function tableLabelBlock(
  labels: DashboardLabels | null, kind: string,
): TableLabelBlock | null {
  if (!labels || !kind) return null;
  const parts = kind.split(".");
  // 뿌리를 달고 왔으면 거기서부터 — 안 달고 왔으면 `table` 이다
  const root = (LABEL_ROOTS as readonly string[]).includes(parts[0]) ? parts.shift()! : "table";
  let node: unknown = (labels as unknown as Record<string, unknown>)[root];
  for (const part of parts) {
    if (!node || typeof node !== "object") return null;
    node = (node as Record<string, unknown>)[part];
  }
  if (!node || typeof node !== "object") return null;
  return node as TableLabelBlock;
}

/** 표 하나를 그리는 데 필요한 문안 — 빈 자리를 다 채워서 돌려준다 */
export interface TableCopy {
  title: string;
  columns: Record<string, string>;
  optionalColumns: Record<string, string>;
  rows: Record<string, string>;
  empty: string;
  footnote: string;
  delta: { up: string; down: string; flat: string; unknown: string };
  emptyCell: string;
  itemValue: { item: string; value: string };
  /** 변동 열 머리글 */
  deltaLabel: string;
  /**
   * 「등판 없음」 — 내 기록(`myLine`) 칸이 빈 행에 찍는다 (대회 전적·대표팀 전적).
   *
   * ⚠ **`—` 와 뜻이 다르다.** 빈 칸은 「값이 없다」이고 이건 「안 나갔다」다.
   *   경기는 있었는데 내가 안 던진 것이라 그 자리를 비워 두면 왜 비었는지
   *   화면에 안 남는다. 없으면 `emptyCell` 로 떨어진다.
   */
  noAppearance: string;
  /**
   * 「{weeks}주간 재등록 불가」 — 엔트리 말소 표의 비고(`note`) 칸 틀.
   *
   * ⚠ **생산부는 주 수만 싣는다.** 문장을 소식에 굳혀 보내면 화면이 바뀔 때
   *   지난 소식만 옛 문장으로 남는다 — 그게 이 대시보드화가 고치는 형태다.
   */
  lockNote: string;
  /**
   * 계약 종류(`new`·`resign`·`fa`) → 그 말. 세이브에는 낱말이 들고 한글은
   * 여기서 온다 (`recordTab.contractHistory.kindLabel`).
   *
   * ⚠ 없는 종류는 **키를 그대로** 쓴다. 빈 칸으로 만들면 「종류가 없다」와
   *   「문안이 없다」가 같아 보인다.
   */
  kindLabel: Record<string, string>;
  /** 「국제」 — 대회 전적에서 국제대회 행에 붙는 짧은 표시 */
  intlMark: string;
}

/**
 * 코드가 갖는 마지막 기댓값. **문장이 하나도 없다** — 기호(`—`)와 숫자 틀
 * (`↑{n}`)뿐이다. 말이 필요한 자리는 전부 빈 문자열이고, 그러면 화면이
 * 열 이름 자리에 **키를 그대로** 쓴다.
 */
const FALLBACK_DELTA = { up: "↑{n}", down: "↓{n}", flat: "—", unknown: "" };

export function tableCopy(labels: DashboardLabels | null, kind: string): TableCopy {
  const b = tableLabelBlock(labels, kind);
  const emptyCell = labels?.common.emptyCell ?? "—";
  const itemValue = labels?.common.itemValue ?? { item: "", value: "" };
  const optional = b?.optionalColumns ?? {};
  const kindRaw = b?.kindLabel;
  return {
    title: b?.title ?? "",
    columns: b?.columns ?? {},
    optionalColumns: optional,
    rows: b?.rows ?? {},
    empty: b?.empty ?? labels?.common.emptyTable ?? emptyCell,
    footnote: b?.footnote ?? "",
    delta: { ...FALLBACK_DELTA, ...(b?.delta ?? {}) },
    emptyCell,
    itemValue,
    deltaLabel: optional.delta ?? "",
    noAppearance: typeof b?.noAppearance === "string" ? b.noAppearance : "",
    lockNote: typeof b?.lockNote === "string" ? b.lockNote : "",
    kindLabel: isStringMap(kindRaw) ? kindRaw : {},
    intlMark: typeof b?.intlMark === "string" ? b.intlMark : "",
  };
}

/** `{ 키: 말 }` 인가 — 문안 파일이 손으로 쓰이므로 모양을 한 번 본다 */
function isStringMap(v: unknown): v is Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v as Record<string, unknown>).every((x) => typeof x === "string");
}

/**
 * 변동 틀을 채운다. **정규식을 안 쓴다** — 자리표가 `{n}` 하나뿐이다.
 *
 * ⚠ 값이 없는 자리표는 그대로 남긴다(`roleChoiceCopy` 와 같은 규칙).
 */
export function fillCount(tmpl: string, n: number): string {
  return tmpl.split("{n}").join(String(n));
}

/**
 * 이름 있는 자리표 하나를 채운다 (`{weeks}`). 규칙은 `fillCount` 와 같다 —
 * 정규식을 안 쓰고, 값이 없는 자리표는 그대로 남긴다.
 */
export function fillVar(tmpl: string, name: string, v: string | number): string {
  return tmpl.split(`{${name}}`).join(String(v));
}
