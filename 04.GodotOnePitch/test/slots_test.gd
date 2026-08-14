extends GdUnitTestSuite

## 세이브 슬롯 — M7-6d.
##
## 원본: `features/save-slots/` · `slotdb.cjs`
##
## ⚠ **목록이 세이브를 통째로 읽으면 안 된다.** 슬롯마다 0.57MB를 풀면
## 목록 하나 여는 데 몇 초가 걸린다 — 머리말만 읽는다(`SaveGame.read_header`).
##
## ⚠ **덮어쓰기 전에 무엇이 있는지 보여야 한다.** 02는 슬롯 화면이 없어
## 확인할 방법이 없었다.


func before_test() -> void:
	Slots.clear_all()


func after_test() -> void:
	Slots.clear_all()


func _state(day: int = 1, name: String = "김한결") -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": name, "team_id": "TEAM_HS_AEWOL"})
	s["day"] = day
	return s


# ── 목록 ──────────────────────────────────────────────────────

## ⚠ **슬롯 수는 고정이다.** 늘리고 줄이면 화면이 흔들리고, 사용자가
## "3번이 어디 갔지"를 겪는다
func test_there_are_always_the_same_number_of_slots() -> void:
	assert_int(Slots.list().size()).is_equal(Slots.COUNT)


func test_an_empty_slot_says_it_is_empty() -> void:
	for s in Slots.list():
		assert_bool(s["empty"]).is_true()
		assert_str(s["label"]).is_equal("비어 있음")


func test_a_used_slot_shows_who_is_in_it() -> void:
	Slots.save(1, _state(70, "김한결"))
	var rows: Array = Slots.list()
	assert_bool(rows[0]["empty"]).is_false()
	assert_str(rows[0]["player_name"]).is_equal("김한결")
	assert_int(rows[0]["day"]).is_equal(70)
	# 날짜는 사람이 읽는 모양으로 — 화면이 다시 만들지 않는다
	assert_str(rows[0]["label"]).is_equal("2027년 5월 9일 · 김한결 · 애월고")


## ⚠ **목록이 본문을 안 푼다.** 슬롯마다 0.57MB를 풀면 몇 초가 걸린다
func test_listing_does_not_read_the_body() -> void:
	for i in range(1, Slots.COUNT + 1):
		Slots.save(i, _state(10 * i))
	var t0: int = Time.get_ticks_msec()
	Slots.list()
	assert_int(Time.get_ticks_msec() - t0).override_failure_message(
		"슬롯 %d개 목록에 %dms — 머리말만 읽어야 한다"
		% [Slots.COUNT, Time.get_ticks_msec() - t0]).is_less(50)


# ── 저장·불러오기 ─────────────────────────────────────────────

func test_a_saved_slot_comes_back() -> void:
	Slots.save(2, _state(42))
	var r: Dictionary = Slots.load_slot(2)
	assert_str(r["error"]).is_empty()
	assert_int(r["state"]["day"]).is_equal(42)


func test_loading_an_empty_slot_reports_an_error() -> void:
	var r: Dictionary = Slots.load_slot(3)
	assert_str(r["error"]).is_not_empty()
	assert_bool(r["state"].is_empty()).is_true()


## ⚠ **슬롯 번호가 범위 밖이면 남의 파일을 건드리면 안 된다**
func test_an_out_of_range_slot_is_refused() -> void:
	assert_int(Slots.save(0, _state())).is_not_equal(OK)
	assert_int(Slots.save(Slots.COUNT + 1, _state())).is_not_equal(OK)
	assert_str(Slots.load_slot(0)["error"]).is_not_empty()


## 덮어쓰면 새 것이 온다
func test_saving_over_a_slot_replaces_it() -> void:
	Slots.save(1, _state(10))
	Slots.save(1, _state(90))
	assert_int(Slots.load_slot(1)["state"]["day"]).is_equal(90)


# ── 지우기 ────────────────────────────────────────────────────

func test_a_deleted_slot_becomes_empty() -> void:
	Slots.save(1, _state(10))
	assert_bool(Slots.list()[0]["empty"]).is_false()
	Slots.delete(1)
	assert_bool(Slots.list()[0]["empty"]).is_true()


func test_deleting_an_empty_slot_does_not_break() -> void:
	Slots.delete(2)
	assert_bool(Slots.list()[1]["empty"]).is_true()


## ⚠ **슬롯을 지워도 다른 슬롯은 그대로다.** 02의 세이브가 파일 하나라
## 이 실수가 없었지만, 슬롯이 생기면 경로 계산이 틀릴 수 있다
func test_deleting_one_slot_leaves_the_others() -> void:
	Slots.save(1, _state(10))
	Slots.save(2, _state(20))
	Slots.delete(1)
	assert_bool(Slots.list()[0]["empty"]).is_true()
	assert_int(Slots.load_slot(2)["state"]["day"]).is_equal(20)


# ── 깨진 세이브 ───────────────────────────────────────────────

## ⚠ **깨진 세이브가 목록을 죽이면 안 된다.** 한 슬롯이 상했다고 나머지를
## 못 보면 복구할 방법이 없다
func test_a_broken_slot_shows_as_broken_not_empty() -> void:
	Slots.save(1, _state(10))
	var f := FileAccess.open(Slots.path_of(1), FileAccess.WRITE)
	f.store_string("망가진 파일")
	f.close()

	var rows: Array = Slots.list()
	assert_bool(rows[0]["empty"]).is_false()
	assert_bool(rows[0]["broken"]).override_failure_message(
		"깨진 슬롯이 멀쩡한 것으로 보인다").is_true()
	assert_str(rows[0]["label"]).contains("읽을 수 없음")


func test_a_broken_slot_does_not_stop_the_list() -> void:
	Slots.save(1, _state(10))
	Slots.save(2, _state(20))
	var f := FileAccess.open(Slots.path_of(1), FileAccess.WRITE)
	f.store_string("망가진 파일")
	f.close()

	var rows: Array = Slots.list()
	assert_int(rows.size()).is_equal(Slots.COUNT)
	assert_str(rows[1]["player_name"]).is_equal("김한결")


## ⚠ **슬롯 수가 바뀌면 화면이 흔들린다.** "3개"를 못박는다 —
## `COUNT`와 비교하면 둘이 같이 움직여서 아무것도 안 본다
func test_there_are_exactly_three_slots() -> void:
	assert_int(Slots.COUNT).is_equal(3)
	assert_int(Slots.list().size()).is_equal(3)


## ⚠ **마지막 슬롯도 쓸 수 있어야 한다.** 경계를 하나 좁히면 3번이
## 조용히 안 쓰인다
func test_the_last_slot_works() -> void:
	assert_int(Slots.save(3, _state(50))).is_equal(OK)
	assert_int(Slots.load_slot(3)["state"]["day"]).is_equal(50)
	assert_bool(Slots.list()[2]["empty"]).is_false()


func test_the_first_slot_works() -> void:
	assert_int(Slots.save(1, _state(50))).is_equal(OK)
	assert_bool(Slots.list()[0]["empty"]).is_false()


## ⚠ **지울 때도 범위를 본다.** 안 보면 `slot0.sav` 같은 없는 경로를
## 지우려 들고, 나중에 경로 규칙이 바뀌면 남의 파일을 지운다
func test_deleting_out_of_range_does_nothing() -> void:
	Slots.save(1, _state(10))
	Slots.delete(0)
	Slots.delete(Slots.COUNT + 1)
	assert_bool(Slots.list()[0]["empty"]).override_failure_message(
		"범위 밖 삭제가 멀쩡한 슬롯을 건드렸다").is_false()


## ⚠ **폴더가 없으면 저장이 통째로 실패한다.** 새로 깐 기계의 첫 저장이 그렇다
func test_saving_works_without_an_existing_folder() -> void:
	var dir := DirAccess.open("user://")
	if dir != null and dir.dir_exists("saves"):
		Slots.clear_all()
		DirAccess.remove_absolute(ProjectSettings.globalize_path(Slots.DIR))
	assert_int(Slots.save(1, _state(10))).override_failure_message(
		"폴더가 없을 때 저장이 실패했다").is_equal(OK)
	assert_bool(Slots.list()[0]["empty"]).is_false()


## ⚠ **0일차 세이브가 와도 달력이 뒷걸음치면 안 된다.** 시즌 일차는 1부터라
## 0을 그대로 넣으면 목록에 "2월 28일"이 뜬다
func test_a_zero_day_header_does_not_walk_back() -> void:
	var s: Dictionary = _state(1)
	s["day"] = 0
	SaveGame.write(Slots.path_of(1), s)
	assert_str(Slots.list()[0]["label"]).override_failure_message(
		"0일차가 %s로 보인다" % Slots.list()[0]["label"]).contains("3월 1일")
