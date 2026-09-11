// 🔴 **정본은 `resource/park/_spec/anchors.json`이다.** 여기 값은 거기서 옮긴다.
//    `parkAnchorsMatchSpec.test.ts`가 두 파일이 어긋나면 잡는다.
//
// ⚠ **`npm run fit:park`을 돌려 이 파일을 만들지 않는다.** 그 스크립트는
//   "프로 좌표는 손대지 않는다"를 전제로 하는데 **그 전제가 틀렸다** —
//   프로 앵커부터 그림과 어긋나 있었다. 스크립트 머리말에 그 경위가 있다.
//
// 🔴 **2026-08-26까지 이 파일만 옛 값이었다.** 정본은 2026-08-20에
//   구장 27장 실측으로 고쳐졌는데 **화면이 쓰는 이 파일이 안 따라갔다.**
//   마운드가 홈→2루의 72% 지점(정본 63~64%)이라 투수가 마운드보다 위에
//   떠 있었다. 검사는 `anchors.json`만 보고 있어서 못 잡았다 —
//   **재는 자리와 쓰는 자리가 달랐다.**
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

export interface ParkPoint {
  x: number;
  y: number;
}
export interface ParkDefender {
  pos: string;
  x: number;
  y: number;
}
export interface ParkCoords {
  field: {
    home: ParkPoint;
    first: ParkPoint;
    second: ParkPoint;
    third: ParkPoint;
    mound: ParkPoint;
  };
  defense: readonly ParkDefender[];
}

/** BaseballField의 viewBox */
export const PARK_VIEWBOX = { width: 1000, height: 920 } as const;

/** 스프라이트 미세 오프셋 — 티어와 무관하게 같다 */
export const PARK_SPRITE_OFFSETS = {
  batter: { dx: 34, dy: -22 },
  runner: {
    first: { dx: 14, dy: -18 },
    second: { dx: 0, dy: -20 },
    third: { dx: -14, dy: -18 },
  },
} as const;

export const PARK_COORDS: Record<ParkTier, ParkCoords> = {
  pro: {
    field: {
      home: { x: 497, y: 800 },
      first: { x: 720, y: 622 },
      second: { x: 497, y: 514 },
      third: { x: 275, y: 622 },
      mound: { x: 498, y: 617 },
    },
    defense: [
      { pos: "P", x: 498, y: 617 },
      { pos: "C", x: 497, y: 809 },
      { pos: "1B", x: 715, y: 628 },
      { pos: "2B", x: 602, y: 560 },
      { pos: "SS", x: 384, y: 560 },
      { pos: "3B", x: 267, y: 628 },
      { pos: "LF", x: 236, y: 569 },
      { pos: "CF", x: 497, y: 497 },
      { pos: "RF", x: 758, y: 569 },
    ],
  },
  university: {
    field: {
      home: { x: 501, y: 825 },
      first: { x: 710, y: 663 },
      second: { x: 501, y: 562 },
      third: { x: 293, y: 663 },
      mound: { x: 501, y: 659 },
    },
    defense: [
      { pos: "P", x: 501, y: 659 },
      { pos: "C", x: 501, y: 834 },
      { pos: "1B", x: 705, y: 668 },
      { pos: "2B", x: 600, y: 606 },
      { pos: "SS", x: 395, y: 606 },
      { pos: "3B", x: 285, y: 668 },
      { pos: "LF", x: 256, y: 614 },
      { pos: "CF", x: 501, y: 548 },
      { pos: "RF", x: 745, y: 614 },
    ],
  },
  highschool: {
    field: {
      home: { x: 499, y: 799 },
      first: { x: 711, y: 611 },
      second: { x: 499, y: 476 },
      third: { x: 288, y: 611 },
      mound: { x: 499, y: 594 },
    },
    defense: [
      { pos: "P", x: 499, y: 594 },
      { pos: "C", x: 499, y: 813 },
      { pos: "1B", x: 706, y: 612 },
      { pos: "2B", x: 599, y: 536 },
      { pos: "SS", x: 392, y: 536 },
      { pos: "3B", x: 281, y: 612 },
      { pos: "LF", x: 251, y: 546 },
      { pos: "CF", x: 499, y: 466 },
      { pos: "RF", x: 746, y: 546 },
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
