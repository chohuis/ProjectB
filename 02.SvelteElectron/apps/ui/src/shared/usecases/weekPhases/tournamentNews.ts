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

import type { TournamentBracket, TournamentDef } from "../../utils/tournament";
import type { MessageItem } from "../../types/main";

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

/** 개막 — 참가 규모와 **내 팀이 나가는지**가 핵심이다 */
export function buildOpenMessage(
  def: TournamentDef,
  entrantIds: string[],
  myTeamId: string,
  weekNum: number,
  seasonYear: number,
): MessageItem {
  const joined = entrantIds.includes(myTeamId);
  return {
    id: `msg-tour-open-${def.id}-${seasonYear}`,
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
    id: `msg-tour-my-${def.id}-r${round}-${bracket.seasonYear}`,
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
        ? (isFinal
            ? `${def.flower}를 들어올렸다.`
            : `${roundName(round + 1, bracket.totalRounds)}에 오른다.`)
        : "여기서 대회를 마친다.",
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
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

  return {
    id: `msg-tour-round-${def.id}-r${round}-${bracket.seasonYear}`,
    category: "news",
    sender: def.leagueId === "LEAGUE_UNIVERSITY" ? "대학야구연맹" : "고교야구연맹",
    subject: `${def.name} ${nextName} 진출 ${winners.length}팀`,
    preview: known.length > 0
      ? `우리 권역 ${known.map(teamName).join(", ")} 진출`
      : `${teamName(winners[0])} 외 ${Math.max(0, winners.length - 1)}팀`,
    body: lines.join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
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
    id: `msg-tour-champ-${def.id}-${bracket.seasonYear}`,
    category: "news",
    sender: def.leagueId === "LEAGUE_UNIVERSITY" ? "대학야구연맹" : "고교야구연맹",
    subject: `${def.name} 우승 — ${teamName(champ)}`,
    preview: runnerUp ? `준우승 ${teamName(runnerUp)}` : "",
    body: [
      `${bracket.seasonYear} ${def.name}(${def.flower})이 막을 내렸습니다.`,
      "",
      `🏆 우승    ${teamName(champ)}`,
      ...(runnerUp ? [`   준우승  ${teamName(runnerUp)}`] : []),
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
  };
}
