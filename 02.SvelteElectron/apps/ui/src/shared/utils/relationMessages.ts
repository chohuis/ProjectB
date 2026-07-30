// 관계 변화 알림 (Phase 6C)
//
// **라벨이 바뀐 것만 알린다.** 값은 플레이어에게 노출하지 않는다(people.md §4).
// 구 emotionMessageEngine은 9축 각각의 임계값을 넘을 때마다 메시지를 만들어
// 한 주에 여러 통이 날아갈 수 있었다. 라벨 변화는 시즌에 한두 번뿐이라
// 알림이 사건으로 남는다.

import type { MessageItem } from "../types/main";
import type { EntityRow } from "../stores/master";
import type { RelationDelta } from "../usecases/relationships";
import type { RelationKind } from "../types/relationship";

/** 관계 라벨 7단계의 순서 — 오른 것과 내린 것을 구분하는 데 쓴다 */
const LABEL_ORDER = ["적대", "불신", "서먹", "중립", "우호", "신뢰", "각별"];

function rose(prevLabel: string, label: string): boolean {
  return LABEL_ORDER.indexOf(label) > LABEL_ORDER.indexOf(prevLabel);
}

const KIND_TITLE: Record<RelationKind, string> = {
  manager:  "감독",
  coach:    "코치",
  owner:    "구단주",
  teammate: "팀 동료",
  rival:    "라이벌",
};

/** 오른 쪽 / 내린 쪽으로 각각 무슨 일이 따라오는지 — 플레이어가 알아야 할 실효 */
const EFFECT_UP: Record<RelationKind, string> = {
  manager:  "출전 기회와 보직 배정에서 우선순위가 올라갑니다.",
  coach:    "담당 영역 훈련 효율이 오릅니다.",
  owner:    "재계약 협상에서 여유를 두고 봅니다.",
  teammate: "팀 분위기와 동료 관련 이벤트에 반영됩니다.",
  rival:    "서로를 인정하는 관계가 됐습니다.",
};

const EFFECT_DOWN: Record<RelationKind, string> = {
  manager:  "출전 기회 배정에서 뒤로 밀릴 수 있습니다.",
  coach:    "담당 영역 훈련 효율이 떨어집니다.",
  owner:    "재계약·방출 판정이 냉정해집니다.",
  teammate: "팀 분위기에 부담이 됩니다.",
  rival:    "적대감이 짙어졌습니다.",
};

/**
 * 라벨이 바뀐 관계만 메시지로 만든다.
 *
 * @param nameOf 상대 이름 조회용 엔티티 (없으면 ID를 그대로 쓰지 않고 역할명으로 대체 —
 *   화면에 `COA_0123`이 뜨는 것보다 "코치"가 낫다)
 */
export function buildRelationMessages(
  deltas: RelationDelta[],
  week: number,
  entities: EntityRow[],
  kindOf: Map<string, RelationKind> = new Map(),
): MessageItem[] {
  const changed = deltas.filter((d) => d.labelChanged);
  if (changed.length === 0) return [];

  const nameById = new Map(entities.map((e) => [e.id, e.name]));
  const out: MessageItem[] = [];

  for (const d of changed) {
    const kind = kindOf.get(d.personId) ?? "teammate";
    const title = KIND_TITLE[kind] ?? "관계";
    const name = nameById.get(d.personId) ?? title;
    const up = rose(d.prevLabel, d.label);

    out.push({
      id: `msg-rel-${d.personId}-w${week}`,
      category: "system",
      sender: "관계 변화",
      subject: `${name} — ${d.prevLabel} → ${d.label}`,
      preview: up ? `${title}와의 관계가 나아졌습니다.` : `${title}와의 관계가 나빠졌습니다.`,
      body: [
        `${name} (${title})`,
        "",
        `${d.prevLabel} → ${d.label}`,
        "",
        up ? EFFECT_UP[kind] : EFFECT_DOWN[kind],
      ].join("\n"),
      createdAt: `W${week}`,
      readAt: null,
    });
  }
  return out;
}

/**
 * 팀 분위기 점검 — 동료 관계가 전반적으로 나쁠 때 한 통.
 *
 * 구 `checkTeamMoodWarning`을 대체한다. 그쪽은 trust/resentment/pressure 3축을
 * 각각 세어 "신뢰 낮음 3명 / 불만 누적 2명"처럼 축 이름을 그대로 노출했다.
 * 관계도는 값이 하나라 "몇 명과 사이가 나쁜가"로 바로 말할 수 있다.
 */
export function buildTeamMoodMessage(
  teammateValues: number[],
  week: number,
): MessageItem | null {
  if (teammateValues.length < 3) return null;
  const cold = teammateValues.filter((v) => v <= -11).length;   // 서먹 이하
  const hostile = teammateValues.filter((v) => v <= -31).length; // 불신 이하
  if (cold === 0) return null;

  const total = teammateValues.length;
  const severe = hostile >= Math.ceil(total / 3);
  const parts = [`사이가 서먹한 동료 ${cold}명`];
  if (hostile > 0) parts.push(`그중 ${hostile}명은 불신 이상`);

  return {
    id: `msg-team-mood-${week}`,
    category: "system",
    sender: "팀 분위기",
    subject: severe ? `W${week} 라커룸 경고` : `W${week} 라커룸 점검`,
    preview: parts.join(" · "),
    body: [
      `동료 ${total}명 중 ${cold}명과 관계가 좋지 않습니다.`,
      ...(hostile > 0 ? [`${hostile}명은 불신 단계 이하입니다.`] : []),
      "",
      severe
        ? "이 상태가 이어지면 동료 관련 이벤트가 불리하게 갈립니다."
        : "경기 결과와 이벤트 선택으로 회복할 수 있습니다.",
    ].join("\n"),
    createdAt: `W${week}`,
    readAt: null,
  };
}
