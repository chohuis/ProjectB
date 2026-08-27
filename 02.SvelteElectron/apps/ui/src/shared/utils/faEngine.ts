import type { ProtagonistSave, ProContract } from "../types/save";
import type { TeamRef } from "../stores/master";
import { ALL_TEAMS_BY_LEAGUE } from "./leagueScheduler";
import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { npcLiveStatsStore, livePitchingOvrOf } from "../stores/npcLiveStats";
import { postingInterest, POSTING_INTEREST_MIN, OVERSEAS_FLOOR } from "./postingInterest";
import { isForeignPlayer, hasForeignSlots, foreignRules } from "./foreignSlots";

/**
 * 리그별 FA 자격 연수 **폴백** (프로 입단 후 연수).
 *
 * 정본은 `generation_rules.json`의 `faRules.eligibleYears`다.
 * 여기 값은 규칙 파일을 못 읽는 동기 호출 경로를 위한 것이고,
 * **규칙 파일과 달라지면 `npm run test:fa`가 깨진다.**
 */
export const FA_THRESHOLD: Record<string, number> = {
  LEAGUE_KBL: 5,
  LEAGUE_ABL: 6,
  LEAGUE_JBL: 4,
};
export function getFaThreshold(leagueId: string): number {
  return FA_THRESHOLD[leagueId] ?? 5;
}

/**
 * FA **재취득**까지의 연수. 짝은 Rust `npc_sim.rs`의 `FA_REACQUIRE_YEARS`다.
 *
 * 🔴 **연차를 0으로 되돌려선 안 된다.** `proServiceYears`는 통산 연차이고
 *   **연봉 산식의 입력**이다(`estimate_salary_and_contract`). 리셋하면 FA를
 *   신청한 순간 그 선수의 몸값이 신인 수준으로 떨어진다.
 *
 *   Rust는 이미 그렇게 고쳐져 있었다 — 그 주석이 증상까지 적어 뒀다:
 *   "리셋해서 1군 평균이 7년 → 1.8년으로 폭락하고 7년차 이상이 157명 → 0명".
 *   **TS 경로만 안 고쳐져 있었다.**
 *
 *   실측(씨앗 20260731 · 한 시즌): KBL 1군 7년차+ 45% → 5%. 리셋을 빼면 16%다.
 *
 * ⚠ 그래서 자격은 **누적 연차 + 마지막 취득으로부터의 경과**로 본다.
 *   리셋을 그냥 빼기만 하면 자격자가 매년 FA를 신청한다.
 */
export const FA_REACQUIRE_YEARS = 4;

/**
 * 지금 FA를 다시 신청할 수 있는가 — 마지막 `fa_signed` 이후 경과를 본다.
 * 기록이 없으면 첫 취득이라 언제나 참이다.
 */
export function canReacquireFa(
  careerEvents: ReadonlyArray<{ year: number; eventType: string }> | undefined,
  seasonYear: number,
): boolean {
  let last = -Infinity;
  for (const e of careerEvents ?? []) {
    if (e.eventType === "fa_signed" && e.year > last) last = e.year;
  }
  return !Number.isFinite(last) || seasonYear - last >= FA_REACQUIRE_YEARS;
}

export interface FaOffer {
  teamId: string;
  leagueId: string;
  salary: number;
  durationYears: number;
  signingBonus: number;
  teamOptionYears: number;
  playerOptionYears: number;
  noTrade: boolean;
}

/**
 * FA로 갈 수 있는 리그 — **어디서 어디로 갈 수 있는가.**
 *
 * ⚠ **1군만 담는다.** 2군 계약은 FA가 아니라 육성 계약이다.
 *   3단계(아마추어 직행)가 2군을 따로 연다.
 * ⚠ 아마추어(고교·대학·독립)는 FA가 없다 — 진로 선택으로 간다.
 */
const PRO_LEAGUES = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"] as const;

/**
 * 주인공 FA 관심도 문턱.
 *
 * 🔴 **50 → 40 → 45로 좁혔다** (2026-08-27 실측 3회).
 *   50에서는 KBL 제안이 **0건**이었다 — 산식을 풀어 보니 이렇다:
 *
 *       기본 50 · OVR 75 이상 +15 · 예산 상한 초과 **−25**
 *
 *   `bid_cap`은 `(여유/상한) × 상한 × 0.35`라 **여유가 적으면 아주 작다**
 *   (총연봉 58000/상한 60000이면 상한이 1740이다). FA 요구액은 거의 늘 그 위라
 *   **−25가 사실상 상수**가 되고, 그러면 OVR 85도 관심도가 40이다.
 *
 *       OVR 65  상한걸림 25 · 상한통과 50
 *       OVR 75  상한걸림 40 · 상한통과 65
 *       OVR 85  상한걸림 **40** · 상한통과 65
 *
 * **전후 실측** (8시즌 × 6씨앗):
 *
 *       제비뽑기(전)   평균 4.1개 · KBL 66 · 제안0건 0%
 *       문턱 50        평균 1.4개 · **KBL 0** · 제안0건 25%   ← 국내가 통째로 막혔다
 *       문턱 40        평균 12.8개 · KBL 135                  ← 반대로 헐렁하다
 *       문턱 **45**    ← 아래 커밋에 적는다
 *
 * ⚠ **관심도는 이산값이다.** 산식이 정수 가감이라 나올 수 있는 값이
 *   `5 10 20 25 30 35 40 45 50 60 65 75`뿐이다 — 40과 45 사이에 아무것도 없고,
 *   45와 50 사이에도 없다. **문턱을 1씩 움직이는 건 뜻이 없다.**
 *
 * 🔴 **값을 여기 적지 않는다.** NPC FA가 `faRules.bidInterestMin`을 쓴다 —
 *   주인공이 다른 숫자를 쓰면 **같은 판정에 표가 둘**이 된다.
 *   이건 규칙 파일을 못 읽었을 때만 쓰는 폴백이다.
 *
 * 🔴 **80이 얇은 자리를 필수로 만드는 선이다** (사용자 확정 2026-08-27).
 *   65에서는 `50 + 15 = 65`라 OVR 75만 넘으면 전 구단이 통과했고,
 *   로스터 부족(+30)이 판정에 **아예 안 걸렸다** — 실측 주인공 FA 제안이
 *   평균 29.6개, KBL 10팀 중 9.4팀이 불렀다.
 *
 *       필요 없는 팀 최대 75   (50 + OVR 15 + 성향 10)
 *       필요한 팀    80 ~ 95   (+ 로스터 부족 30)
 *
 * ⚠ 예전엔 여기만 60이었다. 낮춰 잡은 근거는 "로스터를 안 넘겨 `roster_needs`가
 *   늘 0이라"였는데, 2026-08-27에 그걸 넘기게 고쳐서 **근거가 없어졌다.**
 * ⚠ 0이면 **예전 동작**(무작위 3~5팀)으로 떨어진다.
 */
export const FA_INTEREST_MIN = 80;

export function faDestinationLeagues(fromLeagueId: string): string[] {
  // 프로끼리는 서로 오간다 — 나가는 길과 돌아오는 길이 같은 규칙이다
  if ((PRO_LEAGUES as readonly string[]).includes(fromLeagueId)) return [...PRO_LEAGUES];
  // 그 밖(아마추어·2군·FA 상태)은 원래 리그만
  return [fromLeagueId];
}

/** 구단 성향 — 없으면 Rust가 기본값을 쓴다 */
function teamProfileOf(teamId: string): unknown {
  return get(gameStore).proTeamProfiles?.[teamId];
}

/** 그 팀 총연봉 */
function payrollOf(teamId: string): number {
  return get(gameStore).npcs
    .filter((n) => n.currentTeam === teamId && n.careerStatus === "active")
    .reduce((sum, n) => sum + (n.currentSalary ?? 0), 0);
}

/**
 * 연봉 상한 — **총연봉에 예산 지수를 곱해 유도한다.**
 * ⚠ 새 표를 만들지 않는다 — 오프시즌 FA(`game.ts`)가 쓰는 방식과 같다.
 */
function salaryCapOf(teamId: string): number {
  return Math.round(payrollOf(teamId) * 1.25);
}

/**
 * 그 팀이 **내 자리를 필요로 하는가** — 같은 포지션이 1명 이하면 얇다.
 *
 * 🔴 이게 관심도의 가장 큰 항(+30)이고 **"필요해서 부른다"는 것 자체**다.
 * ⚠ Rust `npc_sim`의 NPC FA가 같은 기준을 쓴다(`at_pos <= 1`) —
 *   두 경로가 다른 잣대를 쓰면 주인공만 유불리가 생긴다.
 */
function rosterNeedsOf(teamId: string, position: string): string[] {
  const atPos = get(gameStore).npcs.filter(
    (n) => n.currentTeam === teamId && n.careerStatus === "active"
      && n.position === position).length;
  return atPos <= 1 ? [position] : [];
}

/**
 * 그 팀 투수들의 OVR — 관심도의 **팀 상대 축**이다.
 *
 * ⚠ 살아 있는 능력치를 본다(`livePitchingOvrOf`) — 생성 시점 값을 쓰면
 *   시즌이 갈수록 실제와 벌어진다.
 */
function teamPitcherOvrsOf(teamId: string): number[] {
  const live = get(npcLiveStatsStore);
  return get(gameStore).npcs
    .filter((n) => n.currentTeam === teamId && n.careerStatus === "active"
      && n.playerType === "pitcher")
    .map((n) => livePitchingOvrOf(n, live));
}

/** 통산 수상 횟수 — **시즌 기록마다 흩어져 있다**(`careerRecords[].awards`) */
function awardCountOf(p: ProtagonistSave): number {
  return (p.careerRecords ?? []).reduce((n, r) => n + (r.awards ?? []).length, 0);
}

/** 그 팀 활성 인원 */
function activeCountOf(teamId: string): number {
  return get(gameStore).npcs.filter(
    (n) => n.currentTeam === teamId && n.careerStatus === "active").length;
}

/** 그 팀이 보유한 외국인 — (총원, 투수) */
function foreignHeldOf(teamId: string, leagueId: string): [number, number] {
  let held = 0, pit = 0;
  for (const n of get(gameStore).npcs) {
    if (n.currentTeam !== teamId || n.careerStatus !== "active") continue;
    if (!isForeignPlayer(leagueId, n.nationality)) continue;
    held++;
    if (n.playerType === "pitcher") pit++;
  }
  return [held, pit];
}

/**
 * **갈 자리가 있는 팀인가** — 정원 여유와 외국인 한도.
 *
 * 🔴 주인공 경로에 이 문지기 둘이 통째로 빠져 있었다. NPC FA는 후보를 고를 때
 *   `npc_sim.rs`의 `open`으로 **둘 다** 본다("여유를 안 보면 FA가 캡을
 *   통과한다"). 주인공만 안 보니 정원이 찬 팀도 부르고, 해외 진출이
 *   보유 한도를 그냥 지나쳤다.
 *
 * ⚠ **문턱을 옮겨 가릴 일이 아니다.** 관심도가 이산값이라 문턱으로는
 *   전부/전무로만 갈린다(실측: 40 → 평균 16.9개 · 45 → 1.1개).
 *   제안이 많았던 건 문턱이 낮아서가 아니라 **갈 수 없는 팀까지 셌기** 때문이다.
 *
 * ⚠ 외국인 한도는 **목적지 리그 기준**으로 묻는다 — `isForeignPlayer(리그, 국적)`.
 *   `isForeignInQuotaLeague`를 쓰면 한국인이 ABL에 갈 때도 한도에 걸린다.
 */
function hasRoomFor(
  team: TeamRef,
  nationality: string,
  isPitcher: boolean,
  rosterMaxOf: (leagueId: string) => number,
): boolean {
  if (activeCountOf(team.id) >= rosterMaxOf(team.leagueId)) return false;
  if (!hasForeignSlots(team.leagueId)) return true;
  if (!isForeignPlayer(team.leagueId, nationality)) return true;
  const f = foreignRules();
  const [held, pit] = foreignHeldOf(team.id, team.leagueId);
  if (f?.perTeam != null && held >= f.perTeam) return false;
  if (isPitcher && f?.maxPitchers != null && pit >= f.maxPitchers) return false;
  return true;
}

/** 최근 한 시즌 평균자책점. 없으면 `undefined` — **0이 아니다** */
function recentEraOf(p: ProtagonistSave): number | undefined {
  const recs = p.careerRecords ?? [];
  for (let i = recs.length - 1; i >= 0; i--) {
    const st = recs[i].stats;
    if (st?.type === "pitcher" && st.ip > 0) return st.era;
  }
  return undefined;
}

export async function generateFaOffers(
  protagonist: ProtagonistSave,
  teams: TeamRef[],
): Promise<FaOffer[]> {
  // ⚠ 엔진은 `leagueId`가 같은 팀을 후보로 삼는데, refs에서 KBL은 1군(`_1`)과
  // 2군(`_2`)이 **같은 leagueId**를 쓴다. 그대로 넘기면 FA 제안에 2군이 섞이고
  // 실제로 그리로 이적한다 (실측: TEAM_KBL_CHANGWON_STARS_2와 3년 계약).
  // 1군/2군을 나눠 담는 정본은 `ALL_TEAMS_BY_LEAGUE`다.
  // 🔴 **해외를 후보에 넣는다** (2026-08-27). 예전엔 자기 리그만 봤다 —
  //   그 한 줄이 **나가는 길(KBL→해외)과 돌아오는 길(해외→KBL)을 동시에**
  //   막고 있었다. NPC는 이미 오간다(`market.ts`).
  //
  // ⚠ **2군은 여전히 안 섞는다.** `ALL_TEAMS_BY_LEAGUE`가 1군·2군을 따로
  //   담는 게 그 근거다 — refs에서 KBL 1군(`_1`)과 2군(`_2`)이 **같은
  //   `leagueId`**를 쓰므로, 리그로만 거르면 2군이 들어온다
  //   (실측: `TEAM_KBL_CHANGWON_STARS_2`와 3년 계약).
  //   여기서도 그 표를 통해서만 담는다.
  const destLeagues = faDestinationLeagues(protagonist.leagueId);
  const allowed = new Set(destLeagues.flatMap((lid) => ALL_TEAMS_BY_LEAGUE[lid] ?? []));
  const poolAll0 = allowed.size > 0 ? teams.filter((t) => allowed.has(t.id)) : teams;

  // 🔴 **규칙 파일을 한 번만 읽는다.** 정원 상한·리그 배수·관심도 문턱이 전부
  //   거기 있다 — 나눠 읽으면 같은 파일을 세 번 열고 표가 흩어진다.
  const rules = await (async () => {
    try {
      const { loadRosterRules } = await import("../repo/newGameV3");
      return await loadRosterRules() as {
        rosterRules?: Record<string, { rosterMax?: number }>;
        salaryRules?: { leagueMult?: Record<string, number> };
        faRules?: { bidInterestMin?: number };
      };
    } catch { return {}; }
  })();
  const rosterMaxOf = (leagueId: string) => rules.rosterRules?.[leagueId]?.rosterMax ?? 34;

  // 🔴 **갈 자리가 없는 팀은 후보가 아니다** (2026-08-27). NPC는 이미 이렇게 고른다.
  const isPitcher = (protagonist.playerType ?? "pitcher") === "pitcher";
  // ⚠ **주인공은 한국인이다** — `ProtagonistSave`에 국적 칸이 아예 없다.
  //   그래서 KBL에선 한도 밖이고, 해외는 애초에 한도가 없다(`foreignRules.leagues`가
  //   KBL 하나다). **지금은 이 문지기가 안 걸리는 게 맞다** — 국적이 생기면 걸린다.
  const nationality = "KOR";
  const poolAll = poolAll0.filter((t) => hasRoomFor(t, nationality, isPitcher, rosterMaxOf));

  // 🔴 **해외는 관심을 받아야 후보가 된다** (2026-08-27).
  //   1단계에서 풀만 열었더니 OVR 75~77에게 해외 제안이 **84%**였다 —
  //   조건이 없으면 KBL에 남을 이유가 사라진다.
  //
  // ⚠ **국내는 아직 안 거른다.** 5단계에서 모든 리그를 같이 고친다 —
  //   지금 국내까지 건드리면 기존 밸런스가 흔들려 해외 쪽 실측이 오염된다.
  const pool = poolAll.filter((t) => {
    if (t.leagueId === protagonist.leagueId) return true;   // 국내(=자기 리그)
    // 🔴 **리그별 바닥** — Rust `OVERSEAS_ROUTES`가 갖고 있던 것을 여기로 옮겼다.
    //   그 루트는 후보 풀과 별개로 해외 팀을 무작위로 더 얹는 **두 번째 문**이라
    //   정원·외국인 한도·관심도 판정을 전부 우회했다. 문은 하나여야 한다.
    const floor = OVERSEAS_FLOOR[t.leagueId];
    if (floor) {
      if (protagonist.pitching.ovr < floor.ovr) return false;
      if ((protagonist.fame ?? 0) < floor.fame) return false;
    }
    const interest = postingInterest({
      teamPitcherOvrs: teamPitcherOvrsOf(t.id),
      pitchingOvr:     protagonist.pitching.ovr,
      scoutScore:      protagonist.scoutScore ?? 0,
      fame:            protagonist.fame ?? 0,
      proServiceYears: protagonist.proServiceYears ?? 0,
      awardCount:      awardCountOf(protagonist),
      recentEra:       recentEraOf(protagonist),
    });
    return interest >= POSTING_INTEREST_MIN;
  });

  const params = {
    pitchingOvr:     protagonist.pitching.ovr,
    fame:            protagonist.fame,
    leagueId:        protagonist.leagueId,
    teamId:          protagonist.teamId,
    faUnsignedWeeks: protagonist.faUnsignedWeeks ?? 0,
    // 🔴 **팀별 관심도 판정에 쓴다** (5단계). 예전엔 무작위 3~5팀이었다 —
    //   OVR 60이든 90이든 제안이 같은 수였고, 팀이 필요해서 부르는 게 아니었다.
    //   NPC는 이미 `eval_fa_bid`로 도는데 **주인공만 안 탔다.**
    age:             protagonist.age ?? 27,
    proServiceYears: protagonist.proServiceYears ?? 0,
    position:        protagonist.position ?? "SP",
    /**
     * 관심도 임계값 — **NPC FA와 같은 값을 같은 파일에서 읽는다**(`faRules.bidInterestMin`).
     *
     * ⚠ 상수는 규칙 파일을 못 읽었을 때만 쓴다. 여기 숫자를 적으면 표가 둘이 된다.
     * ⚠ 0이면 **예전 동작**(무작위 3~5팀)으로 떨어진다.
     */
    interestMin:     rules.faRules?.bidInterestMin ?? FA_INTEREST_MIN,
    // 🔴 **팀 사정을 같이 넘긴다** (2026-08-27). 예전엔 `id`와 `leagueId`뿐이라
    //   Rust가 성향·예산·정원을 **전부 기본값으로** 봤다 — 그러면 모든 팀이
    //   같은 관심도를 받아 문턱이 전부/전무로 갈린다.
    //   실측: 문턱 40 → 평균 16.9개(전부) · 45 → 1.1개(KBL 0). 그 사이가 없었다.
    teams:           pool.map((t) => ({
      id: t.id, leagueId: t.leagueId,
      profile: teamProfileOf(t.id),
      currentPayroll: payrollOf(t.id),
      salaryCap: salaryCapOf(t.id),
      // ⚠ **이게 "필요해서 부른다"는 것 자체다**(관심도 +30).
      rosterNeeds: rosterNeedsOf(t.id, protagonist.position ?? "SP"),
    })),
    // 리그 배수는 규칙 파일이 정본이다 — Rust에 표를 두 번 두지 않는다
    leagueMult:      rules.salaryRules?.leagueMult ?? {},
  };
  return JSON.parse(
    await window.projectB!.faGenerateOffers(JSON.stringify(params))
  ) as FaOffer[];
}

// ── TS 유지 ───────────────────────────────────────────────────

export function isFaEligible(protagonist: ProtagonistSave, _attendsUniversity: boolean): boolean {
  const requiredYears = getFaThreshold(protagonist.leagueId);
  return protagonist.proServiceYears >= requiredYears;
}

export function toContract(offer: FaOffer): ProContract {
  return {
    teamId:             offer.teamId,
    leagueId:           offer.leagueId,
    salary:             offer.salary,
    durationYears:      offer.durationYears,
    remainingYears:     offer.durationYears,
    signingBonus:       offer.signingBonus,
    teamOptionYears:    offer.teamOptionYears,
    playerOptionYears:  offer.playerOptionYears,
    noTrade:            offer.noTrade,
    status:             "active",
  };
}
