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

function getCoachComment(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean): string {
  const ipStr = ip.toFixed(1);

  // 1. 무실점 완투급
  if (ip >= 6 && er === 0)
    return "오늘은 완벽에 가까운 피칭이었다. 이 컨디션을 공식전까지 유지한다면 에이스 자리는 의심할 여지가 없다.";

  // 2. 삼진 폭풍 (rating 5 + K 8+)
  if (rating === 5 && k >= 8)
    return `삼진 ${k}개. 구위가 절정이다. 오늘 같은 공이면 어떤 타선도 막을 수 있다. 다음 공식전이 기대된다.`;

  // 3. 승리 선봉 (rating 5 + 팀 승리)
  if (rating === 5 && won)
    return "호투로 팀 승리를 이끌었다. 에이스란 이런 것이다. 이 투구 내용을 공식전에서도 보여줘라.";

  // 4. 최고 등판 (rating 5 일반)
  if (rating === 5)
    return "오늘 같은 구위면 다음 공식전 선발도 걱정 없다. 이 흐름을 절대 끊지 마라.";

  // 5. 이닝이터 (rating 4 + 5이닝 이상)
  if (rating === 4 && ip >= 5)
    return `${ipStr}이닝 소화. 긴 이닝을 버텨주는 투수가 팀에 얼마나 중요한지 잘 알 것이다. 좋은 등판이었다.`;

  // 6. 정교한 제구 (rating 4 + 볼넷 1 이하)
  if (rating === 4 && bb <= 1)
    return "볼넷이 거의 없는 깔끔한 등판이었다. 제구가 이렇게 안정되면 타자들이 힘들어한다.";

  // 7. 안정적 등판 (rating 4 일반)
  if (rating === 4)
    return "커맨드가 안정적이었다. 큰 실수 없이 경기를 소화했다. 이 흐름을 유지하면 된다.";

  // 8. 구위는 좋지만 (rating 3 + 삼진 6+)
  if (rating === 3 && k >= 6)
    return `삼진 ${k}개로 구위는 살아있다. 하지만 실점 장면이 아쉬웠다. 위기 상황 집중력을 더 키워야 한다.`;

  // 9. 제구 불안 (rating 3 + 볼넷 4+)
  if (rating === 3 && bb >= 4)
    return `볼넷 ${bb}개가 발목을 잡았다. 제구가 흔들리면 체력만 낭비된다. 다음 훈련에서 집중적으로 잡아야 한다.`;

  // 10. 평범한 등판 (rating 3 일반)
  if (rating === 3)
    return "무난한 등판이었다. 이 정도로는 공식전 경쟁에서 앞서기 어렵다. 핵심 구종 완성도를 높여야 한다.";

  // 11. 볼넷 자멸 (rating 2 + 볼넷 5+)
  if (rating === 2 && bb >= 5)
    return `볼넷 ${bb}개. 스스로 무너진 경기다. 제구가 이렇게 흔들리면 어떤 상대도 이기기 어렵다.`;

  // 12. 조기 강판 (rating 2 + 3이닝 미만)
  if (rating === 2 && ip < 3)
    return `${ipStr}이닝. 초반부터 흔들렸다. 경기 시작 전 루틴과 멘탈 관리를 다시 점검해봐라.`;

  // 13. 부진 (rating 2 일반)
  if (rating === 2)
    return "오늘은 기대에 미치지 못했다. 구위와 제구 모두 점검이 필요하다. 다음 경기 전에 반드시 원인을 찾아야 한다.";

  // 14. 대량실점 (rating 1 + 자책 5+)
  if (rating === 1 && er >= 5)
    return `자책점 ${er}점. 오늘은 빨리 잊어라. 하지만 왜 이렇게 됐는지는 반드시 분석해야 한다. 공식전에서 이러면 안 된다.`;

  // 15. 최악 (rating 1 fallback)
  return "구위도 제구도 모두 실망스러웠다. 지금 당장 뭐가 문제인지 스스로 찾아야 한다. 이 상태로 공식전은 안 된다.";
}

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
  const comment   = getCoachComment(ip, er, k, bb, rating, won);

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
