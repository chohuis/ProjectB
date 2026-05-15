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

// 시즌 기준일(3월 1일) + 주차 + 일 오프셋 → "YYYY-MM-DD"
// 주 1 = 3월 1일, 주 N = 3월 1일 + (N-1)*7일
export function toGameDate(seasonYear: number, week: number, dayOffset = 0): string {
  const d = new Date(seasonYear, 2, 1);  // 3월 1일 기준
  d.setDate(d.getDate() + (week - 1) * 7 + dayOffset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// "YYYY-MM-DD" → 한국어 표시 "2026년 4월 15일 (수)"
const KO_DAY = ["일", "월", "화", "수", "목", "금", "토"];
export function toDateKo(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const [y, m, day] = [d.getFullYear(), d.getMonth() + 1, d.getDate()];
  const dow = KO_DAY[d.getDay()];
  return `${y}년 ${m}월 ${day}일 (${dow})`;
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
// 각 주차 게임은 토요일(dayOffset=5) 기준 날짜 배정
export function generateSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  totalWeeks: number,
  seasonStart = 5,
  seasonEnd = 36,
  postseasonEnd = 44,
  seasonYear = 2026,
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
    const gameDate = toGameDate(seasonYear, week, 5);  // 토요일

    for (const [a, b] of pairs) {
      const [home, away] = flip ? [b, a] : [a, b];
      gameSeq++;
      entries.push({
        id: `SCH_W${String(week).padStart(2, "0")}_G${String(gameSeq).padStart(3, "0")}`,
        week,
        gameDate,
        homeTeamId: home,
        awayTeamId: away,
        isProtagonistGame: home === protagonistTeamId || away === protagonistTeamId,
        phase,
      });
    }
  }

  return entries;
}

// 프로리그 공통 스케줄 생성 (6경기/주: 화-목 3연전 + 금-일 3연전)
// Series A: dayOffset 1(화),2(수),3(목) / Series B: 4(금),5(토),6(일)
// 주인공 SP는 매주 Series A 1차전에 선발 등판 (isProtagonistGame=true)
// 나머지 5경기는 팀 경기로 NPC 처리 (순위 반영 O, 주인공 출전 X)
function generateProLeagueSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  startWeek: number,
  endWeek: number,
  prefix: string,
  seasonYear: number,
): ScheduleEntry[] {
  if (teamIds.length < 2) return [];

  const rounds = roundRobinPairs(teamIds);
  const totalSeriesSlots = (endWeek - startWeek + 1) * 2;

  const seriesSlots: Array<[string, string][]> = [];
  for (let i = 0; i < totalSeriesSlots; i++) {
    const roundIdx = i % rounds.length;
    const flipped = Math.floor(i / rounds.length) % 2 === 1;
    seriesSlots.push(
      rounds[roundIdx].map(([a, b]): [string, string] => (flipped ? [b, a] : [a, b])),
    );
  }

  const entries: ScheduleEntry[] = [];
  let gameSeq = 0;

  for (let week = startWeek; week <= endWeek; week++) {
    let protagonistStartedThisWeek = false;
    for (let si = 0; si < 2; si++) {
      const slotIdx = (week - startWeek) * 2 + si;
      if (slotIdx >= seriesSlots.length) break;
      const pairs = seriesSlots[slotIdx];
      const seriesLabel = si === 0 ? "A" : "B";
      // Series A: 화(+1)/수(+2)/목(+3), Series B: 금(+4)/토(+5)/일(+6)
      const seriesDayBase = si === 0 ? 1 : 4;

      for (const [home, away] of pairs) {
        const isProtagonistPair = home === protagonistTeamId || away === protagonistTeamId;
        for (let g = 1; g <= 3; g++) {
          gameSeq++;
          const isProtagonistGame = isProtagonistPair && !protagonistStartedThisWeek && g === 1;
          if (isProtagonistGame) protagonistStartedThisWeek = true;
          const gameDate = toGameDate(seasonYear, week, seriesDayBase + g - 1);
          entries.push({
            id: `${prefix}_W${String(week).padStart(2, "0")}_S${seriesLabel}_G${g}_${String(gameSeq).padStart(4, "0")}`,
            week,
            gameDate,
            homeTeamId: home,
            awayTeamId: away,
            isProtagonistGame,
            phase: "season",
          });
        }
      }
    }
  }

  return entries;
}

// KBL: 8팀, W7-W27 (21주), 6경기/주, 총 126경기/팀, totalWeeks=30
export function generateKblSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): ScheduleEntry[] {
  return generateProLeagueSchedule(teamIds, protagonistTeamId, 7, 27, "KBL", seasonYear);
}

// ABL: 16팀(2컨퍼런스), W7-W27 (21주), 6경기/주, 총 126경기/팀, totalWeeks=28
export function generateAblSchedule(
  teamIds: string[],
  protagonistTeamId: string,
  seasonYear = 2026,
): ScheduleEntry[] {
  return generateProLeagueSchedule(teamIds, protagonistTeamId, 7, 27, "ABL", seasonYear);
}

// HS 포스트시즌 준결승: 1위vs4위, 2위vs3위 단판 승부 (고교 리그 전용 룰)
export function generateHsPostseasonSemis(
  top4: string[],
  protagonistTeamId: string,
  week: number,
  seasonYear = 2026,
): ScheduleEntry[] {
  if (top4.length < 4) return [];
  const gameDate = toGameDate(seasonYear, week, 5);
  return [
    {
      id: `PS_SEMI1_W${String(week).padStart(2, "0")}`,
      week,
      gameDate,
      homeTeamId: top4[0],
      awayTeamId: top4[3],
      isProtagonistGame: top4[0] === protagonistTeamId || top4[3] === protagonistTeamId,
      phase: "postseason",
    },
    {
      id: `PS_SEMI2_W${String(week).padStart(2, "0")}`,
      week,
      gameDate,
      homeTeamId: top4[1],
      awayTeamId: top4[2],
      isProtagonistGame: top4[1] === protagonistTeamId || top4[2] === protagonistTeamId,
      phase: "postseason",
    },
  ];
}

// HS 포스트시즌 결승: 준결승 승자끼리 단판 승부 (고교 리그 전용 룰)
export function generateHsPostseasonFinal(
  winnerA: string,
  winnerB: string,
  protagonistTeamId: string,
  week: number,
  seasonYear = 2026,
): ScheduleEntry {
  return {
    id: `PS_FINAL_W${String(week).padStart(2, "0")}`,
    week,
    gameDate: toGameDate(seasonYear, week, 5),
    homeTeamId: winnerA,
    awayTeamId: winnerB,
    isProtagonistGame: winnerA === protagonistTeamId || winnerB === protagonistTeamId,
    phase: "postseason",
  };
}
