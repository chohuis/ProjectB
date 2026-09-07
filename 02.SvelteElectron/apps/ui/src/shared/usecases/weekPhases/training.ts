import type { MessageItem } from "../../types/main";
import type { PitchingAttributes, ProtagonistSave } from "../../types/save";
import {
  reportStageOf, trainingBody, type BankPicker, type ReportCopy, type ReportOutcome,
} from "../../utils/reportCopy";

// ── 그 주 훈련이 기대 대비 어땠나 ─────────────────────────────
//
// 🔴 **문안이 못 정한다.** 「잘 됐다 / 평소만큼 / 못 했다」는 그 주 XP 가
//   기대 대비 어땠는지가 정하는데, 기대치는 컨디션·피로·성실·효율 보정이
//   만든다 — 전부 Rust 안이다. 그래서 엔진이 `xpRatio`(기준 1.0)를 보내고
//   여기서 문턱만 긋는다. 계수를 여기서 다시 곱하면 결정 ④ 가 지운 사본이다.
//
// ⚠ **레벨업은 그 자체로 good 이다.** 능력치가 실제로 올라온 주에 「평소와
//   같은 한 주였습니다」가 붙으면 화면이 스스로를 부정한다 — 비율이 낮아도
//   (문턱을 넘긴 XP 가 마침 그 주에 찼을 수 있다) 눈에 보이는 결과가 이긴다.
//
// 문턱 근거: `xpRatio` 는 컨디션 100·피로 0·성실 49.5 에서 1.0 이다. 실제
// 플레이는 컨디션 70~90 · 피로 30~60 · 성실 80 대라 **중앙이 1.0 보다 위**다
// (성실 계수만 1.25 를 넘긴다). 그래서 good 을 1.15 로, poor 를 0.90 으로
// 비대칭으로 긋는다 — 1.0 대칭이면 poor 가 거의 안 나온다.
// 값 조정은 `BALANCE_BACKLOG §문안`.
const OUTCOME_GOOD = 1.15;
const OUTCOME_POOR = 0.90;

export function trainingOutcomeOf(xpRatio: number, leveledUp: boolean): ReportOutcome {
  if (leveledUp) return "good";
  if (!Number.isFinite(xpRatio)) return "normal";
  if (xpRatio >= OUTCOME_GOOD) return "good";
  if (xpRatio <= OUTCOME_POOR) return "poor";
  return "normal";
}

// ── 코치 관련 헬퍼 ───────────────────────────────────────────
//
// 전문 영역 비교가 **한 군데에만** 있어야 한다. 예전엔 이 비교가 3곳에 흩어져
// 있었고 셋 다 영문 `"pitching"`과 비교했는데 데이터는 한국어 `"투수"`였다 —
// 전부 조용히 실패했다. 정본은 staff_rules.toml [[coach.specialties]]다.
export function findTeamCoach(
  teamId: string,
  specialty: import("../../types/save").CoachSpecialty,
  entities: import("../../stores/master").EntityRow[],
): import("../../stores/master").EntityRow | undefined {
  return entities.find(
    e => e.role === "coach" && e.teamId === teamId &&
         (e.details as import("../../stores/master").EntityDetails)?.coach?.specialty === specialty
  );
}

export function getPitchCoachName(teamId: string, entities: import("../../stores/master").EntityRow[]): string {
  return findTeamCoach(teamId, "투수", entities)?.name ?? "투수 코치";
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

export interface TrainingCopyInput {
  /** 문안 은행. **없으면 옛 문구를 그대로 쓴다** — 여기서 문장을 지어내지 않는다 */
  copy: ReportCopy | null;
  /** 난수·직전 제외를 들고 있다. 난수는 Rust 에서 왔다(`Math.random()` 금지) */
  picker: BankPicker;
  /** 이번 주 XP 가 기준 대비 몇 배인가 (Rust `xp_ratio_of`) */
  xpRatio: number;
  /** 그 주 주 슬롯 프로그램. 없으면 종류 줄을 안 붙인다 */
  primaryProgramId: string | null;
}

export function makeTrainingMessage(
  seasonYear: number,
  week: number,
  logs: string[],
  protagonist: ProtagonistSave,
  coachName: string,
  /**
   * 문안 은행 (C2). **없으면 옛 제목·본문 그대로다** — 배선을 빠뜨린 자리와
   * 문안을 못 읽은 자리가 같은 모양이라야 어느 쪽이든 소식이 안 사라진다.
   */
  copyIn?: TrainingCopyInput,
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
    // ⚠ 사기만 소수다 — 다른 지표와 같은 자릿수로 찍는다(사용자 U4)
    : `훈련 완료 — 컨디션 ${protagonist.condition} / 사기 ${Math.round(protagonist.morale)}`;

  const metadata: import("../../types/main").TrainingMetadata = {
    type: "training",
    stats: statsData,
    condition: protagonist.condition,
    fatigue:   protagonist.fatigue,
    morale:    protagonist.morale,
    extraLogs,
  };

  // ── 문안 은행 (C2) ─────────────────────────────────────────
  //
  // 🔴 **제목에서 `W{week}` 를 뺀다.** 소식함이 이미 주차를 칸으로 들고
  //   있어(`createdAt`) 제목이 그걸 또 적으면 목록이 「W1 주간 훈련 결과 /
  //   W2 주간 훈련 결과」로만 읽힌다 — 15년이면 700줄이 그 꼴이다.
  // ⚠ **은행이 없으면 옛 제목이다.** 빈 제목을 내면 소식함에 빈 줄이 뜬다.
  const leveledUp = statsData.some((s) => s.leveledUp);
  const bankSubject = copyIn
    ? copyIn.picker.pick("train#subject", copyIn.copy?.training.subjects ?? [])
    : "";
  const bankBody = copyIn
    ? trainingBody(
        copyIn.copy, copyIn.picker,
        reportStageOf(protagonist.careerStage),
        trainingOutcomeOf(copyIn.xpRatio, leveledUp),
        copyIn.primaryProgramId,
      )
    : "";
  // ⚠ **덧로그를 지우지 않는다.** 「[부상 경고] …」·「[개인 트레이닝] …」이
  //   거기 실려 오고 패널이 따로 그린다 — 은행 문장은 그 **앞**에 선다.
  const bodyLines = [bankBody, extraLogs.join("\n")].filter((s) => s.length > 0);

  return {
    // 🔴 **연도+주차**다. 주간 훈련은 한 주에 한 통뿐이다.
    //   `Date.now()` 는 같은 세이브를 다시 열면 다른 id 를 낸다
    id: `msg-train-${seasonYear}-w${week}`,
    category: "system",
    sender: coachName,
    subject: bankSubject || `W${week} 주간 훈련 결과`,
    preview,
    body: bodyLines.join("\n\n"),
    createdAt: `W${week}`,
    readAt: null,
    metadata,
  };
}
