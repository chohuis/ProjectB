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
  // 지명 로그(careerDraftPickLog)는 processNpcDraft가 남긴다 — 관전 보드가 그걸 재생한다
  const result = await gameStore.processNpcDraft(seasonYear, univIds, indIds);
  await gameStore.save();

  // 이미 그 해 드래프트가 끝났으면(중복 호출) null이 온다
  return { picks: (result?.picks ?? []).map((p) => ({
    pickNo: p.pick, round: p.round, teamId: p.teamId, candidateId: p.npcId, isUser: false,
  })) };
}
