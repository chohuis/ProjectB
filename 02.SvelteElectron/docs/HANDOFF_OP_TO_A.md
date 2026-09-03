# OP → A 인계 (2026-09-03 · 새 A 세션 첫 장)

> A 는 엔진·세계·계측·빌드·**Rust 전부**를 맡는다. 워크트리 `C:\Users\cho\Desktop\ProjectB\ProjectB-engine\02.SvelteElectron` · 브랜치 `track/engine` (의존성·`.node` 준비됨). 병합은 OP 가 트렁크(`extract-modals`)에서 한다 — A 는 자기 브랜치에만 커밋하고 끝나면 OP 에 알린다.
> 순서·상태의 정본은 [PROGRESS_TREE.md](PROGRESS_TREE.md) "1.1 첫 묶음 — 사용자 확정 표". 규칙은 `CLAUDE.md` 전부 + 아래 §0.

## §0 A 가 지킬 것
- 밸런스 값은 **제안값**으로 넣고 실측 뒤 OP 를 통해 사용자에게 묻는다. 한 번에 하나만 움직여 전후를 잰다(씨앗 3 · 각 3회).
- Rust 를 고치면 `npm run build:native` 뒤 `.node` 시각·크기를 확인한다. `Finished in 0.10s` 는 캐시다. 전자가 `.node` 를 잡으면 EPERM — 계측을 먼저 내린다.
- electron 은 앱 기준 동시 3 (A 는 2 까지 · B·C 가 하나씩 쓴다). `DRIVE_USER_DATA=1`. `Math.random()` 금지 · 검사에 정규식 금지 · 파일은 Write/Edit.
- 트렁크를 먼저 당긴다(`git merge extract-modals`). 다른 세션 파일을 건드리지 않는다.

## §1 오늘(09-03) OP 가 A 몫으로 해 둔 것 — 이어받는 자리
| 커밋 | 무엇 | 남은 것 |
|---|---|---|
| 0ae9b586d | **A① 보직 적합도 산식** — Rust `pitcher_role.rs`(cargo 7) · 규칙 `pitcherRoleRules`·`rosterOpsRules.bullpenSize`(제안값) · TS 재료 `utils/pitcherRoleRules.ts`(vitest 12) | `recommendRole()` 교체·`master.ts` prime 은 OP 가 C⑤ 뒤 커밋 |
| 00db08993 · 59f493a2f | **A② 고교 엔진** — `MatchStartOptions` 넷(투구수 상한 override · 선발 아웃 계수 · 마무리 문 · 의무 휴식) · 오프너 삭제 · 규칙 `starterPitchLimit` 95 / `starterOutsFactor` 0.80 / `closerGate` 8회(전부 제안) · cargo 54 | 호출부 셋 배선(`matchLeagueOptions.ts`)은 OP 가 C⑤ 뒤 커밋 |
| 3d17e8ad8 | napi 선언 · `measure:role` 새 산식 표 | — |

## §1-b 09-04 00:0x — D 실측(track/measure 병합 326a7fc9a)이 연 A 일감 · 이 순서로

1. **🔴 `check:protransition` 빨강** — 씨앗 20260802 · 5시즌 헤드리스에서 고교 3학년(2028)에 멈춰 드래프트에 못 간다. 스크립트 주석은 "이 씨앗은 2029 지명"이라 적혀 있다. 로그 `resource/logs/d-regress/check_protransition_retry2.log`(D 워크트리 · 미추적). 가설부터 재라: A② 고교 엔진(선발 상한·마무리 문·휴식)이나 보직 선택 소식(`__PB_ROLE_CHOICE` 미응답 → 진행 멈춤?)이 의심 1순위. 원인·전후 한 줄.
2. **묶음 3·4 마무리·커밋**(진행 중이던 것 · 미커밋 7).
3. **단위 20 재확인** — D 덤프(NPC_HISTORY_REVIEW "D 실측" · `scripts/probe-npc-dump.cjs`): 새 게임 NPC 5,798명 중 29세+ 군필 84.4%(규칙 100%) · 33세+ 계약 3년 이상 57% · 36세+ 2년 이상 73%. 초기 생성 경로(리그별 생성기 · 외국인 · 독립리그)가 새 규칙(`contractYearsMaxByAge` · 병역 나이 채움)을 안 타는 자리를 찾아 고치고 같은 덤프로 전후를 잰다.
4. **단위 17 재회 훅 배선** — 12종은 풀(`events/conditional/`)에 있으나 도달 0/12(D ffe0a00ed · `probe:paths --path mil` PF_YEARS=12). 전역 뒤 주간 이벤트 뽑기가 `weeksSinceDischarge`·`unitmate` 조건 풀을 안 본다(A 트리 14 「⬜ 재회 훅」). 배선 뒤 같은 명령으로 12종 중 몇이 닿는지 재라(문턱 값은 안 고침 · 백로그).

## §2 A 의 첫 일감 (순서대로)
1. **주인공 자신의 등판 기록이 없다** (결함 · A② 실측에서 드러남). `applyGameOutcome.ts` 는 상대 선발·불펜 컨디션만 `pitcherConditions` 에 쓰고 **주인공(`protagonist.id`)은 안 쓴다** → `leagueState[lid].playerConditions[protagonist.id]` 가 늘 비어 있어 예전 불펜 의무 휴식 검사(`advanceWeek.ts` 2963 `myCondR`)도, 새 `restGuard`(`utils/matchLeagueOptions.ts`)도 재료가 없다. 주인공이 던진 경기(`outcome.pitchCount > 0`)마다 `{ fatigue, lastPitchedWeek, lastPitchedDate: gameDate, lastPitchCount: outcome.pitchCount, pitchOutsLast, consecutiveAppearances }` 를 두 갈래(친선·자동 · 201줄·449줄 근처) 모두에 쓴다. 검사 + 실측(`scratchpad/probe-hs-closer.cjs` 의 `휴식재료` 가 0 → N).
2. **마무리 등판당 이닝이 이상하다** — 아래 §3 표에서 마무리 정책인데 등판당 2.7~3.2 이닝, 최대 88구. 9회 진입이면 나올 수 없는 값이다. `match:autoFinishFromEntry` 가 내는 `outsRecorded`·`pitchCount` 가 주인공 몫인지(팀 나머지 이닝을 세는지), `role: "CP"` 인데 진입 판정이 CloseGame 인지(`create_initial_match_state` 의 `entry_trigger`), 고교(`isProtagonistGame` 전부)에서 CP 가 어느 경로로 들어가는지 코드로 확인하고 고친다. 고치기 전에 재현부터(3회).
3. **A③ 추천 분포 재측정** — `npm run measure:role` 의 "새 산식 추천" 표: 고교 102팀 × 유형 4 에서 **선발 추천 0팀**(중계 61~102 · 마무리 0~41). 원인은 새 게임 주인공 구종이 1개(패스트볼 1등급)라 구종 비중 20% 인 선발 적합도가 5점쯤 낮은 것. 사용자 결정 전 실측 셋을 준비한다: (a) 지금 값 · (b) `pitcherRoleRules.weights.SP.arsenal` 0.20→0.10(스태미나·제구에 얹음) · (c) 습득중(1등급) 구종을 0.5 개로 세기. 표(유형 × SP/RP/CP 팀 수)를 OP 에 넘긴다 — **값은 사용자가 정한다.**
4. **§6-1-5 전후 실측 마무리** — §3 표를 씨앗 3(20260802 · 777 · 31337)으로 채우고, 1·2 를 고친 뒤 다시 잰다. 지표: 마무리 시즌 등판 수 · 선발 평균 이닝·투구수 · 불펜 이닝 합 · 콜드게임 비율.
5. 그 뒤 A④(불이익 depthFactor) · A⑤(인센티브 문턱·금액 계측 §7-1) — 표 순서대로.

## §3 오늘 실측 (씨앗 20260802 · 고교 1시즌 · `scratchpad/probe-hs-closer.cjs` · 요청만 덮어 단계별)
| 단계 | 정책 | 경기 | 등판 | 등판당 이닝 | 투구 평균/최대 |
|---|---|---|---|---|---|
| 0 기준(상한 105 · 계수 1 · 문 없음) | 마무리 | 22 | 8 | 2.75 | 42 / 88 |
| 1 상한 95 | 마무리 | 32 | 9 | 2.67 | 39 / 88 |
| 2 + 계수 0.80 | 마무리 | 35 | 12 | 1.75 | 31 / 89 |
| 3 + 문 8회 | 마무리 | 23 | 9 | 3.22 | 50 / 87 |
| 0 기준 | 선발 | 21 | 21 | 5.92 | 87 / 88 |
| 2 계수 0.80 | 선발 | 17 | 17 | 5.31 | 85 / 89 |
- 선발 계수 0.80 이 이닝을 −10%(5.92→5.31) 줄인다. 상한 95 는 선발 투구수에 거의 안 걸린다(소프트캡 근처 88구에서 이미 내려온다).
- 마무리 등판은 8→12(계수) 로 늘지만 이닝 값이 의심스럽다(§2-2). 경기 수가 판마다 다른 것(22~35)은 대회 진출 차이 — 같은 씨앗인데 흔들리는 이유도 같이 본다.
- 의무 휴식 재료는 **전 판 0** (§2-1).

## §4 관련 문서
[PLAN_ROLE_RECOMMEND.md](PLAN_ROLE_RECOMMEND.md) §2·§3·§6-1·§7 · [PLAN_CONTRACT_TERMS.md](PLAN_CONTRACT_TERMS.md) §5-3·§7-1 · [ROSTER_FLOWS_2026-09-03.md](ROSTER_FLOWS_2026-09-03.md) · [BALANCE_BASELINE_2026-09-05.md](BALANCE_BASELINE_2026-09-05.md)
