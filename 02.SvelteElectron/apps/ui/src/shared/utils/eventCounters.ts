import type { EventRule, Condition, EventContext } from "../types/event";
import type { ProtagonistSave } from "../types/save";
import { resolveNumber } from "./eventPaths";

/**
 * **세는 칸** — `streak`·`count` 조건이 읽는 두 자리 (PLAN_EVENT_TIERS §12).
 *
 * 🔴 조건 50종은 전부 「그 순간」이라, 「그렇게 해 왔다」를 물을 수단이 없었다.
 *   한 주만 성실 90 을 찍은 사람과 20주 유지한 사람이 **구분이 안 됐다.**
 *
 * ⚠ **여기가 유일한 갱신 자리다.** 값은 `protagonist.streaks`·
 *   `protagonist.counters` 에 있고 세이브에 그대로 실린다(JSON 블롭이라
 *   마이그레이션이 없다 — 없으면 `{}` 다).
 *
 * ⚠ **데이터에 안 쓰인 축은 안 센다.** 「쓸지도 모르니 다 세자」로 두면
 *   세이브가 축마다 커지고, 어느 칸이 실제로 읽히는지도 모르게 된다.
 *   `collectStreakKeys` 가 규칙에서 뽑아 온다.
 */

// ── streak ─────────────────────────────────────────────────────

/** `"diligence:gte:90"` — 조건 셋을 그대로 키로 쓴다. 표를 따로 두면 어긋난다 */
export function streakKeyOf(c: { metric: string; op: "gte" | "lte"; value: number }): string {
  return `${c.metric}:${c.op}:${c.value}`;
}

/** 규칙 전부에서 `streak` 조건을 훑어 **실제로 쓰이는 키**만 모은다 */
export function collectStreakKeys(rules: readonly EventRule[]): string[] {
  const keys = new Set<string>();
  const walk = (conds: Condition[] | undefined) => {
    for (const c of conds ?? []) if (c.type === "streak") keys.add(streakKeyOf(c));
  };
  for (const r of rules) { walk(r.conditions); walk(r.hiddenCondition); }
  return [...keys].sort();
}

/**
 * 이번 주 상태로 연속 주 수를 갱신한다. 조건을 만족하면 +1, 아니면 **0 으로 끊는다.**
 *
 * ⚠ 「연속」이라 끊기면 0 이다 — 줄이는 게 아니다. 그래야 「20주 유지」가
 *   20주를 실제로 유지한 사람만의 것이 된다.
 * ⚠ 경로를 못 읽으면(값이 없으면) **끊는다.** 없는 것을 「만족」으로 읽으면
 *   배선이 빠진 축이 조용히 다 통과한다.
 */
export function tickStreaks(
  prev: Record<string, number> | undefined,
  keys: readonly string[],
  ctx: EventContext,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const key of keys) {
    const [metric, op, raw] = key.split(":");
    const value = Number(raw);
    const now = resolveNumber(ctx, metric);
    const ok = now !== undefined && !Number.isNaN(value)
      && (op === "gte" ? now >= value : now <= value);
    out[key] = ok ? (prev?.[key] ?? 0) + 1 : 0;
  }
  return out;
}

// ── count / tenure ─────────────────────────────────────────────

/**
 * 쓸 수 있는 누적 카운터 — **이 표가 정본이다.**
 *
 * ⚠ 모르는 이름은 `check:eventconditions` 가 잡는다. 표에 있는데 아무도 안
 *   올려 주는 칸이 생기면 그 조건은 영원히 false 이므로, 「무엇이 올리나」를
 *   여기 한 줄로 적어 둔다.
 */
export const COUNTERS: Record<string, string> = {
  /** 같은 팀에서 보낸 해 — 시즌 롤오버가 올리고 팀이 바뀌면 1 로 되돌린다 */
  sameTeamYears: "seasonRollover",
  /** 같은 포수와 배터리를 이룬 경기 — 등판마다 올린다(포수가 바뀌면 1) */
  sameCatcherGames: "gameRecorded",
  /** 지도한 후배 수 — 멘토링 선택지가 올린다 */
  menteeCount: "decisionEffect",
  /** 커리어 완봉 수 — 등판 결과가 올린다 */
  shutouts: "gameRecorded",
  /** 커리어 완투 수 */
  completeGames: "gameRecorded",
};

export function bumpCounter(
  p: ProtagonistSave, name: string, by = 1,
): ProtagonistSave["counters"] {
  const cur = { ...(p.counters ?? {}) };
  cur[name] = (cur[name] ?? 0) + by;
  return cur;
}

export function setCounter(
  p: ProtagonistSave, name: string, v: number,
): ProtagonistSave["counters"] {
  return { ...(p.counters ?? {}), [name]: v };
}

// ── last_game ──────────────────────────────────────────────────

/**
 * 이번 시즌 일정에서 **주인공이 마지막으로 던진 공식 경기** 한 장.
 *
 * ⚠ 연습경기(`isFriendly`)는 뺀다 — 「완봉」이 연습경기면 이야기가 안 산다.
 * ⚠ 못 찾으면 `undefined` 다. `last_game` 조건은 그때 전부 false 다.
 */
export function lastGameOf(
  schedule: readonly import("../types/season").ScheduleEntry[],
  protagonistId: string,
  myTeamId: string,
): EventContext["lastGame"] {
  let best: EventContext["lastGame"];
  for (const e of schedule) {
    if (!e.isProtagonistGame || e.isFriendly || !e.result) continue;
    const line = e.result.playerLines.find(
      (l) => l.playerId === protagonistId && l.role === "pitcher",
    ) as import("../types/season").PitcherGameLine | undefined;
    if (!line) continue;
    if (best && e.week <= best.week) continue;
    const isHome = e.homeTeamId === myTeamId;
    const myScore  = isHome ? e.result.homeScore : e.result.awayScore;
    const oppScore = isHome ? e.result.awayScore : e.result.homeScore;
    best = {
      week: e.week,
      ip: line.ip, er: line.er, h: line.h, k: line.k, bb: line.bb,
      pitchCount: line.pitchCount ?? 0,
      won: myScore > oppScore,
      // 완투 = 9이닝을 혼자 · 완봉 = 그러면서 **팀 실점이 0**
      completeGame: line.ip >= 9,
      shutout: line.ip >= 9 && oppScore === 0,
    };
  }
  return best;
}
