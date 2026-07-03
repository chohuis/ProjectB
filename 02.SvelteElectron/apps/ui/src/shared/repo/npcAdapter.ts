// ── R3a-4: 전환기 어댑터 — RepoNpc(slot.db v3) ↔ NpcSaveState + NpcLiveStat ──
// gameStore.npcs / seasonStore.npcLiveStats 의 기존 읽기 표면을 유지하면서
// 저장소만 v3로 바꾸기 위한 유일한 변환 지점.
// 원칙: 능력치·XP의 정본은 npc 테이블(abilities/xp) — 로드 시 liveStats로 풀어내고,
//       저장(sync) 시 liveStats를 다시 접어 넣는다. 그 외 확장 필드는 extra에 보존.

import type { RepoNpc, RepoAbilities, RepoInjury } from "./slotRepo";
import type { NpcSaveState, InjurySeverity } from "../types/save";
import type { NpcLiveStat } from "../types/season";

// ── RepoNpc → NpcSaveState (스토어 읽기 표면) ─────────────────
export function repoNpcToSaveState(r: RepoNpc): NpcSaveState {
  const extra = (r.extra ?? {}) as Record<string, unknown>;
  const emotionPack = (r.emotion ?? {}) as {
    emotion?: NpcSaveState["emotion"];
    memories?: NpcSaveState["memories"];
    status?: NpcSaveState["emotionStatus"];
  };
  return {
    npcId: r.npcId,
    name: r.name,
    nameEn: r.nameEn,
    playerType: r.playerType,
    position: r.position,
    handedness: r.handedness,
    jerseyNumber: r.jerseyNumber,
    positionRatings: r.abilities.positionRatings,
    age: r.age,
    grade: r.grade as NpcSaveState["grade"],
    schoolId: r.schoolId,
    graduationYear: r.graduationYear,
    nationality: r.nationality as NpcSaveState["nationality"],
    careerStatus: r.careerStatus,
    currentLeague: r.currentLeague,
    currentTeam: r.currentTeam,
    militaryStatus: r.militaryStatus,
    militaryEnlistYear: r.military?.enlistYear,
    militaryDischargeYear: r.military?.dischargeYear,
    militaryUnit: r.military?.unit,
    originalLeagueId: r.military?.originalLeagueId,
    originalTeamId: r.military?.originalTeamId,
    developmentRate: r.developmentRate,
    potentialHidden: r.potentialHidden,
    proServiceYears: r.proServiceYears,
    currentSalary: r.salary,
    contractYears: r.contractYears,
    injuryStatus: r.injury
      ? { severity: (r.injury.severity ?? "moderate") as InjurySeverity, recoveryWeeksLeft: r.injury.weeksLeft }
      : undefined,
    // 확장 필드 (extra 보존)
    emotionRole: extra.emotionRole as NpcSaveState["emotionRole"],
    fame: (extra.fame as number) ?? 0,
    achievements: (extra.achievements as string[]) ?? [],
    careerHistory: (extra.careerHistory as NpcSaveState["careerHistory"]) ?? [],
    careerEvents: extra.careerEvents as NpcSaveState["careerEvents"],
    lastActiveStage: extra.lastActiveStage as NpcSaveState["lastActiveStage"],
    personality: r.personality,
    emotion: emotionPack.emotion,
    memories: emotionPack.memories,
    emotionStatus: emotionPack.status,
    // 능력치 deprecated 필드는 채우지 않는다 — 정본은 npcLiveStats (repoNpcToLiveStat)
  };
}

// ── RepoNpc → NpcLiveStat (능력치 읽기 표면) ──────────────────
export function repoNpcToLiveStat(r: RepoNpc): NpcLiveStat {
  return {
    pitching: r.abilities.pitching as NpcLiveStat["pitching"],
    batting: r.abilities.batting as NpcLiveStat["batting"],
    pitchingXp: r.xp.pitchingXp ?? {},
    battingXp: r.xp.battingXp ?? {},
    peakOvr: ((r.extra ?? {}) as { peakOvr?: number }).peakOvr,
    pitches: r.abilities.pitches,
    pitchInTraining: ((r.extra ?? {}) as { pitchInTraining?: NpcLiveStat["pitchInTraining"] }).pitchInTraining,
  };
}

/** 로드: RepoNpc[] → { npcs, liveStats } 한 번에 */
export function hydrateFromRepo(rows: RepoNpc[]): {
  npcs: NpcSaveState[];
  liveStats: Record<string, NpcLiveStat>;
} {
  const npcs: NpcSaveState[] = [];
  const liveStats: Record<string, NpcLiveStat> = {};
  for (const r of rows) {
    npcs.push(repoNpcToSaveState(r));
    liveStats[r.npcId] = repoNpcToLiveStat(r);
  }
  return { npcs, liveStats };
}

// ── NpcSaveState + NpcLiveStat → RepoNpc (sync 저장) ─────────
export function saveStateToRepoNpc(n: NpcSaveState, live?: NpcLiveStat): RepoNpc {
  const abilities: RepoAbilities = {
    pitching: live?.pitching ?? n.pitching,
    batting: live?.batting ?? n.batting,
    positionRatings: n.positionRatings,
    pitches: live?.pitches,
  };
  const injury: RepoInjury | undefined = n.injuryStatus
    ? { type: "", severity: n.injuryStatus.severity, weeksLeft: n.injuryStatus.recoveryWeeksLeft }
    : undefined;
  const military =
    n.militaryUnit || n.militaryEnlistYear || n.originalTeamId
      ? {
          unit: n.militaryUnit,
          enlistYear: n.militaryEnlistYear,
          dischargeYear: n.militaryDischargeYear,
          originalLeagueId: n.originalLeagueId,
          originalTeamId: n.originalTeamId,
        }
      : undefined;
  const extra: Record<string, unknown> = {};
  if (n.emotionRole) extra.emotionRole = n.emotionRole;
  if (n.fame) extra.fame = n.fame;
  if (n.achievements?.length) extra.achievements = n.achievements;
  if (n.careerHistory?.length) extra.careerHistory = n.careerHistory;
  if (n.careerEvents?.length) extra.careerEvents = n.careerEvents;
  if (n.lastActiveStage) extra.lastActiveStage = n.lastActiveStage;
  if (live?.peakOvr !== undefined) extra.peakOvr = live.peakOvr;
  if (live?.pitchInTraining) extra.pitchInTraining = live.pitchInTraining;

  return {
    npcId: n.npcId,
    name: n.name,
    nameEn: n.nameEn,
    isNamed: !!n.emotionRole || !!(n as unknown as { isNamed?: boolean }).isNamed,
    playerType: n.playerType,
    position: n.position,
    handedness: n.handedness ?? "R",
    jerseyNumber: n.jerseyNumber ?? 0,
    age: n.age,
    grade: n.grade,
    schoolId: n.schoolId ?? "",
    graduationYear: n.graduationYear ?? 0,
    nationality: n.nationality ?? "KOR",
    careerStatus: n.careerStatus,
    currentLeague: n.currentLeague,
    currentTeam: n.currentTeam,
    salary: n.currentSalary ?? 0,
    contractYears: n.contractYears ?? 0,
    proServiceYears: n.proServiceYears ?? 0,
    militaryStatus: n.militaryStatus,
    military,
    developmentRate: n.developmentRate,
    potentialHidden: n.potentialHidden ?? 75,
    abilities,
    xp: { pitchingXp: live?.pitchingXp ?? {}, battingXp: live?.battingXp ?? {} },
    personality: n.personality,
    emotion:
      n.emotion || n.memories || n.emotionStatus
        ? { emotion: n.emotion, memories: n.memories, status: n.emotionStatus }
        : undefined,
    injury,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

/** 저장: 스토어 상태 전체 → RepoNpc[] (syncNpcs 입력) */
export function dehydrateToRepo(
  npcs: NpcSaveState[],
  liveStats: Record<string, NpcLiveStat>,
): RepoNpc[] {
  return npcs.map((n) => saveStateToRepoNpc(n, liveStats[n.npcId]));
}
