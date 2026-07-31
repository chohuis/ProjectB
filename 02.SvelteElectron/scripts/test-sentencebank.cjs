// 문장 뱅크 회귀 (Phase 7-6a)
//
// DESIGN §7.3: "이벤트 본문을 배열로 두고 **직전 문장을 제외**하고 랜덤 선택.
// 저작 시 3개 미만이면 빌드 실패."
//
// 이 테스트가 "빌드 실패"의 구현이다. 2개짜리 뱅크는 직전 제외가 "무조건
// 번갈아"가 되어 랜덤이 아니라 교대가 된다 — 반복이 더 눈에 띈다.
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/test-sentencebank.cjs

const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const tmpl = require(path.join(ROOT, "resource/data/master/messages/templates.json"));

let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${msg}`);
  if (!cond) fail++;
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf-8");

const TEMPLATES = tmpl.templates;
const MIN = 3;

// ══ 1. 저작 규칙 — 3개 미만 금지 ═════════════════════════════════
console.log("\n[1] 뱅크를 쓰면 3개 이상이어야 한다");

const banked = TEMPLATES.filter((t) => Array.isArray(t.bodies) && t.bodies.length > 0);
ok(banked.length > 0, `뱅크를 쓰는 템플릿이 있다 (${banked.length}개)`);

const undersized = banked.filter((t) => t.bodies.length < MIN);
ok(undersized.length === 0,
   undersized.length === 0
     ? `전부 ${MIN}개 이상 (최소 ${Math.min(...banked.map((t) => t.bodies.length))}개)`
     : `${MIN}개 미만: ${undersized.map((t) => `${t.id}(${t.bodies.length})`).join(", ")}`);

const subjBanked = TEMPLATES.filter((t) => Array.isArray(t.subjects) && t.subjects.length > 0);
const subjUnder = subjBanked.filter((t) => t.subjects.length < MIN);
ok(subjUnder.length === 0,
   `제목 뱅크도 같은 규칙 (${subjBanked.length}개 사용${subjUnder.length ? ` · 위반 ${subjUnder.map((t) => t.id)}` : ""})`);

// ══ 2. 뱅크 안에 중복 문장이 없다 ════════════════════════════════
console.log("\n[2] 같은 뱅크에 같은 문장이 두 번 없다");

// 중복이 있으면 "직전 제외"가 무력해진다 — 다른 인덱스인데 같은 글이 나온다
for (const t of banked) {
  const uniq = new Set(t.bodies.map((b) => b.trim()));
  ok(uniq.size === t.bodies.length,
     `${t.id} — ${t.bodies.length}개 전부 다른 문장${uniq.size !== t.bodies.length ? ` (중복 ${t.bodies.length - uniq.size}건)` : ""}`);
}

// ══ 3. body가 뱅크 첫 항목과 같다 ════════════════════════════════
console.log("\n[3] body는 뱅크 첫 항목이다 (구 경로 폴백)");

// 뱅크를 못 읽는 경로(구 세이브·테스트 헬퍼)가 `body`를 쓴다. 어긋나면
// "화면에 따라 다른 글이 나오는" 상태가 된다
for (const t of banked) {
  ok(t.body === t.bodies[0], `${t.id} — body ↔ bodies[0] 일치`);
}

// ══ 4. 엔진 동작 — 직전 것을 안 뽑는다 ═══════════════════════════
console.log("\n[4] 직전에 쓴 문장을 제외한다");

// sentenceBank.ts를 TS로 못 부르니 같은 로직을 여기 옮기지 않고 **소스를 읽어**
// 계약을 확인한다. 로직을 복제하면 그게 정본이 둘이다
const src = read("apps/ui/src/shared/utils/sentenceBank.ts");
ok(/i !== lastIndex/.test(src), "후보에서 lastIndex를 뺀다");
ok(/MIN_BANK_SIZE = 3/.test(src), `최소 크기 상수가 ${MIN}이다`);
ok(/bank\.length === 1/.test(src), "1개짜리 뱅크는 그대로 낸다 (후보가 비지 않게)");

// 실제 분포는 순수 함수라 여기서 흉내낼 수 있다 — 같은 식을 쓴다
const pick = (n, rand, last) => {
  const cand = [];
  for (let i = 0; i < n; i++) if (i !== last) cand.push(i);
  return cand[Math.floor(Math.min(0.999999, Math.max(0, rand)) * cand.length)] ?? cand[0];
};

for (const size of [3, 4, 5]) {
  let repeated = 0;
  let last = -1;
  const seen = new Set();
  for (let i = 0; i < 3000; i++) {
    const r = ((i * 2654435761) % 1000003) / 1000003; // 결정적 의사난수
    const got = pick(size, r, last);
    if (got === last) repeated++;
    seen.add(got);
    last = got;
  }
  ok(repeated === 0, `${size}개 뱅크 — 3000회 중 연속 반복 0회`);
  ok(seen.size === size, `${size}개 뱅크 — 모든 문장이 실제로 나온다 (${seen.size}/${size})`);
}

// ══ 5. 세이브에 남는가 ═══════════════════════════════════════════
console.log("\n[5] 직전 선택이 세이브에 남는다");

// 안 남기면 로드할 때마다 같은 문장이 나온다 — "직전 제외"의 입력이 사라진다
ok(/sentenceMemory/.test(read("apps/ui/src/shared/types/season.ts")),
   "SeasonState에 sentenceMemory가 있다");
ok(/recordSentencePicks/.test(read("apps/ui/src/shared/stores/season.ts")),
   "season store에 패처가 있다");
ok(/recordSentencePicks\(evResult\.sentencePicks\)/.test(read("apps/ui/src/shared/usecases/advanceWeek.ts")),
   "advanceWeek이 매주 기록한다");
ok(/sentenceMemory: s\.sentenceMemory/.test(read("apps/ui/src/shared/usecases/advanceWeek.ts")),
   "advanceWeek이 직전 기억을 엔진에 넘긴다");

// ══ 6. Math.random이 안 샌다 ═════════════════════════════════════
console.log("\n[6] TS 게임 로직에서 Math.random을 쓰지 않는다");

// CLAUDE.md 금지 항목. 예전 eventEngine은 난수가 모자라면 Math.random()으로
// 새어나갔다 — 결정성이 조용히 깨지는 경로였다
for (const f of ["apps/ui/src/shared/utils/sentenceBank.ts",
                 "apps/ui/src/shared/utils/eventEngine.ts"]) {
  const code = read(f).replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");
  ok(!/Math\.random\(\)/.test(code), `${path.basename(f)} — Math.random 없음`);
}

// ══ 7. 규모 ══════════════════════════════════════════════════════
console.log("\n[7] 규모");

const totalSentences = banked.reduce((a, t) => a + t.bodies.length, 0);
console.log(`    템플릿 ${TEMPLATES.length}개 중 ${banked.length}개에 뱅크 · 문장 ${totalSentences}개` +
  ` (평균 ${(totalSentences / banked.length).toFixed(1)})`);
ok(totalSentences >= banked.length * MIN, "평균이 최소 크기 이상이다");

// ══ 8. 뉴스 — 로그로만 있던 것에 화면이 생겼다 (7-6b) ════════════
console.log("\n[8] 로그로만 있던 사건에 뉴스가 붙었다");

// RESUME가 "UI가 없어 볼 게 없다"고 적어둔 셋
const natl = read("apps/ui/src/shared/usecases/nationalTeam.ts");
ok(/emitSquadNews/.test(natl) && /emitTournamentResultNews/.test(natl),
   "국가대표 발탁·대회 결과가 메시지로 나온다 (7-3은 로그뿐이었다)");
ok(/병역 특례/.test(natl), "병역 면제가 본문에 명시된다 — 세계에서 제일 큰 사건이다");
ok(/wasSelected/.test(natl), "주인공이 대표팀이었는지에 따라 문장이 갈린다");

const mkt = read("apps/ui/src/shared/usecases/weekPhases/market.ts");
ok(/emitFaMarketNews/.test(mkt), "FA 시장 마감이 뉴스로 나온다");
ok(/■ 우리 팀/.test(mkt), "내 팀이 얽힌 계약을 따로 뽑는다 — 남의 팀 소식에 묻히면 놓친다");
ok(/slice\(0, 5\)/.test(mkt), "대형 계약만 자른다 — 수십 건 나열하면 아무도 안 읽는다");

// ══ 9. 감정 문구 — 표시와 동작이 일치한다 (7-6c) ═════════════════
console.log("\n[9] effectHint와 effects가 같은 것을 가리킨다");

// 6C가 걷어낸 문구의 진짜 결함: "trust +5"라고 적고 사기·피로만 움직였다
const relMsg = read("apps/ui/src/shared/utils/relationMessages.ts");
ok(/relationDelta/.test(relMsg), "장면 선택지가 relationDelta를 갖는다");
ok(/withPerson/.test(relMsg),
   "효과 대상을 장면의 상대로 못박는다 — 안 하면 3번 코치 장면에서 1번과 친해진다");

const mainTs = read("apps/ui/src/shared/types/main.ts");
ok(/relationDelta\?:/.test(mainTs), "DecisionEffect에 relationDelta가 있다");
ok(/luxurySpend\?:/.test(mainTs), "DecisionEffect에 luxurySpend가 있다");

// 관계를 말하는 힌트에는 반드시 relationDelta나 luxurySpend가 붙어 있어야 한다
const scenes = [...relMsg.matchAll(/effectHint:\s*"([^"]+)",\s*\n\s*effects:\s*(\{[\s\S]*?\n\s{8}\},)/g)];
ok(scenes.length > 0, `장면 선택지를 ${scenes.length}건 찾았다`);
let mismatch = 0;
for (const [, hint, fxBlock] of scenes) {
  if (/관계/.test(hint) && !/relationDelta|luxurySpend/.test(fxBlock)) {
    mismatch++;
    console.error(`    불일치: "${hint}"`);
  }
}
ok(mismatch === 0, `관계를 말하는 힌트 전부에 실제 효과가 붙어 있다 (불일치 ${mismatch}건)`);

// ══ 10. 선택지 적용 경로가 하나다 ════════════════════════════════
console.log("\n[10] 선택지 적용 경로가 하나다");

// 화면과 자동진행이 다른 함수를 부르면 관계·사치품이 한쪽에서만 돈다
for (const f of ["apps/ui/src/pages/messages/MessagesPage.svelte",
                 "apps/ui/src/shared/usecases/runAutoAdvance.ts"]) {
  const code = read(f);
  ok(/applyDecision/.test(code), `${path.basename(f)} — applyDecision을 쓴다`);
  ok(!/gameStore\.resolveDecision/.test(code),
     `${path.basename(f)} — store를 직접 안 부른다 (관계·사치품이 빠진다)`);
}

const dec = read("apps/ui/src/shared/usecases/decisions.ts");
ok(/calcLuxury/.test(dec), "사치품 계산을 Rust에 맡긴다 (계수를 TS에 복제하지 않는다)");
ok(/Math\.max\(-100, Math\.min\(100/.test(dec),
   "관계값 범위가 Rust clamp_value와 같은 −100~100이다");
ok(/관계 갱신 실패/.test(dec), "관계를 못 써도 선택 자체는 되돌리지 않는다");

console.log(fail === 0 ? "\nALL PASS" : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
