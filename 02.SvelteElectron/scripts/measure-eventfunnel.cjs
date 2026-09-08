#!/usr/bin/env node
// 이벤트 깔때기 — **안 뜬 건가, 떴는데 밀려난 건가.**
//
//   npm run measure:eventfunnel
//   node scripts/measure-eventfunnel.cjs --seasons 6 --seed 20260803
//
// `docs/BACKLOG.md` 1-A2가 "이야기 이벤트 87%가 사라진다"고 적었는데, 그 87%는
// **소식함 상한(MAX_MAILBOX)에 밀려난 비율**이다. 그 앞에 깔때기가 하나 더 있다:
//
//   ① 조건 통과      evaluateConditions
//   ② 정책 통과      oncePolicy · cooldown
//   ③ **자리**       conditional은 주당 1건만 · random은 풀 확률(18·22·26%)
//   ④ 소식함 상한    MAX_MAILBOX 200
//
// ③이 아무 데도 안 세어져 있었다. 세 보면 ④를 손대는 게 답인지, ③을 손대는 게
// 답인지가 갈린다 — 상한만 올려도 ③에서 이미 버려진 건 안 돌아온다.
//
// ⚠ **판정이 아니라 계측이다.** 숫자만 찍고 아무것도 안 고친다.
//
// 🔴 **1회 실행으로 전후를 비교하지 마라.** 같은 코드·같은 씨앗·`--nodraft`로
// 세 번 돌린 실측(2026-08-23):
//
//   뜬 종수   141 143 143   폭 ±2
//   밀림      913 963 903   폭 ±60 (6%)
//   재발동%  53.8 52.2 51.9  폭 ±1.9%p
//
// 주차(292)는 세 번 다 같은데 **이벤트 결과가 흔들린다.** 원인은 B 밖이다 —
// `CLAUDE.md` 남은 결함 #1, Rust `thread_rng` 31곳이 유력하다.
//
// 그래서 **이 폭보다 작은 차이는 효과가 아니다.** 실제로 "142 → 143"을 효과로
// 읽고 보고한 적이 있다. 작은 차이를 재려면 `--runs 3`을 쓴다.
//
//   node scripts/measure-eventfunnel.cjs --nodraft --runs 3
//   node scripts/measure-eventfunnel.cjs --nodraft --json   (1회 · 기계용)

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 6);
const SEED = arg("seed", 20260803);
// ⚠ **경로를 고정하지 않으면 전후 비교가 성립하지 않는다.** 지명 여부는 성적에
// 달렸는데 성적은 실행마다 흔들려서, 같은 씨앗인데 한 번은 독립·한 번은 프로로
// 갔다. 단계별 이벤트 정의 수가 독립 60 · pro_kbl 171로 세 배 차이라
// **깔때기 숫자가 통째로 달라진다** — 변경 효과인 줄 알고 읽게 된다.
// `--nodraft`로 드래프트를 끄면 항상 독립으로 가서 두 실행이 같은 세계를 돈다.
const NODRAFT = process.argv.includes("--nodraft");
const JSON_OUT = process.argv.includes("--json");
const RUNS = arg("runs", 1);
/** 자식 프로세스 출력에서 결과 줄을 찾는 표식 — 부팅 로그와 섞이므로 필요하다 */
const MARK = "__FUNNEL_JSON__";

const log = (s) => process.stdout.write(s + "\n");
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : "0.0").padStart(5) + "%";

/** `--runs N` — 자기를 N번 자식으로 띄워 `--json` 결과를 모으고 폭을 찍는다 */
function multiRun() {
  const { spawnSync } = require("node:child_process");
  /**
   * **자식이 왜 죽었는지 그대로 내놓는다** (2026-09-08 · A · L4 실사고).
   *
   * 🔴 왜 있나. 커버리지 하네스가 실패하면 **stdout 마지막 800자만** 찍었다.
   *   그런데 그날의 진짜 오류는 **stderr 에 있었다** —
   *   `[masterStore] load failed  …: 모르는 조건 타입 "outcome_within"`.
   *   화면엔 「출력에 __TIERCOV_JSON__ 가 없다」만 떠서, B 가 단판을 손으로
   *   직접 돌려서야 원인이 보였다. **하루를 태울 수 있는 자리다.**
   *
   * ⚠ **둘 다 낸다.** stderr 만 내면 진행 로그(stdout)가 사라지고, stdout 만 내면
   *   이번 일이 또 난다. 어느 쪽이 비어 있는지도 적는다 — 「비었다」가 신호다.
   * ⚠ 종료 코드·시그널도 적는다. maxBuffer 초과·타임아웃 킬은 출력이 아예 없어
   *   두 통 다 비는데, 그때 코드/시그널이 유일한 단서다.
   */
  function childFailureReport(r, tail = 1500) {
    const out = String(r.stdout || "");
    const err = String(r.stderr || "");
    const lines = [];
    lines.push(`    종료코드 ${r.status ?? "없음"}${r.signal ? ` · 시그널 ${r.signal}` : ""}`
      + (r.error ? ` · 띄우기 실패 ${r.error.message}` : ""));
    lines.push(`    ── stderr (${err.length}자)${err ? "" : " — 비었다"}`);
    if (err) lines.push(err.slice(-tail));
    lines.push(`    ── stdout (${out.length}자)${out ? "" : " — 비었다"}`);
    if (out) lines.push(out.slice(-tail));
    return lines.join(String.fromCharCode(10));
  }

  const base = process.argv.slice(2).filter((a) => a !== "--runs" && a !== String(RUNS));
  const rows = [];
  for (let i = 1; i <= RUNS; i++) {
    const r = spawnSync(process.execPath, [__filename, ...base, "--json"], {
      encoding: "utf8", env: process.env, maxBuffer: 64 * 1024 * 1024,
    });
    const line = String(r.stdout || "").split("\n").find((l) => l.startsWith(MARK));
    if (!line) {
      log(`  회차 ${i} 실패 — 출력에 ${MARK}가 없다`);
      // ⚠ stderr 를 먼저 낸다 — 진짜 오류는 대개 그쪽이다(2026-09-08 실사고)
      log(childFailureReport(r));
      process.exit(1);
    }
    rows.push(JSON.parse(line.slice(MARK.length)));
    log(`  회차 ${i}/${RUNS} 끝`);
  }
  log("");
  log(`── ${RUNS}회 평균과 폭 ─────────────────────────────────────`);
  log("  항목                평균     최소~최대     폭");
  const KEYS = [
    ["주수", "주수"], ["뜬 종수", "뜬종수"], ["밀림", "밀림"],
    ["밀린 규칙 종수", "밀린종수"], ["conditional 발동", "발동"],
    ["처음 뜬 것", "처음뜬"], ["재발동", "재발동"],
  ];
  for (const [label, k] of KEYS) {
    const v = rows.map((r) => r[k]);
    const min = Math.min(...v), max = Math.max(...v);
    const avg = v.reduce((a, b) => a + b, 0) / v.length;
    log(`  ${label.padEnd(18)}${avg.toFixed(1).padStart(7)}${(min + "~" + max).padStart(13)}${String(max - min).padStart(7)}`);
  }
  log("");
  log("  읽는 법 — **폭보다 작은 차이는 효과가 아니다.**");
  log("  회차별 원값: " + JSON.stringify(rows));
}

if (RUNS > 1) { multiRun(); return; }

(async () => {
  if (!JSON_OUT) {
    log("");
    log("── 이벤트 깔때기 ─────────────────────────────────────────");
  }

  let tmp = null;
  try {
    const boot = await headless.boot("evtfunnel");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "EVTF", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: !NODRAFT, university: false, independent: true });
    // 부팅 중에 돈 주차가 있으면 섞인다 — 재기 직전에 비운다
    app.resetEventFunnel();

    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < 12000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      break;
    }

    const f = app.eventFunnelProbe();
    const m = app.mailboxProbe();
    const seasons = app.currentSeason() - start || 1;

    if (JSON_OUT) {
      const c0 = f.conditional;
      log(MARK + JSON.stringify({
        주수: f.주수, 뜬종수: f["뜬 규칙 종수"], 밀림: c0.crowdedOut,
        밀린종수: f["밀린 규칙 종수"], 발동: c0.emitted,
        처음뜬: c0.freshPicked, 재발동: c0.repeatPicked,
        끝내못뜬: f["밀렸고 끝내 못 뜬 규칙"].length,
      }));
      return;
    }

    log(`  씨앗 ${SEED} · ${start}~${app.currentSeason()} (${seasons}시즌) · ${f.주수}주`
      + (NODRAFT ? "  · --nodraft (독립 고정)" : "  ⚠ 경로 미고정 — 전후 비교엔 --nodraft를 써라"));
    log("");

    log(`  엔진 시간 ${f["엔진 시간(ms)"]}ms · 주당 ${f["주당 ms"]}ms — 주 진행 전체는 약 2,300ms/주다`);
    log("");
    log("  ① 갈래별 — 조건 통과 → 발동");
    log("    갈래           조건통과   정책차단   빈메시지     발동    발동/주");
    for (const lane of ["mandatory", "conditional", "random", "grade"]) {
      const r = f[lane];
      const cp = lane === "random" ? r.eligible : r.condPass;
      log(`    ${lane.padEnd(14)}${String(cp).padStart(8)}${String(r.policyBlocked).padStart(11)}`
        + `${String(r.emptyDropped).padStart(11)}${String(r.emitted).padStart(9)}`
        + `${(r.emitted / f.주수).toFixed(2).padStart(11)}`);
    }
    log("");

    // ── 등급 줄기 (2026-09-08 · §1) ───────────────────────────
    log("  ①-2 등급 — 추첨 · 발동 · 상한 · 폴백");
    {
      const t = f.tier;
      log("    등급        추첨     발동   상한막힘   후보0");
      for (const g of ["normal", "rare", "unique", "hidden"]) {
        log(`    ${g.padEnd(12)}${String(t.drawn[g] ?? 0).padStart(4)}`
          + `${String(t.emitted[g] ?? 0).padStart(9)}${String(t.capBlocked[g] ?? 0).padStart(11)}`
          + `${String(t.empty[g] ?? 0).padStart(8)}`);
      }
      log(`    🔴 폴백 ${t.fallback}회 — 0 이 아니면 그 무대·등급에 이야기가 없다는 뜻이다`);
      for (const [k, v] of Object.entries(t.fallbackBy).sort((a, b) => b[1] - a[1]).slice(0, 10)) {
        log(`        ${k.padEnd(24)}${String(v).padStart(6)}`);
      }
      log("    무대별 주 수: " + JSON.stringify(t.weeksByStage));
    }
    log("");

    log("  ② 자리가 없어 밀린 것 (조건·정책 다 통과했는데 안 나갔다)");
    const c = f.conditional;
    log(`    conditional  주당 1건 상한에 밀림  ${String(c.crowdedOut).padStart(6)}건`
      + `  (규칙 ${f["밀린 규칙 종수"]}종)`);
    log(`                 통과분 대비 발동률     ${pct(c.emitted, c.emitted + c.crowdedOut)}`);
    const r = f.random;
    log(`    random       풀 롤 ${r.poolRolls}회 중 통과 ${r.poolPassed}회 (${pct(r.poolPassed, r.poolRolls)})`);
    log("");

    // "새 이야기 우선"이 실제로 도는가. repeat이 크면 뽑을 새 이야기가 동나서
    // 예전처럼 반복물이 칸을 먹는다는 뜻이다 — 그때는 배분이 아니라 상한 문제다
    log("  ②-2 한 바퀴 — 새 이야기 우선이 얼마나 도나");
    const band = c.scarcePicked + c.freshPicked + c.repeatPicked;
    log(`    다시 못 올 것 (once_per_*) ${String(c.scarcePicked).padStart(6)}회   ${pct(c.scarcePicked, band)}`);
    log(`    처음 뜬 반복물             ${String(c.freshPicked).padStart(6)}회   ${pct(c.freshPicked, band)}`);
    log(`    이미 떴던 것 재발동         ${String(c.repeatPicked).padStart(6)}회   ${pct(c.repeatPicked, band)}`
      + `   ← 새 이야기가 동난 주. 상태 경고 지연분이기도 하다`);
    log("");

    log("  ③ 소식함 상한 — 생산된 뒤 밀려난 것");
    log(`    이벤트 발동 ${String(f.발동).padStart(6)}건 · 소식함 전체 밀려남 ${m["밀려남(누계)"]}건`
      + ` · 보유 ${m.보유}/${m.상한}`);
    log("");

    log("  ④ 어느 이야기가 못 뜨는가 (밀린 횟수 상위)");
    for (const row of f["밀린 규칙 상위"]) {
      log(`      ${String(row.규칙).padEnd(38)}${String(row.건수).padStart(6)}`);
    }
    if (f["빈 메시지로 버려진 규칙"].length) {
      log("");
      log("  ⚠ 본문도 선택지도 없어 조용히 버려진 규칙 (트리거만 소비했다)");
      for (const row of f["빈 메시지로 버려진 규칙"]) {
        log(`      ${String(row.규칙).padEnd(38)}${String(row.건수).padStart(6)}`);
      }
    }
    log("");
    log("  ④-2 🔴 진짜 버려진 것 — 후보엔 올랐는데 끝내 못 뜬 규칙");
    // `crowdedOut` 건수(규칙×주차)는 과장이다. repeatable은 다음 주에 또
    // 후보가 되니 **밀린 것이지 버려진 게 아니다.** 정책별로 갈라야 답이 된다:
    //   repeatable   → 다시 온다. 이월 큐로 회복 가능한 몫
    //   once_per_*   → 그 시즌(또는 커리어)이 끝이다. **영구 손실**
    {
      const lost = f["밀렸고 끝내 못 뜬 규칙"];
      const fsx = require("node:fs"), px = require("node:path");
      const walk = (d) => fsx.readdirSync(d, { withFileTypes: true })
        .flatMap((e) => e.isDirectory() ? walk(px.join(d, e.name)) : [px.join(d, e.name)]);
      const policy = {};
      // ⚠ 여기 셋은 **폴더 이름**이다 — 갈래(`grade`)와 다르다. 등급 줄기는
      //   폴더가 없다(세 폴더의 규칙이 `tier` 로 모인다)
      for (const lane of ["mandatory", "conditional", "random"]) {
        for (const p of walk(`resource/data/master/events/${lane}`).filter((x) => x.endsWith(".json"))) {
          const r = JSON.parse(fsx.readFileSync(p, "utf8"));
          policy[r.id] = r.oncePolicy ?? "?";
        }
      }
      const by = {};
      for (const id of lost) { const k = policy[id] ?? "?"; (by[k] ??= []).push(id); }
      log(`    밀린 ${f["밀린 규칙 종수"]}종 중 **끝내 못 뜬 것 ${lost.length}종**`);
      for (const [k, ids] of Object.entries(by).sort((a, b) => b[1].length - a[1].length)) {
        const mark = k === "repeatable" ? "다시 온다 — 이월로 회복 가능" : "**그 시즌이 끝이다 — 영구 손실**";
        log(`      ${k.padEnd(20)}${String(ids.length).padStart(4)}종   ${mark}`);
        log(`        ${ids.slice(0, 6).join(" ")}${ids.length > 6 ? ` 외 ${ids.length - 6}` : ""}`);
      }
    }
    log("");
    log("  ⑤ 정의 대비 도달 — 몇 종이 화면에 닿았나");
    // 정의 수는 _manifest.json이 정본이다 — 여기 리터럴로 적으면 콘텐츠가
    // 늘어도 계측만 옛 기준으로 "다 뜬다"고 찍는다 (mailboxProbe가 밟은 함정)
    const mf = JSON.parse(require("node:fs").readFileSync(
      "resource/data/master/_manifest.json", "utf8"));
    const 정의 = mf.events.mandatory.length + mf.events.conditional.length
      + mf.events.random.media.length + mf.events.random.social.length
      + mf.events.random.team_life.length;
    const 뜬종수 = f["뜬 규칙 종수"];
    log(`    정의 ${정의}종 중 뜬 것 ${뜬종수}종 (${pct(뜬종수, 정의)}) · 한 번도 안 뜬 것 ${정의 - 뜬종수}종`);
    log("    가장 자주 뜬 것");
    for (const row of f["뜬 규칙 상위"]) {
      log(`      ${String(row.규칙).padEnd(38)}${String(row.건수).padStart(6)}`);
    }
    log("");
    log("  읽는 법");
    log("    · ②가 크면 상한(200)을 올려도 안 돌아온다 — 엔진이 애초에 안 내보냈다");
    log("    · ③이 크면 상한 문제다");
    log("    · 둘 다 크면 둘 다다. 어느 쪽을 먼저 손댈지는 비율로 정한다");
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
})();
