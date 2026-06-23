// scripts/fix_abl_jbl_nationality.cjs
// Phase 1: ABL 4,845명 국적(notes) 재배정
// Phase 2: ABL 한국 20명 이름 교체
// Phase 3: ABL 일본 20명 이름 교체
// Phase 4: JBL 미래 2,750명 이름 교체
// 수정: notes(국적 부분만), name, nameEn
// 유지: militaryStatus, diligence, entryYear, entryLeague, entryTeam, entryAge, details 등 전부
"use strict";
const fs   = require("fs");
const path = require("path");

const ROOT    = path.resolve(__dirname, "..");
const PLY_DIR = path.join(ROOT, "resource/data/master/entities/players");

// ── LCG ───────────────────────────────────────────────────────
function lcg(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 0x100000000; };
}

function shuffle(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── 한국 이름 풀 ──────────────────────────────────────────────
const KR_SUR = [
  ['김','Kim'],['이','Lee'],['박','Park'],['최','Choi'],['정','Jung'],
  ['강','Kang'],['조','Jo'],['윤','Yoon'],['장','Jang'],['임','Lim'],
  ['한','Han'],['오','Oh'],['서','Seo'],['신','Shin'],['권','Kwon'],
  ['황','Hwang'],['안','An'],['송','Song'],['류','Ryu'],['전','Jeon'],
  ['홍','Hong'],['고','Go'],['문','Moon'],['양','Yang'],['손','Son'],
  ['배','Bae'],['백','Baek'],['허','Heo'],['남','Nam'],['심','Shim'],
];
const KR_FIRST = [
  ['민준','Min-jun'],['서준','Seo-jun'],['예준','Ye-jun'],['도윤','Do-yoon'],['시우','Si-woo'],
  ['주원','Ju-won'],['하준','Ha-jun'],['지호','Ji-ho'],['지훈','Ji-hun'],['준서','Jun-seo'],
  ['준혁','Jun-hyuk'],['현우','Hyun-woo'],['도현','Do-hyun'],['건우','Geon-woo'],['재원','Jae-won'],
  ['우진','Woo-jin'],['태양','Tae-yang'],['선우','Seon-woo'],['민재','Min-jae'],['동현','Dong-hyun'],
  ['성민','Sung-min'],['혁진','Hyuk-jin'],['재훈','Jae-hun'],['철민','Chul-min'],['호진','Ho-jin'],
  ['승우','Seung-woo'],['기현','Ki-hyun'],['상훈','Sang-hun'],['종수','Jong-su'],['병철','Byung-chul'],
];

function genKorName(rng) {
  const [surKr, surEn] = KR_SUR[Math.floor(rng() * KR_SUR.length)];
  const [firstKr, firstEn] = KR_FIRST[Math.floor(rng() * KR_FIRST.length)];
  return { name: `${surKr}${firstKr}`, nameEn: `${surEn} ${firstEn}` };
}

// ── 일본 이름 풀 ──────────────────────────────────────────────
const JP_SUR = [
  ['야마모토','Yamamoto'],['사사키','Sasaki'],['무라카미','Murakami'],['고토','Goto'],['다나카','Tanaka'],
  ['스즈키','Suzuki'],['사이토','Saito'],['가토','Kato'],['나카무라','Nakamura'],['고바야시','Kobayashi'],
  ['이토','Ito'],['와타나베','Watanabe'],['야마다','Yamada'],['하야시','Hayashi'],['이노우에','Inoue'],
  ['기무라','Kimura'],['시미즈','Shimizu'],['야마자키','Yamazaki'],['마쓰모토','Matsumoto'],['이케다','Ikeda'],
  ['하시모토','Hashimoto'],['야마시타','Yamashita'],['이시카와','Ishikawa'],['나카지마','Nakajima'],['후지타','Fujita'],
  ['오가와','Ogawa'],['마쓰다','Matsuda'],['후쿠다','Fukuda'],['오카다','Okada'],['하세가와','Hasegawa'],
  ['오노','Ono'],['무라타','Murata'],['후지와라','Fujiwara'],['이와사키','Iwasaki'],['니시무라','Nishimura'],
  ['아베','Abe'],['오카모토','Okamoto'],['나카야마','Nakayama'],['모리','Mori'],['마에다','Maeda'],
];
const JP_FIRST = [
  ['슌','Shun'],['마나부','Manabu'],['아키라','Akira'],['유토','Yuto'],['다이키','Daiki'],
  ['겐지','Kenji'],['다케시','Takeshi'],['히로시','Hiroshi'],['유키','Yuki'],['료','Ryo'],
  ['렌','Ren'],['하루키','Haruki'],['쇼타','Shota'],['유마','Yuma'],['코세이','Kosei'],
  ['료스케','Ryosuke'],['다이스케','Daisuke'],['나오키','Naoki'],['히로키','Hiroki'],['켄타','Kenta'],
  ['소스케','Sosuke'],['류세이','Ryusei'],['아키히로','Akihiro'],['신고','Shingo'],['마사히로','Masahiro'],
  ['도모야','Tomoya'],['야스히로','Yasuhiro'],['유스케','Yusuke'],['가즈키','Kazuki'],['겐타','Genta'],
  ['레이지','Reiji'],['요헤이','Yohei'],['마코토','Makoto'],['신이치','Shinichi'],['고이치','Koichi'],
  ['세이지','Seiji'],['모토키','Motoki'],['준페이','Junpei'],['다카히로','Takahiro'],['켄이치','Kenichi'],
  ['코지','Koji'],['사토시','Satoshi'],['히사시','Hisashi'],['아키오','Akio'],['하루오','Haruo'],
  ['슈지','Shuji'],['이사무','Isamu'],['다카시','Takashi'],['마사루','Masaru'],['노부히로','Nobuhiro'],
  ['쇼헤이','Shohei'],['류타','Ryuta'],['히데키','Hideki'],['카즈야','Kazuya'],['미쓰루','Mitsuru'],
  ['히로유키','Hiroyuki'],['도루','Toru'],['야스시','Yasushi'],['마사토','Masato'],['하야토','Hayato'],
  ['켄스케','Kensuke'],['시게루','Shigeru'],['히데오','Hideo'],['다다시','Tadashi'],['유이치','Yuichi'],
  ['가즈오','Kazuo'],['토시히로','Toshihiro'],['요시아키','Yoshiaki'],['코헤이','Kohei'],['야스노리','Yasunori'],
];

function genJpName(rng) {
  const [surKr, surEn] = JP_SUR[Math.floor(rng() * JP_SUR.length)];
  const [firstKr, firstEn] = JP_FIRST[Math.floor(rng() * JP_FIRST.length)];
  return { name: `${surKr} ${firstKr}`, nameEn: `${surEn} ${firstEn}` };
}

// ── notes 국적 부분만 교체 (다른 메모 유지) ───────────────────
function setNat(notes, nat) {
  const tag = `국적:${nat}`;
  if (!notes) return tag;
  if (/국적:\S+/.test(notes)) return notes.replace(/국적:\S+/, tag);
  return `${tag} ${notes}`;
}

// ── 파일 I/O ─────────────────────────────────────────────────
function readPly(f) {
  const raw = fs.readFileSync(path.join(PLY_DIR, f), "utf8");
  const hasBom = raw.charCodeAt(0) === 0xFEFF;
  return { d: JSON.parse(hasBom ? raw.slice(1) : raw), hasBom };
}

function writePly(f, d, hasBom) {
  const content = (hasBom ? "﻿" : "") + JSON.stringify(d, null, 2);
  fs.writeFileSync(path.join(PLY_DIR, f), content, "utf8");
}

// ── Main ─────────────────────────────────────────────────────
function main() {
  const rng = lcg(20260623);

  console.log("파일 목록 로딩...");
  const allFiles = fs.readdirSync(PLY_DIR).filter(f => f.startsWith("PLY_") && f.endsWith(".json"));
  console.log(`전체 PLY 파일: ${allFiles.length}개`);

  const ablItems    = [];
  const jblFutItems = [];

  // 빠른 1차 필터 (JSON 파싱 전 문자열 검사)
  for (const f of allFiles) {
    const raw = fs.readFileSync(path.join(PLY_DIR, f), "utf8");
    if (!raw.includes("LEAGUE_ABL") && !raw.includes("LEAGUE_JBL")) continue;

    const hasBom = raw.charCodeAt(0) === 0xFEFF;
    const d = JSON.parse(hasBom ? raw.slice(1) : raw);

    if (d.originLeagueId === "LEAGUE_ABL") {
      ablItems.push({ f, d, hasBom });
    } else if (d.originLeagueId === "LEAGUE_JBL" && d.entryYear != null) {
      jblFutItems.push({ f, d, hasBom });
    }
  }

  console.log(`ABL: ${ablItems.length}명 | JBL 미래: ${jblFutItems.length}명`);

  // ── Phase 1~3: ABL 국적 재배정 + 한국/일본 이름 교체 ──────
  console.log("\nPhase 1~3: ABL 국적 재배정 + 이름 교체...");
  shuffle(ablItems, rng);

  const natPlan = [
    { nat: "한국",     count: 20, rename: "korean"   },
    { nat: "일본",     count: 20, rename: "japanese"  },
    { nat: "도미니카", count: 50, rename: null         },
    { nat: "쿠바",     count: 50, rename: null         },
    { nat: "베네수엘라", count: 50, rename: null       },
    { nat: "멕시코",   count: 50, rename: null         },
    { nat: "파나마",   count: 50, rename: null         },
  ];

  let idx = 0;
  for (const { nat, count, rename } of natPlan) {
    for (let i = 0; i < count; i++) {
      const item = ablItems[idx++];
      // notes: 국적 부분만 교체, 나머지 notes 내용 유지
      item.d.notes = setNat(item.d.notes, nat);
      // name/nameEn: 한국/일본만 교체
      if (rename === "korean") {
        const { name, nameEn } = genKorName(rng);
        item.d.name = name;
        item.d.nameEn = nameEn;
      } else if (rename === "japanese") {
        const { name, nameEn } = genJpName(rng);
        item.d.name = name;
        item.d.nameEn = nameEn;
      }
      // 도미니카/쿠바/베네수엘라/멕시코/파나마: 이름 유지 (이미 영어식)
    }
  }
  // 나머지 전부 → 미국 (이름 유지)
  for (; idx < ablItems.length; idx++) {
    ablItems[idx].d.notes = setNat(ablItems[idx].d.notes, "미국");
  }

  // 저장
  for (const { f, d, hasBom } of ablItems) writePly(f, d, hasBom);

  // 결과 집계
  const ablNatResult = {};
  ablItems.forEach(({ d }) => {
    const m = (d.notes || "").match(/국적:(\S+)/);
    const nat = m ? m[1] : "없음";
    ablNatResult[nat] = (ablNatResult[nat] || 0) + 1;
  });
  console.log(`  완료: ABL ${ablItems.length}개`);
  Object.entries(ablNatResult).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`    ${k}: ${v}`));

  // ── Phase 4: JBL 미래 이름 교체 ──────────────────────────
  console.log("\nPhase 4: JBL 미래 이름 교체...");
  for (const { f, d, hasBom } of jblFutItems) {
    // notes(국적:일본), militaryStatus, diligence, entryYear 등 전부 유지
    // name/nameEn만 교체
    const { name, nameEn } = genJpName(rng);
    d.name   = name;
    d.nameEn = nameEn;
    writePly(f, d, hasBom);
  }
  console.log(`  완료: JBL 미래 ${jblFutItems.length}개 이름 교체`);

  console.log("\n[전체 완료] npm run gen:index 실행 권장");
}

main();
