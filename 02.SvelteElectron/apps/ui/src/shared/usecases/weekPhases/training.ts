import type { MessageItem } from "../../types/main";
import type { PitchingAttributes, ProtagonistSave } from "../../types/save";

// ── 코치 관련 헬퍼 ───────────────────────────────────────────
export function getPitchCoachName(teamId: string, entities: import("../../stores/master").EntityRow[]): string {
  const coach = entities.find(
    e => e.role === "coach" && e.teamId === teamId &&
         (e.details as import("../../stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  return coach?.name ?? "투수 코치";
}

// Rust xp_threshold(v) = 7.5 + v * 0.35 동일 공식
function xpThreshold(statVal: number): number { return 7.5 + statVal * 0.35; }
function xpPct(xp: number, statVal: number): number {
  return Math.min(99, Math.round(xp / xpThreshold(statVal) * 100));
}
function xpBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// 한글 2칸, 영문 1칸 기준으로 표시 너비 계산 후 패딩
function padLabel(s: string, width: number): string {
  let w = 0;
  for (const ch of s) { w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1; }
  return s + " ".repeat(Math.max(0, width - w));
}

const PITCH_STAT_LABELS: Record<string, [string, (p: PitchingAttributes) => number]> = {
  velocity:    ["구속",    p => p.velocity],
  command:     ["커맨드",  p => p.command],
  control:     ["제구",    p => p.control],
  movement:    ["무브먼트",p => p.movement],
  stamina:     ["스태미나",p => p.stamina],
  mentality:   ["멘탈",   p => p.mentality],
  recovery:    ["회복력",  p => p.recovery],
  clutch:      ["위기집중",p => p.clutch],
  holdRunners: ["견제력",  p => p.holdRunners],
};

export function makeTrainingMessage(
  week: number,
  logs: string[],
  protagonist: ProtagonistSave,
  coachName: string,
): MessageItem {
  const pit = protagonist.pitching;
  const xp  = protagonist.pitchingXP ?? {};

  const activeStats = Object.keys(PITCH_STAT_LABELS);

  const statsData: import("../../types/main").TrainingStat[] = activeStats.map(s => {
    const [label, getter] = PITCH_STAT_LABELS[s]!;
    const val = getter(pit);
    const acc = xp[s as keyof typeof xp] ?? 0;
    const pct = xpPct(acc, val);
    const leveledUp = logs.some(l => l.includes(`${label} +`));
    return { key: s, label, pct, current: val, leveledUp };
  });

  const extraLogs = logs.filter(l => !l.startsWith("[훈련]"));
  const leveledLabels = statsData.filter(s => s.leveledUp).map(s => `${s.label} +1`);
  const preview = leveledLabels.length > 0
    ? `★ ${leveledLabels.join(", ")} 레벨업!`
    : `훈련 완료 — 컨디션 ${protagonist.condition} / 사기 ${protagonist.morale}`;

  const metadata: import("../../types/main").TrainingMetadata = {
    type: "training",
    stats: statsData,
    condition: protagonist.condition,
    fatigue:   protagonist.fatigue,
    morale:    protagonist.morale,
    extraLogs,
  };

  return {
    id: `msg-train-w${week}-${Date.now()}`,
    category: "system",
    sender: coachName,
    subject: `W${week} 주간 훈련 결과`,
    preview,
    body: extraLogs.join("\n"),
    createdAt: `W${week}`,
    readAt: null,
    metadata,
  };
}
