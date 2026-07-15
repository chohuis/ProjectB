# 구현 Phase 계획 (착수 로드맵 — 새 세션 온보딩 문서)

> 근거: [00_결정_요약](00_결정_요약.md)(전체 결정 인덱스) · [03_구조](03_구조.md) §5-1(엔진 모듈 지도) · [05_밸런스](05_밸런스.md) §3(확정 순서) · [07_데이터관리](07_데이터관리.md) §7(초기구축순서) · [08_P7_체크리스트](08_P7_체크리스트.md)(실측 완료) · [09_개발환경_세팅](09_개발환경_세팅.md) · 대화 설계(2026-07-14)
> 상태: **I0·I1 완료, I2 착수 대기** — 2026-07-15
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
| **I2** | 초기 세계 데이터 구축 | `data/seed/*.csv·toml` 실제 작성(172팀 리그팀 markdown→트랜스크립션), `content seed` CLI 구현 | content.db에 172팀·리그·구장·특성·히스토리·생성규칙 전부 반영, `content validate` 통과 | [07_데이터관리](07_데이터관리.md) §3 | 🔶 진행중 — CLI 파이프라인 완성. 독립10+고교102+대학50(전부 2026-07-15) 시드 완료(162팀 누적), 프로20 및 생성규칙·이름풀 이월(아래 §6-2) |
| **I3** | 선수 생성 엔진(`sim/roster`) | canonical_seed 기반 결정적 로스터 생성(`generateInitialWorld`) | 새 게임 시작 시 172팀 ~3,700명이 slot.db에 생성, 동일 seed→동일 결과(재현성 테스트) | [07_데이터관리](07_데이터관리.md) §2 · [01_선수_능력치](../02_기획/육성코어/01_선수_능력치.md) | ⬜ 미착수 |
| **I4** | 게임 루프 오케스트레이터(`api/advance`) | 일/주/월/시즌 경계 처리, PendingAction 7종 상태기계 | `advance()` 호출 시 여러 주 진행 후 정지점에서 올바로 멈춤 | [04_게임루프](04_게임루프.md) | ⬜ 미착수 |
| **I5** | 나머지 sim 모듈 | `sim/growth`·`sim/injury`·`sim/eval`·`sim/match`(배경)·`sim/market`·`sim/npc`·`sim/schedule` — [05_밸런스](05_밸런스.md) §3 순서(A→B→C→{D,E,F}→G,H→I)로 구현+가밸런스 적용 | 배경 시뮬만으로 시즌 1개 완주 가능 | [03_구조](03_구조.md) §5-1 · 육성코어 01~09 각 문서 | ⬜ 미착수 |
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
- **다음 세션이 이어받을 것**: 프로(20, 1군10+2군10)만 남음. 프로는 [01_프로](../02_기획/리그팀/01_프로.md)(연고·전력★·컬러 이미 §1에 다 있음, 05/06/07/08 문서 참조 불필요할 만큼 자기완결적) 하나만 읽으면 됨 — 2군은 "1군 연동(같은 연고)"이라 별도 손저작 데이터 없이 1군을 그대로 파생시키면 됨([00_개요](../02_기획/리그팀/00_개요.md) §2). 프로가 끝나면 172팀 시드가 전부 완료. 이후 `pitch_types.csv`·`name_pools.csv`·`generation_rules.toml`·`personality_rules.toml`·`world_config.toml`(canonical_seed)은 팀 데이터와 무관하니 별도로 진행 가능.

### 6-3. 문서 갱신 규칙

**이 문서는 살아있는 문서다.** Phase를 하나 끝낼 때마다:
1. §2 표의 해당 행 상태를 `⬜ 미착수` → `🔶 진행중` → `✅ 완료`로 갱신.
2. 완료 시 실제로 무엇을 만들었는지, 다음 세션이 알아야 할 특이사항(발견한 버그·우회법 등, P7 때처럼)을 이 문서나 관련 문서에 남긴다.
3. 커밋 메시지에 Phase 번호를 명시(예: "impl: I0 리포지토리 스캐폴딩").
