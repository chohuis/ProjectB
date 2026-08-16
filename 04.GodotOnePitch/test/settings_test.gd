extends GdUnitTestSuite

## 설정 — 창 크기와 전체화면. U-4.
##
## ⚠ **04엔 설정이 아예 없었다.** `ui/` 아래에서 `설정`·`Settings`·`언어`·
## `locale`이 0건이었다 — **창 크기도 못 바꿨다.** PC(Steam)가 1차 목표인데
## 전체화면 전환이 없었다.
##
## ⚠ **읽는 곳이 없는 설정은 안 만든다.** 02엔 테마·언어·연출 속도·모션
## 줄이기가 있지만 04는 한국어 단일이고 톤이 하나이며 "연출 속도"가 볼 값이
## 어디에도 없다 — 스위치만 만들면 그게 죽은 배선이다.

const APP := preload("res://ui/app.tscn")


func before_test() -> void:
	Settings.clear()


func after_test() -> void:
	Settings.clear()


# ── 값이 남는가 ───────────────────────────────────────────────

## ⚠ **다시 켜도 남아야 한다.** 세션에만 살면 고른 적이 없는 것과 같다
func test_a_chosen_size_survives() -> void:
	Settings.set_size(Vector2i(1920, 1080))
	assert_vector(Settings.of()["size"]).is_equal(Vector2i(1920, 1080))


func test_no_file_means_the_default() -> void:
	assert_vector(Settings.of()["size"]).is_equal(Settings.DEFAULT_SIZE)
	assert_bool(Settings.of()["fullscreen"]).is_false()


func test_fullscreen_survives() -> void:
	Settings.set_fullscreen(true)
	assert_bool(Settings.of()["fullscreen"]).is_true()


## ⚠ **크기를 고르면 전체화면이 풀린다.** 안 그러면 크기를 골라도 화면이
## 그대로라 "눌렀는데 아무 일도 안 일어난다"가 된다
func test_picking_a_size_leaves_fullscreen() -> void:
	Settings.set_fullscreen(true)
	Settings.set_size(Vector2i(1280, 720))
	assert_bool(Settings.of()["fullscreen"]).is_false()


## ⚠ **세로 900 아래를 안 넣는다.** `main_screen`이 3단이라 좁으면 오른쪽
## 칸이 눌린다
func test_every_offered_size_is_tall_enough() -> void:
	for s in Settings.SIZES:
		assert_int(s.y).override_failure_message(
			"%s는 3단을 담기엔 낮다" % Settings.size_label(s)).is_greater_equal(720)


# ── 화면까지 닿는가 ───────────────────────────────────────────

func _mount() -> App:
	var a: App = APP.instantiate()
	add_child(a)
	await await_idle_frame()
	return a


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


## ⚠ **입구가 없으면 화면이 있어도 없는 것과 같다** — 타이틀에서 열린다
func test_the_title_opens_the_settings() -> void:
	var a := await _mount()
	assert_array(_texts(a)).contains(["설정"])
	a.show_settings()
	await await_idle_frame()
	assert_bool(a.current() is SettingsScreen).is_true()
	assert_array(_texts(a)).contains(["전체화면", "돌아가기"])


func test_every_size_is_offered() -> void:
	var a := await _mount()
	a.show_settings()
	await await_idle_frame()
	var t := _texts(a)
	for s in Settings.SIZES:
		assert_array(t).contains([Settings.size_label(s)])


func test_going_back_returns_to_the_title() -> void:
	var a := await _mount()
	a.show_settings()
	await await_idle_frame()
	a.show_title()
	await await_idle_frame()
	assert_bool(a.current() is TitleScreen).is_true()
