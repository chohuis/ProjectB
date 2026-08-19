extends GdUnitTestSuite

## 시즌 결산 화면 — M7-7.
##
## 원본: `features/season-end/ui/SeasonEndModal.svelte` (1,195줄)
##
## ⚠ **1,195줄이 된 이유가 화면이 계산을 가져서다.** 여기는 사전을 찍기만
## 하고, 마지막 검사가 소스에서 계산을 막는다.

const SCREEN := preload("res://ui/screens/season_end_screen.tscn")


func _texts(node: Node, out: PackedStringArray = PackedStringArray()) -> PackedStringArray:
	if node is Label:
		out.append((node as Label).text)
	elif node is Button:
		out.append((node as Button).text)
	for c in node.get_children():
		_texts(c, out)
	return out


func _digest(over: Dictionary = {}) -> Dictionary:
	var d: Dictionary = {
		"year": 2027,
		"summary": {"graduated": 1420, "drafted": 110, "retired": 0,
			"freshmen": 1420, "placed": 400, "gave_up": 900,
			"demoted": 110, "released": 110},
		"league_id": "LEAGUE_HIGHSCHOOL",
		"team_id": "TEAM_A", "team_name": "애월고",
		"my_record": {"year": 2027, "stat_line": "7승 2패 ERA 2.31 88.0이닝 91K",
			"ovr": 63, "game_log": [
				{"day": 69, "opponent_id": "TEAM_B", "my_score": 5, "opp_score": 2,
					"ip": 6.0, "er": 2.0, "h": 5.0, "k": 7.0, "bb": 1.0, "pc": 95},
				{"day": 78, "opponent_id": "TEAM_C", "my_score": 1, "opp_score": 4,
					"ip": 5.0, "er": 4.0, "h": 8.0, "k": 3.0, "bb": 3.0, "pc": 88},
			]},
		"my_awards": ["MVP"],
		"awards": {"awards": [
			{"label": "다승", "player_id": "P1", "value_text": "18"},
			{"label": "방어율", "player_id": "P2", "value_text": "1.87"},
		], "mvp": ["P1"]},
		"standings": {"rows": [
			{"team_id": "TEAM_X", "team_name": "유성고", "wins": 15, "losses": 5,
				"draws": 0, "pct_label": ".750"},
			{"team_id": "TEAM_A", "team_name": "애월고", "wins": 12, "losses": 8,
				"draws": 0, "pct_label": ".600"},
		]},
	}
	d.merge(over, true)
	return d


func _mount(digest: Dictionary) -> SeasonEndScreen:
	var s: SeasonEndScreen = SCREEN.instantiate()
	s.set_view_model(SeasonEndVm.build(digest))
	add_child(s)
	await await_idle_frame()
	return s


# ── 뜨는가 ────────────────────────────────────────────────────

func test_it_shows_the_year() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_array(_texts(s)).contains(["2027년 시즌 결산"])


## 02와 같은 탭 셋 — 시즌 · 팀 · 개인
func test_it_has_three_tabs() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_array(_texts(s.get_node("Pad/Center/Col/Tabs"))) \
		.is_equal(["시즌", "팀", "개인"])


func test_it_opens_on_the_season_tab() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_str(s.current_tab_id()).is_equal("season")


# ── 시즌 탭 ───────────────────────────────────────────────────

func test_the_season_tab_shows_what_happened() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["졸업", "1420명"])
	assert_array(t).contains(["지명", "110명"])


## ⚠ **0인 항목은 안 보여준다.** "은퇴 0명"이 줄줄이 뜨면 정작 일어난 일이
## 안 보인다
func test_zero_rows_are_hidden() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	assert_array(_texts(s)).not_contains(["0명"])


func test_the_season_tab_shows_awards() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["다승"])
	assert_array(t).contains(["MVP"])


# ── 팀 탭 ─────────────────────────────────────────────────────

func test_the_team_tab_shows_the_rank() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	s._on_tab(1)
	await await_idle_frame()

	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["애월고"])
	# 2팀 중 2위
	assert_array(t).contains(["2위 / 2팀"])
	assert_array(t).contains(["12승 0무 8패"])


## ⚠ **순위가 0이면 "미정"이다.** 0위로 찍으면 꼴찌보다 나쁜 등수가 뜬다
func test_an_unranked_team_says_so() -> void:
	var d: Dictionary = _digest()
	d["team_id"] = "TEAM_MISSING"
	var s: SeasonEndScreen = await _mount(d)
	s._on_tab(1)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["순위 없음"])


# ── 개인 탭 ───────────────────────────────────────────────────

func test_the_personal_tab_shows_my_line() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	s._on_tab(2)
	await await_idle_frame()

	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["7승 2패 ERA 2.31 88.0이닝 91K"])
	assert_array(t).contains(["MVP"])


## 등판 기록이 한 줄씩 뜬다 — 결산에서 제일 먼저 보는 것이다
func test_the_personal_tab_lists_my_starts() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	s._on_tab(2)
	await await_idle_frame()

	var t: PackedStringArray = _texts(s)
	assert_array(t).contains(["69일차 TEAM_B 5 : 2"])
	assert_array(t).contains(["6.0이닝 7K 1BB 2자책 95구"])


## ⚠ **이닝은 소수가 아니라 아웃 수다.** 20아웃은 6.67이 아니라 6.2이고,
## 엔진도 그 표기로 저장한다 — 화면이 다시 계산하면 6.7로 뜬다
func test_innings_use_baseball_notation() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["game_log"] = [{"day": 1, "opponent_id": "T", "my_score": 1,
		"opp_score": 0, "ip": 6.2, "er": 0.0, "h": 3.0, "k": 5.0, "bb": 1.0,
		"pc": 90}]
	var s: SeasonEndScreen = await _mount(d)
	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["6.2이닝 5K 1BB 0자책 90구"])


# ── 터지지 않기 ───────────────────────────────────────────────

func test_an_empty_digest_does_not_break() -> void:
	var s: SeasonEndScreen = await _mount({})
	assert_array(_texts(s)).contains(["결산할 시즌이 없습니다"])


func test_no_starts_says_so() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["game_log"] = []
	var s: SeasonEndScreen = await _mount(d)
	s._on_tab(2)
	await await_idle_frame()
	assert_array(_texts(s)).contains(["등판이 없습니다"])


func test_the_done_button_emits() -> void:
	var s: SeasonEndScreen = await _mount(_digest())
	var got: Array = []
	s.done_requested.connect(func() -> void: got.append(true))
	(s.get_node("Pad/Center/Col/Row/Done") as Button).pressed.emit()
	await await_idle_frame()
	assert_array(got).is_equal([true])


func test_the_screen_holds_no_logic() -> void:
	var src := FileAccess.get_file_as_string("res://ui/screens/season_end_screen.gd")
	assert_str(src).not_contains("sort_custom")
	assert_str(src).not_contains(".filter(")
	# 탭 목록도 화면이 안 갖는다
	assert_str(src).not_contains("\"season\", \"team\", \"personal\"")


# ── 포스트시즌 (G-1a) ─────────────────────────────────────────

## 🔴 **`digest`에 `ps_result`가 있는데 아무도 안 읽고 있었다**(형태 ③).
## `season_history.gd:173`이 `Postseason.result_for`로 채우는데
## `SeasonEndVm`이 `stat_line`·`ovr`·`game_log`만 꺼냈다 —
## 02는 `<h4>포스트시즌</h4>` 절로 보여준다(`SeasonEndModal.svelte:374`)
func test_the_postseason_result_shows_up() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["ps_result"] = "champion"
	var vm: Dictionary = SeasonEndVm.build(d)
	var first: Dictionary = vm["summary_rows"][0]
	assert_str(String(first["label"])).override_failure_message(
		"포스트시즌이 요약 맨 앞에 없다 — 졸업·지명 밑에 깔리면 안 읽힌다") \
		.is_equal("포스트시즌")
	assert_str(String(first["value"])).is_equal("우승")


## ⚠ **우승만 제목이 바뀐다** — 02 `SeasonEndModal:351`이 그렇다
func test_only_a_title_wins_the_trophy() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["ps_result"] = "champion"
	assert_str(String(SeasonEndVm.build(d)["title"])).contains("🏆")

	d["my_record"]["ps_result"] = "runner_up"
	var vm: Dictionary = SeasonEndVm.build(d)
	assert_str(String(vm["title"])).override_failure_message(
		"준우승인데 트로피가 뜬다 — 우승이 안 도드라진다").not_contains("🏆")
	assert_str(String(vm["summary_rows"][0]["value"])).is_equal("준우승")


## 4강도 남긴다 — 02가 `semiFinal`을 따로 가른다
func test_a_semi_final_run_is_kept() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["ps_result"] = "semi_final"
	assert_str(String(SeasonEndVm.build(d)["summary_rows"][0]["value"])) \
		.is_equal("4강")


## **못 갔으면 줄을 안 만든다** — "포스트시즌 미진출"이 해마다 뜨면
## 정작 일어난 일이 안 보인다(04의 다른 요약 행과 같은 규칙이다)
func test_missing_the_postseason_writes_no_row() -> void:
	var d: Dictionary = _digest()
	d["my_record"]["ps_result"] = "not_qualified"
	for row in SeasonEndVm.build(d)["summary_rows"]:
		assert_str(String(row["label"])).is_not_equal("포스트시즌")


# ── 대회 (G-1b) ───────────────────────────────────────────────

## 🔴 **`tournament_log`가 쌓이는데 결산이 안 읽었다** (형태 ③).
## 리그 탭은 읽는다(`league_vm.gd:220`) — 거기는 **지난 대회 전부**고
## 결산은 **그 해**다. 02는 `<h4>대회</h4>` 절이다
func test_this_years_tournament_shows_up() -> void:
	var d: Dictionary = _digest()
	d["tournaments"] = [{"name": "황금사자기", "champion": "유성고",
		"reached": "4강"}]
	var rows: Array = SeasonEndVm.build(d)["tournament_rows"]
	assert_int(rows.size()).override_failure_message(
		"그 해 대회가 결산에 안 뜬다").is_equal(1)
	assert_str(String(rows[0]["label"])).is_equal("황금사자기")
	assert_str(String(rows[0]["value"])).override_failure_message(
		"내가 어디까지 갔는지가 앞에 안 온다 — 우승 팀만 적으면 남의 기록이다") \
		.starts_with("4강")
	assert_str(String(rows[0]["value"])).contains("유성고")


## **못 나간 대회는 안 적는다** — 나가지도 않은 대회가 줄줄이 뜨면
## 정작 나간 대회가 안 보인다
func test_a_tournament_i_missed_is_not_listed() -> void:
	var d: Dictionary = _digest()
	d["tournaments"] = [{"name": "황금사자기", "champion": "유성고",
		"reached": ""}]
	assert_array(SeasonEndVm.build(d)["tournament_rows"]).is_empty()


## 대회가 아예 없어도 키는 있어야 한다 — 화면이 없는 키를 읽으면 빈 화면이다
func test_the_key_exists_even_with_no_tournament() -> void:
	assert_bool(SeasonEndVm.build(_digest()).has("tournament_rows")).is_true()
	assert_bool(SeasonEndVm.build({}).has("tournament_rows")).is_true()


# ── 팀 내 베스트 (G-1c) ───────────────────────────────────────

## 02 `SeasonEndModal:518`의 두 카드. **자격선이 있다** —
## 투수 IP 10 · 타자 타수 20(02 `:192`·`:203`). 한 경기 나와 ERA 0.00인
## 사람이 1등이 되면 "최우수"가 뜻을 잃는다
func test_the_team_best_shows_both_cards() -> void:
	var d: Dictionary = _digest()
	d["team_best"] = {
		"pitcher": {"name": "김투수", "era": 2.31, "w": 12, "ip": 150.0},
		"batter": {"name": "박타자", "avg": 0.325, "hr": 18, "rbi": 77},
	}
	var rows: Array = SeasonEndVm.build(d)["team_best"]
	assert_int(rows.size()).is_equal(2)
	assert_str(String(rows[0]["label"])).is_equal("최우수 투수")
	assert_str(String(rows[0]["value"])).override_failure_message(
		"이름이 값 안에 없다 — 화면이 라벨과 이름을 조립하면 그게 계산이다") \
		.contains("김투수")
	assert_str(String(rows[0]["value"])).contains("2.31")
	assert_str(String(rows[1]["value"])).contains("박타자")
	# ⚠ **`.contains(".325")`만으로는 못 잡는다** — "0.325"도 그걸 품는다.
	# 앞의 0이 없다는 걸 직접 본다
	assert_str(String(rows[1]["value"])).override_failure_message(
		"타율에서 앞의 0을 안 뗐다 — 야구 표기는 .325다").not_contains("0.325")
	assert_str(String(rows[1]["value"])).contains(".325")


## **한쪽만 있어도 그쪽만 낸다** — 02도 `{#if}`로 각각 감싼다
func test_only_one_side_still_shows() -> void:
	var d: Dictionary = _digest()
	d["team_best"] = {"pitcher": {"name": "김투수", "era": 2.31,
		"w": 12, "ip": 150.0}, "batter": {}}
	var rows: Array = SeasonEndVm.build(d)["team_best"]
	assert_int(rows.size()).is_equal(1)
	assert_str(String(rows[0]["label"])).is_equal("최우수 투수")


## 아무도 자격선을 못 넘은 해 — 고교 첫 해엔 실제로 있다
func test_nobody_qualified_means_no_rows() -> void:
	var d: Dictionary = _digest()
	d["team_best"] = {"pitcher": {}, "batter": {}}
	assert_array(SeasonEndVm.build(d)["team_best"]).is_empty()
	assert_bool(SeasonEndVm.build({}).has("team_best")).is_true()


# ── 팀 경기 기록 (G-1d) ───────────────────────────────────────

## 🔴 **`game_log`는 내가 던진 경기만이다.** 불펜으로 한 해 열 번 나온
## 선수는 팀이 144경기를 어떻게 치렀는지 결산에서 볼 수 없었다 —
## 02는 팀 일정 전부를 따로 싣는다(`SeasonEndModal:170`·`:549`)
func test_the_team_schedule_shows_up() -> void:
	var d: Dictionary = _digest()
	d["team_games"] = [
		{"week": 3, "is_home": true, "opponent": "유성고",
			"my_score": 5, "opp_score": 2},
		{"week": 4, "is_home": false, "opponent": "백제고",
			"my_score": 1, "opp_score": 4},
		{"week": 5, "is_home": true, "opponent": "한밭고",
			"my_score": 3, "opp_score": 3},
	]
	var vm: Dictionary = SeasonEndVm.build(d)
	var rows: Array = vm["team_games"]
	assert_int(rows.size()).is_equal(3)
	assert_str(String(vm["team_games_label"])).override_failure_message(
		"경기 수를 안 적었다 — 02는 제목 옆에 N경기를 단다").is_equal("3경기")

	# 주차 · 홈/원정 — 02의 앞 두 칸
	assert_str(String(rows[0]["label"])).is_equal("W3 홈")
	assert_str(String(rows[1]["label"])).is_equal("W4 원정")
	# 상대 · 점수 · 승무패 — 뒤 세 칸
	assert_str(String(rows[0]["value"])).contains("유성고")
	assert_str(String(rows[0]["value"])).contains("5–2")
	assert_str(String(rows[0]["value"])).ends_with("승")
	assert_str(String(rows[1]["value"])).ends_with("패")
	assert_str(String(rows[2]["value"])).override_failure_message(
		"동점을 무승부로 안 봤다").ends_with("무")


## 이긴 경기를 눈에 띄게 — 등판 목록과 같은 규칙이다
func test_a_win_is_marked() -> void:
	var d: Dictionary = _digest()
	d["team_games"] = [
		{"week": 3, "is_home": true, "opponent": "유성고",
			"my_score": 5, "opp_score": 2},
		{"week": 4, "is_home": true, "opponent": "유성고",
			"my_score": 2, "opp_score": 5},
	]
	var rows: Array = SeasonEndVm.build(d)["team_games"]
	assert_bool(bool(rows[0]["won"])).is_true()
	assert_bool(bool(rows[1]["won"])).is_false()


## 경기가 없으면 절이 안 뜬다 — 키는 있어야 한다
func test_no_games_no_rows() -> void:
	assert_array(SeasonEndVm.build(_digest())["team_games"]).is_empty()
	assert_bool(SeasonEndVm.build({}).has("team_games")).is_true()
