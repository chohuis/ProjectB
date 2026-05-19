import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { MatchResult, PlayerGameLine, PlayerCondition } from "../types/season";
import { buildTeamRoster } from "./rosterEngine";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pd(e: EntityRow): EntityPlayerDetails {
  return e.details.player as EntityPlayerDetails;
}

// ── 반환 타입 ─────────────────────────────────────────────────
export interface SimGameResult {
  result: MatchResult;
  nextHomeRotIdx: number;
  nextAwayRotIdx: number;
  pitcherConditions: Record<string, PlayerCondition>; // 이 경기에 등판한 투수들의 업데이트된 컨디션
}

type PaOutcome = "K" | "BB" | "1B" | "2B" | "3B" | "HR" | "OUT";
type Bases = [boolean, boolean, boolean];

// ── 투수 컨디션 기반 시작 피로 계수 ──────────────────────────
// fatigue 100 → 1.0, fatigue 50 → 0.80, fatigue 0 → 0.60
function condStartMod(pitcherId: string, conditions?: Record<string, PlayerCondition>): number {
  const fatigue = conditions?.[pitcherId]?.fatigue ?? 100;
  return clamp(0.60 + fatigue * 0.004, 0.60, 1.0);
}

// ── 타석 결과 시뮬레이션 ──────────────────────────────────────
function simulatePa(bat: EntityRow, pit: EntityRow, fatigueMod: number): PaOutcome {
  const b = pd(bat).batting;
  const p = pd(pit).pitching;

  const vel = (p?.velocity  ?? 50) * fatigueMod;
  const mov = (p?.movement  ?? 50) * fatigueMod;
  const cmd = (p?.command   ?? 50) * fatigueMod;
  const ctl = (p?.control   ?? 50) * fatigueMod;
  const con =  b?.contact   ?? 50;
  const eye =  b?.eye        ?? 50;
  const dis =  b?.discipline ?? 50;
  const pow =  b?.power      ?? 50;

  const kRate  = clamp(0.225 + (vel-50)*0.002 + (mov-50)*0.0015 - (con-50)*0.003, 0.08, 0.42);
  const bbRate = clamp(0.085 + (eye-50)*0.002  + (dis-50)*0.0015 - (cmd-50)*0.002 - (ctl-50)*0.0015, 0.02, 0.18);
  const hrRate = clamp(0.030 + (pow-50)*0.0015 - (vel-50)*0.001  - (mov-50)*0.001, 0.005, 0.08);

  const r = Math.random();
  if (r < kRate)                   return "K";
  if (r < kRate + bbRate)          return "BB";
  if (r < kRate + bbRate + hrRate) return "HR";

  const hitChance = clamp(0.30 + (con-50)*0.003 - (cmd-50)*0.002, 0.18, 0.46);
  if (Math.random() < hitChance) {
    const h = Math.random();
    if (h < 0.04) return "3B";
    if (h < 0.30) return "2B";
    return "1B";
  }
  return "OUT";
}

// ── 타석 결과 → 베이스 상태 갱신 ─────────────────────────────
function applyOutcome(
  outcome: PaOutcome,
  bases: Bases,
): { outsAdded: number; runsScored: number; newBases: Bases; isHit: boolean; isHR: boolean } {
  const [b1, b2, b3] = bases;
  let runs = 0;

  if (outcome === "K") {
    return { outsAdded: 1, runsScored: 0, newBases: bases, isHit: false, isHR: false };
  }

  if (outcome === "OUT") {
    if (b1 && Math.random() < 0.12) {
      return { outsAdded: 2, runsScored: 0, newBases: bases, isHit: false, isHR: false };
    }
    if (b3 && Math.random() < 0.10) {
      return { outsAdded: 1, runsScored: 1, newBases: [b1, b2, false], isHit: false, isHR: false };
    }
    return { outsAdded: 1, runsScored: 0, newBases: bases, isHit: false, isHR: false };
  }

  if (outcome === "BB") {
    if (b1 && b2 && b3) runs++;
    const nb3 = b1 && b2 ? true : b3;
    const nb2 = b1       ? true : b2;
    return { outsAdded: 0, runsScored: runs, newBases: [true, nb2, nb3], isHit: false, isHR: false };
  }

  if (outcome === "1B") {
    const nb2 = b1;
    let nb3 = false;
    if (b3) runs++;
    if (b2) { if (Math.random() < 0.45) runs++; else nb3 = true; }
    return { outsAdded: 0, runsScored: runs, newBases: [true, nb2, nb3], isHit: true, isHR: false };
  }

  if (outcome === "2B") {
    let nb3 = false;
    if (b3) runs++;
    if (b2) runs++;
    if (b1) { if (Math.random() < 0.5) runs++; else nb3 = true; }
    return { outsAdded: 0, runsScored: runs, newBases: [false, true, nb3], isHit: true, isHR: false };
  }

  if (outcome === "3B") {
    if (b3) runs++;
    if (b2) runs++;
    if (b1) runs++;
    return { outsAdded: 0, runsScored: runs, newBases: [false, false, true], isHit: true, isHR: false };
  }

  // HR
  if (b3) runs++;
  if (b2) runs++;
  if (b1) runs++;
  runs++;
  return { outsAdded: 0, runsScored: runs, newBases: [false, false, false], isHit: true, isHR: true };
}

// ── 투수/타자 누적 스탯 ──────────────────────────────────────
interface PitAccum { outs: number; er: number; h: number; k: number; bb: number }
interface BatAccum { ab: number;  h: number;  hr: number; rbi: number; bb: number; k: number }

// ── 반이닝 시뮬레이션 ────────────────────────────────────────
function simulateHalfInning(
  lineupIds:   string[],
  lineupPos:   number,
  pitcherId:   string,
  pitcherOuts: number,
  pitcherMaxO: number,
  entityMap:   Map<string, EntityRow>,
  pitMap:      Map<string, PitAccum>,
  batMap:      Map<string, BatAccum>,
  startCondMod: number,
): { runs: number; newLineupPos: number; newPitcherOuts: number } {
  let bases: Bases = [false, false, false];
  let outs = 0;
  let runs = 0;
  let lPos = lineupPos;
  let curPitOuts = pitcherOuts;

  const pitEntry = (id: string): PitAccum => {
    if (!pitMap.has(id)) pitMap.set(id, { outs: 0, er: 0, h: 0, k: 0, bb: 0 });
    return pitMap.get(id)!;
  };
  const batEntry = (id: string): BatAccum => {
    if (!batMap.has(id)) batMap.set(id, { ab: 0, h: 0, hr: 0, rbi: 0, bb: 0, k: 0 });
    return batMap.get(id)!;
  };

  // 게임 내 피로 (구수 누적) + 경기간 컨디션 조합
  const inGameFatigue = clamp(1.0 - Math.max(0, curPitOuts - pitcherMaxO * 0.6) / Math.max(1, pitcherMaxO) * 0.4, 0.68, 1.0);
  const fmod = inGameFatigue * startCondMod;

  while (outs < 3) {
    const batterId  = lineupIds[lPos % lineupIds.length];
    lPos++;

    const bEnt = entityMap.get(batterId);
    const pEnt = entityMap.get(pitcherId);
    if (!bEnt || !pEnt) { outs++; curPitOuts++; continue; }

    const outcome = simulatePa(bEnt, pEnt, fmod);
    const res     = applyOutcome(outcome, bases);

    bases        = res.newBases;
    outs        += res.outsAdded;
    runs        += res.runsScored;
    curPitOuts  += res.outsAdded;

    const pa = pitEntry(pitcherId);
    pa.outs += res.outsAdded;
    pa.er   += res.runsScored;
    if (res.isHit)         pa.h++;
    if (outcome === "K")   pa.k++;
    if (outcome === "BB")  pa.bb++;

    const ba = batEntry(batterId);
    if (outcome !== "BB") ba.ab++;
    if (res.isHit)         ba.h++;
    if (res.isHR)          ba.hr++;
    if (outcome === "BB")  ba.bb++;
    if (outcome === "K")   ba.k++;
    ba.rbi += res.runsScored;
  }

  return { runs, newLineupPos: lPos, newPitcherOuts: curPitOuts };
}

// ── 최대 아웃 카운트 (투수 체력 + 컨디션 기반) ───────────────
function maxOuts(pitcherId: string, isStarter: boolean, entityMap: Map<string, EntityRow>, condMod: number): number {
  const e    = entityMap.get(pitcherId);
  const stam = e ? (pd(e).pitching?.stamina ?? 50) : 50;
  const effStam = stam * condMod;
  if (isStarter) {
    return Math.round(12 + (effStam / 99) * 15 + (Math.random() - 0.5) * 6);
  }
  return 3 + Math.floor(Math.random() * 4);
}

// ── 투수 교체 판단 ────────────────────────────────────────────
function shouldChangePitcher(pitOuts: number, pitMax: number): boolean {
  return pitOuts >= pitMax;
}

// ── 풀게임 시뮬레이션 ────────────────────────────────────────
export function simulateGame(
  homeTeamId: string,
  awayTeamId: string,
  entities:   EntityRow[],
  options?: {
    conditions?:  Record<string, PlayerCondition>;
    homeRotIdx?:  number;
    awayRotIdx?:  number;
    week?:        number;
  },
): SimGameResult {
  const { conditions = {}, homeRotIdx = 0, awayRotIdx = 0, week = 0 } = options ?? {};
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const homeRoster = buildTeamRoster(homeTeamId, entities);
  const awayRoster = buildTeamRoster(awayTeamId, entities);

  // 로테이션 인덱스로 선발 결정: rotation[rotIdx % length]
  function buildQueue(roster: ReturnType<typeof buildTeamRoster>, rotIdx: number): string[] {
    const rot = roster.rotation;
    const starter = rot.length > 0 ? rot[rotIdx % rot.length] : null;
    const q: string[] = starter ? [starter] : [];
    for (const id of roster.bullpen) {
      if (!q.includes(id)) q.push(id);
    }
    if (roster.closer && !q.includes(roster.closer)) q.push(roster.closer);
    return q.filter(Boolean);
  }

  const homePitQ = buildQueue(homeRoster, homeRotIdx);
  const awayPitQ = buildQueue(awayRoster, awayRotIdx);

  // 각 투수별 최대 아웃 수 (컨디션 반영)
  const pitMaxMap = new Map<string, number>();
  function getPitMax(id: string, isStarter: boolean): number {
    if (!pitMaxMap.has(id)) {
      const condMod = condStartMod(id, conditions);
      pitMaxMap.set(id, maxOuts(id, isStarter, entityMap, condMod));
    }
    return pitMaxMap.get(id)!;
  }

  const pitMap = new Map<string, PitAccum>();
  const batMap = new Map<string, BatAccum>();

  let homeScore = 0, awayScore = 0;
  let homeLPos  = 0, awayLPos  = 0;

  let hPitIdx = 0, aPitIdx = 0;
  let hPitOuts = 0, aPitOuts = 0;

  interface LeadEvent { inning: number; half: "top" | "bot"; pitcherId: string; diff: number }
  const leadEvents: LeadEvent[] = [];

  for (let inning = 1; inning <= 9; inning++) {
    // 홈 투수 교체
    if (hPitIdx < homePitQ.length - 1 && shouldChangePitcher(hPitOuts, getPitMax(homePitQ[hPitIdx], hPitIdx === 0))) {
      hPitIdx++;
      hPitOuts = 0;
    }
    const hPitId = homePitQ[hPitIdx] ?? homePitQ[homePitQ.length - 1];
    const hCondMod = condStartMod(hPitId, conditions);

    // 원정 공격 (상반기)
    const top = simulateHalfInning(
      awayRoster.lineup, awayLPos, hPitId, hPitOuts,
      getPitMax(hPitId, hPitIdx === 0),
      entityMap, pitMap, batMap, hCondMod,
    );
    awayScore  += top.runs;
    awayLPos    = top.newLineupPos;
    hPitOuts    = top.newPitcherOuts;
    if (top.runs > 0) leadEvents.push({ inning, half: "top", pitcherId: hPitId, diff: awayScore - homeScore });

    // 원정 투수 교체
    if (aPitIdx < awayPitQ.length - 1 && shouldChangePitcher(aPitOuts, getPitMax(awayPitQ[aPitIdx], aPitIdx === 0))) {
      aPitIdx++;
      aPitOuts = 0;
    }
    const aPitId = awayPitQ[aPitIdx] ?? awayPitQ[awayPitQ.length - 1];
    const aCondMod = condStartMod(aPitId, conditions);

    // 9회 말 홈팀이 앞서면 walk-off
    if (inning === 9 && homeScore > awayScore) break;

    // 홈 공격 (하반기)
    const bot = simulateHalfInning(
      homeRoster.lineup, homeLPos, aPitId, aPitOuts,
      getPitMax(aPitId, aPitIdx === 0),
      entityMap, pitMap, batMap, aCondMod,
    );
    homeScore  += bot.runs;
    homeLPos    = bot.newLineupPos;
    aPitOuts    = bot.newPitcherOuts;
    if (bot.runs > 0) leadEvents.push({ inning, half: "bot", pitcherId: aPitId, diff: homeScore - awayScore });

    // 9회 말 동점 → 연장 (최대 3이닝)
    if (inning === 9 && homeScore === awayScore) {
      for (let ex = 10; ex <= 12 && homeScore === awayScore; ex++) {
        const exHPit = homePitQ[Math.min(hPitIdx, homePitQ.length - 1)];
        const exTop  = simulateHalfInning(awayRoster.lineup, awayLPos, exHPit, 27, 3, entityMap, pitMap, batMap, 0.75);
        awayScore   += exTop.runs;
        awayLPos     = exTop.newLineupPos;

        const exAPit = awayPitQ[Math.min(aPitIdx, awayPitQ.length - 1)];
        const exBot  = simulateHalfInning(homeRoster.lineup, homeLPos, exAPit, 27, 3, entityMap, pitMap, batMap, 0.75);
        homeScore   += exBot.runs;
        homeLPos     = exBot.newLineupPos;
      }
      if (homeScore === awayScore) {
        if (Math.random() < 0.5) homeScore++;
        else awayScore++;
      }
    }
  }

  const homeWon  = homeScore > awayScore;
  const winnerId = homeWon ? homeTeamId : awayTeamId;
  const loserId  = homeWon ? awayTeamId : homeTeamId;
  const margin   = Math.abs(homeScore - awayScore);

  // ── W/L/SV/HD 결정 ───────────────────────────────────────────
  function pitcherDecision(
    pitcherId: string,
    teamWon: boolean,
    pitQ: string[],
    pitIdx: number,
  ): "W" | "L" | "SV" | "HD" | "ND" {
    const acc  = pitMap.get(pitcherId);
    if (!acc) return "ND";
    const ipThirds = acc.outs;
    const isStarter = pitQ[0] === pitcherId;
    const isCloser  = pitQ[pitQ.length - 1] === pitcherId && pitQ.length > 1;
    if (teamWon) {
      if (isStarter && ipThirds >= 15) return "W";
      if (isCloser && margin <= 3)     return "SV";
      if (!isStarter && !isCloser && ipThirds >= 3) return "HD";
    } else {
      if (isStarter) return "L";
    }
    return "ND";
  }

  // ── playerLines 생성 ─────────────────────────────────────────
  const playerLines: PlayerGameLine[] = [];

  for (const [id, acc] of pitMap) {
    const isHome   = homeRoster.rotation.includes(id) || homeRoster.bullpen.includes(id) || homeRoster.closer === id;
    const pitQ     = isHome ? homePitQ : awayPitQ;
    const teamWon  = isHome ? homeWon : !homeWon;
    const curIdx   = isHome ? hPitIdx : aPitIdx;
    const decision = pitcherDecision(id, teamWon, pitQ, curIdx);
    const ip = Math.floor(acc.outs / 3) + (acc.outs % 3) / 10;
    playerLines.push({ role: "pitcher", playerId: id, ip, er: acc.er, h: acc.h, k: acc.k, bb: acc.bb, decision });
  }

  const allBatterIds = new Set([...homeRoster.lineup, ...awayRoster.lineup]);
  for (const id of allBatterIds) {
    const acc = batMap.get(id);
    if (!acc || acc.ab === 0) continue;
    playerLines.push({ role: "batter", playerId: id, ab: acc.ab, h: acc.h, hr: acc.hr, rbi: acc.rbi, bb: acc.bb, k: acc.k, sb: 0 });
  }

  // ── 투수 컨디션 업데이트 (피로 누적) ─────────────────────────
  // 아웃 수 기준: 3아웃당 약 16pt 피로 누적 (21아웃=7IP → -56, 15아웃=5IP → -40)
  const pitcherConditions: Record<string, PlayerCondition> = {};
  for (const [id, acc] of pitMap) {
    const prev = conditions[id] ?? { fatigue: 100, lastPitchedWeek: 0, pitchOutsLast: 0 };
    const fatigueLoss = Math.round(acc.outs * 2.7);
    pitcherConditions[id] = {
      fatigue: clamp(prev.fatigue - fatigueLoss, 0, 100),
      lastPitchedWeek: week,
      pitchOutsLast: acc.outs,
    };
  }

  return {
    result: { homeScore, awayScore, winnerId, loserId, playerLines, events: [] },
    nextHomeRotIdx: homeRotIdx + 1,
    nextAwayRotIdx: awayRotIdx + 1,
    pitcherConditions,
  };
}
