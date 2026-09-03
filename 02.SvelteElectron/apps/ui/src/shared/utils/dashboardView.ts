// ── 소식 대시보드 — 화면이 쓰는 값 만들기 ──────────────────────
//
// `PLAN_MESSAGE_DASHBOARDS.md` §2·§3 의 형태 셋(표·순위·타임라인)을 그리는
// 데 필요한 계산이 전부 여기 있다.
//
// 🔴 **컴포넌트 안에서 만들면 검사가 한 줄도 못 잰다.** 이 저장소의 vitest 는
//    `environment: "node"` 라 `.svelte` 를 못 띄운다 — `myBodyReportView.ts` 가
//    같은 이유로 먼저 갈라져 나왔고, 이건 그 배치를 따른다.
//
// ⚠ **여기서 말을 새로 짓지 않는다.** 열 이름은 소식을 만드는 쪽이 실어
//    보낸다(`TableColumn.label`). 화면이 이름표를 따로 적으면 두 벌이 되고
//    한쪽만 고쳐진 채 남는다 — 이 저장소가 여러 번 겪은 형태다.

import type {
  BarsMetadata, CardsMetadata, RankListMetadata, TableCell, TableColumn,
  TableMetadata, TimelineMetadata, Top10Metadata,
} from "../types/main";
import {
  fillCount, fillVar, rankText as rankTextOf,
  type BarsCopy, type CardsCopy, type RankCopy, type TableCopy, type TimelineCopy,
} from "./dashboardCopy";

/**
 * id 열을 이름으로 바꾸는 조회 — **화면이 준다.**
 *
 * 🔴 **여기서 이름을 못 만든다.** 이름은 표시 언어를 탄다(`teamMap`·
 * `entityMap` 이 `language` 를 물고 있는 파생 스토어다). 만드는 쪽이 이름을
 * 굳혀 보내면 영어로 바꿔도 **그 소식만 한글로 남는다** — 이 저장소가
 * `teamsL10n` 을 만든 이유가 그거다. 그래서 생산부는 id 를 싣고
 * (`PLAN_MESSAGE_DASHBOARDS.md` §1 — `sides[] {teamId,players[]}` ·
 * `players[] {npcId}`) 화면이 이 조회로 바꾼다.
 *
 * ⚠ **못 찾으면 id 를 그대로 둔다.** 빈 칸으로 만들면 「사람이 없다」와
 *   「이름을 못 찾았다」가 같아 보인다.
 */
export interface NameLookup {
  team?: (id: string) => string | undefined;
  person?: (id: string) => string | undefined;
}

/**
 * 어느 열이 id 인가 — **키 이름 하나로 정한다.**
 *
 * ⚠ 종류(`kind`)별로 적으면 표가 늘 때마다 여기도 늘어난다. 키 이름은
 *   §1 의 규격이 이미 통일해 뒀다(`teamId` · `npcId` · `playerId`).
 */
export const ID_COLUMN_KIND: Readonly<Record<string, "team" | "person">> = {
  teamId: "team", fromTeamId: "team", toTeamId: "team", myTeamId: "team",
  npcId: "person", playerId: "person",
};

/**
 * **여럿이 한 칸에 드는 열** — 트레이드의 「선수」가 그 자리다
 * (§1 — `sides[] {teamId, players[]}`).
 *
 * ⚠ `TableCell` 은 아직 배열을 안 담는다. 생산부가 이름을 이어 붙인 문자열을
 *   보내면 그대로 그리고, 배열을 보내면 여기가 id 마다 이름을 찾아 잇는다 —
 *   **어느 쪽이 와도 화면이 안 깨진다.** 규격을 여기서 못 박지 않는 이유는
 *   생산부(A 몫)가 아직 만드는 중이기 때문이다.
 */
export const ID_LIST_COLUMN_KIND: Readonly<Record<string, "team" | "person">> = {
  players: "person",
};

/** 여럿을 한 칸에 이을 때 쓰는 구분자 — 쉼표는 이름 안에 나올 수 있다 */
export const LIST_JOIN = " · ";

/** 변동 표시의 세 갈래. 색은 화면이 이 값으로 고른다 */
export type DeltaDir = "up" | "down" | "flat";

export interface DeltaMark {
  dir: DeltaDir;
  /** 오른(내린) 칸 수 — 언제나 0 이상이다. 방향은 `dir` 가 든다 */
  n: number;
  /** 문안이 없을 때 그대로 찍는 글자 — `↑2` · `↓1` · `—` */
  text: string;
}

/**
 * 순위 변동 한 칸.
 *
 * ⚠ **순위는 작을수록 좋다.** `delta` 는 「지난 값 − 지금 값」이 아니라
 *   화면이 그대로 쓸 **오른 칸 수**다 — 만드는 쪽이 부호를 맞춰 보낸다.
 *   여기서 다시 뒤집으면 만드는 쪽과 화면이 서로 다른 규칙을 갖게 된다.
 *
 * ⚠ **`null`·`undefined` 는 「모름」이라 아무것도 안 그린다.** `0`(변동 없음)과
 *   갈라야 한다 — 첫 달·첫 시즌엔 지난 값이 없다 (§3-1).
 */
export function deltaMark(delta: number | null | undefined): DeltaMark | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  if (delta > 0) return { dir: "up", n: delta, text: `↑${delta}` };
  if (delta < 0) return { dir: "down", n: -delta, text: `↓${-delta}` };
  return { dir: "flat", n: 0, text: "—" };
}

/**
 * 칸의 정렬.
 *
 * 기본은 **첫 열만 왼쪽, 나머지는 오른쪽**이다 — 첫 열이 이름(팀·선수·항목)이고
 * 나머지가 숫자인 표가 19자리 중 대부분이라서다. 대진처럼 두 팀 이름이
 * 가운데 오는 표는 열이 `align` 을 실어 보내 뒤집는다.
 */
export function cellAlign(col: TableColumn, index: number): "left" | "right" | "center" {
  return col.align ?? (index === 0 ? "left" : "right");
}

/**
 * 칸에 찍을 글자.
 *
 * ⚠ **비어 있으면 `—` 다.** 빈 칸으로 두면 표가 어디서 끊겼는지 안 보인다.
 * ⚠ **숫자를 여기서 반올림하지 않는다.** 자릿수는 뜻이 있는 값이라
 *   (승률 `.633` · 이닝 `168.1`) 만드는 쪽이 정해서 문자열로 보낸다.
 */
export function cellText(v: TableCell | undefined, empty = "—"): string {
  if (v == null || v === "") return empty;
  if (typeof v === "boolean") return v ? "○" : empty;
  return String(v);
}

/** 숫자 칸인가 — 폭이 흔들리지 않게 `tabular-nums` 를 걸 자리를 고른다 */
export function isNumericCell(v: TableCell | undefined): boolean {
  if (typeof v === "number") return true;
  if (typeof v !== "string" || v === "") return false;
  return /^[-+]?[\d.,:\s]+$/.test(v.trim());
}

export interface TableRowView {
  /** 열 순서대로 만든 칸 */
  cells: { key: string; text: string; align: "left" | "right" | "center"; numeric: boolean }[];
  /** 굵게 그릴 행인가 — `highlightRow` 이거나 행이 `myTeam` 을 들었을 때 */
  highlight: boolean;
  /** 변동 칸. `deltaKey` 가 없거나 그 행에 값이 없으면 `null` */
  delta: DeltaMark | null;
}

/**
 * 표 한 벌을 화면이 그대로 그릴 모양으로 바꾼다.
 *
 * ⚠ **행이 모르는 열을 들고 있어도 버리지 않는다** — `myTeam` 처럼 열이
 *   아닌 표시가 행에 섞여 오기 때문이다. 반대로 열이 있는데 행에 값이 없으면
 *   `—` 로 채운다(칸 수가 어긋나면 표가 통째로 밀린다).
 */
export function buildTableRows(
  md: TableMetadata, cols?: TableColumnView[], copy?: TableCopy, names?: NameLookup,
): TableRowView[] {
  const columns: TableColumnView[] = cols
    ?? (md.columns ?? []).map((c, ci) => ({ key: c.key, label: c.label, align: cellAlign(c, ci) }));
  const empty = copy?.emptyCell;
  const rowLabels = copy && Object.keys(copy.rows).length > 0 ? copy.rows : null;
  return (md.rows ?? []).map((row, ri) => ({
    cells: columns.map((c) => {
      const raw = row[c.key];
      const idKind = ID_COLUMN_KIND[c.key];
      const listKind = ID_LIST_COLUMN_KIND[c.key];
      let text: string;
      if (listKind && Array.isArray(raw)) {
        // 배열이 오면 id 마다 이름을 찾아 잇는다. 문자열이면 아래 기본으로 간다
        text = (raw as unknown[])
          .map((v) => (typeof v === "string" ? (names?.[listKind]?.(v) ?? v) : cellText(v as TableCell, empty)))
          .join(LIST_JOIN) || cellText(null, empty);
      } else if (c.key === "item" && rowLabels && typeof raw === "string") {
        // 항목 열의 값은 metadata 키다 — 「salary」 가 아니라 「연봉」 으로 그린다
        text = rowLabels[raw] ?? cellText(raw, empty);
      } else if (idKind && typeof raw === "string" && raw !== "") {
        // id 열은 이름으로 — 못 찾으면 id 를 그대로 둔다(빈 칸이면 왜 비었는지 안 남는다)
        text = names?.[idKind]?.(raw) ?? raw;
      } else if (c.key === "myLine" && copy?.noAppearance && (raw == null || raw === "")) {
        // 「등판 없음」은 `—` 와 뜻이 다르다 — 경기는 있었고 내가 안 나간 것이다
        text = copy.noAppearance;
      } else if (c.key === "note" && copy?.lockNote && isNumericCell(raw) && raw !== "") {
        // 말소 비고 — 생산부는 주 수만 싣고 문장은 문안이 갖는다
        text = fillVar(copy.lockNote, "weeks", raw as number);
      } else {
        text = cellText(raw, empty);
      }
      // 이름·문장으로 바뀐 칸은 숫자가 아니다 — `tabular-nums` 를 걸면 자간이 벌어진다
      const numeric = !idKind && !listKind && c.key !== "note" && isNumericCell(raw);
      return { key: c.key, text, align: c.align, numeric };
    }),
    highlight: row.myTeam === true || md.highlightRow === ri,
    delta: md.deltaKey ? deltaMark(row[md.deltaKey] as number | null | undefined) : null,
  }));
}

// ── 순위 목록 — 유망주 TOP10 과 대회 순위가 같은 그릇을 쓴다 ────
//
// ✅ `ProspectTop10Panel` → `RankListPanel` (§2 · §6 ④ 확정 2026-09-03).
//    이름이 유망주 전용처럼 보이는데 순위 셋(대회 최종 순위·대회 수상·
//    2군 우승)이 같은 모양을 쓴다.
//
// 🔴 **두 규격을 화면에서 갈라 그리지 않는다.** `Top10Metadata` 는 학년별
//    네 칸이고 `RankListMetadata` 는 한 줄짜리 목록인데, 화면에 `{#if}` 를
//    두면 같은 순위 줄을 **두 번 적게 된다.** 여기서 한 모양으로 모은다.

export interface RankEntryView {
  /** NPC id 또는 `"PLY_HERO"`. 빈 문자열이면 상세를 못 연다 */
  id: string;
  rank: number;
  /**
   * 등수 칸에 찍을 글자 — 대회 최종 순위는 「우승」·「준우승」이다.
   *
   * ⚠ **문안이 없으면 숫자다.** 「1위」를 코드가 만들면 데이터와 두 벌이 된다.
   */
  rankText: string;
  name: string;
  /** 오른쪽 작은 글씨 — 팀명이거나 상 이름이다 */
  sub: string;
  isMe: boolean;
  delta: DeltaMark | null;
}

export interface RankColumnView {
  label: string;
  entries: RankEntryView[];
  /** 목록 밖으로 밀린 내 순위. 없으면 `null` */
  heroRank: number | null;
}

export interface RankListView {
  /** 목록 위 한 줄. 없으면 화면이 안 그린다 */
  subtitle: string;
  /** 줄이 하나도 없을 때 대신 그리는 한 줄. 문안에서 온다 */
  empty: string;
  columns: RankColumnView[];
}

/**
 * 순위 소식 한 벌을 화면이 그대로 그릴 모양으로 바꾼다.
 *
 * ⚠ **`Top10Metadata` 에는 변동이 없다.** 4주마다 나오는 랭킹인데 지난 값을
 *   저장하는 자리가 없다 (§3-1). 없으면 `null` 이라 화면이 칸을 안 그린다 —
 *   `0` 으로 채우면 「변동 없음」과 「모름」이 같아 보인다.
 */
export function buildRankList(
  md: Top10Metadata | RankListMetadata, copy?: RankCopy, names?: NameLookup,
): RankListView {
  if (md.type === "top10") {
    const typeKr = md.playerType === "pitcher" ? "투수" : "타자";
    return {
      subtitle: `고교 ${typeKr} 유망주 월간 랭킹 · W${md.week} · ${md.seasonYear}시즌`,
      empty: "",
      columns: md.columns.map((c) => ({
        label: c.label,
        heroRank: c.heroRank,
        entries: c.entries.map((e) => ({
          id: e.id,
          rank: e.rank,
          // 유망주 랭킹은 등수가 숫자다 — 「우승」이 없다
          rankText: String(e.rank),
          name: e.name,
          sub: e.teamName,
          isMe: e.id === "PLY_HERO",
          delta: null,
        })),
      })),
    };
  }

  return {
    // 제목은 소식이 실어 보내면 그것이고, 안 보내면 문안의 이름이다
    subtitle: md.title ?? copy?.title ?? "",
    empty: copy?.empty ?? "",
    columns: [{
      label: "",
      heroRank: null,
      entries: (md.items ?? []).map((it) => ({
        // 상세를 열려면 id 가 있어야 한다 — 팀 순위엔 사람이 없어 빈 문자열이다
        id: it.labelId ?? "",
        rank: it.rank,
        rankText: copy ? rankTextOf(it.rank, copy) : String(it.rank),
        // 🔴 **id 를 이름으로 바꾸는 자리가 화면이다.** 만드는 쪽이 한글
        //    이름을 굳혀 실으면 표시 언어를 바꿔도 그 줄만 한글로 남는다
        name: lookupName(it.labelId, names) ?? it.label ?? it.labelId ?? "",
        sub: lookupName(it.subId, names) ?? it.sub ?? it.subId ?? "",
        isMe: it.isMe === true,
        delta: deltaMark(it.delta),
      })),
    }],
  };
}

/**
 * id 하나를 이름으로 — **팀이든 사람이든 아는 쪽에서 답하면 그것이다.**
 *
 * ⚠ 순위 목록은 열 이름이 없어 `teamId`·`playerId` 로 갈라지지 않는다
 *   (표는 열 키로 갈랐다). 둘 다 찾아보고 못 찾으면 `undefined` 다 —
 *   그때 부르는 쪽이 id 를 그대로 둔다.
 */
function lookupName(id: string | undefined, names?: NameLookup): string | undefined {
  if (!id || !names) return undefined;
  return names.person?.(id) ?? names.team?.(id);
}

// ── 문안을 입힌 표 ─────────────────────────────────────────────
//
// 🔴 **열 이름을 화면이 짓지 않는다.** 정본은 `messages/dashboard_labels.json`
//    (B-21)이고 `dashboardCopy.ts` 가 그 모양을 갖는다. 생산부가 열을 통째로
//    안 실어 보내도 **문안이 선언한 순서**로 표가 선다 — A 가 넘길 것은 값이다.
//
// ⚠ **문안이 없으면 키를 그대로 쓴다.** 「승」 을 여기 한 벌 더 두면 데이터와
//   두 벌이 되고 한쪽만 고쳐진 채 남는다.


export interface TableColumnView {
  key: string;
  label: string;
  align: "left" | "right" | "center";
}

export interface TableView {
  /** 표가 둘일 때만 이름을 단다 — 하나뿐이면 소식 제목이 이미 이름이다 */
  title: string;
  columns: TableColumnView[];
  rows: TableRowView[];
  /** 변동 열 머리글. `null` 이면 그 열이 없다 */
  deltaLabel: string | null;
  /** 행이 하나도 없을 때 대신 그리는 한 줄 */
  empty: string;
  footnote: string;
}

/** 항목·값 두 칸짜리 표의 열 이름 — 문안의 `common.itemValue` 다 */
function itemValueLabel(key: string, copy: TableCopy): string {
  if (key === "item") return copy.itemValue.item;
  if (key === "value") return copy.itemValue.value;
  return "";
}

/**
 * 열 하나의 이름.
 *
 * 🔴 **빈 문자열로 선언된 열은 머리글을 안 그린다** — 대진표의 두 팀 칸이
 *    그 자리다(`dashboard_labels.json` `_schema.columns`). 예전엔 `||` 로
 *    이어서 빈 이름이 키(`home`)로 떨어졌다 — 대진 위에 「home  away」가
 *    영어로 섰다.
 *
 * ⚠ **선언 자체가 없는 열만** 키로 떨어진다. 「이름이 없다」와 「이름을
 *   비워 뒀다」는 다른 말이다.
 */
function declaredLabel(key: string, copy: TableCopy): string {
  if (key in copy.columns) return copy.columns[key];
  if (key in copy.optionalColumns) return copy.optionalColumns[key];
  return itemValueLabel(key, copy) || key;
}

/**
 * 열을 정한다.
 *
 * 생산부가 `columns` 를 실어 보내면 그 순서가 이긴다 — 이름만 비었으면 문안이
 * 채운다. 아예 안 보내면 문안이 선언한 `columns` 순서로 세우고, 뒤에
 * `optionalColumns` 중 **행에 실제로 값이 있는 것**만 붙인다.
 *
 * ⚠ **선택 열은 값이 없으면 안 그린다.** 「무」·「최근10」·「지난해」는 생산부가
 *   넘길 때만 뜻이 있다 — 빈 열을 그리면 표가 넓어지고 1366×768 에서 밀린다.
 */
/**
 * 값을 보고 정렬을 고른다 — **글자 열은 왼쪽, 숫자 열은 오른쪽**이다.
 *
 * ⚠ 첫 열만 왼쪽으로 두면 팀 이름·조건 같은 **글자 열이 숫자에 붙어 오른쪽에**
 *   선다(1366×768 실측 · `docs/screens/c53-02-digest.png` 첫 판). 열 이름이
 *   문안에서 오므로 생산부가 `align` 을 실어 보낼 자리가 없다 — 값으로 정한다.
 *
 * ⚠ 값이 하나도 없으면 `null` 이다. 그때는 부르는 쪽의 기본(첫 열만 왼쪽)이 남는다.
 */
export function inferAlign(
  key: string, rows: TableMetadata["rows"],
): "left" | "right" | "center" | null {
  // id 열은 화면에서 이름으로 바뀐다 — 값만 보면 숫자 id 가 오른쪽에 선다
  if (ID_COLUMN_KIND[key] || ID_LIST_COLUMN_KIND[key]) return "left";
  const vals = (rows ?? []).map((r) => r[key]).filter((v) => v != null && v !== "");
  if (vals.length === 0) return null;
  // 점수(`3 : 1`)는 가운데다 — 오른쪽에 붙이면 두 팀 이름 사이에서 한쪽으로 쏠린다
  if (vals.every(isScoreCell)) return "center";
  return vals.every((v) => isNumericCell(v)) ? "right" : "left";
}

/**
 * 점수 칸인가 — `3 : 1` 처럼 **가운뎃점으로 두 수를 이은 것**.
 *
 * ⚠ `isNumericCell` 이 이미 `true` 를 준다(구분자에 `:` 가 들어 있다).
 *   그래서 정렬만으로는 못 가른다 — 여기서 한 번 더 본다.
 */
export function isScoreCell(v: TableCell | undefined): boolean {
  if (typeof v !== "string" || !v.includes(":")) return false;
  const parts = v.split(":");
  if (parts.length !== 2) return false;
  return parts.every((p) => p.trim() !== "" && Number.isFinite(Number(p.trim())));
}

/**
 * 문장이 되는 칸은 왼쪽이다 — 말소 비고(`note`)가 숫자로 실려 와도 화면엔
 * 「{weeks}주간 재등록 불가」가 찍힌다. 값만 보면 오른쪽에 서 버린다.
 */
function sentenceColumn(key: string, copy: TableCopy): boolean {
  return key === "note" && !!copy.lockNote;
}

export function resolveColumns(md: TableMetadata, copy: TableCopy): TableColumnView[] {
  const given = md.columns ?? [];
  if (given.length > 0) {
    return given.map((c, i) => ({
      key: c.key,
      // 생산부가 이름을 실어 보내면 그것이 이기고, 안 보내면 문안이 채운다
      label: c.label || declaredLabel(c.key, copy),
      align: c.align
             ?? (sentenceColumn(c.key, copy) ? "left" : null)
             ?? inferAlign(c.key, md.rows) ?? cellAlign(c, i),
    }));
  }

  const rows = md.rows ?? [];
  /**
   * 그 열을 행들이 들고 있나 — **키가 있으면 값이 비어도 든 것이다.**
   *
   * 🔴 예전엔 `r[k] != null` 이었다. 그러면 대회 전적에서 **한 번도 안 던진
   *    선수의 「내 기록」 열이 통째로 사라져** 「등판 없음」이 그려질 자리가
   *    없었다 — 값이 비어 있다는 것과 열이 없다는 것은 다른 말이다.
   *
   * ⚠ 「빈 열은 안 세운다」는 그대로다(묶음 1 규칙). 생산부가 **키를 아예
   *   안 실은** 열은 여기서 걸린다 — 말소 표의 비고가 그 자리다.
   */
  const has = (k: string) => rows.some((r) => k in r);
  const keys: string[] = [];

  const declared = Object.keys(copy.columns);
  if (declared.length > 0) {
    // 행이 하나도 없으면 머리글이라도 서야 한다 — 그때는 전부 세운다
    keys.push(...(rows.length === 0 ? declared : declared.filter(has)));
  } else if (Object.keys(copy.rows).length > 0) {
    keys.push("item", "value");
  }

  for (const k of Object.keys(copy.optionalColumns)) {
    if (k === "delta" || k === md.deltaKey || keys.includes(k)) continue;
    if (has(k)) keys.push(k);
  }

  if (keys.length === 0) {
    for (const r of rows) {
      for (const k of Object.keys(r)) {
        if (k !== "myTeam" && k !== md.deltaKey && !keys.includes(k)) keys.push(k);
      }
    }
  }

  return keys.map((k, i) => ({
    key: k,
    label: declaredLabel(k, copy),
    align: (sentenceColumn(k, copy) ? "left" : null)
           ?? inferAlign(k, md.rows) ?? ((i === 0 ? "left" : "right") as "left" | "right"),
  }));
}

/**
 * 표 한 벌을 문안까지 입혀 화면이 그대로 그릴 모양으로 바꾼다.
 *
 * ⚠ **항목 열(`item`)의 값은 metadata 키다.** 「salary」 가 아니라 「연봉」 으로
 *   그리려면 문안의 `rows` 를 거쳐야 한다 — 계약·시즌 결산이 그 꼴이다.
 *   문안에 없는 키는 **그대로 둔다**(빈 칸이 되면 왜 비었는지 화면에 안 남는다).
 *
 * ⚠ **표가 하나뿐이면 이름을 안 단다** (`withTitle`). 소식 제목이 이미 그
 *   이름이라 위에 한 줄 더 두면 부제가 된다.
 */
export function buildTableView(
  md: TableMetadata, copy: TableCopy, withTitle = false, names?: NameLookup,
): TableView {
  const cols = resolveColumns(md, copy);
  const rows = buildTableRows(md, cols, copy, names);

  return {
    title: withTitle ? copy.title : "",
    columns: cols,
    rows,
    deltaLabel: md.deltaKey ? (copy.deltaLabel || copy.optionalColumns.delta || "") : null,
    empty: copy.empty,
    footnote: md.footnote ?? copy.footnote,
  };
}

/**
 * 변동 칸에 찍을 글자. 틀은 데이터가 갖는다 (`↑{n}`).
 *
 * ⚠ **모름은 빈 문자열이다.** `unknown` 을 「—」 로 채우면 「변동 없음」과
 *   같아 보인다 — 그래서 `deltaMark` 가 아예 `null` 을 준다 (§3-1).
 */
export function deltaText(mark: DeltaMark | null, copy: TableCopy): string {
  if (!mark) return copy.delta.unknown;
  if (mark.dir === "flat") return copy.delta.flat;
  return fillCount(mark.dir === "up" ? copy.delta.up : copy.delta.down, mark.n);
}

// ── 막대 — 시험 결과 · 팀 분위기 (§1-3) ────────────────────────
//
// 🔴 **새 컴포넌트를 안 만든다** (§2). `TrainingStatBars` 의 막대를 그대로
//    쓴다 — 이름·막대·오른쪽 값 셋이 같은 모양이다.
//
// ⚠ **눈금을 화면이 짐작하지 않는다.** 0~100 은 문안(`bars.<kind>.scale`)이
//   정한다. 코드가 100 을 박으면 눈금이 바뀔 때 두 벌이 된다.

export interface BarView {
  label: string;
  /** 0~100 으로 환산한 채움 — 눈금은 문안이 준다 */
  pct: number;
  /** 오른쪽에 찍는 값 그대로 */
  value: number;
  delta: DeltaMark | null;
}

export interface BarsView {
  title: string;
  bars: BarView[];
  /** 막대 아래 항목·값 (학점). 없으면 안 그린다 */
  foot: { label: string; value: string }[];
  empty: string;
}

export function buildBars(md: BarsMetadata, copy: BarsCopy): BarsView {
  const span = copy.max - copy.min;
  return {
    title: copy.title,
    bars: (md.bars ?? []).map((b) => ({
      // 이름이 값인 자리(과목명)는 소식이 싣고, 정해진 자리(분위기)는 문안이 준다
      label: b.label ?? (b.key ? copy.labels[b.key] ?? b.key : ""),
      pct: span > 0 ? clampPct(((b.value - copy.min) / span) * 100) : 0,
      value: b.value,
      delta: deltaMark(b.delta),
    })),
    foot: (md.foot ?? []).map((f) => ({
      label: copy.labels[f.key] ?? f.key,
      value: String(f.value),
    })),
    empty: copy.empty,
  };
}

/** 눈금 밖 값은 끝에 붙인다 — 막대가 칸을 넘으면 옆 열을 밀어낸다 */
function clampPct(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ── 카드·칩 — 시즌 브리핑 · 연습경기 · 대표팀 · 행사 · 올스타 ──
//
// 🔴 **새 컴포넌트를 안 만든다** (§2). `DigestCards` 를 **누를 수 없는 꼴**로
//    쓴다 — 큰 값 한 줄과 그 아래 이름 한 줄이 이미 이 모양이다.

export interface CardView {
  /** 큰 글씨 — 값이다 */
  value: string;
  /** 작은 글씨 — 이름이다 */
  caption: string;
  /** 숫자면 폭이 안 흔들리게 `tabular-nums` 를 건다 */
  numeric: boolean;
}

export interface CardsView {
  title: string;
  cards: CardView[];
  /** 카드 아래 한 줄. 없으면 안 그린다 */
  note: string;
  empty: string;
}

export function buildCards(md: CardsMetadata, copy: CardsCopy, names?: NameLookup): CardsView {
  return {
    title: copy.title,
    cards: (md.items ?? []).map((it) => {
      const idKind = ID_COLUMN_KIND[it.key];
      let value: string;
      if (idKind && typeof it.value === "string" && it.value !== "") {
        // id 는 이름으로 — 못 찾으면 그대로 둔다(표와 같은 규칙)
        value = names?.[idKind]?.(it.value) ?? it.value;
      } else if (typeof it.value === "boolean" && (copy.yes || copy.no)) {
        // 참·거짓을 말로 — 올스타의 선정·미선정
        value = it.value ? copy.yes : copy.no;
      } else {
        value = cellText(it.value, "");
      }
      return {
        value,
        caption: it.caption ?? copy.labels[it.key] ?? it.key,
        numeric: !idKind && isNumericCell(it.value),
      };
    }),
    note: cardsNote(md, copy),
    empty: copy.empty,
  };
}

/**
 * 카드 아래 한 줄 — 시즌 브리핑의 「올해는 선발로 시작합니다.」
 *
 * 🔴 **조사를 코드로 붙이지 않는다.** 「선발로」·「중계로」는 `roleAs` 표가
 *    갖는다 — `{role}` 을 그대로 끼우면 「중계으로」가 된다.
 *
 * ⚠ 소식이 문장을 실어 보내면 그것이 이긴다. 없을 때만 틀을 채운다.
 */
export function cardsNote(md: CardsMetadata, copy: CardsCopy): string {
  if (md.note) return md.note;
  if (!copy.noteTemplate) return "";
  const role = (md.items ?? []).find((i) => i.key === "role");
  const as = role && typeof role.value === "string" ? copy.roleAs[role.value] : undefined;
  // 굴절형을 못 찾으면 그 줄을 안 그린다 — 자리표가 남은 문장을 보이면 안 된다
  return as ? fillVar(copy.noteTemplate, "roleAs", as) : "";
}

// ── 타임라인 — 군 경력 · 복무 연차 · 고교 연감 (§1-5) ──────────

export interface TimelineEntryView {
  when: string;
  label: string;
  detail: string;
}

export interface TimelineView {
  title: string;
  entries: TimelineEntryView[];
  empty: string;
}

/**
 * ⚠ **여기서 순서를 다시 정하지 않는다.** 만드는 쪽이 실어 보낸 차례
 *   그대로다 — `when` 이 `W21`·`2031`·`상병` 처럼 꼴이 제각각이라 비교할
 *   수도 없다.
 */
export function buildTimeline(md: TimelineMetadata, copy: TimelineCopy): TimelineView {
  return {
    title: copy.title,
    entries: (md.entries ?? []).map((e) => ({
      when: e.when,
      // 이름표는 문안이 준다 — 「부대」를 소식에 굳히면 지난 소식만 옛 말로 남는다
      label: e.label ?? (e.key ? copy.labels[e.key] ?? e.key : ""),
      detail: e.detail ?? "",
    })),
    empty: copy.empty,
  };
}
