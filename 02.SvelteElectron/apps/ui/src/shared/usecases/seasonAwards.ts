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
import { slotRepo } from "../repo/slotRepo";
import { isV3SlotActive } from "../repo/v3Mode";
import { finiteOr } from "../utils/payloadNum";
import { leagueStatsOf } from "../utils/season-helpers";
import type { BatterSeasonStats, CareerAward, PitcherSeasonStats, PlayerSeasonStats } from "../types/save";

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
  /** 신인왕. 없으면 안 뽑는다(구 규칙 파일 호환) */
  rookie?: { label: string; maxProYears: number; leagues?: string[] };
  /** 골든글러브. 없으면 안 뽑는다(구 규칙 파일 호환) */
  golden?: GoldenRules;
}

export interface GoldenRules {
  leagues: string[];
  qualify: Record<string, { minPa: number; minIp: number; minChances: number }>;
  positions: { pos: string; label: string; ops: number; fpct: number }[];
  dh: { label: string };
  pitcher: { label: string; stat: string; order: "asc" | "desc" };
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
  /**
   * 2위와의 상대 격차 (0~). **MVP 폴백의 기준이다.**
   *
   * 부문마다 단위가 달라 절대값으로는 비교가 안 된다(다승 20 vs 타율 .338).
   * 비율로 재면 "얼마나 압도적으로 1위였나"가 부문 간에 비교된다.
   */
  dominance: number;
}

/** 한 부문의 1위 — 자격 미달은 후보에서 뺀다 */
function winnerOf(
  def: AwardDef,
  stats: Record<string, PlayerSeasonStats>,
): { playerId: string; value: number; second: number | null } | null {
  let best: { playerId: string; value: number } | null = null;
  let second: number | null = null;
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
      if (best != null) second = best.value;
      best = { playerId, value: v };
    } else if (second == null || (def.order === "desc" ? v > second : v < second)) {
      second = v;
    }
  }
  // ⚠ **자격선이 없으면 0이 1위가 된다.** 실측에서 도루왕(0)·세이브왕(0)·
  // 방어율왕(8.45)이 나왔고 그 둘로 MVP까지 받았다. 부문마다 "이 정도는
  // 돼야 상"이라는 선이 있어야 한다 — 정본은 규칙 파일이다.
  if (best == null) return null;
  if (def.minValue != null && best.value < def.minValue) return null;
  if (def.maxValue != null && best.value > def.maxValue) return null;
  return { ...best, second };
}

/** 비율 부문 — 앞의 0을 떼고 소수 셋째 자리까지 (야구 관습) */
const RATE_STATS = new Set(["avg", "obp", "slg", "winPct"]);

function fmt(def: AwardDef, v: number): string {
  if (def.stat === "era") return v.toFixed(2);
  // ⚠ 1.0 이상(장타율)은 앞자리를 살린다 — `.1234`가 되면 안 된다
  if (RATE_STATS.has(def.stat)) {
    const s = v.toFixed(3);
    return v < 1 ? s.slice(1) : s;
  }
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
    // 방어율은 낮을수록 좋다 — 방향을 맞춰야 부문 간 비교가 된다
    const gap = w.second == null ? 0
      : def.order === "desc" ? w.value - w.second : w.second - w.value;
    const base = Math.abs(w.second ?? w.value) || 1;
    out.push({
      defId: def.id, label: def.label, playerId: w.playerId, value: w.value,
      valueText, title: `${def.label} (${valueText})`,
      dominance: Math.max(0, gap / base),
    });
  }
  return out;
}

/** 수비 기회 — 자살 + 보살 + 실책. **하한이 없으면 기회 1인 선수가 1.000으로 1위다** */
function chancesOf(b: BatterSeasonStats): number {
  return (b.po ?? 0) + (b.a ?? 0) + (b.e ?? 0);
}

/**
 * 리그 안에서 0~1로 정규화한다.
 *
 * 🔴 **OPS와 수비율은 단위가 다르다.** 그대로 더하면 OPS(0.7~1.1)가
 *   수비율(0.94~1.00)을 지배한다 — 가중치가 의미를 잃는다.
 * ⚠ 전원이 같은 값이면 0.5를 준다(나눗셈이 터지지 않게).
 */
function normalizer(values: number[]): (v: number) => number {
  const lo = Math.min(...values), hi = Math.max(...values);
  if (!Number.isFinite(lo) || hi <= lo) return () => 0.5;
  return (v) => (v - lo) / (hi - lo);
}

/**
 * **골든글러브.** 포지션별로 공격·수비를 섞어 1위를 뽑는다.
 *
 * ⚠ **MVP 셈에는 안 들어간다**(사용자 확정) — 넣으면 수상자가
 *   `minTitles 2`를 쉽게 채워 MVP가 흔해진다.
 * ⚠ **지명타자는 별도 추적이 없다.** 규정타석을 채웠는데 **수비 기회가
 *   자격선 미만**인 타자가 곧 DH다 — 수비를 안 나갔다는 뜻이다.
 * ⚠ 포지션은 **고정 판정**이다(사용자 확정) — 엔티티의 값 하나를 본다.
 */
export function computeGoldenGlove(
  g: GoldenRules,
  leagueId: string,
  stats: Record<string, PlayerSeasonStats>,
  positionOf: (playerId: string) => string,
): AwardWinner[] {
  const q = g.qualify[leagueId];
  if (!q) return [];
  const out: AwardWinner[] = [];

  const bats = Object.entries(stats)
    .filter(([, st]) => st.type === "batter" && finiteOr((st as BatterSeasonStats).pa) >= q.minPa)
    .map(([id, st]) => [id, st as BatterSeasonStats] as const);

  // 정규화 기준은 **자격을 갖춘 야수 전체**다 — 포지션마다 따로 하면
  // 사람이 적은 자리(포수)에서 눈금이 널뛴다
  const fielders = bats.filter(([, b]) => chancesOf(b) >= q.minChances);
  const nOps  = normalizer(fielders.map(([, b]) => finiteOr(b.ops)));
  const nFpct = normalizer(fielders.map(([, b]) => finiteOr(b.fpct)));

  const push = (label: string, id: string, value: number, text: string, second: number | null) => {
    const base = Math.abs(second ?? value) || 1;
    out.push({
      defId: `golden_${label}`, label, playerId: id, value,
      valueText: text, title: `${label} (${text})`,
      dominance: Math.max(0, ((second == null ? 0 : value - second)) / base),
    });
  };

  for (const def of g.positions) {
    const pool = fielders.filter(([id]) => positionOf(id) === def.pos);
    if (pool.length === 0) continue;
    const scored = pool.map(([id, b]) => ({
      id,
      score: nOps(finiteOr(b.ops)) * def.ops + nFpct(finiteOr(b.fpct)) * def.fpct,
      fpct: finiteOr(b.fpct),
    })).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const w = scored[0];
    push(def.label, w.id, w.score, w.fpct.toFixed(3).replace(/^0/, ""),
         scored[1]?.score ?? null);
  }

  // 지명타자 — 규정타석은 채웠는데 **수비를 안 나간** 타자
  const dhPool = bats.filter(([, b]) => chancesOf(b) < q.minChances)
    .map(([id, b]) => ({ id, ops: finiteOr(b.ops) }))
    .sort((a, b) => b.ops - a.ops || a.id.localeCompare(b.id));
  if (dhPool.length > 0) {
    const w = dhPool[0];
    push(g.dh.label, w.id, w.ops, w.ops.toFixed(3).replace(/^0/, ""),
         dhPool[1]?.ops ?? null);
  }

  // 투수 — ERA 1위(규정이닝). 부문 표를 다시 적지 않는다
  const pits = Object.entries(stats)
    .filter(([, st]) => st.type === "pitcher"
      && finiteOr((st as PitcherSeasonStats).ip) >= q.minIp)
    .map(([id, st]) => ({ id, era: finiteOr((st as PitcherSeasonStats).era) }))
    .sort((a, b) => a.era - b.era || a.id.localeCompare(b.id));
  if (pits.length > 0) {
    const w = pits[0];
    const second = pits[1]?.era ?? null;
    const base = Math.abs(second ?? w.era) || 1;
    out.push({
      defId: `golden_${g.pitcher.label}`, label: g.pitcher.label, playerId: w.id,
      value: w.era, valueText: w.era.toFixed(2), title: `${g.pitcher.label} (${w.era.toFixed(2)})`,
      // 방어율은 낮을수록 좋다 — 방향을 맞춘다
      dominance: Math.max(0, (second == null ? 0 : second - w.era) / base),
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
/**
 * 그 해 수상을 리그별로 갈라 연감(`history_league` kind=awards)에 남긴다.
 *
 * ⚠ **이름을 그때 값으로 박는다.** 조회로 대신하면 은퇴·이적으로 사라진 사람이
 *   ID로 떨어진다 — 화면이 내부 값을 흘리면 안 된다.
 */
async function saveSeasonAwards(
  seasonYear: number, won: Map<string, string[]>,
): Promise<void> {
  const g = get(gameStore);
  if (!isV3SlotActive() || !g.currentSlotId) return;
  const nameOf = new Map((g.npcs ?? []).map((n) => [n.npcId, n.name]));
  const teamOf = new Map((g.npcs ?? []).map((n) => [n.npcId, n.currentTeam ?? ""]));
  const lgOf   = new Map((g.npcs ?? []).map((n) => [n.npcId, n.currentLeague ?? ""]));

  const byLeague = new Map<string, { playerId: string; name: string; teamId: string; awards: string[] }[]>();
  for (const [pid, list] of won) {
    const isProt = pid === g.protagonist.id;
    const lg = isProt ? (g.protagonist.leagueId ?? "") : (lgOf.get(pid) ?? "");
    if (!lg) continue;
    const row = {
      playerId: pid,
      name: isProt ? g.protagonist.name : (nameOf.get(pid) ?? ""),
      teamId: isProt ? (g.protagonist.teamId ?? "") : (teamOf.get(pid) ?? ""),
      awards: list,
    };
    if (!row.name) continue;   // 이름을 모르면 안 남긴다 — ID를 흘리지 않는다
    if (!byLeague.has(lg)) byLeague.set(lg, []);
    byLeague.get(lg)!.push(row);
  }
  for (const [leagueId, rows] of byLeague) {
    rows.sort((a, b) => b.awards.length - a.awards.length || a.name.localeCompare(b.name));
    try {
      await slotRepo.saveHistoryLeague({
        slotId: g.currentSlotId, year: seasonYear, leagueId, kind: "awards", data: rows,
      });
    } catch { /* 연감 저장이 실패해도 시즌 종료는 계속돼야 한다 */ }
  }
}

export async function applySeasonAwards(seasonYear: number): Promise<string[]> {
  const rules = await loadAwardRules();
  if (!rules) return [];

  const s = get(seasonStore);
  const logs: string[] = [];
  // playerId → 그 해 받은 상 이름들
  const won = new Map<string, string[]>();
  const prot = get(gameStore).protagonist;
  // ⚠ 주인공 수상은 **따로 모은다.** `addSeasonHighlights`가 `s.npcs`만 훑어서
  // 주인공은 `won`에 들어가도 기록될 곳이 없다(`addProtagonistAwards` 주석 참고).
  // 문자열 title을 다시 파싱해 되살리지 않는다 — 정본이 둘이 되면 어긋난다
  const protAwards: CareerAward[] = [];

  // 신인 판정 — NPC는 `proServiceYears`, 주인공은 `proYears`
  // ⚠ 한 번만 만든다. 리그 루프 안에서 매번 만들면 NPC 전체를 리그 수만큼 훑는다
  const maxRookieYears = rules.rookie?.maxProYears ?? 1;
  const rookieIds = new Set<string>();
  for (const n of get(gameStore).npcs ?? []) {
    if ((n.proServiceYears ?? 0) <= maxRookieYears) rookieIds.add(n.npcId);
  }
  // ⚠ 주인공도 같은 필드다 — `isFaEligible`이 쓰는 축과 하나여야 한다
  if ((prot.proServiceYears ?? 0) <= maxRookieYears) rookieIds.add(prot.id);
  const isRookie = (pid: string) => rookieIds.has(pid);

  // 포지션 — **고정 판정**(사용자 확정). 엔티티의 값 하나를 본다.
  // ⚠ 한 번만 만든다. 리그 루프 안에서 매번 만들면 NPC 전체를 리그 수만큼 훑는다
  const posOf = new Map<string, string>();
  for (const n of get(gameStore).npcs ?? []) posOf.set(n.npcId, n.position ?? "");
  posOf.set(prot.id, String(prot.position ?? ""));
  const positionOf = (pid: string) => posOf.get(pid) ?? "";

  for (const leagueId of rules.leagues) {
    // ⚠ `s.stats`로 대체하면 안 된다 — 그건 주인공 개인 기록이고 승강으로
    // 오르내리면 1군·2군이 합산돼 있다(`leagueStatsOf` 주석 참고)
    const leagueOnly: Record<string, PlayerSeasonStats> = leagueStatsOf(s, leagueId);
    if (Object.keys(leagueOnly).length === 0) continue;

    // ⚠ **주인공을 후보에 넣는다.** 주인공 기록은 `s.stats[p.id]`에 따로 있고
    // 리그 맵(`leagueState[].stats`)엔 **없다.** 그래서 어떤 부문도 이길 수
    // 없었고 `SeasonEndModal`의 `a.playerId === pid` 필터는 영원히 빈 배열이었다.
    //
    // 파급이 여기서 끝나지 않는다 — `universityUtils`의 진학 점수
    // `awards.length * 15`도 항상 0이었고, 경력 화면·인생 기록에도 주인공
    // 수상이 한 번도 안 남았다.
    //
    // ⚠ **자기 리그에만 넣는다.** `s.stats`는 승강하면 1군·2군이 합산돼 있어
    // 다른 리그 후보로 올리면 저울이 어긋난다.
    const protStat = (s as unknown as { stats?: Record<string, PlayerSeasonStats> })
      .stats?.[prot.id];
    const stats: Record<string, PlayerSeasonStats> =
      protStat && prot.leagueId === leagueId
        ? { ...leagueOnly, [prot.id]: protStat }
        : leagueOnly;

    // ⚠ **MVP는 리그별로 뽑는다.** `won`은 전 리그를 한 Map에 담으므로
    // 여기서 리그 안에서만 판정해야 한다 — 리그를 합치면 KBO MVP와 고교
    // MVP가 같은 저울에 올라간다.
    const winners = computeAwards(rules, stats);
    const inLeague = new Map<string, number>();
    for (const w of winners) {
      const list = won.get(w.playerId) ?? [];
      list.push(w.title);
      won.set(w.playerId, list);
      inLeague.set(w.playerId, (inLeague.get(w.playerId) ?? 0) + 1);
      if (w.playerId === prot.id) {
        protAwards.push({ id: w.defId, label: w.label, value: w.valueText });
      }
    }

    // ── 신인왕 ─────────────────────────────────────────────────
    //
    // 🔴 **없었다** (2026-08-29). 드래프트도 데뷔도 있는데 신인상이 없었다.
    //
    // ⚠ **새 지표를 만들지 않는다.** 부문 표를 **신인에게만 다시 돌려서**
    //   그중 가장 압도적으로 1위한 선수에게 준다 — MVP 폴백과 같은 잣대다.
    //   별도 점수를 만들면 부문 1위와 어긋난다(설계 원칙).
    //
    // ⚠ 신인은 `proServiceYears <= 1`이다. NPC는 `gameStore.npcs`가,
    //   주인공은 `protagonist.proYears`가 갖고 있다.
    // ⚠ **프로 리그만이다.** 고교·대학은 `proServiceYears`가 0이라 전원이
    //   신인으로 잡힌다 — 실측에서 후보가 7,443명이었다
    if (rules.rookie && (rules.rookie.leagues ?? []).includes(leagueId)) {
      const rookieStats: Record<string, PlayerSeasonStats> = {};
      for (const [pid, st] of Object.entries(stats)) {
        if (isRookie(pid)) rookieStats[pid] = st;
      }
      const rookieWinners = computeAwards(rules, rookieStats);
      if (rookieWinners.length > 0) {
        const top = rookieWinners.reduce((a, b) => (b.dominance > a.dominance ? b : a));
        won.get(top.playerId)?.push(rules.rookie.label)
          ?? won.set(top.playerId, [rules.rookie.label]);
        if (top.playerId === prot.id) {
          protAwards.push({ id: "rookie", label: rules.rookie.label });
        }
      }
    }

    // ── 골든글러브 ─────────────────────────────────────────────
    //
    // ⚠ **MVP 셈 밖이다**(사용자 확정) — `inLeague`를 안 건드린다.
    //   넣으면 수상자가 `minTitles 2`를 쉽게 채워 MVP가 흔해진다.
    if (rules.golden && rules.golden.leagues.includes(leagueId)) {
      for (const w of computeGoldenGlove(rules.golden, leagueId, stats, positionOf)) {
        const list = won.get(w.playerId) ?? [];
        list.push(w.title);
        won.set(w.playerId, list);
        if (w.playerId === prot.id) {
          protAwards.push({ id: w.defId, label: w.label, value: w.valueText });
        }
      }
    }

    // MVP — 부문 1위를 여럿 가져간 선수. 별도 지표를 만들면 부문 수상과 어긋난다
    const multi = [...inLeague.entries()].filter(([, n]) => n >= rules.mvp.minTitles);
    if (multi.length > 0) {
      for (const [playerId] of multi) {
        won.get(playerId)?.push(rules.mvp.label);
        if (playerId === prot.id) protAwards.push({ id: "mvp", label: rules.mvp.label });
      }
    } else if (winners.length > 0) {
      // ⚠ **아무도 2부문을 못 채우는 해가 있다** (사용자 확정 2026-08-03).
      // 8부문에 자격자 100명이면 석권이 매년 나오지 않는다 — 실측 격년꼴이었다.
      // 실제 리그는 매년 MVP가 나오므로, 그 해엔 **가장 압도적으로 1위를 한**
      // 선수에게 준다. `minTitles`를 1로 낮추면 한 해에 8명이 되어 의미가 없고,
      // 별도 지표를 만들면 부문 1위와 어긋난다(설계 원칙).
      const top = winners.reduce((a, b) => (b.dominance > a.dominance ? b : a));
      won.get(top.playerId)?.push(rules.mvp.label);
      if (top.playerId === prot.id) protAwards.push({ id: "mvp", label: rules.mvp.label });
    }
  }

  gameStore.addProtagonistAwards(seasonYear, protAwards);
  if (won.size === 0) return logs;
  gameStore.addSeasonHighlights(seasonYear, won);

  // 🔴 **연감에 남긴다.** `won`은 이미 여기 있었는데 로그로만 쓰이고 사라졌다 —
  //    다음 시즌이 되면 "작년 MVP가 누구였나"를 알 방법이 없었다.
  //    이름을 **그때 값으로 박아 둔다** — 나중에 조회로 대신하면 은퇴·이적으로
  //    사라진 사람이 ID로 떨어진다(`LeaguePage`의 `histPersonName` 주석과 같은 이유).
  await saveSeasonAwards(seasonYear, won);

  const top = [...won.entries()].sort((a, b) => b[1].length - a[1].length)[0];
  logs.push(`[수상] ${seasonYear} ${won.size}명 수상 (최다 ${top[1].length}개)`);
  return logs;
}
