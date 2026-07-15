# 구현 Phase 계획 (착수 로드맵 — 새 세션 온보딩 문서)

> 근거: [00_결정_요약](00_결정_요약.md)(전체 결정 인덱스) · [03_구조](03_구조.md) §5-1(엔진 모듈 지도) · [05_밸런스](05_밸런스.md) §3(확정 순서) · [07_데이터관리](07_데이터관리.md) §7(초기구축순서) · [08_P7_체크리스트](08_P7_체크리스트.md)(실측 완료) · [09_개발환경_세팅](09_개발환경_세팅.md) · 대화 설계(2026-07-14)
> 상태: **I0·I1·I2·I3·I4 완료, I5 진행중(1~4차분 완료)** — 2026-07-15
> 목적: **이 문서 하나만 읽으면 새 대화 세션이 지금 상황을 전부 파악하고 이어서 구현을 진행**할 수 있게 한다. 기획·설계는 100% 끝났고(§1), 지금부터는 코드 작성 단계다.

## 0. 이 문서를 읽는 새 세션에게

당신은 "OnePitch"(야구 투수 인생 시뮬레이션, 한국어 게임)의 구현을 이어받았다. 순서대로 하라:

1. **[00_결정_요약](00_결정_요약.md)**을 먼저 읽어라 — 전체 결정의 인덱스이자 나머지 문서로 가는 지도다.
2. 지금 이 문서(**10_구현_Phase_계획**)에서 **현재 어느 Phase까지 끝났는지**(§2 표의 상태 컬럼)를 확인하라 — 이 문서는 Phase가 끝날 때마다 상태가 갱신되어야 한다(끝낸 사람이 갱신 책임).
3. **[09_개발환경_세팅](09_개발환경_세팅.md)**대로 로컬 환경을 확인/세팅하라. 새 PC라면 §4의 빠른 체크리스트부터.
4. 작업할 Phase에 해당하는 **근거 문서**(§2 표의 "근거" 컬럼)를 실제로 열어서 읽어라 — 이 문서는 요약일 뿐, 세부 규칙은 원문서에 있다.
5. `CLAUDE.md`(리포지토리 루트, 이 폴더의 상위)의 작업 지침을 따르라: 파일 먼저 읽고 완성된 솔루션 작성 / 불필요한 설명 없이 코드만 / 한 번에 테스트.

## 1. 지금까지 끝난 것 (전제, 재검토 불필요)

- **기획**(`02_기획/`): 게임 개요·커리어 구조·리그팀(고교102·대학50·독립10·프로1군10+2군10)·육성코어 9종·시장계약·히스토리엔딩·콘텐츠 6종·개인재정·주인공생성 — 전부 확정.
- **설계**(`03_설계/` 00~09): 스택(Flutter+Rust+frb 확정, 경쟁 스택 전수 비교 완료)·데이터 3계층·엔진 계약·게임루프·밸런스 인벤토리·스키마 v1 DDL(**rusqlite 실측으로 최종 확정**)·데이터관리(선수=canonical_seed 생성)·P7 스파이크(Windows PC 트랙 실측 통과)·개발환경 세팅 가이드.
- **UI 기획**(`04_UI기획/` 00~08): 4허브 내비게이션·화면별 상세 설계 9종.
- **172팀 균등원칙**([[onepitch-equal-team-treatment]] 메모리): 어떤 신규 코드/시스템도 팀을 "특별/배경"으로 차등 취급 금지 — 절차는 전 172팀 동일 적용.

**이 위에 있는 모든 것은 "왜"가 이미 정해져 있다 — 구현 단계에서 재논의하지 말고 원문서를 인용해 따를 것.** 다만 실제 수치(D그룹, [05_밸런스](05_밸런스.md))는 아직 값이 없다 — Phase I5/I8에서 시뮬 하네스로 정한다.

## 2. Phase 표

| Phase | 이름 | 스코프 | 완료 기준(산출물) | 근거 문서 | 상태 |
|---|---|---|---|---|---|
| **I0** | 리포지토리 스캐폴딩 | `app/`(Flutter)+`engine/`(Rust crate) 실제 생성, frb 배선, 최소 hello-world 커밋 | `flutter run -d windows`로 빈 화면이 실제로 뜸, git에 커밋됨 | [03_구조](03_구조.md) §6(폴더구조) · [09_개발환경_세팅](09_개발환경_세팅.md) | ✅ 완료 (2026-07-15) — 스캐폴딩·frb hello-world·`cargo build`·`flutter build windows` 전부 성공 확인(아래 §6-1 갱신) |
| **I1** | 데이터 레이어 | content.db·slot.db 스키마를 rusqlite 마이그레이션 코드로, Repository 커맨드 골격, HMAC 서명 골격 | 빈 DB 생성+v1 마이그레이션 성공, 유닛 테스트 통과 | [06_스키마](06_스키마.md) · [02_데이터](02_데이터.md) | ✅ 완료 (2026-07-15) — `cargo test` 9종 통과 |
| **I2** | 초기 세계 데이터 구축 | `data/seed/*.csv·toml` 실제 작성(172팀 리그팀 markdown→트랜스크립션), `content seed` CLI 구현 | content.db에 172팀·리그·구장·특성·히스토리·생성규칙 전부 반영, `content validate` 통과 | [07_데이터관리](07_데이터관리.md) §3 | ✅ 완료 (2026-07-15) — 172팀(+2군10=182팀) + `pitch_types`·`name_pools`·`generation_rules`·`personality_rules`·`world_config` 전부 시드, `content seed`+`content validate` 통과(아래 §6-2) |
| **I3** | 선수 생성 엔진(`sim/roster`) | canonical_seed 기반 결정적 로스터 생성(`generateInitialWorld`) | 새 게임 시작 시 172팀 ~3,700명이 slot.db에 생성, 동일 seed→동일 결과(재현성 테스트) | [07_데이터관리](07_데이터관리.md) §2 · [01_선수_능력치](../02_기획/육성코어/01_선수_능력치.md) | ✅ 완료 (2026-07-15) — 실데이터로 4,410명 생성(2군 포함) 확인, 동일 seed 재현성 확인. 상세는 아래 §6-3 |
| **I4** | 게임 루프 오케스트레이터(`api/advance`) | 일/주/월/시즌 경계 처리, PendingAction 7종 상태기계 | `advance()` 호출 시 여러 주 진행 후 정지점에서 올바로 멈춤 | [04_게임루프](04_게임루프.md) | ✅ 완료 (2026-07-15) — 오케스트레이터 뼈대(하루단위 루프·정지판정·PendingAction push/resolve·재서명) 구현, 실제 배치 내용은 I5/I6가 채울 훅으로 배선. 상세는 아래 §6-4 |
| **I5** | 나머지 sim 모듈 | `sim/growth`·`sim/injury`·`sim/eval`·`sim/match`(배경)·`sim/market`·`sim/npc`·`sim/schedule` — [05_밸런스](05_밸런스.md) §3 순서(A→B→C→{D,E,F}→G,H→I)로 구현+가밸런스 적용 | 배경 시뮬만으로 시즌 1개 완주 가능 | [03_구조](03_구조.md) §5-1 · 육성코어 01~09 각 문서 | 🔶 진행중 — 1차분(`sim/schedule`+`sim/match`, 프로/2군/대학/고교 정규시즌)+2차분(독립리그 4단계 전체+독립/프로 포스트시즌)+3차분(대학 3개 대회·고교 5개 전국대회 포스트시즌)+4차분(`sim/growth` 상승기, 주간 XP→스탯) 완료(2026-07-15). 노쇠(하락기)·`injury`·`eval`·`market`·`npc`는 이월. 상세는 아래 §6-8 |
| **I6** | 주인공 플로우 | 캐릭터 생성([07_주인공_생성](../02_기획/07_주인공_생성.md)), 주인공 등판 매치 세션(`startMatch`/`pitch`) | 캐릭터 생성 후 첫 경기를 실제로 뛸 수 있음(반자동 모드 최소) | [04_UI기획/06_캐릭터생성](../04_UI기획/06_캐릭터생성.md) · [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) | ⬜ 미착수 |
| **I7** | Flutter UI | `04_UI기획/` 00~08 화면 실제 구현(4허브+진행버튼+매치 CustomPainter) | 최소 플레이 가능한 루프가 실제 화면에서 끝까지 동작(뉴게임→진행→경기→시즌종료) | `04_UI기획/` 전체 | ⬜ 미착수 |
| **I8** | 콘텐츠 저작 + D그룹 수치화 | 이벤트·캐릭터·업적 등 AI 대량생성→import, 밸런스 시뮬 하네스로 실제 수치 확정 | `content import` 파이프라인 동작, 15~20시즌 시뮬 하네스가 [05_밸런스](05_밸런스.md) §4 통과기준 만족 | [02_데이터](02_데이터.md) §3 · [05_밸런스](05_밸런스.md) §4 | ⬜ 미착수 |
| **I9** | 통합 검증 · 배포 준비 | 보류됐던 실기기 검증(Android·Steam·Mac/Linux) 실제 진행, 릴리스 빌드, Steam 정식 등록 | P7 체크리스트 §6 열린세부 전부 해소, 스토어 빌드 산출 | [08_P7_체크리스트](08_P7_체크리스트.md) §6 | ⬜ 미착수 |

**의존성**: I0→I1→I2→I3→I4→I5는 순서대로(각 단계가 다음의 전제). I6은 I4·I5 이후 아무 때나. I7은 I3~I6이 뭔가 보여줄 게 있어야 의미 있지만 화면 뼈대(레이아웃)만은 I0 직후에도 병행 가능. I8은 엔진 코드가 어느 정도 갖춰진 후(I5 이후). I9은 항상 맨 마지막.

## 3. 착수 범위 제안 — 다음 세션이 할 일

**I0·I1이 모두 완료됐으므로 다음은 Phase I2(초기 세계 데이터 구축)다.** 스코프:
- `data/seed/*.csv·toml` 실제 작성 — 172팀 리그팀 markdown(`02_기획/`)을 구조화 데이터로 트랜스크립션.
- `content seed` CLI 구현 — 위 시드 파일을 읽어 `content.db`에 172팀·리그·구장·특성·히스토리·생성규칙을 채워 넣음.
- `content validate` 통과가 완료 기준([07_데이터관리](07_데이터관리.md) §3).
- 이 Phase는 코딩보다 **데이터 변환+검증** 성격이 커서 다른 Phase와 작업 리듬이 다르다 — 172팀 분량을 한 세션에 다 끝내려 하지 말고 팀군 단위로 나눠 진행하는 것을 고려.
- **172팀 균등원칙**([[onepitch-equal-team-treatment]]) 반드시 준수 — 시드 데이터·생성규칙에서 특정 팀군을 특별 취급하지 말 것.

세션 시작 시 먼저 사용자에게 **"I2로 진행할지, 범위를 다르게 잡을지"** 확인할 것 — 이 제안은 기본값이지 강제가 아니다.

## 4. 작업 방식 원칙 (구현 단계 전반)

- **`CLAUDE.md` 최우선**: 파일 먼저 읽고 완성된 솔루션 작성, 불필요한 설명 없이 코드만, 한 번에 테스트.
- **커밋 리듬**: 이 프로젝트는 지금까지 "논의→결정→문서화→커밋"을 반복해왔다. 구현 단계에서도 **의미 있는 단위(Phase 내 하위 작업 하나)가 끝날 때마다 커밋** — 하나의 거대 커밋으로 몰아가지 않는다.
- **172팀 균등원칙 반드시 준수**([[onepitch-equal-team-treatment]]): 팀 데이터를 다루는 코드(로스터 생성·특성 배정·재정 계산 등)에서 특정 팀군을 하드코딩으로 특별 취급하지 말 것. 절차는 전 172팀에 동일하게.
- **은닉 vs 개방 밸런스**(D4-2, [03_구조](03_구조.md) §4): 확률·계수는 Rust 상수(`balance/`), 콘텐츠·서사만 content.db에.
- **스파이크 코드와 실구현 코드는 다르다**: P7 스파이크는 검증 후 버렸다([08_P7_체크리스트](08_P7_체크리스트.md) §1 원칙). Phase I0부터는 버리지 않는 진짜 코드 — 품질 기준이 다르다.
- **실기기 필요 항목은 미리 표시**: Android 실기기·Steam 클라이언트 실연동·Mac/Linux 빌드는 이 개발 환경(Windows 샌드박스)에서 검증 불가 — 해당 작업이 필요해지면 사용자에게 명시적으로 알릴 것([09_개발환경_세팅](09_개발환경_세팅.md) §5).

## 5. 이월된 미해결 항목 (구현 중 마주칠 수 있음)

- 기획 정합성 개선점 #5~#12(2026-07-13 전체 분석에서 발견, 아직 미해결) — 이벤트 XP 반영 누락, NPC 투수 로테이션 기준, 병역 국제대회 실명 문제 등. 각 Phase에서 해당 시스템을 구현할 때 원문서(§1의 기획 문서들)에서 확인.
- [05_밸런스](05_밸런스.md) D그룹 실제 수치 — Phase I8까지 값 없음, 그 전까지는 임시값(placeholder)으로 구현하고 하네스로 나중에 조정.
- [08_P7_체크리스트](08_P7_체크리스트.md) §6 — Android 실기기, Steam 실클라이언트, Mac/Linux 빌드 미검증.

## 6. 문서 갱신 규칙

### 6-1. I0/I1 착수 기록 (2026-07-14~15)

**I0(스캐폴딩)**: `flutter create --platforms=windows,android`로 `app/` 생성 → `flutter_rust_bridge_codegen integrate --rust-crate-name engine --rust-crate-dir ../engine`로 `engine/`(Rust crate)+`app/rust_builder`(cargokit) 배선. frb 기본 hello-world(`greet`)가 `app/lib/main.dart`에 이미 연결돼 있고, `cargo build`는 성공.

- **한글 경로 이슈 — 해결됨(2026-07-15)**: 프로젝트 절대경로에 **한글**(`업무폴더`·`01.기획` 등)이 포함되면 `flutter build windows`가 실패하던 문제(cargokit `run_build_tool.cmd`가 `cmd.exe echo`로 임시 `pubspec.yaml`을 생성할 때 코드페이지 949가 유니코드 경로를 mojibake시켜 `build_tool` 패키지를 못 찾음). **사용자가 리포지토리 전체를 영문(ASCII) 경로로 이동**해 해결. 이동 직후엔 `app/build/`(CMake 캐시)가 옛 경로를 참조해 `CMakeCache.txt directory ... is different` 에러가 났는데, `app/build/`는 gitignore 대상 빌드 산출물이라 삭제 후 재빌드하면 정상 통과함을 확인(`flutter build windows` → `app.exe` 생성 성공). 상세는 [09_개발환경_세팅](09_개발환경_세팅.md) §3에 반영됨.
- **`flutter test` 헤드리스 검증 — 완료(2026-07-15)**: `flutter build windows` 산출물 중 `build/windows/x64/runner/Release/engine.dll`을 `app/` 루트로 복사([09_개발환경_세팅](09_개발환경_세팅.md) §3 절차)한 뒤 `flutter test` 실행, 통과. 이 과정에서 `test/widget_test.dart`가 `flutter create` 기본 카운터 템플릿 그대로 남아있어(`lib/main.dart`는 frb greet 데모로 이미 교체됨) 실패하던 걸 발견 — 실제 `MyApp`(`greet("Tom")` 결과 텍스트) 기준으로 테스트를 재작성해 통과시킴. `app/.gitignore`에 `/*.dll` 추가(테스트용으로 복사한 `engine.dll`이 커밋되지 않도록).

**I1(데이터 레이어)**: `engine/src/data/{migration,content,slot,repository}.rs` + `engine/src/integrity/mod.rs` 작성, `cargo test` 9개 전부 통과.

- `migration.rs`: `PRAGMA user_version`으로 내부 스키마 버전을 추적하는 범용 단계별 마이그레이션 러너. **각 마이그레이션 `up` 함수가 `meta.save_version`을 직접 갱신해야 함**(러너는 `user_version`만 건드리고 애플리케이션 테이블은 안 건드림) — v2 마이그레이션 추가 시 잊지 말 것.
- `content.db`·`slot.db` DDL은 [06_스키마](06_스키마.md) §3·§4를 그대로 옮김(변경 없음).
- `repository.rs`는 [02_데이터](02_데이터.md) §4 커맨드 전체의 시그니처만 존재(`todo!()`) — `create_slot`/`load_slot`만 `slot::open`으로 실동작. 나머지 로직은 I3~I6.
- `integrity/mod.rs`: HMAC-SHA256 `sign`/`verify`는 실동작(서명 키는 개발용 플레이스홀더 상수 — 배포 전 교체 필요). 핵심 테이블을 실제로 직렬화해 해싱하는 `sign_core_state`는 스키마·데이터 형태가 더 정해진 뒤(I3~) 채울 `todo!()`.
- Windows에서 SQLite `Connection`이 살아있는 동안 파일을 지우면 `다른 프로세스가 파일을 사용 중` 에러가 남 — 테스트에서 `drop(conn)` 후 `remove_file` 순서를 지킬 것.

### 6-2. I2 착수 기록 (2026-07-15, 진행중)

**CLI 파이프라인 아키텍처 결정**: [01_환경](01_환경.md) §6은 `content seed`를 순수 Dart 툴로 명시했으나, Dart의 `sqlite3` 패키지는 런타임에 네이티브 `sqlite3.dll`을 요구(rusqlite는 `bundled` 피처로 정적 링크해 이 문제가 없음 — cargokit 한글경로 DLL 이슈와 같은 부류의 함정, [09_개발환경_세팅](09_개발환경_세팅.md) §3). **사용자 결정(2026-07-15)**: Dart는 CSV/TOML 파싱·검증만 담당하고, 실제 DB 쓰기는 `engine` crate의 신규 Rust 바이너리(`seed_content`)에 위임 — I1에서 이미 검증된 rusqlite 스키마·마이그레이션 코드를 재사용해 스키마 이중관리를 피함. `dart run tool content seed`가 여전히 단일 진입점이라는 사용자 관점의 "단일 CLI" 원칙은 유지됨.

- **`engine/src/bin/seed_content.rs`(신규)**: `<db_path> <json_path> [--dry-run]` 또는 `<db_path> --validate` 두 모드. JSON(Dart가 CSV에서 조립) → `leagues`/`schools`/`stadiums`/`teams`/`team_traits`/`team_history`를 트랜잭션 1개로 upsert(`ON CONFLICT DO UPDATE`, 재실행해도 idempotent) → 커밋 직전 `PRAGMA foreign_key_check`로 FK 검증, 위반 시 무조건 롤백(`--dry-run`이 아니어도). `Cargo.toml`에 `[[bin]]` 추가 시 `[lib] crate-type`에 `rlib`이 없으면 내부 바이너리가 `use engine::...`를 못 하는 것을 발견 — `["cdylib","staticlib","rlib"]`로 수정(cdylib/staticlib은 frb·cargokit용, rlib은 내부 링크용, 상호 영향 없음).
- **content.db 스키마 v2 마이그레이션 추가**: [06_스키마](06_스키마.md) v1 DDL에 `stadiums` 테이블과 `teams.stadium_id` 컬럼이 없어서(구장은 여러 팀이 공유하는 정규화 관계라 `teams.meta` JSON에 우겨넣기보다 FK 테이블이 맞다고 판단) `migration_v2`로 추가(`engine/src/data/content.rs`). `cargo test`로 검증(`v2_adds_stadiums_and_team_stadium_link`).
- **`tool/`(신규 Dart 패키지)**: `bin/tool.dart`(진입점, `content seed|validate` 서브커맨드만 구현 — `gen`/`run`/`build`/`content import`/`content dump`/`test`/`release`는 I2 범위 밖, 필요해지는 Phase에서 추가) · `lib/src/seed_csv.dart`(CSV→행, 파일 없으면 빈 리스트 — 시드 파일은 점진적으로 채워지므로 없는 파일은 에러 아님) · `lib/src/content_seed.dart`(`team_rivals`/`team_season_ranks`/`team_titles` flat CSV를 `team_history`의 JSON 배열로 조립) · `lib/src/cargo_bridge.dart`(JSON을 임시파일로 써서 `cargo run --bin seed_content`를 shell-out). `dart test`·`dart analyze` 통과.
- **독립리그 10팀으로 파일럿 검증(팀군 중 최소 규모)**: `data/seed/{leagues,teams,team_traits,team_org,team_rivals,team_season_ranks,team_titles,stadiums}.csv`를 [02_기획/리그팀](../02_기획/리그팀/) 04_독립·05_팀_특성_시스템·06_리그_히스토리·07_구장_파크팩터·08_팀_컬러에서 트랜스크립션. `content seed --dry-run` → `content seed` → `content validate` 전부 통과, 재실행해도 행 수 동일(idempotent 확인), UTF-8 데이터 왕복 확인(한글 깨짐 없음).
- **발견한 기획 공백(데이터 갭)**: 04_독립.md에 독립리그 10팀의 **전력★(1~5) 수치가 없음** — [06_리그_히스토리](06_리그_히스토리.md) §1의 `budget = 하한 + (상한-하한)×(전력★÷5)` 공식을 적용할 데이터가 없어 `team_org.csv`의 `budget`을 전부 빈 값(NULL)으로 시드함(상무 피닉스는 애초에 국방부 예산 예외라 NULL이 의도된 값). **프로·대학·고교는 각 리그 문서에 전력★이 이미 있어 이 갭은 독립리그 한정**일 가능성이 높음 — 나머지 팀군 진행 시 재확인 필요. 기획 보완(전력★ 배정) 전까지 독립 9팀 budget은 미정 상태로 둘 것.
- **고교 102팀 시드 완료(2026-07-15)**: `data/seed/*.csv`에 고교 리그 통째로 추가 — `schools.csv` 신설(102행, 학교 엔티티를 팀과 분리), `teams.csv`/`team_traits.csv`/`team_org.csv`/`team_rivals.csv`(7쌍)/`team_season_ranks.csv`(510행)/`team_titles.csv`(25행, 5개 대회×5시즌 우승팀만) 추가, `stadiums.csv`에 8권역 거점구장 추가, `leagues.csv`에 `league:hs` 추가. 소스: [02_고교](../02_기획/리그팀/02_고교.md)(팀·연고·전력★)·[05_팀_특성_시스템](05_팀_특성_시스템.md) §4-1·4-2(90배경+12손저작 특성 전량 이미 문서에 명시돼 있어 배정 로직 재현 불필요)·[06_리그_히스토리](06_리그_히스토리.md) §4-3·5-1(순위·우승)·[07_구장_파크팩터](07_구장_파크팩터.md) §5·[08_팀_컬러](08_팀_컬러.md) §2. **고교는 전력★이 전 팀에 있어 budget 공식을 그대로 적용**(독립과 달리 데이터 갭 없음) — `budget = 하한+(상한-하한)×(전력★/5)`. `content seed`+`content validate` 통과(112팀 누적), 예산·라이벌 양방향·타이틀 집계·school FK 스팟체크 완료. 트랜스크립션은 Python 스크립트로 CSV를 생성해 수작업 오류(102행 손입력) 방지 — 스크립트는 스크래치패드에만 남기고 리포지토리에는 커밋 안 함.
- **대학 50팀 시드 완료(2026-07-15)**: 같은 방식으로 `data/seed/*.csv`에 추가 — `league:univ`, `schools.csv`+50, `teams`/`team_traits`/`team_org`/`team_rivals`(6쌍)/`team_season_ranks`(250행)/`team_titles`(15행, 3대회×5시즌 우승팀) +50, `stadiums.csv`에 5거점구장 추가. `content seed`+`content validate` 통과(누적 162팀). 예산·라이벌·타이틀 스팟체크 완료.
  - **새로 발견한 데이터 갭(기존에 이미 문서화돼 있던 것)**: [03_대학](../02_기획/리그팀/03_대학.md) §4-1은 5개 거점구장(A~E조)의 **조별 팀 수 합계**만 주고 개별 학교가 몇 조인지는 안 줌 — 서울(6)·충청(8)+강원(2)·호남(7)·부경울(7)+제주(1)는 각 조에 전량 소속돼 모호함이 없지만, **경기·인천(14, A조4/B조10 분할)·대구·경북(5, D조3/E조2 분할)은 어느 학교가 어느 조인지 안 정해짐**([06_리그_히스토리](06_리그_히스토리.md) §6 열린세부에 이미 기재된 항목). 이 19팀은 `stadium_id`를 NULL로 시드 — 조편성이 확정되면 재시드로 채울 것.
- **프로 1군10+2군10 시드 완료(2026-07-15) — 172팀 전부 완료**: [01_프로](../02_기획/리그팀/01_프로.md)(연고·전력★·컬러 자기완결적)에서 트랜스크립션 — `league:pro`/`league:pro_farm` 2개 리그, `team_rivals`(5쌍) · `team_season_ranks`(50행) · `team_titles`(10행, 한국시리즈 5시즌 우승+준우승) · 10구장 추가. **2군은 06_리그_히스토리.md §6이 이미 "1군만 다룸(2군은 콜업 룩업 위주라 서사적 비중 낮음)"이라 명시** — 개별 순위·라이벌·타이틀 없이 부모 1군의 philosophy/resource/status·color·founded_year·stadium만 그대로 물려받고 budget은 NULL(2군 전용 밴드가 원래 없음, 새 갭 아님). `content seed`+`content validate` 통과, 최종 182팀(172+2군10) 커밋된 content.db 확인.
- **I2 완료 시점 데이터 갭 3건 — 전부 해소(2026-07-15, 사용자 승인)**: (원래 기존 기획 문서의 미확정 항목이었음, 아래 방식으로 해소해 재시드 완료)
  1. 독립리그 9개 시민구단 budget — 전력★이 없어 S-1 순위+위상(신흥/중견/언더독)+자원구간을 [05_팀_특성_시스템](05_팀_특성_시스템.md) §4-2의 위상↔전력★ 가중 원칙에 역으로 대입해 역산·확정(★1~4). `team_org.csv` 갱신, 상무 피닉스는 그대로 NULL(국방부 예산 예외).
  2. 대학 경기·인천(14, A조4/B조10)·대구·경북(5, D조3/E조2) 조배정 — 전력★ 상위 순으로 A/D조(서울·호남과 합류하는 조)에 배정, 동급은 S-1순위로 타이브레이크. `teams.csv` 갱신, stadium_id NULL 0건.
  3. [07_구장_파크팩터](07_구장_파크팩터.md) §1·§6 텍스트 오기("독립 5구장"→"4구장", "4지역"→"3지역", "28개"→"27개") 수정 완료 — 문서·시드 데이터(27구장) 일치.
  - 반영 후 `content seed`+`content validate` 재실행, `budget IS NULL` 11건(상무1+2군10, 전부 의도된 예외)·`stadium_id IS NULL` 0건 확인.
- **`pitch_types`·`name_pools`·`generation_rules`·`personality_rules`·`world_config` 전부 완료(2026-07-15)**:
  - `pitch_types.csv`: [육성코어/05_구종_시스템](../02_기획/육성코어/05_구종_시스템.md) §1의 10종 카탈로그 그대로(추가 확인 결과 더 넣을 것 없음 — "습득 조건" 등은 content.db 데이터가 아니라 `balance/training`(Rust 은닉 상수, [05_밸런스](05_밸런스.md) §2-E) 소관이라 I8로 별도 이월).
  - `world_config.toml`: `canonical_seed = 20260714` 고정.
  - `name_pools.csv`: **`02.SvelteElectron`(이 프로젝트들이 계속 언급해온 "프로토타입")**의 `resource/data/master/players/name_pool_{kr,en,jp}.json`을 포팅(한글 성40+이름60, 영어 성40+이름60, 일본어 성40+이름40×hangul/roman 이중). 외국인 선수 기능이 지금은 없지만 사용자 지시로 3개 로케일 전부 포팅해둠.
  - `generation_rules.toml`: 프로토타입 `roster_gen.rs`(리그별 로스터규모·투수비율·OVR범위 구조)를 포팅하되, 수치는 프로토타입의 45~92 스케일이 아니라 [05_밸런스](05_밸런스.md) §1에서 이미 확정된 **20~80(50=평균)** 스케일로 재매핑. 5개 리그(고교/대학/독립/프로2군/프로1군) 순으로 구간이 점점 높아지도록 배치, 실제 값은 여전히 D그룹(Phase I8 시뮬 하네스) 재조정 대상.
  - `personality_rules.toml`: `06_스키마.md`의 `personality_rules(context PK, trait_weights)`가 **172팀 개별이 아니라 철학(12)·위상(7)·역할(7) = 26개 컨텍스트** 단위 룩업임을 확인 — I3 생성 로직이 팀의 이미 시드된 철학/위상(`team_traits.csv`)과 역할을 조합해 이 컨텍스트를 찾아 블렌딩하는 구조. [콘텐츠/01_캐릭터](../02_기획/콘텐츠/01_캐릭터.md) §3이 실제로 명시한 방향성 힌트("스파르타→승부사·완벽주의 쏠림")만 반영하고 나머지 25개는 균등 placeholder — 나머지를 임의로 차등화하면 문서에 없는 걸 지어내는 것이라 하지 않음.
  - Rust `seed_content.rs`·Dart `content_seed.dart`/`seed_toml.dart`(TOML 파싱 신규)를 확장해 이 5개 파일도 실제로 content.db에 반영되도록 파이프라인 완성 — `content seed`+`content validate` 통과 확인.
  - **버그 발견·수정**: `content_seed.dart`의 `name_pools` 그룹핑 키 조합 문자열에 정상 공백(U+0020) 대신 **널바이트(`\x00`)**가 섞여 들어가 있어(Edit 도구 사용 중 발생 추정) `split(' ')`가 항상 1개 파트만 반환 — `RangeError` 크래시. 원인 특정에 여러 단계 디버깅 필요했음(단순 로직 재확인으로는 안 잡히고 바이트 단위 점검(`repr()`)에서 발견). 재발 방지용 회귀 테스트(`content_seed_test.dart`) 추가.
### 6-3. I3 착수 기록 (2026-07-15, 완료)

**스코프**: `league_id` 하나를 받아 그 리그 소속 전 팀의 로스터를 결정적으로 생성해 `slot.db npc`에 삽입하는 `generate_league_roster`, 5개 리그를 고정 순서로 순회하는 진입점 `generate_initial_world`(둘 다 `engine/src/data/repository.rs`, 이전엔 `todo!()` 스텁) + 순수 생성 로직 `engine/src/sim/roster.rs`(신규).

**명시적으로 스코프 아웃한 것**(전부 이유 있음, `10_구현_Phase_계획.md` 계획 문서에 상세):
- **스태프(감독·코치·구단주) 생성** — 완료기준 수치(~3,700명)가 선수만 가리키고, `06_스키마.md` v1에 스태프 테이블 자체가 없고(감독4·코치7·구단주3개로 필드셋이 선수와 완전히 다름), 스태프가 실제 필요해지는 시점(I6 감독신뢰 근처)에 별도 스키마로 다루는 게 낫다고 판단.
- `generate_freshmen`(이후 시즌 신인 유입) — 세이브별 진행 중 생성이라 시즌 롤오버(I4) 타이밍 문제, 스텁 그대로 둠.
- 팀 실전력 계산(`03_팀_전력_공식.md`) — 가중치 자체가 전부 미확정이라 손댈 수 없음. 선수 생성은 `generation_rules`의 스탯 구간만 따름.
- `integrity::sign_core_state` — 세이브 생명주기(로드/저장 시점)와 엮인 문제라 I4가 더 적합.
- 주인공(`protagonist`) 생성 — I6 스코프.

**구현**:
- `Cargo.toml`: `rand`·`rand_chacha` 추가(결정적 RNG, ChaCha8Rng).
- `engine/src/data/content.rs`: `load_teams_for_league`·`load_generation_rule`·`load_name_pool`·`load_personality_rule`·`load_secondary_pitch_names` 읽기 헬퍼 추가.
- `engine/src/sim/roster.rs`(신규): `generate_team(rng, team, league_id, rule, kr_surnames, kr_given, secondary_pitches, personality_weights, id_prefix, seq) -> Vec<GeneratedPlayer>` — DB 접근 없는 순수 함수. 투수(선발/구원 `sp_ratio`로 분리)·타자(8포지션 라운드로빈) 생성, 스탯은 `generation_rules`의 `stat_min~stat_max` 구간 균등추출(9노출+3히든=12키), `personality_rules` 3개 컨텍스트(철학·위상·역할) 가중치를 합산해 3슬롯 성향 가중추출. `PersonalityWeights::merge`는 컨텍스트가 없어도(placeholder 미시드 등) 균등(1.0)으로 폴백.
- `engine/src/data/repository.rs`: `generate_league_roster`가 content.db 조회→`sim::roster::generate_team` 반복→slot.db 트랜잭션 1개로 INSERT. `world_seed`+`league_id`를 SHA-256으로 해시해 리그별 RNG 서브시드 도출(리그끼리 RNG 스트림이 안 겹치게). `generate_initial_world`는 5개 league_id를 고정 순서로 순회.
- **결정 사항**: `id`는 `npc:<world_seed>_<league_slug>_<seq>` — 처음엔 `npc:<world_seed>_<seq>`로 했다가 `generate_initial_world` 통합 테스트에서 리그마다 `seq`가 0부터 다시 시작해 리그 간 PK 충돌(`UNIQUE constraint failed`)이 나는 걸 발견, `league_slug`를 접두어에 넣어 리그 간 유일성을 함수 자체에 내재화(호출 패턴에 의존하지 않게).

**테스트**: `sim/roster.rs` 유닛 4개(동일시드→동일결과, 로스터크기·포지션분포가 규칙과 일치, 스탯이 구간 내, id가 순차·접두어 일치) + `repository.rs` 통합 3개(합성 미니 content.db로 npc 행수·재현성·5리그 전체 커버 확인) — `cargo test` 17개 전부 통과.

**수동 검증**(커밋 안 한 임시 바이너리로 1회 실행): 실제 시드된 `content.db`에 `generate_initial_world` 실행 → **총 4,410명**(고교25×102+대학22×50+독립20×10+프로2군28×10+프로1군28×10) 생성, 동일 `canonical_seed`로 두 번 실행해 완전히 같은 `npc` 행 확인(id·name·stats 전부 일치). "~3,700명" 추정치와 차이 나는 건 I2에서 정한 `generation_rules`의 로스터 크기 placeholder 값 때문(I8 재조정 대상) — 버그 아님.

### 6-4. I4 착수 기록 (2026-07-15, 완료)

**핵심 판단**: PendingAction 7종 중 실제로 "무언가를 하는" 타입은 전부 아직 없는 시스템(I5 sim/match·sim/schedule·sim/market·sim/injury, I6 주인공 플로우)에 의존한다 — `season_rollover`가 해야 할 방출판정·재계약·드래프트·로스터세대교체도 마찬가지. 그래서 I4는 **"오케스트레이터" 그 자체만** 구현 — 하루씩 진행하며 정지 조건을 감지하고 PendingAction을 push/resolve하는 상태기계 뼈대를 만들고, 각 경계(일/주/월/시즌)의 실제 내용은 지금 대부분 no-op 훅으로 남겨 I5/I6가 채우기만 하면 되는 구조로 배선.

**이번에 같이 처리한 이월 항목**: `integrity::sign_core_state`(I3에서 "세이브 생명주기와 엮여 I4가 적합"이라 미뤘던 것) — `engine/src/integrity/mod.rs`에 구현, protagonist(0~1행)+npc(전체, id 정렬)+meta 핵심필드를 직렬화해 해싱. `advance()`가 매 정지마다 재서명해 `meta.integrity_sig` 갱신.

**여전히 미룬 것**(이유는 위 §스코프 참고): `generate_freshmen` 실구현, 스태프 생성, 팀 실전력 계산.

**구현**:
- `engine/src/data/repository.rs`: `advance_week`(옛 스텁명) → `advance(slot_conn) -> Vec<PendingActionRow>`로 교체 — 하루씩 전진하며 ①그날 주인공 경기 있으면 `game` PendingAction push 후 정지 ②`process_day`(매일)→`process_week`(7일마다)→`process_month`(28일마다, 월 정확한 일수가 문서에 없어 잡은 placeholder)→`season_rollover`(364일마다) 순서로 배치 호출 ③이 중 하나라도 PendingAction을 만들면 정지, 아니면 다음 날로. 정지마다 `sign_core_state`로 재서명.
  - `process_day`/`process_week`/`process_month`: 지금은 완전 no-op — I5가 채울 자리라는 주석만.
  - `season_rollover`: 지금 실제로 할 수 있는 것만(시즌 카운터 `season_meta` 증가, `inbox` 비움) 구현, 나머지(평가·방출·재계약·드래프트·로스터세대교체·투자정산)는 TODO 주석.
  - `resolve_choice`: `pending_actions`에서 해당 행 삭제(제네릭 처리) — 타입별 실제 효과 적용은 그 효과를 낼 시스템이 생겼을 때.
- **버그 발견·수정**: 주인공도 없고(I6 이전) 실제 이벤트/일정 콘텐츠도 없는 지금 상태에서는 정지 조건이 영영 안 걸려 `advance()`가 무한 루프에 빠질 뻔했음 — 설계 검토 중 실제로 코드를 돌리기 전에 발견. `MAX_DAYS_PER_CALL`(364일, 1시즌) 안전장치를 추가해 그 안에 정지점을 못 찾으면 빈 목록을 반환하고 제어를 호출자에게 돌려줌. 실제 콘텐츠(I5)가 들어오면 정지점이 훨씬 자주 걸려 이 캡은 사실상 발동 안 함 — 순수 방어용.

**테스트**(`cargo test` 22개, 신규 5개): `integrity::sign_core_state`가 빈 슬롯에서도 동작·npc 변경 시 값이 바뀌는지 2개, `repository::advance`가 (a) 주인공 없이 한 시즌(364일) 다 돌고 인박스 비움+시즌카운터 증가하는지 (b) 합성 `schedule`+`protagonist`로 정확히 그 날짜에 `game` PendingAction으로 멈추는지, `resolve_choice` 후 다시 진행되는지 (c) 동일 시작 상태 두 벌을 각각 advance()해도 `integrity_sig`가 완전히 같은지(재현성) 3개.

### 6-5. I5 착수 기록 (2026-07-15, 1차분 완료)

**스코프 판단**: I5는 `sim/growth·injury·eval·match·market·npc·schedule` 7개 모듈을 전부 요구하는 Phase 표 최대 규모 항목 — 리서치 결과 한 번에 다 만드는 건 비현실적이라, **가장 근본적인 두 개(`sim/schedule`+`sim/match`)만 이번에 하고 나머지는 명시적으로 이월**(I2를 172팀 한번에 안 하고 팀군별로 쪼갠 것과 같은 원리).

**리서치로 바로잡은 것**: 이전 세션에 스치듯 본 "반경 시뮬"(주인공에서 멀수록 팀 전력 비교식 간이 처리)은 **프로토타입의 방식이지 OnePitch 확정 설계가 아니다**. [00_개요](../02_기획/리그팀/00_개요.md) §4-1이 "현재 전 리그가 예외 적용: 전부 풀 시뮬 확정"이라 못박았고, [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) §11도 "배경 경기(축1 유형 C)도 마찬가지로 풀 연산"이라 재확인 — 배경 경기라고 승률 시그모이드로 퉁치면 안 되고 **모든 경기가 최소 타석 단위로 실제 시뮬돼야 함**(화면에 안 보여줄 뿐).

**포함**: `sim/schedule`(프로1군·2군·대학·고교 4개 리그 정규시즌, 정적 라운드로빈), `sim/match`(타석당 1회 확률판정으로 단순화한 PA레벨 배경 시뮬 — §11의 "최소 타석 단위"를 만족하는 합법적 해석), `process_day` 배선(오늘 배경경기 전부 시뮬 → `schedule.result`+`standings` 갱신), `season_rollover` 확장(`standings`→`history_standings` 압축 후 `standings`/`schedule`/`season_stats` 초기화).

**제외(다음 세션 이월, 이유 포함)**:
- **독립리그 일정** — 4단계 전부 "이전 단계 결과로 다음 대진이 정해지는" 동적 구조라 정적 라운드로빈으로 못 만듦.
- **전 리그 포스트시즌/전국대회 브래킷**(프로 5강 사다리, 대학 3개 메이저, 고교 5개 전국대회) — 전부 "최종 순위 확정 후" 동적 생성이라 마찬가지 이유로 이월. 지금은 **정규시즌만** 완주.
- **투구수·피로도 기반 투수교체** — 감독 AI(스태프 필요, 아직 없음) 영역. 지금은 선발투수 완투 placeholder.
- **도루·병살·희생플라이·수비시프트·실책·날씨** — baserunner-state-aware 세부 규칙이라 스코프 넘음. 안타종류·홈런·삼진·볼넷·아웃 기본만.
- **개인 통산 스탯 축적**(`season_stats`에 타율·ERA 등) — 시즌이 도는 것 자체를 먼저 증명, 개인기록은 후속.
- **sim/growth·injury·eval·market·npc 전체** — 손 안 댐. `process_week`/`process_month`의 나머지 내용도 계속 no-op.

**구현**:
- `engine/src/sim/schedule.rs`(신규): 원형법(circle method) 라운드로빈 제너레이터(순수함수) + `generate_regular_season`(리그의 여러 그룹을 순회, 그룹별 game_id가 전역에서 유일하도록 seq 스레딩). 홀수 팀은 bye 처리, laps>1은 홈/원정 교대(더블 라운드로빈).
- `engine/src/sim/match_.rs`(신규, `mod.rs`에서 `match_sim`으로 alias — `match`가 예약어): `simulate_plate_appearance`(제구·구위 vs 컨택·선구안·파워 판정, D그룹 placeholder 계수) → `simulate_game`(9이닝, 아마추어 승부치기/콜드게임 vs 프로 12회제한).
- `engine/src/data/content.rs`: `load_team_groups_for_schedule` 추가 — 프로/2군은 리그 전체 단일 그룹, 대학·고교는 **I2에서 이미 확정된 stadium_id**(대학 5조·고교 8권역)를 그대로 그룹 경계로 재사용해 새로운 조편성을 안 지어냄.
- `engine/src/data/repository.rs`: `generate_schedule`(신규, `generate_initial_world`에도 배선 — 새 게임 시 로스터+정규시즌 일정이 함께 생성됨), `process_day` 구현(no-op → 배경경기 시뮬+standings 갱신), `season_rollover` 확장(win% 기준 전체순위로 `history_standings` 압축 — 리그 구분 없이 뭉친 순위라 부정확, 실제 리그별 순위는 후속 스코프).
- **`advance()` 시그니처 변경**: `content_conn` 파라미터 추가(배경 경기가 리그 규칙·팀 소속을 읽어야 함) — 이 함수의 유일한 호출자가 테스트뿐이라 파급 없이 교체.

**테스트**(`cargo test` 34개, 신규 12개): `sim/schedule.rs` 4개(라운드로빈 정확성·홀수bye·더블라운드 홈원정교대·전역유일ID), `sim/match_.rs` 4개(재현성·강타선이 더 득점·아마추어 콜드게임 발동·프로 연장 종료 보장), `repository.rs` 4개(`generate_schedule` 경기수 정확성, `process_day`가 결과·standings 갱신, `advance()`가 시즌 끝까지 돌며 배경경기를 처리하고 `schedule`은 비워지되 `history_standings`엔 남는지, `season_rollover` 압축+초기화).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 대학리그(가장 작고 깔끔한 5조 구조) 로스터+일정 생성 → **225경기**(문서의 "225경기"와 정확히 일치) → `advance()` 1회 호출로 시즌(364일) 전체 완주 → `history_standings`에 50개 팀 전부 순위 1~50(빈틈 없는 순열)으로 아카이브 확인.

### 6-6. I5 2차분 착수 기록 (2026-07-15, 완료)

**스코프 재조정**: 원래 "독립리그 일정+전 리그 포스트시즌"으로 잡았으나, 포스트시즌이 리그마다 완전히 다른 포맷(프로 5강 사다리 1종 · 독립 4단계 자체가 사다리 1종 · **대학은 3개 대회**(왕중왕전 8강토너먼트·은하기 8조예선+8강·여명기 4조예선+8강) · **고교는 5개 전국대회**(32강~128강, 대회마다 시드·WC 계산법이 다름))라 전부 하면 8가지 브래킷을 새로 설계해야 해서 스코프 초과 판정 — **독립(정규+포스트)와 프로 포스트시즌까지만 끝내고 대학·고교 포스트시즌/전국대회는 3차분으로 재이월**.

**구현**:
- `engine/src/data/repository.rs`: `simulate_series`(다전제, 과반수 승리 시 종료, 홈/원정 매 경기 교대) · `simulate_wild_card`(프로 WC전 — "5위 2연승 필요, 4위 1승만 있으면 진출"이라는 표의 "단판" 표기와 실제 다른 특수룰을 최대 2경기로 모델링) · `simulate_round_robin_stage`(라운드로빈 한 단계를 동기적으로 다 시뮬 — advance()의 하루단위 페이싱을 기다리지 않음) · `run_independent_season`(1~4차 전체, 기존 `sim::schedule::generate_round_robin_rounds` 그대로 재사용해 팀수·laps만 바꿔가며 10→8→4로 컷다운 후 포스트시즌 사다리) · `run_pro_postseason`(현재 `standings`에서 league:pro만 필터링해 상위 5팀 시드).
- `season_rollover` 시그니처에 `content_conn` 추가 — ①리그별 순위 계산(1차분의 "전체 뭉쳐서 순위" placeholder를 이번에 리그별 정확한 순위로 개선) ②`standings` 지우기 전에 `run_pro_postseason` 자동 트리거.
- **실제 버그 발견·수정**: `content::load_teams_for_league`가 `team_traits`와 INNER JOIN이라, 팀 ID만 필요한 곳(포스트시즌 시드 계산 등)에서 `team_traits`가 없으면 **조용히 빈 리스트를 반환**해 포스트시즌이 항상 스킵되는 버그를 테스트 작성 중 발견 — `load_team_ids_for_league`(JOIN 없는 경량 버전)를 새로 추가해 `run_independent_season`·`run_pro_postseason`이 그쪽을 쓰게 교체. `load_teams_for_league`는 `sim::roster`처럼 실제로 philosophy/status가 필요한 곳에서만 유지.
- **독립 시즌은 `generate_initial_world`에 자동 배선 안 함** — 캘린더 동기화가 아직 없어 "새 게임 시작하자마자 독립 시즌이 통째로 끝나있는" 어색함을 피함. 별도 호출 가능한 함수로만 존재(`run_independent_season`).
- 챔피언은 `league_transactions`(kind='champion')에 기록만 — 시상식 텍스트·`history_leaders` 등 서사 요소는 스코프 밖.

**테스트**(`cargo test` 38개, 신규 6개): `simulate_series`가 best_of 범위 안에서 끝나는지, `run_independent_season`이 4단계를 다 거쳐 챔피언 1명을 내고 최소 152경기(90+56+6)가 기록되는지, `run_pro_postseason`이 standings 5팀 미만이면 None을 반환하는지·5팀 있으면 챔피언을 내는지, `season_rollover`가 리그별로 순위를 매기는지.

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 — 독립리그 10팀 로스터 생성 후 `run_independent_season` 1회 호출 → 152경기 기록+챔피언 1명 배출 확인. 프로 10팀은 1차분 로직으로 정규시즌 완주(`advance()` 반복) → `season_rollover`가 자동으로 `run_pro_postseason`을 트리거해 챔피언이 `league_transactions`에 기록되고 10팀 전부 `history_standings`에 정확히 아카이브됨을 확인.

**다음 세션이 할 일**(4차분 완료로 갱신, 아래 §6-8 참고): I5 잔여 중 `sim/injury`(부상 시스템 — `sim/growth` 하락기/노쇠와 묶어서, 04_성장_곡선.md §4·§5가 이미 그렇게 연동을 확정해둠) 다음 후보. 아니면 I6(주인공 플로우)로 넘어가 `sign_core_state`·`find_protagonist_game_today`가 실제 주인공으로 동작하는 걸 볼 수도 있음 — 순서는 다음 세션 시작 시 확인.

### 6-7. I5 3차분 착수 기록 (2026-07-15, 완료)

**스코프**: 2차분에서 이월한 대학 3개 대회(왕중왕전·은하기·여명기)와 고교 5개 전국대회(개나리기·장미기·무궁화기·국화기·패왕기) — 총 8가지 브래킷 포맷.

**리서치로 확인한 핵심 통찰**: 8개가 겉보기엔 전부 다른 대회지만 실제로는 **두 원시 연산의 조합**일 뿐이었다 — ①시드+WC로 참가자를 뽑아 ②단판 넉아웃 브래킷(대학 3개는 예선 조별 라운드로빈을 먼저 거침)을 돈다. 표준 시드 브래킷 순서(`1v16·2v15…` 재귀 접기)를 구현하면 "부전승 N명" 수치가 **참가인원과 브래킷 크기(2의 거듭제곱)의 차이와 자동으로 정확히 일치**함을 수학적으로 확인(무궁화기 48→64=16부전승, 국화기 102→128=26부전승, 패왕기 24→32=8부전승 — 전부 문서 수치와 일치, 우연이 아니라 재귀 시드 순서의 구조적 성질).

**고교 8권역 vs 12권역 불일치 해소**: 정규시즌 스케줄(1차분)이 쓰는 `stadium_id` 그룹은 8개(서울·경기인천·강원·충청·호남·대구경북·부경울·제주)인데, 02_고교.md §4-2의 지역시드 표("전년 권역 상위 2(=24)" 등)는 분모가 12(서울/경기인천/호남/부경울만 A·B로 갈라짐)다. 실측(`content.db` 쿼리)으로 8권역 각각의 팀 수가 §4-1 "권역별 분포" 표의 8개 대권역 합계와 정확히 일치함을 확인 — 즉 12권역은 8권역 중 4개(서울·경인·호남·부경울)를 소권역 2개로 쪼갠 것뿐이라, **"소권역당 N장" 공식을 8권역에 그대로 접어도 정보 손실이 없다**(대권역=2N장, 단일권역=N장). 세부 A/B 팀 편성 자체는 여전히 미확정(1차분과 같은 이유)이라 실제 배정은 안 함 — 권역 합계 수치만 8권역에 접어 재현.

**포함**:
- `simulate_knockout_bracket`(범용 단판 넉아웃 — 표준 시드 순서로 배치, 부전승은 상위 시드가 자동 흡수) + `run_group_stage_and_advance`(범용 조별 예선 — 기존 `simulate_round_robin_stage` 그대로 재사용) 2개 원시 함수로 8개 대회 전부 커버.
- 대학 3개: `run_univ_wangjungwang`(조1위5+WC3=8, 예선 없이 바로 8강) · `run_univ_eunhagi`(조상위4×5+WC4=24 → 8조×3팀 완전 랜덤 예선 → 조1위만 8강) · `run_univ_yeongmyeonggi`(조상위3×5+WC5=20 → 4조×5팀 완전 랜덤 예선 → 상위2×4조 8강).
- 고교 5개: `run_hs_region_seeded_bracket` 공통 골격(권역 시드+WC → 바로 브래킷) 위에 `run_hs_gaenari`/`run_hs_jangmi`(24+8=32강) · `run_hs_mugunghwa`(36+12=48강, 상위16 부전승) · `run_hs_paewang`(24+0=24명, 32대진 상위8 부전승) · `run_hs_gukhwa`(WC·지역시드 없이 102팀 전원, 128대진 상위26 부전승).
- 시상 시점 구분(개나리기=전년 순위·장미기=전반기·패왕기=후반기) 캘린더 동기화는 2차분에서 이미 채택한 단순화("정규시즌 끝나는 시점에 한 번에 동기 시뮬")를 그대로 연장 — 전부 "호출 시점의 현재 standings" 기준으로 통일.

**제외(계속 이월)**: `sim/growth`·`injury`·`eval`·`market`·`npc` 전체. 대학 A/B조·고교 A/B권역 세부 팀 편성 확정. 시상식 텍스트·`history_leaders` 등 서사 요소(챔피언 `team_id`만 `league_transactions`에 기록).

**구현**: `engine/src/data/repository.rs`에 `standard_seed_order`·`simulate_knockout_bracket`·`run_group_stage_and_advance`·`shuffle_and_split`·`wildcards_from_remainder`·`record_champion`(공통 유틸) + `univ_group_ranked`·`hs_region_standings`·`hs_region_seeds`·`hs_region_quota`(시드 계산 헬퍼) + 8개 `pub fn run_*` 대회 진입점 추가. 신규 함수는 전부 기존 `simulate_series`(best_of=1로 단판 재사용)·`simulate_round_robin_stage`·`content::load_team_groups_for_schedule`·`content::load_team_ids_for_league`를 재사용 — 새 DB 스키마 변경 없음.

**테스트**(`cargo test` 49개, 신규 11개): `standard_seed_order`가 알려진 배치(n=8 → `[1,8,4,5,2,7,3,6]`)와 일치하는지, 실제 사용되는 4개 (n_teams,bracket_size) 조합에서 부전승끼리 절대 안 만나는지, `simulate_knockout_bracket`이 2~9명 임의 인원에서 항상 챔피언 1명으로 수렴하는지, 대학 3개 대회가 각각 챔피언을 내고(은하기 8조×3경기=24경기, 여명기 4조×10경기=40경기 예선 기록 확인) 고교 5개 대회가 각각 챔피언을 내는지(합성 8권역 52팀 픽스처, 무궁화기가 WC12 후보 풀이 바닥나지 않는 크기로 설계됨).

**수동 검증**(임시 바이너리 `verify_i5_3.rs` + `process_day`를 일시적으로 `pub`으로 바꿔 확인, 둘 다 검증 후 원복·커밋 안 함): 실제 시드된 content.db로 대학·고교 로스터+정규시즌(19일) 전체 완주 후 8개 대회를 전부 실행 — 8명의 서로 다른 챔피언이 산출되고 `league_transactions`에 `kind='champion'` 행이 정확히 8개 기록됨을 확인.

### 6-8. I5 4차분 착수 기록 (2026-07-15, 완료)

**스코프**: I5 잔여(`growth`·`injury`·`eval`·`market`·`npc`) 중 `sim/growth`의 **상승기(XP→스탯)만** — [04_성장_곡선](../02_기획/육성코어/04_성장_곡선.md) §1 "전체 커리어 곡선 = 상승기(XP→스탯) + 하락기(나이→노쇠)"의 앞부분.

**스코프 판단(하락기를 제외한 이유)**: 04_성장_곡선.md §4·§5가 하락기(노쇠)의 개시 시점·속도를 **부상 이력에 연동**시키도록 이미 확정해뒀고(§5 열린 세부: "부상 이력이 정확히 어떻게 하락 곡선에 반영되는지 — [08_부상_시스템](../02_기획/육성코어/08_부상_시스템.md) 확정 후 재연결"), 부상 시스템 자체가 아직 구현 전이라 지금 하락기를 만들면 나중에 다시 뜯어야 함 — **하락기는 다음 서브분(부상 시스템)과 묶어서 처리**하기로 함. [06_훈련_시스템](../02_기획/육성코어/06_훈련_시스템.md)의 슬롯 배분(주능력치3+구종1, 강도 다이얼)은 **플레이어가 직접 선택하는 UI**라 주인공 전용(I6 스코프) — 172팀 배경 NPC는 그런 선택을 할 수 없으므로 이번 구현에서 재현하지 않고, NPC는 매주 자동으로 XP를 얻는 훨씬 단순한 모델로 대체.

**리서치로 확정한 설계**:
- **XP 대상**: 노출 스탯 9종만(`sim::roster`의 PITCHER_STATS/BATTER_STATS와 동일 집합). 히든 3종(천재성·인성·성실함)은 §2 "천재성이 곡선을 좌우"라는 문구대로 **성장의 대상이 아니라 성장을 좌우하는 변수**라 XP 축적 대상에서 제외.
- **주간 XP 획득량**·**임계값 계수**는 04_성장_곡선.md §5가 명시적으로 "스탯 스케일 확정 후"(Phase I8)로 미뤄둔 항목이라 D그룹과 동급 placeholder로 취급 — `sim::match_sim`의 PA 판정식과 같은 원칙(플레이스홀더 상수 + 명확한 주석, I8 하네스에서 재조정).
- **재능 캡(천재성) 반영 방식**: 스탯이 천재성 값을 넘어서면 임계값을 3배로 올려 성장을 급격히 둔화시키되(§2 "상한에 영향") 완전 차단하지 않음(하드 락은 "운 나쁘면 평생 안 자람" 같은 이상 케이스를 만들 수 있어 피함) — 절대 상한은 [01_선수_능력치](../02_기획/육성코어/01_선수_능력치.md) §7의 스케일 상수 80 하나로 통일.
- **적용 대상**: `retired = 0`인 전 NPC(172팀 균등원칙, 리그·팀·주인공 여부로 차별 안 함). 주인공(`protagonist` 테이블)은 이 함수가 안 건드림 — 주인공 성장은 06_훈련_시스템의 슬롯 선택과 엮여야 해서 I6 스코프.
- **결정성**: `league_sub_seed(world_seed, "growth:{npc_id}:{day}")`로 선수별·주별 RNG 서브시드를 도출 — 기존 `match:{game_id}` 패턴과 동일한 원칙.

**구현**:
- `engine/src/sim/growth.rs`(신규): `exposed_stats_for(position)`(투수/타자 노출스탯 판별), `apply_weekly_growth(rng, exposed, stats, xp, genius)`(순수 함수 — DB 접근 없음, `stats`/`xp`를 in-place로 갱신). XP 임계값을 여러 번 넘기면 한 주에 여러 단계 성장 가능(§2 "임계값 돌파하면 즉시 반영"을 그대로 반복 적용).
- `engine/src/data/repository.rs`: `process_week`(그동안 no-op)를 구현 — `world_seed` 파라미터 추가(호출부 `advance()`도 같이 수정), `npc` 전체를 조회해 포지션별 노출스탯셋으로 `apply_weekly_growth` 적용 후 `stats`/`xp` UPDATE.

**테스트**(`cargo test` 56개, 신규 6개): `sim/growth.rs` 4개(동일시드→동일결과, 500주 반복해도 하드캡 80 안 넘고 실제로 자람, 천재성 높을수록 평균적으로 더 빨리 자람, XP가 임계값 미만이면 스탯 안 움직임) + `repository.rs` 2개(`process_week`를 30주 반복 호출하면 노출 스탯 중 최소 하나는 증가·히든 스탯은 불변, `retired=1` 선수는 30주를 돌려도 완전히 그대로).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 `generate_initial_world` → `advance()` 1회(한 시즌 364일, `process_week`가 52회 실행) → 샘플 NPC 1명의 노출 스탯 중 6개가 증가(예: 경기운영 22.67→28.67)하고 히든 3종(천재성·인성·성실함)은 완전히 그대로임을 확인, 172팀 전체 `stats` 합계가 시즌 시작 대비 +21 증가.

### 6-9. 문서 갱신 규칙

**이 문서는 살아있는 문서다.** Phase를 하나 끝낼 때마다:
1. §2 표의 해당 행 상태를 `⬜ 미착수` → `🔶 진행중` → `✅ 완료`로 갱신.
2. 완료 시 실제로 무엇을 만들었는지, 다음 세션이 알아야 할 특이사항(발견한 버그·우회법 등, P7 때처럼)을 이 문서나 관련 문서에 남긴다.
3. 커밋 메시지에 Phase 번호를 명시(예: "impl: I0 리포지토리 스캐폴딩").
