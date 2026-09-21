# 해외 구단 0단계 실측 — ABL·JBL 성향·구장 (2026-09-22 · A)

> 계획 `PLAN_OVERSEAS_CLUBS_2026-09-22.md` 의 0단계. 사용자 확정 ⓐ 통일 · ⓑ 그림 안 그린다.
> **이번 턴은 아무것도 안 고쳤다.** 재서 적는다.
>
> 잰 트리 `f841dc5c9` + 이 문서의 프로브. `npm run check:native` 초록.
> 프로브 `scripts/probe-overseas-baseline.cjs`(`npm run probe:overseas`) ·
> 원자료 `runs/overseas-stage0/`(gitignore 밖이면 안 싣는다 — 재현은 명령으로).

## 한 장 요약

| # | 절 | 결론 한 줄 |
|---|---|---|
| 1 | `proTeamProfile` | **JBL 은 기본값이 아니다 — 예산 지수 파생이다.** 계획 ⓐ 의 전제가 틀렸다. 기본값(전 항목 50)을 받는 프로 팀은 **0팀**이다 |
| 2 | 파생 vs 손수 | 파생 함수는 **성향→12항목 표가 아니라 예산 지수 한 축의 1차식**이다. 「성향으로 역산」은 **불가**. 대신 손수값이 함축하는 예산 지수를 역산했고 **16팀 중 6팀이 실제 예산과 반대**다 |
| 3 | `parkDims` | **배경 리그 한 경로만 받는다.** 주인공 본인 경기도, 주인공 리그 NPC 경기도 안 받는다 — KBL 도 같이 틀렸다. 해외 구장을 채워도 **주인공이 해외에 가면 여전히 중립**이다 |
| 4 | 기준선 | ABL·JBL 28팀이 담장 `98.4/122.1/98.6/3.1` **한 벌로** 3시즌을 돌았다. 팀별 HR/G·ERA 표를 남겼다(고치기 전) |
| 5 | 화면 | 구장 문자열 → id 로 바꿔도 **깨지는 화면은 없다**(이름을 표에서 찾는 자리가 전부 `?? id` 폴백). 대신 `parkView.test.ts` 검사 **둘이 빨강**이 된다 |
| 6 | 게이트 | 초안 둘 다 지금 트리에서 **빨강 · 각각 56팀**. 붙일 자리는 `apps/ui/src/shared/utils/__tests__/parkView.test.ts` |

---

## 1. `proTeamProfile` — 없는 팀은 무엇을 받나

**가설**: 계획 §0 과 `seasonRollover.ts:296` 주석대로 JBL 12팀은 `DEFAULT_TEAM_PROFILE`(전 항목 50)을 받는다.

**잰 방법**: 읽는 자리를 전수로 따라가고, 새 게임을 헤드리스로 부팅해 실제 값을 찍었다.

### 읽는 자리 — 전수

| 자리 | 무엇을 하나 |
|---|---|
| `stores/master.ts:214` | 타입 `TeamRef.proTeamProfile?` — **optional** 이라 없어도 tsc 가 안 잡는다 |
| `stores/game.ts:311` `deriveProfileFromBudgetIndex(idx)` | **파생 함수 정본.** 예산 지수 하나에서 12항목을 만든다 |
| `stores/game.ts:375` `profilesFromMaster()` | ① 마스터에 적힌 값 → ② 없으면 예산 파생 → ③ 2군은 1군 물려받기. **새 게임이 여기서 채운다**(`game.ts:4038`) |
| `stores/game.ts:1757` `initProTeamProfiles(teams)` | `App.svelte:68`·`perfEntry` 가 부른다. **적힌 값만 옮긴다 — 파생을 안 돌린다** |
| `usecases/weekPhases/market.ts:161` `getTeamProfile` | 스토어 → 마스터 → `null`. `null` 이면 호출부가 `DEFAULT_TEAM_PROFILE` 로 떨어진다(9자리) |
| `usecases/seasonRollover.ts:371` | 시즌 성적으로 `winNowPressure` 를 갱신 — **개성이 생기는 유일한 경로** |
| `utils/faEngine.ts:133` | 주인공 FA 제안용. **스토어만 본다** — 없으면 Rust 기본값 |
| `usecases/clubFinance.ts:178` | `marketAppeal`·`prestige` → 관중·스폰서 |
| Rust `npc_sim.rs:1341·1451·2681` | `profiles.get(team).cloned().unwrap_or_default()` — **없으면 Rust 쪽 전 항목 50** |

### 실측 — 새 게임 헤드리스 부팅(씨앗 20260802 · 777 · 31337)

| 리그 | 1군 | `proTeamProfile` 적힘 | `history.budget>0` | 실제 출처 |
|---|---|---|---|---|
| KBL | 10 | **0** | 10 | **예산 파생** |
| ABL | 16 | **16** | 16 | **손수 적은 값** |
| JBL | 12 | **0** | 12 | **예산 파생** |

값 예(2028시즌 · 씨앗 20260802 · 12항목 순서는 `ownerSpending·prestige·market·scouting·medical·development·farm·winNow·patience·stability·discipline·clubhouse`):

```
JBL_CL_NEONCRANES_1    예산파생  70 66 66 62 62 34 38 65.2 38 50 50 50
JBL_PL_THUNDERFALCONS_1 예산파생  21 27 27 33 33 73 67 33   67 50 50 50
ABL_EMPIRE_1           손수      90 88 85 84 84 30 58 85.0 38 72 68 65
KBL_SEOUL_ROYALS_1     예산파생  75 70 70 65 65 30 35 70.0 35 50 50 50
```

**세이브 왕복**: 세 씨앗 모두 `hydrateFromSlot(toSaveGame())` 뒤 성향·구장 칸이 **하나도 안 바뀌었다**(바뀐 칸 0). `proTeamProfilePersist.test` 가 지키는 대로다.

**⚠ 계획 문서와 `seasonRollover.ts:296` 주석이 둘 다 뒤처져 있다.** 「JBL 은 기본값」「전 팀이 `DEFAULT_TEAM_PROFILE`」은 파생이 들어오기 **전**의 기록이다. 기본값으로 떨어지는 프로 팀은 지금 **0팀**이다(2군 포함 — `_2` 는 `_1` 을 물려받는다).

**결론**: JBL 이 빈 것은 성향 **값**이 아니라 **손수 적은 근거**뿐이고, 값 자체는 예산 한 축에서 나온 1차식이라 12항목이 **서로 완전히 상관**한다.

---

## 2. 파생 vs 손수 — ABL 16팀 × 12항목

**가설**(계획 §2): 파생 함수에 「성향(철학·자원·지위) → 12항목」 표가 있고, ABL 손수값을 거기 역으로 대면 팀별 후보 성향이 나온다.

**잰 방법**: `deriveProfileFromBudgetIndex` 를 읽고, `traits` 를 실제로 읽는 자리를 전수로 찾았다.

### 🔴 역산 불가 — 그런 표가 없다

파생 함수는 **성향을 안 본다.** 입력이 예산 지수 `idx` **하나**이고, 12항목은 그 한 축의 1차식이다:

```
at(span) = clamp(round(50 + (idx - 1) * span), 5, 95)

ownerSpendingWillingness at( 50)   developmentFocus at(-40)   stability        50
prestige                 at( 40)   farmInvestment   at(-30)   discipline       50
marketAppeal             at( 40)   winNowPressure   at( 30)   clubhouseCulture 50
scoutingQuality          at( 30)   ownerPatience    at(-30)
medicalQuality           at( 30)
```

`traits` 를 읽는 자리도 성향→12항목이 아니다 — **두 곳뿐이고 둘 다 로스터 생성용**이다:

| 읽는 곳 | 무엇을 내나 | 없으면 |
|---|---|---|
| `repo/newGameV3.ts:309` `squadPlanOf` | `resource` → `spendRatio`(궁핍 1.0 · 안정 0.85 · 알뜰 0.75 · 부유 0.9) · `philosophy` → `qualityBias`(`QUALITY_BY_PHILOSOPHY` 12값 0.2~0.75) | `spendRatio` 는 `undefined`(엔진 옛 동작) · `qualityBias` 는 `power` 로 떨어진다(0.3~0.7) |
| `repo/staffGen.ts:112` | `resource` → 스태프 생성 | `"안정"` |
| `traits.status` | — | **소비처 0건.** 타입에만 있다(`master.ts:211`) |
| `colorLabel` | — | **소비처 0건.** `scripts/check-teamcolors.cjs` 만 본다 |

**그래서 「12항목 → 성향」 역산은 성립하지 않는다.** 12항목과 성향은 서로 다른 소비자를 갖고 겹치는 식이 없다.

### 대신 잰 것 ① — 손수값이 함축하는 예산 지수

12항목 중 움직이는 9개는 각각 `idx` 의 1차식이므로 **거꾸로 풀 수 있다**: `idx = (값 - 50)/span + 1`.

| 팀 | 실제 지수 | 함축 지수 중앙 | 함축 최소~최대 | 파생과 20 이상 어긋난 항목 |
|---|---|---|---|---|
| EMPIRE | 1.40 | 1.80 | 0.73~2.13 | ownerSpending(90↔70) prestige(88↔66) scouting(84↔62) medical(84↔62) farm(58↔38) |
| HARBORHAWKS | 0.89 | **1.60** | 0.67~2.00 | ownerSpending(78↔44) prestige(82↔45) market(75↔45) scouting(80↔47) medical(80↔47) winNow(68↔47) |
| LAKESPIRITS | 0.94 | 0.70 | 0.33~0.87 | development(72↔52) |
| LONESTARS | 0.99 | 1.15 | 0.83~1.40 | — |
| MOTORWOLVES | 1.05 | 0.93 | 0.67~1.20 | — |
| WAVERIDERS | 0.84 | 1.13 | 0.83~1.33 | — |
| RAINARROWS | 1.21 | 1.05 | 0.60~1.33 | — |
| WINDBEARS | **0.40** | **1.50** | 0.73~1.87 | ownerSpending(75↔20) prestige(78↔26) market(72↔26) scouting(76↔32) medical(76↔32) development(40↔74) winNow(65↔32) patience(45↔68) |
| MOUNTAINPEAKS | 1.10 | 0.95 | 0.57~1.27 | — |
| SPACECOMETS | 0.75 | 1.13 | 0.73~1.33 | ownerSpending(58↔38) |
| SUNDRAGONS | **0.80** | **1.76** | 0.80~2.07 | ownerSpending(88↔40) prestige(85↔42) market(88↔42) scouting(82↔44) medical(82↔44) development(32↔58) winNow(72↔44) |
| DESERTSERPENTS | **1.33** | **0.73** | 0.43~0.80 | ownerSpending(38↔66) prestige(36↔63) market(40↔63) development(70↔37) winNow(33↔60) patience(65↔40) |
| COASTALRAYS | **1.26** | **0.70** | 0.33~0.80 | ownerSpending(35↔63) prestige(38↔60) development(74↔40) winNow(30↔58) patience(70↔42) |
| BAYSEALS | 1.19 | 1.20 | 0.67~1.50 | — |
| RIVERCARDINALS | 0.71 | 0.72 | 0.40~0.83 | — |
| PEACHTREEFALCONS | 1.15 | 1.05 | 0.60~1.33 | — |

**읽는 법**: 함축 지수의 폭이 좁으면 손수값이 **한 축으로 지어졌다**는 뜻이다(대부분 그렇다). 실제 지수와 함축 지수가 **반대로 벌어진 팀이 여섯**이다 — HARBORHAWKS · WINDBEARS · SUNDRAGONS(손수는 부유·명문인데 예산은 가난) · DESERTSERPENTS · COASTALRAYS(손수는 육성·인내인데 예산은 부유) · EMPIRE(손수가 예산보다 더 세다).

**⚠ 통일(ⓐ)하면 이 여섯 팀의 성격이 뒤집힌다.** 나머지 열은 평균차 5.8~11.3 이라 바뀌어도 티가 안 난다.

### 대신 잰 것 ② — 세 축이 전 구단 50 으로 눌린다

파생은 `stability`·`discipline`·`clubhouseCulture` 를 **항상 50** 으로 둔다. 지금 KBL 10 + JBL 12 = **22팀이 그 세 축에서 완전히 같다.** 그 세 축을 읽는 갈래는 이렇다:

| 자리 | 조건 | 지금 발동하는 팀 |
|---|---|---|
| `team_engine.rs:344` 콜업 | `stability < 40` → +8 | **0팀** |
| `team_engine.rs:345` 콜업 | `stability > 70` → −5 | ABL EMPIRE(72) · HARBORHAWKS(70 → 미발동) → **1팀** |
| `team_engine.rs:729` FA | `prestige>60 && stability>60` → 트레이드 거부권 | ABL 4팀(EMPIRE·HARBORHAWKS·SUNDRAGONS·WINDBEARS) |
| `team_engine.rs:733` FA | `stability>65` → 계약 연수 늘림 / `<35` → 줄임 | ABL 3팀(72·70·68) |
| `player_engine.rs:646` 주인공 FA | 같은 조건 | 같은 3팀 |
| `team_engine.rs:632` 방출 | `discipline > 70` → 프로 의식 낮은 선수 +25 | **0팀**(전 구단 최대 68) |
| `team_engine.rs:794` 은퇴 권고 | `discipline > 70` → +8 | **0팀** |

🔴 **`discipline > 70` 은 게임 전체에서 한 번도 안 걸린다.** 통일하면 `stability` 쪽 갈래 넷도 같이 0팀이 된다 — 살아 있는 코드가 죽은 갈래가 된다.

### B 의 ① 근거 표 — 성향을 고를 재료

`traits` 를 고를 근거는 12항목이 아니라 **`profile` 과 `history`** 다. ABL·JBL 에는 KBL 에 없는 칸이 있다(KBL 은 전부 `undefined`):

| 칸 | KBL | ABL | JBL |
|---|---|---|---|
| `traits`(철학·자원·지위) | ✅ 10/10 | ❌ | ❌ |
| `profile.prestige`(S~D) · `fanBase` · `facilityLevel` · `funding` · `mediaPressure` | ❌ | ✅ | ✅ |
| `history.titleYears`(우승 연도 목록) · `peakEra` · `summary` · `recentRecords` | ❌ | ✅ | ✅ |
| `history.seasonRanks`(최근 5시즌) · `titles` | ✅ | ❌(`titles` 는 빈 배열) | ❌ |

**즉 같은 뜻이 두 모양으로 갈려 있다** — KBL 은 `traits`, 해외는 `profile`+`history`. 통일의 진짜 대상은 여기다.

#### ABL 16팀 — 근거

| 팀 | ★ | 예산지수 | 우승 | prestige | fanBase | funding | 시설 | 미디어 | 전성기 |
|---|---|---|---|---|---|---|---|---|---|
| EMPIRE | 5 | 1.40 | 11 | S | 메가 | 최상 | 5 | 극심 | 1990년대 왕조 |
| DESERTSERPENTS | 5 | 1.33 | 1 | B | 광역 | 상 | 4 | 보통 | 2001 창단 4년 만의 우승 |
| COASTALRAYS | 5 | 1.26 | 0 | B | 지역 | 상 | 3 | 보통 | 2002 준우승이 최고 |
| RAINARROWS | 4 | 1.21 | 1 | A | 광역 | 상 | 4 | 높음 | 2001 정규 116승 |
| BAYSEALS | 5 | 1.19 | 5 | A | 광역 | 상 | 4 | 높음 | 2010년대 홀수해 왕조 |
| PEACHTREEFALCONS | 4 | 1.15 | 2 | A | 광역 | 상 | 4 | 높음 | 14년 연속 지구 우승 |
| MOUNTAINPEAKS | 4 | 1.10 | 1 | A | 지역 | 상 | 4 | 높음 | 2007 고지대 |
| MOTORWOLVES | 4 | 1.05 | 4 | B | 지역 | 상 | 3 | 보통 | 1968 |
| LONESTARS | 4 | 0.99 | 5 | A | 광역 | 상 | 5 | 높음 | 2020년대 왕조 |
| LAKESPIRITS | 4 | 0.94 | 2 | B | 지역 | 상 | 3 | 보통 | 1948 |
| HARBORHAWKS | 4 | 0.89 | 9 | S | 전국 | 최상 | 5 | 극심 | 2004 저주 종식 |
| WAVERIDERS | 3 | 0.84 | 2 | B | 지역 | 상 | 4 | 보통 | 1997 신생팀 기적 |
| SUNDRAGONS | 3 | 0.80 | 7 | S | 메가 | 최상 | 5 | 극심 | 1960년대 투수 왕조 |
| SPACECOMETS | 3 | 0.75 | 3 | A | 광역 | 상 | 5 | 높음 | 2017 |
| RIVERCARDINALS | 3 | 0.71 | 11 | A | 전국 | 상 | 4 | 높음 | 내셔널 최다 우승 |
| WINDBEARS | 2 | 0.40 | 6 | A | 전국 | 상 | 4 | 높음 | 2016 108년 만의 우승 |

#### JBL 12팀 — 근거

| 팀 | ★ | 예산지수 | 우승 | prestige | fanBase | funding | 시설 | 미디어 | 전성기 |
|---|---|---|---|---|---|---|---|---|---|
| CL_NEONCRANES | 5 | 1.40 | 22 | S | 메가 | 최상 | 5 | 극심 | V9 왕조 |
| CL_IRONSTORMS | 5 | 1.32 | 3 | B | 지역 | 중 | 3 | 보통 | 2016 자체 육성 |
| CL_IRONDRAKES | 5 | 1.25 | 2 | A | 광역 | 상 | 4 | 높음 | 2007 52년 만 |
| PL_POLARBEARS | 4 | 1.16 | 2 | A | 광역 | 상 | 4 | 높음 | 2016 창단 12년 만 |
| PL_MARINESOLDIERS | 4 | 1.10 | 2 | B | 지역 | 중 | 3 | 보통 | 규슈 더비 |
| CL_TIDERAVES | 4 | 1.05 | 3 | B | 광역 | 중 | 3 | 보통 | 1998 외국인 타선 |
| CL_TEMPOSTINGS | 4 | 0.99 | 6 | S | 메가 | 최상 | 5 | 극심 | 1985 |
| CL_SILVERWOLVES | 4 | 0.93 | 1 | B | 지역 | 중 | 3 | 보통 | 1992 |
| PL_SUNS | 3 | 0.84 | 0 | C | 지역 | 중 | 2 | 보통 | 2019 첫 3위 |
| PL_SPIRITBUFFALOS | 3 | 0.79 | 1 | B | 지역 | 중 | 3 | 보통 | 2011 |
| PL_SEAGULLS | 3 | 0.75 | 0 | C | 지역 | 중 | 2 | 보통 | 2018 첫 CS |
| PL_THUNDERFALCONS | 2 | 0.43 | 8 | S | 전국 | 최상 | 5 | 극심 | 2010년대 퍼시픽 지배 |

🔴 **`power`·`budget` 과 `prestige`·`titleYears` 가 어긋난 팀이 넷이다** — ABL WINDBEARS(★2 · 0.40 인데 우승 6 · A · 전국) · ABL SUNDRAGONS(0.80 · S · 우승 7) · ABL HARBORHAWKS(0.89 · S · 우승 9) · JBL THUNDERFALCONS(★2 · 0.43 인데 우승 8 · S · 최상 · 전국). **지위를 「명문」으로 주면 ★2 와 모순된다.** B 가 성향을 고를 때 이 넷은 사용자에게 물어야 한다.

**참고 — KBL 10팀 분포**(새 값을 만들지 말고 이 안에서 고른다): 철학 공격야구4·육성중심4·전통정통4·스몰볼2·젊은피2·투수왕국2·데이터중심2(2군 포함 20) · 자원 안정7·부유2·알뜰1 · 지위 중견3·명문2·엘리트2·언더독1·슈퍼스타1·신흥1.

**결론**: 성향→12항목 표는 없으므로 역산은 불가다. 손수값은 **예산 한 축을 손으로 흉내 낸 것**이고 여섯 팀에서 실제 예산과 반대 방향이다 — 통일하면 그 여섯이 뒤집히고, `stability`·`discipline` 을 읽는 갈래 여섯이 죽는다.

---

## 3. `parkDims` 가 해외 경기에 닿나

**가설**(계획 §0): 배경 리그(`backgroundLeague.ts:61`)가 `parkRefs` 를 받나만 보면 된다.

**잰 방법**: `simulateGame(` 호출부를 전수로 읽고, Rust 쪽 소비 자리를 따라갔다. 계측으로는 §4 의 팀별 담장 칸(전 팀 동일)을 확인했다.

### 배선 — 전수

| 호출부 | `parkDims` 를 넘기나 | 무엇을 도나 |
|---|---|---|
| `stores/backgroundLeague.ts:61` (`runSimBatch`) | ✅ `parkDimsForHomeTeam(home, parkRefs.teams, parkRefs.stadiums)` | 배경 리그 전부(ABL·JBL 포함) |
| `stores/season.ts:820` | ✅ `{ teams: mst.teams, stadiums: mst.stadiums }` 를 넘긴다 | 위로 들어가는 유일한 입구 |
| `usecases/simulateSkippedGame.ts:76` | ✅ `runSimBatch` 로 넘긴다 | 건너뛴 경기 되메우기 |
| `usecases/weekPhases/games.ts:63` `simulateNpcGame` | ❌ | **주인공 리그의 다른 팀 경기** |
| `usecases/advanceWeek.ts:2214` | ❌ | 넉아웃 무승부 재경기 |
| `usecases/advanceWeek.ts:2824 · 2903 · 3253` | ❌ | **주인공 리그 경기 세 갈래** |
| `usecases/applyGameOutcome.ts:331` | ❌ | 주인공 경기 기록 보강 |
| `pages/match/MatchPage.svelte:896 · 1253` (`matchStart`) | ❌ (`park`(4종)만 넘긴다) | **주인공이 직접 던지는 경기** |

### Rust 쪽

```
types.rs:978   MatchOptions.park_dims: Option<ParkDims>   #[serde(default)]
match_engine.rs:576  park_dims: opts.park_dims.unwrap_or_default()
types.rs:566   impl Default for ParkDims → { lf 98.4, cf 122.1, rf 98.6, fence 3.1 }
match_engine.rs:1100 fence_for(zone) → LF→lf · RF→rf · 그 밖→cf
npc_sim.rs     park_dims 참조 0건 — 간이 시뮬 경로는 담장을 아예 안 본다
```

`FULL_ENGINE_LEAGUES`(`gameSimulator.ts:383`)에 `LEAGUE_ABL`·`LEAGUE_JBL`·`LEAGUE_KBL`·`LEAGUE_KBL_FARM` 이 들어 있으므로 프로 경기는 `match_engine` 을 탄다 — **담장이 실제로 쓰이는 경로는 맞다.**

### 해외 팀의 `stadium` 이 문자열일 때

`utils/parkDims.ts:38` `parkDimsForHomeTeam` 은 `stadiums.find(x => x.id === t.stadium)` 이 없으면 `NEUTRAL_DIMS` 를 낸다. ABL 32 + JBL 24 = **56팀 전부** 표에 없다(§5). 그래서 배경 리그로 돌아도 전 팀이 중립이다 — §4 표의 `lf/cf/rf/fence` 칸이 그 증거다.

### 🔴 정본이 넷이다

「어떤 구장이 있고 치수가 얼마인가」가 네 곳에 있다:

| 곳 | 무엇을 갖나 | 27개 |
|---|---|---|
| `resource/data/master/entities/refs.json` `stadiums` | `id·name·parkFactor·capacity·dist` | ✅ |
| `resource/park/_spec/stadiums.json` | `id·name·tier·pf·dist·teams·city·color` | ✅ **겹치는 칸(name·pf·dist)은 지금 0칸 차이** |
| `apps/ui/src/shared/utils/parkAnchors.ts` `PARK_TIER_OF` | id → 티어 | ✅ |
| 같은 파일 `PARK_IMAGES` | id 집합 | ✅ |

그리고 중립 기본값이 **둘**이다 — `utils/parkDims.ts:25` `NEUTRAL_DIMS` 와 Rust `types.rs:569` `ParkDims::default()`. 값은 같고 TS 주석이 「엔진 기본값과 같아야 한다」고 적고 있지만 **기계가 보는 검사는 없다.**

**결론**: 계획이 본 자리(`backgroundLeague.ts:61`)는 이미 옳다. 진짜 구멍은 **주인공 쪽 다섯 자리 + `matchStart`** 이고, 이건 해외만의 문제가 아니라 **KBL 도 같이 틀렸다** — 지금 주인공은 어느 구장에서 던져도 중립 담장이다.

---

## 4. 해외 리그 기준선 — 고치기 전

**가설**: ABL·JBL 팀별 HR/G·ERA 가 이미 갈려 있다면 구장 때문이 아니라 전력 때문이다.

**잰 방법**: 있는 도구를 먼저 봤다 — `overseasProbe`(리그 단위 인원·평균OVR·순위표), `faIntakeTally`(팀별 FA 계약), `leagueSummary`(리그 단위 일정·승수)가 있고 **팀별 HR/ERA 를 내는 것은 없었다.** 그래서 짧은 프로브 하나를 만들었다.

```
npm run probe:overseas                      # 기본 씨앗 셋 × 3시즌
PF_SEEDS=20260802 PF_YEARS=3 npm run probe:overseas
```

- `scripts/probe-overseas-baseline.cjs` + `scripts/perf/perfEntry.ts` 의 `overseasClubBaseline()`.
- 주인공은 고교에 둔다 — 해외는 반경 1(항상 풀 시뮬)이라 주인공과 무관하게 돈다(`radiusGate.ts`). 진로를 밀면 씨앗마다 세계가 달라져 전후 비교가 안 된다.
- 씨앗 20260802 · 777 · 31337 × 2026·2027·2028 세 시즌 **전부 완주**(리그 일정 6,012경기 × 3시즌 × 3씨앗). 아래는 9판 평균.
- 원자료 `runs/overseas-stage0/<씨앗>.json` · 합본 `merged.json`.

### ⚠ 관중은 못 쟀다 — 왜

`clubFinance.ts` 가 `calcClubRevenueNative` 로 `attendanceRate`·`attendanceTotal` 을 **받기는 하는데 읽는 코드가 0건**이다(전수 grep). 상태에도 화면에도 안 남는다. 대신 그 네 입력 중 **수용 인원**을 표에 넣었고, 나머지 셋(승률 · `marketAppeal` · `prestige`)도 같은 표에 있다 — 넷이 같으면 관중도 같다.

### KBL 10 — 대조군(구장이 이미 채워져 있다)

| 팀 | ★ | 성향출처 | 구장표 | lf/cf/rf/fence | 승률 | HR/G | ERA | FA영입 | 수용 |
|---|---|---|---|---|---|---|---|---|---|
| SEOUL_ROYALS | 5 | 예산파생 | O | 99/124/97/3.5 | 0.615 | 1.01 | 3.89 | 11.11 | 23000 |
| SUWON_KNIGHTS | 4 | 예산파생 | O | 94/116/96/3.2 | 0.591 | 1.09 | 4.08 | 10.78 | 20000 |
| CHANGWON_STARS | 4 | 예산파생 | O | 100/126/103/4.3 | 0.582 | 0.75 | 3.83 | 11.00 | 22000 |
| SEOUL_GUARDIANS | 4 | 예산파생 | O | 103/123/102/3.5 | 0.527 | 0.86 | 4.52 | 9.78 | 16000 |
| GWANGJU_PANTHERS | 4 | 예산파생 | O | 95/120/94/2.6 | 0.504 | 0.94 | 4.49 | 10.33 | 20500 |
| DAEGU_SABERS | 3 | 예산파생 | O | 103/127/102/4.6 | 0.480 | 0.70 | 4.49 | 9.44 | 24000 |
| SEOUL_COBRAS | 3 | 예산파생 | O | 97/120/94/2.6 | 0.449 | 0.82 | 4.83 | 9.44 | 23750 |
| INCHEON_SHARKS | 3 | 예산파생 | O | 97/121/101/2.8 | 0.422 | 0.70 | 4.86 | 8.67 | 23000 |
| BUSAN_WAVES | 3 | 예산파생 | O | 96/120/97/2 | 0.422 | 0.74 | 4.51 | 6.78 | 22990 |
| DAEJEON_PHANTOMS | 2 | 예산파생 | O | 99/124/97/3.6 | 0.408 | 0.69 | 4.65 | 4.44 | 17000 |

**퍼짐**: HR/G 0.69~1.09(폭 0.41) · ERA 3.83~4.86(폭 1.03) · 승률 0.408~0.615

### ABL 16 — 구장 전부 중립

| 팀 | ★ | 성향출처 | 구장표 | lf/cf/rf/fence | 승률 | HR/G | ERA | FA영입 | 수용 |
|---|---|---|---|---|---|---|---|---|---|
| DESERTSERPENTS | 5 | 손수 | **X** | 98.4/122.1/98.6/3.1 | 0.665 | 1.56 | 4.56 | 10.44 | 48519 |
| BAYSEALS | 5 | 손수 | X | 〃 | 0.637 | 1.46 | 4.73 | 8.00 | 41915 |
| COASTALRAYS | 5 | 손수 | X | 〃 | 0.609 | 1.42 | 5.01 | 10.67 | 40162 |
| EMPIRE | 5 | 손수 | X | 〃 | 0.571 | 1.28 | 4.89 | 14.78 | 52000 |
| MOTORWOLVES | 4 | 손수 | X | 〃 | 0.538 | 1.12 | 4.78 | 11.78 | 41083 |
| RAINARROWS | 4 | 손수 | X | 〃 | 0.521 | 1.07 | 5.04 | 12.56 | 47929 |
| PEACHTREEFALCONS | 4 | 손수 | X | 〃 | 0.518 | 1.07 | 4.98 | 12.00 | 41084 |
| MOUNTAINPEAKS | 4 | 손수 | X | 〃 | 0.501 | 1.11 | 5.57 | 12.78 | 46897 |
| SUNDRAGONS | 3 | 손수 | X | 〃 | 0.492 | 1.00 | 5.26 | 14.00 | 56000 |
| HARBORHAWKS | 4 | 손수 | X | 〃 | 0.488 | 1.22 | 5.65 | 11.67 | 37755 |
| LAKESPIRITS | 4 | 손수 | X | 〃 | 0.480 | 1.04 | 5.86 | 13.78 | 34788 |
| LONESTARS | 4 | 손수 | X | 〃 | 0.469 | 1.08 | 5.36 | 11.56 | 49115 |
| SPACECOMETS | 3 | 손수 | X | 〃 | 0.422 | 0.86 | 5.30 | 14.22 | 41168 |
| WAVERIDERS | 3 | 손수 | X | 〃 | 0.399 | 0.99 | 6.52 | 12.33 | 36742 |
| WINDBEARS | 2 | 손수 | X | 〃 | 0.379 | 0.89 | 6.49 | 13.22 | 41268 |
| RIVERCARDINALS | 3 | 손수 | X | 〃 | 0.311 | 0.84 | 7.12 | 11.44 | 45494 |

**퍼짐**: HR/G 0.84~1.56(폭 0.72) · ERA 4.56~7.12(폭 2.56) · 승률 0.311~0.665

### JBL 12 — 구장 전부 중립

| 팀 | ★ | 성향출처 | 구장표 | lf/cf/rf/fence | 승률 | HR/G | ERA | FA영입 | 수용 |
|---|---|---|---|---|---|---|---|---|---|
| CL_NEONCRANES | 5 | 예산파생 | **X** | 98.4/122.1/98.6/3.1 | 0.667 | 1.40 | 4.37 | 14.56 | 55000 |
| CL_IRONSTORMS | 5 | 예산파생 | X | 〃 | 0.617 | 1.27 | 4.47 | 12.33 | 33000 |
| CL_TEMPOSTINGS | 4 | 예산파생 | X | 〃 | 0.579 | 1.25 | 4.78 | 11.89 | 48000 |
| CL_IRONDRAKES | 5 | 예산파생 | X | 〃 | 0.569 | 1.03 | 4.39 | 12.11 | 40500 |
| CL_TIDERAVES | 4 | 예산파생 | X | 〃 | 0.566 | 1.23 | 4.83 | 11.33 | 34046 |
| PL_POLARBEARS | 4 | 예산파생 | X | 〃 | 0.489 | 0.99 | 5.05 | 10.78 | 41484 |
| CL_SILVERWOLVES | 4 | 예산파생 | X | 〃 | 0.479 | 1.08 | 5.23 | 13.44 | 35000 |
| PL_SPIRITBUFFALOS | 3 | 예산파생 | X | 〃 | 0.455 | 0.92 | 5.29 | 13.44 | 30508 |
| PL_MARINESOLDIERS | 4 | 예산파생 | X | 〃 | 0.449 | 0.99 | 5.57 | 11.33 | 30000 |
| PL_SUNS | 3 | 예산파생 | X | 〃 | 0.406 | 0.81 | 5.20 | 13.44 | 30000 |
| PL_SEAGULLS | 3 | 예산파생 | X | 〃 | 0.384 | 0.77 | 5.78 | 12.22 | 25000 |
| PL_THUNDERFALCONS | 2 | 예산파생 | X | 〃 | 0.341 | 0.68 | 6.00 | 14.00 | 38000 |

**퍼짐**: HR/G 0.68~1.40(폭 0.71) · ERA 4.37~6.00(폭 1.63) · 승률 0.341~0.667

### 읽는 법 — 지금 갈리는 것은 전력이지 구장이 아니다

- 세 리그 모두 HR/G·ERA 가 이미 퍼져 있다. 그건 **★·예산·로스터**가 낸 것이다 — ABL·JBL 은 담장 칸이 소수점까지 똑같다.
- ABL 은 해외 중 ERA 폭이 가장 크다(2.56) — 최하위 RIVERCARDINALS 7.12 는 KBL 최악(4.86)보다 **2점 넘게** 나쁘다. 3단계에서 「구장 때문에 갈렸는지」를 보려면 이 폭 안에서 움직이는지를 본다.
- FA 영입은 해외가 KBL 보다 많다(해외 10.4~14.8 vs KBL 4.4~11.1). **전력★과 상관이 거의 없다** — 지금 FA 는 「필요한 자리」로 가고 성향을 거의 안 탄다. 3단계에서 「부유·명문이 더 데려가는가」를 볼 기준선이 이것이다.
- 🔴 **KBL DAEJEON_PHANTOMS(FA 4.44)와 BUSAN_WAVES(6.78)만 눈에 띄게 적다.** 해외에는 그만큼 낮은 팀이 없다.

**결론**: 해외 28팀은 3시즌 내내 **담장 한 벌**로 뛰었고, 지금 보이는 팀별 차이는 전부 전력·예산에서 왔다.

---

## 5. 화면 전수 — 구장을 문자열 → id 로 바꾸면

**가설**: 구장 이름을 화면이 문자열 그대로 찍고 있어서 id 로 바꾸면 이름이 깨진다.

**잰 방법**: `stadium` 을 읽는 자리를 `pages/`·`features/`·`shared/`·`scripts/` 전수.

### ① 표에서 이름을 찾는 자리 — id 로 바꾸면 **좋아진다**

| 자리 | 코드 | 지금(문자열) | 바꾼 뒤 |
|---|---|---|---|
| `features/team/ui/TeamDetailModal.svelte:46` | `stadiums.find(id)?.name ?? id` | 못 찾아 **문자열을 그대로 찍는다**(우연히 맞다) | 표에서 이름을 찾는다 ✅ |
| `features/team/ui/TeamDetailModal.svelte:57` | `team.capacity>0 ? … : stadiums.find(...)?.capacity` | 팀 `capacity` 가 있어 표를 안 본다 | 그대로 ✅ |
| `pages/league/LeaguePage.svelte:439` | `stadiums.find(id)?.name ?? id.replace(/^STADIUM_/,"")` | **해외에는 안 불린다**(아래 ③) | 그대로 ✅ |
| `features/season-end/ui/SeasonEndModal.svelte:127` | 같은 식 | 같음 | 그대로 ✅ |
| `pages/new-game/NewGamePage.svelte:196` | `stadiums.find(s=>s.id===team.stadium)` | 새 게임은 고교만 고른다 — 해외 무관 | 그대로 ✅ |
| `usecases/advanceWeek.ts:1907` | `stadiumById.get(id)` → 권역 이름 | 고교 권역용 | 그대로 ✅ |
| `usecases/clubFinance.ts:139·200` | 팀 `capacity` 우선, 없으면 표 | 해외는 팀 `capacity` 로 통과 | 그대로 ✅ |
| `usecases/devScenarios.ts:678` | 같은 식 | 진단용 | 그대로 ✅ |

### ② 문자열을 그대로 찍는 자리

**없다.** 전부 ①의 폴백(`?? id` / `?? id.replace(...)`)을 지난다. 그래서 지금 「엠파이어 스타디움」이 화면에 제대로 보이는 것은 **폴백 덕분**이다.

### ③ 성향·구장과 무관한 자리 — 헷갈리기 쉬워 적는다

| 자리 | 왜 무관한가 |
|---|---|
| `utils/standingsGroups.ts:59-70` | ABL·JBL 컨퍼런스는 **팀 ID 규칙**(`_CL_`)으로 가른다(`leagueConferences.ts`). `stadiumName` 을 안 부른다 |
| `utils/hsRegionLabel.ts` | 고교 8권역 전용 표. 해외 id 가 들어갈 일이 없다 |
| `usecases/weekPhases/standingsNews.ts:31` `RegionNamer` | 고교·대학 권역 이름만 |

### ④ 🔴 진짜로 깨지는 자리 — 검사 둘

| 검사 | 지금 | B 가 `stadiums` 에 28개를 넣으면 |
|---|---|---|
| `apps/ui/src/shared/utils/__tests__/parkView.test.ts:149` 「refs의 구장 정의 27개가 전부 티어를 갖는다」 | 초록 | **빨강** — 새 28개가 `PARK_TIER_OF` 에 없다 |
| 같은 파일 `:154` 「티어표와 그림표의 구장 목록이 같다」 | 초록 | `PARK_TIER_OF` 에 28개를 넣으면 **빨강** — `PARK_IMAGES` 도 같이 넣어야 하고 그러면 PNG 28장이 필요하다(⛔ 결정 ⓑ 와 충돌) |
| 같은 파일 `:133` 「국내 팀 전부가 그림 있는 구장에 배정돼 있다」 | 초록(해외 제외) | 그대로 — 국내만 본다 |
| `scripts/check-park.cjs` | 초록 | 그대로 — `resource/park/_spec/stadiums.json` 을 본다(refs 를 안 본다) |

**⇒ 2단계에 반드시 들어가야 할 일**: `PARK_TIER_OF` 와 `PARK_IMAGES` 를 **갈라야 한다**. 「티어는 있는데 전용 그림은 없다」가 지금 표현이 안 된다 — `parkViewOf` 는 이미 `hasOwnImage` 로 그 둘을 나눠 쓰고 있으므로(`parkView.ts:57-61`) 검사 쪽만 고치면 된다(`PARK_IMAGES ⊆ PARK_TIER_OF` 로).

**결론**: 화면은 안 깨진다. 깨지는 것은 검사 둘이고, 그건 ⓑ「그림 안 그린다」를 코드가 아직 표현 못 하기 때문이다.

---

## 6. 게이트 초안 — 지금 빨강인가

**가설**: 두 규칙 다 지금 트리에서 빨강이어야 대조군이 된다.

**잰 방법**: 초안을 임시 파일로 써서 vitest 로 한 번 돌리고 지웠다(커밋 안 함 — 2단계 몫).

```
프로 팀의 stadium 은 stadiums 표의 id 다  →  × 표에 없는 구장 56팀
프로 팀은 traits 셋이 다 있다              →  × 성향 없는 팀 56
```

- 둘 다 **빨강 · 각각 56팀**(ABL 32 + JBL 24 — 1군·2군 전부).
- ⚠ **28 이 아니라 56 이다.** 계획 §1 ②는 「구장 28」이라고 적었는데 2군도 제 구장 문자열을 갖고 있다(예: `엠파이어 팜 파크`). 1군 구장을 물려주든 2군 구장을 따로 정의하든 **B 가 정할 것이 하나 늘었다.**
- 붙일 자리: **`apps/ui/src/shared/utils/__tests__/parkView.test.ts`**. 이미 `refs.json` 의 `teams`·`stadiums` 를 읽고 있고 vitest 라 CI 가 매 push 마다 본다. `scripts/check-teamrefs.cjs` 는 CI 에 안 들어 있다(`.github/workflows/ci.yml` 의 「데이터 위생 검사」는 `check:events`·`tiers`·`lanes`·`rewards` 넷뿐).

**결론**: 대조군이 선다. 2단계에서 이 둘을 `parkView.test.ts` 에 넣고 B 의 데이터가 들어오면 초록이 된다.

---

## 7. 1·2단계를 바꿔야 할 발견

| # | 발견 | 어느 단계 | 무엇을 바꾸나 |
|---|---|---|---|
| A | **JBL 은 기본값이 아니라 예산 파생이다** | 계획 §0·§1 | 「JBL 은 `proTeamProfile` ❌」는 **값이 없다는 뜻이 아니다.** ③(통일)은 JBL 에 대해선 **이미 끝나 있다** — 남은 일은 ABL 손수값을 지우는 것뿐이다 |
| B | **성향→12항목 표가 없다** | §1 ① · §2 ③ | ABL 손수값은 「성향을 고르는 근거」로 못 쓴다(축이 다르다). 근거는 `profile.prestige/fanBase/funding/facilityLevel` 과 `history.titleYears/peakEra` 다 — 그 표를 §2 에 실었다 |
| C | **통일하면 `stability`·`discipline` 갈래 여섯이 죽는다** | 2단계 | 파생은 그 둘을 항상 50 으로 둔다. `discipline>70` 은 지금도 0팀이다. **셋 중 하나를 고른다**: ⑴ 그대로 둔다(죽은 갈래를 알고 남긴다) ⑵ 파생에 두 축을 더한다(밸런스 값 추가 — 사용자에게 물어야 한다) ⑶ 그 갈래를 지운다. **사용자 결정 필요** |
| D | **통일하면 ABL 여섯 팀 성격이 뒤집힌다** | 1단계 | HARBORHAWKS · WINDBEARS · SUNDRAGONS · DESERTSERPENTS · COASTALRAYS · EMPIRE. B 는 이 여섯의 `traits` 를 「예산이 아니라 연혁」 쪽으로 잡아 보정해야 한다 |
| E | **`power`·`budget` 이 `prestige`·우승 횟수와 어긋난 팀이 넷** | 1단계 | WINDBEARS(★2·우승6·S급 팬덤) · SUNDRAGONS · HARBORHAWKS · THUNDERFALCONS(★2·우승8·S). 지위를 명문으로 주면 ★2 와 모순 — **사용자 결정 필요** |
| F | **구장은 28 이 아니라 56 이다** | 1단계 | 2군 구장 문자열이 따로 있다. 1군 것을 물려줄지 따로 정의할지 정한다 |
| G | **`PARK_TIER_OF` ≡ `PARK_IMAGES` 검사가 ⓑ 와 충돌한다** | 2단계 | 검사를 `PARK_IMAGES ⊆ PARK_TIER_OF` 로 완화. 안 하면 28개를 넣는 순간 vitest 빨강 |
| H | **`parkDims` 를 주인공 쪽 여섯 자리가 안 넘긴다** | 2단계(범위 확대) | `games.ts:63` · `advanceWeek.ts:2214·2824·2903·3253` · `applyGameOutcome.ts:331` · `MatchPage.svelte:896·1253`. **KBL 도 같이 틀렸다** — 해외 작업의 곁가지가 아니라 별개 결함이다. 계획 2단계 「`parkDims` 를 해외에 잇는다」는 이걸 포함해야 한다 |
| I | **관중을 아무도 안 읽는다** | 3단계 | `attendanceTotal`·`attendanceRate` 소비처 0건. 3단계에서 「관중이 갈리는가」를 재려면 그 값을 상태에 남기는 일이 먼저다. 아니면 네 입력으로 대신 본다 |
| J | **구장 정본이 넷 · 중립 기본값이 둘** | 2단계 | `refs.json` · `park/_spec/stadiums.json` · `PARK_TIER_OF` · `PARK_IMAGES`. 지금 겹치는 칸은 0칸 차이지만 **기계가 보는 검사가 없다**. 28개를 넣으면 넷 중 몇에 넣을지가 바로 문제가 된다 |
| K | **`traits.status`·`colorLabel` 소비처 0건** | 1단계 | B 가 28팀 × 지위를 적어도 **아무 일도 안 일어난다**(화면에도 안 나온다). 적을 값이지만 「채우면 구단이 갈린다」의 근거는 철학·자원 둘뿐이다 |

---

## 재현

```
npm run check:native
PF_SEEDS=20260802,777,31337 PF_YEARS=3 npm run probe:overseas
```
