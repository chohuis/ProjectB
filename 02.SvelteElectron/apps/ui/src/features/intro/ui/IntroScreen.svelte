<script lang="ts">
  import type { SaveSlotMeta } from "../../../shared/types/projectb.d";
  import { masterStore, teamsL10n } from "../../../shared/stores/master";
  import { careerStageLabel } from "../../../shared/utils/careerStageLabel";
  import TeamMark from "../../team/ui/TeamMark.svelte";

  export let onNew: () => void;
  export let onContinue: () => void;
  export let hasSave = false;
  /** 가장 최근 슬롯. 없으면 이어하기가 비활성이다 */
  export let latest: SaveSlotMeta | null = null;

  // ⚠ 팀 이름은 refs에서 찾는다. 슬롯 메타에는 teamId만 있다
  $: team = latest?.preview.teamId
    ? ($teamsL10n ?? []).find((t) => t.id === latest!.preview.teamId)
    : undefined;

  $: stage = careerStageLabel(latest?.preview.careerStage);

  /** "2031년 29주차" — 주차가 없으면 연도만 */
  $: when = latest?.preview.seasonYear
    ? `${latest.preview.seasonYear}년${latest.preview.currentWeek ? ` ${latest.preview.currentWeek}주차` : ""}`
    : null;
</script>

<div class="intro">
  <div class="center">
    <h1 class="title">OnePitch</h1>
    <p class="subtitle">투수 인생 시뮬레이션</p>

    <div class="buttons">
      <button class="btn primary" on:click={onNew}>새 게임</button>

      <button class="btn cont" on:click={onContinue} disabled={!hasSave}>
        <span class="cont-main">이어하기</span>
        <!-- ⚠ 미리보기가 있어야 슬롯이 여러 개일 때 무엇을 이어하는지 안다.
             값이 없으면 줄 자체를 안 그린다 — 빈 칸이 더 나쁘다 -->
        {#if hasSave && latest}
          <span class="cont-sub">
            {#if team}<TeamMark teamId={team.id} size={18} /><b>{team.name}</b>{/if}
            {#if stage}<span class="dot">·</span>{stage}{/if}
            {#if when}<span class="dot">·</span>{when}{/if}
          </span>
        {/if}
      </button>
    </div>

    {#if !hasSave}
      <p class="hint">저장된 기록이 없습니다</p>
    {/if}
  </div>
</div>

<style>
  .intro {
    width: 100vw;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .center {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
  }

  .title {
    margin: 0;
    font-size: 68px;
    font-weight: 800;
    font-style: italic;
    letter-spacing: -0.035em;
    color: var(--t-dark);
    line-height: 1;
  }

  .subtitle {
    margin: 12px 0 0;
    font-size: 13px;
    letter-spacing: 0.28em;
    color: var(--ink-mute);
    text-transform: none;
  }

  /* 팀 색 띠 — 유니폼의 첫 등장 */
  .subtitle::after {
    content: "";
    display: block;
    width: 52px;
    height: 3px;
    margin: 18px auto 0;
    background: var(--t-accent);
  }

  .buttons {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 268px;
    margin-top: 40px;
  }

  .btn {
    width: 100%;
    border: 0;
    border-radius: var(--radius);
    font-weight: 700;
    cursor: pointer;
    padding: 14px;
    font-size: 15px;
    transition: filter 0.12s;
  }
  .btn:hover:not(:disabled) {
    filter: brightness(1.08);
  }
  .btn:disabled {
    opacity: 0.38;
    cursor: default;
  }

  .btn.primary {
    background: var(--t-accent);
    color: var(--ink-on-dark);
  }

  .btn.cont {
    background: var(--panel);
    color: var(--t-dark);
    border: 2px solid var(--t-dark);
    display: flex;
    flex-direction: column;
    /*
      ⚠ `align-items`를 안 정하면 기본값 `stretch`라 자식이 전폭이 되고,
      그 안에서 글자가 왼쪽에 붙는다. **새 게임은 가운데인데 이어하기만
      왼쪽**이던 이유다 — 버튼의 `text-align: center`는 늘어난 자식 안에서
      다시 적용되지 않는다.
    */
    align-items: center;
    gap: 3px;
    padding: 11px 14px;
  }

  .cont-main {
    font-size: 15px;
  }

  .cont-sub {
    font-size: 11.5px;
    font-weight: 500;
    color: var(--ink-mute);
    display: flex;
    gap: 5px;
    align-items: baseline;
  }
  .cont-sub b {
    font-weight: 700;
    color: var(--ink-mid);
  }
  .cont-sub :global(.tm) {
    margin-right: 1px;
  }
  .dot {
    opacity: 0.5;
  }

  .hint {
    margin: 14px 0 0;
    color: var(--ink-mute);
    font-size: 12.5px;
  }
</style>
