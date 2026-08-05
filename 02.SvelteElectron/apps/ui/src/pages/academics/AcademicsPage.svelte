<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import {
    percentileToGrade, STUDY_MODE_EFFECTS, weeksUntilNextExam,
    UNIVERSITY_MAJORS, getUniversityEffBonus,
  } from "../../shared/utils/academicsEngine";
  import { toGpa45 } from "../../shared/utils/universityUtils";
  import type { StudyMode } from "../../shared/types/save";

  const SUBJECT_NAMES: Record<string, string> = {
    kor: "국어", eng: "영어", math: "수학", soc: "사회", sci: "과학",
  };

  const STUDY_MODE_OPTIONS: Array<{ id: StudyMode; name: string; desc: string }> = [
    { id: "focus",  name: "집중 수업",    desc: `학업 +8점/주, 훈련 효율 75%` },
    { id: "normal", name: "일반 수업",    desc: `학업 +4점/주, 훈련 효율 90%` },
    { id: "rest",   name: "수업 중 휴식", desc: `학업 +1점/주, 훈련 효율 100%, 출석 -3%` },
    { id: "sleep",  name: "수업 중 수면", desc: `학업 0점/주, 훈련 효율 105%, 경고 위험` },
  ];

  $: school      = $gameStore.schoolState;
  $: careerStage = $gameStore.protagonist.careerStage;
  $: isUniv      = careerStage === "university";
  $: curWeek     = $seasonStore.currentWeek;

  // 대학 년차 (1~4)
  $: univYear = Math.min(4, Math.floor(school.universityWeek / 52) + 1);
  $: univSemester = Math.min(8, Math.floor(school.universityWeek / 26) + 1);

  $: subjects = Object.entries(school.subjectScores).map(([id, s]) => ({
    id,
    name:       SUBJECT_NAMES[id] ?? id,
    percentile: s.percentile,
    attendance: s.attendance,
    assignment: s.assignment,
    grade:      percentileToGrade(s.percentile),
  }));

  $: avgPercentile = subjects.length
    ? subjects.reduce((a, s) => a + s.percentile, 0) / subjects.length
    : 50;
  $: avgGrade = percentileToGrade(avgPercentile);

  $: nextExam = weeksUntilNextExam(curWeek);
  $: accumPct  = Math.min(100, Math.round(school.examAccumScore));

  // 현재 전공 효율 보너스
  $: majorEffPct = Math.round(getUniversityEffBonus(school.universityMajor) * 100);
  $: isGeneral   = school.universityMajor === "일반전공";

  function gradeClass(g: number): string {
    if (g <= 2) return "g-top";
    if (g <= 4) return "g-mid";
    if (g <= 6) return "g-low";
    return "g-risk";
  }

  function riskClass(r: string): string {
    if (r === "ok") return "ok";
    if (r === "warn") return "warn";
    return "danger";
  }

  function setMode(mode: StudyMode) {
    gameStore.setStudyMode(mode);
    gameStore.save();
  }

  function pickMajor(majorId: string) {
    gameStore.selectMajor(majorId);
    gameStore.save();
  }
</script>

<section class="page">
  <!-- ── 요약 헤더 ─────────────────────────────────────────── -->
  <header class="summary-row">
    {#if isUniv}
      <div class="summary-item">
        <p class="lbl">재학 상태</p>
        <strong class="g-top">{univYear}학년 {univSemester % 2 === 1 ? "1학기" : "2학기"}</strong>
      </div>
      <div class="summary-item">
        <p class="lbl">전공</p>
        <strong class={school.majorSelected ? "g-mid" : "g-low"}>
          {school.majorSelected ? school.universityMajor : "미선택"}
        </strong>
      </div>
      {#if school.majorSelected && majorEffPct > 0}
        <div class="summary-item">
          <p class="lbl">전공 보너스</p>
          <strong class="g-top">훈련 +{majorEffPct}%</strong>
        </div>
      {/if}
      {#if school.majorSelected && isGeneral}
        <div class="summary-item">
          <p class="lbl">전공 보너스</p>
          <strong class="g-mid">학업 점수 ×1.5</strong>
        </div>
      {/if}
    {:else}
      <div class="summary-item">
        <p class="lbl">평균 등급</p>
        <strong class={gradeClass(avgGrade)}>{avgGrade}등급</strong>
      </div>
      {#if isUniv}
        <div class="summary-item">
          <p class="lbl">GPA</p>
          <strong class={gradeClass(avgGrade)}>{toGpa45(avgPercentile).toFixed(1)} / 4.5</strong>
        </div>
      {/if}
    {/if}
    <div class="summary-item">
      <p class="lbl">학업 상태</p>
      <strong class={riskClass(school.lastGradeRisk)}>
        {school.lastGradeRisk === "ok" ? "정상" : school.lastGradeRisk === "warn" ? "주의" : "경고"}
      </strong>
    </div>
    <div class="summary-item">
      <p class="lbl">최근 성적</p>
      <strong class={school.lastGrade ? gradeClass(school.lastGrade) : "g-low"}>
        {school.lastGrade ? `${school.lastGrade}등급` : "미응시"}
      </strong>
    </div>
    <div class="summary-item">
      <p class="lbl">경고 누적</p>
      <strong class={school.warningCount >= 2 ? "g-risk" : school.warningCount >= 1 ? "g-low" : "ok"}>
        {school.warningCount}회
      </strong>
    </div>
    {#if school.eligibilityBlocked}
      <div class="block-banner">⚠ 학사 경고 — 이번 주 경기 출전 정지</div>
    {/if}
  </header>

  <!-- ── 대학 전공 선택 (미선택 시 우선 표시) ──────────────── -->
  {#if isUniv && !school.majorSelected}
    <div class="major-select-banner">
      <p class="major-select-title">전공을 선택해주세요</p>
      <p class="major-select-hint">전공은 훈련 효율에 영구적으로 영향을 줍니다. 신중하게 선택하세요.</p>
      <div class="major-list">
        {#each UNIVERSITY_MAJORS as m}
          <button class="major-btn" on:click={() => pickMajor(m.id)} type="button">
            <strong>{m.id}</strong>
            <span>{m.desc}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="main-grid">
    <!-- ── 과목별 현황 ──────────────────────────────────────── -->
    <section class="panel subject-panel">
      <h3>과목별 현황</h3>
      <div class="subject-head">
        <span>과목</span>
        <span>석차백분율</span>
        <span>등급</span>
        <span>출석</span>
        <span>과제</span>
      </div>
      <div class="subject-rows">
        {#each subjects as row}
          <div class="subject-row">
            <strong>{row.name}</strong>
            <span>{row.percentile.toFixed(1)}%</span>
            <span class={gradeClass(row.grade)}>{row.grade}등급</span>
            <span class={row.attendance < 85 ? "warn" : ""}>{row.attendance.toFixed(0)}%</span>
            <span class={row.assignment < 75 ? "warn" : ""}>{row.assignment.toFixed(0)}%</span>
          </div>
        {/each}
      </div>
    </section>

    <!-- ── 주간 학업 선택 ────────────────────────────────────── -->
    <section class="panel mode-panel">
      <h3>주간 학업 선택</h3>
      <p class="mode-hint">선택한 모드는 다음 주 진행 시 적용됩니다.</p>

      <div class="mode-list">
        {#each STUDY_MODE_OPTIONS as opt}
          {@const fx = STUDY_MODE_EFFECTS[opt.id]}
          <button
            class="mode-btn"
            class:active={school.weeklyStudyMode === opt.id}
            class:risk={opt.id === "sleep"}
            on:click={() => setMode(opt.id)}
            type="button"
          >
            <div class="mode-top">
              <strong>{opt.name}</strong>
              <span class="eff-badge">훈련 {Math.round(fx.efficiencyMod * 100)}%</span>
            </div>
            <p class="mode-desc">{opt.desc}</p>
          </button>
        {/each}
      </div>
    </section>

    <!-- ── 시험 진행 상황 ────────────────────────────────────── -->
    <section class="panel exam-panel">
      <h3>시험 준비 현황</h3>

      <div class="exam-next">
        <p class="lbl">다음 시험</p>
        <strong>{nextExam.label}</strong>
        <span class="weeks-left">D-{nextExam.weeksLeft}주</span>
      </div>

      <div class="accum-bar-wrap">
        <div class="bar-label">
          <span>누적 학업 점수</span>
          <span>{accumPct} / 100</span>
        </div>
        <div class="bar-track">
          <div
            class="bar-fill"
            class:bar-good={accumPct >= 65}
            class:bar-mid={accumPct >= 38 && accumPct < 65}
            class:bar-low={accumPct < 38}
            style="width: {accumPct}%"
          ></div>
        </div>
        <p class="bar-hint">
          {accumPct >= 80 ? "우수한 준비 상태" :
           accumPct >= 50 ? "평균 수준, 꾸준히 유지하세요" :
           accumPct >= 25 ? "주의: 집중 수업을 늘리세요" :
           "위험: 즉시 학업 집중이 필요합니다"}
        </p>
      </div>

      {#if school.lastGrade !== null}
        <div class="last-grade-row">
          <p class="lbl">직전 시험 성적</p>
          <span class="grade-badge {gradeClass(school.lastGrade)}">{school.lastGrade}등급</span>
          <span class="risk-tag {riskClass(school.lastGradeRisk)}">
            {school.lastGradeRisk === "ok" ? "정상" : school.lastGradeRisk === "warn" ? "주의" : "경고"}
          </span>
        </div>
      {/if}
    </section>
  </div>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  /* ── 전공 선택 배너 ───────────────────────────────────────
     한 번뿐이고 되돌릴 수 없는 선택이라 다른 무엇보다 앞에 세운다 */
  .major-select-banner {
    background: var(--panel);
    border-left: 3px solid var(--t-accent);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }

  .major-select-title { margin: 0; font-size: 14px; font-weight: 800; color: var(--ink); }
  .major-select-hint  { margin: 0; font-size: 12px; color: var(--ink-mute); }

  .major-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }

  .major-btn {
    background: var(--panel-sunk);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 3px;
  }
  .major-btn:hover { border-color: var(--t-dark); background: var(--panel); }
  .major-btn strong { font-size: 13.5px; font-weight: 800; color: var(--ink); }
  .major-btn span   { font-size: 11px; color: var(--ink-mute); }

  /* ── 요약 헤더 ───────────────────────────────────────────── */
  .summary-row {
    display: flex;
    gap: 22px;
    align-items: center;
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 11px 16px;
    flex-wrap: wrap;
  }

  .summary-item { display: grid; gap: 1px; min-width: 70px; }

  .lbl {
    margin: 0;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.12em;
    color: var(--ink-mute);
  }

  .summary-item strong {
    font-size: 17px;
    font-weight: 800;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .block-banner {
    margin-left: auto;
    padding: 6px 13px;
    background: var(--bad);
    border-radius: var(--radius);
    color: var(--ink-on-dark);
    font-size: 12.5px;
    font-weight: 700;
  }

  /* ── 메인 그리드 ─────────────────────────────────────────── */
  .main-grid {
    display: grid;
    grid-template-columns: 1.6fr 1.3fr 1fr;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .panel {
    background: var(--panel);
    border-radius: var(--radius);
    box-shadow: 0 1px 3px -1px rgba(15, 29, 61, 0.16);
    padding: 14px;
    display: grid;
    align-content: start;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  h3 { margin: 0; font-size: 13px; font-weight: 800; color: var(--ink); }

  /* ── 과목 표 ─────────────────────────────────────────────── */
  .subject-head,
  .subject-row {
    display: grid;
    grid-template-columns: 1fr 1.1fr 0.8fr 0.8fr 0.8fr;
    gap: 6px;
    align-items: center;
    font-size: 12.5px;
    font-variant-numeric: tabular-nums;
  }

  .subject-head {
    color: var(--ink-mute);
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 0 8px 6px;
    border-bottom: 2px solid var(--t-dark);
  }

  .subject-rows { display: grid; min-height: 0; overflow-y: auto; }

  .subject-row {
    border-bottom: 1px solid var(--line);
    padding: 8px;
    color: var(--ink-mid);
  }
  .subject-row:last-child { border-bottom: 0; }
  .subject-row strong { color: var(--ink); font-weight: 700; }

  /* ── 주간 선택 ───────────────────────────────────────────── */
  .mode-hint { margin: -4px 0 0; font-size: 11.5px; color: var(--ink-mute); }

  .mode-list { display: grid; gap: 7px; }

  .mode-btn {
    border: 1px solid var(--line);
    border-left: 3px solid var(--line);
    background: var(--panel);
    border-radius: var(--radius);
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 3px;
  }
  .mode-btn:hover  { background: var(--panel-sunk); }
  .mode-btn.active { border-color: var(--t-dark); border-left-color: var(--t-dark); background: var(--panel-sunk); }

  /* 수면 모드는 성적을 깎는다 — 고르기 전에 보이게 한다 */
  .mode-btn.risk        { border-left-color: var(--warn); }
  .mode-btn.risk.active { border-color: var(--warn); border-left-color: var(--warn); }

  .mode-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .mode-top strong { font-size: 13.5px; font-weight: 700; color: var(--ink); }

  .eff-badge {
    font-size: 10.5px;
    color: var(--ink-mid);
    background: var(--panel-sunk);
    border-radius: 2px;
    padding: 2px 7px;
    font-variant-numeric: tabular-nums;
  }
  .mode-btn.active .eff-badge { background: var(--t-dark); color: var(--t-gold); }

  .mode-desc { margin: 0; font-size: 11.5px; color: var(--ink-mute); }

  /* ── 시험 준비 ───────────────────────────────────────────── */
  .exam-next { display: flex; align-items: baseline; gap: 9px; flex-wrap: wrap; }
  .exam-next strong { font-size: 15px; font-weight: 800; color: var(--ink); }

  .weeks-left {
    font-size: 12px;
    font-weight: 700;
    color: var(--ink-on-dark);
    background: var(--t-dark);
    border-radius: 2px;
    padding: 2px 8px;
    font-variant-numeric: tabular-nums;
  }

  .accum-bar-wrap { display: grid; gap: 5px; }

  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 11.5px;
    color: var(--ink-mute);
    font-variant-numeric: tabular-nums;
  }

  .bar-track {
    height: 8px;
    background: var(--panel-sunk);
    border-radius: 999px;
    overflow: hidden;
  }

  .bar-fill { height: 100%; border-radius: 999px; transition: width 0.3s; }
  .bar-good { background: var(--ok); }
  .bar-mid  { background: var(--warn); }
  .bar-low  { background: var(--bad); }

  .bar-hint { margin: 0; font-size: 11.5px; color: var(--ink-mute); }

  .last-grade-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 9px;
    border-top: 1px solid var(--line);
  }

  .grade-badge {
    font-size: 14px;
    font-weight: 800;
    padding: 2px 10px;
    border-radius: var(--radius);
    background: var(--panel-sunk);
  }

  .risk-tag {
    font-size: 11.5px;
    font-weight: 700;
    padding: 2px 9px;
    border-radius: var(--radius);
  }

  /* ── 등급 색 ──────────────────────────────────────────────
     성적은 좋고 나쁨이 전부다 — 의미색이고 팀 색과 섞지 않는다.
     "보통"(g-mid)만 중성으로 둔다. 전부 색이 있으면 나쁜 게 안 보인다 */
  .g-top  { color: var(--ok); }
  .g-mid  { color: var(--ink); }
  .g-low  { color: var(--warn); }
  .g-risk { color: var(--bad); }
  .ok     { color: var(--ok); }
  .warn   { color: var(--warn); }
  .danger { color: var(--bad); }

  /* 배지로 쓰일 때는 배경까지 채운다 */
  .risk-tag.ok     { background: var(--ok);   color: var(--ink-on-dark); }
  .risk-tag.warn   { background: var(--warn); color: var(--ink-on-dark); }
  .risk-tag.danger { background: var(--bad);  color: var(--ink-on-dark); }

  @media (max-width: 1280px) {
    .main-grid { grid-template-columns: 1.4fr 1.2fr; }
    .exam-panel { grid-column: 1 / -1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .bar-fill { transition: none; }
  }
</style>
