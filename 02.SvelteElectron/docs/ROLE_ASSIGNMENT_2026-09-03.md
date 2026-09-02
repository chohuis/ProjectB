# 투수 보직 배정 — 알고리즘과 입학 실측 (2026-09-03)

사용자 질문 둘에 답한다. 게임 코드는 한 줄도 안 고쳤다 — 읽고 재기만 했다.

1. 시즌 시작 때 주인공 투수에게 선발/중계/마무리를 알려 주는 알고리즘이 뭔가
2. 고교 102팀 × 새 게임 유형 넷으로 입학하면 각각 어느 보직이 되나

계측은 `npm run measure:role`(`scripts/measure-role.cjs` + `scripts/perf/roleEntry.ts`)이다.
규칙을 스크립트에 다시 적지 않았다 — 세계는 `perfEntry.boot`(App.svelte onMount +
NewGamePage.doStartGame 과 같은 순서)가 만들고, 보직은 게임 함수
`pitcherRoleEngine.assignHighschoolPosition` 을 그대로 부른다.

---

## 1부 — 알고리즘

### 1-1. 배선 한 장

```
호출  usecases/advanceWeek.ts  processWeekBoundary(weekNum)   weekNum === 1 일 때만
        ├ careerStage === "highschool"  → assignHighschoolPosition   (SP / RP 둘)
        └ 그 밖(대학·독립·프로)          → assignProtagonistRole      (12종 중 하나)
TS    shared/utils/pitcherRoleEngine.ts   입력을 모아 JSON 으로 넘기기만 한다
브릿지 apps/desktop/preload.cjs  91~92줄   engine:call
Rust  packages/engine-native/src/lib.rs   assign_highschool_position_native (714줄)
                                          assign_protagonist_role_native    (723줄)
판정  packages/engine-native/src/player_engine.rs
        assign_highschool_position  136줄
        assign_protagonist_role      99줄
출력  gameStore.setPosition("SP"|"RP"|"CP") + gameStore.setCurrentRole(role)
      + 소식 「{연도}시즌 시작 브리핑」 (본문에 ROLE_DESCRIPTION[role])
```

### 1-2. 고교 — `assignHighschoolPosition`

**입력** (`pitcherRoleEngine.ts` 25~46줄)

| 무엇 | 어디서 |
|---|---|
| `myOvr` | `protagonist.pitching.ovr` |
| `teamPitcherOvrs` | `masterStore.entities` 중 `teamId` 일치 · `role === "player"` · `details.player.playerType === "pitcher"` |
| 그 각각의 OVR | `npcLiveStatsStore[id].pitching.ovr` **우선**, 없으면 생성값 `details.player.pitching.ovr` |

⚠ 스태미나·구종 수·로테이션 슬롯·학년·부상 여부는 **하나도 안 본다.** OVR 하나다.
⚠ 3학년(곧 졸업)도 그대로 센다. 걸러내는 조건이 없다.
⚠ live 를 먼저 보는 이유는 코드 주석에 있다 — 생성값은 3년이 지나도 +0이라
   그걸로 경쟁을 붙이면 **동료는 안 자라고 주인공만 자란다**.

**판정** (`player_engine.rs` 136~139줄) — 규칙이 두 줄이다.

```rust
let higher = team_pitcher_ovrs.iter().filter(|&&o| o > my_ovr).count();
if higher <= 2 { "SP" } else { "RP" }
```

즉 **팀 투수 OVR 순위 3위 안이면 선발, 4위 밖이면 중계**다. 절대 수치가 아니라
팀 안 경쟁이다. 문턱 값(2)은 규칙 파일이 아니라 Rust 소스에 있다.

**출력** — `position = "SP" | "RP"`. 소식은 「선발 투수」/「중계 투수」로만 쓰고,
`currentRole` 은 SP 면 `"1선발"`, RP 면 `"중간계투"` **고정**이다
(`advanceWeek.ts` 225줄). 고교에서는 2~5선발·셋업맨 같은 세부 보직이 없다.

### 1-3. 대학·독립·프로 — `assignProtagonistRole`

**입력** (`pitcherRoleEngine.ts` 50~79줄)

| 무엇 | 어디서 |
|---|---|
| `position` | `protagonist.position` — **직전 시즌에 이 함수가 정한 값** |
| `ovr` | `protagonist.pitching.ovr` |
| `teamSpOvrs` | 같은 팀 · `role === "player"` · `status === "active"` · 자기 자신 제외 · `playerType === "pitcher"` · **`position === "SP"` 인 동료만**. OVR 0이면 50으로 친다 |
| `roleOvrBias` | `relationEffects({slotId, teamId}).roleOvrBias` — 감독 관계 |

`roleOvrBias` 는 `relationship_rules.json` 의 `effect.manager_role_ovr_per_step`(=2)에
관계 라벨 단계(적대 −3 … 중립 0 … 각별 +3)를 곱한 값이다. 범위 **−6 ~ +6**.
새 팀 첫 시즌은 관계 행이 없어 0이고 그때는 구 동작과 같다.

**판정** (`player_engine.rs` 99~121줄)

```
ovr = 내 OVR + roleOvrBias        ← 감독이 보는 나

position == "CP"  → "마무리"                       (조건 없음. 무조건)
position == "RP"  → ovr ≥ 78 셋업맨 / ≥ 65 중간계투 / ≥ 55 롱릴리프 / 그 밖 패전처리
그 밖(SP 포함)    → rank = 1 + (나보다 높은 팀 SP 수)
                    rank ≤ 5 → "{rank}선발"
                    아니면 ovr ≥ 60 → "스윙맨"
                    아니면          → "롱릴리프"
```

문턱 78·65·55·60 과 로테이션 5칸은 전부 Rust 소스 상수다 —
`generation_rules.json` 에도 다른 규칙 파일에도 없다.

**출력** (`advanceWeek.ts` 244~259줄)

```
role  = 위 12종 중 하나
pos   = role === "마무리" ? "CP" : isReliefsRole(role) ? "RP" : "SP"
소식  「{연도}시즌 시작 브리핑」
      본문 = "이번 시즌 당신의 역할은 [{role}]로 배정되었습니다.
              {ROLE_DESCRIPTION[role]}
              팀과 함께 최고의 시즌을 만들어 가세요."
```

`ROLE_DESCRIPTION` 12줄은 `pitcherRoleEngine.ts` 135~148줄이다
(예: 1선발 "팀 에이스. 시리즈 1차전 선발 고정." · 마무리 "팀 클로저. 승리 상황 마지막 이닝 전담.").

`isStarterRole` = 1~5선발 · 스윙맨 · 오프너. `isReliefsRole` 은 그 여집합이다
(함수 이름의 `Reliefs` 는 오타지만 동작은 맞다). 이 판정은 보직 배정 말고
**불펜 등판 여부**에도 쓰인다 — `advanceWeek.ts` 2948줄, 주인공 경기가 아닌
팀 경기에서 `isReliefsRole(currentRole) && relieverWouldPitch(...)` 로 나온다.

### 1-4. 언제 도는가

**시즌 개막 주(W1) 한 번뿐이다.** `processWeekBoundary(weekNum)` 의 `weekNum === 1`
갈래가 유일한 호출부이고, `gameStore.setPosition` 을 부르는 자리도 그 둘뿐이다
(`advanceWeek.ts` 224 · 247줄 · 전수 검색).

- `weekNum` 은 `s.currentWeek + 1` 이고, `makeEmptySeason` 이 `currentWeek: 0` 으로
  두므로 **새 게임과 시즌 롤오버 직후 첫 한 주를 넘길 때마다** 반드시 한 번 걸린다.
  실측: `W0 position=SP role=null` → `W1 position=SP role=1선발`.
- **진급·이적·승강 직후에는 따로 안 부른다.** 다음 시즌 W1까지 옛 보직으로 간다.
- 고교 W1 배정은 신입생 생성(`generateFreshmenV3`, 같은 W1 블록의 뒤쪽)보다
  **먼저** 돈다 — 판정에 쓰이는 로스터는 신입생이 들어오기 전 것이다.

### 1-5. 코드를 읽다 나온 것 — 고치지 않았다

세 가지가 **닿지 않는 자리**다. 실측이 아니라 코드 전수 검색 결과다.

| 무엇 | 왜 |
|---|---|
| **`마무리`·`CP` 에 영원히 못 간다** | `마무리` 는 `position === "CP"` 일 때만 나오고, `position` 이 `CP` 가 되는 건 `role === "마무리"` 일 때뿐이다. 서로가 서로의 조건이라 첫 진입로가 없다. 기본값은 `"SP"`(`stores/game.ts` 180줄)이고 새 게임은 SP/RP 만 준다 |
| **`오프너` 는 아무도 안 만든다** | `ROLE_DESCRIPTION`·`isStarterRole`·등판 확률표(0.30)에는 있는데 배정 함수가 그 문자열을 안 낸다 |
| **한 번 RP 가 되면 프로에서 못 돌아온다** | 프로 갈래의 `"RP"` 팔은 어떤 OVR 에서도 선발 계열을 안 준다. 고교에서 RP 였으면 그 `position` 을 그대로 들고 대학·프로로 가고, 그 뒤로는 셋업맨이 천장이다. 고교 안에서는 매년 다시 판정하므로 이 잠금이 없다 |

⚠ **밸런스 동결 규칙대로 값은 아무것도 안 건드렸다.** 고칠지는 건마다 사용자에게 묻는다.

---

## 2부 — 입학 보직 실측 (102팀 × 유형 4)

### 2-1. 재는 방법

```bash
npm run measure:role   # cross-env DRIVE_USER_DATA=1 ELECTRON_RUN_AS_NODE=1 electron scripts/measure-role.cjs
```

- 씨앗 **20260826** — `NewGamePage.svelte` 의 `const worldSeed = 20260826` 그대로.
  2026년. 세계가 고정이므로 **모든 새 게임이 이 표대로 시작한다.**
- 세계는 `perfEntry.boot` 이 만든다(고교 102팀 포함 국내 전 리그 · NPC 5,798명).
- 유형별 초기 능력치는 `NewGamePage.svelte` 의 `PRESETS` 를 **파일에서 정규식으로 읽는다** —
  스크립트에 베껴 두면 프리셋이 바뀌었을 때 계측만 옛 주인공을 잰다.
- 보직은 `assignHighschoolPosition` 을 팀마다 그대로 부른다. **102팀 전부** 쟀다 —
  권역 대표로 줄이지 않았다.
- 투구 폼(오버핸드·사이드암·언더스로)과 좌/우투는 **판정에 안 들어간다.** 위 1-2의
  입력에 없다. 그래서 유형 4개 × 팀 102개 = 408건이 전부다.

### 2-2. 유형별 초기치 (NewGamePage.svelte 185~245줄)

| 유형 | OVR | 구위 | 커맨드 | 제구 | 무브 | 멘탈 | 스태미나 | 시작 구종 |
|---|---|---|---|---|---|---|---|---|
| 균형형 | **70** | 70 | 70 | 73 | 71 | 68 | 68 | 패스트볼 Lv1 |
| 파워피처 | **68** | 78 | 64 | 60 | 66 | 68 | 70 | 패스트볼 Lv2 |
| 제구형 | **68** | 57 | 78 | 75 | 66 | 68 | 62 | 패스트볼 Lv1 · 체인지업 Lv1 |
| 체력형 | **69** | 67 | 65 | 67 | 66 | 77 | 78 | 패스트볼 Lv1 |

판정에 쓰이는 건 **`ovr` 한 칸뿐**이므로 유형이 넷이어도 값은 68·69·70 셋이다.

### 2-3. 결과 — 표

씨앗 20260826 · 2026년 · 고교 102팀 · 팀당 로스터 18명 / 투수 8.0명

| 유형 | OVR | 선발(SP) | 중계(RP) | SP 비율 | RP 가 되는 팀 |
|---|---|---|---|---|---|
| 균형형 | 70 | **102팀** | 0팀 | 100.0% | — |
| 파워피처 | 68 | **98팀** | **4팀** | 96.1% | 백호고 · 빛고을고 · 가야고 · 한성고 |
| 제구형 | 68 | **98팀** | **4팀** | 96.1% | 백호고 · 빛고을고 · 가야고 · 한성고 |
| 체력형 | 69 | **102팀** | 0팀 | 100.0% | — |

RP 넷의 내역 (OVR 68 기준):

| 팀 | ★ | 권역 | 팀 투수 OVR 상위3 | 나보다 높은 투수 |
|---|---|---|---|---|
| 백호고 `TEAM_HS_BAEKHO` | ★4 | 무지개 | 71 / 70 / 69 | 4명 |
| 빛고을고 `TEAM_HS_BITGOEUL` | ★4 | 영산 | 73 / 72 / 69 | 3명 |
| 가야고 `TEAM_HS_GAYA` | ★3 | 낙동 | 70 / 69 / 69 | 3명 |
| 한성고 `TEAM_HS_HANSEONG` | ★5 | 한강 | 76 / 73 / 69 | 3명 |

권역별 RP 팀 수 (OVR 68 / 69 / 70):

| 권역 | 팀 수 | RP |
|---|---|---|
| 한강 (서울) | 16 | 1 / 0 / 0 |
| 무지개 (경기·인천) | 20 | 1 / 0 / 0 |
| 계룡 (충청·대전) | 12 | 0 / 0 / 0 |
| 설악 (강원) | 6 | 0 / 0 / 0 |
| 영산 (호남·광주) | 14 | 1 / 0 / 0 |
| 팔공 (대구·경북) | 12 | 0 / 0 / 0 |
| 낙동 (부산·경남·울산) | 16 | 1 / 0 / 0 |
| 한라 (제주) | 6 | 0 / 0 / 0 |

### 2-4. 왜 그렇게 갈리나

**주인공 초기 OVR 이 고교 투수 분포의 거의 꼭대기에 있다.** 고교 생성 규칙
(`generation_rules.json` `rosterRules.LEAGUE_HIGHSCHOOL`)이 `pitchingOvrMin 45` ·
`pitchingOvrMax 70` 이고, 여기에 전력★ 보정(`powerRules` — `pivot 3` ·
`ovrShiftPerStar 3.5`, ★5면 +7 ★1이면 −7)만 얹힌다. 실측한 팀 투수 1위 평균이
★2 64.3 · ★3 67.1 · ★4 69.9 · ★5 74.7 이다. 유형 넷은 68~70이라 **★2·★3 팀에서는
사실상 즉시 팀 내 1~2위**가 된다.

**문턱이 "3위 안"이라 두 계단이 여유다.** 나보다 높은 투수 수 분포가
OVR 68에서 `0명 71팀 / 1명 20팀 / 2명 7팀 / 3명 3팀 / 4명 1팀` 이다.
102팀 중 98팀이 0~2명이고, RP 로 넘어가려면 **나보다 높은 투수가 세 명 모인 팀**이라야
한다 — 씨앗 20260826에서 그런 팀이 넷뿐이다.

**그래서 OVR 1~2점이 그 넷을 가른다.** 문턱 곡선(같은 세계 · 같은 함수 · 주인공 OVR 만 밀어 본 값):

| 주인공 OVR | 60 | 62 | 64 | 66 | **68** | **69** | **70** | 72 | 74 |
|---|---|---|---|---|---|---|---|---|---|
| RP 판정 팀 수 | 48 | 33 | 18 | 9 | **4** | **0** | **0** | 0 | 0 |

68과 69 사이에서 4 → 0으로 끊긴다. 위 넷의 3위 투수가 전부 정확히 **69**이기
때문이다(`o > my_ovr` 는 초과 비교라 69는 69를 못 넘는다). 균형형(70)·체력형(69)이
전 팀 선발이고 파워피처·제구형(68)만 넷에서 갈리는 이유가 이 한 점이다.

### 2-5. 입학 순간에는 어차피 전원 SP다 — 진짜 판정은 첫 주에 온다

`NewGamePage.doStartGame` 이 `assignHighschoolPosition` 을 부르는 시점(339줄)을 실측했다:

```
masterStore.entities 0건 · 그중 선수 0건
TEAM_HS_AEWOL 투수 0명 → 보직 SP
```

슬롯이 아직 없고 `masterStore.load()` 는 `reloadEntities()` 를 `seasonYear` 없이
부르므로 선수를 안 싣는다(`stores/master.ts` 1138~1140줄 — "seasonYear 없이
호출되면 선수 로드 안 함"). 그래서 `teamPitcherOvrs` 가 **빈 배열**이고
`higher = 0 ≤ 2` 라 **어느 팀·어느 유형이든 SP** 가 나온다.

그 값은 첫 주를 넘기는 순간 W1 갈래가 **덮어쓴다.** 그때 로스터가 다 있으므로
2-3의 표가 실제로 플레이어가 보게 되는 결과다. 차이가 보이는 자리는
「시즌 시작 브리핑」 소식이 오기 전(확인 카드·상태 화면의 SP 표기)뿐이다.

⚠ 이건 결함이라고 부르지 않았다 — 한 주 만에 스스로 맞는 값으로 돌아온다.
   다만 **입학 화면이 보여 주는 보직은 예고가 아니다**는 건 적어 둔다.

### 2-6. 곁가지로 잰 것

- 고교 팀 로스터가 **전 팀 18명**이었다(`rosterSize 31` 인데 `rosterMin 18`).
  투수는 18 × `pitcherRatio 0.45` = 8명. 예산·편성 성향이 정원을 내리는
  경로(`budgetOf`·`squadPlanOf`)가 고교에서 하한까지 미는 것으로 보이는데,
  **이 문서의 주제가 아니라 원인은 안 팠다.** 보직 판정에는 영향이 없다
  (문턱이 상위 세 명만 보므로).
- W1 을 넘기면 신입생 생성으로 팀 투수가 8 → 13명이 된다(애월고 실측).
  W1 판정은 그 **전에** 돌므로 표는 8명 기준이다.

---

## 재현

```bash
npm run measure:role                    # 씨앗 20260826 (게임과 같은 값)
PF_SEED=20260731 npm run measure:role   # 다른 세계
PF_DUMP=1 npm run measure:role          # 팀별 원자료를 docs/_measure-role-dump.json 에
```

계측기: `scripts/measure-role.cjs` · `scripts/perf/roleEntry.ts`
(세계는 `scripts/perf/headless.cjs` + `scripts/perf/perfEntry.ts` 의 `boot`).
