# 투수 보직 — 감독 추천과 선택 (기획) · 2026-09-03

사용자 지시로 **기획만** 적는다. 이 문서를 쓰는 동안 게임 코드·Rust·데이터는
한 줄도 안 고쳤다.

바꾸려는 것 셋이다.

1. 보직을 **OVR 하나**가 아니라 **세부 능력치 + 팀내 경쟁**으로 정한다
2. 결과를 통보가 아니라 **감독의 추천**으로 내고, 주인공이 선발·중계·마무리를 고른다
3. 추천 아닌 자리를 고르면 **출전 기회가 실제로 줄어든다**

⚠ 이 문서의 **가중치·확률은 전부 「제안」이다.** 밸런스는 동결이고, 값은 건마다
사용자가 확정한다. 코드에서 읽은 값은 그때마다 출처(파일·줄)를 적었다.

---

## §1 지금 상태

### 요약 세 줄 (`docs/ROLE_ASSIGNMENT_2026-09-03.md`)

- **고교** — `assign_highschool_position`(player_engine.rs 136줄)이 두 줄이다.
  `팀 투수 OVR 중 나보다 높은 사람이 2명 이하면 SP, 아니면 RP`. 스태미나·구종·
  학년·부상은 **하나도 안 본다.**
- **대학·독립·프로** — `assign_protagonist_role`(99줄)이 `position`으로 먼저
  갈린다. `CP`면 무조건 마무리, `RP`면 OVR 78/65/55로 셋업맨·중간계투·롱릴리프·
  패전처리, 그 밖이면 `rank = 1 + (나보다 높은 팀 SP 수)`로 1~5선발, 넘치면
  OVR 60 기준 스윙맨/롱릴리프다. 여기에 감독 관계 보정 `roleOvrBias`(−6~+6)가
  OVR에 더해진다.
- **언제** — `advanceWeek.processWeekBoundary(weekNum)`의 `weekNum === 1` 갈래
  하나뿐이다. 진급·이적·콜업 뒤에는 안 부르고, 다음 시즌 W1까지 옛 보직으로 간다.

### 발견 셋 (그 문서 1-5 · 코드 전수 검색)

| 무엇 | 왜 |
|---|---|
| **마무리(CP)에 영원히 못 간다** | `마무리`는 `position === "CP"`일 때만 나오고, `position`이 `CP`가 되는 건 `role === "마무리"`일 때뿐이다. 서로가 서로의 조건이라 첫 진입로가 없다 |
| **오프너를 아무도 안 만든다** | `ROLE_DESCRIPTION`·`isStarterRole`·등판 확률표(0.30)에는 있는데 배정 함수가 그 문자열을 안 낸다 |
| **한 번 RP가 되면 프로에서 못 돌아온다** | 프로 갈래의 `"RP"` 팔은 어떤 OVR에서도 선발 계열을 안 준다. 셋업맨이 천장이다 |

### 이번에 코드를 읽다 더 나온 것 넷

기획을 짜려면 **등판이 어디서 정해지는가**를 알아야 해서 그 경로를 따라갔다.
넷이 더 나왔다. 전부 코드 확인이고 실행 계측은 아니다.

| # | 무엇 | 근거 |
|---|---|---|
| a | **로테이션 자리 수가 규칙 파일과 Rust에서 다르다** | `rosterOpsRules.rotationSize`는 고교 3 · 대학 3 · 독립 4 · 그 밖 5인데, `assign_protagonist_role`은 리그와 무관하게 `rank <= 5`로 **5선발까지** 준다. 대학에서 4선발·5선발이 나오는데 그 팀 로테이션은 3자리다 |
| b | **세부 보직(1~5선발)이 등판에 아무 영향이 없다** | 주인공의 등판은 일정의 `is_protagonist_game` 하나로 정해진다. 프로는 시리즈 첫 경기 하나(`schedule_engine.rs` 214줄), 고교·대학은 팀 경기 전부(155줄). **5선발도 1선발과 똑같이 매주 던진다** |
| c | **`starterSlot()`은 아무도 안 쓴다** | `pitcherRoleEngine.ts` 158줄. 전수 검색 결과 호출부 0건 |
| d | **복무 중에는 보직 배정이 아예 안 돈다** | `advanceWeek`의 군 갈래(2167줄)가 `processWeekBoundary`(2883줄)보다 **앞에서 반환한다.** 상무도 현역도 그 길로 간다 |

### 지금 「등판」을 정하는 자리 — 셋뿐이다

§5에서 계수를 넣을 자리라 미리 적어 둔다.

```
(a) 일정         schedule_engine.rs   is_protagonist_game
                 프로/2연전  주당 1경기(시리즈 첫 경기)만 true
                 고교·대학   팀 경기 전부 true
(b) 불펜 등판    player_engine.rs     reliever_appearance_chance(role)
                 마무리 .55 · 셋업맨 .45 · 중간계투 .35 · 오프너 .30 ·
                 패전처리 .25 · 롱릴리프 .20 · 스윙맨 .15 · 그 밖 0
                 호출  advanceWeek 2944~2960줄 (isReliefsRole && relieverWouldPitch)
(c) 경기 안 진입 match_engine.rs      create_initial_match_state / should_protagonist_enter
                 SP → InningStart{1}
                 RP → MidInning{5|6|7(감독 bullpenRead 70/40), maxOuts 3, scoreDiffCap 6}
                 CP → CloseGame{8|9(감독 clutchDecision 70), lead 1~3}
                 진입 못 하면 `entryReached: false` → MainPage 「등판하지 못했습니다」
```

⚠ (c)의 `role`은 **`protagonist.position`(SP/RP/CP) 세 값뿐**이다
(`MainPage.svelte` 242 · 406줄). 12종 세부 보직은 여기까지 안 내려온다(오프너를 빼면 11종이 된다 — §3).

---

## §2 새 추천 산식 — 역할별 적합도

### 재료 — 실제 필드명

주인공은 `ProtagonistSave.pitching`(`types/save.ts` 32~44줄),
NPC는 `NpcSaveState.pitching`(923줄) / `NpcLiveStat.pitching`(`types/season.ts` 413줄).
**두 타입의 칸 이름이 같다** — 주인공과 동료를 같은 함수에 넣을 수 있다.

```
ovr  stamina  velocity  command  control  movement
mentality  recovery  clutch  holdRunners
```

구종은 따로다.

```
protagonist.pitches   PitchEntry[] { id, grade: 1|2|3|4|5 }   (save.ts 113~117줄)
NPC                   details.player.pitches  또는 npcLiveStats[id].pitches
계열                  resource/data/master/training/pitch_catalog.json 의 group
                      fastball(3) · breaking(2) · offspeed(4) · special(1)
```

⚠ **`command`와 `control`이 둘 다 있다.** 이름이 비슷해 섞기 쉽다 — 게임 안의
쓰임은 `buildStarterStats`(matchLineupBuilder.ts 195줄)가 그대로 넘기는 값이고,
산식에서도 둘을 따로 쓴다.

### 구종 점수 `arsenal`

세 역할이 구종을 보는 눈이 다르다. 선발은 **가짓수**, 불펜은 **결정구 하나**다.
(근거: `roster_gen.rs`의 `pitch_target` — SP는 4~5개, RP는 3~4개, CP는 2~4개를
목표로 만든다. 게임 세계가 이미 그렇게 굴러간다.)

```
n        = pitches.length
gAvg     = 등급 평균 / 5
gBest2   = 패스트볼을 뺀 상위 2개 등급 평균 / 5   (없으면 0)
gBest    = 패스트볼을 뺀 최고 등급 / 5            (없으면 0)
grp      = 서로 다른 group 수 / 3                 (상한 1)

arsenalSP = 100 × clamp01( 0.40 × min(n,5)/5 + 0.35 × gAvg   + 0.25 × grp )   [제안]
arsenalRP = 100 × clamp01( 0.20 × min(n,4)/4 + 0.60 × gBest2 + 0.20 × grp )   [제안]
arsenalCP = 100 × clamp01( 0.15 × min(n,3)/3 + 0.70 × gBest  + 0.15 × grp )   [제안]
```

⚠ **구종을 못 읽는 상대가 있다.** `pitches`는 `EntityPlayerDetails`에서
optional이고(`stores/master.ts` 314줄) `NpcLiveStat.pitches`도 optional이다.
없으면 그 항목을 빼고 **남은 가중치를 재정규화한다** — 0으로 넣으면 구종 정보가
없는 동료가 통째로 밀려나 경쟁이 거짓이 된다.

### 역할 적합도 (0~100)

각 능력치는 0~100 눈금 그대로 쓴다.

```
fitSP = 0.28 stamina + 0.18 control + 0.14 command + 0.20 arsenalSP
      + 0.10 velocity + 0.06 recovery + 0.04 movement                   [제안]

fitRP = 0.30 velocity + 0.24 movement + 0.14 command + 0.10 control
      + 0.10 clutch   + 0.07 arsenalRP + 0.05 stamina                   [제안]

fitCP = 0.26 velocity + 0.22 mentality + 0.20 clutch + 0.15 control
      + 0.09 movement + 0.05 arsenalCP + 0.03 holdRunners               [제안]
```

세 식 모두 가중치 합이 1.0이라 결과가 같은 0~100 눈금이다. **서로 비교할 수 있어야
추천이 된다.**

왜 이렇게 갈랐는지만 적는다 (값이 아니라 방향이 기획이다).

- **선발** — 길게 던지는 자리다. `stamina`가 제일 무겁고, 타순을 세 번 도니
  구종 가짓수(`arsenalSP`)와 `control`이 따라온다.
- **중계** — 한 이닝을 세게 막는 자리다. `velocity`·`movement`가 앞이고 스태미나는
  거의 안 본다. 구종은 가짓수가 아니라 **결정구 하나**다.
- **마무리** — 중계에 압박이 얹힌다. `mentality`·`clutch`가 들어오고, 주자를 두고
  던지는 자리라 `holdRunners`가 작게 붙는다.

⚠ **학년은 안 본다** (확정 6). 1학년 주인공도 능력치가 되면 1선발이고, 3학년도
그 시즌은 같이 겨룬다. 능력치 밖의 항이 산식에 들어가지 않는다.

### 감독 관계

지금과 같이 `relationEffects().roleOvrBias`(−6~+6 · `relationship_rules.json`의
`manager_role_ovr_per_step: 2` × 관계 단계 ±3)를 쓴다. **세 적합도에 똑같이
더한다** — 감독이 나를 좋게 보면 어느 자리든 경쟁에서 앞서는 것이지, 자리가
바뀌는 건 아니다.

```
myFitX = fitX(나) + roleOvrBias        X ∈ {SP, RP, CP}
동료    = fitX(동료)                    (관계 보정 없음 — 관계는 주인공만 있다)
```

🔴 **추천을 거스른다고 감독 관계를 깎지 않는다** (확정 1). 관계는 경기·이벤트가
움직이는 값이고 보직 선택은 거기 손대지 않는다. 불이익은 §5의 등판 감소 하나뿐이다.

🔴 **밸런스 값은 사용자 확정이다.** 위 가중치·구종 계수는 전부 제안이고,
넣을 자리는 `generation_rules.json`의 새 키 하나다(§7). 코드에 리터럴로
적지 않는다 — 이 저장소가 이미 그걸로 15건을 겪었다(CLAUDE.md 머리).

---

## §3 팀내 경쟁력 — 「내가 들어갈 수 있는 자리」

적합도는 **혼자 재는 값**이다. 보직은 팀 안 경쟁이라 자리 수를 같이 봐야 한다.

### 자리 수 — 셋 다 정한다 (확정 4)

| 자리 | 어디서 | 값 |
|---|---|---|
| 선발 | `rosterOpsRules.rotationSize` (실물) | 고교 3 · 대학 3 · 독립 4 · 그 밖(프로·2군·해외) 5 |
| 마무리 | 팀당 1 (실물) | `getTeamBullpen`이 `closer` **한 명**만 낸다. 생성도 팀당 CP 정확히 1명(`roster_gen.rs` 592줄) |
| 중계 | **새로 둔다** — `rosterOpsRules.bullpenSize` | 아래 표 |

로스터가 만드는 실제 공급은 이렇다 (`roster_gen.rs` 548~551줄 · `tuning.rs` 1066줄).

```
pitcher_n = round(로스터 × pitcherRatio 0.45)      (야수 9명은 보장)
sp_n      = max(3, round(pitcher_n × 0.45))         SP_SHARE_OF_PITCHERS
CP        = 1명
RP        = pitcher_n − sp_n − 1
```

**`bullpenSize` 제안값** — `pitcher_n − rotationSize − 1`을 **rosterMin 기준**으로
고정한다 (`generation_rules.json`의 `rosterRules.*.rosterMin`이 출처다).

| 무대 | rosterMin | pitcher_n | rotationSize | 마무리 | **bullpenSize [제안]** | 자리 합 |
|---|---|---|---|---|---|---|
| 고교 | 18 | 8 | 3 | 1 | **4** | 8 |
| 대학 | 20 | 9 | 3 | 1 | **5** | 9 |
| 독립 | 18 | 8 | 4 | 1 | **3** | 8 |
| 프로 1군·2군·해외 | 26 | 12 | 5 | 1 | **6** | 12 |

⚠ **자리 합이 최소 로스터의 투수 수와 같다.** 그런데 실제 로스터는 예산으로
`rosterMin`~`rosterMax` 사이에서 정해진다(고교 18~33 · 대학 20~40 · 프로 26~34).
로스터가 큰 팀은 투수가 자리보다 많다 — **그래서 밀리는 사람이 생긴다.** 그게 이
값을 리그 상수로 두는 이유다. 팀마다 다시 계산하면 아무도 안 밀린다.

### 경쟁 상대 고르기

지금 `pitcherRoleEngine.ts`의 필터를 고친다.

```
지금 (고교 25~46줄)   teamId 일치 · role="player" · playerType="pitcher"
                      → status 를 안 본다. 3학년도 부상자도 다 센다
지금 (프로 61~72줄)   위 + status="active" + 자기 제외 + position="SP" 인 동료만
                      → SP 꼬리표가 없는 동료는 경쟁에서 통째로 빠진다

새 필터              teamId 일치 · role="player" · playerType="pitcher"
                     · status === "active"
                     · 시즌 아웃 부상 제외 (npcInjuries[id] 가 있고 isPlayingThrough=false)
                     · position 으로 거르지 않는다 — 세 자리를 다 겨룬다
                     · 학년으로도 거르지 않는다 (확정 6)
```

능력치는 **지금 값**으로 읽는다 — `livePitcherOvr`이 이미 그 규칙이고
(`npcLiveStats` 우선, 없으면 생성값), 세부 능력치도 같은 순서로 읽는다.
⚠ 이 순서를 뒤집으면 **동료는 안 자라고 주인공만 자란다**(그 파일 6~16줄 주석).

### 자리 배정 — 세 단계

순서 의존을 없애려고 단계를 셋으로만 나눈다. 같은 입력이면 늘 같은 답이 나온다.

```
① 마무리 한 자리
     후보 = 팀 투수 전원(주인공 포함)
     seatCP = fitCP 최댓값을 가진 한 명
     → 나의 rankCP = 1 + #{동료 : fitCP(동료) > myFitCP}

② 선발 rotationSize 자리
     후보 = 전원 − (①에서 마무리가 된 사람)
     → 나의 rankSP = 1 + #{그 후보 중 : fitSP(동료) > myFitSP}

③ 나머지가 중계 bullpenSize 자리를 겨룬다
     후보 = 전원 − (①의 마무리) − (②에서 로테이션에 든 사람)
     → 나의 rankRP = 1 + #{그 후보 중 : fitRP(동료) > myFitRP}
```

🔴 **③의 후보를 「전원」으로 잡으면 안 된다.** 그러면 선발로 확정된 에이스가
중계 순위에도 끼어 주인공을 밀어낸다. ①②③이 한 줄로 흐르는 한 벌이어야 자리
합이 맞는다.

**들어갈 수 있는 자리**

```
canCP = rankCP ≤ 1
canSP = rankSP ≤ rotationSize(리그)
canRP = rankRP ≤ bullpenSize(리그)
```

**추천**은 들어갈 수 있는 자리 중 **내 적합도가 가장 높은 것**이다.
하나도 없으면 **세 적합도 중 가장 높은 자리를 그대로 추천한다** — 「추천 자리
없음」이라는 상태를 화면에 만들지 않는다(§8 12번).

### 세부 보직 이름

추천은 SP/RP/CP 셋이지만, 확정된 뒤 `currentRole`은 지금 규칙을 이어 쓴다.
다만 **자리 수를 리그에서 읽는다** — §1-a 결함을 여기서 닫는다.

```
SP  rankSP ≤ rotationSize → "{rankSP}선발"          (고교·대학이면 최대 3선발)
    rankSP  = rotationSize+1 이고 fitSP 가 높으면 "스윙맨"
    그 밖 → "롱릴리프"
CP  "마무리"
RP  fitRP 로 셋업맨 / 중간계투 / 롱릴리프 / 패전처리
    문턱은 지금 OVR 78·65·55 자리를 fitRP 눈금으로 옮긴다 [제안]
```

🔴 **「오프너」는 지운다** (확정 7). 지금 네 자리에 있다 — 남기면 영영 안 나오는
항목이 규칙처럼 보인다.

```
apps/ui/src/shared/types/save.ts               73줄   PitcherRole 유니온에서 뺀다
apps/ui/src/shared/utils/pitcherRoleEngine.ts  142줄  ROLE_DESCRIPTION 항목 삭제
                                               151줄  isStarterRole 배열에서 삭제
packages/engine-native/src/player_engine.rs    149줄  등판 확률 0.30 갈래 삭제
```

⚠ 유니온에서 빼면 **옛 세이브의 `currentRole: "오프너"`가 타입에 안 맞는다.**
지금 그 값을 낼 수 있는 배정 함수가 없어(§1 발견 2) 실제로 저장된 세이브는 없을
텐데, 로드 쪽에 "모르는 보직이면 `중간계투`로 떨어뜨린다" 한 줄을 같이 넣는다.

⚠ 고교는 지금 `currentRole`이 `"1선발"`/`"중간계투"` **두 값 고정**이다
(`advanceWeek.ts` 221~226줄). **여기에 `"마무리"`가 는다** — 고교도 마무리를
두기로 확정했다(확정 5 · §6-1). 세 값까지다: 1~3선발 같은 세부 이름은 아직 안 준다
(`stages.LEAGUE_HIGHSCHOOL.detailedRoles: false` · §7). 자리를 먼저 열고 이름은
등판 분업이 자리 잡은 뒤에 붙인다.

### 무대별 차이

| 무대 | 선발 자리 | 중계 자리 | 마무리 | 묻는 주 | 비고 |
|---|---|---|---|---|---|
| 고교 (`LEAGUE_HIGHSCHOOL`) | 3 | 4 | **1** (확정 5 · §6-1) | W6 | 팀 경기가 **전부** 주인공 경기다. 로스터 18 · 투수 8 · 마무리를 열려면 선발 이닝을 줄여야 한다(§6-1) |
| 대학 (`LEAGUE_UNIVERSITY`) | 3 | 5 | 1 | W4 | 지금은 5선발까지 나온다(§1-a) |
| 독립 (`LEAGUE_INDEPENDENT`) | 4 | 3 | 1 | W9 | 나이 상한 31 |
| 프로 1군 (`LEAGUE_KBL`·ABL·JBL) | 5 | 6 | 1 | W1 | 시범경기가 W1~4라 정규 개막(W5) 전에 이미 던진다 |
| 프로 2군 (`LEAGUE_KBL_FARM` 등) | 5 | 6 | 1 | W4 | 시범경기가 없다(1군 셋만) · `rotationSize`에 항목이 없어 default 5 |
| 상무 (`careerStage === "military"` · `militaryUnit === "sports"`) | — | — | — | **안 묻는다** (확정 9) | 주인공은 복무 중 **경기가 0이다**(아래) · 상무 경기가 생기는 **1.1 상무 탭 때 다시 본다** |
| 현역 (`militaryUnit !== "sports"`) | — | — | — | **안 묻는다** | 같은 이유 · 확정 9 |

🔴 **복무 중에는 상무도 경기가 없다** (`advanceWeek.ts` 2167~2385줄).
군 갈래가 `processWeekBoundary`보다 앞에서 `matchResults: []`로 반환하고, 그
반환은 `isSportsUnit`을 **가르지 않는다.** 상무 팀(`TEAM_IND_SANGMU_PHOENIX` ·
독립리그 소속 · `utils/ids.ts` 10~11줄)은 **NPC 로스터로만 존재한다** — 주인공이
그 팀 경기에 나가는 경로가 없다. 그래서 상무에 보직을 물으면 **그 시즌 등판이
0인 채로 보직만 정해진다.** → **안 묻는다**(확정 9 · §8 ⑨)

---

## §4 감독 추천 → 선택 흐름

### 모달이 아니라 **소식 안에서 고른다** (사용자 지시)

기존 화면에 **이미 그 패턴이 있다.** 소식 상세 칸 아래에 선택지 버튼이 붙는
`MessageDecision`이다. 새 모달을 만들지 않고 여기에 얹는다.

```
자리        apps/ui/src/pages/news/NewsPage.svelte
            273줄  {@const dec = selected.decision}
            310줄  <section class="dec">        ← 선택 영역
            314줄  {#each dec.options as opt}<button class="opt">
            333줄  {:else} <div class="dec-done">  ← 고른 뒤 표시
타입        types/main.ts 222줄  MessageItem.decision?: MessageDecision
            MessageDecision       { prompt, options[], selectedOptionId }
            MessageDecisionOption { id, label, effectHint, effects }
목록 표시   235줄  isPending → <span class="tag-pending">선택 대기</span>
            .item.pending 테두리 (CSS 493줄)
정렬        80줄   미결 선택지는 정렬과 무관하게 **항상 맨 위**
```

**부제를 안 단다** (사용자 지시). `effectHint`를 **빈 문자열로 둔다** — NewsPage
325줄이 `{#if opt.effectHint}`로 감싸고 있어서 비우면 `.opt-hint`가 아예 안 그려진다.
적합도 막대·순위 숫자도 안 그린다. **감독 말 한 줄 + 버튼 셋**이 전부다.

### 소식 한 통

```
category   "system"
sender     감독 이름 (없으면 "코칭스태프")
subject    "{연도}시즌 보직"
body       감독의 말 한 줄 — 왜 그 자리인지. 숫자는 안 쓴다
decision.prompt   ""   (본문이 이미 물음이다 · NewsPage 312줄이 빈 문자열이면 빈 줄만
                        남으므로 `{#if dec.prompt}` 가드를 같이 넣는다)
decision.options  [ {id:"sp", label:"선발"}, {id:"rp", label:"중계"}, {id:"cp", label:"마무리"} ]
                  셋 다 항상 보인다 · effectHint 는 전부 ""
                  effects.roleChoice 에 "SP"|"RP"|"CP" (§7 DecisionEffect 새 필드)
id         msg-role-{year}-{teamId}-w{week}      ← 세 조각이다 (§7 확정)
metadata   { type: "roleChoice", recommended: "sp"|"rp"|"cp", managerName,
             seats: {sp,rp,cp}, ranks: {sp,rp,cp}, ahead: {sp,rp,cp} }
           ahead = min(rank − 1, seats)  — §5 문구가 쓰는 유일한 숫자
           **두 갈래가 있다** — ahead ≥ 1 과 ahead = 0 이 서로 다른 문장을 쓴다.
           판정은 §7 「ahead — 두 갈래」, 문장은 §5 문안이 정본이다
```

🔴 **적합도(`fits`)는 소식에 안 싣는다.** 화면이 안 그리는 값을 세이브에 넣으면
「보이지 않는데 저장되는 값」이 되고, 나중에 그걸 근거로 화면을 만들면 두 벌이 된다.
분포 확인은 계측(`measure:role`)이 엔진을 직접 불러서 한다.

### 추천 표시 — **하나뿐이다**

추천 버튼에 테두리 하나(또는 배지 하나)만 준다. 나머지 둘은 아무 표시가 없다.
「자리 있음」·「자리 없음」 같은 부제를 **안 단다** (사용자 지시).

```svelte
<!-- NewsPage 의 .opt 를 그대로 쓰되 추천만 표시 -->
<button class="opt" class:rec={meta.recommended === opt.id}>
  <span class="opt-label">{opt.label}</span>
</button>
```

### 확인 단계 — **추천이 아닌 버튼에만** 뜬다 (사용자 요구 3)

```
추천 버튼        누르면 **바로 확정한다** — 확인 단계가 없다
추천 아닌 버튼   확인 한 줄 + [다시 고른다] [그래도 간다] 를 거친다
```

추천이 아닌 버튼을 누르면 **곧바로 확정하지 않는다.** `applyDecision`을 부르지 않고
컴포넌트 국소 상태(`pendingPick`)에만 담아, 버튼 자리를 한 줄 + 버튼 둘로 바꾼다.
추천 버튼은 그 단계를 건너뛰고 `applyRoleChoice`로 바로 간다.

🔴 **확인 한 줄은 안내이지 되묻기가 아니다.** 사용자 요구 3이 "추천이 아닌
보직을 고르면 출전 기회가 적어질 수 있다는 안내"이므로, 추천에도 띄우면 안내할
게 없는 자리에서 한 번 더 묻는 것이 된다.

⚠ §8 확정 12의 「추천이든 아니든 같은 한 줄」은 **문구 얘기다** — 추천 전용
문장을 따로 만들지 말라는 뜻이지 추천에도 단계를 두라는 뜻이 아니다.
2026-09-03 구현이 그렇게 읽어 추천에도 확인 단계를 뒀다가 되돌렸다.
갈래 판정은 `pitcherRole.ts`의 `needsRoleConfirm()` 하나다.

```
ahead ≥ 1   지금 그 자리에 3명 있다. 거기에 더해 들어간다.
ahead = 0   그 자리는 비어 있다. 감독 생각과는 다르다.

              [ 다시 고른다 ]   [ 그래도 간다 ]
```

숫자는 `metadata.ahead[pick]` 하나뿐이다. **적합도·순위·등판 감소율은 안 보여
준다** (확정 2).

⚠ **갈래가 둘이다.** `ahead = 0`은 자리가 비었는데 추천이 아닌 경우고, 거기에
"0명 있다"고 쓰면 말이 안 된다. 언제 0이 되는지와 코드 명세는 §7, 문장은 §5다.
**컴포넌트가 세 번째 문장을 새로 짓지 않는다** — 두 갈래가 전부다.

### 멈추는 배선 — **새 pending 타입이 필요 없다**

`advanceWeek.ts`의 「미결정 메시지 확인」 갈래가 이미
`decision.selectedOptionId === null`인 소식을 찾아 `{type:"message", messageId}`
pending을 만들고 그 주에서 멈춘다. 소식을 넣기만 하면 멈춤이 따라온다.

🔴 **그래서 `PENDING_ACTION_TYPES` 누락 함정을 통째로 피한다.** 새 타입을 만들면
타입에만 넣고 배열(`season.ts` 263줄)에 안 넣어 로드에서 조용히 사라지는 그 형태가
또 생긴다 — 군 이벤트가 그랬다.

`runAutoAdvance`도 `case "message"`(443줄)가 이미 받는다. 고칠 곳은 `handleMessage`
안 한 갈래다 — §7 헤드리스.

### 언제 묻나 (확정 8 · 9)

**각 리그의 시즌 시작 전 주**에 묻는다. W1 고정이 아니다.

| 무대 | 첫 경기가 있는 주 | 근거 (코드) | **묻는 주** |
|---|---|---|---|
| 고교 | W7 (주말리그 개막) | `leagueScheduler.ts` 57줄 `HS_START_WEEK = 7` · 첫 대회 개나리기는 W9 (`leagueTeams.generated.ts` 633줄) | **W6** |
| 대학 | W5 (정규 개막) | 같은 파일 78줄 `UNIV_REGULAR_START_WEEK = 5` | **W4** |
| 독립 | W10 (1차 Stage) | `leagueTeams.generated.ts` 599줄 `startWeek: 10` | **W9** |
| 프로 1군 (KBL·ABL·JBL) | **W1** (시범경기) | `leagueScheduler.ts` 237~239줄 `PRESEASON_START_WEEK = 1` · 정규는 201줄 `PRO_START_WEEK = 5` | **W1** |
| 프로 2군 (KBL·ABL·JBL FARM) | W5 (정규 개막) | 시범경기는 **1군 셋만**이다 (같은 파일 240줄) | **W4** |
| 상무 | — | 주인공 경기 0 (§3) | **안 묻는다** (확정 9) |
| 현역 | — | 같음 | **안 묻는다** |

⚠ **프로 1군만 W1이다.** 시범경기가 W1~4에 팀당 12경기 있고(`PRESEASON_GAMES = 12`)
그 경기도 보직대로 던진다 — W4에 물으면 이미 12경기를 옛 보직으로 치른 뒤다.

⚠ 주차는 시즌마다 1부터다. `makeEmptySeason`이 `currentWeek: 0`으로 두고
(`types/season.ts`) `advanceWeek`가 `nextWeekNum = currentWeek + 1`로 부른다
(2860 · 2883줄) — **매 시즌 다시 묻는다.**

**시즌 중에 다시 묻는 자리** — 셋만 연다.

```
① 무대 이동 뒤 첫 주     고교→대학 · 대학→프로 · 드래프트 지명 · 독립 이적
② 콜업·강등 뒤 첫 주     seasonStore.switchProtagonistLeague 가 도는 자리
                         (stores/season.ts 707줄 · weekPhases/market.ts 1100줄)
③ 전역 뒤 첫 주          복무 중엔 아예 안 도므로(§1-d) 돌아왔을 때 한 번
```

🔴 **성적이 나빠서 다시 묻는 일은 없다** (확정 3). 시즌 중 재판정은 넣지 않는다.
한 번 고른 보직은 그 시즌 끝까지 간다. ①②③은 **팀이 바뀌어 경쟁 상대가 통째로
바뀐 경우**뿐이고, 이적·트레이드는 소식으로만 알린다.

🔴 **한 시즌에 한 번 가드를 반드시 저장한다.** `protagonist.lastRoleChoiceKey`
(예: `"2027:TEAM_KBL_X"`)를 `SaveGame`에 넣고 `fromSaveGame`에서 되살린다.
안 그러면 앱을 껐다 켤 때 같은 주에 또 묻는다 — 이 저장소가 이미 겪은 형태다
(CLAUDE.md "한 해에 한 번 가드는 반드시 저장한다").

---

## §5 추천이 아닌 자리를 고르면

### 안내 문안 — 숫자를 거의 안 쓴다 (확정 2)

**1단계 — 버튼을 눌렀을 때 (같은 자리에서 한 줄)**

```
지금 그 자리에 3명 있다. 거기에 더해 들어간다.

              [ 다시 고른다 ]   [ 그래도 간다 ]
```

`3` 하나가 전부다. 이 값은 `metadata.ahead[pick]`이고 정의는 이렇다.

```
ahead = min(rank − 1, seats)      그 자리를 이미 차지한 사람 수
```

- 자리 안이면 (`rank ≤ seats`) `ahead = rank − 1` — 앞선 사람 수 그대로다
- 자리 밖이면 (`rank > seats`) `ahead = seats` — 자리가 꽉 찼다는 뜻이다
- `rank = 1`이면 `ahead = 0`이 된다 — **문장이 다르다.** 아래 「문안」의 두 갈래가
  정본이고 판정 명세는 §7이다

**안 보여 주는 것** — 적합도 점수 · 순위 · 자리 수 · 등판 감소율. 결과로 알게 한다.

**2단계 — 확정 뒤 소식**

```
제목  {연도}시즌 보직 — 마무리
본문  감독은 선발을 권했지만 당신은 마무리를 택했다.
      팀에는 이미 그 자리를 맡은 투수가 있다.
      기회는 스스로 만들어야 한다.
```

숫자(`ahead`)는 **화면에서 계산하지 않는다.** 소식이 들고 온 `metadata`를 그대로
쓴다 — 두 벌이 되면 한쪽만 고쳐진 채 남는다.

### 문안 — B 안 (**합쇼체 확정** · 2026-09-03)

정본은 `resource/data/master/messages/role_choice.json` 이다. 여기 적힌 건
그 파일에서 옮긴 것이고, **어긋나면 파일이 맞다.**

🔴 **사용자 확정 — 말투는 합쇼체다.** 감독의 말이라도 소식함에서는 합쇼체로
쓴다. 계약 문안(`contract_terms.json`)과 같은 말투이고, 소식함에 둘이 나란히
보이는 자리라 통일했다.

**묻는 소식**

```
제목   {연도}시즌 보직
본문   올해 자리를 이렇게 봤습니다.
       체력이 팀에서 제일 낫습니다. 주말리그 한 경기를 끝까지 맡길 만합니다.
       어디서 던지겠습니까.
버튼   선발   중계   마무리        ← 추천에만 표시 하나
```

본문 둘째 줄은 **무대 다섯 × 보직 셋 = 15 변형**이다(파일 `recommend`).
첫 줄은 왜 지금 묻나에 따라 다섯(`lead`) — 개막 전 주 · 무대 이동 · 콜업 ·
강등 · 전역. 마지막 물음 한 줄은 `tail.ask` 하나다.

**확인 한 줄** — 추천이 아닌 버튼을 눌렀을 때

```
ahead ≥ 1   지금 그 자리에 {ahead}명 있습니다. 거기에 더해 들어갑니다.
ahead = 0   그 자리는 비어 있습니다. 감독 생각과는 다릅니다.

            [ 다시 고른다 ]   [ 그래도 간다 ]
```

⚠ **버튼은 합쇼체로 안 바꿨다.** 게임의 기존 선택지가 전부 이 꼴이다 —
「훈련한다」·「오늘은 쉰다」·「인터뷰에 응한다」(`decision_templates.json`).
본문만 합쇼체다.

**확정 소식**

```
제목   {연도}시즌 보직 — {보직}
본문   추천대로     올해는 선발로 갑니다.
       추천과 다름  추천은 중계였습니다. 마무리를 택했습니다.
                    기회는 스스로 만들어야 합니다.
```

🔴 **조사·서술격을 코드로 붙이지 않는다.** 굴절형을 데이터에 박았다
(`roleAs` · `roleObj` · `roleWas`). 받침 유무만 보는 규칙으로도 안 된다:

```
받침 ㄹ 은 「로」        선발로   (선발으로 아니다)
서술격은 받침이 있어야  선발이었습니다 / 중계였습니다   (중계이었습니다 아니다)
```

🔴 **감독 이름을 본문에 안 쓴다.** 「{manager}가 봤습니다」 는 「하주원가」 를
만든다 — 이름 뒤 조사는 받침에 따라 갈리는데 이름은 데이터로 못 박는다.
소식의 **보낸이 칸**이 이미 이름을 들고 있다(§4 `sender = 감독 이름`).

⚠ **소식 id 는 `msg-role-{year}-{teamId}-w{week}` 다** (확정 · §7).

### 어떻게 불이익을 주나

§1에서 찾은 세 자리에 각각 계수를 넣는다. 새 상태 하나로 전부 이어진다.

```ts
// ProtagonistSave 에 추가
roleFit?: {
  chosen: "SP" | "RP" | "CP";
  recommended: "SP" | "RP" | "CP";
  /** 고른 자리에서의 내 순위와 그 자리 수 */
  rank: number;
  seats: number;
};
```

**깊이 계수** 하나로 환산한다.

```
over = max(0, rank − seats)          자리보다 몇 칸 밖인가
depthFactor = clamp(1 − k × over, floor, 1)      [제안 k = 0.30 · floor = 0.15]
```

**k와 floor가 무슨 뜻인가** — 이름이 어려워서 풀어 쓴다. `depthFactor`는 **그 주에
마운드에 오를 확률을 얼마로 곱할지**다. 1.00이면 원래대로, 0.40이면 원래의 40%만
나간다.

| 내 자리 | `over` | `depthFactor` | 사람 말로 |
|---|---|---|---|
| 자리 안 | 0 | **1.00** | 불이익 없음. 원래대로 나간다 |
| 한 칸 밖 | 1 | **0.70** | 원래 나갈 경기의 열에 일곱 |
| 두 칸 밖 | 2 | **0.40** | 열에 넷 |
| 세 칸 밖 이상 | 3+ | **0.15** | 열에 하나 반 — 여기가 바닥이다 |

`k = 0.30`은 **한 칸 밀릴 때마다 30%씩 깎는다**는 뜻이고, `floor = 0.15`는
**아무리 밀려도 15%는 남긴다**는 뜻이다. 0이 되면 그 시즌 기록도 성장도 통째로
0이라 그 커리어가 되돌아올 길이 없다.

🔴 **이 두 값은 제안이다** (확정 11). 넣은 채로 두고, §7 7단계에서 실제 등판 수를
재서 **다시 묻는다.** 지금 정하면 근거 없이 정하는 것이다.

⚠ **추천을 따랐는데도 `over > 0`일 수 있다** — 세 자리 다 못 들어갈 때다(§8 12번).
그 경우도 같은 계수를 쓴다. **벌이 아니라 깊이다.**

#### (a) 선발 — 등판 자체를 건너뛴다

지금은 `is_protagonist_game`이 true면 무조건 던진다. 그 앞에 판정을 하나 넣는다.

```
자리   advanceWeek.ts 2962줄  `if (game.isProtagonistGame || relieverPitching)` 앞
새 함수 starterWouldStart(depthFactor, seed) → boolean      (Rust · player_engine.rs)
        확률 = depthFactor. 즉 두 칸 밖이면 그 주 등판 확률 40%
false 면  지금의 「등판하지 못했습니다」 경로로 자동 시뮬
```

🔴 **자동 시뮬을 `MainPage`의 회피 갈래로 보내지 않는다.** 그 갈래는
`playerLines: []`를 박아 넣어서 **그 경기의 선수 기록이 통째로 사라진다**
(CLAUDE.md "이주 전에 미해결로 남겼던 것"). `advanceWeek`의 `simulateGame`
갈래(3117줄 근처, 엔티티가 있는 쪽)로 돌려 팀 기록을 정상으로 남긴다.

#### (b) 불펜 — 등판 확률을 곱한다

```
자리   player_engine.rs  reliever_would_pitch
       base = reliever_appearance_chance(role)   ← 지금 표에서 「오프너」만 뺀다
새 항  base × depthFactor
배선   pitcherRoleEngine.relieverWouldPitch 에 인자 하나 추가
       advanceWeek 2949줄 호출부가 protagonist.roleFit 에서 계산해 넘긴다
```

⚠ `#[serde(default)]`라 **안 넘겨도 조용히 통과한다.** 이 저장소가 그 함정에
여러 번 걸렸다(상무 Phase 1 · `roll_random_batch` · `sim_game`). 검사는
**배선을 뺀 대조군**을 넣어 짠다 — 빼면 실패해야 그 검사가 배선을 보는 것이다.

⚠ **이 갈래는 고교·대학 정규에서 안 돈다.** `relieverPitching`의 첫 조건이
`!game.isProtagonistGame`인데(advanceWeek 2947줄), 권역 스케줄러가 만든 경기는
팀 경기가 **전부** `is_protagonist_game: true`다(`schedule_engine.rs` 155줄).
고교·대학 정규에서 불펜 등판 확률표는 **한 번도 안 읽힌다.**

#### (c) 경기 안 진입 — 문턱을 늦춘다

```
자리   match_engine.rs  create_initial_match_state 의 entry_trigger 기본값 (363~372줄)
지금   SP → InningStart { inning: 1 }
       RP → MidInning  { inning: 5|6|7 (감독 bullpenRead 70/40), max_outs: 3, score_diff_cap: 6 }
       CP → CloseGame  { inning_threshold: 8|9 (감독 clutchDecision 70),
                         max_lead_diff: 3, min_lead_diff: 1 }
새로   over > 0 이면
         RP  inning += over,  score_diff_cap −= 2×over   (지는 경기에만 나온다)
         CP  inning_threshold += over, max_lead_diff −= over  (여유 있는 상황만)
배선   MatchStartOptions 에 `role_depth: Option<i32>` 를 더한다
       MainPage 406줄이 activeMatchContext 에 실어 보낸다
```

이 셋이 겹치면 "3순위 마무리"는 **주 1경기에 나올까 말까**가 된다. 그게 기획의
목적이다 — 다만 **완전히 0이 되면 안 된다.** `floor 0.15`가 그 바닥이다.

### 되돌아오는 길

불이익은 **한 시즌짜리**다. 다음 시즌 개막 전 주에 다시 묻고, 그 사이 능력치가
자랐으면 순위가 오른다. 시즌 중에는 안 바꾼다(확정 3).

---

## §6 발견 셋을 이 기획이 어떻게 닫나

| 발견 | 닫는 방법 |
|---|---|
| **마무리 진입로 없음** | §3 ①이 `fitCP`로 마무리를 **먼저** 뽑고, §4 소식이 [마무리] 버튼을 **항상** 보여 준다. `position === "CP"`가 아니어도 CP가 될 수 있으므로 순환이 끊긴다. `assign_protagonist_role`의 `position`으로 갈리는 구조 자체를 없앤다 |
| **RP 잠김** | 위와 같은 이유로 저절로 닫힌다. 새 산식은 **직전 `position`을 아예 안 본다** — 매 시즌 세 자리를 다시 겨룬다. 고교가 이미 그렇게 돌고 있고 그쪽엔 이 잠금이 없다 |
| **오프너** | **닫지 않고 지운다** (확정 7). 오프너는 능력치가 아니라 팀 운영 방식이라 이 산식으로는 안 나온다. 네 자리에서 항목을 뺀다(§3) — 안 나오는 항목이 규칙처럼 남아 있는 것보다 없는 편이 낫다 |

덤으로 §1의 넷 중 셋이 같이 닫힌다.

- **a (자리 수 불일치)** — §3이 `rotationSize`를 읽으므로 대학에서 4·5선발이 사라진다
- **b (세부 보직이 등판에 무영향)** — §5 (a)가 선발 깊이를 등판에 연결한다
- **c (`starterSlot` 미사용)** — 세부 보직 이름을 만들 때 이 함수를 실제로 쓴다

**d(복무 중 배정 없음)는 안 닫는다.** 상무에도 안 묻기로 확정했다(확정 9 ·
§8 ②). 복무 중엔 주인공 경기가 0이라 물어도 정할 게 없다 — **상무 경기가 생기는
1.1 상무 탭 때 다시 본다.**

---

## §6-1 고교에 마무리를 두려면 — 엔진 명세 (확정 5)

사용자 확정이다. **고교도 마무리를 둔다.** 방법까지 같이 정해졌다 —
"고교도 엔진 수정해서 마무리까지 가지. 선발을 좀 줄이면 중계 원래 던지던 게
확보되고 마무리 하면 되겠지."

**선발이 먹는 이닝을 줄여 불펜 이닝을 만들고, 그 안에 마무리 자리를 연다.**
자리를 먼저 만들고 이름은 그다음이다.

⚠ 이 절도 **기획만**이다. 아래 값은 전부 [제안]이고 코드는 한 줄도 안 고쳤다.
electron 도 안 띄웠다 — 등판 수는 **아직 안 쟀고**, 재는 계획을 6-1-5에 적었다.

### 6-1-1. 지금 고교 경기가 어떻게 굴러가나 (코드에서 읽은 것)

| 무엇 | 값 | 자리 |
|---|---|---|
| 이닝 | **9이닝** | `match_engine.rs` 394줄 `opts.inning_limit.unwrap_or(9)` — 넘기는 호출부가 **하나도 없다.** 고교도 9이닝이다 |
| 콜드게임 | 5회 10점차 · 7회 7점차 | `match_engine.rs` 2712~2714줄 (`npc_sim.rs` 757줄에 같은 값이 두 벌) |
| 리그 투구수 상한 | 고교 **105** · 그 밖 120 | `tuning.rs` 174~180줄 `league_pitch_limit`. 소프트캡은 ×0.75 (183줄) |
| 의무 휴식 | 투구수별 0~5일 | `rest_rules.rs` 15~24줄. 96구 이상이면 5일 — 105구면 주말 연투가 막힌다 |
| 주인공 선발 아웃 예산 | `round(12 + 스태미나상한/99 × 15)` | `match_engine.rs` 549~556줄. **리그를 안 가른다** |
| NPC 선발 아웃 예산 | 같은 식 + 흔들림 ±3 + 감독 `bullpenRead` 보정 | 같은 파일 567~584줄 `queue_max_outs` |

스태미나 상한 60이면 21아웃(7이닝), 99면 27아웃(9이닝)이다. **9이닝 경기에서
선발이 7이닝을 먹으면 불펜 몫이 2이닝**이고, 그 2이닝을 중계 하나가 먹으면
마무리가 설 자리가 없다. 사용자가 말한 게 이 산수다.

🔴 **주인공 경기에는 고교 105구가 안 걸린다** (2026-09-03 · 코드 실측 · 새 결함).

```
주인공 경기 호출부 둘
  MainPage.svelte        234줄   matchSimulateToEntry(...)  leagueId 를 안 넘긴다
  runAutoAdvance.ts       95줄   같다
→ opts.league_id = None → league_pitch_limit("") = 120.0 · soft = 90.0
   (match_engine.rs 456~457줄이 그 값을 MatchState 에 박는다)

자동 시뮬 갈래(simulateGame)는 넘긴다 — advanceWeek.ts 2730 · 2806 · 3124줄에
"⚠ leagueId를 넘긴다. 안 넘기면 리그별 분기(…투구수 상한)가 통째로 안 걸린다"
는 주석까지 붙어 있다. **주인공이 직접 던지는 갈래만 빠졌다.**
```

즉 지금 고교 주인공 선발은 **프로와 같은 120구/90구**로 던진다. 마무리 이전에
이것부터다 — 값을 새로 정하는 게 아니라 **이미 있는 값이 안 걸리는 것**이다.

### 6-1-2. 선발 이닝을 줄이는 자리 — 셋

| # | 무엇 | 어디 | 제안 |
|---|---|---|---|
| ① | `leagueId` 배선 | `MainPage.svelte` 234줄 · `runAutoAdvance.ts` 95줄 | **넘긴다.** 고교 105 / 78.75(=105×0.75)가 걸린다. **값 변경 0 — 배선만이다** |
| ② | 리그 투구수 상한을 규칙 파일로 | 지금 정본은 `tuning.rs` 174줄 하드코딩 | `rosterOpsRules.starterPitchLimit` 신설 · `LEAGUE_HIGHSCHOOL` **85~95** [제안] · 그 밖 120. Rust 는 읽기만 한다 |
| ③ | 선발 아웃 예산에 리그 계수 | `protagonist_max_outs` 549줄 · `queue_max_outs` 574줄 | `rosterOpsRules.starterOutsFactor.LEAGUE_HIGHSCHOOL` **0.80** [제안] → 스태미나 60이면 21 → **17아웃(5⅔이닝)** |

**왜 셋 다인가.** ②만 낮추면 맞춰 잡는 투수는 투구수가 안 차서 여전히 9이닝을
간다. ③만 낮추면 투구수가 많은 경기에서 105구를 넘긴다. ①이 없으면 ②가 걸릴
자리 자체가 없다. 셋이 **같은 한 벌**이다.

**③이 만드는 불펜 이닝** — 27아웃 중 선발이 17이면 남는 건 10아웃이다.
중계가 6아웃(2이닝), 마무리가 3아웃(1이닝)이면 자리가 셋으로 갈린다.
지금(21아웃)은 남는 게 6아웃뿐이라 둘로도 빠듯하다.

**값의 근거** — 실제 고교야구는 대회 규정으로 투구수를 제한하고, 게임도 그걸
105로 잡아 뒀다(`tuning.rs` 169~172줄 주석이 "성장기 보호"라고 적고 있다).
투구수 제한이 있으면 **의무 휴식이 붙고, 분업이 생긴다** — 그건 현실에도 있다.
다만 프로식 전문 마무리(8~9회 1~3점 리드 전용)는 고교에 드물다. 그래서 자리는
열되 **문을 프로만큼 좁게 두지는 않는다**(6-1-3).

🔴 **85~95도 0.80도 제안이다.** 6-1-5 계측 뒤 사용자가 확정한다. 밸런스 동결
규칙대로 **한 번에 하나씩** 움직인다.

### 6-1-3. 마무리 진입 문 — 두 안과 제안

지금 (`match_engine.rs` 363~372줄이 기본값을 만들고 1746~1751줄이 판정한다):

```
CP → CloseGame { inning_threshold: 감독 clutchDecision ≥ 70 이면 8, 아니면 9,
                 max_lead_diff: 3, min_lead_diff: 1 }
```

| 안 | 내용 | 무슨 일이 생기나 |
|---|---|---|
| **A. 그대로 둔다** | 고교도 8\|9회 · 리드 1~3 | 세이브 상황의 뜻이 프로와 같아 설명이 하나다. 다만 고교는 콜드게임(7회 7점차)이 잦아 **8회가 아예 없는 경기**가 생기고, 경기가 20+α뿐이라 등판이 얇아진다 |
| **B. 고교만 넓힌다** | 7회 이후 · 리드 1~4 | 등판은 확실히 는다. 대신 7회는 **중계와 겹친다** — `MidInning{5\|6\|7}`과 같은 회차라 셋으로 나눈 뜻이 줄어든다 |

**제안 — 둘 사이 하나.** 고교만 `inning_threshold`를 **8 고정**으로 두고(감독
`clutchDecision`을 안 본다) 리드 폭은 **1~3 그대로**.

```jsonc
"closerGate": {
  "LEAGUE_HIGHSCHOOL": { "inningThreshold": 8, "maxLeadDiff": 3, "minLeadDiff": 1 }
}
```

- 9회로 밀리는 감독(`clutchDecision < 70`)이 없어져 **문이 한 회 넓어진다**
- 7회로는 안 내려서 중계와 안 겹친다
- 콜드게임으로 8회 전에 끝난 경기는 애초에 기회가 없다 — 그건 이 값으로 못 푼다

🔴 밸런스라 **사용자 확정**이다. 6-1-5에서 A·B·제안 셋을 같은 씨앗으로 잰다.

### 6-1-4. 고교 마무리가 실제로 등판하는 길 — 어디를 고치나

⚠ **불펜 등판 확률표는 고교에서 안 읽힌다.** 그런데 그게 막는 게 아니다.

```
advanceWeek.ts 2947줄    relieverPitching 의 첫 조건이 !game.isProtagonistGame
schedule_engine.rs 155줄 고교·대학은 팀 경기가 전부 is_protagonist_game: true
→ 고교 주인공은 그 표(마무리 0.55)를 한 번도 안 탄다
```

고교 주인공은 **매 경기 경기 엔진에 들어가 진입 판정을 받는다.** 그래서 등판을
여는 자리는 확률표가 아니라 아래 셋이다.

| # | 자리 | 지금 | 할 일 |
|---|---|---|---|
| 1 | `advanceWeek.ts` 221~226줄 | 고교 갈래가 `setPosition("SP"\|"RP")` 둘만 낸다. `currentRole`도 `"1선발"`/`"중간계투"` 고정이다 | **CP 가 나올 수 있어야 한다.** 이 기획은 이 갈래를 §4 소식으로 통째로 대체한다 — 고른 값이 `"cp"`면 `setPosition("CP")` · `setCurrentRole("마무리")` |
| 2 | `MainPage.svelte` 242 · 406줄 · `runAutoAdvance.ts` 116줄 | `role: (p.position as "SP"\|"RP"\|"CP") ?? "SP"` 를 그대로 넘긴다 | **안 고친다.** `position`이 `CP`면 `create_initial_match_state`가 `CloseGame` 트리거를 알아서 건다(363~372줄). 배선이 이미 되어 있다 |
| 3 | 같은 호출부의 `leagueId` | 안 넘긴다 | **넘긴다** (6-1-2 ①) |

🔴 **`!game.isProtagonistGame` 조건은 안 뒤집는다.** 그 갈래는 "주인공이 화면으로
안 뛰는 경기의 불펜 등판"용이고 고교엔 대상 경기가 없다. 조건을 뒤집으면 같은
경기를 두 경로가 함께 처리한다 — 등판이 두 번 기록되는 형태다.

⚠ **딸려 오는 구멍 하나 — 고교 마무리에는 의무 휴식이 안 걸린다.**
`rest_rules::check_rest`를 부르는 건 `reliever_would_pitch` 하나뿐이다
(`player_engine.rs` 200~208줄). 고교는 그 함수를 안 타므로 마무리를 고른 고교
주인공은 **토·일 연투가 안 막힌다.** 주말리그가 이틀 연속이라 실제로 생긴다 —
`rest_rules.rs` 머리 주석이 바로 그 경우를 적어 두고 있다.
→ 진입 판정 앞에 같은 검사를 한 번 건다. 재료는 이미 세이브에 있다
(`lastPitchedDate` · `lastPitchCount` · `types/season.ts` 385~397줄).
**이건 기획이 아니라 결함이다** — §7 6단계에서 같이 닫는다.

⚠ **§5 (b) 불펜 등판 확률 감소는 고교에 안 걸린다.** 같은 이유다. 고교의
`depthFactor`는 **(a) 선발 등판 건너뛰기 · (c) 진입 문턱 늦추기 둘로만** 작동한다.
검사(`roleDepthWiring.test.ts`)에 고교 갈래를 따로 둔다 — 안 그러면 "고교에서
안 걸린다"가 결함인지 설계인지 코드만 봐서는 못 가린다.

### 6-1-5. 검증 — 무엇을 어떻게 재나

**전후 비교다.** 값 하나만 움직이고 나머지는 고정한다.

```
프로브   npm run probe:rolefit  (§7 신설) 에 고교 갈래를 더한다
씨앗     3개 고정 — 같은 씨앗으로 전·후를 돌린다
표본     고교 3년 × 씨앗 3 · 주말리그 20경기 + 전국대회 다섯(단판)
정책     globalThis.__PB_ROLE_CHOICE = "cp" 로 고정해 마무리만 본다
```

| 지표 | 왜 재나 |
|---|---|
| 마무리 시즌 등판 수 (평균·최소·최대) | **이 기획이 됐는지의 유일한 잣대다.** 0에 가까우면 안 연 것과 같다 |
| 세이브 상황이 생긴 경기 비율 | 문(6-1-3)이 넓은지 좁은지를 가른다 |
| 콜드게임으로 끝난 경기 비율 | 8회가 없어서 못 나온 몫이다 — 값으로 못 푸는 부분을 먼저 떼어 낸다 |
| 선발 평균 이닝 · 평균 투구수 | 6-1-2가 실제로 걸렸는지. ①만 해도 여기가 움직여야 한다 |
| 불펜이 던진 이닝 합 | "선발을 줄여 불펜 이닝을 만든다"가 됐는지 |
| 마무리 주인공의 시즌 이닝·기록 | 드래프트 평가가 이 기록에 기댄다 — 얇아지면 고교 3년이 손해다 |

**돌리는 순서** (각 단계마다 씨앗 3을 같은 값으로):

```
0  지금 그대로                     기준선
1  ① leagueId 배선만               105구가 걸린 뒤
2  ② 투구수 상한 85 / 95            둘을 따로 — 하나씩만 움직인다
3  ③ 아웃 예산 계수 0.80            ②의 확정값 위에서
4  6-1-3 의 A / B / 제안            문 셋
```

🔴 **한 번에 둘을 안 움직인다.** 두 변수를 같이 밀면 원인을 못 가린다 —
이 저장소가 반복해 겪은 형태다(CLAUDE.md 머리).

---

## §7 구현 명세

### 파일

| 층 | 파일 | 할 일 |
|---|---|---|
| 규칙 | `resource/data/master/players/generation_rules.json` | 새 키 `pitcherRoleRules` (아래) |
| 규칙 | 같은 파일 `rosterOpsRules` | `bullpenSize` 추가 (§3 표) · `starterPitchLimit` · `starterOutsFactor` · `closerGate` 추가 (§6-1) |
| 화면·자동 | `pages/main/MainPage.svelte` 234줄 · `usecases/runAutoAdvance.ts` 95줄 | `matchSimulateToEntry` 에 **`leagueId` 를 넘긴다** — 지금 안 넘겨 고교 105구가 주인공 경기에 안 걸린다 (§6-1-1) |
| Rust | `match_engine.rs` `protagonist_max_outs`(549줄) · `queue_max_outs`(567줄) | 리그 계수 `starterOutsFactor` 반영 (§6-1-2 ③) |
| Rust | `tuning.rs` 174 · 183줄 | 하드코딩된 105/120 을 규칙 파일에서 읽는다 — Rust 는 읽기만 |
| Rust | `match_engine.rs` 363~372줄 | 고교 `CloseGame` 기본값을 `closerGate` 에서 읽는다 (§6-1-3) |
| Rust | `match_engine.rs` `should_protagonist_enter` 앞 | **의무 휴식 검사**를 건다 — 고교 마무리는 `reliever_would_pitch` 를 안 타서 연투가 안 막힌다 (§6-1-4) |
| Rust | `packages/engine-native/src/player_engine.rs` | `recommend_pitcher_role(params) -> RecommendResult` 신설. `assign_highschool_position`·`assign_protagonist_role`은 **남긴다**(구 세이브 경로) |
| Rust | 같은 파일 149줄 | `reliever_appearance_chance`에서 「오프너」 갈래 삭제 |
| Rust | 같은 파일 `reliever_would_pitch` | `depth_factor: Option<f64>` 추가 |
| Rust | 새 함수 `starter_would_start` | 씨앗 · `depth_factor` |
| Rust | `packages/engine-native/src/match_engine.rs` | `create_initial_match_state`의 `entry_trigger` 기본값에 `role_depth` 반영 |
| Rust | `packages/engine-native/src/lib.rs` | `#[napi]` export (`#[serde(rename_all = "camelCase")]` 필수) |
| TS | `apps/ui/src/shared/utils/pitcherRoleEngine.ts` | `recommendPitcherRole(...)` — **재료만 모아 넘긴다** · 142·151줄 「오프너」 삭제 |
| TS | `apps/ui/src/shared/utils/pitcherRoleRules.ts` (신설) | `primePitcherRoleRules()` — `rosterEngine`과 같은 방식 |
| TS | `apps/ui/src/shared/stores/master.ts` 1070줄 블록 | `primePitcherRoleRules(genRules)` 한 줄 추가 |
| TS | `apps/ui/src/shared/usecases/pitcherRole.ts` (신설) | `askRoleChoice()` — 소식 한 통을 만들어 `gameStore.addMessage` |
| TS | `apps/ui/src/shared/usecases/decisions.ts` | `applySideEffects`에 `roleChoice` 갈래 — **화면·헤드리스가 같은 함수를 부른다** |
| TS | `apps/ui/src/shared/usecases/advanceWeek.ts` | W1 갈래(218~259줄)를 지우고 **리그별 개막 전 주**로 옮긴다 · 2949줄 `relieverWouldPitch` 호출에 깊이 전달 · 2962줄 앞에 `starterWouldStart` |
| TS | `apps/ui/src/shared/usecases/runAutoAdvance.ts` | `handleMessage`에 보직 소식 갈래 (아래 헤드리스) |
| 타입 | `apps/ui/src/shared/types/main.ts` | `MessageItem.metadata`에 `RoleChoiceMetadata` · `DecisionEffect.roleChoice?: "SP" \| "RP" \| "CP"` |
| 타입 | `apps/ui/src/shared/types/save.ts` | `ProtagonistSave.roleFit` · `lastRoleChoiceKey` · 73줄 「오프너」 삭제 |
| 화면 | `apps/ui/src/features/messages/ui/RoleChoicePanel.svelte` (신설) | 소식 상세 안 선택 영역. `.dec`/`.opt` 규칙을 그대로 따른다 |
| 화면 | `apps/ui/src/pages/news/NewsPage.svelte` 310줄 | `metadata.type === "roleChoice"`면 `.dec` 대신 `RoleChoicePanel` |
| 화면 | `apps/ui/src/pages/status/StatusPage.svelte` | 같은 갈래 (여기도 `decision`을 그린다) |

🔴 **`PendingAction`도 `PENDING_ACTION_TYPES`도 안 건드린다.** 소식이 이미
`{type:"message"}`로 멈춘다(§4).

### 규칙 파일 키 (제안)

```jsonc
"pitcherRoleRules": {
  "_note": "투수 보직 추천 (2026-09-__). 가중치를 코드에 두지 않는다",
  "weights": {
    "SP": { "stamina": 0.28, "control": 0.18, "command": 0.14, "arsenal": 0.20,
            "velocity": 0.10, "recovery": 0.06, "movement": 0.04 },
    "RP": { "velocity": 0.30, "movement": 0.24, "command": 0.14, "control": 0.10,
            "clutch": 0.10, "arsenal": 0.07, "stamina": 0.05 },
    "CP": { "velocity": 0.26, "mentality": 0.22, "clutch": 0.20, "control": 0.15,
            "movement": 0.09, "arsenal": 0.05, "holdRunners": 0.03 }
  },
  "arsenal": {
    "SP": { "count": 0.40, "countCap": 5, "gradeAvg": 0.35, "groups": 0.25 },
    "RP": { "count": 0.20, "countCap": 4, "gradeBest2": 0.60, "groups": 0.20 },
    "CP": { "count": 0.15, "countCap": 3, "gradeBest": 0.70, "groups": 0.15 }
  },
  "reliefTiers": { "setup": 78, "middle": 65, "long": 55, "swing": 60 },
  "offRecommendation": { "perSeatOver": 0.30, "floor": 0.15 },
  "askWeek": {
    "_note": "각 리그의 시즌 시작 전 주 (§4 표). 개막 주에서 1을 뺀 값이고, 프로 1군만 시범경기 때문에 W1이다",
    "LEAGUE_HIGHSCHOOL": 6,
    "LEAGUE_UNIVERSITY": 4,
    "LEAGUE_INDEPENDENT": 9,
    "LEAGUE_KBL": 1, "LEAGUE_ABL": 1, "LEAGUE_JBL": 1,
    "default": 4
  },
  "stages": {
    "_note": "고교도 마무리를 둔다 (확정 5). 세부 이름(1~3선발)은 아직 안 준다 — §6-1",
    "LEAGUE_HIGHSCHOOL": { "allowCloser": true, "detailedRoles": false }
  }
}
```

고교 마무리를 여는 값 셋은 **운영 규칙 쪽**에 둔다 — 보직 추천이 아니라 경기 운용이다.

```jsonc
"rosterOpsRules": {
  "starterPitchLimit": {
    "_note": "선발 투구수 상한 (§6-1-2 ②). 지금은 tuning.rs 174줄 하드코딩이 정본이다 — 옮기면 Rust 는 읽기만 한다",
    "LEAGUE_HIGHSCHOOL": 90,        // [제안] 85~95 · 실제 고교 규정 상한 105 보다 앞에서 내린다
    "default": 120
  },
  "starterOutsFactor": {
    "_note": "선발 아웃 예산 계수 (§6-1-2 ③). protagonist_max_outs · queue_max_outs 에 곱한다",
    "LEAGUE_HIGHSCHOOL": 0.80,      // [제안] 스태미나 60 이면 21 → 17아웃
    "default": 1.0
  },
  "closerGate": {
    "_note": "마무리 진입 문 (§6-1-3). 비면 지금 기본값(감독 clutchDecision 으로 8|9회)을 쓴다",
    "LEAGUE_HIGHSCHOOL": { "inningThreshold": 8, "maxLeadDiff": 3, "minLeadDiff": 1 }
  }
}
```

⚠ 셋 다 **[제안]이고 밸런스다.** §6-1-5 계측 뒤 사용자가 확정한다.

`rotationSize`는 **여기 다시 적지 않는다.** `rosterOpsRules.rotationSize`가 정본이고
`rosterEngine.rotationSizeForLeague()`로 읽는다 — 두 벌이 되면 한쪽만 고쳐진 채 남는다.
`askWeek`도 개막 주 상수(`HS_START_WEEK` 등)에서 계산해 **검사로 대조한다**(아래).

### 소식 id 와 `ahead` — 코드 명세 (확정)

#### 소식 id — `msg-role-{year}-{teamId}-w{week}`

**세 조각이 다 필요하다.** 하나씩 빼 보면 왜인지 나온다.

| 쓰는 것 | 겹치는 경우 |
|---|---|
| `msg-role-{year}` | 무대 이동·콜업·전역으로 **한 해에 두 번** 묻는다(§4 ①②③) |
| `msg-role-{year}-{teamId}` | **같은 팀에서 두 번**이 남는다 — 1군 → 2군 → 1군 |
| `msg-role-{year}-{teamId}-w{week}` | 겹칠 길이 없다. 같은 팀·같은 주에 두 번 묻는 트리거가 없다 |

`1군 → 2군 → 1군`이 한 시즌 안에 되는 근거다.

```
콜업·강등이 도는 자리   weekPhases/market.ts 1096~1104줄 — 주간 시장 갈래다
1군·2군 팀 id           `_1` / `_2` 로 다르다 (같은 파일 1025줄 · 테스트 T_A_1/T_A_2)
강등 잠금               demotionLockWeeks: 2   (generation_rules.json 1267줄)
→ 2주만 지나면 재등록이 열린다. 프로 정규는 W5~W26 이라 왕복이 남는다
```

같은 꼴이 이미 있다 — `msg-demote-{year}-w{week}-{첫 대상 id}`(market.ts 1053줄).
**주차를 id 에 넣는 건 이 저장소의 기존 규칙이다.**

가드도 **같은 세 조각**으로 맞춘다.

```
protagonist.lastRoleChoiceKey = `${seasonYear}:${teamId}:W${weekNum}`
```

- 같은 주에 앱을 껐다 켜면 키가 같다 → **다시 안 묻는다** (원래 가드의 목적)
- 주가 다르면 키가 다르다 → §4 ①②③ 트리거가 살아 있다
- 트리거가 개막 전 주 하나 + 이동 셋뿐이라, 주차를 넣어도 시즌에 여러 번 안 물린다

🔴 **둘이 같은 세 조각이어야 한다.** 한쪽만 주차를 빼면 두 갈래로 깨진다 —
가드에만 없으면 같은 주에 새 소식이 계속 생기고, id 에만 없으면 소식 키가 겹쳐
**세이브가 안 열린다.** 검사(`roleMessageId.test.ts`)가 둘을 같이 본다.

#### `ahead` — 두 갈래

메타데이터에 싣는 숫자 하나다. **화면은 계산하지 않는다**(§4).

```
ahead[x] = min(rank[x] − 1, seats[x])        x ∈ {sp, rp, cp}
```

| 조건 | 무슨 뜻인가 | 문장 (§5 문안이 정본) |
|---|---|---|
| `ahead ≥ 1` | 그 자리를 이미 차지한 사람이 있다 | 지금 그 자리에 {ahead}명 있다. 거기에 더해 들어간다. |
| `ahead = 0` | `rank = 1` — 그 자리에서 내가 맨 앞이다 | 그 자리는 비어 있다. 감독 생각과는 다르다. |

**`ahead = 0`은 언제 나오나.** `rank[x] = 1`인데 추천이 `x`가 아닐 때다.
추천은 들어갈 수 있는 자리 중 **적합도가 가장 높은 곳**이라(§3),
`rankCP = 1`이면서도 `fitSP > fitCP`면 추천은 선발이고 마무리를 누르면
`ahead = 0`이 된다. **자리가 비어서 안 뽑힌 게 아니라, 다른 자리가 더 맞아서
안 뽑힌 것이다.**

```ts
// RoleChoicePanel — 갈래는 여기 하나뿐이다
const ahead = meta.ahead[pick];              // 0 이상. 화면에서 다시 계산하지 않는다
const line  = ahead >= 1
  ? `지금 그 자리에 ${ahead}명 있다. 거기에 더해 들어간다.`
  : "그 자리는 비어 있다. 감독 생각과는 다르다.";
```

⚠ `seats = 0`은 이 갈래에 안 온다. 자리가 0인 무대는 **그 버튼 자체를 안 그린다**
(`stages.*.allowCloser: false`). 지금은 그런 무대가 없다 — 고교도 마무리를 둔다
(확정 5 · §6-1).

⚠ **추천 버튼은 이 갈래에 안 온다** — 확인 단계 자체가 추천이 아닌 버튼에만
뜬다(§4 · 사용자 요구 3). 확정 12는 **문구를 갈래로 나누지 마라**는 뜻이고,
그래서 문장은 `ahead` 두 갈래가 전부다. 추천 전용 문장을 새로 만들지 않는다.

### 헤드리스 정책

**헤드리스가 뭔가** — 사람이 화면을 안 보고 게임을 자동으로 돌리는 경우다. 자동
진행(`runAutoAdvance`)과 계측 스크립트(`scripts/probe-*.cjs`)가 그렇다. 선택지가
뜨면 **누를 사람이 없으므로**, 어느 버튼을 누른 셈 칠지 미리 정해 둬야 한다.

**기본값은 「추천대로」다** (확정 10). 계측이 "감독 말을 따랐을 때"를 기준선으로
잡고, 거기서 벗어난 선택의 효과를 그 기준선과 견줘 잰다.

```
globalThis.__PB_ROLE_CHOICE   "recommend"(기본) | "sp" | "rp" | "cp"
읽는 자리                      runAutoAdvance.ts  handleMessage 안 한 곳
                               msg.metadata?.type === "roleChoice" 면
                               pickChoice(...) 대신 이 정책을 본다
받는 자리                      scripts/probe-*.cjs · scripts/perf/*.cjs
                               globalThis.__PB_ROLE_CHOICE = process.env.PB_ROLE_CHOICE || "recommend"
                               (__PB_MIL_CHOICE 와 같은 줄 · probe-paths.cjs 34줄)
```

⚠ 지금 `handleMessage`(runAutoAdvance.ts)는 `pickChoice(options, fatigue)`라는
**일반 휴리스틱**으로 아무 선택지나 고른다. 보직 소식이 거기로 들어가면
피로 값에 따라 보직이 정해진다 — 갈래를 반드시 넣는다.

### 검사

| 이름 | 무엇을 보나 |
|---|---|
| `pitcherRoleFit.test.ts` (신설 · vitest) | 가중치가 **규칙 파일에서 온다** — 코드에 숫자 리터럴이 없다 |
| `pitcherRoleSeats.test.ts` (신설) | 자리 수를 `rotationSizeForLeague`·`bullpenSize`로 읽는다 · 대학에서 4선발이 안 나온다 · **세 자리 합 = rosterMin 기준 투수 수** |
| `roleAskWeek.test.ts` (신설) | `askWeek`가 개막 주 상수와 맞는다 (`HS_START_WEEK − 1` 등) · 캘린더를 바꾸면 여기서 깨진다 |
| `roleChoiceMessage.test.ts` (신설) | 소식이 `decision.selectedOptionId === null`로 들어간다 · advanceWeek이 `{type:"message"}` pending으로 멈춘다 · `runAutoAdvance`가 정책대로 고른다 |
| `openerRemoved.test.ts` (신설) | 「오프너」가 네 자리 어디에도 없다 · 옛 세이브의 `"오프너"`가 로드에서 안 터진다 |
| `pitcherRoleLive.test.ts` (기존) | 세부 능력치도 live 우선으로 읽는지로 **범위를 넓힌다** |
| `roleDepthWiring.test.ts` (신설) | `depthFactor`가 호출부에서 실제로 넘어간다. **대조군 포함** — 인자를 빼면 실패해야 한다 |
| `npm run measure:role` (기존 확장) | 고교 102팀 × 프리셋 4의 **추천 분포**. 지금은 SP/RP 둘만 센다 |
| `roleMessageId.test.ts` (신설) | 소식 id 와 `lastRoleChoiceKey` 가 **같은 세 조각**(연도·팀·주차)이다 · 1군 → 2군 → 1군 왕복에서 id 가 안 겹친다 |
| `roleAheadCopy.test.ts` (신설) | `ahead ≥ 1` / `ahead = 0` 두 문장이 나온다 · `ahead` 를 화면에서 다시 계산하지 않는다(메타데이터를 그대로 쓴다) |
| `hsCloserWiring.test.ts` (신설) | 고교에서 `position: "CP"` 가 나온다 · `matchSimulateToEntry` 호출부 둘이 `leagueId` 를 넘긴다(**대조군 포함**) · 고교 마무리에 의무 휴식이 걸린다 (§6-1-4) |
| `npm run probe:rolefit` (신설) | 무대별 추천/선택/실제 등판 수. `__PB_ROLE_CHOICE`를 넷 다 돌려 비교 · **고교 마무리 등판 수 분포**를 씨앗 3으로 전후 비교 (§6-1-5) |

⚠ 검사는 **실제 엔진 호출**로 짠다. 규칙 파일·Rust 소스만 읽는 검사는 배선 누락을
못 잡는다(CLAUDE.md "층마다 맞는데 잇는 선이 없다").

### 순서

```
1  규칙 파일 키 + prime + vitest              (게임 동작 변화 0)
2  「오프너」 삭제 + openerRemoved.test         (동작 변화 0 — 안 나오던 항목이다)
3  Rust recommend_pitcher_role + export       (아직 아무도 안 부른다)
4  measure:role 확장 → 추천 분포를 **먼저 본다**   ← 사용자 확정 지점
5  소식 + RoleChoicePanel + handleMessage 갈래  (여기서 화면이 바뀐다)
   · 소식 id · lastRoleChoiceKey · ahead 두 갈래가 여기 다 들어간다
6  §5 불이익 (a)(b)(c)                          ← 밸런스라 사용자 확정 지점
   · 고교 의무 휴식 구멍(§6-1-4)을 같이 닫는다 — 결함이라 값 확정을 안 기다린다
7  probe:rolefit 로 전후 비교 → k·floor 재확정    ← 확정 11이 여기로 돌아온다
8  §6-1 고교 마무리 — leagueId 배선 → 투구수 상한 → 아웃 예산 → 진입 문
   각 칸마다 씨앗 3으로 전후 비교      ← 밸런스라 칸마다 사용자 확정 지점
```

4와 6 사이에 **사용자 확정을 두 번 받는다.** 산식과 불이익을 한꺼번에 넣으면
어느 쪽이 원인인지 못 가린다. 8도 같은 이유로 **네 칸을 따로 잰다**(§6-1-5).

⚠ 8은 7보다 뒤다. 고교 마무리는 **보직 선택이 먼저 돌아야** 고를 수 있는 자리라
1~7이 끝나기 전에는 잴 대상이 없다.

⚠ **계약 기획 `PLAN_CONTRACT_TERMS` §5-3·§7 이 이 문서를 선행 조건으로 본다** —
인센티브 축이 보직 셋과 1:1이고 「그 시즌 보직」의 정의를 §4 표에서 가져간다.
여기 순서가 밀리면 그쪽 ⑤도 같이 밀린다.

---

## §8 사용자 확정 (2026-09-03)

**열둘 다 확정이고, 남겨 뒀던 둘도 같은 날 닫혔다.** §2~§7·§6-1 을 이 표대로
고쳤다. **이 표가 정본이다** — 본문과 어긋나면 표가 맞다.

| # | 물음 | **확정** | 반영한 곳 |
|---|---|---|---|
| 1 | 추천을 거스르면 감독 관계도 깎나 | **안 깎는다.** 불이익은 등판 감소 하나뿐 | §2 감독 관계 |
| 2 | 결과를 어디까지 보여 주나 | **한 줄뿐이다** — "지금 그 자리에 N명 있다. 거기에 더해 들어간다"(`ahead = 0`이면 다른 문장 · 아래 「구멍 둘」). 적합도·순위·등판 감소율은 안 보여 준다 | §5 문안 · §4 확인 단계 |
| 3 | 시즌 중 재판정 | **없다.** 한 번 고르면 그 시즌 끝까지 | §4 언제 묻나 · §5 되돌아오는 길 |
| 4 | 중계 자리 수 | **정한다.** `rosterOpsRules.bullpenSize` 신설 — 고교 4 · 대학 5 · 독립 3 · 프로 6 [제안값] | §3 자리 수 |
| 5 | 고교에도 마무리를 두나 | **둔다.** 선발 이닝을 줄여 불펜 이닝을 만들고 그 안에 자리를 연다 (엔진 수정 포함) | §3 무대별 차이 · **§6-1** |
| 6 | 학년을 보나 | **안 본다.** 1학년도 3학년도 능력치로만 겨룬다 | §2 · §3 필터 |
| 7 | 오프너 | **넣지 않는다 — 지운다.** 네 자리에서 항목을 뺀다 | §3 세부 보직 · §6 · §7 2단계 |
| 8 | 다시 묻는 시점 | **개막 전 주 + 무대 이동 + 콜업/강등**(+ 전역 뒤) | §4 언제 묻나 |
| 9 | 복무 중 | **모든 리그에 「시즌 시작 전 주」로 통일**한다. 현역도 상무도 **안 묻는다** — 주인공 경기가 0이다 | §4 표 · §3 무대별 차이 · §6 |
| 10 | 헤드리스 기본 정책 | **「추천대로」**(`"recommend"`) | §7 헤드리스 |
| 11 | k = 0.30 · floor = 0.15 | **제안값으로 두고**, 구현 뒤 7단계에서 실측해 **다시 묻는다** | §5 깊이 계수 |
| 12 | 추천 자리가 없을 수 있나 | **있다. 그래도 「추천 없음」 화면을 안 만든다** — 들어갈 자리가 없으면 적합도가 가장 높은 자리를 추천한다 | §3 추천 · 아래 ⑫ |

### 구멍 둘 — 문안에만 있던 것을 명세로 옮겼다 (2026-09-03)

B 가 §5 문안을 쓰다 둘을 찾았다. **문안 절에만 적혀 있어서** 구현이 §4·§7만 보면
그대로 빠진다 — 이 저장소가 반복해 겪은 "문서가 둘이면 한쪽만 고쳐진다"의 형태다.
둘 다 정식 명세로 올렸다.

| 무엇 | **확정** | 옮긴 곳 |
|---|---|---|
| `ahead = 0` 갈래 | 자리가 비었는데 추천이 아닌 경우가 있다. **"0명 있다"는 안 쓴다** — `ahead ≥ 1` / `ahead = 0` 두 문장이고 그게 전부다 | 메타데이터 §4 · 문장 §5 · **판정 §7 「ahead — 두 갈래」** |
| 보직 소식 id | **`msg-role-{year}-{teamId}-w{week}`.** 연도만·팀까지만으로는 겹친다(1군 → 2군 → 1군). 가드 `lastRoleChoiceKey` 도 **같은 세 조각** | **§7 「소식 id」** · §5 |


### ⑤ 고교 마무리 — 코드에서 읽은 여섯

사용자 물음: "고교도 마무리를 쓰긴 하지 않나? 경기가 별로 없어서… 고려해 보자."

**코드에서 읽은 것 여섯.**

| # | 무엇 | 근거 |
|---|---|---|
| 1 | 고교 팀당 주말리그 **20경기** | `leagueScheduler.ts` 46줄 `HS_TARGET_GAMES = 20` · 기간 W7~26 |
| 2 | 그 위에 **전국대회 다섯** | `leagueTeams.generated.ts` 633~637줄. 개나리기 W9~10(32팀) · 장미기 W14~15(32) · 무궁화기 W19~21(48) · 국화기 W22~25(**102팀 전원**) · 패왕기 W26~27(24). 전부 **단판 토너먼트**라 이긴 만큼만 더 뛴다 |
| 3 | 고교 팀에도 **마무리가 이미 1명 생성된다** | `roster_gen.rs` 592줄 — 리그를 안 가르는 공통 경로다. "고교엔 마무리가 없다"는 생성 쪽 얘기가 아니다 |
| 4 | 고교는 팀 경기가 **전부** 주인공 경기다 | `schedule_engine.rs` 155줄 — 권역 스케줄러가 `home == 내 팀 \|\| away == 내 팀`이면 참으로 둔다 |
| 5 | 그래서 **불펜 등판 확률표가 고교에선 한 번도 안 읽힌다** | `advanceWeek.ts` 2947줄 `relieverPitching`의 첫 조건이 `!game.isProtagonistGame`이다. 「마무리 0.55」(`player_engine.rs` 145줄)는 프로 갈래 전용이다 |
| 6 | 마무리 등판은 **경기 안 진입 판정 하나로만** 정해진다 | `match_engine.rs` 371~372줄 `CloseGame { inning_threshold: 8 또는 9, max_lead_diff: 3, min_lead_diff: 1 }` · 판정은 1746~1751줄 |

**그래서 "시즌에 몇 번 나오나"는 이렇게 정해진다.**

고교 주인공이 마무리가 되면, 팀 경기 **전부**에 대해 매번 이 조건을 시험한다.

```
8회(감독 clutchDecision ≥ 70이면) 또는 9회 이후 · 우리 팀이 1~3점 리드
```

조건이 안 맞으면 `entryReached: false` → 「등판하지 못했습니다」다.

⚠ **여기에 고교만의 감점이 둘 더 있다.**

```
콜드게임   5회에 10점차 · 7회에 7점차면 경기가 끝난다
           (match_engine.rs 2712~2714줄 · npc_sim.rs 757줄 — 같은 값 두 벌)
           고교는 102팀 실력 격차가 커서 이 갈래로 끝나는 경기가 프로보다 잦다.
           7회에 끝난 경기는 8회가 없으므로 마무리가 **구조적으로 못 나온다**
대회       단판 토너먼트라 지면 그해 그 대회가 끝난다 — 접전에서 마무리가
           못 나와 졌다면 다음 경기 자체가 없다
```

**실측 숫자는 못 적는다.** 이 세션은 electron을 못 띄우고 새 계측도 안 건다
(사용자 규칙). "20경기 남짓 중 세이브 상황이 몇 번인가"는 콜드게임 비율·점수 분포에
달려 있고 그건 돌려 봐야 나온다. **여기 적은 건 전부 코드에서 읽은 구조다.**

### ⑤ 확정 — **고교도 마무리를 둔다** (2026-09-03)

사용자 확정이다. 처음에 나는 "안 둔다"를 제안했는데, **전제가 틀렸다.**
위 여섯은 전부 "지금 구조에서는 마무리가 거의 안 나간다"를 말할 뿐이고,
그건 **구조를 안 고친다는 전제**에서만 결론이 된다.

사용자 말이 그 전제를 걷어냈다.

> "고교도 엔진 수정해서 마무리까지 가지. 선발을 좀 줄이면 중계 원래 던지던 게
> 확보되고 마무리 하면 되겠지."

**자리가 없는 게 아니라 선발이 다 먹고 있는 것**이다. 9이닝에서 선발이 7이닝을
가져가면 남는 2이닝을 중계 하나가 먹고 끝난다. 선발 몫을 줄이면 중계가 원래
자리를 되찾고 그 뒤에 마무리가 선다.

**현실 근거도 같은 방향이다.** 실제 고교야구도 투구수 제한(게임은 105구 ·
`tuning.rs` 174줄)과 의무 휴식(`rest_rules.rs` 15~24줄)으로 **분업이 있다.**
드문 건 분업이 아니라 **프로식 전문 마무리**(8~9회 1~3점 리드 전용)다. 그래서
자리는 열되 문을 프로만큼 좁게 두지 않는다 — 고교만 8회 고정으로 한 회 넓힌다.

**엔진 명세는 §6-1에 따로 적었다.** 요약 넷.

1. 주인공 경기 호출부 둘이 `leagueId` 를 안 넘겨 **고교 105구가 지금 안 걸린다**
   (§6-1-1 · 새로 찾은 결함). 먼저 이걸 고친다
2. 선발 투구수 상한과 아웃 예산에 리그 계수를 둔다 (§6-1-2 · 값은 제안)
3. 마무리 진입 문은 고교만 **8회 고정**으로 (§6-1-3 · A/B 두 안과 함께 적었다)
4. 고교 마무리는 `reliever_would_pitch` 를 안 타서 **의무 휴식이 안 걸린다**
   (§6-1-4 · 결함 · 같이 닫는다)

**위 여섯의 근거는 안 지운다.** 문을 얼마나 넓힐지 정할 때 그대로 쓰는 재료고,
"등판이 얇아지면 드래프트 평가가 얇아진다"는 계측 지표로 남는다(§6-1-5).

### ⑨ 상무 — 데이터로 답한다

리그별 「시즌 시작 전 주」는 §4의 표에 적었다. 상무만 따로 답한다.

```
상무 팀      TEAM_IND_SANGMU_PHOENIX · LEAGUE_INDEPENDENT   (utils/ids.ts 10~11줄)
             → 리그로 보면 독립리그이고 그 리그 개막은 W10, 묻는 주는 W9가 된다
주인공       복무 중(careerStage === "military")이면 advanceWeek 2167줄 갈래가
             processWeekBoundary 앞에서 matchResults: [] 로 반환한다 (2385줄)
             ⚠ 이 반환은 **isSportsUnit 을 가르지 않는다** — 상무도 현역과 같은 길이다
```

즉 **상무 로스터는 독립리그에서 경기를 치르지만, 주인공이 상무일 때는 경기가
0이다.** 상무에 보직을 물으면 그 시즌 등판이 0인 채로 보직만 정해진다.

**현역 일반병이 대상이 아닌 근거 한 줄** — 같은 반환이 현역에도 걸려 경기가 0이고,
`militaryLife` 갈래는 주간 선택(공/사람/휴식)만 처리한다(`advanceWeek.ts` 2217줄).

**확정 — 상무에도 안 묻는다** (2026-09-03 · 사용자). 시키는 대로 복무한다.
등판이 0인 시즌에 보직만 정해 두면 화면에는 보직이 떠 있는데 기록이 안 쌓여,
그 세이브를 열었을 때 "왜 안 던졌나"의 답이 화면 어디에도 없다.

⚠ **상무 경기가 생기는 1.1 상무 탭 때 다시 본다.** 주인공이 상무 팀 경기에
나가는 경로가 생기면 그 순간 이 답의 전제(경기 0)가 사라진다.

### ⑫ 추천 자리가 없을 수 있나 — 답

**있다.** 자리 합(§3 표)은 **최소 로스터**의 투수 수와 같은데, 실제 로스터는 예산으로
`rosterMin`~`rosterMax` 사이에서 정해진다(고교 18~33 · 대학 20~40 · 프로 26~34).
로스터가 큰 팀은 투수가 자리보다 많으므로 **셋 다 밀리는 사람이 생긴다.**

세 순위를 서로 다른 식(`fitSP`/`fitRP`/`fitCP`)으로 매기는 것도 같은 방향으로 민다 —
어느 자리에서도 상위권이 아닌 사람이 나올 수 있다.

**제안 — 「추천 자리가 없다」는 상태를 화면에 만들지 않는다.**

```
추천     들어갈 수 있는 자리가 하나라도 있으면  → 그중 적합도가 가장 높은 자리
         하나도 없으면                          → 세 적합도 중 가장 높은 자리
         **어느 쪽이든 추천은 늘 하나 나온다**
버튼     [선발] [중계] [마무리] 셋 다 늘 보이고, 추천 표시도 늘 하나다
문구     확인 한 줄은 **추천이 아닌 버튼에만** 뜬다(§4). 그 한 줄은 어느
         버튼이든 같은 문장이다 — 추천 전용 문장을 따로 만들지 않는다
           "지금 그 자리에 N명 있다. 거기에 더해 들어간다."
불이익   §5의 depthFactor 가 그대로 걸린다 — 추천을 따랐어도 over > 0 이면 깎인다
         **벌이 아니라 깊이다**
```

이렇게 하면 「자리 없음」 배지도 「추천 없음」 화면도 안 만든다. 사용자가 요청한
"부제 없는 그냥 선택 버튼"과도 맞는다. 결정은 사용자.

### 남겨 뒀던 둘 — 확정 (2026-09-03)

| # | 무엇 | **확정** | 같이 정해진 것 | 반영한 곳 |
|---|---|---|---|---|
| ① | 고교에 마무리 자리를 두나 | **둔다** | 선발 이닝을 줄여 불펜 이닝을 만든다 · 진입 문은 고교만 8회 고정 [제안] · 값은 계측 뒤 확정 | **§6-1** · §3 무대별 차이 · §8 표 5 |
| ② | 상무에도 보직을 묻나 | **안 묻는다** | 시키는 대로 복무한다 · **1.1 상무 탭 때 다시 본다** | §3 무대별 차이 · §4 표 · §6 · §8 표 9 |

**남은 결정은 없다.** 이제 남은 건 밸런스 값이고, 그건 §7 순서의 4·6·7·8에서
계측을 보고 건마다 묻는다 — 확정 4(bullpenSize) · 확정 11(k·floor) ·
§6-1-2(투구수 상한·아웃 예산) · §6-1-3(진입 문) 넷이다.

---

## 화면 시안

`docs/mock/role-recommend-mock.html` — 단일 HTML · 외부 자원 0.

**본뜬 것** — `apps/ui/src/pages/news/NewsPage.svelte`의 2단 레이아웃(`.cols` =
`.feed` 목록 + `.detail` 상세)과 그 안의 선택 영역(`.dec` / `.dec-opts` / `.opt` /
`.dec-done`). 색은 `apps/ui/src/styles.css`의 토큰을 그대로 옮겼다
(`--panel` · `--panel-sunk` · `--line` · `--line-strong` · `--ink` · `--ink-mid` ·
`--ink-mute` · `--t-dark` · `--t-accent` · `--warn` · `--attn` · `--ok` ·
`--radius: 3px` · 핀스트라이프 배경).

**모달이 아니다.** 소식 목록 옆 상세 칸 안에서 고른다. 적합도 막대·순위 숫자·
버튼 부제는 없다. 숫자는 확인 단계의 `N` 하나뿐이다.
