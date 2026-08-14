extends GdUnitTestSuite

## 부상 — 발생·회복·후유증·소식. B-3.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _p(over: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"fatigue": 0.0, "condition": 100.0, "age": 25,
		"player_type": "pitcher", "training_intensity": 0.0,
		"consecutive_high_fatigue_weeks": 0, "consecutive_low_morale_weeks": 0,
		"has_prior_injury_same_area": false, "prior_steroid_used": false,
		"injury_prevention": 1.0, "recovery_boost": 1.0,
		"has_injury": false, "injury_type": "", "recovery_weeks_left": 0}
	d.merge(over, true)
	return d


## 같은 입력으로 여러 번 굴려 발생 비율을 잰다
func _occurrence_rate(p: Dictionary, runs: int = 400) -> float:
	var hit: int = 0
	for i in runs:
		if bool(Injury.calc(p, _rng(i))["just_occurred"]):
			hit += 1
	return float(hit) / float(runs)


# ── 종류 표 ───────────────────────────────────────────────────

## ⚠ **ID를 화면에 그대로 보여주지 않는다.** 02는 리포트 한 곳만 라벨 층을
## 안 거쳐서 `SHOULDER_INFLAM`이 그대로 떴다
func test_every_injury_has_a_name_and_a_grade() -> void:
	var grades: Dictionary = {}
	for id in Injury.types():
		assert_str(Injury.label_of(String(id))).override_failure_message(
			"%s에 이름이 없다" % id).is_not_equal(String(id))
		var sev: String = Injury.severity_of(String(id))
		assert_array(Injury.rules()["severity_order"]).contains([sev])
		grades[sev] = true
		var w: Array = Injury.type_of(String(id))["weeks"]
		assert_int(int(w[0])).is_greater(0)
		assert_int(int(w[1])).is_greater_equal(int(w[0]))
	assert_int(Injury.types().size()).is_equal(18)
	assert_int(grades.size()).override_failure_message(
		"등급이 네 단계가 아니다").is_equal(4)


## 모르는 부상은 ID를 돌려준다 — 지어내지 않는다
func test_an_unknown_injury_falls_back_to_its_id() -> void:
	assert_str(Injury.label_of("NOPE")).is_equal("NOPE")
	assert_str(Injury.severity_of("NOPE")).is_equal("light")


## 무거울수록 오래 쉰다 — 등급이 회복 기간과 어긋나면 등급이 뜻을 잃는다
func test_a_heavier_injury_costs_more_weeks() -> void:
	var worst: Dictionary = {}
	for id in Injury.types():
		var sev: String = Injury.severity_of(String(id))
		var lo: int = int(Injury.type_of(String(id))["weeks"][0])
		worst[sev] = mini(int(worst.get(sev, 999)), lo)
	assert_int(int(worst["light"])).is_less(int(worst["moderate"]))
	assert_int(int(worst["moderate"])).is_less(int(worst["severe"]))
	assert_int(int(worst["severe"])).is_less(int(worst["surgery"]))


## 수술은 한 시즌을 통째로 날린다 — 그게 제일 무거운 등급인 이유다
func test_surgery_costs_a_whole_season() -> void:
	for id in Injury.types():
		if Injury.severity_of(String(id)) != "surgery":
			continue
		assert_int(int(Injury.type_of(String(id))["weeks"][0])) \
			.override_failure_message("%s가 한 시즌(30주)도 안 걸린다" % id) \
			.is_greater_equal(30)


func test_the_effect_multiplier_falls_with_the_grade() -> void:
	assert_float(Injury.eff_mod_of("light")).is_greater(
		Injury.eff_mod_of("moderate"))
	assert_float(Injury.eff_mod_of("moderate")).is_greater(
		Injury.eff_mod_of("severe"))
	assert_float(Injury.eff_mod_of("surgery")).override_failure_message(
		"수술인데 뛸 수 있다").is_equal(0.0)
	# 안 다친 사람은 배수가 없다
	assert_float(Injury.eff_mod_of("")).is_equal(1.0)


func test_the_grades_are_ranked() -> void:
	assert_int(Injury.severity_rank("light")).is_less(
		Injury.severity_rank("surgery"))


func test_the_recovery_stays_in_its_range() -> void:
	for id in Injury.types():
		var w: Array = Injury.type_of(String(id))["weeks"]
		for i in 20:
			assert_int(Injury.recovery_weeks(String(id), _rng(i))) \
				.is_between(int(w[0]), int(w[1]))


## 같은 부상이라도 사람마다 다르게 걸린다 — 늘 같으면 복귀 시점을 다 안다
func test_the_recovery_is_not_always_the_same() -> void:
	var seen: Dictionary = {}
	for i in 40:
		seen[Injury.recovery_weeks("ELBOW_INFLAM", _rng(i))] = true
	assert_int(seen.size()).override_failure_message(
		"팔꿈치 염증 회복이 %d가지뿐이다 — 늘 같은 주다" % seen.size()) \
		.is_greater(1)


# ── 어느 부상인가 ─────────────────────────────────────────────

## ⚠ **투수와 야수가 다치는 곳이 다르다.** 하나로 두면 야수가 UCL 파열로
## 시즌을 날린다
func test_a_pitcher_and_a_batter_break_differently() -> void:
	var pit: Dictionary = {}
	var bat: Dictionary = {}
	for i in 200:
		pit[Injury.pick_type("light", true, 25, _rng(i))] = true
		bat[Injury.pick_type("light", false, 25, _rng(i))] = true
	assert_array(pit.keys()).contains(["ARM_FATIGUE"])
	assert_array(bat.keys()).override_failure_message(
		"야수가 팔 피로감으로 빠졌다").not_contains(["ARM_FATIGUE"])
	assert_array(bat.keys()).contains(["ANKLE_SPRAIN_L"])


## 뽑힌 부상은 그 등급이다 — 아니면 등급 판정이 뜻을 잃는다
func test_the_pick_matches_the_tier() -> void:
	for tier in ["light", "moderate", "severe", "surgery"]:
		for pitcher in [true, false]:
			for i in 40:
				var t: String = Injury.pick_type(tier, pitcher, 25, _rng(i))
				assert_str(Injury.severity_of(t)).override_failure_message(
					"%s 등급에서 %s(%s)가 나왔다" % [tier, t, Injury.severity_of(t)]) \
					.is_equal(tier)


## 32세 이상 투수는 팔꿈치보다 어깨가 먼저 온다
func test_an_older_pitcher_hurts_the_shoulder_first() -> void:
	var young: int = 0
	var old: int = 0
	for i in 300:
		if Injury.pick_type("moderate", true, 25, _rng(i)) == "SHOULDER_INFLAM":
			young += 1
		if Injury.pick_type("moderate", true, 34, _rng(i)) == "SHOULDER_INFLAM":
			old += 1
	assert_int(old).override_failure_message(
		"나이 든 투수(%d)가 젊은 투수(%d)보다 어깨를 덜 다친다" % [old, young]) \
		.is_greater(young)


# ── 발생 확률 ─────────────────────────────────────────────────

## ⚠ **80 미만은 0이다.** 그게 관리의 경계선이고, 화면이 그 숫자를 보여준다
func test_below_the_threshold_nothing_happens() -> void:
	assert_float(Injury.fatigue_chance(79.9)).is_equal(0.0)
	assert_float(Injury.fatigue_chance(80.0)).is_greater(0.0)
	assert_float(Injury.trigger_chance(_p({"fatigue": 70.0}))).is_equal(0.0)


## 피로가 높을수록 위험하다 — 단조여야 관리가 뜻을 갖는다
func test_the_risk_climbs_with_fatigue() -> void:
	var last: float = -1.0
	for f in [80.0, 85.0, 90.0, 95.0]:
		var c: float = Injury.fatigue_chance(f)
		assert_float(c).override_failure_message(
			"피로 %.0f에서 위험이 안 올랐다" % f).is_greater(last)
		last = c


## 훈련 무리는 피로와 다른 축이다 — 컨디션이 낮은데 고강도로 민 것
func test_overtraining_is_its_own_axis() -> void:
	var rested: Dictionary = _p({"fatigue": 0.0, "condition": 50.0,
		"training_intensity": 0.9})
	assert_float(Injury.trigger_chance(rested)).override_failure_message(
		"피로가 0인데도 훈련 무리가 안 걸린다").is_greater(0.0)
	# 컨디션이 멀쩡하면 고강도라도 무리가 아니다
	assert_float(Injury.trigger_chance(_p({"condition": 100.0,
		"training_intensity": 0.9}))).is_equal(0.0)
	# 강도가 낮으면 컨디션이 낮아도 무리가 아니다
	assert_float(Injury.trigger_chance(_p({"condition": 50.0,
		"training_intensity": 0.3}))).is_equal(0.0)


## 컨디션이 더 낮고 피로까지 있으면 한 겹 더 얹힌다
func test_deep_overtraining_costs_more() -> void:
	var mild: float = Injury.trigger_chance(_p({"condition": 63.0,
		"training_intensity": 0.9, "fatigue": 0.0}))
	var deep: float = Injury.trigger_chance(_p({"condition": 55.0,
		"training_intensity": 0.9, "fatigue": 75.0}))
	assert_float(deep).is_greater(mild)


## 같은 곳을 또 다치면 더 잘 다친다 · 약물 이력도 마찬가지다
func test_a_history_makes_it_worse() -> void:
	var base: float = Injury.trigger_chance(_p({"fatigue": 85.0}))
	assert_float(Injury.trigger_chance(_p({"fatigue": 85.0,
		"has_prior_injury_same_area": true}))).is_greater(base)
	assert_float(Injury.trigger_chance(_p({"fatigue": 85.0,
		"prior_steroid_used": true}))).is_greater(base)


func test_age_makes_it_worse() -> void:
	var young: float = Injury.trigger_chance(_p({"fatigue": 85.0, "age": 25}))
	var mid: float = Injury.trigger_chance(_p({"fatigue": 85.0, "age": 33}))
	var old: float = Injury.trigger_chance(_p({"fatigue": 85.0, "age": 36}))
	assert_float(mid).is_greater(young)
	assert_float(old).is_greater(mid)


## ⚠ **관리 잘하는 코치진이면 덜 다친다 — 나눈다.** 곱하면 정확히 반대다
func test_good_care_lowers_the_risk() -> void:
	var base: float = Injury.trigger_chance(_p({"fatigue": 90.0}))
	assert_float(Injury.trigger_chance(_p({"fatigue": 90.0,
		"injury_prevention": 1.30}))).override_failure_message(
		"관리가 좋은데 더 다친다 — 방향이 뒤집혔다").is_less(base)
	assert_float(Injury.trigger_chance(_p({"fatigue": 90.0,
		"injury_prevention": 0.80}))).is_greater(base)


## 관리 보정 폭이 갇힌다 — 코치 하나가 부상을 없애면 안 된다
func test_care_is_capped() -> void:
	assert_float(Injury.trigger_chance(_p({"fatigue": 90.0,
		"injury_prevention": 99.0}))).is_equal(
		Injury.trigger_chance(_p({"fatigue": 90.0, "injury_prevention": 1.30})))


## 확률에 천장이 있다 — 100%면 관리가 무의미해진다
func test_the_risk_has_a_ceiling() -> void:
	var worst: Dictionary = _p({"fatigue": 99.0, "condition": 30.0,
		"training_intensity": 1.0, "age": 40,
		"has_prior_injury_same_area": true, "prior_steroid_used": true,
		"injury_prevention": 0.80})
	assert_float(Injury.trigger_chance(worst)).is_equal(
		float(Injury.rules()["protagonist"]["chance_cap"]))


# ── 유예 주 ───────────────────────────────────────────────────

## ⚠ **임계를 넘은 첫 주는 경고만 낸다.** 아무 예고 없이 시즌이 끝나면
## "관리 실패"가 아니라 "재수 없음"이 된다
func test_the_first_week_over_the_line_only_warns() -> void:
	var p: Dictionary = _p({"fatigue": 95.0,
		"consecutive_high_fatigue_weeks": 0})
	assert_float(_occurrence_rate(p)).override_failure_message(
		"유예 주인데 피로로 다쳤다").is_equal(0.0)

	var out: Dictionary = Injury.calc(p, _rng(1))
	assert_bool(out["warning"].is_empty()).override_failure_message(
		"유예 주인데 경고가 없다").is_false()
	assert_float(float(out["warning"]["risk"])).is_greater(0.0)
	assert_int(int(out["consecutive_high_fatigue_weeks"])).is_equal(1)


## 두 주째는 판정한다 — 유예가 영영이면 경고가 뜻을 잃는다
func test_the_second_week_is_judged() -> void:
	assert_float(_occurrence_rate(_p({"fatigue": 95.0,
		"consecutive_high_fatigue_weeks": 1}))).override_failure_message(
		"두 주째인데도 안 다친다 — 유예가 안 끝났다").is_greater(0.3)


## ⚠ **훈련 무리는 유예에서 안 빠진다.** "쉬라고 경고했는데 고강도를
## 밀어붙였다"가 면죄부가 되면 안 된다
func test_the_grace_week_does_not_forgive_overtraining() -> void:
	var p: Dictionary = _p({"fatigue": 95.0, "condition": 50.0,
		"training_intensity": 0.9, "consecutive_high_fatigue_weeks": 0})
	assert_float(Injury.trigger_chance(p, true)).override_failure_message(
		"유예 주라고 훈련 무리까지 봐줬다").is_greater(0.0)
	assert_float(_occurrence_rate(p)).is_greater(0.0)


## 경고의 위험도는 **다음 주도 이대로 갈 때의 실제 확률**이다
func test_the_warning_says_the_real_number() -> void:
	var p: Dictionary = _p({"fatigue": 90.0, "age": 36,
		"consecutive_high_fatigue_weeks": 0})
	var out: Dictionary = Injury.calc(p, _rng(1))
	assert_float(float(out["warning"]["risk"])).override_failure_message(
		"경고 숫자가 다음 주 실제 확률과 다르다").is_equal_approx(
		Injury.trigger_chance(p, false), 0.001)


## 피로가 내려가면 연속 주차가 풀린다
func test_resting_clears_the_streak() -> void:
	var out: Dictionary = Injury.calc(_p({"fatigue": 40.0,
		"consecutive_high_fatigue_weeks": 3}), _rng(1))
	assert_int(int(out["consecutive_high_fatigue_weeks"])).is_equal(0)
	assert_bool(out["warning"].is_empty()).is_true()


## 다치면 연속 주차를 0으로 — 안 그러면 복귀하자마자 또 걸린다
func test_getting_hurt_resets_the_streak() -> void:
	for i in 200:
		var out: Dictionary = Injury.calc(_p({"fatigue": 99.0,
			"consecutive_high_fatigue_weeks": 5}), _rng(i))
		if bool(out["just_occurred"]):
			assert_int(int(out["consecutive_high_fatigue_weeks"])).is_equal(0)
			return
	assert_bool(false).override_failure_message(
		"200번 굴려도 안 다쳤다 — 확률이 죽었다").is_true()


# ── 무엇을 다치나 ─────────────────────────────────────────────

## 피로가 높을수록 무거운 부상이 나온다
func test_more_fatigue_means_a_heavier_injury() -> void:
	var mild: int = 0
	var heavy: int = 0
	for i in 300:
		if Injury.tier_for(82.0, 25, _rng(i).randf()) in ["severe", "surgery"]:
			mild += 1
		if Injury.tier_for(95.0, 25, _rng(i).randf()) in ["severe", "surgery"]:
			heavy += 1
	assert_int(heavy).override_failure_message(
		"피로 95(%d)가 82(%d)보다 무거운 부상을 안 낸다" % [heavy, mild]) \
		.is_greater(mild)


## 80~85 구간에는 수술이 없다 — 관리가 조금 늦은 것으로 커리어가 끝나면 안 된다
func test_a_small_slip_does_not_end_a_career() -> void:
	for i in 300:
		assert_str(Injury.tier_for(82.0, 40, _rng(i).randf())) \
			.override_failure_message("피로 82에서 수술이 나왔다") \
			.is_not_equal("surgery")


## ⚠ **85~90 구간에는 수술이 없다.** 90을 넘어야 커리어가 걸린다 —
## 두 구간이 같으면 85와 90을 가른 뜻이 없다
func test_the_eighty_five_band_stops_short_of_surgery() -> void:
	for age in [25, 40]:
		for i in 400:
			assert_str(Injury.tier_for(87.0, age, _rng(i).randf())) \
				.override_failure_message("피로 87(%d세)에서 수술이 나왔다" % age) \
				.is_not_equal("surgery")
	# 90을 넘으면 나온다
	var surgeries: int = 0
	for i in 400:
		if Injury.tier_for(92.0, 40, _rng(i).randf()) == "surgery":
			surgeries += 1
	assert_int(surgeries).override_failure_message(
		"피로 92인데 수술이 한 번도 안 나온다").is_greater(0)


func test_age_pushes_the_tier_up() -> void:
	var young: int = 0
	var old: int = 0
	for i in 400:
		if Injury.tier_for(95.0, 25, _rng(i).randf()) == "surgery":
			young += 1
		if Injury.tier_for(95.0, 36, _rng(i).randf()) == "surgery":
			old += 1
	assert_int(old).is_greater(young)


# ── 입스 ──────────────────────────────────────────────────────

## ⚠ **심리 축은 피로와 독립이다.** 피로가 0이어도 사기가 오래 바닥이면 온다
func test_yips_comes_from_the_mind_not_the_arm() -> void:
	assert_float(Injury.yips_chance(4)).is_equal(0.0)
	assert_float(Injury.yips_chance(5)).is_greater(0.0)
	assert_float(Injury.yips_chance(8)).is_greater(Injury.yips_chance(5))

	var hit: int = 0
	for i in 400:
		var out: Dictionary = Injury.calc(_p({"fatigue": 0.0,
			"consecutive_low_morale_weeks": 8}), _rng(i))
		if bool(out["just_occurred"]) and String(out["injury"]["type"]) == "YIPS":
			hit += 1
			assert_str(String(out["source"])).is_equal("psychological")
	assert_int(hit).override_failure_message(
		"사기가 여덟 주 바닥인데 입스가 한 번도 안 왔다").is_greater(0)


## 야수는 입스에 안 걸린다 — 02가 투수 한정으로 뒀다
func test_a_batter_does_not_get_the_yips() -> void:
	for i in 300:
		var out: Dictionary = Injury.calc(_p({"player_type": "batter",
			"consecutive_low_morale_weeks": 10}), _rng(i))
		assert_bool(bool(out["just_occurred"])).override_failure_message(
			"야수가 입스에 걸렸다").is_false()


# ── 회복 ──────────────────────────────────────────────────────

func test_the_weeks_tick_down() -> void:
	var out: Dictionary = Injury.calc(_p({"has_injury": true,
		"injury_type": "ELBOW_INFLAM", "recovery_weeks_left": 5}), _rng(1))
	assert_int(int(out["injury"]["weeks_left"])).is_equal(4)
	assert_bool(bool(out["just_healed"])).is_false()
	assert_float(float(out["eff_mod"])).is_equal(Injury.eff_mod_of("moderate"))


func test_the_last_week_heals() -> void:
	var out: Dictionary = Injury.calc(_p({"has_injury": true,
		"injury_type": "ELBOW_INFLAM", "recovery_weeks_left": 1}), _rng(1))
	assert_bool(bool(out["just_healed"])).is_true()
	assert_bool(out["injury"] == null).is_true()
	assert_float(float(out["eff_mod"])).override_failure_message(
		"나았는데 능력이 아직 깎여 있다").is_equal(1.0)


## 다친 동안에는 새 부상 판정을 안 한다 — 겹치면 회복이 영영 안 끝난다
func test_you_do_not_get_hurt_while_hurt() -> void:
	for i in 200:
		var out: Dictionary = Injury.calc(_p({"fatigue": 99.0,
			"consecutive_high_fatigue_weeks": 5, "has_injury": true,
			"injury_type": "UCL_FULL", "recovery_weeks_left": 40}), _rng(i))
		assert_bool(bool(out["just_occurred"])).is_false()


## ⚠ **시설 보정은 발생 시점에만.** 틱다운에도 걸면 두 번 깎인다
func test_facilities_shorten_the_recovery_once() -> void:
	assert_int(Injury.boosted_weeks(20, 1.30)).is_less(20)
	assert_int(Injury.boosted_weeks(20, 0.80)).is_greater(20)
	# 최소 1주는 남긴다 — 0이면 다치자마자 나은 것이 된다
	assert_int(Injury.boosted_weeks(1, 1.30)).is_greater_equal(1)
	# 폭이 갇힌다
	assert_int(Injury.boosted_weeks(20, 99.0)).is_equal(
		Injury.boosted_weeks(20, 1.30))


# ── NPC ───────────────────────────────────────────────────────

## ⚠ **NPC는 피로가 아니라 연투를 본다.** 몇천 명의 피로를 들고 있지 않다
func test_consecutive_appearances_wear_an_npc_down() -> void:
	var rested: float = Injury.npc_chance("SP", 0, 25, false)
	var tired: float = Injury.npc_chance("SP", 3, 25, false)
	var worn: float = Injury.npc_chance("SP", 5, 25, false)
	assert_float(tired).is_greater(rested)
	assert_float(worn).is_greater(tired)


## 보직마다 문턱이 다르다 — 선발은 5연투가 무리고 불펜은 7연투가 무리다
func test_each_role_has_its_own_limit() -> void:
	assert_float(Injury.npc_chance("SP", 5, 25, false)).is_greater(
		Injury.npc_chance("SP", 4, 25, false))
	assert_float(Injury.npc_chance("RP", 4, 25, false)).is_greater(
		Injury.npc_chance("RP", 3, 25, false))
	# 선발이 기본적으로 더 위험하다
	assert_float(Injury.npc_chance("SP", 0, 25, false)).is_greater(
		Injury.npc_chance("batter", 0, 25, false))


func test_an_npc_history_and_age_make_it_worse() -> void:
	var base: float = Injury.npc_chance("SP", 0, 25, false)
	assert_float(Injury.npc_chance("SP", 0, 25, true)).is_greater(base)
	assert_float(Injury.npc_chance("SP", 0, 33, false)).is_greater(base)
	assert_float(Injury.npc_chance("SP", 0, 36, false)).is_greater(
		Injury.npc_chance("SP", 0, 33, false))


## ⚠ **참고 뛰면 크게 다친다.** 중등도로 강행하는 것이 제일 위험하다
func test_playing_through_is_dangerous() -> void:
	var base: float = Injury.npc_chance("SP", 0, 25, false)
	var light: float = Injury.npc_chance("SP", 0, 25, false, "light")
	var moderate: float = Injury.npc_chance("SP", 0, 25, false, "moderate")
	assert_float(light).is_greater(base)
	assert_float(moderate).override_failure_message(
		"중등도로 강행하는 게 경미보다 안전하다").is_greater(light)


## 최악을 다 겹쳐도 확정은 아니다 — 절반쯤이다
func test_even_the_worst_npc_case_is_not_certain() -> void:
	assert_float(Injury.npc_chance("SP", 99, 40, true, "moderate")) \
		.override_failure_message("NPC 최악의 경우가 확정 부상이 됐다") \
		.is_between(0.4, 0.6)


## 부상 관리가 낮은 팀만 참고 뛰게 한다. 중등도의 문턱이 더 낮다
func test_only_a_careless_team_plays_through() -> void:
	assert_bool(Injury.plays_through("light", 50.0)).is_true()
	assert_bool(Injury.plays_through("light", 80.0)).is_false()
	assert_bool(Injury.plays_through("moderate", 50.0)).override_failure_message(
		"중등도인데 관리 50짜리 팀이 강행시킨다").is_false()
	assert_bool(Injury.plays_through("moderate", 30.0)).is_true()
	# 중증·수술은 강행이 없다
	assert_bool(Injury.plays_through("surgery", 0.0)).is_false()
	assert_bool(Injury.plays_through("severe", 0.0)).is_false()


func test_the_npc_batch_only_returns_the_hurt() -> void:
	var players: Array = []
	for i in 200:
		players.append({"player_id": "P%03d" % i, "role": "SP", "age": 25,
			"consecutive_app": 5, "has_prior_injury": false})
	var out: Array = Injury.calc_npc(players, _rng(7))
	assert_int(out.size()).override_failure_message(
		"200명 중 아무도 안 다쳤다 — 확률이 죽었다").is_greater(0)
	assert_int(out.size()).override_failure_message(
		"200명이 다 다쳤다").is_less(60)
	var grades: Dictionary = {}
	for o in out:
		assert_str(String(o["severity"])).is_equal(
			Injury.severity_of(String(o["injury_type"])))
		assert_int(int(o["recovery_weeks"])).is_greater(0)
		grades[String(o["severity"])] = true
	# 등급이 한 가지뿐이면 등급 판정이 죽은 것이다
	assert_int(grades.size()).override_failure_message(
		"다친 %d명이 전부 %s다" % [out.size(), grades.keys()]).is_greater(1)


## 연투가 쌓인 쪽이 더 많이 다친다 — 배선까지 이어졌나
func test_the_worn_out_squad_gets_hurt_more() -> void:
	var rested: Array = []
	var worn: Array = []
	for i in 300:
		rested.append({"player_id": "R%03d" % i, "role": "SP", "age": 25,
			"consecutive_app": 0, "has_prior_injury": false})
		worn.append({"player_id": "W%03d" % i, "role": "SP", "age": 25,
			"consecutive_app": 6, "has_prior_injury": false})
	assert_int(Injury.calc_npc(worn, _rng(3)).size()).override_failure_message(
		"연투가 쌓여도 더 안 다친다").is_greater(
		Injury.calc_npc(rested, _rng(3)).size())


## 수술은 드물다 — 흔하면 리그가 몇 년 만에 빈다
func test_surgery_is_rare() -> void:
	var counts: Dictionary = {}
	for i in 2000:
		var t: String = Injury.npc_tier(_rng(i).randf())
		counts[t] = int(counts.get(t, 0)) + 1
	assert_int(int(counts.get("surgery", 0))).is_less(
		int(counts.get("light", 0)) / 5)
	assert_int(int(counts.get("light", 0))).override_failure_message(
		"가벼운 부상이 과반이 아니다").is_greater(1000)


## 완치 뒤 영구 손실 — 무거운 수술일수록 크다
func test_a_surgery_leaves_a_mark_on_an_npc() -> void:
	assert_float(Injury.npc_ovr_penalty("ROTATOR_FULL")).is_less(
		Injury.npc_ovr_penalty("UCL_FULL"))
	assert_float(Injury.npc_ovr_penalty("UCL_FULL")).is_less(0.0)
	# 가벼운 부상은 흔적을 안 남긴다
	assert_float(Injury.npc_ovr_penalty("BLISTER")).is_equal(0.0)


# ── 후유증 ────────────────────────────────────────────────────

func test_a_heavy_injury_leaves_a_permanent_mark() -> void:
	assert_dict(Injury.permanent_penalty("UCL_FULL")).is_not_empty()
	assert_float(float(Injury.permanent_penalty("UCL_FULL")["velocity"])) \
		.is_less(0.0)
	# 가벼운 부상은 흔적을 안 남긴다
	assert_dict(Injury.permanent_penalty("BLISTER")).is_empty()


## ⚠ **치료 선택이 후유증을 가른다.** 혼자 버티면 제일 크게 남는다
func test_the_treatment_choice_changes_what_is_left() -> void:
	var alone: Dictionary = Injury.permanent_penalty("YIPS", "self")
	var helped: Dictionary = Injury.permanent_penalty("YIPS", "counseling")
	var default: Dictionary = Injury.permanent_penalty("YIPS")
	assert_float(float(alone["control"])).override_failure_message(
		"혼자 버틴 쪽이 상담받은 쪽보다 덜 남는다").is_less(float(helped["control"]))
	assert_float(float(default["control"])).is_less(float(helped["control"]))
	assert_float(float(default["control"])).is_greater(float(alone["control"]))


## 스테로이드를 쓰면 어깨 염증이 흔적을 남긴다 — 안 쓰면 안 남는다
func test_steroids_leave_a_mark() -> void:
	assert_dict(Injury.permanent_penalty("SHOULDER_INFLAM", "steroid")) \
		.is_not_empty()
	assert_dict(Injury.permanent_penalty("SHOULDER_INFLAM", "rest")).is_empty()
	assert_dict(Injury.permanent_penalty("SHOULDER_INFLAM")).is_empty()


# ── 소식 ──────────────────────────────────────────────────────

func _event(over: Dictionary = {}) -> Dictionary:
	var e: Dictionary = {"player_id": "P1", "injury_type": "ELBOW_INFLAM",
		"severity": "moderate", "weeks": 5, "week": 10, "retired": false}
	e.merge(over, true)
	return e


func test_the_news_comes_monthly() -> void:
	assert_int(Injury.news_period()).is_equal(4)
	assert_bool(Injury.is_news_week(4)).is_true()
	assert_bool(Injury.is_news_week(8)).is_true()
	assert_bool(Injury.is_news_week(5)).is_false()
	assert_bool(Injury.is_news_week(0)).override_failure_message(
		"0주에 소식이 왔다").is_false()


## ⚠ **수술이 시즌 아웃보다 위다.** 이번 시즌을 날리는 데다 능력치가
## 영구히 깎인다
func test_surgery_outranks_a_season_out() -> void:
	var order: Array = Injury.class_order()
	assert_int(order.find("retired")).is_less(order.find("surgery"))
	assert_int(order.find("surgery")).override_failure_message(
		"시즌 아웃이 수술보다 무겁게 매겨졌다").is_less(order.find("season_out"))
	assert_int(order.find("season_out")).is_less(order.find("long"))
	assert_int(order.find("long")).is_less(order.find("short"))


func test_the_class_reads_the_event() -> void:
	assert_str(Injury.classify(_event({"retired": true}), 20)).is_equal("retired")
	assert_str(Injury.classify(_event({"severity": "surgery", "weeks": 60}), 20)) \
		.is_equal("surgery")
	assert_str(Injury.classify(_event({"weeks": 20}), 10)).is_equal("season_out")
	assert_str(Injury.classify(_event({"weeks": 12}), 30)).is_equal("long")
	assert_str(Injury.classify(_event({"weeks": 3}), 30)).is_equal("short")


## ⚠ **시즌 남은 주를 모르면 시즌 아웃 판정을 안 한다.** 모르는 걸 안다고
## 하지 않는다
func test_not_knowing_is_not_guessing() -> void:
	assert_str(Injury.classify(_event({"weeks": 20}), 0)).override_failure_message(
		"남은 주를 모르는데 시즌 아웃이라고 했다").is_equal("long")


## 은퇴가 수술을 이긴다 — 제일 심한 결말이다
func test_retirement_wins_over_surgery() -> void:
	assert_str(Injury.classify(_event({"retired": true, "severity": "surgery"}),
		20)).is_equal("retired")


## ⚠ **한 달에 두 번 다칠 수 있다.** 그때는 더 심한 쪽이 결론이다 —
## 부상은 경과가 아니라 상태다
func test_the_worse_injury_is_the_conclusion() -> void:
	var rows: Array = Injury.worst_by_person([
		_event({"player_id": "P1", "weeks": 3, "week": 10}),
		_event({"player_id": "P1", "severity": "surgery", "weeks": 60, "week": 12}),
	], 20)
	assert_int(rows.size()).override_failure_message(
		"한 사람을 두 번 셌다").is_equal(1)
	assert_str(String(rows[0]["class"])).override_failure_message(
		"나중에 수술했는데 단기 부상으로 남았다").is_equal("surgery")


## 순서를 뒤집어도 결론은 같다
func test_the_order_does_not_change_the_conclusion() -> void:
	var rows: Array = Injury.worst_by_person([
		_event({"player_id": "P1", "severity": "surgery", "weeks": 60, "week": 8}),
		_event({"player_id": "P1", "weeks": 3, "week": 12}),
	], 20)
	assert_str(String(rows[0]["class"])).is_equal("surgery")


## 같은 등급이면 나중 것 — 더 최근 상태다
func test_the_same_grade_takes_the_later_one() -> void:
	var rows: Array = Injury.worst_by_person([
		_event({"player_id": "P1", "weeks": 3, "week": 8}),
		_event({"player_id": "P1", "weeks": 3, "week": 12}),
	], 30)
	assert_int(int(rows[0]["week"])).is_equal(12)


func test_the_counts_add_up() -> void:
	var rows: Array = Injury.worst_by_person([
		_event({"player_id": "P1", "severity": "surgery", "weeks": 60}),
		_event({"player_id": "P2", "weeks": 12}),
		_event({"player_id": "P3", "weeks": 3}),
		_event({"player_id": "P4", "weeks": 3}),
	], 30)
	var counts: Dictionary = Injury.count_by_class(rows)
	assert_int(int(counts["surgery"])).is_equal(1)
	assert_int(int(counts["long"])).is_equal(1)
	assert_int(int(counts["short"])).is_equal(2)
	assert_int(int(counts["retired"])).is_equal(0)


## ⚠ **심한 등급만 한 줄에 쓴다.** 단기 200건을 앞세우면 수술 3건이 묻힌다
func test_the_headline_shows_what_matters() -> void:
	var many_short: Dictionary = {"retired": 0, "surgery": 3, "season_out": 0,
		"long": 0, "short": 200}
	var line: String = Injury.preview_line(many_short)
	assert_str(line).contains("수술 3")
	assert_str(line).override_failure_message(
		"단기 200건이 수술 3건을 덮었다").not_contains("200")

	assert_str(Injury.preview_line({"retired": 0, "surgery": 0,
		"season_out": 0, "long": 0, "short": 5})).contains("5건")
	assert_str(Injury.preview_line({"retired": 0, "surgery": 0,
		"season_out": 0, "long": 0, "short": 0})).is_equal("새 부상이 없었다")


## 은퇴가 맨 앞에 온다
func test_a_retirement_leads_the_headline() -> void:
	assert_str(Injury.preview_line({"retired": 1, "surgery": 2,
		"season_out": 0, "long": 0, "short": 0})).starts_with("부상 은퇴 1")
