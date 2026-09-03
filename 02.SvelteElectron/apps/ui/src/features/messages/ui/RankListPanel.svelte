<script lang="ts">
  import type { RankListMetadata, Top10Metadata } from "../../../shared/types/main";
  import { buildRankList } from "../../../shared/utils/dashboardView";
  import { rankCopy } from "../../../shared/utils/dashboardCopy";
  import { masterStore, teamMap, entityMap } from "../../../shared/stores/master";
  import PlayerDetailModal from "../../player/ui/PlayerDetailModal.svelte";

  /**
   * 순위 목록 — 등수가 뜻을 갖는 소식이 다 이것을 쓴다.
   *
   * ✅ **이름이 `ProspectTop10Panel` 이었다** (§2 · §6 ④ 확정 2026-09-03).
   *    유망주 전용처럼 보였는데 대회 최종 순위·대회 수상·2군 우승 셋이
   *    같은 모양이라 **이름을 바꿔 재사용한다.** 하는 일은 그대로다.
   *
   * ⚠ **두 규격을 여기서 갈라 그리지 않는다.** `buildRankList` 가
   *   `Top10Metadata`(학년 네 칸)와 `RankListMetadata`(한 줄 목록)를 한
   *   모양으로 모은다 — 여기에 `{#if}` 를 두면 같은 순위 줄을 두 벌 적게
   *   되고, vitest(`environment: "node"`)가 그걸 한 줄도 못 잰다.
   */
  export let metadata: Top10Metadata | RankListMetadata;

  let detailEntityId = "";

  /**
   * 문안 — 등수 이름(우승·준우승)과 빈 목록 한 줄이 여기서 온다.
   *
   * ⚠ 유망주 랭킹(`top10`)에는 `kind` 가 없다. 그때는 문안이 빈 채로
   *   들어가고 등수는 숫자로 선다 — 원래 그랬다.
   */
  /**
   * ⚠ **유망주 랭킹에는 `kind` 가 없다** (`Top10Metadata`). 예전엔 그래서
   *   문안을 못 찾고 「해당 학년 선수 없음」을 **코드가** 들고 있었다 —
   *   말은 문안에 둔다(`rankList.top10`).
   */
  $: copy = rankCopy(
    $masterStore.dashboardLabels,
    (metadata as { kind?: string }).kind ?? (metadata.type === "top10" ? "top10" : ""),
  );
  /**
   * 🔴 **id 를 이름으로 바꾸는 자리가 화면이다.** 대회 수상은 사람과 소속을
   *    id 로 싣는다(§1-2) — 만드는 쪽이 한글 이름을 굳혀 실으면 표시 언어를
   *    바꿔도 그 줄만 한글로 남는다.
   */
  $: names = {
    team:   (id: string) => $teamMap.get(id)?.name,
    person: (id: string) => $entityMap.get(id)?.name,
  };
  $: view = buildRankList(metadata, copy, names);
  /** 칸이 하나면 가로로 안 쪼갠다 — 대회 순위는 한 줄 목록이다 */
  $: single = view.columns.length <= 1;

  function openDetail(id: string) {
    // 상세를 못 여는 둘 — 나 자신과, id 를 안 싣는 순위(대회·2군)
    if (!id || id === "PLY_HERO") return;
    detailEntityId = id;
  }
  function closeDetail() { detailEntityId = ""; }
</script>

<div class="top10-wrap">
  {#if view.subtitle}
    <p class="top10-subtitle">{view.subtitle}</p>
  {/if}

  <div class="top10-grid" class:single>
    {#each view.columns as col (col.label)}
      <div class="top10-col">
        {#if col.label}
          <h4 class="col-title">{col.label}</h4>
        {/if}

        <ol class="rank-list">
          {#each col.entries as entry (entry.rank + "-" + entry.name)}
            <li
              class="rank-row"
              class:hero={entry.isMe}
              class:clickable={!!entry.id && !entry.isMe}
              on:dblclick={() => openDetail(entry.id)}
              title={entry.isMe ? "나" : entry.id ? "더블클릭으로 상세 보기" : ""}
            >
              <span class="rank-num">{entry.rankText}</span>
              <span class="rank-name">{entry.name}{#if entry.isMe} ◀{/if}</span>
              {#if entry.delta}
                <span class="rank-delta d-{entry.delta.dir}">{entry.delta.text}</span>
              {/if}
              <span class="rank-team">{entry.sub}</span>
            </li>
          {/each}

          {#if col.entries.length === 0}
            <!-- ⚠ 빈 목록 한 줄도 문안이 갖는다. 대회 순위와 유망주 랭킹은
                 「없다」의 뜻이 달라 한 문장으로 묶으면 안 된다 -->
            <li class="rank-empty">{view.empty}</li>
          {/if}
        </ol>

        {#if col.heroRank !== null}
          <p class="hero-outside">※ 내 순위: 약 {col.heroRank}위</p>
        {/if}
      </div>
    {/each}
  </div>
</div>

{#if detailEntityId}
  <PlayerDetailModal entityId={detailEntityId} on:close={closeDetail} />
{/if}

<style>
  .top10-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .top10-subtitle {
    margin: 0;
    font-size: 12px;
    color: var(--ink-mute);
  }

  .top10-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 10px;
  }
  /* 칸이 하나면 네 갈래로 쪼개지 않는다 — 1366×768 에서 목록이 1/4 폭으로 눌린다 */
  .top10-grid.single { grid-template-columns: minmax(0, 1fr); }

  .top10-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: var(--panel-sunk);
    border-radius: var(--radius);
    padding: 10px 10px 8px;
  }

  .col-title {
    margin: 0 0 4px;
    font-size: 12px;
    font-weight: 800;
    color: var(--ink);
    border-bottom: 2px solid var(--t-dark);
    padding-bottom: 6px;
    text-align: center;
  }

  .rank-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .rank-row {
    display: grid;
    /* 🔴 **이름이 한 글자만 남았다** ("안…" "송…") — 2026-08-26 실플.
       `auto`인 팀명이 **자기 내용만큼 다 가져가서** `1fr`인 이름을 밀어냈다.
       팀 이름이 길수록 선수 이름이 짧아지는 구조였다.
       ⚠ **이름이 더 중요하다** — 순위표에서 누구인지가 핵심이다.
         이름에 최소 폭을 보장하고, 넘치는 건 팀명이 잘린다(`ellipsis`가 이미 있다). */
    /* 🔴 **등수 칸이 20px 로 못 박혀 있었다** — 「준우승」 이 한 글자씩 세로로
       쪼개져 그려졌다(눈확인 c58 · 2026-09-04). 등수가 숫자일 때는 20px 로
       충분한데 대회 최종 순위는 **말**이 온다(`rankList.<kind>.first`).
       ⚠ 바닥은 20px 그대로다 — 숫자 줄이 들쭉날쭉해지면 안 된다. */
    grid-template-columns: minmax(20px, max-content) minmax(4.5em, 1fr) minmax(0, auto);
    align-items: center;
    gap: 5px;
    padding: 5px 6px;
    border-radius: 6px;
    font-size: 12px;
    border: 1px solid transparent;
    transition: background 0.1s;
  }
  /* 변동 칸이 붙으면 열이 넷이다. 없는 줄에는 아예 칸을 안 만든다 */
  .rank-row:has(.rank-delta) {
    grid-template-columns: 20px minmax(4.5em, 1fr) 2.6em minmax(0, auto);
  }

  .rank-row.clickable {
    cursor: pointer;
  }
  .rank-row.clickable:hover {
    background: var(--panel);
    border-color: var(--line-strong);
  }

  /* 내 행은 팀 색으로 반전한다 — `.u-table tr.is-me`와 같은 규칙이다 */
  .rank-row.hero {
    background: var(--t-dark);
    color: var(--t-gold);
    font-weight: 800;
  }

  .rank-num {
    color: var(--ink-mute);
    font-size: 11px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
    /* 말이 오는 자리라 줄바꿈을 막는다 — 「준우승」 이 세로로 쪼개졌다 */
    white-space: nowrap;
  }

  .rank-row.hero .rank-num { color: var(--t-gold); }

  .rank-name {
    color: var(--ink);
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rank-row.hero .rank-name { color: var(--t-gold); }

  .rank-delta {
    font-size: 10.5px;
    font-weight: 700;
    text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .d-up { color: var(--ok); }
  .d-down { color: var(--bad); }
  .d-flat { color: var(--ink-mute); }
  .rank-row.hero .rank-delta { color: var(--t-gold); }

  .rank-team {
    color: var(--ink-mute);
    font-size: 10px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-align: right;
  }

  .rank-row.hero .rank-team { color: rgba(255, 255, 255, 0.7); }

  .rank-empty {
    color: var(--ink-mute);
    font-size: 11px;
    padding: 6px;
    text-align: center;
  }

  .hero-outside {
    margin: 4px 0 0;
    font-size: 11px;
    color: var(--ink-mid);
    text-align: center;
    border-top: 1px solid var(--line);
    padding-top: 5px;
  }
</style>
