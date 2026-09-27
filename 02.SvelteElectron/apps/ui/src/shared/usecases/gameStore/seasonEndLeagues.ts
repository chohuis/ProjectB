// ── 전 리그 시즌 종료 (스토어 덩이 2) ─────────────────────────
//
// 이 로직은 `stores/game.ts` 의 `processAllLeaguesSeasonEnd` **안에** 있었다
// (821줄 — store 한 파일의 17%). store 는 상태를 `update(s => …)` 로 적는
// 자리지 세계를 굴리는 자리가 아니다(`PLAN_103 §3` Ⅱ-2 · 절대 금지 항목).
//
// **옮긴 본문은 하나 말고 그대로다** — 뜻이 안 바뀌었다는 증명이 그것이다:
//   `_getSeasonData` → `ctx.seasonData` (2자리)
// `get({ subscribe })`(4자리)·`update(…)`(2자리)는 **한 글자도 안 바꿨다** —
// `ctx` 에서 같은 이름으로 꺼내 쓴다. `this.` 호출은 **원래 0자리**였다.
// 이름·시그니처·순서 전부 불변이다.
//
// ⚠ 검사는 `gamePathSrc()` 가 이 파일을 `game.ts` 와 한 덩이로 읽는다.

import { get } from "svelte/store";
import type { GameStoreState } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { autoLog, logEvent, logVerify, type PlayerEventEntry } from "../../stores/autoAdvance";
// `buildSalaryIndex` 는 본문이 동적 import 하는 그대로 남긴다
import { loadRosterRules } from "../../repo/newGameV3";
import { draftDestinationTeams, placementRulesFrom } from "../../utils/draftSystem";
import { npcLiveStatsStore } from "../../stores/npcLiveStats";
// store 안의 소식함 합치기 — 덩이가 새 소식을 밀어 넣을 때 쓴다(정본은 game.ts)
import { pushMailbox } from "../../stores/game";
import { getFaThreshold } from "../../utils/faEngine";
import { runOffseasonProcessing, rosterLimitsFrom, foreignParamsFrom } from "../../utils/npcEngine";
import { SANGMU_LEAGUE_ID, SANGMU_TEAM_ID } from "../../utils/ids";
import {
  sportsUnitLimits,
  protagonistTookSportsSlot,
  sportsVacatingPositions,
} from "../../utils/militaryRules";
import type { NpcCareerEntry, PlayerSeasonStats } from "../../types/save";
import type { SaveSeason } from "../../types/season";

/**
 * 스토어가 건네는 손잡이.
 *
 * ⚠ `subscribe` 를 그대로 받는 이유는 **본문을 안 고치려고**다 — 옮긴 코드가
 *   `get({ subscribe })` 를 그대로 쓴다.
 * ⚠ 이 덩이는 store 메서드를 **하나도 안 부른다**(옮기기 전 `this.` 0자리) —
 *   그래서 `store` 칸이 없다. 부르게 되면 여기서 막힌다.
 */
export interface SeasonEndCtx {
  subscribe: (run: (value: GameStoreState) => void) => () => void;
  update: (fn: (s: GameStoreState) => GameStoreState) => void;
  /** `season.ts → game.ts` 역방향 의존 없이 등록된 getter */
  seasonData: (() => SaveSeason) | null;
}

export async function processAllLeaguesSeasonEnd(ctx: SeasonEndCtx, seasonYear: number) {
  // 본문이 `get({ subscribe })`·`update(…)` 를 그대로 쓰게 이름을 맞춘다
  const { subscribe, update } = ctx;
  const s = get({ subscribe });

  // before 스냅샷: FA 추적 (프로 FA 자격 NPC) + 병역 상태 추적 (전체)
  const proLeagues = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
  const beforeTeam = new Map<string, string>(
    s.npcs
      .filter(
        (n) =>
          proLeagues.has(n.currentLeague) &&
          (n.proServiceYears ?? 0) >= getFaThreshold(n.currentLeague),
      )
      .map((n) => [n.npcId, n.currentTeam]),
  );
  const beforeMilitary = new Map(
    s.npcs.map((n) => [
      n.npcId,
      {
        name: n.name,
        status: n.militaryStatus,
        unit: n.militaryUnit,
        league: n.currentLeague,
        team: n.currentTeam,
      },
    ]),
  );

  // TS에서 이미 FA/재계약 결정된 named NPC ID → Rust FA 랜덤 재결정 방지
  const namedNpcIds = s.npcs.map((n) => n.npcId);
  // 로스터 상한·연봉 규칙을 규칙 파일에서 넘긴다. 예전엔 Rust에 하드코딩된
  // 표(KBL 상한 65)를 썼고 그게 1군+2군 합산에 걸려 프로가 700명까지 부풀었다
  const offRules = await loadRosterRules();
  // 방출·FA 미계약자의 진로 — 미지명 졸업생과 **같은 로직**을 태운다.
  // 안 넘기면 Rust가 그 사람들을 전부 은퇴시킨다
  const offDest = draftDestinationTeams(get(masterStore).teams);
  // FA 입찰 — **상한은 팀 예산 지수에서 유도한다**(새 표를 만들지 않는다).
  // 지금 총연봉에 지수와 여유를 곱한다: 부자 구단은 더 부를 수 있고
  // 가난한 구단은 못 부른다. `buildSalaryIndex`는 외국인 영입도 쓰는 함수다.
  const faParams = await (async () => {
    const min = (offRules.faRules as { bidInterestMin?: number } | undefined)?.bidInterestMin ?? 0;
    // 성적 배수 폭 — 0이면 성적을 안 본다(예전 동작)
    const span = (offRules.faRules as { perfSpan?: number } | undefined)?.perfSpan ?? 0;
    // 재계약 성적 배수 — FA보다 좁다
    const rSpan = (offRules.faRules as { renewPerfSpan?: number } | undefined)?.renewPerfSpan ?? 0;
    // 입찰 상한의 하한 — 팀 총연봉 대비. 0이면 하한이 없다(예전 동작).
    // 🔴 예산 지수가 0.8 미만인 구단은 상한이 **음수**였다(cap < 총연봉).
    //    자세한 건 Rust `fa_bid_floor_ratio` 주석에 있다.
    const floor = (offRules.faRules as { bidFloorRatio?: number } | undefined)?.bidFloorRatio ?? 0;
    if (!min) return undefined;
    const { buildSalaryIndex } = await import("../../repo/newGameV3");
    const idx = buildSalaryIndex(get(masterStore).teams);
    const payroll = new Map<string, number>();
    for (const n of s.npcs) {
      if (n.careerStatus !== "active" || !n.currentTeam) continue;
      payroll.set(n.currentTeam, (payroll.get(n.currentTeam) ?? 0) + (n.currentSalary ?? 0));
    }
    const cap: Record<string, number> = {};
    // 🔴 **FA 상한을 예산에서 낸다** (사용자 확정 2026-08-31).
    //
    //   예전엔 "지금 총연봉 × 팀지수 × 1.25" 였다 — 즉 **많이 쓰는 팀일수록
    //   상한이 높았다.** `refs.json` 의 팀별 예산(KBL 120~350억)은 어느
    //   판정에도 안 들어갔다.
    //
    //   지금은 **남은 예산**이 상한이다. 생성 때 예산을 적게 쓴 팀이
    //   그만큼 시장에서 큰손이 된다 — 실측에서 사용률이 19~66% 로
    //   갈렸다(창원 19% · 대전 66%).
    //
    // ⚠ 예산이 없는 팀(2군·상무·아마추어)은 **예전 식으로 떨어진다** —
    //   상한이 0이 되면 그 팀은 FA 입찰을 통째로 못 한다.
    const budgetOfTeam = new Map(
      get(masterStore).teams.map((t) => [
        t.id,
        ((t as unknown as { history?: { budget?: number } }).history?.budget ?? 0) / 10000,
      ]),
    );
    for (const [tid, cur] of payroll) {
      const saved = s.clubBudgets?.[tid];
      const budget = saved != null ? saved : (budgetOfTeam.get(tid) ?? 0);
      cap[tid] =
        budget > 0
          ? Math.max(0, Math.round(budget - cur))
          : Math.round(cur * (idx.get(tid) ?? 1) * 1.25);
    }
    return {
      teamPayrollCap: cap,
      bidInterestMin: min,
      perfSpan: span,
      renewPerfSpan: rSpan,
      bidFloorRatio: floor,
    };
  })();
  // 🔴 **그해 성적 → 방출 판정.** Rust는 `recent_performance_rating`에
  // 능력치를 넣고 있었고 그 능력치마저 생성 시점 값이라, 사실상 "태어날
  // 때 실력"으로 방출을 정했다. 성적은 **바로 이 시점까지 살아 있다** —
  // `seasonRollover`가 두 줄 위에서 같은 값을 연감에 넘긴다.
  //
  // ⚠ 리그를 골라 담지 않는다. 배경 리그 전부가 `playerLines`를 쌓으므로
  // (`backgroundLeague.accumulateStats`) 독립리그도 여기 들어온다 —
  // 프로만 담으면 독립이 통째로 방출 대상에서 빠진다.
  const offPerfScores: Record<string, number> = {};
  let offWorldSeed = 0;
  {
    const { seasonStore: _ss } = await import("../../stores/season");
    const _s = get(_ss);
    const { calcNpcPerfScore } = await import("../../usecases/weekPhases/market");
    const put = (rows: Record<string, import("../../types/save").PlayerSeasonStats>) => {
      for (const [pid, st] of Object.entries(rows ?? {})) {
        if (!st) continue;
        offPerfScores[pid] = calcNpcPerfScore(st);
      }
    };
    offWorldSeed = (_s.worldSeed ?? 0) >>> 0;
    put(_s.stats);
    for (const ls of Object.values(_s.leagueState ?? {})) put(ls?.stats ?? {});
  }
  const result = await runOffseasonProcessing(
    s.npcs,
    s.pendingDraft,
    seasonYear,
    namedNpcIds,
    rosterLimitsFrom(offRules.rosterRules),
    offRules.salaryRules,
    {
      universityTeamIds: offDest.univIds,
      independentTeamIds: offDest.indIds,
      farmTeamIds: offDest.farmIds,
      rules: placementRulesFrom(
        offRules.rosterRules,
        offRules.developmentPlayerRules?.salary,
        offRules.developmentPlayerRules?.intakeMax,
      ),
    },
    (offRules.faRules as { release?: unknown } | undefined)?.release,
    // 🔴 **안 넘기면 웨이버가 통째로 꺼진다.** `serde(default)` 라
    //   Rust 는 조용히 통과하고 방출자가 곧장 시장으로 간다.
    (offRules as { waiverRules?: unknown }).waiverRules,
    // ⚠ 안 넘기면 FA 미계약자가 **바로 은퇴한다** — 독립 재도전 갈래가 꺼진다
    (offRules.faRules as { independentAgeMax?: number } | undefined)?.independentAgeMax,
    foreignParamsFrom(offRules),
    // 🔴 **지금 능력치.** 안 넘기면 오프시즌이 생성 시점 값으로 돈다 —
    // 은퇴·정원 정리·방출·FA·콜업 정렬 22곳이 전부 그랬다
    get(npcLiveStatsStore),
    offPerfScores,
    s.proTeamProfiles,
    // 세계 씨앗 — 안 넘기면 모든 세계가 같은 오프시즌을 낸다
    offWorldSeed,
    faParams,
    // 🔴 **팀별 예산** — 총연봉이 넘으면 방출한다 (사용자 확정 2026-08-31).
    //   저장된 예산(전년 정산 · `clubFinance`)이 있으면 그게 우선이고,
    //   없으면 `refs.json` 의 팀별 예산을 만원으로 바꿔 쓴다.
    // ⚠ 안 넘기면 예산 방출이 통째로 꺼진다 — `serde(default)` 라 오류가 안 난다.
    (() => {
      const out: Record<string, number> = {};
      for (const t of get(masterStore).teams) {
        const saved = s.clubBudgets?.[t.id];
        const base =
          saved != null
            ? saved
            : ((t as unknown as { history?: { budget?: number } }).history?.budget ?? 0) / 10000;
        if (base > 0) out[t.id] = Math.round(base);
      }
      return out;
    })(),
  );
  // 이 배열은 아래 시즌종료 처리들이 인덱스로 직접 덮어쓴다 (careerHistory·병역·드래프트).
  // 예전엔 여기서 감정 9축의 dormant 감쇠·은퇴 archive도 했는데, 6C에서
  // 관계도로 대체했다 — 감쇠는 slot.db relationship에서 시즌 단위로 돈다.
  const nextNpcs = [...result.npcs];

  // 프로·독립리그 NPC 시즌 careerHistory 엔트리 추가 (ctx.seasonData 통해 순환 의존 없이 접근)
  {
    const seasonData = ctx.seasonData?.();
    if (seasonData) {
      // ⚠ **2군(LEAGUE_KBL_FARM)이 빠져 있었다.** 고교·대학은 Rust 학년
      // 진급이 연도 기록을 남기고 프로·독립은 여기서 남기는데, 2군만
      // 아무도 안 써서 **그 해가 통째로 비었다** — 궤적을 따라가면
      // 프로 선수의 특정 연도가 없어진 채로 보인다.
      const proIndLeagues = new Set([
        "LEAGUE_KBL",
        "LEAGUE_KBL_FARM",
        "LEAGUE_ABL",
        "LEAGUE_JBL",
        "LEAGUE_INDEPENDENT",
      ]);
      const npcPreState = new Map(
        s.npcs
          .filter((n) => proIndLeagues.has(n.currentLeague ?? ""))
          .map((n) => [n.npcId, { league: n.currentLeague, team: n.currentTeam }]),
      );
      const buildStatLine = (stat: PlayerSeasonStats): string => {
        if (stat.type === "pitcher") return `${stat.w}승 ${stat.l}패 ERA ${stat.era.toFixed(2)}`;
        return `타율 .${Math.round(stat.avg * 1000)
          .toString()
          .padStart(3, "0")} ${stat.hr}홈런 ${stat.rbi}타점`;
      };
      for (let i = 0; i < nextNpcs.length; i++) {
        const npc = nextNpcs[i];
        const pre = npcPreState.get(npc.npcId);
        if (!pre) continue;
        if (npc.careerHistory.some((h) => h.year === seasonYear)) continue;
        const npcStat = seasonData.leagueState[pre.league]?.stats?.[npc.npcId];
        const entry: NpcCareerEntry = {
          year: seasonYear,
          leagueId: pre.league,
          teamId: pre.team,
          statLine: npcStat ? buildStatLine(npcStat) : "-",
          highlights: [],
        };
        nextNpcs[i] = { ...npc, careerHistory: [...npc.careerHistory, entry] };
      }
    }
  }

  const slotId = s.currentSlotId;
  const _t0SeasonEnd = Date.now();
  const _faEntries: PlayerEventEntry[] = [];
  const _liveStats = get(npcLiveStatsStore);

  if (slotId) {
    // FA 재배치 기록: 오프시즌 처리 후 팀이 바뀐 FA 자격 선수
    const faRows: import("../../types/save").LeagueTransactionRow[] = [];
    for (const n of result.npcs) {
      const prev = beforeTeam.get(n.npcId);
      if (
        prev &&
        prev !== n.currentTeam &&
        proLeagues.has(n.currentLeague) &&
        n.careerStatus === "active"
      ) {
        const _live = _liveStats[n.npcId];
        const ovr = _live?.pitching?.ovr ?? _live?.batting?.ovr ?? 0;
        const prevShort = prev.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
        const nextShort = n.currentTeam.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
        autoLog(
          `  [FA이동] ${n.name} | ${prevShort}→${nextShort} | OVR:${ovr} | ${n.currentLeague.replace("LEAGUE_", "")}`,
        );
        _faEntries.push({
          npcId: n.npcId,
          name: n.name,
          fromTeamId: prev,
          toTeamId: n.currentTeam,
          fromLeagueId: n.currentLeague,
          toLeagueId: n.currentLeague,
          detail: `OVR:${ovr} | 서비스:${n.proServiceYears ?? 0}년`,
        });
        faRows.push({
          seasonYear,
          category: "fa",
          playerId: n.npcId,
          playerName: n.name,
          fromTeamId: prev,
          fromLeagueId: n.currentLeague,
          toTeamId: n.currentTeam,
          toLeagueId: n.currentLeague,
          detail: "FA 계약",
        });
      }
    }
    let _faDbOk = true;
    if (faRows.length > 0) {
      const faRes = JSON.parse(
        await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: faRows })),
      );
      if (faRes.error) {
        autoLog(`[NPC FA오류] ${faRes.error}`);
        _faDbOk = false;
      } else autoLog(`[NPC FA] FA 이동 ${faRows.length}명 DB ✓`);
    }
    if (_faEntries.length > 0) {
      logEvent({
        id: `fa-result-Y${seasonYear}`,
        type: "fa_result",
        seasonYear,
        players: _faEntries,
        counts: { input: beforeTeam.size, processed: _faEntries.length, saved: faRows.length },
        dbOk: _faDbOk,
        durationMs: Date.now() - _t0SeasonEnd,
      });
    }
  }

  // before/after 비교로 전역·입대 추출 및 careerEvents 기록
  const militaryEnlistedSports: string[] = [];
  const militaryEnlistedGeneral: string[] = [];
  const militaryDischargedNames: string[] = [];
  // 🔴 **전역의 정본은 Rust다** (사용자 확정 2026-08-24).
  //    엔진이 `military_discharge_year <= season_year`로 상태를 바꾸고,
  //    여기서는 그 **변화를 감지해 기록만** 남긴다.
  //    예전엔 아래에서 TS가 `enlistYear + 2`로 **따로 계산**해서,
  //    두 조건이 갈려 전역자가 43명이 됐다(상무 정원은 26).
  const rustDischargedIds = new Set<string>();
  const dischargeRows: import("../../types/save").LeagueTransactionRow[] = [];
  const _dischargeEntries: PlayerEventEntry[] = [];
  for (const n of result.npcs) {
    const before = beforeMilitary.get(n.npcId);
    if (!before) continue;
    const decIdx = nextNpcs.findIndex((d) => d.npcId === n.npcId);
    if (before.status === "현역" && n.militaryStatus !== "현역") {
      militaryDischargedNames.push(before.name);
      rustDischargedIds.add(n.npcId);
      const returnLeague = proLeagues.has(n.currentLeague) ? n.currentLeague : undefined;
      const _liveDis = _liveStats[n.npcId];
      const ovr = _liveDis?.pitching?.ovr ?? _liveDis?.batting?.ovr ?? 0;
      autoLog(
        `  [전역] ${before.name} | 군→${returnLeague?.replace("LEAGUE_", "") ?? "미확정"} | OVR:${ovr}`,
      );
      _dischargeEntries.push({
        npcId: n.npcId,
        name: n.name,
        fromLeagueId: before.league,
        toLeagueId: returnLeague,
        toTeamId: n.currentTeam,
        detail: `군→${returnLeague?.replace("LEAGUE_", "") ?? "미확정"} | OVR:${ovr}`,
      });
      dischargeRows.push({
        seasonYear,
        category: "military",
        playerId: n.npcId,
        playerName: n.name,
        fromLeagueId: before.league,
        toLeagueId: returnLeague,
        detail: "전역",
      });
      if (decIdx >= 0) {
        nextNpcs[decIdx] = {
          ...nextNpcs[decIdx],
          careerEvents: [
            ...(nextNpcs[decIdx].careerEvents ?? []),
            {
              year: seasonYear,
              eventType: "military_discharge" as const,
              toLeagueId: returnLeague,
            },
          ],
        };
      }
    } else if (before.status !== "현역" && n.militaryStatus === "현역") {
      if (decIdx >= 0) {
        nextNpcs[decIdx] = {
          ...nextNpcs[decIdx],
          careerEvents: [
            ...(nextNpcs[decIdx].careerEvents ?? []),
            {
              year: seasonYear,
              eventType: "military_enlist" as const,
              fromTeamId: before.team,
              fromLeagueId: before.league,
            },
          ],
        };
      }
    }
  }
  let _dischargeDbOk = true;
  if (slotId && dischargeRows.length > 0) {
    const milRes = JSON.parse(
      await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: dischargeRows })),
    );
    if (milRes.error) {
      autoLog(`[NPC전역오류] ${milRes.error}`);
      _dischargeDbOk = false;
    } else autoLog(`[NPC전역] ${dischargeRows.length}명 DB ✓`);
  }
  if (_dischargeEntries.length > 0) {
    logEvent({
      id: `discharge-Y${seasonYear}`,
      type: "discharge",
      seasonYear,
      players: _dischargeEntries,
      counts: {
        input: beforeMilitary.size,
        processed: _dischargeEntries.length,
        saved: dischargeRows.length,
      },
      dbOk: _dischargeDbOk,
      durationMs: Date.now() - _t0SeasonEnd,
    });
  }

  // ── Phase 4: 병역 통합 처리 (단일 소스: masterStore.entities) ─────────────
  if (slotId) {
    const mNow = get(masterStore);
    const npcMap = new Map(nextNpcs.map((n) => [n.npcId, n]));
    const npcLiveStats = get(npcLiveStatsStore);

    // Phase 4-0: 외국인 선수 면제 일괄 패치
    // 국적 기반 판별: originLeagueId ABL/JBL이면 외국인, notes에 "국적:한국"이면 한국인
    const isKoreanEntity = (e: import("../../stores/master").EntityRow): boolean => {
      if (e.notes?.includes("국적:한국")) return true;
      const orig = e.originLeagueId;
      if (orig === "LEAGUE_ABL" || orig === "LEAGUE_JBL") return false;
      return true;
    };
    const foreignExempt = mNow.entities.filter(
      (e) =>
        e.role === "player" &&
        !isKoreanEntity(e) &&
        e.militaryStatus !== "면제" &&
        e.militaryStatus !== "군필" &&
        e.militaryStatus !== "현역",
    );
    if (foreignExempt.length > 0) {
      const exemptedIdSet = new Set(foreignExempt.map((e) => e.id));
      for (let i = 0; i < nextNpcs.length; i++) {
        if (exemptedIdSet.has(nextNpcs[i].npcId) && nextNpcs[i].militaryStatus === "미필") {
          nextNpcs[i] = { ...nextNpcs[i], militaryStatus: "면제" };
        }
      }
      autoLog(`[외국인면제] ${foreignExempt.length}명 면제 처리`);
    }

    // 1. 전역: 2년 경과 모든 현역 선수 (top-level || 하위 호환 nested 체크)
    // ⚠ **위에서 Rust가 이미 전역시킨 사람만 본다.**
    //   예전엔 `enlistYear + 2`로 여기서 다시 계산했고, 그 조건이 Rust와
    //   갈려 **같은 사람이 해마다 다시 전역자로 잡혔다**(43명 · 정원 26).
    //   그 수가 상무 선발 Phase 1의 공백 목록으로 가서, 정원을 다 먹고
    //   **Phase 2(OVR 순)가 안 돌게** 만들었다.
    const discharging = mNow.entities.filter((e) => rustDischargedIds.has(e.id));
    const dischargedIds = new Set<string>();

    // ⚠ 거래 기록은 **위에서 `dischargeRows`로 이미 남겼다** — 여기서 또 남기면
    //   같은 전역이 두 번 쌓인다. 이 집합은 입대 후보 제외·공백 포지션에만 쓴다.
    discharging.forEach((e) => dischargedIds.add(e.id));
    if (discharging.length > 0) autoLog(`[전역] 엔티티 ${discharging.length}명`);

    // 2. 체육부대 입대: 프로 소속 한국인 선수 후보.
    //
    // **2군(FARM)도 후보다.** 예전엔 1군 리그만 봤는데, 실제로 상무는
    // 2군 유망주가 많이 간다. Phase 7-1에서 신인 대부분이 2군에서 시작하게
    // 되면서 그 누락이 더 커졌다 — 갓 지명된 선수는 후보조차 못 됐다
    const proLeagues = new Set([
      "LEAGUE_KBL",
      "LEAGUE_KBL_FARM",
      "LEAGUE_ABL",
      "LEAGUE_ABL_FARM",
      "LEAGUE_JBL",
      "LEAGUE_JBL_FARM",
    ]);
    const milCandidates = mNow.entities
      .filter(
        (e) =>
          e.role === "player" &&
          e.status !== "retired" &&
          e.militaryStatus !== "현역" &&
          e.militaryStatus !== "군필" &&
          e.militaryStatus !== "면제" &&
          e.details?.player?.militaryStatus !== "현역" &&
          !e.details?.player?.militaryEnlistYear &&
          proLeagues.has(e.leagueId ?? "") &&
          isKoreanEntity(e) &&
          e.teamId &&
          e.teamId !== "" &&
          !dischargedIds.has(e.id) &&
          // 한국 나이 기준 고졸 20세부터 (generation_rules.json ageBase 16 → 고3 = 19세).
          // 예전엔 18이었는데 그건 고3 나이라 재학생이 후보에 섞였다.
          e.age >= 20 &&
          e.age <= 29,
      )
      .map((e) => {
        const live = npcLiveStats[e.id];
        const dp = e.details?.player;
        const rawOvr =
          live?.pitching?.ovr ??
          live?.batting?.ovr ??
          (dp as any)?.pitching?.ovr ??
          (dp as any)?.batting?.ovr;
        const ovr = Math.round(typeof rawOvr === "number" && isFinite(rawOvr) ? rawOvr : 50);
        return {
          id: e.id,
          name: e.name || e.id,
          ovr,
          teamId: e.teamId!,
          position: (dp?.position ?? "") as string,
          isProtagonist: false,
        };
      });
    autoLog(`[병역통합] 체육부대 후보 ${milCandidates.length}명`);

    const selectedSportsIds = new Set<string>();

    if (milCandidates.length > 0) {
      const topRaw = JSON.parse(
        await window.projectB!.militaryCalcCandidates(
          JSON.stringify({
            candidates: milCandidates,
            topN: 70,
          }),
        ),
      ) as {
        topCandidates?: { id: string; name: string; ovr: number; teamId: string }[];
        error?: string;
      };

      if (topRaw.error) {
        autoLog(`[병역통합오류] militaryCalcCandidates: ${topRaw.error}`);
      } else if ((topRaw.topCandidates?.length ?? 0) > 0) {
        // 연간 입대 인원 = 정원 / 복무연수. 예전엔 여기 20이 박혀 있어
        // 정상상태가 40명(정원 26의 1.5배)이었다 — 상무는 복무자라
        // `career_status: "military"`고, 로스터 캡이 active만 세므로
        // **아무도 막지 않았다.** 규칙 파일이 정본이다.
        //
        // ⚠ 계산을 여기서 다시 적지 않는다 — 주인공 경로(`advanceWeek`)와
        // **같은 함수**를 쓴다. 따로 적었더니 그쪽만 10으로 박혀 있었다.
        const milLimits = await sportsUnitLimits();
        const milSalary = milLimits.salary;
        // ⚠ **주인공이 뽑힌 해엔 한 자리를 뺀다.** 두 선발이 별개 추첨이라
        // 둘 다 뽑히면 그 해 입대가 정원 + 1이 된다 — 상무는 로스터 캡이
        // 안 걸리니 이런 누수가 해마다 쌓인다.
        const protoTook = protagonistTookSportsSlot(get({ subscribe }).protagonist, seasonYear);
        const npcIntake = Math.max(0, milLimits.annualIntake - (protoTook ? 1 : 0));

        const selRes =
          npcIntake === 0
            ? { selectedIds: [] }
            : (JSON.parse(
                await window.projectB!.militaryCalcSelection(
                  JSON.stringify({
                    applicants: topRaw.topCandidates!.map((c) => ({ ...c, isProtagonist: false })),
                    maxTotal: Math.min(npcIntake, topRaw.topCandidates!.length),
                    maxPerTeam: milLimits.maxPerTeam,
                    // 🔴 **상무 전역자 포지션만.** 안 넘기면 Phase 1(공백 메우기)이
                    //    통째로 안 돌고 OVR 순으로만 뽑는다 — 상무가 포지션 균형을 잃는다.
                    //
                    // ⚠ **거르는 규칙은 `sportsVacatingPositions`가 정본이다.**
                    //   여기 인라인으로 적었더니 주인공 경로(`advanceWeek`)에는
                    //   아예 안 넘어가서 **주인공만 다른 잣대**로 뽑혔다.
                    vacatingPositions: sportsVacatingPositions(discharging),
                    // 🔴 **Phase 1 몫을 자른다.** 없으면 Phase 1이 정원을 다 먹고
                    //    Phase 2(OVR 순 + 팀당 상한)가 한 번도 안 돈다.
                    phase1Max: milLimits.phase1Max,
                  }),
                ),
              ) as { protagonistSelected?: boolean; selectedIds?: string[]; error?: string });

        if (selRes.error) {
          autoLog(`[병역통합오류] militaryCalcSelection: ${selRes.error}`);
        } else if ((selRes.selectedIds?.length ?? 0) > 0) {
          const selectedSet = new Set(selRes.selectedIds!);
          const enlTxRows: import("../../types/save").LeagueTransactionRow[] = [];

          const sportsEnlistEntities = mNow.entities
            .filter((e) => selectedSet.has(e.id))
            .map((e) => ({
              ...e,
              militaryStatus: "현역" as const,
              // 상무는 **독립리그 소속**이고 ID는 refs의 실제 팀이다.
              // 예전엔 LEAGUE_UNIVERSITY / TEAM_SPORTS_UNIT 이었는데
              // 그 팀은 refs에 없어서 입대자가 존재하지 않는 팀으로 갔다
              leagueId: SANGMU_LEAGUE_ID,
              teamId: SANGMU_TEAM_ID,
              details: {
                ...e.details,
                player: {
                  ...e.details?.player,
                  militaryStatus: "현역",
                  militaryUnit: "sports",
                  militaryEnlistYear: seasonYear,
                  originalLeagueId: e.leagueId,
                  originalTeamId: e.teamId,
                },
              },
              slotId,
            }));

          const _sportsEntries: PlayerEventEntry[] = [];

          if (sportsEnlistEntities.length > 0) {
            sportsEnlistEntities.forEach((e) => {
              selectedSportsIds.add(e.id);
              militaryEnlistedSports.push(e.name);
              const orig = mNow.entities.find((o) => o.id === e.id)!;
              const live = npcLiveStats[e.id];
              const dp = e.details?.player;
              const rawOvr =
                live?.pitching?.ovr ??
                live?.batting?.ovr ??
                (dp as any)?.pitching?.ovr ??
                (dp as any)?.batting?.ovr;
              const ovr = Math.round(typeof rawOvr === "number" && isFinite(rawOvr) ? rawOvr : 50);
              const fromShort = (orig.teamId ?? "").replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
              autoLog(`  [체육부대] ${e.name} | ${fromShort} | OVR:${ovr} | ${e.age ?? "?"}세`);
              _sportsEntries.push({
                npcId: e.id,
                name: e.name,
                fromTeamId: orig.teamId,
                fromLeagueId: orig.leagueId,
                toLeagueId: "LEAGUE_UNIVERSITY",
                detail: `OVR:${ovr} | ${e.age ?? "?"}세 | 제대예정 Y${seasonYear + 2}`,
              });
              enlTxRows.push({
                seasonYear,
                category: "military" as const,
                playerId: e.id,
                playerName: e.name,
                fromTeamId: orig.teamId,
                fromLeagueId: orig.leagueId,
                detail: "체육부대 입대",
              });
            });
          }

          // gameStore.npcs 동기화
          for (let i = 0; i < nextNpcs.length; i++) {
            if (!selectedSet.has(nextNpcs[i].npcId)) continue;
            // 🔴 **세이브가 이미 은퇴면 입대시키지 않는다.**
            //    후보는 마스터 `e.status`로 거르는데 `originalLeagueId`는
            //    세이브 `n.currentLeague`에서 온다 — 둘이 어긋나면
            //    **`LEAGUE_RETIRED`가 원소속으로 박히고**, 2년 뒤 전역할 때
            //    FA로 나와 갈 팀이 없어 **100% 미계약**이 된다.
            //    실측(2026-08-26): 전역 시즌마다 3~8명 · 전원이 전역자였다.
            if (
              nextNpcs[i].careerStatus !== "active" ||
              nextNpcs[i].currentLeague === "LEAGUE_RETIRED"
            )
              continue;
            const n = nextNpcs[i];
            nextNpcs[i] = {
              ...n,
              originalLeagueId: n.currentLeague,
              originalTeamId: n.currentTeam,
              careerStatus: "military",
              militaryStatus: "현역",
              militaryUnit: "sports",
              militaryEnlistYear: seasonYear,
              militaryDischargeYear: seasonYear + 2,
              // ⚠ 바로 위 entity 갱신은 `SANGMU_LEAGUE_ID`를 쓰는데 여기만
              // `"LEAGUE_UNIVERSITY"` 하드코딩이 남아 있었다 — 같은 선수의
              // 리그가 두 곳에서 달라져 팀(독립)과 어긋났다.
              // 2362줄 주석이 고쳤다고 적은 그 결함이 여기 그대로 있었다.
              currentLeague: SANGMU_LEAGUE_ID,
              currentTeam: SANGMU_TEAM_ID,
              // 🔴 **군인 봉급이다** (2026-08-31). 예전엔 원 소속 연봉을
              //   그대로 들고 왔다 — 실측에서 상무 최고연봉이 **9.97억**
              //   이었고 상위 6명이 전부 상무였다. 연봉 10억짜리 군인이다.
              //   `militaryRules.salary`(300만원)는 **생성된 26명에게만**
              //   걸리고 선발로 들어온 사람은 안 걸렸다.
              // ⚠ 전역할 때는 **새 계약**이다 — 원 소속 리그 기준으로
              //   엔진이 다시 잡는다(`npc_sim` 전역 처리). 새 세이브 칸을 안 만든다.
              currentSalary: milSalary,
            };
          }

          let _sportsDbOk = true;
          if (enlTxRows.length > 0) {
            const enlTxRes = JSON.parse(
              await window.projectB!.leagueAddTransactions(
                JSON.stringify({ slotId, rows: enlTxRows }),
              ),
            ) as { ok?: boolean; error?: string };
            if (enlTxRes.error) {
              autoLog(`[병역입대오류] TX 저장 실패: ${enlTxRes.error}`);
              _sportsDbOk = false;
            } else autoLog(`[체육부대입대] ${sportsEnlistEntities.length}명 DB ✓`);
          }
          if (_sportsEntries.length > 0) {
            logEvent({
              id: `enlist-sports-Y${seasonYear}`,
              type: "enlist_sports",
              seasonYear,
              players: _sportsEntries,
              counts: {
                input: milCandidates.length,
                processed: _sportsEntries.length,
                saved: enlTxRows.length,
              },
              dbOk: _sportsDbOk,
              durationMs: Date.now() - _t0SeasonEnd,
              extra: `후보풀 ${milCandidates.length}명 중 TOP70 → ${_sportsEntries.length}명 선발`,
            });
          }
        }
      }
    }

    // 3. 일반병 강제 입대
    const candidateIdSet = new Set(milCandidates.map((c) => c.id));
    const mGeneral = get(masterStore);

    // 공통 입대 자격 조건
    const isEnlistEligible = (e: import("../../stores/master").EntityRow) =>
      e.role === "player" &&
      e.status !== "retired" &&
      isKoreanEntity(e) &&
      e.militaryStatus !== "현역" &&
      e.militaryStatus !== "군필" &&
      e.militaryStatus !== "면제" &&
      e.details?.player?.militaryStatus !== "현역" &&
      !e.details?.player?.militaryEnlistYear &&
      !dischargedIds.has(e.id) &&
      !selectedSportsIds.has(e.id);

    // 프로리그(KBL/ABL/JBL): 28세+ 또는 체육부대 탈락 27세
    const generalPoolPro = mGeneral.entities.filter(
      (e) =>
        isEnlistEligible(e) &&
        proLeagues.has(e.leagueId ?? "") &&
        (e.age >= 28 || (e.age === 27 && candidateIdSet.has(e.id))),
    );

    // 독립/대학리그: 26세+ (프로 입단 가능성 낮아지기 전에 처리)
    const nonProMilLeagues = new Set(["LEAGUE_INDEPENDENT", "LEAGUE_UNIVERSITY"]);
    const generalPoolNonPro = mGeneral.entities.filter(
      (e) => isEnlistEligible(e) && nonProMilLeagues.has(e.leagueId ?? "") && e.age >= 26,
    );

    // KBL 조기 입대 자발적 선택 (25~27세, 주전 경쟁 탈락 선수)
    const earlyEnlistPool = mGeneral.entities.filter(
      (e) =>
        isEnlistEligible(e) &&
        e.leagueId === "LEAGUE_KBL" &&
        (e.age ?? 0) >= 25 &&
        (e.age ?? 0) <= 27,
    );
    const earlyEnlistEntities = await (async () => {
      if (earlyEnlistPool.length === 0) return [];
      // KBL 전체 OVR 정렬 → 상대 순위 계산
      const kblOvrs = mGeneral.entities
        .filter((e2) => e2.leagueId === "LEAGUE_KBL" && e2.role === "player")
        .map((e2) => {
          const ls = npcLiveStats[e2.id];
          return (
            ls?.pitching?.ovr ??
            ls?.batting?.ovr ??
            (e2.details?.player as any)?.pitching?.ovr ??
            (e2.details?.player as any)?.batting?.ovr ??
            50
          );
        })
        .sort((a, b) => a - b);
      const res = JSON.parse(
        await window.projectB!.militaryEarlyEnlistDecisions(
          JSON.stringify({
            candidates: earlyEnlistPool.map((e) => {
              const ls = npcLiveStats[e.id];
              const ovr =
                ls?.pitching?.ovr ??
                ls?.batting?.ovr ??
                (e.details?.player as any)?.pitching?.ovr ??
                (e.details?.player as any)?.batting?.ovr ??
                50;
              const idx = kblOvrs.findIndex((v) => v >= ovr);
              const ovrRankPct = kblOvrs.length > 0 ? (idx < 0 ? 1 : idx / kblOvrs.length) : 0.5;
              const dp = e.details?.player as any;
              return {
                id: e.id,
                age: e.age ?? 26,
                ovrRankPct,
                playingTimePct: 0.5,
                contractYearsLeft: dp?.contract?.remainingYears ?? 2,
              };
            }),
            seed: seasonYear + 100,
          }),
        ),
      ) as { earlyEnlistIds?: string[]; error?: string };
      if (res.error || !res.earlyEnlistIds) return [];
      const earlySet = new Set(res.earlyEnlistIds);
      return earlyEnlistPool.filter((e) => earlySet.has(e.id));
    })();
    if (earlyEnlistEntities.length > 0)
      autoLog(
        `[조기입대] KBL 25~27세 후보 ${earlyEnlistPool.length}명 → 자발적 선택 ${earlyEnlistEntities.length}명`,
      );

    const generalPool = [...generalPoolPro, ...generalPoolNonPro, ...earlyEnlistEntities];
    autoLog(
      `[일반병후보] 강제28세+ ${generalPoolPro.length}명 + 독립/대학26세+ ${generalPoolNonPro.length}명 + 조기입대 ${earlyEnlistEntities.length}명 = ${generalPool.length}명`,
    );

    // Rust LCG로 최대 30명 랜덤 선택
    const generalEnlistEntities = await (async () => {
      if (generalPool.length === 0) return [];
      if (generalPool.length <= 30) return generalPool;
      const pickRes = JSON.parse(
        await window.projectB!.militaryPickGeneral(
          JSON.stringify({
            ids: generalPool.map((e) => e.id),
            maxCount: 30,
            seed: seasonYear,
          }),
        ),
      ) as { selectedIds?: string[]; error?: string };
      if (pickRes.error || !pickRes.selectedIds) return generalPool.slice(0, 30);
      const pickedSet = new Set(pickRes.selectedIds);
      return generalPool.filter((e) => pickedSet.has(e.id));
    })();

    if (generalEnlistEntities.length > 0) {
      const _generalEntries: PlayerEventEntry[] = [];
      const genTxRows = generalEnlistEntities.map((e) => ({
        seasonYear,
        category: "military" as const,
        playerId: e.id,
        playerName: e.name,
        fromTeamId: e.teamId,
        fromLeagueId: e.leagueId,
        detail: "일반병 입대",
      }));
      let _generalDbOk = true;
      const genTxRes = JSON.parse(
        await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: genTxRows })),
      ) as { ok?: boolean; error?: string };
      if (genTxRes.error) {
        autoLog(`[일반병입대오류] TX: ${genTxRes.error}`);
        _generalDbOk = false;
      }

      const genIdSet = new Set(generalEnlistEntities.map((e) => e.id));
      generalEnlistEntities.forEach((e) => {
        militaryEnlistedGeneral.push(e.name);
        const fromShort = (e.teamId ?? "").replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
        const live = npcLiveStats[e.id];
        const dp = e.details?.player;
        const rawOvr =
          live?.pitching?.ovr ??
          live?.batting?.ovr ??
          (dp as any)?.pitching?.ovr ??
          (dp as any)?.batting?.ovr;
        const ovr = Math.round(typeof rawOvr === "number" && isFinite(rawOvr) ? rawOvr : 50);
        autoLog(`  [일반병] ${e.name} | ${fromShort} | OVR:${ovr} | ${e.age ?? "?"}세`);
        _generalEntries.push({
          npcId: e.id,
          name: e.name,
          fromTeamId: e.teamId,
          fromLeagueId: e.leagueId,
          toLeagueId: "LEAGUE_MILITARY",
          detail: `OVR:${ovr} | ${e.age ?? "?"}세 | 제대예정 Y${seasonYear + 2}`,
        });
      });
      for (let i = 0; i < nextNpcs.length; i++) {
        if (!genIdSet.has(nextNpcs[i].npcId)) continue;
        // 🔴 **세이브가 이미 은퇴면 입대시키지 않는다.**
        //    후보는 마스터 `e.status`로 거르는데 `originalLeagueId`는
        //    세이브 `n.currentLeague`에서 온다 — 둘이 어긋나면
        //    **`LEAGUE_RETIRED`가 원소속으로 박히고**, 2년 뒤 전역할 때
        //    FA로 나와 갈 팀이 없어 **100% 미계약**이 된다.
        //    실측(2026-08-26): 전역 시즌마다 3~8명 · 전원이 전역자였다.
        if (nextNpcs[i].careerStatus !== "active" || nextNpcs[i].currentLeague === "LEAGUE_RETIRED")
          continue;
        const n = nextNpcs[i];
        nextNpcs[i] = {
          ...n,
          originalLeagueId: n.currentLeague,
          originalTeamId: n.currentTeam,
          careerStatus: "military",
          militaryStatus: "현역",
          militaryUnit: "general",
          militaryEnlistYear: seasonYear,
          militaryDischargeYear: seasonYear + 2,
          currentLeague: "LEAGUE_MILITARY",
          currentTeam: "",
        };
      }
      autoLog(
        `[일반병입대] ${generalEnlistEntities.length}명 (후보 ${generalPool.length}명 중) ${_generalDbOk ? "DB ✓" : "DB ✗"}`,
      );
      if (_generalEntries.length > 0) {
        logEvent({
          id: `enlist-general-Y${seasonYear}`,
          type: "enlist_general",
          seasonYear,
          players: _generalEntries,
          counts: {
            input: generalPool.length,
            processed: _generalEntries.length,
            saved: _generalEntries.length,
          },
          dbOk: _generalDbOk,
          durationMs: Date.now() - _t0SeasonEnd,
          extra: `후보 ${generalPool.length}명 중 ${_generalEntries.length}명 입대`,
        });
      }
    }
  }

  (window as any).__lastOffseasonSummary = {
    militaryEnlistedSports,
    militaryEnlistedGeneral,
    militaryDischargedNames,
  };

  logVerify(`Y${seasonYear} 시즌종료 오프시즌 완료 (${Date.now() - _t0SeasonEnd}ms)`, [
    { name: `FA이동 ${_faEntries.length}명`, ok: true },
    { name: `전역 ${_dischargeEntries.length}명`, ok: _dischargeDbOk },
    { name: `체육부대 ${militaryEnlistedSports.length}명`, ok: true },
    { name: `일반병 ${militaryEnlistedGeneral.length}명`, ok: true },
  ]);

  update((st) => ({
    ...st,
    npcs: nextNpcs,
    pendingDraft: result.pendingDraft,
    seasonEndSummary: result.summary,
    logs: [...result.logs, ...st.logs].slice(0, 30),
    mailbox: result.mailboxEntry ? pushMailbox([result.mailboxEntry], st.mailbox) : st.mailbox,
  }));

  // ── 스태프 생애주기 (Phase 6B) ─────────────────────────
  // 이 566줄과 얽히지 않는다 — 스태프는 병역·FA·드래프트에 의존하지 않으므로
  // usecases/seasonEnd/staffLifecycle.ts에서 독립적으로 처리하고 여기서 호출만 한다.
  try {
    const slotId = get({ subscribe }).currentSlotId;
    if (slotId) {
      const { processStaffSeasonEnd, describeStaffEvent } =
        await import("../../usecases/seasonEnd/staffLifecycle");
      const { seasonStore } = await import("../../stores/season");
      const seasonNow = get(seasonStore);
      const r = await processStaffSeasonEnd(
        slotId,
        seasonYear,
        seasonNow.worldSeed ?? 0,
        seasonNow.staffSlumpSeasons ?? {},
      );
      seasonStore.setStaffSlumpSeasons(r.slumpSeasons);

      if (r.events.length > 0) {
        const teamName = (id: string) =>
          get(masterStore).teams.find((t) => t.id === id)?.name ?? id;
        const lines = r.events.map((e) => describeStaffEvent(e, teamName)).filter(Boolean);
        update((st) => ({
          ...st,
          logs: [...lines.slice(0, 8), ...st.logs].slice(0, 30),
        }));
      }
    }
  } catch (e) {
    // 스태프 처리가 실패해도 시즌 종료 자체는 끝나야 한다 — 여기서 던지면
    // 병역·FA까지 다 처리한 시즌이 통째로 롤백된다
    console.error("[processAllLeaguesSeasonEnd] 스태프 생애주기 실패", e);
  }

  // ── 관계도 시즌 총평 + 비접촉 감쇠 (Phase 6C) ──────────
  // 스태프 생애주기 **다음에** 돈다. 은퇴·경질로 사라진 사람을 ended로
  // 접은 뒤에 총평을 얹어야 이미 떠난 감독에게 시즌 평가가 붙지 않는다.
  try {
    const st = get({ subscribe });
    const slotId = st.currentSlotId;
    if (slotId) {
      const { applySeasonRelations, endRelationships } =
        await import("../../usecases/relationships");
      const { seasonStore } = await import("../../stores/season");
      const seasonNow = get(seasonStore);

      // 사라진 상대를 먼저 동결한다 (값은 기록으로 남는다)
      const { slotRepo } = await import("../../repo/slotRepo");
      const activeStaff = new Set(
        (await slotRepo.getStaff(slotId, { status: "active" })).map((x) => x.staffId),
      );
      const rows = await slotRepo.getRelationships(slotId);
      const gone = rows
        .filter(
          (r) =>
            r.contact !== "ended" &&
            (r.kind === "manager" || r.kind === "coach" || r.kind === "owner") &&
            !activeStaff.has(r.personId),
        )
        .map((r) => r.personId);
      if (gone.length > 0) await endRelationships(slotId, gone);

      const myStats =
        (seasonNow.stats[st.protagonist.id] as
          import("../../types/save").PitcherSeasonStats | null) ?? null;
      const standings = seasonNow.standings ?? [];
      const myIdx = standings.findIndex((x) => x.teamId === st.protagonist.teamId);
      // 순위를 못 찾으면 중간(0.5)으로 둔다 — 구단주 관계가 임의로 요동치는 것보다 낫다
      const rankPct = myIdx >= 0 && standings.length > 1 ? myIdx / (standings.length - 1) : 0.5;

      await applySeasonRelations({
        slotId,
        week: 52,
        era: myStats?.era ?? 0,
        teamRankPct: rankPct,
        pitchedAny: (myStats?.ip ?? 0) > 0,
      });
    }
  } catch (e) {
    console.error("[processAllLeaguesSeasonEnd] 관계도 시즌 처리 실패", e);
  }
}
