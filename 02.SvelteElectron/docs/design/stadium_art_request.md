# 구장 픽셀아트 27장 — Codex 작업 의뢰서

> 이 문서를 그대로 Codex에 붙여 넣는다. 아래 §1의 파일들이 저장소에 이미 있으니
> **먼저 읽고 시작할 것.** 결과는 §6의 zip 하나로 받는다.

---

## 0. 작업 요약

한국 야구 시뮬레이션 게임의 **경기 화면 배경 픽셀아트 27장**을 만든다.
게임은 이 그림 위에 선수 스프라이트를 **고정 좌표**로 얹으므로,
27장 전부에서 **경기장 기하가 픽셀 단위로 일치**해야 한다. 이게 이 작업의 핵심 제약이다.

**결과물**: `stadiums.zip` — `park/` 폴더에 PNG 27장.

---

## 1. 먼저 읽을 파일 (저장소에 있음)

| 경로 | 무엇 |
|---|---|
| `resource/park/_spec/styles.json` | **구장 27개의 스타일 명세.** 파일명·티어·파크팩터·배경·분위기·팀색. **이 파일이 정본이다** |
| `resource/park/_spec/anchors.json` | **등록 기준 좌표 14개.** 검증에 쓴다 |
| `resource/park/_spec/registration_overlay.png` | 좌표를 십자선으로 찍은 그림. **겹쳐서 눈으로 확인용** |
| `resource/park/_spec/reference_pro.png` | 프로 10장의 품질·시점 기준 |
| `resource/park/_spec/reference_university.png` | 대학 5 · 독립 4의 기준 |
| `resource/park/_spec/reference_highschool.png` | 고교 8의 기준 (⚠ 외야까지 흙바닥) |

`styles.json`의 `stadiums[]` 각 항목이 그림 한 장에 대응한다. 필드 뜻:

```jsonc
{
  "file": "STADIUM_HALLA.png",   // ← 결과 파일명. 그대로 쓸 것
  "tier": "highschool",          // pro | university | independent | highschool
  "parkFactor": "pitcher",       // hitter | neutral | pitcher
  "fenceDistance": 122,          // 외야 펜스에 적을 숫자 (m)
  "fenceHeight": "높음",
  "teamColor": "#AC0F30",        // pro만. 좌석·광고보드 주조색. 나머지는 null
  "backdrop": "제주. 오름과 현무암 돌담, 야자수",
  "mood": "맑은 낮",
  "reference": "_spec/reference_highschool.png",
  "outfield": "dirt", "infield": "dirt",
  "crowd": "없음", "lights": "없음",
  "fence": "철망 펜스", "dugout": "나무 벤치 · 목재 지붕"
}
```

---

## 2. 규격 (27장 공통, 예외 없음)

| 항목 | 값 |
|---|---|
| 캔버스 | **1306 × 1204 px** |
| 포맷 | **PNG**, 불투명 (알파 없음) |
| 색 수 | **256색 이하** |
| 시점 | 참조 이미지와 동일한 부감. 바꾸지 말 것 |
| 애니메이션 | 없음. 정지 1장 |
| 안티에일리어싱 | **금지.** 도트 경계가 뭉개지면 안 된다 |

---

## 3. ★ 등록 기준 — 가장 중요

### 3-1. 14개 지점이 모든 그림에서 같은 자리에 있어야 한다

`anchors.json`의 `anchors[].canvas`가 캔버스 좌표다.

```
홈플레이트 649,1034   1루 934,759   2루 649,594   3루 366,759
투수 649,717   포수 649,1047
1루수 927,770   2루수 784,665   유격수 505,665   3루수 355,770
좌익수 316,678   중견수 649,568   우익수 982,678
```

### 3-2. ⚠ 이 좌표의 뜻 — 반드시 읽을 것

**"베이스가 그려진 자리"가 아니라 "선수의 발이 놓이는 자리"다.**
게임은 이 좌표에 48×52 스프라이트를 `(x−24, y−44)`로 그린다. 좌표는 선수의 **발밑**이다.
그래서 베이스 지점이 실제 베이스 그림보다 조금 **위**에 찍혀 있다 —
`registration_overlay.png`를 보면 확인된다.

**작업 방법**: `registration_overlay.png`를 자기 그림 위에 겹쳐,
십자선 14개가 **같은 지형지물**을 가리키면 통과다. 숫자로 재려 하지 말 것.

### 3-3. 허용 오차

| 지점 | 오차 |
|---|---|
| 홈·1루·2루·3루·투수 | **±6 px** |
| 수비 8자리 | ±12 px |

### 3-4. 고정 / 자유

| 절대 고정 | 자유롭게 |
|---|---|
| 내야 다이아몬드 위치·크기·각도 | 하늘 · 배경(산·도시·건물) |
| 마운드 위치 | 관중석 규모와 색 |
| 파울라인 각도 | 펜스 높이와 광고 |
| 카메라 시점 | 조명탑 · 더그아웃 |
| 외야 펜스의 **곡선 형태** | 잔디 무늬 · 흙 색 · 시간대 |

⚠ **펜스를 앞뒤로 옮기지 말 것.** 실제로 당기면 외야 잔디 모양이 바뀌어 기하가 깨진다.
거리감은 **`fenceDistance` 숫자 표기와 `fenceHeight`로만** 낸다.

---

## 4. 어떻게 만들 것인가 — 두 경로

Codex 환경에 **이미지 생성이 가능한지에 따라** 갈린다. 판단해서 진행하고,
어느 쪽을 썼는지 §6의 `REPORT.md`에 적을 것.

### 경로 A — 이미지 생성이 가능한 경우

- **반드시 img2img**로 한다. `styles.json`의 `reference` 파일을 기준 이미지로 넣는다
- 변형 강도는 **낮게(0.3~0.45)**. 높이면 기하가 깨진다
- 생성 후 §5의 검증을 돌려 **오차를 넘으면 재생성**한다
- 색 수는 마지막에 256색으로 양자화 (`PIL.Image.quantize(colors=256)`)

### 경로 B — 이미지 생성이 불가능한 경우

**참조 3장을 층으로 나눠 재조합하는 프로그램**을 작성한다.

```
L1 경기장면 (잔디·흙·라인·베이스)   ← 참조에서 잘라 27장 전부 재사용. 기하가 여기 있다
L2 배경 (하늘·산·도시)             ← 구장별로 다르게. 화면 상단 약 40%
L3 관중석·펜스·광고보드             ← 티어별 + 팀색 적용
L4 전경 (더그아웃·철망)             ← 티어별
```

- **L1을 고정하면 §3의 기하 문제가 구조적으로 사라진다.** 이 방식을 권한다
- L2는 참조 3장에서 추출한 조각(건물·산·나무·구름)을 재배치해 만든다
- ⚠ 참조 3장은 **팔레트를 거의 공유하지 않는다**(셋 공통 0색). 조각을 섞으면 이음매가
  보이므로, 합성 후 **전체를 하나의 팔레트로 재양자화**할 것
- 티어별 L1이 둘 필요하다 — 프로/대학/독립은 잔디 외야, **고교는 흙 외야**

**경로 B가 A보다 품질이 낮아도 좋다.** 기하가 맞는 게 우선이다.

---

## 5. 자기 검증 (납품 전 필수)

27장 전부에 대해 아래를 돌리고 결과를 `REPORT.md`에 적는다.

```python
from PIL import Image
import json

spec = json.load(open("resource/park/_spec/anchors.json", encoding="utf-8"))
W, H = spec["canvas"]["width"], spec["canvas"]["height"]

for path in produced_files:
    im = Image.open(path)
    assert im.size == (W, H), f"{path}: 캔버스 {im.size}, 기대 {(W,H)}"
    assert im.mode in ("P", "RGB"), f"{path}: 모드 {im.mode}"
    n = len(im.convert("RGB").getcolors(maxcolors=1 << 20) or [])
    assert n <= 256, f"{path}: 고유색 {n}개 (상한 256)"
```

기하 확인은 **`registration_overlay.png`를 각 결과물 위에 알파 0.5로 합성한 이미지**를
만들어 `_check/` 폴더에 함께 넣는다. 우리 쪽에서 눈으로 본다.

---

## 6. 납품 형식

**파일명: `stadiums.zip`**

```
stadiums.zip
├── park/
│   ├── STADIUM_SEOUL_GUARDIANS.png
│   ├── STADIUM_SEOUL_ROYALS.png
│   ├── STADIUM_SEOUL_COBRAS.png
│   ├── STADIUM_SUWON_KNIGHTS.png
│   ├── STADIUM_INCHEON_SHARKS.png
│   ├── STADIUM_BUSAN_WAVES.png
│   ├── STADIUM_CHANGWON_STARS.png
│   ├── STADIUM_DAEGU_SABERS.png
│   ├── STADIUM_GWANGJU_PANTHERS.png
│   ├── STADIUM_DAEJEON_PHANTOMS.png
│   ├── STADIUM_MIREU.png
│   ├── STADIUM_GEUMGANG_UNIV.png
│   ├── STADIUM_NOEUL.png
│   ├── STADIUM_BYEOLBIT.png
│   ├── STADIUM_TAEJONG.png
│   ├── STADIUM_GANGBYEON.png
│   ├── STADIUM_GYEBAEK.png
│   ├── STADIUM_NAMNYEOK.png
│   ├── STADIUM_CHANGGONG.png
│   ├── STADIUM_HANGANG.png
│   ├── STADIUM_MUJIGAE.png
│   ├── STADIUM_GYERYONG.png
│   ├── STADIUM_SEORAK_HS.png
│   ├── STADIUM_YEONGSAN.png
│   ├── STADIUM_PALGONG.png
│   ├── STADIUM_NAKDONG.png
│   └── STADIUM_HALLA.png
├── _check/
│   └── <같은 이름>.png          ← 등록 오버레이를 겹친 확인용
└── REPORT.md                    ← 경로 A/B 중 무엇을 썼는지, §5 검증 결과, 실패한 장
```

- 폴더 한 겹씩만. 그 아래 더 파지 말 것
- 파일명은 `styles.json`의 `file` 값 그대로. 대소문자 일치
- **27장 미만이어도 보낼 것.** 있는 것만 쓰고 나머지는 티어 기본으로 대체한다
- 생성 코드를 썼다면 `tools/` 아래 함께 넣어 준다 (재생성용)

---

## 7. 축소안 — §3 기하를 못 맞추겠으면

무리해서 27장을 만들지 말고 **배경 띠만** 보낸다. 훨씬 쉽고 실패해도 안전하다.

| 항목 | 값 |
|---|---|
| 캔버스 | **1306 × 200 px** |
| 내용 | 하늘·구름·산·건물만. **경기장 요소 없음** |
| 장수 | **6장** |

```
stadiums.zip
└── _src/L2/
    ├── sea.png      부산·태종 — 바다와 해안
    ├── oreum.png    제주 — 오름·돌담·야자
    ├── lake.png     춘천 — 호수·설악 능선·안개
    ├── port.png     인천 — 항만·크레인
    ├── farm.png     전주·계룡 — 농촌·한옥·논밭
    └── dome.png     코브라돔 — 실내 천장·조명 (하늘 없음)
```

이 6장이면 우리 쪽에서 기존 참조의 경기장 부분과 합성해 27장을 만든다.
**기하 제약이 없으므로 §3·§5를 건너뛴다.**
