import type { PostseasonSeries, ScheduleEntry, Standing } from "../types/season";
import { toGameDate } from "./scheduleGen";

// ── 시리즈 헬퍼 ─────────────────────────────────────────────
export function winsNeeded(bestOf: 1 | 3 | 5 | 7): number {
  return Math.ceil(bestOf / 2);
}

export function nextGameNum(series: PostseasonSeries): number {
  return series.homeWins + series.awayWins + 1;
}

// 시리즈 경기 ScheduleEntry 생성
// G1=+5(토), G2=+6(일), G3=+8(화), G4=+9(수), G5=+10(목), G6=+12(토), G7=+13(일)
const SERIES_DAY_OFFSETS = [5, 6, 8, 9, 10, 12, 13];

export function makeSeriesGame(
  series: PostseasonSeries,
  gameNum: number,
  baseWeek: number,
  protagonistTeamId: string,
  seasonYear: number,
): ScheduleEntry {
  const offset = SERIES_DAY_OFFSETS[Math.min(gameNum - 1, SERIES_DAY_OFFSETS.length - 1)];
  // dayOffset이 7 이상이면 다음 주로 넘어감
  const week = offset >= 7 ? baseWeek + 1 : baseWeek;
  const dayInWeek = offset >= 7 ? offset - 7 : offset;
  return {
    id: `${series.id}_G${gameNum}`,
    week,
    gameDate: toGameDate(seasonYear, baseWeek, offset),
    leagueId: series.leagueId,
    homeTeamId: series.homeTeamId,
    awayTeamId: series.awayTeamId,
    isProtagonistGame:
      series.homeTeamId === protagonistTeamId ||
      series.awayTeamId === protagonistTeamId,
    phase: "postseason",
  };
  void dayInWeek; // week 계산에 사용되므로 lint 억제
}

// 경기 결과를 시리즈에 반영
export function applyGameToSeries(
  series: PostseasonSeries,
  winnerId: string,
): PostseasonSeries {
  const homeWins = winnerId === series.homeTeamId ? series.homeWins + 1 : series.homeWins;
  const awayWins = winnerId === series.awayTeamId ? series.awayWins + 1 : series.awayWins;
  const needed = winsNeeded(series.bestOf);
  const winner =
    homeWins >= needed ? series.homeTeamId :
    awayWins >= needed ? series.awayTeamId : null;
  return { ...series, homeWins, awayWins, winner };
}

// 완료된 시리즈 승자를 다음 시리즈 슬롯에 주입
export function fillNextSeries(
  bracket: PostseasonSeries[],
  completed: PostseasonSeries,
): PostseasonSeries[] {
  if (!completed.winner || !completed.nextSeriesId) return bracket;
  return bracket.map((s) => {
    if (s.id !== completed.nextSeriesId) return s;
    return {
      ...s,
      homeTeamId: completed.nextSeriesSlot === "home" ? completed.winner! : s.homeTeamId,
      awayTeamId: completed.nextSeriesSlot === "away" ? completed.winner! : s.awayTeamId,
    };
  });
}

// 주인공 팀이 없는 시리즈를 전부 즉시 시뮬 → winner 채움
export function resolveNonProtagonistSeries(
  bracket: PostseasonSeries[],
  protagonistTeamId: string,
): PostseasonSeries[] {
  let cur = bracket.map((s) => ({ ...s }));

  for (let pass = 0; pass < 20; pass++) {
    let changed = false;
    for (let i = 0; i < cur.length; i++) {
      const s = cur[i];
      if (s.winner) continue;
      if (s.homeTeamId === "" || s.awayTeamId === "") continue;
      if (s.homeTeamId === protagonistTeamId || s.awayTeamId === protagonistTeamId) continue;

      // 즉시 시뮬 (50/50)
      let hw = 0, aw = 0;
      const needed = winsNeeded(s.bestOf);
      while (hw < needed && aw < needed) {
        if (Math.random() < 0.5) hw++; else aw++;
      }
      const updated: PostseasonSeries = {
        ...s,
        homeWins: hw,
        awayWins: aw,
        winner: hw >= needed ? s.homeTeamId : s.awayTeamId,
      };
      cur[i] = updated;
      cur = fillNextSeries(cur, updated);
      changed = true;
    }
    if (!changed) break;
  }
  return cur;
}

// 현재 진행 가능한 시리즈 (양 팀 확정, winner 없음)
export function getActiveSeries(bracket: PostseasonSeries[]): PostseasonSeries | null {
  return bracket.find((s) => !s.winner && s.homeTeamId !== "" && s.awayTeamId !== "") ?? null;
}

// ── KBL 브라켓 (A안: 1위 KS 직행, 2위 PO 합류) ──────────────
// 진출: 1~6위
// WC(단판): 5위 vs 6위 → 준PO
// 준PO(3전2선): 4위 vs WC승자 → PO
// PO(5전3선): 2위 vs 준PO승자 → KS
// KS(7전4선): 1위 vs PO승자
export function buildKblBracket(standings: Standing[]): PostseasonSeries[] {
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  if (sorted.length < 6) return [];
  const [t1, t2, , t4, t5, t6] = sorted.map((s) => s.teamId);
  // t3은 준PO 이전 단계에 없음 (3위는 PO에서 제외, 2위가 PO 홈팀)

  return [
    {
      id: "KBL_WC", leagueId: "LEAGUE_KBL", round: "와일드카드",
      homeTeamId: t5, awayTeamId: t6,
      bestOf: 1, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: null,
      nextSeriesId: "KBL_PREP", nextSeriesSlot: "away",
    },
    {
      id: "KBL_PREP", leagueId: "LEAGUE_KBL", round: "준플레이오프",
      homeTeamId: t4, awayTeamId: "",
      bestOf: 3, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: "KBL_WC",
      nextSeriesId: "KBL_PO", nextSeriesSlot: "away",
    },
    {
      id: "KBL_PO", leagueId: "LEAGUE_KBL", round: "플레이오프",
      homeTeamId: t2, awayTeamId: "",
      bestOf: 5, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: "KBL_PREP",
      nextSeriesId: "KBL_KS", nextSeriesSlot: "away",
    },
    {
      id: "KBL_KS", leagueId: "LEAGUE_KBL", round: "한국시리즈",
      homeTeamId: t1, awayTeamId: "",
      bestOf: 7, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: "KBL_PO",
      nextSeriesId: null, nextSeriesSlot: null,
    },
  ];
}

// ── ABL 브라켓 (MLB 구조, 2컨퍼런스 각 4팀) ─────────────────
// EWC(3전2선): E3 vs E4 → EDS
// WWC(3전2선): W3 vs W4 → WDS
// EDS(5전3선): E1 vs EWC승자 → CS(홈)
// WDS(5전3선): W1 vs WWC승자 → CS(원정)
// CS(7전4선): EDS승자 vs WDS승자
export function buildAblBracket(
  eastStandings: Standing[],
  westStandings: Standing[],
): PostseasonSeries[] {
  const sort = (a: Standing, b: Standing) => b.winPct - a.winPct || b.wins - a.wins;
  const e = [...eastStandings].sort(sort).slice(0, 4).map((s) => s.teamId);
  const w = [...westStandings].sort(sort).slice(0, 4).map((s) => s.teamId);
  if (e.length < 4 || w.length < 4) return [];

  return [
    {
      id: "ABL_EWC", leagueId: "LEAGUE_ABL", round: "이스트 와일드카드",
      homeTeamId: e[2], awayTeamId: e[3],
      bestOf: 3, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: null,
      nextSeriesId: "ABL_EDS", nextSeriesSlot: "away",
    },
    {
      id: "ABL_WWC", leagueId: "LEAGUE_ABL", round: "웨스트 와일드카드",
      homeTeamId: w[2], awayTeamId: w[3],
      bestOf: 3, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: null,
      nextSeriesId: "ABL_WDS", nextSeriesSlot: "away",
    },
    {
      id: "ABL_EDS", leagueId: "LEAGUE_ABL", round: "이스트 디비전시리즈",
      homeTeamId: e[0], awayTeamId: "",
      bestOf: 5, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: "ABL_EWC",
      nextSeriesId: "ABL_CS", nextSeriesSlot: "home",
    },
    {
      id: "ABL_WDS", leagueId: "LEAGUE_ABL", round: "웨스트 디비전시리즈",
      homeTeamId: w[0], awayTeamId: "",
      bestOf: 5, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: "ABL_WWC",
      nextSeriesId: "ABL_CS", nextSeriesSlot: "away",
    },
    {
      id: "ABL_CS", leagueId: "LEAGUE_ABL", round: "챔피언십시리즈",
      homeTeamId: "", awayTeamId: "",
      bestOf: 7, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: "ABL_EDS", awayFrom: "ABL_WDS",
      nextSeriesId: null, nextSeriesSlot: null,
    },
  ];
}

// ── UNIV 브라켓 (단판 토너먼트) ─────────────────────────────
// 준결승: 1위 vs 4위, 2위 vs 3위 (단판)
// 결승: 준결승 승자끼리 (단판)
export function buildUnivBracket(standings: Standing[]): PostseasonSeries[] {
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  if (sorted.length < 4) return [];
  const [t1, t2, t3, t4] = sorted.map((s) => s.teamId);

  return [
    {
      id: "UNIV_SEMI1", leagueId: "LEAGUE_UNIVERSITY", round: "준결승",
      homeTeamId: t1, awayTeamId: t4,
      bestOf: 1, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: null,
      nextSeriesId: "UNIV_FINAL", nextSeriesSlot: "home",
    },
    {
      id: "UNIV_SEMI2", leagueId: "LEAGUE_UNIVERSITY", round: "준결승",
      homeTeamId: t2, awayTeamId: t3,
      bestOf: 1, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: null,
      nextSeriesId: "UNIV_FINAL", nextSeriesSlot: "away",
    },
    {
      id: "UNIV_FINAL", leagueId: "LEAGUE_UNIVERSITY", round: "결승",
      homeTeamId: "", awayTeamId: "",
      bestOf: 1, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: "UNIV_SEMI1", awayFrom: "UNIV_SEMI2",
      nextSeriesId: null, nextSeriesSlot: null,
    },
  ];
}

// ── IND 브라켓 (단판 결승) ───────────────────────────────────
export function buildIndBracket(standings: Standing[]): PostseasonSeries[] {
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  if (sorted.length < 2) return [];
  const [t1, t2] = sorted.map((s) => s.teamId);

  return [
    {
      id: "IND_FINAL", leagueId: "LEAGUE_INDEPENDENT", round: "결승",
      homeTeamId: t1, awayTeamId: t2,
      bestOf: 1, homeWins: 0, awayWins: 0, winner: null,
      homeFrom: null, awayFrom: null,
      nextSeriesId: null, nextSeriesSlot: null,
    },
  ];
}

// ── ABL 컨퍼런스 랜덤 배정 ──────────────────────────────────
export function shuffleAblConferences(allTeams: string[]): { east: string[]; west: string[] } {
  const arr = [...allTeams];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const half = Math.floor(arr.length / 2);
  return { east: arr.slice(0, half), west: arr.slice(half) };
}
