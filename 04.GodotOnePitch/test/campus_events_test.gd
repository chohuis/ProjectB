extends GdUnitTestSuite

## 카퍼스 이벤트 — 쇼케이스·올스타. B-1.
##
## ⚠ **둘의 역할이 다르다.** 쇼케이스는 주목도 급등 경로고 올스타는 선발
## 자체가 서사다 — 그래서 선발 규칙이 다르다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _c(id: String, over: Dictionary = {}) -> Dictionary:
	var c: Dictionary = {"id": id, "name": id, "team_id": "U1",
		"region": "north", "position": "SP", "ovr": 60.0, "form": 0.0,
		"scout_score": 50.0, "popularity": 50.0, "is_protagonist": false}
	c.merge(over, true)
	return c


## n개 대학 × m명 — 쇼케이스 경로를 시험할 만한 크기
func _pool(teams: int, per_team: int) -> Array:
	var out: Array = []
	for t in teams:
		for i in per_team:
			out.append(_c("U%02d_P%02d" % [t, i], {"team_id": "U%02d" % t,
				"ovr": 50.0 + float(i), "scout_score": 40.0 + float(i)}))
	return out


func _ids(list: Array) -> Array:
	var out: Array = []
	for x in list:
		out.append(String(x["id"]))
	return out


# ── 규칙 ──────────────────────────────────────────────────────

func test_the_rules_are_loaded() -> void:
	assert_bool(CampusEvents.rules().is_empty()).override_failure_message(
		"카퍼스 규칙이 비었다").is_false()
	assert_int(int(CampusEvents.showcase_rules()["week"])).is_equal(32)
	assert_int(int(CampusEvents.allstar_rules()["week"])).is_equal(34)
	assert_int(int(CampusEvents.allstar_rules()["squad_size"])).is_equal(24)
	assert_int(int(CampusEvents.allstar_rules()["per_school_cap"])).is_equal(2)


## 도시가 목록에 없으면 북이다 — 수도권·중부가 기본값
func test_the_region_defaults_to_north() -> void:
	assert_str(CampusEvents.region_of("부산")).is_equal("south")
	assert_str(CampusEvents.region_of("광주")).is_equal("south")
	assert_str(CampusEvents.region_of("서울")).is_equal("north")
	assert_str(CampusEvents.region_of("")).is_equal("north")


func test_form_counts_towards_the_rating() -> void:
	var hot: Dictionary = _c("A", {"ovr": 60.0, "form": 1.0})
	assert_float(CampusEvents.rating(hot)).is_equal(68.0)
	assert_float(CampusEvents.rating(_c("B"))).is_equal(60.0)


# ── 쇼케이스 ──────────────────────────────────────────────────

## ⚠ **팀마다 고정 인원이다.** 순위순으로 자르면 명문 상위권만 모여
## "이미 아는 이름"만 나온다
func test_every_school_gets_a_seat() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(10, 10), _rng())
	var by_team: Dictionary = {}
	for e in out["entries"]:
		if String(e["route"]) != "recommend":
			continue
		by_team[String(e["team_id"])] = int(by_team.get(String(e["team_id"]), 0)) + 1

	assert_int(by_team.size()).override_failure_message(
		"추천을 받은 학교가 %d곳뿐이다 (10곳이어야 한다)" % by_team.size()).is_equal(10)
	for tid in by_team:
		assert_int(int(by_team[tid])).is_equal(4)


## 팀 추천은 그 팀에서 제일 나은 넷이다
func test_the_recommendation_takes_the_best_of_each_school() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(1, 10), _rng())
	var ids: Array = []
	for e in out["entries"]:
		if String(e["route"]) == "recommend":
			ids.append(String(e["id"]))
	ids.sort()
	# ovr 50+i라 P09~P06이 상위 넷이다 (순서는 Day2가 다시 매기므로 뜻이 없다)
	assert_array(ids).is_equal(["U00_P06", "U00_P07", "U00_P08", "U00_P09"])


## ⚠ **세 경로가 다 있어야 한다.** 하나로 하면 명문 상위권만 모인다
func test_all_three_routes_are_used() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(10, 10), _rng())
	var routes: Dictionary = {}
	for e in out["entries"]:
		routes[String(e["route"])] = true
	assert_array(routes.keys()).contains(["recommend", "top_scout", "club_pick"])


## 같은 사람이 두 경로로 안 들어온다
func test_nobody_is_invited_twice() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(10, 10), _rng())
	var seen: Dictionary = {}
	for e in out["entries"]:
		assert_bool(seen.has(String(e["id"]))).override_failure_message(
			"%s가 두 번 초청됐다" % e["id"]).is_false()
		seen[String(e["id"])] = true
	assert_int(int(out["total"])).is_equal(out["entries"].size())


## ⚠ **Day2에 운이 섞인다.** 없으면 참가가 형식이 되고 순위가 능력치 순으로
## 그대로 나온다
func test_luck_shuffles_day_two() -> void:
	var a: Dictionary = CampusEvents.showcase(_pool(5, 5), _rng(1))
	var b: Dictionary = CampusEvents.showcase(_pool(5, 5), _rng(2))
	assert_array(_ids(a["entries"])).override_failure_message(
		"난수를 바꿔도 순위가 같다 — 운이 안 섞였다").is_not_equal(_ids(b["entries"]))


## 상위 12%만 눈에 띈다 — 전원이 눈에 띄면 뜻이 없다
func test_only_the_top_stand_out() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(10, 10), _rng())
	var standouts: int = 0
	for e in out["entries"]:
		if bool(e["standout"]):
			standouts += 1
	var expected: int = int(roundf(float(out["entries"].size()) * 0.12))
	assert_int(standouts).is_equal(expected)
	assert_int(standouts).is_greater(0)
	assert_int(standouts).is_less(out["entries"].size())


## 눈에 띄면 주목도를 더 받는다 — 그게 이 이벤트의 뜻이다
func test_a_standout_gets_more() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(10, 10), _rng())
	var top: Dictionary = out["entries"][0]
	var bottom: Dictionary = out["entries"][out["entries"].size() - 1]
	assert_bool(bool(top["standout"])).is_true()
	assert_float(float(top["scout_gain"])).override_failure_message(
		"눈에 띄어도 주목도가 같다").is_greater(float(bottom["scout_gain"]))


## ⚠ **운이 실력을 덮으면 안 된다.** Day2가 운뿐이면 무대에 서는 뜻이 없다 —
## 능력 70%가 30%짜리 운을 이긴다
func test_day_two_still_rewards_the_better_player() -> void:
	var pool: Array = [
		_c("STRONG", {"team_id": "U00", "ovr": 90.0}),
		_c("WEAK", {"team_id": "U00", "ovr": 40.0})]
	var strong_first: int = 0
	for i in 60:
		var out: Dictionary = CampusEvents.showcase(pool, _rng(i))
		if String(out["entries"][0]["id"]) == "STRONG":
			strong_first += 1
	assert_int(strong_first).override_failure_message(
		"60번 중 %d번만 잘하는 쪽이 앞섰다 — 운이 실력을 덮었다" % strong_first) \
		.is_equal(60)


## Day2 성적순으로 줄을 세운다 — 뒤집히면 상위 12%가 하위 12%가 된다
func test_the_entries_are_ranked_by_day_two() -> void:
	var entries: Array = CampusEvents.showcase(_pool(10, 10), _rng())["entries"]
	for i in range(1, entries.size()):
		assert_float(float(entries[i - 1]["day2_score"])).override_failure_message(
			"%d번째가 %d번째보다 낮다 — 줄이 뒤집혔다" % [i - 1, i]) \
			.is_greater_equal(float(entries[i]["day2_score"]))


## 참가만 해도 받는 게 있다
func test_attending_is_worth_something() -> void:
	var out: Dictionary = CampusEvents.showcase(_pool(10, 10), _rng())
	for e in out["entries"]:
		assert_float(float(e["scout_gain"])).is_greater_equal(4.0)
		assert_float(float(e["fame_gain"])).is_greater(0.0)


func test_it_says_whether_i_was_invited() -> void:
	var pool: Array = _pool(3, 3)
	assert_bool(bool(CampusEvents.showcase(pool, _rng())["protagonist_invited"])) \
		.is_false()

	pool.append(_c("ME", {"team_id": "U00", "ovr": 99.0, "is_protagonist": true}))
	assert_bool(bool(CampusEvents.showcase(pool, _rng())["protagonist_invited"])) \
		.is_true()


func test_an_empty_pool_is_an_empty_showcase() -> void:
	var out: Dictionary = CampusEvents.showcase([], _rng())
	assert_array(out["entries"]).is_empty()
	assert_int(int(out["total"])).is_equal(0)


# ── 올스타 ────────────────────────────────────────────────────

## 북/남 각각 24명 · 대학당 2명 · 열 자리를 채우는 후보 풀
func _allstar_pool() -> Array:
	var positions: Array = CampusEvents.allstar_rules()["required_positions"]
	var out: Array = []
	for side in ["north", "south"]:
		for s in 20:
			for i in positions.size():
				out.append(_c("%s_S%02d_%s" % [side, s, positions[i]], {
					"team_id": "%s_U%02d" % [side, s], "region": side,
					"position": String(positions[i]),
					"ovr": 50.0 + float((s * 3 + i) % 40),
					"popularity": 40.0 + float((s * 7 + i) % 50)}))
	return out


## ⚠ **인기도가 실제로 들어간다.** 안 보면 "그냥 OVR 상위 24명"이 되고
## 인기도라는 스탯이 여기서도 죽는다
func test_popularity_counts_towards_selection() -> void:
	var plain: Dictionary = _c("A", {"ovr": 70.0, "popularity": 0.0})
	var famous: Dictionary = _c("B", {"ovr": 70.0, "popularity": 99.0})
	assert_float(CampusEvents.allstar_score(famous)).override_failure_message(
		"인기도가 선발 점수에 안 닿는다").is_greater(
		CampusEvents.allstar_score(plain))


func test_each_side_fills_its_squad() -> void:
	var north: Array = CampusEvents.allstar_side(_allstar_pool(), "north")
	assert_int(north.size()).is_equal(24)
	for x in north:
		assert_str(String(x["side"])).is_equal("north")


## ⚠ **캡이 핵심이다.** 없으면 명문 한 곳이 라인업을 통째로 채워
## "북 vs 남"이 아니라 "A대 vs B대"가 된다
func test_no_school_takes_over_the_squad() -> void:
	var north: Array = CampusEvents.allstar_side(_allstar_pool(), "north")
	var per_school: Dictionary = {}
	for x in north:
		var tid: String = String(x["team_id"])
		per_school[tid] = int(per_school.get(tid, 0)) + 1
	for tid in per_school:
		assert_int(int(per_school[tid])).override_failure_message(
			"%s가 %d명이다 (캡 2)" % [tid, per_school[tid]]).is_less_equal(2)


## ⚠ **각 자리를 최소 한 명은 채운다.** 점수순으로만 뽑으면 OVR이 몰리는
## 포지션만 남아 라인업이 안 짜인다
func test_every_position_is_filled() -> void:
	var north: Array = CampusEvents.allstar_side(_allstar_pool(), "north")
	var got: Dictionary = {}
	for x in north:
		got[String(x["position"])] = true
	for pos in CampusEvents.allstar_rules()["required_positions"]:
		assert_bool(got.has(String(pos))).override_failure_message(
			"%s 자리가 비었다" % pos).is_true()


## C가 딱 두 명뿐인 풀. 점수 높은 쪽(U00)은 자기 학교가 이미 캡 2라 못 들어오고,
## 낮은 쪽(U12)만 들어올 수 있다. 나머지 24명이 정확히 정원을 채운다
func _capped_pool(with_backup_catcher: bool) -> Array:
	var slots: Array = ["1B", "1B", "2B", "2B", "3B", "3B", "SS", "SS",
		"LF", "LF", "CF", "CF", "RF", "RF", "RP", "RP",
		"SP", "SP", "SP", "SP", "SP", "SP", "SP", "SP"]
	var out: Array = []
	for k in 12:
		for j in 2:
			out.append(_c("U%02d_%d" % [k, j], {"team_id": "U%02d" % k,
				"position": String(slots[k * 2 + j]), "ovr": 90.0}))
	# U00은 이미 캡 2다 — 이 포수는 못 들어온다
	out.append(_c("U00_C", {"team_id": "U00", "position": "C", "ovr": 60.0}))
	# 1B는 이미 차 있다 — 여기 손을 대면 안 된다
	out.append(_c("U13_1B", {"team_id": "U13", "position": "1B", "ovr": 50.0}))
	if with_backup_catcher:
		out.append(_c("U12_C", {"team_id": "U12", "position": "C", "ovr": 55.0}))
	return out


## ⚠ **캡에 막히면 다음 후보를 본다.** 최고 후보 하나만 보고 포기하면
## 그 학교가 이미 둘인 순간 포지션이 통째로 빈다 — 02가 그렇게 짜서
## 1B가 빈 라인업이 나왔다
func test_a_capped_school_does_not_leave_the_position_empty() -> void:
	var north: Array = CampusEvents.allstar_side(_capped_pool(true), "north")
	var catchers: Array = []
	for x in north:
		if String(x["position"]) == "C":
			catchers.append(String(x["id"]))
	assert_array(catchers).override_failure_message(
		"캡에 막힌 뒤 다음 후보를 안 봐서 포수 자리가 비었다").is_equal(["U12_C"])

	# ⚠ **이미 찬 자리는 건드리지 않는다.** 건드리면 멀쩡한 선발을 빼고
	# 더 약한 후보로 갈아 끼운다 (U13_1B가 들어오면 그게 일어난 것이다)
	var quota: int = 0
	for x in north:
		if bool(x["by_quota"]):
			quota += 1
			assert_str(String(x["id"])).is_equal("U12_C")
	assert_int(quota).override_failure_message(
		"쿼터로 %d명이 들어왔다 — 이미 찬 자리까지 갈아 끼웠다" % quota).is_equal(1)


## ⚠ **채울 사람이 아무도 없으면 원상복구한다.** 안 하면 자리를 비운 채
## 정원이 하나 줄어든다 — 캡이 라인업보다 우선이라는 결정의 대가다
func test_an_unfillable_position_keeps_the_squad_intact() -> void:
	var north: Array = CampusEvents.allstar_side(_capped_pool(false), "north")
	assert_int(north.size()).override_failure_message(
		"채울 사람이 없는데 자리를 비운 채 %d명이 됐다" % north.size()).is_equal(24)
	for x in north:
		assert_str(String(x["position"])).is_not_equal("C")


## SP 5 · RP 5로 두 자리가 똑같이 두껍다. 포수 하나가 비어 있다
func _tied_pool() -> Array:
	var slots: Array = []
	for i in 5:
		slots.append("SP")
	for i in 5:
		slots.append("RP")
	for p in ["1B", "2B", "3B", "SS", "LF", "CF", "RF"]:
		slots.append(p)
		slots.append(p)
	var out: Array = []
	for i in slots.size():
		out.append(_c("T%02d" % i, {"team_id": "T%02d" % i,
			"position": String(slots[i]), "ovr": 90.0}))
	out.append(_c("SPARE_C", {"team_id": "TC", "position": "C", "ovr": 50.0}))
	return out


## 제일 두꺼운 자리가 둘이면 어느 쪽을 얇게 할지 정해져 있어야 한다 —
## 아니면 같은 세이브를 열 때마다 라인업이 달라진다
func test_the_thinned_position_is_pinned() -> void:
	var north: Array = CampusEvents.allstar_side(_tied_pool(), "north")
	var count: Dictionary = {}
	for x in north:
		count[String(x["position"])] = int(count.get(String(x["position"]), 0)) + 1
	assert_int(int(count.get("RP", 0))).override_failure_message(
		"동수일 때 얇게 할 자리가 안 정해져 있다").is_equal(4)
	assert_int(int(count.get("SP", 0))).is_equal(5)
	assert_int(int(count.get("C", 0))).is_equal(1)


## UX만 포수 후보를 갖고 있고, UX는 이미 SP 둘로 캡이 찼다.
## **UX의 SP 하나를 빼면 그 자리가 열린다**
func _freed_cap_pool() -> Array:
	var slots: Array = []
	for p in ["1B", "2B", "3B", "SS", "LF", "CF", "RF", "RP"]:
		slots.append(p)
		slots.append(p)
	for i in 6:
		slots.append("SP")
	var out: Array = []
	for i in slots.size():
		out.append(_c("T%02d" % i, {"team_id": "T%02d" % i,
			"position": String(slots[i]), "ovr": 90.0}))
	# SP 중 제일 약한 둘 — 뺄 사람은 여기서 나와야 한다
	out.append(_c("UX_SP0", {"team_id": "UX", "position": "SP", "ovr": 80.0}))
	out.append(_c("UX_SP1", {"team_id": "UX", "position": "SP", "ovr": 80.0}))
	out.append(_c("UX_C", {"team_id": "UX", "position": "C", "ovr": 60.0}))
	return out


## ⚠ **뺀 자리는 학교 몫에서도 빠진다.** 안 빼면 그 학교는 한 명이 나갔는데도
## 캡에 걸린 채로 남아 자기 학교 후보가 못 들어온다 — 포지션이 빈다
func test_evicting_frees_the_school_slot() -> void:
	var north: Array = CampusEvents.allstar_side(_freed_cap_pool(), "north")
	var ids: Array = _ids(north)
	# ⚠ **제일 약한 쪽을 뺀다.** 센 쪽을 빼면 UX 자리가 안 열려 포수가 빈다
	assert_array(ids).override_failure_message(
		"UX의 SP 하나를 빼서 생긴 자리로 UX의 포수가 들어와야 하는데 안 들어왔다") \
		.contains(["UX_C"])
	assert_int(north.size()).is_equal(24)


## ⚠ **얇으면 그냥 얇게 둔다.** 한 명뿐인 자리를 빼서 다른 빈 자리를 채우면
## 빈 자리 수는 그대로인데 라인업만 흔들린다
func test_a_thin_squad_is_not_churned() -> void:
	# A는 1B·2B로 캡 2가 찼다 — A의 유격수는 못 들어온다
	var pool: Array = [
		_c("A_1B", {"team_id": "A", "position": "1B", "ovr": 90.0}),
		_c("A_2B", {"team_id": "A", "position": "2B", "ovr": 85.0}),
		_c("B_3B", {"team_id": "B", "position": "3B", "ovr": 80.0}),
		_c("A_SS", {"team_id": "A", "position": "SS", "ovr": 70.0})]
	var north: Array = CampusEvents.allstar_side(pool, "north")
	var ids: Array = _ids(north)
	ids.sort()
	assert_array(ids).override_failure_message(
		"한 명뿐인 자리를 빼서 다른 빈 자리를 채웠다 — 빈 자리 수는 그대로다") \
		.is_equal(["A_1B", "A_2B", "B_3B"])


## 한 쪽만 뽑는다 — 섞이면 "북 vs 남"이 아니다
func test_the_sides_do_not_mix() -> void:
	var pool: Array = _allstar_pool()
	var south: Array = CampusEvents.allstar_side(pool, "south")
	for x in south:
		assert_str(String(x["team_id"])).contains("south")


# ── 올스타전 ──────────────────────────────────────────────────

func test_the_game_produces_a_result() -> void:
	var out: Dictionary = CampusEvents.allstar(_allstar_pool(), _rng())
	assert_int(out["north"].size()).is_equal(24)
	assert_int(out["south"].size()).is_equal(24)
	assert_int(int(out["north_score"])).is_greater_equal(0)
	assert_array(["north", "south", "draw"]).contains([String(out["winner"])])


## ⚠ **한 판이라 운이 크다.** 없으면 강한 쪽이 늘 같은 점수로 이기고
## 올스타전이 결과를 미리 아는 경기가 된다
func test_the_scoreline_varies_with_the_seed() -> void:
	var pool: Array = _allstar_pool()
	var lines: Dictionary = {}
	for i in 10:
		var out: Dictionary = CampusEvents.allstar(pool, _rng(i))
		lines["%d-%d" % [out["north_score"], out["south_score"]]] = true
	assert_int(lines.size()).override_failure_message(
		"10번 돌려 점수가 %d가지뿐이다 — 운이 안 들어갔다" % lines.size()) \
		.is_greater(1)


## MVP는 그날 제일 잘한 사람이다 — 아무나면 상이 뜻을 잃는다
func test_the_mvp_is_the_best_on_the_winning_side() -> void:
	var out: Dictionary = CampusEvents.allstar(_allstar_pool(), _rng(5))
	var side: Array = out["north"]
	if String(out["winner"]) == "south":
		side = out["south"]
	elif String(out["winner"]) == "draw":
		side = out["north"] + out["south"]
	var best: float = -1.0
	for x in side:
		best = maxf(best, float(x["score"]))
	var mvp_score: float = -1.0
	for x in side:
		if String(x["id"]) == String(out["mvp_id"]):
			mvp_score = float(x["score"])
	assert_float(mvp_score).override_failure_message(
		"MVP 점수가 %.1f인데 그 팀 최고는 %.1f다" % [mvp_score, best]).is_equal(best)


## MVP는 이긴 쪽에서 나온다 — 진 쪽에서 나오면 상이 뜻을 잃는다
func test_the_mvp_comes_from_the_winner() -> void:
	var out: Dictionary = CampusEvents.allstar(_allstar_pool(), _rng(5))
	if String(out["winner"]) == "draw":
		return
	var side: Array = out["north"] if String(out["winner"]) == "north" else out["south"]
	assert_array(_ids(side)).override_failure_message(
		"진 쪽에서 MVP가 나왔다").contains([String(out["mvp_id"])])


## 북이 남보다 30 높다 — 전력 차가 상한(edge 1.0)까지 벌어진 판
func _lopsided_pool() -> Array:
	var pool: Array = []
	var positions: Array = CampusEvents.allstar_rules()["required_positions"]
	for side in ["north", "south"]:
		var bonus: float = 30.0 if side == "north" else 0.0
		for s in 20:
			for i in positions.size():
				pool.append(_c("%s_S%02d_%s" % [side, s, positions[i]], {
					"team_id": "%s_U%02d" % [side, s], "region": side,
					"position": String(positions[i]),
					"ovr": 50.0 + bonus, "popularity": 50.0}))
	return pool


## ⚠ **전력 차가 두 점수에 다 실린다.** 한쪽에만 실으면 강팀이 이기긴 해도
## 약팀이 제 실력보다 후한 점수를 받는다 — 점수판이 거짓말을 한다
func test_the_edge_moves_both_scores() -> void:
	var pool: Array = _lopsided_pool()
	for i in 60:
		var out: Dictionary = CampusEvents.allstar(pool, _rng(i))
		# 기저 4 ± 1.5, 운 0~5 → 강팀 [6,10] · 약팀 [3,7]
		assert_int(int(out["north_score"])).override_failure_message(
			"강팀이 %d점이다 — 전력 차가 강팀 점수에 안 실렸다" % out["north_score"]) \
			.is_between(6, 10)
		assert_int(int(out["south_score"])).override_failure_message(
			"약팀이 %d점이다 — 전력 차가 약팀 점수에 안 실렸다" % out["south_score"]) \
			.is_between(3, 7)


## ⚠ **전력은 평균이다.** 합계로 재면 인원이 많은 쪽이 세다고 나온다 —
## 정원이 안 찬 쪽(후보가 얇은 지역)이 억울하게 진다
func test_strength_is_an_average_not_a_sum() -> void:
	var positions: Array = CampusEvents.allstar_rules()["required_positions"]
	var pool: Array = []
	# 북 24명, 평범 / 남 5명, 특급 — 평균은 남이 위, 합계는 북이 위다
	for s in 12:
		for j in 2:
			pool.append(_c("N%02d_%d" % [s, j], {"team_id": "N%02d" % s,
				"region": "north", "position": String(positions[(s * 2 + j) % 10]),
				"ovr": 60.0, "popularity": 50.0}))
	for i in 5:
		pool.append(_c("S%d" % i, {"team_id": "S%d" % i, "region": "south",
			"position": String(positions[i]), "ovr": 99.0, "popularity": 99.0}))

	var south_wins: int = 0
	for i in 40:
		if String(CampusEvents.allstar(pool, _rng(i))["winner"]) == "south":
			south_wins += 1
	assert_int(south_wins).override_failure_message(
		"40번 중 특급 5명이 %d번 이겼다 — 인원 수로 전력을 쟀다" % south_wins) \
		.is_greater(20)


## 전력이 세면 더 자주 이긴다 — 운만이면 선발이 뜻을 잃는다
func test_the_stronger_side_wins_more() -> void:
	var pool: Array = _lopsided_pool()
	var north_wins: int = 0
	for i in 40:
		if String(CampusEvents.allstar(pool, _rng(i))["winner"]) == "north":
			north_wins += 1
	assert_int(north_wins).override_failure_message(
		"40번 중 강팀이 %d번 이겼다 — 전력이 결과에 안 닿는다" % north_wins) \
		.is_greater(20)


func test_it_says_whether_i_was_selected() -> void:
	var pool: Array = _allstar_pool()
	assert_bool(bool(CampusEvents.allstar(pool, _rng())["protagonist_selected"])) \
		.is_false()

	pool.append(_c("ME", {"team_id": "north_UME", "region": "north",
		"position": "SP", "ovr": 99.0, "popularity": 99.0, "is_protagonist": true}))
	var out: Dictionary = CampusEvents.allstar(pool, _rng())
	assert_bool(bool(out["protagonist_selected"])).is_true()
	assert_str(String(out["protagonist_side"])).is_equal("north")


func test_an_empty_pool_plays_no_game() -> void:
	var out: Dictionary = CampusEvents.allstar([], _rng())
	assert_array(out["north"]).is_empty()
	assert_str(String(out["mvp_id"])).is_empty()
