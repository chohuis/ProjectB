extends GdUnitTestSuite

## 국가대표 배선 — 발탁 · 차출 · 결과 · 면제. B-8.
##
## ⚠ **02는 대회를 로그로만 냈다.** 자동진행 로그는 개발용이라 플레이어는
## **발탁도 메달도 병역 면제도 못 봤다** — 세계에서 제일 큰 사건이 화면에
## 없었다.


func _day_of(week: int) -> int:
	return (week - 1) * Calendar.DAYS_PER_WEEK + 1


func _npc(i: int, over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": "N%03d" % i, "name": "선수%d" % i,
		"league_id": "LEAGUE_KBL", "team_id": "T%d" % (i % 10),
		"position": "SP" if i % 2 == 0 else "1B",
		"player_type": "pitcher" if i % 2 == 0 else "batter",
		"pitching": {"ovr": 80.0 - float(i) * 0.3},
		"batting": {"ovr": 80.0 - float(i) * 0.3},
		"age": 25, "career_status": "active",
		"military_status": "미필", "nationality": "KOR",
		"career_events": [],
	}
	p.merge(over, true)
	return p


func _state(over: Dictionary = {}) -> Dictionary:
	var roster: Array = []
	for i in range(100):
		roster.append(_npc(i))
	var s: Dictionary = {
		"day": 1, "season_year": 2028, "seed": 5,
		"protagonist": {
			"id": "ME", "name": "김한결", "career_stage": "pro_kbl",
			"league_id": "LEAGUE_KBL", "team_id": "MINE", "age": 25,
			"player_type": "pitcher", "position": "SP",
			"pitching": {"ovr": 99.0}, "batting": {},
			"career_status": "active", "military_status": "미필",
			"nationality": "KOR", "career_events": [],
		},
		"world": {"rosters": {"POOL": roster}},
		"team_names": {}, "season_stats": {},
		"pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


## 주인공을 세계 로스터에도 넣는다 — 후보를 세계에서 훑기 때문이다
func _with_me(s: Dictionary) -> Dictionary:
	s["world"]["rosters"]["MINE"] = [s["protagonist"]]
	return s


func _olympic_week() -> int:
	return int(NationalTeam.tournament_of(2028)["week"])


# ── 발탁 ──────────────────────────────────────────────────────

func test_the_squad_is_announced_on_the_opening_week() -> void:
	var s: Dictionary = _state()
	NationalRunner.run(s, _day_of(_olympic_week()))
	assert_array(NationalRunner.duty_of(s).get("squad", [])).override_failure_message(
		"개막 주인데 대표팀이 안 뽑혔다").is_not_empty()
	assert_int(s["mailbox"].size()).override_failure_message(
		"대표 발탁이 소식에 안 뜬다 — 02가 로그로만 냈다").is_greater(0)


func test_an_ordinary_week_does_nothing() -> void:
	var s: Dictionary = _state()
	NationalRunner.run(s, _day_of(_olympic_week() - 1))
	assert_dict(NationalRunner.duty_of(s)).is_empty()
	assert_array(s["mailbox"]).is_empty()


func test_a_year_without_a_tournament_does_nothing() -> void:
	var s: Dictionary = _state({"season_year": 2027})
	for w in range(1, 53):
		NationalRunner.run(s, _day_of(w))
	assert_dict(NationalRunner.duty_of(s)).override_failure_message(
		"대회 없는 해에 대표팀이 뽑혔다").is_empty()


## ⚠ **끝나는 주를 발탁할 때 못 박는다.** 매주 다시 세면 규칙이 바뀔 때
## 진행 중인 대회가 늘거나 준다
func test_the_end_week_is_fixed_at_call_up() -> void:
	var s: Dictionary = _state()
	var t: Dictionary = NationalTeam.tournament_of(2028)
	NationalRunner.run(s, _day_of(_olympic_week()))
	assert_int(int(NationalRunner.duty_of(s)["end_week"])).is_equal(
		int(t["week"]) + int(t["duration_weeks"]))


func test_the_squad_is_called_up() -> void:
	var s: Dictionary = _state()
	NationalRunner.run(s, _day_of(_olympic_week()))
	var first: String = String(NationalRunner.duty_of(s)["squad"][0])
	assert_bool(NationalRunner.is_called_up(s, first)).is_true()
	assert_bool(NationalRunner.is_called_up(s, "NOBODY")).is_false()


# ── 후보 ──────────────────────────────────────────────────────

## ⚠ **국적을 봐야 한다.** 02는 병역만 걸렀는데 외국인은 병역이 "면제"라
## 그 조건을 그냥 통과한다 — **KBL 외국인이 한국 대표로 뽑혔다**
func test_a_foreign_player_is_not_korean_national() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["POOL"][0] = _npc(0, {"nationality": "USA",
		"military_status": "면제", "pitching": {"ovr": 99.0}})
	for c in NationalRunner.candidates(s):
		assert_str(String(c["id"])).override_failure_message(
			"외국인이 한국 대표 후보에 있다").is_not_equal("N000")


## 국적이 없는 옛 세이브는 한국인으로 읽는다
func test_an_old_save_without_a_nationality_is_korean() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = _npc(0)
	p.erase("nationality")
	s["world"]["rosters"]["POOL"][0] = p
	var found: bool = false
	for c in NationalRunner.candidates(s):
		if String(c["id"]) == "N000":
			found = true
	assert_bool(found).is_true()


## 복무 중인 선수는 뽑아도 의미가 없다
func test_a_serving_soldier_is_not_a_candidate() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["POOL"][0] = _npc(0, {"military_status": "현역"})
	for c in NationalRunner.candidates(s):
		assert_str(String(c["id"])).is_not_equal("N000")


func test_a_retired_player_is_not_a_candidate() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["POOL"][0] = _npc(0, {"career_status": "retired"})
	for c in NationalRunner.candidates(s):
		assert_str(String(c["id"])).is_not_equal("N000")


## 2군도 후보다 — 성적이 좋으면 올라간다
func test_the_farm_league_counts() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["POOL"][0] = _npc(0, {"league_id": "LEAGUE_KBL_FARM"})
	var found: bool = false
	for c in NationalRunner.candidates(s):
		if String(c["id"]) == "N000":
			found = true
	assert_bool(found).is_true()


## 학교·독립은 대표 후보가 아니다
func test_an_amateur_is_not_a_candidate() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["POOL"][0] = _npc(0, {"league_id": "LEAGUE_HIGHSCHOOL"})
	for c in NationalRunner.candidates(s):
		assert_str(String(c["id"])).is_not_equal("N000")


## ⚠ **성적이 후보에 실린다.** 안 실으면 능력치만 보고 뽑는다
func test_the_season_form_reaches_the_candidate() -> void:
	var s: Dictionary = _state()
	s["season_stats"] = {"N000": {"type": "pitcher", "ip": 150.0, "era": 1.50}}
	for c in NationalRunner.candidates(s):
		if String(c["id"]) == "N000":
			assert_float(float(c["form"])).override_failure_message(
				"방어율 1.50인데 성적 점수가 0이다").is_greater(0.0)
			return
	fail("후보에 N000이 없다")


func test_the_protagonist_is_a_candidate_too() -> void:
	var s: Dictionary = _with_me(_state())
	var mine: bool = false
	for c in NationalRunner.candidates(s):
		if bool(c["is_protagonist"]):
			mine = true
	assert_bool(mine).override_failure_message(
		"주인공이 대표 후보에 없다").is_true()


# ── 결과 ──────────────────────────────────────────────────────

func _play_through(s: Dictionary) -> Dictionary:
	var t: Dictionary = NationalTeam.tournament_of(int(s["season_year"]))
	NationalRunner.run(s, _day_of(int(t["week"])))
	return NationalRunner.run(s, _day_of(int(t["week"]) + int(t["duration_weeks"])))


## ⚠ **차출은 반드시 풀린다.** 안 풀면 대표팀이 소속팀 경기에 영영 안 나온다
func test_the_call_up_is_released() -> void:
	var s: Dictionary = _state()
	_play_through(s)
	assert_dict(NationalRunner.duty_of(s)).override_failure_message(
		"대회가 끝났는데 차출이 안 풀렸다").is_empty()


func test_the_result_arrives_as_news() -> void:
	var s: Dictionary = _state()
	var out: Dictionary = _play_through(s)
	assert_dict(out["result"]).is_not_empty()
	assert_int(s["mailbox"].size()).override_failure_message(
		"대회 결과가 소식에 안 뜬다").is_equal(2)


func test_nothing_happens_before_the_end_week() -> void:
	var s: Dictionary = _state()
	var t: Dictionary = NationalTeam.tournament_of(2028)
	NationalRunner.run(s, _day_of(int(t["week"])))
	NationalRunner.run(s, _day_of(int(t["week"]) + 1))
	assert_dict(NationalRunner.duty_of(s)).override_failure_message(
		"대회 도중에 차출이 풀렸다").is_not_empty()


# ── 병역 면제 ─────────────────────────────────────────────────

## ⚠ **대표팀 전원에게 준다.** 실제 규정과 같다
## 주인공은 세계 로스터가 아니라 `protagonist`에서 찾는다 — 여기서
## `_with_me`를 쓰면 그 경로가 안 쓰여도 검사가 통과한다
func test_the_exemption_goes_to_the_whole_squad() -> void:
	var s: Dictionary = _state()
	var squad: Array = ["N000", "N002", "ME"]
	assert_int(NationalRunner.grant_exemption(s, squad, 2028, "아시안게임")).is_equal(3)
	assert_str(String(s["protagonist"]["military_status"])).is_equal(
		NationalRunner.EXEMPT_STATUS)
	for p in s["world"]["rosters"]["POOL"]:
		if squad.has(String(p["id"])):
			assert_str(String(p["military_status"])).is_equal(
				NationalRunner.EXEMPT_STATUS)


## ⚠ **이미 다녀온 사람은 그대로 둔다.** 면제가 군필을 덮으면 기록이 뒤집힌다
func test_a_veteran_keeps_his_service_record() -> void:
	var s: Dictionary = _state()
	s["world"]["rosters"]["POOL"][0] = _npc(0, {"military_status": "군필"})
	NationalRunner.grant_exemption(s, ["N000"], 2028, "아시안게임")
	assert_str(String(s["world"]["rosters"]["POOL"][0]["military_status"])
		).override_failure_message("면제가 군필을 덮었다").is_equal("군필")


func test_the_exemption_is_written_down() -> void:
	var s: Dictionary = _state()
	NationalRunner.grant_exemption(s, ["N000"], 2028, "아시안게임")
	var events: Array = s["world"]["rosters"]["POOL"][0]["career_events"]
	assert_int(events.size()).is_equal(1)
	assert_str(String(events[0]["type"])).is_equal("military_exemption")
	assert_str(String(events[0]["detail"])).contains("아시안게임")


## 면제 없는 대회는 아무도 안 준다 — 월드컵(year_mod 1)
func test_a_tournament_without_an_exemption_grants_none() -> void:
	var s: Dictionary = _state({"season_year": 2029})
	_play_through(s)
	for p in s["world"]["rosters"]["POOL"]:
		assert_str(String(p["military_status"])).override_failure_message(
			"월드컵으로 병역 면제를 받았다").is_not_equal(NationalRunner.EXEMPT_STATUS)


## ⚠ **입상하면 실제로 면제가 붙는다.** 안 붙으면 대회가 데이터로만 도는 것이다
func test_a_medal_actually_changes_the_service_status() -> void:
	var exempted: int = 0
	for year in [2028, 2032, 2036, 2040, 2044, 2048, 2052, 2056]:
		var s: Dictionary = _state({"season_year": year})
		_play_through(s)
		for p in s["world"]["rosters"]["POOL"]:
			if String(p["military_status"]) == NationalRunner.EXEMPT_STATUS:
				exempted += 1
				break
	assert_int(exempted).override_failure_message(
		"올림픽 여덟 번에 면제가 한 번도 안 나왔다").is_greater(0)


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **같은 세계·같은 해면 같은 결과다.** 안 그러면 세이브를 다시 열 때마다
## 메달 색이 바뀐다
func test_the_same_world_gives_the_same_result() -> void:
	var a: Dictionary = _state()
	var b: Dictionary = _state()
	assert_dict(_play_through(a)["result"]).is_equal(_play_through(b)["result"])


## 세계가 다르면 결과가 갈린다 — 씨앗이 안 섞이면 모든 세계가 같은 성적이다
func test_a_different_world_can_finish_differently() -> void:
	var ranks: Dictionary = {}
	for seed_value in range(1, 30):
		var s: Dictionary = _state({"seed": seed_value})
		ranks[int(_play_through(s)["result"]["rank"])] = true
	assert_int(ranks.size()).override_failure_message(
		"서른 세계가 전부 같은 순위다 — 씨앗이 안 섞였다").is_greater(1)
