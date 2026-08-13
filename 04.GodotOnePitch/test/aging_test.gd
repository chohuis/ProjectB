extends GdUnitTestSuite

## 에이징 — 한 시즌 나이 먹기. M4-5.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `calc_protagonist_aging`
##
## ⚠ **자기관리는 비율로 본다.** 절대 주 수로 보면 시즌 길이가 바뀔 때
## 판정이 통째로 달라진다 — 일정을 압축하면 "위기 5주"가 훨씬 무거워진다.


func _season(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"low_condition_weeks": 0, "high_fatigue_weeks": 0,
		"injury_count": 0, "total_weeks": 52}
	d.merge(o, true)
	return d


func _player(age: int, o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"age": age, "player_type": "pitcher",
		"pitching": {"velocity": 80.0, "stamina": 80.0, "movement": 80.0,
			"recovery": 80.0, "command": 80.0, "control": 80.0, "mentality": 80.0},
		"batting": {"speed": 80.0, "power": 80.0},
	}
	d.merge(o, true)
	return d


func _run(age: int, season: Dictionary = {}, player: Dictionary = {}) -> Dictionary:
	var p: Dictionary = player if not player.is_empty() else _player(age)
	return Aging.calc(p, season if not season.is_empty() else _season())


# ── 나이대 ─────────────────────────────────────────────────────────

func test_the_young_do_not_decline() -> void:
	var r: Dictionary = _run(23)
	assert_float(r["pitching"]["velocity"]).is_equal_approx(80.0, 0.001)
	assert_float(r["pitching"]["command"]).is_equal_approx(80.0, 0.001)


func test_the_peak_years_lose_only_a_trace() -> void:
	# 26~29는 몸이 아주 조금 닳는다 — 제구는 아직 안 준다
	var r: Dictionary = _run(27)
	assert_bool(r["pitching"]["velocity"] < 80.0).is_true()
	assert_float(r["pitching"]["command"]).is_equal_approx(80.0, 0.001)


func test_decline_accelerates_with_age() -> void:
	var a: float = _run(31)["pitching"]["velocity"]
	var b: float = _run(34)["pitching"]["velocity"]
	var c: float = _run(38)["pitching"]["velocity"]
	assert_bool(a > b).is_true()
	assert_bool(b > c).is_true()


func test_command_collapses_faster_than_velocity_in_the_mid_thirties() -> void:
	# ⚠ 33~35에서 제구(3.2·3.0)가 구속(2.5)보다 빨리 무너진다.
	# 순서를 뒤집으면 노장 투수의 성격이 통째로 바뀐다
	var r: Dictionary = _run(34)
	var vel_loss: float = 80.0 - r["pitching"]["velocity"]
	var cmd_loss: float = 80.0 - r["pitching"]["command"]
	assert_bool(cmd_loss > vel_loss).is_true()


func test_mentality_barely_moves() -> void:
	# 경험은 몸보다 늦게 준다
	var r: Dictionary = _run(38)
	var men_loss: float = 80.0 - r["pitching"]["mentality"]
	var vel_loss: float = 80.0 - r["pitching"]["velocity"]
	assert_bool(men_loss < vel_loss).is_true()


# ── 자기관리 ───────────────────────────────────────────────────────

func test_good_management_slows_the_decline() -> void:
	var careful: Dictionary = _run(34, _season({"low_condition_weeks": 2, "high_fatigue_weeks": 4}))
	var careless: Dictionary = _run(34, _season({"low_condition_weeks": 30, "high_fatigue_weeks": 30}))
	assert_bool(careful["pitching"]["velocity"] > careless["pitching"]["velocity"]).is_true()


func test_management_is_judged_by_ratio_not_by_count() -> void:
	# ⚠ **여기가 핵심이다.** 절대 주 수로 보면 시즌이 짧아질 때 같은 관리가
	# 갑자기 "우수"가 된다 — 일정 압축이 밸런스를 조용히 바꾼다.
	#
	# **등급 경계를 넘는 표본으로 본다.** 같은 등급에 떨어지는 값끼리 재면
	# 분모를 고정으로 바꿔도 검사가 통과한다
	var short_ratio: float = Aging.self_management(_season({
		"low_condition_weeks": 8, "high_fatigue_weeks": 10, "total_weeks": 24}))
	var long_ratio: float = Aging.self_management(_season({
		"low_condition_weeks": 17, "high_fatigue_weeks": 22, "total_weeks": 52}))
	# 비율이 같으니(≈0.33 / ≈0.42) 등급도 같다
	assert_float(short_ratio).is_equal_approx(1.00, 0.001)
	assert_float(long_ratio).is_equal_approx(1.00, 0.001)


func test_the_management_grades_have_pinned_values() -> void:
	# 부등호만 보면 경계가 밀려도 통과한다
	assert_float(Aging.self_management(_season())).is_equal_approx(0.35, 0.001)
	assert_float(Aging.self_management(_season({
		"low_condition_weeks": 9, "high_fatigue_weeks": 14}))).is_equal_approx(0.65, 0.001)
	assert_float(Aging.self_management(_season({
		"low_condition_weeks": 17, "high_fatigue_weeks": 22}))).is_equal_approx(1.00, 0.001)
	assert_float(Aging.self_management(_season({
		"low_condition_weeks": 40, "high_fatigue_weeks": 40}))).is_equal_approx(1.50, 0.001)


func test_injuries_worsen_the_judgement() -> void:
	var clean: Dictionary = _run(34, _season({"injury_count": 0}))
	var once: Dictionary = _run(34, _season({"injury_count": 1}))
	var twice: Dictionary = _run(34, _season({"injury_count": 3}))
	assert_bool(clean["pitching"]["velocity"] > once["pitching"]["velocity"]).is_true()
	assert_bool(once["pitching"]["velocity"] > twice["pitching"]["velocity"]).is_true()


func test_the_penalty_is_capped() -> void:
	# ⚠ 상한이 없으면 관리 소홀 + 부상이 겹칠 때 한 시즌에 능력이 무너진다.
	# **값을 못박는다** — 둘을 견주기만 하면 상한을 올려도 둘 다 같이 올라
	# 검사가 통과한다 (1.50 + 0.40 = 1.90이 그대로 나간다)
	assert_float(Aging.self_management(_season({
		"low_condition_weeks": 52, "high_fatigue_weeks": 52, "injury_count": 9}))) \
		.is_equal_approx(1.50, 0.001)


func test_an_empty_season_is_judged_as_clean() -> void:
	# ⚠ 시즌 첫 주에 불릴 수 있다. 0으로 나누면 NaN이 나오고, NaN은 어떤
	# 비교에도 false라 **조용히 "관리 소홀"로 떨어진다**
	assert_float(Aging.self_management(_season({"total_weeks": 0}))) \
		.is_equal_approx(0.35, 0.001)


func test_a_zero_week_season_does_not_divide_by_zero() -> void:
	# 시즌 첫 주에 불릴 수 있다
	var r: Dictionary = _run(34, _season({"total_weeks": 0}))
	assert_bool(r["pitching"]["velocity"] > 0.0).is_true()


# ── 타자·이도류 ────────────────────────────────────────────────────

func test_a_pitcher_does_not_lose_batting_stats() -> void:
	var r: Dictionary = _run(38)
	assert_float(r["batting"]["speed"]).is_equal_approx(80.0, 0.001)


func test_a_batter_loses_speed_first() -> void:
	# 발이 힘보다 빨리 준다
	var p: Dictionary = _player(34, {"player_type": "batter"})
	var r: Dictionary = Aging.calc(p, _season())
	var spd_loss: float = 80.0 - r["batting"]["speed"]
	var pow_loss: float = 80.0 - r["batting"]["power"]
	assert_bool(spd_loss > pow_loss).is_true()
	# 투수 능력은 안 건드린다
	assert_float(r["pitching"]["velocity"]).is_equal_approx(80.0, 0.001)


func test_a_two_way_player_ages_on_both_sides() -> void:
	var p: Dictionary = _player(34, {"player_type": "twoWay"})
	var r: Dictionary = Aging.calc(p, _season())
	assert_bool(r["pitching"]["velocity"] < 80.0).is_true()
	assert_bool(r["batting"]["speed"] < 80.0).is_true()


# ── 바닥 ───────────────────────────────────────────────────────────

func test_stats_never_fall_below_the_floor() -> void:
	# ⚠ 20 아래로 가면 시뮬 산식이 이상해진다. 은퇴는 다른 곳이 정한다
	var p: Dictionary = _player(42)
	for k in p["pitching"]:
		p["pitching"][k] = 21.0
	var r: Dictionary = Aging.calc(p, _season({"low_condition_weeks": 52,
		"high_fatigue_weeks": 52, "injury_count": 3}))
	for k in r["pitching"]:
		assert_bool(r["pitching"][k] >= 20.0).is_true()


func test_the_input_player_is_not_mutated() -> void:
	var p: Dictionary = _player(38)
	Aging.calc(p, _season())
	assert_float(p["pitching"]["velocity"]).is_equal_approx(80.0, 0.001)


# ── 로그 ───────────────────────────────────────────────────────────

func test_a_meaningful_decline_is_logged() -> void:
	assert_bool(_run(38)["logs"].size() > 0).is_true()


func test_a_trivial_decline_is_not_logged() -> void:
	# 23세는 아무 일도 안 일어난다 — 매년 "에이징" 소식이 오면 잡음이다
	assert_bool(_run(23)["logs"].is_empty()).is_true()


func test_the_log_names_the_management_grade() -> void:
	var careful: Dictionary = _run(38, _season({"low_condition_weeks": 1, "high_fatigue_weeks": 1}))
	var careless: Dictionary = _run(38, _season({"low_condition_weeks": 40, "high_fatigue_weeks": 40}))
	assert_str(careful["logs"][0]).contains("우수")
	assert_str(careless["logs"][0]).contains("소홀")
