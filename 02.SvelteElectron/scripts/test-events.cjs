"use strict";
// 이벤트 정합성 회귀 — 실행: npm run test:events
//
// **"파일은 있는데 영영 안 뜬다"를 정적으로 잡는다.** Phase 8에서 나온 결함
// 26건이 전부 그 계열이었고, 프로 이벤트 171개를 넣자마자 같은 게 두 건 나왔다:
//
//   EVT_PRO_FATIGUE_HIGH (pri 800, fatigue≥75)
//     ← EVT_COND_FATIGUE_WARNING (pri 900, fatigue≥75, 전 무대)
//   EVT_PRO_CONFIDENCE_LOW (pri 720, morale≤35)
//     ← EVT_COND_SLUMP (pri 850, morale≤38, 전 무대)
//
// 조건부는 **주당 1개만** 발동한다(`eventEngine` §2 — 우선순위 내림차순 첫 번째).
// 그래서 "나보다 우선순위가 높으면서 내 조건이 참일 때 항상 같이 참인" 이벤트가
// 있으면 나는 영원히 뽑히지 않는다. 돌려보지 않고도 알 수 있는 결함이다.

const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.join(__dirname, "..");
const EV = path.join(ROOT, "resource/data/master/events");
const MSG = JSON.parse(fs.readFileSync(path.join(ROOT, "resource/data/master/messages/templates.json"), "utf8")).templates;
const DEC = JSON.parse(fs.readFileSync(path.join(ROOT, "resource/data/master/messages/decision_templates.json"), "utf8")).decisions;

let failed = 0;
const ok = (name, cond, extra = "") => {
  if (cond) console.log(`  ok  ${name}`);
  else { failed++; console.error(`FAIL  ${name}\n      ${extra}`); }
};

// ── 이벤트 수집 (목록 하드코딩 안 함 — 디렉터리를 훑는다) ────────
function collect(dir) {
  const out = [];
  const full = path.join(EV, dir);
  if (!fs.existsSync(full)) return out;
  for (const f of fs.readdirSync(full)) {
    if (!f.endsWith(".json") || f.startsWith("_")) continue;
    out.push({ ...JSON.parse(fs.readFileSync(path.join(full, f), "utf8")), _file: `${dir}/${f}` });
  }
  return out;
}
const DIRS = ["mandatory", "conditional", "random/media", "random/social", "random/team_life"];
const ALL = DIRS.flatMap(collect);
console.log(`\n이벤트 ${ALL.length}개 · 메시지 ${MSG.length} · 선택지 ${DEC.length}`);

// ── 1. 참조 무결성 ────────────────────────────────────────────
console.log("\n[1] 템플릿 참조가 전부 존재한다");
const msgIds = new Set(MSG.map((m) => m.id));
const decIds = new Set(DEC.map((d) => d.id));
const missMsg = ALL.filter((e) => e.messageTemplateId && !msgIds.has(e.messageTemplateId));
const missDec = ALL.filter((e) => e.decisionTemplateId && !decIds.has(e.decisionTemplateId));
ok(`메시지 템플릿 누락 없음`, missMsg.length === 0,
  missMsg.map((e) => `${e.id} → ${e.messageTemplateId}`).join("\n      "));
ok(`선택지 템플릿 누락 없음`, missDec.length === 0,
  missDec.map((e) => `${e.id} → ${e.decisionTemplateId}`).join("\n      "));

// 본문도 선택지도 없으면 메시지함에 빈 칸으로 보인다 (실제 결함 #18)
const msgById = new Map(MSG.map((m) => [m.id, m]));
const empty = ALL.filter((e) => {
  const m = e.messageTemplateId ? msgById.get(e.messageTemplateId) : null;
  return (!m || !String(m.body ?? "").trim()) && !e.decisionTemplateId;
});
// 엔진은 빈 이벤트를 **띄우지 않고 트리거만 소비**한다(결함 #18 대응).
// 그래서 화면에 빈 칸이 뜨지는 않는다 — 다만 자리를 차지하므로 참고로 남긴다.
console.log(`    (참고) 본문·선택지 둘 다 없는 이벤트 ${empty.length}건 — 엔진이 스킵한다: ${empty.map((e) => e.id).join(", ")}`);

// ── 2. 랜덤 이벤트의 poolId가 실재하는 풀을 가리킨다 ──────────
console.log("\n[2] 랜덤 이벤트의 poolId가 실재한다");
//
// ⚠ **`pool.eventIds`는 선택에 안 쓰인다.** 엔진은 이벤트 자신의 `poolId`로
// 묶는다(`eventEngine` §3 `poolRuleMap`). `eventIds`는 `masterStore`가 파싱만
// 하고 아무도 읽지 않는 **죽은 목록**이라, 실제로 고교·대학 랜덤 54개가
// 거기 없는데도 정상적으로 뜬다. 그 목록을 근거로 삼으면 틀린다.
// 진짜 불변식은 "poolId가 실재하는 풀을 가리키는가"다 — 아니면 안 뽑힌다.
const poolDir = path.join(EV, "pools");
const pools = fs.readdirSync(poolDir)
  .filter((f) => f.endsWith(".json"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(poolDir, f), "utf8")))
  .filter((p) => p.id);
const poolIds = new Set(pools.map((p) => p.id));
const randoms = ALL.filter((e) => e.type === "random");
const orphan = randoms.filter((e) => !e.poolId || !poolIds.has(e.poolId));
ok(`랜덤 ${randoms.length}개의 poolId가 전부 실재한다`, orphan.length === 0,
  `없는 풀을 가리킴(영영 안 뽑힘): ${orphan.map((e) => `${e.id}→${e.poolId ?? "(없음)"}`).join(", ")}`);
const staleIds = pools.flatMap((p) => p.eventIds ?? []).filter((id) => !ALL.some((e) => e.id === id));
console.log(`    (참고) pools의 eventIds는 엔진이 안 읽는다 — 유령 항목 ${staleIds.length}건`);

// ── 3. 우선순위에 완전히 가려진 조건부가 없다 ─────────────────
console.log("\n[3] 조건부가 상위 우선순위에 완전히 가려지지 않는다");
//
// 조건부는 주당 1개만 발동한다. A의 조건이 참일 때 B의 조건도 **항상** 참이고
// B의 우선순위가 더 높으면, A는 영원히 뽑히지 않는다.
//
// 완전한 함의 판정은 어렵다. 실제로 걸린 형태만 본다:
//   · B의 조건이 A의 조건의 부분집합이고
//   · 같은 축(type+stat)에서 B의 문턱이 A보다 느슨하다
// 이 두 가지면 "A ⇒ B"가 성립한다.
const LOOSER = {
  fatigue_gte: (b, a) => b <= a,   // B의 하한이 낮으면 더 느슨
  condition_gte: (b, a) => b <= a,
  morale_gte: (b, a) => b <= a,
  fame_gte: (b, a) => b <= a,
  pro_year_gte: (b, a) => b <= a,
  season_ip_gte: (b, a) => b <= a,
  season_k_gte: (b, a) => b <= a,
  season_wins_gte: (b, a) => b <= a,
  pitching_ovr_gte: (b, a) => b <= a,
  week_gte: (b, a) => b <= a,
  fatigue_lte: (b, a) => b >= a,   // B의 상한이 높으면 더 느슨
  condition_lte: (b, a) => b >= a,
  morale_lte: (b, a) => b >= a,
  pitching_ovr_lte: (b, a) => b >= a,
  season_era_lte: (b, a) => b >= a,
  week_lte: (b, a) => b >= a,
  team_rank_lte: (b, a) => b >= a,
  team_rank_gte: (b, a) => b <= a,
};
const keyOf = (c) => `${c.type}${c.stat ? ":" + c.stat : ""}`;

/** A의 조건이 참이면 B의 조건도 항상 참인가 */
function implies(a, b) {
  const aMap = new Map((a.conditions ?? []).map((c) => [keyOf(c), c]));
  for (const bc of b.conditions ?? []) {
    const ac = aMap.get(keyOf(bc));
    if (!ac) return false;                       // A가 안 거는 축을 B가 건다 → 함의 없음
    if (bc.type === "career_stage") { if (ac.stage !== bc.stage) return false; continue; }
    if (bc.type === "league_id")    { if (ac.leagueId !== bc.leagueId) return false; continue; }
    const cmp = LOOSER[bc.type];
    if (!cmp) { if (JSON.stringify(ac) !== JSON.stringify(bc)) return false; continue; }
    if (!cmp(bc.value, ac.value)) return false;  // B가 A보다 빡빡하면 함의 없음
  }
  return true;
}

// ⚠ **쿨다운을 봐야 한다.** 상위 이벤트가 쿨다운에 들어가면 그 주에는 하위가
// 뽑힌다 — 함의만 보고 전부 "죽었다"고 하면 과잉 보고다(처음에 26건이 나왔는데
// 대부분 쿨다운·1회성이라 실제로는 뜬다).
//
// 확실히 죽는 건 **조건이 완전히 같은데 우선순위만 낮은** 경우다. 그때는
// 상위가 쿨다운일 때조차 `oncePolicy`가 같으면 함께 막히거나, 뜨더라도
// 사실상 같은 이벤트를 두 번 적은 것이다.
const normCond = (e) => JSON.stringify(
  (e.conditions ?? []).map(keyOf.length ? (c) => ({ ...c }) : (c) => c)
    .map((c) => ({ k: keyOf(c), v: c.value ?? c.stage ?? c.leagueId }))
    .sort((x, y) => (x.k < y.k ? -1 : 1)));

const conds = ALL.filter((e) => e.type === "conditional");
const dead = [];
const partial = [];
for (const a of conds) {
  for (const b of conds) {
    if (a.id === b.id) continue;
    if ((b.priority ?? 0) <= (a.priority ?? 0)) continue;
    if (!implies(a, b)) continue;
    // 상위가 **쿨다운도 1회성도 없으면** 매주 이긴다 → 하위는 영영 못 뜬다.
    // 쿨다운이 있으면 그 사이에 하위가 뜨므로 죽은 게 아니다.
    const bAlways = b.oncePolicy === "repeatable" && !(b.cooldownWeeks > 0);
    if (bAlways && normCond(a) === normCond(b)) {
      dead.push(`${a.id}(${a.priority}) ≡ ${b.id}(${b.priority}, 쿨다운 없음)`);
    } else {
      partial.push(`${a.id}(${a.priority}) ← ${b.id}(${b.priority})`);
    }
    break;
  }
}
ok(`조건이 같은데 우선순위만 낮은 이벤트 없음 (조건부 ${conds.length}개)`,
  dead.length === 0,
  `영영 안 뜸 — 같은 이벤트를 두 번 적었다:\n      ${dead.join("\n      ")}`);
console.log(`    (참고) 상위와 조건이 겹쳐 경합하는 쌍 ${partial.length}건 — 쿨다운 덕에 뜨긴 한다`);

// ── 4. 무대별 밀도 ────────────────────────────────────────────
console.log("\n[4] 무대별 이벤트 수");
const stageOf = (e) => (e.conditions ?? []).find((c) => c.type === "career_stage")?.stage ?? "전체";
const byStage = {};
for (const e of ALL) byStage[stageOf(e)] = (byStage[stageOf(e)] ?? 0) + 1;
for (const [s, n] of Object.entries(byStage).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${s.padEnd(12)} ${String(n).padStart(4)}`);
}
// 프로는 커리어 최장 구간이다 — 고교보다 적으면 밀도가 반비례한다
ok("프로 이벤트가 고교의 절반 이상이다",
  (byStage["pro_kbl"] ?? 0) >= (byStage["highschool"] ?? 0) * 0.5,
  `프로 ${byStage["pro_kbl"] ?? 0} · 고교 ${byStage["highschool"] ?? 0}`);

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
