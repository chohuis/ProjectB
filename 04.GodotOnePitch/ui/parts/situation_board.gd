extends Control
class_name SituationBoard

## 상황판 — 베이스 다이아몬드 + S/B/O 램프. M-3.
##
## 원본: `MatchPage.svelte:1591-1631` · `:2384-2415` · `:2455-2482`
##
## ⚠ **02가 둘을 한 패널로 합쳤다.** 그 주석이 근거다 — "둘은 **한 상황의
## 두 축**이고 따로 보면 '2사 만루'를 읽는 데 눈이 두 번 움직인다."
##
## ⚠ **04는 글자로만 보여줬다**("2·3루" · "카운트 1-2" · "2아웃").
## 데이터는 다 있는데 한눈에 안 읽힌다.
##
## ⚠ **여기는 계산을 안 한다.** 주자·카운트는 `MatchVm`이 이미 낸 값을
## 그대로 받는다 — 화면이 상태를 다시 읽으면 그게 두 번째 정본이 된다.

## 다이아몬드 칸 — 02는 104×104다
const DIAMOND: float = 104.0
## 베이스 한 변 (02는 16×16을 45도 돌린다)
const BASE_SIZE: float = 15.0
## 램프 지름 — 02는 26이고 04는 폭이 좁아 조금 줄인다
const LAMP: float = 18.0
const LAMP_GAP: float = 6.0
const ROW_GAP: float = 6.0
## 다이아몬드와 램프 사이
const COLUMN_GAP: float = 20.0

## 02 `:1606-1628` — **개수가 다르다.** S 2 · B 3 · O 2
const LAMP_COUNT: Dictionary = {"strike": 2, "ball": 3, "out": 2}
## 02 `:2465-2477` — 뜻이 색으로 갈린다
const LAMP_COLOR: Dictionary = {"strike": "ok", "ball": "warn", "out": "bad"}
const LAMP_LABEL: Dictionary = {"strike": "S", "ball": "B", "out": "O"}
## 그리는 순서 — 02와 같다
const ROWS: Array[String] = ["strike", "ball", "out"]

var _vm: Dictionary = {}


static func lamp_count(kind: String) -> int:
	return int(LAMP_COUNT.get(kind, 0))


static func lamp_color(kind: String) -> Color:
	return AppTheme.vital_color(String(LAMP_COLOR.get(kind, "")))


## 네 베이스의 중심.
##
## ⚠ **02는 대칭이 아니다** — `.b2 { left: 52px }`인데 104폭에 16짜리
## 베이스의 중앙은 44다. `_draw()`로 그리는 04는 정확히 맞출 수 있으므로
## **비율로 대칭으로 뒀다.** 픽셀이 아니라 구조를 맞춘다
static func base_points(box: Vector2) -> Dictionary:
	return {
		"second": Vector2(box.x * 0.5, box.y * 0.2),
		"third": Vector2(box.x * 0.2, box.y * 0.5),
		"first": Vector2(box.x * 0.8, box.y * 0.5),
		"home": Vector2(box.x * 0.5, box.y * 0.8),
	}


func setup(vm: Dictionary) -> void:
	_vm = vm
	custom_minimum_size = Vector2(
		DIAMOND + COLUMN_GAP + _lamp_row_width(), DIAMOND)
	queue_redraw()


## 그 베이스에 주자가 있나. **홈은 주자 자리가 아니다** — 늘 비어 있다
func is_base_on(base: String) -> bool:
	return bool(_vm.get("on_%s" % base, false))


## `count.strike > lampIndex` — 02와 같은 식이다.
## **넘치는 카운트가 와도 안 죽는다**(삼진 직전의 3이 들어온다)
func is_lamp_on(kind: String, index: int) -> bool:
	return _count_of(kind) > index


func _count_of(kind: String) -> int:
	match kind:
		"strike":
			return int(_vm.get("strikes", 0))
		"ball":
			return int(_vm.get("balls", 0))
		_:
			return int(_vm.get("outs", 0))


func _lamp_row_width() -> float:
	var most: int = 0
	for k in ROWS:
		most = maxi(most, lamp_count(String(k)))
	return 16.0 + float(most) * (LAMP + LAMP_GAP)


func _draw() -> void:
	var box := Vector2(DIAMOND, DIAMOND)
	draw_rect(Rect2(Vector2.ZERO, box), AppTheme.CARD, true)

	# 베이스 넷 — 45도 돌린 정사각형이라 마름모로 그린다
	var half: float = BASE_SIZE * 0.5
	for name in ["second", "third", "first", "home"]:
		var c: Vector2 = base_points(box)[name]
		var pts := PackedVector2Array([
			c + Vector2(0, -half), c + Vector2(half, 0),
			c + Vector2(0, half), c + Vector2(-half, 0)])
		# ⚠ **꺼진 베이스가 지면보다 가라앉아야 한다.** 02가 밝은 지면으로
		# 옮기며 데인 자리다 — 진하게 두면 뜻이 뒤집혀 "주자 있음"으로 읽힌다
		draw_colored_polygon(pts,
			AppTheme.WARN if is_base_on(name) else AppTheme.CARD_EDGE)
		draw_polyline(pts + PackedVector2Array([pts[0]]), AppTheme.BG, 1.0)

	# S/B/O 램프
	var font: Font = ThemeDB.fallback_font
	var x0: float = DIAMOND + COLUMN_GAP
	var y: float = (DIAMOND - float(ROWS.size()) * (LAMP + ROW_GAP)) * 0.5 + LAMP * 0.5
	for kind in ROWS:
		var k: String = String(kind)
		draw_string(font, Vector2(x0, y + 5.0), String(LAMP_LABEL[k]),
			HORIZONTAL_ALIGNMENT_LEFT, -1, 12, AppTheme.TEXT_DIM)
		for i in lamp_count(k):
			var cx: float = x0 + 16.0 + float(i) * (LAMP + LAMP_GAP) + LAMP * 0.5
			draw_circle(Vector2(cx, y), LAMP * 0.5,
				lamp_color(k) if is_lamp_on(k, i) else AppTheme.CARD_EDGE)
		y += LAMP + ROW_GAP
