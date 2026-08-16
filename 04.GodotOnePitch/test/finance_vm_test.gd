extends GdUnitTestSuite

## 재정 화면 ViewModel — C-4.
##
## 원본: `pages/finance/FinancePage.svelte`
##
## ⚠ **여기서 계산하지 않는다.** 02는 이 화면이 컴포넌트 안에서 OVR·사기로
## 수입을 즉석 계산했고, 그 숫자가 **실제 `money`와 아무 관계가 없었다.**
##
## ⚠ **이 화면이 스폰서 계약과 구독을 쓰는 쪽이다.** 04는 둘 다 읽는 코드만
## 있고 세우는 데가 없어서, 스폰서는 한 건도 안 생기고 구독은 영영 빈 배열이었다.


func _state(over: Dictionary = {}, p_over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "league_id": "LEAGUE_HIGHSCHOOL", "career_stage": "highschool",
		"money": 500, "fame": 0.0, "salary": 0, "team_id": "T1",
	}
	p.merge(p_over, true)
	var s: Dictionary = {"season_year": 2030, "day": 7, "protagonist": p}
	s.merge(over, true)
	return s


func _pro(over: Dictionary = {}, p_over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"league_id": "LEAGUE_KBL", "career_stage": "pro",
		"salary": 10000, "fame": 80.0, "money": 20000}
	p.merge(p_over, true)
	return _state(over, p)


func _labels(rows: Array) -> Dictionary:
	var out: Dictionary = {}
	for r in rows:
		out[String(r["label"])] = String(r["value"])
	return out


func _area(vm: Dictionary, area_id: String) -> Dictionary:
	for r in vm["training"]["rows"]:
		if String(r["area_id"]) == area_id:
			return r
	return {}


# ── 돈을 사람이 읽게 ──────────────────────────────────────────

## 02 `won()` 그대로 — **1억(10,000만원)부터는 억으로**
func test_money_reads_as_korean() -> void:
	assert_str(FinanceVm.won(500)).is_equal("500만")
	assert_str(FinanceVm.won(10000)).is_equal("1억")
	assert_str(FinanceVm.won(25000)).is_equal("2.50억")
	assert_str(FinanceVm.won(0)).is_equal("0만")


## 마이너스도 억으로 읽는다 — 부호를 잃으면 빚이 재산으로 보인다
func test_negative_money_keeps_its_sign() -> void:
	assert_str(FinanceVm.won(-12000)).contains("-")
	assert_str(FinanceVm.signed_won(-30)).is_equal("-30만")
	assert_str(FinanceVm.signed_won(30)).is_equal("+30만")


# ── 개요 ──────────────────────────────────────────────────────

func test_it_shows_the_stage_and_the_cash() -> void:
	var vm: Dictionary = FinanceVm.build(_state())
	assert_str(String(vm["stage_label"])).is_equal("고등학교")
	assert_str(String(vm["money_label"])).is_equal("500만원")


func test_a_pro_is_labelled_pro() -> void:
	assert_str(String(FinanceVm.build(_pro())["stage_label"])).is_equal("프로")


func test_the_kpis_are_all_there() -> void:
	var k: Dictionary = _labels(FinanceVm.build(_pro())["kpi"])
	for label in ["보유 자산", "주간 순현금", "연 총수입", "실효 세율",
			"명성", "스폰서 계약"]:
		assert_bool(k.has(String(label))).override_failure_message(
			"%s가 없다" % label).is_true()


## ⚠ **순현금이 마이너스면 그게 제일 먼저 보여야 한다**
func test_a_negative_week_is_marked_down() -> void:
	var vm: Dictionary = FinanceVm.build(_state({},
		{"treatment_weekly": 9999}))
	for k in vm["kpi"]:
		if String(k["label"]) == "주간 순현금":
			assert_str(String(k["tone"])).is_equal("down")
			assert_str(String(k["value"])).contains("-")


func test_a_student_is_untaxed() -> void:
	var k: Dictionary = _labels(FinanceVm.build(_state())["kpi"])
	assert_str(String(k["실효 세율"])).is_equal("비과세")


func test_a_pro_pays_tax() -> void:
	var k: Dictionary = _labels(FinanceVm.build(_pro())["kpi"])
	assert_str(String(k["실효 세율"])).override_failure_message(
		"프로인데 비과세로 뜬다").contains("%")


# ── 원장 ──────────────────────────────────────────────────────

## ⚠ **세금이 어디로 갔는지 말해 준다.** 안 쓰면 "왜 연봉보다 적게 들어오지"가 된다
func test_the_ledger_explains_the_tax() -> void:
	assert_str(String(FinanceVm.build(_pro())["ledger"]["note"])).contains("원천징수")
	assert_str(String(FinanceVm.build(_state())["ledger"]["note"])).contains("과세하지")


func test_the_ledger_lists_income_and_expense() -> void:
	var l: Dictionary = FinanceVm.build(_pro())["ledger"]
	var income: String = JSON.stringify(l["income"])
	assert_str(income).contains("연봉")
	assert_str(JSON.stringify(l["expense"])).contains("세금")


## ⚠ **계약이 있으면 프로다.** `career_stage`는 04에서 늘 채워지지 않는다 —
## 리그를 안 보면 프로 연봉이 수입에서 통째로 사라진다
func test_a_contract_makes_you_pro_even_without_a_stage_field() -> void:
	var vm: Dictionary = FinanceVm.build(_state({}, {
		"league_id": "LEAGUE_KBL", "salary": 10000, "money": 20000}))
	assert_str(String(vm["stage_label"])).is_equal("프로")
	assert_str(JSON.stringify(vm["ledger"]["income"])).override_failure_message(
		"계약이 있는데 연봉이 수입에 없다").contains("연봉")


## ⚠ **끝난 계약은 수입에서도 빠진다.** 목록에서만 빼면 스폰서는 없는데
## 주간 수입에는 남아 있는 상태가 된다 — 조용한 어긋남이다
func test_an_expired_sponsor_leaves_the_income_too() -> void:
	var vm: Dictionary = FinanceVm.build(_pro({}, {"sponsors": [
		{"category_id": "LOCAL", "name": "지난 계약", "annual": 5000,
			"until_season": 2029}]}))
	assert_str(JSON.stringify(vm["ledger"]["income"])).override_failure_message(
		"끝난 계약이 아직 주간 수입에 들어 있다").not_contains("스폰서")


func test_a_live_sponsor_shows_up_in_the_income() -> void:
	var vm: Dictionary = FinanceVm.build(_pro({}, {"sponsors": [
		{"category_id": "LOCAL", "name": "지역 상공회", "annual": 5000,
			"until_season": 2031}]}))
	assert_str(JSON.stringify(vm["ledger"]["income"])).contains("스폰서")
	assert_str(String(_labels(vm["kpi"])["스폰서 계약"])).override_failure_message(
		"계약이 있는데 0건으로 뜬다").is_equal("1건")


## ⚠ **구독료가 원장에 뜬다.** 안 넘기면 돈은 나가는데 어디로 갔는지가 없다
func test_a_subscription_shows_up_in_the_ledger() -> void:
	var vm: Dictionary = FinanceVm.build(_state(
		{"training_subscriptions": [{"area_id": "PITCH", "tier": 2}]}))
	assert_str(JSON.stringify(vm["ledger"]["expense"])).override_failure_message(
		"구독했는데 주간 지출에 안 뜬다").contains("구독")


func test_an_empty_ledger_says_so() -> void:
	var l: Dictionary = FinanceVm.build(_state({}, {"career_stage": "nowhere",
		"league_id": "LEAGUE_DRAFT_POOL"}))["ledger"]
	assert_str(String(l["income_empty"])).is_not_empty()
	assert_str(String(l["expense_empty"])).is_not_empty()


# ── 자산 추이 ─────────────────────────────────────────────────

## ⚠ **`finance_log`를 읽는 자리가 여기뿐이다** — 매주 쌓기만 하고
## 아무도 안 봤다
func test_the_trend_reads_the_finance_log() -> void:
	var vm: Dictionary = FinanceVm.build(_state({"finance_log": [
		{"day": 7, "net": 10, "money": 510},
		{"day": 14, "net": -5, "money": 505},
	]}))
	assert_bool(vm["trend"]["has"]).is_true()
	assert_int(vm["trend"]["rows"].size()).is_equal(2)


## 최근이 위다 — 이번 주가 제일 궁금하다
func test_the_newest_week_is_first() -> void:
	var vm: Dictionary = FinanceVm.build(_state({"finance_log": [
		{"day": 7, "net": 10, "money": 510},
		{"day": 14, "net": -5, "money": 505},
	]}))
	assert_int(int(vm["trend"]["rows"][0]["week"])).is_equal(2)


func test_a_losing_week_is_marked() -> void:
	var vm: Dictionary = FinanceVm.build(_state({"finance_log": [
		{"day": 7, "net": -5, "money": 495},
	]}))
	assert_bool(vm["trend"]["rows"][0]["down"]).is_true()
	assert_str(String(vm["trend"]["rows"][0]["net"])).contains("-")


## ⚠ **"최근 N주"라고 썼으면 N주치를 재야 한다.** `money`는 그 주가 끝난
## 뒤의 값이라 첫 줄을 기준으로 삼으면 한 주가 빠진다 — 띄워 보고 알았다
## (주당 +152만인데 8주에 +1064만이라고 떴다. 8×152는 1216이다)
func test_the_trend_total_covers_every_week_it_names() -> void:
	var log: Array = []
	for i in range(1, 9):
		log.append({"day": i * 7, "net": 152, "money": 34000 + 152 * i})
	var tr: Dictionary = FinanceVm.build(_state({"finance_log": log}))["trend"]
	assert_str(String(tr["note"])).contains("8주")
	assert_str(String(tr["note"])).override_failure_message(
		"8주라고 써 놓고 %s를 잰다 — 8 × 152 = 1216이다" % tr["note"]
		).contains("+1216만")


func test_an_empty_log_says_so() -> void:
	var vm: Dictionary = FinanceVm.build(_state())
	assert_bool(vm["trend"]["has"]).is_false()
	assert_str(String(vm["trend"]["note"])).contains("아직")


## ⚠ **한 시즌치만 보여준다.** 은퇴 무렵이면 천 주가 넘는다
func test_the_trend_is_capped_to_a_season() -> void:
	var log: Array = []
	for i in range(1, 200):
		log.append({"day": i * 7, "net": 1, "money": 500 + i})
	var vm: Dictionary = FinanceVm.build(_state({"finance_log": log}))
	assert_int(vm["trend"]["rows"].size()).is_equal(FinanceVm.TREND_WEEKS)


# ── 스폰서 ────────────────────────────────────────────────────

## ⚠ **학생·독립에는 스폰서가 안 붙는다** — 아마추어 규정이다.
## 그 이유를 말해야 "왜 아무 제안도 없지"가 안 된다
func test_an_amateur_is_told_why_there_are_no_offers() -> void:
	var sp: Dictionary = FinanceVm.build(_state())["sponsor"]
	assert_array(sp["offers"]).is_empty()
	assert_str(String(sp["note"])).contains("아마추어")


func test_a_famous_pro_gets_offers() -> void:
	var sp: Dictionary = FinanceVm.build(_pro())["sponsor"]
	assert_array(sp["offers"]).override_failure_message(
		"명성 80인 프로에게 제안이 하나도 없다").is_not_empty()


## 제안이 없으면 문턱을 알려준다 — 얼마나 더 유명해져야 하는지
func test_an_unknown_pro_is_told_the_threshold() -> void:
	var sp: Dictionary = FinanceVm.build(_pro({}, {"fame": 0.0}))["sponsor"]
	assert_array(sp["offers"]).is_empty()
	assert_str(String(sp["note"])).contains("명성 10")


func test_a_signed_contract_is_listed() -> void:
	var sp: Dictionary = FinanceVm.build(_pro({}, {"sponsors": [
		{"category_id": "LOCAL", "name": "지역 상공회", "annual": 300,
			"until_season": 2031}]}))["sponsor"]
	assert_int(sp["active"].size()).is_equal(1)
	assert_str(String(sp["active"][0]["name"])).is_equal("지역 상공회")
	assert_str(String(sp["annual_label"])).contains("300만")


## ⚠ **끝난 계약은 목록에서도 합계에서도 빠진다.** 합계를 따로 들고 있으면
## 계약이 끝난 해에 수입만 그대로 남는다
func test_an_expired_contract_drops_out() -> void:
	var sp: Dictionary = FinanceVm.build(_pro({}, {"sponsors": [
		{"category_id": "LOCAL", "name": "지난 계약", "annual": 300,
			"until_season": 2029}]}))["sponsor"]
	assert_array(sp["active"]).is_empty()
	assert_str(String(sp["annual_label"])).contains("0만")


## 이미 계약한 카테고리는 다시 제안하지 않는다
func test_a_signed_category_is_not_offered_again() -> void:
	var sp: Dictionary = FinanceVm.build(_pro({}, {"sponsors": [
		{"category_id": "LOCAL", "name": "지역 상공회", "annual": 300,
			"until_season": 2031}]}))["sponsor"]
	for o in sp["offers"]:
		assert_str(String(o["category_id"])).override_failure_message(
			"이미 계약한 카테고리를 또 제안한다").is_not_equal("LOCAL")


func test_an_empty_sponsor_list_says_so() -> void:
	assert_str(String(FinanceVm.build(_pro())["sponsor"]["active_empty"])
		).is_not_empty()


# ── 개인 트레이닝 ─────────────────────────────────────────────

func test_every_area_is_listed() -> void:
	var vm: Dictionary = FinanceVm.build(_state())
	assert_int(vm["training"]["rows"].size()).is_equal(
		Finance.training_areas().size())


func test_an_unsubscribed_area_says_so() -> void:
	var row: Dictionary = _area(FinanceVm.build(_state()), "PITCH")
	assert_str(String(row["tier_label"])).is_equal("미구독")
	assert_str(String(row["action"])).is_equal("구독")
	assert_str(String(row["effect"])).is_empty()


## ⚠ **버튼 글자가 다음에 무슨 일이 나는지를 말해야 한다** —
## 누를 때마다 단계가 오르고 마지막에서 누르면 해지다
func test_the_button_says_what_happens_next() -> void:
	var one: Dictionary = _area(FinanceVm.build(_state(
		{"training_subscriptions": [{"area_id": "PITCH", "tier": 1}]})), "PITCH")
	assert_str(String(one["action"])).is_equal("상향")

	var two: Dictionary = _area(FinanceVm.build(_state(
		{"training_subscriptions": [{"area_id": "PITCH", "tier": 2}]})), "PITCH")
	assert_str(String(two["action"])).is_equal("해지")


func test_the_next_tier_cycles_and_wraps() -> void:
	assert_int(FinanceVm.next_tier([], "PITCH")).is_equal(1)
	assert_int(FinanceVm.next_tier([{"area_id": "PITCH", "tier": 1}], "PITCH")
		).is_equal(2)
	assert_int(FinanceVm.next_tier([{"area_id": "PITCH", "tier": 2}], "PITCH")
		).override_failure_message("마지막 단계에서 눌러도 해지가 안 된다").is_equal(0)


func test_a_subscription_shows_its_effect_and_cost() -> void:
	var row: Dictionary = _area(FinanceVm.build(_state(
		{"training_subscriptions": [{"area_id": "PITCH", "tier": 2}]})), "PITCH")
	assert_str(String(row["tier_label"])).is_equal("상시")
	assert_str(String(row["effect"])).contains("효율")
	assert_str(String(row["effect"])).contains("40만")


func test_the_weekly_cost_is_summed() -> void:
	var t: Dictionary = FinanceVm.build(_state(
		{"training_subscriptions": [
			{"area_id": "PITCH", "tier": 2},
			{"area_id": "MENTAL", "tier": 1}]}))["training"]
	assert_str(String(t["weekly_cost"])).contains("55만")
	assert_str(String(t["note"])).contains("순현금")


## ⚠ **시설이 열악할수록 사비가 크게 먹힌다** — 약팀 지명이 순수한
## 페널티로만 남지 않게 하는 장치라 화면이 그걸 말해야 한다
func test_a_poor_facility_is_explained() -> void:
	var poor: String = String(FinanceVm.build(_state({},
		{"team_facility": 0.5}))["training"]["facility_note"])
	var rich: String = String(FinanceVm.build(_state({},
		{"team_facility": 1.5}))["training"]["facility_note"])
	assert_str(poor).contains("열악")
	assert_str(rich).contains("줄어")


func test_a_neutral_facility_says_nothing() -> void:
	assert_str(String(FinanceVm.build(_state({},
		{"team_facility": 1.0}))["training"]["facility_note"])).is_empty()


# ── 진짜 세계 ─────────────────────────────────────────────────

## ⚠ **손으로 만든 사전은 결함을 숨긴다.** 진짜로 몇 주를 돌려
## `finance_log`가 쌓이고 화면이 그걸 읽는지 본다
func test_a_real_run_fills_the_trend() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var r: AppRoot = auto_free(preload("res://ui/app_root.tscn").instantiate())
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	for w in range(1, 6):
		WeekRunner.run(r.state(), w * 7)

	var vm: Dictionary = FinanceVm.build(r.state())
	assert_bool(vm["trend"]["has"]).override_failure_message(
		"다섯 주를 돌렸는데 재정 화면에 아무것도 없다").is_true()
	assert_int(vm["trend"]["rows"].size()).is_equal(5)
