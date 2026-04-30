<script lang="ts">
  import { masterStore } from "../../shared/stores/master";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { generateSchedule } from "../../shared/utils/scheduleGen";
  import type { Handedness, PitchingForm, ProtagonistSave } from "../../shared/types/save";

  export let onComplete: () => void;

  // ── 단계 ──────────────────────────────────────────────────────
  let step = 1;

  // ── Step 1 상태 ────────────────────────────────────────────────
  let playerName = "";
  let handedness: Handedness = "R";
  let pitchingForm: PitchingForm = "overhand";

  const handednessOptions: { value: Handedness; label: string }[] = [
    { value: "R", label: "우투" },
    { value: "L", label: "좌투" },
    { value: "S", label: "양투" },
  ];

  const formOptions: { value: PitchingForm; label: string; desc: string }[] = [
    { value: "overhand",     label: "오버핸드",  desc: "표준 릴리스. 낙차 있는 직구와 커브에 유리" },
    { value: "threeQuarter", label: "스리쿼터",  desc: "각도로 승부. 슬라이더·투심 효과 증대" },
    { value: "sidearm",      label: "사이드암",  desc: "횡방향 무브먼트 특화. 동일 손 타자 봉쇄" },
    { value: "underhand",    label: "언더스로",  desc: "타이밍 파괴형. 구위 손실, 무브먼트 극대화" },
  ];

  // ── Step 2 상태 ────────────────────────────────────────────────
  let selectedTeamId = "";
  let entitiesLoaded = false;

  $: hsTeams = $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL");
  $: selectedTeam = hsTeams.find((t) => t.id === selectedTeamId) ?? null;

  // Step 2 진입 시 엔티티 로드
  $: if (step === 2 && !entitiesLoaded) {
    entitiesLoaded = true;
    masterStore.loadEntities("LEAGUE_HIGHSCHOOL");
  }

  // 선택된 팀의 감독·코치·선수 필터
  $: teamEntities = selectedTeamId
    ? $masterStore.entities.filter((e) => e.teamId === selectedTeamId)
    : [];
  $: teamManager = teamEntities.find((e) => e.role === "manager") ?? null;
  $: teamCoaches = teamEntities.filter((e) => e.role === "coach").slice(0, 2);
  $: teamPlayers = teamEntities.filter((e) => e.role === "player").slice(0, 4);

  // ── Step 3 상태 ────────────────────────────────────────────────
  type PresetKey = "balanced" | "power" | "control" | "movement";
  let selectedPreset: PresetKey = "balanced";

  const PRESETS: Record<
    PresetKey,
    { label: string; desc: string; tags: string[]; pitching: ProtagonistSave["pitching"] }
  > = {
    balanced: {
      label: "균형형",
      desc: "모든 능력치가 고르게 발달한 정통파 투수",
      tags: ["정통파", "균형형"],
      pitching: { ovr: 55, velocity: 55, command: 58, control: 55, movement: 53, mentality: 55, stamina: 56, recovery: 54 },
    },
    power: {
      label: "파워피처",
      desc: "강속구가 무기. 아직 제구는 거칠지만 잠재력은 최상",
      tags: ["급성장", "파워피처"],
      pitching: { ovr: 52, velocity: 68, command: 48, control: 45, movement: 50, mentality: 52, stamina: 52, recovery: 48 },
    },
    control: {
      label: "제구형",
      desc: "정밀한 제구와 커맨드로 타자를 요리하는 스마트 피처",
      tags: ["멘탈관리", "제구형"],
      pitching: { ovr: 58, velocity: 48, command: 68, control: 65, movement: 58, mentality: 58, stamina: 54, recovery: 56 },
    },
    movement: {
      label: "무브먼트형",
      desc: "날카롭게 꺾이는 변화구로 땅볼을 유도하는 피네스 피처",
      tags: ["무브먼트", "피네스"],
      pitching: { ovr: 55, velocity: 52, command: 55, control: 52, movement: 68, mentality: 55, stamina: 50, recovery: 52 },
    },
  };

  // ── 유효성 검사 ────────────────────────────────────────────────
  $: step1Valid = playerName.trim().length > 0;
  $: step2Valid = selectedTeamId !== "";

  function next() {
    if (step === 1 && !step1Valid) return;
    if (step === 2 && !step2Valid) return;
    step++;
  }

  function prev() {
    if (step > 1) step--;
  }

  // ── 게임 시작 ──────────────────────────────────────────────────
  async function startGame() {
    const preset = PRESETS[selectedPreset];
    const teamIds = hsTeams.map((t) => t.id);
    const potentialHidden = Math.floor(Math.random() * 31) + 60;
    const developmentRate = Math.floor(Math.random() * 16) + 55;

    const protagonist: ProtagonistSave = {
      id: "PLY_HERO",
      name: playerName.trim(),
      careerStage: "highschool",
      leagueId: "LEAGUE_HIGHSCHOOL",
      teamId: selectedTeamId,
      schoolId: selectedTeamId.replace("TEAM_HS_", "SCHOOL_HS_"),
      grade: 1,
      age: 16,
      playerType: "pitcher",
      position: "",
      handedness,
      pitchingForm,
      jerseyNumber: 18,
      condition: 80,
      fatigue: 10,
      morale: 70,
      pitching: preset.pitching,
      batting: {
        ovr: 30, contact: 30, power: 25, eye: 28, discipline: 28,
        speed: 48, fielding: 40, arm: 50, battingClutch: 25,
      },
      developmentRate,
      potentialHidden,
      growthPoints: 0,
      tags: preset.tags,
      pitchingXP: {},
      learnedPitchIds: ["PITCH_FASTBALL"],
    };

    gameStore.initNew(protagonist);
    seasonStore.initSeason("LEAGUE_HIGHSCHOOL", 2026, 52, teamIds);
    const schedule = generateSchedule(teamIds, selectedTeamId, 52);
    seasonStore.setSchedule(schedule);

    onComplete();
  }

  // ── 팀 이름 표시 ───────────────────────────────────────────────
  $: selectedTeamName = hsTeams.find((t) => t.id === selectedTeamId)?.name ?? "";

  const handednessLabel: Record<Handedness, string> = { R: "우투", L: "좌투", S: "양투" };
  const formLabel: Record<PitchingForm, string> = {
    overhand: "오버핸드", threeQuarter: "스리쿼터", sidearm: "사이드암", underhand: "언더스로",
  };
</script>

<div class="page">
  <!-- 스테퍼 -->
  <header class="stepper">
    {#each [1, 2, 3, 4] as s}
      <div class="step" class:active={step === s} class:done={step > s}>
        <span class="num">{s}</span>
        <span class="label">{["기본 정보", "팀 선택", "능력치", "확인"][s - 1]}</span>
      </div>
      {#if s < 4}<div class="divider" class:done={step > s}></div>{/if}
    {/each}
  </header>

  <!-- 컨텐츠 -->
  <main class="content">

    <!-- Step 1 -->
    {#if step === 1}
      <section class="step-body">
        <h2>선수 기본 정보</h2>

        <div class="field">
          <label for="pname">선수 이름</label>
          <input
            id="pname"
            type="text"
            bind:value={playerName}
            placeholder="이름을 입력하세요"
            maxlength="20"
            class:error={playerName.length === 0 && step === 1}
          />
        </div>

        <div class="field">
          <label>투구 방향</label>
          <div class="radio-row">
            {#each handednessOptions as opt}
              <button
                class="radio-btn"
                class:selected={handedness === opt.value}
                on:click={() => (handedness = opt.value)}
              >
                {opt.label}
              </button>
            {/each}
          </div>
        </div>

        <div class="field">
          <label>투구 폼</label>
          <div class="form-cards">
            {#each formOptions as opt}
              <button
                class="form-card"
                class:selected={pitchingForm === opt.value}
                on:click={() => (pitchingForm = opt.value)}
              >
                <strong>{opt.label}</strong>
                <p>{opt.desc}</p>
              </button>
            {/each}
          </div>
        </div>
      </section>

    <!-- Step 2 -->
    {:else if step === 2}
      <section class="step2-layout">
        <div class="step2-top">
          <h2>팀 선택</h2>
          <p class="sub">소속할 고등학교 팀을 선택하세요</p>
        </div>

        {#if $masterStore.loaded && hsTeams.length > 0}
          <div class="team-grid">
            {#each hsTeams as team}
              <button
                class="team-card"
                class:selected={selectedTeamId === team.id}
                on:click={() => (selectedTeamId = team.id)}
              >
                <strong>{team.name}</strong>
                {#if team.nameEn}<span>{team.nameEn}</span>{/if}
              </button>
            {/each}
          </div>
        {:else}
          <p class="loading-msg">팀 데이터 로드 중...</p>
        {/if}

        {#if selectedTeam}
          <div class="detail-panel">
            <!-- 왼쪽: 팀 특징 -->
            <aside class="profile-col">
              {#if selectedTeam.profile}
                <div class="style-badge">{selectedTeam.profile.style}</div>
                <p class="team-desc">{selectedTeam.profile.desc}</p>
                <div class="tag-row">
                  {#each selectedTeam.profile.tags as tag}
                    <span class="tag">{tag}</span>
                  {/each}
                </div>
                <div class="strength-section">
                  <p class="section-label">강점</p>
                  <div class="strength-chips">
                    {#each selectedTeam.profile.strengths as s}
                      <span class="strength-chip">{s}</span>
                    {/each}
                  </div>
                </div>
              {/if}
            </aside>

            <!-- 오른쪽: 스태프·선수 -->
            <div class="roster-col">
              {#if teamManager}
                <div class="section-label">감독</div>
                <div class="entity-card manager-card">
                  <span class="entity-name">{teamManager.name}</span>
                  <span class="entity-badge manager">감독</span>
                  <span class="entity-sub">{teamManager.details.manager?.style ?? ""} · {teamManager.age}세</span>
                </div>
              {/if}

              {#if teamCoaches.length > 0}
                <div class="section-label">코치</div>
                <div class="entity-list">
                  {#each teamCoaches as coach}
                    <div class="entity-card">
                      <span class="entity-name">{coach.name}</span>
                      <span class="entity-badge coach">코치</span>
                      <span class="entity-sub">{coach.details.coach?.specialty ?? "-"} 전문 · {coach.age}세</span>
                    </div>
                  {/each}
                </div>
              {/if}

              {#if teamPlayers.length > 0}
                <div class="section-label">주요 선수</div>
                <div class="entity-list">
                  {#each teamPlayers as player}
                    {@const pd = player.details.player}
                    <div class="entity-card player-card">
                      <div class="player-main">
                        <span class="entity-name">{player.name}</span>
                        <span class="entity-badge player">{pd?.position ?? "?"}</span>
                        <span class="player-grade">{player.grade}학년</span>
                      </div>
                      <div class="player-stats">
                        <span class="stat-pill">OVR <strong>{pd?.pitching?.ovr ?? pd?.batting?.ovr ?? "-"}</strong></span>
                        <span class="stat-pill">{pd?.handedness === "L" ? "좌투" : pd?.handedness === "S" ? "양투" : "우투"}</span>
                        <span class="stat-pill">구위 <strong>{pd?.pitching?.velocity ?? "-"}</strong></span>
                      </div>
                    </div>
                  {/each}
                </div>
              {:else if $masterStore.entities.length === 0}
                <p class="loading-msg">선수 정보 로드 중...</p>
              {/if}
            </div>
          </div>
        {:else}
          <div class="detail-placeholder">
            팀을 선택하면 상세 정보가 표시됩니다
          </div>
        {/if}
      </section>

    <!-- Step 3 -->
    {:else if step === 3}
      <section class="step-body">
        <h2>능력치 프리셋</h2>
        <p class="sub">초기 능력치 유형을 선택하세요. 성장하면서 바뀔 수 있습니다.</p>

        <div class="preset-grid">
          {#each Object.entries(PRESETS) as [key, preset]}
            <button
              class="preset-card"
              class:selected={selectedPreset === key}
              on:click={() => (selectedPreset = key as PresetKey)}
            >
              <strong>{preset.label}</strong>
              <p>{preset.desc}</p>
              <ul class="stat-mini">
                <li><span>구위</span><span>{preset.pitching.velocity}</span></li>
                <li><span>커맨드</span><span>{preset.pitching.command}</span></li>
                <li><span>제구</span><span>{preset.pitching.control}</span></li>
                <li><span>무브먼트</span><span>{preset.pitching.movement}</span></li>
                <li><span>멘탈</span><span>{preset.pitching.mentality}</span></li>
                <li><span>스태미나</span><span>{preset.pitching.stamina}</span></li>
              </ul>
            </button>
          {/each}
        </div>
      </section>

    <!-- Step 4 -->
    {:else if step === 4}
      <section class="step-body">
        <h2>확인</h2>
        <p class="sub">아래 내용으로 게임을 시작합니다.</p>

        <div class="summary-card">
          <div class="summary-row">
            <span class="key">이름</span>
            <span class="val">{playerName}</span>
          </div>
          <div class="summary-row">
            <span class="key">투구 방향</span>
            <span class="val">{handednessLabel[handedness]}</span>
          </div>
          <div class="summary-row">
            <span class="key">투구 폼</span>
            <span class="val">{formLabel[pitchingForm]}</span>
          </div>
          <div class="summary-row">
            <span class="key">팀</span>
            <span class="val">{selectedTeamName}</span>
          </div>
          <div class="summary-row">
            <span class="key">프리셋</span>
            <span class="val">{PRESETS[selectedPreset].label}</span>
          </div>
          <div class="summary-row">
            <span class="key">리그</span>
            <span class="val">2026 고교 주말 리그</span>
          </div>
        </div>
      </section>
    {/if}
  </main>

  <!-- 하단 버튼 -->
  <footer class="nav">
    {#if step > 1}
      <button class="btn back" on:click={prev}>이전</button>
    {:else}
      <div></div>
    {/if}

    {#if step < 4}
      <button
        class="btn next"
        on:click={next}
        disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
      >
        다음
      </button>
    {:else}
      <button class="btn start" on:click={startGame}>게임 시작</button>
    {/if}
  </footer>
</div>

<style>
  .page {
    width: 100vw;
    height: 100vh;
    background: #080f1e;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    color: #e4edff;
    font-family: inherit;
  }

  /* ── 스테퍼 ── */
  .stepper {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 28px 40px 20px;
    gap: 0;
  }

  .step {
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0.35;
    transition: opacity 0.2s;
  }

  .step.active,
  .step.done {
    opacity: 1;
  }

  .step .num {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #3a5a96;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    background: #0e1929;
  }

  .step.active .num {
    background: #2b5aaa;
    border-color: #5a8fe8;
    color: #fff;
  }

  .step.done .num {
    background: #1a4060;
    border-color: #3a6aaa;
    color: #88b8f0;
  }

  .step .label {
    font-size: 13px;
    color: #9bbce8;
    white-space: nowrap;
  }

  .divider {
    flex: 1;
    height: 2px;
    background: #1e2f4a;
    margin: 0 12px;
    min-width: 40px;
    max-width: 100px;
    transition: background 0.2s;
  }

  .divider.done {
    background: #2b5aaa;
  }

  /* ── 컨텐츠 ── */
  .content {
    overflow-y: auto;
    padding: 0 40px;
  }

  .step-body {
    max-width: 640px;
    margin: 0 auto;
    padding: 8px 0 32px;
  }

  h2 {
    margin: 0 0 4px;
    font-size: 24px;
    color: #ebf3ff;
  }

  .sub {
    margin: 0 0 24px;
    color: #7a9ac8;
    font-size: 14px;
  }

  /* ── 필드 ── */
  .field {
    margin-bottom: 28px;
  }

  label {
    display: block;
    margin-bottom: 8px;
    font-size: 14px;
    color: #a8c4e8;
    font-weight: 600;
  }

  input[type="text"] {
    width: 100%;
    background: #111d34;
    border: 1px solid #2d4470;
    border-radius: 8px;
    padding: 12px 14px;
    color: #e8f2ff;
    font-size: 16px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="text"]:focus {
    border-color: #5a8fe8;
  }

  input.error {
    border-color: #804040;
  }

  /* ── 라디오 버튼 ── */
  .radio-row {
    display: flex;
    gap: 10px;
  }

  .radio-btn {
    padding: 10px 22px;
    border: 1px solid #2d4470;
    border-radius: 8px;
    background: #111d34;
    color: #b8d0f7;
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .radio-btn.selected {
    background: #1e3d7a;
    border-color: #5a8fe8;
    color: #fff;
  }

  /* ── 투구 폼 카드 ── */
  .form-cards {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .form-card {
    text-align: left;
    padding: 14px;
    border: 1px solid #2d4470;
    border-radius: 10px;
    background: #111d34;
    color: #e4edff;
    cursor: pointer;
    transition: all 0.15s;
  }

  .form-card.selected {
    border-color: #5a8fe8;
    background: #1a3360;
  }

  .form-card strong {
    display: block;
    font-size: 15px;
    margin-bottom: 6px;
  }

  .form-card p {
    margin: 0;
    font-size: 12px;
    color: #8aabcf;
    line-height: 1.5;
  }

  /* ── Step 2 전용 레이아웃 ── */
  .step2-layout {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 8px 0 32px;
  }

  .step2-top h2 { margin: 0 0 4px; font-size: 24px; color: #ebf3ff; }

  /* ── 팀 그리드 ── */
  .team-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .team-card {
    padding: 14px 10px;
    border: 1px solid #2d4470;
    border-radius: 10px;
    background: #111d34;
    color: #e4edff;
    cursor: pointer;
    text-align: center;
    transition: all 0.15s;
  }

  .team-card.selected {
    border-color: #5a8fe8;
    background: #1a3360;
  }

  .team-card strong {
    display: block;
    font-size: 13px;
  }

  .team-card span {
    display: block;
    font-size: 11px;
    color: #6a8fbc;
    margin-top: 3px;
  }

  .loading-msg {
    color: #5a7aa8;
    font-size: 14px;
  }

  /* ── 상세 패널 ── */
  .detail-panel {
    display: grid;
    grid-template-columns: 240px minmax(0, 1fr);
    gap: 12px;
  }

  .detail-placeholder {
    text-align: center;
    color: #3d5880;
    font-size: 14px;
    padding: 32px 0;
    border: 1px dashed #2a3f60;
    border-radius: 10px;
  }

  /* ── 프로필 열 ── */
  .profile-col {
    background: #0d1928;
    border: 1px solid #1e3050;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .style-badge {
    display: inline-block;
    background: #1a3060;
    border: 1px solid #3a62a8;
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 700;
    color: #88b8f8;
    align-self: flex-start;
  }

  .team-desc {
    margin: 0;
    font-size: 13px;
    color: #9bb4d8;
    line-height: 1.65;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    background: #152238;
    border: 1px solid #2a4060;
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 11px;
    color: #7a9ac8;
  }

  .strength-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: 11px;
    color: #4a6888;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }

  .strength-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .strength-chip {
    background: #0e2438;
    border: 1px solid #1e5080;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    color: #5a9ad8;
    font-weight: 600;
  }

  /* ── 로스터 열 ── */
  .roster-col {
    background: #0d1928;
    border: 1px solid #1e3050;
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
  }

  .entity-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .entity-card {
    background: #111e34;
    border: 1px solid #253650;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .manager-card {
    border-color: #2d4a80;
    background: #0f1e38;
  }

  .entity-name {
    font-size: 13px;
    font-weight: 600;
    color: #d8e8ff;
    flex: 0 0 auto;
  }

  .entity-badge {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    flex: 0 0 auto;
  }

  .entity-badge.manager {
    background: #1e3d7a;
    border: 1px solid #3a6ab0;
    color: #88b8f8;
  }

  .entity-badge.coach {
    background: #1a3a28;
    border: 1px solid #2a6040;
    color: #70c890;
  }

  .entity-badge.player {
    background: #3a2010;
    border: 1px solid #805030;
    color: #d0a060;
  }

  .entity-sub {
    font-size: 11px;
    color: #5a7a9a;
  }

  .player-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .player-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .player-grade {
    font-size: 11px;
    color: #4a6888;
  }

  .player-stats {
    display: flex;
    gap: 6px;
  }

  .stat-pill {
    background: #0e1e34;
    border: 1px solid #1e3050;
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    color: #7a9ac8;
  }

  .stat-pill strong {
    color: #b8d8f8;
    font-weight: 700;
  }

  /* ── 프리셋 그리드 ── */
  .preset-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .preset-card {
    text-align: left;
    padding: 16px;
    border: 1px solid #2d4470;
    border-radius: 10px;
    background: #111d34;
    color: #e4edff;
    cursor: pointer;
    transition: all 0.15s;
  }

  .preset-card.selected {
    border-color: #5a8fe8;
    background: #1a3360;
  }

  .preset-card strong {
    display: block;
    font-size: 16px;
    margin-bottom: 6px;
  }

  .preset-card p {
    margin: 0 0 12px;
    font-size: 12px;
    color: #8aabcf;
    line-height: 1.5;
  }

  .stat-mini {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
  }

  .stat-mini li {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #9db6d8;
    border-bottom: 1px solid #1e3050;
    padding: 3px 0;
  }

  /* ── 요약 카드 ── */
  .summary-card {
    background: #111d34;
    border: 1px solid #2d4470;
    border-radius: 12px;
    padding: 20px;
    display: grid;
    gap: 0;
  }

  .summary-row {
    display: grid;
    grid-template-columns: 100px minmax(0, 1fr);
    gap: 12px;
    padding: 12px 0;
    border-bottom: 1px solid #1e3050;
    align-items: center;
  }

  .summary-row:last-child {
    border-bottom: 0;
  }

  .key {
    font-size: 13px;
    color: #7a9ac8;
  }

  .val {
    font-size: 15px;
    color: #ebf3ff;
    font-weight: 600;
  }

  /* ── 하단 네비 ── */
  .nav {
    display: flex;
    justify-content: space-between;
    padding: 20px 40px 32px;
    max-width: 720px;
    margin: 0 auto;
    width: 100%;
    box-sizing: border-box;
  }

  .btn {
    padding: 12px 32px;
    border: 0;
    border-radius: 10px;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .btn.back {
    background: #1a2840;
    color: #9bbce8;
    border: 1px solid #2e4872;
  }

  .btn.back:hover {
    background: #243655;
  }

  .btn.next {
    background: #2b5aaa;
    color: #fff;
  }

  .btn.next:hover:not(:disabled) {
    background: #3a6ecf;
  }

  .btn.next:disabled {
    background: #1a2a4a;
    color: #4a6888;
    cursor: default;
  }

  .btn.start {
    background: #1a6640;
    color: #fff;
    padding: 12px 48px;
  }

  .btn.start:hover {
    background: #22854f;
  }
</style>
