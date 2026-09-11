import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주 경계의 "전주" 조회 ──────────────────────────────────────
//
// `processWeekBoundary(nextWeekNum)`은 `seasonStore.advanceWeek()` **뒤에**
// 불린다. 즉 인자로 받는 `weekNum`은 **막 들어선 주**이고, 그 주 경기는 아직
// 안 치렀다. 지난 주 경기를 보려면 `weekNum - 1`이어야 한다.
//
// 이걸 틀렸을 때 조용했던 이유가 중요하다 — 예외도 로그도 안 났다.
// 훈련에 걸린 코치 관계는 멀쩡히 움직여서 "관계도는 도는데 감독·동료만
// 안 오른다"로 보였다. 실측(`measure:relations`)에서야 갈렸다:
//
//   고치기 전   teammate 30명 값 −8~9, 갱신 W1, 라벨 전원 중립 · 리그 결과 소식 0통
//   고친 뒤     teammate 30명 값 10~21, 갱신 W37, 우호 26명 · 소식 정상
//
// 이 검사는 **소스를 본다.** 여기 걸린 계산이 advanceWeek 한복판이라
// 단위 테스트로 재현하려면 세계 전체를 세워야 하고, 그러면 검사가 아니라
// 두 번째 구현이 된다.

const src = () => readFileSync(resolve(__dirname, "../advanceWeek.ts"), "utf8");

/** `processWeekBoundary` 본문만 잘라낸다 — 바깥의 다른 weekNum 용법에 안 걸리게 */
function boundaryBody(s: string): string {
  const start = s.indexOf("async function processWeekBoundary");
  expect(start).toBeGreaterThan(0);
  // 다음 최상위 함수 선언까지
  const end = s.indexOf("\nexport async function advanceWeek", start);
  expect(end).toBeGreaterThan(start);
  return s.slice(start, end);
}

describe("주 경계에서 지난 주 경기를 본다", () => {
  it("관계도 갱신이 weekNum이 아니라 지난 주를 조회한다", () => {
    const body = boundaryBody(src());
    // 주인공 경기 조회
    expect(body).toMatch(/e\.week === gameWeek && e\.isProtagonistGame/);
    expect(body).toMatch(/const gameWeek = weekNum - 1/);
    // 틀린 형태가 남아 있으면 안 된다
    expect(body).not.toMatch(/e\.week === weekNum && e\.isProtagonistGame/);
  });

  it("리그 경기 결과 소식도 지난 주를 조회한다", () => {
    const body = boundaryBody(src());
    expect(body).toMatch(/e\.week === weekNum - 1 && !e\.isProtagonistGame/);
    expect(body).not.toMatch(/e\.week === weekNum && !e\.isProtagonistGame/);
  });

  it("호출부가 advanceWeek 뒤에 nextWeekNum으로 부른다 — 이 전제가 깨지면 위 두 검사가 뒤집힌다", () => {
    const s = src();
    const call = s.indexOf("await processWeekBoundary(nextWeekNum)");
    const inc = s.indexOf("seasonStore.advanceWeek()");
    expect(call).toBeGreaterThan(0);
    expect(inc).toBeGreaterThan(0);
    expect(inc).toBeLessThan(call);
  });
});
