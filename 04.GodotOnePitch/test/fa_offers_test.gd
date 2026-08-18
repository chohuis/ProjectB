extends GdUnitTestSuite

## 주인공에게 오는 FA 제안 — 🔴 **04에 만드는 코드가 없었다.**
##
## 리그 전체 FA(`FaMarket`·`FaRunner`)는 도는데 주인공 몫이 없어서
## `fa_market` 화면이 **"한 해 더 기다린다" 하나만** 줬다 — FA가 돼도
## 고를 게 없었다. 02 `player_engine.rs:354-410`을 옮겼다.


func _me(o: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {"id": "ME", "name": "김한결", "is_protagonist": true,
		"career_stage": "pro_kbl", "league_id": "LEAGUE_KBL",
		"team_id": "TEAM_KBL_BUSAN_WAVES_1", "salary": 12000,
		"contract_years": 0, "pro_service_years": 8, "age": 30,
		"fame": 40.0, "pitching": {"ovr": 75.0}, "injury": null,
		"retired": false}
	d.merge(o, true)
	return d


func _state(o: Dictionary = {}) -> Dictionary:
	return {"day": 300, "season_year": 2035, "seed": 9,
		"protagonist": _me(o), "pending": [], "mailbox": [],
		"world": {"rosters": {}}}


# ── 02 산식 ───────────────────────────────────────────────────────

## 02 `1800 + max(ovr-50,0)*220 + fame*28`, 리그 배수를 곱한다
func test_시장가가_02_그대로다() -> void:
	assert_float(FaOffers.market_of(75.0, 40.0, "LEAGUE_KBL")) \
		.is_equal_approx(1800.0 + 25.0 * 220.0 + 40.0 * 28.0, 0.5)


## OVR 50 아래는 안 깎는다 — 02도 `max(ovr-50, 0)`이다
func test_낮은_OVR은_바닥이_있다() -> void:
	assert_float(FaOffers.market_of(30.0, 0.0, "LEAGUE_KBL")) \
		.is_equal_approx(1800.0, 0.5)


## 🔴 **리그 배수는 `Contract`가 정본이다** — 표를 두 벌 적으면 갈린다
func test_리그_배수가_정본을_쓴다() -> void:
	for lid in ["LEAGUE_ABL", "LEAGUE_JBL", "LEAGUE_KBL"]:
		assert_float(FaOffers.market_of(50.0, 0.0, lid)).override_failure_message(
			"%s 배수가 `Contract.league_mult`와 다르다" % lid) \
			.is_equal_approx(1800.0 * Contract.league_mult(lid), 0.5)
	# 02 값 확인 — ABL 3.5 · JBL 2.0
	assert_float(Contract.league_mult("LEAGUE_ABL")).is_equal_approx(3.5, 0.01)
	assert_float(Contract.league_mult("LEAGUE_JBL")).is_equal_approx(2.0, 0.01)


## 미계약이 길수록 떨어지고 **0.72에서 멈춘다**
func test_미계약_감가가_바닥을_친다() -> void:
	assert_float(FaOffers.unsigned_drop(0)).is_equal_approx(1.0, 0.001)
	assert_float(FaOffers.unsigned_drop(5)).is_equal_approx(0.80, 0.001)
	assert_float(FaOffers.unsigned_drop(50)).override_failure_message(
		"바닥(0.72) 아래로 내려갔다").is_equal_approx(0.72, 0.001)


# ── 부를 팀 ───────────────────────────────────────────────────────

## ✅ **02가 겪은 2군 함정이 04엔 없다.**
##
## 02는 `_1`/`_2`가 같은 `leagueId`라 FA 제안에 2군이 섞였고 실제로
## 그리로 이적했다(실측). **04는 `World.teams_of`가 이미 거른다** —
## 2군은 `LEAGUE_*_FARM`이라는 별도 리그로 파생된다.
##
## ⚠ **그래서 `FaOffers`에 `_1` 필터를 두면 늘 참인 죽은 가드다.**
## 처음에 02를 그대로 옮겨 넣었다가 이 검사가 잡았다 —
## **함정만 보고 옮기지 말고 04 구조를 먼저 본다.**
func test_2군이_애초에_안_섞인다() -> void:
	for t in World.teams_of("LEAGUE_KBL"):
		assert_bool(String(t["id"]).ends_with(World.FARM_SUFFIX)) \
			.override_failure_message(
				"`teams_of`가 2군(%s)을 낸다 — 그러면 FA 제안에 섞인다"
				% t["id"]).is_false()
	for id in FaOffers.candidates("LEAGUE_KBL", ""):
		assert_bool(String(id).ends_with(World.FARM_SUFFIX)) \
			.override_failure_message(
				"2군(%s)이 FA 제안 후보에 들어왔다" % id).is_false()


## 자기 팀은 안 부른다 — FA인데 같은 팀이 "제안"하면 재계약이지 FA가 아니다
func test_자기_팀은_안_부른다() -> void:
	var mine: String = "TEAM_KBL_BUSAN_WAVES_1"
	assert_bool(FaOffers.candidates("LEAGUE_KBL", mine).has(mine)) \
		.override_failure_message("자기 팀이 후보에 있다").is_false()


func test_후보가_있다() -> void:
	assert_int(FaOffers.candidates("LEAGUE_KBL", "").size()) \
		.override_failure_message("KBL 1군 후보가 없다").is_greater(0)


# ── 제안 ──────────────────────────────────────────────────────────

## 🔴 **여기가 요점이다.** 제안이 없으면 FA가 돼도 고를 게 없다
func test_제안이_온다() -> void:
	var offers: Array = FaOffers.generate(_state())
	assert_int(offers.size()).override_failure_message(
		"FA인데 제안이 하나도 없다").is_between(FaOffers.PICKS_MIN,
		FaOffers.PICKS_MAX)


## 제안 한 건이 값 있는 칸을 다 갖는다 — 화면과 계약이 그걸 읽는다
func test_제안이_칸을_다_갖는다() -> void:
	var o: Dictionary = FaOffers.generate(_state())[0]
	assert_str(String(o["team_id"])).is_not_empty()
	assert_int(int(o["salary"])).is_greater(0)
	assert_int(int(o["duration_years"])).is_between(1, FaOffers.YEARS_CLAMP_MAX)
	assert_int(int(o["signing_bonus"])).is_greater_equal(0)
	assert_bool(o.has("team_option_years")).is_true()
	assert_bool(o.has("player_option_years")).is_true()
	assert_bool(o.has("no_trade")).is_true()


## ⚠ **같은 세이브를 다시 열면 같은 제안이 와야 한다** — `Rng`를 거친다
func test_같은_세이브면_같은_제안이다() -> void:
	var a: Array = FaOffers.generate(_state())
	var b: Array = FaOffers.generate(_state())
	assert_int(a.size()).is_equal(b.size())
	for i in a.size():
		assert_str(String(a[i]["team_id"])).is_equal(String(b[i]["team_id"]))
		assert_int(int(a[i]["salary"])).is_equal(int(b[i]["salary"]))


## ⚠ **기다리면 달라져야 한다** — 안 그러면 기다릴 이유가 없다
func test_기다리면_제안이_달라진다() -> void:
	var a: Array = FaOffers.generate(_state())
	var b: Array = FaOffers.generate(_state({"fa_unsigned_weeks": 6}))
	var same: bool = a.size() == b.size()
	if same:
		for i in a.size():
			if int(a[i]["salary"]) != int(b[i]["salary"]):
				same = false
	assert_bool(same).override_failure_message(
		"여섯 주를 기다렸는데 제안이 똑같다").is_false()


## 잘하는 선수가 더 받는다 — 값이 실제로 흐른다
func test_잘하면_더_받는다() -> void:
	var low: Array = FaOffers.generate(_state({"pitching": {"ovr": 55.0}}))
	var high: Array = FaOffers.generate(_state({"pitching": {"ovr": 90.0}}))
	assert_int(int(high[0]["salary"])).override_failure_message(
		"OVR 90이 55보다 적게 받는다").is_greater(int(low[0]["salary"]))


## 연봉 높은 순 — **화면이 정렬을 갖지 않는다**
func test_연봉_높은_순이다() -> void:
	var offers: Array = FaOffers.generate(_state())
	for i in range(1, offers.size()):
		assert_int(int(offers[i]["salary"])).is_less_equal(
			int(offers[i - 1]["salary"]))


# ── 배선 ──────────────────────────────────────────────────────────

## 🔴 **화면이 실제로 제안을 낸다**
func test_화면이_제안을_낸다() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "fa_market"})
	var d: Dictionary = DecisionVm.build(s)
	var picks: int = 0
	for c in d.get("choices", []):
		if String(c.get("id", "")).begins_with("offer:"):
			picks += 1
	assert_int(picks).override_failure_message(
		"FA 화면에 제안이 하나도 없다 — 기다리는 길뿐이다").is_greater(0)
	assert_int(String(d.get("body", "")).find("**")).is_equal(-1)


## ⚠ **볼 때마다 바뀌면 안 된다** — 고르는 사이에 값이 달라진다
func test_다시_그려도_안_바뀐다() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "fa_market"})
	var first: Array = DecisionVm.build(s).get("choices", []).duplicate(true)
	var again: Array = DecisionVm.build(s).get("choices", [])
	for i in first.size():
		assert_str(String(first[i]["label"])).is_equal(String(again[i]["label"]))


## 기다리면 제안을 버린다 — 안 버리면 같은 게 그대로 뜬다
func test_기다리면_제안을_버린다() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "fa_market"})
	DecisionVm.build(s)
	assert_bool(s.has("fa_offers")).is_true()
	ContractDecision.wait_fa_market(s)
	assert_bool(s.has("fa_offers")).override_failure_message(
		"기다렸는데 제안이 남아 있다 — 다음에 같은 게 뜬다").is_false()


## 고르면 그 팀과 계약한다
func test_고르면_계약한다() -> void:
	var s: Dictionary = _state()
	Pending.push_once(s, {"type": "fa_market"})
	DecisionVm.build(s)
	var want: String = String(s["fa_offers"][0]["team_id"])
	assert_bool(DecisionVm.apply(s, "offer:0", 300)).is_true()
	ContractDecision.apply_pending_next_contract(s)
	assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
		"제안을 골랐는데 팀이 안 바뀐다").is_equal(want)


# ── 변이가 살아남은 자리 ──────────────────────────────────────────

## 🔴 **미계약 감가가 실제 제안에 닿아야 한다.**
## `unsigned_drop`만 따로 재면 그 값을 안 쓰고 1.0으로 굳혀도 안 잡힌다
## ⚠ **`generate` 둘을 견주면 안 된다** — 씨앗에 미계약 주가 섞여 **부르는
## 팀 자체가 달라지므로** 금액 비교가 흔들린다. `offer_of`에 **같은 팀 ·
## 같은 난수**를 주고 `drop`만 바꾼다
func test_미계약이_제안액을_깎는다() -> void:
	var market: float = FaOffers.market_of(75.0, 40.0, "LEAGUE_KBL")
	var world: Dictionary = {"team_profiles": {"TEAM_FA": {
		"win_now_pressure": 50.0, "stability": 50.0,
		"market_appeal": 50.0, "scouting_quality": 100.0}}}
	var out: Array = []
	for weeks in [0, 7]:
		var r := RandomNumberGenerator.new()
		r.seed = 777
		out.append(int(FaOffers.offer_of(world, "TEAM_FA", "LEAGUE_KBL",
			market, FaOffers.unsigned_drop(weeks), r)["salary"]))
	assert_int(out[1]).override_failure_message(
		"일곱 주 미계약인데 제안이 %d → %d로 안 떨어졌다" % [out[0], out[1]]) \
		.is_less(out[0])


## 🔴 **`generate`가 그 감가를 실제로 넘기나** — `offer_of`만 봐서는
## `drop`을 1.0으로 굳혀도 안 잡힌다. **같은 팀이 부른 값**끼리 견준다
func test_generate가_감가를_넘긴다() -> void:
	var fresh: Dictionary = {}
	for o in FaOffers.generate(_state()):
		fresh[String(o["team_id"])] = int(o["salary"])
	var found: bool = false
	for o in FaOffers.generate(_state({"fa_unsigned_weeks": 9})):
		var tid: String = String(o["team_id"])
		if not fresh.has(tid):
			continue
		found = true
		assert_int(int(o["salary"])).override_failure_message(
			"%s가 아홉 주 뒤에도 %d → %d로 안 깎였다"
			% [tid, fresh[tid], int(o["salary"])]).is_less(int(fresh[tid]))
	assert_bool(found).override_failure_message(
		"두 번 다 부른 팀이 없다 — 검사가 아무것도 안 봤다").is_true()


## ⚠ **씨앗에 미계약 주를 섞어야 한다** — 안 섞으면 기다려도 같은 팀이
## 같은 조건으로 부른다(값만 일률적으로 깎인다)
func test_기다리면_부르는_팀도_달라진다() -> void:
	var a: Array = FaOffers.generate(_state())
	var b: Array = FaOffers.generate(_state({"fa_unsigned_weeks": 3}))
	var same: bool = a.size() == b.size()
	if same:
		for i in a.size():
			if String(a[i]["team_id"]) != String(b[i]["team_id"]):
				same = false
	assert_bool(same).override_failure_message(
		"기다렸는데 부르는 팀이 그대로다 — 씨앗에 미계약 주가 안 섞였다") \
		.is_false()


## 🔴 **성적 압박이 제시액에 닿아야 한다.**
## 같은 선수·같은 난수인데 **팀 성향만 다를 때** 갈리는지 본다
func test_압박이_제시액을_올린다() -> void:
	var market: float = FaOffers.market_of(75.0, 40.0, "LEAGUE_KBL")
	var out: Array = []
	for pressure in [0.0, 100.0]:
		var world: Dictionary = {"team_profiles": {"TEAM_FA": {
			"win_now_pressure": pressure, "stability": 50.0,
			"market_appeal": 50.0, "scouting_quality": 100.0}}}
		var r := RandomNumberGenerator.new()
		r.seed = 12345
		out.append(int(FaOffers.offer_of(world, "TEAM_FA", "LEAGUE_KBL",
			market, 1.0, r)["salary"]))
	assert_int(out[1]).override_failure_message(
		"압박 0인 팀이 %d, 100인 팀이 %d — 압박이 안 걸린다" % [out[0], out[1]]) \
		.is_greater(out[0])


## 계약 연수는 1~5로 잘린다 — 02도 `clamp(1, 5)`다
func test_연수가_1에서_5_사이다() -> void:
	for w in [0, 3, 9]:
		for o in FaOffers.generate(_state({"fa_unsigned_weeks": w})):
			assert_int(int(o["duration_years"])).override_failure_message(
				"계약 %d년짜리 제안이 나왔다" % int(o["duration_years"])) \
				.is_between(1, FaOffers.YEARS_CLAMP_MAX)
