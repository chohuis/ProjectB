extends GdUnitTestSuite

## 새 게임 화면 ViewModel — M7-6d.
##
## ⚠ **02는 여기서 `Math.random()`을 썼다** — 같은 씨앗에도 주인공이
## 매번 달랐다. 여기서는 씨앗 하나가 주인공까지 정한다.


func test_it_offers_high_school_teams() -> void:
	var vm: Dictionary = NewGameVm.build()
	assert_int(vm["teams"].size()).is_equal(102)
	for t in vm["teams"]:
		assert_str(t["name"]).is_not_empty()


## ⚠ **이름 순이다.** 102팀에서 자기 학교를 찾으려면 순서가 있어야 한다
func test_the_team_list_is_sorted_by_name() -> void:
	var teams: Array = NewGameVm.build()["teams"]
	for i in range(1, teams.size()):
		assert_bool(teams[i - 1]["name"] <= teams[i]["name"]) \
			.override_failure_message("팀 목록이 이름 순이 아니다").is_true()


func test_it_starts_with_a_default_name_and_team() -> void:
	var vm: Dictionary = NewGameVm.build()
	assert_str(vm["name"]).is_not_empty()
	assert_str(vm["team_id"]).is_not_empty()
	assert_bool(vm["can_start"]).is_true()


## ⚠ **이름이 비면 시작할 수 없다.** 빈 이름으로 만들면 화면 곳곳이
## 빈칸이 되고 원인을 못 찾는다
func test_an_empty_name_blocks_the_start() -> void:
	assert_bool(NewGameVm.build({"name": ""})["can_start"]).is_false()
	assert_bool(NewGameVm.build({"name": "   "})["can_start"]).is_false()


func test_no_team_blocks_the_start() -> void:
	assert_bool(NewGameVm.build({"team_id": ""})["can_start"]).is_false()


# ── 시작 ──────────────────────────────────────────────────────

func test_starting_makes_a_playable_game() -> void:
	var s: Dictionary = NewGameVm.start({"seed": 42, "season_year": 2027,
		"name": "박한별", "team_id": "TEAM_HS_AEWOL"})
	assert_str(s["protagonist"]["name"]).is_equal("박한별")
	assert_str(s["protagonist"]["team_id"]).is_equal("TEAM_HS_AEWOL")
	assert_int(s["day"]).is_equal(1)
	assert_bool(s["schedule"].is_empty()).is_false()


## ⚠ **이름의 앞뒤 공백을 떼어 낸다.** 안 떼면 화면 정렬이 어긋나고
## 검색이 안 맞는다
func test_the_name_is_trimmed() -> void:
	var s: Dictionary = NewGameVm.start({"seed": 42, "name": "  박한별  ",
		"team_id": "TEAM_HS_AEWOL"})
	assert_str(s["protagonist"]["name"]).is_equal("박한별")


## ⚠ **씨앗 하나가 주인공까지 정한다.** 02는 여기가 `Math.random()`이라
## 같은 씨앗에도 주인공 잠재력·성장률이 매번 달랐다
func test_the_same_seed_makes_the_same_protagonist() -> void:
	var a: Dictionary = NewGameVm.start({"seed": 42, "name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	var b: Dictionary = NewGameVm.start({"seed": 42, "name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	assert_float(a["protagonist"]["potential_hidden"]).is_equal(b["protagonist"]["potential_hidden"])
	assert_float(a["protagonist"]["development_rate"]) \
		.is_equal(b["protagonist"]["development_rate"])
	assert_float(a["protagonist"]["pitching"]["ovr"]) \
		.is_equal(b["protagonist"]["pitching"]["ovr"])


func test_a_different_seed_makes_a_different_protagonist() -> void:
	var a: Dictionary = NewGameVm.start({"seed": 1, "name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	var b: Dictionary = NewGameVm.start({"seed": 2, "name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	assert_float(a["protagonist"]["pitching"]["ovr"]) \
		.is_not_equal(b["protagonist"]["pitching"]["ovr"])


## ⚠ **씨앗을 안 주면 뽑되, 그 값이 세이브에 남아야 한다.** 안 남으면
## 같은 세계를 다시 못 만든다
func test_an_unseeded_game_still_records_its_seed() -> void:
	var s: Dictionary = NewGameVm.start({"name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	assert_int(s["seed"]).is_not_equal(0)


# ── 덮어쓰기 (U-7) ────────────────────────────────────────────
#
# ⚠ **시작을 누르는 순간 `Slots.save`가 옛 세이브를 지운다** (`app.gd:81`).
# 04에서 **되돌릴 수 없는 유일한 동작**인데 버튼엔 "시작"이라고만 적혀 있었다.
# 타이틀은 찬 슬롯에서 "덮어쓰기"라고 말하는데(`title_screen.gd:73-74`)
# 새 게임 화면에 들어오면 그 말이 사라졌다.


func test_an_empty_slot_just_starts() -> void:
	var vm: Dictionary = NewGameVm.build()
	assert_bool(vm["overwrite"]).is_false()
	assert_str(vm["start_label"]).is_equal("시작")


func test_a_taken_slot_says_it_will_overwrite() -> void:
	var vm: Dictionary = NewGameVm.build({"overwrite": true})
	assert_bool(vm["overwrite"]).is_true()
	assert_str(vm["start_label"]).is_equal("덮어쓰고 시작")


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/new_game_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")
