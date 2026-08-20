import { describe, it, expect } from "vitest";
import {
  MONTH_STARTS_1, MONTH_NAMES, monthIndexOf, monthNameOf,
  isMonthStart, weekInMonthOf, weekLabelOf, prevMonthRange, monthWeekRange,
} from "../seasonCalendar";

/**
 * 주차↔월 표를 하나로 모은 뒤에도 **결과가 같은가**.
 *
 * 🔴 네 곳에 흩어져 있던 표를 모았다. 값이 하나라도 달라지면 화면에 엉뚱한
 * 달이 뜨는데 **오류는 안 난다** — 그래서 옛 구현을 여기 그대로 옮겨 놓고
 * 새 구현과 맞춰 본다.
 */

// ── 옛 구현 (game.ts · top10Engine.ts — 0-based) ──────────────
const OLD_STARTS_0 = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
const OLD_NAMES = ["3월","4월","5월","6월","7월","8월","9월","10월","11월","12월","1월","2월"];

function oldWeekLabel(week: number, seasonYear: number): string {
  const w = (Math.max(1, week) - 1) % 52;
  let monthIdx = 0;
  for (let i = OLD_STARTS_0.length - 1; i >= 0; i -= 1) {
    if (w >= OLD_STARTS_0[i]) { monthIdx = i; break; }
  }
  const weekInMonth = w - OLD_STARTS_0[monthIdx] + 1;
  return `${seasonYear}년 ${OLD_NAMES[monthIdx]} ${weekInMonth}주차`;
}

function oldMonthLabel(weekInYear: number): string {
  const w = Math.max(0, (weekInYear - 1) % 52);
  let idx = 0;
  for (let i = OLD_STARTS_0.length - 1; i >= 0; i--) {
    if (w >= OLD_STARTS_0[i]) { idx = i; break; }
  }
  return OLD_NAMES[idx];
}

// ── 옛 구현 (growth.ts · friendlyMatchEngine.ts — 1-based) ────
const OLD_STARTS_1 = [1, 6, 10, 14, 19, 23, 27, 32, 36, 40, 45, 49];

function oldPrevMonthRange(weekInYear: number): { start: number; end: number } {
  const idx = OLD_STARTS_1.findIndex((w) => w === weekInYear);
  if (idx <= 0) return { start: 1, end: weekInYear - 1 };
  return { start: OLD_STARTS_1[idx - 1], end: weekInYear - 1 };
}

const ALL_WEEKS = Array.from({ length: 52 }, (_, i) => i + 1);

describe("주차↔월 표를 모은 뒤에도 결과가 같은가", () => {
  it("주차 라벨이 옛 game.ts와 52주 전부 같다", () => {
    for (const w of ALL_WEEKS) {
      expect(weekLabelOf(w, 2027), `W${w}`).toBe(oldWeekLabel(w, 2027));
    }
  });

  it("월 이름이 옛 top10Engine과 52주 전부 같다", () => {
    for (const w of ALL_WEEKS) {
      expect(monthNameOf(w), `W${w}`).toBe(oldMonthLabel(w));
    }
  });

  it("이전 달 범위가 옛 growth.ts와 같다", () => {
    for (const w of ALL_WEEKS) {
      expect(prevMonthRange(w), `W${w}`).toEqual(oldPrevMonthRange(w));
    }
  });

  it("달 시작 판정이 옛 friendlyMatchEngine과 같다", () => {
    for (const w of ALL_WEEKS) {
      expect(isMonthStart(w), `W${w}`).toBe(OLD_STARTS_1.includes(w));
    }
  });
});

describe("표 자체가 성립하는가", () => {
  it("달이 열둘이고 이름도 열둘이다", () => {
    expect(MONTH_STARTS_1).toHaveLength(12);
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it("시작 주차가 오름차순이고 52 안에 있다", () => {
    for (let i = 1; i < MONTH_STARTS_1.length; i++) {
      expect(MONTH_STARTS_1[i], `${i}번째`).toBeGreaterThan(MONTH_STARTS_1[i - 1]);
    }
    expect(MONTH_STARTS_1[0]).toBe(1);
    expect(MONTH_STARTS_1[11]).toBeLessThanOrEqual(52);
  });

  it("3월에서 시작해 이듬해 2월에 끝난다", () => {
    // ⚠ 한국 학사 연도가 3월 시작이고 게임 W1이 3월 첫 주다
    expect(MONTH_NAMES[0]).toBe("3월");
    expect(MONTH_NAMES[10]).toBe("1월");
    expect(MONTH_NAMES[11]).toBe("2월");
    expect(monthNameOf(1)).toBe("3월");
    expect(monthNameOf(52)).toBe("2월");
  });

  it("달 시작 주차의 weekInMonth는 1이다", () => {
    for (const w of MONTH_STARTS_1) expect(weekInMonthOf(w), `W${w}`).toBe(1);
  });

  it("52를 넘겨도 감아 돈다", () => {
    expect(monthIndexOf(53)).toBe(monthIndexOf(1));
    expect(monthNameOf(104)).toBe(monthNameOf(52));
  });
});

describe("master.ts의 월→주차 변환도 같은 표를 쓴다", () => {
  // `scheduleToWeek(month, weekOfMonth)` — 이벤트 JSON이 "6월 2주차" 같은
  // 표기를 쓴다. 옛 구현은 0-based 사본을 봤다
  const OLD = [0, 5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48];
  const oldScheduleToWeek = (month: number, weekOfMonth: number) => {
    const idx = month >= 3 ? month - 3 : month + 9;
    return (OLD[idx] ?? 0) + weekOfMonth;
  };
  const newScheduleToWeek = (month: number, weekOfMonth: number) => {
    const idx = month >= 3 ? month - 3 : month + 9;
    return ((MONTH_STARTS_1[idx] ?? 1) - 1) + weekOfMonth;
  };

  it("열두 달 × 1~5주차가 전부 같다", () => {
    for (let m = 1; m <= 12; m++) {
      for (let w = 1; w <= 5; w++) {
        expect(newScheduleToWeek(m, w), `${m}월 ${w}주차`)
          .toBe(oldScheduleToWeek(m, w));
      }
    }
  });
});

describe('monthWeekRange — 친선경기가 쓴다', () => {
  const OLD_S1 = [1, 6, 10, 14, 19, 23, 27, 32, 36, 40, 45, 49];
  const oldRange = (w: number): [number, number] => {
    let idx = 0;
    for (let i = OLD_S1.length - 1; i >= 0; i--) { if (w >= OLD_S1[i]) { idx = i; break; } }
    return [OLD_S1[idx], idx + 1 < OLD_S1.length ? OLD_S1[idx + 1] - 1 : 52];
  };

  it('옛 friendlyMatchEngine과 52주 전부 같다', () => {
    for (let w = 1; w <= 52; w++) expect(monthWeekRange(w)).toEqual(oldRange(w));
  });

  it('범위가 그 주를 담는다', () => {
    for (let w = 1; w <= 52; w++) {
      const [s2, e] = monthWeekRange(w);
      expect(s2, 'W' + w).toBeLessThanOrEqual(w);
      expect(e, 'W' + w).toBeGreaterThanOrEqual(w);
    }
  });
});
