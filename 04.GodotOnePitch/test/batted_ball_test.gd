extends GdUnitTestSuite

## 타구·수비 — 타구 종류·위치·세기·실책. M2-2.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##       (`resolve_hit_type` · `resolve_zone` · `resolve_hardness`
##        · `resolve_ball_in_play` · `calc_error_prob` · `resolve_fielding_result`)
##
## ⚠ **타구 종류는 엔진이 이미 정해 놓고 있었는데 결과 코드가 하나뿐이라
## 화면까지 못 갔다.** 코드를 좁히는 자리(`narrow_in_play_out`)는 `MatchResult`가
## 갖는다 — 분류 목록을 두 곳에 적으면 코드가 하나 늘 때마다 빠뜨린 자리가
## 조용히 생긴다.


class ScriptedRng:
	var values: Array = []
	var idx: int = 0

	func _init(v: Array) -> void:
		values = v

	func randf() -> float:
		if idx < values.size():
			var v: float = values[idx]
			idx += 1
			return v
		return values[values.size() - 1] if not values.is_empty() else 0.5

	## 정수 범위 — 첫 값을 비율로 본다
	func randi_range(from: int, to: int) -> int:
		return from + int(randf() * float(to - from + 1))


func _decision(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"pitch_type": "fastball", "location": 5, "strategy": "balanced", "power": "normal"}
	d.merge(o, true)
	return d


func _ball(hit_type: String, zone: String = "SS", hardness: int = 3) -> Dictionary:
	return {"hit_type": hit_type, "zone": zone, "hardness": hardness}


func _fielder(pos: String, fielding: float = 50.0, arm: float = 50.0) -> Dictionary:
	return {"position": pos, "fielding": fielding, "arm": arm, "speed": 50.0}


# ── 인플레이 판정 (MatchResult) ────────────────────────────────────

func test_in_play_covers_outs_hits_and_errors() -> void:
	for c in ["INPLAY_OUT", "GROUND_OUT", "FLY_OUT", "LINE_OUT", "DOUBLE_PLAY",
			"FIELDING_ERROR", "HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"]:
		assert_bool(MatchResult.is_in_play(c)).is_true()


func test_balls_strikes_and_walks_are_not_in_play() -> void:
	# 방망이에 안 맞았거나 타구가 안 생긴 결과다 — 여기에 타구를 만들면
	# 있지도 않은 수비가 돌아간다
	for c in ["BALL", "FOUL", "STRIKE_SWING", "STRIKE_LOOK", "WALK", "GAME_OVER"]:
		assert_bool(MatchResult.is_in_play(c)).is_false()


func test_at_bat_terminal_includes_walks() -> void:
	assert_bool(MatchResult.is_at_bat_over("WALK")).is_true()
	assert_bool(MatchResult.is_at_bat_over("FOUL")).is_false()


func test_in_play_out_is_narrowed_by_batted_ball_type() -> void:
	# ⚠ 엔진은 타구 종류를 처음부터 알고 있었다. 코드가 하나뿐이라 화면엔
	# "아웃"으로만 나왔다
	assert_str(MatchResult.narrow_in_play_out(_ball("groundBall"), false)).is_equal("GROUND_OUT")
	assert_str(MatchResult.narrow_in_play_out(_ball("bunt"), false)).is_equal("GROUND_OUT")
	assert_str(MatchResult.narrow_in_play_out(_ball("lineDrive"), false)).is_equal("LINE_OUT")
	assert_str(MatchResult.narrow_in_play_out(_ball("flyBall"), false)).is_equal("FLY_OUT")
	assert_str(MatchResult.narrow_in_play_out(_ball("popup"), false)).is_equal("FLY_OUT")


func test_double_play_wins_over_the_batted_ball_type() -> void:
	# 아웃이 둘이라 따로 둔다 — 색도 연출도 집계도 다르다
	assert_str(MatchResult.narrow_in_play_out(_ball("groundBall"), true)).is_equal("DOUBLE_PLAY")
	assert_str(MatchResult.narrow_in_play_out(_ball("lineDrive"), true)).is_equal("DOUBLE_PLAY")


func test_missing_ball_falls_back_to_a_ground_out() -> void:
	# 타구 정보 없이 아웃이 될 수는 없다. 그래도 오면 땅볼로 둔다
	assert_str(MatchResult.narrow_in_play_out({}, false)).is_equal("GROUND_OUT")


# ── 타구 종류 ──────────────────────────────────────────────────────

func test_a_soft_safe_pitch_produces_a_bunt() -> void:
	assert_str(BattedBall.resolve_hit_type("HIT_SINGLE",
		_decision({"strategy": "safe", "power": "low"}), 50.0, ScriptedRng.new([0.0]))) \
		.is_equal("bunt")


func test_home_runs_are_always_fly_balls() -> void:
	# 담을 넘은 공이 땅볼일 수 없다. **어떤 난수에서도** 그렇다 —
	# 큰 값만 넣으면 구종표로 떨어져도 우연히 뜬공이라 검사가 통과한다
	for roll in [0.0, 0.5, 0.99]:
		assert_str(BattedBall.resolve_hit_type("HOME_RUN", _decision(), 50.0, ScriptedRng.new([roll]))) \
			.is_equal("flyBall")


func test_triples_are_mostly_fly_balls() -> void:
	assert_str(BattedBall.resolve_hit_type("HIT_TRIPLE", _decision(), 50.0, ScriptedRng.new([0.0]))) \
		.is_equal("flyBall")
	assert_str(BattedBall.resolve_hit_type("HIT_TRIPLE", _decision(), 50.0, ScriptedRng.new([0.99]))) \
		.is_equal("lineDrive")


func test_doubles_are_mostly_line_drives() -> void:
	assert_str(BattedBall.resolve_hit_type("HIT_DOUBLE", _decision(), 50.0, ScriptedRng.new([0.0]))) \
		.is_equal("lineDrive")
	assert_str(BattedBall.resolve_hit_type("HIT_DOUBLE", _decision(), 50.0, ScriptedRng.new([0.99]))) \
		.is_equal("flyBall")


func test_well_placed_pitches_can_induce_popups() -> void:
	# 좋은 코스로 들어간 공은 빗맞는다. 품질이 낮으면 팝업이 안 나온다
	assert_str(BattedBall.resolve_hit_type("INPLAY_OUT", _decision(), 70.0, ScriptedRng.new([0.0]))) \
		.is_equal("popup")
	assert_str(BattedBall.resolve_hit_type("INPLAY_OUT", _decision(), 30.0, ScriptedRng.new([0.0]))) \
		.is_not_equal("popup")


func test_sinkers_produce_ground_balls() -> void:
	# ⚠ 구종이 타구 종류를 가른다. 이게 없으면 싱커나 커브나 같은 타구가 나오고
	# 땅볼 투수·뜬공 투수라는 성격 자체가 사라진다
	for t in ["sinker", "cutter", "slider"]:
		assert_str(BattedBall.resolve_hit_type("HIT_SINGLE",
			_decision({"pitch_type": t}), 50.0, ScriptedRng.new([0.5]))) \
			.is_equal("groundBall")


func test_off_speed_pitches_produce_fly_balls() -> void:
	for t in ["changeup", "curve", "forkball", "screwball", "knuckleball"]:
		assert_str(BattedBall.resolve_hit_type("HIT_SINGLE",
			_decision({"pitch_type": t}), 50.0, ScriptedRng.new([0.5]))) \
			.is_equal("flyBall")


func test_fastballs_sit_between_the_two() -> void:
	# 같은 난수에서 싱커는 땅볼, 체인지업은 뜬공, 직구는 직선타다
	assert_str(BattedBall.resolve_hit_type("HIT_SINGLE",
		_decision({"pitch_type": "fastball"}), 50.0, ScriptedRng.new([0.5]))) \
		.is_equal("lineDrive")


# ── 타구 위치 ──────────────────────────────────────────────────────

func test_ground_balls_go_to_the_infield() -> void:
	var infield: Array = ["P", "C", "1B", "2B", "3B", "SS"]
	for loc in [1, 2, 3, 5, 7, 9]:
		for roll in [0.0, 0.99]:
			assert_bool(infield.has(BattedBall.resolve_zone("groundBall", loc, ScriptedRng.new([roll])))) \
				.is_true()


func test_fly_balls_go_to_the_outfield() -> void:
	var outfield: Array = ["LF", "CF", "RF"]
	for loc in [1, 5, 9]:
		for roll in [0.0, 0.7, 0.99]:
			assert_bool(outfield.has(BattedBall.resolve_zone("flyBall", loc, ScriptedRng.new([roll])))) \
				.is_true()


func test_inside_pitches_are_pulled() -> void:
	# 몸쪽(1·4·7)으로 들어간 공은 반대편으로 간다 — 타구 방향이 코스를 따른다
	assert_str(BattedBall.resolve_zone("groundBall", 1, ScriptedRng.new([0.0]))).is_equal("3B")
	assert_str(BattedBall.resolve_zone("groundBall", 3, ScriptedRng.new([0.0]))).is_equal("1B")
	assert_str(BattedBall.resolve_zone("groundBall", 5, ScriptedRng.new([0.0]))).is_equal("SS")


func test_bunts_stay_near_home() -> void:
	var near: Array = ["P", "C", "1B", "3B"]
	for roll in [0.0, 0.3, 0.6, 0.99]:
		assert_bool(near.has(BattedBall.resolve_zone("bunt", 5, ScriptedRng.new([roll])))).is_true()


func test_popups_stay_in_the_infield() -> void:
	var near: Array = ["C", "1B", "2B", "3B", "SS"]
	for roll in [0.0, 0.5, 0.99]:
		assert_bool(near.has(BattedBall.resolve_zone("popup", 5, ScriptedRng.new([roll])))).is_true()


# ── 타구 세기 ──────────────────────────────────────────────────────

func test_harder_hits_for_bigger_results() -> void:
	var mid: float = 0.5
	var hr: int = BattedBall.resolve_hardness("HOME_RUN", "normal", 50.0, ScriptedRng.new([mid]))
	var single: int = BattedBall.resolve_hardness("HIT_SINGLE", "normal", 50.0, ScriptedRng.new([mid]))
	var out: int = BattedBall.resolve_hardness("GROUND_OUT", "normal", 50.0, ScriptedRng.new([mid]))
	assert_bool(hr > single).is_true()
	assert_bool(single > out).is_true()


func test_power_shifts_the_hardness() -> void:
	var high: int = BattedBall.resolve_hardness("HIT_SINGLE", "high", 50.0, ScriptedRng.new([0.5]))
	var low: int = BattedBall.resolve_hardness("HIT_SINGLE", "low", 50.0, ScriptedRng.new([0.5]))
	assert_bool(high > low).is_true()


func test_bad_pitches_get_hit_harder() -> void:
	# 품질이 낮을수록 세게 맞는다 — 두 단계로 가산한다
	var good: int = BattedBall.resolve_hardness("HIT_SINGLE", "normal", 80.0, ScriptedRng.new([0.5]))
	var bad: int = BattedBall.resolve_hardness("HIT_SINGLE", "normal", 30.0, ScriptedRng.new([0.5]))
	assert_bool(bad > good).is_true()


func test_hardness_stays_within_one_to_five() -> void:
	for code in ["HOME_RUN", "GROUND_OUT"]:
		for power in ["high", "low"]:
			for q in [10.0, 90.0]:
				for roll in [0.0, 0.99]:
					var h: int = BattedBall.resolve_hardness(code, power, q, ScriptedRng.new([roll]))
					assert_bool(h >= 1 and h <= 5).is_true()


# ── 타구 생성 ──────────────────────────────────────────────────────

func test_no_batted_ball_for_a_strikeout() -> void:
	# 방망이에 안 맞은 공에 타구를 만들면 없는 수비가 돌아간다
	assert_dict(BattedBall.resolve("STRIKE_SWING", _decision(), 50.0, ScriptedRng.new([0.5]))).is_empty()
	assert_dict(BattedBall.resolve("WALK", _decision(), 50.0, ScriptedRng.new([0.5]))).is_empty()


func test_a_hit_produces_a_complete_batted_ball() -> void:
	var b: Dictionary = BattedBall.resolve("HIT_SINGLE", _decision(), 50.0, ScriptedRng.new([0.5]))
	assert_bool(b.has("hit_type")).is_true()
	assert_bool(b.has("zone")).is_true()
	assert_bool(b.has("hardness")).is_true()


# ── 실책 확률 ──────────────────────────────────────────────────────

func test_ground_balls_are_the_hardest_to_field() -> void:
	var gb: float = BattedBall.calc_error_prob(_ball("groundBall"), _fielder("SS"))
	var pop: float = BattedBall.calc_error_prob(_ball("popup"), _fielder("SS"))
	assert_bool(gb > pop).is_true()


func test_better_fielders_make_fewer_errors() -> void:
	var good: float = BattedBall.calc_error_prob(_ball("groundBall"), _fielder("SS", 90.0))
	var bad: float = BattedBall.calc_error_prob(_ball("groundBall"), _fielder("SS", 20.0))
	assert_bool(good < bad).is_true()


func test_harder_balls_are_harder_to_field() -> void:
	var hard: float = BattedBall.calc_error_prob(_ball("groundBall", "SS", 5), _fielder("SS"))
	var soft: float = BattedBall.calc_error_prob(_ball("groundBall", "SS", 1), _fielder("SS"))
	assert_bool(hard > soft).is_true()


func test_error_probability_stays_inside_its_band() -> void:
	# ⚠ 하한이 없으면 최고 수비수가 **절대 실책을 안 한다.** 상한이 없으면
	# 최악의 수비수에게 굴러간 강한 타구가 거의 다 실책이 된다
	var best: float = BattedBall.calc_error_prob(_ball("popup", "SS", 1), _fielder("SS", 99.0))
	var worst: float = BattedBall.calc_error_prob(_ball("groundBall", "SS", 5), _fielder("SS", 1.0))
	assert_bool(best >= 0.01).is_true()
	assert_bool(worst <= 0.40).is_true()


# ── 수비 처리 ──────────────────────────────────────────────────────

func _fielders() -> Array:
	var out: Array = []
	for p in ["P", "C", "1B", "2B", "3B", "SS", "LF", "CF", "RF"]:
		out.append(_fielder(p))
	return out


func test_a_clean_fly_ball_is_an_out_without_a_throw() -> void:
	# 뜬공은 잡으면 끝이다 — 송구가 필요 없다
	var r: Dictionary = BattedBall.resolve_fielding(_ball("flyBall", "CF"), _fielders(),
		ScriptedRng.new([0.99]))
	assert_bool(r["is_error"]).is_false()
	assert_str(r["code"]).is_equal("INPLAY_OUT")
	assert_str(r["threw_to"]).is_empty()


func test_a_muffed_ball_becomes_an_error() -> void:
	var r: Dictionary = BattedBall.resolve_fielding(_ball("groundBall", "SS"), _fielders(),
		ScriptedRng.new([0.0]))
	assert_bool(r["is_error"]).is_true()
	assert_str(r["code"]).is_equal("FIELDING_ERROR")
	# 실책이면 주자가 한 베이스 더 간다
	assert_int(r["runner_extra_advance"]).is_equal(1)


func test_a_grounder_needs_a_throw_to_first() -> void:
	var r: Dictionary = BattedBall.resolve_fielding(_ball("groundBall", "SS"), _fielders(),
		ScriptedRng.new([0.99, 0.0]))
	assert_str(r["threw_to"]).is_equal("1B")
	assert_str(r["throw_result"]).is_equal("out")
	assert_str(r["code"]).is_equal("INPLAY_OUT")


func test_a_wild_throw_puts_the_runner_on() -> void:
	# ⚠ 잡기는 했는데 송구가 샜다. **아웃이 아니다** — 여기서 아웃으로 처리하면
	# 실책으로 나간 주자가 사라진다
	var r: Dictionary = BattedBall.resolve_fielding(_ball("groundBall", "SS"), _fielders(),
		ScriptedRng.new([0.99, 0.99]))
	assert_str(r["throw_result"]).is_equal("safe")
	assert_str(r["code"]).is_equal("FIELDING_ERROR")
	# 포구 자체는 성공했다 — 그건 실책이 아니다
	assert_bool(r["is_error"]).is_false()


func test_the_first_baseman_does_not_throw_to_himself() -> void:
	var r: Dictionary = BattedBall.resolve_fielding(_ball("groundBall", "1B"), _fielders(),
		ScriptedRng.new([0.99, 0.99]))
	assert_str(r["threw_to"]).is_empty()
	assert_str(r["code"]).is_equal("INPLAY_OUT")


func test_strong_arms_complete_more_throws() -> void:
	var fielders: Array = [_fielder("SS", 50.0, 99.0)]
	var weak: Array = [_fielder("SS", 50.0, 10.0)]
	# 같은 난수에서 강한 어깨는 잡고 약한 어깨는 놓친다
	var roll: float = 0.90
	assert_str(BattedBall.resolve_fielding(_ball("groundBall", "SS", 5), fielders,
		ScriptedRng.new([0.99, roll]))["throw_result"]).is_equal("out")
	assert_str(BattedBall.resolve_fielding(_ball("groundBall", "SS", 5), weak,
		ScriptedRng.new([0.99, roll]))["throw_result"]).is_equal("safe")


func test_a_missing_fielder_falls_back_to_an_average_one() -> void:
	# 라인업이 비어 있어도 경기는 굴러가야 한다
	var r: Dictionary = BattedBall.resolve_fielding(_ball("groundBall", "SS"), [],
		ScriptedRng.new([0.99, 0.0]))
	assert_str(r["fielder"]["position"]).is_equal("SS")
	assert_float(r["fielder"]["fielding"]).is_equal_approx(50.0, 0.001)
