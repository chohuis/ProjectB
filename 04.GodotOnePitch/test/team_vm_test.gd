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


# ── 감독·코치 (G-3c) ──────────────────────────────────────────

func _staffed_world() -> Dictionary:
	return {"rosters": {"T1": []}, "staff": {"T1": [
		{"id": "C1", "role": "coach", "name": "박코치",
			"specialty": "투수", "team_id": "T1"},
		{"id": "M1", "role": "manager", "name": "김감독",
			"style": "육성형", "team_id": "T1"},
		{"id": "O1", "role": "owner", "name": "최구단주",
			"style": "공격적", "team_id": "T1"},
	]}}


## 🔴 **04는 팀 화면에서 스태프를 안 읽었다.** `Staff.of`가 있고
## `people_vm`이 인물 탭에 쓰는데 **팀 탭에서는 아무도 안 봤다**(형태 ③) —
## "우리 팀 감독이 누구인가"를 팀 화면에서 알 수 없었다
func test_감독과_코치가_팀_화면에_나온다() -> void:
	var vm: Dictionary = TeamVm.build({
		"world": _staffed_world(),
		"protagonist": {"team_id": "T1", "id": "ME"}})
	var staff: Array = vm["staff"]
	assert_int(staff.size()).override_failure_message(
		"감독·코치가 안 나온다").is_equal(2)


## ⚠ **감독이 먼저다** — 02도 감독·코치 차례다
func test_감독이_먼저_온다() -> void:
	var vm: Dictionary = TeamVm.build({
		"world": _staffed_world(),
		"protagonist": {"team_id": "T1", "id": "ME"}})
	assert_str(String(vm["staff"][0]["label"])).is_equal("감독")
	assert_str(String(vm["staff"][0]["name"])).is_equal("김감독")
	assert_str(String(vm["staff"][1]["label"])).is_equal("코치")


## ⚠ **구단주는 뺀다** — 02 `TeamPage`도 감독·코치만 싣는다.
## 구단주는 재정 화면이 맡는다
func test_구단주는_안_나온다() -> void:
	var vm: Dictionary = TeamVm.build({
		"world": _staffed_world(),
		"protagonist": {"team_id": "T1", "id": "ME"}})
	for st in vm["staff"]:
		assert_str(String(st["name"])).is_not_equal("최구단주")


## ⚠ **코치는 전문 분야를 적는다** — 없으면 코치 셋이 같은 줄이 된다.
## 감독은 성향을 적는다
func test_코치는_분야를_감독은_성향을_적는다() -> void:
	var vm: Dictionary = TeamVm.build({
		"world": _staffed_world(),
		"protagonist": {"team_id": "T1", "id": "ME"}})
	assert_str(String(vm["staff"][0]["detail"])).override_failure_message(
		"감독 성향이 없다").is_equal("육성형")
	assert_str(String(vm["staff"][1]["detail"])).override_failure_message(
		"코치 전문 분야가 없다 — 코치 셋이 같은 줄이 된다").is_equal("투수")


## 스태프가 없는 팀도 있다 — 고교는 감독만이거나 아예 없다
func test_스태프가_없어도_안_터진다() -> void:
	var vm: Dictionary = TeamVm.build({
		"world": {"rosters": {"T1": []}},
		"protagonist": {"team_id": "T1", "id": "ME"}})
	assert_array(vm["staff"]).is_empty()
