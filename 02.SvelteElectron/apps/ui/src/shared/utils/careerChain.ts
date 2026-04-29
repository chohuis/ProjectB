import type { CareerStage } from "../types/save";

export type CareerStep =
  | { type: "initial" }
  | { type: "draftResult";  success: boolean }
  | { type: "univResult";   success: boolean; source: "direct" | "afterDraft" }
  | { type: "univFailRoute" }
  | { type: "indieResult";  success: boolean }
  | { type: "resolved";     stage: CareerStage };

export interface CareerOption {
  id: string;
  label: string;
  desc: string;
}

// ── 확률 계산 ──────────────────────────────────────────────────
export function calcDraftSuccess(ovr: number): boolean {
  const pct = Math.max(5, Math.min(70, (ovr - 40) * 1.375 + 15));
  return Math.random() * 100 < pct;
}

export function calcUnivSuccess(avgGrade: number): boolean {
  const pct =
    avgGrade <= 4 ? 85 :
    avgGrade <= 6 ? 55 :
    avgGrade <= 7 ? 30 : 10;
  return Math.random() * 100 < pct;
}

export function calcIndieSuccess(ovr: number): boolean {
  const pct = Math.max(35, Math.min(80, (ovr - 30) * 0.9 + 40));
  return Math.random() * 100 < pct;
}

// ── 각 Step의 UI 데이터 ────────────────────────────────────────
export interface StepView {
  title: string;
  body: string;
  options: CareerOption[];
  isResultScreen: boolean;   // 결과 표시 화면 (OK 버튼 1개)
  resultSuccess?: boolean;
}

export function getStepView(step: CareerStep): StepView {
  switch (step.type) {
    case "initial":
      return {
        title: "고교 졸업 — 진로 선택",
        body: "고등학교 3학년을 마쳤습니다. 이제 앞으로의 진로를 결정해야 합니다.\n어떤 길을 선택하시겠습니까?",
        isResultScreen: false,
        options: [
          { id: "draft",      label: "드래프트 참가",  desc: "프로 구단의 지명을 노립니다. OVR이 높을수록 성공 확률이 높습니다." },
          { id: "university", label: "대학 진학",      desc: "대학 야구부에 진학합니다. 성적이 좋을수록 입학 확률이 높습니다." },
          { id: "indie",      label: "독립리그 지원",  desc: "독립리그에 입단해 실력을 키웁니다. 비교적 낮은 문턱으로 도전할 수 있습니다." },
          { id: "military",   label: "군입대",         desc: "군 복무를 선택합니다. 약 18개월 복무 후 복귀할 수 있습니다." },
        ],
      };

    case "draftResult":
      return {
        title: step.success ? "드래프트 성공!" : "드래프트 실패",
        body: step.success
          ? "축하합니다! 프로 구단으로부터 드래프트 지명을 받았습니다.\n프로의 세계로 첫 발을 내딛습니다."
          : "아쉽게도 이번 드래프트에서 지명받지 못했습니다.\n하지만 포기하지 마세요. 대학 진학을 통해 다시 도전할 수 있습니다.",
        isResultScreen: true,
        resultSuccess: step.success,
        options: [{ id: "ok", label: "확인", desc: "" }],
      };

    case "univResult":
      return {
        title: step.success ? "대학 합격!" : "대학 불합격",
        body: step.success
          ? "합격을 축하합니다! 대학 야구부에서 새로운 도전이 시작됩니다."
          : step.source === "afterDraft"
            ? "드래프트에 이어 대학 진학도 뜻대로 되지 않았습니다.\n독립리그에서 실력을 증명할 기회를 찾아보겠습니다."
            : "아쉽게도 대학 입학이 어렵게 되었습니다.\n다음 진로를 선택해주세요.",
        isResultScreen: step.success || step.source === "afterDraft",
        resultSuccess: step.success,
        options: step.success || step.source === "afterDraft"
          ? [{ id: "ok", label: "확인", desc: "" }]
          : [
              { id: "indie",    label: "독립리그 지원", desc: "독립리그에서 새로운 기회를 찾습니다." },
              { id: "military", label: "군입대",        desc: "군 복무를 선택합니다." },
            ],
      };

    case "univFailRoute":
      return {
        title: "진로 재선택",
        body: "대학 진학이 불발되었습니다. 다음 중 선택해주세요.",
        isResultScreen: false,
        options: [
          { id: "indie",    label: "독립리그 지원", desc: "독립리그에서 새로운 기회를 찾습니다." },
          { id: "military", label: "군입대",        desc: "군 복무를 선택합니다." },
        ],
      };

    case "indieResult":
      return {
        title: step.success ? "독립리그 입단!" : "독립리그 지원 실패",
        body: step.success
          ? "독립리그 입단에 성공했습니다! 여기서 실력을 쌓아 더 큰 무대로 도약하세요."
          : "안타깝게도 독립리그 입단도 어렵게 되었습니다.\n군 복무를 통해 재기를 준비합니다.",
        isResultScreen: true,
        resultSuccess: step.success,
        options: [{ id: "ok", label: "확인", desc: "" }],
      };

    case "resolved":
      return {
        title: "진로 확정",
        body: stageLabel(step.stage),
        isResultScreen: true,
        resultSuccess: true,
        options: [{ id: "ok", label: "새 챕터 시작", desc: "" }],
      };
  }
}

function stageLabel(stage: CareerStage): string {
  switch (stage) {
    case "pro":         return "프로 선수의 길이 시작됩니다. 드래프트 지명을 받고 프로 구단에 입단했습니다.";
    case "university":  return "대학 야구부에서 새로운 도전이 시작됩니다.";
    case "independent": return "독립리그에서 실력을 쌓으며 더 큰 무대를 꿈꿉니다.";
    case "military":    return "군 복무를 시작합니다. 복무 후 새로운 출발을 준비하세요.";
    default:            return "";
  }
}

// ── 선택 → 다음 Step 계산 ──────────────────────────────────────
export function resolveChoice(
  step: CareerStep,
  choiceId: string,
  ovr: number,
  avgGrade: number,
): CareerStep {
  switch (step.type) {
    case "initial": {
      if (choiceId === "draft")      return { type: "draftResult",  success: calcDraftSuccess(ovr) };
      if (choiceId === "university") return { type: "univResult",   success: calcUnivSuccess(avgGrade), source: "direct" };
      if (choiceId === "indie")      return { type: "indieResult",  success: calcIndieSuccess(ovr) };
      return { type: "resolved", stage: "military" };
    }

    case "draftResult": {
      if (step.success) return { type: "resolved", stage: "pro" };
      // 드래프트 실패 → 대학 자동 시도
      return { type: "univResult", success: calcUnivSuccess(avgGrade), source: "afterDraft" };
    }

    case "univResult": {
      if (step.success) return { type: "resolved", stage: "university" };
      if (step.source === "afterDraft") {
        // 드래프트→대학 모두 실패 → 독립리그 자동 시도
        return { type: "indieResult", success: calcIndieSuccess(ovr) };
      }
      // 대학 직접 실패 → 재선택
      return { type: "univFailRoute" };
    }

    case "univFailRoute": {
      if (choiceId === "indie") return { type: "indieResult", success: calcIndieSuccess(ovr) };
      return { type: "resolved", stage: "military" };
    }

    case "indieResult": {
      return { type: "resolved", stage: step.success ? "independent" : "military" };
    }

    default:
      return step;
  }
}
