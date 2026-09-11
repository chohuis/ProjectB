import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildMyBodyReport } from "../myBodyReport";
import type { MyBodyEvent, MyBodyMetadata } from "../../../types/main";

/**
 * 주인공 몸 상태 월간 리포트.
 *
 * NPC 부상은 이미 월간인데 **내 몸만 낱개로 왔다** — 경고 한 통, 부상 결장
 * 한 통, 컨디션 결장 한 통이 따로 떴다. 그 비대칭을 없앤다.
 *
 * ⚠ 문구는 검사하지 않는다. 보는 것은 ①모은 게 다 실리는가 ②빈 리포트를
 * 안 보내는가 ③부상 발생은 여기 안 담는가(즉시 경로 유지) 셋이다.
 */

const teamName = (id: string) => id.replace("TEAM_", "");

const ABSENCE_INJ: MyBodyEvent = {
  week: 15,
  kind: "absence",
  reason: "injury",
  opponentTeamId: "TEAM_A",
};
const ABSENCE_COND: MyBodyEvent = {
  week: 16,
  kind: "absence",
  reason: "condition",
  condition: 32,
  opponentTeamId: "TEAM_B",
};
const WARNING: MyBodyEvent = { week: 13, kind: "warning", fatigue: 79, riskPct: 34 };

const SNAP = {
  injuryType: "좌측 어깨 염좌",
  severity: "moderate",
  recoveryWeeksLeft: 3,
  sinceWeek: 14,
};

describe("몸 상태 월간 리포트", () => {
  it("담을 게 없으면 null이다", () => {
    // 빈 리포트를 보내면 "소식이 왔는데 아무것도 없다"가 된다
    expect(buildMyBodyReport([], null, 17, 2027, "4월", teamName)).toBeNull();
  });

  it("부상만 있어도 나온다 (그 달에 사건이 없어도 회복 중이면 알린다)", () => {
    const m = buildMyBodyReport([], SNAP, 17, 2027, "4월", teamName)!;
    expect(m).not.toBeNull();
    expect(m.body).toContain("좌측 어깨 염좌");
    expect(m.body).toContain("3주 남음");
  });

  it("결장과 경고가 한 통에 다 실린다", () => {
    const m = buildMyBodyReport(
      [WARNING, ABSENCE_INJ, ABSENCE_COND],
      SNAP,
      17,
      2027,
      "4월",
      teamName,
    )!;
    expect(m.body).toContain("W15");
    expect(m.body).toContain("W16");
    expect(m.body).toContain("W13");
    expect(m.body).toContain("컨디션 32");
    expect(m.body).toContain("피로 79");
  });

  it("상대 팀 이름을 화면 조회 함수로 붙인다", () => {
    // NPC 리포트와 같은 규격 — id만 담고 이름은 조회한다
    const m = buildMyBodyReport([ABSENCE_INJ], null, 17, 2027, "4월", teamName)!;
    expect(m.body).toContain("vs A");
    expect(m.body).not.toContain("TEAM_A");
  });

  it("metadata 로 구조를 남긴다 (화면이 본문을 다시 파싱하지 않게)", () => {
    const m = buildMyBodyReport([WARNING, ABSENCE_INJ], SNAP, 17, 2027, "4월", teamName)!;
    const md = m.metadata as MyBodyMetadata;
    expect(md.type).toBe("myBody");
    expect(md.events).toHaveLength(2);
    expect(md.injury?.weeksLeft).toBe(3);
  });

  it("미리보기가 제일 나쁜 것을 짚는다", () => {
    const hurt = buildMyBodyReport([ABSENCE_INJ], SNAP, 17, 2027, "4월", teamName)!;
    expect(hurt.preview).toContain("좌측 어깨 염좌");

    const onlyWarn = buildMyBodyReport([WARNING], null, 17, 2027, "4월", teamName)!;
    expect(onlyWarn.preview).toContain("경고");
  });

  it("id에 연도가 들어가고 표시용 라벨은 안 들어간다", () => {
    // weekNum은 시즌마다 리셋된다. 라벨을 넣으면 계측이 종류를 못 묶는다
    const a = buildMyBodyReport([WARNING], null, 17, 2026, "4월", teamName)!;
    const b = buildMyBodyReport([WARNING], null, 17, 2027, "4월", teamName)!;
    expect(a.id).not.toBe(b.id);
    expect(a.id).not.toContain("월");
  });
});

describe("호출부 배선", () => {
  const src = () => readFileSync(resolve(__dirname, "../../advanceWeek.ts"), "utf8");

  it("경고·결장을 낱개로 안 보내고 버퍼에 쌓는다", () => {
    // ⚠ 낱개 발송이 남아 있으면 월간 리포트와 **둘 다** 온다
    const s = src();
    expect(s).not.toContain("msg-injury-warn-w");
    expect(s).not.toContain("msg-inj-skip-w");
    expect(s).not.toContain("msg-cond-skip-w");
    expect(s).toContain("pushMyBodyEvent");
  });

  it("버퍼를 비우고 리포트를 만든다", () => {
    // drain을 안 하면 다음 달 리포트에 지난달 경고가 섞인다
    const s = src();
    expect(s).toContain("drainMyBodyEvents");
    expect(s).toContain("buildMyBodyReport");
  });
});

describe("부상 이름은 ID가 아니라 한글이다", () => {
  // ⚠ 2026-08-08 UI 순회가 화면에서 "SHOULDER_INFLAM 4주 남음"을 잡았다.
  // 다른 화면은 전부 INJURY_LABEL을 거치는데 이 리포트만 원문을 그대로 냈다.
  const injured = () =>
    buildMyBodyReport(
      [],
      { injuryType: "SHOULDER_INFLAM", severity: "moderate", recoveryWeeksLeft: 4, sinceWeek: 10 },
      12,
      2026,
      "5월",
      () => "팀",
    )!;

  it("본문에 원문 ID가 안 남는다", () => {
    const m = injured();
    expect(m.body).toContain("어깨 염증");
    expect(m.body).not.toContain("SHOULDER_INFLAM");
  });

  it("미리보기에도 안 남는다 — 목록에서 제일 먼저 보이는 자리다", () => {
    const m = injured();
    expect(m.preview).toContain("어깨 염증");
    expect(m.preview).not.toContain("SHOULDER_INFLAM");
  });

  it("metadata는 ID를 그대로 둔다 — 표시가 아니라 데이터다", () => {
    expect((injured().metadata as any).injury.injuryType).toBe("SHOULDER_INFLAM");
  });
});
