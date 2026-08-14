extends GdUnitTestSuite

## 팀 탭 ViewModel — M7-6b.
##
## 원본: `pages/team/TeamPage.svelte`
##
## ⚠ **로스터를 화면이 정렬하지 않는다.** 02 결함의 뿌리가 화면이 자기
## 목록을 만들던 것이다.


func _p(id: String, pos: String, pit: float, bat: float,
		over: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"id": id, "name": "선수%s" % id, "position": pos,
		"player_type": "pitcher" if PlayerGen.is_pitcher(pos) else "batter",
		"age": 20, "potential": 80.0, "development_rate": 60.0,
		"pitching": {"ovr": pit}, "batting": {"ovr": bat},
	}
	d.merge(over, true)
	return d


func _state(roster: Array, over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"protagonist": {"id": "ME", "team_id": "T1", "team_name": "제주"},
		"world": {"rosters": {"T1": roster}},
	}
	s.merge(over, true)
	return s


func _rows(s: Dictionary) -> Array:
	return TeamVm.build(s)["rows"]


# ── 무엇이 보이나 ─────────────────────────────────────────────

func test_it_lists_my_team() -> void:
	var rows: Array = _rows(_state([_p("A", "SP", 70.0, 30.0), _p("B", "1B", 20.0, 65.0)]))
	assert_int(rows.size()).is_equal(2)


func test_a_row_carries_what_the_screen_shows() -> void:
	var r: Dictionary = _rows(_state([_p("A", "SP", 70.0, 30.0)]))[0]
	assert_str(r["name"]).is_equal("선수A")
	assert_str(r["position"]).is_equal("SP")
	assert_int(r["age"]).is_equal(20)
	# ⚠ **투수는 투구 OVR, 야수는 타격 OVR을 보여준다** — 안 가르면
	# 투수가 타격 20으로 뜨고 팀이 전부 약해 보인다
	assert_float(r["ovr"]).is_equal(70.0)


func test_a_batter_shows_its_batting_ovr() -> void:
	var r: Dictionary = _rows(_state([_p("B", "1B", 20.0, 65.0)]))[0]
	assert_float(r["ovr"]).is_equal(65.0)


func test_the_team_name_comes_along() -> void:
	assert_str(TeamVm.build(_state([]))["team_name"]).is_equal("제주")


# ── 순서 ──────────────────────────────────────────────────────

## ⚠ **투수 먼저, 그 안에서 능력치 순이다.** 안 정렬하면 생성 순서로 뜨고
## 그건 아무 뜻이 없다
func test_pitchers_come_first() -> void:
	var rows: Array = _rows(_state([
		_p("B1", "1B", 20.0, 65.0), _p("P1", "SP", 70.0, 30.0),
		_p("B2", "SS", 20.0, 60.0), _p("P2", "RP", 68.0, 30.0)]))
	assert_bool(PlayerGen.is_pitcher(rows[0]["position"])).is_true()
	assert_bool(PlayerGen.is_pitcher(rows[1]["position"])).is_true()
	assert_bool(PlayerGen.is_pitcher(rows[2]["position"])).is_false()


func test_rows_are_sorted_by_ovr_within_their_group() -> void:
	var rows: Array = _rows(_state([
		_p("P1", "SP", 60.0, 30.0), _p("P2", "SP", 75.0, 30.0),
		_p("B1", "1B", 20.0, 50.0), _p("B2", "1B", 20.0, 70.0)]))
	assert_str(rows[0]["id"]).is_equal("P2")
	assert_str(rows[1]["id"]).is_equal("P1")
	assert_str(rows[2]["id"]).is_equal("B2")
	assert_str(rows[3]["id"]).is_equal("B1")


# ── 나 ────────────────────────────────────────────────────────

## ⚠ **내가 어디 있는지 보여야 한다.** 30명이면 못 찾는다
func test_i_am_marked() -> void:
	var rows: Array = _rows(_state([
		_p("A", "SP", 70.0, 30.0), _p("ME", "SP", 60.0, 30.0)]))
	var mine: int = 0
	for r in rows:
		if r["is_me"]:
			mine += 1
			assert_str(r["id"]).is_equal("ME")
	assert_int(mine).is_equal(1)


# ── 요약 ──────────────────────────────────────────────────────

## ⚠ **투수·야수 수를 센다.** 02에서 포수 0명·투수 미달이 반복해서 나왔고
## 화면에 안 보이면 아무도 모른다
func test_the_summary_counts_pitchers_and_batters() -> void:
	var vm: Dictionary = TeamVm.build(_state([
		_p("P1", "SP", 70.0, 30.0), _p("P2", "RP", 65.0, 30.0),
		_p("B1", "1B", 20.0, 60.0)]))
	assert_int(vm["pitchers"]).is_equal(2)
	assert_int(vm["batters"]).is_equal(1)
	assert_str(vm["summary"]).contains("투수 2")
	assert_str(vm["summary"]).contains("야수 1")


func test_the_summary_shows_the_total() -> void:
	var vm: Dictionary = TeamVm.build(_state([
		_p("P1", "SP", 70.0, 30.0), _p("B1", "1B", 20.0, 60.0)]))
	assert_str(vm["summary"]).contains("2명")


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_roster_does_not_break() -> void:
	var vm: Dictionary = TeamVm.build(_state([]))
	assert_array(vm["rows"]).is_empty()
	assert_int(vm["pitchers"]).is_equal(0)


func test_an_empty_state_does_not_break() -> void:
	var vm: Dictionary = TeamVm.build({})
	assert_array(vm["rows"]).is_empty()
	assert_bool(vm.has("summary")).is_true()


func test_the_view_model_does_not_know_the_screen() -> void:
	var src := FileAccess.get_file_as_string("res://ui/team_vm.gd")
	assert_str(src).not_contains("Control")
	assert_str(src).not_contains("Label")
