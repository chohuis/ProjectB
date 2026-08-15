extends GdUnitTestSuite

## 개인 재정 — 수입·세금·스폰서·구독·투자·소비. B-5.
##
## ⚠ **단위는 전부 만원이다.** 02는 치료비만 원 단위라 보존 치료 한 주에
## 자산이 0이 됐다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _sub(area: String, tier: int) -> Dictionary:
	return {"area_id": area, "tier": tier}


func _line(lines: Array, label: String) -> int:
	for l in lines:
		if String(l["label"]) == label:
			return int(l["amount"])
	return -1


func _sum(lines: Array) -> int:
	var n: int = 0
	for l in lines:
		n += int(l["amount"])
	return n


## ⚠ **적힌 줄과 합계가 맞아야 한다.** 어긋나면 화면은 그럴듯한데 자산이
## 다르게 움직인다 — 오류도 로그도 안 난다
func _assert_books_balance(out: Dictionary) -> void:
	assert_int(int(out["gross_weekly"])).override_failure_message(
		"수입 줄의 합(%d)이 총수입(%d)과 다르다"
		% [_sum(out["income"]), out["gross_weekly"]]).is_equal(_sum(out["income"]))
	assert_int(int(out["expense_weekly"])).override_failure_message(
		"지출 줄의 합(%d)이 총지출(%d)과 다르다"
		% [_sum(out["expense"]), out["expense_weekly"]]).is_equal(
		_sum(out["expense"]))
	assert_int(int(out["net_weekly"])).override_failure_message(
		"순현금이 수입−지출과 다르다").is_equal(
		int(out["gross_weekly"]) - int(out["expense_weekly"]))


# ── 무대 ──────────────────────────────────────────────────────

func test_the_stages_are_loaded() -> void:
	for key in ["highschool", "university", "military", "independent", "pro"]:
		assert_dict(Finance.stage_of(key)).override_failure_message(
			"%s 무대가 없다" % key).is_not_empty()
	# 프로 리그 이름이 뭐든 pro 표를 쓴다
	assert_dict(Finance.stage_of("pro_kbl")).is_equal(Finance.stage_of("pro"))
	assert_dict(Finance.stage_of("nowhere")).is_empty()


## ⚠ **군 급여는 병장 봉급 수준이다.** 프로 최저연봉을 쓰면 안 된다
func test_the_military_pay_is_a_soldiers_pay() -> void:
	var military: int = int(Finance.stage_of("military")["income"])
	var pro_min: int = int(Finance.rules()["sponsor"]["min_salary_base"])
	assert_int(military * 12).override_failure_message(
		"군 연 급여가 프로 최저연봉(%d)만큼이다" % pro_min).is_less(pro_min)


## 프로만 연봉을 받는다 — 학생 무대는 용돈이다
func test_only_a_pro_has_a_salary() -> void:
	assert_bool(Finance.is_pro("pro_kbl")).is_true()
	assert_bool(Finance.is_pro("independent")).override_failure_message(
		"독립리그를 프로로 셌다").is_false()
	assert_bool(Finance.is_student("military")).is_true()
	assert_bool(Finance.is_student("independent")).override_failure_message(
		"독립리그를 학생으로 셌다").is_false()


# ── 세금 ──────────────────────────────────────────────────────

## ⚠ **누진세다.** 단일세율로 만들면 연봉이 1만원 오를 때 실수령이 줄어드는
## 구간이 생기고, 그건 규칙이 아니라 결함으로 읽힌다
func test_the_take_home_never_goes_down() -> void:
	var last: int = -1
	for gross in range(0, 30000, 137):
		var net: int = gross - Finance.annual_tax(gross)
		assert_int(net).override_failure_message(
			"연봉 %d에서 실수령이 줄었다 — 누진이 아니다" % gross).is_greater_equal(last)
		last = net


## 구간을 넘어도 전액에 높은 세율이 안 붙는다
func test_crossing_a_bracket_taxes_only_the_excess() -> void:
	# 1,200까지 6% → 1,200이면 72
	assert_int(Finance.annual_tax(1200)).is_equal(72)
	# 1,201이면 72 + 1×15% = 72.15 → 72
	assert_int(Finance.annual_tax(1201)).override_failure_message(
		"구간을 넘자 전액에 15%가 붙었다").is_equal(72)
	# 4,600이면 72 + 3,400×15% = 582
	assert_int(Finance.annual_tax(4600)).is_equal(582)


func test_no_income_no_tax() -> void:
	assert_int(Finance.annual_tax(0)).is_equal(0)
	assert_int(Finance.annual_tax(-500)).is_equal(0)
	assert_int(Finance.other_income_tax(0)).is_equal(0)


## 최고구간은 상한이 없다 — `until 0`이 그 표시다
func test_the_top_bracket_has_no_ceiling() -> void:
	var a: int = Finance.annual_tax(50000)
	var b: int = Finance.annual_tax(100000)
	assert_int(b).override_failure_message(
		"연봉이 두 배인데 세금이 안 늘었다").is_greater(a)


## ⚠ **기타소득은 분리과세다.** 합산하면 5억 계약금을 받은 신인이 그해
## 최고세율을 맞고 파산한다
func test_other_income_is_taxed_separately() -> void:
	var rate: float = float(Finance.rules()["tax"]["other_income_rate"])
	assert_int(Finance.other_income_tax(50000)).is_equal(
		int(roundf(50000.0 * rate)))
	# 누진 최고세율보다 낮다
	assert_int(Finance.other_income_tax(50000)).override_failure_message(
		"계약금에 누진 최고세율이 붙었다").is_less(Finance.annual_tax(50000))


# ── 주간 재정 ─────────────────────────────────────────────────

## 고교생은 용돈을 받고 세금을 안 낸다
func test_a_student_pays_no_tax() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "highschool"})
	assert_int(int(out["tax_weekly"])).override_failure_message(
		"용돈에 세금을 매겼다").is_equal(0)
	assert_int(int(out["gross_weekly"])).is_greater(0)
	assert_int(int(out["net_weekly"])).override_failure_message(
		"고교생이 매주 적자다").is_greater(0)
	assert_int(_line(out["income"], "용돈 + 가족 지원")).is_greater(0)
	assert_int(_line(out["expense"], "생활비")).is_greater(0)


## 프로는 연봉을 주로 나눠 받고 세금을 낸다
func test_a_pro_is_paid_weekly_and_taxed() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "pro",
		"salary": 10400})
	assert_int(_line(out["income"], "연봉(주할)")).override_failure_message(
		"연봉 10,400을 52주로 나누면 200이다").is_equal(200)
	assert_int(int(out["tax_weekly"])).is_greater(0)
	assert_int(_line(out["expense"], "세금(원천징수)")).is_equal(
		int(out["tax_weekly"]))
	assert_float(float(out["effective_tax_rate"])).is_greater(0.0)
	assert_float(float(out["effective_tax_rate"])).is_less(1.0)


## ⚠ **독립리그는 학생이 아니다** — 급여에 세금이 붙는다.
## 다만 연봉이 없으니 세금도 0이다(무대 지원금은 과세 대상이 아니다)
func test_the_independent_league_is_not_a_student() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "independent"})
	assert_int(int(out["gross_weekly"])).is_greater(0)
	assert_int(int(out["net_weekly"])).is_greater(0)


## 스폰서는 수입에 잡히고 분리과세된다
func test_the_sponsor_income_is_separate() -> void:
	var plain: Dictionary = Finance.weekly({"career_stage": "pro",
		"salary": 10400})
	var sponsored: Dictionary = Finance.weekly({"career_stage": "pro",
		"salary": 10400, "sponsor_annual": 5200})
	assert_int(_line(sponsored["income"], "스폰서·광고")).is_equal(100)
	assert_int(int(sponsored["gross_weekly"])).is_greater(
		int(plain["gross_weekly"]))
	# 연봉 세금은 그대로고 기타소득세만 더 붙는다
	assert_int(int(sponsored["tax_annual"]) - int(plain["tax_annual"])) \
		.override_failure_message("스폰서를 연봉에 합산해 세율이 튀었다") \
		.is_equal(Finance.other_income_tax(5200))


## 구독과 치료비가 지출에 잡힌다
func test_the_subscriptions_and_treatment_cost_money() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "pro",
		"salary": 10400, "subscriptions": [_sub("PITCH", 2)],
		"treatment_weekly": 30})
	assert_int(_line(out["expense"], "개인 트레이닝 구독")).is_equal(40)
	assert_int(_line(out["expense"], "부상 치료비")).is_equal(30)


## ⚠ **적힌 줄과 합계가 맞는다.** 어긋나면 화면은 그럴듯한데 자산이 다르게
## 움직이고, 오류도 로그도 안 난다
func test_the_books_balance_in_every_stage() -> void:
	for stage in ["highschool", "university", "military", "independent", "pro"]:
		_assert_books_balance(Finance.weekly({"career_stage": stage,
			"salary": 10400, "sponsor_annual": 2600,
			"subscriptions": [_sub("PITCH", 2), _sub("MENTAL", 1)],
			"treatment_weekly": 25}))


## 지출이 있으면 순현금이 그만큼 줄어든다
func test_an_expense_actually_reduces_the_net() -> void:
	var plain: Dictionary = Finance.weekly({"career_stage": "pro",
		"salary": 10400})
	var spending: Dictionary = Finance.weekly({"career_stage": "pro",
		"salary": 10400, "subscriptions": [_sub("PITCH", 2)],
		"treatment_weekly": 30})
	assert_int(int(spending["net_weekly"])).override_failure_message(
		"구독·치료비를 썼는데 순현금이 그대로다").is_equal(
		int(plain["net_weekly"]) - 70)


## 연 환산에 무대 지원금이 들어간다 — 빠지면 학생은 연수입이 0이다
func test_the_annual_total_includes_the_allowance() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "highschool"})
	assert_int(int(out["gross_annual"])).override_failure_message(
		"고교생 연수입이 %d다 — 월 용돈 × 12여야 한다" % out["gross_annual"]) \
		.is_equal(int(Finance.stage_of("highschool")["income"]) * 12)


## 수입이 없어도 실효세율이 0이다 — 0으로 나누면 NaN이 화면에 뜬다
func test_no_income_no_rate() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "pro"})
	assert_int(int(out["gross_annual"])).is_equal(0)
	assert_float(float(out["effective_tax_rate"])).override_failure_message(
		"수입이 0인데 실효세율이 %f다" % out["effective_tax_rate"]).is_equal(0.0)


## ⚠ **학생 면제가 실제로 걸린다.** 학생에게 광고 수입이 들어와도 과세하지
## 않는다 — 용돈에 세금을 매기면 숫자만 늘고 재미가 없다
func test_the_student_exemption_covers_other_income_too() -> void:
	var student: Dictionary = Finance.weekly({"career_stage": "university",
		"sponsor_annual": 5200})
	assert_int(int(student["tax_annual"])).override_failure_message(
		"학생인데 세금이 붙었다").is_equal(0)
	# 프로였다면 붙었을 액수다
	assert_int(Finance.other_income_tax(5200)).is_greater(0)


## ⚠ **치료비도 만원 단위다.** 02는 이것만 원 단위라 한 주에 자산이 0이 됐다
func test_the_treatment_cost_is_in_the_same_unit() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "highschool",
		"treatment_weekly": 30})
	assert_int(int(out["expense_weekly"])).override_failure_message(
		"치료비가 다른 단위다 — 한 주에 자산이 0이 된다").is_less(100)


## 0인 줄은 안 적는다 — 빈칸이 늘어나면 화면이 안 읽힌다
func test_zero_lines_are_not_listed() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "pro"})
	assert_int(_line(out["income"], "연봉(주할)")).is_equal(-1)
	assert_int(_line(out["income"], "스폰서·광고")).is_equal(-1)
	assert_int(_line(out["expense"], "부상 치료비")).is_equal(-1)


## 학생 무대에는 연봉이 안 붙는다 — 붙으면 고교생이 프로 연봉을 받는다
func test_a_student_salary_is_ignored() -> void:
	var out: Dictionary = Finance.weekly({"career_stage": "highschool",
		"salary": 99999})
	assert_int(_line(out["income"], "연봉(주할)")).override_failure_message(
		"고교생이 연봉을 받았다").is_equal(-1)


# ── 개인 트레이닝 ─────────────────────────────────────────────

## ⚠ **보너스가 팀 자원에 반비례한다.** 약팀에 지명된 게 순수한 페널티로만
## 남지 않게 하는 장치다
func test_a_poor_team_makes_the_subscription_worth_more() -> void:
	var subs: Array = [_sub("PITCH", 2)]
	var rich: float = Finance.total_training_bonus(subs, 1.15)
	var poor: float = Finance.total_training_bonus(subs, 0.85)
	assert_float(poor).override_failure_message(
		"약팀(%.4f)에서 구독이 명문(%.4f)보다 못하다" % [poor, rich]) \
		.is_greater(rich)
	assert_float(Finance.inverse_factor(1.0)).is_equal(1.0)


## ⚠ **반비례에 하한이 있다.** 너무 세면 좋은 팀에 간 순간 구독이
## 무의미해지고 토글 자체가 죽은 UI가 된다
func test_the_inverse_is_clamped() -> void:
	var c: Array = Finance.rules()["training"]["inverse_clamp"]
	assert_float(Finance.inverse_factor(5.0)).is_equal(float(c[0]))
	assert_float(Finance.inverse_factor(-5.0)).is_equal(float(c[1]))


## 단계가 높으면 더 비싸고 더 오른다
func test_a_higher_tier_costs_and_gives_more() -> void:
	assert_int(Finance.subscription_cost([_sub("PITCH", 1)])).is_equal(15)
	assert_int(Finance.subscription_cost([_sub("PITCH", 2)])).is_equal(40)
	assert_float(Finance.total_training_bonus([_sub("PITCH", 2)])) \
		.is_greater(Finance.total_training_bonus([_sub("PITCH", 1)]))


## 모르는 단계는 안 센다
func test_an_unknown_tier_costs_nothing() -> void:
	assert_int(Finance.subscription_cost([_sub("PITCH", 9)])).is_equal(0)
	assert_array(Finance.training_bonus([_sub("PITCH", 9)])["by_area"]).is_empty()


## 여러 분야를 켜면 비용도 보너스도 쌓인다
func test_subscriptions_add_up() -> void:
	var subs: Array = [_sub("PITCH", 2), _sub("PHYSICAL", 2), _sub("MENTAL", 2)]
	assert_int(Finance.subscription_cost(subs)).is_equal(120)
	assert_float(Finance.total_training_bonus(subs)).is_greater(
		Finance.total_training_bonus([_sub("PITCH", 2)]))


## ⚠ **합계 상한이 있다.** 넘으면 "돈으로 성장을 산다"가 지배 루프가 되고
## 야구를 대체하지 않는다는 전제가 깨진다
func test_the_total_bonus_is_capped() -> void:
	var cap: float = float(Finance.rules()["training"]["max_total_bonus"])
	var subs: Array = [_sub("PITCH", 2), _sub("PHYSICAL", 2), _sub("MENTAL", 2)]
	# 약팀이면 반비례가 1.15배라 상한에 걸린다
	assert_float(Finance.total_training_bonus(subs, 0.5)) \
		.override_failure_message("상한을 넘었다").is_less_equal(cap + 0.0001)


## ⚠ **상한이 기능을 지우면 안 된다.** 02는 상한을 0.12로 낮췄더니 3개를 켠
## 순간 모든 팀이 상한에 걸려 **팀 자원 반비례가 통째로 사라졌다**
func test_the_cap_does_not_erase_the_inverse() -> void:
	var subs: Array = [_sub("PITCH", 2), _sub("PHYSICAL", 2), _sub("MENTAL", 2)]
	var rich: float = Finance.total_training_bonus(subs, 1.08)
	var poor: float = Finance.total_training_bonus(subs, 0.85)
	assert_float(poor).override_failure_message(
		"3분야를 다 켜자 팀 자원 반비례가 사라졌다 (명문 %.4f · 약체 %.4f)"
		% [rich, poor]).is_greater(rich)


## 3분야 상시 실측 — 명문 8.2% ~ 독립 13.8% (규칙 파일의 근거)
func test_the_measured_range_holds() -> void:
	var subs: Array = [_sub("PITCH", 2), _sub("PHYSICAL", 2), _sub("MENTAL", 2)]
	assert_float(Finance.total_training_bonus(subs, 1.0)).is_equal_approx(0.12,
		0.001)
	assert_float(Finance.total_training_bonus(subs, 0.85)).is_between(0.13, 0.14)


func test_no_subscription_no_bonus() -> void:
	assert_float(Finance.total_training_bonus([])).is_equal(0.0)
	assert_int(Finance.subscription_cost([])).is_equal(0)


# ── 스폰서 ────────────────────────────────────────────────────

## ⚠ **학생·독립은 제외한다** — 아마추어 규정 위반이다
func test_only_a_pro_gets_a_sponsor() -> void:
	for stage in ["highschool", "university", "military", "independent"]:
		assert_array(Finance.sponsor_offers(99.0, 10000, stage)["offers"]) \
			.override_failure_message("%s에 스폰서가 붙었다" % stage).is_empty()
	assert_array(Finance.sponsor_offers(99.0, 10000, "pro")["offers"]) \
		.is_not_empty()


## 명성 문턱을 넘어야 오퍼가 온다
func test_the_offers_follow_the_fame() -> void:
	assert_array(Finance.sponsor_offers(5.0, 10000, "pro")["offers"]) \
		.override_failure_message("무명인데 광고가 붙었다").is_empty()
	assert_int(Finance.sponsor_offers(35.0, 10000, "pro")["offers"].size()) \
		.is_equal(2)
	assert_int(Finance.sponsor_offers(99.0, 10000, "pro")["offers"].size()) \
		.is_equal(4)


## ⚠ **카테고리 안에서도 선형 보간한다.** 문턱을 겨우 넘은 선수와 한참
## 위인 선수가 같은 돈을 받으면 명성이 계단이 된다
func test_fame_moves_the_money_inside_a_category() -> void:
	var just: Dictionary = Finance.sponsor_offers(10.0, 10000, "pro")
	var well: Dictionary = Finance.sponsor_offers(34.0, 10000, "pro")
	assert_int(int(just["offers"][0]["annual"])).override_failure_message(
		"문턱을 겨우 넘은 선수와 한참 위인 선수가 같은 돈을 받는다") \
		.is_less(int(well["offers"][0]["annual"]))


## ⚠ **상한 — 광고 수입이 연봉을 넘어가면 야구가 부업이 된다**
func test_the_sponsor_total_is_capped() -> void:
	var out: Dictionary = Finance.sponsor_offers(99.0, 10000, "pro")
	var cap: float = float(Finance.rules()["sponsor"]["max_total_pct"])
	assert_int(int(out["total_annual"])).is_less_equal(int(roundf(10000.0 * cap)))
	assert_bool(bool(out["capped"])).is_true()


## 최저연봉 하한 — 2군 신인도 유명하면 광고가 붙는다
func test_a_minimum_wage_player_still_gets_offers() -> void:
	var out: Dictionary = Finance.sponsor_offers(99.0, 0, "pro")
	assert_array(out["offers"]).override_failure_message(
		"연봉이 0이라고 광고가 하나도 안 붙는다").is_not_empty()
	assert_int(int(out["total_annual"])).is_greater(0)


## 이미 계약한 카테고리는 다시 안 온다
func test_a_signed_category_is_not_offered_again() -> void:
	var out: Dictionary = Finance.sponsor_offers(99.0, 10000, "pro", 1.0,
		["LOCAL", "GEAR"])
	for o in out["offers"]:
		assert_str(String(o["category_id"])).is_not_equal("LOCAL")
		assert_str(String(o["category_id"])).is_not_equal("GEAR")
	assert_int(out["offers"].size()).is_equal(2)


## 홍보력 있는 구단이면 오퍼가 후하다 — 폭은 갇힌다
func test_the_club_pr_moves_the_offer() -> void:
	var plain: int = int(Finance.sponsor_offers(30.0, 10000, "pro",
		1.0)["total_annual"])
	var promoted: int = int(Finance.sponsor_offers(30.0, 10000, "pro",
		1.35)["total_annual"])
	assert_int(promoted).is_greater(plain)
	assert_int(int(Finance.sponsor_offers(30.0, 10000, "pro",
		99.0)["total_annual"])).override_failure_message(
		"홍보력 보정 폭이 안 갇혔다").is_equal(promoted)


# ── 투자 ──────────────────────────────────────────────────────

## 생활비도 빠듯한 신인에게 투자 화면을 띄우지 않는다
func test_a_broke_player_sees_no_investment() -> void:
	var floor_cash: int = int(Finance.rules()["investment"]["min_cash"])
	assert_bool(Finance.can_invest(floor_cash - 1, "pro")).is_false()
	assert_bool(Finance.can_invest(floor_cash, "pro")).is_true()
	assert_bool(Finance.can_invest(99999, "highschool")).override_failure_message(
		"고교생에게 투자 화면을 띄웠다").is_false()


## 예금은 확정 수익이다 — 흔들리면 "확정"이 아니다
func test_a_deposit_is_certain() -> void:
	var rates: Dictionary = {}
	for i in 20:
		rates[Finance.resolve_investment("DEPOSIT", 1000, _rng(i))["rate"]] = true
	assert_int(rates.size()).override_failure_message(
		"예금 수익률이 흔들린다").is_equal(1)
	var out: Dictionary = Finance.resolve_investment("DEPOSIT", 1000, _rng(1))
	assert_int(int(out["profit"])).is_equal(30)
	assert_int(int(out["payout"])).is_equal(1030)


## ⚠ **원금 손실을 허용한다** (사용자 확정) — 은퇴 자산에 판단이 반영된다
func test_a_fund_can_lose_money() -> void:
	var losses: int = 0
	var gains: int = 0
	for i in 200:
		var out: Dictionary = Finance.resolve_investment("FUND", 1000, _rng(i))
		if int(out["profit"]) < 0:
			losses += 1
		elif int(out["profit"]) > 0:
			gains += 1
	assert_int(losses).override_failure_message(
		"펀드가 한 번도 손해를 안 본다").is_greater(0)
	assert_int(gains).override_failure_message(
		"펀드가 한 번도 이익을 안 낸다").is_greater(losses)


## ⚠ **전액 소실은 안 만든다** — 세이브 리셋 유도라 재미가 아니라 벌이다
func test_nothing_ever_goes_to_zero() -> void:
	for id in ["FUND", "VENTURE"]:
		var floor_rate: float = float(Finance.investment_option(id)["floor"])
		for i in 300:
			var out: Dictionary = Finance.resolve_investment(id, 1000, _rng(i))
			assert_float(float(out["rate"])).override_failure_message(
				"%s가 하한(%.2f) 아래로 갔다" % [id, floor_rate]) \
				.is_greater_equal(floor_rate)
			assert_int(int(out["payout"])).is_greater(0)


## 위험할수록 폭이 크다
func test_a_riskier_option_swings_wider() -> void:
	var fund: float = 0.0
	var venture: float = 0.0
	for i in 200:
		fund = maxf(fund, absf(float(
			Finance.resolve_investment("FUND", 1000, _rng(i))["rate"]) - 0.08))
		venture = maxf(venture, absf(float(
			Finance.resolve_investment("VENTURE", 1000, _rng(i))["rate"]) - 0.15))
	assert_float(venture).is_greater(fund)


## 모르는 상품은 원금을 그대로 돌려준다 — 삼키면 자산이 조용히 사라진다
func test_an_unknown_option_returns_the_principal() -> void:
	var out: Dictionary = Finance.resolve_investment("NOPE", 1000, _rng(1))
	assert_int(int(out["payout"])).is_equal(1000)
	assert_int(int(out["profit"])).is_equal(0)


# ── 사치품 ────────────────────────────────────────────────────

## 동료에게 쓰면 관계가 오른다 — **밥 몇 번으로 절친이 되지 않는다**
func test_spending_on_a_teammate_buys_goodwill() -> void:
	var out: Dictionary = Finance.luxury(100, true)
	assert_float(float(out["relation_delta"])).is_equal(6.0)
	assert_float(float(out["fame_delta"])).is_equal(0.0)
	# 관계도는 −100~100이다. 100만원 열 번을 써야 60이다
	assert_float(float(Finance.luxury(1000, true)["relation_delta"])).is_equal(60.0)


## ⚠ **자기 소비는 성격에 따라 명성의 부호가 갈린다.** 성실한 선수의
## 씀씀이는 구설이 되고, 과시형에겐 화제가 된다
func test_spending_on_myself_reads_differently_by_character() -> void:
	var split: float = float(
		Finance.rules()["luxury"]["self_fame_split_diligence"])
	var showy: Dictionary = Finance.luxury(1000, false, split - 1.0)
	var diligent: Dictionary = Finance.luxury(1000, false, split)
	assert_float(float(showy["fame_delta"])).override_failure_message(
		"과시형인데 명성이 안 올랐다").is_greater(0.0)
	assert_float(float(diligent["fame_delta"])).override_failure_message(
		"성실형인데 씀씀이가 구설이 안 됐다").is_less(0.0)
	assert_float(absf(float(showy["fame_delta"]))).is_equal(
		absf(float(diligent["fame_delta"])))
	assert_float(float(showy["relation_delta"])).is_equal(0.0)
