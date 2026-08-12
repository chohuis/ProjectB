import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 드래프트는 상대평가다 ────────────────────────────────────────
//
// 사용자 확정(2026-08-09):
//   상위픽   팀 에이스급 + 리그 최상위
//   중간픽   리그에서 무난한 수준
//   미지명   애매하거나 · 큰 부상이 있거나 · 대회에서 못했거나
//
// 예전엔 `scout*0.6 + ovr*0.4`의 **절대값**이었다. 고교말 OVR 실측 범위가
// 52~63이라 OVR 기여가 4.4점 폭뿐이었고 scoutScore는 3년에 +14가 천장이라,
// **60회 조사에서 지명 30회가 전부 9라운드 · 미지명 0건**이었다.
//
// ⚠ **폴백으로 조용히 돌아가는 걸 막는다.** Rust는 또래 분포가 비면 OVR을
// 백분위처럼 쓴다(터지지 않게). 호출부가 안 넘기면 겉보기엔 멀쩡한데
// 옛 동작이다 — 그래서 배선을 검사가 본다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("주인공 드래프트 산식", () => {
  const rust = read("packages/engine-native/src/npc_sim.rs");

  it("리그 백분위를 쓴다", () => {
    expect(rust).toMatch(/peer_ovrs\.iter\(\)\.filter\(\|&&o\| o < params\.pitching_ovr\)/);
  });

  it("절대 OVR도 항으로 남는다 — 팀운이 없어도 재능은 보인다", () => {
    expect(rust).toMatch(/let ovr_norm =/);
    expect(rust).toMatch(/pct \* 0\.6 \+ ovr_norm \* 0\.4/);
  });

  it("부상·대회·에이스가 전부 반영된다", () => {
    for (const t of ["injury_pen", "tour_adj", "ace_bonus"]) expect(rust).toContain(t);
  });

  it("라운드가 직선이라 1~11이 전부 나온다", () => {
    // 옛 식 `ceil(4 + (55-score)/5)`은 4·8·10·11이 도달 불가였다
    expect(rust).not.toMatch(/ceil\(\) as i32/);
    // ⚠ **앵커는 어림이 아니라 NPC 실측이다** (2026-08-12).
    //
    // 예전 앵커는 "리그 중위(50) → 6R · 최상위(95) → 1R"이었다. 같은 세계의
    // 고졸 지명자 327명을 주인공과 **같은 분모**(고교 3학년 투수)로 재보니
    // 주인공이 5라운드 관대했다 — 백분위 95~100이 NPC는 5R인데 주인공은 1R.
    //
    // 두 점을 잰 값으로 잡았다:
    //   score 88 → 7R (백분위 93 · NPC 관문) · score 98 → 3R · score 110 → 1R
    expect(rust).toMatch(/\(11\.0 - \(draft_score - 78\.0\) \* 0\.40\)/);

    // ⚠ **위를 자르지 않는다.** `base`가 이미 0~100이고 그 위에 에이스(+8)·
    // 수상(+20)이 얹혀 실측 원값이 110까지 나온다. `clamp(0,100)`이던 시절엔
    // 100 위의 순서가 지워져 **17건 중 7건이 1R**로 뭉쳤다
    expect(rust).toMatch(/- injury_pen\)\.max\(0\.0\)/);
    expect(rust).not.toMatch(/- injury_pen\)\.clamp\(0\.0, 100\.0\)/);
  });

  it("애매하면 미지명이다 — 문턱이 실측 지명률에서 온다", () => {
    // ⚠ 옛 문턱 25는 **아무도 못 걸렀다.** 백분위 33·55짜리도 부상만 없으면
    // 6~7R로 지명됐고, 미지명 경로가 사실상 부상 하나뿐이었다. 사용자가 정한
    // 세 갈래 중 "애매하면 지명이 안 된다"가 통째로 빠져 있었다.
    //
    // NPC 실측: 고교 3학년 투수 4805명 중 고졸 지명 327명 = 6.81%.
    // 백분위 93이 관문이고 그 지점의 실측 score가 88이다.
    expect(rust).toMatch(/const UNDRAFTED_SCORE: f64 = 78\.0;/);

    // 문턱과 라운드 직선이 **한 점에서 만나야 한다** — 직선이 11R에서 끊기는
    // 지점이 곧 문턱이다. 어긋나면 11R이 도달 불가가 되거나(문턱이 위)
    // 12R 이상이 미지명으로 뭉개진다(문턱이 아래)
    const round = (s: number) => 11.0 - (s - 78.0) * 0.40;
    expect(Math.round(round(78.0))).toBe(11);
  });

  it("호출부가 또래 분포를 실제로 넘긴다 — 안 넘기면 폴백이 옛 동작이다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/determineProtagonistDraft\([\s\S]{0,200}peerOvrs/);
    expect(s).toMatch(/surgeryInjuries:  nInj\("surgery"\)/);
    // 대회·수상은 `hsDraftInputsOf`가 한 번에 만든다 — 호출부가 척도를
    // 다시 계산하면 `calcHsBaseballScore`(진학용 **합계**)를 그대로 넘기던
    // 옛 결함으로 돌아간다
    expect(s).toMatch(/hsDraftInputsOf\(p\.careerRecords \?\? \[\]\)/);
    expect(s).toMatch(/\.\.\.hsInputs/);
  });

  it("부상은 심각도로 가른다 — 뭉치면 염증이 UCL 파열과 같은 무게가 된다", () => {
    const rust = read("packages/engine-native/src/npc_sim.rs");
    expect(rust).toMatch(/moderate_injuries\.unwrap_or\(0\) as f64 \* 2\.0/);
    expect(rust).toMatch(/severe_injuries\.unwrap_or\(0\) as f64 \* 10\.0/);
    expect(rust).toMatch(/surgery_injuries\.unwrap_or\(0\) as f64 \* 18\.0/);
    // 상한이 없어 실측 감점이 -252까지 갔다 — clamp에 걸려 그냥 0점이 되고,
    // 내역을 실어도 어디까지 깎였는지 못 읽는 구간이다
    expect(rust).toMatch(/\.min\(45\.0\)/);
    // 옛 이름이 남아 있으면 뭉쳐 세는 경로가 살아 있다는 뜻이다
    expect(rust).not.toMatch(/major_injuries/);
  });

  it("대회 점수는 한 시즌 평균이다 — 합계를 넘기면 척도가 어긋난다", () => {
    const d = read("apps/ui/src/shared/utils/draftSystem.ts");
    expect(d).toMatch(/tournamentScore: tour \/ hs\.length/);
    // 기록이 없으면 미진출 수준(20)으로 본다 — 0을 넘기면 큰 감점이 된다
    expect(d).toMatch(/tournamentScore: 20/);
    const rust = read("packages/engine-native/src/npc_sim.rs");
    // 기준점 50이던 시절엔 평범한 고교생(미진출 10)이 전원 -12를 먹었다
    expect(rust).toMatch(/tournament_score\.unwrap_or\(20\.0\) - 20\.0\) \* 0\.20/);
  });

  it("수상이 산식에 들어간다 — MVP를 부문상보다 무겁게, 상한을 둔다", () => {
    const rust = read("packages/engine-native/src/npc_sim.rs");
    expect(rust).toMatch(/award_titles\.unwrap_or\(0\) as f64 \* 6\.0/);
    expect(rust).toMatch(/award_mvps\.unwrap_or\(0\) as f64 \* 10\.0/);
    // 상한이 없으면 수상이 백분위·OVR을 뒤집는다 — 그건 정본이 바뀌는 것이다
    expect(rust).toMatch(/\.min\(20\.0\)/);
    expect(rust).toMatch(/base \+ ace_bonus \+ tour_adj \+ award_adj \+ scout_adj - injury_pen/);
  });

  it("MVP와 부문상을 구분해 센다", () => {
    const d = read("apps/ui/src/shared/utils/draftSystem.ts");
    expect(d).toMatch(/a\.id === "mvp"\) mvps\+\+; else titles\+\+/);
  });

  it("산식 내역을 결과에 싣는다 — 합만 보면 어느 항이 미는지 못 고친다", () => {
    const rust = read("packages/engine-native/src/npc_sim.rs");
    expect(rust).toMatch(/let breakdown = DraftScoreBreakdown \{/);
    // 미지명 경로에도 실려야 한다 — 못 뽑힌 이유가 제일 알고 싶은 것이다
    expect(rust).toMatch(/drafted: false, round: None, pick: None, team_id: None, breakdown,/);
  });

  it("또래에서 주인공을 뺀다 — 분모에 자기를 넣으면 백분위가 낮게 나온다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/n\.npcId !== p\.id/);
  });
});
