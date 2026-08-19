extends RefCounted
class_name ParkMeasure

## 구장 그림에서 베이스·투수판을 재고 `data/parks.json`과 견준다 — D-6b.
##
## D-6에서 좌표를 그림에 맞춰 다시 잡았는데, **그때 쓴 도구가 02의
## `node_modules/pngjs`를 빌린 일회용 스크립트였다** — 02가 사라지면 못
## 돌린다. Godot의 `Image`가 PNG를 읽으므로 여기로 옮긴다.
##
## ## 무엇을 재나
##
## | | 어떻게 | 왜 |
## |---|---|---|
## | 베이스 4점 | 흰 덩어리(flood fill) | 그림에 흰 사각형으로 그려져 있다 |
## | 투수판 | **납작한** 흰 막대 | 베이스와 종횡비가 다르다(25×3) |
##
## ⚠ **어두운 배색은 흰색 문턱에 안 걸린다.** 야간(별빛·미르)·노을·청색조
## (인천) 넷이 그랬다. 그럴 땐 **창 안의 상위 밝기**로 다시 찾는다 —
## 베이스는 어느 배색에서도 제 둘레보다 밝다.
##
## ## 왜 좌표가 티어마다 있나
##
## 원본 구장 그림 세 장이 각각 따로 그려져 내야 위치가 다르다. 구장 27장은
## 각자 제 티어 그림을 따랐고, **같은 티어끼리는 픽셀 단위로 같다**(실측).
##
## 실행:
##   godot --headless --script tools/run.gd -- measure:park
##   godot --headless --script tools/run.gd -- measure:park --write 1

const PARKS: String = "res://data/parks.json"
const DIR: String = "res://assets/park"
const KEYS: Array = ["home", "first", "second", "third"]

## `BaseballField`의 좌표계. 그림은 여기 비율을 지켜 가운데 놓인다
const CW: float = 1000.0
const CH: float = 920.0

## 흰색 문턱 — 02 `fit-park-anchors.cjs`와 같은 값이다
const WHITE_R: int = 200
const WHITE_B: int = 190

## 마지막으로 산출한 좌표. **검사가 이걸 본다** — 로그만 내면 도구가 정말
## 재는지 확인할 길이 없다(변이 6건이 그래서 안 잡혔다)
var last_fit: Dictionary = {}

var _log: Callable
var _fail: Callable
var _parks: Dictionary = {}
var _path: String = PARKS


func run(log_fn: Callable, fail_fn: Callable, do_write: bool,
		parks_path: String = PARKS) -> int:
	_log = log_fn
	_fail = fail_fn

	_path = parks_path
	_parks = _read_json(_path)
	if _parks.is_empty():
		_fail.call("구장 표를 못 읽는다: %s" % _path)
		return 1

	var ids: Array = _stadium_ids()
	if ids.is_empty():
		_fail.call("%s에 구장 그림이 없다" % DIR)
		return 1

	var seen: Dictionary = {}       # id → 잰 값
	_log.call("잰 값 (코드 좌표계 %d×%d · * 는 밝기로 다시 찾은 것)"
		% [int(CW), int(CH)])
	_log.call("  %s %s %s" % ["구장".rpad(28), "티어".rpad(12),
		"home        1루         2루         3루         투수판"])
	for id in ids:
		var m: Dictionary = _measure(id)
		if m.is_empty():
			continue
		seen[id] = m
		var cells: String = ""
		for k in KEYS + ["mound"]:
			var p: Vector2i = m["at"].get(k, Vector2i(-1, -1))
			var mark: String = "*" if m["dark"].has(k) else " "
			cells += ("%d,%d%s" % [p.x, p.y, mark] if p.x >= 0
				else "못찾음  ").rpad(12)
		_log.call("  %s %s %s" % [String(id).rpad(28),
			String(m["tier"]).rpad(12), cells])

	var bad: int = _report_gaps(seen)
	# 산출값이 표와 다르면 그것도 실패다 — **고칠 게 남았는데 0을 내면
	# 검사가 이 도구를 못 쓴다**
	if not _fit(seen, do_write):
		bad += 1
	return 1 if bad > 0 and not do_write else 0


# ── 재기 ──────────────────────────────────────────────────────

## 그림 한 장에서 베이스 4점과 투수판을 잰다
func _measure(id: String) -> Dictionary:
	var img: Image = _load(id)
	if img == null:
		_fail.call("%s 그림을 못 읽는다" % id)
		return {}
	var tier: String = _tier_of(id)
	var field: Dictionary = _parks["coords"][tier]["field"]
	var at: Dictionary = {}
	var dark: Dictionary = {}

	for k in KEYS:
		# 지금 좌표를 겨눠 찾는다 — 어긋나 있어도 창(±120)이 덮는다
		var got: Dictionary = _find(img, field[k], 120, false)
		if got.is_empty():
			got = _find(img, field[k], 45, true)
			if not got.is_empty():
				dark[k] = true
		if not got.is_empty():
			at[k] = got["at"]

	# 투수판은 납작해서 베이스 문턱에 안 걸린다 — 따로 찾는다
	var rub: Dictionary = _find_rubber(img, field["mound"])
	if not rub.is_empty():
		at["mound"] = rub["at"]
		if bool(rub.get("dark", false)):
			dark["mound"] = true

	return {"tier": tier, "at": at, "dark": dark}


## 흰 덩어리(베이스) 하나. `by_light`면 흰색 대신 **창 안의 상위 밝기**를 쓴다
func _find(img: Image, aim: Dictionary, win: int, by_light: bool) -> Dictionary:
	var c: Vector2 = _to_px(img, Vector2(float(aim["x"]), float(aim["y"])))
	return _blob(img, int(c.x), int(c.y), win, {
		"light": by_light,
		"min_n": 40, "max_n": 900,
		"max_w": 30, "max_h": 28, "min_ratio": 0.0,
	})


## 투수판 — 가로로 납작한 흰 막대
func _find_rubber(img: Image, aim: Dictionary) -> Dictionary:
	var c: Vector2 = _to_px(img, Vector2(float(aim["x"]), float(aim["y"])))
	# ⚠ **크기 조건을 안 건다.** 처음엔 폭 18~60·높이 3~16을 걸어 뒀는데
	# 변이로 통째로 풀어도 값이 그대로였다 — 마운드 창(±110px) 안에 다른 흰
	# 덩어리가 없어서 **아무 일도 안 하는 조건**이었다. 가르는 건 납작함이다
	var opt: Dictionary = {
		"light": false,
		"min_n": 30, "max_n": 900,
		"min_ratio": 2.0,
	}
	# 마운드 앵커가 어긋나 있을 수 있어 창을 넉넉히 잡는다
	var got: Dictionary = _blob(img, int(c.x), int(c.y), 110, opt)
	if not got.is_empty():
		return got
	opt["light"] = true
	got = _blob(img, int(c.x), int(c.y), 110, opt)
	if not got.is_empty():
		got["dark"] = true
	return got


## 창 안에서 조건에 맞는 덩어리를 찾는다 — 가장 큰 것을 고른다.
## 탐지 규칙은 02 `fit-park-anchors.cjs`의 `findBase`를 옮긴 것이다
func _blob(img: Image, cx: int, cy: int, win: int, opt: Dictionary) -> Dictionary:
	var w: int = img.get_width()
	var h: int = img.get_height()
	var d: PackedByteArray = img.get_data()
	var x0: int = maxi(0, cx - win)
	var x1: int = mini(w, cx + win)
	var y0: int = maxi(0, cy - win)
	var y1: int = mini(h, cy + win)
	if x1 <= x0 or y1 <= y0:
		return {}

	var by_light: bool = bool(opt.get("light", false))
	var thr: int = _light_threshold(d, w, x0, y0, x1, y1) if by_light else 0

	var cols: int = x1 - x0
	var seen: PackedByteArray = PackedByteArray()
	seen.resize(cols * (y1 - y0))
	var sx: Array = []
	var sy: Array = []
	var best: Dictionary = {}

	for oy in range(y0, y1):
		for ox in range(x0, x1):
			var key: int = (oy - y0) * cols + (ox - x0)
			if seen[key] != 0 or not _is_lit(d, w, ox, oy, by_light, thr):
				continue
			seen[key] = 1
			sx.clear()
			sy.clear()
			sx.append(ox)
			sy.append(oy)
			var n: int = 0
			var tx: int = 0
			var ty: int = 0
			var mnx: int = w
			var mxx: int = 0
			var mny: int = h
			var mxy: int = 0
			while not sx.is_empty():
				var px: int = sx.pop_back()
				var py: int = sy.pop_back()
				n += 1
				tx += px
				ty += py
				mnx = mini(mnx, px)
				mxx = maxi(mxx, px)
				mny = mini(mny, py)
				mxy = maxi(mxy, py)
				for step in [Vector2i(1, 0), Vector2i(-1, 0),
						Vector2i(0, 1), Vector2i(0, -1)]:
					var nx: int = px + step.x
					var ny: int = py + step.y
					if nx < x0 or ny < y0 or nx >= x1 or ny >= y1:
						continue
					var k: int = (ny - y0) * cols + (nx - x0)
					if seen[k] != 0 or not _is_lit(d, w, nx, ny, by_light, thr):
						continue
					seen[k] = 1
					sx.append(nx)
					sy.append(ny)

			var bw: int = mxx - mnx + 1
			var bh: int = mxy - mny + 1
			if not _fits(n, bw, bh, opt):
				continue
			if best.is_empty() or n > int(best["n"]):
				best = {
					"at": _to_code(img, Vector2(float(tx) / n, float(ty) / n)),
					"n": n, "w": bw, "h": bh,
				}
	return best


## 덩어리가 찾는 모양인가. **크기로 가른다** — 02가 그랬다. 거리로 가르면
## 고교 홈플레이트가 타자석 외곽선에 밀린다(02가 겪은 것이다).
##
## ⚠ **종횡비 상한은 없앴다.** 02는 "파울라인은 가늘고 길어서 종횡비로
## 걸러낸다"며 2.6을 뒀는데, 04에선 폭 30·높이 28이 그걸 먼저 잡는다 —
## 상한을 99로 풀어도 값이 그대로였다. `min_ratio`(납작함)만 남았고 그건
## 투수판을 베이스와 가르는 데 실제로 쓰인다(변이로 확인했다)
func _fits(n: int, bw: int, bh: int, opt: Dictionary) -> bool:
	if n < int(opt["min_n"]) or n > int(opt["max_n"]):
		return false
	if bw < int(opt.get("min_w", 0)) or bw > int(opt.get("max_w", 1 << 30)):
		return false
	if bh < int(opt.get("min_h", 0)) or bh > int(opt.get("max_h", 1 << 30)):
		return false
	var ratio: float = float(bw) / maxf(1.0, float(bh))
	if ratio < float(opt["min_ratio"]):
		return false
	return true


func _is_lit(d: PackedByteArray, w: int, x: int, y: int,
		by_light: bool, thr: int) -> bool:
	var i: int = (y * w + x) << 2
	if by_light:
		return _lum(d, i) >= thr
	return d[i] > WHITE_R and d[i + 1] > WHITE_R and d[i + 2] > WHITE_B


func _lum(d: PackedByteArray, i: int) -> int:
	return (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8


## 창 안 밝기의 상위 1.5% 지점. **절대값을 안 쓴다** — 야간 구장은 통째로
## 어두워서 고정 문턱으로는 아무것도 안 잡힌다
func _light_threshold(d: PackedByteArray, w: int,
		x0: int, y0: int, x1: int, y1: int) -> int:
	var hist: PackedInt32Array = PackedInt32Array()
	hist.resize(256)
	var tot: int = 0
	for y in range(y0, y1):
		for x in range(x0, x1):
			hist[_lum(d, (y * w + x) << 2)] += 1
			tot += 1
	var want: int = int(float(tot) * 0.015)
	var acc: int = 0
	for v in range(255, -1, -1):
		acc += hist[v]
		if acc >= want:
			return v
	return 255


# ── 견주기 ────────────────────────────────────────────────────

## 지금 좌표가 그림과 맞나. **같은 티어는 서로 같아야 한다**(픽셀 단위로
## 같은 그림이니까).
##
## ⚠ **밝기로 찾은 점은 따로 센다.** 야간·노을 구장은 베이스가 흰색이 아니라
## 상위 밝기로 찾는데 그 중심이 1~2px 흔들린다 — 그걸 같은 잣대로 재면
## 멀쩡한 좌표가 어긋난 것으로 나온다
func _report_gaps(seen: Dictionary) -> int:
	_log.call("")
	_log.call("지금 좌표와의 어긋남 (px · 0이면 맞다)")
	var bad: int = 0
	for tier in ["pro", "university", "highschool"]:
		var field: Dictionary = _parks["coords"][tier]["field"]
		var worst: Dictionary = {}
		var soft: int = 0
		var n: int = 0
		var dark_n: int = 0
		for id in seen:
			if String(seen[id]["tier"]) != tier:
				continue
			n += 1
			if not seen[id]["dark"].is_empty():
				dark_n += 1
			for k in seen[id]["at"]:
				var got: Vector2i = seen[id]["at"][k]
				var dy: int = int(field[k]["y"]) - got.y
				if seen[id]["dark"].has(k):
					soft = maxi(soft, absi(dy))
					continue
				if not worst.has(k) or absi(dy) > absi(int(worst[k])):
					worst[k] = dy
		var line: String = ""
		for k in KEYS + ["mound"]:
			var v: int = int(worst.get(k, 0))
			line += ("%s %d" % [k, v]).rpad(14)
			# ⚠ **3px까지 봐준다.** 배색이 다른 그림(인천의 청색조)은 흰색
			# 탐지가 되긴 해도 중심이 2~3px 흔들린다. D-6이 고친 어긋남은
			# 42~69px이었으니 이 문턱으로도 넉넉히 잡는다
			if absi(v) > 3:
				bad += 1
		_log.call("  %s %s(%d장%s)" % [tier.rpad(12), line, n,
			" · 밝기로 잰 %d장은 최대 %dpx" % [dark_n, soft] if dark_n > 0 else ""])
		# 🔴 **밝기로 잰 것도 지킨다.** 안 그러면 그 갈래가 통째로 썩어도
		# 아무도 모른다 — 야간 구장 4장이 거기 매여 있다. 실측 1px이다
		if soft > 3:
			bad += 1
	if bad > 0:
		_fail.call("좌표가 그림과 어긋난 자리가 %d곳이다 — `--write 1`로 다시 잡는다"
			% bad)
	return bad


# ── 좌표 산출 ─────────────────────────────────────────────────

## 베이스 4점 대응으로 축별 1차 변환을 적합해 앵커 전체를 옮긴다.
##
## ⚠ **마운드는 이 변환으로 안 맞는다.** 02 앵커에서 마운드는 홈→2루의
## 72% 지점인데 그림은 64%고, 비율을 보존하는 변환은 그 어긋남을 그대로
## 옮긴다 — **잰 투수판을 그대로 쓴다.**
##
## ⚠ **베이스의 y도 잰 값을 그대로 쓴다.** 1차 변환은 고교에서 8px를 못
## 맞춘다(그림의 원근이 다르다). x는 변환을 쓴다 — 홈플레이트가 오각형이라
## 실측 중심이 2px쯤 흔들리는데 최소제곱이 그걸 고르고 1·3루 대칭도 지킨다
func _fit(seen: Dictionary, do_write: bool) -> bool:
	var out: Dictionary = {}
	for tier in ["pro", "university", "highschool"]:
		var id: String = _sample_of(seen, tier)
		if id.is_empty():
			_fail.call("%s 티어를 잰 그림이 없다" % tier)
			return false
		var at: Dictionary = seen[id]["at"]
		for k in KEYS + ["mound"]:
			if not at.has(k):
				_fail.call("%s(%s)의 %s를 못 쟀다 — 좌표를 못 낸다"
					% [tier, id, k])
				return false

		var field: Dictionary = _parks["coords"][tier]["field"]
		var ax: Array = []
		var ay: Array = []
		var bx: Array = []
		var by: Array = []
		for k in KEYS:
			ax.append(float(field[k]["x"]))
			ay.append(float(field[k]["y"]))
			bx.append(float(at[k].x))
			by.append(float(at[k].y))
		var tx: Vector2 = _fit1d(ax, bx)
		var ty: Vector2 = _fit1d(ay, by)

		var nf: Dictionary = {}
		for k in field:
			nf[k] = _apply(tx, ty, field[k])
		for k in KEYS:
			nf[k]["y"] = at[k].y          # 잰 값 그대로
		nf["mound"] = {"x": at["mound"].x, "y": at["mound"].y}

		var nd: Array = []
		for d in _parks["coords"][tier]["defense"]:
			if String(d["pos"]) == "P":
				nd.append({"pos": "P", "x": at["mound"].x, "y": at["mound"].y})
			else:
				var p: Dictionary = _apply(tx, ty, d)
				nd.append({"pos": d["pos"], "x": p["x"], "y": p["y"]})

		out[tier] = {"field": nf, "defense": nd}
		_log.call("  %s 기준 %s · x' = %.4fx %+.1f · y' = %.4fy %+.1f"
			% [tier.rpad(12), id, tx.x, tx.y, ty.x, ty.y])

	_log.call("")
	last_fit = out
	# ⚠ **`_ints`를 거쳐 견준다.** `JSON.parse_string`이 정수를 float으로 주니
	# 날것으로 비교하면 `497.0 != 497`이라 **늘 "다르다"가 나온다**
	if JSON.stringify(out) == JSON.stringify(_ints(_parks["coords"])):
		_log.call("산출한 좌표가 지금 값과 같다 — 고칠 게 없다")
		return true
	_log.call("산출한 좌표가 지금 값과 다르다")
	for tier in out:
		_log.call("  %s field   %s" % [tier.rpad(12),
			_diff_line(_parks["coords"][tier]["field"], out[tier]["field"])])
		_log.call("  %s defense %s" % ["".rpad(12),
			_diff_defense(_parks["coords"][tier]["defense"], out[tier]["defense"])])
	if not do_write:
		_log.call("  (`--write 1`을 주면 %s에 넣는다)" % _path)
		return false
	_write(out)
	return true


## 수비 아홉도 견준다 — field만 보면 **수비수만 어긋난 경우를 놓친다**
func _diff_defense(old: Array, neu: Array) -> String:
	var s: String = ""
	for i in neu.size():
		var a: Dictionary = old[i]
		var b: Dictionary = neu[i]
		if int(a["x"]) != int(b["x"]) or int(a["y"]) != int(b["y"]):
			s += "%s %d,%d→%d,%d  " % [b["pos"], int(a["x"]), int(a["y"]),
				int(b["x"]), int(b["y"])]
	return s if not s.is_empty() else "(같다)"


func _diff_line(old: Dictionary, neu: Dictionary) -> String:
	var s: String = ""
	for k in neu:
		var a: Dictionary = old[k]
		var b: Dictionary = neu[k]
		if int(a["x"]) != int(b["x"]) or int(a["y"]) != int(b["y"]):
			s += "%s %d,%d→%d,%d  " % [k, int(a["x"]), int(a["y"]),
				int(b["x"]), int(b["y"])]
	return s if not s.is_empty() else "(같다)"


## y = a·x + b 최소제곱
func _fit1d(xs: Array, ys: Array) -> Vector2:
	var n: float = float(xs.size())
	var mx: float = 0.0
	var my: float = 0.0
	for i in xs.size():
		mx += float(xs[i])
		my += float(ys[i])
	mx /= n
	my /= n
	var num: float = 0.0
	var den: float = 0.0
	for i in xs.size():
		num += (float(xs[i]) - mx) * (float(ys[i]) - my)
		den += pow(float(xs[i]) - mx, 2.0)
	var a: float = 1.0 if is_zero_approx(den) else num / den
	return Vector2(a, my - a * mx)


func _apply(tx: Vector2, ty: Vector2, p: Dictionary) -> Dictionary:
	return {
		"x": int(roundf(tx.x * float(p["x"]) + tx.y)),
		"y": int(roundf(ty.x * float(p["y"]) + ty.y)),
	}


## ⚠ **`JSON.parse_string`은 정수를 float으로 준다.** 그대로 다시 쓰면
## `"x": 497.0`이 되어 표가 통째로 바뀐다 — 정수는 정수로 되돌린다
func _write(coords: Dictionary) -> void:
	_parks["coords"] = coords
	var f := FileAccess.open(_path, FileAccess.WRITE)
	if f == null:
		_fail.call("%s에 못 쓴다" % _path)
		return
	# 들여쓰기는 스페이스 1칸 — 원본 형식이다.
	# ⚠ **`sort_keys`를 끈다.** 기본값이 `true`라 키가 알파벳순으로 다시
	# 늘어서고 **표 전체가 바뀐 것으로 보인다**(179줄). 값은 그대로인데
	# diff가 파일 통째라 무엇이 바뀌었는지 못 읽는다
	f.store_string(JSON.stringify(_ints(_parks), " ", false) + "\n")
	f.close()
	_log.call("  → %s 갱신했다" % _path)


func _ints(v: Variant) -> Variant:
	if v is Dictionary:
		var out: Dictionary = {}
		for k in v:
			out[k] = _ints(v[k])
		return out
	if v is Array:
		var out: Array = []
		for e in v:
			out.append(_ints(e))
		return out
	if v is float and is_equal_approx(v, roundf(v)):
		return int(v)
	return v


# ── 자잘한 것 ─────────────────────────────────────────────────

## 그림은 비율을 지켜 상자 가운데 놓인다 — `BaseballField.image_rect()`와 같다
func _scale(img: Image) -> Vector3:
	var s: float = minf(CW / img.get_width(), CH / img.get_height())
	return Vector3(s, (CW - img.get_width() * s) * 0.5,
		(CH - img.get_height() * s) * 0.5)


func _to_px(img: Image, code: Vector2) -> Vector2:
	var m: Vector3 = _scale(img)
	return Vector2((code.x - m.y) / m.x, (code.y - m.z) / m.x)


func _to_code(img: Image, px: Vector2) -> Vector2i:
	var m: Vector3 = _scale(img)
	return Vector2i(int(roundf(px.x * m.x + m.y)), int(roundf(px.y * m.x + m.z)))


## ⚠ **`Image.load_from_file`을 안 쓴다.** 그림마다 "export에서는 안 된다"는
## 경고를 뱉어 30장이면 로그가 150줄 늘고 정작 잰 값이 안 보인다.
## 가져오기가 무손실(`compress/mode=0`)이라 텍스처가 원본 픽셀을 그대로 준다
func _load(id: String) -> Image:
	var path: String = "%s/%s.png" % [DIR, id]
	if not ResourceLoader.exists(path):
		return null
	var tex: Texture2D = load(path)
	if tex == null:
		return null
	var img: Image = tex.get_image()
	if img == null:
		return null
	if img.get_format() != Image.FORMAT_RGBA8:
		# `get_image`는 텍스처가 쥔 것을 그대로 준다 — 베껴서 바꾼다
		img = img.duplicate()
		img.convert(Image.FORMAT_RGBA8)
	return img


## 🔴 **화면이 실제로 띄우는 그림만 잰다.** 규칙은 `park_vm.gd:78`이 정본이다 —
## 자기 그림이 있으면 그것, 없으면 `tier_<티어>.png`.
##
## ⚠ `tier_university.png`·`tier_highschool.png`는 **화면에 안 뜬다.** 그림이
## 없는 구장은 `tier_of`에도 없어서 프로로 떨어지기 때문이다. 그런데 그 둘만
## 크기가 다르고(1317×1194 · 1308×1203) 실제 구장은 1306×1204라, 재면 2~3px
## 어긋남이 잡힌다 — **화면은 멀쩡한데 도구만 빨간불이 된다.**
func _stadium_ids() -> Array:
	var out: Dictionary = {}
	for id in _parks.get("tier_of", {}):
		if _parks.get("images", []).has(id):
			out[String(id)] = true
		else:
			out["tier_%s" % _parks["tier_of"][id]] = true
	# 표에 없는 구장(해외는 구장을 한글 이름으로 참조한다)이 떨어지는 기본 그림
	out["tier_%s" % ParkVm.DEFAULT_TIER] = true
	var ids: Array = out.keys()
	ids.sort()
	return ids


## `tier_pro.png` 같은 기준 그림은 이름이 티어를 말한다
func _tier_of(id: String) -> String:
	if id.begins_with("tier_"):
		return id.substr(5)
	return String(_parks["tier_of"].get(id, "pro"))


## 티어를 대표할 그림 하나. 조건이 셋이다:
##
## · **기준 그림이 아니라 실제 구장** — `tier_university.png`만 1317×1194라
##   실제 대학 구장(1306×1204)과 2~3px 어긋난다
## · **다섯 점을 다 잰 것**
## · 🔴 **밝기 폴백을 안 쓴 것.** 야간·노을 구장은 베이스가 흰색이 아니라
##   상위 밝기로 찾는데, 그 값이 1~2px 흔들린다. 알파벳 순으로 고르니
##   대학 대표가 **별빛(야간)**이 되어 산출 좌표가 흔들렸다
func _sample_of(seen: Dictionary, tier: String) -> String:
	for id in seen:
		if String(seen[id]["tier"]) != tier or String(id).begins_with("tier_"):
			continue
		if seen[id]["at"].size() != 5 or not seen[id]["dark"].is_empty():
			continue
		return String(id)
	return ""


func _read_json(path: String) -> Dictionary:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {}
	var v: Variant = JSON.parse_string(f.get_as_text())
	return v if v is Dictionary else {}
