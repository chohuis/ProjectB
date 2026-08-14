extends GdUnitTestSuite

## 시즌 종료 실행 — M9-4.
##
## ⚠ **02에선 이 자리가 세 분기에 각각 적혀 있었고 그중 어디도 안 타는
## 경로가 있었다.** 주인공이 지명된 해엔 세계 오프시즌이 통째로 건너뛰어져
## 그 해 NPC 사건이 `fa_signed 6`뿐이었고 드래프트·은퇴·이적·연도기록이
## 전부 없었으며 주인공 나이도 안 올랐다.


func _game() -> Dictionary:
	return World.new_game({"seed": 31337, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})


func _count_by_league(state: Dictionary, league: String) -> int:
	var n: int = 0
	for p in SeasonRunner.all_players(state):
		if p.get("league_id", "") == league:
			n += 1
	return n


# ── 가드 ──────────────────────────────────────────────────────

func test_it_runs_once_for_the_year() -> void:
	var s: Dictionary = _game()
	assert_bool(SeasonRunner.run(s)["ran"]).is_true()
	assert_bool(SeasonRunner.run(s)["ran"]).override_failure_message(
		"같은 해에 두 번 돌았다").is_false()


## ⚠ **가드 연도는 상태에 남는다.** 02는 스토어 안에만 있어서 앱을 껐다
## 켜면 없던 일이 됐다 — 결과는 영구인데 가드만 세션 한정이었다
func test_the_guard_year_is_saved() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)
	assert_int(int(s["last_world_season_end_year"])).is_equal(2027)
	assert_int(int(s["last_draft_year"])).is_equal(2027)

	# 세이브를 거쳐도 살아남는다
	var round_trip: Dictionary = JSON.parse_string(JSON.stringify(s))
	assert_bool(SeasonRunner.run(round_trip)["ran"]).override_failure_message(
		"세이브를 거치니 가드가 사라졌다").is_false()


func test_a_new_year_runs_again() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)
	s["season_year"] = 2028
	assert_bool(SeasonRunner.run(s)["ran"]).is_true()


# ── 진급·졸업 ─────────────────────────────────────────────────

func test_highschoolers_move_up() -> void:
	var s: Dictionary = _game()
	var before: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		if p.get("league_id", "") == "LEAGUE_HIGHSCHOOL":
			before[p["id"]] = int(p.get("grade", 0))

	SeasonRunner.run(s)
	var moved: int = 0
	for p in SeasonRunner.all_players(s):
		if before.has(p.get("id", "")) and p.get("league_id", "") == "LEAGUE_HIGHSCHOOL":
			if int(p.get("grade", 0)) > int(before[p["id"]]):
				moved += 1
	assert_int(moved).override_failure_message("아무도 진급을 안 했다").is_greater(0)


## ⚠ **졸업생이 로스터에서 빠져야 한다.** 안 빼면 같은 선수가 두 군데에 있다
func test_graduates_leave_their_school() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = SeasonRunner.run(s)
	assert_int(int(out["summary"]["graduated"])).is_greater(0)

	# 로스터 어디에도 드래프트 풀 소속이 없어야 한다
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			assert_str(p.get("league_id", "")).override_failure_message(
				"%s의 로스터에 드래프트 풀 선수가 남았다" % tid) \
				.is_not_equal(Promotion.DRAFT_POOL)


## ⚠ **선수가 사라지거나 두 번 세어지면 안 된다**
func test_nobody_is_lost_or_duplicated() -> void:
	var s: Dictionary = _game()
	var before: int = SeasonRunner.all_players(s).size()
	var out: Dictionary = SeasonRunner.run(s)

	var seen: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		assert_bool(seen.has(p["id"])).override_failure_message(
			"%s가 두 군데에 있다" % p["id"]).is_false()
		seen[p["id"]] = true

	# 나간 사람(은퇴·포기)과 들어온 사람(신입생)을 셈에 넣는다
	var after: int = seen.size()
	var expected: int = before - int(out["summary"]["retired"]) \
		- int(out["summary"]["gave_up"]) + int(out["summary"]["freshmen"])
	assert_int(after).override_failure_message(
		"%d명이 %d명이 됐다 (은퇴 %d · 포기 %d · 신입 %d → %d이어야 한다)" % [
			before, after, out["summary"]["retired"], out["summary"]["gave_up"],
			out["summary"]["freshmen"], expected]).is_equal(expected)


# ── 드래프트 ──────────────────────────────────────────────────

## ⚠ **졸업생이 프로로 간다.** 이게 세대교체의 유일한 경로다
func test_graduates_get_drafted_into_the_pros() -> void:
	var s: Dictionary = _game()
	var before: int = _count_by_league(s, SeasonRunner.DRAFT_LEAGUE)
	var out: Dictionary = SeasonRunner.run(s)

	assert_int(int(out["summary"]["drafted"])).override_failure_message(
		"아무도 지명되지 않았다").is_greater(0)
	assert_int(_count_by_league(s, SeasonRunner.DRAFT_LEAGUE)).is_greater(before)


## 지명된 선수가 실제로 그 팀 로스터에 있어야 한다 — 소속만 바꾸면
## 아무 팀에도 없는 선수가 된다
func test_a_drafted_player_joins_the_roster() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)

	var found: int = 0
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			if int(p.get("draft_year", 0)) == 2027:
				assert_str(p["team_id"]).override_failure_message(
					"%s가 %s 로스터에 있는데 소속은 %s다" % [p["id"], tid, p["team_id"]]) \
					.is_equal(tid)
				found += 1
	assert_int(found).is_greater(0)


## 미지명자는 대학·독립으로 가거나 야구를 그만둔다 — 풀에 남지 않는다.
##
## ⚠ **정원 초과로 방출된 사람도 같은 자리를 지난다.** 02가 "미지명자와
## 같은 로직"이라고 못박아 뒀다 — 그래서 셈에 방출자를 같이 넣는다
func test_the_undrafted_find_a_way_out() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = SeasonRunner.run(s)
	assert_int(int(out["summary"]["placed"]) + int(out["summary"]["gave_up"])) \
		.is_equal(int(out["summary"]["undrafted"]) + int(out["summary"]["released"]))
	assert_array(s["world"][SeasonRunner.POOL_KEY]).is_empty()


# ── 은퇴·나이 ─────────────────────────────────────────────────

## ⚠ **은퇴자가 로스터에서 빠져야 한다.** 안 빼면 은퇴한 선수가 계속 뛴다
func test_the_retired_leave_their_team() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)
	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			assert_str(p.get("career_status", "")).override_failure_message(
				"%s에 은퇴자가 남았다" % tid).is_not_equal("retired")


func test_everyone_gets_older() -> void:
	var s: Dictionary = _game()
	var before: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		before[p["id"]] = int(p.get("age", 0))

	SeasonRunner.run(s)
	var older: int = 0
	for p in SeasonRunner.all_players(s):
		if before.has(p["id"]) and int(p["age"]) > int(before[p["id"]]):
			older += 1
	assert_int(older).override_failure_message("아무도 나이를 안 먹었다").is_greater(0)


## ⚠ **주인공도 나이를 먹는다.** 02는 주인공이 지명된 해에 세계 오프시즌이
## 통째로 건너뛰어져 나이가 안 올랐다
func test_the_protagonist_ages_too() -> void:
	var s: Dictionary = _game()
	var before: int = int(s["protagonist"]["age"])
	SeasonRunner.run(s)
	assert_int(int(s["protagonist"]["age"])).override_failure_message(
		"주인공이 %d세 그대로다" % before).is_equal(before + 1)


## ⚠ **주인공도 진급한다.** 세계와 다른 경로를 타면 학년이 어긋난다
func test_the_protagonist_moves_up_a_grade() -> void:
	var s: Dictionary = _game()
	var before: int = int(s["protagonist"]["grade"])
	SeasonRunner.run(s)
	assert_int(int(s["protagonist"]["grade"])).is_equal(before + 1)


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **진급이 드래프트보다 먼저다.** 반대면 졸업생이 풀에 없어서
## 아무도 안 뽑힌다
func test_grades_advance_before_the_draft() -> void:
	var out: Dictionary = SeasonRunner.run(_game())
	var phases: Array = out["phases"]
	assert_int(phases.find("advance_grades")).override_failure_message(
		"진급이 드래프트 뒤다 — 뽑을 사람이 없다") \
		.is_less(phases.find("npc_draft"))


## ⚠ **드래프트가 오프시즌보다 먼저다.** 오프시즌이 미지명자를 흩는다
func test_the_draft_runs_before_the_offseason() -> void:
	var phases: Array = SeasonRunner.run(_game())["phases"]
	assert_int(phases.find("npc_draft")).is_less(phases.find("league_offseason"))


## 돌린 단계가 `SeasonEnd`의 순서와 어긋나면 안 된다
func test_the_phases_follow_the_canonical_order() -> void:
	var phases: Array = SeasonRunner.run(_game())["phases"]
	var prev: int = -1
	for id in phases:
		var i: int = SeasonEnd.phase_index(String(id))
		assert_int(i).override_failure_message(
			"%s가 SeasonEnd에 없는 단계다" % id).is_greater(-1)
		assert_int(i).override_failure_message(
			"%s가 순서를 거스른다" % id).is_greater(prev)
		prev = i


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_world_does_not_break() -> void:
	var s: Dictionary = {"season_year": 2027, "seed": 1, "world": {"rosters": {}}}
	var out: Dictionary = SeasonRunner.run(s)
	assert_bool(out["ran"]).is_true()
	assert_int(int(out["summary"]["drafted"])).is_equal(0)


## 두 해를 이어 돌려도 무너지지 않는다 — 세대교체가 이어져야 한다
func test_two_seasons_in_a_row() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)
	s["season_year"] = 2028
	var out: Dictionary = SeasonRunner.run(s)
	assert_bool(out["ran"]).is_true()
	assert_int(int(out["summary"]["graduated"])).is_greater(0)


# ── 세계가 마르지 않는가 (M9-4) ───────────────────────────────

## ⚠ **신입생이 없으면 세계가 마른다.** 실측으로 고교가 5년 만에 텅 비었다 —
## 졸업만 하고 들어오는 사람이 없었다
func test_freshmen_refill_the_schools() -> void:
	var s: Dictionary = _game()
	var before: int = _count_by_league(s, "LEAGUE_HIGHSCHOOL")
	var out: Dictionary = SeasonRunner.run(s)

	assert_int(int(out["summary"]["freshmen"])).override_failure_message(
		"신입생이 0명이다").is_greater(0)
	var after: int = _count_by_league(s, "LEAGUE_HIGHSCHOOL")
	assert_int(after).override_failure_message(
		"고교가 %d명에서 %d명이 됐다" % [before, after]) \
		.is_between(before - 20, before + 20)


## 신입생은 **전원 1학년**이다 — 학년제 배분을 넘기면 첫 해부터 3학년이 섞인다
func test_freshmen_are_all_first_years() -> void:
	var s: Dictionary = _game()
	var before: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		before[p["id"]] = true

	SeasonRunner.run(s)
	var fresh: int = 0
	for p in SeasonRunner.all_players(s):
		if before.has(p["id"]) or p.get("league_id", "") != "LEAGUE_HIGHSCHOOL":
			continue
		assert_int(int(p["grade"])).override_failure_message(
			"신입생이 %d학년이다" % int(p["grade"])).is_equal(1)
		fresh += 1
	assert_int(fresh).is_greater(0)


## ⚠ **학년이 고르게 흩어져야 한다.** 전원 1학년으로 시작하면 3년간
## 졸업생이 0명이고 드래프트가 안 돈다
func test_the_world_starts_with_every_grade() -> void:
	var s: Dictionary = _game()
	var by_grade: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		if p.get("league_id", "") != "LEAGUE_HIGHSCHOOL":
			continue
		var g: int = int(p.get("grade", 0))
		by_grade[g] = int(by_grade.get(g, 0)) + 1

	for g in [1, 2, 3]:
		assert_int(int(by_grade.get(g, 0))).override_failure_message(
			"%d학년이 %d명이다 — 학년이 안 흩어졌다" % [g, int(by_grade.get(g, 0))]) \
			.is_greater(100)


## ⚠ **미지명자를 배정 안 하면 풀이 무한히 쌓인다.** 실측으로 5년에
## 4,221명이 소속 없이 떠다녔다
func test_the_undrafted_do_not_pile_up() -> void:
	var s: Dictionary = _game()
	for i in 3:
		s["season_year"] = 2027 + i
		var out: Dictionary = SeasonRunner.run(s)
		# 정원 초과 방출자도 같은 자리를 지난다
		assert_int(int(out["summary"]["placed"]) + int(out["summary"]["gave_up"])) \
			.is_equal(int(out["summary"]["undrafted"]) + int(out["summary"]["released"]))
	assert_array(s["world"][SeasonRunner.POOL_KEY]).override_failure_message(
		"3년 뒤 드래프트 풀에 %d명이 남았다" % s["world"][SeasonRunner.POOL_KEY].size()) \
		.is_empty()


## 소속 없는 현역이 떠다니면 안 된다 — 화면과 시뮬이 다 깨진다
func test_nobody_is_active_without_a_team() -> void:
	var s: Dictionary = _game()
	for i in 3:
		s["season_year"] = 2027 + i
		SeasonRunner.run(s)

	for p in SeasonRunner.all_players(s):
		if p.get("career_status", "") != "active":
			continue
		assert_str(String(p.get("team_id", ""))).override_failure_message(
			"%s가 소속 없이 현역이다 (%s)" % [p["id"], p.get("league_id", "")]) \
			.is_not_empty()


## 여러 해를 굴려도 학년 분포가 유지된다 — 한 해라도 끊기면 그 세대가 빈다
func test_the_grades_stay_balanced_over_years() -> void:
	var s: Dictionary = _game()
	for i in 5:
		s["season_year"] = 2027 + i
		SeasonRunner.run(s)

	var by_grade: Dictionary = {}
	for p in SeasonRunner.all_players(s):
		if p.get("league_id", "") != "LEAGUE_HIGHSCHOOL":
			continue
		var g: int = int(p.get("grade", 0))
		by_grade[g] = int(by_grade.get(g, 0)) + 1

	for g in [1, 2, 3]:
		assert_int(int(by_grade.get(g, 0))).override_failure_message(
			"5년 뒤 %d학년이 %d명이다" % [g, int(by_grade.get(g, 0))]).is_greater(500)


# ── 나가는 문이 있는가 (M9-5) ─────────────────────────────────

## ⚠ **로스터 상한이 없으면 프로가 매년 지명 수만큼 불어난다.**
## 실측으로 8년에 7,337 → 8,216명이 됐다
func test_the_pro_rosters_stay_within_their_cap() -> void:
	var s: Dictionary = _game()
	for i in 3:
		s["season_year"] = 2027 + i
		SeasonRunner.run(s)

	for tid in s["world"]["rosters"]:
		var roster: Array = s["world"]["rosters"][tid]
		if roster.is_empty():
			continue
		var league: String = String(roster[0].get("league_id", ""))
		if not RosterMaintenance.ROSTER_LIMITS.has(league):
			continue
		assert_int(roster.size()).override_failure_message(
			"%s(%s)가 %d명이다 (상한 %d)" % [tid, league, roster.size(),
				RosterMaintenance.roster_max_of(league)]) \
			.is_less_equal(RosterMaintenance.roster_max_of(league))


## ⚠ **2군 상한도 걸려야 한다.** `is_pro_league`는 1군만 참이라 그걸 쓰면
## 강등자가 들어와도 아무도 다시 안 본다 — 02의 "KBL 700명"이 그 형태다
func test_the_farm_cap_is_enforced_too() -> void:
	var s: Dictionary = _game()
	for i in 3:
		s["season_year"] = 2027 + i
		var out: Dictionary = SeasonRunner.run(s)
		assert_int(int(out["summary"]["demoted"])).override_failure_message(
			"아무도 2군으로 안 내려갔다").is_greater(0)

	var farm_total: int = 0
	for tid in s["world"]["rosters"]:
		if String(tid).ends_with(World.FARM_SUFFIX):
			farm_total += s["world"]["rosters"][tid].size()
			assert_int(s["world"]["rosters"][tid].size()).override_failure_message(
				"%s가 %d명이다" % [tid, s["world"]["rosters"][tid].size()]) \
				.is_less_equal(RosterMaintenance.roster_max_of("LEAGUE_KBL_FARM"))
	assert_int(farm_total).is_greater(0)


## ⚠ **세계 인구가 발산하면 안 된다.** 들어오는 문(드래프트·신입생)만
## 있고 나가는 문이 없으면 매년 불어난다
func test_the_world_population_stays_stable() -> void:
	var s: Dictionary = _game()
	var start: int = SeasonRunner.all_players(s).size()
	for i in 5:
		s["season_year"] = 2027 + i
		SeasonRunner.run(s)

	var now: int = SeasonRunner.all_players(s).size()
	assert_int(now).override_failure_message(
		"5년 만에 %d명이 %d명이 됐다" % [start, now]) \
		.is_between(int(start * 0.85), int(start * 1.05))


## ⚠ **고졸 미지명자가 대학으로 이어져야 한다.** 안 이으면 매년 1,300명이
## 통째로 사라지고, 대학은 무에서 생긴 선수로만 찬다
func test_undrafted_highschoolers_go_to_university() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)

	var enrolled: int = 0
	for p in SeasonRunner.all_players(s):
		for e in p.get("career_events", []):
			if e.get("type", "") == "enrolled":
				enrolled += 1
				# 대학에 가면 1학년부터다
				assert_int(int(p["grade"])).is_equal(1)
				assert_str(p["league_id"]).is_equal(SeasonRunner.UNIV_LEAGUE)
	assert_int(enrolled).override_failure_message(
		"대학에 진학한 고졸이 0명이다").is_greater(0)


## 대졸 미지명자는 대학으로 안 돌아간다 — 마지막 기록이 진로를 가른다
func test_a_university_graduate_does_not_re_enroll() -> void:
	var s: Dictionary = _game()
	for i in 5:
		s["season_year"] = 2027 + i
		SeasonRunner.run(s)

	for p in SeasonRunner.all_players(s):
		var uni_years: int = 0
		for e in p.get("career_events", []):
			if e.get("type", "") == "enrolled":
				uni_years += 1
		assert_int(uni_years).override_failure_message(
			"%s가 대학에 %d번 갔다" % [p["id"], uni_years]).is_less_equal(1)


# ── 다음 해로 넘어가는가 (M9-6) ───────────────────────────────

func test_rolling_over_starts_a_new_year() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = SeasonRunner.finish_season(s)
	assert_bool(out["ran"]).is_true()
	assert_int(int(s["season_year"])).is_equal(2028)
	assert_int(int(s["day"])).is_equal(1)


## ⚠ **새 일정이 깔려야 한다.** 안 깔면 첫날부터 시즌 마지막 날 조건에
## 걸려 시즌 종료가 무한히 반복된다
func test_a_new_schedule_is_laid_out() -> void:
	var s: Dictionary = _game()
	var before: int = s["schedule"].size()
	SeasonRunner.finish_season(s)

	assert_int(s["schedule"].size()).is_greater(0)
	for g in s["schedule"]:
		assert_bool(g.get("result", null) == null).override_failure_message(
			"새 일정에 지난 시즌 결과가 남았다").is_true()
	assert_int(s["schedule"].size()).is_between(int(before * 0.8), int(before * 1.2))


## ⚠ **경기 id에 연도가 들어간다.** 안 넣으면 다음 해 경기가 같은 id를
## 갖고, 소식·기록이 옛 경기와 겹친다
func test_the_new_games_have_new_ids() -> void:
	var s: Dictionary = _game()
	var old_ids: Dictionary = {}
	for g in s["schedule"]:
		old_ids[g["id"]] = true

	SeasonRunner.finish_season(s)
	for g in s["schedule"]:
		assert_bool(old_ids.has(g["id"])).override_failure_message(
			"새 시즌 경기가 옛 id를 그대로 쓴다: %s" % g["id"]).is_false()


## ⚠ **주인공 등판이 다시 잡혀야 한다.** 옛 팀으로 짜면 내 경기가 하나도
## 안 잡힌다 — 졸업·진학·지명이 방금 지났다
func test_my_starts_are_marked_again() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = SeasonRunner.finish_season(s)
	assert_int(int(out["rollover"]["my_starts"])).override_failure_message(
		"새 시즌에 내 등판이 0경기다").is_greater(0)


## ⚠ **보직을 다시 정한다.** 팀이 바뀌면 나보다 센 투수의 수가 달라진다 —
## 옛 팀 기준으로 두면 선발이던 사람이 등판을 하나도 못 받는 해가 생긴다
func test_the_role_is_decided_again() -> void:
	var s: Dictionary = _game()
	var out: Dictionary = SeasonRunner.finish_season(s)
	assert_array(["SP", "RP"]).contains([String(out["rollover"]["role"])])
	assert_str(String(s["protagonist"]["role"])).is_equal(out["rollover"]["role"])


## 새 해에는 시즌 종료가 다시 돈다 — 가드가 해마다 열려야 한다
func test_the_next_season_can_end_too() -> void:
	var s: Dictionary = _game()
	SeasonRunner.finish_season(s)
	var out: Dictionary = SeasonRunner.finish_season(s)
	assert_bool(out["ran"]).override_failure_message(
		"두 번째 시즌이 안 끝난다").is_true()
	assert_int(int(s["season_year"])).is_equal(2029)


## 이미 끝낸 해를 또 끝내려 하면 롤오버도 안 한다
func test_finishing_twice_does_not_roll_over_twice() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)
	var year: int = int(s["season_year"])
	var out: Dictionary = SeasonRunner.finish_season(s)
	assert_bool(out["ran"]).is_false()
	assert_int(int(s["season_year"])).override_failure_message(
		"이미 끝낸 해인데 롤오버가 돌았다").is_equal(year)


## ⚠ **지난 시즌의 미결정을 남기지 않는다.** 지나간 선택지가 새 해를 막는다
func test_pending_decisions_are_cleared() -> void:
	var s: Dictionary = _game()
	s["pending"] = [{"id": "OLD"}]
	SeasonRunner.finish_season(s)
	assert_array(s["pending"]).is_empty()


## 세 해를 이어 돌려도 무너지지 않는다
func test_three_seasons_in_a_row() -> void:
	var s: Dictionary = _game()
	for i in 3:
		var out: Dictionary = SeasonRunner.finish_season(s)
		assert_bool(out["ran"]).override_failure_message(
			"%d번째 시즌이 안 끝났다" % (i + 1)).is_true()
	assert_int(int(s["season_year"])).is_equal(2030)
	assert_int(int(s["protagonist"]["age"])).is_equal(20)


## ⚠ **주인공이 정원에서 밀려 사라지면 안 된다.** NPC와 같이 능력치 순으로
## 배정하니 3년차에 자리를 못 잡고 은퇴했다 — **게임이 조용히 끝났다.**
## 진로는 사용자가 정할 일이다
func test_the_protagonist_never_gets_squeezed_out() -> void:
	var s: Dictionary = _game()
	for i in 6:
		SeasonRunner.finish_season(s)
		assert_str(String(s["protagonist"]["career_status"])).override_failure_message(
			"%d년차에 주인공이 %s가 됐다" % [i + 1, s["protagonist"]["career_status"]]) \
			.is_equal("active")
		assert_str(String(s["protagonist"]["team_id"])).override_failure_message(
			"%d년차에 주인공이 소속을 잃었다" % (i + 1)).is_not_empty()

	# 여섯 해면 고교 3년 + 대학 3년 — 나이가 그만큼 올라야 한다
	assert_int(int(s["protagonist"]["age"])).is_equal(23)


## 주인공이 실제로 그 팀 로스터에 있어야 한다 — 소속만 맞고 로스터에
## 없으면 등판이 하나도 안 잡힌다
func test_the_protagonist_stays_on_a_roster() -> void:
	var s: Dictionary = _game()
	for i in 4:
		SeasonRunner.finish_season(s)
		var tid: String = String(s["protagonist"]["team_id"])
		var found: bool = false
		for p in World.roster_of(s["world"], tid):
			if p.get("is_protagonist", false):
				found = true
		assert_bool(found).override_failure_message(
			"%d년차에 주인공이 %s 로스터에 없다" % [i + 1, tid]).is_true()


# ── 변이가 안 잡히던 자리 ─────────────────────────────────────

## 새 세계는 35세 이상이 없어서 **첫 해엔 은퇴가 0명이다.** 여러 해를
## 굴려야 은퇴가 생기고, 그때 로스터에서 빠지는지가 보인다
func test_the_retired_leave_their_team_over_many_years() -> void:
	var s: Dictionary = _game()
	var total: int = 0
	for i in 10:
		total += int(SeasonRunner.finish_season(s)["summary"]["retired"])
	assert_int(total).override_failure_message(
		"10년을 굴려도 은퇴가 0명이다 — 검사가 헛돈다").is_greater(0)

	for tid in s["world"]["rosters"]:
		for p in s["world"]["rosters"][tid]:
			assert_str(p.get("career_status", "")).override_failure_message(
				"%s에 은퇴자가 남았다" % tid).is_not_equal("retired")


## ⚠ **강등할 때 리그도 같이 바꾼다.** 팀만 `_2`로 바꾸면 그 선수는 여전히
## 1군 소속으로 집계돼 2군 상한이 영원히 안 걸린다
func test_a_demoted_player_changes_league_too() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)

	var checked: int = 0
	for tid in s["world"]["rosters"]:
		if not String(tid).ends_with(World.FARM_SUFFIX):
			continue
		for p in s["world"]["rosters"][tid]:
			assert_str(String(p.get("league_id", ""))).override_failure_message(
				"%s(2군)에 %s 소속 선수가 있다" % [tid, p.get("league_id", "")]) \
				.ends_with("_FARM")
			assert_str(String(p.get("team_id", ""))).is_equal(tid)
			checked += 1
	assert_int(checked).is_greater(0)


## ⚠ **약한 선수부터 내려간다.** 뒤집으면 1군에 약한 선수만 남는다.
##
## ⚠ **평균 비교로는 못 잡는다.** 2군 대역이 애초에 낮아서(생성 규칙 KBL
## 58~84 · FARM 48~76) 누가 내려가든 평균은 안 뒤집힌다 — 실제로 변이가
## 안 잡혔다. **강등된 본인**이 남은 1군보다 약한지를 본다
func test_the_weakest_get_demoted() -> void:
	var s: Dictionary = _game()
	SeasonRunner.run(s)

	# 1군에 남은 사람 중 제일 약한 값
	var floor_of: Dictionary = {}
	for tid in s["world"]["rosters"]:
		if String(tid).ends_with(World.FARM_SUFFIX):
			continue
		var lo: float = INF
		for p in s["world"]["rosters"][tid]:
			lo = minf(lo, Offseason.core_ovr(p))
		floor_of[tid] = lo

	var checked: int = 0
	for p in SeasonRunner.all_players(s):
		for e in p.get("career_events", []):
			if e.get("type", "") != "demote_roster":
				continue
			var from_team: String = String(e.get("from_team_id", ""))
			if not floor_of.has(from_team):
				continue
			assert_float(Offseason.core_ovr(p)).override_failure_message(
				"%s(%.1f)가 내려갔는데 %s에 %.1f짜리가 남았다 — 순서가 뒤집혔다"
				% [p["id"], Offseason.core_ovr(p), from_team, floor_of[from_team]]) \
				.is_less_equal(float(floor_of[from_team]))
			checked += 1
	assert_int(checked).override_failure_message("강등된 선수가 0명이다").is_greater(0)


## ⚠ **주인공은 정원 초과로 밀려나지 않는다.** 정원을 꽉 채운 프로 팀에
## 넣어도 강등·방출 대상이 아니다 — 사용자가 정할 일이다
func test_the_protagonist_is_never_demoted() -> void:
	var s: Dictionary = _game()
	var me: Dictionary = s["protagonist"]

	# 주인공을 정원 초과 프로 1군에 옮겨 둔다
	var tid: String = String(World.teams_of(SeasonRunner.DRAFT_LEAGUE)[0]["id"])
	for t in s["world"]["rosters"]:
		var kept: Array = []
		for p in s["world"]["rosters"][t]:
			if not p.get("is_protagonist", false):
				kept.append(p)
		s["world"]["rosters"][t] = kept
	me["team_id"] = tid
	me["league_id"] = SeasonRunner.DRAFT_LEAGUE
	me["grade"] = null
	s["world"]["rosters"][tid].append(me)

	SeasonRunner.run(s)
	assert_str(String(me["team_id"])).override_failure_message(
		"주인공이 %s로 밀려났다" % me["team_id"]).is_equal(tid)
	assert_str(String(me["league_id"])).is_equal(SeasonRunner.DRAFT_LEAGUE)

	var found: bool = false
	for p in s["world"]["rosters"][tid]:
		if p.get("is_protagonist", false):
			found = true
	assert_bool(found).override_failure_message(
		"주인공이 로스터에서 사라졌다").is_true()


## ⚠ **롤오버가 날짜를 첫날로 되돌린다.** 안 되돌리면 첫날부터 시즌 종료
## 조건에 걸려 무한히 반복된다
func test_the_rollover_resets_the_day() -> void:
	var s: Dictionary = _game()
	s["day"] = int(s["season_days"])
	SeasonRunner.finish_season(s)
	assert_int(int(s["day"])).override_failure_message(
		"롤오버 뒤에도 %d일차다 — 첫날부터 시즌 종료가 반복된다" % int(s["day"])) \
		.is_equal(1)
	assert_bool(DayEngine.stop_reason(s) != null \
		and String(DayEngine.stop_reason(s).get("type", "")) == "season_end") \
		.override_failure_message("새 해 첫날인데 아직 시즌 종료 상태다").is_false()


## ⚠ **보직을 다시 정한다.** 팀이 바뀌면 나보다 센 투수의 수가 달라진다
func test_the_role_follows_the_new_team() -> void:
	var s: Dictionary = _game()
	var me: Dictionary = s["protagonist"]

	# 나보다 센 투수가 없는 팀으로 옮기면 선발이어야 한다
	me["role"] = "RP"
	me["position"] = "RP"
	var solo: String = "TEAM_SOLO"
	s["world"]["rosters"][solo] = [me]
	me["team_id"] = solo
	me["league_id"] = "LEAGUE_INDEPENDENT"
	me["grade"] = null
	s["last_world_season_end_year"] = 2026

	SeasonRunner.finish_season(s)
	assert_str(String(me["role"])).override_failure_message(
		"혼자인 팀인데 보직이 %s다 — 보직을 다시 안 정한다" % me["role"]) \
		.is_equal("SP")
