# B → A 인계 5차 (2026-09-02) — B-1 사기 손질

> **지금 기다리는 것**: `PF_YEARS=8 PF_SEED=20260731 npm run probe:morale -- --path univ`
> 기준선 한 판(13:24 시작 · 아직 안 끝남). 사용자 승인 대기는 없다.
> 아래 §A 는 프로브 없이 데이터만 읽어 낸 것이라 이미 확정이다.

## §A 🔴 `HANDOFF_A_TO_B §3.6` 의 진단이 두 군데 틀렸다

### A-1. `EVT_COND_PEAK_FORM`(×41) 은 사기를 **한 톨도 안 올린다**

`DEC_COND_PEAK_FORM` 의 두 갈래는 이것뿐이다:

```
intensive_train   fatigue:+10  xp.velocity:+3  xp.command:+3
steady            condition:+5 xp.command:+1
```

§3.6 표의 `+14 ×41` 은 **같은 주에 같이 뜬 다른 이벤트의 델타**다. A 도
"같은 주 여러 개면 나눠 못 가른다"고 표 머리에 적어 뒀는데, 1순위로 올라온
칸이 하필 그 오염된 쪽이었다. **여기에 쿨다운을 걸면 사기는 안 움직인다.**

### A-2. "`moraleDelta` 57건 · 양수 44 · 음수 13 · 합 +150" 은 **군 풀만** 센 값이다

`resource/data/master/events/**` 를 grep 하면 57건이 나오는데 그 57건이
전부 `events/pools/military*.json` 이다 — A 가 §3.6 끝에서 "군 사기는 여기서
판정하지 마라"라고 적은 바로 그 통이다. 이벤트 정의 파일 589개에는
`effects` 키 자체가 없다.

사기가 실제로 걸린 곳은 `messages/decision_templates.json` 이다:

```
결정템플릿 391 · 사기가 걸린 템플릿 226
선택지  양수 235건 합 +1571 · 음수 70건 합 −271
  그중 반복(repeatable) 이벤트가 쓰는 양수  99건 합 +603   ← 손댈 것
값 분포  15×1 12×11 10×26 9×1 8×57 7×1 6×50 5×56 4×19 3×10 2×3
```

## §B 🔴 쿨다운은 랜덤 풀에서 **한 번도 안 걸린다** — 손잡이가 아니다

풀은 이미 `maxPicksPerWeek: 1` 이고 발동률이 9~26% 다. 거기에 가중치를
곱하면 개별 이벤트는 쿨다운보다 훨씬 드물게 뜬다:

```
EVT_RAND_TEAM_MEAL       풀 26% × 가중 20% = 주당 5.2%  → 19주에 한 번   cd=2  안 걸림
EVT_RAND_LOCAL_INTERVIEW 풀 18% × 가중 29% = 주당 5.2%  → 19주에 한 번   cd=2  안 걸림
                                      (실측 ×10 / 416주 = 2.4% — 대학이 8시즌 중
                                       일부라 산식보다 낮게 나온다. 어느 쪽이든 cd 2 밖이다)
```

대학에서 닿는 랜덤 풀의 주당 사기 기여 (첫 선택지 기준 · 조건 통과분만):

```
POOL_TEAM_LIFE  26% × 3.29  +0.86     RAND_TEAM_MEAL +12 이 지분 20%
POOL_MEDIA      18% × 3.85  +0.69     LOCAL_INTERVIEW +8 두 종이 지분 48%
POOL_BODY        9% × 6.21  +0.56     UNIV_RECOVERY_DAY +12 이 지분 52%
POOL_SOCIAL     22% × 1.88  +0.41
POOL_TRAIN      13% × 1.36  +0.18                          합 +2.70/주
                                      (고교는 같은 식으로 +3.28/주)
```

⚠ **처음엔 +1.94 로 적었는데 틀렸다.** 조건을 셀 때 `career_stage` 의
`stages` 배열과 `league_id` 의 `leagueIds` 배열을 안 봐서 다른 무대 이벤트가
후보에 섞였다. 누출을 걷어내니 대학 전용 이벤트의 지분이 커져 **값이 오히려
올라갔다.** 조건을 기계로 셀 땐 `conditionEvaluator.ts:26-41` 과 같은 판정을 쓴다.

주간 회귀는 사기 95 에서 **−1.75** 다(`moraleAfterWeek` · pivot 60 · pull 0.05).
**랜덤 풀만으로 회귀를 이긴다.** 그래서 사기가 100 에 붙고, 클램프에 먹혀
델타 표에는 +0.30 으로만 보인다 — 표의 작은 숫자가 압력의 크기가 아니다.

→ 손잡이는 쿨다운(§3.6 방향 1)이 아니라 **양수 폭**(방향 2)이다. 둘 다 같은
사용자 확정 안이라 방향 2 로 간다.

## §C 곁가지 둘 — A 가 알아야 할 것

1. **헤드리스는 `choices[0]` 고정이 아니다.** `runAutoAdvance.ts:51` 의
   `pickChoice` 는 피로 70 이상이면 "휴식·거절·패스·쉬·무시" 라벨을,
   30 이하면 "훈련·수락·참가·도전·시작" 라벨을 먼저 고른다. `choices[0]` 은
   그 사이일 때만이다. §3.6 의 주의문을 그대로 믿으면 안 된다.
2. ~~대학 풀에 `EVT_FARM_LIFE_*` 가 섞인다~~ — **B 가 틀렸다(같은 날 정정).**
   무대 누출은 없다. FARM 계열은 `league_id`(`leagueIds`)로, PRO_LIFE 계열은
   `career_stage` 의 **`stages` 배열**로 이미 막혀 있다. 처음 분석기가
   `stage` 단수만 읽어 둘 다 후보로 셌다 — `conditionEvaluator.ts:26-41`
   이 정본이고 **배열형과 단수형을 둘 다 본다.** 조건을 기계로 셀 땐
   그 함수와 같은 판정을 써야 한다.

---

# B → A 인계 (2026-08-26)

> **트랙 B(이벤트·소식함) 정비 한 판을 끝냈다.** 병합해서 전체 검사를 돌려주면 된다.
>
> B 브랜치: `track/events` (워크트리 `ProjectB-events`)
> 지난 인계 이후 **커밋 27개** · 결과 보고서 [EVENT_REPORT_2026-08-25.md](EVENT_REPORT_2026-08-25.md)

---

## 1. ✅ A 소유 파일은 하나도 안 건드렸다

```
git diff --stat 4939ccf40 HEAD -- apps/ui/src/shared/stores/game.ts \
    apps/ui/src/shared/usecases/ apps/ui/src/pages/ packages/
→ (빈 출력)
```

B가 고친 건 **이벤트 데이터**와 **이벤트 엔진 주변**뿐이다:

| 영역 | 변경 |
|---|---|
| `resource/data/master/events/` · `messages/` | 283파일 · 이벤트 535 → **589종** |
| `utils/conditionEvaluator.ts` · `eventEngine.ts` · `eventPaths.ts` | +75줄 (아래 §3) |
| `stores/master.ts` · `types/event.ts` | 조건 검증·타입 |
| `utils/__tests__/` | 검사 766 → **802** |
| `scripts/` | 게이트 6개 · 계측 4개 |
| `scripts/perf/perfEntry.ts` | 14줄 (하네스 — 아래 §4) |

---

## 2. 🔴 A가 봐야 할 것 — 게임 쪽 결함 다섯

전부 **B가 못 고치는 자리**다. 이벤트 데이터로는 우회만 했다.

| # | 결함 | 근거 |
|---|---|---|
| 1 | **성실이 단방향이다** | 양수 보상 95 대 음수 3(전부 대학 −2). 시작 60에서 **바닥이 54**라 `diligence_lte 30`이 영원히 false. `diligenceRange.test.ts`가 못박아 뒀다 |
| 2 | **사기가 좁은 띠에 붙어 있다** | `COND_SLUMP`(사기≤38)·`RAND_TEAM_MEAL`(사기≤72)이 **네 경로 전부에서 0회**. 반대로 `diligence_gte 80`은 중반부터 매년 뜬다 |
| 3 | **`military_phase`가 스텁이다** | 항상 false를 반환한다(`conditionEvaluator.ts`). 군 서사는 `militaryStatus`/`militaryUnit`/`militaryServiceWeeks` 경로로 우회했다 — 살릴 계획이 있으면 옮긴다 |
| 4 | **`removeTag`가 없다** | 태그로 만든 연계를 닫을 수단이 없다(§5) |
| 5 | **학점을 건드릴 보상이 없다** | `universityGpa`는 조건으로 읽기만 한다. 힌트 여덟 자리가 "학점 유리"라 써놓고 **성실만 움직이고** 있었다 — 문구를 동작에 맞췄다 |


### 사용자가 이미 정한 것 셋 — 결함이 아니다 (2026-08-26)

| | 결정 |
|---|---|
| **주인공은 항상 투수다** | 의도다. `NewGamePage.svelte:271`의 하드코딩은 그대로 둔다. ⚠ 그래도 이번에 만든 71종은 **타자 갈래를 미리 넣어 뒀다** — 열리는 날 되돌아오는 것보다 쓸 때 넣는 게 싸다. 크기는 재 뒀다(`check:playertype`의 ② **306건**) |
| **해외 진출은 추후 개발** | `careerStage`를 `pro_abl`/`pro_jbl`로 쓰는 코드가 없는 건 아직 안 만든 것이다. ⚠ **해외 258종은 그때까지 도달 불가**다 — 재고만 채워 뒀다 |
| **2군에서 1군 이벤트가 다 뜨는 것** | 일단 둔다. `careerStage`가 2군에서도 `pro_kbl`이라 189종이 그대로 후보다 — 추후에 다시 본다 |

---

## 3. B가 엔진에 넣은 것 — 검토 부탁

전부 **기존 동작을 안 바꾸는 확장**이다. 단일 값은 그대로 돈다.

| 파일 | 무엇 | 왜 |
|---|---|---|
| `conditionEvaluator.ts` | `career_stage`가 **`stages` 배열**을 받는다 | 프로 세 리그를 한 번에 가리킬 수단이 없어 **해외로 나가면 1군 이야기 171종이 통째로 멈췄다** |
| 〃 | `league_id`가 **`leagueIds` 배열**을 받는다 | 같은 이유로 **ABL·JBL 2군이 0종**이었다 |
| 〃 | `player_type`이 **`twoWay`를 양쪽으로** 본다 | 정확 일치라 투타겸업에게 **투수 것도 타자 것도 안 떴다** |
| `eventEngine.ts` | `candidateByRule` 계수기 | "뽑기에서 졌다"와 "조건이 안 닿았다"를 못 갈랐다(§6) |
| `eventPaths.ts` | 경로 몇 개 추가 | `leagueYears` 등 |
| `stores/master.ts` | 배열 조건 검증 · `parseEffectsArray`에 `money`/`relation.*`/`luxury` | 문자열형 보상이 그 셋을 못 실었다 |

⚠ `stores/master.ts`는 A/B 경계에 걸쳐 있다. **로더·검증만 건드렸고 게임
로직은 안 건드렸다.**

---

## 4. 하네스(`scripts/perf/perfEntry.ts`) 14줄

계측이 안 되던 자리 둘을 고쳤다. **게임 코드가 아니라 계측 하네스다.**

| 무엇 | 왜 |
|---|---|
| 대학 지원을 **전력 낮은 쪽부터** 고른다 | 알파벳순 상위 3개를 골라 **늘 떨어졌고**, 그래서 **대학 113종이 한 번도 계측된 적이 없었다** |
| `eventRuleProbe`에 `후보` 필드 | 위 계수기를 읽는다 |

---

## 5. 알아두면 좋은 것 — 연계는 태그로만 된다

🔴 **후속 이벤트를 예약할 수단이 없다.** `nextEvents` 같은 필드가 없고,
`triggeredEvents`는 **"언제"만 남기고 무엇을 골랐는지는 안 남긴다.**

그래서 연계의 유일한 수단이 **상태에 흔적을 남기는 보상**(태그·관계·돈)이다.
사슬 셋을 그 방식으로 만들어 증명했다(`EVT_CHAIN_FORM_REBUILD_*`).

`removeTag`가 생기면 더 나은 모양으로 다시 짤 수 있다.

---

## 6. 새 게이트 여섯 — CI에 넣을지 판단 부탁

전부 **"아무도 안 죽고 로그도 안 남는" 결함**을 잡는다. 이번에 열셋을 찾았고
셋은 **B가 만들면서 낸 것을 커밋 전에 잡았다.**

```bash
npm run check:eventconditions   # 조건 타입·필드·경로
npm run check:effectkeys        # 보상 키 — 모르는 키는 조용히 버려진다
npm run check:effecthints       # 힌트가 주지 않는 보상을 약속하는가
npm run check:playertype        # 투수 전용인데 대상을 안 밝힌 것
npm run check:eventranges       # 조건값이 그 축의 눈금 안인가
npm run check:eventslots-health # 무대별 건강 진단 (게이트 아님 · 표만 찍는다)
```

계측 넷:

```bash
npm run measure:eventslots      # 재고 — 무대에 몇 개 있나
npm run measure:slotreach       # 소비 — 몇 개나 닿나  (--path indie|univ|draft|army)
npm run measure:eventrules      # 이름을 댄 규칙의 시즌별 증가분
npm run measure:mailbox         # 소식함이 무엇으로 차는가
```

---

## 7. B가 잰 것 중 A가 알아야 할 셋

### ① 소식함의 64%가 코드 소식이다

```
6시즌 292주 · 경로 indie
코드 소식 1029통 (64%) · 이벤트 578통 (36%)
보유 500/500 · 밀려남 1107통 (68.9%)
```

`msg-train`이 **매주 한 통씩 292통** — 코드 소식의 28%가 훈련 보고 하나다.
대회 소식(`msg-tour-*`)이 234통으로 그다음.

⚠ **`trimMailbox`는 두 계통을 구분하지 않는다.** 다만 미결 선택지는 상한
위로 보존하므로 **선택지 있는 이벤트는 안 밀려난다** — 밀려나는 건 대부분
읽고 넘기는 알림이다.

### ② 값을 말해야 하는데 고정 문구인 이벤트 23종

**템플릿 467개 중 치환 변수를 쓰는 게 0개다.** "4월 결산"에 4월 성적이 안
들어가고, "시상식"이 수상해도 "수상자가 아니어도 참석은 합니다"라고 한다.

같은 소재가 두 시스템에 동시에 있기도 하다 — `EVT_HS_Y1_TOP10_REPORT`가
"이름을 올렸습니다"(고정)라고 하는 동안 `msg-top10`은 **실제 순위**를 말한다.
**둘 다 뜬다.**

⚠ 사용자 판단으로 **미뤘다** — [EVENT_DEFERRED.md](EVENT_DEFERRED.md)에
선택지 셋과 판단 근거를 적어 뒀다.

### ③ 군은 이벤트 엔진이 안 돈다

`advanceWeek`가 `careerStage === "military"`면 **일찍 return한다**
(`advanceWeek.ts:1879`). 그 아래 `runEventEngine()`이 안 불린다.

B가 군 서사 14종을 **조건부 이벤트로 만들었다가** 계측 0회를 보고 알았다.
`events/pools/military_*.json`으로 옮겼다(35 → **54종**).
⚠ 계급 경계도 틀렸었다 — 12/40/70주로 근사했는데 실제는
`advanceWeek.ts:1897`의 **8/34/60**이다.

---

## 8. 병합 뒤 확인

```bash
npm run gen:manifest            # 🔴 빠뜨리면 새 규칙이 조용히 안 실린다
npm test                        # 802건
npm run check:eventconditions && npm run check:effectkeys && \
npm run check:effecthints && npm run check:playertype && npm run check:eventranges
npm run measure:eventslots      # 재고표 — 589종 · 빈 무대 없음
```

⚠ **`_manifest.json`은 gitignore다.** 새 워크트리에서는 `gen:manifest`를
반드시 먼저 돌린다 — 없으면 로더가 던진다(예전엔 19건짜리 스텁으로 조용히
폴백했고 그 상태로 잰 계측이 오진을 냈다).

---

## 9. 밸런스 — 확정을 받아야 할 값 열

전부 이번에 처음 들어간 값이라 **전례가 없다.** 보고서 §11에 표로 있다.
가장 큰 둘:

| | |
|---|---|
| **랜덤 추첨률 26% → 48%** | 42종이 35뽑기를 나누던 걸 65뽑기로. **주당 랜덤 소식 0.66 → 1.14건** |
| **돈 눈금** | 단위는 만원. 학생 15~40 띠 · 프로 150~1000 띠. 고교생 주 순현금이 5.5라 프로 값을 그대로 못 쓴다 |
