import type { MessageItem } from "../types/main";
import type { NpcEmotion, NpcMemory, NpcSaveState } from "../types/save";

// ── 임계값 교차 감지 헬퍼 ────────────────────────────────────
function crossed(prev: number, next: number, threshold: number): boolean {
  return prev < threshold && next >= threshold;
}

function droppedBelow(prev: number, next: number, threshold: number): boolean {
  return prev >= threshold && next < threshold;
}

// ── 메시지 ID 중복 방지: 같은 트리거는 시즌당 1회만 ─────────
function triggerId(npcId: string, key: string, week: number): string {
  return `emo-${npcId}-${key}-W${week}`;
}

// ── 기억 중 최고 강도 항목 ───────────────────────────────────
function topMemory(memories: NpcMemory[]): NpcMemory | null {
  if (!memories.length) return null;
  return memories.reduce((a, b) => b.intensity > a.intensity ? b : a);
}

// ── 메시지 생성 ───────────────────────────────────────────────

function makeMsg(
  id: string,
  category: MessageItem["category"],
  sender: string,
  subject: string,
  body: string,
  week: number,
  decision?: MessageItem["decision"],
): MessageItem {
  return {
    id,
    category,
    sender,
    subject,
    body,
    preview: subject,
    createdAt: `W${week}`,
    readAt: null,
    decision,
  };
}

// ── 감독 트리거 ──────────────────────────────────────────────

function checkManagerTriggers(
  npc: NpcSaveState,
  prev: NpcEmotion,
  next: NpcEmotion,
  week: number,
): MessageItem | null {
  const name = npc.name;

  if (crossed(prev.trust, next.trust, 50)) {
    return makeMsg(
      triggerId(npc.npcId, "trust50", week),
      "manager",
      name,
      `[${name}] 네 투구를 눈여겨봐왔다`,
      `이번 시즌 네 성장이 눈에 띄더구나.\n\n앞으로도 지금처럼만 해줘.`,
      week,
    );
  }

  if (crossed(prev.dependence, next.dependence, 70)) {
    return makeMsg(
      triggerId(npc.npcId, "dep70", week),
      "manager",
      name,
      `[${name}] 에이스로 기용한다`,
      `다음 경기 선발은 너다. 팀이 믿는다.`,
      week,
    );
  }

  if (crossed(prev.resentment, next.resentment, 50) && next.resentment < 70) {
    return makeMsg(
      triggerId(npc.npcId, "res50", week),
      "manager",
      name,
      `[${name}] 경고`,
      `요즘 네 태도가 마음에 들지 않는다.\n\n이대로라면 기용 방침을 재검토해야 할 것 같다.`,
      week,
      {
        prompt: "어떻게 받아들이겠는가?",
        selectedOptionId: null,
        options: [
          {
            id: "accept",
            label: "수용한다",
            effectHint: "resentment -10, trust +5",
            effects: { moraleDelta: -5 },
          },
          {
            id: "pushback",
            label: "반발한다",
            effectHint: "resentment +10, 사기 +5",
            effects: { moraleDelta: 5 },
          },
        ],
      },
    );
  }

  if (crossed(prev.resentment, next.resentment, 70)) {
    return makeMsg(
      triggerId(npc.npcId, "res70", week),
      "manager",
      name,
      `[${name}] 선발 박탈 통보`,
      `이번 주는 불펜으로 내린다.\n\n다시 자리를 찾고 싶다면 보여줘.`,
      week,
    );
  }

  if (crossed(prev.contempt, next.contempt, 60)) {
    return makeMsg(
      triggerId(npc.npcId, "con60", week),
      "manager",
      name,
      `[${name}] 실망을 표하다`,
      `기대에 못 미치고 있다. 분발해라.`,
      week,
      {
        prompt: "어떻게 대응하겠는가?",
        selectedOptionId: null,
        options: [
          {
            id: "buckle",
            label: "분발하겠습니다",
            effectHint: "1주간 훈련 효율 +1",
            effects: { moraleDelta: -5 },
          },
          {
            id: "ignore",
            label: "신경 쓰지 않는다",
            effectHint: "사기 -10",
            effects: { moraleDelta: -10 },
          },
        ],
      },
    );
  }

  return null;
}

// ── 코치 트리거 ──────────────────────────────────────────────

function checkCoachTriggers(
  npc: NpcSaveState,
  prev: NpcEmotion,
  next: NpcEmotion,
  week: number,
): MessageItem | null {
  const name = npc.name;
  const mem  = npc.memories ?? [];

  if (crossed(prev.trust, next.trust, 50)) {
    return makeMsg(
      triggerId(npc.npcId, "trust50", week),
      "coach",
      name,
      `[${name}] 개인 훈련 제안`,
      `방과 후 30분만 같이 해보자.\n\n네 제구에 조금 더 집중하면 확실히 달라질 거다.`,
      week,
      {
        prompt: "수락하겠는가?",
        selectedOptionId: null,
        options: [
          {
            id: "accept",
            label: "수락한다",
            effectHint: "피로 +10, 커맨드 XP +3",
            effects: { fatigueDelta: 10, xp: { command: 3 } },
          },
          {
            id: "decline",
            label: "거절한다",
            effectHint: "trust -5",
            effects: {},
          },
        ],
      },
    );
  }

  const hasSharedOrdeal = mem.some(m => m.type === "shared_ordeal");
  if (crossed(prev.trust, next.trust, 70) && hasSharedOrdeal) {
    return makeMsg(
      triggerId(npc.npcId, "trust70ordeal", week),
      "coach",
      name,
      `[${name}] 비기 전수`,
      `너한테만 알려주는 거다.\n\n${topMemory(mem)?.detail ?? "그때 훈련"} 때 네가 끝까지 버티는 걸 보고 마음이 바뀌었어.`,
      week,
      {
        prompt: "받아들이겠는가?",
        selectedOptionId: null,
        options: [
          {
            id: "accept",
            label: "감사히 배우겠습니다",
            effectHint: "구속 즉시 +1",
            effects: { statDelta: { velocity: 1 } },
          },
          {
            id: "decline",
            label: "괜찮습니다",
            effectHint: "변화 없음",
            effects: {},
          },
        ],
      },
    );
  }

  if (crossed(prev.pressure, next.pressure, 70)) {
    return makeMsg(
      triggerId(npc.npcId, "pres70", week),
      "coach",
      name,
      `[${name}] 태도 경고`,
      `요즘 훈련을 빠지고 있더구나.\n\n이 상태로는 다음 등판을 보장하기 어렵다.`,
      week,
      {
        prompt: "어떻게 대응하겠는가?",
        selectedOptionId: null,
        options: [
          {
            id: "apologize",
            label: "죄송합니다, 분발하겠습니다",
            effectHint: "resentment -10",
            effects: { moraleDelta: -5 },
          },
          {
            id: "ignore",
            label: "신경 쓰지 않는다",
            effectHint: "resentment +15",
            effects: {},
          },
        ],
      },
    );
  }

  if (crossed(prev.excitement, next.excitement, 80)) {
    return makeMsg(
      triggerId(npc.npcId, "exc80", week),
      "coach",
      name,
      `[${name}] 성장에 감탄`,
      `이번 주 변화가 눈에 띄었다. 계속 이렇게 해줘.`,
      week,
    );
  }

  return null;
}

// ── 라이벌 트리거 ────────────────────────────────────────────

function checkRivalTriggers(
  npc: NpcSaveState,
  prev: NpcEmotion,
  next: NpcEmotion,
  week: number,
): MessageItem | null {
  const name = npc.name;
  const mem  = npc.memories ?? [];

  if (crossed(prev.recognition, next.recognition, 30)) {
    return makeMsg(
      triggerId(npc.npcId, "rec30", week),
      "news",
      "고교야구 뉴스",
      `[뉴스] ${name}, 신예 투수를 주목하다`,
      `${name}이 최근 급성장 중인 투수에 관심을 보이고 있는 것으로 알려졌다.`,
      week,
    );
  }

  if (crossed(prev.recognition, next.recognition, 60)) {
    return makeMsg(
      triggerId(npc.npcId, "rec60", week),
      "news",
      "고교야구 뉴스",
      `[뉴스] ${name}의 경계심`,
      `${name}은 "신경 쓰이는 선수가 생겼다"고 짧게 언급했다.`,
      week,
    );
  }

  if (crossed(prev.jealousy, next.jealousy, 60)) {
    return makeMsg(
      triggerId(npc.npcId, "jea60", week),
      "system",
      name,
      `[${name}] 도전장`,
      `${name}이 직접 연락을 해왔다.\n\n"다음에 만나면 결과가 다를 거야."`,
      week,
      {
        prompt: "어떻게 반응하겠는가?",
        selectedOptionId: null,
        options: [
          {
            id: "accept",
            label: "받아친다",
            effectHint: "사기 +5",
            effects: { moraleDelta: 5 },
          },
          {
            id: "ignore",
            label: "무시한다",
            effectHint: "압박감 -10",
            effects: { conditionDelta: 2 },
          },
        ],
      },
    );
  }

  const hasHumiliation = mem.some(m => m.type === "humiliation" && m.intensity >= 2);
  if (hasHumiliation && crossed(prev.recognition, next.recognition, 80)) {
    return makeMsg(
      triggerId(npc.npcId, "hum_rec80", week),
      "news",
      "고교야구 뉴스",
      `[뉴스] ${name} 설욕 선언`,
      `${name}은 인터뷰에서 "${topMemory(mem.filter(m => m.type === "humiliation"))?.detail ?? "그때"} 그 패배를 잊지 않겠다"고 밝혔다.`,
      week,
    );
  }

  return null;
}

// ── 팀메이트 트리거 ──────────────────────────────────────────

function checkTeammateTriggers(
  npc: NpcSaveState,
  prev: NpcEmotion,
  next: NpcEmotion,
  week: number,
): MessageItem | null {
  const name = npc.name;

  if (crossed(prev.trust, next.trust, 60)) {
    return makeMsg(
      triggerId(npc.npcId, "trust60", week),
      "system",
      name,
      `[${name}] 밥 한번 같이 먹자`,
      `${name}이 연락을 해왔다.\n\n"오늘 저녁 같이 먹자. 얘기하고 싶은 게 있어."`,
      week,
      {
        prompt: "어떻게 할까?",
        selectedOptionId: null,
        options: [
          {
            id: "go",
            label: "함께 간다",
            effectHint: "피로 +5, 사기 +15",
            effects: { fatigueDelta: 5, moraleDelta: 15 },
          },
          {
            id: "skip",
            label: "오늘은 피곤하다",
            effectHint: "trust -5",
            effects: {},
          },
        ],
      },
    );
  }

  return null;
}

// ── 재회 메시지 ──────────────────────────────────────────────

export function makeReunionMessage(
  npc: NpcSaveState,
  isSameTeam: boolean,
  week: number,
): MessageItem | null {
  if (!npc.memories?.length) return null;

  const mem  = topMemory(npc.memories);
  if (!mem) return null;

  const name    = npc.name;
  const context = mem.detail || "그 시절";

  if (isSameTeam) {
    return makeMsg(
      triggerId(npc.npcId, "reunion_same", week),
      "system",
      "코칭스태프",
      `낯익은 얼굴 — ${name}`,
      `${name}이 팀에 합류했다.\n\n${context}의 기억이 떠오른다.`,
      week,
    );
  } else {
    return makeMsg(
      triggerId(npc.npcId, "reunion_opp", week),
      "news",
      "고교야구 뉴스",
      `이번 주 상대 — ${name}`,
      `${name}이 상대팀 명단에 있다.\n\n${context} 이후 처음 다시 만나는 것이다.`,
      week,
    );
  }
}

// ── 팀 분위기 경고 (전체 팀메이트 resentment 기반) ──────────

export function checkTeamMoodWarning(
  teammates: NpcSaveState[],
  week: number,
): MessageItem | null {
  const active = teammates.filter(n => n.isNamed && n.emotion && n.emotionRole === "teammate");
  if (active.length === 0) return null;

  const avgResentment = active.reduce((s, n) => s + (n.emotion?.resentment ?? 0), 0) / active.length;

  if (avgResentment >= 50) {
    return makeMsg(
      `emo-team-mood-W${week}`,
      "coach",
      "코칭스태프",
      "팀 분위기 경고",
      `팀 내부 분위기가 좋지 않다는 보고가 올라왔습니다.\n\n이대로라면 후반기 경기력에 영향을 줄 수 있습니다.`,
      week,
    );
  }

  return null;
}

// ── shared_ordeal 메시지 ─────────────────────────────────────

export function makeSharedOrdealMessage(
  npcs: NpcSaveState[],
  detail: string,
  week: number,
): MessageItem {
  return makeMsg(
    `emo-shared-ordeal-W${week}`,
    "system",
    "팀",
    "동료와의 결속",
    `${detail}\n\n힘들었지만 팀이 더 가까워진 것 같다.`,
    week,
  );
}

// ── 메인 트리거 체크 ─────────────────────────────────────────

export function checkEmotionTriggers(
  npc: NpcSaveState,
  prevEmotion: NpcEmotion,
  week: number,
): MessageItem | null {
  if (!npc.isNamed || !npc.emotion) return null;

  switch (npc.emotionRole) {
    case "manager":  return checkManagerTriggers(npc, prevEmotion, npc.emotion, week);
    case "coach":    return checkCoachTriggers(npc, prevEmotion, npc.emotion, week);
    case "rival":    return checkRivalTriggers(npc, prevEmotion, npc.emotion, week);
    case "teammate": return checkTeammateTriggers(npc, prevEmotion, npc.emotion, week);
    default:         return null;
  }
}
