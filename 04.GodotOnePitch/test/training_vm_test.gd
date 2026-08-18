extends GdUnitTestSuite

## 훈련 계획 사전 — M7-9b.
##
## ⚠ **02는 화면이 자기 식을 갖고 있었다.** 슬롯 배수도 구간 승수도 몰라서
## 화면은 "피로 +7"이라 하고 엔진은 −4.25를 적용했다 — **부호가 반대였다.**
## 여기 검사는 그 자리를 지킨다.


func _p(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "ME", "player_type": "pitcher",
		"fatigue": 20.0, "condition": 90.0}
	p.merge(over, true)
	return p


## 경고 룰·이력은 상태를 통째로 본다 — 로그가 상태에 있다
func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {"protagonist": _p(), "training_plan": {}}
	s.merge(over, true)
	return s


func _vm(plan: Dictionary = {}, over: Dictionary = {}) -> Dictionary:
	return TrainingVm.build({"protagonist": _p(over), "training_plan": plan})


# ── 슬롯 키 ───────────────────────────────────────────────────

## ⚠ **`Training._slot_ids`가 읽는 키와 같아야 한다.** 다르면 계획을 짜도
## 조용히 아무 일도 안 일어난다 — 오류도 로그도 없다
func test_the_slot_ids_are_the_ones_the_engine_reads() -> void:
	var plan: Dictionary = {}
	for s in TrainingVm.SLOTS:
		plan[s["id"]] = "TRN_VEL"

	# 셋 다 엔진에 닿으면 피로가 셋 몫만큼 오른다: 5.5×(1.0+0.5+0.5) − 5.0
	var load: Dictionary = Training.plan_load(20.0, plan, Training.programs())
	assert_float(load["fatigue_delta"]).is_equal_approx(6.0, 0.001)


func test_every_slot_shows_up() -> void:
	var slots: Array = _vm()["slots"]
	assert_int(slots.size()).is_equal(3)
	assert_str(String(slots[0]["mult"])).is_equal("XP 2.5배")


func test_an_unset_slot_reads_empty() -> void:
	assert_str(String(_vm()["slots"][0]["program_label"])).is_equal("비움")
	assert_str(String(_vm()["slots"][0]["program_id"])).is_empty()


func test_a_set_slot_carries_its_id_and_name() -> void:
	var s: Dictionary = _vm({"secondary2": "TRN_STAMINA"})["slots"][2]
	assert_str(String(s["program_id"])).is_equal("TRN_STAMINA")
	assert_str(String(s["program_label"])).is_equal("체력 훈련")


# ── 고를 수 있는 것 ───────────────────────────────────────────

## ⚠ **투수에게 타격 훈련을 권하면 안 된다.** `both`는 누구나 한다
func test_the_options_match_the_player_type() -> void:
	var ids: Array = []
	for o in _vm()["options"]:
		ids.append(String(o["id"]))
	assert_array(ids).contains(["TRN_VEL", "TRN_STAMINA"])
	assert_array(ids).not_contains(["TRN_BATTING", "TRN_PLATE_EYE"])

	var bat: Array = []
	for o in _vm({}, {"player_type": "batter"})["options"]:
		bat.append(String(o["id"]))
	assert_array(bat).contains(["TRN_BATTING", "TRN_STAMINA"])
	assert_array(bat).not_contains(["TRN_VEL"])


## 값은 데이터에서 온다 — 화면이 직접 적으면 프로그램을 고칠 때 어긋난다
func test_an_option_carries_its_cost() -> void:
	for o in _vm()["options"]:
		if String(o["id"]) == "TRN_VEL":
			assert_str(String(o["cost"])).is_equal("피로 +5.5 · 컨디션 -6.0")
			assert_str(String(o["gains"])).is_equal("구속, 스태미나")
			return
	fail("TRN_VEL이 목록에 없다")


## ⚠ **회복 훈련의 부호가 뒤집혀 보이면 안 된다.** 데이터가 "비용"이라
## 음수인데 그대로 찍으면 `피로 +-10.0 · 컨디션 −-16.0`이 나왔다
func test_recovery_reads_as_a_gain_not_a_cost() -> void:
	for o in _vm()["options"]:
		if String(o["id"]) == "TRN_RECOVERY":
			assert_str(String(o["cost"])).is_equal("피로 -10.0 · 컨디션 +16.0")
			return
	fail("TRN_RECOVERY가 목록에 없다")


# ── 미리보기가 엔진과 같은가 ──────────────────────────────────

## ⚠ **미리보기와 실제가 같은 함수를 쓴다.** 두 벌이 되는 순간
## "화면엔 −8인데 실제로는 −12"가 된다
func test_the_preview_is_the_engine_number() -> void:
	var plan: Dictionary = {"primary": "TRN_VEL", "secondary": "TRN_STAMINA"}
	var load: Dictionary = Training.plan_load(20.0, plan, Training.programs())
	assert_str(String(_vm(plan)["delta_label"])).is_equal(
		"이번 주 피로 %+.1f · 컨디션 %+.1f" % [
			load["fatigue_delta"], load["condition_delta"]])


## 슬롯마다 피로 배수가 다르다 — 같은 훈련을 어디 넣느냐가 값을 바꾼다
func test_the_slot_changes_the_cost() -> void:
	var first: String = String(_vm({"primary": "TRN_VEL"})["delta_label"])
	var third: String = String(_vm({"secondary2": "TRN_VEL"})["delta_label"])
	assert_str(first).override_failure_message(
		"1순위와 3순위가 같은 값이다 — 슬롯 배수를 안 태웠다").is_not_equal(third)


## ⚠ **회복 훈련에 구간 승수를 안 건다.** 걸면 지쳤을 때 회복이 네 배가 되어
## 벼랑 끝이 오히려 이득이 된다
func test_recovery_does_not_scale_with_the_zone() -> void:
	var fresh: Dictionary = _vm({"primary": "TRN_RECOVERY"}, {"fatigue": 20.0})
	var spent: Dictionary = _vm({"primary": "TRN_RECOVERY"}, {"fatigue": 92.0})
	# 두 상태의 피로 변화가 같아야 한다 — 구간이 회복을 부풀리지 않는다
	assert_str(String(spent["delta_label"]).split(" · ")[0]).override_failure_message(
		"지쳤을 때 회복이 더 크다").is_equal(String(fresh["delta_label"]).split(" · ")[0])
	assert_str(String(fresh["delta_label"]).split(" · ")[0]).is_equal("이번 주 피로 -15.0")

	# 반대로 **비용이 드는 훈련은 구간을 탄다** — 지쳤을 때 더 지친다
	assert_str(String(_vm({"primary": "TRN_VEL"}, {"fatigue": 92.0})["delta_label"])
		).is_not_equal(String(_vm({"primary": "TRN_VEL"}, {"fatigue": 20.0})["delta_label"]))


# ── 구간과 경고 ───────────────────────────────────────────────

func test_the_zones_are_named() -> void:
	assert_str(String(TrainingVm.zone_of(0.0)["label"])).is_equal("괜찮음")
	assert_str(String(TrainingVm.zone_of(69.9)["label"])).is_equal("괜찮음")
	assert_str(String(TrainingVm.zone_of(70.0)["label"])).is_equal("피곤")
	assert_str(String(TrainingVm.zone_of(80.0)["label"])).is_equal("매우 피곤")
	assert_str(String(TrainingVm.zone_of(90.0)["label"])).is_equal("탈진 직전")


## ⚠ **벼랑 앞에서 미리 말한다.** 지금 구간만 보면 넘어간 뒤에야 알려준다
func test_it_warns_when_the_plan_crosses_a_line() -> void:
	var vm: Dictionary = _vm({"primary": "TRN_VEL", "secondary": "TRN_STAMINA"},
		{"fatigue": 68.0})
	assert_bool(vm["is_tired"]).is_false()
	assert_bool(vm["warns"]).override_failure_message(
		"%s인데 경고가 없다" % vm["projected_label"]).is_true()


## 계획이 가벼우면 경고하지 않는다 — 늘 켜져 있으면 아무 뜻이 없다
func test_a_light_plan_does_not_warn() -> void:
	assert_bool(_vm({}, {"fatigue": 68.0})["warns"]).is_false()


## 이미 지쳐 있으면 경고가 아니라 상태로 말한다 — 둘 다 켜면 시끄럽다
func test_an_already_tired_player_is_not_warned_again() -> void:
	var vm: Dictionary = _vm({"primary": "TRN_VEL"}, {"fatigue": 85.0})
	assert_bool(vm["is_tired"]).is_true()
	assert_bool(vm["warns"]).is_false()
	assert_str(String(vm["fatigue_label"])).is_equal("85 (매우 피곤)")


## 다음 주 값은 0~100에 갇힌다 — 음수 피로가 화면에 뜨면 안 된다
func test_the_projection_is_clamped() -> void:
	assert_str(String(_vm({"primary": "TRN_RECOVERY"}, {"fatigue": 2.0,
		"condition": 99.0})["projected_label"])).is_equal(
		"다음 주 피로 0 (괜찮음) · 컨디션 100")


# ── 경고 룰 · 훈련 이력 ──────────────────────────────────────────

## 🔴 **04엔 이 절이 없었다.** 훈련은 문턱을 피하는 게임인데 피로 70·85가
## XP를 얼마나 깎는지 **어디에서도 볼 수 없었다**
func test_경고_룰이_문턱을_말한다() -> void:
	var r: Dictionary = TrainingVm.build(_state())["rules"]
	var joined: String = ""
	for row in r["rows"]:
		joined += "%s %s / " % [row["label"], row["value"]]
	assert_str(joined).override_failure_message(
		"피로 문턱이 안 적혔다: %s" % joined).contains("피로 85 이상")
	assert_str(joined).contains("피로 70 이상")
	# 얼마나 깎이는지도 같이 — 문턱만 알면 피할 이유가 안 보인다
	assert_str(joined).contains("35%")
	assert_str(joined).contains("65%")


## ⚠ **숫자를 화면이 다시 적지 않는다** — 엔진 표를 그대로 읽는다
func test_문턱이_엔진_표에서_온다() -> void:
	var rows: Array = TrainingVm.build(_state())["rules"]["rows"]
	# 피로 밴드 수 + 입스 밴드 수
	assert_int(rows.size()).is_equal(
		Growth.FATIGUE_BANDS.size() + Injury.yips_bands().size())


## 사기가 오래 바닥이면 입스가 온다 — 그 문턱도 적는다
func test_입스_문턱도_적는다() -> void:
	var joined: String = ""
	for row in TrainingVm.build(_state())["rules"]["rows"]:
		joined += "%s %s / " % [row["label"], row["value"]]
	assert_str(joined).override_failure_message(
		"입스 문턱이 없다: %s" % joined).contains("입스")
	assert_str(joined).contains("사기 저하")


## ⚠ **규칙만 적으면 남 얘기로 읽힌다** — 지금 내가 어디 서 있는지 말한다
func test_지금_내_상태를_말한다() -> void:
	var safe: Dictionary = TrainingVm.build(_state())["rules"]
	assert_str(String(safe["status"])).contains("정상")
	assert_bool(bool(safe["warn"])).is_false()

	var s: Dictionary = _state()
	s["protagonist"]["consecutive_low_morale_weeks"] = 9
	var bad: Dictionary = TrainingVm.build(s)["rules"]
	assert_str(String(bad["status"])).override_failure_message(
		"9주 연속인데 %s라고 한다" % bad["status"]).contains("9주차")
	assert_str(String(bad["status"])).contains("입스 위험")
	assert_bool(bool(bad["warn"])).is_true()


## 훈련 이력 — `training_log`에 이미 쌓이던 것이다(P-31)
func test_훈련_이력이_보인다() -> void:
	var s: Dictionary = _state()
	s["training_log"] = ["[훈련] 1주 커맨드 +0.4", "[훈련] 2주 구위 +0.3"]
	var rows: Array = TrainingVm.build(s)["history"]
	assert_int(rows.size()).is_equal(2)
	# 최근 것이 위로 — 방금 한 훈련이 제일 먼저 보여야 한다
	assert_str(String(rows[0])).contains("2주")
	# 화면에 태그를 그대로 내보내지 않는다
	assert_int(String(rows[0]).find("[훈련]")).is_equal(-1)


## 길어도 몇 줄만 — 다 보여주면 화면이 로그창이 된다
func test_이력은_몇_줄만_보여준다() -> void:
	var s: Dictionary = _state()
	var log: Array = []
	for i in 30:
		log.append("[훈련] %d주 구위 +0.1" % i)
	s["training_log"] = log
	assert_int((TrainingVm.build(s)["history"] as Array).size()) \
		.is_equal(TrainingVm.HISTORY_ROWS)


## 기록이 없으면 없다고 말한다 — 빈 칸은 고장으로 보인다
func test_이력이_없으면_비어_있다() -> void:
	assert_int((TrainingVm.build(_state())["history"] as Array).size()).is_equal(0)
