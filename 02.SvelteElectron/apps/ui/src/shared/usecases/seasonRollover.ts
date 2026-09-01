// ── 시즌 롤오버 (오프시즌) ────────────────────────────────────
//
// 이 로직은 원래 `features/season-end/ui/SeasonEndModal.svelte` **안에** 있었다.
// 그래서 헤드리스로 부를 수가 없었고, Phase 8 계측이 오프시즌만 통째로
// 비워둔 채 진행됐다 (PHASE8_PLAN §P8-0 "못 재는 것").
//
// 여기로 옮긴 이유는 두 가지다:
//  1. 잴 수 있게 — `measure:perf`가 시즌 경계를 넘을 수 있다
//  2. 시험할 수 있게 — 컴포넌트를 띄우지 않고 회귀를 걸 수 있다
//
// 모달에는 **표시와 사용자 선택만** 남는다. 세계를 바꾸는 건 전부 여기다.

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { runSeasonEndBgProcessing } from "./runAutoAdvance";
import { autoLog } from "../stores/autoAdvance";
import { DEFAULT_TEAM_PROFILE } from "./weekPhases/market";
import { applySeasonAwards } from "./seasonAwards";
import { applyProtagonistSeasonRecord } from "./seasonCareerRecord";
import { bracketFinalists } from "../utils/bracket";
import { finalistsOf } from "../utils/tournamentView";
import { TOURNAMENTS } from "../utils/leagueTeams.generated";
import { leagueStandingsOf } from "../utils/season-helpers";
import { draftDestinationTeams } from "../utils/draftSystem";
import { proSchedule } from "./proSeason";
import { dischargeProtagonist, openMilitarySeason } from "./militaryDecision";
import type { PitcherSeasonStats, BatterSeasonStats } from "../types/save";
// 🔴 팀 목록의 정본 — refs 에서 1군/2군을 **나눠 담는다**.
//   `masterStore.teams` 를 `leagueId` 로 거르면 둘이 같이 딸려온다
import { ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";

/**
 * 세계 오프시즌을 한 해에 한 번만 돌게 하는 가드.
 *
 * `applySeasonHistory`·`processAllLeaguesSeasonEnd`엔 각자 방어가 있지만
 * `applyAgingDecay`·`runSeasonEndBgProcessing`엔 없다.
 */
let _lastWorldSeasonEndYear = -1;

/** 세계 처리 로그를 자동 진행 로그로 흘린다 */
function logsOf(lines: string[]): void {
  for (const l of lines) autoLog(l);
}

/**
 * **세계 오프시즌** — 주인공이 무엇을 하든 매 시즌 끝에 반드시 도는 처리.
 *
 * ⚠ 예전엔 이 순서가 **세 분기에 각각** 적혀 있었고(military·프로·학생),
 * 그중 어디도 안 타는 경로가 있었다. `acceptDraftOffer`가 `openProSeason`으로
 * 다음 해를 직접 열기 때문에 **주인공이 지명된 해엔 통째로 건너뛰었다** —
 * 실측: 그 해 NPC 사건이 `fa_signed 6`뿐이고 드래프트·은퇴·이적·연도기록이
 * 전부 없었으며 주인공 나이도 안 올랐다.
 *
 * 이제 정본은 여기 하나다. 롤오버와 진로 결정 양쪽에서 부르고, 연도 가드가
 * 중복 실행을 막는다.
 */
/**
 * 시즌 기록이 아직 온전한 **마지막 지점**에서 불리는 계측 훅.
 *
 * ⚠ 계측 전용이다 — 운영 코드가 여기 붙으면 안 된다.
 *
 * 왜 필요한가: 조사 하네스는 `isSeasonEnded()`를 보고 롤오버 직전에
 * 스냅샷을 잡는데, **주인공 3학년은 그 갈래를 안 탄다.** W47 진로 결정
 * 경로가 `runWorldSeasonEnd`를 직접 부르고 끝내기 때문이다. 그래서 고교
 * **마지막 해 성적을 한 번도 못 잡았고**, 실측 표본이 늘 1·2학년뿐이었다.
 *
 * W47에 잡는 우회는 시즌이 5주 모자란 값을 준다(이닝 과소·ERA 노이즈).
 * 3학년은 드래프트 직전 해라 그 해 완주 성적이 제일 중요하다.
 */
let _beforeSeasonEndHook: ((year: number) => void) | null = null;
export function setBeforeSeasonEndHook(fn: ((year: number) => void) | null): void {
  _beforeSeasonEndHook = fn;
}

/**
 * 시즌 종료 처리가 **다 끝난 뒤**에 불리는 계측 훅.
 *
 * ⚠ 계측 전용이다 — 운영 코드가 여기 붙으면 안 된다.
 *
 * `setBeforeSeasonEndHook`과 **짝이지 대체가 아니다.** 저쪽은 성적이 온전한
 * 지점(처리 앞)이고, 이쪽은 **롤오버가 만든 값**을 보는 자리다 —
 * 순위·구단 성향·압박·목표 순위·연속 기록은 `updateProTeamProfiles()`가
 * 돌고 난 뒤에야 생긴다.
 *
 * 왜 필요한가: 하네스가 `isSeasonEnded()`를 보고 잡으면 **주인공이 진로를
 * 정하는 해를 통째로 놓친다.** `pushCareerForward`가 드래프트 통보 뒤로
 * 시즌을 넘겼 때 실측한 것: `S2028 W32 → S2029 W0` — 2028 종료를 안 거친다.
 * 그 해만 표본이 비면 연속 실패·연속 우승 같은 **누적 값을 영영 못 재다.**
 */
let _afterSeasonEndHook: ((year: number) => void) | null = null;
export function setAfterSeasonEndHook(fn: ((year: number) => void) | null): void {
  _afterSeasonEndHook = fn;
}

export async function runWorldSeasonEnd(now: number): Promise<void> {
  if (_lastWorldSeasonEndYear === now) return;
  _lastWorldSeasonEndYear = now;

  // ⚠ **가드 뒤, 처리 앞.** 가드 앞이면 같은 해에 두 번 잡히고,
  // `processSeasonEnd` 뒤면 이미 진급·초기화가 지나 기록이 사라진다
  try { _beforeSeasonEndHook?.(now); } catch { /* 계측이 게임을 깨지 않는다 */ }

  // ⓪ NPC 학년 진급·졸업·나이 — **드래프트보다 먼저**.
  //
  // ⚠ 이게 빠져 있어서 A 수정이 절반만 들었다. 진로 결정 경로에서
  // `runWorldSeasonEnd`를 부를 때 아직 졸업 처리가 안 돼 **졸업생이 드래프트
  // 풀에 없었다** — 그 해 `quit_baseball`이 정상(950)의 12%인 116건이었다.
  // 정상 롤오버는 이미 부르므로 `lastSeasonEndYear` 가드가 중복을 막는다.
  await gameStore.processSeasonEnd(now);

  // NPC 드래프트는 **오프시즌보다 먼저** 돌아야 한다 — 오프시즌이 미지명자
  // 진로를 배정하므로, 드래프트가 뒤에 오면 이미 흩어진 뒤가 된다.
  // W47 관전에서 이미 돌았으면 `lastDraftYear` 가드가 건너뛴다.
  {
    const { univIds, indIds } = draftDestinationTeams(get(masterStore).teams);
    await gameStore.processNpcDraft(now, univIds, indIds);
  }

  const leagueStats: Record<string, Record<string, import("../types/save").PlayerSeasonStats>> = {};
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) leagueStats[lid] = ls.stats;
  gameStore.applySeasonHistory(get(seasonStore).stats, leagueStats, now);

  await seasonStore.flushAllLeagueStatsToDb(now);
  await saveSeasonHistory(now);
  await gameStore.processAllLeaguesSeasonEnd(now);  // ← 여기서 __lastOffseasonSummary 세팅
  // ⚠ **주인공 시즌 기록은 여기서 남긴다.** 예전엔 `SeasonEndModal`이 유일한
  // 호출부라 결산 화면을 열어야만 `careerRecords`가 쌓였고, 자동 진행에선
  // 은퇴할 때까지 한 줄도 없었다. 수상보다 **먼저**여야 얹을 자리가 생긴다
  applyProtagonistSeasonRecord(now);
  // 수상은 연도 기록이 만들어진 **뒤**여야 얹을 자리가 있다
  logsOf(await applySeasonAwards(now));
  // 🔴 **수상 뒤여야 한다.** 헌액 점수는 `careerHistory[].highlights` 를
  //   세는데 그 문자열을 `applySeasonAwards` 가 방금 넣었다.
  //   앞에 두면 그 해 수상이 점수에 안 들어간다.
  // ── 웨이버 공시 소식 (A단계) ───────────────────────────
  //
  // 웨이버는 Rust 가 `career_events` 에 `waiver_claim` 으로 남긴다.
  // ⚠ **주인공 팀이 걸린 것만** 보낸다 — 리그 전체는 실측 105~232명이라
  //   그대로 보내면 소식함이 한 해에 막힌다.
  {
    const gW = get(gameStore);
    const mW = get(masterStore);
    const myTeam = gW.protagonist.teamId;
    const teamName = (id: string) =>
      mW.teams.find((t) => t.id === id)?.name ?? id;
    // ⚠ **영입만 센다.** Rust `waiver_claim` 이 `from_team_id: None` 을
    //   넣어서 **어디서 왔는지 모른다** — 방출 시점의 팀을 안 넘긴다.
    //   "우리 팀에서 나갔다"를 세려다 **죽은 갈래**를 만들 뻔했다.
    //   나가는 쪽은 방출 소식이 이미 알린다.
    const inbound: string[] = [];
    for (const n of gW.npcs ?? []) {
      const evs = (n as { careerEvents?: { eventType?: string; year?: number;
        toTeamId?: string; fromTeamId?: string }[] }).careerEvents ?? [];
      for (const e of evs) {
        if (e.eventType !== "waiver_claim" || e.year !== now) continue;
        if (e.toTeamId === myTeam) inbound.push(n.name);
      }
    }
    // 원소속 재계약 — **시장에서 못 구해 돌아온 사람들** (A단계 3/6)
    //
    // ⚠ `fa_signed` 는 **FA 취득에도 쓰인다.** `detail` 로 갈라야 한다 —
    //   이벤트 종류만 보면 FA 를 얻은 사람까지 "재계약"으로 센다.
    // ⚠ 주인공 팀 것만. 실측 미계약자가 한 해 652건이다.
    {
      const resigned: string[] = [];
      for (const n of gW.npcs ?? []) {
        const evs = (n as { careerEvents?: { eventType?: string; year?: number;
          toTeamId?: string; detail?: string }[] }).careerEvents ?? [];
        for (const e of evs) {
          if (e.eventType !== "fa_signed" || e.year !== now) continue;
          if (!String(e.detail ?? "").includes("원소속 재계약")) continue;
          if (e.toTeamId === myTeam) resigned.push(n.name);
        }
      }
      // 독립리그 재도전 — **우리 팀을 떠나 독립으로 간 사람** (남은 3건)
      //
      // ⚠ `transfer` 는 트레이드·이적에도 쓰인다. `detail` 로 갈라야 한다 —
      //   재계약(`fa_signed`)과 같은 형태다.
      // ⚠ 원소속이 우리 팀이었는지는 `fromTeamId` 로 본다 — 웨이버와 달리
      //   여긴 Rust 가 원 소속을 넣는다(확인함).
      {
        const toIndie: string[] = [];
        for (const n of gW.npcs ?? []) {
          const evs = (n as { careerEvents?: { eventType?: string; year?: number;
            fromTeamId?: string; detail?: string }[] }).careerEvents ?? [];
          for (const e of evs) {
            if (e.eventType !== "transfer" || e.year !== now) continue;
            if (!String(e.detail ?? "").includes("독립리그 재도전")) continue;
            if (e.fromTeamId === myTeam) toIndie.push(n.name);
          }
        }
        if (toIndie.length > 0) {
          gameStore.addMessage({
            id: `msg-indie-retry-${now}-${myTeam}`,
            category: "system",
            sender: "리그 사무국",
            subject: `독립리그 재도전 ${toIndie.length}명`,
            preview: `${toIndie[0]}${toIndie.length > 1 ? ` 외 ${toIndie.length - 1}명` : ""}`,
            body: ["■ FA 계약처를 못 찾아 독립리그로 갔다", "",
              ...toIndie.map((x) => `   ${x}`)].join(String.fromCharCode(10)),
            createdAt: `W1`,
            readAt: null,
          });
        }
      }

      if (resigned.length > 0) {
        gameStore.addMessage({
          id: `msg-resign-${now}-${myTeam}`,
          category: "system",
          sender: "구단 사무국",
          subject: `FA 잔류 ${resigned.length}명`,
          preview: `${resigned[0]}${resigned.length > 1 ? ` 외 ${resigned.length - 1}명` : ""} 잔류`,
          body: [`■ 시장에서 계약처를 못 찾아 원소속으로 돌아왔다`, "",
            ...resigned.map((x) => `   ${x}`)].join("\n"),
          createdAt: `W1`,
          readAt: null,
        });
      }
    }

    if (inbound.length > 0) {
      const lines: string[] = [];
      lines.push(`■ 웨이버 영입 ${inbound.length}명`, ...inbound.map((x) => `   ${x}`));
      gameStore.addMessage({
        id: `msg-waiver-${now}-${myTeam}`,
        category: "system",
        sender: "리그 사무국",
        subject: `웨이버 영입 ${inbound.length}명 — ${teamName(myTeam)}`,
        preview: `${inbound[0]}${inbound.length > 1 ? ` 외 ${inbound.length - 1}명` : ""} 영입`,
        body: lines.join("\n"),
        createdAt: `W1`,
        readAt: null,
      });
    }
  }

  try {
    const { inductHallOfFame } = await import("./hallOfFame");
    for (const line of await inductHallOfFame(now)) autoLog(line);
  } catch (e) {
    console.warn("[hallOfFame] 심사 실패:", e);
  }
  // 🔴 **등록말소 기록을 비운다.** `weekNum` 이 시즌마다 리셋되므로
  //   작년 기록을 두면 `올해W32 - 작년W48 = -16` 로 영원히 락이 된다.
  gameStore.clearDemotions();
  await gameStore.applyAgingDecay();
  await updateProTeamProfiles();

  // 🔴 **구단 재정 정산** (4-C · 2026-08-29). 시즌에 한 번이다.
  // ⚠ **성향 갱신 뒤**에 온다 — 관중이 `marketAppeal`·`prestige`를 보므로
  //   그 해 값으로 재야 한다.
  try {
    const { settleClubFinance } = await import("./clubFinance");
    for (const line of await settleClubFinance(now)) autoLog(line);
  } catch (e) {
    // 정산이 실패해도 시즌 종료는 계속돼야 한다
    console.warn("[clubFinance] 정산 실패:", e);
  }
  await runSeasonEndBgProcessing(now);

  // ⚠ **모든 처리 뒤.** 앞에 두면 압박·목표가 아직 지난 시즌 값이다
  try { _afterSeasonEndHook?.(now); } catch { /* 계측이 게임을 깨지 않는다 */ }
}

/**
 * 시즌 성적으로 구단 성향을 갱신한다 — **팀 개성이 생기는 유일한 경로**.
 *
 * ⚠ `calc_win_now_pressure_update`는 구현돼 있는데 **아무도 안 불렀다.**
 * `initProTeamProfiles`·`patchProTeamProfile`도 호출부가 없어서
 * `gameStore.proTeamProfiles`는 항상 비어 있었고, refs.json에도
 * `proTeamProfile`이 없어 **전 팀이 `DEFAULT_TEAM_PROFILE`(전 항목 50)** 로
 * 떨어졌다.
 *
 * 그 결과가 트레이드 소멸이다. buyer 조건이
 * `rank_pct <= 0.30 && win_now_pressure > 60`인데 모두가 정확히 50이라
 * **buyer가 구조적으로 0팀**이었다 — seller만 남으면 거래 상대가 없다.
 * 실측 트레이드: 9 → 8 → 2 → 1 → 1 → 0.
 *
 * 같은 프로필을 승강 임계값(`10.0 - win_now_pressure * 0.05`)·방출·FA 입찰도
 * 읽으므로, 눌려 있는 동안 그쪽 판단도 전부 중립이었다.
 */
async function updateProTeamProfiles(): Promise<void> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);

  for (const leagueId of ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]) {
    const standings = leagueStandingsOf(s, leagueId);
    if (standings.length === 0) continue;
    const sorted = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

    // ── 목표 순위 — **지출과 우승 이력에서 유도한다** ──────────────
    //
    // 🔴 예전엔 절대 순위만 봐서 **예산 큰 팀도 중위권이면 +2**로 만족했다.
    // 실측 KBL 지출 지수가 1.5 ~ 0.52로 3배 벌어져 있는데 기대는 같았다.
    //
    // 리그 안 상대 위치로 낸다 — 새 상수가 없다. 지출 "순위"로 하면 동점이
    // 많아(0.99가 3팀 · 0.9가 4팀) 자의적이라 **연속값**으로 뽑는다.
    //
    // ⚠ 이 주석은 **틀렸었다** — "해외는 예산이 없다"고 적혀 있었다.
    //   실측(2026-08-29): 1군 전 팀에 있다. KBL 10/10 · ABL 16/16 · JBL 12/12.
    //   KBL 120~350억 · ABL 798~2759억 · JBL 425~1393억.
    //   **해외도 이 계산을 제대로 탄다.** 아래 폴백은 2군처럼 예산이 없는
    //   팀(그건 정상이다)과 전 팀이 같은 값일 때를 위한 것이다.
    const deviationWeight = await (async () => {
      try {
        const { loadRosterRules } = await import("../repo/newGameV3");
        const r = await loadRosterRules() as { promotionRules?: { pressureDeviationWeight?: number } };
        return r.promotionRules?.pressureDeviationWeight ?? 0;
      } catch { return 0; }
    })();
    const targetOf = new Map<string, number>();
    {
      const budgets = sorted.map((st) => ({
        teamId: st.teamId,
        idx: m.teams.find((t) => t.id === st.teamId)?.history?.budget ?? 0,
      }));
      const vals = budgets.map((b2) => b2.idx).filter((v) => v > 0);
      const lo = vals.length ? Math.min(...vals) : 0;
      const hi = vals.length ? Math.max(...vals) : 0;
      for (const b2 of budgets) {
        // 예산이 없거나 전 팀이 같으면 중위권을 목표로 — 예전 동작과 같아진다
        if (!b2.idx || hi <= lo) { targetOf.set(b2.teamId, sorted.length / 2); continue; }
        const t = 1 + (sorted.length - 1) * ((hi - b2.idx) / (hi - lo));
        // 연속 우승만큼 기대가 올라간다 (1위가 하한)
        const titles = g.teamStreaks[b2.teamId]?.titles ?? 0;
        targetOf.set(b2.teamId, Math.max(1, t - titles));
      }
      // 계측·화면이 읽을 수 있게 담는다 — 같은 식을 두 번 구현하지 않는다.
      //
      // ⚠ **이 사본은 판정에 안 쓰인다.** 압박 계산은 아래에서 지역 변수
      //   `targetOf`를 그대로 읽는다(`targetStanding:`). 그래서 세이브에 안 담겨도
      //   괜찮다 — 시즌 종료마다 여기서 다시 계산되고 바로 쓰인다.
      //
      // 실측(2026-08-24 · 씨앗 424242): 시즌 중(S2027 W32)에 세이브 왕복을 하면
      //   `teamTargets`가 **38 → 0**으로 비지만, 그 시즌 종료의 목표는 여전히
      //   **1~10위**로 정상이었다(2027·2028 둘 다). 롬드 직후에 오프시즌이
      //   목표를 0으로 읽는 창은 생기지 않는다.
      //
      // ⚠ 화면은 아직 이걸 안 읽는다 — 지금 읽는 건 계측(`perfEntry`)뿐이다.
      gameStore.setTeamTargets(Object.fromEntries(targetOf));
    }

    for (let i = 0; i < sorted.length; i++) {
      const teamId = sorted[i].teamId;
      const cur = g.proTeamProfiles[teamId]
        ?? m.teams.find((t) => t.id === teamId)?.proTeamProfile
        ?? DEFAULT_TEAM_PROFILE;
      // 이번 시즌 결과로 연속 기록을 갱신한다. **압박에 넘기기 전에** 센다 —
      // 올해 실패면 올해 것까지 세어야 그 압박이 반영된다
      const prev = g.teamStreaks[teamId] ?? { missedPlayoffs: 0, titles: 0 };
      const madePlayoffs = (i + 1) <= Math.floor(sorted.length / 2);
      const streak = {
        missedPlayoffs: madePlayoffs ? 0 : prev.missedPlayoffs + 1,
        titles: i === 0 ? prev.titles + 1 : 0,
      };
      gameStore.patchTeamStreak(teamId, streak);
      const raw = await window.projectB!.engine("calcWinNowPressureUpdateNative", JSON.stringify({
        currentPressure: cur.winNowPressure,
        ownerPatience: cur.ownerPatience,
        finalStanding: i + 1,
        totalTeams: sorted.length,
        // 🔴 **연속 기록을 실제로 센다.** 예전엔 0이 하드코딩이라 연속 하위권
        // 팀이 추가 압박을 못 받았다 — 매년 +8로 같았다. 산식에는 × 5 계수가
        // 처음부터 있었다.
        //
        // ⚠ 진출선은 **압박 산식이 이미 쓰는 기준**과 같게 둔다
        // (`final_standing <= total_teams / 2`). 따로 정하면 표가 둘이 된다.
        consecutiveMissedPlayoffs: streak.missedPlayoffs,
        wonChampionship: i === 0,
        // 목표 대비 편차 — 0이면 엔진이 예전 절대 순위 방식으로 떨어진다
        targetStanding: targetOf.get(teamId) ?? 0,
        deviationWeight,
      }));
      const r = JSON.parse(raw) as { newPressure?: number; error?: string };
      if (r.error || typeof r.newPressure !== "number") continue;
      gameStore.patchProTeamProfile(teamId, { ...cur, winNowPressure: r.newPressure });
    }
  }
}


/** 진로 결정 등으로 시즌을 건너뛸 때 가드를 되돌린다 (새 게임·슬롯 전환) */
export function resetWorldSeasonEndGuard(): void {
  _lastWorldSeasonEndYear = -1;
}

/**
 * 시즌 기록을 history_* 테이블에 남긴다 (순위·개인기록·포스트시즌).
 *
 * ⚠ **이름을 같이 남긴다.** 예전엔 ID만 넣고 볼 때마다 조회했는데, 은퇴하거나
 * 사라진 선수는 조회가 빗나가 화면에 ID가 그대로 떴다. 과거 기록은 **그때의
 * 사실**이라 그때 이름이 함께 남아야 한다 — 팀명이 바뀌어도 5년 전 순위표는
 * 그 시절 이름이어야 맞다.
 */
/**
 * 🔴 **저장 실패가 두 겹으로 묻혀 있었다** (2026-09-01 · 트랙 C 가 찾았다).
 *
 * ```js
 *   main.cjs   catch (e) { return JSON.stringify({ error: ... }); }   // throw 가 아니다
 *   호출부     ....catch(() => {});                                    // 그래서 안 걸린다
 * ```
 *
 * `throw` 가 아니라 **`{error}` 를 반환**하므로 `.catch()` 는 애초에 안 걸리고,
 * resolve 된 값은 아무도 안 읽었다. **저장이 실패해도 화면에도 로그에도
 * 아무 흔적이 없다.** 같은 모양이 네 곳(순위·개인기록·포스트시즌·대회) 전부에
 * 있었다.
 *
 * 실측(트랙 C): `history_*` 여섯 중 **다섯이 0행**이고, 유일하게 찬
 * `history_standings` 190행도 플레이 산물이 아니라 새 게임이 심는 가짜 과거
 * 5년이다. **왜 비는지 코드만으로 못 가른다는 것 자체가 결함이다.**
 *
 * ⚠ 여기서 던지지는 않는다 — 시즌 종료가 저장 하나로 멈추면 더 나쁘다.
 *   **보이게만 한다.** 다음번엔 한 번에 갈린다.
 */
async function saveHistoryStep(
  label: string,
  rows: readonly object[],
  send: () => Promise<string>,
): Promise<void> {
  if (rows.length === 0) {
    console.warn(`[역대기록] ${label}: 넘길 행이 0건이라 건너뛴다`);
    return;
  }
  try {
    const raw = await send();
    const res = JSON.parse(raw) as { error?: string; saved?: number };
    if (res?.error) {
      console.warn(`[역대기록] ${label}: 저장 실패 — ${res.error} (${rows.length}행)`);
      return;
    }
    console.warn(`[역대기록] ${label}: ${res?.saved ?? rows.length}행 저장`);
  } catch (e) {
    // 여기 걸리는 건 IPC 자체가 죽은 것이다 — 반환형 실패와 구분해서 남긴다
    console.warn(`[역대기록] ${label}: IPC 예외 — ${String((e as Error)?.message ?? e)}`);
  }
}

export async function saveSeasonHistory(seasonYear: number) {
  const slotId = get(gameStore).currentSlotId;
  if (!slotId) return;

  const teams = get(masterStore).teams ?? [];
  const teamNameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? "";
  const entities = get(masterStore).entities ?? [];
  const me = get(gameStore).protagonist;
  const personNameOf = (id: string) =>
    id === me.id ? me.name : (entities.find((e) => e.id === id)?.name ?? "");
  const personTeamOf = (id: string) =>
    teamNameOf(id === me.id ? (me.teamId ?? "") : (entities.find((e) => e.id === id)?.teamId ?? ""));

  const standingRows: object[] = [];
  for (const st of get(seasonStore).standings) {
    const groupLabel = "";
    standingRows.push({ leagueId: get(seasonStore).leagueId, teamId: st.teamId, groupLabel,
      teamName: teamNameOf(st.teamId),
      wins: st.wins, losses: st.losses, draws: st.draws, winPct: st.winPct,
      runsFor: st.runsFor, runsAgainst: st.runsAgainst, streak: st.streak, last10: st.last10 });
  }
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    // 주인공 리그는 첫 번째 루프에서 group_label 포함해 저장했으므로 건너뜀
    // (leagueState에도 동일 리그가 있어 INSERT OR REPLACE로 덮어쓰면 group_label이 '' 로 초기화됨)
    if (lid === get(seasonStore).leagueId) continue;
    for (const st of (ls.standings ?? [])) {
      standingRows.push({ leagueId: lid, teamId: st.teamId, groupLabel: "",
        teamName: teamNameOf(st.teamId),
        wins: st.wins, losses: st.losses, draws: st.draws, winPct: st.winPct,
        runsFor: st.runsFor, runsAgainst: st.runsAgainst, streak: st.streak, last10: st.last10 });
    }
  }
  await saveHistoryStep("순위", standingRows, () =>
    window.projectB!.seasonSaveHistoryStandings(JSON.stringify({ slotId, seasonYear, rows: standingRows })));
  const lbStatRows: object[] = [];
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    for (const [playerId, stat] of Object.entries(ls.stats ?? {})) {
      if ((stat as { type?: string }).type === "pitcher") {
        const p2 = stat as PitcherSeasonStats;
        lbStatRows.push({ leagueId: lid, playerId, statType: "pitcher",
          playerName: personNameOf(playerId), teamName: personTeamOf(playerId),
          g: p2.g, gs: p2.gs, w: p2.w, l: p2.l, sv: p2.sv ?? 0, hd: p2.hd ?? 0,
          ip: p2.ip, er: p2.er, hP: p2.h, kP: p2.k, bbP: p2.bb, era: p2.era, whip: p2.whip,
          // 🔴 **여기서 빠뜨리면 시즌이 넘어가는 순간 사라진다** — 화면은
          //   표시하는데 과거 연도 행만 `—`가 된다 (2026-08-28)
          hrP: p2.hr ?? null, hbpP: p2.hbp ?? null,
          rispAbP: p2.rispAb ?? null, rispHP: p2.rispH ?? null });
      } else {
        const b2 = stat as BatterSeasonStats;
        lbStatRows.push({ leagueId: lid, playerId, statType: "batter",
          playerName: personNameOf(playerId), teamName: personTeamOf(playerId),
          g: b2.g, pa: b2.pa, ab: b2.ab, hB: b2.h, hr: b2.hr, rbi: b2.rbi,
          sb: b2.sb ?? 0, bbB: b2.bb, kB: b2.k, avgV: b2.avg, obp: b2.obp, slg: b2.slg, ops: b2.ops,
          b2: b2.b2 ?? null, b3: b2.b3 ?? null, rB: b2.r ?? null, hbpB: b2.hbp ?? null,
          sac: b2.sac ?? null, sf: b2.sf ?? null,
          rispAbB: b2.rispAb ?? null, rispHB: b2.rispH ?? null,
          // 🔴 여기서 빠뜨리면 시즌이 넘어가는 순간 수비 기록이 사라진다
          defE: b2.e ?? null, defA: b2.a ?? null, defPo: b2.po ?? null,
          fpct: b2.fpct ?? null });
      }
    }
  }
  if (lbStatRows.length > 0) {
    await saveHistoryStep("개인기록", lbStatRows, () =>
      window.projectB!.seasonSaveHistoryLbStats(JSON.stringify({ slotId, seasonYear, rows: lbStatRows })));
  }

  // 포스트시즌 결과 저장
  const brackets = get(seasonStore).postseasonBrackets ?? {};
  const psRows: object[] = [];
  const psEntries = get(seasonStore).schedule.filter((e) => e.phase === "postseason");
  const finalEntry = psEntries.find((e) => e.id.startsWith("PS_FINAL_"));
  if (finalEntry?.result) {
    const playoffTeams = Array.from(new Set(
      psEntries
        .filter((e) => e.id.startsWith("PS_SEMI"))
        .flatMap((e) => [e.homeTeamId, e.awayTeamId])
    ));
    const myLeague = get(seasonStore).leagueId;
    psRows.push({
      leagueId: myLeague,
      championId: finalEntry.result.winnerId,
      runnerUpId: finalEntry.result.loserId ?? "",
      championName: teamNameOf(finalEntry.result.winnerId),
      runnerUpName: teamNameOf(finalEntry.result.loserId ?? ""),
      playoffTeams,
      // ⚠ **대진을 통째로 남긴다.** 지금까지 우승·준우승·진출팀 셋만 저장해서
      // 화면이 "지난 시즌은 대진 과정이 아니라 결과만 남는다"고 쓸 수밖에
      // 없었다. 데이터가 없어서였지 화면이 게을러서가 아니다.
      bracket: brackets[myLeague] ?? null,
    });
  } else if (get(seasonStore).standings.length > 0) {
    const sorted = [...get(seasonStore).standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const myLeague = get(seasonStore).leagueId;
    psRows.push({ leagueId: myLeague, championId: sorted[0].teamId, runnerUpId: "",
      championName: teamNameOf(sorted[0].teamId), runnerUpName: "",
      playoffTeams: [], bracket: brackets[myLeague] ?? null });
  }
  for (const [lid, ls] of Object.entries(get(seasonStore).leagueState)) {
    if (lid === get(seasonStore).leagueId) continue;
    const bracket = brackets[lid] ?? null;
    // ⚠ **우승은 대진이 정한다.** 예전엔 `standings[0]`(정규시즌 1위)을 우승으로
    // 적고 준우승은 빈칸으로 뒀다 — 브래킷이 바로 옆에 있는데. 그래서 과거 기록의
    // "우승"과 그 아래 대진표의 승자가 서로 다를 수 있었다.
    const fin = bracket ? bracketFinalists(bracket) : null;
    const sorted = [...(ls.standings ?? [])].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    // 포스트시즌이 없는 리그(대학·고교)는 정규시즌 1위가 그 시즌의 1위다
    const championId = fin?.champion ?? sorted[0]?.teamId ?? "";
    if (!championId) continue;
    psRows.push({ leagueId: lid, championId, runnerUpId: fin?.runnerUp ?? "",
      championName: teamNameOf(championId), runnerUpName: teamNameOf(fin?.runnerUp ?? ""),
      playoffTeams: [], bracket });
  }
  if (psRows.length > 0) {
    await saveHistoryStep("포스트시즌", psRows, () =>
      window.projectB!.seasonSaveHistoryPostseason(JSON.stringify({ slotId, seasonYear, rows: psRows })));
  }

  // ── 대회 결과 저장 ──────────────────────────────────────────
  //
  // ⚠ **대회만 과거 기록이 없었다.** 화면은 `$seasonStore.tournaments`
  // (현재 시즌)만 보므로 **시즌이 넘어가면 지난해 대회가 통째로 사라졌다** —
  // 연도를 골라도 올해 것이 보였다. 고교 5개·대학 3개가 매 시즌 열리고
  // 우승팀까지 나오는데 볼 데가 없었다.
  //
  // ⚠ **안 열린 대회도 한 줄 남긴다.** 없으면 화면이 "미참가"와 "안 열림"을
  // 구분 못 한다 — 결산 화면이 바로 그 구분을 필요로 한다.
  {
    const sT = get(seasonStore);
    const tourRows = TOURNAMENTS.map((def) => {
      const bracket = sT.tournaments?.[def.id] ?? null;
      const group   = sT.groupStages?.[def.id] ?? null;
      const fin     = finalistsOf(bracket);
      return {
        tourId: def.id, leagueId: def.leagueId, tourName: def.name,
        championId: fin?.champion ?? "", championName: teamNameOf(fin?.champion ?? ""),
        runnerUpId: fin?.runnerUp ?? "", runnerUpName: teamNameOf(fin?.runnerUp ?? ""),
        bracket, group,
      };
    });
    if (tourRows.length > 0) {
      await saveHistoryStep("대회", tourRows, () =>
        window.projectB!.seasonSaveHistoryTournaments(
          JSON.stringify({ slotId, seasonYear, rows: tourRows })));
    }
  }
}

export interface SeasonRolloverInput {
  /** 종료되는 시즌 연도 */
  seasonYear: number;
  /**
   * `processSeasonEnd` **전**의 학년. 그 안에서 주인공 학년이 이미 올라가므로
   * 호출 뒤에 읽으면 늦다 — 고교 재초기화 여부 판단이 어긋난다.
   */
  gradeBeforeAdvance: number | null | undefined;
}

/**
 * 시즌 롤오버 — 학년 진급·드래프트·오프시즌·에이징·새 시즌 초기화.
 *
 * ⚠ **주인공 시즌 기록(`appendCareerRecord`)은 호출 전에 끝나 있어야 한다.**
 * 그건 순위·수상처럼 화면이 이미 계산해둔 값에서 나오고, 여기서 다시
 * 계산하면 정본이 둘이 된다.
 */
export async function runSeasonRollover(input: SeasonRolloverInput): Promise<void> {
  const now = input.seasonYear;
  const gradeBeforeAdvance = input.gradeBeforeAdvance;

  // ⚠ 컴포넌트에서 `p`는 `$: p = $gameStore.protagonist`라 **반응형**이었다.
  // 여기서 스냅샷으로 잡으면 `processSeasonEnd` 이후의 변화(학년 진급·졸업으로
  // 바뀐 careerStage, 서명된 계약)를 못 보고 옛 값으로 분기한다.
  const P = () => get(gameStore).protagonist;

  // 고교 NPC 학년 승급 + 졸업 처리는 매 시즌 종료마다 실행 (careerStage 무관)
  // processSeasonEnd 내부에서 protagonist.careerStage === "highschool"일 때만 주인공 학년도 올림
  await gameStore.processSeasonEnd(now);

  // ── 복무 중 ──────────────────────────────────────────────────
  //
  // ⚠ 전역이 **여기 없어서 입대하면 영원히 군대에 있었다.** 전역 코드는
  // `advanceWeek.handleSeasonEnd`에 있었지만 `runAutoAdvance`가 그보다 먼저
  // 시즌 종료(`currentWeek >= totalWeeks`)에서 멈춰 도달할 수가 없었다 —
  // 두 조건이 같은 순간을 가리키는데 자동 진행이 먼저 잡는다(죽은 코드).
  // 실측: 2029 입대 → 2036년 복무 700주(13.5년), 26세.
  //
  // 복무는 52주 시즌 두 번으로 흐른다. 매 시즌 세계 오프시즌을 돌리고
  // 나이를 올린 뒤, 복무가 끝났으면 전역하고 아니면 다음 해를 연다.
  // (오프시즌을 건너뛰면 복무 기간만큼 세계가 정체된다 — `militaryDecision` 주석 참고)
  if (P().careerStage === "military") {
    // ⚠ 예전엔 `processAllLeaguesSeasonEnd`만 불렀다. 그 사이 **드래프트가
    // 안 돌아** 복무 2년 동안 신인이 한 명도 안 들어왔다.
    await runWorldSeasonEnd(now);
    gameStore.advanceSeasonYear(get(seasonStore).seasonYear, get(seasonStore).leagueId);
    if (!(await dischargeProtagonist())) await openMilitarySeason(now + 1, P().teamId);
    await gameStore.save();
    await seasonStore.save();
    return;
  }

  // NPC 드래프트 — **오프시즌보다 먼저** 돌아야 한다.
  //
  // 오프시즌이 미지명자 진로를 배정하므로(방출·FA 미계약과 같은 로직),
  // 드래프트가 그 뒤에 오면 이미 대학·독립으로 흩어진 뒤가 된다.
  // W47 관전에서 이미 돌았으면 `lastDraftYear` 가드가 건너뛴다 —
  // 주인공 졸업 시즌엔 W47 관전 이벤트가 안 떠서 여기가 유일한 경로다.
  // ── 프로(KBL/ABL/JBL): pendingNextContract 적용 후 새 시즌 초기화 ──
  const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(P().careerStage);
  if (isProStage) {
    await runWorldSeasonEnd(now);
    gameStore.advanceSeasonYear(get(seasonStore).seasonYear, get(seasonStore).leagueId);

    // ── 2군 리그 우승팀 발표 메시지 ────────────────────────────
    const FARM_LEAGUE_NAMES: Record<string, string> = {
      LEAGUE_KBL_FARM: "KBL 2군", LEAGUE_ABL_FARM: "ABL 마이너", LEAGUE_JBL_FARM: "JBL 2군",
    };
    for (const [lid, label] of Object.entries(FARM_LEAGUE_NAMES)) {
      const ls = get(seasonStore).leagueState[lid];
      if (!ls || ls.standings.length === 0) continue;
      const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
      if (!sorted.some((s) => s.wins + s.losses > 0)) continue;
      const champion = get(masterStore).teams.find((t) => t.id === sorted[0].teamId)?.name ?? sorted[0].teamId;
      const runnerUp = sorted[1]
        ? (get(masterStore).teams.find((t) => t.id === sorted[1].teamId)?.name ?? sorted[1].teamId)
        : "-";
      gameStore.addMessage({
        id: `msg-farm-champion-${lid}-${now}`,
        category: "news", sender: "리그 사무국",
        subject: `${now} ${label} 시즌 종료`,
        preview: `${label} 우승: ${champion}`,
        body: [
          `${now} ${label} 정규리그가 종료되었습니다.`,
          ``,
          `우승: ${champion}  (${sorted[0].wins}승 ${sorted[0].losses}패)`,
          `준우승: ${runnerUp}`,
        ].join("\n"),
        createdAt: `W${get(seasonStore).currentWeek}`, readAt: null,
      });
    }

    // 시즌 종료 후 계약 연수 감산 (W43이 아닌 시즌 끝에 처리)
    gameStore.applySeasonContractProgress();

    const pending = P().pendingNextContract;
    if (pending) {
      gameStore.applyPendingNextContract();
      // 🔴 **`masterStore.teams`를 리그로 거르면 1군과 2군이 같이 딸려온다**
      // (2026-09-01 · 트랙 B 실측). refs에서 KBL은 `_1`(1군 10팀)과
      // `_2`(2군 10팀)가 **같은 `leagueId`**를 쓴다.
      //
      // 그대로 쓰면 **20팀짜리 시즌**이 열리고 순위표에 2군이 섞인다:
      //
      // ```
      //   실측(씨앗 20260803 · 9시즌)  순위표팀수 최소 0 · 최대 **20** · 평균 13
      //   그래서 PRO_TEAM_TOP3(lte 3)가 **20팀 중 3위**를 요구했다
      //   문턱은 10팀 감각으로 쓰였는데 모수가 두 배다
      // ```
      //
      // ⚠ **`proSeason.ts:40`이 이 결함을 주석으로 경고하고 고쳐 뒀는데
      // 여기는 안 고쳐졌다.** 같은 함정을 두 자리에서 만났고 한쪽만 닫혔다.
      // 정본은 `ALL_TEAMS_BY_LEAGUE` — refs에서 생성되고 1군/2군을 나눠 담는다.
      const proTeamIds = ALL_TEAMS_BY_LEAGUE[pending.leagueId]
        ?? get(masterStore).teams
          .filter((t) => t.leagueId === pending.leagueId)
          .map((t) => t.id);
      const seasonYear = (get(seasonStore).seasonYear || 2026) + 1;
      seasonStore.initSeason(pending.leagueId, seasonYear, 52, proTeamIds);
      seasonStore.setSchedule(await proSchedule(pending.leagueId, proTeamIds, pending.teamId));
      // ⚠ **`keepOwnSchedule`** — 방금 세운 `s.schedule` 을 덮으면 안 된다.
      //   배경(나머지 리그)만 채운다
      await seasonStore.reinitSeasonSchedules(pending.leagueId, pending.teamId, { keepOwnSchedule: true });
    } else {
      // ⚠ **계약 기간 중이면 `pendingNextContract`가 없는 게 정상이다.**
      // 재계약을 앞둔 해가 아니면 아무것도 대기하지 않는다 — 신인 3년 계약이면
      // 2·3년차가 여기로 온다.
      //
      // 예전엔 이 분기가 `startNewSeason()`만 불렀다. 그건 **빈 시즌**을 만든다
      // (`makeEmptySeason` — 일정 없음). 그래서 프로 2년차부터 경기가 0건이었다.
      // 주석은 "미서명 상태 폴백"이라고 적혀 있었지만 실제로 여기 오는 건
      // 대부분 **정상 계약 중인 선수**다.
      seasonStore.startNewSeason();
      const me = P();
      // 🔴 **같은 20팀 함정이 세 번째 자리다** (2026-09-02).
      //
      // `masterStore.teams.filter(leagueId === ...)` 는 1군(`_1`)과
      // 2군(`_2`)을 **같이** 준다 — 둘이 같은 `leagueId` 를 쓴다.
      // 그대로 쓰면 20팀짜리 시즌이 열리고 순위표에 2군이 섞인다.
      //
      // `proSeason.ts:40` 이 이걸 주석으로 경고하며 고쳤고, 바로 위
      // `pending` 갈래도 2026-08-30 에 고쳤는데 **여기만 남아 있었다.**
      // 정본은 `ALL_TEAMS_BY_LEAGUE` — refs 에서 생성되고 1군/2군을 나눠 담는다.
      const teamIds = ALL_TEAMS_BY_LEAGUE[me.leagueId]
        ?? get(masterStore).teams
          .filter((t) => t.leagueId === me.leagueId)
          .map((t) => t.id);
      if (teamIds.length > 0 && me.teamId) {
        seasonStore.setSchedule(await proSchedule(me.leagueId, teamIds, me.teamId));
        // 배경 리그도 이 시즌 몫을 다시 만든다 — `startNewSeason` 이 비웠다
        await seasonStore.reinitSeasonSchedules(me.leagueId, me.teamId, { keepOwnSchedule: true });
      }
    }

    await gameStore.save();
    await seasonStore.save();
    return;
  }

  // ── 독립리그: 오프시즌 W39~W47에 careerChoiceHub로 이미 처리됨 ──
  // SeasonEndModal에서는 연간 정산만 진행

  if (P().careerStage === "highschool" && P().schoolId) {
    gameStore.addMessage({
      id: `msg-season-hs-sync-${Date.now()}`,
      category: "news",
      sender: "연감",
      subject: `${now} 시즌 졸업/승급 반영`,
      preview: "고교 선수 학년 승급과 졸업 대상 정리가 반영되었습니다.",
      body: ["고교 시즌 종료 동기화가 완료되었습니다.", "NPC 학년 승급과 졸업 처리가 반영되었습니다.", "졸업 대상은 드래프트/진로 처리 풀로 이관되었습니다."].join("\n"),
      createdAt: `Y${now}`,
      readAt: null,
    });
  }

  await runWorldSeasonEnd(now);

  // ── 연간 병역 현황 메시지 (processAllLeaguesSeasonEnd 이후 읽어야 정확한 데이터)
  type OffseasonSummary = { militaryEnlistedSports?: string[]; militaryEnlistedGeneral?: string[]; militaryDischargedNames?: string[] };
  const offseasonSummary = (window as Window & { __lastOffseasonSummary?: OffseasonSummary | null }).__lastOffseasonSummary ?? null;
  if (offseasonSummary) {
    const sports     = offseasonSummary.militaryEnlistedSports ?? [];
    const general    = offseasonSummary.militaryEnlistedGeneral ?? [];
    const discharged = offseasonSummary.militaryDischargedNames ?? [];
    if (sports.length + general.length + discharged.length > 0) {
      const lines: string[] = [];
      if (sports.length)     lines.push(`◆ 체육부대 입대 (${sports.length}명)\n  ${sports.slice(0, 5).join(", ")}${sports.length > 5 ? ` 외 ${sports.length - 5}명` : ""}`);
      if (general.length)    lines.push(`◆ 일반부대 입대 (${general.length}명)\n  ${general.slice(0, 3).join(", ")}${general.length > 3 ? ` 외 ${general.length - 3}명` : ""}`);
      if (discharged.length) lines.push(`◆ 전역 (${discharged.length}명)\n  ${discharged.slice(0, 3).join(", ")}${discharged.length > 3 ? ` 외 ${discharged.length - 3}명` : ""}`);
      gameStore.addMessage({
        id: `msg-military-annual-${now}`,
        category: "news", sender: "병무청",
        subject: `${now} 시즌 병역 현황`,
        preview: `입대 ${sports.length + general.length}명, 전역 ${discharged.length}명`,
        body: lines.join("\n\n"),
        createdAt: `Y${now}`, readAt: null,
      });
    }
    (window as Window & { __lastOffseasonSummary?: unknown }).__lastOffseasonSummary = null;
  }
  gameStore.advanceSeasonYear(get(seasonStore).seasonYear, get(seasonStore).leagueId);
  seasonStore.startNewSeason();

  // gradeBeforeAdvance 기준으로 판단: processSeasonEnd 후 p.grade는 이미 증가해 있으므로
  // grade 1→2 또는 2→3 진급 시에만 다음 HS 시즌 재초기화 (grade 3→졸업은 제외)
  // 🔴 **고교를 떠나면 배경 리그가 통째로 멈춰 있었다** (2026-09-02).
  //
  // `startNewSeason` 이 `leagueSchedules` 를 비우는데, 다시 채우는 자리가
  // **고교 전용 둘뿐**이었다(`initAllLeaguesV3` · `reinitHighschoolSeason`).
  // 그래서 졸업하는 순간 프로 6개 리그 · 고교 · 대학 배경 일정이 사라졌다.
  //
  // 실측(`probe-traits --path univ` · 씨앗 20260731 · 8시즌):
  //
  // ```
  //   [일정끝:highschool]  9개 리그 — KBL 780/780 · ABL 1296/1296 …
  //   [일정끝:university]  UNIVERSITY **68/0** · 프로 6개 리그가 아예 없다
  //   [university]         순위없음 64/72 · 순위표팀수 최종 0
  //   [성적:university]    고교 기록과 **한 글자도 안 다르다** — 안 뛰었다
  // ```
  //
  // ⚠ 대학은 배선이 하나 더 없었다. 진학해도 `s.leagueId` 를 대학으로
  //   바꾸는 자리가 없어서, 배경 시뮬은 `lid === 주인공리그` 로 건너뛰고
  //   주 경기 루프는 빈 `s.schedule` 을 봤다 — **아무도 안 돌렸다.**
  //   독립리그와 같은 형태다(`postseason.ts` 주석).
  if (P().careerStage === "highschool" && gradeBeforeAdvance != null && gradeBeforeAdvance < 3) {
    // 팀 목록을 넘기지 않는다 — 일정·순위표 모두 HS_REGIONS(102팀)에서 나오므로
    // 새 게임 initAllLeaguesV3와 자동으로 같은 소스가 된다.
    await seasonStore.reinitHighschoolSeason(P().teamId);
  } else {
    // 🔴 **`careerStage !== "highschool"` 로 걸었더니 졸업하는 해가 샜다**
    //   (2026-09-02 · 씨앗 20260803 실측).
    //
    //   3학년 시즌이 끝나는 롤오버에서는 **아직 `careerStage` 가 고교**다.
    //   그런데 `grade < 3` 이 아니라 HS 재초기화도 안 탄다 — 두 갈래
    //   **사이로 빠져** 그 해만 배경이 없었다:
    //
    //   ```
    //     2029 [independent]  INDEPENDENT 171 · HIGHSCHOOL 210 · UNIVERSITY 85
    //     2030 [independent]  9개 리그 전부
    //   ```
    //
    // ⚠ 졸업 해에는 **`s.schedule` 을 건드리면 안 된다.** 진로가 정해지면
    //   거기로 새 일정이 들어온다(독립은 생존리그가 `injectLeagueEntries`
    //   로 넣는다). 아직 고교 신분이라고 고교 일정을 다시 깔면 그걸 덮는다.
    //   그래서 그 해만 배경으로 한정한다.
    await seasonStore.reinitSeasonSchedules(P().leagueId, P().teamId, {
      keepOwnSchedule: P().careerStage === "highschool",
    });
  }

  await gameStore.save();
  await seasonStore.save();
}
