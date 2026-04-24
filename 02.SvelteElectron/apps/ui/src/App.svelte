<script lang="ts">
  import { onMount } from "svelte";
  import MainPage from "./pages/main/MainPage.svelte";
  import { masterStore } from "./shared/stores/master";
  import { gameStore } from "./shared/stores/game";

  onMount(async () => {
    // 마스터 데이터 로드 (fetch 기반, 병렬)
    void masterStore.load();

    // 세이브 파일 불러오기 (Electron 환경에서만)
    if (window.projectB?.gameLoad) {
      const saved = await window.projectB.gameLoad();
      if (saved) {
        gameStore.hydrate(saved as Parameters<typeof gameStore.hydrate>[0]);
      }
    }
  });
</script>

<MainPage />
