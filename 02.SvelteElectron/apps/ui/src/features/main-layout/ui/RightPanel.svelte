<script lang="ts">
  import { gameStore } from "../../../shared/stores/game";
  import { seasonStore } from "../../../shared/stores/season";
  import { teamMap } from "../../../shared/stores/master";
  import { nextProtagonistGame, teamRank, gaugeTone } from "../../../shared/utils/myStatus";
  import { hsRegionOfTeam, hsRegionTeams } from "../../../shared/utils/ids";
  import { HS_REGIONS } from "../../../shared/utils/leagueTeams.generated";
  import { hsRegionMeta } from "../../../shared/utils/hsRegionLabel";
  import TeamMark from "../../team/ui/TeamMark.svelte";
  import { SERVICE_WEEKS } from "../../../shared/usecases/militaryDecision";

  /**
   * B3 우측 패널 — **"최근 로그"에서 "내 상태"로 바뀌었다.**
   *
   * 로그는 이미 지나간 일이라 항상 떠 있을 이유가 약했다. 항상 보여야 하는 건
   * "지금 내가 던질 수 있는 상태인가 · 다음 경기가 언제인가 · 우리 팀이 몇 위인가"
   * 셋이고, 그 셋이 전부 다른 화면에 흩어져 있었다.
   *
   * 스토어를 직접 읽는다 — 부모(MainPage)를 거치면 프로퍼티가 12개가 되고,
   * 소식(C1)에서 같은 걸 또 보여줄 때 두 번 배선해야 한다.
   */

  $: p = $gameStore.protagonist;
  $: pl = $gameStore.player;

  $: next = nextProtagonistGame($seasonStore.schedule, p.teamId, $seasonStore.currentDate);
  $: oppName = next ? ($teamMap.get(next.opponentId)?.name ?? next.opponentId) : "";

  // ⚠ `seasonStore.standings`는 **활성 리그 하나**다. 프로 승격처럼 리그가 바뀌면
  // 잠깐 예전 리그 표가 남아 내 팀이 거기 없다 — 그러면 순위가 통째로 사라진다.
  // 소속 리그의 표가 있으면 그쪽을 먼저 본다.
  $: standings = $seasonStore.leagueState[p.leagueId]?.standings?.length
    ? $seasonStore.leagueState[p.leagueId].standings
    : $seasonStore.standings;
  /**
   * 전국(리그 전체) 순위와 권역 순위를 따로 낸다.
   *
   * 고교는 8권역 주말리그라 **실제로 겨루는 상대가 권역 안 팀들**이다.
   * "102팀 중 7위"만 보여주면 그 구조가 안 보인다. 권역이 없는 리그
   * (대학·프로)에서는 `regionTeams`가 비어 전국 한 줄만 나온다.
   */
  $: rank = teamRank(standings, p.teamId);
  $: regionTeams = hsRegionTeams(p.teamId, HS_REGIONS as Record<string, readonly string[]>);
  $: regionRank = regionTeams.length > 0 ? teamRank(standings, p.teamId, regionTeams) : null;
  $: regionName = hsRegionOfTeam(p.teamId) ? hsRegionMeta(hsRegionOfTeam(p.teamId)!).label : "";

  /** "4/18" — 연도는 헤더에 이미 있다 */
  function shortDate(iso: string): string {
    const m = /^\d{4}-(\d{2})-(\d{2})/.exec(iso);
    return m ? `${+m[1]}/${+m[2]}` : iso;
  }

  function whenText(days: number | null): string {
    if (days === null) return "";
    if (days <= 0) return "오늘";
    if (days === 1) return "내일";
    return `${days}일 뒤`;
  }

  // ⚠ 반올림한다 — 병영생활 주간 계산(Rust)이 소수를 돌려줘 "사기 68.6280972890625" 가 그대로 찍혔다
  $: gauges = [
    { key: "컨디션", value: Math.round(pl.condition), inverted: false },
    { key: "피로", value: Math.round(pl.fatigue), inverted: true },
    { key: "사기", value: Math.round(pl.morale), inverted: false },
  ];

  // 복무 중에는 소속팀 경기가 없다 — 빈 칸 대신 남은 주차를 보여준다
  // ⚠ 예전엔 104 가 박혀 있었다 — 전역 판정(`SERVICE_WEEKS` · 100)과 4주 어긋났다
  $: militaryWeeksLeft =
    p.careerStage === "military" ? Math.max(0, SERVICE_WEEKS - p.militaryServiceWeeks) : null;
</script>

<aside class="rp">
  <!-- ── 내 몸 상태 ── -->
  <section class="u-card">
    <div class="ovr-row">
      <span class="u-label">OVR</span>
      <b class="ovr u-num">{pl.overall}</b>
    </div>

    <div class="gauges">
      {#each gauges as g}
        <div class="g">
          <div class="g-top">
            <span class="g-key">{g.key}</span>
            <span class="g-val u-num">{g.value}</span>
          </div>
          <div class="g-track">
            <div
              class="g-fill"
              data-tone={gaugeTone(g.value, g.inverted)}
              style="width:{Math.max(0, Math.min(100, g.value))}%"
            ></div>
          </div>
        </div>
      {/each}
    </div>

    {#if pl.tags.length > 0}
      <div class="tags">
        {#each pl.tags as tag}<span class="tag">{tag}</span>{/each}
      </div>
    {/if}
  </section>

  <!-- ── 다음 경기 ──
       ⚠ "다음 등판"이 아니다. 선발 로테이션의 어느 자리인지는 엔진이 정한다 -->
  <section class="u-card">
    <span class="u-label">다음 경기</span>
    {#if militaryWeeksLeft !== null}
      <p class="none">복무 중 · 전역까지 {militaryWeeksLeft}주</p>
    {:else if next}
      <div class="nx-top">
        <span class="nx-date u-num">{shortDate(next.entry.gameDate)}</span>
        <span class="nx-side" class:home={next.isHome}>{next.isHome ? "홈" : "원정"}</span>
      </div>
      <p class="nx-opp"><TeamMark teamId={next.opponentId} size={18} />{oppName}</p>
      {#if whenText(next.daysAway)}<p class="nx-when">{whenText(next.daysAway)}</p>{/if}
    {:else}
      <p class="none">예정된 경기 없음</p>
    {/if}
  </section>

  <!-- ── 팀 순위 ── -->
  <section class="u-card">
    <span class="u-label">팀 순위</span>
    {#if rank}
      <!-- 권역이 있으면 그게 먼저다 — 실제로 겨루는 상대가 거기 있다 -->
      {#if regionRank}
        <div class="rk-top">
          <b class="rk u-num">{regionRank.rank}</b><i>위</i>
          <span class="rk-of u-num">/ {regionRank.of}팀</span>
          <span class="rk-scope">{regionName}</span>
        </div>
        <p class="rk-nat u-num">
          전국 <b>{rank.rank}</b>위 <span class="rk-of">/ {rank.of}팀</span>
        </p>
      {:else}
        <div class="rk-top">
          <b class="rk u-num">{rank.rank}</b><i>위</i>
          <span class="rk-of u-num">/ {rank.of}팀</span>
        </div>
      {/if}
      <p class="rk-rec u-num">
        {rank.wins}승 {rank.losses}패{#if rank.draws > 0}
          {rank.draws}무{/if} · {rank.winPctText}
      </p>
      {#if rank.streak}<p class="rk-streak">{rank.streak}</p>{/if}
    {:else}
      <p class="none">순위 없음</p>
    {/if}
  </section>

  <!-- ── 최근 기록 — 자리가 남을 때만 ── -->
  {#if $gameStore.logs.length > 0}
    <section class="u-card logs">
      <span class="u-label">최근</span>
      <div class="log-list">
        {#each $gameStore.logs.slice(0, 6) as log}
          <p>{log}</p>
        {/each}
      </div>
    </section>
  {/if}
</aside>

<style>
  .rp {
    height: 100%;
    min-height: 0;
    overflow-y: auto;
    border-radius: var(--radius);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .u-card {
    padding: 11px 12px;
  }

  /* ── OVR + 게이지 ── */
  .ovr-row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--t-dark);
  }
  .ovr {
    font-size: 28px;
    font-weight: 800;
    line-height: 1;
    color: var(--t-dark);
  }

  .gauges {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin-top: 9px;
  }

  .g-top {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }
  .g-key {
    font-size: 11.5px;
    color: var(--ink-mid);
  }
  .g-val {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink);
  }

  .g-track {
    height: 4px;
    margin-top: 3px;
    background: var(--panel-sunk);
    border-radius: 2px;
    overflow: hidden;
  }
  .g-fill {
    height: 100%;
  }
  /* 의미색은 팀 색과 섞지 않는다 — 좋고 나쁨은 팀이 바뀌어도 같은 뜻이다 */
  .g-fill[data-tone="ok"] {
    background: var(--ok);
  }
  .g-fill[data-tone="warn"] {
    background: var(--warn);
  }
  .g-fill[data-tone="bad"] {
    background: var(--bad);
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-top: 10px;
  }
  .tag {
    font-size: 10.5px;
    color: var(--t-dark);
    border: 1px solid var(--line-strong);
    border-radius: 999px;
    padding: 1px 7px;
  }

  /* ── 다음 경기 ── */
  .nx-top {
    display: flex;
    align-items: baseline;
    gap: 7px;
    margin-top: 6px;
  }
  .nx-date {
    font-size: 19px;
    font-weight: 800;
    color: var(--ink);
    line-height: 1;
  }
  .nx-side {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.08em;
    padding: 1px 6px;
    border-radius: 2px;
    background: var(--panel-sunk);
    color: var(--ink-mute);
  }
  .nx-side.home {
    background: var(--t-dark);
    color: var(--t-gold);
  }

  .nx-opp {
    margin: 5px 0 0;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nx-when {
    margin: 1px 0 0;
    font-size: 11px;
    color: var(--ink-mute);
  }

  /* ── 순위 ── */
  .rk-top {
    display: flex;
    align-items: baseline;
    gap: 3px;
    margin-top: 6px;
  }
  .rk {
    font-size: 26px;
    font-weight: 800;
    line-height: 1;
    color: var(--t-dark);
  }
  .rk-top i {
    font-style: normal;
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-mid);
  }
  .rk-of {
    font-size: 11px;
    color: var(--ink-mute);
    margin-left: 4px;
  }
  /* 어느 범위의 순위인지 — 안 적으면 권역인지 전국인지 모른다 */
  .rk-scope {
    margin-left: auto;
    font-size: 10px;
    font-weight: 700;
    color: var(--ink-mute);
    background: var(--panel-sunk);
    border-radius: 10px;
    padding: 1px 7px;
  }
  .rk-nat {
    margin: 3px 0 0;
    font-size: 11.5px;
    color: var(--ink-mute);
  }
  .rk-nat b {
    color: var(--ink-mid);
    font-weight: 700;
  }

  .rk-rec {
    margin: 5px 0 0;
    font-size: 12px;
    color: var(--ink-mid);
  }
  .rk-streak {
    margin: 2px 0 0;
    font-size: 11px;
    color: var(--ink-mute);
    letter-spacing: 0.06em;
  }

  /* ── 로그 ── */
  .logs {
    min-height: 0;
  }
  .log-list {
    margin-top: 6px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .log-list p {
    margin: 0;
    font-size: 11.5px;
    line-height: 1.4;
    color: var(--ink-mid);
    padding-left: 8px;
    border-left: 2px solid var(--line);
  }

  .none {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--ink-mute);
  }
</style>
