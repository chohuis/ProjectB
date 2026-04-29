<script lang="ts">
  import { gameStore } from "../../shared/stores/game";
  import { seasonStore } from "../../shared/stores/season";
  import {
    percentileToGrade, STUDY_MODE_EFFECTS, weeksUntilNextExam,
    UNIVERSITY_MAJORS, getUniversityEffBonus,
  } from "../../shared/utils/academicsEngine";
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

  /* ── 대학 전공 선택 배너 ────────────────────────────────────── */
  .major-select-banner {
    background: #101e38;
    border: 1px solid #3a5a20;
    border-radius: 10px;
    padding: 14px 16px;
    display: grid;
    gap: 10px;
  }

  .major-select-title {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    color: #a0d870;
  }

  .major-select-hint {
    margin: 0;
    font-size: 12px;
    color: #6a9050;
  }

  .major-list {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .major-btn {
    background: #0e1a2e;
    border: 1px solid #2a4050;
    border-radius: 8px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 4px;
    transition: background 0.1s, border-color 0.1s;
  }

  .major-btn:hover {
    background: #162838;
    border-color: #4a7050;
  }

  .major-btn strong {
    font-size: 14px;
    color: #c8e8a8;
  }

  .major-btn span {
    font-size: 11px;
    color: #6a8860;
  }

  /* ── 요약 헤더 ─────────────────────────────────────────────── */
  .summary-row {
    display: flex;
    gap: 16px;
    align-items: center;
    background: #0f1c34;
    border: 1px solid #2a3e65;
    border-radius: 10px;
    padding: 10px 16px;
    flex-wrap: wrap;
  }

  .summary-item {
    display: grid;
    gap: 2px;
    min-width: 70px;
  }

  .lbl {
    margin: 0;
    font-size: 11px;
    color: #6a86b8;
  }

  .summary-item strong {
    font-size: 18px;
    color: #e8f2ff;
  }

  .block-banner {
    margin-left: auto;
    padding: 5px 12px;
    background: #3a0c0c;
    border: 1px solid #8a2020;
    border-radius: 6px;
    color: #ff9090;
    font-size: 13px;
    font-weight: 600;
  }

  /* ── 메인 그리드 ────────────────────────────────────────────── */
  .main-grid {
    display: grid;
    grid-template-columns: 1.6fr 1.3fr 1fr;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  .panel {
    background: #0f1c34;
    border: 1px solid #2a3e65;
    border-radius: 12px;
    padding: 14px;
    display: grid;
    align-content: start;
    gap: 10px;
    min-height: 0;
    overflow: hidden;
  }

  h3 { margin: 0; font-size: 16px; color: #e8f2ff; }

  /* ── 과목 테이블 ────────────────────────────────────────────── */
  .subject-head,
  .subject-row {
    display: grid;
    grid-template-columns: 1fr 1.1fr 0.8fr 0.8fr 0.8fr;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }

  .subject-head {
    color: #6a86b8;
    font-size: 11px;
    padding-bottom: 6px;
    border-bottom: 1px solid #1e3050;
  }

  .subject-rows { display: grid; gap: 6px; }

  .subject-row {
    background: #122443;
    border: 1px solid #1e3a62;
    border-radius: 7px;
    padding: 7px 8px;
    color: #d8e8ff;
  }

  .subject-row strong { color: #eef4ff; }

  /* ── 주간 선택 ──────────────────────────────────────────────── */
  .mode-hint {
    margin: -4px 0 0;
    font-size: 12px;
    color: #5a78a8;
  }

  .mode-list { display: grid; gap: 8px; }

  .mode-btn {
    border: 1px solid #2a4168;
    background: #0e1e38;
    border-radius: 9px;
    padding: 10px 12px;
    text-align: left;
    cursor: pointer;
    display: grid;
    gap: 4px;
    transition: background 0.1s, border-color 0.1s;
  }

  .mode-btn:hover   { background: #152640; border-color: #3a5a90; }
  .mode-btn.active  { background: #1a3560; border-color: #5080d0; }
  .mode-btn.risk    { border-color: #5c2a10; }
  .mode-btn.risk:hover  { background: #1c1208; border-color: #804020; }
  .mode-btn.risk.active { background: #2a1808; border-color: #a05020; }

  .mode-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .mode-top strong { font-size: 14px; color: #e0ecff; }

  .eff-badge {
    font-size: 11px;
    color: #8ab0e0;
    background: #1a2e50;
    border: 1px solid #2a4270;
    border-radius: 4px;
    padding: 1px 6px;
  }

  .mode-btn.active .eff-badge { background: #1e3a70; border-color: #4070c0; color: #c0d8ff; }

  .mode-desc { margin: 0; font-size: 12px; color: #6a88b8; }
  .mode-btn.active .mode-desc { color: #90b0e0; }

  /* ── 시험 준비 ──────────────────────────────────────────────── */
  .exam-next {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
  }

  .exam-next strong { font-size: 16px; color: #e8f2ff; }

  .weeks-left {
    font-size: 13px;
    color: #7090c8;
    background: #152240;
    border: 1px solid #2a3e65;
    border-radius: 4px;
    padding: 1px 7px;
  }

  .accum-bar-wrap { display: grid; gap: 6px; }

  .bar-label {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #7090c8;
  }

  .bar-track {
    height: 10px;
    background: #0a1428;
    border-radius: 999px;
    overflow: hidden;
  }

  .bar-fill {
    height: 100%;
    border-radius: 999px;
    transition: width 0.3s;
  }

  .bar-good  { background: linear-gradient(90deg, #2a7a50, #50c880); }
  .bar-mid   { background: linear-gradient(90deg, #7a6020, #d0a030); }
  .bar-low   { background: linear-gradient(90deg, #7a2020, #d04040); }

  .bar-hint {
    margin: 0;
    font-size: 12px;
    color: #6a86b8;
  }

  .last-grade-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    border-top: 1px solid #1e3050;
  }

  .grade-badge {
    font-size: 15px;
    font-weight: 700;
    padding: 2px 10px;
    border-radius: 6px;
    background: #122030;
  }

  .risk-tag {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid;
  }

  /* ── 색상 클래스 ─────────────────────────────────────────────── */
  .g-top    { color: #70e898; }
  .g-mid    { color: #70b8ff; }
  .g-low    { color: #ffd060; }
  .g-risk   { color: #ff8080; }
  .ok       { color: #70e898; }
  .warn     { color: #ffd060; border-color: #806020; background: #201808; }
  .danger   { color: #ff8080; border-color: #801010; background: #1e0808; }

  @media (max-width: 1280px) {
    .main-grid { grid-template-columns: 1.4fr 1.2fr; }
    .exam-panel { grid-column: 1 / -1; }
  }
</style>
