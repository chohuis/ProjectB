extends GdUnitTestSuite

## 선수 상세 — F-4. **선수를 눌러도 아무 일이 없었다.**
##
## ⚠ 04는 로스터에 서른 줄이 뜨는데 한 줄이 주는 게 포지션·이름·나이·OVR
## 넷이다. **누가 어떤 선수인지를 알 방법이 없었다** — 트레이드도 드래프트도
## "이름과 숫자 하나"로 판단해야 했다.
##
## 원본: `features/player/ui/PlayerDetailModal.svelte` (1,602줄)


func _pitcher(id: String, over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": id, "name": "장훈욱", "position": "SP", "age": 24, "grade": 0,
		"league_id": "LEAGUE_KBL", "team_id": "TEAM_A",
		"salary": 12000, "contract_years": 2,
		"pitching": {"ovr": 66.0, "velocity": 70.0, "command": 62.0,
			"control": 64.0, "movement": 58.0, "stamina": 61.0,
			"mentality": 55.0, "recovery": 57.0, "clutch": 59.0,
			"hold_runners": 52.0},
	}
	p.merge(over, true)
	return p


func _batter(id: String, over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"id": id, "name": "송태준", "position": "CF", "age": 22,
		"league_id": "LEAGUE_KBL", "team_id": "TEAM_A",
		"batting": {"ovr": 71.0, "contact": 68.0, "power": 74.0, "eye": 55.0,
			"discipline": 51.0, "batting_clutch": 63.0, "platoon": 50.0,
			"speed": 66.0, "base_instinct": 58.0, "bunting": 44.0,
			"fielding": 61.0, "arm": 57.0},
	}
	p.merge(over, true)
	return p


func _state(roster: Array, over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"season_year": 2030, "day": 10,
		"protagonist": {"id": "ME", "name": "김한결", "team_id": "TEAM_A"},
		"world": {"rosters": {"TEAM_A": roster}},
	}
	s.merge(over, true)
	return s


# ── 누구인가 ──────────────────────────────────────────────────

func test_it_finds_the_player_in_the_roster() -> void:
	var vm: Dictionary = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")
	assert_str(String(vm["name"])).is_equal("장훈욱")
	assert_str(String(vm["position"])).is_equal("SP")
	assert_int(int(vm["age"])).is_equal(24)


func test_an_unknown_player_gives_nothing() -> void:
	assert_bool(PlayerDetailVm.build(_state([_pitcher("P1")]), "NOPE").is_empty()).is_true()
	assert_bool(PlayerDetailVm.build(_state([_pitcher("P1")]), "").is_empty()).is_true()


## ⚠ **투수는 투구 OVR, 야수는 타격 OVR.** 안 가르면 투수가 타격 20으로
## 떠서 갑자기 약해 보인다 — `team_vm.gd:30-31`이 같은 이유로 가른다
func test_the_ovr_follows_the_player_type() -> void:
	assert_int(int(PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["ovr"])).is_equal(66)
	assert_int(int(PlayerDetailVm.build(_state([_batter("B1")]), "B1")["ovr"])).is_equal(71)


## ⚠ **주인공은 "나" 탭이 정본이다.** 두 화면이 같은 사람을 다르게 그리면
## 어느 쪽이 맞는지 알 수 없다
func test_it_knows_the_protagonist() -> void:
	var roster: Array = [_pitcher("ME"), _pitcher("P2")]
	assert_bool(PlayerDetailVm.build(_state(roster), "ME")["is_me"]).is_true()
	assert_bool(PlayerDetailVm.build(_state(roster), "P2")["is_me"]).is_false()


# ── 능력치 ────────────────────────────────────────────────────

## ⚠ **키 이름을 지어내면 그 줄이 조용히 빠진다.** 없는 축은 건너뛰므로
## 오류가 안 난다 — `instinct`·`clutch`로 적었다가 실제 키가
## `base_instinct`·`batting_clutch`였다. **검사가 개수를 세야 잡힌다**
func test_every_batting_axis_has_a_label() -> void:
	var vm: Dictionary = PlayerDetailVm.build(_state([_batter("B1")]), "B1")
	var rows: Array = vm["stats"]
	assert_int(rows.size()).override_failure_message(
		"타격 능력치 줄이 %d개다 — 키 이름이 어긋나 조용히 빠졌다" % rows.size()
		).is_equal(PlayerDetailVm.BATTING_LABELS.size())
	var names := PackedStringArray()
	for r in rows:
		names.append(String(r["name"]))
	assert_array(names).contains(["주루센스", "승부처"])


func test_every_pitching_axis_has_a_label() -> void:
	var rows: Array = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["stats"]
	assert_int(rows.size()).is_equal(PlayerDetailVm.PITCHING_LABELS.size())


## ⚠ **표기가 "나" 탭과 같아야 한다.** 여기 다시 적으면 같은 선수의 같은
## 능력치가 두 화면에서 다른 이름으로 뜬다
func test_the_pitching_labels_come_from_the_status_tab() -> void:
	assert_array(PlayerDetailVm.PITCHING_LABELS).is_equal(StatusVm.PITCHING_LABELS)


## ⚠ **투수에게 타격 줄을 붙이지 않는다.** 붙이면 절반이 언제나 20대로
## 떠서 "약하다"로 읽힌다
func test_a_pitcher_gets_no_batting_rows() -> void:
	var rows: Array = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["stats"]
	for r in rows:
		assert_str(String(r["name"])).is_not_equal("파워")


## 없는 축은 줄을 안 만든다 — 0으로 채우면 "번트가 0"으로 읽힌다
func test_a_missing_axis_makes_no_row() -> void:
	var thin: Dictionary = _batter("B1", {"batting": {"ovr": 60.0, "contact": 55.0}})
	var rows: Array = PlayerDetailVm.build(_state([thin]), "B1")["stats"]
	assert_int(rows.size()).is_equal(1)
	assert_str(String(rows[0]["name"])).is_equal("컨택")


# ── 계약 · 병역 · 관계 ────────────────────────────────────────

func test_a_pro_shows_the_contract() -> void:
	var c: Dictionary = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["contract"]
	assert_int(int(c["salary"])).is_equal(12000)
	assert_int(int(c["years_left"])).is_equal(2)


## ⚠ **학교엔 계약이 없다.** 0원 1년으로 뜨면 고교생이 최저 연봉 계약을
## 한 것처럼 보인다
func test_a_school_player_has_no_contract() -> void:
	var hs: Dictionary = _pitcher("P1", {"league_id": "LEAGUE_HIGHSCHOOL"})
	assert_bool((PlayerDetailVm.build(_state([hs]), "P1")["contract"] as Dictionary)
		.is_empty()).is_true()


## ⚠ **병역은 "나" 탭과 같은 자리에서 온다** — 두 벌로 두면 갈린다
func test_the_military_comes_from_the_status_tab() -> void:
	var soldier: Dictionary = _pitcher("P1", {
		"military_status": Military.STATUS_SERVING,
		"military_unit": "sports", "military_service_weeks": 20,
		"military_enlist_year": 2029})
	var vm: Dictionary = PlayerDetailVm.build(_state([soldier]), "P1")
	assert_dict(vm["military"]).is_equal(StatusVm.military_of(soldier))
	assert_bool(vm["military"]["serving"]).is_true()


## 복무 안 한 선수는 병역 절이 없다
func test_an_unserved_player_has_no_military() -> void:
	assert_bool((PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["military"]
		as Dictionary).is_empty()).is_true()


## ⚠ **관계가 없으면 빈 사전이다.** 0으로 두면 "사이가 나쁘다"로 읽힌다
func test_no_relationship_is_not_a_bad_one() -> void:
	assert_bool((PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["relation"]
		as Dictionary).is_empty()).is_true()


func test_it_shows_the_relationship_when_there_is_one() -> void:
	var s: Dictionary = _state([_pitcher("P1")], {"relationships": [
		{"person_id": "P1", "kind": "teammate", "value": 62}]})
	var rel: Dictionary = PlayerDetailVm.build(s, "P1")["relation"]
	assert_int(int(rel["value"])).is_equal(62)
	assert_str(String(rel["label"])).is_equal(Relationship.label_of(62))


## ⚠ **소식·인물 탭과 같은 이름표를 쓴다.** 리그 id가 그대로 뜨면
## `LEAGUE_KBL`이 화면에 샌다
func test_the_league_gets_a_label() -> void:
	var vm: Dictionary = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")
	assert_str(String(vm["league_label"])).is_equal("KBL")


# ── 시즌 성적 ─────────────────────────────────────────────────

## ⚠ **기록이 없으면 빈 목록이다.** 0으로 채우면 안 뛴 선수가 0.00
## 방어율로 뜬다 — 02가 그랬고 신인이 리그 1위처럼 보였다
func test_a_player_with_no_record_shows_no_stats() -> void:
	assert_array(PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")["season"]).is_empty()


func test_it_shows_the_season_record() -> void:
	var s: Dictionary = _state([_pitcher("P1")], {"season_stats": {
		"P1": {"g": 12, "ip": 70.1, "era": 3.12, "k": 61, "bb": 18, "w": 5, "l": 3}}})
	assert_array(PlayerDetailVm.build(s, "P1")["season"]).is_equal(
		StatusVm.season_stats_of(s, "P1"))


# ── 화면에 실제로 뜨는가 ──────────────────────────────────────
#
# ⚠ **사전만 맞고 화면이 안 그리면 없는 것과 같다.** 이번 세션에서 그
# 종류로 결함 다섯을 찾았다


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _mount(vm: Dictionary) -> PlayerDetailScreen:
	var s: PlayerDetailScreen = preload(
		"res://ui/screens/player_detail_screen.tscn").instantiate()
	s.set_view_model(vm)
	add_child(s)
	await await_idle_frame()
	return s


func test_the_screen_shows_the_player() -> void:
	var vm: Dictionary = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")
	var joined: String = " ".join(_texts(await _mount(vm)))
	assert_str(joined).contains("장훈욱")
	assert_str(joined).contains("OVR 66")
	assert_str(joined).contains("구위")
	assert_str(joined).contains("투구 능력치")


## ⚠ **금액 표기는 `FinanceVm.won`이 정본이다** — 재정 화면과 같은 연봉이
## 다른 모양으로 뜨면 안 된다(1억 vs 10,000만원)
func test_the_salary_uses_the_shared_format() -> void:
	var vm: Dictionary = PlayerDetailVm.build(_state([_pitcher("P1")]), "P1")
	assert_str(" ".join(_texts(await _mount(vm)))).contains(FinanceVm.won(12000))


## 학교 선수에겐 계약 카드가 없다 — 0원으로 뜨면 최저 연봉처럼 보인다
func test_the_screen_omits_an_empty_contract() -> void:
	var hs: Dictionary = _pitcher("P1", {"league_id": "LEAGUE_HIGHSCHOOL"})
	var vm: Dictionary = PlayerDetailVm.build(_state([hs]), "P1")
	assert_array(_texts(await _mount(vm))).not_contains(["계약"])


## 못 찾은 선수로도 안 깨진다
func test_the_screen_survives_an_empty_view_model() -> void:
	assert_str(" ".join(_texts(await _mount({})))).contains("찾을 수 없습니다")


# ── 눌러서 열리는가 ───────────────────────────────────────────

const ROOT := preload("res://ui/app_root.tscn")


func _root_state() -> Dictionary:
	var s: Dictionary = World.new_game({"seed": 5150, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	return s


func _mount_root(s: Dictionary) -> AppRoot:
	var r: AppRoot = ROOT.instantiate()
	r.set_state(s)
	add_child(r)
	await await_idle_frame()
	return r


## ⚠ **로스터 줄이 눌려야 한다.** 예전엔 `HBoxContainer`라 아무것도 안
## 눌렸다 — 화면은 그려지는데 입구가 없었다
func test_pressing_a_roster_row_opens_the_detail() -> void:
	var r: AppRoot = await _mount_root(_root_state())
	r.screen().show_tab("team")
	await await_idle_frame()

	var row: PlayerRow = _first_row(r.screen())
	assert_object(row).override_failure_message(
		"로스터에 누를 수 있는 줄이 하나도 없다").is_not_null()
	row.pressed.emit()
	await await_idle_frame()
	assert_object(r.player_detail_screen()).override_failure_message(
		"로스터 줄을 눌렀는데 상세가 안 열렸다").is_not_null()


## 닫으면 진행 화면으로 돌아온다 — 못 빠져나오면 게임이 멈춘 것처럼 보인다
func test_closing_the_detail_returns_to_the_main_screen() -> void:
	var r: AppRoot = await _mount_root(_root_state())
	r.screen().show_tab("team")
	await await_idle_frame()
	_first_row(r.screen()).pressed.emit()
	await await_idle_frame()

	r.player_detail_screen().closed.emit()
	await await_idle_frame()
	assert_object(r.player_detail_screen()).is_null()
	assert_bool(r.screen().visible).override_failure_message(
		"상세를 닫았는데 진행 화면이 안 돌아왔다").is_true()


## ⚠ **주인공은 "나" 탭이 정본이다.** 상세를 따로 띄우면 같은 사람이 두
## 화면에서 다르게 그려진다
func test_pressing_myself_goes_to_the_status_tab() -> void:
	var r: AppRoot = await _mount_root(_root_state())
	r.screen().show_tab("team")
	await await_idle_frame()

	var me: String = String(r.state()["protagonist"]["id"])
	var mine: PlayerRow = _row_of(r.screen(), me)
	assert_object(mine).override_failure_message(
		"로스터에서 주인공 줄을 못 찾는다").is_not_null()
	mine.pressed.emit()
	await await_idle_frame()
	assert_object(r.player_detail_screen()).override_failure_message(
		"주인공인데 상세가 떴다 — \"나\" 탭이 정본이다").is_null()
	assert_str(r.screen().current_tab_id()).is_equal("me")


func _rows(node: Node, out: Array = []) -> Array:
	if node is PlayerRow:
		out.append(node)
	for c in node.get_children():
		_rows(c, out)
	return out


func _first_row(node: Node) -> PlayerRow:
	var all: Array = _rows(node)
	return null if all.is_empty() else all[0]


func _row_of(node: Node, player_id: String) -> PlayerRow:
	for row in _rows(node):
		if String((row as PlayerRow)._row.get("id", "")) == player_id:
			return row
	return null


## ⚠ **선수를 바꾸면 앞 선수가 사라져야 한다.** 안 치우면 두 선수의 카드가
## 겹쳐 쌓인다 — 로스터에서 여러 명을 이어 보는 건 흔한 일이고, 그때
## 투수 카드 밑에 야수 카드가 붙는다
func test_showing_another_player_replaces_the_cards() -> void:
	var s: Dictionary = _state([_pitcher("P1"), _batter("B1")])
	var screen: PlayerDetailScreen = await _mount(PlayerDetailVm.build(s, "P1"))
	screen.set_view_model(PlayerDetailVm.build(s, "B1"))
	# `queue_free`는 프레임 뒤에 지워진다 — 한 프레임으로는 옛 카드가 남는다
	await await_idle_frame()
	await await_idle_frame()

	var joined: String = " ".join(_texts(screen))
	assert_str(joined).contains("송태준")
	assert_str(joined).override_failure_message(
		"앞 선수의 카드가 남았다 — 두 선수가 겹쳐 뜬다").not_contains("투구 능력치")


## ⚠ **NPC 사전엔 `team_name`이 없다.** 주인공만 들고 있어서, 그대로
## `team_id`로 떨어지면 화면에 `TEAM_HS_AEWOL`이 뜬다 — **캡처에서 실제로
## 그렇게 찍혔다.** 가짜 사전에 `team_name`을 넣어 두면 검사가 못 본다
func test_the_team_name_is_not_a_raw_id() -> void:
	var s: Dictionary = World.new_game({"seed": 5150, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var me: String = String(s["protagonist"]["id"])
	var other: String = ""
	for x in World.roster_of(s.get("world", {}), "TEAM_HS_AEWOL"):
		if String(x.get("id", "")) != me:
			other = String(x.get("id", ""))
			break
	assert_str(other).is_not_empty()

	var vm: Dictionary = PlayerDetailVm.build(s, other)
	assert_str(String(vm["team_name"])).override_failure_message(
		"팀 이름이 원문 id로 샌다: %s" % vm["team_name"]).is_not_equal("TEAM_HS_AEWOL")
	assert_str(String(vm["team_name"])).is_equal(
		String(World.team_field({}, "TEAM_HS_AEWOL", "name", "")))
