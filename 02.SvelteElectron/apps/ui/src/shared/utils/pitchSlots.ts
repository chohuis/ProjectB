/**
 * 구종 슬롯 — 경기 화면이 "지금 던질 수 있는 것"과 "아직 빈 칸"을 함께 그리기
 * 위한 파생.
 *
 * ⚠ **빈 칸에 구종 이름을 적지 않는다.** 슬롯은 특정 구종의 자리가 아니다.
 * 훈련에서 조건을 채운 것 중 아무거나 들어갈 수 있는 빈칸이라, "🔒 커브"라고
 * 적으면 3번 칸이 커브 자리라는 **없는 규칙을 화면이 지어내는 것**이 된다.
 * 이 프로젝트는 이미 "부상위험 %"에서 같은 실수를 했다.
 *
 * ⚠ **상한을 코드에 적지 않는다.** `training/pitch_catalog.json`의 `maxLearned`가
 * 정본이고 훈련 화면도 같은 값을 읽는다. 예전엔 `TrainingPage.svelte`에
 * `const MAX_PITCHES = 5`로 박혀 있었다.
 */

export interface LearnedSlot {
  kind: "learned";
  /** 1-based 칸 번호 */
  no: number;
  id: string;
  label: string;
  /** 숙련도 1~5. 모르면 null */
  grade: number | null;
}

export interface EmptySlot {
  kind: "empty";
  no: number;
}

export type PitchSlot = LearnedSlot | EmptySlot;

/**
 * 보유 구종을 상한만큼의 칸에 채우고 나머지는 빈칸으로 남긴다.
 *
 * 보유가 상한을 넘으면(데이터가 바뀌었거나 세이브가 옛것이면) **자르지 않는다** —
 * 던질 수 있는 구종을 화면에서 지우는 쪽이 더 나쁘다.
 */
export function pitchSlotsOf<T extends { id: string; label: string; grade?: number | null }>(
  learned: readonly T[],
  maxLearned: number,
): PitchSlot[] {
  const slots: PitchSlot[] = learned.map((p, i) => ({
    kind: "learned",
    no: i + 1,
    id: p.id,
    label: p.label,
    grade: p.grade ?? null,
  }));
  for (let i = learned.length; i < Math.max(0, maxLearned); i++) {
    slots.push({ kind: "empty", no: i + 1 });
  }
  return slots;
}

/** "3/5" — 몇 칸 썼나. 상한을 넘으면 넘은 대로 보여준다 */
export function slotCountLabel(learnedCount: number, maxLearned: number): string {
  return `${learnedCount}/${maxLearned}`;
}

/**
 * 숙련도를 0~1로. 등급을 모르면 null — **0으로 그리지 않는다.**
 * 등급 없음과 등급 0은 다른 뜻이고, 후자는 거짓이다.
 *
 * ⚠ 처음엔 `▮▮▮▯▯` 글자로 그렸는데 슬롯 폭에서 **구종 이름을 밀어내
 * "패스..."로 잘렸다.** 막대는 CSS로 그리는 게 훨씬 좁다.
 */
export function gradeFraction(grade: number | null, max = 5): number | null {
  if (grade === null || grade === undefined) return null;
  if (max <= 0) return null;
  return Math.max(0, Math.min(1, grade / max));
}
