<script lang="ts">
  import { mockMainSnapshot } from "../../app/mockMain";
  import type { MainTabId } from "../../shared/types/main";
  import SidebarNav from "../../features/navigation/ui/SidebarNav.svelte";
  import TopHeader from "../../features/main-layout/ui/TopHeader.svelte";
  import HomeDashboard from "../../features/dashboard/ui/HomeDashboard.svelte";
  import RightPanel from "../../features/main-layout/ui/RightPanel.svelte";
  import StatusPage from "../status/StatusPage.svelte";
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
        <div class="tab-content">
          {#if currentTab === "home"}
            <HomeDashboard
              morale={mockMainSnapshot.morale}
              fatigue={mockMainSnapshot.fatigue}
              upcoming={mockMainSnapshot.upcoming}
            />
          {:else if currentTab === "status"}
            <StatusPage />
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
        </div>
      </main>

      <RightPanel logs={mockMainSnapshot.logs} />
    </div>
  </div>
{/if}

<style>
  .layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
    padding: 10px;
    height: 100%;
    overflow: hidden;
  }

  .body {
    display: grid;
    grid-template-columns: 170px minmax(0, 1fr) 220px;
    gap: 10px;
    align-items: stretch;
    min-height: 0;
    overflow: hidden;
  }

  main {
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .tab-content {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .tab-content > :global(*) {
    min-height: 0;
  }

  .placeholder {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
    height: 100%;
  }

  @media (max-width: 1280px) {
    .body {
      grid-template-columns: 154px minmax(0, 1fr) 196px;
    }
  }
</style>
