import { writable } from "svelte/store";
import type { NpcLiveStat } from "../types/season";

export const npcLiveStatsStore = writable<Record<string, NpcLiveStat>>({});

/**
 * NPC의 **지금** OVR — `npcs[].pitching`은 생성 시점 값이라 자라지 않는다.
 *
 * ⚠ **성장 결과는 여기(`npcLiveStatsStore`)에만 쌓인다.** `NpcSaveState`의
 * `pitching`/`batting`은 로스터 생성 때 찍힌 값 그대로 3년이고 10년이고 안
 * 움직인다. 실측(2026-08-09): 같은 투수를 3시즌 추적했을 때 live는 19→22세
 * **OVR +9 · 31→34세 −4**로 나이 곡선이 제대로 도는데, `npcs[]`는 9종 전부
 * **정확히 +0**이었다.
 *
 * 그 상태로 **드래프트 전체가 생성값으로 돌았다** — 고교 3학년을 평가하면서
 * 사실상 1학년 때 능력치를 봤고, 주인공 백분위도 NPC 지명 순서도 그 위에 있었다.
 *
 * `??`가 아니라 `Math.max`인 이유: NPC는 투수·타자 블록을 **둘 다** 갖는다.
 * `??`로 읽으면 타자의 낮은 `pitching.ovr`이 먼저 잡혀 실력보다 훨씬 낮게 나온다
 * (지명 1순위가 OVR 53으로 미지명 최하위 74보다 낮게 찍힌 적이 있다).
 *
 * @param live `get(npcLiveStatsStore)` 결과를 **루프 밖에서 한 번** 받아 넘긴다
 */
export function liveOvrOf(
  n: { npcId: string; pitching?: { ovr?: number }; batting?: { ovr?: number } },
  live: Record<string, NpcLiveStat>,
): number {
  const l = live[n.npcId];
  return Math.max(
    l?.pitching?.ovr ?? n.pitching?.ovr ?? 0,
    l?.batting?.ovr  ?? n.batting?.ovr  ?? 0,
  );
}

/** 투수 OVR만 — 또래 비교처럼 포지션이 이미 걸러진 자리에서 쓴다 */
export function livePitchingOvrOf(
  n: { npcId: string; pitching?: { ovr?: number } },
  live: Record<string, NpcLiveStat>,
): number {
  return live[n.npcId]?.pitching?.ovr ?? n.pitching?.ovr ?? 0;
}
