import type { CareerSeasonRecord } from "../types/save";
import { rateLabel } from "./baseballFormat";

/** 슬롯 목록·인트로가 쓰는 통산 요약 */
export interface CareerSummary {
  /** 통산 승 */
  w: number;
  /** 통산 패 */
  l: number;
  /** 통산 평균자책점. 이닝이 0이면 빈 문자열 */
  era: string;
  /** 뛴 시즌 수 */
  seasons: number;
}

/**
 * 시즌 기록을 통산으로 합친다.
 *
 * ⚠ **ERA는 시즌 ERA의 평균이 아니다.** 자책점 합 × 9 ÷ 이닝 합이다.
 * 평균으로 내면 5이닝만 던진 시즌과 180이닝 시즌이 같은 무게를 갖는다 —
 * 데뷔 시즌이나 부상 시즌 하나가 통산 기록을 통째로 흔든다.
 *
 * ⚠ 이닝은 야구식 표기(0.1 = 1아웃)라 그냥 더하면 안 된다. 아웃으로
 * 환산해 더한 뒤 되돌린다 — `92.2 + 0.2`는 `92.4`가 아니라 `93.1`이다.
 */
export function careerSummaryOf(records: readonly CareerSeasonRecord[]): CareerSummary {
  let w = 0, l = 0, outs = 0, er = 0, seasons = 0;

  for (const r of records) {
    const st = r.stats;
    if (!st || st.type !== "pitcher") continue;
    seasons++;
    w += st.w ?? 0;
    l += st.l ?? 0;
    er += st.er ?? 0;
    outs += inningsToOuts(st.ip ?? 0);
  }

  const ip = outs / 3;
  return {
    w, l, seasons,
    era: ip > 0 ? (Math.round((er * 9 / ip) * 100) / 100).toFixed(2) : "",
  };
}

/** 야구식 이닝(6.2 = 6과 2/3)을 아웃 수로 */
export function inningsToOuts(ip: number): number {
  const whole = Math.floor(ip);
  // 소수부는 0·1·2만 유효하다. 부동소수 오차를 반올림으로 흡수한다
  const frac = Math.round((ip - whole) * 10);
  return whole * 3 + (frac >= 1 && frac <= 2 ? frac : 0);
}

/** 아웃 수를 야구식 이닝으로 되돌린다 (280아웃 → 93.1) */
export function outsToInnings(outs: number): number {
  return Math.floor(outs / 3) + (outs % 3) / 10;
}

// ── 은퇴 결산 (U9-d) ──────────────────────────────────────────────
//
// `careerSummaryOf`는 슬롯 목록 한 줄용이라 승·패·ERA뿐이고 **투수만 센다.**
// 은퇴 화면은 통산 전체가 필요하므로 여기서 넓힌다. 합산 규칙(이닝은 아웃으로,
// ERA는 비율의 평균이 아니라 합의 비율)은 위와 같은 것을 쓴다 — 두 벌로
// 만들면 같은 커리어가 화면마다 다른 숫자를 낸다.

export interface CareerTotals {
  seasons: number;
  /** 실제로 기록이 있는 첫 해·마지막 해 */
  firstYear: number | null;
  lastYear: number | null;
  pitching: {
    g: number; gs: number; w: number; l: number; sv: number; hd: number;
    /** 야구식 표기 (93.1 = 93과 1/3) */
    ip: number;
    er: number; h: number; k: number; bb: number;
    era: string; whip: string;
  } | null;
  batting: {
    g: number; pa: number; ab: number; h: number; hr: number;
    rbi: number; sb: number; bb: number; k: number;
    avg: string; obp: string; slg: string; ops: string;
  } | null;
}

// ⚠ **지역 구현을 지웠다** — 같은 일을 하는 함수가 셋이었다
//   (`fmt3` · `GameStatusModal.avg` · `PlayerDetailModal`의 인라인).
//   1 이상(장타율)에서 앞의 0을 잘못 떼는 갈래도 섞여 있었다.
const fmt3 = rateLabel;

export function careerTotalsOf(records: readonly CareerSeasonRecord[]): CareerTotals {
  let firstYear: number | null = null;
  let lastYear: number | null = null;
  for (const r of records) {
    if (firstYear == null || r.year < firstYear) firstYear = r.year;
    if (lastYear == null || r.year > lastYear) lastYear = r.year;
  }

  const p = { g: 0, gs: 0, w: 0, l: 0, sv: 0, hd: 0, outs: 0, er: 0, h: 0, k: 0, bb: 0 };
  const b = { g: 0, pa: 0, ab: 0, h: 0, hr: 0, rbi: 0, sb: 0, bb: 0, k: 0, tb: 0 };
  let anyP = false, anyB = false;

  for (const r of records) {
    const st = r.stats;
    if (!st) continue;
    if (st.type === "pitcher") {
      anyP = true;
      p.g += st.g ?? 0; p.gs += st.gs ?? 0;
      p.w += st.w ?? 0; p.l += st.l ?? 0;
      p.sv += st.sv ?? 0; p.hd += st.hd ?? 0;
      p.outs += inningsToOuts(st.ip ?? 0);
      p.er += st.er ?? 0; p.h += st.h ?? 0;
      p.k += st.k ?? 0; p.bb += st.bb ?? 0;
    } else if (st.type === "batter") {
      anyB = true;
      b.g += st.g ?? 0; b.pa += st.pa ?? 0; b.ab += st.ab ?? 0;
      b.h += st.h ?? 0; b.hr += st.hr ?? 0; b.rbi += st.rbi ?? 0;
      b.sb += st.sb ?? 0; b.bb += st.bb ?? 0; b.k += st.k ?? 0;
      // 시즌 장타율에서 루타를 되살린다 — 통산 SLG를 시즌 SLG의 평균으로
      // 내면 타석 수가 무시된다(400타석 시즌과 20타석 시즌이 같은 무게)
      b.tb += Math.round((st.slg ?? 0) * (st.ab ?? 0));
    }
  }

  const ipReal = p.outs / 3;
  return {
    seasons: records.length,
    firstYear, lastYear,
    pitching: anyP ? {
      g: p.g, gs: p.gs, w: p.w, l: p.l, sv: p.sv, hd: p.hd,
      ip: outsToInnings(p.outs),
      er: p.er, h: p.h, k: p.k, bb: p.bb,
      era:  ipReal > 0 ? (Math.round((p.er * 9 / ipReal) * 100) / 100).toFixed(2) : "-",
      whip: ipReal > 0 ? (Math.round(((p.bb + p.h) / ipReal) * 100) / 100).toFixed(2) : "-",
    } : null,
    batting: anyB ? {
      g: b.g, pa: b.pa, ab: b.ab, h: b.h, hr: b.hr,
      rbi: b.rbi, sb: b.sb, bb: b.bb, k: b.k,
      avg: b.ab > 0 ? fmt3(b.h / b.ab) : "-",
      obp: b.pa > 0 ? fmt3((b.h + b.bb) / b.pa) : "-",
      slg: b.ab > 0 ? fmt3(b.tb / b.ab) : "-",
      ops: b.ab > 0 && b.pa > 0 ? fmt3((b.h + b.bb) / b.pa + b.tb / b.ab) : "-",
    } : null,
  };
}

// ── 커리어 하이 ────────────────────────────────────────────────────

export interface CareerHigh {
  key: string;
  label: string;
  value: string;
  year: number;
}

interface HighSpec {
  key: string;
  label: string;
  /**
   * 그 시즌 레코드에서 값을 뽑는다. 해당 없으면 null.
   * **`stats`가 아니라 레코드 전체를 받는다** — OVR은 `stats` 밖에 있다.
   */
  pick: (r: CareerSeasonRecord) => number | null;
  /** 낮을수록 좋은 지표(ERA). 이쪽은 하한을 걸지 않는다 */
  lowerIsBetter?: boolean;
  /**
   * 이 값 미만이면 자랑거리가 아니다 — 0승을 "최다 승"으로 내걸지 않는다.
   * `lowerIsBetter`엔 안 쓴다(낮을수록 좋은 값에 하한은 뜻이 없다).
   */
  floor?: number;
  format: (v: number) => string;
}

/**
 * 커리어 하이. **`Record`가 아니라 목록인 이유**는 순서가 곧 화면 순서라서다.
 *
 * ⚠ 비율 지표(ERA·타율)는 표본이 충분한 시즌만 후보로 본다. 안 그러면 3이닝
 * 던지고 자책 0인 데뷔 시즌이 영원히 "최저 ERA 0.00"으로 박힌다.
 */
const MIN_IP_FOR_RATE = 30;
const MIN_AB_FOR_RATE = 100;

/**
 * ⚠ `r.stats`를 두 번 부르면 안 된다. `f(x)?.type === "pitcher" ? f(x)!.w : …`는
 * **좁히기가 두 번째 호출로 안 넘어간다** — 타입 검사가 `BatterSeasonStats`에도
 * `w`를 찾는다. 한 번 지역 변수에 담고 쓴다.
 */
const pitcherOf = (r: CareerSeasonRecord) => {
  const s = r.stats;
  return s?.type === "pitcher" ? s : null;
};
const batterOf = (r: CareerSeasonRecord) => {
  const s = r.stats;
  return s?.type === "batter" ? s : null;
};

const HIGHS: readonly HighSpec[] = [
  { key: "w",   label: "최다 승",     floor: 1, format: (v) => `${v}승`,
    pick: (r) => pitcherOf(r)?.w ?? null },
  { key: "k",   label: "최다 탈삼진", floor: 1, format: (v) => `${v}K`,
    pick: (r) => pitcherOf(r)?.k ?? null },
  { key: "sv",  label: "최다 세이브", floor: 1, format: (v) => `${v}SV`,
    pick: (r) => pitcherOf(r)?.sv ?? null },
  { key: "ip",  label: "최다 이닝",   floor: 1, format: (v) => `${v.toFixed(1)}이닝`,
    pick: (r) => pitcherOf(r)?.ip ?? null },
  { key: "era", label: "최저 ERA",    lowerIsBetter: true, format: (v) => v.toFixed(2),
    pick: (r) => {
      const s = pitcherOf(r);
      return s && (s.ip ?? 0) >= MIN_IP_FOR_RATE ? s.era ?? null : null;
    } },
  { key: "hr",  label: "최다 홈런",   floor: 1, format: (v) => `${v}홈런`,
    pick: (r) => batterOf(r)?.hr ?? null },
  { key: "rbi", label: "최다 타점",   floor: 1, format: (v) => `${v}타점`,
    pick: (r) => batterOf(r)?.rbi ?? null },
  { key: "avg", label: "최고 타율",   format: (v) => fmt3(v),
    pick: (r) => {
      const s = batterOf(r);
      return s && (s.ab ?? 0) >= MIN_AB_FOR_RATE ? s.avg ?? null : null;
    } },
  { key: "ovr", label: "최고 OVR",    floor: 1, format: (v) => String(v),
    pick: (r) => (typeof r.ovr === "number" && r.ovr > 0 ? r.ovr : null) },
];

export function careerHighsOf(records: readonly CareerSeasonRecord[]): CareerHigh[] {
  const out: CareerHigh[] = [];

  for (const spec of HIGHS) {
    let best: { v: number; year: number } | null = null;

    for (const r of records) {
      const v = spec.pick(r);
      if (v == null) continue;
      // 동률이면 **먼저 한 해**를 남긴다 — "처음 그랬던 해"가 이야기가 된다
      if (!best || (spec.lowerIsBetter ? v < best.v : v > best.v)) {
        best = { v, year: r.year };
      }
    }

    if (!best) continue;
    if (spec.floor != null && best.v < spec.floor) continue;
    out.push({ key: spec.key, label: spec.label, value: spec.format(best.v), year: best.year });
  }

  return out;
}

// ── 팀 이력 · 수상 · 우승 ──────────────────────────────────────────

export interface TeamStint {
  teamId: string;
  fromYear: number;
  toYear: number;
  seasons: number;
}

/**
 * 소속 이력을 연속 구간으로 묶는다. **같은 팀에 두 번 갔다 오면 구간도 둘이다** —
 * 합쳐 버리면 사이에 있던 이적이 사라진다.
 */
export function teamStintsOf(records: readonly CareerSeasonRecord[]): TeamStint[] {
  const sorted = [...records].sort((a, b) => a.year - b.year);
  const out: TeamStint[] = [];
  for (const r of sorted) {
    if (!r.teamId) continue;
    const last = out[out.length - 1];
    if (last && last.teamId === r.teamId && r.year === last.toYear + 1) {
      last.toYear = r.year;
      last.seasons++;
    } else if (last && last.teamId === r.teamId && r.year === last.toYear) {
      // 같은 해 레코드가 둘(승격 등) — 구간을 늘리지 않는다
    } else {
      out.push({ teamId: r.teamId, fromYear: r.year, toYear: r.year, seasons: 1 });
    }
  }
  return out;
}

export interface AwardTally {
  id: string;
  label: string;
  count: number;
  years: number[];
}

/** 수상을 종류별로 묶는다. 같은 상을 여러 번 받은 게 커리어의 무게다 */
export function awardTallyOf(records: readonly CareerSeasonRecord[]): AwardTally[] {
  const byId = new Map<string, AwardTally>();
  for (const r of [...records].sort((a, b) => a.year - b.year)) {
    for (const a of r.awards ?? []) {
      const cur = byId.get(a.id);
      if (cur) { cur.count++; cur.years.push(r.year); }
      else byId.set(a.id, { id: a.id, label: a.label, count: 1, years: [r.year] });
    }
  }
  return [...byId.values()].sort((x, y) => y.count - x.count || x.label.localeCompare(y.label));
}

/** 우승·준우승 횟수 */
export function titleCountOf(records: readonly CareerSeasonRecord[]): {
  champion: number; runnerUp: number; championYears: number[];
} {
  let champion = 0, runnerUp = 0;
  const championYears: number[] = [];
  for (const r of [...records].sort((a, b) => a.year - b.year)) {
    if (r.psResult === "champion") { champion++; championYears.push(r.year); }
    else if (r.psResult === "runnerUp") runnerUp++;
  }
  return { champion, runnerUp, championYears };
}
