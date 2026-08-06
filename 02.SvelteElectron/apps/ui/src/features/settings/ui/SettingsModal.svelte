<script lang="ts">
  /**
   * 환경설정.
   *
   * ⚠ **소리는 아직 없다.** 볼륨만 놓고 아무 일도 안 하게 두면 "눌러도
   * 아무 일 없는 컨트롤"이 되므로, 값이 실제로 쓰이는 경로(`utils/sound.ts`)를
   * 만들어 두고 화면에는 **아직 소리가 없다고 밝힌다.** 있는 척하지 않는다.
   */
  import { createEventDispatcher } from "svelte";
  import { t, language, setLanguage, languageOptions } from "../../../shared/i18n";
  import { settingsStore, type ThemeSetting, type EffectSpeed, type WindowSize } from "../../../shared/stores/settings";
  import { hasPlayer } from "../../../shared/utils/sound";

  const THEMES: ThemeSetting[] = ["light", "dark", "system"];
  const SPEEDS: EffectSpeed[] = ["fast", "normal", "off"];
  const SIZES: WindowSize[] = ["1280x800", "1440x900", "1600x900", "1920x1080", "fullscreen"];

  /** 볼륨 세 줄. 키를 문자열로 두면 `Settings` 색인이 안 잡힌다 */
  const VOLUMES: Array<{ key: "volumeMaster" | "volumeSfx" | "volumeBgm"; label: string }> = [
    { key: "volumeMaster", label: "settings.sound.master" },
    { key: "volumeSfx",    label: "settings.sound.sfx" },
    { key: "volumeBgm",    label: "settings.sound.bgm" },
  ];

  /**
   * 창 크기는 **저장만 하는 값이 아니다** — Electron에 실제로 걸어야 한다.
   * 웹(Vite 단독)에서는 다리가 없으므로 저장만 되고 창은 안 바뀐다.
   */
  async function setWindowSize(size: WindowSize) {
    settingsStore.patch("windowSize", size);
    await window.projectB?.windowSetSize?.(size);
  }

  const sizeLabel = (s: WindowSize) =>
    s === "fullscreen" ? $t("settings.windowSize.fullscreen") : s.replace("x", " × ");

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
              <span class="row-name">{$t("settings.theme")}</span>
            </div>
            <div class="seg" role="radiogroup" aria-label={$t("settings.theme")}>
              {#each THEMES as th}
                <button
                  type="button"
                  role="radio"
                  aria-checked={$settingsStore.theme === th}
                  class:on={$settingsStore.theme === th}
                  on:click={() => settingsStore.patch("theme", th)}
                >{$t(`settings.theme.${th}`)}</button>
              {/each}
            </div>
          </div>

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
          <div class="row">
            <div class="row-head">
              <span class="row-name">{$t("settings.windowSize")}</span>
            </div>
            <div class="seg wrap" role="radiogroup" aria-label={$t("settings.windowSize")}>
              {#each SIZES as sz}
                <button
                  type="button"
                  role="radio"
                  aria-checked={$settingsStore.windowSize === sz}
                  class:on={$settingsStore.windowSize === sz}
                  on:click={() => setWindowSize(sz)}
                >{sizeLabel(sz)}</button>
              {/each}
            </div>
          </div>
        </section>

        <section class="u-sec">
          <span class="u-label">{$t("settings.section.game")}</span>

          <div class="row">
            <div class="row-head">
              <span class="row-name">{$t("settings.effectSpeed")}</span>
              <p class="row-hint">{$t("settings.effectSpeed.hint")}</p>
            </div>
            <div class="seg" role="radiogroup" aria-label={$t("settings.effectSpeed")}>
              {#each SPEEDS as sp}
                <button
                  type="button"
                  role="radio"
                  aria-checked={$settingsStore.effectSpeed === sp}
                  class:on={$settingsStore.effectSpeed === sp}
                  on:click={() => settingsStore.patch("effectSpeed", sp)}
                >{$t(`settings.effectSpeed.${sp}`)}</button>
              {/each}
            </div>
          </div>

          <div class="row">
            <div class="row-head">
              <span class="row-name">{$t("settings.reduceMotion")}</span>
              <p class="row-hint">{$t("settings.reduceMotion.hint")}</p>
            </div>
            <button
              type="button"
              class="toggle"
              role="switch"
              aria-checked={$settingsStore.reduceMotion}
              aria-label={$t("settings.reduceMotion")}
              on:click={() => settingsStore.patch("reduceMotion", !$settingsStore.reduceMotion)}
            ><span class="knob"></span></button>
          </div>
        </section>

        <section class="u-sec">
          <span class="u-label">{$t("settings.section.sound")}</span>
          {#if !hasPlayer()}
            <p class="pending">{$t("settings.sound.pending")}</p>
          {/if}

          {#each VOLUMES as vol}
            <div class="row">
              <div class="row-head">
                <span class="row-name">{$t(vol.label)}</span>
              </div>
              <div class="vol">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  aria-label={$t(vol.label)}
                  value={$settingsStore[vol.key]}
                  on:input={(e) =>
                    settingsStore.patch(vol.key, Number(e.currentTarget.value))}
                />
                <span class="vol-num">{$settingsStore[vol.key]}</span>
              </div>
            </div>
          {/each}
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
  .row + .row { border-top: 1px solid var(--line); }
  .row-head { min-width: 0; }
  .row-name { font-size: 13.5px; color: var(--ink); font-weight: 600; }
  .row-hint { margin: 2px 0 0; font-size: 11.5px; color: var(--ink-mute); line-height: 1.4; }

  /* 아직 소리가 없다는 걸 숨기지 않는다 */
  .pending {
    margin: 0;
    font-size: 11.5px;
    color: var(--warn);
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 6px 9px;
  }

  .vol { display: flex; align-items: center; gap: 9px; flex: 0 0 auto; }
  .vol input { width: 150px; accent-color: var(--t-dark); }
  .vol-num {
    width: 26px;
    text-align: right;
    font-size: 12px;
    color: var(--ink-mid);
    font-variant-numeric: tabular-nums;
  }

  /* 켜고 끄는 것 하나 — 셋 중 하나가 아니라 둘 중 하나다 */
  .toggle {
    flex: 0 0 auto;
    width: 42px;
    height: 24px;
    border-radius: 20px;
    border: 1px solid var(--line-strong);
    background: var(--panel-sunk);
    padding: 2px;
    cursor: pointer;
    display: flex;
    justify-content: flex-start;
  }
  .toggle[aria-checked="true"] { background: var(--t-dark); border-color: var(--t-dark); justify-content: flex-end; }
  .knob {
    display: block;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--panel);
    box-shadow: 0 1px 3px -1px rgba(8, 16, 36, 0.5);
  }
  .toggle[aria-checked="true"] .knob { background: var(--ink-on-dark); }

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
  /* 창 크기는 다섯 개라 한 줄에 안 들어간다 */
  .seg.wrap { flex-wrap: wrap; max-width: 260px; }
  .seg.wrap button { flex: 0 0 auto; padding: 6px 10px; font-size: 11.5px; }
  .seg button:hover { background: var(--panel-sunk); }
  .seg button.on {
    background: var(--t-dark);
    color: var(--ink-on-dark);
    font-weight: 700;
  }
</style>
