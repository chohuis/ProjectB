// ── 계약 이력 — 새 계약이 옛 계약의 자리를 받을 때 ────────────────
//
// `PLAN_MESSAGE_DASHBOARDS.md` §7-3·§7-4. 기록 탭의 「계약 이력」 카드가
// 읽는 자리를 만드는 **저장 한 줄**이다.
//
// 🔴 **엔진이 아니다.** 여기서 연봉을 정하거나 조건을 판정하지 않는다 —
//    이미 정해진 계약 객체를 받아 **옛 것을 뒤로 옮기고 새 것에 연도·종류를
//    찍는다.** 값은 하나도 안 만든다.
//
// ⚠ **왜 화면 쪽에서 하나** — 소식함은 흐르는 자리라 계약 완료 소식이
//   1500칸 상한에 밀려 사라진다(§8). 그때 「2031년에 3년 4억으로 재계약했다」가
//   게임 어디에도 안 남는다. 남길 자리가 세이브뿐이다.

import type { ProContract } from "../types/save";

/** 어떻게 맺었나 — 세이브에는 이 낱말이 들어가고 한글은 문안이 갖는다 */
export type ContractKind = NonNullable<ProContract["kind"]>;

export interface ContractStamp {
  /** 서명한 해. 모르면 안 찍는다 — 0 을 찍으면 「0년 계약」이 된다 */
  year?: number;
  kind?: ContractKind;
}

export interface ContractShift {
  /** 연도·종류를 찍은 새 계약 */
  contract: ProContract;
  /** 옛 계약이 뒤로 간 이력. **오래된 것이 앞이다** */
  history: ProContract[];
}

/**
 * 새 계약이 들어올 때 옛 계약을 이력으로 옮긴다.
 *
 * ⚠ **같은 계약을 두 번 안 쌓는다.** 재계약은 `setPendingNextContract` 로
 *   한 번, W52 롤오버가 `applyPendingNextContract` 로 또 한 번 같은 객체를
 *   현재 계약 자리에 넣는다 — 그때마다 밀면 이력에 같은 줄이 둘 생긴다.
 *   팀·연봉·기간·서명 연도가 다 같으면 같은 계약으로 본다.
 *
 * ⚠ **옛 계약이 없으면 이력이 안 늘어난다.** 첫 계약(입단)은 옮길 것이
 *   없다 — 그 계약은 지금 계약이라 「계약 정보」가 이미 그린다.
 *
 * ⚠ **구 세이브의 `undefined` 를 빈 배열로 바꾸지 않는다.** 옮길 옛 계약이
 *   없으면 `history` 는 들어온 것 그대로다.
 */
export function shiftContract(
  prev: ProContract | undefined,
  next: ProContract,
  stamp: ContractStamp = {},
  history: ProContract[] | undefined = undefined,
): ContractShift {
  const contract: ProContract = { ...next };
  if (stamp.year != null && contract.signedYear == null) contract.signedYear = stamp.year;
  if (stamp.kind && !contract.kind) contract.kind = stamp.kind;

  if (!prev) return { contract, history: history ?? [] };
  const kept = history ?? [];
  if (sameContract(prev, next) || kept.some((c) => sameContract(c, prev))) {
    return { contract, history: kept };
  }
  return { contract, history: [...kept, prev] };
}

/**
 * 같은 계약인가 — **id 가 없어서 값으로 본다.**
 *
 * 🔴 `ProContract` 에 식별자가 없다. 팀을 옮기지 않은 재계약은 팀만으로는
 *    못 가르므로 연봉·기간·서명 연도까지 같이 본다. `remainingYears` 는
 *    시즌마다 줄어드는 값이라 **안 본다** — 그걸 보면 같은 계약이 해마다
 *    다른 계약으로 보인다.
 */
export function sameContract(a: ProContract, b: ProContract): boolean {
  return (
    a.teamId === b.teamId &&
    a.salary === b.salary &&
    a.durationYears === b.durationYears &&
    a.signingBonus === b.signingBonus &&
    (a.signedYear ?? null) === (b.signedYear ?? null)
  );
}
