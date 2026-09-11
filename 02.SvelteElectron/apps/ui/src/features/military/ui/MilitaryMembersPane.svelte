<script lang="ts">
  import type {
    MilitaryLifeRules,
    MilitaryLifeState,
    MilitaryMember,
    MilitaryUnit,
  } from "../../../shared/types/militaryLife";
  import { rankBandOf } from "../../../shared/types/militaryLife";
  import { relationLabel } from "../../../shared/types/relationship";
  import { ARC_LABELS } from "../../../shared/utils/militaryLifeRules";
  import { MEMBER_ROLE_LABEL, RANK_LABELS, tagLabel } from "./militaryLabels";

  /** 부대원 (§32) — subunit 별 카드 · 재적 / 예정 / 전역(frozen) · 관계는 기존 7단계 라벨 · 주인공 카드는 자기 subunit 안 */
  export let ml: MilitaryLifeState;
  export let rules: MilitaryLifeRules;
  export let unit: MilitaryUnit;
  export let members: MilitaryMember[];
  export let week: number;

  type Status = "present" | "soon" | "gone";
  function statusOf(m: MilitaryMember): Status {
    if (m.joinWeek <= week && week < m.leaveWeek) return "present";
    return m.joinWeek > week ? "soon" : "gone";
  }
  const STATUS_LABEL: Record<Status, string> = { present: "재적", soon: "전입 예정", gone: "전역" };

  $: role = unit.roles.find((r) => r.id === ml.roleId) ?? null;
  $: mySubunit = role?.subunit ?? null;
  $: band = rankBandOf(week, rules.rankBandWeeks);
  $: myRank = week <= rules.bootCampWeeks ? "훈련병" : (RANK_LABELS[band] ?? "");
  $: myArc = ml.roleId
    ? ARC_LABELS[ml.roleId][Math.min(ml.arcStage, ARC_LABELS[ml.roleId].length - 1)]
    : "";
  // 소단위는 members.json 에 나온 순서 그대로 — 조직도 순서를 데이터가 정한다
  $: subunits = members.reduce<string[]>(
    (acc, m) => (acc.includes(m.subunit) ? acc : [...acc, m.subunit]),
    [],
  );
  $: counts = members.reduce<Record<Status, number>>(
    (acc, m) => {
      acc[statusOf(m)]++;
      return acc;
    },
    { present: 0, soon: 0, gone: 0 },
  );

  function relationOf(m: MilitaryMember): number | null {
    const v = ml.relations[m.id];
    if (v !== undefined) return v;
    const f = ml.frozen[m.id];
    return f !== undefined ? f : null;
  }
  function toneClass(tone: string): string {
    return tone === "friendly" || tone === "trusted" || tone === "close"
      ? "warm"
      : tone === "cold" || tone === "distrust" || tone === "hostile"
        ? "cold"
        : "";
  }
</script>

<p class="summary">재적 {counts.present} · 전입 예정 {counts.soon} · 전역 {counts.gone}</p>

<div class="org">
  {#if !mySubunit}
    <div class="sect">훈련소</div>
    <div class="mem me">
      <div class="nm">나 <small>{myRank}</small></div>
      <div class="rl">자대 배치 전 — 보직은 W{rules.bootCampWeeks + 1}에 정해진다</div>
    </div>
  {/if}
  {#each subunits as su (su)}
    <div class="sect">{su}{su === mySubunit ? " (내 소단위)" : ""}</div>
    {#if su === mySubunit}
      <div class="mem me">
        <div class="nm">나 <small>{role?.label ?? ""} · {myRank}</small></div>
        <div class="rl">{myArc}</div>
        <div class="rel"><span>복무 {week}/{rules.serviceWeeks}주</span><i>—</i></div>
      </div>
    {/if}
    {#each members.filter((m) => m.subunit === su) as m (m.id)}
      {@const st = statusOf(m)}
      {@const rel = relationOf(m)}
      {@const lab = rel === null ? null : relationLabel(rel)}
      <div class="mem" class:gone={st === "gone"} class:soon={st === "soon"}>
        <div class="nm">
          <span>{m.name || m.rank}</span>
          <small>
            {#if m.name}{m.rank} ·
            {/if}{st === "present"
              ? m.leaveWeek < rules.serviceWeeks
                ? `W${m.leaveWeek} 전역`
                : STATUS_LABEL[st]
              : st === "soon"
                ? `W${m.joinWeek} ${STATUS_LABEL[st]}`
                : `W${m.leaveWeek} ${STATUS_LABEL[st]}`}
          </small>
        </div>
        <div class="rl">{MEMBER_ROLE_LABEL[m.role]}{m.trait ? ` · ${m.trait}` : ""}</div>
        <div class="rel">
          <span>{m.tags.map(tagLabel).join(" · ") || "—"}</span>
          {#if lab && rel !== null}
            <i class={toneClass(lab.tone)}
              >{lab.label} {rel > 0 ? "+" : ""}{Math.round(rel)}{st === "gone" ? " · 얼림" : ""}</i
            >
          {:else}
            <i>—</i>
          {/if}
        </div>
      </div>
    {/each}
  {/each}
</div>
<p class="foot">
  관계는 기존 relations 축(−100~100)과 라벨 규칙을 그대로 쓴다. 매주 −{rules.relation.weeklyDecay} 감쇠.
  전역한 부대원은 관계를 얼려 두고 전역 뒤 재회에 쓴다.
</p>

<style>
  .summary {
    margin: 0 0 8px;
    color: var(--ink-mute);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .org {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: 8px;
  }
  .mem {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 9px 11px;
    display: grid;
    gap: 3px;
    font-size: 12px;
    color: var(--ink);
    min-width: 0;
  }
  .mem .nm {
    font-weight: 800;
    font-size: 13px;
    color: var(--ink);
    display: flex;
    justify-content: space-between;
    gap: 6px;
  }
  .mem .nm small {
    color: var(--ink-mute);
    font-weight: 600;
    text-align: right;
  }
  .mem .rl {
    color: var(--ink-mid);
  }
  .mem .rel {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
    font-variant-numeric: tabular-nums;
  }
  .mem .rel span {
    color: var(--ink-mute);
    font-size: 11.5px;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mem .rel i {
    font-style: normal;
    border-radius: var(--radius);
    padding: 1px 6px;
    font-size: 11px;
    font-weight: 700;
    background: var(--panel-sunk);
    color: var(--ink-mid);
    flex-shrink: 0;
  }
  .mem .rel i.warm {
    background: rgba(31, 122, 71, 0.12);
    color: var(--ok);
  }
  .mem .rel i.cold {
    color: var(--bad);
  }
  .mem.me {
    border-color: var(--t-accent);
  }
  .mem.gone,
  .mem.soon {
    opacity: 0.55;
  }
  .sect {
    grid-column: 1 / -1;
    font-size: 11.5px;
    font-weight: 700;
    color: var(--warn);
    letter-spacing: 0.04em;
    margin-top: 4px;
  }
  .foot {
    margin: 8px 0 0;
    color: var(--ink-mute);
    font-size: 11.5px;
    line-height: 1.5;
  }
</style>
