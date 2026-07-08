import type { LeagueSeasonState } from "../../types/season";

// ── 리그 표시명 ───────────────────────────────────────────────
export const LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_HIGHSCHOOL:  "고교 리그",
  LEAGUE_KBL:         "KBL",
  LEAGUE_ABL:         "ABL",
  LEAGUE_UNIVERSITY:  "대학 리그",
  LEAGUE_INDEPENDENT: "독립 리그",
};

// 월간 순위표를 보낼 리그 목록 (주인공 소속 리그는 별도 처리)
export const MONTHLY_STANDINGS_LEAGUES = new Set([
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY",
  "LEAGUE_INDEPENDENT",
]);

// ── 고교 분기 Digest 상수 ─────────────────────────────────────
export const HS_DIGEST_LEAGUES = [
  "LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_UNIVERSITY", "LEAGUE_INDEPENDENT",
] as const;
export const HS_DIGEST_WEEKS = new Set([12, 24, 36]);
const HS_DIGEST_LEAGUE_NAMES: Record<string, string> = {
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

// 고교 2~3학년 분기 Digest 메시지 생성
export function buildHsLeagueDigest(
  weekNum: number,
  weekInYear: number,
  hsGrade: number,
  leagueState: Record<string, LeagueSeasonState>,
  teamById: Map<string, string>,
  scoutScore: number,
): import("../../types/main").MessageItem | null {
  const quarterLabel = weekInYear <= 12 ? "3~5월" : weekInYear <= 24 ? "6~8월" : "9~11월";
  const withComment  = hsGrade >= 3;
  const pctStr = (v: number) => `.${String(Math.round(v * 1000)).padStart(3, "0")}`;
  const parts: string[] = [];

  for (const lid of HS_DIGEST_LEAGUES) {
    const ls = leagueState[lid];
    if (!ls || ls.standings.length === 0) continue;
    const sorted = [...ls.standings].sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
    if (!sorted.some((s) => s.wins + s.losses > 0)) continue;

    const lName    = HS_DIGEST_LEAGUE_NAMES[lid] ?? lid;
    const top      = sorted[0];
    const last     = sorted[sorted.length - 1];
    const total    = sorted.length;
    const topName  = teamById.get(top.teamId)  ?? top.teamId;
    const lastName = teamById.get(last.teamId) ?? last.teamId;

    if (withComment) {
      parts.push(
        `■ ${lName}\n` +
        `  ${topName}  1위 (${pctStr(top.winPct)})  "${teamComment(1, total, top.winPct)}"\n` +
        `  ${lastName}  ${total}위 (${pctStr(last.winPct)})  "${teamComment(total, total, last.winPct)}"`,
      );
    } else {
      parts.push(`■ ${lName}    ${topName} 선두 / ${lastName} 최하위`);
    }
  }

  if (parts.length === 0) return null;

  // 스카우트 관심 구단 — KBL 상위팀, scoutScore 기반 노출 수
  const kblSorted = [...(leagueState["LEAGUE_KBL"]?.standings ?? [])]
    .sort((a, b) => b.winPct - a.winPct || b.wins - a.wins);
  const hasKblData   = kblSorted.some((s) => s.wins + s.losses > 0);
  const scoutCount   = scoutScore >= 80 ? 4 : scoutScore >= 60 ? 3 : scoutScore >= 40 ? 2 : 1;
  const scoutTeams   = hasKblData ? kblSorted.slice(0, scoutCount) : [];

  let scoutSection = "";
  if (scoutTeams.length > 0) {
    const scoutLines = scoutTeams.map((st) => {
      const name    = teamById.get(st.teamId) ?? st.teamId;
      const rank    = kblSorted.findIndex((s) => s.teamId === st.teamId) + 1;
      const comment = withComment ? `  "${teamComment(rank, kblSorted.length, st.winPct)}"` : "";
      return `  ${name}${comment}`;
    });
    scoutSection = `\n\n▶ 스카우트 관심 구단\n${scoutLines.join("\n")}`;
  }

  const standingsHint = withComment
    ? "\n\n→ 세부 순위는 [기록] 탭에서 확인"
    : "\n\n→ 세부 순위는 [기록] 탭에서 확인 (3학년 진급 후 열람 가능)";

  const body = `[야구계 소식 — ${quarterLabel}]\n\n${parts.join("\n\n")}${scoutSection}${standingsHint}`;

  return {
    id:        `msg-hs-digest-w${weekNum}-${Date.now()}`,
    category:  "system",
    sender:    "리그 사무국",
    subject:   `야구계 소식 — ${quarterLabel}`,
    preview:   parts[0]?.split("\n")[0] ?? "",
    body,
    createdAt: `W${weekNum}`,
    readAt:    null,
  };
}
