/**
 * **코치 리포트 — 3주마다 한 통** (2026-09-30 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 끝에 있던 「코치 리포트」 절 하나가 그대로 나왔다.
 *   블록 경계는 옮기기 전 파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **스냅샷 셋을 인자로 받는다** — `gFinal`·`sFinal`·`mFinal` 은 「업적 체크」
 *   자리에서 읽은 것이고, 그 뒤로 관계도·배경 시뮬이 store 를 바꾼다. 여기서
 *   다시 읽으면 **다른 값**을 보게 되므로 뜻이 바뀐다. 이름도 그대로 둔 것은
 *   본문을 한 글자도 안 고치기 위해서다.
 *
 * ⚠ 검사는 주간 진행 경로를 **한 덩이로** 읽으므로(`__tests__/weekPathSrc.ts`)
 *   검사 문장은 한 글자도 안 바뀌었다.
 */
import { gameStore, type GameStoreState } from "../../stores/game";
import type { SeasonStoreState } from "../../stores/season";
import type { MasterState } from "../../stores/master";
import { getPitchCoachName } from "./training";
import { coachReportTableMeta } from "../../utils/dashboardMeta";

/** 옮기기 전 지역 변수를 그대로 담은 인자 묶음 — 이름이 본문과 같아야 한다 */
export interface CoachReportArgs {
  weekNum: number;
  weekInYear: number;
  gFinal: GameStoreState;
  sFinal: SeasonStoreState;
  mFinal: MasterState;
}

export function runCoachReport({
  weekNum,
  weekInYear,
  gFinal,
  sFinal,
  mFinal,
}: CoachReportArgs): void {
  // ── 코치 리포트 (3주마다, 군 복무·오프시즌 제외) ──────────────
  const isSeasonActive = sFinal.schedule.some(
    (e) => !e.result && !e.isFriendly && (e.phase === "season" || e.phase === "postseason"),
  );
  if (weekInYear % 3 === 0 && gFinal.protagonist.careerStage !== "military" && isSeasonActive) {
    const p = gFinal.protagonist;
    const pit = p.pitching;
    // ⚠ 투수 전용 — 아래가 ERA 로 코치 총평을 쓴다
    const myStats =
      (sFinal.stats[p.id] as import("../../types/save").PitcherSeasonStats | null) ?? null;
    const coachName = getPitchCoachName(p.teamId, mFinal.entities);

    const era = myStats?.era ?? null;
    const eraLine =
      era !== null
        ? `  시즌 ERA ${era.toFixed(2)}  (${
            era < 2.5 ? "최상위권" : era < 3.5 ? "안정권" : era < 5.0 ? "주의 필요" : "위험 수준"
          })`
        : null;

    /**
     * 시즌 시작 대비 변화. **없으면 `undefined` 다** — 구 세이브·시즌 첫 주엔
     * 견줄 값이 없고, 0 을 채우면 「안 변했다」와 「모른다」가 같아 보인다.
     */
    const startPit = p.seasonStartPitching;
    const deltaFromStart = (k: keyof typeof pit): number | undefined => {
      const before = startPit?.[k as keyof typeof startPit];
      return typeof before === "number" ? (pit[k] as number) - before : undefined;
    };

    const fatigueTag = p.fatigue >= 70 ? "⚠ 위험" : p.fatigue >= 50 ? "주의" : "정상";

    type Choice = {
      id: string;
      label: string;
      effectHint: string;
      moraleDelta?: number;
      fatigueDelta?: number;
      conditionDelta?: number;
      xp?: Record<string, number>;
    };

    let recommendation: string;
    let choices: Choice[];

    if (p.fatigue >= 65) {
      recommendation = `피로도 ${p.fatigue} — 회복 최우선 권고.`;
      choices = [
        {
          id: "rest",
          label: "회복 집중",
          effectHint: "피로 -8, 컨디션 +4",
          fatigueDelta: -8,
          conditionDelta: 4,
        },
        { id: "push", label: "훈련 유지", effectHint: "변화 없음" },
      ];
    } else if (p.condition >= 82 && p.morale >= 68) {
      recommendation = `컨디션·사기 양호 — 집중 훈련 적기.`;
      choices = [
        {
          id: "intensive",
          label: "강도 높여 집중 훈련",
          effectHint: "커맨드 XP +3, 피로 +4",
          xp: { command: 3 },
          fatigueDelta: 4,
        },
        { id: "steady", label: "현재 루틴 유지", effectHint: "변화 없음" },
      ];
    } else if (p.morale <= 40) {
      recommendation = `사기 저하 감지 — 멘탈 관리 병행 권고.`;
      choices = [
        {
          id: "mental",
          label: "멘탈 케어 병행",
          effectHint: "사기 +6, 훈련 효율 -10%",
          moraleDelta: 6,
        },
        { id: "grind", label: "훈련만 집중", effectHint: "변화 없음" },
      ];
    } else {
      recommendation = `현재 상태 안정적 — 루틴 유지 권장.`;
      choices = [
        { id: "balance", label: "현재 루틴 유지", effectHint: "변화 없음" },
        {
          id: "recover",
          label: "회복 세션 추가",
          effectHint: "피로 -4, 컨디션 +2",
          fatigueDelta: -4,
          conditionDelta: 2,
        },
      ];
    }

    const bodyLines = [
      `■ 현재 수치`,
      `  구속 ${pit.velocity}  커맨드 ${pit.command}  제구 ${pit.control}  스태미나 ${pit.stamina}`,
      ...(eraLine ? [eraLine] : []),
      ``,
      `■ 상태`,
      // ⚠ **사기만 소수다** — `moraleAfterWeek` 가 실수를 돌려주고 다른 셋은
      //   정수다. 그대로 찍으면 「사기 63.42857142857143」이 된다(사용자 U4).
      //   값을 반올림해 저장하지 않는다 — 보여 줄 때만 자릿수를 맞춘다
      `  컨디션 ${p.condition}  /  피로도 ${p.fatigue} [${fatigueTag}]  /  사기 ${Math.round(p.morale)}`,
      ``,
      `■ 권고`,
      `  ${recommendation}`,
    ];

    gameStore.addMessage({
      id: `msg-coach-report-${sFinal.seasonYear}-w${weekNum}`,
      category: "coach",
      sender: coachName,
      subject: `[코치 리포트] W${weekNum} 점검`,
      preview: recommendation,
      body: bodyLines.join("\n"),
      createdAt: `W${weekNum}`,
      readAt: null,
      // 🔴 **지표 이름을 안 싣는다** — 키만 보내고 화면이 문안
      //   (`table.coachReport.rows`)으로 이름을 붙인다 (B-35).
      // ⚠ 변화는 시즌 시작 스냅샷이 있을 때만이다 — 없으면 그 칸이 안 그려진다
      metadata: coachReportTableMeta([
        { key: "velocity", value: pit.velocity, delta: deltaFromStart("velocity") },
        { key: "command", value: pit.command, delta: deltaFromStart("command") },
        { key: "control", value: pit.control, delta: deltaFromStart("control") },
        { key: "stamina", value: pit.stamina, delta: deltaFromStart("stamina") },
        { key: "condition", value: p.condition },
        { key: "fatigue", value: p.fatigue },
        // ⚠ 표도 같은 자릿수다 — `cellText` 는 일부러 반올림을 안 한다
        //   (승률 `.633` · 이닝 `168.1` 처럼 자릿수에 뜻이 있는 값이 있어서다).
        //   자릿수를 정하는 건 만드는 쪽이라 여기서 끊는다
        { key: "morale", value: Math.round(p.morale) },
      ]),
      decision: {
        prompt: "이번 주 방향을 선택하세요.",
        options: choices.map((c) => ({
          id: c.id,
          label: c.label,
          effectHint: c.effectHint,
          effects: {
            moraleDelta: c.moraleDelta ?? 0,
            fatigueDelta: c.fatigueDelta ?? 0,
            conditionDelta: c.conditionDelta ?? 0,
            ...(c.xp ? { xp: c.xp } : {}),
          },
        })),
        selectedOptionId: null,
      },
    });
  }
}
