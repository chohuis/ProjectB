# A 트랙에 넘기는 프롬포트 — 경기 화면 (구장 잘림 + 알 표식)

> 아래 `---` 사이를 그대로 A 세션에 붙여넣는다.
> 근거는 [PARK_CLIP_2026-08-29.md](PARK_CLIP_2026-08-29.md)에 있다.

---

경기 화면에 결함 둘이 있다. 트랙 B가 계측만 했고 **코드는 안 고쳤다.**
고치는 건 그쪽 몫이다. 계측은 `02.SvelteElectron/scripts/parkclip/`에 넣어 뒀다 —
어느 워크트리에서든 돌고, dev 서버를 안 띄운다(`file://` + Edge).

# A. 구장 아래가 잘린다 — 홈플레이트·포수·타자가 안 보인다

## A-1. 먼저 알 것 — 이미 한 번 고쳤는데 안 들었다

커밋 `c6b3671ce` "fix(match): 타자·포수가 잘리던 것 — 뷰포트 높이가 서지 않았다"
(2026-08-28)가 **같은 증상을 고치려 한 것**이고 `BaseballField.svelte`의
`.viewport`에 경위가 길게 적혀 있다. **그 고침이 안 듣고 있다.**

`height: 100%` → `aspect-ratio` + `max-height: 100%`로 바꿨는데
**`max-height: 100%`가 한 번도 적용된 적이 없다.**
주석에 적힌 "좁고 높은 창에서 넘치는 걸 막는 안전망"은 실재하지 않는다.
**주석을 믿지 말고 재라.**

## A-2. 증상 — 실측 560건 (구장 28 × 해상도 10 × 오른쪽칸 2)

```
  해상도        비고            구장 높이   아래 잘림   보이는 비율
  ──────────────────────────────────────────────────────────────
  1366x768     노트북             478.2      72.7      84.8%
  1280x720     FHD @150%          357.0       0.0     100.0%   ← 유일한 예외
  1536x864     FHD @125%          569.5      92.9      83.7%
  1600x900     창모드 최소         603.8     100.6      83.3%
  1707x960     QHD @150%          661.3     113.6      82.8%
  1920x1080    FHD @100%          775.5     139.1      82.1%
  1920x1200    16:10              775.5      50.3      93.5%
  2048x1152    QHD @125%          844.2     154.5      81.7%
  2560x1440    QHD @100%         1119.0     216.2      80.7%
  3840x2160    4K @100%          1806.0     370.3      79.5%
```

- **아래만 잘린다.** 560건 전부 `cutTop`·`cutLeft`·`cutRight`가 0
- 1920x1080에서 보이는 viewBox는 **0~758**(전체 920). 홈플레이트가
  pro 800 · university 825 · highschool 799라 **세 티어 다 그 아래**다
- **잘리는 px는 구장 28종이 전부 같다.** 다른 건 뭐가 잘려나가는지다 —
  대학 구장이 홈플레이트가 25px 아래라 **26px 더 깊게** 잘린다

## A-3. 원인 — 사슬 네 마디 (1920x1080 실측)

```
  요소                  폭 x 높이       max-height   overflow
  ─────────────────────────────────────────────────────────────
  scene-panel          1101 x 670.4    none         hidden    ← ④ 여기서 자른다
  scene-layout         1075 x 622.4    none         visible
  field-stage-wrap      843 x 622.4    none         visible   ← 여기까진 맞다
  wrapper               843 x 775.5    auto         visible   ← ② 여기서 터진다
  viewport              843 x 775.5    100%         hidden    ← ③ 안 먹는다
```

① `MatchPage.svelte` `.field-stage-wrap { align-items: start }`
   → 자식 `.wrapper`가 안 늘어나고 **내용 높이**를 갖는다

② `BaseballField.svelte` `.wrapper`는 높이가 `auto`다

③ 그래서 `.viewport { max-height: 100% }`가 **`none`으로 취급된다.**
   백분율 `max-height`는 담는 상자 높이가 확정일 때만 산다.
   `.viewport` 높이 = 폭 843 × (920/1000) = **775.5px**, 칸은 622.4px

④ `.scene-panel { overflow: hidden }`이 넘친 148px을 자른다

**한계선: 창이 대략 3:2(1.5:1)보다 세로로 길어야 안 잘린다. 16:9는 전부 잘린다.**

⚠ **1280 폭만 안 잘리는 건 우연이다.** `@media (max-width: 1280px)`가
`.left-column`을 `1/8` → `1/7`로 줄여 구장 폭이 843 → 388이 되는 것뿐이다.
**폭을 좁혀 맞추는 건 근본이 아니다.**

## A-4. 고침 후보 — B가 하네스에서 실제로 재본 결과

```
                        1920x1080 구장    틀 비율   잘림
  ────────────────────────────────────────────────────
  ① 지금                  843 x 776       1.087   139px
  ② wrapper만 늘린다       843 x 622       1.354   없음
  ③ 높이에서 뽑는다         677 x 622       1.087   없음   ← 권한다
```

**②는 잘림은 없어지지만 틀 비율이 1.35로 깨진다.** `.retro-viewport`가 4px
테두리 + box-shadow 액자라, **액자만 가로로 늘어나고 구장이 그 안에서
좌우 여백을 두고 뜬다.**

**③은 열 해상도 전부 OK고 액자가 구장을 정확히 감싼다**(비율 1.087 유지).

```css
/* MatchPage.svelte */
.field-stage-wrap { align-items: stretch; }   /* start → stretch */

/* BaseballField.svelte */
.wrapper  { height: 100%; min-height: 0; display: flex; justify-content: center; }
.viewport { height: 100%; width: auto; max-width: 100%; max-height: 100%; min-height: 0; }
```

⚠ **`min-height: 280px`을 같이 빼야 한다.** 원래 결함에선 한 번도 안 걸리던
값인데, 고친 뒤에는 낮은 창에서 다시 자른다:

```
  창 크기        min-height 0        min-height 280px
  1366x600       290x267 OK          304x280 잘림 8.8px
  1600x520       226x208 OK          304x280 잘림 68px
  1920x460       178x164 OK          304x280 잘림 112px
```

---

# B. 알 표식에서 광택을 뺀다 — 글자가 묻힌다

수비 아홉·타자·주자는 `stoneMark.ts`가 색을 내고 SVG가 그리는 **알 표식**이다.
지금 알마다 광택(`radialGradient#stone-body`)이 한 겹 더 올라간다.
**그 광택을 뺀다.** 평평한 단색이 되고 자리 이름이 또렷해진다.

## B-1. 왜 — 취향이 아니라 대비다

`stoneMarkTeams.test.ts`가 **팀 56개 전부 4.0:1을 넘는다**고 보증한다.
그런데 그 검사는 `contrast(팀색, inkFor(팀색))`을 잰다 — **광택을 얹기 전 색**이다.
화면에 실제로 칠해지는 색은 그 위에 흰색 ~20%가 덮인 색이다.

**실제로 칠해진 픽셀을 읽어 다시 쟀다** (알을 그려 글자 자리 평균색을 표본):

```
  팀 56개
    검사가 재는 값(광택 전)이 4.0 미만        0개
    실제로 칠해진 값(광택 후)이 4.0 미만      2개   ← 검사가 못 잡는다
    광택 때문에 대비가 떨어진 팀             51개
    광택을 빼면 4.0 미만                     0개

  가장 나쁜 팀들           검사값   광택O   광택X
  ─────────────────────────────────────────────
  TEAM_HS_JEJU_WIND      #0277bd   4.80    3.66    4.80
  TEAM_KBL_SKYGULLS_1    #0277bd   4.80    3.66    4.80
  TEAM_HS_SEOUL_INNOVA…  #1565c0   5.75    4.13    5.75
  TEAM_IND_SUWON_BLAZE   #bf360c   5.60    4.26    5.60
```

🔴 **`stoneMark.ts` 머리말이 "48팀으로 재보니 21팀에서 글자가 묻혔다"는
실패를 검사로 굳혔다고 적어 뒀는데, 그 검사가 화면에 칠해지는 색을 안 본다.**
이 저장소가 되풀이하는 그 형태다 — **재는 자리와 쓰는 자리가 다르다.**

광택을 빼면 검사가 재는 색과 칠해지는 색이 **같아진다.** 보증이 실제가 된다.

## B-2. 무엇을 지우나

`BaseballField.svelte`에서 넷이다.

```
  102~106줄   <defs><radialGradient id="stone-body"> … </radialGradient>
  141줄       수비수 광택 <circle … fill="url(#stone-body)"/>
  165줄       타자   광택 <circle … fill="url(#stone-body)"/>
  183줄       주자   광택 <circle … fill="url(#stone-body)"/>
```

남는 알은 이 셋이다 — **그림자 · 몸통 · 글자.**

```svg
<ellipse cx={x+1} cy={y + STONE_R*0.86} rx={STONE_R*0.92} ry={STONE_R*0.28}
  fill="rgba(0,0,0,0.35)"/>
<circle cx={x} cy={y} r={STONE_R}
  fill={stone.body} stroke={stone.rim} stroke-width={stone.rimWidth}/>
<text x={x} y={y} text-anchor="middle" dominant-baseline="central"
  font-size={pos.length > 1 ? 13 : 16} font-weight="800"
  font-family="'Courier New',monospace" fill={stone.ink}>{pos}</text>
```

## B-3. 건드리지 말 것

- **`fill={stone.ink}`를 고정색으로 바꾸지 마라.** `inkFor()`가 팀 색마다
  흰/검을 대비로 고르고 검사가 그걸 지킨다. (B가 만든 예시 그림은
  `#0a1018` 고정이었는데 **그건 하네스라 그런 것이고 따라 하면 안 된다.**)
- **`stroke-width={stone.rimWidth}`도 그대로 둔다.** 반지름 × 0.16이라
  알 크기가 바뀌어도 비율이 유지된다. (예시 그림은 `3` 고정이었다 — 17 기준
  2.72 대 3이라 눈에 띄는 차이는 아니다)
- 그림자 `<ellipse>`는 남긴다. 이건 광택과 달리 글자 위에 안 올라간다

## B-4. 같이 정리할 것

- `stoneStyle()`의 **`bodyEdge`를 아무도 안 쓴다.** 화면에서 한 번도 안 그려지고
  `stoneMark.test.ts:79`만 참조한다. 광택을 빼면 쓸 일이 아예 없어진다 —
  지울지는 판단해라
- `stoneMark.ts` 머리말의 "광택은 `<radialGradient>`가 낸다" 문장이 거짓이 된다.
  **문서와 코드를 같이 고쳐라**

## B-5. 검사를 실제 색으로 바꿔라

지금 검사는 광택을 못 본다. 광택을 빼면 검사값 = 칠해지는 값이 되므로
**지금 검사가 그대로 유효해진다.** 다만 나중에 누가 광택류를 다시 얹으면
같은 구멍이 다시 생긴다. 대조군을 하나 넣어 두는 게 낫다:

```
"알 위에 반투명 겹칠이 없다" — BaseballField의 알 그리기에
url(#...) 채움이 들어가면 실패한다
```

---

# C. 고친 뒤 반드시 이렇게 검증해라

🔴 **08-28 고침이 안 들은 게 이 검증 없이 넘어갔기 때문이다.**

```bash
cd 02.SvelteElectron
node --experimental-strip-types scripts/parkclip/build-harness.mjs   # 새 CSS로 다시 굽는다
node scripts/parkclip/measure.mjs                                    # 560건
node scripts/parkclip/threshold.mjs                                  # 폭별 한계선
npm test -- stoneMark                                                # 대비
```

🔴 **CSS를 고쳤으면 `build-harness.mjs`를 반드시 다시 돌려라.** 하네스는
소스에서 CSS를 굽는 시점에 복사한다 — 안 다시 구우면 **옛 CSS를 재게 된다.**

통과 기준:

```
cutBottom > 0.5 인 건이 0
안 보이는 앵커(HOMEPLATE · C · BATTER · 주자 3)가 0
threshold.mjs의 "16:9에서 잘리는 양"이 전 폭에서 "없음"
```

⚠ **한 해상도만 보고 끝내지 마라.** 1366x768 · 1600x900 · 1920x1080 ·
2560x1440이 최소다.

⚠ 계측 프로브를 손대면 **대조군으로 확인해라.** B가 처음 쟀을 때
`clipOf`가 좌우 경계를 안 돌려줘서 후보 넷 전부에서 앵커 14개가 다
"안 보임"으로 나왔다. **온전한 걸 아는 1280x720이 같이 틀리게 나와서 드러났다.**

---

# D. 사용자 확정이 필요한 것

**A-4 ③은 구장이 작아진다.** 1920x1080에서 폭 843 → 677 (**-20%**).
높이가 모자라니 어쩔 수 없고, 대신 가로에 여백이 생긴다.
`.scene-layout`이 `108px | minmax(0,1fr) | 108px`이라 타순 패널은 양 끝에
붙어 있어서 **구장과 타순 사이가 벌어진다.**

- 그대로 둔다 (가운데 정렬, 양옆 여백)
- 타순 패널을 구장 쪽으로 붙인다
- 타순 패널을 넓혀 여백을 먹는다
- 위쪽(스코어보드·`.panel-head`)을 줄여 구장에 높이를 더 준다

**화면 밀도 문제라 사용자에게 물어라.**

---

# E. 배제된 것 — 다시 의심하지 마라

전부 실측했다.

- **구장 그림 비율** — 30장 중 28장이 1306x1204로 viewBox(1000x920) 대비
  **-0.2%**다. 1000px 폭에서 2px. `universitybaseball.gif`만 +1.5%인데
  대학 구장 9곳이 전부 전용 PNG를 가져 **실제로 안 쓰인다**
- **좌표는 맞다.** `MatchPage`의 `retroField`·`DEFENSE_RETRO_BASE`가 둘 다
  `parkView.coords`에서 온다. 두 정본 문제가 아니다
- **`min-height: 280px`** — 원래 결함에선 안 걸렸다 (고친 뒤에는 빼야 한다)
- **오른쪽 칸 내용** — 자연 높이 90px/260px로 280쌍 비교, 왼쪽 기하 차이 **0건**
- **좌우·위 잘림** — 없다. 560건 전부 0

---
