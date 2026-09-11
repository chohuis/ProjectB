// ── 주인공 은퇴 ──────────────────────────────────────────────────
//
// **은퇴 경로가 아예 없었다.** `retirement` 거래기록을 남기는 두 곳
// (`weekPhases/injuries`·`weekPhases/market`)은 전부 NPC고, 주인공을
// 은퇴시키는 코드는 어디에도 없었다. 목표 커리어가 15~20시즌인 게임인데
// **끝나지 않는다.**
//
// 설계 정본(`03.OnePitch/02_기획/05_히스토리_엔딩.md` §3)이 트리거 3개를
// 확정해뒀다:
//
// | 트리거 | 내용 |
// |---|---|
// | 자발적 | 플레이어가 원하는 시점에 언제든 — "이만하면 충분하다" |
// | 노쇠·방출 압박 | 실력이 떨어지고 구단이 다음 계약을 안 해주는 상황 |
// | 부상 강제 | 중상급 부상이 재기 불가 판정으로 이어지는 경우 |
//
// ⚠ **판정은 NPC와 같은 엔진을 쓴다** (`evalRetirementSuggestionNative`).
// 주인공 전용 기준을 새로 만들면 "NPC는 38세에 은퇴하는데 나는 45세까지
// 뛴다" 같은 어긋남이 생기고, 그걸 맞추려고 표를 두 번 관리하게 된다.
// 다른 건 **결과를 강제하지 않는다**는 것뿐이다 — 제안하고 선택은 플레이어가 한다.

import { get, writable } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { getTeamProfile, DEFAULT_TEAM_PROFILE } from "./weekPhases/market";
import { loadRosterRules } from "../repo/newGameV3";
import { calcMarketSalary } from "../utils/salaryEngine";
import type { ProtagonistSave, RetirementReason } from "../types/save";

// ── 수술급 부상 은퇴 확률 ────────────────────────────────────────
//
// ⚠ **표가 `weekPhases/injuries.ts` 안에 박혀 있었고 NPC만 썼다.**
// 주인공은 수술을 받아도 은퇴 판정이 아예 없어서 설계의 트리거 셋 중
// "부상 강제"가 데이터상 존재하지 않았다.
//
// 여기로 올린 이유는 소비자가 둘이 됐기 때문이다. 표를 양쪽에 적으면
// "NPC는 36세에 은퇴하는데 나는 45세까지 뛴다"가 되고, 그걸 맞추려고
// 표를 두 번 관리하게 된다 — 이 프로젝트가 이미 여러 번 겪은 형태다.
// **수치 정본은 `generation_rules.json`의 `retirementRules`다.**

export interface SurgeryRetireRules {
  ageHigh: number;
  chanceHigh: number;
  ageMid: number;
  chanceMid: number;
  priorSurgeryChance: number;
  baseChance: number;
}

export async function loadRetirementRules(): Promise<SurgeryRetireRules | null> {
  const r = (await loadRosterRules()).retirementRules as
    { surgery?: SurgeryRetireRules } | undefined;
  return r?.surgery ?? null;
}

/** 수술급 부상이 났을 때 은퇴할 확률 (0~1). NPC·주인공 공용 */
export function surgeryRetireChance(
  age: number,
  hasPriorSurgery: boolean,
  r: SurgeryRetireRules,
): number {
  if (age >= r.ageHigh) return r.chanceHigh;
  if (age >= r.ageMid) return r.chanceMid;
  // 젊어도 재수술이면 높다 — 나이 조건보다 뒤에 둔다
  if (hasPriorSurgery) return r.priorSurgeryChance;
  return r.baseChance;
}

/** 은퇴했는가 — 화면·주간 진행이 이걸 보고 멈춘다 */
export function isRetired(p: ProtagonistSave): boolean {
  return !!p.retirement;
}

/**
 * 지금 자발적으로 은퇴할 수 있는가.
 *
 * 학생 신분에서는 "은퇴"가 성립하지 않는다 — 그건 진로 포기이고
 * 진로 허브가 이미 다룬다. 프로·독립에서 뛰고 있어야 은퇴다.
 */
export function canRetireVoluntarily(p: ProtagonistSave): boolean {
  if (isRetired(p)) return false;
  return p.careerStage.startsWith("pro") || p.careerStage === "independent";
}

export interface RetirementSuggestion {
  suggest: boolean;
  /** 0~1. 화면 문구 강도에 쓴다 */
  urgency: number;
}

/**
 * 구단 관점에서 은퇴를 권할 상황인가 — **NPC와 같은 엔진**.
 *
 * 이 판정이 참이어도 자동으로 은퇴시키지 않는다. 설계의 "구단들이 다음
 * 시즌 계약을 안 해주는 상황"을 재계약 시점에 알려주는 용도다.
 */
export async function evalRetirementPressure(
  ovrTrend: number,
  marketValue: number,
  /** 판정 대상. 생략하면 현재 주인공 — 명시하면 "만약 42세라면"을 물어볼 수 있다 */
  target?: ProtagonistSave,
): Promise<RetirementSuggestion> {
  const g = get(gameStore);
  const p = target ?? g.protagonist;
  const m = get(masterStore);
  const profile = getTeamProfile(p.teamId, g, m) ?? DEFAULT_TEAM_PROFILE;
  const ovr = p.pitching?.ovr ?? p.batting?.ovr ?? 50;

  // 같은 포지션 유망주 — 내 자리를 위협하는 최고 OVR
  const prospectOvr = m.entities
    .filter((e) => e.role === "player" && e.teamId === p.teamId && e.id !== p.id)
    .reduce((mx, e) => {
      const ep = (e.details as import("../stores/master").EntityDetails)?.player;
      return Math.max(mx, ep?.pitching?.ovr ?? ep?.batting?.ovr ?? 0);
    }, 0);

  // ⚠ `player`는 엔진의 `RosterPlayerRef` **전체**여야 한다. 예전엔
  // `{ age, ovr, fame }` 셋만 보냈는데, 나머지 일곱 필드가 없으면 serde가
  // 역직렬화에 실패해 `{error}`만 돌아온다. 그걸 아래에서 조용히
  // `suggest: false`로 바꿔 돌려줬으므로 **은퇴 권고가 영영 안 나온다.**
  // NPC 쪽(`weekPhases/market`)은 같은 엔진에 `buildRosterRef`로 전체를 보낸다.
  const player = {
    id: p.id,
    position: p.primaryPosition ?? p.position ?? "SP",
    age: p.age,
    ovr,
    salary: p.contract?.salary ?? 0,
    remainingYears: p.contract?.remainingYears ?? 0,
    proServiceYears: p.proServiceYears ?? 0,
    isProspect: false,
    personality: null,
    fame: p.fame,
  };

  const raw = await window.projectB!.evalRetirementSuggestionNative(
    JSON.stringify({
      player,
      teamProfile: profile,
      ovrTrend,
      currentSalary: p.contract?.salary ?? 0,
      marketValue,
      prospectOvrAtPosition: prospectOvr,
    }),
  );
  const r = JSON.parse(raw) as RetirementSuggestion & { error?: string };
  // 조용히 삼키지 않는다 — 여기가 막히면 커리어가 끝나지 않는다
  if (r.error) throw new Error(`[은퇴판정] 엔진 오류: ${r.error}`);
  return { suggest: !!r.suggest, urgency: r.urgency ?? 0 };
}

/**
 * 최근 OVR 추세 — 시즌 기록에서 뽑는다.
 *
 * 은퇴 판정의 핵심 입력이다. NPC는 라이브 스탯 이력에서 뽑는데 주인공은
 * `careerRecords`가 시즌별 OVR을 들고 있으므로 그걸 쓴다.
 */
export function ovrTrendOf(p: ProtagonistSave): number {
  const recs = p.careerRecords ?? [];
  if (recs.length < 2) return 0;
  const last = recs[recs.length - 1];
  const prev = recs[recs.length - 2];
  return (last.ovr ?? 0) - (prev.ovr ?? 0);
}

/** 시장가 — 연봉 협상과 **같은 엔진**을 쓴다 (기준이 둘이면 어긋난다) */
export async function calcMarketValueForProtagonist(p: ProtagonistSave): Promise<number> {
  // ⚠ 페이로드를 여기서 두 번째로 적지 않는다. 그렇게 적었더니 `leagueId`가
  // 빠지고 대신 엔진이 안 보는 `age`·`proServiceYears`를 넣어, serde가
  // 역직렬화에 실패했다 — 그런데 옛 `catch { return 0 }`이 그걸 0으로 바꿔
  // 삼켰다. 은퇴 판정은 `salary / marketValue`로 과지급을 보므로 0이면
  // 그 비율이 항상 최대가 되어 **없는 압박을 만든다.**
  const ovr = p.pitching?.ovr ?? p.batting?.ovr ?? 50;
  return calcMarketSalary(ovr, p.fame, p.leagueId);
}

// ── 은퇴 직후 결산 자동 열기 ────────────────────────────────────
//
// 🔴 **은퇴 경로가 셋인데 결산이 자동으로 뜨는 건 하나뿐이었다.**
//    `RetirementAskModal`(노쇠·부상)만 `onRetired()` 로 알려서 `MainPage`가
//    결산을 열었고, `StatusPage`의 **자발적 은퇴는 아무한테도 안 알렸다** —
//    은퇴 카드가 「커리어 결산 보기」 버튼으로 바뀔 뿐이라 **사용자가 직접
//    눌러야** 15~20시즌의 결말을 봤다. 사용자 확정(2026-09-02): **연다.**
//
// 알리는 자리를 `retireProtagonist` 하나로 모은다. 화면마다 "은퇴시켰으니
// 결산도 열어라"를 적으면 **경로가 늘 때마다 한 자리씩 빠진다** — 방금
// 그렇게 빠져 있었다.
//
// ⚠ **세이브에 안 넣는다.** 「결산을 봤는가」를 세이브에 적으면 구 세이브에
//    그 필드가 없어서 슬롯을 열 때마다 결산이 뜬다. 이건 **은퇴하는 그
//    순간에만 참인 실행 중 플래그**고, 슬롯을 다시 열면 false로 시작한다.
//
// ⚠ **헤드리스는 안 바뀐다.** `runAutoAdvance`는 `retirementAsk`에서 멈추고
//    `retireProtagonist`를 부르지 않는다 — 이 플래그를 보는 것도 화면뿐이다.

/** 은퇴가 방금 확정됐다 — 화면이 결산을 띄울 신호. 세이브에 안 들어간다 */
export const careerEndPending = writable(false);

/**
 * 신호를 **한 번만** 꺼내 쓴다 (읽으면서 내린다).
 *
 * 화면이 `set(false)`를 따로 부르게 하면 그걸 빠뜨린 화면에서 결산이
 * 닫아도 닫아도 다시 뜬다. 꺼내는 행위와 내리는 행위를 갈라놓지 않는다.
 */
export function takeCareerEndPending(): boolean {
  let was = false;
  careerEndPending.update((cur) => {
    was = cur;
    return false;
  });
  return was;
}

/**
 * 은퇴를 확정한다.
 *
 * 주인공의 커리어가 여기서 끝난다 — 주간 진행이 멈추고 인생 기록이 남는다.
 * `careerStage`는 그대로 둔다. 마지막 소속이 어디였는지가 기록의 일부고,
 * 여기에 `"retired"`를 넣으면 단계별 분기 수십 곳이 전부 그걸 모른다.
 */
export async function retireProtagonist(reason: RetirementReason): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const p = g.protagonist;
  if (isRetired(p)) return;

  const label =
    reason === "voluntary"
      ? "자발적 은퇴"
      : reason === "decline"
        ? "노쇠·계약 불발"
        : "부상으로 인한 은퇴";

  gameStore.retire({ year: s.seasonYear, week: s.currentWeek, reason });
  gameStore.addCareerEvent({
    year: s.seasonYear,
    eventType: "retirement",
    fromTeamId: p.teamId || undefined,
    fromLeagueId: p.leagueId || undefined,
    detail: label,
  });

  const slotId = g.currentSlotId;
  if (slotId) {
    await window.projectB!.leagueAddTransactions(
      JSON.stringify({
        slotId,
        rows: [
          {
            seasonYear: s.seasonYear,
            week: s.currentWeek,
            category: "retirement",
            playerId: p.id,
            playerName: p.name,
            fromTeamId: p.teamId || null,
            fromLeagueId: p.leagueId || null,
            detail: label,
          },
        ],
      }),
    );
  }

  gameStore.addMessage({
    id: `msg-retire-${s.seasonYear}`,
    category: "system",
    sender: "구단",
    subject: "은퇴",
    preview: `${s.seasonYear}시즌을 끝으로 선수 생활을 마칩니다.`,
    body: [
      `${s.seasonYear}시즌을 끝으로 선수 생활을 마칩니다.`,
      "",
      `사유: ${label}`,
      `통산 ${(p.careerRecords ?? []).length}시즌`,
    ].join("\n"),
    createdAt: `Y${s.seasonYear}`,
    readAt: null,
  });

  await gameStore.save();
  await seasonStore.save();

  // ⚠ **저장이 끝난 뒤에 올린다.** 결산은 `careerRecords`를 읽으므로
  //   기록이 확정되기 전에 띄우면 마지막 시즌이 빠진 채로 나온다.
  careerEndPending.set(true);
}
