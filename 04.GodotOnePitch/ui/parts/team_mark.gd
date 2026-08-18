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
var _motif: String = ""
var _band: int = 0


func _init() -> void:
	custom_minimum_size = Vector2(22, 22)


## 팀 하나. **색도 배정도 여기서 정하지 않는다** — `TeamMarkVm`이 낸다
func setup(spec: Dictionary) -> void:
	_team_id = String(spec.get("team_id", ""))
	_shell = String(spec.get("shell", "shield"))
	_motif = String(spec.get("motif", ""))
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
	_draw_motif(shell)


## 문양 열둘 — 02 `MOTIF`. **좌표는 02 SVG 그대로다.**
##
## ⚠ **채운 도형(`fill`)은 다각형으로, 선 도형(`stroke`)은 선으로 그린다.**
## 02가 그렇게 나눠 뒀고, Godot도 `draw_colored_polygon`과 `draw_polyline`이
## 따로다 — 선을 다각형으로 흉내 내면 굵기가 크기마다 어긋난다.
##
## ⚠ **문양은 언제나 흰색이다**(02 주석). 국내 172팀은 보조색 위에서도
## 흰색이 읽힌다는 것을 검사가 본다
const MOTIFS: Array[String] = ["seam", "bats", "star", "bolt", "mount",
	"wave", "ring", "arrow", "wing", "flame", "anchor", "crown"]

## 채운 도형 — 02 `MOTIF`의 `<path fill="#FFF">` 좌표 그대로
const MOTIF_FILLS: Dictionary = {
	"star": [[50, 28], [58, 47], [79, 48], [62, 61], [68, 81], [50, 69],
		[32, 81], [38, 61], [21, 48], [42, 47]],
	"bolt": [[56, 26], [32, 57], [46, 57], [42, 80], [68, 47], [53, 47]],
	"mount": [[22, 72], [38, 42], [48, 58], [60, 34], [80, 72]],
	"arrow": [[50, 26], [72, 50], [58, 50], [58, 76], [42, 76], [42, 50],
		[28, 50]],
	# ⚠ **crown은 곡선이 아니었다** — 02를 열어 보니 다각형이다
	"crown": [[24, 72], [20, 38], [34, 50], [50, 28], [66, 50], [80, 38],
		[76, 72]],
}

## 날개는 네 조각이다 — 02도 `<path>` 넷이다
const MOTIF_WING: Array = [
	[[50, 34], [74, 46], [68, 54], [50, 48]],
	[[50, 48], [72, 60], [64, 68], [50, 62]],
	[[50, 34], [26, 46], [32, 54], [50, 48]],
	[[50, 48], [28, 60], [36, 68], [50, 62]],
]

## 선 도형 — `[점들, 굵기, 닫힘]`. 02 `stroke-width` 그대로
const MOTIF_LINES: Dictionary = {
	"bats": [[[[33, 71], [67, 33]], 7, false], [[[67, 71], [33, 33]], 7, false]],
	"anchor": [[[[50, 34], [50, 78]], 6, false], [[[34, 44], [66, 44]], 6, false]],
}


## 문양 하나를 그린다. **못 옮긴 문양은 안 그린다** — 02 SVG에 곡선(`C`·`Q`)이
## 있는 것들(seam · wave · flame · ring · crown)은 다각형으로 바꾸면 형태가
## 달라진다. **지어내는 대신 비워 둔다** — 그 자리는 외곽·띠만으로 갈린다
func _draw_motif(shell: PackedVector2Array) -> void:
	var white := Color(1, 1, 1)
	if MOTIF_FILLS.has(_motif):
		draw_colored_polygon(_poly(MOTIF_FILLS[_motif]), white)
		return
	if _motif == "wing":
		for part in MOTIF_WING:
			draw_colored_polygon(_poly(part), white)
		return
	if MOTIF_LINES.has(_motif):
		for line in MOTIF_LINES[_motif]:
			draw_polyline(_poly(line[0]), white, _scaled(float(line[1])), true)
		return
	_draw_curved_motif()


## 02 좌표 배열을 이 칸으로
func _poly(points: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in points:
		out.append(_pt(float(p[0]), float(p[1])))
	return out


## 선 굵기도 같이 줄인다 — 안 줄이면 22px에서 문양이 뭉갠다
func _scaled(w: float) -> float:
	return maxf(w / BOX.x * size.x, 1.0)


## 곡선 문양 — 02 SVG의 `C`·`Q`를 Godot 그리기로 옮긴다.
##
## ⚠ **crown은 곡선이 아니었다** — `<path fill>` 다각형이라 위 표로 갔다.
## **02를 열어 보고 알았다**(안 열었으면 "곡선이라 못 옮긴다"로 남을 뻔했다).
##
## ⚠ **원은 `draw_arc`가 정확하다** — 다각형으로 근사하면 22px에서 각이 진다
func _draw_curved_motif() -> void:
	var white := Color(1, 1, 1)
	match _motif:
		"ring":
			# 02: 원 하나 + 가운데 점
			draw_arc(_pt(50, 52), _r(20), 0.0, TAU, 24, white, _scaled(9), true)
			draw_circle(_pt(50, 52), _r(5), white)
		"seam":
			# 02: 원 + 좌우 실밥 두 줄
			draw_arc(_pt(50, 52), _r(21), 0.0, TAU, 24, white, _scaled(5), true)
			draw_polyline(_bezier(Vector2(36, 38), Vector2(44, 46),
				Vector2(44, 58), Vector2(36, 66)), white, _scaled(6), true)
			draw_polyline(_bezier(Vector2(64, 38), Vector2(56, 46),
				Vector2(56, 58), Vector2(64, 66)), white, _scaled(6), true)
		"wave":
			# 02: 물결 두 줄(`Q`의 반복)
			for base in [60.0, 74.0]:
				var pts := PackedVector2Array()
				for i in 17:
					var t: float = float(i) / 16.0
					pts.append(_pt(24.0 + 56.0 * t,
						base - 7.0 * sin(t * TAU * 1.5)))
				draw_polyline(pts, white, _scaled(7), true)
		"flame":
			# 02: 위가 뾰족하고 아래가 둥근 불꽃
			var flame := PackedVector2Array([_pt(50, 24)])
			flame.append_array(_bezier(Vector2(50, 24), Vector2(62, 40),
				Vector2(70, 46), Vector2(70, 60)))
			flame.append_array(_bezier(Vector2(70, 60), Vector2(70, 74),
				Vector2(61, 82), Vector2(50, 82)))
			flame.append_array(_bezier(Vector2(50, 82), Vector2(39, 82),
				Vector2(30, 74), Vector2(30, 60)))
			flame.append_array(_bezier(Vector2(30, 60), Vector2(30, 46),
				Vector2(38, 40), Vector2(50, 24)))
			draw_colored_polygon(flame, white)


## 3차 베지어를 점으로 — 02 SVG의 `C`가 그것이다
func _bezier(p0: Vector2, p1: Vector2, p2: Vector2, p3: Vector2,
		steps: int = 10) -> PackedVector2Array:
	var out := PackedVector2Array()
	for i in range(steps + 1):
		var t: float = float(i) / float(steps)
		var u: float = 1.0 - t
		var p: Vector2 = p0 * (u * u * u) + p1 * (3.0 * u * u * t) \
			+ p2 * (3.0 * u * t * t) + p3 * (t * t * t)
		out.append(_pt(p.x, p.y))
	return out


## 02 좌표의 반지름을 이 칸으로 — 가로세로 비가 달라 작은 쪽에 맞춘다
func _r(v: float) -> float:
	return v / BOX.x * minf(size.x, size.y)
