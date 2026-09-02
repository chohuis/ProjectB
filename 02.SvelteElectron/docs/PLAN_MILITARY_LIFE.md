# 현역 복무 — "실제 군 생활처럼" 기획안 (2026-09-02 · 구현 전)

> 사용자 지시: *"현역은 야구 경기도 없고 완전 다른 이벤트라 실제 군대 생활처럼
> 진행하고 싶다. 구현은 하지 말고 기획안부터 계획해서 일정에 넣어 보자."*
>
> §1 은 **지금 코드가 실제로 하는 것**(실측), §2~6 이 제안이다. 숫자·종수는
> 전부 코드·데이터에서 셌다. ❓ 는 사용자 결정.

---

## 1. 지금 — 현역 복무는 "감쇠 + 주 40% 이벤트 한 건"이다

```
기간        100주 (SERVICE_WEEKS) · 52주 시즌 둘로 나눠 흐른다 · 시즌 롤오버가 이어 연다
계급 띠     ≤8주 훈련소(0) · ≤34 이병/일병(1) · ≤60 상병(2) · 그 뒤 병장(3)   ← 이벤트 필터 축
주간 루프   Rust calc_military_week (week_engine.rs)
            일반병:  커맨드 −1 확률 75/45/25/15%  제구 −1 65/40/20/0%  회복 −1 20/30/20/0%
                     사기 −2/−1/(50% −1)/(50% +1)   피로 +4/+2/+1/+1        (띠 0/1/2/3 순)
            상무:    스태미나 +1 · 회복·커맨드·구속이 확률로 +1 · 사기 −1~+2
이벤트      주 40% 로 한 건 — 공통 풀 30% · 나머지 일반/상무 풀 (복원추출 · 쿨다운 없음)
            현역 몫  공통 14 + 일반 20 = 34종 (상무 20종은 별도)
            효과     선택지마다 moraleDelta · fatigueDelta · statDelta
            가드     minRank · maxRank · once (커리어 통 careerTriggeredEvents)
소식        이벤트마다 한 통 (사용자 확정 09-01)
전역        원 소속/독립 복귀 · militaryRecoveryWeeks 6주(일반) · 리그는 계속 돈다 (09-02 고침)
화면        MilitaryStatusPanel · RightPanel 남은 주 — 그게 전부 (LEAGUE_MILITARY 화면 0회)
```

**없는 것** — 일과 · 보직(특기) · 휴가 제도 · 부대 사람(선임·후임·간부) · 특별 기간
(혹한기·유격·검열·GOP) · 야구 감각의 개념 · 전역 후 적응 곡선 · 군 생활 요약.
즉 지금 현역은 **"2년 동안 능력이 조금 깎이고 가끔 사건이 뜨는 대기 시간"**이다.

---

## 2. 목표 — 무엇이 "실제 군 생활처럼"인가

```
① 시간이 흐르는 게 보인다     훈련소 → 자대 → 이병·일병·상병·병장 → 전역 30일 → 전역
② 매주 내가 무언가를 고른다   일과 강도 · 남는 시간에 뭘 하나 (야구 감각 vs 사람 vs 쉬기)
③ 사람이 있다                 사용자가 세팅한 부대원들과의 관계가 사건을 만든다
④ 결과가 전역 뒤로 이어진다   야구 감각 → 복귀 곡선 · 관계 → 재회 이벤트 · 군 경력 한 장
```

야구 경기가 없으니 **경기 대신 "주간 선택 + 사건"** 이 축이다. 훈련 화면의
자리를 군 일과 화면이 대신한다.

---

## 3. 설계 — 축 다섯

### 3-1. 캘린더 (A · 엔진)

| 구간 | 주 | 무엇 |
|---|---|---|
| 훈련소 | 1~5 | 선택 없음 · 필수 이벤트 4 (입소·사격·행군·수료) · 감쇠 최대 |
| 자대 배치 | 6 | 사용자가 세팅한 부대(`unit.json`)로 배치 · 부대원(`members.json`) 등장 |
| 이병·일병 | 7~34 | 주간 일과 선택 시작 · 첫 정기휴가(W20 근처) |
| 상병 | 35~60 | 후임 입대 · 포상휴가 조건 열림 · 야구 감각 회복 선택 유리 |
| 병장 | 61~100 | 전역 준비 · 복귀 구단/독립 연락 · 전역 30일 카운트 |
| 특별 기간 | 고정 주 | 혹한기(1월) · 유격(6월) · 부대 검열(연 2회) · 전역 30일 전 |

⚠ 지금 계급 띠(8/34/60)는 그대로 쓴다 — 34종 이벤트 가드가 거기 걸려 있다.

### 3-2. 자원 (A · 엔진) — 셋만

| 자원 | 지금 | 제안 |
|---|---|---|
| 체력 | `fatigue`·`stamina` 그대로 | 일과 강도가 피로를 올리고 휴가가 내린다 |
| 멘탈 | `morale` 그대로 | 사람·휴가·편지가 올리고 갈등·검열이 내린다 |
| **야구 감각** (신규) | 없음 — 감쇠가 확률로 능력치를 직접 깎는다 | 0~100 하나. 공을 만진 주에 오르고 안 만지면 내린다. **전역 시 감쇠 총량과 복귀 곡선을 이것 하나가 정한다** — 능력치는 복무 중 안 건드리고 전역 때 감각으로 환산 |

야구 감각을 두는 이유: 지금은 "2년 뒤 얼마나 깎이나"가 확률 누적이라 **플레이어가
손쓸 수 없다.** 감각이 있으면 "주말에 캐치볼" 같은 선택이 의미를 갖는다.
✅ 확정(09-02) — 셋으로 간다. 관계는 자원이 아니라 부대원에 붙는다.

### 3-3. 보직 — **하나로 고정. 부대·부대원·병영생활은 사용자가 직접 세팅한다** (✅ 확정 09-02)

> 사용자: *"보직을 하나로 내가 정해서, 들어가는 부대 위치·부대원 정보를 내가 다
> 세팅해서 병영생활 부분을 구현할 거야."*

보직 다섯·선택 모달은 **없다.** 대신 A 는 **틀과 데이터 형식**을 만들고 내용은
사용자 데이터가 채운다 — 이벤트가 `events/**` JSON 인 것과 같은 방식이다.

```
resource/data/master/military/unit.json        부대 하나 — 이름 · 위치 · 성격(한 줄) · 보직
resource/data/master/military/members.json     부대원 — 이름 · 계급 · 역할(선임/간부/후임/동기) ·
                                                성격 한 단어 · 관계 시작값 · 입대·전역 주(후임은 W35 이후)
resource/data/master/military/calendar.json    고정 주 사건 — 훈련소 · 진급 · 휴가 · 혹한기 · 유격 · 검열 · 전역 30일
resource/data/master/events/pools/military_*   병영생활 이벤트 (B/사용자) — 부대원 id 로 사람을 가리킨다
```

A 가 하는 것: 이 넷을 읽어 주간 루프에 얹는 것(캘린더 주 · 부대원 관계 축 ·
야구 감각) + 검사(`check:militarydata` — 부대원 id 가 이벤트에서 다 풀리는지 ·
캘린더 주가 100주 안인지). **내용은 한 줄도 A 가 안 짓는다.**

### 3-4. 부대원 — 생성이 아니라 **사용자 데이터** (✅ 확정 09-02)

`members.json` 의 인원이 그대로 부대원이다(수 제한 없음). 기존 `relations` 축을
그대로 써서 관계값이 쌓이고, 이벤트는 부대원 id 로 사람을 가리킨다. 후임은
`joinWeek`(예: 35) 뒤에 나타난다. 전역 후 **재회 이벤트**는 관계값이 높은 순으로
부대원을 골라 띄운다(B/사용자 문안).

### 3-5. 이벤트 — 34종 → 사용자가 짓는 만큼 (B 는 형식 변환 · 조건 · 쿨다운)

| 층 | 지금 | 제안 | 예 |
|---|---|---|---|
| 필수 (계급·캘린더) | 6 | 14 안팎 | 입소 · 수료 · 자대 첫날 · 첫 휴가 · 진급 ×3 · 혹한기 · 유격 · 검열 ×2 · 전역 30일 · 전역 통보 · 전역식 |
| 조건부 (자원·부대원 관계) | 8 | 사용자 몫 | 감각 ≤30 「공을 못 만진다」 · 부대원 관계 ≤−20 「갈등」 |
| 랜덤 일상 | 20 | 사용자 몫 | 면회 · 편지 · 야구 소식 · 전우 · 의무대 · 부대 대항전 |

⚠ **쿨다운을 넣는다.** 지금 풀은 복원추출이라 같은 이벤트가 2년에 여러 번
뜬다 — 사기 데이터 손질(HANDOFF_A_TO_B §3.6)과 같은 문제다. B 가 그 작업에서
만드는 쿨다운 규칙을 여기도 쓴다.

⚠ 주 40% 한 건은 유지하되 **필수는 확률 밖**이다 (캘린더 주에 반드시 뜬다).

### 3-6. 전역 후 (A)

```
militaryRecoveryWeeks   6 고정  →  2~10 가변 (야구 감각 80 이상이면 2 · 30 이하면 10)
능력치                   복무 중 안 깎고 전역 때 감각으로 한 번에 환산 (✅ 확정 09-02)
군 경력 한 장            부대 · 계급 · 휴가 일수 · 부대원 관계 · 사건 하이라이트 → 인생 기록 화면
재회 이벤트              관계 상위 부대원과 (문안은 사용자/B)
```

---

## 4. 소유권 — 충돌 없이 나눈다

```
A   캘린더 로더 · 자원(야구 감각) · 부대·부대원 데이터 형식+로더+검사 · 관계 축 연결 ·
    전역 환산 — Rust calc_military_week 확장 + TS 주간 루프 · 규칙은 generation_rules.json
사용자  unit.json · members.json · calendar.json · 병영생활 이벤트 문안 (내용 전부)
B   사용자 내용을 이벤트 형식으로 옮김 · 조건(부대원 관계·감각·계급)·쿨다운 달기 · 소식 문안
C   군 일과 화면(훈련 화면 자리) · 부대원 패널 · 군 경력 한 장 (보직 선택 모달은 없다)
```

규칙·수치는 전부 `generation_rules.json` 에 둔다 — 코드에 표를 두 번 적지 않는다.

## 5. 규모 — 실측 기준 추정

```
A   4일   캘린더 로더 1 · 야구 감각 1 · 부대·부대원 형식+로더+검사+관계 연결 1 · 전역 환산+규칙 파일 1
B   3일   사용자 내용 → 이벤트 형식 변환 · 조건 · 쿨다운 (지금 34종이 08-26~09-01 닷새였다)
C   3일   화면 넷
검증  paths 프로브에 mil 경로가 이미 있다 — 감각 곡선·이벤트 도달률은 probe:morale 방식으로
```

**2주짜리다.** 9/15 프리즈 앞엔 안 들어간다 — 안 본 18행·밸런스·빌드가 그 자리다.

## 6. ✅ 사용자 결정 (2026-09-02)

| # | 결정 |
|---|---|
| 1 | **1.1 첫 항목 (9/16~).** 9/28 빌드는 지금 현역(감쇠 + 34종)으로 나간다 |
| 2 | **야구 감각 넣는다** — 복무 중 능력치는 안 깎고 전역 때 감각으로 환산 (4번도 이걸로 정해졌다) |
| 3 | **부대·부대원·병영생활은 사용자가 직접 세팅** — A 는 틀·형식·검사만. 보직은 09-02 밤에 **통신병 / 4.2인치 박격포병 중 랜덤**으로 넓혔다(3부 §15~20) |

⚠ 3번으로 §3-3·§3-4·§4·§5 가 바뀌었다 — B 몫이 "90종 짓기"에서 "사용자가 준
내용을 이벤트 형식으로 옮기고 쿨다운·조건을 다는 것"으로 줄고, A 에 데이터
형식·로더·검사가 붙는다. 규모는 A 4일 · B 3일 · C 3일 로 본다.

⚠ 상무는 이 문서 밖이다 — 경기가 있어 다른 틀이다. 다만 §3-1 캘린더·§3-4
사람은 상무에도 그대로 얹을 수 있다.

---

## 7. 데이터 형식 예시 — 사용자가 채우는 넷 (A 가 이 모양으로 로더·검사를 만든다)

이벤트 JSON 과 같은 방식이다. **값은 전부 예시**다 — 이름·위치·성격은 사용자 몫.

### `resource/data/master/military/unit.json` — 부대 하나

```json
{
  "id": "UNIT_MAIN",
  "name": "제00보병사단 0연대 0대대 0중대",
  "location": "강원 인제",
  "role": "소총수",
  "flavor": "전방. 겨울이 길고 야간 근무가 잦다.",
  "dutyIntensity": 3,
  "ballAccess": 1
}
```

`dutyIntensity`(1~5) 는 주간 피로 폭, `ballAccess`(0~3) 는 야구 감각이 오를 수 있는 상한이다.

### `resource/data/master/military/members.json` — 부대원

```json
[
  { "id": "MEM_SGT_KIM",  "name": "김 병장", "rank": "병장", "role": "senior",  "trait": "무심",   "relationStart": -5,  "joinWeek": 0,  "leaveWeek": 30 },
  { "id": "MEM_LT_PARK",  "name": "박 소위", "rank": "소위", "role": "officer", "trait": "깐깐함", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 100 },
  { "id": "MEM_PVT_LEE",  "name": "이 이병", "rank": "이병", "role": "junior",  "trait": "살가움", "relationStart": 5,   "joinWeek": 36, "leaveWeek": 100 },
  { "id": "MEM_PFC_CHOI", "name": "최 일병", "rank": "일병", "role": "peer",    "trait": "야구팬", "relationStart": 10,  "joinWeek": 0,  "leaveWeek": 100 }
]
```

`role` 은 `senior | officer | junior | peer` 넷. `joinWeek`/`leaveWeek` 는 복무 주(0~100).
관계값은 기존 `relations` 축(−100~100)을 그대로 쓴다.

### `resource/data/master/military/calendar.json` — 고정 주 사건

```json
[
  { "week": 1,  "event": "MIL_CAL_ENTRY",       "label": "입소" },
  { "week": 5,  "event": "MIL_CAL_GRADUATION",  "label": "훈련소 수료" },
  { "week": 6,  "event": "MIL_CAL_FIRST_DAY",   "label": "자대 첫날" },
  { "week": 20, "event": "MIL_CAL_FIRST_LEAVE", "label": "첫 정기휴가", "leaveDays": 10 },
  { "week": 35, "event": "MIL_CAL_PROMOTE_2",   "label": "상병 진급" },
  { "week": 44, "event": "MIL_CAL_WINTER",      "label": "혹한기 훈련", "fatigue": 12 },
  { "week": 61, "event": "MIL_CAL_PROMOTE_3",   "label": "병장 진급" },
  { "week": 70, "event": "MIL_CAL_RANGER",      "label": "유격 훈련", "fatigue": 10 },
  { "week": 96, "event": "MIL_CAL_D30",         "label": "전역 30일" },
  { "week": 100,"event": "MIL_CAL_DISCHARGE",   "label": "전역" }
]
```

`event` 는 이벤트 id 다 — **확률 밖**에서 그 주에 반드시 뜬다. 계급 띠(8/34/60)는 코드 그대로.

### 병영생활 이벤트 — 부대원을 가리키는 예 (`events/pools/military_general.json` 형식 그대로)

```json
{
  "id": "MIL_LIFE_NIGHT_DUTY_WITH_SENIOR",
  "title": "야간 근무 — 김 병장과 둘이",
  "description": "새벽 두 시. 김 병장이 말을 꺼낸다.",
  "minRank": 1, "maxRank": 2,
  "member": "MEM_SGT_KIM",
  "cooldownWeeks": 8,
  "conditions": [{ "type": "relation_gte", "member": "MEM_SGT_KIM", "value": -20 }],
  "choices": [
    { "id": "listen", "label": "들어 준다",      "effectHint": "관계 +8 · 피로 +2", "relationDelta": 8,  "fatigueDelta": 2 },
    { "id": "sleep",  "label": "졸음을 참는다", "effectHint": "관계 −4",           "relationDelta": -4 }
  ]
}
```

새 필드 셋 — `member`(누구 이야기인가) · `cooldownWeeks` · `conditions[].member`.
`ballDelta`(야구 감각 ±) 도 선택지 효과로 쓸 수 있다.

### A 가 만드는 검사 `check:militarydata`

```
① 이벤트의 member · conditions[].member 가 members.json 에 다 있다
② calendar.week 가 1~100 · event 가 실재한다 · 같은 주에 둘이 없다
③ joinWeek < leaveWeek · role 이 넷 중 하나
④ 부대원 id 로 관계가 실제로 움직인다 (헤드리스 — 배선 뺀 대조군 포함)
```

⚠ 이 넷이 없으면 "데이터가 코드와 어긋나도 아무도 안 죽고 로그도 안 남는"
그 형태가 된다(CLAUDE.md). 형식이 먼저, 내용은 그 다음이다.

---

# 2부 — 틀의 세부 (2026-09-02 저녁 · 계측 도는 동안)

> 1부(§1~7)가 "무엇을"이면 2부는 "어떻게"다. **숫자는 전부 제안값**이고
> `generation_rules.json` 의 `militaryLife` 아래로 간다 — 코드에 안 박는다.
> 사용자 세팅 데이터(unit·members·calendar·이벤트)는 이 틀 위에 얹힌다.

## 8. 주간 루프 — 한 주가 이렇게 흐른다

```
① 캘린더 확인      calendar.json 에 이번 주가 있으면 그 이벤트가 확률 밖으로 뜬다 (필수)
② 일과 선택        플레이어가 셋 중 하나 — 일과는 부대(dutyIntensity)가 정하고, 고르는 건 "남는 시간"
                     ㄱ. 공을 만진다     야구 감각 +  · 피로 +   (ballAccess 가 0 이면 안 뜬다)
                     ㄴ. 사람과 지낸다   관계 +(부대원 중 무작위 1~2) · 사기 +
                     ㄷ. 쉰다            피로 − · 사기 소폭 +
③ 주간 계산        Rust: 피로 = dutyIntensity 기반 + 선택 · 사기 회귀(60) · 야구 감각 증감 · 관계 감쇠
④ 이벤트           40% 로 한 건 — 필수는 ①에서 이미 떴으면 건너뜀 · 쿨다운 · 조건(감각·관계·계급·부대원 재적)
⑤ 소식             이벤트마다 한 통 · 4주마다 "이번 달 부대 소식" 한 통(관계 변화 · 휴가 · 진급)
```

훈련소(1~5주)는 ② 가 없다 — 선택지 없이 흘러가고 필수 넷만 뜬다.

## 9. 야구 감각 — 규칙 (제안값 · `militaryLife.ballSense`)

```
시작값        입대 시 60 (❓ 프로 출신이면 70, 학생 출신 55)
매주 기본     −1.5                                 ← ⚠ 아무것도 안 하면 **W37 근처에 0** (09-02 헤드리스 실측 · "100주에 0" 은 계산이 틀렸다 — 1.5×100=150)
공을 만짐     +3  (부대 ballAccess 1) · +5 (2) · +8 (3)    ← 상한: 100 − 10×(3 − ballAccess)
휴가 중       휴가 주는 +4 (밖에서 공을 만진다) — 단 그 주 선택은 없다
특별 기간     혹한기·유격 주는 −3 (선택 불가)
하한 0 · 상한 100
```

**전역 환산** (`militaryLife.discharge`):

```
감각 ≥ 80   능력치 그대로 · 회복 2주
60~79       커맨드·제구 −1 · 회복 4주
40~59       커맨드·제구·회복 −2 · 회복 6주  (지금 값과 비슷하다)
20~39       −3 · 회복 8주
< 20        −4 · 구속 −1 · 회복 10주
```

⚠ 지금은 매주 확률로 깎아 2년이면 평균 커맨드 −24 근처(75%×27주 + …)다.
환산표는 그보다 **훨씬 덜 깎는다** — "2년 군대 = 커리어 끝"이 아니라
"손쓰면 지킬 수 있다"가 목표라서다. ❓ 폭은 사용자 몫.

## 10. 휴가 · 계급 · 관계

**휴가** (calendar 의 `leaveDays` 가 있는 주):
- 그 주 선택 없음 · 피로 −20 · 사기 +8 · 야구 감각 +4
- 포상휴가: 관계 합이 문턱(❓ +40)을 넘는 상병 이후 1회 — 캘린더가 아니라 조건 이벤트

**계급** — 코드 띠(8/34/60) 그대로. 진급 주에 필수 이벤트 + 소식.
계급이 오르면 ㄴ(사람) 선택의 관계 폭이 커진다(이병 +2 → 병장 +4).

**관계** — `members.json` 의 `relationStart` 에서 시작, 기존 `relations` 축(−100~100).
- 매주 −0.5 감쇠(안 챙기면 멀어진다) · ㄴ 선택 +2~+4 · 이벤트 선택지 `relationDelta`
- `leaveWeek` 가 지나면 그 부대원은 사라지고 관계는 **얼려서 보존**(재회에 쓴다)
- 전역 후 재회: 관계 상위 2명 · 프로 첫 시즌 W10·W30 에 한 번씩

## 11. 필수 이벤트 14 — 캘린더에 박히는 것 (id 만 정한다 · 문안은 사용자)

| 주 | id | 무엇 | 선택 |
|---|---|---|---|
| 1 | `MIL_CAL_ENTRY` | 입소 | 없음 |
| 2 | `MIL_CAL_SHOOTING` | 사격 | 없음 |
| 4 | `MIL_CAL_MARCH` | 행군 | 없음 |
| 5 | `MIL_CAL_GRADUATION` | 수료 · 부대 배치 통보 | 없음 |
| 6 | `MIL_CAL_FIRST_DAY` | 자대 첫날 — 부대원 소개 | 1 |
| 20 | `MIL_CAL_FIRST_LEAVE` | 첫 정기휴가 (10일) | 2 (집 / 야구장) |
| 35 | `MIL_CAL_PROMOTE_2` | 상병 진급 · 후임 도착 | 1 |
| 44 | `MIL_CAL_WINTER` | 혹한기 | 없음 |
| 52 | `MIL_CAL_SECOND_LEAVE` | 정기휴가 2 | 2 |
| 61 | `MIL_CAL_PROMOTE_3` | 병장 진급 | 1 |
| 70 | `MIL_CAL_RANGER` | 유격 | 없음 |
| 84 | `MIL_CAL_INSPECTION` | 부대 검열 | 2 |
| 96 | `MIL_CAL_D30` | 전역 30일 — 복귀 연락 (구단/독립) | 1 |
| 100 | `MIL_CAL_DISCHARGE` | 전역식 · 군 경력 한 장 | 없음 |

나머지(조건부·랜덤)는 사용자가 짓는 만큼 — **주 40% × 94주 ≈ 38번** 뜨니
쿨다운을 감안하면 **40~60종**이면 2년이 반복 없이 찬다.

## 12. 화면 셋 (C) — ⚠ 09-02 밤에 **상위 탭 「병역」** 으로 바뀌었다 (§22 가 정본). 아래는 옛 안

```
① 군 일과 화면    위: 부대명 · 계급 · 복무 N/100주 · 다음 캘린더 사건까지 n주
                  가운데: 자원 셋 막대(체력·멘탈·야구 감각) · 이번 주 선택 ㄱ/ㄴ/ㄷ 카드 셋
                  아래: 이번 주 이벤트가 있으면 여기서 뜬다(기존 모달 재사용)
② 부대원 패널     members.json 순서로 카드 — 이름·계급·성격·관계 라벨(기존 라벨 규칙) · 재적 중/전역
③ 군 경력 한 장   전역 때 한 번 + 인생 기록에서 다시 — 부대 · 계급 · 휴가 일수 · 관계 상위 2 ·
                  캘린더 사건 14 중 겪은 것 · 야구 감각 곡선(52주 × 2 스파크라인)
```

## 13. 규칙 파일 키 · 검사 · 헤드리스

`generation_rules.json` → `militaryLife`:

```
ballSense   { start, weeklyDecay, touchGainByAccess:[0,3,5,8], leaveGain, hardWeekLoss, capByAccess }
discharge   [{ minSense:80, statLoss:0, recoveryWeeks:2 }, … ]
relation    { weeklyDecay:0.5, socialGainByRank:[2,2,3,4], rewardLeaveThreshold:40 }
leave       { fatigue:-20, morale:8, sense:4 }
event       { weeklyChance:0.40, commonShare:0.30 }        ← 지금 코드 값 그대로 옮긴다
```

검사 `check:militarydata` 넷(§7) + `test:militarylife`(순수 함수: 감각 증감 · 환산표 · 관계 감쇠 — 변이 검증).
헤드리스: `probe:paths --path mil` 이 이미 입대→전역을 밟는다 — 거기에 감각 곡선·
선택 분포·이벤트 도달(사용자 이벤트 몇 종이 떴나)을 찍는 `pathSignals` 항목을 더한다.

## 14. 사용자 작성 지침 — 부대·부대원·이벤트를 적을 때

```
부대       하나. dutyIntensity 3 이면 "보통" — 5 는 전방 GOP 급. ballAccess 는 공을 만질 수 있는 정도(0~3)
부대원     4~8명 권장. role 은 senior/officer/junior/peer. junior 는 joinWeek 35 뒤가 자연스럽다
           leaveWeek 로 "전역하는 선임"을 만들면 이별 이벤트가 생긴다
이벤트     한 건 = 상황 한 줄 + 선택 1~3. 효과는 relationDelta · moraleDelta · fatigueDelta · ballDelta 넷만
           member 를 적으면 그 사람 이야기 · conditions 로 "관계 ≥ / 감각 ≤ / 계급 / 재적" 을 건다
           cooldownWeeks 8 이 기본 — 같은 사건이 두 달 안엔 안 뜬다
문안       현재형 · 두 줄 안팎 · 선택지 라벨은 행동("들어 준다" · "모른 척한다")
```

⚠ 형식이 어긋나면 `check:militarydata` 가 빌드에서 막는다 — 조용히 사라지지 않는다.

---

# 3부 — 설정 확정과 확장 (2026-09-02 밤 · 사용자: 화천 · 전투지원중대 · 통신병/4.2인치 박격포병 랜덤)

> 편제는 조사해서 적었다(§16 출처). 게임은 **가상 사단**이라 실제 부대명은 안 쓴다.
> 2020-12 국방개혁 2.0 으로 연대 전투지원중대의 4.2인치가 **대대 화기중대**로
> 내려가고 연대급은 K105A1 포병대로 재편됐다 — 게임은 그 전 편제(전투지원중대에
> 4.2인치 박격포소대가 있는 모양)를 쓴다. 사용자가 고른 이름이 그것이다.

## 15. 설정 — 확정

```
복무지    강원도 화천 (전방 · 겨울 −20℃ · 폭설)
부대      제00보병사단 00연대 전투지원중대
보직      자대 배치(W6)에 둘 중 랜덤 — 씨앗 고정
            ㉠ 통신병            중대본부 소속
            ㉡ 4.2인치 박격포병   박격포소대 포반 소속 (탄약수 → 부사수 → 사수 로 올라간다)
```

## 16. 조직도 — 게임용 (실제 편제를 줄였다)

```
00연대 전투지원중대 (약 90명 · 게임에선 부대원 카드 12~16장)
├─ 중대본부
│  ├─ 중대장 (대위)            officer   ← 표창·징계·휴가 결재
│  ├─ 부중대장 (중위)          officer
│  ├─ 행정보급관 (상사)        officer   ← "행보관" · 병영생활의 실권
│  ├─ 통신병 ×2 (병)           ㉠ 주인공 자리 + 선임 통신병 1
│  ├─ 보급병 · 운전병 (병)     peer
│  └─ 취사병 (병)              peer
├─ 박격포 1소대 (4.2인치)
│  ├─ 소대장 (중위/소위) · 부소대장 (중사)      officer
│  ├─ 1포반  포반장(하사 또는 병장) · 사수(상병) · 부사수(일병) · 탄약수 ×2(이병) · 조종수
│  │         ← ㉡ 주인공은 여기 탄약수로 들어간다
│  ├─ 2포반  (같은 구성)
│  └─ 3포반  (같은 구성)
├─ 박격포 2소대 (같은 구성 · 카드로는 소대장 1장만)
└─ 대전차소대 (106mm 무반동총 → 현궁)  — 카드 없음 · 배경 이벤트("옆 소대")로만
```

실제: 연대 전투지원중대 = 4.2인치 박격포소대 ×3 + 106mm 무반동총소대 · 중대본부 =
중대장·부중대장·행정보급관·통신병·보급병. 포반 = 포반장·사수·부사수·탄약수(1~5번)·
조종수이고 포반장급은 부사관이다.
출처: [보병 (위키백과)](https://ko.wikipedia.org/wiki/%EB%B3%B4%EB%B3%91) ·
[4.2인치 박격포 (나무위키)](https://namu.wiki/w/4.2%EC%9D%B8%EC%B9%98%20%EB%B0%95%EA%B2%A9%ED%8F%AC) ·
[포병 용어 (나무위키)](https://namu.wiki/w/%ED%8F%AC%EB%B3%91%20%EC%9A%A9%EC%96%B4)

`members.json` 은 이 트리에서 **카드가 있는 자리만** 적는다 — 이름·성격은 사용자.

## 17. 보직 둘 — 같은 중대, 다른 2년

| | ㉠ 통신병 | ㉡ 4.2인치 박격포병 |
|---|---|---|
| 있는 곳 | 중대본부 · 상황실 | 포반 (5~6명 팀) |
| `dutyIntensity` | 2 (낮음) — 야간 상황근무는 잦다 | 4 (높음) — 진지·탄약·포상 |
| `ballAccess` | 2 (낮 시간이 남는다) | 1 (팀 일과가 빡빡) |
| 가까운 사람 | 행정보급관 · 중대장 · 선임 통신병 | 포반장 · 사수 · 같은 포반 탄약수 |
| 일과 색 | 무전기·유선 가설 · 상황판 · 간부 심부름 · 전화 | 포 조작 훈련 · 탄약 정리 · 진지 공사 · 행군 |
| **"경기" 대체 — 성과 이벤트** | **대대 지휘검열 통신평가**(연 2회 · W28 · W84) | **포사격훈련**(연 2회 · W16 · W68) — 사수가 되면 내 사격 성적 |
| 계급 아크 | 이병 통신병 → 병장 "중대 통신 담당" | 탄약수(이병) → 부사수(일병 말) → 사수(상병) → 포반장 대행(병장) |
| 위험 | 상황실 실수(간부 관계 −) · 야간 근무 피로 | 부상(무거운 포신·겨울 진지) · 사격 사고 |
| 야구 감각 원천 | 저녁 캐치볼 · 중대 대항전 | 중대 대항전 · 휴가 |
| 전역 특성 (제안) | **침착** — 멘탈리티 +1 · 위기 상황 사기 감소 완화 | **단단함** — 스태미나 +1 · 회복 +1 |

배정은 W6 에 씨앗으로 정한다(`seedOf(worldSeed, "military-role")`). 2회차 플레이에서
다른 보직이 나오는 게 자연스럽다. ❓ 확률 50/50 인지, 능력(제구 높으면 통신병 쪽)으로
기울일지.

## 18. 화천 캘린더 — §11 위에 얹는 것

| 주 | 무엇 | 보직 |
|---|---|---|
| 16 · 68 | **포사격훈련** — 포반 전원 · 사격 성적 이벤트 | ㉡ (㉠은 통신 지원으로 참가) |
| 28 · 84 | **대대 지휘검열** — 통신평가 · 상황실 | ㉠ (㉡은 진지 검열) |
| 12 · 64 | 진지 공사 (봄·가을) — 피로 큼 | ㉡ 주 · ㉠ 보조 |
| 44 | 혹한기 (§11) — 화천은 −20℃ · **제설 작업** 랜덤 이벤트가 이 앞뒤 8주에 뜬다 | 둘 다 |
| 46 | 산천어축제 — 외박·면회 이벤트 색 | 둘 다 |
| 52 | 정기휴가 2 (§11) | 둘 다 |

## 19. 확장안 — 이 설정에서 더 갈 수 있는 것 여덟

```
① 보직 랜덤 → 이벤트 풀 분기     공통 60% · 보직 전용 40%. roleTag 로 가른다 (§20)
② 성과 이벤트 = 경기의 대체        포사격 성적 / 통신평가 → 포상휴가 · 표창 · 진급 순서에 반영
③ 계급 아크가 자리가 된다          탄약수→사수→반장 대행 · 통신병→담당. 자리가 오르면 선택지가 바뀐다
④ 부대원 아크                       선임 전역(leaveWeek) → 이별 이벤트 → 후임(joinWeek) → 내가 가르친다
⑤ 사고·징계·진급 누락              근무 실수 누적 → 휴가 제한 · 일병→상병 한 달 누락 (되돌릴 수 없는 결과)
⑥ 계절                              혹한기·제설(겨울) · 진지 공사(봄·가을) · 유격(여름) — 같은 주라도 색이 다르다
⑦ 전역 특성 하나                    보직에 따라 침착/단단함 — 작은 영구 보너스. 군 경력 한 장에 적힌다
⑧ 상무와 대비                       상무는 경기가 있고 현역은 "성과 이벤트"가 있다 — 둘 다 2년이 서사가 된다
```

⑤가 "실제 군대 생활처럼"의 무게를 만든다 — 선택에 되돌릴 수 없는 결과가 있어야
주간 선택이 의미를 갖는다. ❓ 어디까지 무겁게 할지.

## 20. 데이터 형식 — 보직 둘을 담는 변경 (§7 위에)

> ⚠ **§37·§24 가 이 절을 대체했다 (09-02 밤).** 구현은 `roles[].subunit` + `members[].subunit·tags` 를 쓴다
> (`squadMembers`·`platoon`·`squad` 는 안 쓴다). 정본은 `apps/ui/src/shared/types/militaryLife.ts` 와
> `resource/data/master/military/*.json` · 검사 `npm run check:militarydata`.

```json
// unit.json — roles 를 더한다. 나머지는 §7 그대로
{
  "id": "UNIT_CSC", "name": "제00보병사단 00연대 전투지원중대", "location": "강원 화천",
  "flavor": "전방. 겨울이 길다. 박격포 소리가 산에 울린다.",
  "roles": [
    { "id": "signal", "label": "통신병",           "platoon": "HQ",  "dutyIntensity": 2, "ballAccess": 2, "squadMembers": ["MEM_SGT_SIGNAL", "MEM_CSM", "MEM_CO"] },
    { "id": "mortar", "label": "4.2인치 박격포병", "platoon": "M1",  "dutyIntensity": 4, "ballAccess": 1, "squadMembers": ["MEM_M1_LEADER", "MEM_M1_GUNNER", "MEM_M1_ASST", "MEM_M1_AMMO2"] }
  ],
  "roleAssign": "random"          // "random" | "signal" | "mortar"  ← 디버그·2회차용
}

// members.json — platoon · squad 를 더한다 (카드가 있는 자리만)
{ "id": "MEM_M1_GUNNER", "name": "…", "rank": "상병", "role": "senior", "platoon": "M1", "squad": "1포반",
  "trait": "…", "relationStart": 0, "joinWeek": 0, "leaveWeek": 60 }

// 이벤트 — roleTag 로 보직 전용을 가른다 (없으면 공통)
{ "id": "MIL_MORTAR_LIVE_FIRE", "roleTag": "mortar", "calendar": true, "member": "MEM_M1_LEADER", … }

// calendar.json — roleTag 선택 (없으면 둘 다)
{ "week": 16, "event": "MIL_MORTAR_LIVE_FIRE", "label": "포사격훈련", "roleTag": "mortar" }
```

검사(`check:militarydata`)에 둘 더한다: ⑤ `roles[].squadMembers` 가 members 에 있다 ·
⑥ `roleTag` 가 `roles[].id` 중 하나다.

## 21. 사용자가 지금 적어 둘 수 있는 것

```
members.json   중대본부 6 + 1포반 5 + 소대장·부소대장 2 + 2소대장 1 = 14장 안팎. 이름 · 성격 한 단어 · 관계 시작값
이벤트         ㉠ 전용 15~20 · ㉡ 전용 15~20 · 공통 20~30  →  50~70종
               "상황 한 줄 + 선택 1~3 · 효과는 relation/morale/fatigue/ball 넷" (§14)
필수 14 + 보직 캘린더 6 문안
```

---

## 22. "병역" 탭 — 상위 탭으로 (✅ 사용자 확정 09-02 밤: "탭에 병역이라고 추가해서 거기서 동작")

### 지금
상위 탭은 `news · me · team · league · people · schedule` 여섯이고(`types/main.ts` · `navVisibility.ts`),
복무 중엔 `MilitaryStatusPanel` 이 **어느 탭을 열어도 위에 끼어** 뜬다(`MainPage.svelte:486`).
훈련(`me > training`)은 복무 중에도 그대로 보인다. 즉 병역은 "화면"이 아니라 "배너"다.

### 설계

```
MainTabId  += "military"                       라벨 「병역」
노출        careerStage === "military" 일 때만  (navVisibility NAV 표에 한 줄 — 유니온이라 빠지면 컴파일이 깨진다)
순서        NAV_ORDER 의 맨 앞 — 복무 중엔 "나" 그룹보다 앞. 입대하는 주에 currentTab 을 "military" 로 옮긴다
숨김        me > training (병역 > 일과가 대신한다) · 그 밖의 탭은 그대로 둔다
            ⚠ 팀·리그·일정은 안 숨긴다 — 소속팀은 계속 경기하고(08-05 사용자 확정 "있는 정보를 지우지 않는다")
              복무 중 세상이 도는 걸 오늘 고쳤다. 병역 탭이 "지금 내 생활", 나머지 탭이 "밖의 세상"이다
배너        MilitaryStatusPanel 은 병역 탭 머리로 옮긴다 — 다른 탭 위에는 안 낀다
모달        군 이벤트 pending 은 병역 탭에 묶는다 (진로 모달이 소식 탭에 묶이듯 `currentTab === "military"`)
전역 뒤     탭은 사라진다. 군 경력 한 장은 나 > 상태 > 기록 과 인생 기록 화면에서 본다
```

### 나타나고 사라지는 규칙 (✅ 사용자 확정 09-02 밤: "입대하면 나오고 제대하면 사라져야 한다")

```
입대하는 주   enlistMilitary 가 careerStage 를 "military" 로 → visibleNavTabs 에 "military" 가 들어온다
              같은 주에 currentTab = "military" 로 옮긴다 (MainPage 의 "navTabs 에 없으면 폴백" 옆에 한 줄)
복무 100주    탭이 있다. 상무(체육부대)도 careerStage 가 "military" 라 같은 규칙 — 안의 내용만 다르다
전역하는 주   completeMilitaryService 가 단계를 되돌리면 visibleNavTabs 에서 빠진다
              currentTab 이 "military" 였으면 기존 폴백(navTabs[0] = "news")이 받는다 — 새 코드 없음
전역 뒤       탭 없음. 군 경력 한 장은 나 > 상태 > 기록 · 인생 기록 (militaryServedUnit 이 있으면 항목이 뜬다)
세이브 로드   복무 중 세이브를 열면 그 탭이 그대로 있다 — 조건이 상태 하나(careerStage)라 따로 저장할 게 없다
```

⚠ **탭의 유무를 결정하는 값은 `careerStage` 하나**다. 다른 플래그를 두지 않는다 —
둘이면 한쪽만 바뀐 채 남는다(이 저장소가 여러 번 겪은 형태).

### 병역 탭 안 — 2단 넷 (`MilitaryTabId`)

| 2단 | 무엇 | 데이터 |
|---|---|---|
| **일과** (기본) | 머리: 부대 · 보직 · 계급 · 복무 N/100 · 다음 캘린더 사건까지 n주. 자원 셋 막대. **이번 주 선택 카드 셋**(공 · 사람 · 쉼). 이번 주 이벤트가 여기서 뜬다 | `militaryLife` 상태 · `unit.roles` |
| **부대원** | 카드 — 이름 · 계급 · 소대/포반 · 성격 · 관계 라벨(기존 라벨 규칙) · 재적/전역 | `members.json` · `relations` |
| **캘린더** | 100주 타임라인 — 지난 사건(겪은 것 · 선택) · 다음 사건 · 휴가 | `calendar.json` · `careerTriggeredEvents` |
| **경력** | 누적 — 성과 이벤트 결과(포사격/통신평가) · 표창·징계 · 휴가 일수 · 야구 감각 곡선. 전역 때 "한 장"이 된다 | 주간 루프 누적 |

### 소유권

```
A   types/main.ts (MainTabId · MilitaryTabId) · utils/navVisibility.ts (NAV 표 · ORDER · 입대 시 전환) · 상태 필드
C   pages/military/MilitaryPage.svelte (2단 넷) · MainPage 분기 한 줄 · MilitaryStatusPanel 이동 · me>training 숨김 반영
검사 navVisibility 검사에 "복무 중에만 military 가 보이고 training 은 안 보인다" · `_exhaustive` 가 switch 누락을 잡는다
```

⚠ 지금 `MainPage.svelte` 의 pending → 탭 `switch` 가 `never` 로 못박혀 있어 `"military"` 를
더하면 **컴파일이 먼저 깨진다** — 그게 의도다. 갈래를 빠뜨릴 수 없다.

---

# 4부 — 병영생활 상세: 항목과 동작 (2026-09-02 밤 · 사용자: "이제 병영 부분 항목들이나 동작 디테일하게 잡아보자")

이 부는 **구현 명세**다. 1~3부의 결정을 그대로 두고, 코드가 매주 무엇을 어떤
순서로 하는지·데이터가 어떤 모양인지·무엇을 검사하는지를 적는다. 값 중
**❓ 표시는 밸런스라 사용자 확정 전까지 제안값**이다. 목업은
[병역 탭 미리보기](https://claude.ai/code/artifact/8e3a5831-89a1-4415-b5cf-b97e0bb50252).

## 23. 지금 코드가 매주 하는 것 (실측 · 2026-09-02) — 무엇을 바꾸는가

```
advanceWeek.ts ≈2160~   careerStage === "military" 갈래
  ① seasonStore.advanceWeek · gameStore.advanceMilitaryWeek (serviceWeeks +1)
  ② rankIndex = ≤8 → 0 · ≤34 → 1 · ≤60 → 2 · 그 밖 3      (계급 띠 — 그대로 둔다)
  ③ 이벤트 후보 = minRank ≤ 띠 ≤ maxRank · once 는 careerTriggeredEvents 로 거름
  ④ Rust calc_military_week — 현역이면 **커맨드·제구·회복을 확률로 깎는다**
     (이병 0.75/0.65/0.20 … 병장 0.15/0/0) · 사기·피로 고정 델타 · 40% 로 풀 인덱스 하나 뽑음
  ⑤ 뽑힌 이벤트 → pending {type:"event"} · 소식 한 통 · 주간 로그 한 줄
  ⑥ 100주 → 롤오버가 dischargeProtagonist → 회복 6주 고정
풀   military 5 · common 14 · general 20 · sports 20   (쿨다운 없음 · 복원추출)
```

**바꾸는 것** — ④의 능력치 감쇠를 **현역에서 뗀다**(✅ 09-02 "복무 중 안 깎고 전역 때
환산"). 그 자리에 **캘린더 → 선택 → 자원 계산 → 이벤트 → 소식**의 주간 루프가 들어간다.
상무(`isSportsUnit`)는 **지금 표 그대로** 둔다 — 탭만 같이 쓰고 안은 다르다.
③의 거르기(띠·once)는 유지하고 **쿨다운·조건·부대원 재적**을 더한다.

⚠ Rust 함수는 **새로 하나 더 만든다**(`calc_military_life_week`). `calc_military_week`
는 상무가 계속 쓴다 — 갈래 하나를 고쳐서 두 무대가 같이 흔들리는 걸 막는다.

## 24. 상태 — 세이브에 들어가는 것 (`protagonist.militaryLife`)

```ts
interface MilitaryLifeState {
  unitId:        string;                       // unit.json 의 id
  roleId:        "signal" | "mortar";          // W6 에 확정 · 그 전엔 null
  ballSense:     number;                       // 0~100
  relations:     Record<string, number>;       // memberId → −100~100 (기존 relations 축과 같은 척도)
  frozen:        Record<string, number>;       // leaveWeek 지난 부대원 — 재회용으로 얼린 값
  calendarDone:  string[];                     // 뜬 캘린더 이벤트 id (한 번만)
  cooldown:      Record<string, number>;       // eventId → 마지막으로 뜬 복무 주
  choiceLog:     Array<{ week: number; choice: "ball" | "people" | "rest" | null }>;  // 100칸 상한
  leaveDays:     number;                       // 쓴 휴가 일수 누계
  awards:        Array<{ week: number; id: string }>;
  penalties:     Array<{ week: number; id: string }>;
  perf:          Array<{ week: number; id: string; tier: number; note: string }>;   // 포사격·통신평가 결과
  senseCurve:    number[];                     // 4주마다 ballSense 표본 (25칸) — 경력 탭 곡선
}
```

- 입대 주에 `enlistProtagonist` 가 만든다. **현역만** — 상무는 `militaryLife: null`.
- `migrateProtagonist` 에 `militaryLife: p.militaryLife ?? null` 한 줄 (16필드 규칙과 같다).
- 계급·복무 주·다음 사건은 **파생**이다 — `militaryServiceWeeks` 하나에서 계산한다. 따로 안 둔다.
- 전역 때 `militaryRecord`(§30) 한 장으로 접고 `militaryLife` 는 **null 로 비운다.**
  탭 유무는 `careerStage` 하나가 정한다(§22) — 이 필드는 탭의 근거가 아니다.

## 25. 주간 루프 — 순서가 곧 명세다

```
W = militaryServiceWeeks (1 부터) · 부대 = unit.json · 부대원 = members.json 중 joinWeek ≤ W < leaveWeek

① 진급·전출     W 가 9/35/61 이면 띠가 바뀐다 — 소식 한 통 · 캘린더 필수 이벤트가 같은 주에 있으면 그게 대신
                leaveWeek == W 인 부대원: relations → frozen 로 옮기고 소식 한 통 ("○○ 전역")
                joinWeek == W 인 부대원: relations[id] = relationStart · 소식 한 통 ("후임 도착")
② 캘린더        calendar.json 에 W 가 있으면 그 이벤트를 **확률 밖**으로 pending 에 올린다 (calendarDone 에 넣는다)
                leaveDays 가 있으면 휴가 주 · fatigue/ballDelta 가 있으면 그대로 적용 (③ 이전에)
③ 선택 여부     선택 없음 = 훈련소(W1~5) · 휴가 주 · 캘린더에 noChoice 가 붙은 주(혹한기·유격·진지 공사)
                선택 있음 = 그 밖 전부. 선택은 **주 진행 전에** 화면에서 고른다 (§32 · 안 고르면 "쉰다")
④ 자원 계산     Rust calc_military_life_week (§26) — 피로·사기·야구 감각·관계 델타를 한 번에
⑤ 이벤트        캘린더 이벤트가 이미 떴으면 건너뜀. 아니면 40% 로 한 건 — 후보는 TS 가 거르고(§28) Rust 가 인덱스만 뽑는다
⑥ 소식          이벤트 한 통 · 4주마다 "이번 달 부대 소식" 한 통 (id `msg-mil-digest-{year}-w{week}`)
⑦ 저장          militaryLife 갱신 · W % 4 == 0 이면 senseCurve.push(ballSense)
⑧ 100주         기존대로 롤오버 → dischargeProtagonist (§30 환산이 여기 들어간다)
```

⚠ **선택은 pending 이 아니다.** pending 으로 만들면 헤드리스(`probe:paths`)가 매주 멈춘다.
"이번 주 선택"은 `militaryLife.nextChoice` 에 미리 적어 두는 값이고, 진행 버튼이 그걸 읽는다.
안 적혀 있으면 "쉰다". 헤드리스는 정책으로 채운다(공 우선 등).

## 26. 자원 수식 — Rust `calc_military_life_week` (❓ 는 제안값)

입력: `dutyIntensity(1~5) · ballAccess(0~3) · rankBand(0~3) · choice · fatigue · morale · ballSense ·
calendarFatigue · calendarBall · onLeave · noChoice · members[{id, relation, present, subunitSame}] · seed`

```
피로   base = {1:2, 2:4, 3:6, 4:8, 5:10}[dutyIntensity]  ❓
       + choice {ball:+4, people:+1, rest:−6}  + calendarFatigue  − 3(자연 회복)
       휴가 주: −20 고정 (선택 없음)                       clamp 0~100
사기   기존 회귀 그대로: (60 − morale) × 0.05             (CLAUDE.md 사기 회귀)
       + choice {people:+2, rest:+1} + 휴가 +8 + 이벤트 선택지 moraleDelta
야구감각  −1.5 매주 ❓
       + choice ball: {1:+3, 2:+5, 3:+8}[ballAccess]  (ballAccess 0 이면 카드 자체가 없다)
       + 휴가 +4 · calendarBall(혹한기·유격 −3)
       상한 100 − 10 × (3 − ballAccess) ❓ · 하한 0
관계   전원 −0.5 매주 ❓ (안 챙기면 멀어진다)
       choice people: 대상 1~2명 (같은 소단위 가중 2배 · 씨앗) 에 +{0:+2, 1:+2, 2:+3, 3:+4}[rankBand]
       이벤트 선택지 relationDelta (member 지정) · clamp −100~100
```

**능력치는 건드리지 않는다.** 결과 구조체에 stat 칸이 없다 — 있으면 누가 쓴다.
씨앗은 `seedOf(worldSeed, year, week, "military-life")` — `thread_rng()` 안 쓴다(결정성 정책).

## 27. 선택 카드 셋 — 화면이 보여 주는 규칙

| 카드 | 뜨는 조건 | 효과(화면에 적는 값) | 비고 |
|---|---|---|---|
| ㄱ 공을 만진다 | ballAccess ≥ 1 · 선택 있는 주 | 감각 +{3/5/8} · 피로 +4 | 감각이 상한이면 "상한 — 오르지 않는다" 표시 |
| ㄴ 사람과 지낸다 | 재적 부대원 ≥ 1 | 관계 +{2/2/3/4} (1~2명) · 사기 +2 | 누구에게 갔는지 소식에 적는다 |
| ㄷ 쉰다 | 항상 | 피로 −6 · 사기 +1 | 기본값 |

- 카드는 **효과를 숨기지 않는다** — 값을 그대로 적는다(이벤트 `effectHint` 와 같은 원칙).
- 피로 ≥ 85 면 ㄱ 카드에 경고 띠("부상 위험") — 부상은 §28 조건부 이벤트가 맡는다. 확률 부상은 없다.

## 28. 이벤트 — 형식 · 조건 · 뽑기

기존 `events/pools/military_general.json` 형식 위에 **넷을 더한다**: `member · cooldownWeeks ·
conditions · weight`. 기존 20건은 이 형식으로 그대로 읽힌다(새 필드는 전부 선택).

```jsonc
{
  "id": "MIL_LIFE_SNOW_SHOVEL",
  "title": "제설",  "description": "…",
  "minRank": 0, "maxRank": 3, "once": false,
  "cooldownWeeks": 6,                       // 이 주 안에는 다시 안 뜬다 (기본 4 ❓)
  "weight": 2,                              // 뽑힐 가중 (기본 1)
  "member": "MEM_SGT_KIM",                  // 이 부대원이 재적 중일 때만 · 문안이 그를 가리킨다
  "conditions": [
    { "type": "week_between", "from": 40, "to": 48 },
    { "type": "relation_gte", "member": "MEM_SGT_KIM", "value": -20 },
    { "type": "ballSense_lte", "value": 30 },
    { "type": "fatigue_gte", "value": 70 },
    { "type": "role", "value": "mortar" }
  ],
  "choices": [
    { "id": "a", "label": "…", "effectHint": "관계 +8 · 피로 +2",
      "relationDelta": 8, "fatigueDelta": 2, "moraleDelta": 0, "ballDelta": 0,
      "award": "MIL_AWARD_COMMENDATION", "leaveDays": 3 }
  ]
}
```

**조건 어휘** (전부 AND · 검사가 모르는 type 을 거부한다):
`week_between · rank(band) · role · relation_gte/lte(member) · ballSense_gte/lte · fatigue_gte/lte ·
morale_gte/lte · member_present(member) · season_month(1~12 · 시즌 주차에서 환산) · leave_recent(주)`

**뽑기**: 후보 = 띠 ✓ · once ✓ · 쿨다운 ✓ · member 재적 ✓ · conditions 전부 ✓ →
가중 누적 → Rust 가 `[0, Σweight)` 정수 하나 (씨앗) → 그 이벤트. 후보 0 이면 그 주는 없음.
**필수(캘린더) 는 이 경로를 안 탄다** — §25 ② 에서 이미 떴다.

**선택지 효과 필드** (전부 선택): `relationDelta(member 대상) · fatigueDelta · moraleDelta · ballDelta ·
award · penalty · leaveDays · statDelta 는 현역에선 **무시하고 검사가 경고**`(능력치 안 건드린다).

**성과 이벤트 판정** (§17 · "경기" 대체 · 캘린더에 박힘):
```
tier = clamp(1..6,  round( 3.5  − 0.8×(rankBand−1)  + 0.02×relation(포반장 or 행보관)  + (fatigue>70 ? +1 : 0) + 씨앗 ±1 ))  ❓
포사격훈련(㉡ W16·W68)   tier 1~2 → 표창 후보 · tier 6 → 징계 후보 · 결과는 perf[] 와 소식
통신평가(㉠ W28·W84)     같은 식 · 관계 대상이 행정보급관
```
결과 tier 는 문안 `{tier}` 로 이벤트 본문에 들어간다 — 이벤트 JSON 이 `perf` 필드로 어느 판정인지 가리킨다.

## 29. 캘린더 — 형식과 검사

```jsonc
{ "week": 44, "event": "MIL_CAL_WINTER", "label": "혹한기", "fatigue": 12, "ballDelta": -3, "noChoice": true, "role": null }
```
`week`(1~100 · 유일) · `event`(풀 어딘가에 있는 id) · `label` · 선택: `leaveDays · fatigue · ballDelta · noChoice · role(㉠/㉡ 한쪽만)`.
**§11 필수 14 는 반드시 있어야 한다** — 검사가 id 로 센다. §18 화천 사건은 그 위에 얹는다.
같은 주에 둘이면 검사 실패(한 주 한 사건).

## 30. 전역 — 환산·기록·재회

```
환산 (§9 표 · ❓ 폭)     ballSense 로 커맨드·제구·회복(·구속) 한 번에 · militaryRecoveryWeeks = {≥80:2, 60~79:4, 40~59:6, 20~39:8, <20:10}
특성                     ㉠ 침착 (mentality +1)  ㉡ 단단함 (stamina +1 · recovery +1)  — playerTraits 에 한 줄씩
군 경력 한 장            militaryRecord = { unit, role, finalRank, leaveDays, awards, penalties, perf, topRelations(3), senseCurve, highlights(캘린더 선택 6개) }
                         → careerRecords 에 leagueId "LEAGUE_MILITARY" 한 행 + 인생 기록 화면 항목
재회                     frozen ∪ relations 상위 2명 → 전역 후 첫 시즌 W10·W30 에 조건부 이벤트 (문안 사용자/B)
```

## 31. 소식 — id 와 통 수

| 통 | id | 언제 |
|---|---|---|
| 이벤트 | `msg-mil-ev-{eventId}-{year}-w{week}` | 뜰 때마다 |
| 진급·전입·전역 | `msg-mil-unit-{kind}-{year}-w{week}` | §25 ① |
| 월간 부대 소식 | `msg-mil-digest-{year}-w{week}` | 4주마다 — 관계 변화 상위 3 · 감각 · 휴가 · 다음 사건 |
| 전역 | 기존 전역 소식 그대로 + 군 경력 한 장 링크 | 100주 |

id 에 연도를 넣는다(소식 id 규칙 — weekNum 은 시즌마다 리셋된다).

## 32. 화면 상태 (C) — 병역 탭 넷의 데이터 바인딩과 빈 상태

```
머리      unit.name · unit.location · role 라벨 · 계급(띠→이병/일병/상병/병장) · W/100 막대 · 다음 캘린더 사건(주·라벨·n주 뒤)
일과      자원 셋 막대(피로는 낮을수록 좋음 — 방향 표시) · 선택 카드 셋(§27 · 훈련소/휴가/noChoice 주엔 "이번 주는 선택이 없다 — 이유")
          · 이번 주 이벤트(있으면 pending 그대로) · 월간 소식 마지막 한 통
부대원    재적 카드(소단위별 묶음 · 관계 라벨 7단계 · 성격 · 역할) · 예정(joinWeek 미도달 · 흐림) · 전역(frozen · 흐림)
캘린더    100주 축 · 지난 것은 calendarDone + 선택 · 다음 것 강조 · 휴가 표시
경력      perf[] · awards/penalties · leaveDays · senseCurve 곡선 · 관계 상위 · 전역 환산 표에서 지금 구간 강조
전환      입대 주 currentTab = "military" · 전역 주 탭 소멸(폴백 news) · 상무는 같은 탭, 일과 대신 "훈련" 내용
```

## 33. 검사·계측 — 무엇이 실패해야 하나

```
check:militarydata      unit/members/calendar/이벤트 넷을 실제 로더로 읽어서:
                          member id 가 members.json 에 있다 · calendar week 1~100 유일 · 필수 14 id 전부 있다
                          conditions.type 이 어휘 안이다 · cooldownWeeks ≥ 1 · statDelta 가 현역 풀에 있으면 경고
                          role 값이 signal|mortar 다 · joinWeek < leaveWeek ≤ 100
vitest (순수 함수)       주간 루프 순서(§25) · 자원 수식(§26 · 경계값) · 후보 거르기(§28 · 쿨다운·재적·조건) ·
                          성과 tier · 전역 환산 표 · migrate 한 줄 · **변이**: 쿨다운 제거 → 같은 이벤트 연속 → 실패
probe:military          씨앗 3 × 100주 헤드리스(정책: 공 우선 / 사람 우선 / 쉼) —
                          감각 곡선 · 이벤트 종류 수와 반복 횟수 · 관계 분포 · 피로 NaN 0 · 전역 환산 결과 · 소식 통 수
                          ⚠ `[일정끝]` 이 아니라 **주마다** 찍는다 (bgsched 함정)
회귀                    probe:paths mil 경로 · militaryLeagueId.test · dischargeOpensSeason.test 그대로 통과
```

## 34. 순서 — 누가 먼저 (1.1 첫 항목 · 충돌 없이)

```
A  ① 형식·로더·검사 (§24 상태 · §28/29 형식 · check:militarydata · 빈 틀 파일 셋)    ← 사용자가 내용을 채울 수 있게 제일 먼저
   ② Rust calc_military_life_week + 주간 루프 (§25/26) · 상무 갈래 분리 · migrate
   ③ 전역 환산·기록·재회 훅 (§30) · 소식 (§31) · probe:military
사용자  unit.json · members.json · calendar.json · 병영생활 이벤트 (A ① 뒤부터 가능)
B  기존 34종 → 새 형식(쿨다운·조건) 변환 · 필수 14 문안 · 월간 소식 문안
C  §22 탭 + §32 화면 넷 (A ① 의 타입이 나오면 목업 그대로 옮긴다)
```

## 35. 사용자 확정 (2026-09-02 밤) — 밸런스 값과 방식

| # | 항목 | ✅ 확정 |
|---|---|---|
| 1~4·6·7 | 야구 감각(시작 60 · −1.5 · 공 +3/5/8 · 상한식) · 전역 환산 폭·회복 2~10 · 피로 base {2,4,6,8,10}·선택 {+4,+1,−6}·휴가 −20 · 관계 −0.5·사람 카드 +2/2/3/4·포상휴가 +40 · 성과 tier 계수 · 쿨다운 4주·주 40% | **제안값 그대로 1차** — 구현 뒤 `probe:military`(씨앗 3×100주)로 재고 한 번에 조정 |
| 5 | 보직 배정 | **반반 랜덤** — W6 에 `seedOf(worldSeed, "military-role")` 50/50. 능력 기울임 없음 |
| §25 | 이번 주 선택 시점 | **병역 탭에서 미리 고른다** — `militaryLife.nextChoice` · 안 고르면 "쉰다" · 헤드리스는 정책으로 채운다 |
| 문안 | 62종 문안 | **1.0 은 B 초안 그대로 · 1.1 에서 사용자가 다듬는다** (09-02 21:50) — 형식·검사는 끝났으니 문안만 갈아끼우면 된다 |
| 착수 | 구현 시작 | ~~아직~~ → **09-02 13:40 착수** (사용자: "지금 구현 문서 기준으로 A·B·C 에 맞는 쪽에 넣어 진행") · §34 순서 · 상태는 PROGRESS_TREE A-12~14 · B-11 · C-12 |

## 36. 이벤트 카탈로그 — id·트리거·선택지 골격 (문안은 비워 둔다 · 사용자 몫)

층 넷: **필수**(캘린더 · 확률 밖) · **화천**(캘린더 · §18) · **조건부**(자원·관계가 연다) · **일상**(랜덤 · 쿨다운).
효과 축은 §28 의 선택지 필드다. `역할` 은 ㉠ 통신병 · ㉡ 박격포병 · 둘 다 = —.

### 36-1. 필수 14 + 화천 6 (캘린더 · 한 주 한 사건)

| 주 | id | 역할 | 선택 | 효과 골격 |
|---|---|---|---|---|
| 1 | `MIL_CAL_ENTRY` | — | 없음 | 피로 +8 · 사기 −3 · 감각 −2 (훈련소 감쇠 최대) |
| 2 | `MIL_CAL_SHOOTING` | — | 없음 | 소식만 · 감각 −2 |
| 4 | `MIL_CAL_MARCH` | — | 없음 | 피로 +10 · 감각 −2 |
| 5 | `MIL_CAL_GRADUATION` | — | 없음 | 배치 통보 — unit.name·location 을 문안에 넣는다 · 피로 −5 |
| 6 | `MIL_CAL_FIRST_DAY` | — | 1 (인사) | 보직 확정 표시(§35 · 50/50) · 재적 부대원 전원 관계 +2 · 사기 +2 |
| 12 | `MIL_CAL_WORKS_SPRING` | ㉡ 주 · ㉠ 보조 | noChoice | 피로 +12(㉡) / +6(㉠) · 같은 소단위 관계 +1 |
| 16 | `MIL_CAL_FIRE_1` | ㉡ (㉠ 통신 지원) | 1 (긴장/평정) | **perf 포사격** tier(§28) · 포반장 관계 ±3 · 피로 +6 |
| 20 | `MIL_CAL_FIRST_LEAVE` | — | 2 (집 / 야구장) | 휴가 10일 · 집: 사기 +10 감각 +2 · 야구장: 감각 +6 사기 +6 · 피로 −20 |
| 28 | `MIL_CAL_INSPECTION_1` | — | 1 (성실/요령) | **perf 통신평가**(㉠) / 진지 검열(㉡) · 성실: tier −1 피로 +5 · 요령: tier 그대로 피로 0 |
| 35 | `MIL_CAL_PROMOTE_2` | — | 1 (후임 소개) | 상병 · 후임(joinWeek 36) 예고 · 사기 +3 · **포상휴가 조건 열림** |
| 44 | `MIL_CAL_WINTER` | — | noChoice | 혹한기 · 피로 +12 · 감각 −3 · 앞뒤 8주에 `MIL_COND_SNOW` 열림 |
| 46 | `MIL_CAL_FESTIVAL` | — | 2 (외박 / 부대 잔류) | 산천어축제 · 외박: 사기 +6 감각 +2 관계 동기 +3 · 잔류: 피로 −6 간부 관계 +2 |
| 52 | `MIL_CAL_SECOND_LEAVE` | — | 2 | 첫 휴가와 같다 |
| 61 | `MIL_CAL_PROMOTE_3` | — | 1 (책임 — 후임/소단위) | 병장 · 후임 관계 +4 또는 소단위 전원 +2 · **보직 아크 문**(§38) |
| 64 | `MIL_CAL_WORKS_FALL` | ㉡ 주 | noChoice | 봄과 같다 · 병장이면 피로 절반 |
| 68 | `MIL_CAL_FIRE_2` | ㉡ | 1 | perf 포사격 — **사수면 "내 성적"** 문안 · 표창 후보 |
| 70 | `MIL_CAL_RANGER` | — | noChoice | 유격 · 피로 +10 · 감각 −3 |
| 84 | `MIL_CAL_INSPECTION_2` | — | 2 | 통신평가 2(㉠) / 진지 검열(㉡) · W28 과 같다 · 표창 후보 |
| 96 | `MIL_CAL_D30` | — | 1 (연락) | 전역 30일 · 복귀 연락 — 기존 복귀 로직(구단/독립)에 걸친다 · 사기 +5 |
| 100 | `MIL_CAL_DISCHARGE` | — | 없음 | 전역식 · §30 환산·기록 |

⚠ §11 의 W28 「검열」과 §18 의 W28 「지휘검열」은 **한 사건**이다 — id 하나(`MIL_CAL_INSPECTION_1`)에 역할별 perf 가 갈린다.

### 36-2. 조건부 16 — 자원·관계가 연다 (조건은 §28 어휘 · 쿨다운 주)

| id | 조건 | 쿨다운 | 대상 | 선택지 골격 → 효과 |
|---|---|---|---|---|
| `MIL_COND_NO_BALL` | ballSense ≤ 30 | 12 | — | 편지로 야구 소식(사기 +4 감각 +2) / 잊는다(사기 +1) |
| `MIL_COND_SENSE_HIGH` | ballSense ≥ 75 · rank ≥ 2 | 16 | peer | 중대 대항전 에이스 — 감각 +3 · 소단위 관계 +2 · 피로 +5 |
| `MIL_COND_FATIGUE` | fatigue ≥ 85 | 6 | officer | 의무대(피로 −15 · 간부 −2) / 참는다(피로 +5 · `MIL_COND_INJURY` 문 열림 4주) |
| `MIL_COND_INJURY` | fatigue ≥ 90 · 참는다 뒤 4주 안 | 20 | — | 허리/무릎 — 2주 선택 없음(휴식) · 감각 −5 · perf note · **능력치 안 건드림** |
| `MIL_COND_CONFLICT_SENIOR` | relation(senior) ≤ −20 | 8 | senior | 사과(관계 +6 사기 −2) / 맞선다(관계 −8 · 동기 +3) |
| `MIL_COND_CONFLICT_OFFICER` | relation(행보관) ≤ −25 | 10 | officer | 호출 — 수긍(관계 +4) / 항변(관계 −6 · **징계 후보**) |
| `MIL_COND_BOND_PEER` | relation(peer) ≥ 35 | 10 | peer | 동기와 밤새 — 사기 +4 · 관계 +3 · 피로 +2 |
| `MIL_COND_MENTOR` | relation(senior) ≥ 35 · rank ≤ 1 | 12 | senior | 선임의 조언 — 사기 +3 · 감각 +1 · 관계 +2 |
| `MIL_COND_JUNIOR_TROUBLE` | junior 재적 · relation(junior) ≤ 0 · rank ≥ 2 | 8 | junior | 감싼다(후임 +8 간부 −2) / 보고(간부 +3 후임 −6) |
| `MIL_COND_MORALE_LOW` | morale ≤ 35 | 8 | — | 전화(사기 +6) / 훈련 몰두(피로 +4 사기 +2 감각 +1) |
| `MIL_COND_REWARD_LEAVE` | rank ≥ 2 · Σrelation(officer) ≥ 40 · 징계 봉쇄 아님 | once ×2 | officer | **포상휴가 4일** — 다음 주 휴가 주 · 사기 +6 감각 +3 |
| `MIL_COND_COMMENDATION` | 직전 perf tier ≤ 2 (perf 마다 한 번) | — | officer | **표창** — award · 사기 +8 · 간부 +5 · 경력 highlight |
| `MIL_COND_PENALTY` | perf tier 6 · 또는 항변 선택 | — | officer | **징계** — penalty · 사기 −8 · 간부 −10 · 포상휴가 8주 봉쇄 |
| `MIL_COND_SNOW` | week 40~48 | 3 | 소단위 | 제설 — 피로 +6 · 소단위 관계 +2 · (선택) 요령: 피로 +2 관계 −1 |
| `MIL_COND_LETTER_CLUB` | ballSense ≤ 45 · once | — | — | 구단/감독 편지 — 사기 +5 · 감각 +2 (militaryHiatusStage 가 프로면 구단, 아니면 감독) |
| `MIL_COND_TEAM_NEWS` | 8주마다 | 8 | — | 소속팀 소식 — 배경 리그 결과를 문안에 인용(복무 중 세상이 돈다) · 사기 ±3 |

### 36-3. 일상 24 — 랜덤 (쿨다운 · 가중) · 역할 게이트

| id | 역할 | 쿨다운 | 대상 | 효과 축 (선택 1~2) |
|---|---|---|---|---|
| `MIL_DAY_VISIT` 면회 | — | 10 | — | 사기 +6 · 감각 +1 / 못 온다: 사기 −2 |
| `MIL_DAY_LETTER` 편지 | — | 6 | — | 사기 +3 |
| `MIL_DAY_PX` PX | — | 4 | peer | 관계 peer +2 · 사기 +2 |
| `MIL_DAY_NIGHT_DUTY` 야간 근무 | — | 8 | senior | 들어 준다(관계 +8 피로 +2) / 존다(관계 −4) |
| `MIL_DAY_GUARD` 위병소 | — | 6 | — | 피로 +3 · 사기 −1 |
| `MIL_DAY_PT_TEST` 체력 검정 | — | 13 | officer | 상위: 간부 +3 사기 +3 / 하위: 피로 +4 |
| `MIL_DAY_UNIT_GAME` 중대 대항전(야구) | — | 12 | peer | 감각 +4 · 피로 +5 · 소단위 +2 |
| `MIL_DAY_SOCCER` 축구 | — | 5 | peer | 피로 +4 · 사기 +3 · 관계 +1 |
| `MIL_DAY_KITCHEN` 취사 지원 | — | 8 | peer(취사병) | 관계 취사병 +4 · 피로 +2 |
| `MIL_DAY_WORK` 작업 | — | 4 | 소단위 | 피로 +5 · 소단위 +1 |
| `MIL_DAY_STORM` 폭우/폭설 | — | 8 | — | 피로 +4 · (겨울이면 `MIL_COND_SNOW` 대신) |
| `MIL_DAY_CHAPEL` 종교 행사 | — | 4 | — | 사기 +2 · 피로 −2 |
| `MIL_DAY_LIBRARY` 병영 도서관 | — | 6 | — | 사기 +2 · 감각 +1(야구 서적) |
| `MIL_DAY_OVERNIGHT` 외박 | — | 12 | peer | 사기 +5 · 감각 +2 |
| `MIL_DAY_CO_VISIT` 지휘관 방문 | — | 10 | officer | 간부 +2 / 실수: −3 |
| `MIL_DAY_RESERVE` 예비군 지원 | — | 14 | — | 피로 +3 · 사기 +1 |
| `MIL_DAY_RANGE` 분기 사격 | — | 13 | officer | 상위 간부 +2 · 하위 없음 |
| `MIL_DAY_WIRE` 유선 가설 | ㉠ | 6 | 선임 통신병 | 관계 +3 · 피로 +4 |
| `MIL_DAY_OPS_NIGHT` 상황실 야근 | ㉠ | 5 | 행보관 | 관계 ±3 (실수 갈래) · 피로 +3 |
| `MIL_DAY_ERRAND` 간부 심부름 | ㉠ | 4 | officer | 관계 +2 · 사기 −1 |
| `MIL_DAY_GUN_MAINT` 포 정비 | ㉡ | 5 | 사수 | 관계 사수 +3 · 피로 +3 |
| `MIL_DAY_AMMO` 탄약 정리 | ㉡ | 5 | 포반장 | 관계 +2 · 피로 +5 |
| `MIL_DAY_PATROL` 진지 순찰 | ㉡ | 6 | 소단위 | 피로 +4 · 관계 +1 |
| `MIL_DAY_SQUAD_MEAL` 포반 회식 | ㉡ | 10 | 소단위 | 소단위 전원 +3 · 사기 +4 |

합 14 + 6 + 16 + 24 = **60 종**. 주 40% × 94주 ≈ 38번 뜨니 쿨다운을 감안하면 반복 없이 찬다(§11 추정과 같다).
`weight` 는 일상 1 · 조건부 2 (조건이 맞으면 일상보다 먼저 보이게) · 성과 연계는 캘린더라 가중이 없다.

## 37. 부대원 골격 — `members.json` 초안 (이름·성격은 빈 칸 · 사용자가 채운다)

조직도 §16 에서 **카드가 있는 자리만**. `subunit` 은 `HQ`(중대본부) · `PLT1`(1소대 본부) · `SQ1`(1포반).
주인공의 소단위는 보직으로 정해진다 — ㉠ `HQ` · ㉡ `SQ1` (같은 소단위가 사람 카드 대상 가중 2배 · §26).
`tags` 는 동작 훅이다: `decides_leave`(휴가 결재) · `grades_perf`(성과 판정 관계 대상) · `ball_partner`(공 카드 문안) · `mentor`.

```json
[
  { "id": "MEM_CO",      "name": "", "rank": "대위", "role": "officer", "subunit": "HQ",   "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 100, "tags": ["decides_leave"] },
  { "id": "MEM_XO",      "name": "", "rank": "중위", "role": "officer", "subunit": "HQ",   "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 100, "tags": [] },
  { "id": "MEM_1SG",     "name": "", "rank": "상사", "role": "officer", "subunit": "HQ",   "trait": "", "relationStart": -5,  "joinWeek": 0,  "leaveWeek": 100, "tags": ["decides_leave", "grades_perf:signal"] },
  { "id": "MEM_SIG_SR",  "name": "", "rank": "상병", "role": "senior",  "subunit": "HQ",   "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 70,  "tags": ["mentor:signal"] },
  { "id": "MEM_SUPPLY",  "name": "", "rank": "일병", "role": "peer",    "subunit": "HQ",   "trait": "", "relationStart": 5,   "joinWeek": 0,  "leaveWeek": 100, "tags": [] },
  { "id": "MEM_COOK",    "name": "", "rank": "상병", "role": "peer",    "subunit": "HQ",   "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 80,  "tags": [] },
  { "id": "MEM_PLT_LDR", "name": "", "rank": "소위", "role": "officer", "subunit": "PLT1", "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 100, "tags": [] },
  { "id": "MEM_PLT_SGT", "name": "", "rank": "중사", "role": "officer", "subunit": "PLT1", "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 100, "tags": [] },
  { "id": "MEM_SQ_LDR",  "name": "", "rank": "하사", "role": "officer", "subunit": "SQ1",  "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 100, "tags": ["grades_perf:mortar"] },
  { "id": "MEM_GUNNER",  "name": "", "rank": "병장", "role": "senior",  "subunit": "SQ1",  "trait": "", "relationStart": -5,  "joinWeek": 0,  "leaveWeek": 30,  "tags": ["mentor:mortar"] },
  { "id": "MEM_ASST",    "name": "", "rank": "상병", "role": "senior",  "subunit": "SQ1",  "trait": "", "relationStart": 5,   "joinWeek": 0,  "leaveWeek": 62,  "tags": [] },
  { "id": "MEM_AMMO_PR", "name": "", "rank": "이병", "role": "peer",    "subunit": "SQ1",  "trait": "", "relationStart": 10,  "joinWeek": 0,  "leaveWeek": 100, "tags": ["ball_partner"] },
  { "id": "MEM_DRIVER",  "name": "", "rank": "상병", "role": "peer",    "subunit": "SQ1",  "trait": "", "relationStart": 0,   "joinWeek": 0,  "leaveWeek": 88,  "tags": [] },
  { "id": "MEM_JR_1",    "name": "", "rank": "이병", "role": "junior",  "subunit": "SQ1",  "trait": "", "relationStart": 5,   "joinWeek": 36, "leaveWeek": 100, "tags": [] },
  { "id": "MEM_JR_2",    "name": "", "rank": "이병", "role": "junior",  "subunit": "HQ",   "trait": "", "relationStart": 5,   "joinWeek": 62, "leaveWeek": 100, "tags": [] }
]
```

- **15장.** 후임 둘은 상병(W36)·병장(W62) 때 온다 — 계급 아크(§38)가 후임 유무를 본다.
- 전역·전출 주(`leaveWeek`)는 실제 복무 주기를 흉내 낸다: 사수 W30 · 선임 통신병 W70 · 부사수 W62 · 조종수 W88.
  그 자리는 **비워 둔다**(자동 보충 없음) — 빈자리가 아크(부사수→사수)를 연다.
- `MEM_SIG_SR` 은 ㉡에게도 보이고 `MEM_GUNNER` 는 ㉠에게도 보인다 — 한 중대다. 다만 카드 대상 가중이 소단위로 갈린다.
- 이름·성격을 비워 두면 `check:militarydata` 가 **경고**(오류 아님) — 문안 없이도 틀은 돈다.

## 38. 계급 아크 · 휴가 · 상벌 — 동작

### 38-1. 계급 띠와 보직 아크

```
띠 (코드 그대로)   W1~8 훈련병·이병(0) · W9~34 일병(1) · W35~60 상병(2) · W61~100 병장(3)
                   진급 주(9·35·61)에 소식 한 통 · 35·61 은 캘린더 필수가 대신한다

㉡ 박격포병        탄약수(입대) → 부사수 → 사수 → 포반장 대행
   부사수   W35 이후 · 조건: 사수 자리(MEM_GUNNER) 비었음(W30 전역) AND relation(MEM_SQ_LDR) ≥ 10  → 조건 이벤트 MIL_ARC_ASST (1 선택 · 관계 포반장 +3)
            조건이 안 맞으면 W45 에 무조건 (문안이 "늦게") — 아크가 막히지 않는다
   사수     W61 진급 주 · 조건: 부사수 AND (perf W16 tier ≤ 4 OR relation(MEM_SQ_LDR) ≥ 20)
            아니면 W75 · 사수면 W68 포사격이 "내 성적"이고 표창 확률 표가 바뀐다
   포반장 대행  W85 이후 · 조건: 사수 AND MEM_JR_1 재적 → 사람 카드 폭 +1 · 후임 관계 이벤트 가중 2배

㉠ 통신병          이병 통신병 → 상황실 근무자(W35) → 중대 통신 담당(W61 · 조건 relation(MEM_1SG) ≥ 10, 아니면 W75)
   담당이면 통신평가 tier −1 보정 · 야간 근무 이벤트 쿨다운 절반(잦아진다) · 사람 카드 폭 +1
```

아크는 `militaryLife.arcStage`(0~3) 한 칸이다. 화면 머리의 보직 라벨이 이 칸을 읽는다.

### 38-2. 휴가

| 종류 | 언제 | 일수 | 조건 | 효과(그 주) |
|---|---|---|---|---|
| 정기 1·2 | W20 · W52 (캘린더) | 10 | 없음 | 선택 없음 · 피로 −20 · 사기 +8 · 감각 +4 (+선택지 보너스 §36-1) |
| 포상 | 조건 이벤트 (§36-2) | 4 | rank ≥ 2 · Σ간부 관계 ≥ 40 · 봉쇄 아님 · 복무 중 최대 2회 | 다음 주가 휴가 주 · 사기 +6 · 감각 +3 |
| 위로 | 조건 이벤트 `MIL_COND_MORALE_LOW` 의 셋째 선택지(once) | 3 | morale ≤ 30 | 사기 +10 · 감각 +1 |

`leaveDays` 누계 → 경력 탭 · 군 경력 한 장. 징계는 **포상휴가 8주 봉쇄**(정기는 안 건드린다 — 규정 휴가).

### 38-3. 표창 · 징계

```
표창   perf tier ≤ 2 → `MIL_COND_COMMENDATION` (perf 마다 최대 1) · 확정 조건: relation(판정 간부) ≥ 20 · 아니면 70% ❓
       효과: award 기록 · 사기 +8 · 간부 전원 +5 · 포상휴가 조건의 Σ관계에 +10 가산 · 경력 highlight
징계   perf tier 6 AND relation(판정 간부) ≤ −10 · 또는 `MIL_COND_CONFLICT_OFFICER` 항변
       효과: penalty 기록 · 사기 −8 · 간부 −10 · 포상휴가 8주 봉쇄 · 경력 기록(전역 뒤 재회 이벤트 문안에 쓴다)
전역 특성  보직 특성 하나(§17) + 표창 ≥ 1 이면 mentality +1 추가 ❓ · 징계 ≥ 2 면 추가 특성 없음
```

perf tier 식(§28)에 **표창·징계 이력은 안 들어간다** — 순환을 막는다(성적 → 표창 → 성적).

## 39. 상무(체육부대) — 같은 탭, 다른 안

### 지금 상무가 코드에서 하는 것 (실측 2026-09-02)

```
경기      없다 — openMilitarySeason 이 "주인공만 경기 없는 52주" 를 연다 (s.schedule = [])
성장      Rust calc_military_week 상무 표: 스태미나 매주 +1 · 회복 +1(25%→100%) · 커맨드 +1(30→50%) · 병장 구속 +1(20%)
이벤트    military_sports 20 + common 14 · 주 40% · 쿨다운 없음
동료      상무 팀 로스터는 **진짜 NPC** 다 (Phase 1/2 선발 · SANGMU_TEAM_IDS) — 관계 축이 이미 있다
화면      MilitaryStatusPanel: 계급 · 부대 · 남은 주 · 진행% · 컨디션 · 피로 · 사기 · 계약 +2년
```

### 병역 탭 넷을 상무가 쓰면

| 2단 | 현역(§22) | **상무** |
|---|---|---|
| 일과 | 자원 셋 · 선택 카드 셋(공/사람/쉼) | 자원 **둘**(체력·멘탈 — 야구 감각은 100 고정 · 막대 없음) · 선택 카드 셋 = **훈련 강도**(강: 성장 확률 ×1.3 피로 +8 / 보통: 표 그대로 / 휴식: 성장 없음 피로 −8) ❓ · 이번 주 이벤트(sports 풀) |
| 부대원 | members.json 카드 | **상무 로스터 NPC 카드** — 기존 `relations` 그대로 · 소단위 대신 포지션 · 전역자는 매년 W48 에 빠지고 신입이 들어온다(Phase 1/2 실제 결과) |
| 캘린더 | 필수 14 + 화천 6 | 공통 필수만(입소·수료·진급 ×3·휴가 ×2·전역 30일·전역 = 9) + **상무 캘린더 4**: W14 전반기 평가전 · W40 후반기 평가전 · W44 혹한기(공통) · W48 전역식(로스터 교체) ❓ 평가전은 경기가 아니라 perf 이벤트(tier = 성장 누적으로 판정) |
| 경력 | perf · 상벌 · 휴가 · 감각 곡선 | **OVR 곡선**(4주 표본) · 평가전 tier · 휴가 · 전역 뒤 "계약 +2년" 표시 그대로 |

- **상태**: `militaryLife` 를 같이 쓰되 `ballSense = 100` 고정 · `roleId = null` · `unitId = "UNIT_SANGMU"`. 부대원은 members.json 이 아니라 로스터에서 파생 — `relations` 도 기존 NPC 관계 축.
- **주간 루프**: §25 순서 그대로, ④만 `calc_military_week`(기존 상무 표)를 부른다 — 훈련 강도 카드가 확률 배율로 들어간다.
  현역과 갈리는 자리는 **Rust 함수 하나**뿐이고 나머지 루프(캘린더·이벤트·소식·저장)는 공유한다.
- **전역**: 감각 100 → 환산 손실 0 · 회복 2주 · 특성 없음(성장을 이미 받았다). 군 경력 한 장에는 OVR 변화·평가전·동료 관계 상위.
- **경기는 넣지 않는다**(퓨처스 참가 등) — 일정·리그 배선이 통째로 붙는 일이라 1.1 밖. 평가전은 perf 이벤트로 흉내 낸다.
- 화면(C)은 **같은 컴포넌트에 분기 넷**이다 — 탭·머리·캘린더 축·경력 카드는 공유하고, 일과의 카드 셋과 부대원의 출처만 갈린다.
  분기 키는 `militaryUnit === "sports"` 하나(탭 유무가 `careerStage` 하나인 것과 같은 규칙).
