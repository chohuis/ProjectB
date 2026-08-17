extends RefCounted
class_name AppTheme

## 색·여백·글꼴 — **한 곳에서만 정한다.**
##
## ⚠ 이전 프로젝트가 반복해서 겪은 게 "표를 두 번 적는 것"이다. 화면마다
## 색을 직접 쓰면 나중에 톤을 바꿀 때 56개를 다 찾아다녀야 하고, 반드시
## 몇 개는 빠진다.
##
## ⚠ **한글 폰트를 프로젝트에 넣는다.** 시스템 폰트에 기대면 기기마다 다르게
## 보이고, 없는 환경에서는 □□□로 깨진다. 자간·굵기가 달라 레이아웃도 밀린다.
##
## Pretendard 1.3.9 · SIL Open Font License 1.1 (`fonts/OFL.txt`).
## OFL은 게임에 넣어 파는 걸 허용한다 — 조건은 **라이선스 전문을 같이 배포**하고
## **폰트 자체를 상품으로 팔지 않는 것**이다.
##
## OTF 1.5MB × 2종(Regular·SemiBold). 한글 완성형 11,172자가 다 들어 있어
## 서브셋을 안 했다 — 선수 이름을 무작위로 만드는 게임이라 드문 글자가
## 나올 수 있고, 3MB는 Steam 배포에서 문제가 안 된다.

# ── 색 ────────────────────────────────────────────────────────────
const BG := Color("13161c")
const CARD := Color("1b1f28")
const CARD_EDGE := Color("2a3040")
const TEXT := Color("e6e9ef")
const TEXT_DIM := Color("8b93a7")
## 있지만 눈에 안 걸려야 하는 글자 — 볼·파울 같은 "아무 일도 안 일어난" 줄
const TEXT_MUTE := Color("6b7386")
const ACCENT := Color("4a9eff")
const OK := Color("46c46b")
const WARN := Color("e8b23a")
const BAD := Color("e05c5c")

## 체력·멘탈 같은 "높을수록 좋은" 축의 단계 색 — M-1.
## **어느 값이 어느 단계인지는 `MatchVm.vital_level`이 정한다** — 여기선
## 이름을 색으로만 바꾼다(문턱이 두 곳에 있으면 한쪽이 조용히 갈린다)
const VITAL_COLOR := {"ok": OK, "warn": WARN, "bad": BAD}


static func vital_color(level: String) -> Color:
	return VITAL_COLOR.get(level, TEXT_DIM)


## 부상 심각도 — 값이 아니라 뜻으로 이름 붙인다
const SEV_COLOR := {
	"light": OK,
	"moderate": WARN,
	"severe": BAD,
	"surgery": Color("c04ad0"),
}

## 관계 7단계 — **숫자를 안 보여주는 게 인물 화면의 원칙**이라 색이 곧 수치다.
## 적대에서 각별까지 한 방향으로 흐르게 하고 양 끝만 꽉 채운다.
## 어느 값이 어느 색조인지는 `sim/relationship.gd`의 `LABELS`가 정한다
## 관계 일곱 색 — U-8.
##
## ⚠ **이웃끼리 안 갈렸다.** 우호↔신뢰 1.07 · 신뢰↔각별 **1.06**
## (1.0이 같은 밝기다). 관계는 −100~100인데 플레이어에게 보이는 건 라벨과
## 색뿐이라, 이웃이 같은 색이면 "우호와 신뢰가 뭐가 다른지"를 못 읽는다.
##
## ⚠ **02는 배지를 배경+글자 쌍으로 갈랐다**(`PeoplePage.svelte:266-272`).
## 밝은 테마라 연한 배경(#D5EADD)과 진한 배경(--ok)이 확 다르다.
## 04는 어두운 테마에 **색 하나에서 배경(18%)·테두리(55%)·글자를 파생**하므로
## (`pill_style`) 그 색 자체가 갈려야 한다.
##
## **색상 배치는 02 그대로다** — 나쁜 쪽은 붉고, 중립은 무채색, 좋은 쪽은
## 파랑에서 초록으로 간다. **명도만 계단으로 다시 잡았다**: `(휘도+0.05)`가
## 한 칸마다 정확히 1.30배다. 이웃 대비 1.30 · 배경 대비 3.1~15.0.
## 검사(`tone_contrast_test.gd`)가 그 계단을 지킨다
const TONE_COLOR := {
	"hostile": Color("bd2f26"),
	"distrust": Color("b1614a"),
	"cold": Color("828a9b"),
	"neutral": Color("999fac"),
	"friendly": Color("81baf8"),
	"trusted": Color("5fe797"),
	"close": Color("b7fe70"),
}

## 투구 결과 큰 글자 — 1.4초 스쳐 지나가는 자리라 본문보다 채도가 높다.
## 어느 코드가 어느 색인지는 `sim/match_result.gd`가 정한다
const FLASH_HOMERUN := Color("ff4a4a")
const FLASH_TRIPLE := Color("ff9800")
const FLASH_HIT := Color("ffd54f")
const FLASH_DP := Color("6ee7a8")
const FLASH_STRIKE := Color("37d67a")
const FLASH_ERROR := Color("ff4a4a")
const FLASH_OUT := Color("ff8c42")
const FLASH_PLAIN := Color("7a8fa8")

# ── 여백·크기 ─────────────────────────────────────────────────────
const PAD := 12
const GAP := 8
const CARD_RADIUS := 8
const FONT_BODY := 15
const FONT_TITLE := 17
const FONT_SMALL := 13


const FONT_REGULAR := "res://fonts/Pretendard-Regular.otf"
const FONT_BOLD := "res://fonts/Pretendard-SemiBold.otf"


## 본문 폰트. **없으면 시스템 폰트로 떨어진다** — 개발 중 실수로 폰트를
## 지웠을 때 화면이 통째로 안 뜨는 것보다 낫다. 검사가 임베드 여부를 본다
static func korean_font() -> Font:
	if ResourceLoader.exists(FONT_REGULAR):
		return load(FONT_REGULAR)
	push_warning("임베드 폰트 없음 — 시스템 폰트로 대체한다: %s" % FONT_REGULAR)
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Pretendard", "Noto Sans KR", "Malgun Gothic"])
	return f


static func korean_font_bold() -> Font:
	if ResourceLoader.exists(FONT_BOLD):
		return load(FONT_BOLD)
	return korean_font()


## 카드 배경 — 모서리 둥글고 테두리 있는 판
static func card_style() -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = CARD
	s.border_color = CARD_EDGE
	s.set_border_width_all(1)
	s.set_corner_radius_all(CARD_RADIUS)
	s.set_content_margin_all(PAD)
	return s


static func pill_style(c: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(c, 0.18)
	s.border_color = Color(c, 0.55)
	s.set_border_width_all(1)
	s.set_corner_radius_all(10)
	s.content_margin_left = 8
	s.content_margin_right = 8
	s.content_margin_top = 2
	s.content_margin_bottom = 2
	return s


## 마지막 투구 착탄 점 — 02 `.zone-last-dot`(테두리 `--warn` · 속은 35%).
## 12px 원이라 반지름을 절반으로 둔다
static func dot_style(edge: Color, fill: Color) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(fill, 0.35)
	s.border_color = edge
	s.set_border_width_all(2)
	s.set_corner_radius_all(6)
	return s


## 화면 전체에 씌우는 테마. **여기서만 만든다**
static func build() -> Theme:
	var t := Theme.new()
	var font := korean_font()
	t.default_font = font
	t.default_font_size = FONT_BODY

	# 제목·강조는 굵은 쪽을 쓴다
	t.set_font("font", "Button", korean_font_bold())
	t.set_color("font_color", "Label", TEXT)
	t.set_stylebox("panel", "PanelContainer", card_style())

	var bg := StyleBoxFlat.new()
	bg.bg_color = BG
	t.set_stylebox("panel", "Panel", bg)
	return t
