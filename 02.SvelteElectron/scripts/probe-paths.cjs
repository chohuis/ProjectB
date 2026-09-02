"use strict";
/**
 * 안 본 10행을 한 시나리오로 밟는다 (2026-09-02 · PLAN_FEATURES §10).
 *
 * 🔴 08-01 결함 26건이 전부 "코드는 있는데 안 돈다"였다. 있는 것과 밟은
 *   것은 다르다 — 이 프로브는 **밟았는가**만 답한다. 값은 다른 계측 몫이다.
 *
 * 헤드리스가 못 넘던 pending 넷은 `pushPendingForward()` 가 기본 선택으로
 * 푼다(옵션 행사 · FA 첫 제안 서명 · 트레이드 수락 · 은퇴 권고는 계속 뛰기).
 *
 * 열 행과 그 신호:
 *
 * ```
 *   대회 성적 개인 기록      대회 경기 주에 myGames 가 오르나 (tournamentGamesOfMyTeam↑ 와 같은 주)
 *   졸업 → 지명 성공         stage university → pro_*
 *   독립 재지원              stage independent 에서 draftNotification pending
 *   주인공 포스트시즌        postseason=true
 *   보직 변화                position 이 바뀐 횟수
 *   주인공 트레이드          pending trade → team 이 바뀜 · events 에 "trade"
 *   국가대표 발탁            national=true
 *   국제대회 면제            military 가 "면제"
 *   강등 → 복귀              farm true → false (프로 무대에서)
 *   수술 은퇴 발동           retirementAsk reason=injury
 * ```
 *
 *   npm run probe:paths -- --path pro
 *   PF_YEARS=12 PF_SEED=20260731 npm run probe:paths -- --path univ
 */
const path = require("node:path");
const headless = require(path.join(process.cwd(), "scripts/perf/headless.cjs"));
// 진로 판정마다 [진로]·[진로산식] 한 줄 — 지명 산식 분해가 여기서만 보인다
globalThis.__PB_CAREER_LOG = true;
// 병영생활 주간 선택 정책 — ball | people | rest | mix (기본 ball · 실제 플레이는 탭에서 고른다)
globalThis.__PB_MIL_CHOICE = process.env.PB_MIL_CHOICE || "ball";
const SEED = Number(process.env.PF_SEED || 20260731);
const YEARS = Number(process.env.PF_YEARS || 12);

const PATHS = {
  indie: { draft: false, university: false, independent: true },
  univ:  { draft: false, university: true,  independent: false },
  draft: { draft: true,  university: false, independent: true },
  pro:   { draft: true,  university: false, independent: false },
  mil:   { draft: false, university: false, independent: false },
};
const pi = process.argv.indexOf("--path");
const PATH_KEY = pi !== -1 ? process.argv[pi + 1] : "pro";
const POLICY = PATHS[PATH_KEY];
if (!POLICY) { console.log("경로: " + Object.keys(PATHS).join(" ")); process.exit(1); }

(async () => {
  const { app, tmp } = await headless.boot("paths");
  let why = "완주";
  const pendings = {};          // 종류 → 횟수
  const stages = [];            // "2029W32 highschool→pro_kbl"
  const teams = [];             // 팀 변경
  const positions = [];         // 보직 변경
  const seen = { postseason: 0, national: 0, farmIn: 0, farmOut: 0, tourStatWeeks: 0, indieDraftPending: 0, injuryAsk: 0, exempt: 0 };
  let prev = app.pathSignals();
  try {
    await app.boot({ slotId: "PP", worldSeed: SEED, seasonYear: 2026 });
    app.setCareerPolicy(POLICY);
    prev = app.pathSignals();
    const start = app.currentSeason();
    let guard = 0;
    while (guard++ < YEARS * 52 * 60 && app.currentSeason() < start + YEARS) {
      if (app.retired()) { why = "은퇴"; break; }
      const w0 = app.currentWeek(), s0 = app.currentSeason();
      await app.autoRun();
      // ── 신호 갱신 ──
      const cur = app.pathSignals();
      const tag = `${cur.year}W${cur.week}`;
      if (cur.stage !== prev.stage) stages.push(`${tag} ${prev.stage}→${cur.stage}`);
      if (cur.team !== prev.team) teams.push(`${tag} ${prev.team}→${cur.team}`);
      if (cur.position !== prev.position && prev.position) positions.push(`${tag} ${prev.position}→${cur.position}`);
      if (cur.postseason && !prev.postseason) seen.postseason++;
      if (cur.national && !prev.national) seen.national++;
      if (cur.farm && !prev.farm && /^pro/.test(cur.stage)) seen.farmIn++;
      if (!cur.farm && prev.farm && /^pro/.test(cur.stage)) seen.farmOut++;
      if (cur.tournamentGamesOfMyTeam > prev.tournamentGamesOfMyTeam && cur.myGames > prev.myGames) seen.tourStatWeeks++;
      if (cur.military === "면제" && prev.military !== "면제") seen.exempt++;
      // 병영생활 — 4주마다 한 줄 (감각·아크·관계·캘린더·이벤트). 살았는지도 여기서 본다
      if (cur.stage === "military" && cur.mil && cur.week % 4 === 0) console.log(`[병영] ${tag} ${JSON.stringify(cur.mil)}`);
      prev = cur;
      if (app.currentWeek() > w0) continue;
      // ── pending ──
      const kind = app.pendingKind();
      if (kind) {
        pendings[kind] = (pendings[kind] || 0) + 1;
        if (kind === "draftNotification" && cur.stage === "independent") seen.indieDraftPending++;
        if (kind === "retirementAsk" && app.pendingReason && app.pendingReason() === "injury") seen.injuryAsk++;
      }
      if (kind === "draftObserve") { await app.skipDraftObserve(); continue; }
      if (await app.pushPendingForward()) continue;
      if (await app.pushCareerForward()) continue;
      if (app.isSeasonEnded()) { await app.seasonRollover(); continue; }
      if (app.currentWeek() === w0 && app.currentSeason() === s0) { why = `정지 ${s0}W${w0} pending=${kind}`; break; }
    }
  } catch (e) { why = `예외 ${e && e.stack || e}`; }
  const last = app.pathSignals();
  const ev = last.events || [];
  const has = (t) => ev.filter((x) => x === t).length;
  const mark = (ok) => ok ? "✅" : "⚠";
  console.log("");
  console.log(`── 안 본 10행 — 밟았는가 (씨앗 ${SEED} · 경로 ${PATH_KEY} · ${YEARS}시즌) ──`);
  console.log(`  ${mark(seen.tourStatWeeks > 0)} 대회 성적 개인 기록     대회주에 등판 기록 오름 ${seen.tourStatWeeks}주`);
  console.log(`  ${mark(stages.some((s) => /university→pro/.test(s)))} 졸업 → 지명 성공         ${stages.filter((s) => /university→/.test(s)).join(" · ") || "없음"}`);
  console.log(`  ${mark(seen.indieDraftPending > 0)} 독립 재지원              독립에서 지명 통보 ${seen.indieDraftPending}회`);
  console.log(`  ${mark(seen.postseason > 0)} 주인공 포스트시즌        진출 ${seen.postseason}회`);
  console.log(`  ${mark(positions.length > 0)} 보직 변화                ${positions.slice(0, 4).join(" · ") || "없음"}`);
  console.log(`  ${mark(has("trade") > 0)} 주인공 트레이드          pending ${pendings.trade || 0} · 경력 ${has("trade")} · 팀변경 ${teams.length}`);
  console.log(`  ${mark(seen.national > 0)} 국가대표 발탁            ${seen.national}회`);
  console.log(`  ${mark(seen.exempt > 0)} 국제대회 면제            ${seen.exempt}회 (최종 ${last.military})`);
  console.log(`  ${mark(seen.farmIn > 0 && seen.farmOut > 0)} 강등 → 복귀              강등 ${seen.farmIn} · 복귀 ${seen.farmOut}`);
  console.log(`  ${mark(seen.injuryAsk > 0)} 수술 은퇴 발동           injury 권고 ${seen.injuryAsk}회 · retirementAsk 총 ${pendings.retirementAsk || 0}`);
  console.log(`  pending 종류: ${JSON.stringify(pendings)}`);
  console.log(`  무대 전환: ${stages.join(" · ") || "없음"}`);
  console.log(`  경력 이벤트: ${JSON.stringify(ev.reduce((m, t) => (m[t] = (m[t] || 0) + 1, m), {}))}`);
  console.log(`[END] ${why} · 최종 ${last.year}W${last.week} ${last.stage} ${last.team} ${last.age ?? ""}`);
  await headless.cleanup(tmp);
})();
