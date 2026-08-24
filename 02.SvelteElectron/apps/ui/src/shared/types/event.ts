import type { DecisionEffect } from "./main";
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

  // ── 반쪽이던 축 (2026-08-22) ─────────────────────────────────
  // 셋 다 **보상으로 바꿀 수는 있는데 조건으로 못 읽었다**
  // (`moneyDelta`·`diligenceDelta`·`popularityDelta`는 예전부터 있다).
  // 한쪽만 있으면 "그 선택의 결과를 다음 이야기가 알아보지 못한다" —
  // 돈을 쓰게 해놓고 가난해진 걸 아무도 못 읽는 식이다.
  | { type: "money_gte";       value: number }        // 소지금 이상
  | { type: "money_lte";       value: number }        // 소지금 이하
  | { type: "diligence_gte";   value: number }        // 성실도 이상 (1~99)
  | { type: "diligence_lte";   value: number }        // 성실도 이하
  | { type: "popularity_gte";  value: number }        // 인기도 이상 (0~100)
  | { type: "popularity_lte";  value: number }        // 인기도 이하

  // ── 일반 조건 (2026-08-24) ───────────────────────────────────
  // **필드마다 조건 타입 하나**를 만들던 걸 여기서 멈춘다. 45종까지 그렇게
  // 늘렸는데 새 축이 생길 때마다 평가기·이 유니온·`CONDITION_FIELDS`·문서
  // 넷을 같이 고쳐야 했고, 그 넷이 어긋나는 게 이 트랙이 두 번 겪은 결함이다.
  //
  // 쓸 수 있는 경로는 `utils/eventPaths.ts`의 표가 정본이고, **모르는 경로는
  // 던진다** — 오타가 조용히 false가 되면 안 된다.
  //
  //   { "type": "num_gte", "path": "batting.contact", "value": 60 }
  //   { "type": "eq",      "path": "currentRole",     "value": "1선발" }
  | { type: "num_gte";  path: string; value: number }
  | { type: "num_lte";  path: string; value: number }
  | { type: "eq";       path: string; value: string | number | boolean }
  | { type: "neq";      path: string; value: string | number | boolean }

  // ── 관계도 (2026-08-24) ──────────────────────────────────────
  // 🟡 **다른 조건과 성격이 다르다.** 관계는 slot.db에 있고 조회가 비동기인데
  // 평가기는 동기라, `EventContext.relations`에 **미리 실어 줘야** 한다.
  // 안 실리면 전부 false다(고교 등 관계가 없는 단계에선 그게 맞다).
  | { type: "relation_gte"; kind: import("./relationship").RelationKind; value: number }
  | { type: "relation_lte"; kind: import("./relationship").RelationKind; value: number }

  // ── 부상 (2026-08-23) ────────────────────────────────────────
  // 부상은 이 게임의 중심 사건인데 **이벤트가 그걸 못 봤다.** 세이브에
  // `injury`·`injuryHistory`·`seasonHealth`가 다 있는데 조건이 하나도 없어서,
  // "다치고 돌아온 뒤"·"수술까지 갔던 몸"·"올해만 세 번째" 같은 이야기를
  // 쓸 수가 없었다. 부상 소식(`msg-injury`)은 코드가 따로 만들어 내보낸다 —
  // 그건 통보고, 이건 이야기다.
  | { type: "injured";           value: boolean }     // 지금 부상 중인가
  | { type: "injury_severity";   severity: import("./save").InjurySeverity }  // 지금 부상의 정도
  | { type: "injury_weeks_gte";  value: number }      // 남은 회복 주차 이상
  | { type: "injury_count_gte";  value: number }      // **커리어** 누적 부상 횟수 이상
  | { type: "season_injury_count_gte"; value: number } // **이번 시즌** 부상 횟수 이상
  | { type: "had_surgery";       value: boolean }     // 커리어에 수술 이력이 있는가

  // ── 미래 필드 (evaluator에서 false 반환, 추후 구현) ──────────
  | { type: "fame_gte";        value: number }        // 명성 이상 — protagonist.fame 추가 후 구현
  | { type: "pro_year_gte";    value: number }        // 프로 연차 이상 — 추가 후 구현
  | { type: "military_phase";  phase: string }        // 군복무 단계 — 군대 시스템 추가 후 구현

  // ── 대학 학업 (Phase 9-C) ────────────────────────────────────
  // 대학 이벤트가 학점·경고를 조건으로 걸 수 있어야 한다. 이게 없으면
  // "학점이 위험하다" 같은 이벤트를 아예 쓸 수 없다
  | { type: "gpa_gte";              value: number }
  | { type: "gpa_lte";              value: number }
  | { type: "academic_warning_gte"; value: number };

// ── 이벤트 규칙 (마스터 JSON 구조) ───────────────────────────
export type EventOncePolicy =
  | "repeatable"         // 매주 발생 가능
  | "once_per_season"    // 시즌당 1회
  | "once_per_stage_year"// 커리어 단계(고교/대학 등) 연도당 1회
  | "once_per_career";   // 커리어 전체 1회

/**
 * **중요도 등급** (2026-08-23).
 *
 * `type`은 "어떻게 발동하는가"(달력·조건·확률)이고 이건 **"얼마나 중요한가"**다.
 * 예전엔 둘이 섞여 있었다 — `mandatory` 105건이 전부 달력 일정인데 상한이
 * 없어서 사실상 최우선 등급 노릇을 했고, **부상처럼 지금 벌어진 일은 전부
 * `conditional`로 밀려나 주당 1칸을 두고 분위기 소식과 다퉜다.**
 *
 * `priority`(45~900, 값 종류 59개)로 그걸 표현하려던 게 실패했다. 사람이
 * "이건 몇 점?"에 답할 근거가 없으니 각자 감으로 적었고, 그래서 **평생 한 번뿐인
 * 이야기가 85점, 매주 오는 피로 알림이 900점**이 됐다(2026-08-23 실측).
 *
 * | 등급 | 주당 1건 상한 | 무엇 |
 * |---|---|---|
 * | `urgent` | **안 걸린다 — 즉시** | 지금 벌어진 일. 부상·수술·방출·트레이드 통보 |
 * | `important` | 대기열 **앞** | 놓치면 끝. 진로·계약·일회성 서사 |
 * | `ambient` | 남는 칸 | 반복되는 상태·분위기 |
 *
 * ⚠ **비워 두면 `oncePolicy`로 추론한다** — `repeatable`이면 `ambient`,
 * 아니면 `important`. 지금 데이터가 그 규칙으로 돌고 있어서, 등급을 안 적으면
 * **동작이 하나도 안 바뀐다.** 추론은 임시방편이다: 발동 정책은 중요도가
 * 아니고 둘이 우연히 상관됐을 뿐이라, 등급을 적어 갈아타는 게 목표다.
 */
export type EventTier = "urgent" | "important" | "ambient";

export interface EventRule {
  id: string;
  title: string;
  type: "mandatory" | "conditional" | "random";
  category: string;
  priority: number;                          // 높을수록 먼저 처리
  /** 중요도. 비우면 `oncePolicy`로 추론한다 (위 주석) */
  tier?: EventTier;
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
  category: string; // 이벤트 내부 분류 (media, training 등) — eventEngine에서 MessageCategory로 매핑
  subject: string;
  body: string;
  /**
   * 문장 뱅크 (Phase 7-6, DESIGN §7.3). 있으면 `body` 대신 여기서 뽑고
   * **직전에 쓴 문장을 제외**한다.
   *
   * **쓸 거면 3개 이상이어야 한다** — 2개면 직전 제외가 "무조건 번갈아"가 되어
   * 랜덤이 아니라 교대가 된다. `npm run test:sentencebank`가 검사한다.
   */
  bodies?: string[];
  /** 제목도 여러 벌 둘 수 있다. 같은 규칙(3개 이상) */
  subjects?: string[];
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
  /**
   * **이 선택지가 보일 조건** (2026-08-23). 비우면 항상 보인다.
   *
   * 이벤트 조건(`EventRule.conditions`)은 "이 이야기가 뜨는가"를 정하고,
   * 이건 "그 이야기 안에서 이 길이 열려 있는가"를 정한다. 예전엔 이게 없어서
   * **고르면 무조건 그 효과였고, 선택이 전부 트레이드오프 고르기로 수렴했다.**
   *
   * ⚠ **발동 시점에 한 번 걸러서 메시지에 굳는다.** 소식은 스냅샷이라
   * 나중에 열어봐도 그때 열려 있던 길이 그대로 보인다 — 뜬 뒤에 돈이
   * 떨어졌다고 선택지가 사라지면 그게 더 이상하다.
   *
   * 🔴 **다 걸러지면 선택지 자체를 떼고 소식만 내보낸다.** `trimMailbox`가
   * 미결 선택지를 상한 위로 보존하기 때문에, 0개짜리 선택지가 생기면
   * **영원히 못 지우는 메시지**가 된다.
   */
  conditions?: Condition[];
}

// ── 이벤트 평가 컨텍스트 (evaluator 입력) ────────────────────
export interface EventContext {
  protagonist: ProtagonistSave;
  currentWeek: number;
  seasonPhase: SeasonPhase;
  standings: Standing[];
  stats: Record<string, PlayerSeasonStats>;
  triggeredEvents: Record<string, number>;   // eventId → 마지막 발생 주차
  /**
   * 학업 상태 — 대학 이벤트가 학점·경고를 조건으로 읽는다 (Phase 9-C).
   * 없으면 학업 조건은 전부 거짓이 된다(고교·프로에서는 그게 맞다).
   */
  schoolState?: import("./save").SchoolState;
  /**
   * 문장 뱅크의 "직전에 쓴 문장" 기억 (Phase 7-6). `templateId#body → index`.
   * 세이브에 남는 값이라 로드해도 같은 문장이 이어서 나오지 않는다
   */
  sentenceMemory?: Record<string, number>;
  /**
   * 관계도 — **비동기라 미리 실어 준다.** `slot.db`에서 읽는 값이고
   * `evaluateCondition`은 동기다. 안 실으면 관계 조건이 전부 false가 된다.
   */
  relations?: import("./relationship").Relationship[];
}
