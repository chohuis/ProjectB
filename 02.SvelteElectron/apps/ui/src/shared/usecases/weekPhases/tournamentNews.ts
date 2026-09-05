// ── 대회 소식 ────────────────────────────────────────────────────
//
// 고교 5개(개나리기·장미기·무궁화기·국화기·패왕기)와 대학 3개(왕중왕전·
// 은하기·여명기) 대회가 **데이터로는 돌지만 화면에도 메시지에도 없었다.**
// `finishedTournaments()`는 호출부가 0이었고, 우승해도 아무 말이 없었다.
//
// 고교 시즌의 서사는 권역 리그가 아니라 대회다 — 진출·탈락·우승이 안 보이면
// 그 시즌에 무슨 일이 있었는지 알 수가 없다.
//
// ⚠ 새 시뮬을 돌리지 않는다. 이미 확정된 브래킷과 일정 결과만 읽는다.
//
// 🔴 **id 에 주차를 넣는다** (2026-09-06). 여기 네 소식은 `advanceWeek` 의
//   대회 라운드 루프 **한 자리에서 같이 난다** — 그 라운드가 두 번 확정되면
//   넷 다 같은 id 를 두 번 낸다. 실제로 났다: 넉아웃이 무승부로 끝나 승자가
//   안 찍히는 바람에 장미기 1라운드가 주마다 다시 확정됐고,
//   `msg-tour-my-TOUR_HS_JANGMI-r1-2028` 이 소식함에 둘 들어가
//   **Svelte 가 키 중복으로 던져 화면이 통째로 굳었다**(실사용자 신고).
//
//   무승부 쪽은 고쳤다(`knockoutMatchIds`). 주차는 **그 다음 방어**다 —
//   또 두 번 확정되는 일이 생기면 소식이 조용히 버려지는 대신 **두 통이
//   남아 눈에 띈다.** 같은 주 안에서는 한 라운드가 한 번만 확정되므로
//   (`live.every(winnerTeamId)` 가 그 주에 이미 참이 된다) 주차만으로 충분하다.
//   버려진 통수는 `mailboxDupStats` 가 세고 `check:msgdupid` 가 본다.

import type { BracketMatch, TournamentBracket, TournamentDef } from "../../utils/tournament";
import type { MessageItem } from "../../types/main";
import {
  bracketTableMeta, rankListMeta, rowsTableMeta, type BracketRowInput,
} from "../../utils/dashboardMeta";

/** 라운드 번호 → 이름. 마지막 라운드가 결승이므로 뒤에서부터 센다 */
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return "결승";
  if (fromEnd === 1) return "4강";
  if (fromEnd === 2) return "8강";
  if (fromEnd === 3) return "16강";
  if (fromEnd === 4) return "32강";
  return `${round}라운드`;
}

/**
 * 대진 한 라운드를 표 행으로 (§9 ③ · A 단위 5 묶음 3).
 *
 * ⚠ **부전승과 미정 짝은 뺀다.** 상대가 없는 짝은 한 칸이 비고, 빈 칸은
 *   화면에서 `—` 가 되어 「상대를 모른다」로 읽힌다.
 *
 * ⚠ **일정은 `W{주차}`다.** 소식의 `createdAt` 과 같은 꼴이라 새 표기를
 *   만들지 않는다 — `gameDate` 를 그대로 실으면 `2026-05-16` 이 뜬다.
 *
 * ⚠ **여기서 자르지 않는다.** 102팀 대회 1라운드는 51짝이라 표가 길지만,
 *   조용히 잘라내면 **내 팀 경기가 사라질 수 있다**(슬롯 순이라 뒤에 온다).
 */
function bracketRows(
  matches: readonly BracketMatch[],
  round: number,
  totalRounds: number,
  myTeamId: string,
  teamName: (id: string) => string,
): BracketRowInput[] {
  return matches
    .filter((m) => m.round === round && !m.isBye && m.homeTeamId && m.awayTeamId)
    .slice()
    .sort((a, b) => a.slot - b.slot)
    .map((m) => ({
      round: roundName(round, totalRounds),
      homeName: teamName(m.homeTeamId ?? ""),
      awayName: teamName(m.awayTeamId ?? ""),
      date: `W${m.week}`,
      mine: m.homeTeamId === myTeamId || m.awayTeamId === myTeamId,
    }));
}

/**
 * 개막 — 참가 규모와 **내 팀이 나가는지**가 핵심이다.
 *
 * ⚠ **대진은 넉아웃 대회만 있다.** 은하기·여명기는 조 추첨이라 개막 시점에
 *   브래킷이 없다(`openTournamentsForWeek` 가 `stage` 만 준다) — 그때는
 *   `metadata` 를 안 싣고 본문이 그대로 뜬다.
 */
export function buildOpenMessage(
  def: TournamentDef,
  entrantIds: string[],
  myTeamId: string,
  weekNum: number,
  seasonYear: number,
  /** 넉아웃이면 1라운드 대진을 표로 얹는다 (§1-1 `msg-tour-open-`) */
  bracket?: TournamentBracket | null,
  teamName: (id: string) => string = (id) => id,
): MessageItem {
  const joined = entrantIds.includes(myTeamId);
  const rows = bracket
    ? bracketRows(bracket.matches, 1, bracket.totalRounds, myTeamId, teamName)
    : [];
  return {
    id: `msg-tour-open-${def.id}-${seasonYear}-w${weekNum}`,
    category: "news",
    sender: def.leagueId === "LEAGUE_UNIVERSITY" ? "대학야구연맹" : "고교야구연맹",
    subject: `${seasonYear} ${def.name} 개막 — ${entrantIds.length}팀 참가`,
    preview: joined ? "우리 팀도 출전한다." : "우리 팀은 출전하지 못했다.",
    body: [
      `${def.name}(${def.flower}) 대회가 시작됩니다.`,
      "",
      `■ 참가   ${entrantIds.length}팀`,
      `■ 기간   W${def.startWeek} ~ W${def.endWeek}`,
      "",
      joined
        ? "우리 팀이 출전 명단에 들었다."
        : "우리 팀은 이번 대회 출전권을 얻지 못했다.",
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    // 값이 없으면 안 싣는다 — 조별예선 대회는 개막에 대진이 없다(머리말)
    ...(rows.length > 0 ? { metadata: bracketTableMeta("tourOpen", rows) } : {}),
  };
}

/**
 * 내 팀의 이번 라운드 결과 — **이겼으면 다음 라운드, 지면 탈락.**
 *
 * 내 팀이 그 라운드에 없으면 `null`이다 (이미 탈락했거나 애초에 미출전).
 */
export function buildMyRoundMessage(
  def: TournamentDef,
  bracket: TournamentBracket,
  round: number,
  myTeamId: string,
  teamName: (id: string) => string,
  weekNum: number,
): MessageItem | null {
  const mine = bracket.matches.find(
    (m) => m.round === round && !m.isBye
      && (m.homeTeamId === myTeamId || m.awayTeamId === myTeamId),
  );
  if (!mine || !mine.winnerTeamId) return null;

  const oppId = mine.homeTeamId === myTeamId ? mine.awayTeamId : mine.homeTeamId;
  const won = mine.winnerTeamId === myTeamId;
  const rn = roundName(round, bracket.totalRounds);
  const isFinal = round === bracket.totalRounds;

  const head = won
    ? (isFinal ? `${def.name} 우승` : `${rn} 통과`)
    : `${rn} 탈락`;

  return {
    id: `msg-tour-my-${def.id}-r${round}-${bracket.seasonYear}-w${weekNum}`,
    category: "news",
    sender: "대회 본부",
    subject: `${def.name} ${head}`,
    preview: `${teamName(oppId ?? "")}전 ${won ? "승리" : "패배"}`,
    body: [
      `${def.name} ${rn}`,
      "",
      `상대   ${teamName(oppId ?? "-")}`,
      `결과   ${won ? "승리" : "패배"}`,
      "",
      won
        // 🔴 **조사를 붙이지 않는다** (B-28 — 꽃 이름 일곱 중 둘이 받침이라
        //    「를」이 틀렸다: 왕중왕·여명). 자리표시자를 문장 끝에 둔다
        ? (isFinal
            ? `${def.flower}. 우승입니다.`
            : `${roundName(round + 1, bracket.totalRounds)}에 오른다.`)
        : "여기서 대회를 마친다.",
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    // ⚠ **점수 열은 안 채운다.** 브래킷에는 승자 id 만 있고 점수가 없다
    //   (`BracketMatch` — `winnerTeamId` 뿐) — 값이 없는 열은 안 그려진다.
    // ⚠ 「승리」·「패배」는 **바로 위 본문과 같은 글자다.** 문안에 이 두 낱말이
    //   없어서(`common` 은 「승」·「패」뿐) 값을 여기서 낸다 — 한 함수 안의
    //   같은 표현이라 두 벌로 갈라질 자리가 아니다.
    metadata: rowsTableMeta("tourMy", [
      { round: rn, opp: teamName(oppId ?? ""), result: won ? "승리" : "패배" },
    ]),
  };
}

/**
 * 라운드가 끝날 때마다 **진출 팀 명단**을 알린다 — 내 팀이 없어도 온다.
 *
 * ⚠ 예전엔 내 팀 경기(`buildMyRoundMessage`)와 우승만 왔다. 우리가 안 나간
 * 대회는 개막·우승 두 통뿐이라 **누가 올라갔는지 알 수 없었고**, 우리가 나간
 * 대회도 탈락한 뒤로는 깜깜했다.
 *
 * ⚠ **32강부터 보낸다**(사용자 확정 2026-08-08). 그 앞은 팀이 너무 많아
 * 명단이 소식이 안 된다 — 102팀 대회면 1회전만 51경기다.
 *
 * ⚠ **내 팀이 그 라운드에 있으면 `null`이다.** `buildMyRoundMessage`가 이미
 * 그 경기를 자세히 알린다 — 둘 다 보내면 같은 라운드가 두 통이 된다.
 *
 * `myRegionTeams`를 주면 아는 팀을 짚어준다. 없으면 명단만 낸다 —
 * 남의 대회 8강 명단은 그것만으로는 읽을 이유가 없다.
 */
export function buildRoundProgressMessage(
  def: TournamentDef,
  bracket: TournamentBracket,
  round: number,
  myTeamId: string,
  teamName: (id: string) => string,
  weekNum: number,
  myRegionTeams?: Set<string>,
): MessageItem | null {
  const fromEnd = bracket.totalRounds - round;
  if (fromEnd > 4) return null;              // 32강(fromEnd 4)보다 앞은 안 보낸다
  if (round === bracket.totalRounds) return null;  // 결승은 우승 소식이 맡는다

  const played = bracket.matches.filter((m) => m.round === round && !m.isBye);
  if (played.length === 0 || played.some((m) => !m.winnerTeamId)) return null;

  // 내 팀 경기가 이 라운드에 있으면 `buildMyRoundMessage`가 알린다
  if (played.some((m) => m.homeTeamId === myTeamId || m.awayTeamId === myTeamId)) return null;

  const winners = played.map((m) => m.winnerTeamId!).filter(Boolean);
  if (winners.length === 0) return null;

  const nextName = roundName(round + 1, bracket.totalRounds);
  const known = myRegionTeams
    ? winners.filter((id) => myRegionTeams.has(id))
    : [];
  const fallen = myRegionTeams
    ? played
        .filter((m) => {
          const loser = m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId;
          return loser ? myRegionTeams.has(loser) : false;
        })
        .map((m) => (m.winnerTeamId === m.homeTeamId ? m.awayTeamId : m.homeTeamId))
        .filter((x): x is string => !!x)
    : [];

  const lines = [
    `${def.name} ${roundName(round, bracket.totalRounds)} 종료`,
    "",
    `■ ${nextName} 진출 ${winners.length}팀`,
    ...winners.map((id) => `   ${teamName(id)}${known.includes(id) ? "   ← 우리 권역" : ""}`),
  ];
  if (fallen.length > 0) {
    lines.push("", `■ 우리 권역 탈락   ${fallen.map(teamName).join(", ")}`);
  }

  // 다음 라운드 대진 — **이 소식이 알리는 것이 「누가 올라갔나」다.** 짝이
  // 정해진 뒤라(`applyRoundResults` 가 부른 뒤에 온다) 진출 팀 전부가 표에 든다.
  //
  // ⚠ 본문의 「우리 권역」 표시는 표에 안 담긴다 — 권역 열이 문안에 없다
  //   (`table.tourRound.columns` 는 라운드·두 팀·일정 넷).
  const nextRows = bracketRows(
    bracket.matches, round + 1, bracket.totalRounds, myTeamId, teamName,
  );

  return {
    id: `msg-tour-round-${def.id}-r${round}-${bracket.seasonYear}-w${weekNum}`,
    category: "news",
    sender: def.leagueId === "LEAGUE_UNIVERSITY" ? "대학야구연맹" : "고교야구연맹",
    subject: `${def.name} ${nextName} 진출 ${winners.length}팀`,
    preview: known.length > 0
      ? `우리 권역 ${known.map(teamName).join(", ")} 진출`
      : `${teamName(winners[0])} 외 ${Math.max(0, winners.length - 1)}팀`,
    body: lines.join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    ...(nextRows.length > 0 ? { metadata: bracketTableMeta("tourRound", nextRows) } : {}),
  };
}

/** 우승 확정 — 내 팀이 아니어도 리그 소식으로 통지한다 */
export function buildChampionMessage(
  def: TournamentDef,
  bracket: TournamentBracket,
  myTeamId: string,
  teamName: (id: string) => string,
  weekNum: number,
): MessageItem | null {
  const final = bracket.matches.find((m) => m.round === bracket.totalRounds);
  if (!final?.winnerTeamId) return null;

  const champ = final.winnerTeamId;
  const runnerUp = final.homeTeamId === champ ? final.awayTeamId : final.homeTeamId;
  // 내 팀이 우승했으면 위의 `buildMyRoundMessage`가 이미 알렸다 — 두 번 안 보낸다
  if (champ === myTeamId) return null;

  return {
    id: `msg-tour-champ-${def.id}-${bracket.seasonYear}-w${weekNum}`,
    category: "news",
    sender: def.leagueId === "LEAGUE_UNIVERSITY" ? "대학야구연맹" : "고교야구연맹",
    subject: `${def.name} 우승 — ${teamName(champ)}`,
    preview: runnerUp ? `준우승 ${teamName(runnerUp)}` : "",
    body: [
      // 🔴 **조사를 붙이지 않는다** (B-28 · 눈확인에서 잡았다 — 「장미기(장미)이
      //    막을 내렸습니다」). 대회 이름 뒤에 받침이 오는지는 데이터가 정한다.
      //    자리표시자를 문장 끝에 두고 앞 조각은 체언 종지로 끊는다.
      // ⚠ 꽃 이름 괄호도 뺐다 — 「장미기(장미)」 는 같은 말을 두 번 한다.
      `${bracket.seasonYear} ${def.name}. 대회가 끝났습니다.`,
      "",
      `🏆 우승    ${teamName(champ)}`,
      ...(runnerUp ? [`   준우승  ${teamName(runnerUp)}`] : []),
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    // 최종 순위 둘 — 「우승」·「준우승」 이라는 말은 순위 1·2 가 이미 뜻한다
    // (문안 `rankList.tourChamp.first`·`second` 가 그 이름을 갖는다)
    metadata: rankListMeta("tourChamp", [
      { label: teamName(champ) },
      ...(runnerUp ? [{ label: teamName(runnerUp) }] : []),
    ]),
  };
}
