import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ── 주인공은 NPC와 같은 판 위에 있다 ────────────────────────────
//
// 예전엔 아니었다. 지명 여부는 `determine_protagonist_draft`가 따로 정하고,
// 보드는 NPC 110명으로 이미 꽉 차 있었다. 화면(`DraftBoardModal`)이
// `slice(0,at) + 주인공 + slice(at)`으로 **끼워 넣기만** 했고 누구도
// 밀려나지 않았다:
//
//   · 행이 111개가 되고 주인공이 뽑은 번호만 두 줄로 뜬다
//   · 마지막 번호 자리는 빈다  (실측: 56 두 줄 · 111 없음)
//   · 그 자리를 이미 가진 NPC도 그대로 지명 처리된다
//
// 게다가 Rust가 팀(`t_idx`)과 슬롯(`p_idx`)을 **따로 굴려서**, "6라운드
// 3순위 · A팀"이라 떠도 그 라운드 3순위의 실제 주인은 다른 팀이었다.
//
// 이제 `processNpcDraft`가 실제 순번에 편입하고 뒤를 한 칸씩 민다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

describe("주인공 드래프트 좌석", () => {
  const store = read("apps/ui/src/shared/stores/game.ts");
  const rust = read("packages/engine-native/src/npc_sim.rs");
  const modal = read("apps/ui/src/features/career/ui/DraftBoardModal.svelte");
  const ds = read("apps/ui/src/shared/utils/draftSystem.ts");

  it("팀과 순번을 따로 굴리지 않는다", () => {
    // 슬롯 하나만 뽑고 팀은 그 자리의 주인이어야 한다
    expect(rust).not.toMatch(/let t_idx\s+=/);
    expect(rust).toMatch(
      /let slot = \(rng\.next\(\) \* teams\.len\(\) as f64\) as usize % teams\.len\(\)/,
    );
    expect(rust).toMatch(/team_id: Some\(teams\[slot\]\.clone\(\)\)/);
  });

  it("지명 순서 정본이 하나다 — 주인공도 같은 순서를 받는다", () => {
    // 이 계산이 `processNpcDraft` 안에만 있어서 주인공 쪽은 알파벳순
    // 기본값(`KBL_TEAM_IDS`)을 받았다. 순번은 맞는데 주인이 달랐다
    expect(ds).toMatch(/export function draftOrderOf\(/);
    expect(store).toMatch(/const draftOrder = draftOrderOf\(/);
    const aw = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(aw).toMatch(/draftOrderOf\(get\(seasonStore\)\.prevSeasonKblStandings \?\? \[\]\)/);
  });

  it("편입하면 한 명이 밀려난다 — 좌석 수는 고정이다", () => {
    expect(store).toMatch(/simResult\.picks\.pop\(\)/);
    expect(store).toMatch(/simResult\.picks\.splice\(at, 0, \{/);
  });

  it("밀려난 사람이 미지명 경로를 탄다", () => {
    // `picks`에도 `undraftedIds`에도 없으면 KBL로도 안 가고 진로 배정도
    // 안 탄다 — 어디에도 안 속한 채 원 소속에 남는다. 조용한 결함이다
    expect(store).toMatch(
      /simResult\.undraftedIds = \[\.\.\.simResult\.undraftedIds, displacedNpcId\]/,
    );
  });

  it("번호를 다시 매긴다 — 밀린 뒤 자리가 한 칸씩 어긋난다", () => {
    expect(store).toMatch(/pick: i \+ 1,/);
    expect(store).toMatch(/round: Math\.floor\(i \/ perRound\) \+ 1,/);
    expect(store).toMatch(/teamId: draftOrder\[i % perRound\],/);
  });

  it("주인공의 최종 순번·팀은 보드가 정한 값이다", () => {
    // 산식이 낸 값과 다를 수 있다(앞사람이 밀렸다). 화면·계약이 읽는 건
    // 보드 결과여야 한다 — 두 값이 갈리면 통보 창과 보드가 어긋난다
    expect(store).toMatch(
      /draftRound: mine\.round, draftPick: mine\.pick, draftTeamId: mine\.teamId/,
    );
  });

  it("화면은 더 이상 끼워 넣지 않는다 — 이중 편입 방지", () => {
    expect(modal).not.toMatch(/boardPicks\.slice\(0, at\)/);
    expect(modal).not.toMatch(/rows\.unshift\(/);
  });

  it("보드가 로그의 isUser를 그대로 읽는다", () => {
    // 예전엔 항상 false로 만들어서 화면이 주인공을 따로 끼워 넣어야 했고,
    // 그게 픽번호 중복의 시작이었다
    expect(store).toMatch(/isUser: pick\.npcId === s\.protagonist\.id/);
    expect(modal).toMatch(/isUser: r\.isUser === true/);
  });

  it("주인공이 후보 명단에서 빠지지 않는다", () => {
    // `npcInfoMap`엔 주인공이 없어 `filter(!!n)`이 그 줄을 떨어뜨린다 —
    // 보드 후보가 지명자보다 한 명 모자라게 된다
    expect(store).toMatch(
      /p\.npcId === s\.protagonist\.id \? heroRow : npcInfoMap\.get\(p\.npcId\)/,
    );
  });

  it("로그에 주인공 이름·OVR이 제대로 찍힌다", () => {
    // 조회가 빗나가면 이름 자리에 `PLY_HERO`가 찍히고 OVR이 0으로 남는다
    expect(store).toMatch(/const isHero = pick\.npcId === s\.protagonist\.id/);
    expect(store).toMatch(/isHero \? s\.protagonist\.pitching\.ovr/);
  });
});
