import { get } from "svelte/store";
import { seedOf } from "../../utils/seedOf";
import { loadRosterRules } from "../../repo/newGameV3";
import { seasonStore } from "../../stores/season";
import { gameStore } from "../../stores/game";
import { masterStore } from "../../stores/master";
import { autoLog } from "../../stores/autoAdvance";
// 의료팀 — 팀 성향에서 `medicalQuality` 를 읽는다
import { getTeamProfile } from "./market";
import { staffStatsOf, factorOf } from "../../utils/staffEffects";
import { loadRetirementRules, surgeryRetireChance } from "../retirement";
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
// ⚠ 이 자리에 확률표가 박혀 있었다. **주인공 경로가 생기면서 소비자가 둘이 됐고**,
// 표를 양쪽에 적으면 반드시 어긋난다. 정본은 `usecases/retirement.ts` →
// `generation_rules.json`의 `retirementRules.surgery`다.

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

  // 완치된 선수 → 복귀 처리 + OVR 영구 손실 적용
  //
  // ⚠ **`careerStatus`를 되돌리는 코드가 없었다.** 부상 발생 시
  // `updateNpcCareerStatus(id, "injured")`로 바꾸는데 완치 시 `active`로
  // 되돌리질 않아, 한 번 다친 NPC는 **영구히 `injured`로 남았다.**
  //
  // 실측: 시즌 중 고교 3,015명 중 **1,429명(47%)이 injured**.
  // `activeOnly` 조회에서 절반이 빠지니 로스터·순위·승강·트레이드·FA·
  // 드래프트 후보·성장에서 통째로 제외됐고, 시즌 종료에 초기화되면서
  // "인원이 롤오버마다 2배가 된다"처럼 보였다.
  // 완치자가 없는 주가 대부분이다 — 5,600건 Map을 그때마다 만들지 않는다
  const npcById = healed.length > 0
    ? new Map(g.npcs.map((n) => [n.npcId, n]))
    : null;
  for (const { playerId, entry } of healed) {
    // 은퇴한 선수는 되돌리지 않는다 — 수술 부상 은퇴가 여기로 오면 안 된다
    if (npcById?.get(playerId)?.careerStatus === "injured") {
      gameStore.updateNpcCareerStatus(playerId, "active");
    }
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
  // 🔴 **`s.schedule` 만 훑고 있었다 — 그건 주인공 리그 일정이다.**
  //   나머지 리그는 `s.leagueSchedules` 에 따로 있는데 안 봤다.
  //   그래서 **주인공이 고교생이면 프로 선수는 아무도 안 다쳤다.**
  //
  //   실측(씨앗 111 · 2시즌):
  //       고교(주인공 리그)  3,060명 중 부상 227~291명
  //       프로 1군+2군       2,600명 중 부상   0~6명
  //
  //   ⚠ 데이터는 다 있었다 — 배경 리그도 `playerLines` 를 만든다
  //     (KBL 780경기 16,345줄 · ABL 1,296경기 27,027줄). **보는 쪽만 좁았다.**
  //   ⚠ 증분 캐시(`lastScannedWeek`)라 리그가 늘어도 매주 새 주차만 훑는다.
  const allSchedules: (typeof s.schedule)[] = [s.schedule];
  for (const sch of Object.values(s.leagueSchedules ?? {})) {
    if (Array.isArray(sch)) allSchedules.push(sch);
  }
  for (const sched of allSchedules) {
    for (const entry of sched) {
      if (!entry.result || entry.week >= weekNum) continue;
      if (entry.week <= _injuryAppCache.lastScannedWeek) continue;
      for (const line of entry.result.playerLines) {
        if (line.playerId === protagonistId) continue;
        const ex = _injuryAppCache.playerData.get(line.playerId);
        if (ex) { ex.weeks.add(entry.week); }
        else     { _injuryAppCache.playerData.set(line.playerId, { role: line.role as "pitcher" | "batter", weeks: new Set([entry.week]) }); }
      }
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
  const [retireRollsRaw, resultRaw, retireRules] = await Promise.all([
    // 씨앗 — 안 넘기면 같은 세이브도 실행마다 다른 사람이 다치고 은퇴한다.
    // 주차·연도를 섞어 주마다 다른 수열이 되게 한다
    window.projectB!.weekRollRandomBatch(players.length, seedOf(s.worldSeed ?? 0, s.seasonYear, weekNum, "retire")),
    window.projectB!.weekCalcNpcInjuries(JSON.stringify({
      players, seed: seedOf(s.worldSeed ?? 0, s.seasonYear, weekNum, "injury"),
    })),
    loadRetirementRules(),
  ]);
  // 의료팀 규칙 — 없으면 안 돈다(예전 동작)
  const rulesFile = await loadRosterRules();
  const retireRolls = JSON.parse(retireRollsRaw) as number[];
  const result = JSON.parse(resultRaw) as { occurred: { playerId: string; injuryType: string; severity: string; recoveryWeeks: number }[] };

  // ── 의료팀 (4단계) ─────────────────────────────────────
  //
  // 🔴 `medicalQuality` 가 **트레이드 판정에만** 쓰이고 있었다.
  //   부상 회복은 팀과 무관해서 **의료 투자에 값이 없었다.**
  //
  // ⚠ 값은 규칙 파일이 정본이다(`medicalRules`). 없으면 안 돈다 —
  //   예전 동작이라 안전하다.
  // ⚠ **Rust 로 안 내렸다.** 이미 계산된 주 수에 팀 계수를 곱하는 것이라
  //   산식도 난수도 아니다 — `rosterEngine`(5단계)과 같은 갈래다.
  {
    const med = (rulesFile as { medicalRules?: {
      recoverySpan?: number; minWeeks?: number } }).medicalRules;
    if (med?.recoverySpan) {
      const span = med.recoverySpan;
      const minW = med.minWeeks ?? 1;
      const teamOf = new Map((g.npcs ?? []).map((n) => [n.npcId, n.currentTeam ?? ""]));
      for (const occ of result.occurred) {
        const tid = teamOf.get(occ.playerId) ?? "";
        if (!tid) continue;
        const q = getTeamProfile(tid, g, m)?.medicalQuality ?? 50;
        // 50이 1.0 — 좋을수록 짧아진다
        const mult = 1 - ((q - 50) / 50) * span;
        occ.recoveryWeeks = Math.max(minW, Math.round(occ.recoveryWeeks * mult));
      }
    }
  }

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
    // ⚠ **규칙이 없으면 조용히 넘어가면 안 된다.** `&& retireRules`로 건너뛰면
    // **부상 은퇴가 통째로 꺼진 채 아무 신호도 안 난다** — 은퇴가 안 나오는 게
    // 밸런스인지 결함인지 구분할 수 없게 된다. 규칙 파일이 깨졌다는 뜻이므로
    // 여기서 멈추는 게 맞다.
    if (isSurgery && !retireRules) {
      throw new Error("[부상은퇴] generation_rules.json에 retirementRules가 없다");
    }
    if (isSurgery && retireRules) {
      const npcSave = (g.npcs ?? []).find((n) => n.npcId === occ.playerId);
      const hasPriorSurgery = npcSave?.injuryStatus?.severity === "surgery";
      const retireChance = surgeryRetireChance(age, hasPriorSurgery, retireRules);
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
        // ⚠ 개별 메시지를 안 보낸다 — 월간 부상 소식의 **맨 위 등급**으로 간다.
        // 예전엔 부상 소식·은퇴 소식이 사람 수만큼 따로 날아왔다
        seasonStore.pushInjuryNews({
          npcId: occ.playerId, injuryType: occ.injuryType, severity: occ.severity,
          weeks: occ.recoveryWeeks, retired: true,
          teamId: entity?.teamId ?? "", week: weekNum,
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

    // ── 월간 부상 소식 버퍼 ────────────────────────────────
    //
    // ⚠ **가벼운 부상도 담는다.** 예전엔 수술·중증만 보냈는데, 그러면 화면이
    // "이번 달 부상 몇 건"을 말할 수 없다 — 심한 것만 세면 분모가 없다.
    // 등급 분류와 표시 여부는 화면이 정한다(`injuryReport.ts`).
    seasonStore.pushInjuryNews({
      npcId: occ.playerId, injuryType: occ.injuryType, severity: occ.severity,
      weeks: occ.recoveryWeeks, teamId: entity?.teamId ?? "", week: weekNum,
    });
  }
}
