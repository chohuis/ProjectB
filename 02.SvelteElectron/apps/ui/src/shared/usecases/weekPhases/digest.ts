import type { LeagueSeasonState, Standing } from "../../types/season";
import type { MessageItem } from "../../types/main";
import { calcMyRank, pctStr, type RegionNamer } from "./standingsNews";
import { regionRankings } from "../../utils/tournament";
import { HS_REGIONS } from "../../utils/leagueScheduler";

// ── 리그 표시명 ───────────────────────────────────────────────
export const LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_HIGHSCHOOL:  "고교 리그",
  LEAGUE_KBL:         "KBL",
  LEAGUE_ABL:         "ABL",
  LEAGUE_UNIVERSITY:  "대학 리그",
  LEAGUE_INDEPENDENT: "독립 리그",
};

/**
 * `[다른 무대]`에 실을 리그. **내 리그는 호출부가 아니라 조립기가 뺀다** —
 * 예전 월간 순위표는 `lid === myLeagueId`로 건너뛰기만 해서, 정작 내 리그
 * 순위표가 아무 데도 안 나왔다.
 */
export const OTHER_STAGE_LEAGUES = [
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
] as const;
const OTHER_STAGE_LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_KBL:         "KBL",
  LEAGUE_ABL:         "ABL",
  LEAGUE_JBL:         "JBL",
  LEAGUE_UNIVERSITY:  "대학",
  LEAGUE_INDEPENDENT: "독립",
};

// 순위·승률 기반 한 줄 코멘트
function teamComment(rank: number, total: number, winPct: number): string {
  if (rank === 1)     return winPct >= 0.65 ? "압도적 선두 — 드래프트 투자 여력 충분" : "선두 경쟁 중 — 전력 보강에 적극적";
  if (rank === total) return winPct <  0.35 ? "재건 모드 — 젊은 자원 선호"           : "최하위권 고전 — 마운드 보강 시급";
  if (winPct >= 0.55) return "상위권 경쟁 — 포스트시즌 진출 의지";
  if (winPct <= 0.40) return "하위권 — 내년 재건 준비 중";
  return "중위권 경쟁 중";
}

// ── 통합 다이제스트 (Phase 1) ─────────────────────────────────
//
// **커리어 전 구간에서 "야구계 소식"을 담는 하나뿐인 그릇이다.**
//
// 지금은 같은 성격의 소식이 네 갈래로 갈라져 있다 (실측 `measure:messagekinds`,
// 6시즌):
//
//   msg-neighbor    고교 매주        시즌당 50.3통   무작위 1권역 + 1리그 선두
//   msg-myrank      고교 월 1회      시즌당 10.0통   내 권역·전국 순위
//   msg-hs-digest   고교 2~3 분기    시즌당  2.0통   5리그 선두/최하위 + 스카우트
//   msg-standings   프로 4주마다     시즌당 28.0통   리그당 한 통, 전체 순위표
//
// 고교 시즌당 62.3통 · 프로 28.0통이 **월 1통(연 13통)** 으로 합쳐진다.
//
// ⚠ **제일 잘 만든 형식이 고교 2~3학년에만 있었다.** 프로가 되면 리그당 한 통씩
// 다시 쪼개진다 — 내가 속하지 않은 리그가 28팀 전체 표로 오고 정작 **내 리그는
// 안 온다**(`lid === myLeagueId`로 건너뛴다). 거꾸로 돼 있던 것을 바로잡는다.

/**
 * 다이제스트를 보내는 주 — **주기의 정본이다.**
 *
 * 예전엔 세 갈래가 각자 주기를 들고 있었다: 고교 매주(neighbor) ·
 * `MY_RANK_WEEKS` 10주(myrank) · `HS_DIGEST_WEEKS` 3주(hs-digest) ·
 * 비고교 `weekInYear % 4`(standings). 같은 성격의 소식이 네 박자로 왔다.
 *
 * 값은 `MY_RANK_WEEKS`(달이 바뀌는 주)를 잇고 시즌 후반 둘을 더했다 —
 * 프로 정규시즌은 W51까지 가는데 44에서 끊기면 마지막 두 달이 빈다.
 */
export const DIGEST_WEEKS = new Set([5, 9, 13, 18, 22, 26, 31, 35, 39, 44, 48]);

/** 섹션 노출을 가르는 구간. `careerStage`와 학년에서 파생한다 */
export type DigestTier = "hs1" | "hs23" | "amateur" | "pro";

/**
 * 어느 구간에서 어느 섹션을 켜는가 — **정본은 이 표 하나다.**
 *
 * 조건을 조립 코드 여기저기에 흩으면 "고교엔 나오는데 대학엔 안 나온다"가
 * 어디서 갈렸는지 추적이 안 된다. 이 프로젝트가 반복해 겪은 형태다.
 */
export const DIGEST_SECTIONS: Record<DigestTier, {
  /** [내 자리] 내 순위 — 고교는 권역+전국, 그 외는 리그 안 순위 */
  mine: boolean;
  /** [내 무대] 내가 뛰는 판의 순위표 */
  stage: boolean;
  /** [다른 무대] 타 리그 선두 한 줄씩 */
  others: boolean;
  /** [나를 보는 눈] 스카우트 관심 구단 */
  scout: boolean;
}> = {
  // 고교 1학년에게 프로 순위표는 잡음이다 — 진로가 아직 안 걸렸다.
  // (기존 `buildHsLeagueDigest`가 grade>=2로 걸러온 판단을 그대로 잇는다)
  hs1:     { mine: true, stage: true, others: false, scout: false },
  hs23:    { mine: true, stage: true, others: true,  scout: true  },
  amateur: { mine: true, stage: true, others: true,  scout: true  },
  // 프로에게 스카우트 관심 구단은 의미가 없다 — 이미 소속이 있다
  pro:     { mine: true, stage: true, others: true,  scout: false },
};

/** `careerStage`(+고교 학년)를 구간으로 접는다 */
export function digestTierOf(careerStage: string, hsGrade?: number): DigestTier {
  if (careerStage === "highschool") return (hsGrade ?? 1) >= 2 ? "hs23" : "hs1";
  if (careerStage === "university" || careerStage === "independent") return "amateur";
  return "pro";
}

export interface DigestInput {
  weekNum: number;
  /** "7월" 같은 표시용 라벨. 주기 판단은 호출부가 한다 */
  monthLabel: string;
  careerStage: string;
  hsGrade?: number;
  myTeamId: string;
  myLeagueId: string;
  leagueState: Record<string, LeagueSeasonState>;
  /** 고교 전국 순위 — 권역 계산에 쓴다. 비고교면 빈 배열이어도 된다 */
  hsStandings: Standing[];
  teamName: (id: string) => string;
  regionName?: RegionNamer;
  regions?: Record<string, string[]>;
  scoutScore: number;
  /**
   * 그 리그가 아직 시즌 중인가. 기본은 "전부 진행 중".
   *
   * ⚠ **없애면 겨울에도 순위표가 온다.** 기존 월간 순위표에 `lastGameWeek`를
   * 지난 리그는 건너뛰는 게이트가 있었다 — 그게 프로 `msg-standings`가 코드상
   * 연 52통일 것 같은데 실측 28통이던 이유다. 판단은 호출부가 한다(일정은
   * 시즌 상태에 있고, 이 모듈은 순수 함수로 남아야 회귀에서 쓸 수 있다).
   */
  isLeagueActive?: (leagueId: string) => boolean;
}

const sortStandings = (rows: Standing[]) =>
  [...rows].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);

/** 경기를 한 번이라도 치른 리그인가 — 시즌 초엔 전부 0-0이라 소식이 안 된다 */
const hasPlayed = (rows: Standing[]) =>
  rows.some((s) => s.wins + s.losses + s.draws > 0);

const recordOf = (s: Standing | undefined) =>
  s ? `${s.wins}승 ${s.losses}패${s.draws ? ` ${s.draws}무` : ""} ${pctStr(s.winPct)}` : "-";

/**
 * 월 1회 야구계 소식. 담을 게 하나도 없으면 `null`을 낸다 —
 * 빈 껍데기를 보내면 "소식이 왔는데 아무것도 없다"가 된다.
 */
export function buildLeagueDigest(input: DigestInput): MessageItem | null {
  const tier = digestTierOf(input.careerStage, input.hsGrade);
  const on = DIGEST_SECTIONS[tier];
  const isHs = input.careerStage === "highschool";
  const regions = input.regions ?? HS_REGIONS;
  const regionName = input.regionName ?? ((id: string) => id.replace(/^STADIUM_/, ""));
  const sections: string[] = [];
  let headline = "";

  // ── [내 자리] ──────────────────────────────────────────────
  if (on.mine) {
    if (isHs && input.hsStandings.length > 0) {
      const r = calcMyRank(input.hsStandings, input.myTeamId, regions);
      const mine = input.hsStandings.find((s) => s.teamId === input.myTeamId);
      if (r) {
        const topPct = Math.round((r.nationalRank / r.nationalTotal) * 100);
        headline = `${regionName(r.regionId)} ${r.regionRank}위 · 전국 ${r.nationalRank}위`;
        sections.push(
          `[내 자리]\n` +
          `  ${input.teamName(input.myTeamId)}\n` +
          `  ${regionName(r.regionId)}   ${r.regionRank}위 / ${r.regionTotal}팀\n` +
          `  전국          ${r.nationalRank}위 / ${r.nationalTotal}팀  (상위 ${topPct}%)\n` +
          `  성적          ${recordOf(mine)}`,
        );
      }
    } else {
      const rows = sortStandings(input.leagueState[input.myLeagueId]?.standings ?? []);
      const idx = rows.findIndex((s) => s.teamId === input.myTeamId);
      if (idx >= 0) {
        headline = `${LEAGUE_NAMES[input.myLeagueId] ?? input.myLeagueId} ${idx + 1}위`;
        sections.push(
          `[내 자리]\n` +
          `  ${input.teamName(input.myTeamId)}\n` +
          `  ${LEAGUE_NAMES[input.myLeagueId] ?? input.myLeagueId}   ${idx + 1}위 / ${rows.length}팀\n` +
          `  성적          ${recordOf(rows[idx])}`,
        );
      }
    }
  }

  // ── [내 무대] ──────────────────────────────────────────────
  //
  // ⚠ 고교는 **권역 순위표**를 낸다. 102팀 전국 표를 통째로 넣으면 본문이
  // 100줄이 되고, 그건 읽히지 않는다.
  if (on.stage) {
    if (isHs) {
      const regs = regionRankings(input.hsStandings, regions);
      const mine = regs.find((r) => r.rankedTeams.includes(input.myTeamId));
      if (mine && hasPlayed(input.hsStandings)) {
        const byTeam = new Map(input.hsStandings.map((s) => [s.teamId, s]));
        const lines = mine.rankedTeams.map((tid, i) => {
          const mark = tid === input.myTeamId ? "  ← 우리" : "";
          return `  ${i + 1}위  ${input.teamName(tid)}  ${recordOf(byTeam.get(tid))}${mark}`;
        });
        sections.push(`[내 무대] ${regionName(mine.regionId)}\n${lines.join("\n")}`);
      }
    } else {
      const rows = sortStandings(input.leagueState[input.myLeagueId]?.standings ?? []);
      if (rows.length > 0 && hasPlayed(rows)) {
        const lines = rows.map((s, i) => {
          const mark = s.teamId === input.myTeamId ? "  ← 우리" : "";
          return `  ${i + 1}위  ${input.teamName(s.teamId)}  ${recordOf(s)}  ${s.streak}${mark}`;
        });
        sections.push(
          `[내 무대] ${LEAGUE_NAMES[input.myLeagueId] ?? input.myLeagueId}\n${lines.join("\n")}`,
        );
      }
    }
  }

  // ── [다른 무대] ────────────────────────────────────────────
  // 리그마다 한 줄. 예전엔 리그당 **한 통씩** 전체 표가 왔다
  if (on.others) {
    const lines: string[] = [];
    for (const lid of OTHER_STAGE_LEAGUES) {
      if (lid === input.myLeagueId) continue;
      if (input.isLeagueActive && !input.isLeagueActive(lid)) continue;
      const rows = sortStandings(input.leagueState[lid]?.standings ?? []);
      if (rows.length === 0 || !hasPlayed(rows)) continue;
      const top = rows[0];
      lines.push(
        `  ${(OTHER_STAGE_LEAGUE_NAMES[lid] ?? lid).padEnd(4)}  ` +
        `${input.teamName(top.teamId)} 선두 (${pctStr(top.winPct)})`,
      );
    }
    if (lines.length > 0) sections.push(`[다른 무대]\n${lines.join("\n")}`);
  }

  // ── [나를 보는 눈] ─────────────────────────────────────────
  if (on.scout) {
    const kbl = sortStandings(input.leagueState["LEAGUE_KBL"]?.standings ?? []);
    if (hasPlayed(kbl)) {
      const count = input.scoutScore >= 80 ? 4 : input.scoutScore >= 60 ? 3 : input.scoutScore >= 40 ? 2 : 1;
      const lines = kbl.slice(0, count).map((s, i) =>
        `  ${input.teamName(s.teamId)}   "${teamComment(i + 1, kbl.length, s.winPct)}"`);
      if (lines.length > 0) {
        sections.push(`[나를 보는 눈]\n${lines.join("\n")}\n  ※ 스카우트 평가 ${input.scoutScore}`);
      }
    }
  }

  if (sections.length === 0) return null;

  return {
    // ⚠ **id에 표시용 라벨(월 이름)을 넣지 않는다.** `msg-digest-3월-w13`으로
    // 두었더니 종류 키가 달마다 쪼개져(`messageKindOf`가 한글 라벨은 못 벗긴다)
    // 계측에서 한 종류가 11갈래로 흩어졌고, 각각이 상위 목록 밖으로 밀려
    // **"다이제스트가 0건"으로 보였다.** 월은 제목과 본문에 있으면 된다.
    id:        `msg-digest-w${input.weekNum}`,
    category:  "system",
    sender:    "리그 사무국",
    subject:   `야구계 소식 — ${input.monthLabel}`,
    // ⚠ 미리보기는 **내 위치**여야 한다. 예전 다이제스트는 `parts[0]`이라
    // 남의 리그가 먼저 떴다 — 목록에서 열어볼 이유가 안 보였다
    preview:   headline || sections[0].split("\n")[0],
    body:      `[야구계 소식 — ${input.monthLabel}]\n\n${sections.join("\n\n")}\n\n→ 세부 순위는 [기록] 탭`,
    createdAt: `W${input.weekNum}`,
    readAt:    null,
  };
}
