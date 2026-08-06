/**
 * 화면에 찍을 이름 — **언어 설정에 따라 고른다.**
 *
 * ⚠ **저장된 `name`을 바꾸지 않는다.** 스토어의 값을 표시 언어로 갈아끼우면
 * 다음 저장에서 그게 slot.db의 `name` 열로 들어간다 — 한글 원본이 영문으로
 * 덮인다. 원본 둘(`name`·`nameEn`)은 그대로 두고 **읽는 자리에서만** 고른다.
 *
 * ⚠ **주인공은 사용자가 입력한 값을 그대로 쓴다**(사용자 확정 2026-08-07).
 * 영어 모드에서도 "홍길동"으로 뜬다 — 자동 로마자 변환은 음절 표에 없는
 * 글자에서 어색해지고, 그건 사용자가 직접 지은 이름에 할 짓이 아니다.
 */

import type { Language } from "../i18n";

export interface Named {
  name?: string;
  nameEn?: string;
}

/**
 * 이름 하나. 짝이 없으면 원본을 쓴다 — **빈 칸을 만들지 않는다.**
 *
 * ⚠ 짝이 비어 영어 화면에 한글이 남는 건 결함이지만, 그건 **데이터에서**
 * 고칠 일이다(`check:namepair`). 여기서 지어내면 어디가 비었는지 영영 모른다.
 */
export function displayName(x: Named | null | undefined, lang: Language): string {
  if (!x) return "";
  if (lang === "en") return x.nameEn || x.name || "";
  return x.name || x.nameEn || "";
}

/** 여럿을 한 번에 — 목록 렌더에서 매번 분기하지 않게 */
export function displayNames<T extends Named>(xs: readonly T[], lang: Language): string[] {
  return xs.map((x) => displayName(x, lang));
}

/**
 * 이 문자열에 한글이 있는가 — 영어 화면 검사용.
 *
 * 영어로 바꿨는데 한글이 남으면 **그 화면만 조용히 한국어**가 된다.
 * 84곳 중 하나가 새도 눈으로는 못 찾는다.
 */
export function hasHangul(s: string | null | undefined): boolean {
  return !!s && /[가-힣]/.test(s);
}
