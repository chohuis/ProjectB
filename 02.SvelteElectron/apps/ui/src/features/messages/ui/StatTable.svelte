<script lang="ts">
  import type { TableMetadata } from "../../../shared/types/main";
  import { buildTableRows } from "../../../shared/utils/dashboardView";

  /**
   * 표 소식 하나 — 열 정의와 행 배열을 받아 그린다.
   *
   * 🔴 **표 19종에 컴포넌트를 19개 만들지 않는다**
   *    (`PLAN_MESSAGE_DASHBOARDS.md` §2). 다이제스트 순위표와 계약 인센티브
   *    표는 **열이 다를 뿐 구조가 같다** — `columns` 와 `rows` 를 받는 하나로
   *    끝난다. 종류는 `kind` 문자열이 들고 화면은 그걸 거의 안 본다.
   *
   * ⚠ **문장을 안 그린다.** 부제·설명 없이 표와 각주 한 줄뿐이다. 본문
   *   텍스트(`body`)는 소식이 이미 들고 있고 이 칸이 그걸 대신한다 —
   *   `MyBodyPanel` 이 먼저 잡은 규칙이다.
   *
   * ⚠ **행을 여기서 만들지 않는다.** `shared/utils/dashboardView.ts` 가
   *   만든다 — 여기서 만들면 vitest(`environment: "node"`)가 한 줄도 못 잰다.
   */
  export let metadata: TableMetadata;

  $: cols = metadata.columns ?? [];
  $: rows = buildTableRows(metadata);
  $: deltaCol = !!metadata.deltaKey;
</script>

<div class="st">
  <!-- 🔴 **가로 넘침은 표 안에서 막는다.** 1366×768 에서 계약 조항처럼 열이
       많은 표가 상세 칸을 밀어 **본문이 통째로 옆으로 흘렀다**. 표만 스크롤한다 -->
  <div class="scroll">
    <table>
      <thead>
        <tr>
          {#each cols as c, ci (c.key)}
            <th class="a-{rows[0]?.cells[ci]?.align ?? (ci === 0 ? 'left' : 'right')}">{c.label}</th>
            {#if ci === 0 && deltaCol}<th class="a-right c-delta">변동</th>{/if}
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each rows as r, ri (ri)}
          <tr class:is-me={r.highlight}>
            {#each r.cells as cell, ci (cell.key)}
              <td class="a-{cell.align}" class:u-num={cell.numeric}>{cell.text}</td>
              {#if ci === 0 && deltaCol}
                <td class="a-right c-delta d-{r.delta?.dir ?? 'none'}">{r.delta?.text ?? ""}</td>
              {/if}
            {/each}
          </tr>
        {/each}

        {#if rows.length === 0}
          <tr><td class="empty" colspan={cols.length + (deltaCol ? 1 : 0)}>표시할 항목이 없다</td></tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if metadata.footnote}
    <p class="foot">{metadata.footnote}</p>
  {/if}
</div>

<style>
  .st { display: flex; flex-direction: column; gap: 4px; }
  .scroll { overflow-x: auto; }

  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }

  th {
    font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    color: var(--ink-mute); background: var(--panel-sunk);
    padding: 5px 7px; border-bottom: 1px solid var(--line);
    white-space: nowrap;
  }
  td {
    padding: 5px 7px; border-bottom: 1px solid var(--line);
    color: var(--ink-mid); white-space: nowrap;
  }
  /* 첫 열은 이름이라 길면 줄인다 — 숫자 열을 밀어내면 표가 못 읽힌다 */
  td:first-child { color: var(--ink); max-width: 12em; overflow: hidden; text-overflow: ellipsis; }

  .a-left { text-align: left; }
  .a-right { text-align: right; }
  .a-center { text-align: center; }
  .u-num { font-variant-numeric: tabular-nums; }

  tbody tr:hover { background: var(--panel-sunk); }
  /* 내 행은 팀 색으로 반전한다 — `.u-table tr.is-me` 와 같은 규칙이다 */
  tr.is-me td { background: var(--t-wash); font-weight: 800; color: var(--ink); }

  .c-delta { width: 3.4em; font-variant-numeric: tabular-nums; }
  .d-up { color: var(--ok); }
  .d-down { color: var(--bad); }
  .d-flat { color: var(--ink-mute); }

  .empty { color: var(--ink-mute); text-align: center; padding: 10px; }
  .foot { margin: 0; font-size: 11px; color: var(--ink-mute); }
</style>
