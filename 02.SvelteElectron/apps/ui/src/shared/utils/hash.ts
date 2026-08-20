/**
 * 결정적 해시 — FNV-1a 32비트.
 *
 * **`Math.random()`을 쓰지 않는다.** 같은 입력을 두 번 넣어 다른 값이 나오면
 * "관측 부정확"이 아니라 버그로 읽힌다.
 *
 * 🔴 **2026-08-20까지 같은 함수가 두 벌 돌아다녔다** — `playerTraits.ts`의
 * `hash32`와 `teamMark.ts`의 `fnv`. 둘 다 private이라 세 번째가 필요해질
 * 때마다 또 복사할 자리였다. 여기 하나로 모은다.
 */
export function fnv1a32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  }
  return h;
}

/**
 * 씨앗용 — 32비트로는 좁은 자리에 쓴다. 같은 문자열을 두 번 섞어
 * 상·하위를 만든다.
 *
 * ⚠ **`Number.MAX_SAFE_INTEGER`(2^53)를 넘지 않게 둔다.** JS 수로 다루다가
 * 정밀도가 날아가면 씨앗이 조용히 뭉개진다 — 상위를 21비트만 쓴다.
 */
export function seedFrom(s: string): number {
  const lo = fnv1a32(s);
  const hi = fnv1a32(`${s}#`) >>> 11;   // 21비트
  return hi * 0x100000000 + lo;
}
