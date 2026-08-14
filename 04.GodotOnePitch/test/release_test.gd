extends GdUnitTestSuite

## 2단계 방출 — M9-13.
##
## 1단계는 로스터 초과분이고, 여기 2단계는 **정원 안이어도** 성적·연봉·
## 뎁스로 걸러내는 판정이다.
##
## ⚠ **구단 성향이 판정을 가른다.** 02는 전 팀이 정확히 50이라 규율·안정성·
## 성적압박 항이 하나도 안 갈렸다.


func _profile(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = TeamProfile.DEFAULT.duplicate()
	p.merge(over, true)
	return p


func _player(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "P1", "age": 27, "position": "SP",
		"professionalism": 50.0, "salary": 5000, "market_value": 5000,
		"recent_rating": 50.0}
	p.merge(over, true)
	return p


func _score(p: Dictionary, profile: Dictionary, perf: float = 50.0,
		depth: int = 1, owner: float = 0.0) -> float:
	return float(Release.score_of(p, profile, perf, depth,
		int(p.get("salary", 0)), int(p.get("market_value", 1)), owner)["score"])


# ── 항목마다 ──────────────────────────────────────────────────

## 기준대로면 0점이다 — 아무 항목도 안 걸린다
func test_an_average_player_scores_nothing() -> void:
	assert_float(_score(_player(), _profile())).is_equal(0.0)


func test_bad_numbers_pile_up() -> void:
	assert_float(_score(_player(), _profile(), 10.0)).is_greater(
		_score(_player(), _profile(), 40.0))
	# 기준 이상이면 감점이 없다 — 잘한 걸로 점수를 깎아 주진 않는다
	assert_float(_score(_player(), _profile(), 90.0)).is_equal(0.0)


## 시장가보다 훨씬 많이 받으면 걸린다. **두 단계다**
func test_overpay_has_two_steps() -> void:
	var mild: float = _score(_player({"salary": 9000, "market_value": 5000}), _profile())
	var heavy: float = _score(_player({"salary": 15000, "market_value": 5000}), _profile())
	assert_float(mild).is_equal(20.0)
	assert_float(heavy).is_equal(50.0)
	# 시장가만큼 받으면 안 걸린다
	assert_float(_score(_player({"salary": 5000, "market_value": 5000}),
		_profile())).is_equal(0.0)


## ⚠ **시장가를 모르면 과지급을 판정하지 않는다.** 0으로 나누면 INF가 나오고
## 그 사람은 언제나 최대 과지급이 된다 — 시장가를 못 구한 리그가 통째로
## 방출 후보가 되는 자리다
func test_an_unknown_market_value_is_not_an_overpay() -> void:
	var r: Dictionary = Release.score_of(_player(), _profile(), 50.0, 1, 99999, 0)
	assert_float(float(r["score"])).override_failure_message(
		"시장가를 모르는데 과지급으로 봤다").is_equal(0.0)
	assert_bool((int(r["flags"]) & Release.FLAG_OVERPAY) != 0).is_false()


func test_a_crowded_position_pushes_you_out() -> void:
	assert_float(_score(_player(), _profile(), 50.0, 4)).is_equal(15.0)
	assert_float(_score(_player(), _profile(), 50.0, 3)).is_equal(0.0)


func test_age_counts_from_thirty_five() -> void:
	assert_float(_score(_player({"age": 34}), _profile())).is_equal(0.0)
	assert_float(_score(_player({"age": 35}), _profile())).is_equal(0.0)
	assert_float(_score(_player({"age": 38}), _profile())).is_equal(9.0)


# ── 구단 성향 ─────────────────────────────────────────────────

## ⚠ **여기가 팀마다 달라야 뜻이 있다.** 02는 전 팀이 50이라 이 세 항이
## 하나도 안 갈렸다
func test_a_strict_club_punishes_low_professionalism() -> void:
	var slob: Dictionary = _player({"professionalism": 20.0})
	assert_float(_score(slob, _profile({"discipline": 90.0}))).is_equal(25.0)
	# 규율이 보통이면 안 본다
	assert_float(_score(slob, _profile())).is_equal(0.0)
	# 규율이 높아도 성실하면 안 걸린다
	assert_float(_score(_player({"professionalism": 80.0}),
		_profile({"discipline": 90.0}))).is_equal(0.0)


func test_a_stable_club_gives_veterans_a_break() -> void:
	var vet: Dictionary = _player({"age": 38})
	assert_float(_score(vet, _profile({"stability": 90.0}))).is_less(
		_score(vet, _profile()))
	# 젊은 선수에겐 안 준다
	assert_float(_score(_player({"age": 25}), _profile({"stability": 90.0}), 10.0)) \
		.is_equal(_score(_player({"age": 25}), _profile(), 10.0))


## ⚠ **성적 압박은 곱이다.** 다른 항이 0이면 곱해도 0이라, 압박만으로는
## 아무도 안 걸린다 — 그게 맞다
func test_pressure_multiplies_what_is_already_there() -> void:
	assert_float(_score(_player(), _profile({"win_now_pressure": 90.0}), 10.0)) \
		.is_greater(_score(_player(), _profile(), 10.0))
	assert_float(_score(_player(), _profile({"win_now_pressure": 90.0}))).is_equal(0.0)


## 구단주와 사이가 좋으면 한 번 더 기회를 준다. **주인공에게만 값이 있다**
func test_the_owner_can_save_you() -> void:
	assert_float(_score(_player(), _profile(), 10.0, 1, 100.0)).is_less(
		_score(_player(), _profile(), 10.0))
	# 사이가 나쁘면 반대로 민다
	assert_float(_score(_player(), _profile(), 10.0, 1, -100.0)).is_greater(
		_score(_player(), _profile(), 10.0))


## 점수가 음수로 안 간다 — 음수면 정렬이 뒤집힌다
func test_the_score_never_goes_below_zero() -> void:
	assert_float(_score(_player({"age": 40}), _profile({"stability": 90.0}),
		90.0, 1, 100.0)).is_greater_equal(0.0)


## 왜 걸렸는지가 같이 온다 — 화면이 그걸 읽는다
func test_it_says_why() -> void:
	var r: Dictionary = Release.score_of(_player({"age": 38}), _profile(),
		10.0, 5, 15000, 5000, 50.0)
	var f: int = int(r["flags"])
	assert_bool((f & Release.FLAG_PERF) != 0).is_true()
	assert_bool((f & Release.FLAG_OVERPAY) != 0).is_true()
	assert_bool((f & Release.FLAG_DEPTH) != 0).is_true()
	assert_bool((f & Release.FLAG_AGE) != 0).is_true()
	assert_bool((f & Release.FLAG_OWNER) != 0).is_true()
	assert_bool((f & Release.FLAG_PRO) != 0).override_failure_message(
		"규율이 보통인데 성실성 항이 켜졌다").is_false()


# ── 고르기 ────────────────────────────────────────────────────

func _roster(n: int, rating: float = 10.0) -> Array:
	var out: Array = []
	for i in n:
		out.append(_player({"id": "P%02d" % i, "recent_rating": rating,
			"salary": 15000, "market_value": 5000}))
	return out


## ⚠ **한 시즌 상한이 있다.** 없으면 성적 나쁜 해에 팀이 통째로 갈린다
func test_a_team_cannot_gut_itself() -> void:
	assert_int(Release.pick(_roster(20), _profile()).size()) \
		.is_equal(Release.MAX_PER_TEAM)


## ⚠ **문턱이 높아야 뜻이 있다.** 낮추면 매년 방출이 폭증한다 —
## **조금 걸리는 사람**으로 재야 문턱을 낮추는 변이가 잡힌다
func test_a_healthy_team_releases_nobody() -> void:
	var roster: Array = []
	for i in 20:
		roster.append(_player({"id": "P%02d" % i}))
	assert_array(Release.pick(roster, _profile())).is_empty()

	# 마흔다섯 — 점수 30점이 붙지만 문턱(55)에는 못 미친다.
	# **문턱을 낮추는 변이는 여기서 잡힌다** — 0점짜리로만 재면 못 잡는다
	var slightly: Array = []
	for i in 20:
		slightly.append(_player({"id": "Q%02d" % i, "age": 45}))
	assert_float(_score(_player({"age": 45}), _profile())).is_equal(30.0)
	assert_array(Release.pick(slightly, _profile())).override_failure_message(
		"30점짜리가 방출됐다 — 문턱이 낮다").is_empty()


## 점수 높은 순이다 — 아무나 자르면 판정의 뜻이 없다
func test_the_worst_go_first() -> void:
	var roster: Array = _roster(5, 40.0)
	roster[2]["recent_rating"] = 0.0
	var picked: Array = Release.pick(roster, _profile())
	assert_str(String(picked[0]["player"]["id"])).override_failure_message(
		"제일 나쁜 선수가 1순위가 아니다").is_equal("P02")


## ⚠ **주인공은 대상이 아니다.** 사용자가 정할 일을 세계가 대신 정하면 안 된다
func test_the_protagonist_is_never_released() -> void:
	var roster: Array = _roster(5, 0.0)
	roster[0]["is_protagonist"] = true
	for r in Release.pick(roster, _profile()):
		assert_bool(r["player"].get("is_protagonist", false)).override_failure_message(
			"주인공이 방출 대상이 됐다").is_false()


## ⚠ **같은 점수면 id 순.** 없으면 순서가 흔들려 **같은 세이브를 다시 열 때
## 다른 사람이 잘린다.**
##
## 로스터를 **id 역순으로 넣는다** — 이미 정렬된 상태로 주면 갈래를 빼도
## 결과가 같아서 검사가 아무것도 안 본다
func test_ties_break_on_id() -> void:
	var roster: Array = []
	for i in range(5, -1, -1):
		roster.append(_player({"id": "P%02d" % i, "recent_rating": 10.0,
			"salary": 15000, "market_value": 5000}))

	var picked: Array = Release.pick(roster, _profile())
	assert_str(String(picked[0]["player"]["id"])).override_failure_message(
		"동점에서 id 순이 아니다").is_equal("P00")
	assert_str(String(picked[1]["player"]["id"])).is_equal("P01")
	assert_str(String(picked[2]["player"]["id"])).is_equal("P02")


## 자리별 인원을 센다 — 뎁스 판정의 입력이다
func test_it_counts_the_depth() -> void:
	var roster: Array = [
		_player({"position": "SP"}), _player({"position": "SP"}),
		_player({"position": "C"}),
	]
	var d: Dictionary = Release.depth_of(roster)
	assert_int(int(d["SP"])).is_equal(2)
	assert_int(int(d["C"])).is_equal(1)


func test_an_empty_roster_releases_nobody() -> void:
	assert_array(Release.pick([], _profile())).is_empty()
	assert_bool(Release.depth_of([]).is_empty()).is_true()
