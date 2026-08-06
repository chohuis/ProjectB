/**
 * 경기 화면의 타자·투수 카드.
 *
 * 앞면은 능력치, 뒷면은 시즌 성적이다.
 *
 * ⚠ **없는 성적을 0으로 그리지 않는다.** 시즌 초라 기록이 없거나 그 선수가
 * 아직 리그 통계에 안 잡혔으면 `null`을 돌려주고 화면은 "기록 없음"을 쓴다.
 * 0으로 그리면 "타율 .000"이라는 거짓이 된다 — 이 프로젝트는 이미
 * "부상위험 %"에서 화면이 값을 지어낸 전례가 있다.
 */
import type { PlayerSeasonStats, BatterSeasonStats, PitcherSeasonStats } from "../types/save";

export interface StatBar {
  label: string;
  /** 0~100 능력치 */
  value: number;
}

export interface StatLine {
  label: string;
  value: string;
}

/**
 * 능력치 묶음 — 값이 없는 항목은 아예 빼고 넘긴다.
 *
 * 인덱스 시그니처를 요구하면 호출부(엔진 스냅샷 인터페이스)가 못 넘긴다.
 * 읽을 때 숫자인지 확인하므로 `object`로 받아도 안전하다.
 */
type Attrs = object;

/**
 * 타석에서 의미 있는 것만. 열 개를 다 늘어놓으면 무엇을 봐야 할지가 사라진다.
 *
 * ⚠ 엔진은 처음부터 열 개를 보내고 있었는데 **화면은 셋만 읽었다**
 * (`contact` · `power` · `eye`). 나머지는 오고 있던 값이다.
 */
const BATTER_KEYS: [key: string, label: string][] = [
  ["contact", "컨택"],
  ["power", "파워"],
  ["eye", "선구"],
  ["battingClutch", "클러치"],
  ["speed", "주력"],
];

export function batterBars(attrs: Attrs | null | undefined): StatBar[] {
  if (!attrs) return [];
  const src = attrs as Record<string, unknown>;
  const out: StatBar[] = [];
  for (const [key, label] of BATTER_KEYS) {
    const v = src[key];
    if (typeof v === "number" && Number.isFinite(v)) out.push({ label, value: v });
  }
  return out;
}

const isBatter = (s: PlayerSeasonStats): s is BatterSeasonStats => s.type === "batter";
const isPitcher = (s: PlayerSeasonStats): s is PitcherSeasonStats => s.type === "pitcher";

/** `.298` — 야구 표기는 앞의 0을 뗀다 */
function rate3(v: number): string {
  if (!Number.isFinite(v)) return "-";
  const s = Math.abs(v).toFixed(3);
  return (v < 0 ? "-" : "") + (Math.abs(v) < 1 ? s.slice(1) : s);
}

/**
 * 카드 뒷면 줄. 기록이 없으면 **빈 배열** — 화면이 "기록 없음"을 쓰게 한다.
 *
 * ⚠ 타석 0인데 타율을 그리지 않는다. `avg`는 계산값이라 0으로 들어와 있고,
 * 그걸 그대로 쓰면 "이 타자 타율 .000"이 된다.
 */
export function seasonLines(stats: PlayerSeasonStats | null | undefined): StatLine[] {
  if (!stats) return [];

  if (isBatter(stats)) {
    if (!stats.pa || stats.pa <= 0) return [];
    return [
      { label: "타율", value: stats.ab > 0 ? rate3(stats.avg) : "-" },
      { label: "OPS", value: stats.ab > 0 ? rate3(stats.ops) : "-" },
      { label: "홈런", value: `${stats.hr}` },
      { label: "타점", value: `${stats.rbi}` },
      { label: "경기", value: `${stats.g}` },
    ];
  }

  if (isPitcher(stats)) {
    if (!stats.g || stats.g <= 0) return [];
    return [
      { label: "ERA", value: stats.ip > 0 ? stats.era.toFixed(2) : "-" },
      { label: "WHIP", value: stats.ip > 0 ? stats.whip.toFixed(2) : "-" },
      { label: "이닝", value: stats.ip.toFixed(1) },
      { label: "탈삼진", value: `${stats.k}` },
      { label: "경기", value: `${stats.g}` },
    ];
  }

  return [];
}

/**
 * 리그별로 흩어진 시즌 통계에서 한 선수를 찾는다.
 *
 * 주인공 리그는 `stats`에, 나머지는 `leagueState[리그].stats`에 있다.
 * 상대 타자는 대개 후자다.
 */
export function seasonStatsOf(
  playerId: string | null | undefined,
  primary: Record<string, PlayerSeasonStats> | null | undefined,
  byLeague: Record<string, { stats?: Record<string, PlayerSeasonStats> }> | null | undefined,
): PlayerSeasonStats | null {
  if (!playerId) return null;
  const direct = primary?.[playerId];
  if (direct) return direct;
  for (const ls of Object.values(byLeague ?? {})) {
    const hit = ls?.stats?.[playerId];
    if (hit) return hit;
  }
  return null;
}
