import type { LeagueSeasonState, MatchResult, PlayerGameLine, Standing } from "../types/season";
import type { BatterSeasonStats, PlayerSeasonStats, PitcherSeasonStats } from "../types/save";
import { calcAvg, calcEra, calcOps, calcWhip } from "../types/season";

export function migrateLeagueState(ls: Partial<LeagueSeasonState>): LeagueSeasonState {
  return {
    standings:         ls.standings         ?? [],
    // ⚠ **여기서 정리하지 않는다.** 이 함수는 **경기마다** 돈다
    //   (`backgroundLeague`가 경기당 한 번). 전 리그 성적을 매번 훑으면
    //   주 진행이 그만큼 느려진다 — 정리는 **로드 때 한 번**이다
    //   (`seasonStore.hydrateFromSlot`).
    stats:             ls.stats             ?? {},
    playerConditions:  ls.playerConditions  ?? {},
    teamRotationIndex: ls.teamRotationIndex ?? {},
  };
}

export function sanitizeStatsRecord(
  stats: Record<string, PlayerSeasonStats>,
): Record<string, PlayerSeasonStats> {
  const safeN = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
  const out: Record<string, PlayerSeasonStats> = {};
  for (const [pid, st] of Object.entries(stats)) {
    if ((st as PitcherSeasonStats).type === "pitcher") {
      const s  = st as PitcherSeasonStats;
      const ip = safeN(s.ip);
      out[pid] = {
        ...s,
        g: safeN(s.g), gs: safeN(s.gs), w: safeN(s.w), l: safeN(s.l),
        sv: safeN(s.sv), hd: safeN(s.hd), ip,
        er: safeN(s.er), h: safeN(s.h), k: safeN(s.k), bb: safeN(s.bb),
        era: calcEra(safeN(s.er), ip), whip: calcWhip(safeN(s.bb), safeN(s.h), ip),
      };
    } else {
      // ⚠ **타자 쪽이 통째로 비어 있었다.** 투수만 NaN을 막고 파생값을 다시
      // 계산했고 타자는 그대로 통과시켰다. 그래서 한 번 어긋난 `pa`·`obp`·`ops`가
      // 세이브를 왕복해도 영영 안 고쳐졌다.
      //
      // 파생값은 저장된 값을 믿지 않고 **누적 counter에서 다시 만든다** —
      // 그러면 구 세이브도 로드 시점에 정상으로 돌아온다.
      const b  = st as BatterSeasonStats;
      const ab = safeN(b.ab), h = safeN(b.h), bb = safeN(b.bb), hr = safeN(b.hr);
      // ⚠ **없는 것과 0을 가른다.** 구 세이브엔 장타 수가 없다 —
      //   0으로 읽으면 장타가 전부 단타로 잡혀 SLG가 떨어진다
      const xbKnown = b.b2 !== undefined || b.b3 !== undefined;
      const b2 = xbKnown ? safeN(b.b2) : undefined;
      const b3 = xbKnown ? safeN(b.b3) : undefined;
      // 🔴 **타석·출루율 식은 `accumulateStats`와 같아야 한다.** 두 자리가
      //   갈리면 저장 직후와 로드 직후의 값이 달라진다.
      //       PA  = AB + BB + HBP + SAC + SF
      //       OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
      //   ⚠ 희생번트는 출루율 분모에 안 들어간다(야구 규칙).
      //   ⚠ 구 세이브엔 그 값이 없다 — 옛 식(AB + BB)으로 떨어진다.
      const scKnown = b.hbp !== undefined || b.sac !== undefined || b.sf !== undefined;
      const hbp = scKnown ? safeN(b.hbp) : 0;
      const sac = scKnown ? safeN(b.sac) : 0;
      const sf  = scKnown ? safeN(b.sf)  : 0;
      const pa = ab + bb + hbp + sac + sf;
      const obpDen = ab + bb + hbp + sf;
      const obp = obpDen > 0 ? Math.round(((h + bb + hbp) / obpDen) * 1000) / 1000 : 0;
      // 🔴 **루타(TB)로 장타율을 낸다** (2026-08-28).
      //
      //   예전엔 `(h + hr*3)/ab`였다 — 2루타·3루타를 **단타로 세는 근사**다.
      //   엔진은 처음부터 갈라 만들고 있었고 집계가 버려서 쓸 수가 없었다.
      //
      // ⚠ **구 세이브를 따로 갈래 짓지 않는다.** 처음엔 `xbKnown`으로 옛 식을
      //   남겼는데, **두 식이 같은 값을 낸다** — 장타 수가 0이면
      //   `(h − hr) + 4hr = h + 3hr`로 근사와 정확히 일치한다.
      //   변이 검증에서 그 갈래를 없애도 검사가 안 깨져서 드러났다.
      //   죽은 갈래를 두지 않는다.
      // ⚠ OPS가 승강 판정(`batterOpsBaseline`)·국가대표 form·트레이드 가치에
      //   물려 있다. 값이 움직이면 그쪽이 같이 움직인다.
      const tb = (h - (b2 ?? 0) - (b3 ?? 0) - hr) + (b2 ?? 0) * 2 + (b3 ?? 0) * 3 + hr * 4;
      const slg = ab > 0 ? Math.round((tb / ab) * 1000) / 1000 : 0;
      out[pid] = {
        ...b,
        g: safeN(b.g), pa, ab, h, hr, rbi: safeN(b.rbi), sb: safeN(b.sb),
        bb, k: safeN(b.k),
        avg: calcAvg(h, ab), obp, slg, ops: calcOps(obp, slg),
      };
    }
  }
  return out;
}

// ── 리그 기록 버킷 ───────────────────────────────────────────────
//
// ⚠ **`season.stats`는 리그 버킷이 아니다.** 주인공이 이번 시즌 뛴 기록이고,
// 1군에서 뛰다 2군에 내려가도 **합산**된다(개인 성적으로는 그게 맞다).
//
// 그런데 리그 집계가 `s.leagueId === lid ? s.stats : leagueState[lid].stats`
// 라는 관용구를 쓰고 있었다. `s.leagueId`는 `initSeason` 때만 정해져 시즌 중
// 안 바뀌므로, 주인공이 승강으로 오르내리면 **2군 경기 기록이 1군 버킷으로
// 읽힌다.**
//
// 실측(2029 KBL): 규정투수 62 → **94명**(10팀 리그에서 불가능),
// 2군 소속 선수가 1군 기록에 등장, OVR–ERA 상관 −0.54 → −0.20.
// 능력치 풀이 다른 두 집단이 섞이면 상관이 무너진다.
//
// 쓰기(`applyMatchResult`)는 이미 `leagueState[leagueId]`에 정확히 넣고 있다.
// **읽기만 바로잡으면 된다.**

/** 리그 기록. 주인공 소속 여부와 무관하게 그 리그 버킷만 본다 */
export function leagueStatsOf(
  s: Pick<import("../types/season").SaveSeason, "leagueState">,
  leagueId: string,
): Record<string, PlayerSeasonStats> {
  return s.leagueState?.[leagueId]?.stats ?? {};
}

/** 리그 순위. 같은 이유로 버킷만 본다 */
export function leagueStandingsOf(
  s: Pick<import("../types/season").SaveSeason, "leagueState">,
  leagueId: string,
): Standing[] {
  return s.leagueState?.[leagueId]?.standings ?? [];
}

export function updateStandings(
  standings: Standing[],
  result: MatchResult,
  homeTeamId: string,
  awayTeamId: string,
): Standing[] {
  const isDraw = result.loserId === null;
  return standings.map((s) => {
    if (isDraw) {
      if (s.teamId !== homeTeamId && s.teamId !== awayTeamId) return s;
    } else {
      if (s.teamId !== result.winnerId && s.teamId !== result.loserId) return s;
    }

    const isWinner = s.teamId === result.winnerId;

    const wins   = s.wins   + (isWinner && !isDraw ? 1 : 0);
    const losses = s.losses + (!isWinner && !isDraw ? 1 : 0);
    const draws  = s.draws  + (isDraw ? 1 : 0);
    const total  = wins + losses;
    const winPct = total > 0 ? Math.round((wins / total) * 1000) / 1000 : 0;

    const isHome = s.teamId === homeTeamId;
    const runsFor     = s.runsFor     + (isHome ? result.homeScore : result.awayScore);
    const runsAgainst = s.runsAgainst + (isHome ? result.awayScore : result.homeScore);

    const streakChar = isDraw ? "D" : isWinner ? "W" : "L";
    const streak     = updateStreak(s.streak, streakChar);
    const last10     = updateLast10(s.last10, streakChar);

    return { ...s, wins, losses, draws, winPct, runsFor, runsAgainst, streak, last10 };
  });
}

export function updateStreak(current: string, result: "W" | "L" | "D"): string {
  if (!current) return `${result}1`;
  const char = current[0];
  const n    = parseInt(current.slice(1), 10);
  return char === result ? `${result}${n + 1}` : `${result}1`;
}

export function updateLast10(current: string, result: "W" | "L" | "D"): string {
  // 구 압축 포맷 "W3L2" → 확장 "WWWLL" 변환
  const expanded = current.replace(/([WLD])(\d+)/g, (_, c: string, n: string) => c.repeat(parseInt(n)));
  const chars = [...expanded.replace(/[^WLD]/g, ""), result];
  return chars.slice(-10).join("");
}

export function accumulateStats(
  stats: Record<string, PlayerSeasonStats>,
  lines: PlayerGameLine[],
): Record<string, PlayerSeasonStats> {
  const next = { ...stats };
  for (const line of lines) {
    if (line.role === "pitcher") {
      const prev = (next[line.playerId] as PitcherSeasonStats | undefined) ?? {
        type: "pitcher", g:0, gs:0, w:0, l:0, sv:0, hd:0, ip:0, er:0, h:0, k:0, bb:0, era:0, whip:0,
      };
      const safeNum = (v: unknown) => (typeof v === "number" && !isNaN(v) ? v : 0);
      const ip  = safeNum(prev.ip)  + safeNum(line.ip);
      const er  = safeNum(prev.er)  + safeNum(line.er);
      const h   = safeNum(prev.h)   + safeNum(line.h);
      // 🔴 **피홈런.** 엔진은 처음부터 홈런을 따로 만드는데 안 세고 있었다.
      // ⚠ 구 세이브는 둘 다 `undefined`다 — 그때는 필드를 안 만든다.
      //   0으로 채우면 "피홈런 0개인 투수"가 되어 기록이 거짓이 된다.
      const hrKnown = prev.hr !== undefined || line.hr !== undefined;
      const hr  = hrKnown ? safeNum(prev.hr) + safeNum(line.hr) : undefined;
      const k   = safeNum(prev.k)   + safeNum(line.k);
      const bb  = safeNum(prev.bb)  + safeNum(line.bb);
      // 사구 — 볼넷과 다른 사건이다. 구 세이브는 필드를 안 만든다
      const hbpKnown = prev.hbp !== undefined || line.hbp !== undefined;
      const pHbp = hbpKnown ? safeNum(prev.hbp) + safeNum(line.hbp) : undefined;
      const w   = prev.w   + (line.decision === "W"  ? 1 : 0);
      const l   = prev.l   + (line.decision === "L"  ? 1 : 0);
      const sv  = prev.sv  + (line.decision === "SV" ? 1 : 0);
      const hd  = prev.hd  + (line.decision === "HD" ? 1 : 0);
      next[line.playerId] = {
        // 🔴 `gs: prev.gs`였다 — **올리는 코드가 아무 데도 없어** 전원 0이었다.
        //   화면 넷이 이걸 표시한다(PlayerDetailModal · CareerEndScreen ·
        //   SeasonEndModal · LeaguePage). 엔진이 `gs`를 보낸다
        type:"pitcher", g: prev.g+1, gs: prev.gs + (line.gs ? 1 : 0), w, l, sv, hd, ip, er, h, k, bb,
        ...(hr !== undefined ? { hr } : {}),
        ...(pHbp !== undefined ? { hbp: pHbp } : {}),
        era: calcEra(er, ip), whip: calcWhip(bb, h, ip),
        // 득점권 스플릿 — 엔진이 안 넘기던 시절의 세이브도 살아 있어야 하므로 ?? 0
        rispAb: safeNum(prev.rispAb) + safeNum(line.rispAb),
        rispH:  safeNum(prev.rispH)  + safeNum(line.rispH),
      };
    } else {
      const prev = (next[line.playerId] as BatterSeasonStats | undefined) ?? {
        type:"batter", g:0, pa:0, ab:0, h:0, hr:0, rbi:0, sb:0, bb:0, k:0, avg:0, obp:0, slg:0, ops:0,
      };
      const ab  = prev.ab  + (line.ab  ?? 0);
      const h   = prev.h   + (line.h   ?? 0);
      const hr  = prev.hr  + (line.hr  ?? 0);
      // 🔴 **장타를 갈라 센다.** 없으면 SLG가 옛 근사로 떨어진다(아래 참고).
      // ⚠ 구 세이브는 `undefined`다 — 0으로 채우면 "2루타 0개"가 되어 거짓이다.
      const xbKnown = prev.b2 !== undefined || line.b2 !== undefined
                   || prev.b3 !== undefined || line.b3 !== undefined;
      const b2  = xbKnown ? (prev.b2 ?? 0) + (line.b2 ?? 0) : undefined;
      const b3  = xbKnown ? (prev.b3 ?? 0) + (line.b3 ?? 0) : undefined;
      const rKnown = prev.r !== undefined || line.r !== undefined;
      const r   = rKnown ? (prev.r ?? 0) + (line.r ?? 0) : undefined;
      // 🔴 **셋 다 타수가 아니다** — 타석·출루율 식이 이 값들을 본다
      const scKnown = prev.hbp !== undefined || line.hbp !== undefined
                   || prev.sac !== undefined || line.sac !== undefined
                   || prev.sf  !== undefined || line.sf  !== undefined;
      const hbp = scKnown ? (prev.hbp ?? 0) + (line.hbp ?? 0) : undefined;
      const sac = scKnown ? (prev.sac ?? 0) + (line.sac ?? 0) : undefined;
      const sf  = scKnown ? (prev.sf  ?? 0) + (line.sf  ?? 0) : undefined;
      const rbi = prev.rbi + (line.rbi ?? 0);
      const bb  = prev.bb  + (line.bb  ?? 0);
      const k   = prev.k   + (line.k   ?? 0);
      const sb  = prev.sb  + (line.sb  ?? 0);
      // ⚠ **타석은 누적하지 않고 파생한다.**
      //
      // 예전엔 `prev.pa + ab + bb`였는데 `ab`·`bb`가 **이미 누적 합계**라
      // 매 경기 누적값을 또 더했다 — `pa`가 경기 수의 제곱으로 늘었다.
      // 100경기·경기당 4타수면 실제 ~450인데 계산값이 ~20,200(45배)이다.
      //
      // 그 값이 두 곳을 망가뜨렸다:
      //  · 수상 자격선 `minPa` 200이 실질 4~5타석이 되어 12타수 7안타(.583)가
      //    타격왕이 됐다
      //  · `obp = (h+bb)/pa`가 45배 작아지고 `ops`도 같이 붕괴 — 승강 판정
      //    (`batterOpsBaseline` 0.700)·국가대표 form·트레이드 가치가 전부
      //    이 값 위에 서 있다
      //
      // 희생타·사구를 안 세는 이 모델에서 타석 = 타수 + 볼넷이다. 누적 counter
      // (ab·bb)에서 파생하면 애초에 어긋날 수가 없고, 구 세이브도 다음 경기부터
      // 저절로 정상값이 된다(마이그레이션 불필요 — 사용자 확정 "그대로 진행").
      // 🔴 **타석·출루율 식이 바뀐다** (2026-08-28).
      //
      //   예전 주석이 "희생타·사구를 안 세는 이 모델에서 타석 = 타수 + 볼넷"
      //   이라 적고 있었다 — **그 사건들이 엔진에 아예 없어서** 맞는 말이었다.
      //   이제 셋 다 일어나므로 야구 규칙대로 센다:
      //
      //       PA  = AB + BB + HBP + SAC + SF
      //       OBP = (H + BB + HBP) / (AB + BB + HBP + SF)
      //
      //   ⚠ **희생번트(SAC)는 출루율 분모에 안 들어간다.** 야구 규칙이 그렇다 —
      //     번트는 작전이라 타자에게 책임을 안 묻는다. 희생플라이는 들어간다.
      //   ⚠ 구 세이브는 그 값이 없다 — 옛 식(AB + BB)으로 떨어진다.
      const pa  = ab + bb + (hbp ?? 0) + (sac ?? 0) + (sf ?? 0);
      const avg = calcAvg(h, ab);
      const obpDen = ab + bb + (hbp ?? 0) + (sf ?? 0);
      const obp = obpDen > 0 ? Math.round(((h + bb + (hbp ?? 0)) / obpDen) * 1000) / 1000 : 0;
      // 🔴 **루타(TB)로 장타율을 낸다** — 위 `sanitizeStatsRecord` 쪽과
      //   **같은 식**이어야 한다. 두 자리가 갈리면 저장 직후와 로드 직후의
      //   SLG가 달라진다.
      // ⚠ 장타 수가 없으면(구 세이브) `?? 0`이 되고, 그때 이 식은
      //   `h + 3hr`로 옛 근사와 **정확히 같아진다** — 갈래를 나눌 필요가 없다.
      const tb = (h - (b2 ?? 0) - (b3 ?? 0) - hr) + (b2 ?? 0) * 2 + (b3 ?? 0) * 3 + hr * 4;
      const slg = ab > 0 ? Math.round((tb / ab) * 1000) / 1000 : 0;
      next[line.playerId] = {
        type:"batter", g: prev.g+1, pa, ab, h, hr, rbi, sb, bb, k,
        ...(b2 !== undefined ? { b2 } : {}),
        ...(b3 !== undefined ? { b3 } : {}),
        ...(r  !== undefined ? { r }  : {}),
        ...(hbp !== undefined ? { hbp } : {}),
        ...(sac !== undefined ? { sac } : {}),
        ...(sf  !== undefined ? { sf }  : {}),
        avg, obp, slg, ops: calcOps(obp, slg),
        // 득점권 스플릿 — 엔진이 안 넘기던 시절의 세이브도 살아 있어야 하므로 ?? 0
        rispAb: (prev.rispAb ?? 0) + (line.rispAb ?? 0),
        rispH:  (prev.rispH  ?? 0) + (line.rispH  ?? 0),
      };
    }
  }
  return next;
}
