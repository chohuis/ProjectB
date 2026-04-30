import type { AchievementRuntime, AchievementMetrics } from "../types/save";
import type { Standing, ScheduleEntry } from "../types/season";
import type { MessageItem } from "../types/main";

export interface MasterAchievement {
  id: string;
  title: string;
  category: string;
  status: "active" | "provisional" | "blocked";
  metricKey: string;
  targetValue: number;
  hidden?: boolean;
  reward?: string;
}

// ── 스토어 데이터에서 메트릭 딕셔너리 계산 ──────────────────────
export function computeMetrics(
  achMetrics: AchievementMetrics,
  mailbox: MessageItem[],
  standings: Standing[],
  schedule: ScheduleEntry[],
  myTeamId: string,
): Record<string, number> {
  const teamRow = standings.find((s) => s.teamId === myTeamId);
  return {
    strikeoutTotal:    achMetrics.strikeoutTotal,
    saveTotal:         achMetrics.saveTotal,
    kakaoFirstContact: achMetrics.kakaoFirstContact ? 1 : 0,
    winsTotal:         teamRow?.wins ?? 0,
    gamesPlayedTotal:  schedule.filter((e) => e.isProtagonistGame && !!e.result).length,
    messagesReadTotal: mailbox.filter((m) => m.readAt !== null).length,
  };
}

export interface AchievementCheckResult {
  newlyUnlocked: string[];
  updatedRuntime: AchievementRuntime[];
}

// ── 달성 조건 체크 + 런타임 업데이트 ──────────────────────────
export function checkAchievements(
  masterAchs: MasterAchievement[],
  runtime: AchievementRuntime[],
  metrics: Record<string, number>,
  weekLabel: string,
): AchievementCheckResult {
  const runtimeMap = new Map(runtime.map((r) => [r.id, { ...r }]));

  // masterAchs에 없는 런타임 항목도 보존
  const newlyUnlocked: string[] = [];

  for (const def of masterAchs) {
    if (def.status !== "active") continue;

    const current = metrics[def.metricKey] ?? 0;
    const existing = runtimeMap.get(def.id);

    if (existing?.unlockedAt) {
      // 이미 달성 — progress만 최신화
      runtimeMap.set(def.id, { ...existing, progress: Math.max(existing.progress, current) });
      continue;
    }

    if (current >= def.targetValue) {
      newlyUnlocked.push(def.id);
      runtimeMap.set(def.id, {
        id:         def.id,
        progress:   current,
        unlockedAt: weekLabel,
        claimedAt:  null,
      });
    } else {
      // 진행 중 — progress 업데이트
      const prev = existing ?? { id: def.id, progress: 0, unlockedAt: null, claimedAt: null };
      if (current > prev.progress) {
        runtimeMap.set(def.id, { ...prev, progress: current });
      } else if (!existing) {
        runtimeMap.set(def.id, prev);
      }
    }
  }

  return {
    newlyUnlocked,
    updatedRuntime: Array.from(runtimeMap.values()),
  };
}
