extends GdUnitTestSuite

## 시즌말 투자 정산 — P-32의 남은 절반.
##
## 앞 절반(갈래·값·재정 화면)은 `investment_test.gd`가 본다. 여기는
## **고르는 자리와 굴리는 자리**다:
##
## 🔴 `Finance.resolve_investment`가 규칙·정규분포까지 다 갖췄는데
## **부르는 곳이 하나도 없었다.** 굴릴 자리가 없으니 이력도 안 쌓이고,
## 재정 화면의 투자 절도 영원히 비어 있었다.
##
## 02는 굴리는 자리가 **결산 모달 하나뿐**이다 — 상시 화면에 두면 매주
## 눌러보는 도박이 된다. 04도 결산 화면에 둔다.


func _p(cash: int = 5000, league: String = "LEAGUE_KBL") -> Dictionary:
	return {"id": "ME", "name": "김한결", "career_stage": "pro_kbl",
		"league_id": league, "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"money": cash, "salary": 12000, "sponsors": []}


func _state(cash: int = 5000, league: String = "LEAGUE_KBL") -> Dictionary:
	return {"day": Calendar.DAYS_PER_SEASON, "season_year": 2034, "seed": 8,
		"protagonist": _p(cash, league),
		"pending": [], "mailbox": [], "world": {"rosters": {}}}


func _screen() -> SeasonEndScreen:
	var s: SeasonEndScreen = load(
		"res://ui/screens/season_end_screen.tscn").instantiate()
	add_child(s)
	return s


func _digest() -> Dictionary:
	return {"year": 2033, "team_id": "TEAM_KBL_BUSAN_WAVES_1",
		"team_name": "부산 웨이브스", "summary": {}, "awards": {},
		"standings": {"rows": []}, "my_record": {}, "my_awards": []}


func _texts(node: Node) -> Array:
	var out: Array = []
	for c in node.get_children():
		if c is Label:
			out.append(String(c.text))
		elif c is Button:
			out.append(String(c.text))
		out.append_array(_texts(c))
	return out


# ── 금액 세 갈래 ──────────────────────────────────────────────────

## 02는 `1/4 · 1/2 · 전액` 셋을 준다
func test_금액이_셋이다() -> void:
	var a: Array = Finance.investment_amounts(5000)
	assert_int(a.size()).is_equal(3)
	assert_array([String(a[0]["label"]), String(a[1]["label"]),
		String(a[2]["label"])]).is_equal(["1/4", "1/2", "전액"])


## ⚠ **기본이 1/4이다.** 전액이 기본이면 실수로 다 넣는다
func test_기본은_사분의_일이다() -> void:
	var a: Array = Finance.investment_amounts(8000)
	assert_int(int(a[0]["amount"])).is_equal(2000)


## 100원 단위로 내린다 — 어중간한 숫자는 고르는 손을 멈추게 한다
func test_백원_단위로_내린다() -> void:
	for e in Finance.investment_amounts(12379):
		assert_int(int(e["amount"]) % 100).override_failure_message(
			"%s가 %d원이다 — 100원 단위로 안 내렸다"
			% [String(e["label"]), int(e["amount"])]).is_equal(0)


## 전액이 가진 돈을 넘으면 못 낸다
func test_전액은_현금을_안_넘는다() -> void:
	for cash in [500, 733, 5000, 99999]:
		for e in Finance.investment_amounts(cash):
			assert_int(int(e["amount"])).override_failure_message(
				"현금 %d인데 %s가 %d다" % [cash, String(e["label"]),
					int(e["amount"])]).is_less_equal(cash)


## 최소 현금 아래로는 안 내려간다 — 1/4이 규칙선 밑이면 규칙선으로 올린다
func test_최소_아래로는_안_내려간다() -> void:
	var min_cash: int = Finance.invest_min_cash()
	for e in Finance.investment_amounts(min_cash + 100):
		assert_int(int(e["amount"])).is_greater_equal(min_cash)


# ── 정산이 상태에 남는다 ──────────────────────────────────────────

## 🔴 **엔진만 있고 부르는 곳이 없던 자리** — 굴리면 현금이 움직인다
func test_굴리면_현금이_움직인다() -> void:
	var s: Dictionary = _state(5000)
	var out: Dictionary = Finance.apply_investment(s, "DEPOSIT", 2000, 2033)
	assert_bool(out.is_empty()).override_failure_message(
		"프로 선수가 2000만원을 굴렸는데 아무 일도 안 났다").is_false()
	# 예금은 확정 +3% — 2000의 3%인 60만원이 붙는다
	assert_int(int(out["profit"])).is_equal(60)
	assert_int(int(s["protagonist"]["money"])).is_equal(5060)


## ⚠ **원금은 그대로 있고 손익만 얹는다.** 뺐다 넣으면 중간에 파산을 스친다
func test_원금은_그대로_있다() -> void:
	var s: Dictionary = _state(5000)
	Finance.apply_investment(s, "DEPOSIT", 5000, 2033)
	assert_int(int(s["protagonist"]["money"])).override_failure_message(
		"전액을 굴렸더니 원금이 사라졌다").is_greater_equal(5000)


## 이력이 남는다 — 재정 화면이 이걸 읽는다
func test_이력이_남는다() -> void:
	var s: Dictionary = _state(5000)
	Finance.apply_investment(s, "FUND", 1200, 2033)
	var log: Array = Finance.investments_of(s["protagonist"])
	assert_int(log.size()).is_equal(1)
	assert_int(int(log[0]["season"])).is_equal(2033)
	assert_int(int(log[0]["principal"])).is_equal(1200)
	assert_str(String(log[0]["name"])).is_equal("펀드")


## ⚠ **한 해에 한 번뿐이다.** 되풀이되면 결산이 도박판이 된다
func test_한_해에_한_번뿐이다() -> void:
	var s: Dictionary = _state(5000)
	Finance.apply_investment(s, "DEPOSIT", 1000, 2033)
	var money: int = int(s["protagonist"]["money"])
	var again: Dictionary = Finance.apply_investment(s, "VENTURE", 1000, 2033)
	assert_bool(again.is_empty()).override_failure_message(
		"같은 해에 두 번 굴렸다").is_true()
	assert_int(int(s["protagonist"]["money"])).is_equal(money)
	assert_int(Finance.investments_of(s["protagonist"]).size()).is_equal(1)


## 다음 해엔 또 굴릴 수 있다
func test_다음_해엔_또_할_수_있다() -> void:
	var s: Dictionary = _state(5000)
	Finance.apply_investment(s, "DEPOSIT", 1000, 2033)
	assert_bool(Finance.apply_investment(s, "DEPOSIT", 1000, 2034).is_empty()) \
		.is_false()
	assert_int(Finance.investments_of(s["protagonist"]).size()).is_equal(2)


## 고교생은 못 한다 — 화면에 안 뜨는데 눌리면 안 된다
func test_고교생은_못_한다() -> void:
	var s: Dictionary = _state(5000, "LEAGUE_HS")
	s["protagonist"]["career_stage"] = "highschool"
	assert_bool(Finance.apply_investment(s, "DEPOSIT", 1000, 2033).is_empty()) \
		.is_true()
	assert_int(int(s["protagonist"]["money"])).is_equal(5000)


## 현금이 규칙선 아래면 못 한다
func test_현금이_적으면_못_한다() -> void:
	var s: Dictionary = _state(Finance.invest_min_cash() - 100)
	assert_bool(Finance.apply_investment(s, "DEPOSIT", 100, 2033).is_empty()) \
		.is_true()


## 가진 돈보다 많이 넣으라고 해도 가진 만큼만 간다
func test_가진_것보다_더는_못_넣는다() -> void:
	var s: Dictionary = _state(5000)
	var out: Dictionary = Finance.apply_investment(s, "DEPOSIT", 99999, 2033)
	assert_int(int(out["principal"])).is_equal(5000)


## 없는 갈래는 상태를 안 건드린다 — 0원 이력이 남으면 그 해를 잃는다
func test_없는_갈래는_상태를_안_건드린다() -> void:
	var s: Dictionary = _state(5000)
	assert_bool(Finance.apply_investment(s, "NOPE", 1000, 2033).is_empty()) \
		.is_true()
	assert_int(Finance.investments_of(s["protagonist"]).size()).is_equal(0)


## ⚠ **재현된다.** 02는 `thread_rng`라 같은 세이브를 다시 열면 결과가 달랐다
func test_같은_해_같은_갈래는_같은_결과다() -> void:
	var a: Dictionary = _state(5000)
	var b: Dictionary = _state(5000)
	var ra: Dictionary = Finance.apply_investment(a, "VENTURE", 1000, 2033)
	var rb: Dictionary = Finance.apply_investment(b, "VENTURE", 1000, 2033)
	assert_float(float(ra["rate"])).is_equal(float(rb["rate"]))


## 해가 다르면 결과도 갈린다 — 씨앗이 해를 안 보면 매년 같은 수익이 난다
func test_해가_다르면_결과가_갈린다() -> void:
	var rates: Array = []
	for y in [2033, 2034, 2035, 2036]:
		var s: Dictionary = _state(5000)
		rates.append(float(Finance.apply_investment(s, "VENTURE", 1000, y)["rate"]))
	assert_int(rates.size()).is_equal(4)
	var same: bool = true
	for r in rates:
		if not is_equal_approx(float(r), float(rates[0])):
			same = false
	assert_bool(same).override_failure_message(
		"네 해가 전부 %.4f다 — 씨앗이 해를 안 본다" % float(rates[0])).is_false()


## 손실도 실제로 난다 — 늘 이득이면 고민할 것이 없다
func test_손실이_실제로_난다() -> void:
	var lost: bool = false
	for y in range(2030, 2060):
		var s: Dictionary = _state(5000)
		if int(Finance.apply_investment(s, "VENTURE", 1000, y)["profit"]) < 0:
			lost = true
			assert_int(int(s["protagonist"]["money"])).override_failure_message(
				"%d년에 손실이 났는데 현금이 안 줄었다" % y).is_less(5000)
			break
	assert_bool(lost).override_failure_message(
		"30해를 굴렸는데 사업이 한 번도 손실이 안 났다").is_true()


# ── 결산 화면 ────────────────────────────────────────────────────

## 결산 뷰모델이 투자 절을 낸다
func test_결산이_투자_절을_낸다() -> void:
	var vm: Dictionary = SeasonEndVm.build(_digest(), _p(5000))
	var inv: Dictionary = vm["investment"]
	assert_bool(bool(inv["show"])).is_true()
	assert_int((inv["options"] as Array).size()).is_equal(3)
	assert_int((inv["amounts"] as Array).size()).is_equal(3)


## ⚠ **위험을 같이 적는다.** 기대 수익만 보면 사업이 늘 나아 보인다
func test_갈래마다_위험이_붙는다() -> void:
	var vm: Dictionary = SeasonEndVm.build(_digest(), _p(5000))
	for o in vm["investment"]["options"]:
		var s: String = String(o["stat_label"])
		assert_str(s).contains("기대")
		assert_bool(s.contains("확정") or s.contains("최대")) \
			.override_failure_message("%s에 위험이 안 적혔다: %s"
				% [String(o["name"]), s]).is_true()


## ⚠ **못 하는 사람에겐 아예 안 보인다** — 규칙 파일이 그렇게 적어 뒀다
func test_고교생에겐_안_보인다() -> void:
	var p: Dictionary = _p(5000, "LEAGUE_HS")
	p["career_stage"] = "highschool"
	var vm: Dictionary = SeasonEndVm.build(_digest(), p)
	assert_bool(bool(vm["investment"]["show"])).is_false()


## 현금이 적어도 안 보인다
func test_현금이_적으면_안_보인다() -> void:
	var vm: Dictionary = SeasonEndVm.build(_digest(),
		_p(Finance.invest_min_cash() - 100))
	assert_bool(bool(vm["investment"]["show"])).is_false()


## 이미 굴린 해면 결과를 보여주고 선택지가 사라진다
func test_굴린_뒤엔_결과가_보인다() -> void:
	var s: Dictionary = _state(5000)
	Finance.apply_investment(s, "DEPOSIT", 2000, 2033)
	var vm: Dictionary = SeasonEndVm.build(_digest(), s["protagonist"])
	var inv: Dictionary = vm["investment"]
	assert_bool(bool(inv["done"])).is_true()
	assert_int((inv["options"] as Array).size()).override_failure_message(
		"이미 굴렸는데 또 고를 수 있다").is_equal(0)
	assert_str(String(inv["result_label"])).contains("→")
	assert_str(String(inv["name"])).is_equal("예금")


## 결산이 비어도 키는 있다 — 화면이 없는 키를 읽으면 빈 화면이 된다
func test_빈_결산에도_키가_있다() -> void:
	var vm: Dictionary = SeasonEndVm.build({})
	assert_bool(vm.has("investment")).is_true()
	assert_bool(bool(vm["investment"]["show"])).is_false()


# ── 화면 ─────────────────────────────────────────────────────────

## 화면이 투자 절을 그린다
func test_화면이_투자_절을_그린다() -> void:
	var sc: SeasonEndScreen = _screen()
	sc.set_view_model(SeasonEndVm.build(_digest(), _p(5000)))
	var t: Array = _texts(sc)
	assert_array(t).contains(["시즌말 투자", "1/4", "1/2", "전액",
		"예금", "펀드", "사업·주식"])


## ⚠ **탭 밖에 둔다** — 탭 안에 숨기면 한 해에 한 번뿐인 선택을 못 보고 넘긴다
func test_투자는_탭_밖에_있다() -> void:
	var sc: SeasonEndScreen = _screen()
	sc.set_view_model(SeasonEndVm.build(_digest(), _p(5000)))
	var body: Array = _texts(sc.get_node("Pad/Center/Col/Body"))
	assert_array(body).override_failure_message(
		"투자가 탭 본문 안에 있다").not_contains(["시즌말 투자"])
	var out: Array = _texts(sc.get_node("Pad/Center/Col/Invest"))
	assert_array(out).contains(["시즌말 투자"])


## 못 하는 사람 화면엔 아무것도 안 붙는다
func test_못_하면_화면이_빈다() -> void:
	var sc: SeasonEndScreen = _screen()
	var p: Dictionary = _p(5000, "LEAGUE_HS")
	p["career_stage"] = "highschool"
	sc.set_view_model(SeasonEndVm.build(_digest(), p))
	assert_int(sc.get_node("Pad/Center/Col/Invest").get_child_count()) \
		.is_equal(0)


## 고르면 신호가 뜬다 — **화면은 무엇을 얼마나 골랐는지만 준다**
func test_고르면_신호가_뜬다() -> void:
	var sc: SeasonEndScreen = _screen()
	sc.set_view_model(SeasonEndVm.build(_digest(), _p(8000)))
	var got: Array = []
	sc.invest_requested.connect(func(id: String, amt: int) -> void:
		got.append([id, amt]))

	var opts: Node = sc.get_node("Pad/Center/Col/Invest")
	var pressed: bool = false
	for b in _buttons(opts):
		if b.text == "펀드":
			b.pressed.emit()
			pressed = true
	assert_bool(pressed).override_failure_message("펀드 버튼이 없다").is_true()
	await await_millis(50)
	assert_array(got).override_failure_message(
		"눌렀는데 신호가 안 왔다").is_equal([["FUND", 2000]])


## 금액을 바꾸면 그 금액으로 간다
func test_금액을_바꾸면_그_금액으로_간다() -> void:
	var sc: SeasonEndScreen = _screen()
	sc.set_view_model(SeasonEndVm.build(_digest(), _p(8000)))
	var got: Array = []
	sc.invest_requested.connect(func(id: String, amt: int) -> void:
		got.append([id, amt]))

	for b in _buttons(sc.get_node("Pad/Center/Col/Invest")):
		if b.text == "전액":
			b.pressed.emit()
	await await_millis(50)
	for b in _buttons(sc.get_node("Pad/Center/Col/Invest")):
		if b.text == "예금":
			b.pressed.emit()
	await await_millis(50)
	assert_array(got).is_equal([["DEPOSIT", 8000]])


func _buttons(node: Node) -> Array:
	var out: Array = []
	for c in node.get_children():
		if c is Button:
			out.append(c)
		out.append_array(_buttons(c))
	return out


## 고른 금액이 눌린 채로 보인다 — **어느 쪽을 굴리는지 안 보이면 못 고른다**
func test_고른_금액이_눌려_보인다() -> void:
	var sc: SeasonEndScreen = _screen()
	sc.set_view_model(SeasonEndVm.build(_digest(), _p(8000)))
	assert_array(_pressed(sc)).override_failure_message(
		"처음에 눌린 금액 칸이 없다 — 무엇을 굴리는지 알 수 없다") \
		.is_equal(["1/4"])

	for b in _buttons(sc.get_node("Pad/Center/Col/Invest")):
		if b.text == "전액":
			b.pressed.emit()
	await await_millis(50)
	assert_array(_pressed(sc)).override_failure_message(
		"전액을 눌렀는데 표시가 안 따라온다").is_equal(["전액"])


## 굴릴 금액이 글로도 보인다 — 칸 이름만으로는 얼마인지 모른다
func test_굴릴_금액이_글로도_보인다() -> void:
	var sc: SeasonEndScreen = _screen()
	sc.set_view_model(SeasonEndVm.build(_digest(), _p(8000)))
	assert_array(_texts(sc.get_node("Pad/Center/Col/Invest"))) \
		.contains(["보유 현금 8000만원 중 2000만원을 굴립니다.  고위험 선택지는 원금을 잃을 수 있습니다."])


func _pressed(sc: SeasonEndScreen) -> Array:
	var out: Array = []
	for b in _buttons(sc.get_node("Pad/Center/Col/Invest")):
		if b.toggle_mode and b.button_pressed:
			out.append(String(b.text))
	return out
