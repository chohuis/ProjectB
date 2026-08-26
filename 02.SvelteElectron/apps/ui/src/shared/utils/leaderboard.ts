import type { PitcherSeasonStats, BatterSeasonStats } from "../types/save";
import { ipLabel } from "./baseballFormat";

/**
 * 스탯 순위의 **부문 정의 정본**. (U6)
 *
 * 지금까지 리그 화면은 정렬이 하나뿐이었다 — 투수 ERA 오름차순, 타자 AVG
 * 내림차순 **고정**. 그래서 세이브 34개를 던진 마무리는 화면 어디에도 안 나왔다.
 * 컬럼만 늘려도 안 된다. 20위 안에 못 들면 여전히 안 보인다.
 *
 * ⚠ **비율 부문과 누적 부문은 자격 조건이 다르다.**
 * 10이닝만 던진 선수가 ERA 0.00으로 1위가 되면 순위표가 의미를 잃는다.
 * 반대로 세이브·홈런 같은 누적 부문에 자격을 걸면 **아무도 못 채운다** —
 * 마무리는 규정이닝을 절대 못 채우기 때문이다. 실제 야구가 그렇게 나눈다.
 */

export type StatSide = "pitcher" | "batter";
/** 낮을수록 좋은가 */
export type SortDir = "asc" | "desc";
/** 비율(자격 필요) / 누적(자격 없음) */
export type StatKind = "rate" | "count";

export interface StatCategory {
  key: string;
  label: string;
  side: StatSide;
  dir: SortDir;
  kind: StatKind;
  /** 표에 기본으로 보이는 부문인가 — 카드로 뽑는 것과 별개다 */
  card: boolean;
  value: (s: PitcherSeasonStats | BatterSeasonStats) => number;
  format: (v: number) => string;
}

/** ".213" — 앞의 0을 떼는 야구 관습. 1.000은 그대로 둔다 */
export function rate3(v: number): string {
  return v.toFixed(3).replace(/^0/, "");
}
/** "2.14" */
const two = (v: number) => v.toFixed(2);
/** "178.1" — 이닝은 소수 첫자리가 3분의 몇이라 반올림하면 안 된다 */
const ipText = (v: number) => ipLabel(v);
const int = (v: number) => String(Math.round(v));

const P = (f: (p: PitcherSeasonStats) => number) =>
  (s: PitcherSeasonStats | BatterSeasonStats) => f(s as PitcherSeasonStats);
const B = (f: (b: BatterSeasonStats) => number) =>
  (s: PitcherSeasonStats | BatterSeasonStats) => f(s as BatterSeasonStats);

export const CATEGORIES: StatCategory[] = [
  // ── 투수 ──
  { key: "era",  label: "평균자책점", side: "pitcher", dir: "asc",  kind: "rate",  card: true,  value: P((p) => p.era),  format: two },
  { key: "w",    label: "다승",       side: "pitcher", dir: "desc", kind: "count", card: true,  value: P((p) => p.w),    format: int },
  { key: "k",    label: "탈삼진",     side: "pitcher", dir: "desc", kind: "count", card: true,  value: P((p) => p.k),    format: int },
  { key: "sv",   label: "세이브",     side: "pitcher", dir: "desc", kind: "count", card: true,  value: P((p) => p.sv),   format: int },
  { key: "hd",   label: "홀드",       side: "pitcher", dir: "desc", kind: "count", card: true,  value: P((p) => p.hd),   format: int },
  { key: "whip", label: "WHIP",       side: "pitcher", dir: "asc",  kind: "rate",  card: false, value: P((p) => p.whip), format: two },
  { key: "ip",   label: "이닝",       side: "pitcher", dir: "desc", kind: "count", card: false, value: P((p) => p.ip),   format: ipText },
  { key: "g",    label: "경기",       side: "pitcher", dir: "desc", kind: "count", card: false, value: P((p) => p.g),    format: int },
  { key: "l",    label: "패",         side: "pitcher", dir: "desc", kind: "count", card: false, value: P((p) => p.l),    format: int },
  { key: "bb_p", label: "볼넷",       side: "pitcher", dir: "desc", kind: "count", card: false, value: P((p) => p.bb),   format: int },

  // ── 타자 ──
  { key: "avg",  label: "타율",   side: "batter", dir: "desc", kind: "rate",  card: true,  value: B((b) => b.avg), format: rate3 },
  { key: "hr",   label: "홈런",   side: "batter", dir: "desc", kind: "count", card: true,  value: B((b) => b.hr),  format: int },
  { key: "rbi",  label: "타점",   side: "batter", dir: "desc", kind: "count", card: true,  value: B((b) => b.rbi), format: int },
  { key: "sb",   label: "도루",   side: "batter", dir: "desc", kind: "count", card: true,  value: B((b) => b.sb),  format: int },
  { key: "ops",  label: "OPS",    side: "batter", dir: "desc", kind: "rate",  card: true,  value: B((b) => b.ops), format: rate3 },
  { key: "obp",  label: "출루율", side: "batter", dir: "desc", kind: "rate",  card: false, value: B((b) => b.obp), format: rate3 },
  { key: "slg",  label: "장타율", side: "batter", dir: "desc", kind: "rate",  card: false, value: B((b) => b.slg), format: rate3 },
  { key: "h_b",  label: "안타",   side: "batter", dir: "desc", kind: "count", card: false, value: B((b) => b.h),   format: int },
  { key: "ab",   label: "타수",   side: "batter", dir: "desc", kind: "count", card: false, value: B((b) => b.ab),  format: int },
  { key: "bb_b", label: "볼넷",   side: "batter", dir: "desc", kind: "count", card: false, value: B((b) => b.bb),  format: int },
];

export function categoriesFor(side: StatSide): StatCategory[] {
  return CATEGORIES.filter((c) => c.side === side);
}
export function cardCategoriesFor(side: StatSide): StatCategory[] {
  return CATEGORIES.filter((c) => c.side === side && c.card);
}
export function categoryByKey(key: string): StatCategory | undefined {
  return CATEGORIES.find((c) => c.key === key);
}

/**
 * 규정이닝 · 규정타석.
 *
 * 실제 야구는 **팀 경기 수**에 비례한다 (KBO 기준 이닝 ×1.0 · 타석 ×3.1).
 * 시즌 중에는 치른 경기 수만큼만 요구하므로 순위표가 초반부터 돈다.
 *
 * ⚠ 바닥값(10이닝 · 20타석)을 남겨 둔다. 고교처럼 경기 수가 적은 리그에서
 * 비례식만 쓰면 자격자가 **0명**이 되어 순위표가 통째로 빈다.
 */
export interface Qual { ip: number; pa: number; games: number }

export function qualificationOf(gamesPlayed: number): Qual {
  return {
    games: gamesPlayed,
    ip: Math.max(10, Math.round(gamesPlayed * 1.0)),
    pa: Math.max(20, Math.round(gamesPlayed * 3.1)),
  };
}

/** 이 선수가 비율 부문에 낄 자격이 되는가 */
export function qualifies(s: PitcherSeasonStats | BatterSeasonStats, q: Qual): boolean {
  if (s.type === "pitcher") return s.ip >= q.ip;
  return s.pa >= q.pa;
}

export interface LbRow {
  id: string;
  name: string;
  team: string;
  stats: PitcherSeasonStats | BatterSeasonStats;
  qualified: boolean;
}

/**
 * 한 부문의 순위. 비율 부문은 자격자만, 누적 부문은 전원.
 *
 * 동률은 **ID로 마지막 정렬**한다 — 안 그러면 같은 값들의 순서가 렌더마다
 * 바뀌어 화면이 흔들린다(정렬이 안정적이지 않은 엔진에서 실제로 그렇다).
 */
export function rankBy(rows: readonly LbRow[], cat: StatCategory, limit = 0): LbRow[] {
  const pool = cat.kind === "rate" ? rows.filter((r) => r.qualified) : rows;
  const sorted = [...pool].sort((a, b) => {
    const av = cat.value(a.stats);
    const bv = cat.value(b.stats);
    if (av !== bv) return cat.dir === "asc" ? av - bv : bv - av;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}
