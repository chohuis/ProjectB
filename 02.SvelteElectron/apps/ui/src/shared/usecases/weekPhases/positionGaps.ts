// ── 포지션 공백 메우기 (시즌 중) ────────────────────────────────────────────
//
// 🔴 **공백을 메우는 경로가 오프시즌에만 있었다.** 그런데 공백은 시즌 중에 생긴다:
//
//   ① 1군 포수가 0명이 된다            부상·방출·은퇴
//   ② 콜업이 2군 마지막 포수를 올린다   (1군 0명이 2군 0명보다 나쁘다 — 의도된 것)
//   ③ 2군 포수가 0명이 된다
//   ④ 아무도 안 메운다                 `fix_position_gaps`가 오프시즌 전용이라
//
// ④를 여기서 닫는다. 실제 야구도 포수가 없으면 다른 야수가 마스크를 쓴다.
// 실측(`test:rosterbalance` 5시즌): KBL 2군·ABL 1군·JBL 1군에서 1~4팀이
// 포수 0명으로 시즌을 났다.
//
// ⚠ **공백이 있는 팀만 보낸다.** 전량(7,332명)을 주마다 왕복시키면 이 프로젝트가
// 줄인 IPC(-30%)를 도로 까먹는다. 판정은 스토어에서 하고 IPC는 공백이 있을 때만 탄다.
//
// ⚠ **바뀐 사람만 받아 얹는다.** 전량을 받아 덮으면 그 사이 다른 처리가 바꾼
// 값이 사라진다 — 이 프로젝트에서 반복된 형태다.

import { get } from "svelte/store";
import { gameStore } from "../../stores/game";

/** 지켜야 하는 수비 자리 — 포수가 맨 앞이다(전문 요원이라 0명이면 제일 나쁘다) */
const FIELD = ["C", "SS", "CF", "2B", "3B", "RF", "LF", "1B"] as const;

/**
 * 포지션이 빈 팀을 찾아 남는 자리에서 한 명을 돌린다.
 *
 * 자리 수(8)보다 야수가 적은 팀은 건너뛴다 — 돌려도 다른 자리가 빈다.
 * 그 판정은 Rust `fix_position_gaps`가 하므로 여기선 **후보 팀만 고른다.**
 */
export async function processPositionGaps(seasonYear: number): Promise<string[]> {
  const g = get(gameStore);
  if (!g.npcs?.length) return [];

  // 팀 → 야수들. 투수는 이 판정에 안 들어간다
  const byTeam = new Map<string, { id: string; pos: string }[]>();
  for (const n of g.npcs) {
    if (n.careerStatus !== "active" || !n.currentTeam) continue;
    if (n.playerType === "pitcher") continue;
    const arr = byTeam.get(n.currentTeam) ?? [];
    arr.push({ id: n.npcId, pos: n.position ?? "" });
    byTeam.set(n.currentTeam, arr);
  }

  const badTeams = new Set<string>();
  for (const [teamId, rows] of byTeam) {
    if (rows.length < FIELD.length) continue; // 돌려도 소용없다
    for (const pos of FIELD) {
      if (!rows.some((r) => r.pos === pos)) {
        badTeams.add(teamId);
        break;
      }
    }
  }
  // ⚠ **실측(237팀 전수)에서 시즌 중 공백은 0팀이었다.** 공백은 오프시즌
  // 처리 중에 생기고 거기서 메워진다(`run_offseason` 13단계). 이 단계는
  // **안전망**이다 — 시즌 중에 공백을 만드는 변경이 들어오면 여기가 잡는다.
  // 공백이 없으면 IPC를 아예 안 탄다.
  if (badTeams.size === 0) return [];

  // 공백 팀의 야수·투수를 모두 보낸다 — Rust가 팀 단위로 세므로 일부만 보내면 오판한다
  const payload = g.npcs.filter(
    (n) => n.careerStatus === "active" && badTeams.has(n.currentTeam ?? ""),
  );

  let changes: Array<{ npcId: string; teamId: string; from: string; to: string }> = [];
  try {
    const raw = await window.projectB!.engine(
      "fixPositionGapsNative",
      JSON.stringify({ npcs: payload, seasonYear }),
    );
    changes = (JSON.parse(raw)?.changes ?? []) as typeof changes;
  } catch (e) {
    // ⚠ **조용히 삼키지 않는다.** 이 프로젝트가 반복해서 당한 형태다 —
    // 실패가 "아무 일도 안 일어남"으로 나타나면 원인을 못 찾는다.
    // Vite 단독 실행이면 엔진이 없어 여기로 오는 게 정상이다.
    const msg = String((e as { message?: string })?.message ?? e).slice(0, 140);
    return [`[포지션] 엔진 호출 실패 — ${msg}`];
  }
  if (changes.length === 0) return [];

  const posOf = new Map(changes.map((c) => [c.npcId, c.to]));
  gameStore.updateNpcs(
    g.npcs.map((n) => (posOf.has(n.npcId) ? { ...n, position: posOf.get(n.npcId)! } : n)),
  );

  return changes.map(
    (c) => `[포지션] ${c.teamId.replace(/^TEAM_[A-Z]+_/, "")}: ${c.from} → ${c.to} 전환`,
  );
}
