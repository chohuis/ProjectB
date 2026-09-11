/**
 * 대회를 화면에 올리기 위한 파생.
 *
 * ⚠ **엔진은 대회를 완전히 돌리는데 화면이 한 곳도 없었다.**
 * `tournaments.csv`에 8개(고교 5·대학 3)가 있고 `openTournamentsForWeek` →
 * `selectEntrants` → `generateBracket` → `advanceRound` → `champion`이 매 시즌
 * 실제로 돈다. 우승팀까지 나오는데 볼 데가 없었다.
 *
 * ⚠ **포스트시즌의 `bracket.ts`를 쓰지 않는다.** 그쪽은 `PostseasonSeries`
 * (다전제)를 받으므로 자료 모양이 아예 다르다. 대회 브래킷은 `round`가
 * 0-based로 명시돼 있어 묶는 건 그대로 쓴다.
 *
 * ⚠ **`totalRounds`는 안 쓴다.** 실제 대진에서 라운드 수와 어긋났다 —
 * 자세한 건 `roundLabel` 주석. 라운드 이름·결승 판정 전부 **경기 수와
 * 실제 존재하는 라운드 번호**에서 낸다.
 */
import type { TournamentBracket, BracketMatch, GroupStage, TournamentDef } from "./tournament";
import { TOURNAMENTS } from "./tournament";

export type TournamentPhase = "upcoming" | "qualifying" | "live" | "done";

export interface TournamentRound {
  /** 0-based. 0이 첫 라운드 */
  round: number;
  /** "32강" · "4강" · "결승" */
  label: string;
  matches: BracketMatch[];
}

/** 그 리그의 대회를 주차 순으로 */
export function tournamentsOfLeague(leagueId: string): TournamentDef[] {
  return TOURNAMENTS.filter((t) => t.leagueId === leagueId).sort(
    (a, b) => a.startWeek - b.startWeek || a.order - b.order,
  );
}

/**
 * 라운드 이름. **그 라운드의 경기 수로 정한다.**
 *
 * ⚠ 처음엔 `totalRounds - round`로 역산했는데 **실제 대진에서 한 칸씩
 * 어긋났다** — 32팀 대진(경기 16·8·4·2·1)에 "16강·8강·4강·결승·결승"이
 * 찍혀 결승이 두 번 나왔다. 엔진의 `totalRounds`가 실제 라운드 수와 맞지
 * 않는 경우가 있다.
 *
 * 경기 수는 그럴 수 없다 — **N경기 라운드에는 2N팀이 있다.** 산수라
 * 어긋날 여지가 없고, 대진이 어떻게 만들어졌든 성립한다.
 */
export function roundLabel(matchCount: number): string {
  if (matchCount <= 1) return "결승";
  return `${matchCount * 2}강`;
}

/** 대진을 라운드별로 묶는다. 엔진이 준 번호를 그대로 쓴다 */
export function bracketRounds(bracket: TournamentBracket | null | undefined): TournamentRound[] {
  if (!bracket || bracket.matches.length === 0) return [];
  const byRound = new Map<number, BracketMatch[]>();
  for (const m of bracket.matches) {
    if (!byRound.has(m.round)) byRound.set(m.round, []);
    byRound.get(m.round)!.push(m);
  }
  return [...byRound.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([round, matches]) => ({
      round,
      label: roundLabel(matches.length),
      matches: [...matches].sort((x, y) => x.slot - y.slot),
    }));
}

/**
 * 지금 어느 단계인가.
 *
 * ⚠ 주차만 보고 정하지 않는다. 대회는 **참가팀이 0이면 안 열릴 수도 있고**
 * (`openTournamentsForWeek`가 경고를 남기고 건너뛴다) 그때는 주차가 지나도
 * 브래킷이 없다. 상태가 있으면 상태가 우선이다.
 */
export function tournamentPhase(
  def: TournamentDef,
  currentWeek: number,
  bracket: TournamentBracket | null | undefined,
  groupStage: GroupStage | null | undefined,
): TournamentPhase {
  if (bracket && bracket.matches.length > 0) {
    // 마지막 라운드 = 실제로 존재하는 가장 큰 round. `totalRounds`를 안 믿는다
    const fin = finalMatches(bracket);
    if (fin.length > 0 && fin.every((m) => m.winnerTeamId)) return "done";
    return "live";
  }
  if (groupStage) return "qualifying";
  if (currentWeek > def.endWeek) return "done";
  return "upcoming";
}

export const PHASE_LABEL: Record<TournamentPhase, string> = {
  upcoming: "예정",
  qualifying: "예선",
  live: "진행 중",
  done: "종료",
};

/** 마지막 라운드의 경기들. **있는 라운드에서 찾는다** (§roundLabel 참고) */
function finalMatches(bracket: TournamentBracket): BracketMatch[] {
  if (bracket.matches.length === 0) return [];
  const last = Math.max(...bracket.matches.map((m) => m.round));
  return bracket.matches.filter((m) => m.round === last);
}

/** 우승팀. 결승이 안 끝났으면 null */
export function championOf(bracket: TournamentBracket | null | undefined): string | null {
  if (!bracket || bracket.matches.length === 0) return null;
  const fin = finalMatches(bracket);
  // 마지막 라운드에 경기가 둘 이상이면 결승이 아니다 — 우승자를 만들지 않는다
  return fin.length === 1 ? (fin[0].winnerTeamId ?? null) : null;
}

export interface TeamRun {
  /** 우승했나 */
  champion: boolean;
  /** 어디까지 갔나 — "8강" 등. 출전 안 했으면 null */
  reached: string | null;
  /** 탈락한 경기. 우승했거나 진행 중이면 null */
  lostAt: BracketMatch | null;
}

/**
 * 이 팀이 어디까지 갔나.
 *
 * ⚠ **부전승(`isBye`)은 이긴 게 아니다.** 경기를 안 치르고 올라간 것이라
 * 승자로 세면 "1회전 승리"가 거짓이 된다. 여기선 진출 여부만 따진다.
 */
export function teamRun(
  bracket: TournamentBracket | null | undefined,
  teamId: string,
): TeamRun | null {
  if (!bracket || !teamId) return null;
  const mine = bracket.matches.filter((m) => m.homeTeamId === teamId || m.awayTeamId === teamId);
  if (mine.length === 0) return null;

  const deepest = mine.reduce((a, b) => (b.round > a.round ? b : a));
  const lost = mine.find((m) => m.winnerTeamId && m.winnerTeamId !== teamId) ?? null;
  const champion = championOf(bracket) === teamId;
  const deepestCount = bracket.matches.filter((m) => m.round === deepest.round).length;

  return {
    champion,
    reached: roundLabel(deepestCount),
    lostAt: champion ? null : lost,
  };
}

/** 한 줄 요약 — 목록에 붙는다 */
export function runSummary(run: TeamRun | null, phase: TournamentPhase): string {
  if (!run) return phase === "upcoming" || phase === "qualifying" ? "" : "미출전";
  if (run.champion) return "우승";
  if (run.lostAt) return `${run.reached} 탈락`;
  return `${run.reached} 진행 중`;
}

/**
 * 결승 두 팀 — 우승·준우승.
 *
 * ⚠ **우승만 남기면 안 된다.** 과거 기록에서 "누가 몇 대 몇으로 이겼는지"를
 * 쓰려면 진 쪽도 있어야 한다. 포스트시즌이 우승만 남겨 두고 준우승을 빈칸으로
 * 뒀다가 화면이 "결과만 남는다"고 쓸 수밖에 없었던 것과 같은 자리다.
 */
export function finalistsOf(
  bracket: TournamentBracket | null | undefined,
): { champion: string; runnerUp: string } | null {
  if (!bracket || bracket.matches.length === 0) return null;
  const fin = finalMatches(bracket);
  if (fin.length !== 1) return null;
  const m = fin[0];
  if (!m.winnerTeamId) return null;
  const loser = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
  return { champion: m.winnerTeamId, runnerUp: loser ?? "" };
}
