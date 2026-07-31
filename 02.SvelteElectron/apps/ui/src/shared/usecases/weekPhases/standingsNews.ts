// ── 내 위치 뉴스 (설계 원장 D-3 #3·#4) ──────────────────────────
//
// `docs/design/_ledger.md` D-3이 "[흡수 — 신규]"로 판정한 뉴스 4종 중 둘이
// **02.SvelteElectron에 들어오지 않았다.** 그 구현은 폐기된 `03.OnePitch`(Rust)에만
// 있었고 2026-07-29에 코드째 삭제됐다 — 판정만 남고 실체가 없던 자리다.
//
//   #3 내 팀 순위 정기 요약 — 월 1회 "권역 N위 · 전국 M위" 스냅샷
//   #4 인접권역·먼 리그 다이제스트 — 주간, 다른 권역 하나 + 다른 리그 하나
//
// 원장의 근거를 그대로 옮기면: **102교 세계에서 내 위치를 감잡게 하는 장치다.**
// 리그 규모가 커진 만큼 필수인데, 지금은 자기 권역 순위만 보이고 전국에서
// 몇 등인지 알 길이 없다. 고교 1학년은 분기 다이제스트 대상도 아니라
// 첫 시즌 리그 소식이 스카우트 데이 하나뿐이었다.
//
// ⚠ 새 시뮬을 돌리지 않는다. 이미 있는 `standings`·`HS_REGIONS`만 다시 읽는다.

import { regionRankings } from "../../utils/tournament";
import { HS_REGIONS } from "../../utils/leagueScheduler";
import type { LeagueSeasonState, Standing } from "../../types/season";
import type { MessageItem } from "../../types/main";

/**
 * 권역 표시명.
 *
 * ⚠ **손으로 표를 만들지 않는다.** 처음엔 구장ID→지역명 맵을 적었는데
 * 8개 중 하나를 빠뜨려 화면에 `YEONGSAN권역`이 그대로 찍혔다. 권역 키는
 * 구장 ID이고 이름은 `refs.json`의 `stadiums`에 있으니 거기서 읽는다.
 *
 * 호출부가 조회 함수를 넘긴다 — 이 모듈이 masterStore를 직접 보면
 * 순수 함수가 아니게 되고 회귀에서 못 쓴다.
 */
export type RegionNamer = (stadiumId: string) => string;

const fallbackName: RegionNamer = (id) => id.replace(/^STADIUM_/, "");

/**
 * 승률 표기 — `.526` 형식. **1.000은 앞자리를 살린다.**
 * (`.1000`으로 찍혀서 열 자리가 밀리는 걸 실측에서 봤다)
 */
const pctStr = (v: number) =>
  v >= 1 ? "1.000" : `.${String(Math.round(v * 1000)).padStart(3, "0")}`;

// ── #3. 내 팀 순위 정기 요약 ─────────────────────────────────────

/** 월 1회 보낸다 — 4주마다가 아니라 "달이 바뀌는 주"에 맞춘다 */
export const MY_RANK_WEEKS = new Set([5, 9, 13, 18, 22, 26, 31, 35, 39, 44]);

export interface MyRankResult {
  regionId: string;
  regionRank: number;
  regionTotal: number;
  nationalRank: number;
  nationalTotal: number;
}

/**
 * 내 팀이 권역에서 몇 위, 전국에서 몇 위인가.
 *
 * 전국 순위는 **권역과 무관하게 승률로 줄 세운 것**이다. 권역마다 팀 수가
 * 달라(제주 2팀 ~ 충청 12팀) 권역 순위만으로는 전국 위치를 알 수 없다.
 */
export function calcMyRank(
  standings: Standing[],
  myTeamId: string,
  regions: Record<string, string[]> = HS_REGIONS,
): MyRankResult | null {
  if (!myTeamId || standings.length === 0) return null;

  const regs = regionRankings(standings, regions);
  const mine = regs.find((r) => r.rankedTeams.includes(myTeamId));
  if (!mine) return null;

  // 전국 순위 — 정렬 기준을 권역 순위와 같게 둔다. 다르면 "권역 1위인데
  // 전국 30위" 같은 설명 불가능한 조합이 나온다
  const national = [...standings].sort(
    (a, b) => b.winPct - a.winPct
      || b.runsFor - a.runsFor
      || a.runsAgainst - b.runsAgainst
      || a.teamId.localeCompare(b.teamId),
  );
  const nIdx = national.findIndex((s) => s.teamId === myTeamId);
  if (nIdx < 0) return null;

  return {
    regionId: mine.regionId,
    regionRank: mine.rankedTeams.indexOf(myTeamId) + 1,
    regionTotal: mine.rankedTeams.length,
    nationalRank: nIdx + 1,
    nationalTotal: national.length,
  };
}

export function buildMyRankMessage(
  r: MyRankResult, weekNum: number, seasonYear: number,
  myStanding: Standing | undefined, regionName: RegionNamer = fallbackName,
): MessageItem {
  const region = regionName(r.regionId);
  const rec = myStanding
    ? `${myStanding.wins}승 ${myStanding.losses}패${myStanding.draws ? ` ${myStanding.draws}무` : ""} (${pctStr(myStanding.winPct)})`
    : "-";
  // 전국 상위 몇 %인지 — 102팀에서 "37위"만으로는 감이 안 온다
  const topPct = Math.round((r.nationalRank / r.nationalTotal) * 100);

  return {
    id: `msg-myrank-${seasonYear}-w${weekNum}`,
    category: "news",
    sender: "고교야구연맹",
    subject: `우리 팀 ${region} ${r.regionRank}위 · 전국 ${r.nationalRank}위`,
    preview: `${rec} · 전국 상위 ${topPct}%`,
    body: [
      `${seasonYear} 시즌 중간 집계입니다.`,
      "",
      `■ ${region}   ${r.regionRank}위 / ${r.regionTotal}팀`,
      `■ 전국          ${r.nationalRank}위 / ${r.nationalTotal}팀  (상위 ${topPct}%)`,
      `■ 성적          ${rec}`,
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
  };
}

// ── #4. 인접권역 · 먼 리그 다이제스트 ────────────────────────────

const OTHER_LEAGUE_NAMES: Record<string, string> = {
  LEAGUE_KBL:         "KBL",
  LEAGUE_KBL_FARM:    "KBL 2군",
  LEAGUE_UNIVERSITY:  "대학",
  LEAGUE_INDEPENDENT: "독립",
};

/**
 * 다른 권역 하나 + 다른 리그 하나를 뽑아 헤드라인만 담는다.
 *
 * @param rand01 Rust가 뽑아 넘긴 난수 (TS 게임 로직에서 `Math.random()` 금지)
 *
 * 매주 다른 권역이 걸리게 무작위로 고른다 — 고정 순회로 하면 8주 주기가
 * 눈에 보여서 "읽을 필요 없는 소식"이 된다.
 */
export function buildNeighborDigest(opts: {
  weekNum: number;
  seasonYear: number;
  hsStandings: Standing[];
  myTeamId: string;
  leagueState: Record<string, LeagueSeasonState>;
  teamName: (id: string) => string;
  regionName?: RegionNamer;
  rand01: [number, number];
  regions?: Record<string, string[]>;
}): MessageItem | null {
  const regionName = opts.regionName ?? fallbackName;
  const regions = opts.regions ?? HS_REGIONS;
  const regs = regionRankings(opts.hsStandings, regions);
  const myRegion = regs.find((r) => r.rankedTeams.includes(opts.myTeamId))?.regionId;

  // 경기가 실제로 진행된 권역만 — 시즌 초에는 전부 0-0이라 소식이 안 된다
  const played = new Set(
    opts.hsStandings.filter((s) => s.wins + s.losses + s.draws > 0).map((s) => s.teamId),
  );
  const others = regs.filter(
    (r) => r.regionId !== myRegion && r.rankedTeams.some((t) => played.has(t)),
  );

  const lines: string[] = [];
  if (others.length > 0) {
    const pick = others[Math.floor(opts.rand01[0] * others.length) % others.length];
    const top = pick.rankedTeams[0];
    const st = opts.hsStandings.find((s) => s.teamId === top);
    lines.push(
      `■ ${regionName(pick.regionId)}   선두 ${opts.teamName(top)}` +
      (st ? `  (${st.wins}승 ${st.losses}패 ${pctStr(st.winPct)})` : ""),
    );
  }

  // 다른 리그 하나 — 순위표에 경기 결과가 쌓인 리그만
  const leagueIds = Object.keys(OTHER_LEAGUE_NAMES).filter((lid) => {
    const st = opts.leagueState[lid]?.standings ?? [];
    return st.some((s) => s.wins + s.losses + s.draws > 0);
  });
  if (leagueIds.length > 0) {
    const lid = leagueIds[Math.floor(opts.rand01[1] * leagueIds.length) % leagueIds.length];
    const sorted = [...(opts.leagueState[lid]?.standings ?? [])].sort(
      (a, b) => b.winPct - a.winPct || b.wins - a.wins,
    );
    if (sorted.length > 0) {
      lines.push(
        `■ ${OTHER_LEAGUE_NAMES[lid]}   선두 ${opts.teamName(sorted[0].teamId)}` +
        `  (${pctStr(sorted[0].winPct)})`,
      );
    }
  }

  if (lines.length === 0) return null;

  return {
    id: `msg-neighbor-${opts.seasonYear}-w${opts.weekNum}`,
    category: "news",
    sender: "주간 야구",
    subject: "이번 주 다른 무대",
    preview: lines[0].replace(/^■\s*/, ""),
    body: ["다른 권역과 리그의 이번 주 소식입니다.", "", ...lines].join("\n"),
    createdAt: `W${opts.weekNum}`,
    readAt: null,
  };
}
