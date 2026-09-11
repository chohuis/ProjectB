import type { StaffMods } from "./staffEffects";

/**
 * 주인공 **영구 특성** (PLAN_EVENT_TIERS §5 `trait`).
 *
 * 🔴 **새 산식을 만들지 않는다.** 특성은 `StaffMods` 축에 곱해져 코치·구단
 *   시설과 **같은 자리**로 들어간다 — 그래야 「특성이 얼마나 세나」를 이미
 *   있는 계측(`measure:training` · 부상 계측)으로 그대로 잴 수 있다.
 *   따로 산식을 두면 그게 곧 두 번째 정본이고, 이 저장소가 반복해 겪은 형태다.
 *
 * ⚠ **정의는 `resource/data/master/traits/protagonist.json` 하나다.**
 *   여기 표를 적지 않는다.
 */

export interface TraitDef {
  id: string;
  name: string;
  desc?: string;
  /** `StaffMods` 축 → 곱할 값 */
  mods: Partial<Record<keyof StaffMods, number>>;
}

let _defs: readonly TraitDef[] = [];

/**
 * 마스터 로드가 한 번 불러 준다.
 *
 * ⚠ **못 읽으면 빈 표다** — 특성을 받아도 아무 계수가 안 붙는다. 그게 조용해서
 *   `check:effectkeys` 가 「데이터가 가리키는 id 가 표에 있나」를 본다.
 */
export function primeProtagonistTraits(raw: unknown): void {
  const list = (raw as { traits?: unknown })?.traits;
  if (!Array.isArray(list)) {
    _defs = [];
    return;
  }
  _defs = list
    .filter(
      (t): t is TraitDef =>
        !!t && typeof t.id === "string" && !!t.mods && typeof t.mods === "object",
    )
    .map((t) => ({ id: t.id, name: String(t.name ?? t.id), desc: t.desc, mods: t.mods }));
}

export function traitDefs(): readonly TraitDef[] {
  return _defs;
}

export function traitDefOf(id: string): TraitDef | undefined {
  return _defs.find((t) => t.id === id);
}

/**
 * 갖고 있는 특성을 계수에 곱한다.
 *
 * ⚠ **모르는 id 는 조용히 넘긴다** — 세이브에 남은 옛 특성이 로드를 막으면
 *   안 된다. 데이터 쪽 어긋남은 `check:effectkeys` 가 잡는다.
 * ⚠ 여럿이면 **곱한다.** 더하면 두 개짜리가 세 개짜리를 이기는 자리가 생긴다.
 */
export function applyTraitMods(mods: StaffMods, traits: readonly string[] | undefined): StaffMods {
  if (!traits || traits.length === 0) return mods;
  const out = { ...mods };
  for (const id of traits) {
    const d = traitDefOf(id);
    if (!d) continue;
    for (const [axis, mult] of Object.entries(d.mods)) {
      if (typeof mult !== "number" || !Number.isFinite(mult)) continue;
      const k = axis as keyof StaffMods;
      out[k] = (out[k] ?? 1) * mult;
    }
  }
  return out;
}
