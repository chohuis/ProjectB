/**
 * **바둑알 같은 선수 표식** — 팀 색으로 칠한다.
 *
 * ## 왜 그림 파일이 아닌가
 *
 * 스프라이트 9장은 팀 색을 못 바꾼다. 색쌍이 210가지라 미리 구우면
 * 210 × 9 = **1,890장**이 되고 팀 색이 바뀌면 다시 구워야 한다.
 * 알은 **색이 인자**라 그 문제가 통째로 사라진다.
 *
 * ## Godot 판(`stone.gd`)과 다른 점
 *
 * 원본은 픽셀을 하나씩 찍고 4배로 그린 뒤 줄여서 계단을 없앤다.
 * **여기는 SVG라 그럴 필요가 없다** — `<circle>`은 어느 크기에서도 곱고,
 * 광택은 `<radialGradient>`가 낸다. 갈무리(캐시)도 필요 없다:
 * 텍스처를 만드는 게 아니라 그리기 지시를 넘길 뿐이라 **색이 바뀌면
 * 그대로 따라온다.** 공수가 교대해도 비울 것이 없다.
 *
 * 글꼴도 그렇다. 원본은 7세그먼트로 획을 그려서 **R이 A처럼 보였는데**,
 * SVG `<text>`는 어떤 글자든 제대로 낸다.
 */

/** 알 반지름 대비 테두리 두께 — 원본의 `t > 0.84`와 같은 자리다 */
const RIM_RATIO = 0.16;

/**
 * 글자 색을 **흰색과 검정 둘 중에서만** 고른다.
 *
 * 🔴 **팀 보조색을 글자에 쓰지 않는다.** 48팀으로 재보니 **21팀에서 글자가
 *   묻혔다** — 주색과 보조색이 색상은 달라도 밝기가 비슷한 경우가 많다
 *   (`be47b2` / `8a6512`는 밝기 차 0.00이다). 자료가 그렇게 짜여 있으니
 *   색을 그대로 쓰는 한 못 피한다.
 *
 * ⚠ **원본의 기준값 0.48을 그대로 쓰지 않는다.** 원본은 감마를 되돌리지 않은
 *   단순 가중합을 보는데, 여기서 WCAG 상대 휘도로 재면 그 경계가 어긋난다 —
 *   `#0fd287`에서 **대비 1.98**이 나왔다(검사가 잡았다).
 *   대신 **두 후보의 대비를 직접 재서 큰 쪽**을 고른다. 임계값을 정할 일이
 *   없어지고 어떤 색에서도 **4.58:1 이상**이 보장된다.
 */
export function inkFor(bg: string): string {
  const l = luminanceOf(bg);
  const onDark = (l + 0.05) / 0.05; // 검은 글자를 얹었을 때
  const onLight = 1.05 / (l + 0.05); // 흰 글자를 얹었을 때
  return onDark >= onLight ? "#14141A" : "#FFFFFF";
}

/** 상대 휘도 (0~1). sRGB 감마를 되돌려 잰다 */
export function luminanceOf(hex: string): number {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace("#", "").trim();
  const s =
    h.length === 3
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  const n = Number.parseInt(s.slice(0, 6), 16);
  return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [128, 128, 128];
}

/** 색을 어둡게 — `Color.darkened(amount)`와 같다 */
export function darken(hex: string, amount: number): string {
  const k = 1 - Math.min(Math.max(amount, 0), 1);
  const v = rgbOf(hex).map((c) => Math.round(c * k));
  return `#${v.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

export interface StoneStyle {
  /** 알 몸통 — 가운데가 밝고 가장자리가 어둡다 */
  body: string;
  bodyEdge: string;
  /** 테두리 — 팀 보조색이 여기 남는다 */
  rim: string;
  rimWidth: number;
  /** 글자 — 흰색이나 검정 */
  ink: string;
}

/**
 * 알 한 벌의 색을 낸다. `radius`는 SVG 좌표계 반지름이다.
 *
 * ⚠ **원정 팀을 어둡게 하는 건 여기서 하지 않는다.** 주색·보조색 쌍이
 *   210가지라 홈·원정이 비슷하게 붙는 경우가 생길 수 있는데, 실제로
 *   겪기 전에는 넣지 않는다. 겪으면 `main`에 `darken(main, 0.15)`을 준다.
 */
export function stoneStyle(main: string, sub: string, radius: number): StoneStyle {
  return {
    body: main,
    bodyEdge: darken(main, 0.45),
    rim: sub,
    rimWidth: radius * RIM_RATIO,
    ink: inkFor(main),
  };
}
