// ── NPC 드래프트 (스토어 덩이 1) ──────────────────────────────
//
// 이 로직은 `stores/game.ts` 의 `processNpcDraft` **안에** 있었다(331줄).
// store 는 상태를 `update(s => …)` 로 적는 자리지 세계를 굴리는 자리가 아니다
// (`PLAN_103 §3` Ⅱ-2 · 「store 안의 게임 로직」은 절대 금지 항목).
//
// **옮긴 본문은 넷 말고 그대로다** — 뜻이 안 바뀌었다는 증명이 그것이다:
//   `this.setCareerResults(` → `ctx.store.setCareerResults(`
//   `this.addCareerEvent(` → `ctx.store.addCareerEvent(`
//   `this.setCareerDraftCandidates(` → `ctx.store.setCareerDraftCandidates(`
//   `_getSeasonData?.()` → `ctx.seasonData?.()`
// `get({ subscribe })` 와 `update(…)` 는 **한 글자도 안 바꿨다** — `ctx` 에서
// 같은 이름으로 꺼내 쓴다. 이름·시그니처·순서 전부 불변이다.
//
// ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.
//   「스토어 어딘가에 이 줄이 있다」가 그 검사들이 묻던 것이다.

import { get } from "svelte/store";
import type { GameStoreState } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { autoLog, logEvent, logVerify, type PlayerEventEntry } from "../../stores/autoAdvance";
import { npcLiveStatsStore, liveOvrOf } from "../../stores/npcLiveStats";
import { loadRosterRules, buildSalaryIndex } from "../../repo/newGameV3";
import {
  applyDraftToNpcs,
  runDraftSimulation,
  selectDraftCandidates,
  DRAFT_ROUNDS,
  DRAFT_ROUTE_LABELS,
  KBL_TEAM_IDS,
  draftDestinationTeams,
  draftOrderOf,
  placementRulesFrom,
  teamNeedsOf,
} from "../../utils/draftSystem";
import type {
  CareerDraftPickLogEntry,
  CareerResults,
  DraftBoardCandidate,
  DraftPick,
  NpcCareerEvent,
  NpcSaveState,
} from "../../types/save";
import type { SaveSeason } from "../../types/season";

/**
 * 스토어가 건네는 손잡이.
 *
 * ⚠ `subscribe` 를 그대로 받는 이유는 **본문을 안 고치려고**다 —
 *   옮긴 코드가 `get({ subscribe })` 를 그대로 쓴다.
 * ⚠ `store` 는 `gameStore` 타입을 안 적는다(순환 import). 이 덩이가 실제로
 *   부르는 **세 메서드만** 적는다 — 더 부르면 여기서 막힌다.
 */
export interface NpcDraftCtx {
  subscribe: (run: (value: GameStoreState) => void) => () => void;
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
  store: {
    setCareerResults(results: CareerResults): void;
    addCareerEvent(event: NpcCareerEvent): void;
    setCareerDraftCandidates(rows: DraftBoardCandidate[]): void;
  };
  /** `season.ts → game.ts` 역방향 의존 없이 등록된 getter — 지명 순서가 이걸 본다 */
  seasonData: (() => SaveSeason) | null;
}

export async function processNpcDraft(
  ctx: NpcDraftCtx,
  year: number,
  universityTeamIds: string[],
  independentTeamIds: string[],
): Promise<{ picks: DraftPick[] } | null> {
  // 본문이 `get({ subscribe })`·`update(…)` 를 그대로 쓰게 이름을 맞춘다
  const { subscribe, update } = ctx;
  const _t0Draft = Date.now();
  const s = get({ subscribe });

  if (s.lastDraftYear === year) {
    autoLog(`[드래프트] Y${year}는 이미 진행됨 — 건너뛴다`);
    return null;
  }

  // 후보 풀은 졸업 예정자 + **소속을 유지한 신청자**(대학 재학·독립)다.
  // 예전엔 pendingDraft(졸업생)만 봐서 대학 저학년과 독립리그 선수는
  // 영원히 드래프트에 나올 수 없었다.
  const npcIdSet = new Set(s.npcs.map((n) => n.npcId));
  const combined = [...s.npcs, ...s.pendingDraft.filter((n) => !npcIdSet.has(n.npcId))];

  const rulesFile = await loadRosterRules();
  const draftRules = rulesFile.draftRules;
  if (!draftRules) {
    autoLog(`[드래프트오류] generation_rules.json에 draftRules가 없다 — 드래프트를 건너뛴다`);
    return null;
  }

  // 지명 순서는 **전 시즌 성적 역순**이다. 예전엔 팀 목록을 아예 안 넘겨
  // 기본값(알파벳 순)으로 돌았다 — 매년 같은 팀이 1순위를 가져갔다
  // 정본은 `draftOrderOf` 하나다 — 주인공 지명도 같은 순서를 받아야
  // 순번과 팀이 맞는다(`determine_protagonist_draft` 주석 참고)
  const draftOrder = draftOrderOf(ctx.seasonData?.()?.prevSeasonKblStandings ?? []);
  const teamIndex = Object.fromEntries(buildSalaryIndex(get(masterStore).teams));
  const univGradeMax = rulesFile.rosterRules["LEAGUE_UNIVERSITY"]?.gradeMax ?? 4;
  const hsGradeMax = rulesFile.rosterRules["LEAGUE_HIGHSCHOOL"]?.gradeMax ?? 3;
  const { candidates, counts } = await selectDraftCandidates(
    combined,
    draftRules,
    univGradeMax,
    hsGradeMax,
  );
  if (candidates.length === 0) return null;

  const byId = new Map(combined.map((n) => [n.npcId, n]));
  const candidateNpcs = candidates
    .map((c) => byId.get(c.npcId))
    .filter((n): n is NpcSaveState => n !== undefined);
  const routeOf = new Map(candidates.map((c) => [c.npcId, c.route]));

  autoLog(
    `[드래프트] Y${year} 후보 ${candidates.length}명 ` +
      `(고졸 ${counts[0]} · 대졸 ${counts[1]} · 대학재학 ${counts[2]} · 독립 ${counts[3]})`,
  );
  // 지명 대상 풀 배수 — 보드에 싣는 수와 **같은 값**을 쓴다.
  // 다르면 "화면엔 220명인데 실제로는 1,682명에서 뽑는" 상태가 된다
  const poolMult =
    (draftRules as { boardCandidateMultiplier?: number }).boardCandidateMultiplier ?? 2;
  // 팀 사정 — **안 넘기면 구단이 뭐가 모자란지 모른 채 최고점만 뽑는다.**
  // 야수 10명인 팀도 최고점 투수가 남아 있으면 그 투수를 뽑았다.
  // 하한은 규칙 파일에서 유도한다(표를 새로 두지 않는다)
  const needBonus = (draftRules as { needBonus?: number }).needBonus ?? 0;
  const teamNeeds =
    needBonus > 0 ? teamNeedsOf(get({ subscribe }).npcs, draftOrder, rulesFile.rosterRules) : {};
  const simResult = await runDraftSimulation(
    candidateNpcs,
    [],
    year,
    draftRules.rounds ?? DRAFT_ROUNDS,
    draftOrder,
    poolMult,
    // 🔴 **팀마다 다른 눈으로 보게 한다.** 안 넘기면 전 구단이 진짜
    //   능력을 정확히 알던 예전 동작이다 — `serde(default)` 라 조용하다.
    (() => {
      const sp =
        (rulesFile as unknown as { draftScoutingRules?: { span?: number } }).draftScoutingRules
          ?.span ?? 0;
      if (sp <= 0) return undefined;
      const quality: Record<string, number> = {};
      for (const tid of KBL_TEAM_IDS) {
        // 성향은 스토어가 정본이다 — 없으면 50(기준)
        quality[tid] = get({ subscribe }).proTeamProfiles?.[tid]?.scoutingQuality ?? 50;
      }
      return { quality, span: sp };
    })(),
    needBonus > 0
      ? {
          teamNeeds,
          needBonus,
          needSaturation: (draftRules as { needSaturation?: number }).needSaturation ?? 0,
        }
      : undefined,
  );

  // ── 주인공을 보드에 끼워 넣는다 ──────────────────────────
  //
  // ⚠ **주인공이 NPC 드래프트와 같은 판 위에 있지 않았다.** 지명 여부는
  // `determine_protagonist_draft`가 따로 정하고, 보드는 NPC 110명으로
  // 꽉 차 있었다. 화면은 주인공을 그 자리에 **끼워 넣기만** 했고
  // (`DraftBoardModal`) 누구도 밀려나지 않아서:
  //
  //   · 행이 111개가 되고 주인공이 뽑은 번호만 **두 줄**로 뜬다
  //   · 마지막 번호 자리는 빈다 (실측: 56 두 줄 · 111 없음)
  //   · 그 자리를 이미 가진 NPC도 그대로 지명 처리된다
  //
  // 실제 드래프트는 한 순번에 한 명이다. 주인공이 들어가면 **그 뒤가
  // 한 칸씩 밀리고 마지막 지명자 하나가 미지명이 된다.**
  const heroPick = s.schoolState.careerResults;
  let displacedNpcId: string | null = null;
  if (heroPick?.draftDrafted && heroPick.draftPick != null) {
    const at = Math.max(0, Math.min(simResult.picks.length, heroPick.draftPick - 1));
    // 밀려나는 사람 = 마지막 지명자. 이 사람은 미지명 경로를 타야 한다
    if (simResult.picks.length >= (draftRules.rounds ?? DRAFT_ROUNDS) * draftOrder.length) {
      displacedNpcId = simResult.picks[simResult.picks.length - 1]?.npcId ?? null;
      simResult.picks.pop();
    }
    simResult.picks.splice(at, 0, {
      round: heroPick.draftRound ?? 1,
      pick: heroPick.draftPick,
      teamId: heroPick.draftTeamId ?? draftOrder[0],
      npcId: s.protagonist.id,
    });
    // 번호를 다시 매긴다 — 끼워 넣은 뒤 자리가 한 칸씩 밀렸다
    const perRound = draftOrder.length;
    simResult.picks = simResult.picks.map((p, i) => ({
      ...p,
      pick: i + 1,
      round: Math.floor(i / perRound) + 1,
      teamId: draftOrder[i % perRound],
    }));
    // 주인공의 최종 순번·팀은 **보드가 정한 값**이다 — 산식이 낸 값과
    // 다를 수 있고(앞사람이 밀렸다), 화면·계약이 이걸 읽어야 맞는다
    const mine = simResult.picks.find((p) => p.npcId === s.protagonist.id);
    if (mine) {
      ctx.store.setCareerResults({
        ...heroPick,
        draftRound: mine.round,
        draftPick: mine.pick,
        draftTeamId: mine.teamId,
      });
      // 🔴 **지명을 주인공 경력에 남긴다** (2026-09-01 · 트랙 C 요청).
      //
      //   `addCareerEvent` 호출부 여섯 곳 어디에도 드래프트가 없었다.
      //   NPC 는 Rust `apply_draft` 가 `draft_picked` 를 남기는데
      //   **주인공만 안 남았다.** 그래서 엔딩 화면 "주요 사건" 절이
      //   졸업·트레이드·입대·전역·면제·은퇴는 다 보여주는데 **지명만
      //   비었다** — 커리어에서 제일 큰 사건이다.
      //
      // ⚠ **여기여야 한다.** 위에서 번호를 다시 매겼으므로 산식이 낸
      //   값과 최종 순번이 다를 수 있다(앞사람이 밀렸다). 화면·계약이
      //   읽는 값과 **같은 값**을 남긴다.
      // ⚠ `toLeagueId` 는 팀에서 끌어온다 — 드래프트 목적지가 KBL 1군만
      //   은 아니다(2군 지명이 있다). 못 찾으면 비운다.
      const draftTeam = get(masterStore).teams.find((t) => t.id === mine.teamId);
      ctx.store.addCareerEvent({
        year,
        eventType: "draft_picked",
        toTeamId: mine.teamId,
        toLeagueId: draftTeam?.leagueId ?? "",
        detail: `${mine.round}라운드 ${mine.pick}순위`,
      });
    }
    // ⚠ **밀려난 사람을 미지명 목록에 넣는다.** `apply_draft`는 `picks`에
    // 없으면 KBL로 안 옮기고, `undraftedIds`에도 없으면 진로 배정
    // (`Placer`)도 안 탄다 — 어디에도 안 속한 채 원 소속에 남는다.
    // 오류도 로그도 안 나는 종류라 검사로 잡는다
    if (displacedNpcId) {
      simResult.undraftedIds = [...simResult.undraftedIds, displacedNpcId];
      autoLog(`[드래프트] 주인공 편입으로 마지막 지명 1건이 미지명이 됐다`);
    }
  }

  // 픽별 상세 로그
  const npcInfoMap = new Map(candidateNpcs.map((n) => [n.npcId, n]));
  const _draftEntries: PlayerEventEntry[] = [];
  const _liveForLog = get(npcLiveStatsStore);
  for (const pick of simResult.picks) {
    // ⚠ 주인공은 `npcs`에 없다 — 조회가 빗나가면 이름 자리에 `PLY_HERO`가
    // 찍히고 OVR이 0으로 남는다. 보드에 편입한 이상 같은 줄에 제대로 뜬다
    const isHero = pick.npcId === s.protagonist.id;
    const npc = npcInfoMap.get(pick.npcId);
    const ovr = isHero ? s.protagonist.pitching.ovr : npc ? liveOvrOf(npc, _liveForLog) : 0;
    const pos = isHero ? "P" : npc?.playerType === "pitcher" ? "P" : (npc?.position ?? "?");
    const age = isHero ? (s.protagonist.age ?? 0) : (npc?.age ?? 0);
    const potential = isHero ? s.protagonist.developmentRate : (npc?.developmentRate ?? 0);
    const teamShort = pick.teamId.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
    const route = isHero
      ? DRAFT_ROUTE_LABELS.highschoolGraduate
      : DRAFT_ROUTE_LABELS[routeOf.get(pick.npcId) ?? "highschoolGraduate"];
    autoLog(
      `  ${pick.round}R-${pick.pick}: ${isHero ? s.protagonist.name : (npc?.name ?? pick.npcId)} (${route} OVR:${ovr} ${pos} ${age}세 잠재${potential}) → ${teamShort}`,
    );
    _draftEntries.push({
      npcId: pick.npcId,
      name: isHero ? s.protagonist.name : (npc?.name ?? pick.npcId),
      toTeamId: pick.teamId,
      toLeagueId: "LEAGUE_KBL",
      detail: `${pick.round}라운드 ${pick.pick}순위 | ${route} OVR:${ovr} ${pos} ${age}세 잠재:${potential}`,
    });
  }
  autoLog(
    `[드래프트] 지명 ${simResult.picks.length}건 (미지명 ${candidates.length - simResult.picks.length}명)`,
  );

  // ── 관전 보드용 후보 명단 ────────────────────────────────
  //
  // ⚠ 보드는 예전에 후보를 **지명 결과에서만** 만들어서 미지명이 항상
  // 0명이었다. 지명 수의 배수만큼 상위 후보를 남겨 "뽑히지 못한 사람"이
  // 화면에 보이게 한다. 정렬은 실제 지명 순서를 먼저 두고, 나머지는
  // OVR 내림차순이다 — 지명자가 상위에 몰리는 게 자연스럽다.
  {
    const mult =
      (draftRules as { boardCandidateMultiplier?: number }).boardCandidateMultiplier ?? 2;
    const want = Math.max(simResult.picks.length, Math.round(simResult.picks.length * mult));
    const pickedIds = new Set(simResult.picks.map((p) => p.npcId));
    // ⚠ **`??`가 아니라 `Math.max`다.** NPC는 투수·타자 블록을 둘 다 갖는다 —
    // `??`로 읽으면 타자의 낮은 `pitching.ovr`이 먼저 잡혀 실제 실력보다
    // 훨씬 낮게 나온다. 실측에서 지명 1순위가 OVR 53으로, 미지명 최하위(74)
    // 보다 낮게 찍혔다. 보드(`DraftBoardModal`)는 처음부터 max를 쓴다
    // ⚠ **live를 읽는다.** `npcs[].pitching`은 생성값이라 3년을 지나도 안 자란다 —
    // 그걸로 정렬하면 지명 순서가 **1학년 때 실력** 기준이 된다
    const _live = get(npcLiveStatsStore);
    const ovrOf = (n: NpcSaveState) => liveOvrOf(n, _live);
    const rest = candidateNpcs
      .filter((n) => !pickedIds.has(n.npcId))
      .sort((a, b) => ovrOf(b) - ovrOf(a));
    // ⚠ **주인공 자리를 비우지 않는다.** `npcInfoMap`엔 주인공이 없어서
    // `filter(!!n)`이 그 줄을 통째로 떨어뜨린다 — 보드 후보 명단에
    // 지명자가 한 명 모자라고, 그 자리를 화면이 따로 메우려다 픽번호가
    // 어긋난다. 주인공은 NPC 형태로 얹어 같은 표에 놓는다
    const heroRow = {
      npcId: s.protagonist.id,
      name: s.protagonist.name,
      playerType: "pitcher",
      position: s.protagonist.position ?? "SP",
      age: s.protagonist.age ?? 0,
      developmentRate: s.protagonist.developmentRate,
      currentTeam: s.protagonist.teamId ?? "",
      pitching: s.protagonist.pitching,
    } as unknown as NpcSaveState;
    const ordered = [
      ...simResult.picks
        .map((p) => (p.npcId === s.protagonist.id ? heroRow : npcInfoMap.get(p.npcId)))
        .filter((n): n is NpcSaveState => !!n),
      ...rest,
    ].slice(0, want);
    ctx.store.setCareerDraftCandidates(
      ordered.map((n) => ({
        playerId: n.npcId,
        playerName: n.name,
        // 주인공은 live 맵에 없다 — 생성값이 곧 현재값이라 그대로 쓴다
        ovr: Math.round(n.npcId === s.protagonist.id ? s.protagonist.pitching.ovr : ovrOf(n)),
        age: n.age ?? 0,
        potential: n.developmentRate ?? 0,
        position: n.playerType === "pitcher" ? "P" : (n.position ?? "?"),
        originTeamId: n.currentTeam ?? "",
        route: DRAFT_ROUTE_LABELS[routeOf.get(n.npcId) ?? "highschoolGraduate"],
      })),
    );
    autoLog(
      `[드래프트] 보드 후보 ${ordered.length}명 (지명 ${simResult.picks.length} · 미지명 ${ordered.length - simResult.picks.length})`,
    );
  }

  // ⚠ **2군 목록을 안 넘기면 미지명자가 갈 곳이 없다.** 오프시즌 경로는
  // 넘기는데 드래프트 경로만 빠져 있어서, `farmMax: 34`가 계산은 되고
  // 쓰이진 않았다 — 그만큼이 그대로 "야구를 그만둔다"로 갔다
  const draftDest = draftDestinationTeams(get(masterStore).teams);
  const updatedNpcs = await applyDraftToNpcs(
    combined,
    simResult,
    universityTeamIds,
    independentTeamIds,
    {
      contract: draftRules.contract,
      firstTeamRounds: draftRules.firstTeamRounds ?? 0,
      teamIndex,
      placement: placementRulesFrom(
        rulesFile.rosterRules,
        rulesFile.developmentPlayerRules?.salary,
        rulesFile.developmentPlayerRules?.intakeMax,
      ),
      farmTeamIds: draftDest.farmIds,
      // 독립리그로 가는 사람도 연봉을 받고 뛴다 — 안 넘기면 0으로 들어간다
      salaryRules: rulesFile.salaryRules,
    },
  );
  update((st) => ({ ...st, npcs: updatedNpcs, pendingDraft: [], lastDraftYear: year }));

  // 지명 로그 — **관전 보드가 이걸 재생한다.** 예전엔 보드가 자기 후보 풀로
  // 따로 시뮬을 돌려서, 화면에서 본 지명과 실제 소속이 달랐다
  const pickLog: CareerDraftPickLogEntry[] = simResult.picks.map((pick) => ({
    pickNo: pick.pick,
    round: pick.round,
    teamId: pick.teamId,
    playerId: pick.npcId,
    playerName:
      pick.npcId === s.protagonist.id
        ? s.protagonist.name
        : (npcInfoMap.get(pick.npcId)?.name ?? pick.npcId),
    // 화면이 이걸로 내 줄을 강조한다 — 예전엔 항상 false라 보드가
    // 주인공을 따로 끼워 넣어야 했고 그게 픽번호 중복의 시작이었다
    isUser: pick.npcId === s.protagonist.id,
    // 나이로는 경로를 못 가른다 — 드래프트 전에 나이가 이미 올라간다
    // (`CareerDraftPickLogEntry.route` 주석)
    route: DRAFT_ROUTE_LABELS[routeOf.get(pick.npcId) ?? "highschoolGraduate"],
  }));
  update((st) => ({
    ...st,
    schoolState: { ...st.schoolState, careerDraftPickLog: pickLog },
  }));

  // NPC 드래프트 픽 거래 기록
  const slotId = s.currentSlotId;
  let _draftDbOk = true;
  if (slotId && simResult.picks.length > 0) {
    const rows = simResult.picks.map((pick) => {
      const before = npcInfoMap.get(pick.npcId);
      // 소속을 유지한 채 신청한 선수는 **떠나온 팀이 있다.** 그 팀을 안 적으면
      // 리그 기록에 "어디서 왔는지 없는 이적"으로 남는다
      const from = before && before.currentLeague !== "LEAGUE_DRAFT_POOL" ? before : null;
      return {
        seasonYear: year,
        category: "draft" as const,
        playerId: pick.npcId,
        playerName: before?.name ?? pick.npcId,
        fromTeamId: from?.currentTeam ?? null,
        fromLeagueId: from?.currentLeague ?? null,
        toTeamId: pick.teamId,
        toLeagueId: "LEAGUE_KBL",
        detail: `${pick.round}라운드 ${pick.pick}순위`,
        groupId: null,
      };
    });
    const draftRes = JSON.parse(
      await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows })),
    );
    if (draftRes.error) {
      autoLog(`[NPC드래프트오류] ${draftRes.error}`);
      _draftDbOk = false;
    } else autoLog(`[NPC드래프트] DB 저장 ${rows.length}건 ✓`);
  }

  logEvent({
    id: `draft-Y${year}`,
    type: "draft",
    seasonYear: year,
    players: _draftEntries,
    counts: {
      input: candidates.length,
      processed: simResult.picks.length,
      saved: simResult.picks.length,
    },
    dbOk: _draftDbOk,
    durationMs: Date.now() - _t0Draft,
    extra: `미지명 ${candidates.length - simResult.picks.length}명 · 얼리신청 ${counts[2] + counts[3]}명`,
  });

  logVerify(`Y${year} 드래프트 완료`, [
    {
      name: `후보 ${candidates.length}명 → 지명 ${simResult.picks.length}건`,
      ok: simResult.picks.length > 0,
    },
    { name: `DB 저장`, ok: _draftDbOk },
    { name: `gameStore.npcs 반영`, ok: updatedNpcs.length >= s.npcs.length },
  ]);

  return { picks: simResult.picks };
}
