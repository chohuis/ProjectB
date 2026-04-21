<script lang="ts">
  type StatGroup = {
    title: string;
    items: Array<{ label: string; value: number }>;
  };

  const profile = {
    name: "정서겸",
    team: "서울 이노베이션 고",
    year: "2학년",
    position: "SP",
    role: "에이스 선발",
    throws: "좌투",
    bats: "우타",
    overall: 84,
    potentialHidden: 93,
    condition: 82,
    fatigue: 28,
    tags: ["핵심", "멘탈관리", "선발 로테이션"]
  };

  const statGroups: StatGroup[] = [
    {
      title: "신체",
      items: [
        { label: "힘", value: 23 },
        { label: "순발력", value: 25 },
        { label: "스피드", value: 24 },
        { label: "유연성", value: 23 },
        { label: "밸런스", value: 26 },
        { label: "체력", value: 25 },
        { label: "회복력", value: 22 },
        { label: "하체 드라이브", value: 25 }
      ]
    },
    {
      title: "기술",
      items: [
        { label: "패스트볼", value: 29 },
        { label: "커맨드", value: 30 },
        { label: "무브먼트", value: 29 },
        { label: "세컨더리", value: 30 },
        { label: "체인지업", value: 25 },
        { label: "슬라이더", value: 30 },
        { label: "스피드 유지", value: 29 },
        { label: "주자 견제", value: 29 }
      ]
    },
    {
      title: "멘탈",
      items: [
        { label: "집중력", value: 27 },
        { label: "멘탈 회복", value: 24 },
        { label: "리더십", value: 20 },
        { label: "천재성", value: 26 },
        { label: "침착성", value: 25 }
      ]
    }
  ];

  const recentChanges = [
    { when: "오늘", text: "불펜 세션 이후 커맨드 +1" },
    { when: "어제", text: "회복 프로그램 적용으로 피로도 -3" },
    { when: "3일 전", text: "라이브 피칭 평가에서 슬라이더 안정" },
    { when: "4일 전", text: "멘탈 케어 루틴 적용으로 집중력 소폭 상승" }
  ];

  function statTone(value: number): "good" | "mid" | "low" {
    if (value >= 27) return "good";
    if (value >= 20) return "mid";
    return "low";
  }
</script>

<section class="page">
  <h2>상태</h2>

  <article class="card profile-card">
    <div class="identity">
      <p class="name">{profile.name}</p>
      <p class="meta">
        {profile.team} · {profile.year} · {profile.position} · {profile.role}
      </p>
      <p class="meta">{profile.throws} / {profile.bats}</p>
      <div class="tags">
        {#each profile.tags as tag}
          <span>{tag}</span>
        {/each}
      </div>
    </div>

    <div class="summary-grid">
      <div class="summary-item">
        <span>OVR</span>
        <strong>{profile.overall}</strong>
      </div>
      <div class="summary-item">
        <span>컨디션</span>
        <strong>{profile.condition}</strong>
      </div>
      <div class="summary-item">
        <span>피로도</span>
        <strong>{profile.fatigue}</strong>
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
    <h3>최근 변동</h3>
    <ul class="changes-list">
      {#each recentChanges as log}
        <li>
          <span class="when">{log.when}</span>
          <span class="desc">{log.text}</span>
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
    grid-template-columns: repeat(3, minmax(80px, 1fr));
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
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
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
    display: grid;
    grid-template-columns: 72px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid #253451;
  }

  .changes-list li:first-child {
    border-top: 0;
    padding-top: 0;
  }

  .when {
    color: #9fb3d9;
    font-size: 13px;
  }

  .desc {
    color: #e4edff;
    font-size: 14px;
  }

  @media (max-width: 1200px) {
    .stats-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 960px) {
    .profile-card {
      grid-template-columns: 1fr;
    }

    .summary-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
