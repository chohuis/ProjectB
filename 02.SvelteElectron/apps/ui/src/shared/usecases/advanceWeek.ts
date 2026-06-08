import { get } from "svelte/store";
import { seasonStore } from "../stores/season";
import { gameStore } from "../stores/game";
import { masterStore } from "../stores/master";
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
import { isFaEligible } from "../utils/faEngine";
import type { LeagueSeasonState, MatchResult, PendingAction, PlayerCondition, ScheduleEntry, WeekAdvanceResult } from "../types/season";
import type { EventContext } from "../types/event";
import type { MessageItem } from "../types/main";
import type { InjurySeverity, InjuryHistoryEntry, InjuryState, InjuryType, NpcMemory, PitchingAttributes, ProtagonistSave } from "../types/save";
import { INJURY_LABEL } from "../types/save";
import { toGameDate, generateHsPostseasonSemis, generateHsPostseasonFinal } from "../utils/scheduleGen";
import { assignProtagonistRole, assignHighschoolPosition, ROLE_DESCRIPTION, isReliefsRole, relieverWouldPitch } from "../utils/pitcherRoleEngine";
import {
  buildKblBracket, buildAblBracket, buildUnivBracket, buildIndBracket,
  applyGameToSeries, fillNextSeries, resolveNonProtagonistSeries,
  makeSeriesGame, nextGameNum,
} from "../utils/postseasonEngine";

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

function makeTrainingMessage(week: number, logs: string[]): MessageItem {
  return {
    id: `msg-train-w${week}-${Date.now()}`,
    category: "system",
    sender: "훈련 시스템",
    subject: `W${week} 훈련 결과`,
    preview: logs[0] ?? "",
    body: logs.join("\n"),
    createdAt: `W${week}`,
    readAt: null,
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
  let entities = get(masterStore).entities;
  if (entities.length === 0) {
    await masterStore.loadEntities("");
    entities = get(masterStore).entities;
  }
  if (entities.length > 0) {
    return (await simulateGame(homeTeamId, awayTeamId, entities)).result;
  }
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

async function processNpcInjuries(weekNum: number): Promise<void> {
  seasonStore.tickNpcInjuries();

  const s = get(seasonStore);
  const g = get(gameStore);
  const m = get(masterStore);

  // Build player role and consecutive appearance from schedule data (protagonist's league)
  const playerData = new Map<string, { role: "pitcher" | "batter"; weeks: Set<number> }>();
  for (const entry of s.schedule) {
    if (!entry.result || entry.week >= weekNum) continue;
    for (const line of entry.result.playerLines) {
      if (line.playerId === g.protagonist.id) continue;
      const ex = playerData.get(line.playerId);
      if (ex) { ex.weeks.add(entry.week); }
      else     { playerData.set(line.playerId, { role: line.role, weeks: new Set([entry.week]) }); }
    }
  }
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

  for (const [playerId, data] of playerData) {
    const entity = entityMap.get(playerId);
    const age = ((entity?.details as { player?: { age?: number } } | undefined)?.player?.age) ?? 25;
    const existing = s.npcInjuries[playerId];

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
      hasPriorInjury: existing !== undefined,
      isPlayingThrough: existing?.isPlayingThrough ?? false,
      playingThroughSeverity: existing?.isPlayingThrough ? (existing.severity as string) : null,
    });
  }
  if (players.length === 0) return;

  const result = JSON.parse(
    await window.projectB!.weekCalcNpcInjuries(JSON.stringify({ players }))
  ) as { occurred: { playerId: string; severity: string; recoveryWeeks: number }[] };

  for (const occ of result.occurred) {
    const entity = entityMap.get(occ.playerId);
    const injuryMgmt = entity ? (mgrInjuryMgmt.get(entity.teamId) ?? 50) : 50;

    let isPlayingThrough = false;
    if (occ.severity === "light")    isPlayingThrough = injuryMgmt < 70;
    if (occ.severity === "moderate") isPlayingThrough = injuryMgmt < 40;

    seasonStore.setNpcInjury(occ.playerId, {
      severity: occ.severity as InjurySeverity,
      weeksLeft: occ.recoveryWeeks,
      isPlayingThrough,
    });
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

// 모든 선수 NPC 월간 성장 처리
async function processMonthlyNpcGrowth(weekNum: number, weekInYear: number): Promise<void> {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);

  // 현재 페이즈
  const currentPhase = s.schedule.find((e) => e.week === weekNum)?.phase ?? "offseason";

  // 팀 컨텍스트 조립
  const teamContexts = m.teams.map((t) => {
    const mgr   = m.entities.find((e) => e.role === "manager" && e.teamId === t.id);
    const coach = m.entities.find((e) => e.role === "coach" && e.teamId === t.id);
    return {
      teamId: t.id,
      facilityTier: t.tier ?? "독립",
      managerDevelopment: (mgr?.details as any)?.manager?.stats?.development ?? 50,
      coachTeaching: (coach?.details as any)?.coach?.stats?.teaching ?? 50,
    };
  });

  // 이전 달 성적 집계
  const { start, end } = getPrevMonthRange(weekInYear);
  const allSchedule = [
    ...s.schedule,
    ...Object.values(s.leagueSchedules).flat(),
  ];
  const perfRaw = aggregateMonthlyPerf(allSchedule, start, end);
  const perfData: Record<string, { gamesPlayed: number; era?: number; battingAvg?: number }> = perfRaw;

  // 전체 선수 엔티티 → NpcLiveInput 변환
  const npcs = m.entities
    .filter((e) => e.role === "player")
    .map((e) => {
      const live = s.npcLiveStats[e.id];
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
      };
    });

  if (npcs.length === 0) return;

  // Rust 호출
  const result = JSON.parse(
    await window.projectB!.npcCalcMonthlyGrowth(JSON.stringify({
      npcs,
      teamContexts,
      perfData,
      currentPhase,
      monthIndex: MONTH_STARTS_1.indexOf(weekInYear),
    }))
  ) as { updated: Array<{
    npcId: string;
    pitching?: any;
    batting?: any;
    pitchingXp: Record<string, number>;
    battingXp: Record<string, number>;
    peakOvr: number;
  }> };

  // seasonStore 업데이트
  seasonStore.applyNpcLiveGrowth(result.updated);
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

  // W1: 주인공 스냅샷 저장 + NPC 라이브 스탯 초기화
  if (weekNum === 1) {
    gameStore.saveSeasonStartSnapshot();
    seasonStore.initNpcLiveStats(m.entities);
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
  const facilityEffMod = JSON.parse(await window.projectB!.weekCalcFacilityEff(
    JSON.stringify({ careerStage: g.protagonist.careerStage, teamTier: teamRef?.tier ?? null })
  )) as number;

  const prevLowMoraleWeeks = g.protagonist.consecutiveLowMoraleWeeks ?? 0;
  const isLowMorale        = g.protagonist.morale < 35;
  const newLowMoraleWeeks  = isLowMorale ? prevLowMoraleWeeks + 1 : 0;
  const slumpPenalty       = newLowMoraleWeeks >= 3 ? 0.70 : 1.0;

  const alreadyInjured = !!g.protagonist.injury;

  // 훈련 강도 계산: TRN_RECOVERY / TRN_MENTAL_P / TRN_MENTAL_B 제외한 슬롯 비율
  const LOW_INTENSITY_PROGRAMS = new Set(["TRN_RECOVERY", "TRN_MENTAL_P", "TRN_MENTAL_B"]);
  const trnSlots = [g.trainingPlan.primaryProgramId, g.trainingPlan.secondaryProgramId, g.trainingPlan.secondary2ProgramId].filter((id): id is string => !!id);
  const highCount = trnSlots.filter(id => !LOW_INTENSITY_PROGRAMS.has(id)).length;
  const trainingIntensity = trnSlots.length > 0 ? highCount / trnSlots.length : 0;

  // 동일 부위 이전 부상 이력 여부 (moderate 이상)
  const hasPriorInjurySameArea = (g.protagonist.injuryHistory ?? []).some(h => h.severity !== "light");

  const injuryCalc = JSON.parse(await window.projectB!.weekCalcInjury(JSON.stringify({
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
  }))) as { injuryUpdate: { type: string; severity: string; recoveryWeeksLeft: number } | null; justOccurred: boolean; justHealed: boolean; effMod: number; newConsecutiveHighFatigueWeeks: number; source: string | null };
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

  const weeklyNet = JSON.parse(await window.projectB!.weekCalcWeeklyNet(
    JSON.stringify({ careerStage: g.protagonist.careerStage, salary: g.protagonist.contract?.salary ?? null })
  )) as number;
  gameStore.applyMoneyChange(weeklyNet);
  gameStore.recordTrainingWeek();

  const ovrBefore = g.protagonist.pitching.ovr;
  const ovrAfter  = growth.protagonistPatch.pitching?.ovr ?? ovrBefore;
  if (ovrAfter > ovrBefore) gameStore.updateScoutScore(Math.min(3, Math.max(1, ovrAfter - ovrBefore)));

  gameStore.applyWeekResult(growth.protagonistPatch, growth.logs, [], weekNum, s.seasonYear);
  if (growth.logs.length > 0) gameStore.addMessage(makeTrainingMessage(weekNum, growth.logs));
  logs.push(...growth.logs);

  // 이벤트 엔진
  const gForEvent = get(gameStore);
  const sForEvent = get(seasonStore);
  const careerStageYear = calcCareerStageYear(gForEvent.protagonist, weekNum, gForEvent.schoolState.universityWeek ?? 0);
  const eventCtx: EventContext = {
    protagonist:     gForEvent.protagonist,
    currentWeek:     weekNum,
    seasonPhase:     sForEvent.schedule.find((e) => e.week === weekNum)?.phase ?? "season",
    standings:       sForEvent.standings,
    stats:           sForEvent.stats,
    triggeredEvents: sForEvent.triggeredEvents,
  };
  const randCount = m.eventPools.length + m.eventPools.reduce((s, p) => s + p.maxPicksPerWeek, 0);
  const eventRands = JSON.parse(await window.projectB!.weekRollRandomBatch(randCount)) as number[];
  const evResult = runEventEngine(
    m.eventRules, m.eventPools,
    new Map(m.messageTmpls.map((t) => [t.id, t])),
    new Map(m.decisionTmpls.map((d) => [d.id, d])),
    eventCtx, sForEvent.seasonYear, careerStageYear,
    eventRands,
  );
  for (const msg of evResult.newMessages) gameStore.addMessage(msg);
  seasonStore.recordTriggeredEvents(evResult.updatedTriggers);

  // 고교 월간 유망주 TOP 10 (4주마다)
  if (
    g.protagonist.careerStage === "highschool" &&
    weekInYear % 4 === 0 &&
    weekInYear >= 4
  ) {
    const gTop10   = get(gameStore);
    const sTop10   = get(seasonStore);
    const heroStats = sTop10.stats[gTop10.protagonist.id] ?? null;
    const last      = gTop10.protagonist.playerType === "pitcher"
      ? gTop10.lastTop10Pitcher
      : gTop10.lastTop10Batter;

    const snap = generateTop10(
      gTop10.protagonist,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      weekNum,
      gTop10.protagonist.grade ?? 1,
    );

    const msg = buildTop10Message(
      gTop10.protagonist,
      heroStats as import("../types/save").PitcherSeasonStats | import("../types/save").BatterSeasonStats | null,
      m.entities,
      snap,
      last,
      weekNum,
    );

    gameStore.addMessage(msg);
    gameStore.saveTop10Snapshot(snap);

    const heroEntry = snap.entries.find((e) => e.id === "PLY_HERO");
    if (heroEntry) {
      const ef = rankEffect(heroEntry.rank);
      if (ef.popularity > 0) gameStore.updatePopularity(ef.popularity);
      if (ef.scoutScore > 0) gameStore.updateScoutScore(ef.scoutScore);
      if (ef.morale > 0) gameStore.updateMorale(ef.morale);
    }
  }

  // NPC 월간 성장/하락 처리 (매월 첫 주)
  if (isMonthStart(weekInYear)) {
    await processMonthlyNpcGrowth(weekNum, weekInYear);
    // 성장 결과를 masterStore.entities에 반영 (게임 시뮬레이션에 즉시 적용)
    masterStore.applyNpcLiveStats(get(seasonStore).npcLiveStats);
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

    // 리그 시즌 종료 주차 추정 (고교 W48, 대학 W36, 독립리그 W40)
    const seasonPhaseEnd =
      proto.careerStage === "highschool"  ? 48 :
      proto.careerStage === "university"  ? 36 : 40;

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

  // 고3 진로 선택 이벤트 (W50)
  const gLatest = get(gameStore);
  if (
    gLatest.protagonist.careerStage === "highschool" &&
    careerStageYear === 2 && weekInYear === 50 &&
    !gLatest.schoolState.careerChoiceTriggered
  ) {
    gameStore.markCareerChoiceTriggered();
    seasonStore.pushPendingAction({ type: "careerChoiceHub" });
  }

  // 대학 졸업반 드래프트 이벤트 (W52)
  const gDraft = get(gameStore);
  const hasCareerChoicePending = get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub"
  );
  const isUnivDraftWeek =
    gDraft.protagonist.careerStage === "university" &&
    careerStageYear === 3 && weekInYear === 52;
  if (isUnivDraftWeek && !gDraft.schoolState.draftTriggered &&
      !get(seasonStore).pendingActions.some((a) => a.type === "draft")) {
    gameStore.markDraftTriggered(true);
    seasonStore.pushPendingAction({ type: "draft" });
  }

  // 고교 W51 지원 결과
  const needHsCareerResult =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear === 51 &&
    gDraft.schoolState.careerApplicationsSubmitted &&
    !gDraft.schoolState.fallbackSelectionPending &&
    !hasCareerChoicePending;
  if (needHsCareerResult) {
    const p = gDraft.protagonist;
    const subjects = Object.values(gDraft.schoolState.subjectScores);
    const avgPct = subjects.length ? subjects.reduce((a, s2) => a + s2.percentile, 0) / subjects.length : 50;
    const univChoices = gDraft.schoolState.fallbackUniversityChoices.slice(0, 3);
    const indieChoices = gDraft.schoolState.fallbackIndependentChoices.slice(0, 3);
    const admissionsCalc = JSON.parse(await window.projectB!.weekCalcHsAdmissions(JSON.stringify({
      ovr: p.pitching.ovr, avgPct, univChoices, indieChoices,
    }))) as { univPassed: string[]; indiePassed: string[]; sportsPassed: boolean };
    const univPassed  = admissionsCalc.univPassed;
    const indiePassed = admissionsCalc.indiePassed;
    const sportsPassed = admissionsCalc.sportsPassed;
    gameStore.setFallbackAdmissions({
      universityChoices: univChoices, independentChoices: indieChoices,
      universityPassed: univPassed,   independentPassed: indiePassed,
      sportsMilitaryPassed: sportsPassed,
      draftPassed: false, draftTeamId: null, draftRound: null, draftPick: null, draftSigningBonus: 0,
    });
    if (gDraft.schoolState.draftIntent) {
      gameStore.addMessage({
        id: `msg-hs-draft-invite-${Date.now()}`,
        category: "system", sender: "Career Office",
        subject: "W51 드래프트 참가 안내",
        preview: "W51주 드래프트에 참가하시겠습니까?",
        body: "드래프트 참가 신청이 완료되었습니다.\nW51주 드래프트에 참가하시겠습니까?",
        createdAt: `W${weekNum}`, readAt: null,
        decision: {
          prompt: "W51주 드래프트에 참가하시겠습니까?",
          options: [
            { id: "join_draft", label: "참가", effectHint: "드래프트 진행" },
            { id: "skip_draft", label: "불참", effectHint: "드래프트 제외 후 진로 선택" },
          ],
          selectedOptionId: null,
        },
      });
    } else {
      seasonStore.pushPendingAction({ type: "careerChoice" });
      gameStore.addMessage({
        id: `msg-career-result-${Date.now()}`,
        category: "system", sender: "Career Office",
        subject: "W51 application results",
        preview: "지원 결과가 도착했습니다. 최종 진로를 선택하세요.",
        body: "지원 결과가 도착했습니다.\n메인 화면에서 최종 진로를 선택하세요.",
        createdAt: `W${weekNum}`, readAt: null,
      });
    }
  }

  const needFallbackChoice =
    gDraft.protagonist.careerStage === "highschool" &&
    gDraft.protagonist.grade === 3 && weekInYear >= 51 &&
    gDraft.schoolState.fallbackSelectionPending;
  if (needFallbackChoice && !get(seasonStore).pendingActions.some(
    (a) => a.type === "careerChoice" || a.type === "careerChoiceHub"
  )) {
    seasonStore.pushPendingAction({ type: "careerChoice" });
  }

  // 프로 트레이드 판정
  const gTrade = get(gameStore);
  if (
    (gTrade.protagonist.careerStage === "pro_kbl" || gTrade.protagonist.careerStage === "pro_abl") &&
    gTrade.protagonist.contract && !get(seasonStore).pendingActions.some((a) => a.type === "trade")
  ) {
    const myStats = (get(seasonStore).stats[gTrade.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
    const myEra = myStats?.era ?? 4.2;
    const standings = get(seasonStore).standings;
    const myRank = [...standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins)
      .findIndex((sRow) => sRow.teamId === gTrade.protagonist.teamId) + 1;
    const sameLeagueTeams = m.teams
      .filter((t) => t.leagueId === gTrade.protagonist.leagueId && t.id !== gTrade.protagonist.teamId)
      .map((t) => t.id);
    if (sameLeagueTeams.length > 0) {
      const tradeCalc = JSON.parse(await window.projectB!.weekCalcTradeRumor(JSON.stringify({
        era: myEra, myRank, totalTeams: standings.length, weekInYear, sameLeagueTeams,
      }))) as { shouldTrigger: boolean; toTeamId: string | null };
      if (tradeCalc.shouldTrigger && tradeCalc.toTeamId) {
        seasonStore.pushPendingAction({
          type: "event", eventId: "EVT_TRADE_RUMOR",
          title: "트레이드 루머",
          description: "타 구단에서 관심을 보이고 있다는 소문이 돌고 있습니다.",
          choices: [{ id: "ok", label: "확인" }],
        });
        seasonStore.pushPendingAction({ type: "trade", fromTeamId: gTrade.protagonist.teamId, toTeamId: tradeCalc.toTeamId });
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
    const namedNpcs = gEmo.npcs.filter(n => n.isNamed && n.emotionStatus !== "archived");

    if (isHs && namedNpcs.length > 0) {
      // 이번 주 주인공 경기 결과 (schedule에서 조회)
      const myGame = sEmo.schedule.find(
        e => e.week === weekNum && e.isProtagonistGame && e.result != null,
      );
      const myResult = myGame?.result;
      const iWon = myResult != null && myResult.winnerId === gEmo.protagonist.teamId;

      // 훈련 여부: 훈련 계획에 이번 주 항목 존재 여부로 추론
      const hasTrainingPlan = (gEmo.trainingPlan?.slots?.length ?? 0) > 0;

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

      const updatedNpcs = namedNpcs.map(npc => {
        // 재회 감지: dormant → active
        const activated = npc.emotionStatus === "dormant"
          && npc.currentLeague === gEmo.protagonist.leagueId
          ? reactivateNpc(npc, gEmo.protagonist.careerStage)
          : npc;

        if (activated.emotionStatus === "active" && npc.emotionStatus === "dormant") {
          const isSameTeam = activated.currentTeam === gEmo.protagonist.teamId;
          const reunionMsg = makeReunionMessage(activated, isSameTeam, weekNum);
          if (reunionMsg) gameStore.addMessage(reunionMsg);
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
        if (msg) gameStore.addMessage(msg);

        return updated;
      });

      const moodMsg = checkTeamMoodWarning(updatedNpcs, weekNum);
      if (moodMsg) gameStore.addMessage(moodMsg);

      gameStore.updateNamedNpcs(updatedNpcs);
    }
  }

  // ── 배경 리그 시뮬레이션 (await — 월간 메시지 전 완료 보장) ────
  const bgEntities = get(masterStore).entities;
  await processNpcInjuries(weekNum);
  seasonStore.applyWeeklyConditionRecovery(bgEntities);
  await seasonStore.simulateBackgroundLeaguesAsync(weekNum, gFinal.protagonist.leagueId, bgEntities);

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

  return logs;
}

// ── 시즌 종료 처리 ────────────────────────────────────────────
async function handleSeasonEnd(): Promise<WeekAdvanceResult> {
  const s = get(seasonStore);
  const g = get(gameStore);

  // 군 복무 종료
  if (g.protagonist.careerStage === "military") {
    gameStore.completeMilitaryService();
    const contract = g.protagonist.contract;
    if (contract) {
      const action: PendingAction = {
        type: "salaryNegotiation",
        teamId: contract.teamId, leagueId: contract.leagueId,
        offeredSalary: contract.salary,
        durationYears: Math.max(1, contract.remainingYears),
        signingBonus: 0,
      };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["전역: 복귀 계약 협상을 진행하세요."], newMessages: [], matchResults: [], stoppedBy: action };
    }
    return { processedWeek: s.currentWeek, logs: ["전역 완료"], newMessages: [], matchResults: [], stoppedBy: null };
  }

  const isProStage = g.protagonist.careerStage === "pro_kbl" || g.protagonist.careerStage === "pro_abl";
  const hasOptionPending = s.pendingActions.some((a) => a.type === "optionClause");
  const hasSalaryPending = s.pendingActions.some((a) => a.type === "salaryNegotiation");

  if (isProStage && g.protagonist.contract && !hasOptionPending && !hasSalaryPending) {
    gameStore.applySeasonContractProgress();
    const gAfter   = get(gameStore);
    const contract = gAfter.protagonist.contract;
    if (!contract) return { processedWeek: s.currentWeek, logs: ["시즌이 종료되었습니다."], newMessages: [], matchResults: [], stoppedBy: null };

    const myStats      = (s.stats[g.protagonist.id] ?? null) as import("../types/save").PitcherSeasonStats | null;
    const seasonRating = await calcSeasonRating(myStats);
    const offeredSalary = await calcOfferedSalaryForProtagonist(g.protagonist, myStats);

    if (contract.remainingYears === 0) {
      if (contract.teamOptionYears > 0) {
        const exercised = seasonRating >= 60;
        const action: PendingAction = { type: "optionClause", optionType: "team", exercised, nextSalary: offeredSalary };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["시즌 종료: 팀 옵션 조항이 처리됩니다."], newMessages: [], matchResults: [], stoppedBy: action };
      }
      if (contract.playerOptionYears > 0) {
        const action: PendingAction = { type: "optionClause", optionType: "player", exercised: false, nextSalary: offeredSalary };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["시즌 종료: 선수 옵션 선택이 필요합니다."], newMessages: [], matchResults: [], stoppedBy: action };
      }
      if (isFaEligible(g.protagonist, g.schoolState.attendsUniversity)) {
        const action: PendingAction = { type: "faMarket" };
        seasonStore.pushPendingAction(action);
        return { processedWeek: s.currentWeek, logs: ["시즌 종료: 계약 만료로 FA 시장에 진입합니다."], newMessages: [], matchResults: [], stoppedBy: action };
      }
      const action: PendingAction = { type: "salaryNegotiation", teamId: contract.teamId, leagueId: contract.leagueId, offeredSalary, durationYears: 1, signingBonus: 0 };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["시즌 종료: FA 자격 미충족으로 연봉 협상을 진행합니다."], newMessages: [], matchResults: [], stoppedBy: action };
    }
    const action: PendingAction = { type: "salaryNegotiation", teamId: contract.teamId, leagueId: contract.leagueId, offeredSalary, durationYears: Math.max(1, contract.remainingYears), signingBonus: 0 };
    seasonStore.pushPendingAction(action);
    return { processedWeek: s.currentWeek, logs: ["시즌 종료: 연봉 협상을 진행하세요."], newMessages: [], matchResults: [], stoppedBy: action };
  }

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

  const SUPPORTED = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT"];
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
    else if (leagueId === "LEAGUE_ABL") {
      const east = s.ablEastTeams ?? [];
      const west = s.ablWestTeams ?? [];
      const eastSt = s.standings.filter((st) => east.includes(st.teamId));
      const westSt = s.standings.filter((st) => west.includes(st.teamId));
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
      const militaryEvents = get(masterStore).militaryEvents;
      const milCalc = JSON.parse(await window.projectB!.weekCalcMilitary(JSON.stringify({
        isSportsUnit,
        stamina:  g.protagonist.pitching.stamina,
        recovery: g.protagonist.pitching.recovery,
        command:  g.protagonist.pitching.command,
        control:  g.protagonist.pitching.control,
        morale:   g.protagonist.morale,
        fatigue:  g.protagonist.fatigue,
        militaryEventCount: militaryEvents.length,
      }))) as { stamina: number; recovery: number; command: number; control: number; morale: number; fatigue: number; eventIndex: number | null };
      if (milCalc.eventIndex !== null) {
        const evt = militaryEvents[milCalc.eventIndex];
        seasonStore.pushPendingAction({
          type: "event", eventId: evt.id, title: evt.title, description: evt.description,
          choices: [{ id: "ok", label: "확인", effects: { moraleDelta: evt.moraleDelta ?? 0, fatigueDelta: evt.fatigueDelta ?? 0 } }],
        });
      }
      const pitching = {
        ...g.protagonist.pitching,
        stamina: milCalc.stamina, recovery: milCalc.recovery,
        command: milCalc.command, control: milCalc.control,
      };
      gameStore.applyWeekResult(
        { morale: milCalc.morale, fatigue: milCalc.fatigue, pitching },
        [isSportsUnit ? "군 복무(체육부대): 훈련 루틴 유지" : "군 복무(일반부대): 기본 근무 수행"],
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

  // ── 군입대 나이 체크 ──────────────────────────────────────────
  {
    const g = get(gameStore);
    const s = get(seasonStore);
    const hasMilitaryPending = s.pendingActions.some((a) => a.type === "militaryEnlist");
    if (!hasMilitaryPending && g.protagonist.careerStage !== "military" &&
        g.protagonist.age >= 28 &&
        (g.protagonist.careerStage === "pro_kbl" || g.protagonist.careerStage === "pro_abl" || g.protagonist.careerStage === "independent")) {
      const action: PendingAction = { type: "militaryEnlist" };
      seasonStore.pushPendingAction(action);
      return { processedWeek: s.currentWeek, logs: ["입영 대상: 군 복무 진행이 필요합니다."], newMessages: [], matchResults: [], stoppedBy: action };
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

      const shouldProcess = weekAlreadyStarted &&
        gamesToAutoSim.length > 0 &&
        (hasOrphan || remainingNpcGames.length > 0);

      if (shouldProcess) {
        const sorted = [...gamesToAutoSim].sort((a, b) => a.gameDate.localeCompare(b.gameDate));
        for (const game of sorted) {
          const gCurrent = get(gameStore);
          let entities = get(masterStore).entities;
          if (entities.length === 0) {
            await masterStore.loadEntities("");
            entities = get(masterStore).entities;
          }
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
            const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
              conditions, homeRotIdx, awayRotIdx, week: game.week,
              npcInjuries: get(seasonStore).npcInjuries,
              rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
              npcLiveStats: get(seasonStore).npcLiveStats,
            });
            npcResult      = sim.result;
            nextHomeRotIdx = sim.nextHomeRotIdx;
            nextAwayRotIdx = sim.nextAwayRotIdx;
            pitcherConds   = sim.pitcherConditions;
          } else {
            npcResult = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          }

          seasonStore.applyProtagonistGroupNpcResult(
            game.id, npcResult, leagueId,
            game.homeTeamId, game.awayTeamId,
            nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
          );
          applyPostseasonResult(game.id, npcResult);
          accResults.push(npcResult);
          accLogs.push(`${game.homeTeamId} ${npcResult.homeScore}:${npcResult.awayScore} ${game.awayTeamId}`);
        }
        gameStore.save(); seasonStore.save();
        return { processedWeek: s.currentWeek, logs: accLogs, newMessages: [], matchResults: accResults, stoppedBy: null };
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
          seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
          await applyPostseasonResult(game.id, result);
          accResults.push(result);
          accLogs.push("학사 경고로 인해 경기 출전 불가");
        } else if (isInjured) {
          // 부상 중 → 자동 시뮬 + 메시지
          const result = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
          seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
          await applyPostseasonResult(game.id, result);
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
          seasonStore.applyMatchResult(game.id, result, gCurrent.protagonist.leagueId);
          await applyPostseasonResult(game.id, result);
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
        let entities = get(masterStore).entities;
        if (entities.length === 0) {
          await masterStore.loadEntities("");
          entities = get(masterStore).entities;
        }

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
          const sim = await simulateGame(game.homeTeamId, game.awayTeamId, entities, {
            conditions, homeRotIdx, awayRotIdx, week: game.week,
            npcInjuries: get(seasonStore).npcInjuries,
            rotationSize: rotationSizeForStage(gCurrent.protagonist.careerStage),
            npcLiveStats: get(seasonStore).npcLiveStats,
          });
          npcResult      = sim.result;
          nextHomeRotIdx = sim.nextHomeRotIdx;
          nextAwayRotIdx = sim.nextAwayRotIdx;
          pitcherConds   = sim.pitcherConditions;
        } else {
          npcResult = await simulateNpcGame(game.homeTeamId, game.awayTeamId);
        }

        seasonStore.applyProtagonistGroupNpcResult(
          game.id, npcResult, leagueId,
          game.homeTeamId, game.awayTeamId,
          nextHomeRotIdx, nextAwayRotIdx, pitcherConds,
        );
        applyPostseasonResult(game.id, npcResult);
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
