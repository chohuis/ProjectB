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


## ⚠ **옛 검사가 OVR로 씨앗 차이를 쟀다** — 이제 OVR은 프리셋이 정한다
## (넷 다 68). **뜻은 맞다** — 씨앗이 다르면 다른 주인공이 나와야 한다.
## 재는 축을 옮긴다: 잠재력과 성장률은 여전히 씨앗이 정한다
func test_a_different_seed_makes_a_different_protagonist() -> void:
	var a: Dictionary = NewGameVm.start({"seed": 1, "name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	var b: Dictionary = NewGameVm.start({"seed": 2, "name": "박한별",
		"team_id": "TEAM_HS_AEWOL"})
	assert_float(a["protagonist"]["potential_hidden"]) \
		.override_failure_message("씨앗이 달라도 잠재력이 같다") \
		.is_not_equal(b["protagonist"]["potential_hidden"])
	# 시작 능력치는 같아야 한다 — 유형을 골랐는데 씨앗이 그것을 흔들면
	# 고른 뜻이 없어진다
	assert_float(a["protagonist"]["pitching"]["ovr"]) \
		.is_equal(b["protagonist"]["pitching"]["ovr"])


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


# ── 능력치 프리셋 ────────────────────────────────────────────────

## 🔴 **04엔 이 단계가 통째로 없었다** — `PlayerGen`이 무작위로 만든
## 능력치를 그대로 썼다. 02는 유형 넷 중 하나를 고르게 한다
func test_유형이_넷이다() -> void:
	var list: Array = NewGameVm.presets()
	assert_int(list.size()).is_equal(4)
	var labels: Array = []
	for p in list:
		labels.append(String(p["label"]))
	assert_array(labels).is_equal(["균형형", "파워피처", "제구형", "체력형"])


## ⚠ **넷 다 OVR 68이다.** 한쪽이 세면 고르는 게 아니라 정답이 된다
func test_유형은_세기가_아니라_방향이다() -> void:
	for p in NewGameVm.PRESETS:
		assert_int(int(p["pitching"]["ovr"])).override_failure_message(
			"%s의 OVR이 68이 아니다" % p["label"]).is_equal(68)


## 02 값 그대로 — 파워피처는 구위 78 · 제구 60
func test_값이_02_그대로다() -> void:
	var power: Dictionary = NewGameVm.preset_of("power")["pitching"]
	assert_int(int(power["velocity"])).is_equal(78)
	assert_int(int(power["control"])).is_equal(60)
	var control: Dictionary = NewGameVm.preset_of("control")["pitching"]
	assert_int(int(control["command"])).is_equal(78)
	assert_int(int(control["velocity"])).is_equal(57)


## 🔴 **02는 두 구종으로 시작한다.** 04는 직구 하나였다
func test_두_구종으로_시작한다() -> void:
	for p in NewGameVm.PRESETS:
		assert_int((p["pitches"] as Array).size()).override_failure_message(
			"%s가 구종 %d개로 시작한다 — 02는 둘이다"
			% [p["label"], (p["pitches"] as Array).size()]).is_equal(2)
		assert_str(String(p["pitches"][0]["id"])).is_equal("fastball")
		# 유형마다 둘째 구종이 다르다 — 그게 유형을 만든다
		assert_str(String(p["pitches"][1]["id"])).is_not_equal("fastball")


## 숙련도도 02 값이다 — 04는 직구를 3(보통)으로 주고 있었다
func test_숙련도가_02_값이다() -> void:
	assert_int(int(NewGameVm.preset_of("balanced")["pitches"][0]["grade"])).is_equal(1)
	assert_int(int(NewGameVm.preset_of("power")["pitches"][0]["grade"])).is_equal(2)


## 모르는 유형은 균형형 — 고르지 않은 채로 시작할 수는 없다
func test_모르는_유형은_균형형이다() -> void:
	assert_str(String(NewGameVm.preset_of("")["id"])).is_equal("balanced")
	assert_str(String(NewGameVm.preset_of("NOPE")["id"])).is_equal("balanced")


## 카드에 능력치와 구종이 같이 적힌다 — 숫자 없이 고를 수 없다
func test_카드에_근거가_붙는다() -> void:
	for p in NewGameVm.presets():
		assert_int((p["rows"] as Array).size()).is_equal(6)
		assert_str(String(p["desc"])).is_not_empty()
		assert_str(String(p["pitch_label"])).override_failure_message(
			"%s에 구종이 안 적혔다" % p["label"]).is_not_empty()
	# 제구형은 체인지업을 받는다 — 설명이 그 이야기를 한다
	var control: Dictionary = {}
	for p in NewGameVm.presets():
		if String(p["id"]) == "control":
			control = p
	assert_str(String(control["pitch_label"])).contains("체인지업")


# ── 프리셋이 주인공까지 가나 ──────────────────────────────────────

## 🔴 **여기가 요점이다.** 고른 유형이 세이브의 능력치여야 한다
func test_고른_유형이_주인공이_된다() -> void:
	var s: Dictionary = NewGameVm.start({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL", "preset": "power"})
	var pit: Dictionary = s["protagonist"]["pitching"]
	assert_float(float(pit["velocity"])).is_equal(78.0)
	assert_float(float(pit["control"])).is_equal(60.0)
	assert_int((s["protagonist"]["pitches"] as Array).size()).is_equal(2)
	assert_str(String(s["protagonist"]["pitches"][1]["id"])).is_equal("cutter")


## 유형이 다르면 주인공도 다르다 — 같은 씨앗이라도
func test_유형이_다르면_주인공이_다르다() -> void:
	var a: Dictionary = NewGameVm.start({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL", "preset": "power"})
	var b: Dictionary = NewGameVm.start({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL", "preset": "control"})
	assert_float(float(a["protagonist"]["pitching"]["velocity"])) \
		.override_failure_message("유형을 바꿨는데 구위가 같다") \
		.is_not_equal(float(b["protagonist"]["pitching"]["velocity"]))


## 유형을 안 주면 균형형으로 시작한다 — 무작위로 두지 않는다
func test_안_고르면_균형형으로_시작한다() -> void:
	var s: Dictionary = NewGameVm.start({"seed": 9, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	assert_float(float(s["protagonist"]["pitching"]["velocity"])).is_equal(70.0)
	assert_int((s["protagonist"]["pitches"] as Array).size()).is_equal(2)


## 팀 고르기에도 마크가 온다 — 02도 여기에 크게 띄운다(96px)
func test_학교_상세에_마크가_온다() -> void:
	var d: Dictionary = NewGameVm.team_detail("TEAM_HS_AEWOL")
	var mark: Dictionary = d["mark"]
	assert_str(String(mark["team_id"])).is_equal("TEAM_HS_AEWOL")
	var colors: Array = World.team_field({}, "TEAM_HS_AEWOL", "colors", [])
	assert_str(String(mark["primary"])).is_equal(String(colors[0]))
