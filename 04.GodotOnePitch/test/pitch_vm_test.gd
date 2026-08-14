extends GdUnitTestSuite

## 투구 선택 — M7-6e2. **이 게임의 핵심 조작.**
##
## ⚠ **주인공이 던질 수 있는 구종만 보여준다.** 전부 보여주면 배우지 않은
## 공을 던지게 되고, 그러면 숙련도를 올릴 이유가 없어진다.


func _me(pitches: Array = []) -> Dictionary:
	return {"id": "ME", "pitches": pitches}


# ── 구종 목록 ─────────────────────────────────────────────────

func test_it_lists_only_what_i_can_throw() -> void:
	var r: Array = PitchVm.repertoire(_me([
		{"id": "fastball", "grade": 4}, {"id": "slider", "grade": 2}]))
	var ids: Array = []
	for x in r:
		ids.append(x["id"])
	assert_array(ids).is_equal(["fastball", "slider"])
	assert_array(ids).not_contains(["knuckleball"])


## ⚠ **숙련도 순으로 준다.** 화면에서 제일 좋은 공을 먼저 보게 된다
func test_the_best_pitch_comes_first() -> void:
	var r: Array = PitchVm.repertoire(_me([
		{"id": "curve", "grade": 1}, {"id": "fastball", "grade": 5},
		{"id": "slider", "grade": 3}]))
	assert_str(r[0]["id"]).is_equal("fastball")
	assert_str(r[2]["id"]).is_equal("curve")


## ⚠ **하나도 없으면 직구를 준다.** 빈 목록이면 던질 수가 없고 화면이
## 버튼 없이 뜬다
func test_no_pitches_still_gives_a_fastball() -> void:
	var r: Array = PitchVm.repertoire(_me([]))
	assert_int(r.size()).is_equal(1)
	assert_str(r[0]["id"]).is_equal("fastball")


## ⚠ **숙련도가 화면에 떠야 한다.** 02는 한때 숙련도가 결과에 안 닿았고,
## 화면엔 "4/5"라고 적혀 있는데 던지면 차이가 없었다
func test_the_grade_comes_along() -> void:
	var r: Array = PitchVm.repertoire(_me([{"id": "slider", "grade": 3}]))
	assert_int(r[0]["grade"]).is_equal(3)


func test_pitch_names_are_in_korean() -> void:
	assert_str(PitchVm.pitch_label("fastball")).is_equal("포심")
	assert_str(PitchVm.pitch_label("changeup")).is_equal("체인지업")
	assert_str(PitchVm.pitch_label("knuckleball")).is_equal("너클볼")


## ⚠ **엔진이 아는 구종에 이름표가 다 있어야 한다.** 하나라도 빠지면
## 그 공을 배운 순간 화면에 영문이 뜬다
func test_every_engine_pitch_has_a_label() -> void:
	for id in Tuning.PITCH_BASE:
		assert_str(PitchVm.pitch_label(id)).override_failure_message(
			"%s에 이름표가 없다" % id).is_not_equal(id)


# ── 고르기 ────────────────────────────────────────────────────

func test_it_starts_with_the_best_pitch() -> void:
	var vm: Dictionary = PitchVm.build(_me([
		{"id": "curve", "grade": 1}, {"id": "fastball", "grade": 5}]))
	assert_str(vm["pitch_type"]).is_equal("fastball")


func test_a_chosen_pitch_is_kept() -> void:
	var vm: Dictionary = PitchVm.build(_me([
		{"id": "fastball", "grade": 5}, {"id": "curve", "grade": 1}]),
		{"pitch_type": "curve"})
	assert_str(vm["pitch_type"]).is_equal("curve")
	assert_str(vm["pitch_label"]).is_equal("커브")


## ⚠ **못 던지는 공을 고른 채로 두면 안 된다.** 이적·성장으로 목록이
## 바뀔 수 있는데, 그때 조용히 배우지 않은 공을 던지게 된다
func test_an_unknown_pitch_falls_back_to_the_first() -> void:
	var vm: Dictionary = PitchVm.build(_me([{"id": "fastball", "grade": 5}]),
		{"pitch_type": "knuckleball"})
	assert_str(vm["pitch_type"]).is_equal("fastball")


# ── 코스 ──────────────────────────────────────────────────────

func test_the_default_zone_is_the_middle() -> void:
	assert_int(PitchVm.build(_me())["zone"]).is_equal(5)


func test_a_chosen_zone_is_kept() -> void:
	var vm: Dictionary = PitchVm.build(_me(), {"zone": 1})
	assert_int(vm["zone"]).is_equal(1)
	assert_str(vm["zone_label"]).is_equal("1번")


## ⚠ **의도적 볼임을 화면이 말해야 한다.** 존 밖을 골라 놓고 왜 스트라이크가
## 안 들어오는지 모르면 안 된다
func test_zone_zero_is_an_intentional_ball() -> void:
	var vm: Dictionary = PitchVm.build(_me(), {"zone": 0})
	assert_bool(vm["is_intentional_ball"]).is_true()
	assert_str(vm["zone_label"]).contains("거르기")


func test_a_strike_zone_pitch_is_not_a_ball() -> void:
	for z in range(1, 10):
		assert_bool(PitchVm.build(_me(), {"zone": z})["is_intentional_ball"]) \
			.override_failure_message("%d번이 볼로 잡혔다" % z).is_false()


# ── 전략·힘 ───────────────────────────────────────────────────

func test_strategies_and_powers_are_offered() -> void:
	var vm: Dictionary = PitchVm.build(_me())
	var s: Array = []
	for x in vm["strategies"]:
		s.append(x["id"])
	assert_array(s).contains(["aggressive", "balanced", "safe"])
	var p: Array = []
	for x in vm["powers"]:
		p.append(x["id"])
	assert_array(p).contains(["low", "normal", "high"])


## ⚠ **엔진이 아는 것만 보여준다.** 없는 전략을 고르면 보너스가 0으로
## 떨어지고, 사용자는 골랐는데 아무 차이가 없다
func test_the_offered_options_match_the_engine() -> void:
	var vm: Dictionary = PitchVm.build(_me())
	for x in vm["strategies"]:
		assert_bool(Tuning.STRATEGY_BONUS.has(x["id"])).override_failure_message(
			"엔진이 모르는 전략: %s" % x["id"]).is_true()
	for x in vm["powers"]:
		assert_bool(Tuning.POWER_BONUS.has(x["id"])).override_failure_message(
			"엔진이 모르는 힘: %s" % x["id"]).is_true()


func test_the_labels_are_in_korean() -> void:
	var vm: Dictionary = PitchVm.build(_me(), {"strategy": "aggressive",
		"power": "high"})
	assert_str(vm["strategy_label"]).is_equal("공격적")
	assert_str(vm["power_label"]).is_equal("전력")


# ── 엔진으로 넘기기 (계약) ────────────────────────────────────

## ⚠ **키 이름이 엔진과 같아야 한다.** 다르면 기본값으로 떨어져서
## **무엇을 골라도 같은 공이 나간다** — 조용히 그렇게 된다
func test_the_decision_uses_the_engine_keys() -> void:
	var vm: Dictionary = PitchVm.build(_me([{"id": "slider", "grade": 3}]),
		{"pitch_type": "slider", "zone": 7, "strategy": "safe", "power": "high"})
	var d: Dictionary = PitchVm.to_decision(vm)
	assert_str(d["pitch_type"]).is_equal("slider")
	assert_int(d["location"]).is_equal(7)
	assert_str(d["strategy"]).is_equal("safe")
	assert_str(d["power"]).is_equal("high")


## ⚠ **고른 것이 실제로 결과를 바꿔야 한다.** 넘기는 모양만 맞고 엔진이
## 안 읽으면 아무것도 안 달라진다 — 그게 02의 "숙련도가 결과에 안 닿던"
## 자리와 같은 형태다
func test_the_choice_changes_the_pitch_quality() -> void:
	var safe: Dictionary = PitchVm.to_decision(PitchVm.build(
		_me([{"id": "fastball", "grade": 3}]),
		{"pitch_type": "fastball", "zone": 5, "strategy": "safe", "power": "low"}))
	var aggr: Dictionary = PitchVm.to_decision(PitchVm.build(
		_me([{"id": "fastball", "grade": 3}]),
		{"pitch_type": "fastball", "zone": 5, "strategy": "aggressive", "power": "high"}))

	var ctx: Dictionary = {
		"pitcher": {"command": 60.0, "velocity": 60.0, "control": 60.0,
			"movement": 60.0},
		"batter": {"contact": 50.0, "eye": 50.0, "discipline": 50.0},
		"stamina": 80.0, "mental": 60.0, "grade": 3,
		"count": {"balls": 0, "strikes": 0}, "score": {"home": 0, "away": 0},
		"weather": "sunny", "park": "neutral"}

	# 같은 씨앗·같은 착탄으로 재야 흔들림이 아니라 고른 게 보인다
	var landing: Vector2 = PitchOutcome.zone_to_target(5)
	var r1 := RandomNumberGenerator.new()
	r1.seed = 7
	var r2 := RandomNumberGenerator.new()
	r2.seed = 7
	var q_safe: float = PitchOutcome.pitch_quality(ctx, safe, landing, r1)
	var q_aggr: float = PitchOutcome.pitch_quality(ctx, aggr, landing, r2)
	assert_float(q_aggr).override_failure_message(
		"공격적·전력이 %.1f, 안전·빼서가 %.1f — 고른 게 결과에 안 닿는다"
		% [q_aggr, q_safe]).is_greater(q_safe)


# ── 숙련도가 결과에 닿는가 ────────────────────────────────────

## ⚠ **02가 겪은 결함이다.** 화면엔 "숙련도 4/5"라고 적혀 있는데 던지면
## 차이가 없었다 — 원본 주석이 "배운 구종은 경기에 안 나왔고 숙련도도
## 결과에 안 닿았다"고 적어 뒀다
func test_a_better_grade_makes_a_better_pitch() -> void:
	var d: Dictionary = {"pitch_type": "slider", "location": 5,
		"strategy": "balanced", "power": "normal"}
	var qs: Array = []
	for grade in [1, 3, 5]:
		var ctx: Dictionary = {
			"pitcher": {"command": 50.0, "velocity": 50.0, "control": 50.0,
				"movement": 50.0, "pitches": [{"id": "slider", "grade": grade}]},
			"batter": {"contact": 50.0, "eye": 50.0, "discipline": 50.0},
			"stamina": 100.0, "mental": 50.0,
			"count": {"balls": 0, "strikes": 0}, "score": {"home": 0, "away": 0},
			"weather": "sunny", "park": "neutral"}
		ctx["grade"] = PitchStep.grade_of(ctx["pitcher"], "slider")
		var r := RandomNumberGenerator.new()
		r.seed = 11
		qs.append(PitchOutcome.pitch_quality(ctx, d,
			PitchOutcome.zone_to_target(5), r))
	assert_float(qs[1]).override_failure_message(
		"숙련도 1이 %.1f, 3이 %.1f — 숙련도가 결과에 안 닿는다" % [qs[0], qs[1]]) \
		.is_greater(qs[0])
	assert_float(qs[2]).is_greater(qs[1])


## ⚠ **안 배운 구종은 기준(3)으로 본다.** NPC는 아직 구종 배열이 없어서
## 여기가 밸런스 동결을 지키는 자리다 — 기준값이 옛 고정값과 같아야 한다
func test_a_pitcher_without_an_arsenal_uses_the_baseline() -> void:
	assert_int(PitchStep.grade_of({}, "fastball")).is_equal(3)
	assert_int(PitchStep.grade_of({"pitches": []}, "curve")).is_equal(3)
	assert_int(PitchStep.grade_of(
		{"pitches": [{"id": "fastball", "grade": 5}]}, "curve")).is_equal(3)


## 주인공은 직구 하나·숙련도 3으로 시작한다 — 02 그대로
func test_the_protagonist_starts_with_one_fastball() -> void:
	var s: Dictionary = World.new_game({"seed": 99, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: Array = PitchVm.repertoire(s["protagonist"])
	assert_int(r.size()).is_equal(1)
	assert_str(r[0]["id"]).is_equal("fastball")
	assert_int(r[0]["grade"]).override_failure_message(
		"주인공 시작 숙련도가 %d다 — 02는 3이다" % r[0]["grade"]).is_equal(3)


## ⚠ **투수의 구종 배열이 경기까지 가야 한다.** 능력치만 옮기고 배열을
## 빠뜨리면 배운 구종이 경기에 안 나온다
func test_the_arsenal_reaches_the_match() -> void:
	var s: Dictionary = World.new_game({"seed": 99, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var mapped: Dictionary = MatchDay._pitcher(s["protagonist"])
	assert_int(PitchStep.grade_of(mapped, "fastball")).is_equal(3)


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/pitch_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")
