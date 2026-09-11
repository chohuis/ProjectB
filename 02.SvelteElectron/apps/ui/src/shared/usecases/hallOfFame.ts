// ── 명예의 전당 · 영구결번 (2단계) ──────────────────────────────────────
//
// 사용자 확정(2026-08-29): **수상 이력 중심 · 헌액자+재적 5년 · 은퇴 즉시 심사**
//
// 🔴 **새 평가 축을 만들지 않는다.** 점수는 `careerHistory[].highlights` 를
//   세는 것이고, 그 문자열은 `applySeasonAwards` 가 넣는다. 상 이름은
//   `awardRules` 의 `label` 에서 오므로 **여기에 이름을 적지 않는다** —
//   두 벌이 되면 label 을 바꿨을 때 조용히 0점이 된다.
//
// ⚠ **재적 연수도 같은 자리에서 센다.** `careerHistory[].teamId` 가 그 해
//   소속이다. 따로 세면 이적·군복무에서 갈린다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { loadRosterRules } from "../repo/newGameV3";

export interface HofRules {
  points: { mvp: number; golden: number; title: number; rookie: number; allstar: number };
  threshold: number;
  inductDelayYears: number;
  /** 헌액 대상 리그 — **프로만이다** */
  leagues?: string[];
  retiredNumber: { minSeasonsWithTeam: number };
}

/** 상 이름 — **규칙 파일에서 읽는다.** 여기 문자열을 적지 않는다 */
interface AwardLabels {
  mvp: string;
  rookie: string;
  golden: string; // 접두사 ("골든글러브 (포수) (.312)")
  titles: string[]; // 부문 label 들 ("다승왕" 등)
  allstar: string;
}

/**
 * 규칙 파일에서 상 이름을 모은다.
 *
 * ⚠ 부문상은 `title: `${label} (${값})`` 형태라 **접두사로 본다.**
 *   MVP·신인왕은 label 그대로다.
 */
export function awardLabelsFrom(rulesFile: unknown): AwardLabels {
  const a = (rulesFile as { awardRules?: Record<string, unknown> })?.awardRules ?? {};
  const pick = (o: unknown): string => String((o as { label?: string })?.label ?? "");
  const listOf = (o: unknown): string[] =>
    Object.entries((o ?? {}) as Record<string, unknown>)
      .filter(([k]) => !k.startsWith("_"))
      .map(([, v]) => pick(v))
      .filter(Boolean);
  return {
    mvp: pick(a.mvp),
    rookie: pick(a.rookie),
    // 골든글러브 label 은 포지션마다 다르다("골든글러브 (포수)") — 공통 접두사를 쓴다
    golden: "골든글러브",
    titles: [...listOf(a.pitcher), ...listOf(a.batter)],
    allstar: "올스타",
  };
}

/**
 * 수상 이력 한 줄이 몇 점인가.
 *
 * ⚠ **먼저 걸린 것으로 끝낸다.** 지금은 label 끼리 접두사로 겹치지 않아
 *   순서가 결과를 안 바꾼다(검사가 그 전제를 지킨다). 겹치는 label 이
 *   생기면 그때부터 순서가 점수를 가르므로, 검사가 먼저 실패한다.
 */
export function scoreOfHighlight(h: string, r: HofRules, L: AwardLabels): number {
  if (!h) return 0;
  if (L.mvp && h === L.mvp) return r.points.mvp;
  if (L.rookie && h === L.rookie) return r.points.rookie;
  if (h.startsWith(L.golden)) return r.points.golden;
  if (h.startsWith(L.allstar)) return r.points.allstar;
  for (const t of L.titles) {
    if (t && h.startsWith(t)) return r.points.title;
  }
  return 0;
}

export interface HofResult {
  playerId: string;
  name: string;
  score: number;
  /** 결번할 구단 — 재적 문턱을 넘은 팀들 */
  retiredNumberTeams: string[];
  jerseyNumber: number;
}

/**
 * 한 선수의 헌액 점수와 결번 대상 구단.
 *
 * **순수 함수다** — 검사가 직접 부른다.
 */
export function evaluateHof(
  player: {
    npcId: string;
    name: string;
    jerseyNumber?: number;
    careerHistory?: { teamId?: string; highlights?: string[] }[];
  },
  r: HofRules,
  L: AwardLabels,
): HofResult | null {
  const hist = player.careerHistory ?? [];
  let score = 0;
  const seasonsByTeam = new Map<string, number>();
  for (const e of hist) {
    for (const h of e.highlights ?? []) score += scoreOfHighlight(h, r, L);
    const tid = e.teamId ?? "";
    if (tid) seasonsByTeam.set(tid, (seasonsByTeam.get(tid) ?? 0) + 1);
  }
  if (score < r.threshold) return null;

  const minS = r.retiredNumber.minSeasonsWithTeam;
  const teams = [...seasonsByTeam.entries()]
    .filter(([, n]) => n >= minS)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tid]) => tid);

  return {
    playerId: player.npcId,
    name: player.name,
    score,
    retiredNumberTeams: teams,
    jerseyNumber: player.jerseyNumber ?? 0,
  };
}

/**
 * 그 시즌 은퇴자를 심사한다. 시즌 종료에 한 번 부른다.
 *
 * ⚠ **이미 헌액된 사람을 다시 안 넣는다** — 은퇴 상태는 계속 남으므로
 *   매년 같은 사람을 세면 결번이 무한히 쌓인다.
 */
export async function inductHallOfFame(seasonYear: number): Promise<string[]> {
  const rulesFile = (await loadRosterRules()) as unknown as { hallOfFameRules?: HofRules };
  const r = rulesFile.hallOfFameRules;
  if (!r) return [];
  const L = awardLabelsFrom(rulesFile);

  const g = get(gameStore);
  const already = new Set(Object.keys(g.hallOfFame ?? {}));
  const logs: string[] = [];
  const inducted: Record<string, { year: number; score: number; teams: string[]; num: number }> =
    {};
  const retired: Record<string, number[]> = {};

  for (const n of g.npcs ?? []) {
    if (n.careerStatus !== "retired") continue;
    if (already.has(n.npcId)) continue;
    // 🔴 **프로 경력이 있어야 한다.** 대학·고교에도 수상이 있어 점수가
    //   쌓이는데, 프로를 못 가고 은퇴한 선수가 드는 것은 어색하다
    //   (실측: 헌액자 6명 중 대학 선수 1명).
    //   ⚠ **현재 소속이 아니라 경력을 본다** — 은퇴하면 소속이 비거나
    //     마지막 팀이 남고, 프로에서 뛰다 아마추어로 내려간 경우도 있다.
    const pro = r.leagues ?? [];
    if (pro.length > 0) {
      const everPro = (n.careerHistory ?? []).some((e) =>
        pro.includes(String((e as { leagueId?: string }).leagueId ?? "")),
      );
      if (!everPro) continue;
    }
    // 은퇴 연도 — `inductDelayYears` 가 0이면 그 해 바로 본다
    const last = (n.careerHistory ?? []).at(-1)?.year ?? seasonYear;
    if (seasonYear - last < r.inductDelayYears) continue;

    const res = evaluateHof(n as Parameters<typeof evaluateHof>[0], r, L);
    if (!res) continue;

    inducted[res.playerId] = {
      year: seasonYear,
      score: res.score,
      teams: res.retiredNumberTeams,
      num: res.jerseyNumber,
    };
    for (const tid of res.retiredNumberTeams) {
      if (res.jerseyNumber <= 0) continue;
      (retired[tid] ??= []).push(res.jerseyNumber);
    }
    logs.push(
      `[명예의 전당] ${res.name} 헌액 (${res.score}점)` +
        (res.retiredNumberTeams.length
          ? ` · ${res.jerseyNumber}번 영구결번 ${res.retiredNumberTeams.length}구단`
          : ""),
    );
  }

  if (Object.keys(inducted).length > 0) gameStore.addHallOfFame(inducted, retired);
  return logs;
}
