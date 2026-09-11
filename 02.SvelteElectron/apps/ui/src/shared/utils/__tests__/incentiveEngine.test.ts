import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ContractIncentive, PitcherSeasonStats } from "../../types/save";
import { primeContractRules } from "../contractTerms";
import { parseContractTermsCopy } from "../contractCopy";
import { settleIncentives, axisMeasurable, incentiveMessageBody } from "../incentiveEngine";

/**
 * 인센티브 시즌 끝 정산 (A 단위 4 · PLAN_CONTRACT_TERMS §5 · §5-3 · §7 ⑤⑥).
 *
 * ⚠ **컴포넌트도 스토어도 안 띄운다.** 이 저장소의 vitest 는
 * `environment: "node"` 다 — 판정은 순수 함수를 직접 재고, 세계에 반영하는
 * 자리(`usecases/incentiveSettlement.ts`)와 호출부는 **소스 문자열**로 본다.
 * `contractTerms.test.ts`·`clubFinance.test.ts` 와 같은 방식이다.
 *
 * 문턱·금액은 전부 제안값이라 **여기서 숫자를 확정하지 않는다.** 검사가 보는
 * 건 판정의 모양이지 밸런스가 아니다.
 */

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(p, "utf8");
const MASTER = resolve(ROOT, "resource/data/master");

const rulesFile = JSON.parse(read(resolve(MASTER, "players/generation_rules.json"))) as Record<
  string,
  never
>;
const copyFile = JSON.parse(read(resolve(MASTER, "messages/contract_terms.json"))) as unknown;

const SRC_ENGINE = resolve(__dirname, "../incentiveEngine.ts");
const SRC_USECASE = resolve(__dirname, "../../usecases/incentiveSettlement.ts");
const SRC_ROLLOVER = resolve(__dirname, "../../usecases/seasonRollover.ts");
const SRC_STORE = resolve(__dirname, "../../stores/game.ts");

beforeAll(() => {
  // 게임과 **같은 파일**을 싣는다 — 폴백을 재면 규칙 파일이 안 걸린다
  primeContractRules(rulesFile);
});

// ── 재료 ──────────────────────────────────────────────────────
const stats = (o: Partial<PitcherSeasonStats>): PitcherSeasonStats =>
  ({
    type: "pitcher",
    g: 0,
    gs: 0,
    w: 0,
    l: 0,
    sv: 0,
    hd: 0,
    ip: 0,
    er: 0,
    h: 0,
    bb: 0,
    k: 0,
    hb: 0,
    era: 0,
    whip: 0,
    ...o,
  }) as PitcherSeasonStats;

const inc = (
  o: Partial<ContractIncentive> & Pick<ContractIncentive, "kind">,
): ContractIncentive => ({ threshold: 1, bonus: 1000, ...o });

// ── ① 축이 보직을 탄다 (§5-3) ─────────────────────────────────
describe("보직별 축", () => {
  it("규칙 파일의 byRole 을 그대로 쓴다 — 코드에 축 목록을 안 박는다", () => {
    expect(axisMeasurable("innings", "SP")).toBe(true);
    expect(axisMeasurable("saves", "CP")).toBe(true);
    expect(axisMeasurable("holds", "RP")).toBe(true);
    // 선발에 세이브 축은 없다
    expect(axisMeasurable("saves", "SP")).toBe(false);
    // 마무리에 이닝 축은 없다 — 다년 계약 중 보직이 바뀌면 여기가 걸린다
    expect(axisMeasurable("innings", "CP")).toBe(false);
  });

  it("수상은 보직과 무관하다", () => {
    for (const r of ["SP", "RP", "CP", ""]) expect(axisMeasurable("award", r)).toBe(true);
  });

  it("보직이 비면 수상 말고는 못 잰다", () => {
    expect(axisMeasurable("games", "")).toBe(false);
  });
});

// ── ② 달성 ────────────────────────────────────────────────────
describe("달성", () => {
  it("문턱 이상이면 달성이고 그만큼 지급한다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      awardIds: [],
      incentives: [
        inc({ kind: "games", threshold: 25, bonus: 800 }),
        inc({ kind: "wins", threshold: 10, bonus: 1200 }),
      ],
      stats: stats({ g: 30, w: 12, ip: 180 }),
    });
    expect(st.rows.map((r) => r.outcome)).toEqual(["met", "met"]);
    expect(st.total).toBe(2000);
    expect(st.rows[0].actual).toBe("30");
  });

  it("문턱과 같으면 달성이다 — 경계는 이상이다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      awardIds: [],
      stats: stats({ g: 25 }),
      incentives: [inc({ kind: "games", threshold: 25, bonus: 500 })],
    });
    expect(st.rows[0].outcome).toBe("met");
    expect(st.total).toBe(500);
  });

  it("ERA 만 「이하」다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      awardIds: [],
      stats: stats({ ip: 150, era: 2.75 }),
      incentives: [inc({ kind: "era", threshold: 3, bonus: 1500 })],
    });
    expect(st.rows[0].outcome).toBe("met");
    expect(st.rows[0].actual).toBe("2.75");
  });

  it("한 이닝도 안 던지면 ERA 축은 공짜가 아니다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      awardIds: [],
      stats: stats({ ip: 0, era: 0 }),
      incentives: [inc({ kind: "era", threshold: 3, bonus: 1500 })],
    });
    expect(st.rows[0].outcome).toBe("missed");
    expect(st.total).toBe(0);
  });

  it("골든글러브는 부문이 붙은 id 로 남는다 — 접두로 맞춘다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      stats: stats({ ip: 100 }),
      awardIds: ["golden_골든글러브 (투수)"],
      incentives: [inc({ kind: "award", awardId: "golden", bonus: 2000 })],
    });
    expect(st.rows[0].outcome).toBe("met");
    expect(st.total).toBe(2000);
  });

  it("MVP 는 id 가 그대로다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "CP",
      stats: stats({}),
      awardIds: ["mvp"],
      incentives: [inc({ kind: "award", awardId: "mvp", bonus: 3000 })],
    });
    expect(st.rows[0].outcome).toBe("met");
  });
});

// ── ③ 미달 ────────────────────────────────────────────────────
describe("미달", () => {
  it("문턱에 못 미치면 돈이 안 나간다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "CP",
      awardIds: [],
      stats: stats({ g: 40, sv: 18 }),
      incentives: [inc({ kind: "saves", threshold: 25, bonus: 1200 })],
    });
    expect(st.rows[0].outcome).toBe("missed");
    expect(st.rows[0].paid).toBe(0);
    expect(st.total).toBe(0);
  });

  it("성적이 통째로 없는 해도 죽지 않는다 — 전부 미달이다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "RP",
      awardIds: [],
      stats: undefined,
      incentives: [
        inc({ kind: "holds", threshold: 20, bonus: 900 }),
        inc({ kind: "games", threshold: 50, bonus: 700 }),
      ],
    });
    expect(st.rows.every((r) => r.outcome === "missed")).toBe(true);
    expect(st.total).toBe(0);
  });

  it("수상을 못 받으면 미달이다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      stats: stats({ ip: 200 }),
      awardIds: ["rookie"],
      incentives: [inc({ kind: "award", awardId: "mvp", bonus: 3000 })],
    });
    expect(st.rows[0].outcome).toBe("missed");
  });
});

// ── ④ 못 잴 축 = 미달 (§5-3 ① 사용자 확정) ────────────────────
describe("보직이 바뀐 해의 못 잴 축", () => {
  it("선발로 건 이닝 축은 마무리 해에 unmeasurable 이고 돈이 안 나간다", () => {
    const st = settleIncentives({
      // 마무리로 100이닝을 던질 리 없지만, **문턱을 넘겨도** 안 준다는 걸 본다
      seasonYear: 2031,
      role: "CP",
      awardIds: [],
      stats: stats({ ip: 200, g: 60, sv: 30 }),
      incentives: [
        inc({ kind: "innings", threshold: 150, bonus: 1500 }),
        inc({ kind: "saves", threshold: 25, bonus: 1200 }),
      ],
    });
    expect(st.rows[0].outcome).toBe("unmeasurable");
    expect(st.rows[0].paid).toBe(0);
    expect(st.rows[0].actual).toBe("");
    // 그 해 보직의 축은 정상으로 잰다
    expect(st.rows[1].outcome).toBe("met");
    expect(st.total).toBe(1200);
  });

  it("못 잰 줄도 정산은 한 것이다 — 자물쇠를 찍는다", () => {
    const st = settleIncentives({
      seasonYear: 2031,
      role: "CP",
      awardIds: [],
      stats: stats({}),
      incentives: [inc({ kind: "innings", threshold: 150, bonus: 1500 })],
    });
    expect(st.settledKeys).toHaveLength(1);
  });
});

// ── ⑤ paidSeasons — 두 번 안 준다 ─────────────────────────────
describe("중복 지급 방지", () => {
  it("그 해가 이미 찍혀 있으면 줄 자체가 안 나온다", () => {
    const paid = inc({ kind: "games", threshold: 25, bonus: 800, paidSeasons: [2030] });
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      awardIds: [],
      stats: stats({ g: 30 }),
      incentives: [paid],
    });
    expect(st.rows).toHaveLength(0);
    expect(st.settledKeys).toHaveLength(0);
    expect(st.total).toBe(0);
  });

  it("다른 해는 다시 잰다 — 다년 계약이 한 번만 주는 게 아니다", () => {
    const paid = inc({ kind: "games", threshold: 25, bonus: 800, paidSeasons: [2030] });
    const st = settleIncentives({
      seasonYear: 2031,
      role: "SP",
      awardIds: [],
      stats: stats({ g: 30 }),
      incentives: [paid],
    });
    expect(st.rows[0].outcome).toBe("met");
    expect(st.total).toBe(800);
  });

  it("스토어가 같은 열쇠(incentiveKey)로 찍는다 — 식이 둘이면 자물쇠가 안 맞는다", () => {
    const src = read(SRC_STORE);
    expect(src.includes("markIncentivesSettled(")).toBe(true);
    expect(src.includes("incentiveKey(i)")).toBe(true);
  });
});

// ── ⑥ 구 세이브 ──────────────────────────────────────────────
describe("구 세이브", () => {
  it("incentives 가 없으면 아무 일도 안 일어난다", () => {
    const st = settleIncentives({
      seasonYear: 2030,
      role: "SP",
      awardIds: [],
      stats: stats({ g: 30 }),
      incentives: undefined,
    });
    expect(st.rows).toHaveLength(0);
    expect(st.settledKeys).toHaveLength(0);
    expect(st.total).toBe(0);
  });

  it("정산 자리가 계약·인센티브 둘 다 없을 때 빠져나간다", () => {
    const src = read(SRC_USECASE);
    expect(src.includes("(contract.incentives ?? []).length === 0")).toBe(true);
  });
});

// ── ⑦ 소식 — 문장은 데이터에서만 온다 ─────────────────────────
describe("정산 소식", () => {
  it("contract_terms.json 의 incentive 통이 온전하다", () => {
    const copy = parseContractTermsCopy(copyFile);
    expect(copy).toBeTruthy();
    expect(copy!.incentive.subject.includes("{year}")).toBe(true);
    expect(copy!.incentive.met.includes("{bonus}")).toBe(true);
    expect(copy!.incentive.unmeasurable.includes("{actual}")).toBe(false);
  });

  it("달성·미달·못 잰 축이 한 통에 같이 들어가고 합계가 붙는다", () => {
    const copy = parseContractTermsCopy(copyFile)!;
    const st = settleIncentives({
      seasonYear: 2031,
      role: "CP",
      awardIds: [],
      stats: stats({ g: 60, sv: 30, ip: 65, era: 2.4 }),
      incentives: [
        inc({ kind: "saves", threshold: 25, bonus: 1200 }),
        inc({ kind: "games", threshold: 70, bonus: 800 }),
        inc({ kind: "innings", threshold: 150, bonus: 1500 }),
      ],
    });
    const body = incentiveMessageBody(copy.incentive, st);
    expect(body.includes("달성")).toBe(true);
    expect(body.includes("미달")).toBe(true);
    expect(body.includes("보직이 바뀌")).toBe(true);
    expect(body.includes("1200")).toBe(true);
    // 자리표가 남으면 안 된다
    expect(body.includes("{")).toBe(false);
  });

  it("하나도 못 채운 해는 none 한 줄이 붙는다", () => {
    const copy = parseContractTermsCopy(copyFile)!;
    const st = settleIncentives({
      seasonYear: 2031,
      role: "SP",
      awardIds: [],
      stats: stats({ g: 5 }),
      incentives: [inc({ kind: "games", threshold: 25, bonus: 800 })],
    });
    const body = incentiveMessageBody(copy.incentive, st);
    expect(body.includes(copy.incentive.none)).toBe(true);
    expect(body.includes("{")).toBe(false);
  });

  it("코드가 정산 문장을 따로 갖고 있지 않다", () => {
    // ⚠ 주석 줄은 뺀다 — 머리말이 문안 모양을 표로 적어 두었다.
    //   정규식을 안 쓴다(CLAUDE.md) — 줄 앞 글자로 가른다
    const codeOnly = (p: string) =>
      read(p)
        .split("\n")
        .filter((l) => {
          const t = l.trim();
          return !(t.startsWith("//") || t.startsWith("*") || t.startsWith("/*"));
        })
        .join("\n");
    const src = codeOnly(SRC_ENGINE) + codeOnly(SRC_USECASE);
    for (const word of ["달성 (", "미달 (", "합계 +"]) {
      expect(src.includes(word)).toBe(false);
    }
  });
});

// ── ⑧ 호출부 배선 ────────────────────────────────────────────
describe("배선", () => {
  it("시즌 종료가 정산을 부른다 — 수상 뒤다", () => {
    const src = read(SRC_ROLLOVER);
    const iAward = src.indexOf("applySeasonAwards(now)");
    const iSettle = src.indexOf("settleSeasonIncentives(now)");
    expect(iAward).toBeGreaterThan(0);
    expect(iSettle).toBeGreaterThan(iAward);
  });

  it("계약 감산(applySeasonContractProgress)보다 앞이다 — 그 시즌 계약으로 잰다", () => {
    // 감산은 롤오버의 프로 갈래에 있고, 정산은 그보다 먼저 도는
    // `runWorldSeasonEnd` 안에 있다
    const src = read(SRC_ROLLOVER);
    const iSettle = src.indexOf("settleSeasonIncentives(now)");
    const iProgress = src.indexOf("applySeasonContractProgress()");
    expect(iProgress).toBeGreaterThan(iSettle);
  });

  it("돈은 재정에 더한다", () => {
    expect(read(SRC_USECASE).includes("applyMoneyChange(st.total)")).toBe(true);
  });

  it("NPC 는 안 한다 — 주인공 계약만 읽는다", () => {
    const src = read(SRC_USECASE);
    expect(src.includes("p.contract")).toBe(true);
    expect(src.includes("npcs")).toBe(false);
  });
});
