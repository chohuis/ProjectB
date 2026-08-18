extends GdUnitTestSuite

## 결정 화면 — 대기줄에 쌓인 결정을 사람이 답하는 자리.
##
## ⚠ **열 종류가 쌓이는데 받는 화면이 은퇴 하나뿐이었다.** 나머지는
## 밀어넣는 코드만 있고 받는 자리가 없어서 `AutoAdvance`가 그 자리에서
## 안 풀린다 — 프로 커리어가 실제로 막힌다.

const SCREEN := preload("res://ui/screens/decision_screen.tscn")
const APP := preload("res://ui/app_root.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _state(p_over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "ME", "name": "김한결", "age": 18,
		"team_id": "T1", "league_id": "LEAGUE_HIGHSCHOOL",
		"career_history": [], "career_events": [], "money": 0}
	p.merge(p_over, true)
	return {"season_year": 2030, "day": 300, "protagonist": p,
		"pending": [], "mailbox": [], "world": {}}


func _ids(vm: Dictionary) -> Array:
	var out: Array = []
	for c in vm["choices"]:
		out.append(String(c["id"]))
	return out


# ── 무엇을 받나 ───────────────────────────────────────────────

func test_nothing_pending_means_no_question() -> void:
	assert_bool(DecisionVm.is_asking(_state())).is_false()
	assert_bool(DecisionVm.build(_state()).is_empty()).is_true()


## ⚠ **자기 화면이 있는 결정은 안 받는다.** 은퇴는 화면이 결산으로
## 바뀌는 특별한 흐름이라 `RetirementVm`이 받는다 — 여기서도 받으면
## 두 화면이 같은 결정을 두고 다툰다
func test_retirement_is_left_to_its_own_screen() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "retirement_ask", "reason": "decline"})
	assert_bool(DecisionVm.is_asking(s)).override_failure_message(
		"은퇴를 결정 화면이 가로챈다").is_false()
	assert_bool(RetirementVm.is_asking(s)).is_true()


## 모르는 결정도 안 받는다 — 답을 못 하는 화면이 뜨고 대기줄은 그대로 남는다
func test_an_unknown_decision_is_not_claimed() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "무언가_새로운_결정"})
	assert_bool(DecisionVm.is_asking(s)).is_false()


## 받는 목록은 `AutoAdvance`가 멈추는 목록 안에 있어야 한다 —
## 멈추지도 않는 결정에 화면을 띄우면 진행이 이유 없이 끊긴다
func test_every_handled_type_is_a_stopping_one() -> void:
	for t in DecisionVm.HANDLED:
		assert_bool(AutoAdvance.is_stopping(String(t))).override_failure_message(
			"%s는 자동 진행이 안 멈추는 결정이다" % t).is_true()


## 앞에 다른 결정이 있어도 받을 수 있는 것을 찾는다
func test_it_finds_a_handled_one_behind_others() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "무언가_새로운_결정"})
	Pending.push_once(s, {"type": "draft_observe"})
	assert_str(String(DecisionVm.build(s)["type"])).is_equal("draft_observe")


# ── 지명 통보 ─────────────────────────────────────────────────

func _drafted(s: Dictionary) -> void:
	Pending.push_once(s, {"type": "draft_notification", "team_id": "TEAM_KBL_A",
		"league_id": "LEAGUE_KBL", "round": 2, "pick": 14,
		"signing_bonus": 8000, "salary": 3000})


func test_a_draft_notice_says_who_and_how_much() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	var vm: Dictionary = DecisionVm.build(s)
	assert_str(String(vm["title"])).is_equal("지명 통보")
	assert_str(String(vm["body"])).contains("2라운드")
	assert_str(String(vm["body"])).contains("14순위")
	assert_str(String(vm["body"])).contains("8000만")


## ⚠ **거부할 수 있다.** 02는 지명 통보가 알림이라 거부가 없었고,
## 그래서 지명을 받고도 계약 없이 고교에 남는 상태가 생겼다
func test_a_draft_notice_can_be_refused() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	assert_array(_ids(DecisionVm.build(s))).contains(["accept", "reject"])


func test_accepting_a_draft_moves_the_player() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	assert_bool(DecisionVm.apply(s, "accept", 300)).is_true()
	assert_str(String(s["protagonist"]["league_id"])).is_equal("LEAGUE_KBL")
	assert_bool(DecisionVm.is_asking(s)).override_failure_message(
		"계약했는데 통보가 대기줄에 남았다").is_false()


func test_refusing_a_draft_clears_the_queue() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	DecisionVm.apply(s, "reject", 300)
	assert_bool(Pending.has(s, "draft_notification")).override_failure_message(
		"거부했는데 통보가 남았다").is_false()
	assert_str(String(s["protagonist"]["league_id"])).override_failure_message(
		"거부했는데 프로로 갔다").is_not_equal("LEAGUE_KBL")


# ── 트레이드 ──────────────────────────────────────────────────

func _traded(s: Dictionary) -> void:
	Pending.push_once(s, {"type": "trade", "to_team_id": "TEAM_KBL_B",
		"to_league_id": "LEAGUE_KBL", "reason": "선발 보강"})


## ⚠ **거부는 노트레이드 조항이 있을 때만이다** — 없으면 선택지를
## 안 만든다. 누를 수 없는 버튼을 띄우면 "왜 안 눌리지"가 된다
func test_a_trade_cannot_be_refused_without_the_clause() -> void:
	var s: Dictionary = _state()
	_traded(s)
	assert_array(_ids(DecisionVm.build(s))).is_equal(["accept"])


func test_a_no_trade_clause_adds_the_refusal() -> void:
	var s: Dictionary = _state({"no_trade": true})
	_traded(s)
	assert_array(_ids(DecisionVm.build(s))).contains(["reject"])


func test_accepting_a_trade_moves_the_team() -> void:
	var s: Dictionary = _state()
	_traded(s)
	assert_bool(DecisionVm.apply(s, "accept", 300)).is_true()
	assert_str(String(s["protagonist"]["team_id"])).is_equal("TEAM_KBL_B")
	assert_bool(DecisionVm.is_asking(s)).is_false()


func test_a_trade_says_where_i_am_going() -> void:
	var s: Dictionary = _state()
	_traded(s)
	assert_str(String(DecisionVm.build(s)["body"])).override_failure_message(
		"어디로 가는지가 안 뜬다").contains("TEAM_KBL_B")


## ⚠ **거부를 골랐는데 팀이 바뀌면 안 된다** — 고른 것과 상관없이
## 수락하면 노트레이드 조항이 뜻이 없다
func test_refusing_a_trade_keeps_the_team() -> void:
	var s: Dictionary = _state({"no_trade": true})
	_traded(s)
	assert_bool(DecisionVm.apply(s, "reject", 300)).is_true()
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"거부했는데 팀이 바뀌었다").is_equal("T1")
	assert_bool(DecisionVm.is_asking(s)).is_false()


# ── 확인만 하는 것 ────────────────────────────────────────────

## ⚠ **진로 결과를 확인하면 최종 선택으로 넘어간다** — 안 넘어가면
## 졸업반이 결과만 보고 아무 데도 못 간다
func test_confirming_the_results_moves_to_the_choice() -> void:
	var s: Dictionary = _state()
	s["career"] = {"results": {"university_passed": ["U1"],
		"independent_passed": [], "draft_eligible": true}}
	Pending.push_once(s, {"type": "career_results"})

	assert_str(String(DecisionVm.build(s)["body"])).contains("U1 합격")
	assert_bool(DecisionVm.apply(s, "ok", 300)).is_true()
	assert_bool(Pending.has(s, "career_results")).override_failure_message(
		"확인했는데 결과가 대기줄에 남았다").is_false()
	assert_bool(Pending.has(s, "career_choice")).override_failure_message(
		"결과를 확인했는데 최종 선택으로 안 넘어간다").is_true()


func test_observing_the_draft_clears_itself() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "draft_observe"})
	assert_int(DecisionVm.build(s)["choices"].size()).is_equal(1)
	DecisionVm.apply(s, "ok", 300)
	assert_bool(DecisionVm.is_asking(s)).is_false()


# ── 진로 최종 선택 ────────────────────────────────────────────

## ⚠ **붙은 곳만 선택지가 된다.** 떨어진 곳을 두면 누르면 엔진이 거절하는
## 버튼이 되고, 사용자는 왜 안 되는지를 모른다
func test_only_the_passed_places_are_offered() -> void:
	var s: Dictionary = _state()
	s["career"] = {"results": {"university_passed": ["TEAM_UNIV_A"],
		"independent_passed": [], "drafted": false}}
	Pending.push_once(s, {"type": "career_choice"})

	var ids: Array = _ids(DecisionVm.build(s))
	assert_bool(ids.has("university:TEAM_UNIV_A")).is_true()
	assert_bool(ids.has("draft")).override_failure_message(
		"지명 안 됐는데 프로에 가라고 한다").is_false()


## 아무 데도 안 붙어도 길이 하나는 있어야 한다 — 그게 재수다
func test_there_is_always_a_way_forward() -> void:
	var s: Dictionary = _state()
	s["career"] = {"results": {"university_passed": [],
		"independent_passed": [], "drafted": false}}
	Pending.push_once(s, {"type": "career_choice"})
	assert_array(_ids(DecisionVm.build(s))).is_equal(["continue"])


func test_a_drafted_player_can_go_pro() -> void:
	var s: Dictionary = _state()
	s["career"] = {"results": {"university_passed": [],
		"independent_passed": [], "drafted": true, "draft_pick": 14,
		"draft_team_id": "TEAM_KBL_A"}}
	Pending.push_once(s, {"type": "career_choice"})
	assert_bool(_ids(DecisionVm.build(s)).has("draft")).is_true()

	assert_bool(DecisionVm.apply(s, "draft", 300)).is_true()
	assert_bool(Pending.has(s, "draft_notification")).override_failure_message(
		"프로를 골랐는데 지명 통보가 안 왔다").is_true()


## ⚠ **갈래와 팀을 한 id에 담는다** — 화면이 선택지마다 다른 모양을
## 갖지 않게 하려는 것이다
func test_choosing_a_school_reads_the_team_out_of_the_id() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	s["career"] = {"results": {"university_passed": ["TEAM_UNIV_A"],
		"independent_passed": [], "drafted": false}}
	Pending.push_once(s, {"type": "career_choice"})

	assert_bool(DecisionVm.apply(s, "university:TEAM_UNIV_A", 300)).is_true()
	assert_str(String(s["protagonist"]["team_id"])).is_equal("TEAM_UNIV_A")
	assert_str(String(s["protagonist"]["league_id"])).is_equal("LEAGUE_UNIVERSITY")


## ⚠ **갈래도 id에서 읽는다.** 늘 진학으로 보면 독립리그를 골라도
## 대학에 간다 — 팀만 맞고 리그가 다르면 조용히 틀린다
func test_choosing_independent_goes_to_the_independent_league() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	s["career"] = {"results": {"university_passed": [],
		"independent_passed": ["TEAM_IND_A"], "drafted": false}}
	Pending.push_once(s, {"type": "career_choice"})

	assert_bool(DecisionVm.apply(s, "independent:TEAM_IND_A", 300)).is_true()
	assert_str(String(s["protagonist"]["league_id"])).override_failure_message(
		"독립을 골랐는데 %s로 갔다" % s["protagonist"]["league_id"]
		).is_equal("LEAGUE_INDEPENDENT")


# ── 재계약 · 옵션 ─────────────────────────────────────────────

func _renewal(s: Dictionary) -> void:
	Pending.push_once(s, {"type": "salary_negotiation", "team_id": "TEAM_KBL_A",
		"league_id": "LEAGUE_KBL", "offered_salary": 9500,
		"duration_years": 2, "signing_bonus": 0, "context": "renewal"})


## ⚠ **F-2b에서 협상이 됐다.** 예전엔 "계약한다 / 거절한다" 둘뿐이라
## 구단이 부른 금액을 받거나 걷어차는 것 말고 할 게 없었다 — 협상이
## 아니라 통보다. 이제 역제안이 붙는다
func test_a_renewal_says_the_money_first() -> void:
	var s: Dictionary = _state()
	_renewal(s)
	assert_str(String(DecisionVm.build(s)["body"])).contains("9500만")
	assert_array(_ids(DecisionVm.build(s))).is_equal(
		["sign", "counter", "reject"])


## ⚠ **보여준 조건 그대로 계약된다.** 화면이 숫자를 다시 지어내면
## "보여준 것과 다른 계약"이 된다 — 02가 반복해서 겪은 자리다
func test_the_signed_contract_matches_the_offer() -> void:
	var s: Dictionary = _state({"contract_years": 0, "pro_service_years": 3})
	_renewal(s)
	assert_bool(DecisionVm.apply(s, "sign", 300)).is_true()

	var next: Dictionary = s.get(ContractDecision.NEXT_KEY, {})
	var salary: int = int(next.get("salary", s["protagonist"].get("salary", 0)))
	assert_int(salary).override_failure_message(
		"9500을 보여주고 %d로 계약했다" % salary).is_equal(9500)
	# ⚠ **엔진이 읽는 키로 본다.** 예전엔 `years`를 봤는데 그건 화면이
	# 쓰던 이름이고 `_apply_contract`는 `duration_years`를 읽는다
	# (`contract_decision.gd:32·82`) — **검사가 자기가 쓴 키를 다시 보고
	# 통과했고, 실제로는 계약 연수가 0으로 서명되고 있었다.**
	# 증상은 F-7(만료 물음)이 붙고 나서야 드러난다: 재계약을 하자마자
	# 만료 상태라 매년 다시 물어본다
	assert_int(int(next.get("duration_years", 0))).override_failure_message(
		"2년을 보여주고 %d년으로 계약했다" % next.get("duration_years", 0)
		).is_equal(2)


## ⚠ **거절했는데 계약이 생기면 안 된다** — 대기줄만 보면 두 갈래가
## 똑같이 비어서 "늘 계약한다"가 안 걸린다
func test_rejecting_a_renewal_signs_nothing() -> void:
	var s: Dictionary = _state({"contract_years": 0})
	_renewal(s)
	DecisionVm.apply(s, "reject", 300)
	assert_bool(Pending.has(s, "salary_negotiation")).override_failure_message(
		"거절했는데 협상이 남았다").is_false()
	assert_bool(s.has(ContractDecision.NEXT_KEY)).override_failure_message(
		"거절했는데 계약이 생겼다").is_false()


## 🔴 **옛 약속을 갈아끼웠다** (P-25).
##
## 여기는 `option_type` 없이 올려 놓고 "행사/미행사를 사용자가 고른다"를
## 봤다. **구단 옵션은 구단이 정한다** — 02는 시즌 평점으로 갈라 **통보**하고
## (`advanceWeek.ts:1060-1070`) 사용자가 고르는 건 **선수 옵션**뿐이다.
##
## 옛 검사의 뜻("두 갈래로 갈린다")은 **선수 옵션**에서 그대로 산다
func test_a_player_option_can_go_either_way() -> void:
	for pick in [["exercise", 1], ["decline", 0]]:
		var s: Dictionary = _state({"contract_years": 1})
		Pending.push_once(s, {"type": "option_clause", "team_id": "TEAM_KBL_A",
			"option_type": "player", "exercised": false, "next_salary": 9000})
		assert_str(String(DecisionVm.build(s)["body"])).contains("9000만")

		DecisionVm.apply(s, String(pick[0]), 300)
		assert_int(int(s["protagonist"]["contract_years"])
			).override_failure_message("%s를 골랐는데 계약 연수가 다르다" % pick[0]
			).is_equal(int(pick[1]))


## 구단 옵션은 **통보**다 — 결과가 이미 정해져 있고 확인만 한다
func test_a_team_option_is_a_notice() -> void:
	for one in [[true, 1], [false, 0]]:
		var s: Dictionary = _state({"contract_years": 1})
		Pending.push_once(s, {"type": "option_clause", "team_id": "TEAM_KBL_A",
			"option_type": "team", "exercised": bool(one[0]),
			"next_salary": 9000})
		var d: Dictionary = DecisionVm.build(s)
		assert_int(int(d["choices"].size())).override_failure_message(
			"구단 옵션인데 고르게 한다").is_equal(1)

		DecisionVm.apply(s, String(d["choices"][0]["id"]), 300)
		assert_int(int(s["protagonist"]["contract_years"])
			).override_failure_message(
			"구단이 %s했는데 계약 연수가 다르다" % ("행사" if one[0] else "미행사")
			).is_equal(int(one[1]))


# ── 진로 지원 (여러 곳) ───────────────────────────────────────

## ⚠ **지원할 수 있는 무대만 보여준다.** 대학생에게 "대학 지원"을 띄우면
## 두 번 입학이고, 엔진이 거절해서 아무 일도 안 일어난다
func test_a_university_student_is_not_offered_university() -> void:
	var s: Dictionary = _state({"career_stage": "university"})
	Pending.push_once(s, {"type": "career_choice_hub"})
	for id in _ids(DecisionVm.build(s)):
		assert_str(String(id)).override_failure_message(
			"대학생에게 대학 지원을 띄운다").not_contains("university:")


func test_a_highschooler_can_apply_everywhere() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	Pending.push_once(s, {"type": "career_choice_hub"})
	var vm: Dictionary = DecisionVm.build(s)
	assert_str(String(vm["kind"])).is_equal("many")
	assert_bool(_ids(vm).has("draft")).is_true()
	var has_univ: bool = false
	for id in _ids(vm):
		if String(id).begins_with("university:"):
			has_univ = true
	assert_bool(has_univ).is_true()


## 켜 놓은 것을 한 번에 낸다
func test_submitting_sends_every_pick() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	Pending.push_once(s, {"type": "career_choice_hub"})

	assert_bool(DecisionVm.apply(s,
		"submit:university:TEAM_UNIV_A,university:TEAM_UNIV_B,draft", 300)
		).is_true()
	var apps: Dictionary = CareerDecision.of(s).get("applications", {})
	assert_int(apps["university_choices"].size()).is_equal(2)
	assert_bool(apps["draft_applied"]).is_true()
	assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
		"제출했는데 지원 화면이 대기줄에 남았다").is_false()


## ⚠ **아무것도 안 고르고 내도 답이다** — 막으면 대기줄이 안 풀린다
func test_submitting_nothing_is_still_an_answer() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	Pending.push_once(s, {"type": "career_choice_hub"})
	assert_bool(DecisionVm.apply(s, "submit:", 300)).is_true()
	assert_bool(Pending.has(s, "career_choice_hub")).is_false()


## ⚠ **제출이 아닌 답은 안 받는다.** 받으면 엉뚱한 id 하나에 빈 지원서가
## 조용히 제출되고, 그 해 진로가 통째로 날아간다
func test_a_non_submit_answer_is_refused() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	Pending.push_once(s, {"type": "career_choice_hub"})
	assert_bool(DecisionVm.apply(s, "draft", 300)).override_failure_message(
		"제출이 아닌 답을 받았다").is_false()
	assert_bool(Pending.has(s, "career_choice_hub")).override_failure_message(
		"안 받았다면서 지원 화면을 치웠다").is_true()


func test_independent_picks_go_to_the_independent_list() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	Pending.push_once(s, {"type": "career_choice_hub"})
	DecisionVm.apply(s, "submit:independent:TEAM_IND_A", 300)
	var apps: Dictionary = CareerDecision.of(s).get("applications", {})
	assert_int(apps["independent_choices"].size()).override_failure_message(
		"독립 지원이 대학 쪽으로 갔다").is_equal(1)


# ── FA 시장 ───────────────────────────────────────────────────

## ⚠ **제안을 만드는 곳이 04에 없다.** 없는 선택지를 지어내지 않는다 —
## 지금은 기다리는 길만 준다. 그래도 대기줄은 풀려야 한다
func test_an_empty_fa_market_still_lets_me_move_on() -> void:
	var s: Dictionary = _state({"contract_years": 0})
	Pending.push_once(s, {"type": "fa_market"})
	var vm: Dictionary = DecisionVm.build(s)
	assert_str(String(vm["body"])).contains("없습니다")
	assert_array(_ids(vm)).is_equal(["wait"])

	assert_bool(DecisionVm.apply(s, "wait", 300)).is_true()
	assert_bool(Pending.has(s, "fa_market")).override_failure_message(
		"기다린다고 했는데 FA가 대기줄에 남았다").is_false()


## 제안이 생기면 그걸 고를 수 있다 — 만드는 곳이 붙었을 때를 위해
func test_an_offer_can_be_signed() -> void:
	var s: Dictionary = _state({"contract_years": 0})
	s["fa_offers"] = [{"team_id": "TEAM_KBL_B", "league_id": "LEAGUE_KBL",
		"salary": 24000, "duration_years": 3, "signing_bonus": 5000}]
	Pending.push_once(s, {"type": "fa_market"})

	assert_str(String(DecisionVm.build(s)["body"])).contains("1건")
	assert_bool(DecisionVm.apply(s, "offer:0", 300)).is_true()
	assert_int(int(s[ContractDecision.NEXT_KEY]["salary"])
		).override_failure_message("보여준 연봉과 다르게 계약됐다").is_equal(24000)


func test_a_bogus_offer_index_is_refused() -> void:
	var s: Dictionary = _state({"contract_years": 0})
	Pending.push_once(s, {"type": "fa_market"})
	assert_bool(DecisionVm.apply(s, "offer:7", 300)).is_false()


# ── 화면 ──────────────────────────────────────────────────────

func _open(s: Dictionary) -> DecisionScreen:
	var screen: DecisionScreen = SCREEN.instantiate()
	screen.set_view_model(DecisionVm.build(s))
	add_child(screen)
	await await_idle_frame()
	return screen


func test_the_screen_shows_the_choices() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	var text: String = "\n".join(_texts(await _open(s)))
	assert_str(text).contains("지명 통보")
	assert_str(text).contains("계약한다")
	assert_str(text).contains("거부한다")


## ⚠ **다시 그려도 버튼이 안 쌓인다** — 결정은 줄줄이 온다
func test_redrawing_does_not_pile_up_buttons() -> void:
	var s: Dictionary = _state()
	_drafted(s)
	var screen: DecisionScreen = await _open(s)
	var box: VBoxContainer = screen.get_node("Pad/Center/Col/Scroll/Choices")
	var before: int = box.get_child_count()
	screen.set_view_model(DecisionVm.build(s))
	await await_idle_frame()
	assert_int(box.get_child_count()).is_equal(before)


## ⚠ **여러 개 고르는 화면은 켠 것을 id에 담아 올린다** — 화면이 상태를
## 들고 있으면 다시 그릴 때 고른 게 사라진다
func test_the_many_screen_sends_what_was_ticked() -> void:
	var s: Dictionary = _state({"career_stage": "highschool"})
	Pending.push_once(s, {"type": "career_choice_hub"})
	var screen: DecisionScreen = await _open(s)

	var got: Array = []
	screen.chosen.connect(func(id: String) -> void: got.append(id))
	var box: VBoxContainer = screen.get_node("Pad/Center/Col/Scroll/Choices")
	for c in box.get_children():
		if c is CheckBox and String(c.get_meta("choice_id")) == "draft":
			(c as CheckBox).button_pressed = true
	for c in box.get_children():
		if c is Button and not (c is CheckBox):
			(c as Button).pressed.emit()
	await await_idle_frame()

	assert_array(got).is_not_empty()
	assert_str(String(got[0])).override_failure_message(
		"켠 것이 안 담겼다: %s" % got).contains("draft")


func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string(
		"res://ui/screens/decision_screen.gd")
	# 배선표는 `DecisionVm.apply` 하나다
	assert_str(src).not_contains("CareerDecision")
	assert_str(src).not_contains("ContractDecision")
	assert_str(src).not_contains("Pending.")


# ── 배선 ──────────────────────────────────────────────────────

func _app(s: Dictionary) -> AppRoot:
	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	r._open_decision()
	await await_idle_frame()
	return r


func _press(r: Node, needle: String) -> void:
	for b in r.find_children("*", "Button", true, false):
		if String((b as Button).text).contains(needle):
			(b as Button).pressed.emit()
			await await_idle_frame()
			await await_idle_frame()
			return
	fail("'%s' 버튼을 못 찾았다" % needle)


func test_choosing_reaches_the_state() -> void:
	var s: Dictionary = _state()
	_traded(s)
	var r: AppRoot = await _app(s)
	await _press(r, "받아들인다")
	assert_str(String(r.state()["protagonist"]["team_id"])).is_equal("TEAM_KBL_B")


## ⚠ **결정은 줄줄이 온다.** 하나 답하고 화면을 닫으면 다음 것이 대기줄에
## 남은 채로 진행이 막힌다 — 남아 있으면 그 자리에서 다음 것을 묻는다
func test_the_next_decision_takes_over_the_same_screen() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "draft_observe"})
	_drafted(s)
	var r: AppRoot = await _app(s)

	await _press(r, "지켜본다")
	assert_object(r.decision_screen()).override_failure_message(
		"다음 결정이 남았는데 화면을 닫았다").is_not_null()
	assert_str("\n".join(_texts(r))).contains("지명 통보")


func test_the_screen_closes_when_the_queue_empties() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "draft_observe"})
	var r: AppRoot = await _app(s)
	await _press(r, "지켜본다")
	assert_object(r.decision_screen()).override_failure_message(
		"다 답했는데 화면이 안 닫혔다").is_null()


## ⚠ **진행하다 결정이 생기면 그때 뜬다** — 띄우는 자리가 없으면
## 자동 진행이 그 자리에서 영영 안 풀린다
func test_advancing_opens_the_decision() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	Pending.push_once(s, {"type": "draft_observe"})

	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	assert_object(r.decision_screen()).is_null()

	await r.advance(1)
	await await_idle_frame()
	assert_object(r.decision_screen()).override_failure_message(
		"결정이 생겼는데 화면이 안 떴다").is_not_null()
