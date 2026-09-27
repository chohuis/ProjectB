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

describe("덩이 2 — 전 리그 시즌 종료", () => {
  /** 🔴 **대조군.** 둘: 진로 결정(군 전역 뒤 시즌 열기) · 시즌 롤오버. */
  it("호출부 둘이 그대로다 — 옮기기 전과 같은 수", () => {
    const sites = callSites("processAllLeaguesSeasonEnd");
    expect(sites.length, sites.join("\n")).toBe(2);
  });

  it("store 는 넘기기만 한다 — 덩이 본문이 game.ts 에 안 남았다", () => {
    const store = readFileSync(resolve(ROOT, "apps/ui/src/shared/stores/game.ts"), "utf8");
    expect(store).toContain("processAllLeaguesSeasonEndChunk(");
    // 옮긴 본문의 표식 — store 에 남아 있으면 정본이 둘이다
    expect(store.includes("await runOffseasonProcessing(")).toBe(false);
    expect(store.includes("sportsVacatingPositions")).toBe(false);
    expect(store.includes("beforeMilitary")).toBe(false);
  });

  /**
   * 갈림길 — 이 덩이가 조용히 꺼지면 오프시즌이 통째로 안 돈다. 옮기면서
   * 빠지기 쉬운 「안 넘기면 Rust 가 조용히 기본값으로 가는」 인자들을 센다.
   */
  it("갈림길이 다 살아 있다", () => {
    const src = gamePathSrc();
    const flat = gamePathFlat();
    // 오프시즌 본체
    expect(src).toContain("runOffseasonProcessing(");
    // 안 넘기면 웨이버가 통째로 꺼진다
    expect(src).toContain("waiverRules");
    // FA 상한을 예산에서 낸다
    expect(flat).toContain("teamPayrollCap: cap,");
    // 그해 성적 → 방출 판정
    expect(src).toContain("calcNpcPerfScore");
    // 상무 — 주인공이 뽑힌 해엔 NPC 정원에서 한 자리를 뺀다
    expect(src).toContain("protagonistTookSportsSlot");
    // 상무 Phase 1 — 결원 목록을 넘긴다(2026-08-28 에 고친 자리)
    expect(src).toContain("sportsVacatingPositions");
    // 전·후 스냅샷으로 FA·병역 변화를 잡는다
    expect(src).toContain("beforeTeam");
    expect(src).toContain("beforeMilitary");
    // 소식함은 store 의 합치기를 그대로 쓴다(정본 하나)
    expect(src).toContain("pushMailbox(");
  });
});

describe("덩이 3 — 계약·FA·트레이드", () => {
  /**
   * 🔴 **대조군.** 열한 함수 전부 호출부가 있어야 한다. 하나라도 0 이면
   *   그 갈래가 이제 아무도 안 부르는 것이고, store 에서 나가는 길에
   *   위임자를 흘렸다는 뜻이다.
   */
  it("열한 함수의 호출부가 다 살아 있다", () => {
    const names = [
      "signContract",
      "setPendingNextContract",
      "applyPendingNextContract",
      "applyTradeTransfer",
      "markIncentivesSettled",
      "applySeasonContractProgress",
      "incrementFaNegotiationRound",
      "incrementFaUnsignedWeek",
      "resetFaProgress",
      "advanceTradeAdaptationWeek",
      "applyOptionResult",
    ];
    const dead = names.filter((n) => callSites(n).length === 0);
    expect(dead, "호출부가 0인 함수").toEqual([]);
  });

  it("store 는 넘기기만 한다 — 덩이 본문이 game.ts 에 안 남았다", () => {
    const store = readFileSync(resolve(ROOT, "apps/ui/src/shared/stores/game.ts"), "utf8");
    expect(store).toContain("contracts.signContract(");
    // 계약을 실제로 적는 자리는 이제 하나다 — store 에 남으면 정본이 둘이다
    expect(store.includes("shiftContract(")).toBe(false);
    expect(store.includes("incentiveKey(")).toBe(false);
  });

  /**
   * 🔴 연차를 팀 이동으로 0 으로 되돌리던 결함이 되살아나지 않게.
   *   `proServiceYearReset` 검사와 같은 자리를 여기서도 본다 — 그쪽은
   *   `gamePathSrc()` 로 읽으므로 이 덩이를 함께 본다.
   */
  it("갈림길이 다 살아 있다", () => {
    const src = gamePathSrc();
    const flat = gamePathFlat();
    // 팀이 바뀌어도 연차는 유지된다
    expect(flat).toContain("proServiceYears: s.protagonist.proServiceYears,");
    expect(src.includes("proServiceYears: isNewTeam ? 0")).toBe(false);
    // 예약 계약은 W52 까지 옛 계약을 밀지 않는다
    expect(flat).toContain("shiftContract(undefined, contract, stamp)");
    // 트레이드 적응 3주
    expect(flat).toContain("tradeAdaptationWeeks: 3,");
    // 인센티브 중복 지급을 막는 열쇠
    expect(src).toContain("incentiveKey(i)");
    // 계약이 바뀌면 호환 객체를 다시 만든다
    expect(src).toContain("toPlayerCompat(protagonist)");
  });
});

describe("덩이 4 — 병역", () => {
  /** 🔴 **대조군.** 열한 함수 전부 호출부가 있어야 한다. */
  it("열한 함수의 호출부가 다 살아 있다", () => {
    const names = [
      "grantMilitaryExemption",
      "addMilitaryDeferPenalty",
      "setSportsUnitApplied",
      "markSportsUnitPrompted",
      "markMilitaryAsked",
      "enlistMilitary",
      "applyMilitaryDischarge",
      "setMilitaryLife",
      "advanceMilitaryWeek",
      "completeMilitaryService",
      "advanceMilitaryRecoveryWeek",
    ];
    const dead = names.filter((n) => callSites(n).length === 0);
    expect(dead, "호출부가 0인 함수").toEqual([]);
  });

  it("store 는 넘기기만 한다 — 덩이 본문이 game.ts 에 안 남았다", () => {
    const store = readFileSync(resolve(ROOT, "apps/ui/src/shared/stores/game.ts"), "utf8");
    expect(store).toContain("military.enlistMilitary(");
    // 병역 상태를 실제로 적는 자리는 이제 하나다
    expect(store.includes('militaryStatus: "현역"')).toBe(false);
    expect(store.includes('militaryStatus: "군필"')).toBe(false);
    expect(store.includes("militaryHiatusStage: now.careerStage")).toBe(false);
  });

  it("갈림길이 다 살아 있다", () => {
    const src = gamePathSrc();
    const flat = gamePathFlat();
    // 🔴 미필만 입대한다 — 화면 가드만 두면 헤드리스가 통과해 복무를 세 번 한다
    expect(flat).toContain('if (now.militaryStatus !== "미필") return s;');
    // 입대하면 소속 리그도 군으로
    expect(src).toContain('leagueId: "LEAGUE_MILITARY"');
    // 전역해도 학교로는 안 돌아간다
    expect(flat).toContain('hiatus === "highschool" || hiatus === "university" ? null : hiatus');
    // 다녀온 부대는 남긴다
    expect(src).toContain("militaryServedUnit");
    // 회복 주 — 상무 2 · 현역 6
    expect(flat).toContain('militaryRecoveryWeeks: p.militaryUnit === "sports" ? 2 : 6,');
    // 면제는 미필만 · 주인공도 커리어에 남긴다
    expect(src).toContain('eventType: "military_exempt"');
    // 유효한 계약만 복무 기간만큼 연장
    expect(flat).toContain("now.contract.remainingYears + 2");
  });
});
