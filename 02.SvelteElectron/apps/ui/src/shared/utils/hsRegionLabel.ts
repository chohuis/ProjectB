/**
 * 고교 8권역의 표시 이름. **정본은 여기 하나다.**
 *
 * 권역은 `HS_REGIONS`에 구장 ID로만 묶여 있고 사람이 읽을 이름이 없었다.
 * 대학은 `LEAGUE_GROUP_META`에 A~E 라벨이 있는데 고교엔 그게 없다.
 *
 * 이름은 그 권역에 실제로 속한 도시에서 왔다(추측이 아니라 데이터 확인):
 *
 *   한강    16팀  서울
 *   무지개  20팀  수원 성남 인천 용인 김포 고양 부천 하남 오산
 *   계룡    12팀  천안 대전 금산 부여 홍성 청주 충주 예산
 *   설악     6팀  춘천 원주 강릉 속초 태백
 *   영산    14팀  전주 광주 강진 화순 담양 무안 여수 순천 군산
 *   팔공    12팀  대구 구미 경주 안동 포항 영주 경산
 *   낙동    16팀  창원 김해 진주 부산 거제 울산 통영
 *   한라     6팀  제주 서귀포
 */
export interface HsRegionMeta {
  /** 화면에 쓰는 권역 이름 */
  label: string;
  /** 어느 지역인지 한 줄 설명 */
  area: string;
  /** 목록에서의 순서 — 수도권부터 남쪽으로 */
  order: number;
}

const META: Record<string, HsRegionMeta> = {
  STADIUM_HANGANG: { label: "한강", area: "서울", order: 1 },
  STADIUM_MUJIGAE: { label: "무지개", area: "경기 · 인천", order: 2 },
  STADIUM_GYERYONG: { label: "계룡", area: "충청 · 대전", order: 3 },
  STADIUM_SEORAK_HS: { label: "설악", area: "강원", order: 4 },
  STADIUM_YEONGSAN: { label: "영산", area: "호남 · 광주", order: 5 },
  STADIUM_PALGONG: { label: "팔공", area: "대구 · 경북", order: 6 },
  STADIUM_NAKDONG: { label: "낙동", area: "부산 · 경남 · 울산", order: 7 },
  STADIUM_HALLA: { label: "한라", area: "제주", order: 8 },
};

/** 모르는 권역이 와도 화면이 비지 않게 ID를 그대로 돌려준다 */
export function hsRegionMeta(stadiumId: string): HsRegionMeta {
  return META[stadiumId] ?? { label: stadiumId, area: "", order: 99 };
}

/** 권역 ID 목록을 화면 순서(수도권 → 남쪽)로 정렬한다 */
export function sortRegions(ids: readonly string[]): string[] {
  return [...ids].sort((a, b) => hsRegionMeta(a).order - hsRegionMeta(b).order);
}
