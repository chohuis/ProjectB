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
  /** 막대 둘 — 시험 결과 · 팀 분위기 (§1-3) */
  bars: Record<string, TableLabelBlock>;
  /** 카드 다섯 — 시즌 브리핑 · 연습경기 예정 · 대표팀 · 행사 · 올스타 (§1-4) */
  cards: Record<string, TableLabelBlock>;
  /**
   * 보직 굴절 — `{ SP: "선발로" }`. **형태를 가리지 않는다**.
   *
   * 🔴 `role_choice.json` 의 같은 이름 표와 **값이 같아야 한다.** 「중계으로」가
   *    안 나오는 이유가 이 표다 — `{role}` 을 그대로 끼우면 조사가 어긋난다.
   *
   * ⚠ **뿌리가 아니라 곁이다.** `kind` 로 내려가는 자리가 아니라 문안 전체가
   *   하나만 갖는 표라서 `LABEL_ROOTS` 에 넣지 않는다.
   */
  roleAs: Record<string, string>;
}

/**
 * 문안의 뿌리들 — `kind` 첫 조각이 이 중 하나면 거기서부터 내려간다.
 *
 * ⚠ **`table` 이 기본이다.** 소식 19자리가 뿌리 없이 `"digest"` 로 오므로
 *   못 박으면 그 열아홉이 다 깨진다.
 */
const LABEL_ROOTS = ["table", "rankList", "timeline", "recordTab", "bars", "cards"] as const;

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
    bars: o.bars ?? {},
    cards: o.cards ?? {},
    // ⚠ 여기서 빠뜨리면 시즌 브리핑의 마지막 줄이 통째로 안 그려진다 —
    //   굴절형을 못 찾으면 그 줄을 지우는 규칙이라 조용히 사라진다
    roleAs: isStringMap(o.roleAs) ? o.roleAs : {},
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
  /**
   * 결말(`met`·`missed`·`unmeasurable`) → 그 말. 인센티브 정산 표의 「결과」
   * 칸이 그 자리다 (`table.incentiveSettlement.outcomeLabel`).
   *
   * ⚠ **생산부는 낱말만 싣는다.** 「달성」을 소식에 굳혀 보내면 문안을 고쳐도
   *   지난 소식만 옛 말로 남는다 — `kindLabel` 이 먼저 그은 선이다.
   * ⚠ 없는 결말은 **키를 그대로** 쓴다. 빈 칸이면 왜 비었는지 안 남는다.
   */
  outcomeLabel: Record<string, string>;
}

/**
 * 코드가 갖는 마지막 기댓값. **문장이 하나도 없다** — 기호(`—`)와 숫자 틀
 * (`↑{n}`)뿐이다. 말이 필요한 자리는 전부 빈 문자열이고, 그러면 화면이
 * 열 이름 자리에 **키를 그대로** 쓴다.
 */
const FALLBACK_DELTA = { up: "↑{n}", down: "↓{n}", flat: "—", unknown: "" };

/**
 * 이름표 지도 — 표는 `columns`(열 이름)·`rows`(항목 이름)로 나눠 적는데
 * 막대·카드 칸은 **`labels` 하나**로 적는다 (§1-3 · §1-4 문안).
 *
 * ⚠ **양쪽에 건다.** `labels` 만 있는 칸이 열 이름으로 쓰이는지(연습경기
 *   예정 — 주차·상대가 열이다) 항목 이름으로 쓰이는지(시즌 브리핑 — 보직·
 *   순위·경기 수가 항목이다) 는 **생산부가 어느 모양으로 행을 만드는가**가
 *   정한다. 문안이 그걸 미리 못 가르므로 둘 다에 두고, `resolveColumns` 가
 *   행에 값이 있는 쪽만 세운다.
 */
function labelMapOf(b: TableLabelBlock | null): Record<string, string> | null {
  const raw = b?.labels;
  return isStringMap(raw) ? raw : null;
}

export function tableCopy(labels: DashboardLabels | null, kind: string): TableCopy {
  const b = tableLabelBlock(labels, kind);
  const emptyCell = labels?.common.emptyCell ?? "—";
  const itemValue = labels?.common.itemValue ?? { item: "", value: "" };
  const optional = b?.optionalColumns ?? {};
  const labelMap = labelMapOf(b);
  const kindRaw = b?.kindLabel;
  const outcomeRaw = b?.outcomeLabel;
  return {
    title: b?.title ?? "",
    columns: b?.columns ?? labelMap ?? {},
    optionalColumns: optional,
    rows: b?.rows ?? labelMap ?? {},
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
    outcomeLabel: isStringMap(outcomeRaw) ? outcomeRaw : {},
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

// ── 표가 아닌 형태 셋 — 순위 · 막대 · 카드 ─────────────────────
//
// 🔴 **`tableCopy` 를 늘리지 않는다.** 표는 열·행·변동을 갖고 순위는 등수
//    이름을, 막대는 눈금을, 카드는 이름표를 갖는다 — 한 그릇에 담으면
//    부르는 쪽이 「이 자리는 안 쓰는 값」을 매번 건너뛰게 된다.
//
// ⚠ **없으면 빈 문자열이다.** 그러면 화면이 키를 그대로 쓰거나 그 줄을
//   안 그린다. 여기서 기본 문장을 지어내지 않는다.

/** 문안 덩어리를 뿌리째 찾는다 — `kind` 가 뿌리를 달고 온다 */
function blockOf(
  labels: DashboardLabels | null, root: keyof DashboardLabels, kind: string,
): TableLabelBlock | null {
  if (!labels || !kind) return null;
  const key = kind.startsWith(`${root}.`) ? kind : `${root}.${kind}`;
  return tableLabelBlock(labels, key);
}

function stringMap(v: unknown): Record<string, string> {
  return isStringMap(v) ? v : {};
}
function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/** 순위 목록 하나의 문안 */
export interface RankCopy {
  title: string;
  /** 1·2·3 등의 이름 — 「우승」·「준우승」·「3위」. 없으면 숫자를 쓴다 */
  podium: string[];
  empty: string;
}

export function rankCopy(labels: DashboardLabels | null, kind: string): RankCopy {
  const b = blockOf(labels, "rankList", kind);
  return {
    title: str(b?.title),
    podium: [str(b?.first), str(b?.second), str(b?.third)],
    empty: str(b?.empty) || (labels?.common.emptyTable ?? ""),
  };
}

/**
 * 등수 한 칸에 찍을 글자.
 *
 * ⚠ **문안이 없으면 숫자다.** 「1위」를 코드가 만들면 데이터와 두 벌이 된다.
 */
export function rankText(rank: number, copy: RankCopy): string {
  return copy.podium[rank - 1] || String(rank);
}

/** 막대 하나의 문안 */
export interface BarsCopy {
  title: string;
  /** `{ metadata 키: 이름 }` — 과목·분위기·변화 */
  labels: Record<string, string>;
  /** 눈금. 데이터가 정한다 — 화면이 100 을 짐작하지 않는다 */
  min: number;
  max: number;
  empty: string;
}

export function barsCopy(labels: DashboardLabels | null, kind: string): BarsCopy {
  const b = blockOf(labels, "bars", kind);
  const scale = b?.scale as { min?: unknown; max?: unknown } | undefined;
  // 시험은 `columns`(과목·백분위)+`subjects`(과목 이름), 팀 분위기는 낱말이
  // 바로 붙는다 — 한 표로 모은다. 이름표가 어느 키에 적혔든 화면은 하나만 본다
  const merged = {
    ...stringMap(b?.columns), ...stringMap(b?.subjects),
    ...stringMap(b?.rows), ...stringMap(b?.labels),
  };
  for (const k of ["mood", "delta", "gpa"]) {
    if (typeof b?.[k] === "string") merged[k] = b[k] as string;
  }
  return {
    title: str(b?.title),
    labels: merged,
    min: typeof scale?.min === "number" ? scale.min : 0,
    max: typeof scale?.max === "number" ? scale.max : 100,
    empty: str(b?.empty) || (labels?.common.emptyTable ?? ""),
  };
}

/** 카드 한 벌의 문안 */
export interface CardsCopy {
  title: string;
  labels: Record<string, string>;
  /**
   * **값 자체가 키인 자리**의 이름표 — `{ 카드 키: { 값: 말 } }`.
   *
   * 문안이 `<키>Label` 로 적어 둔 표를 그대로 담는다(`routeLabel` → 카드 키
   * `route`). 생산부는 `recommend` 같은 **키만** 싣고 화면이 말을 붙인다 —
   * 낱말을 소식에 실으면 문안을 고쳐도 지난 소식만 옛 말로 남는다.
   */
  valueLabel: Record<string, Record<string, string>>;
  /** 표에 없는 값의 자리 — `<키>Fallback`. 초청 경로 셋 중 하나가 그렇다 */
  valueFallback: Record<string, string>;
  /** 참·거짓을 말로 — 올스타의 선정·미선정 */
  yes: string;
  no: string;
  /** 카드 아래 한 줄의 틀 (`올해는 {roleAs} 시작합니다.`) */
  noteTemplate: string;
  /** 보직 굴절 — `role_choice.json` 과 값이 같아야 한다 */
  roleAs: Record<string, string>;
  empty: string;
}

export function cardsCopy(labels: DashboardLabels | null, kind: string): CardsCopy {
  const b = blockOf(labels, "cards", kind);
  // `<키>Label`·`<키>Fallback` 을 모은다 — 종류마다 함수를 만들면 카드가 늘 때
  // 마다 여기가 같이 는다. 이름 규칙 하나로 끝난다(`kindLabel` 이 먼저 그은 선)
  const valueLabel: Record<string, Record<string, string>> = {};
  const valueFallback: Record<string, string> = {};
  for (const [k, v] of Object.entries(b ?? {})) {
    if (k.endsWith("Label") && isStringMap(v)) valueLabel[k.slice(0, -5)] = v;
    if (k.endsWith("Fallback") && typeof v === "string") valueFallback[k.slice(0, -8)] = v;
  }
  return {
    title: str(b?.title),
    labels: stringMap(b?.labels),
    valueLabel,
    valueFallback,
    yes: str(b?.selectedYes),
    no: str(b?.selectedNo),
    noteTemplate: str(b?.roleLine),
    roleAs: labels?.roleAs ?? {},
    empty: str(b?.empty) || (labels?.common.emptyTable ?? ""),
  };
}

/** 타임라인 하나의 문안 */
export interface TimelineCopy {
  title: string;
  labels: Record<string, string>;
  empty: string;
}

export function timelineCopy(labels: DashboardLabels | null, kind: string): TimelineCopy {
  const b = blockOf(labels, "timeline", kind);
  return {
    title: str(b?.title),
    labels: stringMap(b?.labels),
    empty: str(b?.empty) || (labels?.common.emptyTable ?? ""),
  };
}
