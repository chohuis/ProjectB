// ── 등번호 유일성 (시즌 중) ──────────────────────────────────────────────
//
// 🔴 **유입 경로가 여럿인데 등번호를 주는 곳은 하나뿐이었다.**
//
//   초기 생성 `roster_gen`(`GenNpc`)      `i + 1`  ✅
//   매년 충원 `generate_freshmen`         **필드 자체가 없었다**
//
// TS 타입엔 `jerseyNumber?: number` 가 있어 `?? 0` 으로 조용히 0 이 됐다.
// 오류도 로그도 안 난다 — 화면에만 0번으로 나온다.
//
// 실측(씨앗 111 · 2027): 238팀 전부 중복 · 7,338건 · 한 번호 최대 45명.
// 오프시즌 정리를 넣어 1,216건까지 줄었고, 남은 것이 **시즌 중 유입**이다:
//
//   TEAM_HS_AEWOL#0×10              신입생이 W1 에 들어온다
//   TEAM_KBL_DAEJEON_PHANTOMS_1#3×2  이적자가 앞사람 번호와 겹친다
//
// ⚠ **문제가 있는 팀만 보낸다.** 전량(7,000명)을 주마다 왕복시키면 이
// 프로젝트가 줄인 IPC(-30%)를 도로 까먹는다. 판정은 스토어에서 한다.
//
// ⚠ **바뀐 사람만 받아 얹는다.** 전량을 받아 덮으면 그 사이 다른 처리가
// 바꾼 값이 사라진다 — 이 프로젝트에서 반복된 형태다.

import { get } from "svelte/store";
import { gameStore } from "../../stores/game";

/**
 * 팀 안에 등번호가 0이거나 겹치는 곳을 찾아 Rust 가 다시 매기게 한다.
 *
 * 배정 규칙(`fix_jersey_numbers`)은 **이미 유일한 번호를 안 건드린다** —
 * 선수에게 등번호는 정체성이라 해마다 바뀌면 안 된다.
 */
export async function processJerseyNumbers(): Promise<string[]> {
  const g = get(gameStore);
  if (!g.npcs?.length) return [];

  // 팀 → 번호 목록. 0(없음)과 중복을 찾는다
  const byTeam = new Map<string, number[]>();
  for (const n of g.npcs) {
    // ⚠ **상무를 빠뜨리지 않는다.** `careerStatus` 는 5종이고 상무는
    //   `"military"` 다 — active·injured 만 보면 상무만 중복이 남는다
    //   (실측: 다른 팀 0건인데 상무만 13건).
    // ⚠ `free_agent` 는 **뺀다** — 팀 id 를 단 채 남아서 없는 팀을 만든다
    //   (`positionGaps` 주석에 같은 경고가 있다).
    if (n.careerStatus === "retired" || n.careerStatus === "free_agent") continue;
    if (!n.currentTeam) continue;
    const arr = byTeam.get(n.currentTeam) ?? [];
    arr.push((n as { jerseyNumber?: number }).jerseyNumber ?? 0);
    byTeam.set(n.currentTeam, arr);
  }

  const badTeams = new Set<string>();
  for (const [teamId, nums] of byTeam) {
    const seen = new Set<number>();
    for (const num of nums) {
      if (num <= 0 || seen.has(num)) {
        badTeams.add(teamId);
        break;
      }
      seen.add(num);
    }
  }
  if (badTeams.size === 0) return [];

  // 그 팀 선수를 **모두** 보낸다 — Rust 가 팀 단위로 빈 번호를 세므로
  // 일부만 보내면 이미 쓰는 번호를 다시 준다
  const payload = g.npcs.filter(
    (n) =>
      n.careerStatus !== "retired" &&
      n.careerStatus !== "free_agent" &&
      badTeams.has(n.currentTeam ?? ""),
  );

  let changes: Array<{ npcId: string; teamId: string; from: number; to: number }> = [];
  try {
    const raw = await window.projectB!.engine(
      // ⚠ **영구결번을 넘긴다.** 안 넘기면 결번한 번호를 새 선수가 받는다 —
      //   `serde(default)` 라 안 넘겨도 조용히 통과한다.
      "fixJerseyNumbersNative",
      JSON.stringify({
        npcs: payload,
        retiredNumbers: g.retiredNumbers ?? {},
      }),
    );
    changes = (JSON.parse(raw)?.changes ?? []) as typeof changes;
  } catch (e) {
    // ⚠ **조용히 삼키지 않는다.** 실패가 "아무 일도 안 일어남"으로 나타나면
    // 원인을 못 찾는다. Vite 단독 실행이면 엔진이 없어 여기로 오는 게 정상이다.
    const msg = String((e as { message?: string })?.message ?? e).slice(0, 140);
    return [`[등번호] 엔진 호출 실패 — ${msg}`];
  }
  if (changes.length === 0) return [];

  const numOf = new Map(changes.map((c) => [c.npcId, c.to]));
  gameStore.updateNpcs(
    g.npcs.map((n) => (numOf.has(n.npcId) ? { ...n, jerseyNumber: numOf.get(n.npcId)! } : n)),
  );

  // 한 줄로 묶는다 — 신입생이 들어온 주에는 1,000건이 넘는다
  return [`[등번호] ${changes.length}명에게 번호 배정 (${badTeams.size}팀)`];
}
