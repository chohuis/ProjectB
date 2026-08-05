// 이 파일은 `npm run fit:park`이 만든다. **직접 편집하지 말 것.**
//
// 원본 구장 그림 3장(probaseball / universitybaseball / highschoolbaseball)은
// 각각 따로 그려져 내야 다이아몬드 위치가 다르다. 구장 27장은 각자 제 티어
// 기준 그림을 따랐으므로 좌표도 티어마다 있어야 한다.
//
// 프로 좌표는 예전부터 쓰던 정본 그대로다. 나머지 두 티어는 베이스 4점
// 대응으로 축별 1차 변환을 적합해 옮겼다 — 그래야 "스프라이트 발밑은
// 베이스보다 조금 위"라는 관계가 세 티어에서 똑같이 유지된다.
//
// 적합 잔차: 대학 최대 1.8px · 고교 최대 7.5px (좌표계 1000x920)

export type ParkTier = "pro" | "university" | "highschool";

export interface ParkPoint { x: number; y: number }
export interface ParkDefender { pos: string; x: number; y: number }
export interface ParkCoords {
  field: { home: ParkPoint; first: ParkPoint; second: ParkPoint; third: ParkPoint; mound: ParkPoint };
  defense: readonly ParkDefender[];
}

/** BaseballField의 viewBox */
export const PARK_VIEWBOX = { width: 1000, height: 920 } as const;

/** 스프라이트 미세 오프셋 — 티어와 무관하게 같다 */
export const PARK_SPRITE_OFFSETS = {
  batter: { dx: 34, dy: -22 },
  runner: {
    first:  { dx: 14, dy: -18 },
    second: { dx: 0, dy: -20 },
    third:  { dx: -14, dy: -18 },
  },
} as const;

export const PARK_COORDS: Record<ParkTier, ParkCoords> = {
  pro: {
    field: {
      home: { x: 497, y: 790 }, first: { x: 715, y: 580 }, second: { x: 497, y: 454 },
      third: { x: 280, y: 580 }, mound: { x: 497, y: 548 },
    },
    defense: [
      { pos: "P", x: 497, y: 548 },
      { pos: "C", x: 497, y: 800 },
      { pos: "1B", x: 710, y: 588 },
      { pos: "2B", x: 600, y: 508 },
      { pos: "SS", x: 387, y: 508 },
      { pos: "3B", x: 272, y: 588 },
      { pos: "LF", x: 242, y: 518 },
      { pos: "CF", x: 497, y: 434 },
      { pos: "RF", x: 752, y: 518 },
    ],
  },
  university: {
    field: {
      home: { x: 501, y: 818 }, first: { x: 704, y: 626 }, second: { x: 501, y: 511 },
      third: { x: 299, y: 626 }, mound: { x: 501, y: 597 },
    },
    defense: [
      { pos: "P", x: 501, y: 597 },
      { pos: "C", x: 501, y: 827 },
      { pos: "1B", x: 699, y: 633 },
      { pos: "2B", x: 597, y: 561 },
      { pos: "SS", x: 398, y: 561 },
      { pos: "3B", x: 291, y: 633 },
      { pos: "LF", x: 263, y: 570 },
      { pos: "CF", x: 501, y: 493 },
      { pos: "RF", x: 738, y: 570 },
    ],
  },
  highschool: {
    field: {
      home: { x: 499, y: 793 }, first: { x: 707, y: 558 }, second: { x: 499, y: 417 },
      third: { x: 292, y: 558 }, mound: { x: 499, y: 523 },
    },
    defense: [
      { pos: "P", x: 499, y: 523 },
      { pos: "C", x: 499, y: 804 },
      { pos: "1B", x: 702, y: 567 },
      { pos: "2B", x: 597, y: 478 },
      { pos: "SS", x: 394, y: 478 },
      { pos: "3B", x: 285, y: 567 },
      { pos: "LF", x: 256, y: 489 },
      { pos: "CF", x: 499, y: 395 },
      { pos: "RF", x: 742, y: 489 },
    ],
  },
};

/** 구장 → 티어. 여기 없는 구장(해외 등)은 프로 기본값으로 떨어진다 */
export const PARK_TIER_OF: Record<string, ParkTier> = {
  STADIUM_SEOUL_GUARDIANS: "pro",
  STADIUM_SUWON_KNIGHTS: "pro",
  STADIUM_SEOUL_ROYALS: "pro",
  STADIUM_INCHEON_SHARKS: "pro",
  STADIUM_DAEGU_SABERS: "pro",
  STADIUM_CHANGWON_STARS: "pro",
  STADIUM_BUSAN_WAVES: "pro",
  STADIUM_SEOUL_COBRAS: "pro",
  STADIUM_GWANGJU_PANTHERS: "pro",
  STADIUM_DAEJEON_PHANTOMS: "pro",
  STADIUM_GEUMGANG_UNIV: "university",
  STADIUM_NOEUL: "university",
  STADIUM_MIREU: "university",
  STADIUM_BYEOLBIT: "university",
  STADIUM_TAEJONG: "university",
  STADIUM_GANGBYEON: "university",
  STADIUM_GYEBAEK: "university",
  STADIUM_NAMNYEOK: "university",
  STADIUM_CHANGGONG: "university",
  STADIUM_GYERYONG: "highschool",
  STADIUM_NAKDONG: "highschool",
  STADIUM_MUJIGAE: "highschool",
  STADIUM_SEORAK_HS: "highschool",
  STADIUM_YEONGSAN: "highschool",
  STADIUM_PALGONG: "highschool",
  STADIUM_HANGANG: "highschool",
  STADIUM_HALLA: "highschool",
};

/** 그림이 있는 구장 목록 — 없으면 티어 기본 그림을 쓴다 */
export const PARK_IMAGES: ReadonlySet<string> = new Set([
  "STADIUM_SEOUL_GUARDIANS",
  "STADIUM_SUWON_KNIGHTS",
  "STADIUM_SEOUL_ROYALS",
  "STADIUM_INCHEON_SHARKS",
  "STADIUM_DAEGU_SABERS",
  "STADIUM_CHANGWON_STARS",
  "STADIUM_BUSAN_WAVES",
  "STADIUM_SEOUL_COBRAS",
  "STADIUM_GWANGJU_PANTHERS",
  "STADIUM_DAEJEON_PHANTOMS",
  "STADIUM_GEUMGANG_UNIV",
  "STADIUM_NOEUL",
  "STADIUM_MIREU",
  "STADIUM_BYEOLBIT",
  "STADIUM_TAEJONG",
  "STADIUM_GANGBYEON",
  "STADIUM_GYEBAEK",
  "STADIUM_NAMNYEOK",
  "STADIUM_CHANGGONG",
  "STADIUM_GYERYONG",
  "STADIUM_NAKDONG",
  "STADIUM_MUJIGAE",
  "STADIUM_SEORAK_HS",
  "STADIUM_YEONGSAN",
  "STADIUM_PALGONG",
  "STADIUM_HANGANG",
  "STADIUM_HALLA",
]);
