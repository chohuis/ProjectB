import type { MessageItem } from "../types/main";
import type { NpcSaveState } from "../types/save";

// ── 시즌 종료 요약 ────────────────────────────────────────────
export interface SeasonEndSummary {
  retiredCount: number;
  militaryEnlistedCount: number;
  militaryDischargedCount: number;
  faCount: number;
  univGraduatedCount: number;
}

// ── KBL 1군-2군 팜 매핑 ──────────────────────────────────────
export const KBL_FARM_MAP: Record<string, string> = {
  "PKT_Busan_GiantWhales":     "TEAM_KBL_GIANTWHALES_2",
  "PKT_Changwon_SteelDinos":   "TEAM_KBL_STEELDINOS_2",
  "PKT_Daegu_RoyalLions":      "TEAM_KBL_ROYALLIONS_2",
  "PKT_Daejeon_SoaringEagles": "TEAM_KBL_SOARINGEAGLES_2",
  "PKT_Gwangju_EmberTigers":   "TEAM_KBL_EMBERTIGERS_2",
  "PKT_Incheon_SkyGulls":      "TEAM_KBL_SKYGULLS_2",
  "PKT_Seoul_BearGuardians":   "TEAM_KBL_BEARGUARDIANS_2",
  "PKT_Seoul_TwinWolves":      "TEAM_KBL_TWINWOLVES_2",
};

// ── 리그별 로스터 규모 제한 ───────────────────────────────────
type RosterRule = { min: number; max: number };
export const ROSTER_RULES: Record<string, RosterRule> = {
  LEAGUE_HIGHSCHOOL:  { min: 18, max: 30 },
  LEAGUE_UNIVERSITY:  { min: 20, max: 40 },
  LEAGUE_INDEPENDENT: { min: 18, max: 45 },
  LEAGUE_KBL:         { min: 40, max: 65 },
  LEAGUE_ABL:         { min: 50, max: 90 },
};

// ── 스탯 범위 고정 ────────────────────────────────────────────
export function clampStat(v: number): number {
  return Math.max(1, Math.min(99, Math.round(v)));
}

// ── NPC OVR 파생 ─────────────────────────────────────────────
export function npcCoreOvr(npc: NpcSaveState): number {
  if (npc.playerType === "pitcher") return npc.pitching?.ovr ?? 0;
  return npc.batting?.ovr ?? 0;
}

// ── 나이에 따른 능력치 감퇴 ──────────────────────────────────
export function applyAgingDecay(npc: NpcSaveState): NpcSaveState {
  const age = npc.age;
  if (age < 30) return npc;
  const factor = age >= 33 ? 2 : 1;

  if (npc.playerType === "pitcher" && npc.pitching) {
    const p = npc.pitching;
    return {
      ...npc,
      pitching: {
        ...p,
        velocity: clampStat(p.velocity - 0.4 * factor),
        stamina:  clampStat(p.stamina  - 0.3 * factor),
        recovery: clampStat(p.recovery - 0.2 * factor),
        ovr:      clampStat(p.ovr      - 0.3 * factor),
      },
    };
  }
  if (npc.playerType === "batter" && npc.batting) {
    const b = npc.batting;
    return {
      ...npc,
      batting: {
        ...b,
        speed:    clampStat(b.speed    - 0.4 * factor),
        power:    clampStat(b.power    - 0.2 * factor),
        fielding: clampStat(b.fielding - 0.2 * factor),
        ovr:      clampStat(b.ovr      - 0.3 * factor),
      },
    };
  }
  return npc;
}

// ── 오프시즌 NPC 은퇴 판정 + 로스터 캡 정규화 ───────────────
export function normalizeOffseasonNpcs(
  npcs: NpcSaveState[],
  seasonYear: number,
  summary: SeasonEndSummary,
): { next: NpcSaveState[]; logs: string[] } {
  const logs: string[] = [];
  const next = npcs.map((n) => ({ ...n }));

  for (let i = 0; i < next.length; i++) {
    const npc = next[i];
    if (npc.careerStatus === "injured") {
      next[i] = { ...npc, careerStatus: "active" };
      continue;
    }
    if (npc.careerStatus !== "active") continue;
    if (npc.currentLeague === "LEAGUE_RETIRED") continue;
    if (npc.age < 35) continue;

    const ageOver = npc.age - 34;
    const ovr = npcCoreOvr(npc);
    const lowOvrPenalty = ovr < 55 ? (55 - ovr) * 0.01 : 0;
    const retireChance = Math.min(0.72, 0.06 * ageOver + lowOvrPenalty);
    if (Math.random() < retireChance) {
      next[i] = {
        ...npc,
        careerStatus: "retired",
        currentLeague: "LEAGUE_RETIRED",
        currentTeam: "",
        careerHistory: [
          ...npc.careerHistory,
          {
            year: seasonYear,
            leagueId: npc.currentLeague,
            teamId: npc.currentTeam,
            statLine: "retired",
            highlights: [],
          },
        ],
      };
      summary.retiredCount++;
      logs.push(`${npc.name} retired`);
    }
  }

  const byLeagueTeam = new Map<string, NpcSaveState[]>();
  for (const npc of next) {
    if (npc.careerStatus !== "active") continue;
    const key = `${npc.currentLeague}::${npc.currentTeam}`;
    const arr = byLeagueTeam.get(key) ?? [];
    arr.push(npc);
    byLeagueTeam.set(key, arr);
  }

  for (const [key, group] of byLeagueTeam.entries()) {
    const [leagueId] = key.split("::");
    const rule = ROSTER_RULES[leagueId];
    if (!rule) continue;

    if (group.length > rule.max) {
      const overflow = group.length - rule.max;
      const sorted = [...group].sort((a, b) => {
        const o = npcCoreOvr(a) - npcCoreOvr(b);
        return o !== 0 ? o : b.age - a.age;
      });
      const drop = new Set(sorted.slice(0, overflow).map((n) => n.npcId));
      for (let i = 0; i < next.length; i++) {
        const npc = next[i];
        if (!drop.has(npc.npcId)) continue;
        if (leagueId === "LEAGUE_KBL") {
          const farmId = KBL_FARM_MAP[npc.currentTeam];
          if (farmId) {
            next[i] = { ...npc, currentTeam: farmId };
            logs.push(`${npc.name} → 2군 강등`);
          } else {
            next[i] = { ...npc, currentLeague: "LEAGUE_INDEPENDENT", currentTeam: "" };
            logs.push(`${npc.name} → 독립리그`);
          }
        } else if (leagueId === "LEAGUE_ABL") {
          next[i] = { ...npc, currentLeague: "LEAGUE_INDEPENDENT", currentTeam: "" };
          logs.push(`${npc.name} → 독립리그 (ABL 로스터 초과)`);
        } else {
          next[i] = { ...npc, careerStatus: "retired", currentLeague: "LEAGUE_RETIRED", currentTeam: "" };
          summary.retiredCount++;
          logs.push(`${npc.name} 은퇴 (로스터 초과)`);
        }
      }
    } else if (group.length < rule.min) {
      logs.push(`${key} below min roster (${group.length}/${rule.min})`);
    }
  }

  return { next, logs };
}

// ── 오프시즌 전체 처리 (순수 함수) ───────────────────────────
export interface OffseasonResult {
  npcs: NpcSaveState[];
  pendingDraft: NpcSaveState[];
  summary: SeasonEndSummary;
  logs: string[];
  mailboxEntry: MessageItem | null;
}

export function runOffseasonProcessing(
  npcs: NpcSaveState[],
  pendingDraft: NpcSaveState[],
  seasonYear: number,
): OffseasonResult {
  const summary: SeasonEndSummary = {
    retiredCount: 0,
    militaryEnlistedCount: 0,
    militaryDischargedCount: 0,
    faCount: 0,
    univGraduatedCount: 0,
  };
  const newPendingDraft: NpcSaveState[] = [];

  const processed = npcs.map((npc): NpcSaveState => {
    if (npc.currentLeague === "LEAGUE_HIGHSCHOOL") return npc;

    let n: NpcSaveState = { ...npc };

    // 1. 군 전역
    if (
      n.careerStatus === "military" &&
      n.militaryDischargeYear != null &&
      n.militaryDischargeYear <= seasonYear
    ) {
      n = {
        ...n,
        careerStatus: "active",
        militaryStatus: "군필",
        currentLeague: "LEAGUE_INDEPENDENT",
        currentTeam: "",
      };
      summary.militaryDischargedCount++;
    }

    if (n.careerStatus === "retired" || n.currentLeague === "LEAGUE_RETIRED") return n;

    // 2. 나이 +1
    n = { ...n, age: n.age + 1 };

    if (n.currentLeague === "LEAGUE_DRAFT_POOL" || n.currentLeague === "LEAGUE_FREE_AGENT") return n;
    if (n.careerStatus !== "active") return n;

    // 3. 대학 학년 진급 + 졸업
    if (n.currentLeague === "LEAGUE_UNIVERSITY") {
      if (n.grade === 3) {
        const graduated: NpcSaveState = {
          ...n,
          grade: undefined,
          currentLeague: "LEAGUE_DRAFT_POOL",
          careerHistory: [
            ...n.careerHistory,
            { year: seasonYear, leagueId: "LEAGUE_UNIVERSITY", teamId: n.currentTeam, statLine: "-", highlights: [] },
          ],
        };
        newPendingDraft.push(graduated);
        summary.univGraduatedCount++;
        return graduated;
      } else if (n.grade != null && n.grade < 3) {
        n = { ...n, grade: (n.grade + 1) as 1 | 2 | 3 };
      }
      return n;
    }

    // 4. 능력치 에이징
    n = applyAgingDecay(n);

    // 5. 프로 연차 증가 + FA 판정
    if (n.currentLeague === "LEAGUE_KBL" || n.currentLeague === "LEAGUE_ABL") {
      n = { ...n, proServiceYears: (n.proServiceYears ?? 0) + 1 };
      if ((n.proServiceYears ?? 0) >= 9 && Math.random() < 0.6) {
        n = { ...n, currentLeague: "LEAGUE_FREE_AGENT", currentTeam: "" };
        summary.faCount++;
        return n;
      }
    }

    // 6. 군입대 판정
    if (n.militaryStatus === "미필") {
      const isKbl = n.currentLeague === "LEAGUE_KBL" || n.currentLeague === "LEAGUE_ABL";
      const enlistThreshold = isKbl ? 27 : 24;
      const enlistChance = isKbl ? 0.25 : 0.35;
      if (n.age >= enlistThreshold && Math.random() < enlistChance) {
        n = {
          ...n,
          careerStatus: "military",
          militaryStatus: "현역",
          militaryEnlistYear: seasonYear,
          militaryDischargeYear: seasonYear + 2,
          currentLeague: "LEAGUE_MILITARY",
          currentTeam: "",
        };
        summary.militaryEnlistedCount++;
        return n;
      }
    }

    return n;
  });

  // 7. 은퇴 판정 + 로스터 캡
  const { next, logs } = normalizeOffseasonNpcs(processed, seasonYear, summary);

  // 8. FA → KBL 1군 재배치
  const kblTeams = [...new Set(
    next
      .filter((n) => n.currentLeague === "LEAGUE_KBL" && !Object.values(KBL_FARM_MAP).includes(n.currentTeam))
      .map((n) => n.currentTeam),
  )];
  const resultNpcs = next.map((n): NpcSaveState => {
    if (n.currentLeague !== "LEAGUE_FREE_AGENT") return n;
    if (kblTeams.length > 0) {
      return { ...n, currentLeague: "LEAGUE_KBL", currentTeam: kblTeams[Math.floor(Math.random() * kblTeams.length)] };
    }
    return { ...n, currentLeague: "LEAGUE_INDEPENDENT", currentTeam: "" };
  });

  const mailboxEntry: MessageItem | null = logs.length > 0
    ? {
        id: `msg-offseason-${Date.now()}`,
        category: "news",
        sender: "연감",
        subject: "오프시즌 선수 동향",
        preview: logs[0],
        body: logs.join("\n"),
        createdAt: `Y${seasonYear}`,
        readAt: null,
      }
    : null;

  return {
    npcs: resultNpcs,
    pendingDraft: [...pendingDraft, ...newPendingDraft],
    summary,
    logs,
    mailboxEntry,
  };
}
