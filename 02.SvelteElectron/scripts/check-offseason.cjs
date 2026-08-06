#!/usr/bin/env node
// 오프시즌 결산이 **화면이 쓸 수 있는 모양으로** 나오는지 본다.
//
//   npm run check:offseason
//
// ⚠ **이 검사가 없어서 소식 화면이 213줄짜리 덤프였다** (2026-08-06):
//   · 엔진이 `format!("{} 방출 (로스터 초과 {league_id})")`로 문장을 조립했다
//     → 화면이 팀 ID를 이름으로 못 바꿔 `LEAGUE_KBL_FARM`·`TEAM_UNIV_ASAN`이
//       사용자에게 그대로 떴다
//   · 213줄 중 99줄이 대학팀 수비 자리 조정이었고, **852명이 은퇴한 사건은
//     맨 아래 한 줄**이었다
//   · 그 213줄이 최근 활동 로그 30칸을 통째로 밀어냈다
//
// 그래서 여기서 세 가지를 못 박는다:
//   ① 개별 사건은 `events`로 나온다 (문자열이 아니라 구조)
//   ② `logs`에 팀·리그 ID가 없다 — 애초에 문장을 안 만든다
//   ③ Rust가 쓰는 `kind`가 화면의 표(`offseasonReport.ts`)에 전부 있다
//      ← **정본이 둘**이 되는 걸 막는다. 한쪽만 늘리면 사건이 조용히 사라진다

const path = require("node:path");
const fs = require("node:fs");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, ok, detail) {
  if (ok) { log(`  ok  ${name}`); return; }
  failed++;
  log(`FAIL  ${name}`);
  if (detail) log(`        ${detail}`);
}

const TEAM = "TEAM_KBL_SEOUL_ROYALS_1";
const FARM = "TEAM_KBL_SEOUL_ROYALS_2";

let seq = 0;
function npc(over = {}) {
  const id = `N${String(seq++).padStart(4, "0")}`;
  return {
    npcId: id, name: `선수${seq}`, playerType: "batter", position: "SS",
    age: 24, schoolId: "", graduationYear: 2020, careerStatus: "active",
    currentLeague: "LEAGUE_KBL", currentTeam: TEAM, militaryStatus: "none",
    developmentRate: 50, careerHistory: [], careerEvents: [], achievements: [],
    batting: {
      ovr: 60, contact: 60, power: 60, eye: 60, discipline: 60, speed: 60,
      baseInstinct: 60, bunting: 60, platoon: 60, fielding: 60, arm: 60,
      battingClutch: 60,
    },
    currentSalary: 30000, contractYears: 2,
    ...over,
  };
}

(async () => {
  await headless.boot("check-offseason");
  const api = globalThis.window.projectB;

  // ⚠ **표본에 기대지 않는다.** 엔진은 `rand::thread_rng()`를 쓰므로 밖에서
  // 시드를 못 준다 — 확률로 나오는 구성을 세면 검사가 실행마다 흔들린다.
  // 실제로 처음엔 은퇴 확률(38세 24%)에 기대다가 실행마다 종류 수가 4→2로
  // 달라졌다. 그래서 **정원 초과로 강제되는 경로**만 본다.
  //
  //   1군 30명 > 상한 20  → 10명이 2군으로 (demote_roster)
  //   2군 30명 > 상한 20  → 더 내릴 곳이 없다 → 방출 (release_roster)
  //   45세 14명           → 은퇴 확률 66%, 전원 생존 확률 1e-7 (retire_age)
  const npcs = [
    ...Array.from({ length: 30 }, () => npc()),
    ...Array.from({ length: 14 }, () => npc({ age: 45 })),
    ...Array.from({ length: 30 }, () => npc({ currentLeague: "LEAGUE_KBL_FARM", currentTeam: FARM })),
    // 포지션 공백 — 2루수가 0명이라 누군가 전환된다
    ...Array.from({ length: 9 }, (_, i) =>
      npc({ currentTeam: FARM, currentLeague: "LEAGUE_KBL_FARM",
            position: ["C", "SS", "CF", "3B", "RF", "LF", "1B", "3B", "3B"][i] })),
  ];

  const params = {
    npcs, pendingDraft: [], seasonYear: 2026, namedNpcIds: [],
    rosterLimits: {
      LEAGUE_KBL:      { rosterMin: 10, rosterMax: 20 },
      LEAGUE_KBL_FARM: { rosterMin: 5,  rosterMax: 20 },
    },
    independentTeamIds: ["TEAM_IND_GOYANG_HEROES"],
    universityTeamIds: [],
    farmTeamIds: [FARM],
  };

  const raw = JSON.parse(await api.engine("runOffseasonNative", JSON.stringify(params)));
  if (raw.error) { log(`FAIL  엔진 오류: ${raw.error}`); process.exit(1); }

  const events = raw.events ?? [];
  const logs = raw.logs ?? [];
  const kinds = [...new Set(events.map((e) => e.kind))].sort();

  log(`오프시즌 결산 검사 — 사건 ${events.length}건 · 종류 ${kinds.length}종 · logs ${logs.length}줄`);
  log(`  종류: ${kinds.join(", ") || "(없음)"}`);

  // ① 구조로 나온다
  check("사건이 events로 나온다", events.length > 0);
  for (const k of ["demote_roster", "release_roster", "retire_age"]) {
    check(`${k}가 나온다`, kinds.includes(k), `나온 종류: ${kinds.join(", ")}`);
  }
  check("사건에 npcId가 있다", events.every((e) => typeof e.npcId === "string" && e.npcId));
  // ⚠ 이름을 담으면 표기가 바뀌어도 소식만 옛 이름으로 남는다
  check("사건에 이름을 담지 않는다", events.every((e) => e.name === undefined));

  // ② logs가 화면을 덮지 않는다
  // ⚠ 요약 한 줄조차 Rust에 두면 안 된다. 한 번 뒀다가 **Rust는 사건을 세고
  // 화면은 사람을 세서** 활동 로그엔 "방출 1170", 화면엔 "방출 45"가 떴다
  // (실측). 요약은 화면과 같은 집계(`offseasonReport.ts`)에서 나온다.
  check("엔진이 문장을 안 만든다 — logs가 비어 있다",
        logs.length === 0, `${logs.length}줄: ${logs[0] ?? ""}`);
  const idLeak = logs.filter((l) => /\b(TEAM|LEAGUE)_[A-Z0-9_]+/.test(l));
  check("logs에 팀·리그 ID가 없다", idLeak.length === 0, idLeak[0]);

  // ③ 정본이 둘이 되지 않는다 — Rust의 kind가 화면 표에 전부 있다
  const src = fs.readFileSync(
    path.join(headless.ROOT, "apps/ui/src/shared/utils/offseasonReport.ts"), "utf8");
  const table = src.slice(src.indexOf("const KIND: Record<OffseasonKind, KindMeta>"));
  const known = new Set([...table.slice(0, table.indexOf("};"))
    .matchAll(/^\s{2}(\w+):\s*\{/gm)].map((m) => m[1]));
  const unknown = kinds.filter((k) => !known.has(k));
  check(`Rust가 쓰는 kind가 화면 표(${known.size}종)에 전부 있다`,
        unknown.length === 0, `표에 없는 종류: ${unknown.join(", ")}`);

  // ④ 보직 변경 — 소식이 아니라 경력에 남는다
  const posEvents = events.filter((e) => e.kind === "position_change");
  const posCareer = (raw.npcs ?? []).flatMap((n) =>
    (n.careerEvents ?? []).filter((e) => e.eventType === "position_change"));
  check("보직 변경이 소식에 안 들어간다 — 사건이 아니라 정합성 보정이다",
        posEvents.length === 0, `${posEvents.length}건이 섞였다`);
  check("보직 변경이 경력에는 남는다 — 왜 자리가 바뀌었는지 찾아볼 수 있어야 한다",
        posCareer.length > 0, "한 건도 안 남았다");
  if (posCareer.length > 0) {
    const e = posCareer[0];
    check("보직 변경에 바뀐 자리가 적혀 있다",
          /^\w+ → \w+$/.test(e.detail ?? ""), `detail=${e.detail}`);
  }

  headless.cleanup();
  log(failed === 0 ? "\n  ok  전부 통과" : `\nFAIL  ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log(`FAIL  ${e.stack || e}`); process.exit(1); });
