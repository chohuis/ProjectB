// 대학·고교 비경기성 이벤트 회귀 (Phase 7-7)
//
// **실데이터로 돌린다.** 합성 팀 목록으로는 "남/북이 한쪽으로 쏠린다" 같은
// 결함이 안 잡힌다 — refs의 실제 도시 분포가 있어야 보인다.
//
// 실행: ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/test-campus.cjs

const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));

const R = gr.campusEvents;
let fail = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "ok " : "FAIL"} ${msg}`);
  if (!cond) fail++;
};
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf-8");
const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

// ── 실데이터 후보 생성 ───────────────────────────────────────────
// TS의 regionOf와 같은 목록을 쓴다 (소스에서 뽑아 복제하지 않는다)
const src = read("apps/ui/src/shared/usecases/campusEvents.ts");
const cityBlock = src.slice(src.indexOf("const SOUTH_CITIES"), src.indexOf("]);", src.indexOf("const SOUTH_CITIES")));
const SOUTH = new Set([...cityBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]));
const regionOf = (city) => (city && SOUTH.has(city) ? "south" : "north");

const POS = ["SP", "RP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];
function buildCandidates(leagueId, perTeam) {
  const teams = refs.teams.filter((t) => t.leagueId === leagueId);
  const out = [];
  teams.forEach((t, ti) => {
    for (let i = 0; i < perTeam; i++) {
      out.push({
        npcId: `${t.id}_P${String(i).padStart(2, "0")}`,
        name: `${t.name.slice(0, 4)}${i}`,
        teamId: t.id,
        region: regionOf(t.city),
        position: POS[i % POS.length],
        ovr: 45 + ((ti * 7 + i * 13) % 45),
        age: leagueId === "LEAGUE_HIGHSCHOOL" ? 18 : 21,
        grade: (i % 3) + 1,
        scoutScore: (ti * 11 + i * 5) % 100,
        popularity: (ti * 17 + i * 3) % 100,
        form: 0,
        isProtagonist: ti === 0 && i === 0,
      });
    }
  });
  return { teams, candidates: out };
}

// ══ 1. 남/북 분할이 한쪽으로 안 쏠린다 ═══════════════════════════
console.log("\n[1] 올스타전 남/북 분할 (실제 도시 분포)");

const univ = buildCandidates("LEAGUE_UNIVERSITY", 30);
const northTeams = univ.teams.filter((t) => regionOf(t.city) === "north").length;
const southTeams = univ.teams.filter((t) => regionOf(t.city) === "south").length;
console.log(`    대학 ${univ.teams.length}교 — 북 ${northTeams} · 남 ${southTeams}`);

// 한쪽이 캡×인원을 못 채우면 라인업이 안 나온다
const minTeams = Math.ceil(R.allstar.squadSize / R.allstar.perSchoolCap);
ok(northTeams >= minTeams, `북군에 ${minTeams}개교 이상 (${northTeams}) — 캡 ${R.allstar.perSchoolCap}으로 ${R.allstar.squadSize}명을 채우려면 필요하다`);
ok(southTeams >= minTeams, `남군에 ${minTeams}개교 이상 (${southTeams})`);

// ══ 2. 올스타 — 캡·포지션·규모 ═══════════════════════════════════
console.log("\n[2] 올스타 선발 (실데이터 50개교)");

const allstar = call("runAllstarNative", {
  rules: R.allstar, candidates: univ.candidates, worldSeed: 4242, year: 2030,
});
for (const [label, side] of [["북군", allstar.north], ["남군", allstar.south]]) {
  ok(side.length === R.allstar.squadSize, `${label} ${side.length}명 = 정원 ${R.allstar.squadSize}`);

  const per = {};
  for (const p of side) per[p.teamId] = (per[p.teamId] ?? 0) + 1;
  const over = Object.entries(per).filter(([, n]) => n > R.allstar.perSchoolCap);
  ok(over.length === 0,
     `${label} 대학당 캡 ${R.allstar.perSchoolCap} 준수${over.length ? ` — 위반 ${over.map(([t, n]) => `${t}:${n}`)}` : ""}`);

  const missing = R.allstar.requiredPositions.filter((pos) => !side.some((p) => p.position === pos));
  ok(missing.length === 0, `${label} 포지션 전부 채움${missing.length ? ` — 빈 자리 ${missing}` : ""}`);

  const dup = new Set(side.map((p) => p.npcId));
  ok(dup.size === side.length, `${label} 중복 선발 없음`);
}
ok(allstar.north.every((p) => p.side === "north") && allstar.south.every((p) => p.side === "south"),
   "선발 명단의 소속이 뒤섞이지 않았다");

// ══ 3. 인기도가 실제로 선발에 들어간다 ═══════════════════════════
console.log("\n[3] 인기도가 죽은 스탯이 아니다");

// 능력치를 전부 같게 두고 인기도만 다르게 — 인기 순으로 뽑혀야 한다.
//
// ⚠ 스타를 **팀마다 하나씩, 포지션도 다르게** 흩뿌린다. 픽스처를 두 번 고쳤다:
//   1차 — 앞 30명을 스타로 (두 팀에 몰려 있었다) → 2명만 선발. 인기도가 죽은 게
//         아니라 **대학당 캡이 제대로 작동한 것**이었다
//   2차 — 팀마다 하나씩 (전부 index 0 = SP였다) → 23명. 이번엔 **포지션 쿼터가**
//         SP 일색 라인업을 걷어낸 것이었다
// 둘 다 엔진이 옳고 픽스처가 다른 것을 재고 있었다.
const flat = univ.candidates.map((c) => ({ ...c, ovr: 60, form: 0, popularity: 10 }));
const teamOrder = [...new Set(flat.map((c) => c.teamId))];
const starIds = new Set();
teamOrder.forEach((tid, ti) => {
  const wanted = POS[ti % POS.length];
  const c = flat.find((x) => x.teamId === tid && x.position === wanted);
  if (c) starIds.add(c.npcId);
});
const mixed = flat.map((c) => (starIds.has(c.npcId) ? { ...c, popularity: 99 } : c));

const popRes = call("runAllstarNative", {
  rules: R.allstar, candidates: mixed, worldSeed: 7, year: 2030,
});
const allPicked = [...popRes.north, ...popRes.south];
const starHits = allPicked.filter((p) => starIds.has(p.npcId)).length;
ok(starHits >= allPicked.length * 0.8,
   `선발 ${allPicked.length}명 중 ${starHits}명이 인기도 99 — 능력치가 같으면 인기가 갈라야 한다`);

// ══ 4. 쇼케이스 — 세 경로 · 규모 ═════════════════════════════════
console.log("\n[4] 쇼케이스 (실데이터 50개교)");

const showcase = call("runShowcaseNative", {
  rules: R.showcase, candidates: univ.candidates, worldSeed: 4242, year: 2030,
});
const expected = univ.teams.length * R.showcase.perTeamRecommend
  + R.showcase.topScoutExtra + R.showcase.clubPicks;
ok(Math.abs(showcase.total - expected) <= 2,
   `참가 ${showcase.total}명 ≈ 기대 ${expected}명 (50교×${R.showcase.perTeamRecommend} + 주목도 ${R.showcase.topScoutExtra} + 지명 ${R.showcase.clubPicks})`);

const routes = {};
for (const e of showcase.entries) routes[e.route] = (routes[e.route] ?? 0) + 1;
console.log(`    경로 — 팀 추천 ${routes.recommend ?? 0} · 주목도 ${routes.top_scout ?? 0} · 구단 지명 ${routes.club_pick ?? 0}`);
for (const r of ["recommend", "top_scout", "club_pick"]) {
  ok((routes[r] ?? 0) > 0, `${r} 경로가 비지 않았다`);
}

// 팀 추천이 모든 대학을 덮는가 — 약팀도 무대에 서야 한다
const covered = new Set(showcase.entries.filter((e) => e.route === "recommend").map((e) => e.teamId));
ok(covered.size === univ.teams.length,
   `팀 추천이 ${covered.size}/${univ.teams.length}개교를 덮는다 — 순위순으로 자르면 명문만 모인다`);

const dupS = new Set(showcase.entries.map((e) => e.npcId));
ok(dupS.size === showcase.entries.length, "같은 선수를 두 번 부르지 않았다");

// ══ 5. 쇼케이스 보상 ═════════════════════════════════════════════
console.log("\n[5] 쇼케이스 보상 — 참가는 의미가 있되 뒤집지는 않는다");

ok(showcase.entries.every((e) => e.scoutGain > 0), "참가만 해도 주목도가 오른다");
const standouts = showcase.entries.filter((e) => e.standout);
ok(standouts.length > 0 && standouts.length < showcase.total / 2,
   `눈에 띈 인원 ${standouts.length}/${showcase.total} — 전원이거나 0명이면 의미가 없다`);
ok(standouts.every((e) => e.scoutGain > R.showcase.attendScoutGain),
   "상위권이 더 받는다");
const maxGain = Math.max(...showcase.entries.map((e) => e.scoutGain));
ok(maxGain <= 20,
   `최대 주목도 획득 ${maxGain} ≤ 20 — 한 번 나가서 드래프트 순위가 뒤집히면 안 된다`);

// Day2가 능력치만도 운만도 아니다
const sorted = [...showcase.entries].sort((a, b) => b.day2Score - a.day2Score);
ok(sorted[0].day2Score > sorted[sorted.length - 1].day2Score + 10,
   "Day2 점수에 실제 편차가 있다");

// ══ 6. 결정성 ════════════════════════════════════════════════════
console.log("\n[6] worldSeed 결정성");

const a = call("runAllstarNative", { rules: R.allstar, candidates: univ.candidates, worldSeed: 99, year: 2031 });
const b = call("runAllstarNative", { rules: R.allstar, candidates: univ.candidates, worldSeed: 99, year: 2031 });
ok(a.northScore === b.northScore && a.mvpNpcId === b.mvpNpcId, "같은 시드 → 같은 결과");
const c = call("runAllstarNative", { rules: R.allstar, candidates: univ.candidates, worldSeed: 100, year: 2031 });
ok(a.northScore !== c.northScore || a.mvpNpcId !== c.mvpNpcId, "다른 시드 → 다른 결과");

const y = call("runAllstarNative", { rules: R.allstar, candidates: univ.candidates, worldSeed: 99, year: 2032 });
ok(a.northScore !== y.northScore || a.mvpNpcId !== y.mvpNpcId, "해가 다르면 결과도 다르다");

// ══ 7. MVP 일관성 ════════════════════════════════════════════════
console.log("\n[7] MVP가 이긴 팀에서 나온다");

let mvpChecked = 0;
for (const seed of [1, 5, 13, 42, 77, 99, 123]) {
  const r = call("runAllstarNative", { rules: R.allstar, candidates: univ.candidates, worldSeed: seed, year: 2030 });
  if (r.winner === "draw") continue;
  const side = r.winner === "north" ? r.north : r.south;
  ok(side.some((p) => p.npcId === r.mvpNpcId), `seed ${seed} — MVP가 ${r.winner === "north" ? "북군" : "남군"} 소속`);
  mvpChecked++;
}
ok(mvpChecked > 0, `무승부가 아닌 경기를 ${mvpChecked}건 확인했다`);

// ══ 8. 고교 스카우트 데이 — 축소판이다 ═══════════════════════════
console.log("\n[8] 고교 스카우트 데이 (§A-9가 '신규 기획 필요'로 남긴 자리)");

// 새 규칙을 만들지 않고 showcase 규칙을 줄여 쓴다 — 표를 두 번 적지 않기 위해서다
ok(!("scoutDay" in R), "고교 전용 규칙 섹션을 새로 만들지 않았다 (계수가 또 갈라진다)");
ok(/runScoutDay/.test(src), "고교 경로가 구현돼 있다");
ok(/perTeamRecommend: Math\.max\(1, Math\.floor/.test(src),
   "고교는 팀 추천을 줄인다 — 102개교라 그대로면 규모가 두 배가 된다");
ok(/attendScoutGain: base\.attendScoutGain \* 0\.6/.test(src),
   "보상을 낮춰 '대학 쇼케이스가 더 큰 무대'라는 위계를 지킨다");

const hs = buildCandidates("LEAGUE_HIGHSCHOOL", 30);
const scaled = {
  ...R.showcase,
  perTeamRecommend: Math.max(1, Math.floor(R.showcase.perTeamRecommend / 2)),
  topScoutExtra: Math.round(R.showcase.topScoutExtra * 0.6),
  clubPicks: Math.round(R.showcase.clubPicks * 0.6),
  attendScoutGain: R.showcase.attendScoutGain * 0.6,
  standoutScoutGain: R.showcase.standoutScoutGain * 0.7,
  attendFameGain: R.showcase.attendFameGain * 0.5,
};
const scoutDay = call("runShowcaseNative", {
  rules: scaled, candidates: hs.candidates, worldSeed: 4242, year: 2030,
});
console.log(`    고교 ${hs.teams.length}개교 → 참가 ${scoutDay.total}명 (대학 쇼케이스 ${showcase.total}명)`);
ok(scoutDay.total < showcase.total * 1.5,
   `고교 참가 규모가 대학의 1.5배 미만 — 102개교라 안 줄이면 두 배가 된다`);
ok(Math.max(...scoutDay.entries.map((e) => e.scoutGain))
   < Math.max(...showcase.entries.map((e) => e.scoutGain)),
   "고교 최대 보상 < 대학 최대 보상 (무대 위계)");

const hsCovered = new Set(scoutDay.entries.filter((e) => e.route === "recommend").map((e) => e.teamId));
ok(hsCovered.size === hs.teams.length, `팀 추천이 고교 ${hsCovered.size}/${hs.teams.length}개교를 덮는다`);

// ══ 9. 배선 ══════════════════════════════════════════════════════
console.log("\n[9] 주간 진행에 걸려 있다");

const aw = read("apps/ui/src/shared/usecases/advanceWeek.ts");
ok(/runCampusEventsWeek\(weekNum, weekInYear\)/.test(aw), "advanceWeek이 매주 부른다");
ok(/careerStage;\s*\n\s*if \(stage !== "university" && stage !== "highschool"\) return \[\]/.test(src),
   "학생 무대에서만 돈다 — 프로에게 대학 쇼케이스 소식은 잡음이다");
ok(/isProtagonist: true/.test(src),
   "주인공을 후보에 따로 넣는다 — 엔티티가 아니라 빠뜨리면 본인만 못 나간다");
ok(/applyScoutScoreChange/.test(src) && /applyPopularityChange/.test(src),
   "주목도·인기도가 실제로 반영된다");
ok(/catch \(e\)[\s\S]{0,160}이번 주는 건너뜀/.test(src),
   "이벤트가 죽어도 주간 진행은 안 멈춘다");

// 주차가 겹치지 않는가 — 같은 주에 둘이 열리면 하나가 묻힌다
ok(R.showcase.week !== R.allstar.week,
   `쇼케이스 W${R.showcase.week} ≠ 올스타 W${R.allstar.week}`);

console.log(fail === 0 ? "\nALL PASS" : `\n${fail}건 실패`);
process.exit(fail === 0 ? 0 : 1);
