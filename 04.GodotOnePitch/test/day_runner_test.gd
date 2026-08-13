extends GdUnitTestSuite

## 진행 실행기 — M7-3. 프레임 쪼개기.
##
## ⚠ **M2가 남긴 숙제다.** 최악의 날이 83경기 0.69초인데, 그걸 한 프레임에
## 다 돌리면 화면이 **멈춘 것처럼 보인다.** 경기 사이에 프레임을 넘기면
## 진행 표시가 된다.
##
## 소비자가 생긴 뒤에 만든다 — M2에서 미룬 이유가 그것이었고, 이제
## 진행 버튼이 생겼다.


func _game(day: int, mine: bool = false, id: String = "") -> Dictionary:
	return {"id": id if id != "" else "G%d_%d" % [day, randi() % 1000],
		"day": day, "is_protagonist_game": mine,
		"home": "TEAM_A", "away": "TEAM_B", "result": null}


func _state(over: Dictionary = {}) -> Dictionary:
	var s: Dictionary = {
		"day": 1, "season_days": 350, "season_year": 2027,
		"protagonist": {"condition": 80.0, "injury": null, "eligibility_blocked": false,
			"retired": false},
		"schedule": [], "pending": [], "mailbox": [],
	}
	s.merge(over, true)
	return s


func _runner() -> DayRunner:
	var r := DayRunner.new()
	add_child(r)
	return r


## 경기를 세는 가짜 시뮬. 진짜 `GameLoop`은 여기서 안 부른다 —
## 실행기가 보는 건 "경기 하나를 돌린다"는 계약뿐이다
class Counter:
	var played: Array = []
	func sim(g: Dictionary) -> void:
		played.append(g["id"])


# ── 다 돌리는가 ───────────────────────────────────────────────

func test_it_plays_every_game_on_the_way() -> void:
	var c := Counter.new()
	var s := _state({"day": 1, "schedule": [
		_game(2, false, "A"), _game(3, false, "B"), _game(3, false, "C"),
		_game(5, false, "D"), _game(40, false, "FAR")]})
	var r := _runner()
	var out: Dictionary = await r.run(s, 10, c.sim)
	assert_array(c.played).is_equal(["A", "B", "C", "D"])
	assert_int(out["day"]).is_equal(11)


## ⚠ **한 번씩만 돌린다.** 두 번 돌면 순위표에 승패가 두 번 들어간다
func test_it_plays_each_game_exactly_once() -> void:
	var c := Counter.new()
	var s := _state({"day": 1, "schedule": [
		_game(2, false, "A"), _game(2, false, "B")]})
	await _runner().run(s, 10, c.sim)
	assert_int(c.played.size()).is_equal(2)


func test_a_quiet_span_plays_nothing() -> void:
	var c := Counter.new()
	var out: Dictionary = await _runner().run(_state({"day": 1}), 10, c.sim)
	assert_array(c.played).is_empty()
	assert_int(out["day"]).is_equal(11)


# ── 멈추는가 ──────────────────────────────────────────────────

## ⚠ **정지 조건을 지나치지 않는다.** 지나치면 그 경기를 못 치른 채 넘어간다
func test_it_stops_at_the_protagonist_game() -> void:
	var c := Counter.new()
	var s := _state({"day": 1, "schedule": [
		_game(2, false, "A"), _game(4, true, "MINE"), _game(6, false, "AFTER")]})
	var out: Dictionary = await _runner().run(s, 20, c.sim)
	assert_int(out["day"]).is_equal(4)
	assert_str(out["stopped_by"]["type"]).is_equal("game")
	# 내 경기와 그 뒤 경기는 안 돌렸다
	assert_array(c.played).is_equal(["A"])


func test_the_result_matches_the_day_engine() -> void:
	var s := _state({"day": 1, "schedule": [_game(12, true, "MINE")]})
	var want: Dictionary = DayEngine.advance_to(s.duplicate(true), 30)
	var got: Dictionary = await _runner().run(s.duplicate(true), 30, func(_g): pass)
	assert_int(got["day"]).is_equal(want["day"])
	assert_int(got["weeks_crossed"]).is_equal(want["weeks_crossed"])


# ── 프레임을 넘기는가 ─────────────────────────────────────────

## ⚠ **여기가 이 모듈의 존재 이유다.** 안 넘기면 최악의 날 0.69초 동안
## 화면이 얼어붙는다
func test_a_heavy_span_yields_at_least_once() -> void:
	var games: Array = []
	for i in 200:
		games.append(_game(2 + i / 4, false, "G%d" % i))
	var r := _runner()
	# 시뮬 하나가 시간을 쓰는 척한다 — 예산이 차야 프레임을 넘긴다
	var slow := func(_g: Dictionary) -> void:
		var t := Time.get_ticks_usec()
		while Time.get_ticks_usec() - t < 300:
			pass
	await r.run(_state({"day": 1, "schedule": games}), 60, slow)
	assert_int(r.frames_yielded).is_greater(0)


## 가벼우면 굳이 안 넘긴다 — 넘길 때마다 한 프레임(약 16ms)이 든다
func test_a_light_span_does_not_yield() -> void:
	var r := _runner()
	await r.run(_state({"day": 1, "schedule": [_game(2, false, "A")]}), 5, func(_g): pass)
	assert_int(r.frames_yielded).is_equal(0)


## ⚠ **넘긴 뒤 예산을 되감아야 한다.** 안 되감으면 한 번 넘긴 뒤로는
## **경기마다** 넘겨서, 83경기가 든 날이 83프레임(약 1.4초)이 된다 —
## 얼어붙는 대신 기어간다
func test_yielding_resets_the_budget() -> void:
	var games: Array = []
	for i in 200:
		games.append(_game(2 + i / 4, false, "G%d" % i))
	var r := _runner()
	# 경기 하나가 예산(8ms)의 20분의 1쯤 쓴다 — 스무 경기에 한 번쯤 넘겨야 한다
	var slow := func(_g: Dictionary) -> void:
		var t := Time.get_ticks_usec()
		while Time.get_ticks_usec() - t < 400:
			pass
	await r.run(_state({"day": 1, "schedule": games}), 60, slow)
	assert_int(r.frames_yielded).is_greater(0)
	assert_int(r.frames_yielded).override_failure_message(
		"경기마다 넘기고 있다 — 예산을 안 되감았다").is_less(50)


# ── 진행 표시 ─────────────────────────────────────────────────

## ⚠ **진행률은 되돌아가지 않는다.** 줄었다 늘었다 하면 막대가 튄다
## ⚠ **무거운 표본으로 봐야 한다.** 가벼우면 중간 알림이 아예 안 나서
## 중간 값이 틀려도 이 검사가 통과한다
func test_progress_only_moves_forward() -> void:
	var r := _runner()
	var seen: Array = []
	r.progress.connect(func(done: int, total: int) -> void: seen.append([done, total]))
	var games: Array = []
	for i in 200:
		games.append(_game(2 + i / 4, false, "G%d" % i))
	var slow := func(_g: Dictionary) -> void:
		var t := Time.get_ticks_usec()
		while Time.get_ticks_usec() - t < 400:
			pass
	await r.run(_state({"day": 1, "schedule": games}), 60, slow)

	# 중간 알림이 실제로 나왔는가 — 처음과 끝 둘뿐이면 아무것도 안 본 것이다
	assert_int(seen.size()).override_failure_message("중간 진행 알림이 없다").is_greater(2)
	var last: int = -1
	for p in seen:
		assert_bool(p[0] >= last).override_failure_message(
			"진행률이 되돌아갔다: %s" % [seen]).is_true()
		assert_bool(p[0] <= p[1]).override_failure_message(
			"진행률이 총량을 넘었다: %s" % [seen]).is_true()
		last = p[0]


## ⚠ 람다 안에서 잡은 변수에 **다시 대입하면 밖으로 안 나온다** —
## 배열에 담아야 한다. 여기서 한 번 헛짚었다
func test_it_ends_at_full_progress() -> void:
	var r := _runner()
	var seen: Array = []
	r.progress.connect(func(done: int, total: int) -> void: seen.append([done, total]))
	await r.run(_state({"day": 1, "schedule": [_game(3, false, "A")]}), 5, func(_g): pass)
	var last: Array = seen[seen.size() - 1]
	assert_int(last[0]).is_equal(5)
	assert_int(last[1]).is_equal(5)


# ── 겹쳐 부르지 않기 ──────────────────────────────────────────

## ⚠ **두 번 겹쳐 돌면 같은 경기를 두 번 돌린다.** 진행 버튼을 빠르게 두 번
## 누르는 건 흔한 일이다
## ⚠ **코루틴은 `await` 없이 못 부른다.** 그래서 겹친 호출을 변수에 담아
## 결과를 볼 수가 없다 — `call_deferred`로 다음 프레임에 겹쳐 부르고,
## 거절 횟수로 확인한다
func test_it_refuses_to_run_twice_at_once() -> void:
	var r := _runner()
	var c := Counter.new()
	var games: Array = []
	for i in 60:
		games.append(_game(2 + i, false, "G%d" % i))
	var s := _state({"day": 1, "schedule": games})

	# 프레임을 넘기게 만들어야 겹쳐 부를 틈이 생긴다
	var slow := func(g: Dictionary) -> void:
		c.sim(g)
		var t := Time.get_ticks_usec()
		while Time.get_ticks_usec() - t < 400:
			pass

	r.run.call_deferred(s, 10, func(_x): pass)
	await r.run(s, 70, slow)

	assert_int(r.rejected_runs).is_greater(0)
	# 겹친 호출이 경기를 하나도 더 안 돌렸다
	assert_int(c.played.size()).is_equal(60)


func test_it_can_run_again_after_finishing() -> void:
	var r := _runner()
	await r.run(_state({"day": 1}), 5, func(_g): pass)
	assert_bool(r.is_running()).is_false()
	var out: Dictionary = await r.run(_state({"day": 6}), 5, func(_g): pass)
	assert_int(out["day"]).is_equal(11)


# ── 터지지 않기 ───────────────────────────────────────────────

## ⚠ **부른 쪽 상태를 제자리에서 안 고친다.** 고치면 호출부가 모르게
## 바뀌어서, 진행을 취소하거나 되돌릴 방법이 없어진다
func test_it_does_not_mutate_the_callers_state() -> void:
	var s := _state({"day": 1, "schedule": [_game(2, false, "A"), _game(3, false, "B")]})
	await _runner().run(s, 10, func(_g): pass)
	assert_int(s["day"]).is_equal(1)
	assert_bool(s.has("stopped_by")).is_false()
	assert_bool(s.has("weeks_crossed")).is_false()


## ⚠ **하루도 안 가는 경우가 제일 위험하다.** 루프가 한 번도 안 돌면
## 마무리 줄들이 **부른 쪽 사전에 그대로 쓴다** — 하루라도 가면
## `advance_day`가 복사본을 만들어 주므로 티가 안 난다
func test_a_zero_day_run_does_not_mutate_the_callers_state() -> void:
	var s := _state({"day": 5, "schedule": [_game(5, false, "A")]})
	await _runner().run(s, 0, func(_g): pass)
	assert_bool(s.has("stopped_by")).is_false()
	assert_bool(s.has("weeks_crossed")).is_false()
	assert_bool(s.has("games_today")).is_false()


func test_zero_days_does_nothing() -> void:
	var c := Counter.new()
	var out: Dictionary = await _runner().run(
		_state({"day": 5, "schedule": [_game(5, false, "A")]}), 0, c.sim)
	assert_int(out["day"]).is_equal(5)
	assert_array(c.played).is_empty()
