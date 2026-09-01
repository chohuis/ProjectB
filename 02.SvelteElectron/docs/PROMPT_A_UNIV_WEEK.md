# A 트랙에 넘기는 프롬포트 — 대학 학년 축이 시즌과 20주 어긋난다

> 아래 `---` 사이를 그대로 A 세션에 붙여넣는다.
> 실측 기록은 [TRACK_B_FINDINGS.md](TRACK_B_FINDINGS.md) 에 있다.

---

대학 이벤트 113종 중 **29종만 화면에 닿는다(26%)**. 무대 중 가장 낮다.
원인을 끝까지 팠는데 **B 데이터로는 못 고치는 자리**라 넘긴다.

## 1. 증상 — 대학만 유독 낮다

`npm run measure:slotreach -- --path univ` (씨앗 20260803 · 3시즌 · 156주)

```
  무대       재고   닿음  안뽑힘  못닿음   비율
  고교        155    124     12     19    80%
  대학        113     29     10     74    26%   ← 최악
  전체공용     17      9      2      6    53%
```

⚠ 3시즌만 돌아 Y4 구간을 못 지난 몫이 섞여 있다. **그런데 Y1 도 못 닿는다** —
`UNIV_Y1_W01_ORIENTATION` · `UNIV_Y1_W08_LEAGUE_ADAPT` · `UNIV_Y1_W12_MIDTERM` ·
`UNIV_Y1_W24_TRAINING_BLOCK`. Y1(1~52)은 156주 안에 확실히 지나므로
**시즌 길이 문제가 아니다.**

## 2. 대학 이벤트는 두 축의 격자다

대학 mandatory 26종이 **학년 × 시즌주차** 로 짜여 있다.

```
  week_eq  universityWeek   id
        1  1~52            Y1_W01_ORIENTATION      once_per_career
        1  53~104          Y2_W01_SEASON_OPEN
        1  105~156         Y3_W01_SEASON_OPEN
        1  157~            Y4_W01_FINAL_YEAR_OPEN
       12  ×4 학년                                 MIDTERM
       24  ×4 학년                                 TRAINING_BLOCK
       50  ×3 학년                                 YEAR_WRAP
```

⚠ **고교는 `grade` 를 쓰는데 대학은 `school.universityWeek` 누적 주차를 쓴다.**
방식이 다르다 (고교 155종 중 grade 조건 84종 · 대학 113종 중 0종).

## 3. 🔴 원인 — 진학이 시즌 W32 라 축이 20주 밀린다

`academicsState().univWeek` 을 매주 찍었다 (경로 univ · 씨앗 20260803):

```
  연도  시즌주차  universityWeek
  2028       32             0     ← 진학 순간
  2028       52            20
  2029        1            21
  2029       52            72
  2030        1            73
```

**`universityWeek` 의 원점이 진학 시점**이라 시즌 경계와 안 맞는다.
그래서 **한 시즌이 두 학년 띠를 가로지른다:**

```
  연도    시즌W1의 uw   시즌W52의 uw   그 해의 학년띠
  2028         -31            20     진학(W32~) ~ Y1
  2029          21            72     Y1 ~ Y2     ← 한 해가 두 학년
  2030          73           124     Y2 ~ Y3
  2031         125           176     Y3 ~ Y4
  2032         177           228     Y4
```

### 결과 ①  Y4 4종은 4년제로는 영영 못 뜬다

4학년 띠(`uw 157~`)에 들어가려면 **진학 후 5번째 시즌(2032)** 이 필요하다.
대학은 4년인데 축으로는 5시즌이 걸린다.

```
  Y4_W01_FINAL_YEAR_OPEN   week_eq  1 ∧ uw 157~    시즌W1의 uw = 21·73·125·177
  Y4_W12_MIDTERM           week_eq 12 ∧ uw 157~    → 177 은 5번째 시즌
  Y4_W24_TRAINING_BLOCK    week_eq 24 ∧ uw 157~
  Y4_W50_CAREER_GATE       week_eq 27 ∧ uw 157~
```

### 결과 ②  Y1~Y3 는 **엉뚱한 해에** 뜬다

조건이 성립하는 해는 있는데 학년이 안 맞는다.

```
  Y1_W12_MIDTERM   week_eq 12 ∧ uw 1~52   →  2029년(진학 2년차)에 uw32 로 성립
```

**1학년 중간고사가 2학년 때 온다.** 조건은 참인데 이야기가 틀린다.

## 4. ⚠ `a5408f5bc` 의 실측을 다시 읽어야 한다

A 가 `pushCareerForward` 순서를 고치고 이렇게 적었다:

> 전 `universityWeek` 최대 **52** (1년) / 후 최대 **176** (3.4년)
> — 4학년 구간(157주~)에 들어갔다

**176 은 2031년 시즌 W52 다.** 위 표에서 그 해는 **Y3~Y4 경계**이고,
4학년 구간에 "들어간" 게 아니라 **그 해 끝에서야 157 을 넘긴 것**이다.
Y4 이벤트들은 `week_eq 1·12·24·27` 이라 **그 해 앞부분에서 걸리는데
그때는 아직 uw 125~148 이라 Y3 다.**

고침 자체는 맞다 — 진급이 도는 건 확인됐다. **읽은 결론만 한 칸 어긋났다.**

## 5. 고치는 길 셋 — ②를 권한다

| 안 | 내용 | 소유 | 평가 |
|---|---|---|---|
| ① | uw 띠를 20 밀어 정렬 (Y1 21~72 · Y2 73~124 …) | B | ✗ "1학년=1~52" 라는 뜻이 깨지고, `HS_CAREER_HUB_WEEK` 이 바뀌면 또 어긋난다 |
| **②** | **진학 시 uw 를 다음 시즌 W1 에 맞춰 정렬** | **A** (`game.ts`) | **근본. 두 축이 맞는다** |
| ③ | `week_eq` 를 버리고 uw 단일 축으로 (26종) | B | ✗ 같은 이유로 진학 주차에 다시 묶인다 |

**②가 근본인 이유**: `universityWeek` 이 "대학에서 보낸 주" 가 아니라
**"학년 안에서의 주"** 가 되어야 두 축이 맞는다. 지금은 진학 시점이 축의
원점이라 매년 20주씩 어긋나고, 진학 주차 상수가 바뀌면 다시 깨진다.

### 손댈 자리

```
  apps/ui/src/shared/stores/game.ts:256    universityWeek: 0        진학 시 초기값
  apps/ui/src/shared/usecases/advanceWeek.ts:639   isUniversity ? +1  매주 증가
  apps/ui/src/shared/utils/seasonWeeks.ts:37       HS_CAREER_HUB_WEEK = 28
```

⚠ **유급 처리를 같이 봐라.** `game.ts:1817` 이 유급 시 `universityWeek - 52`
로 되돌린다 — 정렬을 바꾸면 이 계산도 따라가야 한다.

⚠ **졸업 판정도 이 축을 읽는다** — `careerDecision.ts:83` `isUniversityFinalYear`.

## 6. 고친 뒤 이걸로 확인해라

```bash
npm run measure:slotreach -- --path univ
```

통과 기준:

```
  대학 닿은비율이 26% 에서 오른다
  못닿음 목록에서 UNIV_Y1_* 넷이 빠진다
  UNIV_Y4_* 넷이 4년 안에 후보에 오른다 (시즌을 4 이상 돌려야 보인다)
```

⚠ `measure:slotreach` 는 기본 3시즌이다. Y4 를 보려면 시즌 수를 늘려야 한다.

⚠ **계측 10개 중 8개가 `university: false` 다.** 대학 경로가 대부분의 계측에서
빠져 있다 — `measure-eventfunnel` 도 그렇다. 그래서 이 어긋남이 오래 안 보였다.
`measure:slotreach --path univ` 만 대학을 탄다.

---
