extends GdUnitTestSuite

## 계약 결정 — 협상 · 옵션 · FA · 트레이드. B-6e.
##
## ⚠ **02는 이 로직이 모달 안에 있었다.** 프로 커리어 매년 도는 경로인데
## 한 번도 헤드리스로 안 돌아봤고, 자동 진행은 계약 대기를 "알림성"으로
## 분류해 그냥 버렸다 — 실측 25시즌에서 2031년에 만료된 계약이 2038년까지
## 그대로 있었다(재계약도 은퇴도 없음).


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 300, "season_year": 2034, "seed": 1,
		"protagonist": {
			"id": "ME", "name": "김한결",
			"career_stage": "pro_kbl", "league_id": "LEAGUE_KBL",
			"team_id": "TEAM_KBL_A", "team_name": "옛 팀",
			"player_type": "pitcher", "position": "SP",
			"pitching": {"ovr": 75.0}, "batting": {},
			# 계약 도중이다 — 옵션·발효가 실제로 숫자를 바꾸는지 보려면
			# 시작값이 0이면 안 된다
			"salary": 5000, "contract_years": 2, "pro_service_years": 12,
			"money": 0, "career_events": [],
		},
		"pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


func _deal(team_id: String = "TEAM_KBL_B", salary: int = 9000,
		years: int = 3, bonus: int = 20000) -> Dictionary:
	return {"team_id": team_id, "league_id": "LEAGUE_KBL",
		"salary": salary, "duration_years": years, "signing_bonus": bonus}


func _action(context: String, team_id: String = "TEAM_KBL_A") -> Dictionary:
	return {"type": "salary_negotiation", "team_id": team_id,
		"league_id": "LEAGUE_KBL", "offered_salary": 6000,
		"duration_years": 2, "min_duration_years": 1, "max_duration_years": 3,
		"signing_bonus": 0, "context": context}


# ── 즉시 계약과 다음 시즌 계약 ────────────────────────────────

## 입단·전역 복귀는 그 자리에서 무대가 열린다
func test_the_first_contract_starts_right_away() -> void:
	assert_bool(ContractDecision.is_immediate("initial")).is_true()
	assert_bool(ContractDecision.is_immediate("military_return")).is_true()


## ⚠ **재계약은 시즌 도중에 발효되지 않는다** — 소속이 중간에 바뀌면
## 그해 성적이 두 팀에 걸린다
func test_a_renewal_waits_for_the_new_season() -> void:
	assert_bool(ContractDecision.is_immediate("renewal")).is_false()


func test_an_immediate_contract_applies_now() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _action("initial"))
	assert_bool(ContractDecision.sign_negotiated(s, _action("initial"),
		_deal(), 300)).is_true()
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["team_id"])).is_equal("TEAM_KBL_B")
	assert_int(int(p["salary"])).is_equal(9000)
	assert_int(int(p["contract_years"])).is_equal(3)
	assert_bool(Pending.has(s, "salary_negotiation")).is_false()


func test_a_renewal_is_kept_for_later() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _action("renewal"))
	ContractDecision.sign_negotiated(s, _action("renewal"), _deal(), 300)
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"재계약이 시즌 도중에 발효됐다 — 그해 성적이 두 팀에 걸린다"
	).is_equal("TEAM_KBL_A")
	assert_dict(s[ContractDecision.NEXT_KEY]).is_not_empty()
	assert_bool(Pending.has(s, "salary_negotiation")).is_false()


func test_signing_a_renewal_tells_you_about_it() -> void:
	var s: Dictionary = _state()
	ContractDecision.sign_negotiated(s, _action("renewal"), _deal(), 300)
	assert_int(s["mailbox"].size()).override_failure_message(
		"계약했는데 아무 말이 없다").is_greater(0)


## ⚠ **넣어 둔 계약을 새 해에 발효시킨다.** 안 부르면 서명한 계약이
## 영영 발효 안 된다
func test_the_kept_contract_takes_effect_next_season() -> void:
	var s: Dictionary = _state()
	ContractDecision.sign_negotiated(s, _action("renewal"), _deal(), 300)
	assert_bool(ContractDecision.apply_pending_next_contract(s)).is_true()
	var p: Dictionary = s["protagonist"]
	assert_str(String(p["team_id"])).is_equal("TEAM_KBL_B")
	assert_int(int(p["contract_years"])).is_equal(3)


func test_the_kept_contract_is_applied_only_once() -> void:
	var s: Dictionary = _state()
	ContractDecision.sign_negotiated(s, _action("renewal"), _deal(), 300)
	ContractDecision.apply_pending_next_contract(s)
	assert_bool(ContractDecision.apply_pending_next_contract(s)
		).override_failure_message("같은 계약이 두 번 발효됐다").is_false()


func test_nothing_kept_means_nothing_happens() -> void:
	var s: Dictionary = _state()
	assert_bool(ContractDecision.apply_pending_next_contract(s)).is_false()


## ⚠ **계약금이 자산이 된다.** 안 더하면 화면에만 있는 숫자다
func test_the_signing_bonus_becomes_money() -> void:
	var s: Dictionary = _state()
	ContractDecision.sign_negotiated(s, _action("initial"), _deal(), 300)
	assert_int(int(s["protagonist"]["money"])).is_equal(20000)


## ⚠ **한 해가 열릴 때 롤오버가 이걸 부른다.** 안 부르면 서명만 하고
## 아무 일도 안 일어난다 — 배선이 끊긴 걸 검사가 본다
func test_the_season_rollover_applies_it() -> void:
	var s: Dictionary = _state()
	s["world"] = {"rosters": {}}
	s["team_names"] = {}
	s["schedule"] = []
	ContractDecision.sign_negotiated(s, _action("renewal"), _deal(), 300)
	SeasonRunner.roll_over(s)
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"해가 바뀌었는데 서명한 계약이 발효 안 됐다").is_equal("TEAM_KBL_B")


# ── 거절 ──────────────────────────────────────────────────────

## FA 자격이 있으면 시장으로
func test_rejecting_with_fa_rights_opens_the_market() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["contract_years"] = 0        # 계약이 끝났고 연차도 찼다
	assert_str(ContractDecision.reject_negotiated(s, _action("renewal"), 300)
		).is_equal("fa_market")
	assert_bool(Pending.has(s, "fa_market")).is_true()


## ⚠ **자격이 없으면 갈 곳이 없다.** 02는 대기만 풀고 끝나서 소속도 계약도
## 없는 채로 다음 주가 왔다 — 지금은 그 상태를 알리고 남는다
func test_rejecting_without_fa_rights_leaves_you_unsigned() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["pro_service_years"] = 2
	assert_str(ContractDecision.reject_negotiated(s, _action("renewal"), 300)
		).is_equal("unsigned")
	assert_bool(Pending.has(s, "fa_market")).is_false()
	assert_int(s["mailbox"].size()).override_failure_message(
		"미계약으로 남았는데 아무 말이 없다").is_greater(0)


func test_rejecting_closes_the_negotiation() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _action("renewal"))
	ContractDecision.reject_negotiated(s, _action("renewal"), 300)
	assert_bool(Pending.has(s, "salary_negotiation")).is_false()


# ── 옵션 조항 ─────────────────────────────────────────────────

func _option(next_salary: int = 7000) -> Dictionary:
	return {"type": "option_clause", "option_type": "team",
		"next_salary": next_salary}


func test_an_exercised_option_extends_the_deal() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _option())
	assert_str(ContractDecision.apply_option_clause(s, _option(), true)
		).is_equal("salary_negotiation")
	var p: Dictionary = s["protagonist"]
	assert_int(int(p["salary"])).is_equal(7000)
	assert_int(int(p["contract_years"])).is_equal(1)


## ⚠ **미행사면 계약이 만료된다.** 그리고 다음을 밀어 줘야 한다 —
## 안 밀면 계약이 만료된 채 아무 일도 안 일어난다
func test_an_unexercised_option_ends_the_deal_and_opens_the_market() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _option())
	assert_str(ContractDecision.apply_option_clause(s, _option(), false)
		).is_equal("fa_market")
	assert_int(int(s["protagonist"]["contract_years"])).is_equal(0)
	assert_bool(Pending.has(s, "fa_market")).is_true()
	assert_bool(Pending.has(s, "option_clause")).is_false()


## FA 자격이 없으면 원소속 재계약으로 — 시장이 아니다
func test_an_unexercised_option_without_fa_rights_goes_to_renewal() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["pro_service_years"] = 2
	assert_str(ContractDecision.apply_option_clause(s, _option(), false)
		).is_equal("salary_negotiation")
	var a: Dictionary = Pending.first(s, "salary_negotiation")
	assert_str(String(a["context"])).is_equal("renewal")
	assert_str(String(a["team_id"])).is_equal("TEAM_KBL_A")


## ⚠ **행사됐으면 FA 자격이 있어도 시장이 안 열린다** — 계약이 이어진다
func test_an_exercised_option_does_not_open_the_market() -> void:
	var s: Dictionary = _state()
	ContractDecision.apply_option_clause(s, _option(), true)
	assert_bool(Pending.has(s, "fa_market")).override_failure_message(
		"옵션이 행사됐는데 FA 시장이 열렸다").is_false()


# ── FA 시장 ───────────────────────────────────────────────────

func _offer() -> Dictionary:
	return {"team_id": "TEAM_KBL_C", "league_id": "LEAGUE_KBL",
		"duration_years": 4, "signing_bonus": 30000}


func test_an_fa_deal_waits_for_the_new_season() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	assert_bool(ContractDecision.sign_fa_offer(s, _offer(), 12000, 300)).is_true()
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"FA 계약이 시즌 도중에 발효됐다").is_equal("TEAM_KBL_A")
	assert_bool(Pending.has(s, "fa_market")).is_false()

	ContractDecision.apply_pending_next_contract(s)
	assert_str(String(s["protagonist"]["team_id"])).is_equal("TEAM_KBL_C")
	assert_int(int(s["protagonist"]["salary"])).is_equal(12000)


func test_an_fa_deal_is_written_down() -> void:
	var s: Dictionary = _state()
	ContractDecision.sign_fa_offer(s, _offer(), 12000, 300)
	var kinds: Array = []
	for e in s["protagonist"]["career_events"]:
		kinds.append(String(e["type"]))
	assert_array(kinds).contains(["fa_signed"])
	assert_int(s["mailbox"].size()).is_greater(0)


## ⚠ **소식 id에 실제 시각을 쓰지 않는다.** 02는 `Date.now()`를 써서 같은
## 세이브를 다시 열면 id가 달라져 중복 소식이 생겼다
func test_signing_twice_does_not_duplicate_the_news() -> void:
	var s: Dictionary = _state()
	ContractDecision.sign_fa_offer(s, _offer(), 12000, 300)
	ContractDecision.sign_fa_offer(s, _offer(), 12000, 301)
	assert_int(s["mailbox"].size()).override_failure_message(
		"같은 계약 소식이 두 통 왔다").is_equal(1)


func test_waiting_counts_the_unsigned_weeks() -> void:
	var s: Dictionary = _state()
	Pending.push(s, {"type": "fa_market"})
	assert_int(ContractDecision.wait_fa_market(s)).is_equal(1)
	assert_int(ContractDecision.wait_fa_market(s)).override_failure_message(
		"미계약 주차가 안 쌓인다 — 제시 조건이 영영 안 내려간다").is_equal(2)
	assert_bool(Pending.has(s, "fa_market")).is_false()


func test_signing_clears_the_unsigned_weeks() -> void:
	var s: Dictionary = _state()
	ContractDecision.wait_fa_market(s)
	ContractDecision.wait_fa_market(s)
	ContractDecision.sign_fa_offer(s, _offer(), 12000, 300)
	assert_int(int(s["protagonist"]["fa_unsigned_weeks"])).is_equal(0)


# ── 트레이드 ──────────────────────────────────────────────────

func _trade() -> Dictionary:
	return {"type": "trade", "to_team_id": "TEAM_KBL_D",
		"to_league_id": "LEAGUE_KBL", "reason": "즉시전력 보강"}


## ⚠ **팀이 실제로 바뀐다.** 02는 자동 진행이 트레이드를 알림성으로 분류해
## 그냥 해소했고, 통보만 사라지고 팀은 그대로였다
func test_accepting_a_trade_moves_you() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _trade())
	assert_bool(ContractDecision.accept_trade(s, _trade())).is_true()
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"트레이드를 받아들였는데 팀이 그대로다").is_equal("TEAM_KBL_D")
	assert_bool(Pending.has(s, "trade")).is_false()


func test_a_trade_is_written_down_both_ways() -> void:
	var s: Dictionary = _state()
	ContractDecision.accept_trade(s, _trade())
	var e: Dictionary = s["protagonist"]["career_events"][0]
	assert_str(String(e["type"])).is_equal("trade")
	assert_str(String(e["from_team_id"])).override_failure_message(
		"어느 팀에서 왔는지가 안 남았다").is_equal("TEAM_KBL_A")
	assert_str(String(e["to_team_id"])).is_equal("TEAM_KBL_D")


## ⚠ **노트레이드 조항이 있을 때만 거부할 수 있다**
func test_you_cannot_refuse_a_trade_without_the_clause() -> void:
	var s: Dictionary = _state()
	Pending.push(s, _trade())
	assert_bool(ContractDecision.reject_trade(s)).is_false()
	assert_bool(Pending.has(s, "trade")).override_failure_message(
		"거부가 안 됐는데 통보가 사라졌다").is_true()


func test_the_no_trade_clause_lets_you_refuse() -> void:
	var s: Dictionary = _state()
	s["protagonist"]["no_trade"] = true
	Pending.push(s, _trade())
	assert_bool(ContractDecision.reject_trade(s)).is_true()
	assert_bool(Pending.has(s, "trade")).is_false()
	assert_str(String(s["protagonist"]["team_id"])).is_equal("TEAM_KBL_A")
