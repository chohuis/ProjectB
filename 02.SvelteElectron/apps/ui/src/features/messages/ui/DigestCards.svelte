<script lang="ts">
  /**
   * 소식 머리의 숫자 카드 + 관련성 필터.
   *
   * 오프시즌 결산과 월간 부상 리포트가 같은 모양을 쓴다 — **숫자를 누르면
   * 그 목록이 나온다.** 해석하는 문장을 쓰지 않는다.
   *
   * ⚠ 표(카드 종류)는 각 소식이 들고 있고 여기는 그리기만 한다. 종류를 여기
   * 적으면 소식이 늘 때마다 이 파일이 둘로 갈린다.
   */

  export let cards: ReadonlyArray<{ id: string; label: string; count: number }>;
  export let active: string | null;
  /** 내 팀 / 아는 사람. 0이면 칩을 안 그린다 */
  export let mineCount = 0;
  export let knownCount = 0;
  export let mineOn = false;
  export let knownOn = false;

  export let onPick: (id: string) => void;
  export let onToggleMine: () => void = () => {};
  export let onToggleKnown: () => void = () => {};
</script>

<div class="head">
  <div class="cards" style="--n:{cards.length}">
    {#each cards as c}
      <button
        class="card"
        class:on={active === c.id}
        type="button"
        disabled={c.count === 0}
        on:click={() => onPick(c.id)}
      >
        <span class="num u-num">{c.count}</span>
        <span class="lab">{c.label}</span>
      </button>
    {/each}
  </div>

  {#if mineCount > 0 || knownCount > 0}
    <div class="chips">
      {#if mineCount > 0}
        <button class="chip" class:on={mineOn} type="button" on:click={onToggleMine}>
          내 팀<span class="cnt u-num">{mineCount}</span>
        </button>
      {/if}
      {#if knownCount > 0}
        <button class="chip" class:on={knownOn} type="button" on:click={onToggleKnown}>
          아는 사람<span class="cnt u-num">{knownCount}</span>
        </button>
      {/if}
    </div>
  {/if}
</div>

<style>
  .head { display: flex; flex-direction: column; gap: 8px; }

  .cards { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 7px; }
  .card {
    display: flex; flex-direction: column; align-items: center; gap: 2px;
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 9px 6px;
    cursor: pointer;
    color: var(--ink-mid);
  }
  .card:hover:not(:disabled) { border-color: var(--line-strong); }
  .card:disabled { opacity: 0.4; cursor: default; }
  .card.on { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  .num { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; color: var(--ink); }
  .card.on .num { color: var(--t-gold); }
  .lab { font-size: 11px; white-space: nowrap; }

  .chips { display: flex; gap: 5px; }
  .chip {
    display: inline-flex; align-items: center; gap: 5px;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-mid);
    border-radius: 999px;
    font-size: 11.5px; padding: 3px 10px; cursor: pointer;
  }
  .chip.on { background: var(--t-dark); border-color: var(--t-dark); color: var(--ink-on-dark); }
  .cnt { font-size: 10px; color: var(--ink-mute); }
  .chip.on .cnt { color: var(--t-gold); }
</style>
