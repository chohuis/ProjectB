#!/usr/bin/env node
// 이벤트 깔때기 — **안 뜬 건가, 떴는데 밀려난 건가.**
//
//   npm run measure:eventfunnel
//   node scripts/measure-eventfunnel.cjs --seasons 6 --seed 20260803
//
// `docs/BACKLOG.md` 1-A2가 "이야기 이벤트 87%가 사라진다"고 적었는데, 그 87%는
// **소식함 상한(200)에 밀려난 비율**이다. 그 앞에 깔때기가 하나 더 있다:
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

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 6);
const SEED = arg("seed", 20260803);

const log = (s) => process.stdout.write(s + "\n");
const pct = (a, b) => (b ? (a / b * 100).toFixed(1) : "0.0").padStart(5) + "%";

(async () => {
  log("");
  log("── 이벤트 깔때기 ─────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("evtfunnel");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "EVTF", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });
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

    log(`  씨앗 ${SEED} · ${start}~${app.currentSeason()} (${seasons}시즌) · ${f.주수}주`);
    log("");

    log("  ① 갈래별 — 조건 통과 → 발동");
    log("    갈래           조건통과   정책차단   빈메시지     발동    발동/주");
    for (const lane of ["mandatory", "conditional", "random"]) {
      const r = f[lane];
      const cp = lane === "random" ? r.eligible : r.condPass;
      log(`    ${lane.padEnd(14)}${String(cp).padStart(8)}${String(r.policyBlocked).padStart(11)}`
        + `${String(r.emptyDropped).padStart(11)}${String(r.emitted).padStart(9)}`
        + `${(r.emitted / f.주수).toFixed(2).padStart(11)}`);
    }
    log("");

    log("  ② 자리가 없어 밀린 것 (조건·정책 다 통과했는데 안 나갔다)");
    const c = f.conditional;
    log(`    conditional  주당 1건 상한에 밀림  ${String(c.crowdedOut).padStart(6)}건`
      + `  (${Object.keys({}).length ? "" : ""}규칙 ${f["밀린 규칙 종수"]}종)`);
    log(`                 통과분 대비 발동률     ${pct(c.emitted, c.emitted + c.crowdedOut)}`);
    const r = f.random;
    log(`    random       풀 롤 ${r.poolRolls}회 중 통과 ${r.poolPassed}회 (${pct(r.poolPassed, r.poolRolls)})`);
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
