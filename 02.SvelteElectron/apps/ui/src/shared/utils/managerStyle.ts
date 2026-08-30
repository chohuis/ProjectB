/**
 * 감독 스타일 — 타순·번트·도루를 감독이 바꾼다.
 *
 * 🔴 **스타일 9종이 생성·저장되고 팀 상세에 표시까지 되는데 아무것도
 *   안 바꿨다.** `tacticalIQ`·`offenseMind`·`riskTolerance` 도 같이 죽어
 *   있었다 — 만들어서 저장만 하는 값 넷이다.
 *
 * ⚠ **보이는 값이 아무 효과가 없으면 플레이어가 먼저 알아챈다.**
 *   팀 상세에 "공격 지향"이라 떠 있는데 그 팀이 번트를 제일 많이 댔다.
 *
 * ⚠ 값은 `generation_rules.json` 의 `managerStyleRules` 가 정본이다 —
 *   여기에 표를 두 번 적지 않는다.
 */

export interface ManagerStyleEffect {
  /** 타순: 파워 가중(+면 장타 우선) */
  power: number;
  /** 타순: 발 가중 */
  speed: number;
  /** 타순: 수비 가중 */
  defense: number;
  /** 타순: 나이 가중(+면 노장 우선) */
  age: number;
  /** 타순 배치 잡음 — 클수록 최적에서 멀어진다 */
  noise: number;
  /** 희생번트 시도 배수 */
  buntMult: number;
  /** 도루 시도 배수 */
  stealMult: number;
  /** 투수 교체 판단 가산 (bullpenRead 에 얹는다) */
  bullpenBonus: number;
  /** 사기 가산 */
  moraleBonus: number;
}

export const NEUTRAL_STYLE: ManagerStyleEffect = {
  power: 0, speed: 0, defense: 0, age: 0, noise: 0,
  buntMult: 1, stealMult: 1, bullpenBonus: 0, moraleBonus: 0,
};

interface StyleRules {
  enabled?: boolean;
  styles?: Record<string, Partial<ManagerStyleEffect>>;
  tacticalNoiseSpan?: number;
  offenseMindSpan?: number;
  riskSpan?: number;
}

let RULES: StyleRules | null = null;

/** 부팅 때 한 번 읽어 둔다 — 다른 규칙들과 같은 방식이다 */
export function primeManagerStyleRules(r: unknown): void {
  RULES = (r ?? null) as StyleRules | null;
}

export function managerStyleRules(): StyleRules | null {
  return RULES;
}

/**
 * 그 감독의 효과를 낸다.
 *
 * ⚠ **스타일만으로는 안 된다.** 능력치가 늘 함께 돈다:
 *   `offenseMind` 는 파워 쪽 기울기, `tacticalIQ` 는 잡음,
 *   `riskTolerance` 는 번트·도루 배수다. 스타일은 그 위에 얹힌다.
 *
 * ⚠ 규칙이 없거나 꺼져 있으면 **중립**이다 — 예전과 똑같이 돈다.
 */
export function managerEffect(m: {
  style?: string | null;
  tacticalIQ?: number | null;
  offenseMind?: number | null;
  riskTolerance?: number | null;
} | null | undefined): ManagerStyleEffect {
  const r = RULES;
  if (!r?.enabled) return NEUTRAL_STYLE;

  const out: ManagerStyleEffect = { ...NEUTRAL_STYLE };
  const s = m?.style ? r.styles?.[m.style] : undefined;
  if (s) {
    for (const k of Object.keys(out) as Array<keyof ManagerStyleEffect>) {
      if (s[k] != null) out[k] = s[k] as number;
    }
  }

  // 능력치는 스타일과 별개로 늘 돈다 — 50이 기준이다
  const om = m?.offenseMind ?? 50;
  out.power += ((om - 50) / 50) * (r.offenseMindSpan ?? 0);

  // 전술 이해도가 낮을수록 타순이 흔들린다 (드래프트 스카우팅과 같은 형태)
  const tq = m?.tacticalIQ ?? 50;
  out.noise += ((100 - tq) / 100) * (r.tacticalNoiseSpan ?? 0);
  if (out.noise < 0) out.noise = 0;

  // 과감할수록 도루를 걸고 번트를 덜 댄다
  const rt = m?.riskTolerance ?? 50;
  const k = ((rt - 50) / 50) * (r.riskSpan ?? 0);
  out.stealMult *= 1 + k;
  out.buntMult  *= 1 - k;
  if (out.buntMult < 0) out.buntMult = 0;
  if (out.stealMult < 0) out.stealMult = 0;

  return out;
}

/**
 * 타순 점수에 스타일을 얹는다.
 *
 * ⚠ **잡음은 선수마다 고정이어야 한다** — 매번 다른 값이면 같은 팀이
 *   경기마다 타순을 새로 짠다. 씨앗은 선수 id + 팀이다.
 */
export function styleNoiseOf(playerId: string, teamId: string, span: number): number {
  if (span <= 0) return 0;
  let h = 2166136261;
  for (const str of [playerId, teamId]) {
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
  }
  return (((h % 2000) / 1000) - 1) * span;
}
