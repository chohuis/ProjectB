extends GdUnitTestSuite

## 재정 탭 — C-4. "나" 탭의 하위 탭이다.
##
## ⚠ **이 탭이 스폰서 계약과 구독을 쓰는 쪽이다.** 04는 둘 다 읽는 코드만
## 있고 세우는 데가 없어서, 스폰서는 한 건도 안 생기고 구독은 영영 빈 배열이었다.

const STATUS := preload("res://ui/screens/status_screen.tscn")
const APP := preload("res://ui/app_root.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _joined(node: Node) -> String:
	return "\n".join(_texts(node))


func _tab_index(id: String) -> int:
	for i in StatusVm.TABS.size():
		if String(StatusVm.TABS[i]["id"]) == id:
			return i
	return -1


func _state(p_over: Dictionary = {}, over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["protagonist"].merge(p_over, true)
	s.merge(over, true)
	return s


func _open(s: Dictionary) -> StatusScreen:
	var screen: StatusScreen = STATUS.instantiate()
	screen.set_view_model(StatusVm.build(s))
	add_child(screen)
	await await_idle_frame()
	screen._on_tab(_tab_index("finance"))
	await await_idle_frame()
	return screen


func _app(s: Dictionary) -> AppRoot:
	var r: AppRoot = APP.instantiate()
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	r.screen()._on_tab(1)
	await await_idle_frame()
	var status: StatusScreen = r.screen().find_children(
		"*", "StatusScreen", true, false)[0]
	status._on_tab(_tab_index("finance"))
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


# ── 탭이 있는가 ───────────────────────────────────────────────

## ⚠ **재정은 아마추어도 연다.** 02가 그랬다 — 스폰서가 안 붙는 것과
## 용돈·구독은 별개 축이고, 숨기면 왜 없는지를 알 길이 없다
func test_a_student_gets_the_finance_tab() -> void:
	assert_int(_tab_index("finance")).is_greater(-1)
	assert_str(_joined(await _open(_state()))).contains("재정")


# ── 무엇이 보이나 ─────────────────────────────────────────────

func test_it_shows_the_cash_and_the_stage() -> void:
	var text: String = _joined(await _open(_state({"money": 1200})))
	assert_str(text).contains("고등학교")
	assert_str(text).contains("1200만원")


func test_it_shows_the_weekly_ledger() -> void:
	var text: String = _joined(await _open(_state()))
	assert_str(text).contains("주간 수입")
	assert_str(text).contains("과세하지")


## ⚠ **학생·독립에는 스폰서가 안 붙는다** — 그 이유를 말해야
## "왜 아무 제안도 없지"가 안 된다
func test_an_amateur_is_told_why() -> void:
	assert_str(_joined(await _open(_state()))).contains("아마추어")


func test_a_famous_pro_sees_offers() -> void:
	var text: String = _joined(await _open(_state({
		"league_id": "LEAGUE_KBL", "career_stage": "pro",
		"salary": 10000, "fame": 80.0})))
	assert_str(text).contains("계약")
	assert_str(text).contains("지역 상공회")


func test_every_training_area_is_offered() -> void:
	var text: String = _joined(await _open(_state()))
	for a in Finance.training_areas():
		assert_str(text).override_failure_message(
			"%s 분야가 없다" % a["name"]).contains(String(a["name"]))


## `finance_log`를 읽는 자리가 여기뿐이다 — 매주 쌓기만 하고 아무도 안 봤다
func test_the_trend_appears_after_a_few_weeks() -> void:
	var r: AppRoot = await _app(_state())
	assert_str(_joined(r)).not_contains("자산 추이")

	for w in range(1, 4):
		WeekRunner.run(r.state(), w * 7)
	r._refresh()
	await await_idle_frame()
	assert_str(_joined(r)).override_failure_message(
		"세 주를 돌렸는데 자산 추이가 안 뜬다").contains("자산 추이")


# ── 고른 것이 상태에 닿는가 ───────────────────────────────────

## ⚠ **04는 `training_subscriptions`를 세우는 데가 없었다.** 읽는 곳이
## 둘인데 쓰는 곳이 없어서 영영 빈 배열이었다
func test_subscribing_reaches_the_state() -> void:
	var r: AppRoot = await _app(_state())
	await _press(r, "구독   투구 역학")
	assert_array(r.state().get("training_subscriptions", [])
		).override_failure_message("구독을 눌렀는데 상태가 그대로다").is_not_empty()
	assert_int(int(r.state()["training_subscriptions"][0]["tier"])).is_equal(1)


## 누를 때마다 단계가 오르고 **마지막에서 누르면 해지된다**
func test_subscribing_cycles_and_cancels() -> void:
	var r: AppRoot = await _app(_state())
	await _press(r, "구독   투구 역학")
	await _press(r, "상향   투구 역학")
	assert_int(int(r.state()["training_subscriptions"][0]["tier"])).is_equal(2)

	await _press(r, "해지   투구 역학")
	assert_array(r.state().get("training_subscriptions", [])
		).override_failure_message("해지를 눌렀는데 구독이 남아 있다").is_empty()


## ⚠ **구독이 훈련 효율에 실제로 닿는다.** 안 이으면 매주 돈만 나간다
func test_a_subscription_costs_money_every_week() -> void:
	var r: AppRoot = await _app(_state({"money": 5000}))
	await _press(r, "구독   투구 역학")
	var before: int = int(r.state()["protagonist"]["money"])
	WeekRunner.run(r.state(), 7)
	var spent: int = before - int(r.state()["protagonist"]["money"])
	assert_int(spent).override_failure_message(
		"구독했는데 주간 지출이 안 늘었다").is_greater(0)


## ⚠ **04는 스폰서를 세우는 데가 없었다** — `sponsor_offers`가 계산만 하고
## 아무 데도 안 닿아서 계약이 한 건도 안 생겼다
func test_signing_a_sponsor_reaches_the_state() -> void:
	var r: AppRoot = await _app(_state({
		"league_id": "LEAGUE_KBL", "career_stage": "pro",
		"salary": 10000, "fame": 80.0}))
	await _press(r, "계약   지역 상공회")

	var sponsors: Array = r.state()["protagonist"].get("sponsors", [])
	assert_array(sponsors).override_failure_message(
		"계약을 눌렀는데 상태가 그대로다").is_not_empty()
	assert_str(String(sponsors[0]["category_id"])).is_equal("LOCAL")
	assert_int(int(sponsors[0]["until_season"])).override_failure_message(
		"1년 계약인데 끝나는 해가 %d다" % sponsors[0]["until_season"]).is_equal(2027)


## ⚠ **누른 그 카테고리가 계약돼야 한다.** 목록에서 첫 줄을 집으면
## "지역 상공회를 눌렀는데 전국구 브랜드와 계약된" 상태가 된다
func test_signing_picks_the_category_i_pressed() -> void:
	var r: AppRoot = await _app(_state({
		"league_id": "LEAGUE_KBL", "career_stage": "pro",
		"salary": 10000, "fame": 80.0}))
	await _press(r, "계약   식음료 CF")

	var sponsors: Array = r.state()["protagonist"].get("sponsors", [])
	assert_int(sponsors.size()).is_equal(1)
	assert_str(String(sponsors[0]["category_id"])).override_failure_message(
		"식음료 CF를 눌렀는데 %s와 계약됐다" % sponsors[0]["name"]
		).is_equal("BEVERAGE")


## ⚠ **화면이 보여준 금액과 실제로 계약된 금액이 같아야 한다.** 02가
## 반복해서 겪은 결함이 이 자리다 — 화면에서 본 것과 실제가 어긋났다.
## 이미 계약한 건을 빼고 다시 계산해야 상한 배분이 화면과 같아진다
func test_the_signed_amount_matches_what_the_screen_offered() -> void:
	var r: AppRoot = await _app(_state({
		"league_id": "LEAGUE_KBL", "career_stage": "pro",
		"salary": 10000, "fame": 80.0}))
	await _press(r, "계약   지역 상공회")

	# 두 번째 계약 — 화면이 지금 얼마라고 하는가
	var offered: int = -1
	for o in FinanceVm.build(r.state())["sponsor"]["offers"]:
		if String(o["category_id"]) == "GEAR":
			offered = int(String(o["value"]).split("만")[0])
	assert_int(offered).override_failure_message("스포츠 용품 제안이 없다"
		).is_greater(0)

	await _press(r, "계약   스포츠 용품")
	for s in r.state()["protagonist"]["sponsors"]:
		if String(s["category_id"]) != "GEAR":
			continue
		assert_int(int(s["annual"])).override_failure_message(
			"화면은 %d만이라고 했는데 %d만으로 계약됐다" % [offered, s["annual"]]
			).is_equal(offered)


## ⚠ **끝난 계약은 주간 수입에서도 빠진다.** 목록에서만 빼면 스폰서는
## 없는데 돈은 매주 들어오는 상태가 된다 — 조용한 어긋남이다
func test_an_expired_sponsor_stops_paying() -> void:
	var live: Dictionary = _state({"league_id": "LEAGUE_KBL",
		"career_stage": "pro", "salary": 10000,
		"sponsors": [{"category_id": "LOCAL", "name": "지역 상공회",
			"annual": 5200, "until_season": 2027}]})
	var dead: Dictionary = _state({"league_id": "LEAGUE_KBL",
		"career_stage": "pro", "salary": 10000,
		"sponsors": [{"category_id": "LOCAL", "name": "지난 계약",
			"annual": 5200, "until_season": 2026}]})

	var nets: Array = []
	for s in [live, dead]:
		var r: AppRoot = APP.instantiate()
		add_child(r)
		r.set_state(s)
		await await_idle_frame()
		WeekRunner.run(r.state(), 7)
		nets.append(int(r.state()["finance_log"][-1]["net"]))

	assert_int(nets[1]).override_failure_message(
		"계약이 끝났는데 주간 수입이 그대로다 (%d vs %d)" % [nets[0], nets[1]]
		).is_less(nets[0])


## 계약하면 그 카테고리는 제안 목록에서 빠지고 수입에 들어온다
func test_a_signed_sponsor_becomes_income() -> void:
	var r: AppRoot = await _app(_state({
		"league_id": "LEAGUE_KBL", "career_stage": "pro",
		"salary": 10000, "fame": 80.0}))
	await _press(r, "계약   지역 상공회")
	var text: String = _joined(r)
	assert_str(text).contains("스폰서·광고")
	assert_str(text).override_failure_message(
		"이미 계약했는데 또 계약하라고 뜬다").not_contains("계약   지역 상공회")


## ⚠ **고르고 나서도 재정 탭에 남아 있어야 한다** — C-3에서 겪은 것과 같다
func test_choosing_keeps_me_on_the_finance_tab() -> void:
	var r: AppRoot = await _app(_state())
	await _press(r, "구독   투구 역학")
	assert_str(_joined(r)).override_failure_message(
		"재정에서 뭘 고르자 다른 탭으로 튕겨 나갔다").contains("개인 트레이닝")


## ⚠ **다시 그려도 줄이 안 쌓인다**
func test_choosing_twice_does_not_pile_up_rows() -> void:
	var r: AppRoot = await _app(_state())
	await _press(r, "구독   투구 역학")
	var before: int = r.find_children("*", "Button", true, false).size()
	await _press(r, "구독   체력 관리")
	assert_int(r.find_children("*", "Button", true, false).size()
		).override_failure_message("고를 때마다 버튼이 쌓인다").is_equal(before)


# ── 화면이 계산을 갖지 않는다 ─────────────────────────────────

func test_the_screen_holds_no_finance_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/status_screen.gd")
	# 02는 이 화면이 OVR·사기로 수입을 즉석 계산했다
	assert_str(src).not_contains("Finance.")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
