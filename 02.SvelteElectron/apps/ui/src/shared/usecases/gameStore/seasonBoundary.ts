// ── 시즌 경계 (스토어 덩이 6) ─────────────────────────────────
//
// 이 아홉 함수는 `stores/game.ts` 의 store 메서드였다(211줄). 시즌이 넘어갈 때
// **학년 진급 · 나이 +1 · 노화 · 연감 · 커리어 기록 · 수상 · 하이라이트**가
// 순서대로 도는데, 그게 store 안에 흩어져 있어 「한 해에 한 번」 가드가 어디에
// 걸려 있는지 보이지 않았다(연도 가드를 두 번 밟은 자리다).
//
// **옮긴 본문은 한 글자도 안 바뀌었다** — `this.` 호출이 아홉 함수 모두
// **0자리**다. 바뀐 것은 머리·꼬리 두 줄뿐:
//   `name(…) {` → `export function name({ update }: SeasonBoundaryCtx, …) {`
//   닫는 `},` → `}`
// `get({ subscribe })` 를 쓰는 둘만 `{ subscribe, update }` 로 받는다 — 첫
// 인자를 **풀어서 받으면** 본문이 손댈 필요 없이 그대로 돈다.
//
// ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.

import { get } from "svelte/store";
import type { GameStoreState } from "../../stores/game";
import { autoLog } from "../../stores/autoAdvance";
import {
  advanceAllGrades,
  advanceAllAges,
  advanceProtagonistGrade,
} from "../../utils/gradeAdvance";
// 시즌 통계 줄을 만드는 사람·프로 시즌 세는 잡대기 — 정본은 game.ts 하나다
import { buildNpcStatLine, countsAsProSeason } from "../../stores/game";
import type {
  CareerAward,
  CareerSeasonRecord,
  NpcCareerEntry,
  PlayerSeasonStats,
  ProtagonistSave,
} from "../../types/save";
// 단계가 바뀌면 호환 객체 둘을 다시 만든다 — 정본은 game.ts 하나다
import { toPlayerCompat, toSchoolCompat } from "../../stores/game";

/**
 * 스토어가 건네는 손잡이.
 *
 * ⚠ `subscribe` 를 그대로 받는 이유는 **본문을 안 고치려고**다 — 옮긴 코드가
 *   `get({ subscribe })` 를 그대로 쓴다.
 * ⚠ 이 덩이는 store 메서드를 **하나도 안 부른다**(옮기기 전 `this.` 0자리).
 */
export interface SeasonBoundaryCtx {
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
}

/** 지금 상태를 **읽어야** 하는 둘(`applyAgingDecay`·`processSeasonEnd`)만 이걸 받는다 */
export interface SeasonBoundaryReadCtx extends SeasonBoundaryCtx {
  subscribe: (run: (value: GameStoreState) => void) => () => void;
}

export function saveTop10Snapshot(
  { update }: SeasonBoundaryCtx,
  snapshot: import("../../types/save").Top10Snapshot,
) {
  update((s) => ({
    ...s,
    lastTop10Pitcher: snapshot.type === "pitcher" ? snapshot : s.lastTop10Pitcher,
    lastTop10Batter: snapshot.type === "batter" ? snapshot : s.lastTop10Batter,
  }));
}

export function saveSeasonStartSnapshot({ update }: SeasonBoundaryCtx) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      seasonStartPitching: { ...s.protagonist.pitching },
      seasonStartBatting: { ...s.protagonist.batting },
    },
  }));
}

export function advanceSeasonYear(
  { update }: SeasonBoundaryCtx,
  _seasonYear?: number,
  playedLeagueId?: string,
) {
  update((s) => {
    const p = s.protagonist;
    const isPro = countsAsProSeason(p.careerStage, playedLeagueId);
    const protagonist: ProtagonistSave = {
      ...p,
      age: p.age + 1,
      proServiceYears: isPro ? p.proServiceYears + 1 : p.proServiceYears,
      condition: Math.min(100, p.condition + 20),
      fatigue: Math.max(0, p.fatigue - 30),
      seasonHealth: { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 },
      sportsUnitApplied: false,
      // ── 같은 팀에서 보낸 해 (2026-09-08 · §12 `count`) ──────
      //
      // 🔴 **팀이 바뀌면 1 로 되돌린다** — 「3년 내내 같은 팀」이 물으려는
      //   것은 누적 연차가 아니라 **끊기지 않은 기간**이다. 트레이드·이적·
      //   진학이 그걸 끊는다.
      // ⚠ 첫 시즌은 `lastSeasonTeamId` 가 없어 1 이다(그게 맞다 — 한 해를
      //   보냈으니 1년이다). 구 세이브도 여기서 1부터 다시 센다.
      counters: {
        ...(p.counters ?? {}),
        sameTeamYears: p.lastSeasonTeamId === p.teamId ? (p.counters?.sameTeamYears ?? 0) + 1 : 1,
      },
      lastSeasonTeamId: p.teamId,
    };

    return {
      ...s,
      protagonist,
      player: toPlayerCompat(protagonist),
      school: toSchoolCompat(protagonist.careerStage, s.schoolState),
    };
  });
}

export async function applyAgingDecay({ subscribe, update }: SeasonBoundaryReadCtx) {
  const s = get({ subscribe });
  const p = s.protagonist;
  const sh = p.seasonHealth ?? {
    lowConditionWeeks: 0,
    highFatigueWeeks: 0,
    injuryCount: 0,
    totalWeeks: 0,
  };
  const raw = JSON.parse(
    await window.projectB!.growthCalcProtagonistAging(
      JSON.stringify({
        age: p.age,
        lowConditionWeeks: sh.lowConditionWeeks,
        highFatigueWeeks: sh.highFatigueWeeks,
        injuryCount: sh.injuryCount,
        totalWeeks: sh.totalWeeks,
        pitching: p.pitching,
        batting: p.batting,
        playerType: p.playerType,
      }),
    ),
  );
  if (raw.error) {
    autoLog(`[에이징오류] applyAgingDecay 실패: ${raw.error}`);
    return;
  }
  update((st) => {
    const updated: ProtagonistSave = {
      ...st.protagonist,
      pitching: raw.pitching,
      batting: raw.batting,
    };
    return {
      ...st,
      protagonist: updated,
      player: toPlayerCompat(updated),
      logs: [...raw.logs, ...st.logs].slice(0, 30),
    };
  });
}

export async function processSeasonEnd(
  { subscribe, update }: SeasonBoundaryReadCtx,
  seasonYear: number,
) {
  const s = get({ subscribe });

  // ⚠ **한 해에 한 번만.** 세계 오프시즌(`runWorldSeasonEnd`)이 이걸 먼저
  // 돌려야 졸업생이 드래프트 풀에 들어가는데, 정상 롤오버도 따로 부른다.
  // 가드가 없으면 학년이 두 번 오르고 나이가 두 살 늘어난다.
  if (s.lastSeasonEndYear === seasonYear) {
    autoLog(`[시즌종료] Y${seasonYear}는 이미 진행됨 — 건너뛴다`);
    return;
  }

  // ① HS + 대학 전체 NPC 학년 진급 (나이 증가 없음)
  const { updated, hsGraduated, univGraduated } = await advanceAllGrades(s.npcs, seasonYear);
  autoLog(
    `[시즌종료] NPC 진급: 재학 ${updated.length}명, HS졸업 ${hsGraduated.length}명, 대학졸업 ${univGraduated.length}명`,
  );

  // ② 전체 NPC 나이 +1 (단일 호출 — 졸업생 포함)
  const allNpcs = [...updated, ...hsGraduated, ...univGraduated];
  const agedNpcs = await advanceAllAges(allNpcs);
  const hsGradIds = new Set(hsGraduated.map((n) => n.npcId));
  const univGradIds = new Set(univGraduated.map((n) => n.npcId));
  const agedUpdated = agedNpcs.filter((n) => !hsGradIds.has(n.npcId) && !univGradIds.has(n.npcId));
  const agedHsGraduated = agedNpcs.filter((n) => hsGradIds.has(n.npcId));
  const agedUnivGraduated = agedNpcs.filter((n) => univGradIds.has(n.npcId));

  // ③ 주인공 학년 진급 (나이는 advanceSeasonYear에서)
  //
  // ⚠ **대학은 여기서 +1 하면 안 된다.** 대학 학년의 실제 계수기는
  // `schoolState.universityWeek`이고 매주 오른다. 진학은 시즌 도중(W47)에
  // 확정되므로, 그때 넣은 `grade: 1`을 시즌 종료에서 또 +1 하면
  // **첫 대학 시즌을 2학년으로 뛴다** (실측 — 1학년이 통째로 사라진다).
  // 고교는 계수기가 따로 없어 +1이 맞다.
  //
  // 🔴 **대학은 여기서 아무것도 안 적는다** (2026-09-27 · `BALANCE_BACKLOG`
  //   「`protagonist.grade` 가 대학에서 한 해 뒤처진다」 · 제안 ㉯).
  //   예전엔 이 자리에서 `grade = universityGradeOf(undefined, uw)` 를 적었다.
  //   이 블록은 시즌 **끝**에 도는데 그때 `uw` 는 정확히 52 라(`universityAxis`
  //   「1년째 W52 에 uw 52 · 아직 1학년」) **직전 시즌 학년**이 남았다.
  //   지금은 계수기가 움직이는 자리(`incrementUniversityWeek`)에서 같이
  //   비춘다 — 거울을 두 곳에서 닦으면 한쪽만 닦인 채 남는다.
  const proto = s.protagonist;
  let updatedProto: ProtagonistSave = proto;
  if (proto.grade != null && proto.careerStage === "highschool") {
    updatedProto = { ...proto, ...advanceProtagonistGrade(proto.grade, proto.careerStage).patch };
  }

  update((st) => ({
    ...st,
    npcs: agedUpdated,
    protagonist: updatedProto,
    pendingDraft: [...st.pendingDraft, ...agedHsGraduated, ...agedUnivGraduated],
    lastSeasonEndYear: seasonYear,
  }));
}

export function addProtagonistAwards(
  { update }: SeasonBoundaryCtx,
  seasonYear: number,
  awards: CareerAward[],
) {
  if (awards.length === 0) return;
  update((s) => {
    const recs = s.protagonist.careerRecords ?? [];
    const i = recs.findIndex((r) => r.year === seasonYear);
    if (i < 0) return s;
    const next = [...recs];
    next[i] = { ...next[i], awards: [...(next[i].awards ?? []), ...awards] };
    return { ...s, protagonist: { ...s.protagonist, careerRecords: next } };
  });
}

export function addSeasonHighlights(
  { update }: SeasonBoundaryCtx,
  seasonYear: number,
  byPlayer: Map<string, string[]>,
) {
  update((s) => ({
    ...s,
    npcs: s.npcs.map((n) => {
      const titles = byPlayer.get(n.npcId);
      if (!titles?.length) return n;
      const hist = n.careerHistory ?? [];
      const i = hist.findIndex((h) => h.year === seasonYear);
      if (i < 0) {
        return {
          ...n,
          careerHistory: [
            ...hist,
            {
              year: seasonYear,
              leagueId: n.currentLeague,
              teamId: n.currentTeam,
              statLine: "-",
              highlights: [...titles],
            },
          ],
        };
      }
      const next = [...hist];
      next[i] = { ...next[i], highlights: [...(next[i].highlights ?? []), ...titles] };
      return { ...n, careerHistory: next };
    }),
  }));
}

export function applySeasonHistory(
  { update }: SeasonBoundaryCtx,
  seasonStats: Record<string, PlayerSeasonStats>,
  leagueStats: Record<string, Record<string, PlayerSeasonStats>>,
  seasonYear: number,
) {
  update((s) => {
    const merged: Record<string, PlayerSeasonStats> = { ...seasonStats };
    for (const stats of Object.values(leagueStats)) {
      for (const [id, st] of Object.entries(stats)) {
        if (!merged[id]) merged[id] = st;
      }
    }
    const npcs = s.npcs.map((npc) => {
      if (npc.careerStatus !== "active") return npc;
      const stat = merged[npc.npcId];
      if (!stat) return npc;
      // 연도 기록은 Rust 학년 진급도 남긴다 — 방어가 없으면 고교생이
      // 같은 해에 두 줄이 된다 (실측으로 확인)
      if (npc.careerHistory.some((h) => h.year === seasonYear)) return npc;
      const statLine = buildNpcStatLine(stat);
      const entry: NpcCareerEntry = {
        year: seasonYear,
        leagueId: npc.currentLeague,
        teamId: npc.currentTeam,
        statLine,
        highlights: [],
        stats: stat,
      };
      return { ...npc, careerHistory: [...npc.careerHistory, entry] };
    });
    return { ...s, npcs };
  });
}

export function appendCareerRecord(
  { update }: SeasonBoundaryCtx,
  record: CareerSeasonRecord,
  seasonStats?: PlayerSeasonStats,
) {
  update((s) => ({
    ...s,
    protagonist: {
      ...s.protagonist,
      careerRecords: [
        ...(s.protagonist.careerRecords ?? []),
        seasonStats ? { ...record, stats: seasonStats } : record,
      ],
    },
  }));
}
