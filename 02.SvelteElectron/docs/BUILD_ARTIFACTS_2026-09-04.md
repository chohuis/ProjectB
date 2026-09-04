# 생성물 전수 조사 (2026-09-04 · A)

> `_manifest.json` 이 낡아 이벤트 18종이 조용히 안 실리던 건을 크게 잡았으니
> **같은 형태가 더 없는지** 전수로 훑었다. 커밋 `6c33079e0` 뒤 후속.
>
> 🔴 **추측 안 했다 — 자리마다 지우고 다시 만들어 봤다.** 아래 「다시 생기나」
> 칸이 그 실측이다(`npm run pack` 은 D 몫이라 안 돌렸다 · 네이티브 빌드는 D 와
> 겹쳐서 안 돌렸다).

## 1. 표 — 산출물 여덟 → **일곱** (09-04 저녁 · #2 를 접었다)

| # | 산출물 | 만드는 자리 | build 사슬 | 다시 생기나 (실측) | 어긋남 검사 | 포장 |
|---|---|---|---|---|---|---|
| 1 | `resource/data/master/_manifest.json` | `gen:manifest` (node) | ✅ 맨 앞 + `build:ui` 안에도 | ✅ 지우고 `gen:manifest` → 21,599 B 재생성 | ✅ `eventManifest.test.ts`(폴더↔목록 양방향) | ✅ `resource/**` · 번들 사본도 |
| ~~2~~ | ~~`resource/master.db`~~ | — | — | — | — | — |
| 3 | `packages/{contracts,core}/dist` | `build:packages` (tsc) | ✅ | ✅ 지우고 재생성 | ⚠ 없음 (tsc 가 실패하면 사슬이 멈춘다) | ✅ `packages/*/dist/**` |
| 4 | `dist/ui` (화면 번들) | `build:ui` (vite) | ✅ | ✅ 지우고 7.75s 재생성 | ⚠ 없음 | ✅ |
| 5 | `packages/engine-native/*.node` | `build:native` ← **`prebuild`** | ✅ npm 이 자동으로 부른다 | ⏸ 안 돌렸다 (D 와 겹친다) | ⚠ **낡음을 아무도 안 본다** — Rust 를 고치고 안 빌드하면 옛 `.node` 로 돈다(09-04 D 덤프가 그 사례) | ✅ |
| 6 | `resource/data/master/entities/players/**` (+ `_index.json`) | `npm run deploy` (`deploy-staging.mjs`) | ❌ 안 걸린다 | — | — | ❌ 포장 제외 |
| 7 | `apps/ui/src/shared/utils/leagueTeams.generated.ts` | `scripts/build_refs_from_seeds.py` | ❌ (커밋된 생성물) | ❌ 파이썬이 없어 못 만든다 | ✅ **새로 걸었다** — `refs.json` 과 팀 id 대조 (대회 주차는 `tournamentWeeks.test.ts` 가 CSV 와) | 소스라 번들에 포함 |
| 8 | `release/` | electron-builder | `pack` | — (D 몫) | — | 산출물 자체 |

## 2. 🔴 이번에 나온 것 — 포장이 새고 있었다

**`vite.config.ts` 가 `publicDir: resource/` 라 `resource/` 를 통째로
`dist/ui/` 에 복사한다.** 그런데 포장 목록은 `dist/ui/**` 를 통째로 넣는다 —
그래서 `!resource/…` 로 뺀 것이 **번들 사본으로 그대로 들어갔다.**

실측 (`npm run build:ui` 직후 · 40 MB):

```
  dist/ui/park           31 MB   ← 경기장 그림. 게임이 쓴다 ✅
  dist/ui/logs          4.7 MB   ← 계측 덤프(career-study-s0~5 …). 런타임 참조 0
  dist/ui/data/master   2.8 MB   ← 마스터 데이터 ✅
  dist/ui/assets        1.6 MB
  dist/ui/data/seeds    217 KB   ← CSV 원본. 런타임 참조 0(주석·검사만)
  dist/ui/master.db      28 KB   ← 사본. (09-04 저녁에 원본째 없어졌다 — §4)
```

**포장 목록에 여덟 줄을 더했다** — `resource` 쪽 둘(`logs`·`seeds`)과
`dist/ui` 쪽 여섯(같은 것들 + 이미 빼 둔 셋의 번들 사본).
`buildArtifacts.test.ts` 가 **뺄 자리는 언제나 둘**이라는 걸 못박는다.

## 3. 남은 위험 둘 — 값이 아니라 구조다

| 자리 | 무엇 | 왜 지금 안 고쳤나 |
|---|---|---|
| `.node` 낡음 | Rust 를 고치고 `build:native` 를 안 돌리면 **옛 엔진으로 돈다.** 09-04 에 D 덤프 셋(계약 상한 위반 57%·73%)이 그것 때문이었다 | 소스 해시를 `.node` 옆에 남기고 검사가 대조하는 방식이 맞다 — 빌드 산출물을 건드리는 변경이라 D 와 겹친다. **D 가 pack 을 끝낸 뒤** |
| ~~`master.db` 없음~~ | — | **09-04 저녁에 접었다** — §4 |

⚠ `gen-manifest` 가 「`npm run migrate:entities` 미실행」이라고 찍고 있었는데
**그런 스크립트가 없다.** 없는 명령을 가리키는 안내라 문구를 고쳤다(#6).

---

## 4. `master.db` 를 접었다 (09-04 저녁 · 사용자 확정)

### 4-1. 지우기 전에 확인한 것 — 정말 읽는 데가 없나

**파일을 열어 봤다**(추측 아님 · `better-sqlite3` 를 electron 으로):

```
OBJECTS: [npc_master(table), sqlite_autoindex_npc_master_1,
          idx_npc_master_league, _team, _role, _entry_year]
npc_master rows = 0
```

**표가 하나뿐이고 0행이다.** 문서(옛 CLAUDE.md)는 「콘텐츠(이벤트·템플릿·
밸런스)」가 여기 있다고 적어 뒀는데 **아니었다** — 콘텐츠는 진작부터
`resource/data/master/**` JSON 을 `master:fetch` 로 직접 읽고 있었다.

부르는 자리를 런타임·빌드·계측·검사 전부에서 훑었다:

| 무엇 | 부르는 곳 | 실제로 무엇을 받았나 |
|---|---|---|
| `master:loadEntities` IPC | `masterStore.reloadEntities` · `fetchEntryEntities` 둘 | `npc_master` 가 0행이라 **언제나 `[]`** |
| `basePlayerEntities` (store 칸) | `reloadEntities` 가 채우고 `connectToGameStore` 가 거른다 | **언제나 빈 배열** |
| `advanceWeek` W1 레거시 `else` | `fetchEntryEntities` → 신입생·해외 즉전감 | `length > 0` 이 **한 번도 참이 아니다** |
| `masterBulkUpsertEntities` (preload) | 없음 | 받는 핸들러가 R3a-4d 에 이미 지워져 **부르면 거절** |
| 계측 스크립트 39개 · 검사 228파일 | 0건 | — |

즉 **읽기는 있는데 읽히는 게 없었다.** 그런데 파일이 없으면
`masterDb = null` 로 조용히 같은 `[]` 를 줘서 「빈 게 정상」과 「빌드가
빠졌다」가 구분이 안 됐다 — 그 모호함이 지운 이유다.

### 4-2. 지운 자리 열하나

| # | 자리 | 무엇 |
|---|---|---|
| 1 | `package.json` | `build:masterdb` 스크립트 |
| 2 | `package.json` | `build` 사슬에서 한 줄 · `dev:desktop` 에서 한 줄 |
| 3 | `package.json` | 포장 목록 `!dist/ui/master.db` |
| 4 | `scripts/generate_master_db.cjs` | 파일 통째 (290줄) |
| 5 | `apps/desktop/main.cjs` | `masterDbPath` · `masterDb` 열기(널 분기 포함) · `master:loadEntities` 핸들러 · `Database` require |
| 6 | `apps/desktop/main.cjs` | `checkMasterIntegrity`(SHA-256 대조) · `createHash` require |
| 7 | `apps/desktop/ipc/db.cjs` | `masterRowToEntityRow`(63줄) + export |
| 8 | `apps/desktop/preload.cjs` | `masterLoadEntities` · `masterBulkUpsertEntities` |
| 9 | `apps/ui/.../stores/master.ts` | `basePlayerEntities` 칸 · `fetchEntryEntities` · `reloadEntities` 선수 갈래 |
| 10 | `apps/ui/.../usecases/advanceWeek.ts` | W1 레거시 `else` 갈래(21줄) |
| 11 | `.gitignore` · `scripts/dist-steam.cjs` | 무시 세 줄 · 포장 검증 ③ |

`dist-steam.cjs` 의 ③ 은 **지우지 않고 대상을 옮겼다** — `master.db` 대신
`resource/data/master/_manifest.json` 이 asar 밖에 있는지 본다. 그게 없으면
이벤트가 통째로 안 실린다(실제로 났던 결함).

### 4-3. 전후 실측 — `npm run build`

지우고 다시 만들어 봤다(`dist/ui` · `packages/*/dist` · `_manifest.json` ·
`master.db` 를 전부 지운 뒤):

| | 전 | 후 |
|---|---|---|
| npm 단계 (prebuild 포함) | **10** | **9** |
| 시간 | 13s | 12s |
| 끝까지 도나 | ✅ EXIT 0 | ✅ EXIT 0 |
| `resource/master.db` | 28,672 B 생성 | **안 생긴다** |
| `dist/ui/master.db` (번들 사본) | 28,672 B | **안 생긴다** |

사슬에서 빠진 단계는 `build:masterdb`(= `electron scripts/generate_master_db.cjs`)
하나다. 시간이 1초밖에 안 준 건 그 단계가 원래 electron 을 한 번 띄웠다
내리는 것뿐이었기 때문이다 — **얻은 것은 시간이 아니라 모호함을 없앤 것**이다.

### 4-4. 되살아나지 않게

`buildArtifacts.test.ts` 에 묶음을 하나 더 걸었다(검사 12 → **16**). 다섯이
각각 지운 자리를 지킨다: 스크립트 없음 · `build`/`dev:desktop`/`predeploy`/`pack`
사슬에 없음 · 포장 목록에 줄 없음 · main·preload 에 핸들러/브리지 없음 ·
`db.cjs` 가 행 변환기를 안 내보냄. 정규식은 안 쓴다(`includes` 로 본다).
