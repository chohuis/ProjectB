"use strict";
/** 시즌 **중** 고교가 왜 반토막 나는가 — 스토어와 정본 DB를 같은 주에 잰다.
 *
 *  🔴 이걸 갈라야 고칠 자리를 안다:
 *    · DB 에도 없다        → 실제 유출이다
 *    · DB 엔 있는데 스토어에 없다 → **적재 문제고, 검사가 허깨비를 잡는 것**이다
 *
 *  `perfEntry.ts` 의 `hsDbCount` 주석이 이 질문을 적어 두고 **답을 안 적었다.**
 *  시즌 경계만 재면 멀쩡해 보인다(4시즌 내내 야수 최소 14 · 미달 0팀). */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
const SEED = Number(process.env.PF_SEED || 111);
const YEARS = Number(process.env.PF_YEARS || 2);

(async () => {
  const { app, tmp } = await headless.boot("hsw");
  let why = "완주";
  try {
    await app.boot({ slotId: "HW", worldSeed: SEED, seasonYear: 2026 });
    const start = app.currentSeason();
    let guard = 0, last = "";
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      if (app.pendingKind() === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) {
        // 🔴 **롤오버 직후를 반드시 잰다.** 검사(`test-roster-balance`)가
        //   `absorb("오프시즌직후")`로 잡는 게 이 순간이다 — 졸업으로 3학년이
        //   빠지고 신입이 들어오기 전. **여기를 건너뛰면 저점을 영영 못 본다.**
        const before = app.hsRosterProbe();
        await app.seasonRollover();
        const after = app.hsRosterProbe();
        // ⚠ **검사가 쓰는 프로브를 나란히 찍는다.** 두 계측이 야수를 다르게
        //   세고 있어서(7 vs 12) 어느 쪽이 맞는지 갈라야 한다.
        const cmp = app.rosterCompositionProbe()["HIGHSCHOOL"];
        console.log(`[롤오버 ${app.currentSeason()}] 직전 총 ${before.total}`
          + ` 야수최소 ${before.batters.min} 미달 ${before.under9}팀`
          + `  →  직후 총 ${after.total} 야수최소 ${after.batters.min}`
          + ` 미달 ${after.under9}팀 포수0 ${after.noCatcher}팀`
          + ` 학년 ${JSON.stringify(after.byGrade)}`
          + `  ||  검사프로브 최소야수 ${cmp && cmp.최소야수} 타순미달 ${cmp && cmp.타순미달팀}팀`
          + ` 포수0 ${cmp && cmp.포수없는팀}팀`);
        continue;
      }
      await app.autoRun();

      const p = app.hsRosterProbe();
      // 값이 바뀔 때만 찍는다 — 매주 찍으면 못 읽는다
      const key = `${p.total}/${p.batters.min}/${p.under9}/${p.noCatcher}`;
      if (key !== last) {
        last = key;
        const db = await app.hsDbCount();
        console.log(`[${app.currentSeason()}W${String(app.currentWeek()).padStart(2, "0")}]`
          + ` 스토어 총 ${p.total} · 야수최소 ${p.batters.min}`
          + ` · 야수9미만 ${p.under9}팀 · 포수0 ${p.noCatcher}팀`
          + `  ||  DB ${JSON.stringify(db).slice(0, 200)}`);
      }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.message}`; }
  console.log(`[END] ${why} · 씨앗 ${SEED}`);
  await headless.cleanup(tmp);
})();
