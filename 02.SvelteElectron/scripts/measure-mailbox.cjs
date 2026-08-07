#!/usr/bin/env node
// 메일함 압력 — **소식이 안 오는가, 밀려서 사라지는가.**
//
//   npm run measure:mailbox
//   node scripts/measure-mailbox.cjs --seasons 2
//
// `trimMailbox`는 상한 50건이고 미결 선택지만 보존한다. **읽음 여부는 안 본다** —
// 안 읽은 소식도 새 소식에 밀린다. 주당 생산량을 모르면 두 상황을 구분할 수 없다.
//
// ⚠ **판정이 아니라 계측이다.** 상한을 추측으로 올리면 이번엔 목록이 길어져
// 읽을 수 없게 된다 — 숫자를 먼저 보고 정한다.

const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));

const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 ? (parseInt(process.argv[i + 1], 10) || d) : d;
};
const SEASONS = arg("seasons", 2);
const SEED = arg("seed", 20260803);

const log = (s) => process.stdout.write(s + "\n");

(async () => {
  log("");
  log("── 메일함 압력 ───────────────────────────────────────────");

  let tmp = null;
  try {
    const boot = await headless.boot("mailbox");
    tmp = boot.tmp;
    const app = boot.app;
    await app.boot({ slotId: "MBOX", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy({ draft: true, university: false, independent: true });

    const start = app.currentSeason();
    let guard = 0;
    // 주마다 보유량을 찍는다 — 상한에 붙는 시점이 곧 "밀리기 시작한 주"다
    const weekly = [];
    let lastWeek = -1;

    while (guard++ < 4000) {
      if (app.currentSeason() - start >= SEASONS) break;
      if (app.retired()) break;
      const before = app.currentWeek();
      await app.autoRun();
      if (app.currentWeek() > before) {
        const w = app.currentWeek();
        if (w !== lastWeek) {
          lastWeek = w;
          weekly.push({ w, n: app.mailboxProbe().보유 });
        }
        continue;
      }
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      break;
    }

    const p = app.mailboxProbe();
    log(`      ${start}~${app.currentSeason()} · ${weekly.length}주 관측`);
    log("");

    // 상한에 붙은 시점
    const capped = weekly.findIndex((x) => x.n >= p.상한);
    log("  보유량 추이 — 상한에 붙는 순간부터 안 읽은 소식이 밀린다");
    if (capped >= 0) {
      log(`      **${capped + 1}주차에 상한(${p.상한}) 도달** — 그 뒤로는 계속 밀려난다`);
    } else {
      const peak = Math.max(...weekly.map((x) => x.n));
      log(`      상한 미도달 (최대 ${peak}/${p.상한})`);
    }
    // 앞 12주만 찍는다 — 추이를 보는 데 그거면 족하다
    log(`      ${weekly.slice(0, 12).map((x) => `W${x.w}:${x.n}`).join(" ")}`);
    log("");

    // **살아남은 50건만 보면 유실이 안 보인다.** 이게 이 계측의 핵심 숫자다
    log("  사라진 소식 — 사용자가 못 본 채 밀려난 양");
    log(`      밀려남 ${p["밀려남(누계)"]}건 · 그중 안읽음 ${p["밀려남-안읽음"]}건`);
    log(`      분류별 ${JSON.stringify(p["밀려남-분류별"])}`);
    log("");

    log("  마지막 시점 구성");
    log(`      보유 ${p.보유}/${p.상한} · 안읽음 ${p.안읽음} · 미결선택 ${p.미결선택}`);
    log(`      카드형 ${p["카드형(metadata)"]}건 ${JSON.stringify(p["카드 종류"])}`);
    log(`      분류별 ${JSON.stringify(p.분류별)}`);
    log(`      보낸이 ${JSON.stringify(p.보낸이별)}`);
    log(`      기간 ${p.최고참} ~ ${p.최신}`);
    log("");
    log("  읽는 법");
    log("    · 상한에 일찍 붙을수록 '못 본 채 사라지는' 소식이 많다");
    log("    · 분류가 news/system에 쏠려 있으면 필터가 일을 안 하는 것이다");
    log("    · 카드형이 적으면 대부분이 본문 텍스트 한 덩어리라는 뜻이다");
  } finally {
    if (tmp) headless.cleanup(tmp);
  }
})();
