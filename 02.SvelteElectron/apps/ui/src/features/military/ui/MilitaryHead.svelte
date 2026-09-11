<script lang="ts">
  import type {
    MilitaryCalendarEntry,
    MilitaryLifeRules,
    MilitaryLifeState,
    MilitaryUnit,
  } from "../../../shared/types/militaryLife";
  import { rankBandOf } from "../../../shared/types/militaryLife";
  import { ARC_LABELS } from "../../../shared/utils/militaryLifeRules";
  import { RANK_LABELS } from "./militaryLabels";

  /** 병역 탭 머리 (§32) — 부대 · 보직 · 계급 · 복무 N/총 · 다음 캘린더 사건. 옛 MilitaryStatusPanel 이 여기로 옮겨 왔다 */
  export let ml: MilitaryLifeState;
  export let rules: MilitaryLifeRules;
  export let unit: MilitaryUnit;
  export let calendar: MilitaryCalendarEntry[];
  export let week: number;

  $: total = rules.serviceWeeks;
  $: bootCamp = week <= rules.bootCampWeeks;
  $: band = rankBandOf(week, rules.rankBandWeeks);
  $: role = unit.roles.find((r) => r.id === ml.roleId) ?? null;
  $: roleLabel = role ? role.label : "훈련병";
  $: arcLabel =
    ml.roleId && role
      ? ARC_LABELS[ml.roleId][Math.min(ml.arcStage, ARC_LABELS[ml.roleId].length - 1)]
      : "";
  $: rankLabel = bootCamp ? "훈련병" : (RANK_LABELS[band] ?? RANK_LABELS[RANK_LABELS.length - 1]);
  $: pct = Math.max(0, Math.min(100, Math.round((week / total) * 100)));
  // 보직 전용(role) 사건은 내 보직만 — calendarEntryFor 와 같은 규칙
  $: next =
    calendar
      .filter(
        (c) => c.week > week && (c.role === undefined || c.role === null || c.role === ml.roleId),
      )
      .sort((a, b) => a.week - b.week)[0] ?? null;
</script>

<header class="head">
  <div class="who">
    <h1>{unit.name}</h1>
    <div class="sub">
      <span class="chip">{unit.location}</span>
      <!-- 훈련소에선 보직이 없다 — 계급 칩 하나("훈련병")만 · 둘 다 그리면 같은 말이 두 번 나온다 -->
      {#if role}
        <span class="chip"
          >{roleLabel}{arcLabel && arcLabel !== roleLabel ? ` · ${arcLabel}` : ""}</span
        >
      {/if}
      <span class="chip">{rankLabel}</span>
      {#if role}
        <span class="meta">일과 강도 {role.dutyIntensity} · 공 접근 {role.ballAccess}</span>
      {:else}
        <span class="meta">보직은 자대 배치 뒤에 정해진다</span>
      {/if}
    </div>
  </div>
  <div class="svc">
    <div class="big">{week}<small> / {total}주</small></div>
    {#if next}
      <div class="next">다음 사건 — W{next.week} {next.label} · {next.week - week}주 뒤</div>
    {:else}
      <div class="next">남은 캘린더 사건 없음</div>
    {/if}
  </div>
  <div
    class="bar"
    role="progressbar"
    aria-valuemin="0"
    aria-valuemax={total}
    aria-valuenow={week}
    aria-label="복무 진행 {pct}%"
  >
    <i style="width:{pct}%"></i>
  </div>
</header>

<style>
  .head {
    background: var(--panel);
    border: 1px solid var(--line);
    border-left: 4px solid var(--mil, #4b5a3a);
    border-radius: var(--radius);
    padding: 12px 14px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 16px;
    align-items: center;
    color: var(--ink);
  }
  .who {
    min-width: 0;
  }
  h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 800;
    color: var(--t-dark);
    letter-spacing: -0.01em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .sub {
    color: var(--ink-mid);
    font-size: 12.5px;
    margin-top: 4px;
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;
  }
  .chip {
    display: inline-block;
    background: var(--panel-sunk);
    color: var(--ink-mid);
    border-radius: var(--radius);
    padding: 1px 7px;
    font-weight: 700;
    font-size: 11.5px;
  }
  .meta {
    color: var(--ink-mute);
    font-size: 11.5px;
    margin-left: 4px;
  }
  .svc {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .svc .big {
    font-size: 22px;
    font-weight: 800;
    color: var(--t-dark);
    line-height: 1.1;
  }
  .svc .big small {
    font-size: 12px;
    color: var(--ink-mute);
    font-weight: 600;
  }
  .svc .next {
    color: var(--warn);
    font-weight: 700;
    font-size: 12px;
    margin-top: 3px;
  }
  .bar {
    height: 6px;
    background: var(--panel-sunk);
    border-radius: 3px;
    overflow: hidden;
    grid-column: 1 / -1;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--ok);
  }
  @media (max-width: 720px) {
    .head {
      grid-template-columns: 1fr;
    }
    .svc {
      text-align: left;
    }
  }
</style>
