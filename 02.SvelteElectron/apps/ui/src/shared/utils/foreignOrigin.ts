/**
 * 용병이 **어디서 오는가** — 실제 해외 선수를 데려온다.
 *
 * ⚠ **예전엔 무에서 만들었다.** `generateForeignPlayersNative`가 선수를 새로
 * 찍고 `careerHistory: []` · `careerEvents: []`로 넣어서, 어디서 왔다는 기록이
 * 아예 없었다 — 화면이 국내 신인과 구분할 방법이 없었다.
 *
 * ABL·JBL이 열렸으므로(2026-08-06) 그 리그의 **실재하는 선수**를 이적시킨다.
 * "그 선수가 작년에 거기 있었다"가 참이 된다.
 *
 * ⚠ **분포는 규칙 파일이 정본이다.** 마이너(팜) 출신이 대부분이다 — 메이저
 * 주전급은 연봉·조건 때문에 KBO에 잘 안 온다(사용자 확정).
 */

export interface OriginRules {
  weights: Record<string, number>;
  returnLeague: string;
}

/** 규칙이 없을 때. **비어 있으면 이적을 안 하고 생성으로 떨어진다** */
export const NO_ORIGIN: OriginRules = { weights: {}, returnLeague: "" };

export function originRulesOf(foreign: unknown): OriginRules {
  const o = (foreign as { origin?: Partial<OriginRules> } | null)?.origin;
  if (!o?.weights || Object.keys(o.weights).length === 0) return NO_ORIGIN;
  return { weights: o.weights, returnLeague: o.returnLeague ?? "" };
}

export interface Candidate {
  npcId: string;
  league: string;
  ovr: number;
  age: number;
  playerType: string;
}

export interface PickParams {
  candidates: readonly Candidate[];
  rules: OriginRules;
  /** 투수 몇 명 · 야수 몇 명 */
  pitchers: number;
  batters: number;
  /** 0~1. 같은 팀·같은 해에 같은 사람이 두 번 안 뽑히게 호출측이 순서를 준다 */
  rand: () => number;
}

/**
 * 후보 중에서 뽑는다. **출신 리그 가중치를 지키되, 없으면 다음 리그로 넘어간다.**
 *
 * ⚠ 가중치를 절대 비율로 강제하지 않는다. ABL_FARM에 사람이 떨어졌는데 85%를
 * 채우겠다고 버티면 **그 팀은 용병을 못 채운다** — 빈 슬롯이 남는 게 분포가
 * 조금 틀어지는 것보다 나쁘다.
 */
export function pickForeigners(p: PickParams): Candidate[] {
  const pool = new Map<string, Candidate[]>();
  for (const c of p.candidates) {
    if (!(c.league in p.rules.weights)) continue;
    (pool.get(c.league) ?? pool.set(c.league, []).get(c.league)!).push(c);
  }
  // 각 리그 안에서는 능력치 높은 순 — 데려올 만한 사람부터
  for (const list of pool.values()) list.sort((a, b) => b.ovr - a.ovr);

  const out: Candidate[] = [];
  const taken = new Set<string>();
  let needP = Math.max(0, p.pitchers);
  let needB = Math.max(0, p.batters);

  while (needP + needB > 0) {
    const wantPitcher = needP > 0 && (needB === 0 || p.rand() < needP / (needP + needB));
    const picked = drawOne(pool, p.rules.weights, wantPitcher, taken, p.rand);
    if (!picked) break; // 후보가 마르면 멈춘다 — 없는 사람을 지어내지 않는다
    taken.add(picked.npcId);
    out.push(picked);
    if (picked.playerType === "pitcher") needP--;
    else needB--;
  }
  return out;
}

function drawOne(
  pool: Map<string, Candidate[]>,
  weights: Record<string, number>,
  wantPitcher: boolean,
  taken: ReadonlySet<string>,
  rand: () => number,
): Candidate | null {
  const fits = (c: Candidate) =>
    !taken.has(c.npcId) && (c.playerType === "pitcher") === wantPitcher;

  // 후보가 남은 리그만 추첨에 넣는다
  const live = [...pool.entries()].filter(([, list]) => list.some(fits));
  if (live.length === 0) {
    // 원하는 보직이 없으면 보직을 포기한다 — 슬롯을 비우는 것보다 낫다
    const any = [...pool.values()].flat().find((c) => !taken.has(c.npcId));
    return any ?? null;
  }

  const total = live.reduce((a, [lid]) => a + (weights[lid] ?? 0), 0);
  if (total <= 0) return live[0][1].find(fits) ?? null;

  let r = rand() * total;
  for (const [lid, list] of live) {
    r -= weights[lid] ?? 0;
    if (r <= 0) return list.find(fits) ?? null;
  }
  return live[live.length - 1][1].find(fits) ?? null;
}

/** 출신 리그 라벨 — 화면이 "마이너 출신"을 말할 수 있게 */
export function originLabel(leagueId: string): string {
  if (leagueId === "LEAGUE_ABL") return "메이저";
  if (leagueId === "LEAGUE_ABL_FARM") return "마이너";
  if (leagueId === "LEAGUE_JBL") return "일본";
  if (leagueId === "LEAGUE_JBL_FARM") return "일본 2군";
  return "해외";
}
