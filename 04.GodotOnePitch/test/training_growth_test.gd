extends GdUnitTestSuite

## 훈련 성장 — 한 주 훈련이 능력을 얼마나 올리나. M4-3.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `calc_training_growth`
##
## ⚠ 피로·컨디션은 **`Training.plan_load`가 정본이다.** 여기서 또 더하면
## 두 배가 된다 — 원본이 회복 훈련을 건너뛰는 이유가 그것이다.


func _program(id: String, o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": id, "base_xp": 10.0, "fatigue_cost": 8.0, "condition_cost": 1.0,
		"is_recovery": false, "is_pitch_dev": false, "progress_per_week": 0.0,
		"gains_pitching": {}, "gains_batting": {},
	}
	d.merge(o, true)
	return d


func _programs() -> Array:
	return [
		_program("VELO", {"gains_pitching": {"velocity": 1.0}}),
		_program("CMD", {"gains_pitching": {"command": 1.0, "control": 0.5}}),
		_program("POWER", {"gains_batting": {"power": 1.0}}),
		_program("REST", {"is_recovery": true, "fatigue_cost": -10.0, "condition_cost": -3.0,
			"gains_pitching": {"velocity": 5.0}}),
		_program("NEWPITCH", {"is_pitch_dev": true, "progress_per_week": 12.0,
			"base_xp": 10.0, "gains_pitching": {"movement": 1.0}}),
	]


func _player(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"age": 20, "diligence": 50.0, "condition": 100.0, "fatigue": 0.0,
		"development_rate": 62.0, "potential_hidden": 75.0,
		"pitching": {"velocity": 50.0, "command": 50.0, "control": 50.0, "movement": 50.0},
		"batting": {"power": 50.0, "contact": 50.0},
		"pitching_xp": {}, "batting_xp": {},
		"pitches": [], "training_pitch_state": {},
	}
	d.merge(o, true)
	return d


func _plan(a: String = "", b: String = "", c: String = "") -> Dictionary:
	return {"primary": a, "secondary": b, "secondary2": c}


func _run(plan: Dictionary, player: Dictionary = {}, eff: float = 1.0) -> Dictionary:
	var p: Dictionary = player if not player.is_empty() else _player()
	return TrainingGrowth.calc(p, plan, _programs(), eff)


# ── XP가 능력으로 ──────────────────────────────────────────────────

func test_training_raises_the_trained_stat() -> void:
	# 문턱(50 → 25.0)을 넘을 만큼 여러 주를 돌린다
	var p: Dictionary = _player()
	for i in 6:
		var r: Dictionary = _run(_plan("VELO"), p)
		p["pitching"] = r["pitching"]
		p["pitching_xp"] = r["pitching_xp"]
	assert_bool(p["pitching"]["velocity"] > 50.0).is_true()


func test_untrained_stats_do_not_move() -> void:
	var r: Dictionary = _run(_plan("VELO"))
	assert_float(r["pitching"]["command"]).is_equal_approx(50.0, 0.001)
	assert_float(r["batting"]["power"]).is_equal_approx(50.0, 0.001)


func test_a_program_can_train_several_stats_at_different_rates() -> void:
	var r: Dictionary = _run(_plan("CMD"))
	# command 1.0 · control 0.5 — 절반씩 들어간다
	assert_bool(r["pitching_xp"]["command"] > r["pitching_xp"]["control"]).is_true()
	assert_float(r["pitching_xp"]["command"]).is_equal_approx(
		r["pitching_xp"]["control"] * 2.0, 0.01)


func test_batting_programs_reach_batting_stats() -> void:
	var r: Dictionary = _run(_plan("POWER"))
	assert_bool(r["batting_xp"]["power"] > 0.0).is_true()


# ── 슬롯 배수 ──────────────────────────────────────────────────────

func test_the_primary_slot_learns_the_most() -> void:
	# XP 배수 주 2.5 · 보조1 1.5 · 보조2 1.0
	var main: float = _run(_plan("VELO"))["pitching_xp"]["velocity"]
	var sub1: float = _run(_plan("", "VELO"))["pitching_xp"]["velocity"]
	var sub2: float = _run(_plan("", "", "VELO"))["pitching_xp"]["velocity"]
	assert_float(main / sub1).is_equal_approx(2.5 / 1.5, 0.01)
	assert_float(sub1 / sub2).is_equal_approx(1.5, 0.01)


func test_the_same_program_in_two_slots_stacks() -> void:
	# ⚠ **레벨업이 일어나면 남은 XP가 비례하지 않는다.** 문턱을 넘는 표본으로
	# 비율을 재면 엉뚱한 값이 나온다 — 능력이 높아 문턱이 먼 선수로 본다
	var p: Dictionary = _player({"potential_hidden": 99.0})
	p["pitching"]["velocity"] = 90.0
	var one: float = TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.0)["pitching_xp"]["velocity"]
	var two: float = TrainingGrowth.calc(p, _plan("VELO", "VELO"), _programs(), 1.0)["pitching_xp"]["velocity"]
	assert_float(two / one).is_equal_approx((2.5 + 1.5) / 2.5, 0.01)


# ── 회복 훈련 ──────────────────────────────────────────────────────

func test_recovery_programs_give_no_xp() -> void:
	# ⚠ **피로·컨디션은 `plan_load`가 이미 셌다.** 여기서 또 처리하면 두 배다.
	# 그래서 회복 훈련은 통째로 건너뛴다 — 능력치 이득이 붙어 있어도 안 준다
	var r: Dictionary = _run(_plan("REST"))
	assert_bool(r["pitching_xp"].is_empty() or r["pitching_xp"].get("velocity", 0.0) == 0.0).is_true()


func test_recovery_still_moves_fatigue() -> void:
	# XP는 안 줘도 피로는 준다 — `plan_load`가 하는 일이다
	var r: Dictionary = _run(_plan("REST"))
	assert_bool(r["fatigue_delta"] < 0.0).is_true()


func test_fatigue_and_condition_match_the_plan() -> void:
	# ⚠ 미리보기와 실제가 갈리면 화면이 거짓말을 한다
	var plan: Dictionary = _plan("VELO", "CMD")
	var r: Dictionary = _run(plan)
	var load: Dictionary = Training.plan_load(0.0, plan, _programs())
	assert_float(r["fatigue_delta"]).is_equal_approx(load["fatigue_delta"], 0.001)
	assert_float(r["condition_delta"]).is_equal_approx(load["condition_delta"], 0.001)


# ── 나이·효율 ──────────────────────────────────────────────────────

func test_older_players_learn_less() -> void:
	var young: float = _run(_plan("VELO"), _player({"age": 22}))["pitching_xp"]["velocity"]
	var old: float = _run(_plan("VELO"), _player({"age": 37}))["pitching_xp"]["velocity"]
	assert_bool(young > old).is_true()
	assert_float(old / young).is_equal_approx(0.55, 0.01)


func test_the_efficiency_modifier_scales_everything() -> void:
	# 코치·시설이 여기로 들어온다.
	# 레벨업이 끼면 남은 XP가 비례하지 않으므로 문턱이 먼 선수로 본다
	var p: Dictionary = _player({"potential_hidden": 99.0})
	p["pitching"]["velocity"] = 90.0
	var base: float = TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.0)["pitching_xp"]["velocity"]
	var boosted: float = TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.5)["pitching_xp"]["velocity"]
	assert_float(boosted / base).is_equal_approx(1.5, 0.01)


# ── 잠재력 ─────────────────────────────────────────────────────────

## 여러 주를 돌려 최종 능력치를 본다.
##
## ⚠ **남은 XP로 "더 배웠나"를 재면 안 된다.** 레벨업이 일어나면 남은 XP가
## 오히려 줄어서 **더 많이 배운 쪽이 작아 보인다** — 실제로 이 검사가 그렇게
## 뒤집혀 있었다
func _train_weeks(player: Dictionary, plan: Dictionary, weeks: int) -> float:
	var p: Dictionary = player.duplicate(true)
	for i in weeks:
		var r: Dictionary = TrainingGrowth.calc(p, plan, _programs(), 1.0)
		p["pitching"] = r["pitching"]
		p["pitching_xp"] = r["pitching_xp"]
	return p["pitching"]["velocity"]


func test_higher_potential_learns_faster() -> void:
	var low: float = _train_weeks(_player({"potential_hidden": 65.0}), _plan("VELO"), 10)
	var high: float = _train_weeks(_player({"potential_hidden": 95.0}), _plan("VELO"), 10)
	assert_bool(high > low).is_true()


func test_a_broken_potential_value_is_clamped() -> void:
	# ⚠ 세이브가 범위 밖 값을 들고 올 수 있다. 안 자르면 **천장이 사라진다** —
	# 잠재력 200이면 능력 90도 "아직 절반"이라 감쇠가 안 걸린다.
	#
	# 학습 속도 쪽은 `potential_speed_factor`가 자기 안에서도 자르므로,
	# 차이는 **천장 감쇠에서만** 난다. 그래서 능력을 천장 가까이 올려 둔다
	var sane: Dictionary = _player({"potential_hidden": 99.0})
	sane["pitching"]["velocity"] = 90.0
	var broken: Dictionary = _player({"potential_hidden": 200.0})
	broken["pitching"]["velocity"] = 90.0
	assert_float(_train_weeks(broken, _plan("VELO"), 10)) \
		.is_equal_approx(_train_weeks(sane, _plan("VELO"), 10), 0.001)


func test_stats_near_the_ceiling_grow_slower() -> void:
	# ⚠ **천장은 스탯마다 따로 본다.** 하나로 묶으면 이미 다 큰 스탯이
	# 아직 낮은 스탯의 성장까지 막는다
	var p: Dictionary = _player({"potential_hidden": 80.0})
	p["pitching"]["velocity"] = 79.0   # 거의 천장
	p["pitching"]["command"] = 40.0    # 아직 여유
	var r: Dictionary = TrainingGrowth.calc(p, _plan("VELO", "CMD"), _programs(), 1.0)
	# 같은 슬롯 배수가 아니므로 배수를 걷어내고 비교한다
	var velo_per: float = r["pitching_xp"]["velocity"] / 2.5
	var cmd_per: float = r["pitching_xp"]["command"] / 1.5
	assert_bool(velo_per < cmd_per).is_true()


func test_a_maxed_stat_still_creeps_up() -> void:
	# 0이면 천장에 닿는 순간 화면엔 "훈련 중"인데 아무 일도 안 일어난다
	var p: Dictionary = _player({"potential_hidden": 70.0})
	p["pitching"]["velocity"] = 70.0
	var r: Dictionary = TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.0)
	assert_bool(r["pitching_xp"]["velocity"] > 0.0).is_true()


# ── 구종 개발 ──────────────────────────────────────────────────────

func test_developing_a_pitch_makes_progress() -> void:
	var r: Dictionary = _run(_plan("NEWPITCH"))
	assert_bool(r["pitch_dev_gain"] > 0.0).is_true()


func test_a_well_learned_pitch_progresses_slower() -> void:
	# ⚠ 숙련도가 오를수록 진행이 느려진다. 없으면 5등급까지 같은 속도로 올라
	# 숙련도 체계가 뜻을 잃는다
	var raw: Dictionary = _player({
		"pitches": [{"id": "SLIDER", "grade": 1}],
		"training_pitch_state": {"id": "SLIDER"},
	})
	var honed: Dictionary = _player({
		"pitches": [{"id": "SLIDER", "grade": 4}],
		"training_pitch_state": {"id": "SLIDER"},
	})
	var a: float = TrainingGrowth.calc(raw, _plan("NEWPITCH"), _programs(), 1.0)["pitch_dev_gain"]
	var b: float = TrainingGrowth.calc(honed, _plan("NEWPITCH"), _programs(), 1.0)["pitch_dev_gain"]
	assert_bool(a > b).is_true()


func test_pitch_development_slows_when_out_of_shape() -> void:
	# ⚠ 컨디션이 안 걸리면 아파도 폼이 나빠도 새 구종이 똑같이 익는다
	var good: float = _run(_plan("NEWPITCH"), _player({"condition": 100.0}))["pitch_dev_gain"]
	var poor: float = _run(_plan("NEWPITCH"), _player({"condition": 40.0}))["pitch_dev_gain"]
	assert_float(poor / good).is_equal_approx(0.4, 0.001)


func test_pitch_development_slows_when_tired() -> void:
	var fresh: float = _run(_plan("NEWPITCH"), _player({"fatigue": 0.0}))["pitch_dev_gain"]
	var worn: float = _run(_plan("NEWPITCH"), _player({"fatigue": 90.0}))["pitch_dev_gain"]
	assert_bool(fresh > worn).is_true()
	# ⚠ **하한 0.3이 있다.** 없으면 피로 100에서 0.167까지 떨어지고,
	# 120을 넘으면 음수가 되어 구종이 **거꾸로 풀린다**.
	# 하한에 실제로 닿는 표본으로 봐야 그 줄을 지키는지 알 수 있다
	var spent: float = _run(_plan("NEWPITCH"), _player({"fatigue": 100.0}))["pitch_dev_gain"]
	assert_float(spent / fresh).is_equal_approx(0.3, 0.001)


func test_a_pitch_program_gives_no_stat_xp() -> void:
	var r: Dictionary = _run(_plan("NEWPITCH"))
	assert_bool(r["pitching_xp"].is_empty()).is_true()


# ── 레벨업 ─────────────────────────────────────────────────────────

func test_levelling_logs_what_went_up() -> void:
	var p: Dictionary = _player({"pitching_xp": {"velocity": 24.0}})
	var r: Dictionary = TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.0)
	assert_float(r["pitching"]["velocity"]).is_equal_approx(51.0, 0.001)
	assert_bool(r["logs"].size() > 0).is_true()


func test_leftover_xp_carries_over() -> void:
	# 버리면 성장이 눈에 띄게 느려진다
	var p: Dictionary = _player({"pitching_xp": {"velocity": 24.0}})
	var r: Dictionary = TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.0)
	assert_bool(r["pitching_xp"]["velocity"] > 0.0).is_true()


func test_the_input_player_is_not_mutated() -> void:
	# 호출부가 훈련 전 상태를 아직 쥐고 있다
	var p: Dictionary = _player({"pitching_xp": {"velocity": 24.0}})
	TrainingGrowth.calc(p, _plan("VELO"), _programs(), 1.0)
	assert_float(p["pitching"]["velocity"]).is_equal_approx(50.0, 0.001)
	assert_float(p["pitching_xp"]["velocity"]).is_equal_approx(24.0, 0.001)


# ── 빈 계획 ────────────────────────────────────────────────────────

func test_an_empty_plan_still_recovers() -> void:
	var r: Dictionary = _run(_plan())
	assert_bool(r["pitching_xp"].is_empty()).is_true()
	assert_float(r["fatigue_delta"]).is_equal_approx(-5.0, 0.001)
