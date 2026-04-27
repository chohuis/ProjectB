<script lang="ts">
  type SchoolSegment = "highschool" | "university";
  type RiskLevel = "정상" | "주의" | "경고";

  interface SubjectRow {
    id: string;
    name: string;
    percentile: number;
    attendance: number;
    assignment: number;
  }

  interface WeeklyChoice {
    id: string;
    name: string;
    description: string;
    staminaDelta: number;
    attendanceDelta: number;
    assignmentDelta: number;
    percentileDelta: number;
  }

  export let currentStage: "highschool" | "university" | "pro_kbl" | "pro_abl" = "highschool";
  export let attendsUniversity = false;
  export let universityMajor = "체육교육";
  export let plannedUniversityMajors: string[] = [
    "스포츠과학",
    "체육교육",
    "스포츠경영",
    "재활운동",
    "스포츠심리"
  ];

  let activeSegment: SchoolSegment =
    currentStage === "university" && attendsUniversity ? "university" : "highschool";
  let stamina = 61;
  let warningCount = 0;

  let highSchoolRows: SubjectRow[] = [
    { id: "kor", name: "국어", percentile: 13, attendance: 96, assignment: 90 },
    { id: "eng", name: "영어", percentile: 18, attendance: 93, assignment: 84 },
    { id: "math", name: "수학", percentile: 29, attendance: 89, assignment: 81 },
    { id: "soc", name: "사회", percentile: 34, attendance: 95, assignment: 92 },
    { id: "sci", name: "과학", percentile: 41, attendance: 87, assignment: 79 }
  ];

  const weeklyChoices: WeeklyChoice[] = [
    {
      id: "focus_class",
      name: "집중 수업",
      description: "수업 집중. 체력 회복 없음",
      staminaDelta: 0,
      attendanceDelta: 1,
      assignmentDelta: 2,
      percentileDelta: -2
    },
    {
      id: "normal_class",
      name: "일반 수업",
      description: "균형 진행",
      staminaDelta: 1,
      attendanceDelta: 0,
      assignmentDelta: 1,
      percentileDelta: -1
    },
    {
      id: "rest_in_class",
      name: "수업 중 휴식",
      description: "체력 중간 회복, 학업 페널티",
      staminaDelta: 5,
      attendanceDelta: -4,
      assignmentDelta: -6,
      percentileDelta: 4
    },
    {
      id: "sleep_in_class",
      name: "수업 중 수면",
      description: "체력 크게 회복, 학업 페널티 큼",
      staminaDelta: 9,
      attendanceDelta: -8,
      assignmentDelta: -10,
      percentileDelta: 7
    }
  ];

  let selectedChoiceId = weeklyChoices[1].id;

  const universitySummary = {
    creditLabel: "3.4 / 4.5",
    acquiredCredits: 12,
    targetCredits: 18,
    attendance: 88,
    assignment: 82,
    warningRisk: "주의" as RiskLevel
  };

  $: selectedChoice = weeklyChoices.find((item) => item.id === selectedChoiceId) ?? weeklyChoices[1];
  $: avgPercentile = highSchoolRows.reduce((sum, row) => sum + row.percentile, 0) / highSchoolRows.length;
  $: avgGrade = toGrade(avgPercentile);
  $: avgAttendance =
    highSchoolRows.reduce((sum, row) => sum + row.attendance, 0) / highSchoolRows.length;
  $: avgAssignment =
    highSchoolRows.reduce((sum, row) => sum + row.assignment, 0) / highSchoolRows.length;
  $: riskLevel = resolveRisk(avgGrade, avgAttendance, warningCount);

  $: projectedStamina = clamp(stamina + selectedChoice.staminaDelta, 0, 100);
  $: projectedAvgGrade = toGrade(clamp(avgPercentile + selectedChoice.percentileDelta, 1, 100));
  $: projectedAttendance = clamp(avgAttendance + selectedChoice.attendanceDelta, 0, 100);
  $: projectedAssignment = clamp(avgAssignment + selectedChoice.assignmentDelta, 0, 100);

  $: if (!attendsUniversity && activeSegment === "university") {
    activeSegment = "highschool";
  }

  function toGrade(percentile: number): number {
    if (percentile <= 4) return 1;
    if (percentile <= 11) return 2;
    if (percentile <= 23) return 3;
    if (percentile <= 40) return 4;
    if (percentile <= 60) return 5;
    if (percentile <= 77) return 6;
    if (percentile <= 89) return 7;
    if (percentile <= 96) return 8;
    return 9;
  }

  function gradeClass(grade: number): string {
    if (grade <= 2) return "g-top";
    if (grade <= 4) return "g-mid";
    if (grade <= 6) return "g-low";
    return "g-risk";
  }

  function resolveRisk(grade: number, attendance: number, warning: number): RiskLevel {
    if (warning >= 2 || grade >= 7 || attendance < 82) return "경고";
    if (warning >= 1 || grade >= 5 || attendance < 90) return "주의";
    return "정상";
  }

  function riskClass(level: RiskLevel): string {
    if (level === "정상") return "ok";
    if (level === "주의") return "warn";
    return "danger";
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, Math.round(value * 10) / 10));
  }

  function applyWeeklyChoice() {
    stamina = projectedStamina;
    highSchoolRows = highSchoolRows.map((row) => ({
      ...row,
      percentile: clamp(row.percentile + selectedChoice.percentileDelta, 1, 100),
      attendance: clamp(row.attendance + selectedChoice.attendanceDelta, 0, 100),
      assignment: clamp(row.assignment + selectedChoice.assignmentDelta, 0, 100)
    }));

    if (selectedChoice.id === "sleep_in_class") {
      warningCount = clamp(warningCount + 1, 0, 3);
    } else if (selectedChoice.id === "focus_class" && warningCount > 0) {
      warningCount = clamp(warningCount - 1, 0, 3);
    }
  }
</script>

<section class="academics-page">
  <header class="summary panel">
    <div>
      <p class="label">현재 학업 단계</p>
      <strong>{activeSegment === "highschool" ? "고등학교" : "대학교"}</strong>
    </div>
    <div>
      <p class="label">평균 등급</p>
      <strong class={gradeClass(avgGrade)}>{avgGrade.toFixed(1)} 등급</strong>
    </div>
    <div>
      <p class="label">학업 상태</p>
      <strong class={riskClass(riskLevel)}>{riskLevel}</strong>
    </div>
    <div>
      <p class="label">체력</p>
      <strong>{stamina.toFixed(0)}</strong>
    </div>
  </header>

  <div class="segment-tabs">
    <button
      class:active={activeSegment === "highschool"}
      on:click={() => (activeSegment = "highschool")}
    >
      고등학교
    </button>
    <button
      class:active={activeSegment === "university"}
      disabled={!attendsUniversity}
      on:click={() => (activeSegment = "university")}
    >
      대학교
      {#if !attendsUniversity}<span class="lock">비진학</span>{/if}
    </button>
  </div>

  {#if activeSegment === "highschool"}
    <div class="content-grid">
      <section class="panel">
        <h3>과목별 9등급 현황</h3>
        <div class="subject-head">
          <span>과목</span>
          <span>석차백분율</span>
          <span>등급</span>
          <span>출석</span>
          <span>과제</span>
        </div>
        <div class="subject-rows">
          {#each highSchoolRows as row}
            <div class="subject-row">
              <strong>{row.name}</strong>
              <span>{row.percentile.toFixed(1)}%</span>
              <span class={gradeClass(toGrade(row.percentile))}>{toGrade(row.percentile)}등급</span>
              <span>{row.attendance.toFixed(0)}%</span>
              <span>{row.assignment.toFixed(0)}%</span>
            </div>
          {/each}
        </div>
      </section>

      <section class="panel">
        <h3>주간 학업 선택</h3>
        <div class="choices">
          {#each weeklyChoices as choice}
            <button
              class:active={selectedChoiceId === choice.id}
              on:click={() => (selectedChoiceId = choice.id)}
            >
              <strong>{choice.name}</strong>
              <p>{choice.description}</p>
            </button>
          {/each}
        </div>
        <div class="projection">
          <p>예상 변화</p>
          <ul>
            <li>체력 {stamina.toFixed(0)} → {projectedStamina.toFixed(0)}</li>
            <li>평균등급 {avgGrade.toFixed(1)} → {projectedAvgGrade.toFixed(1)}</li>
            <li>평균출석 {avgAttendance.toFixed(1)}% → {projectedAttendance.toFixed(1)}%</li>
            <li>평균과제 {avgAssignment.toFixed(1)}% → {projectedAssignment.toFixed(1)}%</li>
          </ul>
          <button class="apply" on:click={applyWeeklyChoice}>이번 주 선택 적용</button>
        </div>
      </section>

      <section class="panel events">
        <h3>시험/리스크</h3>
        <ul>
          <li>중간고사 D-11</li>
          <li>영어 듣기 평가 D-4</li>
          <li>과학 수행평가 D-6</li>
          <li>현재 경고 누적: {warningCount}회</li>
        </ul>
      </section>
    </div>
  {:else if attendsUniversity}
    <div class="uni-grid">
      <section class="panel">
        <h3>대학교 학업 더미</h3>
        <div class="uni-head">
          <div>
            <p class="label">전공</p>
            <strong>{universityMajor}</strong>
          </div>
          <div>
            <p class="label">학점</p>
            <strong>{universitySummary.creditLabel}</strong>
          </div>
          <div>
            <p class="label">이수 학점</p>
            <strong>{universitySummary.acquiredCredits} / {universitySummary.targetCredits}</strong>
          </div>
        </div>
        <ul class="uni-list">
          <li><span>출석</span><strong>{universitySummary.attendance}%</strong></li>
          <li><span>과제</span><strong>{universitySummary.assignment}%</strong></li>
          <li><span>학사 위험</span><strong class={riskClass(universitySummary.warningRisk)}>{universitySummary.warningRisk}</strong></li>
        </ul>
      </section>

      <section class="panel">
        <h3>전공 선택 계획</h3>
        <p class="plan-text">현재 더미는 체육교육 고정입니다. 진학 단계에서 아래 전공 중 선택하도록 확장 예정입니다.</p>
        <div class="major-chips">
          {#each plannedUniversityMajors as major}
            <span class:active={major === universityMajor}>{major}</span>
          {/each}
        </div>
      </section>
    </div>
  {:else}
    <section class="panel locked">
      <h3>대학교 학업</h3>
      <p>현재 커리어에서 대학 진학을 선택하지 않아 비활성 상태입니다.</p>
      <p>대학 진학 경로 선택 시 학점/전공/학사경고 시스템이 활성화됩니다.</p>
    </section>
  {/if}
</section>

<style>
  .academics-page {
    height: 100%;
    min-height: 0;
    overflow: hidden;
    display: grid;
    grid-template-rows: auto auto minmax(0, 1fr);
    gap: 10px;
  }

  .panel {
    background: #0f1c34;
    border: 1px solid #2a3e65;
    border-radius: 12px;
    padding: 12px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .summary .label,
  .label {
    margin: 0 0 4px;
    font-size: 12px;
    color: #8ea7d8;
  }

  .summary strong {
    font-size: 20px;
    color: #eaf1ff;
  }

  .segment-tabs {
    display: flex;
    gap: 8px;
  }

  .segment-tabs button {
    border: 1px solid #2f4672;
    background: #172743;
    color: #d8e5ff;
    border-radius: 10px;
    padding: 8px 12px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .segment-tabs button.active {
    border-color: #75a6ff;
    background: #213764;
  }

  .segment-tabs button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .lock {
    font-size: 11px;
    color: #ffcc7a;
    border: 1px solid #92672d;
    border-radius: 999px;
    padding: 2px 8px;
  }

  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.6fr 1.2fr 0.9fr;
    gap: 10px;
  }

  .uni-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 10px;
  }

  h3 {
    margin: 0 0 10px;
    font-size: 18px;
    color: #f5f9ff;
  }

  .subject-head,
  .subject-row {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr 0.7fr 0.7fr 0.7fr;
    gap: 8px;
    align-items: center;
  }

  .subject-head {
    font-size: 12px;
    color: #8ea7d8;
    padding-bottom: 8px;
    border-bottom: 1px solid #26395d;
  }

  .subject-rows {
    display: grid;
    gap: 8px;
    margin-top: 8px;
  }

  .subject-row {
    background: #122443;
    border: 1px solid #264170;
    border-radius: 8px;
    padding: 7px 8px;
    font-size: 13px;
    color: #dfe8ff;
  }

  .choices {
    display: grid;
    gap: 8px;
  }

  .choices button {
    border: 1px solid #2a4168;
    background: #13233f;
    color: #dce8ff;
    border-radius: 9px;
    padding: 8px;
    text-align: left;
    cursor: pointer;
  }

  .choices button.active {
    border-color: #7cabff;
    background: #1b325b;
  }

  .choices button strong {
    display: block;
    font-size: 14px;
    margin-bottom: 4px;
  }

  .choices button p {
    margin: 0;
    font-size: 12px;
    color: #b5c8ee;
  }

  .projection {
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid #26395d;
  }

  .projection p {
    margin: 0 0 6px;
    font-size: 13px;
    color: #8ea7d8;
  }

  .projection ul,
  .events ul,
  .uni-list {
    margin: 0;
    padding-left: 18px;
    color: #e0ebff;
    font-size: 13px;
    line-height: 1.5;
  }

  .apply {
    margin-top: 10px;
    width: 100%;
    border: 1px solid #6f9fff;
    background: #2f5eb4;
    color: #f1f7ff;
    border-radius: 8px;
    padding: 8px 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .uni-head {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    margin-bottom: 10px;
  }

  .uni-head strong {
    color: #eef4ff;
    font-size: 18px;
  }

  .uni-list {
    list-style: none;
    padding-left: 0;
  }

  .uni-list li {
    border-top: 1px solid #26395d;
    padding: 8px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .uni-list li:first-child {
    border-top: 0;
  }

  .plan-text {
    margin: 0;
    color: #c9d8f5;
    font-size: 13px;
    line-height: 1.5;
  }

  .major-chips {
    margin-top: 10px;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .major-chips span {
    border: 1px solid #35517f;
    border-radius: 999px;
    padding: 4px 10px;
    color: #c9daf9;
    background: #142745;
    font-size: 12px;
  }

  .major-chips span.active {
    border-color: #8bb5ff;
    color: #f1f7ff;
    background: #2a4677;
  }

  .locked {
    display: grid;
    align-content: center;
    justify-items: center;
    gap: 8px;
    text-align: center;
    color: #d6e3ff;
  }

  .g-top {
    color: #77eb9f;
    font-weight: 700;
  }

  .g-mid {
    color: #77b8ff;
    font-weight: 700;
  }

  .g-low {
    color: #ffd37a;
    font-weight: 700;
  }

  .g-risk {
    color: #ff8d8d;
    font-weight: 700;
  }

  .ok {
    color: #77eb9f;
  }

  .warn {
    color: #ffd37a;
  }

  .danger {
    color: #ff8d8d;
  }

  @media (max-width: 1280px) {
    .summary strong {
      font-size: 18px;
    }

    .content-grid {
      grid-template-columns: 1.35fr 1fr 0.9fr;
    }

    .uni-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
