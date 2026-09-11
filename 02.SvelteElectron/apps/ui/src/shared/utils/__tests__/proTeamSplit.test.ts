import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { ALL_TEAMS_BY_LEAGUE } from "../leagueScheduler";

/**
 * 🔴 **`masterStore.teams` 를 `leagueId` 로 거르면 1군과 2군이 같이 딸려온다.**
 *
 * refs 에서 KBL 은 `_1`(1군 10팀)과 `_2`(2군 10팀)가 **같은 `leagueId`** 를
 * 쓴다. 리그 id 에는 1군/2군 구분이 없고 **팀 id 접미사가 사실상 정본**이다.
 *
 * ```
 *   ✗  teams.filter(t => t.leagueId === "LEAGUE_KBL")        20팀
 *   ○  ALL_TEAMS_BY_LEAGUE["LEAGUE_KBL"]                     10팀
 *   ○  teams.filter(t => t.leagueId === base && t.id.endsWith("_1"))
 * ```
 *
 * ## 이 함정은 **두 번 났다**
 *
 * `proSeason.ts:40` 이 이걸 주석으로 경고하고 고쳤는데,
 * `seasonRollover.ts:685` 는 **안 고쳐진 채로 남아 있었다.**
 * 재계약으로 시즌을 여는 경로라 프로 커리어 2년차부터 걸린다:
 *
 * ```
 *   실측(씨앗 20260803 · 9시즌 · 트랙 B)
 *     순위표팀수  최소 0 · 최대 **20** · 평균 13
 *     → PRO_TEAM_TOP3(lte 3)가 **20팀 중 3위**를 요구했다
 *       문턱은 10팀 감각으로 쓰였는데 모수가 두 배다
 * ```
 *
 * ⚠ **주석은 그 자리를 보는 사람에게만 말한다.** 그래서 검사로 바꾼다.
 */

const ROOT = resolve(__dirname, "../../.."); // apps/ui/src

/** 근거가 본체 주석에 적힌 면제 — 프로 1군 목록이 아닌 자리 */
const EXEMPT = ["shared/usecases/tournaments.ts", "shared/usecases/devScenarios.ts"];

/** `.ts`/`.svelte` 전부 — 한 폴더만 보면 다음 자리를 놓친다 */
function sources(): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.(ts|svelte)$/.test(e.name)) continue;
      if (e.name.endsWith(".test.ts")) continue;
      out.push({
        path: p.slice(ROOT.length + 1).replace(/\\/g, "/"),
        // 주석을 걷는다 — 왜 고쳤는지를 적으면 그 안의 옛 코드가 걸린다.
        //
        // ⚠ **줄 수를 유지한다.** 처음엔 그냥 지웠더니 여러 줄 주석만큼
        //   줄이 당겨져 **보고하는 줄 번호가 원본과 어긋났다**(실측:
        //   `slotLifecycleV3.ts:445` 라 찍혔는데 그 줄은 무관한 코드였다).
        //   검사가 위치를 틀리게 말하면 고치는 사람이 그 자리를 못 찾는다.
        body: readFileSync(p, "utf8")
          .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
          .replace(/^(\s*)\/\/.*$/gm, "$1"),
      });
    }
  };
  walk(ROOT);
  return out;
}

describe("1군/2군이 같은 leagueId 를 쓴다 — 팀 목록을 리그로만 거르지 마라", () => {
  it("대조군: 편성이 실제로 갈려 있다", () => {
    const first = ALL_TEAMS_BY_LEAGUE.LEAGUE_KBL ?? [];
    const farm = ALL_TEAMS_BY_LEAGUE.LEAGUE_KBL_FARM ?? [];
    expect(first.length).toBeGreaterThan(0);
    expect(farm.length).toBeGreaterThan(0);
    // 이게 이 검사의 전제다 — 접미사가 갈림선이다
    expect(
      first.every((id) => id.endsWith("_1")),
      "LEAGUE_KBL 에 _2 가 섞였다",
    ).toBe(true);
    expect(
      farm.every((id) => id.endsWith("_2")),
      "LEAGUE_KBL_FARM 에 _1 이 섞였다",
    ).toBe(true);
  });

  it("파일을 실제로 읽었다", () => {
    // 0건이면 아래 검사가 공회전한다
    expect(sources().length).toBeGreaterThan(100);
  });

  /**
   * 🔴 **본체.** 프로 리그 팀 목록을 만들면서 접미사를 안 보는 자리를 잡는다.
   *
   * ⚠ 아래 셋은 **결함이 아니다** — 목록에 두고 이유를 적는다:
   *   · `ALL_TEAMS_BY_LEAGUE` 를 먼저 보고 폴백으로 쓰는 자리
   *   · `_1`/`_2` 를 같은 줄에서 명시하는 자리
   *   · 아마추어 리그(고교·대학·독립)는 2군이 없다
   */
  it("프로 리그 팀 목록이 1군/2군을 가른다", () => {
    const PRO = ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"];
    const bad: string[] = [];
    for (const { path, body } of sources()) {
      const lines = body.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (!line.includes("leagueId ===")) continue;
        if (!line.includes("filter")) continue;
        // 🔴 **팀 목록을 만드는 자리만 본다.** 처음엔 `filter` + `leagueId` 만
        //   봤더니 대회·생존단계·구장 편성까지 걸렸다(전부 팀이 아니다).
        //   거르는 **대상 이름에 `team` 이 들어가는지**로 좁힌다.
        //
        // ⚠ **줄 단위로 보면 안 된다** — 실제 결함이 이 모양이었다:
        //
        // ```
        //   const proTeamIds = get(masterStore).teams        ← `teams` 는 여기
        //     .filter((t) => t.leagueId === pending.leagueId) ← `filter` 는 여기
        // ```
        //
        //   처음에 줄 하나만 보게 짰더니 **변이 검증에서 안 잡혔다.**
        //   앞 두 줄까지 이어 붙여 본다.
        const chain = lines.slice(Math.max(0, i - 2), i + 1).join(" ");
        if (!/[Tt]eams?\b[\s\S]{0,80}\.filter/.test(chain)) continue;
        // 그 줄이 프로 리그를 가리키나 — 리터럴이거나 변수로 받은 리그 id
        // ⚠ **면제 근거는 아래로 더 멀리 있을 수 있다.** 실제 코드가
        //   `.filter(리그)` 다음에 줄바꿈·주석을 끼고 `.filter(접미사)` 를
        //   이어 붙인다 — ±3줄이면 그 두 번째 필터를 놓쳐 오탐이 났다.
        //
        // ⚠ **위로도 멀다.** 거르는 **대상**이 이미 `_1` 로 좁혀진 경우가
        //   있다(`market.ts` — `proTeams` 를 9줄 위에서 만든다).
        //   앞을 12줄까지 본다.
        const nearby = lines.slice(Math.max(0, i - 12), i + 7).join("\n");
        // 🔴 **접두사 목록을 박아 두면 다음 자리를 놓친다** (2026-09-02).
        //
        // 예전엔 `(pending\.|p\.|action\.)?` 였다. 그래서 세 번째 자리를
        // **그대로 통과시켰다** — 거기 변수 이름이 `me` 였다:
        //
        // ```
        //   const teamIds = get(masterStore).teams
        //     .filter((t) => t.leagueId === me.leagueId)   ← `me.` 가 목록에 없다
        // ```
        //
        // 검사를 만든 이유가 "주석은 그 자리를 보는 사람에게만 말한다" 였는데,
        // **검사도 자기가 아는 이름에게만 말하고 있었다.**
        // 오른쪽이 무엇이든 `…leagueId` 로 끝나면 리그끼리 견주는 것이다.
        const touchesPro =
          PRO.some((l) => nearby.includes(l)) ||
          /leagueId\s*===\s*(?:[\w$]+\.)*leagueId\b/.test(line);
        if (!touchesPro) continue;
        // 면제 셋
        if (nearby.includes("ALL_TEAMS_BY_LEAGUE")) continue;
        // ⚠ 접미사를 **어떤 모양으로든** 보고 있으면 면제한다. 처음엔
        //   `endsWith("_1")` 만 봤는데 실제 코드는
        //   `endsWith(isFarm ? "_2" : "_1")` 이라 안 걸러졌다(오탐 하나).
        if (/endsWith\([^)]*"_[12]"/.test(nearby)) continue;
        // ⚠ **아마추어 전용이라고 이름에 적은 것**은 면제한다. 대학·독립·고교는
        //   2군이 없어서 리그로만 걸러도 맞다. 이름에 안 적혀 있으면 다음
        //   사람이 프로에도 쓰므로 **면제 조건을 이름에 건다.**
        if (/[Aa]mateur/.test(nearby)) continue;
        // ⚠ **근거를 적은 면제만 둔다** (2026-09-02). 접두사 목록을 넓히면서
        //   프로와 무관한 자리가 셋 걸렸다. 각각 왜 아닌지 실측으로 확인했다:
        //
        //   tournaments.ts   대회 정의는 **고교 5 · 대학 3 뿐**이다
        //                    (`seeds/onepitch/tournaments.csv` — 프로 대회 0건).
        //                    아마추어엔 2군이 없다
        //   devScenarios.ts  팀 목록을 만드는 게 아니라 **소속을 확인하는
        //                    진단**이다. 2군 주인공이면 2군이 들어와야 맞다
        //
        // ⚠ 여기 추가하려면 **왜 프로 1군 목록이 아닌지**를 적어라.
        //   못 적으면 결함이다.
        if (EXEMPT.some((e) => path.endsWith(e))) continue;
        bad.push(`${path}:${i + 1}  ${line.trim().slice(0, 90)}`);
      }
    }
    expect(
      bad,
      "프로 팀 목록을 `leagueId` 로만 걸렀다 — 1군+2군 20팀이 된다.\n" +
        "`ALL_TEAMS_BY_LEAGUE` 를 쓰거나 `_1`/`_2` 를 명시해라",
    ).toEqual([]);
  });
});
