# 구현 Phase 계획 (착수 로드맵 — 새 세션 온보딩 문서)

> 근거: [00_결정_요약](00_결정_요약.md)(전체 결정 인덱스) · [03_구조](03_구조.md) §5-1(엔진 모듈 지도) · [05_밸런스](05_밸런스.md) §3(확정 순서) · [07_데이터관리](07_데이터관리.md) §7(초기구축순서) · [08_P7_체크리스트](08_P7_체크리스트.md)(실측 완료) · [09_개발환경_세팅](09_개발환경_세팅.md) · 대화 설계(2026-07-14)
> 상태: **I0~I6 완료(I5는 8차분까지, `eval`·`market`은 I6로 재배치, I6는 8차분까지 — `sim/market` 전체 완료), I7 착수(5차분 완료 — 엔진 api 레이어+뉴게임/진행/매치 최소 화면+내 선수/리그/기록 허브 3개+injuryTreatment 전용화면)** — 2026-07-16
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
| **I5** | 나머지 sim 모듈 | `sim/growth`·`sim/injury`·`sim/eval`·`sim/match`(배경)·`sim/market`·`sim/npc`·`sim/schedule` — [05_밸런스](05_밸런스.md) §3 순서(A→B→C→{D,E,F}→G,H→I)로 구현+가밸런스 적용 | 배경 시뮬만으로 시즌 1개 완주 가능 | [03_구조](03_구조.md) §5-1 · 육성코어 01~09 각 문서 | ✅ **완료**(8차분까지, 2026-07-15) — 1차분(`sim/schedule`+`sim/match`, 정규시즌)+2차분(독립리그+독립/프로 포스트시즌)+3차분(대학·고교 포스트시즌/전국대회)+4차분(`sim/growth` 상승기)+5차분(`sim/injury` 누적형+`sim/growth` 하락기)+6차분(`sim/injury` 급성형, 매치 엔진 확장)+7차분(`sim/npc` 세대교체 — retire+generate_freshmen)+8차분(`sim/npc` 병역 — enlist/discharge). **`sim/eval`·`sim/market`은 리서치 결과 대부분 주인공 전용으로 판명돼 I6로 재배치**(§6-11) — I5가 원래 목표한 "배경 시뮬만으로 시즌 완주"는 이 둘 없이도 이미 충족돼 완료 처리. 상세는 아래 §6-11·§6-12 |
| **I6** | 주인공 플로우 | 캐릭터 생성([07_주인공_생성](../02_기획/07_주인공_생성.md)), 주인공 등판 매치 세션(`startMatch`/`pitch`) | 캐릭터 생성 후 첫 경기를 실제로 뛸 수 있음(반자동 모드 최소) | [04_UI기획/06_캐릭터생성](../04_UI기획/06_캐릭터생성.md) · [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) | ✅ **완료**(3차분에서 핵심 기준 달성, 2026-07-15) — 1차분(`create_protagonist`)+2차분(`sim/pitch` 1구 판정 로직)+3차분(`data/match_session`)+4차분(`sim/eval` 경기단위 S~D 평가, `finalize_game`에 배선 — 사기·주목도·`game_log` 반영)+5차분(`sim/training` 훈련 슬롯 — 능력치 주/보조 슬롯 + 신규 구종 습득)+6차분(부상 치료 선택 — `apply_injury`/`treat`, `injuryTreatment` PendingAction)+7차분(`sim/market` 방출·재계약·FA — `contractNego` PendingAction)+8차분(`sim/market` 트레이드 — `tradeDecision` PendingAction, `sim/market` 전체 완료). 감독 개입·콜드게임(인터랙티브 경로)·개인 통산 스탯·월/시즌 단위 평가는 계속 이월. 상세는 아래 §6-13~§6-20 |
| **I7** | Flutter UI | `04_UI기획/` 00~08 화면 실제 구현(4허브+진행버튼+매치 CustomPainter) | 최소 플레이 가능한 루프가 실제 화면에서 끝까지 동작(뉴게임→진행→경기→시즌종료) | `04_UI기획/` 전체 | 🟨 **착수**(5차분 완료, 2026-07-16) — 1차분(엔진 api 레이어+최소 화면)+2차분(내 선수 허브)+3차분(리그 허브)+4차분(기록 허브)+5차분(`injuryTreatment` 전용화면 — 부상 치료 3옵션 비교표, 전용화면 5종 중 지금 유일하게 실전 발동 가능). `메시지함`은 I8 콘텐츠 저작 전제라 보류. 남은 건 매치 CustomPainter 비주얼·나머지 전용화면 4종(진로 갈림길 엔진 작업 선행 필요)·세이브 슬롯 영속성·반응형 레이아웃·은퇴 화면. 상세는 아래 §6-21~§6-25 |
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

**다음 세션이 할 일**(I7 5차분 완료로 갱신, 아래 §6-25 참고): 사용자가 확정한 추천 순서대로 — 다음은 **②진로 갈림길 엔진 작업**(고교→대학/독립/프로, 01_커리어_구조.md §5 — `contractNego`/`tradeDecision`/`draft`/`careerChoice` 4종 전용화면이 실전에서 의미를 가지려면 반드시 선행) → ③그 4종 전용 화면. 그 외 남은 것: 매치 CustomPainter 비주얼(다이아몬드·존그리드, 05_매치.md), 세이브 슬롯 영속성(`createSlot`/`loadSlot`), 반응형 레이아웃, 은퇴 화면, 메시지함(I8 이후 재검토). I6 계속 이월분(감독 개입·콜드게임 인터랙티브 경로·개인 통산 스탯·월/시즌 단위 평가)도 여전히 남아있음 — 이 순서와 독립적이라 아무 지점에 끼워 넣어도 무방. `build_runner`/Dart 3.10.3 호환 이슈(§6-22)와 `testWidgets`+frb 비동기 조합 패턴(§6-23)은 다음 위젯 테스트 작성 시 재확인.

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

### 6-9. I5 5차분 착수 기록 (2026-07-15, 완료)

**스코프**: I5 잔여 중 `sim/injury`(누적형 부상)와 `sim/growth`의 **하락기(나이→노쇠)** — 4차분에서 미룬 짝. [04_성장_곡선](../02_기획/육성코어/04_성장_곡선.md) §5가 "부상 이력이 정확히 어떻게 하락 곡선에 반영되는지 — [08_부상_시스템](../02_기획/육성코어/08_부상_시스템.md) 확정 후 재연결"이라 명시해뒀던 그대로, 이번에 둘을 함께 처리해 재작업을 피함.

**스코프 판단(급성형을 제외한 이유)**: 08_부상_시스템.md §3은 부상 원인을 누적형(과사용)·급성형(경기 중 우발) 2갈래로 나눈다. 급성형은 [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) §13이 "발생 시 즉시 강판"이라 명시하는데, 이 프로젝트엔 아직 불펜 교체·로테이션 관리 시스템이 없어(I5 1차분에서 이미 "선발완투 placeholder"로 명시적으로 이월해둔 항목) "즉시 강판"을 실제로 구현하면 그 자리를 대신할 감독 AI가 필요해진다. 게다가 급성형을 판정에 넣으려면 `sim::match_sim::simulate_game`의 반환 타입과 `BatterStats`/`PitcherStats`(선수 id·피로도 추가 필요)까지 바꿔야 해서 4개 호출부(process_day·simulate_series·simulate_round_robin_stage·기존 테스트)를 전부 건드리는 더 큰 변경이 된다 — **누적형(주간 처리, 기존 process_week 안에서 자연히 처리됨)만 이번에 하고 급성형은 다음 서브분으로 이월**.

**리서치로 확정한 설계**:
- **부상 데이터 모델**: `npc.injury` 컬럼(신규, slot.db v2) — `{"current": null|{"부위","심각도","치료","start_day","return_day"}, "history": [{"부위","심각도","day"}, ...]}`.
- **누적형 판정**(§3): 매주(§3에서 이미 확정) `live_state.피로도`가 임계치(70, placeholder) 넘으면 확률 판정 — 팀 철학(부상방지/재활특화=완화 0.5배, 스파르타(혹독훈련)=가중 1.5배, [05_팀_특성_시스템](../02_기획/리그팀/05_팀_특성_시스템.md) §1)이 확률을 보정. "전조 경고" 단계(§3)는 인박스·알림 시스템이 필요해 이번 스코프 밖 — 임계 초과 시 곧바로 확률 판정으로 단순화.
- **피로도 소스**: 그동안 `live_state.피로도`가 생성 시 0으로 고정된 채 아무 데서도 안 건드려져 있었음(진짜 gap) — `process_day`에 `accumulate_game_fatigue` 신규 추가, 그날 뛴 타자 전원(`load_batting_lineup`과 동일 정의, 선발투수 아닌 전원)과 그날의 선발투수 1명(완투 placeholder)에게 소폭 증가. `process_week`은 매주 절반으로 감소(회복 placeholder). 다전제·브래킷 경기는 건드리지 않음 — 캘린더 없이 동기 시뮬되는 구조라 날짜 단위 피로 개념이 안 맞음(2차분·3차분에서 이미 확정한 단순화).
- **재발 심각도 상승**(§5): 같은 부위 재발이면 자동 한 단계 상승(경미→중등→중상, 상한 유지).
- **치료법**: 감독/매니저 AI가 아직 없어 NPC는 항상 "재활"(중간 옵션) 고정 — §4의 "수술"·"무리한 복귀" 선택은 실제 의사결정 주체(I6 이후)가 필요.
- **노쇠(하락기)**: 나이가 개인별 하락 시작 연령(기본 30세 placeholder)을 넘은 선수의 피지컬 스탯 3종(투수: 구속·체력·회복력, 타자: 파워·스피드·체력)만 매주 소폭 감소. 하락 시작 연령은 부상 이력 가중합(`sim::injury::severity_weight` 누적, §4 "부상 이력 누적될수록 조기 하락")만큼 앞당겨지고 성실함(히든)이 높을수록 늦춰짐(§4). 기술·멘탈 스탯은 안 건드림 — 같은 주에 상승기(`apply_weekly_growth`)를 먼저 돌리고 하락기를 이어 적용해 §1 "상승분과 하락분의 순합이 그 해 변화"를 자연히 만족.

**구현**:
- `engine/src/sim/injury.rs`(신규): 부위 6종·심각도 3종 상수, `escalate_severity`·`recovery_days`·`severity_weight`·`check_overuse_injury`(순수 함수).
- `engine/src/sim/growth.rs`: `apply_aging_decline` 추가(피지컬 스탯 서브셋 판별 + 하락 시작 연령 계산 + 주간 하락률 적용).
- `engine/src/data/slot.rs`: v2 마이그레이션 — `npc.injury TEXT` 컬럼 추가(다른 npc 컬럼처럼 nullable, NOT NULL 안 검).
- `engine/src/data/repository.rs`: `generate_league_roster`의 INSERT에 `injury` 초기값(`{"current":null,"history":[]}`) 추가. `record_injury`/`injury_severity_weight_sum`(injury JSON 갱신 헬퍼) 신규. `process_week` 확장 — `content_conn` 파라미터 추가(팀 철학 조회용), growth→피로도 회복+누적형 판정→aging decline 순서로 처리. `process_day`에 `accumulate_game_fatigue`/`bump_fatigue` 신규 추가.

**테스트**(`cargo test` 70개, 신규 14개): `sim/injury.rs` 5개(임계치 미만 무발생, 결정성, 스파르타>부상방지 확률 비교, 심각도 승격·상한, 이탈기간·노쇠가중치 단조증가), `sim/growth.rs` 5개(하락 시작 연령 전엔 무변화, 피지컬만 하락·기술멘탈 불변, 부상 이력 많을수록 하락 시작 당겨짐, 성실함 높을수록 지연, 하한 20 보장), `repository.rs` 3개(50명 고피로+스파르타 픽스처에서 최소 1명 부상 기록, 35세 선수가 정확히 -0.05만큼 피지컬 하락하고 기술 스탯은 불변, `process_day`가 선발투수·타자 전원의 피로도를 실제로 올림), `slot.rs` 1개(v2 마이그레이션이 `npc.injury` 컬럼을 추가하는지).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 `generate_initial_world` → `advance()` 1회(한 시즌 364일) → 전체 4,410명 중 **72명이 최소 1회 부상**, 한 선수는 시즌 중 **12회**까지 누적(선발완투 placeholder 때문에 같은 투수가 매 경기 등판해 피로가 급격히 쌓이는 알려진 부작용 — 버그 아니라 로테이션 시스템이 생기면 자연히 완화될 항목으로 기록), 최고령(40세, 프로) 선수의 스탯 확인. `record_injury`의 부위·심각도·복귀일 필드가 실제 JSON에 정확히 채워짐을 확인.

### 6-10. I5 6차분 착수 기록 (2026-07-15, 완료)

**스코프**: 5차분에서 이월한 급성형(경기 중 우발) 부상 — [08_부상_시스템](../02_기획/육성코어/08_부상_시스템.md) §3의 나머지 절반. [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) §13 "발생 시 즉시 강판"이 요구하는 실제 로스터 결원 효과는 이번에도 스코프 밖으로 유지 — 불펜 교체·로테이션 관리(감독 AI)가 없어 "강판 후 누가 대신 던지는가"를 답할 수 없기 때문(1차분에서 이미 "선발완투 placeholder"로 명시). **5차분에서 확립한 전례를 그대로 연장**: 누적형 부상도 발생 시 로스터 제외 없이 기록만 하는 것으로 이미 스코프를 잡아뒀으므로, 급성형도 "판정·기록"까지만 하고 "즉시 강판"의 게임플레이 효과는 이후 감독 AI Phase로 재이월.

**설계**: `sim::match_sim::simulate_game`이 타석마다(§11 "최소 타석 단위") 타자·투수 양쪽에 대해 급성 부상을 판정하고, 발생하면 `InjuryEvent{player_id, part, severity}`를 `GameResult.injuries`에 담아 반환 — 실제 DB 기록(`npc.injury` UPDATE)은 여전히 repository.rs 쪽 책임(match_.rs는 DB에 접근하지 않는 순수 함수 원칙 유지). 확률식은 §3 "피로가 높을수록 급성 부상 확률도 소폭 가산"만 반영(팀 철학은 §3 표에서 누적형 행에만 연결돼 있어 급성형엔 미적용 — 누적형과의 유일한 차이).

**구현**:
- `engine/src/sim/injury.rs`: `check_acute_injury(rng, fatigue)` 추가 — PA당 기본확률 + 피로도 가산(placeholder 계수), 심각도 분포는 과사용보다 중상 비중을 높게 잡음("즉시 강판"이 내포하는 급작스러움).
- `engine/src/sim/match_.rs`: `BatterStats`/`PitcherStats`에 `id: String`·`fatigue: f64` 필드 추가(급성 부상을 "누구에게" 귀속시킬지 알아야 해서 — 이전엔 스탯값만 갖고 있었음). `InjuryEvent` 신규. `simulate_half_inning`이 매 PA마다 타자·투수 양쪽에 `check_acute_injury`를 굴려 이벤트를 수집, `GameResult.injuries: Vec<InjuryEvent>`로 반환.
- `engine/src/data/repository.rs`: `load_batting_lineup`/`load_starting_pitcher`가 `id`·`live_state.피로도`도 함께 읽어 `BatterStats`/`PitcherStats`에 채움(SQL이 `stats` 하나만 읽던 걸 `id, stats, live_state`로 확장). `apply_injury_events`(신규) — `GameResult.injuries`를 순회하며 기존 `record_injury`(5차분에서 만든 재발승격·복귀일 로직)를 그대로 재사용해 DB에 반영. `process_day`·`simulate_series`·`simulate_wild_card`·`simulate_round_robin_stage` 4개 호출부 전부 배선(다전제·WC전은 캘린더가 없어 day=0 placeholder, 나머지는 실제 day 사용).
- **실제 버그 발견·수정**: 새 `apply_injury_events`가 처음엔 `injury` 컬럼을 non-nullable `String`으로 읽어, `injury`가 아직 한 번도 안 채워진(대부분의 기존 테스트 픽스처가 이 컬럼을 세팅 안 함, 5차분에서 NULL 허용으로 남겨둔 컬럼) 선수를 만나면 `InvalidColumnType(Null)` 패닉 — 11개 기존 테스트가 즉시 실패해 발견. `Option<String>` 읽기+기본값 폴백으로 수정(5차분의 `process_week`가 이미 쓰던 것과 동일 패턴을 안 따라 생긴 회귀).

**테스트**(`cargo test` 76개, 신규 6개): `sim/injury.rs` 3개(2만 PA 중 최소 1건은 발생하되 100건 미만으로 드묾, 피로도 높을수록 확률 증가, 결정성), `sim/match_sim.rs` 2개(피로도 200인 픽스처로 50경기 돌리면 최소 1건 부상 발생, 피로도 0인 단일 경기는 거의 발생 안 함), `repository.rs` 1개(전원 피로도 5000으로 세팅 후 경기 1회 시뮬 → 최소 1명 부상 기록 확인).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 `generate_initial_world` → `advance()` 1회(한 시즌 364일) → 전체 4,410명 중 **280명이 최소 1회 부상**(5차분 누적형 단독 결과였던 72명에서 대폭 증가 — 매주 1회뿐인 누적형 체크와 달리 급성형은 매 타석마다 판정되니 기회 자체가 훨씬 많아 자연스러운 증가), 총 부상 이벤트 **801건**.

### 6-11. I5 7차분 착수 기록 (2026-07-15, 완료) — 스코프 재판단 + npc 세대교체

**원래 계획했던 "7차분"**: I5 잔여 3모듈(`sim/eval`·`sim/market`·`sim/npc`) 중 [05_밸런스](05_밸런스.md) §3 의존 그래프("C 평가"가 B 위에서 먼저)를 따라 `sim/eval`부터 시작하려 했음.

**리서치로 드러난 스코프 재판단**: 실제 문서를 읽어보니 이 계획이 잘못 짜여 있었다.
- [09_평가_시스템](../02_기획/육성코어/09_평가_시스템.md) §5-2 "평가 대상 — **주인공만**": "NPC 투수·타자는 경기 데이터(스탯)는 쌓이지만 S~D 등급은 부여하지 않음 — 시스템 단순화... NPC 로테이션·역할 판단은 등급 대신 능력치+누적 성적만으로 감독 AI가 서열을 매긴다." S~D 평가 자체가 배경 NPC용이 아니라 주인공 전용 "서사적 피드백 렌즈"임이 명시돼 있었다.
- [06_시장_계약](../02_기획/06_시장_계약.md) 전체가 "주인공"의 협상(수락/역제안/노트레이드 거부권 등)을 중심으로 서술돼 있고, 방출·FA·트레이드 전부 플레이어가 직접 고르는 UI 액션으로 짜여 있다 — 배경 NPC용 자동 시뮬레이션 로직이 아니다.
- **사용자 확인**(대화, 2026-07-15): "npc 세대교체+병역만 I5로, eval/market은 I6로 이월" — Phase 표의 "sim/eval"·"sim/market"을 I5(배경 시뮬)에서 빼고 I6(주인공 플로우)로 재배치.

**이번에 실제로 한 일 — `sim/npc` 세대교체(retire+generate_freshmen)**:
- **범위를 의도적으로 좁힘**: [01_커리어_구조](../02_기획/01_커리어_구조.md) §5의 실제 진로 갈림길(고교→대학/독립/프로 드래프트, FA, 트레이드)은 근본적으로 주인공이 선택하는 서사 이벤트라 여기서 재현하지 않음. NPC는 **같은 팀 안에서 은퇴→신인 충원이 반복되는 "제자리 순환"** placeholder — 172팀이 여러 시즌을 거쳐도 로스터 인원이 유지되는 기능적 목표만 만족시킨다.
- **나이 증가**: 그동안 `npc.age`가 생성 시점에 고정된 채 아무 데서도 안 올라가고 있었음(진짜 gap, 5차분의 피로도와 같은 종류) — `season_rollover`에 `age = age + 1`(retired=0 전원) 추가.
- **은퇴 판정**: `sim::npc::check_retirement(rng, age, league_max_age)` — `sim::roster::age_range`(이미 초기 생성에 쓰던 리그별 연령대, 이번에 `pub`으로 승격)의 상한에 가까울수록 확률 상승하는 순수 함수. `season_rollover`가 나이 증가 직후 전 활성 NPC에 대해 굴려 `retire()`(신규 구현 — `retired=1` 설정) 호출.
- **버그 발견·수정**: `retire()`가 지금까지 `todo!()`라 한 번도 실제로 `retired=1`이 찍힌 적이 없었는데, 그 상태에서도 `load_batting_lineup`·`load_starting_pitcher`·`accumulate_game_fatigue`가 애초에 `retired` 컬럼을 전혀 필터링하지 않고 있었다는 걸 이번에 구현하며 발견 — 이제 `retire()`가 실제로 동작하니 그대로 뒀으면 은퇴 선수가 계속 경기에 나오는 버그가 됐을 것. 세 함수 전부 `AND retired = 0` 추가.
- **신인 충원**: `generate_freshmen(conn, content_conn, world_seed, season)` — 팀별 활성 로스터가 `generation_rules.roster_size`보다 모자란 만큼만 `sim::roster::generate_team`을 재사용해 채움(`roster_size`만 부족분으로 바꾼 규칙을 넘겨 투수/타자 비율 등은 그대로 유지). id는 `npc:{world_seed}_{league_slug}_freshman_{season}_{seq}`로 초기 생성 id와 안 겹치게. 이름풀·생성규칙이 없는 리그(합성 테스트 픽스처 등)는 조용히 건너뜀 — 실제 시드 content.db는 5개 리그 전부 채워져 있어 이 분기를 안 탐.
- `season_rollover` 순서: 시즌카운터 증가 → 인박스 비움 → 프로 포스트시즌 → standings 압축(리그별 순위) → **나이 증가 → 은퇴 판정 → 신인 충원**(이번 추가분) → standings/schedule/season_stats 초기화.

**테스트**(`cargo test` 83개, 신규 7개): `sim/npc.rs` 4개(상한보다 훨씬 어리면 무발생, 상한 근처에서 실제로 발생, 결정성, 나이가 많을수록 더 자주 은퇴), `repository.rs` 3개(`retire()` 후 해당 선수가 라인업 조회에서 실제로 빠지는지, `generate_freshmen`이 부족한 자리만 정확히 채우는지, 70세 선수를 낀 3인 로스터로 `season_rollover` 15회 반복 시 그 선수가 은퇴하고 로스터 인원이 계속 3명으로 유지되는지).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 `generate_initial_world`(4,410명) → `advance()` 1회(한 시즌, `season_rollover` 1회 실행) → **2,595명 은퇴 + 2,595명 신인 생성**(정확히 1:1 교체 — 초기 로스터가 리그별 연령대 전 구간에 균일 생성돼 있어 첫 시즌에 상한 근처 인원이 한꺼번에 몰린 결과, 버그 아님), 활성 인원은 4,410명 그대로 유지. **5개 리그 전부** 활성 로스터 합계가 `roster_size × 팀수`와 정확히 일치(고교 2,550명·대학 1,100명·독립 200명·2군 280명·1군 280명) 확인.

### 6-12. I5 8차분 착수 기록 (2026-07-15, 완료) — `sim/npc` 병역, I5 전체 완료

**스코프**: [03_병역](../02_기획/03_병역.md) — I5 잔여 마지막 항목. [05_밸런스](05_밸런스.md) §3 의존 그래프에서 "I 이벤트·병역·기타"(나머지 참조, 가장 나중)로 분류돼 있어 순서상으로도 마지막.

**스코프 판단**: 03_병역.md도 §1 "타이밍 = 플레이어 유연 선택"이라 대부분 주인공 전용이지만(§6-11의 eval/market과 같은 패턴), §9 "미이행 지속 시 불이익"이 정확히 "선택하지 않는 경우"의 기본 처리를 이미 규정해뒀다 — "일정 시점(만 28세 상당)까지 선택 안 하면 강제 이벤트... 현역 복무로 자동 편입". NPC는 선택할 수 없으니 이 **강제편입 기본 경로(현역)만 재현**하고, 면제(국대 발탁)·상무(성적 상위 선발)는 각각 국제대회 시스템·평가 시스템(§6-11에서 I6로 미룬 바로 그 `sim/eval`)이 필요한 특별 경로라 명시적으로 스코프 아웃.

**구현**:
- `slot.db` v3 마이그레이션 — `npc.military_return_day INTEGER`(NULL=복무 아님, non-NULL=전역 예정일) · `npc.military_served INTEGER DEFAULT 0`(평생 1회, 재입대 없음). injury처럼 JSON blob이 아니라 단순 플래그 2개로 충분해 plain 컬럼으로(SQL에서 바로 필터링 가능해야 해서 — 로스터 조회 쿼리 3곳이 이 값으로 걸러야 함).
- `sim/npc.rs`: `MILITARY_MIN_AGE=28`(§9 placeholder) · `MILITARY_SERVICE_DAYS=630`(§2 "~1.5~2년"의 중간값, 1시즌=364일 기준 약 1.7년).
- `sim/growth.rs`: `apply_military_decline` 추가 — §8 "피지컬만 소폭 하락, 기술·멘탈은 안 늘지도 안 줄지도 않는다"를 그대로 수치화(하락률은 나이 기반 하락보다 다소 빠르게 잡음, "감이 무뎌졌다"는 서사적 의도).
- `repository.rs`: `enlist`/`discharge` 구현(그동안 `todo!()`). `season_rollover`에 `day` 파라미터 추가(호출부 `advance()`·기존 테스트 전부 갱신) — 나이 증가·은퇴 판정과 **같은 루프에서** 입대 대상(복무 이력 없음+28세 이상)을 골라 `enlist` 호출(은퇴한 선수는 `continue`로 건너뛰어 같은 시즌에 은퇴+입대가 동시에 안 나게 함). `process_week`가 매주 "현재 day ≥ military_return_day"를 확인해 자동 전역(`discharge`) 처리 — 복무 중인 선수는 `apply_weekly_growth`·`apply_aging_decline`을 아예 건너뛰고 `apply_military_decline`만 적용(§8을 정확히 반영), 피로도 회복·과사용 부상 체크는 복무 여부 무관하게 계속 돔. `load_batting_lineup`·`load_starting_pitcher`·`accumulate_game_fatigue`·`generate_freshmen`의 활성 인원 카운트 4곳 전부 `military_return_day IS NULL` 필터 추가 — 복무 중인 선수는 경기에 안 나오고, 로스터가 빈 것으로 잡혀 `generate_freshmen`이 대체 인원을 채운다(실제로 상무/사회복무 중엔 원 소속팀에서 못 뛰는 것과 같은 효과, 06_리그_히스토리처럼 정교한 "복귀 후 원위치"는 아니지만 로스터가 항상 채워져 있다는 기능적 목표는 만족).

**테스트**(`cargo test` 90개, 신규 7개): `slot.rs` 1개(v3 컬럼 추가), `sim/growth.rs` 2개(복무 중 하락이 피지컬만 건드리는지, 하한 20 보장), `repository.rs` 4개(`enlist`가 라인업에서 제외하고 `discharge`가 복원하는지, `process_week`가 복무 만료일 도달 시 자동 전역시키는지, 복무 중엔 성장 대신 하락만 적용되는지, `season_rollover`가 28세 이상 미복무자를 자동 입대시키는지).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 `generate_initial_world` → `advance()` 1회(한 시즌) → 172팀 전체에서 **165명이 입대**(전원 복무 중 — 복무기간 630일 > 1시즌 364일이라 아직 아무도 전역할 시점이 안 됨, 예상대로), 샘플 선수의 `military_return_day`(994) = 시즌 경계일(364) + `MILITARY_SERVICE_DAYS`(630) 정확히 일치 확인.

**I5 전체 완료 선언**: 원래 Phase 표의 "배경 시뮬만으로 시즌 1개 완주 가능"이라는 완료 기준은 1차분 시점에 이미 충족됐고, 이후 7개 서브분에 걸쳐 성장·부상·세대교체·병역까지 쌓아 올렸다. `sim/eval`·`sim/market`(및 부상 치료 선택 `apply_injury`/`treat`, 훈련 슬롯 `sim/training`)은 전부 "주인공이 선택하는" UI 중심 시스템이라 I6에서 자연스럽게 같이 설계하는 게 맞다고 판단해 I5 스코프에서 공식적으로 뺀다.

### 6-13. I6 1차분 착수 기록 (2026-07-15, 완료) — 캐릭터 생성

**스코프**: [07_주인공_생성](../02_기획/07_주인공_생성.md) §1의 7단계 플로우 중 **엔진이 실제로 데이터를 만드는 마지막 단계**(1~6단계는 화면 흐름·정보 조회라 I7 Flutter UI 소관, 이 문서가 다루는 건 "요약 확인 → 게임 시작"에서 실행되는 생성 로직 그 자체).

**설계**:
- **좌완/우완·학교(=고교 team_id)·구종**은 그대로 저장, **투수 타입(4종)이 시작 능력치·구종 후보 둘 다를 결정**(§4·§6) — 문서에 이미 정확히 명시된 매핑(강속구형→구속(+구위 소폭), 제구형→제구(+경기운영 소폭), 체력형→체력·회복력, 돌부처형→클러치·침착함)을 그대로 표로 옮김.
- **밴드 3단(하단/중간/상단)**: §4 "우세 스탯 1~2개는 상단 밴드, 나머지는 하단 밴드" + "(+구위 소폭)" 괄호 표기가 암시하는 중간 등급을 겹치지 않는 3구간(20~26/26~30/30~35)으로 나눔 — 정확한 경계는 §8 "스탯 스케일 확정 후"라 placeholder.
- **히든스탯**(천재성·인성·성실함)은 §5 "학교·좌우투·타입과 무관"대로 전체 스케일(20~80)에서 독립적으로 균등 추출 — NPC 생성(`sim::roster`)과 마찬가지로 화면에 노출 안 함.
- **2구종 후보**: §6 표를 그대로 구현 — 강속구형·체력형·돌부처형은 투심·커터 2종 고정 제시, 제구형만 오프스피드·브레이킹볼 6종 중 3~4개를 랜덤 노출. **코치 가중은 스코프 아웃**: §6 "학교 코치 보너스가 후보 노출 확률에 반영"은 스태프 시스템 자체가 아직 없어(I3에서 이미 스코프 아웃된 항목) 균등 랜덤으로 단순화 — 스태프 Phase가 생기면 재연결.
- **너클볼 항상 제외**(§6, 특수구라 후보 밖) — 후보 풀 자체에 아예 안 넣어서 자동으로 보장.
- **시스템 경계 검증**: `school_team_id`·`archetype`·`second_pitch`는 전부 사용자가 직접 고르는 값이라(NPC 생성과 달리 content.db를 무조건 신뢰하지 않음) ①`school_team_id`가 실제 `league:hs` 소속인지 ②`second_pitch`가 그 타입의 후보 풀(전체)에 속하는지 검증 — 둘 다 실패하면 에러 반환.
- **결정성**: `league_sub_seed(world_seed, "protagonist")`로 시드 — 같은 world_seed·같은 선택이면 항상 같은 시작 스탯.

**protagonist 테이블과의 정합**: 스키마에 `age`·`team_id` 컬럼이 따로 없어(v1 DDL 그대로) `team_id`는 기존 테스트 픽스처가 이미 쓰던 관례대로 `contract` JSON(`{"team_id": ...}`)에 담고, `age`는 이번에 손 안 댐(주인공 나이 진행·성장 적용은 다음 서브분들의 몫). `live_state`에 NPC와 달리 `폼`(컨디션)까지 같이 담음 — protagonist 테이블엔 NPC의 `form` 같은 전용 컬럼이 없어서.

**구현**:
- `engine/src/sim/protagonist.rs`(신규): `ARCHETYPES` 상수, `generate_starting_stats`(밴드 로직, 순수함수), `second_pitch_candidates`(표시용 후보 목록), `is_valid_second_pitch`(전체 풀 기준 검증).
- `engine/src/data/repository.rs`: `create_protagonist(slot_conn, content_conn, world_seed, name, handedness, school_team_id, archetype, second_pitch)` 신규 — 검증 → `sim::protagonist`로 스탯·구종 생성 → `protagonist` 테이블에 INSERT.

**테스트**(`cargo test` 102개, 신규 12개): `sim/protagonist.rs` 8개(우세 스탯이 상단 밴드에 들어가는지·중간 가산 밴드·무관 스탯은 하단, 듀얼 우세 타입 둘 다 상승, 미확정 타입 거부, 히든스탯이 타입과 무관하게 나오는지, 결정성, 패스트볼형은 항상 정확히 2개 제시, 제구형은 3~4개, 너클볼 절대 미노출), `repository.rs` 4개(정상 생성 시 필드가 정확히 채워지는지, 2구종 생략 시 포심만인지, 대학 팀으로 시도하면 거부되는지, 타입에 안 맞는 2구종이면 거부되는지).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db의 실제 고교 team_id로 4개 타입 전부 생성 → 강속구형은 구속이 상단(33.7)·구위가 중간(26.2) 밴드에, 나머지는 하단에 들어감을 확인. 제구형+슬라이더 선택 시 `pitches`가 정확히 `["포심 패스트볼", "슬라이더"]`로 저장됨을 확인.

### 6-14. I6 2차분 착수 기록 (2026-07-15, 완료) — 1구 단위 볼카운트 시뮬 핵심 로직

**스코프**: [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) §5·§6 — "한 타석 = 여러 번의 1구 조작이 누적되는 진짜 야구 카운트 시뮬"의 판정 로직 그 자체. `startMatch`/`pitch` API·세션 상태 저장·PendingAction 연동은 **다음 서브분으로 명시적으로 이월**.

**스코프 판단(왜 이번엔 순수 로직만인가)**: §3의 자동·수동·반자동 3개 모드는 전부 **같은 1구 판정 로직을 공유**하고 "누가 구종·코스를 고르는가"만 다르다(자동=AI 항상, 수동=플레이어 항상, 반자동=평소엔 AI·위기상황만 플레이어) — 그래서 실제 게임 루프에 연결하기 전에 이 판정 로직 자체부터 순수 함수로 완성하는 게 순서상 맞다고 판단. API·세션 상태(현재 볼카운트·이닝·주자를 어디에 얼마나 저장할지, `PendingAction`을 몇 번 어떻게 발행할지)는 그 자체로 새로운 설계 결정이 여럿 필요해 분리.

**기존 PA레벨 엔진과의 관계**: `match_sim::simulate_plate_appearance`(1~6차분에 걸쳐 만들어지고 75개+ 테스트가 의존하는 배경 시뮬 전용 함수)는 **손대지 않고 그대로 둠** — 이상적으로는 배경 경기도 전부 1구 단위로 통일해야겠지만(§11 "모드·유형 무관 시뮬레이션 해상도는 동일"의 엄격한 해석), 지금 그걸 갈아엎는 건 스코프 초과. 대신 인플레이 이후 세분화 로직(§6, "안타 종류·아웃")만 `resolve_in_play_result`로 추출해 **PA레벨 엔진과 신규 1구레벨 엔진이 공유**하게 만들어 두 엔진의 결과 확률이 최소한 인플레이 지점에서는 갈라지지 않게 함.

**구현**:
- `engine/src/sim/match_.rs`: `resolve_in_play_result`(신규, 기존 `simulate_plate_appearance`의 "인플레이 이후" 블록을 그대로 추출 — 동작 불변, 순수 리팩터링) — 안타 종류 세분화(§6) 확률식 재사용.
- `engine/src/sim/pitch.rs`(신규):
  - `Course`(9종, 3×3 그리드) — §5 "코스 선택" 그대로. `is_inside`(몸쪽 열 여부)·`edge_level`(중앙~구석 0~1) 두 축만으로 판정에 반영.
  - `throw_pitch` — 1구 판정(볼/스트라이크/파울/사구/인플레이). 사구율은 제구↓·몸쪽 코스일수록↑(§5), 스트라이크존 통과는 구석일수록↓·제구 좋을수록↑, 존 밖 유인구에 안 속는 정도는 선구안이 흡수(§5 "타자의 구종 예측 별도 시스템 없음"), 존 안 컨택 난이도는 구위+코스 구석 정도 vs 컨택. **구종별 마스터리 차등은 스코프 아웃**(05_구종_시스템 §3 마스터리 추적 시스템이 아직 없음) — 구종 이름은 기록되지만 판정식에 가중치를 안 줌.
  - `apply_pitch_result`(카운트 누적 — §5 "3스트라이크=삼진, 4볼=볼넷, 사구=즉시 진루, 인플레이=타석 종료", 2스트라이크 후 파울은 스트라이크로 안 늘어남).
  - `choose_pitch_and_course`(§3 자동 모드 AI 휴리스틱 — 위기상황·강타자 상대일수록 구석 코스(유인구) 비중↑).
  - `is_high_leverage_situation`(§4 반자동 격상 트리거 — **"위기상황"만 구현**, "개인기록 근접"·"라이벌 매치업"은 각각 기록 추적·관계도 시스템이 있어야 판단 가능해 스코프 아웃, 다음 서브분 후보로 남김).
  - `simulate_at_bat_automatically`(위 5개 순수 함수를 조합해 "자동" 모드 한 타석을 끝까지 진행 — 반환 타입을 `match_sim::PaOutcome`으로 통일해 호출부가 배경 시뮬과 같은 결과 처리 로직을 재사용할 수 있게 함).

**테스트**(`cargo test` 111개, 신규 9개): 결정성, 몸쪽 코스가 사구율을 실제로 올리는지(제구 나쁜 투수로 검증), 카운트 누적이 3스트라이크/4볼/2스트라이크 후 파울 규칙을 정확히 지키는지, 사구·인플레이가 즉시 종료되는지, 위기상황 판정(만루·후반 접전), 자동 타석 시뮬이 항상 종료하고 합리적 구수(1~49구) 안에서 유효한 결과를 내는지, 결정성.

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db에서 뽑은 진짜 투수(제구 38·구위 20, 평균 이하)·타자 스탯으로 5,000타석 시뮬 → K% 13.4·BB% 9.5·HBP% 6.0·인플레이 71.0%·평균 3.18구/타석(제구 나쁜 투수라 볼넷·사구가 다소 높게 나오는 게 자연스러움). AI 휴리스틱 검증: 평상시 구석 코스(유인구) 비중 47%(940/2000) → 위기상황 62%(1241/2000)로 실제 상승 확인.

### 6-15. I6 3차분 착수 기록 (2026-07-15, 완료) — 매치 세션 배선, I6 전체 완료

**스코프**: 2차분에서 만든 `sim/pitch` 순수 판정 로직을 실제 게임 루프에 연결 — `startMatch`/`pitch` API, 세션 상태 저장, `PendingAction` 체이닝. [07_매치_엔진](../02_기획/육성코어/07_매치_엔진.md) §3의 자동·수동·반자동 3모드 전부.

**핵심 설계 결정**:
- **세션 상태 = 새 테이블(`match_session`, slot.db v4), 단일 행(id=1) 고정**. §12 "경기는 시작~종료가 하나의 단위... 경기 중 저장 불가"대로 이 테이블은 진행 중인 경기 하나만 담는 휘발성 상태 — `season_rollover` 등 시즌 경계 로직이 안 건드리고, 경기가 끝나면(`finalize_game`) 즉시 삭제된다.
- **모드 3개가 사실 하나의 메커니즘**: 자동·수동·반자동은 전부 같은 1구 판정을 공유하고 "이번 공을 플레이어에게 물어볼지"만 다르다(자동=항상 안 물음, 수동=항상 물음, 반자동=위기상황일 때만) — 그래서 `run_until_decision_point` 하나가 세 모드를 전부 처리하고, 모드별 분기는 `match session.mode` 값 하나로 단순화됨.
- **배경 하프이닝 vs 인터랙티브 하프이닝**: 주인공이 던지는 하프이닝(상대 팀 타석)만 1구 단위로 처리하고, 주인공 팀이 타석에 설 때(DH, §7 — 주인공은 절대 타석에 안 섬)는 기존 `match_sim::simulate_half_inning`을 통째로 재사용해 한 번에 끝냄 — 인터랙션이 필요 없는 구간까지 1구 단위로 쪼갤 이유가 없어서. `load_batting_lineup`이 애초에 `npc` 테이블만 조회하므로 주인공은 자동으로 자기 팀 타석에서 제외됨(별도 분기 불필요).
- **PendingAction 체이닝**: `resolve_choice`(그동안 제네릭 삭제만 하던 함수, I4에서 이미 "타입별 분기는 여기서"라고 예정해뒀던 자리)가 이제 `type` 컬럼으로 분기 — `'game'`(§3 "경기 시작 전 1회 선택"의 모드 값이 `choice_id`) → `start_protagonist_match`, `'pitch'`(§5, `choice_id`는 `"구종:코스"` 형식) → `submit_pitch`. 결과가 `AwaitingPitch`면 다음 1구를 위한 `'pitch'` PendingAction을 자동으로 새로 만들어 체인을 이음 — 호출부는 `advance()`가 원래 하던 "정지→응답→재개" 패턴을 그대로 반복하기만 하면 됨.
- **끝내기·연장전 규칙**은 `match_sim::simulate_game`의 이닝 루프 조건(§10-2, 아마추어=승부치기 무제한, 프로 정규시즌=12회 제한 무승부)을 `transition_half_inning`에 그대로 재현. **콜드게임(§10-2 5회15점/7회10점) 조기종료는 이번 인터랙티브 경로에서 스코프 아웃** — 배경 경기(`simulate_game`)에만 남아있음, 다음 서브분 후보.
- **주인공은 항상 선발 완투로 가정**(다른 배경 경기들과 동일한 placeholder) — 구원 등판·투수 교체는 감독 AI가 생기는 후속 Phase 스코프.
- **주인공 성장·부상·피로도는 이번에도 안 건드림**: 상대 타자(NPC)의 급성 부상은 이번에도 판정·기록하지만(`check_acute_injury`+`apply_injury_events` 재사용), 주인공(투수) 쪽은 `apply_injury`/`treat`가 여전히 `todo!()`라 스코프 밖 — `npc` 테이블 전용인 `process_week`도 주인공을 안 건드리므로 일관됨.

**구현**:
- `engine/src/data/match_session.rs`(신규): `MatchStepResult`(`AwaitingPitch`|`GameOver`), `start_protagonist_match`·`submit_pitch`(공개 API), `run_until_decision_point`(공유 드라이버 루프), `transition_half_inning`·`finalize_game`·`apply_pa_outcome`(내부 헬퍼).
- `engine/src/sim/pitch.rs`: `Course::parse`(문자열→코스, PendingAction 응답 파싱용) 추가.
- `engine/src/sim/match_.rs`: `simulate_half_inning`·`advance_runners`·`is_amateur`를 `pub(crate)`로 승격(매치 세션이 재사용), `BatterStats`에 `Clone` 추가(세션 재개 시 라인업에서 현재 타자를 다시 찾아야 해서).
- `engine/src/data/repository.rs`: `load_batting_lineup`·`load_starting_pitcher`·`update_standings`·`league_sub_seed`·`apply_injury_events`·`accumulate_game_fatigue`를 `pub(crate)`로 승격(match_session이 재사용). `resolve_choice` 시그니처 변경(`content_conn`·`world_seed` 추가, 반환 타입 `Option<MatchStepResult>`) — 타입별 분기 추가.
- `engine/src/data/slot.rs`: v4 마이그레이션 — `match_session` 테이블(단일행, `id=1 CHECK` 제약).

**테스트**(`cargo test` 117개, 신규 6개): `data/match_session.rs` 4개(자동 모드가 경기를 끝까지 완주하고 `schedule.result`·`standings`가 갱신되는지, 수동 모드가 주인공의 첫 공부터 멈추는지, 계속 응답하면 실제로 끝나는지, 결정성), `repository.rs` 2개(기존 `advance_stops_at_protagonist_game_day...` 테스트를 실제 로스터·주인공 픽스처로 갱신해 `resolve_choice`의 `'game'` 분기가 실제로 매치를 완주시키는지, `resolve_choice`가 `'pitch'` PendingAction을 계속 체이닝해 수동 경기를 끝까지 진행시키는지 신규).

**수동 검증**(임시 바이너리 2개, 커밋 안 함): 실제 시드된 content.db로 `generate_initial_world` → `create_protagonist`(실제 고교 team_id) → `advance()` → 정확히 day 1에 `'game'` PendingAction 하나로 멈춤 → **자동 모드**로 `resolve_choice` 한 번 호출 → 경기가 그 한 번에 완주(home=6 away=0)되고 `schedule.result` 기록·`match_session` 삭제·`advance()` 재호출 시 시즌이 정상적으로 계속됨을 확인. **수동 모드**로는 매 공 `AwaitingPitch`(카운트 0-0→0-1 등 정상 누적, `high_leverage` 정상 판정)로 멈추고 103구 만에 경기가 끝남(home=0 away=2)을 확인.

**I6 전체 완료 선언**: Phase 표의 완료 기준 "캐릭터 생성 후 첫 경기를 실제로 뛸 수 있음(반자동 모드 최소)"을 자동·수동 두 모드 다 실제로 동작시켜 확인했고(반자동은 둘의 조합이라 별도 검증 없이도 동일 메커니즘으로 보장됨), `sim/market`(§6-11에서 이미 I6로 재배치했던 항목)·부상 치료 선택 등은 여전히 미착수지만 이번 3개 서브분(이후 4·5차분도 같은 맥락에서 계속 이월분을 줄여감)으로 Phase 표의 핵심 완료 기준 자체는 달성했다고 판단해 I6를 완료 처리한다.

### 6-16. I6 4차분 착수 기록 (2026-07-15, 완료) — sim/eval 경기단위 평가

**스코프**: §6-11에서 I6로 재배치해뒀던 `sim/eval` 중 **경기 단위**(§5-1) S~D 평가만. 마침 3차분에서 만든 매치 세션의 `finalize_game`이 §5-4 "역할별 계산 트리거"의 정확한 지점(선발 완투 placeholder라 "강판 시점"=경기 종료 시점)이라 바로 연결할 수 있어 자연스러운 다음 단계로 판단.

**스코프 판단**: [09_평가_시스템](../02_기획/육성코어/09_평가_시스템.md) §2 "기대치 4요소" 중 실제로 반영 가능한 건 **상대 타선 수준**(이미 `load_batting_lineup`으로 조회 가능)과 **본인 평소 실력**(가벼운 가중치, 이미 주인공 스탯 조회 가능)뿐 — **등판 상황(역할)**은 이번 스코프가 항상 "선발 완투"라 상수라 반영할 게 없고, **경기 중요도**는 포스트시즌이 아직 주인공 플로우에 연결 안 돼(축1 유형A는 지금 정규시즌 `schedule`에서만 옴) 상수(평범) 취급. §4 "등급의 효과" 4가지 중 **감독 신뢰도**는 스태프 시스템 자체가 없어(I3에서 이미 스코프 아웃) 반영 안 함 — 사기·주목도·`game_log` 기록 3가지만. §5-1의 **월/시즌 단위** 종합 평가, §4-1 **명성**(파생값) 산출, §5-3 "미달(부상강판 등)" 케이스(중도 강판 자체가 없어 발생 안 함)는 전부 스코프 아웃.

**구현**:
- `engine/src/sim/eval.rs`(신규): `expected_runs`(상대 타선 평균 + 본인 실력 가벼운 가중치로 기대 실점 산출) → `grade_outing`(실점/기대실점 비율로 S~F 6단계 판정, §1 "상대평가"). `morale_delta`·`attention_gain`(등급→사기·주목도 증감폭, 둘 다 단조— 좋은 등급일수록 사기는 더 오르고 주목도도 더 오름. 다만 주목도는 나쁜 등급이어도 항상 소폭 플러스: §4-1 "화제성은 실력과 별개"라는 명성 구분과 결을 맞춰, 못 던져도 "그 경기에 나갔다"는 노출 자체는 남는다는 취지).
- `engine/src/data/match_session.rs`: `finalize_game`에 `protagonist_team_id` 파라미터 추가, `apply_protagonist_evaluation` 신규 — 상대 라인업 평균 스탯·주인공 제구+구위 평균으로 등급 산출 → `protagonist.live_state`의 사기·주목도 갱신(두 필드 다 이번에 처음 채워짐 — 그동안 `live_state`엔 피로도·폼만 있었음) → `game_log`에 `{game_id, season, detail:{grade, runs_allowed, opponent}}` 기록.

**테스트**(`cargo test` 123개, 신규 6개): `sim/eval.rs` 5개(완봉이 상위 등급, 기대 대비 대량 실점이 F, 강타선 상대는 같은 실점이라도 더 후하게 평가됨, 실점이 많아질수록 등급이 단조 하락, 사기·주목도 증감폭이 등급 순서와 어긋나지 않고 F여도 주목도는 항상 양수), `match_session.rs` 1개(자동 모드로 경기 완주 후 `live_state.사기`가 실제로 변하고 `주목도`가 양수로 채워지며 `game_log`에 유효한 등급이 기록되는지).

**수동 검증**(임시 바이너리, 커밋 안 함): 실제 시드된 content.db로 갓 생성된 주인공(무명 신인이라 스탯이 낮은 밴드에서 시작)이 3연속 실전에서 4·2·4실점(등급 F·D·F) → 사기가 35→27→12로 하락, 주목도는 나쁜 경기여도 0.2→0.7→0.9로 계속 소폭 누적됨을 확인 — 설계 의도(사기는 성적에 정직하게 반응, 주목도는 실력과 별개로 "나갔다"는 사실만으로도 조금씩 쌓임)와 정확히 일치.

### 6-17. I6 5차분 착수 기록 (2026-07-15, 완료) — sim/training 훈련 슬롯

**스코프**: I6 계속 이월분 중 [06_훈련_시스템](../02_기획/육성코어/06_훈련_시스템.md)이 정의하는 주인공 훈련 슬롯(§2 능력치 주슬롯1+보조슬롯2, §4 강도 다이얼, §3 신규 구종 습득). `sim/eval`(4차분)로 경기 결과가 사기·주목도에 반영되는 루프가 생긴 김에, 그 다음으로 자연스러운 "성장 입력" 축인 훈련을 이어서 구현.

**스코프 판단**: §4의 강도 다이얼은 문서상 스탯/구종 각각 따로 지정 가능하지만, v1은 **단일 통합 강도 다이얼**로 단순화(스탯·구종을 분리할 실익이 아직 불명확하고, 분리하면 UI·검증 로직이 배로 늘어남). §6 "주슬롯 vs 보조슬롯의 정확한 효율 차이"·"신규 구종 습득 소요 기간"은 문서 자체가 미확정이라 placeholder 수치 채택(주슬롯 3배·보조슬롯 1.5배·비선택 0.3배, 습득 기간 강8/보통12/약16주) — 정확한 밸런스 수치는 후속 밸런스 패스 대상. "기존 구종 다듬기"(마스터리 단계 올리기)는 05_구종_시스템의 마스터리 시스템 자체가 엔진에 없어 이번 스코프에서 기계적 효과 없음(선택은 가능하되 능력치 슬롯 -15% 페널티 없이 지나감). 코치·개인 트레이너 등 보정치는 스태프 시스템이 없어(I3에서 이미 스코프 아웃) 반영 안 함.

**구현**:
- `engine/src/sim/growth.rs`: 기존 `apply_weekly_growth`를 스탯별 XP 배율 클로저를 받는 `apply_weekly_growth_with_focus`로 리팩터링(NPC 배경 성장은 배율 1.0 고정 래퍼로 동작 동일 유지) — 훈련 슬롯이 같은 임계값/캡 수식을 재사용.
- `engine/src/sim/training.rs`(신규): `TrainingConfig`(주슬롯/보조슬롯 2/강도/신규구종), `apply_weekly_training`(슬롯별 배율 + 신규구종 페널티 -15%를 `apply_weekly_growth_with_focus`에 적용), `weeks_required_to_learn_pitch`(강도별 습득 소요 주), `effective_intensity`(등판 예정 주엔 "강"→"보통" 자동 하향, §4-1).
- `engine/src/data/slot.rs`: v5 마이그레이션 — `protagonist` 테이블에 `training TEXT` 컬럼 추가(JSON: `{primary_stat, secondary_stats, intensity, new_pitch, pitch_weeks}`, NULL=미설정).
- `engine/src/data/repository.rs`: `set_protagonist_training`(입력 검증 + JSON 작성, 같은 신규구종 재선택 시에만 `pitch_weeks` 보존·구종 변경 시 리셋) · `process_protagonist_week`(신규, `advance()`의 주간 경계에서 `process_week`와 나란히 호출 — 훈련 미설정이면 조용히 스킵, 설정돼 있으면 `schedule`로 등판 예정 주 판정→유효 강도 계산→`apply_weekly_training` 적용→신규구종 임계값 도달 시 `pitches`에 실제 추가하고 훈련 설정 리셋→강도별 피로도 증감(강+8/약-10) 반영).
- **버그 수정**: `set_protagonist_training`의 기존 `training` 조회가 `.query_row(...).optional()?`를 `Option<String>`으로 바로 받아 "행은 있는데 컬럼이 NULL"인 케이스(주인공 생성 직후, 훈련 첫 설정 전)에서 `Invalid column type Null` 패닉 — 이번 세션에서 세 번째로 반복된 동일 패턴. `r.get::<_, Option<String>>(0)` 후 `.optional()?.flatten()`으로 수정.

**테스트**(`cargo test --lib` 137개, 신규 14개): `training.rs` 7개(주슬롯이 비선택 스탯보다 빨리 성장, 보조슬롯이 비선택보다 빠르고 주슬롯보다 느림, 강도가 강할수록 주슬롯 성장 빠름, 신규 구종 습득 중엔 스탯 성장이 느려짐, 하드캡을 절대 안 넘음, 등판 예정 주엔 강→보통 자동 하향, 습득 소요 주가 강도 순으로 감소), `slot.rs` 1개(v5가 `protagonist.training` 컬럼을 추가하는지), `repository.rs` 6개(알 수 없는 스탯 거부, 이미 아는 구종을 신규로 지정 시 거부, 훈련 미설정이면 주간 처리가 아무 일도 안 함, 주슬롯이 여러 주에 걸쳐 실제로 자라는지, 충분한 주가 지나면 신규 구종이 실제로 습득되는지, 등판 예정 주엔 강도가 보통으로 캡되는지).

**수동 검증**(임시 바이너리 `src/bin/verify_i6_5.rs`, 커밋 안 함): 실제 시드된 content.db로 주인공을 생성해 주슬롯=제구·보조슬롯=[경기운영,구위]·강도=강·신규구종=슬라이더로 설정 후, `advance()`+`resolve_choice(..., "자동")` 루프로 한 시즌 내내 훈련을 돌린 결과 — 제구(주슬롯) +9.0, 경기운영·구위(보조슬롯) +7.0/+12.0, 비선택 스탯은 +2~3에 그침(슬롯별 배율 차이가 실제로 반영됨 확인). 슬라이더는 강도 "강"(8주 임계값) 도달 시점에 정확히 습득되어 `pitches`에 추가됐고, 이후 `training.new_pitch`/`pitch_weeks`가 `null`/`0`으로 정상 리셋됨을 확인.

### 6-18. I6 6차분 착수 기록 (2026-07-16, 완료) — 부상 치료 선택

**스코프**: I6 계속 이월분 중 [08_부상_시스템](../02_기획/육성코어/08_부상_시스템.md) §4 "치료·회복 3가지 옵션(수술/재활/무리한 복귀)"을 주인공에게 실제로 연결. 스텁으로만 있던 `apply_injury`/`treat`(둘 다 `todo!()`)를 채우고, 04_게임루프.md §3의 7종 PendingAction 중 유일하게 미구현이던 `injuryTreatment`를 배선한다.

**스코프 판단**: NPC용 `record_injury`/`apply_injury_events`(I5 5·6차분)는 항상 "치료=재활"로 자동 확정되는데, 그 주석이 이미 "무리한 복귀·수술 선택은 실제 의사결정 주체가 필요해 I6 이후 스코프"라고 못박아뒀던 지점이 이번 스코프다. 리서치 중 발견한 인접 갭 두 개도 이번에 같이 메웠다(부상 치료가 실제로 의미를 가지려면 필요한 전제였음): ①`process_protagonist_week`(I6 5차분)가 훈련 XP만 다루고 §3 "누적형 체크 시점=매주"에 해당하는 과사용 부상 체크를 아예 안 하고 있었음 — 주인공에게 부상이 생길 경로 자체가 없었던 것. ②`match_session.rs`의 배경 하프이닝·타자 부상 기록이 실제 `day` 대신 항상 `0`을 넘기고 있어(주인공 매치는 캘린더가 있는데도), 이번에 추가하는 "복귀일이 지나면 완치 처리" 로직과 맞물리면 즉시 오작동했을 것 — 두 호출부만 실제 `today`로 교체(포스트시즌 다전제의 `day=0`은 "캘린더 없는 동기 시뮬"이라는 별도 확정된 단순화라 그대로 둠). "재발위험" 수치화는 §6이 "정확한 수치는 스탯 스케일 확정 후"라 미정이라, 장기 확률 배율 대신 **치료 선택 시점의 단일 즉시-악화 판정**(수술=성공률<100%, 무리한 복귀=즉시 악화 확률)으로 단순화 — 기존 함수 시그니처(`check_overuse_injury`/`check_acute_injury`)를 안 건드리고 `treat()` 안에서 자기완결적으로 처리된다. "즉시 강판"(부상 시 바로 교체)은 구원투수 로테이션이 없어(선발 완투 placeholder, 07_매치_엔진 문서가 이미 확정한 단순화) 반영 안 함 — 부상은 기록되지만 그 경기는 완투로 이어짐(배경 경기의 급성 부상도 원래부터 동일).

**구현**:
- `engine/src/sim/injury.rs`: `TREATMENTS`(수술/재활/무리한 복귀), `treated_recovery_days`(치료법별 배율 — 수술×1.8·재활×1.0(기준)·무리한 복귀×0.3), `surgery_succeeds`(심각도별 성공률 95/85/70%), `rushed_return_aggravates`(심각도별 즉시 악화 확률 30/45/60%).
- `engine/src/data/repository.rs`: `clear_healed_injury`(공용 — `return_day` 도달 시 `current`를 `null`로, `history`는 유지 — NPC `process_week`·주인공 `process_protagonist_week` 둘 다 재사용) · `apply_injury`(신규 — 이전 스텁 대체, 부상 기록 + `치료:null`로 남겨 `injuryTreatment` PendingAction 생성, 이미 미해결 부상이 있으면 스킵해 이중부상·중복 PendingAction 방지) · `treat`(신규 — 이전 스텁 대체, `resolve_choice`의 `injuryTreatment` 분기가 호출, 수술/무리한 복귀는 즉시 악화 판정 후 `treated_recovery_days`로 `return_day` 재계산). `process_protagonist_week`에 `content_conn` 파라미터 추가(팀 철학 조회용) + 부상 완치 처리·과사용 부상 체크를 훈련 설정 여부와 무관하게 항상 실행하도록 재배치. `resolve_choice`에 `"injuryTreatment"` 분기 추가.
- `engine/src/data/match_session.rs`: `run_until_decision_point`가 `today`를 한 번 조회해 배경 하프이닝·배터 부상 기록의 `day=0` placeholder를 실제 날짜로 교체 + 주인공(투수) 본인의 급성형 부상 체크 신규 추가(`check_acute_injury(pitcher.fatigue)` → `apply_injury`).

**테스트**(`cargo test --lib` 152개, 신규 15개): `injury.rs` 4개(치료법별 이탈기간 대소관계·재활이 기준 `recovery_days`와 일치, 수술 성공률이 심각도에 따라 감소, 무리한 복귀 악화 확률이 심각도에 따라 증가하고 결정적). `repository.rs` 9개(부상 발생 시 PendingAction 생성+치료 미정, 이중부상 스킵, 알 수 없는 치료법 거부, 활성 부상 없이 치료 시도 시 에러, 재활은 심각도 불변+기준 회복기간, 수술은 경미 유지 또는 중등 악화만 가능, 무리한 복귀 평균 회복기간이 재활보다 짧음, `resolve_choice`의 injuryTreatment 분기 동작, `process_protagonist_week`의 완치 처리·과사용 부상 트리거). `match_session.rs` 1개(주인공 투수 본인이 자기 등판 중 급성 부상을 입을 수 있는지, 150 시드 시행).

**수동 검증**(임시 바이너리 `src/bin/verify_i6_6.rs`, 커밋 안 함): 실제 시드된 content.db로 `apply_injury`→`injuryTreatment` PendingAction 생성 확인, 이중부상 시도가 무시됨을 확인, 세 치료법을 각각 새 주인공에 적용해 비교 — 수술(중등 유지) return_day=50(=28×1.8), 재활 return_day=28(기준 그대로), 무리한 복귀는 실제로 중상까지 악화됐음에도 return_day=27(=90×0.3)로 재활보다 짧게 유지돼 "이탈기간은 최소, 재발위험은 매우 높음"이라는 §4 트레이드오프가 수치로 정확히 재현됨을 확인.

### 6-19. I6 7차분 착수 기록 (2026-07-16, 완료) — sim/market 방출·재계약·FA

**스코프**: [06_시장_계약](../02_기획/06_시장_계약.md) §1(방출)·§2(재계약)·§3(FA) — `contractNego` PendingAction으로 통합 배선. 트레이드(§4)는 완전히 다른 흐름(수락/거절 통보, `tradeDecision`)이라 별도 서브분으로 미루고, 계약조항(§5 옵션·인센티브)은 협상 결과에 필드로 끼워넣을 독립 UI가 없어 이번 스코프에서 반영 안 함.

**착수 전 발견한 전제 문제**: 리서치 중 `create_protagonist`가 `league:hs`(고교) 소속만 허용하도록 하드코딩돼 있고(`repository.rs`), 고교→대학/독립/프로로 넘어가는 진로 갈림길(01_커리어_구조.md §5)이 엔진에 전혀 없다는 걸 확인했다 — 06_시장_계약.md §1 "적용 범위: 프로·독립 전용"과 충돌해, 실제 플레이 경로로는 이 로직이 아직 발동될 수 없다. 사용자와 상의해 **"진로 갈림길 없이 market 로직만 먼저 구현하고, 실제 진입 경로(드래프트 등)는 별도 후속 서브분으로 미룬다"**로 방향을 확정 — 이번 세션 다른 시스템들(sim/eval·sim/training 등)도 전부 이렇게 "엔진 로직 먼저, 실제 진입 경로 배선은 나중"이었던 것과 같은 패턴. 테스트·수동검증은 합성/직접 SQL로 프로·독립 소속 주인공을 만들어 검증한다.

**스코프 판단**: §1 "종합지표"(평가등급누적+노쇠곡선+연봉대비성과+구단주인내심) 4요소 중 **노쇠곡선은 스킵**(주인공 나이 자체가 아직 트래킹 안 됨 — 진로 갈림길과 함께 후속 스코프), **구단주 인내심은 전담 스태프 엔티티가 없어**(02_스태프_능력치 §3, I3에서 이미 스코프아웃) `team_traits`의 **②자원**(부유/안정/알뜰/궁핍)으로 대체. "경고"(§1-1, 7월말 트레이드데드라인) 단계는 캘린더에 그 지점이 없어 생략 — 시즌종료 시점의 최종판정만 구현. §2-1 "역제안 시 구단 재제안 → 반복(라운드 상한 있음)"은 **라운드 상한 1회**로 단순화(§7 "정확한 라운드 상한은 미정") — 역제안하면 그 자리에서 바로 수락/거절이 확정되고, 거절되면 결렬(§2-1 "결렬 시 FA")로 처리한다. FA 등급제(§3-2, 보상선수/보상금)는 원소속팀에 대한 배경 보상이라 주인공 1인칭 시점에서 안 보여 생략(§7 "정확한 등급 경계·보상 규모는 스탯 스케일 확정 후").

**구현**:
- `engine/src/sim/market.rs`(신규): `grade_score`(등급→점수), `release_probability`/`is_released`(방출 위험, 성과·연봉·자원 종합), `initial_offer`(구단 초기 제안액, 성과·주목도·자원 반영), `offer_years`(1~3년 placeholder), `counter_offer_accepted`(역제안 수락 확률, 격차·자원 반영), `fa_offer_count`(2~4개).
- `engine/src/data/repository.rs`: `season_avg_grade_score`(이번 시즌 `game_log` 등급 평균, 기록 없으면 C 취급) · `build_fa_offers`(프로·독립 소속 팀 중 랜덤 추첨해 팀별 오퍼 생성) · `push_contract_nego`(PendingAction 생성) · `process_protagonist_contract`(신규, `season_rollover`에서 호출 — 아마추어/프로진입이력없음 스킵, 방출 판정→FA 오퍼, 계약만료→재계약 오퍼, 이미 FA 상태면 매 시즌 오퍼 재생성, 그 외엔 `years_remaining`만 감소) · `resolve_contract_nego`(`resolve_choice`의 `contractNego` 분기가 호출 — `accept:team_id`/`counter:team_id:금액`/`reject`) · `mark_contract_unsigned`(협상 결렬 시 공용 처리 — 재계약이었든 FA였든 `team_id: null, status: "FA"`로 통일).
- **버그 수정**(구현 중 자체 발견): `resolve_contract_nego`의 `"counter:team_id:금액"` 파싱이 `team_id` 자체에 콜론이 포함된다는 걸 놓쳐(`"team:rich_a"`) 첫 콜론 기준으로 잘못 분리되던 문제 — 금액 분리는 `rsplit_once`(마지막 콜론 기준)로 수정. **설계 결함 수정**(수동 검증 중 발견): 재계약 역제안이 거절됐을 때 원래는 옛 계약이 `years_remaining: 0`인 채로 그대로 남아있었음(§2-1 "결렬 시 FA"에 위배) — `mark_contract_unsigned`를 만들어 재계약/FA 두 경로의 거절·결렬을 전부 `team_id: null, status: "FA"`로 통일.

**테스트**(`cargo test --lib` 171개, 신규 19개): `market.rs` 8개(방출 위험이 성과·연봉·자원에 따라 오르내리는지, 초기 제안액이 자원·성과에 비례하는지, 역제안 수락 규칙, FA 오퍼 개수·계약 기간이 문서 범위 안인지). `repository.rs` 11개(아마추어 계약 스킵, 궁핍한 팀의 부진한 고액 선수가 실제로 방출되는지, 계약만료 시 재계약 오퍼가 뜨는지, 방출·만료 둘 다 아니면 `years_remaining`만 주는지, FA 상태 유지 중엔 매 시즌 오퍼가 재생성되는지, `accept`/`reject`/`counter`(수락·거절 양쪽) 응답이 계약에 정확히 반영되는지, 재계약 거절이 FA로 전환되는지, `season_rollover`가 실제로 이 전체 흐름을 배선하는지).

**수동 검증**(임시 바이너리 `src/bin/verify_i6_7.rs`, 커밋 안 함): 실제 시드된 content.db(서울 로열스=부유)로 두 시나리오 확인 — ①고액 연봉(2만)+5경기 연속 F등급 선수가 시즌종료 시 방출→FA 오퍼 2개 생성→그중 하나 수락 시 새 팀·연봉으로 계약 체결. ②저연봉(5천)+5경기 연속 A등급 선수가 계약만료(`years_remaining=0`) 시 재계약 오퍼(연봉 8531, 성과 반영 상승) 생성→터무니없이 높은 역제안(5만)을 걸었더니 거절되며 `team_id: null, status: "FA"`로 정확히 전환됨을 확인(위 "설계 결함 수정"을 이 과정에서 실제로 발견·수정).

### 6-20. I6 8차분 착수 기록 (2026-07-16, 완료) — sim/market 트레이드, sim/market 전체 완료

**스코프**: [06_시장_계약](../02_기획/06_시장_계약.md) §4-1(선수대선수 트레이드)·§4-2(현금 트레이드)·§4-3(노트레이드 조항) — `tradeDecision` PendingAction. 이걸로 §6-19에서 미뤄둔 마지막 조각이 채워져 `sim/market` §1~§4가 전부 끝난다(§5 계약조항은 여전히 의도적으로 제외 — 아래 참고).

**스코프 판단**: §4-2 "현금 트레이드 발생 조건: 팀특성 ②자원=궁핍 + 주인공이 말년(노쇠기)"의 "노쇠기" 절반은 §6-19와 동일한 이유(주인공 나이 트래킹 없음)로 반영 못 함 — 연봉 부담만으로 근사. §4-1 "선수대선수"의 **교환 상대 NPC는 실제 로스터를 이동시키지 않는다** — 문서가 정확한 가치매칭 규칙을 안 정의했고, 주인공 1인칭 시점에선 "누구와 트레이드됐다"는 결과 텍스트만 중요해 실존하는 NPC 1명을 무작위로 골라 `counterpart` 필드로만 통보한다(로스터 크기·밸런스를 지키는 실제 교환 로직까지 만들면 스코프 폭발). "연 2회(트레이드 데드라인+오프시즌)" 캐던스는 캘린더에 그 지점이 없어 §6-19와 같은 이유로 **시즌 1회** 판정으로 단순화. §4-3 노트레이드 조항은 필드(`contract.no_trade_clause`)와 소비 로직(트레이드 거부 가능 여부)만 갖췄다 — **그 조항을 요청하는 협상 인터랙션 자체는 없음**(§2 계약 오퍼에 옵션이 없어 §6-19의 §5 계약조항 제외 결정과 같은 맥락) — 실제로 채워 넣는 건 테스트·수동설정 전용이며, 후속으로 "베테랑·다년계약자만 요구 가능"(§4-3)한 협상 단계 UI가 생기면 자연스럽게 연결될 자리만 마련해뒀다.

**구현**:
- `engine/src/sim/market.rs`: `trade_probability`(자원 축 기반 일반 트레이드 확률), `cash_trade_probability`(궁핍+고연봉일 때만 발생, §4-2).
- `engine/src/data/repository.rs`: `process_protagonist_trade`(신규, `season_rollover`가 `process_protagonist_contract` 직후 호출 — 이미 `contractNego`가 떠 있으면 스킵해 같은 시즌에 계약협상 중인 선수를 또 건드리지 않게 방어, 무소속·아마추어 스킵, 목적지 팀 랜덤 추첨, 현금/선수 트레이드 분기, 교환상대 NPC 랜덤 선정) · `resolve_trade_decision`(`resolve_choice`의 `tradeDecision` 분기가 호출 — `accept`는 계약 이관(연봉·잔여연수 그대로 승계)+`league_transactions`에 `'trade'` 기록, `reject`는 `can_reject`(노트레이드 조항 여부)가 `false`면 에러).

**테스트**(`cargo test --lib` 182개, 신규 20개: `market.rs` 3 + `repository.rs` 9 등 — 12개는 위 트레이드 관련, 나머지는 §6-19 잔여 정리분): 계약협상 중이면 트레이드 스킵, 무소속·아마추어 스킵, 궁핍한 팀 선수가 실제로 트레이드(선수/현금)되고 선수 트레이드엔 실존 NPC `counterpart`가 붙는지, `no_trade_clause` 설정 시 `can_reject`가 정확히 반영되는지, `accept`가 계약을 이관하고 `league_transactions`를 기록하는지, 노트레이드 조항 없이 `reject`하면 에러, 있으면 원 소속 유지, `season_rollover`가 실제로 이 흐름을 배선하는지.

**수동 검증**(임시 바이너리 `src/bin/verify_i6_8.rs`, 커밋 안 함): 실제 시드된 content.db에서 프로·독립 통틀어 궁핍 팀은 딱 하나(원주 위너스, [04_독립](../02_기획/리그팀/04_독립.md) 문서와 일치하는 "근성/언더독×궁핍×언더독" 프로필) — 그 팀 소속(연봉 1.5만) 주인공으로 여러 시드를 시도해 실제로 선수대선수 트레이드가 발생, 목적지 팀(대구 호크스)의 **실존하는 NPC**가 `counterpart`로 붙었고, 수락 시 연봉이 그대로 유지된 채 계약이 이관되며 `league_transactions`에 기록됨을 확인.

### 6-21. I7 1차분 착수 기록 (2026-07-16, 완료) — 엔진 api 레이어 + 뉴게임/진행/매치 최소 화면

**스코프**: I7(Flutter UI) 완료 기준 "뉴게임→진행→경기→시즌종료가 실제 화면에서 끝까지 동작"만 만족하는 최소 슬라이스. `04_UI기획/` 9개 화면 전부·`03_구조.md` §5 전체 API 표면이 아니라, 그중 딱 이 루프를 도달시키는 데 필요한 조각만.

**착수 전 확인**: `app/`(Flutter 프로젝트)·`engine/src/api/`(frb 진입점)·`flutter_rust_bridge.yaml`(rust_root=`../engine/`)가 이미 스캐폴딩돼 있었으나 전부 `flutter_rust_bridge_codegen create`의 `greet("Tom")` 데모 그대로였음(`api/simple.rs`, `main.dart`가 그 데모만 호출) — Riverpod·go_router도 미설치, 실제 게임 로직과 연결된 코드는 0줄. 즉 "I7 미착수" 상태였다는 걸 코드로 확인 후 착수.

**스코프 판단**:
- **세션 모델 = 전역 싱글톤**(`Mutex<Option<GameState>>`) — 여러 세이브 슬롯 동시 관리(`createSlot`/`loadSlot` 등, 02_데이터.md §4)는 스코프 밖. 앱 프로세스 안에 게임 세션이 하나뿐이라고 가정 — 여러 슬롯이 실제로 필요해지면 frb opaque 핸들로 승격.
- **세이브 파일 영속성도 스코프 밖** — `new_game`이 인메모리 slot 연결만 만든다. "뉴게임→진행→경기→시즌종료"가 한 세션 안에서 끝까지 도달 가능한지만 증명하면 되고, 앱 재시작 후 이어하기는 별도 관심사.
- **JSON 원시 통과** — `stats`·`contract`·`injury`·`live_state`·`pitches`는 아직 전용 frb 구조체로 안 쪼갬(상태별로 필드가 다름 — 예: `contract`는 아마추어/프로/FA마다 키가 다름). Dart가 `dart:convert`로 표시용으로만 읽는다 — 계산·판정은 여전히 엔진이 끝낸 값이라 "UI에 로직 0" 불변식은 유지.
- **캐릭터 생성 폼 단순화** — 06_캐릭터생성.md 7단계 중 지역별 학교 브라우징(§3-1~3-2, 그 문서 자체가 "열린 세부 — 아트 단계"로 이미 이월)·2구종 선택(§6)은 생략, 이름·좌우·타입·학교(평평한 드롭다운)만으로 압축.
- **4허브·전용화면(협상/트레이드/진로/드래프트/치료/은퇴)** — `game`·`pitch` 외 PendingAction 종류는 원시 payload + 자유입력 choice_id 폴백(개발자용)으로만 처리, 전용 UI는 후속.
- **매치 비주얼** — 05_매치.md의 다이아몬드·3×3 존그리드는 CustomPainter로 예정돼 있으나, 이번 스코프는 버튼 그리드로 대체(완료 기준엔 "실제 동작"이지 "비주얼 완성"이 아님).

**구현**:
- `engine/src/api/game.rs`(신규): `new_game`(결정적 seed로 배경 세계 생성 후 주인공 생성, 전역 세션 등록) · `advance`(`repository::advance` 그대로 노출) · `resolve_choice`(`repository::resolve_choice` 노출, `MatchStepInfo`로 변환) · `get_protagonist_status`/`get_pending_actions`/`get_meta_status`(조회) · `list_hs_teams`(캐릭터 생성용 고교팀+팀특성 목록) · `course_names`(3×3 코스 그리드용, 순수계산이라 동기). `advance`/`new_game` 등 I/O 있는 함수는 비동기(백그라운드 시즌 시뮬이 UI 스레드를 막지 않게 — 03_구조.md §6 "async가 frb 호출을 감쌈"과 일치), `course_names`만 동기 유지.
- `app/pubspec.yaml`: `flutter_riverpod`·`go_router`·`path_provider`·(frb enum 브리징에 필요한) `freezed`/`freezed_annotation`/`build_runner` 추가.
- `app/assets/content.db`(신규, engine/content.db 복사본) + `lib/shared/content_db.dart`(에셋→앱 데이터 폴더 실 파일 경로로 1회 복사 — SQLite는 실제 파일 경로가 필요, 02_데이터.md §3 "번들: Flutter 앱 에셋"과 정합).
- `app/lib/features/game/`(`game_state.dart`·`game_provider.dart`·`game_screen.dart`): Riverpod `Notifier` 컨트롤러가 엔진 결과의 얇은 캐시만 들고, 진행/매치/PendingAction 응답을 전부 위임.
- `app/lib/features/new_game/new_game_screen.dart`: 이름·좌우·타입·학교 폼 → `newGame` 호출.
- `app/lib/shared/router.dart` + `main.dart`: go_router 2라우트(`/`·`/game`), `RustLib.init()` 후 `ProviderScope` 부팅.
- 스캐폴딩 잔재 정리: `test/widget_test.dart`·`integration_test/simple_test.dart`가 옛 `greet` 데모·`MyApp`을 참조하던 걸 새 진입점(`OnePitchApp`)·새 화면 제목 검증으로 교체.

**테스트**:
- `cargo test --lib` 186개 전부 통과(신규 4개: `api::game` — 활성 게임 없을 때 전 커맨드가 명확히 에러, `new_game`+`get_protagonist_status` 왕복, `list_hs_teams`가 실제 content.db에서 팀+특성을 반환, `course_names`가 문서화된 9개 그대로). `cargo clippy --lib --tests` 클린(기존 무관 경고 1개만).
- `flutter analyze` 클린.
- `flutter test`: ①`widget_test.dart` — 앱이 뉴게임 화면까지 정상 부팅. ②`game_loop_test.dart`(신규, 이 서브분의 핵심 증거) — **UI를 안 거치고 `api::game`을 실제 브리지로 직접 호출**해 뉴게임→`advance()`로 주인공 경기 정지점 도달→`resolveChoice("자동")`으로 완주(`GameOver`)→이후 반복 진행으로 **실제 시즌 경계(season≥1)를 통과**함을 확인(1분 50초 소요, day가 역행 없이 단조증가). I7 완료 기준 문장을 코드로 직접 증명한 테스트.

**수동 검증 한계(투명하게 기록)**: 에이전트 환경 특성상 실제 GUI 창을 띄워 마우스로 클릭하며 눈으로 확인하는 절차는 수행 못 함 — 대신 `flutter build windows --debug`로 실제 네이티브 빌드(엔진 dll 포함) 성공을 확인했고, 위 `game_loop_test.dart`가 UI가 호출하는 것과 동일한 브리지 함수를 동일한 순서로 호출해 로직 동작을 증명한다. 사용자가 직접 `flutter run -d windows`로 화면을 띄워 눈으로 훑어보는 걸 권장.

**남은 I7 작업**(우선순위 순 추정, 다음 서브분 후보): ①4허브(내 선수·리그·기록·메시지함) 최소 뷰, ②매치 CustomPainter 비주얼(다이아몬드·존그리드), ③`injuryTreatment`/`contractNego`/`tradeDecision`/`careerChoice`/`draft` 전용 화면(지금은 개발자용 폴백뿐), ④세이브 슬롯 영속성(`createSlot`/`loadSlot`), ⑤반응형 레이아웃(데스크톱 사이드내비/모바일 바텀내비), ⑥은퇴 화면.

### 6-22. I7 2차분 착수 기록 (2026-07-16, 완료) — 내 선수 허브(상태·훈련·재정)

**스코프**: 4허브 중 첫 번째 — [01_내선수](../04_UI기획/01_내선수.md) 상태·훈련·재정 3탭. 사용자가 제안 순서("4허브 최소 뷰"를 여러 서브분으로 쪼개기)에 동의해 그 첫 조각으로 착수.

**스코프 판단**: 문서가 요구하는 항목 중 **엔진에 아직 없는 파생값은 명시적으로 생략**했다 — ①나이·역할(선발/불펜/마무리)·명성 라벨: 이 값 자체가 엔진에 없음(나이는 01_커리어_구조.md §5 진로 갈림길과 함께 후속 스코프, 역할은 항상 선발 완투 placeholder라 개념 자체가 없음, 명성은 09_평가_시스템 §4-1이 I6 4차분에서 이미 "산출 로직 미구현"으로 스코프아웃해둔 항목). ②구종 마스터리 라벨: 05_구종_시스템 마스터리 시스템 자체가 엔진에 없음(I6 5차분에서 이미 확인된 제약, sim/training.rs 주석 참고). ③훈련 탭의 "구종 슬롯"(신규 구종 습득 UI): 전체 구종 카탈로그를 조회하는 엔진 쿼리가 없어 이번엔 능력치 주/보조 슬롯+강도만 다루고 구종 슬롯은 후속(`set_protagonist_training`은 이미 `new_pitch: Option<&str>`를 받게 설계돼 있어 후속에서 카탈로그 쿼리만 추가하면 확장 가능). ④개인 트레이너·재정 명세: 08_개인_재정 시스템 전체가 엔진에 없어(finance 컬럼이 사실상 미사용) 재정 탭은 "미구현" 안내 문구만. ⑤능력치 색 스펙트럼 정확한 구간·강도 다이얼의 "등판 주엔 강 비활성" 시각적 잠금: 01_내선수.md §5가 이미 "아트 단계"로 이월 명시(강도 캡 자체는 엔진이 서버사이드로 이미 적용하므로 기능상 안전, 사전 시각 경고만 없음).

**구현**:
- `engine/src/api/game.rs`: `get_current_team_info`(주인공 현재 소속팀, FA/무소속이면 `None`) · `exposed_stat_names`/`training_intensity_names`(순수 상수라 동기) · `get_training_config`/`set_training`(`repository::set_protagonist_training` 래핑, `new_pitch`는 이번 스코프에서 항상 `None`).
- `app/lib/features/my_player/my_player_screen.dart`(신규): 3탭 — 상태(능력치 9개를 피지컬/기술/멘탈로 그룹핑 후 3단위 반올림 표시+색 스펙트럼, 구종 목록, 라이브상태 게이지 3개), 훈련(주슬롯1+보조슬롯2 드롭다운+강도 선택 칩, 저장 시 `setTraining` 호출), 재정(placeholder). 능력치 그룹핑·반올림·색상은 "UI가 해도 되는 숫자 포맷"(03_구조.md §3)이라 Dart에서 직접 처리 — 계산/판정이 아니므로 "UI에 로직 0" 불변식 위반 아님.
- `app/lib/shared/router.dart`: `/game/my-player` 라우트 추가, `GameScreen` AppBar에 진입 버튼.

**테스트**: `cargo test --lib` 188개 전부 통과(신규 2개: `api::game`의 상수/왕복 테스트). `cargo clippy --lib --tests` 클린(기존 무관 경고 1개만). `flutter analyze` 클린. `flutter test` 4개 전부 통과 — 기존 2개(부팅·전체 루프) + 신규 2개: `my_player_test.dart`(UI 없이 `api::game` 직접 호출로 팀정보·훈련설정 왕복 검증), `my_player_widget_test.dart`(실제 위젯 트리를 띄워 3탭 라벨·능력치 3분류 헤더가 렌더되는지 확인).

**구현 중 발견한 도구 이슈**: `flutter_rust_bridge_codegen generate`가 내부적으로 돌리는 `build_runner`(freezed 코드 재생성용)가 이 환경의 Dart SDK(3.10.3)와 호환 문제로 실패(`'dart compile' does not support build hooks`) — 타입 shape가 안 바뀌는 변경(이번 서브분처럼 구조체/함수만 추가, 새 enum 없음)은 기존 `game.freezed.dart`가 그대로 유효해 영향 없었지만, **새 frb enum을 추가하는 다음 서브분에서는 이 문제를 직접 해결해야 할 수 있음**(build_runner 버전 다운그레이드 또는 수동 패치) — 기록해둠.

### 6-23. I7 3차분 착수 기록 (2026-07-16, 완료) — 리그 허브(로스터·일정·순위·라이벌)

**스코프**: 4허브 중 두 번째 — [02_리그](../04_UI기획/02_리그.md) 로스터·일정·순위·라이벌 4탭. 결정5 "전 팀 풀 스카우팅"(172팀 어디든 열람 가능)까지 포함.

**스코프 판단**: 이번에도 엔진에 없는 값은 명시적으로 생략했다 — ①코치/감독/구단주: 스태프 시스템 자체가 엔진에 없음(I3에서 이미 스코프아웃, §6-22와 동일 맥락). ②NPC 개인 통산 성적: 개인 스탯 트래킹이 엔진에 없어(I6부터 계속 이월) 로스터 탭은 능력치·포지션·나이·보유구종만. ③타자 유형 태그(파워형/컨택형 등): 엔진에 계산 로직이 없음. ④전력★ 대비 순위 이변 강조: 전력★을 조회할 엔진 쿼리가 없어 이번엔 단순 순위표만(승률 내림차순). ⑤개인 라이벌(관계도·아크 진행 비교): `relationships` 테이블이 스키마만 있고 실제로 채우는 로직이 엔진 어디에도 없음(관계 시스템 자체가 미구현 — 05_히스토리_엔딩과 함께 후속) — 대신 `team_history.rivals`(정적 콘텐츠, 지역·서사 페어링)만 팀 레벨로 표시.

**구현**:
- `engine/src/data/repository.rs`: `win_pct`를 `pub(crate)`로 승격(순위 정렬에 재사용).
- `engine/src/api/game.rs`: `TeamOption`에 `league_id` 필드 추가(리그 선택 드롭다운 기본값 결정에 필요 — `list_hs_teams`·`get_current_team_info`·신규 `list_teams` 전부 갱신). `list_teams(league_id: Option)`(결정5 전 팀 스카우팅, `None`이면 172팀 전부) · `list_roster(team_id)`(NPC는 등급 없이 능력치+포지션+보유구종만, §1 "등급은 주인공 전용") · `get_team_schedule(team_id)` · `get_standings(league_id)`(`standings.rank` 컬럼은 시즌 중 갱신 안 되고 `season_rollover` 때만 확정되므로, 조회 시점에 승률로 재정렬한 순위를 반환 — 정렬은 "UI가 해도 됨" 영역이라 판정 로직 아님) · `get_team_rivals(team_id)`(`team_history.rivals` 원시 JSON 통과).
- `app/lib/features/league/league_screen.dart`(신규): 리그 선택→팀 선택 2단 드롭다운(기본값=주인공 소속) + 4탭. 일정 탭은 다음 경기를 강조 표시.
- `app/lib/shared/router.dart` + `GameScreen`: `/game/league` 라우트 + 진입 버튼.

**테스트**: `cargo test --lib` 189개 전부 통과(신규 1개: `api::game`의 리그 허브 통합 테스트 — 팀 목록/로스터/일정/순위/라이벌 조회가 실제 content.db로 전부 동작하는지). `cargo clippy --lib --tests` 클린(기존 무관 경고 1개만). `flutter analyze` 클린. `flutter test` 6개 전부 통과 — 신규 2개(`league_test.dart`: UI 없이 엔진 함수 직접 검증, `league_widget_test.dart`: 실제 위젯 트리로 4탭 렌더+주인공 팀 기본 선택 확인).

**구현 중 발견한 테스트 기법**: `flutter_rust_bridge`의 비동기 호출이 위젯 `initState`에서 트리거될 때, `testWidgets`의 가짜 시계 안에서는 절대 안 풀리는 문제를 §6-22에 이어 다시 만남 — 이번엔 `pumpWidget` 자체를 `tester.runAsync(...)` 콜백 **안으로** 옮기고 그 안에서 실시간 지연 후 `pump()`까지 호출해야 실제로 풀림(바깥에서 `runAsync`로 지연만 주고 별도로 `pump()`하는 방식은 안 됐음) — `my_player_widget_test.dart`도 이 패턴이 필요했다면 재확인 필요하나 그때는 우연히 통과함.

### 6-24. I7 4차분 착수 기록 (2026-07-16, 완료) — 기록 허브(히스토리 로그 6종+업적)

**스코프**: 4허브 중 세 번째 — [03_기록](../04_UI기획/03_기록.md) 히스토리 로그 6종(경기/계약·이력/부상·재활/관계/수상·기록/커리어) + 업적 = 7탭. 착수 전 남은 두 허브(기록·메시지함) 중 `메시지함`을 먼저 조사해보니 이벤트·알림 콘텐츠 생성 시스템 자체가 엔진에 전혀 없음을 확인(`inbox` 테이블이 시즌종료 삭제 로직 외엔 아무것도 안 채워짐 — 콘텐츠 저작(I8) 전제 기능이라 지금 만들면 빈 화면)해 `기록` 허브로 방향을 바꿈 — `game_log`가 이미 실데이터로 채워져 있어 훨씬 값진 슬라이스였다.

**스코프 판단**: 7탭 중 **실제로 데이터가 있는 3개만 채우고 나머지 4개는 "미구현" 안내**로 뼈대만 세웠다 — ①경기 로그: `game_log`(이미 I6 4차분부터 매 등판 전체 보존). ②계약·이력: `league_transactions`의 `contract`(방출/체결)·`trade`(트레이드) 종류 — **단, 계약 이벤트(`contract`) 로깅 자체가 이번 서브분 전까지 없었음을 발견**해 `process_protagonist_contract`(방출)·`resolve_contract_nego`(체결)에 `league_transactions` INSERT를 새로 추가했다(작은 엔진 확장, 트레이드 로깅은 I6 8차분에 이미 있었음). ③부상·재활: `protagonist.injury.history`(부위·심각도·발생일) — 단 치료법 선택·복귀 확정 시점은 로그에 안 남는다(`record_injury`가 발생 스냅샷만 남기고, `treat`·완치 처리는 `current` 필드만 갱신). ④관계: `relationships` 테이블이 스키마만 있고 채우는 로직이 엔진 어디에도 없음(관계 시스템 자체 미구현, §6-23에서 이미 확인). ⑤수상·기록: 개인기록(노히트노런 등)·시상 판정 로직이 없음. ⑥커리어: 진로선택·병역·은퇴 등 분기점을 영구 로그로 남기는 코드가 없음 — `enlist`/`discharge`/`retire`도 NPC 전용이라 주인공에겐 아직 적용조차 안 됨(진로 갈림길 부재와 같은 근본 원인, §6-19에서 이미 확인). ⑦업적: `achievement_progress` 테이블이 스키마만 있고 달성 조건 정의·체크 로직이 없음(I8 콘텐츠 저작 전제).

**구현**:
- `engine/src/data/repository.rs`: `win_pct`에 이어 계약 이벤트 로깅 추가 — `process_protagonist_contract`(방출 확정 시 `league_transactions`에 `kind='contract', event='release'`) · `resolve_contract_nego`(계약 체결 시 `event='sign'`, `negotiation_kind`로 FA/재계약 구분).
- `engine/src/api/game.rs`: `get_game_log`·`get_contract_history`(`kind IN ('contract','trade')`만, `champion`은 리그 전체 기록이라 제외)·`get_injury_history`(injury.history 배열 파싱).
- `app/lib/features/records/records_screen.dart`(신규): 7탭 — 실데이터 3탭(리스트뷰) + placeholder 4탭(공용 `_UnimplementedTab` 위젯, 왜 없는지 사유를 화면에 그대로 노출).
- `app/lib/shared/router.dart` + `GameScreen`: `/game/records` 라우트 + 진입 버튼.

**테스트**: `cargo test --lib` 192개 전부 통과(신규 3개: 방출/체결 로깅 확인 2개 + `api::game`의 기록 허브 통합 테스트 1개 — 새 게임 직후 전부 비어있는지, 직접 시드한 game_log/league_transactions/injury 항목이 정확히 조회되는지). `cargo clippy --lib --tests` 클린(기존 무관 경고 1개만). `flutter analyze` 클린(도중 `InjuryLogEntry.part`가 Dart 예약어라 frb가 `part_`로 자동 리네임한 걸 놓쳐 컴파일 에러 — `part_`로 수정). `flutter test` 8개 전부 통과(신규 2개: `records_test.dart` 엔진 직접 검증(실제 경기 완주 후 game_log 채워짐까지 확인), `records_widget_test.dart` 7탭 렌더 확인).

### 6-25. I7 5차분 착수 기록 (2026-07-16, 완료) — injuryTreatment 전용화면

**스코프**: [07_전환화면](../04_UI기획/07_전환화면.md) §5 부상 치료 선택. 전용화면 5종(협상·트레이드·진로·드래프트·치료) 중 **지금 유일하게 실전에서 발동 가능**한 것 — 나머지 4종은 진로 갈림길(고교→프로 진입)이 엔진에 없어 아직 못 걸림(§6-19·§6-24에서 이미 확인). 사용자가 확정한 추천 순서의 첫 항목.

**스코프 판단**: §5 "3옵션 비교표(수술/재활/무리한복귀 × 이탈기간·재발위험·완치도)"에서 **이탈기간만 실제 계산값**(`sim::injury::treated_recovery_days`)이고, 재발위험·완치도는 08_부상_시스템.md §4 표가 이미 정성적으로 확정해둔 설명 문구(수술=낮음/높음, 재활=있음(기준)/중간, 무리한복귀=매우높음/낮음)를 그대로 노출 — 엔진의 실제 판정(`surgery_succeeds`·`rushed_return_aggravates`)은 즉시-판정형이라 선택 시점에야 결과가 나오므로, 사전 비교표 단계에서 정확한 확률 수치를 보여줄 방법이 없다(문서 자체도 §4에서 수치가 아닌 상대적 설명으로만 표를 그림). **"팀 성적 압박 상황" 맥락은 생략** — 문서가 "무리한 복귀 딜레마"의 서사적 배경으로 언급했지만 그 압박을 수치화하는 엔진 값이 따로 없다.

**구현**:
- `engine/src/api/game.rs`: `treatment_options(severity)` — `sim::injury::TREATMENTS` 3종 각각의 이름(그대로 `resolveChoice`의 `choice_id`로 쓸 수 있음)·이탈기간(실계산)·재발위험/완치도(정성 라벨). 순수 계산이라 동기.
- `app/lib/features/game/injury_treatment_view.dart`(신규): 부상 정보(부위·심각도) + 3열 비교표 + 치료법 선택 버튼. `GameScreen`의 `_MainArea`가 `action.kind == 'injuryTreatment'`일 때 이 뷰로 라우팅(기존 개발자용 원시 payload 폴백을 대체).

**테스트**: `cargo test --lib` 193개 전부 통과(신규 1개: `treatment_options`가 정확한 이름 3개를 반환하고 심각도가 클수록/치료법에 따라 이탈기간이 문서 순서대로 벌어지는지). `cargo clippy --lib --tests` 클린(기존 무관 경고 1개만). `flutter analyze` 클린. `flutter test` 10개 전부 통과(신규 2개: `injury_treatment_test.dart` 순수 계산 직접 검증, `injury_treatment_widget_test.dart` — 합성 `PendingActionInfo`로 비교표 렌더 + 버튼 탭 시 크래시 없음 확인. 실제 부상이 자연 발생할 때까지 시뮬레이션을 오래 돌리는 대신, 위젯에 합성 payload를 직접 주입하는 방식을 택함 — 이유는 발생 확률이 낮아 결정론적으로 짧은 시간 안에 재현하기 어려워서).

### 6-26. 문서 갱신 규칙

**이 문서는 살아있는 문서다.** Phase를 하나 끝낼 때마다:
1. §2 표의 해당 행 상태를 `⬜ 미착수` → `🔶 진행중` → `✅ 완료`로 갱신.
2. 완료 시 실제로 무엇을 만들었는지, 다음 세션이 알아야 할 특이사항(발견한 버그·우회법 등, P7 때처럼)을 이 문서나 관련 문서에 남긴다.
3. 커밋 메시지에 Phase 번호를 명시(예: "impl: I0 리포지토리 스캐폴딩").
