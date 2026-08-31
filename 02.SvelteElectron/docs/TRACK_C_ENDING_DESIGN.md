# C · 엔딩 화면 설계 (2026-09-01)

TRACK_C 1주차 ②. 재료 조사는 [TRACK_C_HISTORY_AUDIT.md](TRACK_C_HISTORY_AUDIT.md).

---

## 1. 🔴 엔딩 화면은 **이미 있었다**

TRACK_C_PROMPT §3 은 *"없는 것 — 인생 기록 · 엔딩 화면 · 히스토리 화면"*
이라고 적었다. 실제로는 `features/retirement/ui/CareerEndScreen.svelte` 가
**419줄로 있었고, 검사도 8건 있었고, 두 곳에 연결돼 있었다.**

그 화면의 머리말이 같은 함정을 이미 적어 뒀다 —

> 🔴 백로그가 A1을 "미구현"으로 적었지만 **화면은 이미 있었다**(299줄).
> 이 세션에 "이미 닫혀 있던 것"을 다섯 번 만났다 — 손대기 전에 재현부터.

그래서 갈아엎지 않고 **모자란 덩어리만 붙였다.**

### 은퇴 흐름은 끊긴 데가 없다

```
advanceWeek.ts:527  부상 → pendingAction "retirementAsk"
advanceWeek.ts:1186 노쇠 → 같은 것
        ↓
MainPage.svelte:531  RetirementAskModal
        ↓  "은퇴한다"
retirement.ts:180    retireProtagonist(reason)
        ↓
CareerEndScreen      결산 (자동으로 한 번)
        ↓
StatusPage.svelte:736  나 > 상태에서 다시 열기
```

`voluntary` · `decline` · `injury` 세 사유가 모두 화면 `REASON` 표에 있다.
빠진 사유 없다.

---

## 2. 세 덩어리 대조 — 하나가 통째로 비어 있었다

사용자 확정: **복잡하지 않게.** `커리어 요약` · `통산 기록` · `주요 사건`.

| 덩어리 | 있었나 | 재료 |
|---|---|---|
| 커리어 요약 | ✅ | 머리말 · 우승 · 소속 이력 (`teamStintsOf`) |
| 통산 기록 | ✅ | `careerTotalsOf` · `careerHighsOf` · `awardTallyOf` · 연도별 |
| **주요 사건** | ❌ **없음** | `protagonist.careerEvents` |

`careerEvents` 는 **쌓이고 있었는데 화면이 한 번도 안 읽었다.**
드래프트·트레이드·입대·전역·병역 면제·졸업·은퇴가 전부 저장만 되고
결산 어디에도 안 나왔다.

### 주인공에게 실제로 쌓이는 사건 7종 (호출부 실측)

| 유형 | 어디서 | 담기는 것 |
|---|---|---|
| `graduation` | `careerDecision.ts:93` | 전공 · 학점 · 대안 경로 |
| `fa_signed` | `contractDecision.ts:169` | 간 팀 · 리그 |
| `trade` | `contractDecision.ts:236` | 떠난 팀 → 간 팀 |
| `military_enlist` | `militaryDecision.ts:45` | 떠난 팀 · 부대 |
| `military_discharge` | `militaryDecision.ts:127` | 복귀 팀 |
| `military_exempt` | `game.ts:2067` | 국제대회 입상 |
| `retirement` | `retirement.ts:191` | 마지막 팀 · 사유 |

⚠ **`draft_picked` 는 주인공에게 안 쌓인다.** 타입에는 있고 NPC 는 받는데
(`draftSystem.ts`), 주인공 지명은 Rust `determine_protagonist_draft` 가 정하고
`addCareerEvent` 를 안 부른다. **커리어에서 제일 큰 사건이 결산에 안 나온다.**
`usecases/` 라 C 가 못 고친다 — A 에게 넘겼다.

---

## 3. 붙인 것

### ① 주요 사건 절 (`CareerEndScreen.svelte`, +53줄)

연도 오름차순으로 `연도 · 유형 · 팀 이동 · 사유` 한 줄씩.

### ② 🔴 이 절만 `records.length === 0` **바깥**에 둔다

여기가 이 설계의 핵심이다.

통산 표는 기록이 없으면 *"정규 시즌 기록을 남기지 못하고 선수 생활을
마쳤습니다"* 한 문장으로 **대체**된다. 그런데 —

> **사건은 시즌 밖에서도 일어난다.** 대학 졸업 · 입대 · 병역 면제는 출전
> 기록이 한 줄도 없는 해에 남는다.

사건 절을 그 `{:else}` 안에 두면 **아마추어에서 그만둔 커리어의 결산이
통째로 한 문장이 된다** — 졸업도 중단도 다 저장돼 있는데도.

검사 `"통산 기록 분기 **바깥**에 있다"` 가 이 구조를 못박는다.
안으로 옮겨서 실패하는 것을 확인했다(변이 검증).

### ③ 라벨 표의 빈 세 자리

`careerEventLabel.ts` 에 `military_exempt` · `graduation` · `quit_baseball`
이 **없었다.** 폴백이 밑줄만 띄어쓰기로 바꾸므로 결산에 **"military exempt"**
라고 뜰 자리였다.

그 파일의 게이트에 사각지대가 있었다 — **Rust 소스만 긁는다.**
위 셋은 TS 가 내므로 게이트를 그냥 통과했다. `NpcCareerEventType` 유니온도
긁는 검사를 더해 막았다. 라벨 하나를 빼서 실패하는 것을 확인했다.

---

## 4. 검사

```
npx vitest run       170파일 1,503건 통과
npx tsc --noEmit     깨끗
npx svelte-check     오류 34 · 경고 37  ← 기준선 그대로. 늘지 않았다
```

새로 붙인 검사 6건 (결산 5 · 라벨 게이트 1), 변이 검증 2건 통과.

---

## 5. 남은 것 — 2주차

1. **👁 눈으로 봐야 한다.** 이 저장소의 검사는 전부 소스 문자열 대조라
   **컴포넌트를 띄우지 않는다.** 실제로 은퇴까지 가서 봐야 한다.
   지시서 §2 가 못박은 대로 **기존 세이브 말고 새 게임으로.**
   ⚠ 현재 세이브는 고교 1학년 6주차라 `careerRecords` 도 `careerEvents` 도
   비어 있다 — 띄워도 빈 화면만 보인다
2. `draft_picked` 주인공 경로 (A 대기)
3. 사건이 많은 커리어(15~20시즌)에서 절이 길어지는지 — 필요하면 접기
