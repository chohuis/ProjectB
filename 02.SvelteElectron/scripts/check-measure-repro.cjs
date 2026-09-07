"use strict";
/**
 * 재발 방지 검사 — **계측 모드에서 같은 판을 두 번 돌리면 같은 결과가 나오는가.**
 *
 * 🔴 왜 있나 (2026-09-07). 같은 씨앗·프리셋·훈련으로 고교 3년 → 드래프트를
 * 세 번 돌렸더니 **2R11P → 10R91P → 5R47P** 였다(`BALANCE_BASELINE_101.md §2`).
 * 원인은 주인공 경기 호출부가 씨앗을 안 넘겨 Rust 가 `thread_rng` 로 떨어진
 * 것이었다 — 리그 경기(`gameSimulator.ts`)만 씨앗을 받고 있었다.
 * 그 상태에서는 **밸런스 전후를 잴 수가 없다**(1.0.1 계획 전체의 전제).
 *
 * ⚠ **실제 플레이는 지금도 매번 다르다.** 게임 전체 결정성은 목표가 아니다
 *   (`CLAUDE.md`). 씨앗은 계측 모드(`headless.boot()` 의 `__PB_MEASURE__`)에서만
 *   붙는다 — 이 검사가 보는 것도 그 모드다.
 *
 * ⚠ **판마다 새 프로세스**다. `headless.boot()` 이 여는 `main.cjs` 가 require
 *   캐시를 타서 같은 프로세스 두 번째 부팅이 첫 판 상태를 들고 있다
 *   (`probe-d-dr-worker.cjs` 머리말).
 *
 * 느려서(판당 ~10분) `test:v3` 밖에 둔다:
 *   npm run check:measurerepro
 *   PB_REPRO_RUNS=3 PF_SEED=20260802 PB_START_PRESET=balanced npm run check:measurerepro
 *
 * ── ✅ 초록이다 (2026-09-07 · 3회 실측) ────────────────────────────────────
 *
 *   1  6R 58P TEAM_KBL_SUWON_KNIGHTS_1   3년차 OVR 75  구속 76  완주
 *   2  6R 58P TEAM_KBL_SUWON_KNIGHTS_1   3년차 OVR 75  구속 76  완주
 *   3  6R 58P TEAM_KBL_SUWON_KNIGHTS_1   3년차 OVR 75  구속 76  완주
 *
 * 여기까지 온 길 — **두 종류**였다.
 *
 * ① 씨앗을 안 넘긴 호출부 (다섯)
 *    · 주인공 경기 (`protagonistMatchSeed.ts`)
 *    · `weekRollRandomBatch` 둘 (`advanceWeek.ts`)
 *    · 비주인공 포스트시즌 (`postseasonEngine.ts` — 엔진엔 자리가 있었다)
 *    · 트레이드 메디컬 (`weekPhases/market.ts` — 트레이드 넷 중 여기만)
 *    · 군 복무 주간 (`advanceWeek.ts`)
 *
 * ② **Rust `HashMap` 순회 순서** — 이쪽이 마지막까지 남아 있던 것이다.
 *    씨앗을 다 채워도 배경 NPC 한 명이 3~4주째에 1 어긋났고 **갈리는 주가
 *    판마다 옮겨 다녔다**. 씨앗 없는 난수면 자리가 고정돼야 하니 아니었다 —
 *    `HashMap` 은 프로세스마다 다른 씨앗으로 순회한다(`RandomState`).
 *      · `generate_all_league_schedules` → `leagueSchedules` 키 순서 →
 *        `injuries.ts` 의 `players[]` 순서 → **다치는 사람이 바뀐다**
 *      · 배경 리그 `player_lines` 를 `pit_map`/`bat_map` 순회로 만들었다
 *      · FA 입찰이 `teams.values()` 를 돌며 **팀마다 난수를 하나씩** 썼다
 *    전부 `BTreeMap`/`BTreeSet` 으로 고정했다(값은 안 바뀐다).
 *    자리를 좁힌 계기는 `probe:a:diverge` 와 `probe:a:growthreq` 다.
 */
const path = require("node:path");
const { spawn } = require("node:child_process");

const RUNS   = Number(process.env.PB_REPRO_RUNS || 2);
const SEED   = process.env.PF_SEED || "20260802";
const PRESET = process.env.PB_START_PRESET || "balanced";

function runOne(i) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(process.cwd(), "scripts/probe-d-dr-worker.cjs")], {
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", PB_START_PRESET: PRESET, PF_SEED: SEED },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    const timer = setTimeout(() => child.kill(), 1_200_000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split("\n").find((l) => l.startsWith("RESULT "));
      if (!line) { resolve({ run: i, fail: "RESULT 못 읽음", raw: out.slice(-1500) }); return; }
      resolve({ run: i, ...JSON.parse(line.slice("RESULT ".length)) });
    });
  });
}

/** 비교하는 값 — 진로 결말과 3년차 능력치. 여기가 같으면 3년이 같게 흘렀다는 뜻이다 */
function keyOf(r) {
  return JSON.stringify({
    지명: r.지명 ?? null, 대학합격: r.대학합격 ?? null, 독립합격: r.독립합격 ?? null,
    병역: r.병역 ?? null, ovr: r.ovr ?? null, velocity: r.velocity ?? null, why: r.why ?? null,
  });
}

(async () => {
  const rows = [];
  for (let i = 1; i <= RUNS; i++) {
    process.stdout.write(`  [시작] ${i}/${RUNS} ${PRESET} 씨앗${SEED}\n`);
    const r = await runOne(i);
    rows.push(r);
    process.stdout.write(`  [끝]   ${i}/${RUNS} → ${r.fail ?? r.why}\n`);
  }

  console.log("");
  console.log("── 계측 모드 재현 검사 ──");
  console.log("회차  결과                              3년차OVR  구속  진행상태");
  for (const r of rows) {
    if (r.fail) { console.log(`${String(r.run).padEnd(6)}실패: ${r.fail}`); if (r.raw) console.log(r.raw); continue; }
    const outcome = (r.지명 && r.지명 !== "미지명") ? r.지명
      : (r.대학합격 ? `대학합격${r.대학합격}` : (r.독립합격 ? `독립합격${r.독립합격}` : "미지명"));
    console.log(`${String(r.run).padEnd(6)}${String(outcome).padEnd(34)}${String(r.ovr).padStart(8)}  ${String(r.velocity).padStart(4)}  ${r.why}`);
  }

  const keys = rows.map(keyOf);
  const same = keys.every((k) => k === keys[0]);
  console.log("");
  if (rows.some((r) => r.fail)) { console.log("❌ 판이 안 끝났다 — 재현 여부를 못 가린다"); process.exit(1); }
  if (!same) {
    console.log(`❌ ${RUNS}회가 안 같다 — 아직 씨앗 밖의 난수가 남아 있다`);
    keys.forEach((k, i) => console.log(`   ${i + 1}: ${k}`));
    process.exit(1);
  }
  console.log(`✅ ${RUNS}회 전부 같다 — ${keys[0]}`);
})();
