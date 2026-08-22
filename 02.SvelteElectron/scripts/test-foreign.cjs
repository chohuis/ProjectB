#!/usr/bin/env node
// ── 외국인 선수 다시즌 회귀 (F-2b · F-4 · F-5) ────────────────────
//
// 생성 시점 검사는 `test-roster-gen.cjs`가 한다. 여기서 보는 건 **시간이
// 흘러도 보유 한도가 유지되는가**다 — 승강·트레이드·FA·은퇴·재계약이
// 매 시즌 그 자리를 건드리기 때문이다.
//
// ⚠ 판정은 **팀별 위반 수**로 한다. 총원만 보면 어떤 팀 4명·다른 팀 2명이어도
// 평균이 3이라 정상으로 읽힌다. 실제로 한도가 새는 방식이 정확히 그거다.
//
//   npm run test:foreign
//   node scripts/test-foreign.cjs --seasons 6 --verbose

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 5);
const SEED = arg("seed", 20260802);
const verbose = process.argv.includes("--verbose");

const log = (s) => process.stdout.write(s + "\n");
let failed = 0;
function check(name, cond, extra = "") {
  if (cond) log(`  ok  ${name}`);
  else { failed++; log(`FAIL  ${name} ${extra}`); }
}

(async () => {
  log("");
  log("── 외국인 선수 다시즌 회귀 ───────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("foreign");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "FGN", worldSeed: SEED, seasonYear: 2026 });
    // 고교→프로 어느 갈래든 상관없다 — 보는 건 KBL 세계지 주인공이 아니다
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    const snaps = [];
    // ⚠ **교체율을 안 재면 "한도는 지켜지는데 아무도 안 갈린다"를 못 본다.**
    // 재계약 판정이 능력치·나이만 볼 땐 OVR 82짜리가 뭘 해도 남았다.
    // 시즌마다 명단을 떠서 몇 명이 바뀌는지 센다.
    const rosterOf = () => {
      const pr = app.foreignProbe();
      return new Set((pr && pr.KBL && pr.KBL.명단) || []);
    };
    const turnover = [];
    let prevRoster = null;
    let guard = 0;

    while (guard++ < 4000) {
      // ⚠ **롤오버 직후에 재면 안 된다.** 외국인 충원(F-4)은 새 시즌 W1에
      // 도는데, 시즌 증가만 보고 끊으면 은퇴·이동은 반영되고 충원은 아직
      // 안 돈 시점을 재게 된다 — 멀쩡한 세계가 "매년 자리가 빈다"로 보인다.
      if (app.currentSeason() - start >= SEASONS && app.currentWeek() >= 2) break;
      if (app.retired()) break;

      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) continue;
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        const y = app.currentSeason();
        await app.seasonRollover();
        // 롤오버 **직후**가 아니라 다음 시즌 첫 주가 지난 뒤에 재야 한다 —
        // 외국인 순환(F-4)은 W1에 돌기 때문이다. autoRun이 곧 W1을 민다.
        snaps.push({ year: y, probe: null });
        {
          const cur = rosterOf();
          if (prevRoster && cur.size) {
            let gone = 0;
            for (const id of prevRoster) if (!cur.has(id)) gone++;
            turnover.push({ year: y, gone, size: cur.size });
          }
          if (cur.size) prevRoster = cur;
        }
        continue;
      }
      break;
    }

    // 마지막 관측 — 여기까지 오면 최소 한 번은 W1 순환이 돌았다
    const probe = app.foreignProbe();
    if (verbose) log("      " + JSON.stringify(probe));

    const kbl = probe.KBL;
    check("foreignRules가 실제로 읽혔다", !!kbl, JSON.stringify(probe));
    if (!kbl) throw new Error("KBL 외국인 집계 없음");

    log(`      ${start}~${app.currentSeason()} · 총원 ${kbl.총원}명 / ${kbl.팀수}팀 · ` +
        `OVR ${kbl.최저OVR}~${kbl.최고OVR} (평균 ${kbl.평균OVR})`);

    check("보유 한도를 넘은 팀이 없다", kbl.한도초과.length === 0, kbl.한도초과.join(" "));
    check("투수 한도를 넘은 팀이 없다", kbl.투수한도초과.length === 0, kbl.투수한도초과.join(" "));
    // ⚠ **미달이 진짜 결함이다.** 은퇴·퇴출은 일어나는데 충원 경로가 없으면
    // 한도 초과는 영원히 안 나고 자리만 조용히 줄어든다 — "위반 0"으로 읽힌다
    check("빈 슬롯을 남긴 팀이 없다 (충원이 돈다)", kbl.미달.length === 0, kbl.미달.join(" "));
    check("2군에 체류하는 외국인이 없다", kbl["2군체류"] === 0, String(kbl["2군체류"]));
    check("외국인이 남아 있다", kbl.총원 > 0, String(kbl.총원));
    // 매년 같은 사람만 남으면 재계약 판정(F-5)이 안 도는 것이다
    check("재계약 하한 아래가 남아 있지 않다", kbl.최저OVR >= 60, String(kbl.최저OVR));
    if (turnover.length) {
      const tot = turnover.reduce((a, t) => a + t.gone, 0);
      const avg = Math.round((tot / turnover.length) * 10) / 10;
      log("      [교체율] " + turnover.map((t) => t.year + ":" + t.gone).join(" · ") +
          "  평균 " + avg + "명/시즌 (총원 " + kbl.총원 + ")");
    } else {
      log("      [교체율] 관측 없음 — foreignProbe에 명단이 없다");
    }
  } catch (e) {
    failed++;
    log(`FAIL  ${String((e && e.message) || e).split("\n").slice(0, 6).join("\n      ")}`);
  } finally {
    if (tmp) headless.cleanup(tmp);
  }

  log("");
  log(failed === 0 ? "외국인 회귀 통과" : `외국인 회귀 실패 ${failed}건`);
  process.exit(failed === 0 ? 0 : 1);
})().catch((e) => { log("ERR " + ((e && e.stack) || e)); process.exit(1); });
