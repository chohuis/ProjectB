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
  import { overseasOfferTeams, calcIndividualScore } from "../../../shared/utils/universityUtils";
  import { firstTeamIdOf } from "../../../shared/utils/ids";
  import { ALL_TEAMS_BY_LEAGUE } from "../../../shared/utils/leagueScheduler";
  import { isLeagueInScope } from "../../../shared/config/releaseScope";

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
   * 해외 2군 — **신청이 아니라 제안이다** (사용자 확정 09-02 · HANDOFF_A_TO_C §0.45).
   *
   * 🔴 예전엔 여기서 3곳을 골라 저장했다. 판정이 더는 안 읽는다 —
   *   W47 에 해외 2군 전부를 **부모 1군 전력** 문턱으로 보고 넘는 팀이 결과 화면에 온다.
   *   여기는 그 수를 **판정과 같은 함수**(`overseasOfferTeams`)로 미리 세어 한 줄로 보여준다.
   * ⚠ 무대 게이트는 없다 — 고교·대학·독립 셋 다 제안을 받을 수 있다.
   */
  let overseasModalOpen = false;
  $: myOvr = $gameStore.protagonist.pitching.ovr;
  $: myScore = calcIndividualScore($gameStore.protagonist.careerRecords ?? []);
  $: overseasFarm = ["LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"]
    .filter((lid) => isLeagueInScope(lid))
    .flatMap((lid) => ALL_TEAMS_BY_LEAGUE[lid] ?? [])
    .map((id) => {
      const parent = firstTeamIdOf(id);
      return { id, parentPower: parent ? $teamsL10n.find((x) => x.id === parent)?.power : undefined };
    });
  $: overseasCount = overseasOfferTeams(myOvr, myScore, overseasFarm).length;

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
  }
  $: setupDefaults();

  async function persistHubState() {
    gameStore.setCareerChoiceUiState({ popupOpened: true, mode: "none", confirmed: false });
    gameStore.setCareerApplications({
      draftApplied: draftChecked,
      universityChoices: universityChoices.slice(0, 3),
      independentChoices: independentChoices.slice(0, 3),
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

      <!-- 해외 2군 — 신청이 아니라 제안 (§0.45). 여기선 안내 한 줄 + 문턱 보기 -->
      <div class="opt-box overseas">
        <span class="opt-label">해외 2군 제안은 시즌 결과(W47)에 온다 — 지금 내 OVR {myOvr}·기여 {Math.round(myScore)}로는 <strong>{overseasCount}/{overseasFarm.length}팀</strong></span>
        <button class="link" type="button" on:click={() => (overseasModalOpen = true)}>구단별 문턱 보기</button>
      </div>

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
{#if overseasModalOpen}
  <!-- 읽기 전용 전망 — 저장할 게 없다 -->
  <OverseasApplyModal on:close={() => (overseasModalOpen = false)} />
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display: flex; align-items: center; justify-content: center; z-index: 200; }
  .modal { background: var(--panel); border: 1px solid var(--ink-mute); border-radius: 16px; padding: 24px; width: min(760px, 94vw); display: grid; gap: 14px; }
  .chip { font-size: 11px; color: var(--ink-mid); }
  h2 { margin: 0; color: var(--ink); }
  .body-text { margin: 0; color: var(--ink); }
  .options { display: grid; gap: 8px; }
  .opt-box { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: var(--panel); }
  .opt-box.overseas { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
  .opt-box.overseas .opt-label { font-weight: 500; font-size: 13px; color: var(--ink-mid); }
  .opt-box.overseas strong { color: var(--ink); font-weight: 800; }
  .link { background: none; border: 1px solid var(--line); border-radius: 999px; color: var(--ink-mid); font-size: 12px; padding: 4px 10px; cursor: pointer; white-space: nowrap; }
  .link:hover { border-color: var(--line-strong); color: var(--ink); }
  .opt-btn { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 10px 12px; text-align: left; cursor: pointer; display: block; width: 100%; }
  .opt-btn.danger { background: rgba(179, 49, 31, 0.09); border-color: var(--bad); }
  .opt-label { color: var(--ink); font-weight: 600; }
  .list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-top: 8px; }
  .picked { background: var(--panel); color: var(--ink); border: 1px solid var(--line); border-radius: 6px; padding: 6px; }
  .submit { background: var(--ink-mute); color: #fff; border: 0; border-radius: 10px; padding: 10px 14px; cursor: pointer; }
  .submit:disabled { opacity: 0.5; cursor: default; }
</style>
