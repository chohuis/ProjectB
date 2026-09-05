// 은퇴자 **좁은 읽기**가 Rust 계약을 깨는지 본다 (2026-09-05).
//
// 실사용자 세이브가 여기서 죽었다:
//   Error: [engine-native] advanceAllGradesNative: missing field `militaryStatus`
//   parseResult → advanceAllGrades → processSeasonEnd → runWorldSeasonEnd
//   → acceptDraftOffer → pushCareerForward   (드래프트 수락을 누른 순간)
//
// 사슬은 이랬다:
//   `slotdb.getAllNpcs`가 은퇴자를 **칼럼을 골라** 읽는다(36%가 은퇴자라 블롭이
//   무겁다). 그 목록에 `military_status`가 없었다 → `mapNpcRow`가
//   `militaryStatus: undefined`로 둔다 → `JSON.stringify`가 **키째 뺀다** →
//   Rust `NpcSaveState.military_status`는 `String`(옵션 아님)이라 던진다.
//   실측: 8,427명 중 869명(은퇴자 전원)이 그랬다.
//
// ⚠ **소스 문자열을 뒤지지 않는다.** 칼럼 목록은 `slotdb.cjs`가 SQL을 만들 때
//   쓰는 **그 배열**을 그대로 가져오고, 계약은 **진짜 Rust 바이너리**에
//   넣어 본다. 둘 중 하나만 고쳐지면 여기서 걸린다.
import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { repoNpcToSaveState } from "../npcAdapter";
import type { RepoNpc } from "../slotRepo";

const require_ = createRequire(import.meta.url);
const HERE = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const ROOT = resolve(HERE, "../../../../../..");

const slotdb = require_(resolve(ROOT, "apps/desktop/ipc/slotdb.cjs")) as {
  RETIRED_NPC_COLUMNS: string[];
  mapNpcRow: (r: Record<string, unknown>) => RepoNpc;
};

// napi 모듈은 Node-API라 electron 없이도 열린다
const native = require_(resolve(ROOT, "packages/engine-native/index.js")) as {
  advanceAllGradesNative: (json: string) => string;
};

/** `npc` 테이블 한 행 — 은퇴자 좁은 읽기가 실제로 돌려주는 모양 그대로 */
function retiredRow(): Record<string, unknown> {
  const all: Record<string, unknown> = {
    npc_id: "PLY_HS26_HS_AEWOL_005", name: "김민수", name_en: null, is_named: 0,
    player_type: "pitcher", position: "SP", handedness: "R", jersey_number: 5,
    age: 20, grade: null, school_id: "", graduation_year: 2027, nationality: "KOR",
    career_status: "retired", current_league: "LEAGUE_RETIRED", current_team: "",
    pro_service_years: 0, salary: 0, contract_years: 0,
    military_status: "미필", military_json: null,
    development_rate: 61, potential_hidden: 80,
  };
  // **SELECT 목록에 있는 칼럼만** 남긴다 — 목록에서 빠지면 여기서도 사라진다
  const row: Record<string, unknown> = {};
  for (const c of slotdb.RETIRED_NPC_COLUMNS) row[c] = all[c];
  return row;
}

describe("은퇴자 좁은 읽기 ↔ Rust NpcSaveState 계약", () => {
  it("좁게 읽은 은퇴자를 advanceAllGradesNative가 받는다", () => {
    const npc = repoNpcToSaveState(slotdb.mapNpcRow(retiredRow()));
    // 스토어 → IPC 는 늘 JSON.stringify 를 거친다. `undefined`가 키째 빠지는
    // 그 지점을 반드시 통과시켜야 결함이 재현된다
    const payload = JSON.stringify({ npcs: [npc], seasonYear: 2028 });
    const out = JSON.parse(native.advanceAllGradesNative(payload)) as { error?: string };
    expect(out.error, `Rust가 거부했다: ${out.error}`).toBeUndefined();
  });

  it("militaryStatus를 실제로 싣는다 — 폴백에 기대지 않는다", () => {
    // Rust 쪽에도 기본값(「미필」)을 뒀지만, 그건 **이미 나간 세이브**용 안전망이다.
    // 읽는 쪽이 값을 안 실으면 36세 KBL 은퇴자가 전부 「미필」이 된다
    // (실사용자 세이브 실측: 은퇴자 869명 전원이 그랬다).
    const npc = repoNpcToSaveState(slotdb.mapNpcRow(retiredRow()));
    expect(npc.militaryStatus).toBe("미필");
    expect(npc.developmentRate).toBe(61);
  });

  it("`militaryStatus`가 빠진 옛 세이브도 Rust가 받아 준다", () => {
    // 이미 나간 세이브에는 이 값이 없다 — 여기서 죽으면 그 세이브는 못 연다
    const npc = repoNpcToSaveState(slotdb.mapNpcRow(retiredRow())) as unknown as Record<string, unknown>;
    delete npc.militaryStatus;
    delete npc.developmentRate;
    const out = JSON.parse(
      native.advanceAllGradesNative(JSON.stringify({ npcs: [npc], seasonYear: 2028 })),
    ) as { error?: string; updated?: Array<{ militaryStatus?: string; developmentRate?: number }> };
    expect(out.error, `Rust가 거부했다: ${out.error}`).toBeUndefined();
    // 폴백 근거: `generation_rules.json` pastService.undecidedBelow = 26
    //   (25세 이하 전원 미필) · `slotdb.npcToInsertParams`의 `?? "미필"`과 같다
    const back = (out.updated ?? [])[0];
    expect(back?.militaryStatus).toBe("미필");
    expect(back?.developmentRate).toBe(50);
  });
});
