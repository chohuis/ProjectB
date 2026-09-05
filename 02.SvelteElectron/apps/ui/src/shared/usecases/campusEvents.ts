/**
 * 대학·고교 비경기성 이벤트 (Phase 7-7).
 *
 * 설계 근거는 `docs/design/_ledger.md` §A-9. 선발·결과 계산은 전부 Rust
 * `campus_events.rs`가 하고 여기는 후보를 모으고 결과를 화면에 붙인다.
 *
 * | 이벤트 | 무대 | 하는 일 |
 * |---|---|---|
 * | 전국대학선수쇼케이스 | 대학 | **주목도 급등 경로** — 참가가 평가를 바꾼다 |
 * | 올스타전(북 vs 남) | 대학 | **선발 자체가 서사** — 뽑히면 그것으로 사건 |
 * | 스카우트 데이 | 고교 | 위 둘의 축소판. §A-9가 "신규 기획 필요"로 남긴 자리 |
 */

import { get } from "svelte/store";
import { gameStore } from "../stores/game";
import { seasonStore, npcLiveStatsStore } from "../stores/season";
import { masterStore } from "../stores/master";
import { autoLog } from "../stores/autoAdvance";
import { loadRosterRules } from "../repo/newGameV3";
// 🔴 팀 목록의 정본 — refs 에서 1군/2군을 **나눠 담는다**
import { ALL_TEAMS_BY_LEAGUE } from "../utils/leagueScheduler";
import { cardsMeta } from "../utils/dashboardMeta";

// ── 남/북 판정 ────────────────────────────────────────────────
//
// 올스타전이 "북 vs 남"이라 팀을 둘로 갈라야 한다. refs의 `city`가 유일한
// 입력이다 — **ID에서 파생하지 않는다**(팀 ID에 지역이 안 들어 있고, 넣으면
// ids.ts 규칙과 충돌한다).
const SOUTH_CITIES = new Set([
  "부산", "대구", "광주", "울산", "창원", "전주", "여수", "포항", "진주", "목포",
  "순천", "김해", "제주", "경주", "통영", "마산", "구미", "안동",
]);

/** 도시가 목록에 없으면 북으로 본다 — 수도권·중부가 기본값이다 */
export function regionOf(city: string | undefined): "north" | "south" {
  return city && SOUTH_CITIES.has(city) ? "south" : "north";
}

/**
 * 올스타 편 가르기. 국내는 남/북 도시로 가른다.
 *
 * 🔴 **해외(ABL·JBL)는 도시가 목록에 없어 전원이 `north`가 된다** — 한 편이
 *   통째로 비어 경기가 안 선다. 그럴 땐 **팀 id 정렬 순서로 반씩** 가른다.
 * ⚠ 정렬 순서를 쓰는 건 **결정성** 때문이다 — 같은 세이브가 늘 같은 편이다.
 */
export function allStarSideOf(
  teamId: string,
  city: string | undefined,
  sortedTeamIds: readonly string[],
): "north" | "south" {
  if (city && SOUTH_CITIES.has(city)) return "south";
  // 국내면 여기서 끝 — 남쪽 도시가 하나라도 있으면 도시 축이 선다
  if (sortedTeamIds.some((t) => t === teamId) === false) return "north";
  const i = sortedTeamIds.indexOf(teamId);
  return i >= 0 && i % 2 === 1 ? "south" : "north";
}

// ── 후보 수집 ─────────────────────────────────────────────────

interface CampusCandidate {
  npcId: string; name: string; teamId: string; region: string;
  position: string; ovr: number; age: number; grade: number;
  scoutScore: number; popularity: number; form: number;
  isProtagonist: boolean;
}

function gatherCandidates(leagueId: string): CampusCandidate[] {
  const g = get(gameStore);
  const s = get(seasonStore);
  const m = get(masterStore);
  const live = get(npcLiveStatsStore);
  const cityOf = new Map(m.teams.map((t) => [t.id, t.city]));
  const stats = s.leagueState?.[leagueId]?.stats ?? {};
  // ⚠ **도시 축이 서는지 먼저 본다.** 해외는 남쪽 도시가 하나도 없어
  //   전원이 북이 된다 — 그러면 팀 정렬 순서로 반씩 가른다
  // 🔴 **`m.teams` 를 리그로 거르면 1군과 2군이 같이 딸려온다** (2026-09-01).
  //   refs 에서 KBL 은 `_1`(1군)과 `_2`(2군)가 **같은 `leagueId`** 다.
  //
  //   `runAllStar` 가 프로에도 쓰이면서(`campusEvents.ts:179` ·
  //   `g.protagonist.leagueId` 를 넘긴다) **프로 올스타 후보에 2군 선수가
  //   섞였다.** 대학·고교는 2군이 없어 예전에도 맞았고, 2026-08-29 에
  //   프로 올스타를 열면서 이 함정에 들어왔다.
  //
  // ⚠ 정본은 `ALL_TEAMS_BY_LEAGUE` — refs 에서 1군/2군을 나눠 담는다.
  //   없는 리그(상무 등)만 옛 방식으로 떨어진다.
  const leagueTeamIds = (ALL_TEAMS_BY_LEAGUE[leagueId]
    ?? m.teams.filter((t) => t.leagueId === leagueId).map((t) => t.id))
    .slice()
    .sort();
  const cityAxisWorks = leagueTeamIds.some((t) => regionOf(cityOf.get(t)) === "south");

  const out: CampusCandidate[] = [];
  for (const e of m.entities) {
    if (e.role !== "player" || e.leagueId !== leagueId) continue;
    if (e.status === "retired") continue;
    const d = e.details?.player;
    const ls = live[e.id];
    const ovr = ls?.pitching?.ovr ?? ls?.batting?.ovr
      ?? d?.pitching?.ovr ?? d?.batting?.ovr ?? 50;
    out.push({
      npcId: e.id,
      name: e.name || e.id,
      teamId: e.teamId ?? "",
      region: cityAxisWorks
        ? regionOf(cityOf.get(e.teamId ?? ""))
        : allStarSideOf(e.teamId ?? "", undefined, leagueTeamIds),
      position: d?.position ?? "SP",
      ovr,
      age: e.age,
      grade: e.grade ?? 0,
      scoutScore: (e as { scoutScore?: number }).scoutScore ?? 0,
      popularity: (e as { popularity?: number }).popularity ?? 0,
      form: formOf(e.id, stats),
      isProtagonist: false,
    });
  }

  // 주인공은 엔티티가 아니므로 따로 넣는다 — 빠뜨리면 본인만 못 나간다
  if (g.protagonist.leagueId === leagueId) {
    const p = g.protagonist;
    out.push({
      npcId: p.id, name: p.name, teamId: p.teamId,
      // 🔴 **NPC와 같은 축을 써야 한다** (2026-09-06). 여기만 `regionOf`를
      //   직접 불러서, 도시 축이 안 서는 해외(ABL·JBL)에서 **주인공은 늘
      //   북군**이었다 — `regionOf`는 목록에 없는 도시를 전부 북으로 본다.
      //   NPC는 바로 위에서 이미 `allStarSideOf`로 떨어지고 있었다.
      region: cityAxisWorks
        ? regionOf(cityOf.get(p.teamId))
        : allStarSideOf(p.teamId, undefined, leagueTeamIds),
      position: p.position ?? "SP",
      ovr: p.playerType === "batter" ? p.batting.ovr : p.pitching.ovr,
      age: p.age, grade: p.grade ?? 0,
      scoutScore: p.scoutScore ?? 0,
      popularity: p.popularity ?? 0,
      form: formOf(p.id, stats),
      isProtagonist: true,
    });
  }
  return out;
}

/** 이번 시즌 폼 — 승강·국가대표와 **같은 축**을 쓴다 */
function formOf(id: string, stats: Record<string, unknown>): number {
  const st = stats[id] as { era?: number; battingAvg?: number } | undefined;
  if (!st) return 0;
  if (typeof st.era === "number" && st.era > 0) {
    return Math.max(-1, Math.min(1, (4.5 - st.era) / 2.5));
  }
  if (typeof st.battingAvg === "number" && st.battingAvg > 0) {
    return Math.max(-1, Math.min(1, (st.battingAvg - 0.27) / 0.08));
  }
  return 0;
}

async function engine<T>(fn: string, params: unknown): Promise<T> {
  const raw = await window.projectB!.engine(fn, JSON.stringify(params));
  const out = JSON.parse(raw) as T & { error?: string };
  if (out?.error) throw new Error(`[campusEvents] ${fn}: ${out.error}`);
  return out;
}

// ── 무대 배분 ─────────────────────────────────────────────────
//
// 🔴 **무대를 보는 자리를 하나로 모았다** (2026-09-06). 예전엔 `if` 넷이
//   각자 `stage`를 봤고, 게이트는 위에서 한 번 더 봤다 — **같은 판정이 다섯
//   군데**였다. 2026-08-29에 프로 올스타를 넣으면서 게이트만 넓히면 되던 것이
//   그래서 위험해졌고, 검사는 게이트 **문자열**을 정규식으로 보고 있었다.
//   여기 한 함수만 맞으면 샐 수 없고, 검사도 이 함수를 직접 부른다.

/** 이 행사에 나가는 무대인가. 규칙 파일을 열기 전에 거르는 자리도 이걸 쓴다 */
export function campusStageKind(
  stage: string,
): "university" | "highschool" | "pro" | null {
  if (stage === "university") return "university";
  if (stage === "highschool") return "highschool";
  if (stage.startsWith("pro")) return "pro";
  // 독립 · 상무 · 은퇴 — 이 무대의 소식이 아니다
  return null;
}

export type CampusEventKind = "showcase" | "allstar" | "pro_allstar" | "scout_day";

/**
 * 이번 주에 이 무대에서 열리는 행사. 없으면 `null`.
 *
 * ⚠ **무대마다 자기 행사만 돌려준다.** 대학 쇼케이스가 프로에게 갈 길이
 *   여기 없어야 한다 — 있으면 프로 소식함에 「대학야구연맹」이 뜬다.
 */
export function campusEventFor(
  stage: string,
  weekInYear: number,
  weeks: { showcase: number; allstar: number; proAllstar?: number | null },
): CampusEventKind | null {
  switch (campusStageKind(stage)) {
    case "university":
      if (weekInYear === weeks.showcase) return "showcase";
      if (weekInYear === weeks.allstar) return "allstar";
      return null;
    case "highschool":
      // 고교는 쇼케이스와 **같은 주**에 축소판을 연다 (§A-9 "단계별 비대칭 축소").
      // 대학 올스타 주차(`weeks.allstar`)에는 아무것도 안 연다
      return weekInYear === weeks.showcase ? "scout_day" : null;
    case "pro":
      // 🔴 **프로 올스타전** (2026-08-29). 규칙이 없으면 안 연다.
      //   쇼케이스·대학 올스타 주차에는 프로에게 아무것도 가지 않는다
      return weeks.proAllstar != null && weekInYear === weeks.proAllstar
        ? "pro_allstar" : null;
    default:
      return null;
  }
}

// ── 주간 훅 ───────────────────────────────────────────────────

/**
 * 매주 부른다. 해당 주차가 아니면 아무것도 안 한다.
 *
 * 무대 판정은 전부 `campusEventFor`가 한다 — 여기서 다시 보지 않는다.
 */
export async function runCampusEventsWeek(
  weekNum: number,
  weekInYear: number,
): Promise<string[]> {
  const g = get(gameStore);
  const stage = g.protagonist.careerStage;
  // 규칙 파일 읽기(IPC)를 아끼는 지름길일 뿐이다 — **판정은 아니다.**
  // 그래서 배분표와 **같은 함수**를 쓴다
  if (campusStageKind(stage) === null) return [];

  try {
    const rules = (await loadRosterRules() as unknown as {
      campusEvents?: {
        showcase: Record<string, unknown> & { week: number };
        allstar: Record<string, unknown> & { week: number };
        proAllstar?: Record<string, unknown> & { week: number };
      };
    }).campusEvents;
    if (!rules) return [];

    switch (campusEventFor(stage, weekInYear, {
      showcase: rules.showcase.week,
      allstar: rules.allstar.week,
      proAllstar: rules.proAllstar?.week ?? null,
    })) {
      case "showcase":
        return await runShowcase(rules.showcase, weekNum);
      case "allstar":
        return await runAllStar(rules.allstar, weekNum, "LEAGUE_UNIVERSITY");
      case "pro_allstar":
        return await runAllStar(rules.proAllstar!, weekNum, g.protagonist.leagueId ?? "");
      case "scout_day":
        return await runScoutDay(rules.showcase, weekNum);
      default:
        break;
    }
  } catch (e) {
    // 이벤트가 못 돌아도 주간 진행은 막지 않는다
    console.warn("[campusEvents] 실패 — 이번 주는 건너뜀", e);
  }
  return [];
}

// ── 쇼케이스 ──────────────────────────────────────────────────

interface ShowcaseEntry {
  npcId: string; name: string; teamId: string; position: string;
  route: string; day2Score: number; standout: boolean;
  scoutGain: number; fameGain: number;
}

async function runShowcase(rules: unknown, weekNum: number): Promise<string[]> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const candidates = gatherCandidates("LEAGUE_UNIVERSITY");
  if (candidates.length === 0) return [];

  const res = await engine<{
    entries: ShowcaseEntry[]; protagonistInvited: boolean; total: number;
  }>("runShowcaseNative", {
    rules, candidates, worldSeed: (s.worldSeed ?? 0) >>> 0, year: s.seasonYear,
  });

  autoLog(`[쇼케이스] ${s.seasonYear} 전국대학선수쇼케이스 ${res.total}명 참가` +
    `${res.protagonistInvited ? " · 주인공 포함" : ""}`);

  const mine = res.entries.find((e) => e.npcId === g.protagonist.id);
  if (mine) {
    gameStore.applyScoutScoreChange(mine.scoutGain);
    gameStore.applyFameChange(mine.fameGain);
  }

  emitShowcaseNews(res, mine, weekNum, s.seasonYear);
  return res.protagonistInvited
    ? [`쇼케이스에 초청됐다 (${mine?.route === "recommend" ? "팀 추천" : mine?.route === "top_scout" ? "주목도 상위" : "구단 지명"})`]
    : [`전국대학선수쇼케이스 개최 — ${res.total}명 참가`];
}

function emitShowcaseNews(
  res: { entries: ShowcaseEntry[]; protagonistInvited: boolean; total: number },
  mine: ShowcaseEntry | undefined,
  weekNum: number,
  year: number,
): void {
  const m = get(masterStore);
  const teamName = (id: string) => m.teams.find((t) => t.id === id)?.name ?? id;
  const top = res.entries.filter((e) => e.standout).slice(0, 10);

  gameStore.addMessage({
    id: `msg-showcase-${year}-w${weekNum}`,
    category: "news",
    sender: "대학야구연맹",
    // 참가 인원은 카드가 든다 — 제목이 또 적으면 두 벌이다 (OP ③)
    subject: `${year} 전국대학선수쇼케이스`,
    preview: mine
      ? `나도 참가했다${mine.standout ? " · 눈에 띄었다" : ""}`
      : `이번에는 초청받지 못했다`,
    body: [
      `${year} 전국대학선수쇼케이스가 이틀 일정으로 열렸습니다.`,
      "",
      "Day1 워크아웃에서 참가자 전원의 측정 기록이 공개되고,",
      "Day2 전시경기에서 실전 모습이 스카우트에게 노출됩니다.",
      "",
      mine
        ? [
            `■ 나`,
            `  초청 경로: ${mine.route === "recommend" ? "소속팀 추천" : mine.route === "top_scout" ? "주목도 상위" : "구단 지명"}`,
            `  Day2 평가: ${mine.day2Score.toFixed(1)}점${mine.standout ? " — 상위권" : ""}`,
            `  주목도 +${mine.scoutGain} · 명성 +${mine.fameGain}`,
          ].join("\n")
        : "이번 명단에는 들지 못했다. 다음 기회를 노려야 한다.",
      "",
      "■ Day2 주목받은 선수",
      ...top.map((e, i) =>
        `  ${String(i + 1).padStart(2)}. ${e.name} (${teamName(e.teamId)} · ${e.position}) ${e.day2Score.toFixed(1)}점`),
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    // 값만 싣는다 — 이름표·초청 경로 이름은 문안이 갖는다 (B-35)
    metadata: cardsMeta("cards.showcase", [
      { key: "total", value: res.total },
      ...(mine ? [
        { key: "route", value: mine.route },
        { key: "standout", value: mine.standout === true },
        { key: "scoutDelta", value: Math.round(mine.scoutGain) },
        { key: "fameDelta", value: Math.round(mine.fameGain) },
      ] : []),
    ]),
  });
}

// ── 올스타전 ──────────────────────────────────────────────────

interface AllStarPick {
  npcId: string; name: string; teamId: string; position: string;
  side: string; score: number; byQuota: boolean;
}

/**
 * 올스타전 문안 — **무대마다 갈린다.**
 *
 * 🔴 기계는 2026-08-29에 리그 중립이 됐는데 **문안은 "대학"으로 박힌 채였다**
 *   (2026-09-06 발견). 프로 주인공이 프로 올스타전을 뛰면 소식함에
 *   「대학야구연맹」이 보낸 「2030 대학 올스타전」이 떴다 — 게이트가 샌 게
 *   아니라 **문안이 무대를 안 봤다.** 기계를 공용으로 만들 때 같이 갈랐어야
 *   할 것이 남아 있었다.
 *
 * `unit`은 꼬리말의 쿼터 단위다 — 대학은 "대학당", 프로는 "구단당"이다.
 */
export interface AllStarCopy { slug: string; org: string; title: string; unit: string }

const ALLSTAR_COPY: Record<string, AllStarCopy> = {
  LEAGUE_UNIVERSITY: { slug: "univ", org: "대학야구연맹",  title: "대학 올스타전", unit: "대학" },
  LEAGUE_KBL:        { slug: "kbl",  org: "한국야구위원회", title: "KBL 올스타전",  unit: "구단" },
  LEAGUE_ABL:        { slug: "abl",  org: "ABL 사무국",     title: "ABL 올스타전",  unit: "구단" },
  LEAGUE_JBL:        { slug: "jbl",  org: "JBL 사무국",     title: "JBL 올스타전",  unit: "구단" },
};

/**
 * 리그의 올스타 문안. **표에 없는 리그도 대학 문안으로 떨어지지 않는다** —
 * 모르는 리그는 중립("올스타전")으로 쓴다. 예전 기본값이 대학이라 샜다.
 */
export function allStarCopyOf(leagueId: string): AllStarCopy {
  return ALLSTAR_COPY[leagueId]
    ?? { slug: "league", org: "리그 사무국", title: "올스타전", unit: "구단" };
}

/**
 * 올스타전. **리그 중립이다** — 대학도 프로도 같은 기계를 쓴다.
 *
 * 🔴 프로 올스타전이 **아예 없었다** (2026-08-29). `run_allstar`는 처음부터
 *   리그를 안 가렸고 쿼터도 팀 단위인데, 호출부가 `LEAGUE_UNIVERSITY`를
 *   박아 놓고 `stage === "university"`로 막고 있었다.
 */
async function runAllStar(rules: unknown, weekNum: number, leagueId: string): Promise<string[]> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const candidates = gatherCandidates(leagueId);
  if (candidates.length === 0) return [];

  const res = await engine<{
    north: AllStarPick[]; south: AllStarPick[];
    northScore: number; southScore: number; winner: string;
    mvpNpcId: string; mvpName: string;
    protagonistSelected: boolean; protagonistSide: string;
  }>("runAllstarNative", {
    rules, candidates, worldSeed: (s.worldSeed ?? 0) >>> 0, year: s.seasonYear,
  });

  const copy = allStarCopyOf(leagueId);
  const r = rules as { selectFameGain: number; selectPopularityGain: number; mvpFameGain: number };
  autoLog(`[올스타전] ${s.seasonYear} ${copy.title} 북 ${res.northScore} : ${res.southScore} 남 · ` +
    `MVP ${res.mvpName}${res.protagonistSelected ? " · 주인공 출전" : ""}`);

  if (res.protagonistSelected) {
    gameStore.applyFameChange(r.selectFameGain);
    gameStore.applyPopularityChange(r.selectPopularityGain);
    if (res.mvpNpcId === g.protagonist.id) {
      gameStore.applyFameChange(r.mvpFameGain);
    }
  }

  emitAllStarNews(res, weekNum, s.seasonYear, g.protagonist.id, copy);

  const logs: string[] = [`${copy.title} — 북 ${res.northScore} : ${res.southScore} 남`];
  if (res.protagonistSelected) {
    logs.push(`올스타에 선발됐다 (${res.protagonistSide === "north" ? "북군" : "남군"})`);
    if (res.mvpNpcId === g.protagonist.id) logs.push("올스타전 MVP에 뽑혔다.");
  }
  return logs;
}

function emitAllStarNews(
  res: {
    north: AllStarPick[]; south: AllStarPick[];
    northScore: number; southScore: number; winner: string;
    mvpNpcId: string; mvpName: string;
    protagonistSelected: boolean; protagonistSide: string;
  },
  weekNum: number,
  year: number,
  protagonistId: string,
  copy: AllStarCopy,
): void {
  const m = get(masterStore);
  const teamName = (id: string) => m.teams.find((t) => t.id === id)?.name ?? id;
  const line = (p: AllStarPick) =>
    `  ${p.position.padEnd(3)} ${p.name} (${teamName(p.teamId)})${p.byQuota ? " *" : ""}` +
    `${p.npcId === protagonistId ? "  ← 나" : ""}`;

  const isMvpMe = res.mvpNpcId === protagonistId;

  gameStore.addMessage({
    // ⚠ 무대를 id 에 담는다 — 대시보드 배선은 `msg-allstar-` 접두사로 걸리므로
    //   그대로고, 대학 판과 프로 판이 같은 id 로 겹칠 길이 없어진다
    id: `msg-allstar-${copy.slug}-${year}-w${weekNum}`,
    category: "news",
    sender: copy.org,
    // 🔴 **제목에 점수를 안 적는다** (2026-09-04 · OP ③). 카드가 든 값을
    //   제목이 또 적으면 한쪽만 고쳐진 채 남는다 — 점수는 카드와 본문에 있다
    subject: `${year} ${copy.title}`,
    preview: res.protagonistSelected
      ? (isMvpMe ? "선발됐고 MVP까지 받았다" : "올스타에 선발됐다")
      : `MVP ${res.mvpName}`,
    body: [
      `${year} ${copy.title}(북 vs 남)이 9이닝 단판으로 열렸습니다.`,
      "",
      `최종 스코어: 북군 ${res.northScore} — ${res.southScore} 남군` +
        (res.winner === "draw" ? " (무승부)" : ` — ${res.winner === "north" ? "북군" : "남군"} 승`),
      `MVP: ${res.mvpName}${isMvpMe ? " (나다)" : ""}`,
      "",
      res.protagonistSelected
        ? `나는 ${res.protagonistSide === "north" ? "북군" : "남군"}으로 출전했다.`
        : "이번에는 명단에 들지 못했다.",
      "",
      "■ 북군",
      ...res.north.map(line),
      "",
      "■ 남군",
      ...res.south.map(line),
      "",
      `* 표시는 포지션 쿼터로 선발된 선수입니다. ${copy.unit}당 최대 인원 제한이 적용됩니다.`,
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    // 카드 다섯 — 참·거짓은 화면이 「선정」·「미선정」으로 그린다 (B-35)
    metadata: cardsMeta("cards.allstar", [
      { key: "score", value: `${res.northScore} : ${res.southScore}` },
      { key: "winner", value: res.winner },
      { key: "mvp", value: res.mvpName },
      { key: "selected", value: res.protagonistSelected === true },
      { key: "roster", value: res.north.length + res.south.length },
    ]),
  });
}

// ── 고교 스카우트 데이 (§A-9 "신규 기획 필요"였던 자리) ─────────
//
// 대학 쇼케이스의 축소판이다. 기획서에 없던 것을 새로 만들되 **새 규칙을
// 만들지 않았다** — 같은 `showcase` 규칙을 쓰고 규모만 줄인다.
//
// 이유: 고교 이벤트 전용 계수를 또 만들면 "표가 두 번째"가 된다. 고교는
// 프로 지명이 아니라 **진학·입단 경로**가 걸린 무대라 보상 성격도 같다
// (주목도 = 스카우트 관심도).
async function runScoutDay(rules: unknown, weekNum: number): Promise<string[]> {
  const s = get(seasonStore);
  const g = get(gameStore);
  const candidates = gatherCandidates("LEAGUE_HIGHSCHOOL");
  if (candidates.length === 0) return [];

  // 고교는 102개교라 대학(50교)과 같은 인원을 뽑으면 규모가 두 배가 된다.
  // 팀 추천을 절반으로 줄여 참가 규모를 맞춘다
  const base = rules as Record<string, number>;
  const scaled = {
    ...base,
    perTeamRecommend: Math.max(1, Math.floor(base.perTeamRecommend / 2)),
    topScoutExtra: Math.round(base.topScoutExtra * 0.6),
    clubPicks: Math.round(base.clubPicks * 0.6),
    // 고교는 3학년만 스카우트 대상이지만, 하급생도 눈도장은 찍힌다.
    // 보상을 낮춰 "대학 쇼케이스가 더 큰 무대"라는 위계를 지킨다
    attendScoutGain: base.attendScoutGain * 0.6,
    standoutScoutGain: base.standoutScoutGain * 0.7,
    attendFameGain: base.attendFameGain * 0.5,
  };

  const res = await engine<{
    entries: ShowcaseEntry[]; protagonistInvited: boolean; total: number;
  }>("runShowcaseNative", {
    rules: scaled, candidates,
    worldSeed: ((s.worldSeed ?? 0) ^ 0x5CD_A1) >>> 0, year: s.seasonYear,
  });

  autoLog(`[스카우트데이] ${s.seasonYear} 고교 스카우트 데이 ${res.total}명 참가` +
    `${res.protagonistInvited ? " · 주인공 포함" : ""}`);

  const mine = res.entries.find((e) => e.npcId === g.protagonist.id);
  if (mine) {
    gameStore.applyScoutScoreChange(mine.scoutGain);
    gameStore.applyFameChange(mine.fameGain);
  }

  const m = get(masterStore);
  const teamName = (id: string) => m.teams.find((t) => t.id === id)?.name ?? id;
  const top = res.entries.filter((e) => e.standout).slice(0, 10);

  gameStore.addMessage({
    id: `msg-scoutday-${s.seasonYear}-w${weekNum}`,
    category: "news",
    sender: "고교야구연맹",
    // 참가 인원은 카드가 든다 (OP ③)
    subject: `${s.seasonYear} 고교 스카우트 데이`,
    preview: mine
      ? `나도 참가했다${mine.standout ? " · 눈에 띄었다" : ""}`
      : "이번에는 초청받지 못했다",
    body: [
      `${s.seasonYear} 고교 스카우트 데이가 열렸습니다.`,
      "",
      "프로 구단과 대학 관계자가 함께 참관합니다. 여기서 남긴 인상이",
      "진학 제안과 드래프트 평가에 그대로 이어집니다.",
      "",
      mine
        ? [
            "■ 나",
            `  초청 경로: ${mine.route === "recommend" ? "소속교 추천" : mine.route === "top_scout" ? "주목도 상위" : "구단 지명"}`,
            `  평가: ${mine.day2Score.toFixed(1)}점${mine.standout ? " — 상위권" : ""}`,
            `  주목도 +${mine.scoutGain.toFixed(1)} · 명성 +${mine.fameGain.toFixed(1)}`,
          ].join("\n")
        : "이번 명단에는 들지 못했다.",
      "",
      "■ 주목받은 선수",
      ...top.map((e, i) =>
        `  ${String(i + 1).padStart(2)}. ${e.name} (${teamName(e.teamId)} · ${e.position}) ${e.day2Score.toFixed(1)}점`),
    ].join("\n"),
    createdAt: `W${weekNum}`,
    readAt: null,
    // 값만 싣는다 — 이름표·초청 경로 이름은 문안이 갖는다 (B-35)
    metadata: cardsMeta("cards.scoutDay", [
      { key: "total", value: res.total },
      ...(mine ? [
        { key: "route", value: mine.route },
        { key: "standout", value: mine.standout === true },
        { key: "scoutDelta", value: Math.round(mine.scoutGain) },
        { key: "fameDelta", value: Math.round(mine.fameGain) },
      ] : []),
    ]),
  });

  return res.protagonistInvited
    ? ["고교 스카우트 데이에 초청됐다"]
    : [`고교 스카우트 데이 개최 — ${res.total}명 참가`];
}
