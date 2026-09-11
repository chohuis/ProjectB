/**
 * 시즌 안에서 **무슨 일이 몇 주차에 일어나는가** — 정본은 여기 하나다.
 *
 * 🔴 **2026-08-20까지 주차가 `advanceWeek.ts` 곳곳에 숫자로 박혀 있었다.**
 * `weekInYear === 43` 같은 줄이 열아홉 곳이었고, 캘린더를 바꾸면 전부
 * 어긋나는데 **오류가 안 난다** — 그냥 그 이벤트가 영영 안 일어난다.
 *
 * 값의 근거는 `docs/CALENDAR_V2.md`다. 리그 기간은 `leagueScheduler`가
 * 갖는다(`PRO_START_WEEK` 등) — 여기는 **이벤트**만 다룬다.
 *
 * ## 순서가 뜻을 갖는다
 *
 * 오프시즌은 앞뒤가 얽혀 있다. 하나만 옮기면 조용히 어긋난다:
 *
 * ```
 * W26 독립 진로허브 ─┐
 * W28 고교 진로허브 ─┼→ W30~31 드래프트 → W32 진로 결과 → W33 계약
 * W29 대학 진로허브 ─┘
 * W35 오프시즌 시작(구단 성향 갱신) → W39 NPC 은퇴·FA → W40~46 FA 재트리거
 * W46 체육부대 후보 공개 → W50 선발 결과·입대
 * ```
 */

// ── 시즌 중 ──────────────────────────────────────────────────

/** 프로 트레이드 데드라인 — 정규 후반(8월). 옛 W36 */
export const TRADE_DEADLINE_WEEK = 22;

// ── 진로허브 — **각 무대의 결승 직후다** ──────────────────────
//
// 옛 값: 고교 W44 · 대학 W42 · 독립 W39. 새 캘린더에서 각 무대가 끝나는
// 시점이 달라졌으므로 다시 계산했다:
//   고교 — 주말리그 W26 · 패왕기 W26~27 → 결승 직후 W28
//   대학 — 정규 W28 · 여명기 W25~28   → 결승 직후 W29
//   독립 — 3단계 W10~25              → 결승 직후 W26

export const HS_CAREER_HUB_WEEK = 28;
export const UNIV_CAREER_HUB_WEEK = 29;
export const INDIE_CAREER_HUB_WEEK = 26;

/** 독립리그 시즌 총평 — 3단계가 끝난 직후 */
export const INDIE_SEASON_REVIEW_WEEK = 26;

// ── 드래프트·진로 ────────────────────────────────────────────

/**
 * 🔴 **드래프트는 별도 주차 이벤트가 아니다.**
 *
 * `DRAFT_START_WEEK`·`DRAFT_END_WEEK`를 만들었다가 지웠다 — 코드를 따라가 보니
 * 드래프트가 **진로 결과와 같은 주(`CAREER_RESULT_WEEK`)에** 돈다
 * (`advanceWeek.ts`의 "배경 고교 졸업생 드래프트"). 상수를 남기면 아무도
 * 안 읽는 죽은 값이 된다.
 *
 * ⚠ 옛 주석이 "KBL 드래프트(W44~W46) 마감 후"라고 적고 있었는데 **그 주차에
 * 도는 코드가 없었다.** 주석이 거짓말이었던 셈이다.
 *
 * 별도 드래프트 주를 만들려면 그건 기능 추가다 — CALENDAR_V2에 남긴다.
 */

/** 진로 결과 발표 — 드래프트 마감 직후 전 무대 동시. 옛 W47 */
export const CAREER_RESULT_WEEK = 32;

// ── 오프시즌 ─────────────────────────────────────────────────

/** 오프시즌 시작 — 포스트시즌(W29~34)이 끝난 뒤. 구단 성향 갱신·시즌 총평. 옛 W40 */
export const OFFSEASON_START_WEEK = 35;

/** 스토브리그 시작 — NPC 은퇴·FA 결정 · 연봉협상 1차 · 트레이드 윈도우. 옛 W43 */
export const STOVE_LEAGUE_WEEK = 39;

/** FA 미계약자 매주 재트리거 구간. 옛 W44~49 */
export const FA_RETRY_START_WEEK = 40;
export const FA_RETRY_END_WEEK = 46;

// ── 병역 ─────────────────────────────────────────────────────

/** 체육부대 후보 30명 공개. 옛 W50 */
export const SPORTS_UNIT_CANDIDATES_WEEK = 46;

/**
 * 체육부대 선발 결과 · 입대 · 스카우트 능력 향상 · NPC 충성도 연간 감쇠.
 * 옛 W52.
 *
 * ⚠ **입대 주차의 기본값이기도 하다** — `enlistMilitary`·`militaryDecision`이
 * 이 값을 쓴다. 옛 코드는 `= 52`가 인자 기본값으로 박혀 있었다.
 */
export const MILITARY_RESULT_WEEK = 50;

/** 28세 입영 기간 만료 경고. 옛 W4(3월) — 병역 구간으로 옮겼다 */
export const MILITARY_AGE_WARNING_WEEK = 47;

// ── 주차 환산 ─────────────────────────────────────────────────

/** 한 시즌의 주 수. 롤오버가 `weekNum`을 리셋하지 않으므로 환산이 필요하다 */
export const WEEKS_PER_SEASON = 52;

/**
 * 누적 주차 → **시즌 안 주차** (1~52).
 *
 * 🔴 **같은 식이 네 곳에 따로 적혀 있었다** (2026-09-01 실측):
 * `advanceWeek.ts:282` · `:2193` · `weekPhases/injuryNews.ts:33` ·
 * `academicsEngine.ts:165`. 전부 `((w - 1) % 52) + 1`이다.
 *
 * ⚠ `weekNum`은 **누적이다.** 롤오버가 리셋하지 않는다 — CLAUDE.md의
 * 소식 id 규칙이 "weekNum은 시즌마다 1로 리셋된다"고 적었는데 그건
 * **환산한 뒤의 값**을 말한 것이다. 원본은 계속 오른다.
 */
export function weekInYearOf(weekNum: number): number {
  return ((weekNum - 1) % WEEKS_PER_SEASON) + 1;
}

// ── 투수 보직 — 묻는 주 ───────────────────────────────────────
//
// **각 리그의 시즌 시작 전 주**다 (PLAN_ROLE_RECOMMEND §4 · 확정 8).
// 리그마다 개막이 달라 한 값으로 못 쓴다 — 개막 뒤에 물으면 이미 옛 보직으로
// 몇 경기를 치른 뒤가 된다.
//
// ```
//   고교      개막 W7  (leagueScheduler.HS_START_WEEK)            → W1  ⚠ 아래
//   대학      개막 W5  (leagueScheduler.UNIV_REGULAR_START_WEEK)  → W4
//   독립      개막 W10 (leagueTeams.generated SURVIVAL_STAGES[0]) → W9
//   프로 1군  시범 W1  (leagueScheduler.PRESEASON_START_WEEK)     → W1
//   프로 2군  개막 W5  (시범경기는 1군 셋뿐이다)                   → W4
// ```
//
// ⚠ **프로 1군은 W1이다.** 시범경기가 W1~4에 팀당 12경기 있고 그 경기도 보직대로
// 던진다 — W4에 물으면 이미 12경기를 옛 보직으로 치른 뒤다.
//
// 🔴 **고교도 W1이다** (2026-09-07 · 사용자 확정). 「개막 전 주」 규칙대로면
//   W6이었는데, 새 게임을 시작하면 **W1에 자동으로 선발이 배정되고**
//   (`advanceWeek` W1 갈래 · `assignHighschoolPosition`) 다섯 주 뒤 W6에
//   「보직을 고르라」가 왔다. 사용자 말 그대로: 「시작하자마자 선발로
//   정해지고 W6에 변경 소식이 오는데, 처음 시작할 때 나오는 게 좋겠다.」
//
//   W1로 옮기면 자동 배정이 **아예 안 돈다** — `advanceWeek` 이 물음을 먼저
//   부르고, 그 물음이 세운 가드를 `hasRoleChoiceThisSeason` 이 보고 W1 갈래를
//   건너뛴다(프로 1군이 이미 그 길이다). 개막(W7)까지 여섯 주가 남으므로
//   「옛 보직으로 몇 경기를 치른 뒤」가 되지도 않는다.
//
// ⚠ 값이 개막 주 상수와 어긋나면 `roleAskWeek.test.ts` 가 깨진다. 캘린더를
// 바꾸면 여기도 같이 바꾼다 — 안 바꾸면 **오류 없이 그 시즌만 안 묻는다.**
export const ROLE_ASK_WEEK: Record<string, number> = {
  LEAGUE_HIGHSCHOOL: 1,
  LEAGUE_UNIVERSITY: 4,
  LEAGUE_INDEPENDENT: 9,
  LEAGUE_KBL: 1,
  LEAGUE_ABL: 1,
  LEAGUE_JBL: 1,
  LEAGUE_KBL_FARM: 4,
  LEAGUE_ABL_FARM: 4,
  LEAGUE_JBL_FARM: 4,
};

/** 표에 없는 리그 — 정규 개막(W5) 앞 주 */
export const ROLE_ASK_WEEK_DEFAULT = 4;

/** 그 리그에서 보직을 묻는 **시즌 안 주차** */
export function roleAskWeekOf(leagueId: string): number {
  return ROLE_ASK_WEEK[leagueId] ?? ROLE_ASK_WEEK_DEFAULT;
}
