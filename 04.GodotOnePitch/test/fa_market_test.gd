extends GdUnitTestSuite

## FA 시장 — M9-12.
##
## **보상선수가 실제로 움직인다** (02 사용자 확정, KBO식 A/B/C 등급).


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _player(id: String, from_team: String, ovr: float = 70.0,
		salary: int = 10000, age: int = 30) -> Dictionary:
	return {"id": id, "name": id, "from_team_id": from_team,
		"ovr": ovr, "age": age, "salary": salary, "form": 0.0}


## ⚠ **로스터를 능력 **오름차순**으로 만든다.** 내림차순으로 주면 이미
## 정렬된 상태라 "능력 순으로 고르는가"를 검사가 못 본다
func _team(id: String, slots: int = 1, roster_n: int = 0) -> Dictionary:
	var roster: Array = []
	for i in roster_n:
		roster.append({"id": "%s_R%d" % [id, i], "ovr": 50.0 + float(i)})
	return {"team_id": id, "budget_index": 1.0, "win_now_pressure": 50.0,
		"open_slots": slots, "roster": roster}


# ── 규칙 ──────────────────────────────────────────────────────

func test_the_rules_are_loaded() -> void:
	assert_bool(FaMarket.rules().is_empty()).override_failure_message(
		"FA 규칙이 비었다").is_false()
	assert_int(FaMarket.rules()["grades"].size()).is_equal(3)


## ⚠ **자격 연수의 정본이 하나여야 한다.** 02는 TS와 Rust에 각각 있었고
## 값이 같아도 정본이 둘이면 언젠가 갈라진다
func test_the_eligibility_years_have_one_source() -> void:
	var from_file: Dictionary = FaMarket.rules()["eligible_years"]
	for lid in ["LEAGUE_KBL", "LEAGUE_ABL", "LEAGUE_JBL"]:
		assert_int(TeamProfile.fa_eligibility_years(lid)).override_failure_message(
			"%s 자격 연수가 규칙 파일과 다르다" % lid).is_equal(int(from_file[lid]))
	assert_int(TeamProfile.FA_YEARS_DEFAULT).is_equal(int(from_file["default"]))


# ── 등급 ──────────────────────────────────────────────────────

## ⚠ **높은 연봉이 0%다.** 뒤집으면 최저연봉 선수가 A등급을 받아 보상선수가
## 딸려 간다
func test_the_top_salary_is_zero_percent() -> void:
	var salaries: Array = [10000, 8000, 6000, 4000, 2000]
	assert_float(FaMarket.salary_percentile(10000, salaries)).is_equal(0.0)
	assert_float(FaMarket.salary_percentile(2000, salaries)).is_equal(80.0)
	# 리그 연봉을 모르면 중간으로 본다
	assert_float(FaMarket.salary_percentile(9999, [])).is_equal(50.0)


func test_the_grade_bands_have_no_gap() -> void:
	for pct in range(0, 101):
		assert_bool(FaMarket.grade_of(float(pct)).has("grade")).override_failure_message(
			"%d%%에 해당하는 등급이 없다" % pct).is_true()


func test_the_top_and_bottom_are_different_grades() -> void:
	assert_str(String(FaMarket.grade_of(0.0)["grade"])).is_equal("A")
	assert_str(String(FaMarket.grade_of(100.0)["grade"])).is_equal("C")


## ⚠ **규칙을 못 읽어도 터지지 않는다.** 빈 사전을 돌려주면 `resolve`가
## `grade["money_pct"]`를 읽다 죽는다 — 폴백은 보상 없는 C등급이다
func test_a_missing_rule_file_falls_back() -> void:
	var g: Dictionary = FaMarket.grade_of(0.0, [{"grade": "X", "until_percent": -1.0,
		"protected_count": 0, "money_pct": 0.0}])
	assert_str(String(g["grade"])).is_equal("C")
	assert_int(int(g["protected_count"])).is_equal(0)
	assert_float(float(g["money_pct"])).is_equal(0.0)


## A/B만 보상선수가 있다 — C는 보상금만
func test_only_the_top_grades_cost_a_player() -> void:
	assert_int(int(FaMarket.grade_of(0.0)["protected_count"])).is_greater(0)
	assert_int(int(FaMarket.grade_of(100.0)["protected_count"])).is_equal(0)


# ── 시장 ──────────────────────────────────────────────────────

func test_a_player_signs_where_there_is_room() -> void:
	var out: Dictionary = FaMarket.resolve(
		[_player("P1", "A")], [_team("A", 0), _team("B", 1)], [10000], _rng())
	assert_int(out["signings"].size()).is_equal(1)
	assert_str(String(out["signings"][0]["to_team_id"])).is_equal("B")
	assert_array(out["unsigned"]).is_empty()


## 자리가 없으면 미계약 — 진로 배정으로 넘어간다
func test_no_room_means_unsigned() -> void:
	var out: Dictionary = FaMarket.resolve(
		[_player("P1", "A")], [_team("A", 0), _team("B", 0)], [10000], _rng())
	assert_array(out["signings"]).is_empty()
	assert_array(out["unsigned"]).is_equal(["P1"])


## ⚠ **상위 FA가 먼저 자리를 가져간다.** 순차 처리가 아니면 좋은 선수가
## 자리를 못 얻는 일이 생긴다
func test_the_best_player_picks_first() -> void:
	var out: Dictionary = FaMarket.resolve([
		_player("WEAK", "A", 50.0),
		_player("STAR", "A", 90.0),
	], [_team("B", 1)], [10000], _rng())
	assert_int(out["signings"].size()).is_equal(1)
	assert_str(String(out["signings"][0]["id"])).override_failure_message(
		"약한 선수가 먼저 자리를 가져갔다").is_equal("STAR")
	assert_array(out["unsigned"]).is_equal(["WEAK"])


## 폼이 능력에 얹힌다 — 최근에 잘한 선수가 먼저 팔린다
func test_form_counts_towards_the_order() -> void:
	var hot: Dictionary = _player("HOT", "A", 70.0)
	hot["form"] = 1.0
	var out: Dictionary = FaMarket.resolve([_player("COLD", "A", 74.0), hot],
		[_team("B", 1)], [10000], _rng())
	assert_str(String(out["signings"][0]["id"])).is_equal("HOT")


## 계약이 성사되면 그 팀의 자리가 줄어든다
func test_a_signing_uses_up_a_slot() -> void:
	var out: Dictionary = FaMarket.resolve([
		_player("P1", "A", 90.0), _player("P2", "A", 80.0), _player("P3", "A", 70.0),
	], [_team("B", 2)], [10000], _rng())
	assert_int(out["signings"].size()).is_equal(2)
	assert_int(out["unsigned"].size()).is_equal(1)


# ── 보상 ──────────────────────────────────────────────────────

## ⚠ **재계약이면 보상이 없다.** 걸면 원소속이 자기 선수를 잡을 때마다
## 자기 선수를 하나 잃는다
func test_re_signing_costs_nothing() -> void:
	var out: Dictionary = FaMarket.resolve(
		[_player("P1", "A")], [_team("A", 1, 30)], [10000], _rng())
	var s: Dictionary = out["signings"][0]
	assert_str(String(s["to_team_id"])).is_equal("A")
	assert_str(String(s["compensation_id"])).is_empty()
	assert_int(int(s["compensation_money"])).is_equal(0)


## A등급은 보호선수 밖에서 한 명이 원소속으로 간다
func test_a_top_grade_signing_sends_a_player_back() -> void:
	var out: Dictionary = FaMarket.resolve(
		[_player("P1", "A", 70.0, 10000)],
		[_team("A", 0), _team("B", 1, 30)], [10000, 5000, 1000], _rng())
	var s: Dictionary = out["signings"][0]
	assert_str(String(s["grade"])).is_equal("A")
	assert_str(String(s["compensation_id"])).override_failure_message(
		"A등급인데 보상선수가 없다").is_not_empty()
	# 로스터 30명이 능력 오름차순(R0=50 … R29=79)이다. 내림차순으로 세워
	# 보호선수 20명을 뺀 다음이 21번째 = R9(59)
	assert_str(String(s["compensation_id"])).override_failure_message(
		"보상선수를 능력 순으로 안 골랐다").is_equal("B_R9")
	assert_int(int(s["compensation_money"])).is_equal(20000)


## C등급은 보상금만 — 보상선수가 없다
func test_the_bottom_grade_only_costs_money() -> void:
	var out: Dictionary = FaMarket.resolve(
		[_player("P1", "A", 70.0, 1000)],
		[_team("A", 0), _team("B", 1, 30)], [10000, 5000, 1000], _rng())
	var s: Dictionary = out["signings"][0]
	assert_str(String(s["grade"])).is_equal("C")
	assert_str(String(s["compensation_id"])).is_empty()
	assert_int(int(s["compensation_money"])).is_greater(0)


## 보호선수보다 로스터가 얇으면 보상선수가 없다
func test_a_thin_roster_gives_nobody_up() -> void:
	var out: Dictionary = FaMarket.resolve(
		[_player("P1", "A", 70.0, 10000)],
		[_team("A", 0), _team("B", 1, 5)], [10000, 1000], _rng())
	assert_str(String(out["signings"][0]["compensation_id"])).is_empty()


## ⚠ **같은 사람이 두 번 보상선수가 되면 안 된다**
func test_nobody_moves_twice_as_compensation() -> void:
	# ⚠ **원소속이 다시 이기지 않게 해 둔다.** 보상선수가 빠지면 원소속에
	# 자리가 생기고, 프리미엄까지 붙어서 다음 FA를 도로 잡아 버린다 —
	# 그러면 보상이 한 번뿐이라 이 검사가 아무것도 안 본다
	var rich: Dictionary = _team("B", 2, 30)
	rich["budget_index"] = 1.35
	rich["win_now_pressure"] = 100.0

	var out: Dictionary = FaMarket.resolve([
		_player("P1", "A", 90.0, 10000), _player("P2", "A", 80.0, 10000),
	], [_team("A", 0), rich], [10000, 1000], _rng())

	var seen: Dictionary = {}
	for s in out["signings"]:
		var c: String = String(s["compensation_id"])
		if c.is_empty():
			continue
		assert_bool(seen.has(c)).override_failure_message(
			"%s가 두 번 보상선수가 됐다" % c).is_false()
		seen[c] = true
	assert_int(seen.size()).is_equal(2)


## 보상선수가 빠진 팀은 자리가 하나 생긴다 — 안 그러면 로스터가 마른다
func test_the_old_team_gets_a_slot_back() -> void:
	var teams: Array = [_team("A", 0), _team("B", 1, 30)]
	FaMarket.resolve([_player("P1", "A", 70.0, 10000)], teams, [10000, 1000], _rng())
	assert_int(int(teams[0]["open_slots"])).override_failure_message(
		"보상선수를 내줬는데 자리가 안 생겼다").is_equal(1)


# ── 계약 조건 ─────────────────────────────────────────────────

## 나이가 많으면 연수가 짧다
func test_older_players_get_shorter_deals() -> void:
	var young: Dictionary = FaMarket.resolve([_player("Y", "A", 70.0, 10000, 28)],
		[_team("B", 1)], [10000], _rng())["signings"][0]
	var mid: Dictionary = FaMarket.resolve([_player("M", "A", 70.0, 10000, 32)],
		[_team("B", 1)], [10000], _rng())["signings"][0]
	var old: Dictionary = FaMarket.resolve([_player("O", "A", 70.0, 10000, 35)],
		[_team("B", 1)], [10000], _rng())["signings"][0]
	assert_int(int(young["years"])).is_equal(3)
	assert_int(int(mid["years"])).is_equal(2)
	assert_int(int(old["years"])).is_equal(1)


## 성적 압박이 높은 팀이 더 세게 부른다 — 그게 buyer의 뜻이다
func test_pressure_raises_the_bid() -> void:
	var calm: Array = [_team("B", 1)]
	var hot: Array = [_team("B", 1)]
	hot[0]["win_now_pressure"] = 100.0

	var a: int = int(FaMarket.resolve([_player("P", "A")], calm, [10000],
		_rng(9))["signings"][0]["salary"])
	var b: int = int(FaMarket.resolve([_player("P", "A")], hot, [10000],
		_rng(9))["signings"][0]["salary"])
	assert_int(b).override_failure_message(
		"성적 압박이 입찰에 안 닿는다").is_greater(a)


## 예산이 큰 팀이 더 세게 부른다
func test_budget_raises_the_bid() -> void:
	var poor: Array = [_team("B", 1)]
	var rich: Array = [_team("B", 1)]
	rich[0]["budget_index"] = 1.35

	assert_int(int(FaMarket.resolve([_player("P", "A")], rich, [10000],
		_rng(9))["signings"][0]["salary"])).is_greater(
		int(FaMarket.resolve([_player("P", "A")], poor, [10000],
			_rng(9))["signings"][0]["salary"]))


## ⚠ **원소속에 프리미엄이 있다.** 보상 부담이 없어 유리하다 —
## 없으면 FA가 거의 항상 팀을 옮긴다
## 프리미엄 0.15에 입찰 흔들림이 0.30이라 원소속이 약 87% 이긴다.
## 프리미엄이 없으면 50%다 — 100번을 돌려 그 둘을 가른다
func test_the_old_team_has_an_edge() -> void:
	var home: int = 0
	for i in 100:
		var out: Dictionary = FaMarket.resolve([_player("P", "A")],
			[_team("A", 1), _team("B", 1)], [10000], _rng(i))
		if String(out["signings"][0]["to_team_id"]) == "A":
			home += 1
	assert_int(home).override_failure_message(
		"100번 중 원소속 재계약이 %d번 — 프리미엄이 없다(없으면 50번쯤)" % home) \
		.is_greater(70)


func test_an_empty_market_is_empty() -> void:
	var out: Dictionary = FaMarket.resolve([], [_team("A", 5)], [], _rng())
	assert_array(out["signings"]).is_empty()
	assert_array(out["unsigned"]).is_empty()
