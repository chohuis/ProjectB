extends GdUnitTestSuite

## D3 진행기 — 하루 진행 · 정지 조건 · 주 경계.
##
## 원본: `usecases/advanceWeek.ts` (2599줄)의 진행 골격
##
## ⚠ **여기가 이주에서 제일 조용히 틀리는 자리다.** 02에서 나온 결함 둘이
## 전부 "오류도 로그도 안 나고 값만 틀린" 형태였다:
##
## · 주 경계 오프셋 — 경기 결과를 `weekNum`으로 찾았는데 그 주 경기는 아직
##   안 치렀다(`weekNum - 1`이 맞다). 감독·동료 관계가 **전 커리어에 걸쳐
##   한 번도 안 움직였고** 리그 경기 결과 소식은 한 통도 온 적이 없었다
## · 주 경계 건너뛰기 — 여러 날을 한 번에 진행할 때 주기 처리를 한 번
##   더 돌리면 성장이 2배, 건너뛰면 0이다


func _p(over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {
		"condition": 80.0, "injury": null, "eligibility_blocked": false,
		"retired": false, "career_stage": "pro",
	}
	p.merge(over, true)
	return p


func _game(day: int, mine: bool = false) -> Dictionary:
	return {"id": "G%d" % day, "day": day, "is_protagonist_game": mine,
		"home": "T1", "away": "T2", "result": null}


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 0, "season_days": 350, "protagonist": _p(),
		"schedule": [], "pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


# ── 출전 판정 ─────────────────────────────────────────────────

func test_healthy_protagonist_stops_for_the_game() -> void:
	# 정상 등판 — 사용자가 경기 화면을 본다
	assert_str(DayEngine.appearance_gate(_p())).is_equal("play")


func test_injury_skips_the_game_without_asking() -> void:
	# 부상은 선택지가 아니다 — 물어볼 게 없다
	assert_str(DayEngine.appearance_gate(_p({"injury": {"kind": "elbow"}}))).is_equal("skip_injury")


## ⚠ **학사 경고가 부상보다 먼저다.** 순서가 뒤집히면 학사 경고를 안 지워서
## 다음 경기에도 남는다 — 02는 판정 자리에서 `clearEligibilityBlock()`을 부른다
func test_academic_block_outranks_injury() -> void:
	var p: Dictionary = _p({"eligibility_blocked": true, "injury": {"kind": "elbow"}})
	assert_str(DayEngine.appearance_gate(p)).is_equal("skip_academic")


func test_very_low_condition_avoids_without_asking() -> void:
	# 35 미만은 자동 회피 — 물어봐도 답이 하나다
	assert_str(DayEngine.appearance_gate(_p({"condition": 34.0}))).is_equal("skip_condition")
	assert_str(DayEngine.appearance_gate(_p({"condition": 35.0}))).is_not_equal("skip_condition")


## ⚠ **35~55 사이에만 물어본다.** 두 문턱이 붙으면 물어보는 구간이 없어지고,
## 벌어지면 답이 뻔한 경기까지 창을 띄운다
func test_middling_condition_asks_the_user() -> void:
	assert_str(DayEngine.appearance_gate(_p({"condition": 35.0}))).is_equal("ask")
	assert_str(DayEngine.appearance_gate(_p({"condition": 54.0}))).is_equal("ask")
	assert_str(DayEngine.appearance_gate(_p({"condition": 55.0}))).is_equal("play")


func test_the_three_thresholds_do_not_overlap() -> void:
	# 0~100 전 구간에서 판정이 하나씩만 나온다
	var seen: Dictionary = {}
	for i in range(0, 101):
		var g: String = DayEngine.appearance_gate(_p({"condition": float(i)}))
		seen[g] = int(seen.get(g, 0)) + 1
	assert_int(seen.size()).is_equal(3)          # skip_condition · ask · play
	assert_int(seen["skip_condition"]).is_equal(35)   # 0~34
	assert_int(seen["ask"]).is_equal(20)              # 35~54
	assert_int(seen["play"]).is_equal(46)             # 55~100


# ── 정지 조건 ─────────────────────────────────────────────────

func test_a_quiet_day_does_not_stop() -> void:
	assert_object(DayEngine.stop_reason(_state({"day": 10}))).is_null()


func test_the_protagonist_game_stops_the_day() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(10, true)]})
	var r = DayEngine.stop_reason(s)
	assert_object(r).is_not_null()
	assert_str(r["type"]).is_equal("game")
	assert_str(r["schedule_id"]).is_equal("G10")


## ⚠ **다른 날 경기는 오늘을 안 멈춘다.** 날짜 비교를 빠뜨리면 시즌 첫날에
## 멈춰서 영영 안 나아간다
func test_another_days_game_does_not_stop_today() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(11, true), _game(9, true)]})
	assert_object(DayEngine.stop_reason(s)).is_null()


## ⚠ **이미 치른 경기는 다시 안 멈춘다.** 안 그러면 경기 화면을 닫아도
## 같은 날에 도로 멈춰서 무한 루프다 — 02의 "고아 경기" 처리가 이걸 막는다
func test_a_played_game_does_not_stop_again() -> void:
	var g: Dictionary = _game(10, true)
	g["result"] = {"home_score": 3, "away_score": 1}
	assert_object(DayEngine.stop_reason(_state({"day": 10, "schedule": [g]}))).is_null()


func test_an_npc_game_does_not_stop() -> void:
	assert_object(DayEngine.stop_reason(_state({"day": 10, "schedule": [_game(10, false)]}))).is_null()


## ⚠ **미결정 메시지가 경기보다 먼저다.** 답을 안 한 결정이 남았는데 경기로
## 넘어가면 그 결정은 영영 못 한다
func test_an_undecided_message_outranks_the_game() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(10, true)],
		"mailbox": [{"id": "M1", "decision": {"selected": null}}]})
	var r = DayEngine.stop_reason(s)
	assert_str(r["type"]).is_equal("message")
	assert_str(r["message_id"]).is_equal("M1")


func test_a_decided_message_does_not_stop() -> void:
	var s: Dictionary = _state({"day": 10,
		"mailbox": [{"id": "M1", "decision": {"selected": "yes"}},
			{"id": "M2", "decision": null}]})
	assert_object(DayEngine.stop_reason(s)).is_null()


## 이미 쌓인 pending이 제일 먼저다 — 안 그러면 새 정지를 그 위에 얹는다
func test_a_pending_action_outranks_everything() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(10, true)],
		"pending": [{"type": "event", "event_id": "E1"}],
		"mailbox": [{"id": "M1", "decision": {"selected": null}}]})
	assert_str(DayEngine.stop_reason(s)["type"]).is_equal("event")


## 은퇴하면 커리어가 끝난다 — 멈추지 않으면 은퇴한 선수가 계속 등판한다
func test_retirement_stops_everything() -> void:
	var s: Dictionary = _state({"day": 10, "protagonist": _p({"retired": true})})
	assert_str(DayEngine.stop_reason(s)["type"]).is_equal("retired")


func test_the_season_end_stops() -> void:
	var s: Dictionary = _state({"day": 350, "season_days": 350})
	assert_str(DayEngine.stop_reason(s)["type"]).is_equal("season_end")
	assert_object(DayEngine.stop_reason(_state({"day": 349, "season_days": 350}))).is_null()


# ── 다음 정지까지 ─────────────────────────────────────────────

## ⚠ **"다음 이벤트 전날까지"가 사용자가 정한 진행 방식이다.** 프로는 경기가
## 거의 매일 있는데 주 단위로 진행하면 한 번에 여러 경기가 한꺼번에 끝나서
## 자기 등판을 골라 볼 수 없다
func test_it_runs_up_to_the_day_before_the_next_stop() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(15, true)]})
	assert_int(DayEngine.next_stop_day(s)).is_equal(15)


func test_it_finds_the_nearest_stop_not_the_first_listed() -> void:
	var s: Dictionary = _state({"day": 10,
		"schedule": [_game(30, true), _game(14, true), _game(22, true)]})
	assert_int(DayEngine.next_stop_day(s)).is_equal(14)


func test_no_stop_ahead_lands_on_the_season_end() -> void:
	var s: Dictionary = _state({"day": 340, "season_days": 350})
	assert_int(DayEngine.next_stop_day(s)).is_equal(350)


func test_today_itself_can_be_the_stop() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(10, true)]})
	assert_int(DayEngine.next_stop_day(s)).is_equal(10)


## ⚠ **NPC 경기는 정지가 아니다.** 세면 프로 시즌은 거의 매일 NPC 경기가
## 있어서 **하루도 못 건너뛴다** — "다음 경기 전날까지"가 통째로 죽는다
func test_npc_games_are_not_stops() -> void:
	var s: Dictionary = _state({"day": 10, "season_days": 350,
		"schedule": [_game(11, false), _game(12, false), _game(20, true)]})
	assert_int(DayEngine.next_stop_day(s)).is_equal(20)


## 이미 치른 주인공 경기도 정지가 아니다
func test_a_played_game_is_not_the_next_stop() -> void:
	var g: Dictionary = _game(12, true)
	g["result"] = {"home_score": 3, "away_score": 1}
	var s: Dictionary = _state({"day": 10, "season_days": 350,
		"schedule": [g, _game(20, true)]})
	assert_int(DayEngine.next_stop_day(s)).is_equal(20)


# ── 주 경계 ───────────────────────────────────────────────────

## ⚠ **이게 M6에서 제일 위험한 검사다.** 하루씩 30번 간 것과 30일을 한 번에
## 간 것이 다르면 주기 처리(성장·훈련·회복)가 어긋난 것이다 — 한 번 더 돌면
## 성장이 2배, 건너뛰면 0인데 **오류도 로그도 안 난다**
func test_stepping_one_day_at_a_time_equals_one_big_step() -> void:
	var one_at_a_time: int = 0
	for d in range(1, 31):
		one_at_a_time += DayEngine.week_boundaries_crossed(d, d + 1)
	assert_int(one_at_a_time).is_equal(DayEngine.week_boundaries_crossed(1, 31))


## ⚠ **주 경계에서 쪼갤 때가 위험하다.** 구간을 닫힌 채로 두면 7·14·21일에서
## 딱 한 번씩 더 세고, 하루씩 간 합이 한 번에 간 것보다 커진다
func test_it_matches_across_every_split_point() -> void:
	# 90일을 어디서 쪼개도 합이 같다
	for cut in range(1, 92):
		var split: int = DayEngine.week_boundaries_crossed(1, cut) \
			+ DayEngine.week_boundaries_crossed(cut, 91)
		assert_int(split).is_equal(DayEngine.week_boundaries_crossed(1, 91))


func test_standing_still_crosses_nothing() -> void:
	assert_int(DayEngine.week_boundaries_crossed(14, 14)).is_equal(0)


## 시즌 첫 주는 1~7일차다. 그 주기 처리는 **8일차로 넘어갈 때** 돈다 —
## 7일차를 아직 안 살았는데 미리 돌면 하루 앞서간다
func test_the_first_week_ends_on_day_seven() -> void:
	assert_int(DayEngine.week_boundaries_crossed(1, 7)).is_equal(0)
	assert_int(DayEngine.week_boundaries_crossed(1, 8)).is_equal(1)
	assert_int(DayEngine.week_boundaries_crossed(1, 15)).is_equal(2)


## ⚠ **`Calendar`가 주말이라 부르는 날과 정확히 같아야 한다.** 주 경계를
## 두 군데서 각자 세면 한쪽만 고쳤을 때 조용히 갈라진다.
##
## `Calendar.week_ends_between`을 그대로 부르지 않는다 — 그쪽은 양 끝을
## 다 포함하는 닫힌 구간이고 진행기는 `to_day`를 아직 안 산 날로 본다.
## 그래서 **날을 하나씩 세서** 대조한다
func test_it_agrees_with_the_calendar() -> void:
	for a in range(1, 60):
		for b in range(a, a + 30):
			var counted: int = 0
			for d in range(a, b):
				if Calendar.is_week_end(d):
					counted += 1
			assert_int(DayEngine.week_boundaries_crossed(a, b)).is_equal(counted)


# ── 하루 진행 ─────────────────────────────────────────────────

func test_advancing_a_day_moves_the_day_forward() -> void:
	var s: Dictionary = _state({"day": 10})
	var out: Dictionary = DayEngine.advance_day(s)
	assert_int(out["day"]).is_equal(11)


## ⚠ **정지한 날엔 안 넘어간다.** 넘어가면 그 경기를 못 치른 채 지나간다
func test_it_does_not_advance_past_an_unresolved_stop() -> void:
	var s: Dictionary = _state({"day": 10, "schedule": [_game(10, true)]})
	var out: Dictionary = DayEngine.advance_day(s)
	assert_int(out["day"]).is_equal(10)
	assert_str(out["stopped_by"]["type"]).is_equal("game")


## 그날 NPC 경기는 치르고 넘어간다 — 안 그러면 순위표가 안 움직인다
func test_it_reports_the_games_to_play_today() -> void:
	var s: Dictionary = _state({"day": 10,
		"schedule": [_game(10, false), _game(10, false), _game(11, false)]})
	var out: Dictionary = DayEngine.advance_day(s)
	assert_int(out["games_today"].size()).is_equal(2)


## ⚠ **이미 치른 경기를 다시 돌리지 않는다.** 돌리면 순위표에 승패가 두 번
## 들어가고, 기록이 부푼다 — 오류도 로그도 안 난다
func test_it_does_not_replay_a_finished_game() -> void:
	var done: Dictionary = _game(10, false)
	done["id"] = "DONE"
	done["result"] = {"home_score": 3, "away_score": 1}
	var s: Dictionary = _state({"day": 10, "schedule": [done, _game(10, false)]})
	var out: Dictionary = DayEngine.advance_day(s)
	assert_int(out["games_today"].size()).is_equal(1)
	assert_str(out["games_today"][0]["id"]).is_equal("G10")


## ⚠ **정지한 날엔 주기 처리를 안 돌린다.** 그날을 아직 안 살았는데 성장이
## 붙으면 하루 앞서간다 — 경기 화면을 닫고 다시 진행하면 **같은 주가 두 번
## 처리된다**
func test_a_stopped_day_crosses_no_week_boundary() -> void:
	# 7일차가 주 경계인데 그날 주인공 경기가 있다
	var s: Dictionary = _state({"day": 7, "schedule": [_game(7, true)]})
	var out: Dictionary = DayEngine.advance_day(s)
	assert_int(out["day"]).is_equal(7)
	assert_int(out["weeks_crossed"]).is_equal(0)
	# 경기를 치르고 나면 그때 넘어가면서 센다
	out["schedule"][0]["result"] = {"home_score": 1, "away_score": 0}
	assert_int(DayEngine.advance_day(out)["weeks_crossed"]).is_equal(1)


func test_it_reports_the_week_boundary_it_crossed() -> void:
	# 7일차를 살고 8일차로 넘어갈 때가 첫 주 경계다
	assert_int(DayEngine.advance_day(_state({"day": 7}))["weeks_crossed"]).is_equal(1)
	assert_int(DayEngine.advance_day(_state({"day": 8}))["weeks_crossed"]).is_equal(0)


## ⚠ **여러 날을 건너뛰어도 주 경계 수가 맞아야 한다.** 하루씩 간 합과 같다
func test_advancing_many_days_reports_every_boundary() -> void:
	var s: Dictionary = _state({"day": 1, "season_days": 350})
	var out: Dictionary = DayEngine.advance_to(s, 30)
	assert_int(out["day"]).is_equal(31)
	assert_int(out["weeks_crossed"]).is_equal(4)   # 7·14·21·28일차


func test_advancing_many_days_still_stops_at_the_game() -> void:
	var s: Dictionary = _state({"day": 1, "schedule": [_game(12, true)]})
	var out: Dictionary = DayEngine.advance_to(s, 30)
	assert_int(out["day"]).is_equal(12)
	assert_str(out["stopped_by"]["type"]).is_equal("game")
	# 멈춘 날까지의 주 경계만 센다 — 안 그러면 안 산 날의 성장이 붙는다
	assert_int(out["weeks_crossed"]).is_equal(1)   # 7일차 하나


## ⚠ **여러 날치 경기가 다 모여야 한다.** 마지막 날 것만 남기면 건너뛴
## 날들의 순위표가 통째로 안 움직인다 — 프로는 거의 매일 경기다
func test_advancing_many_days_collects_every_days_games() -> void:
	var s: Dictionary = _state({"day": 1, "season_days": 350,
		"schedule": [_game(2, false), _game(3, false), _game(3, false), _game(5, false)]})
	var out: Dictionary = DayEngine.advance_to(s, 10)
	assert_int(out["games_today"].size()).is_equal(4)


## ⚠ **뒤로 안 간다.** 음수를 그대로 더하면 목표가 지금보다 앞이라 루프가
## 아예 안 돌고, 그런데 `day`는 그대로라 "진행했는데 아무 일도 안 났다"로만
## 보인다
func test_advancing_a_negative_span_stands_still() -> void:
	var s: Dictionary = _state({"day": 20, "season_days": 350})
	var out: Dictionary = DayEngine.advance_to(s, -5)
	assert_int(out["day"]).is_equal(20)
	assert_int(out["weeks_crossed"]).is_equal(0)


func test_advancing_never_runs_past_the_season() -> void:
	var s: Dictionary = _state({"day": 340, "season_days": 350})
	var out: Dictionary = DayEngine.advance_to(s, 400)
	assert_int(out["day"]).is_equal(350)
	assert_str(out["stopped_by"]["type"]).is_equal("season_end")


## ⚠ **`advance_to`가 하루씩 부른 것과 같아야 한다.** 다르면 둘 중 하나가
## 조용히 틀린 것이고, 어느 쪽인지 알 방법이 없다
func test_advance_to_equals_repeated_advance_day() -> void:
	var a: Dictionary = _state({"day": 3, "schedule": [_game(20, false), _game(25, true)]})
	var b: Dictionary = _state({"day": 3, "schedule": [_game(20, false), _game(25, true)]})

	var big: Dictionary = DayEngine.advance_to(a, 40)

	var weeks: int = 0
	var guard: int = 0
	while b["day"] < big["day"] and guard < 100:
		var step: Dictionary = DayEngine.advance_day(b)
		if step["day"] == b["day"]:
			break
		b = step
		weeks += int(step["weeks_crossed"])
		guard += 1

	assert_int(b["day"]).is_equal(big["day"])
	assert_int(weeks).is_equal(big["weeks_crossed"])
