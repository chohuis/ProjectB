/**
 * 시작 시점 용병의 **출신 시드**.
 *
 * ⚠ 세계는 2026년에 **진행 중**이다. 그런데 새 게임의 KBL 용병 30명은 어디서
 * 왔다는 기록이 없었고, 그것보다 나빴다 — `seedCareerHistory`가 KBL 전체에
 * 과거 이력을 심으면서 **외국인을 안 가려서**, Rust `entry_route`가 입단 나이
 * 23~34를 전부 **"독립"**으로 매겼다. 용병이 **한국 독립리그 출신**으로
 * 기록돼 있었다.
 *
 *     2024  Martinez  육성선수 입단 (독립)     ← 이런 게 남아 있었다
 *
 * 2027년에 우르르 들어오는 게 아니라 **처음부터 돌고 있던 것처럼** 보여야
 * 한다(사용자 확정 2026-08-06): 재작년·작년·올해 영입이 섞여 있고, 작년에
 * 성적이 안 돼 돌아간 사람의 기록도 남아 있다.
 *
 * ⚠ **팀을 지어내지 않는다.** 새 게임 시점엔 ABL·JBL이 아직 없다(W1에 생성).
 * 특정 해외 팀을 적으면 **그 팀 로스터에 없는 사람이 그 팀 출신**이 된다.
 * 리그만 적는다 — "마이너 출신"은 참이고 "○○ 팀 출신"은 거짓이 된다.
 */

import { originLabel, type OriginRules } from "./foreignOrigin";

/** 시드용 최소 정보 */
export interface SeedPlayer {
  npcId: string;
  name: string;
  teamId: string;
  /** 이 리그에서 뛴 연차. 영입 연도를 여기서 역산한다 */
  proServiceYears?: number;
}

/** slot.db `transactions` 한 행 (`slotRepo.addTransactions` 입력) */
export interface SeedRow {
  seasonYear: number;
  week: number | null;
  category: string;
  playerId: string;
  playerName: string;
  fromTeamId: string | null;
  fromLeagueId: string | null;
  toTeamId: string | null;
  toLeagueId: string | null;
  detail: string;
  groupId: string | null;
}

/** 영입 연도를 흩는 폭(년). 0이면 전원 올해 영입이 된다 */
export const SIGNING_SPREAD = 3;

/**
 * 가중치대로 출신 리그를 하나 뽑는다. 규칙이 비면 `null`.
 *
 * ⚠ 여기서 팀은 안 고른다 — 위 머리말 참고.
 */
export function pickOriginLeague(rules: OriginRules, r: number): string | null {
  const entries = Object.entries(rules.weights ?? {});
  if (entries.length === 0) return null;
  const total = entries.reduce((a, [, w]) => a + w, 0);
  if (total <= 0) return entries[0][0];
  let x = Math.max(0, Math.min(0.999999, r)) * total;
  for (const [lid, w] of entries) {
    x -= w;
    if (x <= 0) return lid;
  }
  return entries[entries.length - 1][0];
}

export interface BuildSeedParams {
  players: readonly SeedPlayer[];
  rules: OriginRules;
  seasonYear: number;
  /** 0~1. 결정적이어야 한다 — 같은 세계를 다시 열면 같은 기록이어야 한다 */
  rand: () => number;
  /** 작년에 돌아간 용병 수. 팀 수 기준으로 호출측이 정한다 */
  departed?: number;
  /** 떠난 사람 이름을 만들 때 쓴다. 비면 떠난 기록을 안 만든다 */
  departedNames?: readonly { name: string; teamId: string }[];
}

/**
 * 영입 기록. **한 사람당 한 줄** — 그가 언제 어디서 왔는지.
 *
 * 연차(`proServiceYears`)가 있으면 그만큼 거슬러 올라간다. 로스터 생성이
 * 용병에게 0~2년을 주므로(`roster_gen.rs`) 자연히 2024~2026으로 흩어진다.
 */
export function buildForeignSeed(p: BuildSeedParams): SeedRow[] {
  const rows: SeedRow[] = [];

  for (const pl of p.players) {
    const league = pickOriginLeague(p.rules, p.rand());
    if (!league) break;   // 규칙이 없으면 아무것도 안 만든다
    const back = Math.min(SIGNING_SPREAD - 1, Math.max(0, pl.proServiceYears ?? 0));
    rows.push({
      seasonYear: p.seasonYear - back,
      week: null,
      category: "foreign_signing",
      playerId: pl.npcId,
      playerName: pl.name,
      // ⚠ 팀은 null이다. 리그만 참이다 — 머리말 참고
      fromTeamId: null,
      fromLeagueId: league,
      toTeamId: pl.teamId,
      toLeagueId: "LEAGUE_KBL",
      detail: `${originLabel(league)} 출신 영입`,
      groupId: null,
    });
  }

  // ── 떠난 용병 ────────────────────────────────────────────────
  //
  // ⚠ **선수를 만들지 않는다. 기록만 남긴다.** 그 사람들은 이미 세계에 없는
  // 게 맞다 — 작년에 성적이 안 돼 돌아갔다. 없는 선수를 만들어 두면 로스터·
  // 순위·드래프트가 전부 그를 세게 된다.
  const names = p.departedNames ?? [];
  for (let i = 0; i < Math.min(p.departed ?? 0, names.length); i++) {
    const league = pickOriginLeague(p.rules, p.rand()) ?? "";
    rows.push({
      seasonYear: p.seasonYear - 1,
      week: null,
      category: "release",
      playerId: `PLY_FGN_GONE_${p.seasonYear - 1}_${String(i).padStart(2, "0")}`,
      playerName: names[i].name,
      fromTeamId: names[i].teamId,
      fromLeagueId: "LEAGUE_KBL",
      toTeamId: null,
      toLeagueId: league || null,
      detail: "성적 미달 — 본국 복귀",
      groupId: null,
    });
  }

  return rows;
}
