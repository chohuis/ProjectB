import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { autoLog, logEvent, logVerify, type PlayerEventEntry } from "../../stores/autoAdvance";
import { getFaThreshold } from "../../utils/faEngine";
import type { PlayerSeasonStats } from "../../types/save";
import { MONTH_STARTS_1 } from "./growth";

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

function buildRosterRef(
  entity: import("../../stores/master").EntityRow,
  liveStats: import("../../stores/master").NpcLiveStats,
  savedNpc?: import("../../types/save").NpcSaveState,
): object {
  const p = (entity.details as EntityDetails)?.player;
  return {
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
  };
}

function getTeamProfile(teamId: string, g: import("../../stores/game").GameStoreState, m: import("../../stores/master").MasterState): ProTeamProfile | null {
  return g.proTeamProfiles[teamId] ?? m.teams.find(t => t.id === teamId)?.proTeamProfile ?? null;
}

const DEFAULT_TEAM_PROFILE: ProTeamProfile = {
  ownerSpendingWillingness: 50, stability: 50, developmentFocus: 50,
  discipline: 50, ownerPatience: 50, winNowPressure: 50, scoutingQuality: 50,
  prestige: 50, marketAppeal: 50, clubhouseCulture: 50, medicalQuality: 50, farmInvestment: 50,
};

// 투수: ERA 2.50=80pt·4.00=50pt·6.00=10pt / 타자: OPS .900=85pt·.700=50pt·.550=20pt
function calcNpcPerfScore(stats: PlayerSeasonStats): number {
  if (stats.type === "pitcher") {
    if (stats.ip < 5) return 50;
    const eraPts   = Math.max(10, Math.min(95, 80 - (stats.era - 2.5) * 15));
    const gamesPts = Math.min(15, (stats.g / 55) * 15);
    return Math.round(eraPts * 0.85 + gamesPts * 0.15);
  }
  if (stats.ab < 30) return 50;
  const opsPts   = Math.max(10, Math.min(95, 50 + (stats.ops - 0.700) * 180));
  const gamesPts = Math.min(15, (stats.g / 130) * 15);
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

const TRADE_REASON_LABEL: Record<string, string> = {
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

  const proTeams = m.teams.filter(
    (t) => t.leagueId === leagueId && t.id.endsWith("_1")
  );
  const isMyLeague = g.protagonist.leagueId === leagueId;
  const standings = isMyLeague ? s.standings : (s.leagueState[leagueId]?.standings ?? []);
  const sortedStandings = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const namedMap = new Map(g.npcs.map((n) => [n.npcId, n]));

  // ② TeamWithRoster 빌드
  const teamWithRosters = proTeams.map((team) => {
    const roster = npcRows.filter((n) => n.currentTeam === team.id);
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
    const currentPayroll = roster.reduce((sum, n) => sum + n.currentSalary, 0);

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
  const buildNpcAsset = (n: typeof npcRows[number]) => {
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

  const allNpcAssets = npcRows.map(buildNpcAsset);

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
      const updatedNpcs = get(gameStore).npcs.map(n => {
        if (n.npcId === offeredId)   return { ...n, currentTeam: proposal.receivingTeamId };
        if (n.npcId === requestedId) return { ...n, currentTeam: proposal.proposingTeamId };
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
      id: `msg-npc-trade-${offeredId}-${requestedId}-${weekInYear}`,
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
    id: `trade-${leagueId}-W${weekInYear}-${g.protagonist.currentSlotId ?? ""}`,
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
) {
  const active = entities
    .filter(e => e.role === "player" && e.teamId === teamId1)
    .map(e => buildRosterRef(e, liveStats, namedMap.get(e.id)));
  const farm = entities
    .filter(e => e.role === "player" && e.teamId === teamId2)
    .map(e => buildRosterRef(e, liveStats, namedMap.get(e.id)));
  return { active, farm };
}

// 프로팀 월간 콜업/콜다운 처리
export async function processProTeamCallupCalldown(weekNum: number): Promise<string[]> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const logs: string[] = [];
  const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(g.protagonist.careerStage);
  if (!isProStage) return logs;

  const namedMap = new Map(g.npcs.map(n => [n.npcId, n]));
  const monthIndex = MONTH_STARTS_1.indexOf(s.schedule.find(e => e.week === weekNum)?.week ?? 0);
  const currentMonth = monthIndex >= 0 ? monthIndex + 1 : 6;

  // 주인공 리그만 (R5, DESIGN.md §5)
  const proTeams1 = m.teams.filter(t => t.leagueId === g.protagonist.leagueId && t.id.endsWith("_1"));

  const injuredIds = Object.entries(s.npcInjuries ?? {})
    .filter(([, inj]) => (inj as any)?.severity !== "mild")
    .map(([id]) => id);

  const allMoves: Array<{ id: string; teamId: string }> = [];
  const _t0Callup = Date.now();
  const _callupEntries: PlayerEventEntry[] = [];
  const _calldownEntries: PlayerEventEntry[] = [];

  autoLog(`[콜업콜다운] W${weekNum} 시작 | 대상팀 ${proTeams1.length}팀 | 부상자 ${injuredIds.length}명`);

  for (const team of proTeams1) {
    const teamId1 = team.id;
    const teamId2 = teamId1.replace(/_1$/, "_2");
    const profile  = getTeamProfile(teamId1, g, m) ?? DEFAULT_TEAM_PROFILE;

    const { active, farm } = getTeamEntityRefs(teamId1, teamId2, m.entities, get(npcLiveStatsStore), namedMap);
    const teamShort = teamId1.replace(/^TEAM_[A-Z]+_/, "").replace(/_1$/, "");

    // 콜업
    if (farm.length > 0 && active.length > 0) {
      const callupRes = JSON.parse(
        await window.projectB!.evalCallupCandidatesNative(JSON.stringify({
          teamProfile: profile, farmPlayers: farm, activePlayers: active,
          injuredPlayerIds: injuredIds, currentMonth,
        }))
      ) as { candidates: Array<{ playerId: string; replacesPlayerId: string; reason: string }> };

      for (const c of callupRes.candidates.slice(0, 2)) {
        allMoves.push({ id: c.playerId,         teamId: teamId1 });
        allMoves.push({ id: c.replacesPlayerId, teamId: teamId2 });
        const upName   = m.entities.find(e => e.id === c.playerId)?.name         ?? c.playerId;
        const downName = m.entities.find(e => e.id === c.replacesPlayerId)?.name ?? c.replacesPlayerId;
        const upOvr    = Math.round(farm.find(f => f.playerId === c.playerId)?.ovr ?? 0);
        autoLog(`[콜업] ${teamShort}: ${upName}(2군→1군,OVR:${upOvr}) ↑ | ${downName}(1군→2군) ↓ | 사유: ${c.reason}`);
        _callupEntries.push({ npcId: c.playerId, name: upName, fromTeamId: teamId2, toTeamId: teamId1, detail: `OVR:${upOvr} | ${c.reason}` });
        if (teamId1 === g.protagonist.teamId) logs.push(`[W${weekNum}] 팀 콜업: ${upName}`);
      }
    }

    // 콜다운
    if (active.length > 0) {
      const calldownRes = JSON.parse(
        await window.projectB!.evalCalldownCandidatesNative(JSON.stringify({
          teamProfile: profile, activePlayers: active,
          currentRosterSize: active.length, maxRosterSize: 35,
        }))
      ) as { candidates: Array<{ playerId: string }> };

      for (const c of calldownRes.candidates.slice(0, 2)) {
        if (c.playerId === g.protagonist.id) continue;
        allMoves.push({ id: c.playerId, teamId: teamId2 });
        const cdName = m.entities.find(e => e.id === c.playerId)?.name ?? c.playerId;
        const cdOvr  = Math.round(active.find(a => a.playerId === c.playerId)?.ovr ?? 0);
        autoLog(`[콜다운] ${teamShort}: ${cdName}(1군→2군,OVR:${cdOvr}) ↓`);
        _calldownEntries.push({ npcId: c.playerId, name: cdName, fromTeamId: teamId1, toTeamId: teamId2, detail: `OVR:${cdOvr} | 로스터 조정` });
        if (teamId1 === g.protagonist.teamId) logs.push(`[W${weekNum}] 팀 콜다운: ${cdName}`);
      }
    }
  }

  let _callupDbOk = true;
  if (allMoves.length > 0) {
    // 팀 이동을 gameStore.npcs에 반영 → connectToGameStore 구독이 entities 자동 갱신
    const moveMap = new Map(allMoves.map(mv => [mv.id, mv.teamId]));
    const movedNpcs = get(gameStore).npcs
      .filter(n => moveMap.has(n.npcId))
      .map(n => ({ ...n, currentTeam: moveMap.get(n.npcId)! }));
    if (movedNpcs.length > 0) gameStore.updateNpcs(movedNpcs);
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
  autoLog(`[콜업콜다운] W${weekNum} 완료 | 콜업 ${_callupEntries.length}건 / 콜다운 ${_calldownEntries.length}건 | ${Date.now() - _t0Callup}ms`);

  return logs;
}

// W40 오프시즌 — 팀 Win-Now 압박 업데이트
export async function processWinNowPressureUpdate(weekNum: number): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  const proLeagues = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
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
  return s.leagueState[leagueId]?.standings ?? s.standings;
}

// W43 오프시즌 — 전체 프로 NPC 은퇴/FA 결정
// 프로 NPC: save state 업데이트 (영구 반영)
// 배경 entity NPC: masterStore entities 인메모리 업데이트 (세션 내 반영)
export async function processOffseasonNpcDecisions(weekNum: number): Promise<string[]> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const logs: string[] = [];
  const slotId = g.currentSlotId;

  const proLeagues = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
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
    const league = npc.currentLeague ?? "";
    const faThreshold = getFaThreshold(league);
    if ((npc.proServiceYears ?? 0) < faThreshold) continue;

    const leagueStd  = getLeagueStandings(league, s);
    const teamStandings = [...leagueStd].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    const teamRank = teamStandings.findIndex(r => r.teamId === npc.currentTeam) + 1;

    const faRes = JSON.parse(
      await window.projectB!.playerEvalFaDecisionNative(JSON.stringify({
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
          proServiceYears: 0,
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
    { name: `재계약 ${_renewalEntries.length} / 중간조정 ${_adjustEntries.length}`, ok: true },
    { name: `gameStore.npcs 프로 ${_proNpcs.length}명`, ok: _proNpcs.length > 0, detail: `entities 프로 ${_proEntities.length}명` },
  ]);

  return logs;
}

// W52 오프시즌 — 스카우트 능력치 향상
export async function processScoutingImprovement(): Promise<void> {
  const g = get(gameStore);
  const m = get(masterStore);

  const proLeagues = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
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

export { getTeamProfile, DEFAULT_TEAM_PROFILE };
