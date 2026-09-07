import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BankPicker, fillReportVar, parseReportCopy, reportStageOf, trainingBody,
  type ReportCopy,
} from "../reportCopy";
import { MIN_BANK_SIZE } from "../sentenceBank";

/**
 * 주간 리포트 문안 은행 (C2 배선).
 *
 * 🔴 **은행을 배선하고도 한 문장만 나오는 결함이 조용하다** — 소식은 오고
 *    개수도 맞고 제목만 늘 같다. 여기서 ①파일의 키가 전부 읽히는지
 *    ②뽑기가 은행을 다 훑는지 ③같은 것이 연달아 안 나오는지를 못 박는다.
 *
 * ⚠ **파일을 직접 읽는다.** 파서만 검사하면 파일이 규격을 어겨도 안 잡힌다 —
 *    `roleChoiceCopy.test.ts` 가 먼저 그은 선이다.
 */

const ROOT = join(__dirname, "../../../../../..");
const REPORTS = join(ROOT, "resource/data/master/messages/reports.json");
const PROGRAMS = join(ROOT, "resource/data/master/training/programs.json");

const raw = JSON.parse(readFileSync(REPORTS, "utf8")) as Record<string, unknown>;
const copy = parseReportCopy(raw)!;
const programIds: string[] =
  (JSON.parse(readFileSync(PROGRAMS, "utf8")).programs as { id: string }[]).map((p) => p.id);

/** 밑줄로 시작하는 칸은 설명이다 — 은행이 아니다 */
const realKeys = (o: unknown) =>
  Object.keys((o ?? {}) as Record<string, unknown>).filter((k) => !k.startsWith("_"));

describe("파일이 파서를 그대로 통과한다", () => {
  it("제목 은행 셋이 다 선다", () => {
    expect(copy, "reports.json 을 통째로 못 읽었다").not.toBeNull();
    expect(copy.training.subjects.length).toBeGreaterThanOrEqual(MIN_BANK_SIZE);
    expect(copy.injury.subjects.length).toBeGreaterThanOrEqual(MIN_BANK_SIZE);
    expect(copy.myBody.subjects.length).toBeGreaterThanOrEqual(MIN_BANK_SIZE);
    expect(copy.myBody.leads.length).toBeGreaterThanOrEqual(MIN_BANK_SIZE);
  });

  /**
   * 🔴 **파일에 있는데 코드가 안 읽는 칸이 없어야 한다.** 그게 이 작업의
   *    결함 모양이다 — 문안은 있고 배선만 없어서 아무도 안 읽었다.
   */
  it("무대×성과 열다섯이 전부 읽힌다", () => {
    const fileStages = realKeys((raw.training as Record<string, unknown>).byStageOutcome);
    expect(fileStages.length, "무대가 다섯이 아니다").toBe(5);
    for (const stage of fileStages) {
      for (const outcome of ["good", "normal", "poor"] as const) {
        const bank = copy.training.byStageOutcome[stage]?.[outcome];
        expect(bank, `${stage}.${outcome} 을 파서가 버렸다`).toBeDefined();
        expect(bank!.length, `${stage}.${outcome} 은행이 ${MIN_BANK_SIZE} 미만이다`)
          .toBeGreaterThanOrEqual(MIN_BANK_SIZE);
      }
    }
  });

  /**
   * ⚠ **훈련 프로그램 표가 정본이다.** 문안에만 있는 id 는 영영 안 뜨고,
   *    프로그램에만 있는 id 는 그 주에 종류 줄이 통째로 빈다.
   */
  it("훈련 종류가 programs.json 과 한 글자도 안 어긋난다", () => {
    const bankIds = Object.keys(copy.training.byProgram).sort();
    expect(bankIds).toEqual([...programIds].sort());
    for (const [id, bank] of Object.entries(copy.training.byProgram)) {
      expect(bank.length, `${id} 은행이 ${MIN_BANK_SIZE} 미만이다`)
        .toBeGreaterThanOrEqual(MIN_BANK_SIZE);
    }
  });

  it("`{month}` 말고 다른 자리표시자가 없다", () => {
    const all = [
      ...copy.training.subjects, ...copy.myBody.subjects, ...copy.myBody.leads,
      ...Object.values(copy.training.byStageOutcome).flatMap((m) => Object.values(m).flat()),
      ...Object.values(copy.training.byProgram).flat(),
    ];
    for (const s of all) {
      expect(s.includes("{"), `자리표시자가 남았다: ${s}`).toBe(false);
    }
    // 부상 제목만 `{month}` 를 갖는다 — 그 하나뿐이다
    for (const s of copy.injury.subjects) {
      expect(s.split("{").length - 1, `자리표시자가 둘 이상이다: ${s}`).toBeLessThanOrEqual(1);
      if (s.includes("{")) expect(s).toContain("{month}");
    }
  });
});

describe("무대를 은행 키로 접는다", () => {
  it("프로 셋이 한 자리로 접힌다", () => {
    expect(reportStageOf("pro")).toBe("pro");
    expect(reportStageOf("pro_kbl")).toBe("pro");
    expect(reportStageOf("pro_abl")).toBe("pro");
    expect(reportStageOf("pro_jbl")).toBe("pro");
  });

  it("나머지 넷은 그대로다", () => {
    expect(reportStageOf("highschool")).toBe("highschool");
    expect(reportStageOf("university")).toBe("university");
    expect(reportStageOf("independent")).toBe("independent");
    expect(reportStageOf("military")).toBe("military");
  });

  /** ⚠ 모르는 무대에 문장을 지어 붙이지 않는다 — 그 줄을 안 쓴다 */
  it("모르는 무대는 null 이다", () => {
    expect(reportStageOf("retired")).toBeNull();
    expect(reportStageOf("")).toBeNull();
  });
});

describe("뽑기 — 직전 것을 뺀다", () => {
  /** 난수를 0.0·0.5·0.99 로 돌려 가며 은행을 훑는다 */
  const rands = Array.from({ length: 200 }, (_, i) => ((i * 37) % 100) / 100);

  it("같은 것이 연달아 안 나온다", () => {
    const picker = new BankPicker({}, rands);
    const bank = copy.training.subjects;
    let last = "";
    for (let i = 0; i < 100; i++) {
      const got = picker.pick("k", bank);
      expect(got, "은행이 있는데 빈 문자열이 나왔다").not.toBe("");
      expect(got, `같은 제목이 연속으로 나왔다 (${i}번째)`).not.toBe(last);
      last = got;
    }
  });

  it("여러 번 돌면 은행을 다 쓴다", () => {
    const picker = new BankPicker({}, rands);
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) seen.add(picker.pick("k", copy.training.subjects));
    expect(seen.size, "한 문장만 나온다").toBe(copy.training.subjects.length);
  });

  /**
   * 🔴 **키를 안 가르면 한 은행의 기억이 다른 은행을 흔든다.** 제목 은행이
   *    6개인데 본문 은행이 4개면 인덱스 5 를 「직전」으로 물려받는다.
   */
  it("키가 다르면 기억이 안 섞인다", () => {
    const picker = new BankPicker({ "a": 0 }, [0.0, 0.0]);
    const bank = ["가", "나", "다"];
    expect(picker.pick("a", bank), "직전(0)을 안 뺐다").toBe("나");
    expect(picker.pick("b", bank), "다른 키인데 a 의 기억을 봤다").toBe("가");
  });

  it("뽑은 인덱스를 되돌린다", () => {
    const picker = new BankPicker({}, [0.99]);
    picker.pick("k", ["가", "나", "다"]);
    expect(picker.picks["k"], "picks 가 비었다 — sentenceMemory 로 못 돌아간다")
      .toBeGreaterThanOrEqual(0);
  });

  /** ⚠ 난수가 모자라면 0.5 다 — `Math.random()` 으로 새면 계측이 안 재현된다 */
  it("난수가 모자라도 던지지 않는다", () => {
    const picker = new BankPicker({}, []);
    expect(picker.pick("k", ["가", "나", "다"])).not.toBe("");
  });

  it("빈 은행은 빈 문자열이다", () => {
    expect(new BankPicker({}, [0.5]).pick("k", [])).toBe("");
  });
});

describe("훈련 본문 — 두 줄을 이어 붙인다", () => {
  const picker = () => new BankPicker({}, [0.1, 0.6, 0.3, 0.8]);

  it("무대×성과 한 줄 + 종류 한 줄", () => {
    const body = trainingBody(copy, picker(), "highschool", "good", "TRN_VEL");
    const lines = body.split("\n");
    expect(lines.length, "두 줄이 아니다").toBe(2);
    expect(copy.training.byStageOutcome["highschool"]!["good"]).toContain(lines[0]);
    expect(copy.training.byProgram["TRN_VEL"]).toContain(lines[1]);
  });

  /** ⚠ 슬롯이 비었으면 종류 줄을 **안 붙인다** — 지어내지 않는다 */
  it("주 슬롯이 없으면 한 줄이다", () => {
    const body = trainingBody(copy, picker(), "pro", "poor", null);
    expect(body.split("\n").length).toBe(1);
  });

  it("문안이 없으면 빈 문자열이다", () => {
    expect(trainingBody(null, picker(), "pro", "good", "TRN_VEL")).toBe("");
  });

  it("모르는 무대면 종류 줄만 남는다", () => {
    const body = trainingBody(copy, picker(), null, "good", "TRN_VEL");
    expect(body.split("\n").length).toBe(1);
    expect(copy.training.byProgram["TRN_VEL"]).toContain(body);
  });
});

describe("자리표시자 — 정규식을 안 쓴다", () => {
  it("`{month}` 를 채운다", () => {
    expect(fillReportVar("{month} 부상 리포트", "month", "4월")).toBe("4월 부상 리포트");
  });

  /** ⚠ 값이 없는 자리표는 그대로 남긴다 (`dashboardCopy.fillVar` 와 같은 규칙) */
  it("모르는 이름은 안 건드린다", () => {
    expect(fillReportVar("{week}주차", "month", "4월")).toBe("{week}주차");
  });
});

describe("파서 — 모양이 아니면 안 받는다", () => {
  it("객체가 아니면 null", () => {
    expect(parseReportCopy(null)).toBeNull();
    expect(parseReportCopy("문안")).toBeNull();
    expect(parseReportCopy(42)).toBeNull();
  });

  /** 🔴 제목이 이 파일의 값어치다 — 셋 다 없으면 읽은 것과 못 읽은 것이 같다 */
  it("제목 은행이 하나도 없으면 null", () => {
    expect(parseReportCopy({ training: { byProgram: { TRN_VEL: ["가"] } } })).toBeNull();
  });

  it("설명 칸(`_note`)을 은행으로 안 센다", () => {
    const c = parseReportCopy({
      training: { subjects: ["가", "나", "다"], byProgram: { _note: "설명", TRN_VEL: ["A"] } },
    }) as ReportCopy;
    expect(Object.keys(c.training.byProgram)).toEqual(["TRN_VEL"]);
  });

  it("문자열이 아닌 것은 버린다", () => {
    const c = parseReportCopy({
      training: { subjects: ["가", 3, null, "나"] },
    }) as ReportCopy;
    expect(c.training.subjects).toEqual(["가", "나"]);
  });
});
