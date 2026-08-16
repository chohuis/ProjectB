extends GdUnitTestSuite

## 줄 정렬 — 라벨 칸과 값 칸이 줄마다 같은 자리에서 시작하고 끝나는가.
##
## ⚠ **`BarRow`의 라벨 칸이 44px이었다.** "구위"(2글자)는 들어가는데
## "주자견제"·"무브먼트"·"위기관리"(4글자)는 넘쳐서 **막대 시작점이 줄마다
## 달랐다.** 능력치 아홉 줄이 계단처럼 어긋나 보였고, 오류도 로그도 안 난다.
##
## ⚠ **값 칸도 폭이 없었다.** 마지막 자식이라 오른쪽 끝에는 붙지만, 자릿수가
## 바뀌면(9 → 10 → 100) 막대 끝이 같이 움직인다.
##
## ⚠ **이건 눈으로 보고 넘어가기 쉬운 자리다.** 캡처를 봐도 "좀 안 맞네"로
## 지나간다 — 그래서 픽셀을 잰다.

const BAR := preload("res://ui/parts/bar_row.tscn")
const INFO := preload("res://ui/parts/info_row.tscn")

## 실제로 쓰는 가장 긴 라벨들. `status_vm.gd`의 `PITCHING_LABELS`가 정본이고
## 여기 다시 적지 않는다 — 늘어나면 이 검사가 먼저 깨져야 한다
func _pitching_labels() -> Array:
	var out: Array = []
	for pair in StatusVm.PITCHING_LABELS:
		out.append(String(pair[1]))
	return out


func _mount_bars(labels: Array) -> Array:
	var box := VBoxContainer.new()
	box.size = Vector2(560, 400)
	add_child(box)
	var rows: Array = []
	for i in labels.size():
		var r: BarRow = BAR.instantiate()
		box.add_child(r)
		r.setup_stat(String(labels[i]), 40.0 + i * 7.0)
		rows.append(r)
	await await_idle_frame()
	await await_idle_frame()
	return rows


## ⚠ **막대가 같은 x에서 시작해야 한다.** 라벨 길이가 달라도 흔들리면 안 된다
func test_every_bar_starts_at_the_same_x() -> void:
	var rows: Array = await _mount_bars(_pitching_labels())
	var first: float = (rows[0].get_node("Bar") as Control).position.x
	for r in rows:
		var x: float = (r.get_node("Bar") as Control).position.x
		assert_float(x).override_failure_message(
			"막대 시작점이 어긋난다: '%s'가 %.1f (첫 줄은 %.1f)" % [
				(r.get_node("Name") as Label).text, x, first]).is_equal(first)


## ⚠ **막대가 같은 x에서 끝나야 한다.** 값 칸이 자릿수를 타면 끝이 흔들린다
func test_every_bar_ends_at_the_same_x() -> void:
	var rows: Array = await _mount_bars(["구위", "제구", "주자견제"])
	# 한 자리 · 두 자리 · 세 자리를 섞는다
	rows[0].setup("구위", 0.5, "9", AppTheme.TEXT)
	rows[1].setup("제구", 0.5, "48", AppTheme.TEXT)
	rows[2].setup("주자견제", 0.5, "100", AppTheme.TEXT)
	await await_idle_frame()
	await await_idle_frame()
	var first: Control = rows[0].get_node("Bar")
	var edge: float = first.position.x + first.size.x
	for r in rows:
		var b: Control = r.get_node("Bar")
		assert_float(b.position.x + b.size.x).override_failure_message(
			"막대 끝이 자릿수를 탄다: '%s'" % (r.get_node("Right") as Label).text
			).is_equal(edge)


## 그 라벨을 실제 폰트로 그리면 몇 px인가.
##
## ⚠ **`get_minimum_size()`로는 못 잰다.** `clip_text = true`면 최소 크기가
## 글자 폭을 안 본다 — 그걸로 검사를 짰다가 **44px로 되돌리는 변이를 못 잡았다.**
## 칸이 좁으면 막대는 안 어긋나고 글자만 잘리는데, 그건 오류가 아니라
## "주자견..."으로 조용히 나온다
func _text_width(l: Label) -> float:
	var f: Font = l.get_theme_font("font")
	return f.get_string_size(l.text, HORIZONTAL_ALIGNMENT_LEFT, -1,
		l.get_theme_font_size("font_size")).x


## 네 글자 라벨이 잘리지 않고 들어가야 한다
func test_the_longest_label_fits_without_clipping() -> void:
	var rows: Array = await _mount_bars(_pitching_labels())
	for r in rows:
		var n: Label = r.get_node("Name")
		assert_float(n.size.x).override_failure_message(
			"라벨 칸이 좁아 글자가 잘린다: '%s'는 %.1fpx가 필요한데 칸이 %.1fpx다" % [
				n.text, _text_width(n), n.size.x]
			).is_greater_equal(_text_width(n))


## ⚠ **값은 오른쪽에 붙는다.** 왼쪽에 붙이면 칸 폭이 같아도 숫자가 자릿수마다
## 다른 자리에서 시작해 들쭉날쭉해진다
func test_values_hug_the_right_edge() -> void:
	var rows: Array = await _mount_bars(["구위"])
	assert_int((rows[0].get_node("Right") as Label).horizontal_alignment
		).is_equal(HORIZONTAL_ALIGNMENT_RIGHT)


## ⚠ **`InfoRow`도 같다.** 카드 안에서 값이 오른쪽 한 줄로 서야 한다
func test_info_rows_line_their_values_up() -> void:
	var box := VBoxContainer.new()
	box.size = Vector2(560, 200)
	add_child(box)
	var pairs: Array = [["소속", "제주 애월고 · 고교"], ["연봉", "3,000만원"],
		["잔여 기간", "2년 (만료: 2030년)"], ["FA 자격", "7년 후"]]
	var rows: Array = []
	for p in pairs:
		var r: InfoRow = INFO.instantiate()
		box.add_child(r)
		r.setup(String(p[0]), String(p[1]))
		rows.append(r)
	await await_idle_frame()
	await await_idle_frame()

	var v0: Control = rows[0].get_node("Value")
	var edge: float = v0.position.x + v0.size.x
	for r in rows:
		var v: Control = r.get_node("Value")
		assert_float(v.position.x + v.size.x).override_failure_message(
			"값 오른쪽 끝이 어긋난다: '%s'" % (v as Label).text).is_equal(edge)
