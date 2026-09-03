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
  RankListMetadata, TableCell, TableColumn, TableMetadata, Top10Metadata,
} from "../types/main";

/** 변동 표시의 세 갈래. 색은 화면이 이 값으로 고른다 */
export type DeltaDir = "up" | "down" | "flat";

export interface DeltaMark {
  dir: DeltaDir;
  /** 그대로 찍는 글자 — `↑2` · `↓1` · `—` */
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
  if (delta > 0) return { dir: "up", text: `↑${delta}` };
  if (delta < 0) return { dir: "down", text: `↓${-delta}` };
  return { dir: "flat", text: "—" };
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
export function cellText(v: TableCell | undefined): string {
  if (v == null || v === "") return "—";
  if (typeof v === "boolean") return v ? "○" : "—";
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
export function buildTableRows(md: TableMetadata): TableRowView[] {
  const cols = md.columns ?? [];
  return (md.rows ?? []).map((row, ri) => ({
    cells: cols.map((c, ci) => ({
      key: c.key,
      text: cellText(row[c.key]),
      align: cellAlign(c, ci),
      numeric: isNumericCell(row[c.key]),
    })),
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
  columns: RankColumnView[];
}

/**
 * 순위 소식 한 벌을 화면이 그대로 그릴 모양으로 바꾼다.
 *
 * ⚠ **`Top10Metadata` 에는 변동이 없다.** 4주마다 나오는 랭킹인데 지난 값을
 *   저장하는 자리가 없다 (§3-1). 없으면 `null` 이라 화면이 칸을 안 그린다 —
 *   `0` 으로 채우면 「변동 없음」과 「모름」이 같아 보인다.
 */
export function buildRankList(md: Top10Metadata | RankListMetadata): RankListView {
  if (md.type === "top10") {
    const typeKr = md.playerType === "pitcher" ? "투수" : "타자";
    return {
      subtitle: `고교 ${typeKr} 유망주 월간 랭킹 · W${md.week} · ${md.seasonYear}시즌`,
      columns: md.columns.map((c) => ({
        label: c.label,
        heroRank: c.heroRank,
        entries: c.entries.map((e) => ({
          id: e.id,
          rank: e.rank,
          name: e.name,
          sub: e.teamName,
          isMe: e.id === "PLY_HERO",
          delta: null,
        })),
      })),
    };
  }

  return {
    subtitle: md.title ?? "",
    columns: [{
      label: "",
      heroRank: null,
      entries: (md.items ?? []).map((it) => ({
        id: "",
        rank: it.rank,
        name: it.label,
        sub: it.sub ?? "",
        isMe: it.isMe === true,
        delta: deltaMark(it.delta),
      })),
    }],
  };
}
