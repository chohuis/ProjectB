/**
 * fix-ages-and-names.mjs
 * 1. 고교 선수 나이: grade 1=17, grade 2=18, grade 3=19 로 통일
 * 2. 프로 선수 나이: 18 미만 → 19 보정, 42 초과 → 40 캡
 * 3. nameEn: 한국어 이름 → 수정된 로마자 표기법으로 재생성
 *
 * 실행: node scripts/fix-ages-and-names.mjs
 */

import { readFileSync, writeFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLAYERS_DIR = resolve(__dirname, "../resource/data/master/entities/players");

// ─────────────────────────────────────────────────────────────
// 한국어 → 로마자 표기 (수정 로마자 표기법 + 관용 성씨 테이블)
// ─────────────────────────────────────────────────────────────

// 관용 성씨 표기 (수정 로마자와 다른 관용형 우선)
const SURNAME_MAP = {
  "김": "Kim",  "이": "Lee",  "박": "Park", "최": "Choi", "정": "Jeong",
  "강": "Kang", "조": "Jo",   "윤": "Yoon", "장": "Jang", "임": "Lim",
  "한": "Han",  "오": "Oh",   "서": "Seo",  "신": "Shin", "권": "Kwon",
  "황": "Hwang","안": "Ahn",  "송": "Song", "류": "Ryu",  "전": "Jeon",
  "홍": "Hong", "고": "Ko",   "문": "Moon", "양": "Yang", "손": "Son",
  "배": "Bae",  "백": "Baek", "허": "Heo",  "유": "Yoo",  "남": "Nam",
  "심": "Sim",  "노": "Noh",  "하": "Ha",   "곽": "Kwak", "성": "Seong",
  "차": "Cha",  "주": "Joo",  "우": "Woo",  "구": "Koo",  "나": "Na",
  "민": "Min",  "진": "Jin",  "지": "Ji",   "엄": "Eom",  "채": "Chae",
  "원": "Won",  "천": "Cheon","방": "Bang", "공": "Kong", "기": "Ki",
  "탁": "Tak",  "변": "Byeon","도": "Do",   "소": "So",   "길": "Gil",
  "라": "Ra",   "마": "Ma",   "위": "Wi",   "표": "Pyo",  "왕": "Wang",
  "반": "Ban",  "명": "Myeong","경": "Gyeong","피": "Pi",  "단": "Dan",
  "노": "No",   "석": "Seok", "함": "Ham",  "봉": "Bong", "추": "Chu",
  "모": "Mo",   "어": "Eo",   "연": "Yeon", "음": "Eum",  "인": "In",
};

// 초성 (19개)
const INITIALS = ["g","kk","n","d","tt","r","m","b","pp","s","ss","","j","jj","ch","k","t","p","h"];
// 중성 (21개)
const VOWELS = ["a","ae","ya","yae","eo","e","yeo","ye","o","wa","wae","oe","yo","u","wo","we","wi","yu","eu","ui","i"];
// 종성 — 단독/자음 앞 (28개, 0=없음)
const FINALS = ["","k","kk","ks","n","nj","nh","t","l","lk","lm","lb","ls","lt","lp","lh","m","p","ps","t","ss","ng","t","t","k","t","p","h"];
// 종성 → 다음 음절 초성(연음, 다음이 ㅇ 초성일 때)
const LIAISON = ["","g","kk","gs","n","nj","nh","d","r","lk","lm","lb","ls","lt","lp","lh","m","b","bs","s","ss","ng","j","ch","k","t","p","h"];

function decompose(ch) {
  const code = ch.charCodeAt(0) - 0xAC00;
  if (code < 0 || code > 11171) return null;
  return {
    initial: Math.floor(code / 588),
    vowel:   Math.floor((code % 588) / 28),
    final:   code % 28,
  };
}

// 단일 음절 로마자 변환
function syllableRoman(s, nextInitial) {
  const liaison = nextInitial === 11; // 다음 음절 초성이 ㅇ (묵음)
  return INITIALS[s.initial] + VOWELS[s.vowel] + (s.final ? (liaison ? LIAISON[s.final] : FINALS[s.final]) : "");
}

function romanizeWord(word) {
  const syls = [...word].map(decompose);
  if (syls.some(s => s === null)) return word; // 한글이 아닌 문자 포함
  let result = "";
  for (let i = 0; i < syls.length; i++) {
    const nextInitial = i + 1 < syls.length ? syls[i + 1].initial : -1;
    result += syllableRoman(syls[i], nextInitial);
  }
  return result;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function koreanToEnglish(name) {
  if (!name || name.length === 0) return name;
  const surname   = name[0];
  const givenName = name.slice(1);

  const surnameEn   = SURNAME_MAP[surname] ?? capitalize(romanizeWord(surname));
  const givenNameEn = capitalize(romanizeWord(givenName));

  return `${surnameEn} ${givenNameEn}`;
}

// ─────────────────────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────────────────────

function readJson(path) { return JSON.parse(readFileSync(path, "utf8")); }
function writeJson(path, data) { writeFileSync(path, JSON.stringify(data, null, 2) + "\n", "utf8"); }

const files = readdirSync(PLAYERS_DIR).filter(f => f.endsWith(".json")).map(f => join(PLAYERS_DIR, f));

const GRADE_AGE = { 1: 17, 2: 18, 3: 19 };
let fixedAge = 0, fixedName = 0;

for (const file of files) {
  const data = readJson(file);
  let changed = false;

  // ── 나이 수정 ──────────────────────────────────────────────
  const league = data.leagueId ?? "";
  if (league.includes("HIGHSCHOOL") && data.grade) {
    const correct = GRADE_AGE[data.grade];
    if (correct && data.age !== correct) {
      data.age = correct;
      changed = true;
      fixedAge++;
    }
  } else if (league.includes("KBL") || league.includes("ABL") || league.includes("INDEPENDENT")) {
    // 프로: 최소 19살, 최대 40살
    if (data.age < 19) { data.age = 19; changed = true; fixedAge++; }
    if (data.age > 40) { data.age = 40; changed = true; fixedAge++; }
  }

  // ── 이름 로마자 재생성 ─────────────────────────────────────
  if (data.name && /[가-힣]/.test(data.name)) {
    const newNameEn = koreanToEnglish(data.name);
    if (data.nameEn !== newNameEn) {
      data.nameEn = newNameEn;
      changed = true;
      fixedName++;
    }
  }

  if (changed) writeJson(file, data);
}

console.log(`완료: 나이 수정 ${fixedAge}개, 이름 수정 ${fixedName}개`);

// ── 검증 샘플 출력 ─────────────────────────────────────────
const samples = [
  ["박동혁", "Park Donghyeok"],
  ["김민준", "Kim Minjun"],
  ["이서연", "Lee Seoyeon"],
  ["최영훈", "Choi Yeonghun"],
  ["정재원", "Jeong Jaewon"],
].map(([kor]) => `${kor} → ${koreanToEnglish(kor)}`);
console.log("\n로마자 변환 샘플:");
samples.forEach(s => console.log(" ", s));
