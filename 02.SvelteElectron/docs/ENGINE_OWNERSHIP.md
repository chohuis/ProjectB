# 계산은 어디서 하는가 — 감사와 이관 계획 (2026-08-28)

CLAUDE.md의 아키텍처 원칙:

```
apps/ui/         화면 렌더링, 입력값 전달만.  게임 로직·Math.random() 금지
apps/desktop/    DLL 로드, IPC, 파일 I/O
engine-native/   게임 본체 — 로직·난수·암호화 전부
```

**전수 감사 결과: 구조는 대체로 지켜지고 있다.** Rust 26,414줄 · export 122개.
경기 시뮬·성장·드래프트·FA·재정·일정이 전부 Rust다. TS usecases 12,500줄은
대부분 오케스트레이션(Rust 호출 + 저장)이다.

다만 **네 부류의 누수**가 있었다.

## ✅ 고침 — A. 값을 지어내던 자리

```
applyGameOutcome.ts   er = 피안타 × 0.35   ← 연습경기 갈래
MatchPage.svelte      runsAllowed = 피안타 × 0.35
```

엔진이 실제 자책점을 아는데 TS가 어림수를 만들었다. 그 값이 ERA·경력 기록·
계약 평가로 들어간다.

🔴 **같은 역산이 세 곳이었고 하나만 고쳐져 있었다.** 정식 경기 갈래는 진작
`outcome.earnedRuns`를 쓰고 있었고 주석에 실측 ERA 14.78까지 적어 뒀는데,
연습경기와 경기 화면은 그대로였다. 이 저장소에서 되풀이되는 형태다.

## ✅ 고침 — B. 규칙이 두 벌이던 자리

투수 승패 판정(W·L·SV·HD·ND). `npc_sim`의 **클로저 안에 갇혀 있어서**
TS가 손으로 옮겨 적었고, 그 사본이 **이미 갈라져 있었다**:

| | Rust | TS 사본 |
|---|---|---|
| 세이브 조건 | `is_closer && margin <= SAVE_MAX_MARGIN` | `margin <= 3 && outs >= 1` |
| 여유 점수 | `tuning::SAVE_MAX_MARGIN` | `3` 하드코딩 |

**주인공만 다른 승패 규칙**을 쓰고 있었다. 그 값이 다승왕 집계로 들어간다.

→ `decide_pitcher`를 자유 함수로 꺼내고 `calc_pitcher_decision_native`로
내보냈다. TS는 부르기만 한다. `engineOwnership.test.ts`가 사본 복귀를 막는다.

## ⏳ 남음 — C. `Math.random()` 6건

```
MatchPage:962         roll < 0.86 → HIT_SINGLE      안타 종류 분포가 TS에
MatchPage:1261/1274/1343   좌타 32%                  타자 손 결정
NewGamePage:296/302   잠재력 80~99 · 성장률 73~88    주인공 생성이 TS에
```

⚠ **`NewGamePage` 둘이 더 무겁다.** `roster_gen.rs`가 NPC를 만드는데
**주인공만 TS에서 만든다** — 분포가 다를 수 있고 그건 밸런스 문제다.

⚠ **경기 화면은 먼저 조사해야 한다.** Rust에 `sim_half_inning`·
`sim_until_entry`·`should_protagonist_exit`·`auto_mound_visit`가 **있는데
아무도 안 부른다.** 왜 안 쓰는지(성능? 연출? 미완성?) 모르고 옮기면
경기 화면이 깨진다.

## ⏳ 남음 — D. 산식이 TS에 있는 유틸

| 파일 | 무엇 | Rust 짝 |
|---|---|---|
| `top10Engine.ts` (289줄) | 유망주 점수 `ovr×0.8 + scout×0.2` · ERA·K9 환산 | 없음 |
| `rosterEngine.ts` (557줄) | 피로·휴식 보정 `baseOvr × fatF × restF` | 일부 `npc_sim` |
| `universityUtils.ts` | 계약금 `(ovr−45)×220` · 팀★ 문턱 | 없음 |
| `academicsEngine.ts` (266줄) | 학점·시험 산식 | `campus_events.rs` 일부 |

`careerSummary.ts`는 표시용 포맷이라 TS가 맞다.

## ⚠ 예외로 남긴 것 — 성장 xp 진행바

`training.ts`가 `xp_threshold(v) = 7.5 + v * 0.35`를 옮겨 적었다.
**표시용 진행바라 렌더마다 IPC를 태울 수 없다.** 사본을 남기되
`engineOwnership.test.ts`가 두 값이 어긋나면 잡는다.

## 부수 발견 — 안 불리는 Rust export 8개

```
sim_half_inning · sim_until_entry · should_protagonist_exit · auto_mound_visit
encrypt_save · decrypt_save · compute_save_sig · verify_save_sig
```

앞 넷은 위 C의 조사 대상이다.
뒤 넷은 **세이브 무결성(HMAC)** — CLAUDE.md에 "v3 미구현"이라 적혀 있는데
**Rust엔 있고 아무도 안 쓴다.** 배선만 하면 된다.

## 이관 순서

원칙: **값을 지어내는 것 → 두 벌인 것 → 난수 → 산식 이동.**
뒤로 갈수록 밸런스가 움직인다.

| 단계 | 무엇 | 밸런스 | 상태 |
|---|---|---|---|
| 1 | 자책점 역산 제거 | 안 움직임 | ✅ 2026-08-28 |
| 2 | 승패 판정 합치기 | 안 움직임 | ✅ 2026-08-28 |
| 3 | 주인공 생성을 `roster_gen`으로 | **움직임** — NPC와 분포 비교 필요 | ⏳ |
| 4 | 경기 화면 난수 | **움직임** — 먼저 "왜 Rust를 안 쓰는가" 조사 | ⏳ |
| 5 | 산식 유틸 이동 (D) | **움직임** — 건마다 전후 실측 | ⏳ |
| 6 | 세이브 무결성 배선 | 무관 | ⏳ |
