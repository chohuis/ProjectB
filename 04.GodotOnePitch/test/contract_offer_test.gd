extends GdUnitTestSuite

## 주인공 재계약 오퍼 — F-7.
##
## 원본: `player_engine.rs:296-311`의 `calc_offered_salary_for_protagonist`
##       (호출부는 `advanceWeek.ts:1017-1030`, W43)
##
## ⚠ **04엔 주인공 재계약 오퍼 연봉을 내는 코드가 아예 없었다.**
## `salary_negotiation` pending을 만드는 두 곳(`contract_decision.gd:144` ·
## `military.gd:189`)이 **이미 있는 값을 그대로 옮겨 담을 뿐**이고,
## `Contract.estimate`는 NPC 계약 생성(`ensure`)에서만 쓰인다.
##
## ⚠ **그래서 스태프 `budget` 계수(구단주)가 소비처 0건이었다** —
## `Staff.mods_of`가 만들어 주는데 읽는 곳이 없었다. 여기가 그 유일한 자리다.


func _pro(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "ME", "name": "김한결", "position": "SP", "age": 26,
		"league_id": "LEAGUE_KBL", "team_id": "TEAM_KBL_SEOUL_ROYALS_1",
		"salary": 12000, "contract_years": 1, "pro_service_years": 4,
		"fame": 40.0,
		"pitching": {"ovr": 70.0, "velocity": 72.0, "command": 66.0,
			"control": 68.0, "movement": 62.0, "stamina": 64.0},
	}
	p.merge(over, true)
	return p


# ── 02 식을 그대로 옮겼는가 ───────────────────────────────────

## ⚠ **02 식 그대로다.**
##   market  = (1800 + max(ovr-50,0)*220 + fame*28) * 리그배수 * budget
##   blended = current*(1 + (rating-50)*0.012)*0.6 + market*0.4
##   최저 1500
##
## 성적이 없으면 rating은 50이라 성적 보정이 1.0이다
func test_the_offer_matches_the_original_formula() -> void:
	var p: Dictionary = _pro()
	var market: float = (1800.0 + (70.0 - 50.0) * 220.0 + 40.0 * 28.0) * 1.0
	var expected: int = int(roundf(maxf(12000.0 * 1.0 * 0.6 + market * 0.4, 1500.0)))
	assert_int(Contract.protagonist_offer(p, {}, 1.0)).is_equal(expected)


## ⚠ **리그 배수가 곱해진다.** ABL 3.5 · JBL 2.0 · 독립 0.35 (02 Rust 값).
##
## ⚠ **`salary_rules.json`의 `league_mult`와 다른 표다.** 02도 두 벌이었다 —
## 그쪽은 NPC 계약 생성용(`Contract.estimate`)이고 독립이 0.14다.
## 두 식은 원래 별개이므로 각자의 배수를 쓴다
func test_the_league_multiplier_comes_from_the_offer_table() -> void:
	var kbl: int = Contract.protagonist_offer(_pro(), {}, 1.0)
	var abl: int = Contract.protagonist_offer(
		_pro({"league_id": "LEAGUE_ABL"}), {}, 1.0)
	assert_int(abl).override_failure_message(
		"ABL 오퍼가 KBL보다 크지 않다 — 배수가 안 곱해진다").is_greater(kbl)


## ⚠ **여기가 스태프 `budget` 계수의 유일한 소비처다.** 지갑을 여는
## 구단주면 오퍼가 후하다(02 §7-5 F-1)
func test_a_generous_owner_offers_more() -> void:
	var tight: int = Contract.protagonist_offer(_pro(), {}, 0.85)
	var rich: int = Contract.protagonist_offer(_pro(), {}, 1.20)
	assert_int(rich).override_failure_message(
		"구단주 성향이 오퍼를 안 바꾼다 — budget 계수가 또 죽는다"
		).is_greater(tight)


## ⚠ **계수를 0.80~1.25로 가둔다** — 02 Rust의 `clamp(0.80, 1.25)`.
## 안 가두면 지갑 큰 구단 하나가 연봉 체계를 통째로 흔든다
func test_the_owner_factor_is_clamped() -> void:
	assert_int(Contract.protagonist_offer(_pro(), {}, 5.0)).is_equal(
		Contract.protagonist_offer(_pro(), {}, Contract.OFFER_BUDGET_MAX))
	assert_int(Contract.protagonist_offer(_pro(), {}, 0.1)).is_equal(
		Contract.protagonist_offer(_pro(), {}, Contract.OFFER_BUDGET_MIN))


## ⚠ **최저선이 있다.** 없으면 못 던진 해에 0원 계약이 나온다
func test_there_is_a_floor() -> void:
	var weak: Dictionary = _pro({"salary": 100, "fame": 0.0,
		"pitching": {"ovr": 20.0}, "league_id": "LEAGUE_INDEPENDENT"})
	assert_int(Contract.protagonist_offer(weak, {}, 1.0)).is_greater_equal(
		Contract.OFFER_FLOOR)


# ── 성적이 오퍼를 움직이는가 ──────────────────────────────────

## ⚠ **잘 던진 해엔 더 준다.** 02 `calc_season_rating_inner`:
##   ERA 점수 0.45 + WHIP 점수 0.3 + K/9 점수 0.25
func test_a_good_season_raises_the_offer() -> void:
	var flat: int = Contract.protagonist_offer(_pro(), {}, 1.0)
	var good: int = Contract.protagonist_offer(_pro(),
		{"ip": 180.0, "era": 2.10, "whip": 0.98, "k": 190}, 1.0)
	assert_int(good).override_failure_message(
		"잘 던졌는데 오퍼가 안 올랐다").is_greater(flat)


func test_a_bad_season_lowers_the_offer() -> void:
	var flat: int = Contract.protagonist_offer(_pro(), {}, 1.0)
	var bad: int = Contract.protagonist_offer(_pro(),
		{"ip": 120.0, "era": 6.40, "whip": 1.72, "k": 60}, 1.0)
	assert_int(bad).override_failure_message(
		"못 던졌는데 오퍼가 안 내렸다").is_less(flat)


## ⚠ **한 이닝도 안 던졌으면 성적이 없는 것과 같다.** 0으로 나누면
## 방어율이 무한이 되고 오퍼가 최저선으로 떨어진다
func test_no_innings_counts_as_no_record() -> void:
	assert_int(Contract.protagonist_offer(_pro(),
		{"ip": 0.0, "era": 0.0, "whip": 0.0, "k": 0}, 1.0)).is_equal(
		Contract.protagonist_offer(_pro(), {}, 1.0))


## 시즌 평점은 02 표 그대로다 — 값을 못 박는다
func test_the_season_rating_matches_the_original() -> void:
	# ERA 2.0 · WHIP 1.0 · K/9 10.0 → 100*0.45 + 100*0.3 + 100*0.25 = 100
	assert_float(Contract.season_rating(
		{"ip": 180.0, "era": 2.0, "whip": 1.0, "k": 200})).is_equal_approx(100.0, 0.5)
	# 기록이 없으면 50
	assert_float(Contract.season_rating({})).is_equal(50.0)


# ── 계약이 끝나면 물어보는가 (배선) ───────────────────────────
#
# ⚠ **02가 여기서 크게 데었다.** 재계약 제안이 사라지고 **2031년에 만료된
# 계약이 2038년까지 남았다**(25시즌 실측). 04도 계약을 매년 줄이기만 하고
# (`Contract.advance_year`) **끝났을 때 물어보는 코드가 없었다.**


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2031, "day": 1,
		"protagonist": _pro(),
		"world": {"rosters": {}}, "pending": [], "mailbox": [],
		"season_stats": {},
	}
	s.merge(over, true)
	return s


## ⚠ **계약이 0이 되면 반드시 뭔가 물어봐야 한다.** 재계약이든 FA든.
## 아무것도 안 뜨면 무소속인 채로 다음 해가 오고, 그게 02의 증상이다
func test_an_expired_contract_asks_something() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 0
	ContractDecision.ask_on_expiry(s)
	var asked: bool = Pending.has(s, "salary_negotiation") \
		or Pending.has(s, "fa_market")
	assert_bool(asked).override_failure_message(
		"계약이 끝났는데 아무것도 안 물어본다 — 무소속으로 다음 해가 온다"
		).is_true()


## 계약이 남아 있으면 안 묻는다 — 매년 물으면 계약이 뜻을 잃는다
func test_a_live_contract_asks_nothing() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 2
	ContractDecision.ask_on_expiry(s)
	assert_array(Pending.all(s)).override_failure_message(
		"계약이 2년 남았는데 재계약을 물어본다").is_empty()


## ⚠ **FA 자격이 있으면 FA 시장이다.** 재계약만 물으면 시장에 나갈 길이 없다
func test_an_fa_eligible_player_goes_to_the_market() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 0
	s["protagonist"]["pro_service_years"] = 20
	ContractDecision.ask_on_expiry(s)
	assert_bool(Pending.has(s, "fa_market")).override_failure_message(
		"FA 자격이 있는데 시장이 안 열린다").is_true()


## 자격이 없으면 소속팀 재계약이다
func test_a_non_fa_player_gets_a_renewal_offer() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 0
	s["protagonist"]["pro_service_years"] = 2
	ContractDecision.ask_on_expiry(s)
	assert_bool(Pending.has(s, "salary_negotiation")).is_true()
	var a: Dictionary = Pending.first(s, "salary_negotiation")
	assert_int(int(a["offered_salary"])).override_failure_message(
		"재계약 오퍼 금액이 0이다 — 구단이 금액을 안 냈다").is_greater(0)


## ⚠ **학교·독립에는 계약이 없다.** 고교생에게 재계약을 물으면 안 된다
func test_a_school_player_is_never_asked() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["league_id"] = "LEAGUE_HIGHSCHOOL"
	s["protagonist"]["contract_years"] = 0
	s["protagonist"].erase("salary")
	ContractDecision.ask_on_expiry(s)
	assert_array(Pending.all(s)).override_failure_message(
		"고교생에게 재계약을 물어본다").is_empty()


## 두 번 물어도 줄이 하나다 — `push_once`가 그 뜻이다
func test_it_does_not_ask_twice() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 0
	ContractDecision.ask_on_expiry(s)
	ContractDecision.ask_on_expiry(s)
	assert_int(Pending.all(s).size()).is_equal(1)


## ⚠ **은퇴한 선수에겐 안 묻는다.** 커리어가 끝났는데 재계약이 오면
## 은퇴 화면과 계약 화면이 같이 뜬다
func test_a_retired_player_is_not_asked() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 0
	s["protagonist"]["retired"] = true
	ContractDecision.ask_on_expiry(s)
	assert_array(Pending.all(s)).is_empty()


## ⚠ **시즌 종료가 실제로 물어봐야 한다.** `ask_on_expiry`를 만들어 놓고
## 안 부르면 이번 세션에서 여덟 번 찾은 그 결함을 하나 더 만드는 것이다
func test_the_season_end_actually_asks() -> void:
	var s: Dictionary = World.new_game({"seed": 3131, "season_year": 2031,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	# 주인공을 프로로 옮기고 계약을 마지막 해로 둔다
	var p: Dictionary = s["protagonist"]
	p["league_id"] = "LEAGUE_KBL"
	p["team_id"] = "TEAM_KBL_SEOUL_ROYALS_1"
	p["salary"] = 12000
	p["contract_years"] = 1
	p["pro_service_years"] = 3
	p["age"] = 25
	s["day"] = int(s.get("season_days", 350))

	SeasonRunner.finish_season(s)

	assert_int(int(p.get("contract_years", 9))).override_failure_message(
		"시즌이 끝났는데 계약이 안 줄었다").is_equal(0)
	var asked: bool = Pending.has(s, "salary_negotiation") \
		or Pending.has(s, "fa_market")
	assert_bool(asked).override_failure_message(
		"계약이 만료됐는데 시즌 종료가 아무것도 안 물어봤다 — `ask_on_expiry`를 아무도 안 부른다"
		).is_true()


# ── 변이가 잡아낸 빈틈 ────────────────────────────────────────

## ⚠ **지금 연봉이 없으면 시장가를 쓴다.** 0으로 두면 blended가
## `0*0.6 + market*0.4`가 되어 **첫 계약이 시장가의 40%로 떨어진다**
func test_a_player_with_no_salary_gets_the_market_price() -> void:
	var rookie: Dictionary = _pro()
	rookie.erase("salary")
	var offer: int = Contract.protagonist_offer(rookie, {}, 1.0)
	# 지금 연봉 = 시장가이므로 blended가 정확히 시장가가 된다
	var market: int = int(roundf(1800.0 + (70.0 - 50.0) * 220.0 + 40.0 * 28.0))
	assert_int(offer).override_failure_message(
		"연봉이 없는 선수의 오퍼가 %d다 — 시장가 %d의 40%%로 떨어졌다"
			% [offer, market]).is_equal(market)


## ⚠ **OVR이 기준(50) 아래여도 시장가를 깎지 않는다** — 02는 `max(ovr-50, 0)`이다.
## 안 막으면 약한 선수의 시장가가 음수 쪽으로 끌려간다
func test_a_low_ovr_does_not_drag_the_market_down() -> void:
	# 최저선에 안 걸리게 지금 연봉을 넉넉히 준다 — 걸리면 둘 다 같은 값이 되어
	# 검사가 아무것도 안 본다
	var weak: Dictionary = _pro({"salary": 30000,
		"pitching": {"ovr": 30.0}})
	var mid: Dictionary = _pro({"salary": 30000,
		"pitching": {"ovr": 50.0}})
	assert_int(Contract.protagonist_offer(weak, {}, 1.0)).override_failure_message(
		"OVR 30이 OVR 50과 다른 시장가를 받는다 — 음수 보정이 안 막혔다"
		).is_equal(Contract.protagonist_offer(mid, {}, 1.0))


## ⚠ **가중치가 다르다.** ERA 0.45 · WHIP 0.3 · K 0.25 — 뭉개서 1/3씩
## 나누면 방어율이 좋고 탈삼진이 적은 투수의 평가가 달라진다
func test_the_rating_weights_are_not_equal() -> void:
	# ERA만 좋은 투수 vs K만 좋은 투수 — 가중치가 같으면 두 값이 같아진다
	var era_good: float = Contract.season_rating(
		{"ip": 180.0, "era": 2.0, "whip": 1.0, "k": 60})
	var k_good: float = Contract.season_rating(
		{"ip": 180.0, "era": 5.5, "whip": 1.6, "k": 240})
	assert_float(era_good).override_failure_message(
		"ERA가 좋은 투수(%.1f)와 K가 좋은 투수(%.1f)의 평점이 같다 — 가중치가 뭉개졌다"
			% [era_good, k_good]).is_not_equal(k_good)
	assert_float(era_good).override_failure_message(
		"ERA 비중(0.45)이 K 비중(0.25)보다 큰데 평가가 뒤집혔다").is_greater(k_good)


## ⚠ **각 항을 20~100으로 가둔다.** 안 가두면 방어율 10점대에서 항이
## 음수로 내려가 평점이 통째로 무너진다
func test_each_rating_term_is_clamped() -> void:
	# ERA 10.0 → 100 - 8*18 = −44. 가두면 20이다
	var awful: float = Contract.season_rating(
		{"ip": 180.0, "era": 10.0, "whip": 2.5, "k": 40})
	assert_float(awful).override_failure_message(
		"최악의 시즌 평점이 %.1f다 — 항을 안 가뒀다" % awful).is_greater_equal(20.0)
	# 완봉급이어도 100을 안 넘는다
	var perfect: float = Contract.season_rating(
		{"ip": 200.0, "era": 0.50, "whip": 0.60, "k": 320})
	assert_float(perfect).override_failure_message(
		"최고의 시즌 평점이 %.1f다 — 상한을 안 뒀다" % perfect).is_less_equal(100.0)


## ⚠ **비중을 값으로 못 박는다.** "A가 B보다 크다"만 보면 균등 가중으로
## 바꿔도 부등호가 그대로여서 변이가 통과한다 — 실제로 그랬다.
##
## ERA 2.0 → 100 · WHIP 1.0 → 100 · K/9 3.0 → 40+18 = 58
## 가중 합 = 100*0.45 + 100*0.3 + 58*0.25 = 89.5
## (균등이면 (100+100+58)/3 = 86.0이라 여기서 갈린다)
func test_the_rating_weights_have_exact_values() -> void:
	assert_float(Contract.season_rating(
		{"ip": 180.0, "era": 2.0, "whip": 1.0, "k": 60})
		).override_failure_message(
		"평점 가중치가 02와 다르다 (ERA 0.45 · WHIP 0.3 · K 0.25)"
		).is_equal_approx(89.5, 0.05)


## ⚠ **구단주 성향이 실제로 넘어가는가.** `offer_salary_for`가
## `Staff.mods_of(...)["budget"]`을 안 넘기고 1.0을 박아도 검사가 통과했다 —
## **세계에 스태프가 없어서 어차피 중립이었기 때문**이다. 구단주를 직접 세운다
func test_the_owner_actually_reaches_the_offer() -> void:
	var tight: Dictionary = _state()
	tight["world"][Staff.KEY] = {"TEAM_KBL_SEOUL_ROYALS_1": [
		{"role": Staff.ROLE_OWNER, "stats": {"budget_support": 1.0}}]}
	var rich: Dictionary = _state()
	rich["world"][Staff.KEY] = {"TEAM_KBL_SEOUL_ROYALS_1": [
		{"role": Staff.ROLE_OWNER, "stats": {"budget_support": 99.0}}]}

	var a: int = ContractDecision.offer_salary_for(tight, tight["protagonist"])
	var b: int = ContractDecision.offer_salary_for(rich, rich["protagonist"])
	assert_int(b).override_failure_message(
		"지갑을 여는 구단주(%d)와 닫는 구단주(%d)의 오퍼가 같다 — budget이 안 넘어간다"
			% [b, a]).is_greater(a)


## ⚠ **시즌 성적이 실제로 넘어가는가.** 빈 사전을 박아도 검사가 통과했다 —
## **`season_stats`가 비어 있어서 어차피 같았기 때문**이다
func test_the_season_record_actually_reaches_the_offer() -> void:
	var blank: Dictionary = _state()
	var good: Dictionary = _state()
	good["season_stats"] = {"ME": {"ip": 180.0, "era": 2.10, "whip": 0.98, "k": 190}}

	var a: int = ContractDecision.offer_salary_for(blank, blank["protagonist"])
	var b: int = ContractDecision.offer_salary_for(good, good["protagonist"])
	assert_int(b).override_failure_message(
		"잘 던진 해(%d)와 기록 없는 해(%d)의 오퍼가 같다 — 성적이 안 넘어간다"
			% [b, a]).is_greater(a)
