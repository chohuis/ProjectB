import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { flattenSrc } from "./flattenSrc";
import { toEngineProtagonistPitcher } from "../protagonistPitcher";
import type { ProtagonistSave } from "../../types/save";

/**
 * **자동 진행과 수동 경기가 같은 주인공을 엔진에 넘기는가** (2026-09-30).
 *
 * 🔴 왜 있나 (`SIM_103_CLUTCH_PLATOON_2026-09-28.md §4-1`). 결정 ⑫ 로
 *   `handedness` 칸이 엔진·NPC 양쪽에 섰는데 **주인공 페이로드는 세 자리에
 *   손으로 적혀 있었고 셋 다 안 받았다** — 자동 진행(`runAutoAdvance`) ·
 *   수동 경기의 진입 전 시뮬(`MainPage`) · 한 구씩 던지는 경기(`MatchPage`
 *   둘). 그래서 **좌완 주인공에게 좌우 상성이 아예 안 걸렸다.**
 *
 * ⚠ **칸이 아니라 표를 고쳤다.** 한 줄씩 세 군데 넣으면 다음 칸에서 또 갈린다 —
 *   이 저장소가 「배선이 반만」으로 반복해 겪은 형태다. 정본은
 *   `utils/protagonistPitcher.ts` 하나고, 여기서 **호출부가 그걸 쓰는지**와
 *   **옛 표가 남아 있지 않은지**를 같이 본다(대조군).
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => flattenSrc(readFileSync(resolve(ROOT, p), "utf8"));

const base = (handedness?: string): ProtagonistSave =>
  ({
    name: "주인공",
    ...(handedness === undefined ? {} : { handedness }),
    pitching: {
      ovr: 60,
      stamina: 61,
      velocity: 62,
      command: 63,
      control: 64,
      movement: 65,
      mentality: 66,
      recovery: 67,
      clutch: 68,
      holdRunners: 69,
    },
  }) as unknown as ProtagonistSave;

/** 주인공 투수 페이로드를 엔진에 넘기는 파일 셋 — 자리로는 넷이다(`MatchPage` 둘) */
const CALLERS = [
  "apps/ui/src/shared/usecases/runAutoAdvance.ts",
  "apps/ui/src/pages/main/MainPage.svelte",
  "apps/ui/src/pages/match/MatchPage.svelte",
];

describe("주인공 투수 페이로드 정본", () => {
  it("여덟 개 + 던지는 손을 다 담는다 — 칸 이름이 엔진 것과 같다", () => {
    expect(toEngineProtagonistPitcher(base("L"))).toEqual({
      name: "주인공",
      command: 63,
      velocity: 62,
      staminaCap: 61,
      mentalResil: 66,
      control: 64,
      movement: 65,
      clutch: 68,
      holdRunners: 69,
      handedness: "L",
    });
  });

  it("🔴 손을 그대로 넘긴다 — 좌투·양투가 우투로 눌리면 상성이 안 걸린다", () => {
    expect(toEngineProtagonistPitcher(base("R")).handedness).toBe("R");
    expect(toEngineProtagonistPitcher(base("L")).handedness).toBe("L");
    expect(toEngineProtagonistPitcher(base("S")).handedness).toBe("S");
  });

  it("옛 세이브에 칸이 없으면 R 이다 — slot.db 기본값과 같은 값", () => {
    expect(toEngineProtagonistPitcher(base()).handedness).toBe("R");
  });

  it("🔴 자동·수동이 **같은 함수**를 쓴다 — 갈리면 같은 경기에서 값이 다르다", () => {
    for (const f of CALLERS) {
      expect(read(f), `${f} 가 정본을 안 쓴다`).toContain("toEngineProtagonistPitcher(");
    }
  });

  /**
   * 대조군 — 옛 표가 남아 있으면 정본이 둘이다. 한 자리라도 손으로 적혀
   * 있으면 다음 칸에서 또 갈린다.
   */
  it("🔴 대조군 — 호출부에 손으로 적은 표가 안 남아 있다", () => {
    for (const f of CALLERS) {
      const src = read(f);
      expect(src, `${f} 에 옛 표가 남았다`).not.toContain("holdRunners: p.pitching.holdRunners");
      expect(src, `${f} 에 옛 표가 남았다`).not.toContain("mentalResil: p.pitching.mentality");
      // `pitcherStats` 는 화면 표시용 호환 객체다 — **엔진 페이로드로는 안 쓴다**
      // (`handedness` 칸이 없어 조용히 우투가 된다)
      expect(src, `${f} 가 표시용 객체를 엔진에 넘긴다`).not.toContain(
        "pitcher: player.pitcherStats",
      );
      expect(src, `${f} 가 표시용 객체를 엔진에 넘긴다`).not.toContain(
        "pitcher: { ...player.pitcherStats",
      );
    }
  });

  /**
   * 대조군 둘째 — **정본이 실제로 손을 읽는가.** 함수가 `handedness` 를
   * 안 담으면 위 「같은 함수를 쓴다」가 초록인 채로 셋 다 우투가 된다.
   */
  it("🔴 대조군 — 정본에서 손을 빼면 페이로드에 칸이 없다", () => {
    const keys = Object.keys(toEngineProtagonistPitcher(base("L")));
    expect(keys).toContain("handedness");
    expect(keys.length).toBe(10);
  });
});
