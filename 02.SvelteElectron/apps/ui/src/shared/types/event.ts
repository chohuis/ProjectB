import type { DecisionEffect, MessageCategory } from "./main";
import type { CareerStage, PlayerType, PitchingStatKey, ProtagonistSave, PlayerSeasonStats } from "./save";
import type { SeasonPhase, Standing } from "./season";

// ── 이벤트 발생 조건 ──────────────────────────────────────────
export type Condition =
  // 주차 / 시즌
  | { type: "week_gte";        value: number }        // 현재 주차 이상
  | { type: "week_lte";        value: number }        // 현재 주차 이하
  | { type: "week_eq";         value: number }        // 정확히 이 주차
  | { type: "season_phase";    phase: SeasonPhase }   // 시즌 페이즈 일치

  // 커리어 / 소속
  | { type: "career_stage";    stage: CareerStage }   // 커리어 단계 일치
  | { type: "league_id";       leagueId: string }     // 소속 리그 일치
  | { type: "grade";           value: 1 | 2 | 3 }    // 학년 일치 (고교·대학)
  | { type: "player_type";     playerType: PlayerType } // 투수/타자/양방향 일치

  // 컨디션 상태
  | { type: "fatigue_gte";     value: number }        // 피로도 이상
  | { type: "fatigue_lte";     value: number }        // 피로도 이하
  | { type: "condition_gte";   value: number }        // 컨디션 이상
  | { type: "condition_lte";   value: number }        // 컨디션 이하
  | { type: "morale_gte";      value: number }        // 사기 이상
  | { type: "morale_lte";      value: number }        // 사기 이하

  // 투구 능력치
  | { type: "pitching_stat_gte"; stat: PitchingStatKey; value: number } // 특정 투구 스탯 이상
  | { type: "pitching_stat_lte"; stat: PitchingStatKey; value: number } // 특정 투구 스탯 이하
  | { type: "pitching_ovr_gte";  value: number }      // 투구 OVR 이상
  | { type: "pitching_ovr_lte";  value: number }      // 투구 OVR 이하

  // 구종
  | { type: "pitch_learned";   pitchId: string }      // 특정 구종 보유 중
  | { type: "pitch_training";  pitchId: string }      // 특정 구종 훈련 중

  // 태그
  | { type: "has_tag";         tag: string }          // 특정 태그 보유

  // 시즌 누적 스탯 (주인공 기준)
  | { type: "season_wins_gte"; value: number }        // 시즌 승수 이상
  | { type: "season_era_lte";  value: number }        // 시즌 ERA 이하
  | { type: "season_ip_gte";   value: number }        // 시즌 이닝 이상
  | { type: "season_k_gte";    value: number }        // 시즌 탈삼진 이상

  // 팀 순위
  | { type: "team_rank_lte";   value: number }        // 현재 팀 순위 이하 (1위=1)
  | { type: "team_rank_gte";   value: number }        // 현재 팀 순위 이상

  // ── 미래 필드 (evaluator에서 false 반환, 추후 구현) ──────────
  | { type: "fame_gte";        value: number }        // 명성 이상 — protagonist.fame 추가 후 구현
  | { type: "pro_year_gte";    value: number }        // 프로 연차 이상 — 추가 후 구현
  | { type: "military_phase";  phase: string };       // 군복무 단계 — 군대 시스템 추가 후 구현

// ── 이벤트 규칙 (마스터 JSON 구조) ───────────────────────────
export type EventOncePolicy =
  | "repeatable"         // 매주 발생 가능
  | "once_per_season"    // 시즌당 1회
  | "once_per_stage_year"// 커리어 단계(고교/대학 등) 연도당 1회
  | "once_per_career";   // 커리어 전체 1회

export interface EventRule {
  id: string;
  title: string;
  type: "mandatory" | "conditional" | "random";
  category: string;
  priority: number;                          // 높을수록 먼저 처리
  oncePolicy: EventOncePolicy;
  cooldownWeeks?: number;                    // 재발생 금지 주차 수
  conditions?: Condition[];                  // 모두 AND 조건
  weight?: number;                           // random 전용 가중치 (1 이상)
  poolId?: string;                           // random 전용 풀 ID
  messageTemplateId?: string | null;         // 메시지 본문 템플릿
  decisionTemplateId?: string | null;        // 선택지 템플릿 (없으면 단순 알림)
}

// ── 이벤트 풀 (random 이벤트 그룹) ───────────────────────────
export interface EventPool {
  id: string;
  description?: string;
  baseRoll: { mode: "percent"; value: number }; // 이 풀을 이번 주에 검사할 확률
  maxPicksPerWeek: number;                   // 주당 최대 선택 수
  eventIds: string[];                        // 풀에 속한 이벤트 ID 목록
}

// ── 메시지 템플릿 ──────────────────────────────────────────────
export interface MessageTemplate {
  id: string;
  category: MessageCategory;
  subject: string;
  body: string;
  decisionTemplateId?: string | null;
}

// ── 선택지 템플릿 ──────────────────────────────────────────────
export interface DecisionTemplate {
  id: string;
  prompt: string;
  options: DecisionTemplateOption[];
}

export interface DecisionTemplateOption {
  id: string;
  label: string;
  effectHint?: string;      // 표시용 효과 설명
  effects?: DecisionEffect; // 실제 적용 효과
}

// ── 이벤트 평가 컨텍스트 (evaluator 입력) ────────────────────
export interface EventContext {
  protagonist: ProtagonistSave;
  currentWeek: number;
  seasonPhase: SeasonPhase;
  standings: Standing[];
  stats: Record<string, PlayerSeasonStats>;
  triggeredEvents: Record<string, number>;   // eventId → 마지막 발생 주차
}
