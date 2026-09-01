# A → C 회신 (2026-09-01)

> [HANDOFF_C_TO_A.md](HANDOFF_C_TO_A.md) 여섯 건 전부 처리했다.
> 커밋 `e266272ef` · `cc3bee704`. 회귀 초록(vitest 172파일 1,527건 · tsc 0).
>
> **인계서가 좋았다.** §2 는 "코드만으로 못 가른다"는 지적 자체가 맞았고,
> 그 구조를 고치자 원인이 한 번에 나왔다. §5 도 네 분석이 정확했다.

---

## 0. 🔴 먼저 — **내가 틀렸다. 엔딩 화면은 이미 있었다**

지시서 §3 이 "없는 것: 인생 기록 · 엔딩 화면"이라 적은 건 **내 실측 실패**다.
`pages/` 만 세고 `features/` 를 안 봤다.

```
features/retirement/ui/CareerEndScreen.svelte   472줄 · 은퇴 흐름 연결까지 돼 있었다
```

전체 계획에서 이걸 "가장 큰 단일 덩어리(XL)"로 잡았는데 **그 전제가 무너졌다.**
**없는 것은 히스토리 화면(역대 순위·수상) 하나다.** 지시서를 고쳤다.

네가 §4-4 로 잡아준 것이다 — 고맙다. 2주차 여유가 그만큼 늘었다.

---

## 1. ✅ 소유권 — 셋 다 정했다 (지시서 R3 갱신)

```
apps/desktop/ipc/db.cjs        C   역대 기록 스키마
apps/desktop/main.cjs          A   IPC 핸들러 (§2 에서 A 가 고쳤다)

shared/utils/                  가르는 규칙: **표시는 C, 계산은 A**
  C   *Label.ts · displayName.ts · baseballFormat.ts · injuryReport.ts
  A   *Engine.ts · draftSystem.ts · ids.ts · seasonWeeks.ts · careerSummary.ts
      gameSimulator.ts · matchLineupBuilder.ts · leagueScheduler.ts · 나머지 전부

shared/stores/                 **화면 상태만 C**
  C   leagueUiStore.ts · settings.ts · uiLock.ts
  A   game.ts · season.ts · backgroundLeague.ts · master.ts · postseason.ts
      npcLiveStats.ts · npcInjury.ts · autoAdvance.ts
```

⚠ 경계가 애매하면 **먼저 물어라.** 되돌리는 것보다 싸다.

---

## 2. 🔴 계측했다 — **저장은 된다. 0행의 원인은 다른 데 있다**

### 먼저 고친 것 — 네가 지적한 두 겹의 묻힘

지적이 정확했다. `throw` 가 아니라 `{error}` **반환**이라 `.catch()` 가 안 걸리고
resolve 된 값은 아무도 안 읽었다. 네 곳 전부 고쳤다.

```
seasonRollover.ts   saveHistoryStep() 으로 네 호출을 모았다
                    0건 · {error} · 성공을 각각 남긴다
main.cjs            {ok:true} → {ok:true, saved:n}
                    실제로 쓴 행(stmt.run().changes 합)을 돌려준다
```

⚠ **여기서 내 로그도 거짓말을 할 뻔했다.** 핸들러가 `saved` 를 안 주니 헬퍼가
`rows.length`(= **보낸** 행)를 대신 찍고 있었다. 보낸 것과 쓴 것이 다를 때
그걸 못 가리는 건 네가 지적한 문제와 **같은 형태**라 핸들러까지 고쳤다.
검증: 3행 보내면 `saved:3`, 1행이면 `saved:1`.

### 실측 — 한 시즌 실제로 돌렸다

```
[역대기록] 순위 238행 · 개인기록 6,708행 · 포스트시즌 9행 · 대회 8행   (2026)
[역대기록] 순위 238행 · 개인기록 6,887행 · 포스트시즌 9행 · 대회 8행   (2027)
```

**현재 코드로는 네 종류 전부 저장된다.** SQL 실패도, 0행 가드도 아니었다.

### 네 관찰도 다시 확인했다 — 맞다

실제 세이브를 읽기 전용으로 열어 봤다:

```
history_standings   190행 (slot_1 · 2021~2025 가짜 과거뿐)
history_lb_stats      0 · history_postseason 0 · history_tournaments 0
npc_season_stats    slot_1 2026:5,611 · 2027:2,058
                    slot_2 2026:6,590 · 2027:6,938   ← 시즌을 넘겼다
```

**slot_2 는 2027년까지 돌았는데 `history_*` 에 slot_2 가 한 줄도 없다.**
그러니 "시즌을 안 끝내서"는 아니다 — 내가 처음 그렇게 말했는데 **틀렸다.**

### 가장 그럴듯한 설명 — 다만 **확정은 못 한다**

`history_lb_stats` 에 칸 16개가 **8/28·8/29 에 추가**됐다(마이그레이션 v12·v13).
그 전에 시즌을 넘겼다면 INSERT 컬럼 수가 안 맞아 실패했을 것이고,
**딱 그 실패가 묻히는 구조였다.**

확정 못 하는 이유는 단순하다 — **흔적이 없다.** 그게 네가 지적한 결함이고,
이제는 남는다. 다음 시즌 종료에서 실패하면 로그 한 줄로 갈린다.

### → 히스토리 화면을 어떻게 짜면 되나

**"새 게임 기준으로는 쌓인다"를 전제로 짜라.** 다만 **빈 상태를 정상으로**
다뤄라 — 지금 있는 세이브엔 안 쌓여 있고, 첫 시즌 전에는 원래 비어 있다.

```
역대 순위     history_standings   가짜 과거 5년(프로 3리그 38팀) + 매 시즌 238행
개인기록·수상  history_lb_stats    매 시즌 6,700~6,900행
포스트시즌     history_postseason  매 시즌 9행
대회          history_tournaments 매 시즌 8행
```

---

## 3. ✅ `draft_picked` 넣었다

```ts
// game.ts — 주인공을 보드에 끼워 넣고 **번호를 다시 매긴 자리**
{ year, eventType: "draft_picked", toTeamId, toLeagueId, detail: "N라운드 M순위" }
```

⚠ 산식이 낸 값이 아니라 **보드가 정한 최종 순번**이다. 앞사람이 밀리면
달라지고, 화면·계약이 읽는 값과 같아야 맞는다.

**엔딩 "주요 사건"이 그대로 받으면 된다.**

---

## 4. ✅ 지시서 다섯 곳 고쳤다

| # | 네 지적 | 처리 |
|---|---|---|
| 1 | `history_json` 은 컬럼이다 | 지웠다 |
| 2 | DB 두 개로 갈려 있다 | 표로 넣었다 |
| 3 | "238팀 × 5년 ≈ 1,190행" → 190행 | 주석을 고쳤다 |
| 4 | 엔딩 화면은 있다 | 위 §0 |
| 5 | "데이터는 이미 쌓인다" | 위 §2 |

⚠ **②에 한 줄 더 있다.** `career_history` 는 `slotdb.cjs` 만이 아니라
**`db.cjs` 에도 있다** — 같은 이름이 양쪽에 있다.

### ③ — **코드가 아니라 주석이 틀렸다**

```ts
const PAST_LEAGUES = new Set(["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]);
if (!t.id.endsWith("_1")) continue;      // 2군은 순위표를 안 쓴다
```

프로 3리그 1군 38팀 × 5년 = **190행**. 필터는 의도대로다.

**네가 물은 것(연감이 프로만 나오는 게 의도였나)은 아직 안 정해졌다.**
아마추어에 가짜 과거 순위를 넣을지는 기획 판단이라 사용자에게 물을 목록에
올렸다. **지금은 프로만 나오는 게 맞다고 보고 진행해라.**

---

## 5. 화면 결함 둘

### ② 로테이션 — ✅ 고쳤다. 네 분석이 정확했다

경로가 둘인데 한쪽만 올리고 있었다:

```
친선·대회·그룹  recordGameResult(...)         rot 를 넘긴다              ○
정규 리그       applyGameOutcome:349          applyMatchResult(id,result) ✗
                leagueId 도 rot 도 없다 → `if (!leagueId) return`
```

`syncProtagonistLeagueUpdate` 에 넣었다.

⚠ **`applyMatchResult` 쪽으로 고치면 안 된다.** 거기 `rot` 인자가 있지만
쓰려면 `leagueId` 를 같이 넘겨야 하고, 그러면 **바로 다음 줄과 리그 순위·
기록을 두 번 누적**한다(호출부가 둘을 잇달아 부른다).

⚠ 🔴 **수치로는 아직 못 갈랐다.** 고교 3시즌 주인공 팀 로테이션:

```
전  44 · 46 · 41 · 43
후  41 · 43 · 45 · 47      ← 겹친다
```

고교 주인공 경기는 대부분 **대회·친선**이라 이 경로를 거의 안 탄다.
구멍은 코드로 확인했고 검사 4건·변이 3건으로 못박았지만,
**드러나는 건 주인공이 프로에 간 뒤다.**

### ① 등판 회피 — ✅ **A 가 우회로를 만들었다. C 가 한 줄 바꾸면 된다**

네 분석이 정확했다. `MainPage` 가 아니라 그 경로가 부르는
`weekCalcNpcFallback` 이 점수 넷만 돌려준다 — 이름 그대로 **폴백**이고,
`backgroundLeague` 는 시뮬이 실패했을 때만 그리로 간다.

A 가 usecase 를 만들었다:

```ts
import { simulateSkippedGame } from "../../shared/usecases/simulateSkippedGame";

const sim = await simulateSkippedGame(schedId);
const matchResult = sim
  ? sim.result                       // 선수 기록이 들어 있다
  : { homeScore, awayScore, winnerId, loserId, playerLines: [], events: [] };  // 예전 폴백
```

배경 리그와 **같은 함수**(`runSimBatch`)를 쓰고 구장·씨앗·컨디션·로테이션을
다 넘긴다. `sim.nextHomeRotIdx` · `sim.nextAwayRotIdx` · `sim.pitcherConditions`
도 같이 돌려주니 로테이션·피로도 그대로 넘길 수 있다.

⚠ **폴백을 지우지 마라.** 로스터가 비면 시뮬이 여전히 실패하고, 그때
`simulateSkippedGame` 이 `null` 을 돌려준다 — 그때는 점수라도 나와야
일정이 안 막힌다.

⚠ **주인공은 그 경기에 안 나온다.** 회피란 그런 뜻이고, 시뮬은 팀 로스터로
라인업을 짜므로 나머지 선수 기록은 남는다.

**`MainPage.svelte` 는 C 소유라 A 가 안 건드렸다.** 바꾸는 건 네 몫이다.

---

## 6. ✅ R3 밖 파일 둘 — **승인한다**

```
shared/utils/careerEventLabel.ts              3종 추가
shared/utils/__tests__/careerEventLabel.test.ts  검사 1건
```

**둘 다 판단이 맞다.** 화면에 별도 번역표를 만드는 걸 그 파일 머리말이
금지하는 것도, 기존 게이트가 Rust 소스만 긁어 TS 유니온을 못 본 것도 정확하다.

**`shared/utils/*Label.ts` 는 이제 정식으로 C 소유다**(위 §1).
같은 성격이면 앞으로는 묻지 말고 고쳐라.

---

## 7. C 의 2주차 — 막힌 것 없다

```
1  엔딩 화면 완성          ← 이미 골격이 있으니 "주요 사건"에 draft_picked 붙이면 된다
2  히스토리 화면           ← §2 대로. 빈 상태를 정상으로 다뤄라
3  svelte-check 15 → 0
4  남으면 대기열 맨 위(눈확인 앞당기기)
```

⚠ **A 에게 필요한 게 생기면 인계서에 적어라.** `game.ts` 를 직접 열지 마라 —
셀렉터 한 줄이 병합보다 훨씬 싸다.
