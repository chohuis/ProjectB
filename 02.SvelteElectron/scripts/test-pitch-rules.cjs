"use strict";
// Phase 5-8 투구수 상한 · 의무 휴식표 · 반경 게이트 검증
// 실행: npm run test:pitchrules
//
// 지키려는 것:
//  1) 리그별 상한 (고교 105 / 그 외 120 — DESIGN §7.2)
//  2) 의무 휴식표가 **일 단위**로 작동하는가 (주 단위로는 주말 연투가 안 걸린다)
//  3) 반경 게이트가 v2(국내 전부 풀 시뮬)인가 — v1이면 대학·독립 경기가 안 돈다

const path = require("node:path");
const fs = require("node:fs");
const engine = require("../packages/engine-native");

let failed = 0;
function check(name, cond, extra = "") {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name} ${extra}`); }
}
const J = (fn, p) => {
  const r = JSON.parse(engine[fn](JSON.stringify(p)));
  if (r && typeof r === "object" && !Array.isArray(r) && r.error) throw new Error(`${fn}: ${r.error}`);
  return r;
};

// ── 1. 리그별 투구수 상한 ─────────────────────────────────────
console.log("리그별 투구수 상한");
const LIMITS = {
  LEAGUE_HIGHSCHOOL: 105,
  LEAGUE_UNIVERSITY: 120,
  LEAGUE_INDEPENDENT: 120,
  LEAGUE_KBL: 120,
  LEAGUE_KBL_FARM: 120,
  LEAGUE_ABL: 120,
  LEAGUE_JBL: 120,
};
for (const [lid, want] of Object.entries(LIMITS)) {
  const got = J("leaguePitchLimitNative", { leagueId: lid });
  console.log(`    ${lid.replace("LEAGUE_", "").padEnd(12)} 하드 ${got.hard}  소프트 ${got.soft}`);
  check(`  ${lid.replace("LEAGUE_", "")} 상한 ${want}구`, got.hard === want, `got ${got.hard}`);
  check(`  ${lid.replace("LEAGUE_", "")} 소프트 < 하드`, got.soft < got.hard);
}
check("고교만 105구 (성장기 보호 · 대회 에이스 딜레마)",
  J("leaguePitchLimitNative", { leagueId: "LEAGUE_HIGHSCHOOL" }).hard === 105 &&
  J("leaguePitchLimitNative", { leagueId: "LEAGUE_KBL" }).hard === 120);
check("미지의 리그는 120으로 떨어짐 (안전 기본값)",
  J("leaguePitchLimitNative", { leagueId: "LEAGUE_NONSENSE" }).hard === 120);

// ── 2. 의무 휴식표 ────────────────────────────────────────────
// DESIGN §7.2: ~30 다음날 / 31~45 1일 / 46~60 2일 / 61~75 3일 / 76~95 4일 / 96~ 5일
console.log("\n의무 휴식표 (일 단위)");
const REST = [
  [0, 0], [30, 0],
  [31, 1], [45, 1],
  [46, 2], [60, 2],
  [61, 3], [75, 3],
  [76, 4], [95, 4],
  [96, 5], [105, 5], [120, 5],
];
for (const [pitches, wantDays] of REST) {
  // 같은 날 → 다음날 = 쉰 날 0일. wantDays만큼 쉬어야 하므로 +1일 뒤부터 가능
  const base = "2026-05-01";
  const okDate = addDays(base, wantDays + 1);
  const badDate = addDays(base, wantDays);
  const ok = J("checkPitcherRestNative", {
    lastPitchedDate: base, lastPitchCount: pitches, gameDate: okDate,
  });
  check(`  ${String(pitches).padStart(3)}구 → ${wantDays}일 휴식`,
    ok.requiredRestDays === wantDays && ok.available,
    `required=${ok.requiredRestDays} available=${ok.available}`);
  if (wantDays > 0) {
    const bad = J("checkPitcherRestNative", {
      lastPitchedDate: base, lastPitchCount: pitches, gameDate: badDate,
    });
    check(`    · ${wantDays - 1}일만 쉬면 등판 불가`, !bad.available,
      `rested=${bad.actualRestDays}`);
  }
}

function addDays(iso, n) {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + n * 86400000;
  const dt = new Date(t);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// ── 3. 주말 연투 차단 (일 단위가 필요한 이유) ─────────────────
console.log("\n고교 주말리그 연투");
{
  // 토요일 105구 → 일요일 등판? 5일 휴식이 필요하므로 불가
  const sat = "2026-05-02", sun = "2026-05-03";
  const heavy = J("checkPitcherRestNative", {
    lastPitchedDate: sat, lastPitchCount: 105, gameDate: sun,
  });
  check("토 105구 → 일 등판 차단", !heavy.available,
    `required=${heavy.requiredRestDays} rested=${heavy.actualRestDays}`);

  // 토요일 25구(짧은 불펜) → 일요일 등판 가능
  const light = J("checkPitcherRestNative", {
    lastPitchedDate: sat, lastPitchCount: 25, gameDate: sun,
  });
  check("토 25구 → 일 등판 허용 (다음날 가능 구간)", light.available);

  // 다음 주 토요일(7일 뒤)이면 105구도 회복
  const nextSat = addDays(sat, 7);
  const recovered = J("checkPitcherRestNative", {
    lastPitchedDate: sat, lastPitchCount: 105, gameDate: nextSat,
  });
  check("다음 주 주말이면 105구도 등판 가능", recovered.available,
    `rested=${recovered.actualRestDays}`);

  // 주 단위로는 이게 구분이 안 된다 — 그래서 일 단위로 바꿨다
  check("주 단위라면 토·일이 같은 주라 구분 불가 (설계 근거)",
    heavy.actualRestDays === 0 && light.actualRestDays === 0 &&
    heavy.available !== light.available);
}

// ── 4. 경계·방어 ──────────────────────────────────────────────
console.log("\n경계·방어");
check("미등판(날짜 빈 값)은 막지 않음",
  J("checkPitcherRestNative", { lastPitchedDate: "", lastPitchCount: 120, gameDate: "2026-05-03" }).available);
check("날짜 파싱 실패도 막지 않음 (리그가 멈추면 안 된다)",
  J("checkPitcherRestNative", { lastPitchedDate: "쓰레기", lastPitchCount: 120, gameDate: "2026-05-03" }).available);
check("월 경계 (4/30 → 5/5, 96구 5일)",
  J("checkPitcherRestNative", { lastPitchedDate: "2026-04-30", lastPitchCount: 96, gameDate: "2026-05-06" }).available &&
  !J("checkPitcherRestNative", { lastPitchedDate: "2026-04-30", lastPitchCount: 96, gameDate: "2026-05-05" }).available);
check("연 경계 (12/31 → 1/6, 100구 5일)",
  J("checkPitcherRestNative", { lastPitchedDate: "2026-12-31", lastPitchCount: 100, gameDate: "2027-01-06" }).available &&
  !J("checkPitcherRestNative", { lastPitchedDate: "2026-12-31", lastPitchCount: 100, gameDate: "2027-01-05" }).available);
check("윤년 2월 경계 (2028-02-28 → 03-04, 100구)",
  J("checkPitcherRestNative", { lastPitchedDate: "2028-02-28", lastPitchCount: 100, gameDate: "2028-03-05" }).available &&
  !J("checkPitcherRestNative", { lastPitchedDate: "2028-02-28", lastPitchCount: 100, gameDate: "2028-03-04" }).available);

// ── 5. 불펜 등판 판정이 휴식표를 쓰는가 ───────────────────────
console.log("\n불펜 등판 판정");
{
  const TRIALS = 300;
  let firedAfterHeavy = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = J("relieverWouldPitchNative", {
      role: "마무리", pitchOutsLast: 3,
      lastPitchedWeek: 0, currentWeek: 0,
      lastPitchedDate: "2026-05-02", lastPitchCount: 100, gameDate: "2026-05-03",
    });
    if (r.wouldPitch) firedAfterHeavy++;
  }
  check("100구 다음날은 절대 등판 안 함", firedAfterHeavy === 0, `${firedAfterHeavy}/${TRIALS}`);

  let firedAfterLight = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = J("relieverWouldPitchNative", {
      role: "마무리", pitchOutsLast: 3,
      lastPitchedWeek: 0, currentWeek: 0,
      lastPitchedDate: "2026-05-02", lastPitchCount: 20, gameDate: "2026-05-03",
    });
    if (r.wouldPitch) firedAfterLight++;
  }
  check("20구 다음날은 등판 가능 (확률적으로 나옴)", firedAfterLight > 0,
    `${firedAfterLight}/${TRIALS}`);

  // 날짜를 안 주면 구 동작(같은 주 금지)으로 떨어져야 한다
  let oldPath = 0;
  for (let i = 0; i < TRIALS; i++) {
    const r = J("relieverWouldPitchNative", {
      role: "마무리", pitchOutsLast: 3, lastPitchedWeek: 5, currentWeek: 5,
    });
    if (r.wouldPitch) oldPath++;
  }
  check("날짜 없으면 구 동작(같은 주 재등판 금지)으로 폴백", oldPath === 0,
    `${oldPath}/${TRIALS}`);
}

// ── 6. 반경 게이트가 v2인가 ───────────────────────────────────
// radiusGate.ts는 순수 TS라 여기서 import할 수 없다. 대신 **국내 리그가 전부
// DOMESTIC(반경 1)에 들어 있는지**를 소스에서 확인한다. v1로 되돌아가면
// 대학 225경기·독립 152경기가 생성만 되고 시뮬되지 않는다(backgroundLeague가 스킵).
console.log("\n반경 게이트");
{
  const src = fs.readFileSync(
    path.join(__dirname, "../apps/ui/src/shared/utils/radiusGate.ts"), "utf8");
  const domestic = src.match(/const DOMESTIC_LEAGUES = new Set\(\[([\s\S]*?)\]\)/);
  check("DOMESTIC_LEAGUES 선언 존재", !!domestic);
  const listed = domestic ? [...domestic[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]) : [];
  for (const lid of ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
                     "LEAGUE_KBL", "LEAGUE_KBL_FARM"]) {
    check(`  ${lid.replace("LEAGUE_", "")}가 반경 1 (풀 시뮬)`, listed.includes(lid),
      `DOMESTIC에 없음 — 이 리그 경기가 시뮬되지 않는다`);
  }
  check("v1 RADIUS_TABLE 잔재 없음", !src.includes("RADIUS_TABLE"),
    "구 커리어단계별 표가 남아 있다");
  const foreign = src.match(/const FOREIGN_LEAGUES = new Set\(\[([\s\S]*?)\]\)/);
  const fListed = foreign ? [...foreign[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]) : [];
  check("해외만 드리프트 (ABL·JBL)",
    fListed.includes("LEAGUE_ABL") && fListed.includes("LEAGUE_JBL"),
    fListed.join(","));
  check("국내 리그가 해외 목록에 섞이지 않음",
    !fListed.some((l) => listed.includes(l)));
}

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
