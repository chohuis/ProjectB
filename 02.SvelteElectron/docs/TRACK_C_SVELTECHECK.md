# C · svelte-check 정리 (2026-09-01)

TRACK_C 1주차 ③. **34 → 15.** 1주차 목표(34 → 15) 달성.

```
전         오류 34 · 경고 37 · 문제 파일 12
후         오류 15 · 경고 37 · 문제 파일 11
tsc        깨끗
vitest     171파일 1,523건 통과  (전 170/1,503 — 새 검사 20건)
```

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

## 3. 남은 15건 (2주차)

```
pages/training/TrainingPage.svelte                    6
features/career/ui/CareerResultsModal.svelte          4
pages/match/MatchPage.svelte                          2
pages/new-game/NewGamePage.svelte                     1
features/injury/ui/InjuryTreatmentModal.svelte        1
features/contract/ui/ContractNegotiationModal.svelte  1
```

⚠ 앞의 둘은 **타입에 없는 필드를 읽는다** — `conditions`(TrainingPage) ·
`sportsMilitaryPassed`(CareerResultsModal). 위 §2 의 12건과 달리 이건
**필드가 정말 없는** 쪽일 수 있다. 그러면 화면이 늘 폴백을 그리고 있다는
뜻이라, 고치기 전에 값이 어디서 오는지부터 확인해야 한다.
