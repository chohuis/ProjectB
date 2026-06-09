<script lang="ts">
  import { onMount } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore } from "../../../shared/stores/master";
  import UniversityApplyModal from "./UniversityApplyModal.svelte";
  import IndependentApplyModal from "./IndependentApplyModal.svelte";

  let resolving = false;
  let draftChecked = false;
  let universityChecked = false;
  let independentChecked = false;

  $: isIndependent = $gameStore.protagonist.careerStage === "independent";
  let universityChoices: string[] = [];
  let independentChoices: string[] = [];
  let universityModalOpen = false;
  let independentModalOpen = false;

  function teamName(teamId: string): string {
    return $masterStore.teams.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function setupDefaults() {
    const apps = $gameStore.schoolState.careerApplications;
    draftChecked = apps?.draftApplied ?? false;
    universityChoices = apps?.universityChoices ? [...apps.universityChoices] : [];
    independentChoices = apps?.independentChoices ? [...apps.independentChoices] : [];
    universityChecked = universityChoices.length > 0;
    independentChecked = independentChoices.length > 0;
  }
  $: setupDefaults();

  async function persistHubState() {
    gameStore.setCareerChoiceUiState({ popupOpened: true, mode: "none", confirmed: false });
    gameStore.setCareerApplications({
      draftApplied: draftChecked,
      universityChoices: universityChoices.slice(0, 3),
      independentChoices: independentChoices.slice(0, 3),
      sportsMilitaryApplied: false,
    });
    await gameStore.save();
  }

  onMount(() => {
    persistHubState();
  });

  function onClickDraftApply() {
    draftChecked = !draftChecked;
    if (draftChecked) {
      alert("드래프트 참가 신청이 완료되었습니다. W51주차에 참가 여부 메시지가 도착합니다.");
    }
  }

  async function chooseMilitaryNow() {
    if (resolving) return;
    if (!confirm("바로 입대하시겠습니까? 기존 신청은 모두 무시됩니다.")) return;
    resolving = true;
    gameStore.enlistMilitary("general");
    gameStore.setCareerApplicationsSubmitted(false);
    gameStore.clearCareerResults();
    gameStore.setCareerChoiceUiState({ popupOpened: false, mode: "none", confirmed: true });
    seasonStore.resolvePendingAction("careerChoiceHub");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }

  async function submitApplications() {
    if (resolving) return;
    const hasAny = draftChecked || universityChecked || independentChecked || isIndependent;
    if (!hasAny) return;
    resolving = true;
    gameStore.setCareerApplications({
      draftApplied: draftChecked,
      universityChoices: universityChoices.slice(0, 3),
      independentChoices: independentChoices.slice(0, 3),
      sportsMilitaryApplied: false,
    });
    gameStore.setCareerApplicationsSubmitted(true);
    gameStore.markCareerChoiceTriggered();
    gameStore.setCareerChoiceUiState({ popupOpened: false, mode: "none", confirmed: true });
    seasonStore.resolvePendingAction("careerChoiceHub");
    await gameStore.save();
    await seasonStore.save();
    resolving = false;
  }
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="chip">진로 결정</span>
      <h2>W50 진로 신청 허브</h2>
    </div>
    <p class="body-text">
      {isIndependent ? "KBL 드래프트에 신청하세요. 미신청 시 독립리그를 계속합니다." : "각 진로 페이지를 확인하고 체크한 뒤 신청 완료를 눌러 다음 주로 진행하세요."}
    </p>

    <div class="options">
      <button class="opt-btn" type="button" on:click={onClickDraftApply}>
        <span class="opt-label">드래프트 참가 신청 {draftChecked ? "✓" : ""}</span>
      </button>

      {#if !isIndependent}
        <button class="opt-btn" type="button" on:click={() => (universityModalOpen = true)}>
          <span class="opt-label">대학 진학 신청 {universityChecked ? `✓ (${universityChoices.length}/3)` : ""}</span>
        </button>
        {#if universityChecked}
          <div class="opt-box"><div class="list">{#each universityChoices as teamId}<div class="picked">{teamName(teamId)}</div>{/each}</div></div>
        {/if}

        <button class="opt-btn" type="button" on:click={() => (independentModalOpen = true)}>
          <span class="opt-label">독립리그 신청 {independentChecked ? `✓ (${independentChoices.length}/3)` : ""}</span>
        </button>
        {#if independentChecked}
          <div class="opt-box"><div class="list">{#each independentChoices as teamId}<div class="picked">{teamName(teamId)}</div>{/each}</div></div>
        {/if}
      {/if}

      <button class="opt-btn danger" type="button" on:click={chooseMilitaryNow}>
        <span class="opt-label">군입대 (즉시 확정)</span>
      </button>
    </div>
    <button class="submit" disabled={resolving || !(draftChecked || universityChecked || independentChecked || isIndependent)} on:click={submitApplications}>신청 완료</button>
  </div>
</div>

{#if universityModalOpen}
  <UniversityApplyModal
    initialSelected={universityChoices}
    on:close={async () => {
      universityModalOpen = false;
      await persistHubState();
    }}
    on:confirm={async (e) => {
      universityChoices = e.detail.selected.slice(0, 3);
      universityChecked = universityChoices.length > 0;
      universityModalOpen = false;
      await persistHubState();
    }}
  />
{/if}
{#if independentModalOpen}
  <IndependentApplyModal
    initialSelected={independentChoices}
    on:close={async () => {
      independentModalOpen = false;
      await persistHubState();
    }}
    on:confirm={async (e) => {
      independentChoices = e.detail.selected.slice(0, 3);
      independentChecked = independentChoices.length > 0;
      independentModalOpen = false;
      await persistHubState();
    }}
  />
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.8); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background: #0e1a30; border: 1px solid #3a5898; border-radius: 16px; padding: 24px; width: min(760px, 94vw); display: grid; gap: 14px; }
  .chip { font-size: 11px; color: #7a9ad0; }
  h2 { margin: 0; color: #e8f0ff; }
  .body-text { margin: 0; color: #a8c0e0; }
  .options { display: grid; gap: 8px; }
  .opt-box { border: 1px solid #2a4068; border-radius: 10px; padding: 10px; background: #0f1a2c; }
  .opt-btn { background: #111e38; border: 1px solid #2a4068; border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: block; width: 100%; }
  .opt-btn.danger { background: #3a1f1f; border-color: #804040; }
  .opt-label { color: #dceeff; font-weight: 600; }
  .list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .picked { background: #0f1a2c; color: #bcd4f2; border: 1px solid #2a3d60; border-radius: 6px; padding: 6px; }
  .submit { background: #1e5aaa; color: #fff; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
  .submit:disabled { opacity: 0.5; cursor: default; }
</style>
