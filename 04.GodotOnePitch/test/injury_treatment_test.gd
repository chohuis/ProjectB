extends GdUnitTestSuite

## 부상 치료 선택 — 🔴 **고르는 자리가 통째로 없었다.**
##
## PORT_GAP은 *"`injury_treat` 검색 0건 — 엔진부터 확인"*이라 적어 뒀는데
## **틀렸다. 04에 산식이 다 있다:**
##  · `Injury.permanent_penalty(type, treatment_choice)` — 후유증이 갈린다
##  · `data/injury_rules.json`의 `penalty_by_treatment` — 표가 있다
##  · `InjuryRunner._heal_protagonist`가 `cur["treatment_choice"]`를 읽는다
##  · `treatment_weekly` — 재정 화면에 "부상 치료비" 줄이 있다
##
## 🔴 **그런데 셋 다 쓰는 곳이 없다.** 읽기만 한다 —
## **결정 화면 대조에서 본 형태 ②③이 그대로 있다**
## (받는 쪽만 있고 올리는 쪽이 없다 · 고른 것이 남지 않는다).
##
## 02 `InjuryTreatmentModal`(134줄)의 갈래와 값을 그대로 옮겼다.


func _state(t: String, weeks: int = 10) -> Dictionary:
	return {
		"day": 100, "season_year": 2031, "seed": 3,
		"protagonist": {"id": "ME", "name": "김한결",
			"career_stage": "pro_kbl", "league_id": "LEAGUE_KBL",
			"team_id": "TEAM_KBL_BUSAN_WAVES_1", "money": 100000,
			"pitching": {"ovr": 70.0, "control": 70.0, "command": 70.0,
				"velocity": 70.0},
			"injury": {"type": t, "severity": Injury.severity_of(t),
				"weeks_left": weeks, "total_weeks": weeks,
				"since_day": 90, "playing_through": false,
				"penalty_applied": false},
			"retired": false},
		"pending": [], "mailbox": [], "world": {"rosters": {}},
	}


# ── 갈래가 있나 ───────────────────────────────────────────────────

## 🔴 **02가 가르는 부상 둘에 선택지가 있어야 한다**
func test_입스에_갈래가_둘이다() -> void:
	var opts: Array = Injury.treatments_for("YIPS")
	assert_int(opts.size()).override_failure_message(
		"입스에 치료 선택지가 없다").is_equal(2)
	var ids: Array = []
	for o in opts:
		ids.append(String(o["id"]))
	assert_bool(ids.has("self")).is_true()
	assert_bool(ids.has("counseling")).is_true()


func test_어깨_염증에_갈래가_둘이다() -> void:
	var ids: Array = []
	for o in Injury.treatments_for("SHOULDER_INFLAM"):
		ids.append(String(o["id"]))
	assert_bool(ids.has("conservative")).is_true()
	assert_bool(ids.has("steroid")).is_true()


## ⚠ **가르지 않는 부상엔 선택지를 만들지 않는다** — 02도 둘만 가른다.
## 없는 선택을 지어내면 그게 두 번째 정본이 된다
func test_다른_부상엔_갈래가_없다() -> void:
	assert_int(Injury.treatments_for("BLISTER").size()).override_failure_message(
		"02가 안 가르는 부상에 치료 선택지를 지어냈다").is_equal(0)


## 갈래 한 줄이 값 있는 칸을 다 갖는다 — 화면이 그걸 읽는다
func test_갈래가_칸을_다_갖는다() -> void:
	for o in Injury.treatments_for("YIPS"):
		assert_str(String(o["label"])).is_not_empty()
		assert_str(String(o["note"])).is_not_empty()
		assert_bool(o.has("cost_weekly")).is_true()
		assert_bool(o.has("weeks_delta")).is_true()


## 02 값 그대로 — 스테로이드는 3주 단축, 일시금 200
func test_02_값_그대로다() -> void:
	for o in Injury.treatments_for("SHOULDER_INFLAM"):
		if String(o["id"]) != "steroid":
			continue
		assert_int(int(o["weeks_delta"])).is_equal(-3)
		assert_int(int(o["cost_once"])).is_equal(200)


# ── 고르면 남나 ───────────────────────────────────────────────────

## 🔴 **여기가 형태 ③이다.** 고른 게 안 남으면 후유증이 안 갈린다
func test_고르면_부상에_남는다() -> void:
	var s: Dictionary = _state("YIPS")
	assert_bool(InjuryRunner.choose_treatment(s, "counseling")).is_true()
	assert_str(String(s["protagonist"]["injury"]["treatment_choice"])) \
		.override_failure_message(
			"고른 치료가 안 남았다 — 후유증이 안 갈린다").is_equal("counseling")


## 후유증이 실제로 갈린다 — `self`는 -3, `counseling`은 -1
func test_치료가_후유증을_가른다() -> void:
	assert_float(float(Injury.permanent_penalty("YIPS", "self")["control"])) \
		.is_equal_approx(-3.0, 0.01)
	assert_float(float(Injury.permanent_penalty("YIPS",
		"counseling")["control"])).is_equal_approx(-1.0, 0.01)


## ⚠ **주당 비용이 재정에 흐른다** — `treatment_weekly`를 재정 화면이 읽는다
func test_주당_비용이_재정에_흐른다() -> void:
	var s: Dictionary = _state("YIPS")
	InjuryRunner.choose_treatment(s, "counseling")
	assert_int(int(s["protagonist"]["treatment_weekly"])) \
		.override_failure_message(
			"주당 치료비가 안 흐른다 — 재정 화면의 그 줄이 늘 0이다") \
		.is_equal(80)


## 일시금은 그 자리에서 빠진다
func test_일시금이_그_자리에서_빠진다() -> void:
	var s: Dictionary = _state("SHOULDER_INFLAM", 6)
	var before: int = int(s["protagonist"]["money"])
	InjuryRunner.choose_treatment(s, "steroid")
	assert_int(int(s["protagonist"]["money"])).override_failure_message(
		"일시금 200이 안 빠졌다").is_equal(before - 200)


## 회복 주차가 줄어든다 — 스테로이드는 3주 단축
func test_주차가_줄어든다() -> void:
	var s: Dictionary = _state("SHOULDER_INFLAM", 6)
	InjuryRunner.choose_treatment(s, "steroid")
	assert_int(int(s["protagonist"]["injury"]["weeks_left"])) \
		.override_failure_message("3주 단축이 안 걸렸다").is_equal(3)


## ⚠ **0주 아래로는 안 내려간다** — 3주짜리에 3주 단축이면 남는 게 없다
func test_주차가_0_아래로_안_간다() -> void:
	var s: Dictionary = _state("SHOULDER_INFLAM", 2)
	InjuryRunner.choose_treatment(s, "steroid")
	assert_int(int(s["protagonist"]["injury"]["weeks_left"])).is_greater_equal(0)


## 🔴 **스테로이드는 뒤에 값을 치른다** — 이후 부상 확률이 오른다.
## `Injury.trigger_chance`가 `prior_steroid_used`를 읽는데 **아무도 안 채웠다**
func test_스테로이드가_흔적을_남긴다() -> void:
	var s: Dictionary = _state("SHOULDER_INFLAM", 6)
	InjuryRunner.choose_treatment(s, "steroid")
	assert_bool(bool(s["protagonist"]["prior_steroid_used"])) \
		.override_failure_message(
			"스테로이드를 맞았는데 흔적이 안 남는다 — 대가 없는 선택이 된다") \
		.is_true()


## 안 가르는 부상은 고를 수 없다
func test_안_가르는_부상은_못_고른다() -> void:
	var s: Dictionary = _state("BLISTER", 2)
	assert_bool(InjuryRunner.choose_treatment(s, "steroid")).is_false()


## 없는 갈래는 못 고른다 — 화면을 우회해도 막힌다
func test_없는_갈래는_못_고른다() -> void:
	var s: Dictionary = _state("YIPS")
	assert_bool(InjuryRunner.choose_treatment(s, "없다")).is_false()


## ⚠ **두 번 못 고른다** — 다시 고르면 비용만 또 빠진다
func test_두_번_못_고른다() -> void:
	var s: Dictionary = _state("SHOULDER_INFLAM", 6)
	InjuryRunner.choose_treatment(s, "steroid")
	var money: int = int(s["protagonist"]["money"])
	assert_bool(InjuryRunner.choose_treatment(s, "conservative")).is_false()
	assert_int(int(s["protagonist"]["money"])).is_equal(money)


## ⚠ **완치하면 치료비가 끊긴다.** 안 끊으면 다 나은 뒤에도 재정 화면에서
## 주마다 계속 빠진다 — 화면이 읽는 값이라 조용히 새는 자리다
func test_완치하면_치료비가_끊긴다() -> void:
	var s: Dictionary = _state("YIPS", 1)
	InjuryRunner.choose_treatment(s, "counseling")
	assert_int(int(s["protagonist"]["treatment_weekly"])).is_equal(80)

	# 한 주 굴려 완치시킨다
	InjuryRunner.run(s, 107)
	assert_bool(s["protagonist"]["injury"] == null).override_failure_message(
		"1주 남았는데 안 나았다").is_true()
	assert_int(int(s["protagonist"]["treatment_weekly"])).override_failure_message(
		"다 나았는데 치료비가 계속 빠진다").is_equal(0)


## 후유증이 고른 대로 붙는다 — 끝까지 굴려서 본다
func test_후유증이_고른_대로_붙는다() -> void:
	var out: Array = []
	for pick in ["self", "counseling"]:
		var s: Dictionary = _state("YIPS", 1)
		InjuryRunner.choose_treatment(s, pick)
		var before: float = float(s["protagonist"]["pitching"]["control"])
		InjuryRunner.run(s, 107)
		out.append(before - float(s["protagonist"]["pitching"]["control"]))
	assert_float(out[0]).override_failure_message(
		"자가 극복 후유증이 %.1f — 3이어야 한다" % out[0]) \
		.is_equal_approx(3.0, 0.01)
	assert_float(out[1]).override_failure_message(
		"상담 후유증이 %.1f — 1이어야 한다" % out[1]).is_equal_approx(1.0, 0.01)


# ── 배선 ──────────────────────────────────────────────────────────

## 🔴 **엔진만 만들면 또 도달 불가다** — 형태 ②.
## 세 자리(`HANDLED`·`match`·`AutoAdvance`)를 같이 본다
func test_세_자리에_다_있다() -> void:
	assert_int(CodeText.of("res://ui/decision_vm.gd").find("\"injury_treatment\"")) \
		.override_failure_message("화면이 못 받는다").is_greater(-1)
	assert_int(CodeText.of("res://sim/auto_advance.gd").find("\"injury_treatment\"")) \
		.override_failure_message(
			"자동 진행이 안 센다 — 물음이 떠도 지나간다").is_greater(-1)


## 대기줄에 올라간다
func test_부상이_나면_묻는다() -> void:
	var s: Dictionary = _state("YIPS")
	assert_bool(InjuryRunner.ask_treatment(s)).is_true()
	assert_bool(Pending.has(s, "injury_treatment")).is_true()


## 안 가르는 부상엔 안 묻는다 — 고를 게 없는 물음은 잡음이다
func test_안_가르는_부상엔_안_묻는다() -> void:
	assert_bool(InjuryRunner.ask_treatment(_state("BLISTER", 2))).is_false()


## 이미 골랐으면 다시 안 묻는다
func test_이미_골랐으면_안_묻는다() -> void:
	var s: Dictionary = _state("YIPS")
	InjuryRunner.choose_treatment(s, "self")
	assert_bool(InjuryRunner.ask_treatment(s)).is_false()


## 🔴 **`run`이 실제로 묻나** — 함수만 만들고 안 부르면 그대로다
func test_run이_묻는다() -> void:
	var s: Dictionary = _state("YIPS")
	InjuryRunner.run(s, 100)
	assert_bool(Pending.has(s, "injury_treatment")).override_failure_message(
		"주간 처리를 굴렸는데 안 물었다").is_true()


## 화면이 갈래를 그리고 고르면 남는다 — 끝까지 굴린다
func test_화면에서_고르면_남는다() -> void:
	var s: Dictionary = _state("YIPS")
	InjuryRunner.ask_treatment(s)
	var d: Dictionary = DecisionVm.build(s)
	assert_str(String(d.get("type", ""))).is_equal("injury_treatment")
	assert_int(int(d.get("choices", []).size())).override_failure_message(
		"화면에 치료 갈래가 없다").is_equal(2)
	assert_int(String(d.get("body", "")).find("**")).is_equal(-1)

	assert_bool(DecisionVm.apply(s, "counseling", 100)).is_true()
	assert_str(String(s["protagonist"]["injury"]["treatment_choice"])) \
		.is_equal("counseling")
	assert_bool(Pending.has(s, "injury_treatment")).override_failure_message(
		"골랐는데 물음이 대기줄에 남았다").is_false()


## 화면이 기간·비용·대가를 다 적는다 — 값만 보면 싼 쪽이 늘 나아 보인다
func test_화면이_대가를_적는다() -> void:
	var s: Dictionary = _state("SHOULDER_INFLAM", 6)
	InjuryRunner.ask_treatment(s)
	var joined: String = ""
	for c in DecisionVm.build(s).get("choices", []):
		joined += String(c["label"]) + "\n"
	assert_int(joined.find("3주 단축")).override_failure_message(
		"단축 기간이 없다: %s" % joined).is_greater(-1)
	assert_int(joined.find("일시금")).override_failure_message(
		"일시금이 없다: %s" % joined).is_greater(-1)
	assert_int(joined.find("재발")).override_failure_message(
		"대가가 없다 — 싼 쪽이 늘 나아 보인다: %s" % joined).is_greater(-1)
