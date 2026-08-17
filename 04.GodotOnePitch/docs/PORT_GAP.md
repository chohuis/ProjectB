# 02 → 04 이식 격차 — 전수 조사

**2026-08-17** · 이 문서가 **남은 이식의 정본**이다.
남은 일 전반은 `docs/QUEUE.md`, 왜 그렇게 했는지는 `docs/RESUME.md`,
경기 화면 대조는 `docs/MATCH_PARITY.md`, 02 대조 아홉 축은 `docs/PARITY.md`.

> **목표는 하나다** — 02에서 동작하는 모든 기능이 04에서도 동작한다.
> UI·UX·화면·팝업·설정·연출까지.

⚠ **"안 옮기기로 했다"는 주석은 결정 기록이지 금지가 아니다.**
`settings_screen.gd:9-11`이 그 예다 — 사용자가 그 결정을 뒤집었다(2026-08-17).
같은 형태를 만나면 **금지가 아니라 후보로 본다.**

---

## 세어 본 결과

| | 개수 |
|---|---|
| 02 화면 파일 (`pages` 14 + `features/**/ui` 42) | **56** |
| 04 화면·부품 (`ui/screens` 14 + `ui/*_vm` 22 + `ui/parts` 11) | **47** |
| 판정 `있다` | **34** |
| 판정 `부분` | **11** |
| 판정 `없다` | **5** (첫 조사 8 → 병역 셋을 `부분`으로 정정) |
| 판정 `일부러 안 옮김` (→ 후보로 재검토) | **3** |
| 04에만 있는 것 (지우지 않는다) | **2** |

⚠ **개수는 파일 대응이지 기능 대응이 아니다.** 아래 "화면이 아닌 기능"에
설정 여섯 · i18n 등이 따로 있다.

---

## 1. 02 페이지 14개

| 02 페이지 | 줄 | 04 대응 | 판정 |
|---|---|---|---|
| `main/MainPage` | 859 | `ui/screens/main_screen` + `main_vm` | **부분** — 우측 고정 패널이 없다 |
| `match/MatchPage` | 3,220 | `match_screen` + `match_vm` + `pitch_vm` + `briefing_vm` | **있다** (M-1~M-7로 아홉 패널 다 참) |
| `new-game/NewGamePage` | 1,749 | `new_game_screen` + `new_game_vm` | **부분** — 시작 프리셋·상세 입력 재확인 필요 |
| `league/LeaguePage` | 1,605 | `league_vm` (리그 탭) | **부분** — 팀 마크·정렬/필터 재확인 필요 |
| `training/TrainingPage` | 1,393 | `training_screen` + `training_vm` | **부분** |
| `status/StatusPage` | 1,004 | `status_screen` + `status_vm` (하위 탭 6) | **있다** |
| `schedule/SchedulePage` | 954 | `schedule_vm` (일정 탭) | **부분** — 팀 마크 없음 |
| `news/NewsPage` | 540 | `news_vm` (소식 탭) | **있다** |
| `academics/AcademicsPage` | 503 | `academics_vm` (하위 탭) | **부분** |
| `finance/FinancePage` | 436 | `finance_vm` (하위 탭) | **부분** |
| `team/TeamPage` | 304 | `team_vm` (팀 탭) + `team_detail_screen` | **있다** |
| `people/PeoplePage` | 290 | `people_screen` + `people_vm` | **있다** |
| `achievements/AchievementsPage` | 236 | `achievements_vm` (하위 탭) | **있다** |
| `me/MePage` | 123 | "나" 탭 자체 | **있다** |

---

## 2. 02 부품·모달 42개

### 2-1. 04에 전용 화면으로 있다 (10)

| 02 | 04 |
|---|---|
| `player/PlayerDetailModal` (1,602줄) | `player_detail_screen` + `player_detail_vm` |
| `team/TeamDetailModal` (979) | `team_detail_screen` + `team_detail_vm` |
| `season-end/SeasonEndModal` (1,195) | `season_end_screen` + `season_end_vm` |
| `career/DraftBoardModal` (690) | `draft_board_screen` + `draft_board_vm` |
| `pre-game-briefing/PreGameBriefingModal` (720) | `briefing_vm` (경기 화면 안) |
| `retirement/CareerEndScreen` (299) | `retirement_screen` + `retirement_vm` |
| `retirement/RetirementAskModal` (98) | 같은 화면 (`_open_retirement`) |
| `settings/SettingsModal` (276) | `settings_screen` — **항목이 둘뿐** (아래 3절) |
| `save-slots/SaveSlotScreen` (281) | `ui/app.gd` 슬롯 |
| `intro/IntroScreen` (161) | `title_screen` |

### 2-2. 결정 화면 하나로 합쳐져 있다 (9) — **부분**

04 `decision_screen` + `decision_vm`이 아홉 갈래를 한 화면으로 받는다:
`career_results` · `draft_observe` · `draft_notification` · `career_choice_hub` ·
`career_choice` · `fa_market` · `salary_negotiation` · `option_clause` · `trade`.

| 02 모달 | 04 |
|---|---|
| `contract/ContractNegotiationModal` (372) | `salary_negotiation` 갈래 |
| `contract/TradeModal` (196) | `trade` 갈래 |
| `contract/FaMarketModal` (105) | `fa_market` 갈래 |
| `contract/OptionClauseModal` (44) | `option_clause` 갈래 |
| `contract/DraftNotificationModal` (112) | `draft_notification` 갈래 |
| `career/DraftObserveModal` (141) | `draft_observe` 갈래 |
| `career/CareerChoiceHubModal` (181) | `career_choice_hub` 갈래 |
| `career/CareerResultsModal` (242) · `CareerResultModal` (133) | `career_results` 갈래 |
| `career/UniversityApplyModal` (214) · `IndependentApplyModal` (167) | `career_choice` 갈래의 선택지 |

⚠ **"합쳐 놓은 것"이 곧 "옮긴 것"은 아니다.** 02 모달마다 있던 표·비교·
근거 표시가 한 줄 선택지로 눌렸을 수 있다 — **모달 하나씩 열어 무엇을
보여주는지 세야 한다.** 지금은 `부분`으로 둔다.

### 2-3. 없다 (8)

| 02 | 04 엔진 | 값 |
|---|---|---|
| `main-layout/TopHeader` (188) | — | 화면만. **UI 방향 U-3** |
| `main-layout/RightPanel` (266) | — | 화면만. **UI 방향 U-4** |
| `team/TeamMark` (31) | — | 화면만. **UI 방향 U-1** |
| `injury/InjuryTreatmentModal` (134) | ❓ `injury_treat` 검색 0건 | **엔진부터 확인** |

### 2-3b. 병역 셋 — **"없다"가 아니라 "부분"이었다** (2026-08-18 정정)

🔴 **처음 조사에서 셋 다 "화면만 없다"로 적었는데 틀렸다.** 04엔
`StatusVm.military_of`가 이미 있고 `status_screen`이 그린다(U-2에서 넣었다).
**파일 이름으로 대응시킨 탓이다** — 이 문서가 스스로 경고한 "부분이 제일
위험하다"에 내가 걸렸다.

| 02가 보여주는 것 | 04 | |
|---|---|---|
| 부대(체육/일반) | ✅ `unit_label` | |
| 남은 기간(주) | ✅ `weeks_left` | |
| 입대 연도 | ✅ `enlist_year` (02엔 없다) | 04에만 |
| **계급** (이병 ≤8주 · 일병 ≤34 · 상병 ≤60 · 병장) | ❌ | **없다** |
| **복무 진행 %** | ❌ (`weeks_served`/`weeks_total`은 있다) | 계산만 하면 된다 |
| 계약 +2년 배지 | ❌ | 04에 그 축이 있는지 확인 |
| 컨디션·피로 | ✅ 상태 화면 위쪽에 이미 있다 | 자리만 다르다 |

⚠ **계급 문턱 넷은 02 `MilitaryStatusPanel.svelte:12-18`에 있다** — 지어낼 게 없다.

### 🔴 체육부대가 도달 불가다 — **열여덟 번째 죽은 배선** (2026-08-18)

`sim/military.gd`는 체육부대를 **네 곳**에서 갈라 쓴다:
`unit_label`(`:65`) · 입대 소식 문구(`:130`) · **복귀 적응 주차**
(`RECOVERY_SPORTS`, `:179`) · 전역 소식(`:232`).
그런데 **`"sports"`로 입대시키는 곳이 하나도 없다** —
`career_decision.gd:413`이 `Military.enlist(state, "general", at_day)`
**하나만** 부른다. 게다가 그 자리는 "갈 곳이 없을 때의 마지막 갈래"다.

| 02 | 04 |
|---|---|
| `SportsUnitApplicationModal` — 상무에 **지원한다** | ❌ 지원하는 자리가 없다 |
| `MilitaryEnlistAskModal` — 입대할지 **묻는다** | ❌ 조용히 정한다 |

⚠ **02가 사용자에게 묻던 것을 04가 대신 정하고 있다.** 화면이 없는 게 아니라
**선택 자체가 없다.** 그래서 체육부대의 이점(복귀 적응이 빠르다)이 게임에
한 번도 안 나타난다.

⚠ **여기는 "화면만 붙이면 되는" 일이 아니다.** 자격 조건(성적·나이·`career_stage`)을
02에서 읽어 와야 하고 `decision_screen`에 갈래가 둘 는다.

### 🔴 어떻게 고칠지 — **사용자 확정** (2026-08-18)

> **04도 02와 똑같이 물어야 한다.**

**자동으로 정하는 지금 동작은 결함이다.** 아래 둘을 `Pending`에 올리고
`decision_screen`이 받는다 — 다른 진로 결정 아홉과 같은 방식이다.

| | 언제 묻나 | 선택지 |
|---|---|---|
| **입대 확인** (`MilitaryEnlistAskModal`) | 입대 시기가 왔을 때 | 입대한다 / 미룬다 |
| **상무 지원** (`SportsUnitApplicationModal`) | 자격이 될 때 | 상무에 지원한다 / 현역으로 간다 |

⚠ **`career_decision.gd:413`의 자동 `Military.enlist(state, "general", …)`는
남기지 않는다.** 물어 놓고 답을 안 기다리면 그 물음이 장식이 된다 —
`retirement_ask`가 04에서 딱 그 상태였다(**밀어넣는 코드는 있는데 받는 자리가
없어 자동 진행이 거기서 멈춘 채 안 풀렸다**, `app_root.gd:440`).

⚠ **자격 조건·확률·기간은 02에서 그대로 읽어 온다.** 지어내지 않는다.

#### 02에서 읽어 온 조건 (`advanceWeek.ts:1952-2135`)

공통 전제 — `militaryStatus == "미필"` **그리고** `career_stage`가
`military`도 `highschool`도 아니다 (`:1959-1961`).

| | 언제 | 조건 |
|---|---|---|
| **체육부대 후보 공개 → 지원** | **W50** | `age <= 27` · `sportsUnitPromptedYear != seasonYear` |
| 체육부대 선발 결과 | **W52** | `sportsUnitApplied` |
| **입영 기간 만료 → 입대 확인** | **W52** | `age >= 28` · 미신청 · `militaryAskedYear` 가드 |

#### 🔴 **W50·W52를 그대로 옮기지 않는다 — 날짜로 푼다** (사용자 지적)

02는 `weekInYear = ((weekNum - 1) % 52) + 1`로 잰다. **04엔 진짜 달력이 있다** —
`Calendar.date_of(season_year, day)`가 연·월·일을 준다. 시즌 시작이
`SEASON_START_MONTH/DAY`이고 달마다 길이가 다르므로 **주차와 날짜가 1:1이 아니다.**

⚠ **"52주 중 50번째 주"는 04에 없는 개념이다.** 그대로 박으면 04가 안 쓰는
축을 하나 새로 만드는 것이고, 달력이 있는데 주차로 재면 **어느 날인지 화면이
말할 수 없다**("W50에 무슨 일이 있었나"를 사용자가 못 읽는다).

**이미 같은 판단을 한 선례가 있다** — P-4(인시즌 승강)에서 02의 "월 첫 주"를
`Calendar.date_of`의 **달 변화**로 갈랐다. 주석: *"주기는 근사 없이"*.

**옮기는 방법**: W50·W52가 02에서 무엇을 뜻하는지 먼저 정하고(시즌 막바지 ·
시즌 종료 직전), 04에서는 **그 뜻에 해당하는 날짜 조건**으로 쓴다.
`Calendar.week_of(day)`가 있으니 주차로 재는 것도 가능하지만,
**월·일로 말할 수 있는 조건을 먼저 찾는다.**

⚠ **어느 쪽을 고르든 근거를 적는다.** 02가 W50을 고른 이유가 "시즌이 끝나 갈
무렵"이면 04에서도 그 뜻이 유지되는 날짜여야 한다 — **주차 숫자를 옮기는 게
아니라 뜻을 옮긴다.**

**환산해 봤다** (04 시즌은 **3월 1일 시작 · 364일**):

| 02 | 04 달력 | 뜻 |
|---|---|---|
| **W50** | 344일차 · **2월 7~13일** | 시즌 종료 **약 3주 전** |
| W51 | 351일차 · 2월 14~20일 | |
| **W52** | 358일차 · **2월 21~27일** | **시즌 마지막 주** |

**그래서 04에서는 이렇게 쓴다:**

| 02 | 04 조건 | 왜 |
|---|---|---|
| W50 (후보 공개 → 지원) | **2월이 시작될 때** (`Calendar.date_of`의 **달 변화**) | P-4의 선례 그대로. "시즌 막바지"라는 뜻이 달 이름으로 읽힌다 |
| W52 (선발 결과 · 입대 확인) | **시즌 마지막 주** (`day > DAYS_PER_SEASON - 7`) | 시즌 종료 직전이라는 뜻. 04는 364일차에 롤오버한다 |

⚠ **주차 숫자(50·52)를 04 코드에 적지 않는다.** 적는 순간 시즌 길이가
바뀌면 조용히 어긋난다 — **날짜와 시즌 끝에서 파생한다.**

⚠🔴 **가드 둘이 없으면 게임이 얼어붙는다. 02가 실측으로 두 번 겪었다.**
02 주석 그대로:

> `sportsUnitPromptedYear` 가드가 **반드시 있어야 한다.** 이 블록은 주를 안
> 넘기고 pending만 밀어넣은 채 반환한다 — 사용자가 신청/거절 어느 쪽을 눌러도
> 주차가 그대로라 다음 진행에서 조건이 또 참이 된다. 그러면 미필·비고교·27세
> 이하는 **매년 여기서 게임이 멈춘다**(실측 확인).

> `militaryAskedYear` 가드 필수 — W50 체육부대 공개와 **같은 결함**이다.
> 모달의 "연기"는 상태를 안 바꾸므로 다음 진행에서 조건이 또 참이 된다.
> 실측: **2038 W51에서 자동 진행이 1000회 반복 상한에 걸려 멈췄고, 수동
> 진행이면 영영 W51이다.**

⚠ **04에 옮길 때 이 가드 둘을 같이 옮긴다.** "물었다"를 해마다 기억하는
자리(`sports_unit_prompted_year` · `military_asked_year`)가 없으면
**04에서도 같은 증상이 난다** — 04는 자동 진행이 "다음 결정까지" 가므로
거기서 무한히 선다.

⚠ **입대 처리는 `Military`가 정본이다.** 02도 그 자리에 적어 뒀다 —
"네 경로가 각자 적고 있었고 그중 둘이 오프시즌 처리를 빠뜨렸다"(`:2083-2084`).

⚠ **자동 진행(`AutoAdvance`)이 이 물음을 어떻게 넘기는지도 정해야 한다** —
사용자가 "다음 결정까지"를 눌렀을 때 여기서 멈춰야 한다. **멈추는 게 맞다**
(진로 결정이므로). 검사로 못 박는다.
| `game-status/GameStatusModal` (599) | ❓ 검색 0건 | **무엇을 보여주는지부터 읽는다** |

### 2-4. 소식 패널 — **부분** (5)

02는 소식 목록 안에 카드형 패널을 끼워 넣는다. 04는 글자 줄만 있다.

| 02 | 04 엔진 | 판정 |
|---|---|---|
| `messages/DigestCards` (89) | ✅ `sim/digest.gd` | **화면만 없다** |
| `messages/InjuryPanel` (183) | ✅ `injury_runner` | **화면만 없다** |
| `messages/ProspectTop10Panel` (181) | ✅ `retirement`·`trade`에 관련 축 | **확인 필요** |
| `messages/OffseasonPanel` (194) | ✅ `sim/offseason.gd` | **화면만 없다** |
| `messages/TrainingStatBars` (152) | ✅ `training_vm` | **부분** |

### 2-5. 개발자 도구 — **일부러 안 옮김** (4)

`devtools/DevToolsHubModal` · `AutoAdvancePanel` · `ScenarioPanel` ·
`events/EventManagerModal` · `match-engine-lab/MatchEngineLabModal`.
04는 CLI 계측(`tools/run.gd`)으로 대체했다. **후보로만 남긴다** — 게임 기능이
아니라 개발 도구다.

### 2-6. 04에만 있다 — **지우지 않는다** (2)

- **경기 전 브리핑** (F-5) — 상대 선발 구위·무브먼트·커맨드 + 상대 타선 9명
- **구장 그림 27장** — 02는 프로 구장 하나가 하드코딩이라 고교 경기도 프로
  구장에서 열렸다

### 2-7. 이미 대응 (6)

`navigation/SidebarNav` → 04 좌측 탭 · `match-view/BaseballField` →
`ui/parts/baseball_field` · `achievements/AchievementManagerModal` →
`achievements_vm` 하위 탭.

---

## 3. 화면이 아닌 기능

### 3-1. 🔴 설정 — 02 여섯 줄 vs 04 두 줄

| 항목 | 02 | 04 | 할 일 |
|---|---|---|---|
| **테마 (밝게/어둡게/시스템 따름)** | ✅ radiogroup 셋 | **✅ 2026-08-18** | `AppTheme`의 색을 `const` → `static var`로. **읽는 231곳은 한 글자도 안 바뀌었다** |
| **언어** | ✅ 키 기반 | ❌ | **04에 하드코딩 한글 문구가 736개다**(`grep` 실측). 표로 빼는 게 먼저고, 04는 한국어 단일이라 지금 스위치를 만들면 **한 칸짜리 목록**이다 |
| **연출 속도** | ✅ 화면엔 있다 | ❌ | 🔴 **02에서도 죽은 스위치다.** `effectSpeed`를 읽는 곳이 `SettingsModal` 밖에 **0곳**이다(실측) — 저장만 하고 아무도 안 본다. **옮기면 02의 죽은 배선을 물려받는 것**이라 안 옮긴다(P-11 원칙) |
| **모션 줄이기** | ✅ `App.svelte:46`이 CSS로 적용 | ❌ | **04엔 끌 모션이 없다.** `Tween` · `AnimationPlayer` · `create_timer`가 `ui/` 전체에 **0건**(실측). 애니메이션을 먼저 만들어야 뜻이 생긴다 |
| 창 크기 | ✅ | ✅ | |
| 볼륨 | ✅ (소리는 아직 없다고 화면이 밝힌다) | ❌ | 04도 소리가 없다 |
| 전체화면 | ❌ | ✅ | 04에만 있다 |

### 3-2. 그 밖

| 축 | 02 | 04 | 판정 |
|---|---|---|---|
| i18n (`$t`) | ✅ 키 기반 | ❌ 문구가 코드에 박혀 있다 | 언어 설정의 전제 |
| 팀 색 주입 (`applyTeamTokens`) | ✅ 소속팀 색이 문서 루트에 | ❌ **238팀 `colors`를 안 쓴다** | UI 방향 U-2 |
| 배지 (안 읽은 소식 · 미확인 업적) | ✅ | ✅ | |
| 정렬·필터·페이지 넘김 | ✅ 페이지별 | 부분 | 화면마다 세야 한다 |
| 자동 진행 정책 | ✅ | ✅ (`auto_advance`) | |
| 저장·불러오기 | ✅ 슬롯 | ✅ 슬롯 | |

---

## 4. 순서 — 값싼 것부터

**막힌 것부터 푼다.** 아래 넷은 커리어 자체가 안 굴러가는 자리라
화면 이식보다 앞선다 (`QUEUE.md`의 P-13~P-17).

| | 항목 | 왜 먼저 |
|---|---|---|
| 🔴 1 | **P-14 대학 진학 뒤 주인공이 로스터에서 사라진다** | P-15·P-16·P-13이 이 위에 설 수 있다 |
| 🔴 2 | P-15 대학 학년이 18해째 1학년 | 졸업이 없으니 프로에 못 간다 |
| 🔴 3 | P-16 20해에 성장한 주가 1주 | 훈련은 도는데 능력치가 안 오른다 |
| 🔴 4 | P-13 라이벌 값이 전부 0 | 잡히기만 하고 안 쌓인다 |

그다음 **화면만 없는 것**(엔진이 이미 돈다) → 병역 셋 · 소식 패널 넷 ·
설정 테마 → **엔진부터 확인해야 하는 것** 둘(부상 치료 · 경기 상태) →
**UI 방향**(U-1~U-5).

---

## 5. 진행

| 항목 | 상태 | 검사 · 변이 |
|---|---|---|
| 0단계 전수 조사 | ✅ 2026-08-17 | — |
| 🔴 P-14 로스터 이동 | ✅ 2026-08-18 | 검사 7 · **변이 7/7** |
| 🔴 P-15 대학 학년 | ✅ **P-14가 원인이었다** | (같은 검사) |
| P-13 라이벌 값 | ~ 움직이기 시작 (−5~4) | 20해 재측정 필요 |
| P-16 성장 1주 | ✅ **결함 아님** — 계측이 틀린 질문 | P-16b로 뗌 |
| 설정 · 화면 톤 셋 | ✅ 2026-08-18 | 검사 16 · **변이 7/7** |
| `shot.gd`가 톤을 안 걸던 것 | ✅ 같이 고침 | — |
| 설정 · 연출 속도 | ✅ **안 옮긴다** — 02에서도 죽은 스위치 | 실측 0곳 |
| 설정 · 모션 줄이기 | ⬜ 애니메이션이 먼저 | 실측 0건 |
| 설정 · 언어 | ⬜ 문구 736개를 표로 빼는 게 먼저 | 실측 736 |

| 병역 · 계급 | ✅ 2026-08-18 | 검사 6 · **변이 4/4** |
| 병역 · 복무 진행 막대 | ✅ 이미 있었다 (조사표가 틀렸다) | — |
| 🔴 체육부대 도달 불가 | ⬜ **새로 찾음** — 열여덟 번째 죽은 배선 | — |

### 다음에 할 것 (값싼 순서)

1. 🔴 **체육부대 지원 · 입대 확인** — 선택 자체가 없다. 자격 조건을 02에서
   읽어 오고 `decision_screen` 갈래를 둘 늘린다
2. **소식 패널 넷** — 다이제스트 · 부상 · 유망주 Top10 · 오프시즌.
   **엔진이 이미 돈다**(`sim/digest.gd` · `injury_runner` · `sim/offseason.gd`)
3. **결정 화면 아홉 갈래를 02 모달과 하나씩 대조** — 표·비교·근거가
   한 줄 선택지로 눌렸는지 본다
4. **부상 치료 · 경기 상태** — 엔진부터 확인
5. **UI 방향 U-1~U-5** (팀 마크 · 팀 색 주입 · 헤더 · 우측 패널 · 목록 마크)
6. **밝은 톤 다듬기** — 하위 탭 버튼이 다소 무겁다. 02도 U5로 뒤집은 뒤
   U7·U9·U10으로 남은 어두운 섬을 차례로 옮겼다
7. **P-13 20해 재측정** · **P-16b 계측 고치기** · **P-17 대학 일정**

**한 원인이 셋을 붙들고 있었다.** `_move_to`가 로스터를 안 건드려서 주인공이
어느 로스터에도 없었고, `all_players`가 로스터만 훑으므로 **진급·성적 집계·
관계가 전부 주인공을 못 봤다.** 20해 계측이 아니었으면 못 찾았다 —
4해로는 고교 구간만 돌아 멀쩡해 보였다.
