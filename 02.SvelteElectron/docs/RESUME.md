# 재개 지점 (2026-07-30)

> 이 문서는 **어디서 멈췄고 다음에 뭘 하는지**만 적는다.
> 결정의 근거·계획 전문은 아래 정본 문서에 있으니 여기서 복제하지 않는다 —
> 복제하면 stale해지고, 그게 이 프로젝트가 이미 겪은 문제다(AUDIT §3-1).

## 출시 범위 (2026-07-30 확정)

**1차 출시는 국내만.** 해외(ABL·JBL)는 확장팩으로 미뤘다 —
`shared/config/releaseScope.ts`가 노출만 막고 코드·데이터는 그대로다.
확장팩에서 `OUT_OF_SCOPE_LEAGUES` Set을 비우면 되살아난다.
회귀 검사 `npm run test:releasescope`.

## 지금 상태

```
main   (최신)   Phase 1~6 + 6.5 + 7-1·7-2·7-3·7-4 전부 병합됨. 작업 브랜치 없음
```

병합된 브랜치(`feat/draft`·`feat/promotion`·`feat/roster-detail`·`fix/domestic-rosters`
·`feat/people`·`feat/172teams`)는 전부 삭제해도 무방하다.

**Phase 1~6 + 6.5 완료 · Phase 7은 7-1~7-4 완료, 7-5부터 남았다.**

| Phase | 한 일 | 설계 정본 | 회귀 |
|---|---|---|---|
| 7-1 | 11월 통합 드래프트 · 미지명자 진로 | [draft.md](design/draft.md) | `test:draft` |
| 7-2 | 1군↔2군 승강 (월간 정기 + 상시 콜업) | [promotion.md](design/promotion.md) | `test:promotion` |
| 7-3 | 국가대표 · 국제대회 · 병역 면제 | [military.md](design/military.md) | `test:military` |
| 7-4 | FA 등급제 · 방출 2단계 · 구단주 관계 | [fa.md](design/fa.md) | `test:fa` |

### 아직 눈으로 확인 안 했다

**자동 테스트는 데이터만 본다. 화면은 하나도 안 봤다.**
최근 결함 두 건(상무 모달 `curYear` ReferenceError, 보드 순서 표시)이 정확히
그 경계에 있었다. 실행할 수 있게 되면 이것부터:

| 볼 것 | 깨졌다는 신호 |
|---|---|
| 새 게임 생성 | `generation_rules.json` 관련 콘솔 에러 (규칙 키를 5개 추가했다) |
| **W47 드래프트 관전 / 스킵** | 둘의 결과가 다름 · 라운드/픽 표시가 어긋남 |
| 후보 목록 출신 칸 | 전부 "고교" (대학·독립이 있어야 정상) |
| 리그 기록 탭 | 같은 지명이 두 줄 |
| 팀 화면 1군/2군 | 1~4R 신인이 1군에, 나머지가 2군에 없음 |
| 선수 상세 모달 | 안 열림 (신인·상무 양쪽) |
| **주인공 2군 강등** | 강등됐는데 일정이 1군 그대로 |

관전 보드가 제일 위험하다 — 자체 시뮬을 걷어내고 결과 재생으로 바꾸면서
634줄 중 209줄이 빠졌다. 주인공 강등은 `setProtagonistTeam`이 새 배선이다.

### UI가 없어 볼 게 없는 것 (7-6에서 붙는다)

- 국제대회 결과·병역 면제 — 로그뿐
- NPC FA 시장 — 엔진(`resolveFaMarketNative`)만 있고 오프시즌 배선 전
- 방출 2단계 — 오프시즌 로그에만

> **남은 작업 전량은 [BACKLOG.md](BACKLOG.md)에 있다.** 이 문서는 "지금 당장",
> 그 문서는 "끝까지 뭐가 남았나"다.

### 세계가 지금 이렇게 돈다

| 리그 | 팀 | 로스터 | 정규 | 대회/PO |
|---|---:|---:|---:|---|
| 고교 8권역 | 102 | 30 | 1,020 | 전국대회 5종 233 |
| 대학 5조 | 50 | 32 | 225 | 왕중왕전·은하기·여명기 85 |
| 독립 4단계 | 10 | 30 | 152 | 준PO→PO→챔결 ≤5 |
| 프로 1군 | 10 | 30 | 720 | 5강 WC 사다리 ≤19 |
| 프로 2군 | 10 | 34 | 495 | 축약 사다리 3 |
| ~~ABL·JBL~~ | ~~56~~ | — | — | **1차 출시 제외 (확장팩)** |

국내 **182팀 5,600명**이 새 게임에서 전부 생성된다 (worldSeed 결정적, Rust 43ms).

스태프 **1,180명**(감독182·구단주182·코치816)이 worldSeed 결정적으로 생성되고,
매 시즌 나이·성장·은퇴·경질·하향·FA 재취업이 돈다.
**관계도**가 스태프 전원 + 팀동료를 주인공 기준 1:N으로 추적한다.

⚠ **성능 미측정.** 주당 약 56경기. Phase 8의 전제다.

## 다음에 할 것

**Phase 7-5 — 개인 재정 · 스태프 15종 배선 · 부상 전조.**

### 7-5 들어가기 전에 알아둘 것

- **스태프 15종은 6A에서 생성만 했다.** 효과 계수 15개가 §11 미확정이고,
  코치 `specialty`는 한국어 6종이 정본이다(영문 4종으로 비교하던 결함이 6C-5)
- **개인 재정은 전부 미확정이다** — 세율 구간·보너스 폭·반비례 계수·수익률.
  7-1에서 신인 계약금을 KBO 규모(1순위 4.5억)로 잡았으니 그 스케일과 맞춰야 한다
- 7-4가 남긴 것 둘이 여기서 만난다:
  **NPC FA 시장 오프시즌 배선**(`resolveFaMarketNative` 준비됨)과
  **주인공 재계약 UI 경로**(구단주 관계의 재계약 쪽 소비처)
- 부상 전조는 `seasonStore.npcInjuries` 하나가 유일한 입력이다. 세분화하면
  7-2 상시 콜업 트리거도 같이 넓혀야 한다

### 이 코드베이스에서 반복된 결함 (Phase 7에서만 11건)

전부 **"정본이 둘 이상"** 이거나 **"타입이 안 잡아주는 경계"** 였다:

| | 무엇 |
|---|---|
| 1 | 팀 ID 8개가 `draftSystem.ts`에 — refs에 없는 유령 팀 (지명자 400명) |
| 2 | 로스터 상한이 규칙 파일·Rust·TS 세 곳에 각각 다른 값 |
| 3 | `militaryRank`를 TS 타입에만 넣어 Rust 왕복에서 유실 |
| 4 | `NpcCareerEventType` union이 Rust가 쓰는 문자열을 모름 |
| 5 | FA 자격 연수가 네 곳 (Rust 안에서만 두 번 정의) |
| 6 | `maxRosterSize: 35` · `maxTotal: 20` 하드코딩 |

→ **표를 두 번째로 적고 있다면 이미 드리프트다.** 정본을 정하고 나머지는 지운다.
→ 폴백을 남길 거면 **대조 테스트를 같이 둔다** (`test:fa`가 그 예다).
→ Rust가 안 쓰는 필드라도 `NpcSaveState`에 있어야 한다 — 없으면 왕복에서 버려진다.

분해와 순서는 [BACKLOG.md §1](BACKLOG.md).

## 미결 (범위 밖이라 손대지 않은 것)

| 항목 | 상태 |
|---|---|
| **성능 미측정** | 주당 약 56경기. Phase 8이 이 숫자 위에서 시작 |
| **vitest 미설치** | `npm test` 실행 불가. tsc 15개 중 2개가 이것 |
| `RosterPage.svelte` 316줄 | **어디서도 import 안 되는 고아 페이지** (`nav.roster` i18n 키만 남음). 6C-6에서 발견 |
| 구단주·팀동료 관계 효과 | 소비처가 Phase 7에 생긴다 (방출 2단계 7-4 / `events.ts` 3줄 빈 껍데기 B8) |
| `salaryNegotiation` 타입 결함 | `CareerResultModal.svelte:79` — 필수 필드 3개 누락 |
| 566줄 전면 분리 | `processAllLeaguesSeasonEnd` — 병역·FA·드래프트가 얽혀 별도 작업 (_ledger P6-7) |
| 구 세이브 | 마이그레이션 v4까지 열리기만 한다. 사용자 확정("개발 중이라 폐기 OK") |

## 검증 명령

```bash
npm run test:v3          # 21개 스위트 (전부 통과해야 한다) (전부 ALL PASS여야 한다)
cd packages/engine-native && cargo test --release   # Rust 유닛 114개
npm run harness -- --seasons 5 --trials 2           # 불변식 위반 0
npx tsc --noEmit         # 11개가 베이스라인. 늘면 내가 만든 것
npx svelte-check --threshold error                  # 70 errors가 베이스라인 — main과 대조할 것

npm run measure:draft     # 드래프트·진로·방출 5시즌 실측 (테스트 아님, 숫자 확인용)
npm run measure:promotion # 승강 출렁임 실측
npm run measure:slotsize  # npc 행 크기 컬럼별 실측
npm run smoke:draft       # 진짜 slot.db에 쓰고 읽어 화면이 볼 데이터를 확인
```

> ⚠ 테스트는 electron으로 돈다. `npx electron`은 이 환경에서 실패하니
> `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/xxx.cjs`
> 또는 등록된 npm 스크립트를 쓸 것. 순수 `node`는 better-sqlite3 ABI 불일치로 실패한다.

> ⚠ `npm run build:native`가 `index.d.ts`/`index.js`를 **재생성 안 할 때가 있다** —
> cargo가 재컴파일하지 않으면 napi가 바인딩 생성을 건너뛴다.
> `touch src/lib.rs && npx napi build --platform --release --js index.js --dts index.d.ts`

## 정본 문서 (여기부터 읽을 것)

| 문서 | 내용 |
|---|---|
| [DESIGN.md](../DESIGN.md) | 통합 기획서 v2. **§10 R6**이 남은 구현 로드맵 |
| [docs/BACKLOG.md](BACKLOG.md) | **남은 작업 전량** — Phase 7~9 분해 · 버그 B1~B11 실사 · 상시 부채 |
| [docs/design/_ledger.md](design/_ledger.md) | 판정 이력 — **"버린 안과 그 이유"가 같이 적혀 있다** |
| [docs/design/people.md](design/people.md) | 인물 시스템 설계 (Phase 6) — §6에 6A·6B·6C 확정 사항 |
| [docs/design/roster.md](design/roster.md) | 로스터 생성 규칙 (Phase 6.5) |
| [docs/design/draft.md](design/draft.md) | 드래프트 설계 (Phase 7-1) |
| [docs/design/promotion.md](design/promotion.md) | 승강 설계 (Phase 7-2) |
| [docs/design/military.md](design/military.md) | 병역·국가대표 설계 (Phase 7-3) |
| [docs/design/fa.md](design/fa.md) | FA·방출 설계 (Phase 7-4) |
| [docs/DATA_POLICY.md](DATA_POLICY.md) | 데이터 3분류 · 마이그레이션 규칙 · 코드 배치 규칙 |
| [docs/AUDIT_2026-07.md](AUDIT_2026-07.md) | 현황 전수조사 · 버그 B1~B11 |
| [CLAUDE.md](../CLAUDE.md) | 작업 규칙 |

## 전체 Phase (9단계)

1~3 정리·조사·기획통합 ✅ · **4** 데이터 기반+하네스 ✅ · **5** 리그·대회 ✅
· **6** 인물 ✅ · 7 커리어·시장·신규 · 8 성능 · 9 하네스 확장+loop 소탕

> Phase 5와 6은 **순서를 맞바꿨다** — 인물이 팀에 종속되므로(스태프 ID가 teamId 기준,
> 코치 수가 팀 자원 등급 연동) 172팀을 먼저 깔고 그 위에 인물을 얹는다.

## 알아두면 좋은 것

### 작업 습관

- **하네스를 먼저 돌려라.** 5-2에서 refs를 교체하자마자 INV3이 위반 990건으로
  "옛 팀 ID를 하드코딩한 스크립트"를 즉시 잡았다. 큰 변경 전후로 돌릴 것.
  단 **하네스는 slot.db와 Rust만 돈다** — `advanceWeek`(TS)를 안 거치므로
  거기 없는 것(관계도 등)의 불변식을 하네스에 넣으면 공허하게 통과한다.
- **svelte-check 숫자는 main과 대조해서 읽어라.** 기존 결함이 여러 개라 절대값은
  의미가 없다. `git stash -u` → 측정 → `stash pop` → 재측정으로 증감만 본다.
- **팀 목록·대회 카탈로그를 손으로 박지 말 것.** 정본은
  `resource/data/seeds/onepitch/*.csv|toml`이다.
  시드를 고쳤으면 `python scripts/build_refs_from_seeds.py`로 재생성한다.
  **규칙 TOML을 고치면 master.db용 JSON도 이 스크립트가 다시 만든다** —
  안 돌리면 Rust가 옛 규칙으로 돈다(6B에서 두 번 겪었다).
- **slot.db 스키마 변경은 `MIGRATIONS`로.** `CREATE TABLE IF NOT EXISTS`만으로는
  기존 슬롯에 반영되지 않는다(그 결함이 B3였다). 현재 `SCHEMA_VERSION = 4`.

### 테스트는 실데이터를 읽어라 (이번에 세 번 물렸다)

합성 데이터로 짠 테스트는 **통과하면서 결함을 통과시킨다.** Phase 6.5에서 세 번 겪었다:

1. **ID 충돌** — 합성 팀명(`TEAM_UNIV_T00`~`T49`)으로는 우연히 안 겹쳐 통과했다.
   `refs.json` 실제 팀 목록으로 바꾸니 32건이 잡혔다
2. **연봉 0 검사** — 테스트 헬퍼가 인라인 규칙(`with_contract: false`)을 써서
   **연봉이 0인 걸 검사**하고 있었다
3. **출신 분포 역전** — 유닛테스트는 다 통과했다. 실제 300명 규모로 돌려
   분포를 찍어봐야 대졸 57% / 고졸 28%(KBO는 반대)가 드러났다

→ Rust 테스트는 `generation_rules.json`·`refs.json`을 `std::fs`로 직접 읽는다.
→ **분포는 실제 규모로 돌려 숫자를 찍는다. 예측하지 않는다** —
  6B에서 "감독 생존 45~55%"라고 예측했다가 실측 13%로 틀렸다(_ledger P6-6).

### 이 코드베이스의 함정

- **어휘 드리프트가 이 코드베이스의 1번 버그 유형이다.** 지금까지 여섯 나왔고
  전부 "저장하는 쪽과 읽는 쪽의 이름이 다른데 타입이 안 잡아준" 경우다:
  1. 감독 능력치 3중 이름 드리프트 → 매치 엔진에 **하나도 전달되지 않았다** (P6-2)
  2. `TeamHistory` v1 필드 → 팀 상세가 빈 값, 새 게임 팀 선택이 **렌더 크래시** (P6-10)
  3. 코치 `specialty` 영문 4종 vs 데이터 한국어 6종 → 비교가 3곳 전부 false라
     **투수코치 능력치가 훈련 효율에 반영되지 않았다** (6C-5)
  4. `TEAM_SPORTS_UNIT` v1 팀 ID → 입대자가 **존재하지 않는 팀**으로 갔다 (R-5)
  5. `draftSystem`의 팀 ID 8개 → 매년 지명자 80명이 **유령 팀 소속**이 됐고,
     같은 유령 ID를 쓰던 신인 계약 배수는 전 구단이 1.0으로 떨어졌다 (7-1 D-1)
  6. 로스터 상한이 규칙 파일·Rust·TS 세 곳에 **각각 다른 값**으로 (7-1 D-3a)
  7. `militaryRank`를 TS 타입에만 넣고 Rust 구조체에 안 넣어서, NPC가 Rust를
     통과할 때마다 계급이 **조용히 사라졌다**. `syncNpcs`가 INSERT OR REPLACE라
     다음 저장에 DB 값까지 지워진다 (7-1 스모크에서 발견)
  → **Rust가 안 쓰는 필드라도 `NpcSaveState`에 있어야 한다.** 없으면 왕복에서
     버려진다. `npm run test:draft`의 "Rust 왕복 보존"이 이 부류를 지킨다.
  → 새 필드를 붙일 때 **저장·읽기·타입 세 곳의 이름이 같은지** 의심하고,
     가능하면 비교를 한 함수로 모아 테스트로 대조를 묶어라.
  → **표를 두 번째로 적고 있다면 이미 드리프트다.** 정본을 정하고 나머지는 지운다.
- **`cargo build`만으로는 `.node`가 안 바뀐다.** napi가 바인딩을 다시 만들어야
  하므로 `npm run build:native`를 돌려야 한다. 안 그러면 고친 Rust가 그대로인
  것처럼 보여 "고쳐도 안 된다"고 오진하게 된다 (7-1 D-3a에서 겪었다).
- **Rust 규칙 구조체는 snake_case, TS와 주고받는 것은 camelCase.** TOML에서 오는
  규칙에 `rename_all = "camelCase"`를 걸면 `missing field`로 죽는다.
- **결정적 난수는 대상마다 스트림을 분리한다.** 한 스트림으로 순차 생성하면
  앞쪽 개수가 바뀔 때 뒤가 전부 흔들려 디버깅이 불가능하다(P6-4).
- **정수 반올림이 기하 감쇠를 멈춘다.** 5 × 0.9 = 4.5 → 다시 5. 6C에서 20년 전
  헤어진 관계가 영원히 남는 걸로 나타났다. 수렴이 필요하면 1씩 미는 보정을 둘 것.
- **CRLF 파일이 섞여 있다.** Python 문자열 치환으로 여러 줄을 매칭할 때 실패한다.
  `i18n/index.ts`는 한글을 `\uXXXX` 이스케이프로 저장한다 — 스타일을 맞출 것.
- **ID 하드코딩은 반드시 드리프트한다.** `TEAM_SPORTS_UNIT`이 세 곳에 박혀
  있었고 Phase 5가 refs를 갈아엎자 **존재하지 않는 팀**이 됐다 — 새 게임 필터도,
  런타임 입대 처리도 그 ID를 썼다. ID는 `utils/ids.ts`에만 둔다(CLAUDE.md 규칙).
- **스태프와 선수는 이동 규칙이 다르다.** 감독의 `KBL → 고교`는 정상이고(직장),
  선수의 `대학 → 대학`은 불가다(학적). 한 표로 묶으면 어느 한쪽이 망가진다(P6-9).
- **상태 변경 지점이 여러 곳이면 훅 대신 정합 검사를 써라.** 주인공 teamId를
  바꾸는 곳이 5곳이라 6C는 훅을 안 박고 매주 "관계의 lastTeam이 지금 팀과 다른가"를
  본다. 어느 경로로 바뀌든 스스로 복구된다 — B1이 훅 누락으로 생긴 버그였다.
