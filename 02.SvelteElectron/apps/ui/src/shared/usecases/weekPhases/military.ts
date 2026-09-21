import { get } from "svelte/store";
import { gameStore } from "../../stores/game";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { masterStore } from "../../stores/master";
import { toGameDate } from "../../utils/scheduleGen";
import { seedOf } from "../../utils/seedOf";
import { isMeasureMode } from "../../utils/measureMode";
import { sportsUnitLimits, sportsVacatingFromNpcs } from "../../utils/militaryRules";
import { processScoutingImprovement } from "./market";
import { autoLog } from "../../stores/autoAdvance";
import { enlistProtagonist } from "../militaryDecision";
import { runMilitaryLifeWeek, militaryLifeCounters } from "../militaryLife";
import {
  SPORTS_UNIT_CANDIDATES_WEEK,
  MILITARY_RESULT_WEEK,
  MILITARY_AGE_WARNING_WEEK,
  weekInYearOf,
} from "../../utils/seasonWeeks";
import type { MessageItem } from "../../types/main";
import type { PendingAction, WeekAdvanceResult } from "../../types/season";

/**
 * **군 주간 갈래 둘** — `advanceWeek.ts` 에서 그대로 옮겨 왔다 (2026-09-21 · A-4).
 *
 * 🔴 **왜 이 둘만 옮겼나.** `advanceWeek.ts` 를 통째로 쪼개지 않는다(사용자 확정).
 *   이번 구간(09-12~20)에 실제로 손댄 자리만 꺼낸다 — 군 주간 블록이
 *   `9e930ea8f`(체육부대 계수기)와 `421b05271`(28세 경고 문안)로 두 번
 *   고쳐졌고, 그때마다 3,800줄 안에서 그 자리를 찾아야 했다.
 *
 * ⚠ **로직은 한 줄도 안 바꿨다.** 갈림길은
 *   `__tests__/militaryWeekBlocks.test.ts` 가 못박는데, 그 검사는 주간 진행
 *   경로 **전체**(`advanceWeek.ts` + `weekPhases/**`)를 한 덩이로 읽는다 —
 *   그래서 옮기기 전후에 검사 문장이 한 글자도 안 바뀐다.
 *
 * ⚠ 둘 다 `WeekAdvanceResult` 를 **그 자리에서 낸다**(주 1단위 반환). 그래서
 *   반환 타입이 `… | null` 이고, `null` 은 「내 갈래가 아니다 · 그냥 지나가라」다.
 *   부르는 쪽은 `if (r) return r;` 하나다.
 */

// ── 군입대 대상 판별 (nationality 기반) ──────────────────────
// nationality 없는 구버전 NPC는 originLeagueId로 폴백.
// ⚠ 옮겨 왔다 (2026-09-21 · A-4) — `advanceWeek.ts` 에 있었는데 쓰는 자리가
//   여기 둘뿐이라 같이 왔다. 로직은 그대로다.
function isKoreanMilitaryEligible(
  npc: import("../../types/save").NpcSaveState | import("../../stores/master").EntityRow,
  npcSave?: import("../../types/save").NpcSaveState,
): boolean {
  const nationality =
    npcSave?.nationality ??
    (npc as import("../../types/save").NpcSaveState).nationality ??
    ((npc as import("../../stores/master").EntityRow).originLeagueId === "LEAGUE_ABL"
      ? "USA"
      : (npc as import("../../stores/master").EntityRow).originLeagueId === "LEAGUE_JBL"
        ? "JPN"
        : "KOR");
  return nationality === "KOR";
}

/**
 * 복무 중인 주 — 이 갈래는 **주를 직접 한 칸 밀고** 결과를 낸다.
 *
 * @param onSeasonEnd `advanceWeek.ts` 의 `handleSeasonEnd`. **인자로 받는다** —
 *   여기서 직접 import 하면 `advanceWeek` 과 서로를 물어 순환이 된다.
 * @returns 복무 중이 아니면 `null`(그냥 지나가라)
 */
export async function runMilitaryServiceWeek(
  onSeasonEnd: () => Promise<WeekAdvanceResult>,
): Promise<WeekAdvanceResult | null> {
  const s = get(seasonStore);
  const g = get(gameStore);

  if (g.protagonist.careerStage === "military") {
    // 시즌 종료 시 전역 처리
    if (s.currentWeek + 1 > s.totalWeeks) {
      const result = await onSeasonEnd();
      gameStore.save();
      seasonStore.save();
      return result;
    }

    const nextWeek = s.currentWeek + 1;
    seasonStore.advanceWeek();
    seasonStore.setCurrentDate(toGameDate(s.seasonYear, nextWeek, 0));

    gameStore.advanceMilitaryWeek();
    const isSportsUnit = g.protagonist.militaryUnit === "sports";
    const m = get(masterStore);
    const serviceWeeks = g.protagonist.militaryServiceWeeks;

    // 계급 기반 이벤트 필터링
    //
    // 🔴 **`minRank` 하나로는 한 번 열린 이벤트가 전역까지 안 닫힌다**
    // (2026-09-01 · 트랙 B 실측). 셋을 같이 본다:
    //
    // ```
    //   minRank   그 계급 **이상**이면 후보                      (예전부터)
    //   maxRank   그 계급 **이하**여야 후보 — 훈련소 이벤트가
    //             병장 때 뜨는 걸 막는다
    //   once      커리어에 한 번만 — 「자대 배치 첫날」이 두 번 뜨던 것
    // ```
    //
    // ⚠ **`once` 는 커리어 통을 쓴다**(`careerTriggeredEvents`).
    // `seasonStore.triggeredEvents` 는 `makeEmptySeason` 이 매 시즌 비우는데
    // **군 복무는 100주(`SERVICE_WEEKS` · 52주 시즌 둘에 걸친다)** 라 그걸 쓰면 시즌 경계에서 되살아난다.
    //
    // ⚠ 뽑기는 Rust 가 한다 — 복원추출이고 쿨다운이 없다. 그래서 후보에
    // 남아 있는 한 계속 뽑힌다. **거르는 자리는 여기 하나뿐이다.**
    const rankIndex = serviceWeeks <= 8 ? 0 : serviceWeeks <= 34 ? 1 : serviceWeeks <= 60 ? 2 : 3;
    const fired = get(gameStore).protagonist.careerTriggeredEvents ?? {};
    const eligible = <T extends { id: string; minRank?: number; maxRank?: number; once?: boolean }>(
      list: T[],
    ) =>
      list.filter(
        (e) =>
          (e.minRank ?? 0) <= rankIndex &&
          rankIndex <= (e.maxRank ?? Number.POSITIVE_INFINITY) &&
          !(e.once && fired[e.id] !== undefined),
      );
    const eligibleSports = eligible(m.militarySportsEvents);
    const eligibleGeneral = eligible(m.militaryGeneralEvents);
    const eligibleCommon = eligible(m.militaryCommonEvents);

    // ── 현역 병영생활 (PLAN_MILITARY_LIFE 4부 · 2026-09-02) ───────────────
    // 상무와 `militaryLife` 가 없는 옛 세이브는 아래 옛 갈래 그대로 간다.
    // 이 갈래는 **능력치를 안 건드린다** — 전역 때 야구 감각으로 환산한다.
    if (!isSportsUnit && g.protagonist.militaryLife) {
      const life = await runMilitaryLifeWeek({ nextWeek, seasonYear: s.seasonYear });
      if (life) {
        gameStore.applyWeekResult(life.patch, life.logs, [], nextWeek, s.seasonYear);
        for (const lifeMsg of life.messages) gameStore.addMessage(lifeMsg);
        const lifeEntities = get(masterStore).entities;
        seasonStore.applyWeeklyConditionRecovery(lifeEntities);
        await seasonStore.simulateBackgroundLeaguesAsync(
          nextWeek,
          g.protagonist.leagueId,
          lifeEntities,
          g.protagonist.careerStage,
        );
        gameStore.save();
        seasonStore.save();
        const lifePending = get(seasonStore).pendingActions;
        return {
          processedWeek: nextWeek,
          logs: life.logs,
          newMessages: life.messages.map((x) => x.id),
          matchResults: [],
          stoppedBy: lifePending.length > 0 ? lifePending[0] : null,
        };
      }
    }

    // ⚠ **정수로 반올림해서 넘긴다.** Rust `MilitaryWeekPayload`는 이 값들이
    // 전부 `u32`/`i32`인데 주인공 스탯은 소수다(피로 62.125 · 스태미나 54.3).
    // serde가 소수를 정수로 못 받아 **호출 전체가 `{error}`로 떨어졌고**,
    // 아래에서 그걸 확인 없이 읽어 `undefined` → **피로가 NaN이 됐다.**
    //
    // 그래서 **군 복무 주간 계산이 통째로 안 돌고 있었다** — 계급별 스탯
    // 변화도, 사기·피로 변화도 전부. 전역해서 훈련 계산이 도는 순간
    // "성장 입력이 숫자가 아니다"로 터졌다(60회 조사에서 10회, 군 경로만).
    //
    // 소수부는 여기서만 버린다 — 결과를 그대로 덮어쓰는 게 아니라
    // 아래 `applyWeekResult`가 받는 값이라 누적 손실이 안 생긴다.
    const milCalcRaw = JSON.parse(
      await window.projectB!.weekCalcMilitary(
        JSON.stringify({
          isSportsUnit,
          serviceWeeks,
          stamina: Math.round(g.protagonist.pitching.stamina),
          recovery: Math.round(g.protagonist.pitching.recovery),
          command: Math.round(g.protagonist.pitching.command),
          control: Math.round(g.protagonist.pitching.control),
          velocity: Math.round(g.protagonist.pitching.velocity),
          morale: Math.round(g.protagonist.morale),
          fatigue: Math.round(g.protagonist.fatigue),
          sportsEventCount: eligibleSports.length,
          generalEventCount: eligibleGeneral.length,
          commonEventCount: eligibleCommon.length,
          // 씨앗 — 안 넘기면 Rust 가 `thread_rng` 라 복무 100주가 통째로
          // 재현 밖이다(이 파일의 다른 주간 계산은 전부 넘기고 있었다)
          seed: seedOf(
            get(seasonStore).worldSeed ?? 0,
            get(seasonStore).seasonYear,
            get(seasonStore).currentWeek,
            "military-week",
            serviceWeeks,
          ),
        }),
      ),
    );
    // ⚠ **오류를 삼키지 않는다.** 예전엔 `{error}`가 와도 그대로 필드를 읽어
    // undefined가 스탯에 들어갔다 — 조용히 NaN이 되는 자리다.
    if (!milCalcRaw || milCalcRaw.error || typeof milCalcRaw.fatigue !== "number") {
      throw new Error(
        `[군 복무] 주간 계산 실패: ${milCalcRaw?.error ?? JSON.stringify(milCalcRaw).slice(0, 200)}`,
      );
    }
    const milCalc = milCalcRaw as {
      stamina: number;
      recovery: number;
      command: number;
      control: number;
      velocity: number;
      morale: number;
      fatigue: number;
      eventPool: string | null;
      eventIndex: number | null;
      rank: string;
    };
    /**
     * 이번 주에 뜬 군 이벤트 제목 — 주간 로그에 남긴다.
     *
     * ⚠ **이건 기록의 대체가 아니다.** `logs` 는 `slice(0, 30)` 인 **굴림
     * 버퍼**라 104주 복무 중 **마지막 30주만** 남고, 전역 뒤엔 리그 로그가
     * 몇 주 만에 밀어낸다. 그래도 지금은 `군 복무(체육부대)` 고정 한 줄이라
     * **이벤트가 떴다는 것조차 안 남는다** — 그 사이를 메운다.
     *
     * ✅ 소식함에도 남긴다 (사용자 확정 2026-09-01) — 아래 `milMessages`.
     */
    let milEventTitle: string | null = null;
    /**
     * 군 이벤트 소식 (사용자 확정 2026-09-01).
     *
     * 🔴 예전엔 `newMessages: []` 가 박혀 있어서 **104주 동안 소식함에 한
     * 줄도 안 남았다.** 이벤트는 54종이 매주 40%로 떠서 약 42번 뜨는데
     * 전부 모달로만 갔다 — 나중에 2년을 되돌아볼 방법이 없었다.
     *
     * ⚠ **통수를 걱정할 자리가 아니다.** 2년에 42통이면 **연 21통**이고,
     * 사용자가 그대로 두기로 한 훈련 소식이 **연 52통**이다. A 가 처음에
     * "훈련 접기를 거부하셨으니 통수에 민감하다"고 읽었는데 **방향이
     * 반대였다** — 거부한 건 통수가 아니라 **개별 소식이 접히는 것**이다.
     */
    const milMessages: MessageItem[] = [];

    if (milCalc.eventPool !== null && milCalc.eventIndex !== null) {
      const pool =
        milCalc.eventPool === "sports"
          ? eligibleSports
          : milCalc.eventPool === "general"
            ? eligibleGeneral
            : eligibleCommon;
      const evt = pool[milCalc.eventIndex];
      if (evt) {
        // ── 계측 전용 계수기 — **체육부대가 통째로 안 세지고 있었다**
        //    (2026-09-19 · A). `militaryLifeCounters` 는 `runMilitaryLifeWeek`
        //    (일반병 병영생활) 안에서만 늘었는데, 체육부대는 그 갈래를 안 탄다
        //    (`militaryLife` 가 `unit === "general"` 일 때만 만들어진다 ·
        //    `militaryDecision.enlistProtagonist`). 그래서 24판 재계측에서
        //    성장형 일곱 판이 **군 계수기 0** 이었다 — 결함이 아니라 잣대가
        //    일반병만 세고 있었던 것이다(`SIM_102_UNIV_MIL_2026-09-19.md` ②).
        //
        // ⚠ **같은 칸(`뽑기`)에 넣는다.** 뜻이 같아서다 — 일반병 쪽 `뽑기` 도
        //   Rust 의 40% 게이트를 통과해 실제로 뜬 사건 수이고
        //   (`week_engine.rs` `calc_military_life_week`), 이쪽도 같은 40%
        //   게이트다(`calc_military_week`). 체육부대에는 캘린더(확률 밖 고정
        //   일정)라는 개념 자체가 없어 `캘린더` 는 일반병 전용으로 남는다.
        if (isMeasureMode()) militaryLifeCounters.뽑기++;
        // ⚠ **필드를 손으로 옮겨 적지 않는다.** 예전엔 네 개(morale·fatigue·
        // xp·statDelta)만 복사해서, 데이터에 성실도·명성을 넣어도 여기서
        // 조용히 잘렸다. 선택지에서 표시용 두 개만 떼고 나머지는 통째로
        // 넘긴다 — 효과 필드가 늘어도 이 줄을 다시 고칠 일이 없다.
        const choices = evt.choices?.map(({ id, label, effectHint, ...effects }) => ({
          id,
          label,
          effectHint,
          effects,
        })) ?? [
          {
            id: "ok",
            label: "확인",
            effects: { moraleDelta: evt.moraleDelta ?? 0, fatigueDelta: evt.fatigueDelta ?? 0 },
          },
        ];
        seasonStore.pushPendingAction({
          type: "event",
          eventId: evt.id,
          title: evt.title,
          description: evt.description,
          choices,
        });
        // 🔴 **뜬 자리에서 기록한다.** 선택 완료를 기다리면 그 사이 다음 주가
        //   오고, `once` 가 안 먹은 채로 같은 이벤트가 또 후보에 오른다.
        //   기록은 "떴다"의 뜻이고, 선택 결과는 효과가 따로 담는다.
        // ⚠ 커리어 통이라 시즌을 넘어 산다 — 군 복무 104주를 덮는다.
        if (evt.once) gameStore.recordCareerTriggeredEvents({ [evt.id]: nextWeek });
        milEventTitle = evt.title;
        // ⚠ **id 는 유일해야 한다.** 소식 목록이 id 를 키로 잡아서 중복이
        //   하나만 생겨도 Svelte 가 죽고 **세이브가 아예 안 열린다**
        //   (CLAUDE.md). `once` 가 아닌 종은 같은 해에 두 번 뜰 수 있으므로
        //   **연도 + 주차**를 둘 다 넣는다.
        const milMsg: MessageItem = {
          id: `msg-mil-${evt.id}-${s.seasonYear}-w${nextWeek}`,
          category: "system",
          sender: isSportsUnit ? "체육부대" : "군 복무",
          subject: evt.title,
          preview: evt.description.split("\n")[0] ?? "",
          body: evt.description,
          createdAt: `W${nextWeek}`,
          readAt: null,
        };
        milMessages.push(milMsg);
        // 🔴 **여기서 실제로 넣는다.** 아래 반환값의 `newMessages` 는
        //   **아무도 안 읽는다**(호출부 전수 확인 · 2026-09-01) — 거기만
        //   채우면 층은 맞는데 잇는 선이 없어 아무 일도 안 일어난다.
        //   군 분기는 `applyWeekResult` 를 쓰는데 그건 메시지 인자가 없다.
        gameStore.addMessage(milMsg);
      }
    }

    const pitching = {
      ...g.protagonist.pitching,
      stamina: milCalc.stamina,
      recovery: milCalc.recovery,
      command: milCalc.command,
      control: milCalc.control,
      velocity: milCalc.velocity,
    };
    gameStore.applyWeekResult(
      { morale: milCalc.morale, fatigue: milCalc.fatigue, pitching },
      [
        `군 복무(${isSportsUnit ? "체육부대" : "일반부대"}) — ${milCalc.rank}`,
        ...(milEventTitle ? [`[군] ${milEventTitle}`] : []),
      ],
      [],
      nextWeek,
      s.seasonYear,
    );
    const milEntities = get(masterStore).entities;
    seasonStore.applyWeeklyConditionRecovery(milEntities);
    await seasonStore.simulateBackgroundLeaguesAsync(
      nextWeek,
      g.protagonist.leagueId,
      milEntities,
      g.protagonist.careerStage,
    );
    gameStore.save();
    seasonStore.save();

    const pending = get(seasonStore).pendingActions;
    return {
      processedWeek: nextWeek,
      logs: [
        isSportsUnit ? "군 복무(체육부대)" : "군 복무(일반부대)",
        ...(milEventTitle ? [`[군] ${milEventTitle}`] : []),
      ],
      // ⚠ **이 필드는 아무도 안 읽는다** (호출부 전수 확인 · 2026-09-01).
      //   소식은 위에서 `gameStore.addMessage` 로 **이미 넣었다.**
      //   여기 채우는 것만으로는 아무 일도 안 일어난다 — 반환 타입에
      //   있으니 모양만 맞춰 둔다.
      //   🔴 트랙 B 가 "`newMessages: []` 가 박혀 있다"고 제보했는데
      //      **원인은 맞고 고칠 자리는 여기가 아니었다.**
      //   ⚠ 타입이 `string[]`(**메시지 id 목록**)이다 — `MessageItem[]` 이
      //     아니다. 소식 자체를 여기 넣을 수 있는 구조가 애초에 아니었다.
      newMessages: milMessages.map((msg) => msg.id),
      matchResults: [],
      stoppedBy: pending.length > 0 ? pending[0] : null,
    };
  }

  return null;
}

/**
 * 아직 병역이 안 끝난 사람에게 묻는 자리 넷 — 28세 경고 · 체육부대 후보 공개 ·
 * 체육부대 선발 결과 · 입영 만료. 넷 다 **주를 안 넘기고 pending 만 민다.**
 *
 * 🔴 그래서 넷 다 「한 해 한 번」 가드나 플래그 소진이 **반드시** 붙는다 —
 *   빠지면 그 주에서 게임이 영영 안 나간다(세 번 다 실측으로 겪었다).
 *
 * @returns 물을 게 없으면 `null`
 */
export async function runMilitaryTriggers(): Promise<WeekAdvanceResult | null> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const p = g.protagonist;
  const weekNum = s.currentWeek + 1;
  const weekInYear = weekInYearOf(weekNum);
  const isMilUnresolved =
    p.militaryStatus === "미필" && p.careerStage !== "military" && p.careerStage !== "highschool";
  const hasAnyMilPending = s.pendingActions.some(
    (a) => a.type === "sportsUnitApplication" || a.type === "militaryEnlistAsk",
  );

  if (isMilUnresolved && !hasAnyMilPending) {
    // 28세 입영 기간 만료 경고
    //
    // ⚠ 주차를 **글자로 적지 않는다.** 이 문안은 옛 52 주차를 말했는데
    // 정작 입영 pending 을 미는 블록(아래 `reason: "overdue"`)은
    // `MILITARY_RESULT_WEEK`(50)에서 돈다 — 주차 상수가 옛 52 에서 옮겨질 때
    // 문안만 남았다. 신청 모달에서 같은 형태를 09-20 에 고쳤고 여기가 마지막
    // 한 자리였다(BALANCE_BACKLOG 09-20 절). 상수에서 읽으면 다시 안 갈린다.
    if (p.age === 28 && weekInYear === MILITARY_AGE_WARNING_WEEK) {
      const enlistNotice = `이번 시즌 W${MILITARY_RESULT_WEEK} 주차에 입영 절차가 진행됩니다.`;
      gameStore.addMessage({
        id: `msg-military-warning-${s.seasonYear}`,
        category: "system",
        sender: "병무청",
        subject: "입영 기간 만료 통지",
        preview: enlistNotice,
        body: `병역 의무 이행 기간이 만료되었습니다.\n${enlistNotice}`,
        createdAt: `W${weekNum}`,
        readAt: null,
      });
    }

    // 체육부대 후보 30명 공개 (주인공 제외 NPC)
    //
    // ⚠ `sportsUnitPromptedYear` 가드가 **반드시 있어야 한다.** 이 블록은
    // 주를 안 넘기고 pending만 밀어넣은 채 반환한다 — 사용자가 신청/거절
    // 어느 쪽을 눌러도 주차가 그대로라 다음 진행에서 조건이 또 참이 된다.
    // 그러면 미필·비고교·27세 이하는 **매년 여기서 게임이 멈춘다** (실측 확인).
    if (
      weekInYear === SPORTS_UNIT_CANDIDATES_WEEK &&
      p.age <= 27 &&
      p.sportsUnitPromptedYear !== s.seasonYear
    ) {
      const m = get(masterStore);
      const npcCandidates = m.entities
        .filter((e) => {
          if (e.role !== "player") return false;
          const npcSave = g.npcs.find((n) => n.npcId === e.id);
          if (!isKoreanMilitaryEligible(e, npcSave)) return false;
          return (
            npcSave?.militaryStatus === "미필" && npcSave.careerStatus === "active" && e.id !== p.id
          );
        })
        .map((e) => {
          const live = get(npcLiveStatsStore)[e.id];
          const ep = (e.details as import("../../stores/master").EntityDetails)?.player;
          const ovr = live?.pitching?.ovr ?? ep?.pitching?.ovr ?? 50;
          return {
            id: e.id,
            name: e.name,
            ovr,
            teamId: e.teamId,
            position: ep?.position ?? "SP",
            isProtagonist: false,
          };
        });

      if (npcCandidates.length > 0) {
        const raw = JSON.parse(
          await window.projectB!.militaryCalcCandidates(
            JSON.stringify({ candidates: npcCandidates, topN: 30 }),
          ),
        ) as {
          topCandidates: { id: string; name: string; ovr: number; teamId: string }[];
          protagonistRank: number | null;
        };

        const teamById = new Map(m.teams.map((t) => [t.id, t.name]));
        const listLines = raw.topCandidates.map(
          (c, i) =>
            `${i + 1}위  ${c.name} (${teamById.get(c.teamId) ?? c.teamId})  OVR ${Math.round(c.ovr)}`,
        );
        const msgId = `msg-sports-candidates-${weekNum}-${s.seasonYear}`;
        gameStore.addMessage({
          id: msgId,
          category: "news",
          sender: "스포츠조선",
          subject: `${s.seasonYear} 체육부대 입대 후보 루머`,
          preview: `이번 시즌 체육부대 후보 30인이 거론되고 있습니다.`,
          body: [
            `${s.seasonYear}년 체육부대 입대 후보로 거론되는 30인 명단입니다.`,
            `실제 신청자는 다를 수 있습니다.`,
            ``,
            ...listLines,
          ].join("\n"),
          createdAt: `W${weekNum}`,
          readAt: null,
        });

        const action: PendingAction = { type: "sportsUnitApplication" };
        gameStore.markSportsUnitPrompted(s.seasonYear);
        seasonStore.pushPendingAction(action);
        return {
          processedWeek: s.currentWeek,
          logs: ["체육부대 후보 공개"],
          newMessages: [],
          matchResults: [],
          stoppedBy: action,
        };
      }
    }

    // 체육부대 신청자 결과 처리
    //
    // 🔴 **같은 결함의 셋째 자리다** (2026-09-10 · A 실측). 바로 위 두
    //   블록의 주석이 `sportsUnitPromptedYear`·`militaryAskedYear` 가드가
    //   없으면 「주를 안 넘기고 pending만 밀어넣어 영영 그 주에 머문다」고
    //   적어 뒀는데, **이 블록에는 아무 가드도 없었다.**
    //
    //   신청 → 탈락 → 모달의 「연기」 → 같은 주 → `sportsUnitApplied` 가
    //   그대로 참 → 다시 탈락 → … 로 게임이 그 주에서 안 나간다.
    //   실측: 2028W49 에서 `advanceWeek` 이 50회 연속 주를 안 넘겼다.
    //
    // ⚠ **아무도 못 밟고 있었다.** 화면에서 「신청」을 눌러야 참이 되는데
    //   계측 하네스는 그 pending 을 그냥 resolve 했다(= 미신청). 성향별
    //   군 갈래를 넣어 하네스가 처음 신청하자 그 자리에서 섰다.
    //
    // 고치는 자리는 가드가 아니라 **플래그다** — 결과를 처리하면 신청은
    // 소진된다(탈락하면 모달이 「내년에 다시 도전」이라고 말한다).
    // 가드만 걸면 `sportsUnitApplied` 가 영영 참으로 남아 **이듬해에는
    // 신청도 안 했는데 선발 판정이 돈다.**
    if (weekInYear === MILITARY_RESULT_WEEK && p.sportsUnitApplied) {
      gameStore.setSportsUnitApplied(false);
      const m = get(masterStore);
      const npcPool = m.entities
        .filter((e) => {
          if (e.role !== "player") return false;
          const npcSave = g.npcs.find((n) => n.npcId === e.id);
          if (!isKoreanMilitaryEligible(e, npcSave)) return false;
          return (
            npcSave?.militaryStatus === "미필" && npcSave.careerStatus === "active" && e.id !== p.id
          );
        })
        .map((e) => {
          const live = get(npcLiveStatsStore)[e.id];
          const ep = (e.details as import("../../stores/master").EntityDetails)?.player;
          const ovr = live?.pitching?.ovr ?? ep?.pitching?.ovr ?? 50;
          return {
            id: e.id,
            name: e.name,
            ovr,
            teamId: e.teamId,
            position: ep?.position ?? "SP",
            isProtagonist: false,
          };
        });

      // NPC 29명 + 주인공 1명 = 30명 풀
      const topNpcRaw = JSON.parse(
        await window.projectB!.militaryCalcCandidates(
          JSON.stringify({ candidates: npcPool, topN: 29 }),
        ),
      ) as {
        topCandidates: {
          id: string;
          name: string;
          ovr: number;
          teamId: string;
          position: string;
        }[];
      };

      const applicants = [
        {
          id: p.id,
          name: p.name,
          ovr: p.pitching.ovr,
          teamId: p.teamId,
          position: p.position ?? "SP",
          isProtagonist: true,
        },
        ...topNpcRaw.topCandidates.map((c) => ({ ...c, isProtagonist: false })),
      ];

      // ⚠ **규칙 파일이 정본이다.** 예전엔 `maxTotal: 10`·`maxPerTeam: 3`이
      // 여기 박혀 있었다. NPC 경로는 `rosterSize / 복무연수`(26/2 = 13)를
      // 쓰는데 주인공만 10이라, 같은 해에 주인공은 30명 중 10명(33%)·NPC는
      // 70명 중 13명(19%)을 놓고 겨뤘다.
      const milLimits = await sportsUnitLimits();
      const selResult = JSON.parse(
        await window.projectB!.militaryCalcSelection(
          JSON.stringify({
            applicants,
            maxTotal: Math.min(milLimits.annualIntake, applicants.length),
            maxPerTeam: milLimits.maxPerTeam,
            // 🔴 **여기가 안 넘어가고 있었다** (2026-08-28). `serde(default)`라
            //    조용히 빈 배열로 통과했고, **주인공만 Phase 1 없이 순수 OVR로**
            //    판정받았다. NPC 경로(`stores/game.ts`)는 넘기고 있었다.
            //
            // ⚠ 바로 위 주석의 `maxTotal: 10`과 **같은 형태**다 — 같은 함수의
            //   다음 인자에서 같은 일이 또 일어났다. 거르는 규칙을 인라인으로
            //   적지 않고 `militaryRules`의 함수를 쓴다.
            vacatingPositions: sportsVacatingFromNpcs(g.npcs, s.seasonYear),
            phase1Max: milLimits.phase1Max,
          }),
        ),
      ) as { protagonistSelected: boolean; selectedIds: string[] };

      if (selResult.protagonistSelected) {
        gameStore.addMessage({
          id: `msg-sports-selected-${s.seasonYear}-w${weekNum}`,
          category: "system",
          sender: "병무청",
          subject: "체육부대 선발 통보",
          preview: "체육부대에 선발되었습니다.",
          body: "이번 체육부대 선발에 합격하였습니다.\n체육부대로 입대합니다.",
          createdAt: `W${weekNum}`,
          readAt: null,
        });
        // 입대 처리는 `militaryDecision`이 정본이다 — 네 경로가 각자
        // 적고 있었고 그중 둘이 오프시즌 처리를 빠뜨렸다
        await enlistProtagonist("sports", weekNum, true);
        return {
          processedWeek: weekNum,
          logs: ["체육부대 입대"],
          newMessages: [],
          matchResults: [],
          stoppedBy: null,
        };
      }

      gameStore.markMilitaryAsked(s.seasonYear);
      const action: PendingAction = { type: "militaryEnlistAsk", reason: "rejected" };
      seasonStore.pushPendingAction(action);
      return {
        processedWeek: s.currentWeek,
        logs: ["체육부대 탈락"],
        newMessages: [],
        matchResults: [],
        stoppedBy: action,
      };
    }

    // 스카우트 능력치 향상 + NPC loyalty 연간 감쇠
    if (
      weekInYear === MILITARY_RESULT_WEEK &&
      ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage)
    ) {
      processScoutingImprovement().catch((e) => autoLog(`[스카우트향상오류] ${e}`));

      // season_end_normal loyalty 감쇠
      const namedActive = get(gameStore).npcs.filter(
        (n) => n.careerStatus === "active" && n.personality,
      );
      if (namedActive.length > 0) {
        const loyaltyUpdates = await Promise.all(
          namedActive.map(async (npc) => {
            const newLoyalty = JSON.parse(
              await window.projectB!.updatePlayerLoyaltyNative(
                JSON.stringify({
                  currentLoyalty: npc.personality!.loyalty,
                  eventType: "season_end_normal",
                  eventMagnitude: 1.0,
                  stabilityPreference: npc.personality!.stabilityPreference,
                }),
              ),
            ) as number;
            return { npcId: npc.npcId, loyalty: newLoyalty };
          }),
        );
        const loyaltyMap = new Map(loyaltyUpdates.map((u) => [u.npcId, u.loyalty]));
        gameStore.updateNpcs(
          get(gameStore).npcs.map((n) => {
            const newLoy = loyaltyMap.get(n.npcId);
            if (newLoy === undefined || !n.personality) return n;
            return { ...n, personality: { ...n.personality, loyalty: newLoy } };
          }),
        );
      }
    }

    // `MILITARY_RESULT_WEEK`: 입영 기간 만료 (28세 이상, 미신청). 옛 W52
    //
    // ⚠ `militaryAskedYear` 가드 필수 — W50 체육부대 공개와 **같은 결함**이다.
    // 주를 안 넘기고 pending만 밀어넣는데 모달의 "연기"는 상태를 안 바꾸므로
    // 다음 진행에서 조건이 또 참이 된다. 실측: 2038 W51에서 자동 진행이
    // 1000회 반복 상한에 걸려 멈췄고, 수동 진행이면 영영 W51이다.
    if (
      weekInYear === MILITARY_RESULT_WEEK &&
      p.age >= 28 &&
      p.militaryAskedYear !== s.seasonYear
    ) {
      gameStore.markMilitaryAsked(s.seasonYear);
      const action: PendingAction = { type: "militaryEnlistAsk", reason: "overdue" };
      seasonStore.pushPendingAction(action);
      return {
        processedWeek: s.currentWeek,
        logs: ["입영 기간 만료"],
        newMessages: [],
        matchResults: [],
        stoppedBy: action,
      };
    }

    // 26~27세 패널티 누적 (W1 시점 체크)
    if (weekInYear === 1 && p.age >= 26) {
      const penalty = p.age === 26 ? 3 : 5;
      gameStore.addMilitaryDeferPenalty(penalty);
    }
  }

  return null;
}
