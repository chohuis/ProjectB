<script lang="ts">
  import { onMount } from "svelte";
  import MainPage from "./pages/main/MainPage.svelte";
  import NewGamePage from "./pages/new-game/NewGamePage.svelte";
  import IntroScreen from "./features/intro/ui/IntroScreen.svelte";
  import SaveSlotScreen from "./features/save-slots/ui/SaveSlotScreen.svelte";
  import { masterStore } from "./shared/stores/master";
  import { gameStore } from "./shared/stores/game";
  import { seasonStore } from "./shared/stores/season";

  type GamePhase = "loading" | "intro" | "slotSelect" | "create" | "playing";
  let phase: GamePhase = "loading";
  let hasSave = false;
  let loadError = "";

  onMount(async () => {
    await masterStore.load();
    masterStore.setupContentWatcher();

    try {
      const slots = await window.projectB?.listSlots?.();
      hasSave = (slots?.length ?? 0) > 0;
    } catch {}

    phase = "intro";
  });

  async function handleSlotSelect(slotId: string, isEmpty: boolean) {
    loadError = "";
    if (isEmpty) {
      // 새 게임: slotId 예약 후 캐릭터 생성으로
      gameStore.setCurrentSlotId(slotId);
      phase = "create";
    } else {
      // 이어하기: 슬롯 데이터 로드
      try {
        const envelope = await window.projectB?.loadSlot?.(slotId);
        if (!envelope) throw new Error("슬롯 데이터 없음");
        if (envelope.game)   gameStore.hydrateFromSlot(envelope.game, slotId);
        else                 gameStore.setCurrentSlotId(slotId);
        if (envelope.season) {
          seasonStore.hydrateFromSlot(envelope.season);
          // npcLiveStats → masterStore.entities 동기화 (월간 성장 반영)
          masterStore.applyNpcLiveStats(envelope.season.npcLiveStats ?? {});
        }
        phase = "playing";
      } catch (e) {
        loadError = "저장 파일을 불러오지 못했습니다.";
      }
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
    onNew={() => (phase = "slotSelect")}
    onContinue={() => (phase = "slotSelect")}
  />
{:else if phase === "slotSelect"}
  <SaveSlotScreen
    onSelect={handleSlotSelect}
    onBack={() => (phase = "intro")}
  />
  {#if loadError}
    <div class="load-error">{loadError}</div>
  {/if}
{:else if phase === "create"}
  <NewGamePage onComplete={() => (phase = "playing")} />
{:else}
  <MainPage onSeasonEnd={() => (phase = "intro")} />
{/if}

<style>
  .load-error {
    position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
    background: #2a1010; border: 1px solid #8a3030;
    color: #e07070; font-size: 13px; padding: 10px 20px;
    border-radius: 8px; z-index: 200;
  }
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
