// scripts/patch-pro-service-years.cjs
// KBL/ABL/JBL PLY JSON에 proServiceYears 필드 일괄 추가
// 계산: max(0, age - baseEntryAge - militaryDeduction)

const path = require("node:path");
const fs   = require("node:fs");

const ENTITIES_DIR = path.resolve(__dirname, "../resource/data/master/entities/players");

// 리그별 기본 입단 나이
const BASE_ENTRY_AGE = {
  LEAGUE_KBL: 23,
  LEAGUE_ABL: 22,
  LEAGUE_JBL: 22,
};

// FA 기준 연수 (로그용)
const FA_THRESHOLD = {
  LEAGUE_KBL: 5,
  LEAGUE_ABL: 6,
  LEAGUE_JBL: 4,
};

function calcProServiceYears(entity) {
  const age           = entity.age ?? 22;
  const leagueId      = entity.leagueId ?? "";
  const militaryStatus = entity.militaryStatus ?? "해당없음";
  const notes         = entity.notes ?? "";
  const isKorean      = notes.includes("국적:한국");

  const baseAge = BASE_ENTRY_AGE[leagueId];
  if (!baseAge) return null; // 대상 리그 아님

  // 현역 복무 중 → 프로 경력 없음
  if (militaryStatus === "현역") return 0;

  // 한국인 + 군필: 복무 2년 차감 (외국인 군필은 차감 없음)
  const milDeduction = (isKorean && militaryStatus === "군필") ? 2 : 0;

  return Math.max(0, age - baseAge - milDeduction);
}

function main() {
  const files = fs.readdirSync(ENTITIES_DIR)
    .filter(f => f.startsWith("PLY_") && f.endsWith(".json") && f !== "_index.json")
    .sort();

  console.log(`[patch-pro-service-years] ${files.length}개 PLY 파일 스캔 중...`);

  const TARGET_LEAGUES = new Set(Object.keys(BASE_ENTRY_AGE));

  let updated  = 0;
  let skipped  = 0;
  let noChange = 0;
  let errors   = 0;

  // FA 자격 분포 통계
  const faStats = { LEAGUE_KBL: 0, LEAGUE_ABL: 0, LEAGUE_JBL: 0 };
  const leagueCount = { LEAGUE_KBL: 0, LEAGUE_ABL: 0, LEAGUE_JBL: 0 };

  for (const file of files) {
    const filePath = path.join(ENTITIES_DIR, file);
    try {
      const raw    = fs.readFileSync(filePath, "utf8").replace(/^﻿/, "");
      const entity = JSON.parse(raw);

      if (!TARGET_LEAGUES.has(entity.leagueId)) { skipped++; continue; }

      const psy = calcProServiceYears(entity);
      if (psy === null) { skipped++; continue; }

      const league = entity.leagueId;
      leagueCount[league] = (leagueCount[league] ?? 0) + 1;
      if (psy >= (FA_THRESHOLD[league] ?? 5)) {
        faStats[league] = (faStats[league] ?? 0) + 1;
      }

      if (!entity.details)        entity.details        = {};
      if (!entity.details.player) entity.details.player = {};

      // 이미 값이 있으면 스킵 (수동 편집 값 보호)
      if (entity.details.player.proServiceYears !== undefined) {
        noChange++;
        continue;
      }

      entity.details.player.proServiceYears = psy;
      fs.writeFileSync(filePath, JSON.stringify(entity, null, 2), "utf8");
      updated++;

    } catch (e) {
      console.warn(`  [오류] ${file}: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n[결과]`);
  console.log(`  수정: ${updated}개`);
  console.log(`  스킵(이미 값 있음): ${noChange}개`);
  console.log(`  스킵(대상 아님): ${skipped}개`);
  console.log(`  오류: ${errors}개`);
  console.log(`\n[리그별 선수 수]`);
  for (const [l, cnt] of Object.entries(leagueCount)) {
    const fa = faStats[l] ?? 0;
    const thr = FA_THRESHOLD[l];
    console.log(`  ${l.replace("LEAGUE_", "")}: ${cnt}명, FA자격(${thr}년+) ${fa}명 (${cnt ? Math.round(fa/cnt*100) : 0}%)`);
  }
  console.log(`\n→ npm run build:masterdb 실행하여 master.db에 반영하세요.`);
}

main();
