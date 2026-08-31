import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 구종별·이닝별 기록 — 1단계 ②③ (2026-08-30).
 *
 * 🔴 `decision.pitch_type` 이 **매 투구에 있는데 아무도 안 셌다.** 투수
 *   상세에 구종 목록은 뜨는데 **실제로 뭘 던졌는지는 알 수 없었다.**
 *
 * 🔴 이닝별도 없어서 **6이닝 3실점이 "고르게"인지 "한 이닝에 몰아서"인지**
 *   구분이 안 됐다.
 *
 * ⚠ 두 경로가 다르다 — 지어내지 않는다:
 *   구종  주인공 경기만 (배경 리그는 타석 단위라 `pitch_type` 이 없다)
 *   이닝  주인공 경기만 (배경 720경기 × 9이닝이면 세이브가 커진다)
 */
const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("구종별 배선", () => {
  const ty = read("packages/engine-native/src/types.rs");
  const me = read("packages/engine-native/src/match_engine.rs");
  const st = read("packages/engine-native/src/sim_types.rs");

  it("① 구조체가 있다", () => {
    expect(ty.includes("pub struct PitchMixLine {")).toBe(true);
    expect(ty.includes("pub pitch_mix: std::collections::HashMap<String, PitchMixLine>,")).toBe(true);
  });

  it("🔴 ② 매 투구에 센다", () => {
    expect(me.includes("let key = format!(\"{:?}\", decision.pitch_type).to_lowercase();")).toBe(true);
    expect(me.includes("                    m.pc += 1;")).toBe(true);
  });

  it("삼진과 안타를 구종에 단다 — 결정구가 뭔지 보인다", () => {
    expect(me.includes("                        | PitchResultCode::StrikeoutLook => m.k += 1,")).toBe(true);
    expect(me.includes("                            => m.h += 1,")).toBe(true);
  });

  it("③ 결과 줄에 실린다", () => {
    expect(st.includes("        pitch_mix: std::collections::HashMap<String, crate::types::PitchMixLine>,")).toBe(true);
    expect(me.includes("                pitch_mix: l.pitch_mix.clone(),")).toBe(true);
  });

  it("🔴 배경 리그는 빈 맵이다 — 지어내지 않는다", () => {
    // 타석 단위 시뮬이라 `pitch_type` 이 없다(실측: npc_sim 에 0건).
    // 지어내면 주인공 기록과 다른 척도가 된다.
    const npc = read("packages/engine-native/src/npc_sim.rs");
    expect(npc.includes("            pitch_mix: Default::default(),")).toBe(true);
    // ⚠ **주석을 세면 안 된다** — 이 검사가 방금 쓴 주석의 "pitch_type" 을
    //   세서 거짓 실패했다. **호출을 본다.**
    // ⚠ 정규식도 안 쓴다 — 셸을 거치면 이스케이프가 깨진다(그렇게 한 번 깨졌다).
    const npcCode = npc
      .split("\n")
      .filter((ln) => !ln.trimStart().startsWith("//"))
      .join("\n");
    expect(npcCode.includes("decision.pitch_type"), "배경 리그는 구종을 안 정한다").toBe(false);
  });

  it("안 던진 구종은 안 실린다 — 배열이 아니라 맵이다", () => {
    // 10종을 배열로 두면 대부분 0인 칸이 매 경기 로그에 쌓인다
    expect(ty.includes("HashMap<String, PitchMixLine>")).toBe(true);
  });
});

describe("이닝별 배선", () => {
  const ty = read("packages/engine-native/src/types.rs");
  const me = read("packages/engine-native/src/match_engine.rs");
  const npc = read("packages/engine-native/src/npc_sim.rs");

  it("① 구조체가 있다", () => {
    expect(ty.includes("pub struct InningLine {")).toBe(true);
    expect(ty.includes("pub by_inning: Vec<InningLine>,")).toBe(true);
  });

  it("🔴 ② 투구 시점의 이닝에 쌓는다", () => {
    // `next_state` 는 3아웃이면 이미 다음 이닝이다
    expect(me.includes("                    let inn = state.inning as i32;")).toBe(true);
    expect(me.includes("                    slot.pc += 1;")).toBe(true);
  });

  it("배경 리그는 안 채운다 — 볼 화면이 없고 세이브만 커진다", () => {
    expect(npc.includes("            by_inning: vec![],")).toBe(true);
  });
});

describe("화면", () => {
  const status = read("apps/ui/src/pages/status/StatusPage.svelte");
  const career = read("apps/ui/src/shared/usecases/seasonCareerRecord.ts");
  const save = read("apps/ui/src/shared/types/save.ts");

  it("🔴 등판 기록에 싣는다 — 두 곳 다", () => {
    // 같은 모양을 두 곳에서 만든다. 한쪽만 채우면 합집합 타입이 돼
    // 화면이 그 칸을 못 읽는다(svelte-check 가 잡았다)
    expect(career.includes("        pitchMix: line.pitchMix,")).toBe(true);
    expect(status.includes("            pitchMix: line.pitchMix,")).toBe(true);
  });

  it("타입에 칸이 있다", () => {
    expect(save.includes("  pitchMix?: Record<string, { pc: number; k: number; h: number }>;")).toBe(true);
  });

  it("표에 주무기가 보인다", () => {
    expect(status.includes("<th>투구수</th><th>주무기</th>")).toBe(true);
    expect(status.includes('<td class="mix-cell">{mixLabel(g.pitchMix)}</td>')).toBe(true);
  });

  it("구종 이름이 엔진 키와 짝이다", () => {
    // 엔진은 소문자 키를 쓴다 — 어긋나면 키가 그대로 뜬다
    expect(status.includes("fastball: \"직구\", sinker: \"싱커\", cutter: \"커터\", slider: \"슬라\",")).toBe(true);
  });

  it("구종이 없으면 —다", () => {
    // 배경 리그 경기가 그렇다
    expect(status.includes("    if (!mix) return \"—\";")).toBe(true);
  });
});
