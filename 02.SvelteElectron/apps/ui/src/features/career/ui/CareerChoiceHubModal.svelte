<script lang="ts">
  import { onMount } from "svelte";
  import { gameStore } from "../../../shared/stores/game";
  import { submitCareerApplications } from "../../../shared/usecases/careerDecision";
  import { enlistProtagonist } from "../../../shared/usecases/militaryDecision";
  import { seasonStore } from "../../../shared/stores/season";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import UniversityApplyModal from "./UniversityApplyModal.svelte";
  import IndependentApplyModal from "./IndependentApplyModal.svelte";
  import OverseasApplyModal from "./OverseasApplyModal.svelte";
  import { canApplyToUniversity, canApplyToIndependent } from "../../../shared/utils/careerTransition";

  let resolving = false;
  let draftChecked = false;
  let universityChecked = false;
  let independentChecked = false;

  $: isIndependent = $gameStore.protagonist.careerStage === "independent";
  // 학적은 되돌릴 수 없다 — 대학 재학생은 대학에 다시 지원할 수 없고(두 번 입학),
  // 독립 소속은 학교로 돌아갈 수 없다. 선택지 자체를 안 보여준다:
  // 보이는데 눌러도 아무 일이 없으면 그게 더 나쁘다.
  $: canUniv = canApplyToUniversity($gameStore.protagonist.careerStage);
  $: canIndie = canApplyToIndependent($gameStore.protagonist.careerStage);
  let universityChoices: string[] = [];
  let independentChoices: string[] = [];
  let universityModalOpen = false;
  let independentModalOpen = false;
  /**
   * 해외 2군 직행 (실플 ②).
   *
   * ⚠ **무대 게이트를 안 건다.** 고교·대학·독립 셋 다에서 지원할 수 있고,
   *   자격은 팀별 문턱(OVR + 개인 기여)이 본다 — 모달이 그걸 보여준다.
   */
  let overseasChoices: string[] = [];
  let overseasChecked = false;
  let overseasModalOpen = false;

  function teamName(teamId: string): string {
    return $teamsL10n.find((t) => t.id === teamId)?.name ?? teamId;
  }

  function setupDefaults() {
    const apps = $gameStore.schoolState.careerApplications;
    draftChecked = apps?.draftApplied ?? false;
    universityChoices = apps?.universityChoices ? [...apps.universityChoices] : [];
    independentChoices = apps?.independentChoices ? [...apps.independentChoices] : [];
    universityChecked = universityChoices.length > 0;
    independentChecked = independentChoices.length > 0;
    overseasChoices = apps?.overseasChoices ? [...apps.overseasChoices] : [];
    overseasChecked = overseasChoices.length > 0;
  }
  $: setupDefaults();

  async function persistHubState() {
    gameStore.setCareerChoiceUiState({ popupOpened: true, mode: "none", confirmed: false });
    gameStore.setCareerApplications({
      draftApplied: draftChecked,
      universityChoices: universityChoices.slice(0, 3),
      independentChoices: independentChoices.slice(0, 3),
      overseasChoices: overseasChoices.slice(0, 3),
    });
    await gameStore.save();
  }

  onMount(() => {
    persistHubState();
  });

  function onClickDraftApply() {
    draftChecked = !draftChecked;
    if (draftChecked) {
      alert("드래프트 참가 신청이 완료되었습니다. W47주차 결과 확인 화면에서 드래프트 보드를 볼 수 있습니다.");
    }
  }

  async function chooseMilitaryNow() {
    if (resolving) return;
    if (!confirm("바로 입대하시겠습니까? 기존 신청은 모두 무시됩니다.")) return;
    resolving = true;
    // ⚠ 예전엔 여기서 `enlistMilitary("general")`을 **인자 없이** 부르고
    // 끝냈다 — 군 시즌 전환도, 일정 정리도, NPC 오프시즌도 없어서
    // 입대 표시만 된 채 고교 시즌에 그대로 남았다.
    await enlistProtagonist("general", $seasonStore.currentWeek);
    gameStore.setCareerApplicationsSubmitted(false);
    gameStore.clearCareerResults();
    gameStore.setCareerChoiceUiState({ popupOpened: false, mode: "none", confirmed: true });
    seasonStore.resolvePendingAction("careerChoiceHub");
    await seasonStore.save();
    resolving = false;
  }

  async function submitApplications() {
    if (resolving) return;
    const hasAny = draftChecked || universityChecked || independentChecked || isIndependent;
    if (!hasAny) return;
    resolving = true;
    await submitCareerApplications({
      draft: draftChecked,
      universityChoices,
      independentChoices,
    });
    resolving = false;
  }
</script>

<div class="overlay">
  <div class="modal">
    <div class="modal-header">
      <span class="chip">진로 결정</span>
      <h2>{$gameStore.protagonist.careerStage === "highschool" ? "W44" : $gameStore.protagonist.careerStage === "university" ? "W42" : "W39"} 진로 신청 허브</h2>
    </div>
    <p class="body-text">
      {isIndependent ? "KBL 드래프트에 신청하세요. 미신청 시 독립리그를 계속합니다." : "각 진로 페이지를 확인하고 체크한 뒤 신청 완료를 눌러 다음 주로 진행하세요."}
    </p>

    <div class="options">
      <button class="opt-btn" type="button" on:click={onClickDraftApply}>
        <span class="opt-label">드래프트 참가 신청 {draftChecked ? "✓" : ""}</span>
      </button>

      {#if canUniv}
        <button class="opt-btn" type="button" on:click={() => (universityModalOpen = true)}>
          <span class="opt-label">대학 진학 신청 {universityChecked ? `✓ (${universityChoices.length}/3)` : ""}</span>
        </button>
        {#if universityChecked}
          <div class="opt-box"><div class="list">{#each universityChoices as teamId}<div class="picked">{teamName(teamId)}</div>{/each}</div></div>
        {/if}
      {/if}

      {#if canIndie}
        <button class="opt-btn" type="button" on:click={() => (independentModalOpen = true)}>
          <span class="opt-label">독립리그 신청 {independentChecked ? `✓ (${independentChoices.length}/3)` : ""}</span>
        </button>
        {#if independentChecked}
          <div class="opt-box"><div class="list">{#each independentChoices as teamId}<div class="picked">{teamName(teamId)}</div>{/each}</div></div>
        {/if}
      {/if}

      <!-- 해외 2군 직행 (실플 ②) — 무대 게이트가 없다. 자격은 모달이 보여준다 -->
      <button class="opt-btn" type="button" on:click={() => (overseasModalOpen = true)}>
        <span class="opt-label">해외 2군 신청 {overseasChecked ? `✓ (${overseasChoices.length}/3)` : ""}</span>
      </button>
      {#if overseasChecked}
        <div class="opt-box"><div class="list">{#each overseasChoices as teamId}<div class="picked">{teamName(teamId)}</div>{/each}</div></div>
      {/if}

      <button class="opt-btn danger" type="button" on:click={chooseMilitaryNow}>
        <span class="opt-label">군입대 (즉시 확정)</span>
      </button>
    </div>
    <button class="submit" disabled={resolving || !(draftChecked || universityChecked || independentChecked || overseasChecked || isIndependent)} on:click={submitApplications}>신청 완료</button>
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
{#if overseasModalOpen}
  <OverseasApplyModal
    initialSelected={overseasChoices}
    on:close={async () => {
      overseasModalOpen = false;
      await persistHubState();
    }}
    on:confirm={async (e) => {
      overseasChoices = e.detail.selected.slice(0, 3);
      overseasChecked = overseasChoices.length > 0;
      overseasModalOpen = false;
      await persistHubState();
    }}
  />
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background: var(--panel); border: 1px solid var(--ink-mute); border-radius: 16px; padding: 24px; width: min(760px, 94vw); display: grid; gap: 14px; }
  .chip { font-size: 11px; color: var(--ink-mid); }
  h2 { margin: 0; color: var(--ink); }
  .body-text { margin: 0; color: var(--ink); }
  .options { display: grid; gap: 8px; }
  .opt-box { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: var(--panel); }
  .opt-btn { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: block; width: 100%; }
  .opt-btn.danger { background: rgba(179, 49, 31, 0.09); border-color: var(--bad); }
  .opt-label { color: var(--ink); font-weight: 600; }
  .list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .picked { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
  .submit { background: var(--ink-mute); color: #fff; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
  .submit:disabled { opacity: 0.5; cursor: default; }
</style>
