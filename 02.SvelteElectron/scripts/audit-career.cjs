"use strict";
/** 커리어 단계별 기능 점검 — 고교부터 은퇴까지
 *
 *  🔴 **처음 판에서 다섯 항목이 거짓 "없음"이었다** — 찾는 문자열을 틀렸다
 *    (훈련·경기·계약금·일반입대·독립스카우트). 실제로는 `matchStart`,
 *    `signingBonus`(42곳) 처럼 다른 이름이었다.
 *    **검사가 틀리면 없는 결함을 만든다** — 이 세션에서 네 번째다.
 *
 *  ⚠ **호출을 본다. 주석을 세지 않는다.** 이 세션에서 계획서의 "이미 있다"가
 *    다섯 번 틀렸다 — 등번호·연표·고교 로스터·34명 출전·부상 범위.
 *  ⚠ 정규식을 안 쓴다. 찾는 문자열을 그대로 적는다. */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = process.cwd();
const NL = String.fromCharCode(10);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules") walk(p, out); }
    else out.push(p);
  }
  return out;
}
const srcFiles = walk(path.join(ROOT, "apps/ui/src"));
const rustFiles = walk(path.join(ROOT, "packages/engine-native/src"));
const read = (p) => fs.readFileSync(p, "utf8");

/** 주석을 지운 본문 — 안 쓰는 이유를 적어 둔 주석이 통과시키면 안 된다 */
function strip(s) {
  return s.replace(/<!--[\s\S]*?-->/g, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
}
const BODY = srcFiles.filter((f) => !f.includes("__tests__"))
  .map((f) => strip(read(f))).join(NL);
const RUST = rustFiles.map(read).join(NL);
const SCREENS = srcFiles.filter((f) => f.endsWith(".svelte"))
  .map((f) => path.basename(f, ".svelte"));

const has = (s) => BODY.includes(s);
const hasRust = (s) => RUST.includes(s);
const screen = (n) => SCREENS.includes(n);
/**
 * 소식으로 나가는가 — **소식도 플레이어가 보는 자리다.**
 *
 * 🔴 처음엔 전용 화면만 셌다. 그래서 전역·캠퍼스·프로올스타처럼
 *   `addMessage` 로 이미 나가는 것까지 "화면 없음"으로 셌다.
 */
const news = (idPrefix) => BODY.includes(idPrefix);

/** [단계, 기능, 있나, 화면] */
const ROWS = [
  // ── 고등학교 ──────────────────────────────────────────────
  ["고교", "학업·성적", has("academicsRules") || has("subjectScores"), screen("AcademicsPage")],
  ["고교", "훈련", has("TrainingPage") || has("trainingPlan"), screen("TrainingPage")],
  ["고교", "경기 (인터랙티브)", has("matchStart"), screen("MatchPage")],
  ["고교", "대회 (토너먼트)", has("openTournamentsForWeek"), screen("SchedulePage")],
  ["고교", "이벤트", has("runEventEngine"), screen("DigestCards")],
  ["고교", "관계 (감독·동료)", has("relationLabelTable") || has("relationships"), screen("PeoplePage")],
  ["고교", "진로 — 대학", has("UniversityApplyModal"), screen("UniversityApplyModal")],
  ["고교", "진로 — 독립", has("IndependentApplyModal"), screen("IndependentApplyModal")],
  ["고교", "진로 — 해외 직행", has("OverseasApplyModal"), screen("OverseasApplyModal")],
  ["고교", "진로 — 드래프트", has("DraftObserveModal"), screen("DraftObserveModal")],
  ["고교", "진로 허브", has("CareerChoiceHubModal"), screen("CareerChoiceHubModal")],

  // ── 대학 ──────────────────────────────────────────────────
  ["대학", "학업 (전공·학점)", has("academicsRules"), screen("AcademicsPage")],
  ["대학", "캠퍼스 이벤트", has("campusEvents"), news("msg-allstar") || news("msg-campus")],
  ["대학", "프로 올스타 초청", has("proAllstar"), news("msg-allstar")],
  ["대학", "졸업 후 드래프트", hasRust("대학_졸업반은_졸업_경로로"), screen("DraftObserveModal")],

  // ── 독립리그 ──────────────────────────────────────────────
  ["독립", "리그 운영", has("LEAGUE_INDEPENDENT"), screen("LeaguePage")],
  ["독립", "프로 재도전 (스카우트)", has("IndieScoutOffer") || has("indieScoutOffer"), false],
  ["독립", "FA 미계약자 유입", hasRust("fa_fallback"), news("msg-indie-retry-")],

  // ── 드래프트 ──────────────────────────────────────────────
  ["드래프트", "지명 시뮬", has("runDraftSimulation"), screen("DraftBoardModal")],
  ["드래프트", "지명 통보", has("DraftNotificationModal"), screen("DraftNotificationModal")],
  ["드래프트", "신인 계약금", has("signingBonus"), screen("ContractNegotiationModal")],
  ["드래프트", "스카우팅 잡음", has("draftScoutingRules"), has("드래프트 평가 오차")],
  ["드래프트", "2차 드래프트 · 룰5", has("secondaryDraft"), false],

  // ── 프로 ──────────────────────────────────────────────────
  ["프로", "1군·2군 승강", has("processProTeamCallupCalldown"), screen("TeamPage")],
  ["프로", "부상자 명단(IL)", has("const activeCount = active.length - ilCount"), screen("InjuryPanel")],
  ["프로", "등록말소 기간", has("demotionLockWeeks"), news("msg-demote-")],
  ["프로", "웨이버 공시", hasRust("fn waiver_claim"), news("msg-waiver-")],
  ["프로", "엔트리 28/26", has("activeRosterSize"), false],
  ["프로", "트레이드", has("applyTradeTransfer"), screen("TradeModal")],
  ["프로", "연봉 협상", has("ContractNegotiationModal"), screen("ContractNegotiationModal")],
  ["프로", "옵션 조항", has("OptionClauseModal"), screen("OptionClauseModal")],
  ["프로", "연봉조정신청", has("salaryArbitration"), false],
  ["프로", "비FA 다년계약", has("multiYearNonFa"), false],
  ["프로", "수상 (13부문)", has("applySeasonAwards"), screen("SeasonEndModal")],
  ["프로", "골든글러브", has("computeGoldenGlove"), screen("SeasonEndModal")],
  ["프로", "구단 재정", has("settleClubFinance"), screen("FinancePage")],
  ["프로", "구단 연표", has("seasonGetTeamHistory"), screen("TeamDetailModal")],
  ["프로", "의료팀 (회복)", has("medicalRules"), has("의료팀")],
  ["프로", "전지훈련", has("campRules"), has("전지훈련")],
  ["프로", "전력분석팀", has("analyticsRules"), false],
  ["프로", "경쟁균형세 제재", has("luxuryTax"), false],
  ["프로", "우천 취소·순연", has("rainout"), false],
  ["프로", "팬 수·충성도", has("fanLoyalty"), false],

  // ── 해외 ──────────────────────────────────────────────────
  ["해외", "포스팅·진출", has("OverseasApplyModal"), screen("OverseasApplyModal")],
  ["해외", "ABL·JBL 운영", has("LEAGUE_ABL"), screen("LeaguePage")],
  ["해외", "외국인 한도", has("applyForeignTurnover"), has("{foreignHeld.length} / 3")],
  ["해외", "해외 리그 드래프트", has("overseasDraft"), false],

  // ── 군대 ──────────────────────────────────────────────────
  ["군대", "상무 지원", has("SportsUnitApplicationModal"), screen("SportsUnitApplicationModal")],
  ["군대", "일반 입대", has("generalEnlist"), screen("MilitaryEnlistAskModal")],
  ["군대", "복무 중 상태", has("MilitaryStatusPanel"), screen("MilitaryStatusPanel")],
  ["군대", "전역·복귀", hasRust("military_discharge"), news("msg-military-discharge")],

  // ── FA ────────────────────────────────────────────────────
  ["FA", "FA 자격·등급", has("faRules"), screen("FaMarketModal")],
  ["FA", "제안 생성", has("generateFaOffers"), screen("FaMarketModal")],
  ["FA", "보상선수·보상금", has("compensation"), news("msg-facomp-")],
  ["FA", "미계약 → 원소속 재계약", hasRust("fa_fallback"), news("msg-resign-")],

  // ── 은퇴 ──────────────────────────────────────────────────
  ["은퇴", "은퇴 판정", has("retirementRules"), screen("RetirementAskModal")],
  ["은퇴", "커리어 종료 화면", has("CareerEndScreen"), screen("CareerEndScreen")],
  ["은퇴", "명예의 전당", has("inductHallOfFame"), screen("HallOfFamePage")],
  ["은퇴", "영구결번", has("retiredNumbers"), screen("HallOfFamePage")],
  ["은퇴", "레전드·연표 화면", has("HallOfFamePage"), screen("HallOfFamePage")],
];

// ── 출력 ─────────────────────────────────────────────────────
console.log("화면 " + SCREENS.length + "개 · 점검 " + ROWS.length + "항목" + NL);
let stage = "";
let no = 0, noScreen = 0;
for (const [st, name, ok, sc] of ROWS) {
  if (st !== stage) { stage = st; console.log("── " + st + " ─────────────────────────"); }
  const mark = ok ? "ok  " : "없음";
  const scr = ok ? (sc ? "화면O" : "화면X") : "    ";
  if (!ok) no++;
  else if (!sc) noScreen++;
  console.log("  " + mark + " " + scr + "  " + name);
}
console.log(NL + "기능 없음 " + no + "건 · 기능은 있는데 **보이는 데가** 없음 " + noScreen + "건");
