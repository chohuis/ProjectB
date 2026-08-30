"use strict";
/**
 * 리그 경기 분포 — **실제 로스터로** 잰다. `npm run measure:leaguegames:real`
 *
 * ## 왜 따로 만드나
 *
 * `measure-league-games.cjs`는 엔진이 만든 **합성 라인업**(`batterMean`)을
 * 쓴다. 전후 비교엔 충분하지만 **절대값을 논할 수 없다** — 실제로 그 계측이
 * 홈 승률 65%를 냈는데(실제 야구는 54%) 그게 진짜 편향인지 합성 탓인지
 * 가릴 수가 없었다.
 *
 * 여기서는 `generateLeagueRosterNative`가 만든 **진짜 KBL 로스터**로 돌린다.
 *
 * ⚠ **라인업 구성은 `gameSimulator.ts`를 그대로 따른다** — 선발 1 + 불펜 +
 * 마무리, 타순 9명, 수비는 타순에서 파생. 다르게 만들면 이 계측이 게임과
 * 다른 것을 재게 된다.
 */
const path = require("node:path");
const engine = require(path.resolve(__dirname, "../packages/engine-native"));
const rules = require(path.resolve(__dirname,
  "../resource/data/master/players/generation_rules.json"));

const GAMES = (() => {
  const i = process.argv.indexOf("--games");
  return i !== -1 ? Math.max(1, parseInt(process.argv[i + 1], 10) || 1000) : 1000;
})();
const SEED = (() => {
  const i = process.argv.indexOf("--seed");
  return i !== -1 ? Number(process.argv[i + 1]) : 20260820;
})();

/** 세이브 구종 id → 엔진 이름. 정본은 `utils/arsenal.ts`이고 여기 표는 그 사본이다 */
const PITCH_ID_TO_ENGINE = {
  PITCH_FASTBALL: "fastball", PITCH_SINKER: "sinker", PITCH_CUTTER: "cutter",
  PITCH_SLIDER: "slider", PITCH_CURVE: "curve", PITCH_CHANGEUP: "changeup",
  PITCH_SPLITTER: "splitter", PITCH_FORKBALL: "forkball",
  PITCH_SCREWBALL: "screwball", PITCH_KNUCKLEBALL: "knuckleball",
};

const FIELD_XY = {
  P: { x: 50, y: 62 }, C: { x: 50, y: 90 }, "1B": { x: 78, y: 70 }, "2B": { x: 63, y: 55 },
  "3B": { x: 22, y: 70 }, SS: { x: 37, y: 55 }, LF: { x: 18, y: 28 },
  CF: { x: 50, y: 16 }, RF: { x: 82, y: 28 },
};
const DEFENSE_POS = ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"];

function roster(teamId, worldSeed) {
  const out = JSON.parse(engine.generateLeagueRosterNative(JSON.stringify({
    leagueId: "LEAGUE_KBL", seasonYear: 2027, worldSeed,
    teams: [{ teamId, schoolId: "" }],
    rules: rules.rosterRules.LEAGUE_KBL,
  })));
  if (!Array.isArray(out.npcs)) throw new Error(`로스터 생성 실패: ${out.error}`);
  return out.npcs;
}

function toEnginePitcher(n) {
  const p = n.abilities.pitching;
  return {
    name: n.npcId,
    command: p.command, velocity: p.velocity,
    staminaCap: p.stamina, mentalResil: p.mentality ?? 50,
    control: p.control, movement: p.movement,
    clutch: p.clutch ?? 50, holdRunners: p.holdRunners ?? 50,
    // ⚠ 필드는 `type`이다(`pitchType` 아님) — `utils/arsenal.ts`가 정본이고
    // 거기서 빈 배열이면 패스트볼 하나를 넣는다. 그대로 따른다
    arsenal: (() => {
      const out = [];
      for (const e of n.abilities.pitches ?? []) {
        const t = PITCH_ID_TO_ENGINE[e.id];
        if (!t || out.some((x) => x.type === t)) continue;
        out.push({ type: t, grade: Math.max(1, Math.min(5, e.grade ?? 3)) });
      }
      if (out.length === 0) out.push({ type: "fastball", grade: 3 });
      return out;
    })(),
  };
}

function toEngineBatter(n) {
  const b = n.abilities.batting;
  return {
    id: n.npcId, name: n.npcId,
    contact: b.contact, power: b.power, eye: b.eye, discipline: b.discipline,
    battingClutch: b.battingClutch ?? 50, platoon: 50,
    speed: b.speed, baseInstinct: b.baseInstinct ?? 50,
    fielding: b.fielding ?? 50, arm: b.arm ?? 50,
  };
}

function fieldersFrom(lineup) {
  return DEFENSE_POS.map((pos, i) => {
    const b = lineup[i % Math.max(1, lineup.length)];
    const lvl = b ? Math.round((b.contact + b.speed) / 2) : 50;
    return { position: pos, name: pos, fielding: lvl, arm: lvl,
      speed: b?.speed ?? 50, x: FIELD_XY[pos].x, y: FIELD_XY[pos].y };
  });
}

/** `gameSimulator.ts`와 같은 구성 — 선발 1 + 불펜 + 마무리 */
function squad(npcs) {
  const sp = npcs.filter((n) => n.position === "SP");
  const rp = npcs.filter((n) => n.position === "RP");
  const cp = npcs.filter((n) => n.position === "CP");
  const bats = npcs.filter((n) => n.playerType !== "pitcher");
  if (sp.length === 0 || bats.length < 9) throw new Error("로스터가 모자라다");
  return {
    pitchersOf: (rotIdx) => [
      toEnginePitcher(sp[rotIdx % sp.length]),
      ...rp.map(toEnginePitcher),
      ...cp.map(toEnginePitcher),
    ],
    lineup: bats.slice(0, 9).map(toEngineBatter),
    // 벤치 넷 — `buildTeamRoster` 와 같은 규칙(라인업 밖 상위)
    bench: bats.slice(9, 13).map(toEngineBatter),
  };
}

function pct(sorted, p) {
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}
function stats(xs) {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const varr = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const s = [...xs].sort((a, b) => a - b);
  return { mean: +mean.toFixed(3), sd: +Math.sqrt(varr).toFixed(3),
    p10: pct(s, 10), p50: pct(s, 50), p90: pct(s, 90), min: s[0], max: s[n - 1] };
}

function main() {
  const home = squad(roster("TEAM_HOME", SEED));
  const away = squad(roster("TEAM_AWAY", SEED + 1));

  const h = [], a = [], tot = [], pit = [];
  let homeWins = 0, shutouts = 0;

  for (let i = 0; i < GAMES; i++) {
    // ⚠ **로테이션을 돌린다.** 늘 1선발끼리 붙이면 실제 리그보다 점수가 낮다
    const opts = {
      leagueId: "LEAGUE_KBL", protagonistSide: "home", role: "SP",
      inningLimit: 9, seed: SEED + i,
      homeLineup: home.lineup, awayLineup: away.lineup,
      myPitchers: home.pitchersOf(i), opponentPitchers: away.pitchersOf(i),
      fielders: fieldersFrom(home.lineup),
    };
    const st = engine.startMatchNative(JSON.stringify(opts));
    const stp = JSON.parse(st);
    if (stp.error) throw new Error(`startMatch: ${stp.error}`);
    const fin = JSON.parse(engine.simToGameEnd(st));
    if (fin.error) throw new Error(`simToGameEnd: ${fin.error}`);

    const hs = fin.score?.home ?? 0, as = fin.score?.away ?? 0;
    h.push(hs); a.push(as); tot.push(hs + as); pit.push(fin.pitchCount ?? 0);
    if (hs > as) homeWins++;
    if (hs === 0 || as === 0) shutouts++;
  }

  console.log(`[리그경기·실제로스터] ${GAMES}경기 · 씨앗 ${SEED}`);
  console.log("  홈 득점  ", stats(h));
  console.log("  원정 득점", stats(a));
  console.log("  합계 득점", stats(tot));
  console.log("  투구수   ", stats(pit));
  console.log(`  홈 승률 ${(homeWins / GAMES * 100).toFixed(1)}%`
    + ` · 완봉 낀 경기 ${(shutouts / GAMES * 100).toFixed(1)}%`);
}

// 대타 프로브가 이 재료를 그대로 쓴다 — 사본을 두 번 적으면 갈린다.
// ⚠ `require` 로 불릴 땐 main() 을 안 돈다.
module.exports = { roster, squad, fieldersFrom, SEED };
if (require.main === module) main();
