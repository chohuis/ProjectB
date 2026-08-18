extends GdUnitTestSuite

## 시즌말 투자 — 🔴 **엔진만 있고 부르는 곳이 없었다.**
##
## `Finance.investment_options` · `can_invest` · `resolve_investment`가
## 다 있고 `data/finance_rules.json`에 **예금·펀드·사업 세 갈래와 값**까지
## 있는데 — **넷 다 아무도 안 불렀다.**
##
## `ui/finance_vm.gd`의 `build`가 내는 것: `kpi` · `ledger` · `trend` ·
## `sponsor` · `training`. **투자가 없다.**
##
## 02 `FinancePage`(436줄)엔 `<h3>투자</h3>` 절이 있다.
##
## ⚠ **이번 루프에서 형태 ②를 다섯 번째 만났다** —
## 받는 쪽(산식·값)만 있고 올리는 쪽이 없다.


func _state(cash: int = 5000, stage: String = "pro_kbl") -> Dictionary:
	return {
		"day": Calendar.DAYS_PER_SEASON, "season_year": 2033, "seed": 8,
		"protagonist": {"id": "ME", "name": "김한결",
			"career_stage": stage, "league_id": "LEAGUE_KBL",
			"team_id": "TEAM_KBL_BUSAN_WAVES_1", "money": cash,
			"salary": 12000, "sponsors": [], "injury": null, "retired": false},
		"pending": [], "mailbox": [], "world": {"rosters": {}},
	}


# ── 갈래와 값 ─────────────────────────────────────────────────────

## 02 세 갈래 — 예금 · 펀드 · 사업
func test_갈래가_셋이다() -> void:
	assert_int(Finance.investment_options().size()).is_equal(3)


## 예금은 확정 수익 — 난수를 안 쓴다
func test_예금은_확정이다() -> void:
	var r := RandomNumberGenerator.new()
	r.seed = 1
	var a: Dictionary = Finance.resolve_investment("DEPOSIT", 1000, r)
	r.seed = 999
	var b: Dictionary = Finance.resolve_investment("DEPOSIT", 1000, r)
	assert_int(int(a["payout"])).override_failure_message(
		"확정 수익인데 씨앗에 따라 달라진다").is_equal(int(b["payout"]))


## ⚠ **원금 손실을 허용하되 전액 소실은 안 만든다** — `floor`가 하한이다
func test_전액_소실은_없다() -> void:
	var r := RandomNumberGenerator.new()
	for seed_v in [1, 7, 42, 999, 12345]:
		r.seed = seed_v
		var out: Dictionary = Finance.resolve_investment("VENTURE", 1000, r)
		assert_int(int(out["payout"])).override_failure_message(
			"원금 1000이 %d가 됐다 — 전액 소실은 벌이지 재미가 아니다"
			% int(out["payout"])).is_greater(0)


## 현금이 적으면 안 뜬다 — 생활비도 빠듯한 신인에게 띄우면 조롱이다
func test_현금이_적으면_안_뜬다() -> void:
	assert_bool(Finance.can_invest(100, "pro_kbl")).is_false()
	assert_bool(Finance.can_invest(5000, "pro_kbl")).is_true()


## 프로만 — 고교생에게 투자 화면은 남의 일이다
func test_프로만_뜬다() -> void:
	assert_bool(Finance.can_invest(5000, "highschool")).is_false()


# ── 화면이 내나 ───────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 산식이 다 있어도 화면이 안 내면 없는 것과 같다
func test_재정_화면이_투자를_낸다() -> void:
	var vm: Dictionary = FinanceVm.build(_state())
	assert_bool(vm.has("investment")).override_failure_message(
		"재정 화면에 투자가 없다 — 산식은 다 있는데 부르는 곳이 없었다") \
		.is_true()
	assert_bool(vm["investment"].has("rows")).is_true()


## ⚠ **여기는 고르는 자리가 아니다.** 02도 결산에서 한 해에 한 번만 고른다 —
## 상시 화면에 두면 매주 눌러보는 도박이 된다
func test_재정_화면은_고르는_자리가_아니다() -> void:
	var inv: Dictionary = FinanceVm.build(_state())["investment"]
	assert_bool(inv.has("options")).override_failure_message(
		"재정 화면에서 투자를 고를 수 있다 — 결산에서만 골라야 한다").is_false()
	assert_str(String(inv.get("note", ""))).override_failure_message(
		"어디서 고르는지 안 알려준다").contains("결산")


## 굴린 것이 줄로 나온다 — 원금 · 손익 · 수익률
func test_이력이_줄로_나온다() -> void:
	var s: Dictionary = _state()
	Finance.apply_investment(s, "DEPOSIT", 2000, 2033)
	var inv: Dictionary = FinanceVm.build(s)["investment"]
	var rows: Array = inv["rows"]
	assert_int(rows.size()).override_failure_message(
		"굴렸는데 이력이 안 보인다").is_equal(1)
	assert_str(String(rows[0]["label"])).contains("2033")
	assert_str(String(rows[0]["label"])).contains("예금")
	assert_str(String(rows[0]["value"])).contains("→")
	assert_str(String(rows[0]["value"])).contains("%")
	assert_bool(bool(rows[0]["gain"])).is_true()


## 최근 것이 위로 — 결산에서 방금 고른 것이 제일 먼저 보여야 한다
func test_최근이_위로_온다() -> void:
	var s: Dictionary = _state()
	Finance.apply_investment(s, "DEPOSIT", 1000, 2033)
	Finance.apply_investment(s, "FUND", 1000, 2034)
	var rows: Array = FinanceVm.build(s)["investment"]["rows"]
	assert_int(rows.size()).is_equal(2)
	assert_str(String(rows[0]["label"])).override_failure_message(
		"최근 것이 위가 아니다: %s" % rows[0]["label"]).contains("2034")


## 누적 손익 — 한 해만 보면 잘한 판단인지 알 수 없다
func test_누적_손익을_낸다() -> void:
	var s: Dictionary = _state()
	Finance.apply_investment(s, "DEPOSIT", 2000, 2033)
	var inv: Dictionary = FinanceVm.build(s)["investment"]
	assert_str(String(inv["total_label"])).override_failure_message(
		"누적 손익이 없다").is_not_empty()
	assert_bool(bool(inv["total_gain"])).is_true()


## 아직 아무것도 안 굴렸으면 줄이 없다 — 지어낸 0원 줄을 넣지 않는다
func test_이력이_없으면_비어_있다() -> void:
	var inv: Dictionary = FinanceVm.build(_state())["investment"]
	assert_int((inv["rows"] as Array).size()).is_equal(0)
	assert_str(String(inv["total_label"])).is_empty()


## 못 하는 상태면 이유를 말한다 — 빈 칸은 고장으로 보인다
func test_못_하면_이유를_말한다() -> void:
	var vm: Dictionary = FinanceVm.build(_state(100))
	assert_bool(bool(vm["investment"].get("can", true))).is_false()
	assert_str(String(vm["investment"].get("reason", ""))) \
		.override_failure_message("왜 못 하는지 안 말한다").is_not_empty()


## 화면 문구에 마크다운을 쓰지 않는다
func test_마크다운을_안_쓴다() -> void:
	var s: Dictionary = _state()
	Finance.apply_investment(s, "VENTURE", 1000, 2033)
	var inv: Dictionary = FinanceVm.build(s)["investment"]
	var joined: String = String(inv["note"]) + String(inv["reason"])
	for r in inv["rows"]:
		joined += String(r["label"]) + String(r["value"])
	assert_int(joined.find("**")).is_equal(-1)


## ⚠ **화면은 `career_stage`가 아니라 리그로 무대를 가른다**(`_stage_of`).
## 엔진만 재면 그 차이를 못 본다 — **화면 경로로도 막히는지** 본다
func test_고교생은_화면에서도_못_한다() -> void:
	var s: Dictionary = _state(5000, "highschool")
	s["protagonist"]["league_id"] = "LEAGUE_HIGHSCHOOL"
	var inv: Dictionary = FinanceVm.build(s)["investment"]
	assert_bool(bool(inv["can"])).override_failure_message(
		"고교생인데 투자할 수 있다고 나온다").is_false()
	assert_int(String(inv["reason"]).find("프로")).override_failure_message(
		"프로만 된다는 말이 없다: %s" % inv["reason"]).is_greater(-1)
