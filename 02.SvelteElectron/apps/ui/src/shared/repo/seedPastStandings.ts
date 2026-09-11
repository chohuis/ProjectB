// ── 세계 생성 시 과거 5년 순위 (A5) ──────────────────────────────
//
// 새 게임의 첫 시즌에 **역대 기록이 0건**이었다. 리그 화면의 연도 선택이
// 비어 있고, 방금 만든 역대 수상(A2)도 보여줄 과거가 없었다.
//
// **팀 순위만 만든다** (사용자 확정 2026-08-24).
// 선수 개인 기록은 안 만든다 — NPC 7,300명 × 5년이면 36,500행이고 수상 이력까지
// 지어내야 한다. 값에 비해 비싸다. 팀은 238팀 × 5년 ≈ 1,190행으로 가볍다.
//
// ⚠ **팀 전력★과 어긋나면 안 된다.** ★5 구단이 5년 내내 꼴찌인 과거를 가지면
//   세계가 첫날부터 자기모순이다. `refs.json`의 `power`를 입력으로 쓴다.
//
// ⚠ 씨앗을 쓴다 — 같은 세계는 같은 과거를 갖는다.
import { seedOf } from "../utils/seedOf";
import type { TeamRef } from "../stores/master";

/** 한 시즌 한 팀의 과거 순위 한 줄 */
export interface PastStandingRow {
  leagueId: string;
  teamId: string;
  groupLabel: string;
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  runsFor: number;
  runsAgainst: number;
  streak: string;
  last10: string;
}

/** 과거를 만들 리그 — 프로 1군만. 2군·아마추어는 순위표를 안 쓴다 */
const PAST_LEAGUES = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);

/** 리그별 시즌 경기 수 — 순위표 합이 맞아야 화면이 어색하지 않다 */
const GAMES: Record<string, number> = {
  LEAGUE_KBL: 144,
  LEAGUE_ABL: 162,
  LEAGUE_JBL: 143,
};

/**
 * 전력★ → 그해 승률의 **중심**. ★3(pivot)이 5할이다.
 *
 * ★ 한 단계가 승률 ±0.055다 — ★5면 .610, ★1이면 .390이 중심이 된다.
 * 실제 KBO 상위권이 .600 언저리라 그 폭에 맞췄다.
 */
const PIVOT = 3;
const WIN_PCT_PER_STAR = 0.055;

/**
 * 과거 5년 순위를 만든다.
 *
 * ⚠ **같은 팀이 5년 내내 같은 순위는 아니다.** 중심은 ★이 정하되 해마다
 *   흔들린다 — 안 그러면 순위표가 5년치 복사본이 된다.
 */
export function buildPastStandings(
  teams: readonly TeamRef[],
  worldSeed: number,
  seasonYear: number,
  years = 5,
): Map<number, PastStandingRow[]> {
  const out = new Map<number, PastStandingRow[]>();
  const byLeague = new Map<string, TeamRef[]>();
  for (const t of teams) {
    if (!PAST_LEAGUES.has(t.leagueId)) continue;
    if (!t.id.endsWith("_1")) continue; // 2군은 순위표를 안 쓴다
    if (!byLeague.has(t.leagueId)) byLeague.set(t.leagueId, []);
    byLeague.get(t.leagueId)!.push(t);
  }

  for (let i = 1; i <= years; i++) {
    const year = seasonYear - i;
    const rows: PastStandingRow[] = [];
    for (const [leagueId, list] of byLeague) {
      const g = GAMES[leagueId] ?? 144;
      for (const t of list) {
        // 씨앗 — 팀·연도로 갈린다. 같은 세계는 같은 과거를 갖는다
        const sd = seedOf(worldSeed, "pastStanding", t.id, year);
        // 0~1 두 개를 뽑아 흔들림을 만든다 (LCG 한 걸음)
        const r1 = ((sd * 1103515245 + 12345) >>> 0) / 4294967296;
        const r2 = ((sd * 214013 + 2531011) >>> 0) / 4294967296;

        const star = t.power ?? PIVOT;
        // 중심은 ★이 정하고, 해마다 ±0.06쯤 흔들린다
        const center = 0.5 + (star - PIVOT) * WIN_PCT_PER_STAR;
        const pct = Math.min(0.72, Math.max(0.28, center + (r1 - 0.5) * 0.12));

        const wins = Math.round(g * pct);
        const draws = r2 < 0.35 ? Math.round(r2 * 6) : 0; // 무승부는 가끔
        const losses = Math.max(0, g - wins - draws);
        // 득실 — 승률과 어긋나지 않게 만든다. 리그 평균 득점을 4.7로 본다
        const rf = Math.round(g * (4.7 + (pct - 0.5) * 2.2));
        const ra = Math.round(g * (4.7 - (pct - 0.5) * 2.2));
        rows.push({
          leagueId,
          teamId: t.id,
          groupLabel: "",
          teamName: t.name ?? t.id,
          wins,
          losses,
          draws,
          winPct: Math.round((wins / Math.max(1, wins + losses)) * 1000) / 1000,
          runsFor: rf,
          runsAgainst: ra,
          streak: "",
          last10: "",
        });
      }
    }
    if (rows.length > 0) out.set(year, rows);
  }
  return out;
}
