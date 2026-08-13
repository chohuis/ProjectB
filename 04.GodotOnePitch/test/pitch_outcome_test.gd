extends GdUnitTestSuite

## 투구 품질·착탄·스윙·컨택. M2-3.
##
## 원본: `packages/engine-native/src/match_engine.rs`
##       (`resolve_actual_landing` · `swing_decision` · `calculate_contact_quality`
##        · `resolve_contact` · `calculate_pitch_quality` · 보정 함수들)
##
## ⚠ **투구 품질은 항이 열다섯인 합이다.** 한 항이 다른 항보다 크게 움직이면
## 나머지가 무의미해진다 — 원본에서 숙련도 폭이 넓어 1등급 패스트볼이 매
## 투구마다 −7.1을 먹었고 주인공 ERA가 8.78 → 19.86으로 튀었다. 그래서
## 항마다 "얼마나 움직이는가"를 검사로 잡아둔다.

const ScriptedRng = preload("res://test/support/scripted_rng.gd")


func _pitcher(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"command": 50.0, "velocity": 50.0, "control": 50.0,
		"movement": 50.0, "clutch": 50.0}
	d.merge(o, true)
	return d


func _batter(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"contact": 50.0, "eye": 50.0, "discipline": 50.0,
		"power": 50.0, "batting_clutch": 50.0}
	d.merge(o, true)
	return d


func _ctx(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"pitcher": _pitcher(), "batter": _batter(),
		"stamina": 100.0, "mental": 50.0, "grade": 3,
		"decision": {"pitch_type": "fastball", "location": 5, "strategy": "balanced", "power": "normal"},
		"landing": Vector2.ZERO,
		"count": {"balls": 0, "strikes": 0},
		"weather": "sunny", "park": "neutral",
		"last_pitch_types": [],
		"runners": {"first": {}, "second": {}, "third": {}},
		"outs": 0, "inning": 1, "inning_limit": 9,
		"score": {"home": 0, "away": 0},
	}
	d.merge(o, true)
	return d


func _bases(first: Dictionary = {}, second: Dictionary = {}, third: Dictionary = {}) -> Dictionary:
	return {"first": first, "second": second, "third": third}


func _runner() -> Dictionary:
	return {"speed": 70.0, "instinct": 70.0}


# ── 제구 흩어짐 ────────────────────────────────────────────────────

func test_better_control_scatters_less() -> void:
	var good: float = PitchOutcome.dispersion_sigma(90.0, 100.0, 50.0, {})
	var bad: float = PitchOutcome.dispersion_sigma(20.0, 100.0, 50.0, {})
	assert_bool(good < bad).is_true()


func test_fatigue_and_nerves_widen_the_scatter() -> void:
	var fresh: float = PitchOutcome.dispersion_sigma(50.0, 100.0, 50.0, {})
	var tired: float = PitchOutcome.dispersion_sigma(50.0, 10.0, 50.0, {})
	var rattled: float = PitchOutcome.dispersion_sigma(50.0, 100.0, 10.0, {})
	assert_bool(tired > fresh).is_true()
	assert_bool(rattled > fresh).is_true()


func test_high_stamina_and_mental_do_not_shrink_the_scatter() -> void:
	# ⚠ 벌점만 있고 상은 없다. 100이든 50이든 같다 — 한쪽만 걸려야
	# "지치면 흔들린다"가 되고, 양쪽이면 능력 좋은 투수가 두 번 이득을 본다
	assert_float(PitchOutcome.dispersion_sigma(50.0, 100.0, 100.0, {})) \
		.is_equal_approx(PitchOutcome.dispersion_sigma(50.0, 50.0, 50.0, {}), 0.0001)


func test_pressure_situations_widen_the_scatter() -> void:
	var calm: float = PitchOutcome.dispersion_sigma(50.0, 100.0, 50.0, {})
	var scoring: float = PitchOutcome.dispersion_sigma(50.0, 100.0, 50.0, {"has_scoring": true})
	var loaded: float = PitchOutcome.dispersion_sigma(50.0, 100.0, 50.0,
		{"has_scoring": true, "is_full_base": true})
	var late: float = PitchOutcome.dispersion_sigma(50.0, 100.0, 50.0,
		{"has_scoring": true, "is_full_base": true, "is_late": true})
	assert_bool(scoring > calm).is_true()
	assert_bool(loaded > scoring).is_true()
	assert_bool(late > loaded).is_true()


func test_scatter_never_goes_to_zero() -> void:
	# 0이면 겨냥한 곳에 100% 꽂힌다 — 아무리 좋은 투수도 그렇지 않다
	assert_bool(PitchOutcome.dispersion_sigma(99.0, 100.0, 99.0, {}) >= 0.02).is_true()


# ── 존 판정 ────────────────────────────────────────────────────────

func test_zone_boundaries() -> void:
	assert_str(PitchOutcome.zone_of(Vector2(0.9, 0.9))).is_equal("zone")
	assert_str(PitchOutcome.zone_of(Vector2(1.1, 0.0))).is_equal("shadow")
	assert_str(PitchOutcome.zone_of(Vector2(1.5, 0.0))).is_equal("ball")
	# 모서리도 두 축을 다 본다 — x만 보면 대각선으로 빠진 공이 스트라이크가 된다
	assert_str(PitchOutcome.zone_of(Vector2(0.9, 1.5))).is_equal("ball")


func test_landing_uses_the_target_as_its_centre() -> void:
	# 난수가 정확히 가운데(0.5)면 정규분포 값이 0에 가깝다
	var r = ScriptedRng.new([0.5, 0.5, 0.5, 0.5])
	var out: Dictionary = PitchOutcome.resolve_landing(Vector2(0.6, -0.6), 50.0, 100.0, 50.0, {}, r)
	assert_bool(out["landing"].distance_to(Vector2(0.6, -0.6)) < 0.35).is_true()
	assert_bool(out["in_zone"]).is_true()


# ── 스윙 판단 ──────────────────────────────────────────────────────

func test_batters_swing_at_strikes() -> void:
	var out: Dictionary = PitchOutcome.swing_decision(Vector2(0.2, 0.2), "fastball",
		_batter(), true, false, ScriptedRng.new([0.5]))
	assert_bool(out["swung"]).is_true()


func test_disciplined_batters_lay_off_balls() -> void:
	# 존 바로 바깥 — 선구안이 좋으면 손이 안 나가고 나쁘면 쫓아간다.
	# 표본을 존에서 **살짝** 벗어난 곳에 둔다. 아주 멀리 빠진 공은 누구도
	# 안 휘두르므로 그걸로는 선구안 차이가 안 보인다
	#
	# ⚠ **선구안만 다르게 둔다.** 눈과 선구안을 같이 움직이면 한쪽 항을
	# 통째로 지워도 다른 쪽이 가려준다
	var patient: Dictionary = PitchOutcome.swing_decision(Vector2(1.2, 0.0), "curve",
		_batter({"discipline": 90.0}), false, false, ScriptedRng.new([0.1]))
	var hacker: Dictionary = PitchOutcome.swing_decision(Vector2(1.2, 0.0), "curve",
		_batter({"discipline": 10.0}), false, false, ScriptedRng.new([0.1]))
	assert_bool(patient["swung"]).is_false()
	assert_bool(hacker["swung"]).is_true()


func test_nobody_chases_a_pitch_way_outside() -> void:
	# 스윙 존을 아무리 넓혀도 한참 빠진 공은 안 나간다 — 2%다
	var out: Dictionary = PitchOutcome.swing_decision(Vector2(1.9, 1.9), "curve",
		_batter({"discipline": 5.0, "eye": 5.0}), false, false, ScriptedRng.new([0.1]))
	assert_bool(out["swung"]).is_false()


func test_the_umpire_calls_the_zone_a_strike() -> void:
	var out: Dictionary = PitchOutcome.swing_decision(Vector2(0.2, 0.2), "fastball",
		_batter(), true, false, ScriptedRng.new([0.99]))
	assert_bool(out["umpire_strike"]).is_true()


func test_borderline_pitches_are_a_coin_flip() -> void:
	# ⚠ 경계선은 심판이 잡아줄 수도, 안 잡아줄 수도 있다. 늘 볼로 두면
	# 볼넷이 넘치고, 늘 스트라이크로 두면 존이 커진 것과 같다
	var called: Dictionary = PitchOutcome.swing_decision(Vector2(1.1, 0.0), "fastball",
		_batter(), false, true, ScriptedRng.new([0.0]))
	var missed: Dictionary = PitchOutcome.swing_decision(Vector2(1.1, 0.0), "fastball",
		_batter(), false, true, ScriptedRng.new([0.99]))
	assert_bool(called["umpire_strike"]).is_true()
	assert_bool(missed["umpire_strike"]).is_false()


func test_fastballs_pull_the_bat() -> void:
	# ⚠ 직구는 스윙 존을 넓힌다. 이게 없으면 구종이 스윙 유도에 아무 영향이
	# 없고 "빠른 공으로 헛스윙을 뽑는다"가 성립하지 않는다
	var fb: Dictionary = PitchOutcome.swing_decision(Vector2(1.22, 0.0), "fastball",
		_batter(), false, false, ScriptedRng.new([0.1]))
	var cb: Dictionary = PitchOutcome.swing_decision(Vector2(1.22, 0.0), "curve",
		_batter(), false, false, ScriptedRng.new([0.1]))
	assert_bool(fb["swung"]).is_true()
	assert_bool(cb["swung"]).is_false()


func test_ball_four_is_never_a_called_strike() -> void:
	var out: Dictionary = PitchOutcome.swing_decision(Vector2(1.9, 1.9), "fastball",
		_batter(), false, false, ScriptedRng.new([0.0]))
	assert_bool(out["umpire_strike"]).is_false()


# ── 컨택 품질 ──────────────────────────────────────────────────────

func test_better_contact_hitters_lower_the_number() -> void:
	# 낮을수록 타자에게 유리한 척도다
	var good: float = PitchOutcome.contact_quality(56.0, _batter({"contact": 90.0}), true, false)
	var bad: float = PitchOutcome.contact_quality(56.0, _batter({"contact": 20.0}), true, false)
	assert_bool(good < bad).is_true()


func test_chasing_out_of_the_zone_is_punished() -> void:
	# 그림자보다 완전히 빠진 공을 쫓아간 쪽이 더 나쁘다
	var in_zone: float = PitchOutcome.contact_quality(56.0, _batter(), true, false)
	var shadow: float = PitchOutcome.contact_quality(56.0, _batter(), false, true)
	var chase: float = PitchOutcome.contact_quality(56.0, _batter(), false, false)
	assert_bool(shadow > in_zone).is_true()
	assert_bool(chase > shadow).is_true()


# ── 컨택 결과 ──────────────────────────────────────────────────────

func test_a_dominated_swing_usually_misses() -> void:
	# 투수 완승 구간 — 헛스윙 50%
	assert_str(PitchOutcome.resolve_contact(56.0, 80.0, _batter(), ScriptedRng.new([0.1]))) \
		.is_equal("STRIKE_SWING")
	assert_str(PitchOutcome.resolve_contact(56.0, 80.0, _batter(), ScriptedRng.new([0.6]))) \
		.is_equal("FOUL")


func test_a_crushed_ball_never_becomes_a_swinging_strike() -> void:
	# ⚠ 통타 구간엔 헛스윙이 없다. 있으면 타자가 완전히 이긴 공에도
	# 삼진이 붙어 삼진 수가 부풀고 타율이 죽는다
	for roll in [0.0, 0.1, 0.21]:
		assert_str(PitchOutcome.resolve_contact(56.0, 20.0, _batter(), ScriptedRng.new([roll]))) \
			.is_not_equal("STRIKE_SWING")


func test_fouls_appear_in_every_band() -> void:
	# ⚠ **파울이 적으면 승부가 너무 빨리 끝나 삼진도 볼넷도 안 나온다.**
	# 어느 구간이든 파울이 있어야 한다
	for cq in [80.0, 65.0, 55.0, 48.0, 35.0, 20.0]:
		var seen: bool = false
		for i in 100:
			if PitchOutcome.resolve_contact(56.0, cq, _batter(), ScriptedRng.new([i * 0.01])) == "FOUL":
				seen = true
				break
		assert_bool(seen).is_true()


func test_worse_contact_quality_yields_more_hits() -> void:
	# 같은 난수에서 구간이 내려갈수록 결과가 좋아진다
	var hits: Array = ["HIT_SINGLE", "HIT_DOUBLE", "HIT_TRIPLE", "HOME_RUN"]
	assert_bool(hits.has(PitchOutcome.resolve_contact(56.0, 20.0, _batter(), ScriptedRng.new([0.9])))).is_true()
	assert_bool(hits.has(PitchOutcome.resolve_contact(56.0, 80.0, _batter(), ScriptedRng.new([0.9])))).is_false()


func test_power_hitters_get_more_out_of_the_same_swing() -> void:
	# 힘이 세면 같은 난수에서 인플레이 아웃이 안타가 된다
	var strong: String = PitchOutcome.resolve_contact(56.0, 35.0, _batter({"power": 95.0}),
		ScriptedRng.new([0.70]))
	var weak: String = PitchOutcome.resolve_contact(56.0, 35.0, _batter({"power": 10.0}),
		ScriptedRng.new([0.70]))
	assert_str(strong).is_equal("HIT_SINGLE")
	assert_str(weak).is_equal("INPLAY_OUT")


# ── 카운트·패턴·압박 ──────────────────────────────────────────────

func test_ahead_in_the_count_helps_the_pitcher() -> void:
	assert_float(PitchOutcome.count_modifier(0, 2)).is_equal_approx(5.0, 0.001)
	assert_float(PitchOutcome.count_modifier(3, 0)).is_equal_approx(-8.0, 0.001)
	assert_float(PitchOutcome.count_modifier(1, 1)).is_equal_approx(0.0, 0.001)


func test_repeating_a_pitch_gets_punished() -> void:
	# ⚠ 같은 공만 던지면 읽힌다. 이게 없으면 제일 좋은 구종 하나만 던지는 게
	# 언제나 최선이 되어 구종 구성이 뜻을 잃는다
	assert_float(PitchOutcome.pattern_modifier("slider", ["slider"])).is_equal_approx(-1.0, 0.001)
	assert_float(PitchOutcome.pattern_modifier("slider", ["slider", "slider"])).is_equal_approx(-2.0, 0.001)
	assert_float(PitchOutcome.pattern_modifier("slider", ["slider", "slider", "slider"])).is_equal_approx(-4.0, 0.001)


func test_a_fresh_pitch_is_rewarded() -> void:
	assert_float(PitchOutcome.pattern_modifier("curve", ["fastball", "slider", "fastball"])) \
		.is_equal_approx(1.0, 0.001)
	# 첫 투구는 비교할 게 없다
	assert_float(PitchOutcome.pattern_modifier("curve", [])).is_equal_approx(0.0, 0.001)


func test_no_jam_pressure_without_runners_in_scoring_position() -> void:
	assert_float(PitchOutcome.jam_modifier(_bases(_runner()), 0, 50.0, 50.0)) \
		.is_equal_approx(0.0, 0.001)


func test_jam_pressure_stacks() -> void:
	var base: float = PitchOutcome.jam_modifier(_bases({}, _runner()), 0, 50.0, 50.0)
	var two_out: float = PitchOutcome.jam_modifier(_bases({}, _runner()), 2, 50.0, 50.0)
	var loaded: float = PitchOutcome.jam_modifier(_bases(_runner(), _runner(), _runner()), 2, 50.0, 50.0)
	var shaky: float = PitchOutcome.jam_modifier(_bases({}, _runner()), 0, 20.0, 50.0)
	assert_bool(base < 0.0).is_true()
	assert_bool(two_out < base).is_true()
	assert_bool(loaded < two_out).is_true()
	assert_bool(shaky < base).is_true()


func test_clutch_hitters_add_pressure() -> void:
	var clutch: float = PitchOutcome.jam_modifier(_bases({}, _runner()), 0, 50.0, 90.0)
	var meek: float = PitchOutcome.jam_modifier(_bases({}, _runner()), 0, 50.0, 10.0)
	assert_bool(clutch < meek).is_true()


func test_no_clutch_pressure_early_or_in_a_blowout() -> void:
	# 3회에는 아직 승부처가 아니고, 10점 차면 압박이 없다
	assert_float(PitchOutcome.clutch_modifier(3, 9, 0, 0, 50.0)).is_equal_approx(0.0, 0.001)
	assert_float(PitchOutcome.clutch_modifier(9, 9, 10, 0, 50.0)).is_equal_approx(0.0, 0.001)


func test_late_and_close_is_pressure() -> void:
	var late: float = PitchOutcome.clutch_modifier(9, 9, 3, 3, 50.0)
	assert_bool(late < 0.0).is_true()
	# 배짱이 좋으면 덜 눌린다
	var brave: float = PitchOutcome.clutch_modifier(9, 9, 3, 3, 95.0)
	assert_bool(brave > late).is_true()


# ── 멘탈 ───────────────────────────────────────────────────────────

func test_outs_lift_and_hits_hurt() -> void:
	assert_bool(PitchOutcome.mental_delta("GROUND_OUT") > 0.0).is_true()
	assert_bool(PitchOutcome.mental_delta("HOME_RUN") < 0.0).is_true()
	# 병살은 아웃 두 개다 — 하나짜리의 두 배로 둔다
	assert_float(PitchOutcome.mental_delta("DOUBLE_PLAY")) \
		.is_equal_approx(PitchOutcome.mental_delta("GROUND_OUT") * 2.0, 0.001)


func test_bigger_hits_hurt_more() -> void:
	assert_bool(PitchOutcome.mental_delta("HOME_RUN") < PitchOutcome.mental_delta("HIT_TRIPLE")).is_true()
	assert_bool(PitchOutcome.mental_delta("HIT_TRIPLE") < PitchOutcome.mental_delta("HIT_SINGLE")).is_true()


func test_an_error_behind_you_hurts() -> void:
	# 내 잘못이 아니어도 흔들린다
	assert_bool(PitchOutcome.mental_delta("FIELDING_ERROR") < 0.0).is_true()


# ── 장타 승격 ──────────────────────────────────────────────────────

func test_hits_can_be_upgraded() -> void:
	assert_str(PitchOutcome.apply_hit_upgrade("HIT_SINGLE", 50.0, "sunny", ScriptedRng.new([0.0, 0.0]))) \
		.is_equal("HOME_RUN")
	assert_str(PitchOutcome.apply_hit_upgrade("HIT_SINGLE", 50.0, "sunny", ScriptedRng.new([0.0, 0.99]))) \
		.is_equal("HIT_DOUBLE")
	assert_str(PitchOutcome.apply_hit_upgrade("HIT_SINGLE", 50.0, "sunny", ScriptedRng.new([0.99]))) \
		.is_equal("HIT_SINGLE")


func test_outs_are_never_upgraded() -> void:
	# ⚠ 아웃이 홈런이 되면 안 된다. 코드가 늘 때 여기 걸러지지 않으면 조용히 샌다
	for code in ["GROUND_OUT", "STRIKE_SWING", "WALK", "HIT_TRIPLE", "HOME_RUN"]:
		assert_str(PitchOutcome.apply_hit_upgrade(code, 99.0, "windyOut", ScriptedRng.new([0.0]))) \
			.is_equal(code)


func test_power_and_wind_help_the_upgrade() -> void:
	# 같은 난수에서 힘센 타자·바람 부는 날엔 승격되고 아니면 안 된다
	var roll: float = 0.25
	assert_str(PitchOutcome.apply_hit_upgrade("HIT_SINGLE", 99.0, "windyOut",
		ScriptedRng.new([roll, 0.99]))).is_equal("HIT_DOUBLE")
	assert_str(PitchOutcome.apply_hit_upgrade("HIT_SINGLE", 10.0, "windyIn",
		ScriptedRng.new([roll, 0.99]))).is_equal("HIT_SINGLE")


# ── 투구 품질 (합) ─────────────────────────────────────────────────

func _quality(o: Dictionary = {}, rolls: Array = [0.5, 0.5]) -> float:
	return PitchOutcome.pitch_quality(_ctx(o), ScriptedRng.new(rolls))


func test_better_pitchers_throw_better_pitches() -> void:
	var ace: float = _quality({"pitcher": _pitcher({"command": 90.0, "velocity": 90.0, "control": 90.0})})
	var scrub: float = _quality({"pitcher": _pitcher({"command": 20.0, "velocity": 20.0, "control": 20.0})})
	assert_bool(ace > scrub).is_true()


func test_each_pitcher_attribute_moves_the_quality_on_its_own() -> void:
	# ⚠ **능력치를 묶어서 보면 한 항을 통째로 지워도 다른 항이 가려준다.**
	# 항마다 따로 본다
	for key in ["command", "velocity", "control"]:
		var hi: Dictionary = {}
		var lo: Dictionary = {}
		hi[key] = 95.0
		lo[key] = 5.0
		assert_bool(_quality({"pitcher": _pitcher(hi)}) > _quality({"pitcher": _pitcher(lo)})).is_true()


func test_better_batters_lower_the_quality() -> void:
	var star: float = _quality({"batter": _batter({"contact": 90.0, "eye": 90.0, "discipline": 90.0})})
	var weak: float = _quality({"batter": _batter({"contact": 20.0, "eye": 20.0, "discipline": 20.0})})
	assert_bool(star < weak).is_true()


func test_mastery_actually_reaches_the_result() -> void:
	# ⚠ **원본에서 숙련도는 배우는 속도만 늦추고 결과엔 안 닿았다.** 화면엔
	# "숙련도 4/5"라고 적혀 있는데 던지면 차이가 없었다
	#
	# 등급이 한 칸 오를 때마다 올라야 한다 — 양 끝만 보면 가운데를 평평하게
	# 만들어도 통과한다
	assert_bool(_quality({"grade": 5}) > _quality({"grade": 3})).is_true()
	assert_bool(_quality({"grade": 3}) > _quality({"grade": 1})).is_true()


func test_mastery_does_not_dominate_the_sum() -> void:
	# ⚠ 폭을 넓게 잡았다가 1등급 패스트볼이 매 투구 −7.1을 먹었다. 품질은
	# 여러 항의 합이고 다른 보정이 ±5 규모다 — 혼자 그 이상을 움직이면
	# 나머지 항이 전부 무의미해진다
	var span: float = Tuning.grade_quality_bonus(5) - Tuning.grade_quality_bonus(0)
	assert_bool(span <= 8.0).is_true()


func test_fatigue_lowers_the_quality() -> void:
	assert_bool(_quality({"stamina": 20.0}) < _quality({"stamina": 100.0})).is_true()


func test_velocity_matters_more_on_fastballs() -> void:
	var fast: Dictionary = {"pitch_type": "fastball", "location": 5, "strategy": "balanced", "power": "normal"}
	var slow: Dictionary = {"pitch_type": "curve", "location": 5, "strategy": "balanced", "power": "normal"}
	var hard_fb: float = _quality({"pitcher": _pitcher({"velocity": 95.0}), "decision": fast}) \
		- _quality({"pitcher": _pitcher({"velocity": 5.0}), "decision": fast})
	var hard_cb: float = _quality({"pitcher": _pitcher({"velocity": 95.0}), "decision": slow}) \
		- _quality({"pitcher": _pitcher({"velocity": 5.0}), "decision": slow})
	assert_bool(hard_fb > hard_cb).is_true()


func test_movement_only_matters_off_the_fastball() -> void:
	# 직구에 무브먼트를 걸면 변화구의 존재 이유가 사라진다
	var fast: Dictionary = {"pitch_type": "fastball", "location": 5, "strategy": "balanced", "power": "normal"}
	var same: float = _quality({"pitcher": _pitcher({"movement": 95.0}), "decision": fast}) \
		- _quality({"pitcher": _pitcher({"movement": 5.0}), "decision": fast})
	assert_float(same).is_equal_approx(0.0, 0.001)


func test_the_corners_are_better_than_the_middle() -> void:
	var corner: float = _quality({"landing": Vector2(0.9, 0.9)})
	var middle: float = _quality({"landing": Vector2.ZERO})
	assert_bool(corner > middle).is_true()


func test_weather_and_park_move_the_quality() -> void:
	assert_bool(_quality({"park": "pitcherPark"}) > _quality({"park": "hitterPark"})).is_true()
	assert_bool(_quality({"weather": "windyIn"}) > _quality({"weather": "rainy"})).is_true()


func test_rain_hurts_breaking_balls_more() -> void:
	# 젖은 공은 쥐기가 어렵다. 직구보다 변화구가 더 죽는다
	assert_bool(Tuning.weather_quality_modifier("rainy", "fastball")
		> Tuning.weather_quality_modifier("rainy", "curve")).is_true()


func test_pitch_types_do_not_start_from_the_same_place() -> void:
	# ⚠ 바닥 품질이 같으면 구종을 고를 이유가 사라진다. 능력치를 전부 기본으로
	# 두면 남는 차이는 구종의 바닥값뿐이다
	var fast: Dictionary = {"pitch_type": "fastball", "location": 5, "strategy": "balanced", "power": "normal"}
	var knuckle: Dictionary = {"pitch_type": "knuckleball", "location": 5, "strategy": "balanced", "power": "normal"}
	assert_bool(_quality({"decision": fast}) > _quality({"decision": knuckle})).is_true()


func test_a_full_count_adds_noise() -> void:
	# 3-2는 승부처다 — **여기만** 흔들림을 하나 더 얹는다.
	#
	# ⚠ 같은 카운트에서 난수만 바꿔 비교하면 안 된다. 흔들림을 빼도 그 난수를
	# 기본 잡음이 대신 먹어서 값이 여전히 달라진다 — 검사가 통과해 버린다.
	# **폭**을 다른 카운트와 견줘야 한다
	var full_span: float = _quality({"count": {"balls": 3, "strikes": 2}}, [1.0]) \
		- _quality({"count": {"balls": 3, "strikes": 2}}, [0.0])
	var normal_span: float = _quality({"count": {"balls": 1, "strikes": 1}}, [1.0]) \
		- _quality({"count": {"balls": 1, "strikes": 1}}, [0.0])
	assert_bool(full_span > normal_span).is_true()
