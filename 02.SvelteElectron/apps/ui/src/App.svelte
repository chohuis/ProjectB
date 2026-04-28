<script lang="ts">
  import { onMount } from "svelte";
  import MainPage from "./pages/main/MainPage.svelte";
  import NewGamePage from "./pages/new-game/NewGamePage.svelte";
  import IntroScreen from "./features/intro/ui/IntroScreen.svelte";
  import { masterStore } from "./shared/stores/master";
  import { gameStore } from "./shared/stores/game";
  import { seasonStore } from "./shared/stores/season";

  type GamePhase = "loading" | "intro" | "create" | "playing";
  let phase: GamePhase = "loading";
  let hasSave = false;
  let continueLoading = false;
  let continueError = "";

  onMount(async () => {
    await masterStore.load();

    try {
      const saved = await window.projectB?.gameLoad?.();
      if (saved) {
        hasSave = true;
      }
    } catch {}

    phase = "intro";
  });

  async function handleContinue() {
    continueLoading = true;
    continueError = "";
    try {
      await gameStore.load();
      await seasonStore.load();
      phase = "playing";
    } catch {
      continueError = "저장 파일을 불러오지 못했습니다.";
    } finally {
      continueLoading = false;
    }
  }
</script>

{#if phase === "loading"}
  <div class="loading-screen">
    <p>로딩 중...</p>
  </div>
{:else if phase === "intro"}
  <IntroScreen
    {hasSave}
    loading={continueLoading}
    errorMsg={continueError}
    onNew={() => (phase = "create")}
    onContinue={handleContinue}
  />
{:else if phase === "create"}
  <NewGamePage onComplete={() => (phase = "playing")} />
{:else}
  <MainPage onSeasonEnd={() => (phase = "intro")} />
{/if}

<style>
  .loading-screen {
    width: 100vw;
    height: 100vh;
    background: #080f1e;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #5a7aa8;
    font-size: 16px;
  }
</style>
