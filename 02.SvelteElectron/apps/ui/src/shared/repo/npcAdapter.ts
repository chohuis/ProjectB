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
    // ⚠ **왕복에 안 실으면 사라진다.** 계급(`militaryRank`)이 정확히 그렇게
    // 없어진 전례가 있다 — 한 번 통과할 때마다 조용히 지워졌다
    militaryServedUnit: r.military?.servedUnit,
    militaryRank: r.military?.rank,
    originalLeagueId: r.military?.originalLeagueId,
    originalTeamId: r.military?.originalTeamId,
    developmentRate: r.developmentRate,
    potentialHidden: r.potentialHidden,
    proServiceYears: r.proServiceYears,
    // ⚠ **왕복에 안 실으면 사라진다.** 이게 없어지면 육성선수가 정식 등록
    // 선수가 된다 — 저장 한 번에 1군 등록 제한이 풀린다
    developmentSince: extra.developmentSince as number | undefined,
    // 재계약 판정의 비교 기준. 없으면 첫 판정에서 전원 재계약이 되고,
    // 그러면 2군 육성 몫이 안 열려 미지명자 유입이 다시 0이 된다
    developmentOvr: extra.developmentOvr as number | undefined,
    currentSalary: r.salary,
    contractYears: r.contractYears,
    injuryStatus: r.injury
      ? { severity: (r.injury.severity ?? "moderate") as InjurySeverity, recoveryWeeksLeft: r.injury.weeksLeft }
      : undefined,
    // 확장 필드 (extra 보존)
    // Named 여부는 npc 테이블 is_named가 정본이다. 구 세이브는 extra.emotionRole에
    // 들어 있었으므로(감정 시스템 시절) 있으면 그것도 Named로 읽는다.
    isNamed: r.isNamed || !!extra.emotionRole,
    fame: (extra.fame as number) ?? 0,
    achievements: (extra.achievements as string[]) ?? [],
    careerHistory: (extra.careerHistory as NpcSaveState["careerHistory"]) ?? [],
    careerEvents: extra.careerEvents as NpcSaveState["careerEvents"],
    personality: r.personality,
    // 읽기용 사본 — 정본은 npcLiveStats(주간 갱신)이며, 이 사본은 저장 시점마다
    // dehydrate가 liveStats에서 다시 채운다 (최대 1세이브 지연).
    // 레거시 읽기 경로(드래프트 보드·Rust 오프시즌 npc_core_ovr 등)가 이 필드를 참조한다.
    pitching: r.abilities.pitching,
    batting: r.abilities.batting,
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
    n.militaryUnit || n.militaryServedUnit || n.militaryEnlistYear || n.originalTeamId
      ? {
          unit: n.militaryUnit,
          servedUnit: n.militaryServedUnit,
          rank: n.militaryRank,
          enlistYear: n.militaryEnlistYear,
          dischargeYear: n.militaryDischargeYear,
          originalLeagueId: n.originalLeagueId,
          originalTeamId: n.originalTeamId,
        }
      : undefined;
  const extra: Record<string, unknown> = {};

  if (n.fame) extra.fame = n.fame;
  if (n.achievements?.length) extra.achievements = n.achievements;
  if (n.careerHistory?.length) extra.careerHistory = n.careerHistory;
  if (n.careerEvents?.length) extra.careerEvents = n.careerEvents;
  // 육성선수 신분 — 없으면 정식 등록 선수다. `0`은 연도로 안 쓰므로 truthy 검사면 족하다
  if (n.developmentSince) extra.developmentSince = n.developmentSince;
  if (n.developmentOvr) extra.developmentOvr = n.developmentOvr;
  if (live?.peakOvr !== undefined) extra.peakOvr = live.peakOvr;
  if (live?.pitchInTraining) extra.pitchInTraining = live.pitchInTraining;

  return {
    npcId: n.npcId,
    name: n.name,
    nameEn: n.nameEn,
    isNamed: !!n.isNamed,
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
    // 🔴 **안 변했으면 키 자체를 뺀다.** `personality`는 7,332명분을 매주
    // 보내는데 거의 안 변한다(연 1회 loyalty 감쇠 + FA 때뿐) — 페이로드의
    // **20.1%**가 늘 같은 값이었다.
    //
    // 저장 쪽이 "키 없음 = 기존 값 유지"를 안다(`slotdb.cjs` personalityKeep).
    // `null`은 여전히 **지우라**는 뜻이라 은퇴 처리가 그대로 산다.
    //
    // ⚠ **지운 적 있는 값을 되살리면 안 된다.** `personality`가 `null`이면
    // 키를 남겨서 지우기가 전달되게 한다 — `undefined`일 때만 뺀다.
    ...(personalityChanged(n) ? { personality: n.personality } : {}),
    injury,
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

/**
 * 직전에 보낸 `personality` — npcId → 직렬화 문자열.
 *
 * ⚠ **세션 안에서만 산다.** 앱을 다시 켜면 비어 있어 첫 저장 때 전원이
 * 한 번 실린다. 그게 맞다 — 저장된 값과 메모리가 같다고 **가정하면 안 된다**.
 */
const _lastPersonality = new Map<string, string>();

/** 직전에 보낸 것과 달라졌는가. `null`(지우기)은 늘 보낸다 */
function personalityChanged(n: { npcId: string; personality?: unknown }): boolean {
  if (n.personality === undefined) return false;   // 애초에 값이 없다
  if (n.personality === null) return true;          // 지우라는 뜻 — 반드시 전달한다
  const cur = JSON.stringify(n.personality);
  if (_lastPersonality.get(n.npcId) === cur) return false;
  _lastPersonality.set(n.npcId, cur);
  return true;
}

/** 슬롯을 바꾸거나 새 게임을 시작하면 비운다 — 다른 세계의 값을 물고 있으면 안 된다 */
export function resetPersonalityCache(): void {
  _lastPersonality.clear();
}

/** 저장: 스토어 상태 전체 → RepoNpc[] (syncNpcs 입력) */
export function dehydrateToRepo(
  npcs: NpcSaveState[],
  liveStats: Record<string, NpcLiveStat>,
): RepoNpc[] {
  return npcs.map((n) => saveStateToRepoNpc(n, liveStats[n.npcId]));
}
