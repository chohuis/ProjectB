<script lang="ts">
  import type { MeTabId } from "../../shared/types/main";
  import { t } from "../../shared/i18n";
  import { gameStore } from "../../shared/stores/game";
  import { visibleMeTabs, fallbackMeTab } from "../../shared/utils/navVisibility";
  import StatusPage from "../status/StatusPage.svelte";
  import TrainingPage from "../training/TrainingPage.svelte";
  import AcademicsPage from "../academics/AcademicsPage.svelte";
  import FinancePage from "../finance/FinancePage.svelte";
  import AchievementsPage from "../achievements/AchievementsPage.svelte";

  /**
   * C2 "나" — 상태·훈련·학업·재정·업적을 한 지붕 아래로. (사용자 확정: 탭 2단)
   *
   * ⚠ **하위 페이지 셋이 이미 자기 탭을 갖고 있다** (상태 3 · 훈련 3 · 재정 4).
   * 여기가 상위 한 줄을 그리고 그 아래 줄은 각 페이지가 그린다 — 두 줄이 한
   * 시스템으로 보이도록 하위 탭 막대도 같은 토큰(`.u-subtabs`)을 쓴다.
   *
   * 탭을 더 평탄화하면 한 줄에 10개가 되어 스캔이 안 되고, 반대로 더 겹치면
   * 3단이 된다. 2단이 이 화면 수에서 유일하게 성립하는 형태다.
   */

  export let tab: MeTabId = "status";

  const LABEL_KEY: Record<MeTabId, string> = {
    status:       "nav.status",
    training:     "nav.training",
    academics:    "nav.academics",
    finance:      "nav.finance",
    achievements: "nav.achievements",
  };

  $: p = $gameStore.protagonist;
  $: tabs = visibleMeTabs(p);

  // 보고 있던 탭이 단계 변화로 사라지면(졸업·은퇴) 빈 화면 대신 첫 탭으로 보낸다
  $: tab = fallbackMeTab(p, tab);

  function select(next: MeTabId) {
    tab = next;
    if (next === "achievements") gameStore.clearAchievementNotifications();
  }
</script>

<section class="me u-page">
  <nav class="tabs">
    {#each tabs as id (id)}
      <button class="tab" class:on={id === tab} type="button" on:click={() => select(id)}>
        {$t(LABEL_KEY[id])}
        {#if id === "achievements" && $gameStore.pendingAchievements.length > 0}
          <span class="dot" aria-label="새 업적"></span>
        {/if}
      </button>
    {/each}
  </nav>

  <div class="body">
    {#if tab === "status"}
      <StatusPage />
    {:else if tab === "training"}
      <TrainingPage />
    {:else if tab === "academics"}
      <AcademicsPage />
    {:else if tab === "finance"}
      <FinancePage />
    {:else if tab === "achievements"}
      <AchievementsPage />
    {/if}
  </div>
</section>

<style>
  .me {
    height: 100%;
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    border-radius: var(--radius);
    overflow: hidden;
  }

  /* 상위 줄 — 밑줄로 고른다. 하위 줄(각 페이지가 그림)은 알약이라
     같은 화면에 두 줄이 있어도 어느 쪽이 위인지 바로 읽힌다 */
  .tabs {
    display: flex;
    gap: 2px;
    padding: 0 12px;
    border-bottom: 2px solid var(--line);
    flex-shrink: 0;
  }

  .tab {
    position: relative;
    background: none;
    border: 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
    color: var(--ink-mute);
    font-size: 13.5px;
    font-weight: 700;
    padding: 11px 14px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tab:hover { color: var(--ink); }
  .tab.on { color: var(--t-dark); border-bottom-color: var(--t-dark); }

  .dot {
    display: inline-block;
    width: 5px; height: 5px;
    border-radius: 50%;
    background: var(--warn);
    vertical-align: 3px;
    margin-left: 5px;
  }

  .body {
    min-height: 0;
    overflow: hidden;
    padding: 12px;
  }
  .body > :global(*) { height: 100%; min-height: 0; }
</style>
