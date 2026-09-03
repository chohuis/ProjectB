<script lang="ts">
  import type { MessageItem, RoleChoiceMetadata } from "../../../shared/types/main";
  import { masterStore } from "../../../shared/stores/master";
  import { roleConfirmLine } from "../../../shared/utils/roleChoiceCopy";
  import { applyRoleChoice, type RoleChoiceId } from "../../../shared/usecases/pitcherRole";

  /**
   * 보직 선택 — **모달이 아니라 소식 상세 안의 칸이다** (PLAN_ROLE_RECOMMEND §4).
   *
   * `NewsPage` 의 `.dec` / `.opt` 규칙을 그대로 따른다. 새 모달을 만들지 않는 게
   * 요점이라 클래스 이름도 같은 것을 쓴다.
   *
   * ## 여기가 안 하는 것
   *
   * 🔴 **숫자를 만들지 않는다.** 확인 한 줄의 `N` 은 소식이 들고 온
   * `metadata.ahead` 하나뿐이고, 적합도·순위·자리 수·등판 감소율은 안 보여
   * 준다(확정 2). 두 벌이 되면 한쪽만 고쳐진 채 남는다.
   *
   * 🔴 **문장을 짓지 않는다.** 문안 정본은 `messages/role_choice.json`(B-12)이고
   * 갈래는 `ahead ≥ 1` / `ahead = 0` 둘뿐이다 — 세 번째 문장이 여기서 나오면 안 된다.
   *
   * 🔴 **부제를 안 단다.** `effectHint` 가 전부 빈 문자열이라 `.opt-hint` 가
   * 아예 안 그려진다(사용자 지시).
   *
   * ⚠ **추천을 눌러도 확인 한 줄이 뜬다** (§7 · 확정 12). 추천이라고 문장을
   * 빼면 "추천은 자리가 있다"는 뜻이 되는데, 셋 다 밀리는 경우가 실제로 있다(§8 ⑫).
   */
  export let msg: MessageItem;

  $: meta = msg.metadata as RoleChoiceMetadata;
  $: dec  = msg.decision!;
  $: copy = $masterStore.roleChoiceCopy;

  /** 아직 확정 안 한 선택 — `applyDecision` 을 부르지 않고 여기까지만 담는다 */
  let pendingPick: RoleChoiceId | null = null;
  let busy = false;

  // 다른 소식으로 옮기면 확인 단계를 접는다
  $: if (msg.id) pendingPick = null;

  async function commit() {
    if (!pendingPick || busy) return;
    busy = true;
    try {
      await applyRoleChoice(msg.id, pendingPick);
    } finally {
      busy = false;
      pendingPick = null;
    }
  }
</script>

<section class="dec">
  {#if dec.selectedOptionId === null}
    {#if pendingPick === null}
      <div class="dec-opts">
        {#each dec.options as opt}
          <button
            class="opt"
            class:rec={meta.recommended === opt.id}
            type="button"
            aria-pressed={meta.recommended === opt.id}
            on:click={() => (pendingPick = opt.id as RoleChoiceId)}
          >
            <span class="opt-label">{opt.label}</span>
          </button>
        {/each}
      </div>
    {:else if copy}
      <div class="confirm">
        <p>{roleConfirmLine(copy, meta.ahead[pendingPick])}</p>
        <div class="row">
          <button class="btn" type="button" on:click={() => (pendingPick = null)}>
            {copy.confirm.buttons.back}
          </button>
          <button class="btn go" type="button" disabled={busy} on:click={commit}>
            {copy.confirm.buttons.go}
          </button>
        </div>
      </div>
    {/if}
  {:else}
    {@const chosen = dec.options.find((o) => o.id === dec.selectedOptionId)}
    <div class="dec-done">
      <span class="check">✓</span>
      <span class="done-label">{chosen?.label}</span>
    </div>
  {/if}
</section>

<style>
  /* `NewsPage` 의 `.dec` 규칙과 같은 값이다 — 같은 자리에 그리므로 어긋나면 튄다 */
  .dec {
    border-top: 1px solid var(--line);
    padding-top: 11px;
  }
  .dec-opts { display: flex; flex-direction: column; gap: 6px; }
  .opt {
    display: flex; align-items: baseline; gap: 10px;
    width: 100%; text-align: left; cursor: pointer;
    background: var(--panel);
    border: 1px solid var(--line-strong);
    border-radius: var(--radius);
    padding: 10px 13px;
    font-size: 13px; color: var(--ink);
  }
  .opt:hover { border-color: var(--t-dark); background: var(--panel-sunk); }
  .opt-label { font-weight: 700; }

  /* 추천 표시는 **하나뿐이다** — 테두리 하나. 나머지 둘은 아무 표시가 없고
     「자리 있음」·「자리 없음」 같은 부제도 안 단다 (§4 · 사용자 지시) */
  .opt.rec { border-color: var(--t-dark); border-left: 3px solid var(--t-dark); }

  /* 확인 단계 — 같은 자리에서 한 줄 + 버튼 둘 */
  .confirm {
    background: var(--panel-sunk);
    border-radius: var(--radius);
    border-left: 3px solid var(--warn);
    padding: 11px 13px;
    display: flex; flex-direction: column; gap: 10px;
  }
  .confirm p { margin: 0; font-size: 13px; color: var(--ink); }
  .confirm .row { display: flex; gap: 6px; justify-content: flex-end; }
  .btn {
    padding: 7px 14px; border-radius: var(--radius);
    font: inherit; font-size: 12.5px; font-weight: 700; cursor: pointer;
    border: 1px solid var(--line-strong);
    background: var(--panel); color: var(--ink-mid);
  }
  .btn:hover { border-color: var(--t-dark); color: var(--ink); }
  .btn.go { background: var(--t-accent); border-color: var(--t-accent); color: var(--ink-on-dark); }
  .btn:disabled { opacity: .55; cursor: default; }

  .dec-done {
    display: flex; align-items: baseline; gap: 9px;
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 9px 13px;
    font-size: 13px;
  }
  .check { color: var(--ok); font-weight: 800; }
  .done-label { font-weight: 700; color: var(--ink); }
</style>
