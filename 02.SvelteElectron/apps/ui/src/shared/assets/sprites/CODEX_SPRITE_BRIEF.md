# 야구 게임 SVG 스프라이트 제작 의뢰서

## 프로젝트 개요

야구 경영 시뮬레이션 게임의 경기 화면에 올릴 픽셀아트 스타일 캐릭터 SVG 스프라이트가 필요합니다.  
스프라이트는 픽셀아트 배경 이미지 위에 별도 레이어로 올라가며, 투구 결과에 따라 포즈가 전환됩니다.

---

## 필수 참고 이미지 — 스타일 기준

### ① 프로젝트 내 참고 파일 (최우선)

**`apps/ui/src/shared/assets/match-demo/stadium-scene-concept.png`**

이 이미지가 **모든 스타일의 기준**입니다. 이미지 안에 이미 투수·포수·타자가 그려져 있으므로,
이 캐릭터들의 아트 스타일, 비율, 외곽선, 채색 방식을 그대로 따라야 합니다.

이미지 내 캐릭터 확인:
- **투수**: 마운드 위, 뒷모습(3/4 후면), 흰 유니폼 + 네이비 슬리브/캡, 투구 릴리스 자세
- **포수**: 홈플레이트 뒤, 뒷모습, 풀 포수 장비(마스크·가슴보호대·정강이보호대), 쪼그려 앉음
- **타자**: 우측에서 본 측면, 빨간 헬멧 + 빨강/흰 유니폼, 배트 들고 대기

### ② 추가 스타일 레퍼런스 (검색어)

- **"Retro Bowl pixel art characters"** — 동일한 치비 비율의 픽셀아트 스포츠 캐릭터
- **"Baseball Boy pixel art sprite"** — 픽셀아트 야구 캐릭터 단순화 예시
- **"Bottom of the Ninth SNES pitcher sprite"** — 투수 릴리스·폴로스루 포즈 참고
- **"NES Baseball Stars sprite sheet"** — 고전 야구 캐릭터 포즈 참고
- **"pixel art chibi baseball player transparent"** — 치비 비율 및 투명 배경 참고

---

## 카메라 시점

게임 화면은 **투수 등 뒤에서 홈플레이트 방향**을 바라보는 시점입니다.

| 캐릭터 | 시점 | 설명 |
|---|---|---|
| 투수 | **후면 3/4** | 등/어깨/뒷머리가 보이는 약간 왼쪽 뒤에서 본 시점 |
| 포수 | **후면** | 정면에서 직접 뒤를 바라보는 시점 |
| 타자 | **측면** | 타자의 오른쪽 면이 보이는 시점 (타자는 투수를 향해 서있음) |
| 심판 | **후면** | 포수 바로 뒤에서 보는 시점 |

---

## 아트 스타일 규격

- **픽셀아트 스타일**: `stadium-scene-concept.png` 캐릭터와 동일하게
- **치비 비율**: 머리 : 몸 = 약 1 : 2 (stadium-scene-concept.png 캐릭터 비율 참고)
- **외곽선**: 2px 다크 아웃라인 `#0A0A0F`, 캐릭터 실루엣 주변 전체에 적용
- **채색**: 명암 최소화 — 주요 색상 + 하이라이트 1단계만
- **안티앨리어싱 없음** — 순수 픽셀 엣지
- **배경**: 완전 투명 (SVG background 없음)
- **SVG 구현**: 모든 픽셀을 `<rect>` 요소로 표현 (각 "픽셀" = 2×2 유닛)

---

## 색상 클래스 규칙 (SVG 필수 적용)

유니폼 색상은 팀마다 다르므로 CSS 변수 방식으로 처리합니다.
각 `<rect>` 에 반드시 아래 class를 부여하고 fill을 설정하세요.

```
유니폼 주색 (몸통·바지·헬멧)        → class="c-primary"   fill="var(--c-primary,   #1a3a8a)"
유니폼 보조색 (줄무늬·번호·테두리)   → class="c-secondary" fill="var(--c-secondary, #ffffff)"
피부                                → class="c-fixed"     fill="#FDBCB4"
글러브                              → class="c-fixed"     fill="#8B5E3C"
배트                                → class="c-fixed"     fill="#6B3A1F"
스파이크·벨트                       → class="c-fixed"     fill="#1A1A1A"
포수 보호대·마스크                   → class="c-fixed"     fill="#2A2A2E"
심판 유니폼 (전체)                  → class="c-fixed"     fill="#1C1C20"
외곽선                              → class="c-fixed"     fill="#0A0A0F"
```

**중요**: `c-primary`와 `c-secondary`는 런타임에 팀 컬러로 교체됩니다.
fallback 값(`#1a3a8a`, `#ffffff`)은 투수 기본값(네이비+흰색)으로 설정하세요.

---

## SVG 구조 예시

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 64">
  <!-- 외곽선 (c-fixed) -->
  <rect class="c-fixed" x="12" y="2" width="8" height="2" fill="#0A0A0F"/>
  <!-- 피부 (c-fixed) -->
  <rect class="c-fixed" x="14" y="4" width="4" height="4" fill="#FDBCB4"/>
  <!-- 헬멧/캡 (c-primary) -->
  <rect class="c-primary" x="12" y="2" width="8" height="4" fill="var(--c-primary, #1a3a8a)"/>
  <!-- 유니폼 몸통 (c-primary) -->
  <rect class="c-primary" x="10" y="12" width="12" height="16" fill="var(--c-primary, #1a3a8a)"/>
  <!-- 줄무늬 (c-secondary) -->
  <rect class="c-secondary" x="13" y="12" width="2" height="16" fill="var(--c-secondary, #ffffff)"/>
  <!-- ... -->
</svg>
```

---

## 요청 파일 목록

저장 위치: `apps/ui/src/shared/assets/sprites/`

### 투수 (4포즈) — 후면 3/4 시점

| 파일명 | viewBox | 포즈 상세 |
|---|---|---|
| `pitcher_idle.svg` | `0 0 32 64` | 세트 포지션. 공 두 손으로 가슴 앞에, 정면 바라봄, 발 어깨너비 |
| `pitcher_windup.svg` | `0 0 32 64` | 왼발 들어올림, 양팔 머리 위, 무게중심 뒤로 |
| `pitcher_release.svg` | `0 0 40 64` | 오른팔 앞으로 강하게 뻗음, 왼발 착지, 상체 앞으로 기울어짐 |
| `pitcher_follow.svg` | `0 0 36 64` | 투구 후 팔 왼쪽으로 내려옴, 상체 앞숙임 |

### 타자 (3포즈) — 측면 시점 (오른쪽 면이 보임)

| 파일명 | viewBox | 포즈 상세 |
|---|---|---|
| `batter_ready.svg` | `0 0 28 48` | 배트 어깨에 올리고 대기, 무릎 살짝 굽힘 |
| `batter_swing.svg` | `0 0 36 48` | 배트 수평으로 강하게 휘두르는 순간, 허리 완전 회전 |
| `batter_watch.svg` | `0 0 28 48` | 배트 그대로 들고 공 지켜봄 (루킹 스트라이크) |

### 포수 (2포즈) — 후면 시점

| 파일명 | viewBox | 포즈 상세 |
|---|---|---|
| `catcher_set.svg` | `0 0 24 28` | 풀 포수 장비, 쪼그려 앉아 사인 자세, 글러브 무릎 위 |
| `catcher_receive.svg` | `0 0 24 28` | 글러브 앞으로 내밀어 공 받는 자세 |

### 심판 (2포즈) — 후면 시점

| 파일명 | viewBox | 포즈 상세 |
|---|---|---|
| `umpire_idle.svg` | `0 0 18 32` | 포수 바로 뒤, 허리 살짝 굽히고 대기 |
| `umpire_strike.svg` | `0 0 22 32` | 오른팔 올려 주먹 쥔 스트라이크 콜, 상체 약간 앞으로 |

---

## 저장 형식

- **파일 형식**: SVG 텍스트 파일, UTF-8 인코딩
- **배경**: 완전 투명 — `<svg>` 루트에 background 없음
- **픽셀 단위**: 각 "픽셀" = 2×2 유닛 (viewBox 기준)
- **모든 요소**: `<rect>` 사용 (path, circle 등 혼용 가능하나 rect 위주 권장)
- **class 속성**: 모든 rect에 `c-primary` / `c-secondary` / `c-fixed` 중 하나 반드시 부여

---

## 납품 체크리스트

- [ ] 11개 SVG 파일 전부 생성
- [ ] 모든 rect에 class 속성 부여 (c-primary / c-secondary / c-fixed)
- [ ] c-primary, c-secondary에 `fill="var(--c-primary/secondary, fallback)"` 형식 적용
- [ ] 배경 완전 투명 확인
- [ ] `stadium-scene-concept.png` 캐릭터 스타일과 일치 여부 확인
- [ ] viewBox 규격 준수
