import type {
  DraftPick,
  DraftSimResult,
  NamedNpcMeta,
  NpcSaveState,
  ProtagonistDraftOutcome,
} from "../types/save";

// ── KBL 드래프트 상수 (8팀 × 1군) ────────────────────────────
export const KBL_TEAM_IDS = [
  "TEAM_KBL_TWINWOLVES_1",
  "TEAM_KBL_BEARGUARDIANS_1",
  "TEAM_KBL_SKYGULLS_1",
  "TEAM_KBL_SOARINGEAGLES_1",
  "TEAM_KBL_ROYALLIONS_1",
  "TEAM_KBL_EMBERTIGERS_1",
  "TEAM_KBL_STEELDINOS_1",
  "TEAM_KBL_GIANTWHALES_1",
] as const;

export const DRAFT_ROUNDS = 10;

// ── 시드 랜덤 ─────────────────────────────────────────────────
function makeRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s ^= s >>> 16;
    return (s >>> 0) / 0xffffffff;
  };
}

function weightedPickIdx(weights: number[], rand: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

// ── 드래프트 점수 계산 ─────────────────────────────────────────
const POTENTIAL_BONUS: Record<string, number> = { S: 30, A: 20, B: 10, C: 0 };

export function calcDraftScore(npc: NpcSaveState, meta?: NamedNpcMeta): number {
  const ovr = npc.playerType === "pitcher"
    ? (npc.pitching?.ovr ?? 40)
    : (npc.batting?.ovr  ?? 40);
  const potBonus = meta ? (POTENTIAL_BONUS[meta.proPotentialTier] ?? 0) : 0;
  return ovr * 0.6 + (npc.developmentRate ?? 50) * 0.3 + potBonus * 0.1;
}

// ── NPC 드래프트 시뮬레이션 ───────────────────────────────────
export function runDraftSimulation(
  candidates: NpcSaveState[],
  namedMetas: NamedNpcMeta[],
  year: number,
  rounds: number = DRAFT_ROUNDS,
  teamIds: readonly string[] = KBL_TEAM_IDS,
): DraftSimResult {
  const metaMap = new Map(namedMetas.map(m => [m.npcId, m]));
  const pool    = candidates.filter(n => n.currentLeague === "LEAGUE_DRAFT_POOL");
  const rand    = makeRand(year * 1337 + pool.length * 7);

  const picks: DraftPick[] = [];
  const remaining = [...pool];

  for (let r = 1; r <= rounds && remaining.length > 0; r++) {
    for (let t = 0; t < teamIds.length && remaining.length > 0; t++) {
      const pickNum = (r - 1) * teamIds.length + t + 1;
      // 라운드가 높아질수록 노이즈 증가 → 후반 픽은 덜 예측 가능
      const scores = remaining.map(n => {
        const base  = calcDraftScore(n, metaMap.get(n.npcId));
        const noise = (rand() - 0.5) * (r * 8);
        return Math.max(0.1, base + noise);
      });
      const idx = weightedPickIdx(scores, rand);
      picks.push({ round: r, pick: pickNum, teamId: teamIds[t], npcId: remaining[idx].npcId });
      remaining.splice(idx, 1);
    }
  }

  return { year, picks, undraftedIds: remaining.map(n => n.npcId) };
}

// ── 드래프트 결과 → NpcSaveState 반영 ────────────────────────
export function applyDraftToNpcs(
  npcs: NpcSaveState[],
  result: DraftSimResult,
): NpcSaveState[] {
  const pickMap     = new Map(result.picks.map(p => [p.npcId, p]));
  const undraftedSet = new Set(result.undraftedIds);

  return npcs.map(npc => {
    if (npc.currentLeague !== "LEAGUE_DRAFT_POOL") return npc;

    const pick = pickMap.get(npc.npcId);
    if (pick) {
      return {
        ...npc,
        currentLeague: "LEAGUE_KBL",
        currentTeam:   pick.teamId,
        careerHistory: [
          ...npc.careerHistory,
          {
            year:      result.year,
            leagueId:  "LEAGUE_DRAFT",
            teamId:    pick.teamId,
            statLine:  `드래프트 ${pick.round}라운드 ${pick.pick}번 지명`,
            highlights: [`${pick.round}라운드 지명`],
          },
        ],
      };
    }

    if (undraftedSet.has(npc.npcId)) {
      const baseOvr = npc.playerType === "pitcher"
        ? (npc.pitching?.ovr ?? 0)
        : (npc.batting?.ovr  ?? 0);
      const goIndependent = baseOvr >= 45;
      return {
        ...npc,
        currentLeague: goIndependent ? "LEAGUE_INDEPENDENT" : "LEAGUE_RETIRED",
        currentTeam:   "",
        careerStatus:  goIndependent ? "active" : "retired",
        careerHistory: [
          ...npc.careerHistory,
          {
            year:      result.year,
            leagueId:  "LEAGUE_DRAFT",
            teamId:    "",
            statLine:  goIndependent ? "미지명 → 독립리그" : "미지명 → 은퇴",
            highlights: [],
          },
        ],
      };
    }

    return npc;
  });
}

// ── 주인공 드래프트 결과 결정 ─────────────────────────────────
export function determineProtagonistDraft(
  scoutScore: number,
  pitchingOvr: number,
  year: number,
  teamIds: readonly string[] = KBL_TEAM_IDS,
): ProtagonistDraftOutcome {
  const score = scoutScore * 0.6 + pitchingOvr * 0.4;

  let round: number;
  if      (score >= 82) round = 1;
  else if (score >= 68) round = 2;
  else if (score >= 55) round = 3;
  else if (score >= 44) round = Math.ceil(4 + (55 - score) / 5);
  else if (score >= 30) round = 9;
  else                  return { drafted: false };

  round = Math.min(round, DRAFT_ROUNDS);

  const rand   = makeRand(year * 997 + Math.round(score) * 13);
  const teamId = teamIds[Math.floor(rand() * teamIds.length)];
  const pick   = (round - 1) * teamIds.length + Math.floor(rand() * teamIds.length) + 1;

  return { drafted: true, round, pick, teamId };
}

// ── 미지명 주인공 재도전 가능 여부 ───────────────────────────
export function canRetryDraft(faUnsignedWeeks: number): boolean {
  return faUnsignedWeeks === 0; // 첫 번째 미지명만 재도전 허용
}
