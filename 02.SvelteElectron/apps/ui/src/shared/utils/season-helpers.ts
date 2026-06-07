import type { LeagueSeasonState, MatchResult, PlayerGameLine, Standing } from "../types/season";
import type { BatterSeasonStats, PlayerSeasonStats, PitcherSeasonStats } from "../types/save";
import { calcAvg, calcEra, calcOps, calcWhip } from "../types/season";

export function migrateLeagueState(ls: Partial<LeagueSeasonState>): LeagueSeasonState {
  return {
    standings:         ls.standings         ?? [],
    stats:             ls.stats             ?? {},
    playerConditions:  ls.playerConditions  ?? {},
    teamRotationIndex: ls.teamRotationIndex ?? {},
  };
}

export function sanitizeStatsRecord(
  stats: Record<string, PlayerSeasonStats>,
): Record<string, PlayerSeasonStats> {
  const safeN = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
  const out: Record<string, PlayerSeasonStats> = {};
  for (const [pid, st] of Object.entries(stats)) {
    if ((st as PitcherSeasonStats).type === "pitcher") {
      const s  = st as PitcherSeasonStats;
      const ip = safeN(s.ip);
      out[pid] = {
        ...s,
        g: safeN(s.g), gs: safeN(s.gs), w: safeN(s.w), l: safeN(s.l),
        sv: safeN(s.sv), hd: safeN(s.hd), ip,
        er: safeN(s.er), h: safeN(s.h), k: safeN(s.k), bb: safeN(s.bb),
        era: calcEra(safeN(s.er), ip), whip: calcWhip(safeN(s.bb), safeN(s.h), ip),
      };
    } else {
      out[pid] = st;
    }
  }
  return out;
}

export function updateStandings(
  standings: Standing[],
  result: MatchResult,
  homeTeamId: string,
  awayTeamId: string,
): Standing[] {
  const isDraw = result.loserId === null;
  return standings.map((s) => {
    if (isDraw) {
      if (s.teamId !== homeTeamId && s.teamId !== awayTeamId) return s;
    } else {
      if (s.teamId !== result.winnerId && s.teamId !== result.loserId) return s;
    }

    const isWinner = s.teamId === result.winnerId;

    const wins   = s.wins   + (isWinner && !isDraw ? 1 : 0);
    const losses = s.losses + (!isWinner && !isDraw ? 1 : 0);
    const draws  = s.draws  + (isDraw ? 1 : 0);
    const total  = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0;

    const isHome = s.teamId === homeTeamId;
    const runsFor     = s.runsFor     + (isHome ? result.homeScore : result.awayScore);
    const runsAgainst = s.runsAgainst + (isHome ? result.awayScore : result.homeScore);

    const streakChar = isDraw ? "D" : isWinner ? "W" : "L";
    const streak     = updateStreak(s.streak, streakChar);
    const last10     = updateLast10(s.last10, streakChar);

    return { ...s, wins, losses, draws, winPct, runsFor, runsAgainst, streak, last10 };
  });
}

export function updateStreak(current: string, result: "W" | "L" | "D"): string {
  if (!current) return `${result}1`;
  const char = current[0];
  const n    = parseInt(current.slice(1), 10);
  return char === result ? `${result}${n + 1}` : `${result}1`;
}

export function updateLast10(current: string, result: "W" | "L" | "D"): string {
  // 구 압축 포맷 "W3L2" → 확장 "WWWLL" 변환
  const expanded = current.replace(/([WLD])(\d+)/g, (_, c: string, n: string) => c.repeat(parseInt(n)));
  const chars = [...expanded.replace(/[^WLD]/g, ""), result];
  return chars.slice(-10).join("");
}

export function accumulateStats(
  stats: Record<string, PlayerSeasonStats>,
  lines: PlayerGameLine[],
): Record<string, PlayerSeasonStats> {
  const next = { ...stats };
  for (const line of lines) {
    if (line.role === "pitcher") {
      const prev = (next[line.playerId] as PitcherSeasonStats | undefined) ?? {
        type: "pitcher", g:0, gs:0, w:0, l:0, sv:0, hd:0, ip:0, er:0, h:0, k:0, bb:0, era:0, whip:0,
      };
      const safeNum = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
      const ip  = safeNum(prev.ip)  + safeNum(line.ip);
      const er  = safeNum(prev.er)  + safeNum(line.er);
      const h   = safeNum(prev.h)   + safeNum(line.h);
      const k   = safeNum(prev.k)   + safeNum(line.k);
      const bb  = safeNum(prev.bb)  + safeNum(line.bb);
      const w   = prev.w   + (line.decision === "W"  ? 1 : 0);
      const l   = prev.l   + (line.decision === "L"  ? 1 : 0);
      const sv  = prev.sv  + (line.decision === "SV" ? 1 : 0);
      const hd  = prev.hd  + (line.decision === "HD" ? 1 : 0);
      next[line.playerId] = {
        type:"pitcher", g: prev.g+1, gs: prev.gs, w, l, sv, hd, ip, er, h, k, bb,
        era: calcEra(er, ip), whip: calcWhip(bb, h, ip),
      };
    } else {
      const prev = (next[line.playerId] as BatterSeasonStats | undefined) ?? {
        type:"batter", g:0, pa:0, ab:0, h:0, hr:0, rbi:0, sb:0, bb:0, k:0, avg:0, obp:0, slg:0, ops:0,
      };
      const ab  = prev.ab  + (line.ab  ?? 0);
      const h   = prev.h   + (line.h   ?? 0);
      const hr  = prev.hr  + (line.hr  ?? 0);
      const rbi = prev.rbi + (line.rbi ?? 0);
      const bb  = prev.bb  + (line.bb  ?? 0);
      const k   = prev.k   + (line.k   ?? 0);
      const sb  = prev.sb  + (line.sb  ?? 0);
      const pa  = prev.pa  + ab + bb;
      const avg = calcAvg(h, ab);
      const obp = pa > 0 ? Math.round(((h + bb) / pa) * 1000) / 1000 : 0;
      const slg = ab > 0 ? Math.round(((h + hr * 3) / ab) * 1000) / 1000 : 0;
      next[line.playerId] = {
        type:"batter", g: prev.g+1, pa, ab, h, hr, rbi, sb, bb, k,
        avg, obp, slg, ops: calcOps(obp, slg),
      };
    }
  }
  return next;
}
