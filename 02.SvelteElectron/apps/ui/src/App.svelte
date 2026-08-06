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
  import { teamTokens, applyTeamTokens } from "./shared/utils/teamTheme";
  import { settingsStore } from "./shared/stores/settings";
  import { resolveTone, applyTone, systemPrefersDark } from "./shared/utils/theme";

  // ── 팀 색을 문서 루트에 바른다 ────────────────────────────────
  //
  // ⚠ **한 곳에서만 계산한다.** 컴포넌트가 각자 팀 색을 읽어 쓰면 이적 한 번에
  // 52개 화면을 다 고쳐야 한다. 이 디자인의 가치가 "소속팀이 바뀌면 화면이
  // 바뀐다"이고, 그건 CSS 변수가 최상위에 있을 때만 공짜로 얻어진다.
  //
  // 소속이 없는 화면(인트로·슬롯 선택·새 게임 1단계)은 폴백 색으로 돈다.
  $: myTeamId = $gameStore.protagonist?.teamId ?? "";
  $: myTeam = myTeamId ? ($masterStore.teams ?? []).find((t) => t.id === myTeamId) : undefined;

  // ── 테마 ──────────────────────────────────────────────────────
  //
  // ⚠ **팀 색이 톤에 딸려 있다.** 헤더 명도가 밝은 지면 L*26 / 어두운 지면
  // L*40이라(`teamTheme.ts`) 톤이 바뀌면 팀 토큰을 다시 발라야 한다.
  // 둘을 따로 두면 다크로 바꿨을 때 헤더만 옛 명도로 남는다.
  let systemDark = systemPrefersDark();
  onMount(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => (systemDark = mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  });

  $: tone = resolveTone($settingsStore.theme, systemDark);
  $: applyTone(tone);
  $: applyTeamTokens(teamTokens(myTeam?.colors, tone));

  type GamePhase = "loading" | "intro" | "slotSelect" | "create" | "playing";
  let phase: GamePhase = "loading";
  let hasSave = false;
  // 인트로의 "이어하기" 미리보기용 — 가장 최근에 저장한 슬롯
  let latestSlot: import("./shared/types/projectb.d").SaveSlotMeta | null = null;
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
      // ⚠ `updatedAt`은 문자열이라 사전순 비교로 최신을 고른다 —
      // ISO 형식이면 사전순 = 시간순이다
      latestSlot = slots.length
        ? [...slots].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0]
        : null;
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
    <p>불러오는 중</p>
  </div>
{:else if phase === "intro"}
  <IntroScreen
    {hasSave}
    latest={latestSlot}
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
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ink-mute);
    font-size: 13px;
    letter-spacing: 0.18em;
  }
</style>
