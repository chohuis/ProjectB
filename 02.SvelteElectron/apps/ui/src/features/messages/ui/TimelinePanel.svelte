<script lang="ts">
  import type { TimelineMetadata } from "../../../shared/types/main";

  /**
   * 타임라인 — 시간 순서 자체가 뜻인 소식 셋
   * (군 경력 · 복무 연차 · 고교 연감. `PLAN_MESSAGE_DASHBOARDS.md` §1-5).
   *
   * 🔴 **표로 만들면 안 되는 자리다.** 이 셋은 열이 같지 않고 「언제 무엇이
   *    있었는가」가 값이다. 표에 억지로 넣으면 빈 칸이 대부분인 표가 된다.
   *
   * ⚠ **여기서 순서를 다시 정하지 않는다.** 만드는 쪽이 실어 보낸 차례
   *   그대로 그린다 — 화면이 정렬하면 만드는 쪽과 두 벌이 되고, `when` 은
   *   `W21` · `2031` · `상병` 처럼 **꼴이 제각각이라 비교할 수도 없다.**
   *
   * ⚠ **문장을 안 그린다.** 부제·설명 없이 항목뿐이다 (`MyBodyPanel` 과 같다).
   */
  export let metadata: TimelineMetadata;

  $: entries = metadata.entries ?? [];
</script>

<div class="tl">
  {#if entries.length === 0}
    <p class="empty">기록이 없다</p>
  {:else}
    <ol class="line">
      {#each entries as e, i (i)}
        <li class="node">
          <span class="when">{e.when}</span>
          <span class="dot" aria-hidden="true"></span>
          <span class="body">
            <span class="label">{e.label}</span>
            {#if e.detail}<span class="detail">{e.detail}</span>{/if}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
</div>

<style>
  .tl { display: flex; flex-direction: column; gap: 6px; }

  .line { list-style: none; margin: 0; padding: 0; }

  .node {
    display: grid;
    /* ⚠ `when` 을 `auto` 로 두면 긴 한 줄이 나머지를 다 밀어낸다 —
       `ProspectTop10Panel` 이 같은 결함을 겪었다. 고정 폭으로 못박는다 */
    grid-template-columns: 4.6em 11px minmax(0, 1fr);
    align-items: start;
    gap: 8px;
    padding: 5px 0;
  }

  .when {
    font-size: 11px; font-weight: 800; color: var(--ink-mute);
    font-variant-numeric: tabular-nums; text-align: right;
    padding-top: 1px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }

  /* 점과 세로줄 — 줄은 점 뒤에 그린다. 마지막 항목은 아래로 안 잇는다 */
  .dot {
    position: relative;
    width: 7px; height: 7px; margin-top: 5px;
    border-radius: 50%;
    background: var(--t-dark);
  }
  .dot::after {
    content: ""; position: absolute; left: 3px; top: 9px;
    width: 1px; height: calc(100% + 14px);
    background: var(--line-strong);
  }
  .node:last-child .dot::after { display: none; }

  .body { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
  .label { font-size: 12.5px; font-weight: 700; color: var(--ink); }
  .detail { font-size: 11.5px; color: var(--ink-mid); }

  .empty { margin: 0; font-size: 11px; color: var(--ink-mute); text-align: center; padding: 10px; }
</style>
