/**
 * W47 드래프트 — 관전을 건너뛸 때의 배경 처리.
 *
 * **예전엔 여기가 별도의 드래프트였다.** 자체 후보 풀(고교 3학년 상위 80% +
 * 대학 상위 30 + 독립 상위 15)을 `masterStore.entities`의 정의치로 만들고,
 * 자체 지명 시뮬을 돌려 `slotRepo.assignDraft`로 **DB에 직접 썼다.**
 * 시즌 종료의 `processNpcDraft`는 다른 후보 풀로 또 한 번 돌았고, 거래기록이
 * 두 벌 쌓이면서 화면에서 본 지명과 실제 소속이 어긋났다.
 *
 * 이제 실제 드래프트는 `gameStore.processNpcDraft` 하나뿐이고, 이 함수는
 * 그걸 호출해 결과를 로그로 옮기기만 한다. 관전 보드(`DraftBoardModal`)도
 * 같은 결과를 재생한다.
 */
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { draftDestinationTeams, type DraftBoardBackgroundResult } from "../utils/draftSystem";

export async function runDraftBoardBackground(
  _slotId: string,
  seasonYear: number,
): Promise<DraftBoardBackgroundResult> {
  const { univIds, indIds } = draftDestinationTeams(get(masterStore).teams);
  const result = await gameStore.processNpcDraft(seasonYear, univIds, indIds);

  // 이미 그 해 드래프트가 끝났으면(중복 호출) 로그를 다시 쓰지 않는다
  if (!result) return { picks: [] };

  const nameById = new Map<string, string>();
  for (const npc of get(gameStore).npcs) nameById.set(npc.npcId, npc.name);
  for (const entity of get(masterStore).entities) {
    if (!nameById.has(entity.id)) nameById.set(entity.id, entity.name);
  }

  gameStore.clearCareerDraftPickLog();
  for (const pick of result.picks) {
    gameStore.appendCareerDraftPickLog({
      pickNo: pick.pick,
      round: pick.round,
      teamId: pick.teamId,
      playerId: pick.npcId,
      playerName: nameById.get(pick.npcId) ?? pick.npcId,
      isUser: false,
    });
  }

  await gameStore.save();
  return { picks: result.picks.map((p) => ({
    pickNo: p.pick, round: p.round, teamId: p.teamId, candidateId: p.npcId, isUser: false,
  })) };
}
