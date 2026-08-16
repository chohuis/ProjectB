extends GdUnitTestSuite

## 계약 협상 — F-2. **04는 "계약한다 / 거절한다" 둘뿐이었다.**
##
## 구단이 부른 금액을 그대로 받거나 걷어차는 것 말고 할 수 있는 게 없었다 —
## **협상이 아니라 통보다.** 02는 연봉 ±20% · 기간 · 노트레이드 ·
## 구단/선수 옵션 · 수락 가능성 · 역제안이 있다.
##
## 원본: `features/contract/ui/ContractNegotiationModal.svelte:58-88`


func _action(over: Dictionary = {}) -> Dictionary:
	var a: Dictionary = {
		"type": "salary_negotiation",
		"team_id": "TEAM_KBL_SEOUL_ROYALS_1", "league_id": "LEAGUE_KBL",
		"offered_salary": 20000, "duration_years": 2,
		"min_duration_years": 1, "max_duration_years": 3,
		"signing_bonus": 5000, "context": "renewal",
	}
	a.merge(over, true)
	return a


func _terms(over: Dictionary = {}) -> Dictionary:
	var t: Dictionary = {"ratio": 0.0, "duration_years": 2, "base_duration": 2,
		"no_trade": false, "team_option": 0, "player_option": 0}
	t.merge(over, true)
	return t


# ── 구단이 실제로 낼 수 있는 금액 ─────────────────────────────

## ⚠ **제시액 자체가 아니다.** 사이가 좋고 지갑이 열린 구단은 적힌 금액보다
## 더 낼 수 있고, 그 여지가 협상의 폭이다 — 02 `ownerMult`
func test_the_effective_offer_takes_relation_and_budget() -> void:
	assert_int(Negotiation.effective_offer(20000, 0.0, 1.0)).is_equal(20000)
	# 관계 +10% · 예산 1.2 → 20000 * 1.1 * 1.2 = 26400
	assert_int(Negotiation.effective_offer(20000, 0.1, 1.2)).is_equal(26400)


## ⚠ **100만원 단위로 끊는다** — 02 `Math.round(x / 100) * 100`
func test_money_is_rounded_to_the_unit() -> void:
	assert_int(Negotiation.round_money(12345.0) % Negotiation.ROUND_UNIT).is_equal(0)
	assert_int(Negotiation.round_money(12345.0)).is_equal(12300)
	assert_int(Negotiation.round_money(12350.0)).is_equal(12400)


# ── 얼마까지 부를 수 있나 ─────────────────────────────────────

## 슬라이더 폭은 ±20%다
func test_the_slider_spans_twenty_percent() -> void:
	assert_float(Negotiation.RATIO_MIN).is_equal(-0.2)
	assert_float(Negotiation.RATIO_MAX).is_equal(0.2)
	assert_int(Negotiation.requested(20000, 0.2)).is_equal(24000)
	assert_int(Negotiation.requested(20000, -0.2)).is_equal(16000)


## ⚠ **폭을 벗어난 값은 가둔다.** 안 가두면 화면이 어떤 값을 보내든
## 그대로 통과한다
func test_the_ratio_is_clamped() -> void:
	assert_int(Negotiation.requested(20000, 5.0)).is_equal(
		Negotiation.requested(20000, Negotiation.RATIO_MAX))
	assert_int(Negotiation.requested(20000, -5.0)).is_equal(
		Negotiation.requested(20000, Negotiation.RATIO_MIN))


# ── 구단이 받아 주는 선 ───────────────────────────────────────

## 기본은 제시액의 1.15배다
func test_the_threshold_is_fifteen_percent_over() -> void:
	assert_int(Negotiation.threshold(20000, _terms())).is_equal(23000)


## ⚠ **길게 묶을수록 구단이 깐깐하다** — 한 해당 3%
func test_a_longer_deal_raises_the_bar() -> void:
	var base: int = Negotiation.threshold(20000, _terms())
	var longer: int = Negotiation.threshold(20000,
		_terms({"duration_years": 4}))
	# 2년 늘었으니 1.15 * (1 + 2*0.03) = 1.219 → 24380
	assert_int(longer).is_equal(24380)
	assert_int(longer).is_greater(base)


## 짧게 가면 문턱이 내려간다
func test_a_shorter_deal_lowers_the_bar() -> void:
	assert_int(Negotiation.threshold(20000, _terms({"duration_years": 1}))
		).is_less(Negotiation.threshold(20000, _terms()))


## ⚠ **노트레이드는 구단이 싫어한다** — 그만큼 덜 준다
func test_a_no_trade_clause_costs_money() -> void:
	assert_int(Negotiation.threshold(20000, _terms({"no_trade": true}))
		).is_less(Negotiation.threshold(20000, _terms()))


## ⚠ **구단 옵션은 구단에 유리하니 더 준다. 선수 옵션은 반대다.**
## 방향이 뒤집히면 협상이 거꾸로 돈다
func test_the_option_years_move_in_opposite_directions() -> void:
	var base: int = Negotiation.threshold(20000, _terms())
	assert_int(Negotiation.threshold(20000, _terms({"team_option": 2}))
		).override_failure_message("구단 옵션을 줬는데 문턱이 안 올랐다").is_greater(base)
	assert_int(Negotiation.threshold(20000, _terms({"player_option": 2}))
		).override_failure_message("선수 옵션을 받았는데 문턱이 안 내렸다").is_less(base)


## 옵션 연수는 0~2다 — 벗어난 값이 배열을 넘기면 그 자리에서 죽는다
func test_the_option_years_are_clamped() -> void:
	assert_int(Negotiation.threshold(20000, _terms({"team_option": 9}))
		).is_equal(Negotiation.threshold(20000,
		_terms({"team_option": Negotiation.OPTION_MAX})))


# ── 받아 줄 확률 ──────────────────────────────────────────────

## ⚠ **문턱 안이면 95다.** 100으로 두면 "확실히 된다"가 되어 긴장이 사라진다
func test_inside_the_threshold_is_ninety_five() -> void:
	assert_int(Negotiation.accept_chance(20000, 23000)).is_equal(95)
	assert_int(Negotiation.accept_chance(23000, 23000)).is_equal(95)


## ⚠ **넘기면 가파르게 떨어진다** — 02는 넘긴 비율 × 400이다.
## 5%만 넘겨도 75%가 된다
func test_it_falls_steeply_past_the_threshold() -> void:
	# 23000 * 1.05 = 24150 → over 0.05 → 95 - 20 = 75
	assert_int(Negotiation.accept_chance(24150, 23000)).is_equal(75)
	# 크게 넘기면 0에서 멈춘다 — 음수가 나오면 막대가 뒤집힌다
	assert_int(Negotiation.accept_chance(90000, 23000)).is_equal(0)


## ⚠ **역제안은 문턱 안에서만.** 넘겨도 낼 수 있으면 문턱이 뜻을 잃는다
func test_a_counter_needs_to_be_inside_the_threshold() -> void:
	assert_bool(Negotiation.can_counter(23000, 23000)).is_true()
	assert_bool(Negotiation.can_counter(23001, 23000)).is_false()


# ── 화면이 받는 한 벌 ─────────────────────────────────────────

func test_the_bundle_has_what_the_screen_needs() -> void:
	var vm: Dictionary = Negotiation.build(_action(), _terms(), 0.0, 1.0, 22000)
	assert_int(int(vm["effective"])).is_equal(20000)
	assert_int(int(vm["requested"])).is_equal(20000)
	assert_int(int(vm["threshold"])).is_equal(23000)
	assert_int(int(vm["accept_chance"])).is_equal(95)
	assert_bool(vm["can_counter"]).is_true()
	# 총액 = 20000 * 2년 + 계약금 5000
	assert_int(int(vm["total_value"])).is_equal(45000)
	# 시장가 22000 대비 91%
	assert_int(int(vm["market_ratio_pct"])).is_equal(91)


## ⚠ **시장가가 없으면 100%로 본다.** 0으로 나누면 그 자리에서 죽는다
func test_no_market_price_reads_as_par() -> void:
	assert_int(Negotiation.market_ratio_pct(20000, 0)).is_equal(100)


## ⚠ **구단주 성향이 협상 폭을 넓힌다.** F-7에서 살린 `budget` 계수가
## 여기서도 쓰인다 — 지갑을 여는 구단이면 같은 비율로도 더 받는다
func test_a_generous_owner_widens_the_room() -> void:
	var tight: Dictionary = Negotiation.build(_action(), _terms({"ratio": 0.2}),
		0.0, 0.85, 22000)
	var rich: Dictionary = Negotiation.build(_action(), _terms({"ratio": 0.2}),
		0.0, 1.20, 22000)
	assert_int(int(rich["requested"])).is_greater(int(tight["requested"]))
	# ⚠ **문턱도 같이 올라간다.** 안 그러면 "더 주는데 더 짜다"가 된다
	assert_int(int(rich["threshold"])).override_failure_message(
		"제시액만 오르고 문턱이 그대로다 — 더 주는데 더 짠 구단이 된다"
		).is_greater(int(tight["threshold"]))
	assert_int(int(rich["accept_chance"])).is_equal(int(tight["accept_chance"]))
