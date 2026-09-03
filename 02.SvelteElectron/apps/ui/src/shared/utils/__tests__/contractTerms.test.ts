import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ContractIncentive } from "../../types/save";
import {
  CLAUSE_OPTIONS, clauseById, clauseAddable, addClause, removeClause,
  clauseTerms, clauseMultiplier,
  primeContractRules, contractRules, minSalaryOf, awardLabelOf,
  incentiveCandidates, incentiveLabel, incentiveKey, incentiveAddable,
  addIncentive, removeIncentive, incentiveTotal, incentiveTotalCap, maxIncentives,
  counterOfferRounds, requestedSalaryOf, contractTotalValue,
  acceptThresholdOf, acceptProbabilityOf, compareRows,
  type ClauseId,
} from "../contractTerms";

/**
 * 신규 계약 협상 화면 (1.1 C③ · PLAN_CONTRACT_TERMS §3·§4·§5-2·§8).
 *
 * ⚠ **컴포넌트를 안 띄운다.** 이 저장소의 vitest 는 `environment: "node"` 다.
 * 계산은 순수 함수를 직접 재고, 화면이 그걸 쓰는지는 소스 문자열로 본다 —
 * `faOfferTerms.test.ts` 와 같은 방식이다.
 *
 * 🔴 **실측을 못 했다.** FA·재계약이 열리는 세이브를 헤드리스로 못 만든다 —
 * 재계약 협상은 프로 계약 만료(W39)에서만 열리고 `salaryNegotiation` pending 은
 * Electron 을 거쳐야 뜬다. A 프로브가 도는 중이라 앱을 안 띄웠다.
 * 그래서 **컴포넌트 단위 검사로 대신한다**(A 지시대로).
 */

const ROOT = resolve(__dirname, "../../../../../..");
const RULES_PATH = resolve(ROOT, "resource/data/master/players/generation_rules.json");
const read = (p: string) => readFileSync(p, "utf8");
const rulesFile = JSON.parse(read(RULES_PATH)) as Record<string, never>;

const SRC_MODAL = resolve(__dirname, "../../../features/contract/ui/ContractNegotiationModal.svelte");
const SRC_MASTER = resolve(__dirname, "../../stores/master.ts");

beforeAll(() => {
  // 화면과 **같은 파일**을 싣는다 — 검사가 코드 폴백을 재면 규칙 파일이 안 걸린다
  primeContractRules(rulesFile);
});

// ── ① 규칙 파일 배선 ──────────────────────────────────────────
describe("규칙은 파일에서 온다", () => {
  it("generation_rules.json 에 contractRules 가 있다", () => {
    const c = (rulesFile as unknown as { contractRules?: unknown }).contractRules;
    expect(c).toBeTruthy();
  });

  it("부팅 때 primeContractRules 를 부른다", () => {
    expect(read(SRC_MASTER).includes("primeContractRules(")).toBe(true);
  });

  it("최저연봉을 파일에서 읽는다 — 코드에 리그별 숫자를 안 박는다", () => {
    expect(minSalaryOf("LEAGUE_KBL")).toBeGreaterThan(0);
    expect(minSalaryOf("LEAGUE_INDEPENDENT")).toBeGreaterThan(0);
    // 모르는 리그는 0 — 하한을 지어내지 않는다
    expect(minSalaryOf("LEAGUE_NOT_REAL")).toBe(0);
  });

  it("수상 이름표는 awardRules 가 정본이다", () => {
    expect(awardLabelOf("mvp")).toBe("MVP");
    expect(awardLabelOf("golden")).toBe("골든글러브");
  });

  it("후보의 축이 그 보직의 byRole 안에 있다 (수상은 예외)", () => {
    const r = contractRules().incentives;
    for (const c of r.candidates) {
      if (c.kind === "award") continue;
      for (const role of c.roles) {
        expect(r.byRole[role]).toContain(c.kind);
      }
    }
  });

  it("보직은 셋뿐이다 — 스윙맨·오프너 없음", () => {
    expect(Object.keys(contractRules().incentives.byRole).sort()).toEqual(["CP", "RP", "SP"]);
  });
});

// ── ② 조항 — ＋ 추가 / × 빼기 ─────────────────────────────────
describe("조항", () => {
  it("계수 다섯이 예전 화면 값 그대로다", () => {
    const m = Object.fromEntries(CLAUSE_OPTIONS.map((c) => [c.id, c.mult]));
    expect(m).toEqual({
      noTrade: 0.95, playerOption1: 0.97, playerOption2: 0.94,
      teamOption1: 1.05, teamOption2: 1.10,
    });
  });

  it("더하면 목록이 늘고 빼면 준다", () => {
    let picked: ClauseId[] = [];
    picked = addClause(picked, "noTrade");
    expect(picked).toEqual(["noTrade"]);
    picked = addClause(picked, "teamOption1");
    expect(picked).toHaveLength(2);
    picked = removeClause(picked, "noTrade");
    expect(picked).toEqual(["teamOption1"]);
  });

  it("한 무리에 하나뿐이다 — 선수 옵션 1년과 2년을 같이 못 건다", () => {
    const picked = addClause(["playerOption1"], "playerOption2");
    expect(picked).toEqual(["playerOption1"]);
    expect(clauseAddable(["playerOption1"], "playerOption2")).toBe(false);
    // 다른 무리는 걸린다 — 대조군
    expect(clauseAddable(["playerOption1"], "teamOption1")).toBe(true);
  });

  it("고른 조항이 계약서 칸으로 간다", () => {
    expect(clauseTerms(["noTrade", "teamOption2", "playerOption1"]))
      .toEqual({ noTrade: true, teamOptionYears: 2, playerOptionYears: 1 });
    expect(clauseTerms([])).toEqual({ noTrade: false, teamOptionYears: 0, playerOptionYears: 0 });
  });

  it("계수는 곱이다", () => {
    expect(clauseMultiplier([])).toBe(1);
    expect(clauseMultiplier(["noTrade", "teamOption1"])).toBeCloseTo(0.95 * 1.05, 10);
  });

  it("이름이 FA 카드·선수 상세와 같은 말이다", () => {
    expect(clauseById("noTrade").label).toBe("노트레이드");
    expect(clauseById("teamOption1").label).toBe("팀 옵션 1년");
    expect(clauseById("playerOption2").label).toBe("선수 옵션 2년");
  });
});

// ── ③ 인센티브 — 상한 3 · 축 · 금액 ───────────────────────────
describe("인센티브", () => {
  const SALARY = 20000;

  it("상한은 3이다 (✅ 사용자 확정)", () => {
    expect(maxIncentives()).toBe(3);
  });

  it("보직 축만 후보로 나온다", () => {
    const sp = incentiveCandidates("SP", SALARY).map((c) => c.kind);
    const cp = incentiveCandidates("CP", SALARY).map((c) => c.kind);
    expect(sp).toContain("innings");
    expect(sp).not.toContain("saves");
    expect(cp).toContain("saves");
    expect(cp).not.toContain("innings");
  });

  it("수상은 보직과 무관하게 나온다", () => {
    for (const role of ["SP", "RP", "CP"]) {
      expect(incentiveCandidates(role, SALARY).some((c) => c.kind === "award")).toBe(true);
    }
  });

  it("보직이 없으면(타자·미정) 후보가 없다 — 화면이 칸을 안 연다", () => {
    expect(incentiveCandidates("", SALARY)).toHaveLength(0);
    expect(incentiveCandidates("C", SALARY)).toHaveLength(0);
  });

  it("셋까지 더하고 넷째는 안 들어간다", () => {
    const cands = incentiveCandidates("SP", SALARY);
    expect(cands.length).toBeGreaterThanOrEqual(4);
    let picked: ContractIncentive[] = [];
    for (const c of cands) picked = addIncentive(picked, c, 999999);
    expect(picked).toHaveLength(3);
  });

  it("같은 항목을 두 번 못 건다", () => {
    const c = incentiveCandidates("SP", SALARY)[0];
    const picked = addIncentive(addIncentive([], c, 999999), c, 999999);
    expect(picked).toHaveLength(1);
  });

  it("빼면 준다", () => {
    const cands = incentiveCandidates("SP", SALARY);
    let picked = addIncentive(addIncentive([], cands[0], 999999), cands[1], 999999);
    expect(picked).toHaveLength(2);
    picked = removeIncentive(picked, incentiveKey(cands[0]));
    expect(picked).toHaveLength(1);
    expect(incentiveKey(picked[0])).toBe(incentiveKey(cands[1]));
  });

  it("총액 상한을 넘기면 안 들어간다", () => {
    const cands = incentiveCandidates("SP", SALARY);
    const cap = incentiveTotalCap(SALARY);
    expect(cap).toBeGreaterThan(0);
    let picked: ContractIncentive[] = [];
    for (const c of cands) picked = addIncentive(picked, c, SALARY);
    expect(incentiveTotal(picked)).toBeLessThanOrEqual(cap);
  });

  it("항목당 금액이 연봉의 perItemPct 를 안 넘는다", () => {
    const r = contractRules().incentives;
    const cap = Math.round((SALARY * (r.perItemPctOfSalary / 100)) / 100) * 100;
    for (const c of incentiveCandidates("SP", SALARY)) {
      expect(c.bonus).toBeLessThanOrEqual(cap);
    }
  });

  it("항목 이름 — 조사를 안 붙인다", () => {
    expect(incentiveLabel({ kind: "games", threshold: 25 })).toBe("25등판");
    expect(incentiveLabel({ kind: "innings", threshold: 150 })).toBe("150이닝");
    expect(incentiveLabel({ kind: "era", threshold: 3 })).toBe("ERA 3.00 이하");
    expect(incentiveLabel({ kind: "wins", threshold: 10 })).toBe("10승");
    expect(incentiveLabel({ kind: "award", threshold: 1, awardId: "golden" })).toBe("골든글러브");
  });

  it("고른 항목이 kind·threshold 를 들고 간다 — 문자열이 아니다", () => {
    const c = incentiveCandidates("CP", SALARY).find((x) => x.kind === "saves")!;
    expect(typeof c.kind).toBe("string");
    expect(typeof c.threshold).toBe("number");
    expect(typeof c.bonus).toBe("number");
    expect((c as unknown as { condition?: unknown }).condition).toBeUndefined();
  });
});

// ── ④ 최저연봉 하한 (✅ 사용자 확정 6) ────────────────────────
describe("최저연봉 하한", () => {
  const MIN = 3000;

  it("−20% 로 내려도 하한 아래로 안 간다", () => {
    expect(requestedSalaryOf(3200, -0.2, MIN)).toBe(MIN);
  });

  it("하한 위에서는 그대로 계산한다", () => {
    expect(requestedSalaryOf(20000, -0.2, MIN)).toBe(16000);
    expect(requestedSalaryOf(20000, 0.2, MIN)).toBe(24000);
    expect(requestedSalaryOf(20000, 0, MIN)).toBe(20000);
  });

  it("하한이 0이면(모르는 리그) 안 걸린다 — 대조군", () => {
    expect(requestedSalaryOf(3200, -0.2, 0)).toBe(2600);
  });

  it("제시액이 하한보다 낮아도 하한이 이긴다", () => {
    expect(requestedSalaryOf(1000, 0, MIN)).toBe(MIN);
  });
});

// ── ⑤ 역제안 횟수 (§5-2 ✅ 계수 확정) ─────────────────────────
describe("역제안 횟수 = 1 + (성적≥65) + (관계≥30) − (성적<40 && 관계<0)", () => {
  const cases: [number, number, number][] = [
    // 성적, 관계, 기대
    [50,   0, 1],   // 아무것도 안 걸린다
    [65,   0, 2],   // 성적만
    [64,   0, 1],   // 문턱 바로 아래
    [50,  30, 2],   // 관계만
    [50,  29, 1],
    [65,  30, 3],   // 둘 다
    [100, 100, 3],  // 상한
    [39,  -1, 1],   // 둘 다 나쁘면 1 − 1 = 0 → clamp 1
    [39,   0, 1],   // 관계가 0 이면 벌칙이 안 걸린다 (penaltyOwnerBelow 0)
    [40,  -1, 1],   // 성적이 40 이면 벌칙이 안 걸린다
    [0,  -100, 1],  // 하한
  ];

  for (const [rating, owner, want] of cases) {
    it(`성적 ${rating} · 관계 ${owner} → ${want}회`, () => {
      expect(counterOfferRounds(rating, owner)).toBe(want);
    });
  }

  it("1~3 을 벗어나지 않는다", () => {
    for (let r = 0; r <= 100; r += 5) {
      for (let o = -100; o <= 100; o += 10) {
        const v = counterOfferRounds(r, o);
        expect(v).toBeGreaterThanOrEqual(1);
        expect(v).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ── ⑥ 구단 판정 ──────────────────────────────────────────────
describe("허용치와 수락 확률", () => {
  const base = {
    effectiveOffer: 20000, offeredYears: 2, requestedYears: 2,
    clauses: [] as ClauseId[], incentiveCount: 0,
  };

  it("기본 허용치는 제시액 × 1.15 다 — 예전 식 그대로", () => {
    expect(acceptThresholdOf(base)).toBe(23000);
  });

  it("기간을 늘리면 허용치가 는다 (+3%/년)", () => {
    expect(acceptThresholdOf({ ...base, requestedYears: 3 }))
      .toBe(Math.round(20000 * 1.15 * 1.03));
  });

  it("노트레이드를 걸면 허용치가 준다", () => {
    expect(acceptThresholdOf({ ...base, clauses: ["noTrade"] })).toBeLessThan(acceptThresholdOf(base));
  });

  it("팀 옵션을 받으면 허용치가 는다", () => {
    expect(acceptThresholdOf({ ...base, clauses: ["teamOption2"] })).toBeGreaterThan(acceptThresholdOf(base));
  });

  it("인센티브를 걸수록 허용치가 는다 (제안 1.02)", () => {
    const a = acceptThresholdOf(base);
    const b = acceptThresholdOf({ ...base, incentiveCount: 1 });
    const c = acceptThresholdOf({ ...base, incentiveCount: 3 });
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
    expect(c).toBe(Math.round(20000 * 1.15 * Math.pow(1.02, 3)));
  });

  it("허용치 안이면 95%, 넘으면 급히 떨어진다", () => {
    expect(acceptProbabilityOf(23000, 23000)).toBe(95);
    expect(acceptProbabilityOf(10000, 23000)).toBe(95);
    expect(acceptProbabilityOf(25300, 23000)).toBe(95 - 40); // 10% 초과 → −40
    expect(acceptProbabilityOf(999999, 23000)).toBe(0);
  });
});

// ── ⑦ 비교표 ─────────────────────────────────────────────────
describe("비교표 (지금 / 제시 / 역제안)", () => {
  const input = {
    current: { salary: 14000, years: 3, signingBonus: 0, noTrade: false, incentiveTotal: 0 },
    offered: { salary: 18000, years: 2, signingBonus: 0 },
    counter: {
      salary: 18000, years: 2, signingBonus: 0,
      clauses: [] as ClauseId[], incentives: [] as ContractIncentive[],
    },
    yes: "있음", no: "없음",
  };

  it("여섯 줄이다", () => {
    expect(compareRows(input).map((r) => r.key))
      .toEqual(["salary", "years", "signingBonus", "incentive", "noTrade", "total"]);
  });

  it("지금 계약이 없으면 그 칸이 null 이다 — 0 으로 안 채운다", () => {
    const rows = compareRows({ ...input, current: null });
    expect(rows.every((r) => r.current === null)).toBe(true);
  });

  it("역제안이 제시보다 높으면 up, 낮으면 down 이다", () => {
    const up = compareRows({ ...input, counter: { ...input.counter, salary: 20000 } });
    expect(up.find((r) => r.key === "salary")!.dir).toBe("up");
    const dn = compareRows({ ...input, counter: { ...input.counter, salary: 16000 } });
    expect(dn.find((r) => r.key === "salary")!.dir).toBe("down");
  });

  it("총액에 인센티브가 더해진다", () => {
    const inc: ContractIncentive[] = [{ kind: "games", threshold: 25, bonus: 1500 }];
    const rows = compareRows({ ...input, counter: { ...input.counter, incentives: inc } });
    expect(rows.find((r) => r.key === "incentive")!.counter).toBe("1,500");
    expect(rows.find((r) => r.key === "total")!.counter)
      .toBe((18000 * 2 + 1500).toLocaleString());
  });

  it("노트레이드는 조항을 걸어야 「있음」이 된다", () => {
    expect(compareRows(input).find((r) => r.key === "noTrade")!.counter).toBe("없음");
    const on = compareRows({ ...input, counter: { ...input.counter, clauses: ["noTrade"] } });
    expect(on.find((r) => r.key === "noTrade")!.counter).toBe("있음");
  });

  it("총액 식이 FA 카드와 같다 — 연봉 × 기간 + 계약금", () => {
    expect(contractTotalValue(18000, 2, 3000)).toBe(18000 * 2 + 3000);
  });
});

// ── ⑧ 화면 배선 ──────────────────────────────────────────────
describe("협상 화면이 이 함수들을 쓴다", () => {
  const src = read(SRC_MODAL);

  it("계산을 화면 안에서 다시 하지 않는다", () => {
    for (const fn of [
      "acceptThresholdOf", "acceptProbabilityOf", "counterOfferRounds",
      "requestedSalaryOf", "minSalaryOf", "incentiveCandidates", "compareRows",
    ]) {
      expect(src.includes(`${fn}(`)).toBe(true);
    }
    // 예전 화면이 갖고 있던 계수를 화면에 다시 적지 않았다
    expect(src.includes("* 1.15")).toBe(false);
    expect(src.includes("0.95")).toBe(false);
  });

  it("「＋ 추가」와 「×」로 넣고 뺀다 — 늘 떠 있는 체크박스가 아니다", () => {
    expect(src.includes("＋ 추가")).toBe(true);
    expect(src.includes("addClause(")).toBe(true);
    expect(src.includes("removeClause(")).toBe(true);
    expect(src.includes("addIncentive(")).toBe(true);
    expect(src.includes("removeIncentive(")).toBe(true);
    expect(src.includes('type="checkbox"')).toBe(false);
  });

  it("문장은 contract_terms.json 에서만 온다", () => {
    expect(src.includes("fillContractCopy(")).toBe(true);
    expect(src.includes("최저연봉이")).toBe(false);
  });

  it("구단주 관계를 숫자로 안 그린다 (relationship.ts 규칙)", () => {
    expect(src.includes("{ownerRelation}")).toBe(false);
    expect(src.includes("역제안 {roundsLeft}회 남음")).toBe(true);
  });
});

// ── ⑨ 「노트레이드」 표기 통일 (A 지시 2) ─────────────────────
describe("노트레이드 표기가 화면마다 같다", () => {
  const files = [
    SRC_MODAL,
    resolve(__dirname, "../../../features/player/ui/PlayerDetailModal.svelte"),
    resolve(__dirname, "../../../features/contract/ui/FaMarketModal.svelte"),
    resolve(__dirname, "../../../features/contract/ui/TradeModal.svelte"),
    resolve(__dirname, "../faOfferTerms.ts"),
  ];

  it("「트레이드 거부권」이 한 자리도 안 남았다", () => {
    for (const f of files) expect(read(f).includes("트레이드 거부권")).toBe(false);
  });

  it("이름표 정본은 한 곳이다 — 협상 화면이 따로 안 적는다", () => {
    expect(read(SRC_MODAL).includes('"노트레이드"')).toBe(false);
    expect(clauseById("noTrade").label).toBe("노트레이드");
  });
});

// ── ⑩ 문안 파일 (B-13) ───────────────────────────────────────
describe("contract_terms.json 을 로더가 받는다", () => {
  const COPY_PATH = resolve(ROOT, "resource/data/master/messages/contract_terms.json");

  it("실제 파일이 로더를 통과한다 — 어긋나면 화면이 안내 줄을 통째로 잃는다", async () => {
    const { parseContractTermsCopy, fillContractCopy } = await import("../contractCopy");
    const copy = parseContractTermsCopy(JSON.parse(read(COPY_PATH)));
    expect(copy).not.toBeNull();
    expect(copy!.minSalary.floor.includes("{minSalary}")).toBe(true);
    expect(fillContractCopy(copy!.minSalary.floor, { minSalary: "3,000" })).toContain("3,000");
  });

  it("한 칸이 비면 null 이다 — 대조군", async () => {
    const { parseContractTermsCopy } = await import("../contractCopy");
    const raw = JSON.parse(read(COPY_PATH));
    delete raw.minSalary.floor;
    expect(parseContractTermsCopy(raw)).toBeNull();
  });

  it("부팅 때 그 파일을 읽는다", () => {
    expect(read(SRC_MASTER).includes("messages/contract_terms.json")).toBe(true);
    expect(read(SRC_MASTER).includes("parseContractTermsCopy(")).toBe(true);
  });
});
