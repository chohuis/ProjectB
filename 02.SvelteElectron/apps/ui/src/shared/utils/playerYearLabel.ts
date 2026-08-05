import type { CareerStage, ProtagonistSave } from "../types/save";

/**
 * "3학년" · "프로 4년차" — 헤더와 선수 카드가 같이 쓰는 **연차 표기의 정본**.
 *
 * ⚠ 예전엔 `stores/game.ts`의 `toPlayerCompat`이 `p.grade ? "${grade}학년" : "-"`로
 * 만들었다. `grade`는 **재학 중일 때만** 있으므로 프로에 올라간 순간 헤더가
 * 그냥 `-`가 됐다. 게임의 절반 이상이 프로 단계인데 거기서 연차가 안 보였다.
 *
 * 단계별로 세는 단위가 다르다:
 *   고교·대학  학년      `grade`
 *   프로        연차      `proServiceYears` (0이면 1년차 = 신인)
 *   상무        복무      주차는 `MilitaryStatusPanel`이 따로 센다
 *   독립리그    연차 없음  단계 이름만
 */
/** 단계마다 세는 단위가 다르다. **표를 유니온으로 못박아** 리그가 늘면 컴파일이 깨지게 한다 */
type YearKind = "grade" | "proYears" | "military" | "none";

const KIND: Record<CareerStage, YearKind> = {
  highschool:  "grade",
  university:  "grade",
  pro:         "proYears",
  pro_kbl:     "proYears",
  pro_abl:     "proYears",
  pro_jbl:     "proYears",
  military:    "military",
  independent: "none",
};

export function playerYearLabel(p: Pick<ProtagonistSave,
  "careerStage" | "grade" | "proServiceYears">): string {
  switch (KIND[p.careerStage]) {
    case "grade":
      return p.grade ? `${p.grade}학년` : "";
    case "proYears":
      // 신인은 proServiceYears가 0이다 — "0년차"는 없다
      return `프로 ${Math.max(1, p.proServiceYears + 1)}년차`;
    case "military":
      return "복무 중";
    default:
      return "";
  }
}
