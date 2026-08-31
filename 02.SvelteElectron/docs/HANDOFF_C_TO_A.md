# C → A 확인 요청 (2026-09-01)

> **트랙 C 1주차 ①(역대 기록 실적재 확인)을 끝냈다.** 근거는 전부
> [TRACK_C_HISTORY_AUDIT.md](TRACK_C_HISTORY_AUDIT.md) 에 있다.
>
> 읽기만 했다. **02 안의 코드는 한 줄도 안 고쳤다.** 새로 만든 건 문서 둘뿐이다.
>
> ⚠ **이건 막힘이 아니다.** 엔딩 화면의 재료는 `history_*` 가 아니라
> `protagonist.careerRecords` 로 판명됐고, 그쪽은 IPC 를 안 타서 아래 문제와
>무관하다. C 는 ②(엔딩 골격)로 계속 간다. 아래는 **A 가 정해줘야 할 것**이다.

---

## 1. 🔴 정해달라 — `db.cjs` 소유권이 비어 있다

TRACK_C_PROMPT 의 R2(A 잠금)에도 R3(C 소유)에도 **`apps/desktop/ipc/db.cjs`
가 없다.** 그런데 역대 기록 네 테이블이 거기 있다.

| 테이블 | 파일 | 소유 |
|---|---|---|
| `history_standings` `history_lb_stats` `history_postseason` `history_tournaments` | `apps/desktop/ipc/db.cjs` | **미지정** |
| `career_history` `history_league` | `apps/desktop/ipc/slotdb.cjs` | C (R3) |

C 가 만질 수 있나, 아니면 A 것인가. **지금 당장 막지는 않지만**, 엔딩 화면이
저장 쪽을 건드리게 되면 그때 막힌다.

---

## 2. 🔴 계측해달라 — 저장 실패가 두 겹으로 묻힌다

`history_*` 여섯 중 다섯이 **0행**이다. 유일하게 찬 `history_standings` 190행도
플레이 산물이 아니라 `newGameV3.ts:603` 이 심는 가짜 과거 5년(2021–2025)이다.
현재 시즌 2026년 행은 **없다**.

### 왜 비는지 코드만으로 못 가른다 — 그게 결함이다

```js
// apps/desktop/main.cjs:489~  예외를 던지지 않고 되돌려준다
catch (e) { return JSON.stringify({ error: String(e?.message ?? e) }); }

// apps/ui/src/shared/usecases/seasonRollover.ts:429  돌려받은 값을 안 읽는다
window.projectB!.seasonSaveHistoryStandings(...).catch(() => {});
```

`throw` 대신 `{error}` 를 **반환**하므로 `.catch()` 는 애초에 안 걸리고,
resolve 된 값은 아무도 안 본다. **저장이 실패해도 화면에도 로그에도 안 남는다.**
같은 모양이 `saveHistoryLbStats` · `saveHistoryPostseason` ·
`saveHistoryTournaments` 네 곳 전부에 있다.

### C 가 좁혀둔 것

`saveSeasonHistory` 는 `runWorldSeasonEnd:123` 한 곳에서만 불린다.
**바로 앞줄 122** 의 `flushAllLeagueStatsToDb` 는 **같은 자료**
(`leagueState[*].stats`) 를 읽는데, 이쪽은 `npc_season_stats` 에 2027년 행까지
남겼다 — 즉 122 는 확실히 돌았다. 그런데 123 의 산물이 한 줄도 없다.

남는 설명은 둘이다.

1. `standingRows` / `lbStatRows` 가 0 이라 `length > 0` 가드에 걸려 건너뛰었다
2. 호출은 나갔고 SQL 에서 실패했는데 위 두 겹에 묻혔다

**스키마는 무죄다.** `history_lb_stats` 의 INSERT 48개 컬럼과 실제 테이블 48개
컬럼이 이름·개수 모두 일치하고, NOT NULL·기본값 없는 컬럼 중 빠진 것도 없다.
대조해서 확인했다.

가르려면 **게임을 한 시즌 실제로 돌려 계측**해야 하는데,
`seasonRollover.ts` 는 `usecases/` 라 C 소유가 아니다.

> 최소 조치 제안 — 반환된 `{error}` 를 `console.warn` 이라도 태우면
> 다음번엔 한 번에 갈린다. 지금은 아무 흔적이 없다.

---

## 3. 문서를 고쳐달라 — TRACK_C_PROMPT 가 틀린 곳 다섯

> TRACK_C_PROMPT §7: *"⚠ 네가 봐서 문서와 다르면 문서가 틀린 것이다.
> A 에게 알려라"*

| # | 문서 | 실제 |
|---|---|---|
| 1 | `history_json` 테이블 | **테이블이 아니다.** `db.cjs` 의 `chat_history_json` **컬럼**이다 |
| 2 | 역대 기록 6개 테이블 (한 덩어리) | **DB 두 개로 갈려 있다** — `projectb_v2.db` 4개 + `slot3_slot_1.db` 2개 |
| 3 | `newGameV3.ts:600` 주석 *"238팀 × 5년 ≈ 1,190행"* | 실제 **190행**. 프로 3리그 38팀만 들어간다 (예상의 1/6) |
| 4 | §3 *"없는 것 — … 엔딩 화면"* | **있다.** `CareerEndScreen.svelte` 419줄 · 검사 8건 · 은퇴 흐름에 연결까지 돼 있었다 |
| 5 | 2주차 히스토리 화면 *"데이터는 이미 쌓인다"* | **안 쌓인다.** 위 §2 참고 — 역대 순위는 씨앗 5년뿐이고 수상(`history_lb_stats`)은 0행이다 |

3번은 주석이 아니라 **코드가 틀렸을 수도 있다** — `buildPastStandings` 에
넘어가는 `opts.allTeams` 에 아마추어·팜 리그가 안 들어오는 것으로 보인다.
리그 화면 연도별 연감이 프로만 나오는 게 의도였는지 확인해달라.

---

## 4. ② 엔딩 골격 — 끝냈다

설계는 [TRACK_C_ENDING_DESIGN.md](TRACK_C_ENDING_DESIGN.md) 에 있다.
**`history_*` 는 안 썼다** — 재료는 전부 주인공 저장본 안이다.

⚠ 엔딩 화면은 **이미 419줄로 있었다**(위 §3-4). 갈아엎지 않고 빠진 덩어리
하나만 붙였다 — 세 덩어리 중 **주요 사건**이 통째로 없었다.
`careerEvents` 가 쌓이고 있는데 화면이 한 번도 안 읽었다.

| 엔딩의 세 덩어리 | 재료 |
|---|---|
| 커리어 요약 | `careerRecords: CareerSeasonRecord[]` (`save.ts:360`) |
| 통산 기록 | 같은 배열 합산 (`stats` · `awards` · `psResult`) |
| 주요 사건 | `careerEvents: NpcCareerEvent[]` (`save.ts:825`) |

쓰는 쪽은 `seasonCareerRecord.ts:76` 이고 `runWorldSeasonEnd:128` 이 매 시즌
부른다. **IPC 를 안 타므로 §2 의 묻힘이 없다.**

⚠ 현재 세이브엔 `careerRecords` 키 자체가 없다 — 주인공이 고교 1학년 6주차라
첫 시즌도 안 끝났다. 필드가 `?` 선택이므로 **빈 배열을 정상 상태로 다룬다.**

---

## 5. 🔴 `draft_picked` 가 주인공에게 안 쌓인다

`addCareerEvent` 호출부 여섯 곳을 다 봤는데 **드래프트가 없다.**
NPC 는 `draftSystem.ts` 에서 받는데, 주인공 지명은 Rust
`determine_protagonist_draft` 가 정하고 `addCareerEvent` 를 안 부른다.

**커리어에서 제일 큰 사건이 은퇴 결산에 안 나온다.** 방금 붙인 주요 사건
절이 졸업·트레이드·입대는 보여주는데 지명만 빈다.

`usecases/` 라 C 가 못 고친다. **A 가 한 줄 넣어주면 화면은 그대로 받는다** —
`{ year, eventType: "draft_picked", toTeamId, toLeagueId, detail: "N순위" }`.

---

## 6. C 가 R3 밖에서 건드린 파일 둘 — 되돌리기 쉽다

②(엔딩 골격)를 하며 **표시 문자열 때문에** 두 개를 건드렸다.
싫으면 되돌려라. 동작 변화는 없다.

| 파일 | 무엇 | 왜 |
|---|---|---|
| `shared/utils/careerEventLabel.ts` | 항목 3개 추가 (`military_exempt` · `graduation` · `quit_baseball`) | 표에 없어서 결산에 **"military exempt"** 라고 영어가 뜰 자리였다. 화면에 별도 표를 만드는 건 그 파일 머리말이 금지한다 |
| `shared/utils/__tests__/careerEventLabel.test.ts` | 검사 1건 추가 | 기존 게이트가 **Rust 소스만** 긁어서, TS 가 내는 위 셋을 못 봤다. `NpcCareerEventType` 유니온도 긁게 했다 |

둘 다 `shared/utils/` 라 R2 잠금도 R3 소유도 아니다 — §1 의 소유권 질문과
같은 자리다. **`game.ts` 가 쓰는 `careerSummary.ts` 는 안 건드렸다.**

전체 회귀 통과: `vitest` 170파일 1,503건 · `tsc` 깨끗 ·
`svelte-check` 34/37(**기준선 그대로**).
