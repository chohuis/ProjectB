<script lang="ts">
  import { mockMainSnapshot } from "../../app/mockMain";
  import type { MainTabId } from "../../shared/types/main";
  import SidebarNav from "../../features/navigation/ui/SidebarNav.svelte";
  import TopHeader from "../../features/main-layout/ui/TopHeader.svelte";
  import HomeDashboard from "../../features/dashboard/ui/HomeDashboard.svelte";
  import RightPanel from "../../features/main-layout/ui/RightPanel.svelte";

  let currentTab: MainTabId = "home";
</script>

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
      {:else}
        <section class="placeholder">{currentTab} 화면 준비 중</section>
      {/if}
    </main>

    <RightPanel logs={mockMainSnapshot.logs} />
  </div>
</div>

<style>
  .layout {
    display: grid;
    gap: 12px;
    padding: 16px;
  }

  .body {
    display: grid;
    grid-template-columns: 200px 1fr 320px;
    gap: 12px;
  }

  .placeholder {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 14px;
    min-height: 300px;
  }
</style>

