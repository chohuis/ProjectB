import type { SaveSeason, ScheduleEntry, PlayerGameLine } from "../types/season";
// ⚠ 이닝 표기는 정본이 하나다 — `toFixed(1)` 은 `.7` 같은 없는 표기를 만든다
import { ipLabel } from "../utils/baseballFormat";

/**
 * 대회 개인 수상 — MVP · 우수투수 · 타격상.
 *
 * 🔴 **대회 5종이 도는데 우승해도 개인에게 남는 게 없었다.** 팀 성적만
 *   쌓이고, 그게 진로 판정의 팀 점수로만 흘러 들어갔다.
 *
 * ⚠ **대회별 성적은 따로 안 쌓인다.** `applyTournamentResult` 가 개인
 *   기록을 시즌 성적에 합산한다(주석: "순위표만 건드리지 않는다").
 *   그래서 **그 대회 경기의 `playerLines` 를 직접 모은다** — 새 저장
 *   구조를 만들지 않는다.
 *
 * ⚠ 범위는 상마다 다르다(사용자 확정 2026-08-30):
 *   MVP 는 **우승팀 안에서**, 우수투수·타격상은 **참가팀 전체**에서.
 *   8강에서 져도 부문상은 받을 수 있다.
 */

/** 한 선수의 그 대회 합계 */
interface TourLine {
  playerId: string;
  teamId: string;
  /** 투수 */
  outs: number; er: number; k: number; w: number; sv: number; hd: number;
  /** 타자 */
  ab: number; h: number; hr: number; rbi: number; tb: number;
}

const empty = (playerId: string, teamId: string): TourLine => ({
  playerId, teamId,
  outs: 0, er: 0, k: 0, w: 0, sv: 0, hd: 0,
  ab: 0, h: 0, hr: 0, rbi: 0, tb: 0,
});

/**
 * 그 대회 경기들의 개인 기록을 모은다.
 *
 * ⚠ **`isTournament` 만으로는 못 가른다** — 한 시즌에 대회가 다섯이라
 *   전부 섞인다. 주차로 좁힌다.
 */
export function collectTournamentLines(
  schedule: ScheduleEntry[],
  startWeek: number,
  endWeek: number,
): Map<string, TourLine> {
  const acc = new Map<string, TourLine>();
  const put = (id: string, teamId: string): TourLine => {
    let r = acc.get(id);
    if (!r) { r = empty(id, teamId); acc.set(id, r); }
    return r;
  };
  for (const e of schedule) {
    if (!e.isTournament || !e.result) continue;
    if (e.week < startWeek || e.week > endWeek) continue;
    for (const line of e.result.playerLines ?? []) {
      // 어느 팀 선수인지는 라인에 없다 — 경기의 두 팀 중 하나다.
      // ⚠ 정확한 소속은 호출부가 넘기는 로스터로 다시 맞춘다.
      const teamId = (line as unknown as { teamId?: string }).teamId ?? "";
      if (line.role === "pitcher") {
        const p = line as PlayerGameLine & { role: "pitcher" };
        const r = put(p.playerId, teamId || r0(e, p.playerId));
        r.outs += Math.round((p.ip ?? 0) * 3);
        r.er += p.er ?? 0;
        r.k += p.k ?? 0;
        if (p.decision === "W") r.w += 1;
        if (p.decision === "SV") r.sv += 1;
        if (p.decision === "HD") r.hd += 1;
      } else {
        const b = line as PlayerGameLine & { role: "batter" };
        const r = put(b.playerId, teamId || r0(e, b.playerId));
        r.ab += b.ab ?? 0;
        r.h += b.h ?? 0;
        r.hr += b.hr ?? 0;
        r.rbi += b.rbi ?? 0;
        // ⚠ 장타를 단타로 세면 총루타가 근사가 된다 — `b2`·`b3` 를 본다
        r.tb += (b.h ?? 0) + (b.b2 ?? 0) + (b.b3 ?? 0) * 2 + (b.hr ?? 0) * 3;
      }
    }
  }
  return acc;
}

/** 소속을 모를 때의 폴백 — 홈팀으로 둔다(집계용이라 상만 못 준다) */
function r0(e: ScheduleEntry, _playerId: string): string {
  return e.homeTeamId;
}

/**
 * 투수 점수 — 그 대회에서 얼마나 잘 던졌나.
 *
 * ⚠ **이닝이 적으면 방어율이 요행이다.** 넉아웃이라 한 경기 완봉이
 *   전부인 선수가 나온다 — 이닝을 곱해 표본을 반영한다.
 */
export function pitcherScore(r: TourLine): number {
  const ip = r.outs / 3;
  if (ip < 6) return -1;                      // 두 경기치는 던져야 후보다
  const era = r.er * 9 / Math.max(1, ip);
  return (9 - Math.min(9, era)) * 6 + ip * 1.5 + r.k * 0.8 + r.w * 8 + r.sv * 4 + r.hd * 2;
}

/**
 * 타자 점수.
 *
 * ⚠ 타석 하한이 없으면 **1타석 1안타(1.000)** 가 타격상을 받는다.
 */
export function batterScore(r: TourLine): number {
  if (r.ab < 8) return -1;
  const avg = r.ab > 0 ? r.h / r.ab : 0;
  return avg * 100 + r.tb * 2 + r.rbi * 2.5 + r.hr * 4 + r.ab * 0.3;
}

export interface TourAward {
  id: "tour_mvp" | "tour_pitcher" | "tour_batter";
  label: string;
  playerId: string;
  teamId: string;
  value: string;
}

/**
 * 그 대회의 수상자 셋.
 *
 * ⚠ **MVP 는 우승팀 안에서만** 뽑는다 — 1회전 탈락자가 한 경기 호투로
 *   MVP 가 되면 우승의 뜻이 사라진다. 부문상은 전체에서 뽑는다.
 */
export function tournamentAwards(
  lines: Map<string, TourLine>,
  championTeamId: string,
  rosterTeamOf: (playerId: string) => string | null,
): TourAward[] {
  // ⚠ **소속을 못 찾으면 후보에서 뺀다.** 예전엔 집계용 폴백(홈팀)으로
  //   흡수해서, 호출부가 리그로 걸러도 **그 폴백이 게이트를 무력화**했다.
  const rows = [...lines.values()]
    .map((r) => ({ ...r, teamId: rosterTeamOf(r.playerId) }))
    .filter((r): r is typeof r & { teamId: string } => r.teamId != null);
  const out: TourAward[] = [];

  const best = <T>(arr: T[], score: (x: T) => number): T | null => {
    let b: T | null = null; let bs = -Infinity;
    for (const x of arr) { const s = score(x); if (s > bs) { bs = s; b = x; } }
    return bs <= 0 ? null : b;
  };

  const champRows = rows.filter((r) => r.teamId === championTeamId);
  const mvp = best(champRows, (r) => Math.max(pitcherScore(r), batterScore(r)));
  if (mvp) {
    const asP = pitcherScore(mvp) >= batterScore(mvp);
    out.push({
      id: "tour_mvp", label: "대회 MVP",
      playerId: mvp.playerId, teamId: mvp.teamId,
      value: asP
        ? `${ipLabel(mvp.outs / 3)}이닝 ${mvp.k}탈삼진`
        : `${mvp.h}안타 ${mvp.rbi}타점`,
    });
  }

  const p = best(rows, pitcherScore);
  if (p) {
    const ip = p.outs / 3;
    const era = p.er * 9 / Math.max(1, ip);
    out.push({
      id: "tour_pitcher", label: "우수투수상",
      playerId: p.playerId, teamId: p.teamId,
      value: `${ipLabel(ip)}이닝 방어율 ${era.toFixed(2)}`,
    });
  }

  const b = best(rows, batterScore);
  if (b) {
    const avg = b.ab > 0 ? b.h / b.ab : 0;
    out.push({
      id: "tour_batter", label: "타격상",
      playerId: b.playerId, teamId: b.teamId,
      value: `타율 ${avg.toFixed(3).replace(/^0/, "")} ${b.hr}홈런`,
    });
  }
  return out;
}

/** 시즌에서 그 대회의 주차 범위를 찾는다 */
export function weekRangeOf(
  season: SaveSeason, tournamentId: string,
): { start: number; end: number } | null {
  const b = season.tournaments?.[tournamentId];
  if (!b) return null;
  const weeks = b.matches.map((m: { week?: number }) => m.week)
    .filter((w): w is number => w != null);
  if (weeks.length === 0) return null;
  return { start: Math.min(...weeks), end: Math.max(...weeks) };
}
