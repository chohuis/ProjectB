# ProjectB — AI 작업 규칙

## 필독 — 작업 연속성 (세션이 바뀌어도 이것부터)

**설계 정본은 `DESIGN.md`다.** 게임 방향(Lite 경량화)·리그 구조·데이터 아키텍처·로드맵은 전부 그 문서 기준이며, 이 문서(CLAUDE.md)는 코드 작업 규칙만 다룬다.

- 작업 시작 전 **DESIGN.md §10 로드맵**에서 현재 단계를 확인하고 그 단계의 작업만 진행한다.
- 단계(또는 하위 작업) 완료 시 DESIGN.md §10의 체크 표시와 아래 "진행 현황"을 갱신한다.
- DESIGN.md §3 "육성 코어 보호 목록"의 시스템은 경량화 작업에서 수정 금지.
- 아래 "데이터 계층 구조" 절은 R3a 완료 후 v3 확정 기준으로 갱신됨.

**진행 현황은 [docs/RESUME.md](docs/RESUME.md)가 정본이다.** 브랜치·다음 작업·미결
목록·검증 명령이 거기 있다. 여기 복제하면 stale해진다.

> 요약 (2026-07-31): **Phase 1~7 전부 완료 — `main` 병합됨.** 다음은 Phase 8(성능).
> 설계 정본은 `docs/design/` 아래 roster·draft·promotion·military·fa·finance —
> **수치는 `resource/data/master/players/generation_rules.json`에만 둔다.**
> 로스터 상한·드래프트 라운드·신인 계약·개인 재정·대학 이벤트가 전부 그 파일이고,
> 스태프 15종 계수는 `seeds/onepitch/staff_rules.toml [effects]`다
> (코드에 표를 두 번 적지 말 것 — Phase 7에서 이 결함만 15건 나왔다).
>
> ⚠ **Phase 8 진행 중** — 계획서·실측치 `docs/PHASE8_PLAN.md` (§6이 결과).
> P8-0(계측) 완료: `npm run measure:perf`. 주당 약 2~3초이고 그 **55%가
> `gameStore.save()`의 전량 재저장**이다. 다음은 목표 수치 합의(사용자 확정).
> **성능 비교는 벽시계가 아니라 IPC 바이트로 한다** — 벽시계는 같은 설정에서
> 2배까지 흔들리고, IPC 바이트는 편차 0.5% 미만이다.
>
> ⚠ **해외(ABL·JBL)를 열었다** (2026-08-06). 예전엔 확장팩으로 미뤘었다.
> `releaseScope.ts`의 두 Set이 비어 있고 **그 파일 하나가 스위치다** — 다시 넣으면
> 예전과 완전히 같게 돈다(운영 코드가 전부 `activeProLeagues()`를 거친다).
>
> ⚠ **프로 운영에 리그를 직접 적지 말 것.** 승강·FA·트레이드가 `leagueId ===
> "LEAGUE_KBL"`로 걸러져 있어서, 열자 해외는 **채우는 경로는 있는데 정리하는
> 경로가 없는 리그**가 됐다(1군 41명, 상한 34). `activeProLeagues()`를 쓴다.
>
> ⚠ **외국인 한도를 물을 땐 `isForeignInQuotaLeague(국적)`.** `isForeignPlayer(리그,
> 국적)`은 "그 리그에서 외국인인가"라 **ABL 선수는 ABL에서 내국인**이다.
> 그걸 문지기로 쓴 자리가 다섯이었고 전부 샜다.
>
> ⚠ **이름은 `name`/`nameEn` 둘 다 산다.** 화면은 `teamMap`·`teamsL10n`·
> `entitiesL10n`을 읽는다(언어 반영본). **원본 스토어를 직접 읽으면 그 화면만
> 한국어로 남는다** — `check:namelocale`이 잡는다.

- 세이브 무결성(HMAC) v3 미구현 상태 — 별도 작업 필요 (DESIGN.md §8.4)

## 아키텍처 원칙 (필수 숙지)

**Electron은 껍데기, Rust DLL이 프로그램 본체다.**

| 레이어 | 역할 | 금지 |
|---|---|---|
| `apps/ui/` (Svelte) | 화면 렌더링, 입력값 전달만 | 게임 로직, `Math.random()` |
| `apps/desktop/` (Electron) | DLL 로드, IPC 연결, 파일 I/O | 핵심 알고리즘, 암호화 키, 보안 if문 |
| `packages/engine-native/src/` (Rust) | 게임 본체 — 로직·난수·암호화 전부 | — |

## 절대 금지

- **게임 로직을 `shared/stores/*.ts`에 작성** — store는 상태 보관 + 얇은 패처(`update(s => ({...s, 필드: 값}))`)만.
  그보다 길거나 다른 시스템을 호출하면 `shared/usecases/`로. 상세: [docs/DATA_POLICY.md §5](docs/DATA_POLICY.md)
  *(이 규칙이 없어서 `stores/game.ts`가 2,579줄이 됐고 그중 `processAllLeaguesSeasonEnd` 하나가 566줄이다)*
- **선수·스태프를 미리 만들어 파일로 저장** — 생성 "규칙"만 git에. 결과물은 런타임 생성 ([docs/design/people.md](docs/design/people.md))
- **slot.db 스키마를 `CREATE TABLE IF NOT EXISTS`로만 변경** — 기존 슬롯에 조용히 반영 안 됨.
  반드시 `slotdb.cjs`의 `MIGRATIONS`에 추가하고 `npm run test:migration` 통과시킬 것 (현재 `SCHEMA_VERSION = 4`)
- TypeScript/Svelte에서 `Math.random()` 게임 로직에 사용 — Rust `rand::thread_rng()` 사용
- Electron에 암호화 키, 라이선스 판정, `bool isLicensed()` 단독 export 패턴
- `window.projectB!.*()` 호출 시 `await` 누락
- `packages/engine-native/index.d.ts`, `index.js` 직접 편집 — `npm run build:native` 자동 생성
- 팀/구단/리그 ID 하드코딩 맵·인라인 변환(`.replace(/^CLUB_/...)` 류) 작성 — ID 파생 규칙은 `apps/ui/src/shared/utils/ids.ts`에만 둔다 (Rust는 `npc_sim.rs`의 `farm_team()` 접미사 규칙). 팀 ID 정본은 `refs.json`

## 소식(MessageItem) id 규칙 (2026-08-08)

**`id`는 유일해야 한다.** 소식 목록이 `{#each sorted as msg (msg.id)}`로 id를
키로 잡기 때문에, 중복이 하나만 생겨도 Svelte가 `each_key_duplicate`로 죽고
**세이브가 아예 안 열린다** — 로드 화면에서 멈춘 채 화면엔 단서가 없다.

```
msg-digest-w13              ✗ weekNum은 시즌마다 1로 리셋된다 → 해마다 겹친다
msg-digest-2027-w13         ○ 연도를 넣는다
msg-train-w12-1712345678    ○ Date.now()
msg-tour-open-TOUR_HS_X-2027 ○ 대상 ID + 연도
```

- **`weekNum`은 누적이 아니다.** `advanceWeek`의 `weekInYear = ((weekNum-1)%52)+1`을
  보고 누적이라 읽기 쉬운데, 롤오버가 리셋하므로 그 모듈로는 실질적으로 무의미하다
- **표시용 라벨(월 이름 등)을 id에 넣지 않는다.** 계측이 `messageKindOf`로 종류를
  뽑는데 한글 라벨은 못 벗겨서 한 종류가 달마다 쪼개진다
- **상한 로직은 id 유일성을 전제하지 않는다.** `trimMailbox`는 위치(index)로 고른다

## "한 해에 한 번" 가드는 반드시 저장한다 (2026-08-08)

`lastSeasonEndYear`·`lastDraftYear`가 `gameStore` 안에만 있었다. **가드가 막으려는
결과(NPC 전원 진급·나이 +1, 드래프트 거래기록)는 slot.db에 즉시 쓰여 영구인데
가드 자신은 세션 한정**이라, 앱을 껐다 켜면 없던 일이 됐다.

새로 그런 가드를 만들면 `SaveGame`에 넣고 `fromSaveGame`에서 되살린다.
**둘 중 하나만 하면 아무 일도 안 일어난다.** 게이트: `npm run check:seasonendguard`

## Rust에 새 게임 로직 추가 시 — 2단계 (R2에서 개정)

1. `packages/engine-native/src/*.rs` — 함수 작성 + `lib.rs`에 `#[napi]` export (`#[serde(rename_all = "camelCase")]` 필수)
2. `npm run build:native` — `index.d.ts` / `index.js` 자동 재생성

**끝.** main.cjs/preload.cjs/projectb.d.ts 등록 불필요 — `engine:call` 단일 채널이 engine-native export를 화이트리스트로 자동 노출한다.

```typescript
// TS 호출 (신규 함수 — 등록 없이 바로)
const result = JSON.parse(
  await window.projectB!.engine("myFuncNative", JSON.stringify({ someValue: 42 }))
) as MyResultType;
// fnName = index.d.ts의 export 함수명 (camelCase). serde가 camelCase 자동 변환.
```

- 기존 개별 메서드(`window.projectB.simGameNative(p)` 등)는 내부적으로 engine:call을 경유하는 호환 브릿지 — 유지되지만 **신규 추가 금지**.
- `ipcMain.handle` 개별 등록은 DB·파일 I/O·스테이트풀(match) 채널에만 허용 (R3에서 Repository로 재편 예정).

### ⚠ 함정: 층마다 맞는데 잇는 선이 없다

`serde(default)`가 붙은 필드는 **안 넘겨도 조용히 통과한다.** 그래서 배선 누락이
오류가 아니라 "아무 일도 안 일어남"으로 나타난다.

실제 사례 (2026-08-07, `check:devplayer`):

| 층 | 상태 |
|---|---|
| 규칙 파일 `rosterMax: 34` | 있다 |
| TS `placementRulesFrom` → `farmMax: 34` | 있다 |
| Rust `Placer`의 2군 갈래 | 있다 |
| **팀 목록 `farmTeamIds`** | **안 넘겼다** — 빈 배열을 훑었다 |

`Placer`는 상한과 팀 목록을 **따로** 받는다. 층을 하나씩 읽으면 셋 다 맞아
보이고, 그 상태로 시즌당 1,135명이 갈 곳 없이 야구를 그만뒀다.

**그래서 새 파라미터를 추가할 때:**

1. 값과 대상 목록이 **따로 넘어가는지** 본다. 따로면 둘 다 배선했는지 확인
2. 검사를 **실제 엔진 호출**로 짠다. 규칙 파일·Rust 소스만 읽는 검사는 이 결함을 못 잡는다
3. 검사에 **배선을 뺀 대조군**을 넣는다 — 빼면 실패해야 그 검사가 배선을 보는 것이다
   (`check-devplayer.cjs` ⑥번)

## Rust 함수 패턴

```rust
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MyPayload { pub some_value: f64 }

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MyResult { pub output: f64 }

pub fn calc_my_thing(p: MyPayload) -> MyResult {
    let mut rng = rand::thread_rng();
    MyResult { output: p.some_value * rng.gen::<f64>() }
}
```

## dev 서버 포트

**정본은 `dev-server.config.cjs` 하나다** (기본 5174). `DEV_PORT` 환경변수로 덮어쓴다.

예전엔 이 숫자가 네 군데 각각 적혀 있었다 — `vite.config.ts` · `package.json` ·
`wait-for-port.cjs` · `main.cjs`(CSP·will-navigate). 한 곳만 바꾸면 Electron이
안 뜨거나, 떠도 CSP가 막아 **화면이 하얗게** 나온다. 원인 찾기 제일 나쁜 종류다.

```bash
npm run dev                # 5174
cross-env DEV_PORT=5180 npm run dev   # 다른 프로젝트와 겹칠 때
```

## 빌드 규칙

- Rust 수정 후: `npm run build:native` (증분 빌드, ~5~30초) → Electron 재시작
- TS/Svelte 수정: Vite HMR 자동 반영 (dev 재시작 불필요)
- `packages/core/` 수정: `npm run build:packages` → Electron 재시작

## 코드 스타일

- Rust 구조체 필드: `snake_case` (serde가 `camelCase`로 JS에 노출)
- IPC 채널명: `"네임스페이스:funcName"` 형식 (예: `"week:calcExam"`, `"match:pitch"`)
- TS에서 Rust 결과 타입: `as MyType` 명시적 캐스팅
- 주석은 WHY가 명확할 때만, 코드로 알 수 있는 내용은 생략

## 데이터 계층 구조 (혼동 금지)

> **정본은 [docs/DATA_POLICY.md](docs/DATA_POLICY.md)다.** 데이터를 추가·변경하기 전에 그 문서의
> §1-1 판별 기준과 §6 체크리스트를 볼 것. 아래는 요약이다.
>
> **한 줄**: 데이터는 3종류뿐 — ①정의는 git(CSV/TOML→master.db), ②상태는 slot.db, ③파생은 저장 안 함.
>
> v2 변경: 인물(선수·감독·코치·구단주)은 **전원 런타임 절차 생성**이고
> 선수 `npc` / 스태프 `staff` **테이블이 분리**된다 ([docs/design/people.md](docs/design/people.md)).

### 세 가지 데이터 저장소

| 저장소 | 위치 | 역할 | 수정 시점 |
|--------|------|------|----------|
| **master.db** | `resource/master.db` | 콘텐츠(이벤트·템플릿·밸런스) + **생성 규칙**(`players/staff_rules.json` 등). read-only.<br>⚠ Phase 6A에서 **스태프 JSON 373개를 폐기**했다 — `npc_master`는 이제 빈 테이블이 정상 | `npm run build:masterdb`만 씀 |
| **slot.db** | `userData/saves/slot3_<id>.db` (파일=슬롯) | **선수는 `npc`, 스태프는 `staff`** 테이블이 유일 정본. 둘 다 런타임 절차 생성.<br>공통 조회는 `person` VIEW | `repo:call`(→`shared/repo/slotRepo.ts`) 커맨드만 씀 — 직접 접근 금지 |
| (폐기됨) | ~~master_overlay.db~~ / ~~entities/players/PLY_*.json~~ / ~~projectb_v2.db~~ | — | R3a-4d에서 완전 제거. 재도입 금지 |

### 런타임에서 NPC 데이터 흐름

```
새 게임/리그 활성화
  → Rust generate_league_roster_native (worldSeed 결정적)
    → slotRepo.createSlot / insertNpcs → slot.db npc 테이블 INSERT

이후 모든 상태 변경 (이적/드래프트/FA/입대/은퇴/주간 성장)
  → shared/repo/slotRepo.ts 의 타입드 커맨드
    (transfer/swapTeams/assignDraft/enlist/discharge/retire/updateWeekly)
    → main 프로세스 repo:call → apps/desktop/ipc/slotdb.cjs → SQLite 트랜잭션 1개
```

**선수 데이터를 JSON 파일로 사전 생성하지 않는다. 전부 런타임에 Rust가 생성한다.**
**overlay나 npc_runtime 같은 별도 "변경분" 저장소를 만들지 않는다 — slot.db가 유일 정본이다.**

### 작업 시 규칙

- NPC(선수) 상태를 바꾸는 코드는 반드시 `shared/repo/slotRepo.ts`의 커맨드를 거친다. `window.projectB.repo(...)` 직접 호출 금지(레이어 우회).
- 새로운 상태 변이가 필요하면 `apps/desktop/ipc/slotdb.cjs`의 `commands`에 커맨드를 추가하고(트랜잭션 1개로), `slotRepo.ts`에 타입드 래퍼를 노출한다.
- `entities/players/` 디렉토리는 **Phase 6A에서 삭제됐다.** 선수도 스태프도 JSON으로 사전 생성하지 않는다 — 생성 규칙(`seeds/onepitch/*.toml|csv`)만 git에 둔다.
- `master:fetch` IPC는 이벤트·훈련·업적 등 콘텐츠 JSON 전용이다 (NPC에 쓰지 않는다 — 애초에 NPC는 master.db에 없음).
- 레거시 채널(`npc:getByLeague`/`swapTeams`/`updateContracts`, `league:add/getTransactions`)은 내부적으로 slotdb 커맨드를 감싸는 호환 래퍼다 — 신규 코드는 여기 의존하지 말고 `slotRepo`를 직접 쓴다.
- `window.projectB` 없는 환경(Vite 단독)에서는 저장/로드가 동작하지 않는다 — `npm run dev` (Electron 포함)로 실행해야 한다.
- ⚠ **세이브 무결성(HMAC 변조 감지) 미구현** — v2의 signSlot/verifySlot은 R3a-4d에서 제거됐고 v3에 아직 대체 기능 없음. 필요 시 새로 설계할 것 (DESIGN.md §8.4 참고).