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
(`MainPage.svelte` 242 · 406줄). 12종 세부 보직은 여기까지 안 내려온다.

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

### 감독 관계

지금과 같이 `relationEffects().roleOvrBias`(−6~+6 · `relationship_rules.json`의
`manager_role_ovr_per_step: 2` × 관계 단계 ±3)를 쓴다. **세 적합도에 똑같이
더한다** — 감독이 나를 좋게 보면 어느 자리든 경쟁에서 앞서는 것이지, 자리가
바뀌는 건 아니다.

```
myFitX = fitX(나) + roleOvrBias        X ∈ {SP, RP, CP}
동료    = fitX(동료)                    (관계 보정 없음 — 관계는 주인공만 있다)
```

🔴 **밸런스 값은 사용자 확정이다.** 위 가중치·구종 계수는 전부 제안이고,
넣을 자리는 `generation_rules.json`의 새 키 하나다(§7). 코드에 리터럴로
적지 않는다 — 이 저장소가 이미 그걸로 15건을 겪었다(CLAUDE.md 머리).

---

## §3 팀내 경쟁력 — 「내가 들어갈 수 있는 자리」

적합도는 **혼자 재는 값**이다. 보직은 팀 안 경쟁이라 자리 수를 같이 봐야 한다.

### 자리 수

| 자리 | 어디서 | 값 |
|---|---|---|
| 선발 | `rosterOpsRules.rotationSize` (실물) | 고교 3 · 대학 3 · 독립 4 · 그 밖(프로·2군·해외) 5 |
| 마무리 | 팀당 1 (실물) | `getTeamBullpen`이 `closer` **한 명**만 낸다. 생성도 팀당 CP 정확히 1명(`roster_gen.rs` 592줄) |
| 중계 | **표가 없다** | `getTeamBullpen`은 남은 RP·CP를 **전부** 불펜으로 돌려준다. 상한이 없다 |

로스터가 만드는 실제 공급은 이렇다 (`roster_gen.rs` 548~551줄).

```
pitcher_n = round(로스터 × pitcherRatio 0.45)      (야수 9명은 보장)
sp_n      = max(3, round(pitcher_n × 0.45))         SP_SHARE_OF_PITCHERS
CP        = 1명
RP        = pitcher_n − sp_n − 1
```

고교 실측(ROLE_ASSIGNMENT 2-6)이 로스터 18 · 투수 8이므로
`sp_n = max(3, round(3.6)) = 4` · CP 1 · RP 3이다. **로테이션은 3자리인데 SP
꼬리표를 단 사람은 4명**이다 — 자리보다 사람이 많은 게 정상이고, 그래서 경쟁이 된다.

⚠ **중계 자리 수를 정해야 한다.** 지금은 무제한이라 "중계는 아무나 된다"가 된다.
제안: 리그별 `bullpenSize`를 규칙 파일에 새로 두고 `pitcher_n − rotationSize − 1`을
기본값으로 쓴다. 실제 등판은 지금처럼 `getTeamBullpen`이 컨디션으로 다시 고르되,
**추천 산식이 보는 자리 수**만 이 값을 쓴다. → §8 질문 4

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
```

능력치는 **지금 값**으로 읽는다 — `livePitcherOvr`이 이미 그 규칙이고
(`npcLiveStats` 우선, 없으면 생성값), 세부 능력치도 같은 순서로 읽는다.
⚠ 이 순서를 뒤집으면 **동료는 안 자라고 주인공만 자란다**(그 파일 6~16줄 주석).

### 자리 배정 — 두 단계

순서 의존을 없애려고 단계를 둘로만 나눈다. 같은 입력이면 늘 같은 답이 나온다.

```
① 마무리 한 자리
     후보 = 팀 투수 전원(주인공 포함)
     seatCP = fitCP 최댓값을 가진 한 명
     → 나의 rankCP = 1 + #{동료 : fitCP(동료) > myFitCP}

② 선발 rotationSize 자리
     후보 = 전원 − (①에서 마무리가 된 사람)
     → 나의 rankSP = 1 + #{그 후보 중 : fitSP(동료) > myFitSP}

③ 나머지는 전부 중계
     → 나의 rankRP = 1 + #{동료 : fitRP(동료) > myFitRP}
```

**들어갈 수 있는 자리**

```
canCP = rankCP ≤ 1
canSP = rankSP ≤ rotationSize(리그)
canRP = rankRP ≤ bullpenSize(리그)     ← 제안. 지금은 늘 참
```

**추천**은 들어갈 수 있는 자리 중 **내 적합도가 가장 높은 것**이다.
하나도 없으면 `canRP`로 떨어뜨린다 — 중계가 제일 얕은 자리다.

이 모양이 지금 코드(`higher <= 2`)와 같은 형태라 읽기 쉽고, ①이 먼저 도는 것도
야구와 맞는다 — 마무리감이 로테이션에서 빠지면 선발 한 자리가 난다.

### 세부 보직 이름

추천은 SP/RP/CP 셋이지만, 확정된 뒤 `currentRole`(12종)은 지금 규칙을 이어 쓴다.
다만 **자리 수를 리그에서 읽는다** — §1-a 결함을 여기서 닫는다.

```
SP  rankSP ≤ rotationSize → "{rankSP}선발"          (고교·대학이면 최대 3선발)
    rankSP  = rotationSize+1 이고 fitSP 가 높으면 "스윙맨"
    그 밖 → "롱릴리프"
CP  "마무리"
RP  fitRP 로 셋업맨 / 중간계투 / 롱릴리프 / 패전처리
    문턱은 지금 OVR 78·65·55 자리를 fitRP 눈금으로 옮긴다 [제안]
```

⚠ 고교는 지금 `currentRole`이 `"1선발"`/`"중간계투"` **고정**이다
(`advanceWeek.ts` 225줄). 세부 이름을 고교에도 줄지는 → §8 질문 6

### 무대별 차이

| 무대 | 선발 자리 | 마무리 | 추천을 묻나 | 비고 |
|---|---|---|---|---|
| 고교 (`LEAGUE_HIGHSCHOOL`) | 3 | 질문 5 | 예 | 팀 경기가 **전부** 주인공 경기다. 로스터 18 · 투수 8 |
| 대학 (`LEAGUE_UNIVERSITY`) | 3 | 예 | 예 | 지금은 5선발까지 나온다(§1-a) |
| 독립 (`LEAGUE_INDEPENDENT`) | 4 | 예 | 예 | 나이 상한 31 |
| 프로 1군 (`LEAGUE_KBL`·ABL·JBL) | 5 | 예 | 예 | 주당 1경기만 주인공 경기 |
| 프로 2군 (`LEAGUE_KBL_FARM`) | 5 | 예 | 예 | `rotationSize`에 항목이 없어 default 5로 떨어진다 |
| 상무·현역 (`careerStage === "military"`) | — | — | **아니오** | 군 갈래가 `processWeekBoundary` 앞에서 반환한다(§1-d). 배정도 등판도 없다 |

---

## §4 감독 추천 → 선택 흐름

### 새 pending — `roleChoice`

```ts
// types/season.ts  PendingAction 에 추가
| {
    type: "roleChoice";
    /** 감독이 미는 자리 */
    recommended: "SP" | "RP" | "CP";
    /** 확정되면 붙을 세부 보직 이름 (recommended 기준) */
    recommendedRole: PitcherRole;
    /** 세 자리의 내 적합도 — 화면이 막대로 그린다 */
    fits:  { sp: number; rp: number; cp: number };
    /** 리그가 가진 자리 수 */
    seats: { sp: number; rp: number; cp: number };
    /** 그 자리에서의 내 순위 */
    ranks: { sp: number; rp: number; cp: number };
    /** 감독 이름 — 없으면 "코칭스태프" */
    managerName?: string;
    /** 왜 그 자리인가 한 줄 (화면 문구는 규칙 파일이 아니라 코드가 만든다) */
    reason: string;
  }
```

🔴 **`PENDING_ACTION_TYPES` 배열에도 반드시 넣는다**(`season.ts` 263줄).
타입에만 넣으면 저장은 되는데 로드에서 조용히 사라진다 — 그 배열과 타입을
`_MissingPendingType`이 붙들어 매고 있어 컴파일로 잡히긴 한다.

### 모달

`apps/ui/src/features/team/ui/RoleChoiceModal.svelte` (새 파일).
`EventPendingModal.svelte`와 **같은 규칙**으로 만든다 — 계산·해소·저장은 전부
usecase 안에 두고 모달은 부르기만 한다. 그래야 화면과 헤드리스가 갈리지 않는다.

```
머리   「{연도}시즌 보직 면담」 · 감독 이름
본문   추천 자리 + 한 줄 근거
       세 자리의 [적합도 · 팀 순위 / 자리 수] 표
버튼   [ 선발 ]  [ 중계 ]  [ 마무리 ]      ← 세 개 항상 보인다
       추천 자리에 「감독 추천」 배지
       들어갈 자리가 없는 곳에는 경고색 + 순위 표시
경고   추천이 아닌 버튼을 누르면 **곧바로 확정하지 않는다.**
       같은 모달 안에서 확인 단계로 바뀐다 (§5 문안)
```

**배선 자리** — `MainPage.svelte`에 셋을 같이 넣는다. 하나라도 빠지면
"세이브가 잠기는데 화면엔 아무것도 없는" 그 형태가 된다(군 이벤트가 그랬다).

```
① tabForPending  case "roleChoice": return "news"
                 (switch 가 유니온을 다 안 덮으면 컴파일이 깨진다 — 그게 안전장치다)
② $: pendingRoleChoice = $nextPendingAction?.type === "roleChoice" ? … : null
③ {#if pendingRoleChoice}<RoleChoiceModal action={pendingRoleChoice} />{/if}
```

### 헤드리스 정책

`militaryLife.ts`의 `__PB_MIL_CHOICE`와 **같은 모양**으로 하나만 둔다.

```ts
// usecases/pitcherRole.ts 안
const policy = (globalThis as Record<string, unknown>).__PB_ROLE_CHOICE;
// "recommend"(기본) | "sp" | "rp" | "cp"
```

`runAutoAdvance`의 switch에 `case "roleChoice"`를 넣고 `resolveRoleChoice(pa, pick)`를
부른다 — 화면 버튼도 같은 함수를 부른다. 계측 스크립트는
`globalThis.__PB_ROLE_CHOICE = process.env.PB_ROLE_CHOICE || "recommend"` 한 줄로
받는다(`probe-paths.cjs` 34줄과 같은 자리).

### 언제 묻나

```
① 시즌 W1                                    지금과 같다 (반드시)
② 무대 이동 뒤 첫 주   고교→대학·대학→프로·드래프트 지명·독립 이적
③ 이적·트레이드 뒤 첫 주
④ 콜업·강등 뒤 첫 주   switchProtagonistLeague 가 도는 자리
⑤ 전역 뒤 첫 주        복무 중엔 아예 안 도므로(§1-d) 돌아왔을 때 한 번
```

②~⑤는 **팀이 바뀌면 경쟁 상대가 통째로 바뀌기 때문**이다. 지금은 다음 시즌
W1까지 옛 보직으로 간다. 다만 이걸 다 열면 한 시즌에 서너 번 멈출 수 있다 —
어디까지 물을지는 → §8 질문 8

🔴 **한 시즌에 한 번 가드를 반드시 저장한다.** `protagonist.lastRoleChoiceKey`
(예: `"2027:TEAM_KBL_X"`)를 `SaveGame`에 넣고 `fromSaveGame`에서 되살린다.
안 그러면 앱을 껐다 켤 때 같은 주에 또 묻는다 — 이 저장소가 이미 겪은 형태다
(CLAUDE.md "한 해에 한 번 가드는 반드시 저장한다").

---

## §5 추천이 아닌 자리를 고르면

### 안내 문안 (제안)

**1단계 — 버튼을 눌렀을 때 (같은 모달 안 확인 단계)**

```
정말 [마무리]로 가겠습니까?

감독은 [선발]을 추천했습니다.
이 팀의 마무리 자리는 1개이고, 지금 당신은 3순위입니다.
추천이 아닌 자리를 고르면 출전 기회가 줄어들 수 있습니다.

              [ 다시 고른다 ]   [ 그래도 마무리 ]
```

**2단계 — 확정 뒤 소식**

```
제목  {연도}시즌 보직 — 마무리
본문  감독은 선발을 권했지만 당신은 마무리를 택했다.
      팀에는 이미 그 자리를 맡은 투수가 있다.
      기회는 스스로 만들어야 한다.
```

숫자(자리 수·순위)는 **화면에서 계산하지 않는다.** pending이 들고 온
`seats`·`ranks`를 그대로 쓴다 — 두 벌이 되면 한쪽만 고쳐진 채 남는다.

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

  자리 안(over 0)  → 1.00   불이익 없음
  한 칸 밖         → 0.70
  두 칸 밖         → 0.40
  세 칸 밖 이상    → 0.15
```

⚠ **추천을 따랐는데도 `over > 0`일 수 있다** — 세 자리 다 못 들어갈 때 중계로
떨어뜨리기 때문이다. 그 경우도 같은 계수를 쓴다. **벌이 아니라 깊이다.**

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
       base = reliever_appearance_chance(role)   ← 지금 표 그대로
새 항  base × depthFactor
배선   pitcherRoleEngine.relieverWouldPitch 에 인자 하나 추가
       advanceWeek 2949줄 호출부가 protagonist.roleFit 에서 계산해 넘긴다
```

⚠ `#[serde(default)]`라 **안 넘겨도 조용히 통과한다.** 이 저장소가 그 함정에
여러 번 걸렸다(상무 Phase 1 · `roll_random_batch` · `sim_game`). 검사는
**배선을 뺀 대조군**을 넣어 짠다 — 빼면 실패해야 그 검사가 배선을 보는 것이다.

#### (c) 경기 안 진입 — 문턱을 늦춘다

```
자리   match_engine.rs  create_initial_match_state 의 entry_trigger 기본값
지금   RP → MidInning{ inning: 5|6|7, max_outs: 3, score_diff_cap: 6 }
       CP → CloseGame{ inning_threshold: 8|9, lead 1~3 }
새로   over > 0 이면
         RP  inning += over,  score_diff_cap −= 2×over   (지는 경기에만 나온다)
         CP  inning_threshold += over, max_lead_diff −= over  (여유 있는 상황만)
배선   MatchStartOptions 에 `role_depth: Option<i32>` 를 더한다
       MainPage 406줄이 activeMatchContext 에 실어 보낸다
```

이 셋이 겹치면 "3순위 마무리"는 **주 1경기에 나올까 말까**가 된다. 그게 기획의
목적이다 — 다만 **완전히 0이 되면 안 된다.** `floor 0.15`가 그 바닥이다.
성장(경기 XP)과 시즌 기록이 통째로 0이 되면 그 커리어가 되돌아올 길이 없다.

### 되돌아오는 길

불이익은 **한 시즌짜리**다. 다음 시즌 W1에 다시 묻고, 그 사이 능력치가 자랐으면
순위가 오른다. 시즌 중에 바꿀 수 있게 할지는 → §8 질문 3

---

## §6 발견 셋을 이 기획이 어떻게 닫나

| 발견 | 닫는 방법 |
|---|---|
| **마무리 진입로 없음** | §3 ①이 `fitCP`로 마무리를 **먼저** 뽑고, §4 모달이 [마무리] 버튼을 **항상** 보여 준다. `position === "CP"`가 아니어도 CP가 될 수 있으므로 순환이 끊긴다. `assign_protagonist_role`의 `position`으로 갈리는 구조 자체를 없앤다 |
| **RP 잠김** | 위와 같은 이유로 저절로 닫힌다. 새 산식은 **직전 `position`을 아예 안 본다** — 매 시즌 세 자리를 다시 겨룬다. 고교가 이미 그렇게 돌고 있고 그쪽엔 이 잠금이 없다 |
| **오프너** | 산식만으로는 안 나온다. 오프너는 능력치가 아니라 **팀 운영 방식**이다. 제안: 리그 단위 스위치(`rosterOpsRules`에 `openerLeagues`)를 두고, 켜진 리그에서 `rankSP == rotationSize + 1`이면서 `fitRP`가 높은 사람에게 「오프너」를 준다. 지금 `isStarterRole`이 이미 오프너를 선발로 세고 등판 확률표에도 0.30이 있으니 **이름을 낼 자리만 없다.** → §8 질문 7 |

덤으로 §1의 넷 중 셋이 같이 닫힌다.

- **a (자리 수 불일치)** — §3이 `rotationSize`를 읽으므로 대학에서 4·5선발이 사라진다
- **b (세부 보직이 등판에 무영향)** — §5 (a)가 선발 깊이를 등판에 연결한다
- **c (`starterSlot` 미사용)** — 세부 보직 이름을 만들 때 이 함수를 실제로 쓴다

**d(복무 중 배정 없음)는 안 닫는다.** 상무를 이 기획에 넣을지가 질문 9다.

---

## §7 구현 명세

### 파일

| 층 | 파일 | 할 일 |
|---|---|---|
| 규칙 | `resource/data/master/players/generation_rules.json` | 새 키 `pitcherRoleRules` (아래) |
| 규칙 | 같은 파일 `rosterOpsRules` | `bullpenSize` 추가 (리그별) |
| Rust | `packages/engine-native/src/player_engine.rs` | `recommend_pitcher_role(params) -> RecommendResult` 신설. `assign_highschool_position`·`assign_protagonist_role`은 **남긴다**(구 세이브 경로) |
| Rust | 같은 파일 `reliever_would_pitch` | `depth_factor: Option<f64>` 추가 |
| Rust | 새 함수 `starter_would_start` | 씨앗 · `depth_factor` |
| Rust | `packages/engine-native/src/match_engine.rs` | `create_initial_match_state`의 `entry_trigger` 기본값에 `role_depth` 반영 |
| Rust | `packages/engine-native/src/lib.rs` | `#[napi]` export (`#[serde(rename_all = "camelCase")]` 필수) |
| TS | `apps/ui/src/shared/utils/pitcherRoleEngine.ts` | `recommendPitcherRole(protagonist, entities, leagueId, roleOvrBias)` — **재료만 모아 넘긴다** |
| TS | `apps/ui/src/shared/utils/pitcherRoleRules.ts` (신설) | `primePitcherRoleRules()` — `rosterEngine`과 같은 방식 |
| TS | `apps/ui/src/shared/stores/master.ts` 1070줄 블록 | `primePitcherRoleRules(genRules)` 한 줄 추가 |
| TS | `apps/ui/src/shared/usecases/pitcherRole.ts` (신설) | `askRoleChoice()` · `resolveRoleChoice(action, pick)` — **화면·헤드리스 공용** |
| TS | `apps/ui/src/shared/usecases/advanceWeek.ts` | W1 갈래(218~259줄)를 `askRoleChoice`로 교체 · 2949줄 `relieverWouldPitch` 호출에 깊이 전달 · 2962줄 앞에 `starterWouldStart` |
| TS | `apps/ui/src/shared/usecases/runAutoAdvance.ts` | switch에 `case "roleChoice"` |
| 타입 | `apps/ui/src/shared/types/season.ts` | `PendingAction`에 `roleChoice` + **`PENDING_ACTION_TYPES` 배열에도** |
| 타입 | `apps/ui/src/shared/types/save.ts` | `ProtagonistSave.roleFit` · `lastRoleChoiceKey` |
| 타입 | `apps/ui/src/shared/types/main.ts` | `MyBodyEvent.reason`에 `"roleFit"` 추가 |
| 화면 | `apps/ui/src/features/team/ui/RoleChoiceModal.svelte` (신설) | §4 구성 |
| 화면 | `apps/ui/src/pages/main/MainPage.svelte` | `tabForPending` · 반응형 변수 · 모달 마운트 (셋 다) |

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
  "stages": {
    "LEAGUE_HIGHSCHOOL": { "allowCloser": false, "detailedRoles": false }
  }
}
```

`rotationSize`는 **여기 다시 적지 않는다.** `rosterOpsRules.rotationSize`가 정본이고
`rosterEngine.rotationSizeForLeague()`로 읽는다 — 두 벌이 되면 한쪽만 고쳐진 채 남는다.

### 헤드리스 정책

```
globalThis.__PB_ROLE_CHOICE   "recommend"(기본) | "sp" | "rp" | "cp"
읽는 자리                      usecases/pitcherRole.ts 한 곳
받는 자리                      scripts/probe-*.cjs · scripts/perf/*.cjs
                               (`__PB_MIL_CHOICE` 와 같은 줄에 둔다)
```

### 검사

| 이름 | 무엇을 보나 |
|---|---|
| `pitcherRoleFit.test.ts` (신설 · vitest) | 가중치가 **규칙 파일에서 온다** — 코드에 숫자 리터럴이 없다 |
| `pitcherRoleSeats.test.ts` (신설) | 자리 수를 `rotationSizeForLeague`로 읽는다 · 대학에서 4선발이 안 나온다 |
| `roleChoicePending.test.ts` (신설) | `PENDING_ACTION_TYPES`에 있다 · `tabForPending`이 덮는다 · `MainPage`가 그린다 · `runAutoAdvance`가 처리한다 (군 이벤트 결함의 재발 방지) |
| `pitcherRoleLive.test.ts` (기존) | 세부 능력치도 live 우선으로 읽는지로 **범위를 넓힌다** |
| `roleDepthWiring.test.ts` (신설) | `depthFactor`가 호출부에서 실제로 넘어간다. **대조군 포함** — 인자를 빼면 실패해야 한다 |
| `npm run measure:role` (기존 확장) | 고교 102팀 × 프리셋 4의 **추천 분포**. 지금은 SP/RP 둘만 센다 |
| `npm run probe:rolefit` (신설) | 무대별 추천/선택/실제 등판 수. `__PB_ROLE_CHOICE`를 넷 다 돌려 비교 |

⚠ 검사는 **실제 엔진 호출**로 짠다. 규칙 파일·Rust 소스만 읽는 검사는 배선 누락을
못 잡는다(CLAUDE.md "층마다 맞는데 잇는 선이 없다").

### 순서

```
1  규칙 파일 키 + prime + vitest              (게임 동작 변화 0)
2  Rust recommend_pitcher_role + export       (아직 아무도 안 부른다)
3  measure:role 확장 → 추천 분포를 **먼저 본다**   ← 사용자 확정 지점
4  pending + 모달 + runAutoAdvance             (여기서 화면이 바뀐다)
5  §5 불이익 (a)(b)(c)                          ← 밸런스라 사용자 확정 지점
6  probe:rolefit 로 전후 비교
```

3과 5 사이에 **사용자 확정을 두 번 받는다.** 산식과 불이익을 한꺼번에 넣으면
어느 쪽이 원인인지 못 가린다.

---

## §8 사용자에게 물을 것

기획하면서 정해야 하는데 **혼자 정하면 안 되는 것**들이다. 번호로 답을 주면
그대로 §2~§5에 박는다.

1. **감독 추천을 거스르면 감독 관계도 깎이나?**
   지금 `roleOvrBias`는 −6~+6이고 관계가 나빠지면 **다음 시즌 추천에서도 밀린다.**
   깎는다면 얼마나(제안: 관계값 −5 · 「보직 거부」 기억 한 줄)? 아니면 실력만 보나?

2. **추천을 거스른 결과를 어디까지 보여 주나?**
   확인 단계에서 "3순위다 · 등판이 줄어든다"까지 숫자로 보여 줄지, 아니면
   "출전 기회가 적어질 수 있다"만 말하고 결과로 알게 할지.

3. **시즌 중에 보직을 다시 정할 수 있나?**
   (예: 부상에서 돌아온 뒤 · 성적이 나쁠 때 감독이 다시 부른다)
   지금 구조는 W1 한 번뿐이다. 시즌 중 재판정을 넣으면 "밀렸다가 되찾는" 이야기가
   생기지만, 멈추는 창이 늘어난다.

4. **중계 자리 수를 정할까?**
   지금은 무제한이라 중계는 늘 들어간다. 리그별 `bullpenSize`를 두면 "불펜에서도
   밀린다"가 가능해지는데, 그러면 **어디에도 못 들어가는 상태**가 생긴다.
   제안: 둔다. 대신 못 들어가도 등판 확률 15%는 남긴다(§5 floor).

5. **고교에도 마무리를 추천하나?**
   지금 고교는 SP/RP 둘뿐이다. 실제 고교 야구에 전담 마무리는 드물다.
   제안: 고교는 둘만. 대학부터 셋.

6. **고교 1학년에게도 선발을 추천하나 — 학년을 보나?**
   지금 판정은 학년을 **하나도 안 본다.** 3학년(곧 졸업)도 경쟁 상대로 세고,
   1학년 주인공도 능력치만 되면 1선발이 된다. 학년 가중을 넣을까(제안: 안 넣는다 —
   실력으로 밀어내는 게 이 게임의 재미다)? 3학년을 경쟁에서 뺄까(제안: 안 뺀다 —
   그 시즌은 같이 뛴다)?

7. **오프너를 넣나?**
   넣으면 리그 스위치로 켠다(프로만? 해외만?). 안 넣으면 `ROLE_DESCRIPTION`과
   등판 확률표에 있는 「오프너」는 **영원히 안 나오는 항목**으로 남는다 —
   그 편이 낫다면 지우는 것도 정리다.

8. **다시 묻는 시점을 어디까지 여나?**
   §4의 ①~⑤ 중 어디까지. 전부 열면 한 시즌에 서너 번 멈출 수 있다.
   제안: ①(W1) + ②(무대 이동) + ④(콜업·강등)까지. 트레이드는 소식으로만 알린다.

9. **상무·현역 복무 중에도 보직이 있나?**
   지금은 복무 중 배정도 등판도 없다(코드 확인). 상무는 실제로 퓨처스리그에서
   뛰는데 게임에는 그 경기가 없다. 이 기획에서 건드리지 않는 게 제안이다.

10. **헤드리스 기본 정책은?**
    제안: `"recommend"` — 계측이 "추천대로 갔을 때"를 기준선으로 잡는다.
    `"sp"`를 기본으로 하면 지금 세계(거의 전원 SP)와 비교하기 쉽지만,
    새 산식의 효과가 안 보인다.

11. **불이익 계수 `k = 0.30` · `floor = 0.15`가 맞나?**
    한 칸 밖 70% · 두 칸 40% · 세 칸 15%다. §7의 3단계에서 분포를 본 뒤
    다시 물어도 된다.

12. **추천을 따랐는데도 자리가 없을 때 문구는?**
    세 자리 다 못 들어가면 중계로 떨어진다. 그때도 "추천"이라고 부를지,
    「지금은 자리가 없다」로 다르게 말할지.

---

## 화면 시안

`docs/mock/role-recommend-mock.html` — 단일 HTML · 외부 자원 없음.
감독 추천 모달 + 세 버튼 + 경고 상태 둘(인라인 경고 · 확정 확인)을 담았다.
숫자는 이 문서의 예시값이고 실제 계측이 아니다.
