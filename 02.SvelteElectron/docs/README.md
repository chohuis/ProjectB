# docs/ 색인 — 무엇이 어디에 (2026-09-12)

> 108장 · 34,000줄. **찾을 수 없으면 없는 것과 같다** — 그래서 이 한 장이 있다.
> 규칙: **정본은 하나.** 같은 주제의 문서가 여럿이면 여기서 「정본」이라 적은 것만 믿는다. 나머지는 그 정본이 나오기 전의 기록이다.
> 파일명의 날짜는 **쓴 날**이지 유효 기간이 아니다. 유효한지는 이 색인의 칸으로 본다.

---

## 0. 지금 어디인가 — 먼저 여는 셋

| 문서 | 무엇 |
|---|---|
| **`PROGRESS_TREE.md`** | 🔴 **현황판 정본.** 세션별 · 결정 · 해시. OP 만 고친다 |
| **`PLAN_102_2026-09-12.md`** | 🔴 **앞으로의 계획 정본.** 1.0.1 마감 · 1.0.2 B 축 · 사용자 확정 |
| **`PROJECT_ASSESSMENT_2026-09-11.md`** | 프로젝트 평가 — 아홉 기준 · 종합 3.7 · 개선 열둘 |

---

## 1. 규칙 — 어떻게 일하나

| 문서 | 무엇 | 상태 |
|---|---|---|
| `../CLAUDE.md` | 코드 규칙 (806줄 · ⚠ 규칙과 역사가 섞여 있다 → 개선 11) | 정본 |
| `../../CLAUDE.md` | 작업 대상은 `02.SvelteElectron/` 하나 · `04.GodotOnePitch/` 는 읽기만 | 정본 |
| `TEAM_RULES.md` | 세 트랙 공통 규칙 (09-01) | 정본 · 세션 구성은 그 뒤 바뀜(→ `PROGRESS_TREE` 「세션 구성」) |
| `DATA_POLICY.md` | 데이터 관리 규약 — `resource/data/master/**` 를 어떻게 다루나 | 정본 |
| `ENGINE_OWNERSHIP.md` | 계산은 어디서 하는가 — TS 와 Rust 의 경계 | 정본 |
| `STEAM_DEPOT.md` | Steam 디포 — 올릴 때 보는 한 장 | 정본 (빌드 전 작성) |

## 2. 설계 정본 — 「이렇게 돈다」

바뀌면 **여기를 고친다.** 코드가 이 문서와 다르면 둘 중 하나가 틀린 것이다.

| 주제 | 정본 | 함께 볼 것 |
|---|---|---|
| **소식 갈래** (이벤트 / 안내 / 통지) | `PLAN_MESSAGE_LANES_2026-09-08.md` | 규칙 한 줄: 주사위가 부른 것은 상태를 못 바꾼다 |
| **이벤트 등급** (노말·레어·유니크·히든) | `PLAN_EVENT_TIERS_2026-09-08.md` | 적용 결과 `EVENT_TIERS_APPLIED_2026-09-08.md` · 재고 `EVENT_INVENTORY_2026-09-08.md` |
| **등급별 보상** | `PLAN_REWARDS_2026-09-09.md` | 구종은 유니크부터 · 배우는 중이냐로 갈린다 |
| **등급이 화면에 어떻게 보이나** | `TIER_PRESENTATION_2026-09-11.md` | 실제 이벤트 다섯으로 |
| **계측 보고서 서식** | `PLAN_SIM_REPORT_2026-09-09.md` | 한 해 한 줄 · 판마다 JSON |
| 투수 보직 (감독 추천·선택) | `PLAN_ROLE_RECOMMEND.md` | 실측 `ROLE_ASSIGNMENT_2026-09-03.md` |
| 주인공 계약 조건 | `PLAN_CONTRACT_TERMS.md` | — |
| 소식 대시보드 | `PLAN_MESSAGE_DASHBOARDS.md` | 표시 형태 전수 `MESSAGE_KINDS_DISPLAY_2026-09-03.md` |
| 현역 복무 (병영 생활) | `PLAN_MILITARY_LIFE.md` | 코드 명세 `MILITARY.md` · 문안 검토 `MILITARY_COPY_REVIEW_2026-09-03.md` |
| 시즌 캘린더 | `CALENDAR_V2.md` | — |
| 로스터 · 선수 경력 | `PLAN_ROSTER_CAREER.md` | 경로 전수 `ROSTER_FLOWS_2026-09-03.md` · NPC 이력 검토 `NPC_HISTORY_REVIEW_2026-09-03.md` |
| 리그·구단 제도 · 구단 깊이 | `PLAN_LEAGUE_SYSTEMS.md` · `PLAN_CLUB_DEPTH.md` | — |
| 해외 진출 | `PLAN_OVERSEAS.md` | — |
| 골든글러브 (수비 기록) | `PLAN_GOLDEN_GLOVE.md` | — |
| 구종 학습 안내·경고 | `PLAN_PITCH_LEARNING_2026-09-04.md` | 1.0.2 이후 |
| 경기 엔진 | `PLAN_ENGINE_COMPLETE.md` → 결과 `ENGINE_COMPLETE_RESULT.md` | 닫힘 (08-30) |

## 3. 밸런스 — 값은 어디서 오나

| 문서 | 무엇 | 상태 |
|---|---|---|
| **`BALANCE_BACKLOG.md`** | 🔴 **밸런스 정본.** 제안값 + 근거 + 「못 쟀다」. 값을 바꾸면 여기 적는다 | 정본 |
| `BALANCE_PROPOSAL_101.md` | 5단계 제안 — 안건 아홉 · 전후 실측 · 사용자 확정 | 1.0.1 닫힘 |
| `BALANCE_BASELINE_101.md` | 1.0.1 단계 0 기준선 (여섯 절) | 1.0.1 「전」 값 · ⚠ ⑭ 이후 값은 다르다(머리말) |
| `BALANCE_BASELINE_2026-09-05.md` · `_09-02` · `_09-01` · `_08-30` | 그 전 기준선들 | 옛 것 — `_101` 이 대신한다 |
| `BASELINE_2026-08-20.md` | 02 로 되돌린 날의 기준선 | 옛 것 |

## 4. 계측 · 실측 보고

| 문서 | 무엇 | 상태 |
|---|---|---|
| **`SIM_REPORT_COMBINED_2026-09-11.md`** | 🔴 **계측 종합** — 세 판과 그 사이에 무엇이 고쳐졌나 · 잣대가 먼저 틀린 아홉 번 | 정본 |
| `SIM_REPORT_2026-09-11_final.md` | 12판 최종 — 1.0.1 의 값 | 정본 |
| `SIM_REPORT_2026-09-10_12run_pair.md` | 12판 짝 — 도구 고친 뒤 · 밸런스 전 | 기록 |
| `SIM_REPORT_2026-09-10_30run.md` | 30판 — 도구 고치기 전 (⚠ 값을 믿지 마라) | 기록 |
| `CONTENT_DEAD_SLOTS_2026-09-09.md` | 죽은 칸 아홉 — 있는데 안 사는 것 · 살아 있는 것도 적음 | 1.0.2 입력 |
| `CONTENT_REVIEW_2026-09-04.md` | 콘텐츠 점검 — 1.0.1 에서 채울 것 | 1.0.1 닫힘 |
| `EVENT_UNREACHED_2026-09-03.md` | 못 닿는 이벤트 판정표 | 1.0.1 에서 처리 |
| `AUDIT_STAGES_2026-08-31.md` · `AUDIT_SYSTEMS_2026-08-31.md` | 무대별 기능 감사 · 시스템 연결 감사 | 기록 |
| `BUILD_ARTIFACTS_2026-09-04.md` | 생성물 전수 조사 (포장 제외 검사의 근거) | 기록 |
| `PARK_CLIP_2026-08-29.md` | 경기 화면 구장 잘림 — 원인 분석 | 닫힘 |
| `USER_TEST_CHECKLIST_2026-09-04.md` | v1.0.0 직접 테스트 확인 목록 | 1.0.0 |
| `EYECHECK.md` · `TRACK_C_EYECHECK.md` | 눈확인 목록 | C 절차 |

## 5. 출시

| 문서 | 무엇 |
|---|---|
| `PATCH_NOTES_v1.0.0.md` | v1.0.0 기능 목록 (PDF 는 `pdf/`) |
| `PLAN_RELEASE_2026-09-28.md` | 출시 계획 — 9/28 Steam (09-02 작성) |
| `PLAN_FIX_100_2026-09-06.md` | 1.0.0 수정 다섯 — 닫힘 |
| `PLAN_101_2026-09-06.md` · `TODO_101_2026-09-04.md` · `PLAN_CONTENT_101_2026-09-04.md` | 1.0.1 계획 셋 — **전부 닫힘** (결과는 `PROGRESS_TREE`) |

## 6. 인계 (HANDOFF) — 세션 사이의 편지

**끝난 인계도 지우지 않는다** — 「왜 그렇게 했나」가 거기 있다. 다만 **지금 살아 있는 것**만 읽으면 된다.

| 문서 | 방향 | 상태 |
|---|---|---|
| `HANDOFF_A_TO_B.md` | A → B · 9차 | 🟢 **살아 있음** — B 가 다음 턴(히든 구종 `steps`)에 읽는다 |
| `HANDOFF_C_TO_A.md` · `HANDOFF_A_TO_C.md` | C ↔ A · 19차/8차 | 🟡 쉬는 중 — 1.0.2 3단계에서 다시 |
| `HANDOFF_B_TO_A.md` | B → A · 5차 (09-02) | ⚪ 끝남 |
| `HANDOFF_OP_TO_A.md` · `_TO_D.md` · `_TO_S.md` | OP → 각 세션 첫 장 (09-03) | ⚪ 끝남 · S 는 폐지됨 |
| `PROMPT_A_UNIV_WEEK.md` · `PROMPT_A_PARK_CLIP.md` | A 에게 넘긴 프롬프트 | ⚪ 끝남 |
| `TRACK_B_PROMPT.md` · `TRACK_C_PROMPT.md` · `track-B-events.md` | 트랙 첫 프롬프트 (09-01) | ⚪ 끝남 · 규칙은 `TEAM_RULES` 로 |
| `TRACK_B_FINDINGS.md` · `TRACK_C_*.md` (HISTORY_TAB · HISTORY_AUDIT · ENDING_DESIGN · BACKLOG_456 · SVELTECHECK) | 트랙별 기록 | ⚪ 끝남 |

## 7. 옛 것 — 읽어도 되지만 믿지 마라

**02 로 되돌린 날(08-20) 이전** 또는 그 뒤 곧 대체된 것. 지금 코드와 다를 수 있다.

| 문서 | 무엇 | 왜 옛 것인가 |
|---|---|---|
| `RESUME.md` · `RESUME_NEXT.md` · `STATUS_2026-09-03.md` · `STATUS_2026-09-03_pm.md` | 그때의 「어디까지 왔나」 | `PROGRESS_TREE` 가 대신한다 |
| `BACKLOG.md` (07-30) · `BACKLOG_2026-08-24.md` | 그때의 남은 일 | `PLAN_102` · `BALANCE_BACKLOG` 가 대신한다 |
| `PLAN_FEATURES_2026-09-02.md` · `PLAN_A_MIGUHYEON.md` · `PLAN_C_BOWAN.md` | 무대×기능 · 미구현 · 보완 계획 | 1.0.0 에서 처리됨 |
| `EVENT_PLAN_2026-08-25.md` · `EVENT_PLAN_2026-08-28.md` · `EVENT_REPORT_2026-08-25.md` · `EVENT_SLOT_LOOP.md` · `EVENT_VOCABULARY.md` · `EVENT_DEFERRED.md` | 등급 체계 **이전**의 이벤트 정비 | `PLAN_EVENT_TIERS` 가 대신한다 |
| `PLAN_SCREENS_SCOUTING.md` | 화면 붙이기 (08-30) | 붙었다 |
| `DOC_MISMATCH_2026-09-03.md` | 문서 간 불일치 | 그때 고쳤다 |
| `AUDIT_2026-07.md` · `PHASE8_PLAN.md` · `PLAN_PHASE9_12.md` · `QA_TEST_BRIEF.md` · `TRAINING_ANALYSIS.md` | 7~8월 | Phase 체계는 끝났다 |
| `data-architecture-proposal.md` · `event-system-plan.md` · `EVENT_DATA_OPERATION_GUIDE.md` · `ROADMAP_M1_M2_M3.md` · `PROJECT_STATUS.md` · `TEST_SCENARIOS.md` · `UNIVERSITY_FLOW_QA.md` | 4~6월 (일부 영어) | 첫 석 달의 것 |

→ 이 절의 문서는 `docs/archive/` 로 옮길 후보다. 옮기기 전에 **다른 문서가 이름으로 가리키는지** 훑는다(`PROGRESS_TREE`·`CLAUDE.md` 가 옛 문서를 참조한다).

## 8. 하위 폴더

| 폴더 | 무엇 |
|---|---|
| `pdf/` | 사용자에게 준 PDF (12장) — md 를 못 보는 사람용 |
| `screens/` | 눈확인 스크린샷 (34장) — `cNN-*.png` 는 C 눈확인 번호 |
| `design/` · `mock/` | 화면 설계 · 목업 |
| `reports/` · `tools/` | 보고서 산출물 · 문서 도구 |

---

## 이름 규칙 (앞으로)

- **정본은 날짜를 안 붙인다** (`BALANCE_BACKLOG.md` · `DATA_POLICY.md` 처럼). 날짜가 붙은 건 **그날의 기록**이다.
- 새 문서를 만들면 **이 색인에 한 줄 더한다.** 안 더하면 없는 문서다.
- 정본이 바뀌면 옛 정본을 지우지 말고 **§7 로 내린다.**
