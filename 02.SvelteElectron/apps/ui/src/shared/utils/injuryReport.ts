/**
 * 부상 소식 — 한 달치를 모아 한 화면으로.
 *
 * ⚠ **예전엔 한 사람당 메시지 하나였다.** 매주 수술·중증이 나올 때마다
 * `부상 소식 — 임도훈 (중증)`이 따로 날아와서, 소식함이 이런 모양이었다:
 *
 *     부상 소식 — 임도훈 (중증)   UCL 부분 파열 / 회복 13주
 *     부상 소식 — 안재완 (수술)   회전근개 완전 파열 / 회복 56주
 *     부상 소식 — 임도민 (중증)   …          ← 여섯 줄 연속
 *
 * 오프시즌 결산과 **같은 결함**이다(`offseasonReport.ts`). 개별 사건을 그대로
 * 쏟으면 정보가 전달되는 게 아니라 던져진다.
 *
 * ⚠ **이름을 사건에 담지 않는다.** 화면이 `npcId`로 조회한다 — 이유는
 * `offseasonReport.ts` 머리말과 같다.
 */

import { clubKeyOfTeam } from "./ids";

/** 엔진이 아니라 주간 처리(`weekPhases/injuries.ts`)가 쌓는다 */
export interface InjuryEvent {
  npcId: string;
  /** `INJURY_LABEL`의 키. 라벨은 화면이 붙인다 */
  injuryType: string;
  /** `light` | `moderate` | `severe` | `surgery` */
  severity: string;
  /** 회복까지 걸리는 주 */
  weeks: number;
  /** 이 부상으로 은퇴했는가. **가장 심한 결말이다** */
  retired?: boolean;
  teamId?: string;
  /** 발생 주차 — 목록에서 "언제"를 알 수 있어야 한다 */
  week: number;
}

/**
 * 부상 등급. **심한 순서다** — 카드도 이 순서로 놓는다.
 *
 * ⚠ 수술이 시즌 아웃보다 위다. 수술은 이번 시즌을 날리는 데다 능력치가
 * 영구히 깎인다(`NPC_INJURY_OVR_PENALTY`).
 */
export type InjuryClass = "retired" | "surgery" | "season_out" | "long" | "short";

export const CLASS_ORDER: readonly InjuryClass[] = [
  "retired", "surgery", "season_out", "long", "short",
];

export const CLASS_LABEL: Record<InjuryClass, string> = {
  retired:    "부상 은퇴",
  surgery:    "수술",
  season_out: "시즌 아웃",
  long:       "장기",
  short:      "단기",
};

/** 장기의 하한(주). 한 달 넘게 빠지면 팀 구성이 바뀐다 */
export const LONG_WEEKS = 8;

/**
 * 등급을 정한다.
 *
 * @param weeksLeftInSeason 시즌 남은 주. **0이면 시즌 아웃 판정을 안 한다** —
 *        모르는 걸 안다고 하지 않는다
 */
export function classify(e: InjuryEvent, weeksLeftInSeason: number): InjuryClass {
  if (e.retired) return "retired";
  if (e.severity === "surgery") return "surgery";
  if (weeksLeftInSeason > 0 && e.weeks >= weeksLeftInSeason) return "season_out";
  if (e.weeks >= LONG_WEEKS) return "long";
  return "short";
}

export interface PersonLookup {
  npcId: string;
  name: string;
  age: number;
  position: string;
}

export interface InjuryRow {
  npcId: string;
  name: string;
  age: number;
  position: string;
  teamId: string | null;
  cls: InjuryClass;
  injuryType: string;
  weeks: number;
  week: number;
  mine: boolean;
  relation: string | null;
}

export interface BuildParams {
  events: readonly InjuryEvent[];
  people: readonly PersonLookup[];
  /** 시즌 남은 주. 모르면 0 */
  weeksLeftInSeason?: number;
  myTeamId?: string | null;
  relations?: ReadonlyMap<string, string>;
}

/**
 * 사람 단위로 합친다.
 *
 * ⚠ **한 달 안에 두 번 다칠 수 있다.** 그때는 **더 심한 쪽**이 결론이다 —
 * 오프시즌(마지막 사건이 결론)과 규칙이 다르다. 부상은 경과가 아니라 상태라,
 * 3주짜리 뒤에 수술이 오면 그 사람은 수술한 사람이다.
 */
export function buildRows(p: BuildParams): InjuryRow[] {
  const person = new Map(p.people.map((x) => [x.npcId, x]));
  const myClub = p.myTeamId ? clubKeyOfTeam(p.myTeamId) : null;
  const left = p.weeksLeftInSeason ?? 0;
  const rank = (c: InjuryClass) => CLASS_ORDER.indexOf(c);

  const worst = new Map<string, { e: InjuryEvent; cls: InjuryClass }>();
  for (const e of p.events) {
    if (!e.npcId) continue;
    const cls = classify(e, left);
    const cur = worst.get(e.npcId);
    // 같은 등급이면 나중 것 — 더 최근 상태다
    if (!cur || rank(cls) <= rank(cur.cls)) worst.set(e.npcId, { e, cls });
  }

  const rows: InjuryRow[] = [];
  for (const [npcId, { e, cls }] of worst) {
    const who = person.get(npcId);
    const teamId = e.teamId || null;
    rows.push({
      npcId,
      // 못 찾은 사람 자리에 ID를 채우지 않는다
      name:       who?.name ?? "(기록 없음)",
      age:        who?.age ?? 0,
      position:   who?.position ?? "-",
      teamId,
      cls,
      injuryType: e.injuryType,
      weeks:      e.weeks,
      week:       e.week,
      mine:       myClub !== null && teamId !== null && clubKeyOfTeam(teamId) === myClub,
      relation:   p.relations?.get(npcId) ?? null,
    });
  }
  return rows;
}

export function countByClass(rows: readonly InjuryRow[]): Record<InjuryClass, number> {
  const out: Record<InjuryClass, number> = {
    retired: 0, surgery: 0, season_out: 0, long: 0, short: 0,
  };
  for (const r of rows) out[r.cls]++;
  return out;
}

/** 내 팀 → 아는 사람 → 오래 빠지는 순 */
export function sortRows(rows: readonly InjuryRow[]): InjuryRow[] {
  const pri = (r: InjuryRow) => (r.mine ? 0 : r.relation ? 1 : 2);
  return [...rows].sort((a, b) =>
    pri(a) - pri(b)
    || b.weeks - a.weeks
    || a.name.localeCompare(b.name, "ko")
    || a.npcId.localeCompare(b.npcId),
  );
}

/**
 * 목록 preview 한 줄.
 *
 * ⚠ 심한 등급만 쓴다. 단기 부상 200건을 앞세우면 **수술 3건이 묻힌다** —
 * 그게 이 소식에서 정작 알아야 할 것이다.
 */
export function previewLine(counts: Record<InjuryClass, number>): string {
  const parts = CLASS_ORDER
    .filter((c) => c !== "short" && counts[c] > 0)
    .map((c) => `${CLASS_LABEL[c]} ${counts[c]}`);
  if (parts.length > 0) return parts.join(" · ");
  return counts.short > 0 ? `가벼운 부상 ${counts.short}건` : "새 부상이 없었다";
}
