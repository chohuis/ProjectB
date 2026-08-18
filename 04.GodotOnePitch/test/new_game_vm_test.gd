extends GdUnitTestSuite

## 새 게임 화면 ViewModel — M7-6d.
##
## ⚠ **02는 여기서 `Math.random()`을 썼다** — 같은 씨앗에도 주인공이
## 매번 달랐다. 여기서는 씨앗 하나가 주인공까지 정한다.


## ⚠ **옛 검사가 옛 약속을 못 박고 있었다** — `vm["teams"]`에 102개가 한
## 줄로 있는지 봤다. 02는 권역을 먼저 고르게 하고(그 이유가 02 주석에
## 있다) 04도 그렇게 바꿨다. **뜻은 맞다** — 102개를 다 고를 수 있어야
## 한다. 세는 자리만 옮긴다
func test_it_offers_high_school_teams() -> void:
	var total: int = 0
	for r in NewGameVm.regions():
		var teams: Array = NewGameVm.teams_in(String(r["id"]))
		assert_int(teams.size()).override_failure_message(
			"%s 권역이 비었다" % r["label"]).is_greater(0)
		total += teams.size()
		for t in teams:
			assert_str(String(t["name"])).is_not_empty()
	assert_int(total).override_failure_message(
		"고를 수 있는 학교가 %d개다 — 102개여야 한다" % total).is_equal(102)


## ⚠ **찾을 수 있는 순서여야 한다** — 옛 검사의 뜻이 그것이었다.
## 권역은 이름 순이고, 그 안의 학교는 **센 학교부터**다(02도 난이도
## 내림차순으로 준다)
func test_the_lists_are_in_a_findable_order() -> void:
	var regions: Array = NewGameVm.regions()
	for i in range(1, regions.size()):
		assert_bool(String(regions[i - 1]["label"]) <= String(regions[i]["label"])) \
			.override_failure_message("권역이 이름 순이 아니다").is_true()

	var teams: Array = NewGameVm.teams_in(String(regions[0]["id"]))
	for i in range(1, teams.size()):
		assert_bool(float(teams[i - 1]["power"]) >= float(teams[i]["power"])) \
			.override_failure_message("학교가 전력 순이 아니다: %s(%d) 다음에 %s(%d)"
				% [teams[i - 1]["name"], int(teams[i - 1]["power"]),
					teams[i]["name"], int(teams[i]["power"])]).is_true()


## 학교를 안 고르고 들어와도 첫 학교가 골라져 있다 — **빈 칸으로 시작하면
## 시작 버튼이 잠기고 왜 잠겼는지 안 보인다**
func test_a_school_is_picked_for_me() -> void:
	var vm: Dictionary = NewGameVm.build({"team_id": ""})
	assert_str(String(vm["team_id"])).is_not_empty()
	assert_bool(bool(vm["can_start"])).is_true()


## 그래도 학교가 없으면 못 시작한다 — 없는 권역을 주면 목록이 빈다
func test_no_team_blocks_the_start() -> void:
	var vm: Dictionary = NewGameVm.build({"region_id": "STADIUM_NOWHERE"})
	assert_str(String(vm["team_id"])).is_empty()
	assert_bool(bool(vm["can_start"])).is_false()


# ── 권역 2단 ─────────────────────────────────────────────────────

## 🔴 **04는 드롭다운 하나에 102개를 넣고 있었다.** 02는 권역을 먼저
## 고르게 한다 — "고교는 권역이 라이벌·일정을 정한다"
func test_regions_come_first() -> void:
	var regions: Array = NewGameVm.regions()
	assert_int(regions.size()).override_failure_message(
		"권역이 %d개다 — 8개여야 한다" % regions.size()).is_equal(8)
	for r in regions:
		# 이름이 id면 표를 안 읽은 것이다
		assert_bool(String(r["label"]).begins_with("STADIUM_")) \
			.override_failure_message("권역 이름이 id다: %s" % r["label"]).is_false()
		assert_str(String(r["count_label"])).contains("개 학교")


## 고른 학교의 권역이 따라온다 — 둘을 따로 들면 권역 A를 보면서
## 권역 B의 학교로 시작하는 순간이 생긴다
func test_the_region_follows_the_school() -> void:
	var vm: Dictionary = NewGameVm.build({"team_id": "TEAM_HS_AEWOL"})
	assert_str(String(vm["region_id"])).is_equal("STADIUM_HALLA")
	var ids: Array = []
	for t in vm["region_teams"]:
		ids.append(String(t["id"]))
	assert_array(ids).contains(["TEAM_HS_AEWOL"])


## 학교 상세 — **04에 있는 것만 낸다.** 02의 창단·예산·과거 성적은
## `teams.json`에 없다
func test_the_school_detail_says_what_it_is() -> void:
	var d: Dictionary = NewGameVm.team_detail("TEAM_HS_AEWOL")
	assert_str(String(d["name"])).is_equal("애월고")
	var labels: Array = []
	var joined: String = ""
	for r in d["rows"]:
		labels.append(String(r["label"]))
		joined += String(r["value"]) + " "
	assert_array(labels).is_equal(["연고", "구장", "권역", "전력", "재정"])
	assert_str(joined).contains("제주")
	assert_str(joined).contains("한라구장")
	# 전력은 눈금이다 — 최대를 같이 안 적으면 3이 센지 약한지 모른다
	assert_str(joined).contains("/ %d" % NewGameVm.POWER_MAX)


## 없는 학교엔 상세가 없다 — 지어낸 빈 칸을 그리지 않는다
func test_an_unknown_school_has_no_detail() -> void:
	assert_bool(NewGameVm.team_detail("TEAM_NOPE").is_empty()).is_true()
	assert_bool(NewGameVm.team_detail("").is_empty()).is_true()


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


## ⚠ **이 검사가 두 가지를 오탐했다** (F-6b에서 둘 다 걸렸다):
##   · `not_contains`는 **대소문자를 무시한다** — 사전 키 `"label"`까지
##     `Label` 노드로 잡는다. ViewModel이 문구를 주는 건 04 규칙에 맞는 쪽이다
##   · **주석을 코드로 봤다** — 02의 `handednessLabel`을 근거로 인용한 것까지
##     걸렸다. 근거를 못 적게 만드는 검사는 잘못됐다
## 코드 줄만 보고, `String.find`로 대소문자를 가린다.
## ⚠ **여기 있던 복사본을 `CodeText`로 옮겼다** (D-8) — 같은 오탐이 네 곳에
## 더 있었고, 고치는 자리가 다섯이면 그중 하나는 반드시 빠진다
func test_the_view_model_does_not_know_the_screen() -> void:
	for node in ["Control", "Label"]:
		assert_bool(CodeText.lacks("res://ui/new_game_vm.gd", node)) \
			.override_failure_message("ViewModel이 화면 노드를 안다: %s" % node) \
			.is_true()
