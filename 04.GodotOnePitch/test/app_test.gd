extends GdUnitTestSuite

## 앱 진입점 — M7-6d. **타이틀 ↔ 새 게임 ↔ 게임.**
##
## ⚠ **진입점이 비어 있었다.** 지금까지는 코드로만 게임을 시작할 수 있었다.


const APP := preload("res://ui/app.tscn")


func before_test() -> void:
	Slots.clear_all()


func after_test() -> void:
	Slots.clear_all()


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


func _new_game(day: int = 1, name: String = "김한결") -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": name, "team_id": "TEAM_HS_AEWOL"})
	s["day"] = day
	return s


# ── 켜지는가 ──────────────────────────────────────────────────

func test_the_app_opens_on_the_title() -> void:
	var a := await _mount()
	assert_bool(a.current() is TitleScreen).is_true()
	assert_array(_texts(a)).contains(["OnePitch"])


func test_empty_slots_offer_a_new_game() -> void:
	var a := await _mount()
	var t := _texts(a)
	assert_array(t).contains(["비어 있음", "새 게임"])
	assert_array(t).not_contains(["이어하기"])


func test_a_used_slot_offers_to_continue() -> void:
	Slots.save(1, _new_game(70))
	var a := await _mount()
	var t := _texts(a)
	assert_array(t).contains(["이어하기", "덮어쓰기"])
	assert_array(t).contains(["2027년 5월 9일 · 김한결 · 애월고"])


# ── 새 게임 ───────────────────────────────────────────────────

func test_new_game_opens_the_setup_screen() -> void:
	var a := await _mount()
	a.show_new_game()
	await await_idle_frame()
	assert_bool(a.current() is NewGameScreen).is_true()
	assert_array(_texts(a)).contains(["새 게임", "이름", "학교", "시작"])


## ⚠ **만들자마자 저장한다.** 안 하면 첫 진행 전에 껐을 때 슬롯이 비어
## 있고, 사용자는 새 게임을 만든 기억만 남는다
func test_starting_a_game_saves_it_immediately() -> void:
	var a := await _mount()
	a._on_new_game(2)
	await await_idle_frame()
	a._on_start({"name": "박한별", "team_id": "TEAM_HS_AEWOL"})
	await await_idle_frame()

	assert_bool(a.current() is AppRoot).is_true()
	assert_bool(Slots.list()[1]["empty"]).override_failure_message(
		"새 게임을 만들었는데 슬롯이 비어 있다").is_false()
	assert_str(Slots.list()[1]["player_name"]).is_equal("박한별")


func test_going_back_returns_to_the_title() -> void:
	var a := await _mount()
	a.show_new_game()
	await await_idle_frame()
	a.show_title()
	await await_idle_frame()
	assert_bool(a.current() is TitleScreen).is_true()


# ── 이어하기 ──────────────────────────────────────────────────

func test_continuing_loads_that_slot() -> void:
	Slots.save(3, _new_game(88, "이어짐"))
	var a := await _mount()
	a._on_continue(3)
	await await_idle_frame()

	assert_bool(a.current() is AppRoot).is_true()
	var root: AppRoot = a.current()
	assert_int(root.state()["day"]).is_equal(88)
	assert_str(root.state()["protagonist"]["name"]).is_equal("이어짐")


## ⚠ **불러오기가 실패하면 타이틀에 머문다.** 빈 게임으로 넘어가면
## 사용자가 세이브를 잃은 줄 모른 채 새로 시작한다
func test_a_failed_continue_stays_on_the_title() -> void:
	var a := await _mount()
	a._on_continue(1)   # 비어 있다
	await await_idle_frame()
	assert_bool(a.current() is TitleScreen).is_true()
	assert_array(_texts(a)).contains(["불러올 수 없습니다 — 열 수 없음: user://saves/slot1.sav"])


## ⚠ **깨진 슬롯을 빈 슬롯처럼 보이면 안 된다.** 그러면 그 위에 덮어쓴다
func test_a_broken_slot_is_marked() -> void:
	Slots.save(1, _new_game(10))
	var f := FileAccess.open(Slots.path_of(1), FileAccess.WRITE)
	f.store_string("망가진 파일")
	f.close()

	var a := await _mount()
	# ⚠ **자리 번호로 찾으면 안 된다.** 줄 구성이 바뀌면 엉뚱한 것을 본다 —
	# 처음에 그렇게 써서 "1."을 검사했다
	var found: bool = false
	for s in _texts(a):
		if String(s).contains("읽을 수 없음"):
			found = true
	assert_bool(found).override_failure_message(
		"깨진 슬롯 표시가 없다: %s" % [_texts(a)]).is_true()
	# ⚠ **깨진 슬롯엔 "이어하기"가 없다** — 눌러도 열리지 않는다.
	# 다른 슬롯의 "새 게임"까지 막으면 안 되므로 그 줄만 본다
	assert_array(_texts(a)).not_contains(["이어하기"])
	assert_bool(Slots.list()[0]["broken"]).is_true()
	assert_bool(Slots.list()[0]["empty"]).override_failure_message(
		"깨진 슬롯이 빈 것으로 보인다 — 그 위에 덮어쓰게 된다").is_false()


# ── 화면 전환 ─────────────────────────────────────────────────

## ⚠ **옛 화면이 남으면 두 화면이 겹쳐 보인다**
func test_switching_screens_leaves_only_one() -> void:
	var a := await _mount()
	a.show_new_game()
	await await_idle_frame()
	a.show_title()
	await await_idle_frame()
	assert_int(a.get_child_count()).is_equal(1)


## 앱은 상태를 안 든다 — 게임 상태는 `AppRoot`가, 슬롯은 `Slots`가 든다
func test_the_app_does_not_hold_game_state() -> void:
	var src := FileAccess.get_file_as_string("res://ui/app.gd")
	assert_str(src).not_contains("MainVm")
	assert_str(src).not_contains("DayEngine")
	assert_str(src).not_contains("Calendar.")


# ── 덮어쓰기 경고 (U-7) ───────────────────────────────────────
#
# ⚠ **시작을 누르면 `Slots.save`가 옛 세이브를 지운다.** 04에서 되돌릴 수 없는
# 유일한 동작인데 버튼엔 "시작"이라고만 적혀 있었다. 타이틀은 찬 슬롯에서
# "덮어쓰기"라고 말하는데, 새 게임 화면에 들어오면 그 말이 사라졌다.
#
# ⚠ **사전만 고치면 아무 일도 안 일어난다.** `App`이 슬롯 상태를 화면에
# 넘겨야 한다 — 그 배선을 여기서 본다


func test_a_fresh_slot_says_start() -> void:
	var a := await _mount()
	a._on_new_game(1)
	await await_idle_frame()
	assert_array(_texts(a)).contains(["시작"])
	assert_array(_texts(a)).not_contains(["덮어쓰고 시작"])


func test_a_taken_slot_says_it_will_overwrite() -> void:
	Slots.save(1, _new_game())
	var a := await _mount()
	a._on_new_game(1)
	await await_idle_frame()
	assert_array(_texts(a)).contains(["덮어쓰고 시작"])


## ⚠ **슬롯마다 따로 본다.** 1번이 찼다고 2번이 덮어쓰기가 되면 안 된다
func test_another_slot_is_still_fresh() -> void:
	Slots.save(1, _new_game())
	var a := await _mount()
	a._on_new_game(2)
	await await_idle_frame()
	assert_array(_texts(a)).not_contains(["덮어쓰고 시작"])
