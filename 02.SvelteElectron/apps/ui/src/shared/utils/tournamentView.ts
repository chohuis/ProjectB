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
import type { CareerSeasonRecord } from "../types/save";

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

// ── 경력 기록에 남길 한 칸 (2026-09-18) ────────────────────────────

/** `CareerSeasonRecord.psResult` 와 같은 칸이다 — 표를 새로 만들지 않는다 */
export type SeasonResult = NonNullable<CareerSeasonRecord["psResult"]>;

/** 미진출 0 < 4강 1 < 준우승 2 < 우승 3. 「더 멀리 갔나」를 가르는 데만 쓴다 */
const RESULT_RANK: Record<SeasonResult, number> = {
  notQualified: 0,
  semiFinal: 1,
  runnerUp: 2,
  champion: 3,
};

/**
 * 이 대회에서 그 팀이 어디까지 갔나 — **경력 기록의 `psResult` 한 칸으로.**
 *
 * `teamRun` 과 겹치는 것처럼 보이지만 답이 다르다. 그쪽은 화면에 쓸
 * 「8강 탈락」같은 **말**이고, 이쪽은 진학 점수·드래프트 입력이 읽는
 * **네 칸짜리 값**이다(`universityUtils.calcHsBaseballScore` ·
 * `draftSystem.hsDraftInputsOf`). 말을 다시 파싱해 값을 얻게 두지 않는다.
 *
 * ⚠ **`totalRounds` 를 안 믿는다** — 이 파일의 나머지와 같은 이유다
 *   (`roundLabel` 주석). 마지막 라운드는 **실제로 있는 가장 큰 round** 다.
 * ⚠ **출전 안 했든 1회전에서 졌든 `notQualified` 다.** 진학 점수표가 그 칸을
 *   「미진출」로 부르고 `hsDraftInputsOf` 도 「미진출·기록없음」으로 센다 —
 *   둘을 가르는 값이 애초에 없다.
 */
export function tournamentResultOf(
  bracket: TournamentBracket | null | undefined,
  teamId: string,
): SeasonResult {
  if (!bracket || bracket.matches.length === 0 || !teamId) return "notQualified";
  const last = Math.max(...bracket.matches.map((m) => m.round));
  const played = (round: number) =>
    bracket.matches.some(
      (m) => m.round === round && (m.homeTeamId === teamId || m.awayTeamId === teamId),
    );
  const fin = bracket.matches.filter((m) => m.round === last);
  // 마지막 라운드에 경기가 둘 이상이면 결승이 아니다 (`championOf` 와 같은 잣대)
  if (fin.length === 1 && fin[0].winnerTeamId && played(last)) {
    return fin[0].winnerTeamId === teamId ? "champion" : "runnerUp";
  }
  if (played(last - 1)) return "semiFinal";
  return "notQualified";
}

/**
 * 그 해 그 리그 대회들 중 **제일 멀리 간 것 하나.** 합산이 아니다.
 *
 * 근거는 `04.GodotOnePitch/sim/postseason.gd:250` `result_for` 다(읽기만) —
 * 「학교는 그 해 대회 중 제일 멀리 간 것을 남긴다 — 대회가 여럿이라 마지막
 * 것만 보면 우승한 해가 미진출로 적힌다」. 고교는 한 시즌에 대회가 다섯이고
 * (`TOURNAMENTS`) 시즌 사이의 합산은 `calcHsBaseballScore` 가 따로 한다.
 *
 * ⚠ **`seasonYear` 로 거르지 않는다.** 대회 브래킷은 시즌 상태에 들어 있고
 *   `makeEmptySeason` 이 해마다 비운다 — 지난해 것이 남을 자리가 없다.
 *   해를 한 번 더 거르면, 엔진이 넣는 `seasonYear` 가 언젠가 어긋났을 때
 *   **아무 말 없이 다시 전부 미진출**이 된다. 그 조용한 실패가 이 결함이었다.
 */
export function bestTournamentResultOf(
  brackets: Record<string, TournamentBracket> | null | undefined,
  leagueId: string,
  teamId: string,
): SeasonResult {
  let best: SeasonResult = "notQualified";
  for (const b of Object.values(brackets ?? {})) {
    if (b.leagueId !== leagueId) continue;
    const r = tournamentResultOf(b, teamId);
    if (RESULT_RANK[r] > RESULT_RANK[best]) best = r;
  }
  return best;
}
