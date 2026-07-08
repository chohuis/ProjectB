import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { getLeagueRadius } from "../../utils/radiusGate";
import { slotRepo } from "../../repo/slotRepo";
import type { CareerStage } from "../../types/save";

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
export async function processWeeklyNpcGrowth(weekNum: number, careerStage: CareerStage): Promise<void> {
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

  // 최근 4주 성적 집계 (1주 창은 미등판 선수를 누락시켜 성장 방향 왜곡) — 반경 1(실제 경기)
  const prevWeek = weekNum - 1;
  const perfStartWeek = Math.max(1, prevWeek - 3);
  const allSchedule = [
    ...s.schedule.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek),
    ...Object.values(s.leagueSchedules).flatMap((sched) =>
      sched.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek)
    ),
  ];
  const perfData = aggregateMonthlyPerf(allSchedule, perfStartWeek, prevWeek);

  const namedFameMap = new Map(g.npcs.map(n => [n.npcId, n.fame ?? 0]));

  // 반경 2/3 리그의 Named NPC — 합성 주간 성적으로 perfData 보강 (R3b, DESIGN.md §4.2)
  const syntheticCandidates: { npcId: string; ovr: number; playerType: string }[] = [];
  for (const e of m.entities) {
    if (e.role !== "player" || !get(npcLiveStatsStore)[e.id]) continue;
    if (!namedFameMap.has(e.id)) continue; // Named만 합성 대상
    if (getLeagueRadius(careerStage, e.leagueId ?? "") === 1) continue; // 실제 경기로 이미 처리됨
    if (perfData[e.id]) continue; // 이번 주 이미 실데이터 있음(예외 케이스 방어)
    const live = get(npcLiveStatsStore)[e.id];
    const p    = (e.details as import("../../stores/master").EntityDetails)?.player;
    const ovr  = live?.pitching?.ovr ?? live?.batting?.ovr ?? p?.pitching?.ovr ?? p?.batting?.ovr ?? 50;
    syntheticCandidates.push({ npcId: e.id, ovr, playerType: p?.playerType ?? "pitcher" });
  }

  if (syntheticCandidates.length > 0) {
    const meta = await slotRepo.getMeta(g.currentSlotId ?? "");
    const worldSeed = Number(meta.world_seed ?? 0) >>> 0;
    const raw = await window.projectB!.engine("syntheticWeeklyPerfNative", JSON.stringify({
      worldSeed, seasonYear: s.seasonYear, week: weekNum, npcs: syntheticCandidates,
    }));
    const synth = JSON.parse(raw) as { results?: Array<{ npcId: string; missed: boolean; era?: number; battingAvg?: number }> };
    if (Array.isArray(synth.results)) {
      for (const r of synth.results) {
        if (r.missed) continue; // 결장 구간 — 합성 부상, perfData 미생성
        perfData[r.npcId] = { gamesPlayed: 1, era: r.era, battingAvg: r.battingAvg };
      }
    }
  }

  // npcLiveStats에 있는 모든 NPC 중, 배경(비-Named)은 반경 1(주인공 리그)만 주간 처리 (§4.2 표)
  const npcs = m.entities
    .filter((e) => {
      if (e.role !== "player" || !get(npcLiveStatsStore)[e.id]) return false;
      if (namedFameMap.has(e.id)) return true;
      return getLeagueRadius(careerStage, e.leagueId ?? "") === 1;
    })
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
