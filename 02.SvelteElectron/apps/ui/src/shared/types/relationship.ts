// 관계도 타입 (Phase 6C) — 설계 정본 docs/design/people.md §4
//
// 주인공 기준 1:N만 추적한다. 그래서 "누구와 누구" 쌍이 아니라 상대 한 명이 한 행이다.
//
// 구 감정 시스템(NpcEmotion 9축)을 이것으로 대체한다. 9축은 라이벌 서사에는 풍부했지만
// 축이 서로 독립적이어서 "그래서 감독이 날 쓰는가"를 판정할 단일 근거가 없었고,
// 스태프는 npcs 배열에 없으니 manager/coach 분기는 한 번도 실행되지 않았다.

/** 관계 대상의 성격. 무엇에 영향을 주는지가 이 값으로 갈린다 (people.md §4 표) */
export type RelationKind =
  | "manager"   // 역할 배정 · 콜업 우선순위
  | "coach"     // 담당 영역 훈련 효율
  | "owner"     // 재계약 · 방출 인내심
  | "teammate"  // 이벤트 분기 · 사기 · 뉴스 실측 근거
  | "rival";    // 서사 (맞대결 · 재회)

/**
 * 접촉 상태. 감쇠 규칙이 여기서 갈린다.
 * - `together` 지금 같은 팀 — 매주 갱신
 * - `apart`    헤어짐 — 오프시즌마다 0쪽으로 감쇠. 재회하면 그 값에서 재개
 * - `ended`    은퇴 등 종료 — 값 동결, 기록으로만 남는다
 */
export type RelationContact = "together" | "apart" | "ended";

/** 관계에 각인된 사건. 값과 별개로 서사 문구의 근거가 된다 */
export type RelationMemoryType =
  | "humiliation"    // 공개적으로 당함
  | "gratitude"      // 결정적 도움을 받음
  | "betrayal"       // 뒤통수 (FA로 라이벌 팀 이적 등)
  | "witness"        // 대단한 장면을 직접 목격
  | "shared_ordeal"; // 함께 고생함

export interface RelationMemory {
  type:      RelationMemoryType;
  season:    number;
  week:      number;
  intensity: 1 | 2 | 3;
  detail:    string;   // "2029 고교 패왕기 결승" 등 맥락
}

export interface Relationship {
  personId:  string;
  kind:      RelationKind;
  /** −100 ~ +100. 플레이어에게 숫자로 노출하지 않는다 — 라벨만 보여준다 */
  value:     number;
  contact:   RelationContact;
  metSeason: number;
  metTeam:   string;
  /** 마지막으로 함께 있던 팀. 재회 판정과 팀 단위 일괄 감쇠에 쓴다 */
  lastTeam:  string;
  memories:  RelationMemory[];
  updatedWeek: number;

  // person VIEW 조인 시에만 채워진다 (화면용 — 값이 없어도 로직은 돌아야 한다)
  name?:     string;
  teamId?:   string;
  leagueId?: string;
  age?:      number;
}

/**
 * 7단계 라벨. 경계는 Rust `relationship.rs`의 `RELATION_LABELS`와 **같은 값**이어야 한다.
 * 두 곳에 둔 이유: 화면은 IPC 왕복 없이 라벨을 그려야 하고, 판정은 Rust에서 한다.
 * 경계를 바꿀 때는 반드시 양쪽을 함께 고치고 `npm run test:relationship`으로 대조한다.
 */
export const RELATION_LABELS = [
  { min: -100, max: -61, label: "적대", tone: "hostile" },
  { min:  -60, max: -31, label: "불신", tone: "distrust" },
  { min:  -30, max: -11, label: "서먹", tone: "cold" },
  { min:  -10, max:  10, label: "중립", tone: "neutral" },
  { min:   11, max:  34, label: "우호", tone: "friendly" },
  { min:   35, max:  64, label: "신뢰", tone: "trusted" },
  { min:   65, max: 100, label: "각별", tone: "close" },
] as const;

export type RelationTone = typeof RELATION_LABELS[number]["tone"];

export function relationLabel(value: number): { label: string; tone: RelationTone } {
  const v = Math.max(-100, Math.min(100, Math.round(value)));
  const hit = RELATION_LABELS.find((r) => v >= r.min && v <= r.max);
  // 경계에 구멍이 없으므로 도달하지 않지만, 라벨이 없어서 화면이 비는 것보다 중립이 낫다
  return hit ? { label: hit.label, tone: hit.tone } : { label: "중립", tone: "neutral" };
}
