<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { t } from "../../shared/i18n";

  type StatGroup = {
    title: string;
    items: Array<{ label: string; value: number }>;
  };

  // 주인공 능력치 → statGroups 변환
  $: statGroups = buildStatGroups($gameStore.protagonist);

  function buildStatGroups(p: typeof $gameStore.protagonist): StatGroup[] {
    const pit = p.pitching;
    const bat = p.batting;
    return [
      {
        title: "투구",
        items: [
          { label: "OVR",    value: pit.ovr },
          { label: "구위",   value: pit.velocity },
          { label: "커맨드", value: pit.command },
          { label: "제구",   value: pit.control },
          { label: "무브먼트", value: pit.movement },
          { label: "멘탈",  value: pit.mentality },
          { label: "스태미나", value: pit.stamina },
          { label: "회복력", value: pit.recovery },
        ],
      },
      {
        title: "타격",
        items: [
          { label: "컨택",  value: bat.contact },
          { label: "파워",  value: bat.power },
          { label: "선구안", value: bat.eye },
          { label: "선구력", value: bat.discipline },
          { label: "스피드", value: bat.speed },
          { label: "수비",  value: bat.fielding },
          { label: "어깨",  value: bat.arm },
          { label: "클러치", value: bat.battingClutch },
        ],
      },
    ];
  }

  function statTone(value: number): "good" | "mid" | "low" {
    if (value >= 70) return "good";
    if (value >= 50) return "mid";
    return "low";
  }
</script>

<section class="page">
  <h2>{$t("page.status")}</h2>

  <article class="card profile-card">
    <div class="identity">
      <p class="name">{$gameStore.player.name}</p>
      <p class="meta">
        {$gameStore.player.team} · {$gameStore.player.year} · {$gameStore.player.position} · {$gameStore.player.role}
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

  <section class="stats-grid">
    {#each statGroups as group}
      <article class="card stat-card">
        <h3>{group.title}</h3>
        <ul class="stat-list">
          {#each group.items as stat}
            <li>
              <span class="label">{stat.label}</span>
              <span class={`value ${statTone(stat.value)}`}>{stat.value}</span>
            </li>
          {/each}
        </ul>
      </article>
    {/each}
  </section>

  <article class="card changes-card">
    <h3>최근 활동</h3>
    <ul class="changes-list">
      {#each $gameStore.logs.slice(0, 6) as log}
        <li>
          <span class="desc">{log}</span>
        </li>
      {/each}
    </ul>
  </article>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr) auto;
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2,
  h3,
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

  .profile-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
  }

  .name {
    font-size: 22px;
    font-weight: 700;
    color: #f1f6ff;
  }

  .meta {
    margin-top: 4px;
    color: #aebddd;
    font-size: 14px;
  }

  .tags {
    margin-top: 10px;
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tags span {
    font-size: 12px;
    color: #d5e2fd;
    border: 1px solid #3c4f74;
    background: #233250;
    border-radius: 999px;
    padding: 4px 8px;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(70px, 1fr));
    gap: 8px;
  }

  .summary-item {
    background: #0f1830;
    border: 1px solid #314362;
    border-radius: 8px;
    padding: 8px;
    text-align: center;
  }

  .summary-item span {
    font-size: 12px;
    color: #92a8ce;
  }

  .summary-item strong {
    display: block;
    margin-top: 4px;
    font-size: 20px;
    color: #f1f6ff;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
    overflow: hidden;
  }

  .stat-card {
    overflow-y: auto;
  }

  .stat-card h3 {
    font-size: 16px;
    margin-bottom: 10px;
    color: #ebf2ff;
  }

  .stat-list,
  .changes-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .stat-list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid #253451;
  }

  .stat-list li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .label {
    color: #cfddf9;
    font-size: 14px;
  }

  .value {
    min-width: 36px;
    text-align: right;
    font-weight: 700;
  }

  .value.good {
    color: #68de92;
  }

  .value.mid {
    color: #d8e8ff;
  }

  .value.low {
    color: #ffb58a;
  }

  .changes-card h3 {
    margin-bottom: 10px;
  }

  .changes-list li {
    padding: 8px 0;
    border-top: 1px solid #253451;
  }

  .changes-list li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .desc {
    color: #e4edff;
    font-size: 14px;
  }

  @media (max-width: 960px) {
    .profile-card {
      grid-template-columns: 1fr;
    }

    .summary-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
