/**
 * **이야기 인물 등록부** — 이벤트 데이터가 「그 사람」을 가리킬 수 있게 한다 (죽은 칸 5 · 2026-09-21).
 *
 * 🔴 **왜 필요했나.** `compare` 조건(§12)은 「나와 저 NPC 의 스탯을 견준다」인데
 *   가리키는 수단이 `npcId` 직접뿐이었다. 그런데 **NPC 는 런타임 생성**이라
 *   판마다 id 가 다르다 — 데이터에 적을 수 있는 id 가 세상에 없다. 그래서
 *   `compare` 는 749종 중 **한 자리도 안 쓰였다**(`EVENT_TIERS_APPLIED` §8).
 *   히든 「라이벌의 편지」·「후배가 넘어선 날」이 여기 걸려 있었다.
 *
 * 그래서 **이름표(`role`)를 데이터가 적고, 그 이름표가 가리키는 사람은 판이
 * 굴러가며 정해진다.** 등록부는 `protagonist.storyNpcs` 에 앉고 세이브를 탄다.
 *
 * ⚠ **선수를 파일로 미리 만들지 않는다**(`CLAUDE.md` 절대 금지). 등록부에
 *   들어가는 것은 **이미 세상에 있는 NPC 의 id** 뿐이다.
 *
 * ⚠ **고교 시나리오(`school_scenarios/*.json` 의 `protagonistRoles`)는 안 쓴다.**
 *   2026-09-21 에 전수로 확인했다 — 그 파일을 읽는 코드가 **0 곳**이고
 *   `initNpcsForNewGame`(유일한 소비자)은 **아무도 안 부른다**. 거기 적힌
 *   `PLY_000NN` 을 등록부에 넣으면 **없는 사람을 가리키게 된다.**
 *
 * ⚠ **한 번 정해지면 안 바뀐다.** 라이벌이 매주 바뀌면 「라이벌의 편지」가
 *   아무 뜻이 없다 — 그 사람이 누구인지가 이야기의 전부다.
 */

/**
 * 데이터가 쓸 수 있는 이름표 — **정본은 여기 하나.**
 *
 * ⚠ 늘릴 때 표 셋을 같이: 여기 · `nextStoryNpcs` 의 채우는 갈래 ·
 *   `stores/master.ts` 의 `compare.role` 검증(로드에서 던진다).
 *   채우는 갈래가 없는 이름표를 열면 **영원히 false** 인 조건이 생긴다.
 */
export const STORY_NPC_ROLES = ["rival", "mentee"] as const;
export type StoryNpcRole = (typeof STORY_NPC_ROLES)[number];

export function isStoryNpcRole(v: string): v is StoryNpcRole {
  return (STORY_NPC_ROLES as readonly string[]).includes(v);
}

/** 등록부를 채울 재료 — 전부 **이미 돌고 있는** 신호다. 새로 세는 칸을 만들지 않는다 */
export interface StoryNpcSignals {
  /**
   * 이번 주 실제로 나와 맞붙어 던진 상대 선발.
   * `advanceWeek` 의 `facedRivals[0]` 그대로다 — 관계도가 이미 그 사람을
   * 「라이벌」로 부른다(`applyWeeklyRelations`).
   */
  facedRivalId?: string | null;
  /** 지도한 후배 수 — `counterDelta` 가 올리는 기존 카운터(`counters.menteeCount`) */
  menteeCount?: number;
  /** 지금 같은 팀 NPC 들. 나이가 있어야 「후배」를 고를 수 있다 */
  teammates?: readonly { npcId: string; age: number }[];
  /** 주인공 나이 — 후배는 나보다 어린 사람이다 */
  myAge?: number;
}

/**
 * 등록부의 다음 모습. **바뀐 게 없으면 `null`** 을 낸다 — 부르는 쪽이 store 를
 * 안 건드리게(매주 같은 값을 다시 쓰면 세이브가 매주 더러워진다).
 *
 * ⚠ 이미 찬 칸은 **덮지 않는다.**
 */
export function nextStoryNpcs(
  current: Readonly<Record<string, string>> | undefined,
  sig: StoryNpcSignals,
): Record<string, string> | null {
  const cur = current ?? {};
  const add: Record<string, string> = {};

  // 라이벌 — 처음 맞붙은 상대 선발. 「누가 라이벌인가」를 새로 판정하지 않는다
  if (!cur.rival && sig.facedRivalId) add.rival = sig.facedRivalId;

  // 후배 — 지도를 한 번이라도 한 뒤(`menteeCount ≥ 1`) 같은 팀의 **가장 어린**
  // 사람. 나보다 어린 사람만 후보다. 동갑이 여럿이면 id 오름차순으로 갈라
  // 같은 세상에서 같은 답이 나오게 한다(판이 흔들리면 이야기도 흔들린다)
  if (!cur.mentee && (sig.menteeCount ?? 0) >= 1) {
    const younger = (sig.teammates ?? []).filter(
      (t) => sig.myAge === undefined || t.age < sig.myAge,
    );
    if (younger.length > 0) {
      const pick = [...younger].sort((a, b) =>
        a.age !== b.age ? a.age - b.age : a.npcId < b.npcId ? -1 : 1,
      )[0];
      add.mentee = pick.npcId;
    }
  }

  if (Object.keys(add).length === 0) return null;
  return { ...cur, ...add };
}

/**
 * 이름표 → npcId. 데이터가 `npcId` 를 직접 적었으면 그게 이긴다(옛 길을 안 막는다).
 *
 * ⚠ **못 찾으면 `undefined`** 고 조건은 false 다. 「이겼다」로 읽으면 없는
 *   라이벌을 이긴 게 된다(`types/event.ts` compare 주석).
 */
export function storyNpcIdOf(
  registry: Readonly<Record<string, string>> | undefined,
  cond: { npcId?: string; role?: string },
): string | undefined {
  if (cond.npcId) return cond.npcId;
  if (!cond.role) return undefined;
  return registry?.[cond.role];
}
