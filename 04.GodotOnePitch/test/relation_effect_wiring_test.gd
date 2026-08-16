extends GdUnitTestSuite

## 관계 효과 배선 — F-2c.
##
## `Relationship.effects`는 셋을 만든다. **F-2b 전까지 셋 다 소비처가
## 0건이었다** — 만들어만 놓고 아무도 안 읽었다.
##
##   `contract_bonus`  구단주 → 재계약   ✅ F-2b에서 이었다
##   `role_ovr_bias`   감독   → 보직 배정  ← 여기
##   `training_bonus`  코치   → 훈련 효율  ← 여기
##
## 원본: `pitcherRoleEngine.ts:50-77` · `advanceWeek.ts:296-303`
##
## ⚠ **`Finance.training_bonus`와 이름이 같은 다른 것이 있다**(구독 효과) —
## 섞으면 조용히 틀린다.


func _pitcher(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "position": "SP", "age": 24,
		"team_id": "TEAM_A", "league_id": "LEAGUE_KBL",
		"pitching": {"ovr": 70.0}, "fatigue": 20.0, "condition": 80.0,
	}
	p.merge(over, true)
	return p


# ── 감독 → 보직 배정 ──────────────────────────────────────────

## ⚠ **실력이 아니라 "감독이 나를 어떻게 보는가"다** (02 주석 그대로).
## 같은 OVR이라도 신뢰가 두터우면 선발 경쟁에서 앞선다.
##
## 02: `let ovr = params.ovr + params.role_ovr_bias`
func test_the_manager_bias_shifts_the_role() -> void:
	# 내 위에 셋 — 편향이 없으면 RP다(문턱은 셋 이하)
	var rivals: Array = [72.0, 74.0, 76.0]
	assert_str(Rotation.assign_position(70.0, rivals)).is_equal("RP")
	# 감독이 나를 좋게 보면 한 명을 제친다
	assert_str(Rotation.assign_position(70.0, rivals, 3.0)).override_failure_message(
		"감독 신뢰가 두터운데 보직이 안 바뀐다").is_equal("SP")


## 반대로 사이가 나쁘면 밀린다
func test_a_bad_manager_relation_costs_the_spot() -> void:
	var rivals: Array = [68.0, 69.0, 71.0]
	assert_str(Rotation.assign_position(70.0, rivals)).is_equal("SP")
	assert_str(Rotation.assign_position(70.0, rivals, -4.0)).override_failure_message(
		"감독이 나를 안 좋게 보는데 자리가 그대로다").is_equal("RP")


## 편향이 0이면 예전과 똑같다 — 밸런스가 안 움직인다
func test_no_bias_keeps_the_old_behaviour() -> void:
	for ovr in [50.0, 65.0, 70.0, 80.0]:
		var rivals: Array = [66.0, 71.0, 74.0, 79.0]
		assert_str(Rotation.assign_position(float(ovr), rivals, 0.0)).is_equal(
			Rotation.assign_position(float(ovr), rivals))


## ⚠ **감독 관계가 실제로 여기까지 온다.** 값을 만들어 놓고 안 넘기면
## `role_ovr_bias`가 또 소비처 0건이 된다
func test_the_manager_relation_reaches_the_assignment() -> void:
	var cold: Dictionary = _state()
	var warm: Dictionary = _state()
	warm[RelationshipRunner.STATE_KEY] = [
		{"person_id": "MGR", "kind": "manager", "value": 95,
			"contact": Relationship.CONTACT_TOGETHER}]
	var a: float = float(RelationshipRunner.effects_of(cold).get("role_ovr_bias", 0.0))
	var b: float = float(RelationshipRunner.effects_of(warm).get("role_ovr_bias", 0.0))
	assert_float(b).override_failure_message(
		"감독과 각별한데 보직 편향이 %f다" % b).is_greater(a)


# ── 코치 → 훈련 효율 ──────────────────────────────────────────

func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2030, "day": 10,
		"protagonist": _pitcher(),
		"world": {"rosters": {}}, "pending": [], "mailbox": [],
		"training_plan": {}, "training_subscriptions": [],
	}
	s.merge(over, true)
	return s


## ⚠ **02는 능력치 보정과 관계 보정을 더한 뒤 한 번에 자른다.**
## 주석 그대로: "각각 clamp하면 상한이 두 배가 된다".
##
## ⚠ **하한만 실제로 걸린다.** 04에서 코치 능력치 몫은 ±0.1875이고
## (`staff_rules.json`의 teaching 0.15 × clamp 1.25) 관계 몫은 ±0.06이라
## 최대 조합이 **0.2475로 상한 0.25에 안 닿는다.** 상한은 02 값을 그대로
## 옮긴 것이고 04 입력 범위에서는 안 걸린다 — **그 사실을 검사가 적어 둔다**
func test_the_coach_bonus_is_clamped_once() -> void:
	# 최대 조합은 상한 아래다 — 잘리지 않고 그대로 나온다
	var hi: float = WeekRunner.coach_efficiency(1.1875, 0.06)
	assert_float(hi).is_equal_approx(0.2475, 0.0001)
	assert_float(hi).override_failure_message(
		"코치 보정이 02 상한을 넘었다 (%f)" % hi).is_less_equal(
		WeekRunner.COACH_BONUS_MAX)

	# 하한은 실제로 걸린다 — 안 자르면 −0.2475까지 내려간다
	var lo: float = WeekRunner.coach_efficiency(0.8125, -0.06)
	assert_float(lo).override_failure_message(
		"코치 보정 하한이 안 걸렸다 (%f)" % lo).is_equal_approx(
		WeekRunner.COACH_BONUS_MIN, 0.0001)


## 02 값 그대로 — 상한 0.25 · 하한 −0.15
func test_the_clamp_matches_the_original() -> void:
	assert_float(WeekRunner.COACH_BONUS_MAX).is_equal(0.25)
	assert_float(WeekRunner.COACH_BONUS_MIN).is_equal(-0.15)


## 중립이면 정확히 0이다 — 지금까지의 수가 그대로 남는다
func test_a_neutral_coach_adds_nothing() -> void:
	assert_float(WeekRunner.coach_efficiency(1.0, 0.0)).is_equal(0.0)


## ⚠ **관계가 실제로 더해진다.** 같은 코치라도 사이가 좋으면 더 오른다
func test_the_coach_relation_adds_to_the_bonus() -> void:
	var flat: float = WeekRunner.coach_efficiency(1.0, 0.0)
	var warm: float = WeekRunner.coach_efficiency(1.0, 0.06)
	assert_float(warm).override_failure_message(
		"코치와 사이가 좋은데 훈련 효율이 그대로다").is_greater(flat)
	# 관계만으로는 상한에 안 닿는다 — 능력치가 여전히 주된 축이다
	assert_float(warm).is_less(WeekRunner.COACH_BONUS_MAX)


## 사이가 나쁘면 깎인다
func test_a_bad_coach_relation_costs_efficiency() -> void:
	assert_float(WeekRunner.coach_efficiency(1.0, -0.06)).is_less(
		WeekRunner.coach_efficiency(1.0, 0.0))


# ── 배선이 실제로 이어졌는가 ──────────────────────────────────

## ⚠ **시즌 롤오버가 감독 편향을 넘겨야 한다.** 안 넘기면 `role_ovr_bias`가
## 또 소비처 0건이 된다 — 이번 세션에서 그 종류로 결함 아홉을 찾았다
func test_the_season_rollover_passes_the_manager_bias() -> void:
	var src := FileAccess.get_file_as_string("res://sim/season_runner.gd")
	assert_str(src).override_failure_message(
		"시즌 롤오버가 `role_ovr_bias`를 안 넘긴다").contains("role_ovr_bias")


## ⚠ **주간 처리가 코치 관계를 넘겨야 한다**
func test_the_week_runner_passes_the_coach_relation() -> void:
	var src := FileAccess.get_file_as_string("res://sim/week_runner.gd")
	assert_str(src).override_failure_message(
		"주간 처리가 코치 관계를 안 읽는다").contains("training_bonus")
	assert_str(src).override_failure_message(
		"코치 몫을 합쳐서 자르지 않는다").contains("coach_efficiency")


## ⚠ **훈련 어휘로 코치를 찾는다.** `training_area` 표의 키는
## `velocity`·`batting` 같은 어휘이지 `TRN_VEL` 같은 프로그램 id가 아니다 —
## id를 그대로 넘기면 **표에 없어서 늘 빈 문자열이 되고 어느 코치도
## 안 걸린다.** 실제로 그렇게 짰다가 잡았다
func test_the_coach_area_comes_from_the_program_focus() -> void:
	var s: Dictionary = _state({"training_plan": {"primary": "TRN_VEL"}})
	assert_str(WeekRunner.primary_coach_area(s)).override_failure_message(
		"1순위 훈련의 코치 영역을 못 찾는다 — 프로그램 id를 그대로 넘겼나?"
		).is_equal("투수")


## 계획이 없으면 빈 문자열이다 — 그 주는 코치 관계가 0이다
func test_no_plan_means_no_coach_area() -> void:
	assert_str(WeekRunner.primary_coach_area(_state())).is_empty()
	assert_str(WeekRunner.primary_coach_area(
		_state({"training_plan": {"primary": "NOPE"}}))).is_empty()


## ⚠ **끝에서 끝까지 이어지는가.** 훈련 계획 → 코치 영역 → 관계 →
## 효율 몫. 한 고리라도 끊기면 0이 나온다
func test_the_chain_from_plan_to_efficiency_is_connected() -> void:
	var s: Dictionary = _state({"training_plan": {"primary": "TRN_VEL"}})
	s[RelationshipRunner.STATE_KEY] = [
		{"person_id": "COACH", "kind": "coach", "specialty": "투수",
			"value": 95, "contact": Relationship.CONTACT_TOGETHER}]

	var area: String = WeekRunner.primary_coach_area(s)
	var bonus: float = float(RelationshipRunner.effects_of(s, area).get(
		"training_bonus", 0.0))
	assert_float(bonus).override_failure_message(
		"각별한 투수 코치인데 훈련 보너스가 %f다" % bonus).is_equal_approx(0.06, 0.001)

	# 중립 코치(능력치 1.0)와 비교했을 때 그 몫이 그대로 얹힌다
	assert_float(WeekRunner.coach_efficiency(1.0, bonus)).is_equal_approx(
		0.06, 0.001)


## ⚠ **다른 영역의 코치는 안 걸린다.** 타격 코치와 각별해도 구속 훈련은
## 안 오른다 — 걸리면 코치 전문분야가 뜻을 잃는다
func test_a_coach_of_another_area_does_not_count() -> void:
	var s: Dictionary = _state({"training_plan": {"primary": "TRN_VEL"}})
	s[RelationshipRunner.STATE_KEY] = [
		{"person_id": "BAT", "kind": "coach", "specialty": "타격",
			"value": 95, "contact": Relationship.CONTACT_TOGETHER}]
	assert_float(float(RelationshipRunner.effects_of(s,
		WeekRunner.primary_coach_area(s)).get("training_bonus", 0.0))
		).override_failure_message(
		"타격 코치가 구속 훈련에 걸렸다").is_equal(0.0)
