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

## 주 경계에서 경기 결과는 `weekNum - 1`이다 (2026-08-08)

`processWeekBoundary(nextWeekNum)`은 `seasonStore.advanceWeek()` **뒤에** 불린다.
인자로 받는 `weekNum`은 **막 들어선 주**이고 그 주 경기는 아직 안 치렀다.

```ts
// ✗ 이번 주 — result가 영원히 null이다
schedule.find(e => e.week === weekNum && e.isProtagonistGame && e.result != null)
// ○ 지난 주 — 방금 시뮬한 경기
schedule.find(e => e.week === weekNum - 1 && e.isProtagonistGame && e.result != null)
```

**이 결함은 조용하다.** 예외도 로그도 안 난다. 실제로 두 자리가 틀려 있었고,
감독·동료 관계가 **전 커리어에 걸쳐 한 번도 안 움직였는데** 훈련에 걸린 코치
관계는 멀쩡해서 "관계도는 도는 것 같은데 이상하다"로만 보였다.
리그 경기 결과 소식은 **한 통도 온 적이 없었다.**

- 주 경계 안에서 `e.week === weekNum`으로 **결과를 찾으면** 의심한다
- 게이트 `npm run measure:relations` — 관계가 전원 중립이면 실패한다
- 검사 `weekBoundaryOffset.test.ts`가 호출 순서 전제까지 같이 못박는다

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
---

# 동결 해제 — 여기가 다시 개발 대상이다 (2026-08-20)

Godot 이주(`04.GodotOnePitch/`, 08-13 시작)를 멈추고 **02로 돌아왔다.**
화면 완성도가 02가 앞선다는 사용자 판단이다.

**04는 지우지 않는다. 참조용으로 둔다** — 04 주석에 02 동작 명세가 실측
근거와 함께 있고(드래프트 앵커·수상 자격선·잠재력 범위·NPC 대응표·구장
좌표), 검사 4,141개가 02 결함 여럿을 찾아냈다.

⚠ **04 문서를 그대로 믿지 않는다.** "02가 이랬다"고 적힌 것 상당수가
**고치기 전 상태의 기록**이다(02 마지막 커밋 08-17 · 04 시작 08-13, 겹친다).
2026-08-20에 훑어보니 대부분 **이미 여기서 고쳐져 있었다** — 구단 성향
호출 · 부상 완치 복구 · NPC 성장 `t.tier` · 관계 주 인덱스 · 주인공
지명(`draftDrafted`) · 주인공 은퇴 · 시즌 종료 통합 · 자동 진행 분류.
**옮기기 전에 02 코드에서 아직 그런지 확인한다.**

⚠ 04 문서의 "02 검사 53개"는 **파일 수**다. 실제 검사는 **1,300건**이다
(2026-08-30 · 149파일). 613건은 2026-08-20 값이었다.

## 🔴 결함인가 상황인가 — 고치기 전에 이걸 먼저 가른다 (2026-08-31)

**이 게임은 살아 있는 시뮬레이션이다.** 부상이 겹쳐 야수가 8명이 되는 건
실제 야구에도 늘 있는 일이고 **그걸 관리하는 게 게임**이다. 그런 상태를
결함으로 부르면 없는 결함을 쫓게 된다 — 이 세션에서 실제로 그랬다.

### 가르는 기준

| | 무엇을 보나 | 판정 |
|---|---|---|
| 🔴 **못 돌아오는 상태** | 단조 증가·감소 · 영원히 0 · 규칙 위반 | **결함** |
| ⚠ **일시적 붕괴** | 부상·콜업으로 잠깐 얇아짐. 몇 주 뒤 돌아온다 | **상황** — 보고만 한다 |

**"지금 나쁘다"가 아니라 "스스로 돌아오는가"를 본다.**

### 2026-08-31 세션의 실례 — 셋은 결함, 셋은 아니었다

**결함이었던 것** (전부 시간이 지나도 안 돌아온다):

```
부상이 군 신분을 지워 전역이 안 됨    상무 26 → 54 로 단조 증가
야수 live OVR 이 전부 0               상무 선발 3년 39명 **전원 투수**
웨이버가 군팀을 데려감                 미필 32세가 상무에 눌러앉음
```

**결함이 아니었던 것** (고칠 게 없었다):

```
"독립 9팀이 30 → 44로 부푼다"    rosterMax 45 안쪽. **말 자체가 틀렸다**
"KBL 2군이 상한 34를 넘는다"      육성선수가 정원 밖 인원(intakeMax 10). 설계대로
"KBL 2군 투수가 모자라다"          규칙 주석이 이미 답을 적어 뒀다 —
                                   "시즌 중이다 … 병목은 상한이 아니라 보충 주기다"
"대학이 포수 0팀·타순 미달이다"     **재는 자리가 틀렸다** — 아래
```

### ⚠ 대학 로스터 — 시즌이 끝난 뒤를 재고 있었다 (2026-08-31)

`test:rosterbalance` 가 대학 실패 4건을 매번 냈다. 유입을 의심했는데
유입은 이미 상한까지 차 있었다 — 학년분포 `{1:400, 2:421, 3:397, 4:439}`
= 50팀 × 8명(`universityAnnualMax`). 주차별로 찍으니 한 주뿐이었다:

```
2026W32 드래프트 **전**  야수11/투수8 · 포수0 **0팀**
2026W32 드래프트 **후**  야수 8/투수6 · 포수0 **4팀**   ← 여기만
2026W40                  야수 8/투수6 · 포수0 **0팀**   ← 다음 측정엔 없다
4년 최소야수 추이  11 → 9 → 11 → 14                     ← 돌아온다
```

**W32 는 `CAREER_RESULT_WEEK`**(드래프트가 4학년을 데려가는 주)이고,
**대학 시즌은 W29 에 이미 끝난다**(`UNIV_CAREER_HUB_WEEK`).
판정 창이 전 리그 W1~38 인데 `autoRun` 은 W0 → W32 → W40 으로 뛴다 —
아마추어는 **시즌 안에서 한 번도 안 재고 있었다.**

🔴 **고칠 곳이 둘이다.** 창을 좁히기만 하면 대학은 **표본이 0건**이 된다:

```
SEASON_END_WEEK        판정 창 오른쪽 끝을 리그마다 (독립 26·고교 28·대학 29)
AMATEUR_SAMPLE_UNTIL   거기까지 oneWeek() 으로 한 주씩 올라 표본을 만든다
```

⚠ 값이 `seasonWeeks.ts`(TS)와 검사(CJS) 두 곳에 적힌다 — CJS 가 TS 를 못
읽는다. `seasonWeekCalendar.test.ts` 가 그 둘을 묶는다.

### ⚠ 검사가 이 구분을 못 하고 있다

`test:rosterbalance` 는 **한 시점의 최악값**을 보고 "시즌 중 야수 9 미달 0팀"을
요구한다. 부상이 겹친 한 주도 실패로 잡히니 **일시적 붕괴와 구조적 결함이
같은 색으로 나온다.** 잣대를 "몇 주 연속 미달인가"로 바꿔야 갈린다
(부상은 돌아오고 구조적 결함은 안 돌아온다).

### 설계 방향 — 초기 세팅만 맞추고 그 뒤는 상황에 맡긴다

사용자 확정(2026-08-31): **생성 시점에 팀 색깔과 최소 보장을 만들고, 이후의
붕괴·복구는 게임의 일부다.** 로스터를 프로그램으로 늘 평평하게 유지하려 들면
관리하는 재미가 사라진다. 자세한 것은 [PLAN_ROSTER_CAREER.md](docs/PLAN_ROSTER_CAREER.md).

---

## 기준선과 남은 결함

**[docs/BASELINE_2026-08-20.md](docs/BASELINE_2026-08-20.md)가 정본이다.**
되돌아온 날 잰 값이 거기 있다.

| # | 남은 결함 | 위치 | 비용 |
|---|---|---|---|
| 1 | 난수 — **정책이 바뀌었다(2026-08-24).** 아래 참고 | — | — |

> **결정성 정책** — 사용자 확정 2026-08-24
>
> **게임 전체 결정성은 목표가 아니다.** 실제 플레이는 매번 달라도 된다.
> 필요한 건 **계측이 재현되는 수준**이다.
>
> 왜 그런가: 인과가 흐르는 건 정상이다 — 부상→결원→콜업→이적이 달라지고,
> 승패→순위·사기→FA·재계약이 달라진다. 그건 그대로 둔다.
> 문제였던 건 **같은 입력인데 결과가 다른 것**이고, 그것도 계측을 못 하게
> 만드는 만큼만 문제다. 밸런스는 **씨앗 여러 개 × 여러 실행 평균**으로도 잰다.
>
> **실측 (2026-08-24)**
>
> ```
> thread_rng() 총 28곳
>   씨앗을 받는 폴백   13곳   seed==0이면 예전 경로 — **정상이다**
>   씨앗을 못 받는 자리 14곳   lib.rs 7 · player_engine 2 · week_engine 2 ·
>                              finance 1 · player_agent 1 · team_engine 1
> ```
>
> ⚠ **14곳이 전부 고칠 자리도 아니다.** `calc_trade_rumor`·`calc_military_week`는
> 호출부가 0건(미사용)이고, `calc_npc_injuries`는 이미 씨앗을 받고 TS도
> 제대로 넘기고 있었다. **세는 것부터가 작업이다.**
>
> ⚠ 고칠 때는 **호출부가 이미 재료를 넘기는지 먼저 본다** — 이번에 고친 여덟
> 자리 중 넷이 "한쪽은 넘기는데 한쪽이 안 받는" 경우였다:
> `roll_random_batch`(TS가 seedOf로 넘기는데 Rust가 버렸다) ·
> `sim_game`(TS가 worldSeed·scheduleId를 넘기는데 구조체가 안 받았다) ·
> `test-injury.cjs`(엔진은 받는데 검사가 안 넘겼다).
>
> ⚠ 씨앗 재료에 **구분자를 섞는다** — 주인공 부상이 NPC 부상과 같은
> `"injury"`를 쓰던 걸 `"injury-protagonist"`로 갈랐다.
>
> ⚠ `test:foreign`(4회 중 1회 실패)·`test:rosterbalance`(3~4건 흔들림)은
> 이 정책의 하위 증상이다. **기준선을 같이 재야 회귀인지 갈린다.**
| 2 | ~~이벤트 로더 **0건**~~ — **틀렸다(2026-08-23 실측).** 아래 참고 | — | — |

> **이벤트는 실제로 돌고 있다** — 트랙 B 실측 · A 검증 (2026-08-23)
>
> ```
> resource/data/master/events/   535건 (필수 105 · 조건부 258 · 랜덤 172)
> 로더   stores/master.ts  loadEventsFromManifest()    있다
> 호출   usecases/advanceWeek.ts  runEventEngine()     있다
> ```
>
> `events.toml`은 03/04 시절 형식이라 런타임이 안 읽는 게 맞다. 다만 그걸
> "로더 0건"으로 적어 둔 탓에 **두 트랙이 각각 한 번씩 헛짚었다.**
>
> ⚠ **왜 그렇게 보였나** — `_manifest.json`이 없으면 로더가 `events/rules/*.json`이라는
> **19건짜리 스텁으로 조용히 폴백**하고 `console.warn` 한 줄만 남겼다. 콘텐츠의
> **3.5%**로 게임이 그냥 돌았고, B가 그 상태로 6시즌을 재고 오진했다.
> B가 `throw`로 바꿨다 — 이젠 매니페스트가 없으면 안 뜬다.
>
> ⚠ **새 워크트리를 팔 때 세울 것은 넷이다** (예전 문서엔 `.node` 하나만 있었다):
> `npm install` · `npm run gen:manifest` · `npm run build:packages` · `.node` 복사
>
> ⚠ 같은 형태가 다른 데서도 나온다 — **데이터가 코드와 어긋나도 아무도 안 죽고
> 로그도 안 남는다.** 게임은 돌고 콘텐츠만 사라진다. B가 찾은 네 건이 전부
> 그 부류였고(조건 오타로 35종 사망 · 업적 해금 불가 · 스텁 폴백),
> A 쪽에서도 2026-08-23에 같은 형태가 나왔다 — **연봉 산식을 잘못 물렸는데
> 검사 688건이 전부 통과했다.** 총량 지표로는 분포가 뒤집혀도 안 보인다.
| ~~3~~ | ~~상무 Phase 1이 한 번도 안 돈다~~ | — | **2026-08-28 고쳤다 · 아래** |
| ~~4~~ | ~~구장 좌표가 그림과 어긋난다~~ | — | **2026-08-20 고쳤다** |
| ~~5~~ | ~~FA 미계약자가 야구를 그만둔다~~ | — | **2026-08-28 고쳤다 · 아래** |
| 6 | FA 미계약 뒤 처리가 **거칠다** — 아래 참고 | `npc_sim.rs` `fa_fallback` | 중간 |

> **상무 선발** — 2026-08-28 고쳤다. 적혀 있던 것과 **다른 결함이었다.**
>
> 문서엔 "호출부가 `&[]`를 넘긴다"였는데 그건 **Rust 하드코딩 얘기고 이미
> 고쳐져 있었다.** 실제로는 셋이었다:
>
> **A. 호출부가 둘인데 한쪽만 배선돼 있었다.**
> `militaryCalcSelection`을 부르는 자리가 `stores/game.ts`(NPC)와
> `usecases/advanceWeek.ts`(주인공) 둘인데, 주인공 쪽만 `vacatingPositions`를
> 안 넘겼다. `serde(default)`라 조용히 빈 배열로 통과하고 **주인공만 Phase 1
> 없이 순수 OVR로** 판정받았다.
> ⚠ 바로 위 주석에 같은 형태가 적혀 있다 — "예전엔 `maxTotal: 10`이 여기
> 박혀 있었다". **같은 함수의 다음 인자에서 같은 일이 또 났다.**
>
> **B. Phase 2가 한 번도 안 돌았다.** 상무 정원 26 / 복무 2년이라 매년
> 전역자가 정원(13)과 같아서, Phase 1이 정원을 전부 먹었다.
>
> ```
> 예전(상한 없음)  3회차 전역 21건 → Phase1 13 / Phase2  0
>                  4회차 전역 13건 → Phase1 13 / Phase2  0
> 지금(0.5)        3회차 전역 21건 → Phase1  7 / Phase2  6
>                  1회차 전역  1건 → Phase1  0 / Phase2 13
> ```
>
> **C. 팀당 상한이 반쪽이었다.** Phase 2의 팀 카운터가 0에서 시작해서, Phase 1로
> 6명을 보낸 팀이 Phase 2에서 **3명을 더** 가져갔다(검사에서 한 팀 9명, 상한 3).
> Phase 1이 팀을 안 보는 건 의도지만 그 인원이 팀 몫에서 사라지면 안 된다.
>
> 값은 `militaryRules.phase1Ratio`(0.5)가 정본이다. 거르는 규칙은
> `militaryRules.ts`의 `sportsVacatingPositions`·`sportsVacatingFromNpcs`다 —
> **호출부에 인라인으로 적지 마라.** 그래서 두 번째 호출부가 비었다.
>
> 계측은 `probe-sportsunit.cjs`다. Phase 1/2 분해·팀 쏠림·포지션 분포를 찍는다.
> ⚠ 예전 프로브는 **"선발 13명"만 찍어서 Phase 2가 안 도는 걸 못 봤다** —
> 총량 지표는 분포가 죽어도 안 보인다.

> **FA 미계약자 결말** — 2026-08-28 고쳤다 (사용자 지시)
>
> FA를 못 구한 선수의 **3분의 2가 야구를 아예 그만두고 있었다**(`quit_baseball`).
> 은퇴가 아니라 27세 프로 5년차가 갈 곳이 없어 그만두는 것이었다.
>
> **원인** — 미계약자를 `current_league = "LEAGUE_INDEPENDENT"`에 소속만 비워
> 두고 **진로 배정(12단계)에 넘겼다.** 거기서 `Placer`가 미지명 고졸(102개교)·
> 대졸(50개교)·방출자와 한 통에 넣고 대학→2군→독립 순으로 자리를 찾는데,
> 프로 경력자는 대학이 막히고 2군 10팀·독립 10팀 자리는 미지명자가 먼저 채운다.
> **포기 사유가 100% "방출"이었다** — 한 건도 예외가 없었다.
>
> **고친 것 둘** (사용자 확정: "원 소속팀이랑 재계약, 그마저도 안 되면 은퇴")
>
> 1. `fa_fallback()` — 원소속 재계약(정원이 있으면) → 없으면 **`retirement`**.
>    진로 배정 통에 안 넣는다. `quit_baseball`이 아니다.
> 2. 🔴 **Rust FA 신청이 원소속 팀을 안 남기고 있었다.** `original_league_id`만
>    넣고 `current_team`을 비워서 떠난 팀을 잃어버렸다. TS(`market.ts`)는
>    `originalTeamId`를 제대로 넣는데 **Rust만 안 넣었다** — 1번을 고쳐 놓고
>    재계약이 **0건**이라 드러났다.
>
> ```
> 고치기 전     미계약 6,200건 · 은퇴   1% · 야구포기 67% · 계속 32%
> 1차(팀 없음)  미계약 6,410건 · 은퇴 100% · 야구포기  0%   ← 재계약 0건
> 원소속 복구   미계약   652건 · 은퇴 100% · 야구포기  0%
>
> FA 계약(한 해)  전: KBL 17.6 · ABL 35.6 · JBL 36.1 · 미계약 59%
>                 후: KBL 35.4 · ABL 85.6 · JBL 77.8 · 미계약  6%
> ```
>
> 🔴 **가설 셋을 세웠고 전부 실측으로 틀렸다. 다시 세우지 마라:**
>
> - ~~정원이 차서 못 받는다~~ → KBL 1군 평균 30.3명/상한 34, 꽉 찬 팀 1/10
> - ~~독립리그 나이 상한(31세)~~ → 미계약자의 **32세 이상은 1%**다. 31세 이하가
>   68% 포기하고 32세 이상은 19%다 — **어린 쪽이 그만뒀다**
> - ~~독립 정원 부족~~ → 애초에 그 통에 들어가면 안 될 사람이 들어가 있었다
>
> ⚠ **`.node` 함정에 또 걸렸다.** 배경 측정이 파일을 잡고 있어 빌드가 못 덮는데
> `Finished`만 보고 넘어갔다. 첫 "고친 뒤" 수치가 통째로 무효였다 —
> **빌드 뒤에 바이너리에 새 문자열이 있는지 확인해라.**

> **남은 것 — 미계약 뒤 처리를 정교화한다** (사용자: "추후에 좀 더 정교화")
>
> 지금은 1차로 막은 것이다. 거친 자리 넷:
>
> 1. **재계약 연봉이 그대로다.** 시장이 안 불렀으면 몸값이 깎이는 게 자연스러운데
>    값을 지어낼 근거가 없어 유지만 했다
> 2. **재계약이 정원만 본다.** 구단 의사·성적·나이·성향을 안 본다 —
>    NPC FA 입찰(`eval_fa_bid`)과 잣대가 다르다. 그래서 **미계약률이 59% → 6%**로
>    떨어졌다. 문턱 80으로 걸러낸 사람이 전부 원소속으로 돌아간다
> 3. **은퇴가 즉시다.** 다음 해 재도전(2군 계약·독립 강등)이 없다
> 4. **독립리그 갈래를 통째로 끊었다.** 27세라면 독립에서 뛰다 돌아오는 게
>    자연스러울 수 있는데 지금은 은퇴 직행이다
>
> 계측은 `faIntakeTally`(`scripts/perf/perfEntry.ts`) + `probe-faintake.cjs`다.
> 미계약자 결말·나이·포기 사유가 거기서 나온다.

⚠ **밸런스는 여전히 동결이다.** 04에서 실측한 값을 넣을지는 **건마다 묻는다.**

## 되돌아오며 겪은 것

- 🔴 **`npm run smoke`가 통째로 안 돌고 있었다** — Windows 절대 경로를
  `import()`에 그대로 넘겨 `ERR_UNSUPPORTED_ESM_URL_SCHEME`으로 즉사했다.
  고치자 게이트가 실패했는데, **엔진이 아니라 스모크가 게임 경로를 안 타서**였다
  (`target`을 안 보내 존 중앙만 노리니 볼넷이 0). 04 `measure:engine`이
  같은 엔진으로 볼넷 0.16을 낸다
- 🔴 **`parkView.test.ts` 19건이 좌표를 바꿔도 그대로 통과했다** — 좌표를
  안 보고 있었다. `parkAnchorGeometry.test.ts`를 새로 붙였다
- 🔴 **`test:fa`의 로스터 상한 검사가 옛 모양을 지키고 있었다** — 패턴이
  리그 id 하드코딩을 기대했는데 코드는 그 사이 `[leagueId]`로 고쳐졌다.
  **코드가 나아졌는데 검사가 빨간불**이었다
- ⚠ `ELECTRON_RUN_AS_NODE=1`이 셸에 남으면 `npm start`가
  `protocol is undefined`로 죽는다 — 계측 스크립트(`cross-env`)가 켜는 값이다.
  02 결함이 아니다

## 이주 전에 미해결로 남겼던 것

**셋 다 2026-08-30에 다시 쟀다 — 여전히 그렇다.** 근거를 적어 둔다,
다음에 또 재지 않게.

- **`MainPage` 등판 회피가 선수 기록 없는 점수만 만든다** — 확인함.
  `MainPage.svelte` 의 회피 갈래가 `playerLines: []` 를 **박아 넣는다**.
  점수는 나오고 순위도 오르는데 그 경기의 **선수 기록만 통째로 없다**.
  ⚠ 회피를 자주 쓰면 시즌 성적이 조용히 비어 간다 — 순위표로는 안 보인다.
- **`syncProtagonistLeagueUpdate` 가 로테이션을 안 건드린다** — 확인함.
  `standings` 와 `stats` 만 갱신한다. **바로 위 `simulateBackgroundWeek` 은
  `teamRotationIndex` 를 갱신한다** — 배경 팀은 로테이션이 돌고 주인공 팀만
  안 돈다. 같은 파일 안에서 갈린다.
  ⚠ 친선경기(`applyFriendlyResult`)는 인덱스를 넘긴다. **정규 경기만 빠졌다.**
- C 결함 4건 — ~~`test:rosterbalance` 포수 0명~~ → **2026-08-30 고쳤다**
    (얇은 팀에서 포수만 예외로 채운다 · 4씨앗 0건) ·
  ~~이야기 이벤트 87% 유실~~ → **52%다(2026-08-30 실측 · `measure:eventfunnel`)**.
  정의 589종 중 **283종(48%)이 화면에 닿는다**. 87%는 낡은 값이다.
  ⚠ 남은 52%가 전부 결함은 아니다 — 조건부가 많고 커리어 한 번에 다
  탈 수는 없다. **영구 손실은 3종**이다(`once_per_career` 인데 그 시즌에
  밀렸다): 고1 환영회 · 기숙사 밤 · 향수병. 거기부터 본다.
  ·
  동료 떠난 뒤 `together` · ~~소식함 200통 포화~~ → **1500이다(2026-08-30 실측)**
  ⚠ 문서가 500이라 적고 있었다 — 08-24에 500, 그 뒤 1500으로 또 올렸다.
  **이 숫자에 여섯 번 속았다.** 세지 말고 `MAX_MAILBOX` 를 봐라.
