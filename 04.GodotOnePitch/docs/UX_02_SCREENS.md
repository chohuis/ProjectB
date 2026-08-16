# 02 화면 구조 — UI/UX 보고서 조각 2

02를 **읽어서만** 적는다(띄우지 않는다). 04 캡처 이름은 `UX_SHOTS.md`가 정본.

## 읽은 진도

| 묶음 | 상태 |
|---|---|
| 껍데기·탐색 (SidebarNav · TopHeader · RightPanel · MainPage) | ✅ |
| 04 껍데기 대조 (`main_screen.tscn` · `main_vm.gd` · `main_screen.gd`) | ✅ |
| 설정 · 키보드 · 목록 누름 — 04에 있나 | ✅ 셋 다 **없다** |
| 짝이 있는 화면 13개 | ⬜ |
| `PlayerDetailModal`(1478) · `TeamDetailModal`(871) 내용 | ⬜ ← **다음** |
| 나머지 결정 모달 | ⬜ |

---

## 한눈에 — 화면 개수가 다섯 배 차이난다

| | 02 | 04 |
|---|---|---|
| svelte / 씬 | **56** (pages 15 + features 41) | **11** |
| 상시 껍데기 | 헤더 + 3분할 | **같은 골격이 있다** (아래 정정) |
| 결정 모달 | **개별 화면 ~14개** | **`decision_screen` 하나** |

⚠ **개수 차이 자체는 결함이 아니다.** 02의 41개 중 상당수가 개발 도구
(`devtools/` 셋 · `MatchEngineLabModal`)이고, 결정 모달 열넷은 04가 의도적으로
하나로 합쳤다 (`decision_vm.gd:10-12`: "화면을 종류마다 만들지 않는다. 결정은
'무엇을 묻고 · 고를 것이 무엇인가' 하나로 같다").

**보고서가 물어야 할 것은 "합쳐서 잃은 게 있나"다.**

---

## 1. 껍데기 — 02는 3분할, 04는 없다

### 02: `pages/main/MainPage.svelte:406-457`

```
grid-template-rows:    auto  minmax(0,1fr)          (MainPage.svelte:630)
grid-template-columns: 170px minmax(0,1fr)  220px   (MainPage.svelte:637)
                       ↑사이드바  ↑본문      ↑우측
                       좁은 창에선 154 / 196px       (MainPage.svelte:666)
```

- **위** `TopHeader` — 팀 마크 · 등번호 · 이름 · 메타(팀·학년·포지션·투타) ·
  날짜 · 주차 · **[다음 주 진행] 버튼**
- **왼쪽** `SidebarNav` — 여섯 탭(소식 · 나 · 팀 · 리그 · 인물 · 일정) + 배지 +
  톱니(설정)
- **오른쪽** `RightPanel` — OVR · 게이지 셋(컨디션·피로·사기) · 태그 ·
  다음 경기 · 팀 순위 · 최근 로그 6줄
- **가운데** 탭 본문

### 04: 같은 골격이 **있다** — `main_screen.tscn`

⚠ **처음에 "04는 껍데기가 없다"고 적었는데 틀렸다.** `main`·`app`·`news`
캡처가 바이트까지 같은 건(63,158B) 껍데기가 없어서가 아니라 **껍데기가
`MainScreen` 안에 있어서**다 — `AppRoot`가 그걸 전체 화면으로 얹기만 한다.

```
MainScreen                                (main_screen.tscn)
└ Pad/Col
  ├ Header   DateRow(날짜·요일·주차) + WhoRow(선수명·팀명)
  └ Body  ── HBox 셋
     ├ Nav    Tabs (세로 버튼 여섯)
     ├ Main   TabHost
     └ Right  훈련 계획 버튼 · 다음 경기 · 진행 버튼 · 진행 막대
```

**골격은 같다. 다른 건 오른쪽 칸에 무엇이 들었는가다.**

| 02 `RightPanel` | 04 `Right` |
|---|---|
| OVR | ✗ |
| 게이지 셋 — 컨디션 · 피로 · 사기 | ✗ |
| 태그 | ✗ |
| **다음 경기** (날짜 · 홈/원정 · 상대 · "3일 뒤") | ○ 라벨 한 줄 |
| 팀 순위 (권역 + 전국 · 전적 · 연승) | ✗ |
| 최근 로그 6줄 | ✗ |
| — | 훈련 계획 버튼 · 진행 버튼 · **진행 막대** |

`main_vm.gd:67-87`이 넘기는 키가 전부다 — `date_label` · `weekday_label` ·
`week_label` · `day` · `season_days` · `team_name` · `player_name` ·
`next_game_in` · `next_game_label` · `advance_days` · `advance_label` ·
`can_advance` · `stop_type` · `unread_count` · `undecided_count` · `tabs`.
**OVR도 컨디션도 순위도 안 넘어간다.**

헤더도 얇아졌다. 02는 팀 마크 · 등번호 · 이름 · 팀 · 학년 · 포지션 · 투타를
싣는데(`TopHeader.svelte:66-82`) 04는 **이름과 팀명 둘**이다.

### 근거로 남길 것 — 02가 껍데기에 올린 이유가 주석에 있다

**`TopHeader.svelte:19-21`**
> 등번호·컨디션·피로·사기·태그는 **우측 패널로 옮겼다.** 헤더는 모든 화면 위에
> 항상 떠 있으므로 "지금 누구이고 언제인가"만 남긴다. **변하는 수치를 여기 두면
> 화면을 볼 때마다 눈이 위로 끌려간다.**

**`RightPanel.svelte:12-16`**
> "최근 로그"에서 "내 상태"로 바뀌었다. 로그는 이미 지나간 일이라 항상 떠 있을
> 이유가 약했다. 항상 보여야 하는 건 **"지금 내가 던질 수 있는 상태인가 · 다음
> 경기가 언제인가 · 우리 팀이 몇 위인가" 셋**이고, 그 셋이 전부 다른 화면에
> 흩어져 있었다.

**02가 "항상 보여야 한다"고 꼽은 셋 중 04에 남은 건 "다음 경기" 하나다.**
02는 그 셋이 흩어져 있던 걸 모아 온 자리인데, 04는 다시 흩어진 상태다.
(컨디션·피로는 `status`/"나" 탭에, 순위는 `league` 탭에 있다 — 조각 3에서
캡처로 확인한다.)

### 껍데기에 붙어 있던 것들

| 02 | 어디 | 04 |
|---|---|---|
| **[다음 주 진행]** 버튼 | `TopHeader.svelte:89-97` | ○ `Right/Footer/Advance` |
| **스페이스바**로 진행 | `TopHeader.svelte:55-61` | ✗ (아래 참조) |
| 진행 버튼 라벨이 상태를 말함 | `TopHeader.svelte:27-31` | ○ `main_screen.gd:143-157` |
| 처리할 게 남으면 **호박색** | `TopHeader.svelte:181-187` | ❓ 색으로 구분하나 |
| 탭 배지 — **개수** | `SidebarNav.svelte:47-51` | ○ `main_screen.gd:203-206` |
| 탭 배지 — **빨강/금색 색 구분** | `SidebarNav.svelte:141-142` | ✗ 라벨에 숫자만 붙인다 |
| 진행 막대 (긴 대기) | 없다 | ○ `main_screen.gd:79-88` |
| 군 복무 카운트다운 | `SidebarNav.svelte:38-40` | ❓ |
| "나"와 "세계"를 가르는 구분선 | `SidebarNav.svelte:53-54` | ❓ |
| 팀 마크 · 등번호 | `TopHeader.svelte:68-73` | ✗ |
| 고교 **권역 순위 + 전국 순위** 둘 다 | `RightPanel.svelte:34-44, 122-131` | ❓ |

**진행 버튼 라벨 — 02 다섯** (`TopHeader.svelte:27-31`):
```
경기 대기 중 / 메시지 확인 / 이벤트 처리 / 진행 중... / 다음 주 진행
```
**04 셋 + 사전이 준 라벨** (`main_screen.gd:143-157`, `85`):
```
경기 시작 / 시즌 종료 / advance_label / "진행 중  N / M일"
```

⚠ **양쪽이 같은 결함을 같은 문장으로 적어 뒀다.**
02: "버튼 하나가 지금 무엇 때문에 막혀 있는지를 말한다."
04 `main_screen.gd:143-145`: "등판일엔 진행이 아니라 경기고, 시즌 마지막 날엔
시즌 종료다. 같은 버튼에 '0일 진행'을 두면 눌러도 아무 일이 안 일어나고,
**사용자는 게임이 멈춘 줄 안다**."

**04가 앞선 자리** — 02엔 진행 막대가 없다. 04는 `한 번에 162일까지` 가므로
(`main_screen.gd:76`) 막대를 붙였고 "진행 중 N / M일"로 남은 양을 말한다.

### 04엔 키보드가 통째로 없다

```
04.GodotOnePitch/ui/**/*.gd 에서
  _unhandled_input · _input( · InputEventKey · KEY_SPACE  →  0건
```

02는 스페이스바로 주를 넘긴다(`TopHeader.svelte:55-61`). 입력칸에 있을 땐
안 먹게 막아 뒀다(`:58`). **04는 마우스만이다.**

⚠ **이건 검사 전제와 얽혀 있다.** `04/CLAUDE.md`가 `--ignoreHeadlessMode`를
쓰는 근거로 "지금 검사는 UI 조작을 안 쓴다"를 든다. 키 입력을 넣으면 그 전제를
다시 봐야 한다 — 제안에 그 비용을 적는다.

### 04엔 설정 화면이 없다

02 `SettingsModal`(251줄)에 있는 것:

| 묶음 | 항목 |
|---|---|
| 표시 | 테마 · **언어** · 창 크기(전체화면 포함) |
| 게임 | 연출 속도 · **모션 줄이기** |
| 소리 | "준비 중" 문구만 |

04는 `설정`·`Settings`·`언어`·`locale`로 `ui/` 아래에서 한 건도 안 나온다.
**창 크기도 언어도 못 바꾼다.** PC(Steam)가 1차 목표인데 전체화면 전환이
없는 건 조각 3에서 "지금 하자"로 다룬다.

---

## 2. 결정 흐름 — 02는 모달 열넷, 04는 화면 하나

### 02 (`MainPage.svelte:460-608`) — 전부 `MainPage` 바닥에 나란히 걸려 있다

진로 · 계약 · 군 · 부상 · 경기 전 · 시즌 종료 · 개발 도구가 한 파일에서
`{#if}`로 열린다.

| 02 모달 | 줄 | 04 `HANDLED` |
|---|---|---|
| `CareerChoiceHubModal` | 165 | `career_choice_hub` |
| `CareerResultsModal` | 216 | `career_results` |
| `CareerResultModal` | 119 | (합쳐짐) |
| `DraftObserveModal` | 124 | `draft_observe` |
| `DraftNotificationModal` | 96 | `draft_notification` |
| `ContractNegotiationModal` | 330 | `salary_negotiation` |
| `OptionClauseModal` | 39 | `option_clause` |
| `TradeModal` | 172 | `trade` |
| `FaMarketModal` | 97 | `fa_market` |
| `UniversityApplyModal` | 200 | (합쳐짐 — `_hub`/`_choice`) |
| `IndependentApplyModal` | 155 | (합쳐짐) |
| `RetirementAskModal` | 85 | **자기 화면**(`retirement_screen`) |
| `MilitaryEnlistAskModal` | 61 | ❓ |
| `SportsUnitApplicationModal` | 82 | ❓ |
| `InjuryTreatmentModal` | 113 | ❓ |
| `PreGameBriefingModal` | 640 | ❓ |
| `GameStatusModal` | 526 | ❓ |
| `SeasonEndModal` | 1060 | `season_end_screen` (132) |

04: `decision_vm.gd:20-24`가 아홉을 받고, 은퇴만 따로 뺐다
(`decision_vm.gd:14-15`: "은퇴는 화면이 결산으로 바뀌는 특별한 흐름이라 자기
화면이 있다").

⚠ **04 주석이 이 자리의 옛 결함을 적어 뒀다** (`decision_vm.gd:6-8`):
> 대기줄에 열 종류가 쌓이는데 **받는 화면이 은퇴 하나뿐이었다.** 나머지는
> 밀어넣는 코드만 있고 받는 자리가 없어서 `AutoAdvance`가 그 자리에서 멈춘 채
> 안 풀린다 — **프로 커리어가 실제로 막힌다.**

### 보고서에서 물을 것

`ContractNegotiationModal`이 330줄, `PreGameBriefingModal`이 640줄이다.
**하나로 합친 `decision_screen`(63줄 + vm 271줄)이 그만큼을 담고 있나** —
아니면 협상 화면이 "예/아니오"로 납작해졌나. 조각 3에서 둘을 읽고 대조한다.

---

## 3. 04엔 있고 02엔 없는 것

| 04 | 02 |
|---|---|
| `decision_screen` (결정 한 자리) | 없다 — 모달이 흩어져 있다 |
| `title_screen` + `slots.gd` | `SaveSlotScreen`(247) + `IntroScreen`(138) |

## 02엔 있고 04엔 없는 것 (개발 도구는 뺀다)

| 02 | 줄 | 성격 |
|---|---|---|
| `PlayerDetailModal` | **1478** | **04에 없다** — 아래 참조 |
| `TeamDetailModal` | **871** | **04에 없다** — 아래 참조 |
| `EventManagerModal` | 1361 | **개발 도구** |
| `MatchEngineLabModal` | 301 | **개발 도구** |
| `AchievementManagerModal` | 218 | **개발 도구** |
| `AutoAdvancePanel` · `ScenarioPanel` · `DevToolsHubModal` | 681 | **개발 도구** |
| `SettingsModal` | 251 | **04에 없다** — 테마·언어·창 크기·연출 속도·모션 줄이기 |
| `MilitaryStatusPanel` | 122 | 군 복무 중 상시 패널 |
| `OffseasonPanel` · `ProspectTop10Panel` · `InjuryPanel` · `DigestCards` · `TrainingStatBars` | 694 | 소식 안의 카드들 |

### ⚠ 04의 목록은 **아무것도 눌리지 않는다**

`ui/parts/`의 아홉 부품 어디에도 `Button`·`pressed`·`signal`·`gui_input`이
**0건**이다. `player_row.gd`는 `HBoxContainer`이고 라벨 넷(포지션·이름·나이·OVR)을
칠하기만 한다. `standing_row` · `news_row` · `schedule_row`도 같다.

02는 `TeamPage` · `LeaguePage` · 소식 패널 셋에서 줄을 눌러 `PlayerDetailModal`
(1,478줄) · `TeamDetailModal`(871줄)을 연다.

**합쳐 2,349줄이고 개발 도구가 아니다.** "선수/팀을 눌러 자세히 보는 자리"가
04엔 통째로 없다 — 목록에서 보이는 건 **포지션 · 이름 · 나이 · OVR 넷**뿐이다.

이게 이 보고서의 가장 큰 항목이 될 것이다. 조각 3에서 `PlayerDetailModal`을
읽어 **무엇을 담고 있었는지**를 적고, 그중 04가 다른 자리에서 이미 보여주는
것과 아예 못 보는 것을 가른다.

---

## 다음에 읽을 것

1. `StatusPage`(927) — 04 `status`/`me` 짝. 하위 탭 구성
2. `PlayerDetailModal`(1478) — 04에 대응이 있나
3. `TeamDetailModal`(871) — 같은 물음
4. `ContractNegotiationModal`(330) vs 04 `decision_vm._salary`
5. `PreGameBriefingModal`(640) · `GameStatusModal`(526) — 04에 대응이 있나
6. 나머지 pages 12개
