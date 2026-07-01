import { get } from "svelte/store";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
import { autoLog, logEvent, logVerify, type PlayerEventEntry } from "../stores/autoAdvance";
import {
  updateNpcEmotion,
  makeMemory,
  reactivateNpc,
  checkTeamMoodWarning,
} from "../utils/emotionEngine";
import { checkEmotionTriggers, makeReunionMessage } from "../utils/emotionMessageEngine";
import type { WeeklyEmotionContext } from "../utils/emotionEngine";
import { simulateGame } from "../utils/gameSimulator";
import { rotationSizeForStage } from "../utils/rosterEngine";
import { calcTrainingGrowth } from "../utils/growthEngine";
import { runEventEngine } from "../utils/eventEngine";
import { applyWeeklyStudy, calcExamResult, getUniversityEffBonus, getUniversityExamGainMult } from "../utils/academicsEngine";
import { checkAchievements, computeMetrics } from "../utils/achievementEngine";
import { generateTop10, buildTop10Message, rankEffect } from "../utils/top10Engine";
import { isMonthStart, planMonthlyFriendlies, buildMonthlyNoticeMessage } from "../utils/friendlyMatchEngine";
import { calcOfferedSalaryForProtagonist, calcSeasonRating } from "../utils/salaryEngine";
import { isFaEligible, getFaThreshold } from "../utils/faEngine";
import type { LeagueSeasonState, MatchResult, PendingAction, PlayerCondition, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { InjurySeverity, InjuryHistoryEntry, InjuryState, InjuryType, NpcMemory, PitchingAttributes, PlayerSeasonStats, ProtagonistSave } from "../types/save";
import { INJURY_LABEL } from "../types/save";
import { toGameDate, generateHsPostseasonSemis, generateHsPostseasonFinal } from "../utils/scheduleGen";
import { assignProtagonistRole, assignHighschoolPosition, ROLE_DESCRIPTION, isReliefsRole, relieverWouldPitch } from "../utils/pitcherRoleEngine";
import {
  buildKblBracket, buildAblBracket, buildUnivBracket, buildIndBracket, buildJblBracket,
  applyGameToSeries, fillNextSeries, resolveNonProtagonistSeries,
  makeSeriesGame, nextGameNum,
} from "../utils/postseasonEngine";

// ── NPC 상태 업데이트 헬퍼 ───────────────────────────────────
// gameStore.updateNpcs → connectToGameStore 구독이 entities 자동 갱신
function updateNpcsAndSync(npcs: import("../types/save").NpcSaveState[]): void {
  gameStore.updateNpcs(npcs);
}

// ── 군입대 대상 판별 (nationality 기반) ──────────────────────
// nationality 없는 구버전 NPC는 originLeagueId로 폴백
function isKoreanMilitaryEligible(
  npc: import("../types/save").NpcSaveState | import("../stores/master").EntityRow,
  npcSave?: import("../types/save").NpcSaveState,
): boolean {
  const nationality = npcSave?.nationality
    ?? (npc as import("../types/save").NpcSaveState).nationality
    ?? ((npc as import("../stores/master").EntityRow).originLeagueId === "LEAGUE_ABL" ? "USA"
      : (npc as import("../stores/master").EntityRow).originLeagueId === "LEAGUE_JBL"  ? "JPN"
      : "KOR");
  return nationality === "KOR";
}

// ── 리그 표시명 ───────────────────────────────────────────────
const LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_HIGHSCHOOL:  "고교 리그",
  LEAGUE_KBL:         "KBL",
  LEAGUE_ABL:         "ABL",
  LEAGUE_UNIVERSITY:  "대학 리그",
  LEAGUE_INDEPENDENT: "독립 리그",
};

// 월간 순위표를 보낼 리그 목록 (주인공 소속 리그는 별도 처리)
const MONTHLY_STANDINGS_LEAGUES = new Set([
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
]);

const EXAM_EVENT_IDS = new Set(["EVT_HS_MIDTERM", "EVT_HS_FINAL"]);

// ── 고교 분기 Digest 상수 ─────────────────────────────────────
const HS_DIGEST_LEAGUES = [
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
] as const;
const HS_DIGEST_WEEKS = new Set([12, 24, 36]);
const HS_DIGEST_LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_KBL:         "KBL",
  LEAGUE_ABL:         "ABL",
  LEAGUE_JBL:         "JBL",
  LEAGUE_UNIVERSITY:  "대학",
  LEAGUE_INDEPENDENT: "독립",
};

// 순위·승률 기반 한 줄 코멘트
function teamComment(rank: number, total: number, winPct: number): string {
  if (rank === 1)     return winPct >= 0.65 ? "압도적 선두 — 드래프트 투자 여력 충분" : "선두 경쟁 중 — 전력 보강에 적극적";
  if (rank === total) return winPct <  0.35 ? "재건 모드 — 젊은 자원 선호"           : "최하위권 고전 — 마운드 보강 시급";
  if (winPct >= 0.55) return "상위권 경쟁 — 포스트시즌 진출 의지";
  if (winPct <= 0.40) return "하위권 — 내년 재건 준비 중";
  return "중위권 경쟁 중";
}

// 고교 2~3학년 분기 Digest 메시지 생성
function buildHsLeagueDigest(
  weekNum: number,
  weekInYear: number,
  hsGrade: number,
  leagueState: Record<string, LeagueSeasonState>,
  teamById: Map<string, string>,
  scoutScore: number,
): import("../types/main").MessageItem | null {
  const quarterLabel = weekInYear <= 12 ? "3~5월" : weekInYear <= 24 ? "6~8월" : "9~11월";
  const withComment  = hsGrade >= 3;
  const pctStr = (v: number) => `.${String(Math.round(v * 1000)).padStart(3, "0")}`;
  const parts: string[] = [];

  for (const lid of HS_DIGEST_LEAGUES) {
    const ls = leagueState[lid];
    if (!ls || ls.standings.length === 0) continue;
    const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    if (!sorted.some((s) => s.wins + s.losses > 0)) continue;

    const lName    = HS_DIGEST_LEAGUE_NAMES[lid] ?? lid;
    const top      = sorted[0];
    const last     = sorted[sorted.length - 1];
    const total    = sorted.length;
    const topName  = teamById.get(top.teamId)  ?? top.teamId;
    const lastName = teamById.get(last.teamId) ?? last.teamId;

    if (withComment) {
      parts.push(
        `■ ${lName}\n` +
        `  ${topName}  1위 (${pctStr(top.winPct)})  "${teamComment(1, total, top.winPct)}"\n` +
        `  ${lastName}  ${total}위 (${pctStr(last.winPct)})  "${teamComment(total, total, last.winPct)}"`,
      );
    } else {
      parts.push(`■ ${lName}    ${topName} 선두 / ${lastName} 최하위`);
    }
  }

  if (parts.length === 0) return null;

  // 스카우트 관심 구단 — KBL 상위팀, scoutScore 기반 노출 수
  const kblSorted = [...(leagueState["LEAGUE_KBL"]?.standings ?? [])]
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const hasKblData   = kblSorted.some((s) => s.wins + s.losses > 0);
  const scoutCount   = scoutScore >= 80 ? 4 : scoutScore >= 60 ? 3 : scoutScore >= 40 ? 2 : 1;
  const scoutTeams   = hasKblData ? kblSorted.slice(0, scoutCount) : [];

  let scoutSection = "";
  if (scoutTeams.length > 0) {
    const scoutLines = scoutTeams.map((st) => {
      const name    = teamById.get(st.teamId) ?? st.teamId;
      const rank    = kblSorted.findIndex((s) => s.teamId === st.teamId) + 1;
      const comment = withComment ? `  "${teamComment(rank, kblSorted.length, st.winPct)}"` : "";
      return `  ${name}${comment}`;
    });
    scoutSection = `\n\n▶ 스카우트 관심 구단\n${scoutLines.join("\n")}`;
  }

  const standingsHint = withComment
    ? "\n\n→ 세부 순위는 [기록] 탭에서 확인"
    : "\n\n→ 세부 순위는 [기록] 탭에서 확인 (3학년 진급 후 열람 가능)";

  const body = `[야구계 소식 — ${quarterLabel}]\n\n${parts.join("\n\n")}${scoutSection}${standingsHint}`;

  return {
    id:        `msg-hs-digest-w${weekNum}-${Date.now()}`,
    category:  "system",
    sender:    "리그 사무국",
    subject:   `야구계 소식 — ${quarterLabel}`,
    preview:   parts[0]?.split("\n")[0] ?? "",
    body,
    createdAt: `W${weekNum}`,
    readAt:    null,
  };
}

// ── 코치 관련 헬퍼 ───────────────────────────────────────────
function getPitchCoachName(teamId: string, entities: import("../stores/master").EntityRow[]): string {
  const coach = entities.find(
    e => e.role === "coach" && e.teamId === teamId &&
         (e.details as import("../stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  return coach?.name ?? "투수 코치";
}

// Rust xp_threshold(v) = 7.5 + v * 0.35 동일 공식
function xpThreshold(statVal: number): number { return 7.5 + statVal * 0.35; }
function xpPct(xp: number, statVal: number): number {
  return Math.min(99, Math.round(xp / xpThreshold(statVal) * 100));
}
function xpBar(pct: number): string {
  const filled = Math.round(pct / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled);
}

// 한글 2칸, 영문 1칸 기준으로 표시 너비 계산 후 패딩
function padLabel(s: string, width: number): string {
  let w = 0;
  for (const ch of s) { w += (ch.codePointAt(0) ?? 0) >= 0x1100 ? 2 : 1; }
  return s + " ".repeat(Math.max(0, width - w));
}

const PITCH_STAT_LABELS: Record<string, [string, (p: PitchingAttributes) => number]> = {
  velocity:    ["구속",    p => p.velocity],
  command:     ["커맨드",  p => p.command],
  control:     ["제구",    p => p.control],
  movement:    ["무브먼트",p => p.movement],
  stamina:     ["스태미나",p => p.stamina],
  mentality:   ["멘탈",   p => p.mentality],
  recovery:    ["회복력",  p => p.recovery],
  clutch:      ["위기집중",p => p.clutch],
  holdRunners: ["견제력",  p => p.holdRunners],
};

function makeTrainingMessage(
  week: number,
  logs: string[],
  protagonist: ProtagonistSave,
  coachName: string,
): MessageItem {
  const pit = protagonist.pitching;
  const xp  = protagonist.pitchingXP ?? {};

  const activeStats = Object.keys(PITCH_STAT_LABELS);

  const statsData: import("../types/main").TrainingStat[] = activeStats.map(s => {
    const [label, getter] = PITCH_STAT_LABELS[s]!;
    const val = getter(pit);
    const acc = xp[s as keyof typeof xp] ?? 0;
    const pct = xpPct(acc, val);
    const leveledUp = logs.some(l => l.includes(`${label} +`));
    return { key: s, label, pct, current: val, leveledUp };
  });

  const extraLogs = logs.filter(l => !l.startsWith("[훈련]"));
  const leveledLabels = statsData.filter(s => s.leveledUp).map(s => `${s.label} +1`);
  const preview = leveledLabels.length > 0
    ? `★ ${leveledLabels.join(", ")} 레벨업!`
    : `훈련 완료 — 컨디션 ${protagonist.condition} / 사기 ${protagonist.morale}`;

  const metadata: import("../types/main").TrainingMetadata = {
    type: "training",
    stats: statsData,
    condition: protagonist.condition,
    fatigue:   protagonist.fatigue,
    morale:    protagonist.morale,
    extraLogs,
  };

  return {
    id: `msg-train-w${week}-${Date.now()}`,
    category: "system",
    sender: coachName,
    subject: `W${week} 주간 훈련 결과`,
    preview,
    body: extraLogs.join("\n"),
    createdAt: `W${week}`,
    readAt: null,
    metadata,
  };
}

function makeExamMessage(week: number, subject: string, body: string): MessageItem {
  return {
    id: `msg-exam-w${week}-${Date.now()}`,
    category: "system",
    sender: "학업 시스템",
    subject,
    preview: body.split("\n")[0] ?? "",
    body,
    createdAt: `W${week}`,
    readAt: null,
  };
}

async function simulateNpcGame(homeTeamId: string, awayTeamId: string): Promise<MatchResult> {
  const entities = get(masterStore).entities;
  if (entities.length > 0) {
    return (await simulateGame(homeTeamId, awayTeamId, entities)).result;
  }
  autoLog(`[폴백SIM] 주인공리그 엔티티없음: ${homeTeamId} vs ${awayTeamId}`);
  const fb = JSON.parse(await window.projectB!.weekCalcNpcFallback(
    JSON.stringify({ homeTeamId, awayTeamId })
  )) as { homeScore: number; awayScore: number; winnerId: string; loserId: string };
  return { homeScore: fb.homeScore, awayScore: fb.awayScore, winnerId: fb.winnerId, loserId: fb.loserId, playerLines: [], events: [] };
}


export async function simulateProtagonistGame(homeTeamId: string, awayTeamId: string): Promise<MatchResult> {
  return simulateNpcGame(homeTeamId, awayTeamId);
}

function calcCareerStageYear(p: ProtagonistSave, seasonWeek: number, universityWeek: number): number {
  if (p.careerStage === "highschool") return Math.max(0, (p.grade ?? 1) - 1);
  if (p.careerStage === "university") return Math.floor(Math.max(0, universityWeek - 1) / 52);
  return Math.floor((seasonWeek - 1) / 52);
}

// 다음 미처리 경기 (gameDate 오름차순)
function nextUnresolvedGame(schedule: ScheduleEntry[]): ScheduleEntry | null {
  const pending = schedule.filter((e) => !e.result);
  if (pending.length === 0) return null;
  return pending.reduce((min, e) => (e.gameDate < min.gameDate ? e : min), pending[0]);
}

function getPermanentPenalty(inj: InjuryState): Partial<Record<string, number>> {
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

async function processNpcInjuries(weekNum: number): Promise<void> {
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

  const mgrInjuryMgmt = new Map<string, number>();
  for (const e of m.entities) {
    if (e.role === "manager") {
      const val = ((e.details as { manager?: { stats?: { injuryMgmt?: number } } } | undefined)?.manager?.stats?.injuryMgmt) ?? 50;
      mgrInjuryMgmt.set(e.teamId, val);
    }
  }

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
    const injuryMgmt = entity ? (mgrInjuryMgmt.get(entity.teamId) ?? 50) : 50;
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

// ── NPC 월간 성장 헬퍼 ────────────────────────────────────────

// MONTH_STARTS_1 기준 이전 달 주차 범위 반환
const MONTH_STARTS_1 = [1, 6, 10, 14, 19, 23, 27, 32, 36, 40, 45, 49];
function getPrevMonthRange(weekInYear: number): { start: number; end: number } {
  const idx = MONTH_STARTS_1.findIndex((w) => w === weekInYear);
  if (idx <= 0) return { start: 1, end: weekInYear - 1 };
  const start = MONTH_STARTS_1[idx - 1];
  const end   = weekInYear - 1;
  return { start, end };
}

// 이전 달 경기 결과에서 NPC별 ERA/AVG 집계
function aggregateMonthlyPerf(
  schedule: import("../types/season").ScheduleEntry[],
  startWeek: number,
  endWeek: number,
): Record<string, { gamesPlayed: number; era?: number; battingAvg?: number }> {
  const pitcherStats: Record<string, { er: number; ip: number }> = {};
  const batterStats:  Record<string, { h: number; ab: number }> = {};

  for (const entry of schedule) {
    if (!entry.result || entry.week < startWeek || entry.week > endWeek) continue;
    for (const line of entry.result.playerLines) {
      if (line.role === "pitcher") {
        const p = pitcherStats[line.playerId] ?? { er: 0, ip: 0 };
        pitcherStats[line.playerId] = { er: p.er + line.er, ip: p.ip + line.ip };
      } else {
        const b = batterStats[line.playerId] ?? { h: 0, ab: 0 };
        batterStats[line.playerId] = { h: b.h + line.h, ab: b.ab + line.ab };
      }
    }
  }

  const result: Record<string, { gamesPlayed: number; era?: number; battingAvg?: number }> = {};
  for (const [id, st] of Object.entries(pitcherStats)) {
    result[id] = { gamesPlayed: 1, era: st.ip > 0 ? Math.round((st.er * 9) / st.ip * 100) / 100 : undefined };
  }
  for (const [id, st] of Object.entries(batterStats)) {
    result[id] = { gamesPlayed: 1, battingAvg: st.ab > 0 ? Math.round((st.h / st.ab) * 1000) / 1000 : undefined };
  }
  return result;
}

// 모든 선수 NPC 주간 성장 처리 (매주 실행)
async function processWeeklyNpcGrowth(weekNum: number): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  const currentPhase = s.schedule.find((e) => e.week === weekNum)?.phase ?? "offseason";

  // 팀 컨텍스트 — 코치/감독 능력치 반영
  const teamContexts = m.teams.map((t) => {
    const mgr   = m.entities.find((e) => e.role === "manager" && e.teamId === t.id);
    const coach = m.entities.find((e) => e.role === "coach"   && e.teamId === t.id);
    return {
      teamId: t.id,
      facilityTier: t.tier ?? "독립",
      managerDevelopment: (mgr?.details as any)?.manager?.stats?.development ?? 50,
      coachTeaching:      (coach?.details as any)?.coach?.stats?.teaching    ?? 50,
    };
  });

  // 최근 4주 성적 집계 (1주 창은 미등판 선수를 누락시켜 성장 방향 왜곡)
  const prevWeek = weekNum - 1;
  const perfStartWeek = Math.max(1, prevWeek - 3);
  const allSchedule = [
    ...s.schedule.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek),
    ...Object.values(s.leagueSchedules).flatMap((sched) =>
      sched.filter((e) => e.result && e.week >= perfStartWeek && e.week <= prevWeek)
    ),
  ];
  const perfData = aggregateMonthlyPerf(allSchedule, perfStartWeek, prevWeek);

  // npcLiveStats에 있는 모든 NPC (master entity 기반)
  const namedFameMap = new Map(g.npcs.map(n => [n.npcId, n.fame ?? 0]));
  const npcs = m.entities
    .filter((e) => e.role === "player" && get(npcLiveStatsStore)[e.id])
    .map((e) => {
      const live = get(npcLiveStatsStore)[e.id];
      const p    = (e.details as import("../stores/master").EntityDetails)?.player;
      return {
        npcId:           e.id,
        teamId:          e.teamId,
        playerType:      p?.playerType ?? "pitcher",
        age:             e.age,
        developmentRate: p?.developmentRate ?? 50,
        potentialHidden: p?.potentialHidden ?? 75,
        pitching:        live?.pitching ?? p?.pitching,
        batting:         live?.batting  ?? p?.batting,
        pitchingXp:      live?.pitchingXp ?? {},
        battingXp:       live?.battingXp  ?? {},
        peakOvr:         live?.peakOvr,
        currentFame:     namedFameMap.get(e.id) ?? 0,
        pitches:         live?.pitches ?? p?.pitches ?? [],
        pitcherRole:     p?.position ?? "",
        pitchInTraining: live?.pitchInTraining,
      };
    });

  if (npcs.length === 0) return;

  const result = JSON.parse(
    await window.projectB!.npcCalcWeeklyGrowth(JSON.stringify({
      npcs,
      teamContexts,
      perfData,
      currentPhase,
      monthIndex: 0,  // 주간 모드에서는 사용 안 함
      pitchCatalogIds: m.pitchCatalog.map((p) => p.id),
    }))
  ) as { updated?: Array<{
    npcId: string;
    pitching?: any;
    batting?: any;
    pitchingXp: Record<string, number>;
    battingXp: Record<string, number>;
    peakOvr: number;
    fameDelta: number;
    pitches: Array<{ id: string; grade: 1 | 2 | 3 | 4 | 5 }>;
    pitchInTraining?: { id: string; progress: number; isNew: boolean };
  }>; error?: string };

  if (!Array.isArray(result.updated)) {
    console.error('[processWeeklyNpcGrowth] npcCalcWeeklyGrowth 실패:', result.error ?? result);
    return;
  }

  seasonStore.applyNpcLiveGrowth(result.updated);

  // fame 업데이트
  const fameDeltas = result.updated.filter(u => u.fameDelta !== 0 && namedFameMap.has(u.npcId));
  if (fameDeltas.length > 0) {
    const updatedNpcs = get(gameStore).npcs.map(n => {
      const delta = fameDeltas.find(u => u.npcId === n.npcId)?.fameDelta ?? 0;
      if (delta === 0) return n;
      return { ...n, fame: Math.max(0, Math.min(100, (n.fame ?? 0) + delta)) };
    });
    gameStore.updateNpcs(updatedNpcs);
  }
}

// ── 프로팀 엔진 헬퍼 ──────────────────────────────────────────

type EntityDetails  = import("../stores/master").EntityDetails;
type ProTeamProfile = import("../stores/master").ProTeamProfile;

function npcOvr(entity: import("../stores/master").EntityRow, liveStats: import("../stores/master").NpcLiveStats): number {
  const live = liveStats[entity.id];
  const p    = (entity.details as EntityDetails)?.player;
  return (live?.pitching?.ovr ?? p?.pitching?.ovr ?? live?.batting?.ovr ?? p?.batting?.ovr ?? 60) as number;
}

function buildRosterRef(
  entity: import("../stores/master").EntityRow,
  liveStats: import("../stores/master").NpcLiveStats,
  savedNpc?: import("../types/save").NpcSaveState,
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

function getTeamProfile(teamId: string, g: import("../stores/game").GameStoreState, m: import("../stores/master").MasterState): ProTeamProfile | null {
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

async function processTradeWindow(weekInYear: number, leagueId: string): Promise<void> {
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
  const _tradedPlayerIds = new Set<string>(); // 이미 트레이드된 선수 추적 (중복 방지)
  const MAX_TRADES_PER_WINDOW = 3;

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
  entities: import("../stores/master").EntityRow[],
  liveStats: import("../stores/master").NpcLiveStats,
  namedMap: Map<string, import("../types/save").NpcSaveState>,
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
async function processProTeamCallupCalldown(weekNum: number): Promise<string[]> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const logs: string[] = [];
  const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(g.protagonist.careerStage);
  if (!isProStage) return logs;

  const namedMap = new Map(g.npcs.map(n => [n.npcId, n]));
  const monthIndex = MONTH_STARTS_1.indexOf(s.schedule.find(e => e.week === weekNum)?.week ?? 0);
  const currentMonth = monthIndex >= 0 ? monthIndex + 1 : 6;

  const proLeagues = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
  const proTeams1  = m.teams.filter(t => proLeagues.includes(t.leagueId) && t.id.endsWith("_1"));

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
async function processWinNowPressureUpdate(weekNum: number): Promise<void> {
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
function getLeagueStandings(leagueId: string, s: import("../types/season").SaveSeason) {
  return s.leagueState[leagueId]?.standings ?? s.standings;
}

// W43 오프시즌 — 전체 프로 NPC 은퇴/FA 결정
// 프로 NPC: save state 업데이트 (영구 반영)
// 배경 entity NPC: masterStore entities 인메모리 업데이트 (세션 내 반영)
async function processOffseasonNpcDecisions(weekNum: number): Promise<string[]> {
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
async function processScoutingImprovement(): Promise<void> {
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

// ── 주간 처리 블록 ─────────────────────────────────────────────
// week 경계를 넘을 때 호출: 훈련·이벤트·시험·메신저·진로·업적·배경리그
// 반환: 새로 생긴 logs
async function processWeekBoundary(weekNum: number): Promise<string[]> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);
  const logs: string[] = [];

  // W1: 투수 포지션/역할 배정 + 시즌 시작 브리핑
  if (weekNum === 1 && g.protagonist.playerType === "pitcher") {
    if (g.protagonist.careerStage === "highschool") {
      // 고교: SP / RP 두 범주만 사용
      const pos = await assignHighschoolPosition(g.protagonist, m.entities);
      const posLabel = pos === "SP" ? "선발 투수" : "중계 투수";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(pos === "SP" ? "1선발" : "중간계투");
      gameStore.addMessage({
        id: `msg-season-brief-${Date.now()}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 보직: ${posLabel}`,
        body: `이번 시즌 당신의 보직은 [${posLabel}]로 배정되었습니다.\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
      });
      logs.push(`[보직 배정] ${posLabel}`);
    } else {
      // 프로(대학·독립 포함): 상세 역할 배정
      const role = await assignProtagonistRole(g.protagonist, m.entities);
      const pos: "SP" | "RP" | "CP" =
        role === "마무리" ? "CP" : isReliefsRole(role) ? "RP" : "SP";
      gameStore.setPosition(pos);
      gameStore.setCurrentRole(role);
      gameStore.addMessage({
        id: `msg-season-brief-${Date.now()}`,
        category: "system",
        sender: "코칭스태프",
        subject: `${s.seasonYear}시즌 시작 브리핑`,
        preview: `이번 시즌 역할: ${role}`,
        body: `이번 시즌 당신의 역할은 [${role}]로 배정되었습니다.\n\n${ROLE_DESCRIPTION[role]}\n\n팀과 함께 최고의 시즌을 만들어 가세요.`,
        createdAt: `W1`,
        readAt: null,
      });
      logs.push(`[역할 배정] ${role}`);
    }
  }

  // W1: 주인공 스냅샷 저장 + NPC 라이브 스탯 초기화 + 신규 입장 NPC 활성화
  if (weekNum === 1) {
    gameStore.saveSeasonStartSnapshot();

    const currentSeasonYear = s.seasonYear;

    // entry_year == currentSeasonYear인 신규 NPC: master.db 직접 조회 (store 미갱신)
    const yearEntrants = await masterStore.fetchEntryEntities(currentSeasonYear);
    if (yearEntrants.length > 0) {
      const { entityToNpcState } = await import("../utils/gradeAdvance");
      // HS 신입생 → gameStore.npcs에 Grade 1으로 추가
      const hsEntrants = yearEntrants.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e) => (e as any).entryLeague === "LEAGUE_HIGHSCHOOL",
      );
      if (hsEntrants.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newNpcs = hsEntrants.map((e) => entityToNpcState(e as any, currentSeasonYear));
        gameStore.addNpcs(newNpcs);
      }
      // Pro 즉전감 (ABL/JBL) → npcLiveStats 초기화 (팀 배정은 오프시즌 FA 처리)
      const proEntrants = yearEntrants.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (e) => ["LEAGUE_ABL", "LEAGUE_JBL"].includes((e as any).entryLeague ?? ""),
      );
      if (proEntrants.length > 0) seasonStore.initNpcLiveStats(proEntrants);
    }

    // 기존 선수 전체 → npcLiveStats 초기화 (미등록 항목만)
    const currentEntities = get(masterStore).entities;
    seasonStore.initNpcLiveStats(currentEntities, currentSeasonYear);
    // 프로 NPC 초기화: KBL/ABL/JBL 선수가 npcs에 없으면 master.db entities에서 변환·추가
    gameStore.initProNpcsIfMissing(currentEntities, currentSeasonYear);
    seasonStore.snapNpcSeasonStart();
  }

  const isUniversity = g.protagonist.careerStage === "university";
  const weekInYear   = ((weekNum - 1) % 52) + 1;

  // W3: 고교 리그 A/B조 편성 추첨식 참가 안내 메시지
  if (g.protagonist.careerStage === "highschool" && weekInYear === 3) {
    const drawMsgId = `msg-hs-group-draw-${s.seasonYear}`;
    if (!g.mailbox.some((m) => m.id === drawMsgId)) {
      gameStore.addMessage({
        id: drawMsgId,
        category: "system",
        sender: "고교야구연맹",
        subject: `${s.seasonYear} 고교리그 A/B조 편성 추첨식`,
        preview: "조 편성 추첨식이 개최됩니다. 참가 여부를 결정해 주세요.",
        body: [
          `${s.seasonYear}년도 고교 주말리그 A/B조 편성 추첨식을 개최합니다.`,
          "",
          "16개 팀이 무작위로 A조와 B조에 배정되며,",
          "같은 조 팀들과 정규 시즌을 치르게 됩니다.",
          "",
          "추첨식에 직접 참가하여 조 편성 결과를 확인하실 수 있습니다.",
        ].join("\n"),
        createdAt: `W${weekNum}`,
        readAt: null,
        decision: {
          prompt: "추첨식에 참가하시겠습니까?",
          options: [
            { id: "join_draw", label: "참가하기", effectHint: "추첨 연출 진행" },
            { id: "skip_draw", label: "참가 안함", effectHint: "자동 배정으로 확정" },
          ],
          selectedOptionId: null,
        },
      });
      seasonStore.pushPendingAction({ type: "message", messageId: drawMsgId });
      logs.push("[추첨식] A/B조 편성 추첨식 참가 안내 도착");
    }
  }

  if (isUniversity) gameStore.incrementUniversityWeek();

  const examGainMult  = isUniversity ? getUniversityExamGainMult(g.schoolState.universityMajor) : 1.0;
  const studyResult   = applyWeeklyStudy(g.schoolState, examGainMult);
  gameStore.applyWeeklyStudyResult(studyResult);

  const majorEffBonus = isUniversity ? getUniversityEffBonus(g.schoolState.universityMajor) : 0;

  const pitchCoach = m.entities.find(
    (e) => e.role === "coach" && e.teamId === g.protagonist.teamId &&
           (e.details as import("../stores/master").EntityDetails)?.coach?.specialty === "pitching"
  );
  const coachTeaching  = (pitchCoach?.details as import("../stores/master").EntityDetails)?.coach?.stats?.teaching ?? 50;
  const coachEffBonus  = Math.max(-0.10, Math.min(0.20, (coachTeaching - 50) * 0.004));
  const teamRef        = m.teams.find((t) => t.id === g.protagonist.teamId);
  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale        = g.protagonist.morale < 35;
  const newLowMoraleWeeks  = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpPenalty       = newLowMoraleWeeks >= 3 ? 0.70 : 1.0;
  const alreadyInjured     = !!g.protagonist.injury;

  // 훈련 강도 계산: TRN_RECOVERY / TRN_MENTAL_P / TRN_MENTAL_B 제외한 슬롯 비율
  const LOW_INTENSITY_PROGRAMS = new Set(["TRN_RECOVERY", "TRN_MENTAL_P", "TRN_MENTAL_B"]);
  const trnSlots = [g.trainingPlan.primaryProgramId, g.trainingPlan.secondaryProgramId, g.trainingPlan.secondary2ProgramId].filter((id): id is string => !!id);
  const highCount = trnSlots.filter(id => !LOW_INTENSITY_PROGRAMS.has(id)).length;
  const trainingIntensity = trnSlots.length > 0 ? highCount / trnSlots.length : 0;

  // 동일 부위 이전 부상 이력 여부 (moderate 이상)
  const hasPriorInjurySameArea = (g.protagonist.injuryHistory ?? []).some(h => h.severity !== "light");
  const randCount = m.eventPools.length + m.eventPools.reduce((s, p) => s + p.maxPicksPerWeek, 0);

  // ── 4개 독립 IPC 병렬 실행 (Phase 3) ──────────────────────────
  const [facilityEffModRaw, injuryCalcRaw, weeklyNetRaw, eventRandsRaw] = await Promise.all([
    window.projectB!.weekCalcFacilityEff(
      JSON.stringify({ careerStage: g.protagonist.careerStage, teamTier: teamRef?.tier ?? null })
    ),
    window.projectB!.weekCalcInjury(JSON.stringify({
      fatigue: g.protagonist.fatigue,
      consecutiveHighFatigueWeeks: g.protagonist.consecutiveHighFatigueWeeks ?? 0,
      hasInjury: alreadyInjured,
      currentInjuryType: g.protagonist.injury?.type ?? null,
      currentSeverity:   g.protagonist.injury?.severity ?? null,
      recoveryWeeksLeft: g.protagonist.injury?.recoveryWeeksLeft ?? null,
      playerType:        g.protagonist.playerType,
      age:               g.protagonist.age,
      condition:         g.protagonist.condition,
      trainingIntensity,
      consecutiveLowMoraleWeeks: g.protagonist.consecutiveLowMoraleWeeks ?? 0,
      hasPriorInjurySameArea,
      priorSteroidUsed: g.protagonist.injury?.steroidUsed ?? false,
    })),
    window.projectB!.weekCalcWeeklyNet(
      JSON.stringify({ careerStage: g.protagonist.careerStage, salary: g.protagonist.contract?.salary ?? null })
    ),
    window.projectB!.weekRollRandomBatch(randCount),
  ]);
  const facilityEffMod = JSON.parse(facilityEffModRaw) as number;
  const injuryCalc = JSON.parse(injuryCalcRaw) as { injuryUpdate: { type: string; severity: string; recoveryWeeksLeft: number } | null; justOccurred: boolean; justHealed: boolean; effMod: number; newConsecutiveHighFatigueWeeks: number; source: string | null };
  const weeklyNet = JSON.parse(weeklyNetRaw) as number;
  const eventRands = JSON.parse(eventRandsRaw) as number[];
  const injuryJustOccurred = injuryCalc.justOccurred;
  const injuryJustHealed   = injuryCalc.justHealed;

  // Rust 출력 → InjuryState 변환
  let injuryState: InjuryState | undefined;
  if (!injuryJustHealed && injuryCalc.injuryUpdate) {
    if (injuryJustOccurred) {
      injuryState = {
        type:               injuryCalc.injuryUpdate.type as InjuryType,
        severity:           injuryCalc.injuryUpdate.severity as InjurySeverity,
        recoveryWeeksLeft:  injuryCalc.injuryUpdate.recoveryWeeksLeft,
        totalRecoveryWeeks: injuryCalc.injuryUpdate.recoveryWeeksLeft,
        permanentPenaltyApplied: false,
        source:             (injuryCalc.source ?? "fatigue") as import("../types/save").InjurySource,
      };
    } else if (alreadyInjured && g.protagonist.injury) {
      injuryState = { ...g.protagonist.injury, recoveryWeeksLeft: injuryCalc.injuryUpdate.recoveryWeeksLeft };
    }
  }

  const SURGERY_REHAB_EFF: Record<number, number> = { 1: 0.00, 2: 0.10, 3: 0.30, 4: 0.60 };
  let effectiveInjuryEffMod = injuryCalc.effMod;
  if (injuryState && injuryState.severity === "surgery") {
    const elapsed = injuryState.totalRecoveryWeeks - injuryState.recoveryWeeksLeft;
    const pct = injuryState.totalRecoveryWeeks > 0 ? elapsed / injuryState.totalRecoveryWeeks : 0;
    const phase: 1 | 2 | 3 | 4 = pct < 0.25 ? 1 : pct < 0.50 ? 2 : pct < 0.75 ? 3 : 4;
    injuryState = { ...injuryState, rehabPhase: phase };
    effectiveInjuryEffMod = SURGERY_REHAB_EFF[phase];
  }

  const finalEffMod = studyResult.efficiencyMod * (1 + majorEffBonus + coachEffBonus)
    * facilityEffMod * slumpPenalty * effectiveInjuryEffMod;

  const growth = await calcTrainingGrowth(g.protagonist, g.trainingPlan, finalEffMod);

  if (newLowMoraleWeeks >= 3) growth.logs.push(`[슬럼프] 사기 저하 ${newLowMoraleWeeks}주 연속 — 훈련 효율 -30%`);
  if (coachEffBonus > 0.01) growth.logs.push(`[코치] 투수 코치 지도 보너스 +${Math.round(coachEffBonus * 100)}%`);
  if (injuryJustOccurred && injuryState) {
    const label = INJURY_LABEL[injuryState.type];
    growth.logs.push(`[부상] ${label} 발생 — ${injuryState.recoveryWeeksLeft}주 회복 필요`);
    if (injuryState.severity === "moderate" || injuryState.severity === "severe") {
      seasonStore.pushPendingAction({
        type: "injuryTreatment",
        injuryType: injuryState.type,
        severity: injuryState.severity,
      });
    }
  } else if (alreadyInjured && !injuryJustHealed && injuryState) {
    growth.logs.push(`[부상] 회복 중 (${injuryState.recoveryWeeksLeft}주 남음) — 훈련 효율 -80%`);
    // 주간 치료비 차감
    const weeklyTreatmentCost: Record<string, number> = {
      conservative: injuryState.severity === "moderate" ? 300_000 : 500_000,
      counseling:   800_000,
    };
    const treatCost = weeklyTreatmentCost[injuryState.treatmentChoice ?? ""] ?? 0;
    if (treatCost > 0) {
      growth.protagonistPatch.money = Math.max(0, (g.protagonist.money ?? 0) - treatCost);
      growth.logs.push(`[치료비] 주간 치료비 ${(treatCost / 10000).toFixed(0)}만원 차감`);
    }
  } else if (injuryJustHealed) {
    growth.logs.push(`[부상] 회복 완료 — 정상 훈련 재개`);
  }
  if (studyResult.efficiencyMod < 1.0) {
    growth.logs.push(`[학업] 주간 효율 ${Math.round(studyResult.efficiencyMod * 100)}%`);
  }

  growth.protagonistPatch.consecutiveLowMoraleWeeks  = newLowMoraleWeeks;
  growth.protagonistPatch.consecutiveHighFatigueWeeks = injuryCalc.newConsecutiveHighFatigueWeeks;
  growth.protagonistPatch.injury                      = injuryState;

  if (injuryJustHealed && g.protagonist.injury && !g.protagonist.injury.permanentPenaltyApplied) {
    const prevInj = g.protagonist.injury;
    const penalty = getPermanentPenalty(prevInj);
    const penaltyEntries = Object.entries(penalty) as [string, number][];
    if (penaltyEntries.length > 0) {
      const pitching: PitchingAttributes = { ...(growth.protagonistPatch.pitching ?? g.protagonist.pitching) };
      for (const [stat, delta] of penaltyEntries) {
        if (stat in pitching) {
          (pitching as unknown as Record<string, number>)[stat] = Math.max(1, ((pitching as unknown as Record<string, number>)[stat] ?? 0) + delta);
        }
      }
      pitching.ovr = Math.round(
        (pitching.velocity * 2.5 + pitching.command * 2.5 + pitching.control * 2.0
         + pitching.movement * 1.5 + pitching.stamina * 1.5 + pitching.mentality * 1.0
         + pitching.recovery * 0.5 + pitching.clutch * 0.3 + pitching.holdRunners * 0.2) / 12.0
      );
      growth.protagonistPatch.pitching = pitching;
      growth.logs.push(`[부상 후유증] ${INJURY_LABEL[prevInj.type]} 영구 손실 — ${penaltyEntries.map(([k, v]) => `${k} ${v}`).join(", ")}`);
    }
    const histEntry: InjuryHistoryEntry = {
      type: prevInj.type,
      severity: prevInj.severity,
      year: s.seasonYear,
      week: weekNum,
      treatmentChoice: prevInj.treatmentChoice ?? "rest",
      ...(penaltyEntries.length > 0 ? { permanentLoss: penalty as InjuryHistoryEntry["permanentLoss"] } : {}),
    };
    growth.protagonistPatch.injuryHistory = [...(g.protagonist.injuryHistory ?? []), histEntry];
  }

  const shPrev = g.protagonist.seasonHealth ?? { lowConditionWeeks: 0, highFatigueWeeks: 0, injuryCount: 0, totalWeeks: 0 };
  growth.protagonistPatch.seasonHealth = {
    lowConditionWeeks: shPrev.lowConditionWeeks + (g.protagonist.condition < 60 ? 1 : 0),
    highFatigueWeeks:  shPrev.highFatigueWeeks  + (g.protagonist.fatigue  > 70 ? 1 : 0),
    injuryCount:       shPrev.injuryCount        + (injuryJustOccurred    ? 1 : 0),
    totalWeeks:        shPrev.totalWeeks         + 1,
  };

  logs.push(...growth.logs);

  // 훈련 결과 후 주인공 상태 로컬 계산 (store 읽기 없이 이벤트·TOP10 입력 준비)
  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter  = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  const trainingScoutDelta = ovrAfter > ovrBefore ? Math.min(3, Math.max(1, ovrAfter - ovrBefore)) : 0;
  const afterP: ProtagonistSave = { ...g.protagonist, money: Math.max(0, g.protagonist.money + weeklyNet), ...growth.protagonistPatch };
  const coachName = getPitchCoachName(afterP.teamId, m.entities);
  const trainingMsg = makeTrainingMessage(weekNum, growth.logs, afterP, coachName);

  // 이벤트 엔진 (미리 계산된 eventRands 사용)
  const updatedUniversityWeek = isUniversity ? (g.schoolState.universityWeek + 1) : (g.schoolState.universityWeek ?? 0);
  const careerStageYear = calcCareerStageYear(afterP, weekNum, updatedUniversityWeek);
  const eventCtx: EventContext = {
    protagonist:     afterP,
    currentWeek:     weekNum,
    seasonPhase:     s.schedule.find((e) => e.week === weekNum)?.phase ?? "season",
    standings:       s.standings,
    stats:           s.stats,
    triggeredEvents: s.triggeredEvents,
  };
  const evResult = runEventEngine(
    m.eventRules, m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx, s.seasonYear, careerStageYear,
    eventRands,
  );
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);
  gameStore.recordCareerTriggeredEvents(evResult.careerUpdatedTriggers);

  // 고교 월간 유망주 TOP 10 (4주마다)
  let top10Snap: import("../types/save").Top10Snapshot | undefined;
  let top10Msg: MessageItem | undefined;
  let rankPopularityDelta = 0;
  let rankScoutScoreDelta = 0;
  let rankMoraleDelta = 0;
  if (
    g.protagonist.careerStage === "highschool" &&
    weekInYear % 4 === 0 &&
    weekInYear >= 4
  ) {
    const heroStats = s.stats[afterP.id] ?? null;
    const last = afterP.playerType === "pitcher" ? g.lastTop10Pitcher : g.lastTop10Batter;

    top10Snap = generateTop10(
      afterP,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      weekNum,
      afterP.grade ?? 1,
      s.seasonYear,
    );
    top10Msg = buildTop10Message(
      afterP,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      top10Snap,
      last,
      weekNum,
      s.seasonYear,
    );
    const heroEntry = top10Snap.entries.find((e) => e.id === "PLY_HERO");
    if (heroEntry) {
      const ef = rankEffect(heroEntry.rank);
      rankPopularityDelta = ef.popularity;
      rankScoutScoreDelta = ef.scoutScore;
      rankMoraleDelta = ef.morale;
    }
  }

  // ── 주차 결과 배치 적용 (store 업데이트 최소화) ────────────────
  const weekMessages: MessageItem[] = [trainingMsg, ...evResult.newMessages];
  if (top10Msg) weekMessages.push(top10Msg);

  gameStore.applyMoneyChange(weeklyNet);
  gameStore.applyWeekEndBatch({
    protagonistPatch: growth.protagonistPatch,
    logs: growth.logs,
    weekNum,
    seasonYear: s.seasonYear,
    scoutScoreDelta:  trainingScoutDelta || undefined,
    top10Snapshot:    top10Snap,
    popularityDelta:  rankPopularityDelta > 0 ? rankPopularityDelta : undefined,
    scoutScoreDelta2: rankScoutScoreDelta > 0 ? rankScoutScoreDelta : undefined,
    moraleDelta:      rankMoraleDelta > 0 ? rankMoraleDelta : undefined,
    messages:         weekMessages,
  });

  // NPC 주간 성장/하락 처리 (매주 실행)
  await processWeeklyNpcGrowth(weekNum);

  // 프로 스테이지: 콜업/콜다운 처리 (월간 첫 주에만)
  if (isMonthStart(weekInYear)) {
    const callupLogs = await processProTeamCallupCalldown(weekNum);
    logs.push(...callupLogs);
  }

  // 친선경기 월간 플래너 (고교·대학·독립리그, 월 첫 주)
  if (
    isMonthStart(weekInYear) &&
    (g.protagonist.careerStage === "highschool" ||
     g.protagonist.careerStage === "university" ||
     g.protagonist.careerStage === "independent")
  ) {
    const sFriendly  = get(seasonStore);
    const mFriendly  = get(masterStore);
    const proto      = g.protagonist;
    const allTeamIds = [
      ...sFriendly.hsGroupA,
      ...sFriendly.hsGroupB,
      ...(sFriendly.leagueState[proto.leagueId]?.standings.map((s) => s.teamId) ?? []),
    ].filter((v, i, a) => a.indexOf(v) === i);  // 중복 제거

    // 리그 시즌 종료 주차 추정 (고교 W44, 대학 W42, 독립리그 W39)
    const seasonPhaseEnd =
      proto.careerStage === "highschool"  ? 44 :
      proto.careerStage === "university"  ? 42 : 39;

    const plan = planMonthlyFriendlies(
      weekInYear,
      weekNum,
      proto.teamId,
      proto.leagueId,
      sFriendly.seasonYear,
      sFriendly.schedule,
      allTeamIds,
      seasonPhaseEnd,
    );

    if (plan.entries.length > 0) {
      seasonStore.injectFriendlySchedule(plan.entries);
      const teamMap = new Map(mFriendly.teams.map((t) => [t.id, t.name]));
      const officialThisMonth = sFriendly.schedule.filter(
        (e) => !e.isFriendly &&
          e.week >= weekNum && e.week <= weekNum + 5 &&
          (e.homeTeamId === proto.teamId || e.awayTeamId === proto.teamId),
      );
      const noticeMsg = buildMonthlyNoticeMessage(plan, officialThisMonth, weekNum, teamMap);
      if (noticeMsg) gameStore.addMessage(noticeMsg);
      logs.push(`[친선경기] ${plan.monthLabel} ${plan.entries.length}회 편성`);
    }
  }

  // 시험 이벤트
  const gAfterStudy = get(gameStore);
  const triggeredExamId = Object.keys(evResult.updatedTriggers).find((id) => EXAM_EVENT_IDS.has(id));
  if (triggeredExamId && (g.protagonist.careerStage === "highschool" || g.protagonist.careerStage === "university")) {
    const examType = triggeredExamId === "EVT_HS_MIDTERM" ? "midterm" : "final";
    const examRes  = await calcExamResult(gAfterStudy.schoolState.examAccumScore, gAfterStudy.schoolState.warningCount, examType);
    gameStore.applyExamResult(examRes);
    gameStore.addMessage(makeExamMessage(weekNum, examRes.messageSubject, examRes.messageBody));
    logs.push(`[시험] ${examRes.messageSubject}`);
  }

  // 진로허브 트리거 — 스테이지별 시즌 종료 직후
  // HS 3학년: W44 (결승 직후) / 대학: W42 (결승 직후) / 독립: W39 (결승 직후)
  const gLatest = get(gameStore);
  const needsHsHub =
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 && weekInYear === 44 &&
    !gLatest.schoolState.careerChoiceTriggered;
  const needsUnivHub =
    gLatest.protagonist.careerStage === "university" &&
    weekInYear === 42 &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) => a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice"
    );
  const needsIndieHub =
    gLatest.protagonist.careerStage === "independent" &&
    weekInYear === 39 &&
    !gLatest.schoolState.careerApplicationsSubmitted &&
    gLatest.schoolState.careerResults === null &&
    !get(seasonStore).pendingActions.some(
      (a) => a.type === "careerChoiceHub" || a.type === "careerResults" || a.type === "careerChoice"
    );
  if (needsHsHub || needsUnivHub || needsIndieHub) {
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoiceHub" });
  }

  // W47 진로 결과 계산 — KBL 드래프트(W44~W46) 마감 후 전 스테이지 동시 발표
  const gDraft = get(gameStore);
  const hasCareerPending = get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub" || a.type === "careerResults"
  );

  const isHsResultWeek =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear === 47 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  const isUnivResultWeek =
    (gDraft.protagonist.careerStage === "university" || gDraft.protagonist.careerStage === "independent") &&
    weekInYear === 47 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    gDraft.schoolState.careerResults === null &&
    !hasCareerPending;

  if (isHsResultWeek || isUnivResultWeek) {
    const p = gDraft.protagonist;
    const apps = gDraft.schoolState.careerApplications;
    const univChoices = apps?.universityChoices ?? [];
    const indieChoices = apps?.independentChoices ?? [];
    const draftApplied = apps?.draftApplied ?? false;

    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length : 50;

    const { UNIVERSITY_REQUIREMENTS, calcHsBaseballScore } = await import("../utils/universityUtils");
    const hsBaseballScore = calcHsBaseballScore(gDraft.protagonist.careerRecords ?? []);
    const univChoiceReqs = univChoices.map((teamId) => {
      const req = UNIVERSITY_REQUIREMENTS[teamId];
      return { teamId, minAcademicGrade: req?.minAcademicGrade ?? 9, minBaseballScore: req?.minBaseballScore ?? 0 };
    });
    const admissionsCalc = JSON.parse(await window.projectB!.weekCalcHsAdmissions(JSON.stringify({
      ovr: p.pitching.ovr, avgPct, hsBaseballScore, univChoices: univChoiceReqs, indieChoices,
    }))) as { univPassed: string[]; indiePassed: string[]; sportsPassed: boolean };

    gameStore.setCareerResults({
      draftDrafted: false,
      draftTeamId: null,
      draftRound: null,
      draftPick: null,
      draftSigningBonus: 0,
      universityPassed: admissionsCalc.univPassed,
      independentPassed: admissionsCalc.indiePassed,
    });

    seasonStore.pushPendingAction({ type: "careerResults" });
  }

  // W47: 배경 고교 졸업생 드래프트 (주인공 드래프트 결과 케이스가 아닐 때 항상 실행)
  if (weekInYear === 47 && !isHsResultWeek && !isUnivResultWeek && !hasCareerPending) {
    const alreadyQueued = get(seasonStore).pendingActions.some(a => a.type === "draftObserve");
    if (!alreadyQueued) {
      seasonStore.pushPendingAction({ type: "draftObserve" });
    }
  }

  // 프로 트레이드 윈도우 (W12~W38, 4주마다)
  // 비프로 스테이지에서도 프로 3리그를 각각 시뮬해 거래 기록 유지
  if (weekInYear >= 12 && weekInYear <= 38 && weekInYear % 4 === 0) {
    const proLeagueIds = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
    const myLeague = get(gameStore).protagonist.leagueId;
    const isProStage = proLeagueIds.includes(myLeague);
    if (isProStage) {
      await processTradeWindow(weekInYear, myLeague);
    } else {
      for (const lid of proLeagueIds) {
        await processTradeWindow(weekInYear, lid);
      }
    }
  }

  // ── 오프시즌 이벤트 ─────────────────────────────────────────────
  {
    const gOff = get(gameStore);
    const sOff = get(seasonStore);
    const isProStage = ["pro_kbl", "pro_abl", "pro_jbl"].includes(gOff.protagonist.careerStage);

    // W39: 독립리그 시즌 종료 총평 메시지
    if (gOff.protagonist.careerStage === "independent" && weekInYear === 39) {
      gameStore.addMessage({
        id: `msg-indie-season-end-${sOff.seasonYear}`,
        category: "system", sender: "리그 사무국",
        subject: `${sOff.seasonYear} 독립리그 시즌 종료`,
        preview: "시즌이 종료되었습니다. 진로 신청을 진행하세요.",
        body: "독립리그 시즌이 종료되었습니다.\n드래프트 신청, 독립리그 재계약, 군입대 중 진로를 선택할 수 있습니다.\nW47에 최종 결과가 발표됩니다.",
        createdAt: `W${weekNum}`, readAt: null,
      });
    }

    // W40: 팀 Win-Now 압박 업데이트 (오프시즌 시작)
    if (isProStage && weekInYear === 40) {
      processWinNowPressureUpdate(weekNum).catch(e => autoLog(`[WinNow압박오류] ${e}`));
    }

    // W40: 프로 시즌 총평 메시지
    if (isProStage && weekInYear === 40) {
      const myStats = sOff.stats[gOff.protagonist.id] as import("../types/save").PitcherSeasonStats | null ?? null;
      const statSummary = myStats
        ? `ERA ${myStats.era?.toFixed(2) ?? "-"} / ${myStats.w ?? 0}승 ${myStats.l ?? 0}패 / ${myStats.k ?? 0}K`
        : "시즌 기록 없음";
      gameStore.addMessage({
        id: `msg-pro-season-end-${sOff.seasonYear}`,
        category: "system", sender: "코칭스태프",
        subject: `${sOff.seasonYear} 시즌 종료 — 오프시즌 시작`,
        preview: `시즌 성적: ${statSummary}`,
        body: [
          `${sOff.seasonYear} 시즌이 종료되었습니다.`,
          `시즌 성적: ${statSummary}`,
          "",
          "W43부터 연봉협상 및 FA 시장이 열립니다.",
          "W50 체육부대 신청, W52 새 시즌 시작.",
        ].join("\n"),
        createdAt: `W${weekNum}`, readAt: null,
      });
    }

    // W43: NPC 은퇴/FA 결정 — 플레이어 단계 무관하게 배경 프로리그 NPC 처리
    if (weekInYear === 43) {
      const offseasonLogs = await processOffseasonNpcDecisions(weekNum);
      logs.push(...offseasonLogs);
    }

    // W43: 프로 연봉협상 1차 + FA 시장 오픈
    if (isProStage && weekInYear === 43) {
      const contract = gOff.protagonist.contract;
      const hasPending = sOff.pendingActions.some(
        (a) => a.type === "salaryNegotiation" || a.type === "faMarket" || a.type === "optionClause"
      );
      const hasPendingNext = !!gOff.protagonist.pendingNextContract;

      // applySeasonContractProgress()는 W52(SeasonEndModal)에서 호출 — 여기서는 미리 체크만
      // 이번 시즌 종료 후 계약이 만료되는지 확인 (remainingYears === 1 → 감산 후 0)
      if (!hasPending && !hasPendingNext && contract) {
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;

        if (contract.remainingYears === 1) {
          // 이번 시즌 마지막 계약 연도 — 만료 예정
          const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats);
          if (contract.teamOptionYears > 0) {
            const seasonRating = await calcSeasonRating(myStats);
            const profile = getTeamProfile(gOff.protagonist.teamId, gOff, m) ?? DEFAULT_TEAM_PROFILE;
            // winNowPressure: 0→기준75, 50→63, 100→50 (공격적 팀은 낮은 기준에도 행사)
            const threshold = 75 - Math.round((profile.winNowPressure / 100) * 25);
            const exercised = seasonRating >= threshold;
            const action: PendingAction = { type: "optionClause", optionType: "team", exercised, nextSalary: offeredSalary };
            seasonStore.pushPendingAction(action);
          } else if (contract.playerOptionYears > 0) {
            const action: PendingAction = { type: "optionClause", optionType: "player", exercised: false, nextSalary: offeredSalary };
            seasonStore.pushPendingAction(action);
          } else if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            seasonStore.pushPendingAction({
              type: "salaryNegotiation",
              teamId: contract.teamId,
              leagueId: contract.leagueId,
              offeredSalary,
              durationYears: 1,
              minDurationYears: 1,
              maxDurationYears: 3,
              signingBonus: 0,
              context: "renewal",
            });
          }
        } else if (contract.remainingYears <= 0) {
          // 이미 만료된 계약 — 계약 없음 처리
          if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
            seasonStore.pushPendingAction({ type: "faMarket" });
          } else {
            const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats);
            seasonStore.pushPendingAction({
              type: "salaryNegotiation",
              teamId: gOff.protagonist.teamId,
              leagueId: gOff.protagonist.leagueId,
              offeredSalary,
              durationYears: 1,
              minDurationYears: 1,
              maxDurationYears: 3,
              signingBonus: 0,
              context: "renewal",
            });
          }
        }
        // remainingYears > 1: 계약 기간 중 — 아무것도 하지 않음
      } else if (!contract && !hasPending && !hasPendingNext) {
        // 계약 자체 없음 (이례적)
        const myStats = (sOff.stats[gOff.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
        if (isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity)) {
          seasonStore.pushPendingAction({ type: "faMarket" });
        } else {
          const offeredSalary = await calcOfferedSalaryForProtagonist(gOff.protagonist, myStats);
          seasonStore.pushPendingAction({
            type: "salaryNegotiation",
            teamId: gOff.protagonist.teamId,
            leagueId: gOff.protagonist.leagueId,
            offeredSalary,
            durationYears: 1,
            minDurationYears: 1,
            maxDurationYears: 3,
            signingBonus: 0,
            context: "renewal",
          });
        }
      }
    }

    // W44~W49: FA 미계약자 매주 재트리거
    if (isProStage && weekInYear >= 44 && weekInYear <= 49) {
      const hasFaPending = sOff.pendingActions.some((a) => a.type === "faMarket");
      const hasPendingNext = !!gOff.protagonist.pendingNextContract;
      const isUnsignedFa = !gOff.protagonist.contract && !hasPendingNext && !hasFaPending &&
        isFaEligible(gOff.protagonist, gOff.schoolState.attendsUniversity);
      if (isUnsignedFa) {
        gameStore.incrementFaUnsignedWeek();
        seasonStore.pushPendingAction({ type: "faMarket" });
      }
    }
  }

  // 업적 체크
  const gFinal  = get(gameStore);
  const sFinal  = get(seasonStore);
  const mFinal  = get(masterStore);
  const metrics = computeMetrics(gFinal.achievementMetrics, gFinal.mailbox, sFinal.standings, sFinal.schedule, gFinal.protagonist.teamId);
  const achResult = checkAchievements(mFinal.achievements, gFinal.achievements, metrics, `W${weekNum}`);
  if (achResult.newlyUnlocked.length > 0 ||
      achResult.updatedRuntime.some((r, i) => r.progress !== gFinal.achievements[i]?.progress)) {
    gameStore.applyAchievementCheck(achResult);
  }

  // ── NPC 감정 업데이트 ─────────────────────────────────────────
  {
    const gEmo = get(gameStore);
    const sEmo = get(seasonStore);
    const isHs = gEmo.protagonist.careerStage === "highschool";
    const namedNpcs = gEmo.npcs.filter(n => n.emotionStatus !== "archived");

    if (isHs && namedNpcs.length > 0) {
      // 이번 주 주인공 경기 결과 (schedule에서 조회)
      const myGame = sEmo.schedule.find(
        e => e.week === weekNum && e.isProtagonistGame && e.result != null,
      );
      const myResult = myGame?.result;
      const iWon = myResult != null && myResult.winnerId === gEmo.protagonist.teamId;

      // 훈련 여부: 훈련 계획에 이번 주 항목 존재 여부로 추론
      const hasTrainingPlan = !!(gEmo.trainingPlan?.primaryProgramId ?? gEmo.trainingPlan?.secondaryProgramId);

      const ctx: WeeklyEmotionContext = {
        weekInSeason:    weekInYear,
        careerStage:     gEmo.protagonist.careerStage,
        protagonistOvr:  gEmo.protagonist.pitching?.ovr ?? gEmo.protagonist.batting?.ovr ?? 50,
        gameResult:      myResult
          ? { won: iWon, era: 0, strikeouts: 0 }
          : undefined,
        ovrDelta:        0,
        trainingDone:    hasTrainingPlan,
        trainingSkipped: !hasTrainingPlan,
        consecutiveTrainingSkips: 0,
      };

      const emotionMsgs: MessageItem[] = [];
      const updatedNpcs = namedNpcs.map(npc => {
        // 재회 감지: dormant → active
        const activated = npc.emotionStatus === "dormant"
          && npc.currentLeague === gEmo.protagonist.leagueId
          ? reactivateNpc(npc, gEmo.protagonist.careerStage)
          : npc;

        if (activated.emotionStatus === "active" && npc.emotionStatus === "dormant") {
          const isSameTeam = activated.currentTeam === gEmo.protagonist.teamId;
          const reunionMsg = makeReunionMessage(activated, isSameTeam, weekNum);
          if (reunionMsg) emotionMsgs.push(reunionMsg);
        }

        // 맞대결 memory: 라이벌 NPC가 이번 주 상대팀에 있을 때
        const newMems: NpcMemory[] = [];
        if (myResult && npc.emotionRole === "rival" && npc.currentTeam === myGame?.awayTeamId) {
          newMems.push(makeMemory(
            iWon ? "humiliation" : "witness",
            weekNum,
            2,
            `W${weekNum} 경기`,
          ));
        }

        const { npc: updated, prevEmotion } = updateNpcEmotion(activated, ctx, newMems);
        const msg = checkEmotionTriggers(updated, prevEmotion, weekNum);
        if (msg) emotionMsgs.push(msg);

        return updated;
      });

      const moodMsg = checkTeamMoodWarning(updatedNpcs, weekNum);
      if (moodMsg) emotionMsgs.push(moodMsg);

      if (emotionMsgs.length) gameStore.addMessages(emotionMsgs);
      gameStore.updateNpcs(updatedNpcs);
    }
  }

  // ── 배경 리그 시뮬레이션 (await — 월간 메시지 전 완료 보장) ────
  const bgEntities = get(masterStore).entities;
  await processNpcInjuries(weekNum);
  seasonStore.applyWeeklyConditionRecovery(bgEntities);
  await seasonStore.simulateBackgroundLeaguesAsync(weekNum, gFinal.protagonist.leagueId, bgEntities);
  // npcLiveStats 변경 → connectToGameStore 구독이 entities 자동 갱신 (applyNpcLiveStats 불필요)

  // 주차 → 월 레이블 헬퍼
  function weekToMonthLabel(wk: number): string {
    const d = new Date(`${sFinal.seasonYear}-03-01`);
    d.setDate(d.getDate() + (wk - 1) * 7);
    return `${d.getMonth() + 1}월`;
  }

  // ── 주인공 리그 전주 NPC 경기 결과 메시지 ─────────────────────
  if (weekNum > 1) {
    const sAfterSim = get(seasonStore);
    const isHighschool = gFinal.protagonist.careerStage === "highschool";
    const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));

    if (isHighschool) {
      const protagonistIsA = sAfterSim.hsGroupA.includes(gFinal.protagonist.teamId);
      const myGroupLabel  = protagonistIsA ? "A조" : "B조";
      const npcGroupLabel = protagonistIsA ? "B조" : "A조";

      const weekHsGames = sAfterSim.schedule.filter(
        (e) => e.week === weekNum && e.leagueId === "LEAGUE_HIGHSCHOOL" && !e.isProtagonistGame && !!e.result,
      );
      const myGroupTeams  = protagonistIsA ? (sAfterSim.hsGroupA ?? []) : (sAfterSim.hsGroupB ?? []);
      const npcGroupTeams = protagonistIsA ? (sAfterSim.hsGroupB ?? []) : (sAfterSim.hsGroupA ?? []);
      const myGames  = weekHsGames.filter((e) => myGroupTeams.includes(e.homeTeamId));
      const npcGames = weekHsGames.filter((e) => npcGroupTeams.includes(e.homeTeamId));

      if (myGames.length > 0 || npcGames.length > 0) {
        const toLine = (e: { homeTeamId: string; awayTeamId: string; result?: import("../types/season").MatchResult }) => {
          const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
          const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
          const r = e.result!;
          return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
        };
        const parts: string[] = [];
        if (myGames.length > 0)  parts.push(`[${myGroupLabel}]\n${myGames.map(toLine).join("\n")}`);
        if (npcGames.length > 0) parts.push(`[${npcGroupLabel}]\n${npcGames.map(toLine).join("\n")}`);
        const body = parts.join("\n\n");
        const monthLabel = weekToMonthLabel(weekNum);
        gameStore.addMessage({
          id: `msg-league-results-w${weekNum}-${Date.now()}`,
          category: "system",
          sender: "리그 사무국",
          subject: `${monthLabel} 고교 리그 경기 결과`,
          preview: body.split("\n")[1] ?? "",
          body,
          createdAt: `W${weekNum}`,
          readAt: null,
        });
      }
    } else {
      const myGames = sAfterSim.schedule.filter((e) => e.week === weekNum && !e.isProtagonistGame && !!e.result);
      if (myGames.length > 0) {
        const leagueName = LEAGUE_NAMES[gFinal.protagonist.leagueId] ?? gFinal.protagonist.leagueId;
        const monthLabel = weekToMonthLabel(weekNum);
        const lines = myGames.map((e) => {
          const home = teamById.get(e.homeTeamId) ?? e.homeTeamId;
          const away = teamById.get(e.awayTeamId) ?? e.awayTeamId;
          const r = e.result!;
          return `${away} ${r.awayScore} : ${r.homeScore} ${home}`;
        });
        gameStore.addMessage({
          id: `msg-league-results-w${weekNum}-${Date.now()}`,
          category: "system",
          sender: "리그 사무국",
          subject: `${monthLabel} ${leagueName} 경기 결과`,
          preview: lines[0] ?? "",
          body: lines.join("\n"),
          createdAt: `W${weekNum}`,
          readAt: null,
        });
      }
    }
  }

  // ── 타 리그 순위 메시지 ─────────────────────────────────────
  const hsGradeForMsg = gFinal.protagonist.careerStage === "highschool"
    ? (gFinal.protagonist.grade ?? 1)
    : null;

  if (hsGradeForMsg !== null) {
    // 고교: 1학년 = 없음 / 2~3학년 = 분기 Digest (W12·W24·W36)
    if (hsGradeForMsg >= 2 && HS_DIGEST_WEEKS.has(weekInYear)) {
      const sAfterSim = get(seasonStore);
      const teamById  = new Map(mFinal.teams.map((t) => [t.id, t.name]));
      const digest    = buildHsLeagueDigest(
        weekNum, weekInYear, hsGradeForMsg,
        sAfterSim.leagueState, teamById,
        gFinal.protagonist.scoutScore ?? 0,
      );
      if (digest) gameStore.addMessage(digest);
    }
  } else {
    // 비고교: 기존 월간 순위표 (4주마다)
    if (weekInYear % 4 === 0) {
      const sAfterSim = get(seasonStore);
      const myLeagueId = gFinal.protagonist.leagueId;
      const teamById = new Map(mFinal.teams.map((t) => [t.id, t.name]));
      const monthLabel = weekToMonthLabel(weekNum);

      for (const [lid, ls] of Object.entries(sAfterSim.leagueState)) {
        if (lid === myLeagueId) continue;
        if (!MONTHLY_STANDINGS_LEAGUES.has(lid)) continue;
        const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
        if (sorted.length === 0) continue;
        if (!sorted.some((s) => s.wins + s.losses + s.draws > 0)) continue;
        const lgSchedule = sAfterSim.leagueSchedules[lid] ?? [];
        const lastGameWeek = lgSchedule.reduce((mx, e) => Math.max(mx, e.week), 0);
        if (lastGameWeek > 0 && weekInYear > lastGameWeek) continue;

        const leagueName = LEAGUE_NAMES[lid] ?? lid;
        const lines = sorted.map((st, i) => {
          const name = teamById.get(st.teamId) ?? st.teamId;
          const pct = String(Math.round(st.winPct * 1000)).padStart(3, "0");
          return `${i + 1}위  ${name}  ${st.wins}승 ${st.losses}패  .${pct}  ${st.streak}`;
        });
        gameStore.addMessage({
          id: `msg-standings-${lid}-w${weekNum}-${Date.now()}`,
          category: "system",
          sender: "리그 사무국",
          subject: `[${leagueName}] ${monthLabel} 순위표`,
          preview: lines[0] ?? "",
          body: `── ${leagueName} 순위 (${monthLabel}) ──\n${lines.join("\n")}`,
          createdAt: `W${weekNum}`,
          readAt: null,
        });
      }
    }
  }

  // ── 코치 리포트 (3주마다, 군 복무·오프시즌 제외) ──────────────
  const isSeasonActive = sFinal.schedule.some(
    (e) => !e.result && !e.isFriendly && (e.phase === "season" || e.phase === "postseason"),
  );
  if (weekInYear % 3 === 0 && gFinal.protagonist.careerStage !== "military" && isSeasonActive) {
    const p   = gFinal.protagonist;
    const pit = p.pitching;
    const myStats = sFinal.stats[p.id] as import("../types/save").PitcherSeasonStats | null ?? null;
    const coachName = getPitchCoachName(p.teamId, mFinal.entities);

    const era = myStats?.era ?? null;
    const eraLine = era !== null
      ? `  시즌 ERA ${era.toFixed(2)}  (${
          era < 2.5 ? "최상위권" : era < 3.5 ? "안정권" : era < 5.0 ? "주의 필요" : "위험 수준"
        })`
      : null;

    const fatigueTag = p.fatigue >= 70 ? "⚠ 위험" : p.fatigue >= 50 ? "주의" : "정상";

    type Choice = { id: string; label: string; effectHint: string;
      moraleDelta?: number; fatigueDelta?: number; conditionDelta?: number;
      xp?: Record<string, number> };

    let recommendation: string;
    let choices: Choice[];

    if (p.fatigue >= 65) {
      recommendation = `피로도 ${p.fatigue} — 회복 최우선 권고.`;
      choices = [
        { id: "rest", label: "회복 집중",     effectHint: "피로 -8, 컨디션 +4", fatigueDelta: -8, conditionDelta: 4 },
        { id: "push", label: "훈련 유지",     effectHint: "변화 없음" },
      ];
    } else if (p.condition >= 82 && p.morale >= 68) {
      recommendation = `컨디션·사기 양호 — 집중 훈련 적기.`;
      choices = [
        { id: "intensive", label: "강도 높여 집중 훈련", effectHint: "커맨드 XP +3, 피로 +4", xp: { command: 3 }, fatigueDelta: 4 },
        { id: "steady",    label: "현재 루틴 유지",     effectHint: "변화 없음" },
      ];
    } else if (p.morale <= 40) {
      recommendation = `사기 저하 감지 — 멘탈 관리 병행 권고.`;
      choices = [
        { id: "mental",  label: "멘탈 케어 병행",   effectHint: "사기 +6, 훈련 효율 -10%", moraleDelta: 6 },
        { id: "grind",   label: "훈련만 집중",      effectHint: "변화 없음" },
      ];
    } else {
      recommendation = `현재 상태 안정적 — 루틴 유지 권장.`;
      choices = [
        { id: "balance",  label: "현재 루틴 유지",  effectHint: "변화 없음" },
        { id: "recover",  label: "회복 세션 추가",  effectHint: "피로 -4, 컨디션 +2", fatigueDelta: -4, conditionDelta: 2 },
      ];
    }

    const bodyLines = [
      `■ 현재 수치`,
      `  구속 ${pit.velocity}  커맨드 ${pit.command}  제구 ${pit.control}  스태미나 ${pit.stamina}`,
      ...(eraLine ? [eraLine] : []),
      ``,
      `■ 상태`,
      `  컨디션 ${p.condition}  /  피로도 ${p.fatigue} [${fatigueTag}]  /  사기 ${p.morale}`,
      ``,
      `■ 권고`,
      `  ${recommendation}`,
    ];

    gameStore.addMessage({
      id: `msg-coach-report-w${weekNum}-${Date.now()}`,
      category: "coach",
      sender: coachName,
      subject: `[코치 리포트] W${weekNum} 점검`,
      preview: recommendation,
      body: bodyLines.join("\n"),
      createdAt: `W${weekNum}`,
      readAt: null,
      decision: {
        prompt: "이번 주 방향을 선택하세요.",
        options: choices.map(c => ({
          id: c.id,
          label: c.label,
          effectHint: c.effectHint,
          effects: {
            moraleDelta:    c.moraleDelta    ?? 0,
            fatigueDelta:   c.fatigueDelta   ?? 0,
            conditionDelta: c.conditionDelta ?? 0,
            ...(c.xp ? { xp: c.xp } : {}),
          },
        })),
        selectedOptionId: null,
      },
    });
  }

  return logs;
}

// ── 시즌 종료 처리 ────────────────────────────────────────────
async function handleSeasonEnd(): Promise<WeekAdvanceResult> {
  const s = get(seasonStore);
  const g = get(gameStore);

  // 군 복무 종료
  if (g.protagonist.careerStage === "military") {
    gameStore.completeMilitaryService();
    gameStore.addCareerEvent({ year: s.seasonYear, eventType: "military_discharge",
      toTeamId: g.protagonist.contract?.teamId ?? undefined, detail: "전역" });
    const contract = g.protagonist.contract;
    if (contract) {
      const action: PendingAction = {
        type: "salaryNegotiation",
        teamId: contract.teamId, leagueId: contract.leagueId,
        offeredSalary: contract.salary,
        durationYears: Math.max(1, contract.remainingYears),
        minDurationYears: 1,
        maxDurationYears: 2,
        signingBonus: 0,
        context: "military_return",
      };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["전역: 복귀 계약 협상을 진행하세요."], newMessages: [], matchResults: [], stoppedBy: action };
    }
    // 잔여 계약 없이 전역 → FA 시장으로
    const faAction: PendingAction = { type: "faMarket" };
    seasonStore.pushPendingAction(faAction);
    return { processedWeek: s.currentWeek, logs: ["전역 완료 — FA 시장 오픈"], newMessages: [], matchResults: [], stoppedBy: faAction };
  }

  // 프로 계약 로직은 processWeekBoundary W43에서 처리
  // handleSeasonEnd는 군 복무 전역 외 단순 시즌 종료 신호만 반환
  return { processedWeek: s.currentWeek, logs: ["시즌이 종료되었습니다."], newMessages: [], matchResults: [], stoppedBy: null };
}

// ── HS 포스트시즌 주입 ─────────────────────────────────────────
async function injectHsPostseason(nextWeek: number): Promise<void> {
  const g  = get(gameStore);
  const sPS = get(seasonStore);

  const lastSeasonWeek = sPS.schedule.reduce(
    (mx, e) => (e.phase === "season" ? Math.max(mx, e.week) : mx), 0
  );
  const hasPostseason = sPS.schedule.some((e) => e.phase === "postseason");

  if (!hasPostseason && nextWeek > lastSeasonWeek && lastSeasonWeek > 0) {
    // A조·B조 각각 상위 2팀 추출 → [A1, A2, B1, B2] 순으로 넘기면
    // Rust에서 Semi1: A1 vs B2 / Semi2: A2 vs B1 (교차 대진)
    const sortBy = (a: { winPct: number; wins: number; losses: number }, b: { winPct: number; wins: number; losses: number }) =>
      b.winPct - a.winPct || (b.wins - b.losses) - (a.wins - a.losses);
    const groupA = sPS.hsGroupA ?? [];
    const groupB = sPS.hsGroupB ?? [];
    const topA = [...sPS.standings].filter((st) => groupA.includes(st.teamId)).sort(sortBy).slice(0, 2);
    const topB = [...sPS.standings].filter((st) => groupB.includes(st.teamId)).sort(sortBy).slice(0, 2);
    const top4 = [...topA, ...topB].map((st) => st.teamId);
    if (top4.length >= 4) {
      const semis = await generateHsPostseasonSemis(top4, g.protagonist.teamId, nextWeek, sPS.seasonYear);
      seasonStore.injectPostseasonEntries(semis);
    }
  } else if (hasPostseason) {
    const semiEntries = sPS.schedule.filter((e) => e.phase === "postseason" && e.id.startsWith("PS_SEMI"));
    const allSemisResolved = semiEntries.length >= 2 && semiEntries.every((e) => !!e.result);
    const hasFinal = sPS.schedule.some((e) => e.id.startsWith("PS_FINAL"));
    if (allSemisResolved && !hasFinal) {
      const semi1 = semiEntries.find((e) => e.id.startsWith("PS_SEMI1_"));
      const semi2 = semiEntries.find((e) => e.id.startsWith("PS_SEMI2_"));
      if (semi1?.result && semi2?.result) {
        const finalWeek = Math.max(semi1.week, semi2.week) + 1;
        seasonStore.injectPostseasonEntries([
          await generateHsPostseasonFinal(semi1.result.winnerId, semi2.result.winnerId, g.protagonist.teamId, finalWeek, sPS.seasonYear)
        ]);
      }
    }
  }
}

// ── 통합 포스트시즌 주입 (KBL / ABL / UNIV / IND) ───────────────
// 매 게임 처리 후 호출. 정규시즌 종료 감지 → 브라켓 초기화 → 다음 경기 주입
async function injectLeaguePostseason(nextWeek: number): Promise<void> {
  const s   = get(seasonStore);
  const g   = get(gameStore);
  const leagueId      = g.protagonist.leagueId;
  const protagonistId = g.protagonist.teamId;
  const seasonYear    = s.seasonYear;

  const SUPPORTED = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"];
  if (!SUPPORTED.includes(leagueId)) return;

  // 정규시즌 경기가 남아 있으면 아직 아님
  if (s.schedule.some((e) => e.phase === "season" && !e.result)) return;

  const bracket = s.postseasonBrackets?.[leagueId] ?? null;

  // ── 브라켓 미초기화: 빌드 후 비주인공 시리즈 즉시 시뮬 ──────
  if (!bracket) {
    let built: import("../types/season").PostseasonSeries[];
    if (leagueId === "LEAGUE_KBL") built = await buildKblBracket(s.standings);
    else if (leagueId === "LEAGUE_UNIVERSITY") built = await buildUnivBracket(s.standings);
    else if (leagueId === "LEAGUE_INDEPENDENT") built = await buildIndBracket(s.standings);
    else if (leagueId === "LEAGUE_JBL") built = await buildJblBracket(s.standings);
    else if (leagueId === "LEAGUE_ABL") {
      const { ablConference } = await import("../utils/leagueConferences");
      const eastSt = s.standings.filter((st) => ablConference(st.teamId) === "East");
      const westSt = s.standings.filter((st) => ablConference(st.teamId) === "West");
      built = await buildAblBracket(eastSt, westSt);
    } else {
      return;
    }
    if (built.length === 0) return;
    built = await resolveNonProtagonistSeries(built, protagonistId);
    seasonStore.initPostseasonBracket(leagueId, built);
    return; // 다음 루프 이터레이션에서 경기 주입
  }

  // ── 주인공 팀이 참여하는 활성 시리즈 탐색 ───────────────────
  const activeSeries = bracket.find(
    (ser) =>
      !ser.winner &&
      ser.homeTeamId !== "" &&
      ser.awayTeamId !== "" &&
      (ser.homeTeamId === protagonistId || ser.awayTeamId === protagonistId),
  );

  if (!activeSeries) {
    // 주인공 팀 탈락 or 포스트시즌 완료 — 남은 비주인공 시리즈 자동 처리
    const hasUnresolved = bracket.some(
      (ser) => !ser.winner && ser.homeTeamId !== "" && ser.awayTeamId !== "",
    );
    if (hasUnresolved) {
      seasonStore.updatePostseasonBracket(
        leagueId,
        await resolveNonProtagonistSeries(bracket, protagonistId),
      );
    }
    return;
  }

  // ── 다음 경기 주입 여부 확인 ────────────────────────────────
  const gNum  = nextGameNum(activeSeries);
  const gId   = `${activeSeries.id}_G${gNum}`;
  if (s.schedule.some((e) => e.id === gId)) return; // 이미 주입됨

  const game = await makeSeriesGame(activeSeries, gNum, nextWeek, protagonistId, seasonYear);
  seasonStore.injectPostseasonEntries([game]);
}

// ── 포스트시즌 경기 결과 → 브라켓 업데이트 ──────────────────────
async function applyPostseasonResult(scheduleId: string, result: MatchResult): Promise<void> {
  const match = scheduleId.match(/^(.+)_G(\d+)$/);
  if (!match) return;
  const seriesId = match[1];

  const s        = get(seasonStore);
  const g        = get(gameStore);
  const leagueId = g.protagonist.leagueId;
  const bracket  = s.postseasonBrackets?.[leagueId];
  if (!bracket) return;

  const idx = bracket.findIndex((ser) => ser.id === seriesId);
  if (idx < 0) return;

  const updated = await applyGameToSeries(bracket[idx], result.winnerId);
  let newBracket = bracket.map((ser, i) => (i === idx ? updated : ser));

  if (updated.winner) {
    newBracket = await fillNextSeries(newBracket, updated);
    newBracket = await resolveNonProtagonistSeries(newBracket, g.protagonist.teamId);
  }

  seasonStore.updatePostseasonBracket(leagueId, newBracket);
}

// ══════════════════════════════════════════════════════════════
// advanceWeek — "다음 이벤트까지 자동 진행"
// · 군 복무: 주 1단위 진행 (기존 동일)
// · 일반 시즌: NPC 경기 자동 처리 후 주인공 경기·이벤트에서 정지
// ══════════════════════════════════════════════════════════════
export async function advanceWeek(): Promise<WeekAdvanceResult> {
  const accLogs: string[]       = [];
  const accResults: MatchResult[] = [];

  // ── 군 복무 특수 처리 (주 1단위 반환) ────────────────────────
  {
    const s = get(seasonStore);
    const g = get(gameStore);

    if (g.protagonist.careerStage === "military") {
      // 시즌 종료 시 전역 처리
      if (s.currentWeek + 1 > s.totalWeeks) {
        const result = await handleSeasonEnd();
        gameStore.save(); seasonStore.save();
        return result;
      }

      const nextWeek = s.currentWeek + 1;
      seasonStore.advanceWeek();
      seasonStore.setCurrentDate(toGameDate(s.seasonYear, nextWeek, 0));

      gameStore.advanceMilitaryWeek();
      const isSportsUnit = g.protagonist.militaryUnit === "sports";
      const m = get(masterStore);
      const serviceWeeks = g.protagonist.militaryServiceWeeks;

      // 계급 기반 이벤트 필터링 (minRank 이하만 포함)
      const rankIndex = serviceWeeks <= 8 ? 0 : serviceWeeks <= 34 ? 1 : serviceWeeks <= 60 ? 2 : 3;
      const eligibleSports  = m.militarySportsEvents.filter(e => (e.minRank ?? 0) <= rankIndex);
      const eligibleGeneral = m.militaryGeneralEvents.filter(e => (e.minRank ?? 0) <= rankIndex);
      const eligibleCommon  = m.militaryCommonEvents.filter(e => (e.minRank ?? 0) <= rankIndex);

      const milCalc = JSON.parse(await window.projectB!.weekCalcMilitary(JSON.stringify({
        isSportsUnit,
        serviceWeeks,
        stamina:  g.protagonist.pitching.stamina,
        recovery: g.protagonist.pitching.recovery,
        command:  g.protagonist.pitching.command,
        control:  g.protagonist.pitching.control,
        velocity: g.protagonist.pitching.velocity,
        morale:   g.protagonist.morale,
        fatigue:  g.protagonist.fatigue,
        sportsEventCount:  eligibleSports.length,
        generalEventCount: eligibleGeneral.length,
        commonEventCount:  eligibleCommon.length,
      }))) as {
        stamina: number; recovery: number; command: number; control: number; velocity: number;
        morale: number; fatigue: number;
        eventPool: string | null; eventIndex: number | null; rank: string;
      };

      if (milCalc.eventPool !== null && milCalc.eventIndex !== null) {
        const pool = milCalc.eventPool === "sports" ? eligibleSports
                   : milCalc.eventPool === "general" ? eligibleGeneral
                   : eligibleCommon;
        const evt = pool[milCalc.eventIndex];
        if (evt) {
          const choices = evt.choices?.map((c) => ({
            id: c.id,
            label: c.label,
            effects: {
              moraleDelta:  c.moraleDelta  ?? 0,
              fatigueDelta: c.fatigueDelta ?? 0,
              xp:           c.xp,
              statDelta:    c.statDelta,
            },
          })) ?? [{ id: "ok", label: "확인", effects: { moraleDelta: evt.moraleDelta ?? 0, fatigueDelta: evt.fatigueDelta ?? 0 } }];
          seasonStore.pushPendingAction({
            type: "event", eventId: evt.id, title: evt.title, description: evt.description, choices,
          });
        }
      }

      const pitching = {
        ...g.protagonist.pitching,
        stamina:  milCalc.stamina,
        recovery: milCalc.recovery,
        command:  milCalc.command,
        control:  milCalc.control,
        velocity: milCalc.velocity,
      };
      gameStore.applyWeekResult(
        { morale: milCalc.morale, fatigue: milCalc.fatigue, pitching },
        [`군 복무(${isSportsUnit ? "체육부대" : "일반부대"}) — ${milCalc.rank}`],
        [], nextWeek, s.seasonYear,
      );
      const milEntities = get(masterStore).entities;
      seasonStore.applyWeeklyConditionRecovery(milEntities);
      await seasonStore.simulateBackgroundLeaguesAsync(nextWeek, g.protagonist.leagueId, milEntities);
      gameStore.save(); seasonStore.save();

      const pending = get(seasonStore).pendingActions;
      return {
        processedWeek: nextWeek,
        logs: [isSportsUnit ? "군 복무(체육부대)" : "군 복무(일반부대)"],
        newMessages: [],
        matchResults: [],
        stoppedBy: pending.length > 0 ? pending[0] : null,
      };
    }
  }

  // ── 미결정 메시지 확인 ────────────────────────────────────────
  {
    const g = get(gameStore);
    const s = get(seasonStore);
    const unresolvedMsg = g.mailbox.find((m) => m.decision && m.decision.selectedOptionId === null);
    if (unresolvedMsg) {
      const action: PendingAction = { type: "message", messageId: unresolvedMsg.id };
      if (!s.pendingActions.some((a) => a.type === "message" && a.messageId === unresolvedMsg.id)) {
        seasonStore.pushPendingAction(action);
      }
      return { processedWeek: s.currentWeek, logs: [], newMessages: [], matchResults: [], stoppedBy: action };
    }
  }

  // ── 군 복무 관련 트리거 ─────────────────────────────────────
  {
    const g = get(gameStore);
    const s = get(seasonStore);
    const p = g.protagonist;
    const weekNum    = s.currentWeek + 1;
    const weekInYear = ((weekNum - 1) % 52) + 1;
    const isMilUnresolved = p.militaryStatus === "미필"
      && p.careerStage !== "military"
      && p.careerStage !== "highschool";
    const hasAnyMilPending = s.pendingActions.some(
      (a) => a.type === "sportsUnitApplication" || a.type === "militaryEnlistAsk"
    );

    if (isMilUnresolved && !hasAnyMilPending) {
      // W4: 28세 입영 기간 만료 경고
      if (p.age === 28 && weekInYear === 4) {
        gameStore.addMessage({
          id: `msg-military-warning-${Date.now()}`,
          category: "system", sender: "병무청",
          subject: "입영 기간 만료 통지",
          preview: "이번 시즌 W52에 입영 절차가 진행됩니다.",
          body: "병역 의무 이행 기간이 만료되었습니다.\n이번 시즌 W52 주차에 입영 절차가 진행됩니다.",
          createdAt: `W${weekNum}`, readAt: null,
        });
      }

      // W50: 체육부대 후보 30명 공개 (주인공 제외 NPC)
      if (weekInYear === 50 && p.age <= 27) {
        const m = get(masterStore);
        const npcCandidates = m.entities
          .filter((e) => {
            if (e.role !== "player") return false;
            const npcSave = g.npcs.find((n) => n.npcId === e.id);
            if (!isKoreanMilitaryEligible(e, npcSave)) return false;
            return npcSave?.militaryStatus === "미필"
              && npcSave.careerStatus === "active"
              && e.id !== p.id;
          })
          .map((e) => {
            const live = get(npcLiveStatsStore)[e.id];
            const ep = (e.details as import("../stores/master").EntityDetails)?.player;
            const ovr = live?.pitching?.ovr ?? ep?.pitching?.ovr ?? 50;
            return { id: e.id, name: e.name, ovr, teamId: e.teamId, position: ep?.position ?? "SP", isProtagonist: false };
          });

        if (npcCandidates.length > 0) {
          const raw = JSON.parse(
            await window.projectB!.militaryCalcCandidates(JSON.stringify({ candidates: npcCandidates, topN: 30 }))
          ) as { topCandidates: { id: string; name: string; ovr: number; teamId: string }[]; protagonistRank: number | null };

          const teamById = new Map(m.teams.map((t) => [t.id, t.name]));
          const listLines = raw.topCandidates.map((c, i) =>
            `${i + 1}위  ${c.name} (${teamById.get(c.teamId) ?? c.teamId})  OVR ${Math.round(c.ovr)}`
          );
          const msgId = `msg-sports-candidates-${weekNum}-${s.seasonYear}`;
          gameStore.addMessage({
            id: msgId,
            category: "news", sender: "스포츠조선",
            subject: `${s.seasonYear} 체육부대 입대 후보 루머`,
            preview: `이번 시즌 체육부대 후보 30인이 거론되고 있습니다.`,
            body: [
              `${s.seasonYear}년 체육부대 입대 후보로 거론되는 30인 명단입니다.`,
              `실제 신청자는 다를 수 있습니다.`,
              ``,
              ...listLines,
            ].join("\n"),
            createdAt: `W${weekNum}`, readAt: null,
          });

          const action: PendingAction = { type: "sportsUnitApplication" };
          seasonStore.pushPendingAction(action);
          return { processedWeek: s.currentWeek, logs: ["체육부대 후보 공개"], newMessages: [], matchResults: [], stoppedBy: action };
        }
      }

      // W52: 체육부대 신청자 결과 처리
      if (weekInYear === 52 && p.sportsUnitApplied) {
        const m = get(masterStore);
        const npcPool = m.entities
          .filter((e) => {
            if (e.role !== "player") return false;
            const npcSave = g.npcs.find((n) => n.npcId === e.id);
            if (!isKoreanMilitaryEligible(e, npcSave)) return false;
            return npcSave?.militaryStatus === "미필" && npcSave.careerStatus === "active" && e.id !== p.id;
          })
          .map((e) => {
            const live = get(npcLiveStatsStore)[e.id];
            const ep = (e.details as import("../stores/master").EntityDetails)?.player;
            const ovr = live?.pitching?.ovr ?? ep?.pitching?.ovr ?? 50;
            return { id: e.id, name: e.name, ovr, teamId: e.teamId, position: ep?.position ?? "SP", isProtagonist: false };
          });

        // NPC 29명 + 주인공 1명 = 30명 풀
        const topNpcRaw = JSON.parse(
          await window.projectB!.militaryCalcCandidates(JSON.stringify({ candidates: npcPool, topN: 29 }))
        ) as { topCandidates: { id: string; name: string; ovr: number; teamId: string; position: string }[] };

        const applicants = [
          { id: p.id, name: p.name, ovr: p.pitching.ovr, teamId: p.teamId, position: p.position ?? "SP", isProtagonist: true },
          ...topNpcRaw.topCandidates.map((c) => ({ ...c, isProtagonist: false })),
        ];

        const selResult = JSON.parse(
          await window.projectB!.militaryCalcSelection(JSON.stringify({
            applicants,
            maxTotal: 10,
            maxPerTeam: 3,
          }))
        ) as { protagonistSelected: boolean; selectedIds: string[] };

        if (selResult.protagonistSelected) {
          gameStore.addMessage({
            id: `msg-sports-selected-${weekNum}`,
            category: "system", sender: "병무청",
            subject: "체육부대 선발 통보",
            preview: "체육부대에 선발되었습니다.",
            body: "이번 체육부대 선발에 합격하였습니다.\n체육부대로 입대합니다.",
            createdAt: `W${weekNum}`, readAt: null,
          });
          gameStore.enlistMilitary("sports", weekNum, true, s.seasonYear);
          gameStore.addCareerEvent({ year: s.seasonYear, eventType: "military_enlist",
            fromTeamId: p.teamId || undefined, fromLeagueId: p.leagueId || undefined, detail: "체육부대 입대" });
          // 군입대 시 SeasonEndModal이 스킵되므로 여기서 NPC 오프시즌 처리
          await gameStore.processAllLeaguesSeasonEnd(s.seasonYear);
          seasonStore.initSeason("LEAGUE_MILITARY", s.seasonYear + 1, 100, []);
          seasonStore.setSchedule([]);
          const milSlotId = get(gameStore).currentSlotId;
          if (milSlotId) {
            await window.projectB!.leagueAddTransactions(JSON.stringify({
              slotId: milSlotId,
              rows: [{ seasonYear: s.seasonYear, week: weekNum, category: "military",
                playerId: p.id, playerName: p.name,
                fromTeamId: p.teamId || null, fromLeagueId: p.leagueId || null,
                detail: "체육부대 입대" }],
            }));
          }
          await gameStore.save();
          await seasonStore.save();
          return { processedWeek: weekNum, logs: ["체육부대 입대"], newMessages: [], matchResults: [], stoppedBy: null };
        }

        const action: PendingAction = { type: "militaryEnlistAsk", reason: "rejected" };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["체육부대 탈락"], newMessages: [], matchResults: [], stoppedBy: action };
      }

      // W52: 스카우트 능력치 향상 + NPC loyalty 연간 감쇠
      if (weekInYear === 52 && ["pro_kbl", "pro_abl", "pro_jbl"].includes(p.careerStage)) {
        processScoutingImprovement().catch(e => autoLog(`[스카우트향상오류] ${e}`));

        // season_end_normal loyalty 감쇠
        const namedActive = get(gameStore).npcs.filter(n =>
          n.careerStatus === "active" && n.personality
        );
        if (namedActive.length > 0) {
          const loyaltyUpdates = await Promise.all(
            namedActive.map(async (npc) => {
              const newLoyalty = JSON.parse(
                await window.projectB!.updatePlayerLoyaltyNative(JSON.stringify({
                  currentLoyalty:      npc.personality!.loyalty,
                  eventType:           "season_end_normal",
                  eventMagnitude:      1.0,
                  stabilityPreference: npc.personality!.stabilityPreference,
                }))
              ) as number;
              return { npcId: npc.npcId, loyalty: newLoyalty };
            })
          );
          const loyaltyMap = new Map(loyaltyUpdates.map(u => [u.npcId, u.loyalty]));
          gameStore.updateNpcs(
            get(gameStore).npcs.map(n => {
              const newLoy = loyaltyMap.get(n.npcId);
              if (newLoy === undefined || !n.personality) return n;
              return { ...n, personality: { ...n.personality, loyalty: newLoy } };
            })
          );
        }
      }

      // W52: 입영 기간 만료 (28세 이상, 미신청)
      if (weekInYear === 52 && p.age >= 28) {
        const action: PendingAction = { type: "militaryEnlistAsk", reason: "overdue" };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["입영 기간 만료"], newMessages: [], matchResults: [], stoppedBy: action };
      }

      // 26~27세 패널티 누적 (W1 시점 체크)
      if (weekInYear === 1 && p.age >= 26) {
        const penalty = p.age === 26 ? 3 : 5;
        gameStore.addMilitaryDeferPenalty(penalty);
      }
    }
  }

  // ── 1주 진행: 정확히 currentWeek+1 처리 후 반환 ─────────────
  {
    const s = get(seasonStore);

    if (s.pendingActions.length > 0) {
      gameStore.save(); seasonStore.save();
      return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: s.pendingActions[0] };
    }

    if (s.currentWeek >= s.totalWeeks) {
      const result = await handleSeasonEnd();
      gameStore.save(); seasonStore.save();
      return { ...result, logs: [...accLogs, ...result.logs], matchResults: [...accResults, ...result.matchResults] };
    }

    // ── 같은 주차 미완료 경기 처리 (NPC + 고아 주인공 경기) ──────
    // advanceWeek가 주인공 경기에서 멈춘 뒤 재호출될 때 실행.
    // pending action이 없는데 주인공 경기 결과가 없으면 자동 시뮬(고아 경기).
    {
      const weekAlreadyStarted = s.schedule.some(
        (e) => e.week === s.currentWeek && !!e.result,
      );
      const remainingGamesThisWeek = s.schedule.filter(
        (e) => e.week === s.currentWeek && !e.result,
      );
      const remainingNpcGames  = remainingGamesThisWeek.filter((e) => !e.isProtagonistGame);
      const orphanProtag       = remainingGamesThisWeek.filter((e) => e.isProtagonistGame);
      // pendingActions가 없는데 주인공 경기가 남아있으면 → 고아 경기 (진행 중 버그 케이스)
      const hasOrphan = orphanProtag.length > 0 && s.pendingActions.length === 0;

      const gamesToAutoSim = hasOrphan
        ? [...orphanProtag, ...remainingNpcGames]  // 고아 경기 + NPC 경기 모두 처리
        : remainingNpcGames;                        // 정상: NPC 경기만

      // processWeekBoundary pending으로 thisWeekGames 루프가 실행 안 된 케이스.
      // weekAlreadyStarted=false + 미처리 경기 + pendingActions 없음 → 주 올리기 전에 처리.
      const hasInterruptedWeekGames =
        !weekAlreadyStarted &&
        remainingGamesThisWeek.length > 0 &&
        s.pendingActions.length === 0;

      if (hasInterruptedWeekGames) {
        const sorted = [...remainingGamesThisWeek].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
        for (const game of sorted) {
          const sCurrent = get(seasonStore);
          const freshGame = sCurrent.schedule.find((e) => e.id === game.id);
          if (!freshGame || freshGame.result) continue;

          const gCurrent = get(gameStore);
          const isTeamGame =
            game.homeTeamId === gCurrent.protagonist.teamId ||
            game.awayTeamId === gCurrent.protagonist.teamId;

          if (game.isProtagonistGame || (!game.isProtagonistGame && isTeamGame && gCurrent.protagonist.playerType === "pitcher")) {
            const isInjured = !!gCurrent.protagonist.injury;
            const cond = gCurrent.protagonist.condition;

            if (isInjured || cond < 35) {
              const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
              if (game.isFriendly) {
                const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
                seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
              } else {
                seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
                await applyPostseasonResult(game.id, result);
              }
              accResults.push(result);
              accLogs.push(isInjured ? "부상으로 인해 경기 출전 불가" : `컨디션 불량(${cond})으로 등판 회피`);
            } else if (cond < 55) {
              seasonStore.setCurrentDate(game.gameDate);
              const action: PendingAction = { type: "conditionWarning", scheduleId: game.id, condition: cond };
              seasonStore.pushPendingAction(action);
              gameStore.save(); seasonStore.save();
              return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: action };
            } else {
              seasonStore.setCurrentDate(game.gameDate);
              const gameAction: PendingAction = { type: "game", scheduleId: game.id };
              const briefAction: PendingAction = { type: "preGameBriefing", scheduleId: game.id };
              seasonStore.pushPendingAction(briefAction);
              seasonStore.pushPendingAction(gameAction);
              gameStore.save(); seasonStore.save();
              return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: briefAction };
            }
          } else {
            const entities2 = get(masterStore).entities;
            const leagueId2   = gCurrent.protagonist.leagueId;
            const lState2     = get(seasonStore).leagueState[leagueId2];
            const homeRotIdx2 = lState2?.teamRotationIndex?.[game.homeTeamId] ?? 0;
            const awayRotIdx2 = lState2?.teamRotationIndex?.[game.awayTeamId] ?? 0;
            const conditions2 = lState2?.playerConditions ?? {};
            let npcResult2: MatchResult;
            let nextHomeRot2 = homeRotIdx2;
            let nextAwayRot2 = awayRotIdx2;
            let pitcherConds2: Record<string, PlayerCondition> = {};

            if (entities2.length > 0) {
              const _tradeWeeks2 = gCurrent.protagonist.tradeAdaptationWeeks ?? 0;
              const sim2 = await simulateGame(game.homeTeamId, game.awayTeamId, entities2, {
                conditions: conditions2, homeRotIdx: homeRotIdx2, awayRotIdx: awayRotIdx2, week: game.week,
                npcInjuries: get(seasonStore).npcInjuries,
                rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
                npcLiveStats: get(npcLiveStatsStore),
                tradeAdaptationPenalty: _tradeWeeks2 > 0
                  ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeks2 }
                  : undefined,
              });
              npcResult2 = sim2.result; nextHomeRot2 = sim2.nextHomeRotIdx; nextAwayRot2 = sim2.nextAwayRotIdx; pitcherConds2 = sim2.pitcherConditions;
            } else {
              npcResult2 = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
            }
            if (game.isFriendly) {
              seasonStore.applyFriendlyResult(game.id, npcResult2, leagueId2, game.homeTeamId, game.awayTeamId, nextHomeRot2, nextAwayRot2, null, pitcherConds2);
            } else {
              seasonStore.applyProtagonistGroupNpcResult(game.id, npcResult2, leagueId2, game.homeTeamId, game.awayTeamId, nextHomeRot2, nextAwayRot2, pitcherConds2);
              applyPostseasonResult(game.id, npcResult2);
            }
            accResults.push(npcResult2);
            accLogs.push(`${game.homeTeamId} ${npcResult2.homeScore}:${npcResult2.awayScore} ${game.awayTeamId}`);
          }
        }
        // 현재 주 경기 처리 완료 → fall-through 하여 다음 주로 진행
      }

      const shouldProcess = weekAlreadyStarted &&
        gamesToAutoSim.length > 0 &&
        (hasOrphan || remainingNpcGames.length > 0);

      if (shouldProcess) {
        const sorted = [...gamesToAutoSim].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
        for (const game of sorted) {
          const gCurrent = get(gameStore);
          const entities = get(masterStore).entities;
          const leagueId    = gCurrent.protagonist.leagueId;
          const lStateSnap  = get(seasonStore).leagueState[leagueId];
          const homeRotIdx  = lStateSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0;
          const awayRotIdx  = lStateSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0;
          const conditions  = lStateSnap?.playerConditions ?? {};

          let npcResult: MatchResult;
          let nextHomeRotIdx = homeRotIdx;
          let nextAwayRotIdx = awayRotIdx;
          let pitcherConds: Record<string, PlayerCondition> = {};

          if (entities.length > 0) {
            const _tradeWeeksNpc = gCurrent.protagonist.tradeAdaptationWeeks ?? 0;
            const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
              conditions, homeRotIdx, awayRotIdx, week: game.week,
              npcInjuries: get(seasonStore).npcInjuries,
              rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
              npcLiveStats: get(npcLiveStatsStore),
              tradeAdaptationPenalty: _tradeWeeksNpc > 0
                ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeksNpc }
                : undefined,
            });
            npcResult      = sim.result;
            nextHomeRotIdx = sim.nextHomeRotIdx;
            nextAwayRotIdx = sim.nextAwayRotIdx;
            pitcherConds   = sim.pitcherConditions;
          } else {
            npcResult = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          }

          if (game.isFriendly) {
            seasonStore.applyFriendlyResult(
              game.id, npcResult, leagueId,
              game.homeTeamId, game.awayTeamId,
              nextHomeRotIdx, nextAwayRotIdx,
              null, pitcherConds,
            );
          } else {
            seasonStore.applyProtagonistGroupNpcResult(
              game.id, npcResult, leagueId,
              game.homeTeamId, game.awayTeamId,
              nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
            );
            applyPostseasonResult(game.id, npcResult);
          }
          accResults.push(npcResult);
          accLogs.push(`${game.homeTeamId} ${npcResult.homeScore}:${npcResult.awayScore} ${game.awayTeamId}`);
        }
        // 현재 주 NPC 경기 처리 완료 → fall-through 하여 다음 주로 진행
      }
    }

    const nextWeekNum = s.currentWeek + 1;
    seasonStore.advanceWeek();
    seasonStore.setCurrentDate(toGameDate(s.seasonYear, nextWeekNum, 0));

    // 전역 회복 / 이적 적응 처리
    {
      const gInner = get(gameStore);
      if ((gInner.protagonist.militaryRecoveryWeeks ?? 0) > 0) {
        gameStore.advanceMilitaryRecoveryWeek();
        gameStore.applyWeekResult(
          { condition: Math.min(100, gInner.protagonist.condition + 2), fatigue: Math.max(0, gInner.protagonist.fatigue - 3) },
          ["전역 후 재활 진행"], [], nextWeekNum, s.seasonYear,
        );
      }
      if ((gInner.protagonist.tradeAdaptationWeeks ?? 0) > 0) {
        gameStore.advanceTradeAdaptationWeek();
        gameStore.applyWeekResult(
          { condition: Math.max(0, gInner.protagonist.condition - 2), morale: Math.max(0, gInner.protagonist.morale - 2) },
          ["이적 적응 기간: 컨디션/사기 패널티 적용"], [], nextWeekNum, s.seasonYear,
        );
      }
    }

    const weekLogs = await processWeekBoundary(nextWeekNum);
    accLogs.push(...weekLogs);

    const sAfterBoundary = get(seasonStore);
    if (sAfterBoundary.pendingActions.length > 0) {
      gameStore.save(); seasonStore.save();
      return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: sAfterBoundary.pendingActions[0] };
    }

    // 포스트시즌 주입
    const gForPS = get(gameStore);
    if (gForPS.protagonist.careerStage === "highschool") {
      await injectHsPostseason(nextWeekNum);
    } else {
      await injectLeaguePostseason(nextWeekNum);
    }

    // 이번 주 미결 경기를 gameDate 순으로 처리
    const sForGames = get(seasonStore);
    const thisWeekGames = sForGames.schedule
      .filter((e) => e.week === nextWeekNum && !e.result)
      .sort((a, b) => a.gameDate.localeCompare(b.gameDate));

    for (const game of thisWeekGames) {
      const sCurrent = get(seasonStore);
      const freshGame = sCurrent.schedule.find((e) => e.id === game.id);
      if (!freshGame || freshGame.result) continue;

      const gCurrent = get(gameStore);
      const currentRole = gCurrent.protagonist.currentRole;
      const isTeamGame =
        game.homeTeamId === gCurrent.protagonist.teamId ||
        game.awayTeamId === gCurrent.protagonist.teamId;
      // 불펜 등판 판정: 컨디션(playerConditions) + 투구 이력 전달
      const sForReliever   = get(seasonStore);
      const leagueIdR      = gCurrent.protagonist.leagueId;
      const lStateR        = sForReliever.leagueState[leagueIdR];
      const myCondR        = lStateR?.playerConditions?.[gCurrent.protagonist.id];
      const relieverPitching =
        !game.isProtagonistGame &&
        isTeamGame &&
        gCurrent.protagonist.playerType === "pitcher" &&
        !!currentRole &&
        isReliefsRole(currentRole) &&
        await relieverWouldPitch(
          currentRole,
          myCondR?.pitchOutsLast ?? 0,
          myCondR?.lastPitchedWeek ?? 0,
          nextWeekNum,
        );

      if (game.isProtagonistGame || relieverPitching) {
        const eligibilityBlocked = gCurrent.schoolState.eligibilityBlocked;
        const isInjured          = !!gCurrent.protagonist.injury;
        const cond               = gCurrent.protagonist.condition;

        if (eligibilityBlocked) {
          // 학사 경고 → 자동 시뮬
          gameStore.clearEligibilityBlock();
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
          } else {
            seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push("학사 경고로 인해 경기 출전 불가");
        } else if (isInjured) {
          // 부상 중 → 자동 시뮬 + 메시지
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
          } else {
            seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push("부상으로 인해 경기 출전 불가");
          gameStore.addMessage({
            id: `msg-inj-skip-w${nextWeekNum}-${Date.now()}`,
            category: "system", sender: "코칭스태프",
            subject: "부상으로 인한 등판 회피",
            preview: "부상 회복 중으로 이번 경기에 출전하지 않습니다.",
            body: `부상 회복 중(${gCurrent.protagonist.injury!.recoveryWeeksLeft}주 남음)으로 이번 경기 등판을 회피했습니다.`,
            createdAt: `W${nextWeekNum}`, readAt: null,
          });
        } else if (cond < 35) {
          // 컨디션 극히 낮음 → 자동 회피 + 메시지
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          if (game.isFriendly) {
            const lSnap = get(seasonStore).leagueState[gCurrent.protagonist.leagueId];
            seasonStore.applyFriendlyResult(game.id, result, gCurrent.protagonist.leagueId, game.homeTeamId, game.awayTeamId, (lSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0) + 1, (lSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0) + 1, null);
          } else {
            seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
            await applyPostseasonResult(game.id, result);
          }
          accResults.push(result);
          accLogs.push(`컨디션 불량(${cond})으로 등판 회피`);
          gameStore.addMessage({
            id: `msg-cond-skip-w${nextWeekNum}-${Date.now()}`,
            category: "system", sender: "코칭스태프",
            subject: "컨디션 불량으로 인한 등판 회피",
            preview: `컨디션 ${cond} — 이번 경기 등판을 회피했습니다.`,
            body: `현재 컨디션(${cond})이 너무 낮아 코칭스태프 판단으로 이번 경기 등판을 회피했습니다.`,
            createdAt: `W${nextWeekNum}`, readAt: null,
          });
        } else if (cond < 55) {
          // 컨디션 저조 → 사용자 선택 (강행/회피)
          seasonStore.setCurrentDate(game.gameDate);
          const action: PendingAction = { type: "conditionWarning", scheduleId: game.id, condition: cond };
          seasonStore.pushPendingAction(action);
          gameStore.save(); seasonStore.save();
          return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: action };
        } else {
          // 정상 등판
          seasonStore.setCurrentDate(game.gameDate);

          // 브리핑 → 게임 순으로 push (공식·친선 모두)
          const gameAction: PendingAction  = { type: "game", scheduleId: game.id };
          const briefAction: PendingAction = { type: "preGameBriefing", scheduleId: game.id };

          seasonStore.pushPendingAction(briefAction);
          seasonStore.pushPendingAction(gameAction);
          gameStore.save(); seasonStore.save();
          return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: briefAction };
        }
      } else {
        const entities = get(masterStore).entities;

        const leagueId   = gCurrent.protagonist.leagueId;
        const lStateSnap = get(seasonStore).leagueState[leagueId];
        const homeRotIdx = lStateSnap?.teamRotationIndex?.[game.homeTeamId] ?? 0;
        const awayRotIdx = lStateSnap?.teamRotationIndex?.[game.awayTeamId] ?? 0;
        const conditions = lStateSnap?.playerConditions ?? {};

        let npcResult: MatchResult;
        let nextHomeRotIdx = homeRotIdx;
        let nextAwayRotIdx = awayRotIdx;
        let pitcherConds: Record<string, PlayerCondition> = {};

        if (entities.length > 0) {
          const _tradeWeeksPs = gCurrent.protagonist.tradeAdaptationWeeks ?? 0;
          const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
            conditions, homeRotIdx, awayRotIdx, week: game.week,
            npcInjuries: get(seasonStore).npcInjuries,
            rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
            npcLiveStats: get(npcLiveStatsStore),
            tradeAdaptationPenalty: _tradeWeeksPs > 0
              ? { playerId: gCurrent.protagonist.id, factor: 1 - 0.04 * _tradeWeeksPs }
              : undefined,
          });
          npcResult      = sim.result;
          nextHomeRotIdx = sim.nextHomeRotIdx;
          nextAwayRotIdx = sim.nextAwayRotIdx;
          pitcherConds   = sim.pitcherConditions;
        } else {
          npcResult = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
        }

        if (game.isFriendly) {
          // 친선경기 → 순위·통계 미반영, rotationIndex만 갱신
          seasonStore.applyFriendlyResult(
            game.id, npcResult, leagueId,
            game.homeTeamId, game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx,
            null, pitcherConds,
          );
        } else {
          seasonStore.applyProtagonistGroupNpcResult(
            game.id, npcResult, leagueId,
            game.homeTeamId, game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
          );
          applyPostseasonResult(game.id, npcResult);
        }
        accResults.push(npcResult);
        accLogs.push(`${game.homeTeamId} ${npcResult.homeScore}:${npcResult.awayScore} ${game.awayTeamId}`);
      }
    }

    const sFinal = get(seasonStore);
    if (sFinal.currentWeek >= sFinal.totalWeeks) {
      const result = await handleSeasonEnd();
      gameStore.save(); seasonStore.save();
      return { ...result, logs: [...accLogs, ...result.logs], matchResults: [...accResults, ...result.matchResults] };
    }

    gameStore.save(); seasonStore.save();
    return { processedWeek: nextWeekNum, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: null };
  }
}
