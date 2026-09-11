import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공 지명 산식은 하나여야 한다 ────────────────────────────
//
// `run_draft_board`(Rust)에 **두 번째 주인공 산식**이 살아 있었다:
//
//   let combined = scout*0.6 + ovr*0.4;
//   let target_pick = (108.0 - combined) / 2.2;          // 폐기된 절대식
//   let team_slot = if r % 2 == 1 { t } else { n-1-t };  // 스네이크
//
// 둘 다 지금 정본과 다르다. 절대식은 상대평가(`determine_protagonist_draft`)로
// 바뀌었고, 지명 순서는 10팀 정순이다(`pickInRound` 주석이 못박고 있다).
// 호출부가 사라진 뒤에도 남아 있어서 **살아 있는 규칙처럼 보였다.**
//
// 이 저장소에서 "정본이 둘"은 반복해서 나왔고 매번 화면과 데이터가 어긋났다.
// 그래서 **지워진 상태를 검사로 잠근다** — 되살아나면 여기가 먼저 깨진다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("드래프트 보드 — 정본 하나", () => {
  const rust = read("packages/engine-native/src/npc_sim.rs");
  const lib = read("packages/engine-native/src/lib.rs");
  const types = read("packages/engine-native/src/sim_types.rs");
  const ts = read("apps/ui/src/shared/utils/draftSystem.ts");

  it("Rust에 두 번째 주인공 산식이 없다", () => {
    expect(rust).not.toMatch(/pub fn run_draft_board\(/);
    // 절대식의 지문 — 이름을 바꿔 되살려도 이 상수는 남는다
    expect(rust).not.toMatch(/108\.0 - combined/);
    expect(rust).not.toMatch(/protagonist_scout_score/);
  });

  it("지명 순서에 스네이크가 없다", () => {
    // `pickInRound`가 "엔진은 10팀 정순"을 전제로 순번을 되돌린다.
    // 스네이크가 살아 있으면 화면의 라운드 내 순위가 통째로 어긋난다
    expect(rust).not.toMatch(/n_teams - 1 - t/);
  });

  it("napi export와 preload 브릿지가 없다", () => {
    expect(lib).not.toMatch(/run_draft_board_native/);
    expect(read("apps/desktop/preload.cjs")).not.toMatch(/draftRunBoard/);
    expect(read("apps/ui/src/shared/types/projectb.d.ts")).not.toMatch(/draftRunBoard/);
  });

  it("전용 타입이 남아 있지 않다", () => {
    expect(types).not.toMatch(/pub struct DraftBoardParams/);
    expect(types).not.toMatch(/pub struct DraftBoardResult/);
    expect(ts).not.toMatch(/export async function runDraftBoard\(/);
    expect(ts).not.toMatch(/export interface DraftBoardResult/);
  });

  it("살아 있는 쪽은 그대로다 — 보드는 실제 결과를 재생한다", () => {
    // ⚠ TS의 `DraftBoardPick`은 **이름만 같은 다른 것**이다.
    // `processNpcDraft`가 남긴 지명 로그를 화면이 읽는 타입이라 지우면 안 된다
    expect(ts).toMatch(/export interface DraftBoardPick/);
    expect(ts).toMatch(/export interface DraftBoardBackgroundResult/);
    const modal = read("apps/ui/src/features/career/ui/DraftBoardModal.svelte");
    expect(modal).toMatch(/careerDraftPickLog/);
  });

  it("주인공 지명 산식은 determine_protagonist_draft 하나다", () => {
    expect((rust.match(/pub fn determine_protagonist_draft/g) ?? []).length).toBe(1);
  });

  it("제거 이유가 코드에 남아 있다", () => {
    // 근거 없이 지우면 다음 사람이 "왜 없지" 하고 되살린다
    expect(rust).toMatch(/run_draft_board 제거됨/);
    expect(types).toMatch(/드래프트 보드 타입 제거됨/);
  });

  it("index.d.ts가 실제로 재생성됐다", () => {
    // `build:native`가 자동 생성한다 — 안 돌렸으면 죽은 export가 남는다
    const dts = resolve(ROOT, "packages/engine-native/index.d.ts");
    if (!existsSync(dts)) return; // 빌드 전 환경에서는 건너뛴다
    expect(readFileSync(dts, "utf8")).not.toMatch(/runDraftBoardNative/);
  });
});
