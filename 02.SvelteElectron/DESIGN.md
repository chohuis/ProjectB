# DESIGN.md — ProjectB Lite 통합 기획서

> **단일 진실(Single Source of Truth)** — 게임 컨셉·커리어 구조·리그 정책·경량화 원칙은 이 문서가 기준이다.
> `00.OneF/00.Planning/*.txt`는 아카이브(과거 기획 이력)로만 보존하며, 이 문서와 충돌 시 이 문서를 따른다.
> 개발 규칙은 `CLAUDE.md`, 콘텐츠 제작은 `CONTENT.md`(통합 예정), 진행 현황은 `docs/PROJECT_STATUS.md`.

최종 확정: 2026-07-02

---

## 1. 게임 정체성

- **제목(가제)**: 투수 키우기
- **장르**: 야구 투수 인생 시뮬레이션 (1인 육성)
- **핵심 철학** (원 기획 계승, 불변):
  1. 선수는 **경기 단위**로 평가받는다 (S~D 등급).
  2. 그러나 **인생(커리어)은 점수로 판정하지 않는다** — 엔딩은 판정이 아니라 기록(히스토리)이다.
  3. 정답 루트 없는 샌드박스 — 목표는 유저 내면에 있고, 게임은 과정과 기록을 제공한다.
- **유사 감각**: FM(커리어/기록/선택) + 롤러코스터 타이쿤2 샌드박스

### 1.1 Lite 방향 선언

이 게임은 **선수 1명의 게임**이다. 세계는 주인공의 배경이지 주인공이 아니다.

- **유지(전문성)**: 성장·능력치·구종·훈련·부상·경기 엔진 — 육성의 깊이는 줄이지 않는다.
- **경량화(배경)**: 리그 시뮬 범위·NPC 규모·NPC 간 거래 — 주인공과 무관한 세계 연산을 줄인다.

---

## 2. 핵심 설계 원칙 — 주인공 반경 시뮬 (Radius Simulation)

> **주인공에게서 멀수록 해상도를 낮춘다.**

| 반경 | 대상 | 해상도 |
|---|---|---|
| **0** | 주인공 | 풀 해상도 — 스탯 9종·XP·구종·부상 18종·계약·평가 전부 |
| **1** | 주인공 소속 리그 | 경기 시뮬 O, NPC 개인 성적 O (성장·부상은 간소 규칙) |
| **2** | 인접 리그 | **순위표 드리프트만** — 팀 전력치 기반 주 1회 승패 계산. 선수 라인·개인 스탯 없음 |
| **3** | 미진출 리그 | **비활성** — 데이터 자체를 생성하지 않음. 진출 확정 시 Lazy 생성 |

### 2.1 리그 활성화 정책

| 주인공 단계 | 풀 시뮬 (반경 1) | 드리프트 (반경 2) | 비활성 (반경 3) |
|---|---|---|---|
| 고교 | 고교 10팀 | KBL | ABL, JBL, 대학, 독립 |
| 대학 | 대학 8팀(7+상무) | KBL | ABL, JBL, 독립 |
| 독립 | 독립 8팀 | KBL | ABL, JBL, 대학 |
| KBL | KBL 8팀 | ABL, JBL | — |
| ABL 진출 | ABL 12팀 | KBL, JBL | — |
| JBL 진출 | JBL 12팀 | KBL, ABL | — |

- 순위표 드리프트: Rust 호출 1개/주. 팀 전력치 + 노이즈로 승패만 누적. 뉴스 Digest·시즌 종료 순위·드래프트 순서 산출에 충분.
- 시즌 종료 시 드리프트 리그의 "리그 리더"(타이틀 홀더)는 팀 전력치 + Named NPC 기반으로 생성 — 연감/뉴스용.

### 2.2 Lazy 리그 활성화

- 비활성 리그는 **주인공 진출 확정 시점**에 로스터를 생성한다 (Rust `generate_league_roster` 신규).
- 활성화 이전 시즌의 순위 이력은 드리프트 결과에서 소급 생성.
- ABL/JBL 팀·일정·브래킷 코드는 전부 재사용 — 게이트만 추가.

### 2.3 해외 리그 (ABL·JBL) — 동급 취급 (2026-07-02 변경 확정)

- **JBL은 ABL과 동급의 해외 진출 무대다** (이벤트 강등안 철회).
- 두 리그 공통 정책:
  - 아마추어 단계(고교/대학/독립): **비활성**
  - KBL 진출 시: **드리프트 활성** (순위표만)
  - 해당 리그 진출 시: **풀 시뮬 + Lazy 로스터 생성**
- 진출 경로: FA·포스팅 (KBL → ABL/JBL 동등). "해외 진출 오퍼"는 진출 트리거 연출로 사용.
- 기존 JBL 코드(팀·일정·브래킷·FA 4년 규칙)는 현행 유지, 활성화 게이트만 추가.

---

## 3. 육성 코어 (보호 대상 — 변경 금지 목록)

아래 시스템은 Lite 작업에서 **건드리지 않는다**. 수정하려면 이 문서를 먼저 갱신할 것.

| 시스템 | 내용 |
|---|---|
| 투수 능력치 9종 | velocity/command/control/movement/mentality/stamina/recovery/clutch/holdRunners + OVR |
| XP 성장 | `xp_threshold(v) = 7.5 + v × 0.35`, 주간 훈련 XP 적립 → 임계 도달 시 +1 |
| 구종 시스템 | 카탈로그·등급 5단계(습득중~마스터)·해금 조건·훈련 슬롯 |
| 훈련 | 프로그램 3슬롯(주+보조2) + 프리셋 |
| 매치 엔진 | 인터랙티브 1구 단위 투구 (Rust `match_engine.rs`) |
| 주인공 부상 | 18종 × 치료 7종 × 영구 패널티 테이블 |
| 성장 곡선 | developmentRate·potentialHidden·에이징 (Rust `growth_engine.rs`) |
| S~D 경기 평가 | 기대치 대비 평가 → 역할/계약/평판 연결 |
| 커리어 기록 | careerRecords·gameLog·careerEvents·수상 — **엔딩의 본체, 우선순위 상향** |
| 주인공 계약 | 드래프트·연봉 협상·FA·옵션·트레이드 (주인공 관점) |
| 군복무 | 상무/일반, W50 루머 → W52 선발, 복귀 페널티 |

---

## 4. NPC 구조

### 4.1 2계층 모델

| 계층 | 규모 | 데이터 | 처리 |
|---|---|---|---|
| **Named NPC** | 상한 ~150명 | `NpcSaveState` 풀 유지 (감정·기억·커리어이력·성격) | 반경 1 내 주간 처리 |
| **Background NPC** | 활성 리그 로스터만 | `{ id, name, teamId, position, age, ovr, potentialHidden }` 경량 레코드 | 간소 규칙 |

- 감정 시스템(9축+기억)은 Named 전용 (현행 emotionRole 게이트 유지, 상한 확정).
- Background NPC의 personality는 **생성 시점에 확정·저장** (현행 호출 시점 해시 폴백 제거).

### 4.2 NPC 주간 시뮬 범위 — B안 확정 (2026-07-02)

**Named NPC(~150 상한)는 리그 무관 주간 처리. 라이벌 서사를 시스템으로 완전 구동한다.**

| 대상 | 주간 처리 | 데이터 소스 |
|---|---|---|
| 주인공 리그 NPC (Named+배경) | 성장·부상 주간 | **실제 경기 데이터** (playerLines) |
| 타 리그 **Named** NPC | 성장·폼·부상 주간 | **합성 주간 성적 생성기** (아래) |
| 타 리그 배경 NPC | 시즌 종료 1회 일괄 | 나이 곡선 + 팀 전력 |

**합성 주간 성적 생성기 (Rust 신규) — 요구사항**:
1. **궤적 우선**: 시즌 시작 시 NPC별 시즌 궤적(최종 라인 목표 + 폼 곡선)을 worldSeed 기반으로 사전 생성 → 주간 값은 궤적에서 파생. 주간 난수 누적이 아니라 궤적 보간이므로 시즌 합산이 항상 자연스러움
2. **결정적**: 같은 worldSeed = 같은 궤적 (디버깅 재현성)
3. **분포 안정**: 10시즌 누적에도 리그 ERA/OPS 분포 유지 — 장기 검증 스크립트 필수
4. **합성 부상**: 가상 출전 가정 기반 확률 (궤적에 결장 구간으로 반영 — "출전 없는 부상" 어색함 방지)
- 감정 시스템: Named는 타 리그에서도 **준활성** (주간 갱신, 감쇠 완화) — dormant 재정의는 R5에서
- 다이제스트/뉴스/메신저가 주간 폼 데이터를 소재로 사용 ("동기 김XX, 대학리그 3연승")

**R3 리스크 통제**: 데이터 재구축(코어)과 합성 생성기(신규 시스템)를 **분리된 하위 단계**로 진행 — 코어 완성·검증 후 생성기 착수. 문제 발생 시 원인 분리 가능.

### 4.3 NPC 규모 목표

- 현행: 16,155명 사전 생성 (전 리그)
- Lite: **활성 리그 로스터만 존재**. 고교 시작 시 = 고교 10팀 × ~25명 + KBL Named 스타 소수 ≈ **250명 내외**
- 신입생/드래프트 풀: 매년 필요 시점에 생성 (현행 유지하되 활성 리그만)

---

## 5. 시장 시스템 캐던스 (경량화)

주인공이 겪는 계약·이적 이벤트는 유지. 줄이는 것은 **NPC 간 백그라운드 거래**뿐.

| 시스템 | 현행 | Lite |
|---|---|---|
| NPC 트레이드 | 주간 윈도우, 5단계 파이프라인 (가치평가→메디컬→선수동의) | **연 2회** (시즌 중 데드라인 1회 + 오프시즌 1회), 주인공 리그만. 파이프라인은 재사용 |
| NPC 콜업/콜다운 | 월간, 프로 3리그 전팀 | 오프시즌 + 시즌 중 1회, 주인공 리그만 |
| 팜(2군) 리그 | 3개 리그 풀 경기 시뮬 | **경기 시뮬 제거** — 로스터 상태 + 콜업 테이블 룩업만 |
| NPC FA | 전 프로 리그 | 주인공 리그만 (타 리그 이동은 드리프트·오프시즌 로그에 흡수) |
| 주인공 트레이드/FA/계약 | — | **전부 유지** (메디컬·협상 포함) |

---

## 6. 커리어 프레임워크 (원 기획 계승 + 현행 코드 반영)

### 6.1 시간 단위

- 진행 단위: **1주** (원 기획 문서의 "시즌 단위" 기술은 폐기 — 코드 현행이 기준)
- 1시즌 = 52주. 경기일·이벤트·선택 발생 시 진행 정지 → 유저 처리 → 재개.

### 6.2 커리어 스테이지

```
highschool → (W50 진로선택 → W51 드래프트 → W52 폴백)
  ├─ pro_kbl        드래프트 지명
  ├─ university     입시 (대학 최대 3지망)
  ├─ independent    독립 (최대 3지망)
  └─ military       상무 지원 / 일반 입대

university / independent → pro_kbl (드래프트·스카우트)
pro_kbl → pro_abl / pro_jbl (FA·포스팅 — 두 해외 리그 동급)
military → 원 소속 복귀
모든 스테이지 → 은퇴 (히스토리 정리 → 인생 기록 화면)
```

- 레거시 `"pro"` 스테이지는 **삭제** (세이브 마이그레이션으로 `pro_kbl` 이관).

### 6.3 진행 정지 조건 (PendingAction) — 16종 → 8종 통합

| 유지 | 통합/제거 |
|---|---|
| `game` (경기) | `preGameBriefing` → game에 흡수 |
| `event` (선택지 이벤트) | `conditionWarning` → 메시지로만 (정지 없음) |
| `careerChoice` (허브·결과 통합) | `careerChoiceHub`/`careerResults` → careerChoice 단계 속성으로 |
| `draftNotification` (관람 포함) | `draftObserve` → 흡수 |
| `salaryNegotiation` | `optionClause` → salaryNegotiation의 컨텍스트로 |
| `faMarket` | — |
| `trade` | — |
| `injuryTreatment` (중증 이상) | `hsGroupDraw` → 자동 처리 후 통보 |
| | `sportsUnitApplication`/`militaryEnlistAsk` → 군복무 이벤트로 통합 |

---

## 7. 리그·팀 데이터 (2026-07-02 규모 축소 확정)

| 리그 | 현행 | **확정** | 비고 |
|---|---|---|---|
| LEAGUE_HIGHSCHOOL | 16팀 (A/B조) | **10팀 단일리그** (선택 8교 + 배경 2교, 최대 12까지 조정 가능) | **A/B조·조추첨·조별 포스트시즌 로직 전부 삭제** (hsGroupA/B, shuffleHsGroups, hsGroupDraw) |
| LEAGUE_UNIVERSITY | 7팀 + 상무 | 7팀 + 상무 유지 | 현행 유지 |
| LEAGUE_INDEPENDENT | 8팀 | 8팀 유지 | 현행 유지 |
| LEAGUE_KBL | 8팀 | 8팀 유지 | 핵심 무대 |
| LEAGUE_ABL | 16팀 | **12팀 (동/서 6+6)** | Lazy — KBL 진출 시 드리프트, ABL 진출 시 풀 |
| LEAGUE_JBL | 12팀 (CL/PL) | 12팀 유지 | Lazy — **ABL과 동일 정책** (KBL 진출 시 드리프트, JBL 진출 시 풀) |
| *_FARM (2군) | 8/16/12팀 풀 시뮬 | 팀 수는 1군 연동 | **경기 시뮬 없음** — 명단(경량 레코드)만 |

- 로스터 규모: 프로 1군 28명 + 팜 명단 15명 (현행 KBL 40~65 폐기)
- 활성 선수 총량 목표: 고교 시작 시 **~250명 내외** (10팀 × ~25 + KBL Named 스타 소수) — 현행 16,155명 사전 생성 폐기
- FA 자격 연수: KBL 5년 / ABL 6년 / JBL 4년 (현행 유지)

---

## 8. 데이터 아키텍처 재구축 (2026-07-02 추가 — 신규 정본 구조)

### 8.1 현행 문제 (git 342커밋 정량 분석 근거)

- fix 커밋 86건(25%). 핫스팟: `advanceWeek.ts` 94회 수정(전체 커밋의 27%), `game.ts` 85회, `main.cjs` 64회, `preload.cjs`+`projectb.d.ts` 82회(IPC 6단계 등록 비용).
- 도메인별 fix: FA 92 · 세이브 72 · 군복무 44 · IPC 43 · 동기화 26 · 팀ID/이적 22 · 트레이드 19.
- **근본 원인 — NPC 상태 6곳 분산**:
  1. `master.db` (베이스, read-only)
  2. `master_overlay.db` (Phase 5에서 게임로직 쓰기 제거 → 배경 NPC 진급용으로 재도입되며 정책 붕괴)
  3. slot.db `game` JSON 블롭 (`gameStore.npcs` — 정체성·계약)
  4. slot.db `season` JSON 블롭 (`npcLiveStats` — **실제 능력치는 여기**)
  5. slot.db `npc_runtime` 테이블 (정체성 중복 + `pitch_*`/`bat_*` 능력치 컬럼 NULL 방치 → 트레이드 0건 버그)
  6. `masterStore.entities` (파생 뷰)
- 이적 1건 = 쓰기 4~5곳. 하나라도 누락 시 화면·DB·거래기록 불일치 — "트레이드 0건", "FA 목적지 CLUB_→TEAM_ 변환", "드래프트 DB 미반영" 등 반복 fix는 전부 이 결함의 발현.
- ID 3중 포맷: `TEAM_KBL_*_1`(정본) / `PKT_*`(레거시 — `KBL_FARM_MAP` 키가 아직 이 포맷, 조회 miss 의심) / `CLUB_KBL_*`(Rust 반환 이력).
- 세이브 무결성 서명이 JSON 블롭만 커버 — 관계형 테이블(npc_runtime 등)은 서명 밖.

### 8.2 새 원칙 (확정)

| # | 원칙 | 내용 |
|---|---|---|
| 1 | **슬롯 DB 단일 정본** | NPC 상태의 유일한 저장소 = slot.db `npc` 테이블. `master_overlay.db` **폐기**. game/season JSON 블롭에서 `npcs`·`npcLiveStats` 제거(주인공+시즌 메타만 잔류). `master.db`는 콘텐츠(이벤트·템플릿·밸런스·생성규칙·이름풀) 전용 — 선수 16,155명 사전 생성 폐기 |
| 2 | **능력치 동거** | 선수 1명 = 1행: 정체성+팀+계약+능력치+XP. 능력치·XP는 JSON 1컬럼(스탯 추가 시 스키마 패치 불필요) |
| 3 | **Repository 계층** | 상태 IPC의 유일한 접점 = `npcRepo`/`seasonRepo`. 스토어는 repo 위 얇은 반응형 캐시. 게임 로직은 repo 커맨드만 호출 |
| 4 | **커맨드형 변이** | 이적/드래프트/FA/입대/은퇴 = 각 1개 repo 커맨드 → main 프로세스 SQLite **트랜잭션 1개**로 npc행+league_transactions 원자 처리 |
| 5 | **단일 IPC 채널** | `engine:call(fn, payload)` 하나로 Rust 호출 일반화. 6단계 등록 → 2단계(Rust 작성+빌드). main.cjs/preload/projectb.d.ts 대폭 축소 |
| 6 | **ID 정본** | `refs.json` 단일 출처. `PKT_*`/`CLUB_*` 제거. 부팅 시 무결성 assert(모든 team_id ∈ refs) |

- 원칙 1은 §2 Lazy 리그 활성화와 맞물림: 새 게임 = 반경 1 리그 로스터만 slot.db에 생성.
- 무결성 서명 범위를 npc 테이블 포함으로 확장.

### 8.3 데이터 수명주기 — 빌드타임 vs 런타임 (사전 생성 폐기 후)

**데이터는 딱 3종류만 존재한다:**

| 종류 | 저장소 | git 관리 | 수정 방법 |
|---|---|---|---|
| **① 정의 (콘텐츠)** | master.db (read-only) | O — 소스 JSON만 | staging/ → deploy (콘텐츠 전용) |
| **② 상태 (세이브)** | slot.db (슬롯별) | X | 런타임 repo 커맨드만 |
| **③ 파생 (캐시)** | 메모리 스토어 | X | 저장하지 않음 — ②에서 재계산 |

**① 정의(콘텐츠)에 남는 것**: 이벤트·메시지/결정 템플릿·밸런스·훈련·업적·학교·리그/팀 refs·**선수 생성 규칙**(generation_rules)·이름 풀·Named NPC 정의(CONTACT_*)
**①에서 사라지는 것**: `people_*.json`, `entities/players/*.json` 16,155개, `_index.json`, gen:npc → migrate:entities → build:masterdb 선수 파이프라인 전체

**선수 데이터의 생애 (전부 런타임)**:
```
새 게임      → Rust generate_league_roster(리그, 생성규칙, 이름풀, worldSeed)
              → slot.db npc INSERT (트랜잭션 1개)
              → Named NPC는 master.db 정의에서 슬롯으로 복사·소속 예약
매 시즌      → 신입생·드래프트 풀을 필요 시점에 Rust 생성 → npc INSERT
리그 활성화  → (ABL/JBL 진출 확정 시) 그 시점에 로스터 생성
수정/패치    → 생성 "규칙"을 고침 → 새 게임에 즉시 반영
              (생성 "결과물"을 스크립트로 사후 수정하는 패턴 금지)
```

**기존 문제 → 해소 매핑 (git 증거 기반)**:

| 반복된 문제 | 원인 | 새 구조에서 |
|---|---|---|
| `_index.json` 51회 · `_manifest.json` 49회 커밋 | 선수 16,155 JSON이 git 관리 파일 | 선수가 git에서 사라짐 — 커밋 대상은 규칙 JSON뿐 |
| fix-ages·rebalance_ovr·fix_*_names 등 사후 패치 스크립트 15+개 | 생성 결과물을 저장해두고 스크립트로 땜질 | 결과물이 없음 — 규칙 수정 = 패치 |
| master.db + overlay + npc_runtime 3자 병합 | 정적 베이스 + 슬롯 델타 이중 구조 | 슬롯 안에 전부 있음 — 병합 자체가 없음 |
| `migrate_team_ids.cjs` 류 ID 마이그레이션 | 생성 데이터에 구 ID가 박제 | refs.json 변경 → 새 게임에 자동 반영 |
| staging/deploy 선수·콘텐츠 혼용 혼동 | 같은 파이프라인 공유 | staging은 콘텐츠 전용으로 축소 |

**보완 장치**:
- `worldSeed`를 slot.db에 저장 — 동일 시드 = 동일 로스터 재현 (버그 리포트·디버깅용)
- 기존 `rebalance_ovr_distribution` 등이 하던 밸런싱은 **Rust 생성기가 처음부터 보장** (OVR 분포·포지션 비율·좌우투 비율을 generation_rules에 명시)
- 새 게임 직후 무결성 assert: 팀별 로스터 최소 인원·포지션 커버리지·refs 정합성 검증

### 8.4 세이브 파일 구조와 성적 관리

**세이브 = 슬롯당 SQLite 파일 1개** (`userData/saves/slot_<id>.db`)

- 현행 "단일 DB + 모든 테이블에 slot_id 컬럼" 구조 폐기 → 파일 1개 = 세이브 1개.
- 백업·공유·삭제 = 파일 복사/삭제. 슬롯 간 오염 원천 차단. 모든 쿼리에서 slot_id 조건 소멸.
- 슬롯 목록 화면: 각 파일의 `meta` 테이블만 읽어 표시.

**slot.db 내부 구성 (5그룹)**:

| 그룹 | 테이블 | 내용 |
|---|---|---|
| 메타 | `meta` | 세이브 버전·worldSeed·생성일·플레이 시간·현재 스테이지·무결성 서명 |
| 주인공 | `protagonist` (1행) | 정체성+능력치+XP+구종+계약+부상 (원 기획의 주인공 상세는 전부 유지) |
| 선수 | `npc` | 선수 1명 = 1행 (정체성·팀·계약·능력치 JSON·XP JSON·성격·부상). 생성 시 INSERT → 은퇴해도 행 유지(기록 보존) |
| 시즌(휘발) | `season_meta` / `schedule` / `standings` / `season_stats` / `pending_actions` | **당해 시즌만** — 시즌 종료 시 기록 그룹으로 압축 후 리셋 |
| 기록(영구) | `career_history` / `game_log` / `league_transactions` / `history_standings` / `history_leaders` | 누적 전용, UPDATE 없음 (append-only) |

**성적 데이터의 생애 (해상도별 보존 정책)**:

```
시즌 중   경기 시뮬 → season_stats 주간 누적 (반경 1 리그만 개인 성적 존재)
시즌 종료  ① 주인공: careerRecord 확정 — 시즌 라인 + 경기별 gameLog 전체 영구 보존
              (히스토리가 엔딩이라는 원 기획 코어 — 절대 압축하지 않음)
          ② Named NPC: career_history에 연도 라인(statLine + 요약 stats) 확정,
              경기별 로그는 폐기 (라인으로 압축)
          ③ 배경 NPC: 연도 라인만
          ④ 드리프트 리그: 개인 성적 자체가 없음 — 팀 순위(history_standings)
              + 시즌 종료 시 생성한 "리그 리더"(history_leaders, 연감/뉴스용)만
          ⑤ season_* 테이블 리셋 → 다음 시즌
```

**저장 시점 — "저장 버튼" 개념 변경**:
- repo 커맨드 = SQLite 트랜잭션 = **즉시 영속**. 주 진행 1회 = 커밋 1회. 별도 저장 절차 없음 → "저장 안 하고 종료해서 유실" 클래스 소멸.
- 수동 세이브 포인트가 필요하면 파일 복사 기반 체크포인트(`slot_1.db` → `slot_1.ckpt.db`).
- 자동 롤링 백업: 시즌 시작 시점마다 파일 복사, 최근 3개 유지.

**무결성/암호화**:
- 변조 감지(HMAC 서명, Rust)는 유지 — 주간 커밋마다 핵심 테이블 해시를 meta에 갱신.
- JSON 블롭 암호화(ChaCha20)는 블롭 폐기와 함께 종료. (현행도 npc_runtime 등 관계형 테이블은 평문이었음 — 보호 범위가 실질 확대되는 셈. 전체 DB 암호화가 필요해지면 추후 SQLCipher 검토)

---

## 9. 구조 부채 청산 목록

| # | 항목 | 조치 | 단계 |
|---|---|---|---|
| 1 | 레거시 `"pro"` CareerStage | 마이그레이션 후 타입 제거 | R3 |
| 2 | `NpcSaveState.pitching/batting` deprecated | R3 재구축에서 자연 소멸 (능력치 동거) | R3 |
| 3 | no-op `masterBulkUpsertEntities` 콜사이트 | 전면 제거 | R3 |
| 4 | `advanceWeek.ts` 3,599줄 단일 파일 | `weekPhases/` 파이프라인 분리 (training·academics·events·games·injuries·growth·market·digest) — 반경 게이트를 각 phase 입구에 구현 | R4 |
| 5 | `SchoolState` 프로 단계에도 세이브 포함 | 스테이지별 optional 서브스테이트 | R3 |
| 6 | `friendlyLog` 이중 관리 | `ScheduleEntry.isFriendly`로 통합 | R4 |
| 7 | `proTeamProfiles` 비저장 (로드마다 초기화) | 마스터 데이터로 정적 고정 | R3 |
| 8 | personality 호출 시점 해시 폴백 | NPC 생성 시점 확정·저장 (npc 행에 포함) | R3 |
| 9 | `KBL_FARM_MAP` 등 `PKT_*` 키 잔존 | R1에서 검증 후 refs 기반으로 교체 | R1 |
| 10 | 기획 문서 4곳 분산 | 본 문서로 통합, 00.Planning 아카이브 표기 | R0 ✅ |

---

## 10. 실행 로드맵 (개정 — 구 L1~L5 대체)

> 데이터 정본을 먼저 세운다. 깨진 저장 구조 위에 반경 게이트를 얹지 않는다.
> 단계·하위 작업 완료 시 이 체크리스트를 갱신한다 (세션 간 인수인계의 기준).

### R0. 설계 확정 ✅ (2026-07-02)

### R1. ID 정본화 ✅ (2026-07-02)
- [x] PKT_/CLUB_ 레거시 전수 조사 — Rust `kbl_farm_team` 죽은 조회 확정 (KBL 강등 버그)
- [x] Rust 팜맵 3개 → `farm_team()` 접미사 규칙(`TEAM_X_1→_2`) 통일 + 데드코드 `is_*_farm_team` 3개 삭제
- [x] TS `KBL/ABL/JBL_FARM_MAP` 삭제 (호출 0건) + 미사용 import 제거
- [x] `utils/ids.ts` 신설 — `clubToFirstTeam`/`farmTeamId`/`validateTeamRefs` (ID 파생 규칙 유일 위치)
- [x] gradeAdvance.ts CLUB_ 인라인 변환 3곳 → 헬퍼 교체
- [x] 부팅 무결성 assert — masterStore 로드 후 코드 팀 상수 ⊆ refs.json + 팜 규칙 검증 (104팀 사전검증 통과)
- 잔여: Rust 전역 처리부·db.cjs의 CLUB_ 방어 변환 각 1곳 — R3 클린 브레이크 시 자연 소멸

### R2. IPC 단일 채널화 ✅ (2026-07-02)
- [x] main.cjs: `engine:call(fn, payload)` 범용 핸들러 — 화이트리스트 = engine-native export 그 자체
- [x] Rust 순수 포워딩 핸들러 81개 제거 (92 → 28) — 잔여 28개는 DB·파일·스테이트풀(R3 이관 대상)
- [x] preload.cjs: 기존 메서드명 유지한 채 전부 engine:call 경유(호환 브릿지 81개) + `projectB.engine()` 제네릭 노출
- [x] projectb.d.ts: `engine(fnName, payload)` 타입 추가
- [x] CLAUDE.md "6단계" → **2단계**(Rust 작성 + build:native) 개정 — 신규 함수는 등록 자체가 불필요
- 콜사이트 0건 수정 (기존 `window.projectB.xxx()` 호출 전부 무변경 호환) — 회귀 리스크 최소화
- 예외 유지: `week:rollRandomBatch` (main에서 count 클램핑 검증), match:* (스테이트풀)

### R3. slot.db 재구축 (본체 — 클린 브레이크, 세이브 v3)

**R3a — 데이터 코어 (먼저, 단독 검증)**
- [x] 선행: §4.2 시뮬 범위 확정 — **B안** (Named 전 리그 주간, 합성 생성기)
- [ ] 신규 스키마: 파일=슬롯(`slot_<id>.db`), `npc` 단일 테이블(능력치·XP·폼 JSON 컬럼, is_named), `meta`(worldSeed·서명)
- [ ] Repository 계층 (`npcRepo`/`seasonRepo`) — 상태 쓰기의 유일 경로
- [ ] 커맨드형 변이: transfer/draft/signFa/enlist/discharge/retire/callup (각 1 트랜잭션)
- [ ] Rust `generate_league_roster` — Lazy 리그 로스터 생성 (규모: §7 확정치 — 고교 10·ABL 12)
- [ ] master_overlay.db 폐기 + game/season 블롭에서 npcs/npcLiveStats 제거
- [ ] 사전 생성 파이프라인 폐기: gen:npc·migrate:entities·entities/players/*·_index.json
- [ ] 레거시 `"pro"` careerStage 제거 + deprecated 필드 제거 + SchoolState optional화
- [ ] proTeamProfiles 마스터 정적화 + personality 생성 시점 확정
- [ ] 검증: 이적·드래프트·FA 결과가 npc 테이블/거래기록/화면 **3자 일치**

**R3b — 합성 주간 성적 생성기 (코어 검증 통과 후 착수)**
- [ ] Rust 시즌 궤적 생성 (worldSeed 결정적, 최종 라인 + 폼 곡선 + 결장 구간)
- [ ] 주간 값 = 궤적 보간 (Named 타 리그分 주간 처리에 연결)
- [ ] 합성 부상 = 궤적 결장 구간으로 표현
- [ ] 10시즌 분포 안정 검증 스크립트 (리그 ERA/OPS 분포 유지 확인)

### R4. advanceWeek 분해 + 반경 시뮬
- [ ] `weekPhases/` 8모듈 분리 (training·academics·events·games·injuries·growth·market·digest)
- [ ] 반경 게이트 — 비활성 리그 처리 스킵
- [ ] 순위표 드리프트 (Rust 신규, 주 1회 저비용)
- [ ] 고교 10팀 단일리그 전환 — A/B조·조추첨·조별 포스트시즌 로직 삭제
- [ ] friendlyLog → schedule 통합, 세이브 커밋 원자화 마무리

### R5. 시장 캐던스 + 마무리
- [ ] NPC 트레이드 연 2회(데드라인+오프시즌)·주인공 리그만 / 콜업 연 2회
- [ ] 팜 리그 경기 시뮬 제거 (명단만)
- [ ] 해외 리그(ABL·JBL) Lazy 게이트 + 진출 오퍼 연출
- [ ] PendingAction 16종 → 8종 통합
- [ ] 히스토리/인생 기록 화면 (원 기획 엔딩 본체 — §11 미결 구체화 후)

**각 단계 완료 기준**: auto-advance 3시즌 스모크 통과 + 세이브 로드 왕복 무결성 + (R3 이후) 이적·드래프트·FA 3자 일치.

## 11. 미결 사항

- [x] ~~배경 NPC 주간 시뮬 범위~~ → **B안 확정** (§4.2, 2026-07-02)
- [ ] npc 테이블 능력치 JSON 컬럼의 Rust 측 직렬화 규약 (serde camelCase 유지 여부) — R3a 설계 시 확정
- [ ] 합성 궤적 모델의 분포 파라미터 상세 (포지션별 폼 곡선 형태) — R3b 설계 시 확정
- [ ] 드리프트 리그의 시즌 종료 "리그 리더" 생성 규칙 상세 (합성 궤적과 통합 가능성 검토)
- [ ] 감정 시스템 dormant 재정의 (Named 타 리그 준활성) — R5
- [ ] 은퇴 후 인생 기록 화면 구성 (원 기획 07 계승 — 엔딩의 본체)
