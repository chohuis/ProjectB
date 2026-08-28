# 이벤트 보강 계획 — 2026-08-28

무대별 밀도 실측에서 나온 결손 넷을 메운다. **이벤트 데이터만** 다룬다 —
엔진·시스템 쪽(상무 경기·야수 교체·스카우팅)은 A 트랙이라 뺐다.

근거 [EVENT_REPORT_2026-08-25.md](EVENT_REPORT_2026-08-25.md) ·
전수 [EVENT_CONTENT_CHECKLIST.txt](EVENT_CONTENT_CHECKLIST.txt) ·
절차 [EVENT_SLOT_LOOP.md](EVENT_SLOT_LOOP.md) ·
어휘 [EVENT_VOCABULARY.md](EVENT_VOCABULARY.md)

---

## 0. 형식 — 파일 셋을 같이 만든다

이벤트 하나는 **파일 셋**이다. 하나라도 빠지면 조용히 죽는다.

```
resource/data/master/events/conditional/EVT_XXX.json   규칙  (언제 뜨나)
resource/data/master/messages/templates.json           문안  (뭐라고 뜨나)
resource/data/master/messages/decision_templates.json  선택지 (뭘 고르나)
```

⚠ **`univ.cjs`가 규칙만 쓰고 문안을 안 써서 24종이 죽어 있었던 적이 있다.**
`check:eventconditions` · `check:effectkeys` · `npm test`가 **전부 통과했다.**
지금은 `eventTemplateWiring` 검사가 고아를 잡는다 — 셋을 같이 쓴다.

### 규칙 (실제 파일 그대로)

```json
{
  "id": "EVT_FARM_BUS_FARM",
  "type": "conditional",
  "category": "team_life",
  "priority": 620,
  "oncePolicy": "repeatable",
  "conditions": [
    { "type": "league_id",
      "leagueIds": ["LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"] },
    { "type": "week_gte", "value": 12 },
    { "type": "week_lte", "value": 40 }
  ],
  "cooldownWeeks": 5,
  "messageTemplateId": "MSG_FARM_BUS_FARM",
  "decisionTemplateId": "DEC_FARM_BUS_FARM"
}
```

### 문안 · 선택지

```json
{ "id": "MSG_FARM_BUS_FARM", "category": "coach",
  "subject": "2군 원정",
  "body": "2군 원정은 당일치기입니다.\n\n경기 끝나고 바로 버스에 오릅니다.",
  "decisionTemplateId": "DEC_FARM_BUS_FARM" }

{ "id": "DEC_FARM_BUS_FARM",
  "prompt": "당일치기 원정입니다. 이동 중 무엇을 하시겠습니까?",
  "options": [
    { "id": "rest",  "label": "잔다",
      "effectHint": "피로 -6, 컨디션 +4",
      "effects": { "fatigueDelta": -6, "conditionDelta": 4 } },
    { "id": "study", "label": "영상을 본다",
      "effectHint": "컨트롤 XP +2",
      "effects": { "xp": { "control": 2 } } }
  ] }
```

⚠ **`effectHint`는 `effects`와 반드시 같아야 한다.** 예전에 힌트가
"감독 관계 +6"인데 실제로는 `moraleDelta`만 움직인 자리가 있었다.
`check:effecthints`가 이 거짓말을 세 번 잡았다.

### 보상 눈금 — 기존 재고 실측 (2026-08-28)

이 띠 안에서 쓴다. 벗어나면 `check:eventranges`가 잡는다.

```
                     최소     최대    중앙    사용 건수
  moraleDelta          -8      15      5       281
  fatigueDelta        -20      16      6       332
  conditionDelta       -3      12      5       133
  xp (항목당)            1       5      2       415   ← 상한이 5다
  relationDelta        -8      12      6       127
  diligenceDelta       -3       7      3       147
  fameDelta            -4       8      3        71
  popularityDelta      -3      10      4        56
  moneyDelta         -800     250     -8        20   ← 만원. 재고가 얇다
  statDelta             1       1      1        10   ← 즉시 스탯. 아껴 쓴다
```

**돈 띠** (만원): 학생 15~40 · **2군 50~300** · 프로 150~1,000

`relationDelta`는 **한 선택지에 하나**다(`{kind, delta}` 단수).
`kind`는 `manager` · `coach` · `owner` · `teammate` · `rival` 다섯.

⚠ `luxurySpend`와 `moneyDelta`를 **같이 쓰지 않는다** — 두 번 빠진다.

---

## 1. 어느 갈래에 넣나 — 실측이 정한다

```
필수   105건   모두 조건 통과 시 발신
조건부 322건   ⚠ 주당 1칸 (urgent는 상한 밖)
랜덤   162건   가중치 뽑기
```

### 조건부 한 칸을 누가 가져가나

```ts
const urgent = eligible.filter(r => tierOf(r) === "urgent");
for (const r of urgent) tryEmit(r);          // 상한 밖 — 전부 나간다

const rest      = eligible.filter(r => tierOf(r) !== "urgent");
const freshOnes = rest.filter(r => ctx.triggeredEvents[r.id] === undefined);
const fresh     = freshOnes.find(r => tierOf(r) === "important") ?? freshOnes[0];
tryEmit(fresh ?? rest[0]);                   // 딱 한 건
```

`tierOf`는 안 적혀 있으면 추론한다 — `repeatable` → `ambient`,
그 밖(`once_*`) → `important`.

**여기서 배치 원칙이 나온다:**

| 성격 | 정책 | 등급 | 갈래 | 왜 |
|---|---|---|---|---|
| 첫 승·첫 세이브·은퇴 발표 | `once_per_career` | `important` | 조건부 | 한 번 뜨고 빠진다. **칸을 안 막는다** |
| 시즌 이정표 (2군 타이틀) | `once_per_season` | `important` | 조건부 | 해마다 한 번 |
| 방출 통보·강등·그만둘까 | `once_per_career` | **`urgent`** | 조건부 | **상한 밖** — 즉시 떠야 한다 |
| 일상 (합숙소·버스·회식) | `repeatable` | `ambient` | **랜덤** | 칸을 다투면 이정표를 밀어낸다 |

🔴 **일상거리를 조건부에 넣지 않는다.** 지금 조건부 322건 중 `repeatable`이
**146건**이다. 그게 한 칸을 매주 다투면서 `once_per_career` 이정표를 밀어낸다.
이번에 만드는 일상 계열은 **랜덤 풀로 보낸다.**

### 그래서 184종의 배분

```
조건부  118종   이정표·서사·갈림길   (once_per_career 71 · once_per_season 34 · urgent 13)
랜덤     66종   일상·환경·관계

조건부 322 → 440   ⚠ 37% 증가. 그런데 늘어난 118 중 105건이 `once_*`라
                    한 번 뜨면 후보에서 빠진다 — 상시 경쟁자는 13건만 는다
```

**앞선 계획안이 "57% 증가"라 적었는데 그건 갈래를 안 가르고 센 값이다.**

---

## 2. 무대별 현황 (실측)

```
조건부 322건이 무대에 어떻게 앉아 있나

  pro_kbl                        81
  highschool                     75
  university                     69
  independent                    30
  2군 (LEAGUE_*_FARM)             22
  pro_kbl+pro_abl+pro_jbl        18      세 프로 공용
  (무대 조건 없음)                 12
  pro_abl+pro_jbl                11      해외 공용
  pro_abl 전용 / pro_jbl 전용      2 / 2
```

---

## 3. KBL 2군 — 신규 62종

**가장 크게 비었다.** 40종은 1군 189종의 21%인데 시스템은 1군과 똑같이 다 돈다.

주제 넷이 **0**이다 — 경기 결과 · 심리·서사 · 진로·전환 · 미디어(1종).

**모든 규칙에 공통으로 붙는 조건:**

```json
{ "type": "league_id",
  "leagueIds": ["LEAGUE_KBL_FARM", "LEAGUE_ABL_FARM", "LEAGUE_JBL_FARM"] }
```

🔴 **62종이 세 리그 2군에 동시에 뜬다 — 실제로는 186종어치 자리를 채운다.**
기존 `EVT_FARM_BUS_FARM`이 이미 이 모양이다. 그대로 따른다.

### 3-A. 경기 결과 — 14종 (조건부)

| id | 추가 조건 | 정책·등급 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_FARM_FIRST_WIN` | `num_gte stats.w 1` | career·**important** | 기뻐한다 → 사기+12 명성+3 / 아직 멀었다 → 성실+3 XP command 2 |
| `EVT_FARM_FIRST_SAVE` | `num_gte stats.sv 1` | career·important | 마무리를 노린다 → XP clutch 2 / 선발이 목표다 → XP stamina 2 |
| `EVT_FARM_COMPLETE_GAME` | `num_gte stats.ip 30` | season·important | 감각을 유지 → 피로+8 XP stamina 3 / 아낀다 → 피로-6 |
| `EVT_FARM_SHUTOUT` | `season_era_lte 1.5` + `num_gte stats.ip 20` | season·important | (알림) 명성+5 사기+10 |
| `EVT_FARM_ERA_CLIMB` | `season_era_lte 3.0` + `num_gte stats.ip 25` | season·important | (알림) 사기+8 감독 관계+5 |
| `EVT_FARM_K_RUN` | `season_k_gte 40` | season·important | (알림) 명성+3 XP velocity 2 |
| `EVT_FARM_BLOWN` | `condition_lte 60` + `morale_lte 50` | repeatable·ambient · cd 6 | 영상을 본다 → XP command 2 피로+5 / 잊는다 → 사기+6 / 코치에게 묻는다 → 코치 관계+6 |
| `EVT_FARM_HIT_HARD` | `morale_lte 45` + `week_gte 20` | repeatable·ambient · cd 8 | 폼을 본다 → XP movement 2 / 체력을 본다 → XP stamina 2 / 쉰다 → 피로-10 사기+5 |
| `EVT_FARM_WIN_STREAK` | `num_gte standing.wins 8` | season·important | 팀에 맞춘다 → 동료 관계+6 / 내 것에 집중 → XP control 2 |
| `EVT_FARM_LOSE_STREAK` | `num_gte standing.losses 8` | season·important | 앞장선다 → 동료 관계+8 피로+6 / 조용히 있는다 → 사기-3 XP command 2 |
| `EVT_FARM_LONG_RELIEF` | `num_gte stats.ip 40` + `num_lte stats.gs 3` | season·important | 불펜을 받아들인다 → XP recovery 3 감독 관계+5 / 선발을 요청한다 → 감독 관계-4 XP stamina 3 |
| `EVT_FARM_NO_DECISION` | `num_gte stats.g 10` + `num_lte stats.w 1` | season·important | 운이라 넘긴다 → 사기+6 / 내 탓으로 본다 → 성실+4 사기-3 |
| `EVT_FARM_CLOSER_TRY` | `relation_gte coach 45` | career·important | 맡는다 → XP clutch 3 감독 관계+6 / 사양한다 → 감독 관계-3 사기+5 |
| `EVT_FARM_DOUBLEHEADER` | `fatigue_gte 60` | repeatable·ambient · cd 10 | 둘 다 던진다 → 피로+16 감독 관계+8 명성+3 / 한 경기만 → 피로+6 |

### 3-B. 심리·서사 — 12종 (조건부)

2군은 **"언제 올라가나"가 축**인데 지금 그걸 다루는 게 콜업 계열 5종뿐이다.
전부 `num_*` + `leagueYears` 경로를 쓴다.

| id | 추가 조건 | 정책·등급 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_FARM_YEAR_ONE_HOPE` | `num_lte leagueYears 1` + `week_gte 10` | stage_year·important | 아직 시간이 있다 → 사기+10 / 조급하다 → 성실+5 피로+6 |
| `EVT_FARM_YEAR_TWO_DOUBT` | `num_gte leagueYears 2` + `num_lte leagueYears 3` | stage_year·important | 방식을 바꾼다 → XP 자유 3 / 믿고 간다 → 사기+8 성실+3 |
| `EVT_FARM_YEAR_FOUR_WALL` | `num_gte leagueYears 4` | stage_year·important | 천장이 아니다 → 사기+12 피로+8 / 인정한다 → 사기-5 성실+5 |
| `EVT_FARM_YOUNGER_PASSED` | `week_gte 20` | repeatable·ambient · cd 12 | 배운다 → 동료 관계+6 XP 2 / 분하다 → 사기-4 성실+6 |
| `EVT_FARM_SAME_ROSTER` | `num_gte leagueYears 2` + `week_lte 6` | season·important | 익숙해서 좋다 → 동료 관계+6 / 지겹다 → 사기-4 |
| `EVT_FARM_WATCH_FIRST_TEAM` | `week_gte 8` | repeatable·**ambient → 랜덤** | 배울 걸 찾는다 → XP 2 / 채널을 돌린다 → 사기+5 |
| `EVT_FARM_WHY_HERE` | `morale_lte 40` | repeatable·ambient · cd 10 | 이유를 되짚는다 → 사기+10 / 그냥 던진다 → 성실+3 |
| `EVT_FARM_COACH_HONEST` | `relation_gte coach 60` | career·important | 다 듣는다 → 코치 관계+8 사기-3 XP 3 / 그만 듣는다 → 코치 관계-5 사기+6 |
| `EVT_FARM_ONE_MORE_YEAR` | `week_gte 40` | season·important | 한 해 더 → 사기+8 성실+4 / 다른 길을 본다 → 사기-3 |
| `EVT_FARM_QUIT_THOUGHT` | `morale_lte 35` + `num_gte leagueYears 3` | career·🔴**urgent** | 버틴다 → 사기+15 성실+7 / 접을 준비를 한다 → 사기-8 |
| `EVT_FARM_SOMEONE_QUIT` | `week_gte 25` | repeatable·ambient · cd 15 | 배웅한다 → 동료 관계+8 사기-4 / 남 일이다 → 사기+3 |
| `EVT_FARM_STILL_HERE` | `week_gte 45` | season·important | (알림) 사기+10 성실+4 |

⚠ `EVT_FARM_QUIT_THOUGHT` 하나만 `urgent`다. 나머지가 다 상한 밖으로 나가면
상한이 무의미해진다.

### 3-C. 기록·미디어 — 10종 (조건부 6 · 랜덤 4)

| id | 추가 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_FARM_LEAGUE_LEADER` | `season_era_lte 2.5` + `num_gte stats.ip 30` | 조건부·season | (알림) 명성+8 사기+12 |
| `EVT_FARM_ALLSTAR` | `fame_gte 15` + `week_gte 22` | 조건부·season | 나간다 → 인기+8 피로+8 / 쉰다 → 피로-10 |
| `EVT_FARM_PERSONAL_BEST` | `num_gte stats.k 50` | 조건부·season | (알림) 사기+10 XP velocity 2 |
| `EVT_FARM_INTERVIEW_SMALL` | `fame_gte 10` | 조건부·season | 성실하게 → 인기+6 성실+3 / 짧게 → 피로-3 |
| `EVT_FARM_SCOUT_OTHER` | `week_gte 20` | 조건부·career | 잘 보인다 → 피로+8 명성+4 / 평소대로 → 사기+6 |
| `EVT_FARM_YOUTH_LOOK` | `num_gte leagueYears 2` | 조건부·season | 사인해준다 → 인기+6 사기+8 / 훈련을 이어간다 → XP 2 |
| `EVT_FARM_LOCAL_PAPER` | `popularity_gte 12` | **랜덤**·repeatable | 오려둔다 → 사기+6 / 대수롭지 않다 → 성실+3 |
| `EVT_FARM_FAN_FEW` | `week_gte 15` | **랜덤**·repeatable | 인사한다 → 인기+5 / 지나간다 → — |
| `EVT_FARM_STAT_SHEET` | `num_gte stats.g 15` | **랜덤**·repeatable | 파고든다 → XP command 2 성실+3 / 덮는다 → 사기+5 |
| `EVT_FARM_HIGHLIGHT_CLIP` | `popularity_gte 20` | **랜덤**·repeatable | 공유한다 → 인기+6 / 지운다 → 성실+3 |

### 3-D. 돈·생활·관계 — 14종 (조건부 5 · 랜덤 9)

돈 2종·감독코치 5종뿐이다. **2군 급여가 1군의 몇 분의 일**이라는 게 서사가 된다.
돈 띠는 **50~300만원**이다.

| id | 추가 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_FARM_THIN_SALARY` | `money_lte 300` | 조건부·season | 아낀다 → 성실+5 사기-3 / 그래도 쓴다 → 돈-80 사기+8 |
| `EVT_FARM_SIDE_WORK` | `money_lte 100` + `week_gte 44` | 조건부·season | 일한다 → 돈+150 피로+10 / 훈련한다 → XP 3 |
| `EVT_FARM_MANAGER_TALK` | `relation_lte manager 30` | 조건부·career | 솔직하게 → 감독 관계+8 / 참는다 → 사기-4 성실+4 |
| `EVT_FARM_VETERAN_DOWN` | `week_gte 12` | 조건부·season | 배운다 → XP 3 동료 관계+6 / 자리를 지킨다 → 사기+6 |
| `EVT_FARM_FAMILY_ASK_AGAIN` | `num_gte leagueYears 3` | 조건부·season | 설명한다 → 사기+8 / 말을 돌린다 → 사기-4 성실+3 |
| `EVT_FARM_GEAR_OWN` | `money_gte 200` | **랜덤** | 좋은 걸 산다 → 돈-120 XP 2 / 쓰던 걸 쓴다 → 성실+3 |
| `EVT_FARM_ROOM_COST` | — | **랜덤** | 합숙소 → 돈+50 사기-3 / 자취 → 돈-90 사기+8 |
| `EVT_FARM_SEND_HOME` | `money_gte 500` | **랜덤** | 보낸다 → 돈-200 사기+12 / 모아둔다 → 성실+4 |
| `EVT_FARM_COACH_DRILL` | `relation_gte coach 50` | **랜덤** | 더 한다 → 피로+12 XP 3 / 오늘은 여기까지 → 피로-6 |
| `EVT_FARM_ROOMMATE_UP` | `week_gte 18` | **랜덤** | 축하한다 → 동료 관계+8 사기-3 / 부럽다 → 성실+5 |
| `EVT_FARM_REHAB_TALK` | — | **랜덤** | 듣는다 → 동료 관계+6 / 자리를 뜬다 → — |
| `EVT_FARM_FAMILY_VISIT` | `week_gte 20` | **랜덤** | 같이 밥을 → 돈-60 사기+12 / 훈련이 있다 → XP 2 |
| `EVT_FARM_PARENT_PROUD` | `num_gte stats.w 3` | **랜덤** | 전화한다 → 사기+10 / 나중에 → 성실+3 |
| `EVT_FARM_SIBLING_JOB` | `num_gte leagueYears 3` | **랜덤** | 축하한다 → 사기-4 성실+5 / 내 길을 간다 → 사기+8 |

### 3-E. 연차 갈래 전용 — 12종 (랜덤)

3-B가 서사라면 이쪽은 **그 해의 풍경**이다. 전부 랜덤·repeatable.

```
1년차   num_lte leagueYears 1
  EVT_FARM_Y1_FIRST_CAMP    첫 2군 캠프        긴장한다 → 피로+8 XP 2 / 담담하다 → 사기+6
  EVT_FARM_Y1_FIRST_ROAD    첫 원정            둘러본다 → 사기+6 / 잔다 → 피로-8
  EVT_FARM_Y1_ROSTER_CHECK  명단을 확인한다     안도한다 → 사기+8 / 위를 본다 → 성실+4
  EVT_FARM_Y1_RULES_HERE    여기 규칙          따른다 → 동료 관계+6 / 내 방식대로 → 사기+5 동료-3

2~3년차  num_gte leagueYears 2 · num_lte leagueYears 3
  EVT_FARM_Y2_SECOND_CAMP   두 번째 캠프       여유가 있다 → 사기+8 / 초조하다 → 성실+5
  EVT_FARM_Y2_GOT_USED      익숙해진 것        좋다 → 사기+6 / 무섭다 → 성실+5 사기-3
  EVT_FARM_Y2_JUNIOR_IN     후배가 들어왔다     챙긴다 → 동료 관계+8 / 신경 안 쓴다 → XP 2
  EVT_FARM_Y2_NOT_YET       아직인가           밀어붙인다 → 피로+10 XP 3 / 기다린다 → 사기+6

4년차~   num_gte leagueYears 4
  EVT_FARM_Y4_OLDEST        최고참             받아들인다 → 동료 관계+8 / 아니라고 한다 → 사기+6
  EVT_FARM_Y4_TEACHING      가르치는 쪽        가르친다 → 동료 관계+10 XP 1 / 내 훈련을 → XP 3
  EVT_FARM_Y4_LAST_YEAR     계약 마지막 해      각오한다 → 사기+10 피로+8 / 담담하다 → 성실+5
  EVT_FARM_Y4_WHAT_NEXT     다음을 정한다       야구를 이어간다 → 사기+8 / 다른 길을 본다 → 성실+5
```

**소계 62종** — 조건부 37 · 랜덤 25

---

## 4. KBL 1군 — 신규 58종

**189종 중 연차 갈래 34종(18%).** 그리고 연차 무관 155종을 훑으니
**시기 색이 아예 옅다** — 초기 냄새 2종·말기 냄새 1종뿐이다.
**기존 것에 밴드를 씌우는 게 아니라 새로 써야 한다.**

공통 조건: `{ "type": "career_stage", "stage": "pro_kbl" }`
연차 축: `proServiceYears` (재고 18건이 이미 쓴다)

### 4-A. 초기 1~3년차 — 20종  `num_lte proServiceYears 2`

**첫 경험 8종은 전부 `once_per_career`다** — 한 번 뜨고 후보에서 빠진다.

| id | 추가 조건 | 정책·등급 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_PRO_FIRST_CALLUP` | — | career·**urgent** | 각오한다 → 사기+15 피로+6 / 담담하다 → 성실+5 |
| `EVT_PRO_FIRST_START` | `num_gte stats.gs 1` | career·important | 전력으로 → 피로+12 XP stamina 3 / 길게 본다 → XP command 3 |
| `EVT_PRO_FIRST_WIN` | `num_gte stats.w 1` | career·important | 공을 간직 → 사기+15 명성+5 / 팀에 돌린다 → 동료 관계+10 |
| `EVT_PRO_FIRST_LOSS` | `num_gte stats.l 1` | career·important | 복기한다 → XP command 3 사기-3 / 넘긴다 → 사기+8 |
| `EVT_PRO_FIRST_SAVE` | `num_gte stats.sv 1` | career·important | 마무리를 노린다 → XP clutch 3 / 선발이 목표다 → XP stamina 3 |
| `EVT_PRO_FIRST_HR_GIVEN` | `num_gte stats.g 3` | career·important | 영상을 본다 → XP movement 3 / 잊는다 → 사기+8 |
| `EVT_PRO_FIRST_CAMP` | `week_lte 4` | career·important | 눈에 들려 한다 → 피로+12 감독 관계+6 / 페이스를 지킨다 → 피로-6 XP 2 |
| `EVT_PRO_FIRST_ROAD` | `week_gte 10` | career·important | 선배를 따라 → 동료 관계+8 돈-100 / 방에 있는다 → 피로-8 |
| `EVT_PRO_UP_DOWN` | `num_lte leagueYears 2` + `week_gte 15` | season·**urgent** | 다시 올라간다 → 사기+10 피로+10 / 지친다 → 사기-6 성실+4 |
| `EVT_PRO_BENCH_LONG` | `num_lte stats.g 5` + `week_gte 20` | season·important | 감독에게 묻는다 → 감독 관계+6 사기-3 / 준비만 한다 → 성실+6 |
| `EVT_PRO_ROLE_UNCLEAR` | `week_gte 14` | season·important | 선발을 원한다 → 감독 관계-3 XP stamina 3 / 어디든 → 감독 관계+8 |
| `EVT_PRO_SENIOR_PRESSURE` | `relation_lte teammate 30` | season·important | 맞선다 → 동료 관계-5 사기+10 / 참는다 → 동료 관계+6 사기-5 |
| `EVT_PRO_LOCKER_SPOT` | `week_lte 8` | 랜덤 | 구석을 고른다 → 성실+4 / 가운데를 → 동료 관계+5 |
| `EVT_PRO_BUS_SEAT` | `week_gte 10` | 랜덤 | 뒷자리 → 동료 관계+6 / 앞자리 → 피로-6 |
| `EVT_PRO_FIRST_FAN` | `popularity_gte 20` | career·important | 사인해준다 → 인기+8 / 서두른다 → 피로-3 |
| `EVT_PRO_JERSEY_SOLD` | `popularity_gte 30` | career·important | (알림) 인기+8 사기+10 |
| `EVT_PRO_FIRST_CARD` | `fame_gte 20` | career·important | (알림) 명성+5 사기+8 |
| `EVT_PRO_HOMETOWN_NEWS` | `week_gte 20` | 랜덤 | 부모에게 → 사기+10 / 쑥스럽다 → 성실+3 |
| `EVT_PRO_SCHOOL_VISIT` | `week_gte 30` | season·important | 간다 → 인기+8 피로+8 사기+10 / 사양한다 → XP 2 |
| `EVT_PRO_AGENT_FIRST` | `fame_gte 25` | career·important | 맡긴다 → 돈-200 명성+6 / 직접 한다 → 성실+6 |

### 4-B. 중기 4~8년차 — 14종  `num_gte proServiceYears 3` + `num_lte proServiceYears 7`

| id | 추가 조건 | 정책·등급 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_PRO_BACKUP_FALL` | `num_lte stats.g 10` + `week_gte 24` | season·important | 되찾는다 → 피로+12 XP 3 / 받아들인다 → 사기-5 성실+5 |
| `EVT_PRO_ROLE_SWITCH` | `relation_gte manager 50` | career·important | 요청한다 → 감독 관계+6 XP 자유 3 / 맡긴다 → 감독 관계+8 |
| `EVT_PRO_INJURY_RETURN` | `injury_count_gte 1` + `eq injured false` | season·important | 서두른다 → 피로+15 XP 3 / 천천히 → 컨디션+12 |
| `EVT_PRO_SLUMP_LONG` | `morale_lte 40` + `week_gte 20` | season·important | 폼을 뜯는다 → XP movement 3 사기-3 / 쉰다 → 피로-15 사기+10 |
| `EVT_PRO_ARBITRATION` | `week_gte 42` | season·important | 신청한다 → 구단주 관계-6 돈+800 / 받아들인다 → 구단주 관계+8 |
| `EVT_PRO_MULTIYEAR` | `fame_gte 40` + `week_gte 43` | career·important | 장기로 → 구단주 관계+10 사기+12 / 해마다 본다 → 명성+4 |
| `EVT_PRO_SALARY_GAP2` | `money_lte 5000` | season·important | 더 던진다 → 피로+12 성실+6 / 신경 끈다 → 사기+8 |
| `EVT_PRO_MARRIAGE` | `num_gte age 26` | career·**urgent** | 결혼한다 → 돈-1000 사기+15 / 미룬다 → 성실+5 사기-3 |
| `EVT_PRO_CHILD` | `num_gte age 27` | career·**urgent** | (알림) 사기+15 성실+5 |
| `EVT_PRO_FAMILY_MOVE` | `money_gte 8000` | career·important | 옮긴다 → 돈-800 사기+12 / 그대로 → 성실+4 |
| `EVT_PRO_NATIONAL_CALL` | `fame_gte 50` + `week_gte 22` | season·important | 간다 → 명성+8 피로+15 / 사양한다 → 명성-4 피로-8 |
| `EVT_PRO_NATIONAL_CUT` | `fame_gte 35` | season·important | 이유를 찾는다 → 성실+6 사기-5 / 다음을 본다 → 사기+8 |
| `EVT_PRO_CHARITY_LEAD` | `money_gte 10000` | career·important | 기부한다 → 돈-500 명성+8 인기+8 / 조용히 → 명성+3 |
| `EVT_PRO_YOUTH_CLINIC` | `popularity_gte 45` | 랜덤 | 나간다 → 인기+8 피로+8 / 사양한다 → XP 2 |

⚠ **국가대표는 시스템이 344줄인데(`national_team.rs`) 이벤트가 0종이다.**
여기 둘이 첫 연결이다. 실제 선발 결과를 읽는 게 아니라 **조건으로 흉내낸다** —
진짜 배선은 A 트랙이다.

### 4-C. 말기 9년차~ — 16종  `num_gte proServiceYears 8`

**은퇴 서사가 통째로 없다.** 진로·전환 주제가 KBL 1군에 3종뿐이다.

| id | 추가 조건 | 정책·등급 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_PRO_RELEASE_NOTICE` | `morale_lte 45` + `week_gte 42` | career·🔴**urgent** | 받아들인다 → 사기-10 성실+6 / 다른 팀을 찾는다 → 명성-3 사기+8 |
| `EVT_PRO_DEMOTE_LATE` | `week_gte 20` | season·🔴**urgent** | 다시 올라간다 → 피로+15 사기+10 / 무너진다 → 사기-12 |
| `EVT_PRO_NOT_CALLED` | `week_gte 45` | season·important | 기다린다 → 사기-6 성실+5 / 눈을 낮춘다 → 사기+6 |
| `EVT_PRO_YOUNGER_TAKES` | `week_gte 25` | season·important | 가르친다 → 동료 관계+10 사기-4 / 버틴다 → 피로+12 사기+8 |
| `EVT_PRO_LAST_CONTRACT` | `week_gte 43` | career·important | 사인한다 → 사기+10 / 협상한다 → 구단주 관계-5 돈+400 |
| `EVT_PRO_MINIMUM_DEAL` | `money_lte 3000` | season·important | 받는다 → 사기-6 성실+6 / 거절한다 → 사기+8 명성-3 |
| `EVT_PRO_RETIRE_THINK` | `num_gte age 34` | season·important | 아직이다 → 사기+10 피로+8 / 생각한다 → 성실+5 사기-4 |
| `EVT_PRO_RETIRE_ASKED` | `num_gte age 35` + `week_gte 40` | career·**urgent** | 한 해 더 → 사기+12 / 알겠다 → 사기-8 구단주 관계+8 |
| `EVT_PRO_RETIRE_DECIDE` | `num_gte age 35` + `morale_lte 45` | career·**urgent** | 그만둔다 → 사기-10 / 번복한다 → 사기+12 성실+6 |
| `EVT_PRO_RETIRE_ANNOUNCE` | `num_gte age 36` | career·important | 기자회견 → 명성+10 인기+10 / 조용히 → 성실+5 |
| `EVT_PRO_RETIRE_GAME` | `num_gte age 36` + `week_gte 44` | career·important | 던진다 → 사기+15 인기+10 피로+12 / 인사만 → 사기+10 |
| `EVT_PRO_RETIRE_NUMBER` | `fame_gte 120` | career·important | (알림) 명성+10 사기+15 |
| `EVT_PRO_COACH_OFFER` | `relation_gte manager 60` | career·important | 받는다 → 감독 관계+10 사기+10 / 생각해본다 → 성실+5 |
| `EVT_PRO_FRONT_OFFER` | `relation_gte owner 55` | career·important | 받는다 → 구단주 관계+10 돈+300 / 현장을 원한다 → 사기+8 |
| `EVT_PRO_BROADCAST_OFFER` | `popularity_gte 60` | career·important | 받는다 → 인기+10 돈+500 / 사양한다 → 성실+5 |
| `EVT_PRO_ABROAD_LATE` | `num_gte age 33` | career·important | 도전한다 → 사기+12 피로+10 / 여기서 끝낸다 → 사기+8 |

**소계 50종** + 아래 밴드 조정 8종 = **58종**

### 4-D. 기존 규칙에 밴드를 씌우는 것 — 8종

새로 안 만들고 **조건 한 줄만 더한다.** 연차 무관 155종 중 시기 색이
분명한 것만 고른다 (실측에서 초기 2 · 말기 1이 잡혔고, 나머지 5는
읽어 보고 고른다).

```json
{ "type": "num_lte", "path": "proServiceYears", "value": 2 }
```

⚠ **씌우면 그 규칙은 다른 시기에서 사라진다.** 8종으로 제한하는 이유다.
씌운 뒤 `measure:slotreach --path draft`로 프로 도달 수가 안 줄었는지 본다.

---

## 5. 해외 ABL·JBL — 신규 38종

**129종 중 전용 13종.** 나머지 116종은 국내와 같은 이야기다.
지금 0인 주제: 경기 결과 · 기록 이정표 · 환경·일상 · 심리·서사.

🔴 **만들기 전에 계측이 먼저다.** 129종이 실제로 뜨는지 한 번도 안 재봤다.
A가 진출 경로를 열었으니 이제 잴 수 있다 — 다만 `measure-slotreach.cjs`의
`PATHS`에 `overseas` 항목이 **없다**. 그것부터 붙인다.

### 5-A. 리그 특성 — 12종

리그마다 다른 이야기라 `stage` 단수로 가른다. 전부 **랜덤**·`repeatable`이다 —
리그 풍경은 되풀이돼야 색이 산다.

**ABL 전용** `{ "type": "career_stage", "stage": "pro_abl" }`

| id | 추가 조건 | 선택지 → 보상 |
|---|---|---|
| `EVT_ABL_LONG_FLIGHT` | `num_lte leagueYears 2` | 잔다 → 피로-10 / 책을 본다 → 성실+4 |
| `EVT_ABL_SUMMER_SEASON` | `week_gte 10` | 적응한다 → 컨디션+8 / 힘들다 → 피로+10 성실+5 |
| `EVT_ABL_SMALL_CROWD` | `week_gte 14` | 집중한다 → XP command 2 / 허전하다 → 사기-4 |
| `EVT_ABL_DUAL_PLAYER2` | `week_gte 8` | 묻는다 → 동료 관계+8 / 놀란다 → 사기+5 |
| `EVT_ABL_OFF_LONG` | `week_gte 40` | 훈련한다 → XP 3 피로+10 / 쉰다 → 피로-15 사기+8 |
| `EVT_ABL_LOCAL_LEAGUE` | `popularity_gte 25` | 나간다 → 인기+8 돈+150 피로+10 / 사양한다 → 피로-5 |

**JBL 전용** `{ "type": "career_stage", "stage": "pro_jbl" }`

| id | 추가 조건 | 선택지 → 보상 |
|---|---|---|
| `EVT_JBL_MORNING_DRILL` | `num_lte leagueYears 2` | 따른다 → 성실+6 피로+10 / 버겁다 → 사기-4 |
| `EVT_JBL_TEAM_MEETING` | `week_gte 8` | 듣는다 → XP command 2 / 지루하다 → 피로+5 사기-3 |
| `EVT_JBL_FORM_STRICT` | `relation_gte coach 40` | 고친다 → XP movement 3 사기-3 / 내 폼을 → 코치 관계-5 사기+8 |
| `EVT_JBL_FAN_ORGANIZED` | `week_gte 12` | 인사한다 → 인기+8 / 집중한다 → XP 2 |
| `EVT_JBL_MEDIA_DENSE` | `fame_gte 30` | 응한다 → 인기+6 피로+6 / 피한다 → 명성-3 피로-3 |
| `EVT_JBL_SENIOR_SYSTEM` | `num_lte leagueYears 2` | 따른다 → 동료 관계+8 / 어색하다 → 사기-4 성실+4 |

### 5-B. 생활 — 10종  `{ "type": "career_stage", "stages": ["pro_abl", "pro_jbl"] }`

**첫해 정착**이 축이다. 다섯이 `num_lte leagueYears 1`로 묶인다.

| id | 추가 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_ABROAD_VISA` | `leagueYears ≤1` + `week_lte 6` | 조건부·career | 대행을 쓴다 → 돈-300 피로-6 / 직접 한다 → 피로+10 성실+5 |
| `EVT_ABROAD_HOUSE` | `leagueYears ≤1` + `money_gte 500` | 조건부·career | 좋은 집 → 돈-800 컨디션+8 / 구단 숙소 → 사기-3 |
| `EVT_ABROAD_DRIVE` | `leagueYears ≤1` | 조건부·career | 면허를 딴다 → 돈-200 피로+8 / 대중교통 → 피로+6 |
| `EVT_ABROAD_BANK` | `leagueYears ≤1` + `money_gte 1000` | 조건부·career | 계좌를 연다 → 성실+4 / 미룬다 → 사기-3 |
| `EVT_ABROAD_CONTRACT_LANG` | `leagueYears ≤1` + `week_gte 40` | 조건부·career | 변호사를 쓴다 → 돈-400 사기+10 / 그냥 사인 → 사기-6 |
| `EVT_ABROAD_HOSPITAL` | `eq injured true` | 조건부·season | 통역과 간다 → 컨디션+8 / 혼자 간다 → 사기-5 성실+5 |
| `EVT_ABROAD_TAX` | `money_gte 3000` | 조건부·season | 정리한다 → 돈-300 성실+5 / 미룬다 → 사기-4 |
| `EVT_ABROAD_KOREAN_FOOD` | `morale_lte 55` | **랜덤** | 찾아간다 → 돈-80 사기+12 / 참는다 → 성실+4 |
| `EVT_ABROAD_HOLIDAY` | `week_gte 20` | **랜덤** | 함께한다 → 동료 관계+8 / 혼자 있는다 → 사기-4 XP 2 |
| `EVT_ABROAD_INTERNET` | `week_gte 25` | **랜덤** | 통화한다 → 사기+10 피로+4 / 잔다 → 피로-8 |

### 5-C. 경기·기록 — 8종 (전부 조건부)

| id | 조건 | 정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_ABROAD_FIRST_START` | `num_gte stats.gs 1` | career | 각오한다 → 피로+12 XP 3 / 평소대로 → 사기+8 |
| `EVT_ABROAD_FIRST_WIN` | `num_gte stats.w 1` | career | (알림) 사기+15 명성+5 |
| `EVT_ABROAD_FIRST_HR` | `num_gte stats.g 3` | career | 영상을 본다 → XP movement 3 / 잊는다 → 사기+8 |
| `EVT_ABROAD_RIVAL_TEAM` | `week_gte 18` | season | 이긴다 → 피로+12 명성+5 / 평소대로 → XP 2 |
| `EVT_ABROAD_MEDIA_DEBUT` | `fame_gte 20` | career | 응한다 → 인기+8 / 짧게 → 피로-3 |
| `EVT_ABROAD_STAT_LEADER` | `season_era_lte 3.0` + `num_gte stats.ip 40` | season | (알림) 명성+8 사기+12 |
| `EVT_ABROAD_ALLSTAR` | `fame_gte 40` + `week_gte 24` | season | 나간다 → 인기+10 피로+10 / 쉰다 → 피로-12 |
| `EVT_ABROAD_POSTSEASON` | `num_gte standing.winPct 0.55` + `week_gte 38` | season | (알림) 사기+12 피로+10 |

### 5-D. 관계·복귀 — 8종

| id | 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_ABROAD_INTERPRETER` | `num_lte leagueYears 2` | 랜덤 | 의지한다 → 사기+8 / 직접 말한다 → 성실+6 사기-3 |
| `EVT_ABROAD_LOCAL_COACH` | `relation_lte coach 35` | 조건부·season | 다가간다 → 코치 관계+8 / 거리를 둔다 → XP 2 |
| `EVT_ABROAD_FOREIGN_MATE` | `week_gte 10` | 랜덤 | 어울린다 → 동료 관계+8 / 혼자 → XP 2 |
| `EVT_ABROAD_KOREAN_SENIOR` | `num_lte leagueYears 2` | 조건부·career | 조언을 듣는다 → 사기+10 XP 2 / 알아서 한다 → 성실+5 |
| `EVT_ABROAD_TEAM_TRUST` | `relation_gte teammate 55` | 조건부·season | (알림) 사기+12 동료 관계+6 |
| `EVT_ABROAD_RETURN_FAIL` | `morale_lte 40` + `num_gte leagueYears 2` | 조건부·career·🔴**urgent** | 돌아간다 → 사기-8 명성-4 / 버틴다 → 사기+10 피로+10 |
| `EVT_ABROAD_RETURN_WIN` | `fame_gte 60` | 조건부·career | 돌아간다 → 명성+8 사기+12 / 남는다 → 돈+500 |
| `EVT_ABROAD_STAY_LONG` | `num_gte leagueYears 5` | 조건부·career | (알림) 사기+10 성실+5 |

**소계 38종** — 조건부 22 · 랜덤 16

---

## 6. 독립 — 신규 26종

**60종 전부가 1년차든 4년차든 똑같이 뜬다.** 연차 갈래 0.
지금 `EVT_IND_AGE_PRESSURE`(나이 압박) 하나가 그 무게를 다 진다.

공통 조건: `{ "type": "career_stage", "stage": "independent" }`

### 🔴 상무가 독립과 같은 `leagueId`를 쓴다

```ts
const SANGMU_LEAGUE_ID = "LEAGUE_INDEPENDENT";
```

`leagueYears`는 `leagueId` 연속으로 세므로 **상무를 다녀오면 독립 연차가
이어져 버린다.** 그래서 독립은 `league_id`가 아니라 **`career_stage`로 가른다**
(`careerStage`는 `military`로 갈라진다). 위 공통 조건이 그 이유다.

⚠ 그래도 전역 직후 `leagueYears`가 부풀 여지가 있다. 만들기 전에
`measure:slotreach --path army`로 독립 도달을 한 번 확인한다.

### 6-A. 1년차 — 8종  `num_lte leagueYears 1`

| id | 추가 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_IND_Y1_STRANGE` | `week_lte 6` | 조건부·stage_year | 둘러본다 → 사기+6 / 훈련만 한다 → XP 2 성실+4 |
| `EVT_IND_Y1_FIRST_GAME` | `num_gte stats.g 1` | 조건부·career | 긴장한다 → 피로+8 XP 2 / 담담하다 → 사기+8 |
| `EVT_IND_Y1_FIRST_CUT` | `week_gte 8` | 조건부·career·**urgent** | 남 일이 아니다 → 성실+6 사기-5 / 내 것만 본다 → XP 3 |
| `EVT_IND_Y1_PAY_SHOCK` | `week_gte 10` | 조건부·career | 아낀다 → 성실+5 / 그래도 쓴다 → 돈-40 사기+8 |
| `EVT_IND_Y1_STILL_HOPE` | `week_gte 12` | 조건부·stage_year | 시간이 있다 → 사기+10 / 조급하다 → 성실+5 피로+6 |
| `EVT_IND_Y1_WHY_HERE` | `morale_lte 50` | 조건부·stage_year | 되짚는다 → 사기+10 / 그냥 던진다 → 성실+3 |
| `EVT_IND_Y1_NO_STAFF` | `week_gte 6` | 랜덤 | 알아서 한다 → 성실+6 XP 2 / 아쉽다 → 사기-4 |
| `EVT_IND_Y1_OWN_GEAR` | `money_gte 200` | 랜덤 | 산다 → 돈-100 XP 2 / 빌린다 → 동료 관계+5 |

### 6-B. 2년차 — 9종  `num_gte leagueYears 2` + `num_lte leagueYears 2`

| id | 추가 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_IND_Y2_UNDRAFTED2` | `week_gte 47` | 조건부·season·**urgent** | 한 해 더 → 사기+10 성실+6 / 무너진다 → 사기-10 |
| `EVT_IND_Y2_PEER_QUIT` | `week_gte 20` | 조건부·season | 배웅한다 → 동료 관계+8 사기-5 / 남 일이다 → 사기+3 |
| `EVT_IND_Y2_AGE_TALK` | `num_gte age 22` | 조건부·season | 신경 안 쓴다 → 사기+8 / 초조하다 → 성실+6 사기-4 |
| `EVT_IND_Y2_BETTER_NOW` | `season_era_lte 3.5` | 조건부·season | (알림) 사기+12 명성+3 |
| `EVT_IND_Y2_SAME_PLACE` | `morale_lte 50` | 조건부·season | 바꿔본다 → XP 3 피로+8 / 믿고 간다 → 사기+8 |
| `EVT_IND_Y2_SCOUT_AGAIN` | `num_gte scoutScore 35` | 조건부·season | 잘 보인다 → 피로+10 명성+5 / 평소대로 → 사기+8 |
| `EVT_IND_Y2_TEAM_FOLD` | `week_gte 30` | 조건부·career·**urgent** | 남는다 → 사기-5 성실+6 / 알아본다 → 사기+6 |
| `EVT_IND_Y2_ROOM_CHANGE` | `week_lte 8` | 랜덤 | 받아들인다 → 사기+5 / 불편하다 → 컨디션-3 성실+4 |
| `EVT_IND_Y2_JUNIOR_IN` | `week_gte 6` | 랜덤 | 챙긴다 → 동료 관계+8 / 신경 안 쓴다 → XP 2 |

### 6-C. 3년차~ — 9종  `num_gte leagueYears 3`

| id | 추가 조건 | 갈래·정책 | 선택지 → 보상 |
|---|---|---|---|
| `EVT_IND_Y3_LAST_FEEL` | `week_gte 35` | 조건부·season | 마지막처럼 → 피로+12 사기+12 / 담담하다 → 성실+5 |
| `EVT_IND_Y3_COACH_PATH` | `relation_gte coach 55` | 조건부·career | 듣는다 → 코치 관계+8 사기+8 / 아직이다 → 사기+10 |
| `EVT_IND_Y3_CORP_TEAM` | `fame_gte 20` | 조건부·career | 간다 → 돈+300 사기+10 / 야구를 이어간다 → 사기+8 |
| `EVT_IND_Y3_AMATEUR` | `morale_lte 40` | 조건부·career | 생각해본다 → 사기-5 성실+5 / 아직이다 → 사기+10 |
| `EVT_IND_Y3_BODY_LIMIT` | `injury_count_gte 2` | 조건부·season | 관리한다 → 컨디션+10 XP recovery 2 / 밀어붙인다 → 피로+15 사기+8 |
| `EVT_IND_Y3_ONE_MORE` | `week_gte 45` | 조건부·season | 한 해 더 → 사기+10 성실+5 / 여기까지 → 사기-6 |
| `EVT_IND_Y3_LET_GO` | `morale_lte 30` | 조건부·career·🔴**urgent** | 놓아준다 → 사기-10 / 붙잡는다 → 사기+15 피로+10 |
| `EVT_IND_Y3_OLDEST` | `week_gte 10` | 랜덤 | 받아들인다 → 동료 관계+8 / 아니라고 한다 → 사기+6 |
| `EVT_IND_Y3_TEACH_YOUNG` | `relation_gte teammate 50` | 랜덤 | 가르친다 → 동료 관계+10 XP 1 / 내 훈련을 → XP 3 |

**소계 26종** — 조건부 21 · 랜덤 5

---

## 7. 파일을 어디에 두나

### 조건부 118종

```
resource/data/master/events/conditional/EVT_XXX.json     하나에 하나
```

`priority`는 기존 분포(45~950 · 중앙 700)를 따른다. 정렬에만 쓰이므로
**같은 무대 안에서만 의미가 있다.** 이번 신규는 이렇게 잡는다:

```
900~950   urgent 계열 (방출·강등·은퇴 결심·그만둘까)
700~800   이정표 (첫 승·타이틀·국가대표)
500~650   서사·갈림길
300~450   그 밖
```

### 랜덤 66종 — 풀에 넣는다

```
현재 풀 재고
  POOL_TEAM_LIFE_DAILY   58종   총가중치 1,147
  POOL_MEDIA_DAILY       47종             846
  POOL_TRAIN_DAILY       26종             513
  POOL_BODY_DAILY        20종             385
  POOL_SOCIAL_DAILY      11종             202
```

배분: `TEAM_LIFE` 41 · `MEDIA` 12 · `SOCIAL` 8 · `BODY` 3 · `TRAIN` 2

**⚠ 다른 무대를 묽게 하지 않는다.** 풀 뽑기가 조건을 **먼저** 거른다:

```ts
const eligible = poolRules.filter(r =>
  evaluateConditions(r.conditions ?? [], ctx) && …);
const picked = weightedPick(eligible, nextRand());
```

무대 조건이 붙은 규칙은 그 무대에서만 후보다. `TEAM_LIFE`가 58 → 99종이 돼도
**고교에서 뽑히는 후보 수는 그대로다.** 2군에 있을 때만 2군 것이 섞인다.

`weight`는 기존 중앙값 언저리(**20**)로 시작한다. 뽑히는 정도는
`measure:eventslots`로 재고 나서 조정한다 —
🔴 **한 번 돌려서 전후를 비교하지 않는다.** 랜덤 갈래는 실행 간 편차가
효과보다 크다(예전에 5→2를 "먹었다"고 적었는데 다음 실행이 2→9였다).

---

## 8. 작업 순서

### ① 준비 — 만들기 전에

```
0-1  A 미병합 2건을 받아온다        코드만이라 충돌 없음 (확인함)
0-2  measure-slotreach.cjs에 overseas 경로를 붙인다
0-3  measure:slotreach --path overseas   해외 129종이 실제로 뜨는지
0-4  measure:slotreach --path army       전역 뒤 독립 leagueYears 확인
```

🔴 **0-3을 건너뛰지 않는다.** 129종이 안 뜨고 있다면 38종을 더하는 건
안 뜨는 데 더 얹는 것이다.

### ② 2군 62종 — 먼저 한다

결손이 가장 크고, 시스템이 이미 다 돌아서 만든 이야기가 바로 자리를 잡는다.
`leagueIds` 배열 덕에 **세 리그 2군에 동시에 떠서 186종어치를 채운다.**

```
2-1  경기 결과 14   →  check:events
2-2  심리·서사 12   →  check:events
2-3  기록·미디어 10
2-4  돈·생활·관계 14
2-5  연차 갈래 12
2-6  measure:slotreach          2군 도달 수를 잰다
```

⚠ 2군 계측은 **하네스에 강등 경로가 없어서** 아직 못 잰다. 지금은
`candidateByRule`로 후보에 오르는지만 본다 — "뽑기에서 안 뽑힌 것"과
"조건이 한 번도 안 통과한 것"이 거기서 갈린다.

### ③ 독립 26종

연차 축이 통째로 없어서 **한 덩어리로 넣어야 색이 난다.** 계측 경로가
이미 있다(`--path indie`).

### ④ KBL 1군 58종

```
4-1  초기 20   (첫 경험 8이 핵심)
4-2  중기 14
4-3  말기 16   (은퇴 서사 6이 핵심)
4-4  기존 8종에 밴드를 씌운다 → measure:slotreach --path draft 로 회귀 확인
```

### ⑤ 해외 38종 — 0-3 결과를 보고 정한다

129종이 잘 뜨면 그대로 38종. 안 뜨면 **먼저 그걸 고친다.**

### ⑥ 마무리

```
npm run check:events        6개 게이트
npm test                    eventTemplateWiring 고아 검사 포함
npm run measure:eventslots
npm run measure:eventrules
npm run measure:mailbox     ⚠ 상한 500 · 184종이 늘면 포화를 다시 본다
```

---

## 9. 검증 — 무엇이 걸리나

| 게이트 | 잡는 것 | 이번에 걸릴 만한 것 |
|---|---|---|
| `check:eventconditions` | 조건 타입·경로 오타 | `stats.*` 경로명 |
| `check:effectkeys` | effect 키 오타 | `relationDelta` 모양 |
| `check:effecthints` | 힌트 ≠ 동작 | **가장 많이 걸린다.** 표의 "→ 보상"을 그대로 힌트에 옮길 것 |
| `check:playertype` | 투수/타자 상한 | 타자 갈래를 넣으면 |
| `check:eventranges` | 눈금 밖 값 | XP **상한 5** · 돈 띠 |
| `check:eventslots-health` | 슬롯 건강 | 조건부 증가분 |
| `eventTemplateWiring` (test) | 고아 규칙 | **셋을 같이 안 쓰면** |

### 타자 갈래

주인공은 지금 투수뿐이지만 `check:playertype`이 상한을 지킨다.
나중에 되돌아오는 것보다 지금 넣는 게 싸다. 대응은 이렇게 잡혀 있다:

```
mentality → batting.discipline      clutch  → batting.battingClutch
stamina   → batting.speed           recovery → batting.fielding
command · control · velocity · movement → 타자 갈래를 따로 쓴다
```

---

## 10. 합계

| # | 무대 | 조건부 | 랜덤 | 합 | 왜 |
|---|---|---:|---:|---:|---|
| 1 | **KBL 2군** | 37 | 25 | **62** | 주제 넷이 0 · 1군의 21% · 세 리그에 동시에 뜬다 |
| 2 | **KBL 1군** | 54 | 4 | **58** | 연차 갈래 18% · **은퇴 서사가 통째로 없다** |
| 3 | **해외** | 22 | 16 | **38** | 전용 13종 · 여섯 중 다섯이 국내와 같은 이야기 |
| 4 | **독립** | 21 | 5 | **26** | 연차 갈래 0 |
| | **합계** | **134** | **50** | **184** | 589 → **773종** |

```
조건부  322 → 456   (+42%)
  그중 once_* 가 105건이라 한 번 뜨면 후보에서 빠진다
  상시 경쟁자(repeatable)는 29건만 는다
urgent  13건 추가 — 상한 밖으로 나가되, 전부 "지금 벌어진 일"이다
랜덤    162 → 212   무대 조건이 붙어 다른 무대를 안 묽게 한다
```

---

## 11. 🔴 사용자 확정이 필요한 것

**밸런스는 동결이다.** 아래는 내가 정할 수 없다.

1. **보상 수치 전부** — 위 표의 값은 기존 재고 띠(§0) 안에 넣은 것이지
   근거가 있는 값이 아니다. 특히:
   - `EVT_PRO_ARBITRATION` 돈 **+800** · `EVT_PRO_MARRIAGE` **-1000** —
     `moneyDelta` 재고가 **20건뿐이라** 기준이 얇다
   - 2군 돈 띠 **50~300만원** — 1군과 학생 사이로 잡은 추정이다
2. **`urgent` 13건이 적당한가** — 지금 재고에 몇 건인지부터 재야 한다
3. **은퇴 6종을 이벤트로 둘 것인가** — `retirement` 시스템이 따로 있다.
   서사만 이벤트로 얹는 건지, 실제 은퇴 판정과 이어야 하는지는 A 트랙 경계다
4. **국가대표 2종** — 시스템(344줄)을 안 읽고 조건으로 흉내낸다.
   진짜 배선은 A 트랙이다
5. **기존 8종에 밴드 씌우기** — 씌우면 그 규칙이 다른 시기에서 **사라진다**

각 항목은 **건마다 묻는다** — 두 변수를 동시에 움직이면 원인을 못 가린다.
