#!/usr/bin/env node
// 관계도가 실제로 움직이는가 — **화면이 전원 "중립"이었다.**
//
//   npm run measure:relations
//   node scripts/measure-relations.cjs --weeks 60
//
// 48주(한 시즌)를 함께 뛴 36명이 전부 중립이었다. 산수로는 그럴 수 없다:
// 초기값은 −10~+10이고 팀 승리마다 동료 +1인데, 15승이면 +15 → 우호다.
//
// 코드를 층층이 읽었더니 **전 구간이 맞았다** — 배선도, serde 이름도, 델타
// 적용도. 그래서 읽는 것으로는 더 못 간다. 주마다 값을 찍어서 어디서
// 끊기는지 본다.
//
// ⚠ 판정이 아니라 계측이다. 규칙 수치를 짐작으로 올리지 않는다.

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const WEEKS = arg("weeks", 60);
const SEED = arg("seed", 20260808);

const log = (s) => process.stdout.write(s + "\n");
const pad = (s, n) => String(s).padEnd(n);

(async () => {
  log("");
  log("── 관계도 실측 ───────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("relations");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "REL", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const first = await app.relationProbe();
    log(`  시작   행 ${first.rows}개 · ${JSON.stringify(first.byLabel)}`);

    const marks = [];
    let guard = 0;
    let lastWeek = -1;
    while (guard++ < WEEKS * 8) {
      const w0 = app.currentWeek();
      if (w0 >= WEEKS) break;
      await app.autoRun();
      const w = app.currentWeek();
      if (w === w0) continue;
      if (w === lastWeek) continue;
      lastWeek = w;
      if (w % 10 === 0) {
        const p = await app.relationProbe();
        marks.push({ w, ...p });
        log(`  W${pad(w, 4)} 행 ${pad(p.rows, 4)} ${JSON.stringify(p.byLabel)}`);
      }
    }

    const last = await app.relationProbe();
    log("");
    log("  ── 마지막 상태 ──");
    log(`  행 ${last.rows}개 · contact ${JSON.stringify(last.contacts)}`);
    for (const [kind, s] of Object.entries(last.byKind ?? {})) {
      log(`    ${pad(kind, 10)} ${pad(s.n + "명", 6)} 값 ${s.min} ~ ${s.max}` +
        ` (평균 ${(s.sum / s.n).toFixed(1)})`);
    }
    log(`  라벨 ${JSON.stringify(last.byLabel)}`);
    log("  표본:");
    for (const s of last.sample ?? []) log(`    ${s}`);

    // 라벨 변화가 한 주에 몰리는가 — 선택지 달린 것이 몰리면 그 주가 막힌다
    log("");
    log("  ── 관계 소식 몰림 ──");
    log("    " + JSON.stringify(app.relationBurstProbe(), null, 0));

    // 같은 "한 칸 어긋남"이 의심되는 소식 — 전주 NPC 경기 결과
    log("");
    log("  ── 소식이 실제로 오는가 ──");
    for (const pat of ["league-results", "msg-train", "msg-mybody"]) {
      const hits = app.dumpMessages(pat, 2);
      log("    " + pad(pat, 16) + (hits.length ? hits.join(" / ") : "없음"));
    }

    log("");
    const moved = Object.entries(last.byLabel ?? {})
      .filter(([k]) => k !== "중립")
      .reduce((a, [, v]) => a + v, 0);
    if (moved === 0) {
      log("  ✗ 전원 중립이다 — 값이 한 칸도 안 움직였다.");
      log("    엔진이 델타를 안 만드는지, 만드는데 저장이 안 되는지 갈라야 한다.");
      process.exitCode = 1;
    } else {
      log(`  ○ ${moved}명이 중립을 벗어났다.`);
    }
  } catch (e) {
    log(`  실패: ${e && e.stack ? e.stack : e}`);
    process.exitCode = 1;
  } finally {
    if (tmp) await headless.cleanup(tmp);
  }
})();
