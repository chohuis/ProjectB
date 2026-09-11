<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { masterStore } from "../../shared/stores/master";
  import MilitaryStatusPanel from "../../features/military/ui/MilitaryStatusPanel.svelte";
  import MilitaryHead from "../../features/military/ui/MilitaryHead.svelte";
  import MilitaryDailyPane from "../../features/military/ui/MilitaryDailyPane.svelte";
  import MilitaryMembersPane from "../../features/military/ui/MilitaryMembersPane.svelte";
  import MilitaryCalendarPane from "../../features/military/ui/MilitaryCalendarPane.svelte";
  import MilitaryCareerPane from "../../features/military/ui/MilitaryCareerPane.svelte";
  import SportsUnitPane from "../../features/military/ui/SportsUnitPane.svelte";
  import { SERVICE_WEEKS } from "../../shared/usecases/militaryDecision";

  /**
   * 「병역」 상위 탭 (PLAN_MILITARY_LIFE §22 · §32 · 목업 그대로) — 2단 넷: 일과 · 부대원 · 캘린더 · 경력.
   *
   * 탭의 유무는 `careerStage` 하나가 정한다(navVisibility). 안의 갈래 키는 `militaryUnit === "sports"` 하나다(§39):
   *   현역(militaryLife 있음)  머리 + 2단 넷
   *   상무(체육부대)            SportsUnitPane 한 장 — 전역 카운트 · 성적 없음 · 부대 일정 · 부대 소식 (§39)
   *   데이터 없는 옛 세이브      옛 MilitaryStatusPanel + 한 줄
   *
   * 🔴 **상무엔 2단이 없다** (사용자 결정 2026-09-03 · 복무 중엔 보직을 안 묻고 경기가 없다).
   *   일과(보직 카드)·부대원(현역 members.json)은 상무에 주인이 없다 — 빈 카드를 그리는 대신 안 그린다.
   *
   * ⚠ 여기는 화면이다 — 값은 `rules.json`(masterStore.militaryLifeRules)에서 읽고 상태는 `protagonist.militaryLife` 만 본다.
   *   숫자를 코드에 적지 않는다. 주간 계산은 usecases/militaryLife.ts(Rust) 가 한다.
   */
  type MilitaryTabId = "daily" | "members" | "calendar" | "career";
  const TABS: Array<{ id: MilitaryTabId; label: string }> = [
    { id: "daily", label: "일과" },
    { id: "members", label: "부대원" },
    { id: "calendar", label: "캘린더" },
    { id: "career", label: "경력" },
  ];
  let tab: MilitaryTabId = "daily";

  $: p = $gameStore.protagonist;
  $: ml = p.militaryLife ?? null;
  $: rules = $masterStore.militaryLifeRules;
  $: unit = $masterStore.militaryUnit;
  $: isSports = p.militaryUnit === "sports";
  $: ready = !isSports && !!ml && !!rules && !!unit;
  // 상무는 문안이 있어야 그린다 — 없으면 옛 배너로 떨어진다(militarySportsCopy.ts 머리말)
  $: sportsCopy = $masterStore.militarySportsCopy;
  $: sportsReady = isSports && !!sportsCopy;
</script>

<section class="military">
  {#if ready && ml && rules && unit}
    <MilitaryHead
      {ml}
      {rules}
      {unit}
      calendar={$masterStore.militaryCalendar}
      week={p.militaryServiceWeeks}
    />

    <div class="subtabs" role="tablist" aria-label="병역">
      {#each TABS as x (x.id)}
        <button
          type="button"
          role="tab"
          class:on={tab === x.id}
          aria-selected={tab === x.id}
          on:click={() => (tab = x.id)}>{x.label}</button
        >
      {/each}
    </div>

    <div class="pane">
      {#if tab === "daily"}
        <MilitaryDailyPane
          {ml}
          {rules}
          {unit}
          members={$masterStore.militaryMembers}
          calendar={$masterStore.militaryCalendar}
          week={p.militaryServiceWeeks}
          fatigue={p.fatigue}
          morale={p.morale}
          mailbox={$gameStore.mailbox}
        />
      {:else if tab === "members"}
        <MilitaryMembersPane
          {ml}
          {rules}
          {unit}
          members={$masterStore.militaryMembers}
          week={p.militaryServiceWeeks}
        />
      {:else if tab === "calendar"}
        <MilitaryCalendarPane
          {ml}
          {rules}
          calendar={$masterStore.militaryCalendar}
          events={$masterStore.militaryLifeEvents}
          week={p.militaryServiceWeeks}
        />
      {:else if tab === "career"}
        <MilitaryCareerPane {ml} {rules} {unit} members={$masterStore.militaryMembers} />
      {/if}
    </div>
  {:else if sportsReady && sportsCopy}
    <!-- 상무 — 같은 탭, 다른 안 (§39). 2단이 없고 한 장이다 -->
    <SportsUnitPane
      copy={sportsCopy}
      {rules}
      calendar={$masterStore.militaryCalendar}
      mailbox={$gameStore.mailbox}
      week={p.militaryServiceWeeks}
      total={rules?.serviceWeeks ?? SERVICE_WEEKS}
      dischargeYear={p.militaryDischargeYear ?? null}
      enlistWeek={p.militaryEnlistWeek ?? null}
      condition={p.condition}
      fatigue={p.fatigue}
      morale={p.morale}
    />
  {:else}
    <!-- 문안·데이터가 없는 갈래 — 옛 배너를 그대로 머리에 둔다 -->
    <MilitaryStatusPanel />
    <p class="note">
      {#if isSports}
        체육부대 문안이 없다 — <code>messages/military_sports.json</code> 을 못 읽었다(§39 · 화면 대신
        옛 배너로 떨어진다).
      {:else}
        병영생활 데이터가 없다 — 이 세이브는 옛 갈래로 복무한다(입대 전 세이브이거나 <code
          >military/*.json</code
        >
        이 비었다 · <code>npm run check:militarydata</code>).
      {/if}
    </p>
  {/if}
</section>

<style>
  .military {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  /* 상위는 밑줄 — 하위 페이지의 알약(.u-subtabs)과 형태로 갈린다 (목업 그대로) */
  .subtabs {
    display: flex;
    gap: 2px;
    border-bottom: 1px solid var(--line-strong);
  }
  .subtabs button {
    border: 0;
    background: none;
    font: inherit;
    font-size: 13px;
    padding: 8px 12px;
    color: var(--ink-mid);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    margin-bottom: -1px;
  }
  .subtabs button.on {
    color: var(--t-dark);
    font-weight: 800;
    border-bottom-color: var(--t-accent);
  }
  .subtabs button:focus-visible {
    outline: 2px solid var(--t-accent);
    outline-offset: -2px;
  }
  .pane {
    min-width: 0;
  }
  .note {
    margin: 0;
    color: var(--ink-mute);
    font-size: 12px;
    line-height: 1.5;
  }
  .note code {
    font-family: ui-monospace, Consolas, monospace;
    font-size: 11px;
    background: var(--panel-sunk);
    padding: 0 4px;
    border-radius: 2px;
  }
</style>
