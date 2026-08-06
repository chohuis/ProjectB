<script lang="ts">
  import type { OffseasonMetadata } from "../../../shared/types/main";
  import { gameStore } from "../../../shared/stores/game";
  import { teamMap } from "../../../shared/stores/master";
  import {
    buildRows, countByGroup, sortRows, relationTag,
    GROUP_ORDER, GROUP_LABEL, type OffseasonGroup, type OffseasonRow,
  } from "../../../shared/utils/offseasonReport";
  import { onMount } from "svelte";
  import type { Relationship } from "../../../shared/types/relationship";
  import { slotRepo } from "../../../shared/repo/slotRepo";
  import TeamMark from "../../team/ui/TeamMark.svelte";
  import PlayerDetailModal from "../../player/ui/PlayerDetailModal.svelte";

  /**
   * 오프시즌 결산.
   *
   * ⚠ 예전엔 엔진이 만든 문장 213줄이 그대로 세로로 쏟아졌다. 그중 99줄이
   * 대학팀 수비 자리 조정이었고, **852명이 은퇴한 사건은 맨 아래 한 줄**이었다.
   * 팀은 `TEAM_UNIV_ASAN`처럼 ID로 떴다.
   *
   * 그래서 여기는 **숫자 → 목록**이다. 해석하는 문장을 쓰지 않는다 —
   * 은퇴를 누르면 은퇴한 사람이 나온다.
   */

  export let metadata: OffseasonMetadata;

  /** 한 번에 그리는 행 수. 852개 DOM을 한꺼번에 만들지 않는다 */
  const PAGE = 100;

  // ⚠ 고정값으로 두면 **그 종류가 0건인 시즌에 빈 목록이 선택된 채로 뜬다** —
  // 카드는 비활성인데 그게 켜져 있어 고장으로 보인다. 내용이 있는 쪽을 연다
  let group: OffseasonGroup | null = null;
  let mineOnly = false;
  let knownOnly = false;
  let shown = PAGE;
  let detailId = "";

  $: p = $gameStore.protagonist;

  // 인연은 스토어가 아니라 슬롯 DB에 있다 (PeoplePage와 같은 경로).
  // ⚠ 못 읽어도 목록은 떠야 한다 — 인연 표시는 덤이지 본문이 아니다
  let related: Relationship[] = [];
  onMount(async () => {
    const slotId = $gameStore.currentSlotId;
    if (!slotId) return;
    try { related = await slotRepo.getRelationships(slotId, {}); } catch { related = []; }
  });

  // `personId`가 npcId와 같다 (people.md §4). 라벨 규칙은 `relationTag` 하나다
  $: relations = new Map<string, string>(
    related
      .map((r) => [r.personId, relationTag(r.kind)] as const)
      .filter((e): e is readonly [string, string] => e[1] !== null)
      .map(([id, tag]) => [id, tag]),
  );

  $: rows = buildRows({
    events: metadata.events,
    people: $gameStore.npcs.map((n) => ({
      npcId: n.npcId, name: n.name, age: n.age, position: n.position,
    })),
    myTeamId: p.teamId,
    relations,
  });

  $: counts = countByGroup(rows);
  // 첫 표시 종류 — 사람이 있는 첫 칸. 한 번만 정한다(고른 뒤엔 안 건드린다)
  $: if (group === null) group = GROUP_ORDER.find((g) => counts[g] > 0) ?? "retire";
  $: mineCount = rows.filter((r) => r.mine).length;
  $: knownCount = rows.filter((r) => r.relation !== null).length;

  $: visible = sortRows(
    rows.filter((r) =>
      r.group === group
      && (!mineOnly || r.mine)
      && (!knownOnly || r.relation !== null)),
  );

  // 탭·필터를 바꾸면 다시 처음부터 — 안 그러면 3건짜리 목록에 "더 보기"가 남는다
  $: if (group || mineOnly || knownOnly) shown = PAGE;

  function teamName(id: string | null): string {
    if (!id) return "—";
    return $teamMap.get(id)?.name ?? "(사라진 팀)";
  }

  function pick(g: OffseasonGroup) {
    group = g;
  }
</script>

<div class="off">
  <!-- ── 헤드라인: 누르면 아래 목록이 그 종류가 된다 ── -->
  <div class="cards">
    {#each GROUP_ORDER as g}
      <button
        class="card"
        class:on={group === g}
        type="button"
        disabled={counts[g] === 0}
        on:click={() => pick(g)}
      >
        <span class="num u-num">{counts[g]}</span>
        <span class="lab">{GROUP_LABEL[g]}</span>
      </button>
    {/each}
  </div>

  {#if mineCount > 0 || knownCount > 0}
    <div class="chips">
      {#if mineCount > 0}
        <button class="chip" class:on={mineOnly} type="button"
                on:click={() => (mineOnly = !mineOnly)}>
          내 팀<span class="cnt u-num">{mineCount}</span>
        </button>
      {/if}
      {#if knownCount > 0}
        <button class="chip" class:on={knownOnly} type="button"
                on:click={() => (knownOnly = !knownOnly)}>
          아는 사람<span class="cnt u-num">{knownCount}</span>
        </button>
      {/if}
    </div>
  {/if}

  <!-- ── 목록 ── -->
  <table class="rows">
    <thead>
      <tr>
        <th class="c-name">이름</th>
        <th class="c-age">나이</th>
        <th class="c-pos">POS</th>
        <th class="c-team">팀</th>
        <th class="c-why">사유</th>
      </tr>
    </thead>
    <tbody>
      {#each visible.slice(0, shown) as r (r.npcId)}
        <tr class:mine={r.mine} on:dblclick={() => (detailId = r.npcId)}>
          <td class="c-name">
            {#if r.mine}<span class="dot" aria-label="내 팀"></span>{/if}
            <span class="nm">{r.name}</span>
            {#if r.relation}<span class="rel">{r.relation}</span>{/if}
          </td>
          <td class="c-age u-num">{r.age || "—"}</td>
          <td class="c-pos">{r.position}</td>
          <td class="c-team">
            {#if r.teamId}<TeamMark teamId={r.teamId} size={14} />{/if}
            <span class="tn">{teamName(r.teamId)}</span>
          </td>
          <td class="c-why">
            {r.reason}
            {#if r.detail}<span class="det" title="구단 평가 점수">{r.detail}</span>{/if}
          </td>
        </tr>
      {:else}
        <tr><td class="empty" colspan="5">해당하는 선수가 없다</td></tr>
      {/each}
    </tbody>
  </table>

  {#if visible.length > shown}
    <button class="more" type="button" on:click={() => (shown += PAGE)}>
      {Math.min(PAGE, visible.length - shown)}명 더 · 남은 {visible.length - shown}
    </button>
  {/if}
</div>

{#if detailId}
  <PlayerDetailModal entityId={detailId} on:close={() => (detailId = "")} />
{/if}

<style>
  .off { display: flex; flex-direction: column; gap: 10px; }

  .cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
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
  .lab { font-size: 11px; }

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

  .rows { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .rows th {
    text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    color: var(--ink-mute); padding: 0 6px 5px; border-bottom: 1px solid var(--line);
  }
  .rows td { padding: 5px 6px; border-bottom: 1px solid var(--line); color: var(--ink-mid); }
  .rows tbody tr:hover { background: var(--panel-sunk); }
  .rows tbody tr.mine { background: var(--panel-sunk); }

  .c-age, .c-pos { width: 44px; }
  .c-age { text-align: right; }
  .c-team { width: 34%; }
  .c-why { width: 26%; }

  .c-name { color: var(--ink); }
  .dot {
    display: inline-block; width: 5px; height: 5px; border-radius: 50%;
    background: var(--t-accent); margin-right: 5px; vertical-align: middle;
  }
  .nm { font-weight: 600; }
  .rel {
    font-size: 10px; color: var(--ink-mute);
    border: 1px solid var(--line); border-radius: 2px; padding: 0 4px; margin-left: 5px;
  }
  .c-team { display: flex; align-items: center; gap: 5px; }
  .tn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .det {
    font-size: 10.5px; color: var(--ink-mute);
    background: var(--panel-sunk); border-radius: 2px; padding: 0 4px; margin-left: 5px;
  }
  .empty { color: var(--ink-mute); padding: 14px 6px; }

  .more {
    border: 1px solid var(--line); background: none; color: var(--ink-mute);
    border-radius: var(--radius); font-size: 11.5px; padding: 6px; cursor: pointer;
  }
  .more:hover { border-color: var(--t-dark); color: var(--t-dark); }
</style>
