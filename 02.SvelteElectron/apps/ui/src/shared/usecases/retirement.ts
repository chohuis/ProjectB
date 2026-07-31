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

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { getTeamProfile, DEFAULT_TEAM_PROFILE } from "./weekPhases/market";
import type { ProtagonistSave, RetirementReason } from "../types/save";

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
): Promise<RetirementSuggestion> {
  const g = get(gameStore);
  const p = g.protagonist;
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

  try {
    const raw = await window.projectB!.evalRetirementSuggestionNative(JSON.stringify({
      player: { age: p.age, ovr, fame: p.fame },
      teamProfile: profile,
      ovrTrend,
      currentSalary: p.contract?.salary ?? 0,
      marketValue,
      prospectOvrAtPosition: prospectOvr,
    }));
    const r = JSON.parse(raw) as RetirementSuggestion & { error?: string };
    if (r.error) return { suggest: false, urgency: 0 };
    return { suggest: !!r.suggest, urgency: r.urgency ?? 0 };
  } catch {
    return { suggest: false, urgency: 0 };
  }
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
  try {
    const raw = await window.projectB!.salaryCalcMarketSalary(JSON.stringify({
      ovr: p.pitching?.ovr ?? p.batting?.ovr ?? 50,
      age: p.age,
      proServiceYears: p.proServiceYears ?? 0,
      fame: p.fame,
    }));
    const v = JSON.parse(raw) as number | { error?: string };
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
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

  const label = reason === "voluntary" ? "자발적 은퇴"
    : reason === "decline" ? "노쇠·계약 불발"
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
    await window.projectB!.leagueAddTransactions(JSON.stringify({
      slotId,
      rows: [{
        seasonYear: s.seasonYear, week: s.currentWeek, category: "retirement",
        playerId: p.id, playerName: p.name,
        fromTeamId: p.teamId || null, fromLeagueId: p.leagueId || null,
        detail: label,
      }],
    }));
  }

  gameStore.addMessage({
    id: `msg-retire-${s.seasonYear}`,
    category: "system", sender: "구단",
    subject: "은퇴",
    preview: `${s.seasonYear}시즌을 끝으로 선수 생활을 마칩니다.`,
    body: [
      `${s.seasonYear}시즌을 끝으로 선수 생활을 마칩니다.`,
      "",
      `사유: ${label}`,
      `통산 ${(p.careerRecords ?? []).length}시즌`,
    ].join("\n"),
    createdAt: `Y${s.seasonYear}`, readAt: null,
  });

  await gameStore.save();
  await seasonStore.save();
}
