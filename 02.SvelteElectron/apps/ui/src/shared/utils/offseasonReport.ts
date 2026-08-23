/**
 * 오프시즌 결산 — 엔진이 보낸 사건을 화면이 읽을 행으로 바꾼다.
 *
 * ⚠ **예전엔 엔진이 문장을 조립해 보냈다.**
 * `format!("{} 방출 (로스터 초과 {league_id})", npc.name)`이 그대로 화면에
 * 찍혀서, 이름·팀·사유가 한 덩어리로 붙은 뒤라 화면은 아무것도 못 했다 —
 * 팀 ID를 이름으로 못 바꾸고(`LEAGUE_KBL_FARM`이 그대로 떴다), 종류별로 못
 * 묶고, 내 팀 것만 못 골랐다. 이제 엔진은 `npcId`와 종류만 보낸다.
 *
 * ⚠ **이름을 사건에 담지 않는다.** 여기서 `npcs`로 조회한다 — 은퇴자도
 * 배열에 남으므로 조회된다. 사건에 이름을 굳혀 두면 나중에 표기가 바뀌어도
 * 소식만 옛 이름으로 남는다.
 */

import { clubKeyOfTeam } from "./ids";

export type OffseasonKind =
  | "retire_age" | "retire_no_team"
  | "release_roster" | "release_score"
  | "demote_roster" | "demote_fielder" | "promote"
  | "fa_unsigned" | "fa_contract";

/** 엔진이 보내는 사건 (Rust `OffseasonEvent`) */
export interface OffseasonEvent {
  kind: OffseasonKind | string;
  npcId: string;
  fromTeamId?: string;
  /** 간 곳. **팀 ID다** — 화면이 이름으로 바꾼다 */
  toTeamId?: string;
  detail?: string;
}

/** 헤드라인 네 장. 사건 종류를 사용자가 세는 단위로 묶는다 */
export type OffseasonGroup = "retire" | "release" | "move" | "fa";

export const GROUP_ORDER: readonly OffseasonGroup[] = ["retire", "release", "move", "fa"];

export const GROUP_LABEL: Record<OffseasonGroup, string> = {
  retire: "은퇴",
  release: "방출",
  move: "승격·강등",
  fa: "FA 미계약",
};

interface KindMeta {
  group: OffseasonGroup;
  /** 목록의 "사유" 열 */
  reason: string;
  /** 여러 사건이 겹쳤을 때 경로 표기에 쓰는 짧은 말 ("2군 → 방출") */
  short: string;
}

/**
 * ⚠ 사유 문구의 정본은 이 표 하나다. Rust에 같은 문구를 두지 않는다 —
 * 이 프로젝트에서 "정본이 둘"로 어긋난 사례가 반복해서 나왔다.
 */
const KIND: Record<OffseasonKind, KindMeta> = {
  retire_age:      { group: "retire",  reason: "나이",          short: "은퇴" },
  retire_no_team:  { group: "retire",  reason: "갈 팀 없음",     short: "은퇴" },
  release_roster:  { group: "release", reason: "로스터 초과",    short: "방출" },
  release_score:   { group: "release", reason: "하위 평가",      short: "방출" },
  demote_roster:   { group: "move",    reason: "2군 강등",       short: "2군" },
  demote_fielder:  { group: "move",    reason: "2군 (야수 자리)", short: "2군" },
  promote:         { group: "move",    reason: "1군 승격",       short: "1군" },
  fa_unsigned:     { group: "fa",      reason: "FA 미계약",      short: "미계약" },
  fa_contract:     { group: "fa",      reason: "FA 계약",        short: "계약" },
};

export function isKnownKind(k: string): k is OffseasonKind {
  return k in KIND;
}

/**
 * 인연 라벨 — **관계 종류지 친밀도가 아니다.**
 *
 * ⚠ 처음엔 `relationLabel(value)`를 썼다가 화면에 "이수욱 **중립**"으로 떴다.
 * 그건 사이가 얼마나 좋은지를 말하는 값이라, "아는 사람"이라는 표시 자리에
 * 오면 뜻이 어긋난다. 목록에서 필요한 건 *왜 이 사람이 눈에 띄어야 하는가*다.
 */
export function relationTag(kind: string): string | null {
  if (kind === "rival") return "라이벌";
  if (kind === "teammate") return "동료";
  return null;   // 감독·코치·구단주는 선수 목록에 안 나온다
}

/** 화면이 조회에 쓰는 최소 정보. 저장 타입 전체를 끌고 오지 않는다 */
export interface PersonLookup {
  npcId: string;
  name: string;
  age: number;
  position: string;
}

export interface OffseasonRow {
  npcId: string;
  name: string;
  age: number;
  position: string;
  teamId: string | null;
  group: OffseasonGroup;
  /** 목록에 찍히는 사유. 사건이 겹치면 경로가 된다 ("2군 → 방출") */
  reason: string;
  /** 부가 수치. 사유에 섞지 않는다 — "점수 65"가 뭔지 모를 값이었다 */
  detail?: string;
  /** 내 구단 사람인가. **2군도 내 팀이다** */
  mine: boolean;
  /** 인연 라벨 ("동료"·"라이벌"). 없으면 null */
  relation: string | null;
}

export interface BuildParams {
  events: readonly OffseasonEvent[];
  people: readonly PersonLookup[];
  /** 주인공 소속. 없으면 `mine`이 전부 false */
  myTeamId?: string | null;
  /** npcId → 인연 라벨 */
  relations?: ReadonlyMap<string, string>;
}

/**
 * 사람 단위로 합친다.
 *
 * ⚠ **한 사람이 두 줄로 나오던 것을 막는다.** 류혁식은 `→ 2군 (야수 자리
 * 확보)` 뒤에 `방출 (점수 65)`로 목록 양쪽 끝에 떨어져 있어 모순처럼 읽혔다.
 * 실제로는 *2군에 내려갔다가 방출* 한 사건이다.
 *
 * ⚠ **결론은 마지막 사건이다.** 엔진이 사건을 시간 순으로 담으므로 순서가
 * 곧 경과다. 정렬을 하면 이 순서가 깨지므로 여기서는 손대지 않는다.
 */
export function buildRows(p: BuildParams): OffseasonRow[] {
  const person = new Map(p.people.map((x) => [x.npcId, x]));
  const myClub = p.myTeamId ? clubKeyOfTeam(p.myTeamId) : null;

  const byPerson = new Map<string, OffseasonEvent[]>();
  for (const e of p.events) {
    if (!isKnownKind(e.kind)) continue;   // 모르는 종류를 지어내 표시하지 않는다
    const list = byPerson.get(e.npcId);
    if (list) list.push(e); else byPerson.set(e.npcId, [e]);
  }

  const rows: OffseasonRow[] = [];
  for (const [npcId, list] of byPerson) {
    const last = list[list.length - 1];
    const meta = KIND[last.kind as OffseasonKind];
    const who = person.get(npcId);

    // 사건 당시 소속. 마지막 사건 것을 쓴다 — 방출이면 방출된 자리가 맞다
    const fromId = [...list].reverse().find((e) => e.fromTeamId)?.fromTeamId ?? null;
    // 간 곳이 있으면 그쪽을 보여준다 — FA 계약은 **어디로 갔나**가 요점이다.
    // 나머지 사건(은퇴·방출·승강)은 간 곳이 없어 예전대로 떠난 팀이 든다.
    const toId = [...list].reverse().find((e) => e.toTeamId)?.toTeamId ?? null;
    const teamId = toId ?? fromId;

    // 겹치면 경로로. 같은 말이 반복되면(2군 → 2군) 결론만 쓴다
    const first = KIND[list[0].kind as OffseasonKind];
    const reason = list.length > 1 && first.short !== meta.short
      ? `${first.short} → ${meta.short}`
      : meta.reason;

    rows.push({
      npcId,
      // ⚠ 조회가 빈 경우를 이름 자리에 ID로 채우지 않는다 — 그게 이번에 고친
      // 결함 그 자체다. 사람을 못 찾으면 모른다고 쓴다
      name:     who?.name ?? "(기록 없음)",
      age:      who?.age ?? 0,
      position: who?.position ?? "-",
      teamId,
      group:    meta.group,
      reason,
      detail:   last.detail,
      // ⚠ **양쪽을 다 본다.** 떠난 팀만 보면 내 팀이 데려온 FA가 안 잡힌다 —
      //   영입이야말로 가장 보고 싶은 소식이다.
      mine:     myClub !== null && [toId, fromId].some(
                  (t) => t !== null && clubKeyOfTeam(t) === myClub),
      relation: p.relations?.get(npcId) ?? null,
    });
  }
  return rows;
}

/** 헤드라인 숫자. 행 기준이라 **사람 수**다 — 사건 수를 세면 겹친 사람이 두 번 셈된다 */
export function countByGroup(rows: readonly OffseasonRow[]): Record<OffseasonGroup, number> {
  const out: Record<OffseasonGroup, number> = { retire: 0, release: 0, move: 0, fa: 0 };
  for (const r of rows) out[r.group]++;
  return out;
}

/**
 * 목록 정렬 — **내 팀 → 아는 사람 → 나이 많은 순**.
 *
 * 852명 목록에서 내 팀 4명을 눈으로 찾게 두지 않는다.
 */
export function sortRows(rows: readonly OffseasonRow[]): OffseasonRow[] {
  const rank = (r: OffseasonRow) => (r.mine ? 0 : r.relation ? 1 : 2);
  return [...rows].sort((a, b) =>
    rank(a) - rank(b)
    || b.age - a.age
    || a.name.localeCompare(b.name, "ko")
    || a.npcId.localeCompare(b.npcId),
  );
}

/**
 * 목록 preview 한 줄.
 *
 * ⚠ 예전엔 `logs[0]`이라 "FA 미계약 2명"만 떴다 — **852명이 은퇴한 시즌인지
 * 아무 일 없던 시즌인지 목록에서 구분이 안 됐다.**
 */
export function previewLine(counts: Record<OffseasonGroup, number>): string {
  const parts = GROUP_ORDER
    .filter((g) => counts[g] > 0)
    .map((g) => `${GROUP_LABEL[g]} ${counts[g]}`);
  return parts.length > 0 ? parts.join(" · ") : "특별한 이동이 없었다";
}
