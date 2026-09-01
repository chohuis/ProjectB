# C · 역대 기록 실적재 조사 (2026-09-01)

TRACK_C 1주차 ①. **엔딩 화면을 그리기 전에 재료를 확인한다.**
결론부터 — **`history_*` 는 엔딩 화면의 재료가 아니다.** 재료는
`protagonist.careerRecords` 다.

조사는 전부 읽기 전용이다. 고친 파일 없다.

---

## 1. 문서가 틀린 곳 두 가지

> TRACK_C_PROMPT: *"⚠ 네가 봐서 문서와 다르면 문서가 틀린 것이다. A 에게 알려라"*

### ① `history_json` 은 테이블이 아니다

`db.cjs` 의 **`chat_history_json` 컬럼**이다. 테이블 목록에 없다.

### ② 여섯 테이블은 **DB 두 개로 갈려 있다**

| 테이블 | 파일 | 실제 DB |
|---|---|---|
| `history_standings` `history_lb_stats` `history_postseason` `history_tournaments` | `apps/desktop/ipc/db.cjs` | `projectb_v2.db` |
| `career_history` `history_league` | `apps/desktop/ipc/slotdb.cjs` | `slot3_slot_1.db` |

🔴 **`db.cjs` 는 R2(A 잠금)에도 R3(C 소유)에도 없다.** 네 개 중 네 개가 거기
있으므로, 엔딩 화면이 저장 쪽을 건드려야 하면 소유권을 먼저 정해야 한다.
`slotdb.cjs` 만 내 것이다.

---

## 2. 실제로 쌓인 것 — 여섯 중 하나뿐

세이브: `%APPDATA%\Electron\saves\` (라이브).
`projectb-desktop\saves\` 도 있으나 **06-05 이후 비어 있는 폐기본**이다.

```
history_standings       190 행   ← 이것뿐
history_lb_stats          0
history_postseason        0
history_tournaments       0
career_history            0
history_league            0
```

그리고 그 190 행마저 **플레이 산물이 아니다.**

```
slot_1  2021~2025년 × (ABL 16 + JBL 12 + KBL 10) = 38팀 × 5년 = 190
```

`newGameV3.ts:603` 이 새 게임 때 심는 **가짜 과거 5년**이다. 현재 시즌은
2026년 6주차 · 고교리그인데 **2026년 행은 없다.**

⚠ 심는 양도 코드 주석과 다르다 — 주석은 *"238팀 × 5년 ≈ 1,190행"* 인데
실제로는 프로 3리그 38팀만 들어가 **190행, 예상의 1/6** 이다.

### 진짜로 쌓이는 곳은 따로 있다

```
npc_season_stats     21,197 행   (projectb_v2.db)
   slot_1  2026년 5,611 · 2027년 2,058
   slot_2  2026년 6,590 · 2027년 6,938
```

선수별 시즌 성적은 **여기** 쌓인다. 읽는 문은 `npc:getCareerStats` 다.

---

## 3. 🔴 저장 실패가 두 겹으로 묻힌다

`history_*` 가 비어 있는 이유를 **코드만 봐서는 못 가른다.** 그게 결함이다.

```js
// apps/desktop/main.cjs — 예외를 던지지 않고 되돌려준다
catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }

// apps/ui/src/shared/usecases/seasonRollover.ts:429 — 돌려받은 값을 안 읽는다
window.projectB!.seasonSaveHistoryStandings(...).catch(() => {});
```

핸들러가 `throw` 대신 `{error}` 를 **반환**하므로 `.catch()` 는 애초에 안 걸리고,
resolve 된 값은 아무도 안 본다. **저장이 실패해도 화면에도 로그에도 안 나온다.**

### 못 가르는 두 갈래

`saveSeasonHistory` 는 `runWorldSeasonEnd:123` 한 곳에서만 불린다.
바로 앞줄 122 의 `flushAllLeagueStatsToDb` 는 **같은 자료**(`leagueState[*].stats`)
를 읽는데, 이쪽은 2027년 행을 남겼다. 즉 122 는 돌았다.

그런데 123 의 산물이 한 줄도 없다. 남는 설명은 둘이다 —

1. `standingRows` / `lbStatRows` 가 0 이라 `length > 0` 가드에 걸려 건너뛰었다
2. 호출은 나갔고 SQL 단계에서 실패했는데 위 두 겹에 묻혔다

**스키마는 무죄다.** `history_lb_stats` 의 INSERT 48개 컬럼과 실제 테이블
48개 컬럼이 이름·개수 모두 정확히 일치하고, NOT NULL·기본값 없는 컬럼 중
빠진 것도 없다. 대조해서 확인했다.

→ **A 에게 넘긴다.** `seasonRollover.ts` 는 내 소유가 아니고, 가르려면
게임을 실제로 한 시즌 돌려 계측해야 한다.

---

## 4. 그래서 엔딩 화면의 재료는 무엇인가

`history_*` 가 아니라 **주인공 저장본 안**이다. `types/save.ts` 기준 —

| 엔딩의 세 덩어리 | 재료 | 타입 |
|---|---|---|
| 커리어 요약 | `protagonist.careerRecords` | `CareerSeasonRecord[]` (:360) |
| 통산 기록 | 같은 배열을 합산 | `stats?: PlayerSeasonStats` |
| 주요 사건 | `protagonist.careerEvents` | `NpcCareerEvent[]` |

```ts
interface CareerSeasonRecord {
  year, leagueId, teamId
  rank?, totalTeams?, wins?, losses?, draws?
  statLine: string          // 표시용 한 줄
  ovr: number
  awards: CareerAward[]     // { id, label, value? }
  psResult?: "champion" | "runnerUp" | "semiFinal" | "notQualified"
  stats?: PlayerSeasonStats
  gameLog?: CareerGameLogEntry[]
}

interface NpcCareerEvent { year, eventType, fromTeamId?, toTeamId?, ..., detail? }
```

쓰는 쪽은 `seasonCareerRecord.ts:76 applyProtagonistSeasonRecord(year)` 이고
`runWorldSeasonEnd:128` 이 매 시즌 부른다. **`history_*` 와 달리 이건 IPC 를
안 타므로 위 3번의 묻힘 문제가 없다.**

⚠ 다만 **현재 세이브에는 `careerRecords` 키 자체가 없다.** 주인공이 2026년
고교 1학년 6주차 — 아직 첫 시즌도 안 끝났다. 필드는 `?` 선택이므로
**엔딩 화면은 빈 배열을 정상 상태로 다뤄야 한다.**

은퇴 판정은 `careerStatus: "retired"` (`NpcCareerStatus` = active | military |
injured | retired | free_agent, :772).

---

## 5. 다음

- ② 엔딩 화면 골격을 `careerRecords` 기준으로 짠다. `history_*` 는 안 쓴다
- 3번(저장 묻힘)과 1번(`db.cjs` 소유권)은 A 에게 확인받는다
