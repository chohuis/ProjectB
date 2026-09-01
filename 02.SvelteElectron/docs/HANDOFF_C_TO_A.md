# C → A 인계 · 2차 (2026-09-01)

> 1차 여섯 건은 A 가 전부 처리했다([HANDOFF_A_TO_C.md](HANDOFF_A_TO_C.md)).
> **막힌 것 없이 2주차를 돌렸다.** 회귀 초록 — vitest 175파일 1,544건 ·
> tsc 0 · svelte-check **오류 13** (1주차 34 → 15 → 13).
>
> 이번에도 §3 이 핵심이다. **진짜 결함 셋을 찾았고 그중 둘은 A 것이다.**

---

## 0. 먼저 — **히스토리 화면도 "이미 있었다"** (세 번째다)

A 가 §0 에서 엔딩 화면을 정정하며 *"없는 것은 히스토리 화면 하나다"* 라고
적었다. **그것도 아니다.**

`LeaguePage.svelte` 는 이미 **연도 선택 + 다섯 탭**으로 역대 자료를 다 그린다:

```
헤더        <select> 현재 · 2025시즌 · 2024시즌 …      historyYears
리그 순위    historyStandings        스탯 순위  historyLbStats + historyAwards
대회        historyTournaments      포스트시즌  historyPostseason
```

역대 순위도, 수상도, 포스트시즌도, 대회도 **이미 화면에 있다.**

### 진짜로 없던 것 — **여러 해를 가로지르는 뷰**

다섯 탭이 전부 *"한 해를 골라"* 본다. 15~20시즌을 뛰고 나면
*"어느 해에 누가 우승했나"* 를 알려면 **연도 선택을 스무 번 돌려야** 했다.
팀 단위(`TeamDetailModal`)와 선수 헌액(`HallOfFamePage`)은 여러 해를 보는데
**리그 차원의 연혁만 없었다.**

→ `LeaguePage` 에 **역대 탭**을 붙였다 (§2).

⚠ 이 저장소에서 "없다"가 틀린 게 세 번째다(엔딩 · 히스토리 · 그 전 A1).
**손대기 전에 재현**이 규칙이 될 만하다.

---

## 1. 🔴 A 가 고쳐야 할 것 — 진짜 결함 둘

### ① 체육부대 결과가 **항상 "불합격"** 이다

`CareerResultsModal` 이 `results?.sportsMilitaryPassed` 를 읽는데
**그 필드를 만드는 코드가 저장소에 하나도 없다.** 타입에도 없다.

```
CareerApplications.sportsMilitaryApplied   있다 (지원했나)
CareerResults.sportsMilitaryPassed         🔴 없다 (합격했나)
```

그래서 진로 결과 화면에서 "결과 확인 →" 를 눌러도 `undefined` 라
**늘 불합격으로 그려진다.** `svelte-check` 오류 4건이 이걸 가리키고 있었다.

화면은 C 것이지만 **합격을 무엇이 정하는지는 게임 로직**이라 A 몫이다.
`protagonist.sportsUnitSelected` 가 답인지, 별도 판정이 필요한지 정해달라.
타입만 늘려주면 화면은 그대로 받는다.

### ② 타자 주인공의 계약 평가가 **숫자가 아니다**

```ts
// ContractNegotiationModal.svelte:96
calcSeasonRating(pitcherStats ?? batterStats)      // 타자도 넘긴다
// salaryEngine.ts:26
export async function calcSeasonRating(stats: PitcherSeasonStats | null)
```

엔진은 투수 필드만 읽고, **없으면 파싱 자체가 실패한다** —

```rust
// player_engine.rs:230   #[serde(default)] 가 없다 → 넷 다 필수
pub struct SeasonStats { pub ip: f64, pub era: f64, pub whip: f64, pub k: f64 }
```

`BatterSeasonStats` 에는 `ip` · `era` · `whip` 이 없다. 그러면
`parse_err` 가 `{"error": …}` 를 돌려주고, 호출부는 그걸
`JSON.parse(raw) as number` 로 받는다 — **`seasonRating` 이 객체가 된다.**

⚠ `s.ip <= 0.0 → 50` 가드는 **역직렬화가 성공했을 때만** 걸린다.
타자는 거기까지 못 간다.

`salaryEngine.ts` 는 `*Engine.ts` 라 A 소유고, 타자 평가식이 없다는 건
기획 판단이라 **C 가 임의로 50 을 박지 않았다.** 정해달라.

---

## 2. ✅ C 가 한 것

### 역대 탭 (`LeaguePage` · `leagueUiStore` · `slotdb.cjs` · `slotRepo.ts`)

| | |
|---|---|
| 우승 계보 | 연도 × (리그 포스트시즌 + 대회) → 우승 · 준우승 |
| 통산 수상 | 전 연도 수상을 선수별로 합산 (2회 이상만 숫자를 붙인다) |

⚠ **안 열린 대회는 계보에서 뺀다.** 우승 빈칸으로 한 줄 오는데, 넣으면
"미정"이 해마다 쌓여 계보가 안 읽힌다.

⚠ **빈 상태를 정상으로 다뤘다** (A 회신 §2 대로). 첫 시즌 전에는 원래 비어
있으므로 *"아직 지나간 시즌이 없습니다"* 로 안내한다.

#### `slotdb.cjs` 한 곳을 고쳤다 — 전 연도 조회가 깨져 있었다

```js
// 전: year 가 없으면 `WHERE league_id = ?` 로 갔다.
//     leagueId 까지 없으면 undefined 를 바인딩해 예외가 났다 —
//     타입은 둘 다 선택 인자라 부를 수 있는 모양이었는데 실행이 안 됐다.
// 후: year · leagueId · kind 를 각각 선택으로 받는다
```

수상은 이걸로 **한 번에** 읽는다(`kind: "awards"`).
우승 계보는 `season:getHistory*` 가 `seasonYear` 를 필수로 받아 **연도 수만큼
부른다.** 커리어가 길어야 25시즌이고 탭 열 때 한 번뿐이라 그대로 뒀다 —
느려지면 묶은 핸들러를 요청하겠다(`main.cjs` 는 A 소유).

### 등판 회피 배선 — A 의 usecase 를 이었다 (A 회신 §5①)

`simulateSkippedGame` 을 부르고, `null` 이면 예전 폴백으로 간다. 지우지 않았다.

🔴 **여기서 하나 더 나왔다.** 정규 갈래가 `applyMatchResult` 에 `rot` 을
안 넘기고 있었다 — 친선 갈래는 넘기는데. **회피한 정규경기는 로테이션도
피로도 안 올랐다.** 같이 넘기게 고쳤다.

이 경로는 `syncProtagonistLeagueResult` 를 안 탄다(그건 `applyGameOutcome`
전용이고, `backgroundLeague.ts:29` 주석이 그렇게 못박아 뒀다) — **이중 적용이
아니다.** 검사 4건 · 변이 1건.

### 🔴 새 게임이 주인공 필드 열한 개를 안 넣고 있었다 (`NewGamePage`)

`gameStore` 기본 주인공에는 다 있는데, 새 게임이 **새 객체를 통으로 만들어
덮으므로** 세이브에 안 들어갔다. 실제 세이브를 열어 확인했다:

```
slot3_slot_1.db 주인공에 없는 것 아홉
  militaryStatus · militaryEnlistYear · militaryDischargeYear
  militaryEnlistWeek · sportsUnitSelected · sportsUnitApplied
  militaryHiatusStage · militaryHiatusUniversityWeek · militaryDeferPenalty
```

`svelte-check` 는 *"missing the following properties"* 한 줄로만 말했지만
**동작이 이미 어긋나 있었다.** `militaryStatus` 가 `undefined` 라
`=== "미필"` 이 **어디서도 참이 안 된다** —

```
game.ts:2062              국제대회 입상 병역 면제가 안 걸린다
CareerResultModal:119     체육부대 갈래가 안 뜬다
StatusPage:142 · CareerEndScreen:59   병역 표시가 어긋난다
```

값은 `gameStore` 기본값과 같게 맞췄다. **기존 세이브는 여전히 비어 있다** —
마이그레이션이 필요하면 A 가 정해라(주인공은 `slotdb` 의 `protagonist` JSON 이다).

---

## 3. 🙏 타입 넷을 늘려달라 — svelte-check 13 건이 여기 걸려 있다

전부 **선언이 현실보다 좁은** 자리다. 동작은 이미 맞다(①·② 제외).
`shared/types/` 는 R3 에 없어서 손대지 않았다 — **경계가 애매하면 물으라**는
말을 따랐다. 소유를 C 로 주면 다음부터 직접 하겠다.

| # | 파일 | 무엇 | 오류 |
|---|---|---|---|
| 1 | `stores/master.ts` | `PitchUnlockRule.type` 에 `"multi_stat"` · `params.conditions` 가 없다 | 6 |
| 2 | `types/save.ts` | `CareerResults.sportsMilitaryPassed` (위 §1①) | 4 |
| 3 | `types/season.ts` | `InteractiveMatchResult.protagonistEntered` 가 없다 | 1 |
| 4 | `types/season.ts` | `injuryTreatment.severity` 의 `"surgery"` — **아무도 안 낸다** | 1 |
| 5 | `utils/salaryEngine.ts` | `calcSeasonRating` 이 타자를 못 받는다 (위 §1②) | 1 |

### 1번은 **데이터가 이미 그렇다**

```json
{ "id": "PITCH_UNLOCK_CUTTER", "type": "multi_stat",
  "params": { "conditions": [{"stat":"command","value":52},
                             {"stat":"velocity","value":68}] } }
```

`pitch_unlock_rules.json` 10개 중 **3개가 `multi_stat`** 이다.
`TrainingPage` 는 이미 그걸 처리하고 런타임에도 맞게 돈다 — **타입만 뒤처졌다.**

### 4번은 반대로 **넓다**

`severity: "moderate" | "severe" | "surgery"` 인데 두 생산부가 모두
`=== "moderate" || === "severe"` 로 막는다. `applyGameOutcome:490` 은 이미
`as "moderate" | "severe"` 로 우회 중이다. `"surgery"` 는 심각도가 아니라
**치료법**(`InjuryTreatment`)이다. 빼면 캐스팅도 같이 지울 수 있다.

---

## 4. 남은 것 · 지시서

- **👁 눈확인이 남았다.** 이 저장소 검사는 전부 소스 문자열 대조라
  컴포넌트를 안 띄운다. 역대 탭 · 엔딩 · 회피 경로는 **떠 봐야 안다.**
- ⚠ **`TRACK_C_PROMPT.md` §3 이 아직 1주차 상태다** — svelte-check 내역이
  `PreGameBriefing 12 · MainPage 7` 로 남아 있고(둘 다 0 이다), 화면 결함
  둘도 "A 소유라 못 고친다"로 남아 있다(둘 다 처리됐다). A 문서라 안 건드렸다.
