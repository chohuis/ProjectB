<script lang="ts">
  import { onMount } from "svelte";
  import MainPage from "./pages/main/MainPage.svelte";
  import NewGamePage from "./pages/new-game/NewGamePage.svelte";
  import IntroScreen from "./features/intro/ui/IntroScreen.svelte";
  import SaveSlotScreen from "./features/save-slots/ui/SaveSlotScreen.svelte";
  import { get } from "svelte/store";
  import { masterStore } from "./shared/stores/master";
  import { gameStore } from "./shared/stores/game";
  import { seasonStore } from "./shared/stores/season";
  import { npcLiveStatsStore } from "./shared/stores/npcLiveStats";
  import { listSlotsV3, loadGameV3 } from "./shared/repo/slotLifecycleV3";

  type GamePhase = "loading" | "intro" | "slotSelect" | "create" | "playing";
  let phase: GamePhase = "loading";
  let hasSave = false;
  let loadError = "";

  onMount(async () => {
    await masterStore.load();
    masterStore.setupContentWatcher();
    // gameStore.npcs 또는 npcLiveStats 변경 시 masterStore.entities 자동 재생성
    masterStore.connectToGameStore(
      (fn) => gameStore.subscribe(s => fn({ npcs: s.npcs })),
      npcLiveStatsStore.subscribe,
    );
    gameStore.initProTeamProfiles(get(masterStore).teams ?? []);

    try {
      // v3 슬롯만 목록 (클린 브레이크 — 구 세이브는 새 구조에서 미지원)
      const slots = await listSlotsV3();
      hasSave = slots.length > 0;
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
      // 이어하기: v3 슬롯 로드 (R3a-4 — 구 세이브는 클린 브레이크로 미지원)
      try {
        const ok = await loadGameV3(slotId);
        if (!ok) throw new Error("v3 슬롯 아님");
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
