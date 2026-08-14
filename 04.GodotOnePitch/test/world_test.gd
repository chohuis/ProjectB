extends GdUnitTestSuite

## 세계 조립 — M8-3.
##
## 원본: `refs.json`(팀 238·리그 6) · `ensureLeagueActivatedV3` · `generation_rules.json`
##
## ⚠ **02는 리그를 게을리 켰다**(`ensureLeagueActivatedV3`). 그래서 확장팩
## 게이트를 열어도 **선수 0명인 리그에 일정만 1,740경기 깔렸다** — 2시즌을
## 굴려도 인원 0·결과 0이었다. **게이트를 연다고 도는 게 아니다.**
##
## 우리는 해외까지 매일 풀 시뮬하므로 처음에 전부 만든다.


func _world(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"seed": 20270101, "season_year": 2027}
	p.merge(over, true)
	return World.build(p)


# ── 팀·리그 정의 ──────────────────────────────────────────────

## ⚠ **팀 수가 일정과 맞아야 한다.** 어긋나면 라운드 로빈이 허수를 만들거나
## 일정에 없는 팀이 생긴다
func test_the_team_counts_match_the_schedule() -> void:
	for lid in Schedule.TEAM_COUNTS:
		var want: int = int(Schedule.TEAM_COUNTS[lid])
		var got: int = World.teams_of(lid).size()
		assert_int(got).override_failure_message(
			"%s: 팀 %d개인데 일정은 %d개를 본다" % [lid, got, want]).is_equal(want)


func test_every_league_in_the_schedule_has_teams() -> void:
	for lid in Schedule.LEAGUES:
		assert_bool(World.teams_of(lid).is_empty()).override_failure_message(
			"%s에 팀이 없다" % lid).is_false()


## ⚠ **2군은 1군에서 파생한다.** 02는 `_2` 접미사 규칙이었고, 그게 없어서
## 해외 팜 로스터가 0명이었다
func test_farm_teams_derive_from_their_parent() -> void:
	var first: Array = World.teams_of("LEAGUE_KBL")
	var farm: Array = World.teams_of("LEAGUE_KBL_FARM")
	assert_int(farm.size()).is_equal(first.size())
	for t in farm:
		assert_bool(String(t["id"]).ends_with("_2")).override_failure_message(
			"2군 id가 _2로 안 끝난다: %s" % t["id"]).is_true()


func test_a_team_carries_a_name() -> void:
	for t in World.teams_of("LEAGUE_KBL"):
		assert_str(t["name"]).is_not_empty()
		assert_str(t["league_id"]).is_equal("LEAGUE_KBL")


func test_an_unknown_league_has_no_teams() -> void:
	assert_array(World.teams_of("LEAGUE_NOPE")).is_empty()


# ── 로스터 ────────────────────────────────────────────────────

## ⚠ **선수 0명인 리그가 있으면 안 된다.** 02가 정확히 그 상태였다
func test_every_team_gets_players() -> void:
	var w: Dictionary = _world()
	for lid in Schedule.LEAGUES:
		for t in World.teams_of(lid):
			var n: int = World.roster_of(w, t["id"]).size()
			assert_int(n).override_failure_message(
				"%s(%s)에 선수가 %d명" % [t["name"], t["id"], n]).is_greater(0)


## 리그마다 로스터 크기가 다르다 — 규칙 파일 값 그대로
func test_roster_sizes_follow_the_rules() -> void:
	var w: Dictionary = _world()
	for t in World.teams_of("LEAGUE_KBL"):
		assert_int(World.roster_of(w, t["id"]).size()).is_equal(30)
	for t in World.teams_of("LEAGUE_KBL_FARM"):
		assert_int(World.roster_of(w, t["id"]).size()).is_equal(34)


## ⚠ **리그마다 능력치 대역이 다르다.** 같으면 승격·강등이 뜻을 잃는다.
## 실측 대역: 고교 45~70 · 대학 52~76 · KBL 58~84 · ABL 62~92
func test_leagues_have_different_strength_bands() -> void:
	var w: Dictionary = _world()
	var hs: float = _avg_ovr(w, "LEAGUE_HIGHSCHOOL")
	var kbl: float = _avg_ovr(w, "LEAGUE_KBL")
	var abl: float = _avg_ovr(w, "LEAGUE_ABL")
	assert_bool(hs < kbl).override_failure_message(
		"고교 %.1f >= KBL %.1f" % [hs, kbl]).is_true()
	assert_bool(kbl < abl).override_failure_message(
		"KBL %.1f >= ABL %.1f" % [kbl, abl]).is_true()


func _avg_ovr(w: Dictionary, league_id: String) -> float:
	var total: float = 0.0
	var n: int = 0
	for t in World.teams_of(league_id):
		for p in World.roster_of(w, t["id"]):
			total += maxf(p["pitching"]["ovr"], p["batting"]["ovr"])
			n += 1
	return total / maxf(float(n), 1.0)


## ⚠ **해외 리그가 한국 이름으로 차면 안 된다** — 02의 결함 그대로다
func test_overseas_rosters_use_their_own_names() -> void:
	var w: Dictionary = _world()
	for t in World.teams_of("LEAGUE_JBL"):
		for p in World.roster_of(w, t["id"]):
			var ko: String = p["name"]
			assert_bool(not ko.contains(" ") and ko.length() == 3) \
				.override_failure_message("JBL에 한국식 이름: %s" % ko).is_false()


## id가 겹치면 선수 하나가 두 팀에 있게 된다
func test_player_ids_are_unique_across_the_world() -> void:
	var w: Dictionary = _world()
	var seen: Dictionary = {}
	for pid in World.all_players(w):
		assert_bool(seen.has(pid)).override_failure_message(
			"선수 id가 겹친다: %s" % pid).is_false()
		seen[pid] = true


# ── 결정적인가 ────────────────────────────────────────────────

## ⚠ **같은 씨앗은 같은 세계를 만든다.** 아니면 조사가 재현이 안 된다
func test_the_same_seed_builds_the_same_world() -> void:
	var a: Dictionary = _world({"seed": 777})
	var b: Dictionary = _world({"seed": 777})
	assert_int(World.all_players(a).size()).is_equal(World.all_players(b).size())
	var ta: Array = World.roster_of(a, "TEAM_HS_AEWOL")
	var tb: Array = World.roster_of(b, "TEAM_HS_AEWOL")
	for i in ta.size():
		assert_str(ta[i]["name"]).is_equal(tb[i]["name"])
		assert_float(ta[i]["pitching"]["ovr"]).is_equal(tb[i]["pitching"]["ovr"])


func test_a_different_seed_builds_a_different_world() -> void:
	var a: Array = World.roster_of(_world({"seed": 1}), "TEAM_HS_AEWOL")
	var b: Array = World.roster_of(_world({"seed": 2}), "TEAM_HS_AEWOL")
	var same: int = 0
	for i in a.size():
		if a[i]["name"] == b[i]["name"]:
			same += 1
	assert_int(same).is_less(5)


# ── 새 게임 ───────────────────────────────────────────────────

## ⚠ **주인공은 세계 안에 있어야 한다.** 02는 주인공을 따로 들었고, 그래서
## 주인공 팀의 로스터에 주인공이 없는 순간이 있었다
func test_a_new_game_puts_the_protagonist_on_a_team() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	assert_str(s["protagonist"]["team_id"]).is_equal("TEAM_HS_AEWOL")
	var mine: bool = false
	for p in World.roster_of(s["world"], "TEAM_HS_AEWOL"):
		if p["id"] == s["protagonist"]["id"]:
			mine = true
	assert_bool(mine).override_failure_message("주인공이 자기 팀 로스터에 없다").is_true()


func test_a_new_game_starts_on_day_one() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027})
	assert_int(s["day"]).is_equal(1)
	assert_int(s["season_year"]).is_equal(2027)


## ⚠ **일정이 깔려 있어야 한다.** 02는 리그를 게을리 켜서 선수 0명인 리그에
## 일정만 깔린 반대 상황이 났다 — 여기서는 둘이 같이 온다
func test_a_new_game_has_a_schedule() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	assert_bool(s["schedule"].is_empty()).is_false()
	var mine: int = 0
	for g in s["schedule"]:
		if g.get("is_protagonist_game", false):
			mine += 1
	assert_int(mine).override_failure_message("주인공 경기가 없다").is_greater(0)


## 화면이 팀 이름을 찾을 수 있어야 한다
func test_a_new_game_carries_team_names() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"team_id": "TEAM_HS_AEWOL"})
	assert_str(s["team_names"].get("TEAM_HS_AEWOL", "")).is_not_empty()


## 새 게임이 그대로 화면에 뜬다 — 여기가 끊기면 아무것도 안 보인다
func test_a_new_game_feeds_the_view_model() -> void:
	var s: Dictionary = World.new_game({"seed": 5, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var vm: Dictionary = MainVm.build(s)
	assert_str(vm["date_label"]).is_equal("2027년 3월 1일")
	assert_str(vm["player_name"]).is_equal("김한결")
	assert_str(vm["team_name"]).is_not_empty()
