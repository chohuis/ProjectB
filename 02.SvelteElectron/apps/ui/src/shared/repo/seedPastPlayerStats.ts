// ── 세계 생성 시 과거 5년 개인 성적 (실플 ⑪) ──────────────────────
//
// 🔴 A5 때는 **팀 순위만** 만들었다(2026-08-24). 선수 개인은
//    "NPC 7,300명 × 5년이라 비싸다"고 미뤘는데, 실제로 플레이해 보니
//    선수 상세의 **연도별 성적이 늘 비어 있었다** — 세계가 어제 시작한 것처럼 보인다.
//
// **프로 1·2군만 만든다** (사용자 확정 2026-08-26).
//    · 화면에 뜨는 선수가 거의 다 이 층이다
//    · 고교 1학년은 5년 전에 야구를 안 했을 수 있어 **빈 칸이 생긴다**
//    · 약 2,500명 × 5년 ≈ 3.0MB
//
// ⚠ **능력치와 어긋나면 안 된다.** OVR 90이 5년 내내 ERA 6점대인 과거를 가지면
//   세계가 첫날부터 자기모순이다. `ovr`을 입력으로 쓴다.
// ⚠ **나이를 본다.** 5년 전에 열여덟이면 프로에 없었다 — 그 해는 안 만든다.
// ⚠ 씨앗을 쓴다 — 같은 세계는 같은 과거를 갖는다.
import { seedOf } from "../utils/seedOf";
import type { PlayerSeasonStats } from "../types/save";

/** 과거를 만들 리그 — 프로 1·2군 */
const PAST_LEAGUES = new Set([
  "LEAGUE_KBL", "LEAGUE_KBL_FARM",
  "LEAGUE_ABL", "LEAGUE_ABL_FARM",
  "LEAGUE_JBL", "LEAGUE_JBL_FARM",
]);

/** 2군은 1군보다 기회가 적다 — 경기 수에 곱한다 */
const FARM_PLAY_MULT = 0.7;

/** 프로 입단 최소 나이 — 그 전 해는 기록을 안 만든다 */
const MIN_PRO_AGE = 19;

export interface PastStatsInput {
  npcId: string;
  leagueId: string;
  teamId: string;
  age: number;
  ovr: number;
  playerType: "pitcher" | "batter";
}

export interface PastStatsRow {
  npcId: string;
  year: number;
  leagueId: string;
  teamId: string;
  statLine: string;
  stats: PlayerSeasonStats;
}

/** 0~1 난수 — 씨앗에서 결정적으로 낸다 */
function rand01(seed: number, salt: number): number {
  let x = (seed ^ (salt * 2654435761)) >>> 0;
  x = (x * 1664525 + 1013904223) >>> 0;
  return x / 4294967296;
}

/** 중심 ± 폭 안에서 하나 — 양 끝이 덜 나오게 두 번 섞는다 */
function around(center: number, spread: number, seed: number, salt: number): number {
  const a = rand01(seed, salt), b = rand01(seed, salt + 7919);
  return center + (a + b - 1) * spread;
}

/**
 * 한 선수의 과거 5년.
 *
 * ⚠ **해마다 흔들린다.** 같은 값 5줄이면 표가 복사본처럼 보인다.
 * ⚠ **그 시절엔 지금보다 못했다** — 나이가 어릴수록 OVR을 낮춰 잡는다.
 *   서른 넘은 선수는 반대로 그때가 전성기였을 수 있다.
 */
export function buildPastPlayerStats(
  players: readonly PastStatsInput[],
  worldSeed: number,
  seasonYear: number,
  years = 5,
): PastStatsRow[] {
  const out: PastStatsRow[] = [];
  for (const p of players) {
    if (!PAST_LEAGUES.has(p.leagueId)) continue;
    const isFarm = p.leagueId.endsWith("_FARM");
    for (let back = 1; back <= years; back++) {
      const year = seasonYear - back;
      const ageThen = p.age - back;
      if (ageThen < MIN_PRO_AGE) continue;   // 그때는 프로에 없었다

      // 그 시절 실력 — 스물다섯 전이면 아직 덜 자랐고, 서른 넘으면 이미 꺾이는 중이다
      const growth = ageThen < 25 ? -(25 - ageThen) * 1.2 : (ageThen > 31 ? (ageThen - 31) * 0.8 : 0);
      const seed = seedOf(worldSeed, p.npcId, String(year));
      const ovrThen = Math.max(40, Math.min(99, p.ovr + growth + around(0, 3, seed, 1)));

      out.push({
        npcId: p.npcId, year, leagueId: p.leagueId, teamId: p.teamId,
        ...(p.playerType === "pitcher"
          ? pitcherLine(ovrThen, isFarm, seed)
          : batterLine(ovrThen, isFarm, seed)),
      });
    }
  }
  return out;
}

/** OVR → 그해 투수 성적. 중심만 정하고 흔든다 */
function pitcherLine(ovr: number, isFarm: boolean, seed: number):
  { statLine: string; stats: PlayerSeasonStats } {
  const mult = isFarm ? FARM_PLAY_MULT : 1;
  // OVR 68이 ERA 4.50, 90이 3.00 근처가 되게 — 한 점당 약 0.068
  const era = Math.max(1.20, Math.min(9.99, around(4.50 - (ovr - 68) * 0.068, 1.1, seed, 2)));
  const g = Math.round(Math.max(4, around(26, 8, seed, 3) * mult));
  const gs = Math.round(g * (rand01(seed, 4) < 0.6 ? 0.9 : 0.1));
  const ip = Math.max(4, around(gs > g * 0.5 ? 150 : 60, 30, seed, 5) * mult);
  const er = Math.max(0, Math.round(era * ip / 9));
  const k = Math.round(ip * around(7.5 + (ovr - 68) * 0.06, 1.2, seed, 6) / 9);
  const bb = Math.round(ip * around(3.4 - (ovr - 68) * 0.02, 0.8, seed, 7) / 9);
  const h = Math.round(ip * around(9.2 - (ovr - 68) * 0.05, 1.0, seed, 8) / 9);
  const w = Math.max(0, Math.round(around(gs * 0.42 - (era - 4.5) * 1.5, 2.5, seed, 9)));
  const l = Math.max(0, Math.round(around(gs * 0.36 + (era - 4.5) * 1.5, 2.5, seed, 10)));
  const sv = gs > g * 0.5 ? 0 : Math.max(0, Math.round(around(6, 6, seed, 11)));
  const hd = gs > g * 0.5 ? 0 : Math.max(0, Math.round(around(8, 7, seed, 12)));
  const whip = ip > 0 ? Math.round(((bb + h) / ip) * 100) / 100 : 0;
  const stats: PlayerSeasonStats = {
    type: "pitcher", g, gs, w, l, sv, hd, ip, er, h, k, bb,
    era: Math.round(era * 100) / 100, whip,
  };
  return {
    statLine: `${w}승 ${l}패 ERA ${era.toFixed(2)} ${k}K`,
    stats,
  };
}

/** OVR → 그해 타자 성적 */
function batterLine(ovr: number, isFarm: boolean, seed: number):
  { statLine: string; stats: PlayerSeasonStats } {
  const mult = isFarm ? FARM_PLAY_MULT : 1;
  // OVR 68이 타율 .260, 90이 .310 근처 — 한 점당 약 0.0023
  const avg = Math.max(0.150, Math.min(0.400, around(0.260 + (ovr - 68) * 0.0023, 0.030, seed, 2)));
  const g = Math.round(Math.max(8, around(110, 25, seed, 3) * mult));
  const pa = Math.round(Math.max(20, g * around(3.9, 0.5, seed, 4)));
  const bb = Math.round(pa * around(0.085, 0.03, seed, 5));
  const ab = Math.max(1, pa - bb);
  const h = Math.round(ab * avg);
  const hr = Math.max(0, Math.round(around(8 + (ovr - 68) * 0.5, 6, seed, 6) * mult));
  const rbi = Math.max(0, Math.round(h * around(0.42, 0.1, seed, 7) + hr * 1.4));
  const sb = Math.max(0, Math.round(around(6, 6, seed, 8) * mult));
  const k = Math.round(pa * around(0.19, 0.05, seed, 9));
  const obp = Math.round(((h + bb) / pa) * 1000) / 1000;
  // 장타율 — 홈런이 많을수록 높다. 단타만 치면 타율과 같아진다
  const slg = Math.round((avg + hr * 2.2 / Math.max(ab, 1) + 0.09) * 1000) / 1000;
  const stats: PlayerSeasonStats = {
    type: "batter", g, pa, ab, h, hr, rbi, sb, bb, k,
    avg: Math.round(avg * 1000) / 1000, obp, slg,
    ops: Math.round((obp + slg) * 1000) / 1000,
  };
  return {
    statLine: `타율 ${avg.toFixed(3).replace(/^0/, "")} ${hr}홈런 ${rbi}타점`,
    stats,
  };
}
