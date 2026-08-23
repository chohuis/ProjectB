# 이벤트 어휘 — 발생 조건과 보상으로 쓸 수 있는 것

> **트랙 B(이벤트·소식함)의 정규화 기준선.** 2026-08-22 전수 조사.
> 이벤트를 새로 쓰거나 고칠 때 **여기 있는 것만 쓴다.** 여기 없는 걸 쓰면
> 로드에서 던진다(`parseEventRule`의 `assertConditions`).
>
> ⚠ **정본은 코드다.** 조건은 `utils/conditionEvaluator.ts`, 보상은
> `types/main.ts`의 `DecisionEffect` + `stores/game.ts`의
> `applyEffectToProtagonist` · `usecases/decisions.ts`.
> 이 문서는 **그걸 사람이 읽는 형태로 옮긴 것**이고, 어긋나면
> `check:eventconditions`와 `eventConditionShape.test.ts`가 잡는다.

---

## 1. 발생 조건 — 45종

`conditions`는 **AND**다(`evaluateConditions`가 `every`). 하나만 거짓이어도
이벤트가 통째로 안 뜬다.

⚠ **필드 이름이 타입마다 다르다.** 전부 `value`가 아니다 — 아래 "필드" 칸이
평가기가 실제로 읽는 이름이고, 틀리면 **영원히 false다**(2026-08-22에 44개가
그 상태였다).

### 주차·시즌 (6)

| 조건 | 필드 | 뜻 | 사용 |
|---|---|---|---:|
| `week_gte` | `value` | 이번 시즌 N주차 이후 | 182 |
| `week_lte` | `value` | N주차 이전 | 39 |
| `week_eq` | `value` | 정확히 N주차 | 105 |
| `season_phase` | **`phase`** | `preseason`·`season`·`postseason`·`offseason` | 23 |

⚠ **주차는 시즌마다 1로 리셋된다.** 누적이 아니다.
⚠ `week_eq`는 mandatory 105건이 전부 쓴다 — 달력 역할을 이게 한다.

### 커리어·소속 (5)

| 조건 | 필드 | 뜻 | 사용 |
|---|---|---|---:|
| `career_stage` | **`stage`** | `highschool`·`university`·`independent`·`pro_kbl` … | 428 |
| `league_id` | **`leagueId`** | 소속 리그 | 40 |
| `grade` | `value` | 학년 (고교 1~3) | 56 |
| `player_type` | **`playerType`** | `pitcher`·`batter` | **0** |
| `pro_year_gte` | `value` | 프로 N년차 이상 | 21 |

### 컨디션 (6)

`condition_gte` · `condition_lte` · `fatigue_gte` · `fatigue_lte` ·
`morale_gte` · `morale_lte` — 전부 `value`. 합계 128회.

### 능력치 (4)

| 조건 | 필드 | 사용 |
|---|---|---:|
| `pitching_ovr_gte` / `pitching_ovr_lte` | `value` | 32 / 6 |
| `pitching_stat_gte` / `pitching_stat_lte` | **`stat` + `value`** | 2 / 2 |

### 시즌 성적 (4)

`season_wins_gte` · `season_era_lte` · `season_ip_gte` · `season_k_gte` —
전부 `value`. **투수 기록만 본다**(타자면 거짓).

### 팀 (2)

`team_rank_lte` · `team_rank_gte` — `value`. 승률 기준 순위.

### 명성 (1)

`fame_gte` — `value`.

### 소지금·성실도·인기도 (6) — **2026-08-22 신설**

| 조건 | 필드 | 사용 |
|---|---|---:|
| `money_gte` / `money_lte` | `value` | 0 |
| `diligence_gte` / `diligence_lte` | `value` (1~99) | 0 |
| `popularity_gte` / `popularity_lte` | `value` (0~100) | 0 |

셋 다 **보상으로 바꿀 수는 있는데 조건으로 못 읽던 반쪽**이었다
(`moneyDelta`·`diligenceDelta`·`popularityDelta`는 예전부터 있다).
한쪽만 있으면 **그 선택의 결과를 다음 이야기가 알아보지 못한다** —
돈을 쓰게 해놓고 가난해진 걸 아무도 못 읽는 식이다.

### 부상 (6) — **2026-08-22 신설**

| 조건 | 필드 | 뜻 | 사용 |
|---|---|---|---:|
| `injured` | `value` (boolean) | 지금 부상 중인가 | 3 |
| `injury_severity` | **`severity`** | `light`·`moderate`·`severe`·`surgery` | 0 |
| `injury_weeks_gte` | `value` | 남은 회복 주차 이상 | 0 |
| `injury_count_gte` | `value` | **커리어** 누적 부상 횟수 | 0 |
| `season_injury_count_gte` | `value` | **이번 시즌** 부상 횟수 | 0 |
| `had_surgery` | `value` (boolean) | 커리어에 수술 이력 | 0 |

⚠ **`injury`는 없을 수 있다.** 안 다친 게 기본이라 `undefined`이고,
그걸 "부상 중 아님"으로 읽는다.

⚠ 커리어 누계(`injuryHistory`)와 시즌 누계(`seasonHealth.injuryCount`)는
**다른 것**이다. 시즌 쪽은 롤오버에서 초기화된다.

**부상은 이 게임의 중심 사건인데 이벤트가 그걸 못 봤다.** 부상 관련 이벤트
4건이 전부 피로·컨디션으로 대신하고 있었다 — "다치고 돌아온 뒤"·"수술까지
갔던 몸"·"올해만 세 번째" 같은 이야기를 쓸 수가 없었다.
(`msg-injury` 소식은 코드가 따로 만든다. 그건 **통보**고 이건 **이야기**다.)

### 구종·태그 (3) — **전부 미사용**

| 조건 | 필드 | 상태 |
|---|---|---|
| `pitch_learned` | `pitchId` | **0회** |
| `pitch_training` | `pitchId` | **0회** |
| `has_tag` | `tag` | **0회** |

### 학업 (3) — 대학 전용

`gpa_gte` · `gpa_lte` · `academic_warning_gte` — `value`.
⚠ `schoolState`가 없으면 전부 거짓이다(고교·프로에서 그게 맞다).

### 스텁 (1)

`military_phase` — **항상 `false`를 반환한다.** 군 시스템 설계 시 구현 예정.

---

## 2. 보상 — 12종

`DecisionEffect`. 선택지(`options[].effects`)에만 붙는다.

### 즉시 상태 (4)

| 보상 | 범위 | 사용 |
|---|---|---:|
| `conditionDelta` | 0~100 clamp | 119 |
| `fatigueDelta` | 0~100 clamp | 264 |
| `moraleDelta` | 0~100 clamp | 207 |
| `moneyDelta` | 0 이상 | **0** |

### 성장 (2)

| 보상 | 뜻 | 사용 |
|---|---|---:|
| `xp` | `{구종능력치: 적립량}` — 누적 후 성장 판정 | 288 |
| `statDelta` | `{능력치: 즉시증가}` 1~99 clamp. **`ovr`은 못 바꾼다** | 8 |

### 인물 수치 (3)

| 보상 | 범위 | 사용 |
|---|---|---:|
| `fameDelta` | 0~200 | 49 |
| `popularityDelta` | 0~100 | 30 |
| `diligenceDelta` | 1~99 | 94 |

### 태그 (1)

`addTag: string[]` — **0회.** 중복은 무시된다. ⚠ **지우는 수단이 없다**(`removeTag` 미구현).

### 비동기 (2) — slot.db·Rust 왕복

| 보상 | 뜻 | 사용 |
|---|---|---:|
| `relationDelta` | `{kind, personId?, delta}` 관계도 변화 | **0** |
| `luxurySpend` | `{cost, onTeammate, personId?}` 사치 소비. **`moneyDelta`와 같이 쓰지 않는다**(두 번 빠진다) | **0** |

---

## 3. 🔴 지금 어긋나 있는 것

### 코드엔 있는데 데이터가 안 쓰는 것

| | 조건 | 보상 |
|---|---|---|
| 미사용 | `player_type` · `pitch_learned` · `pitch_training` · `has_tag` · **신설 11종** | `moneyDelta` · `addTag` · `relationDelta` · `luxurySpend` |

⚠ **2026-08-22에 12종을 늘렸고 그중 11종이 아직 0회다.** 어휘를 늘리는 것만으로는
값이 없다 — **쓰이기 전엔 미사용 목록만 길어진다.** 그 목록이 곧 다음에 쓸
콘텐츠의 재료다.

**`relationDelta`가 특히 아깝다.** 주석에 만든 이유가 적혀 있다 —
*"6C가 걷어낸 감정 문구는 힌트에 `trust +5`라고 적어놓고 실제로는 사기·피로만
움직였다. 표시와 동작이 달랐다. 그 결함을 되풀이하지 않으려고 만든 필드다."*
**만들고 한 번도 안 썼다.** 관계 축이 "없는" 게 아니라 **안 쓰이는** 것이다.

### 읽기/쓰기가 짝이 안 맞는 것

```
읽기도 쓰기도 된다 (연계의 재료)   condition fatigue morale tags fame
                                    money diligence popularity   ← 2026-08-22 채움
읽을 수는 있는데 못 바꾼다          careerStage leagueId teamId grade
                                    playerType pitching pitches proServiceYears
                                    injury injuryHistory seasonHealth
```

⚠ **"조건부 선택지"는 이걸로 안 열린다.** `money_gte`는 **이벤트 단위** 조건이라
"돈이 많을 때만 뜨는 이벤트"는 되지만, "살 돈이 있어야 **보이는 선택지**"는
별개다 — 선택지에 조건을 다는 장치(`options[].conditions`)가 **아예 없다**.
타입·엔진·화면 셋을 다 건드려야 한다.

### 상태는 있는데 어휘가 아예 없는 것 — 45개 (부상 3개가 빠져 51 → 45)

`ProtagonistSave` 69필드 중 **45개가 조건도 보상도 없다.** 눈에 띄는 것:

```
contract pendingNextContract finance       계약·재정
consecutiveLowMoraleWeeks
consecutiveHighFatigueWeeks                누적 상태 — "3주 연속 지쳤으면"
careerRecords careerEvents                 커리어 이력
scoutScore developmentRate potentialHidden 스카우트·성장
currentRole position                       보직
age birthday                               나이
military* (12개)                           군 — military_phase가 스텁이라 통째로
```

---

## 4. 기존 이벤트를 어휘에 맞춘 것 (2026-08-22)

부상 이벤트 4건 중 **실제 부상 상태를 보는 게 하나도 없었다.**

| 이벤트 | 판정 |
|---|---|
| `EVT_IND_INJURY_FEAR` "부상이 무섭다" | **아직 안 다친** 이야기 → `injured: false` 추가 |
| `EVT_UNIV_INJURY_SCARE_UNIV` "부상 신호" | 같음 → 추가 |
| `EVT_HS_COMMON_MINOR_INJURY` "발목 접질림" | **다치는** 이야기 → 추가 |
| `EVT_FARM_REHAB_PLAYER` "재활 선수" | **남의** 재활 이야기 → **손대지 않는다** |

셋 다 예전엔 이미 다친 상태에서도 떴다 — 팔이 부러진 채 "다칠까 무섭다"가
오는 셈이었다.

## 5. 다음에 정할 것

이 문서는 **지금 되는 것**의 목록이다. 늘리려면 셋 중 하나다:

1. **안 쓰는 것들을 쓴다** — 코드 0줄. 제일 싸다. 지금 **미사용 16종**이
   쌓여 있고 그게 곧 다음 콘텐츠의 재료다.
   ⚠ 단 `has_tag`/`addTag`는 태그가 **화면 배지**라 부기용으로 쓰면 지저분해진다
   (2026-08-22 사용자 판단: 태그는 장식으로 둔다)
2. ~~반쪽을 채운다~~ → **2026-08-22 완료** (money·diligence·popularity 6종)
3. **45개 중 골라 어휘를 만든다** — 어느 축을 여느냐가 곧 어떤 이야기를
   쓸 수 있느냐다. **기획 판단이다.** 부상은 열었고, 다음 후보는
   `contract`·`consecutive*Weeks`(누적 상태)·`age`로 보인다
4. **선택지 단위 조건** — `options[].conditions`. 위 셋과 성격이 다르다.
   지금은 고르면 무조건 그 효과라 **선택이 전부 트레이드오프 고르기로 수렴한다**

⚠ **어휘를 늘리면 이 문서와 `CONDITION_FIELDS`(master.ts)를 같이 고친다.**
안 고치면 로드에서 던진다 — 그게 의도다.
