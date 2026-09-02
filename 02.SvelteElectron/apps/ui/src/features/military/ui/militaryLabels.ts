/**
 * 병역 탭이 쓰는 **표시 라벨** — 숫자가 아니라 이름이다. 값은 rules.json 이 정본이고 여기는 글자만 있다.
 * 계급 띠 인덱스(rankBandOf · 0~3)와 부대원 역할(MilitaryMemberRole)을 사람이 읽는 말로 바꾼다.
 */
import type { MilitaryMemberRole, MilitaryWeekChoice } from "../../../shared/types/militaryLife";

/** 계급 띠 0~3 → 이병·일병·상병·병장 (§38-1 · rules.rankBandWeeks 가 띠의 경계) */
export const RANK_LABELS: readonly string[] = ["이병", "일병", "상병", "병장"];

export const MEMBER_ROLE_LABEL: Record<MilitaryMemberRole, string> = {
  officer: "간부", senior: "선임", peer: "동기", junior: "후임",
};

/** members[].tags 의 동작 훅을 한 줄로 (§37) — 접두어 일치 */
export function tagLabel(tag: string): string {
  if (tag === "decides_leave")        return "휴가 결재";
  if (tag.startsWith("grades_perf:")) return "성과 판정";
  if (tag === "ball_partner")         return "캐치볼 상대";
  if (tag.startsWith("mentor:"))      return "선임 · 자리를 물려준다";
  return tag;
}

export const CHOICE_LABEL: Record<MilitaryWeekChoice, string> = {
  ball: "공을 만졌다", people: "사람과 지냈다", rest: "쉬었다",
};

/** 부호를 붙인 정수 표기 — 카드는 효과를 숨기지 않는다 (§27) */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}
