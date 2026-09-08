<script lang="ts">
  import type { PendingAction } from "../../../shared/types/season";
  import { resolveEventPending } from "../../../shared/usecases/runAutoAdvance";
  import EventTierChip from "./EventTierChip.svelte";
  import { hidesNumbers, kindOnlyHint, costKindHint, COST_LEAD } from "../../../shared/utils/eventTierCopy";

  /**
   * `type: "event"` pending 을 그리는 유일한 자리 (C-13 · HANDOFF_A_TO_C §0.48).
   *
   * 🔴 2026-09-02 실측: 군 이벤트가 매주 한 건까지 pending 을 올리는데 그걸 그리는
   *   Svelte 가 한 곳도 없어 사람 플레이에선 진행이 막혔다. 헤드리스(runAutoAdvance)만 풀었다.
   *
   * ⚠ **효과 적용·pending 해제·저장은 `resolveEventPending` 안에 있다.** 여기서 다시
   *   계산하지 않는다 — 헤드리스와 화면이 같은 함수를 부르므로 한쪽만 고쳐지는 일이 없다.
   *
   * ## 등급 (2026-09-08 · PLAN_EVENT_TIERS §2·§9 · C 4-5)
   *
   * 🔴 **지금 이 모달로 오는 이벤트에는 등급이 없다**(실측). 등급 줄기가 뽑은
   *   이벤트는 소식함으로 가고(`NewsPage`), 이 pending 을 올리는 것은 병영생활과
   *   트레이드 둘뿐이다. 그래도 여기에 같은 규칙을 두는 이유는 **숨기는 쪽이
   *   빠지면 숫자가 새기 때문**이다 — 모달이 등급을 모르면, 나중에 등급 이벤트가
   *   모달로 오는 날 유니크의 보상 숫자가 그대로 보인다. 칩은 값이 있을 때만 뜬다.
   */
  export let action: Extract<PendingAction, { type: "event" }>;

  let resolving = false;

  $: choices = action.choices ?? [];
  /** 유니크·히든은 숫자를 감추고 **종류만** 보인다(§2) */
  $: veiled = hidesNumbers(action.grade);
  $: costHint = costKindHint(action.cost ? [action.cost] : undefined);

  async function choose(choiceId: string) {
    if (resolving) return;
    resolving = true;
    try {
      await resolveEventPending(action, choiceId);
    } finally {
      resolving = false;
    }
  }
</script>

<div class="overlay">
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="ev-title">
    <header>
      <div class="chips">
        <p class="chip">이벤트</p>
        <EventTierChip grade={action.grade} theme={action.theme} />
      </div>
      <h2 id="ev-title">{action.title}</h2>
    </header>
    <p class="body-text">{action.description}</p>

    <!-- 대가는 **이벤트에 붙는다** — 어느 갈래를 골라도 낸다(§4). 그래서
         선택지 안이 아니라 선택지 위에 한 줄로 둔다 -->
    {#if action.cost}
      <!-- ⚠ 구분자를 `{#if}` 밖에 두면 Svelte 가 앞뒤 공백을 지운다(NewsPage 와 같은 자리) -->
      <p class="cost">{costHint ? `${COST_LEAD} — ${costHint}` : COST_LEAD}</p>
    {/if}

    {#if choices.length > 0}
      <div class="choices">
        {#each choices as c (c.id)}
          <!-- `opt` 는 scripts/drive.mjs 가 "선택 대기의 선택지"로 알아보는 훅 — 소식의 결정 버튼과 같은 이름이라 드라이버가 첫 선택지를 고르고 넘어간다 -->
          <button class="choice opt" type="button" disabled={resolving} on:click={() => choose(c.id)}>
            <span class="label">{c.label}</span>
            <!-- ⚠ **`effectHint` 를 깎지 않는다.** 유니크·히든이면 그 문장을 아예
                 안 쓰고 효과 객체에서 종류를 다시 짓는다(`kindOnlyHint`) — 문자열을
                 정규식으로 깎으면 「+3」은 지워도 「크게」는 남는 반쪽이 된다 -->
            {#if veiled}
              {@const k = kindOnlyHint(c.effects)}
              {#if k}<span class="hint veil">{k}</span>{/if}
            {:else if c.effectHint}
              <span class="hint">{c.effectHint}</span>
            {/if}
          </button>
        {/each}
      </div>
    {:else}
      <!-- 선택지가 없는 이벤트 — 읽고 넘긴다. resolveEventPending 은 choices[0] 폴백이라 빈 배열이어도 pending 을 지운다 -->
      <div class="actions">
        <button class="choice single" type="button" disabled={resolving} on:click={() => choose("")}>확인</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(10, 18, 38, 0.52); display: flex; align-items: center; justify-content: center; z-index: 245; }
  .modal {
    width: min(520px, 92vw); max-height: 88vh; overflow-y: auto;
    background: var(--panel); color: var(--ink);
    border: 1px solid var(--line); border-top: 4px solid var(--warn); border-radius: var(--radius);
    padding: 22px 24px; display: grid; gap: 14px;
  }
  .chips { display: flex; align-items: center; gap: 6px; }
  .chip { margin: 0; font-size: 11px; font-weight: 700; color: var(--warn); letter-spacing: .06em; }
  h2 { margin: 4px 0 0; font-size: 18px; color: var(--ink); }
  .body-text { margin: 0; color: var(--ink-mid); font-size: 13.5px; white-space: pre-line; line-height: 1.6; }
  /* 대가는 선택지가 아니라 **조건**이라 갈래와 같은 무게로 그리지 않는다 —
     한 줄 · 왼쪽 띠 · 경고색. 갈래처럼 보이면 누를 수 있는 것으로 읽힌다 */
  .cost {
    margin: 0; padding: 7px 10px; font-size: 12px; font-weight: 700;
    color: var(--warn); background: var(--panel-sunk);
    border-left: 3px solid var(--warn); border-radius: var(--radius);
  }
  .choices { display: grid; gap: 8px; }
  .choice {
    display: grid; gap: 3px; text-align: left;
    border: 1px solid var(--line-strong); border-radius: var(--radius);
    background: var(--panel-sunk); color: var(--ink);
    padding: 10px 12px; cursor: pointer;
  }
  .choice:hover:not(:disabled) { border-color: var(--t-accent); background: var(--panel); }
  .choice:disabled { opacity: .5; cursor: default; }
  .choice .label { font-weight: 700; font-size: 13.5px; }
  /* 효과는 숨기지 않는다 — 값을 그대로 적는다 (§27 · effectHint 원칙)
     ⚠ 예외는 유니크·히든뿐이다(§2 「보상 표시: 종류만」) — 그건 감추는 게 아니라
       **크기를 모른 채 고르는 것이 그 등급의 감각**이라는 기획이다 */
  .choice .hint { color: var(--ink-mute); font-size: 11.5px; }
  .choice .hint.veil { font-style: italic; }
  .actions { display: flex; justify-content: flex-end; }
  .choice.single { text-align: center; padding: 9px 20px; }
</style>
