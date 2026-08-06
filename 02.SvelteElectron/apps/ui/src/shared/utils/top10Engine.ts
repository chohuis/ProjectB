import type { ProtagonistSave, Top10Entry, Top10Snapshot, PitcherSeasonStats, BatterSeasonStats } from "../types/save";
import type { EntityRow } from "../stores/master";
import type { MessageItem, Top10Column, Top10Metadata } from "../types/main";

// ── 월 레이블 (게임 내 주차 → 한국어 월) ─────────────────────
const MONTH_STARTS = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
const MONTH_NAMES  = ["3월","4월","5월","6월","7월","8월","9월","10월","11월","12월","1월","2월"];

function weekToMonthLabel(weekInYear: number): string {
  const w = Math.max(0, (weekInYear - 1) % 52);
  let idx = 0;
  for (let i = MONTH_STARTS.length - 1; i >= 0; i--) {
    if (w >= MONTH_STARTS[i]) { idx = i; break; }
  }
  return MONTH_NAMES[idx];
}

// ── 결정론적 NPC simScout (10~70) ────────────────────────────
function simNpcScout(npcId: string, week: number, grade: number): number {
  const tail  = parseInt(npcId.slice(-3), 10) || 1;
  const seed  = (tail * 1000 + week * 13 + grade * 7) % 600;
  return 10 + (seed / 600) * 60;
}

// ── 주인공 Prospect Score ────────────────────────────────────
function calcProspectScore(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
): number {
  const isPitcher = protagonist.playerType === "pitcher";
  const ovr       = isPitcher ? protagonist.pitching.ovr : protagonist.batting.ovr;
  const sc        = protagonist.scoutScore;

  if (!stats) return ovr * 0.80 + sc * 0.20;

  if (stats.type === "pitcher") {
    const ip = stats.ip ?? 0;
    let statW = ip < 10 ? 0 : ip < 30 ? 0.15 : 0.30;
    const eraScore = Math.max(0, Math.min(100, (9 - stats.era) / 9 * 100));
    const k9Score  = ip > 0 ? Math.min(100, (stats.k / ip) * 9 * 2) : 0;
    const statScore = eraScore * 0.6 + k9Score * 0.4;
    return ovr * (0.80 - statW) + sc * 0.20 + statScore * statW;
  } else {
    const pa = stats.pa ?? 0;
    let statW = pa < 20 ? 0 : pa < 60 ? 0.15 : 0.30;
    const avgScore = Math.min(100, stats.avg * 250);
    const opsScore = Math.min(100, stats.ops * 83);
    const statScore = avgScore * 0.5 + opsScore * 0.5;
    return ovr * (0.80 - statW) + sc * 0.20 + statScore * statW;
  }
}

// ── NPC Prospect Score ────────────────────────────────────────
function calcNpcScore(npc: EntityRow, week: number, grade: number): number {
  const d   = npc.details?.player;
  if (!d) return 0;
  const ovr = d.playerType === "pitcher" ? d.pitching.ovr : d.batting.ovr;
  return ovr * 0.80 + simNpcScout(npc.id, week, grade) * 0.20;
}

// ── 팀명 ─────────────────────────────────────────────────────
//
// ⚠ 여기 **옛 고교 16팀 이름표**가 박혀 있었다. 팀이 102개로 늘어난 뒤로는
// 표에 없는 팀이 `?? npc.teamId`로 떨어져 **주간 TOP10 문구에 `TEAM_HS_AEWOL`
// 같은 ID가 그대로 찍혔다.**
//
// 이름의 정본은 `refs.json` → `masterStore.teams`다. 부르는 쪽이 넘긴다.
type TeamNameLookup = (teamId: string) => string;


// ── TOP 10 생성 ───────────────────────────────────────────────
export function generateTop10(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  seasonWeek: number,
  grade: number,
  seasonYear: number | undefined,
  teamNameOf: TeamNameLookup,
): Top10Snapshot {
  const npcTeamName = (npc: EntityRow) => teamNameOf(npc.teamId);
  const type = protagonist.playerType === "pitcher" ? "pitcher" : "batter";
  const teamName = teamNameOf(protagonist.teamId);

  const heroScore = calcProspectScore(protagonist, stats);
  const heroEntry: Top10Entry & { score: number } = {
    id:       "PLY_HERO",
    name:     protagonist.name,
    teamName,
    score:    heroScore,
    rank:     0,
  };

  const npcPool = allEntities
    .filter(
      (n) =>
        n.role === "player" &&
        n.leagueId === "LEAGUE_HIGHSCHOOL" &&
        n.details?.player?.playerType === type &&
        (!n.entryYear || !seasonYear || n.entryYear <= seasonYear),
    )
    .map((n) => ({
      id:       n.id,
      name:     n.name,
      teamName: npcTeamName(n),
      score:    calcNpcScore(n, seasonWeek, n.grade ?? 3),
      rank:     0,
    }));

  const all = [...npcPool, heroEntry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return { type, grade, week: seasonWeek, entries: all };
}

// ── 학년 필터 Top 10 (통합·학년별 공용) ──────────────────────
function generateTop10ForGrade(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  seasonWeek: number,
  grade: number,
  seasonYear: number,
  gradeFilter: 1 | 2 | 3 | null,
  teamNameOf: TeamNameLookup,
): { entries: Top10Entry[]; heroRank: number | null } {
  const npcTeamName = (npc: EntityRow) => teamNameOf(npc.teamId);
  const teamName = teamNameOf(protagonist.teamId);
  const type = protagonist.playerType === "pitcher" ? "pitcher" : "batter";
  const heroScore = calcProspectScore(protagonist, stats);
  const heroGrade = protagonist.grade ?? 1;

  const npcPool = allEntities
    .filter(
      (n) =>
        n.role === "player" &&
        n.leagueId === "LEAGUE_HIGHSCHOOL" &&
        n.details?.player?.playerType === type &&
        (!n.entryYear || !seasonYear || n.entryYear <= seasonYear) &&
        (gradeFilter === null || (n.grade ?? 3) === gradeFilter),
    )
    .map((n) => ({
      id:       n.id,
      name:     n.name,
      teamName: npcTeamName(n),
      score:    calcNpcScore(n, seasonWeek, n.grade ?? 3),
      rank:     0,
    }));

  const heroIncluded = gradeFilter === null || heroGrade === gradeFilter;
  const heroEntry = heroIncluded
    ? { id: "PLY_HERO", name: protagonist.name, teamName, score: heroScore, rank: 0 }
    : null;

  const pool = heroEntry ? [...npcPool, heroEntry] : npcPool;
  const sorted = pool.sort((a, b) => b.score - a.score);
  const top10 = sorted.slice(0, 10).map((e, i) => ({ ...e, rank: i + 1 }));

  let heroRank: number | null = null;
  if (heroIncluded) {
    const heroInTop10 = top10.some((e) => e.id === "PLY_HERO");
    if (!heroInTop10) {
      heroRank = sorted.findIndex((e) => e.id === "PLY_HERO") + 1;
    }
  }

  return { entries: top10, heroRank };
}

// ── 4컬럼 Top10Metadata 빌드 ──────────────────────────────────
export function buildTop10Metadata(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  weekNum: number,
  seasonYear: number,
  teamNameOf: TeamNameLookup,
): Top10Metadata {
  const makeCol = (
    label: Top10Column["label"],
    gradeFilter: 1 | 2 | 3 | null,
    includeHeroRank: boolean,
  ): Top10Column => {
    const { entries, heroRank } = generateTop10ForGrade(
      protagonist, stats, allEntities, weekNum,
      protagonist.grade ?? 1, seasonYear, gradeFilter, teamNameOf,
    );
    return { label, entries, heroRank: includeHeroRank ? heroRank : null };
  };

  return {
    type: "top10",
    playerType: protagonist.playerType === "pitcher" ? "pitcher" : "batter",
    week: weekNum,
    seasonYear,
    columns: [
      makeCol("통합",   null, true),
      makeCol("3학년",  3,    (protagonist.grade ?? 1) === 3),
      makeCol("2학년",  2,    (protagonist.grade ?? 1) === 2),
      makeCol("1학년",  1,    (protagonist.grade ?? 1) === 1),
    ],
  };
}

// ── IN/OUT/이동 계산 ─────────────────────────────────────────
interface Changes {
  ins:   Top10Entry[];
  outs:  Top10Entry[];
  moves: Record<string, number>;  // id → 순위 변동 (양수=상승)
}

function calcChanges(curr: Top10Snapshot, last: Top10Snapshot | null): Changes {
  if (!last) return { ins: curr.entries, outs: [], moves: {} };

  const lastMap = new Map(last.entries.map((e) => [e.id, e.rank]));
  const currSet = new Set(curr.entries.map((e) => e.id));

  const ins  = curr.entries.filter((e) => !lastMap.has(e.id));
  const outs = last.entries.filter((e) => !currSet.has(e.id));
  const moves: Record<string, number> = {};
  for (const e of curr.entries) {
    if (lastMap.has(e.id)) moves[e.id] = lastMap.get(e.id)! - e.rank;
  }
  return { ins, outs, moves };
}

// ── 주인공 전체 순위 (TOP10 외일 때) ─────────────────────────
function heroRankInAll(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  seasonWeek: number,
  grade: number,
  seasonYear?: number,
): number {
  const type = protagonist.playerType === "pitcher" ? "pitcher" : "batter";
  const heroScore = calcProspectScore(protagonist, stats);
  const beaten = allEntities
    .filter(
      (n) =>
        n.role === "player" &&
        n.leagueId === "LEAGUE_HIGHSCHOOL" &&
        n.details?.player?.playerType === type &&
        (!n.entryYear || !seasonYear || n.entryYear <= seasonYear),
    )
    .filter((n) => calcNpcScore(n, seasonWeek, n.grade ?? 3) > heroScore)
    .length;
  return beaten + 1;
}

// ── 메시지 생성 ───────────────────────────────────────────────
export function buildTop10Message(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  curr: Top10Snapshot,
  last: Top10Snapshot | null,
  weekNum: number,
  seasonYear: number | undefined,
  teamNameOf: TeamNameLookup,
): MessageItem {
  const typeKr  = curr.type === "pitcher" ? "투수" : "타자";
  const monthKr = weekToMonthLabel(weekNum);
  const gradeKr = `고${curr.grade}`;

  const heroEntry = curr.entries.find((e) => e.id === "PLY_HERO");
  const overallHeroRank = heroEntry?.rank ?? heroRankInAll(protagonist, stats, allEntities, curr.week, curr.grade, seasonYear);
  const inTop10 = !!heroEntry;

  const subject = inTop10
    ? `[${gradeKr} ${monthKr}] 고교 ${typeKr} 유망주 ${overallHeroRank}위`
    : `[${gradeKr} ${monthKr}] 고교 ${typeKr} 유망주 월간 랭킹`;

  const metadata = buildTop10Metadata(protagonist, stats, allEntities, weekNum, seasonYear ?? 0, teamNameOf);

  return {
    id:        `msg-top10-${curr.type}-w${weekNum}-${Date.now()}`,
    category:  "news",
    sender:    "스포츠 매체",
    subject,
    preview:   inTop10 ? `통합 ${overallHeroRank}위 진입` : `통합 순위 ${overallHeroRank}위권`,
    body:      subject,
    createdAt: `W${weekNum}`,
    readAt:    null,
    metadata,
  };
}

// ── 효과 수치 ─────────────────────────────────────────────────
export function rankEffect(rank: number): { popularity: number; scoutScore: number; morale: number } {
  if (rank === 1)           return { popularity: 10, scoutScore: 5, morale: 5 };
  if (rank <= 3)            return { popularity:  7, scoutScore: 3, morale: 3 };
  if (rank <= 5)            return { popularity:  5, scoutScore: 2, morale: 2 };
  if (rank <= 10)           return { popularity:  3, scoutScore: 1, morale: 1 };
  return                           { popularity:  0, scoutScore: 0, morale: 0 };
}
