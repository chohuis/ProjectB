<script lang="ts">
  type RosterTab = "all" | "pitcher" | "batter" | "staff";
  type Condition = "good" | "normal" | "alert";
  type SortDirection = "asc" | "desc";

  type Ability = {
    label: string;
    value: number;
  };

  type PitcherRecent = {
    date: string;
    opponent: string;
    ip: number;
    er: number;
    k: number;
    result: string;
  };

  type BatterRecent = {
    date: string;
    opponent: string;
    line: string;
    hr: number;
    rbi: number;
    result: string;
  };

  type PitcherRow = {
    id: string;
    name: string;
    age: number;
    role: "SP" | "RP" | "CP";
    g: number;
    ip: number;
    era: number;
    whip: number;
    k: number;
    bb: number;
    condition: Condition;
    trend: string;
    abilities: Ability[];
    recentGames: PitcherRecent[];
  };

  type BatterRow = {
    id: string;
    name: string;
    age: number;
    pos: string;
    g: number;
    avg: number;
    ops: number;
    hr: number;
    rbi: number;
    sb: number;
    condition: Condition;
    trend: string;
    abilities: Ability[];
    recentGames: BatterRecent[];
  };

  type StaffRole = "manager" | "coach";

  type StaffRow = {
    id: string;
    name: string;
    role: StaffRole;
    specialty: string;
    leadership: number;
    tactics: number;
    development: number;
    condition: Condition;
    style: string;
    note: string;
    recentLogs: string[];
  };

  type PitcherSortField = "name" | "age" | "role" | "g" | "ip" | "era" | "whip" | "k" | "bb";
  type BatterSortField = "name" | "age" | "pos" | "g" | "avg" | "ops" | "hr" | "rbi" | "sb";
  type StaffSortField = "name" | "leadership" | "tactics" | "development";

  const pitcherSortOptions: Array<{ key: PitcherSortField; label: string }> = [
    { key: "name", label: "이름" },
    { key: "age", label: "나이" },
    { key: "role", label: "역할" },
    { key: "g", label: "경기" },
    { key: "ip", label: "이닝" },
    { key: "era", label: "ERA" },
    { key: "whip", label: "WHIP" },
    { key: "k", label: "탈삼진" },
    { key: "bb", label: "볼넷" }
  ];

  const batterSortOptions: Array<{ key: BatterSortField; label: string }> = [
    { key: "name", label: "이름" },
    { key: "age", label: "나이" },
    { key: "pos", label: "포지션" },
    { key: "g", label: "경기" },
    { key: "avg", label: "타율" },
    { key: "ops", label: "OPS" },
    { key: "hr", label: "홈런" },
    { key: "rbi", label: "타점" },
    { key: "sb", label: "도루" }
  ];

  const staffSortOptions: Array<{ key: StaffSortField; label: string }> = [
    { key: "name", label: "이름" },
    { key: "leadership", label: "리더십" },
    { key: "tactics", label: "전술" },
    { key: "development", label: "육성" }
  ];

  let tab: RosterTab = "all";
  let keyword = "";

  let pitcherSortField: PitcherSortField = "era";
  let pitcherSortDirection: SortDirection = "asc";
  let batterSortField: BatterSortField = "ops";
  let batterSortDirection: SortDirection = "asc";
  let staffSortField: StaffSortField = "leadership";
  let staffSortDirection: SortDirection = "desc";
  let staffRoleFilter: "all" | StaffRole = "all";

  let pitcherSortOpen = false;
  let batterSortOpen = false;
  let staffSortOpen = false;

  const pitchers: PitcherRow[] = [
    {
      id: "p1",
      name: "정서겸",
      age: 18,
      role: "SP",
      g: 5,
      ip: 31.2,
      era: 2.56,
      whip: 1.07,
      k: 39,
      bb: 9,
      condition: "good",
      trend: "최근 2경기 연속 QS",
      abilities: [
        { label: "구속", value: 29 },
        { label: "커맨드", value: 30 },
        { label: "무브먼트", value: 29 },
        { label: "스태미나", value: 27 },
        { label: "멘탈", value: 26 },
        { label: "천재성", value: 25 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", ip: 7.0, er: 1, k: 8, result: "W" },
        { date: "04/13", opponent: "부산 마린", ip: 6.0, er: 2, k: 7, result: "W" },
        { date: "04/06", opponent: "강릉 웨이브", ip: 5.2, er: 2, k: 6, result: "ND" },
        { date: "03/30", opponent: "대구 스피릿", ip: 6.1, er: 1, k: 9, result: "W" },
        { date: "03/23", opponent: "인천 스카이", ip: 6.2, er: 3, k: 9, result: "L" }
      ]
    },
    {
      id: "p2",
      name: "안도혁",
      age: 19,
      role: "SP",
      g: 6,
      ip: 34.1,
      era: 3.15,
      whip: 1.21,
      k: 33,
      bb: 12,
      condition: "normal",
      trend: "직전 경기 6이닝 2실점",
      abilities: [
        { label: "구속", value: 25 },
        { label: "커맨드", value: 24 },
        { label: "무브먼트", value: 26 },
        { label: "스태미나", value: 26 },
        { label: "멘탈", value: 23 },
        { label: "천재성", value: 21 }
      ],
      recentGames: [
        { date: "04/19", opponent: "수원 퓨전", ip: 6.0, er: 2, k: 6, result: "W" },
        { date: "04/12", opponent: "서울 프레스티지", ip: 5.1, er: 3, k: 5, result: "ND" },
        { date: "04/05", opponent: "부산 마린", ip: 6.2, er: 2, k: 7, result: "W" },
        { date: "03/29", opponent: "강릉 웨이브", ip: 5.0, er: 3, k: 6, result: "L" },
        { date: "03/22", opponent: "인천 스카이", ip: 6.1, er: 2, k: 9, result: "W" }
      ]
    },
    {
      id: "p3",
      name: "한서원",
      age: 17,
      role: "RP",
      g: 11,
      ip: 16.0,
      era: 2.81,
      whip: 1.19,
      k: 18,
      bb: 6,
      condition: "good",
      trend: "중간계투 안정",
      abilities: [
        { label: "구속", value: 24 },
        { label: "커맨드", value: 24 },
        { label: "무브먼트", value: 27 },
        { label: "스태미나", value: 21 },
        { label: "멘탈", value: 22 },
        { label: "천재성", value: 20 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", ip: 1.1, er: 0, k: 2, result: "H" },
        { date: "04/18", opponent: "수원 퓨전", ip: 1.0, er: 0, k: 1, result: "H" },
        { date: "04/14", opponent: "부산 마린", ip: 2.0, er: 1, k: 3, result: "W" },
        { date: "04/09", opponent: "강릉 웨이브", ip: 1.0, er: 0, k: 1, result: "H" },
        { date: "04/03", opponent: "대구 스피릿", ip: 1.2, er: 1, k: 2, result: "ND" }
      ]
    },
    {
      id: "p4",
      name: "김태윤",
      age: 18,
      role: "CP",
      g: 9,
      ip: 10.2,
      era: 1.69,
      whip: 0.94,
      k: 14,
      bb: 3,
      condition: "normal",
      trend: "세이브 5개",
      abilities: [
        { label: "구속", value: 28 },
        { label: "커맨드", value: 27 },
        { label: "무브먼트", value: 28 },
        { label: "스태미나", value: 19 },
        { label: "멘탈", value: 27 },
        { label: "천재성", value: 23 }
      ],
      recentGames: [
        { date: "04/21", opponent: "인천 스카이", ip: 1.0, er: 0, k: 1, result: "S" },
        { date: "04/18", opponent: "수원 퓨전", ip: 1.0, er: 0, k: 2, result: "S" },
        { date: "04/14", opponent: "부산 마린", ip: 1.0, er: 1, k: 1, result: "S" },
        { date: "04/10", opponent: "강릉 웨이브", ip: 1.0, er: 0, k: 2, result: "S" },
        { date: "04/07", opponent: "대구 스피릿", ip: 1.0, er: 0, k: 1, result: "S" }
      ]
    },
    {
      id: "p5",
      name: "박주형",
      age: 18,
      role: "RP",
      g: 8,
      ip: 9.1,
      era: 4.82,
      whip: 1.56,
      k: 10,
      bb: 7,
      condition: "alert",
      trend: "제구 흔들림",
      abilities: [
        { label: "구속", value: 23 },
        { label: "커맨드", value: 18 },
        { label: "무브먼트", value: 21 },
        { label: "스태미나", value: 20 },
        { label: "멘탈", value: 17 },
        { label: "천재성", value: 16 }
      ],
      recentGames: [
        { date: "04/21", opponent: "인천 스카이", ip: 1.0, er: 1, k: 1, result: "ND" },
        { date: "04/16", opponent: "서울 프레스티지", ip: 1.1, er: 2, k: 2, result: "L" },
        { date: "04/12", opponent: "부산 마린", ip: 0.2, er: 1, k: 0, result: "ND" },
        { date: "04/08", opponent: "강릉 웨이브", ip: 1.0, er: 0, k: 2, result: "H" },
        { date: "04/02", opponent: "대구 스피릿", ip: 1.0, er: 1, k: 1, result: "ND" }
      ]
    }
  ];

  const batters: BatterRow[] = [
    {
      id: "b1",
      name: "최민석",
      age: 18,
      pos: "CF",
      g: 18,
      avg: 0.341,
      ops: 0.931,
      hr: 3,
      rbi: 14,
      sb: 11,
      condition: "good",
      trend: "출루율 상승세",
      abilities: [
        { label: "컨택", value: 30 },
        { label: "파워", value: 24 },
        { label: "선구안", value: 26 },
        { label: "주루", value: 29 },
        { label: "수비", value: 27 },
        { label: "천재성", value: 24 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", line: "4-2", hr: 0, rbi: 1, result: "W" },
        { date: "04/19", opponent: "수원 퓨전", line: "5-3", hr: 1, rbi: 3, result: "W" },
        { date: "04/13", opponent: "부산 마린", line: "4-1", hr: 0, rbi: 0, result: "L" },
        { date: "04/06", opponent: "강릉 웨이브", line: "4-2", hr: 0, rbi: 2, result: "W" },
        { date: "03/30", opponent: "대구 스피릿", line: "3-1", hr: 0, rbi: 1, result: "W" }
      ]
    },
    {
      id: "b2",
      name: "이규현",
      age: 19,
      pos: "SS",
      g: 19,
      avg: 0.302,
      ops: 0.845,
      hr: 2,
      rbi: 12,
      sb: 7,
      condition: "normal",
      trend: "수비/공격 균형",
      abilities: [
        { label: "컨택", value: 26 },
        { label: "파워", value: 21 },
        { label: "선구안", value: 24 },
        { label: "주루", value: 24 },
        { label: "수비", value: 29 },
        { label: "천재성", value: 22 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", line: "4-1", hr: 0, rbi: 1, result: "W" },
        { date: "04/19", opponent: "수원 퓨전", line: "4-2", hr: 0, rbi: 2, result: "W" },
        { date: "04/13", opponent: "부산 마린", line: "5-1", hr: 0, rbi: 0, result: "L" },
        { date: "04/06", opponent: "강릉 웨이브", line: "4-2", hr: 1, rbi: 2, result: "W" },
        { date: "03/30", opponent: "대구 스피릿", line: "4-1", hr: 0, rbi: 1, result: "W" }
      ]
    },
    {
      id: "b3",
      name: "윤태주",
      age: 18,
      pos: "1B",
      g: 17,
      avg: 0.287,
      ops: 0.884,
      hr: 5,
      rbi: 21,
      sb: 1,
      condition: "good",
      trend: "장타 페이스 유지",
      abilities: [
        { label: "컨택", value: 24 },
        { label: "파워", value: 30 },
        { label: "선구안", value: 23 },
        { label: "주루", value: 17 },
        { label: "수비", value: 22 },
        { label: "천재성", value: 25 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", line: "4-1", hr: 1, rbi: 2, result: "W" },
        { date: "04/19", opponent: "수원 퓨전", line: "4-2", hr: 1, rbi: 3, result: "W" },
        { date: "04/13", opponent: "부산 마린", line: "4-0", hr: 0, rbi: 0, result: "L" },
        { date: "04/06", opponent: "강릉 웨이브", line: "4-1", hr: 1, rbi: 2, result: "W" },
        { date: "03/30", opponent: "대구 스피릿", line: "4-2", hr: 0, rbi: 1, result: "W" }
      ]
    },
    {
      id: "b4",
      name: "문지호",
      age: 17,
      pos: "C",
      g: 14,
      avg: 0.254,
      ops: 0.712,
      hr: 1,
      rbi: 9,
      sb: 0,
      condition: "normal",
      trend: "리드 집중",
      abilities: [
        { label: "컨택", value: 20 },
        { label: "파워", value: 18 },
        { label: "선구안", value: 21 },
        { label: "주루", value: 15 },
        { label: "수비", value: 28 },
        { label: "천재성", value: 19 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", line: "3-1", hr: 0, rbi: 1, result: "W" },
        { date: "04/19", opponent: "수원 퓨전", line: "4-0", hr: 0, rbi: 0, result: "W" },
        { date: "04/13", opponent: "부산 마린", line: "3-1", hr: 0, rbi: 1, result: "L" },
        { date: "04/06", opponent: "강릉 웨이브", line: "3-1", hr: 0, rbi: 1, result: "W" },
        { date: "03/30", opponent: "대구 스피릿", line: "4-0", hr: 0, rbi: 0, result: "W" }
      ]
    },
    {
      id: "b5",
      name: "강시우",
      age: 18,
      pos: "3B",
      g: 16,
      avg: 0.221,
      ops: 0.639,
      hr: 1,
      rbi: 7,
      sb: 3,
      condition: "alert",
      trend: "타격 보정 훈련 필요",
      abilities: [
        { label: "컨택", value: 17 },
        { label: "파워", value: 19 },
        { label: "선구안", value: 16 },
        { label: "주루", value: 20 },
        { label: "수비", value: 21 },
        { label: "천재성", value: 16 }
      ],
      recentGames: [
        { date: "04/20", opponent: "서울 프레스티지", line: "4-0", hr: 0, rbi: 0, result: "W" },
        { date: "04/19", opponent: "수원 퓨전", line: "4-1", hr: 0, rbi: 1, result: "W" },
        { date: "04/13", opponent: "부산 마린", line: "4-0", hr: 0, rbi: 0, result: "L" },
        { date: "04/06", opponent: "강릉 웨이브", line: "3-1", hr: 0, rbi: 1, result: "W" },
        { date: "03/30", opponent: "대구 스피릿", line: "3-0", hr: 0, rbi: 0, result: "W" }
      ]
    }
  ];

  const staffs: StaffRow[] = [
    {
      id: "s1",
      name: "임우현",
      role: "manager",
      specialty: "팀 운영 총괄",
      leadership: 82,
      tactics: 84,
      development: 79,
      condition: "good",
      style: "공격적 운영 + 데이터 기반 교체 타이밍",
      note: "접전에서 대타/대주자 운용이 빠른 편",
      recentLogs: [
        "주말 1차전 7회 승부처 대타 지시 적중",
        "투수 교체 타이밍 미세 조정으로 실점 최소화",
        "훈련 강도 주간 분배안 승인"
      ]
    },
    {
      id: "s2",
      name: "오지경",
      role: "coach",
      specialty: "투수 코치",
      leadership: 69,
      tactics: 74,
      development: 70,
      condition: "normal",
      style: "제구/릴리스 일관성 교정",
      note: "불펜 세션 피드백 속도가 빠름",
      recentLogs: [
        "정서겸 릴리스 포인트 미세 보정",
        "한서원 슬라이더 릴리스 각도 점검",
        "불펜 루틴 30구 제한안 제안"
      ]
    },
    {
      id: "s3",
      name: "서태연",
      role: "coach",
      specialty: "타격 코치",
      leadership: 73,
      tactics: 76,
      development: 77,
      condition: "good",
      style: "컨택 우선 + 상황 타격 강화",
      note: "상대 선발 유형별 타순 대응이 강점",
      recentLogs: [
        "최민석 초구 대응 루틴 조정",
        "강시우 컨택 보정 드릴 배치",
        "클러치 타석 전 루틴 카드 업데이트"
      ]
    },
    {
      id: "s4",
      name: "강채주",
      role: "coach",
      specialty: "수비 코치",
      leadership: 75,
      tactics: 77,
      development: 74,
      condition: "normal",
      style: "송구 전환/포지셔닝 강화",
      note: "내야 수비 전환 훈련 설계 담당",
      recentLogs: [
        "SS-2B 병살 전환 루틴 강화",
        "외야 컷오프 포지셔닝 점검",
        "수비 시프트 시나리오 3종 배포"
      ]
    },
    {
      id: "s5",
      name: "조수겸",
      role: "coach",
      specialty: "체력 코치",
      leadership: 71,
      tactics: 72,
      development: 78,
      condition: "alert",
      style: "회복 우선 + 부하 관리",
      note: "최근 누적 피로 관리 이슈 대응 중",
      recentLogs: [
        "주중 회복 세션 비율 상향 제안",
        "선발진 하체 피로 지표 경고",
        "부상 예방 스트레칭 루틴 재배포"
      ]
    }
  ];

  let selectedPitcherId = pitchers[0].id;
  let selectedBatterId = batters[0].id;
  let selectedStaffId = staffs[0].id;

  $: normalizedKeyword = keyword.trim().toLowerCase();

  $: filteredPitchers = pitchers.filter((player) =>
    player.name.toLowerCase().includes(normalizedKeyword)
  );

  $: filteredBatters = batters.filter((player) =>
    player.name.toLowerCase().includes(normalizedKeyword)
  );

  $: filteredStaffs = staffs.filter((staff) => {
    const roleMatched = staffRoleFilter === "all" || staff.role === staffRoleFilter;
    const keywordMatched = staff.name.toLowerCase().includes(normalizedKeyword);
    return roleMatched && keywordMatched;
  });

  function compareValue(a: string | number, b: string | number, direction: SortDirection): number {
    const cmp = typeof a === "string" && typeof b === "string" ? a.localeCompare(b, "ko") : Number(a) - Number(b);
    return direction === "asc" ? cmp : -cmp;
  }

  $: visiblePitchers = [...filteredPitchers].sort((a, b) => {
    const av = a[pitcherSortField];
    const bv = b[pitcherSortField];
    return compareValue(av, bv, pitcherSortDirection);
  });

  $: visibleBatters = [...filteredBatters].sort((a, b) => {
    const av = a[batterSortField];
    const bv = b[batterSortField];
    return compareValue(av, bv, batterSortDirection);
  });

  $: visibleStaffs = [...filteredStaffs].sort((a, b) => {
    const av = a[staffSortField];
    const bv = b[staffSortField];
    return compareValue(av, bv, staffSortDirection);
  });

  function stepFromCondition(condition: Condition): string {
    if (condition === "good") return "STEP 3";
    if (condition === "normal") return "STEP 2";
    return "STEP 1";
  }

  $: allRows = [
    ...visiblePitchers.map((player) => ({
      id: player.id,
      type: "투수",
      name: player.name,
      age: player.age,
      slot: player.role,
      g: player.g,
      metric: `ERA ${player.era.toFixed(2)} / WHIP ${player.whip.toFixed(2)}`,
      condition: player.condition,
      step: stepFromCondition(player.condition)
    })),
    ...visibleBatters.map((player) => ({
      id: player.id,
      type: "타자",
      name: player.name,
      age: player.age,
      slot: player.pos,
      g: player.g,
      metric: `AVG ${player.avg.toFixed(3).slice(1)} / OPS ${player.ops.toFixed(3)}`,
      condition: player.condition,
      step: stepFromCondition(player.condition)
    }))
  ].sort((a, b) => a.name.localeCompare(b.name, "ko"));

  $: currentPitcherSortLabel =
    pitcherSortOptions.find((option) => option.key === pitcherSortField)?.label ?? "";

  $: currentBatterSortLabel =
    batterSortOptions.find((option) => option.key === batterSortField)?.label ?? "";

  $: currentStaffSortLabel =
    staffSortOptions.find((option) => option.key === staffSortField)?.label ?? "";

  $: selectedPitcher =
    visiblePitchers.find((player) => player.id === selectedPitcherId) ?? visiblePitchers[0] ?? null;

  $: selectedBatter =
    visibleBatters.find((player) => player.id === selectedBatterId) ?? visibleBatters[0] ?? null;

  $: selectedStaff =
    visibleStaffs.find((staff) => staff.id === selectedStaffId) ?? visibleStaffs[0] ?? null;

  function conditionLabel(condition: Condition): string {
    if (condition === "good") return "양호";
    if (condition === "alert") return "주의";
    return "보통";
  }

  function sortLabel(direction: SortDirection): string {
    return direction === "asc" ? "↑ 오름차순" : "↓ 내림차순";
  }

  function staffRoleLabel(role: StaffRole): string {
    return role === "manager" ? "감독" : "코치";
  }

  function selectPitcherSort(field: PitcherSortField) {
    if (pitcherSortField === field) {
      pitcherSortDirection = pitcherSortDirection === "asc" ? "desc" : "asc";
    } else {
      pitcherSortField = field;
      pitcherSortDirection = "asc";
    }
    pitcherSortOpen = false;
  }

  function selectBatterSort(field: BatterSortField) {
    if (batterSortField === field) {
      batterSortDirection = batterSortDirection === "asc" ? "desc" : "asc";
    } else {
      batterSortField = field;
      batterSortDirection = "asc";
    }
    batterSortOpen = false;
  }

  function selectStaffSort(field: StaffSortField) {
    if (staffSortField === field) {
      staffSortDirection = staffSortDirection === "asc" ? "desc" : "asc";
    } else {
      staffSortField = field;
      staffSortDirection = "asc";
    }
    staffSortOpen = false;
  }
</script>

<section class="page">
  <h2>로스터</h2>

  <article class="card board">
    <header class="tools">
      <div class="tabs">
        <button class:active={tab === "all"} on:click={() => (tab = "all")}>전체</button>
        <button class:active={tab === "pitcher"} on:click={() => (tab = "pitcher")}>투수</button>
        <button class:active={tab === "batter"} on:click={() => (tab = "batter")}>타자</button>
        <button class:active={tab === "staff"} on:click={() => (tab = "staff")}>스태프</button>
      </div>

      <div class="controls">
        <input bind:value={keyword} placeholder="이름 검색" />

        {#if tab === "pitcher"}
          <div class="sort-box">
            <button class="sort-trigger" on:click={() => (pitcherSortOpen = !pitcherSortOpen)}>
              정렬: {currentPitcherSortLabel} {sortLabel(pitcherSortDirection)}
            </button>
            {#if pitcherSortOpen}
              <div class="sort-menu">
                {#each pitcherSortOptions as option}
                  <button on:click={() => selectPitcherSort(option.key)}>
                    {option.label}
                    {#if pitcherSortField === option.key}
                      <span>{sortLabel(pitcherSortDirection)}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if tab === "batter"}
          <div class="sort-box">
            <button class="sort-trigger" on:click={() => (batterSortOpen = !batterSortOpen)}>
              정렬: {currentBatterSortLabel} {sortLabel(batterSortDirection)}
            </button>
            {#if batterSortOpen}
              <div class="sort-menu">
                {#each batterSortOptions as option}
                  <button on:click={() => selectBatterSort(option.key)}>
                    {option.label}
                    {#if batterSortField === option.key}
                      <span>{sortLabel(batterSortDirection)}</span>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if tab === "staff"}
          <div class="staff-controls">
            <div class="role-filter">
              <button class:active={staffRoleFilter === "all"} on:click={() => (staffRoleFilter = "all")}>
                전체
              </button>
              <button
                class:active={staffRoleFilter === "manager"}
                on:click={() => (staffRoleFilter = "manager")}
              >
                감독
              </button>
              <button
                class:active={staffRoleFilter === "coach"}
                on:click={() => (staffRoleFilter = "coach")}
              >
                코치
              </button>
            </div>
            <div class="sort-box">
              <button class="sort-trigger" on:click={() => (staffSortOpen = !staffSortOpen)}>
                정렬: {currentStaffSortLabel} {sortLabel(staffSortDirection)}
              </button>
              {#if staffSortOpen}
                <div class="sort-menu">
                  {#each staffSortOptions as option}
                    <button on:click={() => selectStaffSort(option.key)}>
                      {option.label}
                      {#if staffSortField === option.key}
                        <span>{sortLabel(staffSortDirection)}</span>
                      {/if}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </header>

    <div class="content-grid">
      <section class="list-wrap">
        {#if tab === "all"}
          <div class="head-row all">
            <span>이름</span>
            <span>유형</span>
            <span>나이</span>
            <span>포지션/역할</span>
            <span>G</span>
            <span>핵심 기록</span>
            <span>컨디션</span>
            <span>스텝</span>
          </div>

          <div class="rows">
            {#if allRows.length === 0}
              <p class="empty">검색 결과가 없습니다.</p>
            {:else}
              {#each allRows as row}
                <div class="data-row all">
                  <strong>{row.name}</strong>
                  <span>{row.type}</span>
                  <span>{row.age}</span>
                  <span>{row.slot}</span>
                  <span>{row.g}</span>
                  <span>{row.metric}</span>
                  <span class={`cond ${row.condition}`}>{conditionLabel(row.condition)}</span>
                  <span class="step-tag">{row.step}</span>
                </div>
              {/each}
            {/if}
          </div>
        {:else if tab === "pitcher"}
          <div class="head-row pitcher">
            <span>이름</span>
            <span>나이</span>
            <span>역할</span>
            <span>G</span>
            <span>IP</span>
            <span>ERA</span>
            <span>WHIP</span>
            <span>K</span>
            <span>BB</span>
            <span>컨디션</span>
            <span>스텝</span>
          </div>

          <div class="rows">
            {#if visiblePitchers.length === 0}
              <p class="empty">검색 결과가 없습니다.</p>
            {:else}
              {#each visiblePitchers as player}
                <button
                  class="data-row pitcher"
                  class:selected={selectedPitcher?.id === player.id}
                  on:click={() => (selectedPitcherId = player.id)}
                >
                  <strong>{player.name}</strong>
                  <span>{player.age}</span>
                  <span>{player.role}</span>
                  <span>{player.g}</span>
                  <span>{player.ip.toFixed(1)}</span>
                  <span>{player.era.toFixed(2)}</span>
                  <span>{player.whip.toFixed(2)}</span>
                  <span>{player.k}</span>
                  <span>{player.bb}</span>
                  <span class={`cond ${player.condition}`}>{conditionLabel(player.condition)}</span>
                  <span class="step-tag">{stepFromCondition(player.condition)}</span>
                </button>
              {/each}
            {/if}
          </div>
        {:else if tab === "batter"}
          <div class="head-row batter">
            <span>이름</span>
            <span>나이</span>
            <span>포지션</span>
            <span>G</span>
            <span>타율</span>
            <span>OPS</span>
            <span>HR</span>
            <span>RBI</span>
            <span>SB</span>
            <span>컨디션</span>
            <span>스텝</span>
          </div>

          <div class="rows">
            {#if visibleBatters.length === 0}
              <p class="empty">검색 결과가 없습니다.</p>
            {:else}
              {#each visibleBatters as player}
                <button
                  class="data-row batter"
                  class:selected={selectedBatter?.id === player.id}
                  on:click={() => (selectedBatterId = player.id)}
                >
                  <strong>{player.name}</strong>
                  <span>{player.age}</span>
                  <span>{player.pos}</span>
                  <span>{player.g}</span>
                  <span>{player.avg.toFixed(3).slice(1)}</span>
                  <span>{player.ops.toFixed(3)}</span>
                  <span>{player.hr}</span>
                  <span>{player.rbi}</span>
                  <span>{player.sb}</span>
                  <span class={`cond ${player.condition}`}>{conditionLabel(player.condition)}</span>
                  <span class="step-tag">{stepFromCondition(player.condition)}</span>
                </button>
              {/each}
            {/if}
          </div>
        {:else}
          <div class="head-row staff">
            <span>이름</span>
            <span>역할</span>
            <span>담당</span>
            <span>리더십</span>
            <span>전술</span>
            <span>육성</span>
            <span>컨디션</span>
          </div>

          <div class="rows">
            {#if visibleStaffs.length === 0}
              <p class="empty">검색 결과가 없습니다.</p>
            {:else}
              {#each visibleStaffs as staff}
                <button
                  class="data-row staff"
                  class:selected={selectedStaff?.id === staff.id}
                  on:click={() => (selectedStaffId = staff.id)}
                >
                  <strong>{staff.name}</strong>
                  <span>{staffRoleLabel(staff.role)}</span>
                  <span>{staff.specialty}</span>
                  <span>{staff.leadership}</span>
                  <span>{staff.tactics}</span>
                  <span>{staff.development}</span>
                  <span class={`cond ${staff.condition}`}>{conditionLabel(staff.condition)}</span>
                </button>
              {/each}
            {/if}
          </div>
        {/if}
      </section>

      <aside class="detail-card">
        {#if tab === "pitcher" && selectedPitcher}
          <h3>{selectedPitcher.name}</h3>
          <p>{selectedPitcher.age}세 · {selectedPitcher.role} · 컨디션 {conditionLabel(selectedPitcher.condition)}</p>

          <section class="detail-section">
            <h4>능력치</h4>
            <div class="ability-grid">
              {#each selectedPitcher.abilities as ability}
                <div>
                  <span>{ability.label}</span>
                  <strong>{ability.value}</strong>
                </div>
              {/each}
            </div>
          </section>

          <section class="detail-section">
            <h4>최근 5경기</h4>
            <ul class="recent-list">
              {#each selectedPitcher.recentGames as game}
                <li>
                  <span>{game.date}</span>
                  <span>{game.opponent}</span>
                  <span>{game.ip.toFixed(1)}IP / {game.er}ER / {game.k}K</span>
                  <strong>{game.result}</strong>
                </li>
              {/each}
            </ul>
          </section>

          <p class="trend">메모: {selectedPitcher.trend}</p>
        {:else if tab === "batter" && selectedBatter}
          <h3>{selectedBatter.name}</h3>
          <p>{selectedBatter.age}세 · {selectedBatter.pos} · 컨디션 {conditionLabel(selectedBatter.condition)}</p>

          <section class="detail-section">
            <h4>능력치</h4>
            <div class="ability-grid">
              {#each selectedBatter.abilities as ability}
                <div>
                  <span>{ability.label}</span>
                  <strong>{ability.value}</strong>
                </div>
              {/each}
            </div>
          </section>

          <section class="detail-section">
            <h4>최근 5경기</h4>
            <ul class="recent-list">
              {#each selectedBatter.recentGames as game}
                <li>
                  <span>{game.date}</span>
                  <span>{game.opponent}</span>
                  <span>{game.line} / HR {game.hr} / RBI {game.rbi}</span>
                  <strong>{game.result}</strong>
                </li>
              {/each}
            </ul>
          </section>

          <p class="trend">메모: {selectedBatter.trend}</p>
        {:else if tab === "all"}
          <h3>전체</h3>
          <p>투수/타자를 통합해서 확인하는 보기입니다.</p>
          <p class="trend">리스트에서 이름 검색 후 유형별 기록과 스텝을 함께 확인할 수 있습니다.</p>
        {:else if selectedStaff}
          <h3>{selectedStaff.name}</h3>
          <p>
            {staffRoleLabel(selectedStaff.role)} · {selectedStaff.specialty} · 컨디션
            {conditionLabel(selectedStaff.condition)}
          </p>

          <section class="detail-section">
            <h4>{selectedStaff.role === "manager" ? "감독 운영 지표" : "코치 지도 지표"}</h4>
            <div class="ability-grid">
              <div>
                <span>리더십</span>
                <strong>{selectedStaff.leadership}</strong>
              </div>
              <div>
                <span>전술</span>
                <strong>{selectedStaff.tactics}</strong>
              </div>
              <div>
                <span>육성</span>
                <strong>{selectedStaff.development}</strong>
              </div>
            </div>
          </section>

          <section class="detail-section">
            <h4>{selectedStaff.role === "manager" ? "최근 지시 로그" : "최근 훈련 제안 로그"}</h4>
            <ul class="recent-list">
              {#each selectedStaff.recentLogs as log, index}
                <li>
                  <span>{index + 1}.</span>
                  <span>{log}</span>
                  <span>-</span>
                  <strong>{selectedStaff.role === "manager" ? "지시" : "제안"}</strong>
                </li>
              {/each}
            </ul>
          </section>

          <p class="trend">
            {selectedStaff.role === "manager"
              ? `운영 성향: ${selectedStaff.style}`
              : `코칭 성향: ${selectedStaff.style}`}
          </p>
          <p class="trend">메모: {selectedStaff.note}</p>
        {/if}
      </aside>
    </div>
  </article>
</section>

<style>
  .page {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 12px;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  h2,
  h3,
  h4,
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

  .board {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 10px;
  }

  .tools {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .tabs,
  .controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .staff-controls {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .role-filter {
    display: flex;
    gap: 4px;
  }

  .role-filter button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 9px;
    font-size: 12px;
    cursor: pointer;
  }

  .role-filter button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }

  .tabs button,
  .controls input,
  .sort-trigger,
  .sort-menu button {
    border: 1px solid #355182;
    background: #1f2f4f;
    color: #dbe8ff;
    border-radius: 8px;
    padding: 5px 10px;
    font-size: 12px;
  }

  .tabs button,
  .sort-trigger,
  .sort-menu button {
    cursor: pointer;
  }

  .tabs button.active {
    background: #3262b0;
    border-color: #6da1f7;
  }

  .controls input {
    width: 130px;
  }

  .sort-box {
    position: relative;
  }

  .sort-trigger {
    min-width: 210px;
    text-align: left;
  }

  .sort-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 220px;
    display: grid;
    gap: 4px;
    padding: 6px;
    border-radius: 10px;
    border: 1px solid #355182;
    background: #142540;
    z-index: 10;
  }

  .sort-menu button {
    text-align: left;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sort-menu button span {
    color: #9fc0f4;
    font-size: 11px;
  }

  .content-grid {
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(240px, 1fr);
    gap: 10px;
  }

  .list-wrap {
    min-height: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 6px;
    border: 1px solid #2f486f;
    border-radius: 10px;
    padding: 8px;
    background: #13223d;
  }

  .head-row,
  .data-row {
    display: grid;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .head-row {
    color: #9fb4d8;
    padding: 0 6px;
  }

  .head-row.pitcher,
  .data-row.pitcher {
    grid-template-columns: 1.1fr 0.5fr 0.6fr 0.4fr 0.55fr 0.55fr 0.55fr 0.4fr 0.4fr 0.65fr 0.65fr;
  }

  .head-row.batter,
  .data-row.batter {
    grid-template-columns: 1.1fr 0.5fr 0.6fr 0.4fr 0.5fr 0.55fr 0.4fr 0.45fr 0.4fr 0.65fr 0.65fr;
  }

  .head-row.all,
  .data-row.all {
    grid-template-columns: 0.95fr 0.5fr 0.45fr 0.6fr 0.35fr 1.2fr 0.65fr 0.65fr;
  }

  .head-row.staff,
  .data-row.staff {
    grid-template-columns: 0.9fr 0.55fr 0.9fr 0.5fr 0.5fr 0.5fr 0.7fr;
  }

  .rows {
    min-height: 0;
    overflow: hidden;
    display: grid;
    align-content: start;
    gap: 4px;
  }

  .data-row {
    border: 1px solid #284269;
    background: #162a4a;
    border-radius: 8px;
    padding: 6px;
    color: #e4edff;
    text-align: left;
    cursor: pointer;
  }

  .data-row.all {
    cursor: default;
  }

  .data-row.selected {
    border-color: #79abf6;
    background: #1d3760;
  }

  .data-row strong {
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-row span {
    color: #d2dff7;
    white-space: nowrap;
  }

  .cond.good {
    color: #75e4a4;
  }

  .cond.normal {
    color: #d4e4ff;
  }

  .cond.alert {
    color: #ffb68a;
  }

  .step-tag {
    color: #c6dcff;
    border: 1px solid #537cb6;
    border-radius: 999px;
    padding: 1px 7px;
    width: fit-content;
    font-size: 11px;
  }

  .detail-card {
    border: 1px solid #2f486f;
    border-radius: 10px;
    background: #13223d;
    padding: 10px;
    display: grid;
    align-content: start;
    gap: 8px;
    min-height: 0;
    overflow: hidden;
  }

  .detail-card > p {
    color: #b4c8ea;
    font-size: 13px;
  }

  .detail-section {
    display: grid;
    gap: 6px;
  }

  .detail-section h4 {
    color: #dbe8ff;
    font-size: 13px;
  }

  .ability-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
  }

  .ability-grid div {
    border: 1px solid #2e486f;
    border-radius: 8px;
    background: #152b4f;
    padding: 6px;
    display: grid;
    gap: 2px;
  }

  .ability-grid span {
    color: #9eb6de;
    font-size: 11px;
  }

  .ability-grid strong {
    color: #eff5ff;
    font-size: 14px;
  }

  .recent-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .recent-list li {
    border: 1px solid #29456f;
    border-radius: 8px;
    background: #162b4d;
    padding: 5px 6px;
    display: grid;
    grid-template-columns: 42px 1fr 1.4fr 26px;
    gap: 6px;
    align-items: center;
    font-size: 11px;
    color: #d6e3fb;
  }

  .recent-list li strong {
    color: #f0f6ff;
    text-align: right;
  }

  .trend {
    color: #cdddf8;
    font-size: 12px;
    line-height: 1.35;
  }

  .empty {
    color: #9db2d8;
    font-size: 12px;
    padding: 8px;
  }

  @media (max-width: 1180px) {
    .content-grid {
      grid-template-columns: 1fr;
    }

    .detail-card {
      display: none;
    }
  }
</style>
