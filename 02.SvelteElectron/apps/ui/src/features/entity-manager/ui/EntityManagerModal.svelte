<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";

  type EntityTab = "player" | "coach" | "manager" | "owner";
  type RosterTier = "1군" | "2군" | "육성" | "AAA" | "AA" | "A";

  interface LeagueRef {
    id: string;
    name: string;
    nameEn?: string;
  }

  interface SchoolRef {
    id: string;
    name: string;
    nameEn?: string;
  }

  interface ClubRef {
    id: string;
    name: string;
    nameEn?: string;
    leagueId: string;
  }

  interface TeamRef {
    id: string;
    name: string;
    nameEn?: string;
    leagueId: string;
    clubId?: string;
    schoolId?: string;
    tier?: RosterTier;
  }

  interface PitchingStats {
    ovr: number;
    stamina: number;
    velocity: number;
    command: number;
    control: number;
    movement: number;
    mentality: number;
    recovery: number;
  }

  interface BattingStats {
    ovr: number;
    contact: number;
    power: number;
    eye: number;
    discipline: number;
    speed: number;
    fielding: number;
    arm: number;
    battingClutch: number;
  }

  interface PlayerDetails {
    playerType: "pitcher" | "batter" | "twoWay";
    handedness: "L" | "R" | "S";
    position: string;
    jerseyNumber: number;
    pitching: PitchingStats;
    batting: BattingStats;
    developmentRate: number;
    potentialHidden: number;
  }

  interface CoachDetails {
    specialty: string;
    experienceYears: number;
    stats: {
      teaching: number;
      analysis: number;
      communication: number;
      discipline: number;
      leadership: number;
    };
    trainingBuffs: string;
  }

  interface ManagerDetails {
    style: string;
    experienceYears: number;
    stats: {
      tactics: number;
      decision: number;
      rotationMgmt: number;
      bullpenMgmt: number;
      moraleMgmt: number;
    };
    gamePlanBias: string;
    riskTolerance: number;
  }

  interface OwnerDetails {
    ownershipStyle: string;
    tenureYears: number;
    stats: {
      budgetSupport: number;
      patience: number;
      prInfluence: number;
      facilityInvestment: number;
      staffTrust: number;
    };
    budgetPolicy: string;
    hiringPolicy: string;
  }

  interface EntityDetails {
    player: PlayerDetails;
    coach: CoachDetails;
    manager: ManagerDetails;
    owner: OwnerDetails;
  }

  interface EntityRow {
    id: string;
    name: string;
    nameEn?: string;
    role: EntityTab;
    age: number;
    status: "active" | "inactive" | "retired" | "injured";
    originLeagueId: string;   // 최초 등록 리그 (파일 분류 기준 — 이동 시 변경 안 함)
    leagueId: string;         // 현재 소속 리그 (이동 시 변경)
    clubId: string;           // 구단 ID (고교·대학은 teamId와 동일)
    teamId: string;           // 팀/엔트리 ID
    tier?: RosterTier;        // KBO·MLB 전용 (1군/2군/육성/AAA 등)
    schoolId: string;
    grade?: 1 | 2 | 3;       // 고교 전용 학년
    notes: string;
    details: EntityDetails;
  }

  export let open = false;
  const dispatch = createEventDispatcher<{ close: void }>();
  const ENTITY_REFS_PATH = "entities/refs.json";

  // 리그별 파일 맵 — 향후 KBO·MLB 추가 시 여기에 추가
  const ENTITY_FILE_MAP: Record<string, { rel: string; local: string }> = {
    LEAGUE_HIGHSCHOOL:  { rel: "entities/people_hs.json",   local: "dev_entities_people_hs" },
    LEAGUE_UNIVERSITY:  { rel: "entities/people_univ.json",  local: "dev_entities_people_univ" },
    LEAGUE_INDEPENDENT: { rel: "entities/people_ind.json",   local: "dev_entities_people_ind" },
    LEAGUE_KBL:         { rel: "entities/people_kbl.json",   local: "dev_entities_people_kbl" },
    LEAGUE_ABL:         { rel: "entities/people_abl.json",   local: "dev_entities_people_abl" }
  };

  let activeLeagueFile = "LEAGUE_HIGHSCHOOL";

  const FALLBACK_LEAGUES: LeagueRef[] = [
    { id: "LEAGUE_HIGHSCHOOL",  name: "고교 리그",  nameEn: "High School League" },
    { id: "LEAGUE_UNIVERSITY",  name: "대학 리그",  nameEn: "University League" },
    { id: "LEAGUE_INDEPENDENT", name: "독립 리그",  nameEn: "Independent League" },
    { id: "LEAGUE_KBL",         name: "KBL 리그",   nameEn: "KBL League" },
    { id: "LEAGUE_ABL",         name: "ABL",        nameEn: "ABL" }
  ];

  const FALLBACK_SCHOOLS: SchoolRef[] = [
    { id: "SCHOOL_NONE",                    name: "해당 없음",       nameEn: "N/A" },
    { id: "SCHOOL_HS_SEOUL_INNOVATION",     name: "서울혁신고등학교", nameEn: "Seoul Hyeoksin High School" },
    { id: "SCHOOL_HS_BUSAN_WAVE",           name: "부산해운고등학교", nameEn: "Busan Haeun High School" },
    { id: "SCHOOL_HS_DAEGU_HEAT",           name: "대구열풍고등학교", nameEn: "Daegu Yeolpung High School" },
    { id: "SCHOOL_HS_GWANGJU_VISION",       name: "광주미래고등학교", nameEn: "Gwangju Mirae High School" },
    { id: "SCHOOL_HS_DAEJEON_RISE",         name: "대전도약고등학교", nameEn: "Daejeon Doyak High School" },
    { id: "SCHOOL_HS_INCHEON_HARBOR",       name: "인천항만고등학교", nameEn: "Incheon Hangman High School" },
    { id: "SCHOOL_HS_ULSAN_CHARGE",         name: "울산강진고등학교", nameEn: "Ulsan Gangjin High School" },
    { id: "SCHOOL_HS_SUWON_EDGE",           name: "수원예봉고등학교", nameEn: "Suwon Yebong High School" }
  ];

  const FALLBACK_TEAMS: TeamRef[] = [
    { id: "TEAM_HS_SEOUL_INNOVATION", name: "서울 이노베이션", nameEn: "Seoul Innovation", leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_SEOUL_INNOVATION", schoolId: "SCHOOL_HS_SEOUL_INNOVATION" },
    { id: "TEAM_HS_BUSAN_WAVE",       name: "부산 웨이브",     nameEn: "Busan Wave",       leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_BUSAN_WAVE",       schoolId: "SCHOOL_HS_BUSAN_WAVE" },
    { id: "TEAM_HS_DAEGU_HEAT",       name: "대구 히트",       nameEn: "Daegu Heat",       leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_DAEGU_HEAT",       schoolId: "SCHOOL_HS_DAEGU_HEAT" },
    { id: "TEAM_HS_GWANGJU_VISION",   name: "광주 비전",       nameEn: "Gwangju Vision",   leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_GWANGJU_VISION",   schoolId: "SCHOOL_HS_GWANGJU_VISION" },
    { id: "TEAM_HS_DAEJEON_RISE",     name: "대전 라이즈",     nameEn: "Daejeon Rise",     leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_DAEJEON_RISE",     schoolId: "SCHOOL_HS_DAEJEON_RISE" },
    { id: "TEAM_HS_INCHEON_HARBOR",   name: "인천 하버",       nameEn: "Incheon Harbor",   leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_INCHEON_HARBOR",   schoolId: "SCHOOL_HS_INCHEON_HARBOR" },
    { id: "TEAM_HS_ULSAN_CHARGE",     name: "울산 차지",       nameEn: "Ulsan Charge",     leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_ULSAN_CHARGE",     schoolId: "SCHOOL_HS_ULSAN_CHARGE" },
    { id: "TEAM_HS_SUWON_EDGE",       name: "수원 엣지",       nameEn: "Suwon Edge",       leagueId: "LEAGUE_HIGHSCHOOL", clubId: "TEAM_HS_SUWON_EDGE",       schoolId: "SCHOOL_HS_SUWON_EDGE" }
  ];

  let leagues: LeagueRef[] = FALLBACK_LEAGUES;
  let schools: SchoolRef[] = FALLBACK_SCHOOLS;
  let clubs: ClubRef[] = [];
  let teams: TeamRef[] = FALLBACK_TEAMS;

  let activeTab: EntityTab = "player";
  let rows: EntityRow[] = [];

  let selectedId = "";
  let editDraft: EntityRow | null = null;
  let addPopupOpen = false;
  let addDraft: EntityRow = createAddDraft("player");
  let addPopupError = "";
  let persistMessage = "";
  let persistError = "";

  $: filteredRows = rows.filter((row) => row.role === activeTab);
  $: selectedRow = rows.find((row) => row.id === selectedId) ?? null;
  $: editIssues = editDraft ? validateEntity(editDraft) : [];
  $: addIssues = addDraft ? validateEntity(addDraft) : [];

  $: if (filteredRows.length > 0 && !filteredRows.some((row) => row.id === selectedId)) {
    selectEntity(filteredRows[0].id);
  }
  $: if (filteredRows.length === 0) {
    selectedId = "";
    editDraft = null;
  }

  onMount(async () => {
    await Promise.all([loadEntities(), loadRefs()]);
  });

  async function loadRefs() {
    try {
      const remote = await window.projectB?.masterFetch?.(ENTITY_REFS_PATH);
      const data = remote as { leagues?: LeagueRef[]; schools?: SchoolRef[]; clubs?: ClubRef[]; teams?: TeamRef[] } | null | undefined;
      if (data?.leagues?.length) leagues = data.leagues;
      if (data?.schools?.length) schools = data.schools;
      if (data?.clubs?.length) clubs = data.clubs;
      if (data?.teams?.length) teams = data.teams;
    } catch {
      // fallback already set
    }
  }

  function close() {
    dispatch("close");
  }

  function roleLabel(role: EntityTab): string {
    if (role === "player") return "선수";
    if (role === "coach") return "코치";
    if (role === "manager") return "감독";
    return "구단주";
  }

  function playerTypeLabel(type: PlayerDetails["playerType"]): string {
    if (type === "pitcher") return "투수";
    if (type === "batter") return "타자";
    return "투타겸업";
  }

  function playerPositionOptions(type: PlayerDetails["playerType"]): string[] {
    if (type === "pitcher") return ["SP", "RP", "CP"];
    if (type === "batter") return ["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
    return ["SP", "RP", "CP", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"];
  }

  function createDefaultDetails(seed?: Partial<EntityDetails>): EntityDetails {
    const base: EntityDetails = {
      player: {
        playerType: "pitcher",
        handedness: "R",
        position: "SP",
        jerseyNumber: 1,
        pitching: {
          ovr: 60,
          stamina: 60,
          velocity: 60,
          command: 60,
          control: 60,
          movement: 60,
          mentality: 60,
          recovery: 60
        },
        batting: {
          ovr: 60,
          contact: 60,
          power: 60,
          eye: 60,
          discipline: 60,
          speed: 60,
          fielding: 60,
          arm: 60,
          battingClutch: 60
        },
        developmentRate: 50,
        potentialHidden: 75
      },
      coach: {
        specialty: "투구",
        experienceYears: 5,
        stats: {
          teaching: 60,
          analysis: 60,
          communication: 60,
          discipline: 60,
          leadership: 60
        },
        trainingBuffs: ""
      },
      manager: {
        style: "균형",
        experienceYears: 5,
        stats: {
          tactics: 60,
          decision: 60,
          rotationMgmt: 60,
          bullpenMgmt: 60,
          moraleMgmt: 60
        },
        gamePlanBias: "",
        riskTolerance: 50
      },
      owner: {
        ownershipStyle: "안정 운영",
        tenureYears: 5,
        stats: {
          budgetSupport: 60,
          patience: 60,
          prInfluence: 60,
          facilityInvestment: 60,
          staffTrust: 60
        },
        budgetPolicy: "",
        hiringPolicy: ""
      }
    };

    if (!seed) return base;
    return {
      player: {
        ...base.player,
        ...(seed.player ?? {}),
        pitching: { ...base.player.pitching, ...(seed.player?.pitching ?? {}) },
        batting: { ...base.player.batting, ...(seed.player?.batting ?? {}) }
      },
      coach: { ...base.coach, ...(seed.coach ?? {}) },
      manager: { ...base.manager, ...(seed.manager ?? {}) },
      owner: { ...base.owner, ...(seed.owner ?? {}) }
    };
  }

  function nextId(role: EntityTab): string {
    const prefix = role === "player" ? "PLY" : role === "coach" ? "COA" : role === "manager" ? "MNG" : "OWN";
    const existingNums = rows
      .filter((row) => row.role === role)
      .map((row) => parseInt(row.id.replace(`${prefix}_`, ""), 10))
      .filter((n) => !isNaN(n));
    let n = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
    while (rows.some((row) => row.id === `${prefix}_${String(n).padStart(3, "0")}`)) n += 1;
    return `${prefix}_${String(n).padStart(3, "0")}`;
  }

  function defaultTeamId(leagueId: string): string {
    const team = teams.find((item) => item.leagueId === leagueId);
    return team?.id ?? teams[0]?.id ?? "";
  }

  function createAddDraft(role: EntityTab): EntityRow {
    const leagueId = leagues[0]?.id ?? "";
    const teamId = defaultTeamId(leagueId);
    return {
      id: nextId(role),
      name: `신규 ${roleLabel(role)}`,
      nameEn: "",
      role,
      age: role === "player" ? 18 : 40,
      status: "active",
      originLeagueId: leagueId,
      leagueId,
      clubId: teamId,
      teamId,
      tier: undefined,
      schoolId: "SCHOOL_NONE",
      grade: leagueId === "LEAGUE_HIGHSCHOOL" ? 1 : undefined,
      notes: "",
      details: createDefaultDetails()
    };
  }

  function selectTab(tab: EntityTab) {
    activeTab = tab;
    const first = rows.find((row) => row.role === tab);
    if (first) selectEntity(first.id);
  }

  // 편집은 draft에서 수행하고 저장 시에만 원본 rows에 반영
  function selectEntity(id: string) {
    selectedId = id;
    const found = rows.find((row) => row.id === id);
    editDraft = found ? structuredClone(found) : null;
  }

  function onTeamChanged(target: EntityRow) {
    const ref = teams.find((t) => t.id === target.teamId);
    if (!ref) return;
    target.clubId = ref.clubId ?? ref.id;
    if (ref.schoolId) target.schoolId = ref.schoolId;
  }

  function onLeagueChanged(target: EntityRow) {
    const teamId = defaultTeamId(target.leagueId);
    target.teamId = teamId;
    target.clubId = teamId;
    target.grade = target.leagueId === "LEAGUE_HIGHSCHOOL" ? (target.grade ?? 1) : undefined;
    onTeamChanged(target);
  }

  function onPlayerTypeChanged(target: EntityRow) {
    const options = playerPositionOptions(target.details.player.playerType);
    if (!options.includes(target.details.player.position)) {
      target.details.player.position = options[0] ?? "SP";
    }
  }

  function onAddRoleChanged() {
    const recreated = createAddDraft(addDraft.role);
    addDraft = {
      ...recreated,
      name: addDraft.name.trim() ? addDraft.name : recreated.name
    };
  }

  function onAddPlayerTypeChanged() {
    onPlayerTypeChanged(addDraft);
  }

  function saveEdit() {
    if (!editDraft || !selectedRow) return;
    const issues = validateEntity(editDraft);
    if (issues.length > 0) return;
    const draft = editDraft;
    rows = rows.map((row) => (row.id === selectedRow.id ? structuredClone(draft) : row));
    selectedId = editDraft.id;
    selectEntity(editDraft.id);
  }

  function cancelEdit() {
    if (!selectedRow) {
      editDraft = null;
      return;
    }
    editDraft = structuredClone(selectedRow);
  }

  function openAddPopup() {
    addPopupError = "";
    addDraft = createAddDraft(activeTab);
    addPopupOpen = true;
  }

  function cancelAddPopup() {
    addPopupError = "";
    addDraft = createAddDraft(activeTab);
    addPopupOpen = false;
  }

  function saveAddPopup() {
    const issues = validateEntity(addDraft, true);
    if (issues.length > 0) {
      addPopupError = issues[0];
      return;
    }

    rows = [structuredClone(addDraft), ...rows];
    addPopupOpen = false;
    activeTab = addDraft.role;
    selectEntity(addDraft.id);
  }

  function removeEntity() {
    if (!selectedRow) return;
    rows = rows.filter((row) => row.id !== selectedRow.id);
    const first = rows.find((row) => row.role === activeTab);
    if (first) {
      selectEntity(first.id);
      return;
    }
    selectedId = "";
    editDraft = null;
  }

  function teamName(teamId: string): string {
    return teams.find((item) => item.id === teamId)?.name ?? "미지정";
  }

  function normalizeRole(value: unknown): EntityTab {
    if (value === "player" || value === "coach" || value === "manager" || value === "owner") return value;
    return "player";
  }

  function normalizeTier(value: unknown): RosterTier | undefined {
    const valid: RosterTier[] = ["1군", "2군", "육성", "AAA", "AA", "A"];
    return valid.includes(value as RosterTier) ? (value as RosterTier) : undefined;
  }

  function normalizeGrade(value: unknown): 1 | 2 | 3 | undefined {
    if (value === 1 || value === 2 || value === 3) return value;
    return undefined;
  }

  function normalizeEntity(raw: unknown): EntityRow {
    const obj = (raw ?? {}) as Partial<EntityRow>;
    const role = normalizeRole(obj.role);
    const base = createAddDraft(role);
    const legacyStats = (obj as { details?: { player?: { stats?: Partial<PitchingStats> } } }).details?.player?.stats;
    const normalizedDetails = createDefaultDetails((obj.details as Partial<EntityDetails>) ?? {});
    if (legacyStats) {
      normalizedDetails.player.pitching = {
        ...normalizedDetails.player.pitching,
        ...legacyStats
      };
    }
    const leagueId = (typeof obj.leagueId === "string" && obj.leagueId) ? obj.leagueId : base.leagueId;
    const teamId = (typeof obj.teamId === "string" && obj.teamId) ? obj.teamId : base.teamId;
    return {
      ...base,
      ...obj,
      role,
      leagueId,
      teamId,
      originLeagueId: (typeof obj.originLeagueId === "string" && obj.originLeagueId) ? obj.originLeagueId : leagueId,
      clubId: (typeof obj.clubId === "string" && obj.clubId) ? obj.clubId : teamId,
      nameEn: typeof obj.nameEn === "string" ? obj.nameEn : "",
      tier: normalizeTier(obj.tier),
      grade: normalizeGrade(obj.grade),
      details: normalizedDetails
    };
  }

  function currentFile() {
    return ENTITY_FILE_MAP[activeLeagueFile] ?? ENTITY_FILE_MAP["LEAGUE_HIGHSCHOOL"];
  }

  async function loadEntities() {
    persistMessage = "";
    persistError = "";
    const { rel, local } = currentFile();
    try {
      const remote = await window.projectB?.masterFetch?.(rel);
      const maybe = remote as { entities?: unknown[] } | null | undefined;
      if (maybe?.entities && Array.isArray(maybe.entities)) {
        rows = maybe.entities.map((item) => normalizeEntity(item));
        persistMessage = `[${rel}] 파일에서 ${rows.length}건을 불러왔습니다.`;
        return;
      }

      const localRaw = window.localStorage.getItem(local);
      if (localRaw) {
        const parsed = JSON.parse(localRaw) as { entities?: unknown[] };
        if (Array.isArray(parsed.entities)) {
          rows = parsed.entities.map((item) => normalizeEntity(item));
          persistMessage = `[로컬] ${rows.length}건을 불러왔습니다.`;
          return;
        }
      }

      rows = [];
      persistMessage = `[${rel}] 등록된 데이터가 없습니다. 추가 버튼으로 새 인물을 등록하세요.`;
    } catch (error) {
      persistError = `불러오기 실패: ${String((error as Error)?.message ?? error)}`;
    }
  }

  async function saveEntities() {
    persistMessage = "";
    persistError = "";
    const { rel, local } = currentFile();
    try {
      const payload = { version: 1, sourceLeague: activeLeagueFile, entities: rows };

      if (window.projectB?.masterSave) {
        const result = await window.projectB.masterSave({ relPath: rel, data: payload, backup: true });
        if (!result?.ok) {
          persistError = `파일 저장 실패: ${result?.error ?? "알 수 없는 오류"}`;
          return;
        }
        persistMessage = `[${rel}] 저장 완료 (${rows.length}건, 백업 생성)`;
      } else {
        window.localStorage.setItem(local, JSON.stringify(payload));
        persistMessage = `[로컬] 임시 저장 완료 (${rows.length}건)`;
      }
    } catch (error) {
      persistError = `저장 실패: ${String((error as Error)?.message ?? error)}`;
    }
  }

  function validateRange(value: number, min = 0, max = 100): boolean {
    return Number.isFinite(value) && value >= min && value <= max;
  }

  function validateEntity(entity: EntityRow, isCreate = false): string[] {
    const issues: string[] = [];

    if (!entity.id.trim()) issues.push("ID를 입력하세요.");
    if (!entity.name.trim()) issues.push("이름을 입력하세요.");
    if (!validateRange(entity.age, 10, 90)) issues.push("나이는 10~90 범위여야 합니다.");
    if (!leagues.some((league) => league.id === entity.leagueId)) issues.push("리그 선택이 올바르지 않습니다.");
    const isHsOrUniv = entity.leagueId === "LEAGUE_HIGHSCHOOL" || entity.leagueId === "LEAGUE_UNIVERSITY";
    if (isHsOrUniv && !schools.some((school) => school.id === entity.schoolId)) {
      issues.push("학교 선택이 올바르지 않습니다.");
    }
    const teamKnown = teams.some((team) => team.id === entity.teamId);
    if (!teamKnown && !entity.teamId.startsWith("TBD_")) issues.push("팀 선택이 올바르지 않습니다.");
    const team = teams.find((item) => item.id === entity.teamId);
    if (team && team.leagueId !== entity.leagueId) issues.push("선택한 팀이 현재 리그와 일치하지 않습니다.");

    if (isCreate && rows.some((row) => row.id === entity.id)) issues.push("이미 존재하는 ID입니다.");
    if (!isCreate && rows.some((row) => row.id === entity.id && row.id !== selectedRow?.id)) {
      issues.push("이미 존재하는 ID입니다.");
    }

    if (entity.role === "player") {
      const d = entity.details.player;
      if (entity.leagueId === "LEAGUE_HIGHSCHOOL" && ![1, 2, 3].includes(entity.grade as number)) {
        issues.push("고교 선수는 학년(1~3)을 선택하세요.");
      }
      if (!d.position.trim()) issues.push("선수 포지션을 입력하세요.");
      if (!validateRange(d.jerseyNumber, 0, 999)) issues.push("등번호는 0~999 범위여야 합니다.");
      if (!validateRange(d.developmentRate)) issues.push("성장률은 0~100 범위여야 합니다.");
      if (!validateRange(d.potentialHidden)) issues.push("잠재력(비공개)은 0~100 범위여야 합니다.");
      const pitchingStats = Object.values(d.pitching);
      const battingStats = Object.values(d.batting);
      if (!pitchingStats.every((value) => validateRange(value))) issues.push("투수 능력치는 0~100 범위여야 합니다.");
      if (!battingStats.every((value) => validateRange(value))) issues.push("타자 능력치는 0~100 범위여야 합니다.");
      if (!["pitcher", "batter", "twoWay"].includes(d.playerType)) {
        issues.push("선수 타입(playerType)이 올바르지 않습니다.");
      }
      if (d.playerType === "pitcher" && !["SP", "RP", "CP"].includes(d.position)) {
        issues.push("투수 타입은 투수 포지션(SP/RP/CP)만 선택 가능합니다.");
      }
      if (
        d.playerType === "batter" &&
        !["C", "1B", "2B", "3B", "SS", "LF", "CF", "RF", "DH"].includes(d.position)
      ) {
        issues.push("타자 타입은 야수 포지션(C~DH)만 선택 가능합니다.");
      }
    }

    if (entity.role === "coach") {
      const d = entity.details.coach;
      if (!d.specialty.trim()) issues.push("코치 전문분야를 입력하세요.");
      if (!validateRange(d.experienceYears, 0, 60)) issues.push("코치 경력은 0~60 범위여야 합니다.");
      const coachStats = Object.values(d.stats);
      if (!coachStats.every((value) => validateRange(value))) issues.push("코치 능력치는 0~100 범위여야 합니다.");
    }

    if (entity.role === "manager") {
      const d = entity.details.manager;
      if (!d.style.trim()) issues.push("감독 스타일을 입력하세요.");
      if (!validateRange(d.experienceYears, 0, 60)) issues.push("감독 경력은 0~60 범위여야 합니다.");
      if (!validateRange(d.riskTolerance)) issues.push("감독 리스크 성향은 0~100 범위여야 합니다.");
      const managerStats = Object.values(d.stats);
      if (!managerStats.every((value) => validateRange(value))) issues.push("감독 능력치는 0~100 범위여야 합니다.");
    }

    if (entity.role === "owner") {
      const d = entity.details.owner;
      if (!d.ownershipStyle.trim()) issues.push("구단주 운영 성향을 입력하세요.");
      if (!validateRange(d.tenureYears, 0, 80)) issues.push("구단주 재임 기간은 0~80 범위여야 합니다.");
      const ownerStats = Object.values(d.stats);
      if (!ownerStats.every((value) => validateRange(value))) issues.push("구단주 능력치는 0~100 범위여야 합니다.");
    }

    return issues;
  }
</script>

{#if open}
  <div class="entity-backdrop" role="presentation" on:click={close}>
    <section class="entity-modal" role="dialog" aria-label="선수/스태프/구단주 에디터" on:click|stopPropagation>
      <header>
        <div class="head-left">
          <h2>선수/스태프/구단주 에디터</h2>
          <select
            class="league-file-select"
            bind:value={activeLeagueFile}
            on:change={loadEntities}
          >
            {#each Object.keys(ENTITY_FILE_MAP) as leagueId}
              <option value={leagueId}>{leagues.find((l) => l.id === leagueId)?.name ?? leagueId}</option>
            {/each}
          </select>
        </div>
        <div class="head-actions">
          <button type="button" class="ghost" on:click={loadEntities}>새로고침</button>
          <button type="button" on:click={saveEntities}>파일 저장</button>
          <button type="button" class="ghost" on:click={close}>닫기</button>
        </div>
      </header>

      {#if persistMessage}
        <p class="persist-ok">{persistMessage}</p>
      {/if}
      {#if persistError}
        <p class="persist-error">{persistError}</p>
      {/if}

      <div class="tabs">
        <button type="button" class:active={activeTab === "player"} on:click={() => selectTab("player")}>선수</button>
        <button type="button" class:active={activeTab === "coach"} on:click={() => selectTab("coach")}>코치</button>
        <button type="button" class:active={activeTab === "manager"} on:click={() => selectTab("manager")}>감독</button>
        <button type="button" class:active={activeTab === "owner"} on:click={() => selectTab("owner")}>구단주</button>
      </div>

      <div class="body">
        <aside class="list">
          <div class="actions">
            <button type="button" on:click={openAddPopup}>추가</button>
            <button type="button" class="danger" on:click={removeEntity} disabled={!selectedRow}>제거</button>
          </div>
          <ul>
            {#each filteredRows as row}
              <li>
                <button type="button" class:selected={row.id === selectedId} on:click={() => selectEntity(row.id)}>
                  <strong>{row.name}</strong>
                  <span>{row.id} · {teamName(row.teamId)}</span>
                </button>
              </li>
            {/each}
          </ul>
        </aside>

        <section class="editor">
          {#if editDraft}
            <h3>공통 정보</h3>
            <div class="grid three">
              <label><span>ID</span><input type="text" bind:value={editDraft.id} /></label>
              <label><span>이름 (한국어)</span><input type="text" bind:value={editDraft.name} /></label>
              <label><span>이름 (English)</span><input type="text" bind:value={editDraft.nameEn} placeholder="Hong Gil-dong" /></label>
              <label><span>역할</span>
                <select bind:value={editDraft.role}>
                  <option value="player">선수</option>
                  <option value="coach">코치</option>
                  <option value="manager">감독</option>
                  <option value="owner">구단주</option>
                </select>
              </label>
              <label><span>나이</span><input type="number" bind:value={editDraft.age} /></label>
              <label><span>상태</span>
                <select bind:value={editDraft.status}>
                  <option value="active">활성</option>
                  <option value="inactive">비활성</option>
                  <option value="injured">부상</option>
                  <option value="retired">은퇴</option>
                </select>
              </label>
              <label><span>리그 (현재)</span>
                <select bind:value={editDraft.leagueId} on:change={() => editDraft && onLeagueChanged(editDraft)}>
                  {#each leagues as league}
                    <option value={league.id}>{league.name}</option>
                  {/each}
                </select>
              </label>
              <label><span>팀</span>
                <select bind:value={editDraft.teamId} on:change={() => editDraft && onTeamChanged(editDraft)}>
                  {#each teams.filter((team) => team.leagueId === editDraft?.leagueId) as team}
                    <option value={team.id}>{team.name}</option>
                  {/each}
                </select>
              </label>
              {#if editDraft.leagueId === "LEAGUE_HIGHSCHOOL" || editDraft.leagueId === "LEAGUE_UNIVERSITY"}
                <label><span>학교</span>
                  <select bind:value={editDraft.schoolId}>
                    {#each schools as school}
                      <option value={school.id}>{school.name}</option>
                    {/each}
                  </select>
                </label>
              {/if}
              {#if editDraft.role === "player" && editDraft.leagueId === "LEAGUE_HIGHSCHOOL"}
                <label><span>학년</span>
                  <select bind:value={editDraft.grade}>
                    <option value={1}>1학년</option>
                    <option value={2}>2학년</option>
                    <option value={3}>3학년</option>
                  </select>
                </label>
              {/if}
              {#if editDraft.leagueId === "LEAGUE_KBL" || editDraft.leagueId === "LEAGUE_ABL"}
                <label><span>엔트리 (tier)</span>
                  <select bind:value={editDraft.tier}>
                    <option value={undefined}>-</option>
                    <option value="1군">1군</option>
                    <option value="2군">2군</option>
                    <option value="육성">육성</option>
                    <option value="AAA">AAA</option>
                    <option value="AA">AA</option>
                    <option value="A">A</option>
                  </select>
                </label>
              {/if}
              <label><span>등록 원리그</span>
                <input type="text" value={editDraft.originLeagueId} disabled title="최초 등록 리그 — 변경 불가" />
              </label>
              <label class="full"><span>메모</span><textarea rows="2" bind:value={editDraft.notes}></textarea></label>
            </div>

            {#if editDraft.role === "player"}
              <h3>선수 상세</h3>
              <div class="grid three">
                <label><span>선수 타입</span>
                  <select bind:value={editDraft.details.player.playerType} on:change={() => editDraft && onPlayerTypeChanged(editDraft)}>
                    <option value="pitcher">투수</option>
                    <option value="batter">타자</option>
                    <option value="twoWay">투타겸업</option>
                  </select>
                </label>
                <label><span>투타</span>
                  <select bind:value={editDraft.details.player.handedness}>
                    <option value="R">우투</option>
                    <option value="L">좌투</option>
                    <option value="S">양손</option>
                  </select>
                </label>
                <label><span>포지션</span>
                  <select bind:value={editDraft.details.player.position}>
                    {#each playerPositionOptions(editDraft.details.player.playerType) as position}
                      <option value={position}>{position}</option>
                    {/each}
                  </select>
                </label>
                <label><span>등번호</span><input type="number" bind:value={editDraft.details.player.jerseyNumber} /></label>
                <label><span>성장률</span><input type="number" bind:value={editDraft.details.player.developmentRate} /></label>
                <label><span>잠재력(비공개)</span><input type="number" bind:value={editDraft.details.player.potentialHidden} /></label>
              </div>

              {#if editDraft.details.player.playerType !== "batter"}
                <h3>투수 능력치 ({playerTypeLabel(editDraft.details.player.playerType)})</h3>
                <div class="grid three">
                  <label><span>OVR</span><input type="number" bind:value={editDraft.details.player.pitching.ovr} /></label>
                  <label><span>체력</span><input type="number" bind:value={editDraft.details.player.pitching.stamina} /></label>
                  <label><span>구속</span><input type="number" bind:value={editDraft.details.player.pitching.velocity} /></label>
                  <label><span>커맨드</span><input type="number" bind:value={editDraft.details.player.pitching.command} /></label>
                  <label><span>제구</span><input type="number" bind:value={editDraft.details.player.pitching.control} /></label>
                  <label><span>구위</span><input type="number" bind:value={editDraft.details.player.pitching.movement} /></label>
                  <label><span>멘탈</span><input type="number" bind:value={editDraft.details.player.pitching.mentality} /></label>
                  <label><span>회복력</span><input type="number" bind:value={editDraft.details.player.pitching.recovery} /></label>
                </div>
              {/if}

              {#if editDraft.details.player.playerType !== "pitcher"}
                <h3>타자 능력치 ({playerTypeLabel(editDraft.details.player.playerType)})</h3>
                <div class="grid three">
                  <label><span>OVR</span><input type="number" bind:value={editDraft.details.player.batting.ovr} /></label>
                  <label><span>컨택</span><input type="number" bind:value={editDraft.details.player.batting.contact} /></label>
                  <label><span>파워</span><input type="number" bind:value={editDraft.details.player.batting.power} /></label>
                  <label><span>선구안</span><input type="number" bind:value={editDraft.details.player.batting.eye} /></label>
                  <label><span>참을성</span><input type="number" bind:value={editDraft.details.player.batting.discipline} /></label>
                  <label><span>주루</span><input type="number" bind:value={editDraft.details.player.batting.speed} /></label>
                  <label><span>수비</span><input type="number" bind:value={editDraft.details.player.batting.fielding} /></label>
                  <label><span>송구</span><input type="number" bind:value={editDraft.details.player.batting.arm} /></label>
                  <label><span>클러치</span><input type="number" bind:value={editDraft.details.player.batting.battingClutch} /></label>
                </div>
              {/if}
            {/if}

            {#if editDraft.role === "coach"}
              <h3>코치 상세</h3>
              <div class="grid three">
                <label><span>전문분야</span><input type="text" bind:value={editDraft.details.coach.specialty} /></label>
                <label><span>경력(년)</span><input type="number" bind:value={editDraft.details.coach.experienceYears} /></label>
                <label><span>지도력</span><input type="number" bind:value={editDraft.details.coach.stats.teaching} /></label>
                <label><span>분석력</span><input type="number" bind:value={editDraft.details.coach.stats.analysis} /></label>
                <label><span>소통</span><input type="number" bind:value={editDraft.details.coach.stats.communication} /></label>
                <label><span>규율</span><input type="number" bind:value={editDraft.details.coach.stats.discipline} /></label>
                <label><span>리더십</span><input type="number" bind:value={editDraft.details.coach.stats.leadership} /></label>
                <label class="full"><span>훈련 버프</span><input type="text" bind:value={editDraft.details.coach.trainingBuffs} /></label>
              </div>
            {/if}

            {#if editDraft.role === "manager"}
              <h3>감독 상세</h3>
              <div class="grid three">
                <label><span>운영 스타일</span><input type="text" bind:value={editDraft.details.manager.style} /></label>
                <label><span>경력(년)</span><input type="number" bind:value={editDraft.details.manager.experienceYears} /></label>
                <label><span>전술</span><input type="number" bind:value={editDraft.details.manager.stats.tactics} /></label>
                <label><span>결단</span><input type="number" bind:value={editDraft.details.manager.stats.decision} /></label>
                <label><span>선발 운용</span><input type="number" bind:value={editDraft.details.manager.stats.rotationMgmt} /></label>
                <label><span>불펜 운용</span><input type="number" bind:value={editDraft.details.manager.stats.bullpenMgmt} /></label>
                <label><span>사기 관리</span><input type="number" bind:value={editDraft.details.manager.stats.moraleMgmt} /></label>
                <label><span>리스크 성향</span><input type="number" bind:value={editDraft.details.manager.riskTolerance} /></label>
                <label class="full"><span>게임플랜 편향</span><input type="text" bind:value={editDraft.details.manager.gamePlanBias} /></label>
              </div>
            {/if}

            {#if editDraft.role === "owner"}
              <h3>구단주 상세</h3>
              <div class="grid three">
                <label><span>운영 성향</span><input type="text" bind:value={editDraft.details.owner.ownershipStyle} /></label>
                <label><span>재임(년)</span><input type="number" bind:value={editDraft.details.owner.tenureYears} /></label>
                <label><span>예산 지원</span><input type="number" bind:value={editDraft.details.owner.stats.budgetSupport} /></label>
                <label><span>인내심</span><input type="number" bind:value={editDraft.details.owner.stats.patience} /></label>
                <label><span>PR 영향력</span><input type="number" bind:value={editDraft.details.owner.stats.prInfluence} /></label>
                <label><span>시설 투자</span><input type="number" bind:value={editDraft.details.owner.stats.facilityInvestment} /></label>
                <label><span>스태프 신뢰</span><input type="number" bind:value={editDraft.details.owner.stats.staffTrust} /></label>
                <label><span>예산 정책</span><input type="text" bind:value={editDraft.details.owner.budgetPolicy} /></label>
                <label><span>채용 정책</span><input type="text" bind:value={editDraft.details.owner.hiringPolicy} /></label>
              </div>
            {/if}

            {#if editIssues.length > 0}
              <div class="issues">
                <strong>검증 경고</strong>
                <ul>
                  {#each editIssues as issue}
                    <li>{issue}</li>
                  {/each}
                </ul>
              </div>
            {/if}

            <div class="editor-actions">
              <button type="button" class="ghost" on:click={cancelEdit}>취소</button>
              <button type="button" on:click={saveEdit}>저장</button>
            </div>
          {:else if filteredRows.length === 0}
            <div class="empty-guide">
              <p>이 리그에 등록된 {activeTab === "player" ? "선수" : activeTab === "coach" ? "코치" : activeTab === "manager" ? "감독" : "구단주"}가 없습니다.</p>
              <p class="hint">왼쪽 <strong>추가</strong> 버튼으로 새 인물을 등록하거나,<br/>Step 4 자동 생성 스크립트를 실행하세요.</p>
            </div>
          {:else}
            <p class="empty">목록에서 항목을 선택하세요.</p>
          {/if}
        </section>
      </div>
    </section>

    {#if addPopupOpen}
      <section class="add-popup" role="dialog" aria-label="인물 추가" on:click|stopPropagation>
        <header>
          <h3>{roleLabel(activeTab)} 추가</h3>
          <button type="button" class="ghost" on:click={cancelAddPopup}>닫기</button>
        </header>

        <div class="grid three">
          <label><span>ID</span><input type="text" bind:value={addDraft.id} /></label>
          <label><span>이름 (한국어)</span><input type="text" bind:value={addDraft.name} /></label>
          <label><span>이름 (English)</span><input type="text" bind:value={addDraft.nameEn} placeholder="Hong Gil-dong" /></label>
          <label><span>역할</span>
            <select bind:value={addDraft.role} on:change={onAddRoleChanged}>
              <option value="player">선수</option>
              <option value="coach">코치</option>
              <option value="manager">감독</option>
              <option value="owner">구단주</option>
            </select>
          </label>
          <label><span>나이</span><input type="number" bind:value={addDraft.age} /></label>
          <label><span>상태</span>
            <select bind:value={addDraft.status}>
              <option value="active">활성</option>
              <option value="inactive">비활성</option>
              <option value="injured">부상</option>
              <option value="retired">은퇴</option>
            </select>
          </label>
          <label><span>리그</span>
            <select bind:value={addDraft.leagueId} on:change={() => onLeagueChanged(addDraft)}>
              {#each leagues as league}
                <option value={league.id}>{league.name}</option>
              {/each}
            </select>
          </label>
          <label><span>팀</span>
            <select bind:value={addDraft.teamId} on:change={() => onTeamChanged(addDraft)}>
              {#each teams.filter((team) => team.leagueId === addDraft.leagueId) as team}
                <option value={team.id}>{team.name}</option>
              {/each}
            </select>
          </label>
          {#if addDraft.leagueId === "LEAGUE_HIGHSCHOOL" || addDraft.leagueId === "LEAGUE_UNIVERSITY"}
            <label><span>학교</span>
              <select bind:value={addDraft.schoolId}>
                {#each schools as school}
                  <option value={school.id}>{school.name}</option>
                {/each}
              </select>
            </label>
          {/if}
          {#if addDraft.role === "player" && addDraft.leagueId === "LEAGUE_HIGHSCHOOL"}
            <label><span>학년</span>
              <select bind:value={addDraft.grade}>
                <option value={1}>1학년</option>
                <option value={2}>2학년</option>
                <option value={3}>3학년</option>
              </select>
            </label>
          {/if}
          <label class="full"><span>메모</span><textarea rows="2" bind:value={addDraft.notes}></textarea></label>
        </div>

        {#if addDraft.role === "player"}
          <h3>선수 상세</h3>
          <div class="grid three">
            <label><span>선수 타입</span>
              <select bind:value={addDraft.details.player.playerType} on:change={onAddPlayerTypeChanged}>
                <option value="pitcher">투수</option>
                <option value="batter">타자</option>
                <option value="twoWay">투타겸업</option>
              </select>
            </label>
            <label><span>손잡이</span>
              <select bind:value={addDraft.details.player.handedness}>
                <option value="R">우투</option>
                <option value="L">좌투</option>
                <option value="S">양손</option>
              </select>
            </label>
            <label><span>포지션</span>
              <select bind:value={addDraft.details.player.position}>
                {#each playerPositionOptions(addDraft.details.player.playerType) as position}
                  <option value={position}>{position}</option>
                {/each}
              </select>
            </label>
            <label><span>등번호</span><input type="number" bind:value={addDraft.details.player.jerseyNumber} /></label>
            <label><span>성장률</span><input type="number" bind:value={addDraft.details.player.developmentRate} /></label>
            <label><span>잠재력(비공개)</span><input type="number" bind:value={addDraft.details.player.potentialHidden} /></label>
          </div>

          {#if addDraft.details.player.playerType !== "batter"}
            <h3>투수 능력치 ({playerTypeLabel(addDraft.details.player.playerType)})</h3>
            <div class="grid three">
              <label><span>OVR</span><input type="number" bind:value={addDraft.details.player.pitching.ovr} /></label>
              <label><span>체력</span><input type="number" bind:value={addDraft.details.player.pitching.stamina} /></label>
              <label><span>구속</span><input type="number" bind:value={addDraft.details.player.pitching.velocity} /></label>
              <label><span>커맨드</span><input type="number" bind:value={addDraft.details.player.pitching.command} /></label>
              <label><span>제구</span><input type="number" bind:value={addDraft.details.player.pitching.control} /></label>
              <label><span>구위</span><input type="number" bind:value={addDraft.details.player.pitching.movement} /></label>
              <label><span>멘탈</span><input type="number" bind:value={addDraft.details.player.pitching.mentality} /></label>
              <label><span>회복력</span><input type="number" bind:value={addDraft.details.player.pitching.recovery} /></label>
            </div>
          {/if}

          {#if addDraft.details.player.playerType !== "pitcher"}
            <h3>타자 능력치 ({playerTypeLabel(addDraft.details.player.playerType)})</h3>
            <div class="grid three">
              <label><span>OVR</span><input type="number" bind:value={addDraft.details.player.batting.ovr} /></label>
              <label><span>컨택</span><input type="number" bind:value={addDraft.details.player.batting.contact} /></label>
              <label><span>파워</span><input type="number" bind:value={addDraft.details.player.batting.power} /></label>
              <label><span>선구안</span><input type="number" bind:value={addDraft.details.player.batting.eye} /></label>
              <label><span>참을성</span><input type="number" bind:value={addDraft.details.player.batting.discipline} /></label>
              <label><span>주루</span><input type="number" bind:value={addDraft.details.player.batting.speed} /></label>
              <label><span>수비</span><input type="number" bind:value={addDraft.details.player.batting.fielding} /></label>
              <label><span>송구</span><input type="number" bind:value={addDraft.details.player.batting.arm} /></label>
              <label><span>클러치</span><input type="number" bind:value={addDraft.details.player.batting.battingClutch} /></label>
            </div>
          {/if}
        {/if}

        {#if addDraft.role === "coach"}
          <h3>코치 상세</h3>
          <div class="grid three">
            <label><span>전문분야</span><input type="text" bind:value={addDraft.details.coach.specialty} /></label>
            <label><span>경력(년)</span><input type="number" bind:value={addDraft.details.coach.experienceYears} /></label>
            <label><span>지도력</span><input type="number" bind:value={addDraft.details.coach.stats.teaching} /></label>
            <label><span>분석력</span><input type="number" bind:value={addDraft.details.coach.stats.analysis} /></label>
            <label><span>소통</span><input type="number" bind:value={addDraft.details.coach.stats.communication} /></label>
            <label><span>규율</span><input type="number" bind:value={addDraft.details.coach.stats.discipline} /></label>
            <label><span>리더십</span><input type="number" bind:value={addDraft.details.coach.stats.leadership} /></label>
            <label class="full"><span>훈련 버프</span><input type="text" bind:value={addDraft.details.coach.trainingBuffs} /></label>
          </div>
        {/if}

        {#if addDraft.role === "manager"}
          <h3>감독 상세</h3>
          <div class="grid three">
            <label><span>운영 스타일</span><input type="text" bind:value={addDraft.details.manager.style} /></label>
            <label><span>경력(년)</span><input type="number" bind:value={addDraft.details.manager.experienceYears} /></label>
            <label><span>전술</span><input type="number" bind:value={addDraft.details.manager.stats.tactics} /></label>
            <label><span>결단</span><input type="number" bind:value={addDraft.details.manager.stats.decision} /></label>
            <label><span>선발 운용</span><input type="number" bind:value={addDraft.details.manager.stats.rotationMgmt} /></label>
            <label><span>불펜 운용</span><input type="number" bind:value={addDraft.details.manager.stats.bullpenMgmt} /></label>
            <label><span>사기 관리</span><input type="number" bind:value={addDraft.details.manager.stats.moraleMgmt} /></label>
            <label><span>리스크 성향</span><input type="number" bind:value={addDraft.details.manager.riskTolerance} /></label>
            <label class="full"><span>게임플랜 편향</span><input type="text" bind:value={addDraft.details.manager.gamePlanBias} /></label>
          </div>
        {/if}

        {#if addDraft.role === "owner"}
          <h3>구단주 상세</h3>
          <div class="grid three">
            <label><span>운영 성향</span><input type="text" bind:value={addDraft.details.owner.ownershipStyle} /></label>
            <label><span>재임(년)</span><input type="number" bind:value={addDraft.details.owner.tenureYears} /></label>
            <label><span>예산 지원</span><input type="number" bind:value={addDraft.details.owner.stats.budgetSupport} /></label>
            <label><span>인내심</span><input type="number" bind:value={addDraft.details.owner.stats.patience} /></label>
            <label><span>PR 영향력</span><input type="number" bind:value={addDraft.details.owner.stats.prInfluence} /></label>
            <label><span>시설 투자</span><input type="number" bind:value={addDraft.details.owner.stats.facilityInvestment} /></label>
            <label><span>스태프 신뢰</span><input type="number" bind:value={addDraft.details.owner.stats.staffTrust} /></label>
            <label><span>예산 정책</span><input type="text" bind:value={addDraft.details.owner.budgetPolicy} /></label>
            <label><span>채용 정책</span><input type="text" bind:value={addDraft.details.owner.hiringPolicy} /></label>
          </div>
        {/if}

        {#if addIssues.length > 0}
          <div class="issues">
            <strong>검증 경고</strong>
            <ul>
              {#each addIssues as issue}
                <li>{issue}</li>
              {/each}
            </ul>
          </div>
        {/if}
        {#if addPopupError}
          <p class="popup-error">{addPopupError}</p>
        {/if}

        <footer>
          <button type="button" class="ghost" on:click={cancelAddPopup}>취소</button>
          <button type="button" on:click={saveAddPopup}>저장</button>
        </footer>
      </section>
    {/if}
  </div>
{/if}

<style>
  .entity-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
    background: rgba(5, 10, 18, 0.72);
    display: grid;
    place-items: center;
    padding: 24px;
  }

  .entity-modal {
    width: min(1220px, 95vw);
    height: min(840px, 92vh);
    background: #101d33;
    border: 1px solid #35517d;
    border-radius: 12px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid #294467;
  }

  h2 { margin: 0; font-size: 18px; color: #e4efff; }
  h3 { margin: 0; font-size: 15px; color: #dce9ff; }

  .head-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .ghost {
    border: 1px solid #476791;
    background: #162744;
    color: #dbe9ff;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .head-actions button {
    border: 1px solid #476791;
    background: #1d3a66;
    color: #dbe9ff;
    border-radius: 8px;
    padding: 6px 10px;
    cursor: pointer;
  }

  .persist-ok,
  .persist-error {
    margin: 0;
    padding: 7px 14px;
    font-size: 12px;
    border-bottom: 1px solid #2a4368;
  }

  .persist-ok {
    color: #c5f1da;
    background: #1c3430;
  }

  .persist-error {
    color: #ffd1da;
    background: #3a242c;
  }

  .tabs {
    display: flex;
    gap: 8px;
    padding: 10px 14px;
    border-bottom: 1px solid #253f62;
  }

  .tabs button {
    border: 1px solid #35527d;
    background: #162744;
    color: #dbe9ff;
    border-radius: 8px;
    padding: 7px 10px;
    cursor: pointer;
  }

  .tabs button.active {
    background: #29508a;
    border-color: #6ea2f7;
  }

  .body {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 340px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr);
    overflow: hidden;
  }

  .list {
    border-right: 1px solid #243e62;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    min-height: 0;
    overflow: hidden;
  }

  .actions {
    display: flex;
    gap: 8px;
    padding: 10px;
    border-bottom: 1px solid #243e62;
  }

  .actions button,
  .editor input,
  .editor select,
  .editor textarea,
  .add-popup input,
  .add-popup select,
  .add-popup textarea {
    border: 1px solid #35527d;
    background: #162744;
    color: #dbe9ff;
    border-radius: 8px;
    padding: 7px 10px;
    font-size: 13px;
    font-family: inherit;
  }

  .actions .danger {
    border-color: #7c4552;
    background: #2b1e26;
    color: #ffc6d0;
  }

  .list ul {
    margin: 0;
    padding: 8px;
    list-style: none;
    overflow: auto;
    display: grid;
    gap: 6px;
  }

  .list li button {
    width: 100%;
    text-align: left;
    border: 1px solid #2f496f;
    background: #14233a;
    border-radius: 8px;
    padding: 8px 10px;
    color: #dbe9ff;
    display: grid;
    gap: 3px;
    cursor: pointer;
  }

  .list li button.selected {
    border-color: #6ea2f7;
    background: #234169;
  }

  .list li button span {
    color: #9cb4d8;
    font-size: 12px;
  }

  .editor {
    padding: 12px;
    display: grid;
    align-content: start;
    gap: 10px;
    min-height: 0;
    overflow: auto;
  }

  .grid {
    display: grid;
    gap: 8px;
  }

  .grid.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  label {
    display: grid;
    gap: 6px;
  }

  label span {
    color: #a7bfdf;
    font-size: 12px;
  }

  .full {
    grid-column: 1 / -1;
  }

  .issues {
    border: 1px solid #5d3c49;
    background: #2a2027;
    border-radius: 10px;
    padding: 10px 12px;
    color: #ffd2db;
  }

  .issues strong {
    display: block;
    margin-bottom: 6px;
    font-size: 13px;
  }

  .issues ul {
    margin: 0;
    padding-left: 18px;
    display: grid;
    gap: 4px;
    font-size: 12px;
  }

  .editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .empty {
    margin: 0;
    color: #9db5d8;
  }

  .empty-guide {
    padding: 24px 20px;
    display: grid;
    gap: 8px;
  }

  .empty-guide p {
    margin: 0;
    color: #9db5d8;
    font-size: 13px;
  }

  .empty-guide .hint {
    color: #6a87ad;
    font-size: 12px;
    line-height: 1.6;
  }

  .head-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .league-file-select {
    font-size: 12px;
    padding: 5px 8px;
    background: #162743;
    border: 1px solid #3a5a8a;
    border-radius: 6px;
    color: #a8c4e8;
  }

  .add-popup {
    position: fixed;
    z-index: 96;
    width: min(860px, 94vw);
    max-height: 86vh;
    overflow: auto;
    background: #101d33;
    border: 1px solid #36507a;
    border-radius: 12px;
    padding: 12px;
    display: grid;
    gap: 10px;
  }

  .popup-error {
    margin: 0;
    color: #ffccd7;
    background: #361f2a;
    border: 1px solid #6a3f52;
    border-radius: 8px;
    padding: 8px 10px;
    font-size: 12px;
  }

  .add-popup footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
</style>
