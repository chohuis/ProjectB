/**
 * **주간 관계도 갱신** (2026-09-27 · Ⅱ-1 쪼개기).
 *
 * 🔴 **자리를 옮겼다. 로직은 한 줄도 안 바꿨다.** `advanceWeek.ts` 의
 *   `processWeekBoundary` 안에 있던 「관계도 갱신」 절 하나가 그대로 나왔다.
 *   블록 경계는 지금 파일의 주석 절을 그대로 따랐다.
 *
 * ⚠ **바깥에서 받는 것은 셋뿐이다** — 주차 · 이번 주 OVR 변화 · 특성 보정.
 *   나머지는 전부 store 에서 다시 읽으므로(옮기기 전에도 그랬다) 인자를
 *   늘리지 않았다. 셋째 인자 이름을 `myMods` 그대로 둔 것은 **본문을 한 글자도
 *   안 고치기 위해서다** — 이름을 바꾸면 그게 「뜻 불변」의 증명을 깎는다.
 *
 * ⚠ 옮기기 전에 쓴 검사(`__tests__/relationsWeekBlock.test.ts` · 갈림길 9 +
 *   배선 대조군 3)가 주간 진행 경로를 **한 덩이로** 읽으므로 검사 문장은
 *   한 글자도 안 바뀌었다.
 */
import { get } from "svelte/store";
import { gameStore } from "../../stores/game";
import { seasonStore } from "../../stores/season";
import { masterStore } from "../../stores/master";
import { isV3SlotActive } from "../../repo/v3Mode";
import { applyWeeklyRelations, reconcileRelationships, trainingAreaOf } from "../relationships";
import { buildRelationMessages } from "../../utils/relationMessages";
import { nextStoryNpcs } from "../../utils/storyNpcRegistry";

export async function runRelationsWeek(
  weekNum: number,
  ovrDeltaThisWeek: number,
  myMods: { relation: number },
): Promise<void> {
  // ── 관계도 갱신 (Phase 6C — 구 NPC 감정 시스템을 대체) ─────────
  //
  // 구 코드는 `careerStage === "highschool"`일 때만 돌았고, 감독·코치는
  // npcs 배열에 없어서 애초에 대상이 아니었다. 지금은 스태프 전원 + 팀동료가
  // 전 커리어에 걸쳐 갱신된다.
  {
    const gRel = get(gameStore);
    const sRel = get(seasonStore);
    const slotId = gRel.currentSlotId;

    if (isV3SlotActive() && slotId) {
      try {
        // ① 소속 정합 먼저 — 팀이 바뀌었으면 감쇠·apart 처리 후 새 팀 인원을 만든다.
        //    팀 변경 훅을 개별 지점에 박지 않는다 (relationships.ts 주석 참고)
        await reconcileRelationships({
          slotId,
          worldSeed: sRel.worldSeed,
          teamId: gRel.protagonist.teamId,
          season: sRel.seasonYear,
          week: weekNum,
          teammateIds: gRel.npcs
            .filter(
              (n) => n.currentTeam === gRel.protagonist.teamId && n.npcId !== gRel.protagonist.id,
            )
            .map((n) => n.npcId),
          // 지명 순위는 "팀이 나를 어떻게 보고 데려왔나"라서 감독 초기값에만 붙는다
          draftRound: gRel.schoolState.careerResults?.draftRound ?? 0,
          draftedContext: !!gRel.schoolState.careerResults?.draftDrafted,
        });

        // ⚠ **`weekNum`이 아니라 `weekNum - 1`이다.** `processWeekBoundary`는
        // `advanceWeek()` **뒤에** `nextWeekNum`으로 불린다 — 막 들어선 주다.
        // 그 주 경기는 아직 안 치렀으므로 `result != null`이 영원히 거짓이었고,
        // **경기에 걸린 관계 항목이 전부 죽어 있었다.**
        //
        // 증상이 조용했던 이유: 훈련에 걸린 코치 관계는 멀쩡히 움직여서
        // "관계도가 도는데 감독·동료만 안 오른다"로 보였다. 실측(2026-08-08
        // `measure:relations`)에서 갈렸다 — 코치 −6~40, **동료 30명 전원
        // 초기값 그대로에 갱신 주차가 W1**이었다.
        const gameWeek = weekNum - 1;
        const myGame = sRel.schedule.find(
          (e) => e.week === gameWeek && e.isProtagonistGame && e.result != null,
        );
        const myResult = myGame?.result;
        const teamWon = myResult != null && myResult.winnerId === gRel.protagonist.teamId;

        // 등판 여부·성적은 **경기 라인이 정본**이다. 누적 stats에서 역산하면
        // 주 단위 델타를 다시 만들어야 하고 그 계산이 또 하나의 진실이 된다.
        const lines = myResult?.playerLines ?? [];
        const myLine = lines.find(
          (l): l is import("../../types/season").PitcherGameLine =>
            l.role === "pitcher" && l.playerId === gRel.protagonist.id,
        );
        const era = myLine && myLine.ip > 0 ? (myLine.er * 9) / myLine.ip : 0;

        // 이번 주 훈련 영역 — 담당 코치만 오르게 하는 근거
        const primaryId = gRel.trainingPlan?.primaryProgramId ?? null;
        const focus = get(masterStore).trainingPrograms.find((pr) => pr.id === primaryId)?.focus;
        const trainingArea = await trainingAreaOf(focus);
        const hasTrainingPlan = !!(primaryId ?? gRel.trainingPlan?.secondaryProgramId);

        // 맞대결 상대 = **실제로 나와 맞붙어 던진 투수**. 구 코드는 시나리오에
        // 하드코딩된 emotionRole="rival" ID에 의존해 고교에서만 동작했다.
        // 경기 라인에서 뽑으면 전 커리어에 걸쳐 실측으로 잡힌다.
        const facedRivals = myLine
          ? lines
              .filter(
                (l): l is import("../../types/season").PitcherGameLine =>
                  l.role === "pitcher" && l.playerId !== gRel.protagonist.id,
              )
              .sort((a, b) => b.ip - a.ip)
              .slice(0, 1) // 상대 선발 1명 — 불펜까지 라이벌로 잡으면 관계가 폭증한다
              .map((l) => l.playerId)
          : [];

        // ── 이야기 인물 등록부 (2026-09-21 · 죽은 칸 5) ──────────────
        //
        // 🔴 **여기가 유일한 채우는 자리다.** 데이터가 `compare` 에 적는 건
        //   이름표(`rival`·`mentee`)뿐이고, 그게 누구인지는 판이 굴러가며 정해진다.
        //   재료를 새로 세지 않는다 — 바로 위 `facedRivals`(관계도가 이미
        //   「라이벌」로 부르는 사람)와 기존 카운터 `menteeCount` 를 그대로 쓴다.
        // ⚠ 한 번 찬 칸은 안 덮는다(`nextStoryNpcs`). 안 바뀌면 `null` 이라
        //   store 를 안 건드린다 — 매주 같은 값을 다시 쓰면 세이브만 더러워진다.
        const nextRegistry = nextStoryNpcs(gRel.protagonist.storyNpcs, {
          facedRivalId: facedRivals[0] ?? null,
          menteeCount: gRel.protagonist.counters?.menteeCount,
          teammates: gRel.npcs
            .filter(
              (n) => n.currentTeam === gRel.protagonist.teamId && n.npcId !== gRel.protagonist.id,
            )
            .map((n) => ({ npcId: n.npcId, age: n.age })),
          myAge: gRel.protagonist.age,
        });
        if (nextRegistry) gameStore.setStoryNpcs(nextRegistry);

        const deltas = await applyWeeklyRelations({
          slotId,
          worldSeed: sRel.worldSeed,
          week: weekNum,
          season: sRel.seasonYear,
          ctx: {
            pitched: !!myLine,
            won: teamWon,
            era,
            completeShutout: !!myLine && myLine.ip >= 9 && myLine.er === 0,
            teamPlayed: myResult != null,
            teamWon,
            // ⚠ **0이 박혀 있었다.** 그래서 `growth_threshold: 2`를 영원히
            // 못 넘었고 감독 +1 · 코치 +2 성장 보너스가 죽어 있었다.
            // 실제 이번 주 OVR 변화를 넘긴다.
            ovrDelta: ovrDeltaThisWeek,
            trainingDone: hasTrainingPlan,
            trainingSkipped: !hasTrainingPlan,
            trainingArea,
            facedRivals,
          },
          relationMod: myMods.relation,
        });

        // 라벨이 바뀐 것만 알린다 — 값은 플레이어에게 보여주지 않는다
        const kindOf = new Map(
          deltas.flatMap((d) => (d.kind ? [[d.personId, d.kind] as const] : [])),
        );
        const msgs = buildRelationMessages(
          deltas,
          weekNum,
          get(masterStore).entities,
          new Map(kindOf),
          sRel.seasonYear,
        );
        if (msgs.length) gameStore.addMessages(msgs);
      } catch (e) {
        // 관계도가 못 돌아도 주간 진행 자체는 막지 않는다
        console.warn("[advanceWeek] 관계도 갱신 실패 — 이번 주는 건너뜀", e);
      }
    }
  }
}
