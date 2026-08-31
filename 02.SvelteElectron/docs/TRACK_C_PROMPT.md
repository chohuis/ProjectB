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

목표는 **9월 28일 Steam 출시**다. 오늘부터 27일이다.

🔴 **네가 쥔 일정이 하나 있다.** Steam 스토어 페이지에는 스크린샷이 필요하고,
그 페이지는 **09월 14일**까지 공개돼야 한다. **09월 12일까지 B 에게
스크린샷 5장 이상**을 줘야 한다. 이게 늦으면 출시일이 2주 밀린다.

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

### R3. 네 소유는 이것이다

```
apps/ui/src/pages/**
apps/ui/src/features/**
apps/ui/src/shared/repo/slotRepo.ts       화면이 읽을 커맨드를 여기 추가
apps/desktop/ipc/slotdb.cjs               그 커맨드의 SQL
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
없는 것         인생 기록 · 엔딩 화면  ·  히스토리 화면
데이터는 있다   history_json · history_lb_stats · history_league
                history_postseason · history_standings · history_tournaments
svelte-check    오류 34 · 경고 37
```

### svelte-check 오류가 어디 있나 (실측)

```
features/pre-game-briefing/ui/PreGameBriefingModal.svelte   12
pages/main/MainPage.svelte                                   7
pages/training/TrainingPage.svelte                           6
features/career/ui/CareerResultsModal.svelte                 4
pages/match/MatchPage.svelte                                 2
pages/new-game/NewGamePage.svelte                            1
features/injury/ui/InjuryTreatmentModal.svelte               1
features/contract/ui/ContractNegotiationModal.svelte         1
```

⚠ **이 중 셋은 동작이 이미 어긋났을 수 있다.** 타입 오류가 아니라
런타임에 `undefined` 가 흐르는 자리인지 하나씩 봐라.

### 이미 알려진 화면 결함 둘 — A 소유라 네가 못 고친다

- `MainPage` 등판 회피가 `playerLines: []` 를 박는다 → 점수는 나오는데
  **그 경기 선수 기록만 통째로 없다**
- `syncProtagonistLeagueUpdate` 가 `teamRotationIndex` 를 안 건드린다 →
  **배경 팀은 로테이션이 돌고 주인공 팀만 안 돈다**

둘 다 `usecases/` 라 **A 에게 넘겨라.** 화면에서 우회하지 마라.

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

### 2주차 · 09.08 – 09.14 🔴 **09.12 가 네 마감이다**

1. **엔딩 화면 구현 완료**
2. **히스토리 화면** — 역대 순위 · 수상. 데이터는 이미 쌓인다
3. `svelte-check` 나머지 15건
4. 🔴 **09.12 까지 스크린샷 5장 이상을 B 에게.**
   경기 · 육성 · 순위표 · 선수 상세 · 엔딩.
   ⚠ **새 게임으로 몇 시즌 돌려서 찍어라.** 빈 순위표·0 기록이 찍히면
   스토어 페이지가 초라해진다

### 3주차 · 09.15 – 09.21

1. **눈확인 1차 — 사람만 할 수 있다.**
   드래프트 관전 · 선수 상세 · 재정 4탭 · 권역 순위표 · 2군 탭
2. **죽은 CSS 제거 뒤 화면.** 규칙으로만 판단했고 띄워 보진 않았다
3. **한 커리어 완주** — 고교 입학 → 은퇴 → 엔딩까지.
   ⚠ 기존 세이브 말고 **새 게임**으로
4. 09.17 이후 기능 추가 없음. 붙이고 고치는 것만

### 4주차 · 09.22 – 09.28

1. **눈확인 2차** — 1차에서 고친 것 다시 보기
2. **해상도별 확인.** 구장 잘림이 실사용 10 중 8에서 났던 적이 있다.
   1920×1080 · 1366×768 · 2560×1440 · 창 모드 축소까지
3. 🔴 **09.24 이후 기능 추가 금지.** 버그만

---

## 5. 끝났다는 기준

```
1주  history_* 재료 파악 · 엔딩 골격 · svelte-check 34 → 15
2주  엔딩 완성 · 히스토리 화면 · svelte-check 0 · 스크린샷 전달(09.12)
3주  눈확인 1차 완료 · 새 게임 한 커리어 완주 · 화면 오류 0
4주  눈확인 2차 · 해상도 4종 확인
```

---

## 6. 막히면

- **A 에게 물어라** — 데이터·셀렉터·엔진은 전부 A 소유다.
  **직접 `game.ts` 를 열지 마라**
- **B 에게 물어라** — 이벤트 글이 어떻게 뜨는지는 B 가 안다
- 레이아웃·톤 판단은 **사용자에게 묻는다.** 지어내지 마라

**⚠ 네가 봐서 문서와 다르면 문서가 틀린 것이다.** A 에게 알려라 —
`RESUME.md` 와 `CLAUDE.md` 는 A 가 고친다.
