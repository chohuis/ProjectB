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

// ── 팀명 추출 (EntityRow.teamId → 한국어) ────────────────────
const HS_TEAM_NAMES: Record<string, string> = {
  TEAM_HS_SEOUL_INNOVATION: "서울 이노베이션",
  TEAM_HS_BUSAN_WAVE:       "부산 웨이브",
  TEAM_HS_DAEGU_HEAT:       "대구 히트",
  TEAM_HS_GWANGJU_VISION:   "광주 비전",
  TEAM_HS_DAEJEON_RISE:     "대전 라이즈",
  TEAM_HS_INCHEON_HARBOR:   "인천 하버",
  TEAM_HS_ULSAN_CHARGE:     "울산 차지",
  TEAM_HS_SUWON_EDGE:       "수원 에지",
  TEAM_HS_YEOSU_SHORE:      "여수 쇼어",
  TEAM_HS_CHUNCHEON_HIGHLAND:"춘천 하이랜드",
  TEAM_HS_JEJU_WIND:        "제주 윈드",
  TEAM_HS_GANGWON_PEAK:     "강원 피크",
  TEAM_HS_MASAN_HARBOR:     "마산 하버",
  TEAM_HS_JECHEON_RIDGE:    "제천 릿지",
  TEAM_HS_GOYANG_ARROW:     "고양 애로우",
  TEAM_HS_SUNCHEON_BAY:     "순천 베이",
};

function npcTeamName(npc: EntityRow): string {
  return HS_TEAM_NAMES[npc.teamId] ?? npc.teamId;
}

// ── TOP 10 생성 ───────────────────────────────────────────────
export function generateTop10(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  seasonWeek: number,
  grade: number,
  seasonYear?: number,
): Top10Snapshot {
  const type = protagonist.playerType === "pitcher" ? "pitcher" : "batter";
  const teamName = HS_TEAM_NAMES[protagonist.teamId] ?? protagonist.teamId;

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
): { entries: Top10Entry[]; heroRank: number | null } {
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
    ? { id: "PLY_HERO", name: protagonist.name, teamName: HS_TEAM_NAMES[protagonist.teamId] ?? protagonist.teamId, score: heroScore, rank: 0 }
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
): Top10Metadata {
  const makeCol = (
    label: Top10Column["label"],
    gradeFilter: 1 | 2 | 3 | null,
    includeHeroRank: boolean,
  ): Top10Column => {
    const { entries, heroRank } = generateTop10ForGrade(
      protagonist, stats, allEntities, weekNum,
      protagonist.grade ?? 1, seasonYear, gradeFilter,
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
  seasonYear?: number,
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

  const metadata = buildTop10Metadata(protagonist, stats, allEntities, weekNum, seasonYear ?? 0);

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
