// ── NPC 경기 로그 읽기 (projectb_v2.db `npc_game_log`) ────────────────────
//
// 🔴 **이 표는 2026-08-21까지 쓰기 전용이었다.** `season.ts`가 매주 쌓고
// `npc:trimGameLogs`가 매주 12만 행을 훑어 지웠는데 **읽는 곳이 하나도
// 없었다.** 10시즌 실측에서 168,049행이었다.
//
// ⚠ **slot.db가 아니다.** 경기 로그·시즌 성적·연감은 `projectb_v2.db`에
// 있다(`apps/desktop/ipc/db.cjs`). slotRepo로 가면 안 나온다 —
// `measure-perf.cjs`가 채널마다 어느 DB인지 적어 둔 이유다.
//
// 이 모듈 밖에서 `window.projectB.npcGetRecentGames()`를 직접 부르지 않는다.

import type { PlayerGameLine } from "../types/season";

/** 한 경기 출전 기록. `stat_json`은 `PlayerGameLine`을 그대로 직렬화한 것이다 */
export interface RecentGame {
  season: number;
  week: number;
  /** 저장 당시의 보직 문자열. 라인 안의 `role`("pitcher"/"batter")과 다르다 */
  role: string;
  /** "2026-07-14". 옛 행은 빈 문자열이다 — 화면이 주차로 되돌아갈 수 있어야 한다 */
  gameDate: string;
  /** **그 경기 당시의** 소속팀. 이적해도 과거 경기가 안 뒤집힌다 */
  teamId: string;
  opponentTeamId: string;
  line: PlayerGameLine | null;
}

interface RawRow {
  season: number;
  week: number;
  role: string;
  stat_json: string;
  game_date?: string;
  team_id?: string;
  opponent_team_id?: string;
}

/**
 * 최근 경기 기록. 최신순(시즌↓ 주차↓)으로 온다.
 *
 * ⚠ **보관 한도가 있다.** `season.ts`가 매주 `keep: 40`으로 잘라내므로
 * 선수당 최근 40경기까지만 남는다. `limit`을 그보다 크게 줘도 소용없다.
 *
 * ⚠ **Electron 밖(Vite 단독)에선 빈 배열이다.** 채널이 없다 — 화면이
 * "기록 없음"과 구분하려 들면 안 된다. 어차피 저장 자체가 안 되는 환경이다.
 */
export async function getRecentGames(
  slotId: string,
  npcId: string,
  limit = 10,
): Promise<RecentGame[]> {
  if (!slotId || !npcId) return [];
  const api = window.projectB?.npcGetRecentGames;
  if (!api) return [];

  const raw = await api(JSON.stringify({ slotId, npcId, limit }));
  let rows: RawRow[] | { error?: string };
  try {
    rows = JSON.parse(raw) as RawRow[] | { error?: string };
  } catch {
    return [];   // 깨진 응답으로 화면을 죽이지 않는다
  }
  if (!Array.isArray(rows)) {
    console.warn("[gameLogRepo] 최근 경기 조회 실패:", (rows as { error?: string }).error);
    return [];
  }

  return rows.map((r) => ({
    season: r.season,
    week: r.week,
    role: r.role,
    gameDate: r.game_date ?? "",
    teamId: r.team_id ?? "",
    opponentTeamId: r.opponent_team_id ?? "",
    line: parseLine(r.stat_json),
  }));
}

/** 깨진 한 줄이 표 전체를 못 죽이게 한다 — 로그는 오래된 형식이 섞일 수 있다 */
function parseLine(json: string): PlayerGameLine | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json) as PlayerGameLine;
    return v && typeof v === "object" && "role" in v ? v : null;
  } catch {
    return null;
  }
}

/** 투수 라인인가. `line.role`이 정본이다 — 바깥 `role`은 보직 문자열이라 다르다 */
export function isPitcherLine(
  line: PlayerGameLine | null,
): line is Extract<PlayerGameLine, { role: "pitcher" }> {
  return line?.role === "pitcher";
}

/**
 * 최근 N경기 합계. 투수는 이닝·자책으로 ERA, 타자는 타수·안타로 타율을 낸다.
 *
 * ⚠ **평균을 평균 내지 않는다.** 경기별 ERA를 평균하면 1이닝 5실점 경기가
 * 9이닝 무실점 경기와 같은 무게가 된다. 합계에서 한 번에 낸다.
 */
export function summarize(games: RecentGame[]): {
  kind: "pitcher" | "batter" | null;
  g: number;
  ip: number; er: number; k: number; bb: number; era: number | null;
  ab: number; h: number; hr: number; rbi: number; avg: number | null;
} {
  const out = {
    kind: null as "pitcher" | "batter" | null,
    g: 0, ip: 0, er: 0, k: 0, bb: 0, era: null as number | null,
    ab: 0, h: 0, hr: 0, rbi: 0, avg: null as number | null,
  };
  for (const gm of games) {
    const l = gm.line;
    if (!l) continue;
    out.g++;
    if (isPitcherLine(l)) {
      out.kind ??= "pitcher";
      out.ip += l.ip ?? 0; out.er += l.er ?? 0;
      out.k += l.k ?? 0;   out.bb += l.bb ?? 0;
    } else {
      out.kind ??= "batter";
      out.ab += l.ab ?? 0; out.h += l.h ?? 0;
      out.hr += l.hr ?? 0; out.rbi += l.rbi ?? 0;
      out.k += l.k ?? 0;   out.bb += l.bb ?? 0;
    }
  }
  if (out.kind === "pitcher" && out.ip > 0) out.era = (out.er * 9) / out.ip;
  if (out.kind === "batter" && out.ab > 0) out.avg = out.h / out.ab;
  return out;
}

/**
 * 경기 로그를 남긴다.
 *
 * 🔴 **주인공 리그가 통째로 빠져 있었다.** `backgroundLeague`는 시뮬 직후
 * 로그를 쌓는데(`season.ts`), 주인공 리그는 그 경로를 안 탄다
 * (`if (lid === protagonistLeagueId) continue;`). 그래서 **내 리그 선수만
 * 전원 0건**이었다 — 실측에서 고교 3,060명이 전부 비었고 다른 리그는 64~80%였다.
 * 12경기를 던진 투수에게 "경기 기록 없음"이 떠서 안 뛴 것처럼 보였다.
 *
 * ⚠ **부르는 자리는 `simulateNpcGame` 안이다.** 호출부가 여덟이라 각자
 * 부르게 하면 반드시 빠뜨린다 — 이름 풀이 그렇게 샜다.
 *
 * ⚠ **여기서 정리(trim)는 안 한다.** `npc:trimGameLogs`는 표 전체에
 * 윈도 함수를 돌리는 비싼 일이라 경기마다 부르면 안 된다. 배경 리그
 * 경로가 주마다 한 번 부르고, 한도는 선수 단위라 거기서 같이 잘린다.
 */
export interface GameMeta {
  /** "2026-07-14" — 일정에서 온다. 없으면 화면이 주차로 되돌아간다 */
  gameDate?: string;
  homeTeamId?: string;
  awayTeamId?: string;
  /**
   * 선수 → 그 경기 소속팀. **쓸 때 정해야 한다** — 읽을 때 현재 팀으로
   * 되짚으면 이적한 선수의 과거 경기가 전부 새 팀 기준으로 뒤집힌다.
   */
  teamOf?: (playerId: string) => string;
}

export async function recordGameLogs(
  slotId: string,
  season: number,
  week: number,
  lines: readonly PlayerGameLine[],
  meta: GameMeta = {},
): Promise<void> {
  if (!slotId || !lines || lines.length === 0) return;
  const api = window.projectB?.npcBulkInsertGameLogs;
  if (!api) return;

  const home = meta.homeTeamId ?? "";
  const away = meta.awayTeamId ?? "";
  const teamOf = (pid: string) => {
    const t = meta.teamOf?.(pid) ?? "";
    // 소속을 못 찾으면 양쪽 다 안 적는다 — **틀린 상대팀이 없는 것보다 나쁘다**
    return t === home || t === away ? t : "";
  };

  const logs = lines
    .filter((l) => l && typeof l.playerId === "string" && l.playerId)
    .map((l) => {
      const mine = teamOf(l.playerId);
      return {
        npcId: l.playerId, role: l.role, statJson: JSON.stringify(l),
        gameDate: meta.gameDate ?? "",
        teamId: mine,
        opponentTeamId: mine ? (mine === home ? away : home) : "",
      };
    });
  if (logs.length === 0) return;

  try {
    await api(JSON.stringify({ slotId, season, week, logs }));
  } catch (e) {
    // 기록이 안 남는다고 주간 진행을 멈추지 않는다 — 화면 하나가 비는 일이다
    console.warn("[gameLogRepo] 경기 로그 저장 실패:", e);
  }
}
