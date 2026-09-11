import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { trainingEfficiency, trainingEfficiencyDelta, trainingSlotMults } from "../growthEngine";

/**
 * 🔴 **여기는 이제 「사본이 없다」를 지키는 자리다** (2026-09-07 · A 단위 5).
 *
 * 예전엔 `growthEngine.ts` 가 Rust `week_xp` 의 계수 셋(`condition/100` ·
 * 피로 계단 · `0.6 + d/99*0.8`)과 슬롯 배수 `[2.8, 1.3, 0.9]` 를 **옮겨
 * 적고** 있었고(결정 ④), 이 검사는 그 사본이 Rust 와 같은 수를 내는지를
 * 봤다 — 사본을 **지키는** 검사였다.
 *
 * 사본은 `trainingEfficiencyNative` 로 없앴다. 그래서 보는 것이 바뀐다:
 *   ① TS 에 계수·배수가 **적혀 있지 않다** (파일을 읽어 본다)
 *   ② Rust 가 그 계수를 **한 자리에서** 만든다 — `week_xp` 도 같은 함수를 부른다
 *   ③ 엔진이 없으면 **값을 지어 내지 않는다** (`null`)
 *
 * ⚠ ①은 정규식을 안 쓴다 — 문자열로 본다(저장소 규칙).
 */

const ROOT = resolve(__dirname, "../../../../../..");
const TS = readFileSync(resolve(__dirname, "../growthEngine.ts"), "utf8");
const RUST = readFileSync(resolve(ROOT, "packages/engine-native/src/growth_engine.rs"), "utf8");

describe("① TS 에 계수 사본이 없다", () => {
  /**
   * 🔴 **값 하나하나를 센다.** 「사본이 없다」를 함수 이름으로만 보면
   *    수만 남기고 이름을 바꿔도 통과한다 — 실제로 사본이 오래 산 이유가
   *    「식은 옮겨도 이름은 다르다」였다.
   */
  it("피로 계단 문턱·계수가 TS 에 없다", () => {
    for (const lit of ["85", "0.35", "0.65", "0.80", "200"]) {
      expect(TS.includes(`fatigue >= ${lit}`)).toBe(false);
      expect(TS.includes(`fatigue / ${lit}`)).toBe(false);
    }
    expect(TS.includes("return 0.35")).toBe(false);
    expect(TS.includes("return 0.65")).toBe(false);
  });

  it("컨디션·성실 계수가 TS 에 없다", () => {
    expect(TS.includes("condition / 100")).toBe(false);
    expect(TS.includes("diligence / 99")).toBe(false);
    expect(TS.includes("0.6 + ")).toBe(false);
  });

  it("슬롯 배수 셋이 TS 에 없다", () => {
    expect(TS.includes("[2.8, 1.3, 0.9]")).toBe(false);
    expect(TS.includes("TRAINING_SLOT_MULTS")).toBe(false);
  });

  it("계수를 엔진에 묻는다 — 그 창구가 하나다", () => {
    expect(TS.includes('api("trainingEfficiencyNative"')).toBe(true);
    // 묻는 함수가 하나뿐이다 — 둘이면 다시 갈린다
    expect(TS.split('"trainingEfficiencyNative"').length - 1).toBe(1);
  });
});

describe("② Rust 가 계수를 한 자리에서 만든다", () => {
  it("계수 함수 넷이 있다", () => {
    expect(RUST.includes("pub fn condition_factor(condition: f64) -> f64")).toBe(true);
    expect(RUST.includes("pub fn fatigue_factor(fatigue: f64) -> f64")).toBe(true);
    expect(RUST.includes("pub fn diligence_factor(diligence: f64) -> f64")).toBe(true);
    expect(RUST.includes("pub fn dev_rate_factor(dev_rate: f64) -> f64")).toBe(true);
  });

  /**
   * 🔴 **`week_xp` 가 그 함수들을 불러야 한다.** 안 부르고 식을 다시 적으면
   *    Rust 안에서 사본이 두 벌이 된다 — TS 에서 없앤 것이 그 형태다.
   */
  it("week_xp 가 식을 다시 적지 않고 그 함수들을 부른다", () => {
    const at = RUST.indexOf("fn week_xp(");
    expect(at).toBeGreaterThan(-1);
    const body = RUST.slice(at, RUST.indexOf("\n}", at));
    expect(body.includes("condition_factor(condition)")).toBe(true);
    expect(body.includes("fatigue_factor(fatigue)")).toBe(true);
    expect(body.includes("diligence_factor(diligence)")).toBe(true);
    expect(body.includes("dev_rate_factor(dev_rate)")).toBe(true);
    // 식이 남아 있으면 안 된다
    expect(body.includes("/ 100.0")).toBe(false);
    expect(body.includes("0.35")).toBe(false);
  });

  it("문(門)이 슬롯 배수를 SLOT_MULTS 에서 가져온다 — 다시 적지 않는다", () => {
    const at = RUST.indexOf("pub fn training_efficiency(");
    expect(at).toBeGreaterThan(-1);
    const body = RUST.slice(at, at + 800);
    expect(body.includes("SLOT_MULTS.iter()")).toBe(true);
    expect(body.includes("2.8")).toBe(false);
  });

  it("napi 문이 열려 있다 — 배선이 없으면 화면이 조용히 빈다", () => {
    const lib = readFileSync(resolve(ROOT, "packages/engine-native/src/lib.rs"), "utf8");
    expect(lib.includes("pub fn training_efficiency_native(")).toBe(true);
    const dts = readFileSync(resolve(ROOT, "packages/engine-native/index.d.ts"), "utf8");
    expect(dts.includes("export declare function trainingEfficiencyNative")).toBe(true);
  });
});

// ── ③ 엔진이 없으면 값을 지어 내지 않는다 ─────────────────────

describe("③ 엔진 없이는 null 이다 — 값을 지어 내면 그게 사본이다", () => {
  it("엔진이 없으면 null", async () => {
    expect(await trainingEfficiency({ condition: 100, fatigue: 0, diligence: 50 })).toBeNull();
    expect(
      await trainingEfficiencyDelta(
        { condition: 80, fatigue: 30, diligence: 60 },
        { fatigueDelta: -8 },
      ),
    ).toBeNull();
    expect(await trainingSlotMults()).toEqual([]);
  });
});

/**
 * 값 자체는 **Rust 단위검사**가 지킨다(`growth_engine.rs` 의
 * `week_xp_normal_conditions` 셋). 여기서는 **화면이 그 값을 어떻게 쓰나**만
 * 본다 — 엔진을 흉내 낸 창구를 세워 놓고 왕복·계산을 확인한다.
 *
 * ⚠ 흉내가 계수를 **다시 적지 않게** 한다 — 곱만 돌려준다. 여기 수를 적으면
 *   검사 파일이 새 사본이 된다.
 */
describe("화면이 쓰는 한 숫자 — 엔진 응답을 어떻게 읽나", () => {
  const calls: unknown[] = [];
  /** 곱을 그대로 실어 준다 — 계수는 이 파일이 만들지 않는다 */
  const fake = (totals: number[]) =>
    vi.fn(async (fn: string, payload: string) => {
      calls.push([fn, JSON.parse(payload)]);
      const qs = (JSON.parse(payload) as { queries: unknown[] }).queries;
      return JSON.stringify({
        entries: qs.map((_, i) => ({
          condition: 1,
          fatigue: 1,
          diligence: totals[i],
          total: totals[i],
        })),
        slotMults: [9.1, 9.2, 9.3],
      });
    });

  beforeEach(() => {
    calls.length = 0;
  });
  afterEach(() => {
    delete (globalThis as Record<string, unknown>).window;
  });

  const install = (fn: ReturnType<typeof fake>) => {
    (globalThis as Record<string, unknown>).window = { projectB: { engine: fn } };
  };

  it("곱을 백분율로 바꾼다 — 1.0 이 0%", async () => {
    install(fake([1.0]));
    expect((await trainingEfficiency({ condition: 100, fatigue: 0, diligence: 49.5 }))!.pct).toBe(
      0,
    );
    install(fake([1.12]));
    expect((await trainingEfficiency({ condition: 90, fatigue: 10, diligence: 70 }))!.pct).toBe(12);
    install(fake([0.77]));
    expect((await trainingEfficiency({ condition: 90, fatigue: 88, diligence: 60 }))!.pct).toBe(
      -23,
    );
  });

  /** 🔴 **왕복은 한 번이다** — 앞뒤를 따로 물으면 선택지마다 왕복이 배가 된다 */
  it("앞뒤 두 지점을 한 번에 묻는다", async () => {
    const fn = fake([1.0, 1.23]);
    install(fn);
    const d = await trainingEfficiencyDelta(
      { condition: 80, fatigue: 74, diligence: 60 },
      { fatigueDelta: -8 },
    );
    expect(d).toBe(23);
    expect(fn).toHaveBeenCalledTimes(1);
    const [, payload] = calls[0] as [string, { queries: { fatigue: number }[] }];
    expect(payload.queries).toHaveLength(2);
    expect(payload.queries[0].fatigue).toBe(74);
    expect(payload.queries[1].fatigue).toBe(66);
  });

  it("움직이는 값이 없으면 묻지도 않는다", async () => {
    const fn = fake([1]);
    install(fn);
    expect(
      await trainingEfficiencyDelta({ condition: 80, fatigue: 30, diligence: 60 }, {}),
    ).toBeNull();
    expect(fn).not.toHaveBeenCalled();
  });

  it("0% 는 null 이다 — 「효과 없음」과 「해당 없음」이 같아 보인다", async () => {
    install(fake([1.0, 1.001]));
    expect(
      await trainingEfficiencyDelta(
        { condition: 80, fatigue: 30, diligence: 60 },
        { fatigueDelta: -1 },
      ),
    ).toBeNull();
  });

  it("컨디션은 100 까지다 — 1~99 로 자르지 않는다", async () => {
    install(fake([1.0, 1.0]));
    await trainingEfficiencyDelta(
      { condition: 96, fatigue: 30, diligence: 60 },
      { conditionDelta: 4 },
    );
    const [, payload] = calls[0] as [string, { queries: { condition: number }[] }];
    expect(payload.queries[1].condition).toBe(100);
    // 나머지 둘은 1~99 로 잘린다
    calls.length = 0;
    install(fake([1.0, 1.0]));
    await trainingEfficiencyDelta(
      { condition: 50, fatigue: 95, diligence: 95 },
      { fatigueDelta: 20, diligenceDelta: 20 },
    );
    const [, p2] = calls[0] as [string, { queries: { fatigue: number; diligence: number }[] }];
    expect(p2.queries[1].fatigue).toBe(99);
    expect(p2.queries[1].diligence).toBe(99);
  });

  it("슬롯 배수도 엔진이 준다", async () => {
    install(fake([1]));
    expect([...(await trainingSlotMults())]).toEqual([9.1, 9.2, 9.3]);
  });

  it("응답이 어긋나면 null — 조용히 반쪽 값을 그리지 않는다", async () => {
    (globalThis as Record<string, unknown>).window = {
      projectB: { engine: async () => JSON.stringify({ error: "boom" }) },
    };
    expect(await trainingEfficiency({ condition: 100, fatigue: 0, diligence: 50 })).toBeNull();
  });
});

// ── 화면 배선 — 사본을 지우고 안 이으면 칸이 조용히 빈다 ────────

describe("화면 배선", () => {
  const read = (p: string) => readFileSync(resolve(__dirname, p), "utf8");

  it("훈련 화면이 엔진에 묻고, 못 물으면 칸을 안 그린다", () => {
    const src = read("../../../pages/training/TrainingPage.svelte");
    expect(src.includes("await trainingEfficiency({")).toBe(true);
    expect(src.includes("{#if eff}")).toBe(true);
    expect(src.includes("trainingSlotMults()")).toBe(true);
    expect(src.includes("TRAINING_SLOT_MULTS")).toBe(false);
  });

  it("소식 선택지 꼬리가 미리 재 둔 표를 읽는다", () => {
    const src = read("../../../pages/news/NewsPage.svelte");
    expect(src.includes("await trainingEfficiencyDelta(")).toBe(true);
    expect(src.includes("effTails.get(opt.id)")).toBe(true);
    // `{@const}` 안에서 부르던 옛 함수가 없다
    expect(src.includes("effHintTail(")).toBe(false);
  });
});
