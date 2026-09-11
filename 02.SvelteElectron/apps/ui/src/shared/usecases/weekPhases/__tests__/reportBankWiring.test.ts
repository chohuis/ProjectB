import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeTrainingMessage, trainingOutcomeOf } from "../training";
import { buildInjuryNews } from "../injuryNews";
import { buildMyBodyReport } from "../myBodyReport";
import { BankPicker, parseReportCopy } from "../../../utils/reportCopy";
import { makeEmptySeason } from "../../../types/season";
import type { ProtagonistSave } from "../../../types/save";

/**
 * 문안 은행이 **실제로 소식에 실리는가** (C2 배선).
 *
 * 🔴 `reportCopy.test.ts` 는 파서와 뽑기만 본다. 그것이 다 통과해도
 *    **소식 만드는 자리가 은행을 안 부르면** 화면엔 옛 문구가 그대로 뜬다 —
 *    이 작업이 고친 결함이 정확히 그 모양이었다(파일은 있고 배선만 없었다).
 *    여기서는 세 소식을 실제로 만들어 **제목·본문이 파일에서 온 문장인지**
 *    확인한다.
 *
 * ⚠ **은행을 안 넘기면 옛 문구여야 한다.** 배선을 빠뜨린 자리와 문안을 못
 *    읽은 자리가 같은 모양이라야 어느 쪽이든 소식이 안 사라진다.
 */

const ROOT = join(__dirname, "../../../../../../..");
const copy = parseReportCopy(
  JSON.parse(readFileSync(join(ROOT, "resource/data/master/messages/reports.json"), "utf8")),
)!;

/** 난수는 호출자가 넘긴다 — `Math.random()` 은 금지다(CLAUDE.md) */
const picker = () => new BankPicker({}, [0.1, 0.4, 0.7, 0.2, 0.9, 0.55]);

const PIT = {
  ovr: 62,
  stamina: 60,
  velocity: 62,
  command: 58,
  control: 60,
  movement: 55,
  mentality: 50,
  recovery: 50,
  clutch: 50,
  holdRunners: 50,
};
const HERO = {
  id: "PLY_HERO",
  careerStage: "pro_kbl",
  pitching: PIT,
  pitchingXP: {},
  condition: 70,
  fatigue: 40,
  morale: 55,
  teamId: "TEAM_A",
} as unknown as ProtagonistSave;

describe("훈련 리포트 — 제목 은행 + 본문 두 줄", () => {
  it("제목이 은행에서 온다", () => {
    const m = makeTrainingMessage(2027, 12, [], HERO, "투수 코치", {
      copy,
      picker: picker(),
      xpRatio: 1.0,
      primaryProgramId: "TRN_VEL",
    });
    expect(copy.training.subjects).toContain(m.subject);
    // 🔴 주차를 제목에 다시 안 적는다 — 소식함이 `createdAt` 으로 든다
    expect(m.subject.includes("W12"), `제목에 주차가 남았다: ${m.subject}`).toBe(false);
  });

  it("본문이 무대×성과 한 줄 + 훈련 종류 한 줄이다", () => {
    const m = makeTrainingMessage(2027, 12, [], HERO, "투수 코치", {
      copy,
      picker: picker(),
      xpRatio: 1.0,
      primaryProgramId: "TRN_VEL",
    });
    const lines = m.body.split("\n").filter((s) => s.length > 0);
    expect(lines.length, `본문이 두 줄이 아니다: ${JSON.stringify(m.body)}`).toBe(2);
    // `pro_kbl` 은 은행에서 `pro` 로 접힌다
    expect(copy.training.byStageOutcome["pro"]!["normal"]).toContain(lines[0]);
    expect(copy.training.byProgram["TRN_VEL"]).toContain(lines[1]);
  });

  /** ⚠ 덧로그를 지우지 않는다 — 부상 경고·구독 보너스가 거기 실려 온다 */
  it("덧로그가 은행 문장 뒤에 남는다", () => {
    const m = makeTrainingMessage(2027, 12, ["[부상 경고] 피로 79"], HERO, "코치", {
      copy,
      picker: picker(),
      xpRatio: 1.0,
      primaryProgramId: "TRN_VEL",
    });
    expect(m.body).toContain("[부상 경고] 피로 79");
  });

  it("은행을 안 넘기면 옛 제목이다", () => {
    const m = makeTrainingMessage(2027, 12, [], HERO, "투수 코치");
    expect(m.subject).toBe("W12 주간 훈련 결과");
  });

  it("문안을 못 읽으면 옛 제목이다", () => {
    const m = makeTrainingMessage(2027, 12, [], HERO, "투수 코치", {
      copy: null,
      picker: picker(),
      xpRatio: 1.0,
      primaryProgramId: "TRN_VEL",
    });
    expect(m.subject).toBe("W12 주간 훈련 결과");
    expect(m.body).toBe("");
  });
});

describe("성과 판정 — 엔진이 준 배수로 가른다", () => {
  /** ⚠ 능력치가 실제로 올라온 주에 「평소와 같은」이 붙으면 화면이 스스로를 부정한다 */
  it("레벨업은 그 자체로 good 이다", () => {
    expect(trainingOutcomeOf(0.5, true)).toBe("good");
  });

  it("문턱 위아래로 갈린다", () => {
    expect(trainingOutcomeOf(1.3, false)).toBe("good");
    expect(trainingOutcomeOf(1.0, false)).toBe("normal");
    expect(trainingOutcomeOf(0.2, false)).toBe("poor");
  });

  /** ⚠ 구 엔진은 `xpRatio` 를 안 보낸다 — 없는 값을 어느 쪽으로도 안 민다 */
  it("숫자가 아니면 normal 이다", () => {
    expect(trainingOutcomeOf(Number.NaN, false)).toBe("normal");
  });

  it("본문이 성과마다 갈린다", () => {
    const bodyOf = (xpRatio: number) =>
      makeTrainingMessage(2027, 12, [], HERO, "코치", {
        copy,
        picker: picker(),
        xpRatio,
        primaryProgramId: "TRN_VEL",
      }).body.split("\n")[0];
    expect(copy.training.byStageOutcome["pro"]!["good"]).toContain(bodyOf(1.3));
    expect(copy.training.byStageOutcome["pro"]!["poor"]).toContain(bodyOf(0.2));
  });
});

describe("부상 리포트 — 제목만 은행", () => {
  const season = makeEmptySeason("LEAGUE_KBL", 2027, 52, ["TEAM_A", "TEAM_B"]);
  const events = [
    { npcId: "N1", injuryType: "SHOULDER_INFLAM", severity: "moderate", weeks: 4, week: 16 },
  ];

  it("`{month}` 가 채워진 은행 제목이 온다", () => {
    const m = buildInjuryNews({
      events,
      weekNum: 16,
      weekInYear: 16,
      season,
      monthLabel: "6월",
      subjectBank: { copy, picker: picker() },
    })!;
    expect(m.subject.startsWith("6월"), `월이 안 채워졌다: ${m.subject}`).toBe(true);
    expect(m.subject.includes("{"), `자리표시자가 남았다: ${m.subject}`).toBe(false);
    const filled = copy.injury.subjects.map((s) => s.split("{month}").join("6월"));
    expect(filled).toContain(m.subject);
  });

  it("은행을 안 넘기면 옛 제목이다", () => {
    const m = buildInjuryNews({ events, weekNum: 16, weekInYear: 16, season, monthLabel: "6월" })!;
    expect(m.subject).toBe("6월 부상 리포트");
  });
});

describe("내 몸 리포트 — 제목 은행 + 한 줄", () => {
  const teamName = (id: string) => id.replace("TEAM_", "");
  const events = [{ week: 13, kind: "warning", fatigue: 79, riskPct: 34 } as const];

  it("제목과 본문이 은행에서 온다", () => {
    const m = buildMyBodyReport(events as never, null, 17, 2027, "4월", teamName, {
      copy,
      picker: picker(),
    })!;
    expect(copy.myBody.subjects).toContain(m.subject);
    expect(copy.myBody.leads).toContain(m.body);
  });

  /** 🔴 값은 패널이 든다 — 본문에 또 실으면 화면에 두 번 나온다 */
  it("본문에서 값 줄이 사라진다", () => {
    const m = buildMyBodyReport(events as never, null, 17, 2027, "4월", teamName, {
      copy,
      picker: picker(),
    })!;
    expect(m.body.includes("W13"), `값 줄이 본문에 남았다: ${m.body}`).toBe(false);
    // 값 자체는 `metadata` 로 그대로 간다
    expect((m.metadata as { events: unknown[] }).events.length).toBe(1);
  });

  it("은행을 안 넘기면 옛 제목·옛 본문이다", () => {
    const m = buildMyBodyReport(events as never, null, 17, 2027, "4월", teamName)!;
    expect(m.subject).toBe("4월 몸 상태 — 피로 경고");
    expect(m.body).toContain("W13");
  });
});

describe("한 주에 세 소식이 나도 서로를 안 흔든다", () => {
  /**
   * 🔴 **셋이 한 `BankPicker` 를 쓴다.** 기억 키가 갈려 있으므로 서로의
   *    「직전 것」을 물려받지 않아야 한다 — 키를 안 가르면 제목 은행(6개)의
   *    인덱스 5 를 본문 은행(4개)이 「직전」으로 받는다.
   */
  it("키가 갈려 있어 각자 자기 은행만 기억한다", () => {
    const p = picker();
    const season = makeEmptySeason("LEAGUE_KBL", 2027, 52, ["TEAM_A", "TEAM_B"]);
    makeTrainingMessage(2027, 16, [], HERO, "코치", {
      copy,
      picker: p,
      xpRatio: 1.0,
      primaryProgramId: "TRN_VEL",
    });
    buildInjuryNews({
      events: [
        { npcId: "N1", injuryType: "SHOULDER_INFLAM", severity: "moderate", weeks: 4, week: 16 },
      ],
      weekNum: 16,
      weekInYear: 16,
      season,
      monthLabel: "6월",
      subjectBank: { copy, picker: p },
    });
    buildMyBodyReport(
      [{ week: 13, kind: "warning", fatigue: 79, riskPct: 34 }] as never,
      null,
      16,
      2027,
      "6월",
      (id) => id,
      { copy, picker: p },
    );
    expect(Object.keys(p.picks).sort()).toEqual([
      "injury#subject",
      "mybody#lead",
      "mybody#subject",
      "train#body",
      "train#program",
      "train#subject",
    ]);
  });
});
