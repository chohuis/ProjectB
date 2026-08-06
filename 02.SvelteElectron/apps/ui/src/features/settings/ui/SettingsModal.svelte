<script lang="ts">
  /**
   * 환경설정.
   *
   * ⚠ **아직 동작하지 않는 항목은 안 넣는다.** 지금 넣은 것은 언어뿐이고,
   * 테마·연출 속도·창 크기·사운드는 각각 S3~S6에서 그 기능이 생길 때 붙인다.
   * 눌러도 아무 일 없는 컨트롤은 이 프로젝트에서 반복해 나온 결함이다
   * (부상위험 %, 구종 슬롯에 이름 적기).
   */
  import { createEventDispatcher } from "svelte";
  import { t, language, setLanguage, languageOptions } from "../../../shared/i18n";

  export let open = false;

  const dispatch = createEventDispatcher<{ close: void }>();
  const close = () => dispatch("close");

  function onKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") close();
  }
</script>

<svelte:window on:keydown={open ? onKeydown : undefined} />

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="u-overlay" on:click={close}>
    <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
    <div
      class="u-modal settings-modal"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={$t("settings.title")}
      on:click|stopPropagation
    >
      <div class="u-modal__head">
        <h2 class="u-modal__title">{$t("settings.title")}</h2>
        <button class="u-modal__close" type="button" on:click={close} aria-label={$t("settings.close")}>×</button>
      </div>

      <div class="u-modal__body">
        <section class="u-sec">
          <span class="u-label">{$t("settings.section.display")}</span>

          <div class="row">
            <div class="row-head">
              <span class="row-name">{$t("settings.language")}</span>
            </div>
            <div class="seg" role="radiogroup" aria-label={$t("settings.language")}>
              {#each languageOptions as option}
                <button
                  type="button"
                  role="radio"
                  aria-checked={$language === option.id}
                  class:on={$language === option.id}
                  on:click={() => setLanguage(option.id)}
                >{option.label}</button>
              {/each}
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .settings-modal { width: min(520px, 94vw); }

  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 12px;
    padding: 10px 0;
  }
  .row-head { min-width: 0; }
  .row-name { font-size: 13.5px; color: var(--ink); font-weight: 600; }

  /* 셋 중 하나임을 모양으로 말한다 — 테두리를 나눠 쓴다 */
  .seg {
    display: flex;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    overflow: hidden;
    flex: 0 0 auto;
  }
  .seg button {
    border: 0;
    background: var(--panel);
    color: var(--ink-mid);
    font: inherit;
    font-size: 12.5px;
    padding: 6px 14px;
    cursor: pointer;
  }
  .seg button + button { border-left: 1px solid var(--line-strong); }
  .seg button:hover { background: var(--panel-sunk); }
  .seg button.on {
    background: var(--t-dark);
    color: var(--ink-on-dark);
    font-weight: 700;
  }
</style>
