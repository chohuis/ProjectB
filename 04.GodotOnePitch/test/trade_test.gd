extends GdUnitTestSuite

## 트레이드 — 제안 생성과 가치 평가. M9-15.
##
## ⚠ **02에서 트레이드가 말라 죽었다** — 9 → 8 → 2 → 1 → 1 → 0.
## 원인은 산식이 아니라 **구단 성향을 아무도 안 갱신한 것**이었다.
## buyer 조건을 전 팀이 구조적으로 못 넘었고, seller만 남으면 상대가 없다.


func _asset(over: Dictionary = {}) -> Dictionary:
	var a: Dictionary = {"id": "P1", "position": "SP", "age": 27, "ovr": 65.0,
		"salary": 5000, "contract_years": 3, "service_years": 6}
	a.merge(over, true)
	return a


func _team(id: String, over: Dictionary = {}) -> Dictionary:
	var t: Dictionary = {"team_id": id, "win_now_pressure": 50.0}
	t.merge(over, true)
	return t


func _profile(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = TeamProfile.DEFAULT.duplicate()
	p.merge(over, true)
	return p


## 그 자리에 n명 — 자리 남음/모자람을 만드는 도구
func _at(pos: String, n: int, prefix: String, ovr: float = 65.0) -> Array:
	var out: Array = []
	for i in n:
		out.append(_asset({"id": "%s%d" % [prefix, i], "position": pos,
			"ovr": ovr + float(i)}))
	return out


func _reasons(proposals: Array) -> Array:
	var out: Array = []
	for p in proposals:
		out.append(String(p["reason"]))
	return out


# ── 유망주 판정 ───────────────────────────────────────────────

## ⚠ **연차로 가른다.** 나이로 가르면 늦게 들어온 사람이 영영 유망주가 아니다
func test_a_prospect_is_measured_by_service_years() -> void:
	assert_bool(Trade.is_prospect(_asset({"service_years": 0}))).is_true()
	assert_bool(Trade.is_prospect(_asset({"service_years": 2}))).is_true()
	assert_bool(Trade.is_prospect(_asset({"service_years": 3}))).is_false()


# ── ① 계약 만료 선점 ──────────────────────────────────────────

## ⚠ **FA로 잃기 전에 바꾼다.** 이 갈래가 없으면 계약 만료 선수가 그냥
## 시장으로 새고 팀은 아무것도 못 받는다
func test_an_expiring_star_is_traded_for_a_prospect() -> void:
	var mine: Array = [_asset({"id": "STAR", "ovr": 85.0, "contract_years": 1})]
	var theirs: Array = [_asset({"id": "KID", "ovr": 60.0, "service_years": 0})]

	var out: Array = Trade.between(_team("A"), _team("B"), mine, theirs,
		"neutral", "neutral")
	assert_array(_reasons(out)).contains(["expiring_contract"])
	for p in out:
		if String(p["reason"]) == "expiring_contract":
			assert_array(p["offering_ids"]).is_equal(["STAR"])
			assert_array(p["requesting_ids"]).is_equal(["KID"])


## 계약이 남아 있으면 안 내놓는다
func test_a_long_contract_is_not_shopped() -> void:
	var mine: Array = [_asset({"id": "STAR", "ovr": 85.0, "contract_years": 3})]
	var theirs: Array = [_asset({"id": "KID", "ovr": 60.0, "service_years": 0})]
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), mine, theirs,
		"neutral", "neutral"))).not_contains(["expiring_contract"])


## 값이 안 맞으면 제안하지 않는다 — 문턱이 없으면 잡선수까지 오간다
func test_a_weak_pair_is_not_worth_proposing() -> void:
	var mine: Array = [_asset({"id": "MEH", "ovr": 40.0, "contract_years": 1})]
	var theirs: Array = [_asset({"id": "KID", "ovr": 55.0, "service_years": 0})]
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), mine, theirs,
		"neutral", "neutral"))).not_contains(["expiring_contract"])


## 상대에 유망주가 없으면 제안이 없다
func test_no_prospect_no_deal() -> void:
	var mine: Array = [_asset({"id": "STAR", "ovr": 85.0, "contract_years": 1})]
	var theirs: Array = [_asset({"id": "VET", "ovr": 80.0, "service_years": 9})]
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), mine, theirs,
		"neutral", "neutral"))).not_contains(["expiring_contract"])


# ── ② 자리 남음/모자람 ────────────────────────────────────────

## ⚠ **모드가 무엇을 요구할지 정한다.** 전 팀이 중립이면 갈래 하나만 돌고
## 그게 02에서 트레이드가 마른 모습이다
func test_a_seller_wants_prospects() -> void:
	var a: Array = _at("SP", 3, "A")
	var b: Array = _at("C", 1, "B")
	b.append(_asset({"id": "KID1", "position": "C", "ovr": 60.0, "service_years": 0}))
	b.append(_asset({"id": "KID2", "position": "C", "ovr": 58.0, "service_years": 0}))

	var out: Array = Trade.between(_team("A"), _team("B"), a, b, "seller", "neutral")
	assert_array(_reasons(out)).contains(["seller_mode"])
	for p in out:
		if String(p["reason"]) == "seller_mode":
			assert_int(p["requesting_ids"].size()).override_failure_message(
				"유망주를 둘 받아야 한다").is_equal(2)


## ⚠ **값이 안 맞으면 제안하지 않는다.** 문턱을 빼면 한쪽이 손해 보는
## 거래가 쏟아지고 상대가 전부 거절한다
func test_a_seller_will_not_give_a_star_for_scraps() -> void:
	var a: Array = _at("SP", 3, "A", 90.0)   # 베테랑 90
	var b: Array = _at("C", 1, "B")
	# 유망주 둘을 합쳐도 (52+52)×0.55 = 57 — 90과 33 차이라 안 맞는다
	b.append(_asset({"id": "K1", "position": "C", "ovr": 52.0, "service_years": 0}))
	b.append(_asset({"id": "K2", "position": "C", "ovr": 52.0, "service_years": 0}))

	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"seller", "neutral"))).override_failure_message(
		"값이 33이나 벌어졌는데 제안했다").not_contains(["seller_mode"])


func test_a_buyer_wants_someone_who_can_play_now() -> void:
	var a: Array = _at("SP", 3, "A")
	var b: Array = [_asset({"id": "NOW", "position": "C", "ovr": 80.0,
		"age": 29, "service_years": 8})]

	var out: Array = Trade.between(_team("A"), _team("B"), a, b, "buyer", "neutral")
	assert_array(_reasons(out)).contains(["buyer_mode"])
	for p in out:
		if String(p["reason"]) == "buyer_mode":
			assert_array(p["requesting_ids"]).is_equal(["NOW"])


## buyer는 유망주를 안 받는다 — 지금 이기려는 팀이다
func test_a_buyer_refuses_prospects() -> void:
	var a: Array = _at("SP", 3, "A")
	var b: Array = [_asset({"id": "KID", "position": "C", "ovr": 80.0,
		"age": 21, "service_years": 0})]
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"buyer", "neutral"))).not_contains(["buyer_mode"])


## ⚠ **buyer에도 문턱이 있다.** 없으면 약한 즉시전력까지 다 요구해서
## 거래가 잡선수 교환으로 뒤덮인다
func test_a_buyer_needs_the_deal_to_be_worth_it() -> void:
	# 내놓는 선수 40 · 받는 선수 66 → 40×0.6 + 66 = 90.0 (문턱 90 초과 아님)
	var a: Array = _at("SP", 3, "A", 40.0)
	var b: Array = [_asset({"id": "OK", "position": "C", "ovr": 66.0,
		"age": 29, "service_years": 8})]
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"buyer", "neutral"))).override_failure_message(
		"점수 90인데 제안했다 — 문턱이 없다").not_contains(["buyer_mode"])


## 나이가 많으면 즉시전력으로 안 본다
func test_a_buyer_refuses_the_old() -> void:
	var a: Array = _at("SP", 3, "A")
	var b: Array = [_asset({"id": "OLD", "position": "C", "ovr": 80.0,
		"age": 36, "service_years": 12})]
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"buyer", "neutral"))).not_contains(["buyer_mode"])


## ⚠ **중립도 거래한다.** 서로 남는 자리를 맞바꾼다 — 이게 없으면 전 팀이
## 중립인 리그에서 거래가 0건이 된다
func test_two_neutral_teams_swap_their_surplus() -> void:
	var a: Array = _at("SP", 3, "A")
	a.append_array(_at("C", 1, "AC"))
	var b: Array = _at("C", 3, "B")
	b.append_array(_at("SP", 1, "BS"))

	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"neutral", "neutral"))).contains(["position_surplus"])


## ⚠ **상대가 남아도는 자리만 요구한다.** 아무 자리나 요구하면 상대의
## 주전을 달라는 제안이 되고 늘 거절당한다
func test_a_neutral_deal_asks_for_their_surplus_only() -> void:
	var a: Array = _at("SP", 3, "A")
	# B는 어느 자리도 남지 않는다 — 요구할 자리가 없어야 한다
	var b: Array = _at("C", 2, "B")
	b.append_array(_at("SP", 1, "BS"))
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"neutral", "neutral"))).override_failure_message(
		"상대에 남는 자리가 없는데 요구했다").not_contains(["position_surplus"])


## ⚠ **중립에도 문턱이 있다.** 없으면 잡선수끼리 계속 오간다
func test_a_neutral_deal_needs_enough_value() -> void:
	# 둘 다 20짜리 — mutual = (20×0.5+20 + 20×0.5+20)/2 = 30 < 60
	var a: Array = _at("SP", 3, "A", 20.0)
	a.append_array(_at("C", 1, "AC", 20.0))
	var b: Array = _at("C", 3, "B", 20.0)
	b.append_array(_at("SP", 1, "BS", 20.0))
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"neutral", "neutral"))).override_failure_message(
		"20짜리끼리 거래했다 — 문턱이 없다").not_contains(["position_surplus"])


## 남는 자리에서 **제일 약한 선수**를 내놓는다 — 주전을 내주면 안 된다
func test_the_weakest_of_the_surplus_is_offered() -> void:
	var a: Array = _at("SP", 3, "A", 60.0)   # A0=60 · A1=61 · A2=62
	var b: Array = _at("C", 3, "B")
	b.append_array(_at("SP", 1, "BS"))

	# ⚠ **양쪽이 서로 제안한다.** A가 낸 것만 봐야 한다 — 안 가리면 B가 낸
	# 제안까지 A 기준으로 재게 된다
	var seen: int = 0
	for p in Trade.between(_team("A"), _team("B"), a, b, "neutral", "neutral"):
		if String(p["reason"]) != "position_surplus":
			continue
		if String(p["from_team_id"]) != "A":
			continue
		seen += 1
		assert_array(p["offering_ids"]).override_failure_message(
			"남는 자리의 주전을 내놨다").is_equal(["A0"])
	assert_int(seen).override_failure_message("A가 낸 제안이 없다").is_greater(0)


## ⚠ **성적 압박이 낮은 팀이 미래를 산다.** buyer는 안 한다
func test_a_rebuilding_team_buys_the_future() -> void:
	var a: Array = _at("SP", 3, "A")
	var b: Array = [
		_asset({"id": "K1", "position": "C", "ovr": 60.0, "service_years": 0}),
		_asset({"id": "K2", "position": "C", "ovr": 58.0, "service_years": 0}),
	]
	var rebuilding: Dictionary = _team("A", {"win_now_pressure": 20.0})

	assert_array(_reasons(Trade.between(rebuilding, _team("B"), a, b,
		"neutral", "neutral"))).contains(["rebuild_bundle"])
	# 압박이 높으면 안 한다
	assert_array(_reasons(Trade.between(_team("A"), _team("B"), a, b,
		"neutral", "neutral"))).not_contains(["rebuild_bundle"])
	# buyer도 안 한다
	assert_array(_reasons(Trade.between(rebuilding, _team("B"), a, b,
		"buyer", "neutral"))).not_contains(["rebuild_bundle"])


## 자리가 안 남으면 아무 제안도 없다
func test_a_balanced_pair_trades_nothing() -> void:
	var a: Array = _at("SP", 2, "A")
	var b: Array = _at("SP", 2, "B")
	assert_array(Trade.between(_team("A"), _team("B"), a, b,
		"neutral", "neutral")).is_empty()


## ⚠ **유망주는 자리 수에 안 센다.** 세면 유망주만 많은 팀이 "자리가 남는다"고
## 판정돼 **주전을 내놓는다.**
##
## 주전 둘 + 유망주 둘 — 안 세면 2명(모자람)이고 세면 4명(남음)이다
func test_prospects_do_not_count_as_depth() -> void:
	var a: Array = _at("SP", 2, "A")
	for i in 2:
		a.append(_asset({"id": "K%d" % i, "position": "SP", "service_years": 0}))
	var b: Array = _at("C", 3, "B")
	b.append_array(_at("SP", 1, "BS"))

	for p in Trade.between(_team("A"), _team("B"), a, b, "neutral", "neutral"):
		assert_str(String(p["from_team_id"])).override_failure_message(
			"주전 둘뿐인 자리를 '남는다'고 봤다 — 유망주를 셌다").is_not_equal("A")


## ⚠ **자리가 남는 쪽만 제안한다.** 조건을 빼면 **모자란 팀이 주전을 내놓는다**
func test_a_short_position_is_not_offered() -> void:
	# A는 SP가 하나뿐 · B는 C가 하나뿐 — 어느 쪽도 남는 자리가 없다
	var a: Array = _at("SP", 1, "A")
	a.append_array(_at("C", 2, "AC"))
	var b: Array = _at("C", 1, "B")
	b.append_array(_at("SP", 2, "BS"))
	assert_array(Trade.between(_team("A"), _team("B"), a, b,
		"neutral", "neutral")).override_failure_message(
		"남는 자리가 없는데 제안이 나왔다").is_empty()


## ⚠ **양쪽이 다 제안한다.** 한쪽만 보면 상대가 남아도는 자리를 영영 못 판다
func test_both_sides_propose() -> void:
	var a: Array = _at("SP", 3, "A")
	a.append_array(_at("C", 1, "AC"))
	var b: Array = _at("C", 3, "B")
	b.append_array(_at("SP", 1, "BS"))

	var froms: Dictionary = {}
	for p in Trade.between(_team("A"), _team("B"), a, b, "neutral", "neutral"):
		froms[String(p["from_team_id"])] = true
	assert_int(froms.size()).override_failure_message(
		"한쪽만 제안했다 (%s)" % froms.keys()).is_equal(2)


## ⚠ **양쪽의 계약 만료를 다 본다.** 한쪽만 보면 상대 FA 예정자를 영영
## 선점하지 못한다
func test_both_sides_shop_their_expiring_players() -> void:
	var a: Array = [
		_asset({"id": "A_STAR", "ovr": 85.0, "contract_years": 1}),
		_asset({"id": "A_KID", "ovr": 60.0, "service_years": 0}),
	]
	var b: Array = [
		_asset({"id": "B_STAR", "ovr": 85.0, "contract_years": 1}),
		_asset({"id": "B_KID", "ovr": 60.0, "service_years": 0}),
	]

	var offered: Dictionary = {}
	for p in Trade.between(_team("A"), _team("B"), a, b, "neutral", "neutral"):
		if String(p["reason"]) == "expiring_contract":
			offered[String(p["offering_ids"][0])] = true
	assert_bool(offered.has("A_STAR")).is_true()
	assert_bool(offered.has("B_STAR")).override_failure_message(
		"B의 계약 만료자를 안 봤다").is_true()


## ⚠ **받는 쪽도 동점이면 id 순이다.** 내림차순 갈래가 없으면 **같은 능력의
## 유망주 중 아무나** 오고, 같은 세이브를 다시 열 때 다른 사람이 온다
func test_a_tie_among_the_targets_picks_the_lower_id() -> void:
	var mine: Array = [_asset({"id": "STAR", "ovr": 85.0, "contract_years": 1})]
	var theirs: Array = [
		_asset({"id": "KID_C", "ovr": 60.0, "service_years": 0}),
		_asset({"id": "KID_A", "ovr": 60.0, "service_years": 0}),
		_asset({"id": "KID_B", "ovr": 60.0, "service_years": 0}),
	]

	var seen: int = 0
	for p in Trade.between(_team("A"), _team("B"), mine, theirs,
			"neutral", "neutral"):
		if String(p["reason"]) != "expiring_contract":
			continue
		seen += 1
		assert_array(p["requesting_ids"]).override_failure_message(
			"동점 유망주에서 id 순이 아니다").is_equal(["KID_A"])
	assert_int(seen).is_greater(0)


## ⚠ **동점이면 id 순이다.** 갈래가 없으면 같은 세계에서 다른 사람이 오간다
func test_a_tie_picks_the_lower_id() -> void:
	# 같은 능력 셋 — 내놓는 사람은 제일 약한 쪽이고, 동점이면 id가 가른다
	var a: Array = [
		_asset({"id": "SP_C", "position": "SP"}),
		_asset({"id": "SP_A", "position": "SP"}),
		_asset({"id": "SP_B", "position": "SP"}),
	]
	var b: Array = _at("C", 3, "B")
	b.append_array(_at("SP", 1, "BS"))

	for p in Trade.between(_team("A"), _team("B"), a, b, "neutral", "neutral"):
		if String(p["from_team_id"]) == "A" and String(p["reason"]) == "position_surplus":
			assert_array(p["offering_ids"]).override_failure_message(
				"동점에서 id 순이 아니다").is_equal(["SP_A"])


# ── 받을까 ────────────────────────────────────────────────────

func test_an_even_swap_is_acceptable() -> void:
	var same: Array = [_asset()]
	assert_bool(Trade.accepts(same, [_asset({"id": "P2"})], _profile(), 150000)) \
		.is_true()


## 손해면 거절한다
func test_a_bad_deal_is_rejected() -> void:
	assert_bool(Trade.accepts([_asset({"ovr": 90.0})],
		[_asset({"id": "P2", "ovr": 40.0})], _profile(), 150000)).is_false()


## ⚠ **구단 성향이 값을 바꾼다.** 같은 선수라도 팀마다 다르게 본다 —
## 이게 없으면 트레이드가 능력치 비교로만 남는다
func test_a_development_club_pays_more_for_the_young() -> void:
	var kid: Dictionary = _asset({"age": 21, "service_years": 0})
	var dev: float = Trade.asset_value(kid, _profile({"development_focus": 90.0}), [], 0.5)
	var plain: float = Trade.asset_value(kid, _profile(), [], 0.5)
	assert_float(dev).override_failure_message("육성 지향이 어린 선수를 안 높인다") \
		.is_greater(plain)

	# 반대로 **노장은 낮게 본다** — 없으면 육성 지향이 한쪽으로만 걸린다
	var old: Dictionary = _asset({"age": 35, "service_years": 14})
	assert_float(Trade.asset_value(old, _profile({"development_focus": 90.0}), [], 0.5)) \
		.override_failure_message("육성 지향이 노장을 안 낮춘다") \
		.is_less(Trade.asset_value(old, _profile(), [], 0.5))


func test_a_stable_club_prefers_the_prime() -> void:
	var prime: Dictionary = _asset({"age": 29})
	assert_float(Trade.asset_value(prime, _profile({"stability": 90.0}), [], 0.5)) \
		.is_greater(Trade.asset_value(prime, _profile(), [], 0.5))
	# 어린 선수는 낮게 본다
	var kid: Dictionary = _asset({"age": 21, "service_years": 0})
	assert_float(Trade.asset_value(kid, _profile({"stability": 90.0}), [], 0.5)) \
		.is_less(Trade.asset_value(kid, _profile(), [], 0.5))


func test_pressure_prefers_someone_who_can_play_now() -> void:
	var now: Dictionary = _asset({"ovr": 80.0, "age": 28})
	var kid: Dictionary = _asset({"ovr": 80.0, "age": 21, "service_years": 0})
	var hot: Dictionary = _profile({"win_now_pressure": 90.0})
	assert_float(Trade.asset_value(now, hot, [], 0.5)) \
		.is_greater(Trade.asset_value(now, _profile(), [], 0.5))
	assert_float(Trade.asset_value(kid, hot, [], 0.5)) \
		.is_less(Trade.asset_value(kid, _profile(), [], 0.5))


## 모자란 자리를 채우면 더 쳐준다
func test_a_needed_position_is_worth_more() -> void:
	assert_float(Trade.asset_value(_asset(), _profile(), ["SP"], 0.5)) \
		.is_greater(Trade.asset_value(_asset(), _profile(), [], 0.5))


## ⚠ **연봉이 값을 깎는다.** 없으면 비싼 선수가 늘 좋은 자산이 되고
## 팀들이 연봉만 주고받는다
func test_salary_drags_the_value_down() -> void:
	assert_float(Trade.asset_value(_asset({"salary": 50000}), _profile(), [], 0.5)) \
		.is_less(Trade.asset_value(_asset({"salary": 1000}), _profile(), [], 0.5))


## 받아들일 확률이 0~1 안에 있다 — 밖이면 판정이 늘 같은 쪽이 된다
func test_the_probability_stays_in_range() -> void:
	var terrible: Dictionary = Trade.evaluate([_asset({"ovr": 99.0})],
		[_asset({"id": "P2", "ovr": 1.0})], _profile(), 150000)
	assert_float(float(terrible["accept_probability"])).is_between(0.05, 0.95)
	var great: Dictionary = Trade.evaluate([_asset({"ovr": 1.0})],
		[_asset({"id": "P2", "ovr": 99.0})], _profile(), 150000)
	assert_float(float(great["accept_probability"])).is_between(0.05, 0.95)
	assert_float(float(great["net"])).is_greater(float(terrible["net"]))
