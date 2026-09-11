import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 선발 경쟁은 **지금** 실력으로 붙는다 ─────────────────────────
//
// 선발 배정은 절대 수치가 아니라 팀 내 경쟁이다 (`player_engine.rs`):
//
//   let higher = team_pitcher_ovrs.iter().filter(|&&o| o > my_ovr).count();
//   if higher <= 2 { "SP" } else { "RP" }
//
// **나보다 나은 팀 투수가 3명 이상이면 RP** — 3선발 안에 들어야 한다.
//
// ⚠ 비교 대상을 `details.player.pitching.ovr`(생성값)로 읽으면 **동료는 안
// 자라고 주인공만 자란다.** 실측(2026-08-09)에서 생성값은 3년간 9종 전부
// +0이었다. 그 상태로 6안 비교를 돌려 "선발 문턱은 OVR 64"라는 답을
// 냈는데, 그게 주인공에게 유리하게 기운 기준 위였다.
//
// 이 결함은 조용하다 — 값이 있고 타입도 맞아서 예외가 안 난다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("투수 보직 배정 — live를 읽는다", () => {
  const src = read("apps/ui/src/shared/utils/pitcherRoleEngine.ts");

  it("고교 포지션 배정이 live를 쓴다", () => {
    expect(src).toMatch(/const teamPitcherOvrs = entities[\s\S]{0,300}livePitcherOvr\(e, live\)/);
    expect(src).not.toMatch(
      /const teamPitcherOvrs = entities[\s\S]{0,300}\(e\.details as any\)\?\.player\?\.pitching\?\.ovr \?\? 0\)/,
    );
  });

  it("프로 역할 배정도 live를 쓴다", () => {
    expect(src).toMatch(/const teamSpOvrs = entities[\s\S]{0,400}livePitcherOvr\(e, live\)/);
  });

  it("헬퍼가 live → 생성값 순으로 본다 — 갓 생성된 동료가 0이 되면 안 된다", () => {
    // 폴백을 빼면 live가 아직 없는 팀 동료가 전부 0이 되고, "나보다 나은
    // 투수가 0명"이 되어 **주인공이 무조건 선발**이 된다
    expect(src).toMatch(
      /live\[e\.id\]\?\.pitching\?\.ovr\s*\n?\s*\?\?\s*\(e\.details as any\)\?\.player\?\.pitching\?\.ovr/,
    );
  });

  // ── 로테이션 자리 수 (PLAN_ROLE_RECOMMEND §1 발견 a) ──────────────
  //
  // Rust 는 예전에 리그와 무관하게 `rank <= 5` 로 5선발까지 줬다. 로테이션이
  // 3자리인 대학·고교에서 **그 팀에 없는 「4선발」·「5선발」**이 나왔다.
  // ⚠ `serde(default)` 라 안 넘겨도 조용히 통과한다 — 넘기는지를 여기서 본다.
  //   자리 수 값 자체는 규칙 파일이 정본이고 cargo 가 한계 판정을 본다.
  it("리그별 로테이션 자리 수를 Rust 에 넘긴다", () => {
    expect(src.includes("rotationSize: rotationSizeForLeague(protagonist.leagueId),")).toBe(true);
    expect(src.includes('import { rotationSizeForLeague } from "./rosterEngine";')).toBe(true);
  });

  it("Rust 가 그 자리 수로 선발 한계를 정한다 — 리터럴 5 가 아니다", () => {
    const rust = read("packages/engine-native/src/player_engine.rs");
    expect(rust.includes("pub rotation_size: Option<usize>,")).toBe(true);
    expect(rust.includes('if rank <= seats { format!("{}선발", rank) }')).toBe(true);
    expect(rust.includes("if rank <= 5 {")).toBe(false);
  });

  it("스토어를 루프 밖에서 한 번만 읽는다", () => {
    // `.map` 안에서 get()을 부르면 팀 인원수만큼 스토어를 훑는다
    expect(src).not.toMatch(/\.map\(\(e\) => livePitcherOvr\(e, get\(/);
    expect((src.match(/const live = get\(npcLiveStatsStore\);/g) ?? []).length).toBe(2);
  });
});
