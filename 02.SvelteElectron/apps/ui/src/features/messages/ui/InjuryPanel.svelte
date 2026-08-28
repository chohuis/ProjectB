<script lang="ts">
  import { onMount } from "svelte";
  import type { InjuryMetadata } from "../../../shared/types/main";
  import { gameStore } from "../../../shared/stores/game";
  import { teamMap } from "../../../shared/stores/master";
  import { slotRepo } from "../../../shared/repo/slotRepo";
  import type { Relationship } from "../../../shared/types/relationship";
  import { relationTag } from "../../../shared/utils/offseasonReport";
  import {
    buildRows, countByClass, sortRows,
    CLASS_ORDER, CLASS_LABEL, type InjuryClass,
  } from "../../../shared/utils/injuryReport";
  import { INJURY_LABEL } from "../../../shared/types/save";
  import TeamMark from "../../team/ui/TeamMark.svelte";
  import PlayerDetailModal from "../../player/ui/PlayerDetailModal.svelte";
  import DigestCards from "./DigestCards.svelte";

  /**
   * 월간 부상 리포트.
   *
   * ⚠ 예전엔 한 사람당 소식 하나였다 — `부상 소식 — 임도훈 (중증)`이 매주,
   * 사람 수만큼. 소식함이 그걸로 채워졌다.
   */

  export let metadata: InjuryMetadata;

  const PAGE = 100;

  let cls: InjuryClass | null = null;
  let mineOnly = false;
  let knownOnly = false;
  let shown = PAGE;
  let detailId = "";

  $: p = $gameStore.protagonist;

  let related: Relationship[] = [];
  onMount(async () => {
    const slotId = $gameStore.currentSlotId;
    if (!slotId) return;
    try { related = await slotRepo.getRelationships(slotId, {}); } catch { related = []; }
  });

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
    weeksLeftInSeason: metadata.weeksLeftInSeason,
    myTeamId: p.teamId,
    relations,
  });

  $: counts = countByClass(rows);
  // 내용이 있는 첫 칸을 연다 — 빈 목록이 선택된 채로 뜨면 고장으로 보인다
  $: if (cls === null) cls = CLASS_ORDER.find((c) => counts[c] > 0) ?? "short";

  $: cards = CLASS_ORDER.map((c) => ({ id: c, label: CLASS_LABEL[c], count: counts[c] }));
  $: mineCount = rows.filter((r) => r.mine).length;
  $: knownCount = rows.filter((r) => r.relation !== null).length;

  $: visible = sortRows(
    rows.filter((r) =>
      r.cls === cls
      && (!mineOnly || r.mine)
      && (!knownOnly || r.relation !== null)),
  );

  $: if (cls || mineOnly || knownOnly) shown = PAGE;

  function teamName(id: string | null): string {
    if (!id) return "—";
    return $teamMap.get(id)?.name ?? "(사라진 팀)";
  }

  /** 부상 이름. 표에 없으면 코드를 그대로 쓰지 않는다 */
  function injuryName(t: string): string {
    return (INJURY_LABEL as Record<string, string>)[t] ?? "부상";
  }
</script>

<div class="inj">
  <DigestCards
    {cards}
    active={cls}
    {mineCount} {knownCount}
    mineOn={mineOnly} knownOn={knownOnly}
    onPick={(id) => (cls = id as InjuryClass)}
    onToggleMine={() => (mineOnly = !mineOnly)}
    onToggleKnown={() => (knownOnly = !knownOnly)}
  />

  <table class="rows">
    <thead>
      <tr>
        <th class="c-name">이름</th>
        <th class="c-age">나이</th>
        <th class="c-pos">POS</th>
        <th class="c-team">팀</th>
        <th class="c-inj">부상</th>
        <th class="c-wk">복귀</th>
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
            <span class="team-cell">
              {#if r.teamId}<TeamMark teamId={r.teamId} size={14} />{/if}
              <span class="tn">{teamName(r.teamId)}</span>
            </span>
          </td>
          <td class="c-inj">{injuryName(r.injuryType)}</td>
          <td class="c-wk u-num">
            {#if r.cls === "retired"}—{:else}{r.weeks}주{/if}
          </td>
        </tr>
      {:else}
        <tr><td class="empty" colspan="6">해당하는 선수가 없다</td></tr>
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
  .inj { display: flex; flex-direction: column; gap: 10px; }

  .rows { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .rows th {
    text-align: left; font-size: 10px; font-weight: 800; letter-spacing: 0.06em;
    color: var(--ink-mute); padding: 0 6px 5px; border-bottom: 1px solid var(--line);
  }
  .rows td { padding: 5px 6px; border-bottom: 1px solid var(--line); color: var(--ink-mid); }
  .rows tbody tr:hover { background: var(--panel-sunk); }
  .rows tbody tr.mine { background: var(--panel-sunk); }

  .c-age, .c-pos { width: 44px; }
  .c-age, .c-wk { text-align: right; }
  .c-wk { width: 54px; }
  /* 🔴 **td에 display:flex를 걸면 안 된다.** 그러면 그 칸이 표의 열 계산에서
     빠져 **열 정렬이 통째로 어긋나고**, 안쪽 이름이 한두 글자로 잘린다
     (실제 플레이에서 "탄…", "금…"으로 나왔다). 배치는 안쪽 래퍼가 맡는다. */
  .c-team { width: 28%; }
  .team-cell { display: flex; align-items: center; gap: 5px; min-width: 0; }
  .c-inj { width: 24%; }

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
  /* ⚠ 부모에 min-width:0이 없으면 flex 기본값(auto) 때문에 줄임표가 안 먹는다 */
  .tn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { color: var(--ink-mute); padding: 14px 6px; }

  .more {
    border: 1px solid var(--line); background: none; color: var(--ink-mute);
    border-radius: var(--radius); font-size: 11.5px; padding: 6px; cursor: pointer;
  }
  .more:hover { border-color: var(--t-dark); color: var(--t-dark); }
</style>
