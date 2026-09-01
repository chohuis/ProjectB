# C · svelte-check 정리 (2026-09-01)

TRACK_C ③. **34 → 15 → 13.**

```
1주차 시작   오류 34 · 경고 37 · 문제 파일 12
1주차 끝     오류 15   (목표 34 → 15 달성)
2주차 현재   오류 13 · 경고  0 · 문제 파일 5
tsc          깨끗
vitest       175파일 1,544건 통과
```

**남은 13건은 전부 A 소유·미지정 타입이다**(§3). C 가 손댈 수 있는 것은
다 했다.

---

## 1. 🔴 19건 중 **하나는 진짜 결함이었다**

지시서 §3 이 *"이 중 셋은 동작이 이미 어긋났을 수 있다"* 고 경고했다.
하나씩 봤다. **셋이 아니라 하나다.** 나머지 18건은 타입 넓힘이라
런타임 영향이 없었다. 그 하나가 이것이다.

### `tabForPending` 이 유형 둘을 안 덮었다 — `MainPage.svelte:59`

`svelte-check` 는 한 줄로만 말했다:
*"Function lacks ending return statement."* 타입 잔소리처럼 보인다.

실제로는 **`PendingAction` 이 17종인데 `case` 가 15개**였다.
`injuryTreatment` · `conditionWarning` 이 빠져 있었고, 그 둘이 다음
순번이면 함수가 `undefined` 를 냈다. 그 값이 두 군데로 흘렀다 —

| 흐른 자리 | 결과 |
|---|---|
| `pendingByTab` (`acc[tab]`) | 키가 `undefined` 가 되어 **내비 배지가 안 뜬다** |
| `openPendingFromNext` | `currentTab = undefined` 를 박는다 |

둘 다 최상위 모달이라 **창은 떴다.** 그래서 눈에 안 띄었다 —
어긋난 건 내비 쪽이다.

#### 다시 안 생기게 두 겹으로 막았다

```ts
    const _exhaustive: never = action;   // 유형이 늘면 컴파일이 깨진다
    void _exhaustive;
    return "news";                       // 런타임 폴백 — undefined 를 못 낸다
```

`season.ts` 의 `_MissingPendingType` 과 같은 수법이다. 거기에
`PENDING_ACTION_TYPES` 를 그대로 긁어 `case` 존재를 확인하는 검사
(`pages/__tests__/mainTabForPending.test.ts`, 20건)를 더했다.
**목록을 손으로 안 적는다** — 적으면 유형이 늘 때 검사가 검사를 안 하게 된다.

변이 검증: `case` 하나를 빼면 `svelte-check` 와 `vitest` 가 **각각** 실패한다.

---

## 2. 나머지 18건 — 타입 넓힘 둘

### `PreGameBriefingModal` 12건 — `?? {}` 가 타입을 지웠다

```ts
const live = npcLiveStats[id]?.batting ?? {};   // → BattingAttributes | {}
```

`{}` 쪽에는 필드가 없으니 뒤따르는 여덟 줄이 전부
*"Property 'contact' does not exist on type '{}'"* 였다. 투수 쪽 넷도 같다.

⚠ **먼저 확인한 것** — 읽는 12개 필드가 `BattingAttributes` ·
`PitchingAttributes` 에 **실제로 다 있는지** 봤다. 하나라도 없으면
타입 문제가 아니라 **값이 영원히 폴백으로 가는 결함**이다. 다 있었다.

고침: 변수에 `Partial<BattingAttributes>` 를 붙였다. 값은 그대로다.

### `MainPage` 6건 — 선언에 없는 칸을 읽고 있었다

엔진 응답을 인라인 타입으로 파싱하는데 `inning` · `half` 가 선언에 없었다.
색인 서명(`[key: string]: unknown`)에 걸려 `unknown` 이 되고, `EntryInfo` 가
요구하는 `number` · `string` 과 어긋났다.

고침: 읽는 칸을 선언에 넣고 `?? 0` · `?? ""` 를 줬다.
**`as number` 로 안 덮었다** — 엔진이 안 주면 0회 0:0 으로 드러나야 한다.

같은 파일 `GameStatusModal.svelte:29` 에 이 계열의 선례가 적혀 있다 —
*"타입 블록이 instance `<script>` 에 있어 `{}` 로 추론되는 바람에 검사가
통과하고 있었다."*

---

## 3. 2주차 — 15 → 13. **나머지는 A 를 기다린다**

```
전(1주차 끝)   15
NewGamePage    1 → 0   🔴 진짜 결함이었다 (아래)
MatchPage      2 → 1   반환 타입에 `name` 이 빠져 있었다 (C 파일)
남은 것        13      전부 A 소유·미지정 타입 선언
```

### 🔴 또 하나가 진짜 결함이었다 — `NewGamePage`

*"Type … is missing the following properties from ProtagonistSave"* 한 줄.
타입 잔소리로 보이지만, **새 게임이 주인공 필드 열한 개를 안 넣고 있었다.**

`gameStore` 기본 주인공에는 다 있는데 새 게임이 **새 객체를 통으로 만들어
덮으므로** 세이브에 안 들어갔다. 실제 세이브를 열어 아홉 개가 없는 것을
확인했다 — `militaryStatus` 가 그중 하나다.

```
militaryStatus 가 undefined  →  `=== "미필"` 이 어디서도 참이 안 된다
   game.ts:2062            국제대회 입상 병역 면제가 안 걸린다
   CareerResultModal:119   체육부대 갈래가 안 뜬다
   StatusPage:142          병역 표시가 어긋난다
```

⚠ **기존 세이브는 여전히 비어 있다.** 마이그레이션은 A 판단이다.

### 남은 13건 — 선언이 현실보다 좁다(또는 넓다)

| 파일 | 무엇 | 수 |
|---|---|---|
| `stores/master.ts` | `PitchUnlockRule` 에 `multi_stat` 이 없다. **데이터 10개 중 3개가 그것이다** | 6 |
| `types/save.ts` | `CareerResults.sportsMilitaryPassed` — 🔴 **만드는 코드가 없다** | 4 |
| `types/season.ts` | `InteractiveMatchResult.protagonistEntered` 가 없다 | 1 |
| `types/season.ts` | `severity` 의 `"surgery"` — **아무도 안 낸다**(넓다) | 1 |
| `utils/salaryEngine.ts` | `calcSeasonRating` 이 타자를 못 받는다 — 🔴 **엔진 파싱이 깨진다** | 1 |

`shared/types/` 는 R3 에 없다. **경계가 애매하면 물으라**는 A 의 말을 따라
[HANDOFF_C_TO_A.md](HANDOFF_C_TO_A.md) §3 으로 넘겼다.

### 1주차에 세운 가설 둘 중 하나만 맞았다

*"TrainingPage 의 `conditions` 와 CareerResultsModal 의
`sportsMilitaryPassed` 는 필드가 정말 없는 쪽일 수 있다"* 고 적었다.

```
conditions            데이터에 있다 — 타입만 뒤처졌다. 동작은 맞다
sportsMilitaryPassed  🔴 정말 없다 — 화면이 늘 "불합격"을 그린다
```

**둘을 같은 통에 넣지 않은 게 맞았다.** 고치기 전에 값이 어디서 오는지
본 것이 갈랐다.

---

## 4. 경고 37 → 1 (대기열 2·3번)

주차 일감이 끝나 [TRACK_C_PROMPT §5](TRACK_C_PROMPT.md) 대기열 위에서부터 집었다.

| 무엇 | 수 |
|---|---|
| MainPage 죽은 CSS (대기열 3번) | 22 → 0 |
| 모달 오버레이 — `role="dialog"` 인데 초점·키보드가 없었다 | 4 → 0 |
| 더블클릭 행 다섯 — 비의미 `div` 라 역할이 없었다 | 5 → 0 |
| 일정 주차 행 · 새 게임 라벨 셋 | 5 → 0 |
| `SeasonEndModal.onExit` 미사용 | 1 → 0 (§5 — 흐름을 닫았다) |

### MainPage 죽은 CSS 161줄 — **손으로 지웠다**

대기열이 *"스크립트가 미디어 쿼리를 깨뜨린다. 손으로"* 라고 적어 뒀다.
왜 그랬는지 보였다 — `@media` 와 `:global` 이 **죽은 블록 바로 앞**에 있다.
범위를 넓게 잡은 스크립트는 그걸 같이 먹는다.

지우기 전에 셋을 확인했다.

```
① 18개 클래스 이름이 MainPage 마크업·스크립트에 몇 번 나오나   전부 0
② 죽은 블록(741~900) 안에 @media · :global 이 있나            없다
③ 블록 안 선택자가 전부 경고 목록에 있나                       21/21
```

마크업은 `GameStatusModal.svelte` 로 옮겨갔고 **그 컴포넌트가 자기 스타일을
갖는다.** Svelte 는 스타일을 컴포넌트에 가두므로 부모에 남은 이 규칙들은
자식에 애초에 안 닿았다 — 지운 자리에 그렇게 적어 뒀다.

### a11y — 고치면서 실제로 쓸 수 있게 했다

경고를 끄는 게 아니라 길을 내는 쪽으로 갔다.

- 모달 오버레이: `tabindex="-1"` + 요소에도 `on:keydown`.
  Esc 는 `svelte:window` 가 이미 받지만 `close()` 가 멱등이라 겹쳐도 된다
- 더블클릭 행: `role="button"` · `tabindex="0"` · **Enter 로도 열린다.**
  전에는 더블클릭 말고 길이 없었다. `title` 도 그렇게 고쳤다
- 일정 주차 행: 인라인 식을 `goWeek()` 로 뺐다 — 키보드 길을 붙이며
  같은 식이 두 벌이 될 뻔했다. 어긋나면 마우스와 키보드가 다른 주로 간다
- 새 게임 라벨 셋: `<label>` 이 아니라 `role="group"` + `aria-labelledby`.
  입력 하나가 아니라 **묶음**을 가리키므로 `for` 로는 못 맞춘다

---

## 5. ✅ 마지막 경고 하나는 **닫히지 않은 흐름이었다**

`SeasonEndModal` 이 `export let onExit` 을 선언만 하고 **한 번도 안 불렀다.**
배선은 끝까지 이어져 있었다 —

```
App.svelte:120     <MainPage onSeasonEnd={() => (phase = "intro")} />
MainPage:510       <SeasonEndModal onExit={onSeasonEnd} />
SeasonEndModal:25  export let onExit    ← 여기서 끊겼다
```

그 모달의 유일한 출구는 "새 시즌 시작"이다. 은퇴도 마찬가지여서,
결산을 닫으면 **은퇴한 주인공인 채로 메인 화면에 남았다.**
게임 안에 타이틀로 돌아가는 길이 하나도 없었다.

⚠ 3주차 기준이 **"고교 입학 → 은퇴 → 엔딩까지 한 커리어 완주"** 인데
엔딩 뒤가 없으면 완주가 성립하지 않는다.

### 사용자 확정 — **둘 다 준다**

```
[ 커리어 결산 ]
  ...
        [ 둘러보기 ]   [ 마치기 → 타이틀 ]
```

| 버튼 | |
|---|---|
| 둘러보기 | 결산만 닫는다. 메인에 남아 역대 탭·명예의 전당을 계속 본다 |
| 마치기 | `onExit` → `MainPage` → `App` 의 `phase = "intro"` |

⚠ **`나 > 상태` 에서 다시 열 때는 `onExit` 을 안 넘긴다.** 기록을 다시 보러
온 것이라 거기서 타이틀로 튕기면 안 된다. 없으면 버튼을 안 그리고 라벨도
"닫기"로 남는다.

⚠ **`SeasonEndModal` 의 `onExit` 은 되살리지 않았다.** 시즌 종료는 커리어
종료가 아니다. 검사가 그걸 못박는다 — 되살리면 실패한다.

검사 5건 · 변이 2건(배선 제거 · 죽은 prop 되살리기) 전부 죽었다.
