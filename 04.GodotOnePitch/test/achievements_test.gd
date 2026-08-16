extends GdUnitTestSuite

## 업적 — C-5.
##
## 원본: `utils/achievementEngine.ts` + `master/achievements/achievements.json`
##
## ⚠ **04엔 아무것도 없었다** — 엔진도 규칙 파일도 상태도 없었다.


func _state(over: Dictionary = {}, p_over: Dictionary = {}) -> Dictionary:
	var p: Dictionary = {"id": "ME", "team_id": "T1", "career_history": []}
	p.merge(p_over, true)
	var s: Dictionary = {"season_year": 2030, "protagonist": p}
	s.merge(over, true)
	return s


func _pitching(over: Dictionary) -> Dictionary:
	var st: Dictionary = {"type": "pitcher", "g": 0, "w": 0, "sv": 0, "k": 0.0}
	st.merge(over, true)
	return st


func _year(year: int, over: Dictionary) -> Dictionary:
	return {"year": year, "stat_line": "-", "stats": _pitching(over)}


## `team`이 n승 한 일정. **`loser_id`가 없으면 무승부로 센다**
func _wins(team: String, n: int) -> Array:
	var out: Array = []
	for i in n:
		out.append({"league_id": "L", "home": team, "away": "OPP",
			"result": {"home_score": 4, "away_score": 2,
				"winner_id": team, "loser_id": "OPP"}})
	return out


# ── 규칙 파일 ─────────────────────────────────────────────────

## ⚠ **수치를 코드에 다시 적지 않는다** — 02 Phase 7에서 그 결함만 15건 나왔다
func test_the_rules_are_loaded() -> void:
	assert_bool(Achievements.rules().is_empty()).override_failure_message(
		"업적 규칙이 비었다").is_false()
	assert_int(Achievements.defs().size()).is_greater(30)


## 02의 목록을 그대로 옮겼다 — id와 목표치를 안 바꿨다
func test_the_02_list_came_over_intact() -> void:
	var by_id: Dictionary = {}
	for d in Achievements.defs():
		by_id[String(d["id"])] = d
	assert_int(int(by_id["ACH_BASEBALL_500_STRIKEOUTS"]["target"])).is_equal(500)
	assert_str(String(by_id["ACH_BASEBALL_500_STRIKEOUTS"]["title"])
		).is_equal("탈삼진 기계")
	assert_int(int(by_id["ACH_GROWTH_WEEK_156"]["target"])).is_equal(156)


## id가 겹치면 화면이 한 줄을 잃는다
func test_no_two_achievements_share_an_id() -> void:
	var seen: Dictionary = {}
	for d in Achievements.defs():
		var id: String = String(d["id"])
		assert_bool(seen.has(id)).override_failure_message(
			"업적 id가 겹친다: %s" % id).is_false()
		seen[id] = true


## **`blocked`은 아직 만들 데가 없는 업적이다** — 목록엔 두되 판정에서 뺀다
func test_blocked_achievements_are_not_judged() -> void:
	assert_int(Achievements.active_defs().size()).is_less(
		Achievements.defs().size())
	for d in Achievements.active_defs():
		assert_str(String(d["status"])).is_equal("active")


## 모든 업적이 잴 수 있는 값을 가리켜야 한다 — 오타 하나면 영영 안 열린다
func test_every_active_metric_is_measurable() -> void:
	var known: Dictionary = Achievements.metrics(_state())
	for d in Achievements.active_defs():
		assert_bool(known.has(String(d["metric"]))).override_failure_message(
			"%s가 잴 수 없는 값(%s)을 본다" % [d["id"], d["metric"]]).is_true()


# ── 통산 ──────────────────────────────────────────────────────

## ⚠ **통산을 따로 세지 않는다.** 02는 계수기 주머니를 따로 들고 있었는데
## `season_stats`와 정본이 둘이 된다 — 연도 기록의 숫자를 합친다
func test_career_totals_add_up_the_years() -> void:
	var s: Dictionary = _state({}, {"career_history": [
		_year(2028, {"w": 3, "k": 40.0, "g": 12, "sv": 1}),
		_year(2029, {"w": 5, "k": 60.0, "g": 15, "sv": 2}),
	]})
	var t: Dictionary = Achievements.career_totals(s)
	assert_int(int(t["w"])).is_equal(8)
	assert_int(int(t["k"])).is_equal(100)
	assert_int(int(t["g"])).is_equal(27)
	assert_int(int(t["sv"])).is_equal(3)


## 아직 안 끝난 올해도 통산에 들어간다 — 첫 시즌에 업적이 하나도 안 열리면 안 된다
func test_the_live_season_counts_too() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": _pitching({"k": 12.0})}})
	assert_int(int(Achievements.career_totals(s)["k"])).is_equal(12)


## ⚠ **시즌이 끝나면 같은 해가 연도 기록에도 들어간다.** 해로 안 묶으면
## 그 시즌이 두 번 세어져 통산이 부풀어 오른다
func test_a_finished_season_is_not_counted_twice() -> void:
	var s: Dictionary = _state(
		{"season_stats": {"ME": _pitching({"k": 40.0, "w": 3})}},
		{"career_history": [_year(2030, {"k": 40.0, "w": 3})]})
	var t: Dictionary = Achievements.career_totals(s)
	assert_int(int(t["k"])).override_failure_message(
		"올해가 두 번 세어졌다 (%d)" % t["k"]).is_equal(40)
	assert_int(int(t["w"])).is_equal(3)


## 숫자가 없는 옛 줄은 건너뛴다 — 진급이 만든 빈 줄이 그렇다
func test_a_year_without_numbers_is_skipped() -> void:
	var s: Dictionary = _state({}, {"career_history": [
		{"year": 2028, "stat_line": "-"},
		_year(2029, {"k": 30.0}),
	]})
	assert_int(int(Achievements.career_totals(s)["k"])).is_equal(30)


## ⚠ **02는 "20승 달성"을 팀 순위표의 승수로 셌다.** 제목은 개인처럼
## 읽히지만 그게 02다 — 밸런스 동결이라 그대로 옮기고 검사로 못 박는다
func test_team_wins_come_from_the_standings() -> void:
	# ⚠ **순위표는 상태에 없다** — 일정에서 파생한다.
	# ⚠ **내 팀을 목록 맨 앞에 두지 않는다** — 첫 줄을 집어도 통과해 버린다
	var sch: Array = []
	# ⚠ **`loser_id`가 없으면 무승부로 센다** — 승자만 적으면 승수가 안 는다
	for i in 3:
		sch.append({"league_id": "L", "home": "T2", "away": "T3",
			"result": {"home_score": 5, "away_score": 1,
				"winner_id": "T2", "loser_id": "T3"}})
	for i in 2:
		sch.append({"league_id": "L", "home": "T1", "away": "T3",
			"result": {"home_score": 4, "away_score": 2,
				"winner_id": "T1", "loser_id": "T3"}})
	var s: Dictionary = _state({"schedule": sch},
		{"team_id": "T1", "league_id": "L"})
	assert_int(Achievements.team_wins(s)).override_failure_message(
		"순위표에서 내 팀이 아니라 첫 줄을 읽는다").is_equal(2)


func test_team_wins_are_zero_before_any_game() -> void:
	assert_int(Achievements.team_wins(_state())).is_equal(0)


## ⚠ **소식함은 `mailbox`다.** `news`를 읽었다가 늘 0이었고 메시지 업적
## 셋이 통째로 안 열렸다 — 이름이 비슷한 키는 조용히 틀린다
func test_read_messages_are_counted() -> void:
	var s: Dictionary = _state({"mailbox": [
		{"id": "a", "read": true}, {"id": "b", "read": false},
		{"id": "c", "read": true}]})
	assert_int(Achievements.messages_read(s)).override_failure_message(
		"소식함을 못 읽는다 — 화면이 쓰는 키는 mailbox다").is_equal(2)


## 진짜 소식함으로 확인한다 — 화면이 읽는 그 사전이어야 한다
func test_it_reads_the_same_mailbox_the_screen_does() -> void:
	var s: Dictionary = _state({"mailbox": [
		{"id": "a", "category": "news", "subject": "제목", "read": true}]})
	assert_int(NewsVm.build(s)["rows"].size()).override_failure_message(
		"화면이 읽는 소식함과 업적이 읽는 소식함이 다르다").is_equal(1)
	assert_int(Achievements.messages_read(s)).is_equal(1)


## ⚠ **`training_log`로는 못 센다.** 그건 "뭔가 오른 주"만 남는다 —
## 능력치가 안 오른 주는 줄이 없어서 열한 주를 훈련해도 열 주가 안 된다
func test_training_weeks_are_counted_not_derived_from_the_log() -> void:
	var s: Dictionary = _state({"training_log": [{}, {}, {}]},
		{"training_weeks": 11})
	assert_int(int(Achievements.metrics(s)["training_weeks"])
		).override_failure_message("훈련한 주를 성장 기록 수로 세고 있다"
		).is_equal(11)


# ── 판정 ──────────────────────────────────────────────────────

func test_reaching_the_target_unlocks() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": _pitching({"k": 1.0})}})
	var fresh: Array = Achievements.check(s, 1 * 7)
	assert_bool(fresh.has("ACH_BASEBALL_FIRST_STRIKEOUT")).is_true()
	assert_bool(Achievements.is_unlocked(s, "ACH_BASEBALL_FIRST_STRIKEOUT")
		).is_true()


func test_falling_short_does_not_unlock() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": _pitching({"k": 9.0})}})
	Achievements.check(s, 1 * 7)
	assert_bool(Achievements.is_unlocked(s, "ACH_BASEBALL_10_STRIKEOUTS")
		).is_false()
	assert_int(int(Achievements.of(s)["ACH_BASEBALL_10_STRIKEOUTS"]["progress"])
		).override_failure_message("아직 못 열었는데 진행도도 안 남는다").is_equal(9)


## **새로 연 것만 돌려준다** — 두 번째 부르면 아무것도 안 나온다
func test_only_new_unlocks_are_returned() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": _pitching({"k": 1.0})}})
	assert_array(Achievements.check(s, 1 * 7)).is_not_empty()
	assert_array(Achievements.check(s, 2 * 7)).override_failure_message(
		"같은 업적을 두 번 새로 열었다고 한다").is_empty()


## ⚠ **한 번 달성하면 안 풀린다.** 팀 승수는 시즌마다 0으로 돌아가는데,
## 풀리면 "첫 승리"가 해마다 다시 열린다
func test_an_unlock_survives_the_metric_dropping() -> void:
	var s: Dictionary = _state({"schedule": _wins("T1", 5)},
		{"team_id": "T1", "league_id": "L"})
	Achievements.check(s, 30 * 7)
	assert_bool(Achievements.is_unlocked(s, "ACH_BASEBALL_5_WINS")).is_true()

	# 해가 바뀌면 일정이 새로 짜인다 — 팀 승수는 0으로 돌아간다
	s["schedule"] = []
	Achievements.check(s, 1 * 7)
	assert_bool(Achievements.is_unlocked(s, "ACH_BASEBALL_5_WINS")
		).override_failure_message("시즌이 바뀌자 이미 딴 업적이 풀렸다").is_true()


## 달성한 때를 남긴다 — 언제였는지가 업적의 절반이다
func test_it_records_when() -> void:
	var s: Dictionary = _state({"season_stats": {"ME": _pitching({"k": 1.0})}})
	Achievements.check(s, 12 * 7)
	assert_str(String(Achievements.of(s)["ACH_BASEBALL_FIRST_STRIKEOUT"]
		["unlocked_at"])).is_equal("2030년 12주")


func test_nothing_unlocks_on_an_empty_career() -> void:
	var s: Dictionary = _state()
	assert_array(Achievements.check(s, 1 * 7)).is_empty()


# ── 진짜 세계 ─────────────────────────────────────────────────

## ⚠ **주 경계마다 돈다.** 02도 그랬다 — 화면을 열어야만 달성되면
## 자동 진행에서는 은퇴할 때까지 하나도 안 열린다
func test_advancing_weeks_unlocks_achievements() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["training_plan"] = {"primary": "TRN_VEL"}
	var r: AppRoot = auto_free(preload("res://ui/app_root.tscn").instantiate())
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	for w in range(1, 12):
		WeekRunner.run(r.state(), w * 7)

	assert_bool(Achievements.is_unlocked(r.state(), "ACH_GROWTH_WEEK_10")
		).override_failure_message(
		"열한 주를 훈련했는데 '훈련 10주'가 안 열렸다 — 배선이 끊겼다").is_true()


## ⚠ **경기를 치러야 야구 업적이 열린다.** `WeekRunner.run`만 돌리면
## 경기가 안 치러져서 야구 쪽은 전부 0으로 남는다 — 스크린샷이 그랬다.
## 여기서는 진짜로 경기를 치러 지표가 실제로 움직이는지 본다
func test_playing_games_unlocks_the_baseball_achievements() -> void:
	var s: Dictionary = World.new_game({"seed": 4242, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	var first: int = 999
	for g in s["schedule"]:
		first = mini(first, int(g["day"]))
	s["day"] = first

	var r: AppRoot = auto_free(preload("res://ui/app_root.tscn").instantiate())
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	# ⚠ **한 번에 멀리 못 간다** — 등판일마다 멈춘다
	for i in 4:
		await r.advance(30)

	var m: Dictionary = Achievements.metrics(r.state())
	assert_int(int(m["career_games"])).override_failure_message(
		"경기를 치렀는데 통산 출전이 0이다 — 업적이 볼 값이 없다").is_greater(0)
	assert_bool(Achievements.is_unlocked(r.state(), "ACH_BASEBALL_FIRST_GAME")
		).override_failure_message("첫 출전이 안 열렸다").is_true()

	# ⚠ **"고교는 리그 승이 0"이라고 단정했다가 틀렸다.** 그 실행에서
	# 우연히 0이었을 뿐이고, 고교에도 주말리그가 있어 승수가 잡힌다.
	# 여기서 볼 것은 값이 아니라 **읽는 자리**다 — 순위표를 일정에서
	# 파생하는지(상태에서 읽으면 늘 0이다)
	var want: int = 0
	for row in Standings.from_schedule(r.state().get("schedule", []),
			String(r.state()["protagonist"].get("league_id", ""))):
		if String(row.get("team_id", "")) == String(
				r.state()["protagonist"].get("team_id", "")):
			want = int(row.get("wins", 0))
	assert_int(int(m["team_wins"])).override_failure_message(
		"순위표를 일정에서 파생하지 않는다").is_equal(want)


## ⚠ **아무 훈련도 안 짠 주는 "훈련한 주"가 아니다.** 세면 가만히 진행만
## 해도 훈련 업적이 열린다
func test_a_week_without_a_plan_is_not_a_training_week() -> void:
	var s: Dictionary = World.new_game({"seed": 777, "season_year": 2027,
		"name": "김한결", "team_id": "TEAM_HS_AEWOL"})
	s["training_plan"] = {}
	var r: AppRoot = auto_free(preload("res://ui/app_root.tscn").instantiate())
	add_child(r)
	r.set_state(s)
	await await_idle_frame()
	for w in range(1, 12):
		WeekRunner.run(r.state(), w * 7)

	assert_int(int(r.state()["protagonist"].get("training_weeks", 0))
		).override_failure_message("훈련을 안 짰는데 훈련한 주로 셌다").is_equal(0)
	assert_bool(Achievements.is_unlocked(r.state(), "ACH_GROWTH_WEEK_10")
		).is_false()


## ⚠ **연도 기록이 숫자를 들고 있어야 통산을 셀 수 있다.** 문자열 요약만
## 두면 해가 바뀌는 순간 통산이 0으로 돌아간다
func test_a_finished_season_leaves_numbers_behind() -> void:
	var players: Array = [{"id": "ME", "career_history": []}]
	SeasonHistory.apply(players, {"ME": _pitching({"w": 4, "k": 55.0, "g": 14})},
		2029)
	var row: Dictionary = players[0]["career_history"][0]
	assert_bool(row.has("stats")).override_failure_message(
		"연도 기록에 숫자가 없다 — 통산을 셀 길이 없다").is_true()
	assert_int(int(row["stats"]["w"])).is_equal(4)
	assert_str(String(row["stat_line"])).is_not_empty()
