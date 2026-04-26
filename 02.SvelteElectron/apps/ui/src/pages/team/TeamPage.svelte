<script lang="ts">
  import { t } from "../../shared/i18n";
  type TeamTab = "my" | "all";
  type TeamSortField = "rank" | "winPct" | "name";
  type SortDirection = "asc" | "desc";
  type RankFilter = "all" | "top" | "mid" | "bottom";

  type TeamItem = {
    id: string;
    name: string;
    region: string;
    stadium: string;
    rank: number;
    wins: number;
    losses: number;
    winPct: number;
    form: string;
    offense: number;
    pitching: number;
    defense: number;
    manager: string;
    keyPlayers: string[];
  };

  const teams: TeamItem[] = [
    {
      id: "t1",
      name: "서울 이노베이션 고",
      region: "서울",
      stadium: "이노베이션 파크",
      rank: 1,
      wins: 16,
      losses: 6,
      winPct: 0.727,
      form: "W-W-L-W-W",
      offense: 83,
      pitching: 86,
      defense: 82,
      manager: "임우현",
      keyPlayers: ["정서겸", "최민석", "윤태주"]
    },
    {
      id: "t2",
      name: "부산 마린 고",
      region: "부산",
      stadium: "마린 베이 스타디움",
      rank: 2,
      wins: 14,
      losses: 8,
      winPct: 0.636,
      form: "W-L-W-W-L",
      offense: 81,
      pitching: 79,
      defense: 80,
      manager: "박도현",
      keyPlayers: ["최선우", "장우진", "강성민"]
    },
    {
      id: "t3",
      name: "수원 퓨전 고",
      region: "경기",
      stadium: "퓨전 돔",
      rank: 3,
      wins: 13,
      losses: 9,
      winPct: 0.591,
      form: "L-W-W-L-W",
      offense: 79,
      pitching: 81,
      defense: 78,
      manager: "김지훈",
      keyPlayers: ["한서원", "문준혁", "백태윤"]
    },
    {
      id: "t4",
      name: "인천 스카이 고",
      region: "인천",
      stadium: "스카이 필드",
      rank: 4,
      wins: 11,
      losses: 11,
      winPct: 0.5,
      form: "L-L-W-W-L",
      offense: 75,
      pitching: 77,
      defense: 76,
      manager: "서동환",
      keyPlayers: ["김시온", "배지후", "이태원"]
    },
    {
      id: "t5",
      name: "강릉 웨이브 고",
      region: "강원",
      stadium: "웨이브 볼파크",
      rank: 5,
      wins: 9,
      losses: 13,
      winPct: 0.409,
      form: "W-L-L-L-W",
      offense: 72,
      pitching: 74,
      defense: 73,
      manager: "오준석",
      keyPlayers: ["유한결", "전유찬", "조성호"]
    }
  ];

  const myTeamId = "t1";

  let tab: TeamTab = "my";
  let keyword = "";
  let selectedTeamId = myTeamId;
  let regionFilter = "all";
  let rankFilter: RankFilter = "all";
  let sortField: TeamSortField = "rank";
  let sortDirection: SortDirection = "asc";

  $: myTeam = teams.find((team) => team.id === myTeamId) ?? teams[0];

  $: regions = ["all", ...Array.from(new Set(teams.map((team) => team.region)))];

  $: filteredTeams = teams
    .filter((team) => team.name.toLowerCase().includes(keyword.trim().toLowerCase()))
    .filter((team) => regionFilter === "all" || team.region === regionFilter)
    .filter((team) => {
      if (rankFilter === "all") return true;
      if (rankFilter === "top") return team.rank <= 3;
      if (rankFilter === "mid") return team.rank >= 4 && team.rank <= 6;
      return team.rank >= 7;
    });

  $: visibleTeams = [...filteredTeams].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") cmp = a.name.localeCompare(b.name, "ko");
    else cmp = Number(a[sortField]) - Number(b[sortField]);
    return sortDirection === "asc" ? cmp : -cmp;
  });

  $: selectedTeam =
    visibleTeams.find((team) => team.id === selectedTeamId) ?? visibleTeams[0] ?? teams[0];

  function selectTeam(teamId: string) {
    selectedTeamId = teamId;
  }

  function runDiff(team: TeamItem): number {
    return team.wins * 4 - team.losses * 3;
  }

  function toggleSortDirection() {
    sortDirection = sortDirection === "asc" ? "desc" : "asc";
  }

  function sortDirectionLabel(direction: SortDirection): string {
    return direction === "asc" ? "오름차순" : "내림차순";
  }

  function teamRating(team: TeamItem): number {
    const score =
      team.offense * 0.3 + team.pitching * 0.4 + team.defense * 0.3 + team.winPct * 100 * 0.5;
    if (score >= 90) return 5;
    if (score >= 82) return 4;
    if (score >= 74) return 3;
    if (score >= 66) return 2;
    return 1;
  }

  function teamStars(team: TeamItem): string {
    const rating = teamRating(team);
    return "★".repeat(rating) + "☆".repeat(5 - rating);
  }
</script>

<section class="page">
  <h2>{$t("page.team")}</h2>

  <article class="card board">
    <header class="top-row">
      <div class="tabs">
        <button class:active={tab === "my"} on:click={() => (tab = "my")}>내 팀</button>
        <button class:active={tab === "all"} on:click={() => (tab = "all")}>전체 팀</button>
      </div>

      {#if tab === "all"}
        <div class="tools">
          <input bind:value={keyword} placeholder="팀 검색" />
          <select bind:value={regionFilter}>
            {#each regions as region}
              <option value={region}>{region === "all" ? "지역 전체" : region}</option>
            {/each}
          </select>
          <select bind:value={rankFilter}>
            <option value="all">구간 전체</option>
            <option value="top">상위권(1~3위)</option>
            <option value="mid">중위권(4~6위)</option>
            <option value="bottom">하위권(7위 이하)</option>
          </select>
          <select bind:value={sortField}>
            <option value="rank">순위</option>
            <option value="winPct">승률</option>
            <option value="name">팀명</option>
          </select>
          <button class="sort-dir" on:click={toggleSortDirection}>
            {sortDirectionLabel(sortDirection)}
          </button>
        </div>
      {/if}
    </header>

    {#if tab === "my"}
      <div class="my-team-layout">
        <section class="summary-grid">
          <article class="panel metric-panel">
            <h3>{myTeam.name}</h3>
            <p>{myTeam.region} · {myTeam.stadium}</p>
            <div class="metrics">
              <div><span>순위</span><strong>{myTeam.rank}위</strong></div>
              <div><span>승-패</span><strong>{myTeam.wins}-{myTeam.losses}</strong></div>
              <div><span>승률</span><strong>{myTeam.winPct.toFixed(3)}</strong></div>
              <div><span>최근 흐름</span><strong>{myTeam.form}</strong></div>
            </div>
          </article>

          <article class="panel power-panel">
            <h3>전력 지표</h3>
            <div class="power-rows">
              <p><span>타격</span><strong>{myTeam.offense}</strong></p>
              <p><span>투수</span><strong>{myTeam.pitching}</strong></p>
              <p><span>수비</span><strong>{myTeam.defense}</strong></p>
            </div>
            <p class="sub">감독: {myTeam.manager}</p>
          </article>
        </section>

        <section class="detail-grid">
          <article class="panel">
            <h3>핵심 선수</h3>
            <ul>
              {#each myTeam.keyPlayers as player}
                <li>{player}</li>
              {/each}
            </ul>
          </article>

          <article class="panel">
            <h3>팀 메모</h3>
            <ul>
              <li>주중 불펜 로테이션 유지</li>
              <li>상대 좌완 선발 대비 우타 라인업 강화</li>
              <li>주말 원정 전날 회복 세션 우선 배치</li>
            </ul>
          </article>
        </section>
      </div>
    {:else}
      <div class="all-team-layout">
        <section class="team-list panel">
          <div class="team-list-head">
            <span>팀</span>
            <span>순위</span>
            <span>승-패</span>
            <span>승률</span>
            <span>별점</span>
          </div>
          <div class="team-rows">
            {#if visibleTeams.length === 0}
              <p class="empty">검색 결과가 없습니다.</p>
            {:else}
              {#each visibleTeams as team}
                <button class:selected={selectedTeam.id === team.id} on:click={() => selectTeam(team.id)}>
                  <strong>{team.name}</strong>
                  <span>{team.rank}</span>
                  <span>{team.wins}-{team.losses}</span>
                  <span>{team.winPct.toFixed(3)}</span>
                  <span class="star">{teamStars(team)}</span>
                </button>
              {/each}
            {/if}
          </div>
        </section>

        <aside class="team-detail panel">
          <h3>{selectedTeam.name}</h3>
          <p>{selectedTeam.region} · {selectedTeam.stadium}</p>
          <p class="rating">팀 별점: {teamStars(selectedTeam)}</p>

          <div class="metrics">
            <div><span>순위</span><strong>{selectedTeam.rank}위</strong></div>
            <div><span>승-패</span><strong>{selectedTeam.wins}-{selectedTeam.losses}</strong></div>
            <div><span>승률</span><strong>{selectedTeam.winPct.toFixed(3)}</strong></div>
            <div><span>득실 지표</span><strong>{runDiff(selectedTeam)}</strong></div>
          </div>

          <section class="power-box">
            <h4>전력 요약</h4>
            <p><span>타격</span><strong>{selectedTeam.offense}</strong></p>
            <p><span>투수</span><strong>{selectedTeam.pitching}</strong></p>
            <p><span>수비</span><strong>{selectedTeam.defense}</strong></p>
          </section>

          <section class="key-box">
            <h4>주요 선수</h4>
            <ul>
              {#each selectedTeam.keyPlayers as player}
                <li>{player}</li>
              {/each}
            </ul>
          </section>
        </aside>
      </div>
    {/if}
  </article>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h2 {
    font-size: 22px;
  }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
    min-height: 0;
    overflow: hidden;
  }

  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .tabs {
    display: flex;
    gap: 6px;
  }

  .tabs button,
  .tools input,
  .tools select,
  .sort-dir {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
  }

  .tabs button {
    cursor: pointer;
  }

  .tabs button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }

  .tools input {
    width: 160px;
  }

  .tools {
    display: flex;
    gap: 6px;
    align-items: center;
    flex-wrap: wrap;
  }

  .sort-dir {
    cursor: pointer;
  }

  .my-team-layout,
  .all-team-layout {
    min-height: 0;
    overflow: hidden;
  }

  .my-team-layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .summary-grid,
  .detail-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
    min-height: 0;
  }

  .panel {
    border: 1px solid #2f486f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .panel h3 {
    margin-bottom: 8px;
  }

  .metrics {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin-top: 8px;
  }

  .metrics div {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 7px;
    display: grid;
    gap: 2px;
  }

  .metrics span {
    color: #9eb6de;
    font-size: 11px;
  }

  .metrics strong {
    color: #eff5ff;
    font-size: 14px;
  }

  .power-rows {
    display: grid;
    gap: 5px;
  }

  .power-rows p,
  .power-box p {
    display: flex;
    justify-content: space-between;
    color: #d7e5ff;
    font-size: 13px;
    border-bottom: 1px solid #274061;
    padding-bottom: 4px;
  }

  .power-rows p:last-child,
  .power-box p:last-child {
    border-bottom: 0;
    padding-bottom: 0;
  }

  .sub {
    margin-top: 8px;
    color: #a6bbdf;
    font-size: 12px;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    margin-bottom: 6px;
    color: #dce5f7;
    font-size: 13px;
  }

  .all-team-layout {
    display: grid;
    grid-template-columns: 1.15fr 1fr;
    gap: 10px;
  }

  .team-list {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
  }

  .team-list-head,
  .team-rows button {
    display: grid;
    grid-template-columns: 1fr 0.4fr 0.7fr 0.6fr 0.95fr;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }

  .team-list-head {
    color: #9fb4d8;
    padding: 0 6px;
  }

  .team-rows {
    min-height: 0;
    overflow: hidden;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .team-rows button {
    border: 1px solid #284269;
    background: #162a4a;
    border-radius: 8px;
    padding: 7px 6px;
    color: #e4edff;
    text-align: left;
    cursor: pointer;
  }

  .team-rows button.selected {
    border-color: #79abf6;
    background: #1d3760;
  }

  .team-rows button strong {
    font-size: 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .star {
    color: #ffd87a;
    letter-spacing: 0.5px;
    font-size: 11px;
  }

  .team-detail {
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .team-detail > p {
    color: #b4c8ea;
    font-size: 13px;
  }

  .rating {
    color: #ffd87a;
    font-size: 12px;
  }

  .power-box,
  .key-box {
    display: grid;
    gap: 6px;
  }

  .power-box h4,
  .key-box h4 {
    color: #dbe8ff;
    font-size: 13px;
  }

  .empty {
    color: #9db2d8;
    font-size: 12px;
    padding: 8px;
  }

  @media (max-width: 1180px) {
    .all-team-layout {
      grid-template-columns: 1fr;
    }

    .team-detail {
      display: none;
    }

    .summary-grid,
    .detail-grid {
      grid-template-columns: 1fr;
    }
  }
</style>


