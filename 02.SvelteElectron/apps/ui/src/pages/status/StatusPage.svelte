<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { teamMap } from "../../shared/stores/master";
  import { t } from "../../shared/i18n";

  type StatusTab = "stats" | "record";
  let activeTab: StatusTab = "stats";

  type StatGroup = {
    title: string;
    items: Array<{ label: string; value: number }>;
  };

  $: statGroups = buildStatGroups($gameStore.protagonist);
  $: myStats = $seasonStore.stats[$gameStore.protagonist.id] ?? null;

  function buildStatGroups(p: typeof $gameStore.protagonist): StatGroup[] {
    const pit = p.pitching;
    const bat = p.batting;
    const groups: StatGroup[] = [];

    if (p.playerType === "pitcher" || p.playerType === "twoWay") {
      groups.push({
        title: "투구",
        items: [
          { label: "OVR",      value: pit.ovr },
          { label: "구위",     value: pit.velocity },
          { label: "커맨드",   value: pit.command },
          { label: "제구",     value: pit.control },
          { label: "무브먼트", value: pit.movement },
          { label: "멘탈",     value: pit.mentality },
          { label: "스태미나", value: pit.stamina },
          { label: "회복력",   value: pit.recovery },
          { label: "위기집중", value: pit.clutch },
          { label: "견제력",   value: pit.holdRunners },
        ],
      });
    }

    if (p.playerType === "batter" || p.playerType === "twoWay") {
      groups.push({
        title: "타격",
        items: [
          { label: "OVR",    value: bat.ovr },
          { label: "컨택",   value: bat.contact },
          { label: "장타력", value: bat.power },
          { label: "선구안", value: bat.eye },
          { label: "극기",   value: bat.discipline },
          { label: "클러치", value: bat.battingClutch },
          { label: "플래툰", value: bat.platoon },
          { label: "번트",   value: bat.bunting },
        ],
      });
      groups.push({
        title: "주루·수비",
        items: [
          { label: "주력",     value: bat.speed },
          { label: "주루판단", value: bat.baseInstinct },
          { label: "수비",     value: bat.fielding },
          { label: "어깨",     value: bat.arm },
        ],
      });
    }

    return groups;
  }

  function statTone(value: number): "good" | "mid" | "low" {
    if (value >= 70) return "good";
    if (value >= 50) return "mid";
    return "low";
  }

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };

  const GRADE_LABEL: Record<number, string> = {
    1: "습득중", 2: "기초", 3: "보통", 4: "능숙", 5: "마스터",
  };
</script>

<section class="page">
  <h2>{$t("page.status")}</h2>

  <article class="card profile-card">
    <div class="identity">
      <p class="name">{$gameStore.player.name}</p>
      <p class="meta">
        {$teamMap.get($gameStore.protagonist.teamId)?.name ?? $gameStore.player.team} · {$gameStore.player.year} · {$gameStore.player.position} · {$gameStore.player.role}
      </p>
      <p class="meta">{$gameStore.player.throws} / {$gameStore.player.bats}</p>
      <div class="tags">
        {#each $gameStore.player.tags as tag}
          <span>{tag}</span>
        {/each}
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <span>OVR</span>
        <strong>{$gameStore.player.overall}</strong>
      </div>
      <div class="summary-item">
        <span>컨디션</span>
        <strong>{$gameStore.player.condition}</strong>
      </div>
      <div class="summary-item">
        <span>피로도</span>
        <strong>{$gameStore.player.fatigue}</strong>
      </div>
      <div class="summary-item">
        <span>사기</span>
        <strong>{$gameStore.player.morale}</strong>
      </div>
    </div>
  </article>

  <nav class="tab-bar">
    <button class:tab-active={activeTab === "stats"} on:click={() => (activeTab = "stats")}>능력치</button>
    <button class:tab-active={activeTab === "record"} on:click={() => (activeTab = "record")}>성적</button>
  </nav>

  <div class="tab-content">
    {#if activeTab === "stats"}
      <div class="stats-grid">
        {#each statGroups as group}
          <article class="card stat-card">
            <h3>{group.title}</h3>
            <div class="stat-list">
              {#each group.items as stat}
                <div class="stat-item">
                  <span class="label">{stat.label}</span>
                  <span class={`value ${statTone(stat.value)}`}>{stat.value}</span>
                </div>
              {/each}
            </div>
          </article>
        {/each}
      </div>

      {#if $gameStore.protagonist.playerType === "pitcher" || $gameStore.protagonist.playerType === "twoWay"}
        {#if ($gameStore.protagonist.pitches ?? []).length > 0}
          <article class="card pitches-card">
            <h3>보유 구종</h3>
            <div class="pitch-list">
              {#each $gameStore.protagonist.pitches as pitch}
                <div class="pitch-item grade-{pitch.grade}">
                  <span class="pitch-name">{PITCH_NAMES[pitch.id] ?? pitch.id}</span>
                  <span class="pitch-grade">{GRADE_LABEL[pitch.grade] ?? pitch.grade}</span>
                </div>
              {/each}
            </div>
          </article>
        {/if}
      {/if}

    {:else}
      <article class="card record-card">
        <h3>시즌 누적 성적</h3>
        {#if myStats?.type === "pitcher"}
          <div class="record-grid">
            {#each [
              ["G",    myStats.g],
              ["W",    myStats.w],
              ["L",    myStats.l],
              ["SV",   myStats.sv],
              ["HD",   myStats.hd],
              ["IP",   myStats.ip],
              ["ERA",  myStats.era?.toFixed(2)],
              ["WHIP", myStats.whip?.toFixed(2)],
              ["K",    myStats.k],
              ["BB",   myStats.bb],
              ["H",    myStats.h],
              ["ER",   myStats.er],
            ] as [lbl, val]}
              <div class="record-item">
                <span class="rec-label">{lbl}</span>
                <strong class="rec-value">{val ?? "-"}</strong>
              </div>
            {/each}
          </div>
        {:else if myStats?.type === "batter"}
          <div class="record-grid">
            {#each [
              ["G",   myStats.g],
              ["AVG", myStats.avg?.toFixed(2)],
              ["OPS", myStats.ops?.toFixed(2)],
              ["HR",  myStats.hr],
              ["RBI", myStats.rbi],
              ["SB",  myStats.sb],
              ["BB",  myStats.bb],
              ["K",   myStats.k],
              ["H",   myStats.h],
              ["AB",  myStats.ab],
              ["PA",  myStats.pa],
              ["OBP", myStats.obp?.toFixed(2)],
            ] as [lbl, val]}
              <div class="record-item">
                <span class="rec-label">{lbl}</span>
                <strong class="rec-value">{val ?? "-"}</strong>
              </div>
            {/each}
          </div>
        {:else}
          <p class="pending">시즌 누적 집계 중</p>
        {/if}
      </article>
    {/if}
  </div>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2, h3, p { margin: 0; }
  h2 { font-size: 22px; }

  .card {
    background: #161f33;
    border: 1px solid #2d3956;
    border-radius: 10px;
    padding: 12px;
  }

  .profile-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }

  .name { font-size: 22px; font-weight: 700; color: #f1f6ff; }
  .meta { margin-top: 4px; color: #aebddd; font-size: 14px; }

  .tags { margin-top: 10px; display: flex; gap: 6px; flex-wrap: wrap; }
  .tags span {
    font-size: 12px; color: #d5e2fd;
    border: 1px solid #3c4f74; background: #233250;
    border-radius: 999px; padding: 4px 8px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(70px, 1fr));
    gap: 8px;
  }
  .summary-item {
    background: #0f1830; border: 1px solid #314362;
    border-radius: 8px; padding: 8px; text-align: center;
  }
  .summary-item span { font-size: 12px; color: #92a8ce; }
  .summary-item strong { display: block; margin-top: 4px; font-size: 20px; color: #f1f6ff; }

  .tab-bar {
    display: flex;
    gap: 6px;
    border-bottom: 1px solid #253451;
    padding-bottom: 8px;
  }
  .tab-bar button {
    background: none; border: 1px solid transparent;
    border-radius: 7px; color: #7a9ac8;
    font-size: 13px; padding: 5px 20px; cursor: pointer;
  }
  .tab-bar button.tab-active {
    background: #1d3760; border-color: #3a5a96;
    color: #d8e8ff; font-weight: 600;
  }

  .tab-content {
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
  }

  .stat-card h3 { font-size: 16px; margin-bottom: 10px; color: #ebf2ff; }

  .stat-list {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }
  .stat-item {
    border: 1px solid #2e486f; border-radius: 8px;
    background: #152b4f; padding: 8px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .label { color: #9eb6de; font-size: 11px; }
  .value { font-size: 18px; font-weight: 700; }
  .value.good { color: #68de92; }
  .value.mid  { color: #d8e8ff; }
  .value.low  { color: #ffb58a; }

  .pitches-card h3 { margin-bottom: 10px; }
  .pitch-list { display: flex; flex-wrap: wrap; gap: 8px; }
  .pitch-item {
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    background: #152b4f; border: 1px solid #2e486f;
    border-radius: 8px; padding: 8px 12px; min-width: 72px;
  }
  .pitch-name { font-size: 13px; font-weight: 700; color: #d5e2fd; }
  .pitch-grade { font-size: 11px; color: #7a9ac8; }
  .pitch-item.grade-5 { border-color: #c8a030; background: #2a1e06; }
  .pitch-item.grade-5 .pitch-name { color: #f0c860; }
  .pitch-item.grade-5 .pitch-grade { color: #c8a030; }
  .pitch-item.grade-4 { border-color: #3a7ad8; background: #0e2040; }
  .pitch-item.grade-4 .pitch-name { color: #88b8f8; }
  .pitch-item.grade-4 .pitch-grade { color: #5a8fd8; }
  .pitch-item.grade-1 { border-color: #3a4060; background: #10142a; }
  .pitch-item.grade-1 .pitch-name { color: #6878a8; }
  .pitch-item.grade-1 .pitch-grade { color: #485878; }

  .record-card h3 { font-size: 16px; margin-bottom: 12px; color: #ebf2ff; }
  .record-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 8px;
  }
  .record-item {
    background: #0f1830; border: 1px solid #314362;
    border-radius: 8px; padding: 10px 8px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .rec-label { font-size: 11px; color: #92a8ce; }
  .rec-value { font-size: 18px; font-weight: 700; color: #f1f6ff; }

  .pending { color: #9db2d8; font-size: 13px; }

  @media (max-width: 960px) {
    .profile-card { grid-template-columns: 1fr; }
    .summary-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .stats-grid { grid-template-columns: 1fr; }
    .record-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  }
</style>
