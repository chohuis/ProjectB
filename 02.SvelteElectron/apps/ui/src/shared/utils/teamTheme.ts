// ── 팀 컬러 → 디자인 토큰 ────────────────────────────────────────
//
// 유니폼 안의 핵심은 **소속팀이 바뀌면 화면 색이 바뀐다**는 것이다.
// 그게 공짜로 얻어지려면 색이 한 곳에서만 계산돼야 한다 — 여기다.
//
// ⚠ **팀 주색을 헤더에 그대로 쓰면 안 된다.** 실측: 238팀 주색의 명도가
// L* 13~83이고 **130팀(55%)이 L* > 45**다. 광주 팬서스(#F49530)는 L*=70이라
// 흰 글씨가 죽는다. 그래서 헤더용은 항상 어둡게 보정한 값을 쓴다.
//
// 보조색은 `refs.json`에 데이터로 있다(국내 182팀 추가 완료). 흰 글씨 대비
// 4.5:1과 주색 대비 색상차 60°를 통과한 값이므로 CTA에 그대로 쓴다.
// 검사: `npm run check:teamcolors`

/** 팀 색에서 파생한 화면 토큰 */
export interface TeamTokens {
  /** 헤더·사이드바·표 머리선·강조 행 — 항상 어둡다 */
  dark: string;
  /** 주 행동 버튼·경고·타임라인 점 — 흰 글씨가 얹힌다 */
  accent: string;
  /** 어두운 바탕 위의 강조(내 이름·점수) — 밝다 */
  gold: string;
  /** 핀스트라이프 — 주색의 옅은 투명도 */
  stripe: string;
  /**
   * 면을 옅게 칠할 때 — 레이더 차트 안쪽, 그래프 영역, 선택 구간.
   *
   * 스트라이프(0.055)는 **줄무늬로 쓰려고 만든 세기**라 면으로 칠하면
   * 거의 안 보인다. 면은 형태가 읽혀야 하므로 따로 둔다.
   */
  wash: string;
}

/**
 * 헤더 면의 명도. 지면 톤에 따라 다르다.
 *
 * - **밝은 지면**: 26. 이보다 밝으면 흰 글씨 대비가 4.5:1 아래로 떨어진다…가
 *   아니라, 실제로는 46까지도 4.73:1로 버틴다. 26은 밝은 지면(L*97)과의
 *   **분리**를 크게 잡으려고 고른 값이다.
 * - **어두운 지면**: 32. 26을 그대로 쓰면 어두운 패널(L*10)과 분리가
 *   1.55:1까지 떨어져 헤더의 존재감이 사라진다. 32면 1.95:1이고
 *   흰 글씨도 7.10:1로 남는다.
 *
 *   ⚠ 처음엔 40으로 잡았다 — 분리 수치(2.66:1)만 보고 고른 값이라
 *   **채도가 주는 인상을 놓쳤다.** 실제로 띄워 보니 헤더가 화면을 잡아먹었다.
 *   대비는 통과해도 눈에 세면 안 되고, 그건 숫자만으로는 안 보인다.
 *
 * ⚠ 두 값 다 **238팀 전수 실측**으로 정했다 (`npm run check:teamcolors`).
 * 표본으로 고르면 몇 팀이 조용히 미달로 남는다 — 이 프로젝트에서 반복된 결함이다.
 */
const HEADER_L = { light: 26, dark: 32 } as const;
export type ThemeTone = keyof typeof HEADER_L;
/** 어두운 바탕 위 강조가 확보해야 할 최소 명도 */
const GOLD_MIN_L = 72;
const STRIPE_ALPHA = 0.055;
const WASH_ALPHA = 0.16;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function parse(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.substr(i, 2), 16) / 255) as [number, number, number];
}
function toHex(rgb: [number, number, number]): string {
  return "#" + rgb.map((c) => Math.round(clamp01(c) * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** CIE L* (0~100) */
export function lightness(hex: string): number {
  const y = luminance(parse(hex));
  return y <= 0.008856 ? y * 903.3 : 116 * Math.pow(y, 1 / 3) - 16;
}
/** 흰 글씨와의 대비비 */
export function contrastOnWhiteText(hex: string): number {
  return 1.05 / (luminance(parse(hex)) + 0.05);
}

/** 두 색의 대비비. 골드가 헤더 위에서 읽히는지는 이걸로 판정한다 */
export function contrast(a: string, b: string): number {
  const la = luminance(parse(a)), lb = luminance(parse(b));
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * 색상은 유지한 채 명도만 목표치로 옮긴다.
 *
 * 선형 RGB에서 균일 배율을 쓰면 색상·채도가 거의 안 흔들린다 —
 * HSL로 하면 노랑 계열이 탁해진다(광주 팬서스에서 확인).
 */
function toLightness(hex: string, targetL: number): string {
  const rgb = parse(hex);
  const cur = lightness(hex);
  if (Math.abs(cur - targetL) < 0.5) return hex.toUpperCase();

  // 목표 L*을 상대휘도로 되돌린다
  const targetY = targetL > 8
    ? Math.pow((targetL + 16) / 116, 3)
    : targetL / 903.3;
  const curY = luminance(rgb);
  if (curY <= 0) {
    // 완전한 검정은 배율로 못 올린다 — 회색으로 올린다
    const g = toSrgb(targetY);
    return toHex([g, g, g]);
  }
  const k = targetY / curY;
  const lin = rgb.map(toLin).map((c) => clamp01(c * k)) as [number, number, number];
  const scaled = lin.map(toSrgb) as [number, number, number];

  // ⚠ **배율만으로는 목표에 못 닿는 색이 있다.** 채도 높은 빨강·분홍은
  // 채널이 1.0에 붙어 더 안 밝아진다 — 실측에서 11팀이 L* 57~60에서 멈췄고,
  // 그 값은 어두운 헤더(L*26) 위에서 대비 3.2:1이라 안 읽힌다.
  //
  // ⚠ **회색이 아니라 흰색과 섞는다.** 회색과 섞으면 명도는 맞는데 색조가
  // 죽는다 — 실측에서 부산(남색)·대전(주황)·서울 로열스가 전부 `#B0B0B0`
  // 같은 무채색이 됐다. 하이라이트에서 팀 색이 사라지면 이 안의 의미가 없다.
  // 흰색과 섞으면 색조가 유지된 밝은 톤(틴트)이 된다.
  //
  // 한 번의 근사가 아니라 **목표에 닿을 때까지** 이분한다 — 고정 비율로 하면
  // 색마다 부족분이 달라 어떤 팀은 여전히 미달이다.
  const at = (mix: number): [number, number, number] =>
    scaled.map((c) => c * (1 - mix) + 1 * mix) as [number, number, number];

  if (lightness(toHex(scaled)) >= targetL - 1) return toHex(scaled);
  let lo = 0, hi = 1;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (lightness(toHex(at(mid))) < targetL) lo = mid; else hi = mid;
  }
  return toHex(at(hi));
}

/**
 * 팀 색에서 화면 토큰을 만든다.
 *
 * `colors[0]`이 정체성 색, `colors[1]`이 보조색이다. 보조색이 없으면
 * (해외 확장팩 등 데이터가 덜 찬 경우) 주색을 어둡게 해서 대신 쓴다 —
 * 화면이 깨지느니 단조로운 편이 낫다.
 */
export function teamTokens(colors?: readonly string[] | null, tone: ThemeTone = "light"): TeamTokens {
  const primary = colors?.[0] ?? DEFAULT_PRIMARY;
  const secondary = colors?.[1];

  const dark = toLightness(primary, HEADER_L[tone]);
  const gold = toLightness(primary, GOLD_MIN_L);

  let accent = secondary ?? "";
  // 보조색이 없거나 흰 글씨가 안 얹히면 쓸 수 없다
  if (!accent || contrastOnWhiteText(accent) < 4.5) {
    accent = toLightness(secondary || primary, 38);
  }

  const [r, g, b] = parse(primary).map((c) => Math.round(c * 255));
  return {
    dark,
    accent,
    gold,
    stripe: `rgba(${r}, ${g}, ${b}, ${STRIPE_ALPHA})`,
    wash: `rgba(${r}, ${g}, ${b}, ${WASH_ALPHA})`,
  };
}

/** 팀을 못 찾았을 때(인트로·슬롯 선택 등 소속이 없는 화면) */
export const DEFAULT_PRIMARY = "#1E3050";

/**
 * 토큰을 문서에 바른다. 팀이 바뀔 때마다 부르면 화면 전체가 따라 바뀐다.
 *
 * ⚠ CSS 변수를 `:root`에 두는 이유 — 컴포넌트마다 색을 들고 있으면
 * 이적 한 번에 52개 화면을 다 고쳐야 한다. 이 안의 가치는 **한 곳에서
 * 바꾸면 전부 따라오는 것**이고, 그건 변수가 최상위에 있을 때만 성립한다.
 */
export function applyTeamTokens(t: TeamTokens, root?: HTMLElement): void {
  const el = root ?? (typeof document !== "undefined" ? document.documentElement : null);
  if (!el) return;
  el.style.setProperty("--t-dark", t.dark);
  el.style.setProperty("--t-accent", t.accent);
  el.style.setProperty("--t-gold", t.gold);
  el.style.setProperty("--t-stripe", t.stripe);
  el.style.setProperty("--t-wash", t.wash);
}
