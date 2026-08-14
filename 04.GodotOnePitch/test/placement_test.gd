extends GdUnitTestSuite

## 진로 배정 — M9-14.
##
## 대학 → 프로 2군(육성) → 독립 → 포기.
##
## ⚠ **04는 2군이 빠져 있었다.** 그래서 매년 900명 안팎이 야구를 그만뒀다.
## 02도 같은 결함을 겪었고(그해 미지명자 1,373명 중 2군행 **0명**) 원인은
## 육성선수 몫을 정원 밖으로 안 둔 것이었다.


func _world() -> Dictionary:
	return {"rosters": {}}


func _player(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "P1", "player_type": "pitcher", "age": 19,
		"team_id": "", "league_id": Promotion.DRAFT_POOL,
		"pitching": {"ovr": 60.0}, "batting": {"ovr": 40.0},
		"career_history": [{"year": 2027, "league_id": "LEAGUE_HIGHSCHOOL"}],
	}
	p.merge(over, true)
	return p


func _fill(world: Dictionary, league_id: String, per_team: int) -> void:
	for t in World.teams_of(league_id):
		var tid: String = String(t["id"])
		world["rosters"][tid] = []
		for i in per_team:
			world["rosters"][tid].append({"id": "%s_%d" % [tid, i],
				"team_id": tid, "league_id": league_id,
				"player_type": "pitcher" if i % 2 == 0 else "batter"})


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **대학이 먼저다.** 고졸 미지명자의 기본 경로다
func test_a_high_school_graduate_goes_to_university_first() -> void:
	var w: Dictionary = _world()
	var to: Dictionary = Placement.route_for(w, _player(), {}, {})
	assert_str(String(to["league_id"])).is_equal(Placement.UNIVERSITY)


## ⚠ **대학은 고교 졸업자만.** 남는 자리부터 채우면 대졸 미지명자가
## 대학 1학년으로 **다시 입학**한다
func test_a_college_graduate_cannot_re_enrol() -> void:
	# ⚠ **마지막 소속을 본다.** 첫 소속을 보면 고교를 거친 사람은 대학·독립을
	# 아무리 지나도 영영 "고졸"이라 계속 대학에 다시 들어간다
	var p: Dictionary = _player({"age": 22, "career_history": [
		{"year": 2026, "league_id": "LEAGUE_HIGHSCHOOL"},
		{"year": 2027, "league_id": "LEAGUE_UNIVERSITY"},
	]})
	assert_str(String(Placement.route_for(_world(), p, {}, {})["league_id"])) \
		.override_failure_message("대졸이 대학에 다시 들어갔다") \
		.is_not_equal(Placement.UNIVERSITY)


## ⚠ **2군이 독립보다 먼저다.** 2군은 유입이 하위 라운드 지명뿐인데 1군이
## 콜업으로 계속 빼간다 — 02 실측에서 야수 29명에 **투수 6명**이 됐다
func test_the_farm_comes_before_the_independent_league() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	assert_str(String(Placement.route_for(w, _player(), {}, {})["league_id"])) \
		.is_equal(Placement.FARM)


func test_the_independent_league_is_the_last_stop() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	_fill(w, Placement.FARM,
		RosterMaintenance.roster_max_of(Placement.FARM) + Placement.DEVELOPMENT_MAX)
	assert_str(String(Placement.route_for(w, _player(), {}, {})["league_id"])) \
		.is_equal(Placement.INDEPENDENT)


func test_nowhere_to_go_means_quitting() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	_fill(w, Placement.FARM,
		RosterMaintenance.roster_max_of(Placement.FARM) + Placement.DEVELOPMENT_MAX)
	_fill(w, Placement.INDEPENDENT, Placement.INDEPENDENT_MAX)
	assert_bool(Placement.route_for(w, _player(), {}, {}).is_empty()).is_true()


# ── 정원 ──────────────────────────────────────────────────────

## ⚠ **대학은 한 해에 받는 인원이 따로 있다.** 팀 정원만 보면 어느 해에
## 왕창 받고 4년 뒤 그 코호트가 한꺼번에 빠져나가는 주기가 생긴다 —
## 02 실측 대학 유입이 194~558로 진동했고 저점 해의 졸업생은 갈 곳이 없어
## 대량으로 그만뒀다(포기 630~1,163명)
## ⚠ **기대값을 상수에서 계산하지 않는다.** `teams * UNIVERSITY_ANNUAL_MAX`로
## 쓰면 그 상수를 바꾸는 변이가 기대값도 같이 바꿔서 **검사가 아무것도 안 본다.**
## 50팀 × 8명 = 400을 그대로 적는다
func test_the_university_has_a_yearly_cap() -> void:
	var w: Dictionary = _world()
	var teams: int = World.teams_of(Placement.UNIVERSITY).size()
	assert_int(teams).is_equal(50)

	var people: Array = []
	for i in 450:
		people.append(_player({"id": "P%03d" % i}))
	var out: Dictionary = Placement.place_all(w, people, 2027, "t", "r")

	assert_int(int(out["by_league"].get(Placement.UNIVERSITY, 0))) \
		.override_failure_message("대학이 한 해에 %s명을 받았다 — 상한은 400명이다"
			% out["by_league"].get(Placement.UNIVERSITY, 0)).is_equal(400)


## ⚠ **유입 카운터를 한 해 동안 이어 쓴다.** 사람마다 새로 만들면 상한이
## 한 번도 안 걸린다 — 위 검사가 `place_all`을 거치는 이유다
func test_the_yearly_counter_is_shared_across_the_batch() -> void:
	var w: Dictionary = _world()
	var intake: Dictionary = {}
	var first: String = String(World.teams_of(Placement.UNIVERSITY)[0]["id"])

	# 한 팀에 상한만큼 이미 받았다고 표시해 두면 그 팀은 더 못 받는다
	intake[first] = 8
	var p: Dictionary = _player()
	Placement.place(w, p, 2027, "t", "r", intake, {})
	assert_str(String(p["team_id"])).override_failure_message(
		"한 해 정원이 찬 팀이 또 받았다").is_not_equal(first)


## ⚠ **육성선수는 정원 밖 인원이다.** 정식 정원을 그대로 쓰면 로스터가 찬
## 순간 자리가 사라진다 — 02 실측에서 2군 여유가 5자리라 그해 미지명자
## 1,373명 중 **2군에 간 사람이 0명**이었다
func test_development_slots_sit_on_top_of_the_roster_limit() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	# 2군을 **정식 정원까지** 채운다 — 그래도 육성 자리는 남아야 한다
	_fill(w, Placement.FARM, RosterMaintenance.roster_max_of(Placement.FARM))

	assert_str(String(Placement.route_for(w, _player(), {}, {})["league_id"])) \
		.override_failure_message("정식 정원이 차자 2군 자리가 사라졌다") \
		.is_equal(Placement.FARM)


## 육성 상한을 넘으면 더 못 받는다 — 무제한이면 2군이 육성선수로 채워져
## 드래프트 지명의 가치가 사라진다.
##
## ⚠ **2군을 정원보다 **얇게** 채워 둔다.** 딱 정원까지 채우면 남은 자리
## 수가 마침 육성 상한과 같아져서, 상한을 빼도 결과가 똑같다 — 검사가
## 아무것도 안 본다.
##
## ⚠ **기대값도 상수에서 계산하지 않는다.** 10팀 × 10명 = 100을 그대로 적는다
func test_the_development_slots_run_out() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	# 정원 34인데 20명만 — 상한이 없으면 팀당 24명까지 들어간다
	_fill(w, Placement.FARM, 20)
	assert_int(World.teams_of(Placement.FARM).size()).is_equal(10)

	var people: Array = []
	for i in 300:
		people.append(_player({"id": "P%03d" % i,
			"career_history": [{"year": 2027, "league_id": "LEAGUE_KBL"}]}))
	var out: Dictionary = Placement.place_all(w, people, 2027, "t", "r")

	assert_int(int(out["by_league"].get(Placement.FARM, 0))) \
		.override_failure_message("2군이 %s명을 받았다 — 상한은 10팀 × 10 = 100명이다"
			% out["by_league"].get(Placement.FARM, 0)).is_equal(100)


## 독립리그는 나이 상한이 있다 — 서른 넘은 사람을 받으면 독립 로스터가
## 은퇴 직전 선수로만 채워진다
func test_the_independent_league_turns_away_the_old() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	_fill(w, Placement.FARM,
		RosterMaintenance.roster_max_of(Placement.FARM) + Placement.DEVELOPMENT_MAX)

	var old: Dictionary = _player({"age": Placement.INDEPENDENT_AGE_MAX + 1,
		"career_history": [{"year": 2027, "league_id": "LEAGUE_KBL"}]})
	assert_bool(Placement.route_for(w, old, {}, {}).is_empty()).override_failure_message(
		"서른둘이 독립리그에 들어갔다").is_true()

	var young: Dictionary = _player({"age": Placement.INDEPENDENT_AGE_MAX,
		"career_history": [{"year": 2027, "league_id": "LEAGUE_KBL"}]})
	assert_str(String(Placement.route_for(w, young, {}, {})["league_id"])) \
		.is_equal(Placement.INDEPENDENT)


# ── 보직 ──────────────────────────────────────────────────────

## ⚠ **투수와 야수를 가려 받는다.** 자리 수만 보면 한 리그가 한쪽으로
## 쏠린다 — 02에서 2군이 야수 29명 대 투수 6명이 됐다
func test_a_team_short_of_pitchers_takes_a_pitcher() -> void:
	var w: Dictionary = _world()
	var teams: Array = World.teams_of(Placement.UNIVERSITY)
	# 첫 팀은 야수만, 둘째 팀은 투수만
	for i in teams.size():
		var tid: String = String(teams[i]["id"])
		w["rosters"][tid] = []
		for j in 10:
			w["rosters"][tid].append({"id": "%s_%d" % [tid, j], "team_id": tid,
				"player_type": "batter" if i == 0 else "pitcher"})

	assert_str(Placement.find_team(w, Placement.UNIVERSITY, true,
		Placement.UNIVERSITY_MAX)).override_failure_message(
		"투수가 모자란 팀이 투수를 안 받았다").is_equal(String(teams[0]["id"]))
	assert_str(Placement.find_team(w, Placement.UNIVERSITY, false,
		Placement.UNIVERSITY_MAX)).is_not_equal(String(teams[0]["id"]))


# ── 보낸 뒤 ───────────────────────────────────────────────────

func test_going_to_university_makes_you_a_freshman() -> void:
	var w: Dictionary = _world()
	var p: Dictionary = _player()
	assert_bool(Placement.place(w, p, 2027, "draft_undrafted", "미지명", {}, {})).is_true()
	assert_str(String(p["league_id"])).is_equal(Placement.UNIVERSITY)
	assert_int(int(p["grade"])).override_failure_message(
		"대학에 갔는데 1학년이 아니다").is_equal(1)
	assert_bool(World.roster_of(w, String(p["team_id"])).has(p)).is_true()


## ⚠ **2군으로 갔으면 드래프트 지명자와 다른 신분이다.** 소속이 아니라
## 신분을 남긴다 — 강등된 정식 선수도 2군에 있으므로 리그로 판정하면
## 그 사람까지 육성선수가 된다
func test_the_farm_makes_you_a_development_player() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	# ⚠ **학년을 들고 온 사람으로 본다.** 학년이 없는 사람으로 보면
	# "학년을 지우는가"를 검사가 못 본다 — 지우든 말든 결과가 같다
	var p: Dictionary = _player({"grade": 3})
	Placement.place(w, p, 2027, "draft_undrafted", "미지명", {}, {})

	assert_str(String(p["league_id"])).is_equal(Placement.FARM)
	assert_int(int(p["salary"])).override_failure_message(
		"육성선수 연봉이 최저연봉(3000) 아래가 아니다") \
		.is_equal(Placement.DEVELOPMENT_SALARY)
	assert_int(int(p["salary"])).is_less(3000)
	# **단년이다** — 한 해 안에 증명해야 한다
	assert_int(int(p["contract_years"])).is_equal(1)
	assert_int(int(p["development_since"])).is_equal(2027)
	assert_bool(p.has("grade")).override_failure_message(
		"프로에 갔는데 학년이 남았다").is_false()


func test_quitting_is_written_down() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	_fill(w, Placement.FARM,
		RosterMaintenance.roster_max_of(Placement.FARM) + Placement.DEVELOPMENT_MAX)
	_fill(w, Placement.INDEPENDENT, Placement.INDEPENDENT_MAX)

	var p: Dictionary = _player()
	assert_bool(Placement.place(w, p, 2027, "draft_undrafted", "미지명", {}, {})).is_false()
	assert_str(String(p["career_status"])).is_equal("retired")
	assert_str(String(p["league_id"])).is_equal(Promotion.RETIRED_LEAGUE)
	var kinds: Array = []
	for e in p.get("career_events", []):
		kinds.append(String(e["type"]))
	assert_array(kinds).contains([Placement.QUIT_EVENT])


func test_the_move_is_written_to_the_career() -> void:
	var w: Dictionary = _world()
	var p: Dictionary = _player({"team_id": "OLD"})
	Placement.place(w, p, 2027, "draft_undrafted", "미지명", {}, {})
	var e: Dictionary = p["career_events"][0]
	assert_str(String(e["type"])).is_equal("draft_undrafted")
	assert_str(String(e["from_team_id"])).is_equal("OLD")
	assert_str(String(e["detail"])).contains("대학리그")


# ── 여럿 ──────────────────────────────────────────────────────

## 좋은 선수부터 자리를 잡는다 — 남는 자리가 적으니 순서가 결과를 정한다
func test_the_best_players_get_the_slots() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	_fill(w, Placement.FARM,
		RosterMaintenance.roster_max_of(Placement.FARM) + Placement.DEVELOPMENT_MAX)
	# 독립 한 팀만 한 자리 남긴다
	_fill(w, Placement.INDEPENDENT, Placement.INDEPENDENT_MAX)
	var first: String = String(World.teams_of(Placement.INDEPENDENT)[0]["id"])
	w["rosters"][first].pop_back()

	var weak: Dictionary = _player({"id": "WEAK", "pitching": {"ovr": 40.0}})
	var star: Dictionary = _player({"id": "STAR", "pitching": {"ovr": 90.0}})
	var out: Dictionary = Placement.place_all(w, [weak, star], 2027, "t", "r")

	assert_int(int(out["placed"])).is_equal(1)
	assert_str(String(star["league_id"])).override_failure_message(
		"약한 선수가 마지막 자리를 가져갔다").is_equal(Placement.INDEPENDENT)
	assert_str(String(weak["career_status"])).is_equal("retired")


## ⚠ **같은 능력치면 id 순이다.** 뒤 갈래가 없으면 순서가 흔들려 **같은
## 세이브를 다시 열 때 다른 사람이 살아남는다**
func test_a_tie_breaks_on_id() -> void:
	var w: Dictionary = _world()
	_fill(w, Placement.UNIVERSITY, Placement.UNIVERSITY_MAX)
	_fill(w, Placement.FARM,
		RosterMaintenance.roster_max_of(Placement.FARM) + Placement.DEVELOPMENT_MAX)
	_fill(w, Placement.INDEPENDENT, Placement.INDEPENDENT_MAX)
	var first: String = String(World.teams_of(Placement.INDEPENDENT)[0]["id"])
	w["rosters"][first].pop_back()

	# 능력치가 정확히 같다 — 갈리는 건 id뿐이다
	var b: Dictionary = _player({"id": "BBB"})
	var a: Dictionary = _player({"id": "AAA"})
	Placement.place_all(w, [b, a], 2027, "t", "r")

	assert_str(String(a["league_id"])).override_failure_message(
		"동점에서 id 순이 아니다").is_equal(Placement.INDEPENDENT)
	assert_str(String(b["career_status"])).is_equal("retired")


## 어디로 몇 명 갔는지가 같이 온다 — 02 기준선과 대조하는 자리다
func test_it_reports_where_they_went() -> void:
	var w: Dictionary = _world()
	var people: Array = []
	for i in 5:
		people.append(_player({"id": "P%d" % i}))
	var out: Dictionary = Placement.place_all(w, people, 2027, "t", "r")
	assert_int(int(out["by_league"][Placement.UNIVERSITY])).is_equal(5)


func test_nobody_to_place_is_a_no_op() -> void:
	var out: Dictionary = Placement.place_all(_world(), [], 2027, "t", "r")
	assert_int(int(out["placed"])).is_equal(0)
	assert_int(int(out["gave_up"])).is_equal(0)
