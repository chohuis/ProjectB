/**
 * 홈 팀 → 어느 구장 그림을 띄우고 어느 좌표를 쓸 것인가.
 *
 * ⚠ **예전엔 `probaseball.gif` 하나가 하드코딩이었다.** 그래서 고교 경기도
 * 대학 경기도 전부 프로 구장에서 열렸고, 구장 27개를 미리 정해 두는 설계가
 * 화면에 하나도 반영되지 않았다.
 *
 * 좌표가 티어마다 다른 이유는 `parkAnchors.ts` 머리말에 있다 — 원본 구장
 * 그림 세 장이 각각 따로 그려졌기 때문이다.
 */
import {
  PARK_COORDS, PARK_TIER_OF, PARK_IMAGES,
  type ParkTier, type ParkCoords,
} from "./parkAnchors";

/** 그림이 없는 구장이 걸렸을 때 쓰는 티어 기본 그림 (원본 GIF) */
const TIER_FALLBACK_IMAGE: Record<ParkTier, string> = {
  pro:        "/park/probaseball.gif",
  university: "/park/universitybaseball.gif",
  highschool: "/park/highschoolbaseball.gif",
};

export interface ParkView {
  stadiumId: string;
  tier: ParkTier;
  imageUrl: string;
  coords: ParkCoords;
  /** 전용 그림이 있나. 없으면 티어 기본 GIF다 */
  hasOwnImage: boolean;
}

/** 구장을 못 정했을 때 — 프로 좌표 + 기존 GIF. 지금까지의 동작 그대로다 */
export function defaultParkView(): ParkView {
  return {
    stadiumId: "",
    tier: "pro",
    imageUrl: TIER_FALLBACK_IMAGE.pro,
    coords: PARK_COORDS.pro,
    hasOwnImage: false,
  };
}

/**
 * 구장 ID로 화면 정보를 만든다.
 *
 * 해외(ABL·JBL) 팀은 구장을 **한글 이름 문자열**로 참조하고 정의가 없다.
 * 그런 값이 들어와도 프로 기본값으로 떨어질 뿐 화면이 비지 않는다.
 */
export function parkViewOf(stadiumId: string | undefined | null): ParkView {
  if (!stadiumId) return defaultParkView();
  const tier = PARK_TIER_OF[stadiumId];
  if (!tier) return defaultParkView();

  const hasOwnImage = PARK_IMAGES.has(stadiumId);
  return {
    stadiumId,
    tier,
    imageUrl: hasOwnImage ? `/park/${stadiumId}.png` : TIER_FALLBACK_IMAGE[tier],
    coords: PARK_COORDS[tier],
    hasOwnImage,
  };
}

/**
 * 홈 팀이 쓰는 구장. **홈 팀이 정본이다** — 원정 팀 구장에서 경기하지 않는다.
 * `teams`는 `masterStore.teams`를 그대로 넘긴다.
 */
export function parkViewForHomeTeam(
  homeTeamId: string | undefined | null,
  teams: readonly { id: string; stadium?: string }[],
): ParkView {
  if (!homeTeamId) return defaultParkView();
  const t = teams.find((x) => x.id === homeTeamId);
  return parkViewOf(t?.stadium);
}
