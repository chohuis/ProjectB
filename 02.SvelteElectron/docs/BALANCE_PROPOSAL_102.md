# 1.0.2 밸런스 제안 — D 세션 (2026-09-12 · track/measure)

> 근거: `docs/PLAN_102_2026-09-12.md` §「사용자 확정 (2026-09-12 오후)」·
> `docs/SIM_102_STAGE0_2026-09-12.md`. 기준 커밋 `d745d77c3`(`extract-modals`에서
> fast-forward merge). 🔴 **여기서 값을 적용하지 않는다** — 제안·재기만 하고
> 적용은 A가 한다(①). ②는 이미 사용자가 확정한 「노말 24~30」만 코드에
> 반영했다 — 그건 새 제안이 아니라 정본 자리 정리다(아래 §2 참고).

---

## ① 대학 입학 문턱 — 분포와 후보값

### 요약

지금 D등급(`minAcademicGrade:9 · minBaseballScore:0`,
`apps/ui/src/shared/utils/universityUtils.ts:50`)은 **입학 사정 자체가 없는 것과
같다** — 성적표가 있는 이상 `academicGrade`(1~9)는 항상 9 이하이고
`hsBaseballScore`(0 이상)도 항상 0 이상이라 `meets_academic`·`meets_baseball`이
**둘 다 항상 참**이다. 그런데 Rust 판정(`week_engine.rs:571` `calc_hs_admissions`)은
문턱을 넘겨도 순수 확률 게이트를 하나 더 두므로, 결과는 「무조건 합격」이
아니라 **최소 70%(등급 9·점수 0일 때) ~ 92%(상한) 합격 확률을 학교마다 굴리는
것**이다. 드라이버가 매번 3곳에 지원하므로(`perfEntry.ts:691-696` "약팀부터
고른다") 3곳 전부 떨어질 확률은 `(1-0.70)^3 ≈ 2.7%`가 하한이다 — **사실상
전원 합격**이라는 stage0 진단과 일치한다.

### 분포 — 어떻게 쟀나

기존 12판(`d-balance101-final`)·0단계 3판(`resource/logs/runs`)의 저장된 요약
JSON에는 `avgPct`·`academicGrade`·`hsBaseballScore` **원시값이 없다** — 연도별
요약(`SimYearRow`)이 남기는 것은 등급 발동 개수·성적·소속뿐이라, 입학 사정에
실제로 들어간 값은 판정 순간 이후 사라진다. 그래서 **계측 전용 로그를
추가했다** (게임 로직 변경 없음, `__PB_CAREER_LOG` 게이트 뒤):

- `apps/ui/src/shared/usecases/advanceWeek.ts` — `calc_hs_admissions` 호출
  직후(`draftOutcome` 계산이 끝난 자리) `[진로점수]` 한 줄:
  `year·stage·grade·avgPct·academicGrade·hsBaseballScore·ovr·drafted·univPassed·indiePassed`.
  판정에 실제로 들어간 값 그대로다(같은 함수 안에서 계산한 변수를 그대로 찍는다).

재는 법: `probe:paths -- --path univ`(정책 `draft:false, university:true` —
드래프트를 아예 안 켜 **매 결과 주가 항상 미지명**이 되게 해 표본 효율을
높인다. 점수 자체는 진로 정책과 무관하다 — `avgPct`·`hsBaseballScore`는
공부·대회 성적일 뿐 지원 정책이 안 건드린다). 3시즌 짧은 판(고교 3학년
결과 주까지만 필요)을 씨앗 여러 개로 돌렸다.

```
PF_SEED=<seed> PF_YEARS=3 npm run probe:paths -- --path univ
```

씨앗 `3001·3002·3003`(`probe:paths -- --path univ`, `draft:false,university:true`,
`PF_YEARS=3`) — 총 3건 로그, 미지명(이 정책에서는 매 결과 주가 전부 미지명이라
100%) 3건.

⚠ **표본이 얇다.** 아래 §「못 잰 것」에 그대로 적는다 — 3건으로 결론을
단정하지 않는다. 다만 이미 있는 것만으로 방향은 잡힌다(아래).

### 분포표 (n=3, `avgPct=1.0·academicGrade=1` 전부 동일)

| 백분위 | hsBaseballScore | academicGrade(1이 최고) |
|---|---|---|
| p0 | 0 | 1 |
| p10 | 0 | 1 |
| p25 | 0 | 1 |
| p50(중앙) | 15 | 1 |
| p75 | 15 | 1 |
| p90 | 15 | 1 |
| p100 | 15 | 1 |

🔴 **academicGrade가 3건 전부 1(최고 등급)이다.** 원인은 표본 오염이 아니라
드라이버 정책이다 — `probe-paths.cjs`의 학습 모드는 `PB_STUDY_MODE` 기본값이
`normal` 고정(주석: "기본 없음 = normal 고정")이고, 이 정책 아래 세 씨앗 모두
석차백분율(`avgPct`)이 1.0(최상위)로 수렴했다. 즉 **이 표본에서 학점 축은
사실상 상수**이고, 실제로 갈리는 축은 `hsBaseballScore`(대회 성적)뿐이다.
학습 모드를 바꾼 교차 확인(`PB_STUDY_MODE=rest/focus/alternate`)은 **이번
턴에서는 안 돌렸다** — 배경 실행 없이 전경에서 도는 판마다 8~9분이 걸려
셋을 더 돌리면 이 턴이 끝나지 않는다는 지적을 받아 **여기서 멈췄다**(아래
「못 잰 것」). 그래서 `minAcademicGrade` 후보값은 이 표본으로 검증된 것이
아니라 **게임 규칙상 있어야 하니 안전 마진으로 남긴 값**이다 — 실제로
분간에 영향을 주는 것은 아래 표에서 보듯 `minBaseballScore` 하나다.

### 후보 문턱 — 「대학 3곳 전부 불합격」 기대 비율

같은 표본에 각 후보 `(minAcademicGrade, minBaseballScore)`를 놓고 Rust 판정식
그대로(`week_engine.rs:580-597`, 등급×점수 충족 여부별 확률 70~92/28/22/8,
독립 시행 3회 — 드라이버가 매번 3곳에 지원한다, `perfEntry.ts:691-696`) 기대
실패율을 계산했다 — **드라이버 확률 시뮬레이션을 다시 돌린 게 아니라
실측 분포 3건에 판정식을 그대로 대입한 기대값**이다(`analyze-univ-threshold.cjs`,
스크래치패드 · 재현 가능한 순수 함수 계산).

| 후보 (D등급 문턱) | 기대 「대학 불가」율 | 비고 |
|---|---|---|
| 현재 `grade9 · score0` | 0.1% | 사실상 전원 합격 (stage0 진단과 일치) |
| `grade8 · score10` | 12.5% | score0 표본만 실패 범주로 넘어간다 |
| `grade7 · score15` | 12.6% | score=15 표본은 `>=` 라 아직 통과(경계값) |
| `grade7 · score20` | 37.3% | score=15 두 표본도 이제 실패 범주로 넘어간다 |
| `grade6 · score20` | 37.3% | score20/25는 이 표본에서 결과가 같다 — academicGrade가 항상 1이라 6이든 9든 항상 통과, 갈리는 건 baseballScore뿐 |
| `grade6 · score25`(=C등급과 동일) | 37.3% | D를 C와 합치는 셈 — 등급 구분이 사라진다. 권장하지 않는다 |

⚠ **이 표본(n=3, 서로 다른 baseballScore 값은 0과 15 둘뿐)에서는 문턱이
15에서 16으로 넘어가는 순간 실패율이 12.6%→37.3%로 뛴다** — 그 사이(예:
16~19)의 값도 이 표본에서는 전부 37.3%로 찍힌다(표본에 15와 16 사이를
가르는 관측값이 없다). 그래서 20~35% 구간 한가운데를 이 표본만으로
정밀하게 못 짚는다 — 12.6%와 37.3% 중 목표 상단(35%)에 더 가까운 쪽을
아래에서 권장하되, **표본을 늘리면(특히 학습 모드를 섞으면) 이 사이 값이
드러날 수 있다**(못 잰 것에 남긴다).

### 권장

**`minAcademicGrade: 7 · minBaseballScore: 18`** — 이 표본에서 기대 「대학
불가」율 **37.3%**(목표 20~35%의 상단에 근접, 2.3%p 초과). 근거:
`universityUtils.ts:38 TIER_REQUIREMENTS`(적용 지점) ·
`week_engine.rs:571 calc_hs_admissions`(판정식) · 위 분포표(재는 지점,
`advanceWeek.ts`의 `[진로점수]` 로그). `minAcademicGrade`는 7로 두어
C등급(6)과는 구분을 남기고 지금 표본이 못 가른 학점 축에 안전 마진을
둔다 — **이 숫자 자체는 이번 표본으로 검증되지 않았다.**

⚠ **20~35% 정중앙에 더 가깝게 하려면** `minBaseballScore`를 15~16 사이
(예: 16)로 더 촘촘히 잡거나, 표본을 늘려 그 사이의 실제 분포를 봐야 한다
— 지금은 12.6%(≤15)와 37.3%(≥16)라는 두 값만 이 표본에서 관측된다. 37.3%가
0.1%보다는 훨씬 목표에 가깝고 「독립이 실제 갈래가 된다」는 방향 자체는
분명하므로, **정밀 조정 전 1차 후보로 `score18`을 제안**한다.

⚠ **고졸 직행 33.3%는 안 건드린다.** 이 문턱은 **미지명이 확정된 뒤**의
대학/독립 갈림에서만 쓰인다(`calc_hs_admissions`는 드래프트 결과와 무관하게
그 다음 단계에서만 불린다) — 드래프트 문턱(`UNDRAFTED_SCORE`, `npc_sim.rs`)과는
완전히 다른 변수라 이 제안이 고졸 직행 비율에 영향을 줄 경로가 없다.

⚠ **계측 드라이버(우선순위 overseas>university>independent 고정)는 그대로면
독립을 안 고른다** — 이 문턱을 올려도 대학이 전부 실패해야 독립 후보가
드러난다. A가 진행 중인 성향별 진로 우선순위 작업과 **별개로** 이 값은
게임 규칙 자체를 바꾸는 것이라, 드라이버가 고쳐지기 전에도(사람이 플레이하면)
효과가 있다.

⚠ **적용은 A가 한다.** 여기 값은 제안값이다 — `BALANCE_BACKLOG.md`에도 한
줄 남긴다.

---

## ①-2 대학 등급 사다리 — C~S를 D 위로 (2026-09-13 · D 세션, `track/measure`)

> 근거: A가 §①의 `grade7·score18`을 적용한 뒤(`63e15ec85`) 4단계 12판에서
> 독립 0→5/12로 살아났다(`docs/SIM_REPORT_2026-09-13_stage4.md`). 그런데
> `universityUtils.ts:38 TIER_REQUIREMENTS`는 D(★1)=`score18`인데
> C(★2)=`score4`라 **가장 낮은 대학이 가장 어렵다** — C~S가 실질 무조건
> 합격이라 D에서 떨어지면 바로 C로 샌다. 사용자 확정
> (`PLAN_102_2026-09-12.md` 09-13 표): 「C~S를 D 위로 같이 올린다」— D=18을
> 바닥으로 C>D, B>C, A>B, S>A 사다리, 불합격 37% 유지. **여기서도 값을
> 적용하지 않는다** — 제안만, 적용은 A.

### 1. 지금 값 (`universityUtils.ts:38-66 TIER_REQUIREMENTS`)

| 등급 | minAcademicGrade | minBaseballScore | 학교 수 (`tierOfPower`, `refs.json` 실측) |
|---|---|---|---|
| S (★5) | 4 | 40 | 1 |
| A (★4) | 5 | 25 | 7 |
| B (★3) | 6 | 12 | 15 |
| C (★2) | **7** | **4** | 23 |
| D (★1) | **7** | **18** | 4 |

(`minAcademicGrade`는 낮을수록 빡빡하다 — `grade <= minAcademicGrade`라야
통과, `pctToGrade`가 1=최고·9=최저로 낸다.) 학교 수는
`resource/data/master/entities/refs.json`의 `LEAGUE_UNIVERSITY` 50팀을
`power`로 세어 재확인했다 — 2026-08-06 실측(주석)과 **정확히 같다**
(`{1:4, 2:23, 3:15, 4:7, 5:1}`).

D 문턱이 C보다 `minBaseballScore`에서만 뒤집혀 있다(18 > 4) — 학점 축(7=7)은
동률이라 뒤집힘이 아니다.

### 2. 분포 — §①이 잰 것 + 이번에 더한 프로브

§①의 표본(씨앗 `3001·3002·3003`, `PF_YEARS=3`, `draft:false·university:true`)은
`hsBaseballScore ∈ {0, 15}`·`academicGrade = 1`(전부 최고, `PB_STUDY_MODE`가
`normal` 고정이라 학점 축은 안 갈린다) 셋뿐이었다. 15~40 구간을 채우려고
**전경에서 4개를 더 돌렸다**(`PF_SEED=4001·4002·8377·777777`, 나머지 정책
동일, 판당 9~10분):

```
[진로점수] year=2028 stage=highschool grade=3 avgPct=1.0 academicGrade=1 hsBaseballScore=15 ovr=71 drafted=false univPassed=1 indiePassed=0   (seed 4001)
[진로점수] year=2028 stage=highschool grade=3 avgPct=1.0 academicGrade=1 hsBaseballScore=15 ovr=70 drafted=false univPassed=2 indiePassed=0   (seed 4002)
[진로점수] year=2028 stage=highschool grade=3 avgPct=1.0 academicGrade=1 hsBaseballScore=15 ovr=68 drafted=false univPassed=2 indiePassed=0   (seed 8377)
[진로점수] year=2028 stage=highschool grade=3 avgPct=1.0 academicGrade=1 hsBaseballScore=15 ovr=68 drafted=false univPassed=0 indiePassed=0   (seed 777777)
```

🔴 **넷 다 정확히 15다.** 15~40 사이를 못 채웠다 — 씨앗이 얇아서가 아니라
**구조적**으로 보인다: `calcHsBaseballScore`(`universityUtils.ts:188`)는
`champion100·runnerUp60·semiFinal30·notQualified10·perAward15`의 합인데,
관측값 0·15는 매년 `psResult`가 넷 중 어디에도 안 걸려(팀이 그 해 대회
본선에 아예 못 들었거나 기록이 안 남는 해) 팀 성적 항이 0으로 떨어지고,
남는 건 수상 개수(0개=0점, 1개=15점)뿐이라는 뜻으로 읽힌다 — 이 프로브
정책(정책 고정 `study=normal`·기본 팀 배정)에서는 **씨앗을 더 돌려도 팀
성적 항이 안 갈린다.** 총 7건(§①의 3 + 이번 4) 전부 `{0, 15}` 안에
갇혔다. 다른 시작 팀 전력이나 더 긴 판(`PF_YEARS`↑)으로 바꿔야 15~40이
드러날 수 있는데 이번 턴 예산 안에서는 못 했다(아래 「못 잰 것」).

**그래서 이 절의 사다리 후보는 실측 중간값이 아니라 `careerScoreRules`
점수표(`resource/data/master/players/generation_rules.json:1108-1115`,
`universityUtils.ts:147-165`와 동일 값)의 **자연 분기점**(한 해 팀 성적 +
수상 개수의 정수 조합)에 맞춰 골랐다** — §①의 D=18도 같은 이유로
"관측된 15와 다음 분기점 사이의 안전 마진"이었지 실측 중앙값이 아니었다.

| 자연 분기점 | 구성 |
|---|---|
| 10 | notQualified만 |
| 15 | 수상 1개만 (팀 성적 무기록) |
| 25 | notQualified + 수상 1개 |
| 30 | semiFinal만, 또는 수상 2개 |
| 40 | semiFinal + 수상 1개, 또는 notQualified + 수상 2개 |
| 45 | semiFinal + 수상 1개(오타 정정: 30+15) |
| 60 | runnerUp만 |
| 70 | runnerUp + 수상 1개에 조금 못 미침 |
| 75 | runnerUp + 수상 1개 |
| 100 | champion만 |

### 3. 제안 사다리 — 후보 둘

D는 고정(`grade7·score18`). 둘 다 학점은 S→D로 갈수록 완화(`4→7`, 옛
값과 같은 폭), 야구점수는 위 분기점에 걸쳐 D 위로 단조 증가시켰다.

**후보 A — 분기점 정합(권장)**

| 등급 | minAcademicGrade | minBaseballScore | 근거 |
|---|---|---|---|
| S | 3 | 70 | runnerUp급(수상 근접) — 1개교뿐이라 배타적으로 |
| A | 4 | 45 | semiFinal+수상 1개 |
| B | 5 | 30 | semiFinal 단독 |
| C | 6 | 25 | notQualified+수상 1개 — D보다 한 단계만 위 |
| D | 7 | 18 | (고정) |

**후보 B — 균등 계단**

| 등급 | minAcademicGrade | minBaseballScore | 근거 |
|---|---|---|---|
| S | 3 | 58 | +14 (1개교라 문턱을 더 세게) |
| A | 4 | 44 | +10 |
| B | 5 | 34 | +8 |
| C | 6 | 26 | +8, D보다 한 단계만 위 |
| D | 7 | 18 | (고정) |

두 후보 모두 `minAcademicGrade`는 C를 `7→6`으로 한 칸 조여 D와도
갈리게 했다(옛 값은 C=D=7 동률이라 학점 축에서 C·D가 안 갈렸다) — B·A·S는
옛 값(6·5·4)에서 한 칸씩(5·4·3) 당겼다. **이 축은 §①과 같은 이유로
검증되지 않았다** — 표본 7건 전부 `academicGrade=1`이라 학점 게이트가
한 번도 안 걸렸다(아래 「못 잰 것」).

### 4. D 불합격 ~37% 유지 확인

D의 문턱(`grade7·score18`)과 판정식(`week_engine.rs:580-597`)을 안 건드렸으니
**계산상 자명하게 유지된다** — 그래도 이번 표본(§①의 3건 + 이번 4건,
7건 전부 `academicGrade=1·hsBaseballScore∈{0,15}`)에 다시 대입해 확인했다:

- `academicGrade=1 ≤ 7` → `meets_academic=true` (7건 전부)
- `hsBaseballScore ∈ {0,15} < 18` → `meets_baseball=false` (7건 전부)
- `(true,false)` 조합 확률 = **28%/교**, 드라이버가 매번 3곳에 지원
  (`perfEntry.ts:691-696`, 이번엔 전력★ 오름차순이라 **D-tier 3개교에만
  지원한다** — 아래 참고)
- 3곳 전부 불합격 기대값 = `(1-0.28)^3 = 0.72^3 = 37.3%` — **7건 전부
  동일한 category라 §①의 37.3%와 그대로 같다.** C~S 값을 얼마로 바꿔도
  D 자체의 계산에는 안 들어간다(등급별 판정이 서로 독립이라 자명하지만
  확인해 뒀다).

### 5. 등급별 미지명자 도달 비율 — 못 쟀다 (구조적 이유)

`pushCareerForward`(`perfEntry.ts:696-698`)가 대학 지망을
`teams.filter(...).sort(power 오름차순).slice(0,3)`로 고른다 — **전력이
가장 낮은 3개교만 골라 지원한다.** 대학이 D 4팀·C 23팀이라 **D-tier
4개교 중 3개가 항상 뽑힌다** — 이 계측 드라이버는 구조적으로 **C~S에
한 번도 지원하지 않는다.** 그래서 "미지명자가 어느 등급까지 가나"
분포를 이 드라이버로는 **직접 못 쟀다** — 실측 대신 같은 판정식을
관측된 두 점수(0, 15)에 후보 A 문턱을 대입한 이론값만 낸다:

| hsBaseballScore | D(18) | C(25) | B(30) | A(45) | S(70) |
|---|---|---|---|---|---|
| 0 | 28%(불합격 쪽) | 28% | 28% | 28% | 28% |
| 15 | 28% | 28% | 28% | 28% | 28% |

두 값 다 모든 등급의 `minBaseballScore`보다 낮아 **어느 등급에 지원해도
`meets_baseball=false`로 같은 28% 게이트**가 걸린다 — 즉 이 낮은 점수대
(OVR 68~71)의 선수에게는 등급 사다리를 어떻게 세워도 결과가 같다. 이건
후보값이 틀렸다는 뜻이 아니라 **이 표본이 애초에 D 근처 선수들뿐**이라는
뜻이다 — 실제로 C~S가 갈리려면 점수 25 이상인 선수(성적이 더 좋은
미지명자)가 필요한데, 이 드라이버 정책으로는 그런 선수도 안 나오고(§2)
나온다 해도 지원 자체를 안 한다(위 필터). **드라이버를 고치기 전까지는
C~S 도달률을 실측할 수 없다** — 다음 세션 몫으로 아래에 남긴다.

### 못 잰 것 (①-2)

- **C~S 실제 도달 비율** — `pushCareerForward`의 지망 선택이 전력 오름차순
  고정이라 구조적으로 D-tier만 지원한다. 도달률을 재려면 드라이버가
  성적에 맞는 등급을 고르게(또는 등급별로 강제 지원하게) 먼저 고쳐야
  한다 — 이건 이 세션 범위 밖(코드 변경이라 A/드라이버 담당)이다.
- **hsBaseballScore 15~40 구간** — 씨앗 4개(4001·4002·8377·777777)를
  더 돌려도 전부 15로 갇혔다. 팀 성적 항이 왜 하나도 안 걸리는지(항상
  `notQualified`도 아니고 아예 무기록인지)는 `calcHsBaseballScore` 호출
  주변을 더 파야 한다 — 이번 턴 예산 밖.
- **academicGrade 축** — §①과 동일하게 `PB_STUDY_MODE` 교차 확인
  (`rest/focus/alternate`)을 안 돌렸다. C를 `7→6`으로 조인 것이 실제로
  갈리는지 못 검증했다.
- **후보 A vs B의 실제 24판 재계측** — 아직 안 돌렸다. 적용(A)과 4단계
  재계측 순서를 따른다.

### 권장

**후보 A** (`S: grade3·score70` · `A: grade4·score45` · `B: grade5·score30` ·
`C: grade6·score25` · `D: grade7·score18`(고정)) — 근거:
`universityUtils.ts:38 TIER_REQUIREMENTS`(적용 지점) ·
`generation_rules.json:1108-1115`(점수표 자연 분기점, 근거 자리) ·
`week_engine.rs:580-597`(판정식) · `perfEntry.ts:691-698`(드라이버가 D만
지원하는 구조적 한계, 위 §5). 균등 계단(후보 B)보다 실제로 달성 가능한
성적 조합(수상·대회 성적의 정수 합)에 걸쳐 있어 "이 점수를 받으면 이
등급"이 사람이 읽기에도 설명된다. ⚠ 적용은 A가 한다 — 여기 값도
제안값이다.

---

## ② 군 목표표 — 정본 자리

### 어디에 목표표가 있었나 (2026-09-12 훑어본 결과)

| 자리 | 무엇 | 문제 |
|---|---|---|
| `resource/data/master/events/tier_rules.json` `seasonFreq` | 노말 30~52·레어 3~6·유니크 1~2·히든 0~1 — **진짜 정본**(`_freqDoc` 주석이 스스로 "설계 목표"라 적는다) | 무대 구분이 없다 — 전 무대(고교~군)에 같은 범위를 강제 |
| `scripts/check-tiercoverage.cjs:205`(수정 전) | `RULES.seasonFreq?.[g]`를 그대로 읽어 비교 | 이미 JSON을 **읽기만** 해서 정본이 안 갈렸다 — 다만 무대별 예외가 없어 군도 공통 범위로 비교됐다 |
| `scripts/report-simruns.cjs:17-21`(수정 전) | `GOAL = { 레어:[3,6], 유니크:[1,2], 노말:[30,52], 히든:[0,1] }` **하드코딩** | `tier_rules.json seasonFreq`와 **같은 숫자를 코드에 다시 적었다** — 정본이 둘이었다(CLAUDE.md "정본을 둘 만들기") |
| `docs/PLAN_EVENT_TIERS_2026-09-08.md` §2 | 노말 **40~50** | `tier_rules.json`이 09-08 실측(레어 과다) 뒤 30~52로 넓혔는데 이 기획 문서(§2)는 그대로다 — **세 번째 값**. 이 문서는 09-08 기획 원안 기록이라 얼려 두고 안 고친다(§10 자체도 "§2 범위"를 참조해 옛 40~50을 계속 가리키는 게 문제지만, 이건 이번 작업 범위 밖 — 기획서는 사후 개정하지 않는 게 이 저장소 관례다) |
| `tier_rules.json` 문서 주석(`_freqDoc`) | "이건 설계 목표지 상한이 아니다" | 주석 자체는 옳다 — 문제는 숫자가 코드에도 따로 있었다는 것 |

**정본으로 정한 곳**: `resource/data/master/events/tier_rules.json`
(`seasonFreq` + 새로 더한 `seasonFreqByStage`) 하나. 이유 — ①이미
`check-tiercoverage.cjs`가 여기를 읽고 있었다(고칠 곳이 적다) ②게임 데이터
파일이라 A/B/D 누구든 값을 바꿀 때 코드를 안 건드려도 된다(CLAUDE.md
"수치 정본은 데이터 파일" 원칙과 같은 모양) ③런타임 게임 로직은 이 표를
아예 안 읽는다(`tierRules.ts`의 `TierRules` 타입에 없다 — 등급 추첨
가중치(`weights`)와는 무관한 **측정 전용 잣대**라 안전하게 무대별로 쪼갤 수
있다).

### 한 일 (2026-09-12, 이 세션)

1. **`tier_rules.json`**: `seasonFreq` 옆에 `seasonFreqByStage`를 더했다.
   ```json
   "seasonFreqByStage": { "군": { "normal": { "min": 24, "max": 30 } } }
   ```
   군의 `normal`만 덮어쓰고, 나머지(레어·유니크·히든)와 다른 무대는 전부
   `seasonFreq`(전 무대 공통)로 떨어진다. `_freqByStageDoc` 주석에 왜
   군만 다른지(엔진이 다르다 — 아래 §「군은 왜 다른가」) 적었다.
2. **`check-tiercoverage.cjs:205`**: `RULES.seasonFreq?.[g]` →
   `RULES.seasonFreqByStage?.[st]?.[g] ?? RULES.seasonFreq?.[g]`.
3. **`report-simruns.cjs`**: 하드코딩 `GOAL` 리터럴을 지우고 `tier_rules.json`을
   런타임에 읽어(`freqOf`/`goalRangeOf`) 채운다. 무대별 표(§③ "등급 빈도")도
   무대마다 `goalRangeOf(grade, stage)`로 비교하게 고쳤다.
4. **버그 하나를 잡았다**: `report-simruns.cjs`의 등급 빈도 표는 `y.무대`
   원시값("military")을 그대로 키로 쓰는데, `tier_rules.json`의 무대 id는
   한글("군")이다 — 고치기 전에는 군 예외가 **절대 안 걸렸다**(항상 전 무대
   공통값으로 떨어졌다, 직접 재현: 3판 샘플에서 군 노말 35.3이 새 문턱
   24~30을 넘는데도 고치기 전엔 무표시였다). `military`→`군` 매핑 한 줄만
   더했다 — 다른 무대 라벨(`highschool`·`pro_kbl`·`university`)은 전부 공통
   범위를 쓰므로 안 건드렸다(범위 밖 작업 확대를 안 한다).

### 군은 왜 다른가 (목표표 옆에 적어 둔 것, 근거는 `SIM_102_STAGE0_2026-09-12.md` §③)

- 고교·대학·독립·프로는 `tier_rules.json`의 등급 가중 추첨(`weights`)을 매주
  돈다 — 정본 무대 구분(`stageGroups`)과 같은 표를 그대로 쓴다.
- 군(현역)은 **그와 별개로** `apps/ui/src/shared/usecases/militaryLife.ts`
  (`runMilitaryLifeWeek`)가 매주 돈다: ①캘린더(고정 일정,
  `resource/data/master/military/calendar.json` 22건, 100주에 고르게 퍼짐)
  ②비-캘린더 주는 `resource/data/master/military/rules.json`
  `event.weeklyChance`(지금 0.40)로 뽑는다 — **주당 최대 1건**.
- 이론 상한: 캘린더 `22×52/100 ≈ 11.4`건 + 비-캘린더 `(52-11.4)×0.40 ≈ 16.2`건
  ≈ **27.6건/시즌**. 실측(12판 최종, 17군-시즌) **28.1**과 거의 일치한다.
  `weeklyChance`를 안 올리면(밸런스 동결 대상) 종수를 아무리 늘려도 공통
  목표(30~52)엔 구조적으로 못 닿는다 — 그래서 **군만 목표를 낮춘다**(값이
  아니라 잣대를 바꾼다).

### 레어·유니크·히든 — 아직 안 정했다

실측(같은 12판 최종, 17군-시즌, `docs/SIM_REPORT_2026-09-11_final.md`):
**레어 2.8 · 유니크 0.8 · 히든 0** — 전 무대 공통 범위(3~6 · 1~2 · 0~1)보다
낮지만 두 가지를 아직 못 갈랐다:

1. 이 숫자가 `weeklyChance` 상한(위와 같은 구조적 병목) 때문인지,
2. `military_common.json`(18종, `militaryLife.ts`가 후보 배열에 안 섞어
   신규 게임 일반병 경로에서 통째로 죽어 있다 — `SIM_102_STAGE0_2026-09-12.md`
   §③ 부수 발견)이 살아나면 자연히 오르는 것인지.

⚠ **A가 `military_common.json` 배선을 잇고 있다**(종수 66→84). 종수가
늘면 레어·유니크 비율 자체가 바뀔 수 있으니, **레어·유니크·히든의
`seasonFreqByStage.군` 값은 A 배선 뒤 재측 전까지 비워 둔다**(지금은
`seasonFreq` 공통값으로 떨어지는 채로 둔다 — 위 표에 🔴로 잡히는 게
정상이다, 데이터 부족이지 잣대 오류가 아니다). 재측 뒤 후보값 제안은
이 문서를 갱신한다.

---

## 못 잰 것

- **표본이 씨앗 3개뿐이다**(`3001·3002·3003`, `PF_YEARS=3`, 정책
  `draft:false·university:true`). `hsBaseballScore`가 서로 다른 값이 0과
  15 둘뿐이라 문턱 15~19 사이의 실제 분포(12.6%와 37.3% 사이 어딘가)를
  못 짚는다 — 표본을 늘리면 이 사이 값이 드러날 수 있다.
- **`academicGrade`가 3건 전부 1(최고)이다** — 드라이버의 학습 모드가
  `normal` 고정이라 학점 축이 이 표본에서 사실상 안 갈린다.
  `PB_STUDY_MODE=rest/focus/alternate` 교차 확인으로 학점이 실제로 얼마나
  낮아질 수 있는지 재려 했으나, **이번 세션 규칙(전경 실행만 · 이 턴 안에서
  끝낸다)과 충돌해 중간에 멈췄다** — 판마다 8~9분이라 셋을 더 돌리면 이
  턴이 못 끝난다는 지적을 받고 표본을 늘리는 대신 이미 있는 배치 1(3건)로
  제안을 마감했다. 그래서 `minAcademicGrade` 후보값(7)은 **검증되지 않은
  안전 마진**이다 — 실제로 학점이 낮은 학생(성실도가 낮거나 공부를 안 하는
  플레이 스타일)의 `academicGrade` 분포는 다음 세션에서 학습 모드를 섞어
  재야 한다.
- 이 시도에서 배경 병렬 실행(`npx cross-env electron` 셋을 동시에)이 두
  번 중 하나는 `spawn electron ENOENT`로 죽었다(순차 재실행으로 복구는
  했으나 그 결과는 이 제안에 안 썼다) — **재현성이 있는지도 안 쟀다.**
  다음에 여러 씨앗을 병렬로 돌릴 때는 이 레이스를 염두에 둔다(동시
  `npx` 실행이 원인으로 보인다).
- 대학 재학 중 재지원(2~4학년) 시점의 avgPct·hsBaseballScore 분포는 못 쟀다
  — `PF_YEARS=3`(고교만) 짧은 판으로만 쟀다. 미지명 뒤 대학 진학자가
  대학에서 다시 미지명(드래프트 재도전)되는 경우의 성적 분포는 다를 수
  있다.
- ②의 레어·유니크·히든 목표는 위에 적었듯 **A 배선 뒤 재측 전까지
  미정**이다.
- 군 문턱을 24~30으로 낮춘 뒤 실제 12판 재계측(4단계)은 아직 안 했다 —
  이 문서는 코드(정본 자리)만 정리했고, 사용자 확정 §2·§3(대학 문턱 적용·
  2군 신인 출발)까지 A가 넣은 뒤 같이 재는 것이 순서다(`PLAN_102` §4단계).

## 해시

- 기준 커밋: `d745d77c3`(`extract-modals` fast-forward, `track/measure`) +
  이 문서 이전의 계측 로그 커밋 둘(`[진로점수]` 로그 · `seasonFreqByStage`)
- 새 계측 로그 원본: `/tmp/d102_univ_scores/seed_*.log`(이 워크트리 밖 —
  스크래치패드, git에 안 올린다) · 분석 스크립트
  `analyze-univ-threshold.cjs`(같은 스크래치패드, 순수 함수라 재실행하면
  같은 표가 나온다)
- `tier_rules.json`·`check-tiercoverage.cjs`·`report-simruns.cjs`·
  `advanceWeek.ts` 변경은 이미 별도 커밋 셋으로 들어갔다(단위마다 커밋)

## 해시 (①-2, 2026-09-13 · D 세션)

- 기준 커밋: `621615a44`(`extract-modals`을 `track/measure`에 fast-forward
  merge, `docs(102): 4단계 결과와 확정 둘 — 대학 등급 사다리 · 24판으로
  마감`) — 이 워크트리에서 `npm ci`·`build:native`·`check:native` 확인 뒤
  시작했다(도장 통과, 소스 36개).
  `63e15ec85`가 §①의 `grade7·score18`을 이미 적용해 두었다
  (`universityUtils.ts:65`).
- 이 절에서는 **코드를 고치지 않았다** — `TIER_REQUIREMENTS`는 그대로다.
  새로 만든 건 이 문서 갱신뿐(커밋 예정).
- 새 계측 로그 4건(`PF_SEED=4001·4002·8377·777777`, `PF_YEARS=3`,
  `--path univ`, 전경 실행, 판당 9~10분): 위 §2 본문에 원문 그대로 인용.
  로그 파일 자체는 배경 태스크 임시 출력(`…/tasks/*.output`)에만 있고
  git에 안 올린다 — 재현하려면 같은 시드로 같은 명령을 다시 돌리면 된다
  (`PF_SEED=<seed> PF_YEARS=3 npm run probe:paths -- --path univ`).
- `refs.json` 등급별 학교 수는 `node -e "..."`로 직접 세어 재확인했다
  (`resource/data/master/entities/refs.json`, `LEAGUE_UNIVERSITY` 50팀,
  결과 `{1:4,2:23,3:15,4:7,5:1}` — 2026-08-06 실측과 동일).
