// scripts/fix_hs_name_en.cjs
// 고교 신입생 PLY의 nameEn을 한글에서 로마자로 수정
// 실행: node scripts/fix_hs_name_en.cjs

const path = require("node:path");
const fs   = require("node:fs");

const DIR = path.resolve(__dirname, "../resource/data/master/entities/players");

// 한글 음절 → 로마자
const KO_TO_EN = {
  // 성
  '김':'Kim','이':'Lee','박':'Park','최':'Choi','정':'Jung',
  '강':'Kang','조':'Jo','윤':'Yoon','장':'Jang','임':'Lim',
  '한':'Han','오':'Oh','서':'Seo','신':'Shin','권':'Kwon',
  '황':'Hwang','안':'An','송':'Song','류':'Ryu','전':'Jeon',
  // 이름 앞 음절
  '민':'Min','준':'Jun','현':'Hyeon','재':'Jae','우':'Woo',
  '지':'Ji','도':'Do','성':'Seong','진':'Jin','동':'Dong',
  '태':'Tae','수':'Su','영':'Young','혁':'Hyeok','훈':'Hun',
  '기':'Ki','상':'Sang','세':'Se','찬':'Chan',
  // 이름 뒤 음절
  '원':'Won','환':'Hwan','빈':'Bin','욱':'Wook','식':'Sik',
  '완':'Wan','호':'Ho',
};

function romanize(syl) { return KO_TO_EN[syl] || syl; }

// 3글자 한국 이름 → "Surname Firstname"
function korNameToEn(ko) {
  if (!ko || ko.length !== 3) return ko;
  const sur = ko[0];
  const a   = ko[1];
  const b   = ko[2];
  return `${romanize(sur)} ${romanize(a)}${romanize(b)}`;
}

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".json") && f !== "_index.json");
  let fixed = 0, skipped = 0, errors = 0;

  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DIR, f), "utf8").replace(/^﻿/, "");
      const d   = JSON.parse(raw);

      // 대상: LEAGUE_HIGHSCHOOL 플레이어이면서 nameEn에 한글이 있는 경우
      if (d.leagueId !== "LEAGUE_HIGHSCHOOL" || d.role !== "player") { skipped++; continue; }
      if (!/[가-힣]/.test(d.nameEn || "")) { skipped++; continue; }

      const newNameEn = korNameToEn(d.name);
      if (!newNameEn || newNameEn === d.nameEn) { skipped++; continue; }

      d.nameEn = newNameEn;
      fs.writeFileSync(path.join(DIR, f), JSON.stringify(d, null, 2), "utf8");
      fixed++;
    } catch (e) {
      console.warn(`  [error] ${f}: ${e.message}`);
      errors++;
    }
  }

  console.log(`[fix_hs_name_en] 완료: ${fixed}건 수정, ${skipped}건 스킵, ${errors}건 오류`);
}

main();
