import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공 뒤에는 자기 팀 수비가 선다 ────────────────────────────
//
// 엔진은 `fielders`를 안 받으면 **평균 50짜리 수비**를 만든다
// (`match_engine.rs`의 `create_default_fielders(rng, 50.0)`). 리그 실제
// 수비는 66 수준이라, 주인공만 16점 약한 뒤를 두고 던지고 있었다.
//
// 120경기 실측(2026-08-10), 투수 OVR 68 · 타자 66:
//
//   수비 기본(50) → ERA 10.29
//   수비 66       → ERA  7.22      ← 3점 넘게 내린다
//
// ⚠ **자기 팀이다.** 엔진의 `fielders`는 배열 하나이고 주인공이 던지는 동안의
// 인플레이 타구 판정(`resolve_fielding_result`)에 쓰인다 — 그때 뒤에 서는 건
// 소속팀 야수지 상대가 아니다. MatchPage는 상대 팀을 넘기고 있었고, 자동
// 진행 경로는 아예 안 넘겼다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("경기 수비 배선", () => {
  it("자동 진행이 자기 팀 수비를 넘긴다", () => {
    const s = read("apps/ui/src/shared/usecases/runAutoAdvance.ts");
    expect(s).toMatch(/fielders:\s*buildFielders\(p\.teamId, ents\)/);
  });

  it("실제 플레이(MainPage)도 자기 팀 수비를 넘긴다", () => {
    // `buildFielders`가 import만 돼 있고 쓰이지 않던 자리다
    const s = read("apps/ui/src/pages/main/MainPage.svelte");
    expect(s).toMatch(/fielders:\s*buildFielders\(p\.teamId,/);
  });

  it("MatchPage가 상대 팀이 아니라 자기 팀을 넘긴다", () => {
    const s = read("apps/ui/src/pages/match/MatchPage.svelte");
    expect(s).toMatch(/const fielders = myTeamId \? buildOpponentFielders\(myTeamId\)/);
    expect(s).not.toMatch(/const fielders = opponentTeamId \? buildOpponentFielders\(opponentTeamId\)/);
  });

  it("IPC 선언이 fielders를 받는다 — 타입이 좁으면 호출부가 막힌다", () => {
    // 실제로 이 선언이 없어서 배선이 타입 오류로 막혔다
    const s = read("apps/ui/src/shared/types/projectb.d.ts");
    const at = s.indexOf("matchSimulateToEntry");
    expect(at).toBeGreaterThan(-1);
    const block = s.slice(at, s.indexOf("matchAutoFinishFromEntry", at));
    expect(block).toMatch(/fielders\?:\s*MatchFielderStats\[\]/);
  });

  it("buildFielders가 9인을 좌표까지 채운다", () => {
    // ⚠ **함수 안으로 좁힌다.** 파일 전체를 보면 다른 곳의 `x:`가 통과시킨다 —
    // 변이 검증에서 좌표를 통째로 지워도 안 잡혔다
    const s = read("apps/ui/src/shared/utils/matchLineupBuilder.ts");
    const at = s.indexOf("export function buildFielders");
    expect(at).toBeGreaterThan(-1);
    const body = s.slice(at, s.indexOf("\n}", at) + 2);
    for (const k of ["fielding", "arm", "speed", "x:", "y:"]) expect(body).toContain(k);
  });
});
