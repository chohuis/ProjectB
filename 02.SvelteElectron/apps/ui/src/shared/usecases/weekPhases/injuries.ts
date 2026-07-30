import { get } from "svelte/store";
import { seasonStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { autoLog } from "../../stores/autoAdvance";
import { staffStatsOf, factorOf } from "../../utils/staffEffects";
import type { InjurySeverity, InjuryState, InjuryType } from "../../types/save";
import { INJURY_LABEL } from "../../types/save";

export function getPermanentPenalty(inj: InjuryState): Partial<Record<string, number>> {
  if (inj.type === "YIPS") {
    if (inj.treatmentChoice === "self")       return { control: -3, command: -3 };
    if (inj.treatmentChoice === "counseling") return { control: -1, command: -1 };
    return { control: -2, command: -2 };
  }
  type PenaltyMap = Partial<Record<InjuryType, Partial<Record<string, number>>>>;
  const table: PenaltyMap = {
    ELBOW_INFLAM:     { velocity: -1 },
    SHOULDER_INFLAM:  inj.treatmentChoice === "steroid" ? { velocity: -1 } : {},
    UCL_PARTIAL:      { velocity: -3, command: -2 },
    ROTATOR_STRAIN:   { velocity: -4, movement: -2 },
    BACK_HERNIATION:  { stamina: -3 },
    UCL_FULL:         { velocity: -4, stamina: -3 },
    ROTATOR_FULL:     { velocity: -6, movement: -5 },
    SHOULDER_SURGERY: { velocity: -2, stamina: -2 },
  };
  return table[inj.type] ?? {};
}

// NPC 수술 부상 회복 후 OVR 영구 손실 테이블
const NPC_INJURY_OVR_PENALTY: Partial<Record<InjuryType, number>> = {
  UCL_FULL:         -5,
  ROTATOR_FULL:     -8,
  SHOULDER_SURGERY: -4,
  UCL_PARTIAL:      -3,
  ROTATOR_STRAIN:   -4,
  BACK_HERNIATION:  -3,
  YIPS:             -2,
};

// 은퇴 확률 계산
function npcRetireChance(age: number, hasPriorSurgery: boolean): number {
  if (age >= 36) return 0.65;
  if (age >= 33) return 0.35;
  if (hasPriorSurgery) return 0.40;
  return 0.05;
}

// 부상 계산용 출전 이력 증분 캐시 — 매 시즌 시작 또는 슬롯 변경 시 자동 리셋
const _injuryAppCache = {
  seasonYear:      -1,
  slotId:          "",
  lastScannedWeek: -1,
  playerData:      new Map<string, { role: "pitcher" | "batter"; weeks: Set<number> }>(),
};

export async function processNpcInjuries(weekNum: number): Promise<void> {
  // ── 1. 회복 tick (weeksLeft - 1, 완치된 선수 목록 반환) ──────
  const healed = seasonStore.tickNpcInjuries();

  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);

  // 완치된 선수 → OVR 영구 손실 적용
  for (const { playerId, entry } of healed) {
    if (entry.permanentPenaltyApplied) continue;
    const delta = NPC_INJURY_OVR_PENALTY[entry.type] ?? 0;
    if (delta !== 0) seasonStore.patchNpcLiveOvr(playerId, delta);
  }

  // ── 2. 이번 주 새 부상 발생 계산 ────────────────────────────
  // 시즌 또는 슬롯 변경 시 캐시 리셋
  const currentSlotId = g.currentSlotId ?? "";
  if (_injuryAppCache.seasonYear !== s.seasonYear || _injuryAppCache.slotId !== currentSlotId) {
    _injuryAppCache.seasonYear      = s.seasonYear;
    _injuryAppCache.slotId          = currentSlotId;
    _injuryAppCache.lastScannedWeek = -1;
    _injuryAppCache.playerData.clear();
  }

  // 캐시에 없는 새 주차 항목만 증분 반영
  const protagonistId = g.protagonist.id;
  for (const entry of s.schedule) {
    if (!entry.result || entry.week >= weekNum) continue;
    if (entry.week <= _injuryAppCache.lastScannedWeek) continue;
    for (const line of entry.result.playerLines) {
      if (line.playerId === protagonistId) continue;
      const ex = _injuryAppCache.playerData.get(line.playerId);
      if (ex) { ex.weeks.add(entry.week); }
      else     { _injuryAppCache.playerData.set(line.playerId, { role: line.role as "pitcher" | "batter", weeks: new Set([entry.week]) }); }
    }
  }
  _injuryAppCache.lastScannedWeek = weekNum - 1;

  const playerData = _injuryAppCache.playerData;
  if (playerData.size === 0) return;

  const entityMap = new Map(m.entities.map((e) => [e.id, e]));

  // 부상 관리 = 팀 컨디셔닝 코치의 `discipline`.
  //
  // 예전엔 `manager.stats.injuryMgmt`를 읽었는데 그 키는 어디에도 없어
  // **모든 팀이 항상 50**이었다 — 즉 부상 관리라는 축이 존재하지 않았다.
  // 감독 5종에 부상 관련 능력치가 없으므로(전부 경기 운영 축이다) 코치 쪽의
  // "관리·규율"이 정본이다.
  const teamInjuryMgmt = new Map<string, number>();
  const injuryMgmtOf = (teamId: string): number => {
    if (!teamId) return 50;
    const cached = teamInjuryMgmt.get(teamId);
    if (cached !== undefined) return cached;
    const st = staffStatsOf(teamId, m.entities, { specialty: "컨디셔닝" });
    // 시설에 투자하는 구단이면 관리가 더 잘 먹힌다
    const val = st.discipline * factorOf("facilityInvestment", st.facilityInvestment);
    teamInjuryMgmt.set(teamId, val);
    return val;
  };

  type NpcEntry = { playerId: string; role: string; age: number; consecutiveApp: number; hasPriorInjury: boolean; isPlayingThrough: boolean; playingThroughSeverity: string | null };
  const players: NpcEntry[] = [];
  const retired = new Set(s.npcRetired ?? []);

  for (const [playerId, data] of playerData) {
    if (retired.has(playerId)) continue;
    const entity = entityMap.get(playerId);
    const age = ((entity?.details as { player?: { age?: number } } | undefined)?.player?.age) ?? 25;
    const existing = s.npcInjuries[playerId];
    if (existing) continue; // 이미 부상 중인 선수는 신규 부상 판정 제외

    const weeksSorted = [...data.weeks].sort((a, b) => b - a);
    let consecutiveApp = 0;
    let expected = weekNum - 1;
    for (const w of weeksSorted) {
      if (w === expected) { consecutiveApp++; expected--; }
      else break;
    }

    let role = data.role === "batter" ? "batter" : "RP";
    if (data.role === "pitcher" && entity) {
      const pos = ((entity.details as { player?: { position?: string } } | undefined)?.player?.position);
      if (pos === "SP" || pos === "RP" || pos === "CP") role = pos;
    }

    players.push({
      playerId, role, age, consecutiveApp,
      hasPriorInjury: false,
      isPlayingThrough: false,
      playingThroughSeverity: null,
    });
  }
  if (players.length === 0) return;

  // 은퇴 확률 판정용 난수 + NPC 부상 계산 병렬 실행
  const [retireRollsRaw, resultRaw] = await Promise.all([
    window.projectB!.weekRollRandomBatch(players.length),
    window.projectB!.weekCalcNpcInjuries(JSON.stringify({ players })),
  ]);
  const retireRolls = JSON.parse(retireRollsRaw) as number[];
  const result = JSON.parse(resultRaw) as { occurred: { playerId: string; injuryType: string; severity: string; recoveryWeeks: number }[] };

  let retireRollIdx = 0;

  for (const occ of result.occurred) {
    const entity = entityMap.get(occ.playerId);
    const injuryMgmt = injuryMgmtOf(entity?.teamId ?? "");
    const age = ((entity?.details as { player?: { age?: number } } | undefined)?.player?.age) ?? 25;
    const isSurgery = occ.severity === "surgery";
    const entityName = entity?.name ?? occ.playerId;
    const injuryLabel = INJURY_LABEL[occ.injuryType as InjuryType] ?? occ.injuryType;

    const playerDetails = entity?.details?.player;
    const teamName = m.teams.find((t) => t.id === entity?.teamId)?.name ?? "-";
    const position  = playerDetails?.position ?? "-";
    const handStr   = playerDetails
      ? playerDetails.playerType === "pitcher"
        ? (playerDetails.handedness === "L" ? "좌투" : "우투")
        : playerDetails.playerType === "batter"
        ? (playerDetails.handedness === "L" ? "좌타" : "우타")
        : (playerDetails.handedness === "L" ? "좌투좌타" : "우투우타")
      : "-";
    const playerInfoBlock = `\n\n▸ 소속팀:  ${teamName}\n▸ 포지션:  ${position} (${handStr})\n▸ 나이:    ${entity?.age ?? age}세`;

    // ── 은퇴 판정 (수술 발생 즉시) ──────────────────────────
    if (isSurgery) {
      const npcSave = (g.npcs ?? []).find((n) => n.npcId === occ.playerId);
      const hasPriorSurgery = npcSave?.injuryStatus?.severity === "surgery";
      const retireChance = npcRetireChance(age, hasPriorSurgery);
      const roll = retireRolls[retireRollIdx++ % retireRolls.length] ?? 0.5;

      if (roll < retireChance) {
        seasonStore.retireNpc(occ.playerId);
        gameStore.updateNpcCareerStatus(occ.playerId, "retired");
        const retLeague = entity?.leagueId ?? "";
        autoLog(`[부상은퇴] ${entityName} (${retLeague}, ${age}세, ${injuryLabel})`);
        if (g.currentSlotId) {
          window.projectB?.leagueAddTransactions(JSON.stringify({
            slotId: g.currentSlotId,
            rows: [{
              seasonYear: s.seasonYear,
              week: weekNum,
              category: "retirement",
              playerId: occ.playerId,
              playerName: entityName,
              fromTeamId: entity?.teamId ?? "",
              fromLeagueId: retLeague,
              detail: `${injuryLabel}로 인한 은퇴`,
            }],
          }));
        }
        gameStore.addMessage({
          id:        `msg-npc-retire-${occ.playerId}-w${weekNum}-${Date.now()}`,
          category:  "system",
          sender:    "리그 사무국",
          subject:   `은퇴 소식 — ${entityName}`,
          preview:   `${injuryLabel}로 인한 은퇴`,
          body:      `${entityName} 선수가 ${injuryLabel}을(를) 끝으로 현역에서 은퇴를 선언했습니다.\n\n재활보다 건강한 삶을 선택한 결정을 존중합니다.${playerInfoBlock}`,
          createdAt: `W${weekNum}`,
          readAt:    null,
        });
        continue; // 은퇴하면 부상 상태 등록 불필요
      }
    }

    // ── 부상 상태 등록 ────────────────────────────────────────
    let isPlayingThrough = false;
    if (!isSurgery) {
      if (occ.severity === "light")    isPlayingThrough = injuryMgmt < 70;
      if (occ.severity === "moderate") isPlayingThrough = injuryMgmt < 40;
    }

    seasonStore.setNpcInjury(occ.playerId, {
      type:                   occ.injuryType as InjuryType,
      severity:               occ.severity as InjurySeverity,
      weeksLeft:              occ.recoveryWeeks,
      totalWeeks:             occ.recoveryWeeks,
      isPlayingThrough,
      permanentPenaltyApplied: false,
    });

    // NpcSaveState 부상 상태 갱신
    gameStore.updateNpcCareerStatus(occ.playerId, "injured");

    // ── 수술 / 중증 → 리그 소식 메시지 ──────────────────────
    if (isSurgery || occ.severity === "severe") {
      gameStore.addMessage({
        id:        `msg-npc-injury-${occ.playerId}-w${weekNum}-${Date.now()}`,
        category:  "system",
        sender:    "리그 사무국",
        subject:   `부상 소식 — ${entityName} (${isSurgery ? "수술" : "중증"})`,
        preview:   `${injuryLabel} / 회복 ${occ.recoveryWeeks}주`,
        body:      `${entityName} 선수가 ${injuryLabel}으로 ${occ.recoveryWeeks}주 이탈 예정입니다.${isSurgery ? "\n\n수술이 필요한 상태로 이번 시즌 복귀는 어려울 수 있습니다." : ""}${playerInfoBlock}`,
        createdAt: `W${weekNum}`,
        readAt:    null,
      });
    }
  }
}
