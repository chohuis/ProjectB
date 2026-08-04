import type { CareerStage } from "../types/save";

/**
 * 커리어 단계 → 화면 문구. **정본은 여기 하나다.**
 *
 * ⚠ 예전엔 화면마다 각자 표를 들고 있었고 값이 어긋났다 —
 * `SaveSlotScreen`은 `kbl`·`abl`을 키로 썼는데 실제 타입은
 * `pro_kbl`·`pro_abl`·`pro_jbl`이다. **프로 선수의 슬롯이 라벨을 못 찾아
 * 원시 문자열이 그대로 나왔다.** 이 프로젝트에서 반복된 "정본이 둘"이다.
 *
 * `Record<CareerStage, string>`으로 선언해 **단계가 늘면 컴파일이 깨지게** 한다.
 * 그래야 다음에 리그가 추가돼도 라벨이 조용히 빠지지 않는다.
 */
const LABEL: Record<CareerStage, string> = {
  highschool:  "고교",
  university:  "대학",
  independent: "독립리그",
  military:    "복무 중",
  pro:         "프로",
  pro_kbl:     "KBL",
  pro_abl:     "ABL",
  pro_jbl:     "JBL",
};

/**
 * 모르는 값이 와도 화면이 비지 않게 원본을 돌려준다.
 * (구 세이브·손으로 만든 데이터를 대비한다)
 */
export function careerStageLabel(stage: string | null | undefined): string {
  if (!stage) return "";
  return LABEL[stage as CareerStage] ?? stage;
}
