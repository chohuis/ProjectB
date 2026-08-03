// ── 시즌 개인 수상 ───────────────────────────────────────────────
//
// ⚠ **이 데이터가 통째로 없었다.** `careerHistory.highlights`와
// `CareerSeasonRecord.awards`는 타입만 있고 채우는 곳이 없어서 **항상 빈
// 배열**이었다. 그런데 읽는 쪽은 이미 있다:
//
//  · `universityUtils`가 진학 점수에 `awards.length * 15`를 더한다 → 항상 0
//  · 드래프트 점수에 "대회입상·개인수상을 넣는다"는 결정이 데이터가 없어 미완
//  · 경력 화면·인생 기록도 보여줄 게 없다
//
// 수치 정본은 `generation_rules.json`의 `awardRules`다.
//
// ⚠ **최소 출전 조건이 없으면 1경기 등판한 선수가 방어율왕이 된다** —
// 규정이닝·규정타석에 해당하는 `minIp`/`minPa`를 규칙 파일에 둔다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { loadRosterRules } from "../repo/newGameV3";
import { finiteOr } from "../utils/payloadNum";
import { leagueStatsOf } from "../utils/season-helpers";
import type { PlayerSeasonStats } from "../types/save";

interface AwardDef {
  id: string;
  label: string;
  stat: string;
  order: "asc" | "desc";
  minIp?: number;
  minPa?: number;
  /** 이 값에 못 미치면 수상 없음 (desc 부문) */
  minValue?: number;
  /** 이 값을 넘으면 수상 없음 (asc 부문 — 방어율) */
  maxValue?: number;
}

export interface AwardRules {
  leagues: string[];
  pitcher: AwardDef[];
  batter: AwardDef[];
  mvp: { label: string; minTitles: number };
}

/** 한 부문의 수상자. 화면과 경력기록이 **같은 값**을 쓴다 */
export interface AwardWinner {
  defId: string;
  label: string;
  playerId: string;
  value: number;
  /** 부문별 표기법을 거친 값 — "2.31" / ".312" / "27" */
  valueText: string;
  /** "방어율왕 (2.31)" — 경력기록에 남는 문자열과 동일 */
  title: string;
}

/** 한 부문의 1위 — 자격 미달은 후보에서 뺀다 */
function winnerOf(
  def: AwardDef,
  stats: Record<string, PlayerSeasonStats>,
): { playerId: string; value: number } | null {
  let best: { playerId: string; value: number } | null = null;
  for (const [playerId, st] of Object.entries(stats)) {
    if (def.minIp != null) {
      if (st.type !== "pitcher" || finiteOr(st.ip) < def.minIp) continue;
    }
    if (def.minPa != null) {
      if (st.type !== "batter" || finiteOr(st.pa) < def.minPa) continue;
    }
    const v = finiteOr((st as unknown as Record<string, unknown>)[def.stat], NaN);
    if (!Number.isFinite(v)) continue;
    if (best == null || (def.order === "desc" ? v > best.value : v < best.value)) {
      best = { playerId, value: v };
    }
  }
  // ⚠ **자격선이 없으면 0이 1위가 된다.** 실측에서 도루왕(0)·세이브왕(0)·
  // 방어율왕(8.45)이 나왔고 그 둘로 MVP까지 받았다. 부문마다 "이 정도는
  // 돼야 상"이라는 선이 있어야 한다 — 정본은 규칙 파일이다.
  if (best == null) return null;
  if (def.minValue != null && best.value < def.minValue) return null;
  if (def.maxValue != null && best.value > def.maxValue) return null;
  return best;
}

function fmt(def: AwardDef, v: number): string {
  if (def.stat === "era") return v.toFixed(2);
  if (def.stat === "avg") return `.${Math.round(v * 1000).toString().padStart(3, "0")}`;
  return String(Math.round(v));
}

/**
 * 한 리그의 부문 수상자를 전부 뽑는다. **화면과 기록의 유일한 계산 지점이다.**
 *
 * ⚠ 예전엔 `SeasonEndModal`이 같은 것을 따로 계산했다. 자격선이 `ip>=20` /
 * `ab>=50`으로 규칙 파일(`minIp` 60~70, `minPa` 120~200)과 달랐고 `minValue`
 * 하한이 아예 없어서, **모달에 뜬 수상자와 경력기록에 남는 수상자가 달랐다.**
 * 게다가 모달은 `$seasonStore.stats`를 읽었는데 그건 주인공 개인 버킷이라
 * 승강하면 1군·2군이 합산된다(`leagueStatsOf` 주석 참고).
 *
 * 정본이 둘이면 반드시 어긋난다 — 이 프로젝트에서 이미 여러 번 나온 형태다.
 */
export function computeAwards(
  rules: AwardRules,
  stats: Record<string, PlayerSeasonStats>,
): AwardWinner[] {
  const out: AwardWinner[] = [];
  for (const def of [...rules.pitcher, ...rules.batter]) {
    const w = winnerOf(def, stats);
    if (!w) continue;
    const valueText = fmt(def, w.value);
    out.push({
      defId: def.id, label: def.label, playerId: w.playerId, value: w.value,
      valueText, title: `${def.label} (${valueText})`,
    });
  }
  return out;
}

/** 규칙 파일에서 수상 규칙을 읽는다. 화면도 이걸 쓴다 — 상수를 다시 적지 않는다 */
export async function loadAwardRules(): Promise<AwardRules | null> {
  const rules = (await loadRosterRules()).awardRules as AwardRules | undefined;
  return rules?.leagues?.length ? rules : null;
}

/**
 * 시즌 개인 수상을 정하고 `careerHistory`에 기록한다.
 *
 * **`runWorldSeasonEnd`가 부른다** — 주인공이 무엇을 하든 매 시즌 돌아야 하고,
 * 연도 기록(`applySeasonHistory`)이 끝난 **뒤**여야 그 해 항목에 얹을 수 있다.
 */
export async function applySeasonAwards(seasonYear: number): Promise<string[]> {
  const rules = await loadAwardRules();
  if (!rules) return [];

  const s = get(seasonStore);
  const logs: string[] = [];
  // playerId → 그 해 받은 상 이름들
  const won = new Map<string, string[]>();

  for (const leagueId of rules.leagues) {
    // ⚠ `s.stats`로 대체하면 안 된다 — 그건 주인공 개인 기록이고 승강으로
    // 오르내리면 1군·2군이 합산돼 있다(`leagueStatsOf` 주석 참고)
    const stats: Record<string, PlayerSeasonStats> = leagueStatsOf(s, leagueId);
    if (Object.keys(stats).length === 0) continue;

    for (const w of computeAwards(rules, stats)) {
      const list = won.get(w.playerId) ?? [];
      list.push(w.title);
      won.set(w.playerId, list);
    }
  }

  // MVP — 부문 1위를 여럿 가져간 선수. 별도 지표를 만들면 부문 수상과 어긋난다
  for (const [playerId, titles] of won) {
    if (titles.length >= rules.mvp.minTitles) titles.push(rules.mvp.label);
  }

  if (won.size === 0) return logs;
  gameStore.addSeasonHighlights(seasonYear, won);

  const top = [...won.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  logs.push(`[수상] ${seasonYear} ${won.size}명 수상 (최다 ${top[1].length}개)`);
  return logs;
}
