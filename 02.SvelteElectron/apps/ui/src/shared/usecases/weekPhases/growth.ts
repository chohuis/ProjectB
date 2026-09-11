import { prevMonthRange } from "../../utils/seasonCalendar";
import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { getLeagueRadius } from "../../utils/radiusGate";
import { seedOf } from "../../utils/seedOf";
import { slotRepo } from "../../repo/slotRepo";
import {
  facilityTierOf,
  facilityFactorOf,
  loadFacilityFactors,
  loadGrowthXpRules,
  growthXpRules,
} from "../../utils/ids";
import { staffStatsOf, factorOf } from "../../utils/staffEffects";
import { primeForeignRules } from "../../utils/foreignSlots";
import { loadRosterRules } from "../../repo/newGameV3";
import type { CareerStage } from "../../types/save";

// ── NPC 월간 성장 헬퍼 ────────────────────────────────────────

// 표는 `utils/seasonCalendar`가 정본이다 — 예전엔 여기 사본이 있었다.
// `MONTH_STARTS_1`을 밖에서 쓰는 곳이 있어 다시 내보낸다
export { MONTH_STARTS_1 } from "../../utils/seasonCalendar";
const getPrevMonthRange = prevMonthRange;

// 이전 달 경기 결과에서 NPC별 ERA/AVG 집계
function aggregateMonthlyPerf(
  schedule: import("../../types/season").ScheduleEntry[],
  startWeek: number,
  endWeek: number,
): Record<string, { gamesPlayed: number; era?: number; battingAvg?: number }> {
  const pitcherStats: Record<string, { er: number; ip: number }> = {};
  const batterStats: Record<string, { h: number; ab: number }> = {};

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
    result[id] = {
      gamesPlayed: 1,
      era: st.ip > 0 ? Math.round(((st.er * 9) / st.ip) * 100) / 100 : undefined,
    };
  }
  for (const [id, st] of Object.entries(batterStats)) {
    result[id] = {
      gamesPlayed: 1,
      battingAvg: st.ab > 0 ? Math.round((st.h / st.ab) * 1000) / 1000 : undefined,
    };
  }
  return result;
}

// 모든 선수 NPC 주간 성장 처리 (매주 실행)
export async function processWeeklyNpcGrowth(
  weekNum: number,
  careerStage: CareerStage,
): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  const currentPhase = s.schedule.find((e) => e.week === weekNum)?.phase ?? "offseason";

  // 팀 컨텍스트 — 시설·감독·코치가 NPC 성장 속도를 정한다.
  //
  // 고친 것 둘:
  //  1. `t.tier`는 국내 팀에 없는 필드라 182팀 전부 "독립"(0.78)으로 떨어졌었다.
  //     리그에서 파생한다 (`facilityTierOf`)
  //  2. `manager.stats.development`는 존재하지 않는 키라 항상 50이었다.
  //     감독이 성장에 기여하는 축은 `motivator`다 (staff_rules.json 정본 5종)
  // 성장 계수는 규칙 파일이 정본이다 — 한 번 읽고 캐시한다
  await loadFacilityFactors();
  await loadGrowthXpRules();
  // 외국인 보유 한도표도 같은 파일이다 — 승강·방출·교체가 동기적으로 읽는다
  primeForeignRules(await loadRosterRules());

  const teamContexts = m.teams.map((t) => {
    const staff = staffStatsOf(t.id, m.entities);
    return {
      teamId: t.id,
      facilityTier: facilityTierOf(t.leagueId),
      // 성장 계수의 정본은 규칙 파일이다 — Rust의 표는 폴백일 뿐이다
      facilityFactor: facilityFactorOf(facilityTierOf(t.leagueId)),
      managerDevelopment: staff.motivator,
      // 시설 투자에 적극적인 구단주면 코치 지도력이 더 먹힌다
      coachTeaching: staff.teaching * factorOf("facilityInvestment", staff.facilityInvestment),
    };
  });

  // 최근 4주 성적 집계 (1주 창은 미등판 선수를 누락시켜 성장 방향 왜곡) — 반경 1(실제 경기)
  const prevWeek = weekNum - 1;
  const perfStartWeek = Math.max(1, prevWeek - 3);
  const allSchedule = [
    ...s.schedule.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek),
    ...Object.values(s.leagueSchedules).flatMap((sched) =>
      sched.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek),
    ),
  ];
  const perfData = aggregateMonthlyPerf(allSchedule, perfStartWeek, prevWeek);

  const namedFameMap = new Map(g.npcs.map((n) => [n.npcId, n.fame ?? 0]));

  // 반경 2/3 리그의 Named NPC — 합성 주간 성적으로 perfData 보강 (R3b, DESIGN.md §4.2)
  const syntheticCandidates: { npcId: string; ovr: number; playerType: string }[] = [];
  for (const e of m.entities) {
    if (e.role !== "player" || !get(npcLiveStatsStore)[e.id]) continue;
    if (!namedFameMap.has(e.id)) continue; // Named만 합성 대상
    if (getLeagueRadius(careerStage, e.leagueId ?? "") === 1) continue; // 실제 경기로 이미 처리됨
    if (perfData[e.id]) continue; // 이번 주 이미 실데이터 있음(예외 케이스 방어)
    const live = get(npcLiveStatsStore)[e.id];
    const p = (e.details as import("../../stores/master").EntityDetails)?.player;
    const ovr =
      live?.pitching?.ovr ?? live?.batting?.ovr ?? p?.pitching?.ovr ?? p?.batting?.ovr ?? 50;
    syntheticCandidates.push({ npcId: e.id, ovr, playerType: p?.playerType ?? "pitcher" });
  }

  if (syntheticCandidates.length > 0) {
    const meta = await slotRepo.getMeta(g.currentSlotId ?? "");
    const worldSeed = Number(meta.world_seed ?? 0) >>> 0;
    const raw = await window.projectB!.engine(
      "syntheticWeeklyPerfNative",
      JSON.stringify({
        worldSeed,
        seasonYear: s.seasonYear,
        week: weekNum,
        npcs: syntheticCandidates,
      }),
    );
    const synth = JSON.parse(raw) as {
      results?: Array<{ npcId: string; missed: boolean; era?: number; battingAvg?: number }>;
    };
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
      // ⚠ **드리프트 리그(반경 2)도 성장시킨다.** 예전엔 반경 1만 성장해서
      // 해외 리그가 순위표만 돌고 선수는 그대로 있었다. 몇 시즌 뒤 주인공이
      // 진출하면 그동안 국내만 자란 만큼 **리그 수준이 어긋난다.**
      // 경기는 여전히 안 돌리므로 성적이 없고, `noPerfBase`로 자란다 —
      // 국내 배경 NPC와 같은 경로다(주간 Rust 호출 1회라 비용도 그만큼이다).
      return getLeagueRadius(careerStage, e.leagueId ?? "") <= 2;
    })
    .map((e) => {
      const live = get(npcLiveStatsStore)[e.id];
      const p = (e.details as import("../../stores/master").EntityDetails)?.player;
      return {
        npcId: e.id,
        teamId: e.teamId,
        playerType: p?.playerType ?? "pitcher",
        age: e.age,
        developmentRate: p?.developmentRate ?? 50,
        potentialHidden: p?.potentialHidden ?? 75,
        pitching: live?.pitching ?? p?.pitching,
        batting: live?.batting ?? p?.batting,
        pitchingXp: live?.pitchingXp ?? {},
        battingXp: live?.battingXp ?? {},
        peakOvr: live?.peakOvr,
        currentFame: namedFameMap.get(e.id) ?? 0,
        pitches: live?.pitches ?? p?.pitches ?? [],
        pitcherRole: p?.position ?? "",
        pitchInTraining: live?.pitchInTraining,
        // 노화 누적분 — 안 넘기면 매주 0에서 시작해 노화가 영영 안 걸린다
        agingDebt: live?.agingDebt ?? {},
      };
    });

  if (npcs.length === 0) return;

  const result = JSON.parse(
    await window.projectB!.npcCalcWeeklyGrowth(
      JSON.stringify({
        npcs,
        teamContexts,
        perfData,
        currentPhase,
        monthIndex: 0, // 주간 모드에서는 사용 안 함
        // ⚠ **씨앗을 넘긴다.** 성장이 능력치를 만들고 능력치가 성적을
        //   만든다 — 안 넘기면 같은 세이브도 실행마다 다른 리그가 된다.
        seed: seedOf(s.worldSeed ?? 0, s.seasonYear, weekNum, "npc-growth"),
        pitchCatalogIds: m.pitchCatalog.map((p) => p.id),
        // 성장 속도 정본은 규칙 파일이다 — Rust의 표는 폴백일 뿐이다
        xpRules: growthXpRules(),
      }),
    ),
  ) as {
    updated?: Array<{
      npcId: string;
      pitching?: any;
      batting?: any;
      pitchingXp: Record<string, number>;
      battingXp: Record<string, number>;
      peakOvr: number;
      fameDelta: number;
      pitches: Array<{ id: string; grade: 1 | 2 | 3 | 4 | 5 }>;
      pitchInTraining?: { id: string; progress: number; isNew: boolean };
    }>;
    error?: string;
  };

  if (!Array.isArray(result.updated)) {
    console.error("[processWeeklyNpcGrowth] npcCalcWeeklyGrowth 실패:", result.error ?? result);
    return;
  }

  seasonStore.applyNpcLiveGrowth(result.updated);

  // fame 업데이트
  const fameDeltas = result.updated.filter((u) => u.fameDelta !== 0 && namedFameMap.has(u.npcId));
  if (fameDeltas.length > 0) {
    const updatedNpcs = get(gameStore).npcs.map((n) => {
      const delta = fameDeltas.find((u) => u.npcId === n.npcId)?.fameDelta ?? 0;
      if (delta === 0) return n;
      return { ...n, fame: Math.max(0, Math.min(100, (n.fame ?? 0) + delta)) };
    });
    gameStore.updateNpcs(updatedNpcs);
  }
}
