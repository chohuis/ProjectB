extends GdUnitTestSuite

## 구장 그림·좌표 — M7-6e3.
##
## ⚠ **예전엔 프로 구장 하나가 하드코딩이었다.** 고교 경기도 대학 경기도
## 전부 프로 구장에서 열렸고, 구장 27개를 미리 정해 둔 설계가 화면에
## 하나도 반영되지 않았다.


# ── 티어를 가리는가 ───────────────────────────────────────────

func test_it_knows_each_tier() -> void:
	assert_str(ParkVm.tier_of("STADIUM_SEOUL_ROYALS")).is_equal("pro")
	assert_str(ParkVm.tier_of("STADIUM_GEUMGANG_UNIV")).is_equal("university")
	assert_str(ParkVm.tier_of("STADIUM_HALLA")).is_equal("highschool")


## ⚠ **모르는 구장은 프로로 떨어진다.** 해외(ABL·JBL)는 구장을 한글 이름으로
## 참조하고 정의가 없다 — 화면이 비면 안 된다
func test_an_unknown_stadium_falls_back_to_pro() -> void:
	assert_str(ParkVm.tier_of("엠파이어 스타디움")).is_equal("pro")
	assert_str(ParkVm.tier_of("")).is_equal("pro")


# ── 그림을 고르는가 ───────────────────────────────────────────

func test_a_stadium_with_its_own_image_uses_it() -> void:
	assert_str(ParkVm.image_path("STADIUM_HALLA")) \
		.is_equal("res://assets/park/STADIUM_HALLA.png")


func test_a_stadium_without_an_image_uses_its_tier() -> void:
	assert_str(ParkVm.image_path("엠파이어 스타디움")) \
		.is_equal("res://assets/park/tier_pro.png")


## ⚠ **그림이 실제로 있어야 한다.** 경로만 맞고 파일이 없으면 화면이
## 회색 판으로 뜨는데, 오류는 안 난다
func test_every_listed_image_exists() -> void:
	for id in ParkVm.data()["images"]:
		var p: String = ParkVm.image_path(String(id))
		assert_bool(ResourceLoader.exists(p)).override_failure_message(
			"그림이 없다: %s" % p).is_true()


func test_every_tier_has_a_fallback_image() -> void:
	for tier in ["pro", "university", "highschool"]:
		var p: String = "res://assets/park/tier_%s.png" % tier
		assert_bool(ResourceLoader.exists(p)).override_failure_message(
			"티어 기본 그림이 없다: %s" % p).is_true()


## ⚠ **표에 있는 구장은 티어도 있어야 한다.** 하나라도 빠지면 그 구장 경기가
## 조용히 프로 좌표로 그려지고, 수비수가 베이스에서 벗어난다
func test_every_image_has_a_tier() -> void:
	var tiers: Dictionary = ParkVm.data()["tier_of"]
	for id in ParkVm.data()["images"]:
		assert_bool(tiers.has(id)).override_failure_message(
			"%s에 티어가 없다" % id).is_true()


# ── 좌표 ──────────────────────────────────────────────────────

## ⚠ **좌표가 티어마다 다르다.** 원본 그림 세 장이 각각 따로 그려져 내야
## 위치가 다르다 — 한 벌로 쓰면 수비수가 베이스에서 벗어난다
func test_the_tiers_have_different_coordinates() -> void:
	var pro: Dictionary = ParkVm.build("STADIUM_SEOUL_ROYALS")
	var hs: Dictionary = ParkVm.build("STADIUM_HALLA")
	assert_vector(pro["second"]).override_failure_message(
		"프로와 고교의 2루가 같다 — 좌표가 한 벌로 쓰이고 있다") \
		.is_not_equal(hs["second"])


func test_the_bases_are_where_the_original_says() -> void:
	var pro: Dictionary = ParkVm.build("STADIUM_SEOUL_ROYALS")
	assert_vector(pro["home"]).is_equal(Vector2(497, 790))
	assert_vector(pro["first"]).is_equal(Vector2(715, 580))
	assert_vector(pro["second"]).is_equal(Vector2(497, 454))
	assert_vector(pro["third"]).is_equal(Vector2(280, 580))
	assert_vector(pro["mound"]).is_equal(Vector2(497, 548))


func test_the_view_box_matches_the_original() -> void:
	assert_vector(ParkVm.viewbox()).is_equal(Vector2(1000, 920))


# ── 수비 ──────────────────────────────────────────────────────

func test_nine_defenders_are_placed() -> void:
	for tier in ["pro", "university", "highschool"]:
		var c: Dictionary = ParkVm.coords_of(tier)
		assert_int(c["defense"].size()).override_failure_message(
			"%s 수비가 %d명이다" % [tier, c["defense"].size()]).is_equal(9)


## 아홉 자리가 전부 다른 포지션이다 — 하나가 겹치면 그 자리가 빈다
func test_the_defenders_cover_every_position() -> void:
	var got: Array = []
	for d in ParkVm.build("STADIUM_HALLA")["defense"]:
		got.append(d["pos"])
	assert_array(got).contains(["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"])
	assert_int(got.size()).is_equal(9)


## ⚠ **투수는 마운드에 선다.** 좌표를 따로 두면 어긋난 채로 그려진다
func test_the_pitcher_stands_on_the_mound() -> void:
	for tier in ["pro", "university", "highschool"]:
		var vm: Dictionary = ParkVm.build(_a_stadium_of(tier))
		for d in vm["defense"]:
			if d["pos"] == "P":
				assert_vector(d["point"]).override_failure_message(
					"%s 투수가 마운드에 없다" % tier).is_equal(vm["mound"])


func _a_stadium_of(tier: String) -> String:
	for id in ParkVm.data()["tier_of"]:
		if ParkVm.data()["tier_of"][id] == tier:
			return String(id)
	return ""


## 수비수가 그림 안에 있어야 한다 — 밖으로 나가면 안 보인다
func test_the_defenders_stay_inside_the_field() -> void:
	var box: Vector2 = ParkVm.viewbox()
	for tier in ["pro", "university", "highschool"]:
		for d in ParkVm.coords_of(tier)["defense"]:
			assert_float(float(d["x"])).is_between(0.0, box.x)
			assert_float(float(d["y"])).is_between(0.0, box.y)


# ── 홈 팀이 정본인가 ──────────────────────────────────────────

## ⚠ **홈 팀 구장에서 경기한다.** 원정 팀 것을 쓰면 매 경기 구장이 뒤바뀐다
func test_the_home_team_decides_the_park() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var vm: Dictionary = ParkVm.for_home_team(s["world"], "TEAM_HS_AEWOL")
	assert_str(vm["stadium_id"]).is_equal("STADIUM_HALLA")
	assert_str(vm["tier"]).is_equal("highschool")


## ⚠ **2군은 모팀 구장을 쓴다.** 안 그러면 2군 경기가 통째로 기본값으로
## 떨어져서 고교·대학 선수가 프로 구장에 선다
func test_a_farm_team_uses_its_parent_park() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	assert_str(ParkVm.for_home_team(s["world"], "TEAM_HS_AEWOL_2")["stadium_id"]) \
		.is_equal("STADIUM_HALLA")


## ⚠ **팀마다 구장이 있어야 한다.** 하나라도 빠지면 그 팀 홈 경기가
## 프로 구장에서 열린다 — 02가 그 상태였다
func test_every_team_has_a_stadium() -> void:
	# ⚠ 2군은 팀 정의가 파생이라 항목이 없다 — `team_field`가 모팀 것을 본다.
	# `t["stadium"]`을 직접 읽으면 2군 38팀이 전부 빈 채로 지나간다
	var missing: Array = []
	for lid in Schedule.LEAGUES:
		for t in World.teams_of(lid):
			if String(World.team_field({}, String(t["id"]), "stadium", "")).is_empty():
				missing.append(t["id"])
	assert_array(missing).override_failure_message(
		"구장 없는 팀 %d개: %s" % [missing.size(), missing.slice(0, 5)]).is_empty()


## 국내 리그는 전용 그림이 있는 구장을 쓴다 — 해외만 기본 그림으로 떨어진다
func test_domestic_leagues_have_their_own_park_images() -> void:
	for lid in ["LEAGUE_HIGHSCHOOL", "LEAGUE_UNIVERSITY", "LEAGUE_KBL"]:
		for t in World.teams_of(lid):
			var sid: String = String(World.team_field({}, String(t["id"]), "stadium", ""))
			assert_bool(ParkVm.has_own_image(sid)).override_failure_message(
				"%s의 구장 %s에 그림이 없다" % [t["id"], sid]).is_true()


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/park_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("TextureRect")
