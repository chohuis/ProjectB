// ── 외국인 선수 연간 순환 (F-4 · F-5) ────────────────────────────
//
// KBL은 **진행 중인 리그**라 새 게임 시점에 이미 외국인이 있다(F-2a,
// `roster_gen.rs`). 그 뒤를 잇는 게 이 파일이다 — 시즌이 끝나면
//
//   ① 재계약 판정: 규칙선(`foreignRules.renew`)에 못 미치면 퇴출
//   ② 빈 슬롯 충원: 보유 한도(3명·투수 2명)까지 새로 채운다
//
// ⚠ **충원을 안 하면 한 시즌마다 자리가 줄어든다.** 은퇴·부진 퇴출은
// 일어나는데 들어오는 경로가 없으면 5년 뒤 KBL에 외국인이 사라진다.
//
// 어디서 데려오는가(사용자 확정 2026-08-06): **실재하는 해외 선수를 데려온다.**
//
// ⚠ 예전엔 무에서 만들었다 — `generateForeignPlayersNative`가 선수를 새로 찍고
// `careerHistory: []`로 넣어서 **어디서 왔다는 기록이 아예 없었다.** 화면이
// 국내 신인과 구분할 방법이 없었다. ABL·JBL이 열렸으므로(releaseScope.ts) 이제
// 그 리그의 실제 선수를 이적시킨다 — "작년에 거기 있었다"가 참이 된다.
//
// 분포는 규칙 파일이 정본이다(`foreignRules.origin`). **마이너 출신이 대부분**이고
// 메이저 주전급은 연봉·조건 때문에 잘 안 온다.
//
// ⚠ **후보가 모자라면 생성으로 채운다.** 해외가 닫혀 있거나(게이트) 그 해에
// 조건 맞는 선수가 없으면 자리를 비우지 않는다 — 빈 슬롯이 남으면 그 팀은
// 한 시즌을 두 명으로 뛴다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { npcLiveStatsStore } from "../stores/npcLiveStats";
import { slotRepo } from "../repo/slotRepo";
import { loadRosterRules } from "../repo/newGameV3";
import { isV3SlotActive } from "../repo/v3Mode";
import { isForeignPlayer, foreignRules, primeForeignRules } from "../utils/foreignSlots";
import { buildSalaryIndex } from "../repo/newGameV3";
import { originRulesOf, pickForeigners, originLabel, type Candidate } from "../utils/foreignOrigin";
import { leagueOfTeam } from "../utils/ids";
import type { NpcSaveState } from "../types/save";

/** 이 리그의 1군 팀 (팜 `_2`는 외국인을 두지 않는다) */
function firstTeamsOf(leagueId: string): string[] {
  return get(masterStore).teams
    .filter((t) => t.leagueId === leagueId && t.id.endsWith("_1"))
    .map((t) => t.id);
}

function ovrOf(n: NpcSaveState, live: Record<string, import("../types/season").NpcLiveStat>): number {
  const ls = live[n.npcId];
  return n.playerType === "pitcher"
    ? (ls?.pitching?.ovr ?? n.pitching?.ovr ?? 0)
    : (ls?.batting?.ovr ?? n.batting?.ovr ?? 0);
}

/**
 * 시즌 종료 외국인 순환. 새 시즌 W1에 부른다 — 은퇴·로스터 정리가 끝난
 * **뒤**여야 빈 자리를 정확히 센다.
 *
 * @returns `{ released, signed }`
 */
/**
 * 성적 점수 (−1 ~ +1). **눈금 정본은 Rust `team_engine::form_score`다** —
 * 승강 판정이 쓰는 그 함수를 `formScoreNative`로 그대로 부른다.
 *
 * ⚠ TS에 다시 구현하면 표가 둘이 되어 "승강은 잘했다는데 재계약은 불가"가
 * 나온다. 표본 보정(투수 40이닝·타자 120타석)도 그 함수 안에 있다.
 *
 * 성적이 없으면 0 — 그 해 한 경기도 안 뛴 선수는 능력치로만 판정된다.
 */
async function formOf(
  n: { npcId: string; playerType?: string },
  stats: Record<string, unknown>,
): Promise<number> {
  const row = stats[n.npcId] as {
    ip?: number; era?: number; g?: number; pa?: number; ops?: number;
  } | undefined;
  if (!row) return 0;
  const perf = {
    games: row.g ?? 0,
    innings: row.ip ?? 0,
    era: row.era ?? 0,
    plateAppearances: row.pa ?? 0,
    ops: row.ops ?? 0,
  };
  try {
    const raw = await window.projectB!.engine(
      "formScoreNative", JSON.stringify({ perf, isPitcher: n.playerType === "pitcher" }));
    const v = JSON.parse(raw);
    return typeof v === "number" && Number.isFinite(v) ? v : 0;
  } catch {
    // 엔진이 없으면(Vite 단독) 성적을 안 본다 — 예전 동작 그대로다
    return 0;
  }
}

export async function applyForeignTurnover(
  seasonYear: number,
): Promise<{ released: number; signed: number; logs: string[] }> {
  const empty = { released: 0, signed: 0, logs: [] as string[] };
  if (!isV3SlotActive()) return empty;

  const g = get(gameStore);
  const slotId = g.currentSlotId;
  if (!slotId) return empty;

  const rulesFile = await loadRosterRules();
  primeForeignRules(rulesFile);
  const F = foreignRules();
  if (!F?.leagues?.length) return empty;

  // 그해 성적 — 리그별로 쌓인다. 외국인은 KBL 1군에만 있지만 리그를 적어
  // 넣으면 다음에 한도 리그가 늘 때 또 샌다 — **전부 훑는다.**
  const seasonStats: Record<string, unknown> = {};
  {
    const { seasonStore } = await import("../stores/season");
    const st = get(seasonStore);
    for (const ls of Object.values(st.leagueState ?? {})) {
      const rows = (ls as { stats?: Record<string, unknown> })?.stats ?? {};
      for (const [pid, row] of Object.entries(rows)) seasonStats[pid] = row;
    }
    for (const [pid, row] of Object.entries(st.stats ?? {})) seasonStats[pid] = row;
  }

  const renew = (F as unknown as {
    renew?: { ovrMin: number; ageMax: number; formWeight?: number };
  }).renew;
  const live = get(npcLiveStatsStore);
  const logs: string[] = [];

  // ⚠ **처음 도는 해에는 재계약 판정을 하지 않는다.**
  //
  // 이 함수는 새 시즌 W1에 도는데, 새 게임의 첫 W1은 초기 로스터(F-2a)가
  // 만들어진 **바로 그 주**다. 거기서 바로 자르면 하한(66)~73 구간이 한 경기도
  // 못 뛰고 재추첨되어, 의도한 대박/쪽박 편차가 첫 주에 73~94로 좁아진다.
  // 용병은 최소한 계약한 시즌은 뛰고 평가받는다.
  const meta = await slotRepo.getMeta(slotId);
  const lastYear = Number(meta.foreign_turnover_year ?? 0);
  const firstRun = !lastYear;
  await slotRepo.setMeta(slotId, { foreign_turnover_year: String(seasonYear) });

  // ── ① 재계약 판정 ────────────────────────────────────────────
  //
  // **능력치 + 성적**으로 본다 (사용자 확정 2026-08-22).
  //
  // 예전엔 능력치·나이만 봤고, 주석이 그 이유를 "성적은 표본이 얇은 선수를
  // 억울하게 자른다"로 적어 뒀다. 그 걱정은 맞지만 **`form_score`가 이미
  // 표본 보정을 한다** — 투수 40이닝·타자 120타석 미만이면 그 비율만큼만
  // 반영되고 0이닝이면 성적이 아예 안 걸린다. 승강 판정이 쓰는 그 함수를
  // `formScoreNative`로 그대로 부른다(표를 두 번 두지 않는다).
  //
  // 실측 기준선: 교체 3.7명/시즌(총원 30) — 나이·노쇠로만 갈리던 값이다.
  //
  // ⚠ **`form_score`는 투수·타자가 비대칭이다.** 타자는 OPS가 0 아래로 못
  // 가서 현실적으로 -4점이 한계인데 투수는 ERA 9.00이면 -14점이다.
  // 즉 `formWeight`는 사실상 투수에게 크게 걸린다 — 승강도 같은 성질이다.
  const releasedIds: string[] = [];
  if (renew && !firstRun) {
    for (const n of g.npcs) {
      if (n.careerStatus !== "active") continue;
      if (!isForeignPlayer(n.currentLeague ?? "", n.nationality)) continue;
      const ovr = ovrOf(n, live);
      // 성적 → 능력치 환산. 표본이 없으면 0이라 예전 동작 그대로다
      const form = await formOf(n, seasonStats);
      const eff = ovr + form * (renew.formWeight ?? 0);
      if (eff >= renew.ovrMin && n.age <= renew.ageMax) continue;
      releasedIds.push(n.npcId);
      logs.push(`[외국인] ${n.name} 재계약 불가 ` +
        `(OVR ${Math.round(ovr)}${form ? ` 성적 ${form > 0 ? "+" : ""}${Math.round(form * (renew.formWeight ?? 0))}` : ""}` +
        ` · ${n.age}세)`);
    }
  }

  if (releasedIds.length > 0) {
    // ⚠ **예전엔 은퇴로 기록했다.** "본국 복귀를 은퇴로 기록한다"고 적혀
    // 있었는데, 진짜 이유는 **갈 곳이 없어서**였다 — 해외가 닫혀 있었다.
    // 이제 온 곳(`origin.returnLeague`)으로 돌려보낸다. 국내 독립리그로 보내는
    // 진로 배정을 태우면 용병이 한국 독립리그 선수가 되므로 그 경로는 여전히 안 탄다.
    const rel = new Set(releasedIds);
    const back = originRulesOf(F).returnLeague;
    // 돌아갈 팀 — 그 리그에서 제일 인원이 적은 팀. 한 팀에 몰아넣지 않는다
    const backTeams = back
      ? get(masterStore).teams
          .filter((t) => (leagueOfTeam(t.id) ?? t.leagueId) === back)
          .map((t) => t.id)
      : [];
    const sizeOf = new Map<string, number>();
    for (const n of g.npcs) {
      if (n.careerStatus !== "active" || !n.currentTeam) continue;
      sizeOf.set(n.currentTeam, (sizeOf.get(n.currentTeam) ?? 0) + 1);
    }
    const pickBackTeam = (): string | null => {
      if (backTeams.length === 0) return null;
      const t = backTeams.reduce((a, b) =>
        (sizeOf.get(a) ?? 0) <= (sizeOf.get(b) ?? 0) ? a : b);
      sizeOf.set(t, (sizeOf.get(t) ?? 0) + 1);
      return t;
    };

    const backTo = new Map<string, string>();
    for (const npcId of releasedIds) {
      const t = pickBackTeam();
      if (t) {
        backTo.set(npcId, t);
        await slotRepo.transfer({
          slotId, npcId, toTeamId: t, toLeagueId: back,
          seasonYear, category: "release",
          detail: "재계약 불가 — 본국 복귀",
        });
      } else {
        // 돌아갈 리그가 없으면(게이트가 닫혀 있으면) 예전대로 은퇴다 —
        // 소속 없는 현역을 만들면 화면과 시뮬이 둘 다 깨진다
        await slotRepo.retire({
          slotId, npcId, seasonYear, detail: "재계약 불가 — 본국 복귀",
        });
      }
    }
    gameStore.updateNpcs(g.npcs.map((n) => {
      if (!rel.has(n.npcId)) return n;
      const t = backTo.get(n.npcId);
      const ev = {
        year: seasonYear,
        eventType: "release" as const,
        fromTeamId: n.currentTeam,
        fromLeagueId: n.currentLeague,
        ...(t ? { toTeamId: t, toLeagueId: back } : {}),
        detail: "재계약 불가 — 본국 복귀",
      };
      return t
        ? { ...n, currentLeague: back, currentTeam: t,
            careerEvents: [...(n.careerEvents ?? []), ev] }
        : { ...n, careerStatus: "retired" as const,
            currentLeague: "LEAGUE_RETIRED", currentTeam: "",
            careerEvents: [...(n.careerEvents ?? []), ev] };
    }));
    const wentBack = backTo.size;
    if (wentBack > 0) logs.push(`[외국인] 본국 복귀 ${wentBack}명`);
  }

  // ── ② 빈 슬롯 충원 ───────────────────────────────────────────
  const after = get(gameStore).npcs;
  const salaryIndex = buildSalaryIndex(get(masterStore).teams);
  let signed = 0;

  // 해외에서 데려올 후보. **이미 KBL에 있는 용병은 후보가 아니다**
  const origin = originRulesOf(F);
  const liveNow = get(npcLiveStatsStore);
  const pool: Candidate[] = Object.keys(origin.weights).length === 0 ? [] : after
    .filter((n) => n.careerStatus === "active"
      && !!n.currentTeam
      && n.currentLeague in origin.weights
      && n.age >= (F.ageMin ?? 0) && n.age <= (F.ageMax ?? 99))
    .map((n) => ({
      npcId: n.npcId, league: n.currentLeague ?? "", ovr: ovrOf(n, liveNow),
      age: n.age, playerType: n.playerType,
    }))
    // 규칙선(66~94)에 드는 사람만 — 아무나 데려오면 용병이 국내 신인만 못하다
    .filter((c) => c.ovr >= (F.ovrMin ?? 0) && c.ovr <= (F.ovrMax ?? 99));

  const takenFromPool = new Set<string>();
  /** 이적시킬 사람들. 팀별로 모아 두고 루프가 끝난 뒤 한 번에 적용한다 */
  const moves: Array<{ cand: Candidate; toTeamId: string; toLeagueId: string }> = [];
  // 시드 난수 — 같은 세계를 다시 열면 같은 영입이어야 한다
  let rngState = ((Number(meta.world_seed ?? 0) >>> 0) ^ (seasonYear * 2654435761)) >>> 0;
  const rand = () => {
    rngState = (rngState * 1664525 + 1013904223) >>> 0;
    return rngState / 4294967296;
  };

  for (const leagueId of F.leagues) {
    const requests: Array<{
      teamId: string; pitchers: number; batters: number; salaryIndex?: number;
    }> = [];

    for (const teamId of firstTeamsOf(leagueId)) {
      const held = after.filter((n) =>
        n.careerStatus === "active" && n.currentTeam === teamId
        && isForeignPlayer(n.currentLeague ?? "", n.nationality));
      const short = F.perTeam - held.length;
      if (short <= 0) continue;

      // 투수는 한도까지만 — 부족분을 전부 투수로 채우면 `maxPitchers`가 깨진다
      const heldPitchers = held.filter((n) => n.playerType === "pitcher").length;
      const pitchers = Math.max(0, Math.min(short, F.maxPitchers - heldPitchers));

      // ── 실제 해외 선수를 먼저 데려온다 ──────────────────────
      const picked = pickForeigners({
        candidates: pool.filter((c) => !takenFromPool.has(c.npcId)),
        rules: origin, pitchers, batters: short - pitchers, rand,
      });
      for (const c of picked) {
        takenFromPool.add(c.npcId);
        moves.push({ cand: c, toTeamId: teamId, toLeagueId: leagueId });
      }

      // 못 채운 만큼만 생성으로 — 자리를 비우지 않는다
      const restP = Math.max(0, pitchers - picked.filter((c) => c.playerType === "pitcher").length);
      const restB = Math.max(0, (short - pitchers) - picked.filter((c) => c.playerType !== "pitcher").length);
      if (restP + restB === 0) continue;
      requests.push({
        teamId, pitchers: restP, batters: restB,
        salaryIndex: salaryIndex.get(teamId),
      });
    }
    if (requests.length === 0) continue;

    const worldSeed = Number(meta.world_seed ?? 0) >>> 0;
    const gen = JSON.parse(
      await window.projectB!.engine("generateForeignPlayersNative", JSON.stringify({
        leagueId, seasonYear, worldSeed, requests, foreign: F,
        salaryRules: rulesFile.salaryRules,
        // 같은 해에 여러 번 돌아도 ID가 겹치지 않게 한다 —
        // 팀별 인덱스는 1부터 다시 시작하므로 연도만으로는 안 갈린다
        idOffset: signed,
      })),
    ) as { npcs?: NpcSaveState[]; error?: string };
    if (!Array.isArray(gen.npcs)) {
      logs.push(`[외국인] ${leagueId} 영입 실패: ${gen.error ?? "unknown"}`);
      continue;
    }

    const fresh = gen.npcs as unknown as Array<NpcSaveState & { abilities?: unknown }>;
    await slotRepo.insertNpcs(slotId, gen.npcs as unknown as Parameters<typeof slotRepo.insertNpcs>[1]);
    // 생성기 출력은 slot.db shape(`abilities`)다 — 스토어가 읽는 평면 형태로 편다.
    //
    // ⚠ **빈 배열 필드를 반드시 채운다.** 로드 경로는 `repoNpcToSaveState`가
    // `careerHistory: []` 같은 기본값을 넣어주지만, 여기는 생성기 출력을
    // 스토어에 **직접** 얹는 자리라 그 단계가 없다. 빠뜨리면 오프시즌
    // 재계약 판정의 `npc.careerHistory.at(-1)`이 undefined에서 터지고,
    // 그 예외가 주간 루프를 끊어 그해 처리가 통째로 안 돈다(실측 W43).
    const asSave = fresh.map((n) => {
      const ab = (n.abilities ?? {}) as { pitching?: unknown; batting?: unknown };
      return {
        ...n,
        pitching: ab.pitching, batting: ab.batting,
        isNamed: false,
        fame: 0,
        achievements: [],
        careerHistory: [],
        careerEvents: [],
      } as unknown as NpcSaveState;
    });
    gameStore.addNpcs(asSave);
    npcLiveStatsStore.update((st) => {
      const next = { ...st };
      for (const n of asSave) {
        next[n.npcId] = {
          pitching: n.pitching, batting: n.batting,
          pitchingXp: {}, battingXp: {},
          seasonStartPitching: n.pitching, seasonStartBatting: n.batting,
          peakOvr: n.pitching?.ovr ?? n.batting?.ovr,
          pitches: [],
        };
      }
      return next;
    });
    signed += asSave.length;
  }

  // ── ③ 해외에서 데려온 사람들을 실제로 옮긴다 ────────────────
  //
  // ⚠ **slot.db와 스토어를 같이 바꾼다.** 스토어만 바꾸면 다음 로드에서
  // 그 선수가 원래 리그로 되돌아가 있고, DB만 바꾸면 이번 시즌 화면이 옛
  // 소속으로 돈다 — 둘 다 조용히 어긋나는 종류다.
  if (moves.length > 0) {
    const byId = new Map(get(gameStore).npcs.map((n) => [n.npcId, n]));
    const nextNpcs = get(gameStore).npcs.map((n) => {
      const mv = moves.find((x) => x.cand.npcId === n.npcId);
      if (!mv) return n;
      return {
        ...n,
        currentLeague: mv.toLeagueId,
        currentTeam: mv.toTeamId,
        careerEvents: [
          ...(n.careerEvents ?? []),
          {
            year: seasonYear,
            eventType: "foreign_signing" as const,
            fromTeamId: n.currentTeam,
            fromLeagueId: n.currentLeague,
            toTeamId: mv.toTeamId,
            toLeagueId: mv.toLeagueId,
            detail: `${originLabel(n.currentLeague ?? "")} 출신`,
          },
        ],
      };
    });
    gameStore.updateNpcs(nextNpcs);

    for (const mv of moves) {
      const n = byId.get(mv.cand.npcId);
      await slotRepo.transfer({
        slotId, npcId: mv.cand.npcId,
        toTeamId: mv.toTeamId, toLeagueId: mv.toLeagueId,
        seasonYear, category: "fa",
        detail: `외국인 영입 — ${originLabel(n?.currentLeague ?? "")} 출신`,
      });
    }
    signed += moves.length;
    const byOrigin = new Map<string, number>();
    for (const mv of moves) {
      const k = originLabel(mv.cand.league);
      byOrigin.set(k, (byOrigin.get(k) ?? 0) + 1);
    }
    logs.push(`[외국인] 해외 영입 ${moves.length}명 (`
      + [...byOrigin].map(([k, v]) => `${k} ${v}`).join(" · ") + ")");
  }

  if (signed > 0) logs.push(`[외국인] ${seasonYear} 영입 ${signed}명`);
  return { released: releasedIds.length, signed, logs };
}
