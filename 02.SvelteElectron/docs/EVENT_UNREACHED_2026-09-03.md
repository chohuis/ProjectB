# 못 닿는 이벤트 판정표 (2026-09-03 · 트랙 B · B-22)

B-9 도달률 표(`HANDOFF_B_TO_A` §J)에서 **못 닿음으로 남은 것**을 넷으로 갈랐다.

```
A 조건이 너무 좁다 (값 제안)      12종
B 죽은 조건 (코드에 없는 경로·값)   0종
C 상황상 못 닿음 (그대로 둔다)     11묶음
D 지운다 (중복·낡음)               1종
```

**지우지도 고치지도 않았다. 표만이다.** 값 제안은 `BALANCE_BACKLOG.md` 에 있다.

---

## 0. 근거 — 새 계측을 안 돌렸다

| 어디서 | 무엇 |
|---|---|
| `HANDOFF_B_TO_A` §J | 무대별 재고·닿음·못닿음 (`measure:slotreach --full` · 새 엔진) |
| 같은 문서 §H | 대학 못닿음의 **이름** (씨앗 셋 · `PB_STUDY_MODE` 대조 포함) |
| 같은 문서 §E | 고교 사기 분포 (평균 89~93 · 최소 62~68 · ≤60 **0주**) |
| 같은 문서 §D | 대학 사기 분포 (평균 72.6/82.5/72.7 · 최소 45.0/57.5/38.6) |
| 커밋 `4dfbc2da5` | 현역 군 창 감사 — `isEligible` 기댓값 계산 |
| `BALANCE_BASELINE_2026-09-05` §58 | 상무 27/34 (**낡았다** — §5 참고) |
| 코드 | `conditionEvaluator` · `eventPaths` · `financeRules` · `types/season.ts` |

🔴 **조건을 기계로 셀 땐 `conditionEvaluator` 와 같은 판정을 쓴다.** 이 표를
만든 스캐너도 `career_stage.stage`/`stages[]` 와 `league_id.leagueId`/`leagueIds[]`
를 **둘 다** 본다. 이 트랙이 같은 함정을 세 번 밟았다.

---

## 1. A — 조건이 너무 좁다 (12종 · 값 제안)

### 1-1. 고교 사기 다섯 — 실측 최소보다 낮다

고교 사기는 세 씨앗 전부 **최소 62~68 · ≤60 이 0주**다(§E).

고교에서 `morale_lte` 를 쓰는 건 여섯인데, 여섯째 `EVT_HS_LIFE_TEAM_MEAL`
(`morale_lte 75`)만 실측 최소 위라 **혼자 뜬다.** 나머지 다섯이 아래다.

| 이벤트 | 조건 | 실측 | 제안값 |
|---|---|---|---|
| `EVT_HS_LIFE_CLASSMATE_01` | `morale_lte 58` | 최소 62 | 70 |
| `EVT_HS_Y1_AFTER_ERROR` | `morale_lte 50` | 〃 | 62 |
| `EVT_HS_Y2_TEAM_SLUMP` | `morale_lte 50` | 〃 | 62 |
| `EVT_HS_Y2_SLUMP` | `morale_lte 45` | 〃 | 58 |
| `EVT_HS_LIFE_SLUMP_CHECK` | `morale_lte 34` | 〃 | 45 |

🛑 **1.0 에서는 안 고친다** — 사용자가 §E 에서 「등판 비중과 같이 본다 · 1.1 로
둔다」로 확정했다. **문턱이 아니라 사기 하향 압력이 원인**이라는 판단이고,
문턱만 올리면 다섯이 한꺼번에 흔해진다. 위 제안값은 **문턱 쪽으로 갈 경우**의
값이다.

### 1-2. 대학 학점 다섯 — 기본 갈래가 2.48 에 갇힌다

```
학기 GPA = 주간 학습 품질 평균 × 4.5 × 전공배수
           focus 0.85 → 3.83   normal 0.55 → 2.48   rest 0.3 → 1.35
```

`weeklyStudyMode` 는 `"normal"` 로 시작하고 **`setStudyMode`(화면 조작)로만**
바뀐다. `PB_STUDY_MODE=alternate` 로 다시 재니 열 종 중 **다섯이 열렸다**(§H).
남은 다섯은 `gpa ≤ 2` 를 **여러 학기 이어서** 밟아야 한다.

| 이벤트 | 조건 | 제안값 |
|---|---|---|
| `EVT_UNIV_GPA_DANGER` | `gpa_lte 2` | 2.4 |
| `EVT_UNIV_GRAD_RISK` | `gpa_lte 2` | 2.4 |
| `EVT_UNIV_Y3_GPA_VS_BALL` | `gpa_lte 2` | 2.4 |
| `EVT_UNIV_WARN_2` | `academic_warning_gte 2` | 그대로 (경고가 나면 따라온다) |
| `EVT_UNIV_WARN_3` | `academic_warning_gte 3` | 그대로 |

⚠ **값 제안이 답이 아닐 수 있다.** 진짜 구멍은 `school.weeklyStudyMode` 를
쓰는 **선택지가 0건**이라는 것이다 — `eventPaths.ts:129` 에 허용 경로로
올라 있는데 아무 이벤트도 안 쓴다. **구조 질문이라 OP 에 올린다**(§7 ①).

### 1-3. 🔴 `EVT_UNIV_Y2_PART_TIME` — 좁은 게 아니라 방향이 반대다

```
조건       money_lte 200          (단위 만원)
시작 자산  1200                   (stores/game.ts:199)
대학 순현금  (62 − 21) / 4.33 = 주 +9.5   (financeRules.stages.university)
학생 과세  없다                   (financeRules.tax.studentExempt)
```

**돈은 1200 에서 오르기만 한다.** 200 아래로 내려갈 길이 없으므로 이
아르바이트 이벤트는 **한 번도 못 뜬다.** 게다가 `money_lte` 를 쓰는 이벤트는
전체에서 **이것 하나**다 — 다른 데서 검증될 기회도 없었다.

| 제안값 | 왜 |
|---|---|
| `money_lte 1000` | 시작 1200 에서 「쪼들린다」가 되려면 문턱이 시작값 근처여야 한다. 1000 이면 지출 이벤트 몇 번으로 닿는다 |

### 1-4. `EVT_UNIV_INJURY_SCARE_UNIV` — 셋이 동시에 서야 한다

```
career_stage university · fatigue_gte 62 · condition_lte 55 · injured false
```

씨앗 **셋 모두에서 0회**다(§H). 학점 열 종을 빼면 이것만 남는다.

⚠ **컨디션 분포는 아직 아무도 안 쟀다.** 사기(`probe:morale`)처럼 분포를
보고 정해야 하는데 지금 근거가 없다. 제안값은 **재고 적은 값이 아니다.**

| 제안값 | 왜 |
|---|---|
| `fatigue_gte 62 → 55` · `condition_lte 55 → 65` | 둘 다 한 단씩 넓혀 창을 키운다. 어느 쪽이 병목인지는 `probe:condition`(없다) 이 있어야 갈린다 |

---

## 2. B — 죽은 조건 (0종)

**하나도 없다.** 588종을 정적으로 훑었다.

| 무엇을 봤나 | 결과 |
|---|---|
| 서로 어긋나는 조건 (`week_gte 40` + `week_lte 10` 꼴 · 10축) | **0건** |
| 무대 × 리그 어긋남 (`university` + `LEAGUE_KBL` 꼴) | **0건** |
| `player_type: batter` — 주인공은 항상 투수다 | **0건** |
| 학업 조건(`gpa_*`·`school.*`)이 대학 밖에 걸린 것 | **0건** |
| 모르는 조건 타입·어긋난 필드 | **0건** (`check:eventconditions`) |
| 눈금 밖·항상 참인 조건 | **0건** (`check:eventranges`) |

🔴 **게이트 넷이 이미 이 부류를 막고 있다.** 2026-08-22 에 44종이 필드 이름이
틀려 영원히 false 였던 그 형태는 지금 재발할 수 없다 — `assertConditions` 가
로드에서 던지고 `check:eventranges` 가 눈금을 지킨다.

⚠ **§1-3 은 여기가 아니라 A 다.** 경로도 값도 살아 있고, **세상이 그 값으로
안 가는** 것이다. 코드가 잡을 수 있는 부류가 아니다.

---

## 3. C — 상황상 못 닿음 (11묶음 · 그대로 둔다)

🔴 **합계를 내지 않는다 — 묶음이 겹친다.** 해외 75종 안에 순위 조건이 든
것이 있고, 2군 40종은 프로 재고 안에도 든다. 합치면 이중으로 세어진다.

| # | 묶음 | 종수 | 왜 그대로 두나 | 상태 |
|---|---|---|---|---|
| c1 | 팀 순위 상·하위 | 28 (`lte` 19 · `gte` 9) | **한 팀은 상위권이거나 하위권이지 둘 다일 수 없다.** 한 판에서 절반이 안 닿는 게 정상이다 | 그대로 |
| c2 | 프로 갈래 | 22 | 한 커리어가 트레이드·강등·발탁·부상·방출을 다 밟지 않는다 (id 로 세면 트레이드 4 · 강등/콜업 41 · 발탁 4 · 부상 6 · 방출/은퇴 6) | 그대로 |
| c3 | 해외(ABL·JBL) | 75 | 재고가 아니라 **체류 기간**이다 — 12시즌 판에서 늦게 갔다. ABL·JBL 전용은 15종이고 나머지는 프로 공용이 그 무대에서 안 뜬 것이다 | 그대로 |
| c4 | 2군(FARM) | 40 | 쟀던 커리어들이 **강등을 한 번도 안 겪었다.** 재고 문제가 아니다 | A 의 `probe:paths` 「강등→복귀」 |
| c5 | 대학 ERA 문턱 | 2 (`ACE_UNIV` ip30&era≤3 · `DRAFT_STOCK_UP` ip25&era≤3.2) | **대학 4년을 평균 이하로 보내면 안 뜨는 게 맞다.** 씨앗 20260731 은 닿았다 | 그대로 |
| c6 | 대학 조 1위 | 1 (`UNIV_GROUP_LEAD` `team_rank_lte 1`) | 팀이 1위를 못 한 씨앗이 있었을 뿐이다 | 그대로 |
| c7 | 대학 진로 | 2 (`Y3_DRAFT_STOCK_CHECK` · `Y4_UNDRAFTED_FEAR` `scoutScore ≤45`) | 「지명이 불안하다」는 **못하는 커리어의 이야기**다. 잘하면 안 뜨는 게 맞다 | 그대로 |
| c8 | 현역 군 관계·사기 문턱 | 6 | 가중으로 갚아지지 않는다 — **문턱 문제**다. A 가 1.1 로 올렸다 | A · 1.1 |
| c9 | 현역 군 창이 좁던 것 | 3 (`SNOW` · `GUN_MAINT` · `NIGHT_DUTY`) | **이미 갚았다** — `4dfbc2da5` 에서 가중 2→10 · 1→4 · 1→4. `SNOW` 는 0.21회/판이라 한 판 0회 확률이 81% 였다 | 🔴 **재측정 필요** |
| c10 | 대학 학점 다섯 | 5 (`GPA_GOOD` · `SCHOLARSHIP` · `ATTENDANCE` · `WARN_1` · `Y1_FIRST_WARNING`) | **계측 한계였다.** `PB_STUDY_MODE=alternate` 로 다섯이 열렸다 | 열렸다 |
| c11 | 상무 새로 살린 다섯 | 5 | 죽은 풀 `military.json` 에서 `military_common` 으로 옮긴 것들이다(`1a7b4a9c4`) — **D 09-04 재측정: 2/5 확인, 3/5 미확인(씨앗 1개)** | 🟡 **부분 확인 — 씨앗 더 필요** |

### c11 — 인용된 27/34 는 낡았다

```
그때   상무 재고 = common 14 + sports 20 = 34      27/34 = 79%
지금   상무 재고 = common 19 + sports 20 = 39      27/39 = 69%  (같은 27 로 치면)
```

옮겨 온 다섯은 `MIL_EVT_DRILL_EXCELLENCE` · `MIL_EVT_FIELD_FATIGUE` ·
`MIL_EVT_UNIT_SUPPORT` · `MIL_EVT_REST_WINDOW` · `MIL_EVT_COMMAND_PRESSURE` 다.

**D 09-04 재측정** — `npm run probe:paths -- --path milsports`(씨앗 20260802 ·
12시즌 · 상무 재직 1시즌). `MIL_EVT_UNIT_SUPPORT`(2030 W39) · `MIL_EVT_REST_WINDOW`
(2030 W1) 는 떴다. `DRILL_EXCELLENCE`·`FIELD_FATIGUE`·`COMMAND_PRESSURE`는 이
한 판에서 안 떴다 — 씨앗 하나·상무 재직 1시즌뿐이라 표본 부족일 개연성이 크고
(`military_common.json` 자체가 19종 풀이라 주당 하나만 뽑힌다), 조건이 좁아서인지는
씨앗을 더 돌려야 가른다. 로그 `resource/logs/d-regress/paths_milsports_20260802.log`.
상무 못닿음은 「7종(34−27) + 확인 2종 + 미확인 3종」으로 읽는다 — 5종 전부가
미측정이던 상태는 닫혔다.

---

## 4. D — 지운다 (1종)

### 🔴 `EVT_UNIV_Y4_W50_YEAR_WRAP` — 조건도 템플릿도 완전히 같은 짝이 있었다

```
EVT_UNIV_Y4_W50_CAREER_GATE   pri 960   MSG_UNIV_YEAR_WRAP   dec null   type: mandatory
EVT_UNIV_Y4_W50_YEAR_WRAP     pri 890   MSG_UNIV_YEAR_WRAP   dec null   type: mandatory

조건 (둘이 글자까지 같다)
  career_stage university · week_eq 27 · num_gte school.universityWeek 157
```

## 🔴 정정 (2026-09-03 · B-24 에서 잡았다) — 「영원히 안 뜬다」가 틀렸다

처음에 **「조건부는 주당 하나라 890 은 영원히 안 뜬다」**고 적었다. **둘 다
`mandatory` 다.** 필수 갈래는 우선순위로 하나를 고르는 게 아니라 **조건을
통과한 것을 전부 띄운다**:

```
eventEngine.ts:314   for (const rule of mandatory) tryEmit(rule, "mandatory");
eventEngine.ts:326   conditional 만 「우선순위 내림차순 · 1개」다
```

**그래서 890 은 안 뜨는 게 아니라, 4학년 W27 에 같은 본문이 두 통 온다.**
결함이 더 크지 잘못 본 쪽이 아니다 — 조치(하나를 지운다)는 그대로다.

⚠ **`test:events` [3] 이 이걸 못 잡는 이유도 하나가 아니라 둘이었다.**
① 그 검사는 `type === "conditional"` 만 본다 — **필수는 아예 안 본다.**
② 죽음 판정에 `b.oncePolicy === "repeatable"` 이 붙어 있다.
잣대가 필수 갈래의 중복을 못 보는 자리는 **아직 열려 있다.**

## ✅ 처리 — 사용자 확정대로 지웠다 (B-24 · 2026-09-03)

```
남긴다   EVT_UNIV_Y4_W50_CAREER_GATE (960 · 진로 관문)
지웠다   EVT_UNIV_Y4_W50_YEAR_WRAP   (890)      → events 594 → 593
```

`MSG_UNIV_YEAR_WRAP` 은 960 이 계속 쓰므로 **템플릿은 고아가 안 된다.**

---

## 5. 로그가 이름을 안 적은 것 — 표에 못 넣은 자리

정직하게 적는다. **아래는 개수만 있고 이름이 없다.**

| 무대 | 못닿음 | 이름을 아는가 |
|---|---|---|
| 고교 15~16 | 사기 다섯 + 순위 넷 = **아홉까지 안다** | §J 가 「대회 상위 진출 계열」이라 적었는데 **id 에 대회·권역이 든 고교 이벤트는 0종**이다 — 그 계열은 id 가 아니라 조건으로 갈린다. 고교에서 순위 조건을 쓰는 건 4종(`MEDIA_TEAM_TOP2_PUSH` lte2 · `Y3_BIG_GAME_SPOTLIGHT` lte2 · `Y2_LEADERSHIP_CHECK` lte4 · `LIFE_MEDIA_RIVAL_HEADLINE` lte4)이다. **나머지 6~7 은 모른다** |
| 프로 22 | 아니다 | 갈래 이름만 있다 (c2) |
| 해외 75 | 아니다 | 체류 기간 (c3) |
| 현역 군 6 | 아니다 | 관계·사기 조건이 붙은 후보는 **7종**이다 — `CONFLICT_SENIOR` · `CONFLICT_OFFICER` · `BOND_PEER` · `MENTOR` · `JUNIOR_TROUBLE` · `REWARD_LEAVE`(관계 6) + `MORALE_LOW`(사기 1). 로그가 「여섯」이라 적어서 **하나가 어느 것인지 모른다** |

🔴 **이름을 대려면 `measure:slotreach --full` 을 한 번 더 돌려야 한다.**
지시가 「새 계측은 안 돌려도 된다」라 안 돌렸고, **없는 이름을 지어내지
않았다.** 돌리면 위 네 줄이 이름으로 바뀐다.

---

## 6. 딸린 발견 — 「부진」 조건 넷이 **한 종도 안 쓰인다**

2026-09-01 에 사용자 확정으로 반대쪽 축 넷이 열렸다.

```
season_wins_lte · season_era_gte · season_ip_lte · season_k_lte
```

**쓰는 이벤트가 0종이다**(`check:eventconditions` 의 「엔진엔 있는데 아무
이벤트도 안 쓰는 타입 12종」 목록에 넷이 다 있다). 반대로 「잘함」 쪽
(`season_era_lte`·`season_wins_gte`·`season_k_gte`)을 쓰는 건 32종이다.

🔴 **그래서 부진 서사는 아직 `morale_lte` 가 대역하고 있다.** 그리고 고교의
`morale_lte` 다섯은 §1-1 대로 **안 뜬다.** 두 사실이 겹치면 —

> **고교에는 「못하고 있다」를 말하는 이벤트가 사실상 없다.**

축을 만든 이유가 그것이었는데(`conditionEvaluator` 주석: 「부진·기회부족을
`morale_lte` 가 대역하고 있었다 — 그 조건을 쓰는 이벤트 **42종**」) 축만
생기고 데이터가 안 따라갔다. **1.1 콘텐츠 항목이다.**

---

## 7. 🔴 OP 에 올릴 구조 질문 둘

| # | 질문 | 왜 값 문제가 아닌가 |
|---|---|---|
| 1 | ✅ **확정: 한다.** B-24 에서 `EVT_UNIV_STUDY_MODE_MID`·`_FINAL` 둘을 넣었다. 다만 **지속 모드가 아니라 학기 품질 한 번 밀기**다(§8 참고) — **학습 강도를 이벤트로 고르게 하나.** `school.weeklyStudyMode` 가 `eventPaths` 에 허용 경로로 있는데 **쓰는 선택지가 0건**이고, 바꾸는 길이 화면 조작 하나뿐이다. 선택지를 하나 만들면 GPA 가 2.48 밴드 밖으로 나가고 §1-2 다섯이 저절로 열린다 | 문턱을 내려도 **밴드 안이면 여전히 안 뜬다.** 값으로 못 푼다 |
| 2 | ~~`EVT_UNIV_Y4_W50_*` 둘 중 어느 쪽을 남기나~~ → ✅ **확정: 960(진로 관문)을 남기고 890 을 지운다.** B-24 에서 지웠다 | 뜻의 문제였다 |

---

## 8. 백로그로 넘긴 값

`BALANCE_BACKLOG.md` §7 에 한 줄로 적었다 — 고교 사기 다섯 · 대학 학점 셋 ·
`money_lte 200 → 1000` · `INJURY_SCARE_UNIV` 두 문턱. **전부 제안값이고
사용자 확정 전이다.**

B-24 에서 넣은 새 값 둘도 같은 §7 에 있다 — 학습 선택지의 `studyQualityDelta`
±1.2 와 고교 부진 넷의 문턱(`era ≥ 5.0` · `wins ≤ 1` · `ip ≤ 15` · `k ≤ 12`).
