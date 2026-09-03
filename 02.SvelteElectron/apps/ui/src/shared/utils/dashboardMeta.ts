// ── 소식 대시보드 — **생산부**가 실어 보낼 metadata 만들기 ──────
//
// `PLAN_MESSAGE_DASHBOARDS.md` §1·§3. 화면 쪽 짝은 `dashboardView.ts` 다 —
// 저쪽은 받은 것을 그리고 이쪽은 보낼 것을 만든다.
//
// 🔴 **본문 문자열을 건드리지 않는다.** 표를 붙여도 `body` 는 그대로 둔다 —
//    소식함 목록·검색·구 세이브가 전부 그 글자를 읽고, `metadata` 를 못 그리는
//    자리(문안 없음·구 화면)에서 **텍스트가 폴백**이어야 한다.
//
// 🔴 **말을 짓지 않는다.** 열 이름·빈 칸·표 제목은 전부
//    `messages/dashboard_labels.json`(B-21)에서 오고 화면이 입힌다. 여기서
//    넘기는 것은 **값**이다 — `TableColumn.label` 을 빈 문자열로 두면 문안이
//    채운다(`resolveColumns`).
//
// ⚠ **이름은 여기서 풀어서 보낸다.** `StatTable` 에는 팀·선수 이름을 찾는
//    자리가 없다(`cellText` 가 값을 그대로 찍는다). `teamId` 칸에 id 를
//    실어 보내면 화면에 `TEAM_KBL_1` 이 뜬다 — **표시 이름을 담는다.**
//    (열 키는 문안이 `teamId` 로 선언해 둔 그대로 쓴다.)
//
// ⚠ **숫자 자릿수는 여기서 정한다.** 승률 `.633` · 이닝 `168.1` 처럼 자릿수
//    자체가 뜻이라 화면이 반올림하면 안 된다(`dashboardView.cellText` 머리말).

import type { TableCell, TableColumn, TableMetadata } from "../types/main";
import type { ContractIncentive, PitcherSeasonStats } from "../types/save";
import { ipLabel, eraLabel } from "./baseballFormat";
import { incentiveLabel } from "./contractTerms";
import type { IncentiveSettlement } from "./incentiveEngine";
import { FA_TERM_LABEL } from "./faOfferTerms";
import { tableLabelBlock } from "./dashboardCopy";

/** 만원 — 본문(`contractDecision`)과 **같은 표기**다 */
const manwon = (v: number): string => `${Math.round(v).toLocaleString()}만원`;

/** 승률 — `.633`. 정본은 `weekPhases/standingsNews.pctStr` 이고 같은 식이다 */
const pct = (v: number): string =>
  v >= 1 ? "1.000" : `.${String(Math.round(v * 1000)).padStart(3, "0")}`;

// ── 순위표 (msg-digest-) ──────────────────────────────────────

export interface StandingsRowInput {
  teamId: string;
  /** 표시 이름 — 화면이 못 찾는다(머리말) */
  teamName: string;
  wins: number;
  losses: number;
  draws: number;
  winPct: number;
  streak?: string;
}

export interface StandingsTableInput {
  /** **이미 정렬된** 행. 순위는 순서다 — 여기서 다시 정렬하지 않는다 */
  rows: readonly StandingsRowInput[];
  myTeamId: string;
  /**
   * 지난 순위 — 없으면 `undefined`. 있는 팀만 변동을 그린다.
   *
   * ⚠ **첫 달·첫 시즌엔 통째로 없다**(§3-1). 그때는 `deltaKey` 를 빼고
   *   보낸다 — `0` 으로 채우면 「변동 없음」과 「모름」이 같아 보인다.
   */
  prevRankOf?: (teamId: string) => number | undefined;
}

/**
 * 순위표 한 벌 → `TableMetadata`.
 *
 * ⚠ **열을 안 실어 보낸다.** 문안(`table.digest.columns`)이 선언한 순서로
 *   화면이 세우고, 값이 있는 선택 열(무·연속)만 붙는다(`resolveColumns`).
 *
 * ⚠ **무승부 열은 한 팀이라도 있을 때만 넣는다.** 전 행에 `0` 을 실으면
 *   문안의 선택 열 판정(`has`)이 늘 참이 되어 빈 열이 는다.
 */
export function standingsTableMeta(input: StandingsTableInput): TableMetadata {
  const anyDraw = input.rows.some((r) => r.draws > 0);
  const anyStreak = input.rows.some((r) => (r.streak ?? "") !== "");
  let anyDelta = false;

  const rows = input.rows.map((r, i) => {
    const rank = i + 1;
    const row: Record<string, TableCell> & { myTeam?: boolean } = {
      rank,
      teamId: r.teamName,
      w: r.wins,
      l: r.losses,
      pct: pct(r.winPct),
    };
    if (anyDraw) row.draws = r.draws;
    if (anyStreak) row.streak = r.streak ?? "";
    const prev = input.prevRankOf?.(r.teamId);
    // 순위는 작을수록 좋다 — 「오른 칸 수」로 부호를 맞춰 보낸다(`deltaMark`)
    if (prev != null && Number.isFinite(prev)) { row.delta = prev - rank; anyDelta = true; }
    if (r.teamId === input.myTeamId) row.myTeam = true;
    return row;
  });

  return {
    type: "table",
    kind: "digest",
    columns: [],
    rows,
    ...(anyDelta ? { deltaKey: "delta" } : {}),
  };
}

// ── 시즌 성적 (msg-pro-season-end- · msg-indie-season-end-) ────

/**
 * 시즌 성적 한 장 → 항목·값 표.
 *
 * ⚠ **지난해 열은 선택이다.** `CareerRecord.statLine` 은 이미 굳은 **문자열**
 *   이라 열로 못 쪼갠다 — 숫자로 된 지난해 기록을 넘길 수 있을 때만 붙이고,
 *   없으면 아예 안 보낸다(`optionalColumns.prev` 는 값이 있어야 그린다).
 *
 * ⚠ **성적이 없으면 행이 없다.** 빈 표를 보내면 문안의 `empty` 한 줄이 뜬다 —
 *   0 으로 채우면 「안 던졌다」와 「0승 0패였다」가 같아 보인다.
 */
export function pitcherSeasonTableMeta(
  kind: string,
  st: PitcherSeasonStats | undefined,
  prev?: PitcherSeasonStats | undefined,
): TableMetadata {
  if (!st) return { type: "table", kind, columns: [], rows: [] };

  const val = (s: PitcherSeasonStats, key: string): TableCell => {
    switch (key) {
      case "w":    return s.w ?? 0;
      case "l":    return s.l ?? 0;
      case "sv":   return s.sv ?? 0;
      case "hd":   return s.hd ?? 0;
      case "ip":   return ipLabel(s.ip ?? 0);
      case "era":  return eraLabel(s.era);
      case "whip": return eraLabel(s.whip);
      case "k":    return s.k ?? 0;
      default:     return "";
    }
  };

  // 순서는 문안(`table.seasonEndPro.rows`)과 같다 — 항목 이름은 화면이 붙인다
  const keys = ["w", "l", "sv", "hd", "ip", "era", "whip", "k"];
  const rows = keys.map((k) => {
    const row: Record<string, TableCell> = { item: k, value: val(st, k) };
    if (prev) row.prev = val(prev, k);
    return row;
  });
  return { type: "table", kind, columns: [], rows };
}

// ── 계약 조건 (msg-contract-signed- · msg-fa-signed-) ──────────

export interface ContractTableInput {
  /** 표시 이름 */
  teamName: string;
  salary: number;
  years: number;
  signingBonus: number;
  teamOptionYears?: number;
  playerOptionYears?: number;
  noTrade?: boolean;
  /** 주인공 계약만 든다 — NPC 는 인센티브가 없다 */
  incentives?: readonly ContractIncentive[];
}

/**
 * 조항 한 줄 — **이름표는 `faOfferTerms.FA_TERM_LABEL` 하나뿐이다.**
 * FA 카드·선수 상세·계약 협상이 이미 그걸 쓴다. 여기서 또 적으면 두 벌이 된다.
 */
function clauseText(i: ContractTableInput): string {
  const parts: string[] = [];
  if ((i.teamOptionYears ?? 0) > 0)   parts.push(`${FA_TERM_LABEL.teamOption} ${i.teamOptionYears}년`);
  if ((i.playerOptionYears ?? 0) > 0) parts.push(`${FA_TERM_LABEL.playerOption} ${i.playerOptionYears}년`);
  if (i.noTrade === true)             parts.push(FA_TERM_LABEL.noTrade);
  return parts.join(" · ");
}

/**
 * 계약 조건 → 항목·값 표. 인센티브가 있으면 **표 안의 표**로 단다.
 *
 * ⚠ **없는 항목은 행을 안 만든다.** 계약금 0·조항 없음을 「0」·「—」로 적으면
 *   본문 규칙(`contract_terms.json` 의 「없는 조항은 줄 자체를 안 적는다」)과
 *   어긋난다.
 *
 * ⚠ 인센티브 표는 **항목·금액 두 칸**이다. 문안에 `condition` 열이 선언돼
 *   있지만 채울 값이 항목 이름(`25등판`)과 같아 빈 열이 된다 — 열을 실어
 *   보내 그 칸을 세우지 않는다. (조건을 따로 쓰려면 문안이 먼저 갈라져야 한다.)
 */
export function contractTableMeta(kind: string, i: ContractTableInput): TableMetadata {
  const rows: Record<string, TableCell>[] = [
    { item: "teamId", value: i.teamName },
    { item: "salary", value: manwon(i.salary) },
    { item: "years",  value: `${i.years}년` },
  ];
  if (i.signingBonus > 0) rows.push({ item: "bonus", value: manwon(i.signingBonus) });
  const clauses = clauseText(i);
  if (clauses) rows.push({ item: "options", value: clauses });

  const meta: TableMetadata = { type: "table", kind, columns: [], rows };

  const inc = i.incentives ?? [];
  if (inc.length > 0) {
    const cols: TableColumn[] = [
      { key: "name", label: "" },
      { key: "amount", label: "", align: "right" },
    ];
    meta.extra = {
      type: "table",
      kind: `${kind}.incentives`,
      columns: cols,
      rows: inc.map((x) => ({ name: incentiveLabel(x), amount: manwon(x.bonus) })),
    };
  }
  return meta;
}

// ── 인센티브 정산 (msg-contract-incentive-) ────────────────────

/** 정산 표의 종류 이름 — 문안(`table.incentiveSettlement`)의 키다 */
export const INCENTIVE_SETTLEMENT_KIND = "incentiveSettlement";

/**
 * 시즌 끝 정산 → 항목·결과·실측·금액 표 (PLAN_CONTRACT_TERMS §5).
 *
 * 🔴 **판정을 다시 하지 않는다.** `settleIncentives` 가 낸 줄을 그대로 옮긴다 —
 *    여기서 문턱을 다시 재면 본문(`incentiveMessageBody`)과 표가 **다른 답**을
 *    낼 수 있다. 같은 `IncentiveSettlement` 하나에서 둘이 나와야 한다.
 *
 * 🔴 **「조건」 열이 없다.** `incentiveLabel()` 이 문턱을 이름에 접어 넣어
 *    (「25등판」·「ERA 3.00 이하」) 조건 열을 세우면 같은 값이 두 칸에 선다
 *    (B-30 이 남긴 물음의 답이다). 대신 **실측**을 세운다.
 *
 * ⚠ **미달한 줄의 금액은 빈 칸이다.** `0만원` 으로 적으면 「0원을 받았다」로
 *   읽힌다 — 안 받은 것이라 `—` 가 맞다.
 * ⚠ **수상 줄의 실측은 빈 칸이다.** 엔진이 `1`·`0` 을 주는데(`measure`)
 *   「골든글러브 · 실측 1」은 읽을 수 있는 말이 아니다 — 받았는지는 결과
 *   칸이 이미 말한다.
 * ⚠ 합계는 각주 틀(`합계 +{total}만원`)에 **숫자만** 넘긴다. 지급이 없으면
 *   각주를 안 그린다 — 「합계 +0만원」은 표 아래에 둘 말이 아니다.
 */
export function incentiveSettlementTableMeta(st: IncentiveSettlement): TableMetadata {
  const meta: TableMetadata = {
    type: "table",
    kind: INCENTIVE_SETTLEMENT_KIND,
    columns: [],
    rows: st.rows.map((r) => ({
      name: r.label,
      // 낱말로 싣는다 — 「달성」은 문안이 갖는다 (`outcomeLabel`)
      outcome: r.outcome,
      actual: isAwardRow(r.key) || r.actual === "" ? null : r.actual,
      amount: r.paid > 0 ? manwon(r.paid) : null,
    })),
  };
  if (st.total > 0) meta.footnoteVars = { total: Math.round(st.total).toLocaleString() };
  return meta;
}

/**
 * 수상 축인가 — `incentiveKey` 가 `${kind}:${awardId}:${threshold}` 라 앞
 * 조각이 축 이름이다 (`contractTerms.ts`).
 *
 * ⚠ **여기서 문턱을 다시 재지 않는다.** 축 이름만 본다 — 판정은 엔진 몫이다.
 */
function isAwardRow(key: string): boolean {
  return key.split(":")[0] === "award";
}

// ── 경기 결과 (msg-league-results-w) ───────────────────────────

export interface GameLineInput {
  homeName: string;
  awayName: string;
  homeScore: number;
  awayScore: number;
  /** 내 팀이 낀 경기인가 — 행을 굵게 그린다 */
  mine?: boolean;
}

/**
 * 한 주치 경기 결과 → 표.
 *
 * ⚠ **점수 칸은 여기서 합친다.** 문안(`table.leagueResults._scoreNote`)이
 *   「생산부가 `{hs} : {as}` 로 합쳐 넘긴다」고 못박아 뒀다 — 화면이 두 값을
 *   문자열로 이으면 자릿수가 흔들려 표가 안 맞는다.
 */
export function gameResultsTableMeta(games: readonly GameLineInput[]): TableMetadata {
  return {
    type: "table",
    kind: "leagueResults",
    columns: [],
    rows: games.map((g) => {
      const row: Record<string, TableCell> & { myTeam?: boolean } = {
        home: g.homeName,
        score: `${g.homeScore} : ${g.awayScore}`,
        away: g.awayName,
      };
      if (g.mine) row.myTeam = true;
      return row;
    }),
  };
}

// ── 내 경기 기록 (msg-official-result-w · msg-friendly-result-w) ─

export interface MyGameLineInput {
  ip: number;
  h: number;
  er: number;
  k: number;
  bb: number;
  /** 연습경기는 투구수를 안 센다 — 없으면 그 줄을 안 만든다 */
  pitches?: number;
  /** 승·패·무 · 세이브 같은 결과 글자. 없으면 줄을 안 만든다 */
  dec?: string;
}

/**
 * 내 등판 한 경기 → 항목·값 표.
 *
 * ⚠ **투구수·결과는 있을 때만 줄을 만든다.** 연습경기는 투구수를 안 세고
 *   (`buildFriendlyResultMessage` 가 아예 안 받는다), 없는 값을 0 으로 적으면
 *   「0구를 던졌다」로 읽힌다.
 */
export function myGameTableMeta(kind: string, line: MyGameLineInput): TableMetadata {
  const rows: Record<string, TableCell>[] = [
    { item: "ip", value: ipLabel(line.ip) },
    { item: "h",  value: line.h },
    { item: "er", value: line.er },
    { item: "k",  value: line.k },
    { item: "bb", value: line.bb },
  ];
  if (line.pitches != null) rows.push({ item: "pitches", value: line.pitches });
  if (line.dec) rows.push({ item: "dec", value: line.dec });
  return { type: "table", kind, columns: [], rows };
}

// ── 트레이드 (msg-npc-trade-) ─────────────────────────────────

/**
 * 오간 두 쪽 → 표. 행이 구단 하나이고 그 팀이 **받은** 선수가 값이다.
 *
 * ⚠ 사유는 각주다. 문안의 `footnote`(「사유」)는 **이름표**인데 화면에는
 *   이름표와 값을 잇는 자리가 없다(`buildTableView` 가 `md.footnote` 를
 *   그대로 쓴다) — 값만 보낸다.
 */
export function tradeTableMeta(
  sides: readonly { teamName: string; playerNames: readonly string[] }[],
  reason: string,
): TableMetadata {
  return {
    type: "table",
    kind: "npcTrade",
    columns: [],
    rows: sides.map((s) => ({ teamId: s.teamName, players: s.playerNames.join(", ") })),
    ...(reason ? { footnote: reason } : {}),
  };
}

// ── 등록말소 · 웨이버 (msg-demote- · msg-waiver-) ──────────────

/**
 * 사람 목록 한 벌 → 표.
 *
 * ⚠ **이름을 담는다.** 열 키는 문안이 `npcId` 로 선언해 뒀지만 화면에
 *   조회하는 자리가 없다(머리말) — id 를 실으면 `NPC_1234` 가 뜬다.
 * @param note 행마다 붙는 비고 (등록말소의 재등록 불가 기간). 문안에서 온다
 */
export function playerListTableMeta(
  kind: string, names: readonly string[], note?: string,
): TableMetadata {
  return {
    type: "table",
    kind,
    columns: [],
    rows: names.map((n) => {
      const row: Record<string, TableCell> = { npcId: n };
      if (note) row.note = note;
      return row;
    }),
  };
}

/**
 * 등록말소 비고 — **문안에서 온다** (`table.demote.lockNote`).
 *
 * 🔴 「{weeks}주간 재등록 불가」를 코드가 또 적지 않는다. 본문 문장은 이미
 *   `market.ts` 안에 굳어 있는데(옛 코드), 표까지 두 벌째를 만들지는 않는다.
 *
 * ⚠ 못 읽으면 `undefined` 다 — 비고 칸을 통째로 안 그린다.
 */
export function lockNoteOf(
  labels: import("./dashboardCopy").DashboardLabels | null, weeks: number,
): string | undefined {
  const tmpl = tableLabelBlock(labels, "demote")?.lockNote;
  if (typeof tmpl !== "string" || tmpl === "") return undefined;
  return tmpl.split("{weeks}").join(String(weeks));
}
