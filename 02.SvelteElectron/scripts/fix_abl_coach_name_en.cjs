// scripts/fix_abl_coach_name_en.cjs
// ABL 코치/감독의 nameEn에 한글이 섞인 문제 수정
// name의 한국 음역을 기반으로 올바른 영문 nameEn을 복원
// 실행: node scripts/fix_abl_coach_name_en.cjs

const path = require("node:path");
const fs   = require("node:fs");

const DIR = path.resolve(__dirname, "../resource/data/master/entities/players");

// 한국어 음역 → 원본 영문 역변환 사전
// name에 들어가는 한국어 음역 단어 → 영문
const KO_PHONETIC_TO_EN = {
  // 성 (Last names)
  '스미스':'Smith','존슨':'Johnson','윌리엄스':'Williams','브라운':'Brown',
  '존스':'Jones','가르시아':'Garcia','마르티네스':'Martinez','앤더슨':'Anderson',
  '테일러':'Taylor','토마스':'Thomas','에르난데스':'Hernandez','무어':'Moore',
  '잭슨':'Jackson','화이트':'White','해리스':'Harris','마틴':'Martin',
  '톰슨':'Thompson','영':'Young','데이비스':'Davis','로빈슨':'Robinson',
  '클라크':'Clark','로드리게스':'Rodriguez','루이스':'Lewis','리':'Lee',
  '워커':'Walker','홀':'Hall','앨런':'Allen','킹':'King','라이트':'Wright',
  '스콧':'Scott','그린':'Green','베이커':'Baker','애덤스':'Adams',
  '넬슨':'Nelson','카터':'Carter','미첼':'Mitchell',

  // 이름 (First names)
  '마커스':'Marcus','타일러':'Tyler','조던':'Jordan','카를로스':'Carlos',
  '루이스':'Luis','미겔':'Miguel','라이언':'Ryan','데릭':'Derek',
  '브랜던':'Brandon','케빈':'Kevin','제이슨':'Jason','크리스':'Chris',
  '다니엘':'Daniel','에릭':'Eric','카일':'Kyle','네이선':'Nathan',
  '알렉스':'Alex','숀':'Sean','제이크':'Jake','트레버':'Trevor',
  '코디':'Cody','재크':'Zach','오스틴':'Austin','헌터':'Hunter',
  '코너':'Connor','로건':'Logan','딜런':'Dylan','블레이크':'Blake',
  '칼렙':'Caleb','에반':'Evan','콜':'Cole','그랜트':'Grant',

  // 추가 이름
  '앤서니':'Anthony','조지':'George','제임스':'James','존':'John',
  '윌리엄':'William','찰스':'Charles','크리스토퍼':'Christopher',
  '매튜':'Matthew','아론':'Aaron','저스틴':'Justin','마크':'Mark',
  '도널드':'Donald','스티브':'Steve','브라이언':'Brian','로버트':'Robert',
  '리처드':'Richard','조셉':'Joseph','토머스':'Thomas','찰리':'Charlie',
  '벤자민':'Benjamin','새뮤얼':'Samuel','닉':'Nick','조너선':'Jonathan',
  '앤드류':'Andrew','패트릭':'Patrick','잭':'Jack','마이클':'Michael',
  '매슨':'Mason','이선':'Ethan','노아':'Noah','메이슨':'Mason',
  '올리버':'Oliver','엘리야':'Elijah','헨리':'Henry','다니얼':'Daniel',
  '루카스':'Lucas','레비':'Levi','핀리':'Finley','아이든':'Aiden',
  // 누락 성 (Last names)
  '윌슨':'Wilson','밀러':'Miller','페레스':'Perez','플로레스':'Flores',
  '곤살레스':'Gonzalez','토레스':'Torres','산체스':'Sanchez',
  // 누락 이름 (First names)
  '데이비드':'David','빅터':'Victor','니콜라스':'Nicholas','리엄':'Liam',
  '후안':'Juan','에이든':'Aiden','일라이저':'Elijah','애드리언':'Adrian',
  '하비에르':'Javier','로건':'Logan',
  // 표기 변형 보완
  '톰프슨':'Thompson',
  // 누락 (원본 파일에서 잘린 항목)
  '알레한드로':'Alejandro','디에고':'Diego','호세':'Jose','프란시스코':'Francisco',
  '로베르토':'Roberto','안토니오':'Antonio','가브리엘':'Gabriel',
  '라파엘':'Rafael','에두아르도':'Eduardo',
};

// name에서 단어별로 역변환해 영문 생성
function toEnglish(korName) {
  if (!korName) return korName;
  const parts = korName.trim().split(/\s+/);
  const enParts = parts.map(p => KO_PHONETIC_TO_EN[p] || p);
  // 한글이 하나라도 남아있으면 변환 실패
  if (enParts.some(p => /[가-힣]/.test(p))) return null;
  return enParts.join(' ');
}

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".json") && f !== "_index.json");
  let fixed = 0, skipped = 0, failed = 0, errors = 0;

  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DIR, f), "utf8").replace(/^﻿/, "");
      const d   = JSON.parse(raw);

      // 대상: ABL 코치/감독이면서 nameEn에 한글이 있는 경우
      const isTarget = (d.role === "coach" || d.role === "manager") &&
                       d.leagueId === "LEAGUE_ABL" &&
                       /[가-힣]/.test(d.nameEn || "");
      if (!isTarget) { skipped++; continue; }

      const newNameEn = toEnglish(d.name);
      if (!newNameEn) {
        console.warn(`  [변환실패] ${f}: name="${d.name}" → 역변환 불가`);
        failed++;
        continue;
      }

      d.nameEn = newNameEn;
      fs.writeFileSync(path.join(DIR, f), JSON.stringify(d, null, 2), "utf8");
      fixed++;
    } catch (e) {
      console.warn(`  [error] ${f}: ${e.message}`);
      errors++;
    }
  }

  console.log(`[fix_abl_coach_name_en] 완료: ${fixed}건 수정, ${skipped}건 스킵, ${failed}건 변환실패, ${errors}건 오류`);
  if (failed > 0) {
    console.log("  변환실패 항목은 수동으로 확인 후 nameEn을 직접 수정해주세요.");
  }
}

main();
