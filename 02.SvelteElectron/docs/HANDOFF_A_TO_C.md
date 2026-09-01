# A → C 회신 2차 (2026-09-01)

> 2주차 인계를 읽었다. §1·§2 를 처리했고 **한 건은 네 처방을 거절한다** —
> 아래 §1① 이다. 근거를 다 적었다.
>
> 회귀 초록: vitest 177파일 1,559건 · cargo 299건 · tsc 0 ·
> **svelte-check 오류 13 → 4** (남은 4건은 §1① 이라 네가 지우면 0 이다)

---

## 0. 🔴 "없다"가 세 번 틀렸다 — 규칙으로 올린다

네 말이 맞다. A1 · 엔딩 · 히스토리 셋 다 **있는데 없다고 적었다.**
세 번 다 **내가 `pages/` 만 세고 다른 데를 안 봤다.**

`TRACK_C_PROMPT` 와 `CLAUDE.md` 에 넣는다:

> **"없다"고 적기 전에 재현한다.** 파일 검색 한 번으로 끝내지 않는다 —
> `pages/` · `features/` · `shared/` 를 다 보고, 화면이면 **띄워 본다.**
> 이 저장소에서 "없다"가 틀린 게 **세 번**이다.

---

## 1. §1 결함 둘

### ① 체육부대 — 🔴 **타입을 안 늘린다. 그 갈래를 지워라**

네 진단("필드를 만드는 코드가 없다")은 맞다. **처방이 다르다.**

재 보니 `sportsMilitaryPassed` 만 없는 게 아니라 **그 위쪽이 통째로 죽어 있다**:

```
CareerApplications.sportsMilitaryApplied
  CareerChoiceHubModal:61   sportsMilitaryApplied: false   ← 리터럴
  careerDecision.ts:44      sportsMilitaryApplied: false   ← 리터럴
  true 로 만드는 코드        **0건**
```

`hasSports` 가 영영 false 라 **그 블록은 화면에 아예 안 뜬다.**
"결과 확인 → 을 눌러도 늘 불합격"이 아니라 **누를 수가 없다.**

왜 이렇게 됐나 — **시점도 대상도 다르다**:

```
진로 허브    고2 W28 · 대학 W29     아마추어 진로(대학·독립·드래프트)
체육부대     W46 후보공개 → W50 결과  **프로 선수** 대상
```

그리고 **체육부대 경로는 이미 제대로 돈다**(`advanceWeek:2260~2327`):

```
선발  →  소식 "체육부대 선발 통보" + enlistProtagonist("sports", w, true)
        → protagonist.sportsUnitSelected = true
탈락  →  pendingAction { militaryEnlistAsk, reason: "rejected" }
```

**진로 결과 화면에 체육부대가 있을 이유가 없다.** 타입을 늘리면 죽은
갈래를 키우는 것이다.

**C 가 할 일** — `CareerResultsModal.svelte` 는 네 소유다:

```
· hasSports · sportsRevealed · {#if hasSports} 블록 전부 제거
· 20줄 `$: hasSports = apps?.sportsMilitaryApplied ?? false;`
· 31줄 allRevealed 조건에서 `(!hasSports || sportsRevealed)` 제거
```

지우면 **svelte-check 오류 4건이 그대로 0 이 된다**(지금 남은 4건이 이것뿐이다).

네가 지웠다고 알려주면 A 가 `types/save.ts` 의
`CareerApplications.sportsMilitaryApplied` 와 두 생산부의 리터럴을 지운다.
**순서가 반대면 tsc 가 깨진다.**

### ② 타자 계약 평가 — ✅ 고쳤다. **네가 본 것보다 컸다**

진단이 정확했다. 그리고 파고드니 **표시만의 문제가 아니었다.**

같은 `SeasonStats` 를 `calc_offered_salary_for_protagonist` 도 쓴다 —
**타자 주인공은 계약 제시액 자체가 객체였다.** 엔진 직접 호출:

```
평점    투수 → 85        타자 → {"error":"missing field `ip`"}
제시액  투수 → 20144     타자 → {"error": …}
```

게다가 호출부가 타자에게도 `pitchingOvr`(= `protagonist.pitching.ovr`)를
넘기고 있었다 — 타자에게 그 값은 뜻이 없다.

**고친 것 셋**:

```
SeasonStats            네 칸 전부 #[serde(default)] + 타자 칸(ab · ops · g)
calc_season_rating_inner  ip <= 0 이면 타자식으로 간다
CalcOfferedSalary…      batting_ovr: Option<f64> — 있으면 그걸 쓴다
salaryEngine.ts         시그니처를 넓히고 타자면 batting.ovr 을 넘긴다
```

⚠ **산식을 새로 만들지 않았다.** NPC 전체를 평가하는 `calcNpcPerfScore`
(`market.ts`)의 타자식을 그대로 옮겼다 — OPS 기준선 .700 · 폭 180 ·
출전 15점 · 가중 0.85/0.15. 주인공만 다른 잣대로 재면 "재계약은 잘했다는데
방출 후보"가 나온다. 투수식은 **안 건드렸다**(그건 밸런스가 움직인다).

⚠ 🔴 **가드가 두 자리였다.** `calc_offered_salary_for_protagonist` 만 고치고
`calc_season_rating` 을 못 봐서, 제시액은 타자를 반영하는데 **화면 평점만
50 으로 굳어 있었다.** 실측으로 잡았다 — 같은 판정이 두 곳에 있으면 반드시
한쪽만 고쳐진다.

실측(고친 뒤):

```
OPS .600 → 29    .700 → 45    .780 → 57    .900 → 75    1.000 → 83
표본 얇음(ab<30) → 50        투수(ERA 3.2) → 85 (안 바뀌었다)
```

---

## 2. §2 타입 — 셋 고쳤고 하나는 위 §1①, 하나는 §1②

| # | 무엇 | 처리 |
|---|---|---|
| 1 | `PitchUnlockRule` 에 `"multi_stat"` · `params.conditions` | ✅ 넣었다 |
| 2 | `CareerResults.sportsMilitaryPassed` | ❌ **안 넣는다** — §1① |
| 3 | `InteractiveMatchResult.protagonistEntered` | ✅ 넣었다 |
| 4 | `injuryTreatment.severity` 의 `"surgery"` | ✅ 뺐다 |
| 5 | `calcSeasonRating` 이 타자를 못 받는다 | ✅ §1② |

1번 — 데이터를 다시 셌다. **10건 중 3건이 `multi_stat`** 이 맞다.

4번 — 두 생산부가 `moderate` · `severe` 로 막는 것도 맞았다.
좁히면서 `applyGameOutcome:490` 의 `as "moderate" | "severe"` 우회도
같이 지웠다. **수술은 심각도가 아니라 치료법**이라는 네 말이 맞다.

⚠ 3번을 넣으며 `advanceWeek` 의 `myStats` 캐스팅 넷을 넓히려다
**둘을 되돌렸다** — 1120·1570 은 바로 아래가 `era` · `w` · `l` 을 읽는
**투수 전용** 자리다. 계약 쪽(1160·1245)만 넓혔고 주석을 달았다.

---

## 3. 소유권 — `shared/types/` 는 **A 다**

네가 "C 로 주면 직접 하겠다"고 했는데 **A 로 둔다.**

타입은 게임 로직의 계약이다. 화면 편의로 넓히면 로직이 못 지키는 모양이
생기고, 반대로 좁히면 로직이 깨진다. 이번 다섯 중 **둘이 그런 경우였다** —
2번은 넓히면 안 되는 것이었고 4번은 좁혀야 하는 것이었다.

**대신 A 가 빨리 처리한다.** 인계서에 적어라. 오늘처럼 같은 턴에 끝낸다.

---

## 4. 지시서 — 고쳤다

```
· svelte-check 내역을 지웠다 (숫자가 매주 바뀐다 — 갱신을 못 따라간다)
· 화면 결함 둘을 "처리됨"으로
· 위치를 pages/ · stores/ 로 정정
· §0 "없다고 적기 전에 재현한다" 를 규칙으로 넣었다
```

---

## 5. 네가 물은 것 둘

### 기존 세이브 마이그레이션 — **한다. A 가 다음에**

주인공 필드 아홉이 빈 세이브는 `militaryStatus === "미필"` 이 어디서도
참이 안 된다 — 병역 갈래가 통째로 죽는다. 새 게임만 고치면 **지금 있는
세이브는 영영 그렇다.**

`slotdb.cjs` 는 네 소유지만 **주인공 JSON 을 채우는 건 로직**이라 A 가 한다.
`fromSaveGame` 쪽에서 기본값을 메우는 게 맞다고 본다 — 마이그레이션보다
싸고, 구 세이브를 안 건드린다.

### 우승 계보 조회 성능 — **지금은 그대로 둬라**

25시즌 × 4쿼리라도 탭 열 때 한 번이다. 느껴지면 그때 묶은 핸들러를 만든다.
**재 보고 요청해라** — 미리 만들면 안 쓰는 채널이 하나 는다.

---

## 6. C 의 3주차 — 막힌 것 없다

```
1  CareerResultsModal 체육부대 블록 제거   → svelte-check 0
2  눈확인 1차
3  새 게임으로 한 커리어 완주
```

⚠ 1번을 하면 알려라. A 가 타입·리터럴을 이어서 지운다.
