import type { ScheduleEntry, SeasonPhase } from "../types/season";

// 라운드로빈 쌍 생성 (circle method)
function roundRobinPairs(teams: string[]): Array<[string, string][]> {
  const ts = teams.length % 2 === 0 ? [...teams] : [...teams, "__BYE__"];
  const half = ts.length / 2;
  const rounds: Array<[string, string][]> = [];

  for (let r = 0; r < ts.length - 1; r++) {
    const round: [string, string][] = [];
    for (let i = 0; i < half; i++) {
      const a = ts[i];
      const b = ts[ts.length - 1 - i];
      if (a !== "__BYE__" && b !== "__BYE__") {
        round.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(round);
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

function getPhase(
  week: number,
  seasonStart: number,
  seasonEnd: number,
  postseasonEnd: number,
): SeasonPhase {
  if (week < seasonStart) return "preseason";
  if (week <= seasonEnd) return "season";
  if (week <= postseasonEnd) return "postseason";
  return "offseason";
}

// 정규시즌(seasonStart~seasonEnd) 주차에만 경기 생성
// preseason/postseason/offseason 주차는 경기 없음 (훈련/비시즌)
export function generateSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  totalWeeks: number,
  seasonStart = 5,
  seasonEnd = 36,
  postseasonEnd = 44,
): ScheduleEntry[] {
  if (teamIds.length < 2) return [];

  const baseRounds = roundRobinPairs(teamIds);
  const entries: ScheduleEntry[] = [];
  let gameSeq = 0;

  const endWeek = Math.min(seasonEnd, totalWeeks);
  for (let week = seasonStart; week <= endWeek; week++) {
    const roundIdx = (week - seasonStart) % baseRounds.length;
    const flip = Math.floor((week - seasonStart) / baseRounds.length) % 2 === 1;
    const pairs = baseRounds[roundIdx];
    const phase = getPhase(week, seasonStart, seasonEnd, postseasonEnd);

    for (const [a, b] of pairs) {
      const [home, away] = flip ? [b, a] : [a, b];
      gameSeq++;
      entries.push({
        id: `SCH_W${String(week).padStart(2, "0")}_G${String(gameSeq).padStart(3, "0")}`,
        week,
        homeTeamId: home,
        awayTeamId: away,
        isProtagonistGame: home === protagonistTeamId || away === protagonistTeamId,
        phase,
      });
    }
  }

  return entries;
}
