import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";

// ── NPC 월간 성장 헬퍼 ────────────────────────────────────────

// MONTH_STARTS_1 기준 이전 달 주차 범위 반환
export const MONTH_STARTS_1 = [1, 6, 10, 14, 19, 23, 27, 32, 36, 40, 45, 49];
function getPrevMonthRange(weekInYear: number): { start: number; end: number } {
  const idx = MONTH_STARTS_1.findIndex((w) => w === weekInYear);
  if (idx <= 0) return { start: 1, end: weekInYear - 1 };
  const start = MONTH_STARTS_1[idx - 1];
  const end   = weekInYear - 1;
  return { start, end };
}

// 이전 달 경기 결과에서 NPC별 ERA/AVG 집계
function aggregateMonthlyPerf(
  schedule: import("../../types/season").ScheduleEntry[],
  startWeek: number,
  endWeek: number,
): Record<string, { gamesPlayed: number; era?: number; battingAvg?: number }> {
  const pitcherStats: Record<string, { er: number; ip: number }> = {};
  const batterStats:  Record<string, { h: number; ab: number }> = {};

  for (const entry of schedule) {
    if (!entry.result || entry.week < startWeek || entry.week > endWeek) continue;
    for (const line of entry.result.playerLines) {
      if (line.role === "pitcher") {
        const p = pitcherStats[line.playerId] ?? { er: 0, ip: 0 };
        pitcherStats[line.playerId] = { er: p.er + line.er, ip: p.ip + line.ip };
      } else {
        const b = batterStats[line.playerId] ?? { h: 0, ab: 0 };
        batterStats[line.playerId] = { h: b.h + line.h, ab: b.ab + line.ab };
      }
    }
  }

  const result: Record<string, { gamesPlayed: number; era?: number; battingAvg?: number }> = {};
  for (const [id, st] of Object.entries(pitcherStats)) {
    result[id] = { gamesPlayed: 1, era: st.ip > 0 ? Math.round((st.er * 9) / st.ip * 100) / 100 : undefined };
  }
  for (const [id, st] of Object.entries(batterStats)) {
    result[id] = { gamesPlayed: 1, battingAvg: st.ab > 0 ? Math.round((st.h / st.ab) * 1000) / 1000 : undefined };
  }
  return result;
}

// 모든 선수 NPC 주간 성장 처리 (매주 실행)
export async function processWeeklyNpcGrowth(weekNum: number): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  const currentPhase = s.schedule.find((e) => e.week === weekNum)?.phase ?? "offseason";

  // 팀 컨텍스트 — 코치/감독 능력치 반영
  const teamContexts = m.teams.map((t) => {
    const mgr   = m.entities.find((e) => e.role === "manager" && e.teamId === t.id);
    const coach = m.entities.find((e) => e.role === "coach"   && e.teamId === t.id);
    return {
      teamId: t.id,
      facilityTier: t.tier ?? "독립",
      managerDevelopment: (mgr?.details as any)?.manager?.stats?.development ?? 50,
      coachTeaching:      (coach?.details as any)?.coach?.stats?.teaching    ?? 50,
    };
  });

  // 최근 4주 성적 집계 (1주 창은 미등판 선수를 누락시켜 성장 방향 왜곡)
  const prevWeek = weekNum - 1;
  const perfStartWeek = Math.max(1, prevWeek - 3);
  const allSchedule = [
    ...s.schedule.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek),
    ...Object.values(s.leagueSchedules).flatMap((sched) =>
      sched.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek)
    ),
  ];
  const perfData = aggregateMonthlyPerf(allSchedule, perfStartWeek, prevWeek);

  // npcLiveStats에 있는 모든 NPC (master entity 기반)
  const namedFameMap = new Map(g.npcs.map(n => [n.npcId, n.fame ?? 0]));
  const npcs = m.entities
    .filter((e) => e.role === "player" && get(npcLiveStatsStore)[e.id])
    .map((e) => {
      const live = get(npcLiveStatsStore)[e.id];
      const p    = (e.details as import("../../stores/master").EntityDetails)?.player;
      return {
        npcId:           e.id,
        teamId:          e.teamId,
        playerType:      p?.playerType ?? "pitcher",
        age:             e.age,
        developmentRate: p?.developmentRate ?? 50,
        potentialHidden: p?.potentialHidden ?? 75,
        pitching:        live?.pitching ?? p?.pitching,
        batting:         live?.batting  ?? p?.batting,
        pitchingXp:      live?.pitchingXp ?? {},
        battingXp:       live?.battingXp  ?? {},
        peakOvr:         live?.peakOvr,
        currentFame:     namedFameMap.get(e.id) ?? 0,
        pitches:         live?.pitches ?? p?.pitches ?? [],
        pitcherRole:     p?.position ?? "",
        pitchInTraining: live?.pitchInTraining,
      };
    });

  if (npcs.length === 0) return;

  const result = JSON.parse(
    await window.projectB!.npcCalcWeeklyGrowth(JSON.stringify({
      npcs,
      teamContexts,
      perfData,
      currentPhase,
      monthIndex: 0,  // 주간 모드에서는 사용 안 함
      pitchCatalogIds: m.pitchCatalog.map((p) => p.id),
    }))
  ) as { updated?: Array<{
    npcId: string;
    pitching?: any;
    batting?: any;
    pitchingXp: Record<string, number>;
    battingXp: Record<string, number>;
    peakOvr: number;
    fameDelta: number;
    pitches: Array<{ id: string; grade: 1 | 2 | 3 | 4 | 5 }>;
    pitchInTraining?: { id: string; progress: number; isNew: boolean };
  }>; error?: string };

  if (!Array.isArray(result.updated)) {
    console.error('[processWeeklyNpcGrowth] npcCalcWeeklyGrowth 실패:', result.error ?? result);
    return;
  }

  seasonStore.applyNpcLiveGrowth(result.updated);

  // fame 업데이트
  const fameDeltas = result.updated.filter(u => u.fameDelta !== 0 && namedFameMap.has(u.npcId));
  if (fameDeltas.length > 0) {
    const updatedNpcs = get(gameStore).npcs.map(n => {
      const delta = fameDeltas.find(u => u.npcId === n.npcId)?.fameDelta ?? 0;
      if (delta === 0) return n;
      return { ...n, fame: Math.max(0, Math.min(100, (n.fame ?? 0) + delta)) };
    });
    gameStore.updateNpcs(updatedNpcs);
  }
}
