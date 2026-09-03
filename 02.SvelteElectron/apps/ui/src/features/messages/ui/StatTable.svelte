<script lang="ts">
  import type { TableMetadata } from "../../../shared/types/main";
  import { masterStore } from "../../../shared/stores/master";
  import { tableCopy } from "../../../shared/utils/dashboardCopy";
  import { buildTableView, deltaText } from "../../../shared/utils/dashboardView";

  /**
   * 표 소식 하나 — 열 정의와 행 배열을 받아 그린다.
   *
   * 🔴 **표 19종에 컴포넌트를 19개 만들지 않는다**
   *    (`PLAN_MESSAGE_DASHBOARDS.md` §2). 다이제스트 순위표와 계약 인센티브
   *    표는 **열이 다를 뿐 구조가 같다** — `columns` 와 `rows` 를 받는 하나로
   *    끝난다. 종류는 `kind` 문자열이 들고 화면은 그걸 **문안을 고를 때만** 본다.
   *
   * 🔴 **열 이름·빈 칸·변동 틀을 여기서 짓지 않는다.** 정본은
   *    `messages/dashboard_labels.json`(B-21)이고 `kind` 가 그 표의 키다.
   *    「승」·「연봉」을 코드에 한 벌 더 두면 한쪽만 고쳐진 채 남는다.
   *
   * ⚠ **문안을 못 읽어도 표를 안 없앤다.** 값은 이미 소식에 실려 왔다 —
   *   열 이름 자리에 키를 그대로 쓰고 빈 칸은 `—` 다.
   *
   * ⚠ **문장을 안 그린다.** 부제·설명 없이 표와 각주 한 줄뿐이다. 본문
   *   텍스트(`body`)는 소식이 이미 들고 있고 이 칸이 그걸 대신한다 —
   *   `MyBodyPanel` 이 먼저 잡은 규칙이다.
   *
   * ⚠ **행을 여기서 만들지 않는다.** `shared/utils/dashboardView.ts` 가
   *   만든다 — 여기서 만들면 vitest(`environment: "node"`)가 한 줄도 못 잰다.
   */
  export let metadata: TableMetadata;
  /** 표 안의 표로 불렸나 — 그때는 이름을 단다 (아래 `svelte:self`) */
  export let titled = false;

  $: copy = tableCopy($masterStore.dashboardLabels, metadata.kind);
  /**
   * 표가 둘이면 둘 다 이름을 단다 — 계약 완료가 「계약 조건」 아래
   * 「인센티브」를 다는 자리다. 하나뿐이면 소식 제목이 이미 그 이름이라
   * 위에 한 줄 더 두면 부제가 된다.
   */
  $: view = buildTableView(metadata, copy, titled || !!metadata.extra);
</script>

<div class="st">
  {#if view.title}
    <p class="cap">{view.title}</p>
  {/if}

  <!-- 🔴 **가로 넘침은 표 안에서 막는다.** 1366×768 에서 계약 조항처럼 열이
       많은 표가 상세 칸을 밀어 **본문이 통째로 옆으로 흘렀다**. 표만 스크롤한다 -->
  <div class="scroll">
    <table>
      <thead>
        <tr>
          {#each view.columns as c, ci (c.key)}
            <th class="a-{c.align}">{c.label}</th>
            {#if ci === 0 && view.deltaLabel !== null}
              <th class="a-right c-delta">{view.deltaLabel}</th>
            {/if}
          {/each}
        </tr>
      </thead>
      <tbody>
        {#each view.rows as r, ri (ri)}
          <tr class:is-me={r.highlight}>
            {#each r.cells as cell, ci (cell.key)}
              <td class="a-{cell.align}" class:u-num={cell.numeric}>{cell.text}</td>
              {#if ci === 0 && view.deltaLabel !== null}
                <td class="a-right c-delta d-{r.delta?.dir ?? 'none'}">{deltaText(r.delta, copy)}</td>
              {/if}
            {/each}
          </tr>
        {/each}

        {#if view.rows.length === 0}
          <tr>
            <td class="empty" colspan={view.columns.length + (view.deltaLabel !== null ? 1 : 0)}>
              {view.empty}
            </td>
          </tr>
        {/if}
      </tbody>
    </table>
  </div>

  {#if view.footnote}
    <p class="foot">{view.footnote}</p>
  {/if}

  <!-- 표 안의 표 — 계약 완료의 인센티브가 유일한 자리다. 열이 아예 달라
       한 표에 못 넣는다. 안 실어 보내면 아무것도 안 그린다 -->
  {#if metadata.extra}
    <svelte:self metadata={metadata.extra} titled={true} />
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

  /* 표가 둘일 때만 뜨는 이름 한 줄 — 부제가 아니라 표의 이름이다 */
  .cap {
    margin: 4px 0 0; font-size: 11px; font-weight: 800;
    letter-spacing: 0.04em; color: var(--ink-mid);
  }
  .empty { color: var(--ink-mute); text-align: center; padding: 10px; }
  .foot { margin: 0; font-size: 11px; color: var(--ink-mute); }
</style>
