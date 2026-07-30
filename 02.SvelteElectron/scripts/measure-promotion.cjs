"use strict";
// 승강 출렁임 실측 (Phase 7-2 P-4)
//
// "장기 부진도 상시 콜업 트리거" + "최소 체류 기간 없음"을 함께 정했다.
// 같은 선수가 시즌에 몇 번 오르내리는지 **숫자로 확인**한다 — 예측하지 않는다.
//
// ⚠ 로스터는 실제 생성 규칙으로 만들지만 **성적은 합성이다.** 경기 시뮬을
//    통째로 돌릴 수 없어서 능력치 + 노이즈로 만든다. 재려는 건 성적의
//    사실성이 아니라 **판정 로직이 얼마나 자주 사람을 옮기는가**다.
//
// 실행: npm run measure:promotion

const path = require("node:path");
const ROOT = path.resolve(__dirname, "..");
const native = require(path.join(ROOT, "packages/engine-native/index.js"));
const refs = require(path.join(ROOT, "resource/data/master/entities/refs.json"));
const gr = require(path.join(ROOT, "resource/data/master/players/generation_rules.json"));

const SEASON_WEEKS = 26;              // 정규시즌 길이 근사
const MONTH_STARTS = [1, 5, 9, 13, 17, 21, 25];
const PROMO = gr.promotionRules;
const MAX_ROSTER = gr.rosterRules.LEAGUE_KBL.rosterMax;

const call = (fn, p) => {
  const out = JSON.parse(native[fn](JSON.stringify(p)));
  if (out && out.error) throw new Error(`${fn}: ${out.error}`);
  return out;
};

const PROFILE = {
  ownerSpendingWillingness: 50, stability: 50, developmentFocus: 50,
  discipline: 50, ownerPatience: 50, winNowPressure: 50, scoutingQuality: 50,
  prestige: 50, marketAppeal: 50, clubhouseCulture: 50, medicalQuality: 50, farmInvestment: 50,
};

// 결정적 난수 — 같은 시드면 같은 결과
let _seed = 20260731;
const rnd = () => { _seed = (_seed * 1103515245 + 12345) & 0x7fffffff; return _seed / 0x7fffffff; };

const KBL1 = refs.teams.filter((t) => t.leagueId === "LEAGUE_KBL" && t.id.endsWith("_1"));

// ── 로스터 (실제 생성 규칙) ────────────────────────────────────
function rosterOf(farm) {
  const teams = KBL1.map((t) => ({
    teamId: farm ? t.id.replace(/_1$/, "_2") : t.id, schoolId: "", power: t.power,
  }));
  const lid = farm ? "LEAGUE_KBL_FARM" : "LEAGUE_KBL";
  return call("generateLeagueRosterNative", {
    leagueId: lid, seasonYear: 2026, worldSeed: 4242, teams, rules: gr.rosterRules[lid],
    salaryRules: gr.salaryRules, powerRules: gr.powerRules,
    entryRules: gr.careerHistoryRules.entry,
  }).npcs;
}

const players = new Map();   // npcId → { ref, team1, atFarm }
for (const [farm, list] of [[false, rosterOf(false)], [true, rosterOf(true)]]) {
  for (const g of list) {
    const ovr = (g.abilities.pitching ?? g.abilities.batting).ovr;
    players.set(g.npcId, {
      atFarm: farm,
      team1: g.currentTeam.replace(/_2$/, "_1"),
      ref: {
        id: g.npcId, position: g.position, age: g.age, ovr,
        salary: g.salary, remainingYears: g.contractYears,
        proServiceYears: g.proServiceYears, isProspect: farm,
        personality: null, fame: 0,
      },
      // 합성 성적 누적
      ip: 0, er: 0, pa: 0, tb: 0, ob: 0, games: 0,
    });
  }
}
console.log(`1군 ${[...players.values()].filter((p) => !p.atFarm).length}명 · ` +
  `2군 ${[...players.values()].filter((p) => p.atFarm).length}명`);

const isPitcher = (pos) => ["SP", "RP", "CP", "P"].includes(pos);

/** 한 주치 합성 성적. 1군이 표본이 더 빨리 쌓인다 */
function accumulate(p) {
  const share = p.atFarm ? 0.6 : 1.0;
  const skill = (p.ref.ovr - 60) / 20;               // −1 ~ +1 근사
  if (isPitcher(p.ref.position)) {
    const ip = (p.ref.position === "SP" ? 5.5 : 1.5) * share;
    // 능력치가 높을수록 자책점이 적다. 노이즈가 부진·호조를 만든다
    const era = Math.max(0.5, 4.5 - skill * 2.0 + (rnd() - 0.5) * 3.0);
    p.ip += ip; p.er += (era * ip) / 9; p.games += 1;
  } else {
    const pa = 4.2 * share;
    const ops = Math.max(0.35, 0.700 + skill * 0.15 + (rnd() - 0.5) * 0.35);
    p.pa += pa; p.ob += ops * pa; p.games += 1;
  }
}

function perfOf(p) {
  if (isPitcher(p.ref.position)) {
    if (p.ip <= 0) return undefined;
    return { games: p.games, innings: p.ip, era: (p.er * 9) / p.ip, whip: 1.3 };
  }
  if (p.pa <= 0) return undefined;
  return { games: p.games, plateAppearances: Math.round(p.pa), ops: p.ob / p.pa };
}

// ── 시즌 ───────────────────────────────────────────────────────
const moves = new Map();      // npcId → 이동 횟수
const upDown = new Map();     // npcId → ["up","down",...]
let regular = 0, urgent = 0;

// 1군 선수의 주당 중·상 부상 확률. 실제 게임의 부상 엔진 대신 근사한다 —
// 상시 콜업이 도는지 보려면 자리가 비어야 한다
const INJURY_PER_WEEK = 0.004;
const injured = new Map();   // npcId → 남은 주
let injuryEvents = 0;

for (let week = 1; week <= SEASON_WEEKS; week++) {
  for (const p of players.values()) accumulate(p);

  // 부상 회복 · 신규 발생
  for (const [id, left] of [...injured]) {
    if (left <= 1) injured.delete(id); else injured.set(id, left - 1);
  }
  for (const [id, p] of players) {
    if (p.atFarm || injured.has(id)) continue;
    if (rnd() < INJURY_PER_WEEK) { injured.set(id, 2 + Math.floor(rnd() * 6)); injuryEvents++; }
  }

  const urgentOnly = !MONTH_STARTS.includes(week);
  const pending = [];

  for (const t of KBL1) {
    const team1 = t.id, team2 = t.id.replace(/_1$/, "_2");
    const mine = [...players.values()].filter((p) => p.team1 === team1);
    const withPerf = (p) => ({ ...p.ref, ...(perfOf(p) ? { perf: perfOf(p) } : {}) });
    const active = mine.filter((p) => !p.atFarm).map(withPerf);
    const farm = mine.filter((p) => p.atFarm).map(withPerf);
    if (active.length === 0 || farm.length === 0) continue;

    const res = call("evalCallupCandidatesNative", {
      teamProfile: PROFILE, farmPlayers: farm, activePlayers: active,
      injuredPlayerIds: [...injured.keys()], currentMonth: Math.ceil(week / 4.34),
      promotionRules: PROMO,
    });
    const picked = urgentOnly
      ? res.candidates.filter((c) =>
          c.reason === "injury_replacement" || c.reason === "slump_replacement").slice(0, 1)
      : res.candidates.slice(0, 2);
    for (const c of picked) {
      pending.push([c.playerId, false], [c.replacesPlayerId, true]);
    }

    if (!urgentOnly) {
      const cd = call("evalCalldownCandidatesNative", {
        teamProfile: PROFILE, activePlayers: active,
        currentRosterSize: active.length, maxRosterSize: MAX_ROSTER,
        promotionRules: PROMO,
      });
      for (const c of cd.candidates.slice(0, 2)) pending.push([c.playerId, true]);
    }
  }

  for (const [id, toFarm] of pending) {
    const p = players.get(id);
    if (!p || p.atFarm === toFarm) continue;
    p.atFarm = toFarm;
    moves.set(id, (moves.get(id) ?? 0) + 1);
    if (!upDown.has(id)) upDown.set(id, []);
    upDown.get(id).push(toFarm ? "down" : "up");
    if (urgentOnly) urgent++; else regular++;
  }
}

// ── 집계 ───────────────────────────────────────────────────────
console.log(`\n시즌 ${SEASON_WEEKS}주 · 정기 ${MONTH_STARTS.length}회 · 상시 ${SEASON_WEEKS - MONTH_STARTS.length}회`);
console.log(`총 이동 ${regular + urgent}건 (정기 ${regular} · 상시 ${urgent})`);
console.log(`움직인 선수 ${moves.size}명 / 전체 ${players.size}명`);

const dist = {};
for (const n of moves.values()) dist[n] = (dist[n] ?? 0) + 1;
console.log("이동 횟수 분포:", Object.entries(dist).sort((a, b) => a[0] - b[0])
  .map(([k, v]) => `${k}회 ${v}명`).join(" · "));

// 왕복 = 올라갔다 내려오거나 그 반대가 이어진 횟수
let roundTrips = 0, worst = ["", 0];
for (const [id, seq] of upDown) {
  let rt = 0;
  for (let i = 1; i < seq.length; i++) if (seq[i] !== seq[i - 1]) rt++;
  roundTrips += rt;
  if (rt > worst[1]) worst = [id, rt];
}
console.log(`왕복(방향 전환) ${roundTrips}회 · 최다 ${worst[1]}회 (${worst[0]})`);

const churn = [...moves.values()].filter((n) => n >= 4).length;
console.log(`시즌 4회 이상 오르내린 선수: ${churn}명`);
