/**
 * 투구 결과 — 문구·색·분류의 **단일 정본**.
 *
 * ⚠ 예전엔 같은 표가 네 군데에 따로 있었다: 엔진 `get_result_comment`,
 * 화면 `showResultOverlay`, 화면 `localComment`, Electron `AUTO_SIM_AB_LABEL`.
 * 그래서 **자동 시뮬은 "삼진"이라 하고 직접 던지면 "헛스윙 스트라이크"**가
 * 나오는 식으로 어긋나 있었다. 화면 쪽은 여기 하나로 모은다.
 *
 * ⚠ 인플레이 아웃은 `INPLAY_OUT` 하나였다가 넷으로 쪼개졌다. 엔진이
 * 타구 종류(`BallHitType`)를 처음부터 정해 놓고도 **결과 코드가 하나뿐이라
 * 화면까지 못 갔다.** 코드를 늘릴 때 빠뜨리는 자리가 생기지 않도록
 * 분류는 전부 이 파일의 집합으로 판정한다.
 */

export type PitchResultCode =
  | "STRIKE_SWING" | "STRIKE_LOOK" | "BALL" | "FOUL"
  // 삼진 — **타자가 물러났다.** 스트라이크 하나(`STRIKE_*`)와 다른 일이다.
  // 🔴 예전엔 이게 없어서 3스트라이크째에도 "루킹"이라고만 떴다.
  | "STRIKEOUT_SWING" | "STRIKEOUT_LOOK"
  | "INPLAY_OUT" | "GROUND_OUT" | "FLY_OUT" | "LINE_OUT" | "DOUBLE_PLAY" | "TRIPLE_PLAY"
  | "FIELDING_ERROR"
  | "HIT_SINGLE" | "HIT_DOUBLE" | "HIT_TRIPLE" | "HOME_RUN"
  | "WALK"
  // 사구·희생번트·희생플라이 (2026-08-28). **셋 다 타수가 아니다** —
  // 기록에서 볼넷·아웃과 다르게 잡힌다
  | "HIT_BY_PITCH" | "SAC_BUNT" | "SAC_FLY"
  | "GAME_OVER";

export type BallHitType = "groundBall" | "flyBall" | "lineDrive" | "popup" | "bunt";

export interface BallInPlay {
  hitType: BallHitType;
  zone: string;
  hardness: number;
}

/**
 * 인플레이 아웃 계열. `INPLAY_OUT`은 엔진의 중간값이라 정상 흐름에서는 안 오지만,
 * 옛 세이브나 로컬 폴백이 낼 수 있어 남겨 둔다.
 */
const OUT_IN_PLAY = new Set<PitchResultCode>([
  "INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY", "TRIPLE_PLAY",
]);

const HITS = new Set<PitchResultCode>([
  "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN",
]);

/**
 * 스트라이크로 세는 것 — **삼진도 스트라이크다.**
 *
 * ⚠ 3스트라이크째는 `STRIKEOUT_*`으로 좁혀지므로, 여기 안 넣으면
 *   **마지막 스트라이크가 카운트에서 빠진다.** 인플레이 아웃을 넷으로
 *   쪼갤 때 `INPLAY_OUT`을 집합에 남겨 둔 것과 같은 이유다.
 */
const STRIKES = new Set<PitchResultCode>([
  "STRIKE_SWING", "STRIKE_LOOK", "STRIKEOUT_SWING", "STRIKEOUT_LOOK",
]);

/** 삼진인가 — 타자가 물러났다 */
const STRIKEOUTS = new Set<PitchResultCode>(["STRIKEOUT_SWING", "STRIKEOUT_LOOK"]);

export const isOutInPlay = (c: PitchResultCode): boolean => OUT_IN_PLAY.has(c);
export const isHit       = (c: PitchResultCode): boolean => HITS.has(c);
export const isStrike    = (c: PitchResultCode): boolean => STRIKES.has(c);
export const isStrikeout = (c: PitchResultCode): boolean => STRIKEOUTS.has(c);

/** 타석이 끝났나 — 다음 타자로 넘어가는 결과 */
export function isAtBatOver(c: PitchResultCode): boolean {
  // ⚠ 사구·희생타도 **타석이 끝난다.** 빠뜨리면 다음 타자로 안 넘어간다
  return isOutInPlay(c) || isHit(c) || c === "WALK" || c === "FIELDING_ERROR"
      || c === "HIT_BY_PITCH" || c === "SAC_BUNT" || c === "SAC_FLY";
}

/** 수비 위치 → 사람이 부르는 이름 */
const POSITION_LABEL: Record<string, string> = {
  P: "투수", C: "포수", "1B": "1루수", "2B": "2루수", "3B": "3루수",
  SS: "유격수", LF: "좌익수", CF: "중견수", RF: "우익수",
};

const HIT_TYPE_LABEL: Record<BallHitType, string> = {
  groundBall: "땅볼", flyBall: "뜬공", lineDrive: "직선타",
  popup: "뜬공", bunt: "번트",
};

/** 큰 글자용 — 1.4초 스쳐 지나가므로 짧게 */
const FLASH_LABEL: Record<PitchResultCode, string> = {
  STRIKE_SWING: "헛스윙", STRIKE_LOOK: "루킹", BALL: "볼", FOUL: "파울",
  STRIKEOUT_SWING: "삼진 아웃", STRIKEOUT_LOOK: "삼진 아웃",
  INPLAY_OUT: "아웃", GROUND_OUT: "땅볼 아웃", FLY_OUT: "뜬공 아웃",
  LINE_OUT: "직선타 아웃", DOUBLE_PLAY: "병살!", TRIPLE_PLAY: "삼중살!!",
  FIELDING_ERROR: "실책", WALK: "볼넷",
  HIT_BY_PITCH: "몸에 맞는 공", SAC_BUNT: "희생번트", SAC_FLY: "희생플라이",
  HIT_SINGLE: "안타", HIT_DOUBLE: "2루타", HIT_TRIPLE: "3루타", HOME_RUN: "홈런",
  GAME_OVER: "경기 종료",
};

export function flashLabel(code: PitchResultCode): string {
  return FLASH_LABEL[code] ?? code;
}

/**
 * 로그 한 줄용. 타구 정보가 있으면 **누구 앞으로 갔는지까지** 쓴다.
 *
 * ⚠ 없는 정보를 지어내지 않는다 — `ballInPlay`가 없으면 기본 문구 그대로다.
 */
export function logLabel(code: PitchResultCode, ball?: BallInPlay | null): string {
  // ⚠ **삼중살은 병살과 같은 문구 규칙을 쓴다** — 다만 아웃이 셋이라
  //   따로 적는다. 실제 KBO 는 시즌 0~2건이라 로그에 뜨면 사건이다.
  if (code === "TRIPLE_PLAY") {
    const who = ball ? POSITION_LABEL[ball.zone] : null;
    return who ? `${who} 삼중살!!` : "삼중살!!";
  }
  if (code === "DOUBLE_PLAY") {
    const who = ball ? POSITION_LABEL[ball.zone] : null;
    // ⚠ **"병살타"는 땅볼에만 쓰는 말이다.** 엔진은 직선타에서도 병살을 내는데
    // (잡아서 주자를 묶는 경우) 그때 "중견수 병살타"라고 쓰면 틀린 야구 용어가 된다.
    if (ball?.hitType === "lineDrive") return who ? `${who} 직선타 병살` : "직선타 병살";
    return who ? `${who} 병살타` : "병살타";
  }
  if (isOutInPlay(code) && ball) {
    const who = POSITION_LABEL[ball.zone];
    const kind = HIT_TYPE_LABEL[ball.hitType];
    if (who && kind) return `${who} ${kind} 아웃`;
  }
  if (isHit(code) && ball) {
    const who = POSITION_LABEL[ball.zone];
    if (who && code === "HIT_SINGLE") return `${who} 앞 안타`;
  }
  return FLASH_LABEL[code] ?? code;
}

/** 경기 내용 패널의 색 클래스 */
export function logClass(code: PitchResultCode): string {
  if (code === "HOME_RUN") return "log-homerun";
  if (isHit(code)) return "log-hit";
  if (code === "WALK") return "log-walk";
  // 병살은 삼진보다 더 좋은 일이다 — 아웃 색이 아니라 제 색을 준다
  if (code === "DOUBLE_PLAY" || code === "TRIPLE_PLAY") return "log-dp";
  if (isStrike(code)) return "log-strike";
  if (code === "FOUL") return "log-foul";
  if (code === "BALL") return "log-ball";
  if (isOutInPlay(code) || code === "FIELDING_ERROR") return "log-out";
  return "";
}

/** 큰 글자 색 */
export function flashColor(code: PitchResultCode): string {
  if (code === "HOME_RUN") return "#ff4a4a";
  if (code === "HIT_TRIPLE") return "#ff9800";
  if (isHit(code)) return "#ffd54f";
  if (code === "DOUBLE_PLAY") return "#6ee7a8";
  if (isStrike(code)) return "#37d67a";
  if (code === "FIELDING_ERROR") return "#ff4a4a";
  if (isOutInPlay(code)) return "#ff8c42";
  if (code === "FOUL") return "#ffd54f";
  return "#7a8fa8";
}
