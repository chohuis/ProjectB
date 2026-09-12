# ProjectB (OnePitch) — AI 작업 규칙

> **규칙만 적는다.** 왜 그 규칙이 생겼는지(날짜 · 실측 · 틀렸던 가설 · 해시)는 [docs/CLAUDE_HISTORY.md](docs/CLAUDE_HISTORY.md)에 원문 그대로 있다 — 규칙 옆의 「→ 역사 §제목」이 그 자리다. 2026-09-12 에 갈랐다.
> 숫자(줄 수 · 검사 수 · 상한)는 여기 적지 않는다 — 적으면 뒤처진다. 명령으로 잰다.

## 필독 — 어디서 무엇을 보나

| 무엇 | 어디 |
|---|---|
| 작업 대상 | **`02.SvelteElectron/` 하나.** `04.GodotOnePitch/` 는 읽기만 · 지우지 않는다 (루트 `CLAUDE.md`) |
| 문서 색인 | **[docs/README.md](docs/README.md)** — 108장 중 무엇이 정본이고 무엇이 옛 것인지 |
| 현황판 | [docs/PROGRESS_TREE.md](docs/PROGRESS_TREE.md) — OP 만 고친다 |
| 앞으로의 계획 | [docs/PLAN_102_2026-09-12.md](docs/PLAN_102_2026-09-12.md) |
| 밸런스 값 | [docs/BALANCE_BACKLOG.md](docs/BALANCE_BACKLOG.md) — 값을 바꾸면 여기 적는다 |
| 데이터 규약 | [docs/DATA_POLICY.md](docs/DATA_POLICY.md) |
| 계산의 경계 | [docs/ENGINE_OWNERSHIP.md](docs/ENGINE_OWNERSHIP.md) |

**새 워크트리를 세울 때 넷**: `npm ci` · `npm run gen:manifest` · `npm run build:packages` · `npm run build:native`(도장이 찍힌다). `.node` 를 복사만 하면 도장이 없어 계측이 막힌다. → 역사 §이벤트는 실제로 돌고 있다

**매 push 마다 CI 가 본다** (루트 `.github/workflows/ci.yml`) — lint · format · tsc · vitest · cargo test · clippy · 데이터 위생. `main` 은 트렁크(`extract-modals`)와 같이 민다. pre-commit hook 이 바뀐 파일만 prettier + eslint 를 돈다(빨강이면 커밋이 막힌다).

## 아키텍처 원칙

**Electron 은 껍데기, Rust 가 프로그램 본체다.**

| 레이어 | 역할 | 금지 |
|---|---|---|
| `apps/ui/` (Svelte) | 화면 렌더링 · 입력값 전달 | 게임 로직 · `Math.random()` |
| `apps/desktop/` (Electron) | DLL 로드 · IPC · 파일 I/O | 핵심 알고리즘 · 암호화 키 · 보안 if 문 |
| `packages/engine-native/src/` (Rust) | 게임 본체 — 로직·난수·암호화 전부 | — |

계층 안에서: `pages/`(화면 한 장) · `features/`(화면 조각) · `shared/usecases/`(상태를 바꾸는 것) · `shared/stores/`(상태 보관 + 얇은 패처만) · `shared/utils/`(순수 함수) · `shared/repo/`(IPC 너머 DB).

## 절대 금지

- **게임 로직을 `shared/stores/*.ts` 에** — store 는 `update(s => ({...s, 필드: 값}))` 만. 그보다 길면 `usecases/`. → 역사 §절대 금지
- **TS/Svelte 에서 `Math.random()` 을 게임 로직에** — 난수는 Rust 가 만들고 씨앗을 넘긴다
- **선수·스태프를 미리 만들어 파일로 저장** — 생성 규칙만 git · 결과물은 런타임 생성
- **slot.db 스키마를 `CREATE TABLE IF NOT EXISTS` 로만 변경** — `slotdb.cjs` 의 `MIGRATIONS` 에 넣고 `npm run test:migration`
- **Electron 에 암호화 키 · 라이선스 판정 · `isLicensed()` 단독 export**
- **`window.projectB!.*()` 에 `await` 누락**
- **`packages/engine-native/index.d.ts` · `index.js` 직접 편집** — `build:native` 가 새로 쓴다(그래서 prettier 범위 밖)
- **팀/구단/리그 ID 하드코딩 맵 · 인라인 변환** — 파생 규칙은 `utils/ids.ts` 하나 · 팀 ID 정본은 `refs.json`
- **NPC 상태를 `slotRepo.ts` 커맨드 밖에서 바꾸기** — `window.projectB.repo(...)` 직접 호출 금지
- **`resource/data/master/**` 를 prettier · eslint 범위에 넣기** — JSON 포맷이 바뀌면 diff 가 4MB 다
- **정본을 둘 만들기** — 같은 표·같은 상수·같은 함수를 두 곳에 두면 한쪽만 고쳐진 채 남는다. 이 저장소가 제일 많이 밟은 형태다

## 데이터 — 3종류뿐

> 정본은 [docs/DATA_POLICY.md](docs/DATA_POLICY.md). **①정의는 git(JSON) · ②상태는 slot.db · ③파생은 저장 안 함.**

| 저장소 | 위치 | 규칙 |
|---|---|---|
| 마스터 | `resource/data/master/**` | read-only 콘텐츠 + 생성 규칙. 목록은 `_manifest.json`(**gitignore 된 생성물** · `gen:manifest` · `pretest`·`build` 가 먼저 만든다) · 읽기는 `master:fetch` IPC 하나 |
| slot.db | `userData/saves/slot3_<id>.db` | 선수 `npc` · 스태프 `staff` 테이블이 유일 정본 · `repo:call` 커맨드만 |
| 폐기됨 | `master_overlay.db` · `entities/players/*.json` · `resource/master.db` | 재도입 금지 → 역사 §데이터 계층 구조 |

수치 정본은 `resource/data/master/players/generation_rules.json` · 스태프 계수는 `seeds/onepitch/staff_rules.toml` — **코드에 표를 두 번 적지 않는다.**

## Rust — 새 게임 로직은 2단계

1. `packages/engine-native/src/*.rs` 에 함수 + `lib.rs` 에 `#[napi]` export (`#[serde(rename_all = "camelCase")]`)
2. `npm run build:native` — `index.d.ts`/`index.js` 재생성 + **도장**

TS 호출은 `window.projectB!.engine("fnName", JSON.stringify(payload))` 하나 — 개별 메서드 신규 추가 금지. `ipcMain.handle` 개별 등록은 DB·파일·스테이트풀 채널에만.

**`.node` 가 낡았는지는 기계가 본다** — `npm run check:native`(내용 해시 · mtime 아님). 계측 부팅(`headless.boot()`)이 낡으면 던진다. `Finished in 0.10s` 는 캐시다. → 역사 §빌드 규칙

⚠ **`serde(default)` 필드는 안 넘겨도 조용히 통과한다.** 새 파라미터를 추가할 때: 값과 대상 목록이 **따로** 넘어가는지 · 검사를 **실제 엔진 호출**로 · **배선을 뺀 대조군**을 넣어 빼면 실패하는지. → 역사 §함정: 층마다 맞는데 잇는 선이 없다

## 규칙 목록 — 한 줄씩 (왜는 역사에)

**소식·저장**
- **소식 `id` 는 유일** · 연도를 넣는다 · 「무엇이 이 소식을 한 번만 나게 하는가」를 id 에 적는다. 겹치면 Svelte 가 죽고 **세이브가 안 열린다.** 게이트 `check:msgdupid`(같은 id 두 번) · `check:msgdup`(같은 id 다른 소식). → 역사 §소식 id 규칙
- **좁게 읽었으면 좁게 써라.** 저장 왕복 검사 셋 — `check:savecolumns`(`test:v3` 안) · `check:roundtrip`(저장·로드 건드렸을 때 · **새 프로세스로**) · `check:msgdupid`. `undefined` 와 `null` 은 다르다. → 역사 §좁게 읽었으면 좁게 써라
- **「한 해에 한 번」 가드는 `SaveGame` 에 넣고 `fromSaveGame` 에서 되살린다.** 둘 중 하나만 하면 아무 일도 안 일어난다. 게이트 `check:seasonendguard`. → 역사 §한 해에 한 번 가드

**주 진행·일정**
- **주 경계에서 경기 결과는 `weekNum - 1`** — `processWeekBoundary` 는 막 들어선 주를 받는다. `e.week === weekNum` 으로 결과를 찾으면 의심. 게이트 `measure:relations`. → 역사 §주 경계
- **주인공 리그는 `s.schedule`, 나머지는 `leagueSchedules`.** 새 무대로 넘어가면 `protagonist.leagueId` 를 같이 옮긴다(안 옮기면 배경 시뮬이 그 리그를 건너뛴다). 시즌 중 승강은 `seasonStore.switchProtagonistLeague`. 일정 만드는 블록은 `reinitSeasonSchedules` 하나. → 역사 §주인공 리그는 schedule
- **주를 안 넘기고 대기(pending)만 밀어 넣는 블록**을 만들면 반드시 가드·플래그 소진을 같이. 트레이드·강등·체육부대가 같은 자리에서 셋 다 났다. 자동 진행은 같은 pending 이 50회 돌아오면 「주 진행이 막혔다 — 어느 pending」을 말한다.

**이벤트·조건**
- **이벤트 조건은 단수·복수가 둘 다 산다**(`stage`/`stages[]` · `leagueId`/`leagueIds[]`). 세는 코드는 `conditionEvaluator` 판정을 그대로 옮긴다. → 역사 §이벤트 조건은 단수·복수
- **조건 타입을 만들면 표 넷**(평가기 · 타입 유니온 · `master.ts CONDITION_FIELDS` · 데이터)을 같이 — `CONDITION_FIELDS` 는 타입이 유니온에 묶여 있어 안 적으면 tsc 가 그 자리에서 빨강이고, `conditionSync`·`masterLoadReal` 검사가 나머지를 본다
- **주사위가 부른 것은 상태를 못 바꾸고, 상태가 부른 것만 상태를 바꾼다.** 이벤트(등급 넷)는 성장을, 통지(등급 없음)는 세계를 바꾼다. 정본 `docs/PLAN_MESSAGE_LANES_2026-09-08.md` · 게이트 `check:lanes` · `check:rewards`
- **효과 키 · 문안 · 조건이 서로 거짓말하지 않게** — 문안이 「내려간다」면 효과가 내려야 하고, 조건이 「탈락」이면 실제 탈락이어야 한다. 게이트 `check:tone` · `check:rewards`

**재기·세기**
- 🔴 **세는 코드는 데이터가 실제로 쓰는 표기를 먼저 훑고 짠다.** 효과에 객체형·배열형 두 꼴, 판 JSON 칸은 한국어, `불완전` 표식은 배열 안 — 잣대가 먼저 틀린 것이 아홉 번이다. 세고 나서 「결함」이라 부르기 전에 잣대부터 의심한다. → `docs/SIM_REPORT_COMBINED_2026-09-11.md` §8
- **「없다」고 적기 전에 재현한다.** `pages/` · `features/` · `shared/` · **`scripts/`** 를 다 본다. 도구가 없다고 말하기 전에 `scripts/` 와 `package.json` 을 본다(프로브·계측·드라이버가 60개 넘게 있다). 화면이면 띄워 본다(`scripts/drive.mjs`). → 역사 §「없다」고 적기 전에
- **결함인가 상황인가** — 못 돌아오는 상태(단조 증가·영원히 0·규칙 위반)만 결함. 부상으로 잠깐 얇아진 로스터는 상황이다. 「지금 나쁘다」가 아니라 「스스로 돌아오는가」. → 역사 §결함인가 상황인가
- **안 잰 것은 초록이 아니다.** 못 쟀으면 못 쟀다고 적는다. 「살리면 좋아진다」는 언제나 참이라 그것만으로는 지금 하는 이유가 안 된다
- **가설을 세웠으면 그것부터 재라 · 고치려는 자리의 주석을 먼저 읽는다 · 전후를 재고 3회씩 · 죽은 갈래를 두지 않는다**(죽은 것과 **아직 안 부른 것**은 다르다 — `removeTag` · serde 계약서 구조체)
- **문서에 숫자를 적지 않는다** — 명령을 적고 돌리게 한다. `MAX_MAILBOX` 를 여섯 번 틀리게 적었다

**계측·밸런스**
- **결정성은 계측이 재현되는 수준까지.** 게임 전체 결정성은 목표가 아니다. 계측 모드(`headless.boot()` 가 심는 `__PB_MEASURE__` · 읽는 곳 `measureMode.ts` 하나)에서만 주인공 경기가 `seedOf(worldSeed, 시즌, 주차, scheduleId)` 로 씨앗을 받는다. 실제 플레이는 안 바뀐다. 게이트 `check:measurerepro`(2회 동일 · 완주). → 역사 §결정성 정책
- **밸런스는 재고 나서 만진다 · 한 번에 한 변수 · 값은 제안값 + `BALANCE_BACKLOG`.** 사용자 확정은 동작·구조·범위만. 두 변수를 같이 움직이면 원인을 못 가린다
- **계측 플레이어는 성향 셋**(성장·안전·대충) · 성장형이 밸런스 기준. 판마다 JSON(`runs/#NN.json`) · 서식 `docs/PLAN_SIM_REPORT_2026-09-09.md` · 삼킨 예외·정지·끊김을 센다
- **동시 실행 안전선 6**(12코어 실측). 판이 도는 중에 **소스를 고치지 마라**(도장이 어긋나 판이 죽는다). 옛 판은 덮지 말고 별 폴더에

**세션·도구**
- 🔴 **배경 작업을 걸고 턴을 끝내지 않는다** — 아무도 깨우지 않는다. 같은 턴에서 폴링한다. 이걸로 판이 두 번 죽었다
- **electron 은 동시 셋까지 · 죽일 때는 PID 로**(`taskkill /F /IM electron.exe` 는 남의 판을 죽인다) · `DRIVE_USER_DATA=1` · `pack` 은 electron 0 일 때만 · `ELECTRON_RUN_AS_NODE` 가 셸에 남으면 `npm start` 가 죽는다
- **사용자 세이브는 읽기만 · 사본으로.** 지우거나 앞으로 돌리지 않는다
- **dev 포트 정본은 `dev-server.config.cjs` 하나**(기본 5174 · `DEV_PORT`). → 역사 §dev 서버 포트
- **로스터 이동을 고치기 전에 `docs/ROSTER_FLOWS_2026-09-03.md` · 보직은 `docs/ROLE_ASSIGNMENT_2026-09-03.md` 를 본다**
- **검사에 정규식을 쓰지 않는다 · 파일은 Write/Edit 로 · 사용자 응답만 존댓말, 주석·문서는 평서체**

## 코드 스타일

- Prettier(`printWidth 100` · `.prettierignore` 에 검사가 글자로 읽는 파일 59 — 그 목록은 줄여야 한다) · ESLint(오류 0 이 관문 · 경고는 아님) · `scripts/**` · `docs/**` · `resource/**` 는 범위 밖
- Rust 필드 `snake_case`(serde 가 camelCase 로) · `cargo clippy` 는 CI 에서 세되 관문 아님(0 이 되면 `deny` 로 되돌린다)
- IPC 채널 `"네임스페이스:funcName"` · TS 에서 Rust 결과는 `as MyType`
- **주석은 WHY 가 명확할 때만.** 고친 자리에는 「왜 이렇게 고쳤나 · 어느 가설이 틀렸나」를 남긴다 — 이 저장소의 주석이 다음 사람을 여러 번 구했다

## 빌드·포장

- Rust 수정 → `npm run build:native` → 도장 확인 · TS/Svelte 는 HMR · `packages/core/` 는 `build:packages`
- 포장은 `dist-steam.cjs` 검사 전부 초록(제외가 둘 다 드는지 · asar 안으로 새는지) · `smoke:dist` · exe SHA256 을 현황판에
- 태그는 주석 태그 — `git rev-parse v1.0.1` 은 **태그 객체**이고 커밋은 `v1.0.1^{commit}`
