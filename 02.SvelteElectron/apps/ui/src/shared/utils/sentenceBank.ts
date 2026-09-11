/**
 * 문장 뱅크 (Phase 7-6, DESIGN §7.3).
 *
 * 이벤트 본문을 배열로 두고 **직전에 쓴 문장을 제외**하고 뽑는다.
 *
 * 제외가 핵심이다. 단순 랜덤이면 3개짜리 뱅크에서 같은 문장이 연속으로 나올
 * 확률이 33%다 — 플레이어는 "랜덤"이 아니라 "고장"으로 읽는다. 커리어 내내
 * 반복되는 이벤트(코치 제안·동료 잡담)에서 이게 특히 눈에 띈다.
 *
 * **저작 규칙: 배열을 쓸 거면 3개 이상이어야 한다.** 2개면 직전 제외가
 * "무조건 번갈아"가 되어 랜덤이 아니라 교대가 된다. `npm run test:sentencebank`가
 * 검사한다 (DESIGN이 말한 "3개 미만이면 빌드 실패"의 구현).
 *
 * 난수는 **호출자가 넘긴다** — TS 게임 로직에서 `Math.random()` 금지(CLAUDE.md).
 * 이벤트 엔진이 이미 Rust에서 뽑아온 `randoms` 배열을 쓰고 있으므로 거기 얹는다.
 */

export const MIN_BANK_SIZE = 3;

/** 직전에 쓴 문장 인덱스. `templateId → index` */
export type SentenceMemory = Record<string, number>;

export interface PickedSentence {
  text: string;
  /** 뽑힌 인덱스. 호출자가 메모리에 다시 넣는다 */
  index: number;
}

/**
 * 뱅크에서 하나 뽑는다. `lastIndex`와 같은 것은 후보에서 뺀다.
 *
 * @param rand01 0~1 난수 (Rust에서 온 값)
 * @param lastIndex 직전에 쓴 인덱스. 없으면 -1
 */
export function pickSentence(
  bank: readonly string[],
  rand01: number,
  lastIndex = -1,
): PickedSentence | null {
  if (bank.length === 0) return null;
  if (bank.length === 1) return { text: bank[0], index: 0 };

  // 직전 것을 뺀 후보. 전부 빠지는 경우는 없다(길이 2 이상이므로)
  const candidates: number[] = [];
  for (let i = 0; i < bank.length; i++) {
    if (i !== lastIndex) candidates.push(i);
  }

  const r = Number.isFinite(rand01) ? Math.min(0.999999, Math.max(0, rand01)) : 0;
  const idx = candidates[Math.floor(r * candidates.length)] ?? candidates[0];
  return { text: bank[idx], index: idx };
}

/**
 * 템플릿에서 본문 뱅크를 꺼낸다.
 *
 * `bodies`가 있으면 그것, 없으면 `body` 한 줄짜리 뱅크. 구 템플릿 134건을
 * 전부 배열로 바꾸지 않아도 되게 한 것이다 — 반복이 눈에 띄는 것부터 늘린다.
 */
export function bodyBankOf(t: { body?: string; bodies?: string[] } | undefined): string[] {
  if (!t) return [];
  if (Array.isArray(t.bodies) && t.bodies.length > 0) return t.bodies;
  return t.body ? [t.body] : [];
}

/** `bodies`를 쓰면서 3개 미만인 템플릿 — 저작 규칙 위반 */
export function findUndersizedBanks<T extends { id: string; bodies?: string[] }>(
  templates: readonly T[],
): { id: string; size: number }[] {
  return templates
    .filter(
      (t) => Array.isArray(t.bodies) && t.bodies.length > 0 && t.bodies.length < MIN_BANK_SIZE,
    )
    .map((t) => ({ id: t.id, size: t.bodies!.length }));
}
