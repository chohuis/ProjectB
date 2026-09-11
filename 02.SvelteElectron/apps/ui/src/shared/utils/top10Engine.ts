import { monthNameOf } from "./seasonCalendar";
import type {
  ProtagonistSave,
  Top10Entry,
  Top10Snapshot,
  PitcherSeasonStats,
  BatterSeasonStats,
} from "../types/save";
import type { EntityRow } from "../stores/master";
import type { MessageItem, Top10Column, Top10Metadata } from "../types/main";

// 월 레이블 — 표는 `seasonCalendar`가 정본이다(예전엔 여기 사본이 있었다)
const weekToMonthLabel = monthNameOf;

// ── 점수 계산은 Rust가 한다 (2026-08-28) ──────────────────────
//
// 🔴 예전엔 여기 셋이 있었다:
//   · `calcProspectScore` — OVR·스카우트 가중, 성적 가중(0 / 0.15 / 0.30)
//   · `calcNpcScore`      — 같은 축
//   · `simNpcScout`       — **id 뒷자리로 만드는 유사난수**
//
//   `Math.random()`은 아니었지만 **난수를 TS가 만드는 것**은 같다.
//   CLAUDE.md 아키텍처가 금지하는 자리다.
//
// ⚠ **정렬도 Rust가 한다.** 점수만 받아 TS가 다시 줄을 세우면 동점 처리가
//   두 곳에서 갈린다.
// ⚠ 값은 옮기기만 했다 — 가중치·구간을 안 바꿨다. Rust 검사가 뒷자리 파싱까지
//   TS 원본(`parseInt(id.slice(-3)) || 1`)과 맞대 본다.

/** Rust에 넘길 NPC 한 명 — **필요한 것만** 보낸다(주당 1,377명이다) */
interface ProspectNpcPayload {
  id: string;
  name: string;
  teamName: string;
  ovr: number;
  grade: number;
}

/** 후보 풀을 만든다. 한 번 만들어 네 컬럼이 돌려 쓴다 */
function buildNpcPayload(
  allEntities: EntityRow[],
  type: "pitcher" | "batter",
  seasonYear: number | undefined,
  teamNameOf: TeamNameLookup,
): ProspectNpcPayload[] {
  const out: ProspectNpcPayload[] = [];
  for (const n of allEntities) {
    if (n.role !== "player" || n.leagueId !== "LEAGUE_HIGHSCHOOL") continue;
    const d = n.details?.player;
    if (!d || d.playerType !== type) continue;
    if (n.entryYear && seasonYear && n.entryYear > seasonYear) continue;
    out.push({
      id: n.id,
      name: n.name,
      teamName: teamNameOf(n.teamId),
      ovr: type === "pitcher" ? d.pitching.ovr : d.batting.ovr,
      grade: n.grade ?? 3,
    });
  }
  return out;
}

/** 주인공 성적을 Rust 페이로드 모양으로 */
function heroStatsPayload(stats: PitcherSeasonStats | BatterSeasonStats | null) {
  if (!stats) return { hasStats: false };
  if (stats.type === "pitcher") {
    return { hasStats: true, isPitcher: true, ip: stats.ip ?? 0, era: stats.era, k: stats.k };
  }
  return { hasStats: true, isPitcher: false, pa: stats.pa ?? 0, avg: stats.avg, ops: stats.ops };
}

interface RankResult {
  entries: (Top10Entry & { score: number })[];
  heroRank: number;
}

/**
 * Rust에 순위를 물어본다.
 *
 * ⚠ 엔진이 없으면(Vite 단독) **빈 결과**다 — 여기서 점수를 다시 만들지 않는다.
 *   만들면 또 두 벌이 된다.
 */
async function rankFromEngine(
  npcs: ProspectNpcPayload[],
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  teamName: string,
  week: number,
  gradeFilter: 0 | 1 | 2 | 3,
): Promise<RankResult> {
  const api = window.projectB?.engine;
  if (!api) return { entries: [], heroRank: 0 };
  const isPitcher = protagonist.playerType === "pitcher";
  try {
    return JSON.parse(
      await api(
        "calcProspectRankNative",
        JSON.stringify({
          npcs,
          week,
          heroName: protagonist.name,
          heroTeamName: teamName,
          heroOvr: isPitcher ? protagonist.pitching.ovr : protagonist.batting.ovr,
          heroScoutScore: protagonist.scoutScore,
          heroGrade: protagonist.grade ?? 1,
          gradeFilter,
          ...heroStatsPayload(stats),
        }),
      ),
    ) as RankResult;
  } catch {
    return { entries: [], heroRank: 0 };
  }
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
export async function generateTop10(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  seasonWeek: number,
  grade: number,
  seasonYear: number | undefined,
  teamNameOf: TeamNameLookup,
): Promise<Top10Snapshot> {
  const type = protagonist.playerType === "pitcher" ? "pitcher" : "batter";
  const npcs = buildNpcPayload(allEntities, type, seasonYear, teamNameOf);
  const r = await rankFromEngine(
    npcs,
    protagonist,
    stats,
    teamNameOf(protagonist.teamId),
    seasonWeek,
    0,
  );
  return { type, grade, week: seasonWeek, entries: r.entries };
}

// ── 학년 필터 Top 10 (통합·학년별 공용) ──────────────────────
// ── 4컬럼 Top10Metadata 빌드 ──────────────────────────────────
export async function buildTop10Metadata(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  weekNum: number,
  seasonYear: number,
  teamNameOf: TeamNameLookup,
): Promise<Top10Metadata> {
  const type = protagonist.playerType === "pitcher" ? "pitcher" : "batter";
  // ⚠ **풀을 한 번만 만든다.** 컬럼이 넷이라 매번 만들면 1,377명을 네 번 훑고
  //   네 번 직렬화한다. 학년 필터는 Rust가 건다.
  const npcs = buildNpcPayload(allEntities, type, seasonYear, teamNameOf);
  const teamName = teamNameOf(protagonist.teamId);
  const heroGrade = protagonist.grade ?? 1;

  const makeCol = async (
    label: Top10Column["label"],
    gradeFilter: 0 | 1 | 2 | 3,
    includeHeroRank: boolean,
  ): Promise<Top10Column> => {
    const r = await rankFromEngine(npcs, protagonist, stats, teamName, weekNum, gradeFilter);
    // ⚠ Rust는 "없음"을 0으로 준다 — 화면 계약은 `null`이다
    const heroRank = r.heroRank > 0 ? r.heroRank : null;
    return { label, entries: r.entries, heroRank: includeHeroRank ? heroRank : null };
  };

  return {
    type: "top10",
    playerType: type,
    week: weekNum,
    seasonYear,
    columns: [
      await makeCol("통합", 0, true),
      await makeCol("3학년", 3, heroGrade === 3),
      await makeCol("2학년", 2, heroGrade === 2),
      await makeCol("1학년", 1, heroGrade === 1),
    ],
  };
}

// ── IN/OUT/이동 계산 ─────────────────────────────────────────
interface Changes {
  ins: Top10Entry[];
  outs: Top10Entry[];
  moves: Record<string, number>; // id → 순위 변동 (양수=상승)
}

function calcChanges(curr: Top10Snapshot, last: Top10Snapshot | null): Changes {
  if (!last) return { ins: curr.entries, outs: [], moves: {} };

  const lastMap = new Map(last.entries.map((e) => [e.id, e.rank]));
  const currSet = new Set(curr.entries.map((e) => e.id));

  const ins = curr.entries.filter((e) => !lastMap.has(e.id));
  const outs = last.entries.filter((e) => !currSet.has(e.id));
  const moves: Record<string, number> = {};
  for (const e of curr.entries) {
    if (lastMap.has(e.id)) moves[e.id] = lastMap.get(e.id)! - e.rank;
  }
  return { ins, outs, moves };
}

// ── 주인공 전체 순위 (TOP10 외일 때) ─────────────────────────
// 🔴 **`heroRankInAll`을 지웠다** (2026-08-28).
//
//   TOP10 밖일 때의 주인공 순위를 **여기서 다시 계산했다** — 전 고교 선수를
//   한 번 더 훑으며 `calcNpcScore`를 다시 돌렸다. 같은 점수를 두 번 만드는
//   구조라, 한쪽 산식만 고치면 두 값이 갈린다.
//
//   Rust `calc_prospect_rank`가 `heroRank`를 **함께 돌려준다.** 그걸 쓴다.

// ── 메시지 생성 ───────────────────────────────────────────────
export async function buildTop10Message(
  protagonist: ProtagonistSave,
  stats: PitcherSeasonStats | BatterSeasonStats | null,
  allEntities: EntityRow[],
  curr: Top10Snapshot,
  last: Top10Snapshot | null,
  weekNum: number,
  seasonYear: number | undefined,
  teamNameOf: TeamNameLookup,
): Promise<MessageItem> {
  const typeKr = curr.type === "pitcher" ? "투수" : "타자";
  const monthKr = weekToMonthLabel(weekNum);
  const gradeKr = `고${curr.grade}`;

  const heroEntry = curr.entries.find((e) => e.id === "PLY_HERO");
  const inTop10 = !!heroEntry;

  // ⚠ **메타를 먼저 만든다.** 통합 컬럼의 `heroRank`가 TOP10 밖일 때의
  //   순위다 — 예전엔 그걸 `heroRankInAll`로 **다시 계산**했다.
  const metadata = await buildTop10Metadata(
    protagonist,
    stats,
    allEntities,
    weekNum,
    seasonYear ?? 0,
    teamNameOf,
  );
  const overallHeroRank = heroEntry?.rank ?? metadata.columns[0]?.heroRank ?? 0;

  const subject = inTop10
    ? `[${gradeKr} ${monthKr}] 고교 ${typeKr} 유망주 ${overallHeroRank}위`
    : `[${gradeKr} ${monthKr}] 고교 ${typeKr} 유망주 월간 랭킹`;

  return {
    // 🔴 **연도+종류+주차**다. 월간 랭킹이라 한 주에 종류당 한 통이다
    id: `msg-top10-${seasonYear ?? 0}-${curr.type}-w${weekNum}`,
    category: "news",
    sender: "스포츠 매체",
    subject,
    preview: inTop10 ? `통합 ${overallHeroRank}위 진입` : `통합 순위 ${overallHeroRank}위권`,
    body: subject,
    createdAt: `W${weekNum}`,
    readAt: null,
    metadata,
  };
}

// ── 효과 수치 ─────────────────────────────────────────────────
export function rankEffect(rank: number): {
  popularity: number;
  scoutScore: number;
  morale: number;
} {
  if (rank === 1) return { popularity: 10, scoutScore: 5, morale: 5 };
  if (rank <= 3) return { popularity: 7, scoutScore: 3, morale: 3 };
  if (rank <= 5) return { popularity: 5, scoutScore: 2, morale: 2 };
  if (rank <= 10) return { popularity: 3, scoutScore: 1, morale: 1 };
  return { popularity: 0, scoutScore: 0, morale: 0 };
}
