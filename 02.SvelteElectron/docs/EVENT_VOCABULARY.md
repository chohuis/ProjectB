# 이벤트 어휘 — 발생 조건과 보상

> **이벤트를 쓸 때 보는 표.** 2026-08-25 최신화.
>
> 여기 없는 걸 쓰면 **로드에서 던진다**(`parseEventRule`의 `assertConditions` ·
> `eventPaths`의 경로 허용 목록). 조용히 안 뜨는 것보다 낫다.
>
> ⚠ **정본은 코드다.** 조건은 `utils/conditionEvaluator.ts` + `utils/eventPaths.ts`,
> 보상은 `types/main.ts`의 `DecisionEffect` + `stores/game.ts`의
> `applyEffectToProtagonist` + `usecases/decisions.ts`.
> 어긋나면 `check:eventconditions`와 `npm test`가 잡는다.

---

# 1. 발생 조건

## 1-1. 전용 조건 45종

| 갈래 | 조건 | 필드 |
|---|---|---|
| 주차·시즌 | `week_gte` `week_lte` `week_eq` | `value` |
| | `season_phase` | **`phase`** — preseason·season·postseason·offseason |
| 소속 | `career_stage` | **`stage`** — highschool·university·independent·pro_kbl·pro_abl·pro_jbl |
| | `league_id` | **`leagueId`** |
| | `grade` | `value` (1~4) |
| | `player_type` | **`playerType`** |
| 컨디션 | `fatigue_gte/lte` `condition_gte/lte` `morale_gte/lte` | `value` |
| 투구 | `pitching_ovr_gte/lte` | `value` |
| | `pitching_stat_gte/lte` | **`stat` + `value`** |
| 구종·태그 | `pitch_learned` `pitch_training` | **`pitchId`** |
| | `has_tag` | **`tag`** |
| 시즌성적 | `season_wins_gte` `season_era_lte` `season_ip_gte` `season_k_gte` | `value` — **투수 기록만** |
| 팀 | `team_rank_lte` `team_rank_gte` | `value` (1위=1) |
| 인물 | `fame_gte` `money_gte/lte` `diligence_gte/lte` `popularity_gte/lte` | `value` |
| 부상 | `injured` `had_surgery` | `value` (boolean) |
| | `injury_severity` | **`severity`** — light·moderate·severe·surgery |
| | `injury_weeks_gte` `injury_count_gte` `season_injury_count_gte` | `value` |
| 프로 | `pro_year_gte` | `value` |
| 학업 | `gpa_gte` `gpa_lte` `academic_warning_gte` | `value` — 대학 전용 |
| 🔴 스텁 | `military_phase` | **항상 false를 반환한다** |

🔴 **필드 이름이 타입마다 다르다.** 전부 `value`가 아니다 —
2026-08-22에 44개가 그걸 틀려 **35종이 영원히 false**였다.

⚠ `season_*` 넷은 **투수 기록만 본다**(타자면 거짓). 타자는 아래 경로를 쓴다.

## 1-2. 경로 조건 6종 — 나머지는 전부 이쪽

```jsonc
{ "type": "num_gte", "path": "batting.contact",         "value": 60 }
{ "type": "num_lte", "path": "contract.remainingYears", "value": 1  }
{ "type": "eq",      "path": "currentRole",             "value": "1선발" }
{ "type": "neq",     "path": "careerStage",             "value": "pro_kbl" }
{ "type": "relation_gte", "kind": "manager", "value": 50 }
{ "type": "relation_lte", "kind": "teammate", "value": 20 }
```

⚠ **새 축이 생겨도 조건 타입을 늘리지 않는다.** `eventPaths.ts`의 표에 경로만
더한다 — 예전엔 필드마다 타입 하나였고, 그래서 평가기·타입 유니온·
`CONDITION_FIELDS`·문서 **넷이 어긋나는** 결함을 두 번 겪었다.

### 쓸 수 있는 경로 135개

| 갈래 | 개수 | 경로 |
|---|---:|---|
| 투구 능력치 | 10 | `pitching.` ovr stamina velocity command control movement mentality recovery clutch holdRunners |
| **타격 능력치** | 12 | `batting.` ovr contact power eye discipline speed baseInstinct bunting platoon fielding arm battingClutch |
| 투수 시즌기록 | 15 | `stats.` g gs w l sv hd ip er h k bb era whip rispAb rispH |
| **타자 시즌기록** | 15 | `stats.` g pa ab h hr rbi sb bb k avg obp slg ops rispAb rispH |
| 순위표 | 6 | `standing.` wins losses draws winPct runsFor runsAgainst |
| 계약 | 6 | `contract.` salary durationYears remainingYears signingBonus teamOptionYears playerOptionYears |
| 시즌 건강 | 4 | `seasonHealth.` lowConditionWeeks highFatigueWeeks injuryCount totalWeeks |
| 부상 | 3 | `injury.` recoveryWeeksLeft totalRecoveryWeeks rehabPhase |
| 학업 | 8 | `school.` examAccumScore warningCount universityWeek universityGpa semesterQualityAccum semesterWeeks repeatedYears academicWarningLevel |
| 주인공 숫자 | 21 | age grade jerseyNumber condition fatigue morale diligence popularity developmentRate potentialHidden growthPoints money fame scoutScore proServiceYears militaryServiceWeeks militaryRecoveryWeeks militaryDeferPenalty tradeAdaptationWeeks faNegotiationRound faUnsignedWeeks |
| 문자·열거 (`eq`) | 14 | careerStage leagueId teamId schoolId playerType position primaryPosition handedness pitchingForm currentRole militaryStatus militaryUnit militaryServedUnit militaryHiatusStage |
| 불리언 (`eq`) | 11 | sportsUnitSelected sportsUnitApplied contract.noTrade injury.permanentPenaltyApplied injury.steroidUsed school.attendsUniversity school.eligibilityBlocked school.majorSelected school.graduated school.draftTriggered school.careerChoiceConfirmed |
| 개수 | 6 | injuryHistory.count careerRecords.count careerEvents.count pitches.count tags.count relations.count |
| 그 밖 | 4 | `week` · `seasonPhase` · **`leagueYears`** · ~~`seasonYear`~~(미배선) |

**`leagueYears`** — 지금 리그에서 몇 년째인가. **진입 첫 시즌이 1이다.**
총 프로 연차로는 "낯선 리그 첫해"를 못 쓴다(5년차에 ABL로 가도 5년차라
해외 이벤트가 국내 것의 복사본이 된다). `careerRecords[]`에서 유도하므로
새 상태가 없다 — 리그를 옮기면 다시 1년차, 떠났다 돌아와도 1년차다.

⚠ **값이 없는 것과 경로가 틀린 것은 다르다.** 안 다쳤으면
`injury.rehabPhase`는 `undefined`고 비교는 false — 그게 맞다.
경로 자체가 틀리면 **던진다.**

### 관계도 — `relation_gte` / `relation_lte`

| `kind` | 무엇에 영향을 주나 |
|---|---|
| `manager` | 역할 배정 · 콜업 우선순위 |
| `coach` | **담당 영역** 훈련 효율 |
| `owner` | 재계약 · 방출 인내심 |
| `teammate` | 이벤트 분기 · 사기 |
| `rival` | 서사 (맞대결 · 재회) |

같은 종류가 여럿이면(동료) **가장 높은 값**을 본다 — "친한 동료가 있는가"가
이야기가 묻는 것이지 평균이 아니다.

---

# 2. 보상 — 12종

| 보상 | 뜻 | 범위 | 사용 |
|---|---|---|---:|
| `conditionDelta` | 컨디션 | 0~100 | 119 |
| `fatigueDelta` | 피로 | 0~100 | 264 |
| `moraleDelta` | 사기 | 0~100 | 207 |
| `xp` | 경험치 (누적→성장 판정) | `{"command":2}` 투구 · `{"batting.power":2}` 타격 | 288 |
| `statDelta` | 즉시 능력치 | 1~99 · **`ovr` 불가** · 표기는 `xp`와 같다 | 8 |
| `fameDelta` | 명성 | 0~200 | 49 |
| `popularityDelta` | 인기 | 0~100 | 30 |
| `diligenceDelta` | 성실 | 1~99 | 94 |
| `moneyDelta` | 돈 | 0 이상 | **0** |
| `addTag` | 태그 `["급성장"]` | 중복 무시 | **0** |
| `relationDelta` | `{kind, personId?, delta}` | 비동기 | **0** |
| `luxurySpend` | `{cost, onTeammate, personId?}` | 비동기 · Rust가 명성 부호를 정한다 | **0** |

## 대상 표기 — 투구가 기본이다

```jsonc
"statDelta": { "command": 3 }            투구 (접두사 없음 = 투구)
"statDelta": { "batting.contact": 5 }    타격
"xp":        { "batting.power": 7 }      타격 경험치
```

🔴 **접두사 없는 키는 투구다.** 데이터 296곳이 그 형태이고, `ovr`처럼 양쪽에
있는 이름이 조용히 타격으로 새면 아무도 모른다 — 회귀로 못박혀 있다.

## ⚠ 함정 둘

- `luxurySpend`와 `moneyDelta`를 **같이 쓰면 돈이 두 번 빠진다**
- `relationDelta`·`luxurySpend`만 **DB·Rust를 다녀온다**(비동기).
  나머지는 스토어 패치 한 번이다

## 안 쓰이는 넷

`moneyDelta` · `addTag` · `relationDelta` · `luxurySpend`가 **0회**다.
특히 `relationDelta`는 *"힌트엔 `trust +5`라 써놓고 실제론 사기·피로만
움직였다"*는 결함을 고치려고 만든 건데 **만들고 안 썼다.**

⚠ 태그는 **화면에 배지로 보인다.** 정체성 라벨이지 부기용 플래그가 아니다
(2026-08-22 사용자 판단: 태그는 장식으로 둔다).

---

# 3. 못 하는 것

| | 왜 |
|---|---|
| 구종 습득 · 등급 상승 | 조건(`pitch_learned`)은 있는데 **보상이 없다** |
| 부상 부여 · 회복 | 엔진(`advanceWeek`)만 한다 |
| 태그 제거 | `addTag`만 있고 `removeTag`가 없다 |
| 보직 · 팀 이동 · 계약 변경 | 이벤트 밖 |
| 관계 `memories` 각인 | 타입은 있는데 심을 수단이 없다 |
| 타격 `ovr` 직접 변경 | 파생값이라 못 바꾼다 (투구도 같다) |
| 아이템 · 장비 | 개념 자체가 없다 |
| 후속 이벤트 예약 | `nextEvents` 없음 |
| **선택 기록** | `triggeredEvents`가 "언제"만 남기고 **무엇을 골랐는지는 안 남는다** |

⚠ 위 넷(구종·부상·보직·계약)은 **엔진이 소유한 상태 전이**다. 이벤트가 직접
쓰면 엔진 판정을 우회한다(부상은 `permanentLoss`·은퇴 판정까지 딸려 있다).

---

# 4. 선택지 단위 조건

`options[].conditions` — "이 이야기가 뜨는가"가 아니라 **"그 이야기 안에서
이 길이 열려 있는가"**.

```jsonc
"options": [
  { "id": "buy",  "label": "산다",   "conditions": [{ "type": "money_gte", "value": 500 }] },
  { "id": "pass", "label": "넘긴다" }
]
```

- 발동 시점에 **한 번 걸러 메시지에 굳는다** (소식은 스냅샷이다)
- 🔴 **다 닫히면 선택지를 통째로 뗀다** — `trimMailbox`가 미결 선택지를
  상한 위로 보존하므로 0개짜리는 **영원히 못 지우는 메시지**가 된다
- 규칙 조건과 **같은 검증**을 받는다

---

# 5. 중요도 등급

`tier` — `type`이 "어떻게 발동하는가"라면 이건 **"얼마나 중요한가"**다.

| 등급 | 주당 1건 상한 | 무엇 |
|---|---|---|
| `urgent` | **밖 — 즉시** | 지금 벌어진 일. 신분 변화 |
| `important` | 대기열 앞 | 놓치면 끝 |
| `ambient` | 남는 칸 | 반복 상태·분위기 |

⚠ **비우면 `oncePolicy`로 추론한다**(`repeatable`→`ambient`, 나머지→`important`).
발동 정책은 중요도가 아니라 임시방편이다 — 등급을 적어 갈아타는 게 목표다.
