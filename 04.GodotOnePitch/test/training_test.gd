extends GdUnitTestSuite

## 훈련 계획 — 피로·컨디션 변화와 미리보기. M4-2.
##
## 원본: `packages/engine-native/src/growth_engine.rs`의 `plan_load` · `preview_training`
##
## ⚠ **정본이 하나다.** 실제 계산과 훈련 화면 미리보기가 같은 함수를 쓴다.
## 원본에서 화면이 자기 식을 갖고 있었고 — 슬롯 배수도 구간 승수도 몰라서 —
## **화면은 "피로 +7"이라 하고 엔진은 −4.25를 적용했다. 부호가 반대였다.**
##
## ⚠ 여기 `fatigue`는 **100 = 탈진**이다 (주인공 축).


func _program(id: String, fatigue_cost: float, condition_cost: float = 0.0) -> Dictionary:
	return {"id": id, "fatigue_cost": fatigue_cost, "condition_cost": condition_cost}


func _programs() -> Array:
	return [
		_program("HARD", 10.0, 2.0),
		_program("LIGHT", 4.0, 1.0),
		_program("REST", -8.0, -3.0),
	]


func _plan(a: String = "", b: String = "", c: String = "") -> Dictionary:
	return {"primary": a, "secondary": b, "secondary2": c}


# ── 슬롯 배수 ──────────────────────────────────────────────────────

func test_the_primary_slot_costs_the_most() -> void:
	# 주 1.0 · 보조 0.5 — 주 슬롯이 온전한 부하를 진다
	var main: float = Training.plan_load(0.0, _plan("HARD"), _programs())["fatigue_delta"]
	var sub: float = Training.plan_load(0.0, _plan("", "HARD"), _programs())["fatigue_delta"]
	# 자동 회복 −5가 둘 다 깔려 있다
	assert_float(main).is_equal_approx(5.0, 0.001)    # -5 + 10×1.0
	assert_float(sub).is_equal_approx(0.0, 0.001)     # -5 + 10×0.5


func test_both_secondary_slots_cost_the_same() -> void:
	var b: float = Training.plan_load(0.0, _plan("", "HARD"), _programs())["fatigue_delta"]
	var c: float = Training.plan_load(0.0, _plan("", "", "HARD"), _programs())["fatigue_delta"]
	assert_float(b).is_equal_approx(c, 0.001)


func test_empty_slots_cost_nothing() -> void:
	# 아무것도 안 넣으면 자동 회복만 남는다
	assert_float(Training.plan_load(0.0, _plan(), _programs())["fatigue_delta"]) \
		.is_equal_approx(-5.0, 0.001)


func test_an_unknown_program_is_skipped() -> void:
	# 세이브에 없는 프로그램 id가 들어와도 죽지 않는다
	assert_float(Training.plan_load(0.0, _plan("없는것"), _programs())["fatigue_delta"]) \
		.is_equal_approx(-5.0, 0.001)


# ── 자동 회복 ──────────────────────────────────────────────────────

func test_a_week_of_rest_recovers_on_its_own() -> void:
	# ⚠ 매주 −5가 기본이다. 없으면 훈련을 쉬어도 피로가 안 빠져서
	# 한 번 지치면 영영 못 돌아온다
	assert_float(Training.plan_load(50.0, _plan(), _programs())["fatigue_delta"]) \
		.is_equal_approx(-5.0, 0.001)


func test_condition_recovers_faster_when_fresh() -> void:
	# 지쳤을수록 컨디션이 더디게 돌아온다
	assert_float(Training.plan_load(20.0, _plan(), _programs())["condition_delta"]) \
		.is_equal_approx(5.0, 0.001)
	assert_float(Training.plan_load(70.0, _plan(), _programs())["condition_delta"]) \
		.is_equal_approx(3.0, 0.001)
	assert_float(Training.plan_load(90.0, _plan(), _programs())["condition_delta"]) \
		.is_equal_approx(1.0, 0.001)


# ── 피로 구간 승수 ─────────────────────────────────────────────────

func test_training_while_exhausted_costs_more() -> void:
	# ⚠ 같은 훈련인데 지쳤을 때 더 지친다. 이게 없으면 피로를 무시하고
	# 계속 밀어붙이는 게 언제나 최선이 된다
	var fresh: float = Training.plan_load(10.0, _plan("HARD"), _programs())["fatigue_delta"]
	var worn: float = Training.plan_load(75.0, _plan("HARD"), _programs())["fatigue_delta"]
	var spent: float = Training.plan_load(95.0, _plan("HARD"), _programs())["fatigue_delta"]
	assert_float(fresh).is_equal_approx(5.0, 0.001)    # -5 + 10×1.0×1.0
	assert_float(worn).is_equal_approx(10.0, 0.001)    # -5 + 10×1.0×1.5
	assert_float(spent).is_equal_approx(35.0, 0.001)   # -5 + 10×1.0×4.0


func test_the_zone_multiplier_does_not_apply_to_recovery() -> void:
	# ⚠ **회복 훈련에는 승수를 안 건다.** 걸면 지쳤을 때 회복이 네 배가 되어
	# 벼랑 끝에서 오히려 이득이 된다 — 관리의 뜻이 뒤집힌다
	var fresh: float = Training.plan_load(10.0, _plan("REST"), _programs())["fatigue_delta"]
	var spent: float = Training.plan_load(95.0, _plan("REST"), _programs())["fatigue_delta"]
	assert_float(fresh).is_equal_approx(-13.0, 0.001)   # -5 + (-8)×1.0
	assert_float(spent).is_equal_approx(-13.0, 0.001)   # 같다


func test_condition_cost_ignores_the_zone_multiplier() -> void:
	# 컨디션 소모는 구간 승수와 무관하다 — 피로만 볼록하게 뛴다
	var fresh: float = Training.plan_load(10.0, _plan("HARD"), _programs())["condition_delta"]
	var spent: float = Training.plan_load(95.0, _plan("HARD"), _programs())["condition_delta"]
	assert_float(fresh).is_equal_approx(3.0, 0.001)    # 5 - 2×1.0
	assert_float(spent).is_equal_approx(-1.0, 0.001)   # 1 - 2×1.0


# ── 세 슬롯 합 ─────────────────────────────────────────────────────

func test_all_three_slots_add_up() -> void:
	var out: Dictionary = Training.plan_load(0.0, _plan("HARD", "LIGHT", "LIGHT"), _programs())
	# -5 + 10×1.0 + 4×0.5 + 4×0.5 = 9
	assert_float(out["fatigue_delta"]).is_equal_approx(9.0, 0.001)
	# 5 - 2×1.0 - 1×0.5 - 1×0.5 = 2
	assert_float(out["condition_delta"]).is_equal_approx(2.0, 0.001)


func test_mixing_work_and_rest() -> void:
	# 주 슬롯에 훈련, 보조에 회복 — 회복만 승수를 안 탄다
	var out: Dictionary = Training.plan_load(95.0, _plan("HARD", "REST"), _programs())
	# -5 + 10×1.0×4.0 + (-8)×0.5 = 31
	assert_float(out["fatigue_delta"]).is_equal_approx(31.0, 0.001)


# ── 미리보기 ───────────────────────────────────────────────────────

func test_the_preview_uses_the_same_numbers() -> void:
	# ⚠ **화면이 다시 계산하면 그게 다섯 번째 정본이 된다.** 원본에서 화면과
	# 엔진의 부호가 반대였다
	var load: Dictionary = Training.plan_load(60.0, _plan("HARD", "LIGHT"), _programs())
	var pre: Dictionary = Training.preview(60.0, 50.0, _plan("HARD", "LIGHT"), _programs())
	assert_float(pre["fatigue_delta"]).is_equal_approx(load["fatigue_delta"], 0.001)
	assert_float(pre["condition_delta"]).is_equal_approx(load["condition_delta"], 0.001)


func test_the_preview_projects_the_result() -> void:
	var pre: Dictionary = Training.preview(60.0, 50.0, _plan("HARD"), _programs())
	# 60 + (-5 + 10×1.0×1.0) = 65
	assert_float(pre["projected_fatigue"]).is_equal_approx(65.0, 0.001)
	# 50 + (3 - 2) = 51
	assert_float(pre["projected_condition"]).is_equal_approx(51.0, 0.001)


func test_the_preview_stays_inside_zero_to_hundred() -> void:
	# 화면에 120이나 −30이 뜨면 안 된다.
	#
	# ⚠ **범위를 실제로 벗어나는 표본을 쓴다.** 안 벗어나는 값으로 보면
	# 자르기를 통째로 빼도 검사가 통과한다
	var high: Dictionary = Training.preview(95.0, 95.0, _plan("HARD", "HARD", "HARD"), _programs())
	assert_float(high["projected_fatigue"]).is_equal_approx(100.0, 0.001)
	var low: Dictionary = Training.preview(2.0, 2.0, _plan("REST", "REST", "REST"), _programs())
	assert_float(low["projected_fatigue"]).is_equal_approx(0.0, 0.001)
	# 컨디션도 마찬가지 — 지친 채로 세 칸 다 훈련하면 음수로 간다
	var drained: Dictionary = Training.preview(95.0, 2.0, _plan("HARD", "HARD", "HARD"), _programs())
	assert_float(drained["projected_condition"]).is_equal_approx(0.0, 0.001)
	var rested: Dictionary = Training.preview(2.0, 98.0, _plan("REST", "REST", "REST"), _programs())
	assert_float(rested["projected_condition"]).is_equal_approx(100.0, 0.001)


func test_the_preview_warns_about_the_next_zone() -> void:
	# ⚠ **다음 주에 더 나빠지는지를 화면이 알려줄 근거다.** 지금 구간만 보면
	# 벼랑 바로 앞에서 아무 경고가 없다
	var pre: Dictionary = Training.preview(65.0, 50.0, _plan("HARD"), _programs())
	assert_float(pre["fatigue_zone_mult"]).is_equal_approx(1.0, 0.001)
	# 65 + 5 = 70 → 다음 주는 1.5배 구간
	assert_float(pre["next_zone_mult"]).is_equal_approx(1.5, 0.001)
