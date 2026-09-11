// ── 기록 탭 카드 둘 — 계약 이력 · 대회 전적 ───────────────────────
//
// `PLAN_MESSAGE_DASHBOARDS.md` §7. **소식함은 흐르는 자리고 기록 탭은 남는
// 자리다** — 1500칸 상한에 밀려 계약 완료·대회 결과 소식이 사라져도 여기는
// 남는다. 그게 이 두 카드가 있는 이유다.
//
// 🔴 **새 화면을 안 만든다** (§7-4). `me > status` 기록 탭 안에 카드 둘을
//    더하고, 그리는 것은 소식과 **같은 `StatTable`** 이다. 그래서 여기가
//    만드는 것도 `TableMetadata` 다 — 소식이 쓰는 그릇과 같다.
//
// 🔴 **여기서 말을 짓지 않는다.** 열 이름·빈 표 문구·계약 종류의 한글은
//    `dashboard_labels.json` `recordTab` 이 갖고, 조항 낱말은
//    `contract_terms.json` `signed` 가 갖는다. 이 파일은 **값만** 만든다.
//
// ⚠ **컴포넌트 안에서 만들면 검사가 한 줄도 못 잰다** — vitest 가
//   `environment: "node"` 라 `.svelte` 를 못 띄운다. `dashboardView.ts` 가
//   먼저 같은 이유로 갈라져 나왔고 이건 그 배치를 따른다.

import type { ProContract, CareerGameLogEntry } from "../types/save";
import type { TableCell, TableMetadata } from "../types/main";
import type { TournamentBracket } from "./tournament";
import { runSummary, teamRun } from "./tournamentView";
import { ipLabel } from "./baseballFormat";

/** 문안을 찾는 이름 — `dashboardCopy` 가 뿌리(`recordTab`)를 보고 내려간다 */
export const CONTRACT_HISTORY_KIND = "recordTab.contractHistory";
export const TOURNAMENT_RECORD_KIND = "recordTab.tournamentRecord";

// ── 계약 이력 ────────────────────────────────────────────────────

/** 조항 낱말 — `contract_terms.json` `signed` 의 셋. 없으면 조항 칸이 빈다 */
export interface ContractTermWords {
  teamOption: string;
  playerOption: string;
  noTrade: string;
}

export interface ContractHistoryOptions {
  /** 연봉 한 칸. 자릿수는 뜻이 있는 값이라 **부르는 쪽이 정한다** */
  salaryText: (salary: number) => string;
  /** `new`·`resign`·`fa` → 그 말. 없는 종류는 키를 그대로 쓴다 */
  kindLabel?: Record<string, string>;
  terms?: ContractTermWords | null;
  /** 「—」 — 값이 없는 칸 */
  emptyCell?: string;
}

/**
 * 조항 한 칸 — 붙은 것만 잇는다.
 *
 * ⚠ **없는 조항은 줄 자체를 안 적는다** (`contract_terms.json` `_rule`).
 *   「팀 옵션 0년」을 적으면 없는 것이 있는 것처럼 보인다.
 *
 * ⚠ 자리표는 `{optYears}` 하나뿐이라 조사가 안 붙는다 — 정규식을 안 쓴다.
 */
export function contractTermsText(c: ProContract, w?: ContractTermWords | null): string {
  if (!w) return "";
  const out: string[] = [];
  if (c.teamOptionYears > 0)
    out.push(w.teamOption.split("{optYears}").join(String(c.teamOptionYears)));
  if (c.playerOptionYears > 0)
    out.push(w.playerOption.split("{optYears}").join(String(c.playerOptionYears)));
  if (c.noTrade) out.push(w.noTrade);
  return out.join(" · ");
}

/**
 * 계약 이력 표.
 *
 * 🔴 **지금 계약도 한 줄이다.** 세이브의 `contractHistory` 는 **지나간 것만**
 *    담는다(현재 것은 `contract` 다) — 표에서 갈라 두면 「이력」이 지금까지
 *    이어지지 않고 한 칸 앞에서 끊긴다. 지금 계약은 굵게(`myTeam`) 선다.
 *
 * ⚠ **최근이 위다.** 「시즌별 성적」·「커리어 타임라인」이 그렇게 서 있다 —
 *   여기만 반대로 두면 같은 탭에서 시간이 두 방향으로 흐른다.
 *
 * ⚠ **연도를 모르면 `—` 다.** 구 세이브의 계약엔 `signedYear` 가 없다.
 *   0 을 채우면 「0년에 맺은 계약」이 된다.
 */
export function buildContractHistoryTable(
  history: ProContract[] | undefined,
  current: ProContract | undefined,
  opts: ContractHistoryOptions,
): TableMetadata {
  const empty = opts.emptyCell ?? "—";
  const kindMap = opts.kindLabel ?? {};
  const all: { c: ProContract; isCurrent: boolean }[] = [
    ...(history ?? []).map((c) => ({ c, isCurrent: false })),
    ...(current ? [{ c: current, isCurrent: true }] : []),
  ];
  // 연도를 모르는 줄은 뒤로 — 위에 두면 「모르는 해」가 제일 최근처럼 보인다
  const sorted = [...all].sort(
    (a, b) => (b.c.signedYear ?? -Infinity) - (a.c.signedYear ?? -Infinity),
  );

  const rows = sorted.map(({ c, isCurrent }) => {
    const row: Record<string, TableCell> & { myTeam?: boolean } = {
      year: c.signedYear ?? null,
      teamId: c.teamId,
      salary: opts.salaryText(c.salary),
      years: c.durationYears,
      kind: c.kind ? (kindMap[c.kind] ?? c.kind) : empty,
      options: contractTermsText(c, opts.terms) || empty,
    };
    if (isCurrent) row.myTeam = true;
    return row;
  });

  return { type: "table", kind: CONTRACT_HISTORY_KIND, columns: [], rows };
}

// ── 대회 전적 ────────────────────────────────────────────────────

export interface TournamentRunInput {
  year: number;
  /** 대회 이름. 지난 시즌은 저장된 행이 이름을 들고 온다 */
  name: string;
  /** 그 해 내 팀. 해마다 다르다 */
  teamId: string;
  bracket: TournamentBracket | null;
  /**
   * 그 해 내 등판 기록. **비어 있는 것과 없는 것이 다르다** —
   * 빈 배열이면 「그 해 기록은 있는데 이 대회엔 안 나갔다」이고,
   * `undefined` 면 「기록 자체가 안 남은 시즌」이다.
   */
  gameLog?: CareerGameLogEntry[];
}

export interface TournamentRecordOptions {
  /**
   * 「—」 — 못 재는 칸.
   *
   * ⚠ 「등판 없음」은 여기서 안 만든다. 빈 `myLine` 을 보고 **화면이**
   *   문안(`recordTab.tournamentRecord.noAppearance`)을 찍는다 —
   *   `dashboardView.buildTableRows` 가 이미 그 자리를 갖고 있다.
   */
  emptyCell?: string;
}

/**
 * 그 대회에서 내가 던진 것 한 줄.
 *
 * ⚠ **주차와 상대를 둘 다 본다.** 주차만 보면 같은 주에 있던 리그 경기가
 *   대회 기록으로 섞인다 — 대회 주간에도 배경 리그는 돈다.
 *
 * ⚠ **`null` 은 「안 던졌다」이고 `undefined` 는 「못 잰다」다.** 기록이 안
 *   남은 시즌을 「등판 없음」으로 적으면 없는 사실을 적는 것이 된다.
 */
export function myTournamentLine(
  bracket: TournamentBracket | null,
  teamId: string,
  gameLog: CareerGameLogEntry[] | undefined,
): string | null | undefined {
  if (!bracket || !gameLog) return undefined;
  const mine = bracket.matches.filter(
    (m) => !m.isBye && (m.homeTeamId === teamId || m.awayTeamId === teamId),
  );
  if (mine.length === 0) return null;
  const keys = new Set(
    mine.map((m) => {
      const opp = m.homeTeamId === teamId ? m.awayTeamId : m.homeTeamId;
      return `${m.week}:${opp ?? ""}`;
    }),
  );
  const games = gameLog.filter((g) => keys.has(`${g.week}:${g.opponentId}`));
  if (games.length === 0) return null;

  const outs = games.reduce((n, g) => n + Math.round((g.ip ?? 0) * 3), 0);
  const k = games.reduce((n, g) => n + (g.k ?? 0), 0);
  return `${ipLabel(outs / 3)}이닝 ${k}K`;
}

/**
 * 대회 전적 표 — **나간 대회만 선다.**
 *
 * ⚠ 안 나간 대회까지 그리면 해마다 여덟 줄씩 「미출전」이 쌓여 표가 안 읽힌다.
 *   그 대회가 열렸다는 사실은 `league` 탭의 연도별 기록이 이미 든다 (§7-3).
 */
export function buildTournamentRecordTable(
  runs: TournamentRunInput[],
  opts: TournamentRecordOptions = {},
): TableMetadata {
  const empty = opts.emptyCell ?? "—";
  const rows: (Record<string, TableCell> & { myTeam?: boolean })[] = [];

  for (const r of [...runs].sort((a, b) => b.year - a.year || a.name.localeCompare(b.name))) {
    const run = teamRun(r.bracket, r.teamId);
    if (!run) continue;
    const line = myTournamentLine(r.bracket, r.teamId, r.gameLog);
    rows.push({
      year: r.year,
      tournament: r.name,
      round: runSummary(run, "done"),
      // `null` 이면 화면이 문안의 「등판 없음」을 찍는다 — 못 재는 해는 `—` 다
      myLine: line === undefined ? empty : line,
      ...(run.champion ? { myTeam: true } : {}),
    });
  }

  return { type: "table", kind: TOURNAMENT_RECORD_KIND, columns: [], rows };
}
