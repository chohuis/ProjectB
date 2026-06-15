// scripts/fix_foreign_player_names.cjs
// ABL/JBL 외국 선수의 name 필드에 한국어 음역 추가 (Option B)
// 변경 전: name="Smith Marcus",  nameEn="Smith Marcus"
// 변경 후: name="스미스 마커스", nameEn="Smith Marcus"
// 실행: node scripts/fix_foreign_player_names.cjs

const path = require("node:path");
const fs   = require("node:fs");

const DIR = path.resolve(__dirname, "../resource/data/master/entities/players");

// 영문 → 한국어 음역 사전
const EN_TO_KO = {
  // 성 (Last names)
  'Smith':'스미스','Johnson':'존슨','Williams':'윌리엄스','Brown':'브라운',
  'Jones':'존스','Garcia':'가르시아','Martinez':'마르티네스','Anderson':'앤더슨',
  'Taylor':'테일러','Thomas':'토마스','Hernandez':'에르난데스','Moore':'무어',
  'Jackson':'잭슨','White':'화이트','Harris':'해리스','Martin':'마틴',
  'Thompson':'톰슨','Young':'영','Davis':'데이비스','Robinson':'로빈슨',
  'Clark':'클라크','Rodriguez':'로드리게스','Lewis':'루이스','Lee':'리',
  'Walker':'워커','Hall':'홀','Allen':'앨런','King':'킹','Wright':'라이트',
  'Scott':'스콧','Green':'그린','Baker':'베이커','Adams':'애덤스',
  'Nelson':'넬슨','Carter':'카터','Mitchell':'미첼',

  // 이름 (First names)
  'Marcus':'마커스','Tyler':'타일러','Jordan':'조던','Carlos':'카를로스',
  'Luis':'루이스','Miguel':'미겔','Ryan':'라이언','Derek':'데릭',
  'Brandon':'브랜던','Kevin':'케빈','Jason':'제이슨','Chris':'크리스',
  'Daniel':'다니엘','Eric':'에릭','Kyle':'카일','Nathan':'네이선',
  'Alex':'알렉스','Sean':'숀','Jake':'제이크','Trevor':'트레버',
  'Cody':'코디','Zach':'재크','Austin':'오스틴','Hunter':'헌터',
  'Connor':'코너','Logan':'로건','Dylan':'딜런','Blake':'블레이크',
  'Caleb':'칼렙','Evan':'에반','Cole':'콜','Grant':'그랜트',

  // 추가 이름 (기존 ABL entity 파일 커버리지)
  'Anthony':'앤서니','George':'조지','James':'제임스','John':'존',
  'William':'윌리엄','Charles':'찰스','Christopher':'크리스토퍼',
  'Matthew':'매튜','Aaron':'아론','Justin':'저스틴','Mark':'마크',
  'Donald':'도널드','Steve':'스티브','Brian':'브라이언','Robert':'로버트',
  'Richard':'리처드','Joseph':'조셉','Charlie':'찰리','Benjamin':'벤자민',
  'Samuel':'새뮤얼','Nick':'닉','Jonathan':'조너선','Andrew':'앤드류',
  'Patrick':'패트릭','Jack':'잭','Michael':'마이클','Mason':'매슨',
  'Ethan':'이선','Noah':'노아','Oliver':'올리버','Elijah':'엘리야',
  'Henry':'헨리','Lucas':'루카스','Levi':'레비','Aiden':'아이든',
  'Marco':'마르코','David':'데이비드','William':'윌리엄',
  'Alejandro':'알레한드로','Diego':'디에고','Roberto':'로베르토',
  'Francisco':'프란시스코','Antonio':'안토니오','Gabriel':'가브리엘',
  'Rafael':'라파엘','Jose':'호세','Eduardo':'에두아르도',
  // 누락 성 (Last names)
  'Wilson':'윌슨','Miller':'밀러','Perez':'페레스','Ramirez':'라미레스',
  'Sanchez':'산체스','Torres':'토레스','Flores':'플로레스','Gonzalez':'곤살레스',
  'Rivera':'리베라','Gomez':'고메스','Diaz':'디아스','Reyes':'레예스',
  'Cruz':'크루스','Ortiz':'오르티스','Lopez':'로페스','Bennett':'베넷',
  'Cooper':'쿠퍼','Reed':'리드','Bailey':'베일리','Collins':'콜린스',
  'Ward':'워드','Price':'프라이스','Morgan':'모건','Bell':'벨',
  'Murphy':'머피','Nguyen':'응우옌','Hughes':'휴즈','Cox':'콕스',
  // 누락 이름 (First names)
  'Adrian':'에이드리언','Jacob':'제이콥','Victor':'빅터','Juan':'후안',
  'Nicholas':'니콜라스','Liam':'리엄','Sebastian':'세바스티안','Mateo':'마테오',
  'Jayden':'제이든','Nolan':'놀란','Owen':'오웬','Wyatt':'와이어트',
  'Hudson':'허드슨','Isaiah':'이사야','Eli':'엘리','Xavier':'자비에',
  'Landon':'랜던','Lincoln':'링컨','Roman':'로만','Leo':'레오',
  'Max':'맥스','Ivan':'이반','Mario':'마리오','Jorge':'호르헤',
  'Ricardo':'리카르도','Fernando':'페르난도','Leonardo':'레오나르도',
  'Santiago':'산티아고','Emmanuel':'에마뉘엘','Javier':'하비에르',
  'Diego':'디에고','Carlos':'카를로스',
};

// "Last First" 영문 → "한국어Last 한국어First" 변환
function toKorean(enName) {
  if (!enName) return null;
  const parts = enName.trim().split(/\s+/);
  const koParts = parts.map(p => EN_TO_KO[p] || null);
  // 변환 실패한 부분이 있으면 null 반환
  if (koParts.some(p => p === null)) return null;
  return koParts.join(' ');
}

function main() {
  const files = fs.readdirSync(DIR).filter(f => f.endsWith(".json") && f !== "_index.json");
  let fixed = 0, skipped = 0, failed = 0, errors = 0;
  const failedList = [];

  for (const f of files) {
    try {
      const raw = fs.readFileSync(path.join(DIR, f), "utf8").replace(/^﻿/, "");
      const d   = JSON.parse(raw);

      // 대상: ABL 또는 JBL 플레이어이면서 name이 영문 (한글 없음)
      const isAblJbl = d.leagueId === "LEAGUE_ABL" || d.leagueId === "LEAGUE_JBL";
      if (!isAblJbl || d.role !== "player") { skipped++; continue; }
      if (/[가-힣]/.test(d.name || "")) { skipped++; continue; }  // 이미 한글 있으면 스킵

      const koName = toKorean(d.name);
      if (!koName) {
        failedList.push({ f, name: d.name });
        failed++;
        continue;
      }

      // nameEn은 기존 영문 유지, name만 한국어 음역으로 교체
      d.nameEn = d.name;    // 영문을 nameEn에 보존 (이미 같은 경우도 있음)
      d.name   = koName;
      fs.writeFileSync(path.join(DIR, f), JSON.stringify(d, null, 2), "utf8");
      fixed++;
    } catch (e) {
      console.warn(`  [error] ${f}: ${e.message}`);
      errors++;
    }
  }

  console.log(`[fix_foreign_player_names] 완료: ${fixed}건 수정, ${skipped}건 스킵, ${failed}건 변환실패, ${errors}건 오류`);
  if (failedList.length > 0) {
    console.log(`\n변환 실패 목록 (사전에 없는 이름) — 수동 확인 필요:`);
    failedList.slice(0, 20).forEach(i => console.log(`  ${i.f}: "${i.name}"`));
    if (failedList.length > 20) console.log(`  ... 외 ${failedList.length - 20}건`);
  }
}

main();
