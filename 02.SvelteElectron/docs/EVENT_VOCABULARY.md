# 이벤트 어휘 — 발생 조건과 보상

> **트랙 B(이벤트·소식함)의 정규화 기준선.** 2026-08-24 확정본.
>
> 이벤트를 쓰거나 고칠 때 **여기 있는 것만 쓴다.** 없는 걸 쓰면 로드에서
> 던진다(`parseEventRule`의 `assertConditions`).
>
> ⚠ **정본은 코드다.** 조건은 `utils/conditionEvaluator.ts`, 보상은
> `types/main.ts`의 `DecisionEffect` + `stores/game.ts`의
> `applyEffectToProtagonist` + `usecases/decisions.ts`.
> 이 문서는 그걸 사람이 읽는 형태로 옮긴 것이고, 어긋나면
> `check:eventconditions`와 `eventConditionShape.test.ts`가 잡는다.

## 읽는 법

| 표시 | 뜻 |
|---|---|
| ✅ | **지금 쓸 수 있다** |
| ⬜ | **열기로 한 것** — 상태는 있는데 아직 조건/보상이 없다 |
| 🔴 | **쓰면 안 된다** — 값이 안 채워지거나 스텁이다 |

> **2026-08-24 결정: ⬜를 전부 연다.** 아래가 그 대상이고, 여는 방식은 §0이다.
> ⚠ **이벤트는 아직 안 만든다** — 어휘를 먼저 세우고 콘텐츠는 그다음이다.

---

## 0. 어떻게 열 것인가 — 조건 100종을 하나씩 만들지 않는다

⚠ **`case`를 100개 늘리면 안 된다.** 지금 45종도 `season_wins_gte`·
`season_era_lte`처럼 **필드마다 타입 하나**라, 새 필드가 생길 때마다
평가기·타입·`CONDITION_FIELDS`·문서 **넷을 같이** 고쳐야 한다. 그 넷이
어긋나는 게 이 트랙이 이미 두 번 겪은 결함이다.

**경로(path)로 받는 소수의 일반 조건**으로 연다:

```jsonc
{ "type": "num_gte", "path": "batting.contact",         "value": 60 }
{ "type": "num_lte", "path": "contract.remainingYears", "value": 1  }
{ "type": "num_gte", "path": "seasonStats.hr",          "value": 20 }
{ "type": "eq",      "path": "currentRole",             "value": "1선발" }
{ "type": "relation_gte", "kind": "manager",            "value": 50 }
```

- 경로는 **허용 목록으로 검증한다** — 오타가 조용히 false가 되면 안 된다
  (2026-08-22에 그 형태로 35종이 죽어 있었다)
- 기존 45종은 **그대로 둔다.** 데이터 535건이 쓰고 있다
- 보상도 같은 원리 — `statDelta`가 투구 전용인 걸 `battingStatDelta`를 새로
  만들어 푸는 대신 **대상을 경로로 받는다**

---

# 조건

## 1. 신분·소속

| | 조건 | 값 |
|---|---|---|
| ✅ | `career_stage` (`stage`) | highschool · university · independent · pro_kbl … |
| ✅ | `league_id` (`leagueId`) | |
| ✅ | `grade` | 1·2·3·4 |
| ✅ | `player_type` (`playerType`) | pitcher · batter |
| ✅ | `pro_year_gte` | `proServiceYears` |
| ⬜ | 나이 | `age` |
| ⬜ | 보직 | `currentRole` — 1선발·중간계투·마무리 |
| ⬜ | 팀·학교 | `teamId` · `schoolId` |
| ⬜ | 포지션 | `position` · `primaryPosition` · `positionRatings` |
| ⬜ | 손·투구폼 | `handedness` · `pitchingForm` |
| ⬜ | 등번호 | `jerseyNumber` |

## 2. 컨디션·상태

| | 조건 |
|---|---|
| ✅ | `condition_gte/lte` · `fatigue_gte/lte` · `morale_gte/lte` |
| ✅ | `season_injury_count_gte` (`seasonHealth.injuryCount`) |
| ⬜ | `seasonHealth.lowConditionWeeks` · `highFatigueWeeks` · `totalWeeks` |
| 🔴 | `consecutiveLowMoraleWeeks` · `consecutiveHighFatigueWeeks` |

🔴 **뒤 둘은 죽은 필드다.** 선언·기본값·마이그레이션 세 곳뿐이고 **증가시키는
코드가 없다 — 영원히 0이다.** "3주 연속 지쳤으면"은
`seasonHealth.highFatigueWeeks`로 쓴다(그쪽은 매주 갱신된다).

## 3. 능력치

| | 조건 | 대상 |
|---|---|---|
| ✅ | `pitching_ovr_gte/lte` | |
| ✅ | `pitching_stat_gte/lte` (`stat`+`value`) | 투구 10종 |
| ⬜ | **타격 12종** | ovr contact power eye discipline speed baseInstinct bunting platoon fielding arm battingClutch |
| ⬜ | 시즌 시작 대비 성장폭 | `seasonStartPitching` · `seasonStartBatting` |
| ⬜ | 누적 경험치 | `pitchingXP` · `battingXP` |
| ⬜ | 숨은 값 | `developmentRate` · `potentialHidden` · `growthPoints` · `scoutScore` |

🔴 **타격이 통째로 없다** — 타자 주인공을 지원하는데 조건이 투구 전용이다.

## 4. 시즌 성적

| | 조건 |
|---|---|
| ✅ | `season_wins_gte` · `season_era_lte` · `season_ip_gte` · `season_k_gte` |
| ⬜ | 투수 나머지 — `g gs l sv hold er h bb hr qs whip kbb` |
| ⬜ | **타자 16종** — `g pa ab h hr rbi sb bb k avg obp slg ops rispAb rispH` |

⚠ 지금 넷은 **투수 기록만 본다**(타자면 거짓).

## 5. 팀·순위

| | 조건 |
|---|---|
| ✅ | `team_rank_gte/lte` |
| ⬜ | `wins` · `losses` · `draws` · `winPct` · `runsFor` · `runsAgainst` |
| ⬜ | `streak` — "W3"·"L2" 연승/연패 |
| ⬜ | `last10` — "7W2L1D" |

## 6. 부상

| | 조건 |
|---|---|
| ✅ | `injured` (`value`) · `injury_severity` (`severity`) |
| ✅ | `injury_weeks_gte` · `injury_count_gte` · `had_surgery` |
| ⬜ | `injury.type` 부위별 · `injury.source` 원인 |
| ⬜ | `injury.rehabPhase` 수술 재활 1~4 · `injury.steroidUsed` |
| ⬜ | `injuryHistory[].permanentLoss` 영구 감소 이력 |

⚠ `injury`는 **없을 수 있다**(안 다친 게 기본). `undefined`를 "부상 아님"으로 읽는다.
⚠ 커리어 누계(`injuryHistory`)와 시즌 누계(`seasonHealth.injuryCount`)는 **다르다** —
시즌 쪽은 롤오버에서 초기화된다.

## 7. 돈·계약

| | 조건 |
|---|---|
| ✅ | `money_gte/lte` |
| ⬜ | `contract.salary` · `remainingYears` · `durationYears` · `signingBonus` |
| ⬜ | `contract.teamOptionYears` · `playerOptionYears` · `noTrade` · `status` |
| ⬜ | `pendingNextContract` 오프시즌 서명 완료 |
| ⬜ | `faNegotiationRound` · `faUnsignedWeeks` · `tradeAdaptationWeeks` |
| ⬜ | `finance` 수입·지출·스폰서 |

## 8. 인물 수치·태그

✅ `fame_gte` · `popularity_gte/lte` · `diligence_gte/lte` · `has_tag`

## 9. 관계도 — **전부 없다**

| | 조건 |
|---|---|
| ⬜ | `relation.value` — kind별 (manager·coach·owner·teammate·rival) |
| ⬜ | `relation.contact` — together · apart · ended |
| ⬜ | `relation.memories` — humiliation · gratitude · betrayal · witness · shared_ordeal |
| ⬜ | 관계 인원수 — "동료가 N명 이상" |

🟡 **비동기라 다른 것들과 다르다.** 관계는 `slot.db`에 있고
`getRelationships`가 `Promise`인데 `evaluateCondition`은 동기다 →
**`EventContext`에 미리 실어야 한다.**
`advanceWeek`이 이미 `relationEffects`를 `await`하니 그 자리에 얹으면 되지만
**`advanceWeek.ts`는 A 소유 파일**이라 조율이 필요하다.

## 10. 커리어 이력

⬜ `careerRecords[]` — year · rank · wins · losses · ovr · `psResult`(우승/준우승) · `awards`
⬜ `careerEvents[]` — 드래프트 · 트레이드 · 입대 이력
⬜ `retirement` — 은퇴 예정

## 11. 학업 (대학 전용)

✅ `gpa_gte/lte` · `academic_warning_gte`
⬜ `SchoolState` 나머지 27필드 — `universityMajor` · `warningCount` · `repeatedYears` ·
`graduated` · `eligibilityBlocked` · `weeklyStudyMode` · `semesterGpaHistory` …

⚠ `schoolState`가 없으면 전부 거짓이다(고교·프로에서 그게 맞다).

## 12. 군 — 🔴 스텁

🔴 `military_phase`는 **`return false` 고정**이다.
⬜ `militaryStatus`(미필·현역·군필·면제) · `militaryUnit` · `sportsUnitSelected` 등 12필드

## 13. 주차·시즌

✅ `week_gte/lte/eq` · `season_phase`
⬜ `seasonYear` · `currentDate`(월/일) · `totalWeeks` · 잔여 주차

⚠ **주차는 시즌마다 1로 리셋된다.** 누적이 아니다.
⚠ `week_eq`는 mandatory 105건이 전부 쓴다 — 달력 역할을 이게 한다.

## ⚠ 필드 이름이 타입마다 다르다

전부 `value`가 아니다. **틀리면 영원히 false다** — 2026-08-22에 44개가 그 상태였다.

```
career_stage       → stage         season_phase    → phase
league_id          → leagueId      player_type     → playerType
pitching_stat_gte  → stat + value  pitch_learned   → pitchId
has_tag            → tag           injury_severity → severity
```

---

# 보상

`DecisionEffect`. 선택지(`options[].effects`)에만 붙는다.

## 1. 즉시 상태

✅ `conditionDelta`(0~100) · `fatigueDelta`(0~100) · `moraleDelta`(0~100)

## 2. 돈·재정

| | 보상 | 사용 |
|---|---|---:|
| ✅ | `moneyDelta` — 0 이상 | **0회** |
| ✅ | `luxurySpend` — `{cost, onTeammate, personId?}` | **0회** |
| ⬜ | `finance` 수입·지출·스폰서 | |
| ⬜ | `contract` 연봉·기간·옵션 | |

`luxurySpend`의 관계도·명성 변화는 **Rust `calc_luxury`가 정한다** — 자기 소비는
성격에 따라 **명성의 부호가 갈린다**(성실한 선수의 씀씀이는 구설이 된다).
🔴 **`moneyDelta`와 같이 쓰지 않는다** — 금액이 여기서 이미 빠진다.

## 3. 능력치

| | 보상 | 대상 | 사용 |
|---|---|---|---:|
| ✅ | `xp` | 투구 10종 (누적→성장 판정) | 288 |
| ✅ | `statDelta` | 투구 10종 (즉시, 1~99, **ovr 불가**) | 8 |
| ⬜ | 타격 12종 | `batting` · `battingXP` | |
| ⬜ | `developmentRate` · `potentialHidden` · `growthPoints` · `scoutScore` | | |

🔴 **`xp`·`statDelta`가 `pitchingXP`·`pitching`만 건드린다**(코드 확인).
타자 주인공이 이벤트로 성장할 길이 **아예 없다.**

## 4. 인물 수치

✅ `fameDelta`(0~200) · `popularityDelta`(0~100) · `diligenceDelta`(1~99)

## 5. 태그

✅ `addTag: string[]` — 중복 무시. **0회 사용**
⬜ `removeTag` — **없다.** 한 번 붙으면 커리어 내내 남는다

⚠ 태그는 **화면에 배지로 보인다**(`RightPanel`·`PlayerDetailModal`). 정체성
라벨이지 부기용 플래그가 아니다 — 연계용으로 쓰면 배지 목록이 더러워진다.
(2026-08-22 사용자 판단: **태그는 장식으로 둔다**)

## 6. 관계도(친밀도)

| | 보상 | 사용 |
|---|---|---:|
| ✅ | `relationDelta` — `{kind, personId?, delta}` | **0회** |
| ⬜ | `relation.contact` 전환 (together/apart/ended) | |
| ⬜ | `relation.memories` 각인 | |

`personId`를 비우면 **그 종류의 접촉 중인 첫 상대**(감독·구단주는 팀당 1명).

| `kind` | 무엇에 영향을 주나 |
|---|---|
| `manager` | 역할 배정 · 콜업 우선순위 |
| `coach` | **담당 영역** 훈련 효율 |
| `owner` | 재계약 · 방출 인내심 |
| `teammate` | 이벤트 분기 · 사기 |
| `rival` | 서사 (맞대결 · 재회) |

⚠ **주석에 만든 이유가 적혀 있다** — *"6C가 걷어낸 감정 문구는 힌트에
`trust +5`라고 적어놓고 실제로는 사기·피로만 움직였다. 표시와 동작이 달랐다.
그 결함을 되풀이하지 않으려고 만든 필드다."* **만들고 한 번도 안 썼다.**

⚠ `memories` 5종은 **타입은 정의돼 있는데 심을 수단이 없다.**

## 7. 구종

⬜ 구종 습득 (`pitches[]`) · 등급 상승 (`PitchEntry.grade`) · `trainingPitchState`

🔴 **반쪽이다** — `pitch_learned`·`pitch_training` **조건은 있는데 주는 수단이 없다.**
지금은 훈련으로만 는다.

## 8. 부상

⬜ 부상 부여 · 회복/단축(`recoveryWeeksLeft`) · 치료 선택(`treatmentChoice`) ·
영구 감소(`permanentLoss`)

🔴 이벤트가 다치게도 낫게도 못 한다 — 엔진(`advanceWeek`)만 한다.

⚠ 그래서 `EVT_HS_COMMON_MINOR_INJURY`("훈련 중 발목 접질림")는 **소식만 뜨고
실제로 안 다친다.** 표시와 동작이 어긋난 형태다.

## 9. 신분·소속

⬜ 보직(`currentRole`) · 팀 이동(`teamId`·`leagueId`) · 등번호 · 포지션

## 10. 커리어 이력 · 학업

⬜ `careerRecords[]` 수상 추가 · `careerEvents[]` 이력 기록
⬜ `SchoolState` 30필드 — 학점·경고·전공 전부

## 11. 아예 없는 개념

⬜ 아이템 · 장비
⬜ 스킬 · 특성 (태그가 유일한 대용)
⬜ **후속 이벤트 예약** (`nextEvents`)
⬜ **선택 기록** — `triggeredEvents`가 "언제"만 남기고 **"무엇을 골랐나"는 안 남는다**

## 비동기 둘

`relationDelta`·`luxurySpend`만 **DB·Rust를 다녀온다.** 나머지는 스토어 패치
한 번으로 끝난다 — `decisions.ts`가 처리하고 `decisionEffect.test.ts`가
**이 둘을 검사에서 제외**해 둔 이유도 그것이다.

---

# 선택지 단위 조건

`options[].conditions` — "이 이야기가 뜨는가"가 아니라 **"그 이야기 안에서 이
길이 열려 있는가"**.

```jsonc
"options": [
  { "id": "buy",  "label": "산다",   "conditions": [{ "type": "money_gte", "value": 500 }] },
  { "id": "pass", "label": "넘긴다" }
]
```

- **발동 시점에 한 번 걸러 메시지에 굳는다.** 소식은 스냅샷이다
- 🔴 **다 닫히면 선택지를 통째로 뗀다** — `trimMailbox`가 미결 선택지를 상한 위로
  보존하므로 0개짜리는 **영원히 못 지우는 메시지**가 된다
- 조건은 규칙 조건과 **같은 검증**을 받는다

# 중요도 등급

`tier` — `type`이 "어떻게 발동하는가"라면 이건 "얼마나 중요한가"다.

| 등급 | 주당 1건 상한 | 무엇 |
|---|---|---|
| `urgent` | **밖 — 즉시** | 지금 벌어진 일. 신분 변화 |
| `important` | 대기열 앞 | 놓치면 끝 |
| `ambient` | 남는 칸 | 반복 상태·분위기 |

⚠ **비우면 `oncePolicy`로 추론한다**(`repeatable`→`ambient`, 나머지→`important`).
추론은 임시방편이다 — 발동 정책은 중요도가 아니다.

---

# 현황 요약 (2026-08-24)

```
조건   45종 사용 가능 · 데이터가 쓰는 것 30종 · 미사용 15종
보상   12종 사용 가능 · 데이터가 쓰는 것  8종 · 미사용  4종
       (moneyDelta · addTag · relationDelta · luxurySpend)
```

**제일 큰 구멍 셋**

1. **타격** — 조건 12·성적 16종, 보상 12종이 전부 없다. 타자 주인공이 이벤트로
   성장할 길이 없다
2. **관계도** — 보상은 있는데 **조건이 없고**, `memories`는 심을 수단이 없다
3. **구종** — 조건은 있는데 **보상이 없다**
