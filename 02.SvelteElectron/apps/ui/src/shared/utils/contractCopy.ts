/**
 * 계약 협상 문안 — **정본은 `resource/data/master/messages/contract_terms.json`이다** (B-13).
 *
 * 🔴 **코드에 문장을 적지 않는다.** 이 파일은 그 JSON 의 모양(타입)과 자리표
 * 채우기만 갖는다. 문장을 여기 한 벌 더 두면 한쪽만 고쳐진 채 남는다 —
 * `roleChoiceCopy.ts` 와 같은 규칙이고 같은 이유다.
 *
 * ⚠ **조사를 코드로 붙이지 않는다.** `{team}`·`{incentive}` 는 받침이 제각각이라
 * (파이러츠 / 라이온즈 · 25등판 / ERA 3.00 이하) 자리표를 줄 끝에 두거나 제목에만
 * 쓴다 — 파일의 `_josa` 가 같은 규칙을 못박아 뒀다.
 *
 * ⚠ **협상 화면이 지금 쓰는 문장은 셋뿐이다** — 최저연봉 안내 한 줄과 역제안
 * 회신 두 줄. 나머지(offer·signed·option·incentive)는 소식을 만드는 자리(C④·A)가
 * 붙을 때 쓴다. 타입은 그때 다시 안 짜도 되게 파일 전체를 담았다.
 */

export interface ContractTermsCopy {
  offer: {
    subject: string; head: string; salary: string;
    teamOption: string; playerOption: string; noTrade: string;
    rounds: string; roundsNone: string;
  };
  counter: {
    subject: string; accept: string; reject: string; revise: string;
    reason: Record<"goodRating" | "poorRating" | "ownerWarm" | "ownerCold" | "roundsOut", string>;
  };
  signed: {
    subject: string; head: string; headSafe: string; salary: string;
    signingBonus: string; teamOption: string; playerOption: string; noTrade: string;
    incentiveHead: string; incentiveLine: string; tail: string;
  };
  option: {
    subject: string; teamExercise: string; teamDecline: string;
    playerAsk: string; playerExercise: string; playerDecline: string;
  };
  incentive: {
    subject: string; met: string; missed: string; unmeasurable: string;
    total: string; none: string;
  };
  minSalary: { floor: string };
}

/** 자리표 — 파일의 `_placeholders` 와 같은 목록이다 */
export type ContractCopyVars = Partial<Record<
  "team" | "year" | "week" | "salary" | "years" | "bonus" | "total"
  | "actual" | "rounds" | "minSalary" | "optYears" | "incentive",
  string | number
>>;

/** `{key}` 를 갈아 끼운다. **없는 자리표는 그대로 둔다** — 조용히 빈칸이 되면 못 찾는다 */
export function fillContractCopy(tmpl: string, vars: ContractCopyVars): string {
  let out = tmpl;
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) continue;
    out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/**
 * JSON 한 덩어리를 타입으로 받는다. 모양이 어긋나면 `null` —
 * 호출부는 **문안 없이 문장을 짓지 않는다.** 안내 줄이 통째로 안 보일 뿐이다.
 */
export function parseContractTermsCopy(raw: unknown): ContractTermsCopy | null {
  const o = raw as ContractTermsCopy | null;
  if (!o || typeof o !== "object") return null;
  if (!o.offer || !o.counter || !o.signed || !o.option || !o.incentive || !o.minSalary) return null;

  const need = (v: unknown) => typeof v === "string" && v.length > 0;

  if (!need(o.offer.subject) || !need(o.offer.head) || !need(o.offer.salary)
      || !need(o.offer.teamOption) || !need(o.offer.playerOption) || !need(o.offer.noTrade)
      || !need(o.offer.rounds) || !need(o.offer.roundsNone)) return null;

  if (!need(o.counter.subject) || !need(o.counter.accept) || !need(o.counter.reject)
      || !need(o.counter.revise) || !o.counter.reason) return null;
  for (const k of ["goodRating", "poorRating", "ownerWarm", "ownerCold", "roundsOut"] as const) {
    if (!need(o.counter.reason[k])) return null;
  }

  if (!need(o.signed.subject) || !need(o.signed.head) || !need(o.signed.headSafe)
      || !need(o.signed.salary) || !need(o.signed.signingBonus) || !need(o.signed.teamOption)
      || !need(o.signed.playerOption) || !need(o.signed.noTrade) || !need(o.signed.incentiveHead)
      || !need(o.signed.incentiveLine) || !need(o.signed.tail)) return null;

  if (!need(o.option.subject) || !need(o.option.teamExercise) || !need(o.option.teamDecline)
      || !need(o.option.playerAsk) || !need(o.option.playerExercise)
      || !need(o.option.playerDecline)) return null;

  if (!need(o.incentive.subject) || !need(o.incentive.met) || !need(o.incentive.missed)
      || !need(o.incentive.unmeasurable) || !need(o.incentive.total)
      || !need(o.incentive.none)) return null;

  if (!need(o.minSalary.floor)) return null;
  return o;
}
