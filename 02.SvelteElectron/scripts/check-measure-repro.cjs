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
 * ── ✅ 씨앗 셋 완주 (2026-09-08 · A · 각 1회 · `track/engine` `0be8aab73`) ────
 *
 *   20260802  대학합격3                        3년차 OVR 73  구속 71  완주
 *   777       10R 94P TEAM_KBL_DAEGU_SABERS_1  3년차 OVR 74  구속 70  완주
 *   31337     대학합격2                        3년차 OVR 74  구속 71  완주
 *
 *   ⚠ **등급 가중을 고친 뒤 다시 잰 값** (2026-09-08 저녁 · 2회):
 *       7R 66P TEAM_KBL_BUSAN_WAVES_1 · 3년차 OVR 74 · 구속 73 · **2회 동일 · 완주**
 *       (`weights.rare` 14 → 7 · `dryBoost.rare.max` 30 → 12 · 개막 전 노말만)
 *
 *   ⚠ **위 2026-09-07 표(6R 58P · OVR 75)와 값이 다르다 — 정상이다.** 그 사이에
 *     이벤트가 71개 늘었고(`gen:manifest` 654 → 725) 결정 ⑦⑩⑪ 과 등급 시즌
 *     상한 폐지가 들어갔다. **입력이 바뀌었으니 결과가 바뀌는 것이 맞다.**
 *     이 검사가 지키는 것은 「같은 입력이면 같은 결과」지 「값이 안 변한다」가 아니다.
 *
 * ── 🔴 「정지 2026W32」는 **엔진이 아니라 이 계측이 틀린 것이었다** (2026-09-08 · A)
 *
 *   2026-09-07 에 결정 ⑩⑪ 을 넣은 뒤 씨앗 20260802 이 `완주` 대신
 *   **`정지 2026W32`** 로 섰다. 그때는 「⑩⑪ 이 시뮬을 다른 길로 밀었고 그
 *   길 끝에 주가 안 넘어가는 자리가 있다」고 적었다. **틀렸다.**
 *
 *   재현해서 그 주의 상태를 그대로 찍어 보니(`scripts/probe-a-w32stall.cjs`):
 *
 *     정지 2026W32   stopReason  = 정지: 진로 최종 선택
 *                    pendingKind = draftObserve
 *                    autoAdvance 로그 = 자동 진행 시작 / 처리: injuryTreatment
 *                                       / [정지] 진로 최종 선택
 *
 *   그 주 pending 이 **둘**이었다 — `[injuryTreatment, draftObserve]`.
 *   `runAutoAdvance` 가 앞의 것을 처리하고 뒤의 것에서 **설계대로** 멈춘다
 *   (`draftObserve` 는 `STOP_PENDING` 이다 — 사람이 관전/건너뛰기를 고른다).
 *   주가 안 넘어간 것이 **맞고, 그게 정상이다.**
 *
 *   막힌 것은 `probe-d-dr-worker.cjs` 의 바깥 루프였다. 그 루프는 머리에서
 *   `pendingKind() === "draftObserve"` 만 보는데 그때 머리에 있던 건
 *   `injuryTreatment` 였고, `runOneWeek()` 뒤에 **곧바로** 주가 그대로인 걸
 *   보고 판을 끊었다 — **한 바퀴만 더 돌았으면** `skipDraftObserve()` 로
 *   지나갔다. 실제로 그렇게 고치니 같은 씨앗·같은 트리에서 완주한다.
 *
 *   고친 자리 둘:
 *     · `probe-d-dr-worker.cjs` — **연속으로** 안 움직일 때만 「정지」로 센다
 *       (`scripts/perf/weekLoop.cjs` 의 `makeStallGuard` · 상한 8 · 막는 것을
 *        하나 치울 때마다 셈을 되돌린다. 같은 줄을 베껴 쓰던 검사 여섯도
 *        같은 가드로 고쳤다)
 *     · `runAutoAdvance` — **진짜로 헛도는 자리는 엔진이 먼저 말한다.** 같은
 *       pending 이 50회 돌아오거나 `advanceWeek` 이 50회 연속 주를 안 넘기면
 *       `오류: 주 진행이 막혔다 — 2026W32 · …` 로 멈춘다. 예전엔 1000회를
 *       다 돌고 `최대 반복 횟수 초과` 한 줄만 남겨 **어느 pending 인지도
 *       몇 주차인지도 알 수 없었다.**
 *
 *   ⚠ 그리고 **이 검사가 초록이었던 것 자체가 구멍이었다.** 두 판이 같은
 *     자리에서 같이 멈추면 `keyOf` 비교가 통과한다 — 「멈춘 것이 재현되면
 *     초록」이라는 뜻이다. 이제 `why !== "완주"` 면 재현 여부와 무관하게
 *     빨강이다.
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
const { verdict } = require("./perf/reproVerdict.cjs");

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
    if (r.stopWhy) console.log(`      ↳ ${r.stopWhy}`);
  }

  // 판정은 `perf/reproVerdict.cjs` 가 갖는다 — 회귀가 직접 때리는 자리다
  console.log("");
  const v = verdict(rows);
  for (const l of v.lines) console.log(l);
  if (!v.ok) process.exit(1);
})();
