# NPC 경력·계약 이력 검토 (2026-09-03 · 트랙 B · B-29)

**검토만이다. 코드도 데이터도 안 고쳤다.**

읽은 자리: `generation_rules.json`(`careerHistoryRules`·`salaryRules`·`rosterRules`·
`faRules`) · `roster_gen.rs` · `career_history.rs` · `npc_sim.rs` · `draft.rs` ·
`repo/newGameV3.ts` · `repo/seedPastPlayerStats.ts` · `types/save.ts` ·
`utils/careerEventLabel.ts` · `PlayerDetailModal.svelte` ·
`docs/ROSTER_FLOWS_2026-09-03.md`.

숫자는 **규칙 파일의 값으로 직접 계산**했다(엔진을 안 돌렸다 — electron 을 못 쓴다).
계산은 `pick_age`(삼각분포 PEAK 0.41 · `roster_gen.rs:339`)와
`pick_entry_age`(`career_history.rs:66`)를 그대로 옮겨 20만 표본을 돌린 값이다.

---

## 0. 한 장 — 이력이 세 군데에 나뉘어 있다

```
① careerHistory   NpcCareerEntry[]   연도별 성적 (year·team·statLine)
                  만드는 곳  seedPastPlayerStats.ts  → npc.extra.careerHistory
                  범위       프로 1·2군만 · 과거 5년
② transactions    slot.db 행         입단·이적 (draft·fa·trade·release)
                  만드는 곳  career_history.rs generate_career_history → seedCareerHistory
                  범위       CONTRACT_LEAGUES 일곱 (독립 포함 · 해외는 입단 생략)
③ careerEvents    NpcCareerEvent[]   진행 중 사건
                  만드는 곳  npc_sim.rs · draft.rs · TS 몇 곳
                  범위       새 게임 시점 **0건**
```

`PlayerDetailModal` 은 셋을 **각각 다른 절**로 그린다 —
「연도별 성적」(①·L1351) · 「주요 이벤트」(③·L1263) · 「팀 이력」(②·L463 `leagueGetTransactions`).

🔴 **이 갈래가 아래 결함 대부분의 뿌리다.** 같은 사람의 과거가 세 곳에서
따로 만들어지고 **서로를 안 본다.**

---

## 1. 사실 표 — 생성 시점

### 1-1. 연차는 나이에서 역산한다

```
career_history.rs:66  pick_entry_age   고졸 20세 55% · 대졸 24세 30% · 독립 25~27세 15%
roster_gen.rs:710     pro_service_years = max(0, age − entry_age)
roster_gen.rs:339     pick_age         삼각분포 · 최빈 41% 지점 (KBL 20~37 → 27세)
```

**규칙에서 직접 계산한 분포** (20만 표본):

| 리그 | 나이 | 연차 0 | 연차 0의 나이 | 이력 이적 0건 |
|---|---|---|---|---|
| KBL 1군 | 20~37 | **11.6%** | 24세 30% · 22세 17% · 23세 16% · 25세 13% | 61.0% |
| KBL 2군 | 20~29 | **30.8%** | 24세 31% · 23세 27% · 22세 18% | 80.2% |
| 독립 | 20~31 | **23.4%** | 24세 31% · 23세 25% · 22세 16% | 75.3% |
| ABL | 21~38 | **7.7%** | 23세 26% · 24세 24% · 25세 16% | 56.5% |

KBL 1군 연차 분포: `0:12% 1:5% 2:7% 3:7% 4:8% 5:9% 6:9% 7:10% 8:8% 9:7% 10:6% 11:4% 12:3%`

✅ **「25세 프로가 연차 0」은 결함이 아니다.** 입단 경로에 독립(25~27세 입단)이
있어서 그 나이의 신인이 설계상 나온다. 연차 0의 대부분(30%)이 **24세 대졸 신인**이라
분포 자체는 KBO 와 어긋나지 않는다.

✅ **「32세 연차 2」는 안 나온다.** `entry_age` 최대가 27이라 32세면 연차가 최소 5다.
(`roster_gen.rs:1289` 회귀가 그 자리를 지킨다 — 다만 그 테스트는 `entry_rules` 없는
갈래를 재고 있어 **지금 경로를 안 덮는다.** ⚠ 아래 결함 D-6)

⚠ **연차 1이 연차 0보다 적다**(5% 대 12%). `entry_age` 가 20/24/25~27 로 **끊겨 있어서**
연차 분포가 톱니다 — 21세(고졸 1년차)가 삼각분포 왼쪽 끝이라 얇다. 눈에 띄는 결함은
아니지만 「2년차가 1년차보다 많다」가 나오는 이유다.

### 1-2. 계약 기간은 나이도 연차도 안 본다

```
npc_sim.rs:3269   years = OVR ≥75 → 3+rand(0..2)   ≥68 → 2+rand(0..2)
                          ≥55 → 1+rand(0..1)       그 밖 → 1
                  age·service_years 는 salary 에만 쓰인다(3240·3252·3255)
```

🔴 **37세 OVR 78 이 5년 계약을 받는다** — 42세까지다. `salaryRules.agingFromAge`
34가 **연봉만** 깎고 기간은 안 건드린다.

### 1-3. 병역은 나이를 안 본다

```
roster_gen.rs:757   military_status = 한국인이면 "미필" · 그 밖 "면제"
npc_sim.rs:2301     "군필" 은 **실제로 복무를 마쳐야만** 붙는다
```

🔴 **새 게임의 한국인 NPC 는 전원 미필**이다 — 37세 KBL 베테랑도 미필이다.
`ROSTER_FLOWS` 의 입대 게이트는 상무 20~29 · 일반병 28/26 · 조기 25~27 이라
**30대 미필은 어느 문에도 안 걸리고 영원히 미필로 남는다.**

### 1-4. 과거 이력의 FA 자격 연차가 게임과 다르다

| 자리 | 값 |
|---|---|
| `careerHistoryRules.faEligibleYears` (이력 생성) | **8** |
| `faRules.eligibleYears` (게임) | KBL **5** · ABL **6** · JBL **4** · 그 밖 **9** |

🔴 **KBL 1군 자격자 61.8% 중 44% 는 이력에 FA 이적이 못 들어간다.** 5~7년차
구간이 통째로 그렇다 — 게임에서는 이미 FA 자격자인데 과거엔 FA 로 옮긴 적이
없는 사람이 된다. ABL 은 28% 다.

⚠ `faRules._note` 가 **바로 이 형태를 경고하고 있다** — 「자격 연수는 예전에 TS
`FA_THRESHOLD` 와 Rust `fa_eligibility_years` 두 곳에 각각 있었다. 값이 같아도
정본이 둘이면 언젠가 갈라진다」. 지금 세 번째 사본이 생겼고 **값이 이미 갈렸다.**

### 1-5. 이적 흔적 — 팀은 바뀌는데 성적은 안 따라간다

```
career_history.rs:200   소속팀 사슬을 현재 팀에서 거꾸로 만든다 → transactions
seedPastPlayerStats.ts:88  teamId: p.teamId      ← **현재 팀을 5년 내내 박는다**
```

🔴 **같은 모달 안에서 두 절이 서로를 부정한다.** 「팀 이력」은
`2022 트레이드 A → B` 라 적는데 「연도별 성적」은 2022 년도 **B 팀**으로 적는다.
이적한 39%(KBL 1군)에게 전부 해당한다.

### 1-6. 리그마다 만들어 주는 것이 다르다

| 리그 | 연도별 성적(①) | 이적 이력(②) | 입단 기록 |
|---|---|---|---|
| KBL 1·2군 | ✅ | ✅ | ✅ |
| ABL·JBL 1·2군 | ✅ | ✅ | ❌ (`NO_ENTRY_ROUTE_LEAGUES` — 의도된 것) |
| **독립** | ❌ (`PAST_LEAGUES` 밖) | ✅ | ✅ |
| 고교·대학 | ❌ | ❌ | ❌ |

⚠ **독립만 짝이 안 맞는다.** 이적 이력은 있는데 그 해 성적이 없다.

---

## 2. 사실 표 — 진행 시점

### 2-1. `careerEvents` 에 실제로 들어가는 것

| 사건 | 쓰는 자리 | `event_type` |
|---|---|---|
| 드래프트 지명 | `npc_sim.rs:3654` | `draft_picked` |
| 진로 배정(대학·2군·독립) | `draft.rs:614` | 변수 (`reason → dest`) |
| 야구 포기 | `draft.rs:670` | `quit_baseball` |
| 은퇴 (정년·FA미계약·독립상한) | `npc_sim.rs:1010·1914` | `retirement` |
| FA (취득·계약·원소속) | `npc_sim.rs:1837·2235·2603` | `fa_signed` |
| 웨이버 클레임 | `npc_sim.rs:1464` | `waiver_claim` |
| 육성 만료 | `npc_sim.rs:1610` | `development_expired` |
| FA 미계약 → 독립 | `npc_sim.rs:1875` | `transfer` |
| 보직 변경 | `npc_sim.rs:2093` | `position_change` |
| **트레이드** | `weekPhases/market.ts:700·707` | `trade` |
| **용병 영입·방출** | `foreignPlayers.ts:375·220` | `foreign_signing` · `release` |
| **입대·전역** | `game.ts:3056·3067` | `military_*` |

### 2-2. 🔴 `careerEvents` 에 **안 들어가는** 것

```
npc_sim.rs:1416~1417 (코드 주석)
  "방출은 ev() 로 OffseasonEvent 에만 남고 선수의 career_events 에는 안 들어간다"
```

| 사건 | 어디에만 남나 | 라벨은 있나 |
|---|---|---|
| 1군 승격 `promote` | `OffseasonEvent` (`npc_sim.rs:1697`) | ✅ 「1군 승격」 |
| 2군 강등 `demote_roster`·`demote_fielder` | 〃 (`:1120`·`:1735`) | ✅ 「2군 강등」 |
| 방출 `release_roster`·`release_score`·`release_budget` | 〃 (`:1134`·`:1281`·`:1374`) | ✅ 「방출(정원/성적/예산)」 |

🔴 **`careerEventLabel` 표에 이름이 있는데 그 유형이 `careerEvents` 에 한 번도
안 들어간다.** 표를 보면 있는 기능처럼 보이는데 화면엔 영영 안 뜬다.
**승격·강등·방출은 선수 상세에서 되짚을 수 없다.**

⚠ **주간 콜업/콜다운은 오프시즌 이벤트조차 아니다** — `market.ts
processProTeamCallupCalldown` 은 팀만 바꾼다(`ROSTER_FLOWS` §0 첫 줄).
매주 도는 경로인데 **아무 데도 안 남는다.**

### 2-3. 선언과 실제가 어긋나는 유형

`NpcCareerEventType`(`types/save.ts:895`)은 열셋을 선언한다.

| 선언에 없는데 엔진이 쓴다 | `waiver_claim` · `transfer` · `development_expired` |
|---|---|
| **선언에 있는데 아무도 안 쓴다** | `draft_undrafted` · `military_exempt`(NPC 쪽) |

⚠ 화면은 안 죽는다 — `careerEventLabel` 이 표에 있으면 한글로, 없으면 밑줄을
띄어쓰기로 바꿔 보여준다. **셋 다 표에는 있다.** 다만 **타입 유니온이 사실과
달라서** 컴파일러가 아무것도 못 막는다(그 파일 주석이 이미 경고하는 형태다).

---

## 3. 화면 — 나오는 것 / 안 나오는 것

| 절 | 읽는 것 | 새 게임 직후 |
|---|---|---|
| 연도별 성적 | `careerHistory` | 프로 1·2군만 최대 5행 · **독립·고교·대학 0행** |
| 주요 이벤트 | `careerEvents` | 🔴 **전원 0행** — 생성이 이 필드를 안 채운다 |
| 팀 이력 | `transactions` | 입단 1 + 이적 0~n (KBL 1군 39% 가 이적 있음) |

🔴 **「주요 이벤트」 절은 새 게임에서 아무에게도 안 보인다.** `{#if …careerEvents.length > 0}`
이라 절 자체가 사라진다. 첫 오프시즌이 지나야 생긴다.

---

## 4. 결함·모순 목록 (중요도 순)

| # | 무엇 | 근거 | 중요도 |
|---|---|---|---|
| **D-1** | **승격·강등·방출이 `careerEvents` 에 안 남는다.** 라벨은 여섯 개나 있는데 화면엔 영영 안 뜬다 | `npc_sim.rs:1416` 주석 · `:1120·1134·1281·1374·1697·1735` | 🔴 높음 |
| **D-2** | **연도별 성적이 이적을 무시하고 현재 팀을 5년 내내 박는다.** 같은 모달의 「팀 이력」과 정면으로 어긋난다 | `seedPastPlayerStats.ts:88` 대 `career_history.rs:200` | 🔴 높음 |
| **D-3** | **FA 자격 연차 정본이 둘이고 값이 다르다**(생성 8 / 게임 KBL 5). KBL 자격자의 44% 가 과거에 FA 이적이 없는 사람이 된다 | `careerHistoryRules.faEligibleYears` 대 `faRules.eligibleYears` | 🔴 높음 |
| **D-4** | **계약 기간이 나이를 안 본다.** 37세가 5년 계약을 받는다 | `npc_sim.rs:3269` | 🟡 중간 |
| **D-5** | **한국인 NPC 가 전원 미필로 시작한다.** 30대는 입대 게이트에 안 걸려 영원히 미필이다 | `roster_gen.rs:757` · `ROSTER_FLOWS` §1-12·1-13 | 🟡 중간 |
| **D-6** | **연차 회귀 테스트가 지금 경로를 안 덮는다.** `연차가_나이와_맞는다` 는 `entry_rules` 없는 폴백을 재고 있어, 경로 역산 쪽이 깨져도 안 잡힌다 | `roster_gen.rs:1289` 대 `:707` | 🟡 중간 |
| **D-7** | **주간 콜업/콜다운이 아무 데도 안 남는다** — 오프시즌 이벤트에도 없다 | `ROSTER_FLOWS` §0 · `market.ts` | 🟡 중간 |
| **D-8** | **타입 유니온이 사실과 다르다.** 엔진이 쓰는 `waiver_claim`·`transfer`·`development_expired` 가 선언에 없다 | `types/save.ts:895` | 🟢 낮음 |
| **D-9** | **독립리그만 짝이 안 맞는다** — 이적 이력은 있고 연도별 성적이 없다 | `CONTRACT_LEAGUES` 대 `PAST_LEAGUES` | 🟢 낮음 |
| **D-10** | 연차 분포가 톱니다(0:12% · 1:5% · 2:7%). `entry_age` 가 20/24/25~27 로 끊겨 있어서다 | 계산 §1-1 | 🟢 낮음 |

**결함이 아닌 것 둘** — 「25세 연차 0」(독립 25~27세 입단이 설계다)과
「32세 연차 2」(`entry_age` 최대 27이라 안 나온다)는 **정상이다.**

---

## 5. 🔴 사용자 결정이 필요한 것

| # | 물음 | 왜 값이 아니라 결정인가 |
|---|---|---|
| 1 | **승격·강등·방출을 선수 경력에 남기나**(D-1). 남기면 한 시즌에 213줄 규모가 되고, 그 대부분이 정합성 보정이라 「사건」이 아닐 수 있다 — `position_change` 를 소식에서 뺀 것과 같은 판단이다 | 통 수와 「무엇이 사건인가」의 문제다 |
| 2 | **과거 성적의 팀을 이적 이력에 맞추나**(D-2). 맞추면 두 생성기가 서로를 봐야 한다 — 생성 순서가 바뀐다 | 구조 변경이다 |
| 3 | **FA 자격 연차의 정본을 어디로 하나**(D-3). `faRules.eligibleYears` 로 모으면 리그마다 갈리고, 이력 생성은 리그를 이미 알고 있다 | 규칙 통합이라 되돌리기 어렵다 |
| 4 | **새 게임 NPC 의 병역을 나이로 채우나**(D-5). 채우면 30대는 「군필」로 시작하고, 그러면 복무 공백 시즌이 과거 성적에 있어야 앞뒤가 맞는다 | 과거 5년 생성과 얽힌다 |
| 5 | **계약 기간에 나이 상한을 두나**(D-4). 예: `min(years, 40 − age)` | 밸런스 값이지만 상한 규칙 자체가 새로 생긴다 |

---

## 6. D 에게 부탁할 덤프 (electron 이 필요해 여기서 못 냈다)

여기 숫자는 **규칙에서 계산한 값**이지 생성 결과가 아니다. 아래를 받으면
계산과 실제가 맞는지 대조할 수 있다.

| # | 무엇 | 왜 |
|---|---|---|
| 1 | 새 게임 직후 NPC 전원의 `{npcId, league, age, proServiceYears, contractYears, salary, militaryStatus}` JSON 덤프 | §1-1·1-2·1-3 을 실측과 대조. **계산이 틀렸으면 이 문서의 표가 다 틀린다** |
| 2 | 같은 시점 `transactions` 전체(`category` 별 집계 + 선수당 건수 분포) | §1-4 의 「FA 이적 0건」 비율 확인 |
| 3 | 1시즌 오프시즌을 지난 뒤 `careerEvents` 의 `eventType` 집계 | §2-1·2-2 확인 — `promote`·`demote_*`·`release_*` 가 정말 0인지 |
| 4 | `OffseasonEvent`(`kind`) 집계 같은 시즌 | D-1 의 규모(한 시즌에 몇 줄인가) — 사용자 결정 ①의 근거 |

⚠ **1번이 제일 급하다.** 나머지 넷은 이 문서를 다듬는 값이고, 1번은 이 문서가
서 있는 바닥이다.
