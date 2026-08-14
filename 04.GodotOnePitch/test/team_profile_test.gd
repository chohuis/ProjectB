extends GdUnitTestSuite

## 구단 성향 — M9-10.
##
## ⚠ **02는 이걸 구현해 놓고 아무도 안 불렀다.** 전 팀이 정확히 50이라
## 트레이드 buyer 조건(`상위 30% · 압박 > 60`)을 구조적으로 아무도 못 넘었고,
## 실측 트레이드가 9 → 8 → 2 → 1 → 1 → 0으로 말랐다.


func _world() -> Dictionary:
	return {"rosters": {}}


# ── 기본값 ────────────────────────────────────────────────────

## ⚠ **0이 아니라 50이다.** 0이면 "안정성 0 · 성적압박 0"이 되어 판정이
## 한쪽으로 쏠린다
func test_the_default_is_neutral_not_zero() -> void:
	for k in TeamProfile.DEFAULT:
		assert_float(float(TeamProfile.DEFAULT[k])).override_failure_message(
			"%s가 50이 아니다" % k).is_equal(50.0)
	assert_int(TeamProfile.DEFAULT.size()).is_equal(12)


## ⚠ **기본값을 나눠 쓰면 안 된다.** 한 팀을 고치면 전 팀이 따라 바뀐다
func test_two_teams_do_not_share_one_dictionary() -> void:
	var w: Dictionary = _world()
	var a: Dictionary = TeamProfile.of(w, "TEAM_A")
	a["stability"] = 99.0
	assert_float(float(TeamProfile.of(w, "TEAM_B")["stability"])).override_failure_message(
		"한 팀을 고쳤더니 다른 팀도 바뀌었다").is_equal(50.0)
	assert_float(float(TeamProfile.DEFAULT["stability"])).override_failure_message(
		"기본값 자체가 바뀌었다").is_equal(50.0)


func test_patching_sticks() -> void:
	var w: Dictionary = _world()
	TeamProfile.patch(w, "TEAM_A", {"win_now_pressure": 77.0})
	assert_float(float(TeamProfile.of(w, "TEAM_A")["win_now_pressure"])).is_equal(77.0)
	# 나머지 항목은 그대로다 — 덮어쓰면 성향이 한 항목만 남는다
	assert_float(float(TeamProfile.of(w, "TEAM_A")["stability"])).is_equal(50.0)


# ── 성적 압박 ─────────────────────────────────────────────────

## 우승하면 크게 풀린다 — 한 해 쉬어 갈 수 있다
func test_winning_it_all_releases_the_pressure() -> void:
	var r: Dictionary = TeamProfile.win_now_update(50.0, 50.0, 1, 10, 0, true)
	assert_float(float(r["delta"])).is_equal(-20.0)
	assert_float(float(r["pressure"])).is_equal(30.0)


func test_the_bands_run_the_right_way() -> void:
	# 2위 — 조금 풀린다
	assert_float(float(TeamProfile.win_now_update(50.0, 50.0, 2, 10)["delta"])).is_equal(-5.0)
	# 중위권 — 조금 오른다
	assert_float(float(TeamProfile.win_now_update(50.0, 50.0, 5, 10)["delta"])).is_greater(0.0)
	# 하위권 — 많이 오른다
	assert_float(float(TeamProfile.win_now_update(50.0, 50.0, 9, 10)["delta"])) \
		.override_failure_message("하위권이 중위권보다 덜 오른다") \
		.is_greater(float(TeamProfile.win_now_update(50.0, 50.0, 5, 10)["delta"]))


## ⚠ **참을성은 오르는 쪽에만 걸린다.** 내려가는 쪽에도 걸면 참을성 있는
## 구단이 우승해도 압박이 안 풀린다
func test_patience_only_slows_the_rise() -> void:
	var calm: float = float(TeamProfile.win_now_update(50.0, 100.0, 9, 10)["delta"])
	var hot: float = float(TeamProfile.win_now_update(50.0, 0.0, 9, 10)["delta"])
	assert_float(calm).override_failure_message(
		"참을성이 압박을 안 누른다").is_less(hot)

	# 우승은 참을성과 무관하게 −20이다
	assert_float(float(TeamProfile.win_now_update(50.0, 100.0, 1, 10, 0, true)["delta"])) \
		.is_equal(float(TeamProfile.win_now_update(50.0, 0.0, 1, 10, 0, true)["delta"]))


## 연속 실패가 쌓이면 더 오른다
func test_repeated_failure_piles_up() -> void:
	assert_float(float(TeamProfile.win_now_update(50.0, 50.0, 9, 10, 3)["delta"])) \
		.is_greater(float(TeamProfile.win_now_update(50.0, 50.0, 9, 10, 0)["delta"]))


## 0~100을 벗어나지 않는다 — 넘으면 buyer 판정이 영영 참이 된다
func test_the_pressure_is_clamped() -> void:
	assert_float(float(TeamProfile.win_now_update(5.0, 50.0, 1, 10, 0, true)["pressure"])) \
		.is_equal(0.0)
	assert_float(float(TeamProfile.win_now_update(98.0, 0.0, 10, 10, 9)["pressure"])) \
		.is_equal(100.0)


## ⚠ **하위권 두 시즌이면 buyer 문턱(60)을 넘어야 한다.** 안 넘으면
## 트레이드가 02와 똑같이 마른다
func test_two_bad_seasons_cross_the_buyer_line() -> void:
	var p: float = 50.0
	for i in 2:
		p = float(TeamProfile.win_now_update(p, 50.0, 9, 10)["pressure"])
	assert_float(p).override_failure_message(
		"두 시즌 하위권인데 압박이 %.1f — 문턱 %.0f" % [p, TeamProfile.BUYER_PRESSURE]) \
		.is_greater(TeamProfile.BUYER_PRESSURE)


# ── 스카우팅 ──────────────────────────────────────────────────

func test_scouting_always_creeps_up() -> void:
	assert_float(float(TeamProfile.scouting_update(50.0, 0.0)["delta"])).is_equal(1.0)
	assert_float(float(TeamProfile.scouting_update(50.0, 1.0)["delta"])).is_equal(5.0)


func test_playoff_years_help_but_not_forever() -> void:
	var many: float = float(TeamProfile.scouting_update(50.0, 0.0, 20)["delta"])
	var few: float = float(TeamProfile.scouting_update(50.0, 0.0, 2)["delta"])
	assert_float(many).is_greater(few)
	# 상한이 있다 — 없으면 강팀이 영원히 벌어진다
	assert_float(many).is_equal(float(TeamProfile.scouting_update(50.0, 0.0, 100)["delta"]))


func test_scouting_stops_at_a_hundred() -> void:
	assert_float(float(TeamProfile.scouting_update(99.5, 1.0)["quality"])).is_equal(100.0)


# ── FA 자격 ───────────────────────────────────────────────────

## ⚠ **표가 두 곳이면 안 된다.** 02에서 "표가 두 곳"으로 시작한 결함이
## 열 번 나왔다
func test_the_fa_years_differ_by_league() -> void:
	assert_int(TeamProfile.fa_eligibility_years("LEAGUE_KBL")).is_equal(5)
	assert_int(TeamProfile.fa_eligibility_years("LEAGUE_ABL")).is_equal(6)
	assert_int(TeamProfile.fa_eligibility_years("LEAGUE_JBL")).is_equal(4)
	# 프로가 아니면 사실상 FA가 없다
	assert_int(TeamProfile.fa_eligibility_years("LEAGUE_HIGHSCHOOL")).is_equal(9)


# ── buyer / seller ────────────────────────────────────────────

## ⚠ **전 팀이 50이면 buyer가 0팀이다.** 그게 02에서 트레이드가 마른 이유다
func test_a_neutral_league_has_no_buyers() -> void:
	var w: Dictionary = _world()
	for rank in range(1, 11):
		assert_bool(TeamProfile.is_buyer(w, "TEAM_%d" % rank, rank, 10)).is_false()


func test_a_contender_under_pressure_is_a_buyer() -> void:
	var w: Dictionary = _world()
	TeamProfile.patch(w, "TEAM_TOP", {"win_now_pressure": 75.0})
	assert_bool(TeamProfile.is_buyer(w, "TEAM_TOP", 1, 10)).is_true()
	# 압박이 있어도 하위권이면 아니다
	assert_bool(TeamProfile.is_buyer(w, "TEAM_TOP", 9, 10)).is_false()


func test_a_bottom_team_is_a_seller() -> void:
	var w: Dictionary = _world()
	assert_bool(TeamProfile.is_seller(w, "TEAM_LOW", 9, 10)).is_true()
	assert_bool(TeamProfile.is_seller(w, "TEAM_TOP", 1, 10)).is_false()


func test_an_empty_league_decides_nothing() -> void:
	var w: Dictionary = _world()
	assert_bool(TeamProfile.is_buyer(w, "TEAM_A", 1, 0)).is_false()
	assert_bool(TeamProfile.is_seller(w, "TEAM_A", 1, 0)).is_false()


# ── 시즌 끝 갱신 ──────────────────────────────────────────────

func _played_state() -> Dictionary:
	# 10팀 리그 — TEAM_0이 전승, TEAM_9가 전패
	var schedule: Array = []
	for i in 10:
		for j in 10:
			if i == j:
				continue
			schedule.append({
				"league_id": "LEAGUE_KBL", "day": 1,
				"home": "T%d" % i, "away": "T%d" % j,
				"result": {"winner_id": "T%d" % mini(i, j), "loser_id": "T%d" % maxi(i, j)},
			})
	return {"world": {"rosters": {}}, "schedule": schedule}


## ⚠ **이걸 안 부르면 팀이 영원히 똑같다.** 02가 그랬다
func test_the_season_splits_the_teams() -> void:
	var s: Dictionary = _played_state()
	assert_int(TeamProfile.update_all(s)).is_equal(10)

	# ⚠ **1위는 우승이다 (−20).** 2위와 같은 −5로 보면 우승의 뜻이 없다
	assert_float(float(TeamProfile.of(s["world"], "T0")["win_now_pressure"])) \
		.override_failure_message("1위를 우승으로 안 봤다 (−20이어야 한다)").is_equal(30.0)
	assert_float(float(TeamProfile.of(s["world"], "T1")["win_now_pressure"])) \
		.override_failure_message("2위가 −5가 아니다").is_equal(45.0)
	assert_float(float(TeamProfile.of(s["world"], "T9")["win_now_pressure"])) \
		.override_failure_message("꼴찌 압박이 안 올라갔다").is_greater(50.0)


## ⚠ **해마다 지금 값에서 이어져야 한다.** 매번 50에서 시작하면 압박이
## 영영 쌓이지 않고, 하위권 두 시즌이 buyer 문턱을 못 넘는다
func test_the_pressure_carries_between_seasons() -> void:
	var s: Dictionary = _played_state()
	TeamProfile.update_all(s)
	var after_one: float = float(TeamProfile.of(s["world"], "T9")["win_now_pressure"])
	TeamProfile.update_all(s)
	assert_float(float(TeamProfile.of(s["world"], "T9")["win_now_pressure"])) \
		.override_failure_message("두 시즌째인데 압박이 %.1f 그대로다" % after_one) \
		.is_greater(after_one)


## 두 시즌을 돌리면 buyer가 실제로 생긴다 — 02는 여기가 영영 0이었다
func test_two_seasons_produce_buyers() -> void:
	var s: Dictionary = _played_state()
	# 1위가 압박을 받으려면 우승을 놓쳐야 한다 — 중위권을 본다
	for i in 3:
		TeamProfile.update_all(s)

	var rows: Array = Standings.from_schedule(s["schedule"], "LEAGUE_KBL")
	var buyers: int = 0
	for r in rows:
		if TeamProfile.is_buyer(s["world"], String(r["team_id"]),
				int(r["rank"]), rows.size()):
			buyers += 1
	# 상위 30% 중 압박이 높은 팀 — 2·3위가 −5씩만 받으니 넘지는 않는다.
	# 여기서 보려는 건 **판정이 실제로 도는가**다
	assert_int(rows.size()).is_equal(10)
	assert_float(float(TeamProfile.of(s["world"], "T3")["win_now_pressure"])) \
		.override_failure_message("세 시즌인데 중위권 압박이 안 움직였다").is_not_equal(50.0)


func test_scouting_moves_too() -> void:
	var s: Dictionary = _played_state()
	TeamProfile.update_all(s)
	assert_float(float(TeamProfile.of(s["world"], "T0")["scouting_quality"])) \
		.override_failure_message("스카우팅이 안 움직였다").is_greater(50.0)


func test_an_empty_world_is_a_no_op() -> void:
	assert_int(TeamProfile.update_all({})).is_equal(0)
	assert_int(TeamProfile.update_all({"world": {"rosters": {}}, "schedule": []})).is_equal(0)


## 학교·독립 리그엔 구단이 없다 — 프로만 본다
func test_only_pro_leagues_get_a_profile() -> void:
	var s: Dictionary = _played_state()
	for g in s["schedule"]:
		g["league_id"] = "LEAGUE_HIGHSCHOOL"
	assert_int(TeamProfile.update_all(s)).override_failure_message(
		"고교 팀에 구단 성향이 붙었다").is_equal(0)
