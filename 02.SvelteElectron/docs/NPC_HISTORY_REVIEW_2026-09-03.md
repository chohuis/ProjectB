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

---

## D 실측 (2026-09-04 · `scripts/probe-npc-dump.cjs` · 씨앗 20260802 · electron 1개)

A 지정 다섯 항목을 새 게임 NPC 5,798명 전원 덤프(`{npcId, league, age,
proServiceYears, contractYears, salary, militaryStatus, militaryServedUnit}`)
+ 오프시즌 1회 통과 뒤 재덤프로 확인했다. 원본 로그
`resource/logs/d-regress/npcdump_20260802.log` · 전체 덤프
`resource/logs/d-regress/npcdump-20260802-{new,post-offseason}.json`(미추적).

### 1. 나이대별 군필률·계약 상한

| 확인 | 대상 | 실측 | 기대 | 판정 |
|---|---|---|---|---|
| 26~28세 군필률 | 906명(active) | 64.2% | 60% | 근접 — 정상 범위로 본다 |
| 29세+ 군필률 | 1,105명(active) | 84.4% | 100% | 🔴 **15.6%p 미달** — 29세 이상인데 미필/현역인 NPC가 섞여 있다 |
| 33세+ 계약 ≤2년 | 계약보유 323명 | 위반 183건(56.7%) | 위반 0 | 🔴 **과반이 위반** |
| 36세+ 계약 ≤1년 | 계약보유 55명 | 위반 40건(72.7%) | 위반 0 | 🔴 **대다수가 위반** |

- 26~28세는 목표에 근접했지만, **29세 이상이 100%에 15.6%p 못 미친다** — 이
  나이면 예외(면제) 없이 전원 군필이어야 하는데 새 게임 생성 시점부터
  이미 그렇지 않다. 생성 규칙(`generation_rules.json` 군 복무 배정)을 볼 자리다.
- 계약 상한 위반은 **건수가 아니라 비율**이 크다 — 33세+ 는 절반 이상,
  36세+ 는 4명 중 3명이 상한을 넘는 계약을 들고 새 게임을 시작한다.
  `estimate_salary_and_contract`(Rust)가 나이를 계약 기간 상한에 반영하지
  않거나, 반영해도 새 게임 초기화 경로가 그 함수를 안 거치는 것으로 보인다
  — 판단은 A 몫.

### 2. `careerHistory` 마지막 팀 대 현재 소속 일치율

| 시점 | 이력 있는 NPC | teamId 일치 | 일치율 |
|---|---|---|---|
| 새 게임 직후 | 2,560명 | 2,560 | **100.0%** |
| 오프시즌 1회 뒤 | 6,289명 | 5,484 | **87.2%** |

- 새 게임 시점은 완전히 깨끗하다. 오프시즌을 한 번 지나면서 불일치가
  12.8%(805명) 생긴다.
- 불일치 표본 10건이 전부 **독립리그 팀 통폐합·이적**(`TEAM_IND_*` 재편) ·
  드래프트 이적(`TEAM_HS_*`→`TEAM_KBL_*`) · 2군 승격(`_2`→`_1`) 류다 —
  전부 이번 오프시즌에 실제로 일어난 이동이라 **결함이라기보다 시차**일
  개연성이 크다: `careerHistory`는 연간 스탯 라인을 연말에 한 번 적는데,
  트레이드·드래프트·팀 재편은 그 직후 소속만 먼저 바뀌고 이력 행은 다음
  시즌 종료까지 안 생기는 구조라면 이 정도 격차는 "정상 시차"다. **판단은
  A 몫** — `careerHistory`를 소속 변경 즉시 갱신할지, 연말에만 쓸지는
  설계 선택이지 이 실측만으로는 결함 여부를 못 가른다.

### 3. `transactions`(league_transactions) 종류별 집계

| 시점 | 총건수(cap 1000) | 종류별 |
|---|---|---|
| 새 게임 직후 | 1,000 | release 142 · foreign_signing 30 · trade 729 · fa 99 |
| 오프시즌 1회 뒤 | 1,000 | military 48 · fa 269 · retirement 7 · trade 451 · draft 110 · release 85 · foreign_signing 30 |

- 조회는 `id DESC LIMIT 1000`(최신순) — 새 게임 시점의 1,000건은 **세계
  생성 배경 서사**(과거 시즌 압축 생성)이고, 오프시즌 뒤 1,000건은 그 위에
  **이번 오프시즌 실제 처리**(트레이드 451 · FA 269 · 방출 85 · 드래프트
  110 · 군입대 48 등)가 섞여 최신 것부터 잘린 값이다. 실제 총량은 이보다
  많다 — cap 1000 을 넘는지는 `--limit` 없이 카운트 전용 쿼리가 있어야
  정확히 잰다(이번 실측 범위 밖).

### 4. `careerEvents` 집계 (1 오프시즌 뒤 · 2026년분)

```
position_change 132 · draft_picked 110 · trade 24 · waiver_claim 134 ·
retirement 39 · fa_signed 1038 · quit_baseball 358 · release 22 ·
transfer 9 · draft_undrafted 495
```

- `fa_signed`(1,038)·`draft_undrafted`(495)·`quit_baseball`(358) 가 압도적으로
  많다 — 신인 드래프트 미지명과 그로 인한 은퇴·야구 포기가 시즌마다
  대량으로 발생하는 구조다(기존 `HANDOFF_B_TO_A`의 "고교 졸업생 30명 중
  21명이 5시즌 안에 그만둔다" 실측과 결이 같다).
- `trade`(24) 는 `transactions` 표의 `trade`(451)보다 훨씬 작다 — `careerEvents`
  는 주인공 관점이 아니라 NPC 개인 이력에 남긴 이벤트만 세고,
  `transactions` 는 로그 테이블 전체를 세므로 **모집단이 다르다**(당연한
  차이 — 결함 아님).

### 5. `OffseasonEvent` kind 집계 (1 오프시즌 뒤)

```
indie_age_retire 9 · fa_unsigned 327 · fa_rehome 315 · fa_contract 95 ·
fa_independent 9 · fa_unsigned_retire 3 · retire_age 27 · demote_roster 58 ·
release_roster 111 · promote 14 · demote_fielder 8 · release_score 147 ·
retire_no_team 358
```

- `retire_no_team`(358)·`fa_unsigned`(327)·`fa_rehome`(315)·`release_score`
  (147) 순으로 크다 — 오프시즌 결산 소식의 절대다수가 "밀려난" 쪽 사건이다.
  이 분포가 기획 의도인지(리그가 좁아 탈락이 많은 게 정상)는 A·기획 판단.

## 요약 (D → A)

1. **29세+ 군필률 미달(84.4%)** 과 **33/36세+ 계약 상한 대량 위반**은
   실측으로 확인된 값 결함 후보다 — 생성 규칙 또는 계약 산식 확인 필요.
2. `careerHistory` 87.2% 일치율은 시차 가능성이 커서 결함 단정 보류.
3. `transactions`·`careerEvents`·`OffseasonEvent` 집계는 전부 정상 작동
   확인(0건·미배선 없음) — 계측 인프라 자체는 건강하다.

---

## 2026-09-04 A 재확인 — 「D 실측」 셋 중 둘은 계측 쪽이었다

D 덤프(§D 실측)의 세 줄을 `track/engine`(트렁크 2ba6526a6 병합본 · `.node` 는
a6715c00c 시각 빌드)에서 다시 쟀다. **씨앗 20260802 · `scripts/probe-npc-dump.cjs`.**

| D 가 적은 것 | A 재측 | 판정 |
|---|---|---|
| 29세+ 군필 84.4% (규칙 100%) | **한국인 172명 100.0%** | 계측 결함 — 아래 |
| 26~28세 (규칙 60%) | 87.0% → **한국인 324명 63.6%** | 같은 계측 결함 |
| 33세+ 계약 3년 이상 57% | **위반 0건** (계약보유 323명) | `.node` 문제 — D 트리 1번이 「.node 재빌드」를 아직 안 했다 |
| 36세+ 2년 이상 73% | **위반 0건** (55명) | 같음 |

🔴 **계측이 외국인의 「면제」를 군필로 세고 있었다.** 병역 규칙
(`roster_gen.past_service_of`)은 **한국인에게만** 걸리고 외국인은 무조건
「면제」인데 덤프는 전원을 한 통에 넣었다 — 29세+ 1105명 중 **933명이
비한국인**(ABL·JBL 로스터)이었다. 국적을 덤프에 실어 한국인만 세게 고쳤다
(커밋 `19e6c94bf`).

난수도 따로 봤다 — `hash_str(npcId) ^ 0x4D494C54` 의 첫 뽑기는 240표본에서
60.4% 다. 치우침이 아니다.

**결론: 초기 생성 경로에 고칠 자리가 없다.** 새 규칙 둘(`contractYearsMaxByAge`
· `militaryRules.pastService`)은 `roster_gen` → `estimate_salary_and_contract`
· `past_service_of` 로 이미 전 리그에 닿고 있다.
