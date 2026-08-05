<script lang="ts">
  import { get } from "svelte/store";
  import { masterStore } from "../../shared/stores/master";
  import { gameStore } from "../../shared/stores/game";
  import { HS_SELECTABLE_TEAMS } from "../../shared/utils/leagueScheduler";
  import { HS_REGIONS } from "../../shared/utils/leagueTeams.generated";
  import { hsRegionMeta, sortRegions } from "../../shared/utils/hsRegionLabel";
  import { teamTokens } from "../../shared/utils/teamTheme";
  import { startNewGameV3 } from "../../shared/repo/slotLifecycleV3";
  import { assignHighschoolPosition } from "../../shared/utils/pitcherRoleEngine";
  import type { Handedness, PitchEntry, PitchingForm, ProtagonistSave } from "../../shared/types/save";
  import TeamMark from "../../features/team/ui/TeamMark.svelte";

  export let onComplete: () => void;

  // ── 단계 ──────────────────────────────────────────────────────
  let step = 1;

  // ── Step 1 상태 ────────────────────────────────────────────────
  let playerName = "";
  let handedness: Handedness = "R";
  let pitchingForm: PitchingForm = "overhand";

  // 생일 (년도 2010 고정)
  let birthMonth = 4;
  let birthDay   = 1;
  const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  $: maxDay = DAYS_IN_MONTH[birthMonth - 1];
  $: if (birthDay > maxDay) birthDay = maxDay;
  $: birthdayStr = `2010-${String(birthMonth).padStart(2, "0")}-${String(birthDay).padStart(2, "0")}`;

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


  // 전체 고교팀 (16개) — 리그 구성용
  $: hsAllTeams = $masterStore.teams.filter((t) => t.leagueId === "LEAGUE_HIGHSCHOOL");
  // ⚠ 주석이 "8개"라고 적혀 있었는데 `HS_SELECTABLE_TEAMS`는 **102개**다.
  //    낡은 주석을 믿고 화면을 잘못 설계할 뻔했다.
  const DIFFICULTY_ORDER: Record<string, number> = { "최상": 5, "상": 4, "중": 3, "하": 2, "최하": 1 };

  // 권역별로 묶는다 (사용자 확정). 고교는 8권역 주말리그라 **어느 지역에서
  // 시작하느냐가 라이벌·일정을 정한다** — 102개를 한 줄로 늘어놓으면 그 구조가
  // 안 보이고 고르기도 어렵다.
  $: teamsByRegion = sortRegions(Object.keys(HS_REGIONS)).map((rid) => ({
    id: rid,
    meta: hsRegionMeta(rid),
    teams: hsTeams.filter((t) =>
      ((HS_REGIONS as Record<string, readonly string[]>)[rid] ?? []).includes(t.id)),
  })).filter((r) => r.teams.length > 0);
  $: hsTeams = hsAllTeams
    .filter((t) => HS_SELECTABLE_TEAMS.includes(t.id))
    .sort((a, b) => (DIFFICULTY_ORDER[b.profile?.difficulty ?? ""] ?? 0) - (DIFFICULTY_ORDER[a.profile?.difficulty ?? ""] ?? 0));
  $: selectedTeam = hsTeams.find((t) => t.id === selectedTeamId) ?? null;
  // 확인 카드가 입을 팀 색. **전역 --t-*는 안 건드린다** — 아직 소속 확정 전이라
  // 전역을 바꾸면 이전 단계로 돌아갔을 때 화면이 어긋난다
  $: cardTokens = teamTokens(selectedTeam?.colors);

  /** 카드에 그릴 능력치 — 경기에 쓰이는 순서대로 */
  function statRows(p: ProtagonistSave["pitching"]) {
    return [
      { ko: "구위",     v: p.velocity },
      { ko: "커맨드",   v: p.command },
      { ko: "제구",     v: p.control },
      { ko: "무브먼트", v: p.movement },
      { ko: "멘탈",     v: p.mentality },
      { ko: "스태미나", v: p.stamina },
    ];
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
  let starting = false;  // 이중 클릭 가드 (중복 createSlot 방지)

  async function startGame() {
    if (starting) return;
    starting = true;
    try {
      await doStartGame();
    } catch (e) {
      console.error("[NewGamePage] 새 게임 생성 실패:", e);
      starting = false;  // 실패 시 재시도 허용
      throw e;
    }
  }

  async function doStartGame() {
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
      position: await assignHighschoolPosition({ teamId: selectedTeamId, pitching: preset.pitching }, get(masterStore).entities),
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
      birthday: birthdayStr,
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

    // ── R3a-4 (v3): 고교 10팀 단일리그 + Rust 로스터 생성 + slot.db 생성 ──
    const slotId = get(gameStore).currentSlotId ?? "A";
    await startNewGameV3({
      slotId,
      slotName: playerName.trim(),
      seasonYear: 2026,
      protagonist,
    });
    await gameStore.save();

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
  function hexToRgba(hex: string, alpha: number): string {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function teamListStyle(team: typeof hsTeams[number], selected: boolean): string {
    const c = team.colors?.[0];
    if (!c) return "";
    if (selected) return `border-color:${c};background:linear-gradient(90deg,${hexToRgba(c,0.18)} 0%,${hexToRgba(c,0.06)} 60%,transparent 100%);`;
    return `border-left-color:${c};`;
  }

  function detailPanelStyle(team: typeof selectedTeam): string {
    const c = team?.colors?.[0];
    if (!c) return "";
    return `border-color:${hexToRgba(c, 0.35)};`;
  }

  function colorBarStyle(team: typeof selectedTeam): string {
    const c0 = team?.colors?.[0], c1 = team?.colors?.[1];
    if (!c0) return "background:#1E3050;";
    return `background:linear-gradient(90deg,${c0} 0%,${c1 ?? c0} 100%);`;
  }

  function styleBadgeStyle(team: typeof selectedTeam): string {
    const c = team?.colors?.[0];
    if (!c) return "";
    return `background:${hexToRgba(c,0.18)};border-color:${hexToRgba(c,0.5)};color:${c};`;
  }

  // ── Step 3 레이더 헬퍼 ────────────────────────────────────────────
  const PRESET_COLORS: Record<PresetKey, string> = {
    balanced: "#1F5FA8", power: "#B3311F", control: "#1F7A47", stamina: "#9A6510",
  };

  const RADAR_LABELS = ["구위", "커맨드", "제구", "무브먼트", "멘탈", "스태미나"];
  const RADAR_MAX = 70;
  const RADAR_R   = 46;
  const RADAR_CX  = 70;
  const RADAR_CY  = 70;

  const RADAR_AXES = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (-90 + i * 60);
    return { x: +(RADAR_CX + RADAR_R * Math.cos(a)).toFixed(1), y: +(RADAR_CY + RADAR_R * Math.sin(a)).toFixed(1) };
  });

  const RADAR_LPOS = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 180) * (-90 + i * 60);
    const r = RADAR_R + 14;
    return { x: +(RADAR_CX + r * Math.cos(a)).toFixed(1), y: +(RADAR_CY + r * Math.sin(a)).toFixed(1) };
  });

  function gridPts(ratio: number): string {
    return Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 180) * (-90 + i * 60);
      return `${(RADAR_CX + RADAR_R * ratio * Math.cos(a)).toFixed(1)},${(RADAR_CY + RADAR_R * ratio * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
  }

  function radarPts(p: typeof PRESETS[PresetKey]["pitching"]): string {
    const vals = [p.velocity, p.command, p.control, p.movement, p.mentality, p.stamina];
    return vals.map((v, i) => {
      const a = (Math.PI / 180) * (-90 + i * 60);
      const ratio = Math.min(v / RADAR_MAX, 1);
      return `${(RADAR_CX + RADAR_R * ratio * Math.cos(a)).toFixed(1)},${(RADAR_CY + RADAR_R * ratio * Math.sin(a)).toFixed(1)}`;
    }).join(" ");
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
          <label>생년월일</label>
          <div class="birthday-row">
            <span class="birth-year">2010년</span>
            <select bind:value={birthMonth} class="birth-select">
              {#each Array.from({length: 12}, (_, i) => i + 1) as m}
                <option value={m}>{m}월</option>
              {/each}
            </select>
            <select bind:value={birthDay} class="birth-select">
              {#each Array.from({length: maxDay}, (_, i) => i + 1) as d}
                <option value={d}>{d}일</option>
              {/each}
            </select>
          </div>
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
              {#each teamsByRegion as region (region.id)}
                <div class="region-head">
                  <span class="region-name">{region.meta.label}</span>
                  <span class="region-area">{region.meta.area}</span>
                  <span class="region-count">{region.teams.length}</span>
                </div>
                {#each region.teams as team (team.id)}
                  <button
                    class="team-list-item"
                    class:selected={selectedTeamId === team.id}
                    style={teamListStyle(team, selectedTeamId === team.id)}
                    on:click={() => (selectedTeamId = team.id)}
                  >
                    <div class="tli-main">
                      <!-- 색 점 두 개를 마크로 교체했다 — 같은 색을 담으면서
                           형태까지 갈라 준다. 두 번 말할 이유가 없다 -->
                      <TeamMark teamId={team.id} size={22} />
                      <strong>{team.name}</strong>
                      <span class="tli-city">{team.city ?? ""}</span>
                    </div>
                  </button>
                {/each}
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
              <div class="team-info-col" style={detailPanelStyle(selectedTeam)}>
                <div class="team-color-bar" style={colorBarStyle(selectedTeam)}></div>
                {#if selectedTeam.profile}
                  <div class="ti-header">
                    <div class="ti-badge-row">
                      <span class="style-badge" style={styleBadgeStyle(selectedTeam)}>{selectedTeam.profile.style}</span>
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

                <!--
                  팀 역사 — v2 refs 기준 (Phase 5-1에서 모양이 바뀌었다).
                  구 코드는 h.founded·h.nationalTitles·h.recentRecords를 읽었는데
                  v2에는 없는 필드라, h.recentRecords.length가 undefined.length로
                  **팀을 고르는 순간 렌더가 터졌다.**
                -->
                {#if selectedTeam.history}
                  {@const h = selectedTeam.history}
                  {@const wins = (h.titles ?? []).filter((t) => t.result === "우승")}
                  {@const ranks = [...(h.seasonRanks ?? [])].sort((a, b) => b.season.localeCompare(a.season))}
                  <div class="history-stats">
                    {#if h.foundedYear}
                      <div class="hs-item"><span>창단</span><strong>{h.foundedYear}년</strong></div>
                    {/if}
                    <div class="hs-item">
                      <span>대회 우승</span><strong>{wins.length}회</strong>
                    </div>
                    {#if h.budget}
                      <div class="hs-item">
                        <span>운영 예산</span><strong>{Math.round(h.budget / 100000000)}억</strong>
                      </div>
                    {/if}
                  </div>

                  {#if ranks.length}
                    <div class="record-section">
                      <div class="record-title">과거 {ranks.length}시즌 성적</div>
                      <div class="record-table">
                        <div class="record-head">
                          <span>시즌</span><span>순위</span><span>우승 대회</span><span></span>
                        </div>
                        {#each ranks as sr}
                          {@const won = (h.titles ?? [])
                            .filter((t) => t.season === sr.season && t.result === "우승")
                            .map((t) => t.competition.replace(/^(고교|대학|프로|독립)\s*/, ""))}
                          <div class="record-row">
                            <span class="rec-year">{sr.season}</span>
                            <span class="rec-nat rec-{sr.rank === 1 ? "gold" : sr.rank <= 3 ? "silver" : sr.rank <= 6 ? "bronze" : "dim"}">{sr.rank}위</span>
                            <span class="rec-reg">{won.join(" · ")}</span>
                            <span class="rec-note"></span>
                          </div>
                        {/each}
                      </div>
                    </div>
                  {/if}
                {/if}
              </div>

              <!-- 로스터 -->
              <div class="roster-col" style={detailPanelStyle(selectedTeam)}>
                <div class="team-color-bar" style={colorBarStyle(selectedTeam)}></div>
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
      <section class="step3-layout">
        <div class="step3-top">
          <h2>능력치 프리셋</h2>
          <p class="sub">초기 능력치 유형을 선택하세요. 성장하면서 바뀔 수 있습니다.</p>
        </div>

        <div class="preset-grid">
          {#each Object.entries(PRESETS) as [key, preset]}
            {@const accent = PRESET_COLORS[key as PresetKey]}
            <button
              class="preset-card"
              class:selected={selectedPreset === key}
              on:click={() => (selectedPreset = key as PresetKey)}
            >
              <strong style="color:{accent}">{preset.label}</strong>
              <p>{preset.desc}</p>
              <ul class="stat-mini">
                <li><span>구위</span><span>{preset.pitching.velocity}</span></li>
                <li><span>커맨드</span><span>{preset.pitching.command}</span></li>
                <li><span>제구</span><span>{preset.pitching.control}</span></li>
                <li><span>무브먼트</span><span>{preset.pitching.movement}</span></li>
                <li><span>멘탈</span><span>{preset.pitching.mentality}</span></li>
                <li><span>스태미나</span><span>{preset.pitching.stamina}</span></li>
              </ul>
              <div class="preset-pitches">
                {#each preset.pitches as pitch}
                  <span class="preset-pitch"
                    style="color:{accent};border-color:{hexToRgba(accent,0.45)};background:{hexToRgba(accent,0.1)};"
                    class:lv2={pitch.grade >= 2}
                  >{PITCH_NAMES[pitch.id]} Lv.{pitch.grade}</span>
                {/each}
              </div>
              <div class="radar-wrap">
              <svg viewBox="0 0 140 140" class="radar-svg">
                {#each [0.33, 0.66, 1] as ratio}
                  <polygon points={gridPts(ratio)} fill="none" stroke="var(--line)" stroke-width="0.8"/>
                {/each}
                {#each RADAR_AXES as ax, i}
                  <line x1={RADAR_CX} y1={RADAR_CY} x2={ax.x} y2={ax.y} stroke="var(--line)" stroke-width="0.8"/>
                  <text x={RADAR_LPOS[i].x} y={RADAR_LPOS[i].y}
                        text-anchor="middle" dominant-baseline="middle"
                        font-size="7" fill="var(--ink-mute)">{RADAR_LABELS[i]}</text>
                {/each}
                <polygon
                  points={radarPts(preset.pitching)}
                  fill={hexToRgba(accent, 0.22)}
                  stroke={accent}
                  stroke-width="1.5"
                />
              </svg>
              </div>
            </button>
          {/each}
        </div>
      </section>

    <!-- Step 4 -->

    {:else if step === 4}
      <section class="step4-layout">
        <div class="step4-top">
          <h2>확인</h2>
          <p class="sub">아래 선수로 2026년 고교 주말리그를 시작합니다.</p>
        </div>

        <!-- 선수 카드 — 팀 색을 입는다. 이 순간부터 그 팀 소속이다 -->
        <div class="pcard" style="--c-dark:{cardTokens.dark};--c-acc:{cardTokens.accent};--c-gold:{cardTokens.gold};--c-stripe:{cardTokens.stripe}">
          <div class="pcard-head">
            <div class="pc-id">
              <span class="pc-team">{selectedTeamName}</span>
              <strong class="pc-name">{playerName || "이름 없음"}</strong>
              <span class="pc-meta">
                투수 · 1학년 · {handednessLabel[handedness]} · {formLabel[pitchingForm]}
              </span>
            </div>
            <div class="pc-preset">
              <span class="pc-preset-label">{PRESETS[selectedPreset].label}</span>
            </div>
          </div>

          <div class="pcard-body">
            <div class="pc-stats">
              {#each statRows(PRESETS[selectedPreset].pitching) as row}
                {@const ko = row.ko}
                {@const v = row.v}
                <div class="pc-stat">
                  <span class="pc-stat-k">{ko}</span>
                  <span class="pc-bar"><i style="width:{v}%"></i></span>
                  <span class="pc-stat-v">{v}</span>
                </div>
              {/each}
            </div>

            <div class="pc-side">
              <p class="pc-side-h">초기 구종</p>
              <div class="pc-pitches">
                {#each PRESETS[selectedPreset].pitches as pt}
                  <span class="pc-pitch">{PITCH_NAMES[pt.id]} <b>Lv.{pt.grade}</b></span>
                {/each}
              </div>
              <p class="pc-side-h">생년월일</p>
              <p class="pc-side-v">2010년 {birthMonth}월 {birthDay}일</p>
            </div>
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
      <button class="btn start" on:click={startGame} disabled={starting}>
        {starting ? "세계 생성 중..." : "게임 시작"}
      </button>
    {/if}
  </footer>
</div>

<style>
  .page {
    width: 100vw;
    height: 100vh;
    background: var(--panel);
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    color: var(--ink);
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
    border: 2px solid var(--ink-mute);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    background: var(--panel-sunk);
  }

  .step.active .num {
    background: var(--ink-mute);
    border-color: var(--ink-mid);
    color: #fff;
  }

  .step.done .num {
    background: var(--line);
    border-color: var(--ink-mute);
    color: var(--ink);
  }

  .step .label {
    font-size: 13px;
    color: var(--ink);
    white-space: nowrap;
  }

  .divider {
    flex: 1;
    height: 2px;
    background: var(--panel-sunk);
    margin: 0 12px;
    min-width: 40px;
    max-width: 100px;
    transition: background 0.2s;
  }

  .divider.done {
    background: var(--ink-mute);
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
    color: var(--ink);
  }

  .sub {
    margin: 0 0 24px;
    color: var(--ink-mid);
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
    color: var(--ink);
    font-weight: 600;
  }

  input[type="text"] {
    width: 100%;
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 12px 14px;
    color: var(--ink);
    font-size: 16px;
    box-sizing: border-box;
    outline: none;
    transition: border-color 0.15s;
  }

  input[type="text"]:focus {
    border-color: var(--ink-mid);
  }

  input.error {
    border-color: var(--bad);
  }

  /* ── 생일 ── */
  .birthday-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .birth-year {
    color: var(--ink-mid);
    font-size: 15px;
    font-weight: 600;
    padding: 10px 4px;
    white-space: nowrap;
  }

  .birth-select {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 10px 12px;
    color: var(--ink);
    font-size: 15px;
    cursor: pointer;
    outline: none;
    transition: border-color 0.15s;
  }

  .birth-select:focus {
    border-color: var(--ink-mid);
  }

  /* ── 라디오 버튼 ── */
  .radio-row {
    display: flex;
    gap: 10px;
  }

  .radio-btn {
    padding: 10px 22px;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel-sunk);
    color: var(--ink);
    font-size: 14px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .radio-btn.selected {
    background: var(--line);
    border-color: var(--ink-mid);
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
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-sunk);
    color: var(--ink);
    cursor: pointer;
    transition: all 0.15s;
  }

  .form-card.selected {
    border-color: var(--ink-mid);
    background: var(--panel-sunk);
  }

  .form-card strong {
    display: block;
    font-size: 15px;
    margin-bottom: 6px;
  }

  .form-card p {
    margin: 0;
    font-size: 12px;
    color: var(--ink);
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

  .step2-top h2 { margin: 0 0 4px; font-size: 24px; color: var(--ink); }

  /* ── 팀 목록 1열 ── */
  .team-list {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  /* ── 권역 머리 ── */
  .region-head {
    display: flex; align-items: baseline; gap: 7px;
    padding: 9px 10px 5px;
    position: sticky; top: 0; z-index: 1;
    background: var(--panel, var(--panel-sunk));
  }
  .region-name { font-size: 12px; font-weight: 800; color: var(--t-gold, var(--ink)); }
  .region-area { font-size: 10.5px; color: var(--ink-mute, var(--ink-mid)); }
  .region-count {
    margin-left: auto; font-size: 10px; font-variant-numeric: tabular-nums;
    color: var(--ink-mute, var(--ink-mid));
  }
  .tli-city { font-size: 10.5px; opacity: 0.6; margin-left: auto; }

  .team-list-item {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 12px;
    border: 1px solid var(--line);
    border-left-width: 3px;
    border-radius: 8px;
    background: var(--panel-sunk);
    color: var(--ink);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s, border-color 0.15s;
  }

  .team-list-item:hover:not(.selected) {
    background: var(--panel-sunk);
  }

  .team-list-item.selected {
    border-color: var(--ink-mid);
    background: var(--panel-sunk);
  }

  .tli-main {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tli-main strong {
    font-size: 13px;
  }



  .team-color-bar {
    height: 4px;
    margin: -16px -16px 10px;
    border-radius: 10px 10px 0 0;
  }

  .roster-col .team-color-bar {
    margin: -14px -14px 8px;
  }

  .tli-meta {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .loading-msg {
    color: var(--ink-mute);
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
    color: var(--ink-mute);
    font-size: 14px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    box-sizing: border-box;
  }

  /* ── 팀 정보 열 ── */
  .team-info-col {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
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

  /* ── 역사 통계 ── */
  .history-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
  }

  .hs-item {
    background: var(--panel);
    border: 1px solid var(--panel-sunk);
    border-radius: 8px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    text-align: center;
  }

  .hs-item span { font-size: 10px; color: var(--ink-mute); }
  .hs-item strong { font-size: 13px; color: var(--ink); font-weight: 700; }

  /* ── 최근 성적 테이블 ── */
  .record-section { display: flex; flex-direction: column; gap: 6px; }

  .record-title {
    font-size: 11px;
    color: var(--ink-mute);
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
    color: var(--ink-mute);
    padding: 0 4px;
    margin-bottom: 2px;
  }

  .record-row {
    background: var(--panel);
    border: 1px solid var(--panel-sunk);
    border-radius: 6px;
    padding: 5px 8px;
  }

  .rec-year { color: var(--ink-mid); font-weight: 600; }
  .rec-nat  { font-weight: 700; font-size: 12px; }
  .rec-gold   { color: var(--warn); }
  .rec-silver { color: var(--ink); }
  .rec-bronze { color: var(--warn); }
  .rec-normal { color: var(--ink); }
  .rec-dim    { color: var(--ink-mute); }
  .rec-reg { color: var(--ink-mid); }
  .rec-note { color: var(--ink-mute); font-size: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ── 프로필 열 (삭제 안 하고 유지 - 다른 곳에서 사용 가능) ── */
  .profile-col {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
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
    background: var(--panel-sunk);
    border: 1px solid var(--ink-mute);
    border-radius: 6px;
    padding: 4px 12px;
    font-size: 13px;
    font-weight: 700;
    color: var(--ink);
    align-self: flex-start;
  }

  .team-desc {
    margin: 0;
    font-size: 13px;
    color: var(--ink);
    line-height: 1.65;
  }

  .tag-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 20px;
    padding: 3px 10px;
    font-size: 11px;
    color: var(--ink-mid);
  }

  .strength-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .section-label {
    font-size: 11px;
    color: var(--ink-mute);
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
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 12px;
    color: var(--ink-mid);
    font-weight: 600;
  }

  /* ── 로스터 열 ── */
  .roster-col {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
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
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .manager-card {
    border-color: var(--line);
    background: var(--panel-sunk);
  }

  .entity-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--ink);
    flex: 0 0 auto;
  }

  .entity-badge {
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    flex: 0 0 auto;
  }

  .entity-badge.manager {
    background: var(--line);
    border: 1px solid var(--ink-mute);
    color: var(--ink);
  }

  .entity-badge.coach {
    background: rgba(31, 122, 71, 0.10);
    border: 1px solid var(--ok);
    color: var(--ok);
  }

  .entity-badge.player {
    background: rgba(154, 101, 16, 0.12);
    border: 1px solid var(--warn);
    color: var(--warn);
  }

  .entity-sub {
    flex-basis: 100%;
    font-size: 11px;
    color: var(--ink-mute);
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
    color: var(--ink-mute);
  }

  .player-stats {
    display: flex;
    gap: 6px;
  }

  .stat-pill {
    background: var(--panel-sunk);
    border: 1px solid var(--panel-sunk);
    border-radius: 4px;
    padding: 2px 7px;
    font-size: 11px;
    color: var(--ink-mid);
  }

  .stat-pill strong {
    color: var(--ink);
    font-weight: 700;
  }

  /* ── Step 3 전용 레이아웃 ── */
  .step3-layout {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    padding: 8px 0 16px;
    box-sizing: border-box;
    gap: 10px;
  }

  .step3-top h2  { margin: 0 0 2px; font-size: 24px; color: var(--ink); }
  .step3-top .sub { margin: 0; }

  /* ── 프리셋 그리드 ── */
  .preset-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    min-height: 0;
  }

  .preset-card {
    text-align: left;
    padding: 14px;
    border: 1px solid var(--line);
    border-radius: 10px;
    background: var(--panel-sunk);
    color: var(--ink);
    cursor: pointer;
    transition: all 0.15s;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
  }

  .preset-card.selected {
    border-color: var(--ink-mid);
    background: var(--panel-sunk);
  }

  .preset-card strong {
    display: block;
    font-size: 18px;
    margin-bottom: 8px;
  }

  .preset-card p {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--ink);
    line-height: 1.6;
  }

  .stat-mini {
    list-style: none;
    margin: 0;
    padding: 0;
    width: 100%;
    display: grid;
    grid-template-columns: 1fr 1fr;
    column-gap: 16px;
  }

  .stat-mini li {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--ink);
    border-bottom: 1px solid var(--panel-sunk);
    padding: 7px 0;
  }

  .preset-pitches {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 12px;
  }

  .preset-pitch {
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 4px 11px;
    font-size: 12px;
    font-weight: 600;
  }

  .preset-pitch.lv2 {
    filter: brightness(1.25);
  }

  .radar-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding-top: 10px;
  }

  .radar-svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }

  /* ── 요약 카드 ── */
  .summary-card {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
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
    border-bottom: 1px solid var(--panel-sunk);
    align-items: center;
  }

  .summary-row:last-child {
    border-bottom: 0;
  }

  .key {
    font-size: 13px;
    color: var(--ink-mid);
  }

  .val {
    font-size: 15px;
    color: var(--ink);
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
    background: var(--panel-sunk);
    color: var(--ink);
    border: 1px solid var(--line);
  }

  .btn.back:hover {
    background: var(--line);
  }

  .btn.next {
    background: var(--ink-mute);
    color: #fff;
  }

  .btn.next:hover:not(:disabled) {
    background: var(--ink-mute);
  }

  .btn.next:disabled {
    background: var(--panel-sunk);
    color: var(--ink-mute);
    cursor: default;
  }

  .btn.start {
    background: var(--ok);
    color: #fff;
    padding: 12px 48px;
  }

  .btn.start:hover {
    background: var(--ok);
  }

  .pitch-summary {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pitch-chip {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 3px 9px;
    font-size: 13px;
    color: var(--ink);
    font-weight: 600;
  }

  /* ══ 4단계 확인 — 선수 카드 ══ */
  .step4-layout { display: flex; flex-direction: column; gap: 18px; align-items: center; }
  .step4-top { text-align: center; }

  /* 팀 색은 카드 안에서만 산다 — 여기 토큰이 전역 --t-*를 덮지 않는다.
     아직 소속이 확정 전이라 전역을 바꾸면 이전 단계로 돌아갔을 때 어긋난다 */
  .pcard {
    width: 560px; max-width: 100%;
    background: #fff;
    border-radius: 4px;
    overflow: hidden;
    box-shadow: 0 14px 34px -22px rgba(8, 16, 36, 0.6);
  }

  .pcard-head {
    background: var(--c-dark);
    padding: 16px 20px;
    display: flex; justify-content: space-between; align-items: flex-start; gap: 14px;
  }
  .pc-team { display: block; font-size: 11px; letter-spacing: 0.14em; color: var(--c-gold); font-weight: 700; }
  .pc-name {
    display: block; margin: 5px 0 4px;
    font-size: 27px; font-weight: 800; font-style: italic;
    letter-spacing: -0.03em; color: #fff; line-height: 1.1;
  }
  .pc-meta { font-size: 11.5px; color: rgba(255, 255, 255, 0.72); }
  .pc-preset { flex: none; }
  .pc-preset-label {
    display: inline-block; background: var(--c-acc); color: #fff;
    font-size: 11.5px; font-weight: 750; padding: 5px 11px;
  }

  .pcard-body {
    display: grid; grid-template-columns: 1fr 170px; gap: 20px;
    padding: 18px 20px;
    background-image: repeating-linear-gradient(90deg, transparent 0 11px, var(--c-stripe) 11px 13px);
  }

  .pc-stats { display: flex; flex-direction: column; gap: 7px; }
  .pc-stat { display: grid; grid-template-columns: 54px 1fr 26px; gap: 9px; align-items: center; }
  .pc-stat-k { font-size: 11.5px; color: var(--ink-mute); }
  .pc-stat-v { font-size: 12px; font-weight: 750; text-align: right; font-variant-numeric: tabular-nums; color: var(--panel-sunk); }
  .pc-bar { display: block; height: 6px; background: var(--ink); }
  .pc-bar i { display: block; height: 100%; background: var(--c-dark); }

  .pc-side { border-left: 1px solid var(--ink); padding-left: 16px; }
  .pc-side-h {
    margin: 0 0 6px; font-size: 9.5px; letter-spacing: 0.14em;
    text-transform: uppercase; color: var(--ink-mute); font-weight: 700;
  }
  .pc-side-h:not(:first-child) { margin-top: 14px; }
  .pc-side-v { margin: 0; font-size: 12px; color: var(--panel-sunk); }
  .pc-pitches { display: flex; flex-wrap: wrap; gap: 4px; }
  .pc-pitch {
    font-size: 10.5px; padding: 3px 7px;
    border: 1px solid var(--c-dark); color: var(--c-dark);
  }
  .pc-pitch b { font-weight: 800; }

</style>
