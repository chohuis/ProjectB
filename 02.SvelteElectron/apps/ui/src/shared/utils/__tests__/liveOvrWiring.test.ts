import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { liveOvrOf, livePitchingOvrOf } from "../../stores/npcLiveStats";

// ── NPC의 "지금" 능력치는 live에만 있다 ──────────────────────────
//
// 실측(2026-08-09): 같은 투수를 3시즌(191주) 추적했더니
//
//   npcLiveStatsStore   19→22세 OVR +9 · 31→34세 −4   (나이 곡선 정상)
//   npcs[].pitching     9종 전부 정확히 +0            (생성값에 고정)
//
// 그 상태로 **드래프트 전체가 생성값으로 돌았다** — 고교 3학년을 평가하면서
// 사실상 1학년 때 능력치를 봤다. 주인공 백분위도, NPC 지명 순서도 그 위에 있었다.
//
// ⚠ **이 결함은 조용하다.** 값이 있고 타입도 맞아서 예외가 안 난다. 화면엔
// 그럴듯한 숫자가 뜨고, 틀렸다는 신호가 어디에도 없다 — 그래서 배선을
// 코드로 못박는다.

const ROOT = resolve(__dirname, "../../../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const LIVE = {
  P_GROWN: { pitching: { ovr: 70 }, batting: { ovr: 0 } },
  B_GROWN: { pitching: { ovr: 0 }, batting: { ovr: 68 } },
} as any;

describe("liveOvrOf — 성장값을 먼저 본다", () => {
  it("live가 있으면 live를 쓴다", () => {
    const npc = { npcId: "P_GROWN", pitching: { ovr: 52 }, batting: { ovr: 0 } };
    expect(liveOvrOf(npc, LIVE)).toBe(70);
  });

  it("live가 없으면 생성값으로 폴백한다 — 갓 생성된 NPC가 0이 되면 안 된다", () => {
    const npc = { npcId: "NEW", pitching: { ovr: 52 }, batting: { ovr: 0 } };
    expect(liveOvrOf(npc, LIVE)).toBe(52);
  });

  it("투수·타자 블록 중 큰 쪽을 쓴다", () => {
    // ⚠ `??`로 읽으면 타자의 낮은 pitching.ovr이 먼저 잡힌다. 실제로 지명
    // 1순위가 OVR 53으로 미지명 최하위(74)보다 낮게 찍힌 적이 있다
    const bat = { npcId: "B_GROWN", pitching: { ovr: 20 }, batting: { ovr: 40 } };
    expect(liveOvrOf(bat, LIVE)).toBe(68);
  });

  it("livePitchingOvrOf는 투수 블록만 본다 — 포지션이 이미 걸러진 자리용", () => {
    const pit = { npcId: "P_GROWN", pitching: { ovr: 52 } };
    expect(livePitchingOvrOf(pit, LIVE)).toBe(70);
  });

  it("livePitchingOvrOf도 생성값으로 폴백한다 — 갓 생성된 또래가 0이 되면 안 된다", () => {
    // 폴백을 빼면 live가 아직 없는 신입이 전부 0이 되고, `filter(o => o > 0)`이
    // 그들을 통째로 버려서 **또래 분포가 기존 선수만 남는다**.
    // 변이 검증에서 이 구멍이 실제로 안 잡혀서 추가했다
    const fresh = { npcId: "NO_LIVE_YET", pitching: { ovr: 55 } };
    expect(livePitchingOvrOf(fresh, LIVE)).toBe(55);
  });

  it("타자의 live 투수 OVR 0은 0으로 남는다 — 폴백으로 되살리지 않는다", () => {
    // `??`는 0에 폴백하지 않는다. 이게 맞는 동작이다: 타자의 "투수 OVR"은
    // 실제로 0이고, 되살리면 생성값 20이 또래 분포에 섞여 백분위를 낮춘다.
    // 호출부(`peerOvrs`)는 `.filter((o) => o > 0)`으로 이걸 걸러낸다
    const bat = { npcId: "B_GROWN", pitching: { ovr: 20 } };
    expect(livePitchingOvrOf(bat, LIVE)).toBe(0);
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/livePitchingOvrOf\(n, liveStats\)\)\s*\n\s*\.filter\(\(o\) => o > 0\)/);
  });
});

describe("배선 — 드래프트가 생성값을 읽지 않는다", () => {
  // 아래 다섯은 실제로 생성값을 읽고 있던 자리다. **하나라도 옛 형태로
  // 되돌리면 이 검사가 실패해야 한다** — 그래야 검사가 배선을 보는 것이다.

  it("주인공 또래 백분위가 live를 쓴다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(/const peerOvrs = [\s\S]{0,300}livePitchingOvrOf\(n, liveStats\)/);
    // 옛 형태가 남아 있으면 안 된다
    expect(s).not.toMatch(
      /const peerOvrs = [\s\S]{0,300}\.map\(\(n\) => n\.pitching\?\.ovr \?\? 0\)/,
    );
  });

  it("팀 에이스 순위가 live를 쓴다", () => {
    const s = read("apps/ui/src/shared/usecases/advanceWeek.ts");
    expect(s).toMatch(
      /teamAceRank = [\s\S]{0,300}livePitchingOvrOf\(n, liveStats\) > p\.pitching\.ovr/,
    );
  });

  it("NPC 지명 순서 정렬이 live를 쓴다", () => {
    const s = read("apps/ui/src/shared/stores/game.ts");
    expect(s).toMatch(/const ovrOf = \(n: NpcSaveState\) => liveOvrOf\(n, _live\)/);
  });

  it("지명 로그 OVR이 live를 쓴다 — 루프 밖에서 한 번만 읽는다", () => {
    const s = read("apps/ui/src/shared/stores/game.ts");
    // 범위를 넉넉히 둔다 — 사이에 주석·주인공 분기가 들어와도 "루프 밖에서
    // 한 번 읽어 안에서 쓴다"는 성질은 그대로다. 좁게 잡았더니 주인공을
    // 보드에 편입하면서 넣은 몇 줄에 검사가 먼저 깨졌다
    expect(s).toMatch(
      /const _liveForLog = get\(npcLiveStatsStore\);[\s\S]{0,600}liveOvrOf\(npc, _liveForLog\)/,
    );
  });

  it("드래프트 보드 OVR이 live를 쓴다", () => {
    const s = read("apps/ui/src/features/career/ui/DraftBoardModal.svelte");
    expect(s).toMatch(/ovr: liveOvrOf\(npc, \$npcLiveStatsStore\)/);
  });

  it("생성값만 읽던 죽은 헬퍼가 되살아나지 않았다", () => {
    // 남겨 두면 다음에 누가 갖다 써서 같은 결함이 재발한다.
    // 정의가 없어야 하고, 부르는 데도 없어야 한다
    const eng = read("apps/ui/src/shared/utils/npcEngine.ts");
    const drf = read("apps/ui/src/shared/utils/draftSystem.ts");
    expect(eng).not.toMatch(/export function npcCoreOvr/);
    expect(drf).not.toMatch(/export function calcDraftScore/);
  });
});
