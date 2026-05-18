<script lang="ts">
  import { masterStore } from "../../shared/stores/master";
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import { generateSchedule } from "../../shared/utils/scheduleGen";
  import { HS_SELECTABLE_TEAMS, shuffleHsGroups } from "../../shared/utils/leagueScheduler";
  import type { Handedness, PitchEntry, PitchingForm, ProtagonistSave } from "../../shared/types/save";

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
  ];

  const formOptions: { value: PitchingForm; label: string; desc: string }[] = [
    { value: "overhand",     label: "오버핸드",  desc: "표준 릴리스. 낙차 있는 직구와 커브에 유리" },
    { value: "sidearm",      label: "사이드암",  desc: "횡방향 무브먼트 특화. 동일 손 타자 봉쇄" },
    { value: "underhand",    label: "언더스로",  desc: "타이밍 파괴형. 구위 손실, 무브먼트 극대화" },
  ];

  // ── Step 2 상태 ────────────────────────────────────────────────
  let selectedTeamId = "";
  let entitiesLoaded = false;

  // 전체 고교팀 (16개) — 리그 구성용
  $: hsAllTeams = $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL");
  // 선택 가능한 팀 (8개) — 캐릭터 생성 UI 표시용
  $: hsTeams = hsAllTeams.filter((t) => HS_SELECTABLE_TEAMS.includes(t.id));
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
  type PresetKey = "balanced" | "power" | "control" | "stamina";
  let selectedPreset: PresetKey = "balanced";

  const PRESETS: Record<
    PresetKey,
    { label: string; desc: string; tags: string[]; pitching: ProtagonistSave["pitching"]; pitches: PitchEntry[] }
  > = {
    balanced: {
      label: "균형형",
      desc: "모든 부분이 고르게 발달. 성장 방향 자유도가 가장 높음",
      tags: ["정통파", "균형형"],
      pitching: { ovr: 49, velocity: 52, command: 52, control: 50, movement: 48, mentality: 50, stamina: 50, recovery: 48, clutch: 45, holdRunners: 46 },
      pitches: [{ id: "PITCH_FASTBALL", grade: 1 }],
    },
    power: {
      label: "파워피처",
      desc: "속도 하나로 승부. 제구는 미완성이지만 잠재력은 최상",
      tags: ["급성장", "파워피처"],
      pitching: { ovr: 47, velocity: 66, command: 42, control: 39, movement: 45, mentality: 47, stamina: 51, recovery: 42, clutch: 46, holdRunners: 45 },
      pitches: [{ id: "PITCH_FASTBALL", grade: 2 }],
    },
    control: {
      label: "제구형",
      desc: "커맨드와 제구로 타자를 요리. 체인지업으로 타이밍을 뺏기 시작",
      tags: ["멘탈관리", "제구형"],
      pitching: { ovr: 56, velocity: 47, command: 68, control: 65, movement: 56, mentality: 58, stamina: 52, recovery: 55, clutch: 55, holdRunners: 52 },
      pitches: [{ id: "PITCH_FASTBALL", grade: 1 }, { id: "PITCH_CHANGEUP", grade: 1 }],
    },
    stamina: {
      label: "체력형",
      desc: "이닝이터 스타일. 멘탈과 체력이 강점, 후반까지 무너지지 않음",
      tags: ["체력형", "이닝이터"],
      pitching: { ovr: 46, velocity: 44, command: 42, control: 40, movement: 40, mentality: 55, stamina: 60, recovery: 57, clutch: 39, holdRunners: 39 },
      pitches: [{ id: "PITCH_FASTBALL", grade: 1 }],
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
      age: 17,
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
        speed: 48, baseInstinct: 48, bunting: 45, platoon: 50,
        fielding: 40, arm: 50, battingClutch: 25,
      },
      primaryPosition: "SP",
      positionRatings: { SP: preset.pitching.ovr },
      diligence: 60,
      popularity: 10,
      developmentRate,
      potentialHidden,
      growthPoints: 0,
      tags: preset.tags,
      pitchingXP: {},
      battingXP: {},
      pitches: preset.pitches,
      money: 1200,
      fame: 5,
      scoutScore: 15,
      proServiceYears: 0,
      militaryUnit: null,
      militaryServiceWeeks: 0,
      militaryRecoveryWeeks: 0,
      tradeAdaptationWeeks: 0,
      faNegotiationRound: 0,
      faUnsignedWeeks: 0,
    };

    // 16개 팀을 A/B조로 랜덤 분배
    const allHsIds = hsAllTeams.map((t) => t.id);
    const { groupA, groupB } = shuffleHsGroups(allHsIds);
    // protagonist 조 결정
    const protagonistGroup = groupA.includes(selectedTeamId) ? groupA : groupB;

    gameStore.initNew(protagonist);
    // protagonist 조(8팀) 기준으로 시즌·스케줄 초기화
    seasonStore.initSeason("LEAGUE_HIGHSCHOOL", 2026, 52, protagonistGroup);
    const schedule = generateSchedule(protagonistGroup, selectedTeamId, 52);
    seasonStore.setSchedule(schedule);
    seasonStore.initAllLeagues(2026, selectedTeamId, groupA, groupB);

    onComplete();
  }

  const PITCH_NAMES: Record<string, string> = {
    PITCH_FASTBALL: "패스트볼", PITCH_SINKER: "싱커", PITCH_CUTTER: "커터",
    PITCH_SLIDER: "슬라이더", PITCH_CURVE: "커브", PITCH_CHANGEUP: "체인지업",
    PITCH_SPLITTER: "스플리터", PITCH_FORKBALL: "포크볼",
    PITCH_SCREWBALL: "스크루볼", PITCH_KNUCKLEBALL: "너클볼",
  };

  // ── 팀 이름 표시 ───────────────────────────────────────────────
  $: selectedTeamName = hsTeams.find((t) => t.id === selectedTeamId)?.name ?? "";

  const handednessLabel: Record<Handedness, string> = { R: "우투", L: "좌투", S: "양투" };
  const formLabel: Record<PitchingForm, string> = {
    overhand: "오버핸드", threeQuarter: "스리쿼터", sidearm: "사이드암", underhand: "언더스로",
  };

  // ── Step 2 헬퍼 ────────────────────────────────────────────────
  function difficultyStars(d: string): string {
    const map: Record<string, string> = { "최상": "★★★★★", "상": "★★★★☆", "중": "★★★☆☆", "하": "★★☆☆☆", "최하": "★☆☆☆☆" };
    return map[d] ?? d;
  }

  function recordTone(result: string): "gold" | "silver" | "bronze" | "normal" | "dim" {
    if (result === "우승") return "gold";
    if (result === "준우승") return "silver";
    if (result === "4강") return "bronze";
    if (result === "예선 탈락") return "dim";
    return "normal";
  }

  function rivalName(teamId: string): string {
    return hsTeams.find((t) => t.id === teamId)?.name ?? teamId;
  }
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
        <!-- 왼쪽: 제목 + 팀 목록 1열 -->
        <div class="step2-left">
          <div class="step2-top">
            <h2>팀 선택</h2>
            <p class="sub">소속할 고등학교 팀을 선택하세요</p>
          </div>
          {#if $masterStore.loaded && hsTeams.length > 0}
            <div class="team-list">
              {#each hsTeams as team}
                <button
                  class="team-list-item"
                  class:selected={selectedTeamId === team.id}
                  on:click={() => (selectedTeamId = team.id)}
                >
                  <div class="tli-main">
                    <strong>{team.name}</strong>
                    {#if team.history?.rival}
                      <span class="tli-rival">라이벌전</span>
                    {/if}
                  </div>
                  <div class="tli-meta">
                    {#if team.profile?.difficulty}
                      <span class="tli-stars">{difficultyStars(team.profile.difficulty)}</span>
                    {/if}
                    {#if team.profile?.funding}
                      <span class="tli-funding tli-funding-{team.profile.funding}">{team.profile.funding}</span>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          {:else}
            <p class="loading-msg">팀 데이터 로드 중...</p>
          {/if}
        </div>

        <!-- 오른쪽: 상세 정보 -->
        <div class="step2-right">
          {#if selectedTeam}
            <div class="detail-inner">
              <!-- 팀 정보 + 역사 -->
              <div class="team-info-col">
                {#if selectedTeam.profile}
                  <div class="ti-header">
                    <div class="ti-badge-row">
                      <span class="style-badge">{selectedTeam.profile.style}</span>
                      {#if selectedTeam.profile.funding}
                        <span class="funding-badge funding-{selectedTeam.profile.funding}">재원 {selectedTeam.profile.funding}</span>
                      {/if}
                      {#if selectedTeam.profile.difficulty}
                        <span class="diff-badge">{difficultyStars(selectedTeam.profile.difficulty)}</span>
                      {/if}
                    </div>
                    <p class="team-desc">{selectedTeam.profile.desc}</p>
                    <div class="tag-row">
                      {#each selectedTeam.profile.tags as tag}
                        <span class="tag">{tag}</span>
                      {/each}
                    </div>
                    <div class="strength-chips">
                      {#each selectedTeam.profile.strengths as s}
                        <span class="strength-chip">{s}</span>
                      {/each}
                    </div>
                  </div>
                {/if}

                {#if selectedTeam.history}
                  {@const h = selectedTeam.history}
                  <div class="history-stats">
                    <div class="hs-item">
                      <span>창단</span><strong>{h.founded}년</strong>
                    </div>
                    <div class="hs-item">
                      <span>전국 우승</span><strong>{h.nationalTitles}회</strong>
                    </div>
                    <div class="hs-item">
                      <span>프로 배출</span><strong>{h.proPlayers}명</strong>
                    </div>
                    {#if h.rival}
                      <div class="hs-item hs-rival">
                        <span>라이벌</span><strong>{rivalName(h.rival)}</strong>
                      </div>
                    {/if}
                  </div>

                  <div class="record-section">
                    <div class="record-title">최근 {h.recentRecords.length}년 성적</div>
                    <div class="record-table">
                      <div class="record-head">
                        <span>연도</span><span>전국대회</span><span>지역</span><span>비고</span>
                      </div>
                      {#each h.recentRecords as rec}
                        <div class="record-row">
                          <span class="rec-year">{rec.year}</span>
                          <span class="rec-nat rec-{recordTone(rec.national)}">{rec.national}</span>
                          <span class="rec-reg">{rec.regional}</span>
                          <span class="rec-note">{rec.note ?? ""}</span>
                        </div>
                      {/each}
                    </div>
                  </div>
                {/if}
              </div>

              <!-- 로스터 -->
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
        </div>
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
            <span class="key">초기 구종</span>
            <span class="val pitch-summary">
              {#each PRESETS[selectedPreset].pitches as p}
                <span class="pitch-chip">{PITCH_NAMES[p.id]} Lv.{p.grade}</span>
              {/each}
            </span>
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
    height: 100%;
    box-sizing: border-box;
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
    display: grid;
    grid-template-columns: 200px minmax(0, 1fr);
    gap: 16px;
    height: 100%;
    padding: 8px 0 16px;
    box-sizing: border-box;
    min-height: 0;
  }

  .step2-left {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-height: 0;
    overflow-y: auto;
  }

  .step2-right {
    min-height: 0;
    overflow: hidden;
  }

  .detail-inner {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 240px;
    gap: 10px;
    height: 100%;
    min-height: 0;
  }

  .step2-top h2 { margin: 0 0 4px; font-size: 24px; color: #ebf3ff; }

  /* ── 팀 목록 1열 ── */
  .team-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .team-list-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid #2d4470;
    border-radius: 8px;
    background: #111d34;
    color: #e4edff;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .team-list-item.selected {
    border-color: #5a8fe8;
    background: #1a3360;
  }

  .tli-main {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tli-main strong {
    font-size: 13px;
  }

  .tli-rival {
    font-size: 10px;
    background: #2a1a3a;
    border: 1px solid #6040a0;
    color: #b090e8;
    border-radius: 4px;
    padding: 1px 5px;
  }

  .tli-meta {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .tli-stars {
    font-size: 10px;
    color: #c8a040;
    letter-spacing: -1px;
  }

  .tli-funding {
    font-size: 10px;
    border-radius: 4px;
    padding: 1px 5px;
  }

  .tli-funding-풍부 { background: #0e2e18; border: 1px solid #2a6040; color: #60c880; }
  .tli-funding-보통 { background: #1a1e2e; border: 1px solid #3a4060; color: #8090b8; }
  .tli-funding-부족 { background: #2e1818; border: 1px solid #6a3030; color: #c87060; }

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
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    color: #3d5880;
    font-size: 14px;
    border: 1px dashed #2a3f60;
    border-radius: 10px;
    box-sizing: border-box;
  }

  /* ── 팀 정보 열 ── */
  .team-info-col {
    background: #0d1928;
    border: 1px solid #1e3050;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
    overflow-y: auto;
  }

  .ti-header { display: flex; flex-direction: column; gap: 8px; }

  .ti-badge-row { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }

  .funding-badge {
    font-size: 11px;
    border-radius: 5px;
    padding: 3px 8px;
    font-weight: 600;
  }
  .funding-풍부 { background: #0e2e18; border: 1px solid #2a6040; color: #60c880; }
  .funding-보통 { background: #1a1e2e; border: 1px solid #3a4060; color: #8090b8; }
  .funding-부족 { background: #2e1818; border: 1px solid #6a3030; color: #c87060; }

  .diff-badge {
    font-size: 12px;
    color: #c8a040;
    letter-spacing: -1px;
    background: #1a1608;
    border: 1px solid #4a3810;
    border-radius: 5px;
    padding: 2px 8px;
  }

  /* ── 역사 통계 ── */
  .history-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .hs-item {
    background: #0a1626;
    border: 1px solid #1e3050;
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-align: center;
  }

  .hs-item span { font-size: 10px; color: #4a6888; }
  .hs-item strong { font-size: 13px; color: #d8e8ff; font-weight: 700; }

  .hs-rival { grid-column: span 2; }
  .hs-rival strong { font-size: 12px; }

  /* ── 최근 성적 테이블 ── */
  .record-section { display: flex; flex-direction: column; gap: 6px; }

  .record-title {
    font-size: 11px;
    color: #4a6888;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .record-table { display: flex; flex-direction: column; gap: 3px; }

  .record-head, .record-row {
    display: grid;
    grid-template-columns: 44px 90px 60px minmax(0, 1fr);
    gap: 6px;
    align-items: center;
    font-size: 11px;
  }

  .record-head {
    color: #3a5878;
    padding: 0 4px;
    margin-bottom: 2px;
  }

  .record-row {
    background: #0a1626;
    border: 1px solid #1a2e48;
    border-radius: 6px;
    padding: 5px 8px;
  }

  .rec-year { color: #6a8aaa; font-weight: 600; }
  .rec-nat  { font-weight: 700; font-size: 12px; }
  .rec-gold   { color: #f0c040; }
  .rec-silver { color: #b8c8e0; }
  .rec-bronze { color: #d08860; }
  .rec-normal { color: #8aaace; }
  .rec-dim    { color: #4a5868; }
  .rec-reg { color: #6a8aaa; }
  .rec-note { color: #4a6080; font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── 프로필 열 (삭제 안 하고 유지 - 다른 곳에서 사용 가능) ── */
  .profile-col {
    background: #0d1928;
    border: 1px solid #1e3050;
    border-radius: 10px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 0;
    overflow-y: auto;
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
    min-height: 0;
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
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
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

  .pitch-summary {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pitch-chip {
    background: #0e2040;
    border: 1px solid #2a4878;
    border-radius: 6px;
    padding: 3px 9px;
    font-size: 13px;
    color: #88b8f8;
    font-weight: 600;
  }
</style>
