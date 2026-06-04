import type { ScheduleEntry, FriendlyPerformanceLog } from "../types/season";
import type { MessageItem } from "../types/main";

// ── 월 경계 (1-indexed weekInYear) ───────────────────────────
const MONTH_STARTS_1 = [1, 6, 10, 14, 19, 23, 27, 32, 36, 40, 45, 49];
const MONTH_NAMES    = ["3월","4월","5월","6월","7월","8월","9월","10월","11월","12월","1월","2월"];

export function isMonthStart(weekInYear: number): boolean {
  return MONTH_STARTS_1.includes(weekInYear);
}

function monthName(weekInYear: number): string {
  let idx = 0;
  for (let i = MONTH_STARTS_1.length - 1; i >= 0; i--) {
    if (weekInYear >= MONTH_STARTS_1[i]) { idx = i; break; }
  }
  return MONTH_NAMES[idx];
}

function monthWeekRange(weekInYear: number): [number, number] {
  let idx = 0;
  for (let i = MONTH_STARTS_1.length - 1; i >= 0; i--) {
    if (weekInYear >= MONTH_STARTS_1[i]) { idx = i; break; }
  }
  const start = MONTH_STARTS_1[idx];
  const end   = idx + 1 < MONTH_STARTS_1.length ? MONTH_STARTS_1[idx + 1] - 1 : 52;
  return [start, end];
}

// ── 요일 상수 ─────────────────────────────────────────────────
// 공식경기 요일(토=6 또는 일=0)로부터 3일 앞 = 수요일
function friendlyDateFromOfficial(officialDate: string): string {
  const d = new Date(officialDate);
  d.setDate(d.getDate() - 3);
  return d.toISOString().split("T")[0];
}

// 주차 + 연도만으로 수요일 날짜 계산 (공식경기 없는 주)
function friendlyDateForWeek(weekNum: number, seasonYear: number): string {
  const start = new Date(`${seasonYear}-03-01`);
  start.setDate(start.getDate() + (weekNum - 1) * 7 + 2); // 수요일
  return start.toISOString().split("T")[0];
}

// ── 결정론적 상대팀 선택 ──────────────────────────────────────
function deterministicPick(myTeamId: string, week: number): number {
  const tail = parseInt(myTeamId.slice(-3).replace(/\D/g, "")) || 1;
  return (tail * 97 + week * 31) % 1000;
}

function findFreeOpponent(
  week: number,
  myTeamId: string,
  allSchedule: ScheduleEntry[],
  leagueTeamIds: string[],
): string | null {
  const busyTeams = new Set(
    allSchedule
      .filter((e) => e.week === week && !e.isFriendly && !e.result)
      .flatMap((e) => [e.homeTeamId, e.awayTeamId]),
  );
  const candidates = leagueTeamIds.filter((t) => t !== myTeamId && !busyTeams.has(t));
  if (!candidates.length) return null;
  return candidates[deterministicPick(myTeamId, week) % candidates.length];
}

// ── 월간 친선경기 플래너 ──────────────────────────────────────
export interface FriendlyPlan {
  entries:       ScheduleEntry[];
  monthLabel:    string;
}

export function planMonthlyFriendlies(
  weekInYear: number,
  absoluteWeek: number,   // 시즌 전체 절대 주차
  myTeamId:    string,
  leagueId:    string,
  seasonYear:  number,
  schedule:    ScheduleEntry[], // 현재 시즌 전체 스케줄
  leagueTeamIds: string[],
  seasonPhaseEnd: number,       // 이 주차 이후는 오프시즌
): FriendlyPlan {
  const [rangeStart, rangeEnd] = monthWeekRange(weekInYear);
  const label = monthName(weekInYear);

  // 이미 이달에 편성된 친선경기 수
  const alreadyFriendly = schedule.filter(
    (e) => e.isFriendly && e.week >= absoluteWeek && e.week <= absoluteWeek + (rangeEnd - rangeStart),
  ).length;
  const needed = Math.max(0, 4 - alreadyFriendly);
  if (needed === 0) return { entries: [], monthLabel: label };

  const entries: ScheduleEntry[] = [];
  const weeksInRange = rangeEnd - rangeStart + 1;

  for (let offset = 0; offset < weeksInRange && entries.length < needed; offset++) {
    const weekNum = absoluteWeek + offset;
    if (weekNum > seasonPhaseEnd) break;

    // 이미 친선경기가 있으면 건너뜀
    const alreadyHasFriendly = schedule.some(
      (e) => e.isFriendly && e.week === weekNum,
    );
    if (alreadyHasFriendly) continue;

    const opponent = findFreeOpponent(weekNum, myTeamId, schedule, leagueTeamIds);
    if (!opponent) continue;

    // 같은 주 공식경기 있으면 그 날짜 기준 3일 전, 없으면 수요일
    const officialThisWeek = schedule.find(
      (e) => !e.isFriendly && e.week === weekNum &&
        (e.homeTeamId === myTeamId || e.awayTeamId === myTeamId),
    );
    const gameDate = officialThisWeek
      ? friendlyDateFromOfficial(officialThisWeek.gameDate)
      : friendlyDateForWeek(weekNum, seasonYear);

    entries.push({
      id:                `FRIENDLY_W${weekNum}_${myTeamId}`,
      week:              weekNum,
      gameDate,
      leagueId,
      homeTeamId:        myTeamId,
      awayTeamId:        opponent,
      isProtagonistGame: true,
      phase:             "season",
      isFriendly:        true,
    });
  }

  return { entries, monthLabel: label };
}

// ── 월간 편성표 메시지 ────────────────────────────────────────
const HS_TEAM_SHORT: Record<string, string> = {
  TEAM_HS_SEOUL_INNOVATION:  "서울 이노베이션",
  TEAM_HS_BUSAN_WAVE:        "부산 웨이브",
  TEAM_HS_DAEGU_HEAT:        "대구 히트",
  TEAM_HS_GWANGJU_VISION:    "광주 비전",
  TEAM_HS_DAEJEON_RISE:      "대전 라이즈",
  TEAM_HS_INCHEON_HARBOR:    "인천 하버",
  TEAM_HS_ULSAN_CHARGE:      "울산 차지",
  TEAM_HS_SUWON_EDGE:        "수원 에지",
  TEAM_HS_YEOSU_SHORE:       "여수 쇼어",
  TEAM_HS_CHUNCHEON_HIGHLAND:"춘천 하이랜드",
  TEAM_HS_JEJU_WIND:         "제주 윈드",
  TEAM_HS_GANGWON_PEAK:      "강원 피크",
  TEAM_HS_MASAN_HARBOR:      "마산 하버",
  TEAM_HS_JECHEON_RIDGE:     "제천 릿지",
  TEAM_HS_GOYANG_ARROW:      "고양 애로우",
  TEAM_HS_SUNCHEON_BAY:      "순천 베이",
};

function teamShort(teamId: string, teamMap?: Map<string, string>): string {
  return teamMap?.get(teamId) ?? HS_TEAM_SHORT[teamId] ?? teamId;
}

export function buildMonthlyNoticeMessage(
  plan: FriendlyPlan,
  officialEntries: ScheduleEntry[],
  weekNum: number,
  teamMap?: Map<string, string>,
): MessageItem | null {
  if (!plan.entries.length) return null;

  const lines = plan.entries.map((e) => {
    const opp  = teamShort(e.awayTeamId, teamMap);
    const date = e.gameDate.slice(5).replace("-", "/"); // "06/11"
    return `  ${date} (수)  친선경기  vs ${opp}`;
  });

  const officialLines = officialEntries
    .filter((e) => !e.isFriendly)
    .map((e) => {
      const opp  = teamShort(e.awayTeamId === "PLY_HERO" ? e.homeTeamId : e.awayTeamId, teamMap);
      const date = e.gameDate.slice(5).replace("-", "/");
      return `  ${date} (토)  공식경기  vs ${opp}`;
    });

  const all = [...lines, ...officialLines].sort();

  const body = [
    `[${plan.monthLabel} 경기 편성]`,
    "",
    ...all,
    "",
    "친선경기 결과는 선발 로테이션 결정에 참고됩니다.",
    "공식 기록에는 포함되지 않습니다.",
  ].join("\n");

  return {
    id:        `msg-friendly-plan-w${weekNum}-${Date.now()}`,
    category:  "manager",
    sender:    "감독",
    subject:   `${plan.monthLabel} 친선경기 ${plan.entries.length}회 편성`,
    preview:   `이번 달 친선경기 ${plan.entries.length}회가 편성되었습니다.`,
    body,
    createdAt: `W${weekNum}`,
    readAt:    null,
  };
}

// ── 친선경기 자동 시뮬 결과 메시지 ──────────────────────────
export function ratePerformance(ip: number, era: number): 1 | 2 | 3 | 4 | 5 {
  if (ip < 1) return 1;
  if (era < 2.00) return 5;
  if (era < 3.50) return 4;
  if (era < 5.00) return 3;
  if (era < 7.00) return 2;
  return 1;
}

const COACH_COMMENTS: Record<1 | 2 | 3 | 4 | 5, string> = {
  5: "오늘 같은 구위면 다음 공식전 선발도 걱정 없다.",
  4: "커맨드가 안정적이었다. 이 흐름을 유지하면 된다.",
  3: "무난한 등판이었다. 핵심 구종 안정성을 더 높여야 한다.",
  2: "오늘은 제구가 흔들렸다. 다음 경기 전에 점검이 필요하다.",
  1: "구위와 제구 모두 부진했다. 다음 선발 순서를 재검토할 수 있다.",
};

export function buildFriendlyResultMessage(
  scheduleEntry: ScheduleEntry,
  homeScore: number,
  awayScore: number,
  ip: number,
  er: number,
  k: number,
  bb: number,
  h: number,
  teamMap?: Map<string, string>,
): { message: MessageItem; log: FriendlyPerformanceLog } {
  const isHome    = scheduleEntry.homeTeamId !== scheduleEntry.awayTeamId;
  const myScore   = homeScore;
  const oppScore  = awayScore;
  const oppTeamId = scheduleEntry.awayTeamId;
  const oppName   = teamShort(oppTeamId, teamMap);
  const won       = myScore > oppScore;
  const resultStr = won ? "승" : myScore === oppScore ? "무" : "패";
  const era       = ip > 0 ? Math.round((er / ip) * 9 * 100) / 100 : 99;
  const rating    = ratePerformance(ip, era);
  const stars     = "★".repeat(rating) + "☆".repeat(5 - rating);
  const comment   = COACH_COMMENTS[rating];

  const body = [
    `친선경기  ${scheduleEntry.homeTeamId === scheduleEntry.awayTeamId ? "" : `vs ${oppName}`}`,
    `결과: ${myScore} : ${oppScore} (${resultStr})`,
    "",
    "▶ 내 기록",
    `  ${ip.toFixed(1)}이닝 / 피안타 ${h} / 자책 ${er} / 삼진 ${k} / 볼넷 ${bb}`,
    "",
    `코치 평가: ${stars}`,
    `"${comment}"`,
    "",
    "[공식 기록 미포함 / 로테이션 1칸 전진]",
  ].join("\n");

  const log: FriendlyPerformanceLog = {
    scheduleId:     scheduleEntry.id,
    week:           scheduleEntry.week,
    opponentTeamId: oppTeamId,
    ip, er, k, bb,
    rating,
  };

  return {
    message: {
      id:        `msg-friendly-result-w${scheduleEntry.week}-${Date.now()}`,
      category:  "system",
      sender:    "감독",
      subject:   `친선경기 결과 — vs ${oppName} (${resultStr} ${myScore}:${oppScore})`,
      preview:   `${ip.toFixed(1)}IP ${k}K ERA ${era.toFixed(2)} — ${stars}`,
      body,
      createdAt: `W${scheduleEntry.week}`,
      readAt:    null,
    },
    log,
  };
}
