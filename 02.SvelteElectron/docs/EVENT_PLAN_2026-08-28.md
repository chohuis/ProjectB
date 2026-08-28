# 이벤트 보강 계획 — 2026-08-28

> 무대별 밀도 실측에서 나온 결손 넷. **이벤트 데이터만** 다룬다 —
> 엔진·시스템 쪽(상무 경기·야수 교체·스카우팅)은 A 트랙이라 뺐다.
>
> 근거 [EVENT_REPORT_2026-08-25.md](EVENT_REPORT_2026-08-25.md) ·
> 전수 [EVENT_CONTENT_CHECKLIST.txt](EVENT_CONTENT_CHECKLIST.txt) ·
> 절차 [EVENT_SLOT_LOOP.md](EVENT_SLOT_LOOP.md)

---

## 0. 시작 전에 — 쓸 축을 확정한다

**연차 축이 없던 두 무대(2군·독립)에 `leagueYears`를 쓴다.**

```ts
function leagueYearsOf(ctx) {           // eventPaths.ts:142
  const now = ctx.protagonist.leagueId;
  let n = 1;                            // 이번 시즌
  for (recs 뒤에서부터) if (같은 리그) n++; else break;
  return n;
}
```

리그를 안 가린다 — `LEAGUE_INDEPENDENT`·`LEAGUE_KBL_FARM`에도 그대로 돈다.
**진입 첫 시즌이 1이다.**

⚠ **`proServiceYears`와 다르다.** 그건 시즌 종료에 +1 되고 프로만 센다.
2군에서 3년, 1군에서 2년이면 `proServiceYears` 5 · `leagueYears` 2다.

| 무대 | 시간 축 | 밴드 |
|---|---|---|
| 2군 | `leagueYears` | 1년차 · 2~3년차 · 4년차~ |
| 독립 | `leagueYears` | 1년차 · 2년차 · 3년차~ |
| KBL 1군 | `proServiceYears` | 초기 ≤2 · 중기 3~7 · 말기 ≥8 (기존) |
| 해외 | `leagueYears` | 첫해 ≤1 · 적응 2 · 정착 ≥3 (기존) |

---

## 1. KBL 2군 — 신규 62종

**가장 크게 비었다.** 40종은 1군 189종의 21%인데 시스템은 1군과 똑같이 다 돈다.

### 지금 0인 주제 넷

| 주제 | 1군 | 2군 |
|---|---:|---:|
| 경기 결과 | 12 | **0** |
| 심리·서사 | 11 | **0** |
| 진로·전환 | 3 | **0** |
| 미디어·팬 | 27 | **1** |

⚠ **`league_id`는 이미 `leagueIds` 배열이라 세 리그 2군에 한 번에 뜬다.**
새로 만드는 것도 같은 모양으로 쓴다.

### 1-A. 경기 결과 — 14종

전부 `leagueIds: [KBL_FARM, ABL_FARM, JBL_FARM]` + 아래 조건.

| 슬러그 | 조건 | 선택지 |
|---|---|---|
| `FARM_FIRST_WIN` | `stats.w ≥ 1` · once_per_career | 기뻐한다 / 아직 멀었다고 본다 |
| `FARM_COMPLETE_GAME` | `stats.ip ≥ 30` · once_per_season | 이 감각을 유지 / 다음을 아낀다 |
| `FARM_SHUTOUT` | `season_era_lte 1.5` · `stats.ip ≥ 20` | 알림 + 명성 |
| `FARM_BLOWN` | `condition_lte 60` · `morale_lte 50` | 영상을 본다 / 잊는다 / 코치에게 묻는다 |
| `FARM_WIN_STREAK` | `standing.wins ≥ 8` | 팀에 맞춘다 / 내 것에 집중 |
| `FARM_LOSE_STREAK` | `standing.losses ≥ 8` | 앞장선다 / 조용히 있는다 |
| `FARM_FIRST_SAVE` | `stats.sv ≥ 1` · once_per_career | — |
| `FARM_LONG_RELIEF` | `stats.ip ≥ 40` · `stats.gs ≤ 3` | 불펜을 받아들인다 / 선발을 요청한다 |
| `FARM_ERA_CLIMB` | `season_era_lte 3.0` · `stats.ip ≥ 25` | — |
| `FARM_HIT_HARD` | `morale_lte 45` · `week_gte 20` | 폼을 본다 / 체력을 본다 / 쉰다 |
| `FARM_K_RUN` | `season_k_gte 40` | — |
| `FARM_NO_DECISION` | `stats.g ≥ 10` · `stats.w ≤ 1` | 운이라 넘긴다 / 내 탓으로 본다 |
| `FARM_CLOSER_TRY` | `relation_gte coach 45` | 맡는다 / 사양한다 |
| `FARM_DOUBLEHEADER` | `fatigue_gte 60` | 둘 다 던진다 / 한 경기만 |

### 1-B. 심리·서사 — 12종

2군은 **"언제 올라가나"가 축**이다. 지금 그걸 다루는 게 콜업 계열 5종뿐이다.

```
FARM_YEAR_ONE_HOPE      leagueYears ≤ 1        아직 시간이 있다
FARM_YEAR_TWO_DOUBT     leagueYears 2~3        같은 자리에 두 해째
FARM_YEAR_FOUR_WALL     leagueYears ≥ 4        여기가 천장인가
FARM_YOUNGER_PASSED     week_gte 20            나보다 어린 선수가 먼저 올라갔다
FARM_SAME_ROSTER        leagueYears ≥ 2        작년과 같은 명단
FARM_WATCH_FIRST_TEAM   상시                   1군 중계를 본다 (기존 LIFE_ONE_GAME_FARM 확장)
FARM_WHY_HERE           morale_lte 40          내가 왜 여기 있나
FARM_COACH_HONEST       relation_gte coach 60  코치가 솔직하게 말해준다
FARM_ONE_MORE_YEAR      week_gte 40            한 해 더 할 것인가
FARM_QUIT_THOUGHT       morale_lte 35 · leagueYears ≥ 3   그만둘까
FARM_SOMEONE_QUIT       week_gte 25            동료가 그만뒀다
FARM_STILL_HERE         week_gte 45            그래도 남아 있다
```

⚠ `FARM_QUIT_THOUGHT`는 `urgent`. 나머지는 `important`/`ambient`.

### 1-C. 기록·미디어 — 10종

```
FARM_LEAGUE_LEADER      season_era_lte 2.5 · stats.ip ≥ 30    2군 타이틀 경쟁
FARM_ALLSTAR            fame_gte 15 · week_gte 22             2군 올스타
FARM_PERSONAL_BEST      stats.k ≥ 50                          개인 최다
FARM_LOCAL_PAPER        popularity_gte 12                     지역지 한 줄
FARM_FAN_FEW            week_gte 15                           적은 관중 속 알아보는 사람
FARM_SCOUT_OTHER        week_gte 20                           타팀 스카우트 (기존 확장)
FARM_STAT_SHEET         stats.g ≥ 15                          기록지를 들여다본다
FARM_HIGHLIGHT_CLIP     popularity_gte 20                     짧은 영상이 돈다
FARM_INTERVIEW_SMALL    fame_gte 10                           구단 홈페이지 인터뷰
FARM_YOUTH_LOOK         leagueYears ≥ 2                       유소년이 보러 왔다
```

### 1-D. 돈·생활·관계 — 14종

돈 2종·감독코치 5종뿐이다. **2군 급여는 1군의 몇 분의 일**이라는 게 서사가 된다.

```
돈 (5)     FARM_THIN_SALARY      money_lte 300      빠듯한 2군 급여
           FARM_GEAR_OWN         money_gte 200      장비를 자비로
           FARM_ROOM_COST        상시               합숙소 vs 자취
           FARM_SEND_HOME        money_gte 500      집에 보낸다
           FARM_SIDE_WORK        money_lte 100      비시즌 아르바이트
관계 (5)   FARM_MANAGER_TALK     relation_lte manager 30   2군 감독 면담
           FARM_COACH_DRILL      relation_gte coach 50     코치가 붙는다
           FARM_ROOMMATE_UP      week_gte 18               룸메이트가 콜업됐다
           FARM_VETERAN_DOWN     week_gte 12               1군 베테랑이 내려왔다
           FARM_REHAB_TALK       상시                      재활 선수와 (기존 확장)
가족 (4)   FARM_FAMILY_VISIT     week_gte 20        가족이 2군 경기에 왔다
           FARM_FAMILY_ASK_AGAIN leagueYears ≥ 3    또 물어온다 (기존 확장)
           FARM_PARENT_PROUD     stats.w ≥ 3        그래도 자랑스러워한다
           FARM_SIBLING_JOB      leagueYears ≥ 3    또래는 자리를 잡았다
```

### 1-E. 연차 갈래 — 12종

위 목록에 `leagueYears`를 붙인 것 외에, 밴드 전용으로:

```
1년차     첫 2군 캠프 · 첫 원정 · 명단 확인 · 여기 규칙
2~3년차   두 번째 캠프 · 익숙해진 것 · 후배가 들어왔다 · 아직인가
4년차~    최고참 · 가르치는 쪽 · 계약 마지막 해 · 다음을 정한다
```

**소계 62종** (경기 14 · 심리 12 · 기록미디어 10 · 돈생활관계 14 · 연차 12)

---

## 2. KBL 1군 — 신규 58종

**189종 중 연차 갈래 34종(18%).** 그리고 연차 무관 155종을 훑으니
**시기 색이 아예 옅다** — 초기 냄새 2종·말기 냄새 1종뿐이다.
**기존 것에 밴드를 씌우는 게 아니라 새로 써야 한다.**

### 2-A. 초기 1~3년차 — 20종 (지금 20종 → 40종)

```
첫 경험 (8)
  PRO_FIRST_CALLUP     첫 1군 콜업          once_per_career
  PRO_FIRST_START      첫 선발              stats.gs ≥ 1
  PRO_FIRST_WIN        첫 승                stats.w ≥ 1
  PRO_FIRST_LOSS       첫 패                stats.l ≥ 1
  PRO_FIRST_SAVE       첫 세이브            stats.sv ≥ 1
  PRO_FIRST_HR_GIVEN   첫 피홈런            stats.g ≥ 3
  PRO_FIRST_CAMP       첫 스프링캠프        week_lte 4
  PRO_FIRST_ROAD       첫 장기 원정         week_gte 10

자리 (6)
  PRO_UP_DOWN          1군·2군을 오간다     leagueYears ≤ 2
  PRO_BENCH_LONG       기회가 안 온다       stats.g ≤ 5 · week_gte 20
  PRO_LOCKER_SPOT      라커 자리            week_lte 8
  PRO_BUS_SEAT         이동 좌석            week_gte 10
  PRO_SENIOR_PRESSURE  선배의 텃세          relation_lte teammate 30
  PRO_ROLE_UNCLEAR     보직이 안 정해진다   week_gte 14

바깥 (6)
  PRO_FIRST_FAN        나를 알아보는 사람   popularity_gte 20
  PRO_JERSEY_SOLD      유니폼이 팔렸다      popularity_gte 30
  PRO_FIRST_CARD       선수 카드            fame_gte 20
  PRO_HOMETOWN_NEWS    고향 소식            week_gte 20
  PRO_SCHOOL_VISIT     모교 방문            week_gte 30
  PRO_AGENT_FIRST      첫 에이전트          fame_gte 25
```

### 2-B. 중기 4~8년차 — 14종 (지금 26종 → 40종)

```
자리       PRO_BACKUP_FALL     주전에서 밀린다      stats.g ≤ 10 · week_gte 24
           PRO_ROLE_SWITCH     보직 전환 요청       relation_gte manager 50
           PRO_INJURY_RETURN   부상 뒤 복귀         injury_count_gte 1 · injured=false
           PRO_SLUMP_LONG      긴 슬럼프            morale_lte 40 · week_gte 20
계약       PRO_ARBITRATION     연봉 조정 신청       week_gte 42
           PRO_MULTIYEAR       다년 계약 제안       fame_gte 40 · week_gte 43
           PRO_SALARY_GAP2     동기와 연봉 차       money_lte 5000
가족       PRO_MARRIAGE        결혼                 once_per_career · age ≥ 26
           PRO_CHILD           아이가 태어난다      once_per_career · age ≥ 27
           PRO_FAMILY_MOVE     가족이 이사한다      money_gte 8000
대표       PRO_NATIONAL_CALL   국가대표 발탁        fame_gte 50 · week_gte 22
           PRO_NATIONAL_CUT    대표 탈락            fame_gte 35
바깥       PRO_CHARITY_LEAD    기부를 시작한다      money_gte 10000
           PRO_YOUTH_CLINIC    유소년 클리닉        popularity_gte 45
```

⚠ **국가대표는 시스템이 있는데 이벤트가 0종**이다(`national_team.rs` 344줄).

### 2-C. 말기 9년차~ — 16종 (지금 22종 → 38종)

**은퇴 서사가 통째로 없다** — 진로·전환 주제가 KBL 1군에 3종뿐이다.

```
내리막 (6)
  PRO_RELEASE_NOTICE   방출 통보            urgent · morale_lte 45 · week_gte 42
  PRO_NOT_CALLED       시장에서 안 불린다   week_gte 45
  PRO_DEMOTE_LATE      말년의 2군 강등      urgent
  PRO_YOUNGER_TAKES    후배에게 자리를 넘긴다
  PRO_LAST_CONTRACT    마지막 계약          week_gte 43
  PRO_MINIMUM_DEAL     최저 연봉 제안       money_lte 3000

은퇴 (6)
  PRO_RETIRE_THINK     은퇴를 생각한다      age ≥ 34
  PRO_RETIRE_ASKED     구단이 묻는다        age ≥ 35 · week_gte 40
  PRO_RETIRE_DECIDE    결심                 once_per_career
  PRO_RETIRE_ANNOUNCE  발표                 once_per_career
  PRO_RETIRE_GAME      은퇴 경기            once_per_career
  PRO_RETIRE_NUMBER    등번호 영구결번      fame_gte 120

다음 (4)
  PRO_COACH_OFFER      지도자 제안          relation_gte manager 60
  PRO_FRONT_OFFER      프런트 제안          relation_gte owner 55
  PRO_BROADCAST_OFFER  해설 제안            popularity_gte 60
  PRO_ABROAD_LATE      해외 마지막 도전     age ≥ 33
```

**소계 58종** (초기 20 · 중기 14 · 말기 16 + 밴드 조정 8)

---

## 3. 해외 ABL·JBL — 신규 38종

**129종 중 전용 13종.** 나머지 116종은 국내와 같은 이야기다.

지금 0인 주제: 경기 결과 · 기록 이정표 · 환경·일상 · 심리·서사.

### 3-A. 리그 특성 — 12종

```
ABL (6)   ABL_LONG_FLIGHT     호주 대륙 이동        leagueYears ≤ 2
          ABL_SUMMER_SEASON   여름에 시즌이 돈다    week_gte 10
          ABL_SMALL_CROWD     적은 관중             week_gte 14
          ABL_DUAL_PLAYER2    낮에 일하는 동료      (기존 ABL_DUAL 확장)
          ABL_OFF_LONG        긴 비시즌             week_gte 40
          ABL_LOCAL_LEAGUE    지역 리그 초청        popularity_gte 25

JBL (6)   JBL_MORNING_DRILL   아침 훈련             leagueYears ≤ 2
          JBL_TEAM_MEETING    긴 미팅               week_gte 8
          JBL_FORM_STRICT     폼을 고치라 한다      relation_gte coach 40
          JBL_FAN_ORGANIZED   응원단                week_gte 12
          JBL_MEDIA_DENSE     빽빽한 취재           fame_gte 30
          JBL_SENIOR_SYSTEM   위아래 (기존 확장)    leagueYears ≤ 2
```

### 3-B. 생활 — 10종

```
ABROAD_VISA         비자·서류        leagueYears ≤ 1 · week_lte 6
ABROAD_HOUSE        집 구하기        leagueYears ≤ 1 · money_gte 500
ABROAD_DRIVE        운전            leagueYears ≤ 1
ABROAD_BANK         계좌·송금        leagueYears ≤ 1 · money_gte 1000
ABROAD_HOSPITAL     병원            injured=true
ABROAD_HOLIDAY      현지 명절        week_gte 20
ABROAD_KOREAN_FOOD  한국 음식점      morale_lte 55
ABROAD_INTERNET     시차 통화        week_gte 25
ABROAD_TAX          해외 세금        money_gte 3000
ABROAD_CONTRACT_LANG 계약서를 못 읽는다  leagueYears ≤ 1 · week_gte 40
```

### 3-C. 경기·기록 — 8종

```
ABROAD_FIRST_START   현지 첫 선발      once_per_career · stats.gs ≥ 1
ABROAD_FIRST_WIN     현지 첫 승        once_per_career · stats.w ≥ 1
ABROAD_FIRST_HR      현지 첫 피홈런    stats.g ≥ 3
ABROAD_RIVAL_TEAM    라이벌 구단       week_gte 18
ABROAD_MEDIA_DEBUT   현지 언론 데뷔    fame_gte 20
ABROAD_STAT_LEADER   리그 상위         season_era_lte 3.0 · stats.ip ≥ 40
ABROAD_ALLSTAR       현지 올스타       fame_gte 40 · week_gte 24
ABROAD_POSTSEASON    현지 포스트시즌   standing.winPct ≥ 0.55 · week_gte 38
```

### 3-D. 관계·복귀 — 8종

```
관계 (5)   ABROAD_INTERPRETER   통역과              leagueYears ≤ 2
           ABROAD_LOCAL_COACH   현지 코치           relation_lte coach 35
           ABROAD_FOREIGN_MATE  다른 외국인 선수     week_gte 10
           ABROAD_KOREAN_SENIOR 먼저 온 한국 선수    leagueYears ≤ 2
           ABROAD_TEAM_TRUST    동료가 받아들인다    relation_gte teammate 55
복귀 (3)   ABROAD_RETURN_FAIL   실패하고 돌아간다    morale_lte 40 · leagueYears ≥ 2
           ABROAD_RETURN_WIN    성과를 안고 돌아간다  fame_gte 60
           ABROAD_STAY_LONG     눌러앉는다           leagueYears ≥ 5
```

**소계 38종**

⚠ **해외는 재고만 있고 한 번도 계측을 못 했다.** 만들기 전에
`measure:slotreach --path overseas`를 한 번 돌려 지금 129종이 실제로
뜨는지부터 봐야 한다 — A가 진출 경로를 열었으니 이제 잴 수 있다.

---

## 4. 독립 — 신규 26종

**60종 전부가 1년차든 4년차든 똑같이 뜬다.** 연차 갈래 0.

지금 `EVT_IND_AGE_PRESSURE`("나이") 하나가 그 무게를 다 진다.

### 4-A. 1년차 — 8종  `num_lte leagueYears 1`

```
IND_Y1_STRANGE       낯선 리그          week_lte 6
IND_Y1_FIRST_CUT     첫 방출을 본다     week_gte 8
IND_Y1_STILL_HOPE    아직 시간이 있다   week_gte 12
IND_Y1_PAY_SHOCK     급여를 처음 받는다 week_gte 10
IND_Y1_NO_STAFF      코치가 한 명       (기존 확장)
IND_Y1_OWN_GEAR      장비를 직접        money_gte 200
IND_Y1_FIRST_GAME    첫 등판            stats.g ≥ 1
IND_Y1_WHY_HERE      내가 왜 여기       morale_lte 50
```

### 4-B. 2년차 — 9종  `leagueYears 2`

```
IND_Y2_UNDRAFTED2    또 미지명           week_gte 47
IND_Y2_PEER_QUIT     동기가 그만둔다     week_gte 20
IND_Y2_AGE_TALK      나이 이야기를 듣는다 age ≥ 22
IND_Y2_BETTER_NOW    작년보다 낫다       season_era_lte 3.5
IND_Y2_SAME_PLACE    같은 자리에 두 해째  morale_lte 50
IND_Y2_SCOUT_AGAIN   스카우트가 또 왔다   num_gte scoutScore 35
IND_Y2_TEAM_FOLD     구단이 흔들린다     week_gte 30
IND_Y2_ROOM_CHANGE   합숙소가 바뀐다     week_lte 8
IND_Y2_JUNIOR_IN     후배가 들어왔다     week_gte 6
```

### 4-C. 3년차~ — 9종  `num_gte leagueYears 3`

```
IND_Y3_LAST_FEEL     마지막이라는 감각    week_gte 35
IND_Y3_COACH_PATH    지도자 이야기        relation_gte coach 55
IND_Y3_CORP_TEAM     실업팀 제안          fame_gte 20
IND_Y3_AMATEUR       사회인 야구          morale_lte 40
IND_Y3_OLDEST        최고참이 됐다        week_gte 10
IND_Y3_TEACH_YOUNG   가르치는 쪽          relation_gte teammate 50
IND_Y3_BODY_LIMIT    몸이 먼저 말한다     injury_count_gte 2
IND_Y3_ONE_MORE      한 해만 더           week_gte 45
IND_Y3_LET_GO        놓아준다             morale_lte 30 · urgent
```

**소계 26종**

---

## 5. 합계와 순서

| # | 무대 | 신규 | 왜 |
|---|---|---:|---|
| 1 | **KBL 2군** | 62 | 시스템은 1군과 같은데 콘텐츠가 21%. **강등이 실제로 일어나는 무대** |
| 2 | **KBL 1군** | 58 | 연차 갈래 18% · **은퇴 서사가 통째로 없다** |
| 3 | **해외** | 38 | 전용 13종. 여섯 중 다섯이 국내와 같은 이야기 |
| 4 | **독립** | 26 | 연차 갈래 0 |
| | **합계** | **184** | 589 → 773종 |

### 순서를 정한 이유

**2군을 먼저** — 결손이 가장 크고(주제 넷이 0), 시스템이 이미 다 돌아서
만든 이야기가 바로 자리를 잡는다. `leagueIds` 배열 덕에 **세 리그 2군에
한 번에 뜬다** — 62종이 실제로는 186종어치 자리를 채운다.

**해외는 계측 먼저** — 129종이 실제로 뜨는지 모르는 채로 38종을 더하면
안 뜨는 데 더 얹는 꼴이다. A가 진출 경로를 열었으니
`measure:slotreach --path overseas`를 먼저 돌린다.

### ⚠ 주당 칸을 얼마나 더 먹나

184종 중 조건부가 대부분이라 **주당 1칸 상한**을 다툰다.
지금 조건부가 322종인데 506종이 된다 — **57% 증가**다.

만들기 전에 정해야 한다:

- 조건부 상한을 올릴 것인가 (지금 주당 1건)
- 아니면 `tier`로 갈라 `urgent`를 상한 밖으로 더 낼 것인가
- 아니면 일부를 랜덤 풀로 보낼 것인가

**밸런스 결정이라 사용자 확정이 필요하다.**

---

## 6. 만들 때 지킬 것

절차는 [EVENT_SLOT_LOOP.md](EVENT_SLOT_LOOP.md)와 같다. 이번에 특히:

1. **타자 갈래를 쓸 때 넣는다** — 주인공은 지금 투수뿐이지만
   `check:playertype`이 상한을 지키고, 나중에 되돌아오는 것보다 싸다.
   `mentality → batting.discipline` · `clutch → batting.battingClutch` ·
   `stamina → batting.speed` · `recovery → batting.fielding`
2. **`tier`를 명시한다** — 지금 589종 중 64종만 적혀 있다. 새로 만드는
   184종은 전부 적는다
3. **눈금을 확인하고 값을 쓴다** — `check:eventranges`가 잡지만,
   `developmentRate`(0~100·기본 62)처럼 짐작하면 틀리는 축이 있다
4. **돈은 만원 단위** — 2군은 1군과 프로 사이다. **50~300 띠**로 잡는다
   (고교 15~40 · 프로 150~1000)
5. **게이트를 다 돌리고 커밋한다** — `npm run check:events`
