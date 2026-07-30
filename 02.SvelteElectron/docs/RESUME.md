# 재개 지점 (2026-07-30)

> 이 문서는 **어디서 멈췄고 다음에 뭘 하는지**만 적는다.
> 결정의 근거·계획 전문은 아래 정본 문서에 있으니 여기서 복제하지 않는다 —
> 복제하면 stale해지고, 그게 이 프로젝트가 이미 겪은 문제다(AUDIT §3-1).

## 지금 상태

```
main         990378d32  Phase 5 병합 완료
feat/people  b099eb2e1  ← 여기서 작업 중. main보다 12커밋 앞섬 (워킹트리 클린)
feat/172teams           Phase 5 작업 브랜치 — main에 병합됨, 삭제해도 무방
```

**Phase 6 완료.** 6A(스태프 생성)·6B(생애주기)·6C(관계도)가 전부 끝났다.
남은 것은 **`feat/people` → `main` 병합**, 그 다음이 Phase 7이다.

> **남은 작업 전량은 [BACKLOG.md](BACKLOG.md)에 있다.** 이 문서는 "지금 당장",
> 그 문서는 "끝까지 뭐가 남았나"다.

### 세계가 지금 이렇게 돈다

| 리그 | 정규 | 대회/PO |
|---|---:|---|
| 고교 102팀 8권역 | 1,020 | 전국대회 5종 233 |
| 대학 50팀 5조 | 225 | 왕중왕전·은하기·여명기 85 |
| 독립 10팀 4단계 | 152 | 준PO→PO→챔결 ≤5 |
| 프로 1군 10팀 | 720 | 5강 WC 사다리 ≤19 |
| 프로 2군 10팀 | 495 | 축약 사다리 3 |

스태프 **1,180명**(감독182·구단주182·코치816)이 worldSeed 결정적으로 생성되고,
매 시즌 나이·성장·은퇴·경질·하향·FA 재취업이 돈다.
**관계도**가 스태프 전원 + 팀동료를 주인공 기준 1:N으로 추적한다.

⚠ **성능 미측정.** 주당 약 56경기. Phase 8의 전제다.

## 다음에 할 것

1. **`feat/people` → `main` 병합** (Phase 6 완료분 12커밋)
2. **Phase 7-1 — 11월 통합 드래프트**부터. 분해와 순서는 [BACKLOG.md §1](BACKLOG.md)

Phase 7이 남은 일의 절반 이상이다. 하위 단계로 쪼개서 커밋 단위를 유지할 것.

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
npm run test:v3          # 16개 스위트 (전부 ALL PASS여야 한다)
cd packages/engine-native && cargo test --release   # Rust 유닛 41개
npm run harness -- --seasons 5 --trials 2           # 불변식 위반 0
npx tsc --noEmit         # 15개가 베이스라인. 늘면 내가 만든 것
npx svelte-check --threshold error                  # 76 errors가 베이스라인 — main과 대조할 것
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

### 이 코드베이스의 함정

- **어휘 드리프트가 이 코드베이스의 1번 버그 유형이다.** 지금까지 셋 나왔고
  전부 "저장하는 쪽과 읽는 쪽의 이름이 다른데 타입이 안 잡아준" 경우다:
  1. 감독 능력치 3중 이름 드리프트 → 매치 엔진에 **하나도 전달되지 않았다** (P6-2)
  2. `TeamHistory` v1 필드 → 팀 상세가 빈 값, 새 게임 팀 선택이 **렌더 크래시** (P6-10)
  3. 코치 `specialty` 영문 4종 vs 데이터 한국어 6종 → 비교가 3곳 전부 false라
     **투수코치 능력치가 훈련 효율에 반영되지 않았다** (6C-5)
  → 새 필드를 붙일 때 **저장·읽기·타입 세 곳의 이름이 같은지** 의심하고,
     가능하면 비교를 한 함수로 모아 테스트로 대조를 묶어라.
- **Rust 규칙 구조체는 snake_case, TS와 주고받는 것은 camelCase.** TOML에서 오는
  규칙에 `rename_all = "camelCase"`를 걸면 `missing field`로 죽는다.
- **결정적 난수는 대상마다 스트림을 분리한다.** 한 스트림으로 순차 생성하면
  앞쪽 개수가 바뀔 때 뒤가 전부 흔들려 디버깅이 불가능하다(P6-4).
- **정수 반올림이 기하 감쇠를 멈춘다.** 5 × 0.9 = 4.5 → 다시 5. 6C에서 20년 전
  헤어진 관계가 영원히 남는 걸로 나타났다. 수렴이 필요하면 1씩 미는 보정을 둘 것.
- **CRLF 파일이 섞여 있다.** Python 문자열 치환으로 여러 줄을 매칭할 때 실패한다.
  `i18n/index.ts`는 한글을 `\uXXXX` 이스케이프로 저장한다 — 스타일을 맞출 것.
- **스태프와 선수는 이동 규칙이 다르다.** 감독의 `KBL → 고교`는 정상이고(직장),
  선수의 `대학 → 대학`은 불가다(학적). 한 표로 묶으면 어느 한쪽이 망가진다(P6-9).
- **상태 변경 지점이 여러 곳이면 훅 대신 정합 검사를 써라.** 주인공 teamId를
  바꾸는 곳이 5곳이라 6C는 훅을 안 박고 매주 "관계의 lastTeam이 지금 팀과 다른가"를
  본다. 어느 경로로 바뀌든 스스로 복구된다 — B1이 훅 누락으로 생긴 버그였다.
