// ── 판정용 씨앗 ────────────────────────────────────────────────────────────
//
// 🔴 **엔진이 `thread_rng`을 쓰면 같은 세이브도 실행마다 결과가 다르다.**
// 실측: 같은 설정으로 test:foreign을 세 번 돌리면 외국인 교체율이 5.0·6.0·4.7로
// 갈리고 "빈 슬롯" 검사가 3회 중 1회 빨간불이었다. 그 상태에서는 계측을 한 번
// 돌려 전후를 비교할 수 없고, 간헐 실패를 회귀와 구분할 수 없다.
//
// 그래서 판정마다 **입력에서 씨앗을 만든다.** 같은 입력이면 같은 답이 나온다.
//
// ⚠ **무엇을 섞느냐가 뜻을 정한다.**
//   · 선수를 안 섞으면 그 해 모든 선수가 같은 난수를 받아 전원이 똑같이 행동한다
//   · 팀을 섞으면 팀마다 다른 답이 나온다 — FA 입찰처럼 팀별로 갈려야 하는 자리
//   · 팀을 안 섞으면 어느 팀이 물어도 같은 답 — FA 결정처럼 선수의 성향인 자리
//
// ⚠ **0을 돌려주지 않는다.** 엔진이 0을 "씨앗 없음"으로 읽어 `thread_rng`로
// 떨어진다. 그 규약은 `start_match_native`가 먼저 쓰고 있다.

/** 문자열을 32비트로 — FNV-1a */
function hashOf(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * 판정 씨앗. 넘긴 조각들을 순서대로 섞는다.
 *
 * @example seedOf(worldSeed, 2027, npcId)            // 선수의 판단
 * @example seedOf(worldSeed, 2027, npcId, teamId)    // 팀마다 다른 판단
 */
export function seedOf(worldSeed: number, ...parts: Array<string | number>): number {
  let h = (worldSeed >>> 0) || 0x9e3779b1;
  for (const part of parts) {
    const v = typeof part === "number" ? (part >>> 0) : hashOf(part);
    h = (Math.imul(h ^ v, 0x9e3779b1) >>> 0);
  }
  // 0이면 씨앗 없음으로 읽힌다 — 절대 안 돌려준다
  return (h >>> 0) || 1;
}
