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


## 🔴 **값은 그림에서 잰 것이다** (D-6). 02에서 옮긴 값은 다이아몬드가
## 세로로 17% 길고(앵커 790→454 · 그림 800→514) 마운드가 홈→2루의 72%
## 지점이라 1·3루보다 위에 있었다. 1루수·3루수가 베이스보다 42px 위
## 잔디에 떠 있었다
func test_the_bases_are_where_the_picture_puts_them() -> void:
	var pro: Dictionary = ParkVm.build("STADIUM_SEOUL_ROYALS")
	assert_vector(pro["home"]).is_equal(Vector2(497, 800))
	assert_vector(pro["first"]).is_equal(Vector2(720, 622))
	assert_vector(pro["second"]).is_equal(Vector2(497, 514))
	assert_vector(pro["third"]).is_equal(Vector2(275, 622))
	assert_vector(pro["mound"]).is_equal(Vector2(498, 617))


# ── 그림을 열어 맞춰 본다 ─────────────────────────────────────
#
# 🔴 **값을 베끼는 검사는 값이 틀려도 통과한다.** 위 검사는 02에서 옮긴
# 값으로도 초록불이었다 — 그 값이 그림과 42px 어긋나 있는데도. 그래서
# 여기서는 **그림을 실제로 연다.**

const _SAMPLE: Dictionary = {
	"pro": "STADIUM_SEOUL_ROYALS",
	"university": "STADIUM_GEUMGANG_UNIV",
	"highschool": "STADIUM_HANGANG",
}


## 좌표 한 점 둘레에서 **밝은 픽셀이 차지하는 비율**.
## 베이스와 투수판은 흰색이고 그 둘레(잔디·흙)는 어둡다
func _bright_ratio(img: Image, tier: String, p: Dictionary, win: int) -> float:
	var box: Vector2 = ParkVm.viewbox()
	# 그림은 비율을 지켜 상자 가운데 놓인다 — 화면과 같은 계산이다
	var s: float = minf(box.x / img.get_width(), box.y / img.get_height())
	var px: int = int((float(p["x"]) - (box.x - img.get_width() * s) * 0.5) / s)
	var py: int = int((float(p["y"]) - (box.y - img.get_height() * s) * 0.5) / s)
	var lit: int = 0
	var tot: int = 0
	for y in range(py - win, py + win + 1):
		for x in range(px - win, px + win + 1):
			if x < 0 or y < 0 or x >= img.get_width() or y >= img.get_height():
				continue
			var col: Color = img.get_pixel(x, y)
			tot += 1
			if col.r > 0.76 and col.g > 0.76 and col.b > 0.72:
				lit += 1
	return float(lit) / maxf(1.0, float(tot))


func _park_image(tier: String) -> Image:
	var img: Image = Image.load_from_file(
		"res://assets/park/%s.png" % _SAMPLE[tier])
	assert_object(img).override_failure_message(
		"%s 구장 그림을 못 읽는다" % tier).is_not_null()
	return img


## 🔴 **베이스 앵커가 그려진 베이스 위에 있다.**
## 실측 81~100% — 42px 위 잔디였을 땐 0%다
func test_the_base_anchors_sit_on_the_painted_bases() -> void:
	for tier in _SAMPLE:
		var img: Image = _park_image(tier)
		var field: Dictionary = ParkVm.coords_of(tier)["field"]
		for k in ["home", "first", "second", "third"]:
			var lit: float = _bright_ratio(img, tier, field[k], 4)
			assert_float(lit).override_failure_message(
				"%s %s 앵커가 베이스 위가 아니다 — 둘레에 밝은 픽셀이 %.0f%%뿐이다"
				% [tier, k, lit * 100.0]).is_greater(0.70)


## 🔴 **마운드 앵커가 투수판 위에 있다.**
## 투수판은 납작해서(25×3) 창을 채우지 못한다 — 실측 33%.
## 02 값은 투수판보다 69px 위 잔디였다
func test_the_mound_anchor_sits_on_the_rubber() -> void:
	for tier in _SAMPLE:
		var img: Image = _park_image(tier)
		var lit: float = _bright_ratio(
			img, tier, ParkVm.coords_of(tier)["field"]["mound"], 4)
		assert_float(lit).override_failure_message(
			"%s 마운드 앵커가 투수판 위가 아니다 — 밝은 픽셀이 %.0f%%뿐이다"
			% [tier, lit * 100.0]).is_greater(0.25)


## ⚠ **마운드는 다이아몬드 세로 구간의 64% 지점이다** — 세 티어가 같다.
## 02 값은 72%였고, 그 8%가 1·3루보다 위로 올라가게 만들었다
func test_the_mound_keeps_its_depth_in_every_tier() -> void:
	for tier in ["pro", "university", "highschool"]:
		var f: Dictionary = ParkVm.coords_of(tier)["field"]
		var home: float = float(f["home"]["y"])
		var span: float = home - float(f["second"]["y"])
		var depth: float = (home - float(f["mound"]["y"])) / span
		assert_float(depth).override_failure_message(
			"%s 마운드가 다이아몬드의 %.0f%% 지점이다" % [tier, depth * 100.0]) \
			.is_between(0.60, 0.68)


## 🔴 **다시 재는 길이 살아 있다** (D-6b).
##
## 위 검사들은 **지금 값이 맞나**만 본다. 그림이 바뀌면 **새 값을 내야**
## 하는데 그 도구가 조용히 썩으면 아무도 모른다 — 화면은 멀쩡하니까.
## 그래서 도구를 실제로 돌려 표와 같은 값을 내는지 본다.
##
## ⚠ **`--write`를 안 준다** — 검사가 데이터를 고치면 안 된다.
func test_the_measuring_tool_agrees_with_the_table() -> void:
	var said: Array = []
	var code: int = ParkMeasure.new().run(
		func(_line: String) -> void: pass,
		func(line: String) -> void: said.append(line),
		false)
	assert_array(said).override_failure_message(
		"구장을 다시 재니 표와 달랐다 — %s" % str(said)).is_empty()
	assert_int(code).override_failure_message(
		"재는 도구가 %d를 냈다" % code).is_equal(0)


## 🔴 **틀린 표를 줘도 그림에서 찾아낸다** (D-6b).
##
## 위 검사만으로는 부족하다. 표가 이미 맞으면 적합 변환이 **항등**
## (x' = 1.0000x)이 되어 **도구가 아무 일도 안 해도 같은 값이 나온다** —
## 변이 8건 중 6건이 그래서 안 잡혔다. 그러니 표를 02 값으로 되돌려 놓고
## 도구가 그림에서 다시 찾아내는지 본다.
func test_the_tool_finds_the_bases_even_from_a_wrong_table() -> void:
	# 02가 쓰던 값 — 그림보다 42~69px 위다
	var was: Dictionary = {
		"pro": {"home": [497, 790], "first": [715, 580], "second": [497, 454],
			"third": [280, 580], "mound": [497, 548]},
		"university": {"home": [501, 818], "first": [704, 626],
			"second": [501, 511], "third": [299, 626], "mound": [501, 597]},
		"highschool": {"home": [499, 793], "first": [707, 558],
			"second": [499, 417], "third": [292, 558], "mound": [499, 523]},
	}
	var parks: Dictionary = ParkVm.data().duplicate(true)
	for tier in was:
		for k in was[tier]:
			parks["coords"][tier]["field"][k] = {
				"x": was[tier][k][0], "y": was[tier][k][1]}

	var tmp: String = "user://zz_park_measure_test.json"
	var f: FileAccess = FileAccess.open(tmp, FileAccess.WRITE)
	assert_object(f).is_not_null()
	f.store_string(JSON.stringify(parks))
	# ⚠ **`f = null`로는 안 닫힌다.** 해제 시점이 미뤄져 도구가 반쯤 쓰인
	# 파일을 읽었다 — "Unterminated string"
	f.close()

	var m: ParkMeasure = ParkMeasure.new()
	var noop: Callable = func(_line: String) -> void: pass
	m.run(noop, noop, false, tmp)
	DirAccess.remove_absolute(tmp)

	# **세 티어를 다 본다.** 프로만 보면 고교가 8px 어긋나도 통과한다 —
	# 축별 1차 변환이 고교 그림의 원근을 못 맞추는 게 거기서 드러난다
	for tier in was:
		var got: Dictionary = m.last_fit.get(tier, {}).get("field", {})
		assert_bool(got.is_empty()).override_failure_message(
			"%s를 02 값에서 시작하니 좌표를 아예 못 냈다" % tier).is_false()
		var want: Dictionary = ParkVm.coords_of(tier)["field"]
		for k in want:
			var p: Dictionary = got.get(k, {})
			assert_int(int(p.get("y", -1))).override_failure_message(
				"%s %s를 02 값(%d)에서 %d로 냈다 — 그림 값은 %d다"
				% [tier, k, int(was[tier][k][1]), int(p.get("y", -1)),
					int(want[k]["y"])]).is_equal(int(want[k]["y"]))
			assert_int(int(p.get("x", -1))).override_failure_message(
				"%s %s의 x가 %d다 — 그림 값은 %d다"
				% [tier, k, int(p.get("x", -1)), int(want[k]["x"])]) \
				.is_equal(int(want[k]["x"]))

		# ⚠ **투수는 마운드에 선다.** field만 보면 수비 아홉이 통째로
		# 어긋나도 통과한다
		for d in m.last_fit[tier]["defense"]:
			if String(d["pos"]) != "P":
				continue
			assert_int(int(d["y"])).override_failure_message(
				"%s 투수를 %d에 뒀다 — 마운드는 %d다"
				% [tier, int(d["y"]), int(got["mound"]["y"])]) \
				.is_equal(int(got["mound"]["y"]))


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
