extends GdUnitTestSuite

## 카퍼스 이벤트 배선 — 세계에서 후보를 모아 결과를 선수에게 돌려준다. B-1.


func _p(id: String, team: String, over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": id, "name": id, "team_id": team,
		"league_id": "LEAGUE_UNIVERSITY", "position": "SP",
		"player_type": "pitcher", "career_status": "active",
		"pitching": {"ovr": 60.0}, "batting": {"ovr": 40.0}}
	p.merge(over, true)
	return p


## 대학 50교 중 앞 12곳으로 세계를 만든다 — 규칙(팀 추천 4명)이 걸릴 만한 크기
func _state(week: int) -> Dictionary:
	var rosters: Dictionary = {}
	var positions: Array = CampusEvents.allstar_rules()["required_positions"]
	var teams: Array = World.teams_of("LEAGUE_UNIVERSITY").slice(0, 12)
	for t in teams:
		var tid: String = String(t["id"])
		var list: Array = []
		for i in positions.size():
			list.append(_p("%s_%02d" % [tid, i], tid, {
				"position": String(positions[i]),
				"pitching": {"ovr": 50.0 + float(i)}}))
		rosters[tid] = list
	return {"day": (week - 1) * 7 + 1, "season_year": 2026,
		"world": {"rosters": rosters}}


func _find(state: Dictionary, id: String) -> Dictionary:
	for tid in state["world"]["rosters"]:
		for p in state["world"]["rosters"][tid]:
			if String(p["id"]) == id:
				return p
	return {}


## 32·34주가 아니면 아무 일도 없다 — 매주 열리면 무대가 뜻을 잃는다
func test_nothing_happens_on_an_ordinary_week() -> void:
	var s: Dictionary = _state(20)
	assert_dict(CampusRunner.run(s)).is_empty()
	assert_bool(s.has("campus_log")).is_false()


## ⚠ **주목도가 실제로 선수에게 붙는다.** 02는 로그만 남기고 아무 데도 안
## 써서, 화면엔 "눈에 띄었다"가 뜨는데 드래프트 순위는 1도 안 움직였다
func test_the_showcase_moves_the_scout_score() -> void:
	var s: Dictionary = _state(32)
	var out: Dictionary = CampusRunner.run(s)
	assert_int(int(out["total"])).is_greater(0)

	var moved: int = 0
	for e in out["entries"]:
		var p: Dictionary = _find(s, String(e["id"]))
		assert_float(float(p["scout_score"])).override_failure_message(
			"%s의 주목도가 안 움직였다" % e["id"]).is_greater(30.0)
		assert_float(float(p["fame"])).is_greater(0.0)
		moved += 1
	assert_int(moved).is_equal(out["entries"].size())


## 안 불린 사람은 그대로다 — 다 오르면 무대에 선 뜻이 없다
func test_the_uninvited_gain_nothing() -> void:
	var s: Dictionary = _state(32)
	var out: Dictionary = CampusRunner.run(s)
	var invited: Dictionary = {}
	for e in out["entries"]:
		invited[String(e["id"])] = true

	var untouched: int = 0
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			if invited.has(String(p["id"])):
				continue
			assert_bool(p.has("scout_score")).override_failure_message(
				"%s는 안 불렸는데 주목도가 붙었다" % p["id"]).is_false()
			untouched += 1
	assert_int(untouched).is_greater(0)


## 올스타는 인기도를 올린다 — 뽑히면 다음 해에 더 뽑히기 쉬워지는
## 양의 되먹임이 02의 결정이다
func test_the_allstar_game_moves_popularity() -> void:
	var s: Dictionary = _state(34)
	var out: Dictionary = CampusRunner.run(s)
	assert_int(out["north"].size() + out["south"].size()).is_greater(0)

	for x in out["north"] + out["south"]:
		var p: Dictionary = _find(s, String(x["id"]))
		assert_float(float(p["popularity"])).override_failure_message(
			"%s가 뽑혔는데 인기도가 안 올랐다" % x["id"]).is_greater(0.0)
		assert_float(float(p["fame"])).is_greater(0.0)


## MVP는 선발 몫에 더 얹는다
func test_the_mvp_gets_more_than_the_rest() -> void:
	var s: Dictionary = _state(34)
	var out: Dictionary = CampusRunner.run(s)
	var mvp: Dictionary = _find(s, String(out["mvp_id"]))
	assert_bool(mvp.is_empty()).is_false()

	var plain: float = -1.0
	for x in out["north"] + out["south"]:
		if String(x["id"]) == String(out["mvp_id"]):
			continue
		plain = float(_find(s, String(x["id"]))["fame"])
		break
	assert_float(float(mvp["fame"])).override_failure_message(
		"MVP가 나머지와 같은 인지도를 받았다").is_greater(plain)


## ⚠ **북/남은 팀 도시에서 나온다.** 안 가르면 한 쪽이 통째로 비어
## "북 vs 남"이 성립을 안 한다
func test_the_region_comes_from_the_city() -> void:
	var out: Dictionary = CampusRunner.run(_state(34))
	assert_int(out["north"].size()).override_failure_message(
		"북이 비었다 — 팀 도시를 안 봤다").is_greater(0)
	assert_int(out["south"].size()).override_failure_message(
		"남이 비었다 — 팀 도시를 안 봤다").is_greater(0)


## ⚠ **주차는 도착한 날짜로 센다.** 한 번에 여러 주를 넘길 때 `state.day`만
## 보면 32주를 지나쳐도 쇼케이스가 안 열리거나 엉뚱한 주에 열린다
func test_the_week_comes_from_the_day_it_is_given() -> void:
	var s: Dictionary = _state(20)
	var out: Dictionary = CampusRunner.run(s, 32 * 7 - 6)
	assert_bool(out.is_empty()).override_failure_message(
		"건네받은 날짜(32주)를 안 보고 state.day(20주)를 봤다").is_false()
	assert_str(String(s["campus_log"][0]["kind"])).is_equal("showcase")


## 학교마다 제일 나은 선수는 무대에 선다 — 능력을 안 보면 아무나 선다
func test_the_best_of_each_school_is_invited() -> void:
	var s: Dictionary = _state(32)
	var invited: Dictionary = {}
	for e in CampusRunner.run(s)["entries"]:
		invited[String(e["id"])] = true
	for tid in s["world"]["rosters"]:
		# 능력치가 50+i라 `_09`가 그 학교 최고다
		assert_bool(invited.has("%s_09" % tid)).override_failure_message(
			"%s의 최고 선수가 안 불렸다 — 능력을 안 봤다" % tid).is_true()


## 대학 소속만 무대에 선다 — 프로가 섞이면 "대학 쇼케이스"가 아니다
func test_only_university_players_are_candidates() -> void:
	var s: Dictionary = _state(32)
	var tid: String = String(s["world"]["rosters"].keys()[0])
	s["world"]["rosters"][tid].append(_p("PRO", tid,
		{"league_id": "LEAGUE_KBL", "pitching": {"ovr": 99.0}}))
	s["world"]["rosters"][tid].append(_p("RETIRED", tid,
		{"career_status": "retired", "pitching": {"ovr": 99.0}}))

	var ids: Array = []
	for p in CampusRunner.candidates_of(s):
		ids.append(String(p["id"]))
	assert_array(ids).is_not_empty()
	assert_array(ids).not_contains(["PRO", "RETIRED"])


## 같은 해·같은 주면 같은 무대다 — 세이브를 다시 열 때마다 달라지면 안 된다
func test_the_same_week_gives_the_same_stage() -> void:
	var a: Dictionary = CampusRunner.run(_state(32))
	var b: Dictionary = CampusRunner.run(_state(32))
	var ids_a: Array = []
	var ids_b: Array = []
	for e in a["entries"]:
		ids_a.append(String(e["id"]))
	for e in b["entries"]:
		ids_b.append(String(e["id"]))
	assert_array(ids_a).is_equal(ids_b)


## 해가 다르면 다른 무대다 — 안 그러면 매년 같은 사람이 눈에 띈다
func test_a_different_year_gives_a_different_stage() -> void:
	var a: Dictionary = _state(32)
	var b: Dictionary = _state(32)
	b["season_year"] = 2031
	var sa: Array = []
	var sb: Array = []
	for e in CampusRunner.run(a)["entries"]:
		sa.append(float(e["day2_score"]))
	for e in CampusRunner.run(b)["entries"]:
		sb.append(float(e["day2_score"]))
	assert_array(sa).override_failure_message(
		"해가 달라도 Day2가 똑같다 — 씨앗에 해가 안 들어갔다").is_not_equal(sb)


## 무슨 일이 있었는지 남는다 — 소식이 이걸 읽는다
func test_it_leaves_a_record() -> void:
	var s: Dictionary = _state(34)
	CampusRunner.run(s)
	var log: Array = s["campus_log"]
	assert_int(log.size()).is_equal(1)
	assert_str(String(log[0]["kind"])).is_equal("allstar")
	assert_int(int(log[0]["day"])).is_equal(int(s["day"]))
	assert_array(["north", "south", "draw"]).contains([String(log[0]["winner"])])


## 대학이 없는 세계에선 아무 일도 없다 (프로만 있는 세이브)
func test_a_world_without_universities_is_quiet() -> void:
	var s: Dictionary = {"day": 32 * 7 - 6, "season_year": 2026,
		"world": {"rosters": {}}}
	assert_dict(CampusRunner.run(s)).is_empty()
	assert_bool(s.has("campus_log")).is_false()
