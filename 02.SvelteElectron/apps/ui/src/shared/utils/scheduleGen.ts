import type { ScheduleEntry } from "../types/season";

// 라운드로빈 쌍 생성 (circle method)
// 반환: rounds[r] = [homeId, awayId][] (r번째 라운드의 경기 목록)
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
        // 짝수 라운드: a가 홈, 홀수 라운드: b가 홈 (홈/원정 균형)
        round.push(r % 2 === 0 ? [a, b] : [b, a]);
      }
    }
    rounds.push(round);
    // ts[0] 고정, 나머지 회전
    ts.splice(1, 0, ts.pop()!);
  }
  return rounds;
}

// totalWeeks 동안의 시즌 일정 생성
// 라운드로빈이 모자라면 홈/원정 반전 후 반복
export function generateSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  totalWeeks: number,
): ScheduleEntry[] {
  if (teamIds.length < 2) return [];

  const baseRounds = roundRobinPairs(teamIds);
  const entries: ScheduleEntry[] = [];
  let gameSeq = 0;

  for (let week = 1; week <= totalWeeks; week++) {
    const roundIdx = (week - 1) % baseRounds.length;
    // 라운드로빈 한 바퀴 완료 후 재개 시 홈/원정 반전
    const flip = Math.floor((week - 1) / baseRounds.length) % 2 === 1;
    const pairs = baseRounds[roundIdx];

    for (const [a, b] of pairs) {
      const [home, away] = flip ? [b, a] : [a, b];
      gameSeq++;
      entries.push({
        id: `SCH_W${String(week).padStart(2, "0")}_G${String(gameSeq).padStart(3, "0")}`,
        week,
        homeTeamId: home,
        awayTeamId: away,
        isProtagonistGame:
          home === protagonistTeamId || away === protagonistTeamId,
      });
    }
  }

  return entries;
}
