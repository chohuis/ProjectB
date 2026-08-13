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
const ACCENT := Color("4a9eff")
const OK := Color("46c46b")
const WARN := Color("e8b23a")
const BAD := Color("e05c5c")

## 부상 심각도 — 값이 아니라 뜻으로 이름 붙인다
const SEV_COLOR := {
	"light": OK,
	"moderate": WARN,
	"severe": BAD,
	"surgery": Color("c04ad0"),
}

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
