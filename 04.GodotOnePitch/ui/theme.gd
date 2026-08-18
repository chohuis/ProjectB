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
# ⚠ **`const`가 아니라 `static var`다.** 톤을 바꾸면 값이 갈린다.
# 화면 231곳이 `AppTheme.BG` 꼴로 읽는데 **읽는 쪽은 한 글자도 안 바뀐다** —
# 그게 "색은 여기서만 정한다"를 지켜 온 값이다.
#
# ⚠ **어두운 값은 04가 쓰던 그대로, 밝은 값은 02 `styles.css`에서 그대로**
# 가져왔다(U5에서 02가 전역을 밝게 뒤집으며 정한 값이다). 지어낸 색은 없다.
static var BG := Color("13161c")
static var CARD := Color("1b1f28")
static var CARD_EDGE := Color("2a3040")
static var TEXT := Color("e6e9ef")
static var TEXT_DIM := Color("8b93a7")
## 있지만 눈에 안 걸려야 하는 글자 — 볼·파울 같은 "아무 일도 안 일어난" 줄
static var TEXT_MUTE := Color("6b7386")
static var ACCENT := Color("4a9eff")
static var OK := Color("46c46b")
static var WARN := Color("e8b23a")
static var BAD := Color("e05c5c")

## 두 톤의 값. **키가 위 이름과 같아야 한다** — `apply_tone`이 이름으로 건다
const PALETTE: Dictionary = {
	# 04가 쓰던 값
	"dark": {
		"BG": "13161c", "CARD": "1b1f28", "CARD_EDGE": "2a3040",
		"TEXT": "e6e9ef", "TEXT_DIM": "8b93a7", "TEXT_MUTE": "6b7386",
		"ACCENT": "4a9eff", "OK": "46c46b", "WARN": "e8b23a", "BAD": "e05c5c",
	},
	# 02 `styles.css`의 밝은 값 그대로
	# surface / panel / line / ink / ink-mute / ok / warn / bad
	"light": {
		"BG": "f6f8fb", "CARD": "ffffff", "CARD_EDGE": "dde3ee",
		"TEXT": "0f1d3d", "TEXT_DIM": "5a6478", "TEXT_MUTE": "8791a5",
		"ACCENT": "1e3050", "OK": "1f7a47", "WARN": "9a6510", "BAD": "b3311f",
	},
}

## 지금 톤. `apply_tone`만 바꾼다
static var tone: String = "dark"


## 톤을 건다. **`Settings.resolve_tone`이 정한 값을 받는다** —
## 여기서 다시 `system`을 풀면 정본이 둘이 된다
static func apply_tone(new_tone: String) -> void:
	var p: Dictionary = PALETTE.get(new_tone, {})
	if p.is_empty():
		return
	tone = new_tone
	BG = Color(p["BG"])
	CARD = Color(p["CARD"])
	CARD_EDGE = Color(p["CARD_EDGE"])
	TEXT = Color(p["TEXT"])
	TEXT_DIM = Color(p["TEXT_DIM"])
	TEXT_MUTE = Color(p["TEXT_MUTE"])
	ACCENT = Color(p["ACCENT"])
	OK = Color(p["OK"])
	WARN = Color(p["WARN"])
	BAD = Color(p["BAD"])
	# ⚠ **톤이 바뀌면 팀 색도 다시 뽑는다** — 헤더 목표 명도가 톤마다 다르다
	# (밝은 톤 L*26 · 어두운 톤 L*32)
	apply_team(team_id)


## 소속팀 색 — U-2. 02 `applyTeamTokens`가 하던 일이다.
##
## > 유니폼 안의 핵심은 **소속팀이 바뀌면 화면 색이 바뀐다**는 것이다.
## > 색이 **한 곳에서만** 계산돼야 공짜로 얻어진다. (02 주석)
##
## ⚠ **화면은 여전히 `AppTheme`만 본다** — 팀 색을 화면이 직접 읽으면
## 이적 한 번에 화면 쉰 개를 고쳐야 한다. 계산은 `TeamTheme`이,
## 보관은 여기가 한다.
##
## ⚠ **헤더는 팀 주색이 아니라 어둡게 보정한 값이다**(L*26/32) —
## 그대로 쓰면 238팀 중 130팀에서 흰 글씨가 죽는다
static var TEAM_DARK := Color(TeamTheme.DEFAULT_PRIMARY)
static var TEAM_ACCENT := Color(TeamTheme.DEFAULT_PRIMARY)
static var TEAM_GOLD := Color("79b0ff")
static var TEAM_STRIPE := Color(0, 0, 0, 0)
static var TEAM_WASH := Color(0, 0, 0, 0)

## 지금 색을 내준 팀 — 같은 팀이면 다시 계산하지 않는다
static var team_id: String = ""


## 소속팀을 건다. **새 게임·이적·톤 변경 때 부른다**
static func apply_team(new_team_id: String) -> void:
	team_id = new_team_id
	var t: Dictionary = TeamTheme.of_team(new_team_id, tone)
	TEAM_DARK = t["dark"]
	TEAM_ACCENT = t["accent"]
	TEAM_GOLD = t["gold"]
	TEAM_STRIPE = t["stripe"]
	TEAM_WASH = t["wash"]



## 체력·멘탈 같은 "높을수록 좋은" 축의 단계 색 — M-1.
## **어느 값이 어느 단계인지는 `MatchVm.vital_level`이 정한다** — 여기선
## 이름을 색으로만 바꾼다(문턱이 두 곳에 있으면 한쪽이 조용히 갈린다).
##
## ⚠ **사전을 미리 만들어 두지 않는다.** 톤이 바뀌면 그 사전이 옛 색을
## 들고 남는다 — 매번 지금 값을 읽는다
static func vital_color(level: String) -> Color:
	match level:
		"ok":
			return OK
		"warn":
			return WARN
		"bad":
			return BAD
	return TEXT_DIM


## 부상 심각도 — 값이 아니라 뜻으로 이름 붙인다.
##
## ⚠ **사전 상수로 두면 톤이 바뀌어도 옛 색을 들고 남는다.** `const`는 한 번만
## 만들어지므로 그 안의 `OK`·`WARN`·`BAD`가 처음 톤에 굳는다 — 함수로 바꿔
## 매번 지금 값을 읽는다. 수술색은 톤과 무관한 고정색이다
static func sev_color(severity: String, fallback: Color = TEXT_DIM) -> Color:
	match severity:
		"light":
			return OK
		"moderate":
			return WARN
		"severe":
			return BAD
		"surgery":
			return Color("c04ad0")
	return fallback

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
