extends GdUnitTestSuite

## 주루 — 진루·도루·병살. M2-1.
##
## 원본: `02.SvelteElectron/packages/engine-native/src/match_engine.rs`
##       (`advance_on_walk` · `try_extra_base` · `advance_on_hit`
##        · `attempt_steals` · `try_double_play`)
## 계수: 같은 폴더 `tuning.rs`
##
## ⚠ **난수를 손으로 넣어 분기를 짚는다.** 확률 함수를 통계로만 검사하면
## "성공/실패 갈래가 뒤바뀐" 변이를 못 잡는다 — 비율은 그대로이기 때문이다.
## 그래서 주루 함수는 난수기를 인자로 받고, 여기서는 값을 미리 정해 넣는다.


## 정해둔 값을 순서대로 내주는 난수기. 다 쓰면 마지막 값을 계속 낸다
class ScriptedRng:
	var values: Array = []
	var idx: int = 0
	var used: int = 0

	func _init(v: Array) -> void:
		values = v

	func randf() -> float:
		used += 1
		if idx < values.size():
			var v: float = values[idx]
			idx += 1
			return v
		return values[values.size() - 1] if not values.is_empty() else 0.5


func _r(speed: float = 80.0, instinct: float = 75.0) -> Dictionary:
	return {"speed": speed, "instinct": instinct}


func _bases(first: Dictionary = {}, second: Dictionary = {}, third: Dictionary = {}) -> Dictionary:
	return {"first": first, "second": second, "third": third}


func _occupied(runners: Dictionary) -> Array:
	var out: Array = []
	for b in ["first", "second", "third"]:
		if not runners[b].is_empty():
			out.append(b)
	return out


# ── 볼넷 진루 ──────────────────────────────────────────────────────

func test_walk_with_empty_bases() -> void:
	var out: Dictionary = Baserunning.advance_on_walk(_bases(), _r())
	assert_array(_occupied(out["runners"])).is_equal(["first"])
	assert_int(out["runs"]).is_equal(0)


func test_walk_pushes_the_runner_on_first() -> void:
	var out: Dictionary = Baserunning.advance_on_walk(_bases(_r()), _r())
	assert_array(_occupied(out["runners"])).is_equal(["first", "second"])
	assert_int(out["runs"]).is_equal(0)


func test_walk_fills_the_bases() -> void:
	var out: Dictionary = Baserunning.advance_on_walk(_bases(_r(), _r()), _r())
	assert_array(_occupied(out["runners"])).is_equal(["first", "second", "third"])
	assert_int(out["runs"]).is_equal(0)


func test_bases_loaded_walk_forces_in_a_run() -> void:
	var out: Dictionary = Baserunning.advance_on_walk(_bases(_r(), _r(), _r()), _r())
	assert_array(_occupied(out["runners"])).is_equal(["first", "second", "third"])
	assert_int(out["runs"]).is_equal(1)


func test_walk_does_not_move_runners_behind_an_empty_base() -> void:
	# ⚠ **밀어내기는 1루가 차 있을 때만이다.** 2루 주자만 있으면 그 주자는
	# 제자리다 — 조건 없이 밀면 2루 주자가 공짜로 3루에 간다
	var out: Dictionary = Baserunning.advance_on_walk(_bases({}, _r()), _r())
	assert_array(_occupied(out["runners"])).is_equal(["first", "second"])
	assert_int(out["runs"]).is_equal(0)


# ── 안타 진루 — 난수를 안 쓰는 갈래 ────────────────────────────────

func test_grand_slam_scores_four() -> void:
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r(), _r(), _r()), "HOME_RUN", _r(), ScriptedRng.new([0.5]))
	assert_int(out["runs"]).is_equal(4)
	assert_array(_occupied(out["runners"])).is_empty()


func test_triple_clears_the_bases_and_puts_the_batter_on_third() -> void:
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r(), {}, _r()), "HIT_TRIPLE", _r(), ScriptedRng.new([0.5]))
	assert_int(out["runs"]).is_equal(2)
	assert_array(_occupied(out["runners"])).is_equal(["third"])


func test_double_scores_runners_from_second_and_third() -> void:
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases({}, _r(), _r()), "HIT_DOUBLE", _r(), ScriptedRng.new([0.5]))
	assert_int(out["runs"]).is_equal(2)
	assert_array(_occupied(out["runners"])).is_equal(["second"])


func test_an_out_leaves_the_runners_alone() -> void:
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r(), _r()), "GROUND_OUT", _r(), ScriptedRng.new([0.5]))
	assert_array(_occupied(out["runners"])).is_equal(["first", "second"])
	assert_int(out["runs"]).is_equal(0)


# ── 안타 진루 — 추가 진루 판단 ────────────────────────────────────

func test_runner_from_first_scores_on_a_double() -> void:
	# 시도 통과(작은 값) → 성공(작은 값)
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r()), "HIT_DOUBLE", _r(), ScriptedRng.new([0.0, 0.0]))
	assert_int(out["runs"]).is_equal(1)
	assert_int(out["extra_outs"]).is_equal(0)
	assert_array(_occupied(out["runners"])).is_equal(["second"])


func test_runner_from_first_holds_at_third_on_a_double() -> void:
	# 시도 자체를 안 한다(큰 값)
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r()), "HIT_DOUBLE", _r(), ScriptedRng.new([0.99]))
	assert_int(out["runs"]).is_equal(0)
	assert_array(_occupied(out["runners"])).is_equal(["second", "third"])


func test_runner_from_first_is_thrown_out_at_home() -> void:
	# 시도 통과(0.0) → 성공 실패(0.99)
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r()), "HIT_DOUBLE", _r(), ScriptedRng.new([0.0, 0.99]))
	assert_int(out["runs"]).is_equal(0)
	assert_int(out["extra_outs"]).is_equal(1)
	assert_array(_occupied(out["runners"])).is_equal(["second"])
	assert_int(out["logs"].size()).is_equal(1)


func test_single_scores_the_runner_from_third() -> void:
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases({}, {}, _r()), "HIT_SINGLE", _r(), ScriptedRng.new([0.5]))
	assert_int(out["runs"]).is_equal(1)
	assert_array(_occupied(out["runners"])).is_equal(["first"])


func test_single_scores_the_runner_from_second() -> void:
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases({}, _r()), "HIT_SINGLE", _r(), ScriptedRng.new([0.0, 0.0]))
	assert_int(out["runs"]).is_equal(1)
	assert_array(_occupied(out["runners"])).is_equal(["first"])


func test_runner_from_first_cannot_take_third_when_it_is_occupied() -> void:
	# ⚠ **앞 주자가 3루에 멈추면 뒤 주자는 3루를 노리지 않는다.** 같은 베이스에
	# 둘을 세우면 그 뒤 진루 계산이 통째로 어긋난다.
	#
	# 2루 주자는 시도 안 함(0.99)으로 3루에 멈춘다. 뒤이어 오는 0.0들은
	# **1루 주자가 3루를 노렸다면** 성공했을 값이다 — 그런데도 3루가 찼으니
	# 2루에 서야 한다. 이 대조가 없으면 가드를 빼도 검사가 통과한다
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r(), _r()), "HIT_SINGLE", _r(), ScriptedRng.new([0.99, 0.0, 0.0]))
	assert_int(out["runs"]).is_equal(0)
	assert_array(_occupied(out["runners"])).is_equal(["first", "second", "third"])


func test_runner_from_first_takes_third_when_it_is_open() -> void:
	# 2루 주자 홈인(0.0, 0.0) → 3루가 비었으므로 1루 주자가 3루 시도(0.0, 0.0)
	var out: Dictionary = Baserunning.advance_on_hit(
		_bases(_r(), _r()), "HIT_SINGLE", _r(), ScriptedRng.new([0.0, 0.0, 0.0, 0.0]))
	assert_int(out["runs"]).is_equal(1)
	assert_array(_occupied(out["runners"])).is_equal(["first", "third"])


# ── 추가 진루 판단 자체 ────────────────────────────────────────────

func test_unknown_context_never_advances() -> void:
	# 모르는 상황에서 주자를 뛰게 하면 안 된다
	assert_str(Baserunning.try_extra_base(_r(), "없는상황", ScriptedRng.new([0.0, 0.0]))) \
		.is_equal("stop")


func test_faster_runners_attempt_more_often() -> void:
	# 시도 확률은 발과 주루 센스로 오른다. 같은 난수에서 느린 주자는 멈추고
	# 빠른 주자는 뛴다
	var slow: String = Baserunning.try_extra_base(_r(40.0, 40.0), "1st_to_3rd_single", ScriptedRng.new([0.16, 0.0]))
	var fast: String = Baserunning.try_extra_base(_r(99.0, 99.0), "1st_to_3rd_single", ScriptedRng.new([0.16, 0.0]))
	assert_str(slow).is_equal("stop")
	assert_str(fast).is_equal("advance")


# ── 도루 ───────────────────────────────────────────────────────────

func _steal(runners: Dictionary, outs: int, rng, hold: float = 50.0, boost: float = 0.0) -> Dictionary:
	return Baserunning.attempt_steals(runners, outs, hold, boost, rng)


func test_no_steal_without_a_runner_on_first() -> void:
	var out: Dictionary = _steal(_bases(), 0, ScriptedRng.new([0.0, 0.0]))
	assert_array(_occupied(out["runners"])).is_empty()
	assert_int(out["steals"]).is_equal(0)


func test_no_steal_of_second_when_it_is_occupied() -> void:
	# 갈 곳이 없다
	var out: Dictionary = _steal(_bases(_r(), _r(99.0)), 0, ScriptedRng.new([0.0, 0.0, 0.99]))
	assert_bool(out["runners"]["first"].is_empty()).is_false()


func test_successful_steal_of_second() -> void:
	# 3루 문턱(88) 아래 주자라 2루에서 멈춘다
	var out: Dictionary = _steal(_bases(_r(85.0)), 0, ScriptedRng.new([0.0, 0.0]))
	assert_array(_occupied(out["runners"])).is_equal(["second"])
	assert_int(out["outs"]).is_equal(0)
	assert_int(out["steals"]).is_equal(1)


func test_a_very_fast_runner_can_take_two_bases_on_one_pitch() -> void:
	# ⚠ 2루 도루 판정이 끝난 **뒤 상태**로 3루 판정을 한다. 그래서 발이 아주
	# 빠른 주자는 한 투구에 2루·3루를 연달아 훔친다. 원본이 그렇고, 실제
	# 야구에서도 송구가 빗나가면 일어난다 — 놓치면 도루 수가 반으로 준다
	var out: Dictionary = _steal(_bases(_r(99.0)), 0, ScriptedRng.new([0.0, 0.0, 0.0, 0.0]))
	assert_array(_occupied(out["runners"])).is_equal(["third"])
	assert_int(out["steals"]).is_equal(2)


func test_caught_stealing_costs_an_out_and_the_runner() -> void:
	var out: Dictionary = _steal(_bases(_r(95.0)), 0, ScriptedRng.new([0.0, 0.99]))
	assert_array(_occupied(out["runners"])).is_empty()
	assert_int(out["outs"]).is_equal(1)
	assert_int(out["caught"]).is_equal(1)


func test_slow_runners_do_not_steal_third() -> void:
	# ⚠ 3루 도루는 **발이 아주 빠른 주자만** 시도한다. 문턱을 없애면 전원이
	# 상한에 붙어 능력 차가 도루에 안 나타난다.
	#
	# 표본을 **문턱 바로 아래**(87)로 잡는다. 한참 느린 주자를 쓰면 문턱을
	# 없애도 확률식이 어차피 0을 주므로 검사가 문턱을 안 보게 된다
	var out: Dictionary = _steal(_bases({}, _r(87.0)), 0, ScriptedRng.new([0.0, 0.0]))
	assert_array(_occupied(out["runners"])).is_equal(["second"])
	assert_float(Tuning.steal_third_probs(87.0, 99.0, Tuning.STEAL_HOLD_MAX, 0.1)[0]) \
		.is_equal_approx(0.0, 0.0001)


func test_very_fast_runners_steal_third() -> void:
	var out: Dictionary = _steal(_bases({}, _r(99.0)), 0, ScriptedRng.new([0.0, 0.0]))
	assert_array(_occupied(out["runners"])).is_equal(["third"])
	assert_int(out["steals"]).is_equal(1)


func test_holding_runners_suppresses_attempts() -> void:
	# ⚠ 견제력 계수는 `Tuning`이 갖는다 — **리그 시뮬이 같은 규칙을 쓴다.**
	# 두 벌로 두면 주인공 기록과 리그 기록이 다른 척도가 된다
	var weak: float = Tuning.steal_hold_factor(10.0)
	var strong: float = Tuning.steal_hold_factor(95.0)
	assert_bool(weak > strong).is_true()
	var probs_weak: Array = Tuning.steal_second_probs(85.0, 75.0, weak, 0.0)
	var probs_strong: Array = Tuning.steal_second_probs(85.0, 75.0, strong, 0.0)
	assert_bool(probs_weak[0] > probs_strong[0]).is_true()
	# 성공률은 견제와 무관하다 — 뛰고 나면 송구 싸움이다
	assert_float(probs_weak[1]).is_equal_approx(probs_strong[1], 0.0001)


func test_steal_probabilities_have_pinned_values() -> void:
	# ⚠ **기준점을 값으로 못박는다.** 부등호만 보는 검사는 기준점이 밀려도
	# 통과한다 — 원본에서 주루 센스 기준점이 50이라 `instinct/50`이 되어
	# **전원이 1.5배**를 받았고, 그래서 중앙 주자도 최고 주자도 똑같이
	# 시도 상한에 붙어 능력 차가 도루에 안 나타났다.
	#
	# speed 85 · instinct 75 · 견제 없음 → (85−75)×0.008×(75/75)×1.0 = 0.080
	assert_float(Tuning.steal_second_probs(85.0, 75.0, 1.0, 0.0)[0]) \
		.is_equal_approx(0.080, 0.0001)
	# 성공률 0.65 + (85−80)×0.007 = 0.685
	assert_float(Tuning.steal_second_probs(85.0, 75.0, 1.0, 0.0)[1]) \
		.is_equal_approx(0.685, 0.0001)
	# 3루: speed 92 → (92−85)×0.006×1.0×1.0 = 0.042
	assert_float(Tuning.steal_third_probs(92.0, 75.0, 1.0, 0.0)[0]) \
		.is_equal_approx(0.042, 0.0001)


func test_steal_rates_stay_inside_their_caps() -> void:
	# 능력을 끝까지 올려도 상한을 넘지 않는다
	var p: Array = Tuning.steal_second_probs(99.0, 99.0, Tuning.STEAL_HOLD_MAX, 0.5)
	assert_bool(p[0] <= Tuning.STEAL_2B_ATTEMPT_MAX + 0.0001).is_true()
	assert_bool(p[1] <= Tuning.STEAL_2B_SUCCESS_MAX + 0.0001).is_true()
	# 바닥도 마찬가지 — 음수 확률이 나오면 그 뒤 비교가 전부 무너진다
	var q: Array = Tuning.steal_second_probs(10.0, 10.0, Tuning.STEAL_HOLD_MIN, -1.0)
	assert_bool(q[0] >= 0.0).is_true()
	assert_bool(q[1] >= Tuning.STEAL_2B_SUCCESS_MIN - 0.0001).is_true()


# ── 병살 ───────────────────────────────────────────────────────────

func _dp(ball: Dictionary, runners: Dictionary, outs: int, roll: float) -> Dictionary:
	return Baserunning.try_double_play(ball, runners, outs, ScriptedRng.new([roll]))


func test_no_double_play_with_two_outs() -> void:
	var out: Dictionary = _dp({"hit_type": "groundBall"}, _bases(_r()), 2, 0.0)
	assert_bool(out["is_double_play"]).is_false()


func test_no_double_play_without_a_runner_on_first() -> void:
	var out: Dictionary = _dp({"hit_type": "groundBall"}, _bases({}, _r()), 0, 0.0)
	assert_bool(out["is_double_play"]).is_false()


func test_fly_balls_do_not_turn_double_plays() -> void:
	# ⚠ **원본이 타구 종류를 안 봤다.** 주자 1루면 뜬공에도 22%로 병살이 붙었고,
	# 결과 코드가 하나뿐이라 화면엔 "아웃"으로만 나와 안 보였다.
	# 코드를 쪼개자마자 "중견수 병살타"가 로그에 찍혔다
	for t in ["flyBall", "popup"]:
		var out: Dictionary = _dp({"hit_type": t}, _bases(_r()), 0, 0.0)
		assert_bool(out["is_double_play"]).is_false()


func test_ground_ball_double_play_clears_first() -> void:
	var out: Dictionary = _dp({"hit_type": "groundBall"}, _bases(_r(), _r()), 0, 0.0)
	assert_bool(out["is_double_play"]).is_true()
	# 1루 주자만 지워진다 — 2·3루는 그대로다
	assert_array(_occupied(out["runners"])).is_equal(["second"])


func test_line_drive_double_plays_are_much_rarer() -> void:
	# 잡아서 주자를 묶는 경우라 땅볼보다 훨씬 드물다
	var roll: float = Tuning.DOUBLE_PLAY_BASE_PROB * 0.5
	assert_bool(_dp({"hit_type": "groundBall"}, _bases(_r()), 0, roll)["is_double_play"]).is_true()
	assert_bool(_dp({"hit_type": "lineDrive"}, _bases(_r()), 0, roll)["is_double_play"]).is_false()


func test_runners_in_scoring_position_raise_the_chance() -> void:
	# 앞 주자가 있으면 잡을 곳이 는다
	var roll: float = Tuning.DOUBLE_PLAY_BASE_PROB + 0.02
	assert_bool(_dp({"hit_type": "groundBall"}, _bases(_r()), 0, roll)["is_double_play"]).is_false()
	assert_bool(_dp({"hit_type": "groundBall"}, _bases(_r(), _r()), 0, roll)["is_double_play"]).is_true()


func test_missing_ball_info_is_not_a_double_play() -> void:
	# 타구 정보가 없으면 종류를 모른다 — 지어내지 않는다
	assert_bool(_dp({}, _bases(_r()), 0, 0.0)["is_double_play"]).is_false()
