<script lang="ts">
  import { mockMainSnapshot } from "../../app/mockMain";
  import type { MainTabId } from "../../shared/types/main";
  import SidebarNav from "../../features/navigation/ui/SidebarNav.svelte";
  import TopHeader from "../../features/main-layout/ui/TopHeader.svelte";
  import HomeDashboard from "../../features/dashboard/ui/HomeDashboard.svelte";
  import RightPanel from "../../features/main-layout/ui/RightPanel.svelte";
  import RosterPage from "../roster/RosterPage.svelte";
  import SchedulePage from "../schedule/SchedulePage.svelte";
  import TrainingPage from "../training/TrainingPage.svelte";
  import FinancePage from "../finance/FinancePage.svelte";
  import TestMatchPage from "../test/TestMatchPage.svelte";
  import RecordsPage from "../records/RecordsPage.svelte";
  import MessagesPage from "../messages/MessagesPage.svelte";
  import TeamPage from "../team/TeamPage.svelte";

  let currentTab: MainTabId = "home";

  function closeMatchEngine() {
    currentTab = "home";
  }
</script>

{#if currentTab === "test"}
  <TestMatchPage onExit={closeMatchEngine} />
{:else}
  <div class="layout">
    <TopHeader
      dayLabel={mockMainSnapshot.dayLabel}
      teamName={mockMainSnapshot.teamName}
      playerName={mockMainSnapshot.playerName}
    />

    <div class="body">
      <SidebarNav {currentTab} onSelectTab={(tab) => (currentTab = tab)} />

      <main>
        {#if currentTab === "home"}
          <HomeDashboard
            morale={mockMainSnapshot.morale}
            fatigue={mockMainSnapshot.fatigue}
            upcoming={mockMainSnapshot.upcoming}
          />
        {:else if currentTab === "roster"}
          <RosterPage />
        {:else if currentTab === "schedule"}
          <SchedulePage />
        {:else if currentTab === "training"}
          <TrainingPage />
        {:else if currentTab === "finance"}
          <FinancePage />
        {:else if currentTab === "records"}
          <RecordsPage />
        {:else if currentTab === "messages"}
          <MessagesPage />
        {:else if currentTab === "team"}
          <TeamPage />
        {:else}
          <section class="placeholder">{currentTab} 화면 준비 중</section>
        {/if}
      </main>

      <RightPanel logs={mockMainSnapshot.logs} />
    </div>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .body {
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr) 320px;
    gap: 12px;
    align-items: start;
  }

  main {
    min-width: 0;
  }

  .placeholder {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
    min-height: 300px;
  }

  @media (max-width: 1280px) {
    .body {
      grid-template-columns: 180px minmax(0, 1fr) 280px;
    }
  }
</style>
