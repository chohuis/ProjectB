import { describe, it, expect } from "vitest";
import { makeSaveGame, type SaveGame } from "../../types/save";
import { deriveProfileFromBudgetIndex } from "../game";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * 구단 성향이 **저장 왕복을 탄다.**
 *
 * 🔴 예전엔 `gameStore.proTeamProfiles`에 "비저장"이라고 적혀 있었다.
 * 시즌 종료마다 `calc_win_now_pressure_update`로 갱신하는데 **앱을 껐다 켜면
 * 전부 50으로 돌아갔다** — 성적 압박 모델 전체가 세션 한정이었다.
 * 승강 임계값(`10.0 - win_now_pressure * 0.05`) · 방출 판정(`× 1.3`) ·
 * FA 입찰이 그 값을 쓴다.
 *
 * `CLAUDE.md`의 "가드는 반드시 저장한다"와 같은 형태다 — 갱신 결과는 영구인데
 * 값 자신이 세션 한정이면 없던 일이 된다.
 *
 * ⚠ **저장과 복원을 둘 다 본다.** 저장만 하고 `fromSaveGame`이 안 읽으면
 * 아무 일도 안 일어나는데, 그건 오류가 아니라 "조용히 예전 동작"으로 나타난다.
 */

const P = {
  protagonist: {},
  mailbox: [],
  trainingPlan: {},
  schoolState: {},
  achievements: [],
  achievementMetrics: {},
  recentLogs: [],
  recentUpcoming: [],
  npcs: [],
} as never;

describe("구단 성향 저장", () => {
  it("makeSaveGame이 성향을 싣는다", () => {
    const profiles = { TEAM_KBL_A_1: { winNowPressure: 82, stability: 40 } };
    const save = makeSaveGame(
      P as never,
      [],
      {} as never,
      {} as never,
      [],
      {} as never,
      [],
      [],
      [],
      undefined,
      { proTeamProfiles: profiles },
    ) as SaveGame;
    expect(save.proTeamProfiles, "저장 blob에 성향이 없다").toBeTruthy();
    expect(
      (save.proTeamProfiles as Record<string, { winNowPressure: number }>).TEAM_KBL_A_1
        .winNowPressure,
    ).toBe(82);
  });

  it("성향을 안 넘기면 필드가 비어 있다 — 대조군", () => {
    // 이 검사가 없으면 위 검사가 "항상 통과"일 수 있다
    const save = makeSaveGame(
      P as never,
      [],
      {} as never,
      {} as never,
      [],
      {} as never,
      [],
      [],
      [],
      undefined,
      {},
    ) as SaveGame;
    expect(save.proTeamProfiles).toBeUndefined();
  });

  /**
   * 🔴 **파생된 기질 셋도 왕복을 타야 한다** (2026-09-22). 철학·자원에서
   *   나온 값이라 "다시 구하면 되지"로 보이지만, 시즌마다
   *   `updateProTeamProfiles` 가 갱신하므로 **파생값은 시작점일 뿐**이다.
   *   안 실리면 껐다 켤 때마다 그 갱신이 사라진다.
   */
  it("성향에서 나온 기질 셋이 왕복을 탄다", () => {
    const derived = deriveProfileFromBudgetIndex(1.0, {
      philosophy: "스파르타(혹독훈련)",
      resource: "알뜰",
    });
    // 대조군 — 셋이 50이면 "왕복했다"를 기본값과 못 가른다
    expect(derived.stability).not.toBe(50);
    expect(derived.discipline).not.toBe(50);
    expect(derived.clubhouseCulture).not.toBe(50);

    const save = makeSaveGame(
      P as never,
      [],
      {} as never,
      {} as never,
      [],
      {} as never,
      [],
      [],
      [],
      undefined,
      { proTeamProfiles: { TEAM_KBL_A_1: derived } },
    ) as SaveGame;
    const back = (save.proTeamProfiles as Record<string, typeof derived>).TEAM_KBL_A_1;
    expect(back).toEqual(derived);
  });

  it("복원 경로가 저장된 값을 읽는다 — 소스 확인", () => {
    // ⚠ 소스를 훑는 검사라 배선까지는 못 본다. 다만 `fromSaveGame`이
    // `saved.proTeamProfiles`를 아예 안 읽으면 여기서 잡힌다
    const src = readFileSync(join(__dirname, "../game.ts"), "utf8");
    expect(src, "fromSaveGame이 저장된 성향을 안 읽는다").toContain("saved.proTeamProfiles");
    expect(src, "toSaveGame이 성향을 안 싣는다").toContain("proTeamProfiles: s.proTeamProfiles");
  });
});

/**
 * **옛 세이브를 어떻게 읽나 — 정책 하나** (2026-09-22 · 2단계 ③).
 *
 * `refs.json`의 손수 `proTeamProfile` 16팀(+2군 16)을 지우고 파생으로 통일하면서
 * 물음이 하나 남았다: **이미 저장된 세이브에 그 손수 값이 들어 있으면 읽는 쪽이
 * 파생으로 덮나, 그대로 두나.**
 *
 * 🔴 **그대로 둔다** — 세이브가 이긴다. 시즌마다 `updateProTeamProfiles`가
 *   성적으로 갱신하므로 저장된 값은 "파생 시작점 + 여러 시즌의 갱신"이다.
 *   덮으면 구단 개성이 로드할 때마다 초기화된다. 손수 값이냐 파생 값이냐는
 *   저장된 뒤에는 **구분할 수도 없고 구분할 필요도 없다.**
 *
 *   세이브에 **없는 팀만** 파생으로 채운다. 한 문장이 두 경우를 다 덮는다.
 *
 * ⚠ 실측(2026-09-22): 테스터 원본 `saves/slot3_slot_1.db`(09-05)는 블롭에
 *   `proTeamProfiles` 칸 **자체가 없다** — 저장 기능보다 오래된 세이브다.
 *   그래서 "손수 값이 남은 세이브"는 이 저장소에 실물이 없고, 규칙만 못 박는다.
 */
describe("옛 세이브의 성향 — 세이브가 이긴다", () => {
  const src = readFileSync(join(__dirname, "../game.ts"), "utf8");

  it("빈 자리만 파생으로 채운다 — 있는 값은 안 덮는다", () => {
    expect(src, "`?? {}` 로 떨어지면 옛 세이브가 전 팀 50이 된다").toContain(
      "proTeamProfiles:  mergeSavedProfiles(saved.proTeamProfiles),",
    );
    expect(src, "덮지 않는 규칙(`!out[id]`)이 없다").toContain(
      "for (const [id, p] of Object.entries(profilesFromMaster())) if (!out[id]) out[id] = p;",
    );
  });

  it("`initProTeamProfiles`도 같은 규칙이다 — 두 자리가 어긋나면 안 된다", () => {
    expect(src).toContain("for (const [id, p] of Object.entries(profilesFromMaster())) {");
    expect(src).toContain("if (!map[id]) map[id] = p;");
  });

  /**
   * 🔴 **정본이 하나인지**를 여기서 못 박는다. 마스터(`refs.json`)에 성향
   *   12항목을 다시 적으면 잣대가 둘이 되고, 그러면 파생 규칙을 고쳐도
   *   그 팀만 안 따라온다 — 2026-09-22 전에 ABL 이 그랬다.
   */
  it("마스터에 12항목을 다시 적지 않았다", () => {
    const refs = JSON.parse(
      readFileSync(
        join(__dirname, "../../../../../../resource/data/master/entities/refs.json"),
        "utf8",
      ),
    ) as { teams: { id: string; proTeamProfile?: unknown }[] };
    const back = refs.teams.filter((t) => t.proTeamProfile).map((t) => t.id);
    expect(back, `손수 성향이 되살아난 팀: ${back.slice(0, 8).join(" ")}`).toEqual([]);
  });

  it("타입에도 칸이 없다 — 있으면 '적어도 된다'가 된다", () => {
    const master = readFileSync(join(__dirname, "../master.ts"), "utf8");
    expect(master).not.toContain("  proTeamProfile?: ProTeamProfile;");
  });

  /**
   * 🔴 **정본이 넷이 아니라 다섯이었다** (2026-09-22 · 계획 §5-6 b).
   *   `resource/data/master/teams/pro_usa/*.json` 16개에 같은 12항목이
   *   **또 한 벌** 있었다. 게임은 이 파일들을 한 번도 안 읽는다 —
   *   `_manifest.json` 에 `teams/` 가 없어 런타임 로드 대상이 아니다.
   *
   * ⚠ `teams/` 아래를 통째로 본다. `pro_korea` 8팀에도 12항목이 남아 있지만
   *   그쪽 `teamId` 는 Phase 5 ID 교체 뒤 `refs.json` 에 **하나도 없는**
   *   죽은 팀이라 성격이 다르다 — 지울지는 사용자가 정한다(보고에 적었다).
   *   그래서 여기서는 **살아 있는 팀의 파일만** 본다.
   */
  it("`master/teams/` 의 살아 있는 팀에 12항목이 다시 안 생겼다", () => {
    const teamsRoot = join(__dirname, "../../../../../../resource/data/master/teams");
    const refs = JSON.parse(
      readFileSync(
        join(__dirname, "../../../../../../resource/data/master/entities/refs.json"),
        "utf8",
      ),
    ) as { teams: { id: string }[] };
    const alive = new Set(refs.teams.map((t) => t.id));
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        const p = join(d, e.name);
        if (e.isDirectory()) {
          walk(p);
          continue;
        }
        if (!e.name.endsWith(".json")) continue;
        const j = JSON.parse(readFileSync(p, "utf8")) as { teamId?: string; teamProfile?: unknown };
        if (j.teamProfile && j.teamId && alive.has(j.teamId)) bad.push(`${e.name}(${j.teamId})`);
      }
    };
    walk(teamsRoot);
    expect(bad, `성향 12항목이 되살아난 파일: ${bad.slice(0, 6).join(" ")}`).toEqual([]);
  });
});
