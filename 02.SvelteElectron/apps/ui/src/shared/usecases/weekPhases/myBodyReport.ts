import type { MessageItem, MyBodyEvent, MyBodyMetadata } from "../../types/main";

/**
 * 주인공 몸 상태 월간 리포트.
 *
 * NPC 부상은 이미 월간 리포트인데 **내 몸만 낱개로 왔다** — 경고 한 통,
 * 부상 결장 한 통, 컨디션 결장 한 통이 따로 떴다. 그 비대칭을 없앤다.
 *
 * ⚠ **부상 발생은 여기 안 담는다.** 다치는 순간은 사건이라 즉시 보내야 한다.
 * 여기 모으는 것은 **경고·결장**이고, 월말 시점의 부상 상태는 요약으로만 싣는다.
 *
 * ⚠ **통수는 오히려 늘 수 있다** (실측 시즌당 10통 → 월간이면 최대 13통).
 * 값어치는 절감이 아니라 "내 몸이 한 곳에 정리된다"는 데 있다.
 */

export interface MyBodySnapshot {
  injuryType?: string;
  severity?: string;
  /** 남은 회복 주. 0 이하면 부상 아님 */
  recoveryWeeksLeft?: number;
  /** 다친 주차 */
  sinceWeek?: number;
}

const SEVERITY_KO: Record<string, string> = {
  light: "경미", moderate: "중등도", severe: "중증", surgery: "수술",
};

/**
 * 담을 게 하나도 없으면 `null`. **빈 리포트를 보내면 "왔는데 아무것도 없다"가 된다.**
 *
 * 이름·팀명은 담지 않는다 — NPC 리포트와 같은 규격이고, 표시는 화면이 조회한다.
 */
export function buildMyBodyReport(
  events: MyBodyEvent[],
  snapshot: MyBodySnapshot | null,
  weekNum: number,
  /** id를 유일하게 만든다. `weekNum`은 시즌마다 1로 리셋되므로 이게 없으면 겹친다 */
  seasonYear: number,
  monthLabel: string,
  teamName: (id: string) => string,
): MessageItem | null {
  const injured = !!snapshot?.injuryType && (snapshot.recoveryWeeksLeft ?? 0) > 0;
  if (events.length === 0 && !injured) return null;

  const absences = events.filter((e) => e.kind === "absence");
  const warnings = events.filter((e) => e.kind === "warning");

  const lines: string[] = [`[${monthLabel} 내 몸]`, ""];

  if (injured) {
    lines.push(
      `  부상    ${snapshot!.injuryType}` +
        (snapshot!.severity ? ` (${SEVERITY_KO[snapshot!.severity] ?? snapshot!.severity})` : ""),
      `          W${snapshot!.sinceWeek ?? "?"} 발생 · ${snapshot!.recoveryWeeksLeft}주 남음`,
      "",
    );
  }

  if (absences.length > 0) {
    lines.push("  결장");
    for (const a of absences) {
      const opp = a.opponentTeamId ? `vs ${teamName(a.opponentTeamId)}` : "경기";
      const why = a.reason === "injury" ? "부상 회복 중" : `컨디션 ${a.condition ?? "?"}`;
      lines.push(`          W${a.week}  ${opp}   ${why}`);
    }
    lines.push("");
  }

  if (warnings.length > 0) {
    lines.push("  경고");
    for (const w of warnings) {
      lines.push(`          W${w.week}  피로 ${w.fatigue ?? "?"} — 다음 주 부상 위험 ${w.riskPct ?? "?"}%`);
    }
    lines.push("");
  }

  lines.push("  → 회복 훈련으로 슬롯을 돌리거나 등판을 거르십시오");

  // 미리보기는 **제일 나쁜 것**을 짚는다. 부상 > 결장 > 경고 순이다
  const preview = injured
    ? `${snapshot!.injuryType} ${snapshot!.recoveryWeeksLeft}주 남음`
      + (absences.length ? ` · 결장 ${absences.length}경기` : "")
    : absences.length > 0
      ? `결장 ${absences.length}경기` + (warnings.length ? ` · 피로 경고 ${warnings.length}회` : "")
      : `피로 경고 ${warnings.length}회`;

  const subject = injured
    ? `${monthLabel} 몸 상태 — 부상 회복 중`
    : absences.length > 0
      ? `${monthLabel} 몸 상태 — 결장 ${absences.length}경기`
      : `${monthLabel} 몸 상태 — 피로 경고`;

  const metadata: MyBodyMetadata = {
    type: "myBody",
    week: weekNum,
    injury: injured
      ? {
          injuryType: snapshot!.injuryType!,
          severity: snapshot!.severity ?? "moderate",
          weeksLeft: snapshot!.recoveryWeeksLeft!,
          sinceWeek: snapshot!.sinceWeek ?? 0,
        }
      : null,
    events,
  };

  return {
    // ⚠ **연도를 넣는다.** `weekNum`은 시즌마다 리셋되므로 이게 없으면 해마다
    // 같은 id가 다시 생기고, 소식 목록이 `(msg.id)`로 키를 잡아 죽는다
    // (2026-08-08 다이제스트에서 실제로 세이브가 안 열렸다).
    // ⚠ **표시용 라벨(월 이름)은 안 넣는다** — 계측이 종류를 뽑을 때 쪼개진다.
    id:        `msg-mybody-${seasonYear}-w${weekNum}`,
    category:  "coach",
    sender:    "코칭스태프",
    subject,
    preview,
    body:      lines.join("\n"),
    createdAt: `W${weekNum}`,
    readAt:    null,
    metadata,
  };
}
