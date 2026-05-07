# ProjectB 전체 폴더 구조

## 새 파일 추가 위치 빠른 참조

| 추가할 것 | 방법 |
|---|---|
| 새 캐릭터 (아크 포함) | `resource/data/staging/CONTACT_{ID}.json` → `npm run deploy` |
| 메신저 스크립트 | `resource/data/staging/SCRIPT_{ID}.json` → `npm run deploy` |
| 필수/조건부/랜덤 이벤트 | `resource/data/staging/EVT_{ID}.json` → `npm run deploy` |
| 메시지 템플릿 | `resource/data/staging/MSG_{ID}.json` → `npm run deploy` |
| 결정 템플릿 | `resource/data/staging/DEC_{ID}.json` → `npm run deploy` |
| 업적 | `resource/data/staging/ACH_{ID}.json` → `npm run deploy` |
| 선수/코치/감독/구단주 | `resource/data/staging/PLY_{임의}.json` → `npm run deploy` (자동 번호 부여) |
| 새 UI 기능 | `apps/ui/src/features/{기능명}/ui/{기능명}Modal.svelte` |
| 새 페이지 | `apps/ui/src/pages/{페이지명}/{페이지명}Page.svelte` |
| 새 스토어 | `apps/ui/src/shared/stores/{이름}.ts` |
| 새 유틸 | `apps/ui/src/shared/utils/{이름}.ts` |
| 새 타입 | `apps/ui/src/shared/types/{이름}.ts` |
| 빌드 스크립트 | `scripts/{이름}.mjs` |

> 콘텐츠 파일 추가: `npm run deploy` (자동 배포 + manifest 갱신)
> 직접 수정 시: `npm run gen:manifest`

---

## 전체 구조

```
02.SvelteElectron/                          ← 프로젝트 루트
│
├── package.json                            ← 루트 워크스페이스 설정 + npm scripts
├── vite.config.ts                          ← Vite 빌드 설정
├── svelte.config.js                        ← Svelte 컴파일러 설정
├── tsconfig.json                           ← TypeScript 설정
│
├── CONTENT_PROMPT.md                       ← 콘텐츠 프롬프트 인덱스
├── PROMPT_CHARACTERS.md                    ← 캐릭터/아크/메신저/선수 생성 프롬프트
├── PROMPT_ACHIEVEMENTS.md                  ← 업적 생성 프롬프트
├── PROMPT_EVENTS.md                        ← 이벤트/메시지/결정 생성 프롬프트
├── PROJECT_STRUCTURE.md                    ← 이 파일
│
│
├── apps/                                   ← 실행 애플리케이션
│   │
│   ├── desktop/                            ← Electron 메인 프로세스
│   │   ├── main.cjs                        ← Electron 앱 진입점, IPC 핸들러, fs.watch
│   │   └── preload.cjs                     ← window.projectB API 노출 (IPC 브릿지)
│   │
│   └── ui/                                 ← Svelte 프론트엔드
│       ├── index.html                      ← HTML 진입점
│       └── src/
│           ├── App.svelte                  ← 루트 컴포넌트 (phase: loading→intro→create→playing)
│           ├── main.ts                     ← Svelte 마운트 진입점
│           ├── styles.css                  ← 전역 스타일
│           ├── vite-env.d.ts               ← Vite 환경변수 타입
│           │
│           ├── app/                        ← 개발용 목업 데이터
│           │   ├── mockCareer.ts           ← 커리어 목업
│           │   └── mockMain.ts             ← 메인 목업
│           │
│           ├── features/                   ← 기능별 UI 컴포넌트 (Modal 단위)
│           │   ├── achievements/ui/
│           │   │   └── AchievementManagerModal.svelte      ← 업적 관리
│           │   ├── career/ui/
│           │   │   └── CareerChoiceModal.svelte             ← 커리어 선택
│           │   ├── contract/ui/
│           │   │   ├── ContractNegotiationModal.svelte      ← 계약 협상
│           │   │   ├── FaMarketModal.svelte                 ← FA 시장
│           │   │   ├── OptionClauseModal.svelte             ← 옵션 조항
│           │   │   └── TradeModal.svelte                    ← 트레이드
│           │   ├── dashboard/ui/
│           │   │   └── HomeDashboard.svelte                 ← 홈 대시보드
│           │   ├── devtools/ui/
│           │   │   └── DevToolsHubModal.svelte              ← 개발자 도구 허브
│           │   ├── draft/ui/
│           │   │   └── DraftModal.svelte                    ← 드래프트
│           │   ├── entity-manager/ui/
│           │   │   └── EntityManagerModal.svelte            ← 선수 데이터 관리
│           │   ├── events/ui/
│           │   │   ├── EventManagerModal.svelte             ← 이벤트 관리 (개발용)
│           │   │   └── InGameEventModal.svelte              ← 인게임 이벤트 표시
│           │   ├── intro/ui/
│           │   │   └── IntroScreen.svelte                   ← 타이틀 화면
│           │   ├── main-layout/ui/
│           │   │   ├── RightPanel.svelte                    ← 우측 패널
│           │   │   └── TopHeader.svelte                     ← 상단 헤더
│           │   ├── match-engine-lab/ui/
│           │   │   └── MatchEngineLabModal.svelte           ← 매치 엔진 시뮬레이터
│           │   ├── match-view/ui/
│           │   │   ├── BaseballField.svelte                 ← 야구장 시각화
│           │   │   └── DotPitchStage.svelte                 ← 투구 스테이지
│           │   ├── messenger/ui/
│           │   │   └── MessengerScriptModal.svelte          ← 메신저 대화 스크립트
│           │   ├── messenger-manager/ui/
│           │   │   └── MessengerManagerModal.svelte         ← 메신저 관리 (개발용)
│           │   ├── military/ui/
│           │   │   ├── MilitaryEnlistModal.svelte           ← 입대 모달
│           │   │   └── MilitaryStatusPanel.svelte           ← 군 복무 상태
│           │   ├── navigation/ui/
│           │   │   └── SidebarNav.svelte                    ← 사이드바 네비게이션
│           │   ├── season-end/ui/
│           │   │   └── SeasonEndModal.svelte                ← 시즌 종료 / 새 시즌 시작
│           │   └── settings/ui/
│           │       └── SettingsPanel.svelte                 ← 설정 패널
│           │
│           ├── pages/                      ← 전체 화면 페이지
│           │   ├── academics/
│           │   │   └── AcademicsPage.svelte                 ← 학업 관리
│           │   ├── achievements/
│           │   │   └── AchievementsPage.svelte              ← 업적 목록
│           │   ├── finance/
│           │   │   └── FinancePage.svelte                   ← 재정/연봉
│           │   ├── main/
│           │   │   └── MainPage.svelte                      ← 메인 게임 화면 (중심)
│           │   ├── messages/
│           │   │   └── MessagesPage.svelte                  ← 메시지함 (이벤트 메시지)
│           │   ├── messenger/
│           │   │   └── MessengerPage.svelte                 ← 메신저 (카톡형 대화)
│           │   ├── new-game/
│           │   │   └── NewGamePage.svelte                   ← 새 게임 설정
│           │   ├── records/
│           │   │   └── RecordsPage.svelte                   ← 기록/통계
│           │   ├── roster/
│           │   │   └── RosterPage.svelte                    ← 로스터 관리
│           │   ├── schedule/
│           │   │   └── SchedulePage.svelte                  ← 일정표
│           │   ├── status/
│           │   │   └── StatusPage.svelte                    ← 선수 상태
│           │   ├── team/
│           │   │   └── TeamPage.svelte                      ← 팀 정보
│           │   ├── test/
│           │   │   └── TestMatchPage.svelte                 ← 경기 테스트
│           │   └── training/
│           │       └── TrainingPage.svelte                  ← 훈련 관리
│           │
│           └── shared/                     ← 공유 로직
│               ├── i18n/
│               │   └── index.ts                             ← 다국어 지원
│               ├── stores/                 ← Svelte 스토어 (전역 상태)
│               │   ├── game.ts                              ← 게임 저장 데이터 (주인공, 팀)
│               │   ├── master.ts                            ← 마스터 데이터 로더 + 핫리로드
│               │   ├── season.ts                            ← 시즌 진행 상태
│               │   └── settings.ts                          ← 앱 설정
│               ├── types/                  ← TypeScript 타입 정의
│               │   ├── event.ts                             ← 이벤트 타입
│               │   ├── main.ts                              ← 공통 타입
│               │   ├── messenger.ts                         ← 메신저 타입
│               │   ├── projectb.d.ts                        ← window.projectB API 타입
│               │   ├── save.ts                              ← 저장 데이터 타입
│               │   └── season.ts                            ← 시즌 타입
│               ├── usecases/
│               │   └── advanceWeek.ts                       ← 주차 진행 유스케이스
│               └── utils/                  ← 게임 로직 엔진
│                   ├── academicsEngine.ts                   ← 학업 엔진
│                   ├── achievementEngine.ts                 ← 업적 엔진
│                   ├── careerChain.ts                       ← 커리어 진행 로직
│                   ├── conditionEvaluator.ts                ← 이벤트 조건 평가
│                   ├── draftEngine.ts                       ← 드래프트 엔진
│                   ├── eventEngine.ts                       ← 이벤트 발동 엔진
│                   ├── faEngine.ts                          ← FA 엔진
│                   ├── growthEngine.ts                      ← 성장 엔진
│                   ├── salaryEngine.ts                      ← 연봉 계산 엔진
│                   └── scheduleGen.ts                       ← 일정 생성기
│
│
├── packages/                               ← 공유 패키지 (monorepo)
│   │
│   ├── contracts/                          ← IPC 타입 계약
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── src/
│   │   │   ├── dto.ts                      ← 데이터 전송 객체 타입
│   │   │   ├── index.ts                    ← 패키지 진입점
│   │   │   ├── ipc.ts                      ← IPC 채널 타입
│   │   │   └── match.ts                    ← 경기 관련 타입
│   │   └── dist/                           ← 빌드 결과물 (자동생성)
│   │
│   └── core/                               ← 게임 핵심 엔진
│       ├── package.json
│       ├── tsconfig.json
│       ├── src/
│       │   ├── index.ts
│       │   ├── domain/
│       │   │   ├── gameState.ts            ← 게임 상태 도메인
│       │   │   ├── matchEngineTuning.ts    ← 매치 엔진 튜닝 파라미터
│       │   │   └── matchState.ts           ← 경기 상태 도메인
│       │   └── usecases/
│       │       ├── advanceDay.ts           ← 날짜 진행 유스케이스
│       │       └── matchEngine.ts          ← 경기 시뮬레이션 엔진
│       └── dist/                           ← 빌드 결과물 (자동생성)
│
│
├── scripts/                                ← 빌드/유틸 스크립트
│   ├── gen-manifest.mjs                    ← _manifest.json 자동 생성
│   ├── deploy-staging.mjs                  ← staging/ → master/ 자동 배포 ← npm run deploy
│   ├── migrate-entities.mjs               ← people_*.json → entities/players/ 분리 (1회성)
│   ├── generate-npc-people.mjs            ← NPC 선수 데이터 자동 생성
│   ├── generate-hs-roster.mjs             ← 고교 로스터 생성
│   ├── check-i18n-keys.mjs               ← i18n 키 누락 검사
│   ├── check-mojibake.mjs                ← 인코딩 깨짐 검사
│   └── wait-for-port.cjs                 ← 개발 서버 대기 유틸
│
│
├── resource/                               ← 게임 리소스
│   ├── park/                               ← 배경 이미지
│   │   ├── highschoolbaseball.gif
│   │   ├── probaseball.gif
│   │   └── universitybaseball.gif
│   │
│   └── data/
│       ├── README.md
│       │
│       ├── staging/                        ← 콘텐츠 투입 드롭 폴더 (npm run deploy로 배포)
│       │   └── .gitkeep
│       │
│       ├── master/                         ← 마스터 데이터 (게임 설계 데이터)
│       │   ├── _manifest.json              ← 자동생성 인덱스 (gen:manifest로 갱신)
│       │   ├── version.json                ← 데이터 버전
│       │   │
│       │   ├── achievements/               ← 업적 정의
│       │   │   ├── baseball/               ← 야구 성적 업적 (25개)
│       │   │   ├── growth/                 ← 성장 업적 (5개)
│       │   │   ├── hidden/                 ← 히든 업적 (1개)
│       │   │   └── social/                 ← 소셜 업적 (4개)
│       │   │
│       │   ├── balance/                    ← 게임 밸런스 수치
│       │   │   ├── match_engine_tuning.json        ← 경기 엔진 튜닝값
│       │   │   ├── match_engine_tuning.schema.json ← 튜닝 스키마
│       │   │   ├── probabilities.json              ← 확률 테이블
│       │   │   └── progression.json                ← 성장 곡선
│       │   │
│       │   ├── characters/                 ← 캐릭터 정의 (대화/아크/친밀도 통합)
│       │   │   ├── CONTACT_CAPTAIN_PARK.json   ← 박정훈 (arc_intro, arc_rival 포함)
│       │   │   └── CONTACT_COACH_JI.json       ← 오지경 (arc_intro, arc_trust 포함)
│       │   │
│       │   ├── entities/                   ← NPC 선수/스태프 데이터
│       │   │   ├── players/                ← 개별 선수 파일 (migrate:entities 후 생성)
│       │   │   │   ├── _index.json         ← leagueId → id 목록 인덱스
│       │   │   │   ├── PLY_00001.json
│       │   │   │   ├── PLY_00002.json
│       │   │   │   └── ...
│       │   │   ├── people_hs.json          ← 고교 벌크 (migrate 전 폴백용)
│       │   │   ├── people_univ.json        ← 대학 벌크
│       │   │   ├── people_ind.json         ← 독립리그 벌크
│       │   │   ├── people_kbl.json         ← KBL 벌크
│       │   │   ├── people_abl.json         ← ABL 벌크
│       │   │   └── refs.json               ← 리그/팀/학교/클럽 ID 전체 참조표
│       │   │
│       │   ├── events/                     ← 이벤트 시스템
│       │   │   ├── conditional/            ← 조건부 이벤트 (7개)
│       │   │   ├── mandatory/              ← 필수 이벤트 (5개)
│       │   │   ├── pools/                  ← 랜덤 이벤트 풀 정의
│       │   │   └── random/
│       │   │       ├── media/              ← 미디어 랜덤 이벤트 (2개)
│       │   │       ├── social/             ← 소셜 랜덤 이벤트 (2개)
│       │   │       └── team_life/          ← 팀생활 랜덤 이벤트 (3개)
│       │   │
│       │   ├── leagues/                    ← 리그 정의
│       │   │   ├── abl.json                ← ABL 설정 (16팀, 포스트시즌)
│       │   │   └── kbl.json                ← KBL 설정 (8팀, 포스트시즌)
│       │   │
│       │   ├── messages/                   ← 메시지 템플릿
│       │   │   ├── categories.json         ← 메시지 카테고리 정의
│       │   │   ├── decision_templates.json ← 결정 선택지 템플릿 전체
│       │   │   └── templates.json          ← 메시지 본문 템플릿 전체
│       │   │
│       │   ├── messenger/                  ← 메신저 시스템
│       │   │   ├── contact_replies.json    ← 일반 대화 답장 템플릿
│       │   │   ├── contacts_catalog.json   ← 연락처 목록 (unlock 조건)
│       │   │   ├── scripts.json            ← 메신저 스토리 스크립트 전체
│       │   │   └── unlock_rules.json       ← 연락처 해금 규칙
│       │   │
│       │   ├── players/                    ← 선수 생성 규칙
│       │   │   ├── generation_rules.json   ← 리그별 스탯 범위 규칙
│       │   │   ├── name_pool_abl_en.json   ← ABL 영문 이름 풀
│       │   │   ├── name_pool_en.json       ← 영문 이름 풀
│       │   │   ├── name_pool_kr.json       ← 한국어 이름 풀
│       │   │   └── archetypes/
│       │   │       └── pitcher_starter.json ← 선발 투수 기본 스탯
│       │   │
│       │   ├── schools/                    ← 학교 상세 정보
│       │   │   ├── highschool/             ← 고교 데이터
│       │   │   └── university/             ← 대학 데이터
│       │   │
│       │   ├── teams/                      ← 팀 인덱스
│       │   │   ├── index.json              ← 전체 리그 그룹 목록
│       │   │   ├── highschool/index.json   ← 고교 8팀
│       │   │   ├── independent/index.json  ← 독립리그 8팀
│       │   │   ├── pro_korea/index.json    ← KBL 8팀 (PKT_*)
│       │   │   ├── pro_usa/index.json      ← ABL 16팀 (PUT_*)
│       │   │   └── university/index.json   ← 대학 7팀
│       │   │
│       │   └── training/                   ← 훈련 시스템
│       │       ├── pitch_catalog.json          ← 구종 카탈로그
│       │       ├── pitch_unlock_rules.json     ← 구종 해금 조건
│       │       ├── programs_pitcher.json       ← 투수 훈련 프로그램
│       │       └── weekly_ratio_presets.json   ← 주간 훈련 비율 프리셋
│       │
│       ├── runtime/                        ← 런타임 DB 스키마
│       │   ├── README.md
│       │   └── schema/
│       │       └── v1_init.sql             ← SQLite 초기화 SQL
│       │
│       └── seeds/                          ← 게임 시작 초기 데이터
│           └── v1/
│               ├── bootstrap.json
│               ├── opening_affiliations.json
│               ├── opening_contracts.json
│               ├── opening_messages.json
│               ├── opening_messenger.json
│               ├── opening_players.json
│               ├── opening_schedule.json
│               ├── opening_training_state.json
│               └── version.json
│
│
└── docs/                                   ← 기획 문서
    └── event-system-plan.md               ← 이벤트 시스템 설계 문서
```

---

## 아키텍처 흐름

```
[Electron main.cjs]
    ↓ IPC
[preload.cjs] → window.projectB API
    ↓
[App.svelte] → phase 관리 (loading → intro → create → playing)
    ↓
[MainPage.svelte] ← 게임 중심 화면
    ├── [shared/stores/] ← 전역 상태 (game, season, master, settings)
    ├── [shared/utils/]  ← 게임 로직 엔진
    └── [features/*/]   ← 기능별 Modal 컴포넌트

[resource/data/staging/] ← 콘텐츠 투입 드롭 폴더
    → npm run deploy
    → resource/data/master/ 올바른 위치에 배포
    → gen:manifest → _manifest.json
    → masterStore.load() → 게임 내 반영
    → fs.watch (dev) → 변경 감지 → 핫리로드
```

## npm 주요 명령어

```bash
npm run dev              # 개발 서버 + Electron 동시 실행
npm run deploy           # staging/ 파일을 master/에 자동 배포 + manifest 갱신
npm run gen:manifest     # _manifest.json 재생성 (직접 수정 시)
npm run migrate:entities # people_*.json → entities/players/ 개별 파일로 분리 (1회성)
npm run build            # 프로덕션 빌드
npm run check:encoding   # 한글 인코딩 검사
npm run gen:npc          # NPC 선수 자동 생성
```
