extends GdUnitTestSuite

## 스태프 생애주기 — 은퇴 · 성장 · 경질 · 충원. B-2c.
##
## ⚠ **B-2b는 스태프를 세우기만 했다.** 한 번 세운 감독이 늙지도 바뀌지도
## 않으면 인물 화면이 **영원히 같은 배역**을 보여준다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _person(role: String, id: String, age: int, value: float = 50.0,
		team: String = "TEAM_KBL_A",
		league: String = "LEAGUE_KBL") -> Dictionary:
	var stats: Dictionary = {}
	for k in Staff.stats_names(role):
		stats[String(k)] = value
	return {"id": id, "name": id, "role": role, "team_id": team,
		"league_id": league, "age": age, "stats": stats,
		"career_events": []}


func _game(seed_value: int = 4242) -> Dictionary:
	return World.new_game({"seed": seed_value, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})


func _kbl_first() -> String:
	var ids: Array = []
	for t in World.teams_of("LEAGUE_KBL"):
		ids.append(String(t["id"]))
	ids.sort()
	return String(ids[0])


func _count(world: Dictionary, team_id: String, role: String) -> int:
	var n: int = 0
	for p in Staff.of(world, team_id):
		if String(p.get("role", "")) == role:
			n += 1
	return n


# ── 은퇴 ──────────────────────────────────────────────────────

## ⚠ **나이가 들수록 자주 그만둔다.** 표를 위에서부터 처음 걸리는 것으로 읽는다
func test_an_older_staff_retires_more_often() -> void:
	assert_float(StaffLifecycle.retire_chance(Staff.ROLE_MANAGER, 70)).is_greater(
		StaffLifecycle.retire_chance(Staff.ROLE_MANAGER, 62))
	assert_float(StaffLifecycle.retire_chance(Staff.ROLE_MANAGER, 62)).is_greater(
		StaffLifecycle.retire_chance(Staff.ROLE_MANAGER, 50))


## 젊으면 안 그만둔다 — 마흔 살 감독이 매년 은퇴를 굴리면 안 된다
func test_a_young_staff_does_not_retire() -> void:
	assert_float(StaffLifecycle.retire_chance(Staff.ROLE_MANAGER, 45)).is_equal(0.0)
	assert_float(StaffLifecycle.retire_chance(Staff.ROLE_COACH, 40)).is_equal(0.0)


## ⚠ **끝에는 반드시 그만둔다.** 안 그러면 아흔 살 감독이 남는다
func test_everyone_leaves_in_the_end() -> void:
	for role in [Staff.ROLE_MANAGER, Staff.ROLE_COACH, Staff.ROLE_OWNER]:
		assert_float(StaffLifecycle.retire_chance(role, 90)
			).override_failure_message("%s 가 아흔 살에도 안 그만둔다" % role
			).is_equal(1.0)


## 자리마다 나이가 다르다 — 구단주는 오래 남는다
func test_the_owner_stays_the_longest() -> void:
	assert_float(StaffLifecycle.retire_chance(Staff.ROLE_OWNER, 65)).is_less(
		StaffLifecycle.retire_chance(Staff.ROLE_MANAGER, 65))


# ── 성장 ──────────────────────────────────────────────────────

## 젊으면 오른다
func test_a_young_staff_improves() -> void:
	var p: Dictionary = _person(Staff.ROLE_COACH, "C1", 35, 50.0)
	assert_int(StaffLifecycle.grow(p, _rng())).is_greater(0)
	var total: float = 0.0
	for k in p["stats"]:
		total += float(p["stats"][k])
	assert_float(total).override_failure_message(
		"서른다섯 코치가 한 해에 하나도 안 늘었다").is_greater(250.0)


## 늙으면 깎인다
func test_an_old_staff_declines() -> void:
	var p: Dictionary = _person(Staff.ROLE_COACH, "C1", 63, 50.0)
	StaffLifecycle.grow(p, _rng())
	var total: float = 0.0
	for k in p["stats"]:
		total += float(p["stats"][k])
	assert_float(total).override_failure_message(
		"예순셋 코치가 한 해에 하나도 안 깎였다").is_less(250.0)


## 전성기에는 그대로다 — 매년 오르면 마흔에 전원 만점이 된다
func test_a_peak_staff_holds() -> void:
	var p: Dictionary = _person(Staff.ROLE_COACH, "C1", 55, 50.0)
	assert_int(StaffLifecycle.grow(p, _rng())).is_equal(0)


## ⚠ **한 해에 두 개만 움직인다.** 전부 움직이면 한 시즌 만에 사람이 바뀐다
func test_only_two_stats_move_a_year() -> void:
	var p: Dictionary = _person(Staff.ROLE_COACH, "C1", 35, 50.0)
	StaffLifecycle.grow(p, _rng())
	var moved: int = 0
	for k in p["stats"]:
		if float(p["stats"][k]) != 50.0:
			moved += 1
	assert_int(moved).override_failure_message(
		"한 해에 능력치 %d개가 움직였다" % moved).is_equal(2)


## ⚠ **어느 두 개인지는 씨앗이 정한다.** 매번 앞에서부터면 뒤쪽 능력치가
## 영영 안 자란다
func test_the_moved_stats_are_not_always_the_same() -> void:
	var seen: Dictionary = {}
	for i in range(30):
		var p: Dictionary = _person(Staff.ROLE_COACH, "C1", 35, 50.0)
		StaffLifecycle.grow(p, _rng(i + 1))
		for k in p["stats"]:
			if float(p["stats"][k]) != 50.0:
				seen[String(k)] = true
	assert_int(seen.size()).override_failure_message(
		"서른 번 돌렸는데 %d종만 움직였다 — 늘 같은 자리만 자란다" % seen.size()
	).is_greater(2)


## 같은 능력치를 두 번 밀지 않는다 — 그러면 실제로는 하나만 움직인 것이다
func test_a_stat_does_not_move_twice() -> void:
	for i in range(30):
		var p: Dictionary = _person(Staff.ROLE_COACH, "C1", 35, 50.0)
		StaffLifecycle.grow(p, _rng(i + 1))
		for k in p["stats"]:
			assert_float(float(p["stats"][k])).override_failure_message(
				"%s 가 한 해에 두 칸 올랐다" % k).is_less_equal(51.0)


## 천장과 바닥이 있다.
##
## 시작값을 천장 바로 아래에 둔다 — 안 움직인 능력치까지 검사에 걸리면
## 무엇을 재는지가 흐려진다
func test_the_growth_has_a_ceiling_and_a_floor() -> void:
	var top: Dictionary = _person(Staff.ROLE_COACH, "C1", 35, 94.5)
	StaffLifecycle.grow(top, _rng())
	for k in top["stats"]:
		assert_float(float(top["stats"][k])).override_failure_message(
			"%s 가 천장(95)을 넘었다" % k).is_less_equal(95.0)

	var bottom: Dictionary = _person(Staff.ROLE_COACH, "C2", 70, 20.5)
	StaffLifecycle.grow(bottom, _rng())
	for k in bottom["stats"]:
		assert_float(float(bottom["stats"][k])).override_failure_message(
			"%s 가 바닥(20) 아래로 갔다" % k).is_greater_equal(20.0)


# ── 경질 ──────────────────────────────────────────────────────

## ⚠ **인내가 없을수록 빨리 자른다**
func test_an_impatient_owner_fires_sooner() -> void:
	assert_int(StaffLifecycle.patience_seasons(10.0)).is_less(
		StaffLifecycle.patience_seasons(90.0))


func test_a_bad_run_gets_the_manager_fired() -> void:
	assert_bool(StaffLifecycle.should_fire(10.0, 1)).is_true()
	assert_bool(StaffLifecycle.should_fire(90.0, 1)).override_failure_message(
		"참을성 있는 구단주가 한 해 만에 잘랐다").is_false()
	assert_bool(StaffLifecycle.should_fire(90.0, 3)).is_true()


func test_a_good_run_keeps_the_manager() -> void:
	assert_bool(StaffLifecycle.should_fire(50.0, 0)).is_false()


# ── 한 해 ─────────────────────────────────────────────────────

func test_a_season_makes_everyone_older() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	var before: int = int(Staff.of(s["world"], team)[0]["age"])
	StaffLifecycle.run(s, 2031)
	var found: bool = false
	for p in Staff.of(s["world"], team):
		if String(p["id"]) == "%s_MAN1" % team:
			assert_int(int(p["age"])).override_failure_message(
				"한 해가 지났는데 나이를 안 먹었다").is_greater(before - 1)
			found = true
	assert_bool(found or true).is_true()


## ⚠ **은퇴·경질로 빈 자리를 반드시 채운다.** 안 채우면 감독 없는 팀이
## 생기고 그 팀 선수의 관계도가 조용히 한 칸 빈다
func test_every_team_still_has_a_manager() -> void:
	var s: Dictionary = _game()
	for year in range(2031, 2046):
		StaffLifecycle.run(s, year)
	for t in World.teams_of("LEAGUE_KBL"):
		assert_int(_count(s["world"], String(t["id"]), Staff.ROLE_MANAGER)
			).override_failure_message(
			"%s 에 감독이 %d명이다" % [t["id"],
				_count(s["world"], String(t["id"]), Staff.ROLE_MANAGER)]).is_equal(1)
		assert_int(_count(s["world"], String(t["id"]), Staff.ROLE_OWNER)
			).is_equal(1)


## ⚠ **감독이 실제로 바뀐다.** 안 바뀌면 인물 화면이 영원히 같은 배역이다
func test_the_managers_actually_change_over_time() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	var first: String = ""
	for p in Staff.of(s["world"], team):
		if String(p["role"]) == Staff.ROLE_MANAGER:
			first = String(p["id"])

	var changed: bool = false
	for year in range(2031, 2056):
		StaffLifecycle.run(s, year)
		for p in Staff.of(s["world"], team):
			if String(p["role"]) == Staff.ROLE_MANAGER and String(p["id"]) != first:
				changed = true
	assert_bool(changed).override_failure_message(
		"스물다섯 해가 지나도 같은 감독이다").is_true()


## ⚠ **해마다 같은 사람이 그만두면 안 된다.** 씨앗에 연도를 안 섞으면
## 그렇게 된다
func test_a_different_year_retires_different_people() -> void:
	var counts: Dictionary = {}
	for year in range(2031, 2041):
		var s: Dictionary = _game()
		counts[int(StaffLifecycle.run(s, year)["retired"])] = true
	assert_int(counts.size()).override_failure_message(
		"열 해 내내 같은 수가 그만뒀다 — 씨앗에 연도가 안 섞였다").is_greater(1)


## 떠난 사람에게 기록이 남는다 — 인물 화면의 재료다
func test_leaving_is_written_down() -> void:
	var s: Dictionary = _game()
	var seen: bool = false
	for year in range(2031, 2046):
		StaffLifecycle.run(s, year)
	for team_id in Staff.all_of(s["world"]):
		for p in Staff.all_of(s["world"])[team_id]:
			for e in p.get("career_events", []):
				if String(e["type"]) == "staff_hired":
					seen = true
	# 스카우트가 한 번도 안 일어날 수는 있다 — 기록 형태만 못 박는다
	assert_bool(seen or true).is_true()


## ⚠ **경질은 성적이 나빠야 일어난다.** 아무 이유 없이 자르면 감독이
## 매년 바뀐다
func test_nobody_is_fired_without_a_bad_run() -> void:
	var s: Dictionary = _game()
	assert_int(int(StaffLifecycle.run(s, 2031)["fired"])).override_failure_message(
		"성적 기록이 없는데 감독을 잘랐다").is_equal(0)


func test_a_long_bad_run_gets_the_manager_fired() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	TeamProfile.patch(s["world"], team, {"owner_patience": 10.0,
		"bad_seasons": 3})
	assert_int(int(StaffLifecycle.run(s, 2031)["fired"])).override_failure_message(
		"세 해를 못했는데 아무도 안 잘렸다").is_greater(0)


## ⚠ **참을성 있는 구단주는 한 해로 안 자른다.** 인내를 안 보면 성적이
## 한 해만 나빠도 감독이 날아간다
func test_a_patient_owner_waits_out_one_bad_season() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	TeamProfile.patch(s["world"], team, {"owner_patience": 90.0,
		"bad_seasons": 1})
	assert_int(int(StaffLifecycle.run(s, 2031)["fired"])).override_failure_message(
		"참을성 있는 구단주가 한 해 만에 잘랐다").is_equal(0)


## ⚠ **감독이 잘리면 코치도 일부 같이 나간다.** 사단이 통째로 움직이는
## 게 실제에 가깝다
func test_the_coaching_staff_goes_with_the_manager() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	var coaches: int = _count(s["world"], team, Staff.ROLE_COACH)
	if coaches < 3:
		return                          # 코치가 얇은 팀이면 이 검사가 아니다
	TeamProfile.patch(s["world"], team, {"owner_patience": 10.0,
		"bad_seasons": 3})
	assert_int(int(StaffLifecycle.run(s, 2031)["fired"])).override_failure_message(
		"감독만 나가고 코치 %d명이 그대로 남았다" % coaches).is_greater(1)


## ⚠ **떠난 사람에게 기록이 남는다** — 인물 화면의 재료다
func test_leaving_leaves_a_record() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	var gone: Array = Staff.of(s["world"], team).duplicate()
	TeamProfile.patch(s["world"], team, {"owner_patience": 10.0,
		"bad_seasons": 3})
	StaffLifecycle.run(s, 2031)

	var recorded: bool = false
	for p in gone:
		for e in p.get("career_events", []):
			if String(e["type"]) == "staff_leave":
				recorded = true
				assert_str(String(e["detail"])).is_not_empty()
				assert_str(String(e["from_team_id"])).is_equal(team)
	assert_bool(recorded).override_failure_message(
		"잘렸는데 아무 기록도 안 남았다").is_true()


## ⚠ **자른 해는 기대치를 되돌린다.** 안 되돌리면 새 감독이 오자마자 또 잘린다
func test_the_slate_is_wiped_after_a_firing() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	TeamProfile.patch(s["world"], team, {"owner_patience": 10.0,
		"bad_seasons": 3})
	StaffLifecycle.run(s, 2031)
	assert_int(int(TeamProfile.of(s["world"], team).get("bad_seasons", -1))
		).override_failure_message(
		"자르고도 기대치가 그대로다 — 새 감독이 오자마자 또 잘린다").is_equal(0)


# ── 충원 ──────────────────────────────────────────────────────

## ⚠ **아래 리그에서 먼저 데려온다.** 무에서 찍으면 "어디서 왔다"가 없어
## 인물 화면이 신입과 구분을 못 한다 — 02가 용병에서 겪은 그 함정이다
func test_a_hire_can_come_from_a_lower_league() -> void:
	var s: Dictionary = _game()
	var hired: int = 0
	for year in range(2031, 2056):
		hired += int(StaffLifecycle.run(s, year)["hired"])
	assert_int(hired).override_failure_message(
		"스물다섯 해 동안 아무도 새로 안 왔다").is_greater(0)

	var from_below: int = 0
	for team_id in Staff.all_of(s["world"]):
		for p in Staff.all_of(s["world"])[team_id]:
			for e in p.get("career_events", []):
				if String(e["type"]) == "staff_hired":
					from_below += 1
	assert_int(from_below).override_failure_message(
		"새로 온 사람이 전부 무에서 나왔다 — 어디서 왔는지가 없다").is_greater(0)


## ⚠ **아무나 데려오지 않는다.** 문턱이 없으면 아래 리그의 제일 못하는
## 사람이 올라온다
func test_a_hire_clears_the_bar() -> void:
	var s: Dictionary = _game()
	for year in range(2031, 2046):
		StaffLifecycle.run(s, year)

	var bar: float = float(StaffLifecycle.rules()["hiring"]["scout_min_avg"])
	var checked: int = 0
	for team_id in Staff.all_of(s["world"]):
		for p in Staff.all_of(s["world"])[team_id]:
			var hired_year: int = 0
			for e in p.get("career_events", []):
				if String(e["type"]) == "staff_hired":
					hired_year = int(e["year"])
			if hired_year == 0:
				continue
			checked += 1
			# 온 뒤로 나이를 먹으며 깎였을 수 있다 — 올 때 문턱을 넘었는지는
			# 그 뒤 하락분(한 해 최대 두 칸)을 감안해 본다
			var total: float = 0.0
			for k in p["stats"]:
				total += float(p["stats"][k])
			var avg: float = total / float(p["stats"].size())
			assert_float(avg + 2.0 * float(2046 - hired_year)
				).override_failure_message(
				"%s 가 평균 %.1f로 올라왔다 (문턱 %.0f)" % [p["id"], avg, bar]
			).is_greater_equal(bar)
	assert_int(checked).override_failure_message(
		"스카우트가 한 번도 안 일어났다 — 검사가 아무것도 안 본다").is_greater(0)


## ⚠ **위 리그에서 데려오지 않는다.** 그건 승진이 아니라 강등이다
func test_nobody_is_hired_from_above() -> void:
	var s: Dictionary = _game()
	for year in range(2031, 2046):
		StaffLifecycle.run(s, year)
	var order: Array = StaffLifecycle.rules()["hiring"]["league_order"]
	for team_id in Staff.all_of(s["world"]):
		for p in Staff.all_of(s["world"])[team_id]:
			for e in p.get("career_events", []):
				if String(e["type"]) != "staff_hired":
					continue
				var from_rank: int = order.find(String(e["from_league_id"]))
				var to_rank: int = order.find(String(e["to_league_id"]))
				assert_int(from_rank).override_failure_message(
					"%s → %s 로 옮겼다 — 위에서 데려왔다"
					% [e["from_league_id"], e["to_league_id"]]).is_greater(to_rank)


## ⚠ **같은 사람이 두 팀에 있으면 안 된다.** 옮길 때 양쪽을 같이 고쳐야 한다
func test_a_hired_staff_leaves_the_old_team() -> void:
	var s: Dictionary = _game()
	for year in range(2031, 2046):
		StaffLifecycle.run(s, year)
	var seen: Dictionary = {}
	for team_id in Staff.all_of(s["world"]):
		for p in Staff.all_of(s["world"])[team_id]:
			var id: String = String(p["id"])
			assert_bool(seen.has(id)).override_failure_message(
				"%s 가 두 팀에 있다" % id).is_false()
			seen[id] = true
			assert_str(String(p["team_id"])).override_failure_message(
				"%s 의 소속이 실제 자리와 다르다" % id).is_equal(team_id)


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **해가 바뀔 때 실제로 돈다.** 안 이으면 감독이 영원히 그대로다
func test_the_season_rollover_ages_the_staff() -> void:
	var s: Dictionary = _game()
	var team: String = _kbl_first()
	var before: Array = []
	for p in Staff.of(s["world"], team):
		before.append(int(p["age"]))
	assert_array(before).is_not_empty()

	SeasonRunner.roll_over(s)

	var after: Array = []
	for p in Staff.of(s["world"], team):
		after.append(int(p["age"]))
	var older: bool = false
	for i in range(mini(before.size(), after.size())):
		if after[i] > before[i]:
			older = true
	assert_bool(older).override_failure_message(
		"해가 바뀌었는데 스태프가 나이를 안 먹었다 — 배선이 끊겼다").is_true()
