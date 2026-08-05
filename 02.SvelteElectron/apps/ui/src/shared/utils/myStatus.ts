import type { ScheduleEntry, Standing } from "../types/season";

/**
 * 우측 패널("내 상태")이 쓰는 파생. **화면에서 계산하지 않고 여기 모은다** —
 * 소식(C1)·일정(C6)도 같은 걸 물어보게 되어 있어서, 화면마다 다시 짜면
 * "다음 경기"가 화면마다 달라진다.
 */

export interface NextGame {
  entry: ScheduleEntry;
  /** 상대 팀 ID — 이름은 호출부가 `teamMap`으로 푼다 */
  opponentId: string;
  isHome: boolean;
  /** 오늘로부터 며칠 뒤. `currentDate`가 없으면 null */
  daysAway: number | null;
}

/** "YYYY-MM-DD" → epoch day. 시분초·타임존을 타지 않게 UTC 자정으로 고정한다 */
function epochDay(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86_400_000);
}

/**
 * 아직 안 치른 내 팀 경기 중 가장 이른 것.
 *
 * ⚠ **"다음 등판"이 아니라 "다음 경기"다.** 선발 로테이션의 어느 자리인지는
 * 엔진(`teamRotationIndex`)이 정하는 값이라 UI가 추측하면 안 된다 —
 * 화면 라벨도 "다음 경기"로 둘 것.
 */
export function nextProtagonistGame(
  schedule: readonly ScheduleEntry[],
  teamId: string,
  currentDate?: string,
): NextGame | null {
  if (!teamId) return null;
  const today = currentDate ? epochDay(currentDate) : null;

  let best: ScheduleEntry | null = null;
  for (const e of schedule) {
    if (e.result) continue;
    if (e.homeTeamId !== teamId && e.awayTeamId !== teamId) continue;
    if (!best || e.gameDate < best.gameDate || (e.gameDate === best.gameDate && e.week < best.week)) {
      best = e;
    }
  }
  if (!best) return null;

  const day = epochDay(best.gameDate);
  const isHome = best.homeTeamId === teamId;
  return {
    entry: best,
    opponentId: isHome ? best.awayTeamId : best.homeTeamId,
    isHome,
    daysAway: today !== null && day !== null ? day - today : null,
  };
}

export interface TeamRank {
  rank: number;
  of: number;
  wins: number;
  losses: number;
  draws: number;
  /** ".595" — 앞의 0을 떼는 야구 관습 */
  winPctText: string;
  /** "W3" 같은 연승/연패 표기. 없으면 빈 문자열 */
  streak: string;
}

/**
 * 순위표에서 내 팀 자리. `standings`는 **정렬돼 있지 않아도 된다** —
 * 여기서 승률 기준으로 세운다(`currentStandings`와 같은 기준).
 */
export function teamRank(standings: readonly Standing[], teamId: string): TeamRank | null {
  if (!teamId || standings.length === 0) return null;
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const i = sorted.findIndex((s) => s.teamId === teamId);
  if (i < 0) return null;
  const s = sorted[i];
  return {
    rank: i + 1,
    of: sorted.length,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    winPctText: s.winPct.toFixed(3).replace(/^0/, ""),
    streak: s.streak ?? "",
  };
}

/** 게이지의 의미색. **피로만 방향이 반대다** — 높을수록 나쁘다 */
export function gaugeTone(value: number, inverted = false): "ok" | "warn" | "bad" {
  const v = inverted ? 100 - value : value;
  if (v >= 70) return "ok";
  if (v >= 40) return "warn";
  return "bad";
}
