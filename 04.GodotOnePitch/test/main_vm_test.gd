extends GdUnitTestSuite

## 진행 화면 ViewModel — M7-1 · D4.
##
## 원본: `pages/main/MainPage.svelte`의 `TopHeader`·`SidebarNav`
##
## ⚠ **여기가 "화면이 계산을 갖지 않는다"를 지키는 자리다.** 날짜 문자열·
## 다음 경기까지 며칠·탭별 알림 개수를 전부 여기서 만든다. 화면은 사전을
## 받아 글자만 찍는다.
##
## ⚠ **02는 주차만 보여줬다.** `${currentWeek}주차`. 일 단위로 바뀌었으니
## 날짜와 "다음 경기까지"가 필요하다 — 그게 D4다.


func _game(day: int, mine: bool = false) -> Dictionary:
	return {"id": "G%d" % day, "day": day, "is_protagonist_game": mine,
		"home": "TEAM_A", "away": "TEAM_B", "result": null}


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 1, "season_days": 350, "season_year": 2027,
		"protagonist": {"condition": 80.0, "injury": null, "eligibility_blocked": false,
			"retired": false, "team_id": "TEAM_A", "name": "김한결"},
		"schedule": [], "pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


# ── 날짜 (D4) ─────────────────────────────────────────────────

## 시즌 1일차는 3월 1일이다
func test_it_shows_the_calendar_date() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 1, "season_year": 2027}))
	assert_str(vm["date_label"]).is_equal("2027년 3월 1일")


func test_the_date_follows_the_day() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 32, "season_year": 2027}))
	assert_str(vm["date_label"]).is_equal("2027년 4월 1일")


## ⚠ **요일은 실제 달력에서 판다.** "1주차 첫날은 항상 월요일"로 두면
## 주말리그가 해마다 다른 요일에 열린다 — 고교는 주말리그다
func test_it_shows_the_real_weekday() -> void:
	# 2027-03-01은 월요일
	assert_str(MainVm.build(_state({"day": 1, "season_year": 2027}))["weekday_label"]) \
		.is_equal("월")
	assert_str(MainVm.build(_state({"day": 7, "season_year": 2027}))["weekday_label"]) \
		.is_equal("일")
	# ⚠ **해를 바꿔야 주차 파생과 갈린다.** 2027년만 보면 1일차가 우연히
	# 월요일이라 "주차의 첫날 = 월요일"로 계산해도 똑같이 나온다.
	# 2026-03-01은 일요일이고 2028-03-01은 수요일이다
	assert_str(MainVm.build(_state({"day": 1, "season_year": 2026}))["weekday_label"]) \
		.is_equal("일")
	assert_str(MainVm.build(_state({"day": 1, "season_year": 2028}))["weekday_label"]) \
		.is_equal("수")


func test_it_still_shows_the_week() -> void:
	assert_str(MainVm.build(_state({"day": 1}))["week_label"]).is_equal("1주차")
	assert_str(MainVm.build(_state({"day": 8}))["week_label"]).is_equal("2주차")


# ── 다음 경기까지 (D4) ────────────────────────────────────────

func test_it_counts_the_days_to_the_next_game() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(15, true)]}))
	assert_int(vm["next_game_in"]).is_equal(5)
	assert_str(vm["next_game_label"]).is_equal("다음 등판까지 5일")


func test_todays_game_reads_as_today() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(10, true)]}))
	assert_int(vm["next_game_in"]).is_equal(0)
	assert_str(vm["next_game_label"]).is_equal("오늘 등판")


func test_tomorrows_game_reads_as_tomorrow() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(11, true)]}))
	assert_str(vm["next_game_label"]).is_equal("내일 등판")


## ⚠ **NPC 경기는 내 등판이 아니다.** 세면 프로 시즌은 거의 매일 "오늘
## 등판"이라 표시가 아무 뜻이 없어진다
func test_npc_games_are_not_my_start() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "season_days": 350,
		"schedule": [_game(11, false), _game(20, true)]}))
	assert_int(vm["next_game_in"]).is_equal(10)


## ⚠ **지나간 미완 경기는 다음 등판이 아니다.** 진행이 멈춘 사이 넘어간
## 경기가 남을 수 있는데, 그걸 세면 "다음 등판까지 −3일"이 나온다
func test_a_past_unplayed_game_is_not_next() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "season_days": 350,
		"schedule": [_game(5, true), _game(20, true)]}))
	assert_int(vm["next_game_in"]).is_equal(10)


## ⚠ **목록 순서가 날짜 순이 아닐 수 있다.** 대회 라운드가 뒤에 주입되므로
## 첫 항목을 쓰면 한참 뒤 경기를 "다음"이라고 적는다
func test_it_picks_the_nearest_start_not_the_first_listed() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "season_days": 350,
		"schedule": [_game(30, true), _game(14, true), _game(22, true)]}))
	assert_int(vm["next_game_in"]).is_equal(4)


func test_no_game_left_says_so() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 340, "season_days": 350}))
	assert_str(vm["next_game_label"]).is_equal("남은 등판 없음")
	assert_int(vm["next_game_in"]).is_equal(-1)


## 이미 치른 경기는 다음 등판이 아니다
func test_a_played_game_is_not_next() -> void:
	var g: Dictionary = _game(12, true)
	g["result"] = {"home_score": 3, "away_score": 1}
	var vm: Dictionary = MainVm.build(_state({"day": 10, "season_days": 350,
		"schedule": [g, _game(20, true)]}))
	assert_int(vm["next_game_in"]).is_equal(10)


# ── 진행 버튼 ─────────────────────────────────────────────────

## ⚠ **"다음 이벤트 전날까지"가 사용자가 정한 진행 방식이다.** 버튼이
## 며칠을 진행하는지 화면에 적혀야 사용자가 예상할 수 있다
func test_the_advance_button_says_how_far_it_goes() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(15, true)]}))
	assert_int(vm["advance_days"]).is_equal(5)
	assert_str(vm["advance_label"]).is_equal("5일 진행")


func test_advancing_one_day_reads_naturally() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(11, true)]}))
	assert_str(vm["advance_label"]).is_equal("하루 진행")


## ⚠ **멈출 일이 오늘이면 진행할 게 없다.** 0일 진행 버튼을 누르게 두면
## 아무 일도 안 일어나는데 눌린 것처럼 보인다
func test_a_stop_today_disables_the_button() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(10, true)]}))
	assert_int(vm["advance_days"]).is_equal(0)
	assert_bool(vm["can_advance"]).is_false()


func test_a_normal_day_enables_the_button() -> void:
	assert_bool(MainVm.build(_state({"day": 10, "schedule": [_game(15, true)]}))["can_advance"]) \
		.is_true()


## ⚠ **경기 말고 다른 이유로 멈춘 날도 진행할 수 없다.** 다음 경기가 멀면
## "5일 진행" 버튼이 살아 있는데 눌러도 미결정 메시지에 막혀 아무 일도
## 안 일어난다 — 눌린 것처럼 보이고 게임이 멈춘 것처럼 보인다
func test_a_stop_that_is_not_a_game_also_disables_the_button() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(15, true)],
		"mailbox": [{"id": "M1", "read": true, "decision": {"selected": null}}]}))
	assert_int(vm["advance_days"]).is_equal(0)
	assert_bool(vm["can_advance"]).is_false()
	assert_str(vm["stop_type"]).is_equal("message")


# ── 멈춤 이유 ─────────────────────────────────────────────────

func test_it_surfaces_why_we_stopped() -> void:
	var vm: Dictionary = MainVm.build(_state({"day": 10, "schedule": [_game(10, true)]}))
	assert_str(vm["stop_type"]).is_equal("game")


func test_a_quiet_day_has_no_stop() -> void:
	assert_str(MainVm.build(_state({"day": 10}))["stop_type"]).is_empty()


## ⚠ **진행 판단을 화면이 다시 하지 않는다.** 화면이 자기 기준으로 "멈춰야
## 하나"를 또 계산하면 진행기와 갈린다 — 02 결함의 뿌리가 그것이다
func test_the_stop_matches_the_day_engine() -> void:
	for d in [1, 10, 10, 349, 350]:
		var s: Dictionary = _state({"day": d, "season_days": 350,
			"schedule": [_game(10, true)]})
		var engine = DayEngine.stop_reason(s)
		var want: String = "" if engine == null else engine["type"]
		assert_str(MainVm.build(s)["stop_type"]).is_equal(want)


# ── 알림 ──────────────────────────────────────────────────────

func test_it_counts_unread_mail() -> void:
	var vm: Dictionary = MainVm.build(_state({"mailbox": [
		{"id": "M1", "read": false}, {"id": "M2", "read": true}, {"id": "M3", "read": false}]}))
	assert_int(vm["unread_count"]).is_equal(2)


## ⚠ **답을 안 한 결정은 안 읽은 것과 따로 센다.** 같이 세면 결정이 남았는데
## 소식만 읽고 넘어가서 진행이 막힌 이유를 화면에서 못 본다
func test_undecided_mail_is_counted_apart() -> void:
	var vm: Dictionary = MainVm.build(_state({"mailbox": [
		{"id": "M1", "read": true, "decision": {"selected": null}},
		{"id": "M2", "read": false}]}))
	assert_int(vm["unread_count"]).is_equal(1)
	assert_int(vm["undecided_count"]).is_equal(1)


func test_a_decided_message_is_not_pending() -> void:
	var vm: Dictionary = MainVm.build(_state({"mailbox": [
		{"id": "M1", "read": true, "decision": {"selected": "yes"}}]}))
	assert_int(vm["undecided_count"]).is_equal(0)


# ── 터지지 않기 ───────────────────────────────────────────────

## 화면은 게임 상태를 몰라도 떠야 한다
## ⚠ **빈 상태는 0일차가 아니라 1일차로 본다.** 시즌 일차는 1부터라
## 0을 넣으면 달력이 2월 마지막 날로 뒷걸음친다 — 새 게임 첫 화면이
## "2월 28일 1주차"로 뜬다
func test_an_empty_state_does_not_crash() -> void:
	var vm: Dictionary = MainVm.build({})
	assert_bool(vm.has("next_game_label")).is_true()
	assert_bool(vm.has("advance_days")).is_true()
	assert_int(vm["day"]).is_equal(1)
	assert_str(vm["date_label"]).contains("3월 1일")


func test_a_day_below_one_is_pulled_up() -> void:
	assert_int(MainVm.build(_state({"day": 0}))["day"]).is_equal(1)
	assert_int(MainVm.build(_state({"day": -5}))["day"]).is_equal(1)


func test_the_view_model_has_every_key_the_screen_reads() -> void:
	var vm: Dictionary = MainVm.build(_state())
	for k in ["date_label", "weekday_label", "week_label", "team_name", "player_name",
			"next_game_label", "next_game_in", "advance_label", "advance_days",
			"can_advance", "stop_type", "unread_count", "undecided_count", "tabs"]:
		assert_bool(vm.has(k)).override_failure_message("빠진 키: %s" % k).is_true()


## ⚠ **탭은 여섯이고 순서가 02와 같다.** 순서를 바꾸면 손가락이 기억한
## 자리가 달라진다
func test_the_tabs_match_the_original() -> void:
	var ids: Array = []
	for t in MainVm.build(_state())["tabs"]:
		ids.append(t["id"])
	assert_array(ids).is_equal(["news", "me", "team", "league", "people", "schedule"])


## ⚠ **소식 탭에만 단다.** 전부에 달면 알림이 아무 뜻이 없어진다 —
## 어디를 눌러야 하는지가 알림의 존재 이유다
# ── 내 상태 (U-3) ─────────────────────────────────────────────
#
# ⚠ **OVR을 어디에서도 안 보여줬다.** `ui/` 전체에서 `ovr`을 쓰는 곳이 지명
# 후보 줄과 로스터 줄 둘뿐이라 **내 능력치를 보려면 팀 탭 로스터에서 내 줄을
# 찾아야 했다.** 피로는 훈련 화면에만 있었다.
#
# ⚠ 02가 이 자리를 왜 만들었는지 적어 뒀다 — "항상 보여야 하는 건 지금 내가
# 던질 수 있는 상태인가 · 다음 경기가 언제인가 · 우리 팀이 몇 위인가 셋이고,
# 그 셋이 전부 다른 화면에 흩어져 있었다"(`RightPanel.svelte:12-16`).


## ⚠ **복무 중엔 헤더도 옛 소속을 안 띄운다** (U-2b). **"나" 탭과 같은 말을
## 해야 한다** — 두 자리가 다르면 어느 쪽이 맞는지 알 수 없다
func test_the_header_hides_the_old_team_while_serving() -> void:
	var p: Dictionary = {"name": "김한결", "position": "SP",
		"pitching": {"ovr": 60.0}, "team_name": "제주 애월고",
		"military_status": "현역", "military_unit": "sports"}
	var vm: Dictionary = MainVm.build(_state({"protagonist": p}))
	assert_str(vm["team_name"]).is_equal(StatusVm.team_name_of(p))
	assert_str(vm["team_name"]).is_not_equal("제주 애월고")


## ⚠ **투수는 투구 OVR이다.** 안 가르면 투수가 타격 20으로 떠서 갑자기
## 약해 보인다 — `team_vm.gd:30-31`이 같은 이유로 가른다
func test_a_pitcher_shows_the_pitching_ovr() -> void:
	var vm: Dictionary = MainVm.build(_state({"protagonist": {
		"name": "김한결", "position": "SP",
		"pitching": {"ovr": 71.0}, "batting": {"ovr": 22.0}}}))
	assert_int(vm["ovr"]).is_equal(71)


func test_condition_and_fatigue_come_along() -> void:
	var vm: Dictionary = MainVm.build(_state({"protagonist": {
		"name": "김한결", "position": "SP", "pitching": {"ovr": 60.0},
		"condition": 72.4, "fatigue": 83.6}}))
	assert_int(vm["condition"]).is_equal(72)
	assert_int(vm["fatigue"]).is_equal(84)


## ⚠ **피로 구간 이름표를 여기서 다시 적지 않는다.** `TrainingVm`이 정본이다 —
## 두 곳이 각자 정하면 훈련 화면과 껍데기가 다른 말을 한다
func test_the_fatigue_zone_comes_from_the_training_rule() -> void:
	var vm: Dictionary = MainVm.build(_state({"protagonist": {
		"name": "김한결", "position": "SP", "pitching": {"ovr": 60.0},
		"fatigue": 92.0}}))
	assert_str(vm["fatigue_zone"]).is_equal(
		String(TrainingVm.zone_of(92.0)["label"]))


## ⚠ **"나"와 "세계"를 가르는 선** (U-6). 02가 같은 자리에 뒀다 —
## 앞 둘은 나에 관한 것이고 뒤 넷은 세계에 관한 것이다.
##
## ⚠ **어디서 가를지는 사전이 정한다.** 화면이 다시 판정하면 탭 순서를
## 바꿨을 때 선만 옛 자리에 남는다
func test_one_tab_carries_the_group_break() -> void:
	var broke: Array = []
	for t in MainVm.build(_state())["tabs"]:
		if bool(t.get("break_after", false)):
			broke.append(t["id"])
	assert_array(broke).is_equal([MainVm.NAV_BREAK_AFTER])


func test_only_the_news_tab_carries_the_unread_badge() -> void:
	var vm: Dictionary = MainVm.build(_state({"mailbox": [
		{"id": "M1", "read": false}, {"id": "M2", "read": false}]}))
	var seen: bool = false
	for t in vm["tabs"]:
		if t["id"] == "news":
			assert_int(t["badge"]).is_equal(2)
			seen = true
		else:
			assert_int(t["badge"]).override_failure_message(
				"%s 탭에 알림이 달렸다" % t["id"]).is_equal(0)
	assert_bool(seen).is_true()
