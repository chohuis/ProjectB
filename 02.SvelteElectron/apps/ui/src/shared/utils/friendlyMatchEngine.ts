import type { ScheduleEntry } from "../types/season";
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
  // 친선경기(수요일)와 공식경기(토요일)는 날짜가 다르므로 상대팀의
  // 공식경기 유무로 busy 판단하지 않음. 주인공 팀만 제외.
  const candidates = leagueTeamIds.filter((t) => t !== myTeamId);
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
  const weeksInRange = rangeEnd - rangeStart + 1;

  // 이달 내 짝수 주차만 친선 배정 (격주)
  const evenWeeksInRange = [...Array(weeksInRange)]
    .map((_, i) => absoluteWeek + i)
    .filter(w => w % 2 === 0).length;

  const alreadyFriendly = schedule.filter(
    (e) => e.isFriendly && !e.id.startsWith("PRESN_") &&
           e.week >= absoluteWeek && e.week < absoluteWeek + weeksInRange,
  ).length;

  const needed = Math.max(0, evenWeeksInRange - alreadyFriendly);
  if (needed === 0) return { entries: [], monthLabel: label };

  const entries: ScheduleEntry[] = [];

  // 짝수 주차만 1경기 (수요일)
  for (let offset = 0; offset < weeksInRange && entries.length < needed; offset += 1) {
    const weekNum = absoluteWeek + offset;
    if (weekNum > seasonPhaseEnd) break;

    // 홀수 주 건너뜀 (격주 = 짝수 주만)
    if (weekNum % 2 !== 0) continue;

    // 이미 이 주에 친선경기가 있으면 건너뜀
    if (schedule.some((e) => e.isFriendly && e.week === weekNum)) continue;

    const opponent = findFreeOpponent(weekNum, myTeamId, schedule, leagueTeamIds);
    if (!opponent) continue;

    // 항상 수요일 (리그 월요일·금요일 경기 사이)
    const gameDate = friendlyDateForWeek(weekNum, seasonYear);

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

  const KO_DAYS = ["일", "월", "화", "수", "목", "금", "토"];
  const officialLines = officialEntries
    .filter((e) => !e.isFriendly)
    .map((e) => {
      const opp  = teamShort(e.awayTeamId === "PLY_HERO" ? e.homeTeamId : e.awayTeamId, teamMap);
      const date = e.gameDate.slice(5).replace("-", "/");
      const dow  = KO_DAYS[new Date(e.gameDate + "T00:00:00").getDay()] ?? "";
      return `  ${date} (${dow})  공식경기  vs ${opp}`;
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
export type PitcherRole = "SP" | "RP" | "CP";

export function ratePerformance(ip: number, er: number, role: PitcherRole = "SP"): 1 | 2 | 3 | 4 | 5 {
  if (role === "RP") {
    if (ip < 0.1) return 1;
    if (ip >= 2 && er === 0) return 5;    // 멀티이닝 완벽 홀드
    if (ip >= 1 && er === 0) return 5;    // 1이닝 무실점
    if (ip >= 1 && er <= 1) return 4;    // 1이닝 소폭 실점
    if (ip >= 0.2 && er === 0) return 4; // 부분 이닝 무실점
    if (ip >= 1 && er <= 2) return 3;
    if (ip >= 0.2 && er <= 1) return 3;
    if (er >= 3 || ip < 0.2) return 2;
    return 1;
  }
  if (role === "CP") {
    if (ip < 0.1) return 1;
    if (ip >= 1 && er === 0) return 5;   // 완벽 세이브
    if (ip >= 1 && er <= 1) return 4;   // 1이닝 소폭 실점
    if (ip >= 0.2 && er === 0) return 3; // 이닝 미완, 무실점
    if (er >= 2) return 2;               // 블론 세이브
    return 2;
  }
  // SP
  const era = ip > 0 ? (er / ip) * 9 : 99;
  if (ip < 1) return 1;
  if (era < 2.00) return 5;
  if (era < 3.50) return 4;
  if (era < 5.00) return 3;
  if (era < 7.00) return 2;
  return 1;
}

function getCoachComment(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean, role: PitcherRole = "SP"): string {
  if (role === "RP") return getCoachCommentRP(ip, er, k, bb, rating, won);
  if (role === "CP") return getCoachCommentCP(ip, er, k, bb, rating, won);
  return getCoachCommentSP(ip, er, k, bb, rating, won);
}

function getCoachCommentSP(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean): string {
  const ipStr = ip.toFixed(1);

  // 1. 무실점 완투급
  if (ip >= 6 && er === 0)
    return "오늘은 완벽에 가까운 피칭이었다. 이 컨디션을 공식전까지 유지한다면 에이스 자리는 의심할 여지가 없다.";

  // 2. 삼진 폭풍 + 승리 (rating 5 + K 8+ + 팀 승리)
  if (rating === 5 && k >= 8 && won)
    return `삼진 ${k}개에 팀 승리까지. 오늘이 이번 시즌 최고의 등판이 될 수도 있다. 이 공을 공식전에서 보여줘라.`;

  // 3. 삼진 폭풍 (rating 5 + K 8+)
  if (rating === 5 && k >= 8)
    return `삼진 ${k}개. 구위가 절정이다. 오늘 같은 공이면 어떤 타선도 막을 수 있다. 다음 공식전이 기대된다.`;

  // 4. 승리 선봉 (rating 5 + 팀 승리)
  if (rating === 5 && won)
    return "호투로 팀 승리를 이끌었다. 에이스란 이런 것이다. 이 투구 내용을 공식전에서도 보여줘라.";

  // 5. 최고 등판 (rating 5 일반)
  if (rating === 5)
    return "오늘 같은 구위면 다음 공식전 선발도 걱정 없다. 이 흐름을 절대 끊지 마라.";

  // 6. 이닝이터 (rating 4 + 5이닝 이상)
  if (rating === 4 && ip >= 5)
    return `${ipStr}이닝 소화. 긴 이닝을 버텨주는 투수가 팀에 얼마나 중요한지 잘 알 것이다. 좋은 등판이었다.`;

  // 7. 정교한 제구 (rating 4 + 볼넷 1 이하)
  if (rating === 4 && bb <= 1)
    return "볼넷이 거의 없는 깔끔한 등판이었다. 제구가 이렇게 안정되면 타자들이 힘들어한다.";

  // 8. 안정적 등판 (rating 4 일반)
  if (rating === 4)
    return "커맨드가 안정적이었다. 큰 실수 없이 경기를 소화했다. 이 흐름을 유지하면 된다.";

  // 8. 구위 있지만 제구 혼재 (rating 3 + 삼진 6+ + 볼넷 4+)
  if (rating === 3 && k >= 6 && bb >= 4)
    return `삼진 ${k}개로 구위는 느껴졌지만, 볼넷 ${bb}개가 발목을 잡았다. 공 자체는 좋다. 제구만 잡으면 레벨이 달라진다.`;

  // 9. 구위는 좋지만 (rating 3 + 삼진 6+)
  if (rating === 3 && k >= 6)
    return `삼진 ${k}개로 구위는 살아있다. 하지만 실점 장면이 아쉬웠다. 위기 상황 집중력을 더 키워야 한다.`;

  // 10. 제구 불안 (rating 3 + 볼넷 4+)
  if (rating === 3 && bb >= 4)
    return `볼넷 ${bb}개가 발목을 잡았다. 제구가 흔들리면 체력만 낭비된다. 다음 훈련에서 집중적으로 잡아야 한다.`;

  // 11. 평범한 등판 (rating 3 일반)
  if (rating === 3)
    return "무난한 등판이었다. 이 정도로는 공식전 경쟁에서 앞서기 어렵다. 핵심 구종 완성도를 높여야 한다.";

  // 12. 볼넷 자멸 (rating 2 + 볼넷 5+)
  if (rating === 2 && bb >= 5)
    return `볼넷 ${bb}개. 스스로 무너진 경기다. 제구가 이렇게 흔들리면 어떤 상대도 이기기 어렵다.`;

  // 13. 조기 강판 (rating 2 + 3이닝 미만)
  if (rating === 2 && ip < 3)
    return `${ipStr}이닝. 초반부터 흔들렸다. 경기 시작 전 루틴과 멘탈 관리를 다시 점검해봐라.`;

  // 14. 부진 (rating 2 일반)
  if (rating === 2)
    return "오늘은 기대에 미치지 못했다. 구위와 제구 모두 점검이 필요하다. 다음 경기 전에 반드시 원인을 찾아야 한다.";

  // 15. 대량실점 (rating 1 + 자책 5+)
  if (rating === 1 && er >= 5)
    return `자책점 ${er}점. 오늘은 빨리 잊어라. 하지만 왜 이렇게 됐는지는 반드시 분석해야 한다. 공식전에서 이러면 안 된다.`;

  // 16. 최악 (rating 1 fallback)
  return "구위도 제구도 모두 실망스러웠다. 지금 당장 뭐가 문제인지 스스로 찾아야 한다. 이 상태로 공식전은 안 된다.";
}

function getCoachCommentRP(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean): string {
  const ipStr = ip.toFixed(1);

  // [1] 멀티이닝 완벽 홀드
  if (rating === 5 && ip >= 2 && er === 0)
    return `${ipStr}이닝 무실점. 멀티이닝을 막아낸 중계 투수는 팀의 핵심이다. 오늘 같은 등판이 공식전에서도 나와야 한다.`;

  // [2] 홀드 성공 + 팀 승리
  if (rating === 5 && won)
    return "홀드 성공에 팀 승리까지. 네가 그 이닝을 막지 않았다면 경기가 달라졌을 수도 있다. 중계 투수의 진짜 가치를 보여줬다.";

  // [3] 완벽 홀드 fallback
  if (rating === 5)
    return "완벽한 홀드였다. 앞 투수가 만든 흐름을 끊지 않고 이어줬다. 이 안정감을 공식전에서도 유지해라.";

  // [4] 1이닝 소화 안정
  if (rating === 4 && ip >= 1)
    return `${ipStr}이닝 소화. 짧지만 자기 역할을 다했다. 팀이 믿고 맡길 수 있는 투수다.`;

  // [5] 볼넷 없는 깔끔한 등판
  if (rating === 4 && bb === 0)
    return "볼넷 없이 깔끔하게 막았다. 이런 제구가 중계 투수에게 가장 중요한 덕목이다.";

  // [6] rating 4 fallback
  if (rating === 4)
    return "안정적인 홀드였다. 크게 흔들리지 않았다. 이 꾸준함이 팀에 힘이 된다.";

  // [7] 짧은 이닝 볼넷 경고
  if (rating === 3 && bb >= 2)
    return `볼넷 ${bb}개. 짧은 이닝에서 볼넷이 많으면 위험하다. 제구부터 잡아야 신뢰를 얻을 수 있다.`;

  // [8] rating 3 fallback
  if (rating === 3)
    return "아쉬운 등판이었다. 맡은 이닝을 깔끔하게 처리하지 못했다. 집중력을 높여야 한다.";

  // [9] 불 끄기 실패
  if (rating === 2 && er >= 2)
    return `자책 ${er}점. 불을 껐어야 할 상황에서 오히려 불을 키웠다. 위기 상황 멘탈을 다시 다잡아야 한다.`;

  // [10] rating 2/1 fallback
  return "오늘은 역할을 다하지 못했다. 중계 투수에게 실점은 팀 전체에 영향을 준다. 더 단단해져야 한다.";
}

function getCoachCommentCP(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean): string {
  const ipStr = ip.toFixed(1);

  // [1] 삼진 세이브
  if (rating === 5 && k >= 2)
    return `삼진 ${k}개로 마무리. 오늘 같은 공이면 어떤 타선의 클린업도 막을 수 있다. 공식전 마무리 자리가 네 것이다.`;

  // [2] 완벽 세이브 + 팀 승리
  if (rating === 5 && won)
    return "완벽한 세이브. 마지막 아웃까지 구위가 살아있었다. 이 신뢰감을 팀 전체가 기대하고 있다.";

  // [3] rating 5 fallback
  if (rating === 5)
    return "완벽하게 막았다. 마무리라는 자리가 얼마나 중요한지 알고 있다면 이 수준을 유지해라.";

  // [4] 세이브 성공, 약간 흔들림
  if (rating === 4 && ip >= 1)
    return "약간 흔들렸지만 마무리를 지었다. 세이브가 쉽지 않다는 걸 다시 느꼈을 것이다. 더 단단해져라.";

  // [5] rating 4 fallback
  if (rating === 4)
    return "무난하게 마무리했다. 하지만 마무리 자리는 무난함만으로는 부족하다. 더 압도적으로 던져야 한다.";

  // [6] 이닝 미완성 무실점
  if (rating === 3 && ip >= 0.2 && er === 0)
    return `${ipStr}이닝. 이닝은 채우지 못했지만 실점은 없었다. 다음에는 반드시 3아웃을 채워라.`;

  // [7] rating 3 fallback
  if (rating === 3)
    return "간신히 버텼다. 오늘은 운이 따라준 부분이 있다. 이 불안한 상태로는 공식전이 걱정된다.";

  // [8] 블론 세이브
  if (rating === 2 && er >= 2)
    return `자책 ${er}점. 세이브 기회를 날렸다. 마무리가 무너지면 팀 전체가 흔들린다. 정신 차려라.`;

  // [9] 아웃 하나도 못 잡음
  if (ip < 0.2)
    return "아웃 하나 제대로 잡지 못했다. 마무리 자리를 지키고 싶다면 지금보다 훨씬 강해져야 한다.";

  // [10] rating 1/2 fallback
  return "최악의 등판이었다. 마무리가 이러면 팀이 무너진다. 지금 당장 구위와 멘탈을 점검해라.";
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
  role: PitcherRole = "SP",
): { message: MessageItem } {
  const myScore   = homeScore;
  const oppScore  = awayScore;
  const oppTeamId = scheduleEntry.awayTeamId;
  const oppName   = teamShort(oppTeamId, teamMap);
  const won       = myScore > oppScore;
  const resultStr = won ? "승" : myScore === oppScore ? "무" : "패";
  const era       = ip > 0 ? Math.round((er / ip) * 9 * 100) / 100 : 99;
  const rating    = ratePerformance(ip, er, role);
  const stars     = "★".repeat(rating) + "☆".repeat(5 - rating);
  const comment   = getCoachComment(ip, er, k, bb, rating, won, role);

  const body = [
    `친선경기  vs ${oppName}`,
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
  };
}

// ── 공식경기 코치 평가 ────────────────────────────────────────
function getOfficialCoachComment(
  ip: number,
  er: number,
  k: number,
  bb: number,
  rating: 1 | 2 | 3 | 4 | 5,
  won: boolean,
  role: PitcherRole = "SP",
): string {
  if (role === "RP") return getOfficialCoachCommentRP(ip, er, k, bb, rating, won);
  if (role === "CP") return getOfficialCoachCommentCP(ip, er, k, bb, rating, won);
  return getOfficialCoachCommentSP(ip, er, k, bb, rating, won);
}

function getOfficialCoachCommentSP(
  ip: number,
  er: number,
  k: number,
  bb: number,
  rating: 1 | 2 | 3 | 4 | 5,
  won: boolean,
): string {
  const ipStr = ip.toFixed(1);

  // ── rating 5 블록 ──────────────────────────────────────────

  // [1] 완봉
  if (ip >= 9 && er === 0)
    return "완봉. 9이닝을 혼자 막아냈다. 이런 경기가 에이스를 만든다. 오늘은 팀 전체가 너를 믿고 이겼다.";

  // [2] 완투급 무실점
  if (ip >= 7 && er === 0)
    return `${ipStr}이닝 무실점. 불펜을 아끼고 팀에 숨통을 틔워줬다. 이 수준이 유지된다면 로테이션 첫 번째 자리는 네 것이다.`;

  // [3] 삼진 폭풍 + 승리
  if (rating === 5 && k >= 10 && won)
    return `삼진 ${k}개에 팀 승리. 완벽한 날이었다. 오늘 경기는 팬들 기억에 오래 남을 것이다.`;

  // [4] 삼진 폭풍
  if (rating === 5 && k >= 10)
    return `삼진 ${k}개. 구위가 정점에 올라와 있다. 승패와 관계없이 오늘 네 공은 달랐다. 다음 등판도 이 상태를 가져가라.`;

  // [5] 에이스 승리
  if (rating === 5 && won)
    return "호투에 승리까지. 에이스가 해야 할 일을 다 했다. 이 기세를 시즌 끝까지 유지해라.";

  // [6] rating 5 fallback
  if (rating === 5)
    return "오늘 구위는 만족스러웠다. 승리를 못 챙긴 게 아쉽지만 이 내용이면 다음 선발도 문제없다. 결과는 따라온다.";

  // ── rating 4 블록 ──────────────────────────────────────────

  // [7] QS + 승리
  if (rating === 4 && ip >= 6 && won)
    return `${ipStr}이닝 소화에 팀 승리. 퀄리티 스타트를 완성했다. 선발 투수가 이렇게 버텨주면 팀이 살아난다.`;

  // [8] QS
  if (rating === 4 && ip >= 6)
    return `${ipStr}이닝 소화했다. 결과는 아쉽지만 내용은 나쁘지 않았다. 이 이닝 소화 능력을 유지하면 결국 결과도 따라온다.`;

  // [9] 정교한 제구
  if (rating === 4 && bb <= 1)
    return "볼넷 하나 이하. 스트라이크존을 완벽하게 지배했다. 이런 제구가 나올 때 팀의 수비도 살아난다.";

  // [10] rating 4 fallback
  if (rating === 4)
    return "큰 실수 없이 소화했다. 에이스 경기는 아니었지만 팀이 기댈 수 있는 등판이었다. 위기 상황 집중력을 한 단계 더 올려야 한다.";

  // ── rating 3 블록 ──────────────────────────────────────────

  // [11] 구위 ↑ 제구 ↓ 혼재
  if (rating === 3 && k >= 6 && bb >= 4)
    return `삼진 ${k}개짜리 공이 있는데 볼넷 ${bb}개로 흘렸다. 구위를 살리면서 제구까지 잡는 게 다음 과제다. 반반 경기였다.`;

  // [12] 구위는 살았지만 실점
  if (rating === 3 && k >= 6)
    return `삼진 ${k}개. 구위는 분명히 있다. 하지만 공식전에서는 한 번의 실수가 승패를 가른다. 위기 상황에서의 집중력이 문제다.`;

  // [13] 제구 불안
  if (rating === 3 && bb >= 4)
    return `볼넷 ${bb}개. 스스로 위기를 만들었다. 배터리와 사인 체계를 다시 점검해라. 이대로는 선발 자리를 유지하기 어렵다.`;

  // [14] 내용 아쉽지만 승리
  if (rating === 3 && won)
    return "이기긴 했지만 내용이 아쉬웠다. 승리가 모든 걸 덮어주진 않는다. 다음에도 이런 내용이면 선발 순번을 보장하기 어렵다.";

  // [15] rating 3 fallback
  if (rating === 3)
    return "중간 이상은 했다. 하지만 리그를 지배하려면 이 정도로는 부족하다. 결정적 순간에 흔들리는 걸 반드시 고쳐야 한다.";

  // ── rating 2 블록 ──────────────────────────────────────────

  // [16] 볼넷 자멸
  if (rating === 2 && bb >= 5)
    return `볼넷 ${bb}개. 타자와 싸우기 전에 스스로 무너졌다. 이 경기는 빠르게 잊고 제구 훈련에만 집중해라.`;

  // [17] 조기 강판
  if (rating === 2 && ip < 3)
    return `${ipStr}이닝. 경기를 시작도 못 했다. 불펜이 네 몫까지 다 떠안았다. 지금 상태로는 선발 로테이션 유지가 위태롭다.`;

  // [18] 부진 + 패배
  if (rating === 2 && !won)
    return "부진에 패배까지. 오늘은 네가 경기를 망쳤다. 비난을 피하지 말고 정면으로 받아들여라. 그래야 다음에 더 강해질 수 있다.";

  // [19] rating 2 fallback
  if (rating === 2)
    return "오늘 경기는 실망스러웠다. 구위도 제구도 기대 이하였다. 선발 자리가 흔들릴 수 있다는 걸 명심해라.";

  // ── rating 1 블록 ──────────────────────────────────────────

  // [20] 대량실점
  if (rating === 1 && er >= 5)
    return `자책점 ${er}점. 지금 당장 무엇이 문제인지 전력분석 팀과 앉아서 분석해야 한다. 이 상태가 반복되면 다음 선발은 장담 못 한다.`;

  // [21] rating 1 fallback
  return "최악의 등판이었다. 구위도 제구도 멘탈도 모두 흔들렸다. 오늘 경기 영상을 반드시 다시 봐라. 이대로면 2군 이야기가 나올 수밖에 없다.";
}

function getOfficialCoachCommentRP(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean): string {
  const ipStr = ip.toFixed(1);

  // [1] 멀티이닝 완벽 홀드
  if (rating === 5 && ip >= 2 && er === 0)
    return `${ipStr}이닝 무실점. 멀티이닝을 막아낸 중계 투수는 팀의 승패를 바꾼다. 공식전 불펜의 핵심으로 자리잡아라.`;

  // [2] 홀드 성공 + 팀 승리
  if (rating === 5 && won)
    return "홀드 성공에 팀 승리. 네가 그 이닝을 막지 않았다면 경기가 달라졌을 수도 있다. 이 가치를 스스로 알아야 한다.";

  // [3] rating 5 fallback
  if (rating === 5)
    return "완벽한 홀드였다. 선발이 만든 흐름을 끊지 않고 마무리에게 넘겼다. 공식전 불펜에서 없어서는 안 될 존재다.";

  // [4] 1이닝 소화 안정
  if (rating === 4 && ip >= 1)
    return `${ipStr}이닝 소화. 짧은 시간에 자기 역할을 다했다. 팀이 믿고 맡길 수 있는 중계 투수다.`;

  // [5] 볼넷 없는 깔끔한 등판
  if (rating === 4 && bb === 0)
    return "볼넷 없는 깔끔한 등판. 스트라이크존을 장악하는 중계 투수는 공식전에서 팀의 중심이 된다.";

  // [6] rating 4 fallback
  if (rating === 4)
    return "안정적으로 맡은 이닝을 처리했다. 공식전에서 이 꾸준함이 쌓이면 팀의 신뢰를 얻을 수 있다.";

  // [7] 짧은 이닝 볼넷 경고
  if (rating === 3 && bb >= 2)
    return `볼넷 ${bb}개. 짧은 이닝에서 볼넷이 많으면 불펜 부담이 커진다. 제구가 안 되면 공식전에서 중요한 상황에 쓸 수가 없다.`;

  // [8] rating 3 fallback
  if (rating === 3)
    return "아쉬운 등판이었다. 맡은 이닝을 깔끔하게 처리하지 못했다. 이 상태로는 중요한 상황에 올리기 어렵다.";

  // [9] 불 끄기 실패
  if (rating === 2 && er >= 2)
    return `자책 ${er}점. 팀이 지키던 리드를 날렸다. 불펜 투수가 이러면 선발이 고생한 보람이 없어진다. 반드시 원인을 찾아라.`;

  // [10] rating 2/1 fallback
  return "역할을 다하지 못했다. 공식전에서 이 내용이 반복되면 로스터에서 밀려날 수 있다. 각오하고 준비해라.";
}

function getOfficialCoachCommentCP(ip: number, er: number, k: number, bb: number, rating: 1 | 2 | 3 | 4 | 5, won: boolean): string {
  const ipStr = ip.toFixed(1);

  // [1] 삼진 세이브
  if (rating === 5 && k >= 2)
    return `삼진 ${k}개로 마무리. 팬들이 기억할 세이브였다. 마무리의 무게를 오늘처럼 짊어져라.`;

  // [2] 완벽 세이브 + 팀 승리
  if (rating === 5 && won)
    return "완벽한 세이브. 이 팀의 마무리는 네가 맡아야 한다. 오늘 같은 피칭을 시즌 내내 보여줘라.";

  // [3] rating 5 fallback
  if (rating === 5)
    return "완벽하게 닫았다. 마지막 아웃이 이렇게 믿음직스러우면 팀 전체가 자신감을 갖고 뛸 수 있다.";

  // [4] 세이브 성공, 소폭 흔들림
  if (rating === 4 && ip >= 1)
    return "약간 흔들렸지만 세이브를 지켜냈다. 공식전에서 이 정도면 합격이다. 더 안정적으로 만들어가야 한다.";

  // [5] rating 4 fallback
  if (rating === 4)
    return "무난하게 마무리했다. 하지만 마무리 자리는 무난함만으로는 부족하다. 더 압도적으로 던질 수 있어야 한다.";

  // [6] 이닝 미완성 무실점
  if (rating === 3 && ip >= 0.2 && er === 0)
    return `${ipStr}이닝. 이닝은 완수하지 못했지만 실점은 없었다. 다음에는 3아웃을 채우는 것에 집중해라.`;

  // [7] rating 3 fallback
  if (rating === 3)
    return "간신히 버텼다. 마무리가 이렇게 불안하면 팀 전체가 흔들린다. 지금 상태를 냉정하게 봐야 한다.";

  // [8] 블론 세이브
  if (rating === 2 && er >= 2)
    return `자책 ${er}점. 블론 세이브. 마무리에게 이 결과는 최악이다. 이 실패를 반드시 교훈으로 삼아야 한다.`;

  // [9] 아웃 하나도 못 잡음
  if (ip < 0.2)
    return "마운드에 올라 제 역할을 하지 못했다. 마무리 자리가 흔들리면 팀 전체가 불안해진다. 각오하고 다음을 준비해라.";

  // [10] rating 1 fallback
  return "최악의 등판이었다. 마무리가 이러면 팀이 무너진다. 이 상태가 계속되면 다른 선택지를 찾아야 할 수도 있다.";
}

export function buildOfficialResultMessage(
  scheduleEntry: ScheduleEntry,
  homeScore: number,
  awayScore: number,
  ip: number,
  er: number,
  k: number,
  bb: number,
  h: number,
  pitchCount: number,
  won: boolean,
  isDraw: boolean,
  teamMap?: Map<string, string>,
  role: PitcherRole = "SP",
): MessageItem {
  const isProtHome = scheduleEntry.homeTeamId !== scheduleEntry.awayTeamId;
  const myScore    = isProtHome ? homeScore : awayScore;
  const oppScore   = isProtHome ? awayScore : homeScore;
  const oppTeamId  = scheduleEntry.awayTeamId;
  const oppName    = teamShort(oppTeamId, teamMap);
  const resultStr  = won ? "승" : isDraw ? "무" : "패";
  const era        = ip > 0 ? Math.round((er / ip) * 9 * 100) / 100 : 99;
  const rating     = ratePerformance(ip, er, role);
  const stars      = "★".repeat(rating) + "☆".repeat(5 - rating);
  const comment    = getOfficialCoachComment(ip, er, k, bb, rating, won, role);

  const body = [
    `공식경기  vs ${oppName}`,
    `결과: ${myScore} : ${oppScore} (${resultStr})`,
    "",
    "▶ 내 기록",
    `  ${ip.toFixed(1)}이닝 / 피안타 ${h} / 자책(추정) ${er} / 삼진 ${k} / 볼넷 ${bb} / 투구수 ${pitchCount}구`,
    "",
    `코치 평가: ${stars}`,
    `"${comment}"`,
  ].join("\n");

  return {
    id:        `msg-official-result-w${scheduleEntry.week}-${Date.now()}`,
    category:  "manager",
    sender:    "감독",
    subject:   `공식경기 결과 — vs ${oppName} (${resultStr} ${myScore}:${oppScore})`,
    preview:   `${ip.toFixed(1)}IP ${k}K ERA ${era.toFixed(2)} — ${stars}`,
    body,
    createdAt: `W${scheduleEntry.week}`,
    readAt:    null,
  };
}
