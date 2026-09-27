import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { gamePathSrc, gamePathFlat } from "../../../stores/__tests__/gamePathSrc";

/**
 * **스토어에서 나간 덩이의 배선** (`PLAN_103 §3` Ⅱ-2).
 *
 * 🔴 왜 이 검사가 있나. 정의를 옮기고 **부르는 자리를 흘리면** 갈림길 검사는
 *   전부 초록인데 그 처리가 한 번도 안 돈다. A-4(Ⅱ-1)에서 대조군이 잡아낸
 *   것이 바로 그 꼴이라 여기서도 **호출부 수**를 센다.
 *
 * ⚠ 덩이의 **안**은 `gamePathSrc()` 가 덮는다 — `game.ts` 를 글자로 읽던
 *   배선 검사 스물다섯이 그대로 초록이다. 여기는 그 덩이가 **이어져 있는가**만 본다.
 */
const ROOT = resolve(__dirname, "../../../../../../..");
const APPS = resolve(ROOT, "apps");

/** `apps/**` 의 `.ts`·`.svelte` 를 전부 훑는다 (정규식 없음) */
function appSources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (name !== "node_modules") walk(p);
      } else if (name.endsWith(".ts") || name.endsWith(".svelte")) {
        out.push(p);
      }
    }
  };
  walk(APPS);
  return out;
}

/** 그 이름을 `.` 뒤에서 부르는 자리 수 — 정의가 있는 두 파일은 뺀다 */
function callSites(name: string): string[] {
  const needle = "." + name + "(";
  const skip = [join("stores", "game.ts"), join("usecases", "gameStore")];
  return appSources()
    .filter((p) => !skip.some((s) => p.includes(s)))
    .filter((p) => readFileSync(p, "utf8").includes(needle));
}

describe("덩이 1 — NPC 드래프트", () => {
  /**
   * 🔴 **대조군.** 정의만 옮기고 부르는 자리를 흘리면 여기서 잡힌다.
   *   셋: 관전 보드(`DraftBoardModal`) · 배경 진행 · 시즌 롤오버.
   */
  it("호출부 셋이 그대로다 — 옮기기 전과 같은 수", () => {
    const sites = callSites("processNpcDraft");
    expect(sites.length, sites.join("\n")).toBe(3);
  });

  it("store 는 넘기기만 한다 — 덩이 본문이 game.ts 에 안 남았다", () => {
    const store = readFileSync(resolve(ROOT, "apps/ui/src/shared/stores/game.ts"), "utf8");
    expect(store).toContain("processNpcDraftChunk(");
    // 옮긴 본문의 표식 — store 에 남아 있으면 정본이 둘이다
    expect(store.includes("주인공 편입으로 마지막 지명 1건이 미지명이 됐다")).toBe(false);
    expect(store.includes("await applyDraftToNpcs(")).toBe(false);
  });

  /**
   * 갈림길 — 옮기면서 사라지기 쉬운 자리들. `gamePathSrc()` 로 읽으므로
   * 「스토어 어딘가에」 있으면 된다.
   */
  it("갈림길이 다 살아 있다", () => {
    const src = gamePathSrc();
    const flat = gamePathFlat();
    // 같은 해 두 번 돌지 않는다
    expect(src).toContain("는 이미 진행됨 — 건너뛴다");
    // 후보 풀 = 졸업 예정자 + 소속 유지 신청자
    expect(flat).toContain("...s.pendingDraft.filter(");
    // 지명 순서는 전 시즌 성적 역순
    expect(src).toContain("draftOrderOf(");
    // 주인공을 보드에 끼워 넣고 마지막 지명자를 밀어낸다
    expect(src).toContain("displacedNpcId");
    expect(src).toContain("simResult.undraftedIds");
    // 지명을 주인공 경력에 남긴다
    expect(src).toContain('eventType: "draft_picked"');
    // 미지명자가 갈 2군 목록
    expect(src).toContain("farmTeamIds: draftDest.farmIds");
    // 보드 후보 명단에 주인공 줄을 얹는다
    expect(src).toContain("heroRow");
    // 거래 기록 · 로그
    expect(src).toContain("leagueAddTransactions");
    expect(src).toContain("lastDraftYear: year");
  });
});
