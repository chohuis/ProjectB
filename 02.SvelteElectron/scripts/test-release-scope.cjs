"use strict";
// 1차 출시 범위 검증 (2026-07-30) — 해외 리그(ABL·JBL) 차단
// 실행: npm run test:releasescope
//
// 정본은 `apps/ui/src/shared/config/releaseScope.ts`.
//
// 확정 사항: **해외는 지우지 않고 막는다.** refs에 팀이 그대로 있고 Rust 규칙도
// 그대로다. 확장팩에서 `OUT_OF_SCOPE_LEAGUES`를 비우면 전부 살아난다.
//
// 이 테스트가 지키는 것:
//  1. 게이트가 실제로 걸려 있는가 (반경·일정·화면 목록)
//  2. **데이터는 지워지지 않았는가** — 확장팩 복원이 가능한 상태인가
//  3. 게이트를 풀면 되살아나는가 (Set을 비운 상태를 흉내내 확인)

const fs = require("node:fs");
const path = require("node:path");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const read = (rel) => fs.readFileSync(path.join(__dirname, rel), "utf8");
const stripComments = (src) => src
  .replace(/<!--[\s\S]*?-->/g, "")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// ── 1. 범위 정의 ──────────────────────────────────────────────
console.log("범위 정의");
const scopeSrc = read("../apps/ui/src/shared/config/releaseScope.ts");
{
  const block = scopeSrc.match(/OUT_OF_SCOPE_LEAGUES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  const out = [...(block?.[1] ?? "").matchAll(/"(LEAGUE_[A-Z_]+)"/g)].map((m) => m[1]);
  console.log(`    범위 밖: ${out.length ? out.join(" ") : "(없음 — 해외 열림)"}`);
  // ⚠ 2026-08-06 에 해외(ABL·JBL)를 열었다(CLAUDE.md) — 두 Set 이 비어 있는 게 정본이다.
  //   예전 단정("ABL·JBL 이 범위 밖")은 확장팩 시절 것이라 2026-09-02 에 뒤집었다.
  //   다시 닫으려면 Set 에 네 리그를 넣는다 — 아래 4절이 그 갈래가 살아 있는지 본다.
  check("해외 리그가 범위 안 (OUT_OF_SCOPE_LEAGUES 비어 있음)", out.length === 0, out.join(","));

  const stages = scopeSrc.match(/OUT_OF_SCOPE_STAGES[^=]*=\s*new Set\(\[([\s\S]*?)\]\)/);
  const st = [...(stages?.[1] ?? "").matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  check("해외 커리어 단계도 범위 안 (OUT_OF_SCOPE_STAGES 비어 있음)", st.length === 0, st.join(","));

  // 국내는 절대 범위 밖이 되면 안 된다 — 오타 하나로 게임이 통째로 빈다
  const domestic = ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT", "LEAGUE_KBL", "LEAGUE_KBL_FARM"];
  const leaked = domestic.filter((l) => out.includes(l));
  check("국내 리그는 범위 안", leaked.length === 0, leaked.join(","));
}

// ── 2. 게이트가 실제로 걸려 있는가 ────────────────────────────
console.log("\n게이트 적용");
{
  const gate = stripComments(read("../apps/ui/src/shared/utils/radiusGate.ts"));
  check("반경 게이트: 범위 밖은 비활성(3)",
    /isLeagueInScope\(leagueId\)\)\s*return 3/.test(gate.replace(/\s+/g, " ").replace(/! /g, "!")),
    "radiusGate에서 isLeagueInScope 분기를 못 찾음");

  const sched = stripComments(read("../apps/ui/src/shared/utils/leagueScheduler.ts"));
  check("일정 생성: 범위 밖 리그 설정을 거른다",
    /DEFAULT_LEAGUE_CONFIGS[\s\S]*?filter\(\(c\) => isLeagueInScope\(c\.leagueId\)\)/.test(sched));

  const teamPage = stripComments(read("../apps/ui/src/pages/team/TeamPage.svelte"));
  // 팀 목록은 언어 반영본(`$teamsL10n`)을 읽는다 — 원본 `$masterStore.teams` 를 읽으면 check:namelocale 이 잡는다
  check("팀 화면: 팀 목록을 범위로 거른다", /inScope\(\$(teamsL10n|masterStore\.teams)\)/.test(teamPage));
  check("팀 화면: 리그 탭을 범위로 거른다", /SCOPED_TABS/.test(teamPage));

  // ⚠ 예전엔 여기서 `LeaguePage.svelte` 안의 `isLeagueInScope(lid)` **개수**를 셌다.
  // 그건 "필터가 이 파일에 있다"를 검사한 것이지 "거른다"를 검사한 게 아니다 —
  // 로직을 `utils/leagueVisibility.ts`로 옮기자 곧바로 깨졌다 (교훈 #6과 같은 형태).
  // 이제 위임을 따라간다: 화면이 그 모듈을 쓰는가 + 그 모듈이 범위로 거르는가.
  const leaguePage = stripComments(read("../apps/ui/src/pages/league/LeaguePage.svelte"));
  const visibility = stripComments(read("../apps/ui/src/shared/utils/leagueVisibility.ts"));
  check("리그 화면: 목록 계산을 leagueVisibility에 위임한다",
    /visibleLeagueIds\(/.test(leaguePage) && /leaderboardLeagueIds\(/.test(leaguePage));
  check("리그 화면: 순위표·리더보드 둘 다 범위로 거른다",
    (visibility.match(/isLeagueInScope\(/g) ?? []).length >= 2,
    "leagueVisibility가 두 함수 모두에서 거르지 않는다");
  check("리그 화면: 거래기록 리그를 범위로 거른다", /scopedLeagueIds\(\[/.test(leaguePage));

  // 실제로 걸러지는지는 정적 검사로 증명할 수 없다 —
  // `npm run scenarios`의 10번(경기가 도는 리그가 화면 목록에 있는가)이
  // 런타임으로 "범위 밖 리그가 목록에 없다"까지 확인한다.
}

// ── 3. 데이터는 지워지지 않았는가 (확장팩 복원 가능성) ────────
//
// 이게 이 테스트의 핵심이다. "안 보이게 한다"와 "지운다"는 다르고,
// 나중에 확장팩을 열 때 되살릴 게 남아 있어야 한다.
console.log("\n확장팩 복원 가능성 (데이터 보존)");
{
  const refs = JSON.parse(read("../resource/data/master/entities/refs.json"));
  const byLeague = {};
  for (const t of refs.teams) byLeague[t.leagueId] = (byLeague[t.leagueId] ?? 0) + 1;
  console.log(`    refs 해외 팀: ABL ${byLeague.LEAGUE_ABL ?? 0} · JBL ${byLeague.LEAGUE_JBL ?? 0}`);
  check("refs에 ABL 팀이 남아 있다", (byLeague.LEAGUE_ABL ?? 0) > 0);
  check("refs에 JBL 팀이 남아 있다", (byLeague.LEAGUE_JBL ?? 0) > 0);

  const rules = JSON.parse(read("../resource/data/master/players/generation_rules.json")).rosterRules;
  check("ABL 로스터 규칙이 남아 있다", !!rules.LEAGUE_ABL);
  check("JBL 로스터 규칙이 남아 있다", !!rules.LEAGUE_JBL);

  const save = read("../apps/ui/src/shared/types/save.ts");
  check("pro_abl/pro_jbl 커리어 단계가 타입에 남아 있다",
    /pro_abl/.test(save) && /pro_jbl/.test(save));

  // 스케줄 설정 항목은 지우지 않고 **런타임에 거른다** — 확장팩에서 필터만 풀면 된다
  const sched = read("../apps/ui/src/shared/utils/leagueScheduler.ts");
  check("스케줄 설정에 ABL·JBL 항목이 남아 있다",
    /leagueId: "LEAGUE_ABL"/.test(sched) && /leagueId: "LEAGUE_JBL"/.test(sched),
    "항목을 지우면 확장팩에서 다시 써야 한다");

  // Rust 쪽도 그대로여야 한다
  const rosterGen = read("../packages/engine-native/src/roster_gen.rs");
  check("Rust league_code에 해외 리그가 남아 있다",
    /"LEAGUE_ABL"\s*=>/.test(rosterGen) && /"LEAGUE_JBL"\s*=>/.test(rosterGen));
}

// ── 4. 게이트를 풀면 되살아나는가 ─────────────────────────────
//
// Set을 비운 상태를 흉내내서, 게이트가 **조건부**인지(하드 삭제가 아닌지) 본다.
console.log("\n게이트 해제 시뮬");
{
  // 해외가 열린 지금은 반대로 본다 — Set 에 네 리그를 **넣어** 평가하면 해외가 범위 밖으로 닫혀야 한다.
  // (게이트가 조건부로 살아 있다는 뜻 · 하드 삭제면 넣어도 안 닫힌다)
  // ⚠ `const ` 로 앵커를 잡는다 — 선언 위 주석에도 같은 이름이 있어서, 이름만으로 잡으면 주석부터
  //   선언까지가 통째로 치환돼 **대입이 주석 안으로 들어간다**(첫 실행에서 "is not defined" 로 죽었다).
  const patched = scopeSrc
    .replace(/const OUT_OF_SCOPE_LEAGUES[^=]*=\s*new Set\(\[[\s\S]*?\]\)/,
      'const OUT_OF_SCOPE_LEAGUES = new Set(["LEAGUE_ABL", "LEAGUE_ABL_FARM", "LEAGUE_JBL", "LEAGUE_JBL_FARM"])')
    .replace(/const OUT_OF_SCOPE_STAGES[^=]*=\s*new Set\(\[[\s\S]*?\]\)/, 'const OUT_OF_SCOPE_STAGES = new Set(["pro_abl", "pro_jbl"])')
    .replace(/export (const|function) /g, "$1 ")
    .replace(/: ReadonlySet<string>/g, "")
    .replace(/<T extends \{ leagueId: string \}>/g, "")
    .replace(/\(items: readonly T\[\]\): T\[\]/g, "(items)")
    .replace(/\(ids: readonly string\[\]\): string\[\]/g, "(ids)")
    .replace(/\(leagueId: string\): boolean/g, "(leagueId)")
    .replace(/\(careerStage: string\): boolean/g, "(careerStage)")
    .replace(/\(x: T\)/g, "(x)");
  let ok = false;
  try {
    // eslint-disable-next-line no-new-func
    ok = new Function(`${patched}; return !isLeagueInScope("LEAGUE_ABL") && !isLeagueInScope("LEAGUE_JBL") && isLeagueInScope("LEAGUE_KBL");`)();
  } catch (e) {
    console.error("    (평가 실패 — 게이트 구조가 바뀌었는지 확인) " + String(e).slice(0, 120));
  }
  check("Set에 넣으면 해외가 닫히고 국내는 남는다 (게이트가 조건부다 · 하드 삭제가 아니다)", ok === true);
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
