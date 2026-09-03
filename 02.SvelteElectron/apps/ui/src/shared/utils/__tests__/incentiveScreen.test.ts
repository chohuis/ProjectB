import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import type { ContractIncentive, PitcherSeasonStats } from "../../types/save";
import { primeContractRules } from "../contractTerms";
import { settleIncentives } from "../incentiveEngine";
import { incentiveProgress, incentiveProgressText } from "../incentiveProgress";
import { incentiveSettlementTableMeta, INCENTIVE_SETTLEMENT_KIND } from "../dashboardMeta";
import { buildTableView, buildTableRows, resolveColumns } from "../dashboardView";
import { parseDashboardLabels, tableCopy } from "../dashboardCopy";

/**
 * 인센티브 정산 **화면** (C 단위 9 · PLAN_CONTRACT_TERMS §5).
 *
 * 판정은 A 가 냈다(`incentiveEngine.ts` · `incentiveEngine.test.ts`). 여기가
 * 재는 것은 **같은 판정이 화면 둘에 어떻게 서는가**다.
 *
 * ```
 * 소식     msg-contract-incentive-  → 항목·결과·실측·금액 표 + 합계 각주
 * 카드     계약 정보 「올해 인센티브」 → 달성 2/4 · +3,000만 원
 * ```
 *
 * 🔴 **판정을 화면이 다시 하지 않는다.** 문턱을 두 곳에서 재면 카드와 소식이
 *    다른 답을 낸다 — 이 저장소가 문서에서 반복해 겪은 형태다.
 *
 * ⚠ **컴포넌트를 안 띄운다** (`environment: "node"`). 그려질 값은 순수 함수로
 *   재고 배선은 소스 문자열로 본다.
 */
const ROOT = resolve(__dirname, "../../../../../..");
const MASTER = resolve(ROOT, "resource/data/master");
const read = (p: string) => readFileSync(p, "utf8");

const LABELS = parseDashboardLabels(
  JSON.parse(read(join(MASTER, "messages/dashboard_labels.json"))),
);
const COPY = tableCopy(LABELS, INCENTIVE_SETTLEMENT_KIND);

const SRC_USECASE = read(resolve(__dirname, "../../usecases/incentiveSettlement.ts"));
const SRC_STATUS  = read(resolve(__dirname, "../../../pages/status/StatusPage.svelte"));

beforeAll(() => {
  primeContractRules(JSON.parse(read(join(MASTER, "players/generation_rules.json"))));
});

const stats = (o: Partial<PitcherSeasonStats>): PitcherSeasonStats => ({
  type: "pitcher", g: 0, gs: 0, w: 0, l: 0, sv: 0, hd: 0, ip: 0, er: 0, h: 0,
  bb: 0, k: 0, hb: 0, era: 0, whip: 0, ...o,
} as PitcherSeasonStats);

const inc = (o: Partial<ContractIncentive> & Pick<ContractIncentive, "kind">): ContractIncentive =>
  ({ threshold: 1, bonus: 1000, ...o });

/** 선발 셋 — 등판 달성 · 이닝 미달 · 골든글러브 미수상 */
const SP_THREE = [
  inc({ kind: "games", threshold: 25, bonus: 800 }),
  inc({ kind: "innings", threshold: 150, bonus: 1200 }),
  inc({ kind: "award", awardId: "golden", bonus: 2000 }),
];
const settled = () => settleIncentives({
  seasonYear: 2030, role: "SP", awardIds: [],
  // ⚠ 이닝은 실수다 — `120.1` 은 120과 1/3 이지 120.1 이 아니다(`ipToOuts` 머리말)
  incentives: SP_THREE, stats: stats({ g: 30, ip: 120 + 1 / 3 }),
});

// ── 문안 ───────────────────────────────────────────────────────

describe("문안 — 정산 표 자리가 있다", () => {
  it("dashboard_labels.json 에 종류가 있다", () => {
    expect(COPY.title, "table.incentiveSettlement 문안이 없다").not.toBe("");
    expect(Object.keys(COPY.columns)).toEqual(["name", "outcome", "actual", "amount"]);
  });

  /**
   * 🔴 **「조건」 열을 안 세운다** (B-30 이 남긴 물음의 답). `incentiveLabel()`
   *    이 문턱을 이름에 접어 넣어(「25등판」) 조건 열을 세우면 같은 값이 두
   *    칸에 선다 — 계약 완료 표에서도 뺐다.
   */
  it("계약 완료 인센티브 표에 조건 열이 없다", () => {
    for (const k of ["contractSigned.incentives", "faSigned.incentives"]) {
      expect(Object.keys(tableCopy(LABELS, k).columns), `${k} 에 조건 열이 남았다`)
        .toEqual(["name", "amount"]);
    }
  });

  it("결말 셋의 이름표가 다 있다", () => {
    for (const k of ["met", "missed", "unmeasurable"]) {
      expect(COPY.outcomeLabel[k], `${k} 이름표가 없다`).toBeTruthy();
    }
    // ⚠ 못 잰 축과 미달은 결과가 같아도 이유가 달라 한 말로 묶으면 안 된다
    expect(COPY.outcomeLabel.unmeasurable).not.toBe(COPY.outcomeLabel.missed);
  });

  it("합계 각주는 틀이다 — 문장을 생산부가 안 만든다", () => {
    expect(COPY.footnote).toContain("{total}");
  });

  it("소식함 대응표에 정산이 올라 있다", () => {
    const raw = JSON.parse(read(join(MASTER, "messages/dashboard_labels.json")));
    expect(raw._coverage.table["msg-contract-incentive-"])
      .toBe(`table.${INCENTIVE_SETTLEMENT_KIND}`);
  });
});

// ── 소식 표 ────────────────────────────────────────────────────

describe("정산 표 — 판정 하나에서 표가 나온다", () => {
  const md = incentiveSettlementTableMeta(settled());

  it("열 이름이 문안에서 온다", () => {
    const v = buildTableView(md, COPY);
    expect(v.columns.map((c) => c.label)).toEqual(Object.values(COPY.columns));
  });

  it("결말 낱말이 말로 바뀐다", () => {
    const rows = buildTableRows(md, resolveColumns(md, COPY), COPY);
    const outcomeCol = rows.map((r) => r.cells[1].text);
    expect(outcomeCol).toEqual([
      COPY.outcomeLabel.met, COPY.outcomeLabel.missed, COPY.outcomeLabel.missed,
    ]);
  });

  /** ⚠ 생산부가 낱말만 싣는지 — 「달성」을 소식에 굳혀 보내면 문안이 죽는다 */
  it("생산부는 met·missed 낱말을 싣는다", () => {
    expect(md.rows.map((r) => r.outcome)).toEqual(["met", "missed", "missed"]);
  });

  it("이름은 문턱까지 든 정본이다", () => {
    expect(md.rows[0].name).toBe("25등판");
    expect(md.rows[1].name).toBe("150이닝");
  });

  it("실측은 그 해 값이다 — 문턱과 나란히 선다", () => {
    expect(md.rows[0].actual).toBe("30");
    expect(md.rows[1].actual).toBe("120.1");
  });

  /** ⚠ 「골든글러브 · 실측 1」은 읽을 수 있는 말이 아니다 */
  it("수상 줄의 실측은 빈 칸이다", () => {
    expect(md.rows[2].actual).toBeNull();
    const rows = buildTableRows(md, resolveColumns(md, COPY), COPY);
    expect(rows[2].cells[2].text).toBe(COPY.emptyCell);
  });

  /** ⚠ `0만원` 은 「0원을 받았다」로 읽힌다. 안 받은 것이라 빈 칸이다 */
  it("미달 줄의 금액은 빈 칸이다", () => {
    expect(md.rows[1].amount).toBeNull();
    expect(md.rows[0].amount).toBe("800만원");
  });

  it("합계가 각주로 선다", () => {
    expect(buildTableView(md, COPY).footnote).toBe("합계 +800만원");
  });

  /** ⚠ 「합계 +0만원」은 표 아래에 둘 말이 아니다 — 미달만 있으면 각주가 없다 */
  it("지급이 없으면 각주를 안 그린다", () => {
    const none = incentiveSettlementTableMeta(settleIncentives({
      seasonYear: 2030, role: "SP", awardIds: [],
      incentives: [inc({ kind: "games", threshold: 25, bonus: 800 })],
      stats: stats({ g: 3 }),
    }));
    expect(none.footnoteVars).toBeUndefined();
    expect(buildTableView(none, COPY).footnote, "자리표가 남은 각주가 떴다").toBe("");
  });

  /** 🔴 다년 계약에서 보직이 바뀌면 그 축은 못 잰다 (§5-3 ①) */
  it("못 잰 축도 줄로 선다 — 왜 미달인지가 남는다", () => {
    const md2 = incentiveSettlementTableMeta(settleIncentives({
      seasonYear: 2031, role: "CP", awardIds: [],
      incentives: [inc({ kind: "innings", threshold: 150, bonus: 1200 })],
      stats: stats({ ip: 40 }),
    }));
    expect(md2.rows[0].outcome).toBe("unmeasurable");
    const rows = buildTableRows(md2, resolveColumns(md2, COPY), COPY);
    expect(rows[0].cells[1].text).toBe(COPY.outcomeLabel.unmeasurable);
    expect(rows[0].cells[2].text, "못 잰 값을 숫자로 적으면 안 된다").toBe(COPY.emptyCell);
  });

  it("한 줄도 없으면 문안의 빈 표 한 줄이 선다", () => {
    const empty = incentiveSettlementTableMeta({ rows: [], total: 0, settledKeys: [] });
    expect(buildTableView(empty, COPY).empty).toBe(COPY.empty);
  });

  /** ⚠ 문안을 못 읽어도 표를 안 없앤다 — 값은 이미 소식에 실려 왔다 */
  it("문안이 없으면 키를 그대로 쓴다", () => {
    const v = buildTableView(md, tableCopy(null, INCENTIVE_SETTLEMENT_KIND));
    expect(v.columns.map((c) => c.key)).toEqual(["name", "outcome", "actual", "amount"]);
    expect(v.rows[0].cells[1].text, "이름표가 없으면 낱말이 그대로 선다").toBe("met");
  });
});

// ── 배선 ───────────────────────────────────────────────────────

describe("배선 — 소식에 표가 실린다", () => {
  it("정산 소식이 metadata 를 싣는다", () => {
    expect(SRC_USECASE, "표를 안 실어 보낸다 — 본문 텍스트로만 나간다")
      .toContain("incentiveSettlementTableMeta(st)");
  });

  /** 🔴 표를 붙여도 `body` 는 그대로 둔다 — 못 그리는 자리의 폴백이다 */
  it("본문을 표로 갈아치우지 않는다", () => {
    expect(SRC_USECASE).toContain("incentiveMessageBody(copy, st)");
  });

  /** ⚠ 판정이 둘이 되면 카드와 소식이 다른 답을 낸다 */
  it("화면이 문턱을 다시 재지 않는다", () => {
    expect(SRC_STATUS, "카드가 판정 엔진을 안 부른다").toContain("incentiveProgress(");
    expect(SRC_STATUS, "카드에 문턱이 박혔다").not.toContain("threshold");
  });

  it("카드가 정산 표 문안의 「달성」을 쓴다", () => {
    expect(SRC_STATUS).toContain("outcomeLabel.met");
    expect(SRC_STATUS).toContain("올해 인센티브");
  });
});

// ── 계약 정보 카드 ─────────────────────────────────────────────

describe("카드 한 줄 — 올해 인센티브", () => {
  const args = {
    seasonYear: 2030, role: "SP", awardIds: [] as string[],
    stats: stats({ g: 30, ip: 120 + 1 / 3 }),
  };

  it("달성 수와 지급액을 센다", () => {
    const pr = incentiveProgress({ ...args, incentives: SP_THREE });
    expect(pr).toEqual({ count: 3, met: 1, amount: 800 });
  });

  /**
   * 🔴 **정산이 끝난 뒤에도 줄이 서야 한다.** 엔진은 `paidSeasons` 에 그 해가
   *    찍힌 줄을 건너뛴다(두 번 주는 걸 막는 자물쇠다) — 카드가 그걸 그대로
   *    쓰면 시즌 종료 처리 뒤에 줄이 통째로 사라진다.
   */
  it("이미 정산한 해도 그대로 보여준다", () => {
    const paid = SP_THREE.map((i) => ({ ...i, paidSeasons: [2030] }));
    expect(incentiveProgress({ ...args, incentives: paid }))
      .toEqual({ count: 3, met: 1, amount: 800 });
    // 판정 쪽은 건너뛰는 게 맞다 — 카드만 비워서 본다
    expect(settleIncentives({ ...args, incentives: paid }).rows).toHaveLength(0);
  });

  /** ⚠ 인센티브가 안 걸린 계약이면 줄을 안 그린다 — 구 세이브가 그렇다 */
  it("걸린 줄이 없으면 0 이다", () => {
    expect(incentiveProgress({ ...args, incentives: undefined }).count).toBe(0);
    expect(incentiveProgress({ ...args, incentives: [] }).count).toBe(0);
  });

  const money = (v: number) => `${v.toLocaleString()}만 원`;

  it("글자는 달성 수와 금액 둘이다", () => {
    expect(incentiveProgressText({ count: 4, met: 2, amount: 3000 }, "달성", money))
      .toBe("달성 2/4 · +3,000만 원");
  });

  /** ⚠ 「+0만 원」은 채운 게 없다는 말을 두 번 하는 것이다 */
  it("지급이 없으면 금액을 안 붙인다", () => {
    expect(incentiveProgressText({ count: 4, met: 0, amount: 0 }, "달성", money))
      .toBe("달성 0/4");
  });

  it("문안이 없으면 숫자만 그린다 — 말을 지어내지 않는다", () => {
    expect(incentiveProgressText({ count: 2, met: 1, amount: 0 }, "", money)).toBe("1/2");
  });
});
