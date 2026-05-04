import type { DecisionEffect } from "./main";

// ── 아크 트리거 조건 ───────────────────────────────────────────
export interface ArcTriggerCondition {
  weekInSeason?: number;       // 시즌 내 정확한 주차
  weekInSeasonGte?: number;    // 시즌 내 주차 이상
  careerStage?: string;        // "highschool" | "university" | ...
  careerYear?: number;         // 커리어 연차 (0=1년차)
  affinityGte?: number;        // 친밀도 이상
  flagSet?: string;            // 이 flag가 있어야 발동
  flagNotSet?: string;         // 이 flag가 없어야 발동
}

// ── 아크 스크립트 스텝 ─────────────────────────────────────────
export type ScriptStep =
  | { id: string; from: "contact"; text: string; textEn?: string; next: string | null; effects?: DecisionEffect }
  | { id: string; from: "player"; options: ScriptOption[] };

export interface ScriptOption {
  id: string;
  text: string;
  textEn?: string;
  affinityDelta?: number;
  effects?: DecisionEffect;
  next: string | null;
}

// ── 아크 (자동 트리거 이야기) ──────────────────────────────────
export interface ContactArc {
  id: string;
  trigger: ArcTriggerCondition;
  flag: string;               // 완료 시 ChatContact.flags에 추가
  script: {
    startStepId: string;
    steps: ScriptStep[];
  };
}

// ── 채팅 카탈로그 (버튼 클릭 대화) ─────────────────────────────
export interface ChatCondition {
  affinityGte?: number;
  affinityLt?: number;
  flagSet?: string;            // 이 flag가 있어야 매칭
  flagNotSet?: string;         // 이 flag가 없어야 매칭
}

// 타입 A: 일반 답변
export interface SimpleChatLine {
  condition?: ChatCondition;
  lines: string[];             // 랜덤 픽
  linesEn?: string[];
}

// 타입 B: 선택지 있는 특별 대화 (1회성)
export interface SpecialChatLine {
  condition?: ChatCondition;
  flag: string;                // 완료 마킹 (이후 건너뜀)
  prompt: string;              // NPC 제안 텍스트
  promptEn?: string;
  options: ChatOption[];
}

export interface ChatOption {
  id: string;
  text: string;                // 플레이어 선택 텍스트
  textEn?: string;
  reply: string;               // NPC 반응 텍스트
  replyEn?: string;
  affinityDelta?: number;
  effects?: ContactEffect;
}

export interface ContactEffect extends DecisionEffect {
  unlockPitchId?: string;
}

export type ChatLine = SimpleChatLine | SpecialChatLine;

export function isSpecialChat(line: ChatLine): line is SpecialChatLine {
  return "prompt" in line;
}

export function matchChatLine(
  lines: ChatLine[],
  affinity: number,
  flags: string[],
): ChatLine | null {
  for (const line of lines) {
    const cond = line.condition;
    if (cond) {
      if (cond.affinityGte !== undefined && affinity < cond.affinityGte) continue;
      if (cond.affinityLt  !== undefined && affinity >= cond.affinityLt)  continue;
      if (cond.flagSet     && !flags.includes(cond.flagSet))               continue;
      if (cond.flagNotSet  &&  flags.includes(cond.flagNotSet))            continue;
    }
    if (isSpecialChat(line) && flags.includes(line.flag)) continue;
    return line;
  }
  return null;
}

// ── NPC 컨택트 정의 (마스터 데이터 / 읽기 전용) ──────────────
export interface ContactDef {
  id: string;
  name: string;
  nameEn?: string;
  category: "team" | "school" | "personal";
  relation: string;
  relationEn?: string;
  initialAffinity: number;
  arcs: ContactArc[];
  chat: {
    greet?: ChatLine[];
    advice?: ChatLine[];
    plan?: ChatLine[];
  };
}
