extends GdUnitTestSuite

## 협상 화면 — F-2b. **04는 "계약한다 / 거절한다" 둘뿐이었다.**
##
## `sim/negotiation.gd`가 산식을 갖고, 여기는 그것이 **화면까지 이어졌는지**를
## 본다 — 사전만 맞고 화면이 안 그리면 없는 것과 같다.
##
## 원본: `features/contract/ui/ContractNegotiationModal.svelte`


const ROOT := preload("res://ui/app_root.tscn")


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2031, "day": 10, "season_days": 350,
		"protagonist": {
			"id": "ME", "name": "김한결", "position": "SP", "age": 27,
			"league_id": "LEAGUE_KBL", "team_id": "TEAM_KBL_SEOUL_ROYALS_1",
			"salary": 12000, "contract_years": 0, "pro_service_years": 5,
			"fame": 40.0, "retired": false,
			"pitching": {"ovr": 70.0, "velocity": 72.0, "command": 66.0,
				"control": 68.0, "movement": 62.0, "stamina": 64.0},
		},
		"world": {"rosters": {}}, "pending": [], "mailbox": [],
		"season_stats": {}, "schedule": [],
	}
	s.merge(over, true)
	Pending.push(s, {
		"type": "salary_negotiation",
		"team_id": "TEAM_KBL_SEOUL_ROYALS_1", "league_id": "LEAGUE_KBL",
		"offered_salary": 20000, "duration_years": 2,
		"min_duration_years": 1, "max_duration_years": 3,
		"signing_bonus": 5000, "context": "renewal",
	})
	return s


# ── 사전이 협상을 담는가 ──────────────────────────────────────

## ⚠ **예전엔 `kind`가 `one`이고 선택지가 둘이었다** — 협상이 아니라 통보다
func test_the_view_model_is_a_negotiation() -> void:
	var vm: Dictionary = DecisionVm.build(_state())
	assert_str(String(vm["kind"])).override_failure_message(
		"재계약이 아직 단순 선택이다 — 협상 틀이 안 붙었다").is_equal("negotiate")
	assert_dict(vm["negotiation"]).is_not_empty()
	var ids := PackedStringArray()
	for c in vm["choices"]:
		ids.append(String(c["id"]))
	assert_array(ids).contains(["sign", "counter", "reject"])


## ⚠ **산식은 `Negotiation`이 정본이다.** 여기서 다시 계산하면 화면에 뜬
## 확률과 실제 판정이 갈린다
func test_the_numbers_come_from_the_engine() -> void:
	var s: Dictionary = _state()
	var vm: Dictionary = DecisionVm.build(s, {"ratio": 0.1})
	var n: Dictionary = vm["negotiation"]
	assert_int(int(n["requested"])).is_equal(
		Negotiation.requested(int(n["effective"]), 0.1))
	assert_int(int(n["accept_chance"])).is_equal(
		Negotiation.accept_chance(int(n["requested"]), int(n["threshold"])))


## 조건을 바꾸면 사전이 따라 움직인다
func test_the_terms_move_the_numbers() -> void:
	var s: Dictionary = _state()
	var flat: Dictionary = DecisionVm.build(s)["negotiation"]
	var greedy: Dictionary = DecisionVm.build(s, {"ratio": 0.2})["negotiation"]
	assert_int(int(greedy["requested"])).is_greater(int(flat["requested"]))
	assert_int(int(greedy["accept_chance"])).is_less(int(flat["accept_chance"]))


## ⚠ **문턱을 넘으면 역제안 버튼이 막힌다.** 눌려도 아무 일이 안 나면
## 사용자는 왜인지 모른다
func test_the_counter_choice_is_disabled_past_the_threshold() -> void:
	var vm: Dictionary = DecisionVm.build(_state(), {"ratio": 0.2})
	for c in vm["choices"]:
		if String(c["id"]) == "counter":
			assert_bool(bool(c.get("enabled", true))).override_failure_message(
				"허용 범위를 넘었는데 역제안이 눌린다").is_false()
			return
	fail("역제안 선택지가 없다")


## ⚠ **구단주 관계가 협상 폭을 넓힌다.** `Relationship.effects`의
## `contract_bonus`는 **소비처가 0건이었다** — 여기가 그 자리다
func test_the_owner_relationship_reaches_the_offer() -> void:
	var cold: Dictionary = _state()
	var warm: Dictionary = _state({"relationships": [
		{"person_id": "OWNER", "kind": "owner", "value": 95,
			"contact": Relationship.CONTACT_TOGETHER}]})
	var a: int = int(DecisionVm.build(cold)["negotiation"]["effective"])
	var b: int = int(DecisionVm.build(warm)["negotiation"]["effective"])
	assert_int(b).override_failure_message(
		"구단주와 각별한데 제시액이 그대로다 (%d → %d) — contract_bonus가 또 죽는다"
			% [a, b]).is_greater(a)


# ── 화면에 실제로 뜨는가 ──────────────────────────────────────

func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _find(node: Node, type_name: String, out: Array = []) -> Array:
	if node.get_class() == type_name:
		out.append(node)
	for c in node.get_children():
		_find(c, type_name, out)
	return out


func _mount(vm: Dictionary) -> DecisionScreen:
	var s: DecisionScreen = preload(
		"res://ui/screens/decision_screen.tscn").instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func test_the_screen_shows_the_controls() -> void:
	var screen: DecisionScreen = await _mount(DecisionVm.build(_state()))
	var joined: String = " ".join(_texts(screen))
	assert_str(joined).contains("요청 연봉")
	assert_str(joined).contains("계약 기간")
	assert_str(joined).contains("팀 수락 가능성")
	assert_str(joined).contains("역제안한다")
	# ⚠ **슬라이더가 실제로 있어야 한다** — 글자만 있으면 못 만진다
	assert_array(_find(screen, "HSlider")).override_failure_message(
		"연봉 슬라이더가 없다").is_not_empty()


## ⚠ **다른 결정에는 협상 칸이 안 붙는다.** 붙으면 드래프트 통보에
## 슬라이더가 뜬다
func test_a_plain_decision_has_no_negotiation_controls() -> void:
	var s: Dictionary = _state()
	Pending.clear(s)
	Pending.push(s, {"type": "draft_observe"})
	var screen: DecisionScreen = await _mount(DecisionVm.build(s))
	assert_array(_find(screen, "HSlider")).is_empty()


## ⚠ **슬라이더를 움직이면 루트가 사전을 다시 만든다.** 화면이 자기 산식을
## 가지면 뜬 확률과 실제 판정이 갈린다
func test_moving_the_slider_asks_the_root_to_rebuild() -> void:
	var screen: DecisionScreen = await _mount(DecisionVm.build(_state()))
	var got: Array = []
	screen.terms_changed.connect(func(t: Dictionary) -> void: got.append(t))
	(_find(screen, "HSlider")[0] as HSlider).value = 0.1
	await await_idle_frame()
	assert_array(got).override_failure_message(
		"슬라이더를 움직였는데 아무도 안 듣는다").is_not_empty()
	assert_float(float(got[0]["ratio"])).is_equal_approx(0.1, 0.001)


# ── 눌러서 실제로 계약이 되는가 ───────────────────────────────

func _mount_root(s: Dictionary) -> AppRoot:
	var r: AppRoot = ROOT.instantiate()
	r.set_state(s)
	add_child(r)
	await await_idle_frame()
	return r


## ⚠ **역제안이 화면에 뜬 그 금액으로 서명돼야 한다.** 여기서 다시
## 계산하면 "보여준 것과 다른 계약"이 된다 — 02가 반복해서 겪은 자리다
func test_a_counter_signs_the_shown_amount() -> void:
	var s: Dictionary = _state()
	var terms: Dictionary = {"ratio": 0.1}
	var shown: int = int(DecisionVm.build(s, terms)["negotiation"]["requested"])

	assert_bool(DecisionVm.apply(s, "counter", 10, terms)).is_true()
	var signed: Dictionary = s.get(ContractDecision.NEXT_KEY, {})
	assert_int(int(signed.get("salary", 0))).override_failure_message(
		"화면엔 %d를 보여주고 %d로 서명했다" % [shown, signed.get("salary", 0)]
		).is_equal(shown)


## ⚠ **문턱을 넘긴 역제안은 성사되지 않는다.** 화면이 버튼을 막지만
## 여기서도 본다 — 두 곳이 다르면 화면을 우회해 통과한다
func test_a_counter_past_the_threshold_fails() -> void:
	var s: Dictionary = _state()
	assert_bool(DecisionVm.apply(s, "counter", 10, {"ratio": 0.2})
		).override_failure_message(
		"허용 범위를 넘긴 역제안이 통과했다").is_false()
	assert_bool(Pending.has(s, "salary_negotiation")).override_failure_message(
		"실패했는데 결정이 대기줄에서 사라졌다").is_true()


## 원안 수락은 구단이 부른 금액 그대로다
func test_signing_takes_the_offered_amount() -> void:
	var s: Dictionary = _state()
	assert_bool(DecisionVm.apply(s, "sign", 10)).is_true()
	assert_int(int(s.get(ContractDecision.NEXT_KEY, {}).get("salary", 0))
		).is_equal(20000)


## ⚠ **결정이 끝나면 조건을 비운다.** 다음 협상이 지난 슬라이더 값을
## 물려받으면 안 만진 조건으로 계약이 나간다
func test_the_terms_reset_between_decisions() -> void:
	var r: AppRoot = await _mount_root(_state())
	# ⚠ **결정 화면을 실제로 연다.** 핸들러만 부르면 화면이 없어서
	# 그 자리에서 죽는다 — 검사가 진짜 흐름을 안 밟은 것이다
	r._open_decision()
	await await_idle_frame()
	assert_object(r.decision_screen()).override_failure_message(
		"재계약이 대기줄에 있는데 결정 화면이 안 열렸다").is_not_null()

	r.decision_screen().terms_changed.emit({"ratio": 0.15})
	await await_idle_frame()
	assert_float(float(r._decision_terms.get("ratio", 0.0))).is_equal_approx(
		0.15, 0.001)

	r.decision_screen().chosen.emit("reject")
	await await_idle_frame()
	assert_dict(r._decision_terms).override_failure_message(
		"지난 협상 조건이 남았다 — 다음 협상이 안 만진 조건으로 계약된다"
		).is_empty()


## ⚠ **구단주 지갑이 실제로 넘어가는가.** F-7에서 겪은 것과 같은 함정이다 —
## **검사 세계에 스태프가 없으면 budget이 어차피 1.0**이라 인자를 안 넘겨도
## 결과가 같다. 구단주를 직접 세운다
func test_the_owner_wallet_reaches_the_offer() -> void:
	var tight: Dictionary = _state()
	tight["world"][Staff.KEY] = {"TEAM_KBL_SEOUL_ROYALS_1": [
		{"role": Staff.ROLE_OWNER, "stats": {"budget_support": 1.0}}]}
	var rich: Dictionary = _state()
	rich["world"][Staff.KEY] = {"TEAM_KBL_SEOUL_ROYALS_1": [
		{"role": Staff.ROLE_OWNER, "stats": {"budget_support": 99.0}}]}

	var a: int = int(DecisionVm.build(tight)["negotiation"]["effective"])
	var b: int = int(DecisionVm.build(rich)["negotiation"]["effective"])
	assert_int(b).override_failure_message(
		"지갑을 여는 구단주(%d)와 닫는 구단주(%d)의 제시액이 같다 — budget이 안 넘어간다"
			% [b, a]).is_greater(a)


## ⚠ **역제안 기간이 계약에 들어가야 한다.** 금액만 반영하면 "3년으로
## 합의했는데 2년 계약"이 된다
func test_a_counter_signs_the_chosen_duration() -> void:
	var s: Dictionary = _state()
	# 기간을 늘리면 문턱이 올라가므로 요청은 원안 그대로 둔다
	var terms: Dictionary = {"duration_years": 3}
	assert_bool(DecisionVm.apply(s, "counter", 10, terms)).is_true()
	assert_int(int(s.get(ContractDecision.NEXT_KEY, {}).get("duration_years", 0))
		).override_failure_message(
		"3년으로 역제안했는데 계약 기간이 다르다").is_equal(3)


## ⚠ **계약 사전의 키는 `duration_years`다** (`contract_decision.gd:32`).
## `years`로 적으면 `_apply_contract`가 못 읽어 **계약 연수가 0으로
## 서명된다** — 재계약을 하자마자 만료 상태가 되고, F-7의 만료 물음이
## 매년 다시 뜬다. 실제로 그렇게 적혀 있었다
func test_the_signed_contract_carries_the_years() -> void:
	var s: Dictionary = _state()
	assert_bool(DecisionVm.apply(s, "sign", 10)).is_true()
	var signed: Dictionary = s.get(ContractDecision.NEXT_KEY, {})
	assert_int(int(signed.get("duration_years", 0))).override_failure_message(
		"서명된 계약의 연수가 %d다 — 키 이름이 어긋나 0으로 들어간다"
			% signed.get("duration_years", 0)).is_equal(2)


## 즉시 발효 계약(전역 복귀·첫 계약)은 그 자리에서 선수에게 붙는다 —
## 거기서도 연수가 0이면 안 된다
func test_an_immediate_contract_sets_the_years_on_the_player() -> void:
	var s: Dictionary = _state()
	var a: Dictionary = Pending.first(s, "salary_negotiation")
	a["context"] = "military_return"
	assert_bool(DecisionVm.apply(s, "sign", 10)).is_true()
	assert_int(int(s["protagonist"].get("contract_years", 0))
		).override_failure_message(
		"즉시 발효 계약인데 계약 연수가 0이다 — 하자마자 만료된다").is_equal(2)
