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

  /**
   * ⚠ **`count` 가 숫자가 아닐 수 있다** (소식 카드 다섯 — §1-4). 보직은
   *   「선발」이고 상대는 팀 이름이다. 누를 수 있는 자리(오프시즌·부상)는
   *   그대로 숫자다.
   */
  export let cards: ReadonlyArray<{ id: string; label: string; count: number | string }>;
  export let active: string | null;
  /**
   * 누를 수 있나 — **소식 카드는 못 누른다** (§2 · 재사용).
   *
   * 🔴 컴포넌트를 하나 더 만들지 않는다. 큰 값 한 줄과 그 아래 이름 한 줄이
   *    이미 같은 모양이라, 갈라 두면 숫자 크기·간격이 곧 어긋난다.
   *
   * ⚠ **못 누를 때는 `<button>` 을 안 쓴다.** 누를 수 없는 버튼을 두면
   *   키보드가 거기서 멈추고 읽어 주기가 「버튼」이라 읽는다.
   */
  export let interactive = true;
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
      {#if interactive}
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
      {:else}
        <!-- 값이 말이면 숫자 크기로 두면 넘친다 — 글자 수로 폭을 줄인다 -->
        <div class="card">
          <span class="num" class:u-num={typeof c.count === "number"}
                class:word={typeof c.count !== "number"}>{c.count}</span>
          <span class="lab">{c.label}</span>
        </div>
      {/if}
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
  /* 팀 이름·보직처럼 말이 오는 칸 — 20px 로 두면 카드 밖으로 넘친다 */
  .num.word {
    font-size: 14px; line-height: 1.3; text-align: center;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;
  }
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
