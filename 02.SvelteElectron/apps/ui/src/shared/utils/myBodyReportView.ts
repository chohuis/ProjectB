/**
 * 몸 상태 월간 소식(`msg-mybody-`)을 **표로 그리기 위한 행 만들기**.
 *
 * 🔴 **결함이었다** (`docs/MESSAGE_KINDS_DISPLAY_2026-09-03.md` §4).
 * `weekPhases/myBodyReport.ts` 가 `MyBodyMetadata` 를 실어 보내는데
 * `NewsPage.svelte` 의 `metadata.type` 갈래에 `myBody` 가 없어서,
 * **구조가 잡힌 숫자를 들고 와서 본문 텍스트로만** 나갔다. 넷(training·
 * top10·offseason·injury)은 대시보드로 나가는데 다섯 번째만 안 나갔다.
 *
 * ## 왜 함수를 따로 두나
 *
 * `injuryReport.ts`(NPC 월간 부상)와 **같은 자리**다 — 행을 만드는 곳은
 * 순수 함수 하나고 화면은 그걸 그리기만 한다. 화면 안에서 행을 만들면
 * `environment: "node"` 인 이 저장소의 vitest 가 **한 줄도 못 잰다**.
 *
 * ⚠ **NPC 부상 리포트와 규격을 합치지 않는다.** `MyBodyMetadata` 주석이
 * 이미 못박아 뒀다 — NPC 쪽은 「사람 목록」이고 이쪽은 「내 한 달」이다.
 * 억지로 합치면 둘 다 어중간해진다. 주기(월간)와 구조(표)만 같게 둔다.
 *
 * ⚠ **팀 이름을 여기서 붙이지 않는다.** 행은 `opponentTeamId` 를 그대로
 * 들고 나가고 이름은 화면이 `teamMap` 으로 조회한다 — `injuryReport.ts` 와
 * 같은 규칙이고, 이름을 사건에 담으면 팀 이름이 바뀔 때 소식이 옛말을 한다.
 */

import type { MyBodyEvent, MyBodyMetadata } from "../types/main";
import { INJURY_LABEL } from "../types/save";

/** 부상 등급 한글. `weekPhases/myBodyReport.ts` 의 표와 **같은 말이어야 한다** */
export const MY_BODY_SEVERITY_LABEL: Record<string, string> = {
  light: "경미", moderate: "중등도", severe: "중증", surgery: "수술",
};

/** 결장 사유 — 두 갈래뿐이다(`MyBodyEvent.reason`) */
export const ABSENCE_REASON_LABEL: Record<"injury" | "condition", string> = {
  injury:    "부상",
  condition: "컨디션",
};

/**
 * 칸 이름 — **한 곳에만 둔다.** 화면이 따로 적으면 표가 두 벌이 되고,
 * 한쪽만 고쳐진 채 남는다.
 */
export const MY_BODY_LABEL = {
  injury:    "부상",
  absence:   "결장",
  warning:   "경고",
  week:      "주차",
  opponent:  "상대",
  reason:    "사유",
  condition: "컨디션",
  fatigue:   "피로",
  risk:      "부상 위험",
  weeksLeft: "남은 주",
  since:     "발생",
} as const;

export interface MyBodyInjuryRow {
  /** 부상 이름. `INJURY_LABEL` 을 거친 값이다 — 코드를 그대로 내보내지 않는다 */
  name: string;
  /** 등급 한글. 표에 없으면 원문 */
  severity: string;
  weeksLeft: number;
  sinceWeek: number;
}

export interface MyBodyAbsenceRow {
  week: number;
  /** 상대 팀. 이름은 화면이 조회한다. 없으면 null(연습·비경기 결장) */
  opponentTeamId: string | null;
  reason: "injury" | "condition";
  /** `reason === "condition"` 일 때만 값이 있다 */
  condition: number | null;
}

export interface MyBodyWarningRow {
  week: number;
  fatigue: number | null;
  riskPct: number | null;
}

export interface MyBodyRows {
  injury: MyBodyInjuryRow | null;
  absences: MyBodyAbsenceRow[];
  warnings: MyBodyWarningRow[];
  /** 카드에 얹는 수 — 화면이 `.length` 를 다시 세지 않게 한다 */
  counts: { absence: number; warning: number; injuryWeeksLeft: number };
}

/** 부상 이름. 표에 없으면 코드를 그대로 쓰지 않는다 — `INJURY_LABEL` 이 정본이다 */
export function myBodyInjuryName(t: string): string {
  return (INJURY_LABEL as Record<string, string>)[t] ?? t;
}

/** 주차 오름차순. 한 달치라 몇 건 안 되지만 **순서가 없으면 읽는 순서가 흔들린다** */
function byWeek<T extends { week: number }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.week - b.week);
}

/**
 * 소식이 실은 `metadata` 를 표의 행으로 바꾼다.
 *
 * ⚠ **`events` 가 비고 부상도 없으면 행이 하나도 없다.** 그런 소식은 애초에
 * 안 만들어지지만(`buildMyBodyReport` 가 `null` 을 낸다), 옛 세이브에 남은
 * 소식이 있을 수 있어 화면이 견뎌야 한다.
 */
export function buildMyBodyRows(metadata: MyBodyMetadata): MyBodyRows {
  const events: MyBodyEvent[] = Array.isArray(metadata.events) ? metadata.events : [];

  const absences: MyBodyAbsenceRow[] = byWeek(events.filter((e) => e.kind === "absence"))
    .map((e) => ({
      week: e.week,
      opponentTeamId: e.opponentTeamId ?? null,
      // 사유가 안 실린 옛 소식은 부상으로 보지 않는다 — 컨디션이 기본이다
      reason: e.reason === "injury" ? "injury" : "condition",
      condition: typeof e.condition === "number" ? e.condition : null,
    }));

  const warnings: MyBodyWarningRow[] = byWeek(events.filter((e) => e.kind === "warning"))
    .map((e) => ({
      week: e.week,
      fatigue: typeof e.fatigue === "number" ? e.fatigue : null,
      riskPct: typeof e.riskPct === "number" ? e.riskPct : null,
    }));

  const inj = metadata.injury;
  const injury: MyBodyInjuryRow | null = inj
    ? {
        name: myBodyInjuryName(inj.injuryType),
        severity: MY_BODY_SEVERITY_LABEL[inj.severity] ?? inj.severity,
        weeksLeft: inj.weeksLeft,
        sinceWeek: inj.sinceWeek,
      }
    : null;

  return {
    injury,
    absences,
    warnings,
    counts: {
      absence: absences.length,
      warning: warnings.length,
      injuryWeeksLeft: injury?.weeksLeft ?? 0,
    },
  };
}

/**
 * 표가 몇 줄인가 — **검사가 세는 수**이자 화면이 「없다」를 그릴지 정하는 값.
 *
 * 부상은 한 줄(있으면), 결장·경고는 건수만큼이다.
 */
export function myBodyRowCount(rows: MyBodyRows): number {
  return (rows.injury ? 1 : 0) + rows.absences.length + rows.warnings.length;
}
