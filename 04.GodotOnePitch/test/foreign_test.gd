extends GdUnitTestSuite

## 외국인 선수 — 국적 · 보유 한도 · 연간 순환. B-9.
##
## ⚠ **한도를 물을 땐 국적이다.** 02는 "그 리그에서 외국인인가"를 문지기로
## 쓴 자리가 다섯이었고 **전부 샜다** — ABL 선수는 ABL에서 내국인이라
## 그 조건을 그냥 통과한다.


func _rng(seed_value: int = 1) -> RandomNumberGenerator:
	var r := RandomNumberGenerator.new()
	r.seed = seed_value
	return r


func _p(id: String, league: String, team: String, ovr: float = 80.0,
		age: int = 28, pitcher: bool = true, over: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": id, "name": id, "league_id": league, "team_id": team,
		"position": "SP" if pitcher else "1B",
		"player_type": "pitcher" if pitcher else "batter",
		"pitching": {"ovr": ovr}, "batting": {"ovr": ovr},
		"age": age, "career_status": "active", "career_events": [],
	}
	d.merge(over, true)
	return d


## KBL 1군 팀 이름을 실제 데이터에서 가져온다
func _kbl_teams() -> Array:
	var out: Array = []
	for t in World.teams_of("LEAGUE_KBL"):
		out.append(String(t["id"]))
	out.sort()
	return out


func _abl_farm_teams() -> Array:
	var out: Array = []
	for t in World.teams_of("LEAGUE_ABL_FARM"):
		out.append(String(t["id"]))
	out.sort()
	return out


## 해외에 후보가 넉넉한 세계. KBL은 국내 선수만 있다
func _state(over: Dictionary = {}) -> Dictionary:
	var rosters: Dictionary = {}
	for team in _kbl_teams():
		var list: Array = []
		for i in range(10):
			list.append(_p("%s_K%d" % [team, i], "LEAGUE_KBL", team, 70.0, 27,
				i % 2 == 0))
		rosters[team] = list

	var farms: Array = _abl_farm_teams()
	for j in range(farms.size()):
		var list2: Array = []
		for i in range(12):
			list2.append(_p("%s_F%d" % [farms[j], i], "LEAGUE_ABL_FARM", farms[j],
				80.0, 28, i % 2 == 0))
		rosters[farms[j]] = list2

	var s: Dictionary = {
		"season_year": 2030, "seed": 11,
		"world": {"rosters": rosters},
		"protagonist": {"id": "ME"},
	}
	s.merge(over, true)
	return s


func _foreigners_in(state: Dictionary) -> Array:
	var out: Array = []
	for team in _kbl_teams():
		for p in Foreign.held_of(state["world"], team):
			out.append(p)
	return out


# ── 국적 ──────────────────────────────────────────────────────

## ⚠ **한도 문지기는 국적이다.** 리그로 물으면 ABL 선수가 ABL에서
## 내국인이라 그냥 통과한다 — 02에서 그 자리가 다섯이었다
func test_the_quota_gate_asks_the_nationality() -> void:
	assert_bool(Foreign.is_foreign_in_quota_league("USA")).is_true()
	assert_bool(Foreign.is_foreign_in_quota_league("KOR")).is_false()


## 표시용 판정은 리그를 같이 본다 — ABL 선수는 ABL에서 외국인이 아니다
func test_a_player_is_not_foreign_in_his_own_league() -> void:
	assert_bool(Foreign.is_foreign_player("LEAGUE_ABL", "USA")).override_failure_message(
		"ABL 선수가 ABL에서 외국인으로 세어진다").is_false()
	assert_bool(Foreign.is_foreign_player("LEAGUE_KBL", "USA")).is_true()
	assert_bool(Foreign.is_foreign_player("LEAGUE_KBL", "KOR")).is_false()


## 국적이 없으면 지금 리그에서 낸다 — 옛 세이브와 아직 안 옮긴 선수 자리
func test_a_nationality_falls_back_to_the_league() -> void:
	assert_str(Foreign.nationality_of(_p("A", "LEAGUE_ABL_FARM", "T"))).is_equal("USA")
	assert_str(Foreign.nationality_of(_p("B", "LEAGUE_JBL", "T"))).is_equal("JPN")
	assert_str(Foreign.nationality_of(_p("C", "LEAGUE_KBL", "T"))).is_equal("KOR")


## ⚠ **박혀 있으면 그걸 쓴다.** 안 그러면 KBL로 옮긴 순간 내국인이 된다
func test_a_stamped_nationality_wins() -> void:
	assert_str(Foreign.nationality_of(
		_p("A", "LEAGUE_KBL", "T", 80.0, 28, true, {"nationality": "USA"}))
		).override_failure_message(
		"국적을 박아 뒀는데 리그로 다시 읽는다").is_equal("USA")


# ── 재계약 ────────────────────────────────────────────────────

## ⚠ **성적이 아니라 능력치·나이로 본다.** 성적은 그 해 등판 수에 좌우돼
## 표본이 얇은 선수를 억울하게 자른다
func test_a_good_foreigner_is_renewed() -> void:
	assert_bool(Foreign.can_renew(_p("A", "LEAGUE_KBL", "T", 80.0, 30))).is_true()


func test_a_poor_foreigner_is_not_renewed() -> void:
	assert_bool(Foreign.can_renew(_p("A", "LEAGUE_KBL", "T", 68.0, 30))
		).override_failure_message("쪽박 용병이 계속 남는다").is_false()


func test_an_old_foreigner_is_not_renewed() -> void:
	assert_bool(Foreign.can_renew(_p("A", "LEAGUE_KBL", "T", 90.0, 38))).is_false()


## ⚠ **재계약선이 영입 하한보다 높아야 실제로 교체가 일어난다**
func test_the_renewal_line_is_above_the_signing_floor() -> void:
	assert_float(float(Foreign.rules()["renew"]["ovr_min"])
		).override_failure_message(
		"재계약선이 영입 하한 이하다 — 교체가 한 명도 안 일어난다").is_greater(
		float(Foreign.rules()["ovr_min"]))


# ── 영입 후보 ─────────────────────────────────────────────────

func test_only_the_origin_leagues_are_candidates() -> void:
	assert_bool(Foreign.is_signable(_p("A", "LEAGUE_ABL_FARM", "T"))).is_true()
	assert_bool(Foreign.is_signable(_p("B", "LEAGUE_KBL", "T"))).override_failure_message(
		"이미 KBL에 있는 선수를 다시 영입한다").is_false()
	assert_bool(Foreign.is_signable(_p("C", "LEAGUE_HIGHSCHOOL", "T"))).is_false()


## ⚠ **아무나 데려오면 용병이 국내 신인만 못하다**
func test_the_signing_band_holds() -> void:
	assert_bool(Foreign.is_signable(_p("A", "LEAGUE_ABL_FARM", "T", 50.0))).is_false()
	assert_bool(Foreign.is_signable(_p("B", "LEAGUE_ABL_FARM", "T", 99.0))).is_false()
	assert_bool(Foreign.is_signable(_p("C", "LEAGUE_ABL_FARM", "T", 80.0))).is_true()


func test_the_age_band_holds() -> void:
	assert_bool(Foreign.is_signable(_p("A", "LEAGUE_ABL_FARM", "T", 80.0, 20))).is_false()
	assert_bool(Foreign.is_signable(_p("B", "LEAGUE_ABL_FARM", "T", 80.0, 40))).is_false()


func test_a_retired_player_is_not_signable() -> void:
	assert_bool(Foreign.is_signable(_p("A", "LEAGUE_ABL_FARM", "T", 80.0, 28, true,
		{"career_status": "retired"}))).is_false()


## ⚠ **마이너 출신이 대부분이다.** 균등하게 뽑으면 메이저 주전급이 매년
## 무더기로 온다
func test_the_farm_league_dominates_the_draw() -> void:
	var farm: int = 0
	var top: int = 0
	for i in range(200):
		var pool: Array = [
			_p("F", "LEAGUE_ABL_FARM", "T1"), _p("M", "LEAGUE_ABL", "T2"),
			_p("J", "LEAGUE_JBL", "T3")]
		var c: Dictionary = Foreign.draw(pool, true, _rng(i + 1))
		if String(c["league_id"]) == "LEAGUE_ABL_FARM":
			farm += 1
		elif String(c["league_id"]) == "LEAGUE_ABL":
			top += 1
	assert_int(farm).override_failure_message(
		"마이너 %d · 메이저 %d — 출신 가중치가 안 걸렸다" % [farm, top]).is_greater(top * 3)


## 뽑힌 사람은 후보에서 빠진다 — 한 사람이 두 팀에 가면 안 된다
func test_a_drawn_player_leaves_the_pool() -> void:
	var pool: Array = [_p("F", "LEAGUE_ABL_FARM", "T1")]
	assert_dict(Foreign.draw(pool, true, _rng())).is_not_empty()
	assert_array(pool).is_empty()
	assert_dict(Foreign.draw(pool, true, _rng())).is_empty()


func test_the_draw_respects_the_position() -> void:
	var pool: Array = [_p("B", "LEAGUE_ABL_FARM", "T1", 80.0, 28, false)]
	assert_dict(Foreign.draw(pool, true, _rng())).override_failure_message(
		"투수를 뽑았는데 야수가 나왔다").is_empty()
	assert_dict(Foreign.draw(pool, false, _rng())).is_not_empty()


# ── 연간 순환 ─────────────────────────────────────────────────

## ⚠ **첫 해에는 재계약 판정을 하지 않는다.** 계약한 시즌은 뛰고 평가받는다
func test_the_first_year_does_not_judge_anyone() -> void:
	var s: Dictionary = _state()
	var team: String = _kbl_teams()[0]
	s["world"]["rosters"][team].append(_p("BUST", "LEAGUE_KBL", team, 60.0, 30,
		true, {"nationality": "USA"}))
	var out: Dictionary = Foreign.turnover(s, 2030)
	assert_int(int(out["released"])).override_failure_message(
		"첫 해에 용병을 잘랐다").is_equal(0)


## ⚠ **충원을 안 하면 한 시즌마다 자리가 줄어든다** — 몇 해 뒤 KBL에
## 외국인이 사라진다
func test_the_empty_slots_are_filled() -> void:
	var s: Dictionary = _state()
	var out: Dictionary = Foreign.turnover(s, 2030)
	assert_int(int(out["signed"])).override_failure_message(
		"빈 자리를 아무도 안 채웠다").is_equal(_kbl_teams().size() * Foreign.per_team())

	for team in _kbl_teams():
		assert_int(Foreign.held_of(s["world"], team).size()).override_failure_message(
			"%s 가 용병 %d명으로 시즌을 시작한다"
			% [team, Foreign.held_of(s["world"], team).size()]).is_equal(
			Foreign.per_team())


## ⚠ **은퇴한 사람은 보유 인원이 아니다.** 세면 그 팀이 빈 자리를 못 채운다
func test_a_retired_foreigner_does_not_hold_a_slot() -> void:
	var s: Dictionary = _state()
	var team: String = _kbl_teams()[0]
	for i in range(Foreign.per_team()):
		s["world"]["rosters"][team].append(
			_p("GHOST%d" % i, "LEAGUE_KBL", team, 80.0, 30, i % 2 == 0,
				{"nationality": "USA", "career_status": "retired"}))
	Foreign.turnover(s, 2030)

	# ⚠ **`held_of`로 세지 않는다.** 변이가 그 함수를 고치면 검사도 같이
	# 눈이 멀어서 아무것도 안 보는 검사가 된다 — 로스터를 직접 센다
	var active_foreigners: int = 0
	for p in s["world"]["rosters"][team]:
		if String(p.get("career_status", "active")) != "active":
			continue
		if String(p.get("nationality", "KOR")) != "KOR":
			active_foreigners += 1
	assert_int(active_foreigners).override_failure_message(
		"은퇴한 용병이 자리를 차지해 뛸 수 있는 용병이 %d명뿐이다"
		% active_foreigners).is_equal(Foreign.per_team())


## ⚠ **재계약선을 넘으면 남는다.** 다 자르면 매년 팀 전체가 갈린다
func test_a_good_foreigner_survives_the_turnover() -> void:
	var s: Dictionary = _state()
	Foreign.turnover(s, 2030)
	var before: Array = []
	for p in _foreigners_in(s):
		if Foreign.can_renew(p):
			before.append(String(p["id"]))
	assert_array(before).override_failure_message(
		"재계약선을 넘는 용병이 한 명도 없다 — 검사가 아무것도 안 본다").is_not_empty()

	Foreign.turnover(s, 2031)
	var after: Dictionary = {}
	for p in _foreigners_in(s):
		after[String(p["id"])] = true
	for id in before:
		assert_bool(after.has(id)).override_failure_message(
			"재계약선을 넘는 %s 가 잘렸다" % id).is_true()


## ⚠ **이미 보유한 투수를 센다.** 안 세면 한 팀에 외국인 투수가 넘친다
func test_the_held_pitchers_are_counted() -> void:
	var s: Dictionary = _state()
	var team: String = _kbl_teams()[0]
	for i in range(Foreign.max_pitchers()):
		s["world"]["rosters"][team].append(
			_p("ACE%d" % i, "LEAGUE_KBL", team, 85.0, 28, true,
				{"nationality": "USA"}))
	Foreign.turnover(s, 2030)

	var pitchers: int = 0
	for p in Foreign.held_of(s["world"], team):
		if PlayerGen.is_pitcher(String(p.get("position", ""))):
			pitchers += 1
	assert_int(pitchers).override_failure_message(
		"투수 %d명을 이미 데리고 있는데 %d명이 됐다"
		% [Foreign.max_pitchers(), pitchers]).is_equal(Foreign.max_pitchers())


## ⚠ **투수는 한도까지만.** 부족분을 전부 투수로 채우면 한도가 깨진다
func test_the_pitcher_limit_holds() -> void:
	var s: Dictionary = _state()
	Foreign.turnover(s, 2030)
	for team in _kbl_teams():
		var pitchers: int = 0
		for p in Foreign.held_of(s["world"], team):
			if PlayerGen.is_pitcher(String(p.get("position", ""))):
				pitchers += 1
		assert_int(pitchers).override_failure_message(
			"%s 의 외국인 투수가 %d명이다" % [team, pitchers]).is_less_equal(
			Foreign.max_pitchers())


## ⚠ **국적을 박아 둔다.** 안 박으면 KBL로 옮긴 순간 내국인으로 읽혀
## 다음 해에 한도가 통째로 비어 보인다
func test_the_signing_stamps_the_nationality() -> void:
	var s: Dictionary = _state()
	Foreign.turnover(s, 2030)
	for p in _foreigners_in(s):
		assert_str(String(p.get("nationality", ""))).override_failure_message(
			"%s 의 국적이 안 박혔다" % p["id"]).is_not_empty()
		assert_bool(bool(p.get("is_foreign", false))).is_true()


## ⚠ **어디서 왔는지가 남는다.** 02는 무에서 찍어서 그 기록이 아예 없었고
## 화면이 국내 신인과 구분을 못 했다
func test_where_he_came_from_is_written_down() -> void:
	var s: Dictionary = _state()
	Foreign.turnover(s, 2030)
	var p: Dictionary = _foreigners_in(s)[0]
	var e: Dictionary = p["career_events"][0]
	assert_str(String(e["type"])).is_equal("foreign_signing")
	assert_str(String(e["from_league_id"])).override_failure_message(
		"어디서 왔는지가 안 남았다").is_equal("LEAGUE_ABL_FARM")
	assert_str(String(e["to_league_id"])).is_equal("LEAGUE_KBL")


## ⚠ **양쪽 로스터를 같이 고친다.** 한쪽만 고치면 같은 선수가 두 팀에
## 있거나 아무 데도 없다
func test_a_signed_player_leaves_his_old_team() -> void:
	var s: Dictionary = _state()
	Foreign.turnover(s, 2030)
	var seen: Dictionary = {}
	for team_id in s["world"]["rosters"]:
		for p in s["world"]["rosters"][team_id]:
			var id: String = String(p["id"])
			assert_bool(seen.has(id)).override_failure_message(
				"%s 가 두 팀에 있다" % id).is_false()
			seen[id] = true
			assert_str(String(p["team_id"])).override_failure_message(
				"%s 의 소속이 실제 자리와 다르다" % id).is_equal(team_id)


## 이미 채워져 있으면 더 안 데려온다
func test_a_full_team_signs_nobody() -> void:
	var s: Dictionary = _state()
	Foreign.turnover(s, 2030)
	var again: Dictionary = Foreign.turnover(s, 2031)
	assert_int(int(again["signed"])).override_failure_message(
		"정원이 찼는데 %d명을 더 데려왔다" % again["signed"]).is_equal(
		int(again["released"]))


## ⚠ **못 미치면 온 곳으로 돌아간다.** 02는 은퇴로 기록해 세계에서 지웠다 —
## 진짜 이유는 갈 곳이 없어서였다
func test_a_released_foreigner_goes_home() -> void:
	var s: Dictionary = _state()
	var team: String = _kbl_teams()[0]
	s["world"]["rosters"][team].append(_p("BUST", "LEAGUE_KBL", team, 60.0, 30,
		true, {"nationality": "USA"}))
	Foreign.turnover(s, 2030)                # 첫 해 — 판정 없음
	var out: Dictionary = Foreign.turnover(s, 2031)
	assert_int(int(out["returned"])).override_failure_message(
		"쪽박 용병이 본국으로 안 돌아갔다").is_greater(0)

	for team_id in s["world"]["rosters"]:
		for p in s["world"]["rosters"][team_id]:
			if String(p["id"]) == "BUST":
				assert_str(String(p["league_id"])).is_equal(Foreign.return_league())
				assert_str(String(p["career_status"])).override_failure_message(
					"본국 복귀가 은퇴로 기록됐다").is_equal("active")
				return
	fail("퇴출된 용병이 세계에서 사라졌다")


## ⚠ **돌아갈 리그에 팀이 있어야 한다.** 없으면 퇴출된 용병이 소속 없는
## 현역으로 남고 화면과 시뮬이 둘 다 깨진다 — 규칙이 그걸 보장하는지 본다
func test_the_return_league_has_teams() -> void:
	assert_str(Foreign.return_league()).is_not_empty()
	assert_array(World.teams_of(Foreign.return_league())
		).override_failure_message(
		"돌아갈 리그(%s)에 팀이 없다 — 퇴출된 용병이 갈 곳이 없다"
		% Foreign.return_league()).is_not_empty()


## 한 팀에 몰아넣지 않는다 — 제일 얇은 팀으로 보낸다
func test_the_returnees_are_spread_out() -> void:
	var s: Dictionary = _state()
	var teams: Array = _kbl_teams()
	for i in range(teams.size()):
		s["world"]["rosters"][teams[i]].append(
			_p("BUST%d" % i, "LEAGUE_KBL", teams[i], 60.0, 30, true,
				{"nationality": "USA"}))
	Foreign.turnover(s, 2030)
	var out: Dictionary = Foreign.turnover(s, 2031)
	assert_int(int(out["returned"])).is_greater_equal(teams.size())

	var landed: Dictionary = {}
	for t in _abl_farm_teams():
		for p in s["world"]["rosters"].get(t, []):
			if String(p["id"]).begins_with("BUST"):
				landed[t] = int(landed.get(t, 0)) + 1
	assert_int(landed.size()).override_failure_message(
		"복귀자 %d명이 팀 %d개에 몰렸다" % [out["returned"], landed.size()]
	).is_greater(1)


## ⚠ **같은 세계면 같은 영입이다.** 안 그러면 세이브를 다시 열 때마다
## 용병이 바뀐다
func test_the_same_world_signs_the_same_players() -> void:
	var a: Dictionary = _state()
	var b: Dictionary = _state()
	Foreign.turnover(a, 2030)
	Foreign.turnover(b, 2030)
	var ids_a: Array = []
	var ids_b: Array = []
	for p in _foreigners_in(a):
		ids_a.append(String(p["id"]))
	for p in _foreigners_in(b):
		ids_b.append(String(p["id"]))
	assert_array(ids_a).is_equal(ids_b)


func test_a_different_world_signs_different_players() -> void:
	var a: Dictionary = _state()
	var b: Dictionary = _state({"seed": 999})
	Foreign.turnover(a, 2030)
	Foreign.turnover(b, 2030)
	var ids_a: Array = []
	var ids_b: Array = []
	for p in _foreigners_in(a):
		ids_a.append(String(p["id"]))
	for p in _foreigners_in(b):
		ids_b.append(String(p["id"]))
	assert_array(ids_a).override_failure_message(
		"세계가 달라도 같은 용병을 데려온다 — 씨앗이 안 섞였다").is_not_equal(ids_b)


func test_a_world_without_candidates_signs_nobody() -> void:
	var s: Dictionary = _state()
	for t in _abl_farm_teams():
		s["world"]["rosters"].erase(t)
	var out: Dictionary = Foreign.turnover(s, 2030)
	assert_int(int(out["signed"])).is_equal(0)


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **해가 바뀔 때 실제로 돈다.** 안 이으면 KBL에 외국인이 영영 없다
func test_the_season_rollover_runs_the_turnover() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	SeasonRunner.roll_over(s)
	var n: int = 0
	for team in _kbl_teams():
		n += Foreign.held_of(s["world"], team).size()
	# ⚠ **진짜 세계에서 정원이 다 차야 한다.** 해외 후보가 규칙선(66~94)에
	# 못 미치면 자리가 빈 채로 시즌이 열린다
	assert_int(n).override_failure_message(
		"해가 바뀌었는데 KBL 외국인이 %d명이다 (정원 %d)"
		% [n, _kbl_teams().size() * Foreign.per_team()]).is_equal(
		_kbl_teams().size() * Foreign.per_team())
