extends Control
class_name BaseballField

## 구장 그림 + 수비수 아홉 — M7-6e3.
##
## 원본: `features/match-view/ui/BaseballField.svelte`
##
## ⚠ **여기는 좌표를 만들지 않는다.** `ParkVm`이 준 1000×920 좌표를 화면
## 크기로 옮기기만 한다 — 티어마다 좌표가 다르고, 그 표가 정본이다.
##
## ⚠ **스프라이트에 알파가 있어야 한다.** 02는 1254×1254에 투명 픽셀이
## 0.0%인 그림을 쓰다가 선수마다 흰 상자가 따라다녔다. 지금 쓰는 건
## 24×32 누끼 세트다.

## 원본 비율 3:4. 정사각 원본을 억지로 눌러 넣으면 가로로 늘어난다
const SPRITE_SIZE: Vector2 = Vector2(39, 52)
const SPRITE_DIR: String = "res://assets/sprites"

## 포지션 → 스프라이트 파일. **엔진 포지션 이름이 정본이다**
const SPRITE_OF: Dictionary = {
	"P": "field_pitcher", "C": "field_catcher",
	"1B": "field_1b", "2B": "field_2b", "3B": "field_3b", "SS": "field_ss",
	"LF": "field_lf", "CF": "field_cf", "RF": "field_rf",
}

@onready var _bg: TextureRect = $Park
@onready var _layer: Control = $Layer

var _vm: Dictionary = {}


func set_view_model(vm: Dictionary) -> void:
	_vm = vm
	if is_node_ready():
		_rebuild()


func _ready() -> void:
	resized.connect(_rebuild)
	_rebuild()


## 그림이 **실제로 그려진** 사각형.
##
## ⚠ **Control 전체가 아니다.** 그림은 비율을 지켜 가운데 놓이므로 남는
## 쪽에 여백이 생긴다. 그걸 안 빼면 그림은 가운데 좁게 있는데 수비수만
## 넓게 퍼져서, 외야수가 관중석에 서 있게 된다 — 실제로 그렇게 나왔다
func image_rect() -> Rect2:
	var box: Vector2 = _vm.get("viewbox", Vector2(1000, 920))
	if box.x <= 0.0 or box.y <= 0.0 or size.x <= 0.0 or size.y <= 0.0:
		return Rect2(Vector2.ZERO, size)
	var drawn: Vector2 = box * minf(size.x / box.x, size.y / box.y)
	return Rect2((size - drawn) * 0.5, drawn)


## 그림 안에서 좌표 한 칸이 화면 몇 픽셀인가. 스프라이트도 같이 줄어야
## 한다 — 안 그러면 작은 화면에서 선수가 내야를 덮는다
func scale_factor() -> float:
	var box: Vector2 = _vm.get("viewbox", Vector2(1000, 920))
	if box.x <= 0.0:
		return 1.0
	return image_rect().size.x / box.x


## 1000×920 좌표를 지금 화면 자리로. **그림과 같은 자리로 옮긴다** —
## 그림만 늘이고 좌표를 안 늘이면 수비수가 베이스에서 벗어난다
func to_screen(p: Vector2) -> Vector2:
	var box: Vector2 = _vm.get("viewbox", Vector2(1000, 920))
	if box.x <= 0.0 or box.y <= 0.0:
		return Vector2.ZERO
	var r: Rect2 = image_rect()
	return r.position + Vector2(p.x / box.x * r.size.x, p.y / box.y * r.size.y)


func _rebuild() -> void:
	if _vm.is_empty():
		return

	var path: String = _vm.get("image_path", "")
	if ResourceLoader.exists(path):
		_bg.texture = load(path)

	for c in _layer.get_children():
		_layer.remove_child(c)
		c.free()

	var sz: Vector2 = SPRITE_SIZE * scale_factor()
	for d in _vm.get("defense", []):
		var s: TextureRect = _sprite(String(d["pos"]), sz)
		if s == null:
			continue
		_layer.add_child(s)
		# ⚠ **크기를 붙인 뒤에 준다.** 붙기 전에 주면 `add_child`가 텍스처
		# 원본 크기(24×32)로 되돌린다 — 24px 스프라이트가 8px 자리에 서서
		# 발밑이 좌표보다 18px 아래로 내려갔다
		s.size = sz
		# 발밑이 좌표에 오게 — 가운데를 맞추면 선수가 베이스 위에 뜬다
		s.position = to_screen(d["point"]) - Vector2(sz.x * 0.5, sz.y)


func _sprite(pos: String, sz: Vector2) -> TextureRect:
	var name: String = SPRITE_OF.get(pos, "")
	if name.is_empty():
		return null
	var path: String = "%s/%s.png" % [SPRITE_DIR, name]
	if not ResourceLoader.exists(path):
		return null

	var t := TextureRect.new()
	t.texture = load(path)
	t.custom_minimum_size = sz
	t.size = sz
	t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	t.stretch_mode = TextureRect.STRETCH_SCALE
	t.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return t
