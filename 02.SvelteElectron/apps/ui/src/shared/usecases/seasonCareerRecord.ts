// ── 주인공 시즌 기록 ─────────────────────────────────────────────
//
// ⚠ **이 조립이 `SeasonEndModal.svelte` 안에만 있었다.** 그래서 시즌 결산
// 모달을 **열어야만** `careerRecords`가 쌓였고, 자동 진행·계측 하네스에선
// 19시즌을 뛰어도 경력 기록이 **한 줄도 없었다.**
//
// 읽는 쪽은 이미 많다 — 전부 빈 배열을 받고 있었다:
//   · `StatusPage` 연도별 성적·경력 표
//   · `CareerEndScreen` 은퇴 결산 ("19시즌치가 다 남아 있는데 아무도 안 읽었다")
//   · `PlayerDetailModal` 팀 이력 합성
//   · `universityUtils.calcHsBaseballScore(careerRecords)` 진학 점수
//   · `addProtagonistAwards` — **얹을 그 해 항목이 없어 수상이 조용히 버려졌다**
//
// 마지막 것이 이 파일을 만든 계기다. 수상은 세 겹이었다:
//   ① 리그 후보 맵에 주인공이 없다        (`seasonAwards.ts`)
//   ② 이겨도 npc 목록만 훑어 버려진다     (`addProtagonistAwards`)
//   ③ **얹을 시즌 항목 자체가 없다**       ← 여기
// 앞의 둘만 고치고 30회를 돌렸을 때도 수상은 0건이었다.
//
// 같은 형태를 이 파일 옆에서 이미 한 번 겪었다 — `computeAwards`도 모달에
// 자체 집계가 있어 화면과 기록이 어긋났었다. **모달에 계산을 두지 않는다.**

import { ipLabel, rateLabel, eraLabel } from "../utils/baseballFormat";
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import type {
  CareerGameLogEntry, CareerSeasonRecord,
  PitcherSeasonStats, BatterSeasonStats, PlayerSeasonStats,
} from "../types/save";
import type { PitcherGameLine, ScheduleEntry } from "../types/season";

const pct = rateLabel;   // 표기 정본은 utils/baseballFormat.ts

/** 경력 표에 한 줄로 뜨는 요약 — 화면이 다시 만들지 않는다 */
export function statLineOf(st: PlayerSeasonStats | undefined): string {
  if (st?.type === "pitcher") {
    const ps = st as PitcherSeasonStats;
    return `${ps.w}승 ${ps.l}패 ERA ${eraLabel(ps.era)} ${ipLabel(ps.ip)}이닝 ${ps.k}K`;
  }
  if (st?.type === "batter") {
    const bs = st as BatterSeasonStats;
    return `타율 ${pct(bs.avg)} ${bs.hr}홈런 ${bs.rbi}타점`;
  }
  return "";
}

/** 포스트시즌에서 어디까지 갔나 — 결승 결과가 없으면 아직 모른다 */
export function postseasonResultOf(
  schedule: ScheduleEntry[],
  myTeamId: string,
): { champion: string; runnerUp: string; myResult: NonNullable<CareerSeasonRecord["psResult"]> } | null {
  const ps = schedule.filter((e) => e.phase === "postseason");
  if (ps.length === 0) return null;
  const finalEntry = ps.find((e) => e.id.startsWith("PS_FINAL_"));
  if (!finalEntry?.result) return null;
  const champion = finalEntry.result.winnerId;
  const runnerUp = finalEntry.result.loserId ?? "";
  let myResult: NonNullable<CareerSeasonRecord["psResult"]> = "notQualified";
  if (champion === myTeamId) myResult = "champion";
  else if (runnerUp === myTeamId) myResult = "runnerUp";
  else if (ps.some((e) => e.id.startsWith("PS_SEMI")
    && (e.homeTeamId === myTeamId || e.awayTeamId === myTeamId))) myResult = "semiFinal";
  return { champion, runnerUp, myResult };
}

/**
 * 그 해 주인공 기록을 만들어 `careerRecords`에 얹는다.
 *
 * **`runSeasonRollover`가 부른다** — 주인공이 결산 화면을 열든 말든 매 시즌
 * 남아야 하고, **수상(`applySeasonAwards`)보다 먼저**여야 얹을 자리가 생긴다.
 *
 * ⚠ 수상은 여기서 넣지 않는다. 이 시점엔 아직 계산 전이고, `applySeasonAwards`가
 * `addProtagonistAwards`로 뒤에 얹는다 — 두 곳에서 넣으면 중복된다.
 */
export function applyProtagonistSeasonRecord(seasonYear: number): void {
  const s = get(seasonStore);
  const p = get(gameStore).protagonist;
  const myTeamId = p.teamId;

  // ⚠ 한 해에 두 줄이 생기면 연도 선택·은퇴 결산이 전부 어긋난다.
  // 모달과 롤오버가 둘 다 부르던 시절의 재발을 막는다
  if ((p.careerRecords ?? []).some((r) => r.year === seasonYear)) return;

  const st = s.stats[p.id];
  const standings = s.standings;
  const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const myStanding = standings.find((x) => x.teamId === myTeamId);
  const myRank = sorted.findIndex((x) => x.teamId === myTeamId) + 1;

  // 공식경기만 — 연습경기는 경력 기록에 남기지 않는다
  const gameLog: CareerGameLogEntry[] = s.schedule
    .filter((e) => e.isProtagonistGame && !e.isFriendly && !!e.result)
    .sort((a, b) => a.week - b.week)
    .map((e) => {
      const line = e.result!.playerLines.find(
        (l) => l.playerId === p.id && l.role === "pitcher",
      ) as PitcherGameLine | undefined;
      if (!line) return null;
      const isHome = e.homeTeamId === myTeamId;
      return {
        week: e.week,
        opponentId: isHome ? e.awayTeamId : e.homeTeamId,
        myScore:  isHome ? e.result!.homeScore : e.result!.awayScore,
        oppScore: isHome ? e.result!.awayScore : e.result!.homeScore,
        ip: line.ip, er: line.er, h: line.h, k: line.k, bb: line.bb,
        decision: line.decision, pitchCount: line.pitchCount,
      } as CareerGameLogEntry;
    })
    .filter((g): g is CareerGameLogEntry => g != null);

  const ps = postseasonResultOf(s.schedule, myTeamId);

  gameStore.appendCareerRecord({
    year: seasonYear,
    leagueId: p.leagueId,
    teamId: myTeamId,
    rank:       myRank > 0 ? myRank : undefined,
    totalTeams: standings.length > 0 ? standings.length : undefined,
    wins:   myStanding?.wins,
    losses: myStanding?.losses,
    draws:  myStanding?.draws,
    statLine: statLineOf(st),
    ovr: p.pitching.ovr,
    awards: [],
    psResult: ps?.myResult,
    gameLog,
  }, st ?? undefined);
}
