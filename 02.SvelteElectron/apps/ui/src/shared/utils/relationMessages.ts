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

// ── 라벨 진입 장면 (Phase 7-6c) ────────────────────────────────
//
// 6C가 걷어낸 감정 문구 838줄은 **호출되는 곳이 없는 죽은 코드**였지만 문구와
// 선택지는 쓸 만했다. 트리거를 9축 임계값에서 **관계 라벨 진입**으로 바꿔 되살린다.
//
// ⚠ 그 시절의 진짜 결함은 문구가 아니라 **표시와 동작의 불일치**였다.
// `effectHint`에 "trust +5"라고 적어놓고 실제로는 사기·피로만 움직였다.
// 그래서 여기 `effects`에 `relationDelta`를 반드시 같이 적는다 —
// `DecisionEffect.relationDelta`가 그것 때문에 생긴 필드다(7-6c).
//
// 버린 5건(사용자 확정): 코치 단기축 2건(pressure·excitement) · 라이벌 인지도 3건.
// 관계도에 단기 축과 인지도 축이 없고, 만들면 "판정 근거가 다시 여러 개"가 되어
// 6C가 없앤 문제로 돌아간다.

interface SceneOption {
  id: string;
  label: string;
  effectHint: string;
  effects: import("../types/main").DecisionEffect;
}

interface LabelScene {
  /** 이 라벨로 **진입**했을 때 */
  label: string;
  subject: string;
  /** 뱅크가 아니다 — 라벨 진입은 커리어에 몇 번 없어 반복이 안 보인다 */
  body: string[];
  options?: SceneOption[];
}

const SCENES: Partial<Record<RelationKind, LabelScene[]>> = {
  manager: [
    {
      label: "신뢰",
      subject: "감독이 따로 불렀다",
      body: [
        "훈련이 끝나고 감독이 손짓했다.",
        "",
        "\"네 투구를 눈여겨봐왔다. 요란하진 않은데 꾸준하더군.\"",
        "",
        "그 말이 전부였다. 하지만 이 사람이 그런 말을 아무에게나 하지 않는다는 건 안다.",
      ],
    },
    {
      label: "각별",
      subject: "감독 — 에이스 통보",
      body: [
        "감독이 로테이션 표를 내밀었다. 내 이름이 맨 위에 있었다.",
        "",
        "\"올해는 네가 첫 번째다. 상대 에이스와 붙는다는 뜻이야.\"",
        "",
        "부담이라는 말은 하지 않았다. 이미 알고 있을 거라 여긴 것이다.",
      ],
    },
    {
      label: "서먹",
      subject: "감독의 경고",
      body: [
        "감독이 훈련 뒤 남으라고 했다. 목소리가 평소보다 낮았다.",
        "",
        "\"실력 얘기가 아니다. 태도 얘기다. 지금 이대로면 곤란해.\"",
        "",
        "무슨 답을 하느냐가 다음을 정할 것이다.",
      ],
      options: [
        {
          id: "accept",
          label: "받아들인다",
          effectHint: "감독 관계 +6 · 사기 -4",
          effects: { moraleDelta: -4, relationDelta: { kind: "manager", delta: 6 } },
        },
        {
          id: "push_back",
          label: "납득할 수 없다고 말한다",
          effectHint: "감독 관계 -8 · 사기 +6",
          effects: { moraleDelta: 6, relationDelta: { kind: "manager", delta: -8 } },
        },
      ],
    },
    {
      label: "불신",
      subject: "선발 로테이션 제외",
      body: [
        "게시된 로테이션 표에서 내 이름이 빠져 있었다.",
        "",
        "감독은 설명하지 않았다. 설명할 필요를 못 느낀다는 뜻이다.",
        "",
        "여기서부터는 성적으로 답하는 수밖에 없다.",
      ],
    },
  ],

  coach: [
    {
      label: "우호",
      subject: "코치 — 개인 훈련 제안",
      body: [
        "코치가 공을 던져주며 물었다.",
        "",
        "\"방과 후 30분, 시간 되면 봐줄게. 붙잡고 싶은 게 있어.\"",
        "",
        "정규 훈련 밖의 시간이다. 그만큼 몸에는 남는다.",
      ],
      options: [
        {
          id: "join",
          label: "함께 남는다",
          effectHint: "피로 +10 · 제구 XP +3 · 코치 관계 +5",
          effects: {
            fatigueDelta: 10,
            xp: { control: 3 },
            relationDelta: { kind: "coach", delta: 5 },
          },
        },
        {
          id: "decline",
          label: "오늘은 쉰다",
          effectHint: "피로 -3 · 코치 관계 -3",
          effects: { fatigueDelta: -3, relationDelta: { kind: "coach", delta: -3 } },
        },
      ],
    },
    {
      label: "각별",
      subject: "코치 — 비기 전수",
      body: [
        "코치가 아무도 없는 불펜으로 데려갔다.",
        "",
        "\"이건 내가 현역 때 쓰던 거다. 아무한테나 안 알려줘.\"",
        "",
        "그립을 잡는 손이 조금 떨렸다. 이 사람은 지금 자기 것을 넘겨주고 있다.",
      ],
      options: [
        {
          id: "learn",
          label: "배운다",
          effectHint: "구속 +1 · 피로 +8 · 코치 관계 +4",
          effects: {
            statDelta: { velocity: 1 },
            fatigueDelta: 8,
            relationDelta: { kind: "coach", delta: 4 },
          },
        },
        {
          id: "later",
          label: "지금은 내 폼을 지킨다",
          effectHint: "코치 관계 -2",
          effects: { relationDelta: { kind: "coach", delta: -2 } },
        },
      ],
    },
  ],

  teammate: [
    {
      label: "신뢰",
      subject: "동료 — 밥 한번 같이 먹자",
      body: [
        "훈련 뒤 동료가 어깨를 툭 쳤다.",
        "",
        "\"밥 한번 같이 먹자. 얘기할 것도 있고.\"",
        "",
        "특별한 용건은 없어 보인다. 그게 이 관계가 온 자리다.",
      ],
      options: [
        {
          id: "go",
          label: "함께 간다",
          effectHint: "사기 +15 · 동료 관계 +6 · 지출 5만원",
          effects: {
            moraleDelta: 15,
            relationDelta: { kind: "teammate", delta: 6 },
            luxurySpend: { cost: 5, onTeammate: true },
          },
        },
        {
          id: "treat",
          label: "내가 산다",
          effectHint: "사기 +18 · 동료 관계 대폭 상승 · 지출 40만원",
          effects: {
            moraleDelta: 18,
            luxurySpend: { cost: 40, onTeammate: true },
          },
        },
        {
          id: "skip",
          label: "다음에 하자고 한다",
          effectHint: "동료 관계 -4",
          effects: { relationDelta: { kind: "teammate", delta: -4 } },
        },
      ],
    },
  ],
};

/**
 * 어떤 장면이 정의돼 있는가 — **회귀·시나리오 전용 조회구.**
 *
 * 검사 쪽이 라벨을 손으로 적으면 그게 두 번째 표가 되고, 여기가 바뀔 때
 * 조용히 어긋난다 (실제로 그렇게 헛 실패가 났다). 목록은 여기서만 나온다.
 */
export function relationSceneCatalog(): { kind: RelationKind; label: string; hasOptions: boolean }[] {
  const out: { kind: RelationKind; label: string; hasOptions: boolean }[] = [];
  for (const [kind, scenes] of Object.entries(SCENES)) {
    for (const sc of scenes ?? []) {
      out.push({ kind: kind as RelationKind, label: sc.label, hasOptions: (sc.options?.length ?? 0) > 0 });
    }
  }
  return out;
}

/** 이 라벨로 진입했을 때 붙일 장면 */
function sceneFor(kind: RelationKind, label: string): LabelScene | null {
  return SCENES[kind]?.find((sc) => sc.label === label) ?? null;
}

/**
 * 효과의 대상을 이 장면의 상대로 못박는다.
 *
 * 안 하면 `relationDelta`가 "접촉 중인 첫 상대"로 가서, 3번 코치와의 장면에서
 * 1번 코치와 친해지는 일이 생긴다. 관계가 여러 명인 kind(coach·teammate)에서
 * 특히 티가 난다.
 */
function withPerson(
  fx: import("../types/main").DecisionEffect,
  personId: string,
): import("../types/main").DecisionEffect {
  const out = { ...fx };
  if (out.relationDelta) out.relationDelta = { ...out.relationDelta, personId };
  if (out.luxurySpend) out.luxurySpend = { ...out.luxurySpend, personId };
  return out;
}

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

    // 이 라벨에 붙은 장면이 있으면 건조한 통보 대신 그걸 쓴다.
    // 없으면 기존대로 — 7단계 × 5종을 다 쓰지 않아도 되게 한 것이다
    const scene = sceneFor(kind, d.label);

    out.push({
      id: `msg-rel-${d.personId}-w${week}`,
      category: scene ? (kind === "coach" ? "coach" : kind === "manager" ? "manager" : "system") : "system",
      sender: scene ? name : "관계 변화",
      subject: scene ? scene.subject : `${name} — ${d.prevLabel} → ${d.label}`,
      preview: up ? `${title}와의 관계가 나아졌습니다.` : `${title}와의 관계가 나빠졌습니다.`,
      body: scene
        ? [
            ...scene.body,
            "",
            "─".repeat(20),
            `${name} (${title}) · ${d.prevLabel} → ${d.label}`,
            up ? EFFECT_UP[kind] : EFFECT_DOWN[kind],
          ].join("\n")
        : [
            `${name} (${title})`,
            "",
            `${d.prevLabel} → ${d.label}`,
            "",
            up ? EFFECT_UP[kind] : EFFECT_DOWN[kind],
          ].join("\n"),
      createdAt: `W${week}`,
      readAt: null,
      // 선택지가 있는 장면은 **상대를 지목**해서 넘긴다 — 안 그러면
      // "접촉 중인 첫 상대"에게 효과가 가서 엉뚱한 사람과 친해진다
      decision: scene?.options
        ? {
            prompt: scene.subject,
            options: scene.options.map((o) => ({
              id: o.id,
              label: o.label,
              effectHint: o.effectHint,
              effects: withPerson(o.effects, d.personId),
            })),
            selectedOptionId: null,
          }
        : undefined,
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
