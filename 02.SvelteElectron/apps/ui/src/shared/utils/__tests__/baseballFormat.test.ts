import { describe, it, expect } from "vitest";
import {
  ipLabel,
  ipToOuts,
  rateLabel,
  eraLabel,
  gaugeLabel,
  seasonLabel,
  wpctLabel,
  totalBases,
} from "../baseballFormat";

/**
 * 야구 기록 표기 — **관례가 있는 숫자들이다.**
 *
 * 🔴 실제 플레이에서 나온 것들(2026-08-26):
 *   · IP가 소수점이 안 잘려 그대로 나왔다
 *   · 타율이 `.30`으로 나왔다 (야구는 `.300`이다)
 *   · 피로가 소수 셋째 자리까지 나왔다
 */

describe("이닝(IP)", () => {
  it("아웃 개수를 소수 첫 자리로 쓴다", () => {
    expect(ipLabel(31)).toBe("31");
    expect(ipLabel(31 + 1 / 3)).toBe("31.1");
    expect(ipLabel(31 + 2 / 3)).toBe("31.2");
  });

  // 🔴 3아웃이면 한 이닝이 끝난 것이다 — `.3`은 야구에 없는 표기다
  it("`.3`을 만들지 않는다 — 정수로 올린다", () => {
    expect(ipLabel(31.9)).toBe("32");
    expect(ipLabel(31.999)).toBe("32");
  });

  it("정수 이닝에 소수점을 안 붙인다", () => {
    expect(ipLabel(0)).toBe("0");
    expect(ipLabel(200)).toBe("200");
  });

  it("이상한 값은 `-`다 — 화면이 안 깨진다", () => {
    expect(ipLabel(NaN)).toBe("-");
    expect(ipLabel(-1)).toBe("-");
  });

  // 🔴 `31.2`는 31.667이지 31.2가 아니다. 나눗셈에 그대로 쓰면 기록이 틀어진다
  it("나눗셈용으로 아웃 수를 되돌린다 — 입력은 실수 이닝이다", () => {
    expect(ipToOuts(31)).toBe(93);
    expect(ipToOuts(31 + 1 / 3)).toBe(94);
    expect(ipToOuts(31 + 2 / 3)).toBe(95);
  });

  // ⚠ **야구 표기를 넣으면 틀린다.** `31.2`는 실수로 31.2이닝이라 93개다 —
  //   31과 2/3(95개)가 아니다. 엔진이 두 형식을 섞고 있어 적어 둔다.
  it("야구 표기를 넣으면 값이 다르다 — 섞으면 안 된다", () => {
    expect(ipToOuts(31.2)).toBe(94); // 실수 31.2이닝 = 93.6아웃
    expect(ipToOuts(31 + 2 / 3)).toBe(95);
  });
});

describe("비율 기록", () => {
  it("소수 셋째 자리까지 쓰고 앞의 0을 뗀다", () => {
    expect(rateLabel(0.3)).toBe(".300");
    expect(rateLabel(0.2857)).toBe(".286");
    expect(rateLabel(0)).toBe(".000");
  });

  it("1 이상은 0을 안 뗀다 — 장타율은 1을 넘는다", () => {
    expect(rateLabel(1)).toBe("1.000");
    expect(rateLabel(1.234)).toBe("1.234");
  });

  it("없는 값은 `-`다", () => {
    expect(rateLabel(null)).toBe("-");
    expect(rateLabel(undefined)).toBe("-");
    expect(rateLabel(NaN)).toBe("-");
  });
});

describe("평균자책점·WHIP", () => {
  it("소수 둘째 자리다", () => {
    expect(eraLabel(3.5)).toBe("3.50");
    expect(eraLabel(0)).toBe("0.00");
  });

  // ⚠ 이닝 0이면 나눗셈이 Infinity다 — 야구는 그걸 `-`로 쓴다
  it("Infinity는 `-`다", () => {
    expect(eraLabel(Infinity)).toBe("-");
  });
});

describe("상태값(컨디션·피로·사기)", () => {
  it("소수 한 자리까지만 보인다", () => {
    expect(gaugeLabel(58.333333)).toBe("58.3");
    expect(gaugeLabel(22.274999999999977)).toBe("22.3");
  });

  it("정수면 소수점을 안 붙인다", () => {
    expect(gaugeLabel(58)).toBe("58");
    expect(gaugeLabel(58.04)).toBe("58");
  });

  it("없는 값은 `-`다", () => {
    expect(gaugeLabel(undefined)).toBe("-");
  });
});

describe("시즌 표기", () => {
  it("상대 표기를 실제 연도로 바꾼다", () => {
    expect(seasonLabel("S-1", 2026)).toBe("2025");
    expect(seasonLabel("S-5", 2026)).toBe("2021");
  });

  // ⚠ 두 형식이 섞여 있어도 화면이 안 깨져야 한다
  it("이미 연도면 그대로 둔다", () => {
    expect(seasonLabel("2025", 2026)).toBe("2025");
    expect(seasonLabel("", 2026)).toBe("");
  });
});

describe("승률 · 루타", () => {
  it("승률은 앞의 0을 뗀다", () => {
    expect(wpctLabel(2, 2)).toBe(".500");
    expect(wpctLabel(3, 0)).toBe("1.000");
    expect(wpctLabel(1, 3)).toBe(".250");
  });

  /** 🔴 **결정이 없으면 0할이 아니라 없는 값이다** — `.000`은 거짓이다 */
  it("승패가 없으면 비율이 아니다", () => {
    expect(wpctLabel(0, 0)).toBe("-");
    expect(wpctLabel(undefined, undefined)).toBe("-");
  });

  it("루타는 장타를 제 값으로 센다", () => {
    // 안타 10 = 단타 5 + 2루타 3 + 3루타 1 + 홈런 1
    // TB = 5 + 6 + 3 + 4 = 18
    expect(totalBases(10, 1, 3, 1)).toBe(18);
    // 전부 단타면 안타 수와 같다
    expect(totalBases(10, 0, 0, 0)).toBe(10);
  });

  /**
   * 🔴 **구 세이브는 낼 수 없다.** 0을 주면 "루타 0인 타자"가 되어 거짓이다 —
   *   화면이 `—`를 찍게 `undefined`를 돌려준다.
   */
  it("장타 수를 모르면 낼 수 없다", () => {
    expect(totalBases(10, 1, undefined, undefined)).toBeUndefined();
  });
});
