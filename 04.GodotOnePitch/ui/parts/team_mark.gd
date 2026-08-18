extends Control
class_name TeamMark

## 팀 마크 — U-1. 원본: 02 `shared/utils/teamMark.ts` · `features/team/ui/TeamMark.svelte`
##
## ⚠ **그림 파일이 아니라 데이터로 조립한다.** 02 주석이 이유를 적어 뒀다:
## "238팀에 각각 로고를 그리는 건 현실적이지 않다(고교만 102팀이고 전부 가상
## 학교다). 대신 이미 있는 것으로 만든다 — 팀 색 두 개와 이름."
##
## 🔴 **04는 `teams.json`의 `colors`를 238팀 다 갖고도 한 번도 안 썼다.**
##
## ⚠ **문양 12종은 아직 안 옮겼다.** 외곽 5종 × 띠 4종까지가 이 단계다 —
## 그것만으로 목록에서 팀이 갈리는지 눈으로 보고 나서 문양을 정한다.
## **못 옮긴 것을 지어내지 않는다.**
##
## ⚠ **좌표는 02 그대로다**(`SHELL`의 SVG path). 100×102 칸을 기준으로 잡고
## 그릴 때 크기에 맞춰 늘린다 — 눈금을 새로 정하면 02와 형태가 갈린다.

## 02 `viewBox="0 0 100 102"`
const BOX: Vector2 = Vector2(100.0, 102.0)

## 외곽 다섯. **02 `SHELL`의 path를 다각형으로 옮겼다** — 곡선은 꼭짓점으로
## 근사한다(Godot `_draw`엔 path가 없다). 순서도 02 `SHELL_ORDER` 그대로다
const SHELLS: Array[String] = ["shield", "circle", "hex", "wedge", "rhomb"]

## 띠 넷 — 02 `BandKey`: 0 없음 · 1 가로띠 · 2 사선 · 3 세로분할
const BANDS: int = 4

var _team_id: String = ""
var _primary: Color = Color("2b3a55")
var _accent: Color = Color("cbd5e1")
var _shell: String = "shield"
var _band: int = 0


func _init() -> void:
	custom_minimum_size = Vector2(22, 22)


## 팀 하나. **색도 배정도 여기서 정하지 않는다** — `TeamMarkVm`이 낸다
func setup(spec: Dictionary) -> void:
	_team_id = String(spec.get("team_id", ""))
	_shell = String(spec.get("shell", "shield"))
	_band = int(spec.get("band", 0))
	_primary = Color(String(spec.get("primary", "#2b3a55")))
	_accent = Color(String(spec.get("accent", "#cbd5e1")))
	queue_redraw()


func team_id() -> String:
	return _team_id


func shell_name() -> String:
	return _shell


func band_index() -> int:
	return _band


## 02 좌표(100×102)를 이 칸 크기로 옮긴다
func _pt(x: float, y: float) -> Vector2:
	return Vector2(x / BOX.x * size.x, y / BOX.y * size.y)


## 외곽 다각형. **곡선은 꼭짓점으로 근사한다** — 22px에서 곡선과 구분이 안 된다
func _shell_points() -> PackedVector2Array:
	var out := PackedVector2Array()
	match _shell:
		"circle":
			for i in 24:
				var a: float = TAU * float(i) / 24.0
				out.append(_pt(50.0 + cos(a) * 47.0, 51.0 + sin(a) * 47.0))
		"hex":
			for p in [[50, 3], [91, 26], [91, 76], [50, 99], [9, 76], [9, 26]]:
				out.append(_pt(float(p[0]), float(p[1])))
		"rhomb":
			for p in [[50, 2], [96, 51], [50, 100], [4, 51]]:
				out.append(_pt(float(p[0]), float(p[1])))
		"wedge":
			out.append(_pt(8, 10))
			out.append(_pt(92, 10))
			out.append(_pt(92, 58))
			# 아래는 둥글게 — 02는 베지어다
			for i in range(1, 8):
				var t: float = float(i) / 8.0
				out.append(_pt(92.0 - 42.0 * t, 58.0 + 41.0 * sin(t * PI * 0.5)))
			out.append(_pt(50, 99))
			for i in range(1, 8):
				var t2: float = float(i) / 8.0
				out.append(_pt(50.0 - 42.0 * t2, 99.0 - 41.0 * sin(t2 * PI * 0.5)))
			out.append(_pt(8, 58))
		_:
			# shield — 02 기본
			out.append(_pt(50, 4))
			out.append(_pt(93, 18))
			out.append(_pt(93, 52))
			for i in range(1, 9):
				var t3: float = float(i) / 9.0
				out.append(_pt(93.0 - 43.0 * t3, 52.0 + 47.0 * sin(t3 * PI * 0.5)))
			out.append(_pt(50, 99))
			for i in range(1, 9):
				var t4: float = float(i) / 9.0
				out.append(_pt(50.0 - 43.0 * t4, 99.0 - 47.0 * sin(t4 * PI * 0.5)))
			out.append(_pt(7, 52))
			out.append(_pt(7, 18))
	return out


## 띠를 외곽 안에만 그린다.
##
## ⚠ **Godot엔 `clip-path`가 없다.** 02는 SVG로 잘라내는데, 여기서는
## `Geometry2D.intersect_polygons`로 외곽과 겹치는 부분만 남긴다 —
## 안 자르면 띠가 마크 밖으로 삐져나온다
func _band_polygons(shell: PackedVector2Array) -> Array:
	var band := PackedVector2Array()
	match _band:
		1:
			band = PackedVector2Array([_pt(0, 40), _pt(100, 40),
				_pt(100, 57), _pt(0, 57)])
		2:
			band = PackedVector2Array([_pt(-10, 78), _pt(110, 30),
				_pt(110, 54), _pt(-10, 102)])
		3:
			band = PackedVector2Array([_pt(50, 0), _pt(100, 0),
				_pt(100, 102), _pt(50, 102)])
		_:
			return []
	return Geometry2D.intersect_polygons(band, shell)


func _draw() -> void:
	var shell: PackedVector2Array = _shell_points()
	if shell.size() < 3:
		return
	draw_colored_polygon(shell, _primary)
	for poly in _band_polygons(shell):
		draw_colored_polygon(poly, _accent)
