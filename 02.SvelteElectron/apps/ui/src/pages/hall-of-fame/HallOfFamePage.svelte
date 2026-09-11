<script lang="ts">
  // ── 명예의 전당 (C단계) ────────────────────────────────────────────────
  //
  // 재료는 이미 다 있다 — 넣기만 하면 된다:
  //   `hallOfFame`      선수 id → 헌액 연도·점수·구단·등번호
  //   `retiredNumbers`  팀 id → 비운 번호
  //   `careerHistory`   수상 이력 (점수의 근거)
  //
  // ⚠ **은퇴 선수는 `npcs` 에서 사라지지 않는다**(`careerStatus: "retired"`).
  //   이름·기록을 그때 조회할 수 있다. 다만 세이브가 커지면 훑는 비용이 드니
  //   **한 번만 만들고 반응형 캐시로 둔다.**
  import { gameStore } from "../../shared/stores/game";
  import { teamMap } from "../../shared/stores/master";

  /** 목록 한 줄 */
  type Row = {
    id: string;
    name: string;
    year: number;
    score: number;
    teams: string[];
    num: number;
    /** 점수를 만든 수상들 — 상세에서 편다 */
    awards: string[];
  };

  $: hof = $gameStore.hallOfFame ?? {};
  $: npcById = new Map(($gameStore.npcs ?? []).map((n) => [n.npcId, n]));
  $: teamName = (id: string) =>
    // 언어 반영본(teamMap)을 읽는다 — 원본 스토어를 읽으면 이 화면만 한국어로 남는다 (check:namelocale)
    $teamMap.get(id)?.name ?? id;

  // ⚠ **헌액 순서가 아니라 점수 순으로 보인다** — 명예의 전당은 연표가 아니라
  //   서열이다. 같은 점수면 먼저 헌액된 쪽이 위다.
  $: rows = Object.entries(hof)
    .map(([id, v]): Row => {
      const n = npcById.get(id);
      const awards: string[] = [];
      for (const e of n?.careerHistory ?? []) {
        for (const h of e.highlights ?? []) awards.push(`${e.year} ${h}`);
      }
      return {
        id,
        name: n?.name ?? id,
        year: v.year,
        score: v.score,
        teams: v.teams,
        num: v.num,
        awards,
      };
    })
    .sort((a, b) => b.score - a.score || a.year - b.year);

  /** 펼친 줄 */
  let openId = "";
  function toggle(id: string) {
    openId = openId === id ? "" : id;
  }

  // 구단별 영구결번 — 헌액자가 없어도 결번은 있을 수 있다
  $: retiredByTeam = Object.entries($gameStore.retiredNumbers ?? {})
    .filter(([, list]) => (list ?? []).length > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
</script>

<section class="hof">
  {#if rows.length === 0}
    <!-- ⚠ 헌액자 0명이 정상이다 — 은퇴자가 나와야 생긴다 -->
    <p class="empty">아직 헌액된 선수가 없습니다.</p>
    <p class="empty-sub">은퇴한 선수 중 수상 이력이 기준을 넘으면 이곳에 오릅니다.</p>
  {:else}
    <div class="head">
      <h3>헌액자 {rows.length}명</h3>
    </div>
    <div class="list">
      {#each rows as r (r.id)}
        <button
          class="row"
          class:open={openId === r.id}
          type="button"
          on:click={() => toggle(r.id)}
        >
          <span class="nm">{r.name}</span>
          <span class="yr">{r.year}</span>
          <span class="sc">{r.score}점</span>
          <span class="tm">
            {#if r.teams.length > 0}
              {r.teams.map(teamName).join(" · ")}{#if r.num > 0}<em>#{r.num} 결번</em>{/if}
            {:else}
              <em class="none">결번 없음</em>
            {/if}
          </span>
        </button>
        {#if openId === r.id}
          <div class="detail">
            {#if r.awards.length > 0}
              <ul>
                {#each r.awards as a}<li>{a}</li>{/each}
              </ul>
            {:else}
              <p class="empty-sub">수상 기록이 남아 있지 않습니다.</p>
            {/if}
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#if retiredByTeam.length > 0}
    <div class="head second">
      <h3>영구결번</h3>
    </div>
    <div class="nums">
      {#each retiredByTeam as [tid, list]}
        <div class="num-row">
          <span class="tm2">{teamName(tid)}</span>
          <span class="ns">{list.map((n) => `#${n}`).join("  ")}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<style>
  .hof {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .head {
    padding: 0.2rem 0 0.1rem;
  }
  .head.second {
    margin-top: 1rem;
    border-top: 1px solid var(--border, #d8dce6);
    padding-top: 0.8rem;
  }
  h3 {
    margin: 0;
    font-size: 0.95rem;
    font-weight: 700;
  }

  .empty {
    margin: 1rem 0 0.2rem;
    opacity: 0.75;
  }
  .empty-sub {
    margin: 0;
    font-size: 0.82rem;
    opacity: 0.6;
  }

  .list {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: grid;
    grid-template-columns: minmax(4rem, 1fr) 3rem 3.4rem minmax(0, 1.6fr);
    align-items: baseline;
    gap: 0.5rem;
    width: 100%;
    text-align: left;
    padding: 0.42rem 0.3rem;
    background: none;
    border: none;
    border-bottom: 1px solid var(--border, #e2e5ee);
    font: inherit;
    color: inherit;
    cursor: pointer;
  }
  .row:hover {
    background: var(--hover, rgba(0, 0, 0, 0.03));
  }
  .row.open {
    background: var(--hover, rgba(0, 0, 0, 0.05));
  }
  .nm {
    font-weight: 600;
  }
  .yr,
  .sc {
    font-variant-numeric: tabular-nums;
    font-size: 0.84rem;
    opacity: 0.75;
  }
  .sc {
    font-weight: 600;
    opacity: 1;
  }
  .tm {
    font-size: 0.82rem;
    opacity: 0.8;
  }
  .tm em {
    font-style: normal;
    margin-left: 0.35rem;
    opacity: 0.7;
  }
  .tm .none {
    opacity: 0.5;
  }

  .detail {
    padding: 0.3rem 0.3rem 0.6rem 1rem;
    border-bottom: 1px solid var(--border, #e2e5ee);
  }
  .detail ul {
    margin: 0;
    padding-left: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.12rem;
  }
  .detail li {
    font-size: 0.82rem;
    opacity: 0.85;
  }

  .nums {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .num-row {
    display: flex;
    align-items: baseline;
    gap: 0.6rem;
    font-size: 0.85rem;
  }
  .tm2 {
    min-width: 7rem;
    opacity: 0.75;
  }
  .ns {
    font-variant-numeric: tabular-nums;
    font-weight: 600;
  }
</style>
