import { get } from "svelte/store";
import { seedOf } from "../../utils/seedOf";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { autoLog, logEvent, logVerify, type PlayerEventEntry } from "../../stores/autoAdvance";
import { getFaThreshold, canReacquireFa } from "../../utils/faEngine";
import { loadRosterRules } from "../../repo/newGameV3";
import { staffModsOf } from "../../utils/staffEffects";
import {
  SANGMU_TEAM_IDS, leagueOfTeam, activeProLeagues, activeProLeaguesWithFarm,
} from "../../utils/ids";
import { isForeignPlayer, isForeignInQuotaLeague } from "../../utils/foreignSlots";
import { isRegistrable } from "../../utils/developmentPlayer";
import type { PlayerSeasonStats } from "../../types/save";
import { MONTH_STARTS_1 } from "./growth";
import { finiteOr } from "../../utils/payloadNum";
import { leagueStandingsOf } from "../../utils/season-helpers";

// gameStore.updateNpcs → connectToGameStore 구독이 entities 자동 갱신
function updateNpcsAndSync(npcs: import("../../types/save").NpcSaveState[]): void {
  gameStore.updateNpcs(npcs);
}

// ── 프로팀 엔진 헬퍼 ──────────────────────────────────────────

type EntityDetails  = import("../../stores/master").EntityDetails;
type ProTeamProfile = import("../../stores/master").ProTeamProfile;

function npcOvr(entity: import("../../stores/master").EntityRow, liveStats: import("../../stores/master").NpcLiveStats): number {
  const live = liveStats[entity.id];
  const p    = (entity.details as EntityDetails)?.player;
  return (live?.pitching?.ovr ?? p?.pitching?.ovr ?? live?.batting?.ovr ?? p?.batting?.ovr ?? 60) as number;
}

/**
 * 승강 판정이 보는 시즌 성적. 1군·2군 기록을 한 곳에서 찾는다 —
 * 시즌 중 오르내린 선수는 두 리그에 기록이 나뉘어 있다.
 */
function seasonPerfOf(
  npcId: string,
  stats: Record<string, Record<string, PlayerSeasonStats>>,
): object | undefined {
  // 확장팩이 닫혀 있으면 KBL 짝 하나다 — 예전과 완전히 같게 돈다
  for (const lid of activeProLeaguesWithFarm()) {
    const st = stats[lid]?.[npcId];
    if (!st) continue;
    // ⚠ **값을 그대로 넘기면 안 된다.** 엔진 `RosterPerf`는 전부 i32/f64인데
    // `#[serde(default)]`는 **키가 없을 때만** 동작한다 — 명시적 `null`이
    // 오면 페이로드 전체가 거부되고 그 팀 승강이 통째로 죽는다.
    // 실측: 프로 7년차부터 한 팀에서 매주 "콜업 판정 실패"가 나며 승강이
    // 멈췄고, 그 예외가 주간 루프를 끊어 뒤따르는 처리까지 안 돌았다.
    // `buildRosterRef`에는 같은 방어가 있었는데 perf만 빠져 있었다.
    return st.type === "pitcher"
      ? { games: finiteOr(st.g), innings: finiteOr(st.ip), era: finiteOr(st.era), whip: finiteOr(st.whip) }
      : { games: finiteOr(st.g), plateAppearances: finiteOr(st.pa), ops: finiteOr(st.ops) };
  }
  return undefined;
}

/**
 * 승강·재계약·FA가 엔진에 넘기는 선수 한 명.
 *
 * 🔴 **예전엔 반환 타입이 `object`였다.** 그래서 호출부가 없는 키로 찾아도
 * TS가 안 잡았다 — 실제로 `farm.find(f => f.playerId === ...)`가 항상 undefined라
 * 콜업·콜다운 로그의 OVR이 **항상 0**으로 찍혔다. 여기 키는 `id`다.
 */
export interface RosterRef {
  id: string;
  position: string;
  age: number;
  ovr: number;
  salary: number;
  remainingYears: number;
  proServiceYears: number;
  isProspect: boolean;
  personality: unknown;
  fame: number;
  isForeign: boolean;
  registrable: boolean;
  /** 성적이 없으면 없다 — Rust가 그때는 능력치만 본다 */
  perf?: object;
}

function buildRosterRef(
  entity: import("../../stores/master").EntityRow,
  liveStats: import("../../stores/master").NpcLiveStats,
  savedNpc?: import("../../types/save").NpcSaveState,
  perf?: object,
  /** 육성선수 등록 판정용. 없으면 전원 등록 가능(승강 외 호출부) */
  now?: { seasonYear: number; month: number },
): RosterRef {
  const p = (entity.details as EntityDetails)?.player;
  const ref = {
    id:               entity.id,
    position:         p?.position ?? "",
    age:              entity.age,
    ovr:              npcOvr(entity, liveStats),
    salary:           (savedNpc as any)?.currentSalary ?? 0,
    remainingYears:   (savedNpc as any)?.contractYears ?? 1,
    proServiceYears:  savedNpc?.proServiceYears ?? 0,
    isProspect:       entity.teamId?.endsWith("_2") ?? false,
    personality:      entity.personality ?? null,
    fame:             savedNpc?.fame ?? 0,
    // 외국인은 1군 전용 — 승강 판정이 이 값으로 강등·교체 후보에서 뺀다.
    // 국적만으로 판정하면 ABL(USA)·JBL(JPN) 로스터 전원이 외국인이 된다
    isForeign:        isForeignPlayer(entity.leagueId ?? "", entity.nationality),
    // 육성선수는 입단 연도 5월까지 1군 등록이 안 된다 (KBO 규정).
    // ⚠ 후보에서만 빠지고 2군 정원에는 그대로 센다 — `developmentPlayer.ts`
    registrable:      now
      ? isRegistrable(savedNpc?.developmentSince, now.seasonYear, now.month)
      : true,
    // 성적이 없으면 undefined — Rust가 그때는 능력치만 본다
    ...(perf ? { perf } : {}),
  };

  // ⚠ 엔진의 `RosterPlayerRef`는 이 넷이 `i32`/`i64`/`f64`다. 하나라도 null이면
  // **serde가 페이로드 전체를 거부**하고 그 팀 승강이 통째로 죽는다 —
  // 그 예외가 주간 루프를 중단시켜 뒤따르는 성장·메시지·순위·오프시즌까지
  // 안 돈다(실측: 한 시즌 40주 연속). 누가 깨졌는지 여기서 이름을 남긴다.
  for (const k of ["age", "ovr", "salary", "remainingYears", "proServiceYears"] as const) {
    const v = (ref as Record<string, unknown>)[k];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(
        `[로스터ref] ${entity.id}(${entity.name}) ${k}=${JSON.stringify(v)} ` +
        `— team=${entity.teamId} league=${entity.leagueId} status=${entity.status} named=${!!savedNpc}`,
      );
    }
  }
  return ref;
}

function getTeamProfile(teamId: string, g: import("../../stores/game").GameStoreState, m: import("../../stores/master").MasterState): ProTeamProfile | null {
  return g.proTeamProfiles[teamId] ?? m.teams.find(t => t.id === teamId)?.proTeamProfile ?? null;
}

/** 프로필이 없는 팀의 기본값 — **정본은 여기 하나다.**
 *  시즌 갱신(`seasonRollover.updateProTeamProfiles`)도 이걸 출발점으로 쓴다. */
export const DEFAULT_TEAM_PROFILE: ProTeamProfile = {
  ownerSpendingWillingness: 50, stability: 50, developmentFocus: 50,
  discipline: 50, ownerPatience: 50, winNowPressure: 50, scoutingQuality: 50,
  prestige: 50, marketAppeal: 50, clubhouseCulture: 50, medicalQuality: 50, farmInvestment: 50,
};

// 투수: ERA 2.50=80pt·4.00=50pt·6.00=10pt / 타자: OPS .900=85pt·.700=50pt·.550=20pt
// ⚠ 이 값은 `calcNpcRenewalSalaryNative`로 **엔진에 넘어간다.** 통계가
// 비면 NaN이 되고 `JSON.stringify`가 null로 바꿔 재계약 계산이 통째로
// 거부된다 — 국가대표·승강이 정확히 그렇게 죽어 있었다.
/**
 * NPC 성적 → 0~100 평점. **이 눈금의 정본은 여기 하나다.**
 *
 * 재계약 연봉이 쓰고, 오프시즌 방출 판정도 쓴다(`perfScores`). 표를 두 번
 * 두면 "재계약은 잘했다는데 방출 후보"가 나온다 — Phase 7에서 그 결함만 15건
 * 나왔다.
 *
 * 표본 미달이면 **50(중립)**을 준다. 방출 산식이 `50 - rating`이라 중립은
 * 압력 0이다 — 표본이 얇은 선수를 억울하게 자르지 않는다.
 */
export function calcNpcPerfScore(stats: PlayerSeasonStats): number {
  if (stats.type === "pitcher") {
    const ip = finiteOr(stats.ip);
    if (ip < 5) return 50;
    const eraPts   = Math.max(10, Math.min(95, 80 - (finiteOr(stats.era, 4.5) - 2.5) * 15));
    const gamesPts = Math.min(15, (finiteOr(stats.g) / 55) * 15);
    return Math.round(eraPts * 0.85 + gamesPts * 0.15);
  }
  if (finiteOr(stats.ab) < 30) return 50;
  const opsPts   = Math.max(10, Math.min(95, 50 + (finiteOr(stats.ops, 0.7) - 0.700) * 180));
  const gamesPts = Math.min(15, (finiteOr(stats.g) / 130) * 15);
  return Math.round(opsPts * 0.85 + gamesPts * 0.15);
}

// +1=급상승, -1=급하락, 0=변동없음 (투수 ERA ±1.5 / 타자 OPS ±.100 / 출전 급감)
function detectPerfSwing(curr: PlayerSeasonStats, prev: PlayerSeasonStats): number {
  if (curr.type !== prev.type) return 0;
  if (curr.type === "pitcher" && prev.type === "pitcher") {
    const eraDelta  = prev.era - curr.era;   // 낮을수록 좋음 → 개선이면 양수
    const gamesDrop = prev.g - curr.g;
    if (Math.abs(eraDelta) >= 1.5 || gamesDrop >= 20)
      return eraDelta >= 0 ? 1 : -1;
  } else if (curr.type === "batter" && prev.type === "batter") {
    const opsDelta  = curr.ops - prev.ops;   // 높을수록 좋음 → 개선이면 양수
    const gamesDrop = prev.g - curr.g;
    if (Math.abs(opsDelta) >= 0.100 || gamesDrop >= 30)
      return opsDelta >= 0 ? 1 : -1;
  }
  return 0;
}

/** 트레이드 사유 표시명 — **정본은 여기 하나다.** 모달·usecase가 같이 쓴다 */
export const TRADE_REASON_LABEL: Record<string, string> = {
  position_surplus:   "포지션 보강",
  injury_cover:       "부상 대체",
  seller_mode:        "전력 재편",
  buyer_mode:         "즉시전력 강화",
  expiring_contract:  "계약 만료 선점",
  player_ambition:    "선수 이적 요청",
};

const MEDICAL_SEVERITY_LABEL: Record<string, string> = {
  active_surgery:   "수술 부상",
  active_severe:    "중증 부상",
  active_moderate:  "중상 중",
  injury_history:   "부상 이력 다수",
  age_risk:         "고령 + 부상 이력",
  steroid_history:  "스테로이드 사용 이력",
};

export async function processTradeWindow(weekInYear: number, leagueId: string): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  if (s.pendingActions.some((a) => a.type === "trade")) return;

  const slotId = g.currentSlotId;
  if (!slotId) return;

  // ① 리그 전체 NPC 수집
  //
  // ⚠ **읽기 전에 저장을 확정한다.** 이 조회는 slot.db의 npc 테이블을 보는데,
  // 그 테이블은 `gameStore.save()`가 메모리에서 밀어넣는다. 자동 진행은 저장을
  // 주 경계까지 미루므로(P8-2a), 확정하지 않으면 **최대 한 주 낡은 팀·연봉·
  // 계약연수·OVR로 트레이드를 판정**한다. 그 주에 이미 이동한 선수가 옛 팀
  // 소속으로 보이는 것도 여기서 생긴다.
  //
  // 성능보다 데이터가 먼저다 — 트레이드 윈도우가 열리는 주에만 한 번 더 쓴다.
  await gameStore.flushSave();

  autoLog(`[트레이드윈도우] ${leagueId} W${weekInYear} 시작`);
  const _t0Trade = Date.now();
  const _npcRaw = JSON.parse(
    await window.projectB!.npcGetByLeague(JSON.stringify({ slotId, leagueId }))
  );
  if (!Array.isArray(_npcRaw)) {
    const errDetail = JSON.stringify(_npcRaw).slice(0, 120);
    autoLog(`[트레이드오류] ${leagueId}: npcGetByLeague 배열 아님 → ${errDetail}`);
    return;
  }
  autoLog(`[트레이드윈도우] ${leagueId} npcRows=${_npcRaw.length}`);
  type NpcTradeRow = {
    npcId: string; position: string; currentTeam: string; currentLeague: string;
    currentSalary: number; contractYears: number; proServiceYears: number;
    pitchOvr: number | null; batOvr: number | null; age: number;
    nationality?: string;
  };
  // npc_runtime 미초기화(새 게임 첫 시즌 saveSlot 전) 시 gameStore.npcs 메모리 폴백
  let npcRows: NpcTradeRow[];
  if (_npcRaw.length === 0) {
    const liveStats = get(npcLiveStatsStore);
    npcRows = g.npcs
      .filter(n => n.careerStatus === "active" && n.currentLeague === leagueId)
      .map(n => {
        const ls = liveStats[n.npcId];
        return {
          npcId:          n.npcId,
          position:       n.position ?? "",
          currentTeam:    n.currentTeam ?? "",
          currentLeague:  leagueId,
          currentSalary:  (n as any).currentSalary ?? 2000,
          contractYears:  (n as any).contractYears ?? 2,
          proServiceYears: n.proServiceYears ?? 0,
          pitchOvr:       ls?.pitching?.ovr ?? null,
          batOvr:         ls?.batting?.ovr  ?? null,
          age:            n.age ?? 25,
          nationality:    n.nationality,
        };
      });
    autoLog(`[트레이드윈도우] npc_runtime 미초기화 → 메모리 폴백 ${npcRows.length}명`);
  } else {
    npcRows = _npcRaw as NpcTradeRow[];
  }

  // 비활성 리그(v3 Lazy 미생성)면 스킵 — 낭비 연산·로그 노이즈 방지
  if (npcRows.length === 0) {
    autoLog(`[트레이드윈도우] ${leagueId} 로스터 없음 (비활성 리그) → 스킵`);
    return;
  }

  // ⚠ **외국인은 트레이드 대상에서 뺀다.** 1:1 교환이라 외국인↔내국인이
  // 성사되면 한 팀은 4명, 상대는 2명이 되어 보유 한도가 그 자리에서 깨진다.
  // 실제 KBO에서도 시즌 중 외국인 트레이드는 사실상 없다.
  // 연봉 총액은 전원으로 계산한다 — 페이롤에서 빠지면 안 된다.
  //
  // ⚠ **`isForeignPlayer(현소속, 국적)`으로는 못 잡는다.** 그건 "그 리그에서
  // 외국인인가"라 **JBL 선수는 JBL에서 내국인**이다. 해외를 열자 그대로
  // 통과해 KBL로 트레이드됐다(실측):
  //
  //     고야마 하야토  trade LEAGUE_JBL→LEAGUE_KBL
  //     Jordan Warren  trade LEAGUE_ABL→LEAGUE_KBL
  //
  // 같은 함정에 FA·드래프트에서도 걸렸다.
  //
  // 🔴 **다만 `isForeignInQuotaLeague(국적)`은 너무 넓었다.** 그건 "한도가
  // 있는 리그(KBL)에서 외국인인가"라 **USA·JPN이면 무조건 true**다. 그래서
  // ABL을 처리할 때 448명이 전원 걸러졌고 **ABL·JBL 트레이드가 0건**이었다
  // (실측: 트레이드 12건이 전부 KBL이었다).
  //
  // 물어야 할 건 **"지금 처리 중인 리그에서 외국인인가"**다. ABL 선수는
  // ABL에서 내국인이니 ABL 안에서는 이적할 수 있어야 한다.
  //
  // ⚠ **리그를 넘는 트레이드는 이 함수가 구조적으로 못 만든다** — 아래
  // `proTeams`가 `t.leagueId === leagueId`로 한 리그만 담고, 위 `npcRows`도
  // `n.currentLeague === leagueId`로 걸러진다. 주석의 JBL→KBL 사례가 다시
  // 나면 그 전제가 깨진 것이다 — `check:amateurworld`가 리그 교차를 본다.
  const tradableRows = npcRows.filter((n) => !isForeignPlayer(leagueId, n.nationality));

  const proTeams = m.teams.filter(
    (t) => t.leagueId === leagueId && t.id.endsWith("_1")
  );
  const isMyLeague = g.protagonist.leagueId === leagueId;
  const standings = isMyLeague ? s.standings : (s.leagueState[leagueId]?.standings ?? []);
  const sortedStandings = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const namedMap = new Map(g.npcs.map((n) => [n.npcId, n]));

  // ② TeamWithRoster 빌드
  const teamWithRosters = proTeams.map((team) => {
    const roster = tradableRows.filter((n) => n.currentTeam === team.id);
    const st = standings.find((st) => st.teamId === team.id);
    const winPct = st ? (st.wins / Math.max(1, st.wins + st.losses)) : 0.5;

    const injuredPositions = roster
      .filter((n) => {
        const inj = s.npcInjuries[n.npcId];
        return inj && (inj.severity === "severe" || inj.severity === "surgery" || inj.weeksLeft > 6);
      })
      .map((n) => n.position);

    const expiringContractIds = roster
      .filter((n) => n.contractYears <= 1)
      .map((n) => n.npcId);

    const profile = getTeamProfile(team.id, g, m) ?? DEFAULT_TEAM_PROFILE;
    const currentPayroll = npcRows
      .filter((n) => n.currentTeam === team.id)
      .reduce((sum, n) => sum + n.currentSalary, 0);

    return {
      teamId: team.id,
      leagueId,
      profile,
      activeRoster: roster.map((n) => n.npcId),
      farmRoster: [] as string[],
      salaryCap: 300000,
      currentPayroll,
      winPct,
      injuredPositions,
      expiringContractIds,
    };
  });

  if (teamWithRosters.length < 2) return;

  // ③ TradeAsset 빌드 (NPC 전체 + 주인공)
  const _tradeliveSt = get(npcLiveStatsStore);
  const buildNpcAsset = (n: typeof tradableRows[number]) => {
    const named = namedMap.get(n.npcId);
    const inj = s.npcInjuries[n.npcId];
    // pitch_ovr/bat_ovr가 DB에 NULL인 경우(deprecated 필드) npcLiveStats로 폴백
    const live = _tradeliveSt[n.npcId];
    const actualOvr = n.pitchOvr ?? n.batOvr ?? live?.pitching?.ovr ?? live?.batting?.ovr ?? 50;
    const careerInjuryCount = named?.injuryStatus ? 1 : 0;
    const hasSteroidHistory = false;
    return {
      playerId: n.npcId,
      teamId: n.currentTeam,
      position: n.position,
      age: n.age,
      ovr: actualOvr,
      trueOvr: actualOvr,
      salary: n.currentSalary,
      remainingYears: n.contractYears,
      isProspect: n.proServiceYears <= 2,
      personality: named?.personality ?? (() => {
        const h = n.npcId.split('').reduce((s, c) => s + c.charCodeAt(0), 0);
        return {
          loyalty:             40 + (h % 40),
          ambition:            30 + ((h * 7) % 65),
          greed:               25 + ((h * 3) % 55),
          competitiveDrive:    40 + ((h * 11) % 45),
          stabilityPreference: 25 + ((h * 13) % 60),
          professionalism:     50 + ((h * 5) % 30),
          overseasAmbition:     5 + ((h * 17) % 45),
          marketPreference:    35 + ((h * 19) % 45),
          homeTeamId:          null,
        };
      })(),
      injurySeverity: inj ? inj.severity : null,
      injuryWeeksLeft: inj?.weeksLeft ?? 0,
      careerInjuryCount,
      hasSteroidHistory,
    };
  };

  const allNpcAssets = tradableRows.map(buildNpcAsset);

  const proInjury = g.protagonist.injury;
  const proHistory = g.protagonist.injuryHistory ?? [];
  const protagonistAsset = {
    playerId: g.protagonist.id,
    teamId: g.protagonist.teamId,
    position: g.protagonist.primaryPosition ?? "SP",
    age: g.protagonist.age,
    ovr: g.protagonist.pitching?.ovr ?? g.protagonist.batting?.ovr ?? 60,
    trueOvr: g.protagonist.pitching?.ovr ?? g.protagonist.batting?.ovr ?? 60,
    salary: g.protagonist.contract?.salary ?? 0,
    remainingYears: g.protagonist.contract?.remainingYears ?? 0,
    isProspect: (g.protagonist.proServiceYears ?? 0) <= 2,
    personality: null,
    injurySeverity: proInjury?.severity ?? null,
    injuryWeeksLeft: proInjury?.recoveryWeeksLeft ?? 0,
    careerInjuryCount: proHistory.length,
    hasSteroidHistory: proInjury?.steroidUsed === true ||
      proHistory.some((h) => h.treatmentChoice === "steroid"),
  };

  const allAssets = isMyLeague
    ? [...allNpcAssets, protagonistAsset]
    : [...allNpcAssets];

  // ④ generateTradeProposals 호출
  const seasonStanding: Record<string, number> = {};
  sortedStandings.forEach((st, idx) => { seasonStanding[st.teamId] = idx + 1; });

  const genResult = JSON.parse(
    await window.projectB!.generateTradeProposalsNative(JSON.stringify({
      teams: teamWithRosters,
      allPlayers: allAssets,
      seasonStanding,
      totalTeams: proTeams.length,
      maxProposals: 8,
    }))
  ) as { proposals: Array<{
    proposingTeamId: string; receivingTeamId: string;
    offeringIds: string[]; requestingIds: string[];
    cash: number; mutualBenefitScore: number; reason: string;
  }> };

  const rosterSizes = teamWithRosters.map(t => `${t.teamId}:${t.activeRoster.length}`).join(", ");
  autoLog(`[트레이드] 팀로스터: ${rosterSizes}`);
  autoLog(`[트레이드] 제안 생성: ${genResult.proposals.length}건 | 자산풀: ${allAssets.length}명`);

  // ⑤ 각 proposal 처리
  let _tradeSuccess = 0, _tradeRejectValue = 0, _tradeRejectMedical = 0;
  const _tradeEventPlayers: PlayerEventEntry[] = [];
  const MAX_TRADES_PER_WINDOW = 5;

  // 이번 시즌 이미 트레이드된 선수 ID 수집 (시즌당 1회 제한)
  const _seasonTxRaw = JSON.parse(
    await window.projectB!.leagueGetTransactions(JSON.stringify({
      slotId, seasonYear: s.seasonYear, category: "trade", leagueId, limit: 500,
    }))
  ) as { playerId: string }[];
  const _tradedPlayerIds = new Set<string>(_seasonTxRaw.map((r) => r.playerId));

  for (const proposal of genResult.proposals) {
    if (_tradeSuccess >= MAX_TRADES_PER_WINDOW) break;
    const offeredId   = proposal.offeringIds[0];
    const requestedId = proposal.requestingIds[0];
    if (!offeredId || !requestedId) continue;
    if (_tradedPlayerIds.has(offeredId) || _tradedPlayerIds.has(requestedId)) continue;

    const offeredAsset  = allAssets.find((a) => a.playerId === offeredId);
    const requestedAsset = allAssets.find((a) => a.playerId === requestedId);
    if (!offeredAsset || !requestedAsset) continue;

    const receivingProfile = getTeamProfile(proposal.receivingTeamId, g, m) ?? DEFAULT_TEAM_PROFILE;

    // STEP A: 수신 팀 가치 평가
    const tradeEval = JSON.parse(
      await window.projectB!.evalTradeValueNative(JSON.stringify({
        teamProfile: receivingProfile,
        giving: [requestedAsset],
        receiving: [offeredAsset],
        cashAmount: proposal.cash,
        rosterNeeds: [],
        salaryCap: 300000,
        currentPayroll: teamWithRosters.find((t) => t.teamId === proposal.receivingTeamId)?.currentPayroll ?? 150000,
      }))
    ) as { netValue: number; acceptProbability: number };
    if (tradeEval.acceptProbability < 0.35) { _tradeRejectValue++; continue; }

    // STEP B: 메디컬 테스트 (제공 선수를 수신 팀이 검사)
    const medicalOffer = JSON.parse(
      await window.projectB!.evalMedicalTestNative(JSON.stringify({
        playerPosition: offeredAsset.position,
        playerAge: offeredAsset.age,
        injurySeverity: offeredAsset.injurySeverity,
        injuryWeeksLeft: offeredAsset.injuryWeeksLeft,
        careerInjuryCount: offeredAsset.careerInjuryCount,
        hasSteroidHistory: offeredAsset.hasSteroidHistory,
        receivingTeamMedicalQuality: receivingProfile.medicalQuality,
      }))
    ) as { pass: boolean; concernLevel: number; rejectionProbability: number; rejectionReason: string | null };

    if (!medicalOffer.pass) { _tradeRejectMedical++; continue; }

    // STEP C: 선수 거부 (noTrade 또는 personality 있는 선수)
    if (offeredAsset.personality) {
      const named = namedMap.get(offeredId);
      // noTrade: 현재 NpcSaveState에 contract 필드 없으므로 personality만으로 판단
      const hasNoTrade = false;
      if (hasNoTrade) {
        const recvStanding = sortedStandings.findIndex((st) => st.teamId === proposal.receivingTeamId) + 1;
        const playerResp = JSON.parse(
          await window.projectB!.playerEvalTradeResponseNative(JSON.stringify({
            // 선수·상대팀·주차를 섞는다 — 같은 제안이면 같은 답, 다른 팀이면 다른 답
            seed: seedOf(s.worldSeed ?? 0, s.seasonYear, weekInYear, offeredAsset.playerId ?? "", proposal.receivingTeamId),
            personality: offeredAsset.personality,
            currentTeamId: offeredAsset.teamId,
            destinationTeamProfile: receivingProfile,
            destinationTeamId: proposal.receivingTeamId,
            destinationStanding: recvStanding,
            totalTeams: proTeams.length,
            expectedPlayingTime: 0.7,
            hasNoTradeClause: true,
            currentSalary: offeredAsset.salary,
            newSalary: offeredAsset.salary,
            age: offeredAsset.age,
          }))
        ) as { accept: boolean; blockProbability: number };
        if (!playerResp.accept) continue;
      }
    }

    // STEP D: 주인공 포함 여부 분기
    const protagonistIsOffered  = offeredId   === g.protagonist.id;
    const protagonistIsReceived = requestedId === g.protagonist.id;

    if (protagonistIsOffered || protagonistIsReceived) {
      // 주인공이 제공되는 경우: 수신 팀이 주인공 메디컬 검사
      if (protagonistIsOffered) {
        const proMedical = JSON.parse(
          await window.projectB!.evalMedicalTestNative(JSON.stringify({
            playerPosition: protagonistAsset.position,
            playerAge: protagonistAsset.age,
            injurySeverity: protagonistAsset.injurySeverity,
            injuryWeeksLeft: protagonistAsset.injuryWeeksLeft,
            careerInjuryCount: protagonistAsset.careerInjuryCount,
            hasSteroidHistory: protagonistAsset.hasSteroidHistory,
            receivingTeamMedicalQuality: receivingProfile.medicalQuality,
          }))
        ) as { pass: boolean; rejectionReason: string | null };

        if (!proMedical.pass) {
          const teamName = m.teams.find((t) => t.id === proposal.receivingTeamId)?.name ?? proposal.receivingTeamId;
          const reasonText = proMedical.rejectionReason ? MEDICAL_SEVERITY_LABEL[proMedical.rejectionReason] ?? proMedical.rejectionReason : "이상 소견";
          gameStore.addMessage({
            id: `msg-trade-medical-fail-${s.seasonYear}-${weekInYear}`,
            category: "system",
            sender: `${teamName} 구단`,
            subject: "트레이드 협상 결렬",
            preview: "메디컬 테스트 통과 실패로 트레이드가 무산되었습니다.",
            body: `${teamName}과의 트레이드가 메디컬 테스트 통과 실패로 무산되었습니다.\n사유: ${reasonText}`,
            createdAt: `W${weekInYear}`,
            readAt: null,
          });
          continue;
        }
      }

      // 받는 선수(NPC) 메디컬 정보 수집 → TradeModal에 전달
      const receivedAsset = protagonistIsOffered ? requestedAsset : offeredAsset;
      const receivedInj = s.npcInjuries[receivedAsset.playerId];
      const receivedMedical = JSON.parse(
        await window.projectB!.evalMedicalTestNative(JSON.stringify({
          playerPosition: receivedAsset.position,
          playerAge: receivedAsset.age,
          injurySeverity: receivedAsset.injurySeverity,
          injuryWeeksLeft: receivedAsset.injuryWeeksLeft,
          careerInjuryCount: receivedAsset.careerInjuryCount,
          hasSteroidHistory: receivedAsset.hasSteroidHistory,
          receivingTeamMedicalQuality:
            getTeamProfile(g.protagonist.teamId, g, m)?.medicalQuality ?? 50,
        }))
      ) as { concernLevel: number; rejectionReason: string | null };

      const receivedName = namedMap.get(receivedAsset.playerId)?.name
        ?? m.entities.find((e) => e.id === receivedAsset.playerId)?.name
        ?? receivedAsset.playerId;

      let receivedMedicalNote: string | undefined;
      if (receivedMedical.concernLevel > 0.3 && receivedMedical.rejectionReason) {
        const weeksNote = receivedInj ? ` (회복 ${receivedInj.weeksLeft}주 남음)` : "";
        receivedMedicalNote = (MEDICAL_SEVERITY_LABEL[receivedMedical.rejectionReason] ?? "부상 이력") + weeksNote;
      }

      const fromTeamId   = protagonistIsOffered ? g.protagonist.teamId : proposal.proposingTeamId;
      const toTeamId     = protagonistIsOffered ? proposal.receivingTeamId : proposal.proposingTeamId;
      const toLeagueId   = m.teams.find(t => t.id === toTeamId)?.leagueId ?? g.protagonist.leagueId;

      seasonStore.pushPendingAction({
        type: "event",
        eventId: "EVT_TRADE_RUMOR",
        title: "트레이드 통보",
        description: `${TRADE_REASON_LABEL[proposal.reason] ?? proposal.reason} — 이적 제안이 들어왔습니다.`,
        choices: [{ id: "ok", label: "확인" }],
      });
      seasonStore.pushPendingAction({
        type: "trade",
        fromTeamId,
        toTeamId,
        toLeagueId,
        receivedNpcId:         receivedAsset.playerId,
        receivedNpcName:       receivedName,
        receivedOvr:           Math.round(receivedAsset.ovr),
        receivedPosition:      receivedAsset.position,
        receivedSalary:        receivedAsset.salary,
        tradeReason:           proposal.reason,
        receivedMedicalConcern: receivedMedical.concernLevel,
        receivedMedicalNote,
      });
      break; // 주인공 관련 트레이드는 한 번만
    }

    // STEP E: NPC-NPC 자동 실행
    await window.projectB!.npcSwapTeams(JSON.stringify({
      slotId,
      npcId1: offeredId,   teamId1: proposal.receivingTeamId,
      npcId2: requestedId, teamId2: proposal.proposingTeamId,
    }));
    // gameStore.npcs 팀 갱신 (모든 NPC는 Named NPC)
    {
      // ⚠ 예전엔 `currentTeam`만 갈았다. 같은 리그 안 거래라 국내에선 안
      // 드러났지만, 리그를 안 건드리면 목적지가 다른 리그일 때 소속이 어긋난다.
      const updatedNpcs = get(gameStore).npcs.map(n => {
        if (n.npcId === offeredId) {
          const t = proposal.receivingTeamId;
          return { ...n, currentTeam: t, currentLeague: leagueOfTeam(t) ?? n.currentLeague };
        }
        if (n.npcId === requestedId) {
          const t = proposal.proposingTeamId;
          return { ...n, currentTeam: t, currentLeague: leagueOfTeam(t) ?? n.currentLeague };
        }
        return n;
      });
      updateNpcsAndSync(updatedNpcs);
    }
    _tradedPlayerIds.add(offeredId);
    _tradedPlayerIds.add(requestedId);
    _tradeSuccess++;
    const _p1Name = namedMap.get(offeredId)?.name   ?? m.entities.find(e => e.id === offeredId)?.name   ?? offeredId;
    const _p2Name = namedMap.get(requestedId)?.name ?? m.entities.find(e => e.id === requestedId)?.name ?? requestedId;
    autoLog(`[트레이드성사] ${leagueId} W${weekInYear}: ${_p1Name} ↔ ${_p2Name} | 수락확률 ${tradeEval.acceptProbability.toFixed(2)} | ${TRADE_REASON_LABEL[proposal.reason] ?? proposal.reason}`);
    _tradeEventPlayers.push({
      npcId: offeredId, name: _p1Name,
      fromTeamId: proposal.proposingTeamId, toTeamId: proposal.receivingTeamId,
      fromLeagueId: leagueId, toLeagueId: leagueId,
      detail: `OVR:${Math.round(offeredAsset.ovr)} ${offeredAsset.position} ${offeredAsset.age}세 | 수락확률 ${tradeEval.acceptProbability.toFixed(2)}`,
    });
    _tradeEventPlayers.push({
      npcId: requestedId, name: _p2Name,
      fromTeamId: proposal.receivingTeamId, toTeamId: proposal.proposingTeamId,
      fromLeagueId: leagueId, toLeagueId: leagueId,
      detail: `OVR:${Math.round(requestedAsset.ovr)} ${requestedAsset.position} ${requestedAsset.age}세 | ${TRADE_REASON_LABEL[proposal.reason] ?? proposal.reason}`,
    });

    // 트레이드 결과 메시지 (뉴스 형식)
    const team1Name = m.teams.find((t) => t.id === proposal.proposingTeamId)?.name ?? proposal.proposingTeamId;
    const team2Name = m.teams.find((t) => t.id === proposal.receivingTeamId)?.name ?? proposal.receivingTeamId;
    const p1Name = namedMap.get(offeredId)?.name ?? m.entities.find((e) => e.id === offeredId)?.name ?? offeredId;
    const p2Name = namedMap.get(requestedId)?.name ?? m.entities.find((e) => e.id === requestedId)?.name ?? requestedId;
    gameStore.addMessage({
      id: `msg-npc-trade-${offeredId}-${requestedId}-${s.seasonYear}-w${weekInYear}`,
      category: "system",
      sender: "리그 사무국",
      subject: `트레이드 성사: ${team1Name} ↔ ${team2Name}`,
      preview: `${p1Name} ↔ ${p2Name}`,
      body: `[${team1Name}] ${p1Name} → [${team2Name}]\n[${team2Name}] ${p2Name} → [${team1Name}]\n사유: ${TRADE_REASON_LABEL[proposal.reason] ?? proposal.reason}`,
      createdAt: `W${weekInYear}`,
      readAt: null,
    });

    // 리그 거래 기록
    const tradeGroupId = `trade-${offeredId}-${requestedId}-${s.seasonYear}-${weekInYear}`;
    const reasonDetail = TRADE_REASON_LABEL[proposal.reason] ?? proposal.reason;
    await window.projectB!.leagueAddTransactions(JSON.stringify({
      slotId,
      rows: [
        {
          seasonYear: s.seasonYear, week: weekInYear, category: "trade",
          playerId: offeredId, playerName: p1Name,
          fromTeamId: proposal.proposingTeamId, fromLeagueId: leagueId,
          toTeamId: proposal.receivingTeamId,   toLeagueId: leagueId,
          detail: reasonDetail, groupId: tradeGroupId,
        },
        {
          seasonYear: s.seasonYear, week: weekInYear, category: "trade",
          playerId: requestedId, playerName: p2Name,
          fromTeamId: proposal.receivingTeamId, fromLeagueId: leagueId,
          toTeamId: proposal.proposingTeamId,   toLeagueId: leagueId,
          detail: reasonDetail, groupId: tradeGroupId,
        },
      ],
    }));
  }

  logEvent({
    // ⚠ `currentSlotId`는 **스토어 루트**에 있다 — `protagonist`가 아니다.
    //   예전엔 `g.protagonist.currentSlotId`라 항상 undefined였고, 그래서 이 ID가
    //   슬롯을 구분하지 못했다. 반환 타입이 넘어 TS가 안 잡았다.
    id: `trade-${leagueId}-W${weekInYear}-${g.currentSlotId ?? ""}`,
    type: "trade",
    seasonYear: s.seasonYear,
    week: weekInYear,
    leagueId,
    players: _tradeEventPlayers,
    counts: {
      input:     genResult.proposals.length,
      processed: _tradeSuccess,
      saved:     _tradeSuccess * 2,
    },
    dbOk: _tradeSuccess > 0,
    durationMs: Date.now() - _t0Trade,
    extra: `성사 ${_tradeSuccess} / 가치거절 ${_tradeRejectValue} / 의료거절 ${_tradeRejectMedical}`,
  });
}

// 팀의 1군/2군 선수 목록 반환 (팀 ID 기준)
function getTeamEntityRefs(
  teamId1: string,
  teamId2: string,
  entities: import("../../stores/master").EntityRow[],
  liveStats: import("../../stores/master").NpcLiveStats,
  namedMap: Map<string, import("../../types/save").NpcSaveState>,
  leagueStats: Record<string, Record<string, PlayerSeasonStats>> = {},
  now?: { seasonYear: number; month: number },
) {
  const build = (teamId: string) => entities
    .filter(e => e.role === "player" && e.teamId === teamId)
    .map(e => buildRosterRef(e, liveStats, namedMap.get(e.id), seasonPerfOf(e.id, leagueStats), now));
  return { active: build(teamId1), farm: build(teamId2) };
}

/**
 * 프로 1군 ↔ 2군 승강.
 *
 * **주인공과 무관하게 국내 10구단 전부 돈다.** 예전엔 `careerStage`가 프로일
 * 때만, 그것도 주인공 리그만 처리해서 — 주인공이 고교생이면 프로 세계의 승강이
 * 통째로 멈췄다. 드래프트가 매년 110명을 2군에 넣는데 아무도 안 올라왔다.
 * 국내 전 리그 풀 시뮬(DESIGN §2)의 전제와도 어긋난다.
 *
 * 경로가 둘이다 (사용자 확정 2026-07-30):
 *
 *   **월간 정기** (`urgentOnly` 없음) — 월 첫 주. 콜업과 콜다운을 같이 돌려
 *   로스터를 재편한다. 성적·능력치·연봉·팀 성향을 다 본다
 *
 *   **상시 콜업** (`urgentOnly: true`) — 나머지 주. **빈 자리 메우기만** 한다.
 *   부상이나 장기 부진으로 자리가 비었을 때 팀당 한 명. 콜다운은 안 돈다 —
 *   그건 재편이라 정기의 몫이다. 둘이 같은 일을 하면 매주 로스터가 출렁인다
 */
export async function processProTeamCallupCalldown(
  weekNum: number,
  opts: { urgentOnly?: boolean } = {},
): Promise<string[]> {
  const urgentOnly = opts.urgentOnly ?? false;
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const logs: string[] = [];

  const namedMap = new Map(g.npcs.map(n => [n.npcId, n]));
  // `MONTH_STARTS_1`은 `as const` 튜플이라 `indexOf`가 리터럴만 받는다.
  // 찾는 값은 런타임 주차라 읽기 전용으로 넓힌다 — 데이터는 그대로다.
  const monthIndex = (MONTH_STARTS_1 as readonly number[])
    .indexOf(s.schedule.find(e => e.week === weekNum)?.week ?? 0);
  const currentMonth = monthIndex >= 0 ? monthIndex + 1 : 6;

  // 로스터 상한은 규칙 파일이 정본이다 — 예전엔 여기 35가 박혀 있었고
  // 규칙 파일(34)과 달랐다 (드리프트)
  const rulesFile = await loadRosterRules();
  // ⚠ **모든 리그에 KBL 상한을 쓰고 있었다.** JBL은 32인데 34로 재면 두 명이
  // 영영 안 잘린다. 팀의 리그에서 읽는다 — 규칙 파일이 정본이다.
  const rosterMaxOf = (leagueId: string) =>
    rulesFile.rosterRules[leagueId]?.rosterMax ?? 34;
  const rosterMinOf = (leagueId: string) =>
    rulesFile.rosterRules[leagueId]?.rosterMin ?? 26;
  // 승강 판정은 성적을 주로 본다 (사용자 확정) — 규칙은 규칙 파일이 정본
  const promotionRules = rulesFile.promotionRules;
  // 등록말소 기간(주). 0이면 예전 동작이다 — 규칙 파일이 정본
  const lockWeeks = (promotionRules as { demotionLockWeeks?: number })
    ?.demotionLockWeeks ?? 0;
  const demotionWeek = g.demotionWeek ?? {};

  // 1군·2군 시즌 기록. 없으면 판정이 능력치만 보게 된다
  const leagueStats: Record<string, Record<string, PlayerSeasonStats>> = {};
  for (const lid of activeProLeaguesWithFarm()) {
    const ls = s.leagueState?.[lid];
    if (ls?.stats) leagueStats[lid] = ls.stats;
  }

  // ⚠ **승강이 KBL 전용이었다.** 확장팩을 열면 ABL·JBL은 채우는 경로(Rust
  // 오프시즌)는 있는데 **정리하는 경로가 없는 리그**가 된다 — 실측에서 1군이
  // 팀당 41·46명(상한 34·32)까지 부풀었다. Rust 캡은 정상이다(14 → 26).
  const proLeagueIds = activeProLeagues();
  const proTeams1 = m.teams.filter(t => proLeagueIds.includes(t.leagueId) && t.id.endsWith("_1"));

  // 국가대표 차출자는 **부상자와 같은 목록으로** 넘긴다 (사용자 확정) —
  // 따로 처리하면 대회 기간에 1군이 빈 채로 돈다
  const injuredIds = [
    ...Object.entries(s.npcInjuries ?? {})
      .filter(([, inj]) => (inj as any)?.severity !== "mild")
      .map(([id]) => id),
    ...Object.keys(s.nationalDuty ?? {}),
  ];

  const allMoves: Array<{ id: string; teamId: string }> = [];
  const _t0Callup = Date.now();
  const _callupEntries: PlayerEventEntry[] = [];
  const _calldownEntries: PlayerEventEntry[] = [];

  const _demotedIds: string[] = [];
  const label = urgentOnly ? "상시콜업" : "월간승강";
  autoLog(`[${label}] W${weekNum} 시작 | 대상팀 ${proTeams1.length}팀 | 부상자 ${injuredIds.length}명`);

  for (const team of proTeams1) {
    const teamId1 = team.id;
    // 상한·하한은 **그 팀의 리그**에서. JBL은 32, KBL·ABL은 34다
    const maxRosterSize = rosterMaxOf(team.leagueId);
    const minRosterSize = rosterMinOf(team.leagueId);
    const teamId2 = teamId1.replace(/_1$/, "_2");
    const profile  = getTeamProfile(teamId1, g, m) ?? DEFAULT_TEAM_PROFILE;

    // ── 부상자 명단(IL) ─────────────────────────────────────
    //
    // 🔴 **부상자가 정원을 차지하고 있었다.** 콜업 판정에서는 이미 빼는데
    //   (`injuredPlayerIds`) 정원 계산에는 남아서, 대체 선수가 올라오면
    //   상한을 넘었다 — 실측 0~6팀이 34명(JBL 32) 초과.
    //
    // 실제 야구의 IL 이 하는 일이 이것이다: **자리를 비운다.**
    // ⚠ 심각도 `mild` 는 안 넣는다 — 며칠 쉬는 것까지 명단에 올리면
    //   로스터가 매주 출렁인다. `injuredIds` 가 이미 그 기준이다.
    const { active, farm } = getTeamEntityRefs(
      teamId1, teamId2, m.entities, get(npcLiveStatsStore), namedMap, leagueStats,
      { seasonYear: s.seasonYear, month: currentMonth });
    const teamShort = teamId1.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
    // IL 등재자 — 이 팀 1군에서 부상·차출로 못 뛰는 사람
    const ilSet = new Set(injuredIds);
    const ilCount = active.filter((a) => ilSet.has(a.id)).length;
    // **정원은 IL 을 뺀 수로 잰다.** 상한 34에 IL 3명이면 37명까지 보유한다
    const activeCount = active.length - ilCount;

    // ── 등록말소 10일 (실제 KBO 규칙 · 주 단위라 2주) ──────
    //
    // 2군에 내린 선수를 바로 다시 올리면 승강이 의미가 없다 — 한 주 부진에
    // 내렸다가 다음 주에 올린다. 실제 규칙이 이걸 막는다.
    //
    // ⚠ **IL 예외를 넣지 않는다.** 처음엔 "부상자가 있으면 락 무시"로
    //   했는데 **거의 항상 풀렸다** — 실측 팀당 부상 2~3명이라 조건이
    //   늘 참이다. 락이 사실상 없는 것과 같았다.
    //   부상 대체는 **순증 콜업**(`urgentSlots`)이 이미 감당한다 —
    //   2군에 락 안 걸린 후보가 남아 있으므로 못 올리는 일은 없다.
    const lockedIds = new Set<string>();
    if (lockWeeks > 0) {
      for (const f of farm) {
        const w = demotionWeek[f.id];
        if (w != null && weekNum - w < lockWeeks) lockedIds.add(f.id);
      }
    }
    // 감독 승부처 판단이 "최근 성적을 얼마나 정확히 읽는가"를 정한다 (§7-5 F-1).
    // 낮은 감독은 이름값(OVR)만 보고 올린다
    const callupMod = staffModsOf(teamId1, m.entities).callup;

    // 콜업 — **락 걸린 선수는 후보에서 뺀다.** 엔진이 뽑은 뒤에 거르면
    //   "뽑았는데 못 올림"이 되어 그 주 콜업이 통째로 빈다
    const farmOk = lockedIds.size > 0
      ? farm.filter((f) => !lockedIds.has(f.id))
      : farm;
    if (farmOk.length > 0 && active.length > 0) {
      const callupRes = JSON.parse(
        await window.projectB!.evalCallupCandidatesNative(JSON.stringify({
          teamProfile: profile, farmPlayers: farmOk, activePlayers: active,
          injuredPlayerIds: injuredIds, currentMonth, promotionRules, callupMod,
        }))
      ) as { candidates?: Array<{ playerId: string; replacesPlayerId: string; reason: string }>; error?: string };

      // ⚠ 엔진이 역직렬화에 실패하면 `{error}`만 온다. 예전엔 그대로
      // `candidates.slice(...)`를 불러 **TypeError로 그 주 전체가 죽었다** —
      // 승강 뒤에 오는 성장·메시지·순위가 통째로 안 돌고, 원인은 어디에도
      // 안 남는다. 실측: 프로 3년차 W14부터 시즌 끝까지 40주 연속.
      if (callupRes.error || !callupRes.candidates) {
        throw new Error(`[승강] 콜업 판정 실패 ${teamId1}: ${callupRes.error ?? "candidates 없음"}`);
      }

      // 상시 경로는 **빈 자리 메우기만** — 부상·장기 부진으로 생긴 자리에
      // 팀당 한 명. 나머지 사유(전력 보강·유망주 노출)는 정기의 몫이다
      // `position_gap`도 상시 경로에 넣는다 — 포수가 0명인 팀을 월간 주기까지
      // 기다리게 하면 그 사이 경기가 그대로 돈다 (엔진 쪽 주석 참고)
      // ⚠ **IL 만큼 더 올린다.** 콜업은 1:1 교체(`replacesPlayerId`)라
      //   정원이 안 늘어난다 — IL 로 자리를 비워 놔도 채울 길이 없다.
      //   부상 3명이면 그 주에 최대 3명까지 올린다.
      //   ⚠ 정원(IL 제외)이 상한을 넘으면 안 올린다 — 순증이 무한하면
      //     IL 이 로스터 상한을 통째로 무력화한다.
      const urgentSlots = activeCount >= maxRosterSize
        ? 0
        : Math.max(1, Math.min(ilCount, maxRosterSize - activeCount));
      const picked = urgentOnly
        ? callupRes.candidates
            .filter(c => c.reason === "injury_replacement"
                      || c.reason === "slump_replacement"
                      || c.reason === "position_gap")
            .slice(0, urgentSlots)
        : callupRes.candidates.slice(0, 2);

      for (const c of picked) {
        allMoves.push({ id: c.playerId,         teamId: teamId1 });
        allMoves.push({ id: c.replacesPlayerId, teamId: teamId2 });
        _demotedIds.push(c.replacesPlayerId);
        const upName   = m.entities.find(e => e.id === c.playerId)?.name         ?? c.playerId;
        const downName = m.entities.find(e => e.id === c.replacesPlayerId)?.name ?? c.replacesPlayerId;
        const upOvr    = Math.round(farmOk.find(f => f.id === c.playerId)?.ovr ?? 0);
        autoLog(`[콜업] ${teamShort}: ${upName}(2군→1군,OVR:${upOvr}) ↑ | ${downName}(1군→2군) ↓ | 사유: ${c.reason}`);
        _callupEntries.push({ npcId: c.playerId, name: upName, fromTeamId: teamId2, toTeamId: teamId1, detail: `OVR:${upOvr} | ${c.reason}` });
        if (teamId1 === g.protagonist.teamId) logs.push(`[W${weekNum}] 팀 콜업: ${upName}`);
      }
    }

    // 콜다운 — 정기에만. 상시가 같이 돌면 매주 로스터가 출렁인다.
    // 하한 아래로는 안 내린다 (규칙 파일의 rosterMin) — 콜업은 1:1 교체라
    // 정원을 안 늘리는데 콜다운만 나가면 1군이 마른다
    // ⚠ **IL 을 뺀 수로 본다.** 부상자를 세면 하한을 넘은 줄 알고 내리는데,
    //   실제로 뛸 수 있는 사람은 그보다 적어 1군이 마른다.
    //
    // 🔴 **정원을 넘으면 상시에도 내린다.** 콜다운이 정기(월 첫 주)에만
    //   최대 2명이라 순증을 못 따라갔다 — 실측 4~12팀이 상한 초과.
    //   ⚠ IL 이 만든 문제가 아니다. IL 전에도 0~6팀이 넘었고 IL 이 그걸
    //     드러냈다. 상한이 원래 안 지켜지고 있었다.
    //   ⚠ **초과일 때만** 상시로 돈다 — 늘 돌면 매주 로스터가 출렁인다
    //     (바로 위 주석의 경고다).
    const overCap = activeCount > maxRosterSize;
    if ((!urgentOnly || overCap) && activeCount > minRosterSize) {
      const calldownRes = JSON.parse(
        await window.projectB!.evalCalldownCandidatesNative(JSON.stringify({
          teamProfile: profile, activePlayers: active,
          currentRosterSize: activeCount, maxRosterSize, promotionRules, callupMod,
        }))
      ) as { candidates?: Array<{ playerId: string }>; error?: string };

      if (calldownRes.error || !calldownRes.candidates) {
        throw new Error(`[승강] 콜다운 판정 실패 ${teamId1}: ${calldownRes.error ?? "candidates 없음"}`);
      }

      // 초과분만큼 내린다. 2명 고정이면 크게 넘친 팀이 여러 주 걸린다
      const cutN = overCap
        ? Math.max(2, activeCount - maxRosterSize)
        : 2;
      for (const c of calldownRes.candidates.slice(0, cutN)) {
        // 주인공도 강등된다 (사용자 확정 2026-07-30). 예전엔 여기서 건너뛰어
        // 주인공만 성적과 무관하게 1군에 남았다
        allMoves.push({ id: c.playerId, teamId: teamId2 });
        _demotedIds.push(c.playerId);
        const cdName = m.entities.find(e => e.id === c.playerId)?.name ?? c.playerId;
        const cdOvr  = Math.round(active.find(a => a.id === c.playerId)?.ovr ?? 0);
        autoLog(`[콜다운] ${teamShort}: ${cdName}(1군→2군,OVR:${cdOvr}) ↓`);
        _calldownEntries.push({ npcId: c.playerId, name: cdName, fromTeamId: teamId1, toTeamId: teamId2, detail: `OVR:${cdOvr} | 로스터 조정` });
        if (teamId1 === g.protagonist.teamId) logs.push(`[W${weekNum}] 팀 콜다운: ${cdName}`);
      }
    }
  }

  let _callupDbOk = true;
  // 🔴 **내려간 주차를 남긴다.** 이걸 안 저장하면 등록말소 기간을 못 잰다 —
  //   `demotionWeek` 는 세이브에도 실린다(앱을 껐다 켜도 유지).
  if (_demotedIds.length > 0) gameStore.markDemotions(_demotedIds, weekNum);

  // 등록말소 소식 — **주인공 팀 것만.** 리그 전체를 보내면 주당 수십 통이다.
  // ⚠ 기간(`lockWeeks`)을 문장에 넣는다 — 규칙 파일 값이 바뀌면 문장도 바뀐다.
  {
    const myTeam = g.protagonist.teamId;
    const mine = _demotedIds.filter((id) =>
      id === g.protagonist.id
      || (namedMap.get(id)?.currentTeam ?? "") === myTeam);
    if (mine.length > 0 && lockWeeks > 0) {
      const names = mine.map((id) =>
        namedMap.get(id)?.name ?? m.entities.find((e) => e.id === id)?.name ?? id);
      gameStore.addMessage({
        id: `msg-demote-${s.seasonYear}-w${weekNum}-${mine[0]}`,
        category: "system",
        sender: "구단 사무국",
        subject: `2군 등록말소 ${names.length}명`,
        preview: `${names.slice(0, 2).join(", ")}${names.length > 2 ? ` 외 ${names.length - 2}명` : ""}`,
        body: `${names.join("\n")}\n\n${lockWeeks}주간 1군 재등록이 불가하다.`,
        createdAt: `W${weekNum}`,
        readAt: null,
      });
    }
  }

  if (allMoves.length > 0) {
    // 팀 이동을 gameStore.npcs에 반영 → connectToGameStore 구독이 entities 자동 갱신
    //
    // ⚠ **리그도 같이 바꾼다.** 예전엔 `currentTeam`만 갈아서 2군으로 내려간
    // 선수가 계속 `LEAGUE_KBL` 소속으로 집계됐다 — 2군 리그 순위·경기에 안 잡히고
    // 1군 로스터 상한에는 계속 포함된다. 오프시즌 강등에서도 같은 결함이
    // 프로 소속을 800명까지 부풀렸다 (Phase 7-1 D-3a).
    const moveMap = new Map(allMoves.map(mv => [mv.id, mv.teamId]));
    const movedNpcs = get(gameStore).npcs
      .filter(n => moveMap.has(n.npcId))
      .map(n => {
        const toTeam = moveMap.get(n.npcId)!;
        const toLeague = leagueOfTeam(toTeam) ?? n.currentLeague;
        return {
          ...n,
          currentTeam: toTeam,
          currentLeague: toLeague,
          // ⚠ **1군에 등록되면 육성선수가 아니다** (KBO도 정식선수로 전환된다).
          // 안 풀면 콜업된 뒤에도 화면에 영영 "육성선수"로 남고, 다시 강등돼도
          // 그 신분이 따라다닌다 — 신분이 이력이 아니라 상태이기 때문이다.
          // 1군은 `_1`이 아니라 **2군이 아닌 곳**으로 본다: 리그가 정본이다
          ...(n.developmentSince != null && !toLeague.endsWith("_FARM")
            ? { developmentSince: undefined }
            : {}),
        };
      });
    if (movedNpcs.length > 0) gameStore.updateNpcs(movedNpcs);

    // 주인공이 승강 대상이면 소속 리그를 같이 옮긴다 — 2군 일정·순위표가
    // 이미 있으므로 leagueId만 맞으면 그대로 뛴다 (사용자 확정)
    const protoTo = moveMap.get(g.protagonist.id);
    if (protoTo) {
      const toLeague = leagueOfTeam(protoTo) ?? g.protagonist.leagueId;
      gameStore.setProtagonistTeam(protoTo, toLeague);
      logs.push(protoTo.endsWith("_2")
        ? `[W${weekNum}] 2군 강등 통보를 받았다.`
        : `[W${weekNum}] 1군 승격 통보를 받았다.`);
    }
  }

  if (_callupEntries.length > 0) {
    logEvent({ id: `callup-W${weekNum}`, type: "callup", seasonYear: s.seasonYear, week: weekNum,
      players: _callupEntries,
      counts: { input: proTeams1.length, processed: _callupEntries.length, saved: _callupEntries.length },
      dbOk: _callupDbOk, durationMs: Date.now() - _t0Callup });
  }
  if (_calldownEntries.length > 0) {
    logEvent({ id: `calldown-W${weekNum}`, type: "calldown", seasonYear: s.seasonYear, week: weekNum,
      players: _calldownEntries,
      counts: { input: proTeams1.length, processed: _calldownEntries.length, saved: _calldownEntries.length },
      dbOk: _callupDbOk, durationMs: Date.now() - _t0Callup });
  }
  autoLog(`[${label}] W${weekNum} 완료 | 콜업 ${_callupEntries.length}건 / 콜다운 ${_calldownEntries.length}건 | ${Date.now() - _t0Callup}ms`);

  return logs;
}

// W40 오프시즌 — 팀 Win-Now 압박 업데이트
export async function processWinNowPressureUpdate(weekNum: number): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  const proLeagues = activeProLeagues();
  const proTeams = m.teams.filter(t => proLeagues.includes(t.leagueId) && t.id.endsWith("_1"));

  for (const team of proTeams) {
    const profile = getTeamProfile(team.id, g, m) ?? DEFAULT_TEAM_PROFILE;

    // 각 팀의 소속 리그 순위 조회 (주인공 리그가 아닐 수 있으므로 leagueState 우선)
    const leagueStandings = s.leagueState[team.leagueId]?.standings ?? s.standings;
    const rank = [...leagueStandings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
      .findIndex(r => r.teamId === team.id) + 1;
    const totalTeams = proTeams.filter(t => t.leagueId === team.leagueId).length || 8;

    const res = JSON.parse(
      await window.projectB!.calcWinNowPressureUpdateNative(JSON.stringify({
        currentPressure: profile.winNowPressure,
        ownerPatience:   profile.ownerPatience,
        finalStanding:   rank || Math.ceil(totalTeams / 2),
        totalTeams,
        consecutiveMissedPlayoffs: 0,
        wonChampionship: false,
      }))
    ) as { newPressure: number };

    gameStore.patchProTeamProfile(team.id, { ...profile, winNowPressure: res.newPressure });
  }
}

// 리그별 순위 조회 헬퍼 (leagueState 우선, 없으면 protagonist standings 폴백)
export function getLeagueStandings(leagueId: string, s: import("../../types/season").SaveSeason) {
  // ⚠ `?? s.standings` 폴백을 뺐다 — 그건 주인공 리그 순위라, 버킷이 비었을 때
  // **엉뚱한 리그 순위를 그 리그 것으로 쓴다.** 비었으면 빈 채로 두는 게 맞다
  return leagueStandingsOf(s, leagueId);
}

// W43 오프시즌 — 전체 프로 NPC 은퇴/FA 결정
// 프로 NPC: save state 업데이트 (영구 반영)
// 배경 entity NPC: masterStore entities 인메모리 업데이트 (세션 내 반영)
export async function processOffseasonNpcDecisions(weekNum: number): Promise<string[]> {
  // 리그 연봉 배수 — **정본은 규칙 파일이다.** Rust에 표가 따로 있었고
  // 어긋나 있었다(독립 0.14 vs 0.35 · KBL 2군 0.3 vs 없음→1.0).
  // 못 읽으면 빈 지도를 넘겨 Rust가 옛 표로 떨어지게 둔다 — 0을 넘기면
  // 연봉이 통째로 무너진다
  const leagueMultMap: Record<string, number> = await (async () => {
    try {
      const r = await loadRosterRules() as {
        salaryRules?: { leagueMult?: Record<string, number> };
      };
      return r.salaryRules?.leagueMult ?? {};
    } catch { return {}; }
  })();
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const logs: string[] = [];
  const slotId = g.currentSlotId;

  const proLeagues = new Set(activeProLeagues());
  const proNpcCount = g.npcs.filter(n => n.careerStatus === "active" && n.currentLeague && proLeagues.has(n.currentLeague)).length;
  const _t0Offseason = Date.now();
  autoLog(`[W43오프시즌] 은퇴/FA 결정 시작 (프로NPC ${proNpcCount}명, careerStage=${g.protagonist.careerStage})`);

  const _retireEntries:  PlayerEventEntry[] = [];
  const _faApplyEntries: PlayerEventEntry[] = [];
  const _renewalEntries: PlayerEventEntry[] = [];
  const _adjustEntries:  PlayerEventEntry[] = [];
  let _faApplyCount = 0, _faDeclineCount = 0;

  // ── 프로 NPC 처리 (save state 업데이트) ──────────────────────
  const namedNpcs = g.npcs.filter(n =>
    n.careerStatus === "active" && n.currentLeague &&
    proLeagues.has(n.currentLeague)
  );

  const updatedNpcs = [...g.npcs];
  const namedRetirementRows: object[] = [];

  for (const npc of namedNpcs) {
    const entity = m.entities.find(e => e.id === npc.npcId);
    if (!entity) continue;
    const liveOvr = npcOvr(entity, get(npcLiveStatsStore));
    const profile  = getTeamProfile(npc.currentTeam, g, m) ?? DEFAULT_TEAM_PROFILE;

    // 은퇴 제안
    const retSuggest = JSON.parse(
      await window.projectB!.evalRetirementSuggestionNative(JSON.stringify({
        teamProfile: profile,
        player: buildRosterRef(entity, get(npcLiveStatsStore), npc),
        ovrTrend: (get(npcLiveStatsStore)[npc.npcId]?.peakOvr ?? liveOvr) - liveOvr,
        prospectOvrAtPosition: 65,
        currentSalary: (npc as any).currentSalary ?? 0,
        marketValue:   (npc as any).currentSalary ?? 1000,
      }))
    ) as { suggest: boolean; urgency: number };

    const npcPersonality = npc.personality ?? {
      loyalty: 50, ambition: 50, greed: 40, competitiveDrive: 50,
      stabilityPreference: 50, professionalism: 60, overseasAmbition: 30,
      marketPreference: 50, homeTeamId: null,
    };
    if (retSuggest.suggest) {
      const retResp = JSON.parse(
        await window.projectB!.playerEvalRetirementResponseNative(JSON.stringify({
          personality: npcPersonality,
          age: npc.age, ovr: liveOvr,
          ovrTrend: (get(npcLiveStatsStore)[npc.npcId]?.peakOvr ?? liveOvr) - liveOvr,
          proServiceYears: npc.proServiceYears ?? 0,
          otherTeamInterest: false,
        }))
      ) as { accept: boolean; seekOtherTeam: boolean };

      if (retResp.accept) {
        const idx = updatedNpcs.findIndex(n => n.npcId === npc.npcId);
        if (idx >= 0) updatedNpcs[idx] = { ...updatedNpcs[idx], careerStatus: "retired" };
        logs.push(`[W${weekNum}] ${npc.name} 은퇴`);
        autoLog(`[은퇴] ${npc.name} | ${npc.currentLeague?.replace("LEAGUE_", "")} | ${npc.age}세 | OVR:${Math.round(liveOvr)} | ${npc.proServiceYears ?? 0}년 | urgency:${retSuggest.urgency.toFixed(2)}`);
        _retireEntries.push({ npcId: npc.npcId, name: npc.name, fromTeamId: npc.currentTeam, fromLeagueId: npc.currentLeague ?? "", detail: `${npc.age}세 OVR:${Math.round(liveOvr)} | ${npc.proServiceYears ?? 0}년 통산` });
        namedRetirementRows.push({
          seasonYear: s.seasonYear, week: weekNum, category: "retirement",
          playerId: npc.npcId, playerName: npc.name,
          fromTeamId: npc.currentTeam, fromLeagueId: npc.currentLeague,
          detail: "오프시즌 은퇴",
        });
      }
    }

    // FA 자격 판단
    //
    // ⚠ **FA 경로가 둘이다.** Rust `run_offseason`에도 같은 판정이 있고
    // 거기만 막으면 이 TS 경로로 새어 나간다 — 용병이 FA를 선언하면
    // 재배치가 그를 아무 팀에나 넣어 보유 한도가 그 자리에서 깨진다.
    // 외국인은 단년 계약이라 연차로 자격을 쌓는 신분이 아니다.
    const league = npc.currentLeague ?? "";
    // ⚠ **한도가 있는 리그 기준으로 묻는다.** `isForeignPlayer(현소속, …)`은
    // ABL 선수를 ABL에서 내국인으로 보고 통과시킨다 — 그러면 FA가 되고,
    // Rust 재배치의 `original_league_id` 폴백이 `LEAGUE_KBL`이라 한국으로 온다.
    // 트레이드·드래프트에서도 같은 함정에 걸렸다.
    if (isForeignInQuotaLeague(npc.nationality)) continue;
    const faThreshold = getFaThreshold(league);
    if ((npc.proServiceYears ?? 0) < faThreshold) continue;
    // 🔴 **재취득 기간을 여기서 본다.** 예전엔 대신 `proServiceYears`를 0으로
    //    되돌려 막았는데, 그 값은 **연봉 산식의 입력**이라 FA를 신청한 순간
    //    몸값이 신인 수준으로 떨어졌다. Rust는 이미 재취득으로 고쳐져 있었고
    //    (`FA_REACQUIRE_YEARS`) 이 TS 경로만 남아 있었다.
    //    자세한 건 `faEngine.ts`의 `FA_REACQUIRE_YEARS` 주석에 있다.
    if (!canReacquireFa(npc.careerEvents, s.seasonYear)) continue;

    const leagueStd  = getLeagueStandings(league, s);
    const teamStandings = [...leagueStd].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const teamRank = teamStandings.findIndex(r => r.teamId === npc.currentTeam) + 1;

    const faRes = JSON.parse(
      await window.projectB!.playerEvalFaDecisionNative(JSON.stringify({
        // 선수·연도만 — 어느 팀이 물어도 그 선수의 판단은 같아야 한다
        seed: seedOf(s.worldSeed ?? 0, s.seasonYear, npc.npcId),
        personality: npcPersonality,
        age: npc.age, ovr: liveOvr,
        proServiceYears: npc.proServiceYears ?? 0,
        currentSalary:   (npc as any).currentSalary ?? 2000,
        marketValue:     (npc as any).currentSalary ?? 2000,
        teamStanding:    teamRank || 4,
        totalTeams:      teamStandings.length || 8,
        expectedPlayingTime: 0.7,
        leagueId:        league,
        fame:            npc.fame ?? 0,
      }))
    ) as { applyFa: boolean };

    if (faRes.applyFa) {
      const idx = updatedNpcs.findIndex(n => n.npcId === npc.npcId);
      if (idx >= 0) {
        const cur = updatedNpcs[idx];
        // LEAGUE_FREE_AGENT로 전환해야 Rust run_offseason step 8에서 리그별 재배치됨
        updatedNpcs[idx] = {
          ...cur,
          careerStatus:    "free_agent",
          originalLeagueId: cur.currentLeague,
          originalTeamId:   cur.currentTeam,
          currentLeague:   "LEAGUE_FREE_AGENT",
          currentTeam:     "",
          careerEvents: [
            ...(cur.careerEvents ?? []),
            { year: s.seasonYear, eventType: "fa_signed" as const,
              fromTeamId: cur.currentTeam, fromLeagueId: cur.currentLeague },
          ],
        };
      }
      _faApplyCount++;
      logs.push(`[W${weekNum}] ${npc.name} FA 신청`);
      autoLog(`[FA신청] ${npc.name} | ${league.replace("LEAGUE_", "")} | ${npc.proServiceYears}년 | OVR:${Math.round(liveOvr)} | loyalty:${npc.personality?.loyalty ?? "?"} greed:${npc.personality?.greed ?? "?"}`);
      _faApplyEntries.push({ npcId: npc.npcId, name: npc.name, fromTeamId: npc.currentTeam, fromLeagueId: league, detail: `${npc.proServiceYears}년 OVR:${Math.round(liveOvr)} | loyalty:${npc.personality?.loyalty ?? "?"} greed:${npc.personality?.greed ?? "?"}` });
    } else {
      _faDeclineCount++;
      // FA 미신청 = 팀에 재계약 의사 → loyalty 증가
      const newLoyalty = JSON.parse(
        await window.projectB!.updatePlayerLoyaltyNative(JSON.stringify({
          currentLoyalty:      npcPersonality.loyalty,
          eventType:           "contract_honor",
          eventMagnitude:      1.0,
          stabilityPreference: npcPersonality.stabilityPreference,
        }))
      ) as number;
      const idx = updatedNpcs.findIndex(n => n.npcId === npc.npcId);
      if (idx >= 0) {
        updatedNpcs[idx] = {
          ...updatedNpcs[idx],
          personality: { ...npcPersonality, loyalty: newLoyalty },
        };
      }
    }
  }

  // ── 명명 NPC 계약 연수 갱신 + 성적 기반 재계약/중간조정 ─────────
  {
    const npcContractUpdates: Array<{
      npcId: string; currentSalary: number; contractYears: number; proServiceYears: number;
    }> = [];
    const liveStats  = get(npcLiveStatsStore);
    const defaultPers = {
      loyalty: 50, ambition: 50, greed: 40, competitiveDrive: 50,
      stabilityPreference: 50, professionalism: 60, overseasAmbition: 30,
      marketPreference: 50, homeTeamId: null as null,
    };

    for (const npc of namedNpcs) {
      const cur = updatedNpcs.find(n => n.npcId === npc.npcId);
      if (!cur) continue;
      if (cur.careerStatus === "retired" || cur.careerStatus === "free_agent") continue;

      const newProSY       = (npc.proServiceYears ?? 0) + 1;
      const oldContractYrs = npc.contractYears ?? 1;
      const newContractYrs = Math.max(0, oldContractYrs - 1);
      let   newSalary      = npc.currentSalary ?? 0;
      let   finalYears     = newContractYrs;

      // 성적 데이터 — 올해(leagueState) vs 작년(careerHistory 마지막)
      const currStats = s.leagueState[npc.currentLeague ?? ""]?.stats[npc.npcId];
      const prevStats = npc.careerHistory.at(-1)?.stats;
      const perfScore = currStats ? calcNpcPerfScore(currStats) : 50;

      const entity  = m.entities.find(e => e.id === npc.npcId);
      const liveOvr = entity ? npcOvr(entity, liveStats) : 60;
      const pers    = npc.personality ?? defaultPers;

      if (newContractYrs <= 0) {
        // 계약 만료 → 실제 성적 반영 자동 갱신
        const profile = getTeamProfile(npc.currentTeam, g, m) ?? DEFAULT_TEAM_PROFILE;
        const [salaryRaw, yearsRaw] = await Promise.all([
          window.projectB!.calcNpcRenewalSalaryNative(JSON.stringify({
            ovr: liveOvr, age: npc.age,
            leagueId:         npc.currentLeague ?? "",
            currentSalary:    newSalary,
            performanceScore: perfScore,
            greed:            pers.greed,
            leagueMult:       leagueMultMap,
          })),
          window.projectB!.calcNpcContractYearsNative(JSON.stringify({
            age:                 npc.age,
            developmentFocus:    profile.developmentFocus,
            winNowPressure:      profile.winNowPressure,
            stabilityPreference: pers.stabilityPreference,
          })),
        ]);
        newSalary  = JSON.parse(salaryRaw) as number;
        finalYears = JSON.parse(yearsRaw) as number;
        autoLog(`[재계약] ${npc.name} | ${npc.currentLeague?.replace("LEAGUE_", "")} | OVR:${Math.round(liveOvr)} | 성적:${perfScore} | ${(npc.currentSalary ?? 0).toLocaleString()}만→${newSalary.toLocaleString()}만 / ${finalYears}년`);
        _renewalEntries.push({ npcId: npc.npcId, name: npc.name, fromTeamId: npc.currentTeam, fromLeagueId: npc.currentLeague ?? "", detail: `OVR:${Math.round(liveOvr)} 성적:${perfScore} | ${(npc.currentSalary ?? 0).toLocaleString()}만→${newSalary.toLocaleString()}만/${finalYears}년` });
      } else if (currStats && prevStats) {
        // 계약 기간 중 성적 급변 → 연봉만 조정 (기간 유지)
        const swing = detectPerfSwing(currStats, prevStats);
        if (swing !== 0) {
          const salaryRaw = await window.projectB!.calcNpcRenewalSalaryNative(JSON.stringify({
            ovr: liveOvr, age: npc.age,
            leagueId:         npc.currentLeague ?? "",
            currentSalary:    newSalary,
            performanceScore: perfScore,
            greed:            pers.greed,
            leagueMult:       leagueMultMap,
          }));
          const adjSalary = JSON.parse(salaryRaw) as number;
          // 10% 이상 차이날 때만 중간 조정
          if (Math.abs(adjSalary - newSalary) / Math.max(newSalary, 1) >= 0.10) {
            newSalary = adjSalary;
            autoLog(`[중간조정] ${npc.name} | 성적 ${swing > 0 ? "급등▲" : "급락▼"} | ${(npc.currentSalary ?? 0).toLocaleString()}만→${newSalary.toLocaleString()}만 (${swing > 0 ? "+" : ""}${Math.round((newSalary - (npc.currentSalary ?? 0)) / Math.max(1, npc.currentSalary ?? 1) * 100)}%) | 잔여 ${finalYears}년`);
            _adjustEntries.push({ npcId: npc.npcId, name: npc.name, fromTeamId: npc.currentTeam, fromLeagueId: npc.currentLeague ?? "", detail: `성적 ${swing > 0 ? "급등▲" : "급락▼"} | ${(npc.currentSalary ?? 0).toLocaleString()}만→${newSalary.toLocaleString()}만 (잔여 ${finalYears}년)` });
          }
        }
      }

      const idx = updatedNpcs.findIndex(n => n.npcId === npc.npcId);
      if (idx >= 0) {
        updatedNpcs[idx] = {
          ...updatedNpcs[idx],
          // proServiceYears는 Rust run_offseason이 +1 처리 — 여기서 증가시키면 double-increment 발생
          currentSalary:   newSalary,
          contractYears:   finalYears,
        };
      }
      // master_overlay.db 표시용으로는 +1 전달 (NpcSaveState는 Rust 결과로 덮어씀)
      npcContractUpdates.push({ npcId: npc.npcId, currentSalary: newSalary, contractYears: finalYears, proServiceYears: newProSY });
    }

    if (slotId && npcContractUpdates.length > 0) {
      const res = JSON.parse(
        await window.projectB!.npcUpdateContracts(JSON.stringify({ slotId, updates: npcContractUpdates }))
      ) as { ok?: boolean; error?: string };
      if (res.error) autoLog(`[계약갱신오류] ${res.error}`);
      else autoLog(`[계약갱신] 명명 NPC ${npcContractUpdates.length}명 갱신 완료`);
    }
  }

  // ── NPC FA 시장 정산 (§7-5 F-4 / 7-4 이월) ──────────────────
  //
  // 7-4가 엔진(`resolveFaMarketNative`)만 만들고 호출부가 없었다. 그동안 FA
  // 신청자는 `LEAGUE_FREE_AGENT`로만 바뀌고 **Rust run_offseason step 8이
  // 리그별로 무작위 재배치**하고 있었다 — 등급도 보상선수도 안 걸렸다.
  //
  // 좋은 선수부터 팀을 고르고 자리가 하나씩 줄어든다. 원소속도 경쟁에 낀다.
  const _faSignEntries: PlayerEventEntry[] = [];
  let _faMarketDbOk = true;
  const faMarketRows: Array<Record<string, unknown>> = [];
  {
    // ⚠ **외국인은 일반 FA 시장에 안 들어간다.** KBO의 외국인 보유 한도(팀당
    // 3명)는 전용 경로(`applyForeignTurnover`)가 지키는데, 해외 리그를 열면서
    // FA 시장 목적지에 KBL을 넣자 **ABL·JBL 선수가 그 경로를 우회해 들어왔다** —
    // 실측 팀당 최대 14명(한도 3), KBL 외국인 총 81명(정원 30).
    //
    // 반대 방향(한국 선수 → ABL·JBL)은 막지 않는다. 그쪽엔 보유 한도가 없고,
    // 그게 이번에 열려는 "해외 진출" 그 자체다.
    const faApplicants = updatedNpcs.filter(
      (n) => n.careerStatus === "free_agent"
        && n.currentLeague === "LEAGUE_FREE_AGENT"
        && proLeagues.has(n.originalLeagueId ?? "")
        // ⚠ **`isForeignPlayer(원소속, 국적)`으로 걸러선 안 된다.** 그 함수는
        // "그 리그에서 외국인인가"를 묻는데, ABL 선수는 ABL에서 내국인이라
        // **false가 돌아와 그대로 통과했다** — 처음 이렇게 짰다가 팀당 14명이
        // 17명으로 늘었다. 물어야 할 건 **목적지에서 외국인인가**다.
        && !isForeignInQuotaLeague(n.nationality),
    );

    if (faApplicants.length > 0) {
      const rulesFile = await loadRosterRules();
      const faRules = (rulesFile as unknown as { faRules?: unknown }).faRules;
      // 로스터 상한은 규칙 파일이 정본이다 — 코드에 두 번 적으면 그게 드리프트다
      // 리그마다 다르다 — 팀에서 파생한다 (JBL 32, KBL·ABL 34)
      const faMaxRosterOf = (leagueId: string) =>
        rulesFile.rosterRules[leagueId]?.rosterMax ?? 34;
      const liveStats2 = get(npcLiveStatsStore);
      const ovrOf = (npcId: string): number => {
        const e = m.entities.find((x) => x.id === npcId);
        return e ? npcOvr(e, liveStats2) : 60;
      };

      // 영입 가능한 1군 팀 — 상무는 제외한다 (군 복무팀이 FA를 영입하지 않는다)
      //
      // ⚠ **KBL 팀만 넘기고 있었다.** Rust FA 오퍼에는 ABL(OVR 70·명성 30)·
      // JBL(62·15) 경로가 있는데 목적지 팀을 안 주니 **NPC가 해외로 갈 방법이
      // 없었다.** 확장팩을 열어도 32팀이 관전 대상일 뿐이었다.
      const faLeagueIds = activeProLeagues();
      const proFirstTeams = m.teams.filter(
        (t) => faLeagueIds.includes(t.leagueId) && t.id.endsWith("_1") && !SANGMU_TEAM_IDS.has(t.id),
      );
      const activeOf = (teamId: string) =>
        updatedNpcs.filter((n) => n.currentTeam === teamId && n.careerStatus === "active");
      // ⚠ 엔진 `FaTeam.roster`는 **보상선수 후보**다(정원 계산은 `openSlots`가 따로 받는다).
      //
      // 외국인을 여기 넣으면 보상선수로 끌려간다 — OVR 내림차순에서 보호선수
      // 다음을 집는데 용병은 73~94라 거의 항상 그 자리에 걸린다. 실측에서
      // 5시즌 뒤 한 팀 4명(전원 투수)·다른 팀 2명이 됐고, 총원은 30 그대로라
      // **집계로는 정상처럼 보였다.** KBO도 외국인은 보상선수 대상이 아니다.
      //
      // ⚠ **한도가 있는 리그 기준으로 묻는다.** `isForeignPlayer(현소속, …)`은
      // JBL 선수를 JBL에서 내국인으로 보고 통과시킨다 — 한국 선수가 JBL 팀과
      // 계약하면 그 팀의 일본 선수가 **보상선수로 KBL에 온다**(실측
      // `다무라 렌 trade LEAGUE_JBL→LEAGUE_KBL`). 같은 함정에 FA·드래프트·
      // 트레이드에서도 걸렸다 — 이 함수를 문지기로 쓰던 자리가 다섯이었다.
      const compensationPoolOf = (teamId: string) =>
        activeOf(teamId)
          .filter((n) => !isForeignInQuotaLeague(n.nationality))
          .map((n) => ({ npcId: n.npcId, ovr: ovrOf(n.npcId) }));

      // 🔴 **예산 지수는 리그 안에서 잰다** (사용자 확정 2026-08-27).
      //
      //   예전엔 세 리그를 **합친 평균**으로 나눴다. 해외가 닫혀 있을 땐 리그가
      //   하나뿐이라 같은 뜻이었는데, 열자마자 **KBL FA 계약이 0건**이 됐다
      //   (실측 12시즌 × 6회 · 한 건도 없다). 예산이 이렇게 벌어져 있다:
      //
      //       KBL 10팀 평균   233억  (120억 ~ 350억)
      //       JBL 12팀 평균   997억  (4.3배)
      //       ABL 16팀 평균 1,972억  (8.5배)
      //
      //   합친 평균이 1,206억이라 KBL 지수가 0.19가 된다. 입찰식
      //   (`free_agency.rs`)이 **예산 지수 하나로만** 갈리므로 KBL 최강팀 최대
      //   입찰(0.65)이 ABL 최약팀 최소 입찰(0.56)과 겨우 붙는다 — 모든 FA가
      //   해외로 간다. 매년 60명이 신청하는데 아무도 KBL에 안 남았다.
      //
      // ⚠ **리그 격차를 여기서 표현하지 않는다.** 그건 이미 연봉 배수가
      //   한다(`salaryRules.leagueMult` ABL 3.5 · JBL 2.0) — 두 자리에서
      //   같은 말을 하면 격차가 두 번 곱해진다.
      // ⚠ 팀이 하나뿐인 리그도 지수 1이 되게 폴백을 둔다.
      const budgetByLeague = new Map<string, number[]>();
      for (const t of proFirstTeams) {
        const b = t.history?.budget ?? 0;
        if (b > 0) {
          const arr = budgetByLeague.get(t.leagueId) ?? [];
          arr.push(b);
          budgetByLeague.set(t.leagueId, arr);
        }
      }
      const avgBudgetOf = (leagueId: string): number => {
        const arr = budgetByLeague.get(leagueId);
        if (!arr || arr.length === 0) return 0;
        return arr.reduce((a, b) => a + b, 0) / arr.length;
      };

      const faTeams = proFirstTeams.map((t) => {
        const profile = getTeamProfile(t.id, g, m) ?? DEFAULT_TEAM_PROFILE;
        const avgBudget = avgBudgetOf(t.leagueId);
        return {
          teamId: t.id,
          budgetIndex: avgBudget > 0 ? (t.history?.budget ?? avgBudget) / avgBudget : 1,
          winNowPressure: profile.winNowPressure,
          // 정원까지 남은 자리 — **외국인도 자리를 차지한다.** 보상선수 후보에서만 뺀다
          openSlots: Math.max(0, faMaxRosterOf(t.leagueId) - activeOf(t.id).length),
          roster: compensationPoolOf(t.id),
        };
      });

      // 연봉 기준선도 프로 전체에서 — 리그 하나만 보면 해외 시세가 안 잡힌다
      const leagueSalaries = updatedNpcs
        .filter((n) => faLeagueIds.includes(n.currentLeague ?? "") && n.careerStatus === "active")
        .map((n) => n.currentSalary ?? 0)
        .filter((v) => v > 0);

      try {
        const market = JSON.parse(
          await window.projectB!.engine("resolveFaMarketNative", JSON.stringify({
            players: faApplicants.map((n) => ({
              npcId: n.npcId, name: n.name,
              fromTeamId: n.originalTeamId ?? "",
              position: n.position ?? "SP",
              ovr: ovrOf(n.npcId),
              age: n.age,
              salary: n.currentSalary ?? 0,
              form: 0,
            })),
            teams: faTeams,
            rules: faRules,
            leagueSalaries,
            seasonYear: s.seasonYear,
            worldSeed: (s.worldSeed ?? 0) >>> 0,
          }))
        ) as {
          error?: string;
          signings: Array<{
            npcId: string; name: string; fromTeamId: string; toTeamId: string;
            grade: string; salary: number; years: number;
            compensationNpcId: string | null; compensationMoney: number;
          }>;
          unsigned: string[];
        };

        if (market.error) throw new Error(market.error);

        for (const sg of market.signings) {
          const idx = updatedNpcs.findIndex((n) => n.npcId === sg.npcId);
          if (idx < 0) continue;
          const cur = updatedNpcs[idx];
          const stayed = sg.toTeamId === sg.fromTeamId;
          // ⚠ 예전엔 `currentLeague: "LEAGUE_KBL"` 하드코딩이었다. 목적지가
          // 해외 팀이어도 KBL로 기록돼 소속이 어긋났다 — 팀 ID에서 파생한다.
          const toLeague = leagueOfTeam(sg.toTeamId) ?? cur.currentLeague;
          updatedNpcs[idx] = {
            ...cur,
            careerStatus: "active",
            currentLeague: toLeague,
            currentTeam: sg.toTeamId,
            currentSalary: sg.salary,
            contractYears: sg.years,
            careerEvents: [
              ...(cur.careerEvents ?? []),
              {
                year: s.seasonYear,
                eventType: "fa_signed" as const,
                fromTeamId: sg.fromTeamId,
                fromLeagueId: leagueOfTeam(sg.fromTeamId) ?? cur.currentLeague,
                toTeamId: sg.toTeamId,
                toLeagueId: toLeague,
              },
            ],
          };

          // 보상선수 — 이적일 때만 나온다. 원소속 재계약이면 보상이 없다
          if (sg.compensationNpcId) {
            const ci = updatedNpcs.findIndex((n) => n.npcId === sg.compensationNpcId);
            if (ci >= 0) {
              const comp = updatedNpcs[ci];
              updatedNpcs[ci] = {
                ...comp,
                currentTeam: sg.fromTeamId,
                currentLeague: leagueOfTeam(sg.fromTeamId) ?? comp.currentLeague,
                careerEvents: [
                  ...(comp.careerEvents ?? []),
                  {
                    year: s.seasonYear, eventType: "trade" as const,
                    fromTeamId: comp.currentTeam, fromLeagueId: comp.currentLeague,
                    toTeamId: sg.fromTeamId, toLeagueId: leagueOfTeam(sg.fromTeamId) ?? comp.currentLeague,
                  },
                ],
              };
              faMarketRows.push({
                seasonYear: s.seasonYear, week: weekNum, category: "trade",
                playerId: comp.npcId, playerName: comp.name,
                fromTeamId: comp.currentTeam, fromLeagueId: comp.currentLeague,
                toTeamId: sg.fromTeamId, toLeagueId: leagueOfTeam(sg.fromTeamId) ?? comp.currentLeague,
                detail: `${sg.grade}등급 FA ${sg.name} 보상선수`,
              });
            }
          }

          const detail = stayed
            ? `${sg.grade}등급 원소속 잔류 | ${sg.salary.toLocaleString()}만/${sg.years}년`
            : `${sg.grade}등급 이적 | ${sg.salary.toLocaleString()}만/${sg.years}년`
              + (sg.compensationMoney > 0 ? ` | 보상금 ${sg.compensationMoney.toLocaleString()}만` : "");

          autoLog(`[FA계약] ${sg.name} | ${stayed ? "잔류" : "이적"} → ${sg.toTeamId.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "")} | ${detail}`);

          // 보상선수·보상금 소식 — **우리 팀이 주거나 받을 때만.**
          // ⚠ 리그 전체 FA 계약은 한 해 수십 건이다. 보상이 오간 것만,
          //   그중에서도 우리 팀이 걸린 것만 보낸다.
          {
            const myT = g.protagonist.teamId;
            const gave = sg.fromTeamId === myT;   // 우리가 내준다
            const got  = sg.toTeamId === myT;     // 우리가 데려온다
            const hasComp = !!sg.compensationNpcId || sg.compensationMoney > 0;
            if (!stayed && hasComp && (gave || got)) {
              const compName = sg.compensationNpcId
                ? (m.entities.find((e) => e.id === sg.compensationNpcId)?.name
                   ?? sg.compensationNpcId)
                : null;
              const lines = [
                `■ ${sg.name} (${sg.grade}등급) ${gave ? "이적" : "영입"}`,
                "",
                compName ? `보상선수  ${compName}` : "보상선수  없음(보상금만)",
                sg.compensationMoney > 0
                  ? `보상금    ${sg.compensationMoney.toLocaleString()}만원` : "",
              ].filter(Boolean);
              gameStore.addMessage({
                id: `msg-facomp-${s.seasonYear}-${sg.npcId}`,
                category: "system",
                sender: "리그 사무국",
                subject: gave
                  ? `FA 보상 — ${sg.name} 이적`
                  : `FA 보상 — ${sg.name} 영입`,
                preview: compName ? `보상선수 ${compName}` : "보상금 지급",
                body: lines.join(String.fromCharCode(10)),
                createdAt: `W${s.currentWeek}`,
                readAt: null,
              });
            }
          }
          _faSignEntries.push({
            npcId: sg.npcId, name: sg.name,
            fromTeamId: sg.fromTeamId, fromLeagueId: leagueOfTeam(sg.fromTeamId) ?? cur.currentLeague,
            toTeamId: sg.toTeamId, toLeagueId: toLeague,
            detail,
          });
          faMarketRows.push({
            seasonYear: s.seasonYear, week: weekNum, category: "fa",
            playerId: sg.npcId, playerName: sg.name,
            fromTeamId: sg.fromTeamId, fromLeagueId: leagueOfTeam(sg.fromTeamId) ?? cur.currentLeague,
            toTeamId: sg.toTeamId, toLeagueId: toLeague,
            detail,
          });
        }

        // 미계약자는 `LEAGUE_FREE_AGENT`로 남는다 — Rust `run_offseason`의
        // FA 재배치가 한 번 더 팀을 찾고, 그래도 안 되면 `fa_fallback`이
        // **원소속 재계약 → 은퇴**로 마무리한다.
        //
        // 🔴 예전엔 여기서 `Placer`(진로 배정)로 넘어갔다 — 미지명 졸업생·
        //   방출자와 한 통에서 대학·2군·독립 자리를 겨루고, 못 잡으면
        //   `quit_baseball`이었다. 실측 미계약자의 **64~71%가 야구를
        //   그만뒀다**(은퇴는 1~2%). 프로 5년차가 그렇게 끝나면 안 된다.
        if (market.unsigned.length > 0) {
          autoLog(`[FA미계약] ${market.unsigned.length}명 — 원소속 재계약 또는 은퇴`);
        }

        // ── FA 시장 뉴스 (§7-6b) ────────────────────────────────
        //
        // 7-4·F-4까지는 **로그로만** 있었다. 자동진행 로그는 개발용이라
        // 플레이어는 리그의 겨울에 무슨 일이 있었는지 볼 수 없었다.
        if (market.signings.length > 0) {
          emitFaMarketNews(market.signings, market.unsigned.length, weekNum, s.seasonYear, m, g.protagonist.teamId);
        }

        if (slotId && faMarketRows.length > 0) {
          const res = JSON.parse(
            await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: faMarketRows }))
          ) as { error?: string };
          if (res.error) { autoLog(`[FA기록오류] ${res.error}`); _faMarketDbOk = false; }
        }
      } catch (e) {
        // FA 시장이 못 돌아도 오프시즌 자체는 멈추지 않는다 —
        // 미계약자는 기존 경로(Rust 재배치)로 흘러간다
        autoLog(`[FA시장오류] ${e instanceof Error ? e.message : String(e)}`);
        _faMarketDbOk = false;
      }
    }
  }

  updateNpcsAndSync(updatedNpcs);

  let _retireDbOk = true;
  if (slotId && namedRetirementRows.length > 0) {
    autoLog(`[은퇴기록] NPC 은퇴 ${namedRetirementRows.length}명 DB 저장`);
    const res = JSON.parse(
      await window.projectB!.leagueAddTransactions(JSON.stringify({ slotId, rows: namedRetirementRows }))
    );
    if (res.error) { autoLog(`[은퇴기록오류] ${res.error}`); _retireDbOk = false; }
  }

  // 이벤트 로그 발행
  const _elapsed = Date.now() - _t0Offseason;
  if (_retireEntries.length > 0)
    logEvent({ id: `retire-W${weekNum}-${s.seasonYear}`, type: "retire", seasonYear: s.seasonYear, week: weekNum,
      players: _retireEntries, counts: { input: namedNpcs.length, processed: _retireEntries.length, saved: namedRetirementRows.length },
      dbOk: _retireDbOk, durationMs: _elapsed });

  if (_faApplyEntries.length > 0)
    logEvent({ id: `fa-apply-W${weekNum}-${s.seasonYear}`, type: "fa_apply", seasonYear: s.seasonYear, week: weekNum,
      players: _faApplyEntries,
      counts: { input: namedNpcs.length, processed: _faApplyCount, saved: _faApplyCount },
      dbOk: true, durationMs: _elapsed,
      extra: `신청 ${_faApplyCount} / 재계약의사 ${_faDeclineCount}` });

  if (_faSignEntries.length > 0)
    logEvent({ id: `fa-market-W${weekNum}-${s.seasonYear}`, type: "fa_result", seasonYear: s.seasonYear, week: weekNum,
      players: _faSignEntries,
      counts: { input: _faApplyCount, processed: _faSignEntries.length, saved: faMarketRows.length },
      dbOk: _faMarketDbOk, durationMs: Date.now() - _t0Offseason,
      extra: `계약 ${_faSignEntries.length} / 신청 ${_faApplyCount}` });

  if (_renewalEntries.length > 0)
    logEvent({ id: `renewal-W${weekNum}-${s.seasonYear}`, type: "renewal", seasonYear: s.seasonYear, week: weekNum,
      players: _renewalEntries, counts: { input: namedNpcs.length, processed: _renewalEntries.length, saved: _renewalEntries.length },
      dbOk: true, durationMs: _elapsed });

  if (_adjustEntries.length > 0)
    logEvent({ id: `adjust-W${weekNum}-${s.seasonYear}`, type: "adjustment", seasonYear: s.seasonYear, week: weekNum,
      players: _adjustEntries, counts: { input: namedNpcs.length, processed: _adjustEntries.length, saved: _adjustEntries.length },
      dbOk: true, durationMs: _elapsed });

  // 상태 일관성 검증
  const _gAfter = get(gameStore);
  const _mAfter = get(masterStore);
  const _proEntities = _mAfter.entities.filter(e => e.role === "player" && proLeagues.has(e.leagueId ?? ""));
  const _proNpcs     = _gAfter.npcs.filter(n => proLeagues.has(n.currentLeague ?? "") || proLeagues.has(n.originalLeagueId ?? ""));
  logVerify(`W${weekNum} 오프시즌 NPC 처리 완료 (${_elapsed}ms)`, [
    { name: `은퇴 ${_retireEntries.length}명 DB저장`, ok: _retireDbOk },
    { name: `FA신청 ${_faApplyCount} / 재계약의사 ${_faDeclineCount}`, ok: true },
    { name: `FA계약 ${_faSignEntries.length}명 (등급·보상선수 반영)`, ok: _faMarketDbOk,
      detail: _faSignEntries.length === 0 && _faApplyCount > 0 ? "신청자는 있는데 계약이 0 — 시장이 안 돌았다" : undefined },
    { name: `재계약 ${_renewalEntries.length} / 중간조정 ${_adjustEntries.length}`, ok: true },
    { name: `gameStore.npcs 프로 ${_proNpcs.length}명`, ok: _proNpcs.length > 0, detail: `entities 프로 ${_proEntities.length}명` },
  ]);

  return logs;
}

// W52 오프시즌 — 스카우트 능력치 향상
export async function processScoutingImprovement(): Promise<void> {
  const g = get(gameStore);
  const m = get(masterStore);

  const proLeagues = activeProLeagues();
  const proTeams = m.teams.filter(t => proLeagues.includes(t.leagueId) && t.id.endsWith("_1"));

  for (const team of proTeams) {
    const profile = getTeamProfile(team.id, g, m) ?? DEFAULT_TEAM_PROFILE;

    const res = JSON.parse(
      await window.projectB!.calcScoutingImprovementNative(JSON.stringify({
        currentQuality:         profile.scoutingQuality,
        scoutBudgetRatio:       profile.farmInvestment / 100.0 * 0.5,
        hiredScoutQuality:      null,
        consecutivePlayoffYears: 0,
      }))
    ) as { newQuality: number };

    gameStore.patchProTeamProfile(team.id, { ...profile, scoutingQuality: res.newQuality });
  }
}

// DEFAULT_TEAM_PROFILE은 선언부에서 이미 export한다 (중복 선언이 되므로 여기 넣지 않는다)
export { getTeamProfile };

// ── FA 시장 뉴스 (Phase 7-6b) ────────────────────────────────────
//
// **금액 순으로 자른다.** 계약 수십 건을 다 나열하면 아무도 안 읽는다 —
// 겨울의 큰 사건 몇 개만 남기고 나머지는 숫자로 요약한다.
function emitFaMarketNews(
  signings: Array<{
    npcId: string; name: string; fromTeamId: string; toTeamId: string;
    grade: string; salary: number; years: number;
    compensationNpcId: string | null; compensationMoney: number;
  }>,
  unsignedCount: number,
  weekNum: number,
  seasonYear: number,
  m: import("../../stores/master").MasterState,
  myTeamId: string,
): void {
  const teamName = (id: string) =>
    m.teams.find((t) => t.id === id)?.name ?? id.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");
  const won = (v: number) => (v >= 10000 ? `${(v / 10000).toFixed(1)}억` : `${v.toLocaleString()}만`);

  const moved = signings.filter((x) => x.toTeamId !== x.fromTeamId);
  const stayed = signings.filter((x) => x.toTeamId === x.fromTeamId);
  const top = [...signings].sort((a, b) => b.salary * b.years - a.salary * a.years).slice(0, 5);

  // 내 팀이 얽힌 건 따로 뽑는다 — 남의 팀 소식 사이에 묻히면 놓친다
  const mine = signings.filter((x) => x.toTeamId === myTeamId || x.fromTeamId === myTeamId);
  const mineLines = mine.map((x) =>
    x.toTeamId === myTeamId
      ? (x.fromTeamId === myTeamId
          ? `  · ${x.name} 잔류 (${x.grade}등급 · ${won(x.salary)}/년 ${x.years}년)`
          : `  · ${x.name} 영입 ← ${teamName(x.fromTeamId)} (${x.grade}등급 · ${won(x.salary)}/년)`)
      : `  · ${x.name} 이적 → ${teamName(x.toTeamId)}` +
        (x.compensationNpcId ? " (보상선수 발생)" : ""));

  gameStore.addMessage({
    id: `msg-fa-market-${seasonYear}-w${weekNum}`,
    category: "news",
    sender: "리그 사무국",
    subject: `${seasonYear} FA 시장 마감 — ${signings.length}건 계약`,
    preview: `이적 ${moved.length} · 잔류 ${stayed.length} · 미계약 ${unsignedCount}`,
    body: [
      `${seasonYear} 시즌 FA 시장이 마감됐습니다.`,
      "",
      `총 ${signings.length}건 계약 — 이적 ${moved.length}건 · 원소속 잔류 ${stayed.length}건` +
        (unsignedCount > 0 ? ` · 미계약 ${unsignedCount}명` : ""),
      "",
      "■ 대형 계약",
      ...top.map((x) =>
        `  · ${x.name} (${x.grade}등급) ${teamName(x.fromTeamId)}` +
        `${x.toTeamId === x.fromTeamId ? " 잔류" : ` → ${teamName(x.toTeamId)}`}` +
        ` · ${won(x.salary)}/년 ${x.years}년 (총 ${won(x.salary * x.years)})`),
      ...(mineLines.length > 0 ? ["", "■ 우리 팀", ...mineLines] : []),
      ...(unsignedCount > 0
        ? ["", `계약을 찾지 못한 ${unsignedCount}명은 독립리그행 또는 은퇴를 택하게 됩니다.`]
        : []),
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
  });
}
