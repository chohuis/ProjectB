/**
 * 시즌 주차 ↔ 월 — **정본은 여기 하나다.**
 *
 * 🔴 **2026-08-20까지 같은 표가 네 벌 돌아다녔다:**
 *
 * | 자리 | 무엇 |
 * |---|---|
 * | `stores/game.ts` | `MONTH_STARTS`(0-based) + `MONTH_NAMES` → `computeWeekLabel` |
 * | `weekPhases/growth.ts` | `MONTH_STARTS_1`(1-based) → 이전 달 주차 범위 |
 * | `utils/friendlyMatchEngine.ts` | `MONTH_STARTS_1` + `MONTH_NAMES` → `isMonthStart`·`monthName` |
 * | `utils/top10Engine.ts` | `MONTH_STARTS`(0-based) + `MONTH_NAMES` → `weekToMonthLabel` |
 *
 * 값은 같은데 **0-based와 1-based가 섞여 있었다.** 하나만 고치면 조용히 갈리는
 * 자리다 — 이 프로젝트가 이미 여러 번 당한 형태다(FNV 해시 두 벌 ·
 * 로스터 상한 두 벌 · 스케줄 포트 네 벌).
 *
 * ⚠ **`SchedulePage.svelte`의 `monthLabel`은 여기 안 들어온다.** 그건
 * `Date.getMonth()`용 실제 달력 이름이라 시즌 주차와 무관하다.
 *
 * ## 왜 3월 시작인가
 *
 * 한국 학사 연도가 3월에 시작하고, 게임의 W1이 3월 첫 주다. 그래서 배열
 * 인덱스 0이 3월이고 10·11이 이듬해 1·2월이다.
 */

/** 각 달이 시작하는 주차 (1-based). 인덱스 0 = 3월 */
export const MONTH_STARTS_1 = [1, 6, 10, 14, 19, 23, 27, 32, 36, 40, 45, 49] as const;

/** 인덱스 0 = 3월. 10·11은 이듬해 1·2월이다 */
export const MONTH_NAMES = [
  "3월", "4월", "5월", "6월", "7월", "8월",
  "9월", "10월", "11월", "12월", "1월", "2월",
] as const;

/** 한 해의 주 수 */
export const WEEKS_PER_YEAR = 52;

/** 주차 → 달 인덱스(0=3월). 52를 넘는 주차는 감아 돈다 */
export function monthIndexOf(weekInYear: number): number {
  const w = ((Math.max(1, weekInYear) - 1) % WEEKS_PER_YEAR) + 1;
  for (let i = MONTH_STARTS_1.length - 1; i >= 0; i -= 1) {
    if (w >= MONTH_STARTS_1[i]) return i;
  }
  return 0;
}

/** 주차 → 한국어 월 이름 */
export function monthNameOf(weekInYear: number): string {
  return MONTH_NAMES[monthIndexOf(weekInYear)];
}

/** 그 주에 달이 바뀌는가 */
export function isMonthStart(weekInYear: number): boolean {
  const w = ((Math.max(1, weekInYear) - 1) % WEEKS_PER_YEAR) + 1;
  return (MONTH_STARTS_1 as readonly number[]).includes(w);
}

/** 그 달의 몇 주차인가 (1-based) */
export function weekInMonthOf(weekInYear: number): number {
  const w = ((Math.max(1, weekInYear) - 1) % WEEKS_PER_YEAR) + 1;
  return w - MONTH_STARTS_1[monthIndexOf(weekInYear)] + 1;
}

/** `2026년 3월 1주차` 꼴 */
export function weekLabelOf(weekInYear: number, seasonYear: number): string {
  return `${seasonYear}년 ${monthNameOf(weekInYear)} ${weekInMonthOf(weekInYear)}주차`;
}

/**
 * 이전 달의 주차 범위 — NPC 월간 성장 집계가 쓴다.
 *
 * ⚠ **달이 바뀌는 주에만 뜻이 있다.** 그 밖의 주차를 주면 `start: 1`부터
 * 직전 주까지를 준다(원래 `growth.ts`가 그랬다).
 */
export function prevMonthRange(weekInYear: number): { start: number; end: number } {
  const idx = (MONTH_STARTS_1 as readonly number[]).indexOf(weekInYear);
  if (idx <= 0) return { start: 1, end: weekInYear - 1 };
  return { start: MONTH_STARTS_1[idx - 1], end: weekInYear - 1 };
}
