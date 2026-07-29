# 재개 지점 (2026-07-29)

> 이 문서는 **어디서 멈췄고 다음에 뭘 하는지**만 적는다.
> 결정의 근거·계획 전문은 아래 정본 문서에 있으니 여기서 복제하지 않는다 —
> 복제하면 stale해지고, 그게 이 프로젝트가 이미 겪은 문제다(AUDIT §3-1).

## 지금 상태

```
브랜치  feat/172teams   ← 여기서 작업 중 (워킹트리 클린)
main    584c45041       ← 항상 동작하는 상태로 보존
```

**Phase 5-4까지 완료.** 172팀 세계가 켜졌고 **고교 8권역 주말리그(1,020경기)와
전국대회 5종이 돈다**.
**대학·독립 리그는 아직 일정이 없는 의도된 미완 상태**다. 브랜치를 판 이유가 이것.

- `DEFAULT_LEAGUE_CONFIGS`에서 대학·독립을 **일부러 뺐다** — 5조/4단계 생존리그는
  `cycles` 모델로 표현 불가. 그냥 두면 50팀 라운드로빈이 6,000경기를 만든다.
- 고교는 `cycles`를 버리고 **목표 경기수 모델**(`generateRegionalSchedule`)로 갔다.
  권역이 6~20팀으로 갈려도 전 팀 정확히 20경기 — `npm run test:regional`이 이걸 지킨다.
- 프로는 현 모델로 정확히 표현된다 (1군 10팀 144경기 · 2군 10팀 99경기).

## 다음에 할 것 — Phase 5-5

**대학 50팀 5조.** 정규리그 225경기 + 대회 3종(왕중왕전·은하기·여명기) +
쇼케이스·올스타전.

- 5조 = 조별 라운드로빈이라 5-3의 `generate_regional_schedule`을 **그대로 쓸 수 있다**
  (권역 = 조). 조 편성 기준만 정하면 된다 — 현재 refs에 대학 조 정보가 없다.
- 대회 3종은 5-4의 브래킷 엔진 재사용. `tournaments.csv`에 행을 추가하고
  `leagueId`를 `LEAGUE_UNIVERSITY`로 두면 카탈로그가 자동으로 잡는다.
- 다만 `progressTournaments`가 지금은 **고교일 때만 돈다** — 리그 게이트를 풀어야 한다.

이후 5-6(독립) → 5-7(프로 PO) → 5-8(투구수·반경). 전부 끝나면 `main`에 병합.

## 검증 명령

```bash
npm run test:v3          # 7개 스위트 (migration·slotdb·rostergen·newgame·draftpool·regional·tournament)
npm run harness -- --seasons 5 --trials 2
npx tsc --noEmit         # 15개가 베이스라인. 늘면 내가 만든 것
```

> ⚠ `npm test`(vitest)는 **실행 불가** — `node_modules/vitest` 미설치.
> tsc 15개 중 2개가 이것 때문. Phase 9(전체 경로 하네스) 전에 `npm install` 필요.

> ⚠ 테스트는 electron으로 돈다. `npx electron`은 이 환경에서 실패하니
> `ELECTRON_RUN_AS_NODE=1 ./node_modules/electron/dist/electron.exe scripts/xxx.cjs`
> 또는 등록된 npm 스크립트를 쓸 것.

## 정본 문서 (여기부터 읽을 것)

| 문서 | 내용 |
|---|---|
| [DESIGN.md](../DESIGN.md) | 통합 기획서 v2. **§10 R6**이 남은 구현 로드맵 |
| [docs/design/_ledger.md](design/_ledger.md) | 기획 통합 판정 22건 + **폐기한 안과 그 이유** |
| [docs/design/people.md](design/people.md) | 인물 시스템 설계 (Phase 6) |
| [docs/DATA_POLICY.md](DATA_POLICY.md) | 데이터 3분류 · 마이그레이션 규칙 · 코드 배치 규칙 |
| [docs/AUDIT_2026-07.md](AUDIT_2026-07.md) | 현황 전수조사 · 버그 B1~B11 |
| [CLAUDE.md](../CLAUDE.md) | 작업 규칙 (절대 금지 3건 추가됨) |

## 전체 Phase (9단계)

1~3 정리·조사·기획통합 ✅ · **4** 데이터 기반+하네스 ✅ · **5** 리그·대회 🔨(5-4까지)
· 6 인물 시스템 · 7 커리어·시장·신규 · 8 성능 · 9 하네스 확장+loop 소탕

> Phase 5와 6은 **순서를 맞바꿨다** — 인물이 팀에 종속되므로(스태프 ID가 teamId 기준,
> 코치 수가 팀 자원 등급 연동) 172팀을 먼저 깔고 그 위에 인물을 얹는다.

## 알아두면 좋은 것

- **하네스를 먼저 돌려라.** 5-2에서 refs를 교체하자마자 INV3이 위반 990건으로
  "옛 팀 ID를 하드코딩한 스크립트"를 즉시 잡았다. 큰 변경 전후로 돌릴 것.
- **팀 목록을 손으로 박지 말 것.** `leagueTeams.generated.ts`는 생성물이고
  정본은 `resource/data/seeds/onepitch/*.csv`다.
  시드를 고쳤으면 `python scripts/build_refs_from_seeds.py`로 재생성한다.
- **slot.db 스키마 변경은 `MIGRATIONS`로.** `CREATE TABLE IF NOT EXISTS`만으로는
  기존 슬롯에 반영되지 않는다(그 결함이 B3였다).
- **게임 로직을 store에 쓰지 말 것.** `game.ts`가 2,579줄이 된 이유다.
  시즌 경계 오케스트레이션(`processAllLeaguesSeasonEnd` 566줄)은 Phase 6에서
  `usecases/seasonEnd/`로 옮긴다.
