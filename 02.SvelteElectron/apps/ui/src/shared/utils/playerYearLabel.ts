import type { CareerStage, ProtagonistSave } from "../types/save";
import { universityGradeOf } from "./careerTransition";

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
  highschool: "grade",
  university: "grade",
  pro: "proYears",
  pro_kbl: "proYears",
  pro_abl: "proYears",
  pro_jbl: "proYears",
  military: "military",
  independent: "none",
};

/**
 * ⚠ **대학은 `grade` 만 보면 안 된다** (2026-09-01).
 *
 *   `grade` 는 `universityWeek` 을 비추는 값이고 **시즌 롤오버 때만** 동기화된다.
 *   시즌 중에 계수기가 한 해를 넘겨도 **롤오버 전까지 묵은 학년을 보여준다.**
 *   정본은 `careerTransition.universityGradeOf` 다.
 *
 *   `universityWeek` 을 안 주면 예전처럼 `grade` 로 떨어진다 — 고교는 계수기가
 *   없으므로 그쪽이 맞고, **NPC 도 계수기가 없다**(`schoolState` 는 주인공 것이다).
 */
export function playerYearLabel(
  p: Pick<ProtagonistSave, "careerStage" | "grade" | "proServiceYears">,
  universityWeek?: number | null,
): string {
  switch (KIND[p.careerStage]) {
    case "grade": {
      if (p.careerStage === "university") {
        return `${universityGradeOf(p.grade, universityWeek)}학년`;
      }
      return p.grade ? `${p.grade}학년` : "";
    }
    case "proYears":
      // 신인은 proServiceYears가 0이다 — "0년차"는 없다
      return `프로 ${Math.max(1, p.proServiceYears + 1)}년차`;
    case "military":
      return "복무 중";
    default:
      return "";
  }
}
