import type { ProtagonistSave, Top10Entry, Top10Snapshot, PitcherSeasonStats, BatterSeasonStats } from "../types/save";
import type { EntityRow } from "../stores/master";
import type { MessageItem } from "../types/main";

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
      score:    calcNpcScore(n, seasonWeek, grade),
      rank:     0,
    }));

  const all = [...npcPool, heroEntry]
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
    .map((e, i) => ({ ...e, rank: i + 1 }));

  return { type, grade, week: seasonWeek, entries: all };
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
    .filter((n) => calcNpcScore(n, seasonWeek, grade) > heroScore)
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
  const { ins, outs, moves } = calcChanges(curr, last);

  const heroEntry = curr.entries.find((e) => e.id === "PLY_HERO");
  const heroRank  = heroEntry?.rank ?? heroRankInAll(protagonist, stats, allEntities, curr.week, curr.grade, seasonYear);
  const inTop10   = !!heroEntry;

  // 순위표 행 생성
  const rows = curr.entries.map((e) => {
    const isHero   = e.id === "PLY_HERO";
    const isNew    = ins.some((i) => i.id === e.id);
    const delta    = moves[e.id];
    const changeStr = isNew        ? "★ NEW"
                    : delta > 0    ? `▲ ${delta}`
                    : delta < 0    ? `▼ ${Math.abs(delta)}`
                    :                "─";
    const heroMark = isHero ? "  ◀" : "";
    const rankStr  = `${e.rank}위`.padStart(4);
    const nameStr  = e.name.padEnd(5);
    return `${rankStr}  ${nameStr}  ${e.teamName}  ${changeStr}${heroMark}`;
  });

  // 변동 섹션
  const insStr  = ins.length  ? `\nIN  : ${ins.map((e)  => `${e.name} (${e.teamName})`).join(", ")}` : "";
  const outsStr = outs.length ? `\nOUT : ${outs.map((e) => `${e.name} (${e.teamName})`).join(", ")}` : "";

  // 주인공 밖일 때 추가 표시
  const heroFooter = inTop10
    ? ""
    : `\n─────────────────────────\n※ 내 순위: TOP 10 외 (추정 ${heroRank}위)\n다음 평가까지 4주 남았습니다.`;

  // 효과 힌트
  const effectHint = inTop10
    ? `인기도 +${rankEffect(heroRank).popularity} / 스카우트평가 +${rankEffect(heroRank).scoutScore} / 사기 +${rankEffect(heroRank).morale}`
    : "";
  const effectLine = effectHint ? `\n[${effectHint}]` : "";

  const subject = inTop10
    ? `[${gradeKr} ${monthKr}] 고교 ${typeKr} 유망주 ${heroRank}위`
    : `[${gradeKr} ${monthKr}] 고교 ${typeKr} 유망주 월간 랭킹`;

  const body = [
    `[${gradeKr} ${monthKr} — 고교 ${typeKr} 유망주 월간 랭킹]`,
    "",
    "─────────────────────────",
    ...rows,
    "─────────────────────────",
    insStr + outsStr,
    "",
    `평가 기준: 구위·제구·스카우트 관심도 종합`,
    effectLine,
    heroFooter,
  ].join("\n").replace(/\n{3,}/g, "\n\n").trim();

  return {
    id:        `msg-top10-${curr.type}-w${weekNum}-${Date.now()}`,
    category:  "news",
    sender:    "스포츠 매체",
    subject,
    preview:   subject,
    body,
    createdAt: `W${weekNum}`,
    readAt:    null,
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
