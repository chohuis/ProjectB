extends GdUnitTestSuite

## 드래프트 보드 — C-1.
##
## ⚠ **보드는 그날의 기록을 재생만 한다.** 02는 이 모달이 자기 후보 풀을
## 만들고 자체 시뮬을 돌려서 **화면에서 본 지명과 실제 소속이 어긋났다.**


func _cand(id: String, ovr: float, league: String = "LEAGUE_HIGHSCHOOL",
		mine: bool = false) -> Dictionary:
	return {"id": id, "name": "선수%s" % id, "position": "SP",
		"player_type": "pitcher", "pitching": {"ovr": ovr}, "batting": {},
		"age": 19, "league_id": league, "is_protagonist": mine}


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2030,
		"protagonist": {"id": "ME"},
		"team_names": {"T1": "제주 드래곤스", "T2": "서울 코메츠"},
	}
	s.merge(over, true)
	return s


## 두 라운드 · 두 팀. 순번은 일부러 뒤섞어 넣는다
func _record(s: Dictionary, mine: bool = false) -> void:
	var by_id: Dictionary = {
		"A": _cand("A", 80.0), "B": _cand("B", 75.0, "LEAGUE_UNIVERSITY"),
		"C": _cand("C", 70.0), "D": _cand("D", 65.0, "LEAGUE_INDEPENDENT"),
		"E": _cand("E", 60.0), "ME": _cand("ME", 72.0, "LEAGUE_HIGHSCHOOL", mine),
	}
	var picks: Array = [
		{"round": 2, "pick": 3, "team_id": "T1", "npc_id": "C"},
		{"round": 1, "pick": 2, "team_id": "T2", "npc_id": "B"},
		{"round": 1, "pick": 1, "team_id": "T1", "npc_id": "A"},
		{"round": 2, "pick": 4, "team_id": "T2", "npc_id": "ME" if mine else "D"},
	]
	DraftLog.record(s, 2030, picks, ["A", "B", "C", "D", "E"], ["E"], by_id)


# ── 기록 ──────────────────────────────────────────────────────

## ⚠ **지명 당일의 값을 박아 둔다.** 선수는 그 뒤로 자라고 팀을 옮긴다 —
## 나중에 원본을 다시 읽으면 그날과 다른 숫자가 뜬다
func test_the_snapshot_freezes_that_days_numbers() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = _cand("A", 80.0)
	DraftLog.record(s, 2030, [{"round": 1, "pick": 1, "team_id": "T1",
		"npc_id": "A"}], ["A"], [], {"A": p})

	# 그 뒤로 자라고 팀을 옮긴다
	p["pitching"]["ovr"] = 95.0
	p["league_id"] = "LEAGUE_KBL"

	var row: Dictionary = DraftLog.of(s, 2030)["picks"][0]
	assert_float(float(row["ovr"])).override_failure_message(
		"보드가 그날이 아니라 지금 능력치를 보여준다").is_equal(80.0)
	assert_str(String(row["from_league_id"])).is_equal("LEAGUE_HIGHSCHOOL")


func test_the_record_keeps_the_pick_order() -> void:
	var s: Dictionary = _state()
	_record(s)
	assert_int(DraftLog.of(s, 2030)["picks"].size()).is_equal(4)
	assert_int(int(DraftLog.of(s, 2030)["board_size"])).is_equal(5)
	assert_int(int(DraftLog.of(s, 2030)["candidates"])).is_equal(6)


## 보드에 올랐지만 안 뽑힌 사람 — **"몇 명 중 몇 명"이 보드의 뜻이다**
func test_the_missed_candidates_are_kept() -> void:
	var s: Dictionary = _state()
	_record(s)
	var missed: Array = DraftLog.of(s, 2030)["missed"]
	assert_int(missed.size()).is_equal(1)
	assert_str(String(missed[0]["id"])).is_equal("E")


## 보드에 못 든 사람은 미지명 목록에도 안 나온다 — 보드가 못 보여준 사람이다
func test_someone_off_the_board_is_not_listed() -> void:
	var s: Dictionary = _state()
	DraftLog.record(s, 2030, [], [], ["X"], {"X": _cand("X", 40.0)})
	assert_array(DraftLog.of(s, 2030)["missed"]).is_empty()


## ⚠ **드래프트 시점엔 후보 전원이 `LEAGUE_DRAFT_POOL`이다.** 지금 리그를
## 읽으면 **전원이 "재수"**로 나온다 — 화면을 띄워 보고 알았다
func test_the_origin_survives_the_draft_pool() -> void:
	var s: Dictionary = _state()
	var p: Dictionary = _cand("A", 80.0, "LEAGUE_DRAFT_POOL")
	p["origin_league_id"] = "LEAGUE_HIGHSCHOOL"
	DraftLog.record(s, 2030, [{"round": 1, "pick": 1, "team_id": "T1",
		"npc_id": "A"}], ["A"], [], {"A": p})
	assert_str(String(DraftLog.of(s, 2030)["picks"][0]["from_league_id"])
		).override_failure_message(
		"풀에 들어간 뒤라 출신이 '재수'로 덮였다").is_equal("LEAGUE_HIGHSCHOOL")


## ⚠ **진짜 세계에서도 출신이 갈려야 한다.** 전원이 한 갈래면 그 줄이
## 아무것도 안 알려준다
func test_the_real_board_shows_more_than_one_origin() -> void:
	var s: Dictionary = World.new_game({"seed": 20270101, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for g in s["schedule"]:
		g["result"] = {"home_score": 3, "away_score": 1, "winner": g["home"]}
	SeasonRunner.finish_season(s)

	var origins: Dictionary = {}
	for r in DraftBoardVm.build(s, 2027)["rounds"]:
		for p in r["picks"]:
			origins[String(p["origin"])] = true
	assert_int(origins.size()).override_failure_message(
		"지명자 출신이 %s 하나뿐이다 — 고교·대학·독립 구분이 사라졌다"
		% str(origins.keys())).is_greater(1)


func test_an_unknown_pick_is_skipped() -> void:
	var s: Dictionary = _state()
	DraftLog.record(s, 2030, [{"round": 1, "pick": 1, "team_id": "T1",
		"npc_id": "GHOST"}], [], [], {})
	assert_array(DraftLog.of(s, 2030)["picks"]).override_failure_message(
		"후보에 없는 사람이 지명 목록에 들어갔다").is_empty()


func test_each_year_keeps_its_own_board() -> void:
	var s: Dictionary = _state()
	_record(s)
	DraftLog.record(s, 2031, [], [], [], {})
	assert_int(DraftLog.of(s, 2030)["picks"].size()).is_equal(4)
	assert_array(DraftLog.of(s, 2031)["picks"]).is_empty()
	assert_dict(DraftLog.of(s, 2029)).is_empty()


# ── 보드 ──────────────────────────────────────────────────────

func test_an_unopened_draft_shows_an_empty_board() -> void:
	var vm: Dictionary = DraftBoardVm.build(_state(), 2030)
	assert_bool(bool(vm["has_data"])).is_false()
	assert_array(vm["rounds"]).is_empty()
	assert_str(String(vm["title"])).contains("2030")


## ⚠ **라운드로 묶고 순번으로 줄을 세운다.** 화면이 정렬하면 그게 두 번째
## 정본이 되고, 검사가 화면 소스의 `sort_custom`을 막는다
func test_the_picks_are_grouped_by_round_in_order() -> void:
	var s: Dictionary = _state()
	_record(s)
	var vm: Dictionary = DraftBoardVm.build(s, 2030)
	assert_int(vm["rounds"].size()).is_equal(2)
	assert_int(int(vm["rounds"][0]["round"])).is_equal(1)
	assert_int(int(vm["rounds"][1]["round"])).is_equal(2)

	var first: Array = vm["rounds"][0]["picks"]
	assert_int(int(first[0]["pick"])).override_failure_message(
		"1라운드가 순번대로 안 섰다").is_equal(1)
	assert_int(int(first[1]["pick"])).is_equal(2)


## ⚠ **보드를 열어도 기록은 안 뒤집힌다.** 화면이 원본을 정렬하면
## 저장까지 흔들린다 — 다음에 열 때 다른 순서가 저장돼 있다
func test_opening_the_board_does_not_reorder_the_record() -> void:
	var s: Dictionary = _state()
	_record(s)
	var first: int = int(DraftLog.of(s, 2030)["picks"][0]["pick"])
	DraftBoardVm.build(s, 2030)
	assert_int(int(DraftLog.of(s, 2030)["picks"][0]["pick"])
		).override_failure_message(
		"보드를 열었더니 기록 순서가 바뀌었다").is_equal(first)


func test_a_round_has_a_label() -> void:
	var s: Dictionary = _state()
	_record(s)
	assert_str(String(DraftBoardVm.build(s, 2030)["rounds"][0]["label"])
		).is_equal("1라운드")


## ⚠ **화면이 팀 이름을 다시 찾지 않는다** — 여기서 붙인다
func test_the_team_name_is_attached() -> void:
	var s: Dictionary = _state()
	_record(s)
	var row: Dictionary = DraftBoardVm.build(s, 2030)["rounds"][0]["picks"][0]
	assert_str(String(row["team_name"])).is_equal("제주 드래곤스")


## 이름 없는 팀은 id라도 보여준다 — 빈칸보다 낫다
func test_an_unknown_team_falls_back_to_its_id() -> void:
	var s: Dictionary = _state({"team_names": {}})
	_record(s)
	assert_str(String(DraftBoardVm.build(s, 2030)["rounds"][0]["picks"][0]["team_name"])
		).is_equal("T1")


## ⚠ **어디서 왔는지를 보여준다.** 02는 이 기록이 없어 화면이 국내 신인과
## 구분을 못 했다
func test_the_origin_is_labelled() -> void:
	var s: Dictionary = _state()
	_record(s)
	var vm: Dictionary = DraftBoardVm.build(s, 2030)
	assert_str(String(vm["rounds"][0]["picks"][0]["origin"])).is_equal("고교")
	assert_str(String(vm["rounds"][0]["picks"][1]["origin"])).is_equal("대학")
	assert_str(DraftBoardVm._origin_label("LEAGUE_ABL")).is_equal("기타")


## **"몇 명 중 몇 명"이 보드의 뜻이다** — 지명만 보여주면 경쟁이 안 보인다
func test_the_summary_shows_the_competition() -> void:
	var s: Dictionary = _state()
	_record(s)
	var summary: String = String(DraftBoardVm.build(s, 2030)["summary"])
	assert_str(summary).contains("6")      # 후보
	assert_str(summary).contains("5")      # 보드
	assert_str(summary).contains("4")      # 지명


func test_the_missed_candidates_are_shown() -> void:
	var s: Dictionary = _state()
	_record(s)
	var missed: Array = DraftBoardVm.build(s, 2030)["missed"]
	assert_int(missed.size()).is_equal(1)
	assert_str(String(missed[0]["pick_label"])).override_failure_message(
		"미지명자가 0순위로 찍힌다 — 1순위보다 위로 읽힌다").is_equal("미지명")


## ⚠ **내가 어디서 뽑혔는지가 제일 중요한 줄이다**
func test_my_pick_is_singled_out() -> void:
	var s: Dictionary = _state()
	_record(s, true)
	var vm: Dictionary = DraftBoardVm.build(s, 2030)
	assert_dict(vm["my_pick"]).override_failure_message(
		"내가 지명됐는데 보드가 안 짚어 준다").is_not_empty()
	assert_int(int(vm["my_pick"]["pick"])).is_equal(4)
	assert_bool(bool(vm["my_pick"]["is_mine"])).is_true()


func test_nobody_is_mine_when_i_was_not_drafted() -> void:
	var s: Dictionary = _state()
	_record(s)
	var vm: Dictionary = DraftBoardVm.build(s, 2030)
	assert_dict(vm["my_pick"]).is_empty()
	for r in vm["rounds"]:
		for p in r["picks"]:
			assert_bool(bool(p["is_mine"])).override_failure_message(
				"내가 안 뽑혔는데 %s 가 나로 표시됐다" % p["id"]).is_false()


func test_a_round_knows_how_many_teams_pick() -> void:
	var s: Dictionary = _state()
	_record(s)
	assert_int(DraftBoardVm.teams_per_round(DraftLog.of(s, 2030)["picks"])
		).is_equal(2)


func test_an_empty_draft_still_reports_one_team() -> void:
	assert_int(DraftBoardVm.teams_per_round([])).override_failure_message(
		"팀이 0이면 나누기에서 터진다").is_greater(0)


# ── 배선 ──────────────────────────────────────────────────────

## ⚠ **드래프트가 실제로 기록을 남긴다.** 안 남기면 보드가 재생할 것이
## 없고, 02처럼 화면이 자기 시뮬을 또 돌리게 된다
func test_the_season_end_records_the_draft() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for g in s["schedule"]:
		g["result"] = {"home_score": 3, "away_score": 1, "winner": g["home"]}
	SeasonRunner.finish_season(s)

	var log: Dictionary = DraftLog.of(s, 2030)
	assert_dict(log).override_failure_message(
		"시즌이 끝났는데 드래프트 기록이 없다 — 보드가 재생할 게 없다"
	).is_not_empty()
	assert_array(log["picks"]).is_not_empty()

	var vm: Dictionary = DraftBoardVm.build(s, 2030)
	assert_bool(bool(vm["has_data"])).is_true()
	assert_array(vm["rounds"]).is_not_empty()


## ⚠ **보드가 보여주는 팀이 드래프트가 실제로 보낸 팀과 같아야 한다.**
## 02는 보드가 자체 시뮬을 또 돌려서 이 둘이 어긋났다.
##
## **지금 소속과 대조하지 않는다** — 지명 뒤에 2군행·트레이드가 일어나므로
## 그건 다른 이야기다. 대조 대상은 선수에게 박힌 **지명 사건**이다
func test_the_board_matches_where_the_draft_sent_them() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2030,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	for g in s["schedule"]:
		g["result"] = {"home_score": 3, "away_score": 1, "winner": g["home"]}
	SeasonRunner.finish_season(s)

	var drafted_to: Dictionary = {}
	for team_id in s["world"]["rosters"]:
		for p in s["world"]["rosters"][team_id]:
			for e in p.get("career_events", []):
				if String(e.get("type", "")) == "drafted":
					drafted_to[String(p.get("id", ""))] = String(e["to_team_id"])

	var checked: int = 0
	for row in DraftLog.of(s, 2030)["picks"]:
		var id: String = String(row["id"])
		if not drafted_to.has(id):
			continue
		checked += 1
		assert_str(String(drafted_to[id])).override_failure_message(
			"보드는 %s 가 %s 에 갔다는데 지명 사건은 %s 다"
			% [id, row["team_id"], drafted_to[id]]).is_equal(String(row["team_id"]))
	assert_int(checked).override_failure_message(
		"대조한 지명이 하나도 없다 — 검사가 아무것도 안 본다").is_greater(0)
