# 트랙 C — 화면 (2026-09-01 ~ 09-28)

> 이 문서가 **C 세션의 지시서**다. 새 대화를 열면 여기부터 읽는다.
> 전체 계획은 A 가 관리한다 — 일정·범위가 바뀌면 A 가 이 파일을 고친다.

---

## 0. 너는 누구인가

**세 세션(A·B·C)이 동시에 돈다. 너는 C다.**

```
A  엔진 · 밸런스 · Rust · 배선 · Steam 빌드
B  이벤트 · 소식 · 글
C  화면 · 엔딩 · 스크린샷      ← 너
```

목표는 **9월 28일까지 Steam 에 올릴 수 있는 빌드**다.
**실제 출시는 10월 이후**라 스토어 페이지·스크린샷 마감은 이 일정에 없다.

🔴 **일감이 끝나면 묻지 말고 대기열(§5) 맨 위를 집는다.** 놀지 않는다.

---

## 1. 🔴 절대 규칙 — 이걸 어기면 셋이 하루씩 잃는다

### R1. `npm run build:native` 를 **돌리지 마라**

Rust 빌드는 `.node` 파일 하나를 덮어쓴다. A 가 동시에 돌리고 있으면
**파일 잠금으로 조용히 실패**하고, 고친 줄 알았는데 옛 바이너리를 재게 된다
(이 저장소에서 이미 세 번 겪었다). Rust 가 바뀌면 A 가 알린다.

### R2. 🔴 **큰 파일 셋은 A 가 잠근다 — 열지 마라**

```
apps/ui/src/shared/stores/game.ts             4,043줄   A
apps/ui/src/shared/usecases/advanceWeek.ts    2,978줄   A
apps/ui/src/shared/usecases/weekPhases/**               A
packages/engine-native/**                               A
resource/data/master/players/generation_rules.json      A
scripts/**                                              A
resource/data/master/events/**                          B
resource/data/master/messages/**                        B
docs/RESUME.md · CLAUDE.md                              A
```

**화면에 필요한 값을 못 얻으면 직접 고치지 마라.** A 에게 셀렉터를 요청해라 —
A 가 함수 하나를 추가해 주는 편이 병합 푸는 것보다 훨씬 빠르다.

### 🔴 가르는 규칙 (A 확정 2026-09-01)

`shared/utils/` 는 40개가 넘고 성격이 섞여 있다. **표시는 C, 계산은 A** 다.

```
C   *Label.ts · displayName.ts · baseballFormat.ts · injuryReport.ts
    — 값을 사람이 읽는 글자로 바꾸는 것
A   *Engine.ts · draftSystem.ts · ids.ts · seasonWeeks.ts · careerSummary.ts
    gameSimulator.ts · matchLineupBuilder.ts · leagueScheduler.ts 등 나머지 전부
    — 규칙·계산. game.ts 가 읽는 것은 전부 A 다
```

`shared/stores/` 는 **화면 상태만 C** 다(`leagueUiStore` · `settings` ·
`uiLock`). `game.ts` · `season.ts` · `backgroundLeague.ts` · `master.ts` ·
`postseason.ts` · `npcLiveStats.ts` · `npcInjury.ts` · `autoAdvance.ts` 는 A 다.

`apps/desktop/` 은 **스키마(`ipc/*.cjs`)가 C, 핸들러(`main.cjs`)가 A** 다.

⚠ 경계가 애매하면 **먼저 물어라.** 되돌리는 것보다 싸다.

### R3. 네 소유는 이것이다

```
apps/ui/src/pages/**
apps/ui/src/features/**
apps/ui/src/shared/repo/slotRepo.ts       화면이 읽을 커맨드를 여기 추가
apps/desktop/ipc/slotdb.cjs               그 커맨드의 SQL
apps/desktop/ipc/db.cjs                   역대 기록 네 테이블 — **C 소유**
shared/utils/*Label.ts · displayName.ts   표시 문자열 — **C 소유**
shared/utils/baseballFormat.ts · injuryReport.ts          같음
shared/stores/leagueUiStore.ts · settings.ts · uiLock.ts  화면 상태 — **C 소유**
apps/ui/src/**/*.css · 스타일
docs/TRACK_C_*.md                         네 문서
```

⚠ `slotdb.cjs` 스키마를 바꿀 땐 **`CREATE TABLE IF NOT EXISTS` 로만 바꾸지
마라** — 기존 슬롯에 조용히 반영 안 된다. `MIGRATIONS` 에 추가하고
`npm run test:migration` 을 통과시켜라 (현재 `SCHEMA_VERSION = 4`).

### R4. 브랜치

네 브랜치에서 일한다. **A 가 하루 한 번 트렁크로 병합**한다.

---

## 2. 이 저장소에서 일하는 법 — 반드시 지켜라

`CLAUDE.md` 와 `02.SvelteElectron/CLAUDE.md` 를 먼저 읽어라. 요점만:

- **게임 로직을 화면에 쓰지 마라.** `pages/` 는 렌더링과 입력만.
  로직은 `shared/usecases/` 이고 그건 A 소유다
- **`Math.random()` 금지.** 난수는 전부 Rust
- **값은 실측으로.** 추측하지 않는다. 적용 전후를 잰다. **3회씩 잰다**
- **고치려는 자리의 주석을 먼저 읽어라.** 대개 이미 답이 적혀 있다
- 주석은 **왜**를 적는다. 평서체. 사용자 응답만 존댓말
- **변이 검증**을 해라 — 고친 곳을 되돌리면 네 검사가 실패해야 한다
- 커밋 전 회귀: `npx vitest run` · `npx tsc --noEmit` · `npx svelte-check`

### ⚠ 화면 이름은 `teamMap` · `teamsL10n` · `entitiesL10n` 에서 읽어라

**원본 스토어를 직접 읽으면 그 화면만 한국어로 남는다.**
`npm run check:namelocale` 이 잡는다.

### ⚠ 새 게임으로 확인해라

기존 세이브로 화면을 보지 마라. **오염된 세이브가 없는 결함을 만든다.**

### ⚠ 자동 검사가 못 보는 것이 있다

`parkView.test.ts` 19건이 **좌표를 바꿔도 그대로 통과**했다 — 좌표를 안 보고
있었다. 죽은 CSS 를 규칙으로 판단하고 **띄워 보지 않아** 구장이 잘린 채
나간 적도 있다(실사용 해상도 10 중 8). **눈으로 봐라.**

---

## 3. 지금 상태 — 2026-09-01 실측

```
화면            18개 (pages/)  ·  svelte 파일 54개
svelte-check    오류 15 · 경고 37   (C 가 1주차에 34 → 15)
```

🔴 **앞선 판이 "엔딩 화면이 없다"고 적었는데 틀렸다.** `pages/` 만 세고
`features/` 를 안 봤다 — `features/retirement/ui/CareerEndScreen.svelte` 가
**472줄로 이미 있었다.** 은퇴 흐름 연결까지 돼 있었다.
**없는 것은 히스토리 화면(역대 순위·수상) 하나다.**

### 역대 기록 테이블 — **DB 둘로 갈려 있다** (C 가 실측으로 잡았다)

```
projectb_v2.db (db.cjs)     history_standings · history_lb_stats
                            history_postseason · history_tournaments
slot3_*.db (slotdb.cjs)     history_league
양쪽 다                     career_history
```

⚠ 앞선 판이 적었던 `history_json` 은 **테이블이 아니다** — `db.cjs` 의
`chat_history_json` **컬럼**이다. 지웠다.

🔴 **여섯 중 다섯이 0행이다.** 유일하게 찬 `history_standings` 190행도
플레이 산물이 아니라 새 게임이 심는 **가짜 과거 5년**(2021–2025)이다.
A 가 원인을 재고 있다 — 저장 실패가 로그에도 안 남던 것을 먼저 고쳤다.
**엔딩 화면은 `protagonist.careerRecords` 로 짜는 게 맞다.**

### 🔴 "없다"고 적기 전에 **재현한다**

이 저장소에서 "없다"가 **세 번** 틀렸다 — A1 · 엔딩 화면 · 히스토리 화면.
세 번 다 `pages/` 만 세고 `features/` 를 안 봤다.

```
파일 검색 한 번으로 끝내지 마라
  pages/ · features/ · shared/ 를 다 본다
  화면이면 **띄워 본다** — 이 저장소 검사는 전부 소스 문자열 대조라
  컴포넌트를 안 띄운다
```

⚠ **숫자를 여기 적지 않는다.** 예전엔 `svelte-check` 내역("PreGameBriefing
12 · MainPage 7")을 적어 뒀는데 주마다 바뀌어 **문서가 늘 뒤처졌다.**
직접 돌려서 봐라: `npx svelte-check --threshold error`

### ✅ 화면 결함 둘 — **처리됐다** (2026-09-01)

- 등판 회피가 선수 기록을 안 남기던 것 → A 가 `simulateSkippedGame` usecase 를
  만들었고 C 가 이었다. ⚠ 위치는 `usecases/` 가 아니라 **`pages/main/`** 이었다
- 정규 경기가 로테이션을 안 올리던 것 → 두 자리에서 고쳤다.
  ⚠ 위치는 `stores/backgroundLeague.ts` 와 `pages/main/` 이다

⚠ 앞선 판이 둘 다 "`usecases/` 라 A 소유"라고 적었는데 **위치가 틀렸다.**

---

## 4. 주차별 할 일

### 1주차 · 09.01 – 09.07

1. **`history_*` 6개 테이블에 실제로 뭐가 쌓이는지 먼저 봐라.**
   엔딩 화면을 그리기 전에 재료를 확인한다 — 없는 걸 그리면 두 번 일한다
2. **엔딩 화면 설계 + 골격.**
   사용자 확정: **복잡하지 않게.** 세 덩어리로 잡는다 —
   `커리어 요약` · `통산 기록` · `주요 사건`
   ⚠ 은퇴는 `careerStatus: "retired"` 다. 은퇴 선수는 `npcs` 에서 안 사라진다
3. **`svelte-check` 오류 착수** — PreGameBriefing 12 · MainPage 7 (19건)

### 2주차 · 09.08 – 09.14

1. **엔딩 화면 구현 완료**
2. **히스토리 화면** — 역대 순위 · 수상.
   ⚠ **"데이터는 이미 쌓인다"고 적었는데 반만 맞다.** 새 게임 기준으로는
   시즌마다 쌓인다(A 가 2시즌 실측: 순위 238행 · 개인기록 6,708행 ·
   포스트시즌 9행 · 대회 8행). 다만 **지금 있는 세이브엔 안 쌓여 있다** —
   `HANDOFF_A_TO_C.md` §2 참고. 화면은 **빈 상태를 정상으로** 다뤄라.
3. `svelte-check` 나머지 15건
4. 남으면 **눈확인을 앞당긴다** — 3주차 일감을 미리 시작한다

### 3주차 · 09.15 – 09.21

1. **눈확인 1차 — 사람만 할 수 있다.**
   드래프트 관전 · 선수 상세 · 재정 4탭 · 권역 순위표 · 2군 탭
2. **죽은 CSS 제거 뒤 화면.** 규칙으로만 판단했고 띄워 보진 않았다
3. **한 커리어 완주** — 고교 입학 → 은퇴 → 엔딩까지.
   ⚠ 기존 세이브 말고 **새 게임**으로
4. 09.21 이후 기능 추가 없음. 붙이고 고치는 것만

### 4주차 · 09.22 – 09.28

1. **눈확인 2차** — 1차에서 고친 것 다시 보기
2. **해상도별 확인.** 구장 잘림이 실사용 10 중 8에서 났던 적이 있다.
   1920×1080 · 1366×768 · 2560×1440 · 창 모드 축소까지
3. 🔴 **09.24 이후 기능 추가 금지.** 버그만

---

## 5. 🔴 대기열 — 일찍 끝나면 위에서부터

주차 일감이 끝났는데 다음 주가 안 왔으면 **여기 맨 위를 집는다. 묻지 않는다.**

```
1.  눈확인을 앞당긴다 — 3주차 일감을 미리
2.  svelte-check 경고 37건
3.  MainPage 죽은 CSS 21건 — 스크립트가 미디어 쿼리를 깨뜨린다. 손으로
4.  B7 죽은 CSS 제거 뒤 화면 재확인 — 규칙으로만 판단했고 안 띄워 봤다
5.  B8 해외 빈 순위표 56행
6.  10월 준비: 스크린샷 후보 촬영 (새 게임으로 몇 시즌 돌린 뒤)
```

---

## 6. 끝났다는 기준

```
1주  history_* 재료 파악 · 엔딩 골격 · svelte-check 34 → 15
2주  엔딩 완성 · 히스토리 화면 · svelte-check 0
3주  눈확인 1차 완료 · 새 게임 한 커리어 완주 · 화면 오류 0
4주  눈확인 2차 · 해상도 4종 확인
```

---

## 7. 막히면

- **A 에게 물어라** — 데이터·셀렉터·엔진은 전부 A 소유다.
  **직접 `game.ts` 를 열지 마라**
- **B 에게 물어라** — 이벤트 글이 어떻게 뜨는지는 B 가 안다
- 레이아웃·톤 판단은 **사용자에게 묻는다.** 지어내지 마라

**⚠ 네가 봐서 문서와 다르면 문서가 틀린 것이다.** A 에게 알려라 —
`RESUME.md` 와 `CLAUDE.md` 는 A 가 고친다.
