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
| 판정 `없다` | **8** |
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
| `military/MilitaryStatusPanel` (127) | ✅ `career_path`·`career_runner` | **화면만 없다** — 싸다 |
| `military/SportsUnitApplicationModal` (93) | ✅ 같은 곳 | **화면만 없다** |
| `military/MilitaryEnlistAskModal` (69) | ✅ `military_enlist` 대기 타입이 있다 | **화면만 없다** |
| `injury/InjuryTreatmentModal` (134) | ❓ `injury_treat` 검색 0건 | **엔진부터 확인** |
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

### 다음에 할 것 (값싼 순서)

1. **병역 셋** — `MilitaryStatusPanel` · `SportsUnitApplicationModal` ·
   `MilitaryEnlistAskModal`. **엔진이 이미 돈다**(`career_path` ·
   `career_runner` · `military_enlist` 대기 타입)
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
