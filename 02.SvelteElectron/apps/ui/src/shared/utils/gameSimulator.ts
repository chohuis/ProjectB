import type { EntityRow, EntityPlayerDetails } from "../stores/master";
import type { MatchResult, PlayerGameLine } from "../types/season";
import { buildTeamRoster } from "./rosterEngine";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function pd(e: EntityRow): EntityPlayerDetails {
  return e.details.player as EntityPlayerDetails;
}

type PaOutcome = "K" | "BB" | "1B" | "2B" | "3B" | "HR" | "OUT";
type Bases = [boolean, boolean, boolean];

// ── 타석 결과 시뮬레이션 ──────────────────────────────────────────
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

// ── 타석 결과 → 베이스 상태 갱신 ─────────────────────────────────
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

  // Hit outcomes
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

// ── 투수/타자 누적 스탯 ──────────────────────────────────────────
interface PitAccum { outs: number; er: number; h: number; k: number; bb: number }
interface BatAccum { ab: number;  h: number;  hr: number; rbi: number; bb: number; k: number }

// ── 반이닝 시뮬레이션 ────────────────────────────────────────────
function simulateHalfInning(
  lineupIds:   string[],
  lineupPos:   number,
  pitcherId:   string,
  pitcherOuts: number,
  pitcherMaxO: number,
  entityMap:   Map<string, EntityRow>,
  pitMap:      Map<string, PitAccum>,
  batMap:      Map<string, BatAccum>,
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

  const fmod = clamp(1.0 - Math.max(0, curPitOuts - pitcherMaxO * 0.6) / Math.max(1, pitcherMaxO) * 0.4, 0.68, 1.0);

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

// ── 최대 아웃 카운트 (투수 체력 기반) ───────────────────────────
function maxOuts(pitcherId: string, isStarter: boolean, entityMap: Map<string, EntityRow>): number {
  const e    = entityMap.get(pitcherId);
  const stam = e ? (pd(e).pitching?.stamina ?? 50) : 50;
  if (isStarter) {
    return Math.round(12 + (stam / 99) * 15 + (Math.random() - 0.5) * 6);
  }
  return 3 + Math.floor(Math.random() * 4);
}

// ── 투수 교체 판단 ────────────────────────────────────────────────
function shouldChangePitcher(pitOuts: number, pitMax: number): boolean {
  return pitOuts >= pitMax;
}

// ── 풀게임 시뮬레이션 ────────────────────────────────────────────
export function simulateGame(
  homeTeamId: string,
  awayTeamId: string,
  entities:   EntityRow[],
): MatchResult {
  const entityMap = new Map(entities.map((e) => [e.id, e]));

  const homeRoster = buildTeamRoster(homeTeamId, entities);
  const awayRoster = buildTeamRoster(awayTeamId, entities);

  // 투수 등판 순서: [선발, 불펜..., 마무리]
  function buildQueue(roster: ReturnType<typeof buildTeamRoster>): string[] {
    const q: string[] = [...roster.rotation.slice(0, 1)];
    for (const id of roster.bullpen) {
      if (!q.includes(id)) q.push(id);
    }
    if (roster.closer && !q.includes(roster.closer)) q.push(roster.closer);
    return q.filter(Boolean);
  }

  const homePitQ = buildQueue(homeRoster);
  const awayPitQ = buildQueue(awayRoster);

  // 각 투수별 최대 아웃 수 사전 계산
  const pitMaxMap = new Map<string, number>();
  function getPitMax(id: string, isStarter: boolean): number {
    if (!pitMaxMap.has(id)) pitMaxMap.set(id, maxOuts(id, isStarter, entityMap));
    return pitMaxMap.get(id)!;
  }

  const pitMap = new Map<string, PitAccum>();
  const batMap = new Map<string, BatAccum>();

  let homeScore = 0, awayScore = 0;
  let homeLPos  = 0, awayLPos  = 0;

  let hPitIdx = 0, aPitIdx = 0;
  let hPitOuts = 0, aPitOuts = 0;

  // 득점 타이밍 추적 (W/L 판정용)
  interface LeadEvent { inning: number; half: "top" | "bot"; pitcherId: string; diff: number }
  const leadEvents: LeadEvent[] = [];

  for (let inning = 1; inning <= 9; inning++) {
    // 홈 투수 교체 확인
    if (hPitIdx < homePitQ.length - 1 && shouldChangePitcher(hPitOuts, getPitMax(homePitQ[hPitIdx], hPitIdx === 0))) {
      hPitIdx++;
      hPitOuts = 0;
    }
    const hPitId = homePitQ[hPitIdx] ?? homePitQ[homePitQ.length - 1];

    // 원정 공격 (상반기)
    const top = simulateHalfInning(
      awayRoster.lineup, awayLPos, hPitId, hPitOuts,
      getPitMax(hPitId, hPitIdx === 0),
      entityMap, pitMap, batMap,
    );
    awayScore  += top.runs;
    awayLPos    = top.newLineupPos;
    hPitOuts    = top.newPitcherOuts;
    if (top.runs > 0) leadEvents.push({ inning, half: "top", pitcherId: hPitId, diff: awayScore - homeScore });

    // 원정 투수 교체 확인
    if (aPitIdx < awayPitQ.length - 1 && shouldChangePitcher(aPitOuts, getPitMax(awayPitQ[aPitIdx], aPitIdx === 0))) {
      aPitIdx++;
      aPitOuts = 0;
    }
    const aPitId = awayPitQ[aPitIdx] ?? awayPitQ[awayPitQ.length - 1];

    // 9회 말 홈팀이 앞서면 walk-off
    if (inning === 9 && homeScore > awayScore) break;

    // 홈 공격 (하반기)
    const bot = simulateHalfInning(
      homeRoster.lineup, homeLPos, aPitId, aPitOuts,
      getPitMax(aPitId, aPitIdx === 0),
      entityMap, pitMap, batMap,
    );
    homeScore  += bot.runs;
    homeLPos    = bot.newLineupPos;
    aPitOuts    = bot.newPitcherOuts;
    if (bot.runs > 0) leadEvents.push({ inning, half: "bot", pitcherId: aPitId, diff: homeScore - awayScore });

    // 9회 말 동점 → 연장
    if (inning === 9 && homeScore === awayScore) {
      // 최대 3이닝 연장
      for (let ex = 10; ex <= 12 && homeScore === awayScore; ex++) {
        const exHPit = homePitQ[Math.min(hPitIdx, homePitQ.length - 1)];
        const exTop  = simulateHalfInning(awayRoster.lineup, awayLPos, exHPit, 27, 3, entityMap, pitMap, batMap);
        awayScore   += exTop.runs;
        awayLPos     = exTop.newLineupPos;

        const exAPit = awayPitQ[Math.min(aPitIdx, awayPitQ.length - 1)];
        const exBot  = simulateHalfInning(homeRoster.lineup, homeLPos, exAPit, 27, 3, entityMap, pitMap, batMap);
        homeScore   += exBot.runs;
        homeLPos     = exBot.newLineupPos;
      }
      // 연장 후에도 동점이면 한 점 차이
      if (homeScore === awayScore) {
        if (Math.random() < 0.5) homeScore++;
        else awayScore++;
      }
    }
  }

  const homeWon  = homeScore > awayScore;
  const winnerId = homeWon ? homeTeamId : awayTeamId;
  const loserId  = homeWon ? awayTeamId : homeTeamId;

  // ── W/L/SV/HD 결정 ───────────────────────────────────────────
  const margin = Math.abs(homeScore - awayScore);

  function pitcherDecision(
    pitcherId: string,
    teamWon: boolean,
    pitQ: string[],
    pitIdx: number,
  ): "W" | "L" | "SV" | "HD" | "ND" {
    const acc  = pitMap.get(pitcherId);
    if (!acc) return "ND";

    const ipThirds = acc.outs; // 아웃 수 (3아웃 = 1이닝)
    const isStarter = pitQ[0] === pitcherId;
    const isCloser  = pitQ[pitQ.length - 1] === pitcherId && pitQ.length > 1;

    if (teamWon) {
      if (isStarter && ipThirds >= 15) return "W"; // 5이닝 이상
      if (isCloser && margin <= 3)     return "SV";
      // 홀드: 리드 중 등판하고 리드 유지한 중간계투
      if (!isStarter && !isCloser && ipThirds >= 3) return "HD";
    } else {
      if (isStarter) return "L";
    }
    return "ND";
  }

  // ── playerLines 생성 ─────────────────────────────────────────
  const playerLines: PlayerGameLine[] = [];

  // 투수 라인
  for (const [id, acc] of pitMap) {
    const isHome   = homeRoster.rotation[0] === id || homeRoster.bullpen.includes(id) || homeRoster.closer === id;
    const pitQ     = isHome ? homePitQ : awayPitQ;
    const teamWon  = isHome ? homeWon : !homeWon;
    const curIdx   = isHome ? hPitIdx : aPitIdx;
    const decision = pitcherDecision(id, teamWon, pitQ, curIdx);

    const ip = Math.floor(acc.outs / 3) + (acc.outs % 3) / 10;
    playerLines.push({
      role:     "pitcher",
      playerId: id,
      ip,
      er:       acc.er,
      h:        acc.h,
      k:        acc.k,
      bb:       acc.bb,
      decision,
    });
  }

  // 타자 라인
  const allBatterIds = new Set([...homeRoster.lineup, ...awayRoster.lineup]);
  for (const id of allBatterIds) {
    const acc = batMap.get(id);
    if (!acc || acc.ab === 0) continue;
    playerLines.push({
      role:     "batter",
      playerId: id,
      ab:       acc.ab,
      h:        acc.h,
      hr:       acc.hr,
      rbi:      acc.rbi,
      bb:       acc.bb,
      k:        acc.k,
      sb:       0,
    });
  }

  return {
    homeScore,
    awayScore,
    winnerId,
    loserId,
    playerLines,
    events: [],
  };
}
